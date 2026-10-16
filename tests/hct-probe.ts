// Sondas na malha de um modelo de carro (V2, estilos HCT; tests/estilo-carro-hct.test.ts): triângulos com centro, normal e área, os pincéis lidos
// dos atributos (faixa A/B, luz, vidro, pintura), raios de cima e de lado (a primeira coisa que se vê de um ponto) e os centros das lentes em
// leque (o `aLens` do miolo e da borda). Puro: só lê a geometria do `CarModel`.
import type { CarModel } from '../src/render/cars/model';

export interface Tri { i: number; c: [number, number, number]; n: [number, number, number]; area: number }

export function probe(m: Pick<CarModel, 'shell'>) {
  const g = m.shell;
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  const pnt = g.getAttribute('aPaint');
  const mat = g.getAttribute('aMat');
  const lens = g.getAttribute('aLens');
  const T: Tri[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    const ax = pos.getX(i); const ay = pos.getY(i); const az = pos.getZ(i);
    const ux = pos.getX(i + 1) - ax; const uy = pos.getY(i + 1) - ay; const uz = pos.getZ(i + 1) - az;
    const vx = pos.getX(i + 2) - ax; const vy = pos.getY(i + 2) - ay; const vz = pos.getZ(i + 2) - az;
    const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    T.push({ i, c: [(ax + pos.getX(i + 1) + pos.getX(i + 2)) / 3, (ay + pos.getY(i + 1) + pos.getY(i + 2)) / 3, (az + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3], n: [nx / l, ny / l, nz / l], area: l / 2 });
  }
  const layer = (i: number): number => Math.round(pnt.getZ(i) * 3);
  const isA = (i: number): boolean => layer(i) === 1 || layer(i) === 3;
  const isB = (i: number): boolean => layer(i) === 2 || layer(i) === 3;
  const lit = (i: number): boolean => mat.getZ(i) > 0.01 || mat.getW(i) > 0.01;
  /** Vidro: o mesmo critério do tests/estilo-carro.test.ts (rugosidade baixa, metal alto, sem luz). */
  const isGlass = (i: number): boolean => mat.getX(i) <= 0.08 && mat.getY(i) >= 0.6 && !lit(i);
  const isTail = (i: number): boolean => mat.getW(i) > 0.5;
  const isHead = (i: number): boolean => mat.getZ(i) > 0.5;
  const painted = (i: number): boolean => pnt.getX(i) > 0.5;
  const popup = (i: number): boolean => pnt.getW(i) > 0.5;
  const accent = (i: number): boolean => pnt.getY(i) > 0.5;

  /** Raio vertical (de cima) em (x, z): o triângulo mais alto que ele cruza (dos que `want` aceita), ou null. */
  function fromAbove(x: number, z: number, want: (i: number) => boolean = () => true): { y: number; i: number } | null {
    let best: { y: number; i: number } | null = null;
    for (let i = 0; i < pos.count; i += 3) {
      if (!want(i)) continue;
      const ax = pos.getX(i); const az = pos.getZ(i); const bx = pos.getX(i + 1); const bz = pos.getZ(i + 1); const cx = pos.getX(i + 2); const cz = pos.getZ(i + 2);
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
      const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
      if (l1 < -1e-9 || l2 < -1e-9 || l1 + l2 > 1 + 1e-9) continue;
      const y = l1 * pos.getY(i) + l2 * pos.getY(i + 1) + (1 - l1 - l2) * pos.getY(i + 2);
      if (!best || y > best.y) best = { y, i };
    }
    return best;
  }
  /** Raio horizontal vindo de +x (ou de −x) em (y, z): o triângulo mais de fora que ele cruza. */
  function fromSide(y: number, z: number, side: 1 | -1): { x: number; i: number } | null {
    let best: { x: number; i: number } | null = null;
    for (let i = 0; i < pos.count; i += 3) {
      const ay = pos.getY(i); const az = pos.getZ(i); const by = pos.getY(i + 1); const bz = pos.getZ(i + 1); const cy = pos.getY(i + 2); const cz = pos.getZ(i + 2);
      const d = (bz - cz) * (ay - cy) + (cy - by) * (az - cz);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((bz - cz) * (y - cy) + (cy - by) * (z - cz)) / d;
      const l2 = ((cz - az) * (y - cy) + (ay - cy) * (z - cz)) / d;
      if (l1 < -1e-9 || l2 < -1e-9 || l1 + l2 > 1 + 1e-9) continue;
      const x = l1 * pos.getX(i) + l2 * pos.getX(i + 1) + (1 - l1 - l2) * pos.getX(i + 2);
      if (!best || side * x > side * best.x) best = { x, i };
    }
    return best;
  }
  /** Raio de trás (vindo de +z) em (x, y): o triângulo mais de trás que ele cruza. */
  function fromBehind(x: number, y: number): { z: number; i: number } | null {
    let best: { z: number; i: number } | null = null;
    for (let i = 0; i < pos.count; i += 3) {
      const ax = pos.getX(i); const ay = pos.getY(i); const bx = pos.getX(i + 1); const by = pos.getY(i + 1); const cx = pos.getX(i + 2); const cy = pos.getY(i + 2);
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
      const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
      if (l1 < -1e-9 || l2 < -1e-9 || l1 + l2 > 1 + 1e-9) continue;
      const z = l1 * pos.getZ(i) + l2 * pos.getZ(i + 1) + (1 - l1 - l2) * pos.getZ(i + 2);
      if (!best || z > best.z) best = { z, i };
    }
    return best;
  }
  /** Centros de lente em leque (o vértice do centro, `aLens` ≈ 0, num triângulo cujos outros dois estão na borda, `aLens` ≈ 1). */
  function lensCenters(want: (i: number) => boolean): Array<[number, number, number]> {
    const out: Array<[number, number, number]> = [];
    for (let i = 0; i < pos.count; i += 3) {
      if (!want(i)) continue;
      for (let k = 0; k < 3; k++) {
        const v = i + k; const o1 = i + ((k + 1) % 3); const o2 = i + ((k + 2) % 3);
        if (lens.getX(v) < 0.05 && lens.getX(o1) > 0.6 && lens.getX(o2) > 0.6) {
          const p: [number, number, number] = [pos.getX(v), pos.getY(v), pos.getZ(v)];
          if (!out.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 0.02)) out.push(p);
        }
      }
    }
    return out;
  }
  /** Caimento do vidro: a meia largura máxima do vidro na metade de cima ÷ a do vidro todo (1 = bolha de paredes retas). */
  function glassTaper(): number {
    const v: number[] = [];
    for (let i = 0; i < mat.count; i++) if (isGlass(i)) v.push(i);
    const ys = v.map((i) => pos.getY(i));
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    const half = (l: number[]): number => Math.max(...l.map((i) => Math.abs(pos.getX(i))));
    return half(v.filter((i) => pos.getY(i) >= mid)) / half(v);
  }
  /** O vidro em si (fora as faixas de reflexo, metal 1): todas as cores de vértice. */
  function glassColors(): Array<[number, number, number]> {
    const out: Array<[number, number, number]> = [];
    for (let i = 0; i < mat.count; i++) if (isGlass(i) && mat.getY(i) < 0.99) out.push([col.getX(i), col.getY(i), col.getZ(i)]);
    return out;
  }
  return { g, pos, col, pnt, mat, lens, T, layer, isA, isB, lit, isGlass, isTail, isHead, painted, popup, accent, fromAbove, fromSide, fromBehind, lensCenters, glassTaper, glassColors };
}

export const range = (a: number, b: number, step: number): number[] => Array.from({ length: Math.round((b - a) / step) + 1 }, (_, k) => +(a + k * step).toFixed(4));
