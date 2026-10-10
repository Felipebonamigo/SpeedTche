// O plano de efeitos de cada degrau de qualidade (M5), em dados puros (sem three, sem DOM): quem usa é `effects.ts`, quem confere é
// `tests/fx-plan.test.ts`. Mesma ideia do `postfx/plan.ts`: o degrau SOBE em efeitos, nunca troca um por outro. Os números são
// PROVISÓRIOS (sem GPU aqui, docs/ondas/M/M5.md): o custo de verdade é do `--bench` do dono. `reduceEffects` (acessibilidade) tira
// o que pisca ou estoura (faíscas, POW, onda de choque, linhas, túnel) e deixa o que não pisca (bolhas de fumaça e marcas de pneu).
import type { Quality } from '../../game/contracts';
import { atLeast } from '../../game/quality';

export interface FxPlan {
  /** Faíscas esticadas (roda, batida, raspão, escape do nitro): fator de emissão 0..1. */
  sparks: number;
  /** As faíscas da derrapagem nas 3 cores (azul, laranja, roxa). */
  wheelSparks: boolean;
  /** Bolhas de fumaça do pneu, da freada e da poeira da grama: fator de emissão 0..1. */
  smoke: number;
  /** Teto de pontos das marcas de pneu (o anel de `MarkBuffer`); 0 = sem marca. */
  marks: number;
  /** Linhas de velocidade 3D por viewport (teto; `lines.ts` acende de 85% da máxima em diante). */
  speedLines: number;
  /** Traços do túnel de ar do vácuo por viewport (teto). */
  draftLines: number;
  /** Anel da largada e do engate do nitro. */
  shockwave: boolean;
  /** O "POW" da batida. */
  pow: boolean;
}

/** Por degrau (baixa, média, alta, ultra). */
const SPARKS = [0.5, 0.75, 1, 1] as const;
const SMOKE = [0.5, 0.8, 1, 1] as const;
const MARKS = [192, 640, 1280, 2048] as const;
const SPEED_LINES = [14, 24, 36, 48] as const;
const DRAFT_LINES = [0, 10, 16, 24] as const;

const ORDER: readonly Quality[] = ['low', 'medium', 'high', 'ultra'];

export function fxPlan(q: Quality, reduceEffects: boolean, viewports = 1): FxPlan {
  const i = Math.max(0, ORDER.indexOf(q));
  // Tela dividida em 3 ou 4: cada viewport tem um quarto dos pixels, e as linhas (as que mais enchem a tela) caem pela metade.
  const split = viewports >= 3 ? 0.5 : 1;
  const lines = (n: number) => (reduceEffects ? 0 : Math.floor(n * split));
  return {
    sparks: reduceEffects ? 0 : SPARKS[i],
    wheelSparks: !reduceEffects,
    smoke: SMOKE[i],
    marks: MARKS[i],
    speedLines: lines(SPEED_LINES[i]),
    draftLines: lines(DRAFT_LINES[i]),
    shockwave: !reduceEffects && atLeast(q, 'medium'),
    pow: !reduceEffects,
  };
}
