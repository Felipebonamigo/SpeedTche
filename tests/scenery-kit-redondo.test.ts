// Kit redondo (onda L, L4; docs/DIRECAO-DE-ARTE.md §2, "forma redonda e volumosa", e o cronograma: "caixa com bisel,
// ExtrudeGeometry com bevelEnabled e curveSegments ≥ 6, AO por vértice"). O bisel do kit é de 1 gomo com a normal esférica
// no vértice (a luz gira 90° no canto e a caixa custa 108 triângulos, não 588); a normal própria tem de sobreviver à fusão e
// ao `smoothModel` do catálogo, que reescreve a de toda parte iluminada. Tudo no Node, sem DOM.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  bakeAO, bevelBox, bevelExtrude, box, BEVEL_EXTRUDE, cutoutCards, mergeRound, paint, sphere, sphericalNormals, tf, wavyStrip, type Geo,
} from '../src/render/scenery/geom';
import { smoothModel } from '../src/render/scenery/smooth';

const tris = (g: Geo): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
const P = (g: Geo, i: number): THREE.Vector3 => new THREE.Vector3().fromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute, i);
const N = (g: Geo, i: number): THREE.Vector3 => new THREE.Vector3().fromBufferAttribute(g.getAttribute('normal') as THREE.BufferAttribute, i);
const colorAt = (g: Geo, i: number): number => (g.getAttribute('color') as THREE.BufferAttribute).getX(i);

describe('kit redondo: caixa com bisel', () => {
  const g = bevelBox(10, 20, 6, 0.8);

  it('custa 108 triângulos (1 gomo de bisel), não indexada, com position, normal e uv', () => {
    expect(tris(g)).toBe(108);
    expect(g.index).toBeNull();
    expect(g.getAttribute('normal')).toBeDefined();
  });

  it('mede w × h × d e nenhum vértice passa da caixa', () => {
    g.computeBoundingBox();
    const b = g.boundingBox as THREE.Box3;
    expect(b.max.x - b.min.x).toBeCloseTo(10, 5);
    expect(b.max.y - b.min.y).toBeCloseTo(20, 5);
    expect(b.max.z - b.min.z).toBeCloseTo(6, 5);
    expect(b.min.x).toBeCloseTo(-5, 5); expect(b.max.y).toBeCloseTo(10, 5);
  });

  it('a normal de cada vértice é unitária e aponta para fora (nunca para dentro da caixa)', () => {
    for (let i = 0; i < g.getAttribute('position').count; i++) {
      const n = N(g, i);
      expect(n.length()).toBeCloseTo(1, 4);
      expect(n.dot(P(g, i)), `vértice ${i}`).toBeGreaterThan(0);
    }
  });

  it('o enrolamento de cada triângulo concorda com as normais dos vértices (a face aponta para fora: o AO e a luz dependem disso)', () => {
    const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
    for (let t = 0; t < tris(g); t++) {
      a.copy(P(g, t * 3)); b.copy(P(g, t * 3 + 1)); c.copy(P(g, t * 3 + 2));
      const face = b.clone().sub(a).cross(c.clone().sub(a));
      if (face.lengthSq() < 1e-12) continue; // face degenerada (o pico do canto): não conta
      const avg = N(g, t * 3).add(N(g, t * 3 + 1)).add(N(g, t * 3 + 2));
      expect(face.normalize().dot(avg.normalize()), `triângulo ${t}`).toBeGreaterThan(0.5);
    }
  });

  it('o meio da face é reto (x = w/2) e o canto é arredondado: nada a menos de r(√3−1) da quina viva', () => {
    let nearCorner = Infinity;
    const corner = new THREE.Vector3(5, 10, 3);
    const face: THREE.Vector3[] = [];
    for (let i = 0; i < g.getAttribute('position').count; i++) {
      const p = P(g, i);
      nearCorner = Math.min(nearCorner, p.distanceTo(corner));
      if (Math.abs(p.x - 5) < 1e-6) face.push(p);
    }
    // a esfera do canto tem raio r e centro a r·(1,1,1) da quina: o ponto mais perto dela está a r·(√3 − 1)
    expect(nearCorner).toBeGreaterThanOrEqual(0.8 * (Math.sqrt(3) - 1) - 1e-6);
    expect(face.length).toBeGreaterThan(0);
    // só o miolo da face fica em x = w/2; o resto da grade vira arco
    for (const p of face) { expect(Math.abs(p.y)).toBeLessThanOrEqual(10 - 0.8 + 1e-6); expect(Math.abs(p.z)).toBeLessThanOrEqual(3 - 0.8 + 1e-6); }
  });

  it('com a escala da textura, a uv anda em metros (janela de 12 m por repetição)', () => {
    const f = bevelBox(24, 12, 12, 0.5, [12, 12]);
    const uv = f.getAttribute('uv') as THREE.BufferAttribute;
    let maxU = 0;
    for (let i = 0; i < uv.count; i++) maxU = Math.max(maxU, uv.getX(i));
    expect(maxU).toBeCloseTo(24 / 12, 2); // a face larga (24 m) dá 2 repetições
    expect(bevelBox(2, 2, 2, 0.3).getAttribute('uv')).toBeUndefined();
  });

  it('raio maior que a metade da menor medida é limitado (a caixa não vira do avesso)', () => {
    const c = bevelBox(1, 8, 8, 5);
    c.computeBoundingBox();
    expect((c.boundingBox as THREE.Box3).max.x).toBeCloseTo(0.5, 5);
    for (let i = 0; i < c.getAttribute('position').count; i++) expect(Number.isFinite(P(c, i).x)).toBe(true);
  });
});

