// Enquadramento dos marcos turísticos (docs/VISUAL.md, "Marcos turísticos"): quanto tempo um marco fica NA TELA de
// quem corre. A câmera de perseguição de verdade (camera.ts: altura, distância atrás do carro, ponto olhado, FOV na
// velocidade) anda pela linha central a uma velocidade de corrida e, a cada SIGHT_DT, conta o instante em que uma parte
// do marco (SIGHT_MIN_POINTS dos 7 pontos de amostra da caixa dele) está ao mesmo tempo
//   - dentro do quadro (na faixa do meio da largura: na beirada só se vê um pedaço passando),
//   - perto o bastante para a névoa deixar ler (a do resto do cenário, ou a mais fina do lote do horizonte),
//   - sem nada alto na frente perto da pista (prédio, arquibancada, box, outdoor: a grade de alturas do layout),
//   - e na janela que o runtime desenha (o RoadFrame da qualidade alta, cortado pela névoa).
// Geometria simples e determinística, sem raycast em malha; o relevo do terreno e a mata (posta depois) não entram.
// Puro: só contas sobre a linha central desenrolada.
import { REFERENCE_SPEED, SEGMENT_LENGTH } from '../../core/constants';
import type { Track } from '../../core/types';
import { CAMERA_POSES, CHASE_CAMERA, type CameraMode } from '../camera-base';
import { palette } from '../palette';
import { FRAME_AHEAD } from '../roadframe';
import { FOG_DENSITY } from '../sky';
import { SEGMENT_M, turnPerCurve, Y_SCALE } from '../units';

/**
 * Marcos no horizonte (skyline: Cristo, Pão de Açúcar, vulcão): a névoa deles conta a distância × HAZE_FOG_SCALE (lote
 * `haze` do runtime). Ficam a 400 m+ da pista e são vistos a 600–1.000 m; com a névoa do resto do cenário (0,0019/m)
 * chegariam 70–95% apagados. Com 0,55 entram na névoa (40–65%) como os planos do horizonte do terreno.
 */
export const HAZE_FOG_SCALE = 0.55;
/** O runtime não desenha cenário além de SCENERY_FOG_REACH / densidade da névoa (m ao longo da pista): já está apagado. */
export const SCENERY_FOG_REACH = 2.2;
/** Segmentos atrás do carro que o runtime ainda desenha (sombra e canto da tela). */
export const SCENERY_BEHIND_DRAW = 4;

/**
 * Velocidade da conta: 0,8 da máxima de referência = 96 m/s (a IA profissional corre a 0,55–0,88 da máxima em média,
 * docs/PISTAS.md, "v média"). O FOV abre com ela como no jogo (62° + 13° × 0,8 ≈ 72° na vertical).
 */
export const SIGHT_SPEED_FRAC = 0.8;
export const SIGHT_SPEED_MS = (REFERENCE_SPEED * SIGHT_SPEED_FRAC * SEGMENT_M) / SEGMENT_LENGTH;
/** Passo da simulação (s): 9,6 m de pista a 96 m/s. */
export const SIGHT_DT = 0.1;
/** Proporção do quadro: a mais estreita do jogo (1 jogador e a grade 2×2 são 16:9; 2 jogadores, 32:9). */
export const SIGHT_ASPECT = 16 / 9;
/** Só conta o ponto nos 80% do meio da largura do quadro: na beirada o marco só passa. */
export const SIGHT_FRAME_X = 0.8;
/** Névoa (FogExp2: 1 − e^−(ρ·d)²) até a qual o marco ainda se lê. */
export const SIGHT_FOG = 0.6;
/** Quantos dos 7 pontos de amostra do marco (ver `sightSeconds`) bastam no mesmo instante: um já é uma parte dele na tela. */
export const SIGHT_MIN_POINTS = 1;
/**
 * O mínimo (s) que todo marco tem de ficar à vista na aproximação (tests/landmarks-enquadramento.test.ts) e a meta da
 * busca do layout. 2,5 s a 96 m/s são ~240 m de pista: dá para notar e reconhecer o marco sem tirar o olho da pista. O do
 * horizonte (o cartão-postal: Cristo, Fuji, Uluru) é grande e visto de longe na névoa fina: pede mais.
 */
export const LANDMARK_SIGHT_MIN = { near: 2.5, far: 2.5, skyline: 4 } as const;
/** Passo (m) da linha de visada contra a grade de alturas (a grade tem 2 m × 1 segmento; o que tapa ocupa ≥ 3 segmentos). */
const RAY_STEP_M = 4;

