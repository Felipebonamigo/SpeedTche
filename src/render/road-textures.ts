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
 * O desgaste do asfalto, como dado (os testes o leem): remendos com a borda selada, juntas transversais de construção, trincas seladas e a junta
 * longitudinal da pavimentação. As trilhas de pneu (centro de cada faixa ± 0,8 m) e a gota de óleo (centro da faixa) são o padrão de cada faixa.
 */
export const ASPHALT_WEAR: { patches: readonly AsphaltPatch[]; joints: readonly number[]; cracks: readonly AsphaltCrack[]; seams: readonly number[] } = {
  patches: [
    { x0: 1.0, x1: 3.4, y0: 6.0, y1: 9.6, tone: 0.88 }, // remendo novo, escuro e liso, sobre a trilha da faixa da direita
    { x0: -5.7, x1: -3.3, y0: 20.5, y1: 23.2, tone: 1.15 }, // remendo antigo, claro e gasto
    { x0: 1.2, x1: 5.6, y0: 37.0, y1: 41.5, tone: 0.9 }, // recapeamento da faixa da direita
  ],
  joints: [29.0],
  cracks: [{ y: 14.2, x0: -6.3, x1: 1.6, amp: 0.18, seed: 7 }, { y: 44.6, x0: -2.2, x1: 4.8, amp: 0.12, seed: 11 }],
  seams: [0.32],
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

interface AsphaltStructure { k: Float32Array; stone: Uint8Array; mark: Uint8Array }
let asphaltCache: AsphaltStructure | null = null;

/**
 * O desenho do asfalto, sem cor (o mesmo nas duas pontas da corrida que muda): `k` multiplica a cor base (tom: manchas, trilhas, óleo, remendos,
 * juntas, trincas, granulado), `stone` é o agregado claro (0..255) e `mark` a cobertura da tinta (0..255). Montado uma vez por sessão.
 */
function asphaltStructure(): AsphaltStructure {
  if (asphaltCache) return asphaltCache;
  const W = ASPHALT_TEX.w; const H = ASPHALT_TEX.h;
  const RW = ROAD_HALF_WIDTH_M * 2; const R = ASPHALT_REPEAT_M;
  const pu = W / RW; const pv = H / R;
  const k = new Float32Array(W * H); const stone = new Uint8Array(W * H); const mark = new Uint8Array(W * H);
  // Por coluna: trilhas (polidas e escurecidas pela borracha), óleo no meio da faixa, poeira junto da borda e a tinta das faixas de bordo e do traço.
  const colTrack = new Float32Array(W); const colOil = new Float32Array(W); const colEdge = new Float32Array(W);
  const colLine = new Float32Array(W); const colDash = new Float32Array(W); const rowDash = new Float32Array(H);
  const M = MARKINGS;
  const L = (m: number): number => (m + ROAD_HALF_WIDTH_M) * pu;
  for (let x = 0; x < W; x++) {
    const m = (x + 0.5) / pu - ROAD_HALF_WIDTH_M;
    let tr = 0; let oil = 0;
    for (const lc of LANES_M) {
      for (const sg of [-1, 1]) { const d = Math.abs(m - (lc + sg * TRACK_OFFSET_M)); tr = Math.max(tr, d < 0.22 ? 1 : d < 0.5 ? 0.5 + 0.5 * Math.cos((Math.PI * (d - 0.22)) / 0.28) : 0); }
      const d = Math.abs(m - lc); oil = Math.max(oil, d < 0.16 ? 1 : d < 0.36 ? 0.5 + 0.5 * Math.cos((Math.PI * (d - 0.16)) / 0.2) : 0);
    }
    colTrack[x] = tr; colOil[x] = oil; colEdge[x] = sstep(5.7, 6.9, Math.abs(m));
    colLine[x] = Math.max(cover(x, L(-ROAD_HALF_WIDTH_M + M.edgeOffsetM), L(-ROAD_HALF_WIDTH_M + M.edgeOffsetM + M.edgeWidthM)),
      cover(x, L(ROAD_HALF_WIDTH_M - M.edgeOffsetM - M.edgeWidthM), L(ROAD_HALF_WIDTH_M - M.edgeOffsetM)));
    colDash[x] = cover(x, L(-M.dashWidthM / 2), L(M.dashWidthM / 2));
  }
  for (let y = 0; y < H; y++) for (let d = 0; d < R / M.dashPeriodM; d++) rowDash[y] = Math.max(rowDash[y], cover(y, d * M.dashPeriodM * pv, (d * M.dashPeriodM + M.dashLengthM) * pv));
  // Manchas largas (recapeamentos, sol, chuva), médias (mosqueado), riscas de borracha (finas através, compridas ao longo) e as manchas de óleo.
  const big = new Lattice(3, Math.ceil(RW / 2.2), Math.round(R / 3));
  const mid = new Lattice(5, Math.ceil(RW / 0.55), Math.round(R / 0.6));
  const streak = new Lattice(9, Math.ceil(RW / 0.07), Math.round(R / 4));
  const blotN = new Lattice(13, Math.ceil(RW / 0.3), Math.round(R / 0.7));
  const crackY = ASPHALT_WEAR.cracks.map((c) => {
    const n1 = new Lattice(c.seed, Math.ceil(RW / 0.9), 1); const n2 = new Lattice(c.seed + 3, Math.ceil(RW / 0.25), 1);
    const ys = new Float32Array(W);
    for (let x = 0; x < W; x++) { const u = (x + 0.5) / pu; ys[x] = c.y + c.amp * (0.65 * n1.at(u / 0.9, 0) + 0.35 * n2.at(u / 0.25, 0)); }
    return ys;
  });
  const SEAL = 0.07; // largura da borda selada (m)
  const patches = ASPHALT_WEAR.patches;
  for (let y = 0; y < H; y++) {
    const my = (y + 0.5) / pv;
    let joint = 1;
    for (const j of ASPHALT_WEAR.joints) if (Math.abs(my - j) < 0.03) joint = 0.58;
    const rowPatches = patches.filter((q) => my >= q.y0 && my <= q.y1);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const mx = (x + 0.5) / pu - ROAD_HALF_WIDTH_M;
      const ux = (x + 0.5) / pu;
      let patch: AsphaltPatch | null = null;
      for (const q of rowPatches) if (mx >= q.x0 && mx <= q.x1) { patch = q; break; }
      const fresh = patch !== null && patch.tone < 1;
      // Trilha mais fraca no remendo novo (o pneu ainda não o poliu).
      const tr = colTrack[x] * (fresh ? 0.35 : 1);
      let kk = (1 + 0.05 * big.at(ux / 2.2, my / 3) + 0.035 * mid.at(ux / 0.55, my / 0.6));
      if (tr > 0) kk *= 1 - 0.12 * tr * (0.8 + 0.2 * streak.at(ux / 0.07, my / 4));
      // Gota de óleo e fuligem no meio de cada faixa, em manchas ao longo.
      if (colOil[x] > 0) { const b = blotN.at(ux / 0.3, my / 0.7) * 0.5 + 0.5; kk *= 1 - 0.1 * colOil[x] * b * b; }
      kk *= 1 + 0.04 * colEdge[x];
      // Granulado fino (menor na trilha polida) e o agregado: pedrisco claro e poro escuro.
      kk *= 1 + 0.11 * (hash2(i, 77) - 0.5) * (1 - 0.5 * tr);
      const h = hash2(i, 191);
      let st = 0;
      if (h < 0.06) st = 70 + 120 * hash2(i, 193);
      else if (h < 0.11) kk *= 0.8;
      st *= 1 - 0.75 * tr;
      if (patch) {
        kk *= patch.tone;
        st *= fresh ? 0.45 : 1.25;
        // Borda selada: piche escuro em volta do remendo.
        if (mx - patch.x0 < SEAL || patch.x1 - mx < SEAL || my - patch.y0 < SEAL || patch.y1 - my < SEAL) { kk *= 0.72; st = 0; }
      }
      if (joint < 1) { kk *= joint; st = 0; }
      for (const sm of ASPHALT_WEAR.seams) if (Math.abs(mx - sm) < 0.016) kk *= 0.86;
      for (let c = 0; c < crackY.length; c++) {
        const cr = ASPHALT_WEAR.cracks[c];
        if (mx >= cr.x0 && mx <= cr.x1 && Math.abs(my - crackY[c][x]) < 0.035) { kk *= 0.52; st = 0; }
      }
      k[i] = kk;
      stone[i] = st > 255 ? 255 : Math.round(st);
      // Tinta: a cobertura antisserrilhada, gasta de leve (lascas onde o agregado aparece).
      const cov = Math.max(colLine[x], colDash[x] * rowDash[y]);
      if (cov > 0) {
        const wear = hash2(i, 311) < 0.03 ? 0.45 : 1 - 0.1 * hash2(i, 313);
        mark[i] = Math.round(255 * cov * wear);
      }
    }
  }
  asphaltCache = { k, stone, mark };
  return asphaltCache;
}

