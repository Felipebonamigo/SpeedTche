// Onda L, L2: o renderizador de verdade, em GL (Chromium com swiftshader), pelo laboratório `tools/render-harness.lab.*`.
//   - compila TODOS os programas de shader em cada qualidade (nenhum log de erro, nenhum link falho);
//   - o `resize()` e a troca de lotação NÃO recriam o composer; a resolução dinâmica troca de degrau dentro do alvo de tamanho fixo;
//   - a sombra por viewport (3 e 4 jogadores) refaz metade dos mapas por quadro;
//   - o gate de contagem por viewport (src/bench/gate.ts).
// Sem o Chromium (sem /opt/pw-browsers) o arquivo é pulado, como os testes do relay sem o `ws`; `NC_REQUIRE_GL=1` (o CI) o exige.
// swiftshader NÃO mede GPU: nenhum tempo de quadro entra aqui, só contagem.
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkCostOrder, checkGate, fillCost, GATE_LIMITS, GATE_SCENES, type GateSample } from '../src/bench/gate';
import type { CarLook } from '../src/core/types';
import type { Quality } from '../src/game/contracts';
import type { DebugInfo } from '../src/render/renderer';

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REQUIRED = process.env.NC_REQUIRE_GL === '1';
const available = existsSync(CHROME);
const LEVELS: readonly Quality[] = ['low', 'medium', 'high', 'ultra'];

interface Collected {
  samples: GateSample[];
  frames: Array<{ scene: string; quality: Quality; debug: DebugInfo[] }>;
  programs: Array<{ quality: Quality; total: number; bad: string[]; shaderErrors: string[] }>;
  forced: Array<{ quality: Quality; debug: DebugInfo[]; off: DebugInfo[] }>;
}

/** O que `tools/render-harness.lab.ts` põe em `window.lab` (só o que este teste chama). */
interface LabApi {
  collect(): Collected;
  setup(track: string, humans: number, ticks: number, tod?: 'day' | 'dusk' | 'night', looks?: CarLook[]): void;
  programs(): { total: number; bad: string[]; shaderErrors: string[] };
  render(quality: Quality, frames: number): DebugInfo[];
  resize(w: number, h: number, dpr: number): void;
  info(): DebugInfo;
  dynamic(on: boolean, pin: number | null): void;
  blob(): { found: boolean; count: number };
}
declare global { interface Window { lab: LabApi; labReady: boolean } }

if (REQUIRED) it('o Chromium existe (NC_REQUIRE_GL=1)', () => { expect(available, `sem ${CHROME}`).toBe(true); });

