// Escala do giro da pista (M6, T4): quantos radianos uma unidade de `curve` gira por segmento. Mora no núcleo porque
// a visada que abre as praças dos marcos (sightline.ts) precisa da mesma curva que o 3D desenha; o renderizador
// (render/units.ts, `turnPerCurve`) só a guarda em cache. Uma divisão por soma: igual em toda máquina.
import type { Segment } from '../types';

/**
 * Escala LEGADA (uma `curve: 4` de 100 segmentos ≈ 55°): a do 3D em toda pista até a M6, e hoje só a da pista sem curva
 * líquida (uma reta, ou um S que se anula), que não tem volta para fechar.
 */
export const HEADING_PER_CURVE = 0.0035;

/**
 * Radianos de giro por unidade de `curve` por segmento desta pista: a escala que faz a soma das curvas dar uma volta (±2π), a mesma do contorno do
 * minimapa. Com |Σ curve| < 1, a legada.
 */
export function trackTurnPerCurve(segments: readonly Pick<Segment, 'curve'>[]): number {
  let sum = 0;
  for (const s of segments) sum += s.curve;
  const abs = sum < 0 ? -sum : sum;
  return abs < 1 ? HEADING_PER_CURVE : (2 * Math.PI) / abs;
}