describe('kit redondo: extrusão com bisel', () => {
  it('as opções são as da bíblia: bevelEnabled e curveSegments ≥ 6', () => {
    expect(BEVEL_EXTRUDE.bevelEnabled).toBe(true);
    expect(BEVEL_EXTRUDE.curveSegments).toBeGreaterThanOrEqual(6);
    expect(BEVEL_EXTRUDE.bevelSegments).toBeGreaterThanOrEqual(2);
  });

  it('a curva do contorno usa curveSegments e o bisel soma `bevel` em cada tampa', () => {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 2, 0, Math.PI * 2, false);
    const g = bevelExtrude(shape, 1.5, 0.25);
    // o círculo inteiro sai com 2 × curveSegments pontos no contorno (o `Path` do three dobra a resolução da elipse)
    const ring = new Set<string>();
    for (let i = 0; i < g.getAttribute('position').count; i++) {
      const p = P(g, i);
      if (p.z > 1.5 / 2 + 0.2) ring.add(`${p.x.toFixed(3)},${p.y.toFixed(3)}`);
    }
    expect(ring.size).toBeGreaterThanOrEqual(2 * BEVEL_EXTRUDE.curveSegments);
    g.computeBoundingBox();
    const b = g.boundingBox as THREE.Box3;
    expect(b.max.z - b.min.z).toBeCloseTo(1.5 + 2 * 0.25, 4); // com bisel o sólido cresce `bevel` em cada tampa
    expect(g.index).toBeNull();
    expect(g.getAttribute('color')).toBeDefined();
  });
});

