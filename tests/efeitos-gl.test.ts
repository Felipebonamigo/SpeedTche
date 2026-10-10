// M5: os efeitos acesos no renderizador de verdade, em GL (Chromium com swiftshader), pelo laboratório `tools/render-harness.lab.*` (cena `fxScene`):
// faíscas esticadas, fumaça em bolha, marcas de pneu, anel da largada e do nitro, POW, linhas de velocidade e túnel do vácuo ao mesmo tempo.
//   - todos os programas de shader compilam em cada qualidade (os shaders novos: traços, bolha, POW);
//   - cada efeito vira UMA malha (no máximo 4 chamadas a mais por viewport) e o que a qualidade desliga não desenha (a onda de choque só da Média em diante);
//   - as chamadas por viewport com tudo aceso cabem no limite do gate de contagem (src/bench/gate.ts) mais o que os efeitos custam.
// Sem o Chromium o arquivo é pulado; `NC_REQUIRE_GL=1` (o CI) o exige. swiftshader não mede GPU: só contagem.
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GATE_LIMITS } from '../src/bench/gate';
import type { Quality } from '../src/game/contracts';
import type { DebugInfo } from '../src/render/renderer';

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REQUIRED = process.env.NC_REQUIRE_GL === '1';
const available = existsSync(CHROME);
const LEVELS: readonly Quality[] = ['low', 'medium', 'high', 'ultra'];

interface FxResult { debug: DebugInfo; meshes: Array<{ name: string; visible: boolean; drawn: number }> }
interface LabApi {
  fxScene(quality: Quality, forced: boolean): FxResult;
  programs(): { total: number; bad: string[]; shaderErrors: string[] };
}

if (REQUIRED) it('o Chromium existe (NC_REQUIRE_GL=1)', () => { expect(available, `sem ${CHROME}`).toBe(true); });

describe.skipIf(!available)('efeitos da M5 em GL (swiftshader)', { timeout: 1_500_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let page: Page;
  const errors: string[] = [];
  const runs = new Map<string, FxResult & { programs: { total: number; bad: string[]; shaderErrors: string[] } }>();
  const run = async (q: Quality, forced: boolean) => {
    const key = `${q}/${forced}`;
    if (!runs.has(key)) {
      const r = await page.evaluate(([qq, f]) => { const lab = (window as unknown as { lab: LabApi }).lab; const out = lab.fxScene(qq as Quality, f as boolean); return { ...out, programs: lab.programs() }; }, [q, forced] as const);
      runs.set(key, r);
    }
    return runs.get(key)!;
  };

  beforeAll(async () => {
    server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-m5-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
    await server.listen();
    const addr = server.httpServer?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.setDefaultTimeout(1_200_000);
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver|404/.test(m.text())) errors.push(`console: ${m.text().slice(0, 400)}`); });
    await page.goto(`http://127.0.0.1:${port}/tools/render-harness.lab.html`);
    await page.waitForFunction(() => (window as unknown as { labReady: boolean }).labReady === true);
  }, 300_000);

  afterAll(async () => {
    await page?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await server?.close().catch(() => undefined);
  });

  for (const q of LEVELS) {
    it(`${q}: com todos os efeitos acesos os programas compilam e as malhas dos efeitos desenham`, async () => {
      const r = await run(q, true);
      expect(r.programs.shaderErrors, 'onShaderError').toEqual([]);
      expect(r.programs.bad, 'programas com log').toEqual([]);
      const by = new Map(r.meshes.map((m) => [m.name, m]));
      expect(by.get('fx-streaks')?.visible, 'traços (faíscas, linhas, túnel)').toBe(true);
      expect(by.get('fx-streaks')?.drawn).toBeGreaterThan(0);
      expect(by.get('fx-marks')?.visible, 'marcas de pneu').toBe(true);
      expect(by.get('fx-pow')?.visible, 'POW').toBe(true);
      if (q === 'low') expect(by.get('fx-shockwaves')?.visible, 'a onda de choque só da Média em diante').toBe(false);
      else expect(by.get('fx-shockwaves')?.visible, 'onda de choque').toBe(true);
      expect(errors).toEqual([]);
    });
  }

  it('os efeitos custam no máximo 4 chamadas por viewport (uma malha cada) e cabem no gate de contagem', async () => {
    const lines: string[] = [];
    for (const q of LEVELS) {
      const on = await run(q, true); const off = await run(q, false);
      const visible = on.meshes.filter((m) => m.visible).length;
      expect(visible, `${q}: malhas de efeito desenhando`).toBeLessThanOrEqual(4);
      const limit = GATE_LIMITS['copa-2p'][q]!;
      on.debug.viewports.forEach((v, i) => {
        lines.push(`${q} vp${i}: ${off.debug.viewports[i].calls} -> ${v.calls} chamadas (${v.calls - off.debug.viewports[i].calls >= 0 ? '+' : ''}${v.calls - off.debug.viewports[i].calls}), ${off.debug.viewports[i].triangles} -> ${v.triangles} triângulos, ${visible} malhas de efeito`);
        expect(v.calls, `${q} viewport ${i}`).toBeLessThanOrEqual(limit.calls);
      });
    }
    console.log(`[M5 contagens]\n${lines.join('\n')}`);
  });
});
