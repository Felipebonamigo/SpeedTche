// Folha da V14 (tinta, lanterna, vidro): Horizon Chase 2 (referência) × ANTES × DEPOIS, nas vistas que o dono vê: câmera de corrida de dia, 3/4 de trás (vermelho e azul), noite com
// freio e a garagem; e a folha dos 26 carros (3/4 de trás) antes e depois. As referências do HC2 são SÓ referência visual (nunca textura nem modelo).
//   node tools/tinta-folha.mjs --antes <raiz> --depois <raiz> [--saida scratch/tinta/folha-hc2-antes-depois.png] [--fotos scratch/tinta/fotos] [--so corrida,noite,...] [--rotulo-antes 'antes (main a66d119)']
// `--antes` e `--depois` são worktrees (precisam de node_modules); sobe um vite por raiz, numa porta livre, e o encerra pelo PID. Chromium: /opt/pw-browsers (swiftshader).
// Quadros: harness `tools/render-harness.html` (hero=0: o casco de sempre) e, na garagem, a carreira de verdade com `heroCars` desligado nas opções salvas.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';

const opt = { antes: null, depois: null, saida: 'scratch/tinta/folha-hc2-antes-depois.png', fotos: 'scratch/tinta/fotos', so: null, 'rotulo-antes': 'antes (main a66d119)', 'rotulo-depois': 'depois (V14)' };
for (let i = 2; i < process.argv.length; i += 2) opt[process.argv[i].slice(2)] = process.argv[i + 1];
if (!opt.antes || !opt.depois) { console.error('uso: node tools/tinta-folha.mjs --antes <raiz> --depois <raiz> [--saida x.png] [--fotos pasta] [--so corrida,noite]'); process.exit(2); }
const so = opt.so ? opt.so.split(',') : null;
const fotos = resolve(opt.fotos); const saida = resolve(opt.saida);
mkdirSync(fotos, { recursive: true }); mkdirSync(dirname(saida), { recursive: true });
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

// [id, título, querystring do harness, recorte da NOSSA foto (x, y, largura, altura em px do quadro 1280×720), HC2 (arquivo, x, y, largura, altura em %)]
const BASE = 'track=copacabana&seg=300&hud=0&car=falcao&hero=0';
const VISTAS = [
  ['corrida', 'câmera de corrida · dia · vermelho', `${BASE}&paints=rubi`, [440, 400, 480, 270], ['hc2-8.webp', 28, 55, 36, 38]],
  ['tras34-vermelho', '3/4 de trás · vermelho', `${BASE}&carview=rear34&paints=rubi`, [360, 190, 560, 315], ['hc2-7.webp', 19, 55, 22, 18]],
  ['tras34-azul', '3/4 de trás · azul', `${BASE}&carview=rear34&paints=cobalto`, [360, 190, 560, 315], ['hc2-9.webp', 28, 58, 28, 32]],
  ['noite', 'noite · freio', `${BASE}&tod=night&brake=1&carview=rear34&paints=rubi`, [360, 190, 560, 315], ['hc2-7.webp', 36, 58, 34, 38]],
];
const GARAGEM = ['garagem', 'garagem', ['hc2-6.webp', 28, 55, 40, 36]];
const wanted = (id) => !so || so.includes(id);

async function subir(raiz) {
  const port = await freePort();
  const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: raiz, stdio: 'ignore' });
  const stop = () => { try { vite.kill('SIGTERM'); } catch { /* já saiu */ } };
  process.on('exit', stop);
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) { try { if ((await fetch(base)).ok) break; } catch { /* ainda subindo */ } await new Promise((r) => setTimeout(r, 1000)); }
  return { base, stop };
}

