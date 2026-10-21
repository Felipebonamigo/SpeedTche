// V18: a roda de fábrica dos hatches (`multi`) lia, de longe e na garagem, como um disco azul-marinho chapado: raios, lábio e cubo em grafite sobre o fundo escuro, sem contraste com o
// pneu. A de popular de verdade é de liga clara (ou de aço com calota). Aqui, a MEDIDA: o raio de +x que acha um raio da roda (e o lábio do aro) vê liga clara, metálica, e não grafite.
// O mesmo desenho tem de seguir honrando a camada B do aro (prata de fábrica, na cor escolhida quando o aro está ligado), como o `sport5`.
import { describe, expect, it } from 'vitest';
import { buildWheel } from '../src/render/cars/wheels';
import { probe } from './hct-probe';

type G = Parameters<typeof probe>[0]['shell'];
const lum = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

describe('a roda de fábrica dos hatches (multi) é de liga clara', () => {
  const w = buildWheel('multi');
  const p = probe({ shell: w.geometry as G });
  /** O que o raio de +x acha em (r, ângulo): cor, metal e a camada do aro (aPaint.z × 3 = 2 ou 3: camada B). */
  const hit = (r: number, ang: number) => {
    const h = p.fromSide(r * Math.cos(ang), r * Math.sin(ang), 1);
    return h ? { lum: lum(p.col.getX(h.i), p.col.getY(h.i), p.col.getZ(h.i)), metal: p.mat.getY(h.i), b: p.isB(h.i) } : null;
  };

  it('no meio de um raio (r = 0,4) e no lábio do aro (r = 0,71) a liga é clara (luminância ≥ 0,25), metálica e na camada B do aro', () => {
    for (let k = 0; k < 10; k++) {
      const spoke = hit(0.4, w.symmetry * k);
      expect(spoke, `raio ${k}`).not.toBeNull();
      expect(spoke?.lum, `raio ${k}: liga clara, não grafite (0,07)`).toBeGreaterThanOrEqual(0.25);
      expect(spoke?.metal, `raio ${k}`).toBeGreaterThanOrEqual(0.6);
      expect(spoke?.b, `raio ${k}: acompanha a cor do aro`).toBe(true);
    }
    for (let k = 0; k < 8; k++) {
      const lip = hit(0.71, 0.2 + (k * Math.PI) / 4);
      expect(lip?.lum, `lábio ${k}`).toBeGreaterThanOrEqual(0.25);
      expect(lip?.b, `lábio ${k}`).toBe(true);
    }
  });

  it('os raios de liga ocupam pelo menos 12% da volta a r = 0,4 (de longe lê como roda de liga, não como fio sobre o fundo escuro)', () => {
    // varre o ângulo e conta quanto da volta é liga clara e não o fundo escuro
    let on = 0; const n = 720;
    for (let k = 0; k < n; k++) { const h = hit(0.4, (2 * Math.PI * k) / n); if (h && h.lum >= 0.25) on++; }
    expect(on / n).toBeGreaterThanOrEqual(0.12);
  });
});
