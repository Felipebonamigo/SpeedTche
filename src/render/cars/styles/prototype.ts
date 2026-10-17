// Protótipo de endurance no estilo HCT "rodada 2" (V2, docs/ondas/V2-estilos.md; referências de forma: Audi R18, Porsche 919, Peugeot 908). Casco por
// linhas (`Hull`) muito baixo e comprido: bico rente ao chão entre para-lamas altos sobre as rodas, ombro largo e deck estreito, cockpit fechado em gota
// (bolha escura) e a tampa do motor que desce até a asa, com a barbatana de tubarão de acento. Faróis em FENDA no bico, entradas no flanco e o painel de
// número redondo. A traseira é a estrela: painel preto com a faixa de lanternas EMBUTIDAS (três por lado: moldura que sobra 4,5 cm, lente acesa no
// fundo com miolo e borda), o escape central largo, o difusor de carbono de oito aletas e a asa em pescoço de cisne de ponta a ponta com placas grandes.
// Faixas: A = duas faixas do bico à cauda (capô, teto e tampa); B = no vinco da cintura. Mesmos eixos, pegada, escape, roda e pinturas de antes.
import { buildCabin, cabinGlassTop, type Axle, type CabinSpec, type Region } from '../body';
import { calipers, mirrors, splitter } from '../details';
import { Hull } from '../hull';
import { beam, extrudeZY, MeshBuilder, type Brush, type Lod, type P3 } from '../kit';
import { finish, type CarModel } from '../model';
import {
  ACCENT, CARBON, GLASS_TINT, GLINT_SKY, GLINT_SOFT, GRILLE, HEAD, INTERIOR, LIVERY_A, LIVERY_B, PAINT, PIANO, STRIPE_A, STRIPE_B, TAIL, TAIL_WELL,
  TRIM, TRIM_SOFT, UNDER, WHITE,
} from '../paints';
import { buildRear, exhaustPoint } from '../rear';
import { boxLamp, endDecal, glassGlints, lensRect, meshGrille, sideDecal, sideLine, topPatch } from '../shaped';

export const PROTOTYPE_STRIPE_A: readonly [number, number] = [0.08, 0.3];
/** A cabine, em z: a base do para-brisa e o fim da tampa do motor. */
export const PROTOTYPE_CABIN: readonly [number, number] = [-1.0, 1.4];

