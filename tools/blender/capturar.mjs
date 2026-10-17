// Capturas dos carros nacionais NO JOGO (harness + garagem), para o dono aprovar. Sobe um vite próprio numa porta livre e o encerra pelo PID.
//   node tools/blender/capturar.mjs <pasta-de-saida> <carro> [<carro>...]       (ex.: scratch/nacionais cuiabano tupiniquim tornado)
// Por carro: 3/4 frente, 3/4 traseira, lateral, frente, traseira, câmera de corrida de dia, noite com freio e a garagem.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';

const [out, ...cars] = process.argv.slice(2);
if (!out || !cars.length) { console.log('uso: node tools/blender/capturar.mjs <pasta> <carro>...'); process.exit(2); }
mkdirSync(out, { recursive: true });
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const port = await freePort();
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
const stop = () => { try { vite.kill('SIGTERM'); } catch { /* já saiu */ } };
process.on('exit', stop);
const base = `http://localhost:${port}`;
for (let i = 0; i < 120; i++) { try { if ((await fetch(base)).ok) break; } catch { /* ainda subindo */ } await new Promise((r) => setTimeout(r, 1000)); }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const only = process.env.SO ? process.env.SO.split(',') : null;
const harness = async (name, qs) => {
  if (only && !only.includes(name.split('-').slice(1).join('-'))) return;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(300000);
  await p.goto(`${base}/tools/render-harness.html?${qs}`);
  await p.waitForFunction(() => window.ready === true, null, { timeout: 300000, polling: 1000 }).catch(() => {});
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}/${name}.png`, timeout: 300000 });
  console.log('ok', `${out}/${name}.png`);
  await ctx.close();
};
for (const car of cars) {
  for (const v of ['front34', 'rear34', 'side', 'front', 'rear']) await harness(`${car}-${v}`, `track=copacabana&seg=300&hud=0&car=${car}&carview=${v}`);
  await harness(`${car}-corrida`, `track=copacabana&seg=300&hud=0&car=${car}`);
  if (car === 'furgao') await harness(`${car}-corrida-nitro`, `track=copacabana&seg=300&hud=0&car=${car}&nitro=1&nitroat=0`); // a escada cai para trás no nitro
  await harness(`${car}-noite-freio`, `track=copacabana&seg=300&hud=0&car=${car}&tod=night&brake=1`);
  if (only && !only.includes('garagem')) continue;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, a) { return g.call(this, t, t === 'webgl2' || t === 'webgl' ? { ...(a ?? {}), preserveDrawingBuffer: true } : a); }; window.requestAnimationFrame = () => 0; });
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
  await p.screenshot({ path: `${out}/${car}-garagem.png`, timeout: 300000 });
  console.log('ok', `${out}/${car}-garagem.png`);
  await ctx.close();
}
await browser.close();
stop();
