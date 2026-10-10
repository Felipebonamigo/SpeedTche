// Derrapagem (onda M, frente M1; cartão em docs/ondas/M/M1.md): o estado, a mecânica no stepRace, o hash, a serialização,
// a IA e a direção assistida. Os testes foram escritos ANTES do código e vistos falhar pelo motivo certo (campo ou
// constante inexistente, resultado errado). Constantes de ajuste fino não são travadas com número exato: trava-se a
// relação (impulso < nitro, perda pequena, centrífuga ≈ ×0,55).
import { describe, expect, it } from 'vitest';
import {
  AI_BRAKE_CURVE, AI_DRIFT_CORNER_GAIN, AI_DRIFT_MIN_SEGMENTS, COLLISION_COOLDOWN_TICKS, DRIFT_BOOST_ACCEL_MULT, DRIFT_BOOST_SPEED_MULT, DRIFT_BOOST_TICKS, DRIFT_CHARGE_MIN_CURVE,
  DRIFT_ENTRY_STEER, DRIFT_LEVEL_TICKS, DRIFT_PULL, NITRO_ACCEL_MULT, NITRO_DURATION_TICKS, NITRO_SPEED_MULT, OFFROAD_X, SEGMENT_LENGTH,
  TICK_RATE,
} from '../src/core/constants';
import { carDef } from '../src/core/data/cars';
import { deserializeRace, hashRace, serializeRace } from '../src/core/serialize';
import { assistInput } from '../src/core/sim/assist';
import { brakingTarget, cornerHoldable, counterSteer } from '../src/core/sim/ai';
import { effectiveTopSpeed, holdableSpeedFraction, NO_MODIFIERS } from '../src/core/sim/physics';
import { stepRace } from '../src/core/sim/race';
import { carStats } from '../src/core/sim/stats';
import { getTrack, segmentAt } from '../src/core/track';
import { NEUTRAL_INPUT, type AssistLevel, type CarState, type PlayerInput, type RaceState, type SimEvent, type Track } from '../src/core/types';
import { GUARD_SCENARIOS, GUARD_TICKS, legacyTrace } from './drift-legacy';
import { ALL_ASSISTS, human, humanCar, quickRace, run, skipCountdown, syntheticTrack } from './helpers';

// ───────────────────────────── Apoio ─────────────────────────────

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const inp = (p: Partial<PlayerInput>): PlayerInput => ({ ...NEUTRAL_INPUT, throttle: true, ...p });

/** Reta, uma curva constante (`bend`: sem rampa) e reta de novo. Os segmentos 4–39 são box (o builder o põe sozinho). */
function curved(curve: number, length = 400, lead = 60): Track {
  return syntheticTrack([{ op: 'straight', length: lead }, { op: 'bend', length, curve }, { op: 'straight', length: 200 }]);
}

/** Um humano no meio da corrida: no segmento `seg` da pista, no centro, com a fração dada da velocidade máxima. */
function setup(track: Track, seg: number, speedFrac = 0.8, carId = 'falcao'): { state: RaceState; car: CarState } {
  const { state } = quickRace({ track, totalCars: 1, humans: [human(0, 0, carId)] });
  skipCountdown(state, track);
  const car = humanCar(state);
  car.z = seg * SEGMENT_LENGTH + 1;
  car.x = 0;
  car.speed = carStats(car).topSpeed * speedFrac;
  return { state, car };
}

/** Um tick com a entrada dada; devolve os eventos desse tick. */
function step(state: RaceState, track: Track, input: PlayerInput): SimEvent[] {
  stepRace(state, track, [input]);
  return state.events;
}

/**
 * Derrapando de verdade: `ticks` ticks com o botão, o volante `side` no primeiro e, depois, `steerAfter` (ou, sem ele, um
 * volante que segura a faixa).
 */
function drift(state: RaceState, track: Track, car: CarState, side: number, ticks: number, steerAfter?: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const steer = i === 0 ? side : steerAfter ?? clamp(-car.x * 3, -1, 1);
    events.push(...step(state, track, inp({ drift: true, steer })));
  }
  return events;
}

/** Põe uma derrapagem ativa de carga `charge` no carro (o estado é JSON puro) para testar o que a cancela. */
function injectDrift(car: CarState, charge = 120, dir = 1): void {
  car.driftDir = dir; car.driftTicks = charge + 10; car.driftCharge = charge;
}

const types = (events: SimEvent[], type: SimEvent['type']) => events.filter((e) => e.type === type);
/** Derrapando? (`?? 0`: antes da M1 o campo não existia; o teste tem de falhar pelo resultado, não por `undefined !== 0`.) */
const drifting = (c: CarState): boolean => (c.driftDir ?? 0) !== 0;

