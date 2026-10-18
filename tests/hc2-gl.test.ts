// V10 (HC2), medido na IMAGEM: Chromium + swiftshader pelo laboratório `tools/render-harness.lab.*`, a 640×360, as quatro cenas da folha HC2 × nosso
// (Xingó deserto, Paraty entardecer, Sampa noite, Copacabana dia, os segmentos da galeria). Sem o Chromium o arquivo é pulado; `NC_REQUIRE_GL=1` o exige.
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Quality } from '../src/game/contracts';

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REQUIRED = process.env.NC_REQUIRE_GL === '1';
const available = existsSync(CHROME);

interface RegionStat { sat: number; luma: number; p5: number; p95: number; contrast: number; warm: number; dark: number; bright: number }
interface Lab {
  freeze(track: string, ticks: number, opts?: { x?: number; parked?: boolean; tod?: 'day' | 'dusk' | 'night'; seg?: number }): void;
  regions(q: Quality, frames: number, boxes: Array<[number, number, number, number]>): RegionStat[];
  programs(): { total: number; bad: string[]; shaderErrors: string[] };
}

/** O quadro todo (sem HUD no laboratório), o céu e o chão: as mesmas faixas de `tools/medir-imagem.mjs`, mas sobre a tela inteira. */
const BOXES: Array<[number, number, number, number]> = [[0.2, 0.15, 0.8, 0.85], [0.2, 0.12, 0.8, 0.32], [0.2, 0.6, 0.8, 0.85]];
const CENAS = {
  xingo: { track: 'xingo', seg: 110 },
  paraty: { track: 'paraty', seg: 90 },
  sampa: { track: 'sampa_noite', seg: 970 },
  copacabana: { track: 'copacabana', seg: 300 },
} as const;

/** Registra a medida em `scratch/hc2-medidas.log` (o vitest não mostra o console de todo reporter) e no console. */
function registrar(linha: string): void {
  console.log(linha);
  try { mkdirSync('scratch', { recursive: true }); appendFileSync('scratch/hc2-medidas.log', `${linha}\n`); } catch { /* só diagnóstico */ }
}

if (REQUIRED) it('o Chromium existe (NC_REQUIRE_GL=1)', () => { expect(available, `sem ${CHROME}`).toBe(true); });

describe.skipIf(!available)('V10 · HC2 na imagem (swiftshader)', { timeout: 1_800_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let page: Page;
  const errors: string[] = [];
  beforeAll(async () => {
    server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-hc2-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
    await server.listen();
    const addr = server.httpServer?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.setDefaultTimeout(1_700_000);
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver|404/.test(m.text())) errors.push(`console: ${m.text().slice(0, 400)}`); });
    await page.goto(`http://127.0.0.1:${port}/tools/render-harness.lab.html`);
    await page.waitForFunction(() => (window as unknown as { labReady?: boolean }).labReady === true);
  }, 300_000);
  afterAll(async () => { await page?.close().catch(() => undefined); await browser?.close().catch(() => undefined); await server?.close().catch(() => undefined); });

  const lab = <T>(fn: (L: Lab, arg: unknown) => T, arg?: unknown): Promise<T> =>
    page.evaluate(({ src, arg }) => (new Function('L', 'arg', `return (${src})(L, arg)`))((window as unknown as { lab: Lab }).lab, arg), { src: fn.toString(), arg }) as Promise<T>;

  const medir = (c: { track: string; seg: number }): Promise<RegionStat[]> =>
    lab((L, a) => { const k = a as { track: string; seg: number; boxes: Array<[number, number, number, number]> }; L.freeze(k.track, 300, { seg: k.seg, x: 0, parked: true }); return L.regions('high', 4, k.boxes); }, { ...c, boxes: BOXES });

  it('MEDIDA (informativa): o quadro de cada cena', async () => {
    for (const [nome, c] of Object.entries(CENAS)) {
      const [centro, ceu, chao] = await medir(c);
      const f = (r: RegionStat): string => `sat ${r.sat.toFixed(3)} luma ${r.luma.toFixed(3)} contraste ${r.contrast.toFixed(3)} calor ${r.warm.toFixed(3)} escuro ${r.dark.toFixed(3)} claro ${r.bright.toFixed(3)}`;
      registrar(`[V10] ${nome}: centro ${f(centro)} | céu ${f(ceu)} | chão ${f(chao)}`);
    }
    expect(errors).toEqual([]);
  });
});
