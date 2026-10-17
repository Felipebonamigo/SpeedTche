// Picape no estilo HCT "rodada 2" (V2, docs/ondas/V2-estilos.md; referências de forma: Toyota Hilux, Ford F-150, Chevrolet S10): alta e quadrada, cabine simples
// de vidro escuro e caçamba aberta (fundo e paredes de dentro, caixas das rodas), santantônio com quatro faróis de milha, grade cromada grande, para-choques
// cromados grossos, para-lamas de plástico preto. Casco por linhas (`Hull`): lateral reta de vinco alto subindo para trás, caçamba sem as faces de cima. Frente:
// faróis retangulares em leque. A traseira é a estrela: duas lanternas verticais grandes nos cantos EMBUTIDAS (moldura que sobra 4,5 cm, lente acesa no fundo
// com miolo e borda), para-choque cromado com engate, escape de lado largo e protetor inferior. Faixas: A = duas faixas do capô ao teto; B = no vinco da cintura.
// Mesmos eixos, pegada, escape, roda de aço e pinturas de antes.
import { buildCabin, cabinGlassTop, type Axle, type CabinSpec, type Region } from '../body';
import { grille, mirrors, plate, roundLampPair } from '../details';
import { Hull } from '../hull';
import { beam, box, insideBox, MeshBuilder, roundBar, type Brush, type Lod, type P3 } from '../kit';
import { finish, type CarModel } from '../model';
import {
  AMBER, CHROME, GLASS_TINT, GLINT_SKY, GLINT_SOFT, HEAD, LIVERY_A, LIVERY_B, PAINT, PIANO, STRIPE_A, STRIPE_B, TAIL, TAIL_WELL, TRIM, TRIM_SOFT, UNDER,
} from '../paints';
import { buildRear, exhaustPoint } from '../rear';
import { boxLamp, endDecal, glassGlints, lensRect } from '../shaped';

export const PICKUP_STRIPE_A: readonly [number, number] = [0.06, 0.34];
const BED0 = 0.44; // começo da caçamba (atrás da cabine)
const BED1 = 2.1; // fim (tampa)
const FLOOR = 0.8;
const RAIL = 1.06;

