// Carro de rali no estilo HCT "rodada 2" (V2, docs/ondas/V2-estilos.md; referências de forma: Lancia Delta Integrale, Subaru Impreza WRC, Ford Escort
// Cosworth): hatch quadrado e alto de suspensão levantada. Casco por linhas (`Hull`): lateral reta de vinco seco subindo para trás, para-lamas
// ALARGADOS em caixa com a borda preta no arco, cabine alta de vidro escuro com a tomada de ar no teto, para-barros, painel de número nas portas. Frente:
// os dois faróis retangulares em leque e a barra com QUATRO faróis de milha redondos embutidos (acendem à noite). A traseira é a estrela: duas lanternas
// retangulares altas por lado EMBUTIDAS (moldura que sobra 4,5 cm, lente acesa no fundo com miolo e borda), para-choque preto, escape único grosso, difusor
// e o aerofólio grande de acento. Faixas: A = duas faixas do capô à tampa; B = no vinco da cintura. Mesmos eixos, pegada, escape, roda e pinturas de antes.
import { buildCabin, cabinGlassTop, type Axle, type CabinSpec, type Region } from '../body';
import { mirrors } from '../details';
import { Hull } from '../hull';
import { beam, box, MeshBuilder, roundBar, roundBox, type Brush, type Lod, type P3 } from '../kit';
import { finish, type CarModel } from '../model';
import {
  ACCENT, GLASS_TINT, GLINT_SKY, GLINT_SOFT, GRILLE, HEAD, HEAD_HOUSING, INTERIOR, LIVERY_A, LIVERY_B, MUD, PAINT, PIANO, STRIPE_A, STRIPE_B, TAIL, TAIL_WELL,
  TRIM, TRIM_SOFT, UNDER, WHITE,
} from '../paints';
import { buildRear, exhaustPoint } from '../rear';
import { boxLamp, endDecal, glassGlints, lensRect, recessedLamp, sideDecal, sideLine } from '../shaped';

export const RALLY_STRIPE_A: readonly [number, number] = [0.08, 0.3];
/** A cabine, em z: a base do para-brisa e o fim do vidro de trás. */
export const RALLY_CABIN: readonly [number, number] = [-0.95, 1.97];

