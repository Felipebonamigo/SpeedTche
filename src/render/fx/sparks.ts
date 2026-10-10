// Faíscas esticadas (M5): o que sai de cada fonte (rodas na derrapagem nas 3 cores, rajada do impulso, batida, escape do nitro) e o pool que as
// move em coordenada de pista (z em unidades, x normalizado, altura em metros) e as joga no lote de traços (`Streaks`) de cada viewport.
// Os emissores são puros (recebem o sorteio e devolvem especificações): é o que `tests/fx-streaks.test.ts` confere. Cada faísca guarda DUAS
// velocidades: a do mundo (move a partícula) e a VISUAL, relativa ao carro (estica o traço): a câmera anda com o carro, e o que o olho vê é o
// movimento da faísca em relação a ele, não ao chão.
import type { Track } from '../../core/types';
import { locateOnFrame, type FramePoint, type RoadFrame } from '../roadframe';
import type { Streaks } from './streaks';

/** Unidades de pista por metro (200 por segmento de 4 m) e metros por meia largura (units.ts: ROAD_HALF_WIDTH_M). */
const U_PER_M = 50;
const M_PER_X = 7;

export interface SparkCar { z: number; x: number; speed: number; driftDir: number; driftTicks: number }

/** Uma faísca a emitir. `sv*` = velocidade visual (z em unidades/s, x em meias larguras/s, altura em m/s); `width` em metros. */
export interface SparkSpec {
  z: number; x: number; h: number; vz: number; vx: number; vh: number; svz: number; svx: number; svh: number;
  life: number; width: number; gravity: number; r: number; g: number; b: number;
}

/** Cor HDR (o bloom pega acima de 1) por nível da derrapagem: 0 clarão quente, 1 azul, 2 laranja, 3 roxa. */
export const WHEEL_LEVEL_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [2.0, 1.7, 1.1], [0.45, 0.8, 2.6], [2.6, 1.25, 0.2], [2.0, 0.4, 2.6],
];
/** Faíscas por roda por segundo, por nível. */
const WHEEL_RATE: readonly number[] = [10, 34, 50, 70];
/** Abaixo disto (unidades/s) o pneu não solta faísca (parado ou quase). */
export const WHEEL_SPARK_MIN_SPEED = 1500;
/** Roda traseira: afastamento do eixo (meias larguras) e distância atrás do centro (unidades de pista). */
const WHEEL_X = 0.112;
const WHEEL_Z = 67;

function spec(over: Partial<SparkSpec>): SparkSpec {
  return { z: 0, x: 0, h: 0.2, vz: 0, vx: 0, vh: 0, svz: 0, svx: 0, svh: 0, life: 0.3, width: 0.05, gravity: 9, r: 1, g: 1, b: 1, ...over };
}

/** Sorteio estocástico de quantas faíscas saem neste quadro para uma taxa esperada `n` (média certa em qualquer taxa de quadros). */
const draw = (n: number, rnd: () => number): number => Math.floor(n + rnd());

/** As faíscas das duas rodas traseiras de um carro derrapando (`level` 0..3 = `driftLevel`). `factor` é o do degrau (`fxPlan.sparks`). */
export function emitWheelSparks(c: SparkCar, level: number, dt: number, factor: number, rnd: () => number, out: (s: SparkSpec) => void): void {
  if (factor <= 0 || c.driftTicks <= 0 || c.driftDir === 0 || c.speed < WHEEL_SPARK_MIN_SPEED) return;
  const lv = Math.max(0, Math.min(3, Math.floor(level)));
  const [r, g, b] = WHEEL_LEVEL_COLORS[lv];
  for (const side of [-1, 1]) {
    const n = draw(WHEEL_RATE[lv] * dt * factor, rnd);
    for (let k = 0; k < n; k++) {
      const vz = c.speed * (0.2 + 0.3 * rnd());
      const vx = side * (0.25 + 0.65 * rnd());
      const vh = 1.2 + 2.8 * rnd();
      out(spec({
        z: c.z - WHEEL_Z + (rnd() - 0.5) * 20, x: c.x + side * WHEEL_X + (rnd() - 0.5) * 0.02, h: 0.08 + 0.2 * rnd(),
        vz, vx, vh, svz: vz - c.speed, svx: vx, svh: vh, life: 0.25 + 0.3 * rnd(), width: 0.035 + 0.02 * rnd(), r, g, b,
      }));
    }
  }
}

