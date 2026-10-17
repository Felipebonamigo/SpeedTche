// Hot hatch no estilo HCT "rodada 2" (V2, docs/ondas/V2-estilos.md; referências de forma: Golf GTI, Renault Clio Williams, Civic Type R): compacto e alto, capô
// curto, cabine que vai até o fim do carro e cai quase vertical na tampa, aerofólio de teto de acento com abas, para-lamas alargados com borda preta, rodas
// grandes nos cantos. Casco por linhas (`Hull`); vidro escuro. Frente: faróis de canto retangulares em leque, grade colmeia com o friso de acento, piscas
// laterais âmbar e milhas redondos embutidos. A traseira é a estrela: duas lanternas grandes nos cantos da tampa EMBUTIDAS (moldura que sobra 4,5 cm, lente
// acesa no fundo com miolo e borda), placa, difusor e o escape central duplo. Faixas: A = duas faixas do capô ao teto; B = no vinco da cintura. Mesmos eixos,
// pegada, escapes, roda e pinturas de antes.
import { buildCabin, cabinGlassTop, type Axle, type CabinSpec, type Region } from '../body';
import { mirrors, plate, splitter } from '../details';
import { Hull } from '../hull';
import { beam, box, MeshBuilder, roundBar, type Brush, type Lod, type P3 } from '../kit';
import { finish, type CarModel } from '../model';
import { ACCENT, AMBER, GLASS_TINT, GLINT_SKY, GLINT_SOFT, GRILLE, HEAD, HEAD_HOUSING, INTERIOR, LIVERY_A, LIVERY_B, PAINT, PIANO, STRIPE_A, STRIPE_B, TAIL, TAIL_WELL, TRIM, TRIM_SOFT, UNDER } from '../paints';
import { buildRear, exhaustPoint } from '../rear';
import { boxLamp, endDecal, glassGlints, lensRect, meshGrille, recessedLamp } from '../shaped';

export const HATCH_STRIPE_A: readonly [number, number] = [0.06, 0.38];
/** A cabine, em z: a base do para-brisa e o fim do vidro de trás (quase vertical). */
export const HATCH_CABIN: readonly [number, number] = [-0.95, 2.05];

