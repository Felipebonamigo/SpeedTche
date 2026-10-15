// M4 — o que o carro faz na pista além de andar, SÓ visual (src/render/cars/motion.ts, puro): a guinada da derrapagem
// (~0,35 rad, do lado de `driftDir`), o rodopio, o quique, o squash & stretch e o relógio das estrelinhas da batida.
// Tudo é lido do estado que já existe (driftDir/driftTicks, collisionCooldown, speed, nitroTicks, driftBoostTicks); nada vai ao núcleo.
// V8 (docs/ondas/V8-efeitos.md): rodopio de 360°, squash & stretch e estrelinhas são a opção "Efeitos de cartum" (`cartoon`); no padrão a batida é
// um tranco (guinada pequena e quique baixo). Os testes do cartum ligam `cartoon: true`; os do padrão estão no fim.
import { describe, expect, it } from 'vitest';
import { DRIFT_YAW, STARS_SECONDS, newMotion, stepMotion, type Motion, type MotionInput } from '../src/render/cars/motion';

const DT = 1 / 60;
const IDLE: MotionInput = { driftDir: 0, driftTicks: 0, driftBoostTicks: 0, nitroTicks: 0, collisionCooldown: 0, speed: 3000, maxSpeed: 5000, reduce: false };

/** Roda `seconds` de quadros de 1/60 s; `at(t)` devolve o que o estado diz naquele instante; `watch` olha a cada quadro. */
function run(m: Motion, seconds: number, at: (t: number) => Partial<MotionInput>, watch?: (t: number) => void): void {
  const n = Math.round(seconds / DT);
  for (let k = 0; k < n; k++) {
    const t = k * DT;
    stepMotion(m, { ...IDLE, ...at(t) }, DT);
    watch?.(t + DT);
  }
}

describe('guinada da derrapagem', () => {
  it('sem derrapar não há guinada; derrapando, sobe a ~0,35 rad do lado de driftDir e não passa disso', () => {
    expect(DRIFT_YAW).toBeCloseTo(0.35, 6);
    for (const dir of [1, -1]) {
      const m = newMotion();
      let peak = 0;
      run(m, 0.2, () => ({}));
      expect(m.drift).toBe(0);
      run(m, 1, (t) => ({ driftDir: dir, driftTicks: 1 + Math.round(t * 60) }), () => { peak = Math.max(peak, Math.abs(m.drift)); });
      expect(Math.sign(m.drift)).toBe(dir);
      expect(Math.abs(m.drift)).toBeGreaterThan(0.34);
      expect(peak).toBeLessThanOrEqual(DRIFT_YAW + 1e-6);
    }
  });

  it('entra em ~0,2 s (não de uma vez) e volta a zero depois de soltar', () => {
    const m = newMotion();
    run(m, 0.04, (t) => ({ driftDir: 1, driftTicks: 1 + Math.round(t * 60) }));
    expect(m.drift).toBeGreaterThan(0);
    expect(m.drift).toBeLessThan(DRIFT_YAW * 0.5);
    run(m, 0.5, (t) => ({ driftDir: 1, driftTicks: 3 + Math.round(t * 60) }));
    expect(m.drift).toBeGreaterThan(DRIFT_YAW * 0.97);
    run(m, 0.7, () => ({ driftDir: 0, driftTicks: 0 }));
    expect(Math.abs(m.drift)).toBeLessThan(0.005);
  });

  it('a guinada vale também com "Reduzir efeitos" (é a pose da derrapagem, não um efeito)', () => {
    const m = newMotion();
    run(m, 0.8, (t) => ({ driftDir: -1, driftTicks: 1 + Math.round(t * 60), reduce: true }));
    expect(m.drift).toBeLessThan(-0.3);
  });
});

/** A batida: o `collisionCooldown` sobe de 0 para 20 no quadro em que o núcleo a registra; a velocidade cai junto. `cartoon`: a opção "Efeitos de cartum". */
const hit = (dropFraction: number, cartoon = true) => (t: number): Partial<MotionInput> => {
  if (t < 0.2) return { speed: 4000, cartoon };
  const after = 4000 - dropFraction * 5000;
  return { speed: after, collisionCooldown: Math.max(0, 20 - Math.round((t - 0.2) * 60)), cartoon };
};

