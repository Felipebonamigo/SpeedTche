// Fumaça e poeira (M5, V22 F8): o que sai de cada fonte (pneu na derrapagem, freada forte, poeira da grama e da estrada de terra), em especificações puras que o
// pool de poeira de `effects.ts` (pontos com o sprite de nuvem de `sprite.ts`) desenha. Z em unidades de pista, x em meias larguras, altura em m; `size`/`grow`
// em m (a nuvem incha de `size` a `size + grow` ao longo da vida). V22 F8: cada partícula leva QUADRO (0..3 do atlas), rotação e giro próprios e um tom próprio
// (± alguns % da cor-base), para não haver duas iguais; a poeira da terra e da grama sai em TRILHA contínua (por metro andado, não por quadro). As lascas da batida
// (`impact.ts`) usam o quadro −1: pedaço duro, não nuvem.
// A fumaça NÃO some em "reduzir efeitos" (não pisca nem estoura): só o degrau de qualidade a escala (`fxPlan.smoke`).
import { hash2 } from '../noise';

export interface PuffCar { z: number; x: number; speed: number; driftDir: number; driftTicks: number; driftCharge: number; skidTicks: number }
export interface PuffSpec {
  z: number; x: number; h: number; vz: number; vx: number; vh: number; life: number; size: number; grow: number; gravity: number; r: number; g: number; b: number;
  /** V22 F8: quadro do atlas (0..3); −1 = pedaço duro (lasca); ausente = o pool sorteia. */
  frame?: number;
  /** V22 F8: rotação inicial (rad, em (0, 2π)) e giro (rad/s, ≥ 0,3 em módulo, nos dois sentidos). */
  rot?: number; spin?: number;
}
/** V22 F8: a poeira em trilha: o `dt` do quadro e a taxa do degrau (`fxPlan.trail`, partículas por segundo por carro a 100 m/s). */
export interface Trail { dt: number; rate: number }

/** Branco-acinzentado da fumaça do pneu. */
export const SMOKE_WHITE: readonly [number, number, number] = [0.93, 0.93, 0.95];
/** Cinza da fumaça da freada (a de sempre). */
const SMOKE_GREY: readonly [number, number, number] = [0.75, 0.75, 0.78];
/** Abaixo disto (unidades/s) o pneu não solta fumaça (parado ou quase). */
const MIN_SPEED = 1500;
const WHEEL_X = 0.112;
const WHEEL_Z = 67;

const draw = (n: number, rnd: () => number): number => Math.floor(n + rnd());

const TAU = Math.PI * 2;

function puff(over: Partial<PuffSpec>, rnd: () => number): PuffSpec {
  const mag = 0.35 + 0.9 * rnd();
  return {
    z: 0, x: 0, h: 0.2, vz: 0, vx: 0, vh: 1, life: 0.8, size: 0.5, grow: 1.5, gravity: 0.25, r: 1, g: 1, b: 1,
    frame: Math.min(3, Math.floor(rnd() * 4)), rot: 0.05 + rnd() * (TAU - 0.1), spin: rnd() < 0.5 ? -mag : mag, ...over,
  };
}

/** A cor-base com um tom próprio da partícula: o brilho varia ±`spread` (uniforme), o matiz fica (a poeira branca continua branca). */
function toned(c: readonly [number, number, number], rnd: () => number, spread: number): [number, number, number] {
  const k = 1 + (rnd() - 0.5) * 2 * spread;
  return [c[0] * k, c[1] * k, c[2] * k];
}