// ───────────────────────────── Estado e contrato ─────────────────────────────

describe('derrapagem: estado', () => {
  it('o carro nasce sem derrapar: os 4 campos em 0', () => {
    const { state } = quickRace({ totalCars: 6 });
    for (const c of state.cars) expect([c.driftDir, c.driftTicks, c.driftCharge, c.driftBoostTicks], c.name).toEqual([0, 0, 0, 0]);
  });

  it('hashRace enxerga cada um dos 4 campos (senão a checagem de dessincronia a cada 60 ticks não vê a derrapagem)', () => {
    for (const key of ['driftDir', 'driftTicks', 'driftCharge', 'driftBoostTicks'] as const) {
      const { state } = quickRace({ totalCars: 4 });
      const before = hashRace(state);
      state.cars[1][key] = key === 'driftDir' ? 1 : 7;
      expect(hashRace(state), key).not.toBe(before);
    }
  });

  it('deserializeRace dá padrão 0 a um estado antigo e sanea lixo; o que é válido passa', () => {
    const { state } = quickRace({ totalCars: 4 });
    const legacy = JSON.parse(serializeRace(state)) as { cars: Array<Record<string, unknown>> };
    for (const c of legacy.cars) { delete c.driftDir; delete c.driftTicks; delete c.driftCharge; delete c.driftBoostTicks; }
    for (const c of deserializeRace(JSON.stringify(legacy)).cars) expect([c.driftDir, c.driftTicks, c.driftCharge, c.driftBoostTicks], c.name).toEqual([0, 0, 0, 0]);

    const junk = JSON.parse(serializeRace(state)) as { cars: Array<Record<string, unknown>> };
    junk.cars[0].driftDir = 7; junk.cars[0].driftTicks = 'x'; junk.cars[0].driftCharge = -5; junk.cars[0].driftBoostTicks = null;
    const c0 = deserializeRace(JSON.stringify(junk)).cars[0];
    expect([c0.driftDir, c0.driftTicks, c0.driftCharge, c0.driftBoostTicks]).toEqual([0, 0, 0, 0]);

    const good = JSON.parse(serializeRace(state)) as { cars: Array<Record<string, unknown>> };
    Object.assign(good.cars[1], { driftDir: -1, driftTicks: 12, driftCharge: 50, driftBoostTicks: 7 });
    const c1 = deserializeRace(JSON.stringify(good)).cars[1];
    expect([c1.driftDir, c1.driftTicks, c1.driftCharge, c1.driftBoostTicks]).toEqual([-1, 12, 50, 7]);
  });
});

// ───────────────────────────── Entrar e manter ─────────────────────────────

describe('derrapagem: entrar', () => {
  it('entra com o botão, o volante e a velocidade; o lado é o do volante', () => {
    for (const side of [1, -1]) {
      const track = curved(3 * side);
      const { state, car } = setup(track, 60);
      step(state, track, inp({ drift: true, steer: side }));
      expect(car.driftDir, `lado ${side}`).toBe(side);
      expect(car.driftTicks).toBe(1);
    }
  });

  const blocked: Array<[string, (s: { state: RaceState; car: CarState }) => void, number?]> = [
    ['sem volante', () => undefined, 0],
    ['volante abaixo do mínimo de entrada', () => undefined, 0.5 * DRIFT_ENTRY_STEER],
    ['devagar', (s) => { s.car.speed = carStats(s.car).topSpeed * 0.2; }],
    ['na grama', (s) => { s.car.x = OFFROAD_X + 0.2; }],
    ['com a corrida acabada', (s) => { s.car.finished = true; }],
    ['no cooldown de uma batida', (s) => { s.car.collisionCooldown = 5; }],
  ];
  it.each(blocked)('não entra: %s', (_name, setupFn, steer) => {
    const track = curved(3);
    const s = setup(track, 60);
    setupFn(s);
    step(s.state, track, inp({ drift: true, steer: steer ?? 1 }));
    expect(s.car.driftDir).toBe(0);
  });

  it('não entra sem o botão, nem com volante e velocidade', () => {
    const track = curved(3);
    const { state, car } = setup(track, 60);
    step(state, track, inp({ drift: false, steer: 1 }));
    expect(car.driftDir).toBe(0);
  });

  it('não entra no box', () => {
    const track = curved(3);
    const { state, car } = setup(track, 10); // segmentos 4–39: box
    car.x = 1.5;
    step(state, track, inp({ drift: true, steer: 1 }));
    expect(car.driftDir).toBe(0);
  });

  it('não entra na contagem', () => {
    const track = curved(3);
    const { state } = quickRace({ track, totalCars: 1 });
    expect(state.phase).toBe('countdown');
    step(state, track, inp({ drift: true, steer: 1 }));
    expect(humanCar(state).driftDir).toBe(0);
  });
});

