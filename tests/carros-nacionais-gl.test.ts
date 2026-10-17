// O PIOR CASO REAL de cada carro nacional no gate de contagem (V6c, lote 3): os 4 jogadores no mesmo carro, todos de perto, em Sampa 4p (a cena mais cheia) e na
// Média (a mais apertada). A cena e o contador são os do `tests/gl-render.test.ts` (laboratório `tools/render-harness.lab.ts`, swiftshader); aqui o que se
// confere é que NENHUM carro nacional estoura o limite provisório (`GATE_LIMITS`) e que sobra folga (a margem abaixo), para a próxima leva de carros saber de quanto dispõe.
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GATE_LIMITS } from '../src/bench/gate';
import { CARS } from '../src/core/data/cars';
import type { DebugInfo } from '../src/render/renderer';

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const available = existsSync(CHROME);
/** Os nacionais (livres do lote 1, à venda e de conquista), um a um. */
const NACIONAIS = CARS.filter((c) => !['falcao', 'trovao', 'tornado', 'camelo', 'saci', 'tatu', 'boto', 'curupira', 'sucuri', 'carcara', 'pororoca', 'iara', 'boitata', 'beijaflor'].includes(c.id)).map((c) => c.id);
/** Folga mínima que o pior caso tem de deixar abaixo do limite de Sampa 4p Média (triângulos por viewport): ~1,5% do limite. */
const MARGIN = Number(process.env.NC_GATE_MARGIN ?? 5_000); // NC_GATE_MARGIN só para provar que o teste sabe falhar (margem maior que a folga real)

describe.skipIf(!available)('pior caso dos carros nacionais no gate (swiftshader)', { timeout: 1_500_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let page: Page;
  beforeAll(async () => {
    server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-l2-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
    await server.listen();
    const addr = server.httpServer?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.setDefaultTimeout(1_200_000);
    await page.goto(`http://127.0.0.1:${port}/tools/render-harness.lab.html`);
    await page.waitForFunction(() => (window as unknown as { labReady?: boolean }).labReady === true, null, { timeout: 1_200_000, polling: 1000 });
  }, 1_300_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  const worst = (carIds: string[] | null) => page.evaluate(([ids]) => {
    const lab = (window as unknown as { lab: { setup(t: string, n: number, k: number, tod?: undefined, looks?: undefined, cars?: string[]): void; render(q: string, f: number): DebugInfo[] } }).lab;
    lab.setup('sampa_noite', 4, 300, undefined, undefined, ids ?? undefined);
    const d = lab.render('medium', 4);
    const v = d[d.length - 1].viewports;
    return { triangles: Math.max(...v.map((x) => x.triangles)), calls: Math.max(...v.map((x) => x.calls)) };
  }, [carIds]);

  it('sampa-4p Média: 4 jogadores em cada carro nacional ficam dentro do limite, com folga', async () => {
    const limit = GATE_LIMITS['sampa-4p'].medium!;
    const base = await worst(null);
    expect(base.triangles, 'a cena padrão').toBeLessThanOrEqual(limit.triangles);
    const rows: string[] = [];
    for (const id of NACIONAIS) {
      const r = await worst([id, id, id, id]);
      rows.push(`${id} ${r.triangles}`);
      expect(r.triangles, `${id}: ${rows.join(' · ')}`).toBeLessThanOrEqual(limit.triangles - MARGIN);
      expect(r.calls, `${id}: chamadas`).toBeLessThanOrEqual(limit.calls);
    }
  });
});
