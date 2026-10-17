// Os blocos que os estilos HCT dividem (V2): vidro, lente com moldura, faixas, lod1 e o validador. Cada estilo chama `hctCommon` no seu describe
// (tests/estilo-carro-hct.test.ts: gt, wedge, hyper; tests/estilo-carro-hct2.test.ts: os outros) e acrescenta a identidade dele.
import { expect, it } from 'vitest';
import type { CarBody } from '../src/core/types';
import { checkCarModel } from '../src/render/cars/check';
import { buildModel, MODEL_BUILDERS } from '../src/render/cars/models';
import { probe, range } from './hct-probe';

/** Os blocos que os dois (e os próximos) dividem: vidro, lente com moldura, faixas, lod1 e o validador. */
export interface HctOpts {
  tailCenters: number; bandFront: number; bandBack: number;
  /** Sem teto de vidro (conversível): o vidro com caimento não se mede. */
  noGlass?: boolean;
  /** Trecho em z onde a faixa A de cima não se vê (cockpit aberto, a faixa que passa pelo vidro). */
  aSkip?: readonly [number, number];
  /** Orçamento do casco (padrão 4.200, o do cartão; o do jogo é 4.500). */
  maxTris?: number;
}
export function hctCommon(body: CarBody, o: HctOpts): void {
  const m = buildModel(body);
  const P = probe(m);
  it.skipIf(o.noGlass)(`${body}: vidro com caimento (0,70–0,92), escuro e neutro, com o reflexo do céu nas janelas`, () => {
    const r = P.glassTaper();
    expect(r).toBeGreaterThanOrEqual(0.7);
    expect(r).toBeLessThan(0.92);
    const cs = P.glassColors();
    expect(cs.length).toBeGreaterThan(30);
    for (const [r0, g0, b0] of cs) {
      expect(0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0).toBeLessThan(0.03);
      expect(Math.max(r0, g0, b0) - Math.min(r0, g0, b0)).toBeLessThan(0.03);
    }
  });

  it(`${body}: ${o.tailCenters} lentes de lanterna em leque (miolo e borda), cada uma no fundo de uma moldura que sobra ≥ 1 cm além dela e ≥ 3 cm além da pele`, () => {
    const tails = P.lensCenters((i) => P.isTail(i));
    expect(tails.length).toBe(o.tailCenters);
    expect(tails.filter((p) => p[0] > 0).length).toBe(o.tailCenters / 2);
    const skin = Math.max(...P.T.filter((t) => P.painted(t.i) && t.n[2] > 0.9 && t.c[1] > 0.3 && t.c[1] < 0.9 && t.c[2] > 1.8).map((t) => t.c[2]));
    for (const c of tails) {
      const rim = P.T.filter((t) => !P.lit(t.i) && t.n[2] > 0.5 && Math.abs(t.c[1] - c[1]) < 0.12 && Math.abs(t.c[0] - c[0]) < 0.4 && t.c[2] > c[2] - 0.05);
      expect(rim.length, `moldura em x = ${c[0].toFixed(2)}`).toBeGreaterThan(0);
      const lip = Math.max(...rim.map((t) => t.c[2]));
      expect(lip - c[2], `x = ${c[0].toFixed(2)}`).toBeGreaterThanOrEqual(0.01);
      expect(lip - skin, `x = ${c[0].toFixed(2)}`).toBeGreaterThanOrEqual(0.03);
    }
  });

  it(`${body}: faixa A de cima (x = ±0,22) à vista em ≥ 75% das amostras fora do vidro, do bico à cauda; faixa B de lado entre as rodas, e o vinco sobe da frente para trás`, () => {
    for (const x of [0.22, -0.22]) {
      const hits = range(-2.1, 2.1, 0.05).filter((z) => !o.aSkip || z < o.aSkip[0] || z > o.aSkip[1]).map((z) => ({ z, h: P.fromAbove(x, z) })).filter((h) => h.h && !P.isGlass(h.h.i));
      const a = hits.filter((h) => h.h && P.isA(h.h.i));
      expect(a.length / hits.length, `x = ${x}: ${hits.filter((h) => h.h && !P.isA(h.h.i)).map((h) => h.z).join(' ')}`).toBeGreaterThanOrEqual(0.75);
    }
    const bandY = (z: number, side: 1 | -1): number | null => {
      const b = P.T.filter((t) => {
        if (!P.isB(t.i) || side * t.n[0] < 0.7) return false;
        const zz = [P.pos.getZ(t.i), P.pos.getZ(t.i + 1), P.pos.getZ(t.i + 2)];
        return Math.min(...zz) <= z && Math.max(...zz) >= z;
      });
      if (!b.length) return null;
      const ys = b.flatMap((t) => [P.pos.getY(t.i), P.pos.getY(t.i + 1), P.pos.getY(t.i + 2)]);
      return (Math.min(...ys) + Math.max(...ys)) / 2;
    };
    for (const side of [1, -1] as const) {
      const zs = range(-0.75, 0.75, 0.05);
      let ok = 0;
      for (const z of zs) { const y = bandY(z, side); if (y === null) continue; const h = P.fromSide(y, z, side); if (h && P.isB(h.i)) ok++; }
      expect(ok / zs.length, `lado ${side}`).toBeGreaterThanOrEqual(0.8);
      const front = bandY(o.bandFront, side); const back = bandY(o.bandBack, side);
      expect(front, `faixa B em z = ${o.bandFront}`).not.toBeNull();
      expect(back, `faixa B em z = ${o.bandBack}`).not.toBeNull();
      expect((back ?? 0) - (front ?? 0), `lado ${side}`).toBeGreaterThanOrEqual(0.12);
    }
  });

  it(`${body}: o pneu não fura a lataria — sobre cada roda o casco passa do topo do pneu (em z de −0,2 a +0,2 do eixo, em toda a largura do pneu)`, () => {
    // Defeito da primeira versão do protótipo: o ombro inclinado sobre o pneu ficava abaixo do topo dele e o pneu aparecia (um pedaço preto) por cima do para-lama.
    for (const ax of m.axles) {
      for (const dz of [-0.2, -0.1, 0, 0.1, 0.2]) {
        const top = ax.r + Math.sqrt(ax.r * ax.r - dz * dz);
        for (let x = ax.x - ax.w / 2 + 0.02; x <= ax.x + ax.w / 2 - 0.02; x += 0.04) {
          expect(P.fromAbove(x, ax.z + dz)?.y ?? 0, `x = ${x.toFixed(2)}, z = ${(ax.z + dz).toFixed(2)}`).toBeGreaterThanOrEqual(top);
        }
      }
    }
  });

  it(`${body}: ≤ ${o.maxTris ?? 4200} △ no casco, lod1 ≤ 45% com luz e as duas faixas, os dois no validador do jogo`, () => {
    expect(m.triangles).toBeLessThanOrEqual(o.maxTris ?? 4200);
    expect(checkCarModel(m)).toEqual([]);
    const low = MODEL_BUILDERS[body](1);
    expect(low.triangles / MODEL_BUILDERS[body]().triangles).toBeLessThanOrEqual(0.45);
    expect(checkCarModel({ ...m, shell: low.shell, triangles: low.triangles, lod1: undefined })).toEqual([]);
    const L = probe(low);
    const n = (f: (i: number) => boolean): number => L.T.filter((t) => f(t.i)).length;
    expect(n(L.isTail)).toBeGreaterThan(0);
    expect(n(L.isHead) + n((i) => L.popup(i))).toBeGreaterThan(0);
    expect(n(L.isA)).toBeGreaterThan(0);
    expect(n(L.isB)).toBeGreaterThan(0);
  });
}

