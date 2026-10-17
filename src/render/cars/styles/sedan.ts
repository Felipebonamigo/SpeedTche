// Sedã econômico no estilo HCT "rodada 2" (V2, docs/ondas/V2-estilos.md; referências de forma: Fiat Siena, Chevrolet Prisma, VW Voyage): três volumes (capô,
// cabine alta, porta-malas), linhas mansas, friso cromado na linha das janelas, frisos de borracha nas portas, faróis retangulares largos em leque, pisca âmbar,
// placas, um escape discreto e calotas. Casco por linhas (`Hull`); vidro escuro. A traseira é a estrela: as lanternas largas e altas EMBUTIDAS (moldura que
// sobra 4,5 cm, lente acesa no fundo com miolo e borda) com a luz de ré em leque ao lado, placa, um escape largo e o difusor. Faixas: A = duas faixas do capô à
// tampa do porta-malas (e no teto); B = no vinco da cintura. Mesmos eixos, pegada, escape, roda e pinturas de antes (o 2º sedã, o Barão, tem arquivo próprio).
import { buildCabin, cabinGlassTop, type Axle, type CabinSpec, type Region } from '../body';
import { mirrors, plate } from '../details';
import { Hull } from '../hull';
import { beam, box, MeshBuilder, roundBar, type Brush, type Lod, type P3 } from '../kit';
import { finish, type CarModel } from '../model';
import {
  AMBER, CHROME, GLASS_TINT, GLINT_SKY, GLINT_SOFT, GRILLE, HEAD, INTERIOR, LIVERY_A, LIVERY_B, PAINT, PAINT_SHADE, PIANO, REVERSE, STRIPE_A, STRIPE_B, TAIL,
  TAIL_WELL, TRIM, TRIM_SOFT, UNDER,
} from '../paints';
import { buildRear, exhaustPoint } from '../rear';
import { boxLamp, endDecal, glassGlints, lensRect, meshGrille } from '../shaped';

export const SEDAN_STRIPE_A: readonly [number, number] = [0.06, 0.34];
/** A cabine, em z: a base do para-brisa e o fim do vidro de trás (atrás dele, o porta-malas). */
export const SEDAN_CABIN: readonly [number, number] = [-0.8, 1.46];