// Tempo-limite próprio: a medição sob carga de CPU (swiftshader) passa dos 180 s que a suíte dá aos outros testes.
describe.skipIf(!available)('renderizador em GL (swiftshader)', { timeout: 1_500_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let page: Page;
  const errors: string[] = [];
  let collected: Promise<Collected> | null = null;
  /** A medição pesada (todas as qualidades × cenas) roda uma vez, na primeira vez que um teste a pede. */
  const collect = (): Promise<Collected> => (collected ??= page.evaluate(() => window.lab.collect()) as Promise<Collected>);

  beforeAll(async () => {
    server = await createServer({
      logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-l2-vite'),
      server: { port: 0, host: '127.0.0.1', hmr: false, watch: null },
    });
    await server.listen();
    const addr = server.httpServer?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.setDefaultTimeout(1_200_000);
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver|404/.test(m.text())) errors.push(`console: ${m.text().slice(0, 400)}`); });
    await page.goto(`http://127.0.0.1:${port}/tools/render-harness.lab.html`);
    await page.waitForFunction(() => window.labReady === true);
  }, 300_000);

  afterAll(async () => {
    await page?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await server?.close().catch(() => undefined);
  });

  it('compila todos os programas em cada qualidade: nenhum erro de shader, link falho ou log não vazio', async () => {
    const data = await collect();
    expect(data.programs.map((p) => p.quality)).toEqual([...LEVELS]);
    for (const p of data.programs) {
      expect(p.total, `${p.quality}: programas`).toBeGreaterThan(10);
      expect(p.shaderErrors, `${p.quality}: onShaderError`).toEqual([]);
      expect(p.bad, `${p.quality}: programas com log`).toEqual([]);
    }
    expect(errors).toEqual([]);
  });

  it('os acabamentos, as rodas e o aro escolhidos (N3) compilam e desenham no mesmo programa: sem erro de shader e dentro do gate de chamadas', async () => {
    // Quatro carros, cada um com um acabamento (e o resto do look): o programa dos carros é UM, o acabamento é bit de instância.
    const LOOKS = [
      { paint: 'rubi', finish: 'metalico', wheel: 'mag', rim: 'dourado', stripe: 'ab' },
      { paint: 'cobalto', finish: 'perolado', flame: 'roxa', rim: 'acento' },
      { finish: 'fosco', wheel: 'dish', stripe: 'nenhuma' },
      { paint: 'violeta', finish: 'cromado', color: '#2346d6' },
    ];
    const MORE = [{ finish: 'camaleao', paint: 'violeta', accent: '#ffcf26' }, { wheel: 'multi', finish: 'camaleao' }];
    const r = await page.evaluate(({ looks, more }) => {
      const L = window.lab;
      const out: Array<{ quality: Quality; calls: number; bad: string[]; shaderErrors: string[] }> = [];
      for (const quality of ['low', 'medium', 'high', 'ultra'] as const) {
        L.setup('copacabana', 4, 300, undefined, looks);
        const d = L.render(quality, 4).slice(-2);
        L.setup('copacabana', 2, 300, undefined, more);
        L.render(quality, 2);
        const p = L.programs();
        out.push({ quality, calls: Math.max(...d.flatMap((x) => x.viewports.map((v) => v.calls))), bad: p.bad, shaderErrors: p.shaderErrors });
      }
      return out;
    }, { looks: LOOKS, more: MORE });
    expect(r.map((x) => x.quality)).toEqual([...LEVELS]);
    for (const x of r) {
      expect(x.shaderErrors, `${x.quality}: onShaderError`).toEqual([]);
      expect(x.bad, `${x.quality}: programas com log`).toEqual([]);
      const limit = GATE_LIMITS['copa-4p'][x.quality];
      expect(x.calls, `${x.quality}: chamadas com 4 visuais diferentes`).toBeLessThanOrEqual(limit?.calls ?? 0);
    }
    expect(errors).toEqual([]);
  });

  it('o desfoque radial é um passe a mais só na Alta e no Ultra, e roda quando a condição é forçada (senão o programa dele nunca seria compilado)', async () => {
    const data = await collect();
    const por = (q: Quality) => data.forced.find((f) => f.quality === q)?.debug[1].viewports[0];
    const sem = (q: Quality) => data.forced.find((f) => f.quality === q)?.off[1].viewports[0];
    for (const q of ['low', 'medium'] as const) expect(por(q)?.passes, q).toBe(sem(q)?.passes);
    for (const q of ['high', 'ultra'] as const) expect(por(q)?.passes, q).toBe((sem(q)?.passes ?? 0) + 1);
  });

  it('o resize() e a troca de lotação não recriam o composer', async () => {
    const s = await page.evaluate(() => {
      const L = window.lab; const out: Array<{ builds: number; resizes: number }> = [];
      const snap = () => { const p = L.info().post; out.push({ builds: p.builds, resizes: p.resizes }); };
      L.resize(640, 360, 1);
      L.setup('copacabana', 1, 300); L.render('high', 2); snap(); // 0: o primeiro pipeline
      L.resize(480, 270, 1); L.render('high', 1); snap(); // 1: outro tamanho de janela
      L.resize(640, 360, 1); L.render('high', 1); snap(); // 2
      for (const n of [2, 4, 1, 4, 2, 1]) { L.setup('copacabana', n, 300); L.render('high', 2); snap(); } // 3..8: lotação
      L.resize(800, 450, 2); L.render('high', 1); snap(); // 9: e a densidade de pixels
      return out;
    });
    // Um pipeline por viewport que já foi usado (no máximo 3 a mais ao chegar a 4 jogadores), nunca mais um por resize ou lotação.
    const base = s[0].builds;
    expect(s[1].builds).toBe(base);
    expect(s[2].builds).toBe(base);
    const depoisDe4 = s[4].builds;
    expect(depoisDe4).toBeLessThanOrEqual(base + 3);
    for (let i = 4; i < s.length; i++) expect(s[i].builds, `passo ${i}`).toBe(depoisDe4);
    // Os redimensionamentos foram feitos em lugar: o contador sobe.
    expect(s[s.length - 1].resizes).toBeGreaterThan(s[0].resizes);
    // O mesmo tamanho de novo (passo 2 = 0) é um redimensionamento em lugar, não um pipeline novo.
    expect(s[2].resizes).toBeGreaterThan(s[0].resizes);
  });

  it('a resolução dinâmica troca de degrau dentro do alvo fixo: o alvo da cena encolhe, o composer não é recriado', async () => {
    const r = await page.evaluate(() => {
      const L = window.lab;
      L.resize(640, 360, 1);
      L.setup('copacabana', 1, 300);
      L.dynamic(false, null);
      const cheio = L.render('high', 2)[1];
      const builds = cheio.post.builds;
      L.dynamic(true, 0.72);
      const baixo = L.render('high', 2)[1];
      L.dynamic(false, null);
      const volta = L.render('high', 2)[1];
      // A Média também tem alvo da cena (a troca de qualidade recria os pipelines: a base de `builds` é depois dela).
      L.dynamic(true, 0.72);
      L.render('medium', 1);
      const mBase = L.info().post.builds;
      const fixo = L.render('medium', 2)[1];
      L.dynamic(false, null);
      return { cheio, baixo, fixo, volta, builds, mBase };
    });
    expect(r.cheio.viewports[0]).toMatchObject({ targetW: 640, targetH: 360 });
    expect(r.cheio.post.scale).toBe(1);
    expect(r.baixo.post.scale).toBeCloseTo(0.72, 6);
    expect(r.baixo.viewports[0].targetW).toBe(Math.round(640 * 0.72));
    expect(r.baixo.viewports[0].targetH).toBe(Math.round(360 * 0.72));
    expect(r.baixo.post.builds).toBe(r.builds);
    expect(r.fixo.viewports[0].targetW).toBe(Math.round(640 * 0.72));
    expect(r.fixo.post.builds).toBe(r.mBase);
    expect(r.volta.viewports[0]).toMatchObject({ targetW: 640, targetH: 360 });
    expect(r.volta.post.builds).toBe(r.builds);
  });

  it('a Baixa tem a sombra de contato sob o carro (e os outros degraus também)', async () => {
    const r = await page.evaluate(() => {
      const L = window.lab; L.setup('copacabana', 1, 300); L.dynamic(false, null);
      return (['low', 'medium', 'high', 'ultra'] as const).map((q) => { L.render(q, 1); return { q, ...L.blob() }; });
    });
    for (const x of r) { expect(x.found, `${x.q}: a malha da mancha`).toBe(true); expect(x.count, `${x.q}: instâncias`).toBeGreaterThanOrEqual(1); }
  });

  it('a Baixa não usa resolução dinâmica (desenha direto na tela)', async () => {
    const d = await page.evaluate(() => { const L = window.lab; L.setup('copacabana', 1, 300); L.dynamic(true, 0.72); const o = L.render('low', 2)[1]; L.dynamic(false, null); return o; });
    expect(d.viewports[0]).toMatchObject({ targetW: 640, targetH: 360, passes: 0 });
  });

  it('sombra por viewport: com 3 e 4 jogadores metade dos mapas é refeita por quadro; com 1 e 2, todos', async () => {
    const r = await page.evaluate(() => {
      const L = window.lab; const out: Record<number, number[]> = {};
      for (const n of [1, 2, 3, 4]) { L.setup('copacabana', n, 300); out[n] = L.render('high', 6).slice(2).map((d: DebugInfo) => d.shadowUpdates); }
      return out;
    });
    expect(r[1]).toEqual([1, 1, 1, 1]);
    expect(r[2]).toEqual([2, 2, 2, 2]);
    for (const n of [3, 4]) {
      const porQuadro = r[n];
      for (const k of porQuadro) expect(k, `${n} jogadores`).toBeLessThanOrEqual(Math.ceil(n / 2));
      expect(porQuadro.reduce((s, k) => s + k, 0), `${n} jogadores: 4 quadros`).toBe(n * 2);
    }
  });

  it('cada degrau com pós tem passes e pixels de alvo, o preenchimento sobe a cada degrau e a Baixa não tem pós', async () => {
    const data = await collect();
    for (const s of GATE_SCENES) {
      const por = (q: Quality) => data.samples.find((x) => x.scene === s.id && x.quality === q);
      const low = por('low'); const medium = por('medium'); const high = por('high'); const ultra = por('ultra');
      if (!low || !medium || !high || !ultra) throw new Error(`faltou amostra de ${s.id}`);
      for (const v of low.viewports) expect([v.passes, v.postPx], `${s.id} baixa`).toEqual([0, 0]);
      for (const v of medium.viewports) { expect(v.passes, `${s.id} média`).toBeGreaterThanOrEqual(3); expect(v.postPx, `${s.id} média`).toBeGreaterThan(0); }
      // O preenchimento por pixel (cena × amostras + pixels de pós) sobe a cada degrau; o Ultra tem o AO cheio a mais.
      const fill = (x: GateSample) => Math.max(...x.viewports.map(fillCost));
      expect(fill(medium), `${s.id}: média > baixa`).toBeGreaterThan(fill(low));
      expect(fill(high), `${s.id}: alta > média`).toBeGreaterThan(fill(medium));
      expect(fill(ultra), `${s.id}: ultra > alta`).toBeGreaterThan(fill(high));
    }
  });

  it('gate de contagem: dentro dos limites provisórios, e a ordem de custo entre degraus', async () => {
    const data = await collect();
    expect(checkGate(data.samples, GATE_LIMITS)).toEqual([]);
    expect(checkCostOrder(data.samples)).toEqual([]);
  });
});
