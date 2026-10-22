// V21: fotos RÁPIDAS da câmera de corrida pelo laboratório GL (uma página, vários carros e uniformes): para iterar o acabamento do carro sem recarregar o jogo a cada foto.
//   node tools/acabamento-lab.mjs <pasta> [carro ...]      env: VP=1920,1080 (tamanho do quadro), HERO=on|off (padrão on), TOD=day|dusk|night, UNI='{"uOcc":[0]}' (uniformes do material do carro), LABEL=nome, Q=high, SEG=300, CLIP=x,y,w,h
// Sobe um vite próprio e o encerra pelo PID (nunca pkill). Saída: <pasta>/<carro>-<LABEL>.png (recorte da câmera de corrida, 1280×720).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

const saida = resolve(process.argv[2]); mkdirSync(saida, { recursive: true });
const carros = process.argv.slice(3).length ? process.argv.slice(3) : ['cuiabano', 'tupiniquim', 'falcao', 'iara'];
const label = process.env.LABEL ?? 'corrida';
const view = process.env.VIEW ?? null; // side | rear34 | front34: a câmera extra (carro parado); sem ela, a câmera de corrida
// VARIANTES='{"a":{"uOcc":[0]},"b":{}}' tira uma foto por variante e carro (rótulo = chave); sem ela, UNI e LABEL.
const variantes = process.env.VARIANTES ? JSON.parse(process.env.VARIANTES) : { [label]: process.env.UNI ? JSON.parse(process.env.UNI) : {} };
const clip = (process.env.CLIP ?? '380,330,520,330').split(',').map(Number);
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const port = await freePort();
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
const stop = () => { try { vite.kill('SIGTERM'); } catch { /* já saiu */ } };
process.on('exit', stop);
const base = `http://localhost:${port}`;
for (let i = 0; i < 120; i++) { try { if ((await fetch(base)).ok) break; } catch { /* subindo */ } await new Promise((r) => setTimeout(r, 1000)); }
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const [vw, vh] = (process.env.VP ?? '1280,720').split(',').map(Number);
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
page.setDefaultTimeout(900000);
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}/tools/render-harness.lab.html`);
await page.waitForFunction(() => window.labReady === true, null, { timeout: 900000, polling: 1000 });
await page.evaluate((h) => window.lab.setHero(h), process.env.HERO ?? 'on');

for (const car of carros) for (const [vlabel, uni] of Object.entries(variantes)) {
  const png = await page.evaluate(({ car, tod, seg, q, uni, clip, view }) => {
    const L = window.lab;
    L.freeze('copacabana', 300, { seg, car, x: 0, ...(view ? { parked: true } : {}), ...(tod ? { tod } : {}) });
    L.shoot(q, 3, []);
    // cada variante parte dos valores de fábrica (os uniformes ficam entre uma variante e outra)
    window.__padrao ??= { car: L.carUniformsDump(), sty: { uStylizeRim: L.stylizeUniformGet('uStylizeRim'), uStylizeTerm: L.stylizeUniformGet('uStylizeTerm') } };
    for (const [k, v] of Object.entries(window.__padrao.car)) L.carUniform(k, v);
    for (const [k, v] of Object.entries(window.__padrao.sty)) L.stylizeUniform(k, v);
    for (const [k, v] of Object.entries(uni)) { if (k.startsWith('sty:')) L.stylizeUniform(k.slice(4), v); else L.carUniform(k, v); }
    L.shoot(q, 2, []);
    return view ? L.grabView(view, clip) : L.grab(clip[0], clip[1], clip[2], clip[3]);
  }, { car, tod: process.env.TOD ?? null, seg: Number(process.env.SEG ?? 300), q: process.env.Q ?? 'high', uni, clip, view });
  writeFileSync(`${saida}/${car}-${vlabel}.png`, Buffer.from(png.split(',')[1], 'base64'));
  console.log('ok', `${saida}/${car}-${vlabel}.png`);
}
await browser.close(); stop();
