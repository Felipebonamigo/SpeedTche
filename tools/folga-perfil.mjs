// V13: o perfil de onde vão os triângulos e as chamadas do gate (cena × qualidade, por viewport, por categoria e por passe).
//   node tools/folga-perfil.mjs [saida.json] [cenas=copa-4p,sampa-4p] [qualidades=medium,high]      (sobe o vite sozinho, numa porta livre)
// Usa `lab.perfil` (tools/render-harness.lab.ts): ganchos de cada objeto + a diferença do renderer.info. swiftshader: só CONTAGEM, nunca FPS.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'scratch/folga-perfil.json';
const wantScenes = (process.argv[3] ?? 'copa-4p,sampa-4p').split(',');
const wantQ = (process.argv[4] ?? 'medium,high').split(',');
const SCENES = { 'copa-1p': ['copacabana', 1], 'copa-2p': ['copacabana', 2], 'copa-4p': ['copacabana', 4], 'sampa-4p': ['sampa_noite', 4] };
const server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-folga-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
await server.listen();
const addr = server.httpServer?.address();
const port = typeof addr === 'object' && addr ? addr.port : 0;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.setDefaultTimeout(1_800_000);
page.on('pageerror', (e) => console.log('ERRO DA PÁGINA', e.message));
await page.goto(`http://127.0.0.1:${port}/tools/render-harness.lab.html`);
await page.waitForFunction(() => window.labReady === true, null, { timeout: 1_800_000, polling: 1000 });
const result = {};
for (const sc of wantScenes) for (const q of wantQ) {
  const [track, n] = SCENES[sc];
  const r = await page.evaluate(([t, hn, quality]) => { window.lab.setup(t, hn, 300); return window.lab.perfil(quality, 2); }, [track, n, q]);
  result[`${sc}/${q}`] = r;
  const worst = r.reduce((a, b) => (b.total > a.total ? b : a));
  console.log(`\n== ${sc} ${q}: pior viewport ${worst.total} △, ${worst.calls} chamadas (viewports: ${r.map((v) => v.total).join(' / ')})`);
  const rows = worst.rows.map((x) => ({ ...x, tot: x.main + x.shadow }));
  for (const x of rows.slice(0, 22)) console.log(`  ${x.cat.padEnd(34)} principal ${String(x.main).padStart(7)}  sombra ${String(x.shadow).padStart(7)}  (${x.mainCalls}+${x.shadowCalls} ch, ${x.instances} inst)`);
  console.log(`  ${'(pós, quadros cheios)'.padEnd(34)} ${String(worst.other).padStart(7)}`);
}
writeFileSync(out, JSON.stringify(result, null, 1));
await browser.close();
await server.close();