export function buildPrototype(lod: Lod = 0): CarModel {
  const b = new MeshBuilder(lod);
  const axles: [Axle, Axle] = [{ z: -1.5, r: 0.44, x: 0.8, w: 0.33 }, { z: 1.45, r: 0.46, x: 0.79, w: 0.36 }];
  const [C0, C3] = PROTOTYPE_CABIN;
  const underCabin = (z: number): boolean => z > C0 + 0.02 && z < C3 - 0.02;
  const STD: Record<Region, Brush> = { under: UNDER, well: UNDER, sill: CARBON, lower: PAINT, band: STRIPE_B, upper: PAINT, shoulder: PAINT, top: PAINT, stripe: STRIPE_A, center: PAINT };
  const hull = new Hull({
    lod,
    zs: [-2.2, -2.17, -2.1, -2.0, -1.85, -1.6, -1.0, -0.4, 0.2, 0.8, 1.3, 1.7, 1.95, 2.08, 2.16, 2.2],
    axles, lift: 0.45, stripe: [PROTOTYPE_STRIPE_A[1], PROTOTYPE_STRIPE_A[0]], band: 0.06, clear: 0.05, crisp: true, detail: { facets: 9, fine: true },
    yb: [[-2.2, 0.16], [-2.1, 0.11], [-1.9, 0.09], [1.9, 0.1], [2.1, 0.16], [2.2, 0.22]],
    yt: [[-2.2, 0.28], [-2.0, 0.33], [-1.6, 0.4], [-1.0, 0.47], [-0.2, 0.54], [0.8, 0.62], [1.6, 0.7], [2.0, 0.72], [2.2, 0.7]],
    crown: [[-2.2, 0], [-2.1, 0.01], [-1.5, 0.025], [-0.5, 0.04], [2, 0.03], [2.2, 0]],
    hw: [[-2.2, 0.8], [-2.14, 0.88], [-2.04, 0.93], [-1.85, 0.955], [-1.0, 0.955], [0, 0.95], [1.0, 0.955], [1.9, 0.95], [2.1, 0.92], [2.2, 0.86]],
    yc: [[-2.2, 0.18], [-1.97, 0.19], [-1.0, 0.3], [0, 0.4], [1.0, 0.48], [1.9, 0.56], [2.2, 0.56]],
    sh: [[-2.2, 0.2], [-1.9, 0.22], [-1.3, 0.2], [-0.6, 0.26], [0.2, 0.24], [1.2, 0.22], [2.0, 0.22], [2.2, 0.2]],
    tuck: [[-2.2, 0.04], [-1.8, 0.06], [0, 0.08], [1.8, 0.06], [2.2, 0.04]],
    flare: [0.015, 0.02], rise: [0.3, 0.12], cover: 0.18,
    brush: (r, z) => (underCabin(z) && (r === 'top' || r === 'stripe' || r === 'center') ? INTERIOR : STD[r]),
    capFront: PAINT, capBack: PAINT,
  });
  hull.build(b);

  // Cockpit fechado estreito em gota e a tampa do motor que desce até a asa.
  const c0 = hull.cabinEnd(C0); const c1 = hull.cabinBase(-0.36); const c2 = hull.cabinBase(0.3); const c3 = hull.cabinEnd(C3);
  const cab: CabinSpec = {
    secs: [c0, { ...c1, hwt: 0.45, yt: 1.03, crown: 0.04 }, { ...c2, hwt: 0.42, yt: 1.01, crown: 0.04 }, c3],
    top: (gap, region) => (gap === 0 ? GLASS_TINT : region === 'stripe' ? STRIPE_A : PAINT),
    side: (gap) => (gap === 2 ? PAINT : GLASS_TINT),
    stripe: [PROTOTYPE_STRIPE_A[1], PROTOTYPE_STRIPE_A[0]], edge: 0.08, glint: GLINT_SOFT,
  };
  buildCabin(b, cab);
  b.mirrored(() => beam(b, [c0.hwb, c0.yb + 0.01, C0], cabinGlassTop(cab, -0.3), 0.045, 0.035, CARBON));
  glassGlints(b, { z: c0.z, y: c0.yb, hw: c0.hwb }, { z: c1.z, y: 1.03, hw: 0.42 }, -1, GLINT_SKY, 0.03);
  // Barbatana de tubarão do teto até a asa.
  extrudeZY(b, [[0.25, 1.0], [2.0, 1.02], [2.0, 0.74], [1.2, 0.7]], -0.012, 0.012, ACCENT);
  mirrors(b, 0.74, c1.yb + 0.1, -0.7, PAINT, 0.8);
  b.fine(() => topPatch(b, hull, [[0.36, 1.5], [0.66, 1.5], [0.66, 1.92], [0.36, 1.92]], TRIM, 0.006));

  // Lateral: a entrada atrás da roda dianteira, o painel de número redondo e a lâmina de acento na saia.
  sideDecal(b, hull, [[-0.95, 0.17], [-0.35, 0.17], [-0.35, 0.29], [-0.9, 0.28]], GRILLE, 0.012);
  const disc: Array<[number, number]> = Array.from({ length: 10 }, (_, k) => [0.2 + Math.cos((k / 10) * Math.PI * 2) * 0.17, 0.25 + Math.sin((k / 10) * Math.PI * 2) * 0.075]);
  sideDecal(b, hull, disc, WHITE, 0.014);
  sideLine(b, hull, [[-1.0, 0.13], [1.0, 0.14]], 0.03, ACCENT, 0.02);

  // Frente: faróis em fenda no bico (um projetor em leque por lado), entradas, divisor largo.
  const nose = (x: number, y: number): P3 => [x, y, hull.endZ(x, y, 'front') - 0.012];
  endDecal(b, hull, 'front', 0.36, 0.84, (t) => 0.21 + 0.02 * t, (t) => 0.285 + 0.02 * t, 0.008, PIANO, b.lod ? 2 : 4);
  b.mirrored(() => lensRect(b, [nose(0.4, 0.225), nose(0.8, 0.24), nose(0.8, 0.275), nose(0.4, 0.26)], [0, 0, -1], HEAD, 0.002));
  b.fine(() => {
    meshGrille(b, hull, 'front', 0, 0.3, 0.14, 0.24, 2, GRILLE, TRIM_SOFT);
    endDecal(b, hull, 'front', 0.5, 0.84, () => 0.14, () => 0.19, 0.012, GRILLE, 3);
  });
  splitter(b, 0.1, -2.14, 1.82, 0.2, CARBON);

  // Traseira-vitrine: painel preto, a faixa de lanternas embutidas (3 por lado), o escape central largo, o difusor e a asa em pescoço de cisne.
  endDecal(b, hull, 'back', 0, 0.9, () => 0.44, () => 0.74, 0.006, PIANO, b.lod ? 3 : 8);
  b.mirrored(() => boxLamp(b, hull, { x0: 0.12, x1: 0.88, y0: 0.54, y1: 0.72, cells: 3, protrude: 0.045, recess: 0.03 }, TAIL, PIANO, TAIL_WELL));
  const rear = buildRear(b, {
    exhausts: [{ x: 0, y: 0.44, z: 2.24, r: 0.085, len: 0.15 }],
    diffuser: { y: 0.2, z: 2.1, w: 1.6, fins: 8, fin: CARBON },
    wing: { z: 2.0, y: 0.98, span: 1.84, chord: 0.38, thick: 0.07, pitch: -0.12, brush: ACCENT, plate: ACCENT, strut: 'swan', baseY: 0.72, strutX: 0.3, strutBrush: CARBON },
  });
  calipers(b, axles);
  return finish('prototype', b, { wheel: 'center', axles, exhausts: rear.exhausts.map(exhaustPoint), rear, liveries: [LIVERY_A | LIVERY_B, LIVERY_B] });
}
