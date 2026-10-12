// Pista fechada (M6, docs/ondas/M/M6.md): com o traçado do mapa a pista fecha em 360° e muitas pistas cruzam a si mesmas (28 das 109 passam a menos de 14 m
// de outro trecho; 35, a menos de 50 m). O layout é por segmento e cada trecho decora a própria beira sem saber do outro, então o cenário de um trecho caía em
// cima da pista de outro (árvore no asfalto, casa no cruzamento) e dois trechos empilhavam objetos no mesmo chão.
//
// Esta passada roda UMA vez por pista, no fim de `sceneryLayout`, no mundo (a linha central desenrolada em duas voltas, como `unrollTrack`):
//   1. um objeto que cairia na pista, ou na faixa onde o carro anda, de OUTRO trecho é descartado;
//   2. dois objetos altos de trechos diferentes que se sobrepõem: fica o que a física ou o marco exige e, no resto, o primeiro do layout.
// "Outro trecho" = a linha central a mais de MIN_ARC segmentos de arco (o próprio trecho e a vizinhança de curva fechada já são resolvidos pela ocupação do layout),
// dentro da janela que o renderizador desenha; e, de qualquer trecho (inclusive o próprio, na curva fechada: o grampo cruza a si mesmo), a faixa da pista com 3 m de
// folga. O que o núcleo manda NÃO se move: sprite (sólido ou não: a ordem dos sprites do segmento é o contrato com o núcleo) e marco (placeLandmarks já o afasta das
// pistas à vista, LANDMARK_CLEAR_M). Puro e determinístico (sem azar, só geometria, na ordem do layout).
import type { Track } from '../../core/types';
import { FRAME_AHEAD, FRAME_BEHIND } from '../roadframe';
import { ROAD_HALF_WIDTH_M, SEGMENT_M, turnPerCurve } from '../units';
import { landmarkOf, modelBandRadius, modelBounds, modelHeight, spriteVisual } from './catalog';
import type { Placement } from './layout';

/** Separação de arco (segmentos) acima da qual o ponto é "de outro trecho". */
export const OVERLAP_MIN_ARC = 40;
/** A janela do renderizador (30 atrás + o maior alcance à frente): o que está além dela nunca aparece junto. */
export const OVERLAP_WINDOW = FRAME_BEHIND + Math.max(...Object.values(FRAME_AHEAD));
/** Arco (segmentos) até o qual a pista "é a do próprio trecho" na regra da faixa: a forração mora a 9,6 m do eixo e vê o vértice 2 a 4 segmentos adiante a < 12 m. */
const LANE_MIN_ARC = 8;
/** Altura (m) até a qual o objeto é "baixo": o carro passa por cima dele (forração, calçadão). */
const LOW_M = 1.1;
/** Folga (m) sobre a regra: a linha central é medida nos vértices, a cada 4 m. */
const MARGIN_M = 2;
/** Dois objetos altos de trechos diferentes se sobrepõem quando os centros ficam a menos desta fração da soma dos raios da pegada. */
const OVERLAP_FRACTION = 0.8;
const CELL_M = 64;

interface Item {
  i: number; p: Placement; x: number; z: number;
  /** As colocações do mesmo sprite do núcleo (um sprite pode ter mais de um modelo): saem juntas ou ficam juntas. */
  group: Placement[] | null;
  /** Raio (m) da pegada no chão, com a escala. */
  r: number;
  low: boolean; landmark: boolean;
  /** Caixa orientada do marco (referencial local, já com a escala) e o giro do modelo no mundo. */
  box?: { minX: number; maxX: number; minZ: number; maxZ: number; ct: number; st: number };
}

class Grid {
  private readonly cells = new Map<number, number[]>();
  constructor(private readonly cell: number) {}
  private key(gx: number, gz: number): number { return gx * 100003 + gz; }
  add(idx: number, x: number, z: number): void {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    const l = this.cells.get(k);
    if (l) l.push(idx); else this.cells.set(k, [idx]);
  }
  /** Percorre os índices guardados nas células que a caixa (x ± r, z ± r) toca. */
  around(x: number, z: number, r: number, visit: (idx: number) => void): void {
    const c = this.cell;
    for (let gx = Math.floor((x - r) / c); gx <= Math.floor((x + r) / c); gx++) {
      for (let gz = Math.floor((z - r) / c); gz <= Math.floor((z + r) / c); gz++) {
        const l = this.cells.get(this.key(gx, gz));
        if (l) for (const idx of l) visit(idx);
      }
    }
  }
}