export function buildSedan(lod: Lod = 0): CarModel {
  const b = new MeshBuilder(lod);
  const axles: [Axle, Axle] = [{ z: -1.36, r: 0.435, x: 0.78, w: 0.29 }, { z: 1.32, r: 0.435, x: 0.78, w: 0.29 }];
  const [C0, C3] = SEDAN_CABIN;
  const underCabin = (z: number): boolean => z > C0 + 0.02 && z < C3 - 0.02;
  const STD: Record<Region, Brush> = { under: UNDER, well: UNDER, sill: PAINT_SHADE, lower: PAINT, band: STRIPE_B, upper: PAINT, shoulder: PAINT, top: PAINT, stripe: STRIPE_A, center: PAINT };
  const hull = new Hull({
    lod,
    zs: [-2.2, -2.17, -2.1, -2.0, -1.85, -1.6, -1.0, -0.4, 0.3, 0.9, 1.2, 1.7, 1.95, 2.08, 2.16, 2.2],
    axles, lift: 0.15, stripe: [SEDAN_STRIPE_A[1], SEDAN_STRIPE_A[0]], band: 0.05, crisp: true, detail: { facets: 9, fine: true },
    yb: [[-2.2, 0.3], [-2.06, 0.24], [-1.8, 0.21], [1.8, 0.23], [2.06, 0.29], [2.2, 0.35]],
    yt: [[-2.2, 0.66], [-2.06, 0.72], [-1.2, 0.79], [-0.75, 0.83], [1.0, 0.91], [1.6, 0.93], [2.06, 0.93], [2.2, 0.89]],
    crown: [[-2.2, 0], [-2.06, 0.02], [-1.2, 0.035], [1.6, 0.03], [2.2, 0]],
    hw: [[-2.2, 0.85], [-2.14, 0.89], [-2.06, 0.9], [-1.2, 0.92], [0, 0.92], [1.6, 0.91], [2.06, 0.88], [2.2, 0.83]],
    yc: [[-2.2, 0.48], [-2.0, 0.51], [-1.0, 0.57], [0, 0.63], [1.0, 0.68], [1.9, 0.72], [2.2, 0.72]],
    sh: [[-2.2, 0.14], [-1.2, 0.13], [1.6, 0.13], [2.2, 0.13]],
    tuck: [[-2.2, 0.07], [-1.8, 0.08], [0, 0.1], [1.8, 0.08], [2.2, 0.07]],
    flare: [0.01, 0.01], rise: [0.02, 0.02],
    brush: (r, z) => (underCabin(z) && (r === 'top' || r === 'stripe' || r === 'center') ? INTERIOR : STD[r]),
    capFront: PAINT, capBack: PAINT,
  });
  hull.build(b);

  const c0 = hull.cabinEnd(C0); const c1 = hull.cabinBase(-0.1); const c2 = hull.cabinBase(0.82); const c3 = hull.cabinEnd(C3);
  const cab: CabinSpec = {
    secs: [c0, { ...c1, hwt: 0.56, yt: 1.4, crown: 0.03 }, { ...c2, hwt: 0.56, yt: 1.4, crown: 0.03 }, c3],
    top: (gap, region) => (gap === 1 ? (region === 'stripe' ? STRIPE_A : PAINT) : GLASS_TINT),
    side: () => GLASS_TINT,
    stripe: [SEDAN_STRIPE_A[1], SEDAN_STRIPE_A[0]], edge: 0.06, glint: GLINT_SOFT,
  };
  buildCabin(b, cab);
  b.mirrored(() => {
    beam(b, [c0.hwb, c0.yb + 0.01, C0 + 0.02], cabinGlassTop(cab, -0.14), 0.07, 0.04, PAINT);
    beam(b, [c1.hwb + 0.01, c1.yb + 0.03, 0.36], cabinGlassTop(cab, 0.36), 0.08, 0.03, TRIM_SOFT);
    beam(b, [c2.hwb, c2.yb + 0.02, 0.82], cabinGlassTop(cab, 0.86), 0.1, 0.03, PAINT);
    // Friso cromado na linha das janelas e friso de borracha nas portas.
    beam(b, [c1.hwb + 0.01, c1.yb + 0.01, -0.75], [c2.hwb + 0.01, c2.yb + 0.03, 1.4], 0.02, 0.02, CHROME);
    box(b, [hull.skinX(0.2, 0.46) + 0.01, 0.46, 0.2], [0.02, 0.05, 1.5], TRIM);
  });
  glassGlints(b, { z: c0.z, y: c0.yb, hw: c0.hwb }, { z: c1.z, y: 1.4, hw: 0.66 }, -1, GLINT_SKY, 0.03);
  mirrors(b, 0.87, c1.yb + 0.1, -0.58, PAINT);

  // Frente: grade fina com barra cromada, faróis largos retangulares em leque, pisca âmbar, para-choque um tom abaixo, placa.
  const nose = (x: number, y: number): P3 => [x, y, hull.endZ(x, y, 'front') - 0.012];
  endDecal(b, hull, 'front', 0, 0.9, () => 0.5, () => 0.68, 0.008, PIANO, b.lod ? 2 : 4);
  b.mirrored(() => lensRect(b, [nose(0.4, 0.52), nose(0.84, 0.53), nose(0.84, 0.66), nose(0.4, 0.65)], [0, 0, -1], HEAD, 0.002));
  b.fine(() => {
    meshGrille(b, hull, 'front', 0, 0.36, 0.52, 0.64, 1, GRILLE, CHROME);
    endDecal(b, hull, 'front', 0.86, 0.92, () => 0.44, () => 0.5, 0.012, AMBER, 2);
  });
  roundBar(b, [0, 0.28, -2.22], [1.66, 0.12, 0.06], PAINT_SHADE, { r: 0.03 });
  box(b, [0, 0.3, -2.25], [0.9, 0.06, 0.03], TRIM);
  plate(b, 0.4, -2.26);

  // Traseira-vitrine: lanternas largas e altas embutidas, a luz de ré em leque ao lado, placa, um escape largo e o difusor.
  endDecal(b, hull, 'back', 0, 0.9, () => 0.6, () => 0.9, 0.006, PIANO, b.lod ? 3 : 8);
  b.mirrored(() => {
    boxLamp(b, hull, { x0: 0.38, x1: 0.88, y0: 0.68, y1: 0.9, cells: 1, protrude: 0.045, recess: 0.03 }, TAIL, PIANO, TAIL_WELL);
    const z = hull.endZ(0.26, 0.78, 'back') + 0.03;
    lensRect(b, [[0.18, 0.7, z], [0.34, 0.7, z], [0.34, 0.86, z], [0.18, 0.86, z]], [0, 0, 1], REVERSE, 0.003);
  });
  plate(b, 0.6, hull.zBack + 0.02);
  roundBar(b, [0, 0.27, 2.23], [1.7, 0.12, 0.06], PAINT_SHADE, { r: 0.03 });
  const rear = buildRear(b, {
    exhausts: [{ x: 0.5, y: 0.27, z: 2.25, r: 0.075 }],
    diffuser: { y: 0.24, z: 2.08, w: 1.1, fins: 4 },
  });
  return finish('sedan', b, { wheel: 'hubcap', axles, exhausts: rear.exhausts.map(exhaustPoint), rear, liveries: [0, 0, LIVERY_B, LIVERY_A] }); // o 2º sedã (Barão, V6c) tem arquivo próprio (barao.glb, faixa dele): o procedural dele nunca é desenhado e não pede faixa ao estilo
}
