// V21 (docs/ondas/V21-acabamento.md), medido NA IMAGEM: Chromium com swiftshader, pelo laboratório `tools/render-harness.lab.*`, a 640×360, câmera de corrida de dia (Copacabana, seg 300, o Falcão GT
// parado e sem herói: o laboratório nasce com `hero=off`). Cada teste é um A/B no MESMO quadro: liga e desliga UMA causa pelos uniformes do material (`carUniform`), então a diferença medida é só dela:
//   1. A oclusão assada (`uOcc`): o ventre e a saia (rente ao chão) escurecem; o teto aberto não.
//   2. A linha do horizonte refletida (`uHorizon`) e o degradê de altura (`uBodyGrad`): a lataria que olha para o chão escurece, a que olha para o céu clareia, sem trocar o matiz da tinta.
//   3. O metal neutro (`uMetalNeutral`): o cromo e o escapamento deixam de ser azul-ciano (reflexo do céu) e leem cinza-prata.
// O estado de fábrica dos uniformes é o das constantes de `cars/material.ts` (BODY_CURVE, HORIZON...). Sem o Chromium (sem /opt/pw-browsers) o arquivo é pulado; `NC_REQUIRE_GL=1` (o CI) o exige.
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

type Probe = { box: [number, number, number, number, number, number] } | { point: [number, number, number]; r: number };
interface ProbeStat { mean: number; rgb: [number, number, number]; p5: number; p95: number }
interface Lab {
  freeze(track: string, ticks: number, opts?: { x?: number; parked?: boolean; seg?: number; look?: { paint?: string; stripe?: string }; car?: string }): void;
  shoot(q: Quality, frames: number, probes: Probe[]): ProbeStat[];
  carUniform(name: string, value: number[]): void;
  carUniformsDump(): Record<string, number[]>;
  hullInfo(id: string): { box: [number, number, number, number, number, number]; exhausts: number[][] };
  programs(): { total: number; bad: string[]; shaderErrors: string[] };
}
/** `ACABAMENTO_LOG=1` imprime as medidas (para calibrar os limiares de novo sem mexer no teste). */
const log = (...a: unknown[]): void => { if (process.env.ACABAMENTO_LOG) console.log('[acabamento]', ...a); };
const sat = ([r, g, b]: readonly number[]): number => (Math.max(r, g, b) === 0 ? 0 : (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b));

if (REQUIRED) it('o Chromium existe (NC_REQUIRE_GL=1)', () => { expect(available, `sem ${CHROME}`).toBe(true); });

