// Linha de visada da câmera de perseguição até um marco turístico, no núcleo e sem trigonometria: as praças e os
// mirantes (plazas.ts) são abertos onde a visada de quem chega cruza a faixa dos prédios da beira — do lado do marco
// e, quando a aproximação faz curva, do outro lado (a visada atravessa a parte de dentro da curva). É a mesma conta do
// renderizador (render/scenery/sight.ts), simplificada: a câmera na linha central, um ponto do marco, a faixa dos
// prédios no lugar da grade de alturas. O builder chama durante a montagem da pista (a colisão depende disto), então
// tudo aqui é soma, produto e raiz — iguais em toda máquina (o giro de cada segmento vem da série de Taylor em passos
// pequenos). O giro é o da pista (turn.ts, a mesma escala do 3D e do minimapa desde a M6; até a T4 era o legado).
import type { Track } from '../types';
import { trackTurnPerCurve } from './turn';

/**
 * O que a conta precisa do renderizador e da conta de enquadramento (o núcleo não importa o renderizador;
 * `tests/landmarks-pracas.test.ts` confere cada número com render/units.ts e render/scenery/sight.ts).
 */
export const SIGHT_MODEL = {
  /** Metros por segmento (render/units.ts). O giro por unidade de curva é o da pista (turn.ts, `trackTurnPerCurve`). */
  segmentM: 4,
  /** Tangente da meia largura do quadro que conta (os 80% do meio, 16:9, FOV na velocidade da conta: SIGHT_TAN_H). */
  tanH: 1.04,
  /** Profundidade (m) até onde a névoa deixa ler o marco, por período (um pouco aquém da de sight.ts). */
  depthM: { day: 490, dusk: 545, night: 380 },
  /** Distância (m) que a câmera anda no mínimo de tela que a praça garante: 2,5 s (LANDMARK_SIGHT_MIN) × 96 m/s × 1,1. */
  needM: 264,
  /** A faixa dos prédios da beira (m de lado): fachada na borda de colisão (8,75–10 m) até o fundo (~45 m). */
  bandM: [9, 45] as const,
} as const;

/** Linha central desenrolada (duas voltas: o segmento i é medido na segunda, k = i + n) com o rumo de cada segmento. */
export interface Centerline {
  readonly n: number;
  /** Início de cada segmento (m). */
  readonly px: Float64Array;
  readonly pz: Float64Array;
  /** Seno e cosseno do rumo no início de cada segmento (frente = (sen, −cos); direita = (cos, sen)). */
  readonly hs: Float64Array;
  readonly hc: Float64Array;
}

/** Maior passo da série (rad): com |d| ≤ 0,03 o erro dela é < 1e−13. */
const STEP_RAD = 0.03;

/**
 * Giro de (s, c) por `d`. Com a escala da pista um segmento gira até ~0,34 rad (aracaju): o ângulo é dividido em passos
 * de ≤ 0,03 rad, cada um pela série, e os passos se compõem (produto de giros) antes de girar (s, c).
 */
function rotate(s: number, c: number, d: number): [number, number] {
  const ad = d < 0 ? -d : d;
  const steps = ad > STEP_RAD ? Math.ceil(ad / STEP_RAD) : 1;
  const e = d / steps; const e2 = e * e;
  const ce = 1 - e2 / 2 + (e2 * e2) / 24;
  const se = e * (1 - e2 / 6 + (e2 * e2) / 120);
  let sd = se; let cd = ce;
  for (let i = 1; i < steps; i++) { const t = sd * ce + cd * se; cd = cd * ce - sd * se; sd = t; }
  const ns = s * cd + c * sd; const nc = c * cd - s * sd;
  const m = Math.sqrt(ns * ns + nc * nc);
  return [ns / m, nc / m];
}

/** A pista desenrolada como o renderizador faz (render/scenery/sight.ts, unrollTrack, na escala da pista), sem seno nem cosseno. */
export function centerline(track: Track): Centerline {
  const segs = track.segments; const n = segs.length;
  const len = 2 * n + 1;
  const px = new Float64Array(len); const pz = new Float64Array(len);
  const hs = new Float64Array(len); const hc = new Float64Array(len);
  const turn = trackTurnPerCurve(segs);
  let s = 0; let c = 1;
  for (let k = 0; k < len; k++) {
    hs[k] = s; hc[k] = c;
    if (k + 1 === len) break;
    const d = segs[k % n].curve * turn;
    // Anda pelo rumo do meio do segmento e gira o rumo inteiro para o próximo.
    const [ms, mc] = rotate(s, c, d / 2);
    px[k + 1] = px[k] + SIGHT_MODEL.segmentM * ms; pz[k + 1] = pz[k] - SIGHT_MODEL.segmentM * mc;
    [s, c] = rotate(s, c, d);
  }
  return { n, px, pz, hs, hc };
}

