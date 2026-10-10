// M6 (a), cenário que passa a se cruzar: com o traçado do mapa a pista fecha em 360° e 28 das 109 pistas passam a cruzar a si mesmas (docs/ondas/M/M6.md, §2).
// O cenário de um trecho não pode cair em cima da pista de outro (nem da faixa onde o carro anda), nem se sobrepor ao de outro trecho nem a um marco.
// Regras escritas aqui à mão, sem usar o módulo que as cumpre (scenery/overlap.ts): quem confere não pode ser quem decide.
//   - "Outro trecho" = a linha central a mais de 40 segmentos de arco, dentro da janela que o renderizador desenha (30 atrás + 260 à frente = 290).
//   - O que o carro pisa (forração, calçadão: ≤ 1,1 m de altura) fica a ≥ meia pista + 3 m da linha central de outro trecho; o resto, a ≥ o alcance do carro
//     (CAR_REACH_M, a faixa onde ele consegue chegar) + o raio do objeto.
//   - Os sólidos do núcleo (sprites que colidem) NÃO se movem: são a física. Aqui só se conta quantos caem na pista de outro trecho (o teto de cada pista é a medida
//     que a M6 deixou, e só desce).
import { describe, expect, it } from 'vitest';
import { getTrack, TRACKS } from '../src/core/track';
import type { Track } from '../src/core/types';
import { LANDMARK_PREFIX, modelBandRadius, modelBounds, modelHeight } from '../src/render/scenery/catalog';
import { CAR_REACH_M, sceneryLayout, type Layout, type Placement } from '../src/render/scenery/layout';
import { ROAD_HALF_WIDTH_M, SEGMENT_M, turnPerCurve } from '../src/render/units';

const MIN_ARC = 40;
const WINDOW = 290;
const LOW_M = 1.1;
/** Folga do teste sobre a regra (m): a regra mede o vértice da linha central a cada 4 m. */
const SLACK = 0.5;

interface World { n: number; px: Float64Array; pz: Float64Array; hd: Float64Array }

/** Linha central em duas voltas (a do meio, k = i + n, é a de cada segmento i): a pista do DSL não fecha em posição, só vale a vizinhança. */
function world(track: Track): World {
  const n = track.segments.length;
  const turn = turnPerCurve(track);
  const px = new Float64Array(2 * n + 1); const pz = new Float64Array(2 * n + 1); const hd = new Float64Array(2 * n + 1);
  for (let k = 0; k < 2 * n; k++) {
    const d = track.segments[k % n].curve * turn;
    const a = hd[k] + d / 2;
    px[k + 1] = px[k] + SEGMENT_M * Math.sin(a); pz[k + 1] = pz[k] - SEGMENT_M * Math.cos(a); hd[k + 1] = hd[k] + d;
  }
  return { n, px, pz, hd };
}

/** Onde o renderizador põe o objeto (roadframe.ts `locateOnFrame`): na fração `f` do segmento e `x` m para a direita do rumo. */
function at(w: World, i: number, p: Pick<Placement, 'f' | 'x'>): [number, number] {
  const k = i + w.n;
  const cx = w.px[k] + (w.px[k + 1] - w.px[k]) * p.f; const cz = w.pz[k] + (w.pz[k + 1] - w.pz[k]) * p.f;
  const h = w.hd[k] + (w.hd[k + 1] - w.hd[k]) * p.f;
  return [cx + p.x * Math.cos(h), cz + p.x * Math.sin(h)];
}

