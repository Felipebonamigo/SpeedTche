// Movimento do carro além do andar (M4), SÓ visual e puro (sem Three, sem DOM): a guinada da derrapagem, o rodopio e o
// quique da batida, o squash & stretch e o relógio das estrelinhas. Tudo sai do estado que o núcleo já grava
// (driftDir, collisionCooldown, speed, nitroTicks, driftBoostTicks), por BORDA: a subida do `collisionCooldown`
// (0 → 20 ticks, só em batida traseira ou no cenário; o raspão de lado não a põe) é a batida; o começo do nitro e do
// impulso da derrapagem é o esticão. O núcleo, o hash e o online não sabem que isto existe.
// Quem desenha (cars.ts) só lê `drift`, `spin`, `hop`, `sx/sy/sz` e `starsT`.

/** Guinada máxima da derrapagem (rad): o bico aponta para dentro da curva, do lado de `driftDir`. */
export const DRIFT_YAW = 0.35;
/** Quanto as estrelinhas ficam acesas depois da batida (s). */
export const STARS_SECONDS = 0.9;
/** Queda de velocidade (fração da máxima, no quadro da batida) a partir da qual o carro dá a volta inteira. */
export const SPIN_DROP = 0.12;
/** Duração do rodopio de 360° (s). */
const SPIN_SECONDS = 0.7;
/** Quique máximo (m) e o do "Reduzir efeitos". */
const HOP_MAX = 0.35;
const HOP_REDUCED = 0.04;
/** Squash máximo (fração do comprimento) e stretch do nitro/impulso. */
const SQUASH_MAX = 0.16;
const STRETCH = 0.12;
/** Velocidade com que a guinada entra e sai (1/s, suavização exponencial: nunca passa do alvo). */
const DRIFT_IN = 12;
const DRIFT_OUT = 10;

export interface MotionInput {
  driftDir: number; driftTicks: number; driftBoostTicks: number; nitroTicks: number; collisionCooldown: number;
  speed: number; /** Velocidade máxima da corrida (car.stats.topSpeed). */ maxSpeed: number;
  /** "Reduzir efeitos": sem rodopio, sem squash/stretch e sem estrelinhas (a guinada é pose, fica). */
  reduce: boolean;
}

export interface Motion {
  /** Guinada da derrapagem (rad, sinal de driftDir). */
  drift: number;
  /** Rodopio ou balanço da batida (rad), somado à guinada. 0 fora da batida. */
  spin: number;
  /** Quique (m, nunca negativo). */
  hop: number;
  /** Escala do carro: o volume se conserva (sx · sy · sz = 1). sz é o comprimento. */
  sx: number; sy: number; sz: number;
  /** Segundos desde a batida enquanto as estrelinhas estão acesas; −1 fora disso. */
  starsT: number;
  // Interno (bordas e relógios).
  cd: number; speed: number; nitro: number; boost: number; seen: boolean;
  hitT: number; hitDir: number; hitH: number; hitSpin: boolean; hitAmp: number; hits: number;
  sqT: number; sqQ: number;
}

export function newMotion(): Motion {
  return {
    drift: 0, spin: 0, hop: 0, sx: 1, sy: 1, sz: 1, starsT: -1,
    cd: 0, speed: 0, nitro: 0, boost: 0, seen: false, hitT: -1, hitDir: 1, hitH: 0, hitSpin: false, hitAmp: 0, hits: 0, sqT: -1, sqQ: 0,
  };
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Avança `dt` segundos. Chamar uma vez por quadro por carro. */
export function stepMotion(m: Motion, e: MotionInput, dt: number): void {
  // Guinada da derrapagem: exponencial para o alvo (entra em ~0,2 s, sai em ~0,25 s, sem ultrapassar).
  const target = e.driftDir * DRIFT_YAW;
  const rate = e.driftDir !== 0 ? DRIFT_IN : DRIFT_OUT;
  m.drift += (target - m.drift) * (1 - Math.exp(-rate * Math.max(0, dt)));
  if (Math.abs(m.drift) < 1e-4 && target === 0) m.drift = 0;

  // Bordas. No primeiro quadro só se guarda o que já estava (um carro que entra na cena em cooldown não rodopia).
  const first = !m.seen;
  const hit = !first && e.collisionCooldown > m.cd && m.cd === 0;
  const nitroStart = !first && e.nitroTicks > 0 && m.nitro === 0;
  const boostStart = !first && e.driftBoostTicks > 0 && m.boost === 0;
  const drop = e.maxSpeed > 0 ? (m.speed - e.speed) / e.maxSpeed : 0;
  m.seen = true; m.cd = e.collisionCooldown; m.speed = e.speed; m.nitro = e.nitroTicks; m.boost = e.driftBoostTicks;

  if (hit) {
    const sev = clamp01(drop / SPIN_DROP);
    m.hits++;
    m.hitT = 0;
    m.hitDir = m.hits % 2 === 0 ? -1 : 1;
    m.hitSpin = drop >= SPIN_DROP && !e.reduce;
    m.hitH = e.reduce ? HOP_REDUCED : 0.08 + (HOP_MAX - 0.08) * sev; // quem é batido (drop ≤ 0) também dá o seu pulinho
    m.hitAmp = e.reduce ? 0 : 0.15 + 0.45 * sev; // balanço quando não dá a volta
    if (!e.reduce) { m.sqT = 0; m.sqQ = SQUASH_MAX * (0.55 + 0.45 * sev); m.starsT = 0; }
  } else if ((nitroStart || boostStart) && !e.reduce) {
    m.sqT = 0; m.sqQ = -STRETCH;
  }

  // Relógio da batida: rodopio, quique em duas pancadas e balanço.
  if (m.hitT >= 0) {
    m.hitT += dt;
    const t = m.hitT;
    const T = 0.28 + 0.4 * m.hitH;
    if (t < T) m.hop = 4 * m.hitH * (t / T) * (1 - t / T);
    else if (t < T * 1.6) { const u = (t - T) / (T * 0.6); m.hop = 4 * (m.hitH * 0.25) * u * (1 - u); } else m.hop = 0;
    if (m.hitSpin) {
      const u = t / SPIN_SECONDS;
      m.spin = u >= 1 ? 0 : m.hitDir * Math.PI * 2 * (1 - (1 - u) ** 3);
    } else {
      m.spin = t < 0.9 ? m.hitDir * m.hitAmp * Math.exp(-t * 5) * Math.sin(t * 22) : 0;
    }
    if (t >= SPIN_SECONDS * 1.6 + 0.05) { m.hitT = -1; m.hop = 0; m.spin = 0; }
  }

  // Estrelinhas.
  if (m.starsT >= 0) {
    if (!hit) m.starsT += dt;
    if (m.starsT >= STARS_SECONDS) m.starsT = -1;
  }

  // Squash & stretch: mola amortecida, volume constante.
  if (m.sqT >= 0) {
    m.sqT += dt;
    const q = m.sqQ * Math.exp(-m.sqT * 9) * Math.cos(m.sqT * 28);
    if (m.sqT > 0.9 || Math.abs(q) < 1e-3) { m.sqT = -1; m.sx = 1; m.sy = 1; m.sz = 1; } else {
      m.sz = 1 - q;
      m.sx = m.sy = 1 / Math.sqrt(m.sz);
    }
  }
}