// ───────────────────────────── O efeito na física ─────────────────────────────

describe('derrapagem: física', () => {
  it('a centrífuga cai a ×0,55: mesma curva e mesma velocidade, o deslocamento lateral por tick é 0,55 do de quem não derrapa', () => {
    const track = curved(3);
    const measure = (on: boolean): number => {
      const { state, car } = setup(track, 60);
      const speed = car.speed;
      if (on) {
        step(state, track, inp({ drift: true, steer: 1 }));
        car.x = 0; car.speed = speed;
      }
      const x0 = car.x;
      // Com o puxão para dentro anulado pelo volante (volante efetivo 0) sobra só a centrífuga.
      step(state, track, inp({ drift: on, steer: on ? -DRIFT_PULL : 0 }));
      return car.x - x0;
    };
    const plain = measure(false);
    const drifted = measure(true);
    expect(plain).toBeLessThan(0); // curva à direita joga para a esquerda
    expect(Math.abs(drifted / plain - 0.55)).toBeLessThan(0.03);
  });

  it('o volante puxa para dentro: derrapando e com o volante solto, o carro vira para o lado da derrapagem', () => {
    for (const side of [1, -1]) {
      const track = syntheticTrack(); // reta: nada empurra para os lados
      const a = setup(track, 100);
      const b = setup(track, 100);
      step(b.state, track, inp({ drift: true, steer: side }));
      b.car.x = 0;
      for (let i = 0; i < 30; i++) { step(a.state, track, inp({})); step(b.state, track, inp({ drift: true, steer: 0 })); }
      expect(a.car.x).toBe(0);
      expect(b.car.x * side, `lado ${side}`).toBeGreaterThan(0.05);
    }
  });

  it('perde um pouco de velocidade: depois de 1 s derrapando, entre 0 e 10% da máxima a menos', () => {
    const track = syntheticTrack();
    const a = setup(track, 100);
    const b = setup(track, 100);
    step(b.state, track, inp({ drift: true, steer: 1 }));
    step(a.state, track, inp({}));
    for (let i = 0; i < TICK_RATE; i++) { step(a.state, track, inp({})); step(b.state, track, inp({ drift: true, steer: -DRIFT_PULL })); }
    const loss = a.car.speed - b.car.speed;
    expect(loss).toBeGreaterThan(0);
    expect(loss).toBeLessThan(0.1 * carStats(a.car).topSpeed);
  });
});

// ───────────────────────────── A carga ─────────────────────────────

describe('derrapagem: carga', () => {
  it('sobe em 3 níveis nos limiares, com um evento drift_charge por nível, em ordem; satura no terceiro', () => {
    const track = curved(3);
    const { state, car } = setup(track, 60);
    const levelAt: number[] = [];
    const seen: Array<{ level: number; tick: number }> = [];
    for (let i = 1; i <= 200; i++) {
      const events = step(state, track, inp({ drift: true, steer: i === 1 ? 1 : clamp(-car.x * 3, -1, 1) }));
      for (const e of types(events, 'drift_charge')) seen.push({ level: (e as { level: number }).level, tick: i });
      levelAt.push(car.driftCharge);
    }
    expect(car.driftDir, 'ficou derrapando').toBe(1);
    expect(seen.map((e) => e.level)).toEqual([1, 2, 3]);
    expect(seen.map((e) => e.tick)).toEqual([...DRIFT_LEVEL_TICKS]); // carga = ticks derrapando em curva forte, a partir do 1º
    expect(DRIFT_LEVEL_TICKS[0]).toBeGreaterThan(20);
    expect(DRIFT_LEVEL_TICKS[2]).toBeLessThan(240);
    expect(Math.max(...levelAt)).toBe(DRIFT_LEVEL_TICKS[2]);
    expect(car.driftCharge).toBe(DRIFT_LEVEL_TICKS[2]);
    expect(car.driftTicks).toBe(200);
  });

  it.each([
    ['em reta', syntheticTrack(), 100, 1],
    ['em curva abaixo do limiar', curved(0.5), 60, 1],
    ['em curva para o outro lado', curved(3), 58, -1],
  ] as const)('não sobe: %s', (_name, track, seg, side) => {
    expect(DRIFT_CHARGE_MIN_CURVE).toBeGreaterThan(0.5);
    const { state, car } = setup(track, seg);
    // "Outro lado": entra com o volante para a esquerda e segue para dentro da curva à direita, com o volante quase solto.
    drift(state, track, car, side, 40, side === -1 ? 0.3 : undefined);
    expect(car.driftDir, 'derrapou').toBe(side);
    expect(car.driftCharge).toBe(0);
  });
});

