// A barra de nitro (onda N, frente N1; cartão em docs/ondas/N/N1.md): o nitro deixa de ser 3 cargas dadas na largada e
// vira uma barra que começa com 1 carga cheia e enche com o mini-turbo, o estilingue do vácuo, o raspão sem bater, a
// ultrapassagem limpa e a largada perfeita. Os testes foram escritos ANTES do código e vistos falhar pelo motivo certo
// (campo, constante, evento ou função inexistente; resultado errado). Constantes de ajuste fino (NITRO_GAIN_*) não são
// travadas com número exato: trava-se a relação (ganha > 0, o teto vale, uma carga custa NITRO_CHARGE_COST).
import { describe, expect, it } from 'vitest';
import {
  COLLISION_COOLDOWN_TICKS, DRIFT_LEVEL_TICKS, NITRO_CHARGE_COST, NITRO_DURATION_TICKS, NITRO_GAIN_DRIFT, NITRO_GAIN_OVERTAKE, NITRO_GAIN_SCRAPE,
  NITRO_GAIN_SLING, NITRO_LOCK_OVERTAKE_TICKS, NITRO_LOCK_SCRAPE_TICKS, NITRO_METER_MAX, NITRO_SLING_COOLDOWN_TICKS, NITRO_SLING_TICKS, NITRO_START_METER,
  OVERTAKE_GRACE_TICKS, SEGMENT_LENGTH, UPGRADE_NITRO_FILL,
} from '../src/core/constants';
import { carDef } from '../src/core/data/cars';
import { deserializeRace, hashRace, serializeRace } from '../src/core/serialize';
import { NO_MODIFIERS, stepCarPhysics } from '../src/core/sim/physics';
import { stepRace } from '../src/core/sim/race';
import { carStats, effectiveStats, grantNitro, nitroCharges, upgradeCap } from '../src/core/sim/stats';
import { NEUTRAL_INPUT, type CarState, type PlayerInput, type RaceState, type SimEvent, type Track, type UpgradeLevels } from '../src/core/types';
import { ALL_ASSISTS, human, humanCar, NO_ASSISTS, quickRace, run, skipCountdown, syntheticTrack } from './helpers';

// ───────────────────────────── Apoio ─────────────────────────────

const inp = (p: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, throttle: true, ...p });
const gains = (events: SimEvent[], source?: string) => events.filter((e): e is Extract<SimEvent, { type: 'nitro_gain' }> => e.type === 'nitro_gain' && (source === undefined || e.source === source));
/** A barra do carro; falha com clareza se o campo não existe (e não deixa `undefined === undefined` passar). */
const meter = (c: CarState): number => { expect(c.nitroMeter, `nitroMeter do carro ${c.id}`).toBeTypeOf('number'); return c.nitroMeter; };
const LV0: UpgradeLevels = { engine: 0, turbo: 0, tires: 0, brakes: 0, tank: 0, nitro: 0 };

/** Corrida de humanos sem IA, na reta, já depois da contagem. */
function duel(opts: { teams?: [number, number]; assists?: typeof ALL_ASSISTS; upgrades?: UpgradeLevels; track?: Track } = {}): { state: RaceState; track: Track; a: CarState; b: CarState } {
  const track = opts.track ?? syntheticTrack([{ op: 'straight', length: 900 }]);
  const [ta, tb] = opts.teams ?? [0, 1];
  const humans = [{ ...human(0, ta), upgrades: opts.upgrades }, human(1, tb, 'falcao')];
  const { state } = quickRace({ track, totalCars: 2, humans, assists: opts.assists ?? NO_ASSISTS });
  skipCountdown(state, track);
  return { state, track, a: humanCar(state, 0), b: humanCar(state, 1) };
}

// ───────────────────────────── Contrato e estado ─────────────────────────────

