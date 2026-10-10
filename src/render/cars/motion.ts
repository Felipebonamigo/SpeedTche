// Movimento do carro além do andar (M4), SÓ visual e puro: guinada da derrapagem, rodopio, quique, squash & stretch e o
// relógio das estrelinhas da batida. (Esqueleto: os testes de tests/car-movimento.test.ts nascem vermelhos contra ele.)
export const DRIFT_YAW = 0.35;
export const STARS_SECONDS = 0.9;

export interface MotionInput {
  driftDir: number; driftTicks: number; driftBoostTicks: number; nitroTicks: number; collisionCooldown: number;
  speed: number; topSpeed: number; reduce: boolean;
}

export interface Motion {
  drift: number; spin: number; hop: number; sx: number; sy: number; sz: number; starsT: number;
}

export function newMotion(): Motion {
  return { drift: 0, spin: 0, hop: 0, sx: 1, sy: 1, sz: 1, starsT: -1 };
}

export function stepMotion(_m: Motion, _e: MotionInput, _dt: number): void {
  // ainda não faz nada
}
