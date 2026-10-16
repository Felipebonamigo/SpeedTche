// V2, rodada de realismo 2 (docs/ondas/V2-gt.md §12): a roda nova, no desenho de todos os estilos (cars/wheels.ts). O que separa a nossa roda da do HCT:
// pneu liso por fora, aro raso com o fundo à vista logo atrás dos raios. Agora: inscrição lisa no flanco (uma faixa de borracha mais clara, sem texto), aro
// fundo e o disco de freio no fundo, visto entre os raios. Mede NA MALHA (raios de +x, a roda em escala unitária, face de fora em +x).
import { describe, expect, it } from 'vitest';
import { buildSimpleWheel, buildWheel, WHEEL_DESIGNS, type WheelDesign } from '../src/render/cars/wheels';
import { probe } from './hct-probe';

type G = Parameters<typeof probe>[0]['shell'];
const P = (d: WheelDesign) => { const w = buildWheel(d); return { w, p: probe({ shell: w.geometry as G }) }; };
const lum = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/** Primeiro que o raio de +x acha em (r, ângulo): o triângulo, o x e a cor. */
function hit(d: WheelDesign, r: number, ang: number) {
  const { p } = P(d);
  const h = p.fromSide(r * Math.cos(ang), r * Math.sin(ang), 1);
  if (!h) return null;
  return { x: h.x, rgb: [p.col.getX(h.i), p.col.getY(h.i), p.col.getZ(h.i)] as const, rough: p.mat.getX(h.i), metal: p.mat.getY(h.i) };
}

describe('roda: inscrição lisa no flanco', () => {
  it.each(WHEEL_DESIGNS.map((d) => [d] as const))('%s: entre o ombro e o aro (r = 0,84; no `wire`, a faixa branca) a borracha é mais clara e fosca que a do flanco liso mais perto do aro, em toda a volta', (d) => {
    for (let k = 0; k < 8; k++) {
      const ang = 0.3 + (k * Math.PI) / 4;
      const band = hit(d, d === 'wire' ? 0.74 : 0.84, ang); // o `wire` já tem a faixa branca (r 0,68–0,8)
      expect(band, `${d} ${k}`).not.toBeNull();
      // Flanco liso: a borracha do ombro (TIRE_SIDE, #1d1e21); a faixa tem de ser mais clara (≥ +25%) e fosca (rugosidade ≥ 0,65: a faixa branca do `wire` é 0,7).
      expect(lum(...(band?.rgb ?? [0, 0, 0])), `${d} ${k}`).toBeGreaterThan(lum(0.0123, 0.0129, 0.0152) * 1.25);
      expect(band?.rough, `${d} ${k}`).toBeGreaterThanOrEqual(0.65);
      expect(band?.x, `${d}: a faixa é lisa (rente à face, x = 0,5)`).toBeCloseTo(0.5, 2);
    }
  });
});

describe('roda: aro fundo e o disco de freio no fundo, entre os raios', () => {
  const OPEN: readonly WheelDesign[] = ['sport5', 'mag', 'multi', 'center', 'wire'];
  it.each(OPEN.map((d) => [d] as const))('%s: um raio por entre os raios (r = 0,45) acha o disco de freio, metálico, a ≥ 0,36 do lábio do aro', (d) => {
    const { w } = P(d);
    // Entre dois raios: metade do ângulo de repetição (os raios começam em 0 e repetem a cada `symmetry`); o `center` tem dois jogos de raios defasados
    // de meio passo, então o vão fica a um quarto.
    for (let k = 0; k < 3; k++) {
      const ang = w.symmetry * (k + (d === 'center' ? 0.25 : 0.5));
      const h = hit(d, 0.45, ang);
      expect(h, `${d} ${k}`).not.toBeNull();
      expect(0.5 - (h?.x ?? 0.5), `${d} ${k}: profundidade`).toBeGreaterThanOrEqual(0.36);
      expect(h?.metal, `${d} ${k}: o disco é metal`).toBeGreaterThanOrEqual(0.6);
      expect(h?.rough, `${d} ${k}: o disco é polido`).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('roda: orçamento', () => {
  const OLD: Record<WheelDesign, number> = { sport5: 374, mag: 422, multi: 404, hubcap: 426, aero: 438, dish: 414, center: 416, wire: 464, steel: 426 };
  it('até +60 △ por roda sobre a de antes e dentro dos 480 △ de sempre (o gate de Sampa 4p não aceita mais: 16 lados no pneu pagam a inscrição e o disco); a de qualidade baixa, de quem está longe, não muda: 144 △', () => {
    for (const d of WHEEL_DESIGNS) {
      const n = buildWheel(d).triangles;
      expect(n - OLD[d], d).toBeLessThanOrEqual(60);
      expect(n, d).toBeLessThanOrEqual(480);
    }
    expect(buildSimpleWheel().triangles).toBe(144);
  });
});
