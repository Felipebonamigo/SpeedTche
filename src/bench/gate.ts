// O gate de desempenho por CONTAGEM (onda L, L2): chamadas de desenho, triângulos, passes e pixels de pós por viewport, por
// qualidade e por cena. É o que dá para provar sem GPU: `renderer.info` e os alvos do pipeline, no swiftshader. Os limites são
// PROVISÓRIOS (contagem medida + margem; docs/ondas/L/L2.md §11): quem diz se um degrau cabe no Deck é o FPS do `--bench` do dono,
// que nenhum número daqui substitui. Puro: sem DOM e sem three (tests/postfx-plan.test.ts; a medição em GL é tests/gl-render.test.ts).
import type { Quality } from '../game/contracts';

/** O que o renderizador conta por viewport (os nomes são os de `DebugInfo.viewports`, src/render/renderer.ts). */
export interface GateViewport { calls: number; triangles: number; passes: number; postPx: number; targetW: number; targetH: number; samples: number }
export interface GateSample { scene: string; quality: Quality; viewports: GateViewport[] }

/** `postPxRatio` = pixels escritos pelos passes de pós ÷ pixels do alvo da cena: não depende da resolução em que se mediu. */
export interface GateLimit { calls: number; triangles: number; passes: number; postPxRatio: number }
export type GateLimits = Record<string, Partial<Record<Quality, GateLimit>>>;

/** As cenas do gate: pista e jogadores (as mesmas do bench, `BENCH_SCENES`, mais a noite de Sampa com 4). */
export const GATE_SCENES: ReadonlyArray<{ id: string; track: string; humans: number }> = [
  { id: 'copa-1p', track: 'copacabana', humans: 1 },
  { id: 'copa-2p', track: 'copacabana', humans: 2 },
  { id: 'copa-4p', track: 'copacabana', humans: 4 },
  { id: 'sampa-4p', track: 'sampa_noite', humans: 4 },
];

/**
 * Limites provisórios por cena e qualidade: a contagem medida no swiftshader (10/10/2026, tools/render-harness.lab.ts, 640×360, a
 * largada de 300 ticks) com margem de 25% em chamadas e triângulos, +1 passe (o desfoque radial só liga em velocidade alta) e +1× no
 * preenchimento de pós (o mesmo motivo) mais 10%. A Baixa não tem pós: passes e pixels 0. NÃO são metas de FPS: quem diz se cabe no
 * Deck é o `--bench` do dono. Cena nova ou degrau novo: medir (`node tools/render-harness.collect.mjs`, docs/ondas/L/L2.md §11) e escrever aqui.
 */
// 10/10/2026: chamadas da copa subiram +1 a +5 com o lote `cutout` da L4 e os lotes de LOD1 da M4 (deliberado; triângulos dentro). Provisório até o bench do dono.
export const GATE_LIMITS: GateLimits = {
  'copa-1p': {
    low: { calls: 38, triangles: 173000, passes: 0, postPxRatio: 0 },
    medium: { calls: 80, triangles: 315000, passes: 5, postPxRatio: 5.8 },
    high: { calls: 84, triangles: 340000, passes: 5, postPxRatio: 7.1 },
    ultra: { calls: 85, triangles: 340000, passes: 5, postPxRatio: 8.7 },
  },
  'copa-2p': {
    low: { calls: 39, triangles: 174000, passes: 0, postPxRatio: 0 },
    medium: { calls: 77, triangles: 315000, passes: 5, postPxRatio: 5.8 },
    high: { calls: 83, triangles: 340000, passes: 5, postPxRatio: 7.1 },
    ultra: { calls: 84, triangles: 340000, passes: 5, postPxRatio: 8.7 },
  },
  'copa-4p': {
    low: { calls: 42, triangles: 174000, passes: 0, postPxRatio: 0 },
    medium: { calls: 79, triangles: 316000, passes: 5, postPxRatio: 5.8 },
    high: { calls: 81, triangles: 340000, passes: 4, postPxRatio: 5.4 },
    ultra: { calls: 85, triangles: 340000, passes: 5, postPxRatio: 8.7 },
  },
  'sampa-4p': {
    low: { calls: 50, triangles: 160000, passes: 0, postPxRatio: 0 },
    medium: { calls: 89, triangles: 306000, passes: 5, postPxRatio: 5.8 },
    high: { calls: 88, triangles: 323000, passes: 4, postPxRatio: 5.4 },
    ultra: { calls: 92, triangles: 323000, passes: 5, postPxRatio: 8.7 },
  },
};


const LEVELS: readonly Quality[] = ['low', 'medium', 'high', 'ultra'];

/** Violações de limite (vazio = dentro). Amostra sem limite escrito é violação: limite que falta não passa em silêncio. */
export function checkGate(samples: readonly GateSample[], limits: GateLimits): string[] {
  const out: string[] = [];
  for (const s of samples) {
    const id = `${s.scene}/${s.quality}`;
    const limit = limits[s.scene]?.[s.quality];
    if (!limit) { out.push(`sem limite para ${id}`); continue; }
    s.viewports.forEach((v, i) => {
      const at = `${id} viewport ${i}`;
      if (v.calls > limit.calls) out.push(`${at}: chamadas ${v.calls} > ${limit.calls}`);
      if (v.triangles > limit.triangles) out.push(`${at}: triângulos ${v.triangles} > ${limit.triangles}`);
      if (v.passes > limit.passes) out.push(`${at}: passes ${v.passes} > ${limit.passes}`);
      const target = Math.max(1, v.targetW * v.targetH);
      const ratio = v.postPx / target;
      if (ratio > limit.postPxRatio) out.push(`${at}: pixels de pós ${v.postPx} = ${ratio.toFixed(2)}× o alvo > ${limit.postPxRatio}×`);
    });
  }
  return out;
}

/** Preenchimento por pixel do viewport: a cena (× as amostras do MSAA) mais o que os passes de pós escrevem. */
export function fillCost(v: GateViewport): number {
  const target = Math.max(1, v.targetW * v.targetH);
  return Math.max(1, v.samples) + v.postPx / target;
}

/**
 * A ordem de custo entre degraus vizinhos, por cena: o preenchimento por pixel (`fillCost`) nunca cai de um degrau para o seguinte. Não
 * se compara passe a passe nem pixel de pós a pixel de pós: a Média troca o MSAA por um FXAA (um passe cheio a mais, nenhuma amostra a
 * mais) e pode escrever mais pixels de pós que a Alta sem AO, e a Alta ainda custa mais pelas amostras do alvo.
 */
export function checkCostOrder(samples: readonly GateSample[]): string[] {
  const out: string[] = [];
  const scenes = [...new Set(samples.map((s) => s.scene))];
  for (const scene of scenes) {
    const byLevel = new Map<Quality, number>();
    for (const s of samples) if (s.scene === scene) byLevel.set(s.quality, Math.max(...s.viewports.map(fillCost)));
    for (let i = 1; i < LEVELS.length; i++) {
      const lo = byLevel.get(LEVELS[i - 1]); const hi = byLevel.get(LEVELS[i]);
      if (lo === undefined || hi === undefined) continue;
      if (lo > hi + 1e-9) out.push(`${scene}: preenchimento ${LEVELS[i - 1]} (${lo.toFixed(2)}×) > ${LEVELS[i]} (${hi.toFixed(2)}×)`);
    }
  }
  return out;
}
