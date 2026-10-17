// Roadster no estilo HCT "rodada 2" (V2, docs/ondas/V2-estilos.md; referências de forma: Mazda MX-5, Porsche Boxster, Jaguar F-Type): conversível de dois
// lugares sem teto. Casco por linhas (`Hull`): capô longo e baixo, para-lamas que abraçam as rodas, vinco da cintura subindo para a traseira curta com as
// duas corcovas atrás dos bancos; cockpit aberto (bancos, volante, painel, piloto de capacete na cor de acento, à esquerda), para-brisa baixo de vidro escuro
// com moldura cromada, santantônio duplo. Faróis redondos EMBUTIDOS nos para-lamas (lente acesa no fundo da moldura), piscas âmbar, escapes gêmeos. A traseira
// é a estrela: quatro lanternas redondas embutidas (duas por lado), difusor e os escapes. Faixas: A = duas faixas no capô e na tampa (o cockpit é aberto); B
// = no vinco da cintura. Mesmos eixos, pegada, escapes, roda de magnésio e pinturas de antes.
import { type Axle, type Region } from '../body';
import { ball, grille, mirrors } from '../details';
import { Hull } from '../hull';
import { AXIS_NZ, beam, box, cylinder, extrudeZY, fillet, insideBox, MeshBuilder, roundBar, type Brush, type Lod } from '../kit';
import { finish, type CarModel } from '../model';
import { ACCENT, AMBER, CHROME, GLASS_DARK, GLASS_TINT, GLINT, HEAD, HEAD_HOUSING, INTERIOR, LIVERY_A, LIVERY_B, PAINT, SEAT, STRIPE_A, STRIPE_B, TAIL, TAIL_WELL, TRIM, TRIM_SOFT, UNDER } from '../paints';
import { buildRear, exhaustPoint } from '../rear';
import { endDecal, recessedLamp, sideDecal } from '../shaped';

const PIT0 = -0.5; // começo do cockpit (painel)
const PIT1 = 0.78; // fim (atrás dos bancos)
/** Faixa A (x de dentro, x de fora): as duas faixas no capô e na tampa. */
export const ROADSTER_STRIPE_A: readonly [number, number] = [0.08, 0.3];

