// Prédios em quatro estilos (onda M, M3; cronograma: "prédios em 4 estilos, com cornija, varanda, toldo e quina chanfrada"): os quatro estilos de
// fachada do jogo — `office` (torre de vidro), `apartment` (bloco de apartamentos, mais o da orla da L4), `classic` (bulevar) e `house` (prédio de tijolo) —
// saem do kit redondo (`geom.ts`): corpo de caixa com bisel (a quina vertical chanfrada, a fachada reta continua em x = 0 e na borda de colisão),
// cornija saliente, varanda (laje por andar), toldo na loja do térreo e a oclusão assada. Tudo no Node, sem DOM.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getModel, modelFrontX } from '../src/render/scenery/catalog';
import { modelTriangles } from '../src/render/scenery/vegetation';

type Fac = 'office' | 'apartment' | 'classic' | 'house';
interface Style { name: string; fac: Fac; ids: string[]; floors: number; varanda: boolean; toldo: boolean }

const STYLES: Style[] = [
  { name: 'office (torre de vidro)', fac: 'office', ids: ['bld:glass:12:0', 'bld:glassgold:12:1'], floors: 12, varanda: false, toldo: true },
  { name: 'apartment (bloco de apartamentos)', fac: 'apartment', ids: ['bld:apt:9:0', 'bld:apt:9:1', 'bld:aptbeach:9:2'], floors: 9, varanda: true, toldo: true },
  { name: 'classic (bulevar)', fac: 'classic', ids: ['bld:classic:5:0', 'bld:classicwarm:5:1'], floors: 5, varanda: true, toldo: true },
  { name: 'house (prédio de tijolo)', fac: 'house', ids: ['bld:brick:6:0', 'bld:brick:6:1'], floors: 6, varanda: true, toldo: true },
];
/** Torres que carregam fachada (±R, simétricas): quina chanfrada e oclusão, sem varanda nem toldo. */
const TOWERS: Array<{ id: string; fac: Fac }> = [{ id: 'tower:spire:3.15:0', fac: 'office' }, { id: 'tower:dome:3.15:0', fac: 'classic' }];

const pos = (g: THREE.BufferGeometry): THREE.BufferAttribute => g.getAttribute('position') as THREE.BufferAttribute;
const facadeOf = (id: string, fac: Fac): THREE.BufferGeometry => {
  const p = getModel(id).parts.find((q) => q.mat === fac);
  if (!p) throw new Error(`${id}: sem fachada ${fac}`);
  return p.geometry;
};
const flatOf = (id: string): THREE.BufferGeometry => {
  const p = getModel(id).parts.find((q) => q.mat === 'flat');
  if (!p) throw new Error(`${id}: sem parte lisa`);
  return p.geometry;
};

/** Distância (m, no plano XZ) do vértice da fachada mais perto da quina vertical viva (maxX, ±maxZ) da caixa dela. */
function nearestToLiveCorner(g: THREE.BufferGeometry): number {
  g.computeBoundingBox();
  const b = g.boundingBox as THREE.Box3;
  let best = Infinity;
  for (let i = 0; i < pos(g).count; i++) {
    for (const cz of [b.min.z, b.max.z]) best = Math.min(best, Math.hypot(pos(g).getX(i) - b.max.x, pos(g).getZ(i) - cz));
  }
  return best;
}

/** Faixas salientes da parte lisa: níveis de y (de 0,5 em 0,5 m) em que há triângulos com x ≥ `minX`, que cobrem ≥ `spanFrac` do comprimento da fachada em Z. */
function salientLevels(flat: THREE.BufferGeometry, L: number, minX: number, spanFrac: number, y0: number, y1: number): number[] {
  const byLevel = new Map<number, { lo: number; hi: number }>();
  for (let i = 0; i < pos(flat).count; i++) {
    const x = pos(flat).getX(i); const y = pos(flat).getY(i); const z = pos(flat).getZ(i);
    if (x < minX || y < y0 || y > y1) continue;
    const k = Math.round(y * 2) / 2;
    const e = byLevel.get(k) ?? { lo: Infinity, hi: -Infinity };
    e.lo = Math.min(e.lo, z); e.hi = Math.max(e.hi, z);
    byLevel.set(k, e);
  }
  // Níveis vizinhos (a mesma laje, de espessura 0,2 a 0,9 m) contam como um só.
  const levels = [...byLevel.entries()].filter(([, e]) => e.hi - e.lo >= spanFrac * L).map(([k]) => k).sort((a, b) => a - b);
  const out: number[] = [];
  for (const k of levels) if (out.length === 0 || k - out[out.length - 1] > 1.2) out.push(k);
  return out;
}

