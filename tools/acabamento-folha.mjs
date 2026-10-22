// V21: fotos do acabamento do carro (câmera de corrida, 3/4 de trás e 3/4 da frente) em vários carros, uma pasta por rodada, e a folha que as junta.
//   node tools/acabamento-folha.mjs fotos <pasta> [carro ...]        (env: HERO=1|0, SO=corrida,tras34,frente34, EXTRA='&tod=dusk', PAR=3, DSF=2)
//   node tools/acabamento-folha.mjs folha <saida.jpg> <pastaA> <pastaB> [carro ...]   (A em cima, B embaixo, uma linha por carro)
// Sobe um vite próprio e o encerra pelo PID (nunca pkill).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

const [modo, ...resto] = process.argv.slice(2);
const CARROS = ['cuiabano', 'tupiniquim', 'falcao', 'iara'];
const HERO = process.env.HERO ?? '1';
const EXTRA = process.env.EXTRA ?? '';
const so = process.env.SO ? process.env.SO.split(',') : null;
const VISTAS = [
  ['corrida', 'track=copacabana&seg=300&hud=0', [380, 330, 520, 330]],
  ['tras34', 'track=copacabana&seg=300&hud=0&carview=rear34', [380, 280, 520, 230]],
  ['frente34', 'track=copacabana&seg=300&hud=0&carview=front34', [380, 280, 520, 230]],
];
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

if (modo === 'fotos') {
  const saida = resolve(resto[0]); mkdirSync(saida, { recursive: true });
  const carros = resto.slice(1).length ? resto.slice(1) : CARROS;
  const port = await freePort();
  const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  const stop = () => { try { vite.kill('SIGTERM'); } catch { /* já saiu */ } };
  process.on('exit', stop);
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) { try { if ((await fetch(base)).ok) break; } catch { /* subindo */ } await new Promise((r) => setTimeout(r, 1000)); }
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const jobs = [];
  for (const car of carros) for (const [id, qs, clip] of VISTAS) if (!so || so.includes(id)) jobs.push([car, id, qs, clip]);
  const par = Number(process.env.PAR ?? 3);
  const work = async () => {
    for (let j = jobs.shift(); j; j = jobs.shift()) {
      const [car, id, qs, clip] = j;
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: id === 'corrida' ? 1 : Number(process.env.DSF ?? 2) });
      const p = await ctx.newPage(); p.setDefaultTimeout(400000);
      await p.goto(`${base}/tools/render-harness.html?${qs}&car=${car}&hero=${HERO}${EXTRA}`);
      await p.waitForFunction(() => window.ready === true, null, { timeout: 400000, polling: 1000 }).catch(() => {});
      await p.waitForTimeout(2500);
      await p.screenshot({ path: `${saida}/${car}-${id}.png`, timeout: 400000, clip: { x: clip[0], y: clip[1], width: clip[2], height: clip[3] } });
      console.log('ok', `${saida}/${car}-${id}.png`);
      await ctx.close();
    }
  };
  await Promise.all(Array.from({ length: par }, work));
  await browser.close(); stop();
} else if (modo === 'folha') {
  const [saida, A, B, ...cs] = resto;
  const carros = cs.length ? cs : CARROS;
  const data = (p) => `data:image/png;base64,${readFileSync(p).toString('base64')}`;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const W = 420;
  const cell = (dir, car, id) => (existsSync(`${dir}/${car}-${id}.png`) ? `<img src="${data(`${dir}/${car}-${id}.png`)}" style="width:${W}px;display:block">` : `<div style="width:${W}px;height:200px;background:#222"></div>`);
  const ids = VISTAS.map((v) => v[0]);
  let html = '<body style="margin:0;background:#111;color:#eee;font:12px sans-serif"><table cellspacing="2">';
  for (const car of carros) {
    for (const [lab, dir] of [['A', A], ['B', B]]) {
      html += `<tr><td style="width:60px">${car}<br>${lab}</td>${ids.map((id) => `<td>${cell(resolve(dir), car, id)}</td>`).join('')}</tr>`;
    }
  }
  html += '</table></body>';
  const pg = await b.newPage({ viewport: { width: 60 + 3 * (W + 8), height: 400 } });
  await pg.setContent(html);
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: resolve(saida), fullPage: true, type: saida.endsWith('.jpg') ? 'jpeg' : 'png', ...(saida.endsWith('.jpg') ? { quality: 85 } : {}) });
  await b.close();
  console.log('ok', saida);
}
