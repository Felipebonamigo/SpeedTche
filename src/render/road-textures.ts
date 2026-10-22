// Texturas procedurais do chão da pista: asfalto com marcações e o mapa de brilho delas e a zebra (pixels puros → DataTexture, V4), cascalho do
// acostamento, box, decalque da largada (quadriculado + marcas do grid) e a poça de luz dos postes (canvas → CanvasTexture). Tudo com mipmap:
// detalhe fino some na distância em vez de cintilar. Ficam fora do textures.ts (que cenário e carros também usam).
import * as THREE from 'three';
import { GRID_FRONT_GAP, GRID_LANE_X, GRID_ROW_GAP, MAX_CARS, SEGMENT_LENGTH } from '../core/constants';
import { fbm, hash2 } from './noise';
import { hexToRgb, mix, type Palette } from './palette';
import type { Quality } from '../game/contracts';
import { ROAD_HALF_WIDTH_M, SEGMENT_M } from './units';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('sem canvas 2D');
  return [c, ctx];
}

function makeTexture(c: HTMLCanvasElement, anisotropy: number, wrapS: THREE.Wrapping = THREE.ClampToEdgeWrapping): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = wrapS; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/**
 * Granulado fino por pixel + manchas de baixa frequência sobre a cor já pintada (determinístico).
 * As manchas vêm de uma grade grossa interpolada (barato) e fecham a repetição ao longo sem emenda.
 */
function grain(ctx: CanvasRenderingContext2D, W: number, H: number, fine: number, blotch: number, seed: number, wrapV: number): void {
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const GW = 17; const GH = 65;
  const grid = new Float32Array(GW * GH);
  if (blotch > 0) {
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const tv = (gy / (GH - 1)) * wrapV; const s = gy / (GH - 1);
      const tu = (gx / (GW - 1)) * 3.7;
      grid[gy * GW + gx] = (fbm(seed + 3, tv + tu, 3) * (1 - s) + fbm(seed + 3, tv - wrapV + tu, 3) * s) * blotch;
    }
  }
  let s = seed >>> 0;
  for (let y = 0; y < H; y++) {
    const fy = (y / (H - 1)) * (GH - 1); const iy = Math.min(GH - 2, Math.floor(fy)); const ty = fy - iy;
    for (let x = 0; x < W; x++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const g = ((s >>> 8) / 16777216 - 0.5) * fine;
      let b = 0;
      if (blotch > 0) {
        const fx = (x / (W - 1)) * (GW - 1); const ix = Math.min(GW - 2, Math.floor(fx)); const tx = fx - ix;
        const a0 = grid[iy * GW + ix] + (grid[iy * GW + ix + 1] - grid[iy * GW + ix]) * tx;
        const a1 = grid[(iy + 1) * GW + ix] + (grid[(iy + 1) * GW + ix + 1] - grid[(iy + 1) * GW + ix]) * tx;
        b = a0 + (a1 - a0) * ty;
      }
      const k = (y * W + x) * 4;
      d[k] = Math.max(0, Math.min(255, d[k] + g + b));
      d[k + 1] = Math.max(0, Math.min(255, d[k + 1] + g + b));
      d[k + 2] = Math.max(0, Math.min(255, d[k + 2] + g + b));
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ───────────────────────────── Asfalto e zebra em pixels puros (V4, docs/ondas/V4-pistas.md) ─────────────────────────────
// O asfalto e a zebra saem de imagens RGBA puras (sem canvas: os testes medem os pixels no Node) que viram DataTexture. A densidade de texel é a
// mesma através e ao longo: com 18 × 85 px/m (até a V4) o mipmap escolhia o nível pelo eixo comprido e borrava as faixas de longe.

/** Imagem RGBA (linha 0 = v 0, coluna 0 = a borda esquerda): o que vira DataTexture. */
export interface RoadImage { width: number; height: number; data: Uint8Array }

/** Anisotropia por qualidade (limitada pelo que a placa aceita): a Baixa paga menos; a Alta e a Ultra seguram a faixa nítida a 60 m. */
export const ROAD_ANISOTROPY: Readonly<Record<Quality, number>> = { low: 4, medium: 8, high: 16, ultra: 16 };

/** Metros de pista por repetição da textura do asfalto: 48 m (4 traços do tracejado; o remendo não se repete a cada 24 m como antes). */
export const ASPHALT_REPEAT_M = 48;
/** Tamanho da textura do asfalto: 36,6 px/m através (14 m) × 42,7 px/m ao longo (48 m). */
export const ASPHALT_TEX = { w: 512, h: 2048 } as const;
/** Marcações (m): faixa de bordo a 0,3 m da borda, 0,3 m de largura; tracejado central de 0,3 m, traço de 4 m a cada 12 m. */
export const MARKINGS = { edgeOffsetM: 0.3, edgeWidthM: 0.3, dashWidthM: 0.3, dashLengthM: 4, dashPeriodM: 12 } as const;

/** Um remendo (m: lateral x0..x1 a partir do centro da pista, ao longo y0..y1 dentro da repetição) e o tom dele (< 1 = asfalto novo, mais escuro). */
export interface AsphaltPatch { x0: number; x1: number; y0: number; y1: number; tone: number }
/** Trinca selada com piche: transversal, de x0 a x1, em torno de `y`, com ondulação `amp` (m). */
export interface AsphaltCrack { y: number; x0: number; x1: number; amp: number; seed: number }
/**
 * O desgaste do asfalto, como dado (os testes o leem): remendos (V22/F2: manchas de borda torta e esmaecida, SEM contorno de piche e com os cantos arredondados — eram retângulos
 * com a borda selada, que liam como adesivo), juntas transversais de construção (uma faixa suave de `jointHalfM` de meia largura e `jointDepth` de escurecimento, não uma
 * linha de 1 texel), trincas seladas (finas, interrompidas) e a junta longitudinal da pavimentação (suave). As trilhas de pneu (centro de cada faixa ± 0,8 m) e a gota de
 * óleo (centro da faixa) são o padrão de cada faixa.
 */
export const ASPHALT_WEAR: {
  patches: readonly AsphaltPatch[]; joints: readonly number[]; cracks: readonly AsphaltCrack[]; seams: readonly number[];
  jointHalfM: number; jointDepth: number;
} = {
  patches: [
    { x0: 1.0, x1: 3.4, y0: 6.0, y1: 9.6, tone: 0.9 }, // remendo novo, escuro e liso, sobre a trilha da faixa da direita
    { x0: -5.7, x1: -3.3, y0: 20.5, y1: 23.2, tone: 1.15 }, // remendo antigo, claro e gasto
    { x0: 1.2, x1: 5.6, y0: 37.0, y1: 41.5, tone: 0.9 }, // recapeamento da faixa da direita
  ],
  joints: [29.0],
  cracks: [{ y: 14.2, x0: -6.3, x1: 1.6, amp: 0.18, seed: 7 }, { y: 44.6, x0: -2.2, x1: 4.8, amp: 0.12, seed: 11 }],
  seams: [0.32],
  jointHalfM: 0.24,
  jointDepth: 0.19,
};

/** Centro das faixas de rolamento (m) e das trilhas de pneu em cada uma. */
const LANES_M = [-3.5, 3.5];
const TRACK_OFFSET_M = 0.8;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a: number, b: number, x: number): number => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/**
 * Ruído de valor 2D em [−1, 1] numa grade de `nx` × `ny` células, periódico em y (a textura repete ao longo sem emenda): os valores da grade são
 * sorteados uma vez (hash) e cada amostra só interpola — barato o bastante para 1 milhão de pixels.
 */
class Lattice {
  private readonly v: Float32Array;
  constructor(seed: number, private readonly nx: number, private readonly ny: number) {
    this.v = new Float32Array((nx + 2) * ny);
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx + 2; x++) this.v[y * (nx + 2) + x] = hash2(seed * 7919 + x * 131, y) * 2 - 1;
  }
  /** `x` em células (0..nx), `y` em células (periódico em ny). */
  at(x: number, y: number): number {
    const xi = Math.min(this.nx, Math.max(0, Math.floor(x))); const yi = Math.floor(y);
    const fx = Math.min(1, Math.max(0, x - xi)); const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx); const sy = fy * fy * (3 - 2 * fy);
    const ny = this.ny; const w = this.nx + 2;
    const y0 = ((yi % ny) + ny) % ny; const y1 = y0 + 1 === ny ? 0 : y0 + 1;
    const v = this.v;
    const a = v[y0 * w + xi] + (v[y0 * w + xi + 1] - v[y0 * w + xi]) * sx;
    const b = v[y1 * w + xi] + (v[y1 * w + xi + 1] - v[y1 * w + xi]) * sx;
    return a + (b - a) * sy;
  }
}