const lum = (g: THREE.BufferGeometry, i: number): number => (g.getAttribute('color') as THREE.BufferAttribute).getY(i);
function meanLum(g: THREE.BufferGeometry, y0: number, y1: number): number {
  let s = 0; let n = 0;
  for (let i = 0; i < pos(g).count; i++) if (pos(g).getY(i) >= y0 && pos(g).getY(i) <= y1) { s += lum(g, i); n++; }
  return n ? s / n : NaN;
}

describe('prédios: quina chanfrada (a caixa da fachada é de bisel)', () => {
  for (const s of STYLES) for (const id of s.ids) {
    it(`${id} (${s.name}): nenhum vértice da fachada a menos de 25 cm da quina viva; uv das janelas e normais do kit`, () => {
      const g = facadeOf(id, s.fac);
      expect(nearestToLiveCorner(g), 'a quina vertical está viva').toBeGreaterThan(0.25);
      expect(g.getAttribute('uv'), 'a fachada perde a uv das janelas').toBeDefined();
      expect(g.userData.keepNormals, 'normais do kit (o catálogo não as reescreve)').toBe(true);
    });
  }
  for (const t of TOWERS) {
    it(`${t.id}: a torre também tem a quina chanfrada`, () => {
      expect(nearestToLiveCorner(facadeOf(t.id, t.fac))).toBeGreaterThan(0.25);
    });
  }
});

describe('prédios: cornija, varanda e toldo', () => {
  for (const s of STYLES) for (const id of s.ids) {
    const L = s.fac === 'classic' ? 21 : s.fac === 'office' ? 18 : s.fac === 'house' ? 16 : id.includes('aptbeach') ? 20 : 18;
    it(`${id}: cornija saliente (≥ 25 cm além da fachada, por ≥ 90% do comprimento)`, () => {
      expect(salientLevels(flatOf(id), L, 0.25, 0.9, 4, 200).length).toBeGreaterThanOrEqual(1);
    });
    if (s.varanda) {
      it(`${id}: varanda, uma laje saliente (≥ 40 cm) em pelo menos ${Math.max(3, Math.floor(s.floors / 3))} andares`, () => {
        // As lajes de varanda e a cornija somam: a cornija é uma das faixas (a de cima).
        const levels = salientLevels(flatOf(id), L, 0.4, 0.6, 4.5, 200);
        expect(levels.length).toBeGreaterThanOrEqual(Math.max(3, Math.floor(s.floors / 3)));
      });
    }
    if (s.toldo) {
      it(`${id}: toldo na loja do térreo (peça saliente ≥ 60 cm entre 2 e 4,6 m de altura, por ≥ 40% da frente)`, () => {
        expect(salientLevels(flatOf(id), L, 0.6, 0.4, 2, 4.6).length).toBeGreaterThanOrEqual(1);
      });
    }
  }
});

describe('prédios: luz assada, pegada e orçamento', () => {
  for (const s of STYLES) for (const id of s.ids) {
    it(`${id}: a oclusão está assada na fachada (o pé é ≥ 3% mais escuro que o topo)`, () => {
      const g = facadeOf(id, s.fac);
      g.computeBoundingBox();
      const top = (g.boundingBox as THREE.Box3).max.y;
      // A torre de vidro tem o embasamento claro e o corpo de outro tom: o pé do corpo (acima do embasamento) é que se compara com o topo.
      const [y0, y1] = s.fac === 'office' ? [8, 12] : [0, 7];
      expect(meanLum(g, y0, y1)).toBeLessThan(meanLum(g, top - 4, top) * 0.97);
    });
    it(`${id}: a fachada reta fica na borda de colisão (x = 0) e a malha custa ≤ 1.800 triângulos`, () => {
      expect(Math.abs(modelFrontX(id))).toBeLessThan(0.15);
      expect(modelTriangles(getModel(id))).toBeLessThanOrEqual(1800);
    });
  }
  for (const t of TOWERS) {
    it(`${t.id}: oclusão assada na fachada`, () => {
      const g = facadeOf(t.id, t.fac);
      g.computeBoundingBox();
      const top = (g.boundingBox as THREE.Box3).max.y;
      const [y0, y1] = t.fac === 'office' ? [8, 14] : [0, 10];
      expect(meanLum(g, y0, y1)).toBeLessThan(meanLum(g, top - 6, top) * 0.97);
    });
  }
});