/** O que a visada pede para um lugar de marco: quanto ele fica no quadro e as células da faixa dos prédios cruzadas. */
export interface SightNeed {
  /** Metros que a câmera anda com o marco no quadro e na névoa (até `needM`). */
  seenM: number;
  /** Por lado (0 = esquerda, 1 = direita), o primeiro e o último segmento (k desenrolado) cruzados pela visada. */
  cross: [[number, number], [number, number]];
}

/**
 * A câmera de perseguição vem pela linha central até o marco (um ponto a `lat` m do centro, + = direita, no segmento
 * desenrolado `k`) e para quando ele já ficou `needM` no quadro (de 2 em 2 segmentos, de perto para longe), ou quando
 * passa da névoa, ou antes de `minCam` (o primeiro de cada marco: a câmera começa depois da largada). Cada visada conta
 * e marca os segmentos em que cruza a faixa dos prédios de cada lado.
 */
export function sightNeed(line: Centerline, k: number, lat: number, depthM: number, minCam: number): SightNeed {
  const { px, pz, hs, hc } = line;
  const [bandIn, bandOut] = SIGHT_MODEL.bandM;
  const tx = px[k] + lat * hc[k]; const tz = pz[k] + lat * hs[k];
  const cross: SightNeed['cross'] = [[Infinity, -Infinity], [Infinity, -Infinity]];
  const stepM = 2 * SIGHT_MODEL.segmentM;
  let seenM = 0;
  for (let j = k - 1; j >= Math.max(1, minCam) && seenM < SIGHT_MODEL.needM; j -= 2) {
    const vx = tx - px[j]; const vz = tz - pz[j];
    const depth = vx * hs[j] - vz * hc[j];
    if (depth > depthM) break;
    const side = vx * hc[j] + vz * hs[j];
    if (depth < 1 || (side < 0 ? -side : side) > depth * SIGHT_MODEL.tanH) continue;
    seenM += stepM;
    // A visada, de 4 em 4 m: segmento em que cada ponto cai (anda pelos planos de início) e a lateral nele.
    const dist = Math.sqrt(vx * vx + vz * vz);
    const steps = Math.ceil(dist / SIGHT_MODEL.segmentM);
    let q = j;
    for (let m = 1; m < steps; m++) {
      const t = m / steps;
      const wx = px[j] + vx * t; const wz = pz[j] + vz * t;
      while (q + 1 < k + 4 && (wx - px[q + 1]) * hs[q + 1] - (wz - pz[q + 1]) * hc[q + 1] >= 0) q++;
      while (q > 1 && (wx - px[q]) * hs[q] - (wz - pz[q]) * hc[q] < 0) q--;
      const l = (wx - px[q]) * hc[q] + (wz - pz[q]) * hs[q];
      const al = l < 0 ? -l : l;
      if (al < bandIn || al > bandOut) continue;
      const r = cross[l < 0 ? 0 : 1];
      if (q < r[0]) r[0] = q;
      if (q > r[1]) r[1] = q;
    }
  }
  return { seenM, cross };
}

/** Até quantos segmentos para cada lado a pegada é conferida contra a pista (o LANDMARK_VIEW do layout). */
const ROAD_VIEW = 300;

/** Até onde (m) o eixo de um marco comprido pode chegar do resto da pista: os 26 m do layout mais a meia largura da ponte (~10 m). */
const AXIS_GAP_M = 36;

/**
 * O lugar do marco (o ponto a `lat` m do centro no segmento desenrolado `k`) está longe do resto da pista? Com o traçado do mapa a pista volta
 * perto de si mesma (grampo, laço, o lado de dentro de uma curva longa): o layout (render/scenery/layout.ts) não põe pegada a menos de 26 m de
 * nenhum trecho a ±300 segmentos, e a praça aberta ali fica sem marco. Pede que nenhum ponto da linha central chegue a menos de `minM` do
 * ponto; num marco comprido e estreito (`halfM`: meia ponte, ao longo da pista), a menos de AXIS_GAP_M do eixo dele, de 20 em 20 m.
 */
export function clearOfRoad(line: Centerline, k: number, lat: number, minM: number, halfM = 0): boolean {
  const { px, pz, hs, hc } = line;
  const tx = px[k] + lat * hc[k]; const tz = pz[k] + lat * hs[k];
  const lo = Math.max(0, k - ROAD_VIEW); const hi = Math.min(px.length - 1, k + ROAD_VIEW);
  const steps = halfM > 0 ? Math.ceil(halfM / 20) : 0;
  for (let a = -steps; a <= steps; a++) {
    // Ao longo da pista no segmento k: frente = (sen, −cos).
    const t = steps ? (a * halfM) / steps : 0;
    const qx = tx + t * hs[k]; const qz = tz - t * hc[k];
    const gap = steps ? AXIS_GAP_M : minM;
    const gap2 = gap * gap;
    for (let q = lo; q <= hi; q++) {
      const dx = px[q] - qx; const dz = pz[q] - qz;
      if (dx * dx + dz * dz < gap2) return false;
    }
  }
  return true;
}
