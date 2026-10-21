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
}

const deg = (r: number): number => (r * 180) / Math.PI;

/** `roofZ`: onde medir o arco longitudinal do teto [início, meio, fim] (m); o padrão serve aos hatches de teto longo; o do Caipora acaba antes de 1,5 m (V19). */
export function formaDe(model: Pick<CarModel, 'shell' | 'axles'>, roofZ: readonly [number, number, number] = [0.0, 0.7, 1.5]): Forma {
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
  const zMid = 0.0;
  const axles = model.axles.map((a) => a.z);
  const roofCamber = up(0, 0.7) - up(0.62, 0.7);
  const roofArch = up(0, roofZ[1]) - (up(0, roofZ[0]) + up(0, roofZ[2])) / 2;
  const flankSweep = sideX(0.62, zMid) - sideX(0.30, zMid);
  let fender = -Infinity;
  for (const a of axles) fender = Math.max(fender, sideX(0.85, a) - sideX(0.85, zMid));
  const hoodCrown = up(0, -1.2) - up(0.7, -1.2);
  const noseDrop = up(0, -1.2) - up(0, -2.06);

  // perfil da seção no meio do teto: o alto da lataria a cada 3 cm de x, do eixo até 15 cm abaixo do teto (o canto e o começo da coluna); onde a malha não tem pele (vidro, vão) o ponto é pulado
  const prof: number[] = [];
  const top0 = up(0, 0.7);
  for (let x = 0; x <= 0.95; x += 0.03) {
    const y = up(x, 0.7);
    prof.push(y);
    if (Number.isFinite(y) && top0 - y > 0.15) break;
  }
  let roofTurn = 0;
  for (let k = 1; k < prof.length - 1; k++) {
    if (!Number.isFinite(prof[k - 1] + prof[k] + prof[k + 1])) continue;
    roofTurn = Math.max(roofTurn, Math.abs(deg(Math.atan2(prof[k + 1] - prof[k], 0.03) - Math.atan2(prof[k] - prof[k - 1], 0.03))));
  }
  return { roofCamber, roofArch, flankSweep, fenderBulge: fender, hoodCrown, noseDrop, roofTurn };
}
