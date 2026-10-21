// V18: medidas de FORMA do casco de um carro herói (quanto a lataria é curva, não só quanto tem de detalhe). Puro: só lê a malha do `CarModel`, na pintura (o que é lataria: não conta
// para-choque, vidro, lanterna nem friso). Convenção do modelo: x à direita, y para cima, a frente em −z (a ponta do nariz em z ≈ −2,1 e a traseira em ≈ +2,1).
import type { CarModel } from '../src/render/cars/model';
import { probe } from './hct-probe';

export interface Forma {
  /** Abaulado transversal do teto: o alto no meio menos o alto a 0,62 m do eixo, no meio do teto (m). Teto plano = 0. */
  roofCamber: number;
  /** Arco longitudinal do teto: o alto no meio menos a média dos dois fins do teto, no eixo (m). */
  roofArch: number;
  /** Cintura abaulada: o quanto a lataria da porta sai da soleira para a barriga (x a 0,62 m de altura menos x a 0,30 m), no meio entre os eixos (m). */
  flankSweep: number;
  /** Para-lama bojudo: o quanto a lataria acima da roda passa da lataria entre as rodas, na mesma altura (m). */
  fenderBulge: number;
  /** Capô abaulado: o alto no eixo menos o alto a 0,7 m do eixo, no meio do capô (m). */
  hoodCrown: number;
  /** A ponta do capô cai: o alto do capô no meio menos o alto perto do nariz (m). */
  noseDrop: number;
  /** Canto do teto: a maior virada do perfil da seção (teto → coluna → cintura, a cada 3 cm de x, no meio do teto), em graus por passo. Chanfro de quina viva = grande; teto que rola = pequeno. */
  roofTurn: number;
  /** V20: o bojo só da roda de TRÁS (o "ombro" do muscle): a lataria sobre o eixo de trás menos a lataria entre as rodas (m). */
  rearFender: number;
  /** V20: a tampa do porta-malas abaulada: o alto no eixo menos o alto a 0,7 m do eixo, no meio da tampa (m); NaN se `onde.deckZ` não foi dado. */
  deckCrown: number;
  /** V20: o bojo visto de cima: a maior largura da lataria pintada sobre o eixo de trás (±15 cm) menos a maior largura entre as rodas (z ±25 cm) (m). Serve onde o vão da roda come a altura em que o `fenderBulge` mede (o Besouro). */
  planBulge: number;
}

/** V20: ONDE medir cada coisa; os padrões são os dos hatches (V18/V19) e cada carro de outro arquétipo diz os dele (o furgão tem o capô curto, o muscle a cintura alta, o cupê o teto curto). */
export interface Onde {
  /** z do meio do teto (onde se mede o abaulado e a virada do canto) e x do abaulado (m). */
  roofMidZ: number; roofX: number;
  /** a cintura: z (no meio entre as rodas) e as duas alturas da lataria da porta (m). */
  flankZ: number; flankLow: number; flankHigh: number;
  /** o para-lama: a altura (m) e o z entre as rodas. */
  fenderY: number; fenderMidZ: number; fenderMidY?: number;
  /** o capô: z do meio do capô, x da beira (m) e z perto do nariz. */
  hoodZ: number; hoodX: number; hoodNoseZ: number;
  /** a tampa do porta-malas (z, m), se a há. */
  deckZ?: number;
}
const ONDE_HATCH: Onde = { roofMidZ: 0.7, roofX: 0.62, flankZ: 0.0, flankLow: 0.30, flankHigh: 0.62, fenderY: 0.85, fenderMidZ: 0.0, hoodZ: -1.2, hoodX: 0.7, hoodNoseZ: -2.06 };

const deg = (r: number): number => (r * 180) / Math.PI;

