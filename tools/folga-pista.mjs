// V22/F4: as contagens REAIS (renderer.info, pior viewport dos 2 últimos de 4 quadros, 640×360, largada de 300 ticks) de pistas de vegetação, para comparar antes × depois
// — o gate (`tools/folga-gate.mjs`) só olha Copacabana e Sampa, que quase não têm mata.
//   node tools/folga-pista.mjs <raiz> <saida.json> [pista,pista] [jogadores,..] [qualidade,..]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
const raiz = resolve(process.argv[2] ?? '.'); const out = process.argv[3] ?? 'scratch/folga-pista.json';
const pistas = (process.argv[4] ?? 'foz_do_iguacu,passo_alpino,kruger').split(',');
const humanos = (process.argv[5] ?? '1,2,4').split(',').map(Number);
const quals = (process.argv[6] ?? 'medium,high').split(',');
const server = await createServer({ root: raiz, logLevel: 'silent', cacheDir: join(tmpdir(), `speedtche-folga-pista-${raiz.replace(/\W+/g, '_')}`), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } }); page.setDefaultTimeout(3_600_000);
await page.goto(`http://127.0.0.1:${port}/tools/render-harness.lab.html`);
await page.waitForFunction(() => window.labReady === true, null, { timeout: 3_600_000, polling: 1000 });
const res = {};
for (const q of quals) for (const t of pistas) for (const h of humanos) {
  if (q === 'low' && h === 2) continue;
  const d = await page.evaluate(({ t, h, q }) => { window.lab.setup(t, h, 300); const debug = window.lab.render(q, 4); const last = debug.slice(-2); return { triangles: Math.max(...last.flatMap((x) => x.viewports.map((v) => v.triangles))), calls: Math.max(...last.flatMap((x) => x.viewports.map((v) => v.calls))) }; }, { t, h, q });
  res[`${t}/${h}p/${q}`] = d; console.log(`${t}/${h}p/${q}: ${d.triangles} △ ${d.calls} ch`);
}
writeFileSync(out, JSON.stringify(res, null, 1));
await browser.close(); await server.close();
