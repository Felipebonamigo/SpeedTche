// Custo de triângulos e chamadas dos carros nacionais nas cenas do gate (copa-4p e sampa-4p): o carro do jogador 1 troca (car=<id>), o resto da cena é o mesmo.
//   node tools/blender/medir.mjs tornado cuiabano tupiniquim
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const cars = process.argv.slice(2);
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const port = await freePort();
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
const stop = () => { try { vite.kill('SIGTERM'); } catch { /* já saiu */ } };
process.on('exit', stop);
const base = `http://localhost:${port}`;
for (let i = 0; i < 120; i++) { try { if ((await fetch(base)).ok) break; } catch { /* ainda subindo */ } await new Promise((r) => setTimeout(r, 1000)); }
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [scene, track] of [['copa-4p', 'copacabana'], ['sampa-4p', 'sampa_noite']]) {
  for (const car of cars) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const p = await ctx.newPage();
    p.setDefaultTimeout(300000);
    await p.goto(`${base}/tools/render-harness.html?track=${track}&seg=300&hud=0&humans=4&car=${car}&q=high`);
    await p.waitForFunction(() => window.ready === true, null, { timeout: 300000, polling: 1000 }).catch(() => {});
    await p.waitForTimeout(1500);
    const d = await p.evaluate(() => window.debug);
    console.log(`${scene} jogador 1 = ${car}: ${d?.calls} chamadas, ${d?.triangles} triângulos`);
    await ctx.close();
  }
}
await browser.close();
stop();
