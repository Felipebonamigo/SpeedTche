// V10 (HC2), A: a gradação de cor por período (`gradingFor`) e o bloom do sol. Medido na folha HC2 × nosso (docs/ondas/V10-hc2.md): as cenas do jogo estavam
// lavadas (saturação do quadro 0,32–0,48 contra 0,50–0,82 do Horizon Chase 2) e sem tom nas sombras. Aqui os números da gradação; a imagem está em hc2-gl.test.ts.
import { describe, expect, it } from 'vitest';
import { palette, SCENERIES, TIMES_OF_DAY } from '../src/render/palette';
import { gradingFor } from '../src/render/stylize';

const ALL = SCENERIES.flatMap((s) => TIMES_OF_DAY.map((t) => [s, t] as const));
const grade = (s: (typeof SCENERIES)[number], t: (typeof TIMES_OF_DAY)[number]) => gradingFor(palette(s, t));

describe('A. gradação mais viva: saturação e contraste', () => {
  it('as 18 combinações têm saturação ≥ 0,18 (era 0,02–0,06) e contraste ≥ 0,10 de dia e no entardecer, ≥ 0,05 à noite (era 0,02–0,08)', () => {
    for (const [s, t] of ALL) {
      const g = grade(s, t);
      expect(g.saturation, `${s}/${t} saturação`).toBeGreaterThanOrEqual(0.18);
      expect(g.contrast, `${s}/${t} contraste`).toBeGreaterThanOrEqual(t === 'night' ? 0.05 : 0.1);
    }
  });
});

describe('A. noite menos entupida', () => {
  it('a exposição da noite sobe ≥ 22% sobre a de antes (1,34 → ≥ 1,64) e a do dia não muda (1,18): Sampa tinha 48% dos pixels abaixo de 0,12 de luma', () => {
    for (const s of SCENERIES) {
      expect(grade(s, 'night').exposure, s).toBeGreaterThanOrEqual(1.64);
      expect(grade(s, 'day').exposure, s).toBeCloseTo(1.18, 2);
    }
  });
});

describe('A. sombras com tom e luz quente', () => {
  it('de dia a sombra é azul-quente (violeta-azulada): B ≥ 0,05 e o vermelho não afunda além de −0,04 (era −0,06: azul-ciano frio)', () => {
    for (const s of SCENERIES) {
      const [r, , b] = grade(s, 'day').shadows;
      expect(b, `${s} azul`).toBeGreaterThanOrEqual(0.05);
      expect(r, `${s} vermelho`).toBeGreaterThanOrEqual(-0.04);
    }
  });
  it('no entardecer a sombra é lilás e à noite é roxa: R − G ≥ 0,005 e B − G ≥ 0,03 (à noite R − G ≥ 0,02 e B − G ≥ 0,05); eram ~0', () => {
    for (const s of SCENERIES) {
      for (const t of ['dusk', 'night'] as const) {
        const [r, g, b] = grade(s, t).shadows;
        expect(r - g, `${s}/${t} R−G`).toBeGreaterThanOrEqual(t === 'night' ? 0.02 : 0.005);
        expect(b - g, `${s}/${t} B−G`).toBeGreaterThanOrEqual(t === 'night' ? 0.05 : 0.03);
      }
    }
  });
  it('a luz do sol é quente: o ganho das luzes tem R − B ≥ 0,12 de dia (era 0,07) e ≥ 0,04 no entardecer (era 0,02)', () => {
    for (const s of SCENERIES) {
      const dh = grade(s, 'day').highlights; const kh = grade(s, 'dusk').highlights;
      expect(dh[0] - dh[2], `${s} dia`).toBeGreaterThanOrEqual(0.12);
      expect(kh[0] - kh[2], `${s} entardecer`).toBeGreaterThanOrEqual(0.04);
    }
  });
  it('tudo dentro do teto da gradação (|tinta| ≤ 0,14; saturação e contraste ≤ 0,4): nada vira cartaz', () => {
    for (const [s, t] of ALL) {
      const g = grade(s, t);
      for (const v of [...g.shadows, ...g.highlights]) expect(Math.abs(v), `${s}/${t}`).toBeLessThanOrEqual(0.14);
      expect(g.saturation).toBeLessThanOrEqual(0.4); expect(g.contrast).toBeLessThanOrEqual(0.4);
    }
  });
});

describe('A. halo do sol', () => {
  it('de dia o bloom pega o disco do sol (limiar ≤ 2,3 contra o disco de 4 × sol) com força ≥ 0,3 (era 0,2 e limiar 2,6)', () => {
    for (const s of SCENERIES) {
      const [strength, , threshold] = palette(s, 'day').bloom;
      expect(strength, s).toBeGreaterThanOrEqual(0.3);
      expect(threshold, s).toBeLessThanOrEqual(2.3);
    }
  });
});