/** O que tapa a vista: altura (m, 0 = nada) na célula do segmento `seg` (0..n−1), lado `side`, a `lat` m do centro. */
export type BlockHeight = (seg: number, side: number, lat: number) => number;

export interface SightRoad {
  readonly n: number;
  /** Linha central desenrolada em três voltas (o marco do segmento i é medido na do meio, k = i + n): início de cada segmento. */
  readonly px: Float64Array;
  readonly pz: Float64Array;
  /** Rumo (rad) no início de cada segmento, e o seno/cosseno dele. */
  readonly hd: Float64Array;
  readonly hs: Float64Array;
  readonly hc: Float64Array;
  /** Altura da pista (m) no início de cada segmento. */
  readonly py: Float64Array;
  /** Profundidade (m, no eixo da câmera) até onde a névoa deixa ler: o cenário e o lote do horizonte. */
  readonly fogM: number;
  readonly hazeM: number;
  /** Segmentos à frente do carro em que o runtime desenha o cenário. */
  readonly ahead: number;
  readonly block: BlockHeight;
  /** Lateral máxima (m) de algo alto na grade: a visada além dela não é conferida. */
  readonly blockLat: number;
  /** Soma acumulada de "segmento com algo alto" pela linha desenrolada (corte rápido: nada no caminho). */
  readonly blockCum: Int32Array;
}

/** Linha central desenrolada em três voltas: a pista do DSL não fecha em posição (o rumo fecha em 360°, M6), só a vizinhança vale. */
export function unrollTrack(track: Track, turn: number = turnPerCurve(track)): { px: Float64Array; pz: Float64Array; hd: Float64Array; py: Float64Array } {
  const segs = track.segments; const n = segs.length;
  const px = new Float64Array(3 * n + 1); const pz = new Float64Array(3 * n + 1); const hd = new Float64Array(3 * n + 1);
  const py = new Float64Array(3 * n + 1);
  for (let k = 0; k < 3 * n; k++) {
    const s = segs[k % n];
    const d = s.curve * turn;
    const a = hd[k] + d / 2;
    px[k + 1] = px[k] + SEGMENT_M * Math.sin(a); pz[k + 1] = pz[k] - SEGMENT_M * Math.cos(a); hd[k + 1] = hd[k] + d;
    py[k] = s.y0 * Y_SCALE;
  }
  py[3 * n] = segs[0].y0 * Y_SCALE;
  return { px, pz, hd, py };
}

/**
 * A pista pronta para a conta: linha desenrolada, a névoa do período dela na qualidade alta (a padrão) e a grade do
 * que tapa a vista (`hasBlock(seg)`: o segmento tem algo alto em algum lado).
 */
export function sightRoad(track: Track, block: BlockHeight, blockLat: number, hasBlock: (seg: number) => boolean, turn: number = turnPerCurve(track)): SightRoad {
  const n = track.segments.length;
  const { px, pz, hd, py } = unrollTrack(track, turn);
  const hs = new Float64Array(hd.length); const hc = new Float64Array(hd.length);
  for (let k = 0; k < hd.length; k++) { hs[k] = Math.sin(hd[k]); hc[k] = Math.cos(hd[k]); }
  const rho = FOG_DENSITY.high * palette(track.def.scenery, track.def.timeOfDay).fogDensity;
  // 1 − e^−(ρd)² = SIGHT_FOG  →  d = √(−ln(1 − SIGHT_FOG)) / ρ.
  const fogM = Math.sqrt(-Math.log(1 - SIGHT_FOG)) / rho;
  const ahead = Math.min(FRAME_AHEAD.high, Math.floor(SCENERY_FOG_REACH / rho / SEGMENT_M));
  const blockCum = new Int32Array(3 * n + 2);
  for (let q = 0; q <= 3 * n; q++) blockCum[q + 1] = blockCum[q] + (hasBlock(q % n) ? 1 : 0);
  return { n, px, pz, hd, hs, hc, py, fogM, hazeM: fogM / HAZE_FOG_SCALE, ahead, block, blockLat, blockCum };
}

/** Caixa do modelo (catalog.ts, `modelBounds`). */
export interface SightBounds { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number }

