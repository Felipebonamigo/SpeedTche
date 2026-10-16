// Unidades: a simulação fala em "unidades de mundo" (segmento = 200, meia pista = 2000, y em
// unidades); o renderizador fala em metros. Escala arcade deliberada: 6000 u/s (300 km/h no
// velocímetro) viram 120 m/s na tela, para a sensação de velocidade ser exagerada.
import { SEGMENT_LENGTH } from '../core/constants';
import { HEADING_PER_CURVE, trackTurnPerCurve } from '../core/track/turn';
import type { Track } from '../core/types';

/** x normalizado ±1 → ±7 m: pista de 14 m. */
export const ROAD_HALF_WIDTH_M = 7;
/** Um segmento (200 unidades) mede 4 m. */
export const SEGMENT_M = 4;
/**
 * Elevação: unidades de `y0`/`y1` → metros. 0,006 (o valor do pseudo-3D) dá rampas de 45% que
 * empinam a câmera de perseguição; 0,0025 dá 10–16%, morro de pista de corrida arcade.
 */
export const Y_SCALE = 0.0025;
/**
 * Escala LEGADA do giro (uma `curve: 4` de 100 segmentos ≈ 55°): a do 3D em toda pista até a M6; hoje só a da pista sem curva líquida. Mora no núcleo
 * (`core/track/turn.ts`) junto com a escala da pista.
 */
export { HEADING_PER_CURVE };

const turnCache = new WeakMap<Track, number>();

/**
 * M6 (a): radianos de giro por unidade de `curve` por segmento DESTA pista — a escala que faz a soma das curvas dar uma volta (±2π), a mesma do
 * contorno do minimapa (`trackOutline`, minimap.ts). Com ela a curva do 3D é a curva do mapa e a pista fecha. A física é 1D (z ao longo da pista) e
 * não lê o rumo; o núcleo só a usa na visada que abre as praças dos marcos (`core/track/sightline.ts`, T4). Pista sem curva líquida
 * (|Σ curve| < 1: uma reta, ou um S que se anula) fica na escala legada. A conta é do núcleo (`trackTurnPerCurve`); aqui, cacheada por pista.
 */
export function turnPerCurve(track: Track): number {
  let k = turnCache.get(track);
  if (k === undefined) {
    k = trackTurnPerCurve(track.segments);
    turnCache.set(track, k);
  }
  return k;
}

const Z_SCALE = SEGMENT_M / SEGMENT_LENGTH;

export function xToMeters(x: number): number { return x * ROAD_HALF_WIDTH_M; }
export function zToMeters(z: number): number { return z * Z_SCALE; }
export function yToMeters(y: number): number { return y * Y_SCALE; }