describe('batida com "Efeitos de cartum": rodopio, quique e squash & stretch', () => {
  it('batida forte (queda ≥ 12% da máxima): gira ~360° em menos de 0,8 s e volta a zero', () => {
    const m = newMotion();
    let peak = 0; let hopPeak = 0; let neg = false; let tAtPeak = 0;
    run(m, 1.6, hit(0.4), (t) => {
      if (Math.abs(m.spin) > peak) { peak = Math.abs(m.spin); tAtPeak = t; }
      hopPeak = Math.max(hopPeak, m.hop); if (m.hop < 0) neg = true;
    });
    expect(peak).toBeGreaterThan(Math.PI * 2 - 0.15);
    expect(peak).toBeLessThanOrEqual(Math.PI * 2 + 1e-6);
    expect(tAtPeak - 0.2).toBeLessThan(0.8);
    expect(m.spin).toBe(0);
    expect(hopPeak).toBeGreaterThan(0.1);
    expect(hopPeak).toBeLessThanOrEqual(0.35 + 1e-6);
    expect(neg).toBe(false);
    expect(m.hop).toBe(0);
  });

  it('batida leve (queda de 3%): quica e balança, mas não dá a volta', () => {
    const m = newMotion();
    let peak = 0; let hopPeak = 0;
    run(m, 1.2, hit(0.03), () => { peak = Math.max(peak, Math.abs(m.spin)); hopPeak = Math.max(hopPeak, m.hop); });
    expect(peak).toBeLessThan(1.2);
    expect(peak).toBeGreaterThan(0.05);
    expect(hopPeak).toBeGreaterThan(0.03);
  });

  it('quem é batido (a velocidade SOBE no quadro da batida) só quica', () => {
    const m = newMotion();
    let peak = 0; let hopPeak = 0;
    run(m, 1.2, (t) => (t < 0.2 ? { speed: 3000, cartoon: true } : { speed: 3400, collisionCooldown: Math.max(0, 20 - Math.round((t - 0.2) * 60)), cartoon: true }), () => { peak = Math.max(peak, Math.abs(m.spin)); hopPeak = Math.max(hopPeak, m.hop); });
    expect(peak).toBeLessThan(1.2);
    expect(hopPeak).toBeGreaterThan(0.03);
  });

  it('squash & stretch conserva o volume e fica entre −16% e +16%', () => {
    const m = newMotion();
    let minZ = 9; let maxZ = 0; let worst = 0;
    run(m, 1.2, hit(0.4), () => {
      minZ = Math.min(minZ, m.sz); maxZ = Math.max(maxZ, m.sz);
      worst = Math.max(worst, Math.abs(m.sx * m.sy * m.sz - 1));
    });
    expect(minZ).toBeLessThan(0.95); // achata no impacto
    expect(minZ).toBeGreaterThanOrEqual(0.84 - 1e-6);
    expect(maxZ).toBeLessThanOrEqual(1.16 + 1e-6);
    expect(worst).toBeLessThan(0.03);
    expect([m.sx, m.sy, m.sz]).toEqual([1, 1, 1]);
  });

  it('o nitro e o impulso da derrapagem esticam o carro na largada do efeito (stretch) e voltam', () => {
    for (const key of ['nitroTicks', 'driftBoostTicks'] as const) {
      const m = newMotion();
      let peak = 1;
      run(m, 1, (t) => (t < 0.2 ? { cartoon: true } : { [key]: 90, cartoon: true }), () => { peak = Math.max(peak, m.sz); });
      expect(peak, key).toBeGreaterThan(1.05);
      expect(peak, key).toBeLessThanOrEqual(1.16 + 1e-6);
      expect(m.sz, key).toBeCloseTo(1, 1); // com o efeito ainda aceso, já assentou
      expect(Math.abs(m.sx * m.sy * m.sz - 1), key).toBeLessThan(0.03);
    }
  });

  it('o carro que já entra na cena com o nitro aceso ou em cooldown não reage (nada de rodopio fantasma)', () => {
    const m = newMotion();
    let peak = 0;
    run(m, 0.6, () => ({ nitroTicks: 80, collisionCooldown: 12, speed: 1000, cartoon: true }), () => { peak = Math.max(peak, Math.abs(m.spin), m.hop, Math.abs(m.sz - 1)); });
    expect(peak).toBe(0);
    expect(m.starsT).toBeLessThan(0);
  });
});