// ───────────────────────────── Soltar: o impulso ─────────────────────────────

describe('derrapagem: soltar', () => {
  it.each([[1], [2], [3]])('soltar com a carga do nível %i dá o impulso de DRIFT_BOOST_TICKS[nível-1] ticks e o evento drift_boost', (level) => {
    const track = curved(3);
    const { state, car } = setup(track, 60);
    drift(state, track, car, 1, DRIFT_LEVEL_TICKS[level - 1] + 2);
    expect(car.driftCharge).toBeGreaterThanOrEqual(DRIFT_LEVEL_TICKS[level - 1]);
    const events = step(state, track, inp({ drift: false, steer: 0 }));
    expect(car.driftBoostTicks).toBe(DRIFT_BOOST_TICKS[level - 1]);
    expect(types(events, 'drift_boost')).toEqual([{ type: 'drift_boost', carId: car.id, level }]);
    expect([car.driftDir, car.driftTicks, car.driftCharge]).toEqual([0, 0, 0]);
    // O impulso vale exatamente N ticks: a velocidade máxima efetiva sobe enquanto o relógio anda, e volta depois.
    const def = carStats(car);
    let boosted = 1; // o tick da soltura já conta
    for (let i = 0; i < DRIFT_BOOST_TICKS[level - 1] + 5; i++) {
      step(state, track, inp({ steer: clamp(-car.x * 3, -1, 1) }));
      const top = effectiveTopSpeed(car, def, state, NO_MODIFIERS);
      if (car.driftBoostTicks > 0) { boosted++; expect(top / def.topSpeed).toBeCloseTo(DRIFT_BOOST_SPEED_MULT, 9); } else expect(top).toBe(def.topSpeed);
    }
    expect(boosted).toBe(DRIFT_BOOST_TICKS[level - 1]);
  });

  it('as durações são 0,5, 1,0 e 1,5 s', () => {
    expect([...DRIFT_BOOST_TICKS].map((t) => t / TICK_RATE)).toEqual([0.5, 1, 1.5]);
  });

  it('soltar sem carga (nível 0) não dá impulso nem evento, e para de derrapar', () => {
    const track = curved(3);
    const { state, car } = setup(track, 60);
    drift(state, track, car, 1, 10);
    expect(car.driftDir).toBe(1);
    const events = step(state, track, inp({ drift: false }));
    expect(car.driftDir).toBe(0);
    expect(car.driftBoostTicks).toBe(0);
    expect(types(events, 'drift_boost')).toHaveLength(0);
  });

  const cancels: Array<[string, (s: { state: RaceState; car: CarState }) => void, boolean]> = [
    ['na grama', (s) => { s.car.x = OFFROAD_X + 0.2; }, true],
    ['na grama, soltando o botão', (s) => { s.car.x = OFFROAD_X + 0.2; }, false],
    ['no box', (s) => { s.car.z = 10 * SEGMENT_LENGTH + 1; s.car.x = 1.5; }, true],
    ['numa batida (cooldown)', (s) => { s.car.collisionCooldown = COLLISION_COOLDOWN_TICKS; }, false],
    ['com o carro quase parado', (s) => { s.car.speed = carStats(s.car).topSpeed * 0.1; }, true],
    ['com a corrida acabada', (s) => { s.car.finished = true; }, false],
  ];
  it.each(cancels)('cancela sem impulso e zera o estado: %s', (_name, cause, holding) => {
    const track = curved(3);
    const s = setup(track, 60);
    injectDrift(s.car, DRIFT_LEVEL_TICKS[1] + 5);
    cause(s);
    const events = step(s.state, track, inp({ drift: holding, steer: 0.5, throttle: holding }));
    expect([s.car.driftDir, s.car.driftTicks, s.car.driftCharge, s.car.driftBoostTicks]).toEqual([0, 0, 0, 0]);
    expect(types(events, 'drift_boost')).toHaveLength(0);
  });

  it('batida traseira de verdade cancela a derrapagem no tick seguinte, sem impulso (e não é a velocidade que cancela)', () => {
    const track = syntheticTrack();
    const { state } = quickRace({ track, totalCars: 2, humans: [human(0, 0, 'falcao'), human(1, 1, 'trovao')] });
    skipCountdown(state, track);
    const rear = humanCar(state, 0); const front = humanCar(state, 1);
    for (const c of [rear, front]) { c.z = 100 * SEGMENT_LENGTH; c.x = 0; }
    front.z += 1.5 * SEGMENT_LENGTH; // 300 u à frente: a caixa de colisão é de 200 u
    front.speed = carStats(front).topSpeed * 0.6;
    rear.speed = carStats(rear).topSpeed * 0.8;
    injectDrift(rear, DRIFT_LEVEL_TICKS[1] + 5);
    const all: SimEvent[] = [];
    let hitTick = -1;
    for (let i = 0; i < 60 && hitTick < 0; i++) {
      stepRace(state, track, [inp({ drift: true, steer: 0 }), inp({})]);
      all.push(...state.events);
      if (types(state.events, 'collision').length > 0) hitTick = state.tick;
    }
    expect(hitTick, 'houve batida').toBeGreaterThan(0);
    // No tick da batida o cooldown acabou de ser posto (a colisão roda depois da física): a derrapagem ainda vale...
    stepRace(state, track, [inp({ drift: true, steer: 0 }), inp({})]);
    all.push(...state.events);
    // ...e no tick seguinte ela cai, sem impulso, com o carro ainda rápido (quem cancela é a batida, não a velocidade).
    expect(rear.speed).toBeGreaterThan(carStats(rear).topSpeed * 0.35);
    expect([rear.driftDir, rear.driftBoostTicks]).toEqual([0, 0]);
    expect(types(all, 'drift_boost')).toHaveLength(0);
  });
});

