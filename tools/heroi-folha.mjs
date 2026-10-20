// Folha do carro herói (V9): Horizon Chase 2 (referência) × Falcão GT atual × Falcão GT herói, nas vistas que o dono vê: câmera de corrida de dia, 3/4 de trás,
// 3/4 da frente, noite com freio e a garagem. As referências são SÓ referência visual (nunca textura nem modelo). Sobe um vite próprio e o encerra pelo PID.
//   node tools/heroi-folha.mjs [saida.png] [pasta-das-fotos]          (padrão: scratch/hero/folha-hc2-gt-heroi.png e scratch/hero/fotos)
// Quadros: harness `tools/render-harness.html` (hero=0 sem o casco herói, hero=1 com) e, na garagem, a carreira de verdade com `heroCars` nas opções salvas.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';

const saida = resolve(process.argv[2] ?? 'scratch/hero/folha-hc2-gt-heroi.png');
const fotos = resolve(process.argv[3] ?? 'scratch/hero/fotos');
const so = process.env.SO ? process.env.SO.split(',') : null; // SO=corrida,tras34 refaz só essas fotos
mkdirSync(fotos, { recursive: true }); mkdirSync(dirname(saida), { recursive: true });
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const port = await freePort();
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
const stop = () => { try { vite.kill('SIGTERM'); } catch { /* já saiu */ } };
process.on('exit', stop);
const base = `http://localhost:${port}`;
for (let i = 0; i < 120; i++) { try { if ((await fetch(base)).ok) break; } catch { /* ainda subindo */ } await new Promise((r) => setTimeout(r, 1000)); }
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const VISTAS = [
  ['corrida', 'câmera de corrida · dia', 'track=copacabana&seg=300&hud=0&car=falcao'],
  ['tras34', '3/4 de trás', 'track=copacabana&seg=300&hud=0&car=falcao&carview=rear34'],
  ['frente34', '3/4 da frente', 'track=copacabana&seg=300&hud=0&car=falcao&carview=front34'],
  ['noite', 'noite · freio', 'track=copacabana&seg=300&hud=0&car=falcao&tod=night&brake=1&carview=rear34'],
];
const shot = async (nome, qs, scale = 1) => {
  if (so && !so.includes(nome.split('-')[0]) && !so.includes(nome)) return;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: scale });
  const p = await ctx.newPage();
  p.setDefaultTimeout(300000);
  await p.goto(`${base}/tools/render-harness.html?${qs}`);
  await p.waitForFunction(() => window.ready === true, null, { timeout: 300000, polling: 1000 }).catch(() => {});
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${fotos}/${nome}.png`, timeout: 300000 });
  console.log('ok', `${fotos}/${nome}.png`);
  await ctx.close();
};
const garagem = async (nome, heroCars) => {
  if (so && !so.includes('garagem') && !so.includes(nome)) return;
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
  await p.evaluate(() => {
    const s = window.nc.session; s.stop();
    for (let i = 0; i < 4; i++) s.input.unbindSeat(i);
    s.input.bindSeat(0, 'kb1');
    s.handleMenuEvent({ type: 'startCareer', humans: [{ seat: 0, name: 'Piloto 1', carId: 'falcao', teamId: 0, color: '#ffd23f' }], resume: false });
  });
  for (let i = 1; i <= 12; i++) await p.evaluate((t) => window.nc.session.frame(t), i * 200);
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${fotos}/${nome}.png`, timeout: 300000 });
  console.log('ok', `${fotos}/${nome}.png`);
  await ctx.close();
};
for (const [id, , qs] of VISTAS) { await shot(`${id}-atual`, `${qs}&hero=0`); await shot(`${id}-heroi`, `${qs}&hero=1`); }
await garagem('garagem-atual', 'off'); await garagem('garagem-heroi', 'on');
await browser.close();
stop();

// ── a folha: HC2 (recortes das capturas do dono) × atual × herói ──
const data = (p) => `data:${p.endsWith('.webp') ? 'image/webp' : 'image/png'};base64,${readFileSync(p).toString('base64')}`;
const REF = resolve('scratch/ref');
// recortes (x, y, largura, altura em % da imagem) do carro do HC2 mais parecido com cada vista
const refs = {
  corrida: ['hc2-8.webp', 28, 55, 36, 38], tras34: ['hc2-8.webp', 33, 58, 30, 36], frente34: ['hc2-9.webp', 53, 56, 24, 28], noite: ['hc2-7.webp', 36, 58, 34, 38], garagem: ['hc2-6.webp', 28, 55, 40, 36],
};
const linhas = [['corrida', 'câmera de corrida · dia'], ['tras34', '3/4 de trás'], ['frente34', '3/4 da frente'], ['noite', 'noite · freio'], ['garagem', 'garagem']];
// A folha por Playwright: cada célula é uma <div> com o recorte do HC2 posicionado em pixels (o script de dentro da página mede a imagem e escala).
const b2 = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const pg = await b2.newPage({ viewport: { width: 2416, height: 1000 } });
const W = 792; const H = 446; // célula
const refCell = (nome, arq, [x, y, w, h]) =>
  `<div><div style="padding:6px 4px">Horizon Chase 2 · ${nome}</div><div style="width:${W}px;height:${H}px;overflow:hidden;position:relative;background:#222"><img src="${data(resolve(REF, arq))}" data-x="${x}" data-y="${y}" data-w="${w}" data-h="${h}" style="position:absolute;max-width:none;visibility:hidden"></div></div>`;
const ownCell = (titulo, src) => `<div><div style="padding:6px 4px">${titulo}</div><img src="${data(src)}" style="width:${W}px;height:${H}px;object-fit:cover;display:block"></div>`;
await pg.setContent(`<body style="margin:0;background:#101018;font:600 20px sans-serif;color:#fff"><div style="display:grid;grid-template-columns:${W}px ${W}px ${W}px;gap:8px;padding:8px;width:${W * 3 + 16 + 16}px">${linhas.map(([id, nome]) => refCell(nome, refs[id][0], refs[id].slice(1)) + ownCell(`GT atual · ${nome}`, `${fotos}/${id}-atual.png`) + ownCell(`GT herói · ${nome}`, `${fotos}/${id}-heroi.png`)).join('')}</div></body>`);
await pg.evaluate(async ({ W, H }) => {
  for (const img of document.querySelectorAll('img[data-w]')) {
    await img.decode();
    const nw = img.naturalWidth; const nh = img.naturalHeight;
    const [x, y, w, h] = ['x', 'y', 'w', 'h'].map((k) => Number(img.dataset[k]) / 100);
    const sx = W / (w * nw); const sy = H / (h * nh); const s = Math.max(sx, sy);
    img.style.width = `${nw * s}px`; img.style.height = `${nh * s}px`;
    img.style.left = `-${x * nw * s}px`; img.style.top = `-${y * nh * s}px`; img.style.visibility = 'visible';
  }
}, { W, H });
await pg.waitForTimeout(800);
await pg.screenshot({ path: saida, fullPage: true });
await b2.close();
console.log(`folha: ${saida}`);
