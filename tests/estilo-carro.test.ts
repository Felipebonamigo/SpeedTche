// M4 — os 13 estilos procedurais na proporção da bíblia (docs/DIRECAO-DE-ARTE.md §2, item 1), como reserva e LOD do .glb:
// roda grande, traseira-vitrine (lanterna grande, escape, difusor, aerofólio de brinquedo), cabine bolha, vidro com reflexo
// e o casco simples (lod1). Cada número abaixo é a META provisória do cartão docs/ondas/M/M4.md, §3; a bíblia chama a roda
// de "provisória" até a decisão nº 7 e o bench do dono. As medidas são feitas AQUI, na malha: um descritor de estilo que
// mentisse sobre o que construiu seria pego (o aerofólio descrito tem de existir na geometria).
import { describe, expect, it } from 'vitest';
import { CAR_BODIES } from '../src/core/data/cars';
import type { CarBody } from '../src/core/types';
import { CAR_LIMITS } from '../src/render/cars/check';
import type { CarModel } from '../src/render/cars/model';
import { MODEL_BUILDERS, buildModel } from '../src/render/cars/models';

const META = { shellMax: 4500, wheelRatio: 0.19, tailArea: 0.15, bubble: 0.92, lodMax: 0.5, exhaustR: 0.055, glassMetal: 0.85, glassRough: 0.06 } as const;
/**
 * Estilos já no desenho HCT (V2, docs/ondas/V2-gt.md): a diretriz nova do dono ("um pouco mais realista que o Horizon Chase Turbo", 13–14/10)
 * substitui a cabine bolha de cartum da M4 — o vidro do HCT2 aprovado tem caimento de carro de verdade. Neles a bolha não vale; o caimento é
 * conferido em tests/estilo-carro-gt.test.ts. O resto (roda, lanterna, difusor, asa, vidro reflexivo, lod1, teto do casco) vale para os 13.
 */
const HCT: readonly CarBody[] = ['gt', 'wedge', 'hyper', 'prototype', 'roadster', 'rally', 'muscle', 'electric', 'hatch', 'sedan', 'pickup'];
/** Estilos com aerofólio de brinquedo; clássico, sedã, picape, micro e o roadster (cockpit aberto, com as corcovas) ficam sem, de propósito (decisão de forma). */
const WING: readonly CarBody[] = ['gt', 'muscle', 'hatch', 'rally', 'hyper', 'wedge', 'prototype', 'electric'];

const models = new Map<CarBody, CarModel>(CAR_BODIES.map((b) => [b, buildModel(b)]));
const get = (b: CarBody): CarModel => models.get(b) as CarModel;

interface Tri { cx: number; cy: number; cz: number; nz: number; area: number; i: number }