/** Fração de [a, b) coberta pelo intervalo do pixel [p, p + 1) (borda da tinta sem serrilhado). */
const cover = (p: number, a: number, b: number): number => clamp01(Math.min(p + 1, b) - Math.max(p, a));

/**
 * Quanto da tinta das marcações cobre o pixel (x, y) numa imagem `w` × `h` da repetição inteira (0..1): faixas de bordo dos dois lados e o
 * tracejado central, com a borda antisserrilhada. A mesma conta serve à imagem de cor e ao mapa de brilho (outra resolução).
 */
function markCoverage(x: number, y: number, w: number, h: number): number {
  const M = MARKINGS;
  const pu = w / (ROAD_HALF_WIDTH_M * 2); const pv = h / ASPHALT_REPEAT_M;
  const L = (m: number): number => (m + ROAD_HALF_WIDTH_M) * pu;
  const edge = Math.max(
    cover(x, L(-ROAD_HALF_WIDTH_M + M.edgeOffsetM), L(-ROAD_HALF_WIDTH_M + M.edgeOffsetM + M.edgeWidthM)),
    cover(x, L(ROAD_HALF_WIDTH_M - M.edgeOffsetM - M.edgeWidthM), L(ROAD_HALF_WIDTH_M - M.edgeOffsetM)),
  );
  const dx = cover(x, L(-M.dashWidthM / 2), L(M.dashWidthM / 2));
  let dy = 0;
  if (dx > 0) for (let k = 0; k < ASPHALT_REPEAT_M / M.dashPeriodM; k++) dy = Math.max(dy, cover(y, k * M.dashPeriodM * pv, (k * M.dashPeriodM + M.dashLengthM) * pv));
  return Math.max(edge, dx * dy);
}

/** V11: a sarjeta, a borda de fora da pista depois da faixa de bordo (a faixa ocupa |x| de 6,4 a 6,7 m): escurece. */
export const GUTTER = { fromM: 6.62, toM: 6.76, dark: 0.6 } as const;

/**
 * V22/F2: giro máximo do matiz (°) que a mancha larga dá à cor da estrada: um pedaço de pista puxa para o vermelho, o vizinho para o amarelo. O asfalto (quase cinza) mal sente; a
 * terra (saturada) sente a ponto de a pista não ser mais "uma tinta só". Cai sobre o desenho (a imagem do asfalto), não sobre o `roadBase` da paleta: a cor média continua a dela.
 */
export const ROAD_HUE_SPAN_DEG = 12;

/** Perfil em cosseno: 1 no centro e 0 a `half` de distância (suave nas duas pontas: nenhuma linha de 1 texel). */
const bell = (d: number, half: number): number => (d >= half ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * d) / half));

