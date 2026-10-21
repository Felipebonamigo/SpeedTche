// Folhas dos carros herói dos outros estilos (V15): para cada estilo, Horizon Chase 2 (referência) × atual × herói nas vistas que o dono vê — câmera de corrida de dia, 3/4 de trás, 3/4 da
// frente e a garagem — e uma folha-resumo com todos os heróis lado a lado. As referências do HC2 são SÓ referência visual (nunca textura nem modelo). Sobe um vite próprio e o encerra pelo PID.
//   node tools/herois-folha.mjs [pasta-de-saida] [estilo ...]      (padrão: scratch/herois e os seis estilos; `gt` entra no resumo se estiver na lista)
//   SO=tras34,garagem refaz só essas fotos;  RESUMO=1 só recompõe as folhas com as fotos que já existem.
// Quadros: harness `tools/render-harness.html` (hero=0 sem o casco herói, hero=1 com; `car=<id>` escolhe o carro) e, na garagem, a carreira de verdade com `heroCars` nas opções salvas.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

const saida = resolve(process.argv[2] ?? 'scratch/herois');
const pedidos = process.argv.slice(3);
const so = process.env.SO ? process.env.SO.split(',') : null;
const soResumo = process.env.RESUMO === '1';
mkdirSync(saida, { recursive: true });

// estilo → carro, nome na folha e os recortes do HC2 (x, y, largura, altura em % da imagem) do carro mais parecido com cada vista
const ESTILOS = {
  gt: { car: 'falcao', nome: 'Falcão GT (gt)', ref: { corrida: ['hc2-8.webp', 28, 55, 36, 38], tras34: ['hc2-8.webp', 33, 58, 30, 36], frente34: ['hc2-9.webp', 53, 56, 24, 28], garagem: ['hc2-6.webp', 28, 55, 40, 36] } },
  hyper: { car: 'pororoca', nome: 'Pororoca V10 (hyper)', ref: { corrida: ['hc2-9.webp', 28, 58, 30, 34], tras34: ['hc2-9.webp', 29, 60, 27, 32], frente34: ['hc2-9.webp', 53, 56, 24, 28], garagem: ['hc2-9.webp', 28, 58, 30, 34] } },
  wedge: { car: 'iara', nome: 'Iara Turbo (wedge)', ref: { corrida: ['hc2-7.webp', 19, 55, 22, 18], tras34: ['hc2-7.webp', 19, 55, 22, 18], frente34: ['hc2-9.webp', 53, 56, 24, 28], garagem: ['hc2-7.webp', 19, 55, 22, 18] } },
  prototype: { car: 'beijaflor', nome: 'Beija-Flor (prototype)', ref: { corrida: ['hc2-8.webp', 28, 55, 36, 38], tras34: ['hc2-8.webp', 33, 58, 30, 36], frente34: ['hc2-9.webp', 53, 56, 24, 28], garagem: ['hc2-8.webp', 28, 55, 36, 38] } },
  muscle: { car: 'trovao', nome: 'Trovão V12 (muscle)', ref: { corrida: ['hc2-7.webp', 19, 55, 22, 18], tras34: ['hc2-7.webp', 19, 55, 22, 18], frente34: ['hc2-9.webp', 53, 56, 24, 28], garagem: ['hc2-6.webp', 53, 60, 26, 24] } },
  rally: { car: 'carcara', nome: 'Carcará RS (rally)', ref: { corrida: ['hc2-6.webp', 28, 55, 22, 24], tras34: ['hc2-6.webp', 28, 55, 22, 24], frente34: ['hc2-9.webp', 53, 56, 24, 28], garagem: ['hc2-6.webp', 28, 55, 22, 24] } },
  // V17: os nacionais livres (herói do CARRO, sem recorte do HC2: a folha é atual × herói, em duas colunas)
  cuiabano: { car: 'cuiabano', nome: 'Cuiabano (hatch livre)', ref: null },
  tupiniquim: { car: 'tupiniquim', nome: 'Tupiniquim (hatch livre)', ref: null },
  roadster: { car: 'curupira', nome: 'Curupira S (roadster)', ref: { corrida: ['hc2-6.webp', 53, 60, 26, 24], tras34: ['hc2-6.webp', 53, 60, 26, 24], frente34: ['hc2-9.webp', 53, 56, 24, 28], garagem: ['hc2-6.webp', 53, 60, 26, 24] } },
};
const estilos = (pedidos.length ? pedidos : ['hyper', 'wedge', 'prototype', 'roadster', 'muscle', 'rally']).filter((e) => ESTILOS[e]);
const VISTAS = [
  ['corrida', 'câmera de corrida · dia', 'track=copacabana&seg=300&hud=0', null],
  ['tras34', '3/4 de trás', 'track=copacabana&seg=300&hud=0&carview=rear34', [380, 280, 520, 230]],
  ['frente34', '3/4 da frente', 'track=copacabana&seg=300&hud=0&carview=front34', [380, 280, 520, 230]],
];