const TAN_V = Math.tan(((CHASE_CAMERA.baseFov + CHASE_CAMERA.speedFov * Math.min(1.2, SIGHT_SPEED_FRAC)) * Math.PI) / 360);
/** Tangente da meia largura do quadro que conta (os 80% do meio): a `lat` m de lado, o marco sai dele a `lat / SIGHT_TAN_H` m. */
export const SIGHT_TAN_H = TAN_V * SIGHT_ASPECT * SIGHT_FRAME_X;
/** Meia abertura vertical (tangente) e horizontal dos 80% do meio de cada câmera, na velocidade da conta (a Baixa é a de `TAN_V`). */
const TAN_V_BY: Readonly<Record<CameraMode, number>> = Object.fromEntries(
  (['high', 'low', 'hood', 'bumper'] as const).map((m) => [m, Math.tan(((CAMERA_POSES[m].baseFov + CAMERA_POSES[m].speedFov * Math.min(1.2, SIGHT_SPEED_FRAC)) * Math.PI) / 360)]),
) as Record<CameraMode, number>;
const SAMPLES = 7;
const SAMPLE_X = new Float64Array(SAMPLES); const SAMPLE_Y = new Float64Array(SAMPLES); const SAMPLE_Z = new Float64Array(SAMPLES);

/**
 * Segundos em que o marco posto no segmento `k` (desenrolado: a volta do meio), na fração `f`, a `x` m do centro
 * (+ = direita), com a base a `y` m do início do segmento e girado `yaw` (Placement do layout) fica à vista da câmera de
 * perseguição na aproximação: da entrada dele na janela do runtime até o carro passar. `haze`: a névoa do horizonte.
 * `lower`: quanto a câmera está abaixo da base (m; 0 = a base, `CAMERA_DYNAMICS.lower.max` = a mais baixa em velocidade).
 * `mode`: a câmera ativa (nc/cameras) — o corredor de visão muda com a altura, o recuo e o FOV; a omitida é a Baixa, a de antes (o layout dos marcos usa a Baixa).
 */
