// V15: o custo dos carros herói dos outros estilos nas cenas do gate (triângulos do pior viewport e chamadas), com o herói desligado, no automático do jogo e no PIOR CASO REAL com vários estilos
// (4 humanos de perto em 4 estilos diferentes e a mistura com o GT; 1 jogador em cada estilo). Só contagem (swiftshader): FPS é do `--bench` do dono.
//   node tools/herois-gate.mjs [saida.json]      (CENAS=copa-1p,copa-4p filtra as cenas; QUAL=high,ultra filtra as qualidades)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
const out = process.argv[2] ?? 'scratch/herois/herois-gate.json';
const server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-herois-gate-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } }); page.setDefaultTimeout(3_600_000);
await page.goto(`http://127.0.0.1:${port}/tools/render-harness.lab.html`);
await page.waitForFunction(() => window.labReady === true, null, { timeout: 3_600_000, polling: 1000 });
const QUATRO = ['pororoca', 'iara', 'beijaflor', 'curupira'];
const MISTO = ['falcao', 'pororoca', 'iara', 'curupira'];
const cenasTodas = [['copa-1p', 'copacabana', 1], ['copa-2p', 'copacabana', 2], ['copa-4p', 'copacabana', 4], ['sampa-4p', 'sampa_noite', 4]];
const cenas = cenasTodas.filter(([id]) => !process.env.CENAS || process.env.CENAS.split(',').includes(id));
const quals = (process.env.QUAL ?? 'medium,high,ultra').split(',');
const casos = (n) => (n === 1
  ? [['falcao (gt)', ['falcao']], ['pororoca (hyper)', ['pororoca']], ['iara (wedge)', ['iara']], ['beijaflor (prototype)', ['beijaflor']], ['curupira (roadster)', ['curupira']]]
  : n === 2 ? [['pororoca + iara', ['pororoca', 'iara']], ['beijaflor + curupira', ['beijaflor', 'curupira']]] : [['4 estilos', QUATRO], ['GT + 3 estilos', MISTO]]);
const res = {};
for (const [id, track, n] of cenas) {
  for (const q of quals) {
    for (const [nome, ids] of casos(n)) {
      for (const [modo, hero] of [['desligado', 'off'], ['herói (todos)', 'on'], ['herói (auto)', 'auto']]) {
        if (modo === 'herói (auto)' && q === 'medium') continue; // o automático só liga na Alta e na Ultra
        const r = await page.evaluate(([t, nn, qq, h, carIds]) => {
          const L = window.lab; L.setHero(h); L.setup(t, nn, 300, undefined, undefined, carIds);
          const last = L.render(qq, 4).slice(-2); const vps = last.flatMap((d) => d.viewports);
          const per = L.perfil(qq, 2).map((v) => v.rows.filter((r) => Number((/(\d+) △\/inst/.exec(r.cat) ?? [])[1] ?? 0) >= 9000).reduce((s, r) => s + r.instances, 0));
          return { triangles: Math.max(...vps.map((v) => v.triangles)), calls: Math.max(...vps.map((v) => v.calls)), heroes: Math.max(...per) };
        }, [track, n, q, hero, ids]);
        res[`${id}/${q}/${nome}/${modo}`] = r;
        console.log(`${id} ${q} · ${nome} · ${modo}: ${r.triangles} △, ${r.calls} chamadas, até ${r.heroes} heróis por viewport`);
      }
    }
  }
}
writeFileSync(out, JSON.stringify(res, null, 1));
await browser.close(); await server.close();