describe.skipIf(!available)('V21: acabamento do carro na imagem (swiftshader)', { timeout: 1_800_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let page: Page;
  const errors: string[] = [];
  beforeAll(async () => {
    server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-acabamento-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
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

  /**
   * O A/B: as sondas (em metros, referencial do carro: +z = trás) medidas com o estado de fábrica ("on") e com `off` aplicado por cima ("off"), no mesmo quadro. Devolve as duas listas.
   * `probes` vem da caixa do casco (`box`): a função recebe a caixa e devolve as sondas.
   */
  async function ab(car: string, paint: string, off: Record<string, number[]>, mk: (box: number[], exhausts: number[][]) => Probe[], finish?: string): Promise<{ on: ProbeStat[]; off: ProbeStat[] }> {
    return lab((L, a) => {
      const { car, paint, off, mkSrc, finish } = a as { car: string; paint: string; off: Record<string, number[]>; mkSrc: string; finish?: string };
      L.freeze('copacabana', 300, { seg: 300, x: 0, parked: true, car, look: { paint, stripe: 'nenhuma', ...(finish ? { finish } : {}) } });
      const info = L.hullInfo(car);
      const probes = (new Function(`return (${mkSrc})`))()(info.box, info.exhausts) as Probe[];
      const factory = L.carUniformsDump();
      const on = L.shoot('high', 4, probes);
      for (const [k, v] of Object.entries(off)) L.carUniform(k, v);
      const offStat = L.shoot('high', 3, probes);
      for (const [k, v] of Object.entries(factory)) L.carUniform(k, v);
      return { on, off: offStat };
    }, { car, paint, off, mkSrc: mk.toString(), finish });
  }

  it('a oclusão assada escurece o ventre e a saia (rente ao chão) e deixa o teto aberto como estava (falcão rubi, caixas da tampa baixa e do teto)', async () => {
    // O casco inteiro recebia a mesma luz ambiente: a saia de trás (a tampa baixa, junto do chão) lia igual ao teto. Com a oclusão assada (chão + dobras) a saia fecha.
    const r = await ab('falcao', 'rubi', { uOcc: [0] }, (b) => [
      { box: [-0.5, b[1] + 0.12, b[5] - 0.25, 0.5, b[1] + 0.3, b[5] - 0.02] }, // a saia de trás
      { box: [-0.3, b[4] - 0.22, b[2] + 1.4, 0.3, b[4] - 0.02, b[2] + 2.1] }, // o teto aberto
    ]);
    const skirt = r.on[0].mean / Math.max(1e-3, r.off[0].mean);
    const roof = r.on[1].mean / Math.max(1e-3, r.off[1].mean);
    log('AO saia', skirt.toFixed(3), 'teto', roof.toFixed(3));
    expect(skirt, `saia: luma ${r.on[0].mean.toFixed(3)} com × ${r.off[0].mean.toFixed(3)} sem`).toBeLessThanOrEqual(0.9);
    expect(roof, `teto: luma ${r.on[1].mean.toFixed(3)} com × ${r.off[1].mean.toFixed(3)} sem`).toBeGreaterThanOrEqual(0.96);
    expect(errors).toEqual([]);
  });

  it('o horizonte refletido: a lataria que olha para o chão escurece e a que olha para o céu clareia (≥ 4% mais escura e ≥ 2% mais clara), e a tinta continua da mesma cor (matiz do rubi ≤ 14°)', async () => {
    // Um painel plano reflete uma direção só: a porta lia de uma cor só. O horizonte refletido (e a curvatura vertical de mentira) põe uma linha nítida: abaixo dela a lataria escurece (reflete o chão),
    // acima clareia (céu). Só o uniforme `uHorizon` liga e desliga; a tinta volta ao matiz depois (carPaintHold).
    const r = await ab('falcao', 'rubi', { uHorizon: [0, 0] }, (b) => [
      { box: [-0.5, b[1] + 0.3, b[5] - 0.12, 0.5, b[1] + 0.55, b[5] - 0.02] }, // o painel de trás, vertical (a câmera olha de cima: reflete o chão)
      { box: [-0.3, b[4] - 0.2, b[2] + 1.4, 0.3, b[4] - 0.02, b[2] + 2.0] }, // o teto (reflete o céu)
    ]);
    const down = r.on[0].mean / Math.max(1e-3, r.off[0].mean);
    const up = r.on[1].mean / Math.max(1e-3, r.off[1].mean);
    log('horizonte painel de trás', down.toFixed(3), 'teto', up.toFixed(3), 'rgb on', r.on.map((x) => x.rgb.join(',')).join(' | '));
    expect(down, `painel de trás: luma ${r.on[0].mean.toFixed(3)} com × ${r.off[0].mean.toFixed(3)} sem`).toBeLessThanOrEqual(0.96);
    expect(up, `teto: luma ${r.on[1].mean.toFixed(3)} com × ${r.off[1].mean.toFixed(3)} sem`).toBeGreaterThanOrEqual(1.02);
    for (const s of r.on) {
      const [R, G, B] = s.rgb; const mx = Math.max(R, G, B); const mn = Math.min(R, G, B); const d = mx - mn || 1;
      const h = (((mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4) * 60) + 360) % 360;
      const off = Math.min(Math.abs(h - 350), 360 - Math.abs(h - 350));
      expect(off, `rgb(${s.rgb.join(',')}): matiz ${h.toFixed(0)}°`).toBeLessThanOrEqual(14);
    }
    expect(errors).toEqual([]);
  });

  it('o metal neutro: o carro cromado (espelho do céu) perde o azul-ciano do reflexo: a croma do teto cai ≥ 0,10 com o reflexo neutro', async () => {
    // O cromo e o aro refletem o céu (env map azul-ciano): o escapamento e a roda liam "brinquedo" (azul-claro). `uMetalNeutral` tira a croma do reflexo do METAL (e só dele). O acabamento cromado é o
    // metal em área grande (o teto todo reflete o céu): é onde dá para medir sem acertar um tubo de 6 px.
    const r = await ab('falcao', 'gelo', { uMetalNeutral: [0] }, (b) => [{ box: [-0.3, b[4] - 0.2, b[2] + 1.4, 0.3, b[4] - 0.02, b[2] + 2.0] }], 'cromado');
    const sOn = sat(r.on[0].rgb); const sOff = sat(r.off[0].rgb);
    log('metal neutro croma', sOn.toFixed(3), 'sem', sOff.toFixed(3));
    expect(sOff - sOn, `croma do teto cromado: ${sOn.toFixed(3)} com × ${sOff.toFixed(3)} sem (rgb com (${r.on[0].rgb.join(',')}) sem (${r.off[0].rgb.join(',')}))`).toBeGreaterThanOrEqual(0.1);
    expect(errors).toEqual([]);
  });

  it('nenhum programa novo nem erro de shader: o mesmo programa do carro (chave v10) compila na carga', async () => {
    const p = await lab((L) => L.programs());
    expect(p.shaderErrors).toEqual([]);
    expect(p.bad).toEqual([]);
  });
});
