// Copacabana no acabamento final (onda L, L4; cronograma: "prédios aptbeach com relevo, quiosques, calçadão em ondas, palmeiras de
// cartum com copa de normais esferizadas e tufos com recorte alfa"). As peças saem do kit redondo (geom.ts) e entram no catálogo e
// no layout sem estourar o orçamento (≤ 900 triângulos por segmento) nem a pegada (o `scenery.test.ts` mede visual × colisão).
// Tudo no Node, sem DOM.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getTrack } from '../src/core/track';
import { bladeFill } from '../src/render/scenery/cutout';
import { dressingRecipe, getModel, modelBandRadius, modelBounds, modelFrontX, spriteVisual } from '../src/render/scenery/catalog';
import { CAR_REACH_M, FENCE_M, sceneryLayout } from '../src/render/scenery/layout';
import { collisionHalfM, modelTriangles } from '../src/render/scenery/vegetation';

const pos = (g: THREE.BufferGeometry): THREE.BufferAttribute => g.getAttribute('position') as THREE.BufferAttribute;
const lum = (g: THREE.BufferGeometry, i: number): number => (g.getAttribute('color') as THREE.BufferAttribute).getY(i);

describe('Copacabana: prédio aptbeach com relevo', () => {
  const m = getModel('bld:aptbeach:12:2');
  const facade = m.parts.find((p) => p.mat === 'apartment');
  const flat = m.parts.find((p) => p.mat === 'flat');

  it('a fachada é de caixa com bisel (cantos verticais arredondados) e tem uv das janelas', () => {
    expect(facade).toBeDefined();
    const g = (facade as { geometry: THREE.BufferGeometry }).geometry;
    expect(g.getAttribute('uv')).toBeDefined();
    expect(g.userData.keepNormals).toBe(true);
    // a quina viva da caixa (x = 0, z = ±L/2 = ±10) não existe: o ponto mais perto dela está a ≥ r(√2 − 1) ≈ 0,3 m
    let near = Infinity;
    for (let i = 0; i < pos(g).count; i++) near = Math.min(near, Math.hypot(pos(g).getX(i) - 0, Math.abs(pos(g).getZ(i)) - 10));
    expect(near).toBeGreaterThan(0.25);
  });

  it('tem relevo: sacadas e empenas saem ≥ 1 m da fachada (o prédio antigo saía 0,65 m acima do térreo)', () => {
    let maxX = -Infinity;
    for (const p of m.parts) for (let i = 0; i < pos(p.geometry).count; i++) if (pos(p.geometry).getY(i) > 4) maxX = Math.max(maxX, pos(p.geometry).getX(i));
    expect(maxX).toBeGreaterThanOrEqual(1);
  });

  it('a fachada reta fica na borda de colisão (x = 0 na altura do carro) e a malha custa entre 350 e 1.000 triângulos', () => {
    expect(Math.abs(modelFrontX('bld:aptbeach:12:2'))).toBeLessThan(0.1); // a vitrine da portaria (0,1 m) é o que mais sai, como no prédio de antes
    const t = modelTriangles(m);
    expect(t).toBeGreaterThanOrEqual(350);
    expect(t).toBeLessThanOrEqual(1000);
  });

  it('a oclusão está assada: o pé do prédio é mais escuro que o topo (≥ 3%)', () => {
    const g = (facade as { geometry: THREE.BufferGeometry }).geometry;
    g.computeBoundingBox();
    const top = (g.boundingBox as THREE.Box3).max.y;
    let lo = 0; let nLo = 0; let hi = 0; let nHi = 0;
    for (let i = 0; i < pos(g).count; i++) {
      const y = pos(g).getY(i);
      if (y < 7) { lo += lum(g, i); nLo++; } else if (y > top - 4) { hi += lum(g, i); nHi++; }
    }
    expect(lo / nLo).toBeLessThan((hi / nHi) * 0.97);
    expect(flat).toBeDefined();
  });
});

