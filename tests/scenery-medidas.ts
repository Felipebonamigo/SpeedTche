// Medidas de forma e de cor do cenário, compartilhadas pelos testes da L4 (heróis, horizonte). A `normalLie` é a do
// `scenery-forma.test.ts` (o quanto a luz lisa "mente" sobre a forma); o `edgeStats` é o mesmo detector de mancha por face,
// com a normal de CADA face guardada (o do `scenery-forma` empilha a mesma instância de vetor no vetor das faces, então lá toda
// aresta de duas faces conta como lisa — mais rígido do que o texto do teste diz; ver o relatório da L4).
import * as THREE from 'three';
import { smoothNormals } from '../src/render/normals';
import type { Geo, Model } from '../src/render/scenery/geom';
import type { Layout } from '../src/render/scenery/layout';
import { sceneryShading } from '../src/render/scenery/smooth';

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
 * pesado pela área × o ângulo do canto (a normal suave pesa igual); canto vivo (< 0,5°) fora da conta. `mats`: as partes medidas
 * (padrão só a `flat`; a faceta da bíblia, `tests/scenery-faceta.test.ts`, mede também as quatro fachadas).
 */
export function normalLie(parts: ReadonlyArray<{ geometry: Geo; mat: string }>, mats: readonly string[] = ['flat']): number {
  let w = 0; let sum = 0;
  const P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const fn = new THREE.Vector3(); const e1 = new THREE.Vector3(); const e2 = new THREE.Vector3(); const nv = new THREE.Vector3();
  for (const p of parts) {
    if (!mats.includes(p.mat)) continue;
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

/** As partes iluminadas de um modelo (a normal conta): o liso e as quatro fachadas. `glow`, `beacon` e `cone` são luz pintada. */
export const LIT_MATS = ['flat', 'office', 'apartment', 'classic', 'house'] as const;

/**
 * A faceta de um modelo do catálogo (a régua da bíblia, `scenery-faceta.test.ts`): o `normalLie` das partes iluminadas. A parte do kit redondo
 * (`userData.keepNormals`: a normal dela é esferizada ou de bisel de propósito, e mentiria à vontade) é medida pela GEOMETRIA: as normais são
 * recalculadas com o vinco da família do modelo (`sceneryShading`), como o catálogo faria. Assim a palmeira de cartum (copa de normal esferizada)
 * não escapa pelo truque da normal, e o chanfro de 45° do bisel (vinco de construção 40°) continua sendo bisel, não faceta.
 */
export function facetOf(id: string, model: Model): number {
  const shading = sceneryShading(id);
  const parts = model.parts.map((p) => (p.geometry.userData.keepNormals && !p.geometry.index
    ? { mat: p.mat, geometry: smoothNormals(p.geometry.clone(), shading.crease, shading) }
    : p));
  return normalLie(parts, LIT_MATS);
}

/** A janela de quadro da qualidade Alta (renderer.ts: BEHIND 30 + AHEAD 260) que o orçamento do cenário mede. */
export const FRAME_BEHIND = 30;
export const FRAME_AHEAD = 260;

/**
 * Custo do cenário por segmento de janela, no pior ponto da pista (docs/ondas/M/M3.md, "Orçamento de quadro"): para a câmera em cada segmento `s`,
 * cada objeto na janela [s − 30, s + 260] custa os triângulos do modelo de PERTO se está a menos de `farFrom` segmentos à frente (ou não tem
 * silhueta), os da silhueta de longe de `farFrom` até `maxAhead`, e nada além; o total ÷ 291 segmentos da janela. É o que o quadro de fato
 * desenha (o `Scenery.update` faz as mesmas contas), ao contrário da soma estática de todo objeto da pista com o modelo de perto. Marcos ("lm:")
 * ficam de fora (orçamento próprio por lugar). `rank` não entra: é a Alta, que desenha tudo.
 */
export function frameCost(layout: Layout, segs: number, trisOf: (id: string) => number): number {
  const diff = new Float64Array(segs + 1);
  const add = (lo: number, hi: number, v: number): void => { // câmeras lo..hi (inclusive, circular)
    if (hi < lo || v === 0) return;
    const len = hi - lo + 1;
    if (len >= segs) { diff[0] += v; diff[segs] -= v; return; }
    const a = ((lo % segs) + segs) % segs;
    const b = a + len - 1;
    if (b < segs) { diff[a] += v; diff[b + 1] -= v; } else { diff[a] += v; diff[segs] -= v; diff[0] += v; diff[b - segs + 1] -= v; }
  };
  layout.bySeg.forEach((list, i) => {
    for (const p of list) {
      const id = layout.models[p.model];
      if (id.startsWith('lm:')) continue;
      const reach = Math.min(p.maxAhead, FRAME_AHEAD);
      const hasFar = p.far >= 0 && p.farFrom <= reach;
      const nearAhead = hasFar ? Math.min(reach, p.farFrom - 1) : reach;
      add(i - nearAhead, i + FRAME_BEHIND, trisOf(id));
      if (hasFar) add(i - reach, i - p.farFrom, trisOf(layout.models[p.far]));
    }
  });
  let worst = 0; let run = 0;
  for (let s = 0; s < segs; s++) { run += diff[s]; worst = Math.max(worst, run); }
  return worst / (FRAME_BEHIND + FRAME_AHEAD + 1);
}

/**
 * Como a malha se parece, em fração da ÁREA das partes lisas: `axis` = faces alinhadas a um eixo (a cara de caixa: parede, laje, tábua reta) e `smooth` =
 * faces cuja normal NÃO é a da própria face (superfície redonda: cilindro, bisel, arco). Um poste de 6 lados e uma cerca de tábuas retas têm `smooth` 0
 * (o vinco de construção, 40°, deixa as quinas de 60° e de 90° vivas); com 14 lados, ou com bisel, sobe. É o que o teste dos props pede (`scenery-props`).
 */
export function areaShares(model: Model): { axis: number; smooth: number; area: number } {
  let area = 0; let axis = 0; let smooth = 0;
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3(); const n = new THREE.Vector3(); const v = new THREE.Vector3();
  for (const p of model.parts) {
    if (p.mat !== 'flat') continue;
    const pos = p.geometry.getAttribute('position'); const nor = p.geometry.getAttribute('normal');
    for (let t = 0; t + 2 < pos.count; t += 3) {
      a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
      n.crossVectors(b.clone().sub(a), c.clone().sub(a));
      const ar = n.length() / 2;
      if (ar < 1e-9) continue;
      n.normalize();
      area += ar;
      if (Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)) > 0.9998) axis += ar;
      if (v.fromBufferAttribute(nor, t).angleTo(n) * (180 / Math.PI) > 0.5) smooth += ar;
    }
  }
  return { axis: area ? axis / area : 0, smooth: area ? smooth / area : 0, area };
}