export function sightSeconds(road: SightRoad, k: number, f: number, x: number, y: number, yaw: number, b: SightBounds, haze: boolean, from = -Infinity, lower = 0, mode: CameraMode = 'low'): number {
  const cam = CAMERA_POSES[mode];
  const tanV = TAN_V_BY[mode];
  const tanH = tanV * SIGHT_ASPECT * SIGHT_FRAME_X;
  const { px, pz, hd, hs, hc, py } = road;
  // Centro e giro como em runtime.place: lateral somada nas duas pontas do segmento e interpolada.
  const ax = px[k] + x * hc[k]; const az = pz[k] + x * hs[k];
  const X = ax + (px[k + 1] + x * hc[k + 1] - ax) * f;
  const Z = az + (pz[k + 1] + x * hs[k + 1] - az) * f;
  const Y = py[k] + y;
  const th = yaw - (hd[k] + (hd[k + 1] - hd[k]) * f);
  const ct = Math.cos(th); const st = Math.sin(th);
  const H = b.maxY;
  const mx = (b.minX + b.maxX) / 2; const mz = (b.minZ + b.maxZ) / 2;
  // Pontos de amostra: o centro embaixo, a meia altura e no alto (o pé da torre de 350 m que não cabe no quadro de
  // perto, o Cristo no morro) e, a meio caminho do centro para as faces que quem chega vê (+X, a da pista; +Z, a de quem
  // vem), três ao longo da face da pista e um na de quem vem, a 40% da altura — dentro do morro cônico, na ponta da
  // ponte de 1 km, na parede do tepui de 2 km.
  const fx = (mx + b.maxX) / 2; const zAhead = (mz + b.minZ) / 2; const zBack = (mz + b.maxZ) / 2;
  const local: Array<[number, number, number]> = [[mx, 0.2 * H, mz], [mx, 0.5 * H, mz], [mx, 0.85 * H, mz], [fx, 0.4 * H, mz], [fx, 0.4 * H, zAhead], [fx, 0.4 * H, zBack], [mx, 0.4 * H, zBack]];
  for (let m = 0; m < SAMPLES; m++) {
    const [lx, ly, lz] = local[m];
    // Giro do runtime: x' = cos θ·x + sen θ·z, z' = −sen θ·x + cos θ·z.
    SAMPLE_X[m] = X + ct * lx + st * lz; SAMPLE_Y[m] = Y + ly; SAMPLE_Z[m] = Z - st * lx + ct * lz;
  }
  // Até onde a pegada vai ao longo da pista (ponte de 1 km): a visada é conferida até lá.
  const reach = Math.ceil(Math.max(-b.minX, b.maxX, -b.minZ, b.maxZ) / SEGMENT_M) + 2;
  const fogM = haze ? road.hazeM : road.fogM;
  const fog2 = fogM * fogM;
  const step = (SIGHT_SPEED_MS * SIGHT_DT) / SEGMENT_M;
  const anchor = k + f;
  const backS = cam.back / SEGMENT_M; const lookS = cam.lookAhead / SEGMENT_M;
  const lookDist = cam.back + cam.lookAhead;
  let seen = 0;
  // O runtime desenha o marco enquanto o segmento dele está entre SCENERY_BEHIND_DRAW atrás e `ahead` à frente do carro.
  for (let s = Math.max(k - road.ahead, from); s < k + SCENERY_BEHIND_DRAW + 1; s += step) {
    const j = Math.floor(s); const u = s - j;
    const cx = px[j] + (px[j + 1] - px[j]) * u; const cz = pz[j] + (pz[j + 1] - pz[j]) * u;
    const h = hd[j] + (hd[j + 1] - hd[j]) * u;
    const sh = Math.sin(h); const ch = Math.cos(h);
    const ry = roadY(py, s);
    const camY = roadY(py, s - backS) + cam.height - lower;
    const lookY = ry + cam.lookY + Math.max(-4, Math.min(4, (roadY(py, s + lookS) - ry) * 0.6));
    // Câmera atrás do carro no rumo dele; olha o ponto à frente. Base: D (eixo), R (direita), U = R × D.
    const camX = cx - cam.back * sh; const camZ = cz + cam.back * ch;
    const dyLook = lookY - camY;
    const inv = 1 / Math.hypot(lookDist, dyLook);
    const Dx = sh * lookDist * inv; const Dy = dyLook * inv; const Dz = -ch * lookDist * inv;
    const Rx = ch; const Rz = sh;
    const Ux = -Rz * Dy; const Uy = Rz * Dx - Rx * Dz; const Uz = Rx * Dy;
    const camSeg = Math.floor(s - backS);
    let ok = 0;
    for (let m = 0; m < SAMPLES && ok < SIGHT_MIN_POINTS; m++) {
      const dx = SAMPLE_X[m] - camX; const dy = SAMPLE_Y[m] - camY; const dz = SAMPLE_Z[m] - camZ;
      const zc = dx * Dx + dy * Dy + dz * Dz;
      if (zc < 0.3 || zc * zc > fog2) continue;
      const xc = dx * Rx + dz * Rz;
      if (Math.abs(xc) > zc * tanH) continue;
      const yc = dx * Ux + dy * Uy + dz * Uz;
      if (Math.abs(yc) > zc * tanV) continue;
      if (blocked(road, camX, camY, camZ, SAMPLE_X[m], SAMPLE_Y[m], SAMPLE_Z[m], camSeg, Math.ceil(anchor) + reach)) continue;
      ok++;
    }
    if (ok >= SIGHT_MIN_POINTS) seen += SIGHT_DT;
  }
  return Math.round(seen * 1000) / 1000;
}

/** Altura da pista (m) no ponto `t` (segmentos, desenrolado). Exportada para a legenda dos marcos (render/caption/). */
export function roadY(py: Float64Array, t: number): number {
  const q = Math.floor(t);
  return py[q] + (py[q + 1] - py[q]) * (t - q);
}

/**
 * Algo alto da grade na linha de visada? Anda pela linha (horizontal) de RAY_STEP_M em RAY_STEP_M, acha o segmento e a
 * lateral de cada ponto (plano de início do segmento, andando a partir do da câmera) e compara a altura da visada ali,
 * acima da pista, com a do que estiver na célula. Para quando a visada passa da lateral de tudo o que é alto.
 * Exportada para a legenda dos marcos (render/caption/): a mesma conta com a câmera de cada jogador.
 */
export function blocked(road: SightRoad, cx: number, cy: number, cz: number, tx: number, ty: number, tz: number, q0: number, qEnd: number): boolean {
  const { px, pz, hs, hc, py, n } = road;
  const lo = Math.max(0, q0 - 2); const hi = Math.min(3 * n - 1, Math.max(q0, qEnd) + 2);
  if (road.blockCum[hi + 1] - road.blockCum[lo] === 0) return false;
  const dx = tx - cx; const dy = ty - cy; const dz = tz - cz;
  const steps = Math.ceil(Math.hypot(dx, dz) / RAY_STEP_M);
  let q = Math.max(lo, Math.min(hi, q0));
  for (let m = 1; m < steps; m++) {
    const t = m / steps;
    const wx = cx + dx * t; const wz = cz + dz * t;
    while (q < hi && (wx - px[q + 1]) * hs[q + 1] - (wz - pz[q + 1]) * hc[q + 1] >= 0) q++;
    while (q > lo && (wx - px[q]) * hs[q] - (wz - pz[q]) * hc[q] < 0) q--;
    const lat = (wx - px[q]) * hc[q] + (wz - pz[q]) * hs[q];
    const al = Math.abs(lat);
    if (al > road.blockLat + 10) return false;
    const top = road.block(q % n, lat < 0 ? -1 : 1, al);
    if (top > 0 && cy + dy * t - py[q] < top) return true;
  }
  return false;
}