// ───────────────────────────── Impulso × nitro ─────────────────────────────

describe('derrapagem: impulso menor que o nitro e sem somar', () => {
  it('multiplicador, aceleração e duração máxima do impulso ficam abaixo dos do nitro (mas acima de 1)', () => {
    expect(DRIFT_BOOST_SPEED_MULT).toBeGreaterThan(1);
    expect(DRIFT_BOOST_SPEED_MULT).toBeLessThan(NITRO_SPEED_MULT);
    expect(DRIFT_BOOST_ACCEL_MULT).toBeGreaterThan(1);
    expect(DRIFT_BOOST_ACCEL_MULT).toBeLessThan(NITRO_ACCEL_MULT);
    expect(DRIFT_BOOST_TICKS[DRIFT_BOOST_TICKS.length - 1]).toBeLessThan(NITRO_DURATION_TICKS);
  });

  it('com o nitro e o impulso juntos, a velocidade máxima é a do nitro (não soma)', () => {
    const { state, car } = setup(syntheticTrack(), 100);
    const def = carStats(car);
    car.nitroTicks = 50;
    const nitro = effectiveTopSpeed(car, def, state, NO_MODIFIERS);
    car.driftBoostTicks = 50;
    expect(effectiveTopSpeed(car, def, state, NO_MODIFIERS)).toBe(nitro);
    car.nitroTicks = 0;
    expect(effectiveTopSpeed(car, def, state, NO_MODIFIERS)).toBeCloseTo(def.topSpeed * DRIFT_BOOST_SPEED_MULT, 6);
  });
});

// ───────────────────────────── Determinismo ─────────────────────────────

describe('derrapagem: determinismo e serialização', () => {
  const TRACK = getTrack('serra_do_mar');
  /** Humano de roteiro que derrapa em toda curva forte e segura a faixa: só lê o estado. */
  const drifter = (state: RaceState): PlayerInput => {
    const car = humanCar(state);
    const seg = segmentAt(TRACK, car.z);
    const def = carStats(car);
    const sf = Math.min(1, car.speed / def.topSpeed);
    const strong = Math.abs(seg.curve) >= 2 && sf > 0.5;
    const steer = clamp(counterSteer(def, sf, seg.curve) + (0.1 - car.x) * 3, -1, 1);
    return inp({ steer: strong && car.driftDir === 0 ? Math.sign(seg.curve) : steer, drift: strong });
  };
  const race = () => quickRace({ track: TRACK, humans: [human(0)], totalCars: 8, seed: 5 });

  it('duas corridas com a mesma derrapagem dão o mesmo estado; serializar no meio da derrapagem e continuar também', () => {
    const a = race(); const b = race();
    let drifted = 0;
    let snap: { json: string; tick: number } | null = null;
    let later: string | null = null;
    for (let i = 0; i < 3000; i++) {
      run(a.state, a.track, 1, drifter);
      run(b.state, b.track, 1, drifter);
      if (drifting(humanCar(a.state))) drifted++;
      if (!snap && humanCar(a.state).driftCharge > 30) snap = { json: serializeRace(a.state), tick: a.state.tick };
      if (snap && a.state.tick === snap.tick + 400) later = serializeRace(a.state);
    }
    expect(drifted, 'o humano chegou a derrapar').toBeGreaterThan(100);
    expect(serializeRace(a.state)).toBe(serializeRace(b.state));
    expect(hashRace(a.state)).toBe(hashRace(b.state));
    expect(snap, 'havia uma derrapagem carregando para serializar').not.toBeNull();
    if (!snap || later === null) throw new Error('sem instantâneo no meio da derrapagem');
    // A cópia (tirada no meio de uma derrapagem) continua igual ao original dali em diante.
    const copy = deserializeRace(snap.json);
    for (let i = 0; i < 400; i++) run(copy, TRACK, 1, drifter);
    expect(serializeRace(copy)).toBe(later);
  }, 60_000);
});