describe('barra de nitro: contrato', () => {
  it('as constantes: 1 carga custa NITRO_CHARGE_COST, larga com 1 carga cheia, o teto é de várias cargas e os ganhos são positivos', () => {
    expect(NITRO_CHARGE_COST).toBeGreaterThan(0);
    expect(NITRO_START_METER).toBe(NITRO_CHARGE_COST);
    expect(NITRO_METER_MAX).toBeGreaterThanOrEqual(NITRO_CHARGE_COST * 2);
    expect(NITRO_METER_MAX % NITRO_CHARGE_COST).toBe(0);
    expect(NITRO_GAIN_DRIFT).toHaveLength(3);
    for (const g of [...NITRO_GAIN_DRIFT, NITRO_GAIN_SLING, NITRO_GAIN_SCRAPE, NITRO_GAIN_OVERTAKE]) { expect(g).toBeGreaterThan(0); expect(g).toBeLessThan(NITRO_METER_MAX); }
    expect(NITRO_GAIN_DRIFT[0]).toBeLessThan(NITRO_GAIN_DRIFT[1]); expect(NITRO_GAIN_DRIFT[1]).toBeLessThan(NITRO_GAIN_DRIFT[2]);
    expect(NITRO_SLING_TICKS).toBe(90); // 1,5 s no vácuo (cronograma)
  });

  it('o carro nasce com 1 carga cheia e os campos novos zerados; o nitroLeft não existe mais', () => {
    const { state } = quickRace({ totalCars: 6 });
    for (const c of state.cars) {
      expect(meter(c), c.name).toBe(NITRO_START_METER);
      expect([c.throttleHeld, c.launch, c.draftTicks, c.gainLock], c.name).toEqual([0, 0, 0, 0]);
      expect('nitroLeft' in c, 'nitroLeft saiu').toBe(false);
    }
  });

  it('effectiveStats: o nitro vale o nível de enchimento (1 de fábrica, +1 por nível, inteiro) e a peça vale até o nível 3', () => {
    const def = carDef('falcao');
    expect(effectiveStats(def, null).nitro).toBe(1);
    for (const lv of [1, 2, 3]) expect(effectiveStats(def, { ...LV0, nitro: lv }).nitro).toBe(1 + lv);
    expect(effectiveStats(def, { ...LV0, nitro: 1.7 }).nitro).toBe(2);
    expect(upgradeCap(def, 'nitro')).toBe(3);
    expect(UPGRADE_NITRO_FILL).toBeGreaterThan(0);
  });
});

// ───────────────────────────── Gastar e o teto ─────────────────────────────

describe('barra de nitro: gastar uma carga e o teto', () => {
  it('apertar o nitro com 1 carga gasta NITRO_CHARGE_COST e liga os 150 ticks; sem carga, nitro_denied e a barra não muda', () => {
    const { state, track } = quickRace({ track: syntheticTrack(), totalCars: 1 });
    run(state, track, 60 * 5);
    const car = humanCar(state);
    expect(meter(car)).toBe(NITRO_START_METER);
    run(state, track, 1, () => inp({ nitro: true }));
    expect(car.nitroMeter).toBe(NITRO_START_METER - NITRO_CHARGE_COST);
    expect(car.nitroTicks).toBe(NITRO_DURATION_TICKS - 1);
    expect(state.events.some((e) => e.type === 'nitro')).toBe(true);
    run(state, track, NITRO_DURATION_TICKS + 5);
    expect(car.nitroTicks).toBe(0);
    run(state, track, 1, () => inp({ nitro: true }));
    expect(state.events.some((e) => e.type === 'nitro_denied')).toBe(true);
    expect(car.nitroMeter).toBe(NITRO_START_METER - NITRO_CHARGE_COST);
    expect(car.nitroTicks).toBe(0);
  });

  it('meia carga não basta: com NITRO_CHARGE_COST − 1 o nitro é negado', () => {
    const { state, track } = quickRace({ track: syntheticTrack(), totalCars: 1 });
    run(state, track, 60 * 5);
    const car = humanCar(state);
    car.nitroMeter = NITRO_CHARGE_COST - 1;
    run(state, track, 1, () => inp({ nitro: true }));
    expect(state.events.some((e) => e.type === 'nitro_denied')).toBe(true);
    expect(car.nitroTicks).toBe(0);
    expect(nitroCharges(state, car)).toBe(0);
    car.nitroMeter = NITRO_CHARGE_COST * 2 + 5;
    expect(nitroCharges(state, car)).toBe(2);
  });

  it('o teto: um ganho que passa de NITRO_METER_MAX satura nele, o evento leva só o que coube, e barra cheia não emite nada', () => {
    const { state } = quickRace({ totalCars: 1 });
    const car = humanCar(state);
    car.nitroMeter = NITRO_METER_MAX - 40;
    state.events = [];
    expect(grantNitro(state, car, 'drift', 500)).toBe(40);
    expect(car.nitroMeter).toBe(NITRO_METER_MAX);
    expect(gains(state.events)).toEqual([{ type: 'nitro_gain', carId: car.id, source: 'drift', amount: 40 }]);
    state.events = [];
    expect(grantNitro(state, car, 'sling', 500)).toBe(0);
    expect(car.nitroMeter).toBe(NITRO_METER_MAX);
    expect(state.events).toEqual([]);
  });
});

