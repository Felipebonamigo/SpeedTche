// Clássico dos anos 60 no estilo HCT "rodada 2" (V2, docs/ondas/V2-estilos.md; referências de forma: Jaguar E-Type, Ford Mustang 65, Porsche 356): capô longo e
// abaulado com para-lamas bojudos, bico estreito, cabine pequena e recuada em fastback de vidro escuro, boca com grade cromada, faróis redondos cromados
// EMBUTIDOS nos para-lamas, para-choques cromados partidos, frisos cromados, rodas de raios de arame com faixa branca. Casco por linhas (`Hull`). A traseira é
// a estrela: quatro lanternas redondas EMBUTIDAS (duas por lado, aro cromado, lente acesa no fundo com miolo e borda), os escapes gêmeos cromados longos e a
// saia escura embaixo. Faixas: A = duas faixas finas do capô à tampa (e no teto); B = no vinco da cintura. Mesmos eixos, pegada, escapes, roda e pinturas de antes.
import { buildCabin, cabinGlassTop, type Axle, type CabinSpec, type Region } from '../body';
import { mirrors } from '../details';
import { Hull } from '../hull';
import { beam, box, MeshBuilder, roundBeam, type Brush, type Lod } from '../kit';
import { finish, type CarModel } from '../model';
import { AMBER, CHROME, GLASS_TINT, GLINT_SKY, GLINT_SOFT, GRILLE, HEAD, HEAD_HOUSING, INTERIOR, LIVERY_A, PAINT, STRIPE_A, STRIPE_B, TAIL, TAIL_WELL, UNDER } from '../paints';
import { buildRear, exhaustPoint } from '../rear';
import { endDecal, glassGlints, meshGrille, recessedLamp } from '../shaped';

export const CLASSIC_STRIPE_A: readonly [number, number] = [0.08, 0.26];
/** A cabine, em z: a base do para-brisa e o fim do fastback. */
export const CLASSIC_CABIN: readonly [number, number] = [-0.34, 1.78];