/** Distância assinada (m) a um retângulo de cantos arredondados de centro (cx, cy), meias medidas (hx, hy) e raio r: negativa dentro. */
function sdRound(px: number, py: number, cx: number, cy: number, hx: number, hy: number, r: number): number {
  const qx = Math.abs(px - cx) - (hx - r); const qy = Math.abs(py - cy) - (hy - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Ruído de valor com a célula em METROS (através × ao longo) e a repetição de 48 m fechada: o que o desenho da estrada chama por (x, y) em metros. */
class Field2 {
  private readonly lat: Lattice; private readonly cw: number; private readonly cl: number;
  constructor(seed: number, cellAcrossM: number, cellAlongM: number) {
    const nx = Math.ceil((ROAD_HALF_WIDTH_M * 2) / cellAcrossM); const ny = Math.max(1, Math.round(ASPHALT_REPEAT_M / cellAlongM));
    this.lat = new Lattice(seed, nx, ny); this.cw = cellAcrossM; this.cl = ASPHALT_REPEAT_M / ny;
  }
  /** `ux`: metros da borda esquerda; `my`: metros ao longo (periódico em 48). */
  at(ux: number, my: number): number { return this.lat.at(ux / this.cw, my / this.cl); }
}

/** Os ruídos do desenho da estrada (montados uma vez: são tabelas pequenas). */
interface RoadNoise {
  macro: Field2; meso: Field2; micro: Field2; hueA: Field2; hueB: Field2; warp1: Field2; warp2: Field2; wear: Field2; wearB: Field2; jointN: Field2;
  crackGate: Field2[]; g1: Field2; g2: Field2; g3: Field2; roughN: Field2;
}
let noiseCache: RoadNoise | null = null;
function roadNoise(): RoadNoise {
  if (noiseCache) return noiseCache;
  noiseCache = {
    macro: new Field2(101, 3.5, 6.9), meso: new Field2(103, 1.6, 1.2), micro: new Field2(107, 0.34, 0.3),
    hueA: new Field2(109, 4, 8), hueB: new Field2(113, 1.8, 1.5), warp1: new Field2(127, 0.55, 0.55), warp2: new Field2(131, 0.3, 0.3),
    wear: new Field2(137, 3.5, 0.55), wearB: new Field2(139, 1.2, 3), jointN: new Field2(149, 1.3, ASPHALT_REPEAT_M),
    crackGate: ASPHALT_WEAR.cracks.map((c) => new Field2(c.seed + 200, 1.4, ASPHALT_REPEAT_M)),
    g1: new Field2(151, 0.07, 0.11), g2: new Field2(157, 0.16, 0.25), g3: new Field2(163, 0.45, 0.7), roughN: new Field2(167, 2.5, 4),
  };
  return noiseCache;
}

/** Perfis por coluna (através da pista) que o desenho, o mapa de rugosidade e o de normais usam: trilhas, óleo, poeira da borda, tinta das faixas e do tracejado. */
interface ColumnProfile { track: Float32Array; oil: Float32Array; edge: Float32Array; line: Float32Array; dash: Float32Array }
function columnProfile(W: number): ColumnProfile {
  const pu = W / (ROAD_HALF_WIDTH_M * 2); const M = MARKINGS;
  const L = (m: number): number => (m + ROAD_HALF_WIDTH_M) * pu;
  const out: ColumnProfile = { track: new Float32Array(W), oil: new Float32Array(W), edge: new Float32Array(W), line: new Float32Array(W), dash: new Float32Array(W) };
  for (let x = 0; x < W; x++) {
    const m = (x + 0.5) / pu - ROAD_HALF_WIDTH_M;
    let tr = 0; let oil = 0;
    for (const lc of LANES_M) {
      for (const sg of [-1, 1]) { const d = Math.abs(m - (lc + sg * TRACK_OFFSET_M)); tr = Math.max(tr, d < 0.22 ? 1 : d < 0.5 ? 0.5 + 0.5 * Math.cos((Math.PI * (d - 0.22)) / 0.28) : 0); }
      const d = Math.abs(m - lc); oil = Math.max(oil, d < 0.16 ? 1 : d < 0.36 ? 0.5 + 0.5 * Math.cos((Math.PI * (d - 0.16)) / 0.2) : 0);
    }
    out.track[x] = tr; out.oil[x] = oil; out.edge[x] = sstep(5.7, 6.9, Math.abs(m));
    out.line[x] = Math.max(cover(x, L(-ROAD_HALF_WIDTH_M + M.edgeOffsetM), L(-ROAD_HALF_WIDTH_M + M.edgeOffsetM + M.edgeWidthM)),
      cover(x, L(ROAD_HALF_WIDTH_M - M.edgeOffsetM - M.edgeWidthM), L(ROAD_HALF_WIDTH_M - M.edgeOffsetM)));
    out.dash[x] = cover(x, L(-M.dashWidthM / 2), L(M.dashWidthM / 2));
  }
  return out;
}

/** A linha do meio de cada trinca em cada coluna (m ao longo), com a ondulação dela. */
function crackLines(W: number): Float32Array[] {
  const pu = W / (ROAD_HALF_WIDTH_M * 2);
  return ASPHALT_WEAR.cracks.map((c) => {
    const n1 = new Lattice(c.seed, Math.ceil((ROAD_HALF_WIDTH_M * 2) / 0.9), 1); const n2 = new Lattice(c.seed + 3, Math.ceil((ROAD_HALF_WIDTH_M * 2) / 0.25), 1);
    const ys = new Float32Array(W);
    for (let x = 0; x < W; x++) { const u = (x + 0.5) / pu; ys[x] = c.y + c.amp * (0.65 * n1.at(u / 0.9, 0) + 0.35 * n2.at(u / 0.25, 0)); }
    return ys;
  });
}

/** O remendo que cobre (mx, my) e quanto (0..1): retângulo de canto arredondado de borda torta (ruído) e esmaecida em ±0,16 m — sem contorno. */
function patchAt(NZ: RoadNoise, ux: number, mx: number, my: number): { q: AsphaltPatch; m: number } | null {
  let best: { q: AsphaltPatch; m: number } | null = null;
  for (const q of ASPHALT_WEAR.patches) {
    if (my < q.y0 - 0.7 || my > q.y1 + 0.7 || mx < q.x0 - 0.7 || mx > q.x1 + 0.7) continue;
    const hx = (q.x1 - q.x0) / 2; const hy = (q.y1 - q.y0) / 2;
    const d = sdRound(mx, my, (q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2, hx, hy, Math.min(0.9, 0.65 * Math.min(hx, hy))) + 0.2 * NZ.warp1.at(ux, my) + 0.06 * NZ.warp2.at(ux, my);
    const m = 1 - sstep(-0.16, 0.16, d);
    if (m > 0 && (best === null || m > best.m)) best = { q, m };
  }
  return best;
}

/** A cobertura (0..1) de um remendo em (mx, my) metros: o teste lê a forma dele sem passar pela cor (cantos arredondados, borda torta e esmaecida). */
export function patchCoverage(q: AsphaltPatch, mx: number, my: number): number {
  const ux = mx + ROAD_HALF_WIDTH_M; const NZ = roadNoise();
  const hx = (q.x1 - q.x0) / 2; const hy = (q.y1 - q.y0) / 2;
  const d = sdRound(mx, my, (q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2, hx, hy, Math.min(0.9, 0.65 * Math.min(hx, hy))) + 0.2 * NZ.warp1.at(ux, my) + 0.06 * NZ.warp2.at(ux, my);
  return 1 - sstep(-0.16, 0.16, d);
}

/** A faixa suave da junta de construção em (ux, my): quanto escurece (0..1 do `jointDepth`), com a lateral variando de leve e a linha levemente torta. */
function jointAt(NZ: RoadNoise, ux: number, my: number): number {
  let out = 0;
  for (const j of ASPHALT_WEAR.joints) {
    const w = NZ.jointN.at(ux, 0);
    const d = Math.abs(my - (j + 0.035 * w));
    if (d < ASPHALT_WEAR.jointHalfM) out = Math.max(out, bell(d, ASPHALT_WEAR.jointHalfM) * (0.8 + 0.2 * NZ.jointN.at(ux + 3.1, 0)));
  }
  return out;
}

/** Quanto as trincas escurecem em (ux, my) (0..1): finas, interrompidas pelo ruído e afinando nas pontas. */
function crackAt(NZ: RoadNoise, ys: Float32Array[], x: number, ux: number, mx: number, my: number): number {
  let out = 0;
  for (let c = 0; c < ys.length; c++) {
    const cr = ASPHALT_WEAR.cracks[c];
    const d = Math.abs(my - ys[c][x]);
    if (d >= 0.05 || mx < cr.x0 || mx > cr.x1) continue;
    const gate = sstep(-0.35, 0.25, NZ.crackGate[c].at(ux, 0)) * sstep(cr.x0, cr.x0 + 0.5, mx) * (1 - sstep(cr.x1 - 0.5, cr.x1, mx));
    out = Math.max(out, bell(d, 0.05) * gate);
  }
  return out;
}

/** Um seixo da terra (m: x a partir da borda esquerda, y ao longo na repetição), raio e tom (−0,5..0,5: mais escuro ↔ mais claro que a terra). */
interface Pebble { x: number; y: number; r: number; tone: number }
let pebbleCache: Pebble[] | null = null;
/**
 * Os seixos da terra, em dois tamanhos (cascalho de 3–5 cm e pedra de 5–10 cm), um por célula sorteada de uma grade jitterada (determinístico). Os MESMOS alimentam a cor (a pedra e a
 * sombra de contato em volta) e o relevo (a cúpula) — a cor e a luz concordam. Substituem o pó de pontos claros (`stone`) e as rachaduras em polígonos da terra.
 */
function pebbles(): Pebble[] {
  if (pebbleCache) return pebbleCache;
  const out: Pebble[] = []; const RW = ROAD_HALF_WIDTH_M * 2; const R = ASPHALT_REPEAT_M;
  for (const [cell, prob, r0, dr, seed] of [[0.34, 0.2, 0.05, 0.05, 61], [0.15, 0.42, 0.03, 0.02, 67]] as const) {
    const nx = Math.ceil(RW / cell); const ny = Math.round(R / cell); const cw = RW / nx; const cl = R / ny;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (hash2(i * 17 + seed, j * 29 + 3) >= prob) continue;
      out.push({ x: (i + 0.15 + 0.7 * hash2(i * 13 + seed, j * 31 + 5)) * cw, y: (j + 0.15 + 0.7 * hash2(i * 11 + seed, j * 23 + 9)) * cl, r: r0 + dr * hash2(i * 7 + seed, j * 19 + 1), tone: hash2(i * 5 + seed, j * 3 + 2) - 0.5 });
    }
  }
  pebbleCache = out;
  return out;
}

/** Percorre os pixels sob cada seixo (até `reach` × o raio dele, com a volta em y): `visit(índice, seixo, d/r)`. */
function forPebbles(W: number, H: number, reach: number, visit: (idx: number, p: Pebble, t: number) => void): void {
  const pu = W / (ROAD_HALF_WIDTH_M * 2); const pv = H / ASPHALT_REPEAT_M;
  for (const p of pebbles()) {
    const rx = p.r * reach * pu; const ry = p.r * reach * pv;
    const cx = p.x * pu; const cy = p.y * pv;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      const yy = ((y % H) + H) % H; const dy = ((y + 0.5) / pv - p.y);
      for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(W - 1, Math.ceil(cx + rx)); x++) {
        const dx = (x + 0.5) / pu - p.x; const t = Math.hypot(dx, dy) / p.r;
        if (t < reach) visit(yy * W + x, p, t);
      }
    }
  }
}

interface AsphaltStructure { k: Float32Array; stone: Uint8Array; mark: Uint8Array; tone: Uint8Array; hue: Int8Array; peb: Int8Array }
let asphaltCache: AsphaltStructure | null = null;

/**
 * O desenho do asfalto, sem cor (o mesmo nas duas pontas da corrida que muda): `k` multiplica a cor base (tom: as três escalas de mancha, trilhas, óleo, remendos, junta, trincas,
 * agregado, sarjeta), `stone` é o agregado claro (0..255), `mark` a cobertura da tinta já gasta (0..255), `tone` (V11) quanto o pixel é da segunda tinta (`roadAlt`: manchas largas, veios e o
 * tom do trecho), `hue` o giro de matiz (V22/F2: −127..127 ↔ ±`ROAD_HUE_SPAN_DEG`) e `peb` o sombreado dos seixos da terra (−127..127 ↔ −50%..+50%). Montado uma vez por sessão.
 * V22/F2: sem o Voronoi das rachaduras, sem o contorno dos remendos e sem a junta de 1 texel (o diagnóstico §3.1: "piso de tela", "adesivo", "costura de render").
 */
function asphaltStructure(): AsphaltStructure {
  if (asphaltCache) return asphaltCache;
  const W = ASPHALT_TEX.w; const H = ASPHALT_TEX.h;
  const RW = ROAD_HALF_WIDTH_M * 2; const R = ASPHALT_REPEAT_M;
  const pu = W / RW; const pv = H / R;
  const k = new Float32Array(W * H); const stone = new Uint8Array(W * H); const mark = new Uint8Array(W * H); const tone = new Uint8Array(W * H);
  const hue = new Int8Array(W * H); const peb = new Int8Array(W * H);
  const NZ = roadNoise(); const M = MARKINGS;
  const col = columnProfile(W); const crackY = crackLines(W);
  const rowDash = new Float32Array(H);
  for (let y = 0; y < H; y++) for (let d = 0; d < R / M.dashPeriodM; d++) rowDash[y] = Math.max(rowDash[y], cover(y, d * M.dashPeriodM * pv, (d * M.dashPeriodM + M.dashLengthM) * pv));
  // Riscas de borracha (finas através, compridas ao longo) e as manchas de óleo.
  const streak = new Lattice(9, Math.ceil(RW / 0.07), Math.round(R / 4));
  const blotN = new Lattice(13, Math.ceil(RW / 0.3), Math.round(R / 0.7));
  // V11 (tom pintado): manchas largas (3 × 5 m) e veios finos e compridos na segunda tinta; e o tom do TRECHO (periódico em 48 m: ~ 6 m por ciclo).
  const patchN = new Lattice(21, Math.ceil(RW / 3.2), 10);
  const veinN = new Lattice(23, Math.ceil(RW / 0.1), Math.round(R / 6));
  const alongN = new Lattice(31, 1, Math.round(R / 6));
  for (let y = 0; y < H; y++) {
    const my = (y + 0.5) / pv;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const ux = (x + 0.5) / pu; const mx = ux - ROAD_HALF_WIDTH_M;
      const patch = patchAt(NZ, ux, mx, my);
      const fresh = patch !== null && patch.q.tone < 1;
      // Trilha mais fraca no remendo novo (o pneu ainda não o poliu).
      const tr = col.track[x] * (fresh && patch ? 1 - 0.65 * patch.m : 1);
      // Três escalas de mancha: larga (~7 × 3,5 m), média (~1,5 m) e miúda (~0,3 m) — a luma e, junto, o matiz.
      let kk = 1 + 0.21 * NZ.macro.at(ux, my) + 0.12 * NZ.meso.at(ux, my) + 0.12 * NZ.micro.at(ux, my);
      hue[i] = Math.round(127 * (0.7 * NZ.hueA.at(ux, my) + 0.3 * NZ.hueB.at(ux, my)));
      if (tr > 0) kk *= 1 - 0.12 * tr * (0.8 + 0.2 * streak.at(ux / 0.07, my / 4));
      // Gota de óleo e fuligem no meio de cada faixa, em manchas ao longo.
      if (col.oil[x] > 0) { const b = blotN.at(ux / 0.3, my / 0.7) * 0.5 + 0.5; kk *= 1 - 0.1 * col.oil[x] * b * b; }
      kk *= 1 + 0.04 * col.edge[x];
      // V11: a sarjeta (depois da faixa de bordo) é mais escura; o tom do trecho (ao longo) e as manchas largas.
      const gut = sstep(GUTTER.fromM, GUTTER.toM, Math.abs(mx));
      const run = alongN.at(0.5, my / 6);
      kk *= 1 - (1 - GUTTER.dark) * gut;
      kk *= 1 + 0.07 * run + 0.045 * patchN.at(ux / 3.2, my / 4.8);
      // A segunda tinta: mancha larga (limiar 0,05, borda suave), veio fino (só a crista) e o tom do trecho empurrando tudo junto.
      const pt = sstep(-0.05, 0.3, patchN.at(ux / 3.2, my / 4.8) + 0.55 * run);
      const vn = sstep(0.38, 0.62, veinN.at(ux / 0.1, my / 6) * 0.5 + 0.5 + 0.18 * run) * 0.55;
      const tn = Math.min(1, Math.max(pt * 0.85, vn) * (1 - 0.8 * gut));
      // Agregado em dois tamanhos: o pedrisco claro e o poro escuro de 1 px e os de 2 × 2 px (mais raros), todos menores na trilha polida.
      kk *= 1 + 0.11 * (hash2(i, 77) - 0.5) * (1 - 0.5 * tr);
      const h = hash2(i, 191);
      let st = 0;
      if (h < 0.06) st = 70 + 120 * hash2(i, 193);
      else if (h < 0.11) kk *= 0.8;
      const hb = hash2((x >> 1) + 7001, (y >> 1) + 7003);
      if (hb < 0.035) st = Math.max(st, 60 + 90 * hash2(x >> 1, y >> 1)); else if (hb < 0.06) kk *= 0.86;
      st *= 1 - 0.75 * tr;
      if (patch) {
        kk *= 1 + (patch.q.tone - 1) * patch.m;
        st *= 1 + (fresh ? -0.55 : 0.25) * patch.m;
      }
      // A junta de construção: uma faixa larga e suave (não uma linha), com o agregado um pouco mais liso dentro.
      const jt = jointAt(NZ, ux, my);
      if (jt > 0) { kk *= 1 - ASPHALT_WEAR.jointDepth * jt; st *= 1 - 0.8 * jt; }
      for (const sm of ASPHALT_WEAR.seams) { const d = Math.abs(mx - sm); if (d < 0.09) kk *= 1 - 0.06 * bell(d, 0.09); } // a junta longitudinal: larga e fraca, não um fio
      const cr = crackAt(NZ, crackY, x, ux, mx, my);
      if (cr > 0) { kk *= 1 - 0.38 * cr; st *= 1 - cr; }
      k[i] = kk;
      tone[i] = Math.round(255 * tn);
      stone[i] = st > 255 ? 255 : Math.round(st);
      // Tinta: a cobertura antisserrilhada, GASTA em trechos (a tinta cai por ruído: 80–100%, mais as lascas onde o agregado aparece).
      const cov = Math.max(col.line[x], col.dash[x] * rowDash[y]);
      if (cov > 0) {
        const worn = 0.935 + 0.05 * NZ.wear.at(ux, my) + 0.02 * NZ.wearB.at(ux, my);
        const chip = hash2(i, 311) < 0.03 ? 0.5 : 1 - 0.08 * hash2(i, 313);
        mark[i] = Math.round(255 * cov * Math.max(0.8, Math.min(1, worn)) * chip);
      }
    }
  }
  // Os seixos da terra: o corpo da pedra (±27% do tom da terra) e a sombra de contato em volta (até −22%).
  const pebAcc = new Float32Array(W * H);
  forPebbles(W, H, 1.45, (idx, p, t) => {
    // Pedra mais clara que a terra (tom −0,1..+0,6): escura com sombra em volta lia como CRATERA (a primeira tentativa, vista na captura da Foz); o aro de contato é fraco e curto.
    if (t < 1) { const edge = Math.min(1, (1 - t) * p.r * pu * 2); pebAcc[idx] += edge * ((p.tone + 0.5) * 0.55 - 0.08) * (1 - 0.3 * t * t); } else pebAcc[idx] -= 0.1 * (1 - (t - 1) / 0.45) ** 2;
  });
  for (let i = 0; i < W * H; i++) peb[i] = Math.max(-127, Math.min(127, Math.round(pebAcc[i] * 254)));
  asphaltCache = { k, stone, mark, tone, hue, peb };
  return asphaltCache;
}