/** Grade espacial dos vértices da linha central (células de 64 m): o teste mede milhares de objetos por pista. */
class Grid {
  private readonly cells = new Map<number, number[]>();
  constructor(private readonly w: World, private readonly cell = 64) {
    for (let k = 0; k <= 2 * w.n; k++) this.add(this.key(w.px[k], w.pz[k]), k);
  }
  private key(x: number, z: number): number { return Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell); }
  private add(key: number, k: number): void { const l = this.cells.get(key); if (l) l.push(k); else this.cells.set(key, [k]); }
  /** Vértices a menos de `r` do ponto. */
  near(x: number, z: number, r: number, visit: (k: number) => void): void {
    const c = this.cell;
    for (let gx = Math.floor((x - r) / c); gx <= Math.floor((x + r) / c); gx++) {
      for (let gz = Math.floor((z - r) / c); gz <= Math.floor((z + r) / c); gz++) {
        const l = this.cells.get(gx * 100003 + gz);
        if (!l) continue;
        for (const k of l) if (Math.hypot(this.w.px[k] - x, this.w.pz[k] - z) < r) visit(k);
      }
    }
  }
}

interface Info { id: string; radius: number; low: boolean; landmark: boolean }
const infoCache = new Map<string, Info>();
function infoOf(id: string, p: Pick<Placement, 'sx' | 'sy' | 'sz'>): Info {
  let base = infoCache.get(id);
  if (!base) {
    const landmark = id.startsWith(LANDMARK_PREFIX);
    let radius: number;
    if (landmark) { const b = modelBounds(id); radius = Math.hypot(Math.max(-b.minX, b.maxX), Math.max(-b.minZ, b.maxZ)); } else radius = modelBandRadius(id);
    base = { id, radius, low: false, landmark };
    infoCache.set(id, base);
  }
  return { ...base, radius: base.radius * Math.max(p.sx, p.sz), low: !base.landmark && modelHeight(id) * p.sy <= LOW_M };
}

const layoutCache = new Map<string, Layout>();
function layoutOf(track: Track): Layout {
  let l = layoutCache.get(track.def.id);
  if (!l) { l = sceneryLayout(track); layoutCache.set(track.def.id, l); }
  return l;
}

interface Box { minX: number; maxX: number; minZ: number; maxZ: number; ct: number; st: number }
interface Item { i: number; p: Placement; x: number; z: number; info: Info; solid: boolean; box: Box | null }

/** A distância do ponto (x, z) à caixa orientada do marco (0 dentro). O three gira o modelo por −rumo + giro. */
function distToBox(b: Box, x: number, z: number, cx: number, cz: number): number {
  const dx = x - cx; const dz = z - cz;
  const lx = dx * b.ct - dz * b.st; const lz = dx * b.st + dz * b.ct;
  return Math.hypot(Math.max(b.minX - lx, 0, lx - b.maxX), Math.max(b.minZ - lz, 0, lz - b.maxZ));
}

interface Found { onRoad: string[]; solidOnRoad: number; solidOverLandmark: number; objectOverObject: string[]; overLandmark: string[]; total: number }

/**
 * Cada colocação da pista contra o resto: a invasão da pista (ou da faixa do carro) de outro trecho, os sólidos do núcleo na mesma situação (só contados), e a
 * sobreposição entre objetos altos de trechos diferentes.
 */
