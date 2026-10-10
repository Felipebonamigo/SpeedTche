// Muscle car: capô comprido e reto com tomada de ar elevada, traseira curta com spoiler, frente alta e
// chata com a grade de ponta a ponta e faróis redondos cromados, entrada de ar na lateral traseira,
// para-choques cromados finos, pneus traseiros maiores (postura empinada) e rodas de magnésio.
import { BodyShape, bubble, buildCabin, cabinGlassTop, type Axle, type CabinSpec } from '../body';
import { grille, lampPair, mirrors, onTop, plate, roundLampPair } from '../details';
import { beam, box, MeshBuilder, roundBar, type Lod } from '../kit';
import { buildRear, exhaustPoint } from '../rear';
import { finish, regions, type CarModel } from '../model';
import { CHROME, GLASS, GRILLE, HEAD, HEAD_HOUSING, LIVERY_A, LIVERY_B, PAINT, STRIPE_A, TAIL, TRIM, TRIM_SOFT } from '../paints';

export function buildMuscle(lod: Lod = 0): CarModel {
  const b = new MeshBuilder(lod);
  const axles: [Axle, Axle] = [{ z: -1.3, r: 0.44, x: 0.79, w: 0.3 }, { z: 1.3, r: 0.47, x: 0.78, w: 0.36 }];
  const shape = new BodyShape({
    secs: [
      { z: -2.2, yb: 0.24, yt: 0.74, hw: 0.88, crown: 0.01, sh: 0.07, tuck: 0.04, belt: 0.62 },
      { z: -2.06, yb: 0.2, yt: 0.77, hw: 0.92, crown: 0.02, sh: 0.08, tuck: 0.05, belt: 0.6 },
      { z: -1.2, yb: 0.2, yt: 0.79, hw: 0.93, crown: 0.03, sh: 0.09, belt: 0.58 },
      { z: -0.7, yb: 0.2, yt: 0.81, hw: 0.93, crown: 0.03, sh: 0.09, belt: 0.58 },
      { z: 0.8, yb: 0.22, yt: 0.85, hw: 0.94, crown: 0.03, sh: 0.09, belt: 0.58 },
      { z: 1.4, yb: 0.24, yt: 0.89, hw: 0.96, crown: 0.02, sh: 0.09, belt: 0.58 },
      { z: 2.0, yb: 0.28, yt: 0.91, hw: 0.94, crown: 0.02, sh: 0.08 },
      { z: 2.2, yb: 0.34, yt: 0.91, hw: 0.9, crown: 0.01, sh: 0.07 },
    ],
    axles, rise: [0.03, 0.05], flare: [0, 0.03], band: 0.07,
    lod,
    brush: regions({ sill: PAINT }),
    capFront: PAINT, capBack: PAINT,
  });
  shape.build(b);
  const cab: CabinSpec = bubble({
    secs: [
      { z: -0.74, hwb: 0.82, yb: 0.81, hwt: 0.82, yt: 0.81 },
      { z: -0.08, hwb: 0.85, yb: 0.83, hwt: 0.66, yt: 1.27, crown: 0.02 },
      { z: 0.52, hwb: 0.86, yb: 0.84, hwt: 0.66, yt: 1.26, crown: 0.02 },
      { z: 1.62, hwb: 0.84, yb: 0.89, hwt: 0.84, yt: 0.89 },
    ],
    top: (gap, region) => (gap === 1 ? (region === 'stripe' ? STRIPE_A : PAINT) : GLASS),
    side: (gap) => (gap === 2 ? PAINT : GLASS),
  });
  buildCabin(b, cab);
  b.mirrored(() => beam(b, [0.82, 0.82, -0.72], cabinGlassTop(cab, -0.12), 0.06, 0.04, CHROME));
  b.mirrored(() => beam(b, [0.85, 0.84, 0.52], cabinGlassTop(cab, 0.52), 0.07, 0.04, TRIM_SOFT));
  // Tomada de ar no capô (caixa toda arredondada, com a boca escura); a asa de brinquedo vem na traseira.
  onTop(b, shape, 0, -1.0, 0.54, 0.78, 0.16, PAINT, { nu: GRILLE }, 0.02, -0.05);
  // Frente: grade de ponta a ponta com dois faróis redondos cromados, para-choque cromado fino.
  grille(b, 0.52, -2.21, 1.56, 0.32, CHROME, 2, TRIM);
  roundLampPair(b, 0.6, 0.53, -2.17, 0.115, HEAD, true, CHROME, 0.06, 16);
  roundBar(b, [0, 0.3, -2.24], [1.74, 0.08, 0.1], CHROME, { r: 0.035 });
  // Entrada de ar na lateral traseira, antes da roda.
  b.mirrored(() => roundBar(b, [0.948, 0.62, 0.62], [0.03, 0.14, 0.32], GRILLE, { r: 0.06, axis: 'x' }));
  mirrors(b, 0.86, 0.9, -0.5, CHROME);
  // Traseira-vitrine: duas lanternas largas e altas, painel escuro entre elas, para-choque cromado, escapes gêmeos largos, difusor e asa.
  lampPair(b, 0.47, 0.74, 2.21, 0.68, 0.17, 0, TAIL, false, HEAD_HOUSING, 0.05);
  box(b, [0, 0.74, 2.215], [0.26, 0.17, 0.04], TRIM);
  roundBar(b, [0, 0.4, 2.25], [1.76, 0.08, 0.1], CHROME, { r: 0.035 });
  plate(b, 0.55, 2.215);
  const rear = buildRear(b, {
    exhausts: [{ x: 0.52, y: 0.27, z: 2.28, r: 0.085, len: 0.2 }, { x: -0.52, y: 0.27, z: 2.28, r: 0.085, len: 0.2 }],
    diffuser: { y: 0.27, z: 2.08, w: 1.3, fins: 6 },
    wing: { z: 2.04, y: 1.12, span: 1.56, chord: 0.36, thick: 0.07, pitch: -0.1, brush: PAINT, plate: PAINT, strut: 'post', baseY: 0.92, strutX: 0.55 },
  });
  return finish('muscle', b, { wheel: 'mag', axles, exhausts: rear.exhausts.map(exhaustPoint), rear, liveries: [LIVERY_A, LIVERY_B] });
}