/** A rajada ao soltar o impulso da derrapagem (`level` 1..3): uma explosão curta nas duas rodas, na cor do nível. */
export function emitBoostSparks(c: SparkCar, level: number, factor: number, rnd: () => number, out: (s: SparkSpec) => void): void {
  if (factor <= 0) return;
  const lv = Math.max(1, Math.min(3, Math.floor(level)));
  const [r, g, b] = WHEEL_LEVEL_COLORS[lv];
  for (const side of [-1, 1]) {
    const n = draw((8 + 2 * lv) * factor, rnd);
    for (let k = 0; k < n; k++) {
      const vz = c.speed * (0.1 + 0.3 * rnd());
      const vx = side * (0.4 + 1.1 * rnd());
      const vh = 2 + 4 * rnd();
      out(spec({
        z: c.z - WHEEL_Z + (rnd() - 0.5) * 20, x: c.x + side * WHEEL_X, h: 0.1 + 0.2 * rnd(),
        vz, vx, vh, svz: vz - c.speed, svx: vx, svh: vh, life: 0.3 + 0.3 * rnd(), width: 0.045 + 0.025 * rnd(), r, g, b,
      }));
    }
  }
}

/** A batida: uma rajada em leque em volta do ponto do choque; `drop` = queda de velocidade (fração da máxima). */
export function emitHitSparks(c: SparkCar, drop: number, factor: number, rnd: () => number, out: (s: SparkSpec) => void): void {
  if (factor <= 0) return;
  const n = draw((drop >= 0.12 ? 42 : 24) * factor, rnd);
  for (let k = 0; k < n; k++) {
    // Direção: um ponto no hemisfério de cima; velocidade de 8 a 22 m/s (a faísca esticada vem daí).
    const ang = rnd() * Math.PI * 2;
    const up = 0.15 + 0.85 * rnd();
    const flat = Math.sqrt(1 - up * up);
    const v = 8 + 14 * rnd();
    const along = Math.sin(ang) * flat * v; const lateral = Math.cos(ang) * flat * v; const vertical = up * v;
    out(spec({
      z: c.z + (rnd() - 0.5) * 120, x: c.x + (rnd() - 0.5) * 0.3, h: 0.3 + 0.5 * rnd(),
      vz: c.speed * 0.7 + along * U_PER_M, vx: lateral / M_PER_X, vh: vertical,
      svz: along * U_PER_M, svx: lateral / M_PER_X, svh: vertical, life: 0.3 + 0.4 * rnd(), width: 0.05 + 0.03 * rnd(), r: 2.2, g: 1.4, b: 0.4,
    }));
  }
}

/** O escape do nitro: um ou dois traços azul-brancos curtos, para trás, por quadro e por carro. */
export function emitNitroTrail(c: SparkCar, factor: number, rnd: () => number, out: (s: SparkSpec) => void): void {
  if (factor <= 0) return;
  const n = draw(1.3 * factor, rnd);
  for (let k = 0; k < n; k++) {
    const side = rnd() < 0.5 ? -0.065 : 0.065;
    const vz = c.speed - 900 - 700 * rnd();
    out(spec({
      z: c.z - 66, x: c.x + side, h: 0.3, vz, vx: (rnd() - 0.5) * 0.2, vh: (rnd() - 0.4) * 0.8,
      svz: vz - c.speed - 400, svx: 0, svh: 0, life: 0.18 + 0.18 * rnd(), width: 0.05, gravity: 0.8, r: 0.45, g: 1.0, b: 1.8,
    }));
  }
}

/** Comprimento do traço: velocidade visual × `STRETCH` s, entre o mínimo e o máximo (m). */
const STRETCH = 0.03;
const MIN_LEN = 0.18;
const MAX_LEN = 2.6;