/** A fumaça das duas rodas traseiras de um carro derrapando; mais carga, mais fumaça. `f` = `fxPlan.smoke`. */
export function emitTireSmoke(c: PuffCar, dt: number, f: number, rnd: () => number, out: (s: PuffSpec) => void): void {
  if (f <= 0 || c.driftTicks <= 0 || c.driftDir === 0 || c.speed < MIN_SPEED) return;
  const rate = 12 + Math.min(200, Math.max(0, c.driftCharge)) * 0.06; // bolhas por roda por segundo
  const [r, g, b] = SMOKE_WHITE;
  for (const side of [-1, 1]) {
    const n = draw(rate * dt * f, rnd);
    for (let k = 0; k < n; k++) {
      const big = rnd() < 0.3 ? 1.35 : 1; // de vez em quando uma nuvem maior junto (o cacho)
      const [tr, tg, tb] = toned([r, g, b], rnd, 0.06);
      out(puff({
        z: c.z - WHEEL_Z + (rnd() - 0.5) * 20, x: c.x + side * WHEEL_X + (rnd() - 0.5) * 0.02, h: 0.15 + 0.15 * rnd(),
        vz: c.speed * (0.6 + 0.15 * rnd()), vx: side * (0.15 + 0.25 * rnd()), vh: 0.6 + 0.8 * rnd(),
        life: (0.55 + 0.4 * rnd()) * big, size: (0.28 + 0.16 * rnd()) * big, grow: 0.7 + 0.5 * rnd(), r: tr, g: tg, b: tb,
      }, rnd));
    }
  }
}

/** A fumaça leve da freada forte: uma bolha cinza de um lado, em 60% dos quadros (a de sempre). */
export function emitBrakeSmoke(c: PuffCar, decel: number, brake: number, collisionCooldown: number, f: number, rnd: () => number, out: (s: PuffSpec) => void): void {
  if (f <= 0 || c.speed <= 2500 || decel <= brake * 0.55 || collisionCooldown !== 0 || rnd() >= 0.6 * f) return;
  const side = rnd() < 0.5 ? -0.14 : 0.14;
  const [r, g, b] = SMOKE_GREY;
  const [tr, tg, tb] = toned([r, g, b], rnd, 0.06);
  out(puff({ z: c.z - 60, x: c.x + side, h: 0.15, vz: c.speed * 0.6, vx: side * 0.3, vh: 0.8, life: 0.5, size: 0.5, grow: 1.6, gravity: 0.2, r: tr, g: tg, b: tb }, rnd));
}

/**
 * A poeira da terra e da areia (o carro com as rodas fora do asfalto): nuvens na cor do chão, de cada lado. `scale` (V10, HC2; `fxPlan.dustScale`): 1 = a de
 * antes (2 por quadro, 0,5 m, vida de 0,6 a 1,1 s); 1,8 = a nuvem grande e legível do Horizon Chase 2 (3 por quadro, ≥ 0,9 m que incham ≥ 2,5 m, ≥ 1 s).
 * V22 F8: com `trail` a poeira sai em TRILHA — uma nuvem a cada metro andado (taxa do degrau, `trailPoints`), espalhada pelo caminho que o carro fez neste quadro,
 * cada uma com tom próprio —, não um cacho por quadro (que dependia do FPS e deixava buraco entre um quadro e outro). Sem `trail`, é o comportamento de antes.
 */
export function emitGrassDust(c: PuffCar, color: readonly [number, number, number], f: number, rnd: () => number, out: (s: PuffSpec) => void, scale = 1, trail?: Trail): void {
  if (f <= 0 || c.skidTicks <= 0 || c.speed <= 250) return;
  if (trail) {
    trailPoints(c, trail, 1, (k, z) => {
      const side = k % 2 === 0 ? -0.16 : 0.16;
      const [r, g, b] = toned(color, rnd, 0.12);
      out(puff({
        z, x: c.x + side * (1 + rnd()), h: 0.25 + 0.2 * rnd(), vz: c.speed * (0.62 + rnd() * 0.22), vx: (rnd() - 0.5) * 0.4 + side * 0.9,
        vh: (1 + rnd() * 1.4) * Math.min(1.5, scale), life: 0.6 + rnd() * 0.5 + 0.5 * (scale - 1), size: 0.5 * scale * (0.7 + 0.5 * rnd()), grow: 1.4 * scale * (0.85 + 0.3 * rnd()),
        gravity: 0.5, r, g, b,
      }, rnd));
    });
    return;
  }
  const per = Math.ceil(2 * scale * 0.75);
  for (let k = 0; k < per; k++) {
    if (f < 1 && rnd() >= f) continue;
    const side = k % 2 === 0 ? -0.16 : 0.16;
    out(puff({
      z: c.z - 50 + rnd() * 30, x: c.x + side * (1 + rnd()), h: 0.3, vz: c.speed * (0.5 + rnd() * 0.2), vx: (rnd() - 0.5) * 0.4 + side * 0.8,
      vh: (1.2 + rnd() * 1.6) * Math.min(1.5, scale), life: 0.6 + rnd() * 0.5 + 0.5 * (scale - 1), size: 0.5 * scale, grow: 1.4 * scale, gravity: 0.5, r: color[0], g: color[1], b: color[2],
    }, rnd));
  }
}

