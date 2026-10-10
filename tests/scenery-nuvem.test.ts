// Vegetação-nuvem (onda M, M3; cronograma: "vegetação-nuvem"): a copa é uma nuvem de bolhas cheias — cada bolha é um icosaedro de 180 faces (a faceta da bíblia,
// `scenery-faceta`) e escurece embaixo, onde a vizinha e a própria copa a tapam: a oclusão assada na cor (R2, luz assada), por ponto e sem salto entre faces
// (`scenery-forma`). Sem isso, a copa lia como pratos de uma cor só. Tudo no Node, sem DOM.
import { describe, expect, it } from 'vitest';
import { getModel } from '../src/render/scenery/catalog';
import { cloudDetail } from '../src/render/scenery/vegetation';
import { solids } from './scenery-medidas';

/** As árvores de copa de bolhas (as de sprite, as do sertão do Brasil e as de mata). */
const CROWNS = ['tree:mango:0', 'tree:mango:1', 'tree:oak', 'tree:linden', 'tree:giant:0', 'tree:ipe-pink', 'tree:acacia:0', 'tree:juazeiro', 'tree:umbuzeiro', 'tree:marula', 'tree:maple-red'];

/** Razão entre a luminosidade média do quartil de baixo e a do quartil de cima de cada bolha (peça de ≥ 100 triângulos) da parte lisa. */
function bubbleRatios(id: string): number[] {
  const g = getModel(id).parts.find((p) => p.mat === 'flat')?.geometry;
  if (!g) throw new Error(`${id}: sem parte lisa`);
  const pos = g.getAttribute('position'); const col = g.getAttribute('color');
  const out: number[] = [];
  for (const tr of solids(g)) {
    if (tr.length < 100) continue;
    const pts: Array<[number, number]> = [];
    for (const t of tr) for (let j = 0; j < 3; j++) pts.push([pos.getY(t + j), col.getY(t + j)]);
    pts.sort((a, b) => a[0] - b[0]);
    const q = Math.floor(pts.length / 4);
    const lo = pts.slice(0, q).reduce((s, v) => s + v[1], 0) / q;
    const hi = pts.slice(-q).reduce((s, v) => s + v[1], 0) / q;
    out.push(lo / hi);
  }
  return out;
}

describe('vegetação-nuvem', () => {
  it('a bolha de copa a partir de 0,6 m é icosaedro de 180 faces; a pequena fica com menos (poucos pixels)', () => {
    expect(cloudDetail(2.2)).toBe(2);
    expect(cloudDetail(0.6)).toBe(2);
    expect(cloudDetail(0.5)).toBe(1);
    expect(cloudDetail(0.3)).toBe(0);
  });

  for (const id of CROWNS) {
    it(`${id}: toda bolha da copa escurece embaixo (o quartil de baixo ≥ 15% mais escuro que o de cima)`, () => {
      const r = bubbleRatios(id);
      expect(r.length, `${id}: bolhas`).toBeGreaterThanOrEqual(3);
      for (const x of r) expect(x, `${id}: razão baixo/cima ${x.toFixed(2)}`).toBeLessThanOrEqual(0.85);
    });
  }
});
