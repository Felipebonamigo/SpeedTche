// Cenário "menos quadrado" pela forma e pela cor (onda I, depois das normais suaves): as famílias redondas
// (árvore, conífera, palmeira, cacto, moita, pedra e as silhuetas de longe) não mostram as faces — nem pela cor
// (a mancha por face, `speckle`, acendia face sim, face não mesmo com a luz lisa) nem por gomos largos (copa de
// icosaedro de 20 faces, tronco de 6 lados). E o custo continua no orçamento. Tudo no Node, sem DOM.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getTrack, TRACKS } from '../src/core/track';
import { getModel } from '../src/render/scenery/catalog';
import { baseLayout, sceneryLayout, type Layout } from '../src/render/scenery/layout';
import { sceneryShading } from '../src/render/scenery/smooth';
import { modelTriangles } from '../src/render/scenery/vegetation';
import { frameCost } from './scenery-medidas';

/** Famílias de forma redonda (o vinco de planta ou de pedra): o resto (construção, objeto de pista) pode ser caixa. */
const ROUND = /^(tree|pine|palm|cactus|bush|rock|termite|stack|searock|mesa|far):/;

const layouts = TRACKS.map((d) => ({ id: d.id, segs: getTrack(d.id).segments.length, layout: sceneryLayout(getTrack(d.id)) }));

const ids = (() => {
  const s = new Set<string>();
  for (const { layout } of layouts) for (const id of layout.models) if (ROUND.test(id) || id === 'termite') s.add(id);
  return [...s].sort();
})();

interface EdgeStats {
  /** Arestas lisas (duas faces, dobra menor que o vinco da família). */
  smooth: number;
  /** Maior salto de cor (relativo, por canal) entre as duas faces de uma aresta lisa, nos dois pontos dela. */
  maxJump: number;
}

/** Arestas lisas de uma malha não indexada (pontos soldados a 0,1 mm), com o salto de cor e a dobra de cada uma. */
function edgeStats(g: THREE.BufferGeometry, creaseDeg: number): EdgeStats {
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  const n = pos.count - (pos.count % 3);
  const key = (i: number) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const ids = new Map<string, number>();
  const pid = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = key(i);
    let v = ids.get(k);
    if (v === undefined) { v = ids.size; ids.set(k, v); }
    pid[i] = v;
  }
  const fn: THREE.Vector3[] = [];
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
  for (let f = 0; f < n / 3; f++) {
    a.fromBufferAttribute(pos, f * 3); b.fromBufferAttribute(pos, f * 3 + 1); c.fromBufferAttribute(pos, f * 3 + 2);
    fn.push(b.sub(a).cross(c.sub(a)));
  }
  // Aresta (pontos soldados) → os cantos de cada face, no sentido em que a face a percorre.
  const edges = new Map<string, Array<[number, number]>>();
  for (let f = 0; f < n / 3; f++) {
    if (fn[f].lengthSq() < 1e-14) continue; // face degenerada não conta
    for (let k = 0; k < 3; k++) {
      const i = f * 3 + k; const j = f * 3 + ((k + 1) % 3);
      const e = pid[i] < pid[j] ? `${pid[i]}:${pid[j]}` : `${pid[j]}:${pid[i]}`;
      const list = edges.get(e) ?? [];
      list.push([i, j]);
      edges.set(e, list);
    }
  }
  let smooth = 0; let maxJump = 0;
  const cos = Math.cos((creaseDeg * Math.PI) / 180);
  for (const list of edges.values()) {
    if (list.length !== 2) continue;
    const [[i0, j0], [i1, j1]] = list;
    const fa = fn[Math.floor(i0 / 3)].clone().normalize(); const fb = fn[Math.floor(i1 / 3)].clone().normalize();
    // Enrolamento coerente percorre a aresta em sentidos opostos; no mesmo sentido, a vizinha entra virada.
    const sameDir = pid[i0] === pid[i1];
    if (sameDir) fb.negate();
    const d = Math.max(-1, Math.min(1, fa.dot(fb)));
    if (d < cos) continue;
    smooth++;
    const pairs: Array<[number, number]> = sameDir ? [[i0, i1], [j0, j1]] : [[i0, j1], [j0, i1]];
    for (const [u, v] of pairs) {
      for (let ch = 0; ch < 3; ch++) {
        const cu = col.getComponent(u, ch); const cv = col.getComponent(v, ch);
        maxJump = Math.max(maxJump, Math.abs(cu - cv) / Math.max(cu, cv, 0.02));
      }
    }
  }
  return { smooth, maxJump };
}