// ───────────────────────────── Guarda: quem não derrapa anda como antes ─────────────────────────────

describe('derrapagem: quem não derrapa anda bit a bit como antes', () => {
  // Valores gravados em 640538f, ANTES de qualquer mudança da N1: o hash legado (a fórmula antiga do hashRace, sem os campos
  // novos e sem o do nitro) de corridas só de humanos sem derrapar e sem nitro. Passa antes e tem de passar depois: é a prova
  // de que `× 1` na centrífuga, o volante puro fora da derrapagem e a largada sem aperto na janela não mudaram nenhum bit.
  // (Eram '26959b71' e '54bd603a', gravados em 2ce0f48 com o nitro dos roteiros; o nitro mudou de propósito na N1.)
  const RECORDED: Record<string, string> = { 'guarda-contra-relogio': '7cdd19af', 'guarda-3-humanos-manual': '01fc925c' };
  for (const s of GUARD_SCENARIOS) {
    it(`${s.name}: ${GUARD_TICKS} ticks, hash legado de cada tick`, () => {
      expect(legacyTrace(s, GUARD_TICKS)).toBe(RECORDED[s.name]);
    }, 60_000);
  }
});

// ───────────────────────────── A IA ─────────────────────────────

/** Corrida de IA numa pista sintética, sem personalidades (o errático erra a frenagem de propósito) e com o humano parado atrás. */
function aiRace(track: Track, totalCars = 4, seed = 11): { state: RaceState; track: Track } {
  const { state } = quickRace({ track, humans: [human(0)], totalCars, seed });
  for (const c of state.cars) if (c.ai) delete c.ai.personality;
  return { state, track };
}

