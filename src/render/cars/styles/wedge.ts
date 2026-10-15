// Cunha dos anos 80 no estilo HCT "rodada 2" (V2, docs/ondas/V2-gt.md; referências de forma: Countach, Testarossa, Lotus Esprit). Casco
// por linhas (`Hull`): o meio do capô sobe em LINHA RETA do bico rente ao chão até o para-brisa, entre para-lamas altos de vinco seco; a
// cabine é curta e deitada, a tampa de trás é pintada com venezianas pretas por fora das faixas. Faróis escamoteáveis: de dia a tampa fica
// rente ao capô, à noite sobe 11 cm (aPaint.w no shader). Na lateral, a entrada de ar da Testarossa: preta, colada na pele, com frisos na cor
// do carro. A traseira é a estrela: a grade-lanterna de ponta a ponta — duas lanternas retangulares EMBUTIDAS por lado (moldura que sobra
// 4,5 cm, lente acesa no fundo, com miolo e borda) atrás de três lâminas pretas —, placa, difusor, os dois escapes de sempre e a asa com
// suportes. Faixas: A = duas faixas do bico à cauda (capô, teto, tampa e a lâmina da asa); B = no vinco da cintura.
// Mesmos eixos, pegada, escapes, roda e pinturas da cunha de antes.
import { buildCabin, cabinGlassTop, type Axle, type CabinSpec, type Region } from '../body';
import { mirrors, plate, splitter } from '../details';
import { Hull } from '../hull';
import { beam, box, cuboid, MeshBuilder, withBrush, type Brush, type Lod, type P3 } from '../kit';
import { finish, type CarModel } from '../model';
import {
  AMBER, GLASS_TINT, GLINT_SKY, GLINT_SOFT, HEAD, INTERIOR, LIVERY_A, LIVERY_B, PAINT, PIANO, STRIPE_A, STRIPE_B, TAIL, TAIL_WELL, TRIM, TRIM_SOFT, UNDER,
} from '../paints';
import { buildRear, exhaustPoint } from '../rear';
import { boxLamp, glassGlints, sideDecal, sideLine, topPatch } from '../shaped';

/** Faixa A (x de dentro, x de fora): as duas faixas do bico à cauda, no casco, no teto e na asa. */
export const WEDGE_STRIPE_A: readonly [number, number] = [0.08, 0.34];
/** A cabine, em z: a base do para-brisa e o fim da tampa de trás. */
export const WEDGE_CABIN: readonly [number, number] = [-0.72, 1.6];

