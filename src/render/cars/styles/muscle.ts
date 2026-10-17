// Muscle car no estilo HCT "rodada 2" (V2, docs/ondas/V2-estilos.md; referências de forma: Mustang Fastback, Camaro, Challenger): capô comprido e reto com a
// tomada de ar elevada, frente alta e chata com a grade e dois faróis redondos cromados EMBUTIDOS, lateral de vinco alto subindo para a traseira curta
// com o spoiler, entrada de ar escura atrás da porta, para-choques cromados finos, pneus de trás maiores (postura empinada) e rodas de magnésio. Casco por
// linhas (`Hull`); cabine de vidro escuro. A traseira é a estrela: três lanternas verticais por lado EMBUTIDAS (moldura que sobra 4,5 cm, lente acesa no
// fundo com miolo e borda) com o painel escuro no meio, para-choque cromado, escapes gêmeos largos, difusor e a asa. Faixas: A = duas faixas de corrida do
// capô à tampa (e no teto); B = no vinco da cintura. Mesmos eixos, pegada, escapes, roda e pinturas de antes.
import { buildCabin, cabinGlassTop, type Axle, type CabinSpec, type Region } from '../body';
import { mirrors, plate } from '../details';
import { Hull } from '../hull';
import { beam, MeshBuilder, roundBar, roundBox, type Brush, type Lod } from '../kit';
import { finish, type CarModel } from '../model';
import { CHROME, GLASS_TINT, GLINT_SKY, GLINT_SOFT, GRILLE, HEAD, HEAD_HOUSING, INTERIOR, LIVERY_A, LIVERY_B, PAINT, PIANO, STRIPE_A, STRIPE_B, TAIL, TAIL_WELL, TRIM_SOFT, UNDER } from '../paints';
import { buildRear, exhaustPoint } from '../rear';
import { boxLamp, endDecal, glassGlints, meshGrille, recessedLamp, sideDecal } from '../shaped';

export const MUSCLE_STRIPE_A: readonly [number, number] = [0.08, 0.3];
/** A cabine, em z: a base do para-brisa e o fim do vidro de trás. */
export const MUSCLE_CABIN: readonly [number, number] = [-0.74, 1.62];