/**
 * O asfalto pintado nas cores de uma paleta: a cor base (`roadBase`) misturada à segunda tinta (`roadAlt`) pelo `tone`, girada no matiz (`hue`), × o tom, os seixos da terra (pela
 * `roadEarth`), o agregado claro (menos na terra: lá o grão são os seixos) e a tinta por cima.
 */
export function asphaltImage(p: Palette): RoadImage {
  const W = ASPHALT_TEX.w; const H = ASPHALT_TEX.h;
  const { k, stone, mark, tone, hue, peb } = asphaltStructure();
  const [r0, g0, b0] = hexToRgb(p.roadBase);
  const [ra, ga, ba] = hexToRgb(p.roadAlt);
  const earth = p.roadEarth;
  const amp = 0.55 + 0.45 * earth; // quanto da segunda tinta aparece (o asfalto varia menos que a terra)
  const sg = Math.min(220, ((0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0) * 1.75));
  const [lr, lg, lb] = hexToRgb(mix(p.lane, p.roadBase, 0.08));
  const stoneW = 1 - 0.85 * earth; const pebK = earth * (0.5 / 127);
  // O giro de matiz em torno do eixo cinza do RGB (a luminância quase não anda): uma matriz por valor de `hue` (−127..127).
  const rot = new Float32Array(255 * 3);
  for (let v = -127; v <= 127; v++) {
    const a = (v / 127) * ROAD_HUE_SPAN_DEG * (Math.PI / 180); const c = Math.cos(a); const s = Math.sin(a) / Math.sqrt(3); const o = (1 - c) / 3;
    rot[(v + 127) * 3] = c + o; rot[(v + 127) * 3 + 1] = o - s; rot[(v + 127) * 3 + 2] = o + s;
  }
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const m = mark[i] / 255; const t = (tone[i] / 255) * amp; const s = (stone[i] / 255) * stoneW;
    const kk = k[i] * (1 - earth * 0.02) * (1 + peb[i] * pebK) * (1 + earth * 0.34 * (hash2(i, 515) - 0.5)) * (1 + earth * 0.26 * (hash2((i % W >> 1) + 9011, (((i / W) | 0) >> 1) + 9013) - 0.5)); // a terra: grão fino de 1 px e de 2 × 2 px
    const ri = r0 + (ra - r0) * t; const gi = g0 + (ga - g0) * t; const bi = b0 + (ba - b0) * t;
    const q = (hue[i] + 127) * 3; const d0 = rot[q]; const d1 = rot[q + 1]; const d2 = rot[q + 2];
    let r = (ri * d0 + gi * d1 + bi * d2) * kk; let g = (ri * d2 + gi * d0 + bi * d1) * kk; let b = (ri * d1 + gi * d2 + bi * d0) * kk;
    r += (sg * kk - r) * s; g += (sg * kk - g) * s; b += (sg * 0.97 * kk - b) * s;
    r += (lr - r) * m; g += (lg - g) * m; b += (lb - b) * m;
    const o = i * 4;
    data[o] = r < 0 ? 0 : r > 255 ? 255 : r; data[o + 1] = g < 0 ? 0 : g > 255 ? 255 : g; data[o + 2] = b < 0 ? 0 : b > 255 ? 255 : b; data[o + 3] = 255;
  }
  return { width: W, height: H, data };
}

