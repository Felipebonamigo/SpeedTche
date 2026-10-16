// Hipercarro no estilo HCT "rodada 2" (V2, docs/ondas/V2-gt.md; referências de forma: LaFerrari, McLaren P1, Pagani). Casco por linhas
// (`Hull`) muito baixo: bico rente ao chão entre para-lamas altos, cintura de garrafa (estreita nas portas, larga sobre as rodas de trás),
// cabine em gota bem avançada com para-brisa deitado e a tampa do motor longa e pintada, com venezianas por fora das faixas. Faróis em
// FENDA no bico (um projetor em leque por lado), entradas de ar enormes no flanco e a lâmina de acento na saia. A traseira é a estrela:
// painel preto, duas lanternas retangulares EMBUTIDAS por lado (moldura que sobra 4,5 cm, lente acesa no fundo com miolo e borda), grade
// de colmeia no meio, o escape central duplo de sempre, difusor de carbono de sete aletas e a asa em pescoço de cisne na cor de detalhe.
// Faixas: A = duas faixas do bico à cauda (capô, teto e tampa); B = no vinco da cintura, subindo para trás.
// Mesmos eixos, pegada, escapes, roda e pinturas do hipercarro de antes.
import { buildCabin, cabinGlassTop, type Axle, type CabinSpec, type Region } from '../body';
import { calipers, mirrors, splitter } from '../details';
import { Hull } from '../hull';
import { beam, MeshBuilder, type Brush, type Lod, type P3 } from '../kit';
import { finish, type CarModel } from '../model';
import {
  ACCENT, CARBON, GLASS_TINT, GLINT_SKY, GLINT_SOFT, GRILLE, HEAD, INTERIOR, LIVERY_A, LIVERY_B, PAINT, PIANO, STRIPE_A, STRIPE_B, TAIL, TAIL_WELL,
  TRIM, TRIM_SOFT, UNDER,
} from '../paints';
import { buildRear, exhaustPoint } from '../rear';
import { boxLamp, endDecal, glassGlints, lensRect, meshGrille, sideDecal, sideLine, topPatch } from '../shaped';

/** Faixa A (x de dentro, x de fora): as duas faixas do bico à cauda, no casco e no teto (a asa é da cor de detalhe). */
export const HYPER_STRIPE_A: readonly [number, number] = [0.08, 0.34];
/** A cabine, em z: a base do para-brisa e o fim da tampa do motor. */
export const HYPER_CABIN: readonly [number, number] = [-1.02, 1.45];