// ───────────────────────────── As fontes ─────────────────────────────

describe('fonte: mini-turbo da derrapagem', () => {
  it.each([[1], [2], [3]])('soltar a derrapagem com a carga do nível %i enche NITRO_GAIN_DRIFT[nível − 1]; o nível 0 não enche', (level) => {
    const track = syntheticTrack([{ op: 'straight', length: 60 }, { op: 'bend', length: 400, curve: 3 }, { op: 'straight', length: 200 }]);
    const { state } = quickRace({ track, totalCars: 1 });
    skipCountdown(state, track);
    const car = humanCar(state);
    car.z = 60 * SEGMENT_LENGTH + 1; car.x = 0; car.speed = carStats(car).topSpeed * 0.8;
    car.nitroMeter = 0;
    state.events = [];
    for (let i = 0; i < DRIFT_LEVEL_TICKS[level - 1] + 2; i++) stepRace(state, track, [inp({ drift: true, steer: i === 0 ? 1 : Math.max(-1, Math.min(1, -car.x * 3)) })]);
    expect(car.driftCharge).toBeGreaterThanOrEqual(DRIFT_LEVEL_TICKS[level - 1]);
    expect(meter(car), 'ainda não soltou').toBe(0);
    stepRace(state, track, [inp({ drift: false })]);
    expect(car.nitroMeter).toBe(NITRO_GAIN_DRIFT[level - 1]);
    expect(gains(state.events, 'drift')).toEqual([{ type: 'nitro_gain', carId: car.id, source: 'drift', amount: NITRO_GAIN_DRIFT[level - 1] }]);
  });

  it('soltar sem carga (nível 0) não enche', () => {
    const track = syntheticTrack([{ op: 'straight', length: 600 }]);
    const { state } = quickRace({ track, totalCars: 1 });
    skipCountdown(state, track);
    const car = humanCar(state);
    car.z = 60 * SEGMENT_LENGTH; car.speed = carStats(car).topSpeed * 0.8; car.nitroMeter = 0;
    for (let i = 0; i < 20; i++) stepRace(state, track, [inp({ drift: true, steer: 0.5 })]);
    stepRace(state, track, [inp({ drift: false })]);
    expect(meter(car)).toBe(0);
    expect(gains(state.events)).toEqual([]);
  });
});

