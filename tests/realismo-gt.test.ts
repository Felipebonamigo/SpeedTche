// V2, rodada de realismo do GT (docs/ondas/V2-gt.md §11): o dono aprovou o estilo HCT e pediu "um pouco mais real, igual o Horizon Chase Turbo".
// O que separa o nosso GT da captura do HCT (`ref-hct.webp`), medido e travado aqui, na ordem de ganho por custo:
// - a pintura guarda o matiz ao sol (o reflexo e a luz do céu não a tingem de rosa e roxo): medido em GL, tests/cor-brilho-gl.test.ts;
// - sombra de contato mais escura e mais justa embaixo do carro (o carro cola no asfalto);
// - postura: o carro mais baixo (o para-lama já fica a 2 cm do pneu: o arco é limitado pela borda, hull.ts `yw`; medido, não travado aqui);
// - forma: mais faces no casco onde a silhueta e o reflexo mostram, e o vinco da cintura nítido em vez de macio.
import { describe, expect, it } from 'vitest';
import { buildModel, MODEL_BUILDERS } from '../src/render/cars/models';
import * as TX from '../src/render/textures';
import { probe } from './hct-probe';

const blobAlpha = (TX as unknown as { blobAlpha?: (px: number, pz: number) => number }).blobAlpha;

describe('sombra de contato', () => {
  it('escura no meio da pegada (≥ 0,8), mais ainda sob as rodas, ainda ≥ 0,35 rente à soleira e some 40 cm fora do carro', () => {
    expect(blobAlpha, 'blobAlpha não existe em render/textures.ts').toBeTypeOf('function');
    const a = blobAlpha as (px: number, pz: number) => number;
    expect(a(0, 0)).toBeGreaterThanOrEqual(0.8);
    expect(a(0.8, 1.35)).toBeGreaterThanOrEqual(a(0, 0));
    expect(a(1.0, 0)).toBeGreaterThanOrEqual(0.35);
    expect(a(1.4, 0)).toBeLessThanOrEqual(0.02);
    expect(a(0, 2.65)).toBeLessThanOrEqual(0.02);
  });
});

describe('GT: postura e forma', () => {
  const gt = buildModel('gt');
  const P = probe(gt);

  it('mais baixo: a saia lateral desce até ≤ 15 cm do chão entre as rodas', () => {
    // A pele vista de lado: o que está por fora da caixa de roda (|x| > 0,6) e não olha reto para baixo (o fundo do carro não conta; a saia recolhida, inclinada, conta).
    const side = P.T.filter((t) => t.n[1] > -0.85 && Math.abs(t.c[2]) < 0.5 && Math.abs(t.c[0]) > 0.6);
    const ys = side.flatMap((t) => [P.pos.getY(t.i), P.pos.getY(t.i + 1), P.pos.getY(t.i + 2)]);
    expect(Math.min(...ys)).toBeLessThanOrEqual(0.15);
  });

  it('mais faces no casco (5.000–8.000 △) e o lod1 ≤ 45% dele', () => {
    expect(gt.triangles).toBeGreaterThanOrEqual(5000);
    expect(gt.triangles).toBeLessThanOrEqual(8000);
    expect(MODEL_BUILDERS.gt(1).triangles / gt.triangles).toBeLessThanOrEqual(0.45);
  });

  it('vinco da cintura nítido: no topo da faixa B (z −0,4 a 0,6) a normal da lateral e a do ombro diferem ≥ 30° no mesmo ponto', () => {
    const nrm = gt.shell.getAttribute('normal');
    const key = (v: number): string => `${P.pos.getX(v).toFixed(4)},${P.pos.getY(v).toFixed(4)},${P.pos.getZ(v).toFixed(4)}`;
    const shoulder = new Map<string, number[]>();
    for (const t of P.T) {
      if (!P.painted(t.i) || P.isB(t.i) || t.n[1] < 0.2 || Math.abs(t.c[0]) < 0.6) continue;
      for (let k = 0; k < 3; k++) { const v = t.i + k; const l = shoulder.get(key(v)) ?? []; l.push(v); shoulder.set(key(v), l); }
    }
    let n = 0; let sharp = 0;
    for (const t of P.T) {
      if (!P.isB(t.i) || Math.abs(t.n[0]) < 0.8 || t.c[2] < -0.4 || t.c[2] > 0.6) continue;
      for (let k = 0; k < 3; k++) {
        const v = t.i + k; const s = shoulder.get(key(v));
        if (!s) continue;
        n++;
        const dot = nrm.getX(v) * nrm.getX(s[0]) + nrm.getY(v) * nrm.getY(s[0]) + nrm.getZ(v) * nrm.getZ(s[0]);
        if (Math.acos(Math.min(1, dot)) >= (30 * Math.PI) / 180) sharp++;
      }
    }
    expect(n).toBeGreaterThan(4);
    expect(sharp / n).toBeGreaterThanOrEqual(0.9);
  });
});