function statsOf(id: string): EdgeStats {
  const crease = sceneryShading(id).crease;
  const out: EdgeStats = { smooth: 0, maxJump: 0 };
  for (const p of getModel(id).parts) {
    if (p.mat !== 'flat') continue;
    const s = edgeStats(p.geometry, crease);
    out.smooth += s.smooth; out.maxJump = Math.max(out.maxJump, s.maxJump);
  }
  return out;
}

/**
 * Quanto a luz lisa "mente" sobre a forma: o ângulo médio (graus) entre a normal suave de cada canto liso e a normal
 * da própria face. Malha grossa sob luz lisa é redonda por dentro e de gomos no contorno: icosaedro de 20 faces 37°,
 * tronco de 6 lados 30°; icosaedro subdividido ~19°, cilindro de 12 lados 15°. Cada canto pesa a área da face × o
 * ângulo dele — o mesmo peso da normal suave (`smoothNormals`): o bico de um cone (o canto fino de 10 faces em leque)
 * tem a normal para cima em qualquer resolução, e isso é a ponta arredondada à luz, não gomo; pela área só, a camada de
 * conífera de 10 lados "mentia" mais que a de 7.
 */
function normalLie(parts: ReadonlyArray<{ geometry: THREE.BufferGeometry; mat: string }>): number {
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
        if (ang < 0.5) continue; // canto vivo (caixa, beiral): fora da conta
        const corner = e1.subVectors(P[(k + 1) % 3], P[k]).angleTo(e2.subVectors(P[(k + 2) % 3], P[k]));
        w += area * corner; sum += ang * area * corner;
      }
    }
  }
  return w > 0 ? sum / w : 0;
}

describe('cenário redondo: cor', () => {
  it('nas famílias redondas a cor corre lisa entre faces vizinhas (sem mancha por face nas arestas lisas)', () => {
    expect(ids.length).toBeGreaterThan(60);
    const bad: string[] = [];
    for (const id of ids) {
      const s = statsOf(id);
      if (s.maxJump > 0.01) bad.push(`${id}: salto de ${(s.maxJump * 100).toFixed(1)}% em aresta lisa`);
    }
    expect(bad, `${bad.length} modelos`).toEqual([]);
  }, 60000);

  it('o detector reprova a mancha por face (speckle) e aceita a mancha por ponto', async () => {
    const { ico, paint, speckle, mottle } = await import('../src/render/scenery/geom');
    expect(edgeStats(speckle(paint(ico(1, 1), '#3a8a3a'), 0.05, 7), 60).maxJump).toBeGreaterThan(0.02);
    expect(edgeStats(mottle(paint(ico(1, 1), '#3a8a3a'), 0.08, 7), 60).maxJump).toBeLessThan(1e-4);
  });
});

describe('cenário redondo: forma', () => {
  // O teto de faceta de TODAS as famílias (15°, a bíblia) é de tests/scenery-faceta.test.ts; antes, aqui, 22° (pedra 18°) com a palmeira de cartum de fora.

  it('o detector separa a malha grossa da fina (icosaedro de 20 faces × subdividido)', async () => {
    const { ico, paint } = await import('../src/render/scenery/geom');
    const { smoothNormals } = await import('../src/render/normals');
    const lieOf = (detail: number) => normalLie([{ geometry: smoothNormals(paint(ico(1, detail), '#3a8a3a'), 60), mat: 'flat' }]);
    expect(lieOf(0)).toBeGreaterThan(30);
    expect(lieOf(1)).toBeLessThan(22);
  });
});

