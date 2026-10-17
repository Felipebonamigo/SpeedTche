// Microcarro no estilo HCT "rodada 2" (V2, docs/ondas/V2-estilos.md; referências de forma: Fiat 500, Isetta, Smart): curto (3,3 m) e gordinho (a mesma largura dos
// outros), rodas pequenas nos cantos, cabine alta e redonda de vidro escuro com o teto em outra cor (a camada A), "olhos" redondos grandes cromados EMBUTIDOS nos
// para-lamas, bigode cromado na frente, para-choques cromados finos e calotas. Casco por linhas (`Hull`). A traseira é a estrela: duas lanternas redondas
// grandes EMBUTIDAS (aro cromado, lente acesa no fundo com miolo e borda), para-choque cromado, escape e difusor. Faixas: A = o teto e as duas faixas do capô
// (na pintura A, o teto vira a cor de acento, como um teto branco); B = no vinco da cintura. Mesmos eixos, pegada, escape, roda e pinturas de antes.
import { buildCabin, cabinGlassTop, type Axle, type CabinSpec, type Region } from '../body';
import { mirrors, plate } from '../details';
import { Hull } from '../hull';
import { beam, box, MeshBuilder, roundBar, roundBeam, type Brush, type Lod } from '../kit';
import { finish, type CarModel } from '../model';
import { AMBER, CHROME, GLASS_TINT, GLINT_SKY, GLINT_SOFT, HEAD, HEAD_HOUSING, INTERIOR, LIVERY_A, LIVERY_B, PAINT, STRIPE_A, STRIPE_B, TAIL, TAIL_WELL, TRIM_SOFT, UNDER } from '../paints';
import { buildRear, exhaustPoint } from '../rear';
import { glassGlints, recessedLamp } from '../shaped';

export const MICRO_STRIPE_A: readonly [number, number] = [0.08, 0.34];
/** A cabine, em z: a base do para-brisa e o fim do vidro de trás. */
export const MICRO_CABIN: readonly [number, number] = [-0.82, 1.5];

