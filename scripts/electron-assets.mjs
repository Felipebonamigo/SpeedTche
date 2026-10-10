// Prova, no Electron de verdade, que os .glb dos carros chegam pelo protocolo `speedtche-asset://` (desktop/assets.cjs) com a página em file://.
// Uso (depois de `npm run build` e com o Electron de desktop/ instalado):
//   xvfb-run -a node scripts/electron-assets.mjs [captura.png]
// Abre desktop/main.cjs sem empacotar (carrega ../dist/index.html por file://) com o userData numa pasta temporária, espera a sessão, imprime
// `window.nc.carAssets` (o que o jogo aceitou) e o resultado do `fetch` direto: o .glb do build (200, model/gltf-binary), index.html e `..` (404).
import { _electron as electron } from 'playwright';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const xdg = mkdtempSync(join(tmpdir(), 'nc-xdg-'));
const exe = resolve('desktop/node_modules/electron/dist/electron');
const glbs = readdirSync(resolve('dist/assets')).filter((f) => f.endsWith('.glb'));
const app = await electron.launch({
  executablePath: exe,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', resolve('desktop/main.cjs')],
  env: { ...process.env, XDG_CONFIG_HOME: xdg }, timeout: 90000,
});
const page = await app.firstWindow();
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.waitForFunction(() => window.nc && window.nc.session, null, { timeout: 90000 });
const info = await page.evaluate(() => ({ href: location.href, carAssets: window.nc.carAssets }));
console.log('href:', info.href);
console.log('carAssets:', JSON.stringify(info.carAssets));
const urls = [...glbs.map((f) => `speedtche-asset://app/assets/${f}`), 'speedtche-asset://app/index.html', 'speedtche-asset://app/assets/../index.html'];
const direct = await page.evaluate(async (list) => {
  const r = {};
  for (const u of list) {
    try { const res = await fetch(u); r[u] = `${res.status} ${res.headers.get('content-type')} ${(await res.arrayBuffer()).byteLength} bytes`; } catch (e) { r[u] = `erro ${e.message}`; }
  }
  return r;
}, urls);
console.log(JSON.stringify(direct, null, 1));
await page.waitForTimeout(1500);
if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
console.log(logs.filter((l) => /carros|asset|glb|speedtche/i.test(l)).join('\n') || '(sem avisos de carros no console)');
await app.close();
const ok = info.carAssets.rejected.length === 0 && glbs.every((f) => String(direct[`speedtche-asset://app/assets/${f}`]).startsWith('200'));
process.exit(ok ? 0 : 1);