export function buildClassic(lod: Lod = 0): CarModel {
  const b = new MeshBuilder(lod);
  const axles: [Axle, Axle] = [{ z: -1.4, r: 0.435, x: 0.77, w: 0.28 }, { z: 1.4, r: 0.435, x: 0.77, w: 0.29 }];
  const [C0, C3] = CLASSIC_CABIN;
  const underCabin = (z: number): boolean => z > C0 + 0.02 && z < C3 - 0.02;
  const STD: Record<Region, Brush> = { under: UNDER, well: UNDER, sill: PAINT, lower: PAINT, band: STRIPE_B, upper: PAINT, shoulder: PAINT, top: PAINT, stripe: STRIPE_A, center: PAINT };
  const hull = new Hull({
    lod,
    zs: [-2.2, -2.17, -2.1, -2.05, -1.9, -1.75, -1.1, -0.5, 0.2, 0.8, 1.2, 1.7, 1.95, 2.08, 2.16, 2.2],
    axles, lift: 0.5, stripe: [CLASSIC_STRIPE_A[1], CLASSIC_STRIPE_A[0]], band: 0.05, crisp: false, detail: { facets: 9, fine: true },
    yb: [[-2.2, 0.32], [-2.05, 0.26], [-1.75, 0.23], [1.8, 0.25], [2.0, 0.29], [2.2, 0.35]],
    yt: [[-2.2, 0.46], [-2.05, 0.55], [-1.75, 0.6], [-0.8, 0.68], [0.2, 0.75], [1.4, 0.8], [2.0, 0.78], [2.2, 0.7]],
    crown: [[-2.2, 0.02], [-2.05, 0.07], [-1.75, 0.09], [-0.8, 0.1], [0.2, 0.05], [1.4, 0.06], [2.0, 0.07], [2.2, 0.06]],
    hw: [[-2.2, 0.6], [-2.17, 0.7], [-2.1, 0.78], [-2.05, 0.82], [-1.75, 0.9], [-0.8, 0.9], [0.2, 0.9], [1.4, 0.92], [2.0, 0.84], [2.2, 0.68]],
    yc: [[-2.2, 0.36], [-2.0, 0.4], [-1.0, 0.45], [0, 0.5], [1.0, 0.54], [1.9, 0.58], [2.2, 0.58]],
    sh: [[-2.2, 0.2], [-1.75, 0.22], [-0.8, 0.2], [0.2, 0.18], [1.4, 0.2], [2.2, 0.2]],
    tuck: [[-2.2, 0.1], [0, 0.1], [2.2, 0.1]],
    flare: [0.03, 0.03], rise: [0.16, 0.12],
    brush: (r, z) => (underCabin(z) && (r === 'top' || r === 'stripe' || r === 'center') ? INTERIOR : STD[r]),
    capFront: PAINT, capBack: PAINT,
  });
  hull.build(b);

  // Cabine pequena e recuada em fastback: o vidro de trás desce até o porta-malas; a coluna de trás é pintada.
  const c0 = hull.cabinEnd(C0); const c1 = hull.cabinBase(0.22); const c2 = hull.cabinBase(0.74); const c3 = hull.cabinEnd(C3);
  const cab: CabinSpec = {
    secs: [c0, { ...c1, hwt: 0.58, yt: 1.2, crown: 0.06 }, { ...c2, hwt: 0.56, yt: 1.18, crown: 0.06 }, c3],
    top: (gap, region) => (gap === 1 ? (region === 'stripe' ? STRIPE_A : PAINT) : GLASS_TINT),
    side: (gap) => (gap === 2 ? PAINT : GLASS_TINT),
    stripe: [CLASSIC_STRIPE_A[1], CLASSIC_STRIPE_A[0]], edge: 0.08, glint: GLINT_SOFT,
  };
  buildCabin(b, cab);
  // Molduras cromadas das janelas (no alto do vidro lateral) e friso cromado ao longo da cintura.
  const ga = cabinGlassTop(cab, 0.18); const gb = cabinGlassTop(cab, 0.78);
  b.fine(() => b.mirrored(() => {
    beam(b, [c0.hwb, c0.yb + 0.01, C0 + 0.02], ga, 0.035, 0.03, CHROME);
    beam(b, ga, gb, 0.035, 0.03, CHROME);
    beam(b, gb, [c3.hwb, c3.yb + 0.01, C3 - 0.18], 0.035, 0.03, CHROME);
    beam(b, [hull.skinX(-1.9, hull.creaseY(-1.9)) + 0.006, hull.creaseY(-1.9) + 0.02, -1.9], [hull.skinX(1.9, hull.creaseY(1.9)) + 0.006, hull.creaseY(1.9) + 0.02, 1.9], 0.018, 0.018, CHROME);
  }));
  glassGlints(b, { z: c0.z, y: c0.yb, hw: c0.hwb }, { z: c1.z, y: 1.2, hw: 0.54 }, -1, GLINT_SKY, 0.04);
  mirrors(b, 0.82, c1.yb + 0.08, -0.42, CHROME, 0.8);

  // Frente: boca com grade cromada, faróis redondos cromados embutidos nos para-lamas, para-choques partidos de seção redonda, piscas.
  endDecal(b, hull, 'front', 0, 0.34, () => 0.3, () => 0.46, 0.01, GRILLE, b.lod ? 2 : 4);
  b.fine(() => meshGrille(b, hull, 'front', 0, 0.32, 0.32, 0.44, 3, GRILLE, CHROME));
  b.mirrored(() => {
    recessedLamp(b, { x: 0.62, y: 0.55, z: hull.endZ(0.62, 0.55, 'front') - 0.008, rOuter: 0.14, rLens: 0.11, protrude: 0.045, recess: 0.03 }, 'front', HEAD, CHROME, HEAD_HOUSING, 16);
    // Para-choques partidos de seção redonda, acompanhando o bico e a traseira redondos.
    roundBeam(b, [0.26, 0.34, -2.235], [0.8, 0.36, -2.15], 0.05, 0.05, CHROME, 0.02);
    box(b, [0.66, 0.43, -2.19], [0.08, 0.05, 0.05], AMBER);
    roundBeam(b, [0.3, 0.42, 2.225], [0.8, 0.44, 2.17], 0.05, 0.05, CHROME, 0.02);
  });

  // Traseira-vitrine: quatro lanternas redondas embutidas (duas por lado, com aro cromado), escapes gêmeos cromados longos e uma saia escura embaixo.
  for (const l of [{ x: 0.52, y: 0.57, rOuter: 0.15, rLens: 0.125 }, { x: 0.25, y: 0.58, rOuter: 0.125, rLens: 0.105 }]) {
    b.mirrored(() => recessedLamp(b, { ...l, z: hull.endZ(l.x, l.y, 'back') + 0.008, protrude: 0.045, recess: 0.03 }, 'back', TAIL, CHROME, TAIL_WELL, 14));
  }
  box(b, [0, 0.62, hull.zBack + 0.005], [0.14, 0.06, 0.02], CHROME);
  const rear = buildRear(b, {
    exhausts: [{ x: 0.26, y: 0.27, z: 2.26, r: 0.07, len: 0.3 }, { x: -0.26, y: 0.27, z: 2.26, r: 0.07, len: 0.3 }],
    diffuser: { y: 0.32, z: 2.04, w: 1.0, fins: 3 },
  });
  return finish('classic', b, { wheel: 'wire', axles, exhausts: rear.exhausts.map(exhaustPoint), rear, liveries: [0, LIVERY_A] });
}