describe('derrapagem: a IA', () => {
  it('derrapa numa curva forte longa: carrega, solta e leva o impulso', () => {
    const { state, track } = aiRace(curved(4, 60, 120), 6);
    let driftTicks = 0; let charges = 0; let boosts = 0;
    for (let i = 0; i < TICK_RATE * 60; i++) {
      run(state, track, 1, () => NEUTRAL_INPUT);
      for (const c of state.cars) if (c.seat < 0 && drifting(c)) driftTicks++;
      charges += types(state.events, 'drift_charge').length;
      boosts += types(state.events, 'drift_boost').length;
    }
    expect(driftTicks).toBeGreaterThan(0);
    expect(charges).toBeGreaterThan(0);
    expect(boosts).toBeGreaterThan(0);
  });

  it.each([
    ['em reta', syntheticTrack([{ op: 'straight', length: 400 }])],
    ['em curva fraca (abaixo de AI_BRAKE_CURVE), mesmo comprida', curved(AI_BRAKE_CURVE * 0.7, 80, 120)],
    ['em curva forte curta (6 segmentos)', curved(4, 6, 120)],
  ] as const)('nunca derrapa %s', (_name, track) => {
    const { state } = aiRace(track, 6);
    for (let i = 0; i < TICK_RATE * 60; i++) {
      run(state, track, 1, () => NEUTRAL_INPUT);
      for (const c of state.cars) expect(drifting(c), `${c.name} no tick ${state.tick}`).toBe(false);
    }
  });

  it('solta no fim do trecho: o drift_boost sai nos últimos segmentos da curva', () => {
    const lead = 120; const length = 60;
    const { state, track } = aiRace(curved(4, length, lead), 4);
    const where: number[] = [];
    for (let i = 0; i < TICK_RATE * 60; i++) {
      run(state, track, 1, () => NEUTRAL_INPUT);
      for (const e of types(state.events, 'drift_boost')) {
        const car = state.cars[(e as { carId: number }).carId];
        where.push(Math.floor(car.z / SEGMENT_LENGTH) - (lead + length));
      }
    }
    expect(where.length).toBeGreaterThan(0);
    for (const w of where) { expect(w).toBeGreaterThanOrEqual(-8); expect(w).toBeLessThanOrEqual(4); }
  });

  // O ritmo da IA NÃO muda por ela derrapar (docs/ondas/M/M1.md, §4.3 e a medição do balance): com AI_DRIFT_CORNER_GAIN = 0,6 a IA
  // ficava 7% mais rápida e as ultrapassagens por minuto caíam (todos passam a segurar a curva forte, o handling deixa de separar
  // os carros e o grid se comprime); com 0, o ritmo fica o mesmo (−0,2%) e a derrapagem da IA é só o impulso na saída.
  it.each([[1], [2], [3]])('derrapando na curva 6, a IA não passa mais rápido que o limite de antes (ritmo neutro) e não vai à grama (semente %i)', (seed) => {
    const lead = 120; const length = 90;
    const { state, track } = aiRace(curved(6, length, lead), 2, seed);
    const ai = state.cars.find((c) => c.seat < 0);
    if (!ai) throw new Error('sem IA');
    const hn = holdableSpeedFraction(carStats(ai), 6) * carStats(ai).topSpeed;
    let minSpeed = Infinity; let maxSpeed = 0; let maxX = 0; let drifted = 0;
    for (let i = 0; i < TICK_RATE * 40; i++) {
      run(state, track, 1, () => NEUTRAL_INPUT);
      const seg = Math.floor(ai.z / SEGMENT_LENGTH);
      if (seg >= lead + 15 && seg < lead + length - 5 && ai.lap >= 2) {
        minSpeed = Math.min(minSpeed, ai.speed); maxSpeed = Math.max(maxSpeed, ai.speed); maxX = Math.max(maxX, Math.abs(ai.x));
        if (drifting(ai)) drifted++;
      }
    }
    expect(minSpeed).toBeLessThan(Infinity);
    expect(drifted, `${ai.carId}: derrapou na curva`).toBeGreaterThan(0);
    expect(maxSpeed, `${ai.carId}: hn ${hn.toFixed(0)}`).toBeLessThan(1.12 * hn);
    expect(minSpeed).toBeGreaterThan(0.9 * hn);
    expect(maxX).toBeLessThanOrEqual(OFFROAD_X);
  });

  it('o botão de ritmo existe e funciona: cornerHoldable(ganho) vai do limite de antes (0) ao da derrapagem (1), e a IA o usa só nos trechos dignos', () => {
    const def = carStats(setup(syntheticTrack(), 100, 0.8, 'trovao').car);
    const hn = holdableSpeedFraction(def, 6);
    const hd = holdableSpeedFraction(def, 6, true);
    expect(cornerHoldable(def, 6, 0)).toBe(hn);
    expect(cornerHoldable(def, 6, 1)).toBeCloseTo(hd, 12);
    expect(cornerHoldable(def, 6, 0.5)).toBeCloseTo((hn + hd) / 2, 12);
    expect(cornerHoldable(def, 6, 0.6)).toBeGreaterThan(1.2 * hn); // o 0,6 inicial do cartão: a IA 7% mais rápida
    expect(AI_DRIFT_CORNER_GAIN).toBeGreaterThanOrEqual(0);
    expect(AI_DRIFT_CORNER_GAIN).toBeLessThanOrEqual(1);
    // Só nos trechos fortes de pelo menos driftMinRun segmentos: numa quina de 6 segmentos o alvo é o de antes.
    const quina = curved(6, 6, 60);
    const longa = curved(6, 60, 60);
    const at = (t: Track) => setup(t, 40, 0.9).car;
    expect(brakingTarget(quina, at(quina).z, def, 1, 40, 2, 1, AI_DRIFT_MIN_SEGMENTS)).toBe(brakingTarget(quina, at(quina).z, def, 1, 40, 2, 0));
    expect(brakingTarget(longa, at(longa).z, def, 1, 40, 2, 1, AI_DRIFT_MIN_SEGMENTS)).toBeGreaterThan(brakingTarget(longa, at(longa).z, def, 1, 40, 2, 0));
  });

  it('não derrapa a menos de 30 segmentos do box; a mesma curva longe do box derrapa', () => {
    const nearPit = syntheticTrack([{ op: 'straight', length: 100 }, { op: 'bend', length: 20, curve: 4 }, { op: 'pit', length: 30 }, { op: 'straight', length: 200 }]);
    const farFromPit = curved(4, 20, 100);
    const count = (track: Track): number => {
      const { state } = aiRace(track, 4);
      let n = 0;
      for (let i = 0; i < TICK_RATE * 50; i++) {
        run(state, track, 1, () => NEUTRAL_INPUT);
        for (const c of state.cars) if (c.seat < 0 && drifting(c)) n++;
      }
      return n;
    };
    expect(count(farFromPit), 'longe do box').toBeGreaterThan(0);
    expect(count(nearPit), 'perto do box').toBe(0);
  });

  it('counterSteer com driftDir: 0,55 do contra-esterço sem derrapar, menos o puxão para dentro', () => {
    const def = carStats(setup(syntheticTrack(), 100).car);
    expect(counterSteer(def, 0.8, 3, 1)).toBeCloseTo(0.55 * counterSteer(def, 0.8, 3) - DRIFT_PULL, 9);
    expect(counterSteer(def, 0.8, 3, -1)).toBeCloseTo(0.55 * counterSteer(def, 0.8, 3) + DRIFT_PULL, 9);
    expect(counterSteer(def, 0.8, 3, 0)).toBe(counterSteer(def, 0.8, 3));
  });

  it('holdableSpeedFraction com derrapagem segura mais: ~1/0,55 do limite normal (até 1)', () => {
    const def = carDef('trovao');
    expect(holdableSpeedFraction(def, 6, true)).toBeGreaterThan(holdableSpeedFraction(def, 6) * 1.5);
    expect(holdableSpeedFraction(def, 6, true)).toBeLessThanOrEqual(1);
    expect(holdableSpeedFraction(def, 6, false)).toBe(holdableSpeedFraction(def, 6));
  });
});