const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
let vite = null; let browser = null; let base = '';
const stop = () => { try { vite?.kill('SIGTERM'); } catch { /* já saiu */ } };
if (!soResumo) {
  const port = await freePort();
  vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  process.on('exit', stop);
  base = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) { try { if ((await fetch(base)).ok) break; } catch { /* ainda subindo */ } await new Promise((r) => setTimeout(r, 1000)); }
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}

/** Tira a foto? Com SO, só as que têm algum dos nomes; sem, as que ainda não existem (o ambiente reinicia: retomar sem refazer) — REFAZ=1 refaz tudo. */
const quer = (nome) => (so ? so.some((s) => nome.includes(s)) : process.env.REFAZ === '1' || !existsSync(`${saida}/${nome}.png`));
const shot = async (nome, qs, clip) => {
  if (!quer(nome)) return;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: clip ? 2 : 1 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(300000);
  await p.goto(`${base}/tools/render-harness.html?${qs}`);
  await p.waitForFunction(() => window.ready === true, null, { timeout: 300000, polling: 1000 }).catch(() => {});
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${saida}/${nome}.png`, timeout: 300000, clip: clip ? { x: clip[0], y: clip[1], width: clip[2], height: clip[3] } : undefined });
  console.log('ok', `${saida}/${nome}.png`);
  await ctx.close();
};
const garagem = async (nome, car, heroCars) => {
  if (!quer(nome)) return;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript((hero) => {
    localStorage.setItem('speed-tche.settings', JSON.stringify({ quality: 'high', heroCars: hero }));
    const g = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, a) { return g.call(this, t, t === 'webgl2' || t === 'webgl' ? { ...(a ?? {}), preserveDrawingBuffer: true } : a); };
    window.requestAnimationFrame = () => 0;
  }, heroCars);
  const p = await ctx.newPage();
  p.setDefaultTimeout(300000);
  await p.goto(`${base}/?nosurvey=1`);
  await p.waitForFunction(() => !!window.nc?.session, null, { timeout: 300000, polling: 500 });
  await p.evaluate((carId) => {
    const s = window.nc.session; s.stop();
    for (let i = 0; i < 4; i++) s.input.unbindSeat(i);
    s.input.bindSeat(0, 'kb1');
    s.handleMenuEvent({ type: 'startCareer', humans: [{ seat: 0, name: 'Piloto 1', carId, teamId: 0, color: '#ffd23f' }], resume: false });
  }, car);
  for (let i = 1; i <= 12; i++) await p.evaluate((t) => window.nc.session.frame(t), i * 200);
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${saida}/${nome}.png`, timeout: 300000 });
  console.log('ok', `${saida}/${nome}.png`);
  await ctx.close();
};
if (!soResumo) {
  for (const e of estilos) {
    const { car } = ESTILOS[e];
    for (const [id, , qs, clip] of VISTAS) { await shot(`${e}-${id}-atual`, `${qs}&car=${car}&hero=0`, clip); await shot(`${e}-${id}-heroi`, `${qs}&car=${car}&hero=1`, clip); }
    await garagem(`${e}-garagem-atual`, car, 'off'); await garagem(`${e}-garagem-heroi`, car, 'on');
  }
  await browser.close();
  stop();
}

// ── as folhas: HC2 (recortes das capturas do dono) × atual × herói, uma por estilo; e o resumo ──
const data = (p) => `data:${p.endsWith('.webp') ? 'image/webp' : 'image/png'};base64,${readFileSync(p).toString('base64')}`;
const REF = resolve('scratch/ref');
const b2 = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const W = 792; const H = 446;
const refCell = (nome, [arq, x, y, w, h]) =>
  `<div><div style="padding:6px 4px">Horizon Chase 2 · ${nome}</div><div style="width:${W}px;height:${H}px;overflow:hidden;position:relative;background:#222"><img src="${data(resolve(REF, arq))}" data-x="${x}" data-y="${y}" data-w="${w}" data-h="${h}" style="position:absolute;max-width:none;visibility:hidden"></div></div>`;