export function buildMuscle(lod: Lod = 0): CarModel {
  const b = new MeshBuilder(lod);
  const axles: [Axle, Axle] = [{ z: -1.3, r: 0.44, x: 0.79, w: 0.3 }, { z: 1.3, r: 0.47, x: 0.78, w: 0.36 }];
  const [C0, C3] = MUSCLE_CABIN;
  const underCabin = (z: number): boolean => z > C0 + 0.02 && z < C3 - 0.02;
  const STD: Record<Region, Brush> = { under: UNDER, well: UNDER, sill: PAINT, lower: PAINT, band: STRIPE_B, upper: PAINT, shoulder: PAINT, top: PAINT, stripe: STRIPE_A, center: PAINT };
  const hull = new Hull({
    lod,
    zs: [-2.2, -2.17, -2.1, -2.0, -1.85, -1.6, -1.0, -0.4, 0.3, 0.9, 1.2, 1.7, 1.95, 2.08, 2.16, 2.2],
    axles, lift: 0.1, stripe: [MUSCLE_STRIPE_A[1], MUSCLE_STRIPE_A[0]], band: 0.06, crisp: true, detail: { facets: 9, fine: true },
    yb: [[-2.2, 0.26], [-2.06, 0.21], [-1.8, 0.2], [1.8, 0.22], [2.05, 0.28], [2.2, 0.34]],
    yt: [[-2.2, 0.74], [-2.06, 0.77], [-1.2, 0.79], [-0.7, 0.81], [0.8, 0.85], [1.4, 0.89], [2.0, 0.91], [2.2, 0.91]],
    crown: [[-2.2, 0], [-2.06, 0.01], [-1.2, 0.02], [2, 0.02], [2.2, 0]],
    hw: [[-2.2, 0.88], [-2.14, 0.91], [-2.06, 0.92], [-1.2, 0.93], [0, 0.93], [0.8, 0.94], [1.4, 0.96], [2.0, 0.94], [2.2, 0.9]],
    yc: [[-2.2, 0.5], [-2.0, 0.52], [-1.0, 0.56], [0, 0.62], [1.0, 0.67], [1.9, 0.72], [2.2, 0.72]],
    sh: [[-2.2, 0.07], [-1.2, 0.09], [0.8, 0.09], [2.0, 0.08], [2.2, 0.07]],
    tuck: [[-2.2, 0.04], [-1.8, 0.07], [0, 0.1], [1.8, 0.07], [2.2, 0.04]],
    flare: [0.01, 0.03], rise: [0.05, 0.05],
    brush: (r, z) => (underCabin(z) && (r === 'top' || r === 'stripe' || r === 'center') ? INTERIOR : STD[r]),
    capFront: PAINT, capBack: PAINT,
  });
  hull.build(b);

  const c0 = hull.cabinEnd(C0); const c1 = hull.cabinBase(-0.08); const c2 = hull.cabinBase(0.52); const c3 = hull.cabinEnd(C3);
  const cab: CabinSpec = {
    secs: [c0, { ...c1, hwt: 0.66, yt: 1.27, crown: 0.03 }, { ...c2, hwt: 0.66, yt: 1.26, crown: 0.03 }, c3],
    top: (gap, region) => (gap === 1 ? (region === 'stripe' ? STRIPE_A : PAINT) : GLASS_TINT),
    side: (gap) => (gap === 2 ? PAINT : GLASS_TINT),
    stripe: [MUSCLE_STRIPE_A[1], MUSCLE_STRIPE_A[0]], edge: 0.07, glint: GLINT_SOFT,
  };
  buildCabin(b, cab);
  b.mirrored(() => beam(b, [c0.hwb, c0.yb + 0.01, C0], cabinGlassTop(cab, -0.1), 0.06, 0.04, CHROME));
  b.mirrored(() => beam(b, [c2.hwb, c2.yb, 0.52], cabinGlassTop(cab, 0.52), 0.07, 0.04, TRIM_SOFT));
  glassGlints(b, { z: c0.z, y: c0.yb, hw: c0.hwb }, { z: c1.z, y: 1.27, hw: 0.6 }, -1, GLINT_SKY, 0.03);
  mirrors(b, 0.86, c1.yb + 0.1, -0.5, CHROME);
  // Tomada de ar no capô: caixa toda arredondada com a boca escura (entre as faixas A: ≤ 0,21 de meia largura).
  roundBox(b, [0, hull.topAt(-1.0, 0) + 0.07, -1.0], [0.4, 0.14, 0.78], PAINT, 0.05, { nu: GRILLE });

  // Lateral: a entrada de ar escura atrás da porta, abaixo da faixa B.
  sideDecal(b, hull, [[0.5, 0.36], [1.0, 0.36], [1.0, 0.5], [0.5, 0.5]], GRILLE, 0.012);

  // Frente: a grade (lamelas cromadas) e dois faróis redondos cromados embutidos, para-choque cromado fino.
  endDecal(b, hull, 'front', 0, 0.9, () => 0.4, () => 0.66, 0.008, GRILLE, b.lod ? 3 : 6);
  b.fine(() => meshGrille(b, hull, 'front', 0, 0.42, 0.44, 0.62, 3, GRILLE, CHROME));
  b.mirrored(() => recessedLamp(b, { x: 0.64, y: 0.54, z: hull.endZ(0.64, 0.54, 'front') - 0.008, rOuter: 0.14, rLens: 0.115, protrude: 0.04, recess: 0.03 }, 'front', HEAD, CHROME, HEAD_HOUSING, 16));
  roundBar(b, [0, 0.3, -2.24], [1.74, 0.08, 0.1], CHROME, { r: 0.035 });

  // Traseira-vitrine: três lanternas verticais por lado embutidas, painel escuro no meio, para-choque cromado, escapes gêmeos, difusor e a asa.
  endDecal(b, hull, 'back', 0, 0.9, () => 0.62, () => 0.9, 0.006, PIANO, b.lod ? 3 : 8);
  b.mirrored(() => boxLamp(b, hull, { x0: 0.3, x1: 0.88, y0: 0.66, y1: 0.86, cells: 3, protrude: 0.045, recess: 0.03 }, TAIL, PIANO, TAIL_WELL));
  roundBar(b, [0, 0.4, 2.25], [1.76, 0.08, 0.1], CHROME, { r: 0.035 });
  plate(b, 0.52, hull.zBack + 0.015);
  const rear = buildRear(b, {
    exhausts: [{ x: 0.52, y: 0.27, z: 2.28, r: 0.085, len: 0.2 }, { x: -0.52, y: 0.27, z: 2.28, r: 0.085, len: 0.2 }],
    diffuser: { y: 0.27, z: 2.08, w: 1.3, fins: 6 },
    wing: { z: 2.04, y: 1.12, span: 1.56, chord: 0.36, thick: 0.07, pitch: -0.1, brush: PAINT, plate: PAINT, strut: 'post', baseY: 0.92, strutX: 0.55 },
  });
  return finish('muscle', b, { wheel: 'mag', axles, exhausts: rear.exhausts.map(exhaustPoint), rear, liveries: [LIVERY_A, LIVERY_B] });
}
