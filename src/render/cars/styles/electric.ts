// Elétrico no estilo HCT "rodada 2" (V2, docs/ondas/V2-estilos.md; referências de forma: Tesla Model S, Porsche Taycan, Lucid Air): fastback liso num arco só,
// bico fechado (sem grade) com a faixa de luz diurna de ponta a ponta e faróis finos em leque nas pontas, ombros arredondados, teto de vidro inteiro, maçanetas
// embutidas, sem escapamento (a chama do nitro sai dos bocais do difusor) e rodas aerodinâmicas de disco. Casco por linhas (`Hull`). A traseira é a estrela: a
// faixa de lanterna de ponta a ponta feita de quatro lentes retangulares EMBUTIDAS (moldura que sobra 4,5 cm, lente acesa no fundo com miolo e borda), o
// difusor com aletas e a asinha. Faixas: A = duas faixas no capô e na tampa (o teto é de vidro); B = no vinco da cintura. Mesmos eixos, pegada, bocais, roda e
// pinturas de antes.
import { buildCabin, cabinGlassTop, type Axle, type CabinSpec, type Region } from '../body';
import { mirrors } from '../details';
import { Hull } from '../hull';
import { beam, MeshBuilder, roundBar, type Brush, type Lod, type P3 } from '../kit';
import { finish, type CarModel } from '../model';
import { DRL, GLASS_DARK, GLASS_TINT, GLINT_SKY, GLINT_SOFT, HEAD, INTERIOR, LIVERY_B, PAINT, PIANO, STRIPE_A, STRIPE_B, TAIL, TAIL_WELL, TRIM, TRIM_SOFT, UNDER } from '../paints';
import { buildRear, exhaustPoint } from '../rear';
import { boxLamp, doorHandle, endDecal, glassGlints, lensRect } from '../shaped';

export const ELECTRIC_STRIPE_A: readonly [number, number] = [0.06, 0.48];
/** A cabine, em z: a base do para-brisa e o fim do vidro de trás. */
export const ELECTRIC_CABIN: readonly [number, number] = [-0.98, 1.95];

