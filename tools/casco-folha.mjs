// V19: fotos e folhas do casco NORMAL dos hatches nacionais (antes de V19 × depois), no jogo: câmera de corrida, 3/4 de trás, 3/4 da frente e o carro de LONGE (adversário a 40 m: LOD far).
//   node tools/casco-folha.mjs fotos <pasta> [carro ...]     tira as fotos desta versão dos .glb de src/assets/cars (sobe um vite próprio e o encerra pelo PID)
//   node tools/casco-folha.mjs folha <antes> <depois> <saida> [carro ...]    compõe folha-<carro>.{png,jpg} (antes em cima, depois embaixo) e folha-resumo
// Para o "antes": ponha os .glb de V6c (git show 0390778:src/assets/cars/<id>.glb) em src/assets/cars, tire as fotos em <antes>, volte os novos e tire em <depois>. `SO=tras34` refaz só esse quadro.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

const [modo, ...resto] = process.argv.slice(2);
const TODOS = ['cuiabano', 'tupiniquim', 'caipora', 'pampeiro'];
const NOMES = { cuiabano: 'Cuiabano', tupiniquim: 'Tupiniquim', caipora: 'Caipora', pampeiro: 'Pampeiro' };
const VISTAS = [
  ['corrida', 'câmera de corrida · dia', 'track=copacabana&seg=300&hud=0&hero=0', null],
  ['tras34', '3/4 de trás', 'track=copacabana&seg=300&hud=0&carview=rear34&hero=0', [380, 280, 520, 230]],
  ['frente34', '3/4 da frente', 'track=copacabana&seg=300&hud=0&carview=front34&hero=0', [380, 280, 520, 230]],
  ['longe', 'adversário a 40 m (LOD far)', 'track=copacabana&seg=300&hud=0&hero=0&ahead=40', [440, 250, 400, 200]],
];
const so = process.env.SO ? process.env.SO.split(',') : null;
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

if (modo === 'fotos') {
  const saida = resolve(resto[0]); mkdirSync(saida, { recursive: true });
  const carros = resto.slice(1).length ? resto.slice(1) : TODOS;
  const port = await freePort();
  const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  const stop = () => { try { vite.kill('SIGTERM'); } catch { /* já saiu */ } };
  process.on('exit', stop);
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) { try { if ((await fetch(base)).ok) break; } catch { /* subindo */ } await new Promise((r) => setTimeout(r, 1000)); }
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const car of carros) {
    for (const [id, , qs, clip] of VISTAS) {
      if (so && !so.includes(id)) continue;
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: clip ? 2 : 1 });
      const p = await ctx.newPage(); p.setDefaultTimeout(300000);
      // o longe: o jogador vai de Falcão (casco de sempre) e o adversário à frente é o carro pedido
      const q = id === 'longe' ? `${qs}&car=falcao&aicar=${car}` : `${qs}&car=${car}`;
      await p.goto(`${base}/tools/render-harness.html?${q}`);
      await p.waitForFunction(() => window.ready === true, null, { timeout: 300000, polling: 1000 }).catch(() => {});
      await p.waitForTimeout(2500);
      await p.screenshot({ path: `${saida}/${car}-${id}.png`, timeout: 300000, clip: clip ? { x: clip[0], y: clip[1], width: clip[2], height: clip[3] } : undefined });
      console.log('ok', `${saida}/${car}-${id}.png`);
      await ctx.close();
    }
  }
  await browser.close(); stop();
} else if (modo === 'folha') {
  const [antes, depois, saida, ...cs] = resto.map((x, i) => (i < 3 ? resolve(x) : x));
  const carros = cs.length ? cs : TODOS;
  mkdirSync(saida, { recursive: true });
  const data = (p) => `data:image/png;base64,${readFileSync(p).toString('base64')}`;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const W = 520; const H = 292;
  const cell = (dir, car, id) => (existsSync(`${dir}/${car}-${id}.png`) ? `<img src="${data(`${dir}/${car}-${id}.png`)}" style="width:${W}px;height:${H}px;object-fit:cover;display:block">` : `<div style="width:${W}px;height:${H}px;background:#222"></div>`);
  for (const car of carros) {
    const pg = await b.newPage({ viewport: { width: 150 + (W + 6) * VISTAS.length, height: 800 } });
    const linha = (rot, dir) => `<div style="width:130px;padding:6px">${rot}</div>${VISTAS.map(([id]) => cell(dir, car, id)).join('')}`;
    await pg.setContent(`<body style="margin:0;background:#101018;font:600 20px sans-serif;color:#fff"><div style="font-size:28px;padding:10px 8px">${NOMES[car]}, casco normal: antes (V6c) × depois (V19) · ${VISTAS.map((v) => v[1]).join(' · ')}</div><div style="display:grid;grid-template-columns:140px repeat(${VISTAS.length},${W}px);gap:6px">${linha('antes', antes)}${linha('depois', depois)}</div></body>`);
    await pg.waitForTimeout(500);
    await pg.screenshot({ path: `${saida}/folha-${car}.png`, fullPage: true });
    await pg.screenshot({ path: `${saida}/folha-${car}.jpg`, fullPage: true, type: 'jpeg', quality: 86 });
    console.log('folha', `${saida}/folha-${car}.jpg`);
    await pg.close();
  }
  // o resumo: os quatro, 3/4 de trás e 3/4 da frente, antes e depois
  const pg = await b.newPage({ viewport: { width: 2000, height: 800 } });
  const w = 480; const h = 210;
  const im = (dir, car, id) => `<img src="${data(`${dir}/${car}-${id}.png`)}" style="width:${w}px;height:${h}px;object-fit:cover;display:block">`;
  const lin = (car) => ['antes', 'depois'].map((k) => `<div style="padding:4px">${NOMES[car]} · ${k}</div>${['tras34', 'frente34', 'longe'].map((id) => im(k === 'antes' ? antes : depois, car, id)).join('')}`).join('');
  await pg.setContent(`<body style="margin:0;background:#101018;font:600 18px sans-serif;color:#fff"><div style="font-size:26px;padding:10px 8px">Casco normal dos hatches nacionais: V6c (em cima) × V19 (embaixo) · 3/4 de trás · 3/4 da frente · de longe</div><div style="display:grid;grid-template-columns:200px repeat(3,${w}px);gap:4px">${carros.map(lin).join('')}</div></body>`);
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: `${saida}/folha-resumo.png`, fullPage: true });
  await pg.screenshot({ path: `${saida}/folha-resumo.jpg`, fullPage: true, type: 'jpeg', quality: 86 });
  console.log('resumo', `${saida}/folha-resumo.jpg`);
  await b.close();
}
