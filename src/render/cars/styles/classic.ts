// Clássico dos anos 60: capô longo e abaulado com para-lamas bojudos, cabine pequena e recuada em
// fastback, boca oval com grade cromada, faróis redondos, para-choques cromados partidos, frisos
// cromados, lanternas redondas pequenas, rodas de raios de arame com faixa branca.
import { BodyShape, bubble, buildCabin, cabinGlassTop, type Axle, type CabinSpec } from '../body';
import { grille, mirrors, roundLampPair } from '../details';
import { beam, box, MeshBuilder, roundBeam, type Lod } from '../kit';
import { buildRear, exhaustPoint } from '../rear';
import { finish, regions, type CarModel } from '../model';
import { AMBER, CHROME, GLASS, HEAD, LIVERY_A, PAINT, STRIPE_A, TAIL } from '../paints';

export function buildClassic(lod: Lod = 0): CarModel {
  const b = new MeshBuilder(lod);
  const axles: [Axle, Axle] = [{ z: -1.4, r: 0.435, x: 0.77, w: 0.28 }, { z: 1.4, r: 0.435, x: 0.77, w: 0.29 }];
  const shape = new BodyShape({
    secs: [
      { z: -2.2, yb: 0.3, yt: 0.46, hw: 0.6, crown: 0.05, sh: 0.2, tuck: 0.1, belt: 0.5 },
      { z: -2.05, yb: 0.25, yt: 0.55, hw: 0.8, crown: 0.07, sh: 0.22, tuck: 0.1 },
      { z: -1.75, yb: 0.23, yt: 0.6, hw: 0.88, crown: 0.09, sh: 0.22, tuck: 0.1 },
      { z: -0.8, yb: 0.23, yt: 0.68, hw: 0.9, crown: 0.1, sh: 0.2, tuck: 0.1 },
      { z: 0.2, yb: 0.24, yt: 0.75, hw: 0.9, crown: 0.05, sh: 0.18, tuck: 0.1 },
      { z: 1.4, yb: 0.25, yt: 0.8, hw: 0.92, crown: 0.06, sh: 0.2, tuck: 0.1 },
      { z: 2.0, yb: 0.29, yt: 0.78, hw: 0.84, crown: 0.07, sh: 0.2, tuck: 0.1 },
      { z: 2.2, yb: 0.35, yt: 0.7, hw: 0.68, crown: 0.06, sh: 0.2, tuck: 0.1 },
    ],
    axles, rise: [0.16, 0.12], band: 0.05, stripe: [0.26, 0.08],
    lod,
    brush: regions({ sill: PAINT }),
    capFront: PAINT, capBack: PAINT,
  });
  shape.build(b);
  const cab: CabinSpec = bubble({
    secs: [
      { z: -0.34, hwb: 0.74, yb: 0.76, hwt: 0.74, yt: 0.76 },
      { z: 0.22, hwb: 0.79, yb: 0.78, hwt: 0.58, yt: 1.2, crown: 0.06 },
      { z: 0.74, hwb: 0.8, yb: 0.8, hwt: 0.56, yt: 1.18, crown: 0.06 },
      { z: 1.78, hwb: 0.7, yb: 0.83, hwt: 0.7, yt: 0.83 },
    ],
    top: (gap, region) => (gap === 1 ? (region === 'stripe' ? STRIPE_A : PAINT) : GLASS),
    side: (gap) => (gap === 2 ? PAINT : GLASS),
    stripe: [0.26, 0.08],
  });
  buildCabin(b, cab);
  // Molduras cromadas das janelas (no alto do vidro lateral) e friso cromado ao longo da cintura.
  const ga = cabinGlassTop(cab, 0.18); const gb = cabinGlassTop(cab, 0.78);
  b.fine(() => b.mirrored(() => {
    beam(b, [0.74, 0.77, -0.32], ga, 0.035, 0.03, CHROME);
    beam(b, ga, gb, 0.035, 0.03, CHROME);
    beam(b, gb, [0.72, 0.84, 1.6], 0.035, 0.03, CHROME);
    beam(b, [0.905, 0.58, -1.9], [0.915, 0.62, 1.9], 0.018, 0.018, CHROME);
  }));
  // Frente: boca oval cromada, faróis redondos nos para-lamas, para-choques partidos, piscas.
  grille(b, 0.38, -2.22, 0.5, 0.15, CHROME, 3, CHROME);
  roundLampPair(b, 0.62, 0.55, -1.98, 0.11, HEAD, true, CHROME, 0.06, 16);
  b.mirrored(() => {
    // Para-choques partidos de seção redonda, acompanhando o bico e a traseira redondos.
    roundBeam(b, [0.26, 0.34, -2.235], [0.8, 0.36, -2.15], 0.05, 0.05, CHROME, 0.02);
    box(b, [0.66, 0.43, -2.19], [0.08, 0.05, 0.05], AMBER);
    roundBeam(b, [0.3, 0.42, 2.225], [0.8, 0.44, 2.17], 0.05, 0.05, CHROME, 0.02);
  });
  mirrors(b, 0.82, 0.86, -0.42, CHROME, 0.8);
  // Traseira-vitrine: lanternas redondas grandes (duas por lado, com aro cromado), escapes gêmeos cromados longos e uma saia escura embaixo.
  roundLampPair(b, 0.55, 0.57, 2.18, 0.125, TAIL, false, CHROME, 0.05, 14);
  roundLampPair(b, 0.3, 0.58, 2.18, 0.105, TAIL, false, CHROME, 0.05, 14);
  box(b, [0, 0.62, 2.205], [0.2, 0.06, 0.02], CHROME);
  const rear = buildRear(b, {
    exhausts: [{ x: 0.26, y: 0.27, z: 2.26, r: 0.07, len: 0.3 }, { x: -0.26, y: 0.27, z: 2.26, r: 0.07, len: 0.3 }],
    diffuser: { y: 0.32, z: 2.04, w: 1.0, fins: 3 },
  });
  return finish('classic', b, { wheel: 'wire', axles, exhausts: rear.exhausts.map(exhaustPoint), rear, liveries: [0, LIVERY_A] });
}