export function buildHatch(lod: Lod = 0): CarModel {
  const b = new MeshBuilder(lod);
  // Rodas grandes nos cantos (entre-eixos longo, balanços curtos) e para-lamas alargados com borda preta.
  const axles: [Axle, Axle] = [{ z: -1.34, r: 0.42, x: 0.79, w: 0.32 }, { z: 1.38, r: 0.42, x: 0.79, w: 0.32 }];
  const [C0, C4] = HATCH_CABIN;
  const underCabin = (z: number): boolean => z > C0 + 0.02 && z < C4 - 0.02;
  const STD: Record<Region, Brush> = { under: UNDER, well: UNDER, sill: TRIM, lower: PAINT, band: STRIPE_B, upper: PAINT, shoulder: PAINT, top: PAINT, stripe: STRIPE_A, center: PAINT };
  const hull = new Hull({
    lod,
    zs: [-2.08, -2.05, -1.98, -1.9, -1.78, -1.55, -1.0, -0.4, 0.3, 0.8, 1.15, 1.65, 1.85, 1.98, 2.04, 2.08],
    axles, lift: 0.12, stripe: [HATCH_STRIPE_A[1], HATCH_STRIPE_A[0]], band: 0.05, clear: 0.05, crisp: true, detail: { facets: 9, fine: true },
    yb: [[-2.08, 0.3], [-1.94, 0.23], [-1.6, 0.21], [1.6, 0.22], [1.92, 0.27], [2.08, 0.33]],
    yt: [[-2.08, 0.66], [-1.94, 0.73], [-1.5, 0.79], [-0.9, 0.85], [1.2, 0.93], [1.92, 0.96], [2.08, 0.95]],
    crown: [[-2.08, 0], [-1.94, 0.02], [-1.5, 0.03], [1.5, 0.025], [2.08, 0]],
    hw: [[-2.08, 0.84], [-2.0, 0.88], [-1.94, 0.89], [-1.5, 0.9], [0, 0.9], [1.2, 0.9], [1.92, 0.88], [2.08, 0.84]],
    yc: [[-2.08, 0.46], [-1.9, 0.5], [-1.0, 0.57], [0, 0.63], [1.0, 0.68], [1.9, 0.72], [2.08, 0.72]],
    sh: [[-2.08, 0.1], [-1.5, 0.11], [0, 0.11], [1.9, 0.1], [2.08, 0.1]],
    tuck: [[-2.08, 0.05], [-1.8, 0.07], [0, 0.09], [1.8, 0.07], [2.08, 0.05]],
    flare: [0.06, 0.06], rise: [0.03, 0.03],
    brush: (r, z, inArch) => (underCabin(z) && (r === 'top' || r === 'stripe' || r === 'center') ? INTERIOR : inArch && (r === 'sill' || r === 'lower') ? TRIM : STD[r]),
    capFront: PAINT, capBack: PAINT,
  });
  hull.build(b);

  // Cabine alta que desce em curva até a tampa quase vertical: para-brisa, teto (faixa A), o teto que cai (pintado) e o vidro de trás.
  const c0 = hull.cabinEnd(C0); const c1 = hull.cabinBase(-0.22); const c2 = hull.cabinBase(1.3); const c3 = hull.cabinBase(1.72); const c4 = hull.cabinEnd(C4);
  const cab: CabinSpec = {
    secs: [c0, { ...c1, hwt: 0.68, yt: 1.37, crown: 0.03 }, { ...c2, hwt: 0.67, yt: 1.35, crown: 0.03 }, { ...c3, hwt: 0.66, yt: 1.28, crown: 0.03 }, c4],
    top: (gap, region) => (gap === 1 ? (region === 'stripe' ? STRIPE_A : PAINT) : gap === 2 ? PAINT : GLASS_TINT),
    side: (gap) => (gap >= 2 ? PAINT : GLASS_TINT),
    stripe: [HATCH_STRIPE_A[1], HATCH_STRIPE_A[0]], edge: 0.05, glint: GLINT_SOFT,
  };
  buildCabin(b, cab);
  b.mirrored(() => {
    beam(b, [c0.hwb, c0.yb + 0.01, C0], cabinGlassTop(cab, -0.26), 0.06, 0.04, TRIM_SOFT);
    beam(b, [c2.hwb, c2.yb, 0.5], cabinGlassTop(cab, 0.5), 0.08, 0.03, TRIM_SOFT);
  });
  glassGlints(b, { z: c0.z, y: c0.yb, hw: c0.hwb }, { z: c1.z, y: 1.37, hw: 0.64 }, -1, GLINT_SKY, 0.03);
  mirrors(b, 0.86, c1.yb + 0.1, -0.62, PAINT);

  // Frente: faróis de canto retangulares em leque, grade colmeia com o friso de acento, entrada inferior, milhas redondos embutidos e os piscas laterais.
  const nose = (x: number, y: number): P3 => [x, y, hull.endZ(x, y, 'front') - 0.012];
  endDecal(b, hull, 'front', 0.36, 0.84, () => 0.56, () => 0.7, 0.008, PIANO, b.lod ? 2 : 4);
  b.mirrored(() => lensRect(b, [nose(0.44, 0.57), nose(0.84, 0.58), nose(0.84, 0.7), nose(0.44, 0.69)], [0, 0, -1], HEAD, 0.002));
  b.fine(() => {
    endDecal(b, hull, 'front', 0, 0.38, () => 0.54, () => 0.68, 0.012, GRILLE, 3);
    meshGrille(b, hull, 'front', 0, 0.36, 0.56, 0.66, 2, GRILLE, TRIM_SOFT);
    endDecal(b, hull, 'front', 0, 0.38, () => 0.605, () => 0.625, 0.02, ACCENT, 3);
  });
  roundBar(b, [0, 0.33, -2.1], [1.2, 0.13, 0.06], GRILLE, { r: 0.05, axis: 'z' });
  splitter(b, 0.2, -2.06, 1.5, 0.16);
  b.mirrored(() => recessedLamp(b, { x: 0.66, y: 0.36, z: hull.endZ(0.66, 0.36, 'front') - 0.006, rOuter: 0.07, rLens: 0.055, protrude: 0.03, recess: 0.02 }, 'front', HEAD, TRIM, HEAD_HOUSING, 8));
  b.mirrored(() => box(b, [0.9, 0.6, -1.9], [0.04, 0.05, 0.1], AMBER));

  // Traseira-vitrine: lanternas grandes nos cantos da tampa embutidas, placa, difusor, escape central duplo largo e o aerofólio de teto (acento, com as abas).
  endDecal(b, hull, 'back', 0, 0.86, () => 0.6, () => 0.94, 0.006, PIANO, b.lod ? 3 : 8);
  b.mirrored(() => boxLamp(b, hull, { x0: 0.42, x1: 0.86, y0: 0.66, y1: 0.92, cells: 1, protrude: 0.045, recess: 0.03 }, TAIL, PIANO, TAIL_WELL));
  plate(b, 0.6, hull.zBack + 0.012);
  roundBar(b, [0, 0.31, 2.06], [1.3, 0.12, 0.1], TRIM, { r: 0.04 });
  const rear = buildRear(b, {
    exhausts: [{ x: 0.17, y: 0.3, z: 2.16, r: 0.07 }, { x: -0.17, y: 0.3, z: 2.16, r: 0.07 }],
    diffuser: { y: 0.27, z: 2.0, w: 1.2, fins: 5 },
    wing: { z: 1.8, y: 1.4, span: 1.36, chord: 0.42, thick: 0.07, pitch: 0.12, brush: ACCENT, plate: ACCENT, strut: null },
  });
  return finish('hatch', b, { wheel: 'multi', axles, exhausts: rear.exhausts.map(exhaustPoint), rear, liveries: [LIVERY_B, LIVERY_A] });
}