describe('kit redondo: oclusão de ambiente por vértice', () => {
  const twoBoxes = (): Geo => {
    // uma caixa no chão e uma parede encostada nela: a fresta entre as duas é o canto interno
    const a = paint(box(4, 2, 4), '#ffffff', tf(0, 1, 0));
    const b = paint(box(1, 6, 8), '#ffffff', tf(3.1, 3, 0)); // a 0,6 m da caixa baixa e mais larga que ela (a quina da caixa não escapa pela ponta)
    const merged = mergeRound([a, b]);
    return merged;
  };

  it('o vértice na fresta fica mais escuro que o do topo livre, e só a cor muda', () => {
    const g = twoBoxes();
    const before = Array.from((g.getAttribute('position') as THREE.BufferAttribute).array);
    bakeAO(g, { ground: false });
    expect(Array.from((g.getAttribute('position') as THREE.BufferAttribute).array)).toEqual(before);
    let crease = 1; let top = 0;
    for (let i = 0; i < g.getAttribute('position').count; i++) {
      const p = P(g, i); const n = N(g, i);
      // topo da caixa baixa junto da parede (a fresta): y = 2, x = 2 − folga, voltado para cima
      if (Math.abs(p.y - 2) < 1e-6 && Math.abs(p.x - 2) < 1e-6 && n.y > 0.9) crease = Math.min(crease, colorAt(g, i));
      // topo da parede alta: livre
      if (Math.abs(p.y - 6) < 1e-6 && n.y > 0.9) top = Math.max(top, colorAt(g, i));
    }
    expect(top).toBeGreaterThan(0.97);
    expect(crease).toBeLessThan(0.9);
  });

  it('vértice sem nada em volta fica em 1,0; o chão escurece a base e a malha continua a mesma', () => {
    const lone = mergeRound([paint(box(1, 1, 1), '#ffffff', tf(0, 40, 0))]);
    bakeAO(lone, { ground: true });
    for (let i = 0; i < lone.getAttribute('position').count; i++) expect(colorAt(lone, i)).toBeCloseTo(1, 5);
    const stand = mergeRound([paint(box(4, 4, 4), '#ffffff', tf(0, 2, 0))]);
    bakeAO(stand, { ground: true, reach: 3 });
    let foot = 1; let head = 0;
    for (let i = 0; i < stand.getAttribute('position').count; i++) {
      const p = P(stand, i);
      if (N(stand, i).x > 0.9 && p.y < 0.2) foot = Math.min(foot, colorAt(stand, i));
      if (N(stand, i).y > 0.9) head = Math.max(head, colorAt(stand, i));
    }
    expect(foot).toBeLessThan(0.92);
    expect(head).toBeGreaterThan(0.97);
  });

  it('é determinístico (mesma malha, mesmo resultado, bit a bit)', () => {
    const a = twoBoxes(); const b = twoBoxes();
    bakeAO(a); bakeAO(b);
    expect(Array.from((a.getAttribute('color') as THREE.BufferAttribute).array)).toEqual(Array.from((b.getAttribute('color') as THREE.BufferAttribute).array));
  });
});

describe('kit redondo: a normal própria sobrevive à fusão e ao catálogo', () => {
  it('mergeRound guarda as normais e marca keepNormals; smoothModel não as reescreve', () => {
    const b = paint(bevelBox(6, 6, 6, 1), '#cccccc');
    const before = Array.from((b.getAttribute('normal') as THREE.BufferAttribute).array);
    const m = mergeRound([b]);
    expect(m.userData.keepNormals).toBe(true);
    expect(Array.from((m.getAttribute('normal') as THREE.BufferAttribute).array)).toEqual(before);
    smoothModel('bld:aptbeach:5:0', { parts: [{ geometry: m, mat: 'flat' }] });
    expect(Array.from((m.getAttribute('normal') as THREE.BufferAttribute).array)).toEqual(before);
  });

  it('sem a marca, o catálogo continua suavizando como sempre (a caixa de 90° segue viva)', () => {
    const plain = paint(box(6, 6, 6), '#cccccc');
    smoothModel('bld:apt:5:0', { parts: [{ geometry: plain, mat: 'flat' }] });
    for (let i = 0; i < plain.getAttribute('position').count; i++) {
      const n = N(plain, i);
      expect(Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z))).toBeGreaterThan(0.999);
    }
  });
});

