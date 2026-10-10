// Flora do Brasil nas 7 pistas de deserto do país (onda M, M3; docs/ondas/M/M3.md): hoje elas têm saguaro, marula e acácia (a flora dos EUA e da África). O
// sertão tem `CACTI.br` — mandacaru, xique-xique, coroa-de-frade e palma — e `TREES.desert.br` — carnaúba, juazeiro e umbuzeiro. As espécies de fora
// continuam onde estavam (Rota 66, Cânion, Karoo, Outback, Etna). A pegada de cada espécie sólida é a da colisão (`scenery.test.ts` mede o giro livre;
// aqui, a faixa do carro). Tudo no Node, sem DOM.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getTrack, TRACKS } from '../src/core/track';
import { getModel, modelBandRadius, modelBounds, regionOf, spriteVisual } from '../src/render/scenery/catalog';
import { sceneryLayout } from '../src/render/scenery/layout';
import { collisionHalfM, modelTriangles, tube } from '../src/render/scenery/vegetation';
import { normalLie } from './scenery-medidas';

const BR_DESERT = TRACKS.filter((d) => d.scenery === 'desert' && d.country === 'Brasil');
const CACTI_BR = ['cactus:mandacaru', 'cactus:xique', 'cactus:coroa', 'cactus:palma'];
const TREES_BR = ['tree:carnauba', 'tree:juazeiro', 'tree:umbuzeiro'];
const FOREIGN = /^(cactus:(saguaro|barrel|pear|euphorbia|aloe|agave|spinifex|termite)|tree:(marula|acacia|baobab|eucalyptus|olive|cypress))|^far:(saguaro|flat-acacia)$/;

const idsOf = (track: string): Set<string> => new Set(sceneryLayout(getTrack(track)).models);

describe('flora do Brasil: as 7 pistas de deserto', () => {
  it('são exatamente as 7 do enunciado', () => {
    expect(BR_DESERT.map((d) => d.id).sort()).toEqual(['canoa_quebrada', 'foz_sao_francisco', 'jalapao', 'lencois', 'pedra_da_boca', 'serra_capivara', 'xingo']);
  });

  it('o sprite de cacto vira mandacaru, xique-xique, coroa-de-frade e palma (CACTI.br); a árvore, carnaúba, juazeiro e umbuzeiro (TREES.desert.br)', () => {
    for (const d of BR_DESERT) {
      expect(regionOf(d)).toBe('br');
      const cacti = new Set([0, 1, 2, 3].map((v) => spriteVisual('cactus', v, 1, d).models[0].id));
      expect([...cacti].sort(), d.id).toEqual([...CACTI_BR].sort());
      const trees = new Set([0, 1, 2, 3].map((v) => spriteVisual('tree', v, 1, d).models[0].id));
      expect([...trees].sort(), d.id).toEqual([...TREES_BR].sort());
    }
  });

  it('no layout de cada pista aparecem as 4 espécies de cacto e as 3 árvores, e nenhuma da flora de fora', () => {
    for (const d of BR_DESERT) {
      const ids = idsOf(d.id);
      for (const id of [...CACTI_BR, ...TREES_BR]) expect(ids.has(id), `${d.id} sem ${id}`).toBe(true);
      const foreign = [...ids].filter((id) => FOREIGN.test(id));
      expect(foreign, `${d.id} ainda tem flora de fora`).toEqual([]);
    }
  }, 60000);

  it('as árvores do sertão têm silhueta de longe própria (a de longe não pode ser o saguaro nem a acácia)', () => {
    for (const d of BR_DESERT) {
      const l = sceneryLayout(getTrack(d.id));
      const farIds = new Set(l.bySeg.flatMap((list) => list.filter((p) => p.far >= 0).map((p) => l.models[p.far])));
      expect([...farIds].filter((id) => FOREIGN.test(id)), d.id).toEqual([]);
      const withFar = l.bySeg.flatMap((list) => list.filter((p) => TREES_BR.includes(l.models[p.model]) && p.far >= 0));
      expect(withFar.length, `${d.id}: árvore sem silhueta de longe`).toBeGreaterThan(5);
    }
  }, 60000);

  it('os desertos de fora do Brasil ficam como estavam', () => {
    const spec: Record<string, string[]> = {
      rota_66: ['cactus:saguaro2', 'cactus:saguaro3', 'cactus:barrel', 'cactus:pear'], canion: ['cactus:saguaro2', 'cactus:saguaro3', 'cactus:barrel', 'cactus:pear'],
      karoo: ['cactus:euphorbia', 'cactus:aloe', 'cactus:euphorbia', 'cactus:aloe'], outback: ['cactus:termite', 'cactus:spinifex', 'cactus:termite', 'cactus:spinifex'],
      etna: ['cactus:pear', 'cactus:agave', 'cactus:pear', 'cactus:agave'],
    };
    for (const [id, want] of Object.entries(spec)) {
      const def = TRACKS.find((d) => d.id === id);
      expect(def, id).toBeDefined();
      if (def) expect([0, 1, 2, 3].map((v) => spriteVisual('cactus', v, 1, def).models[0].id), id).toEqual(want);
    }
    expect(spriteVisual('tree', 0, 1, TRACKS.find((d) => d.id === 'rota_66')!).models[0].id).toBe('tree:marula');
  });
});

