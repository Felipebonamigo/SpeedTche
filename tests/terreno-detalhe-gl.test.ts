// V22 · F1 (docs/ondas/V22-f1-chao.md), o detalhe do CHÃO medido na IMAGEM: Chromium + swiftshader pelo laboratório `tools/render-harness.lab.*`, a 1280×720, câmera Alta, carro parado
// (sem desfoque radial). Três contratos:
//   1. o resíduo fino (pixel − média 5×5, luma 0..1) do chão da Foz e da Serra fica em 0,035–0,08 (antes: 0,025–0,029 nas mesmas caixas; no diagnóstico, 0,0151 e 0,0002);
//   2. ESTABILIDADE: o detalhe fica NO chão — um chão plano sintético (tools/terreno-detalhe.*) com o material de verdade, visto de duas posições da câmera: o mesmo ponto do chão
//      tem a mesma cor nas duas imagens (diferença média ≤ 3/255); o controle negativo (aDet relativo à câmera, o "nadar") passa de 5/255. A parte de CPU (o `aDet` do Strip é
//      absoluto) está em tests/terrain-detail.test.ts;
//   3. Baixa tem 1 oitava só: o resíduo fino dela é menor que o da Alta.
// Sem o Chromium o arquivo é pulado; `NC_REQUIRE_GL=1` o exige.
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

type Box = [number, number, number, number];
interface Lab {
  freeze(track: string, ticks: number, opts?: { x?: number; parked?: boolean; seg?: number }): void;
  lumaBox(q: Quality, frames: number, box: Box): number[];
  groundDetail(on: boolean): void;
  hold(on: boolean): void;
  programs(): { total: number; bad: string[]; shaderErrors: string[] };
}

const FOZ = { track: 'foz_do_iguacu', seg: 215 };
const SERRA = { track: 'serra_do_navio', seg: 300 };
/** Caixas de chão (px de 1280×720): capim ao lado da pista, sem a pista e quase sem cenário. */
const CAIXAS: Array<{ nome: string; cena: typeof FOZ; box: Box }> = [
  { nome: 'Foz, capim à esquerda (perto)', cena: FOZ, box: [0, 350, 250, 50] },
  { nome: 'Foz, capim à esquerda (meio)', cena: FOZ, box: [20, 330, 200, 30] },
  { nome: 'Serra, capim à esquerda (perto)', cena: SERRA, box: [0, 400, 150, 60] },
  { nome: 'Serra, capim ao centro-esquerda (meio)', cena: SERRA, box: [330, 330, 200, 30] },
];

/** Desvio-padrão do resíduo `pixel − média k×k` (luma 0..1) no miolo da caixa: só o detalhe fino, o degradê suave não conta. */
function residuo(l: number[], w: number, h: number, k = 5): number {
  const r = (k - 1) / 2; let s2 = 0; let n = 0;
  for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) {
    let m = 0;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) m += l[(y + j) * w + x + i];
    m /= k * k;
    const e = (l[y * w + x] - m) / 255; s2 += e * e; n++;
  }
  return Math.sqrt(s2 / Math.max(1, n));
}

function registrar(linha: string): void {
  console.log(linha);
  try { mkdirSync('scratch', { recursive: true }); appendFileSync('scratch/terreno-detalhe-medidas.log', `${linha}\n`); } catch { /* só diagnóstico */ }
}

if (REQUIRED) it('o Chromium existe (NC_REQUIRE_GL=1)', () => { expect(available, `sem ${CHROME}`).toBe(true); });

