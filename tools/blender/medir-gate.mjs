// O PIOR CASO REAL de cada carro nacional no gate de contagem: os 4 jogadores no MESMO carro, todos de perto, em Sampa 4p e na Copacabana 4p,
// em Média (a mais apertada) — a mesma cena e o mesmo contador do `tests/gl-render.test.ts` (laboratório `tools/render-harness.lab.ts`).
//   node tools/blender/medir-gate.mjs padrao furgao barao ...      ("padrao" = os 4 carros de sempre: Falcão, Trovão, Tornado, Camelo)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cases = process.argv.slice(2);
const server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-medir-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
await server.listen();
const addr = server.httpServer?.address();
const port = typeof addr === 'object' && addr ? addr.port : 0;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.setDefaultTimeout(1_200_000);
await page.goto(`http://127.0.0.1:${port}/tools/render-harness.lab.html`);
await page.waitForFunction(() => window.labReady === true, null, { timeout: 1_200_000, polling: 1000 });
for (const [scene, track] of [['sampa-4p', 'sampa_noite'], ['copa-4p', 'copacabana']]) {
  for (const c of cases) {
    const ids = c === 'padrao' ? undefined : [c, c, c, c];
    const r = await page.evaluate(([t, carIds]) => { window.lab.setup(t, 4, 300, undefined, undefined, carIds ?? undefined); const d = window.lab.render('medium', 4); const last = d[d.length - 1]; return last.viewports.map((v) => ({ calls: v.calls, triangles: v.triangles })); }, [track, ids ?? null]);
    console.log(`${scene} média, 4 jogadores = ${c}: máx. ${Math.max(...r.map((v) => v.triangles))} △ por viewport (${r.map((v) => v.triangles).join(' / ')}), ${Math.max(...r.map((v) => v.calls))} chamadas`);
  }
}
await browser.close();
await server.close();
