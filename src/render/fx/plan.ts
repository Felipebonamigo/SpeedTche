// O plano de efeitos de cada degrau de qualidade (M5), em dados puros (sem three, sem DOM): quem usa é `effects.ts`, quem confere é
// `tests/fx-plan.test.ts`. Mesma ideia do `postfx/plan.ts`: o degrau SOBE em efeitos, nunca troca um por outro. Os números são
// PROVISÓRIOS (sem GPU aqui, docs/ondas/M/M5.md): o custo de verdade é do `--bench` do dono. `reduceEffects` (acessibilidade) tira
// o que pisca ou estoura (faíscas, POW, onda de choque, linhas, túnel) e deixa o que não pisca (bolhas de fumaça e marcas de pneu).
// V8 (docs/ondas/V8-efeitos.md): o POW é da opção "Efeitos de cartum" (`cartoon`); no padrão a batida é realista (fx/impact.ts: faíscas, lascas e
// flash, todos pelo fator `sparks`).
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
  /** V10 (HC2): riscos LARGOS de canto de tela por viewport (teto; `lines.ts`, `cornerStreak`), na mesma malha de traços. */
  cornerStreaks: number;
  /** V10 (HC2): fator de emissão dos jatos de fogo dos escapes (nitro e aceleração; `sparks.ts`, `emitExhaustFire`); 0 = nenhum. */
  exhaustFire: number;
  /** V10 (HC2): escala da poeira da terra e da areia (tamanho, vida e quantidade de bolhas): 1 = a de antes. */
  dustScale: number;
  /** V22 F8: nuvens de poeira por segundo por carro na trilha contínua (terra, areia, grama e a própria estrada de terra), a 100 m/s; fica em "Reduzir efeitos" (não pisca). */
  trail: number;
  /** V22 F8: partículas ambientes por viewport (poeira em suspensão: pontos de alfa baixo no pool de poeira, sem chamada nova); 0 em "Reduzir efeitos". */
  ambient: number;
  /** Anel da largada e do engate do nitro. */
  shockwave: boolean;
  /** O "POW" da batida (e o leque de faíscas de quadrinho): só com "Efeitos de cartum". */
  pow: boolean;
}

/** Por degrau (baixa, média, alta, ultra). */
const SPARKS = [0.5, 0.75, 1, 1] as const;
const SMOKE = [0.5, 0.8, 1, 1] as const;
const MARKS = [192, 640, 1280, 2048] as const;
const SPEED_LINES = [14, 24, 36, 48] as const;
const DRAFT_LINES = [0, 10, 16, 24] as const;
const CORNER_STREAKS = [8, 12, 16, 20] as const;
const EXHAUST_FIRE = [0.6, 0.8, 1, 1] as const;
/** V22 F8: nuvens/s da trilha de poeira por carro (4 jogadores × taxa × vida máxima ≈ 1,6 s cabem no pool de 900 com folga) e ambientes por viewport. */
const TRAIL = [56, 80, 100, 100] as const;
const AMBIENT = [10, 12, 14, 16] as const;

const ORDER: readonly Quality[] = ['low', 'medium', 'high', 'ultra'];

export function fxPlan(q: Quality, reduceEffects: boolean, viewports = 1, cartoon = false): FxPlan {
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
    // V10 (HC2): "Efeitos de cartum" acende a versão ainda mais exagerada (1,5× riscos e fogo, poeira maior); "Reduzir efeitos" mantém o de antes (nada novo, poeira de 1).
    cornerStreaks: reduceEffects ? 0 : Math.floor(CORNER_STREAKS[i] * split * (cartoon ? 1.5 : 1)),
    exhaustFire: reduceEffects ? 0 : EXHAUST_FIRE[i] * (cartoon ? 1.5 : 1),
    dustScale: reduceEffects ? 1 : cartoon ? 2.3 : 1.8,
    trail: TRAIL[i],
    ambient: reduceEffects ? 0 : AMBIENT[i],
    shockwave: !reduceEffects && atLeast(q, 'medium'),
    pow: !reduceEffects && cartoon,
  };
}
