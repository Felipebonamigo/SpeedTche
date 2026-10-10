// Fumaça e poeira em BOLHA (M5): o que sai de cada fonte (pneu na derrapagem, freada forte, poeira da grama), em especificações puras que o pool
// de poeira de `effects.ts` (pontos com o shader de bolha: contorno escuro, brilho de lado, borda nítida) desenha. Z em unidades de pista, x em
// meias larguras, altura em m; `size`/`grow` em m (a bolha incha de `size` a `size + grow` ao longo da vida).
// A fumaça NÃO some em "reduzir efeitos" (não pisca nem estoura): só o degrau de qualidade a escala (`fxPlan.smoke`).

export interface PuffCar { z: number; x: number; speed: number; driftDir: number; driftTicks: number; driftCharge: number; skidTicks: number }
export interface PuffSpec { z: number; x: number; h: number; vz: number; vx: number; vh: number; life: number; size: number; grow: number; gravity: number; r: number; g: number; b: number }

/** Branco-acinzentado da fumaça do pneu. */
export const SMOKE_WHITE: readonly [number, number, number] = [0.93, 0.93, 0.95];
/** Cinza da fumaça da freada (a de sempre). */
const SMOKE_GREY: readonly [number, number, number] = [0.75, 0.75, 0.78];
/** Abaixo disto (unidades/s) o pneu não solta fumaça (parado ou quase). */
const MIN_SPEED = 1500;
const WHEEL_X = 0.112;
const WHEEL_Z = 67;

const draw = (n: number, rnd: () => number): number => Math.floor(n + rnd());

function puff(over: Partial<PuffSpec>): PuffSpec {
  return { z: 0, x: 0, h: 0.2, vz: 0, vx: 0, vh: 1, life: 0.8, size: 0.5, grow: 1.5, gravity: 0.25, r: 1, g: 1, b: 1, ...over };
}

/** A fumaça das duas rodas traseiras de um carro derrapando; mais carga, mais fumaça. `f` = `fxPlan.smoke`. */
export function emitTireSmoke(c: PuffCar, dt: number, f: number, rnd: () => number, out: (s: PuffSpec) => void): void {
  if (f <= 0 || c.driftTicks <= 0 || c.driftDir === 0 || c.speed < MIN_SPEED) return;
  const rate = 12 + Math.min(200, Math.max(0, c.driftCharge)) * 0.06; // bolhas por roda por segundo
  const [r, g, b] = SMOKE_WHITE;
  for (const side of [-1, 1]) {
    const n = draw(rate * dt * f, rnd);
    for (let k = 0; k < n; k++) {
      const big = rnd() < 0.3 ? 1.35 : 1; // de vez em quando uma bolha maior junto (o cacho do cartum)
      out(puff({
        z: c.z - WHEEL_Z + (rnd() - 0.5) * 20, x: c.x + side * WHEEL_X + (rnd() - 0.5) * 0.02, h: 0.15 + 0.15 * rnd(),
        vz: c.speed * (0.6 + 0.15 * rnd()), vx: side * (0.15 + 0.25 * rnd()), vh: 0.6 + 0.8 * rnd(),
        life: (0.55 + 0.4 * rnd()) * big, size: (0.28 + 0.16 * rnd()) * big, grow: 0.7 + 0.5 * rnd(), r, g, b,
      }));
    }
  }
}

/** A fumaça leve da freada forte: uma bolha cinza de um lado, em 60% dos quadros (a de sempre). */
export function emitBrakeSmoke(c: PuffCar, decel: number, brake: number, collisionCooldown: number, f: number, rnd: () => number, out: (s: PuffSpec) => void): void {
  if (f <= 0 || c.speed <= 2500 || decel <= brake * 0.55 || collisionCooldown !== 0 || rnd() >= 0.6 * f) return;
  const side = rnd() < 0.5 ? -0.14 : 0.14;
  const [r, g, b] = SMOKE_GREY;
  out(puff({ z: c.z - 60, x: c.x + side, h: 0.15, vz: c.speed * 0.6, vx: side * 0.3, vh: 0.8, life: 0.5, size: 0.5, grow: 1.6, gravity: 0.2, r, g, b }));
}

/** A poeira da grama (o carro com as rodas fora do asfalto): duas bolhas por quadro, uma de cada lado, na cor do chão. */
export function emitGrassDust(c: PuffCar, color: readonly [number, number, number], f: number, rnd: () => number, out: (s: PuffSpec) => void): void {
  if (f <= 0 || c.skidTicks <= 0 || c.speed <= 250) return;
  for (let k = 0; k < 2; k++) {
    if (f < 1 && rnd() >= f) continue;
    const side = k % 2 === 0 ? -0.16 : 0.16;
    out(puff({
      z: c.z - 50 + rnd() * 30, x: c.x + side * (1 + rnd()), h: 0.3, vz: c.speed * (0.5 + rnd() * 0.2), vx: (rnd() - 0.5) * 0.4 + side * 0.8,
      vh: 1.2 + rnd() * 1.6, life: 0.6 + rnd() * 0.5, size: 0.5, grow: 1.4, gravity: 0.5, r: color[0], g: color[1], b: color[2],
    }));
  }
}