/** `roofZ`: onde medir o arco longitudinal do teto [início, meio, fim] (m); o padrão serve aos hatches de teto longo; o do Caipora acaba antes de 1,5 m (V19). */
export function formaDe(model: Pick<CarModel, 'shell' | 'axles'>, roofZ: readonly [number, number, number] = [0.0, 0.7, 1.5], onde: Partial<Onde> = {}): Forma {
  const W: Onde = { ...ONDE_HATCH, ...onde };
  const P = probe(model);
  const paint = (i: number): boolean => P.painted(i);
  const up = (x: number, z: number): number => P.fromAbove(Math.abs(x), z, paint)?.y ?? NaN;
  const out = (y: number, z: number): number => P.fromSide(y, z, 1)?.x ?? NaN;
  // o lado de fora da lataria PINTADA (os raios de `fromSide` ignoram o material: filtramos pelo triângulo a seguir)
  const sideX = (y: number, z: number): number => {
    let best = NaN;
    const pos = P.pos;
    for (let i = 0; i < pos.count; i += 3) {
      if (!paint(i)) continue;
      const ay = pos.getY(i); const az = pos.getZ(i); const by = pos.getY(i + 1); const bz = pos.getZ(i + 1); const cy = pos.getY(i + 2); const cz = pos.getZ(i + 2);
      const d = (bz - cz) * (ay - cy) + (cy - by) * (az - cz);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((bz - cz) * (y - cy) + (cy - by) * (z - cz)) / d;
      const l2 = ((cz - az) * (y - cy) + (ay - cy) * (z - cz)) / d;
      if (l1 < -1e-9 || l2 < -1e-9 || l1 + l2 > 1 + 1e-9) continue;
      const x = l1 * pos.getX(i) + l2 * pos.getX(i + 1) + (1 - l1 - l2) * pos.getX(i + 2);
      if (!(best >= x)) best = x;
    }
    return best;
  };
  void out;
  const zMid = W.flankZ;
  const axles = model.axles.map((a) => a.z);
  const roofCamber = up(0, W.roofMidZ) - up(W.roofX, W.roofMidZ);
  const roofArch = up(0, roofZ[1]) - (up(0, roofZ[0]) + up(0, roofZ[2])) / 2;
  const flankSweep = sideX(W.flankHigh, zMid) - sideX(W.flankLow, zMid);
  let fender = -Infinity;
  const midX = sideX(W.fenderMidY ?? W.fenderY, W.fenderMidZ);
  for (const a of axles) { const d = sideX(W.fenderY, a) - midX; if (Number.isFinite(d)) fender = Math.max(fender, d); }  // o Besouro tem o capô mais baixo que o vão: o eixo da frente não tem lataria nessa altura
  const rearFender = sideX(W.fenderY, Math.max(...axles)) - midX;
  const hoodCrown = up(0, W.hoodZ) - up(W.hoodX, W.hoodZ);
  const noseDrop = up(0, W.hoodZ) - up(0, W.hoodNoseZ);
  let wAxle = 0; let wMid = 0;
  for (let i = 0; i < P.pos.count; i++) {
    if (!paint(i)) continue;
    const z = P.pos.getZ(i); const ax = Math.abs(P.pos.getX(i));
    if (Math.abs(z - Math.max(...axles)) < 0.15) wAxle = Math.max(wAxle, ax);
    if (Math.abs(z) < 0.25) wMid = Math.max(wMid, ax);
  }
  const planBulge = wAxle - wMid;
  const deckCrown = W.deckZ === undefined ? NaN : up(0, W.deckZ) - up(0.7, W.deckZ);

  // perfil da seção no meio do teto: o alto da lataria a cada 3 cm de x, do eixo até 15 cm abaixo do teto (o canto e o começo da coluna); onde a malha não tem pele (vidro, vão) o ponto é pulado
  const prof: number[] = [];
  const top0 = up(0, W.roofMidZ);
  for (let x = 0; x <= 0.95; x += 0.03) {
    const y = up(x, W.roofMidZ);
    prof.push(y);
    if (Number.isFinite(y) && top0 - y > 0.15) break;
  }
  let roofTurn = 0;
  for (let k = 1; k < prof.length - 1; k++) {
    if (!Number.isFinite(prof[k - 1] + prof[k] + prof[k + 1])) continue;
    roofTurn = Math.max(roofTurn, Math.abs(deg(Math.atan2(prof[k + 1] - prof[k], 0.03) - Math.atan2(prof[k] - prof[k - 1], 0.03))));
  }
  return { roofCamber, roofArch, flankSweep, fenderBulge: fender, hoodCrown, noseDrop, roofTurn, rearFender, deckCrown, planBulge };
}