describe.skipIf(!available)('V22 · F1 · o detalhe do chão na imagem (swiftshader)', { timeout: 1_800_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let page: Page; let ensaio: Page;
  const errors: string[] = [];
  beforeAll(async () => {
    server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-chao-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
    await server.listen();
    const addr = server.httpServer?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(1_700_000);
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver|404/.test(m.text())) errors.push(`console: ${m.text().slice(0, 400)}`); });
    await page.goto(`http://127.0.0.1:${port}/tools/render-harness.lab.html`);
    await page.waitForFunction(() => (window as unknown as { labReady?: boolean }).labReady === true);
    ensaio = await browser.newPage({ viewport: { width: 640, height: 360 } });
    ensaio.on('pageerror', (e) => errors.push(`pageerror (ensaio): ${e.message}`));
    await ensaio.goto(`http://127.0.0.1:${port}/tools/terreno-detalhe.html`);
    await ensaio.waitForFunction(() => (window as unknown as { chaoReady?: boolean }).chaoReady === true);
  }, 300_000);
  afterAll(async () => { await ensaio?.close().catch(() => undefined); await page?.close().catch(() => undefined); await browser?.close().catch(() => undefined); await server?.close().catch(() => undefined); });

  const lab = <T>(fn: (L: Lab, arg: unknown) => T, arg?: unknown): Promise<T> =>
    page.evaluate(({ src, arg }) => (new Function('L', 'arg', `return (${src})(L, arg)`))((window as unknown as { lab: Lab }).lab, arg), { src: fn.toString(), arg }) as Promise<T>;

  /** A luma da caixa com o carro parado em `seg` (fração permitida: 0,25 de segmento = 1 m), com ou sem o detalhe do chão. */
  const quadro = (cena: { track: string; seg: number }, seg: number, box: Box, q: Quality, detalhe: boolean): Promise<number[]> =>
    lab((L, a) => {
      const k = a as { track: string; seg: number; box: Box; q: Quality; detalhe: boolean };
      L.hold(true); L.freeze(k.track, 300, { seg: k.seg, x: 0, parked: true }); L.groundDetail(k.detalhe);
      return L.lumaBox(k.q, 4, k.box);
    }, { track: cena.track, seg, box, q, detalhe });

  it('o resíduo fino (5×5) do capim da Foz e da Serra fica em 0,035–0,08 na Alta (antes: 0,025–0,029; o chão era feltro)', async () => {
    const lin: string[] = [];
    for (const c of CAIXAS) {
      const l = await quadro(c.cena, c.cena.seg, c.box, 'high', true);
      const sem = await quadro(c.cena, c.cena.seg, c.box, 'high', false);
      const r = residuo(l, c.box[2], c.box[3]); const r0 = residuo(sem, c.box[2], c.box[3]);
      lin.push(`${c.nome}: ${r.toFixed(4)} (sem o detalhe ${r0.toFixed(4)})`);
      expect(r, `${c.nome}: resíduo 5×5 com o detalhe`).toBeGreaterThanOrEqual(0.035);
      expect(r, `${c.nome}: resíduo 5×5 com o detalhe`).toBeLessThanOrEqual(0.08);
      expect(r, `${c.nome}: o detalhe é o que levanta o resíduo`).toBeGreaterThan(r0 + 0.006);
    }
    registrar(`[F1] resíduo 5×5 · ${lin.join(' · ')}`);
    expect(errors).toEqual([]);
  });

  it('Baixa tem 1 oitava só: o resíduo fino dela é menor que o da Alta (a fina e o grão ficam fora), mas o detalhe ainda existe (maior que sem ele)', async () => {
    const c = CAIXAS[0];
    const alta = residuo(await quadro(c.cena, c.cena.seg, c.box, 'high', true), c.box[2], c.box[3]);
    const baixa = residuo(await quadro(c.cena, c.cena.seg, c.box, 'low', true), c.box[2], c.box[3]);
    const sem = residuo(await quadro(c.cena, c.cena.seg, c.box, 'low', false), c.box[2], c.box[3]);
    registrar(`[F1] Baixa × Alta · ${c.nome}: Alta ${alta.toFixed(4)} · Baixa ${baixa.toFixed(4)} · Baixa sem o detalhe ${sem.toFixed(4)}`);
    expect(baixa, 'Baixa < Alta').toBeLessThan(alta - 0.004);
    expect(baixa, 'Baixa com 1 oitava ainda passa o chão sem detalhe').toBeGreaterThanOrEqual(sem);
    expect(errors).toEqual([]);
  });

  it('ESTABILIDADE (exata): o detalhe fica NO chão — um chão plano com o material do detalhe visto de duas posições da câmera, 4 m uma da outra, dá a mesma luma no mesmo ponto do chão (diferença média ≤ 3/255 em ~900 pontos); com o detalhe "nadando" (aDet relativo à câmera) a diferença passa de 5/255 e o teste o pegaria', async () => {
    const est = await ensaio.evaluate(() => (window as unknown as { chao: { comparar(o: { passo: number; nadar: boolean }): { n: number; mediaAbs: number; desvioDoCampo: number } } }).chao.comparar({ passo: 4, nadar: false }));
    const nadando = await ensaio.evaluate(() => (window as unknown as { chao: { comparar(o: { passo: number; nadar: boolean }): { n: number; mediaAbs: number; desvioDoCampo: number } } }).chao.comparar({ passo: 4, nadar: true }));
    registrar(`[F1] estabilidade (4 m adiante, ${est.n} pontos): estável ${est.mediaAbs.toFixed(2)}/255 · nadando ${nadando.mediaAbs.toFixed(2)}/255 · desvio do campo (o detalhe existe) ${est.desvioDoCampo.toFixed(1)}/255`);
    expect(est.n, 'pontos visíveis nas duas imagens').toBeGreaterThan(600);
    expect(est.desvioDoCampo, 'o detalhe existe no chão sintético (senão a igualdade seria trivial)').toBeGreaterThan(6);
    expect(est.mediaAbs, 'o mesmo ponto do chão, duas câmeras: a mesma cor').toBeLessThanOrEqual(3);
    expect(nadando.mediaAbs, 'o controle negativo: com o detalhe preso à câmera o teste falha').toBeGreaterThan(5);
    expect(await ensaio.evaluate(() => (window as unknown as { chao: { shaderErrors(): string[] } }).chao.shaderErrors())).toEqual([]);
  });

  it('o laboratório desenhou sem erro de shader (o programa do chão com detalhe compila e liga)', async () => {
    const p = await lab((L) => L.programs());
    expect(p.shaderErrors).toEqual([]);
    expect(p.bad).toEqual([]);
  });
});