// ───────────────────────────── Câmera dinâmica (M5) ─────────────────────────────
// Os deslocamentos que a câmera de perseguição faz ALÉM da base (`CHASE_CAMERA`, que não muda) e o limite de cada um. Moram aqui, ao lado da
// conta de enquadramento, porque o que se prova é o mesmo: o que a câmera vê e onde ela está. `camera.ts` só aplica o modelo; os testes
// (tests/camera-dinamica.test.ts) varrem os limites. Tudo puro (sem three, sem DOM) e determinístico.
// Garantias, e como valem:
//   - cenário: a lateral que a órbita acrescenta fica em `max(orbit.lateralFree, a da câmera-base)`; nas 109 pistas nenhuma célula do que
//     tapa a vista (prédio, arquibancada, box, outdoor) nem sólido do núcleo está a menos de 6 m do eixo (medido: 6 em Copacabana, 8 nas
//     outras). Árvore e poste (a 9 m+) não entram na grade e ficam além do corredor com folga;
//   - chão: a câmera nunca desce abaixo de `CHASE_CAMERA.height − lower.max` (1,73 m) sobre a pista sob ela;
//   - carros: a órbita recua até a câmera sair da caixa de qualquer vizinho (e da do próprio carro); só ela se aproxima de um carro, a base
//     fica 7,8 m atrás do dono dela, e a base não é desta frente;
//   - FOV: o sobrepasso da mola é cortado em `fov.springMax` e a soma de tudo cabe em `fov.hardMax`.
// A mola de FOV só ABRE o quadro e a câmera baixa por até 0,32 m: a conta de enquadramento dos marcos (`sightSeconds(..., lower)`)
// continua valendo com a base, e um teste mede que baixar não custa visada além do muro que já a escondia.

export const CAMERA_DYNAMICS = {
  /** Câmera mais baixa em velocidade: até `max` m abaixo da base, entre `from` e `to` (frações da velocidade máxima). */
  lower: { max: 0.32, from: 0.55, to: 1 },
  /** Mola do FOV de nitro: sobrepasso máximo (°), teto absoluto do FOV (°), tranco no engate (°/s), frequência (rad/s) e amortecimento. */
  fov: { springMax: 5, hardMax: 92, kick: 55, omega: 14, zeta: 0.45 },
  /** Tremor fino: a partir de `from` da máxima, até `offset` m e `roll` rad. */
  tremor: { from: 0.9, offset: 0.02, roll: 0.003 },
  /**
   * Cresta de morro: o quanto a câmera flutua (m), a queda de inclinação que conta como cresta (e a mínima de reserva), a distância mínima entre duas
   * (segmentos), o máximo por volta, e as janelas (m) de subida antes e de descida depois dela.
   */
  crest: { lift: 0.5, minDrop: 0.04, fallbackDrop: 0.02, spacing: 40, max: 4, rise: 10, fall: 25 },
  /** Órbita da vitória: guinada máxima (rad), duração (s), raio final (m), elevação (m), lateral livre (m) e a caixa do carro (m) com a folga da câmera. */
  orbit: { yawMax: 1.26, seconds: 2.4, radiusMin: 5.4, lift: 0.5, lateralFree: 5.5, halfLength: 2, halfWidth: 0.91, marginLength: 1, marginWidth: 0.8 },
} as const;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number): number => { const t = clamp01(v); return t * t * (3 - 2 * t); };

/** Quanto a câmera desce (m) na fração `speedFrac` da velocidade máxima: 0 até `from`, `max` a partir de `to`, suave no meio. */
export function cameraLowering(speedFrac: number): number {
  const { max, from, to } = CAMERA_DYNAMICS.lower;
  return max * smooth((speedFrac - from) / (to - from));
}