describe('fonte: estilingue do vácuo', () => {
  /** `ticks` ticks de física com o carro no vácuo (ou fora dele), na reta, devolvendo os eventos do último. */
  function draftFor(state: RaceState, track: Track, car: CarState, ticks: number, drafting: boolean): SimEvent[] {
    let last: SimEvent[] = [];
    for (let i = 0; i < ticks; i++) { state.events = []; car.speed = carStats(car).topSpeed * 0.9; stepCarPhysics(state, track, car, inp(), drafting ? { ...NO_MODIFIERS, draft: true } : NO_MODIFIERS); last = state.events; }
    return last;
  }
  function solo(): { state: RaceState; track: Track; car: CarState } {
    const track = syntheticTrack([{ op: 'straight', length: 900 }]);
    const { state } = quickRace({ track, totalCars: 1 });
    skipCountdown(state, track);
    const car = humanCar(state);
    car.nitroMeter = 0; car.z = 10 * SEGMENT_LENGTH; car.x = 0;
    return { state, track, car };
  }

  it('89 ticks no vácuo e sair não dá nada; 90 ticks e sair dá NITRO_GAIN_SLING, uma vez', () => {
    let { state, track, car } = solo();
    draftFor(state, track, car, NITRO_SLING_TICKS - 1, true);
    expect(car.draftTicks, 'contou o tempo no vácuo').toBe(NITRO_SLING_TICKS - 1);
    expect(gains(draftFor(state, track, car, 1, false))).toEqual([]);
    expect([meter(car), car.draftTicks]).toEqual([0, 0]);
    ({ state, track, car } = solo());
    draftFor(state, track, car, NITRO_SLING_TICKS, true);
    expect(meter(car), 'dentro do vácuo ainda não enche').toBe(0);
    const out = draftFor(state, track, car, 1, false);
    expect(gains(out)).toEqual([{ type: 'nitro_gain', carId: car.id, source: 'sling', amount: NITRO_GAIN_SLING }]);
    expect(car.nitroMeter).toBe(NITRO_GAIN_SLING);
  });

  it('depois do estilingue há um resfriamento: voltar ao vácuo por 90 ticks e sair dentro dele não dá de novo; depois dele, dá', () => {
    const { state, track, car } = solo();
    draftFor(state, track, car, NITRO_SLING_TICKS, true);
    draftFor(state, track, car, 1, false);
    expect(car.draftTicks, 'resfriamento').toBeLessThan(0);
    draftFor(state, track, car, NITRO_SLING_TICKS, true);
    draftFor(state, track, car, 1, false);
    expect(car.nitroMeter, 'dentro do resfriamento').toBe(NITRO_GAIN_SLING);
    // O resfriamento corre com o tempo, no vácuo ou fora dele: depois dele e de mais 1,5 s no vácuo, sai de novo.
    draftFor(state, track, car, NITRO_SLING_COOLDOWN_TICKS + NITRO_SLING_TICKS + 5, true);
    draftFor(state, track, car, 1, false);
    expect(car.nitroMeter).toBe(NITRO_GAIN_SLING * 2);
  });

  it('numa corrida de verdade: um carro 800 u atrás de outro, na mesma linha, fica no vácuo e o estilingue sai quando ele abre para o lado', () => {
    const { state, track, a, b } = duel({ teams: [0, 1] });
    a.z = 20 * SEGMENT_LENGTH; b.z = a.z + 800; a.x = 0; b.x = 0; a.speed = b.speed = carStats(a).topSpeed * 0.9;
    a.nitroMeter = 0; b.nitroMeter = 0;
    state.events = [];
    let drafted = 0;
    for (let i = 0; i < 100; i++) { stepRace(state, track, [inp(), inp()]); if (a.draftTicks > drafted) drafted = a.draftTicks; }
    expect(drafted, 'ficou mais de 1,5 s no vácuo').toBeGreaterThanOrEqual(NITRO_SLING_TICKS);
    const events: SimEvent[] = [];
    for (let i = 0; i < 15; i++) { stepRace(state, track, [inp({ steer: 1 }), inp()]); events.push(...state.events); }
    expect(gains(events, 'sling').filter((e) => e.carId === a.id)).toHaveLength(1);
  });
});