/** Triângulos da malha não indexada: centroide, normal em z e área. */
function triangles(m: { getAttribute(n: string): { getX(i: number): number; getY(i: number): number; getZ(i: number): number } }): Tri[] {
  const p = m.getAttribute('position');
  const out: Tri[] = [];
  const n = (p as unknown as { count: number }).count;
  for (let i = 0; i < n; i += 3) {
    const ux = p.getX(i + 1) - p.getX(i); const uy = p.getY(i + 1) - p.getY(i); const uz = p.getZ(i + 1) - p.getZ(i);
    const vx = p.getX(i + 2) - p.getX(i); const vy = p.getY(i + 2) - p.getY(i); const vz = p.getZ(i + 2) - p.getZ(i);
    const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nzz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nzz);
    out.push({ cx: (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cy: (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, cz: (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3, nz: l > 0 ? nzz / l : 0, area: l / 2, i });
  }
  return out;
}

const length = (m: CarModel): number => { const bb = m.shell.boundingBox; if (!bb) throw new Error('sem caixa'); return bb.max.z - bb.min.z; };
/** Diâmetro da menor roda sobre o comprimento do casco. */
const wheelRatio = (m: CarModel): number => (2 * Math.min(m.axles[0].r, m.axles[1].r)) / length(m);
/** Área (m²) das lanternas (aMat.w) voltadas para trás. */
function tailArea(m: CarModel): number {
  const mat = m.shell.getAttribute('aMat');
  return triangles(m.shell).filter((t) => mat.getW(t.i) > 0.5 && t.nz > 0.5).reduce((s, t) => s + t.area, 0);
}
/** Vértices do vidro: pincel de baixa rugosidade e metal alto (GLASS/GLASS_DARK), fora o brilho de lente. */
function glassVertices(m: CarModel): number[] {
  const mat = m.shell.getAttribute('aMat');
  const out: number[] = [];
  for (let i = 0; i < mat.count; i++) if (mat.getX(i) <= 0.08 && mat.getY(i) >= 0.6 && mat.getZ(i) < 0.1 && mat.getW(i) < 0.1) out.push(i);
  return out;
}
/**
 * Cabine bolha: a largura da METADE DE CIMA do vidro sobre a largura máxima dele. 1 = paredes retas (bolha); a cabine que
 * afunila para o teto dá menos (a de antes: 0,77 a 0,91). Mede o vidro todo (pincéis de baixa rugosidade e metal alto).
 */
function bubble(m: CarModel): number {
  const p = m.shell.getAttribute('position');
  const v = glassVertices(m);
  if (!v.length) return 0;
  const ys = v.map((i) => p.getY(i));
  const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
  const half = (list: number[]) => Math.max(...list.map((i) => Math.abs(p.getX(i))));
  return half(v.filter((i) => p.getY(i) >= mid)) / half(v);
}
/** Triângulos com o centroide dentro da caixa. */
function inside(m: CarModel, box: { min: readonly number[]; max: readonly number[] }): number {
  return triangles(m.shell).filter((t) => t.cx >= box.min[0] && t.cx <= box.max[0] && t.cy >= box.min[1] && t.cy <= box.max[1] && t.cz >= box.min[2] && t.cz <= box.max[2]).length;
}

describe('estilo do carro: roda grande', () => {
  it.each(CAR_BODIES.map((b) => [b] as const))('%s: diâmetro da roda ≥ 19% do comprimento', (body) => {
    expect(wheelRatio(get(body))).toBeGreaterThanOrEqual(META.wheelRatio);
  });

  it('a roda cresce DENTRO da pegada: o casco não passa do que a colisão já supõe', () => {
    for (const body of CAR_BODIES) {
      const m = get(body);
      const bb = m.shell.boundingBox;
      if (!bb) throw new Error(body);
      expect(bb.max.z, body).toBeLessThanOrEqual(CAR_LIMITS.halfLength);
      expect(bb.min.z, body).toBeGreaterThanOrEqual(-CAR_LIMITS.halfLength);
      for (const a of m.axles) expect(Math.abs(a.z) + a.r, body).toBeLessThan(2.2);
    }
  });
});

describe('estilo do carro: traseira-vitrine', () => {
  it.each(CAR_BODIES.map((b) => [b] as const))('%s: lanternas grandes (≥ 0,15 m² vistos de trás)', (body) => {
    expect(tailArea(get(body))).toBeGreaterThanOrEqual(META.tailArea);
  });

  it.each(CAR_BODIES.map((b) => [b] as const))('%s: escape de ponteira larga e difusor, descritos e presentes na malha', (body) => {
    const m = get(body);
    expect(m.rear, 'sem o descritor da traseira').toBeDefined();
    if (!m.rear) return;
    expect(m.rear.exhausts.length).toBeGreaterThanOrEqual(1);
    expect(m.rear.exhausts.length).toBeLessThanOrEqual(2);
    // As saídas da chama do nitro são as ponteiras (mesmo lugar, a menos da ponta).
    expect(m.exhausts.length).toBe(m.rear.exhausts.length);
    m.rear.exhausts.forEach((e, k) => {
      expect(e.r).toBeGreaterThanOrEqual(META.exhaustR);
      expect(Math.abs(e.x - m.exhausts[k][0])).toBeLessThan(0.05);
    });
    const bb = m.shell.boundingBox;
    const d = m.rear.diffuser;
    expect(d.max[1]).toBeLessThan(0.5); // rente ao chão
    expect(d.min[2]).toBeGreaterThan((bb?.max.z ?? 0) - 0.7); // na traseira
    expect(d.max[0] - d.min[0]).toBeGreaterThanOrEqual(0.9);
    expect(inside(m, d), 'o difusor descrito não está na malha').toBeGreaterThanOrEqual(8);
  });

  it('aerofólio de brinquedo: nos esportivos, descrito e na malha; nos demais, nenhum', () => {
    for (const body of CAR_BODIES) {
      const m = get(body);
      const w = m.rear?.wing ?? null;
      if (!WING.includes(body)) { expect(w, `${body}: sem aerofólio por forma`).toBeNull(); continue; }
      expect(w, `${body}: aerofólio`).not.toBeNull();
      if (!w) continue;
      expect(w.max[0] - w.min[0], `${body}: largura`).toBeGreaterThanOrEqual(1.0);
      expect(w.max[0], body).toBeLessThanOrEqual(CAR_LIMITS.halfWidth);
      expect(w.min[2], `${body}: fica na metade de trás`).toBeGreaterThan(0.5);
      expect(w.max[1], body).toBeLessThan(CAR_LIMITS.maxHeight);
      expect(inside(m, w), `${body}: o aerofólio descrito não está na malha`).toBeGreaterThanOrEqual(20);
    }
  });
});

describe('estilo do carro: cabine bolha e vidro com reflexo', () => {
  it.each(CAR_BODIES.filter((b) => !HCT.includes(b)).map((b) => [b] as const))('%s: o alto do vidro tem ≥ 92% da largura do vidro (cabine bolha)', (body) => {
    expect(bubble(get(body))).toBeGreaterThanOrEqual(META.bubble);
  });

  it.each(CAR_BODIES.map((b) => [b] as const))('%s: vidro polido e metálico (reflete o céu) e com o brilho de reflexo nas janelas', (body) => {
    const m = get(body);
    const mat = m.shell.getAttribute('aMat');
    const glass = glassVertices(m);
    expect(glass.length).toBeGreaterThan(30);
    for (const i of glass) {
      expect(mat.getY(i)).toBeGreaterThanOrEqual(META.glassMetal);
      expect(mat.getX(i)).toBeLessThanOrEqual(META.glassRough);
    }
    // O brilho: faixas claras de espelho (metal 1, rugosidade ≤ 0,045, mais clara que o cromo é irrelevante: o cromo tem rugosidade 0,12).
    const col = m.shell.getAttribute('color');
    let glint = 0; let right = 0; let left = 0;
    const pos = m.shell.getAttribute('position');
    for (let i = 0; i < mat.count; i += 3) {
      if (mat.getY(i) >= 0.99 && mat.getX(i) <= 0.045 && col.getX(i) > 0.5) { glint++; if (pos.getX(i) > 0) right++; else left++; }
    }
    expect(glint).toBeGreaterThanOrEqual(4);
    expect(Math.abs(right - left), 'o brilho vai nos dois lados').toBeLessThanOrEqual(1);
  });
});

describe('estilo do carro: LOD de casco', () => {
  it.each(CAR_BODIES.map((b) => [b] as const))('%s: o procedural tem lod1 com no máximo metade dos triângulos e a mesma pegada', (body) => {
    const m = get(body);
    expect(m.lod1, 'sem lod1').toBeDefined();
    if (!m.lod1) return;
    expect(m.lod1.triangles).toBeLessThanOrEqual(m.triangles * META.lodMax);
    const a = m.shell.boundingBox; const b = m.lod1.shell.boundingBox;
    if (!a || !b) throw new Error(body);
    for (const [x, y] of [[a.max.x, b.max.x], [a.min.x, b.min.x], [a.max.y, b.max.y], [a.max.z, b.max.z], [a.min.z, b.min.z]]) expect(Math.abs(x - y)).toBeLessThan(0.06);
    // O que se lê de longe fica: lanternas e farol.
    const tail = (g: CarModel['shell']): number => { const mat = g.getAttribute('aMat'); let n = 0; for (let i = 0; i < mat.count; i++) if (mat.getW(i) > 0.5) n++; return n; };
    expect(tail(m.lod1.shell)).toBeGreaterThan(0);
    const head = (g: CarModel['shell']): number => { const mat = g.getAttribute('aMat'); let n = 0; for (let i = 0; i < mat.count; i++) if (mat.getZ(i) > 0.2) n++; return n; };
    expect(head(m.lod1.shell)).toBeGreaterThan(0);
  });

  it('o lod1 do procedural nasce do mesmo construtor, com o nível 1; o completo não leva lod1', () => {
    for (const body of CAR_BODIES) {
      const full = MODEL_BUILDERS[body]();
      const low = MODEL_BUILDERS[body](1);
      expect(full.lod1, body).toBeUndefined();
      expect(low.triangles, body).toBeLessThan(full.triangles);
    }
  });
});

describe('estilo do carro: o teto do casco subiu de propósito', () => {
  it('CAR_LIMITS.maxShellTriangles = 4.500 e os 13 cabem', () => {
    expect(CAR_LIMITS.maxShellTriangles).toBe(META.shellMax);
    for (const body of CAR_BODIES) expect(get(body).triangles, body).toBeLessThanOrEqual(META.shellMax);
  });
});
