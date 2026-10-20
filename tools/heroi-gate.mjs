// V9: o custo do carro herói nas cenas do gate (triângulos do pior viewport e chamadas), com o herói desligado, no automático do jogo e no PIOR CASO REAL
// (os 4 humanos no Falcão GT, todos de perto, herói ligado em toda qualidade). Só contagem (swiftshader): FPS é do `--bench` do dono.
//   node tools/heroi-gate.mjs [saida.json]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
const out = process.argv[2] ?? 'scratch/hero/heroi-gate.json';
const server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-heroi-gate-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } }); page.setDefaultTimeout(3_600_000);
await page.goto(`http://127.0.0.1:${port}/tools/render-harness.lab.html`);
await page.waitForFunction(() => window.labReady === true, null, { timeout: 3_600_000, polling: 1000 });
const GT = (n) => Array.from({ length: n }, () => 'falcao');
const cenas = [['copa-1p', 'copacabana', 1], ['copa-2p', 'copacabana', 2], ['copa-4p', 'copacabana', 4], ['sampa-4p', 'sampa_noite', 4]];
const res = {};
for (const [id, track, n] of cenas) {
  for (const q of ['medium', 'high', 'ultra']) {
    for (const [modo, hero, ids] of [['desligado', 'off', GT(n)], ['pior caso (todos GT)', 'on', GT(n)], ['padrão do jogo (auto)', 'auto', null]]) {
      const r = await page.evaluate(([t, nn, qq, h, carIds]) => {
        const L = window.lab; L.setHero(h); L.setup(t, nn, 300, undefined, undefined, carIds ?? undefined);
        const last = L.render(qq, 4).slice(-2); const vps = last.flatMap((d) => d.viewports);
        const per = L.perfil(qq, 2).map((v) => v.rows.filter((r) => Number((/(\d+) △\/inst/.exec(r.cat) ?? [])[1] ?? 0) >= 9000).reduce((s, r) => s + r.instances, 0));
        return { triangles: Math.max(...vps.map((v) => v.triangles)), calls: Math.max(...vps.map((v) => v.calls)), heroes: Math.max(...per) };
      }, [track, n, q, hero, ids]);
      res[`${id}/${q}/${modo}`] = r;
      console.log(`${id} ${q} · ${modo}: ${r.triangles} △, ${r.calls} chamadas, até ${r.heroes} heróis por viewport`);
    }
  }
}
writeFileSync(out, JSON.stringify(res, null, 1));
await browser.close(); await server.close();