/** Abaixo disto (0..1) a pista já não é terra: asfalto e pedra (`roadEarth` da paleta: alpina 0,3, litoral 0,1) não levantam poeira rodando. */
const EARTH_MIN = 0.3;

/**
 * V22 F8: a poeira da PRÓPRIA estrada de terra (`roadEarth` ≥ 0,3: a terra avermelhada da mata, a alaranjada do deserto, a ocre da savana): o carro rodando em cima dela
 * levanta, das duas rodas traseiras, uma trilha de nuvens baixas na cor da pista — mais forte quanto mais terra (0,3 → nada, 1 → 80% da taxa do degrau). Fora do
 * asfalto (grama, areia) quem solta é `emitGrassDust`; este só vale com as rodas na pista. `trail.rate` é a taxa do degrau.
 */
export function emitRoadDust(c: PuffCar, color: readonly [number, number, number], earth: number, f: number, rnd: () => number, out: (s: PuffSpec) => void, scale: number, trail: Trail): void {
  if (f <= 0 || c.skidTicks > 0 || c.speed < MIN_SPEED) return;
  const e = Math.min(1, Math.max(0, (earth - EARTH_MIN) / (1 - EARTH_MIN)));
  if (e <= 0) return;
  trailPoints(c, trail, 0.8 * e, (k, z) => {
    const side = k % 2 === 0 ? -1 : 1;
    const [r, g, b] = toned(color, rnd, 0.1);
    out(puff({
      z, x: c.x + side * (WHEEL_X + 0.03 * rnd()), h: 0.12 + 0.12 * rnd(), vz: c.speed * (0.68 + rnd() * 0.2), vx: side * (0.12 + 0.3 * rnd()) + (rnd() - 0.5) * 0.1,
      vh: 0.5 + 0.9 * rnd(), life: 0.55 + rnd() * 0.45 + 0.4 * (scale - 1), size: 0.55 * scale * (0.75 + 0.5 * rnd()), grow: 1.5 * scale * (0.85 + 0.3 * rnd()),
      gravity: 0.4, r, g, b,
    }, rnd));
  });
}

/** Metros por nuvem na taxa de referência: `rate` nuvens por segundo a 100 m/s (5.000 unidades/s) → uma a cada 5.000 / rate unidades. */
const TRAIL_REF_SPEED = 5000;

/**
 * Os pontos de uma trilha neste quadro: uma grade FIXA ao longo da pista (a cada `TRAIL_REF_SPEED / (rate · gain)` unidades) e, de cada ponto da grade que o carro
 * cruzou entre o quadro passado (`z − speed·dt`) e este, uma nuvem — sem estado, mesma quantidade a 30 ou 144 quadros por segundo e sem buraco entre quadros. Cada ponto
 * leva um tremor de ±25% do passo (hash do índice) para não parecer régua, e a grade alterna os dois lados (`k` par = esquerda). `emit(k, z)`: o índice e o z do ponto.
 */
function trailPoints(c: PuffCar, t: Trail, gain: number, emit: (k: number, z: number) => void): void {
  const step = TRAIL_REF_SPEED / (t.rate * gain);
  if (!(step > 0) || !Number.isFinite(step)) return;
  const b = c.z - WHEEL_Z; const a = b - c.speed * t.dt;
  const k1 = Math.floor(b / step); let k0 = Math.floor(a / step);
  if (k1 - k0 > 64) k0 = k1 - 64; // um quadro enorme (aba escondida) não vira uma tempestade
  for (let k = k0 + 1; k <= k1; k++) emit(k, k * step + (hash2(k, 31) - 0.5) * 0.5 * step);
}