export function buildHyper(lod: Lod = 0): CarModel {
  const b = new MeshBuilder(lod);
  const axles: [Axle, Axle] = [{ z: -1.42, r: 0.44, x: 0.8, w: 0.32 }, { z: 1.38, r: 0.46, x: 0.79, w: 0.36 }];
  const [C0, C3] = HYPER_CABIN;
  const underCabin = (z: number): boolean => z > C0 + 0.02 && z < C3 - 0.02;
  const STD: Record<Region, Brush> = { under: UNDER, well: UNDER, sill: CARBON, lower: PAINT, band: STRIPE_B, upper: PAINT, shoulder: PAINT, top: PAINT, stripe: STRIPE_A, center: PAINT };
  const hull = new Hull({
    lod,
    zs: [-2.2, -2.17, -2.1, -2.0, -1.85, -1.6, -1.0, -0.4, 0.2, 0.8, 1.3, 1.7, 1.95, 2.08, 2.16, 2.2],
    axles, lift: 0.3, stripe: [HYPER_STRIPE_A[1], HYPER_STRIPE_A[0]], band: 0.06, clear: 0.05,
    yb: [[-2.2, 0.2], [-2.1, 0.15], [-1.9, 0.13], [1.9, 0.15], [2.1, 0.2], [2.2, 0.27]],
    yt: [[-2.2, 0.32], [-2.0, 0.39], [-1.6, 0.49], [-1.0, 0.59], [-0.2, 0.66], [0.8, 0.72], [1.6, 0.77], [2.0, 0.79], [2.2, 0.77]],
    crown: [[-2.2, 0], [-2.1, 0.01], [-1.5, 0.025], [-0.5, 0.03], [2, 0.03], [2.2, 0]],
    hw: [[-2.2, 0.74], [-2.14, 0.84], [-2.04, 0.9], [-1.85, 0.94], [-1.4, 0.95], [-0.7, 0.9], [0, 0.86], [0.6, 0.9], [1.3, 0.955], [1.9, 0.955], [2.1, 0.91], [2.2, 0.84]],
    yc: [[-2.2, 0.27], [-1.97, 0.3], [-1.0, 0.4], [0, 0.5], [1.0, 0.58], [1.9, 0.63], [2.2, 0.63]],
    sh: [[-2.2, 0.18], [-1.9, 0.24], [-1.3, 0.28], [-0.6, 0.2], [0.2, 0.14], [1.2, 0.18], [2.0, 0.18], [2.2, 0.15]],
    tuck: [[-2.2, 0.05], [-1.8, 0.08], [0, 0.13], [1.8, 0.09], [2.2, 0.06]],
    flare: [0.025, 0.04], rise: [0.04, 0.06],
    brush: (r, z) => (underCabin(z) && (r === 'top' || r === 'stripe' || r === 'center') ? INTERIOR : STD[r]),
    capFront: PAINT, capBack: PAINT,
  });
  hull.build(b);

  // Cabine em gota bem avançada: para-brisa muito deitado, teto curto e baixo, a tampa do motor pintada descendo até a traseira.
  const c0 = hull.cabinEnd(C0); const c1 = hull.cabinBase(-0.3); const c2 = hull.cabinBase(0.32); const c3 = hull.cabinEnd(C3);
  const cab: CabinSpec = {
    secs: [c0, { ...c1, hwt: 0.54, yt: 1.05, crown: 0.03 }, { ...c2, hwt: 0.5, yt: 1.03, crown: 0.03 }, c3],
    top: (gap, region) => (gap === 0 ? GLASS_TINT : region === 'stripe' ? STRIPE_A : PAINT),
    side: (gap) => (gap === 2 ? PAINT : GLASS_TINT),
    stripe: [HYPER_STRIPE_A[1], HYPER_STRIPE_A[0]], edge: 0.1, glint: GLINT_SOFT,
  };
  buildCabin(b, cab);
  b.mirrored(() => beam(b, [c0.hwb, c0.yb + 0.01, C0], cabinGlassTop(cab, -0.28), 0.05, 0.035, CARBON));
  glassGlints(b, { z: c0.z, y: c0.yb, hw: c0.hwb }, { z: c1.z, y: 1.05, hw: 0.5 }, -1, GLINT_SKY, 0.03);
  mirrors(b, 0.8, c1.yb + 0.12, -0.72, PAINT, 0.85);
  // Venezianas na tampa do motor, por fora das faixas.
  b.fine(() => {
    topPatch(b, hull, [[0.4, 1.5], [0.66, 1.5], [0.66, 1.92], [0.4, 1.92]], TRIM, 0.006);
    for (const z of [1.56, 1.64, 1.72, 1.8]) topPatch(b, hull, [[0.4, z], [0.66, z], [0.66, z + 0.025], [0.4, z + 0.025]], CARBON, 0.018);
  });

  // Lateral: a entrada de ar enorme antes da roda de trás (escura, com duas aletas de carbono), junta de porta e a lâmina de acento na saia.
  sideDecal(b, hull, [[0.05, 0.27], [0.92, 0.25], [0.92, 0.44], [0.3, 0.42]], GRILLE, 0.012);
  b.fine(() => {
    for (const z of [0.42, 0.68]) sideLine(b, hull, [[z, 0.27], [z + 0.06, 0.42]], 0.02, CARBON, 0.02);
    sideLine(b, hull, [[-0.72, 0.21], [-0.7, 0.46]], 0.012, TRIM);
  });
  sideLine(b, hull, [[-0.9, 0.205], [0.9, 0.215]], 0.035, ACCENT, 0.02);

  // Frente: faróis em fenda no bico (carcaça preta e um projetor em leque por lado), tomada central de colmeia, entradas nos cantos, tomadas
  // no capô por fora das faixas e o divisor de carbono.
  const nose = (x: number, y: number): P3 => [x, y, hull.endZ(x, y, 'front') - 0.012];
  endDecal(b, hull, 'front', 0.4, 0.8, (t) => 0.255 + 0.02 * t, (t) => 0.31 + 0.02 * t, 0.008, PIANO, b.lod ? 2 : 4);
  b.mirrored(() => lensRect(b, [nose(0.44, 0.27), nose(0.76, 0.288), nose(0.76, 0.318), nose(0.44, 0.3)], [0, 0, -1], HEAD, 0.002));
  b.fine(() => {
    meshGrille(b, hull, 'front', 0, 0.3, 0.17, 0.27, 2, GRILLE, TRIM_SOFT);
    endDecal(b, hull, 'front', 0.48, 0.78, () => 0.17, () => 0.23, 0.012, GRILLE, 3);
    topPatch(b, hull, [[0.42, -1.72], [0.6, -1.76], [0.62, -1.5], [0.44, -1.48]], TRIM, 0.008);
  });
  splitter(b, 0.13, -2.15, 1.7, 0.16, CARBON);

  // Traseira-vitrine: painel preto, duas lanternas embutidas por lado, grade de colmeia no meio (sobre o escape central), difusor de carbono e a
  // asa em pescoço de cisne.
  endDecal(b, hull, 'back', 0, 0.84, () => 0.4, () => 0.72, 0.006, PIANO, b.lod ? 3 : 8);
  b.mirrored(() => boxLamp(b, hull, { x0: 0.24, x1: 0.85, y0: 0.53, y1: 0.73, cells: 2, protrude: 0.045, recess: 0.03 }, TAIL, PIANO, TAIL_WELL));
  b.fine(() => meshGrille(b, hull, 'back', 0, 0.2, 0.55, 0.71, 3, TRIM, TRIM_SOFT));
  const rear = buildRear(b, {
    exhausts: [{ x: 0.13, y: 0.46, z: 2.25, r: 0.075, len: 0.15 }, { x: -0.13, y: 0.46, z: 2.25, r: 0.075, len: 0.15 }],
    diffuser: { y: 0.22, z: 2.1, w: 1.5, fins: 7, fin: CARBON },
    wing: { z: 1.98, y: 1.1, span: 1.76, chord: 0.4, thick: 0.07, pitch: -0.14, brush: ACCENT, plate: ACCENT, strut: 'swan', baseY: 0.8, strutX: 0.42, strutBrush: CARBON },
  });
  calipers(b, axles);
  return finish('hyper', b, { wheel: 'center', axles, exhausts: rear.exhausts.map(exhaustPoint), rear, liveries: [LIVERY_B, LIVERY_A] });
}