describe('estrelinhas da batida ("Efeitos de cartum")', () => {
  it('acendem na batida por ~0,9 s e apagam', () => {
    expect(STARS_SECONDS).toBeCloseTo(0.9, 6);
    const m = newMotion();
    const seen: number[] = [];
    run(m, 1.6, hit(0.4), (t) => { if (t >= 0.2) seen.push(m.starsT); });
    expect(seen[1]).toBeGreaterThanOrEqual(0); // logo após a batida
    const on = seen.filter((s) => s >= 0).length * DT;
    expect(on).toBeGreaterThan(STARS_SECONDS - 0.1);
    expect(on).toBeLessThan(STARS_SECONDS + 0.1);
    expect(m.starsT).toBeLessThan(0);
  });
});

describe('"Reduzir efeitos"', () => {
  it('mesmo com "Efeitos de cartum": sem rodopio, sem squash e sem estrelinhas; o carro só dá o tranco do quique pequeno', () => {
    const m = newMotion();
    let spin = 0; let sq = 0; let stars = false; let hop = 0;
    run(m, 1.2, (t) => ({ ...hit(0.4)(t), reduce: true }), () => { spin = Math.max(spin, Math.abs(m.spin)); sq = Math.max(sq, Math.abs(m.sz - 1)); if (m.starsT >= 0) stars = true; hop = Math.max(hop, m.hop); });
    expect(spin).toBe(0);
    expect(sq).toBe(0);
    expect(stars).toBe(false);
    expect(hop).toBeGreaterThan(0.01); // o tranco existe, só sem o espetáculo
    expect(hop).toBeLessThan(0.1);
  });
});

describe('padrão realista (V8): a batida é um tranco, não desenho animado', () => {
  it('batida forte: guinada curta de 3° a 12° que volta a zero, quique de 2 a 12 cm, sem rodopio, sem squash & stretch e sem estrelinhas', () => {
    for (const cartoon of [undefined, false]) {
      const m = newMotion();
      let spin = 0; let hop = 0; let sq = 0; let stars = false;
      run(m, 1.6, (t) => ({ ...hit(0.4, false)(t), cartoon }), () => {
        spin = Math.max(spin, Math.abs(m.spin)); hop = Math.max(hop, m.hop); sq = Math.max(sq, Math.abs(m.sz - 1), Math.abs(m.sx - 1));
        if (m.starsT >= 0) stars = true;
      });
      expect(spin, `guinada (${cartoon})`).toBeGreaterThanOrEqual(0.05);
      expect(spin, `guinada (${cartoon})`).toBeLessThanOrEqual(0.21);
      expect(hop, `quique (${cartoon})`).toBeGreaterThanOrEqual(0.02);
      expect(hop, `quique (${cartoon})`).toBeLessThanOrEqual(0.12);
      expect(sq, `squash (${cartoon})`).toBe(0);
      expect(stars, `estrelinhas (${cartoon})`).toBe(false);
      expect(m.spin).toBe(0); expect(m.hop).toBe(0);
    }
  });

  it('o nitro e o impulso da derrapagem não esticam o carro', () => {
    for (const key of ['nitroTicks', 'driftBoostTicks'] as const) {
      const m = newMotion();
      let sq = 0;
      run(m, 1, (t) => (t < 0.2 ? {} : { [key]: 90 }), () => { sq = Math.max(sq, Math.abs(m.sz - 1)); });
      expect(sq, key).toBe(0);
    }
  });
});
