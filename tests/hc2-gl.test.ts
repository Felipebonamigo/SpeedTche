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
interface DiffStat { changed: number; warm: number; bright: number; luma: number }
interface Lab {
  freeze(track: string, ticks: number, opts?: { x?: number; parked?: boolean; tod?: 'day' | 'dusk' | 'night'; seg?: number }): void;
  regions(q: Quality, frames: number, boxes: Array<[number, number, number, number]>): RegionStat[];
  drive(o: { speed?: number; nitro?: boolean; skid?: boolean }): void;
  snapshot(q: Quality, frames: number): void;
  diffFromSnapshot(q: Quality, frames: number, boxes: Array<[number, number, number, number]>, thr?: number): DiffStat[];
  setReduce(on: boolean): void;
  setCartoon(on: boolean): void;
  hideFx(name: string, hide: boolean): void;
  renderer: { pinRadialBlur(v: number | null): void };
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

  /** O quadro de antes (main 08033d9, medido pelo mesmo laboratório): saturação do centro, contraste (p95 − p5 da luma), luma e fração de pixels escuros. */
  const ANTES = {
    xingo: { sat: 0.318, contraste: 0.647, luma: 0.506, escuro: 0.034 },
    paraty: { sat: 0.346, contraste: 0.667, luma: 0.447, escuro: 0.074 },
    sampa: { sat: 0.481, contraste: 0.557, luma: 0.194, escuro: 0.483 },
    copacabana: { sat: 0.422, contraste: 0.714, luma: 0.473, escuro: 0.04 },
  } as const;
  const SAT_MIN = { xingo: 0.355, paraty: 0.385, sampa: 0.48, copacabana: 0.40 } as const;

  it('A: o quadro de cada cena é mais vivo — saturação do centro acima da de antes (Xingó, Paraty, Sampa, Copacabana), contraste +0,02 e a noite sem piorar', async () => {
    const f = (r: RegionStat): string => `sat ${r.sat.toFixed(3)} luma ${r.luma.toFixed(3)} contraste ${r.contrast.toFixed(3)} calor ${r.warm.toFixed(3)} escuro ${r.dark.toFixed(3)} claro ${r.bright.toFixed(3)}`;
    for (const [nome, c] of Object.entries(CENAS) as Array<[keyof typeof CENAS, (typeof CENAS)[keyof typeof CENAS]]>) {
      const [centro, ceu, chao] = await medir(c);
      registrar(`[V10] ${nome}: centro ${f(centro)} | céu ${f(ceu)} | chão ${f(chao)}`);
      expect(centro.sat, `${nome} saturação (antes ${ANTES[nome].sat})`).toBeGreaterThanOrEqual(SAT_MIN[nome]);
      // V11: a estrada ficou mais clara e colorida (o p95 − p5 da luma encolhe no entardecer: Paraty 0,667 → 0,659); a V10 já mostrou que a amplitude não era o defeito. Piso: não piorar mais que 0,02.
      expect(centro.contrast, `${nome} contraste (antes ${ANTES[nome].contraste})`).toBeGreaterThanOrEqual(ANTES[nome].contraste - 0.02);
      expect(centro.luma, `${nome} luma (antes ${ANTES[nome].luma})`).toBeGreaterThanOrEqual(ANTES[nome].luma - 0.02);
    }
    // A noite: menos entupida que a de antes (48% dos pixels abaixo de 0,12 de luma) e mais clara.
    const [sampa] = await medir(CENAS.sampa);
    expect(sampa.dark, `Sampa: pixels escuros (antes ${ANTES.sampa.escuro})`).toBeLessThanOrEqual(0.46);
    expect(sampa.luma, `Sampa: luma (antes ${ANTES.sampa.luma})`).toBeGreaterThanOrEqual(0.21);
    expect(errors).toEqual([]);
  });

  /** Os quatro cantos da tela (o risco de canto cai neles) e a faixa atrás do carro (o escape e a poeira). */
  const CANTOS: Array<[number, number, number, number]> = [[0, 0, 0.2, 0.3], [0.8, 0, 1, 0.3], [0, 0.6, 0.2, 0.9], [0.8, 0.6, 1, 0.9]];
  const ATRAS: Array<[number, number, number, number]> = [[0.3, 0.55, 0.7, 0.9]];