function overlaps(track: Track): Found { return overlapsOf(track, layoutOf(track)); }
function overlapsOf(track: Track, layout: Layout): Found {
  const w = world(track); const grid = new Grid(w);
  const onRoad: string[] = [];
  let solidOnRoad = 0; let solidOverLandmark = 0; let total = 0;
  const items: Item[] = [];
  layout.bySeg.forEach((list, i) => {
    for (const p of list) {
      total++;
      const [x, z] = at(w, i, p);
      const info = infoOf(layout.models[p.model], p);
      const solid = p.solid;
      let box: Box | null = null;
      if (info.landmark) {
        const b = modelBounds(info.id); const k = i + w.n;
        const th = -(w.hd[k] + (w.hd[k + 1] - w.hd[k]) * p.f) + p.yaw;
        box = { minX: b.minX * p.sx, maxX: b.maxX * p.sx, minZ: b.minZ * p.sz, maxZ: b.maxZ * p.sz, ct: Math.cos(th), st: Math.sin(th) };
      }
      items.push({ i, p, x, z, info, solid, box });
      // Sólido do núcleo: a borda de colisão dele é a que vale (a meia pista + 1 m do outro trecho); o resto, a regra de cima.
      const clear = (solid ? ROAD_HALF_WIDTH_M + 1 : info.landmark ? 0 : info.low ? ROAD_HALF_WIDTH_M + 3 : CAR_REACH_M + info.radius) - SLACK;
      if (clear <= 0) continue;
      let hit = false;
      const k0 = i + w.n;
      grid.near(x, z, clear, (k) => { if (!hit && Math.abs(k - k0) > MIN_ARC && Math.abs(k - k0) <= WINDOW) hit = true; });
      if (!hit) continue;
      if (solid) solidOnRoad++;
      else onRoad.push(`${track.def.id}#${i} ${info.id}${info.low ? ' (baixo)' : ''}`);
    }
  });
  // Sobreposição entre objetos altos de trechos diferentes (o raio é o da pegada no chão, a 80%).
  const objectOverObject: string[] = [];
  const overLandmark: string[] = [];
  const cell = 24;
  const buckets = new Map<number, number[]>();
  items.forEach((it, idx) => {
    if (it.info.low) return;
    const key = Math.floor(it.x / cell) * 100003 + Math.floor(it.z / cell);
    const l = buckets.get(key); if (l) l.push(idx); else buckets.set(key, [idx]);
  });
  const flagged = new Set<string>();
  items.forEach((a, ia) => {
    if (a.info.low || (!a.info.landmark && a.info.radius < 1.4)) return;
    const reach = (a.box ? Math.hypot(a.box.maxX - a.box.minX, a.box.maxZ - a.box.minZ) / 2 : a.info.radius) + 70;
    for (let gx = Math.floor((a.x - reach) / cell); gx <= Math.floor((a.x + reach) / cell); gx++) {
      for (let gz = Math.floor((a.z - reach) / cell); gz <= Math.floor((a.z + reach) / cell); gz++) {
        const l = buckets.get(gx * 100003 + gz);
        if (!l) continue;
        for (const ib of l) {
          if (ib === ia || (!a.box && ib < ia)) continue; // o par de um marco é achado do lado do marco (a caixa dele alcança longe)
          const b = items[ib];
          if (!a.box && !b.box && b.info.radius < 1.4) continue; // objeto de pegada pequena (moita, pedrinha) não conta
          const arc = Math.abs(a.i - b.i); const sep = Math.min(arc, w.n - arc);
          if (sep <= MIN_ARC) continue;
          if (a.solid && b.solid) continue; // dois sólidos do núcleo: a física manda
          if (a.box && b.box) continue; // dois marcos: placeLandmarks os afasta
          const solidWithLandmark = (a.box && b.solid) || (b.box && a.solid);
          // Marco: a caixa orientada dele contra o raio do outro; os outros pares, círculo contra círculo.
          if (a.box) { if (distToBox(a.box, b.x, b.z, a.x, a.z) >= 0.8 * b.info.radius) continue; }
          else if (b.box) { if (distToBox(b.box, a.x, a.z, b.x, b.z) >= 0.8 * a.info.radius) continue; }
          else if (Math.hypot(a.x - b.x, a.z - b.z) >= 0.8 * (a.info.radius + b.info.radius)) continue;
          if (solidWithLandmark) { solidOverLandmark++; continue; } // o sólido é a física: só se conta
          const lm = a.info.landmark || b.info.landmark;
          const text = `${track.def.id}#${a.i}/${b.i} ${a.info.id} × ${b.info.id}`;
          if (!flagged.has(text)) { flagged.add(text); (lm ? overLandmark : objectOverObject).push(text); }
        }
      }
    }
  });
  return { onRoad, solidOnRoad, solidOverLandmark, objectOverObject, overLandmark, total };
}