/** Pontas (picos de altura) de um modelo: células de 0,25 m cujo topo passa de `minFrac` da altura e é maior que o das 8 vizinhas. */
function tips(id: string, minFrac: number): number {
  const cell = 0.25;
  const top = new Map<string, number>();
  let H = 0;
  for (const part of getModel(id).parts) {
    const p = part.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const k = `${Math.floor(p.getX(i) / cell)},${Math.floor(p.getZ(i) / cell)}`;
      top.set(k, Math.max(top.get(k) ?? -Infinity, p.getY(i)));
      H = Math.max(H, p.getY(i));
    }
  }
  let n = 0;
  for (const [k, y] of top) {
    if (y < H * minFrac) continue;
    const [cx, cz] = k.split(',').map(Number);
    let peak = true;
    for (let dx = -2; dx <= 2 && peak; dx++) for (let dz = -2; dz <= 2; dz++) {
      if ((dx || dz) && (top.get(`${cx + dx},${cz + dz}`) ?? -Infinity) > y) { peak = false; break; }
    }
    if (peak) n++;
  }
  return n;
}

/** Cor média (linear) dos vértices de `flat` com a altura em [y0, y1]. */
function meanColor(id: string, y0: number, y1: number): THREE.Color {
  const c = new THREE.Color(0, 0, 0); let n = 0;
  for (const part of getModel(id).parts) {
    if (part.mat !== 'flat') continue;
    const p = part.geometry.getAttribute('position'); const col = part.geometry.getAttribute('color');
    for (let i = 0; i < p.count; i++) if (p.getY(i) >= y0 && p.getY(i) <= y1) { c.r += col.getX(i); c.g += col.getY(i); c.b += col.getZ(i); n++; }
  }
  return n ? c.multiplyScalar(1 / n) : c;
}

const crownWidth = (id: string, fromY: number): number => {
  let lo = Infinity; let hi = -Infinity; let loZ = Infinity; let hiZ = -Infinity;
  for (const part of getModel(id).parts) {
    const p = part.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) if (p.getY(i) >= fromY) { lo = Math.min(lo, p.getX(i)); hi = Math.max(hi, p.getX(i)); loZ = Math.min(loZ, p.getZ(i)); hiZ = Math.max(hiZ, p.getZ(i)); }
  }
  return Math.max(hi - lo, hiZ - loZ);
};