describe('Copacabana: palmeira de cartum', () => {
  const ids = [0, 1, 2, 3].map((k) => `palm:cartoon:${k}`);

  it('as 4 variantes existem, custam entre 450 e 700 triângulos e a litoral brasileiro as escolhe', () => {
    for (const id of ids) {
      const t = modelTriangles(getModel(id));
      expect(t, id).toBeGreaterThan(450);
      expect(t, id).toBeLessThanOrEqual(700);
    }
    const def = getTrack('copacabana').def;
    const chosen = new Set([0, 1, 2, 3].map((v) => spriteVisual('palm', v, 1, def).models[0].id));
    expect([...chosen].sort()).toEqual(ids);
    // fora do litoral brasileiro nada muda: a palmeira de sempre
    expect(spriteVisual('palm', 0, 1, getTrack('kruger').def).models[0].id.startsWith('palm:cartoon')).toBe(false);
  });

  it('a copa tem a normal esferizada: aponta para fora do centro da copa em ≥ 90% dos vértices e não é a normal da face', () => {
    for (const id of ids) {
      const g = getModel(id).parts[0].geometry;
      expect(g.userData.keepNormals, id).toBe(true);
      g.computeBoundingBox();
      const maxY = (g.boundingBox as THREE.Box3).max.y;
      // a copa = o que é verde e fica na metade de cima (o tronco é marrom ou cinza, o pé de samambaia fica junto do chão)
      const crown: number[] = [];
      const col = g.getAttribute('color') as THREE.BufferAttribute;
      for (let i = 0; i < pos(g).count; i++) if (pos(g).getY(i) > maxY * 0.5 && col.getY(i) > col.getX(i) * 1.15 && col.getY(i) > col.getZ(i) * 1.15) crown.push(i);
      expect(crown.length, id).toBeGreaterThan(100);
      // o eixo da copa: a média (x, z) dos pontos mais altos (o palmito); "fora" = a normal se afasta do eixo na horizontal
      const top: number[] = [];
      for (let i = 0; i < pos(g).count; i++) if (pos(g).getY(i) > maxY - 0.4) top.push(i);
      let ax = 0; let az = 0;
      for (const i of top) { ax += pos(g).getX(i) / top.length; az += pos(g).getZ(i) / top.length; }
      const nor = g.getAttribute('normal') as THREE.BufferAttribute;
      let out = 0; let lie = 0; let counted = 0; let judged = 0;
      const a = new THREE.Vector3(); const b = new THREE.Vector3(); const d = new THREE.Vector3();
      for (const i of crown) {
        const n = new THREE.Vector3().fromBufferAttribute(nor, i);
        const dx = pos(g).getX(i) - ax; const dz = pos(g).getZ(i) - az;
        if (Math.hypot(dx, dz) > 0.5) { judged++; if (n.x * dx + n.z * dz > 0) out++; }
        const f = i - (i % 3);
        a.fromBufferAttribute(pos(g), f); b.fromBufferAttribute(pos(g), f + 1); d.fromBufferAttribute(pos(g), f + 2);
        const fn = b.sub(a).cross(d.sub(a));
        if (fn.lengthSq() > 1e-12) { lie += (Math.acos(Math.min(1, Math.abs(n.dot(fn.normalize())))) * 180) / Math.PI; counted++; }
      }
      expect(out / judged, id).toBeGreaterThanOrEqual(0.9);
      expect(lie / counted, `${id}: normal ≠ face na copa`).toBeGreaterThan(8);
    }
  });

  it('a pegada continua a de colisão (o pé da palmeira chega ao raio dela em qualquer giro)', () => {
    for (const id of ids) expect(modelBandRadius(id), id).toBeGreaterThanOrEqual(collisionHalfM('palm') * 0.95);
  });
});

describe('Copacabana: tufos com recorte alfa', () => {
  it('tuft:cut:* é de material cutout, tem uv e custa ≤ 12 triângulos', () => {
    for (const k of [0, 1, 2]) {
      const m = getModel(`tuft:cut:${k}`);
      expect(m.parts.map((p) => p.mat)).toEqual(['cutout']);
      expect(m.parts[0].geometry.getAttribute('uv')).toBeDefined();
      expect(modelTriangles(m)).toBeLessThanOrEqual(12);
    }
  });

  it('a lâmina de recorte não é quadrado cheio nem vazia: entre 25% e 70% opaca', () => {
    const f = bladeFill();
    expect(f).toBeGreaterThan(0.25);
    expect(f).toBeLessThan(0.7);
  });

  it('a forração do litoral brasileiro usa o tufo com recorte; o resto do mundo, o de sempre', () => {
    expect(dressingRecipe(getTrack('copacabana').def).cover.map(([id]) => id).some((id) => id.startsWith('tuft:cut:'))).toBe(true);
    expect(dressingRecipe(getTrack('kruger').def).cover.map(([id]) => id).some((id) => id.startsWith('tuft:cut:'))).toBe(false);
  });
});