export function buildPickup(lod: Lod = 0): CarModel {
  const b = new MeshBuilder(lod);
  const axles: [Axle, Axle] = [{ z: -1.35, r: 0.45, x: 0.77, w: 0.34 }, { z: 1.32, r: 0.45, x: 0.77, w: 0.34 }];
  const STD: Record<Region, Brush> = { under: UNDER, well: UNDER, sill: TRIM, lower: PAINT, band: STRIPE_B, upper: PAINT, shoulder: PAINT, top: PAINT, stripe: STRIPE_A, center: PAINT };
  const hull = new Hull({
    lod,
    zs: [-2.2, -2.17, -2.1, -2.0, -1.85, -1.6, -1.0, -0.4, BED0, 0.8, 1.15, 1.7, BED1, 2.15, 2.18, 2.2],
    axles, lift: 0.05, stripe: [PICKUP_STRIPE_A[1], PICKUP_STRIPE_A[0]], band: 0.07, clear: 0.07, cover: 0.04, crisp: true, detail: { facets: 10, fine: true },
    yb: [[-2.2, 0.46], [-2.08, 0.43], [-1.8, 0.42], [1.8, 0.43], [2.2, 0.45]],
    yt: [[-2.2, 0.98], [-2.08, 1.01], [-0.8, 1.03], [BED0, RAIL], [BED1, RAIL], [2.2, RAIL - 0.02]],
    crown: [[-2.2, 0], [-2.08, 0.012], [-0.8, 0.02], [BED0, 0], [2.2, 0]],
    hw: [[-2.2, 0.88], [-2.14, 0.9], [-2.08, 0.91], [0, 0.91], [BED1, 0.91], [2.2, 0.9]],
    yc: [[-2.2, 0.62], [-2.0, 0.65], [-1.0, 0.7], [0, 0.76], [1.0, 0.82], [1.9, 0.86], [2.2, 0.86]],
    sh: [[-2.2, 0.07], [0, 0.07], [2.2, 0.07]],
    tuck: [[-2.2, 0.04], [-1.8, 0.06], [0, 0.08], [1.8, 0.06], [2.2, 0.04]],
    flare: [0.05, 0.05], rise: [0.03, 0.03],
    // Caçamba: sem as faces de cima entre as paredes (o interior é desenhado à parte).
    brush: (r, z, inArch) => {
      if (z > BED0 && z < BED1 && (r === 'top' || r === 'stripe' || r === 'center')) return null;
      if (inArch && (r === 'sill' || r === 'lower')) return TRIM;
      return STD[r];
    },
    capFront: PAINT, capBack: PAINT,
  });
  hull.build(b);
  // Interior da caçamba: fundo, paredes e as caixas das rodas.
  const inner = hull.topHalf(1.0) - 0.005;
  insideBox(b, [0, (FLOOR + RAIL) / 2 + 0.01, (BED0 + BED1) / 2], [inner * 2, RAIL - FLOOR, BED1 - BED0], TRIM_SOFT, { nv: UNDER });
  b.mirrored(() => box(b, [inner - 0.14, FLOOR + 0.07, axles[1].z], [0.28, 0.14, 0.9], TRIM_SOFT));

  // Cabine alta de vidro escuro com o vidro traseiro quase vertical; a parede de trás é a tampa no contorno da cabine.
  const c0 = hull.cabinEnd(-0.98); const c1 = hull.cabinBase(-0.45); const c2 = hull.cabinBase(BED0 - 0.02);
  const cab: CabinSpec = {
    secs: [c0, { ...c1, hwt: 0.72, yt: 1.72, crown: 0.03 }, { ...c2, hwt: 0.72, yt: 1.72, crown: 0.03 }],
    top: (gap, region) => (gap === 1 ? (region === 'stripe' ? STRIPE_A : PAINT) : GLASS_TINT),
    side: () => GLASS_TINT,
    stripe: [PICKUP_STRIPE_A[1], PICKUP_STRIPE_A[0]], edge: 0.06, glint: GLINT_SOFT, capBack: PAINT,
  };
  buildCabin(b, cab);
  box(b, [0, 1.47, BED0 - 0.005], [1.1, 0.3, 0.02], GLASS_TINT); // vidro traseiro
  b.mirrored(() => {
    beam(b, [c0.hwb, c0.yb + 0.01, -0.96], cabinGlassTop(cab, -0.49), 0.07, 0.04, PAINT);
    beam(b, [c1.hwb + 0.01, c1.yb + 0.02, -0.05], cabinGlassTop(cab, -0.05), 0.08, 0.03, TRIM_SOFT);
  });
  glassGlints(b, { z: c0.z, y: c0.yb, hw: c0.hwb }, { z: c1.z, y: 1.72, hw: 0.68 }, -1, GLINT_SKY, 0.03);
  // Santantônio com quatro faróis de milha.
  b.mirrored(() => {
    beam(b, [0.7, RAIL, BED0 + 0.1], [0.64, 1.78, BED0 + 0.1], 0.06, 0.06, TRIM);
    beam(b, [0.64, 1.74, BED0 + 0.12], [0.8, RAIL + 0.01, BED0 + 0.75], 0.05, 0.05, TRIM); // escora até a borda
  });
  beam(b, [-0.67, 1.78, BED0 + 0.1], [0.67, 1.78, BED0 + 0.1], 0.07, 0.06, TRIM);
  roundLampPair(b, 0.18, 1.84, BED0 + 0.02, 0.07, HEAD, true, TRIM, 0.07, 10);
  roundLampPair(b, 0.46, 1.84, BED0 + 0.02, 0.07, HEAD, true, TRIM, 0.07, 10);

  // Frente: grade cromada grande, faróis retangulares em leque, para-choque cromado grosso, protetor inferior.
  const nose = (x: number, y: number): P3 => [x, y, hull.endZ(x, y, 'front') - 0.012];
  endDecal(b, hull, 'front', 0.44, 0.9, () => 0.72, () => 0.9, 0.008, PIANO, b.lod ? 2 : 4);
  b.mirrored(() => lensRect(b, [nose(0.5, 0.73), nose(0.88, 0.73), nose(0.88, 0.88), nose(0.5, 0.88)], [0, 0, -1], HEAD, 0.002));
  grille(b, 0.78, -2.21, 0.86, 0.32, CHROME, 3, CHROME);
  b.mirrored(() => box(b, [0.72, 0.62, -2.2], [0.24, 0.06, 0.05], AMBER));
  roundBar(b, [0, 0.5, -2.22], [1.84, 0.16, 0.12], CHROME, { r: 0.05 });
  box(b, [0, 0.38, -2.12], [1.1, 0.06, 0.2], TRIM);
  plate(b, 0.5, -2.29);
  mirrors(b, 0.87, 1.2, -0.72, TRIM, 1.1);

  // Traseira-vitrine: lanternas verticais grandes nos cantos embutidas, para-choque cromado com engate, escape de lado largo e protetor inferior.
  endDecal(b, hull, 'back', 0.2, 0.92, () => 0.55, () => 1.03, 0.006, PIANO, b.lod ? 3 : 8);
  b.mirrored(() => boxLamp(b, hull, { x0: 0.62, x1: 0.9, y0: 0.6, y1: 1.02, cells: 1, protrude: 0.045, recess: 0.03 }, TAIL, PIANO, TAIL_WELL));
  roundBar(b, [0, 0.5, 2.22], [1.84, 0.14, 0.12], CHROME, { r: 0.05 });
  box(b, [0, 0.43, 2.3], [0.08, 0.06, 0.08], TRIM);
  plate(b, 0.7, 2.21);
  const rear = buildRear(b, {
    exhausts: [{ x: -0.62, y: 0.4, z: 2.2, r: 0.085, len: 0.25 }],
    diffuser: { y: 0.37, z: 2.06, w: 1.0, fins: 4 },
  });
  return finish('pickup', b, { wheel: 'steel', axles, exhausts: rear.exhausts.map(exhaustPoint), rear, liveries: [LIVERY_B, LIVERY_A] });
}