/**
 * Os deslocamentos de cada uma das 4 câmeras (nc/cameras), todos com limite e todos testados (tests/cameras.test.ts):
 *   - `lowerMax`: quanto desce em velocidade (m); as presas ao carro não descem (o olho é fixo no carro);
 *   - `crest`: fração da flutuação de cresta (as presas andam com o carro: 0, senão o olho sairia de dentro dele);
 *   - `orbit`: faz a órbita da vitória. Presa ao carro, a câmera passa à Alta enquanto dura a comemoração (a órbita sai da caixa do carro);
 *   - `rollScale` / `shakeScale` / `tremor`: parcelas da inclinação nas curvas, do tranco da batida e do tremor fino (Capô e Frente: bem menos);
 *   - `reduceFov`: parcela do FOV dinâmico (velocidade e nitro) que sobra com "reduzir efeitos" — nas presas ao carro quase nada.
 * A câmera presa ao carro fica dentro da caixa de colisão dele (cars/mount.ts): nenhum cenário sólido nem carro do núcleo chega lá.
 */
export interface CameraRig { readonly mounted: boolean; readonly lowerMax: number; readonly crest: number; readonly orbit: boolean; readonly rollScale: number; readonly shakeScale: number; readonly tremor: number; readonly reduceFov: number }

export const CAMERA_RIGS: Readonly<Record<CameraMode, CameraRig>> = {
  high: { mounted: false, lowerMax: CAMERA_DYNAMICS.lower.max, crest: 1, orbit: true, rollScale: 1, shakeScale: 1, tremor: 1, reduceFov: 1 },
  low: { mounted: false, lowerMax: CAMERA_DYNAMICS.lower.max, crest: 1, orbit: true, rollScale: 1, shakeScale: 1, tremor: 1, reduceFov: 1 },
  hood: { mounted: true, lowerMax: 0, crest: 0, orbit: false, rollScale: 0.4, shakeScale: 0.5, tremor: 0.5, reduceFov: 0.2 },
  bumper: { mounted: true, lowerMax: 0, crest: 0, orbit: false, rollScale: 0.4, shakeScale: 0.5, tremor: 0.5, reduceFov: 0.2 },
};

/** Quanto a câmera `mode` desce (m) na fração `speedFrac` da velocidade máxima. */
export function cameraLoweringFor(mode: CameraMode, speedFrac: number): number {
  return CAMERA_RIGS[mode].lowerMax === 0 ? 0 : (CAMERA_RIGS[mode].lowerMax / CAMERA_DYNAMICS.lower.max) * cameraLowering(speedFrac);
}

/** FOV (°) da câmera: a base mais a parcela da velocidade e a da mola do nitro, nunca passando de `fov.hardMax` e nunca abaixo da base. */
export function cameraFovFor(mode: CameraMode, speedFov: number, nitroX: number, reduce: boolean): number {
  const k = reduce ? CAMERA_RIGS[mode].reduceFov : 1;
  return Math.min(CAMERA_DYNAMICS.fov.hardMax, Math.max(CAMERA_POSES[mode].baseFov, CAMERA_POSES[mode].baseFov + (speedFov + nitroX) * k));
}

/** Parcela do tremor fino da câmera (0 com "reduzir efeitos"). */
export function tremorScaleFor(mode: CameraMode, reduce: boolean): number {
  return reduce ? 0 : CAMERA_RIGS[mode].tremor;
}

/** Intensidade do tremor fino, 0..1: nada até 90% da máxima, cheio na máxima. */
export function tremorAmount(speedFrac: number): number {
  const { from } = CAMERA_DYNAMICS.tremor;
  return clamp01((speedFrac - from) / (1 - from));
}

export interface Tremor { x: number; y: number; roll: number }

/**
 * O tremor no instante `time` (s) com a intensidade `amount` (0..1): duas senoides rápidas (15 a 28 Hz) por eixo, sem ruído sorteado. Os pesos somam 1:
 * o deslocamento nunca passa de `amount · offset` (nem o giro de `amount · roll`).
 */
export function tremorOffset(time: number, amount: number, out: Tremor = { x: 0, y: 0, roll: 0 }): Tremor {
  const { offset, roll } = CAMERA_DYNAMICS.tremor;
  const a = clamp01(amount);
  out.x = a * offset * (0.62 * Math.sin(time * 97.3) + 0.38 * Math.sin(time * 151.7 + 1.3));
  out.y = a * offset * (0.6 * Math.sin(time * 113.1 + 0.7) + 0.4 * Math.sin(time * 173.9 + 2.1));
  out.roll = a * roll * (0.7 * Math.sin(time * 79.3 + 0.4) + 0.3 * Math.sin(time * 131.9));
  return out;
}

