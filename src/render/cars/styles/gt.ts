// GT no estilo HCT "rodada 2" (V2, docs/ondas/V2-gt.md; o protótipo aprovado pelo dono está em `nc/estilo-carros`): supercarro de
// MOTOR CENTRAL em cunha (referências de forma: Ferrari F40/F50, Countach, NSX). Casco por linhas (`Hull`): bico baixo, capô abaulado
// entre para-lamas que sobem sobre as rodas, lateral em dois planos com o vinco da cintura subindo para trás, cabine avançada com
// para-brisa deitado e vidro de trás longo entre colunas pintadas, entrada de ar no flanco. A traseira é a estrela (é o que se vê na
// corrida): quatro lanternas redondas EMBUTIDAS num painel preto (moldura saliente, poço, lente acesa no fundo com miolo e borda),
// pisca e ré apagados, grade de colmeia, placa, difusor de seis aletas, os dois escapes de sempre e a asa com suportes. Faixas: A = duas
// faixas do bico à cauda (capô, teto, tampa do motor e a lâmina da asa); B = no vinco da cintura, do bico à traseira.
// Mesmos eixos, pegada e escapes do GT de antes (as saídas da chama do nitro não mudaram).
import { buildCabin, cabinGlassTop, type Axle, type CabinSpec, type Region } from '../body';
import { calipers, mirrors, plate, splitter } from '../details';
import { Hull } from '../hull';
import { beam, MeshBuilder, type Brush, type Lod } from '../kit';
import { finish, type CarModel } from '../model';
import {
  GLASS_TINT, GLINT_SKY, GLINT_SOFT, HEAD, HEAD_HOUSING, INTERIOR, LENS_AMBER, LENS_CLEAR, LIVERY_A, LIVERY_B, PAINT, PIANO, REFLECTOR,
  STRIPE_A, STRIPE_B, TAIL, TAIL_WELL, TRIM, TRIM_SOFT, UNDER,
} from '../paints';
import { buildRear, exhaustPoint } from '../rear';
import { doorHandle, endDecal, glassGlints, headlampPod, meshGrille, recessedLamp, sideDecal, sideLine, topPatch } from '../shaped';

/** Faixa A (x de dentro, x de fora): as duas faixas do bico à cauda, no casco, no teto e na asa. */
export const GT_STRIPE_A: readonly [number, number] = [0.08, 0.36];
/** A cabine, em z: a base do para-brisa e o fim do vidro de trás. */
export const GT_CABIN: readonly [number, number] = [-0.86, 1.62];
/**
 * As quatro lanternas (lado direito; a esquerda é o espelho): centro, raio da moldura e da lente. A lente do par de fora é um pouco maior; as
 * quatro somam ≥ 0,15 m² vistas de trás (a traseira-vitrine da M4).
 */
export const GT_TAIL_LAMPS: ReadonlyArray<{ x: number; y: number; rOuter: number; rLens: number }> = [
  { x: 0.335, y: 0.625, rOuter: 0.13, rLens: 0.11 },
  { x: 0.615, y: 0.625, rOuter: 0.135, rLens: 0.115 },
];

