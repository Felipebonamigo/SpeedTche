// V12, item 2, medido na IMAGEM (Chromium + swiftshader pelo laboratório `tools/render-harness.lab.*`, 640×360): as noites da galeria (Sampa) e as outras cenas noturnas
// (Curitiba, Aracaju, Xingó, Fuji, Foz, Canastra, cada uma a sua paleta) com o céu, a névoa do horizonte e o chão mais perto do roxo do Horizon Chase 2
// (`scratch/ref/hc2-7.webp`: céu matiz 281° croma 0,41; horizonte 287° / 0,33; chão 322° / 0,33, medidos por `tools/medir-imagem.mjs`) SEM mexer na luz do carro:
// o carro branco continua lendo branco (a cor-brilho tem o teste GL dela, `cor-brilho-gl.test.ts`, que roda junto). Sem o Chromium o arquivo é pulado; `NC_REQUIRE_GL=1` o exige.
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

interface RegionStat { sat: number; luma: number; p5: number; p95: number; contrast: number; warm: number; dark: number; bright: number; rgb: [number, number, number]; chroma: number }
interface Lab {
  freeze(track: string, ticks: number, opts?: { x?: number; parked?: boolean; tod?: 'day' | 'dusk' | 'night'; seg?: number }): void;
  regions(q: Quality, frames: number, boxes: Array<[number, number, number, number]>): RegionStat[];
  programs(): { total: number; bad: string[]; shaderErrors: string[] };
}

/** As faixas de `tools/medir-imagem.mjs`: o céu, o horizonte (a névoa de profundidade) e o chão (a pista e a beira dela, a maior parte do quadro de baixo). */
const BOXES: Array<[number, number, number, number]> = [[0.2, 0.12, 0.8, 0.32], [0.1, 0.36, 0.9, 0.5], [0.2, 0.6, 0.8, 0.85]];
const CENAS = {
  sampa: { track: 'sampa_noite', seg: 970, cidade: true, ceuMin: 0.26 },
  curitiba: { track: 'curitiba', seg: 60, cidade: true, ceuMin: 0.26 },
  aracaju: { track: 'aracaju', seg: 100, cidade: false, ceuMin: 0.26 },
  xingo: { track: 'xingo', seg: 110, cidade: false, ceuMin: 0.26 },
  fuji: { track: 'monte_fuji', seg: 80, cidade: false, ceuMin: 0.26 },
  foz: { track: 'foz_do_iguacu', seg: 105, cidade: false, ceuMin: 0.26 },
  // Canastra: a lua grande e o halo dela branqueiam a caixa do céu (antes 0,207, HC2 0,41): o piso é menor.
  canastra: { track: 'serra_da_canastra', seg: 100, cidade: false, ceuMin: 0.22 },
} as const;

/** Matiz (°) da cor média e B − R (0..1). */
function matiz([r, g, b]: [number, number, number]): number {
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
  if (d === 0) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const bmr = (r: RegionStat): number => (r.rgb[2] - r.rgb[0]) / 255;

function registrar(linha: string): void {
  console.log(linha);
  try { mkdirSync('scratch', { recursive: true }); appendFileSync('scratch/noite-medidas.log', `${linha}\n`); } catch { /* só diagnóstico */ }
}

if (REQUIRED) it('o Chromium existe (NC_REQUIRE_GL=1)', () => { expect(available, `sem ${CHROME}`).toBe(true); });

describe.skipIf(!available)('V12 · a noite roxa na imagem (swiftshader)', { timeout: 1_800_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let page: Page;
  const errors: string[] = [];
  beforeAll(async () => {
    server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-noite-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
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
    lab((L, a) => { const k = a as { track: string; seg: number; boxes: Array<[number, number, number, number]> }; L.freeze(k.track, 300, { seg: k.seg, x: 0, parked: true, tod: 'night' }); return L.regions('high', 4, k.boxes); }, { ...c, boxes: BOXES });

  const f = (r: RegionStat): string => `matiz ${matiz(r.rgb).toFixed(0)}° croma ${r.chroma.toFixed(3)} luma ${r.luma.toFixed(3)} B−R ${bmr(r).toFixed(3)}`;

  it('o céu e a névoa do horizonte de TODA noite são roxos na imagem: matiz 250–335° (violeta-azulado a magenta; o HC2: 281° e 287°) e croma do céu ≥ 0,26 (Canastra ≥ 0,22, a lua branqueia), do horizonte ≥ 0,22', async () => {
    const bad: string[] = [];
    for (const [nome, c] of Object.entries(CENAS)) {
      const [ceu, hor, chao] = await medir(c);
      registrar(`[V12] ${nome}: céu ${f(ceu)} | horizonte ${f(hor)} | chão ${f(chao)}`);
      for (const [n, r, min] of [['céu', ceu, c.ceuMin], ['horizonte', hor, 0.22]] as const) {
        const h = matiz(r.rgb);
        if (h < 250 || h > 335) bad.push(`${nome} ${n}: matiz ${h.toFixed(0)}°`);
        if (r.chroma < min) bad.push(`${nome} ${n}: croma ${r.chroma.toFixed(3)} < ${min}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('o chão das noites de cidade (Sampa, Curitiba: a pista e a beira) é mauve-magenta: matiz 275–335° e B − R ≤ +0,06 (o HC2: 322° e −0,11; antes lilás-azulado, 270° e +0,09)', async () => {
    const bad: string[] = [];
    for (const [nome, c] of Object.entries(CENAS)) {
      if (!c.cidade) continue;
      const [, , chao] = await medir(c);
      const h = matiz(chao.rgb);
      if (h < 275 || h > 335) bad.push(`${nome} chão: matiz ${h.toFixed(0)}°`);
      if (bmr(chao) > 0.06) bad.push(`${nome} chão: B − R ${bmr(chao).toFixed(3)}`);
    }
    expect(bad).toEqual([]);
  });

  it('as travas da imagem seguem: sem clarão e sem breu (luma do chão entre 0,10 e 0,55; do céu até 0,55: o Fuji já tinha 0,46 com a lua), e o programa compila sem erro', async () => {
    const bad: string[] = [];
    for (const [nome, c] of Object.entries(CENAS)) {
      const [ceu, , chao] = await medir(c);
      if (chao.luma < 0.1 || chao.luma > 0.55) bad.push(`${nome} chão luma ${chao.luma.toFixed(3)}`);
      if (ceu.luma > 0.55) bad.push(`${nome} céu luma ${ceu.luma.toFixed(3)}`);
    }
    expect(bad).toEqual([]);
    const progs = await lab((L) => L.programs());
    expect(progs.shaderErrors).toEqual([]);
    expect(errors).toEqual([]);
  });
});