// ───────────────────────────── Rugosidade e normais (V22/F2, Média e acima) ─────────────────────────────

/** A rugosidade do material do asfalto de dia (road.ts): o mapa de rugosidade a MULTIPLICA (o three lê o canal G), então 1 no mapa = 0,9 na tela. De noite o material baixa para 0,6. */
export const ROAD_ROUGHNESS = 0.9;
/** Mapa de rugosidade: 256 × 1024 (18 × 21 px/m: o brilho é de baixa frequência; metade da resolução do asfalto, 1 MB). */
export const ROUGHNESS_TEX = { w: 256, h: 1024 } as const;
/** Mapa de normais: 512 × 1024 (36,6 × 21,3 px/m; 2 MB, 2,8 com o mipmap). */
export const NORMAL_TEX = { w: 512, h: 1024 } as const;
/** Quanto do relevo (mm por metro, em inclinação) o mapa de normais mostra: 1 = a inclinação real do relevo modelado. */
const NORMAL_STRENGTH = 2.2;

/**
 * O mapa de rugosidade (RGBA: o three lê o G): 1 = áspero (0,9 efetivo) nas faixas limpas, na borda e na junta; as trilhas de pneu, polidas, a ~0,62 (0,56 efetivo no asfalto; a terra
 * batida é menos lisa, ~0,82 → 0,74), a gota de óleo ~0,7 e a tinta das faixas áspera (1). Manchas largas de ±4% variam o brilho. O sol raso risca de brilho as trilhas.
 * `earth` (0..1) é a `roadEarth` da paleta.
 */
