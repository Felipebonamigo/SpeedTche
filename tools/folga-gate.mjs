// V13: as contagens do gate (lab.collect) de uma raiz qualquer, para comparar antes × depois: pior viewport de cada cena × qualidade.
//   node tools/folga-gate.mjs <raiz> <saida.json>      (raiz = worktree com node_modules; sobe o vite nela)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
const raiz = resolve(process.argv[2] ?? '.'); const out = process.argv[3] ?? 'scratch/folga-gate.json';
const server = await createServer({ root: raiz, logLevel: 'silent', cacheDir: join(tmpdir(), `speedtche-folga-gate-${raiz.replace(/\W+/g, '_')}`), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } }); page.setDefaultTimeout(3_600_000);
await page.goto(`http://127.0.0.1:${port}/tools/render-harness.lab.html`);
await page.waitForFunction(() => window.labReady === true, null, { timeout: 3_600_000, polling: 1000 });
const d = await page.evaluate(() => window.lab.collect());
const res = {};
for (const s of d.samples) res[`${s.scene}/${s.quality}`] = { triangles: Math.max(...s.viewports.map((v) => v.triangles)), calls: Math.max(...s.viewports.map((v) => v.calls)) };
writeFileSync(out, JSON.stringify(res, null, 1));
console.log(Object.entries(res).map(([k, v]) => `${k}: ${v.triangles} △ ${v.calls} ch`).join('\n'));
await browser.close(); await server.close();