export function buildWedge(lod: Lod = 0): CarModel {
  const b = new MeshBuilder(lod);
  const axles: [Axle, Axle] = [{ z: -1.36, r: 0.435, x: 0.8, w: 0.31 }, { z: 1.36, r: 0.45, x: 0.79, w: 0.35 }];
  const [C0, C3] = WEDGE_CABIN;
  const underCabin = (z: number): boolean => z > C0 + 0.02 && z < C3 - 0.02;
  const STD: Record<Region, Brush> = { under: UNDER, well: UNDER, sill: TRIM, lower: PAINT, band: STRIPE_B, upper: PAINT, shoulder: PAINT, top: PAINT, stripe: STRIPE_A, center: PAINT };
  // A cunha: a borda do capô sobe em reta do bico ao para-brisa (pontos na mesma reta: a curva monótona fica reta entre eles).
  const wedgeY = (z: number): number => 0.37 + (z + 2.2) * 0.215;
  const hull = new Hull({
    lod,
    zs: [-2.2, -2.17, -2.1, -2.0, -1.85, -1.6, -1.0, -0.4, 0.2, 0.8, 1.3, 1.7, 1.95, 2.1, 2.17, 2.2],
    axles, lift: 0.04, stripe: [WEDGE_STRIPE_A[1], WEDGE_STRIPE_A[0]], band: 0.06,
    yb: [[-2.2, 0.22], [-2.1, 0.17], [-1.9, 0.15], [1.9, 0.16], [2.1, 0.22], [2.2, 0.28]],
    // A borda sobe um pouco acima da reta na frente (o `crown` negativo devolve o meio a ela): o para-lama alto nasce mais suave do bico.
    yt: [[-2.2, wedgeY(-2.2) + 0.03], [-2.0, wedgeY(-2.0) + 0.08], [-1.7, wedgeY(-1.7) + 0.09], [-1.2, wedgeY(-1.2) + 0.09], [-0.7, wedgeY(-0.7) + 0.02], [0.2, 0.8], [1.2, 0.84], [2.0, 0.85], [2.2, 0.84]],
    crown: [[-2.2, -0.03], [-2.0, -0.072], [-1.7, -0.078], [-1.2, -0.078], [-0.7, -0.008], [0, 0.01], [2, 0.012], [2.2, 0]],
    hw: [[-2.2, 0.82], [-2.15, 0.88], [-2.05, 0.92], [-1.8, 0.93], [-0.6, 0.93], [0.4, 0.94], [1.4, 0.955], [2.05, 0.95], [2.15, 0.92], [2.2, 0.88]],
    yc: [[-2.2, 0.26], [-1.95, 0.27], [-1.0, 0.4], [0, 0.5], [1.0, 0.58], [1.95, 0.64], [2.2, 0.64]],
    sh: [[-2.2, 0.12], [-1.4, 0.12], [-0.6, 0.11], [0.6, 0.11], [1.6, 0.12], [2.2, 0.12]],
    tuck: [[-2.2, 0.05], [-1.8, 0.08], [0, 0.11], [1.8, 0.08], [2.2, 0.05]],
    flare: [0.015, 0.02], rise: [0.04, 0.04], ramp: [2.3, 1.45],
    brush: (r, z) => (underCabin(z) && (r === 'top' || r === 'stripe' || r === 'center') ? INTERIOR : STD[r]),
    capFront: PAINT, capBack: PAINT,
  });
  hull.build(b);

  // Cabine curta e deitada: para-brisa quase plano, teto reto, tampa de trás pintada (a faixa A passa por cima dela).
  const c0 = hull.cabinEnd(C0); const c1 = hull.cabinBase(-0.08); const c2 = hull.cabinBase(0.5); const c3 = hull.cabinEnd(C3);
  const cab: CabinSpec = {
    secs: [c0, { ...c1, hwt: 0.6, yt: 1.06, crown: 0.02 }, { ...c2, hwt: 0.6, yt: 1.05, crown: 0.02 }, c3],
    top: (gap, region) => (gap === 0 ? GLASS_TINT : region === 'stripe' ? STRIPE_A : PAINT),
    side: (gap) => (gap === 2 ? PAINT : GLASS_TINT),
    stripe: [WEDGE_STRIPE_A[1], WEDGE_STRIPE_A[0]], edge: 0.05, glint: GLINT_SOFT,
  };
  buildCabin(b, cab);
  b.mirrored(() => beam(b, [c0.hwb, c0.yb + 0.01, C0], cabinGlassTop(cab, -0.12), 0.05, 0.035, TRIM));
  glassGlints(b, { z: c0.z, y: c0.yb, hw: c0.hwb }, { z: c1.z, y: 1.06, hw: 0.56 }, -1, GLINT_SKY, 0.02);
  mirrors(b, 0.8, c1.yb + 0.12, -0.5, PAINT, 0.85);
  // Venezianas pretas na tampa de trás, por fora das faixas (seguem a queda da tampa, de c2 a c3).
  b.fine(() => b.mirrored(() => {
    for (let i = 0; i < 6; i++) {
      const t = 0.12 + i * 0.13; const z = c2.z + (c3.z - c2.z) * t;
      box(b, [0.5, 1.05 + (c3.yb - 1.05) * t + 0.012, z], [0.26, 0.022, 0.06], TRIM);
    }
  }));

  // Lateral: a entrada de ar da Testarossa (preta, colada na pele, abaixo da faixa B) com frisos na cor do carro, juntas de porta.
  sideDecal(b, hull, [[0.1, 0.24], [0.95, 0.24], [0.95, 0.47], [0.1, 0.43]], TRIM, 0.012);
  b.fine(() => {
    for (let i = 0; i < 4; i++) { const y = 0.28 + i * 0.048; sideLine(b, hull, [[0.08, y], [0.97, y + 0.008]], 0.02, PAINT, 0.022); }
    sideLine(b, hull, [[-0.62, 0.2], [-0.6, 0.5]], 0.012, TRIM);
    sideLine(b, hull, [[0.06, 0.2], [0.08, 0.5]], 0.012, TRIM);
  });

  // Capô: a tampa dos faróis escamoteáveis (rente ao capô, na cor do carro; a lente olha para a frente e só aparece quando o farol sobe) e
  // a linha escura da junta atrás dela.
  const POD = withBrush(PAINT, { popup: 1 });
  const POD_LENS = withBrush(HEAD, { popup: 1 });
  const POD_TRIM = withBrush(TRIM, { popup: 1 });
  const PX: readonly [number, number] = [0.33, 0.6]; const PZ: readonly [number, number] = [-1.84, -1.6];
  b.mirrored(() => {
    const top = (x: number, z: number): P3 => [x, hull.topAt(z, x) + 0.003, z];
    const low = (x: number, z: number): P3 => [x, hull.topAt(z, x) - 0.12, z];
    cuboid(b, [low(PX[0], PZ[0]), low(PX[1], PZ[0]), top(PX[1], PZ[0]), top(PX[0], PZ[0]), low(PX[0], PZ[1]), low(PX[1], PZ[1]), top(PX[1], PZ[1]), top(PX[0], PZ[1])], POD, { nu: POD_LENS, nv: POD_TRIM });
  });
  b.fine(() => topPatch(b, hull, [[PX[0], PZ[1] + 0.005], [PX[1], PZ[1] + 0.005], [PX[1], PZ[1] + 0.02], [PX[0], PZ[1] + 0.02]], TRIM, 0.004));

  // Frente: luzes de posição no para-choque (pisca âmbar por fora, luz baixa por dentro), tomada preta no meio, divisor rente ao chão.
  const nose = (x: number, y: number): number => hull.endZ(x, y, 'front');
  b.mirrored(() => {
    box(b, [0.6, 0.3, nose(0.73, 0.3) - 0.004], [0.26, 0.06, 0.03], AMBER);
    box(b, [0.32, 0.3, nose(0.43, 0.3) - 0.004], [0.22, 0.06, 0.03], withBrush(HEAD, { head: 0.35 }));
  });
  b.fine(() => box(b, [0, 0.3, nose(0.2, 0.3) - 0.002], [0.36, 0.07, 0.02], TRIM_SOFT));
  splitter(b, 0.15, -2.16, 1.6, 0.14);

  // Traseira-vitrine: a grade-lanterna (duas lanternas embutidas por lado atrás de três lâminas pretas de ponta a ponta), placa, painel baixo.
  b.mirrored(() => {
    const { zLip } = boxLamp(b, hull, { x0: 0.05, x1: 0.85, y0: 0.48, y1: 0.75, cells: 2, protrude: 0.045, recess: 0.03 }, TAIL, PIANO, TAIL_WELL);
    if (!b.lod) for (let i = 0; i < 3; i++) box(b, [0.45, 0.535 + i * 0.07, zLip - 0.008], [0.8, 0.016, 0.012], TRIM, { nu: null });
  });
  b.fine(() => {
    plate(b, 0.37, hull.zBack + 0.014);
    box(b, [0, 0.3, hull.zBack + 0.01], [1.5, 0.08, 0.03], UNDER);
  });
  const rear = buildRear(b, {
    exhausts: [{ x: 0.42, y: 0.26, z: 2.26, r: 0.075 }, { x: -0.42, y: 0.26, z: 2.26, r: 0.075 }],
    diffuser: { y: 0.23, z: 2.1, w: 1.4, fins: 6 },
    wing: {
      z: 1.98, y: 1.06, span: 1.62, chord: 0.34, thick: 0.065, pitch: -0.08, brush: PAINT, plate: PAINT, plateH: 0.13, strut: 'post', baseY: 0.85, strutX: 0.58,
      stripe: { x: WEDGE_STRIPE_A, brush: STRIPE_A },
    },
  });
  return finish('wedge', b, { wheel: 'aero', axles, exhausts: rear.exhausts.map(exhaustPoint), rear, liveries: [LIVERY_B, LIVERY_A] });
}