const ownCell = (titulo, src) => `<div><div style="padding:6px 4px">${titulo}</div><img src="${data(src)}" style="width:${W}px;height:${H}px;object-fit:cover;display:block"></div>`;
const posRef = async (pg) => pg.evaluate(async ({ W, H }) => {
  for (const img of document.querySelectorAll('img[data-w]')) {
    await img.decode();
    const nw = img.naturalWidth; const nh = img.naturalHeight;
    const [x, y, w, h] = ['x', 'y', 'w', 'h'].map((k) => Number(img.dataset[k]) / 100);
    const s = Math.max(W / (w * nw), H / (h * nh));
    img.style.width = `${nw * s}px`; img.style.height = `${nh * s}px`;
    img.style.left = `-${x * nw * s}px`; img.style.top = `-${y * nh * s}px`; img.style.visibility = 'visible';
  }
}, { W, H });
const linhas = [['corrida', 'câmera de corrida · dia'], ['tras34', '3/4 de trás'], ['frente34', '3/4 da frente'], ['garagem', 'garagem']];
for (const e of estilos) {
  const { nome, ref } = ESTILOS[e];
  if (!linhas.every(([id]) => existsSync(`${saida}/${e}-${id}-atual.png`) && existsSync(`${saida}/${e}-${id}-heroi.png`))) { console.log('faltam fotos de', e); continue; }
  const cols = ref ? 3 : 2; // sem recorte do HC2 (os nacionais): atual × herói
  const pg = await b2.newPage({ viewport: { width: W * cols + 32, height: 1000 } });
  await pg.setContent(`<body style="margin:0;background:#101018;font:600 20px sans-serif;color:#fff"><div style="font-size:28px;padding:10px 8px">${nome}: ${ref ? 'HC2 × ' : ''}atual × herói</div><div style="display:grid;grid-template-columns:${`${W}px `.repeat(cols)};gap:8px;padding:8px;width:${W * cols + 32}px">${linhas.map(([id, l]) => (ref ? refCell(l, ref[id]) : '') + ownCell(`${nome} atual · ${l}`, `${saida}/${e}-${id}-atual.png`) + ownCell(`${nome} herói · ${l}`, `${saida}/${e}-${id}-heroi.png`)).join('')}</div></body>`);
  if (ref) await posRef(pg);
  await pg.waitForTimeout(600);
  await pg.screenshot({ path: `${saida}/folha-${e}.png`, fullPage: true });
  await pg.screenshot({ path: `${saida}/folha-${e}.jpg`, fullPage: true, type: 'jpeg', quality: 86 }); // a cópia leve, a que vai para docs/
  console.log(`folha: ${saida}/folha-${e}.png`);
  await pg.close();
}
// o resumo: todos os heróis lado a lado (3/4 de trás e 3/4 da frente), com o atual de cada um menor ao lado
const todos = ['gt', ...estilos.filter((e) => e !== 'gt')].filter((e) => existsSync(`${saida}/${e}-tras34-heroi.png`) || (e === 'gt' && existsSync('scratch/hero/fotos/tras34-heroi.png')));
const src = (e, id, kind) => (e === 'gt' && !existsSync(`${saida}/gt-${id}-${kind}.png`) ? `scratch/hero/fotos/${id}-${kind}.png` : `${saida}/${e}-${id}-${kind}.png`);
if (todos.length) {
  const pg = await b2.newPage({ viewport: { width: 2000, height: 800 } });
  const w = 640; const h = 280;
  const cell = (e, id, kind) => (existsSync(src(e, id, kind)) ? `<img src="${data(src(e, id, kind))}" style="width:${w}px;height:${h}px;object-fit:cover;display:block">` : `<div style="width:${w}px;height:${h}px;background:#222"></div>`);
  await pg.setContent(`<body style="margin:0;background:#101018;font:600 20px sans-serif;color:#fff"><div style="font-size:28px;padding:10px 8px">Carros herói (V15), no jogo: 3/4 de trás · 3/4 da frente · de trás, atual (menor)</div><div style="display:grid;grid-template-columns:200px ${w}px ${w}px ${w}px;gap:8px;padding:8px;width:${200 + 3 * w + 40}px">${todos.map((e) => `<div style="padding-top:10px">${(ESTILOS[e] ?? { nome: e }).nome}</div>${cell(e, 'tras34', 'heroi')}${cell(e, 'frente34', 'heroi')}${cell(e, 'tras34', 'atual')}`).join('')}</div></body>`);
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: `${saida}/folha-resumo.png`, fullPage: true });
  await pg.screenshot({ path: `${saida}/folha-resumo.jpg`, fullPage: true, type: 'jpeg', quality: 88 });
  console.log(`resumo: ${saida}/folha-resumo.png`);
}
await b2.close();