export function roughnessImage(earth: number): RoadImage {
  const W = ROUGHNESS_TEX.w; const H = ROUGHNESS_TEX.h;
  const NZ = roadNoise(); const col = columnProfile(W); const pu = W / (ROAD_HALF_WIDTH_M * 2); const pv = H / ASPHALT_REPEAT_M;
  const rowDash = new Float32Array(H); const M = MARKINGS;
  for (let y = 0; y < H; y++) for (let d = 0; d < ASPHALT_REPEAT_M / M.dashPeriodM; d++) rowDash[y] = Math.max(rowDash[y], cover(y, d * M.dashPeriodM * pv, (d * M.dashPeriodM + M.dashLengthM) * pv));
  const trackRough = 0.62 + 0.2 * earth;
  const streak = new Lattice(173, Math.ceil((ROAD_HALF_WIDTH_M * 2) / 0.1), Math.round(ASPHALT_REPEAT_M / 3));
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const my = (y + 0.5) / pv;
    for (let x = 0; x < W; x++) {
      const ux = (x + 0.5) / pu; const mx = ux - ROAD_HALF_WIDTH_M;
      const patch = patchAt(NZ, ux, mx, my);
      const tr = col.track[x] * (patch && patch.q.tone < 1 ? 1 - 0.65 * patch.m : 1) * (0.9 + 0.1 * streak.at(ux / 0.1, my / 3));
      let v = 1 - (1 - trackRough) * tr;
      v = Math.min(v, 1 - (1 - 0.7) * col.oil[x] * (0.5 + 0.5 * NZ.macro.at(ux, my + 11)));
      v *= 1 - 0.04 * (0.5 + 0.5 * NZ.roughN.at(ux, my));
      const cov = Math.max(col.line[x], col.dash[x] * rowDash[y]);
      if (cov > 0) v = v + (1 - v) * cov; // a tinta é áspera: lisa (0,92) refletia o céu em pontos azuis no agregado, na captura
      const b = Math.round(255 * Math.max(0, Math.min(1, v)));
      const o = (y * W + x) * 4; data[o] = b; data[o + 1] = b; data[o + 2] = b; data[o + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

/**
 * O mapa de normais (espaço da tangente, RGBA 0..255, convenção OpenGL: o verde cresce com o `v`, que é o sentido da pista) a partir de um relevo em mm: o agregado do asfalto em três escalas
 * (menos nas trilhas polidas), as trincas em sulco, o sulco da junta e, na terra (`earth` 0..1), as ondulações largas e a cúpula de cada seixo (os mesmos da cor). Repete em 48 m sem emenda.
 */
export function normalImage(earth: number): RoadImage {
  const W = NORMAL_TEX.w; const H = NORMAL_TEX.h; const RW = ROAD_HALF_WIDTH_M * 2; const R = ASPHALT_REPEAT_M;
  const pu = W / RW; const pv = H / R;
  const NZ = roadNoise(); const col = columnProfile(W); const crackY = crackLines(W);
  const hgt = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const my = (y + 0.5) / pv;
    for (let x = 0; x < W; x++) {
      const ux = (x + 0.5) / pu; const mx = ux - ROAD_HALF_WIDTH_M;
      const agg = NZ.g1.at(ux, my) + 1.2 * NZ.g2.at(ux, my) + 2.4 * NZ.g3.at(ux, my);
      let h = agg * 2.2 * (1 - 0.55 * col.track[x]);
      h += earth * 3.5 * NZ.meso.at(ux, my + 7);
      for (const j of ASPHALT_WEAR.joints) h -= 5 * bell(Math.abs(my - j), 0.07);
      h -= 3.6 * crackAt(NZ, crackY, x, ux, mx, my);
      hgt[y * W + x] = h;
    }
  }
  if (earth > 0) forPebbles(W, H, 1, (idx, p, t) => { hgt[idx] += earth * p.r * 600 * (1 - t * t) ** 0.7; });
  const data = new Uint8Array(W * H * 4);
  const dxm = RW / W; const dym = R / H;
  for (let y = 0; y < H; y++) {
    const ym = ((y - 1 + H) % H) * W; const yp = ((y + 1) % H) * W; const y0 = y * W;
    for (let x = 0; x < W; x++) {
      const xm = x > 0 ? x - 1 : x; const xp = x < W - 1 ? x + 1 : x;
      const sx = ((hgt[y0 + xp] - hgt[y0 + xm]) / ((xp - xm) * dxm)) * 1e-3 * NORMAL_STRENGTH;
      const sy = ((hgt[yp + x] - hgt[ym + x]) / (2 * dym)) * 1e-3 * NORMAL_STRENGTH;
      const inv = 1 / Math.hypot(sx, sy, 1);
      const o = (y0 + x) * 4;
      data[o] = Math.round((-sx * inv * 0.5 + 0.5) * 255); data[o + 1] = Math.round((-sy * inv * 0.5 + 0.5) * 255); data[o + 2] = Math.round((inv * 0.5 + 0.5) * 255); data[o + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

/** O mapa de brilho das marcações (branco onde há tinta): à noite a tinta refletiva acende e a curva se lê de longe. */
const GLOW_TEX = { w: 128, h: 512 } as const;
let glowCache: RoadImage | null = null;
/** Não depende da paleta: montado uma vez (as duas pontas da corrida que muda compartilham os pixels, cada uma com a sua textura). */
function glowImage(): RoadImage {
  if (glowCache) return glowCache;
  const W = GLOW_TEX.w; const H = GLOW_TEX.h;
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = Math.round(255 * markCoverage(x, y, W, H));
    const o = (y * W + x) * 4;
    data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255;
  }
  glowCache = { width: W, height: H, data };
  return glowCache;
}

function dataTexture(img: RoadImage, anisotropy: number, wrapS: THREE.Wrapping = THREE.ClampToEdgeWrapping): THREE.DataTexture {
  const t = new THREE.DataTexture(img.data, img.width, img.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = wrapS; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/**
 * Asfalto: agregado (pedrisco claro, poro escuro, granulado), manchas largas e médias, trilhas de pneu polidas e mais escuras, a gota de óleo no meio
 * de cada faixa, remendos com a borda selada, juntas, trincas seladas e as marcações. `glow` é o mapa emissivo (só as marcações): à noite a tinta
 * refletiva acende um pouco e a curva se lê de longe.
 */
export function paintAsphalt(p: Palette, anisotropy: number): { map: THREE.DataTexture; glow: THREE.DataTexture } {
  return { map: dataTexture(asphaltImage(p), anisotropy), glow: dataTexture(glowImage(), anisotropy) };
}

/** Os mapas de normais e de rugosidade do asfalto (V22/F2, só da Média para cima): dados, não cor, com mipmap (o relevo some na distância em vez de cintilar). */
export interface RoadDetail { normal: THREE.DataTexture; rough: THREE.DataTexture }
const detailImages = new Map<string, { normal: RoadImage; rough: RoadImage }>();
function dataMap(img: RoadImage, anisotropy: number): THREE.DataTexture {
  const t = new THREE.DataTexture(img.data, img.width, img.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
/**
 * As duas texturas novas da pista para uma `roadEarth`: o desenho é por pista (a terra tem seixos e ondas; o asfalto, agregado), então se guarda o último par por valor de `earth`
 * (as duas pontas da corrida que muda, e a mesma pista de novo, não refazem os 1,5 milhão de texels).
 */
export function paintRoadDetail(earth: number, anisotropy: number): RoadDetail {
  const key = earth.toFixed(2);
  let imgs = detailImages.get(key);
  if (!imgs) {
    imgs = { normal: normalImage(earth), rough: roughnessImage(earth) };
    if (detailImages.size >= 2) detailImages.delete(detailImages.keys().next().value as string); // atalho: guarda 2 pares (~7 MB de RAM); mais que isso só se uma pista alternar > 2 biomas por sessão
    detailImages.set(key, imgs);
  }
  return { normal: dataMap(imgs.normal, anisotropy), rough: dataMap(imgs.rough, anisotropy) };
}

/** Zebra: blocos vermelho/branco de 1,5 m (uma repetição = 3 m; eram de 1 m e de longe viravam rosa). */
export const KERB_REPEAT_M = 3;
/** 96 px através (1,22 m: 79 px/m) × 256 ao longo (3 m: 85 px/m). */
export const KERB_TEX = { w: 96, h: 256 } as const;

/**
 * V22/F2: as marcas de borracha na zebra — riscas escuras ao longo do bloco (o pneu raspando na curva), na metade de dentro (u 0,1–0,4), de 0 (nada) a 1 (preto). Cada uma nasce e some
 * devagar, anda um pouco de lado e tem largura própria; sorteadas por índice (determinístico), repetem a cada 3 m com a zebra.
 */
function kerbStreaks(W: number, H: number): Float32Array {
  const out = new Float32Array(W * H);
  for (let n = 0; n < 6; n++) {
    const u0 = 0.1 + 0.3 * hash2(n, 811); const sig = 0.014 + 0.022 * hash2(n, 813); const drift = (hash2(n, 817) - 0.5) * 0.08;
    const y0 = Math.floor(H * hash2(n, 819)); const len = Math.floor(H * (0.3 + 0.55 * hash2(n, 821))); const power = 0.55 + 0.45 * hash2(n, 823);
    for (let j = 0; j < len; j++) {
      const t = j / len; const fade = Math.sin(Math.PI * t) ** 0.7; const uc = u0 + drift * t; const y = (y0 + j) % H;
      for (let x = 0; x < W; x++) { const e = ((x + 0.5) / W - uc) / sig; if (e * e < 9) out[y * W + x] = Math.min(1, out[y * W + x] + power * fade * Math.exp(-e * e)); }
    }
  }
  return out;
}

/**
 * A zebra em pixels: o bloco vermelho na metade de baixo (linhas 0..h/2) e o branco na de cima, friso escuro entre eles (V22/F2: com BISEL — um filete claro no começo de cada bloco e
 * uma sombra no fim, de ~5 px, 6 cm), a crista (u ≈ 0,5) um pouco mais clara, o pé de fora mais escuro, borracha na borda de dentro (V22/F2: um escurecimento que sobe do u 0,45 ao
 * 0,1 e as riscas do pneu, só nas curvas, que é onde a zebra existe) e um granulado fino.
 */
export function kerbImage(p: Palette): RoadImage {
  const W = KERB_TEX.w; const H = KERB_TEX.h;
  const red = hexToRgb(p.rumbleDark); const white = hexToRgb(p.rumbleLight);
  const streak = kerbStreaks(W, H);
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const isRed = y < H / 2;
    const c = isRed ? red : white;
    // Friso: 3 px escuros em cada troca de bloco (a do meio e a da repetição).
    const dy = Math.min(Math.abs(y + 0.5 - H / 2), y + 0.5, H - y - 0.5);
    const friso = dy < 1.6 ? 0.42 : dy < 2.6 ? 0.75 : 1;
    // Bisel: o filete claro logo depois do friso (começo do bloco) e a sombra logo antes do seguinte (fim do bloco).
    const ds = isRed ? y + 0.5 : y + 0.5 - H / 2; const de = (isRed ? H / 2 : H) - (y + 0.5);
    let bevel = 1;
    if (ds >= 2.6 && ds < 6.6) bevel *= 1 + 0.12 * (1 - (ds - 2.6) / 4);
    if (de >= 2.6 && de < 6.6) bevel *= 1 - 0.12 * (1 - (de - 2.6) / 4);
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const i = y * W + x;
      let kk = friso * bevel;
      kk *= 1 + 0.07 * Math.exp(-(((u - 0.5) / 0.09) ** 2)); // crista acesa
      kk *= 1 - 0.14 * sstep(0.86, 1, u); // pé de fora
      kk *= 1 - 0.28 * (1 - sstep(0.02, 0.1, u)); // borracha na borda de dentro
      kk *= 1 - 0.2 * (1 - sstep(0.12, 0.45, u)); // a borracha que o pneu deixa, subindo da crista para dentro
      kk *= 1 - 0.42 * streak[i]; // e as riscas
      kk *= 1 + 0.06 * (hash2(i, 401) - 0.5);
      const o = i * 4;
      data[o] = Math.min(255, c[0] * kk); data[o + 1] = Math.min(255, c[1] * kk); data[o + 2] = Math.min(255, c[2] * kk); data[o + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

export function paintKerb(p: Palette, anisotropy: number): THREE.DataTexture {
  return dataTexture(kerbImage(p), anisotropy);
}

/** Acostamento: sarjeta escura, guia clara, cascalho/terra com pedrisco e a faixa de transição até o terreno (V11). */
export const SHOULDER_REPEAT_M = 6;
/** 96 px através (1,4 m: 69 px/m) × 256 ao longo (6 m: 43 px/m). */
export const SHOULDER_TEX = { w: 96, h: 256 } as const;

/**
 * V22/F6: a oclusão de contato no pé de FORA da guia (onde o meio-fio assenta no cascalho): 1 fora de u 0,36–0,58 e até 0,75 no pé (u 0,47), em seno ao quadrado (sem degrau).
 * Antes o degradê só descia da guia clara ao cascalho: a guia parecia pintada no chão, sem assento. O lado de dentro já tem a sarjeta escura (u 0–0,1).
 */
export function shoulderContactAo(u: number): number {
  const t = (u - 0.36) / 0.22;
  if (t <= 0 || t >= 1) return 1;
  return 1 - 0.25 * Math.sin(Math.PI * t) ** 2;
}

/**
 * V11: o acostamento em pixels, do asfalto (u = 0) ao terreno (u = 1): a SARJETA escura de 0 a 0,10 (pó de pneu e sombra do meio-fio), a GUIA clara de 0,14 a
 * 0,40 (o meio-fio pintado, esmaecendo até 0,5), o miolo de cascalho/terra com pedrisco e manchas, e de 0,8 a 1 o degradê até a cor da faixa de transição do chão (`verge`:
 * é a cor da primeira coluna do terreno, então não há degrau). Pixel puro (testável no Node): era um canvas com um gradiente escuro só na borda de dentro.
 */
export function shoulderImage(p: Palette): RoadImage {
  const W = SHOULDER_TEX.w; const H = SHOULDER_TEX.h;
  const sh = hexToRgb(p.shoulder); const verge = hexToRgb(p.verge);
  const gut = hexToRgb(mix(mix(p.shoulder, p.roadBase, 0.3), '#000000', 0.58));
  const curb = hexToRgb(mix(p.shoulder, mix(p.rumbleLight, '#ffffff', 0.5), 0.62));
  const data = new Uint8Array(W * H * 4);
  const blot = new Lattice(41, 3, 6); // manchas de 6 m / 2 em 2 (periódico em ny × 1 m: aqui ny = 6 → 1 m por célula)
  // V22/F2: a borda guia → terreno deixa de ser uma régua: o ponto onde o terreno entra anda de lado ao longo da pista (células de 0,75 m e de 0,25 m, periódicas nos 6 m) e a
  // transição é esfarelada por pixel (ralo de capim e cascalho), só no meio dela.
  const wanderA = new Lattice(43, 1, 8); const wanderB = new Lattice(47, 1, 24);
  for (let y = 0; y < H; y++) {
    const my = (y + 0.5) * (SHOULDER_REPEAT_M / H);
    const edge = 0.72 + 0.11 * wanderA.at(0.5, my / 0.75) + 0.04 * wanderB.at(0.5, my / 0.25);
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W; const i = y * W + x;
      // De dentro para fora: sarjeta → guia → miolo → verge, cada passo com a borda suave.
      let r = sh[0]; let g = sh[1]; let b = sh[2];
      const wCurb = sstep(0.1, 0.15, u) * (1 - sstep(0.38, 0.5, u));
      r += (curb[0] - r) * wCurb; g += (curb[1] - g) * wCurb; b += (curb[2] - b) * wCurb;
      const wGut = 1 - sstep(0.075, 0.115, u);
      r += (gut[0] - r) * wGut; g += (gut[1] - g) * wGut; b += (gut[2] - b) * wGut;
      const base = sstep(edge - 0.07, edge + 0.07, u); const wVerge = Math.max(0, Math.min(1, base + (hash2(i, 4343) - 0.5) * 0.35 * 4 * base * (1 - base)));
      r += (verge[0] - r) * wVerge; g += (verge[1] - g) * wVerge; b += (verge[2] - b) * wVerge;
      // Pedrisco (claro e escuro) e manchas em escala de 1 m; mais fino perto da guia (concreto) que no cascalho.
      const k = (1 + 0.16 * (hash2(i, 4242) - 0.5) + 0.07 * blot.at(u * 1.4 / 0.5, my / 1)) * shoulderContactAo(u);
      data[i * 4] = Math.min(255, r * k); data[i * 4 + 1] = Math.min(255, g * k); data[i * 4 + 2] = Math.min(255, b * k); data[i * 4 + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

export function paintShoulder(p: Palette, anisotropy: number): THREE.DataTexture {
  return dataTexture(shoulderImage(p), anisotropy);
}

/**
 * V11: o tom de um trecho da pista (multiplica a textura do asfalto por vértice): ao longo de dezenas de metros o asfalto/terra é mais claro, mais quente ou mais
 * frio, e os dois lados diferem um pouco (um lado mais gasto). Só do índice do segmento (a mesma volta, o mesmo tom), contínuo entre vizinhos (ruído de valor
 * suave em células de 12 e 9 segmentos), 0,92–1,08 por canal. `side`: −1 esquerda, 1 direita.
 */
export function stretchTint(index: number, side: number): [number, number, number] {
  const seed = side < 0 ? 17 : 29;
  const noise = (cell: number, salt: number): number => {
    const x = index / cell; const i = Math.floor(x); const f = x - i; const w = f * f * (3 - 2 * f);
    const a = hash2(i, salt + seed) * 2 - 1; const b = hash2(i + 1, salt + seed) * 2 - 1;
    return a + (b - a) * w;
  };
  const light = 0.05 * noise(12, 601); const warm = 0.03 * noise(9, 733);
  return [1 + light + warm, 1 + light, 1 + light - warm];
}

/** Largura do box em x normalizado (a divisa listrada é a faixa que a física trata como grama). */
export const PIT_X0 = 1.02;
export const PIT_X1 = 2.06;
/** Onde a física põe a faixa do box (sim/physics.ts: 1,25 < x < 1,95). */
export const PIT_LANE_X: readonly [number, number] = [1.25, 1.95];
export const PIT_REPEAT_M = 16;

/**
 * Box: divisa zebrada (branco/amarelo em diagonal) até a linha amarela, faixa de concreto claro
 * com as vagas contornadas em branco e "BOX" pintado no chão, linha branca na borda de fora.
 */
export function paintPit(p: Palette, anisotropy: number): THREE.CanvasTexture {
  const W = 256; const H = 512;
  const [c, ctx] = canvas(W, H);
  const u = (x: number) => ((x - PIT_X0) / (PIT_X1 - PIT_X0)) * W;
  ctx.fillStyle = p.pit; ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, 14, 6, 777, 2);
  const lane0 = u(PIT_LANE_X[0]); const lane1 = u(PIT_LANE_X[1]);
  // Divisa: diagonais amarelas sobre o asfalto da pista.
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, lane0 - 6, H); ctx.clip();
  ctx.fillStyle = p.asphalt; ctx.fillRect(0, 0, lane0, H);
  ctx.strokeStyle = p.pitLine; ctx.lineWidth = 9;
  for (let y = -H; y < H * 2; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(lane0, y + lane0 * 0.8); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = p.pitLine;
  ctx.fillRect(lane0 - 8, 0, 9, H);
  ctx.fillStyle = mix(p.lane, p.pit, 0.1);
  ctx.fillRect(lane1, 0, 6, H);
  // Vaga: contorno em U aberto para a pista.
  const x0 = lane0 + 18; const x1 = lane1 - 14;
  ctx.strokeStyle = mix(p.lane, p.pit, 0.15); ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(x0, 40); ctx.lineTo(x1, 40); ctx.lineTo(x1, 300); ctx.lineTo(x0, 300); ctx.stroke();
  // "BOX" no chão, lido por quem chega (de baixo para cima na textura = para a frente na pista).
  ctx.save();
  ctx.translate((x0 + x1) / 2, 410);
  ctx.fillStyle = mix(p.pitLine, p.pit, 0.1);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '900 64px "Segoe UI", Roboto, Arial, sans-serif';
  ctx.scale(1, 1.6);
  ctx.fillText('BOX', 0, 0);
  ctx.restore();
  return makeTexture(c, anisotropy);
}

/** Onde fica a última fila do grid cheio (unidades antes da linha). */
const GRID_LAST_ROW = GRID_FRONT_GAP + (Math.ceil(MAX_CARS / 2) - 1) * GRID_ROW_GAP;
/**
 * Decalque da largada: cobre `START_BEHIND` segmentos antes da linha e `START_AHEAD` depois. Sai do grid do núcleo
 * (mais um segmento para a traseira do último carro): era um 18 fixo, e o grid que se espaçou na onda F saiu dele.
 */
export const START_BEHIND = Math.ceil(GRID_LAST_ROW / SEGMENT_LENGTH) + 1;
export const START_AHEAD = 1;

/** Marca de uma posição de grid: distância (m) antes da linha e x (meia-larguras). */
export interface GridMark { behindM: number; x: number }

/**
 * Posições do grid como sim/race.ts as monta (2 por fila, humanos no fim), das mesmas constantes do núcleo
 * (GRID_FRONT_GAP, GRID_ROW_GAP, GRID_LANE_X). tests/render-ground.test.ts confere contra o `createRace` de verdade.
 */
export function gridMarks(cars: number): GridMark[] {
  const marks: GridMark[] = [];
  for (let i = 0; i < cars; i++) {
    const row = Math.floor(i / 2);
    marks.push({ behindM: (GRID_FRONT_GAP + row * GRID_ROW_GAP) * (SEGMENT_M / SEGMENT_LENGTH), x: i % 2 === 0 ? -GRID_LANE_X : GRID_LANE_X });
  }
  return marks;
}

export function paintStartDecal(p: Palette, segmentM: number, anisotropy: number): THREE.CanvasTexture {
  const W = 256; const H = 1024;
  const [c, ctx] = canvas(W, H);
  ctx.clearRect(0, 0, W, H);
  const total = (START_BEHIND + START_AHEAD) * segmentM;
  const lineAt = START_BEHIND * segmentM; // metros desde o começo do decalque
  const road = ROAD_HALF_WIDTH_M * 2;
  const X = (xm: number) => ((xm + ROAD_HALF_WIDTH_M) / road) * W;
  const Y = (m: number) => (1 - m / total) * H;
  const white = mix(p.lane, '#ffffff', 0.5);
  // Quadriculado: 3 fileiras de 0,6 m, 22 colunas, entre duas linhas brancas.
  const rows = 3; const cell = 0.6; const cols = 22;
  const y0 = lineAt - (rows * cell) / 2;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    ctx.fillStyle = (r + k) % 2 === 0 ? '#f4f4f4' : '#161616';
    const xa = X(-ROAD_HALF_WIDTH_M + (k * road) / cols); const xb = X(-ROAD_HALF_WIDTH_M + ((k + 1) * road) / cols);
    const ya = Y(y0 + (r + 1) * cell); const yb = Y(y0 + r * cell);
    ctx.fillRect(Math.floor(xa), Math.floor(ya), Math.ceil(xb - xa), Math.ceil(yb - ya));
  }
  ctx.fillStyle = white;
  for (const m of [y0 - 0.35, y0 + rows * cell + 0.2]) ctx.fillRect(0, Math.round(Y(m + 0.15)), W, Math.max(3, Math.round((0.15 / total) * H)));
  // Marcas do grid: um colchete na frente de cada carro (o bico fica ~2,4 m à frente do centro).
  ctx.strokeStyle = white; ctx.lineWidth = 4; ctx.lineCap = 'butt';
  for (const g of gridMarks(20)) {
    const m = lineAt - g.behindM + 2.6;
    if (m < 1) continue;
    const xc = g.x * ROAD_HALF_WIDTH_M;
    ctx.beginPath();
    ctx.moveTo(X(xc - 1.25), Y(m - 1.1)); ctx.lineTo(X(xc - 1.25), Y(m)); ctx.lineTo(X(xc + 1.25), Y(m)); ctx.lineTo(X(xc + 1.25), Y(m - 1.1));
    ctx.stroke();
  }
  const t = makeTexture(c, anisotropy);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Poça de luz (radial, branca; a cor vem do material). */
export function paintPool(): THREE.CanvasTexture {
  const S = 64;
  const [c, ctx] = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