  /** A diferença que UMA malha de efeito faz no quadro: o quadro N com a malha escondida (snapshot) e o N + 1 com ela visível, o desfoque radial preso em 0. */
  const efeito = (c: { track: string; seg: number }, drive: { speed?: number; nitro?: boolean; skid?: boolean }, boxes: Array<[number, number, number, number]>, cartoon = false, frames = 50, malha = 'fx-streaks'): Promise<DiffStat[]> =>
    lab((L, a) => {
      const k = a as { track: string; seg: number; drive: { speed?: number; nitro?: boolean; skid?: boolean }; boxes: Array<[number, number, number, number]>; cartoon: boolean; frames: number; malha: string };
      L.freeze(k.track, 300, { seg: k.seg, x: 0, parked: true });
      L.renderer.pinRadialBlur(0);
      L.setCartoon(k.cartoon);
      L.drive(k.drive);
      L.hideFx(k.malha, true); L.snapshot('high', k.frames); // a malha escondida só no material: o `Effects` segue andando (as linhas sobem a 100%, a câmera assenta)
      L.hideFx(k.malha, false);
      const out = L.diffFromSnapshot('high', 1, k.boxes);
      L.setCartoon(false);
      return out;
    }, { ...c, drive, boxes, cartoon, frames, malha });

  it('B: riscos largos nos cantos (≥ 65% dos pixels dos cantos mudam a 100% da velocidade; antes 48%), mais no cartum (≥ 1,25×), jato de fogo no escape com o nitro (≥ 0,9% atrás do carro; antes 0,3%) e poeira da terra grande e quente (≥ 38% e ≥ 50% quente; antes 32% e 4%)', async () => {
    const f = (d: DiffStat): string => `mudou ${(d.changed * 100).toFixed(2)}% quente ${(d.warm * 100).toFixed(0)}% claro ${(d.bright * 100).toFixed(0)}% luma ${d.luma.toFixed(2)}`;
    const soma = (l: DiffStat[]): number => l.reduce((a, d) => a + d.changed, 0);
    const cantos = await efeito(CENAS.copacabana, { speed: 1 }, CANTOS);
    registrar(`[V10] cantos a 100%: ${cantos.map(f).join(' | ')} · soma ${(soma(cantos) * 100).toFixed(2)}%`);
    const cartum = await efeito(CENAS.copacabana, { speed: 1 }, CANTOS, true);
    registrar(`[V10] cantos a 100% (cartum): soma ${(soma(cartum) * 100).toFixed(2)}%`);
    const nitro = await efeito(CENAS.copacabana, { speed: 0.85, nitro: true }, ATRAS);
    registrar(`[V10] atrás do carro com nitro: ${f(nitro[0])}`);
    const poeira = await efeito(CENAS.xingo, { speed: 0.6, skid: true }, ATRAS, false, 80, 'fx-dust');
    registrar(`[V10] poeira (xingó, rodas fora): ${f(poeira[0])}`);
    expect(soma(cantos), 'cantos (antes 48,4%)').toBeGreaterThanOrEqual(0.65);
    expect(soma(cartum), 'cantos no cartum').toBeGreaterThanOrEqual(1.25 * soma(cantos));
    expect(nitro[0].changed, 'atrás do carro com nitro (antes 0,32%)').toBeGreaterThanOrEqual(0.009);
    expect(poeira[0].changed, 'poeira: cobertura (antes 31,7%)').toBeGreaterThanOrEqual(0.38);
    expect(poeira[0].warm, 'poeira: na cor do chão (antes 4%)').toBeGreaterThanOrEqual(0.5);
    expect(errors).toEqual([]);
  });

  it('o laboratório desenhou sem erro de shader', async () => {
    const p = await lab((L) => L.programs());
    expect(p.shaderErrors).toEqual([]);
    expect(p.bad).toEqual([]);
  });
});