describe('fonte: raspão sem bater', () => {
  /** Dois carros de lado, sobrepostos, esterçando um contra o outro. */
  function sideBySide(): ReturnType<typeof duel> {
    const d = duel({ teams: [0, 1] });
    d.a.z = d.b.z = 30 * SEGMENT_LENGTH; d.a.x = -0.1; d.b.x = 0.1;
    d.a.speed = d.b.speed = carStats(d.a).topSpeed * 0.8;
    return d;
  }

  it('o contato de lado enche os dois, uma vez por episódio: o contato que continua não enche de novo, e depois do gainLock enche', () => {
    const { state, track, a, b } = sideBySide();
    const before = [meter(a), meter(b)];
    stepRace(state, track, [inp({ steer: 1 }), inp({ steer: -1 })]);
    expect(gains(state.events, 'scrape').map((e) => e.carId).sort()).toEqual([a.id, b.id].sort());
    expect([a.nitroMeter, b.nitroMeter]).toEqual([before[0] + NITRO_GAIN_SCRAPE, before[1] + NITRO_GAIN_SCRAPE]);
    expect([a.gainLock, b.gainLock]).toEqual([NITRO_LOCK_SCRAPE_TICKS, NITRO_LOCK_SCRAPE_TICKS]);
    for (let i = 0; i < NITRO_LOCK_SCRAPE_TICKS - 2; i++) stepRace(state, track, [inp({ steer: 1 }), inp({ steer: -1 })]);
    expect(a.nitroMeter, 'o contato seguiu, mas é o mesmo raspão').toBe(before[0] + NITRO_GAIN_SCRAPE);
    for (let i = 0; i < 6; i++) stepRace(state, track, [inp({ steer: 1 }), inp({ steer: -1 })]);
    expect(a.nitroMeter, 'passado o gainLock, outro raspão').toBe(before[0] + NITRO_GAIN_SCRAPE * 2);
  });

  it('batida traseira não é raspão: ninguém ganha', () => {
    const { state, track, a, b } = duel({ teams: [0, 1] });
    b.z = 30 * SEGMENT_LENGTH; a.z = b.z - 150; a.x = b.x = 0; a.speed = carStats(a).topSpeed; b.speed = carStats(b).topSpeed * 0.5;
    const before = [meter(a), meter(b)];
    stepRace(state, track, [inp(), inp()]);
    expect(state.events.some((e) => e.type === 'collision'), 'bateu de trás').toBe(true);
    expect(gains(state.events)).toEqual([]);
    expect([a.nitroMeter, b.nitroMeter]).toEqual(before);
  });

  it('quem está se recuperando de uma batida (collisionCooldown) não ganha com o raspão', () => {
    const { state, track, a, b } = sideBySide();
    a.collisionCooldown = COLLISION_COOLDOWN_TICKS;
    const before = [meter(a), meter(b)];
    stepRace(state, track, [inp({ steer: 1 }), inp({ steer: -1 })]);
    expect(gains(state.events, 'scrape')).toEqual([]);
    expect([a.nitroMeter, b.nitroMeter]).toEqual(before);
  });
});