async function fotografar(rotulo, raiz) {
  const { base, stop } = await subir(resolve(raiz));
  const browser = await chromium.launch({ executablePath: CHROME, args: GL });
  const shot = async (nome, qs) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const p = await ctx.newPage(); p.setDefaultTimeout(300000);
    await p.goto(`${base}/tools/render-harness.html?${qs}`);
    await p.waitForFunction(() => window.ready === true, null, { timeout: 300000, polling: 1000 }).catch(() => {});
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${fotos}/${nome}-${rotulo}.png`, timeout: 300000 });
    console.log('ok', `${nome}-${rotulo}`);
    await ctx.close();
  };
  for (const [id, , qs] of VISTAS) if (wanted(id)) await shot(id, qs);
  if (wanted('26')) {
    // os 26 carros, 3/4 de trás, em 6 × 5 quadros de 1920 × 1080
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const p = await ctx.newPage(); p.setDefaultTimeout(600000);
    await p.goto(`${base}/tools/render-harness.html?track=copacabana&seg=300&hud=0&hero=0&sheet=rear34&allcars=1`);
    await p.waitForFunction(() => window.ready === true, null, { timeout: 600000, polling: 1000 }).catch(() => {});
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${fotos}/26-${rotulo}.png`, timeout: 600000 });
    console.log('ok', `26-${rotulo}`);
    await ctx.close();
  }
  if (wanted('garagem')) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => {
      localStorage.setItem('speed-tche.settings', JSON.stringify({ quality: 'high', heroCars: 'off' }));
      const g = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t, a) { return g.call(this, t, t === 'webgl2' || t === 'webgl' ? { ...(a ?? {}), preserveDrawingBuffer: true } : a); };
      window.requestAnimationFrame = () => 0;
    });
    const p = await ctx.newPage(); p.setDefaultTimeout(300000);
    await p.goto(`${base}/?nosurvey=1`);
    await p.waitForFunction(() => !!window.nc?.session, null, { timeout: 300000, polling: 500 });
    await p.evaluate(() => {
      const s = window.nc.session; s.stop();
      for (let i = 0; i < 4; i++) s.input.unbindSeat(i);
      s.input.bindSeat(0, 'kb1');
      s.handleMenuEvent({ type: 'startCareer', humans: [{ seat: 0, name: 'Piloto 1', carId: 'falcao', teamId: 0, color: '#d7263d' }], resume: false });
    });
    for (let i = 1; i <= 12; i++) await p.evaluate((t) => window.nc.session.frame(t), i * 200);
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${fotos}/garagem-${rotulo}.png`, timeout: 300000 });
    console.log('ok', `garagem-${rotulo}`);
    await ctx.close();
  }
  await browser.close();
  stop();
}

await fotografar('antes', opt.antes);
await fotografar('depois', opt.depois);

// ── a folha: HC2 (recortes das capturas do dono) × antes × depois ──
const data = (p) => `data:${p.endsWith('.webp') ? 'image/webp' : 'image/png'};base64,${readFileSync(p).toString('base64')}`;
const REF = resolve('scratch/ref');
const W = 792; const H = 446;
// uma célula: a imagem recortada (x, y, w, h em %) e escalada para cobrir a célula (o script de dentro da página mede a imagem)
const cel = (titulo, src, [x, y, w, h]) =>
  `<div><div style="padding:6px 4px">${titulo}</div><div style="width:${W}px;height:${H}px;overflow:hidden;position:relative;background:#222"><img src="${data(src)}" data-x="${x}" data-y="${y}" data-w="${w}" data-h="${h}" style="position:absolute;max-width:none;visibility:hidden"></div></div>`;
const pct = ([x, y, w, h]) => [x / 12.8, y / 7.2, w / 12.8, h / 7.2];
const linhas = [...VISTAS.filter(([id]) => wanted(id)).map(([id, nome, , crop, ref]) => [id, nome, pct(crop), ref]), ...(wanted('garagem') ? [[GARAGEM[0], GARAGEM[1], [0, 0, 100, 100], GARAGEM[2]]] : [])];
const b2 = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const pg = await b2.newPage({ viewport: { width: 2416, height: 1000 } });
await pg.setContent(`<body style="margin:0;background:#101018;font:600 20px sans-serif;color:#fff"><div style="display:grid;grid-template-columns:${W}px ${W}px ${W}px;gap:8px;padding:8px;width:${W * 3 + 16 + 16}px">${linhas.map(([id, nome, crop, ref]) =>
  cel(`Horizon Chase 2 · ${nome}`, resolve(REF, ref[0]), ref.slice(1)) + cel(`${opt['rotulo-antes']} · ${nome}`, `${fotos}/${id}-antes.png`, crop) + cel(`${opt['rotulo-depois']} · ${nome}`, `${fotos}/${id}-depois.png`, crop)).join('')}</div></body>`);
await pg.evaluate(async ({ W, H }) => {
  for (const img of document.querySelectorAll('img[data-w]')) {
    await img.decode();
    const nw = img.naturalWidth; const nh = img.naturalHeight;
    const [x, y, w, h] = ['x', 'y', 'w', 'h'].map((k) => Number(img.dataset[k]) / 100);
    const s = Math.max(W / (w * nw), H / (h * nh));
    img.style.width = `${nw * s}px`; img.style.height = `${nh * s}px`;
    img.style.left = `-${x * nw * s}px`; img.style.top = `-${y * nh * s}px`; img.style.visibility = 'visible';
  }
}, { W, H });
await pg.waitForTimeout(800);
await pg.screenshot({ path: saida, fullPage: true });
if (wanted('26')) {
  const pg2 = await b2.newPage({ viewport: { width: 1920, height: 2200 } });
  await pg2.setContent(`<body style="margin:0;background:#101018;font:600 22px sans-serif;color:#fff"><div style="padding:6px 8px">${opt['rotulo-antes']} · os 26 carros, 3/4 de trás</div><img src="${data(`${fotos}/26-antes.png`)}" style="width:1920px;display:block"><div style="padding:6px 8px">${opt['rotulo-depois']} · os 26 carros, 3/4 de trás</div><img src="${data(`${fotos}/26-depois.png`)}" style="width:1920px;display:block"></div></body>`);
  await pg2.waitForTimeout(800);
  await pg2.screenshot({ path: saida.replace(/\.png$/, '-26-carros.png'), fullPage: true });
  console.log(`folha dos 26: ${saida.replace(/\.png$/, '-26-carros.png')}`);
}
await b2.close();
console.log(`folha: ${saida}`);
