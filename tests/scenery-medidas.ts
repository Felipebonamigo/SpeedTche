// Medidas de forma e de cor do cenário, compartilhadas pelos testes da L4 (heróis, horizonte). A `normalLie` é a do
// `scenery-forma.test.ts` (o quanto a luz lisa "mente" sobre a forma); o `edgeStats` é o mesmo detector de mancha por face,
// com a normal de CADA face guardada (o do `scenery-forma` empilha a mesma instância de vetor no vetor das faces, então lá toda
// aresta de duas faces conta como lisa — mais rígido do que o texto do teste diz; ver o relatório da L4).
import * as THREE from 'three';
import type { Geo } from '../src/render/scenery/geom';

export interface EdgeStats { smooth: number; maxJump: number }

/** Arestas lisas (duas faces, dobra menor que `creaseDeg`) de uma malha não indexada e o maior salto de cor entre as faces delas. */
export function edgeStats(g: Geo, creaseDeg: number): EdgeStats {
  const pos = g.getAttribute('position'); const col = g.getAttribute('color');
  const n = pos.count - (pos.count % 3);
  const key = (i: number) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const ids = new Map<string, number>(); const pid = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = key(i); let v = ids.get(k); if (v === undefined) { v = ids.size; ids.set(k, v); } pid[i] = v; }
  const fn: THREE.Vector3[] = [];
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
  for (let f = 0; f < n / 3; f++) {
    a.fromBufferAttribute(pos, f * 3); b.fromBufferAttribute(pos, f * 3 + 1); c.fromBufferAttribute(pos, f * 3 + 2);
    fn.push(b.clone().sub(a).cross(c.clone().sub(a)));
  }
  const edges = new Map<string, Array<[number, number]>>();
  for (let f = 0; f < n / 3; f++) {
    if (fn[f].lengthSq() < 1e-14) continue;
    for (let k = 0; k < 3; k++) {
      const i = f * 3 + k; const j = f * 3 + ((k + 1) % 3);
      const e = pid[i] < pid[j] ? `${pid[i]}:${pid[j]}` : `${pid[j]}:${pid[i]}`;
      const list = edges.get(e) ?? []; list.push([i, j]); edges.set(e, list);
    }
  }
  let smooth = 0; let maxJump = 0;
  const cos = Math.cos((creaseDeg * Math.PI) / 180);
  for (const list of edges.values()) {
    if (list.length !== 2) continue;
    const [[i0, j0], [i1, j1]] = list;
    const fa = fn[Math.floor(i0 / 3)].clone().normalize(); const fb = fn[Math.floor(i1 / 3)].clone().normalize();
    const sameDir = pid[i0] === pid[i1];
    if (sameDir) fb.negate();
    if (Math.max(-1, Math.min(1, fa.dot(fb))) < cos) continue;
    smooth++;
    const pairs: Array<[number, number]> = sameDir ? [[i0, i1], [j0, j1]] : [[i0, j1], [j0, i1]];
    for (const [u, v] of pairs) for (let ch = 0; ch < 3; ch++) {
      const cu = col.getComponent(u, ch); const cv = col.getComponent(v, ch);
      maxJump = Math.max(maxJump, Math.abs(cu - cv) / Math.max(cu, cv, 0.02));
    }
  }
  return { smooth, maxJump };
}

/**
 * Quanto a luz lisa "mente" sobre a forma: o ângulo médio (graus) entre a normal de cada canto liso e a normal da própria face,
 * pesado pela área × o ângulo do canto (a normal suave pesa igual); canto vivo (< 0,5°) fora da conta.
 */
export function normalLie(parts: ReadonlyArray<{ geometry: Geo; mat: string }>): number {
  let w = 0; let sum = 0;
  const P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const fn = new THREE.Vector3(); const e1 = new THREE.Vector3(); const e2 = new THREE.Vector3(); const nv = new THREE.Vector3();
  for (const p of parts) {
    if (p.mat !== 'flat') continue;
    const pos = p.geometry.getAttribute('position'); const nor = p.geometry.getAttribute('normal');
    for (let f = 0; f < pos.count / 3; f++) {
      for (let k = 0; k < 3; k++) P[k].fromBufferAttribute(pos, f * 3 + k);
      fn.crossVectors(e1.subVectors(P[1], P[0]), e2.subVectors(P[2], P[0]));
      const area = fn.length() / 2;
      if (area < 1e-12) continue;
      fn.normalize();
      for (let k = 0; k < 3; k++) {
        const ang = (Math.acos(Math.min(1, Math.abs(nv.fromBufferAttribute(nor, f * 3 + k).dot(fn)))) * 180) / Math.PI;
        if (ang < 0.5) continue;
        const corner = e1.subVectors(P[(k + 1) % 3], P[k]).angleTo(e2.subVectors(P[(k + 2) % 3], P[k]));
        w += area * corner; sum += ang * area * corner;
      }
    }
  }
  return w > 0 ? sum / w : 0;
}