/** V20: os oito nacionais que não são hatch: onde medir em cada um (as medidas do spec: cowl, teto, eixos, cintura). `roof` = [início, meio, fim] do arco do teto, sempre dentro do trecho de teto pintado. */
export const MEDIDA_OUTROS: Record<string, { roof: [number, number, number]; onde: Partial<Onde> }> = {
  barao: { roof: [-0.2, 0.35, 0.9], onde: { roofMidZ: 0.35, roofX: 0.6, flankHigh: 0.76, fenderY: 0.88, hoodZ: -1.6, hoodNoseZ: -2.12, deckZ: 1.85 } },
  furgao: { roof: [0.1, 0.65, 1.25], onde: { roofMidZ: 0.65, roofX: 0.62, flankHigh: 0.73, fenderY: 0.80, hoodZ: -1.3, hoodNoseZ: -1.7 } },
  besouro: { roof: [-0.3, 0.2, 0.75], onde: { roofMidZ: 0.2, roofX: 0.5, flankHigh: 0.60, fenderY: 0.9, fenderMidY: 0.8, fenderMidZ: 0.9, hoodZ: -1.6, hoodNoseZ: -2.03 } },
  paodeforma: { roof: [-0.9, 0.4, 1.7], onde: { roofMidZ: 0.4, roofX: 0.62, flankLow: 0.50, flankHigh: 0.85, fenderY: 0.92, hoodZ: -1.9, hoodNoseZ: -2.13 } },
  gaucho: { roof: [0.3, 0.55, 0.8], onde: { roofMidZ: 0.55, roofX: 0.55, flankHigh: 0.78, fenderY: 0.95, hoodZ: -1.4, hoodNoseZ: -2.18 } },
  trilheiro: { roof: [-0.7, 0.25, 1.2], onde: { roofMidZ: 0.25, roofX: 0.62, flankHigh: 0.82, fenderY: 0.94, hoodZ: -1.6, hoodNoseZ: -2.0 } },
  lambari: { roof: [0.0, 0.35, 0.7], onde: { roofMidZ: 0.35, roofX: 0.5, flankHigh: 0.64, fenderY: 0.85, hoodZ: -1.5, hoodNoseZ: -2.0 } },
  jabuti: { roof: [0.05, 0.55, 1.05], onde: { roofMidZ: 0.55, roofX: 0.6, flankHigh: 0.71, fenderY: 0.80, hoodZ: -1.2, hoodNoseZ: -1.7 } },
};

/** V20: o alto do casco (qualquer material) no eixo, a cada z dado (m): a silhueta de perfil. NaN onde não há casco. */
export function perfilDoTopo(model: Pick<CarModel, 'shell'>, zs: readonly number[]): number[] {
  const P = probe(model);
  return zs.map((z) => P.fromAbove(0, z)?.y ?? NaN);
}

/** V20: a lente da lanterna acesa vista de trás (cm²: Σ área × |normal·z|, nos 40 cm de trás do carro: o micro acaba em 1,8 m, o hatch em 2,2), o que se lê na câmera de corrida. */
export function lanternaDeTras(model: Pick<CarModel, 'shell'>): number {
  const P = probe(model);
  let zMax = -Infinity;
  for (let i = 0; i < P.pos.count; i++) zMax = Math.max(zMax, P.pos.getZ(i));
  let area = 0;
  for (const t of P.T) if (P.isTail(t.i) && t.c[2] > zMax - 0.4 && t.n[2] > 0.3) area += t.area * t.n[2];
  return area * 1e4;
}

/** V20: o vidro lateral visto de lado (cm²: Σ área × |normal·x| dos triângulos de vidro do lado direito): o Lambari tem "vidro grande" e a forma não pode encolhê-lo. */
export function vidroLateral(model: Pick<CarModel, 'shell'>): number {
  const P = probe(model);
  let area = 0;
  for (const t of P.T) if (P.isGlass(t.i) && t.c[0] > 0.3) area += t.area * Math.abs(t.n[0]);
  return area * 1e4;
}