describe('kit redondo: normal esferizada da copa', () => {
  it('mix = 1: a normal aponta para fora do centro da copa (≤ 25°); mix = 0 não muda nada', () => {
    const copa = paint(new THREE.PlaneGeometry(2, 2, 2, 2).rotateX(-Math.PI / 2).translate(0, 3, 1), '#3a9a3a'); // folha chata e voltada para cima
    const center: [number, number, number] = [0, 2, 0];
    const flat = Array.from((copa.getAttribute('normal') as THREE.BufferAttribute).array);
    sphericalNormals(copa, center, 0);
    expect(Array.from((copa.getAttribute('normal') as THREE.BufferAttribute).array)).toEqual(flat);
    sphericalNormals(copa, center, 1);
    for (let i = 0; i < copa.getAttribute('position').count; i++) {
      const radial = P(copa, i).sub(new THREE.Vector3(...center)).normalize();
      expect(N(copa, i).angleTo(radial) * (180 / Math.PI), `vértice ${i}`).toBeLessThanOrEqual(25);
    }
  });

  it('a esfera não muda quando já é esférica', () => {
    const s = paint(sphere(2, 12, 8), '#fff');
    const before = Array.from((s.getAttribute('normal') as THREE.BufferAttribute).array);
    sphericalNormals(s, [0, 0, 0], 1);
    const after = Array.from((s.getAttribute('normal') as THREE.BufferAttribute).array);
    let worst = 0;
    for (let i = 0; i < before.length; i += 3) worst = Math.max(worst, new THREE.Vector3(before[i], before[i + 1], before[i + 2]).angleTo(new THREE.Vector3(after[i], after[i + 1], after[i + 2])));
    expect(worst).toBeLessThan(0.05);
  });
});

describe('kit redondo: recorte alfa e calçadão em ondas', () => {
  it('cutoutCards: só position, normal, color e uv; uv em [0,1]; 2 triângulos por cartão; cartões cruzados', () => {
    const g = cutoutCards(3, 0.9, 0.7, 5);
    expect(Object.keys(g.attributes).sort()).toEqual(['color', 'normal', 'position', 'uv']);
    expect(tris(g)).toBe(6);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) { expect(uv.getX(i)).toBeGreaterThanOrEqual(0); expect(uv.getX(i)).toBeLessThanOrEqual(1); expect(uv.getY(i)).toBeGreaterThanOrEqual(0); expect(uv.getY(i)).toBeLessThanOrEqual(1); }
    // dois cartões não são paralelos: as normais de face diferem
    const faceN = (t: number): THREE.Vector3 => new THREE.Vector3().subVectors(P(g, t * 3 + 1), P(g, t * 3)).cross(new THREE.Vector3().subVectors(P(g, t * 3 + 2), P(g, t * 3))).normalize();
    expect(Math.abs(faceN(0).dot(faceN(2)))).toBeLessThan(0.9);
  });

  it('wavyStrip: ondas ao longo do comprimento, só preto e branco (+ meio-fio), tampa plana', () => {
    const g = wavyStrip({ len: 4, width: 4.4, waves: 2, amp: 0.35, bands: 4, zdiv: 8, thick: 0.1 });
    g.computeBoundingBox();
    const b = g.boundingBox as THREE.Box3;
    expect(b.max.z - b.min.z).toBeCloseTo(4, 4);
    expect(b.max.x - b.min.x).toBeCloseTo(4.4, 4);
    expect(b.max.y).toBeLessThanOrEqual(0.1 + 1e-6);
    const colors = new Set<string>();
    const col = g.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < col.count; i++) colors.add(col.getX(i).toFixed(2));
    expect([...colors].length).toBeLessThanOrEqual(3);
    // 2 ondas em 4 m: a 1ª fronteira interna entre as faixas cruza a sua média pelo menos 3 vezes ao longo de Z
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const rows = new Map<string, Set<number>>();
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < 0.09) continue; // só a tampa
      const k = pos.getZ(i).toFixed(3);
      const set = rows.get(k) ?? new Set<number>();
      set.add(Number(pos.getX(i).toFixed(3)));
      rows.set(k, set);
    }
    expect(rows.size).toBe(9); // zdiv + 1 fileiras
    const seq = [...rows.entries()].sort((a, c) => Number(a[0]) - Number(c[0])).map(([, set]) => [...set].sort((a, c) => a - c)[1]);
    const mean = seq.reduce((s, v) => s + v, 0) / seq.length;
    let crossings = 0;
    for (let i = 1; i < seq.length; i++) if ((seq[i - 1] - mean) * (seq[i] - mean) < 0) crossings++;
    expect(crossings).toBeGreaterThanOrEqual(3);
    expect(Math.max(...seq) - Math.min(...seq)).toBeGreaterThan(0.35); // a onda tem amplitude de verdade
    expect(tris(g)).toBeLessThanOrEqual(120);
  });
});