describe('fonte: ultrapassagem limpa', () => {
  /** B na frente e mais devagar, A atrás e mais rápido, em linhas diferentes (sem contato), pronta para A passar. */
  function chase(opts: Parameters<typeof duel>[0] = {}): ReturnType<typeof duel> {
    const d = duel(opts);
    d.state.startTick = d.state.tick - OVERTAKE_GRACE_TICKS - 60; // passou da bagunça da largada
    d.b.z = 30 * SEGMENT_LENGTH + 700; d.a.z = 30 * SEGMENT_LENGTH; d.a.x = -0.6; d.b.x = 0.6;
    d.a.speed = carStats(d.a).topSpeed; d.b.speed = carStats(d.b).topSpeed * 0.6;
    d.b.position = 1; d.a.position = 2; // a ordem do tick anterior: B na frente
    return d;
  }
  function untilPassed(d: ReturnType<typeof duel>, events: SimEvent[]): void {
    for (let i = 0; i < 120 && d.a.position !== 1; i++) { stepRace(d.state, d.track, [inp(), inp()]); events.push(...d.state.events); }
    expect(d.a.position, 'A passou').toBe(1);
  }

  it('passar em pista livre enche NITRO_GAIN_OVERTAKE, sai o evento overtake (limpa) e põe o gainLock', () => {
    const d = chase();
    const before = meter(d.a);
    const events: SimEvent[] = [];
    untilPassed(d, events);
    expect(events.filter((e) => e.type === 'overtake')).toEqual([{ type: 'overtake', carId: d.a.id, otherId: d.b.id, clean: true }]);
    expect(gains(events, 'overtake')).toEqual([{ type: 'nitro_gain', carId: d.a.id, source: 'overtake', amount: NITRO_GAIN_OVERTAKE }]);
    expect(d.a.nitroMeter).toBe(before + NITRO_GAIN_OVERTAKE);
    expect(d.a.gainLock).toBeGreaterThan(0);
    expect(d.a.gainLock).toBeLessThanOrEqual(NITRO_LOCK_OVERTAKE_TICKS);
    expect(d.b.nitroMeter, 'quem foi passado não ganha').toBe(NITRO_START_METER);
  });

  it('passar logo depois de bater (collisionCooldown) conta como ultrapassagem, mas não limpa: sem ganho', () => {
    const d = chase();
    d.a.collisionCooldown = 400;
    const before = meter(d.a);
    const events: SimEvent[] = [];
    untilPassed(d, events);
    expect(events.filter((e) => e.type === 'overtake')).toEqual([{ type: 'overtake', carId: d.a.id, otherId: d.b.id, clean: false }]);
    expect(gains(events)).toEqual([]);
    expect(d.a.nitroMeter).toBe(before);
  });

  it('nos primeiros OVERTAKE_GRACE_TICKS da corrida (a bagunça do grid) não ganha', () => {
    const d = chase();
    d.state.startTick = d.state.tick - 10;
    const events: SimEvent[] = [];
    untilPassed(d, events);
    expect(events.filter((e) => e.type === 'overtake'), 'a ultrapassagem aconteceu e foi vista').toHaveLength(1);
    expect(gains(events)).toEqual([]);
    expect(d.a.nitroMeter).toBe(NITRO_START_METER);
  });

  it('passar o companheiro humano do mesmo time não vale (trocar de lugar com o parceiro não é farmar nitro)', () => {
    const d = chase({ teams: [0, 0], assists: ALL_ASSISTS });
    const before = d.state.teamNitro[0];
    const events: SimEvent[] = [];
    untilPassed(d, events);
    expect(events.filter((e) => e.type === 'overtake')).toEqual([]);
    expect(gains(events)).toEqual([]);
    expect(d.state.teamNitro[0]).toBe(before);
  });

  it('o gainLock impede a segunda ultrapassagem seguida; passado o gainLock, vale de novo', () => {
    const d = chase();
    const events: SimEvent[] = [];
    untilPassed(d, events);
    const afterFirst = meter(d.a);
    // B passa de volta (posto à frente de novo) e A o ultrapassa outra vez, ainda dentro do gainLock.
    d.b.z = d.a.z + 700; d.b.speed = carStats(d.b).topSpeed * 0.6; d.a.speed = carStats(d.a).topSpeed;
    d.b.position = 1; d.a.position = 2;
    const again: SimEvent[] = [];
    for (let i = 0; i < 120 && d.a.position !== 1; i++) { stepRace(d.state, d.track, [inp(), inp()]); again.push(...d.state.events); }
    expect(d.a.gainLock, 'ainda dentro do gainLock').toBeGreaterThan(0);
    expect(gains(again)).toEqual([]);
    expect(d.a.nitroMeter).toBe(afterFirst);
    d.a.gainLock = 0;
    d.b.z = d.a.z + 700; d.b.speed = carStats(d.b).topSpeed * 0.6;
    d.b.position = 1; d.a.position = 2;
    const third: SimEvent[] = [];
    for (let i = 0; i < 120 && d.a.position !== 1; i++) { stepRace(d.state, d.track, [inp(), inp()]); third.push(...d.state.events); }
    expect(gains(third, 'overtake')).toHaveLength(1);
  });
});

// ───────────────────────────── A peça e a barra da equipe ─────────────────────────────

describe('a peça de nitro: a barra enche +15% por nível', () => {
  it('com a peça no nível 3 a mesma fonte enche round(base × (1 + 3 × UPGRADE_NITRO_FILL)); sem a peça, base; a IA, sempre base', () => {
    const track = syntheticTrack();
    const { state } = quickRace({ track, totalCars: 4, humans: [{ ...human(0), upgrades: { ...LV0, nitro: 3 } }, human(1)] });
    const [p1, p2] = [humanCar(state, 0), humanCar(state, 1)];
    const ai = state.cars.find((c) => c.seat < 0)!;
    for (const c of [p1, p2, ai]) c.nitroMeter = 0;
    expect(grantNitro(state, p1, 'scrape', 100)).toBe(Math.round(100 * (1 + 3 * UPGRADE_NITRO_FILL)));
    expect(grantNitro(state, p2, 'scrape', 100)).toBe(100);
    expect(grantNitro(state, ai, 'scrape', 100)).toBe(100);
    expect(p1.nitroMeter).toBeGreaterThan(p2.nitroMeter);
  });
});

