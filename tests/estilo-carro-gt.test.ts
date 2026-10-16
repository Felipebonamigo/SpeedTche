// V2, etapa 1 (docs/ondas/V2-gt.md): o `gt` no estilo HCT "rodada 2" aprovado pelo dono ("um pouco mais realista que o Horizon Chase Turbo").
// Mede NA MALHA do modelo de produção (`buildModel('gt')`, o mesmo que a corrida, a garagem e o pódio desenham) as proporções do protótipo
// (cabine avançada, bico baixo, teto, vidro com caimento), a traseira-vitrine com profundidade (lanternas embutidas, pisca e ré apagados,
// difusor, escapes, asa com suportes), o farol com projetores, as faixas A e B redesenhadas para a forma nova e o casco simples (lod1).
// Os números são do cartão; o que ele não diz (o vidro escuro, a área da entrada de ar) é o protótipo medido.
import { describe, expect, it } from 'vitest';
import { checkCarModel } from '../src/render/cars/check';
import type { CarModel } from '../src/render/cars/model';
import { buildModel, MODEL_BUILDERS } from '../src/render/cars/models';

const gt = buildModel('gt');
const g = gt.shell;
const pos = g.getAttribute('position');
const col = g.getAttribute('color');
const pnt = g.getAttribute('aPaint');
const mat = g.getAttribute('aMat');
const lens = g.getAttribute('aLens');

interface Tri { i: number; c: [number, number, number]; n: [number, number, number]; area: number }
function tris(geo: CarModel['shell']): Tri[] {
  const p = geo.getAttribute('position');
  const out: Tri[] = [];
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i); const ay = p.getY(i); const az = p.getZ(i);
    const ux = p.getX(i + 1) - ax; const uy = p.getY(i + 1) - ay; const uz = p.getZ(i + 1) - az;
    const vx = p.getX(i + 2) - ax; const vy = p.getY(i + 2) - ay; const vz = p.getZ(i + 2) - az;
    const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    out.push({ i, c: [(ax + p.getX(i + 1) + p.getX(i + 2)) / 3, (ay + p.getY(i + 1) + p.getY(i + 2)) / 3, (az + p.getZ(i + 1) + p.getZ(i + 2)) / 3], n: [nx / l, ny / l, nz / l], area: l / 2 });
  }
  return out;
}
const T = tris(g);
const layer = (i: number): number => Math.round(pnt.getZ(i) * 3);
const isA = (i: number): boolean => layer(i) === 1 || layer(i) === 3;
const isB = (i: number): boolean => layer(i) === 2 || layer(i) === 3;
const lit = (i: number): boolean => mat.getZ(i) > 0.01 || mat.getW(i) > 0.01;
/** Vidro: o mesmo critério do tests/estilo-carro.test.ts (rugosidade baixa, metal alto, sem luz). */
const isGlass = (i: number): boolean => mat.getX(i) <= 0.08 && mat.getY(i) >= 0.6 && !lit(i);
const isTail = (i: number): boolean => mat.getW(i) > 0.5;
const isHead = (i: number): boolean => mat.getZ(i) > 0.5;
const painted = (i: number): boolean => pnt.getX(i) > 0.5;

