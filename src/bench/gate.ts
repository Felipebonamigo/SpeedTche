// O gate de desempenho por CONTAGEM (onda L, L2): chamadas de desenho, triângulos, passes e pixels de pós por viewport, por
// qualidade e por cena. É o que dá para provar sem GPU: `renderer.info` e os alvos do pipeline, no swiftshader. Os limites são
// PROVISÓRIOS (contagem medida + margem; docs/ondas/L/L2.md §11): quem diz se um degrau cabe no Deck é o FPS do `--bench` do dono,
// que nenhum número daqui substitui. Puro: sem DOM e sem three (tests/postfx-plan.test.ts; a medição em GL é tests/gl-render.test.ts).
import type { Quality } from '../game/contracts';

/** O que o renderizador conta por viewport (os nomes são os de `DebugInfo.viewports`, src/render/renderer.ts). */
export interface GateViewport { calls: number; triangles: number; passes: number; postPx: number; targetW: number; targetH: number }
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

/** Limites provisórios por cena e qualidade (preenchidos com a contagem medida + margem). */
export const GATE_LIMITS: GateLimits = {};

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

/** O pior viewport de uma amostra em cada conta. */
function worst(s: GateSample): { calls: number; passes: number; postPxRatio: number } {
  let calls = 0; let passes = 0; let postPxRatio = 0;
  for (const v of s.viewports) {
    calls = Math.max(calls, v.calls); passes = Math.max(passes, v.passes);
    postPxRatio = Math.max(postPxRatio, v.postPx / Math.max(1, v.targetW * v.targetH));
  }
  return { calls, passes, postPxRatio };
}

/**
 * A ordem de custo entre degraus vizinhos, por cena: passes e pixels de pós nunca caem de um degrau para o seguinte, e a Média não
 * chama mais que a Alta (o Ultra pode: o AO em resolução cheia não acrescenta chamadas, mas a Alta ganha o desfoque radial só no passe).
 */
export function checkCostOrder(samples: readonly GateSample[]): string[] {
  const out: string[] = [];
  const scenes = [...new Set(samples.map((s) => s.scene))];
  for (const scene of scenes) {
    const byLevel = new Map<Quality, ReturnType<typeof worst>>();
    for (const s of samples) if (s.scene === scene) byLevel.set(s.quality, worst(s));
    for (let i = 1; i < LEVELS.length; i++) {
      const a = byLevel.get(LEVELS[i - 1]); const b = byLevel.get(LEVELS[i]);
      if (!a || !b) continue;
      const lo = LEVELS[i - 1]; const hi = LEVELS[i];
      if (a.passes > b.passes) out.push(`${scene}: passes ${lo} (${a.passes}) > ${hi} (${b.passes})`);
      if (a.postPxRatio > b.postPxRatio + 1e-9) out.push(`${scene}: pixels de pós ${lo} (${a.postPxRatio.toFixed(2)}×) > ${hi} (${b.postPxRatio.toFixed(2)}×)`);
      if (lo === 'medium' && a.calls > b.calls) out.push(`${scene}: chamadas ${lo} (${a.calls}) > ${hi} (${b.calls})`);
    }
  }
  return out;
}