export function buildRoadster(lod: Lod = 0): CarModel {
  const b = new MeshBuilder(lod);
  const axles: [Axle, Axle] = [{ z: -1.36, r: 0.435, x: 0.79, w: 0.32 }, { z: 1.32, r: 0.44, x: 0.79, w: 0.33 }];
  const STD: Record<Region, Brush> = { under: UNDER, well: UNDER, sill: TRIM, lower: PAINT, band: STRIPE_B, upper: PAINT, shoulder: PAINT, top: PAINT, stripe: STRIPE_A, center: PAINT };
  const hull = new Hull({
    lod,
    zs: [-2.2, -2.17, -2.1, -2.0, -1.85, -1.6, -1.0, PIT0, 0.2, PIT1, 1.3, 1.7, 1.95, 2.08, 2.16, 2.2],
    axles, lift: 0.4, stripe: [ROADSTER_STRIPE_A[1], ROADSTER_STRIPE_A[0]], band: 0.05, crisp: true, detail: { facets: 9, fine: true },
    yb: [[-2.2, 0.3], [-2.1, 0.22], [-1.9, 0.19], [1.9, 0.2], [2.1, 0.26], [2.2, 0.33]],
    yt: [[-2.2, 0.5], [-2.1, 0.54], [-1.8, 0.59], [-1.2, 0.65], [PIT0, 0.73], [PIT1, 0.77], [1.6, 0.82], [2.05, 0.8], [2.2, 0.74]],
    crown: [[-2.2, 0], [-2.1, 0.02], [-1.5, 0.04], [0, 0.04], [2, 0.03], [2.2, 0]],
    hw: [[-2.2, 0.76], [-2.14, 0.84], [-2.05, 0.89], [-1.8, 0.93], [-1.0, 0.93], [0, 0.93], [1.3, 0.94], [1.9, 0.93], [2.08, 0.88], [2.2, 0.8]],
    yc: [[-2.2, 0.34], [-2.0, 0.4], [-1.0, 0.48], [0, 0.54], [1.0, 0.6], [1.9, 0.66], [2.2, 0.66]],
    sh: [[-2.2, 0.2], [-1.5, 0.17], [0, 0.17], [1.6, 0.17], [2.2, 0.2]],
    tuck: [[-2.2, 0.06], [-1.8, 0.08], [0, 0.1], [1.8, 0.08], [2.2, 0.06]],
    flare: [0.02, 0.025], rise: [0.08, 0.07],
    // Cockpit: sem as faces de cima entre as portas (o interior é desenhado à parte).
    brush: (r, z) => (z > PIT0 && z < PIT1 && (r === 'top' || r === 'stripe' || r === 'center') ? null : STD[r]),
    capFront: PAINT, capBack: PAINT,
  });
  hull.build(b);
  const inner = hull.topHalf(0) - 0.005;
  insideBox(b, [0, 0.56, (PIT0 + PIT1) / 2], [inner * 2, 0.4, PIT1 - PIT0], INTERIOR);
  // Bancos e o piloto (à esquerda: o Brasil dirige pela direita da pista).
  b.fine(() => b.mirrored(() => {
    roundBar(b, [0.36, 0.44, 0.45], [0.44, 0.1, 0.44], SEAT, { r: 0.04 });
    roundBar(b, [0.36, 0.66, 0.66], [0.44, 0.5, 0.1], SEAT, { r: 0.05, axis: 'y' });
  }));
  roundBar(b, [-0.36, 0.72, 0.4], [0.4, 0.34, 0.26], TRIM_SOFT, { r: 0.1, axis: 'y' }); // tronco
  ball(b, [-0.36, 1.0, 0.38], 0.15, ACCENT, 12, GLASS_DARK); // capacete com viseira
  b.fine(() => {
    cylinder(b, { ...AXIS_NZ, o: [-0.36, 0.8, -0.1] }, 0.16, 0, 0.03, 10, TRIM); // volante
    box(b, [0, 0.72, -0.44], [inner * 2, 0.12, 0.12], TRIM); // painel
  });
  // Para-brisa baixo com moldura.
  const wy0 = 0.76; const wy1 = 1.05; const wz0 = -0.52; const wz1 = -0.36;
  extrudeZY(b, [[wz0, wy0], [wz0 + 0.02, wy0], [wz1 + 0.02, wy1], [wz1, wy1]], -0.72, 0.72, GLASS_TINT);
  // Reflexo do céu: duas faixas diagonais de espelho sobre o vidro (a mesma ideia do `cabinGlint`, no painel plano do para-brisa).
  if (!lod) {
    const nz = -(wy1 - wy0); const ny = wz1 - wz0; const nl = Math.hypot(nz, ny); // normal para fora (frente e cima), no plano (z, y)
    const on = (x: number, u: number): [number, number, number] => [x, wy0 + (wy1 - wy0) * u + (ny / nl) * 0.006, wz0 + (wz1 - wz0) * u + (nz / nl) * 0.006];
    for (const [x0, w] of [[0.12, 0.14], [0.31, 0.04]] as const) b.mirrored(() => b.quad(on(x0, 0.12), on(x0 + 0.22, 0.88), on(x0 + w + 0.22, 0.88), on(x0 + w, 0.12), GLINT));
  }
  beam(b, [-0.74, wy1, wz1], [0.74, wy1, wz1], 0.04, 0.04, CHROME);
  b.mirrored(() => beam(b, [0.74, wy0, wz0], [0.74, wy1, wz1], 0.04, 0.04, CHROME));
  // Santantônio duplo e as corcovas atrás dos bancos.
  b.mirrored(() => {
    beam(b, [0.2, 0.78, PIT1 + 0.02], [0.2, 1.12, PIT1 - 0.02], 0.05, 0.05, CHROME);
    beam(b, [0.52, 0.78, PIT1 + 0.02], [0.52, 1.12, PIT1 - 0.02], 0.05, 0.05, CHROME);
    beam(b, [0.18, 1.12, PIT1 - 0.02], [0.54, 1.12, PIT1 - 0.02], 0.05, 0.05, CHROME);
    extrudeZY(b, fillet([[PIT1 - 0.02, 0.78], [PIT1 + 0.02, 0.98], [PIT1 + 0.2, 1.0], [1.7, 0.84], [1.7, 0.8]], [0, 0.08, 0.12, 0.03, 0]), 0.2, 0.52, PAINT);
  });
  // Frente: faróis redondos embutidos nos para-lamas (lente acesa no fundo da moldura), boca com grade cromada, piscas.
  grille(b, 0.36, -2.21, 0.64, 0.14, CHROME, 2, CHROME);
  b.mirrored(() => recessedLamp(b, { x: 0.6, y: 0.53, z: hull.endZ(0.6, 0.53, 'front') - 0.008, rOuter: 0.14, rLens: 0.12, protrude: 0.04, recess: 0.03 }, 'front', HEAD, CHROME, HEAD_HOUSING, 16));
  b.mirrored(() => box(b, [0.62, 0.34, -2.2], [0.1, 0.05, 0.05], AMBER));
  roundBar(b, [0, 0.24, -2.2], [1.3, 0.05, 0.08], TRIM, { r: 0.025 });
  mirrors(b, 0.84, 0.86, -0.44, CHROME, 0.8);
  // Lateral: a entrada atrás da roda dianteira e a junta da porta.
  sideDecal(b, hull, [[-1.0, 0.36], [-0.8, 0.36], [-0.8, 0.46], [-1.0, 0.44]], TRIM, 0.01);
  // Traseira-vitrine: quatro lanternas redondas embutidas (duas por lado), painel preto, escapes gêmeos largos e o difusor.
  endDecal(b, hull, 'back', 0, 0.84, () => 0.5, () => 0.78, 0.006, TRIM, b.lod ? 3 : 8);
  for (const l of [{ x: 0.64, y: 0.64, rOuter: 0.15, rLens: 0.13 }, { x: 0.33, y: 0.64, rOuter: 0.12, rLens: 0.1 }]) {
    b.mirrored(() => recessedLamp(b, { ...l, z: hull.endZ(l.x, l.y, 'back') + 0.008, protrude: 0.045, recess: 0.03 }, 'back', TAIL, HEAD_HOUSING, TAIL_WELL, 14));
  }
  roundBar(b, [0, 0.34, 2.2], [1.4, 0.08, 0.08], TRIM, { r: 0.035 });
  const rear = buildRear(b, {
    exhausts: [{ x: 0.4, y: 0.27, z: 2.26, r: 0.075 }, { x: -0.4, y: 0.27, z: 2.26, r: 0.075 }],
    diffuser: { y: 0.29, z: 2.08, w: 1.1, fins: 4 },
  });
  return finish('roadster', b, { wheel: 'mag', axles, exhausts: rear.exhausts.map(exhaustPoint), rear, liveries: [LIVERY_A, LIVERY_B] });
}