describe('flora do Brasil: as espécies', () => {
  it('cada uma custa no máximo 900 triângulos, é redonda (faceta ≤ 15°) e tem um tamanho de planta', () => {
    for (const id of [...CACTI_BR, ...TREES_BR]) {
      const m = getModel(id);
      expect(modelTriangles(m), id).toBeLessThanOrEqual(900);
      expect(modelTriangles(m), id).toBeGreaterThanOrEqual(60);
      expect(normalLie(m.parts), `${id} faceta`).toBeLessThanOrEqual(15);
    }
  });

  it('a pegada das sólidas é a da colisão na faixa do carro (cacto 0,98 m; árvore 1,75 m)', () => {
    for (const id of CACTI_BR) {
      const r = modelBandRadius(id); const half = collisionHalfM('cactus');
      expect(r, id).toBeGreaterThanOrEqual(half * 0.92 - 0.15);
      expect(r, id).toBeLessThanOrEqual(half * 1.3 + 0.15);
    }
    for (const id of TREES_BR) {
      const r = modelBandRadius(id); const half = collisionHalfM('tree');
      expect(r, id).toBeGreaterThanOrEqual(half * 0.92 - 0.15);
      expect(r, id).toBeLessThanOrEqual(half * 1.3 + 0.15);
    }
  });

  it('mandacaru: coluna alta e canelada com o candelabro (≥ 3 pontas no alto), verde com a flor branca e o fruto vermelho', () => {
    const b = modelBounds('cactus:mandacaru');
    expect(b.maxY).toBeGreaterThanOrEqual(4.2);
    expect(b.maxY).toBeLessThanOrEqual(7.5);
    expect(tips('cactus:mandacaru', 0.62)).toBeGreaterThanOrEqual(3);
    const body = meanColor('cactus:mandacaru', 0.3, b.maxY * 0.8);
    expect(body.g, 'verde').toBeGreaterThan(body.r * 1.15);
    expect(body.g).toBeGreaterThan(body.b * 1.3);
    // A flor branca (todos os canais altos) e o fruto vermelho existem em algum vértice.
    let white = 0; let red = 0;
    for (const part of getModel('cactus:mandacaru').parts) {
      const col = part.geometry.getAttribute('color');
      for (let i = 0; i < col.count; i++) {
        if (col.getX(i) > 0.7 && col.getY(i) > 0.7 && col.getZ(i) > 0.6) white++;
        if (col.getX(i) > 0.5 && col.getX(i) > col.getY(i) * 2.5) red++;
      }
    }
    expect(white, 'flor branca').toBeGreaterThan(5);
    expect(red, 'fruto vermelho').toBeGreaterThan(5);
  });

  it('xique-xique: touceira baixa e larga de articulações (≤ 1,3 m de altura, a pegada inteira, muitas peças)', () => {
    const b = modelBounds('cactus:xique');
    expect(b.maxY).toBeLessThanOrEqual(1.3);
    expect(b.maxY).toBeGreaterThanOrEqual(0.6);
    expect(b.maxX - b.minX).toBeGreaterThanOrEqual(1.6);
    expect(modelTriangles(getModel('cactus:xique'))).toBeGreaterThanOrEqual(150);
  });

  it('coroa-de-frade: bola canelada baixa de ≤ 1 m com a coroa vermelha no topo', () => {
    const b = modelBounds('cactus:coroa');
    expect(b.maxY).toBeLessThanOrEqual(1.0);
    expect(b.maxY).toBeGreaterThanOrEqual(0.45);
    const cap = meanColor('cactus:coroa', b.maxY * 0.8, b.maxY + 1);
    expect(cap.r, 'a coroa é vermelha').toBeGreaterThan(cap.g * 1.6);
    const body = meanColor('cactus:coroa', 0.05, b.maxY * 0.55);
    expect(body.g, 'o corpo é verde').toBeGreaterThan(body.r);
  });

  it('palma: raquetes empilhadas de 1,6 a 2,8 m, verdes, com os frutos vermelhos', () => {
    const b = modelBounds('cactus:palma');
    expect(b.maxY).toBeGreaterThanOrEqual(1.6);
    expect(b.maxY).toBeLessThanOrEqual(2.8);
    const body = meanColor('cactus:palma', 0.3, b.maxY);
    expect(body.g).toBeGreaterThan(body.r * 1.1);
  });

  it('carnaúba: palmeira de tronco reto e alto (7 a 12 m) com a copa de leques larga (≥ 3,5 m), verde-azulada', () => {
    const b = modelBounds('tree:carnauba');
    expect(b.maxY).toBeGreaterThanOrEqual(7);
    expect(b.maxY).toBeLessThanOrEqual(12);
    expect(crownWidth('tree:carnauba', b.maxY * 0.85)).toBeGreaterThanOrEqual(3.5);
    // O tronco é reto: os pontos do tronco (entre 20% e 70% da altura, a menos de 0,8 m do eixo) têm o centro no eixo (nada de coqueiro tombado).
    const trunk = new THREE.Box3();
    let n = 0;
    for (const part of getModel('tree:carnauba').parts) {
      const p = part.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) if (p.getY(i) >= b.maxY * 0.2 && p.getY(i) <= b.maxY * 0.7 && Math.hypot(p.getX(i), p.getZ(i)) < 0.8) { trunk.expandByPoint(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))); n++; }
    }
    expect(n, 'pontos do tronco').toBeGreaterThan(20);
    expect(Math.hypot((trunk.min.x + trunk.max.x) / 2, (trunk.min.z + trunk.max.z) / 2)).toBeLessThan(0.35);
    const leaf = meanColor('tree:carnauba', b.maxY * 0.8, b.maxY + 1);
    expect(leaf.g, 'folha verde').toBeGreaterThan(leaf.r);
  });

  it('juazeiro: copa larga, redonda e densa (≥ 4 m) de 4 a 8 m, verde-escura', () => {
    const b = modelBounds('tree:juazeiro');
    expect(b.maxY).toBeGreaterThanOrEqual(4);
    expect(b.maxY).toBeLessThanOrEqual(8);
    expect(crownWidth('tree:juazeiro', b.maxY * 0.6)).toBeGreaterThanOrEqual(4);
    const leaf = meanColor('tree:juazeiro', b.maxY * 0.5, b.maxY + 1);
    expect(leaf.g).toBeGreaterThan(leaf.r * 1.3);
  });

  it('umbuzeiro: guarda-chuva baixo e mais largo que alto (copa/altura ≥ 1,3), de 3 a 5,5 m', () => {
    const b = modelBounds('tree:umbuzeiro');
    expect(b.maxY).toBeGreaterThanOrEqual(3);
    expect(b.maxY).toBeLessThanOrEqual(5.5);
    expect(crownWidth('tree:umbuzeiro', b.maxY * 0.5) / b.maxY).toBeGreaterThanOrEqual(1.3);
  });
});