export function buildGt(lod: Lod = 0): CarModel {
  const b = new MeshBuilder(lod);
  const axles: [Axle, Axle] = [{ z: -1.36, r: 0.44, x: 0.79, w: 0.32 }, { z: 1.34, r: 0.44, x: 0.79, w: 0.32 }];
  const [C0, C3] = GT_CABIN;
  // Debaixo da cabine o topo do casco não aparece por fora (a cabine assenta na borda dele); na câmera de Capô, com a cabine cortada, ele é
  // o "assoalho" escuro do carro — e não leva faixa (a faixa conta área: tests/car-round.test.ts).
  const underCabin = (z: number): boolean => z > C0 + 0.02 && z < C3 - 0.02;
  const STD: Record<Region, Brush> = { under: UNDER, well: UNDER, sill: TRIM, lower: PAINT, band: STRIPE_B, upper: PAINT, shoulder: PAINT, top: PAINT, stripe: STRIPE_A, center: PAINT };
  const hull = new Hull({
    lod,
    zs: [-2.2, -2.17, -2.1, -2.0, -1.85, -1.6, -1.0, -0.4, 0.2, 0.8, 1.3, 1.7, 1.95, 2.08, 2.16, 2.2],
    axles, lift: 0.55, stripe: [GT_STRIPE_A[1], GT_STRIPE_A[0]], band: 0.07,
    yb: [[-2.2, 0.28], [-2.1, 0.21], [-1.9, 0.18], [1.9, 0.18], [2.1, 0.24], [2.2, 0.34]],
    yt: [[-2.2, 0.5], [-2.1, 0.54], [-1.9, 0.6], [-1.5, 0.7], [-0.9, 0.78], [-0.2, 0.8], [0.8, 0.82], [1.5, 0.86], [2.0, 0.86], [2.2, 0.8]],
    crown: [[-2.2, 0], [-2.1, 0.015], [-1.5, 0.035], [-0.5, 0.03], [2, 0.03], [2.2, 0]],
    hw: [[-2.2, 0.78], [-2.16, 0.85], [-2.08, 0.9], [-1.9, 0.93], [-1.4, 0.935], [-0.6, 0.9], [0, 0.87], [0.6, 0.89], [1.3, 0.935], [1.9, 0.935], [2.1, 0.89], [2.2, 0.78]],
    yc: [[-2.2, 0.34], [-2, 0.42], [-1.4, 0.52], [-0.5, 0.58], [0.5, 0.62], [1.3, 0.66], [2, 0.68], [2.2, 0.7]],
    sh: [[-2.2, 0.2], [-2, 0.26], [-1.3, 0.3], [-0.8, 0.22], [-0.2, 0.14], [0.8, 0.14], [1.5, 0.2], [2.0, 0.2], [2.2, 0.16]],
    tuck: [[-2.2, 0.06], [-1.8, 0.09], [0, 0.14], [1.8, 0.09], [2.2, 0.06]],
    flare: [0.02, 0.035], rise: [0.04, 0.04],
    brush: (r, z) => (underCabin(z) && (r === 'top' || r === 'stripe' || r === 'center') ? INTERIOR : STD[r]),
    capFront: PAINT, capBack: PAINT,
  });
  hull.build(b);

  // Cabine avançada: base rente ao ombro do casco, para-brisa muito deitado, teto curto, vidro de trás longo entre colunas pintadas.
  const base = (z: number) => ({ z, hwb: hull.topHalf(z) - 0.005, yb: hull.topAt(z, hull.topHalf(z)) - 0.004 });
  const c0 = base(C0); const c1 = base(-0.1); const c2 = base(0.82); const c3 = base(C3);
  const cab: CabinSpec = {
    secs: [
      { ...c0, hwt: c0.hwb, yt: c0.yb },
      { ...c1, hwt: 0.57, yt: 1.17, crown: 0.03 },
      { ...c2, hwt: 0.56, yt: 1.15, crown: 0.03 },
      { ...c3, hwt: c3.hwb, yt: c3.yb },
    ],
    top: (gap, region) => (gap === 1 ? (region === 'stripe' ? STRIPE_A : PAINT) : GLASS_TINT),
    side: (gap) => (gap === 2 ? PAINT : GLASS_TINT),
    stripe: [GT_STRIPE_A[1], GT_STRIPE_A[0]], edge: 0.1, glint: GLINT_SOFT,
  };
  buildCabin(b, cab);
  b.mirrored(() => beam(b, [c0.hwb, c0.yb + 0.01, C0], cabinGlassTop(cab, -0.12), 0.05, 0.035, TRIM));
  glassGlints(b, { z: c0.z, y: c0.yb, hw: c0.hwb }, { z: c1.z, y: 1.17, hw: 0.52 }, -1, GLINT_SKY);
  glassGlints(b, { z: c3.z, y: c3.yb, hw: c3.hwb }, { z: c2.z, y: 1.15, hw: 0.52 }, 1, GLINT_SKY);
  mirrors(b, 0.78, 0.9, -0.6, PAINT);

  // Lateral: entrada de ar no flanco (preta, com lamelas na cor do carro), juntas de porta, maçaneta abaixo da faixa B.
  sideDecal(b, hull, [[0.3, 0.3], [0.8, 0.27], [0.8, 0.52], [0.3, 0.55]], TRIM, 0.012);
  b.fine(() => {
    for (const f of [0.3, 0.55, 0.8]) sideLine(b, hull, [[0.3 + 0.5 * f, 0.32 - 0.03 * f], [0.3 + 0.5 * f, 0.53 - 0.03 * f]], 0.016, PAINT, 0.02);
    sideLine(b, hull, [[-0.62, 0.22], [-0.6, 0.5]], 0.012, TRIM);
    sideLine(b, hull, [[0.26, 0.22], [0.28, 0.53]], 0.012, TRIM);
    doorHandle(b, hull, -0.05, hull.creaseY(-0.05) - 0.1, TRIM);
  });

  // Capô: tomadas NACA por fora das faixas; tampa do motor com venezianas por fora das faixas.
  b.fine(() => {
    topPatch(b, hull, [[0.44, -1.55], [0.6, -1.55], [0.57, -1.25], [0.47, -1.25]], TRIM, 0.008);
    topPatch(b, hull, [[0.42, 1.66], [0.64, 1.66], [0.64, 1.9], [0.42, 1.9]], TRIM, 0.006);
    for (const z of [1.71, 1.77, 1.83]) topPatch(b, hull, [[0.42, z], [0.64, z], [0.64, z + 0.022], [0.42, z + 0.022]], PAINT, 0.018);
  });

  // Frente: faróis deitados no capô (carcaça preta, refletor, dois projetores e a luz diurna em L), grade de lamelas, entradas laterais,
  // pisca apagado no canto e o divisor rente ao chão.
  // O farol fica todo em cima do capô (x ≤ meia largura do topo): passando do ombro, a carcaça boiava sobre a pele que desce (vista de lado, um
  // espigão preto).
  const HL: Array<[number, number]> = [[0.4, -2.04], [0.63, -2.0], [0.645, -1.66], [0.43, -1.72]];
  if (b.lod) topPatch(b, hull, HL, HEAD, 0.04, true, HEAD_HOUSING);
  else headlampPod(b, hull, HL, { lens: HEAD, bezel: PIANO, side: TRIM, reflector: REFLECTOR });
  b.fine(() => {
    meshGrille(b, hull, 'front', 0, 0.48, 0.29, 0.42, 3, TRIM, TRIM_SOFT);
    meshGrille(b, hull, 'front', 0.53, 0.77, 0.29, 0.4, 2, TRIM, TRIM_SOFT);
    endDecal(b, hull, 'front', 0.8, 0.9, () => 0.43, () => 0.47, 0.012, LENS_AMBER, 2);
  });
  splitter(b, 0.17, -2.17, 1.6, 0.24);

  // Traseira-vitrine: painel preto brilhante, quatro lanternas embutidas, grade de colmeia no meio, pisca e ré apagados, placa.
  const panelTop = (t: number): number => { const x = t * 0.77; return x < 0.6 ? 0.785 : 0.785 - ((x - 0.6) / 0.17) * 0.1; };
  endDecal(b, hull, 'back', 0, 0.77, () => 0.475, panelTop, 0.008, PIANO, b.lod ? 3 : 8);
  for (const l of GT_TAIL_LAMPS) {
    b.mirrored(() => recessedLamp(b, { ...l, z: hull.endZ(l.x, l.y, 'back') + 0.008, protrude: 0.045, recess: 0.03 }, 'back', TAIL, HEAD_HOUSING, TAIL_WELL, 14));
  }
  b.fine(() => {
    meshGrille(b, hull, 'back', 0, 0.19, 0.53, 0.73, 3, TRIM, TRIM_SOFT);
    endDecal(b, hull, 'back', 0.5, 0.74, () => 0.445, () => 0.468, 0.012, LENS_AMBER, 2);
    endDecal(b, hull, 'back', 0.25, 0.45, () => 0.445, () => 0.468, 0.012, LENS_CLEAR, 2);
    plate(b, 0.405, hull.zBack + 0.014);
  });
  const rear = buildRear(b, {
    exhausts: [{ x: 0.42, y: 0.26, z: 2.26, r: 0.075 }, { x: -0.42, y: 0.26, z: 2.26, r: 0.075 }],
    diffuser: { y: 0.24, z: 2.1, w: 1.2, fins: 6 },
    wing: {
      z: 1.98, y: 1.03, span: 1.6, chord: 0.3, thick: 0.065, pitch: -0.1, brush: PAINT, plate: PAINT, plateH: 0.13, strut: 'post', baseY: 0.84, strutX: 0.44,
      stripe: { x: GT_STRIPE_A, brush: STRIPE_A },
    },
  });
  calipers(b, axles);
  return finish('gt', b, { wheel: 'sport5', axles, exhausts: rear.exhausts.map(exhaustPoint), rear, liveries: [LIVERY_A, LIVERY_B] });
}
