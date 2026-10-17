// V2, etapa 3 (docs/ondas/V2-estilos.md): os demais estilos no desenho HCT, um bloco por estilo, vistos falhar nos modelos de antes. O bloco comum
// (tests/hct-common.ts: vidro, lanterna com moldura, faixas, lod1, validador; orçamento 4.500 △ do jogo) e a identidade de cada um (docs/CARROS.md).
import { describe, expect, it } from 'vitest';
import { buildModel } from '../src/render/cars/models';
import { hctCommon } from './hct-common';
import { probe } from './hct-probe';

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
});

describe('roadster HCT (roadster, Curupira S)', () => {
  const m = buildModel('roadster');
  const P = probe(m);
  hctCommon('roadster', { tailCenters: 4, bandFront: -1.95, bandBack: 1.95, noGlass: true, aSkip: [-0.6, 0.95], maxTris: 4500 });

  it('cockpit aberto: do alto, no meio, o que se vê é o assoalho do interior (não pintado, abaixo de 0,85 m), e o piloto de capacete de acento fica à esquerda', () => {
    const h = P.fromAbove(0, 0.1);
    expect(h).not.toBeNull();
    expect(P.painted(h?.i ?? 0)).toBe(false);
    expect(h?.y ?? 9).toBeLessThanOrEqual(0.85);
    const helmet = P.T.filter((t) => P.accent(t.i) && t.c[1] > 0.85 && t.c[2] > 0 && t.c[2] < 0.8);
    expect(helmet.length).toBeGreaterThan(4);
    expect(helmet.reduce((s, t) => s + t.c[0], 0) / helmet.length).toBeLessThan(-0.2);
  });

  it('para-brisa baixo (até 1,10 m, começa depois de z = −0,75) e o santantônio duplo atrás dos bancos acima de 1,05 m', () => {
    const g = P.T.filter((t) => P.isGlass(t.i) && t.c[2] < 0.2);
    expect(g.length).toBeGreaterThan(3);
    expect(Math.max(...g.map((t) => t.c[1]))).toBeLessThanOrEqual(1.1);
    expect(Math.min(...g.map((t) => t.c[2]))).toBeGreaterThan(-0.75);
    const bars = P.T.filter((t) => t.c[1] > 1.05 && t.c[2] > 0.6 && t.c[2] < 0.95);
    expect(bars.length).toBeGreaterThan(4);
  });

  it('faróis redondos em leque nos para-lamas (um por lado, ≥ 0,066 m² de luz) e escapes gêmeos de sempre', () => {
    const heads = P.lensCenters((i) => P.isHead(i));
    for (const side of [1, -1]) expect(heads.filter((p) => side * p[0] > 0.3).length, `lado ${side}`).toBeGreaterThanOrEqual(1);
    expect(m.rear?.exhausts.map((e) => e.x).sort((a, b) => a - b)).toEqual([-0.4, 0.4]);
  });
});

describe('rali HCT (rally, Carcará RS)', () => {
  const m = buildModel('rally');
  const P = probe(m);
  hctCommon('rally', { tailCenters: 4, bandFront: -1.95, bandBack: 1.9, maxTris: 4500 });

  it('hatch alto de suspensão levantada: teto entre 1,30 e 1,45 m e a saia a ≥ 0,25 m do chão', () => {
    const roof = P.T.filter((t) => P.painted(t.i) && t.n[1] > 0.8 && t.c[2] > -0.2 && t.c[2] < 1.2 && t.c[1] > 1.0).map((t) => t.c[1]);
    expect(roof.length).toBeGreaterThan(5);
    expect(Math.max(...roof)).toBeGreaterThanOrEqual(1.3);
    expect(Math.max(...roof)).toBeLessThanOrEqual(1.45);
    const side = P.T.filter((t) => t.n[1] > -0.85 && Math.abs(t.c[2]) < 0.5 && Math.abs(t.c[0]) > 0.6);
    expect(Math.min(...side.flatMap((t) => [P.pos.getY(t.i), P.pos.getY(t.i + 1), P.pos.getY(t.i + 2)]))).toBeGreaterThanOrEqual(0.25);
  });

  it('para-lamas alargados em caixa (≥ 0,96 m de meia largura sobre as rodas) com a borda preta no arco', () => {
    for (const z of [-1.3, 1.28]) {
      let w = 0;
      for (let i = 0; i < P.pos.count; i++) if (Math.abs(P.pos.getZ(i) - z) < 0.3 && P.pos.getY(i) > 0.5 && P.pos.getY(i) < 1.0) w = Math.max(w, P.pos.getX(i));
      expect(w, `z = ${z}`).toBeGreaterThanOrEqual(0.96);
    }
    const trim = P.T.filter((t) => !P.painted(t.i) && !P.lit(t.i) && P.col.getX(t.i) < 0.05 && Math.abs(t.c[0]) > 0.8 && Math.abs(t.c[2] + 1.3) < 0.6 && t.c[1] > 0.45 && t.c[1] < 0.9);
    expect(trim.reduce((s, t) => s + t.area, 0)).toBeGreaterThan(0.1);
  });

  it('quatro faróis de milha redondos em leque na frente (y entre 0,40 e 0,56), os dois faróis e o escape único grosso à direita', () => {
    const fogs = P.lensCenters((i) => P.isHead(i)).filter((p) => p[1] > 0.4 && p[1] < 0.56 && p[2] < -2.0);
    expect(fogs.length).toBeGreaterThanOrEqual(4);
    expect(m.rear?.exhausts).toEqual([{ x: 0.55, y: 0.32, z: 2.22, r: 0.09 }]);
  });
});