describe('Copacabana: quiosque e calçadão', () => {
  it('o quiosque (kiosk:*) é do kit: ≤ 500 triângulos, de 3 a 5 m, normais próprias e oclusão assada', () => {
    for (const k of [0, 1, 2]) {
      const m = getModel(`kiosk:${k}`);
      expect(modelTriangles(m), `kiosk:${k}`).toBeLessThanOrEqual(500);
      const b = modelBounds(`kiosk:${k}`);
      expect(b.maxY).toBeGreaterThanOrEqual(3);
      expect(b.maxY).toBeLessThanOrEqual(5);
      expect(b.minY).toBeLessThanOrEqual(0.4);
      const flat = m.parts.find((p) => p.mat === 'flat');
      expect(flat?.geometry.userData.keepNormals).toBe(true);
      const g = (flat as { geometry: THREE.BufferGeometry }).geometry;
      let lo = 0; let nLo = 0; let hi = 0; let nHi = 0;
      for (let i = 0; i < pos(g).count; i++) { const y = pos(g).getY(i); if (y < 0.6) { lo += lum(g, i); nLo++; } else if (y > 3) { hi += lum(g, i); nHi++; } }
      expect(lo / nLo, `kiosk:${k}`).toBeLessThan(hi / nHi);
    }
  });

  it('o calçadão (boardwalk) é a tira de 4 m em ondas: ≤ 120 triângulos, preto e branco e baixa demais para tocar o carro (≤ 5 cm)', () => {
    const m = getModel('boardwalk');
    expect(m.parts).toHaveLength(1);
    expect(modelTriangles(m)).toBeLessThanOrEqual(120);
    const b = modelBounds('boardwalk');
    expect(b.maxZ - b.minZ).toBeCloseTo(4, 3);
    expect(b.maxY).toBeLessThanOrEqual(0.05);
    expect(b.maxX - b.minX).toBeGreaterThanOrEqual(4);
  });
});

describe('Copacabana: no layout', () => {
  const track = getTrack('copacabana');
  const layout = sceneryLayout(track);
  const n = track.segments.length;
  const idOf = (p: { model: number }): string => layout.models[p.model];

  it('o calçadão corre pela beira do mar (≥ 95% dos segmentos livres, na areia, lado direito) e a forração não nasce em cima dele', () => {
    let free = 0; let has = 0; let clash = 0;
    layout.bySeg.forEach((list, i) => {
      const nearStart = ((i - track.startIndex + n) % n) < 34 || ((track.startIndex - i + n) % n) < 6;
      if (nearStart || track.segments[i].pit) return;
      free++;
      const bw = list.filter((p) => idOf(p) === 'boardwalk');
      if (bw.length === 1) has++;
      for (const p of bw) { expect(p.x).toBeGreaterThan(9); expect(p.x).toBeLessThan(15); }
      for (const p of list) if (!p.sprite && p.x > 9.8 && p.x < 14 && idOf(p) !== 'boardwalk') clash++;
    });
    expect(has / free).toBeGreaterThanOrEqual(0.95);
    expect(clash).toBe(0);
  });

  it('há ≥ 20 quiosques, todos do lado de terra e além do alcance do carro', () => {
    const kiosks: Array<{ i: number; x: number }> = [];
    layout.bySeg.forEach((list, i) => { for (const p of list) if (idOf(p).startsWith('kiosk:')) kiosks.push({ i, x: p.x }); });
    expect(kiosks.length).toBeGreaterThanOrEqual(20);
    for (const k of kiosks) {
      expect(k.x).toBeLessThan(0);
      expect(Math.abs(k.x) - 3.4).toBeGreaterThanOrEqual(CAR_REACH_M - 0.05);
    }
  });

  it('o resto do mundo não ganha calçadão nem quiosque', () => {
    const other = sceneryLayout(getTrack('foz_do_iguacu'));
    expect(other.models.some((id) => id === 'boardwalk' || id.startsWith('kiosk:'))).toBe(false);
  });

  it('orçamento: ≤ 900 triângulos e ≤ 16 objetos por segmento (medido: ver a saída)', () => {
    let sum = 0; let objs = 0;
    const tris = new Map<string, number>();
    for (const list of layout.bySeg) for (const p of list) {
      const id = idOf(p);
      objs++;
      if (id.startsWith('lm:')) continue;
      let t = tris.get(id);
      if (t === undefined) { t = modelTriangles(getModel(id)); tris.set(id, t); }
      sum += t;
    }
    console.log(`Copacabana: ${(sum / n).toFixed(0)} triângulos por segmento, ${(objs / n).toFixed(1)} objetos por segmento`);
    expect(sum / n).toBeLessThanOrEqual(900);
    expect(objs / n).toBeLessThanOrEqual(16);
    expect(FENCE_M).toBeGreaterThan(CAR_REACH_M);
  });
});
