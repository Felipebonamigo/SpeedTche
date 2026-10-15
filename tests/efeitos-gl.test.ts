// M5: os efeitos acesos no renderizador de verdade, em GL (Chromium com swiftshader), pelo laboratório `tools/render-harness.lab.*` (cena `fxScene`):
// faíscas esticadas, fumaça em bolha, marcas de pneu, anel da largada e do nitro, POW, linhas de velocidade e túnel do vácuo ao mesmo tempo.
// V8 (docs/ondas/V8-efeitos.md): no padrão a batida não acende o POW nem as estrelinhas (faíscas, lascas e flash no lote de traços e no pool de bolhas);
// com a opção "Efeitos de cartum" os dois voltam — e os programas deles compilam.
//   - todos os programas de shader compilam em cada qualidade (os shaders novos: traços, bolha, POW);
//   - cada efeito vira UMA malha (no máximo 5 chamadas a mais por viewport, com tudo aceso ao mesmo tempo) e o que a qualidade desliga não desenha (a onda de choque
//     só da Média em diante); as contagens ficam no log. O gate de chamadas (src/bench/gate.ts) é do tests/gl-render.test.ts, com a cena da largada.
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
  fxScene(quality: Quality, forced: boolean, cartoon?: boolean): FxResult;
  programs(): { total: number; bad: string[]; shaderErrors: string[] };
}

if (REQUIRED) it('o Chromium existe (NC_REQUIRE_GL=1)', () => { expect(available, `sem ${CHROME}`).toBe(true); });

describe.skipIf(!available)('efeitos da M5 em GL (swiftshader)', { timeout: 1_500_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let page: Page;
  const errors: string[] = [];
  const runs = new Map<string, FxResult & { programs: { total: number; bad: string[]; shaderErrors: string[] } }>();
  const run = async (q: Quality, forced: boolean, cartoon = false) => {
    const key = `${q}/${forced}/${cartoon}`;
    if (!runs.has(key)) {
      const r = await page.evaluate(([qq, f, c]) => { const lab = (window as unknown as { lab: LabApi }).lab; const out = lab.fxScene(qq as Quality, f as boolean, c as boolean); return { ...out, programs: lab.programs() }; }, [q, forced, cartoon] as const);
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
      expect(by.get('fx-pow')?.visible, 'POW: só com "Efeitos de cartum" (V8)').toBe(false);
      expect(by.get('car-stars')?.visible ?? false, 'estrelinhas: só com "Efeitos de cartum" (V8)').toBe(false);
      expect(by.get('fx-dust')?.visible, 'bolhas (fumaça e as lascas da batida)').toBe(true);
      if (q === 'low') expect(by.get('fx-shockwaves')?.visible, 'a onda de choque só da Média em diante').toBe(false);
      else expect(by.get('fx-shockwaves')?.visible, 'onda de choque').toBe(true);
      expect(errors).toEqual([]);
    });
  }

  it('com "Efeitos de cartum" (Alta) o POW e as estrelinhas voltam na batida, e os programas compilam', async () => {
    const r = await run('high', true, true);
    expect(r.programs.shaderErrors, 'onShaderError').toEqual([]);
    expect(r.programs.bad, 'programas com log').toEqual([]);
    const by = new Map(r.meshes.map((m) => [m.name, m]));
    expect(by.get('fx-pow')?.visible, 'POW').toBe(true);
    expect(by.get('car-stars')?.visible, 'estrelinhas').toBe(true);
    expect(errors).toEqual([]);
  });

  it('cada efeito é uma malha só: com tudo aceso, no máximo 5 chamadas por viewport (traços, marcas, os dois anéis e as bolhas; o POW só no cartum); a cena normal segue no gate', async () => {
    const lines: string[] = [];
    const checks: Array<() => void> = [];
    for (const q of LEVELS) {
      const on = await run(q, true); const off = await run(q, false);
      const visible = on.meshes.filter((m) => m.visible);
      const limit = GATE_LIMITS['copa-2p'][q]!;
      on.debug.viewports.forEach((v, i) => {
        const base = off.debug.viewports[i];
        lines.push(`${q} vp${i}: ${base.calls} -> ${v.calls} chamadas (${v.calls - base.calls >= 0 ? '+' : ''}${v.calls - base.calls}; ${visible.length} delas dos efeitos: ${visible.map((m) => m.name).join(', ')}; o resto é o nitro e as estrelinhas dos carros, M4), ${base.triangles} -> ${v.triangles} triângulos; limite do gate (largada) ${limit.calls}`);
      });
      checks.push(() => expect(visible.length, `${q}: malhas de efeito desenhando`).toBeLessThanOrEqual(5));
    }
    console.log(`[M5 contagens]\n${lines.join('\n')}`);
    for (const c of checks) c();
  });
});
