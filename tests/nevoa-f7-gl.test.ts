// V22 · F7 (docs/ondas/V22-f7-nevoa.md), medido na IMAGEM (Chromium + swiftshader): o laboratório do renderizador (`tools/render-harness.lab.*`, 640×360, Alta) para a névoa, o chão e a noite, e
// a página da saída (`tools/saida-detalhe.*`, o pipeline de pós de verdade sobre um fundo liso) para a vinheta e o dither. Contratos:
//   1. a névoa atmosférica tira cor do horizonte (a faixa do horizonte perde saturação e ganha luma) — comparada com a MESMA cena com `uFogAmt` = 0 (a névoa de antes);
//   2. o chão de capim fica na faixa 0,60–0,82 de saturação (era 0,79 na Foz e 0,93 na Serra) e o matiz dele varia ≥ 8° entre a sombra e a luz;
//   3. a vinheta é ≤ 12% no canto e 0 no miolo, e o dither de 1 LSB existe na saída (resíduo fino do fundo liso ≥ 0,0012);
//   4. a noite de Sampa separa o chão, a pista e o prédio por matiz (≥ 20°), e segue roxa (a V12: `noite-roxa-gl.test.ts` roda junto);
//   5. nenhum shader quebra: todo programa vivo compila e linka sem log (o chunk de névoa é global).
// Sem o Chromium o arquivo é pulado; `NC_REQUIRE_GL=1` o exige.
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Quality } from '../src/game/contracts';

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REQUIRED = process.env.NC_REQUIRE_GL === '1';
const available = existsSync(CHROME);

type Box = [number, number, number, number];
interface RegionStat { sat: number; luma: number; warm: number; rgb: [number, number, number]; chroma: number }
interface HueStat { sat: number; dark: number; light: number; spread: number; n: number }
interface Lab {
  freeze(track: string, ticks: number, opts?: { x?: number; parked?: boolean; tod?: 'day' | 'dusk' | 'night'; seg?: number }): void;
  regions(q: Quality, frames: number, boxes: Box[]): RegionStat[];
  hueSpread(q: Quality, frames: number, boxes: Box[]): HueStat[];
  stylizeUniform(name: string, value: number[]): void;
  programs(): { total: number; bad: string[]; shaderErrors: string[] };
}
interface Saida { medir(o: { vinheta?: number }): { centro: number; canto: number; razao: number; residuoFino: number; borda: number }; shaderErrors(): string[] }

if (REQUIRED) it('o Chromium existe (NC_REQUIRE_GL=1)', () => { expect(available, `sem ${CHROME}`).toBe(true); });

/** O horizonte (a faixa onde os morros distantes e a névoa moram), como em `noite-roxa-gl.test.ts`. */
const HORIZONTE: Box = [0.1, 0.36, 0.9, 0.5];

/** Cenas de dia: onde o chão de capim aparece (caixa) e a pista/segmento. */
const CHAO: Record<string, { track: string; seg: number; box: Box }> = {
  foz: { track: 'foz_do_iguacu', seg: 215, box: [0.68, 0.5, 1, 0.6] },
  alpino: { track: 'passo_alpino', seg: 180, box: [0.75, 0.38, 1, 0.46] },
};
/** Onde a faixa do horizonte tem morro e mar com cor para a névoa tirar (no Passo Alpino o horizonte é neve: não tem saturação a perder). */
const HORIZ_CENAS: Record<string, { track: string; seg: number; box: Box }> = { foz: CHAO.foz, copacabana: { track: 'copacabana', seg: 300, box: [0, 0.5, 0.2, 0.6] } };