/** Pool de faíscas em coordenadas de pista. */
export class SparkPool {
  private readonly z: Float32Array; private readonly x: Float32Array; private readonly h: Float32Array;
  private readonly vz: Float32Array; private readonly vx: Float32Array; private readonly vh: Float32Array;
  private readonly svz: Float32Array; private readonly svx: Float32Array; private readonly svh: Float32Array;
  private readonly life: Float32Array; private readonly maxLife: Float32Array; private readonly width: Float32Array; private readonly gravity: Float32Array;
  private readonly r: Float32Array; private readonly g: Float32Array; private readonly b: Float32Array;
  private next = 0;
  private readonly head: FramePoint = { x: 0, y: 0, z: 0, heading: 0 };
  private readonly tail: FramePoint = { x: 0, y: 0, z: 0, heading: 0 };

  constructor(readonly max: number) {
    const f = () => new Float32Array(max);
    this.z = f(); this.x = f(); this.h = f(); this.vz = f(); this.vx = f(); this.vh = f(); this.svz = f(); this.svx = f(); this.svh = f();
    this.life = f(); this.maxLife = f(); this.width = f(); this.gravity = f(); this.r = f(); this.g = f(); this.b = f();
  }

  emit(s: SparkSpec): void {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.z[i] = s.z; this.x[i] = s.x; this.h[i] = s.h; this.vz[i] = s.vz; this.vx[i] = s.vx; this.vh[i] = s.vh;
    this.svz[i] = s.svz; this.svx[i] = s.svx; this.svh[i] = s.svh;
    this.life[i] = s.life; this.maxLife[i] = s.life; this.width[i] = s.width; this.gravity[i] = s.gravity; this.r[i] = s.r; this.g[i] = s.g; this.b[i] = s.b;
  }

  step(dt: number): void {
    const drag = 1 - 1.2 * dt;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.z[i] += this.vz[i] * dt; this.x[i] += this.vx[i] * dt;
      this.vh[i] -= this.gravity[i] * dt;
      this.h[i] += this.vh[i] * dt;
      if (this.h[i] < 0.02) { this.h[i] = 0.02; this.vh[i] = Math.abs(this.vh[i]) * 0.3; }
      this.vz[i] *= drag; this.vx[i] *= drag;
    }
  }

  clear(): void { this.life.fill(0); }

  /** Quantas estão vivas (para as contagens do relatório e dos testes). */
  alive(): number { let n = 0; for (let i = 0; i < this.max; i++) if (this.life[i] > 0) n++; return n; }

  /** Escreve cada faísca viva como um traço no lote do viewport (cabeça na faísca, cauda no sentido de onde ela veio). */
  pose(rf: RoadFrame, track: Track, streaks: Streaks): void {
    const hd = this.head; const tl = this.tail;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      if (!locateOnFrame(rf, track, this.z[i], this.x[i], hd)) continue;
      const t = this.life[i] / this.maxLife[i];
      // A velocidade visual em metros por segundo (z/unidade → m, x → m) dá a direção e o comprimento do traço.
      const along = this.svz[i] / U_PER_M; const lat = this.svx[i] * M_PER_X; const up = this.svh[i];
      const speed = Math.hypot(along, lat, up);
      let ux = 0; let uy = 0; let uz = 1; // sem velocidade visual: o traço vira um risco curto para cima
      if (speed > 1e-6) { uz = along / speed; ux = lat / speed; uy = up / speed; }
      else { ux = 0; uz = 0; uy = 1; }
      const len = Math.max(MIN_LEN, Math.min(MAX_LEN, speed * STRETCH * (0.4 + 0.6 * t)));
      const ok = locateOnFrame(rf, track, this.z[i] - uz * len * U_PER_M, this.x[i] - (ux * len) / M_PER_X, tl);
      const hy = hd.y + this.h[i];
      const ty = ok ? tl.y + this.h[i] - uy * len : hy - uy * len;
      streaks.add(hd.x, hy, hd.z, ok ? tl.x : hd.x, ty, ok ? tl.z : hd.z, this.width[i] * (0.6 + 0.4 * t), this.r[i], this.g[i], this.b[i], Math.min(1, t * 2.2));
    }
  }
}