// ───────────────────────────── A direção assistida ─────────────────────────────

describe('derrapagem: direção assistida', () => {
  const track = curved(4, 90, 60);

  it.each([
    ['none', false], ['brake', false], ['steer', true], ['full', true],
  ] as const)('numa curva forte comprida, o nível %s %s sozinho', (level, drifts) => {
    const { state, car } = setup(track, 60, 0.8);
    const out = assistInput(state, track, car, inp({}), level as AssistLevel);
    expect(out.drift === true).toBe(drifts);
  });

  it('em curva forte curta e em reta, nenhum nível derrapa sozinho', () => {
    for (const t of [curved(4, 6, 60), syntheticTrack()]) {
      const { state, car } = setup(t, 60, 0.8);
      for (const level of ['steer', 'full'] as const) expect(assistInput(state, t, car, inp({}), level).drift === true, `${level}`).toBe(false);
    }
  });

  it('o jogador por cima: o botão dele vale em qualquer nível (a assistência não o desfaz)', () => {
    const { state, car } = setup(track, 60, 0.8);
    for (const level of ['none', 'brake', 'steer', 'full'] as const) expect(assistInput(state, track, car, inp({ drift: true }), level).drift, level).toBe(true);
  });

  it('a assistência completa derrapa de verdade na corrida: derrapa, solta e leva o impulso', () => {
    const t = getTrack('serra_do_mar');
    const { state } = quickRace({ track: t, humans: [{ ...human(0), assist: 'full' }], totalCars: 1, laps: 1, seed: 3 });
    let driftTicks = 0; let boosts = 0;
    for (let i = 0; i < TICK_RATE * 400 && state.phase !== 'finished'; i++) {
      run(state, t, 1, () => inp({}));
      if (drifting(humanCar(state))) driftTicks++;
      boosts += types(state.events, 'drift_boost').length;
    }
    expect(driftTicks).toBeGreaterThan(0);
    expect(boosts).toBeGreaterThan(0);
  }, 60_000);

  it('o freio automático do nível "brake" freia MENOS quando o jogador está derrapando (o limite da curva é outro)', () => {
    const t = curved(6, 80, 60);
    const { state, car } = setup(t, 48, 0.85); // 12 segmentos antes da curva
    const def = carStats(car);
    const plain = assistInput(state, t, car, inp({}), 'brake');
    const holding = assistInput(state, t, car, inp({ drift: true }), 'brake');
    expect(plain.brake, 'sem derrapar, freia').toBe(true);
    expect(holding.brake, 'derrapando, não precisa frear tanto').not.toBe(true);
    // E a conta que está por baixo: o alvo de frenagem com derrapagem é maior.
    expect(brakingTarget(t, car.z, def, 0.9, 40, 2, 1)).toBeGreaterThan(brakingTarget(t, car.z, def, 0.9, 40, 2, 0));
  });

  it('com 4 humanos de assistência mista e todas as assistências, a corrida segue determinística', () => {
    const t = getTrack('serra_do_mar');
    const levels: AssistLevel[] = ['none', 'brake', 'steer', 'full'];
    const mk = () => quickRace({
      track: t, totalCars: 8, seed: 9, assists: ALL_ASSISTS,
      humans: levels.map((lv, i) => ({ ...human(i, 0, ['falcao', 'trovao', 'tornado', 'camelo'][i]), assist: lv })),
    });
    const a = mk(); const b = mk();
    run(a.state, a.track, 2500, () => inp({})); run(b.state, b.track, 2500, () => inp({}));
    expect(serializeRace(a.state)).toBe(serializeRace(b.state));
  }, 60_000);
});
