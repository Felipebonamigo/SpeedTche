// Garagem e Concessionária no jogo de verdade (onda N, N2): abre e fecha as duas telas 36 vezes, com compra de peça, troca de carro e de
// pintura no meio, e confere que NADA cresce: nós e ouvintes do DOM (CDP), geometrias/texturas/programas do renderizador e os painéis do
// palco no registro. Também fotografa a garagem e a Concessionária em 1, 2 e 4 pilotos (scratch/).
// Exige `npx vite build && npx vite preview --port P` no ar (o palco é desenhado pelo laço de quadros, a ~1 quadro/s no swiftshader).
// Uso: node scripts/playtest-garagem.mjs [url] [prefixo-das-capturas] [ciclos=36]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const url = process.argv[2] ?? 'http://localhost:4174/?nosurvey=1&dynres=0';
const out = process.argv[3] ?? 'scratch/garagem';
const CYCLES = Number(process.argv[4] ?? 36);
const exe = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
fs.mkdirSync(path.dirname(out), { recursive: true });

const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.setDefaultTimeout(240000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver/.test(m.text())) errors.push(`console: ${m.text()}`); });
const cdp = await page.context().newCDPSession(page);
const fails = [];
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails.push(msg); };

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const counters = async () => {
  await page.evaluate(() => { if (window.gc) window.gc(); });
  const dom = await cdp.send('Memory.getDOMCounters');
  const gl = await page.evaluate(() => {
    const r = window.nc.session.renderer;
    const g = r.__gl;
    return { geometries: g.info.memory.geometries, textures: g.info.memory.textures, programs: g.info.programs?.length ?? 0 };
  });
  return { nodes: dom.nodes, listeners: dom.jsEventListeners, ...gl };
};

const start = (n, quality) => page.evaluate(({ n, quality }) => {
  const s = window.nc.session;
  s.settings.quality = quality;
  for (let i = 0; i < 4; i++) s.input.unbindSeat(i);
  ['kb1', 'kb2', 'gp0', 'gp1'].slice(0, n).forEach((d, i) => s.input.bindSeat(i, d));
  const hs = Array.from({ length: n }, (_, i) => ({ seat: i, name: `Piloto ${i + 1}`, carId: ['falcao', 'trovao', 'tornado', 'camelo'][i], teamId: 0, color: '#fff' }));
  s.handleMenuEvent({ type: 'startCareer', humans: hs, resume: false });
}, { n, quality });
const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await page.waitForTimeout(60); } };
const panels = () => page.evaluate(() => document.querySelectorAll('#ui .gp').length);
const frames = (ms) => page.waitForTimeout(ms);

// ── Fotos: 1, 2 e 4 pilotos, na Garagem e na Concessionária ──
for (const n of [1, 2, 4]) {
  await start(n, 'medium');
  await frames(3500);
  check((await panels()) === n, `Garagem com ${n} piloto(s): ${n} painel(is)`);
  check(await page.evaluate(() => document.querySelectorAll('#ui .gp-stage').length) === n, `Garagem com ${n}: uma janela de palco por painel`);
  await page.screenshot({ path: `${out}-garagem-${n}.png` });
  await page.evaluate(() => window.nc.session.menus.show('dealership'));
  await frames(3500);
  check((await panels()) === n, `Concessionária com ${n} piloto(s): ${n} painel(is)`);
  await page.screenshot({ path: `${out}-concessionaria-${n}.png` });
}

// ── 36 ciclos: abre, mexe, fecha ──
await start(2, 'low');
await frames(1500);
const base = [];
for (let i = 0; i < CYCLES; i++) {
  await page.evaluate(() => window.nc.session.menus.show('garage'));
  await frames(400);
  await key('ArrowRight'); await key('ArrowDown', 2); await key('Enter'); await key('ArrowUp', 2); // troca de carro e tenta comprar a 1ª peça
  await page.evaluate(() => window.nc.session.menus.show('dealership'));
  await frames(400);
  await key('ArrowRight'); await key('Enter');
  await page.evaluate(() => window.nc.session.menus.show('main'));
  await frames(300);
  if (i % 12 === 11 || i === 5) base.push({ i, ...(await counters()) });
}
console.log('contadores:', JSON.stringify(base));
const [warm, ...rest] = base;
check(rest.length >= 2, `contadores medidos em ${base.length} pontos`);
const last = rest[rest.length - 1];
const prev = rest[rest.length - 2];
for (const k of ['nodes', 'listeners', 'geometries', 'textures', 'programs']) {
  // O 1º ponto (ciclo 6) é aquecimento; os dois últimos (24 e 36) não podem crescer um sobre o outro além de um degrau isolado.
  check(last[k] - prev[k] <= (k === 'nodes' ? 40 : 3), `${k}: ${warm[k]} → ${prev[k]} → ${last[k]} (sem crescimento)`);
}
check(await page.evaluate(() => document.querySelectorAll('#ui .gp').length) === 0, 'nenhum painel de garagem no DOM no menu principal');
check(errors.length === 0, `sem erros no console (${errors.slice(0, 3).join(' | ')})`);
await browser.close();
console.log(fails.length ? `\n${fails.length} falha(s)` : '\ntudo verde');
process.exit(fails.length ? 1 : 0);