describe('flora do Brasil: o tubo (a peça dos cactos)', () => {
  it('a volta dos triângulos deixa a normal para fora (lados e cúpula) e a contagem é a esperada', () => {
    const g = tube([[0, 0, 0], [0, 1, 0], [0, 2, 0]], [0.3, 0.3, 0.25], '#ffffff', { sides: 12, dome: true });
    const pos = g.getAttribute('position');
    expect(pos.count / 3).toBe(12 * 2 * 2 + 12 * 2 + 12); // 2 faixas, 1 faixa de cúpula e o leque do bico
    const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
    for (let t = 0; t < pos.count; t += 3) {
      a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
      const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
      const out = centroid.clone().sub(new THREE.Vector3(0, Math.min(2, Math.max(0, centroid.y)), 0));
      expect(n.dot(out), `triângulo ${t / 3}`).toBeGreaterThan(0);
    }
  });

  it('o braço dobra no cotovelo sem abrir (anéis contínuos): a curva é uma superfície só, sem buraco de emenda', () => {
    const g = tube([[0, 0, 0], [0.6, 0.2, 0], [0.9, 0.9, 0], [0.9, 2, 0]], [0.17, 0.17, 0.16, 0.14], '#ffffff', { sides: 14 });
    const pos = g.getAttribute('position');
    // Todo vértice de anel é compartilhado por duas faixas (exceto os das pontas): cada ponto aparece 3 ou 6 vezes na malha não indexada.
    const seen = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) { const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`; seen.set(k, (seen.get(k) ?? 0) + 1); }
    for (const n of seen.values()) expect([3, 6, 2, 1]).toContain(n);
    expect(seen.size).toBe(14 * 4); // 4 anéis de 14 pontos, nenhum a mais
  });
});