describe.skipIf(!available)('V22 · F7 · a névoa, o chão e a noite na imagem (swiftshader)', { timeout: 1_800_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let lab: Page; let saida: Page;
  const errors: string[] = [];
  beforeAll(async () => {
    server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-nevoa-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
    await server.listen();
    const addr = server.httpServer?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const abrir = async (url: string, pronto: string): Promise<Page> => {
      const p = await browser.newPage({ viewport: { width: 640, height: 360 } });
      p.setDefaultTimeout(1_700_000);
      p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      p.on('console', (m) => { if (m.type() === 'error' && !/GL Driver|404/.test(m.text())) errors.push(`console: ${m.text().slice(0, 400)}`); });
      await p.goto(`http://127.0.0.1:${port}/${url}`);
      await p.waitForFunction((k) => (window as unknown as Record<string, unknown>)[k] === true, pronto);
      return p;
    };
    lab = await abrir('tools/render-harness.lab.html', 'labReady');
    saida = await abrir('tools/saida-detalhe.html', 'saidaReady');
  }, 600_000);
  afterAll(async () => { await lab?.close().catch(() => undefined); await saida?.close().catch(() => undefined); await browser?.close().catch(() => undefined); await server?.close().catch(() => undefined); });

  const L = <T>(fn: (L: Lab, arg: unknown) => T, arg?: unknown): Promise<T> =>
    lab.evaluate(({ src, arg }) => (new Function('L', 'arg', `return (${src})(L, arg)`))((window as unknown as { lab: Lab }).lab, arg), { src: fn.toString(), arg }) as Promise<T>;

  /** A faixa do horizonte e a caixa do chão de uma cena de dia, com a névoa atmosférica ligada (`atmos` 1) ou desligada (0: `uFogAmt` = 0, a névoa de antes). */
  const cena = (c: { track: string; seg: number; box: Box }, atmos: 0 | 1): Promise<{ hor: RegionStat; chao: HueStat }> =>
    L((l, a) => {
      const k = a as { track: string; seg: number; box: Box; hor: Box; atmos: number };
      l.freeze(k.track, 300, { seg: k.seg, x: 0, parked: true, tod: 'day' });
      l.regions('high', 2, [k.hor]); // assenta a pista (o primeiro quadro de uma pista nova entrega a paleta e os uniformes)
      l.stylizeUniform('uFogAmt', [k.atmos ? 0.42 : 0]); // a névoa nova (o valor da paleta, ATMOS_AMOUNT) ou a de antes (0); sem o uniforme (o `main`), o nome não existe e nada muda
      const hor = l.regions('high', 3, [k.hor])[0];
      const chao = l.hueSpread('high', 1, [k.box])[0];
      return { hor, chao };
    }, { ...c, hor: HORIZONTE, atmos });

  it('nenhum programa quebra: todo programa vivo compila e linka sem log (o chunk de névoa é global: terreno, pista, cenário, mar, espuma, anéis)', async () => {
    for (const c of Object.values(CHAO)) await cena(c, 1);
    await L((l) => { l.freeze('copacabana', 300, { seg: 300, x: 0, parked: true, tod: 'day' }); return l.regions('high', 3, [[0, 0, 1, 1]]); }); // o mar e a espuma
    const progs = await L((l) => l.programs());
    expect(progs.shaderErrors).toEqual([]);
    expect(progs.bad).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('a névoa atmosférica tira cor do horizonte: a faixa do horizonte perde ≥ 0,03 de saturação e não escurece, contra a mesma cena com a névoa de antes (Foz e Copacabana)', async () => {
    const bad: string[] = [];
    for (const [nome, c] of Object.entries(HORIZ_CENAS)) {
      const sem = (await cena(c, 0)).hor; const com = (await cena(c, 1)).hor;
      console.log(`[F7] ${nome} horizonte: sat ${sem.sat.toFixed(3)} → ${com.sat.toFixed(3)}, luma ${sem.luma.toFixed(3)} → ${com.luma.toFixed(3)}`);
      if (sem.sat - com.sat < 0.03) bad.push(`${nome}: saturação ${sem.sat.toFixed(3)} → ${com.sat.toFixed(3)}`);
      if (com.luma < sem.luma - 0.01) bad.push(`${nome}: luma ${sem.luma.toFixed(3)} → ${com.luma.toFixed(3)} (escureceu)`);
    }
    expect(bad).toEqual([]);
  });

  it('o chão de capim fica entre 0,60 e 0,82 de saturação (Foz era 0,79; o prado do Passo Alpino mais) e o matiz varia ≥ 8° entre a sombra e a luz', async () => {
    const bad: string[] = [];
    for (const [nome, c] of Object.entries(CHAO)) {
      const { chao } = await cena(c, 1);
      console.log(`[F7] ${nome} chão: sat ${chao.sat.toFixed(3)} matiz escuro ${chao.dark.toFixed(0)}° claro ${chao.light.toFixed(0)}° (${chao.spread.toFixed(1)}°)`);
      if (chao.sat < 0.6 || chao.sat > 0.82) bad.push(`${nome}: saturação ${chao.sat.toFixed(3)}`);
      if (Math.abs(chao.spread) < 8) bad.push(`${nome}: matiz claro−escuro ${chao.spread.toFixed(1)}°`);
    }
    expect(bad).toEqual([]);
  });

  it('a vinheta é 0 no miolo e ≤ 12% no canto; o dither de 1 LSB existe na saída do pipeline (resíduo fino do fundo liso ≥ 0,0012 e < 0,006)', async () => {
    const m = (v: number) => saida.evaluate((v) => (window as unknown as { saida: Saida }).saida.medir({ vinheta: v }), v);
    const com = await m(0.11); const sem = await m(0);
    console.log(`[F7] saída: centro ${com.centro.toFixed(4)} canto ${com.canto.toFixed(4)} razão ${com.razao.toFixed(4)} | sem vinheta razão ${sem.razao.toFixed(4)} | resíduo ${com.residuoFino.toFixed(5)}`);
    expect(com.razao).toBeLessThan(0.97); expect(com.razao).toBeGreaterThanOrEqual(0.88);
    expect(Math.abs(com.centro / sem.centro - 1), 'o miolo não escurece').toBeLessThan(0.003);
    expect(Math.abs(com.borda / sem.borda - 1), 'a 45% do raio ainda não há vinheta').toBeLessThan(0.004);
    expect(sem.razao, 'sem vinheta o fundo liso é igual no canto e no centro').toBeGreaterThan(0.99);
    expect(com.residuoFino).toBeGreaterThanOrEqual(0.0012); expect(com.residuoFino).toBeLessThan(0.006);
    expect(await saida.evaluate(() => (window as unknown as { saida: Saida }).saida.shaderErrors())).toEqual([]);
  });
  it('a noite de Sampa separa o chão, a pista e o prédio por matiz (≥ 20° entre os três, na imagem) e segue roxa (matiz 230–340°)', async () => {
    const [pista, chao, predio] = await L((l) => {
      l.freeze('sampa_noite', 300, { seg: 970, x: 0, parked: true, tod: 'night' });
      return l.regions('high', 4, [[0.15, 0.8, 0.5, 0.95], [0.75, 0.58, 1, 0.7], [0.0, 0.12, 0.2, 0.3]]); // o prédio da esquerda, perto (o da direita está a 300 m: a névoa já o pintou da cor do céu)
    });
    const hue = ([r, g, b]: [number, number, number]): number => { const mx = Math.max(r, g, b); const d = mx - Math.min(r, g, b); if (d === 0) return 0; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
    const gap = (a: number, b: number): number => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
    const h = { pista: hue(pista.rgb), chao: hue(chao.rgb), predio: hue(predio.rgb) };
    console.log(`[F7] Sampa noite: pista ${h.pista.toFixed(0)}° chão ${h.chao.toFixed(0)}° prédio ${h.predio.toFixed(0)}°`);
    expect(gap(h.pista, h.chao), 'pista × chão').toBeGreaterThanOrEqual(20);
    expect(gap(h.chao, h.predio), 'chão × prédio').toBeGreaterThanOrEqual(20);
    expect(gap(h.pista, h.predio), 'pista × prédio').toBeGreaterThanOrEqual(20);
    for (const v of Object.values(h)) { expect(v).toBeGreaterThanOrEqual(230); expect(v).toBeLessThanOrEqual(340); }
  });
});
