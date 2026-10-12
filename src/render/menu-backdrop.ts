// Fundo do menu com carros correndo (onda L, L2b). Não há corrida: são poucos carros decorativos à frente da câmera automática do
// `renderIdle`, andando quase na velocidade dela (a distância oscila devagar), pelo mesmo `Cars.update/pose` da corrida. Puro (sem three):
// devolve objetos com os campos do `CarState` que o `Cars` lê; o núcleo, o `hashRace` e o `sim-golden` não sabem que isto existe.
// O palco 3D da garagem (N2) tem prioridade: o `renderIdle` só chega aqui quando não há janela de palco viva.
import { CARS } from '../core/data/cars';
import type { CarState } from '../core/types';
import type { Quality } from '../game/contracts';

/** Quantos carros decorativos cada degrau paga (a Baixa e "reduzir efeitos" não têm: o fundo fica como era). */
export function backdropCount(q: Quality, reduceEffects: boolean): number {
  if (reduceEffects || q === 'low') return 0;
  return q === 'medium' ? 3 : 5;
}

/** Posição de cada vaga: distância média à frente (unidades de pista; 200 = 4 m), faixa (x), vaivém e fase. */
const SLOTS = [
  { ahead: 1500, x: -0.38, sway: 420, w: 0.21, ph: 0.0, car: 'falcao' },
  { ahead: 2300, x: 0.34, sway: 520, w: 0.17, ph: 1.7, car: 'trovao' },
  { ahead: 3300, x: -0.05, sway: 600, w: 0.13, ph: 3.1, car: 'falcao' },
  { ahead: 2000, x: 0.62, sway: 380, w: 0.24, ph: 4.4, car: 'trovao' },
  { ahead: 4300, x: -0.6, sway: 500, w: 0.11, ph: 5.2, car: 'falcao' },
] as const;
/** Velocidade da câmera do fundo (a mesma `IDLE_SPEED` do renderizador, unidades por segundo). */
const CAMERA_SPEED = 2600;

function carIdFor(slot: number): string {
  const want = SLOTS[slot].car;
  if (CARS.some((c) => c.id === want)) return want;
  return CARS[slot % CARS.length].id; // atalho: se o id do catálogo mudar, cai num carro qualquer que exista
}

export class MenuBackdrop {
  private readonly cars: CarState[] = SLOTS.map((s, i) => {
    const def = CARS.find((c) => c.id === carIdFor(i)) ?? CARS[0];
    return {
      id: i, seat: -1, name: '', teamId: 0, carId: def.id, z: 0, x: s.x, speed: CAMERA_SPEED, gear: 3, fuel: 1, nitroMeter: 0, throttleHeld: 0,
      launch: 2, draftTicks: 0, gainLock: 0, nitroTicks: 0, lap: 1, lapTicks: [], lapStartTick: 0, finished: false, finishTick: 0, position: i + 1,
      progress: 0, inPit: false, collisionCooldown: 0, towCooldown: 0, skidTicks: 0, steerPose: 0, driftDir: 0, driftTicks: 0, driftCharge: 0,
      driftBoostTicks: 0, ai: null,
      stats: { topSpeed: def.topSpeed, accel: def.accel, brake: def.brake, handling: def.handling, fuelPerUnit: def.fuelPerUnit, nitro: 1 },
    } satisfies CarState;
  });

  /** Os `count` primeiros carros posicionados para o instante `time`, à frente de `camZ`. Reusa os mesmos objetos (sem alocar por quadro). */
  update(time: number, camZ: number, trackLength: number, count: number): CarState[] {
    const n = Math.max(0, Math.min(SLOTS.length, count));
    for (let i = 0; i < n; i++) {
      const s = SLOTS[i];
      const c = this.cars[i];
      const off = s.ahead + s.sway * Math.sin(time * s.w + s.ph);
      const rate = s.sway * s.w * Math.cos(time * s.w + s.ph); // d(off)/dt: o carro anda na velocidade da câmera mais isto
      c.z = (((camZ + off) % trackLength) + trackLength) % trackLength;
      c.x = s.x + 0.08 * Math.sin(time * 0.31 + s.ph);
      c.speed = CAMERA_SPEED + rate;
      c.steerPose = Math.cos(time * 0.31 + s.ph) > 0.35 ? 1 : Math.cos(time * 0.31 + s.ph) < -0.35 ? -1 : 0;
      c.progress = c.z;
    }
    return this.cars.slice(0, n);
  }
}