/** A parcela de FOV do nitro (°): posição `x` e velocidade `v` da mola. */
export interface NitroFov { x: number; v: number }

/**
 * Anda a mola do FOV do nitro `dt` segundos. Engatado, o alvo é `CHASE_CAMERA.nitroFov` e o engate (`justEngaged`) dá um tranco de velocidade:
 * a mola subamortecida passa do alvo e assenta. Sem nitro o alvo é 0. `reduce` (reduzir efeitos): amortecimento crítico e sem tranco, ou seja,
 * chega ao alvo sem sobrepasso. A parcela fica em [0, nitroFov + springMax]. Passos de no máximo 1/120 s (estável com quadro lento).
 */
export function stepNitroFov(s: NitroFov, engaged: boolean, justEngaged: boolean, dt: number, reduce: boolean, nitroFov: number = CHASE_CAMERA.nitroFov): NitroFov {
  const { springMax, kick, omega, zeta } = CAMERA_DYNAMICS.fov;
  const target = engaged ? nitroFov : 0;
  const w = reduce ? 10 : omega; const z = reduce ? 1 : zeta;
  const hi = nitroFov + springMax;
  if (justEngaged && !reduce) s.v += kick;
  const steps = Math.max(1, Math.ceil(dt * 120));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    s.v += (w * w * (target - s.x) - 2 * z * w * s.v) * h;
    s.x += s.v * h;
    if (s.x < 0) { s.x = 0; if (s.v < 0) s.v = 0; } else if (s.x > hi) { s.x = hi; if (s.v > 0) s.v = 0; }
  }
  return s;
}

/** A órbita da vitória, 0..1, `seconds` depois de cruzar a linha em 1º: sobe suave (sem arrancada) em `orbit.seconds`. */
export function orbitAmount(seconds: number): number {
  return smooth(seconds / CAMERA_DYNAMICS.orbit.seconds);
}

/** Outro carro, em metros relativos ao carro dono da câmera: `dx` + à direita, `dz` + à frente. */
export interface Neighbor { dx: number; dz: number }

/** A câmera de órbita no referencial da pista: lateral absoluta (m do eixo), distância atrás do carro (m), elevação (m), fração efetiva e guinada (rad, + = para a direita). */
export interface OrbitOut { lat: number; back: number; lift: number; alpha: number; yaw: number }

/**
 * A câmera (lateral `relLat` m do carro dono, `back` m atrás dele) está dentro da caixa do vizinho `n`, alargada pela folga da câmera? Serve também
 * para o próprio carro (`n = {dx: 0, dz: 0}`).
 */
export function insideCarBox(relLat: number, back: number, n: Neighbor): boolean {
  const o = CAMERA_DYNAMICS.orbit;
  return Math.abs(relLat - n.dx) < o.halfWidth + o.marginWidth && Math.abs(-back - n.dz) < o.halfLength + o.marginLength;
}

/**
 * A câmera da órbita com a fração `alpha` (0..1): gira em volta do carro (lateral `carLat` m do eixo; a câmera-base está em `camLat`) para o lado do
 * centro da pista, chega mais perto e mais alto. A lateral fica em `max(lateralFree, |camLat|)`. Se a pose cair na caixa de um dos `count` primeiros
 * vizinhos, ou do próprio carro, recua a fração em 16 passos até sair (0 = a base, sempre aceita). `out.alpha` é a fração que valeu.
 */
export function orbitCamera(alpha: number, carLat: number, camLat: number, neighbors: readonly Neighbor[], count: number, out: OrbitOut = { lat: 0, back: 0, lift: 0, alpha: 0, yaw: 0 }, base: number = CHASE_CAMERA.back): OrbitOut {
  const o = CAMERA_DYNAMICS.orbit;
  const side = carLat >= 0 ? -1 : 1;
  const limit = Math.max(o.lateralFree, Math.abs(camLat));
  const target = clamp01(alpha);
  const rel0 = camLat - carLat;
  for (let k = 16; k >= 0; k--) {
    const a = (target * k) / 16;
    const yaw = side * o.yawMax * a;
    const radius = base - (base - o.radiusMin) * a;
    const rel = radius * Math.sin(yaw) + rel0 * (1 - a);
    const back = radius * Math.cos(yaw);
    const lat = Math.max(-limit, Math.min(limit, carLat + rel));
    let clear = k === 0 || !insideCarBox(lat - carLat, back, { dx: 0, dz: 0 });
    for (let i = 0; clear && i < count; i++) if (insideCarBox(lat - carLat, back, neighbors[i])) clear = false;
    if (clear) { out.lat = lat; out.back = back; out.lift = o.lift * a; out.alpha = a; out.yaw = yaw; return out; }
  }
  return out; // inalcançável (k = 0 sempre vale)
}