/**
 * Descarta do `bySeg` (no lugar) o cenário que invade outro trecho ou se empilha em outro trecho. Devolve quantas colocações saíram. `carReachM` = o alcance do carro fora
 * da pista (layout.ts, `CAR_REACH_M`). `models` = `Layout.models` (o índice de `Placement.model`).
 */
export function cullCrossings(track: Track, models: readonly string[], bySeg: Placement[][], carReachM: number): number {
  const segs = track.segments; const n = segs.length;
  const turn = turnPerCurve(track);
  // A linha central em duas voltas: o segmento i é medido na do meio (k = i + n), com a vizinhança antes e depois.
  const px = new Float64Array(2 * n + 1); const pz = new Float64Array(2 * n + 1); const hd = new Float64Array(2 * n + 1);
  for (let k = 0; k < 2 * n; k++) {
    const d = segs[k % n].curve * turn;
    const a = hd[k] + d / 2;
    px[k + 1] = px[k] + SEGMENT_M * Math.sin(a); pz[k + 1] = pz[k] - SEGMENT_M * Math.cos(a); hd[k + 1] = hd[k] + d;
  }
  const road = new Grid(CELL_M);
  for (let k = 0; k <= 2 * n; k++) road.add(k, px[k], pz[k]);

  // Os sprites sólidos do núcleo são as primeiras colocações do segmento (`placeSprites`), `spriteVisual(...).models.length` por sprite.
  const items: Item[] = [];
  const groups = new Map<Placement, Placement[]>();
  for (let i = 0; i < n; i++) {
    const list = bySeg[i];
    if (list.length === 0) continue;
    let cursor = 0;
    for (const sp of segs[i].sprites) {
      const count = spriteVisual(sp.kind, sp.variant, sp.scale, track.def).models.length;
      const group = list.slice(cursor, cursor + count);
      for (const q of group) groups.set(q, group);
      cursor += count;
    }
  }
  const radii = new Map<string, number>();
  const radiusOf = (id: string): number => {
    let r = radii.get(id);
    if (r === undefined) { r = modelBandRadius(id); radii.set(id, r); }
    return r;
  };
  for (let i = 0; i < n; i++) {
    const k = i + n;
    for (const p of bySeg[i]) {
      const id = models[p.model];
      const landmark = landmarkOf(id) !== undefined;
      const cx = px[k] + (px[k + 1] - px[k]) * p.f; const cz = pz[k] + (pz[k + 1] - pz[k]) * p.f;
      const h = hd[k] + (hd[k + 1] - hd[k]) * p.f;
      const x = cx + p.x * Math.cos(h); const z = cz + p.x * Math.sin(h);
      const it: Item = { i, p, x, z, group: groups.get(p) ?? null, r: radiusOf(id) * Math.max(p.sx, p.sz), low: !landmark && modelHeight(id) * p.sy <= LOW_M, landmark };
      if (landmark) {
        const b = modelBounds(id);
        // O modelo gira `yaw` sobre o rumo da pista (o three gira por −rumo + yaw): o mesmo ct/st do `LandmarkFoot` do layout.
        const th = -h + p.yaw;
        it.box = { minX: b.minX * p.sx, maxX: b.maxX * p.sx, minZ: b.minZ * p.sz, maxZ: b.maxZ * p.sz, ct: Math.cos(th), st: Math.sin(th) };
      }
      items.push(it);
    }
  }

  const drop = new Set<Item>();
  // 1) Na pista (ou na faixa do carro) de outro trecho.
  for (const it of items) {
    if (it.landmark || it.p.sprite) continue;
    const clear = (it.low ? ROAD_HALF_WIDTH_M + 3 : carReachM + it.r) + MARGIN_M;
    const k0 = it.i + n;
    let hit = false;
    const lane = ROAD_HALF_WIDTH_M + 3 + MARGIN_M;
    road.around(it.x, it.z, clear, (k) => {
      if (hit) return;
      const arc = Math.abs(k - k0);
      if (arc > OVERLAP_WINDOW) return;
      const d = Math.hypot(px[k] - it.x, pz[k] - it.z);
      // Outro trecho: a faixa do carro (ou, o que anda por cima, a pista); qualquer trecho, até o próprio dobrado sobre si na curva fechada: a pista com 3 m de folga.
      if ((arc > OVERLAP_MIN_ARC && d < clear) || (arc > LANE_MIN_ARC && d < lane)) hit = true;
    });
    if (hit) drop.add(it);
  }

  // 2) Objetos altos de trechos diferentes que se sobrepõem. Os fixos (marco, sólido do núcleo) ficam; no resto fica o primeiro do layout.
  const apart = (a: number, b: number): boolean => { const d = Math.abs(a - b); return Math.min(d, n - d) > OVERLAP_MIN_ARC; };
  const marks = items.filter((it) => it.landmark && it.box);
  const movable = items.filter((it) => !it.low && !it.landmark && !it.p.sprite && !drop.has(it));
  // 2a) Em cima de um marco de outro trecho (a caixa orientada dele contra o raio do objeto, qualquer tamanho).
  for (const it of movable) {
    for (const m of marks) {
      const box = m.box;
      if (!box || !apart(m.i, it.i)) continue;
      const dx = it.x - m.x; const dz = it.z - m.z;
      const lx = dx * box.ct - dz * box.st; const lz = dx * box.st + dz * box.ct;
      const d = Math.hypot(Math.max(box.minX - lx, 0, lx - box.maxX), Math.max(box.minZ - lz, 0, lz - box.maxZ));
      if (d < it.r * OVERLAP_FRACTION) { drop.add(it); break; }
    }
  }
  // 2b) Um sobre o outro (os de pegada pequena não contam: moita, pedrinha). Os sólidos do núcleo entram primeiro.
  const placed = new Grid(24);
  const list: Item[] = [];
  const add = (it: Item): void => { placed.add(list.length, it.x, it.z); list.push(it); };
  for (const it of items) if (it.p.sprite && !it.low && it.r >= 1.4) add(it);
  for (const it of movable) {
    if (drop.has(it) || it.r < 1.4) continue;
    let hit = false;
    placed.around(it.x, it.z, it.r + 70, (idx) => {
      if (!hit && apart(list[idx].i, it.i) && Math.hypot(list[idx].x - it.x, list[idx].z - it.z) < OVERLAP_FRACTION * (list[idx].r + it.r)) hit = true;
    });
    if (hit) drop.add(it); else add(it);
  }

  if (drop.size === 0) return 0;
  const gone = new Set<Placement>();
  for (const it of drop) { gone.add(it.p); if (it.group) for (const q of it.group) gone.add(q); }
  // O que depende de uma peça que saiu sai com ela: o rotor da turbina (no mesmo ponto) e os fios do poste (que parte dele ou chega nele).
  for (const it of items) {
    if (!gone.has(it.p)) continue;
    const id = models[it.p.model];
    if (id === 'turbine') for (const o of bySeg[it.i]) if (models[o.model] === 'rotor' && o.x === it.p.x && o.f === it.p.f) gone.add(o);
    if (id === 'pole') {
      for (const o of bySeg[it.i]) if (models[o.model] === 'wires' && o.x === it.p.x && o.f === it.p.f) gone.add(o);
      for (const o of items) {
        if (models[o.p.model] === 'wires' && o.p.linkSeg > 0 && (o.i + o.p.linkSeg) % n === it.i && o.p.linkX === it.p.x) gone.add(o.p);
      }
    }
  }
  let removed = 0;
  for (let i = 0; i < n; i++) {
    const list2 = bySeg[i];
    if (list2.length === 0) continue;
    let any = false;
    for (const p of list2) if (gone.has(p)) { any = true; break; }
    if (!any) continue;
    const keep = list2.filter((p) => !gone.has(p));
    removed += list2.length - keep.length;
    bySeg[i] = keep;
  }
  return removed;
}