export function buildRally(lod: Lod = 0): CarModel {
  const b = new MeshBuilder(lod);
  const axles: [Axle, Axle] = [{ z: -1.3, r: 0.435, x: 0.8, w: 0.32 }, { z: 1.28, r: 0.435, x: 0.8, w: 0.32 }];
  const [C0, C3] = RALLY_CABIN;
  const underCabin = (z: number): boolean => z > C0 + 0.02 && z < C3 - 0.02;
  const STD: Record<Region, Brush> = { under: UNDER, well: UNDER, sill: TRIM, lower: PAINT, band: STRIPE_B, upper: PAINT, shoulder: PAINT, top: PAINT, stripe: STRIPE_A, center: PAINT };
  const hull = new Hull({
    lod,
    zs: [-2.15, -2.12, -2.05, -1.95, -1.8, -1.55, -1.0, -0.4, 0.3, 0.9, 1.2, 1.6, 1.85, 2.0, 2.08, 2.12],
    axles, lift: 0.1, stripe: [RALLY_STRIPE_A[1], RALLY_STRIPE_A[0]], band: 0.07, clear: 0.07, cover: 0.04, crisp: true, detail: { facets: 9, fine: true },
    yb: [[-2.15, 0.36], [-2.05, 0.33], [-1.8, 0.3], [1.8, 0.3], [2.05, 0.33], [2.12, 0.37]],
    yt: [[-2.15, 0.7], [-2.0, 0.76], [-1.4, 0.8], [-0.9, 0.85], [0.3, 0.9], [1.3, 0.93], [1.95, 0.97], [2.12, 0.96]],
    crown: [[-2.15, 0], [-2.0, 0.015], [-1.4, 0.025], [2, 0.02], [2.12, 0]],
    hw: [[-2.15, 0.84], [-2.1, 0.88], [-2.0, 0.9], [-1.4, 0.9], [0, 0.89], [1.3, 0.9], [2.0, 0.89], [2.12, 0.86]],
    yc: [[-2.15, 0.46], [-1.95, 0.5], [-1.0, 0.57], [0, 0.63], [1.0, 0.68], [1.9, 0.73], [2.12, 0.73]],
    sh: [[-2.15, 0.1], [-1.4, 0.08], [0, 0.08], [1.9, 0.08], [2.12, 0.09]],
    tuck: [[-2.15, 0.05], [-1.8, 0.07], [0, 0.09], [1.8, 0.07], [2.12, 0.05]],
    flare: [0.08, 0.08], rise: [0.03, 0.03],
    brush: (r, z, inArch) => (underCabin(z) && (r === 'top' || r === 'stripe' || r === 'center') ? INTERIOR : inArch && (r === 'sill' || r === 'lower') ? TRIM : STD[r]),
    capFront: PAINT, capBack: PAINT,
  });
  hull.build(b);

  // Cabine alta de vidro escuro: o teto é a faixa A, o para-brisa e o vidro de trás são de vidro, a coluna de trás é pintada.
  const c0 = hull.cabinEnd(C0); const c1 = hull.cabinBase(-0.28); const c2 = hull.cabinBase(1.5); const c3 = hull.cabinEnd(C3);
  const cab: CabinSpec = {
    secs: [c0, { ...c1, hwt: 0.7, yt: 1.36, crown: 0.02 }, { ...c2, hwt: 0.68, yt: 1.34, crown: 0.02 }, c3],
    top: (gap, region) => (gap === 1 ? (region === 'stripe' ? STRIPE_A : PAINT) : GLASS_TINT),
    side: (gap) => (gap === 2 ? PAINT : GLASS_TINT),
    stripe: [RALLY_STRIPE_A[1], RALLY_STRIPE_A[0]], edge: 0.05, glint: GLINT_SOFT,
  };
  buildCabin(b, cab);
  b.mirrored(() => {
    beam(b, [c0.hwb, c0.yb + 0.01, C0], cabinGlassTop(cab, -0.3), 0.06, 0.04, TRIM_SOFT);
    beam(b, [c3.hwb, c3.yb, C3 - 0.03], cabinGlassTop(cab, 1.6), 0.07, 0.03, TRIM_SOFT);
  });
  glassGlints(b, { z: c0.z, y: c0.yb, hw: c0.hwb }, { z: c1.z, y: 1.36, hw: 0.64 }, -1, GLINT_SKY, 0.02);
  // Tomada de ar no teto (caixa arredondada).
  roundBox(b, [0, 1.38, 0.1], [0.3, 0.08, 0.36], PAINT, 0.035, { nu: GRILLE });
  mirrors(b, 0.86, c1.yb + 0.1, -0.62, PAINT);

  // Lateral: painel de número nas portas (a faixa B passa por cima) e os para-barros atrás das rodas.
  sideDecal(b, hull, [[-0.2, 0.28], [0.6, 0.28], [0.6, 0.5], [-0.2, 0.5]], WHITE, 0.012);
  sideLine(b, hull, [[-0.95, 0.31], [1.0, 0.32]], 0.025, TRIM, 0.016);
  b.mirrored(() => { for (const a of axles) box(b, [0.8, 0.22, a.z + a.r + 0.14], [0.3, 0.26, 0.02], MUD); });

  // Frente: os dois faróis retangulares em leque, a grade, a barra com quatro faróis de milha embutidos (acendem à noite) e o gancho de reboque.
  const nose = (x: number, y: number): P3 => [x, y, hull.endZ(x, y, 'front') - 0.012];
  endDecal(b, hull, 'front', 0.44, 0.86, () => 0.6, () => 0.77, 0.008, PIANO, b.lod ? 2 : 4);
  b.mirrored(() => lensRect(b, [nose(0.48, 0.64), nose(0.82, 0.64), nose(0.82, 0.74), nose(0.48, 0.74)], [0, 0, -1], HEAD, 0.002));
  b.fine(() => endDecal(b, hull, 'front', 0, 0.4, () => 0.58, () => 0.72, 0.012, GRILLE, 3));
  roundBar(b, [0, 0.36, -2.18], [1.5, 0.14, 0.08], TRIM, { r: 0.035 });
  for (const x of [0.17, 0.44]) {
    b.mirrored(() => recessedLamp(b, { x, y: 0.48, z: hull.endZ(x, 0.48, 'front') - 0.008, rOuter: 0.085, rLens: 0.07, protrude: 0.04, recess: 0.03 }, 'front', HEAD, HEAD_HOUSING, TAIL_WELL, 12));
  }
  box(b, [0.45, 0.24, -2.2], [0.08, 0.06, 0.08], ACCENT);

  // Traseira-vitrine: duas lanternas retangulares altas por lado embutidas, para-choque preto, escape único grosso, difusor e o aerofólio de acento.
  endDecal(b, hull, 'back', 0, 0.88, () => 0.62, () => 0.98, 0.006, PIANO, b.lod ? 3 : 8);
  b.mirrored(() => boxLamp(b, hull, { x0: 0.38, x1: 0.85, y0: 0.72, y1: 0.95, cells: 2, protrude: 0.045, recess: 0.03 }, TAIL, PIANO, TAIL_WELL));
  roundBar(b, [0, 0.38, 2.14], [1.6, 0.14, 0.08], TRIM, { r: 0.035 });
  const rear = buildRear(b, {
    exhausts: [{ x: 0.55, y: 0.32, z: 2.22, r: 0.09, len: 0.2 }],
    diffuser: { y: 0.34, z: 2.0, w: 1.2, fins: 4 },
    wing: { z: 1.92, y: 1.26, span: 1.56, chord: 0.38, thick: 0.07, pitch: -0.16, brush: ACCENT, plate: ACCENT, strut: 'post', baseY: 1.0, strutX: 0.5 },
  });
  return finish('rally', b, { wheel: 'dish', axles, exhausts: rear.exhausts.map(exhaustPoint), rear, liveries: [LIVERY_A | LIVERY_B, LIVERY_B] });
}