export function buildElectric(lod: Lod = 0): CarModel {
  const b = new MeshBuilder(lod);
  const axles: [Axle, Axle] = [{ z: -1.4, r: 0.43, x: 0.79, w: 0.31 }, { z: 1.36, r: 0.43, x: 0.79, w: 0.31 }];
  const [C0, C3] = ELECTRIC_CABIN;
  const underCabin = (z: number): boolean => z > C0 + 0.02 && z < C3 - 0.02;
  const STD: Record<Region, Brush> = { under: UNDER, well: UNDER, sill: TRIM_SOFT, lower: PAINT, band: STRIPE_B, upper: PAINT, shoulder: PAINT, top: PAINT, stripe: STRIPE_A, center: PAINT };
  const hull = new Hull({
    lod,
    zs: [-2.2, -2.17, -2.1, -2.0, -1.85, -1.65, -1.0, -0.4, 0.3, 0.9, 1.2, 1.7, 1.95, 2.08, 2.16, 2.2],
    axles, lift: 0.55, stripe: [ELECTRIC_STRIPE_A[1], ELECTRIC_STRIPE_A[0]], band: 0.04, detail: { facets: 9, fine: true },
    yb: [[-2.2, 0.28], [-2.02, 0.2], [-1.5, 0.18], [1.5, 0.19], [2.05, 0.27], [2.2, 0.35]],
    yt: [[-2.2, 0.52], [-2.02, 0.63], [-1.5, 0.71], [-0.9, 0.77], [0.8, 0.83], [1.6, 0.87], [2.05, 0.87], [2.2, 0.84]],
    crown: [[-2.2, 0], [-2.02, 0.03], [-1.5, 0.05], [-0.9, 0.05], [0.8, 0.04], [2.05, 0.03], [2.2, 0]],
    hw: [[-2.2, 0.8], [-2.14, 0.86], [-2.02, 0.9], [-1.5, 0.93], [0, 0.93], [1.6, 0.93], [2.05, 0.88], [2.2, 0.8]],
    yc: [[-2.2, 0.38], [-2.0, 0.42], [-1.0, 0.5], [0, 0.57], [1.0, 0.63], [1.9, 0.68], [2.2, 0.68]],
    sh: [[-2.2, 0.2], [-1.5, 0.17], [0.8, 0.16], [1.7, 0.17], [2.2, 0.2]],
    tuck: [[-2.2, 0.08], [-1.8, 0.09], [0, 0.1], [1.8, 0.09], [2.2, 0.08]],
    flare: [0.015, 0.02], rise: [0.06, 0.05],
    brush: (r, z) => (underCabin(z) && (r === 'top' || r === 'stripe' || r === 'center') ? INTERIOR : STD[r]),
    capFront: PAINT, capBack: PAINT,
  });
  hull.build(b);

  // Teto de vidro inteiro: da base do para-brisa ao fim do vidro traseiro, uma peça escura só; as colunas são finas, na cor do carro.
  const c0 = hull.cabinEnd(C0); const c1 = hull.cabinBase(-0.12); const c2 = hull.cabinBase(0.6); const c3 = hull.cabinEnd(C3);
  const cab: CabinSpec = {
    secs: [c0, { ...c1, hwt: 0.62, yt: 1.34, crown: 0.05 }, { ...c2, hwt: 0.6, yt: 1.32, crown: 0.05 }, c3],
    top: (gap) => (gap === 1 ? GLASS_DARK : GLASS_TINT),
    side: () => GLASS_TINT,
    edge: 0.08, glint: GLINT_SOFT,
  };
  buildCabin(b, cab);
  const ga = cabinGlassTop(cab, -0.16); const gb = cabinGlassTop(cab, 0.64);
  b.mirrored(() => {
    beam(b, [c0.hwb, c0.yb + 0.01, C0 + 0.02], ga, 0.06, 0.035, PAINT);
    beam(b, ga, gb, 0.05, 0.035, PAINT);
    beam(b, gb, [c3.hwb, c3.yb + 0.01, C3 - 0.02], 0.06, 0.035, PAINT);
  });
  glassGlints(b, { z: c0.z, y: c0.yb, hw: c0.hwb }, { z: c1.z, y: 1.34, hw: 0.58 }, -1, GLINT_SKY, 0.04);
  mirrors(b, 0.85, c1.yb + 0.1, -0.66, PAINT, 0.9);
  // Maçanetas embutidas.
  b.fine(() => { doorHandle(b, hull, -0.25, hull.creaseY(-0.25) - 0.1, TRIM); doorHandle(b, hull, 0.55, hull.creaseY(0.55) - 0.1, TRIM); });

  // Frente: bico fechado — a faixa de luz diurna e os faróis finos em leque (nas pontas), entrada inferior estreita.
  const nose = (x: number, y: number): P3 => [x, y, hull.endZ(x, y, 'front') - 0.012];
  endDecal(b, hull, 'front', 0, 0.86, () => 0.52, () => 0.68, 0.008, PIANO, b.lod ? 2 : 4);
  b.mirrored(() => {
    lensRect(b, [nose(0.02, 0.585), nose(0.5, 0.585), nose(0.5, 0.615), nose(0.02, 0.615)], [0, 0, -1], DRL, 0.002);
    lensRect(b, [nose(0.52, 0.56), nose(0.84, 0.575), nose(0.84, 0.66), nose(0.52, 0.65)], [0, 0, -1], HEAD, 0.002);
  });
  roundBar(b, [0, 0.3, -2.18], [1.0, 0.06, 0.06], TRIM, { r: 0.03 });

  // Traseira-vitrine: faixa de lanterna de ponta a ponta (quatro lentes embutidas), difusor com aletas, bocais do jato e a asinha.
  endDecal(b, hull, 'back', 0, 0.9, () => 0.6, () => 0.82, 0.006, PIANO, b.lod ? 3 : 8);
  b.mirrored(() => boxLamp(b, hull, { x0: 0.02, x1: 0.88, y0: 0.66, y1: 0.8, cells: 2, protrude: 0.045, recess: 0.03 }, TAIL, PIANO, TAIL_WELL));
  const rear = buildRear(b, {
    exhausts: [{ x: 0.3, y: 0.3, z: 2.24, r: 0.075 }, { x: -0.3, y: 0.3, z: 2.24, r: 0.075 }],
    diffuser: { y: 0.25, z: 2.08, w: 1.3, fins: 6 },
    wing: { z: 2.02, y: 1.0, span: 1.4, chord: 0.3, thick: 0.06, pitch: -0.1, brush: PAINT, plate: PAINT, strut: 'post', baseY: 0.88, strutX: 0.5, stripe: { x: ELECTRIC_STRIPE_A, brush: STRIPE_A } },
  });
  return finish('electric', b, { wheel: 'aero', axles, exhausts: rear.exhausts.map(exhaustPoint), rear, liveries: [LIVERY_B, 0] });
}