/** Cresta de morro: o segmento, o z (unidades de pista) e a queda de inclinação (m/m) que a define. */
export interface Crest { seg: number; z: number; drop: number }

/** Janela (segmentos) em que se mede a inclinação antes e depois do ponto, e a vizinhança em que só o maior fica. */
const CREST_WINDOW = 6;
const CREST_NEIGHBOURHOOD = 20;

const crestCache = new WeakMap<Track, Crest[]>();

/**
 * As cristas da pista: onde a inclinação média dos 6 segmentos antes cai mais que `minDrop` (4% = 4 m a cada 100 m) em relação à dos 6 depois — a
 * estrada "some" na ponta. Fica o maior de cada vizinhança de 20 segmentos, depois os maiores com `spacing` segmentos de distância, no máximo
 * `max` (4) por volta, em ordem de pista. Pista sem nenhuma queda de 4% usa a reserva de 2%; pista plana não tem cresta. Só visual.
 */
export function findCrests(track: Track): Crest[] {
  const cached = crestCache.get(track);
  if (cached) return cached;
  const { minDrop, fallbackDrop, spacing, max } = CAMERA_DYNAMICS.crest;
  const segs = track.segments; const n = segs.length;
  const slope = new Float64Array(n);
  for (let i = 0; i < n; i++) slope[i] = ((segs[i].y1 - segs[i].y0) * Y_SCALE) / SEGMENT_M;
  const drop = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let before = 0; let after = 0;
    for (let k = 1; k <= CREST_WINDOW; k++) { before += slope[(i - k + n) % n]; after += slope[(i + k - 1) % n]; }
    drop[i] = (before - after) / CREST_WINDOW;
  }
  const pick = (threshold: number): Crest[] => {
    const cand: Crest[] = [];
    for (let i = 0; i < n; i++) {
      if (drop[i] < threshold) continue;
      let top = true;
      for (let k = -CREST_NEIGHBOURHOOD; top && k <= CREST_NEIGHBOURHOOD; k++) {
        const d = drop[(i + k + n) % n];
        if (d > drop[i] || (d === drop[i] && k < 0)) top = false; // empate: fica o primeiro
      }
      if (top) cand.push({ seg: i, z: i * SEGMENT_LENGTH, drop: drop[i] });
    }
    cand.sort((a, b) => b.drop - a.drop);
    const kept: Crest[] = [];
    for (const c of cand) {
      if (kept.length >= max) break;
      if (kept.every((q) => { const d = Math.abs(q.seg - c.seg); return Math.min(d, n - d) >= spacing; })) kept.push(c);
    }
    return kept.sort((a, b) => a.seg - b.seg);
  };
  let out = pick(minDrop);
  if (out.length === 0) out = pick(fallbackDrop);
  crestCache.set(track, out);
  return out;
}

const Z_TO_M = SEGMENT_M / SEGMENT_LENGTH;

/**
 * Quanto a câmera flutua (m) em `z` perto de uma cresta: sobe suave nos `rise` m antes dela e desce nos `fall` m depois, até `crest.lift` na
 * velocidade máxima (de 50% a 100% da máxima, suave; devagar não flutua) e menos nas cristas mais mansas. Zero longe de qualquer uma.
 */
export function crestLift(crests: readonly Crest[], z: number, trackLength: number, speedFrac: number): number {
  if (crests.length === 0) return 0;
  const { lift, rise, fall } = CAMERA_DYNAMICS.crest;
  const fast = smooth((speedFrac - 0.5) / 0.5);
  if (fast === 0) return 0;
  let best = 0;
  for (const c of crests) {
    let d = z - c.z;
    d -= Math.round(d / trackLength) * trackLength; // a volta da pista
    const m = d * Z_TO_M; // + = depois da cresta
    const pulse = m < 0 ? smooth(1 + m / rise) : smooth(1 - m / fall);
    if (pulse <= 0) continue;
    const gentle = Math.max(0.5, Math.min(1, 0.5 + c.drop * 5));
    best = Math.max(best, pulse * gentle);
  }
  return lift * fast * best;
}
