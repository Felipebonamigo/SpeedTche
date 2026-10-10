// Props do autódromo e da estrada (onda M, M3; cronograma: "props: poste, cerca, placa, arquibancada"): saem do kit redondo (`geom.ts`) — poste de 14 lados com
// base de bisel, cerca de estaca redonda e tábua de borda arredondada, placa com a moldura de bisel, arquibancada com o muro e a cobertura arredondados — em vez
// de caixas e cilindros de 6 lados (o vinco de construção, 40°, deixava a quina de 60° viva: o poste era um hexágono). A pegada na faixa do carro não muda
// (`scenery.test.ts`: visual × colisão). Tudo no Node, sem DOM.
import { describe, expect, it } from 'vitest';
import { getModel, modelBounds, modelFrontX } from '../src/render/scenery/catalog';
import { modelTriangles } from '../src/render/scenery/vegetation';
import { areaShares } from './scenery-medidas';

/** [id, máximo de área em face de eixo, mínimo de área em superfície redonda, máximo de triângulos]. */
const PROPS: Array<[string, number, number, number]> = [
  ['lamp', 0.5, 0.25, 320],
  ['sign:left', 0.85, 0.15, 220], ['sign:right', 0.85, 0.15, 220],
  ['billboard:0', 0.9, 0.1, 600], ['pitsign', 0.8, 0.15, 220],
  // Arquibancada: os degraus de concreto são planos por projeto; o que é redondo é o muro, a cobertura, os pilares e o alambrado.
  // Tetos 3.500 / 3.800 (eram 3.300 / 3.600): `cyl` de 8 a 13 lados sobe para 14 em todo o jogo (`roundSides`, a faceta da bíblia) e a arquibancada é feita de pilares e postes de alambrado cilíndricos
  // (3.422 e 3.686 medidos). O custo que importa é o do quadro (`scenery-forma`: o pior segmento segue ≤ 900); este teto só impede que a peça volte a crescer sem aviso.
  ['stand:0', 0.9, 0.04, 3500], ['stand:1', 0.9, 0.04, 3800],
  ['gantry', 0.95, 0.04, 1100],
  ['fence:ranch', 0.35, 0.4, 160], ['fence:rail', 0.75, 0.25, 200], ['fence:armco', 0.8, 0.2, 160],
  ['fence:stone', 0.75, 0.25, 420], ['fence:railing', 0.35, 0.4, 160],
];

describe('props redondos: poste, cerca, placa, arquibancada', () => {
  for (const [id, axisMax, smoothMin, trisMax] of PROPS) {
    it(`${id}: pouca cara de caixa (≤ ${(axisMax * 100).toFixed(0)}% da área em face de eixo), superfície redonda (≥ ${(smoothMin * 100).toFixed(0)}%) e ≤ ${trisMax} triângulos`, () => {
      const m = getModel(id);
      const s = areaShares(m);
      expect(s.axis, `${id}: ${(s.axis * 100).toFixed(0)}% em face de eixo`).toBeLessThanOrEqual(axisMax);
      expect(s.smooth, `${id}: ${(s.smooth * 100).toFixed(0)}% redondo`).toBeGreaterThanOrEqual(smoothMin);
      expect(modelTriangles(m), id).toBeLessThanOrEqual(trisMax);
    });
  }

  it('o poste: a base de concreto tem a quina chanfrada (nenhum vértice a menos de 7 cm da quina viva) e a luminária fica a 2,35 m do pé', () => {
    const g = getModel('lamp').parts[0].geometry;
    const pos = g.getAttribute('position');
    const R = 0.49; // collisionHalfM('lamp')
    let near = Infinity;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0.8) near = Math.min(near, Math.hypot(Math.abs(pos.getX(i)) - R, Math.abs(pos.getZ(i)) - R));
    expect(near).toBeGreaterThan(0.07);
    const glow = getModel('lamp').parts.find((p) => p.mat === 'glow');
    expect(glow).toBeDefined();
  });

  it('a pegada não mudou: o ponto mais à frente na altura do carro é o de antes (±12 cm)', () => {
    // Medido em ce51fb9 (modelFrontX, escala 1): o poste 0,49 (o pé), a placa 1,54, o outdoor 3,94, a placa do box 0,07, a arquibancada 7,03.
    const OLD: Record<string, number> = { lamp: 0.49, 'sign:left': 1.54, 'sign:right': 1.54, 'billboard:0': 3.94, pitsign: 0.069, 'stand:0': 7.03, 'stand:1': 7.03, 'fence:ranch': 0.084, 'fence:rail': 0.08, 'fence:armco': 0.08, 'fence:railing': 0.04 };
    for (const [id, front] of Object.entries(OLD)) expect(Math.abs(modelFrontX(id) - front), `${id}: ${modelFrontX(id).toFixed(3)} × ${front}`).toBeLessThan(0.12);
    // O muro de pedra era de caixas de 0,62 m; agora é uma fiada de 0,62 m de borda redonda: a frente na faixa do carro não passa de 33 cm.
    expect(modelFrontX('fence:stone')).toBeLessThan(0.36);
    expect(modelBounds('lamp').maxY).toBeGreaterThan(9.7);
  });
});