describe('a barra da equipe (co-op com sharedNitro)', () => {
  it('começa com 1 carga por humano, o ganho de qualquer um entra nela (com a peça de quem ganhou), o teto é por humano e o gasto sai dela', () => {
    const track = syntheticTrack();
    const { state } = quickRace({ track, totalCars: 2, humans: [{ ...human(0), upgrades: { ...LV0, nitro: 3 } }, human(1)], assists: ALL_ASSISTS });
    const [p1, p2] = [humanCar(state, 0), humanCar(state, 1)];
    expect(state.teamNitro[0]).toBe(NITRO_START_METER * 2);
    const own = [p1.nitroMeter, p2.nitroMeter];
    grantNitro(state, p2, 'scrape', 100);
    expect(state.teamNitro[0]).toBe(NITRO_START_METER * 2 + 100);
    grantNitro(state, p1, 'scrape', 100);
    expect(state.teamNitro[0]).toBe(NITRO_START_METER * 2 + 100 + Math.round(100 * (1 + 3 * UPGRADE_NITRO_FILL)));
    expect([p1.nitroMeter, p2.nitroMeter], 'a barra individual não é tocada').toEqual(own);
    grantNitro(state, p1, 'drift', NITRO_METER_MAX * 5);
    expect(state.teamNitro[0], 'teto: 3 cargas por humano').toBe(NITRO_METER_MAX * 2);
    skipCountdown(state, track);
    state.events = [];
    stepRace(state, track, [inp(), inp({ nitro: true })]);
    expect(state.teamNitro[0]).toBe(NITRO_METER_MAX * 2 - NITRO_CHARGE_COST);
    expect(p2.nitroTicks).toBeGreaterThan(0);
    expect([p1.nitroMeter, p2.nitroMeter]).toEqual(own);
    expect(nitroCharges(state, p1)).toBe(5);
  });

  it('sem sharedNitro não há barra da equipe e cada um tem a sua', () => {
    const { state } = quickRace({ track: syntheticTrack(), totalCars: 2, humans: [human(0), human(1)], assists: NO_ASSISTS });
    expect(state.teamNitro[0]).toBeUndefined();
    expect(nitroCharges(state, humanCar(state, 1))).toBe(1);
  });
});

// ───────────────────────────── Hash, determinismo e migração ─────────────────────────────