// Teto, por pista, dos sprites sólidos do núcleo que caem na pista de outro trecho (medido na M6 com o layout já limpo; só desce).
// Nada a fazer no render: a colisão os quer onde estão. Pista fora da tabela = 0.
const SOLID_CEILING: Readonly<Record<string, number>> = {
  serra_dos_orgaos: 10, ilhabela: 7, campos_do_jordao: 9, ouro_preto: 66, serra_do_mar: 39, camboriu: 23, rio_do_rastro: 8, lago_paranoa: 15,
  chapada_veadeiros: 16, chapada_guimaraes: 1, maragogi: 15, joao_pessoa: 7, pedra_da_boca: 2, natal: 16, delta_parnaiba: 22, lencois: 18,
  serra_do_navio: 14, geoglifos: 5, jalapao: 34, rota_66: 25, canion: 30, las_vegas: 67, baia_toquio: 56, monte_fuji: 80, osaka_neon: 117,
  autobahn: 11, passo_alpino: 65, monaco_noite: 52,
};

describe('M6 (a): o cenário da pista fechada', () => {
  const crossing = TRACKS.map((d) => d.id);

  it('nenhum objeto do cenário (nem a forração) fica na pista, ou na faixa do carro, de outro trecho — 109 pistas', () => {
    const bad: string[] = [];
    let n = 0;
    for (const id of crossing) {
      const track = getTrack(id);
      const o = overlaps(track);
      n += o.onRoad.length;
      bad.push(...o.onRoad.slice(0, 2));
    }
    expect(bad.slice(0, 12), `${n} objetos em cima de outro trecho`).toEqual([]);
  }, 600000);

  it('os sólidos do núcleo em cima de outro trecho não passam do teto medido por pista (a física os quer ali)', () => {
    const over: string[] = [];
    for (const id of crossing) {
      const o = overlaps(getTrack(id));
      const count = o.solidOnRoad;
      const ceiling = SOLID_CEILING[id] ?? 0;
      if (count > ceiling) over.push(`  ${id}: ${count},`);
    }
    expect(over.join('\n')).toBe('');
  }, 600000);

  it('nenhum objeto alto se sobrepõe ao de outro trecho nem a um marco', () => {
    const objects: string[] = []; const marks: string[] = [];
    for (const id of crossing) {
      const o = overlaps(getTrack(id));
      objects.push(...o.objectOverObject.slice(0, 2)); marks.push(...o.overLandmark.slice(0, 2));
    }
    expect(marks.slice(0, 10), 'sobre um marco').toEqual([]);
    expect(objects.slice(0, 10), 'sobre outro objeto').toEqual([]);
  }, 600000);

  it('a limpeza é pontual: descarta o que o layout cru tinha de errado (e pouco mais), no máximo 20% das colocações', () => {
    const bad: string[] = [];
    for (const id of ['osaka_neon', 'rota_66', 'ouro_preto', 'jalapao', 'canion', 'lencois', 'delta_parnaiba', 'monaco_noite', 'chapada_veadeiros', 'serra_do_mar', 'copacabana', 'sampa_noite', 'foz_do_iguacu']) {
      const track = getTrack(id);
      const raw = sceneryLayout(track, undefined, false, { keepCrossings: true });
      const rawCount = raw.bySeg.reduce((a, l) => a + l.length, 0);
      layoutCache.set(`${id}:raw`, raw);
      const rawFound = overlapsOf(track, raw);
      const wrong = rawFound.onRoad.length;
      const pairs = rawFound.objectOverObject.length + rawFound.overLandmark.length;
      const kept = layoutOf(track).bySeg.reduce((a, l) => a + l.length, 0);
      const dropped = rawCount - kept;
      // Sai o que estava na pista de outro trecho (a passada tem margem de 2 m e leva junto o que depende de uma peça que saiu: fios, rotor, as peças do mesmo sprite)
      // e um objeto por par sobreposto; nada mais.
      if (dropped < wrong * 0.9) bad.push(`${id}: descartou ${dropped}, tinha ${wrong} na pista de outro trecho`);
      if (dropped > wrong * 1.6 + pairs + 30) bad.push(`${id}: descartou ${dropped}, só ${wrong} na pista de outro e ${pairs} pares`);
      if (dropped / rawCount > 0.2) bad.push(`${id}: descartou ${(100 * dropped / rawCount).toFixed(1)}%`);
    }
    expect(bad).toEqual([]);
  }, 900000);
});
