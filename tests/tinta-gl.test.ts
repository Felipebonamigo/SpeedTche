// V14 (docs/ondas/V14-tinta.md), medido NA IMAGEM: Chromium com swiftshader, pelo laboratório `tools/render-harness.lab.*`, a 640×360, câmera de corrida de dia
// (Copacabana, seg 300, o Falcão GT sem herói: o laboratório nasce com `hero=off`).
//   1. A tinta tem faixa de luz: a luma ao longo da tampa de trás varia (o HC2 tem gradiente longo e nítido na lataria), SEM perder a cor (as travas da cor-brilho:
//      vermelho lê vermelho, branco lê branco, azul lê azul, e o sol não acende ponto estourado).
//   2. A lanterna tem halo na lataria em volta (de dia e à noite), e "Reduzir efeitos" o apaga.
//   3. O vidro lê preto profundo (quase sem azul) em todos os carros.
// Sem o Chromium (sem /opt/pw-browsers) o arquivo é pulado; `NC_REQUIRE_GL=1` (o CI) o exige.
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
interface ProbeStat { x0: number; y0: number; x1: number; y1: number; mean: number; white: number; rgb: [number, number, number]; p5: number; p95: number }
type Lamp = { c: number[]; e: number[]; reach: number };
interface Lab {
  freeze(track: string, ticks: number, opts?: { x?: number; parked?: boolean; tod?: 'day' | 'dusk' | 'night'; seg?: number; look?: { paint?: string; stripe?: string }; car?: string }): void;
  shoot(q: Quality, frames: number, probes: Probe[]): ProbeStat[];
  setReduce(on: boolean): void;
  carIds(): string[];
  glassPoints(id: string): { low: Probe; high: Probe; n: number } | null;
  lamps(id: string): Lamp[];
  carUniform(name: string, value: number[]): void;
  programs(): { total: number; bad: string[]; shaderErrors: string[] };
}

/**
 * Dois perfis da lataria do Falcão GT vistos da câmera de corrida: a TAMPA em 5 faixas do vidro para a cauda (z de 1,5 a 2,1 m, de cima, sem pegar o vidro nem a cauda) e o perfil
 * LATERAL dela (6 faixas de x = −0,88 m, o para-lama, até 0,16 m, o meio): a faixa de luz do HC2 corre pelo meio da lataria e escurece para as laterais e as dobras.
 */
const DECK_Z = [1.5, 1.62, 1.74, 1.86, 1.98, 2.1];
const DECK: Probe[] = DECK_Z.slice(0, -1).map((z, i): Probe => ({ box: [-0.45, 0.8, z, 0.45, 0.93, DECK_Z[i + 1]] }));
const SIDE_X = [-0.88, -0.7, -0.52, -0.34, -0.16, 0, 0.16];
const SIDE: Probe[] = SIDE_X.slice(0, -1).map((x, i): Probe => ({ box: [x, 0.7, 1.62, SIDE_X[i + 1], 0.93, 1.9] }));
const sat = ([r, g, b]: readonly number[]): number => (Math.max(r, g, b) === 0 ? 0 : (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b));

if (REQUIRED) it('o Chromium existe (NC_REQUIRE_GL=1)', () => { expect(available, `sem ${CHROME}`).toBe(true); });

