// V2, etapa 3 (docs/ondas/V2-estilos.md): os demais estilos no desenho HCT, um bloco por estilo, vistos falhar nos modelos de antes. O bloco comum
// (tests/hct-common.ts: vidro, lanterna com moldura, faixas, lod1, validador; orçamento 4.500 △ do jogo) e a identidade de cada um (docs/CARROS.md).
import { describe, expect, it } from 'vitest';
import { buildModel } from '../src/render/cars/models';
import { hctCommon } from './hct-common';
import { probe } from './hct-probe';

const yRange = (P: ReturnType<typeof probe>, idx: number[]): number => {
  const ys = idx.map((i) => P.pos.getY(i));
  return Math.max(...ys) - Math.min(...ys);
};

describe('protótipo HCT (prototype, Beija-Flor)', () => {
  const m = buildModel('prototype');
  const P = probe(m);
  hctCommon('prototype', { tailCenters: 6, bandFront: -1.95, bandBack: 1.95, maxTris: 4500 });

  it('baixíssimo: teto ≤ 1,08 m e o bico abaixo de 0,40 m nos primeiros 12 cm', () => {
    const roof = P.T.filter((t) => P.painted(t.i) && t.n[1] > 0.8 && t.c[2] > -0.4 && t.c[2] < 0.6 && t.c[1] > 0.85).map((t) => t.c[1]);
    expect(roof.length).toBeGreaterThan(5);
    expect(Math.max(...roof)).toBeLessThanOrEqual(1.08);
    let top = 0;
    for (let i = 0; i < P.pos.count; i++) if (P.pos.getZ(i) <= -2.08) top = Math.max(top, P.pos.getY(i));
    expect(top).toBeLessThan(0.4);
  });

  it('faróis em fenda: um projetor em leque por lado, numa fenda de até 7 cm de altura', () => {
    const heads = P.lensCenters((i) => P.isHead(i));
    for (const side of [1, -1]) {
      expect(heads.filter((p) => side * p[0] > 0.2).length, `lado ${side}`).toBeGreaterThanOrEqual(1);
      const lit = P.T.filter((t) => P.isHead(t.i) && side * t.c[0] > 0.2);
      const ys = lit.flatMap((t) => [P.pos.getY(t.i), P.pos.getY(t.i + 1), P.pos.getY(t.i + 2)]);
      expect(Math.max(...ys) - Math.min(...ys), `lado ${side}`).toBeLessThanOrEqual(0.07);
    }
  });

  it('barbatana de acento do teto à asa, o escape central de sempre e a asa de ponta a ponta com placas', () => {
    const fin = P.T.filter((t) => P.accent(t.i) && Math.abs(t.n[0]) > 0.9 && Math.abs(t.c[0]) < 0.05 && t.c[1] > 0.75 && t.c[2] > 0.4 && t.c[2] < 1.9);
    expect(fin.reduce((s, t) => s + t.area, 0)).toBeGreaterThan(0.25);
    expect(m.rear?.exhausts).toEqual([{ x: 0, y: 0.44, z: 2.24, r: 0.085 }]);
    const w = m.rear?.wing;
    expect(w, 'asa').toBeTruthy();
    if (w) expect(w.max[0] - w.min[0]).toBeGreaterThanOrEqual(1.8);
  });
  void yRange;
});