describe('barra de nitro: hash, serialização e migração do estado antigo', () => {
  it('o hashRace enxerga cada um dos campos novos e a barra da equipe', () => {
    const { state } = quickRace({ totalCars: 4, assists: ALL_ASSISTS });
    const base = hashRace(state);
    const car = state.cars[0];
    const keys = ['nitroMeter', 'throttleHeld', 'launch', 'draftTicks', 'gainLock'] as const;
    const seen = new Set<number>([base]);
    for (const k of keys) {
      const old = car[k];
      car[k] = old + 7;
      const h = hashRace(state);
      expect(h, k).not.toBe(base);
      seen.add(h);
      car[k] = old;
    }
    expect(seen.size).toBe(keys.length + 1);
    state.teamNitro[0] = (state.teamNitro[0] ?? 0) + 1;
    expect(hashRace(state), 'teamNitro').not.toBe(base);
  });

  it('duas corridas com o mesmo roteiro e a semente dão o mesmo estado; serializar no meio e continuar também', () => {
    const humans = [human(0), human(1, 0, 'trovao')];
    const pilot = (_: RaceState, seat: number): PlayerInput => inp({ steer: seat === 0 ? 0.2 : -0.2, nitro: false, drift: seat === 0 });
    const a = quickRace({ humans, totalCars: 12, assists: ALL_ASSISTS, seed: 5 });
    const b = quickRace({ humans, totalCars: 12, assists: ALL_ASSISTS, seed: 5 });
    run(a.state, a.track, 1500, pilot); run(b.state, b.track, 1500, pilot);
    expect(serializeRace(a.state)).toBe(serializeRace(b.state));
    const copy = deserializeRace(serializeRace(a.state));
    run(a.state, a.track, 600, pilot); run(copy, a.track, 600, pilot);
    expect(serializeRace(copy)).toBe(serializeRace(a.state));
  }, 60_000);

  /** O JSON de um estado de 640538f: `nitroLeft` no lugar de `nitroMeter`, sem os campos novos. */
  function legacyJson(state: RaceState, teamNitro: Record<number, number>, charges: number[]): string {
    const j = JSON.parse(serializeRace(state)) as { cars: Array<Record<string, unknown>>; teamNitro: Record<number, number> };
    j.cars.forEach((c, i) => { for (const k of ['nitroMeter', 'throttleHeld', 'launch', 'draftTicks', 'gainLock']) delete c[k]; c.nitroLeft = charges[i] ?? 3; });
    j.teamNitro = teamNitro;
    return JSON.stringify(j);
  }

  it('um estado antigo (nitroLeft em cargas) vira barra: cada carga vale NITRO_CHARGE_COST, no teto; o nitroLeft some; os campos novos ganham o padrão', () => {
    const { state } = quickRace({ totalCars: 4 });
    const legacy = deserializeRace(legacyJson(state, {}, [2, 0, 6, 1]));
    expect(legacy.cars.map((c) => c.nitroMeter)).toEqual([2 * NITRO_CHARGE_COST, 0, NITRO_METER_MAX, NITRO_CHARGE_COST]);
    for (const c of legacy.cars) {
      expect('nitroLeft' in c).toBe(false);
      expect([c.throttleHeld, c.draftTicks, c.gainLock]).toEqual([0, 0, 0]);
      expect(c.launch, 'na contagem a largada ainda está pendente').toBe(0);
    }
  });

  it('o cofre antigo (cargas) também vira unidades, no teto por humano; e um estado antigo que já andava tem a largada encerrada', () => {
    const track = syntheticTrack();
    const { state } = quickRace({ track, totalCars: 2, humans: [human(0), human(1)], assists: ALL_ASSISTS });
    skipCountdown(state, track); run(state, track, 400);
    const legacy = deserializeRace(legacyJson(state, { 0: 4 }, [2, 2]));
    expect(legacy.teamNitro[0]).toBe(4 * NITRO_CHARGE_COST);
    for (const c of legacy.cars) expect(c.launch, 'passou da janela da largada').toBe(2);
    const big = deserializeRace(legacyJson(state, { 0: 99 }, [2, 2]));
    expect(big.teamNitro[0]).toBe(NITRO_METER_MAX * 2);
  });

  it('lixo no estado é saneado (texto, NaN, negativo, acima do teto) e um estado novo passa sem mudar', () => {
    const { state } = quickRace({ totalCars: 3 });
    const json = JSON.parse(serializeRace(state)) as { cars: Array<Record<string, unknown>> };
    json.cars[0].nitroMeter = 'muito'; json.cars[1].nitroMeter = -50; json.cars[2].nitroMeter = NITRO_METER_MAX * 9;
    json.cars[0].launch = 7; json.cars[1].throttleHeld = Number.NaN; json.cars[2].gainLock = -3; json.cars[0].draftTicks = 'x';
    const fixed = deserializeRace(JSON.stringify(json));
    expect(fixed.cars.map((c) => c.nitroMeter)).toEqual([NITRO_START_METER, 0, NITRO_METER_MAX]);
    expect(fixed.cars[0].launch).toBe(0);
    expect([fixed.cars[1].throttleHeld, fixed.cars[2].gainLock, fixed.cars[0].draftTicks]).toEqual([0, 0, 0]);
    expect(serializeRace(deserializeRace(serializeRace(state)))).toBe(serializeRace(state));
  });
});