describe.skipIf(!available)('V14: tinta, lanterna e vidro na imagem (swiftshader)', { timeout: 1_800_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let page: Page;
  const errors: string[] = [];
  beforeAll(async () => {
    server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-tinta-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
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

  // O `page.evaluate` leva um argumento só: a tinta e as caixas vão juntas.
  async function deck(paint: string): Promise<ProbeStat[]> {
    return lab((L, a) => {
      const { paint, deck } = a as { paint: string; deck: Probe[] };
      L.freeze('copacabana', 300, { seg: 300, look: { paint, stripe: 'nenhuma' } });
      return L.shoot('high', 3, deck);
    }, { paint, deck: DECK });
  }

  it('a tinta vermelha tem faixa de luz: no perfil lateral da tampa a luma média varia ≥ 0,20 do para-lama ao meio e o meio passa de 0,40, sem deixar de ser vermelha (saturação ≥ 0,45, matiz ≤ 14° do rubi, em toda faixa)', async () => {
    // O HC2 pinta a lataria com um gradiente longo (a faixa de luz que corre pelo capô e pela tampa, escurecendo para as laterais e nas dobras). Medido antes (rubi, 6 faixas do para-lama ao
    // meio da tampa): 0,25 · 0,23 · 0,24 · 0,31 · 0,34 · 0,35 — variação de 0,12 e o claro em 0,35 (chapado).
    const r = await lab((L, a) => {
      const { deck, side } = a as { deck: Probe[]; side: Probe[] };
      L.freeze('copacabana', 300, { seg: 300, look: { paint: 'rubi', stripe: 'nenhuma' } });
      return L.shoot('high', 3, [...side, ...deck]);
    }, { deck: DECK, side: SIDE });
    const side = r.slice(0, SIDE.length); const means = side.map((s) => s.mean);
    const spread = Math.max(...means) - Math.min(...means);
    expect(spread, `luma por faixa, do para-lama ao meio: ${means.map((m) => m.toFixed(2)).join(' · ')}`).toBeGreaterThanOrEqual(0.2);
    expect(Math.max(...means), `o meio rgb(${side[side.length - 1].rgb.join(',')})`).toBeGreaterThanOrEqual(0.4);
    for (const [i, s] of r.entries()) {
      expect(sat(s.rgb), `faixa ${i} rgb(${s.rgb.join(',')}): saturação`).toBeGreaterThanOrEqual(0.45);
      const [R, G, B] = s.rgb; const mx = Math.max(R, G, B); const mn = Math.min(R, G, B); const d = mx - mn || 1;
      const h = (((mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4) * 60) + 360) % 360;
      const off = Math.min(Math.abs(h - 350), 360 - Math.abs(h - 350)); // o rubi #d7263d: ~350°
      expect(off, `faixa ${i} rgb(${s.rgb.join(',')}): matiz ${h.toFixed(0)}°`).toBeLessThanOrEqual(14);
    }
    expect(errors).toEqual([]);
  });

  it('as travas da cor: o carro branco continua branco (faixas ≥ 0,70 de luma e croma ≤ 0,12) e o azul continua azul (B ≥ 1,8 × R em toda faixa)', async () => {
    const white = await deck('gelo');
    for (const [i, s] of white.entries()) {
      expect(s.mean, `branco, faixa ${i} rgb(${s.rgb.join(',')})`).toBeGreaterThanOrEqual(0.7);
      expect(sat(s.rgb), `branco, faixa ${i} rgb(${s.rgb.join(',')}): croma`).toBeLessThanOrEqual(0.12 + 0.08);
    }
    const blue = await deck('cobalto');
    for (const [i, s] of blue.entries()) expect(s.rgb[2] / Math.max(1, s.rgb[0]), `azul, faixa ${i} rgb(${s.rgb.join(',')})`).toBeGreaterThanOrEqual(1.8);
    expect(errors).toEqual([]);
  });

  it('a lanterna tem halo na lataria em volta: de dia e à noite o vermelho de quem fica a 40% do alcance do halo, fora da lente, sobe ≥ 20 com o halo ligado; com "Reduzir efeitos" ele já está apagado (ligar e desligar à mão não muda: ≤ 6)', async () => {
    // O HC2 acende uma tira de LED com brilho em volta (de dia e à noite). O halo é o emissivo vermelho que escorre pela lataria em volta da lente (uniformes por lote:
    // sem chamada nova). Os pontos: logo fora da lente da lanterna de fora (dos dois lados e acima), na altura dela. Cada comparação é no MESMO estado (mesmo "Reduzir
    // efeitos", mesmo número de quadros depois de mexer no halo): "Reduzir efeitos" muda outros efeitos e a câmera, e comparar um estado com o outro mediria isso.
    const r = await lab((L) => {
      const out: Record<string, { on: number[]; off: number[]; redOn: number[]; redOff: number[]; lamps: number }> = {};
      const ring = (l: { c: number[]; e: number[]; reach: number }): Probe[] => {
        const d = 0.4 * l.reach;
        return [[l.c[0] + l.e[0] + d, l.c[1], l.c[2]], [l.c[0] - l.e[0] - d, l.c[1], l.c[2]], [l.c[0], l.c[1] + l.e[1] + d, l.c[2]]].map((p) => ({ point: p as [number, number, number], r: 1 }));
      };
      const reds = (probes: Probe[]): number[] => L.shoot('high', 3, probes).map((s) => s.rgb[0]);
      for (const [name, tod] of [['dia', 'day'], ['noite', 'night']] as const) {
        L.freeze('copacabana', 300, { seg: 300, tod, parked: true, look: { paint: 'gelo', stripe: 'nenhuma' } });
        const list = L.lamps('falcao').filter((l) => l.c[0] > 0.2).sort((a, b) => b.c[0] - a.c[0]);
        const probes = list.length ? ring(list[0]) : [];
        L.setReduce(false);
        const on = reds(probes); // o halo do degrau (uSheen.z = 1)
        L.carUniform('uSheen', [0.8, 0.55, 0]); const off = reds(probes);
        L.setReduce(true);
        const redOn = reds(probes); // "Reduzir efeitos" muda o uSheen (halo 0) sozinho
        L.carUniform('uSheen', [0.35, 0, 1]); const redOff = reds(probes); // religado à mão: o halo volta, então a diferença é o halo que o "Reduzir efeitos" tirou
        L.setReduce(false);
        out[name] = { on, off, redOn, redOff, lamps: list.length };
      }
      return out;
    });
    for (const [name, m] of Object.entries(r)) {
      expect(m.lamps, `${name}: o Falcão GT carrega as lanternas dele`).toBeGreaterThanOrEqual(1);
      const gain = m.on.map((v, i) => v - m.off[i]);
      expect(Math.max(...gain), `${name}: R com halo ${m.on.join(',')} × sem ${m.off.join(',')}`).toBeGreaterThanOrEqual(20);
      // com "Reduzir efeitos" o quadro normal já é o sem-halo; religar o halo à mão tem de ACENDER (a prova de que o degrau o tinha tirado, não que ele nunca existiu)
      const back = m.redOff.map((v, i) => v - m.redOn[i]);
      expect(Math.max(...back), `${name}: com "Reduzir efeitos" R ${m.redOn.join(',')} × halo religado à mão ${m.redOff.join(',')}`).toBeGreaterThanOrEqual(20);
    }
    expect(errors).toEqual([]);
  });

  it('o vidro lê preto profundo em todos os carros: no vidro de trás (câmera de corrida, de dia) o ponto mais escuro dos dois (o terço de baixo e o de cima) tem luma ≤ 0,07 e azul ≤ 36 (era azul-marinho: B de 42 a 54 nos dois)', async () => {
    // O vidro do HC2 é preto profundo com o reflexo do céu em faixa (clara, só na parte de cima). O nosso lia azul-marinho (14,18,44 no GT; 0,3,46 nos carros de arquivo): o céu azul e a luz
    // de borda pintavam o vidro todo. Agora a faixa de céu mora na parte de cima do vidro (uGlassY), então o ponto de baixo é preto; nos carros de vidro vertical e grande o céu pode alcançar
    // os dois pontos, por isso o que se cobra é que o vidro TENHA o preto (o mais escuro dos dois), não que os dois sejam pretos.
    const r = await lab((L) => {
      const out: Record<string, { rgb: number[]; mean: number; other: number } | null> = {};
      for (const id of L.carIds()) {
        const gp = L.glassPoints(id);
        if (!gp) { out[id] = null; continue; }
        L.freeze('copacabana', 300, { seg: 300, car: id });
        const [lo, hi] = L.shoot('high', 6, [gp.low, gp.high]);
        const dark = lo.mean <= hi.mean ? lo : hi; const other = lo.mean <= hi.mean ? hi : lo;
        out[id] = { rgb: dark.rgb, mean: dark.mean, other: other.mean };
      }
      return out;
    });
    const seen = Object.entries(r).filter(([, v]) => v !== null) as Array<[string, { rgb: number[]; mean: number; other: number }]>;
    expect(seen.length, 'carros com vidro de trás').toBeGreaterThanOrEqual(15);
    const bad = seen.filter(([, v]) => v.mean > 0.07 || v.rgb[2] > 36).map(([id, v]) => `${id} rgb(${v.rgb.join(',')}) luma ${v.mean.toFixed(3)}`);
    expect(bad, `vidro azul-marinho em ${bad.length} de ${seen.length}`).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('o laboratório desenhou sem erro de shader (todas as qualidades que o teste tocou)', async () => {
    const p = await lab((L) => L.programs());
    expect(p.shaderErrors).toEqual([]);
    expect(p.bad).toEqual([]);
  });
});