describe('cenário redondo: orçamento', () => {
  // O custo que o quadro paga (docs/ondas/M/M3.md, "Orçamento de quadro"): a janela de 291 segmentos da qualidade Alta, o modelo de perto só até o `farFrom` e
  // depois a silhueta (os impostores e o LOD de longe pagam os triângulos). A soma estática de antes (todo objeto da pista com o modelo de perto) media o pior caso
  // que nunca acontece: a vegetação só usa o modelo de perto nos primeiros 90 segmentos da janela. Antes da M3: pior pista 510, média 245; a copa nuvem (bolha de
  // 180 faces) e os 12 lados dos troncos subiram o custo, e o teto de 900 segura a próxima rodada.
  const tris = new Map<string, number>();
  const trisOf = (m: string): number => {
    let t = tris.get(m);
    if (t === undefined) { t = modelTriangles(getModel(m)); tris.set(m, t); }
    return t;
  };

  it('custo de quadro do cenário ≤ 900 triângulos por segmento de janela em toda pista (o modelo de perto só até o farFrom; sem marcos)', () => {
    const bad: string[] = []; let worst = 0; let worstId = '';
    for (const { id, segs, layout } of layouts) {
      // F4 (V22): o teto de 900 △ por segmento mede o que TODA lotação paga (`baseLayout`: sem o enfeite farto de 1–2 jogadores, que tem teto próprio em
      // tests/vegetacao-f4.test.ts). Medindo o layout inteiro, o farto (árvores a mais de 25 a 65 m, só com viewport grande) estourava a conta estática em 15 pistas (máx. 1018).
      const c = frameCost(baseLayout(layout), segs, trisOf);
      if (c > worst) { worst = c; worstId = id; }
      if (c > 900) bad.push(`${id}: ${c.toFixed(0)}`);
    }
    expect(bad, `pior pista ${worstId}: ${worst.toFixed(0)}`).toEqual([]);
  }, 60000);

  it('a soma estática (todo objeto com o modelo de perto) fica ≤ 2.400 por segmento: o teto de sanidade, para um modelo não explodir', () => {
    const bad: string[] = [];
    for (const { id, segs, layout } of layouts) {
      let sum = 0;
      for (const list of layout.bySeg) for (const p of list) {
        const m = layout.models[p.model];
        if (!m.startsWith('lm:')) sum += trisOf(m);
      }
      if (sum / segs > 2400) bad.push(`${id}: ${(sum / segs).toFixed(0)}`);
    }
    expect(bad).toEqual([]);
  }, 60000);

  it('a medida de quadro conta o modelo de perto até o farFrom e a silhueta depois (e nada além do maxAhead)', () => {
    const mk = (over: Record<string, number>): Layout['bySeg'][number][number] => ({ model: 0, far: -1, farFrom: 1e9, maxAhead: 1e9, ...over } as Layout['bySeg'][number][number]);
    const n = 1000;
    const bySeg: Layout['bySeg'] = Array.from({ length: n }, () => []);
    bySeg[500].push(mk({ far: 1, farFrom: 90 })); // 1 objeto: perto até 89 à frente (e 30 atrás), silhueta de 90 a 260
    const layout: Layout = { models: ['near', 'far'], bySeg };
    const t = (id: string) => (id === 'near' ? 1000 : 10);
    // Câmera a 50 segmentos antes: o objeto está a 50 à frente (perto). Os 120 segmentos de perto (89 + 30 + 1) custam 1000; o resto da janela (170) custa 10.
    const only = frameCost(layout, n, t);
    expect(only).toBeCloseTo(1000 / 291, 6);
    // Sem silhueta, o objeto custa 1000 em todas as câmeras da janela de 291.
    bySeg[500][0] = mk({});
    expect(frameCost(layout, n, t)).toBeCloseTo(1000 / 291, 6);
    // Fora do maxAhead ele some: com maxAhead 40, só as câmeras de 40 antes até 30 depois o veem — a mesma contagem de câmeras, o mesmo pico.
    bySeg[500][0] = mk({ maxAhead: 40 });
    expect(frameCost(layout, n, t)).toBeCloseTo(1000 / 291, 6);
    // Dois objetos em segmentos afastados (nunca na mesma janela) não se somam; dois na mesma janela, sim.
    bySeg[500].push(mk({ maxAhead: 40 }));
    expect(frameCost(layout, n, t)).toBeCloseTo(2000 / 291, 6);
  });

  it('modelos redondos de sprite e de mata ≤ 900 triângulos (pedra ≤ 420, mesa e coluna de arenito ≤ 600)', () => {
    // O teto subiu de 700 para 900 e o da pedra de 360 para 420 DE PROPÓSITO (M3): a bolha de copa grande passou a 180 faces e o tronco a 12 lados, o que a faceta
    // de 15° da bíblia exige. É o orçamento de quadro, acima, que paga a conta.
    for (const id of ids) {
      if (id.startsWith('far:')) continue;
      const cap = /^(rock|searock):/.test(id) ? 420 : /^(mesa|stack):/.test(id) ? 600 : 900;
      expect(modelTriangles(getModel(id)), id).toBeLessThanOrEqual(cap);
    }
  });
});
