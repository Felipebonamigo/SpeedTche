// V11 (docs/ondas/V11-estrada.md), a ESTRADA medida na IMAGEM: Chromium + swiftshader pelo laboratório `tools/render-harness.lab.*`, a 640×360, as quatro cenas da folha
// HC2 × nosso (Xingó deserto, Paraty entardecer, Sampa noite, Copacabana dia, os segmentos da galeria). A cor que a pista mostra na tela (o albedo × a luz × a gradação),
// no asfalto à frente do carro, na faixa da esquerda. Sem o Chromium o arquivo é pulado; `NC_REQUIRE_GL=1` o exige.
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

type Probe = { box: [number, number, number, number, number, number] };
interface ProbeStat { x0: number; y0: number; x1: number; y1: number; mean: number; white: number; rgb: [number, number, number] }
interface Lab {
  freeze(track: string, ticks: number, opts?: { x?: number; parked?: boolean; tod?: 'day' | 'dusk' | 'night'; seg?: number }): void;
  shoot(q: Quality, frames: number, probes: Probe[]): ProbeStat[];
  programs(): { total: number; bad: string[]; shaderErrors: string[] };
}

/** A faixa da esquerda à frente do carro: perto (5 a 9 m) e longe (20 a 40 m), x de −5 a −2 m (entre o tracejado e a faixa de bordo). */
const NEAR: Probe = { box: [-5, 0, -9, -2, 0.02, -5] };
const FAR: Probe = { box: [-5, 0, -40, -2, 0.02, -20] };
const CENAS = {
  xingo: { track: 'xingo', seg: 110 },
  paraty: { track: 'paraty', seg: 90 },
  sampa: { track: 'sampa_noite', seg: 970 },
  copacabana: { track: 'copacabana', seg: 300 },
} as const;

type V = [number, number, number];
const hueDeg = ([r, g, b]: V): number => {
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
  if (d < 1e-6) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
};
const satOf = (c: V): number => { const mx = Math.max(...c); return mx <= 0 ? 0 : (mx - Math.min(...c)) / mx; };

/** Registra a medida em `scratch/estrada-medidas.log` (o vitest não mostra o console de todo reporter) e no console. */
function registrar(linha: string): void {
  console.log(linha);
  try { mkdirSync('scratch', { recursive: true }); appendFileSync('scratch/estrada-medidas.log', `${linha}\n`); } catch { /* só diagnóstico */ }
}

if (REQUIRED) it('o Chromium existe (NC_REQUIRE_GL=1)', () => { expect(available, `sem ${CHROME}`).toBe(true); });

describe.skipIf(!available)('V11 · a estrada na imagem (swiftshader)', { timeout: 1_800_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let page: Page;
  const errors: string[] = [];
  beforeAll(async () => {
    server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-estrada-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
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

  /** A cor média (sRGB 0..255) do asfalto perto e longe, na faixa da esquerda. */
  const estrada = async (c: { track: string; seg: number }): Promise<{ near: V; far: V }> => {
    const [near, far] = await lab((L, a) => { const k = a as { track: string; seg: number; probes: Probe[] }; L.freeze(k.track, 300, { seg: k.seg, x: 0, parked: true }); return L.shoot('high', 4, k.probes); }, { ...c, probes: [NEAR, FAR] });
    return { near: near.rgb, far: far.rgb };
  };

  it('Xingó (deserto, dia): a estrada é terra alaranjada — o vermelho passa do azul em ≥ 70, o matiz fica em 8°–40° e a saturação ≥ 0,45 (antes: asfalto cinza, R − B ≈ 14)', async () => {
    const { near, far } = await estrada(CENAS.xingo);
    registrar(`[V11] xingó: perto rgb(${near}) matiz ${hueDeg(near).toFixed(0)}° sat ${satOf(near).toFixed(2)} · longe rgb(${far})`);
    for (const [nome, c] of [['perto', near], ['longe', far]] as const) {
      expect(c[0] - c[2], `${nome}: R − B (rgb ${c})`).toBeGreaterThanOrEqual(90);
      expect(hueDeg(c), `${nome}: matiz`).toBeGreaterThanOrEqual(8); expect(hueDeg(c)).toBeLessThanOrEqual(40);
      expect(satOf(c), `${nome}: saturação`).toBeGreaterThanOrEqual(0.45);
    }
    expect(errors).toEqual([]);
  });

  it('Sampa (cidade, noite): a estrada é roxo-azulada, não preta nem marinho — matiz 245°–300°, B − R entre 15 e 90, saturação ≥ 0,3 e luma ≥ 0,1 (antes: rgb 60,37,46, matiz 337°, o rosa-vinho da luz roxa sobre o asfalto neutro)', async () => {
    const { near } = await estrada(CENAS.sampa);
    const luma = (0.2126 * near[0] + 0.7152 * near[1] + 0.0722 * near[2]) / 255;
    registrar(`[V11] sampa: perto rgb(${near}) matiz ${hueDeg(near).toFixed(0)}° sat ${satOf(near).toFixed(2)} luma ${luma.toFixed(3)}`);
    expect(hueDeg(near), `matiz (rgb ${near})`).toBeGreaterThanOrEqual(245); expect(hueDeg(near)).toBeLessThanOrEqual(300);
    expect(near[2] - near[0], 'B − R').toBeGreaterThanOrEqual(15); expect(near[2] - near[0]).toBeLessThanOrEqual(90);
    expect(satOf(near), 'saturação').toBeGreaterThanOrEqual(0.3);
    expect(luma, 'luma').toBeGreaterThanOrEqual(0.1);
    expect(errors).toEqual([]);
  });

  it('Copacabana (praia, dia) e Paraty (entardecer): o asfalto é cinza QUENTE — R ≥ B, sem azul-marinho (B − R ≤ 20) —, e Copacabana tem o tom mais vivo que o cinza de antes', async () => {
    const cop = await estrada(CENAS.copacabana); const par = await estrada(CENAS.paraty);
    registrar(`[V11] copacabana: perto rgb(${cop.near}) longe rgb(${cop.far}) · paraty: perto rgb(${par.near}) longe rgb(${par.far})`);
    for (const [nome, c] of [['copacabana perto', cop.near], ['copacabana longe', cop.far], ['paraty perto', par.near]] as const) {
      expect(c[0], `${nome}: R ≥ B (rgb ${c})`).toBeGreaterThanOrEqual(c[2]);
      expect(c[2] - c[0], `${nome}: B − R`).toBeLessThanOrEqual(20);
    }
    expect(errors).toEqual([]);
  });

  it('o laboratório desenhou sem erro de shader', async () => {
    const p = await lab((L) => L.programs());
    expect(p.shaderErrors).toEqual([]);
    expect(p.bad).toEqual([]);
  });
});