/** O asfalto pintado nas cores de uma paleta: a cor base × o tom, o agregado claro (cinza neutro) e a tinta por cima. */
export function asphaltImage(p: Palette): RoadImage {
  const W = ASPHALT_TEX.w; const H = ASPHALT_TEX.h;
  const { k, stone, mark } = asphaltStructure();
  const [r0, g0, b0] = hexToRgb(p.asphalt);
  const sg = Math.min(220, ((0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0) * 1.75));
  const [lr, lg, lb] = hexToRgb(mix(p.lane, p.asphalt, 0.08));
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const kk = k[i]; const s = stone[i] / 255; const m = mark[i] / 255;
    let r = r0 * kk; let g = g0 * kk; let b = b0 * kk;
    r += (sg * kk - r) * s; g += (sg * kk - g) * s; b += (sg * 0.97 * kk - b) * s;
    r += (lr - r) * m; g += (lg - g) * m; b += (lb - b) * m;
    const o = i * 4;
    data[o] = r < 0 ? 0 : r > 255 ? 255 : r; data[o + 1] = g < 0 ? 0 : g > 255 ? 255 : g; data[o + 2] = b < 0 ? 0 : b > 255 ? 255 : b; data[o + 3] = 255;
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

/** Zebra: blocos vermelho/branco de 1,5 m (uma repetição = 3 m; eram de 1 m e de longe viravam rosa). */
export const KERB_REPEAT_M = 3;
/** 96 px através (1,22 m: 79 px/m) × 256 ao longo (3 m: 85 px/m). */
export const KERB_TEX = { w: 96, h: 256 } as const;

/**
 * A zebra em pixels: o bloco vermelho na metade de baixo (linhas 0..h/2) e o branco na de cima, friso escuro entre eles, a crista (u ≈ 0,5) um pouco
 * mais clara, o pé de fora mais escuro, borracha na borda de dentro e um granulado fino.
 */
export function kerbImage(p: Palette): RoadImage {
  const W = KERB_TEX.w; const H = KERB_TEX.h;
  const red = hexToRgb(p.rumbleDark); const white = hexToRgb(p.rumbleLight);
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const isRed = y < H / 2;
    const c = isRed ? red : white;
    // Friso: 3 px escuros em cada troca de bloco (a do meio e a da repetição).
    const dy = Math.min(Math.abs(y + 0.5 - H / 2), y + 0.5, H - y - 0.5);
    const friso = dy < 1.6 ? 0.42 : dy < 2.6 ? 0.75 : 1;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const i = y * W + x;
      let kk = friso;
      kk *= 1 + 0.07 * Math.exp(-(((u - 0.5) / 0.09) ** 2)); // crista acesa
      kk *= 1 - 0.14 * sstep(0.86, 1, u); // pé de fora
      kk *= 1 - 0.28 * (1 - sstep(0.02, 0.1, u)); // borracha na borda de dentro
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

/** Acostamento: cascalho/terra (cor da paleta) com pedrisco claro e escuro. */
export const SHOULDER_REPEAT_M = 6;
export function paintShoulder(p: Palette, anisotropy: number): THREE.CanvasTexture {
  const W = 64; const H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = p.shoulder; ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, 34, 12, 4242, 3);
  // A borda de dentro, junto do asfalto, um pouco mais escura (pó de pneu).
  const grd = ctx.createLinearGradient(0, 0, W * 0.35, 0);
  grd.addColorStop(0, 'rgba(0,0,0,0.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, W * 0.35, H);
  return makeTexture(c, anisotropy);
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