/** Raio vertical (de cima) em (x, z): o triângulo mais alto que ele cruza, ou null. */
function fromAbove(x: number, z: number): { y: number; i: number } | null {
  let best: { y: number; i: number } | null = null;
  for (let i = 0; i < pos.count; i += 3) {
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
const range = (a: number, b: number, step: number): number[] => Array.from({ length: Math.round((b - a) / step) + 1 }, (_, k) => +(a + k * step).toFixed(4));

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

describe('GT HCT: proporções da rodada 2', () => {
  it('cabine avançada: a base do para-brisa fica em z ≤ −0,75 (motor central; o GT de motor dianteiro tinha −0,58)', () => {
    const glassZ = T.filter((t) => isGlass(t.i) && t.c[1] < 1.0 && t.c[2] < 0).map((t) => Math.min(pos.getZ(t.i), pos.getZ(t.i + 1), pos.getZ(t.i + 2)));
    expect(Math.min(...glassZ)).toBeLessThanOrEqual(-0.75);
  });

  it('bico baixo: nada passa de 0,60 m nos primeiros 12 cm do carro (z ≤ −2,08)', () => {
    let top = 0;
    for (let i = 0; i < pos.count; i++) if (pos.getZ(i) <= -2.08) top = Math.max(top, pos.getY(i));
    expect(top).toBeLessThan(0.6);
  });

  it('teto entre 1,12 e 1,26 m (sem a bolha de cartum) e a tampa do motor alta (≥ 0,8 m em z = 1,75)', () => {
    const roof = T.filter((t) => painted(t.i) && t.n[1] > 0.8 && t.c[2] > -0.2 && t.c[2] < 0.9 && t.c[1] > 1.0).map((t) => t.c[1]);
    expect(roof.length).toBeGreaterThan(10);
    expect(Math.max(...roof)).toBeGreaterThanOrEqual(1.12);
    expect(Math.max(...roof)).toBeLessThanOrEqual(1.26);
    expect(fromAbove(0.5, 1.75)?.y ?? 0).toBeGreaterThanOrEqual(0.8);
  });

  it('vidro de trás longo: o vidro vai do teto até z ≥ 1,5', () => {
    let z = 0;
    for (let i = 0; i < pos.count; i++) if (isGlass(i)) z = Math.max(z, pos.getZ(i));
    expect(z).toBeGreaterThanOrEqual(1.5);
  });

  it('vidro com caimento (alto do vidro ÷ vidro todo entre 0,70 e 0,92), escuro e neutro', () => {
    const v: number[] = [];
    for (let i = 0; i < mat.count; i++) if (isGlass(i)) v.push(i);
    const ys = v.map((i) => pos.getY(i));
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    const half = (l: number[]): number => Math.max(...l.map((i) => Math.abs(pos.getX(i))));
    const ratio = half(v.filter((i) => pos.getY(i) >= mid)) / half(v);
    expect(ratio).toBeGreaterThanOrEqual(0.7);
    expect(ratio).toBeLessThan(0.92);
    // O vidro em si (fora as faixas de reflexo, metal 1): luminância baixa e quase sem croma.
    const body = v.filter((i) => mat.getY(i) < 0.99);
    expect(body.length).toBeGreaterThan(30);
    for (const i of body) {
      const r = col.getX(i); const gg = col.getY(i); const bb = col.getZ(i);
      expect(0.2126 * r + 0.7152 * gg + 0.0722 * bb).toBeLessThan(0.03);
      expect(Math.max(r, gg, bb) - Math.min(r, gg, bb)).toBeLessThan(0.03);
    }
  });

  it('entrada de ar no flanco: peça preta colada na pele entre a porta e a roda de trás (z 0,3–0,8), dos dois lados', () => {
    for (const side of [1, -1]) {
      const area = T.filter((t) => !painted(t.i) && !lit(t.i) && col.getX(t.i) < 0.05 && side * t.n[0] > 0.7 && side * t.c[0] > 0.8
        && t.c[2] > 0.3 && t.c[2] < 0.8 && t.c[1] > 0.26 && t.c[1] < 0.56).reduce((s, t) => s + t.area, 0);
      expect(area, `lado ${side}`).toBeGreaterThan(0.08);
    }
  });
});

describe('GT HCT: a traseira é a estrela', () => {
  const tails = lensCenters((i) => isTail(i));

  it('quatro lanternas redondas acesas (duas por lado), cada uma uma lente em leque com miolo', () => {
    expect(tails.length).toBe(4);
    expect(tails.filter((p) => p[0] > 0).length).toBe(2);
    for (const p of tails) expect(p[2]).toBeGreaterThan(2.0);
  });

  it('a lente fica no FUNDO de um poço: a moldura sobra ≥ 1 cm além da lente e ≥ 3 cm além da pele da traseira', () => {
    // A pele da traseira: a tampa pintada do casco (a face pintada mais de trás voltada para trás).
    const skin = Math.max(...T.filter((t) => painted(t.i) && t.n[2] > 0.9 && t.c[1] > 0.4 && t.c[1] < 0.8).map((t) => t.c[2]));
    for (const c of tails) {
      const rim = T.filter((t) => !lit(t.i) && t.n[2] > 0.5 && Math.hypot(t.c[0] - c[0], t.c[1] - c[1]) < 0.16 && t.c[2] > c[2] - 0.05);
      expect(rim.length, `moldura da lanterna em x = ${c[0].toFixed(2)}`).toBeGreaterThan(0);
      const lip = Math.max(...rim.map((t) => t.c[2]));
      expect(lip - c[2], `x = ${c[0].toFixed(2)}`).toBeGreaterThanOrEqual(0.01);
      expect(lip - skin, `x = ${c[0].toFixed(2)}`).toBeGreaterThanOrEqual(0.03);
    }
  });

  it('pisca âmbar e luz de ré na traseira, APAGADOS (lente colorida sem emissivo), dos dois lados', () => {
    const back = T.filter((t) => t.c[2] > 2.0 && t.n[2] > 0.5 && !lit(t.i) && !painted(t.i));
    const amber = back.filter((t) => col.getX(t.i) > 0.8 && col.getY(t.i) > 0.15 && col.getY(t.i) < 0.5 && col.getZ(t.i) < 0.05);
    const clear = back.filter((t) => col.getX(t.i) > 0.6 && col.getY(t.i) > 0.6 && col.getZ(t.i) > 0.6);
    for (const side of [1, -1]) {
      expect(amber.filter((t) => side * t.c[0] > 0).length, `âmbar, lado ${side}`).toBeGreaterThan(0);
      expect(clear.filter((t) => side * t.c[0] > 0.2).length, `ré, lado ${side}`).toBeGreaterThan(0);
    }
  });

  it('difusor com ≥ 6 aletas, os escapes de sempre (as saídas da chama não mudam) e a asa presa por dois suportes', () => {
    const r = gt.rear;
    expect(r).toBeDefined();
    if (!r) return;
    expect(r.exhausts).toEqual([{ x: 0.42, y: 0.26, z: 2.26, r: 0.075 }, { x: -0.42, y: 0.26, z: 2.26, r: 0.075 }]);
    // Aletas: caixas verticais finas dentro do difusor (12 triângulos cada), sem pintura e sem luz.
    const d = r.diffuser;
    // Aletas: as faces de lado (normal em ±x) das lâminas de carbono (o pincel `CARBON` do `buildRear`) dentro do difusor; cada aleta, 5 cm de x.
    const carbon = (i: number): boolean => Math.abs(mat.getX(i) - 0.38) < 0.02 && Math.abs(mat.getY(i) - 0.35) < 0.02;
    const fins = T.filter((t) => carbon(t.i) && Math.abs(t.n[0]) > 0.9 && t.c[0] > d.min[0] && t.c[0] < d.max[0] && t.c[1] > d.min[1] && t.c[1] < d.max[1] && t.c[2] > d.min[2] && t.c[2] < d.max[2]);
    // As duas faces de uma aleta ficam a ~2,5 cm uma da outra: agrupa o x delas com folga de 4 cm.
    const xs = fins.map((t) => t.c[0]).sort((p, q) => p - q);
    const groups = xs.filter((x, k) => k === 0 || x - xs[k - 1] > 0.04).length;
    expect(groups).toBeGreaterThanOrEqual(6);
    const w = r.wing;
    expect(w).not.toBeNull();
    if (!w) return;
    // Suportes: peça sem pintura que vai da tampa (≤ 0,9 m) até a lâmina (≥ 0,98 m), dos dois lados.
    for (const side of [1, -1]) {
      const s = T.filter((t) => !painted(t.i) && side * t.c[0] > 0.25 && side * t.c[0] < 0.7 && t.c[2] > w.min[2] - 0.1 && t.c[2] < w.max[2] + 0.1 && t.c[1] > 0.8 && t.c[1] < w.max[1]);
      const ys = s.flatMap((t) => [pos.getY(t.i), pos.getY(t.i + 1), pos.getY(t.i + 2)]);
      expect(Math.min(...ys), `suporte, lado ${side}`).toBeLessThanOrEqual(0.9);
      expect(Math.max(...ys), `suporte, lado ${side}`).toBeGreaterThanOrEqual(0.98);
    }
  });
});

describe('GT HCT: farol com projetores', () => {
  it('dois projetores redondos acesos por lado (lente em leque com miolo), na frente e acima do capô', () => {
    const heads = lensCenters((i) => isHead(i));
    for (const side of [1, -1]) {
      const mine = heads.filter((p) => side * p[0] > 0.3);
      expect(mine.length, `lado ${side}`).toBeGreaterThanOrEqual(2);
      for (const p of mine) {
        expect(p[2]).toBeLessThan(-1.6);
        const below = fromAbove(p[0] * 0.999, p[2]);
        expect(below?.y ?? 0).toBeGreaterThanOrEqual(p[1] - 0.001);
      }
    }
  });
});

describe('GT HCT: as faixas seguem a forma nova', () => {
  it('faixa A: de cima, em x = ±0,22, a primeira coisa é a faixa em ≥ 80% das amostras fora do vidro, do bico (z = −2,15) à cauda (z = 2,15)', () => {
    for (const x of [0.22, -0.22]) {
      const zs = range(-2.15, 2.15, 0.05);
      const hits = zs.map((z) => ({ z, h: fromAbove(x, z) }));
      const off = hits.filter((h) => h.h && !isGlass(h.h.i));
      const a = off.filter((h) => h.h && isA(h.h.i));
      expect(a.length / off.length, `x = ${x}: ${off.filter((h) => h.h && !isA(h.h.i)).map((h) => h.z).join(' ')}`).toBeGreaterThanOrEqual(0.8);
      const at = (z: number) => hits.find((h) => Math.abs(h.z - z) < 1e-6)?.h;
      for (const z of [-2.15, -1.3, 0.3, 1.75, 2.15]) {
        const h = at(z);
        expect(h && isA(h.i), `x = ${x}, z = ${z}: a faixa A tem de estar à vista`).toBe(true);
      }
    }
  });

  it('faixa B: de lado, logo abaixo do vinco, a primeira coisa é a faixa entre as rodas; e o vinco sobe ≥ 0,15 m da frente para trás', () => {
    // Altura da faixa em z: o meio das faces B (de lado) que atravessam esse z.
    const bandY = (z: number, side: 1 | -1): number | null => {
      const b = T.filter((t) => {
        if (!isB(t.i) || side * t.n[0] < 0.7) return false;
        const zz = [pos.getZ(t.i), pos.getZ(t.i + 1), pos.getZ(t.i + 2)];
        return Math.min(...zz) <= z && Math.max(...zz) >= z;
      });
      if (!b.length) return null;
      const ys = b.flatMap((t) => [pos.getY(t.i), pos.getY(t.i + 1), pos.getY(t.i + 2)]);
      return (Math.min(...ys) + Math.max(...ys)) / 2;
    };
    for (const side of [1, -1] as const) {
      const zs = range(-0.8, 0.8, 0.05);
      let ok = 0;
      for (const z of zs) {
        const y = bandY(z, side);
        if (y === null) continue;
        const h = fromSide(y, z, side);
        if (h && isB(h.i)) ok++;
      }
      expect(ok / zs.length, `lado ${side}`).toBeGreaterThanOrEqual(0.8);
      const front = bandY(-1.95, side); const back = bandY(1.95, side);
      expect(front).not.toBeNull();
      expect(back).not.toBeNull();
      expect((back ?? 0) - (front ?? 0), `lado ${side}`).toBeGreaterThanOrEqual(0.15);
    }
  });
});

describe('GT HCT: contrato e casco simples', () => {
  it('cabe no orçamento do cartão (≤ 4.200 no casco), o lod1 tem ≤ 45% e os dois passam no validador do jogo', () => {
    expect(gt.triangles).toBeLessThanOrEqual(4200);
    expect(checkCarModel(gt)).toEqual([]);
    const low = MODEL_BUILDERS.gt(1);
    expect(low.triangles / gt.triangles).toBeLessThanOrEqual(0.45);
    expect(checkCarModel({ ...gt, shell: low.shell, triangles: low.triangles, lod1: undefined })).toEqual([]);
  });

  it('o lod1 guarda o que se lê de longe: lanternas, farol e as duas faixas', () => {
    const low = MODEL_BUILDERS.gt(1).shell;
    const m = low.getAttribute('aMat'); const p = low.getAttribute('aPaint');
    let tail = 0; let head = 0; let a = 0; let b = 0;
    for (let i = 0; i < m.count; i++) {
      if (m.getW(i) > 0.5) tail++;
      if (m.getZ(i) > 0.5) head++;
      const l = Math.round(p.getZ(i) * 3);
      if (l === 1 || l === 3) a++;
      if (l === 2 || l === 3) b++;
    }
    expect(tail).toBeGreaterThan(0);
    expect(head).toBeGreaterThan(0);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
  });
});