export function buildMicro(lod: Lod = 0): CarModel {
  const b = new MeshBuilder(lod);
  const axles: [Axle, Axle] = [{ z: -1.1, r: 0.335, x: 0.78, w: 0.28 }, { z: 1.1, r: 0.335, x: 0.78, w: 0.28 }];
  const [C0, C3] = MICRO_CABIN;
  const underCabin = (z: number): boolean => z > C0 + 0.02 && z < C3 - 0.02;
  const STD: Record<Region, Brush> = { under: UNDER, well: UNDER, sill: PAINT, lower: PAINT, band: STRIPE_B, upper: PAINT, shoulder: PAINT, top: PAINT, stripe: STRIPE_A, center: PAINT };
  const hull = new Hull({
    lod,
    zs: [-1.65, -1.62, -1.55, -1.45, -1.3, -1.0, -0.6, -0.2, 0.3, 0.7, 1.0, 1.3, 1.45, 1.55, 1.62, 1.65],
    axles, lift: 0.5, stripe: [MICRO_STRIPE_A[1], MICRO_STRIPE_A[0]], band: 0.05, detail: { facets: 9, fine: true },
    yb: [[-1.65, 0.3], [-1.5, 0.23], [-1.1, 0.2], [1.1, 0.21], [1.45, 0.25], [1.65, 0.32]],
    yt: [[-1.65, 0.55], [-1.5, 0.65], [-1.1, 0.72], [-0.7, 0.76], [0.9, 0.84], [1.45, 0.83], [1.65, 0.76]],
    crown: [[-1.65, 0.03], [-1.5, 0.06], [-1.1, 0.07], [-0.7, 0.06], [0.9, 0.05], [1.65, 0.04]],
    hw: [[-1.65, 0.8], [-1.6, 0.85], [-1.5, 0.88], [-1.1, 0.92], [0.9, 0.92], [1.45, 0.88], [1.65, 0.8]],
    yc: [[-1.65, 0.34], [-1.45, 0.38], [-0.7, 0.44], [0.9, 0.52], [1.5, 0.56], [1.65, 0.56]],
    sh: [[-1.65, 0.24], [-1.1, 0.2], [0.9, 0.2], [1.45, 0.22], [1.65, 0.24]],
    tuck: [[-1.65, 0.1], [0, 0.1], [1.65, 0.1]],
    flare: [0.02, 0.02], rise: [0.05, 0.04],
    brush: (r, z) => (underCabin(z) && (r === 'top' || r === 'stripe' || r === 'center') ? INTERIOR : STD[r]),
    capFront: PAINT, capBack: PAINT,
  });
  hull.build(b);

  // Cabine alta e redonda; o teto é a camada A (na pintura A fica na cor de acento, como um teto branco).
  const c0 = hull.cabinEnd(C0); const c1 = hull.cabinBase(-0.3); const c2 = hull.cabinBase(0.95); const c3 = hull.cabinEnd(C3);
  const cab: CabinSpec = {
    secs: [c0, { ...c1, hwt: 0.58, yt: 1.46, crown: 0.07 }, { ...c2, hwt: 0.56, yt: 1.44, crown: 0.07 }, c3],
    top: (gap) => (gap === 1 ? STRIPE_A : GLASS_TINT),
    side: () => GLASS_TINT,
    edge: 0.08, glint: GLINT_SOFT,
  };
  buildCabin(b, cab);
  b.mirrored(() => {
    beam(b, [c0.hwb, c0.yb + 0.01, C0 + 0.02], cabinGlassTop(cab, -0.34), 0.07, 0.04, PAINT);
    beam(b, [c1.hwb + 0.01, c1.yb + 0.02, 0.35], cabinGlassTop(cab, 0.35), 0.08, 0.03, TRIM_SOFT);
    beam(b, [c2.hwb, c2.yb + 0.02, 0.95], cabinGlassTop(cab, 0.99), 0.09, 0.04, PAINT);
  });
  glassGlints(b, { z: c0.z, y: c0.yb, hw: c0.hwb }, { z: c1.z, y: 1.46, hw: 0.54 }, -1, GLINT_SKY, 0.05);
  mirrors(b, 0.86, c1.yb + 0.1, -0.62, CHROME, 0.9);

  // Frente: "olhos" redondos grandes embutidos nos para-lamas, bigode cromado, piscas, para-choque cromado fino.
  b.mirrored(() => {
    recessedLamp(b, { x: 0.54, y: 0.6, z: hull.endZ(0.54, 0.6, 'front') - 0.008, rOuter: 0.18, rLens: 0.15, protrude: 0.05, recess: 0.035 }, 'front', HEAD, CHROME, HEAD_HOUSING, 16);
    box(b, [0.78, 0.46, hull.endZ(0.78, 0.46, 'front') - 0.01], [0.08, 0.06, 0.05], AMBER);
  });
  roundBeam(b, [-0.24, 0.46, hull.zFront - 0.02], [0.24, 0.46, hull.zFront - 0.02], 0.04, 0.03, CHROME, 0.015);
  roundBar(b, [0, 0.32, -1.68], [1.5, 0.06, 0.07], CHROME, { r: 0.03 });
  plate(b, 0.4, -1.69);

  // Traseira-vitrine: duas lanternas redondas grandes embutidas (aro cromado), para-choque cromado, escape e difusor.
  b.mirrored(() => recessedLamp(b, { x: 0.56, y: 0.62, z: hull.endZ(0.56, 0.62, 'back') + 0.008, rOuter: 0.19, rLens: 0.16, protrude: 0.045, recess: 0.03 }, 'back', TAIL, CHROME, TAIL_WELL, 16));
  roundBar(b, [0, 0.36, 1.68], [1.5, 0.06, 0.07], CHROME, { r: 0.03 });
  plate(b, 0.5, 1.66);
  const rear = buildRear(b, {
    exhausts: [{ x: 0.46, y: 0.27, z: 1.72, r: 0.065, len: 0.14 }],
    diffuser: { y: 0.3, z: 1.52, w: 0.96, fins: 3 },
  });
  return finish('micro', b, { wheel: 'hubcap', axles, exhausts: rear.exhausts.map(exhaustPoint), rear, liveries: [LIVERY_A, LIVERY_B] });
}
