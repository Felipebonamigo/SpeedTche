// A largada-foguete (onda N, frente N1; cartão em docs/ondas/N/N1.md): apertar o acelerador na janela do zero da contagem
// dá um arranque de nitro e enche a barra; a IA acerta conforme a habilidade (sorteio em state.rng); e, no online, as luzes
// da contagem são desenhadas adiantadas pelo atraso de entrada para o MESMO instante físico do aperto dar o MESMO
// resultado com atraso 3 e com 12. Os testes foram escritos ANTES do código e vistos falhar pelo motivo certo.
import { describe, expect, it } from 'vitest';
import {
  CAR_HALF_WIDTH, COUNTDOWN_TICKS, LAUNCH_AI_CLEAR_RANGE, LAUNCH_AI_FULL_SKILL, LAUNCH_AI_MAX_CHANCE, LAUNCH_AI_MIN_SKILL, LAUNCH_BOOST_TICKS,
  LAUNCH_WINDOW_EARLY_TICKS, LAUNCH_WINDOW_LATE_TICKS, NITRO_GAIN_LAUNCH, NITRO_START_METER,
} from '../src/core/constants';
import { wrappedDelta } from '../src/core/sim/collisions';
import { deserializeRace, hashRace, serializeRace } from '../src/core/serialize';
import { launchChance } from '../src/core/sim/ai';
import { createRace, stepRace } from '../src/core/sim/race';
import { carStats } from '../src/core/sim/stats';
import { getTrack } from '../src/core/track';
import { NEUTRAL_INPUT, type CarState, type PlayerInput, type RaceConfig, type RaceState, type SimEvent } from '../src/core/types';
import { countdownCue, countdownDisplayTick } from '../src/render/hud-model';
import { Lockstep } from '../src/net/lockstep';
import { ALL_ASSISTS, human, humanCar, NO_ASSISTS, quickRace, syntheticTrack } from './helpers';

const G = COUNTDOWN_TICKS;
const E = LAUNCH_WINDOW_EARLY_TICKS;
const L = LAUNCH_WINDOW_LATE_TICKS;
const inp = (throttle: boolean): PlayerInput => ({ ...NEUTRAL_INPUT, throttle });
const launchOf = (c: CarState): number => { expect(c.launch, `launch do carro ${c.id}`).toBeTypeOf('number'); return c.launch; };

interface Tick { tick: number; launch: number; nitroTicks: number; meter: number; held: number; speed: number; events: SimEvent[] }

/** Um humano sozinho na reta; `press(t)` diz se o acelerador está apertado no tick t. Roda até o tick `until` e devolve o registro de cada tick. */
function launchRun(press: (tick: number) => boolean, until = G + 12): { state: RaceState; car: CarState; log: Tick[] } {
  const track = syntheticTrack();
  const { state } = quickRace({ track, totalCars: 1 });
  const car = humanCar(state);
  const log: Tick[] = [];
  while (state.tick < until) {
    const tick = state.tick;
    stepRace(state, track, [inp(press(tick))]);
    log.push({ tick, launch: car.launch, nitroTicks: car.nitroTicks, meter: car.nitroMeter, held: car.throttleHeld, speed: car.speed, events: state.events });
  }
  return { state, car, log };
}

// ───────────────────────────── A janela ─────────────────────────────

describe('largada-foguete: a janela de aperto', () => {
  it('as constantes: a janela pega o zero da contagem (um pouco antes, um pouco depois), o arranque é nitro curto', () => {
    expect(G).toBe(210);
    expect(E).toBeGreaterThan(0); expect(L).toBeGreaterThanOrEqual(0);
    expect(E + L).toBeLessThanOrEqual(30); // no máximo meio segundo de janela
    expect(LAUNCH_BOOST_TICKS).toBeGreaterThan(0);
    expect(LAUNCH_BOOST_TICKS).toBeLessThan(150); // menor que o nitro (NITRO_DURATION_TICKS)
    expect(NITRO_GAIN_LAUNCH).toBeGreaterThan(0);
  });

  it.each([[G - E], [G - 1], [G], [G + L]])('apertar no tick %i e segurar é largada perfeita: nitro aceso, a barra enche e sai o evento launch', (press) => {
    const { car, log } = launchRun((t) => t >= press);
    expect(launchOf(car)).toBe(1);
    const decided = Math.max(press, G);
    const at = log.find((l) => l.tick === decided)!;
    expect(at.launch, 'decidiu no primeiro tick livre depois do aperto').toBe(1);
    expect(log.find((l) => l.tick === decided - 1)!.launch, 'um tick antes ainda não').toBe(0);
    expect(at.nitroTicks).toBe(LAUNCH_BOOST_TICKS - 1);
    expect(at.events.filter((e) => e.type === 'launch')).toEqual([{ type: 'launch', carId: car.id }]);
    expect(at.events.filter((e) => e.type === 'nitro_gain')).toEqual([{ type: 'nitro_gain', carId: car.id, source: 'launch', amount: NITRO_GAIN_LAUNCH }]);
    expect(car.nitroMeter).toBe(NITRO_START_METER + NITRO_GAIN_LAUNCH);
    expect(log.flatMap((l) => l.events).filter((e) => e.type === 'launch')).toHaveLength(1);
  });

  it.each([[G - E - 1, 'cedo demais e segurando'], [G + L + 1, 'tarde demais'], [0, 'segurando desde o começo da contagem']])('apertar no tick %i (%s) não dá bônus: o carro larga normal', (press) => {
    const { car, log } = launchRun((t) => t >= press, G + L + 12);
    expect(launchOf(car)).toBe(2);
    expect(car.nitroTicks).toBe(0);
    expect(car.nitroMeter).toBe(NITRO_START_METER);
    expect(log.flatMap((l) => l.events).filter((e) => e.type === 'launch' || e.type === 'nitro_gain')).toEqual([]);
  });

  it('o arranque é um foguete: 1,5 s depois da largada o carro perfeito está bem mais rápido que o normal e já andou bem mais', () => {
    const perfect = launchRun((t) => t >= G, G + 60);
    const plain = launchRun(() => true, G + 60);
    expect(perfect.car.launch).toBe(1); expect(plain.car.launch).toBe(2);
    expect(perfect.car.speed).toBeGreaterThan(plain.car.speed * 1.5);
    const dist = (log: Tick[]) => log.reduce((sum, l) => sum + l.speed, 0) / 60; // u andadas desde o começo da contagem
    expect(dist(perfect.log)).toBeGreaterThan(dist(plain.log) * 1.5);
    expect(perfect.car.speed).toBeLessThanOrEqual(carStats(perfect.car).topSpeed * 1.28 + 1e-6);
  });

  it('vale o ÚLTIMO aperto: soltar e apertar de novo dentro da janela dá a largada; soltar antes e não voltar a apertar até o fim da janela, não', () => {
    const rePress = launchRun((t) => t < G - 20 || t >= G - 10);
    expect(launchOf(rePress.car)).toBe(1);
    const tooEarlyThenRelease = launchRun((t) => t >= G - 10 && t < G - 5, G + L + 12);
    expect(launchOf(tooEarlyThenRelease.car)).toBe(2);
    const lateRePress = launchRun((t) => (t >= G - 10 && t < G - 5) || t >= G + 3);
    expect(launchOf(lateRePress.car)).toBe(1);
    expect(lateRePress.log.find((l) => l.launch === 1)!.tick, 'o arranque começa no aperto tardio').toBe(G + 3);
  });

  it('o carro não se mexe antes da largada e a decisão acontece uma vez só (depois dela, apertar de novo não repete)', () => {
    const { car, log } = launchRun((t) => t % 40 < 20 || t >= G, G + 120);
    for (const l of log.filter((x) => x.tick < G)) expect(l.nitroTicks).toBe(0);
    expect(car.z).toBeGreaterThan(0);
    expect(log.flatMap((l) => l.events).filter((e) => e.type === 'launch').length).toBeLessThanOrEqual(1);
  });

  it('throttleHeld: conta os ticks seguidos do acelerador na contagem, zera ao soltar e quando a largada é decidida (o dado do motor subindo, da N6)', () => {
    const { log } = launchRun((t) => t >= 100 && t < 112 || t >= G - 5);
    expect(log.find((l) => l.tick === 100)!.held).toBe(1);
    expect(log.find((l) => l.tick === 109)!.held).toBe(10);
    expect(log.find((l) => l.tick === 111)!.held).toBe(12);
    expect(log.find((l) => l.tick === 112)!.held, 'soltou').toBe(0);
    expect(log.find((l) => l.tick === G - 3)!.held).toBe(3);
    expect(log.find((l) => l.tick === G)!.held, 'a largada foi decidida: o contador não é mais da contagem').toBe(0);
    expect(log.find((l) => l.tick === G + 5)!.held).toBe(0);
  });
});

// ───────────────────────────── A IA ─────────────────────────────

describe('largada-foguete: a IA acerta conforme a habilidade, sorteando em state.rng', () => {
  it('launchChance: zero na habilidade mínima, o máximo na cheia, crescente entre elas', () => {
    expect(LAUNCH_AI_MAX_CHANCE).toBeGreaterThan(0); expect(LAUNCH_AI_MAX_CHANCE).toBeLessThan(1);
    expect(LAUNCH_AI_MIN_SKILL).toBeLessThan(LAUNCH_AI_FULL_SKILL);
    expect(launchChance(0.5)).toBe(0);
    expect(launchChance(LAUNCH_AI_MIN_SKILL)).toBe(0);
    expect(launchChance(LAUNCH_AI_FULL_SKILL)).toBe(LAUNCH_AI_MAX_CHANCE);
    expect(launchChance(1.2)).toBe(LAUNCH_AI_MAX_CHANCE);
    const mid = (LAUNCH_AI_MIN_SKILL + LAUNCH_AI_FULL_SKILL) / 2;
    expect(launchChance(mid)).toBeGreaterThan(0); expect(launchChance(mid)).toBeLessThan(LAUNCH_AI_MAX_CHANCE);
    expect(launchChance(mid + 0.01)).toBeGreaterThan(launchChance(mid));
  });

  /** A IA tem um carro na própria faixa à frente, perto o bastante para um arranque de nitro bater nele? (a regra de LAUNCH_AI_CLEAR_RANGE) */
  const blockedAhead = (state: RaceState, car: CarState): boolean => state.cars.some((o) => o !== car
    && wrappedDelta(o.z, car.z, state.trackLength) > 0 && wrappedDelta(o.z, car.z, state.trackLength) < LAUNCH_AI_CLEAR_RANGE && Math.abs(o.x - car.x) < CAR_HALF_WIDTH * 2);

  it('a IA decide no tick G, uma vez: antes ela está pendente; depois, perfeita (com o arranque e a barra) ou sem bônus', () => {
    const { state, track } = quickRace({ totalCars: 20, seed: 3 });
    const ais = state.cars.filter((c) => c.ai && c.seat < 0);
    for (let i = 0; i < G; i++) stepRace(state, track, []);
    expect(state.tick).toBe(G);
    for (const c of ais) expect(launchOf(c), c.name).toBe(0);
    stepRace(state, track, []);
    const decided = ais.map((c) => launchOf(c));
    expect(decided.every((d) => d === 1 || d === 2)).toBe(true);
    for (const c of ais.filter((x) => x.launch === 1)) {
      expect(c.nitroTicks, c.name).toBeGreaterThan(0);
      expect(c.nitroMeter).toBe(NITRO_START_METER + NITRO_GAIN_LAUNCH);
    }
    expect(state.events.filter((e) => e.type === 'launch').length).toBe(decided.filter((d) => d === 1).length);
  });

  it('a IA que tem um carro na frente, na própria faixa, não tenta o arranque (ia bater nele): só a de pista livre pode acertar', () => {
    expect(LAUNCH_AI_CLEAR_RANGE).toBeGreaterThan(0);
    let blocked = 0; let clear = 0; let clearGood = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { state, track } = quickRace({ totalCars: 20, seed });
      const ais = state.cars.filter((c) => c.ai && c.seat < 0);
      for (let i = 0; i < G; i++) stepRace(state, track, []);
      const wasBlocked = ais.map((c) => blockedAhead(state, c));
      stepRace(state, track, []);
      ais.forEach((c, k) => {
        if (wasBlocked[k]) { blocked++; expect(launchOf(c), `${c.name} (semente ${seed}) tinha carro à frente`).toBe(2); } else { clear++; if (c.launch === 1) clearGood++; }
      });
    }
    expect(blocked, 'a maioria do grid tem alguém na frente').toBeGreaterThan(clear * 4);
    expect(clear, 'a primeira fila está livre').toBeGreaterThanOrEqual(40);
    expect(clearGood, 'alguma da pista livre acerta').toBeGreaterThan(0);
    expect(clearGood, 'mas não todas').toBeLessThan(clear);
  }, 60_000);

  it('a IA de pista livre acerta mais quanto mais hábil: a chance cresce com a habilidade (carros sozinhos na pista, 600 sorteios)', () => {
    const track = syntheticTrack();
    const hit: Record<string, number> = { low: 0, high: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      for (const [key, skill] of [['low', LAUNCH_AI_MIN_SKILL + 0.02], ['high', LAUNCH_AI_FULL_SKILL]] as const) {
        const { state } = quickRace({ track, totalCars: 1, seed });
        const car = humanCar(state);
        car.ai = { skill, laneX: 0, laneUntil: 0, lookahead: 25, aggression: 0 };
        for (let i = 0; i <= G; i++) stepRace(state, track, []);
        if (car.launch === 1) hit[key]++;
      }
    }
    expect(hit.high).toBeGreaterThan(hit.low * 2);
    expect(hit.high / 300).toBeGreaterThan(LAUNCH_AI_MAX_CHANCE - 0.1);
    expect(hit.high / 300).toBeLessThan(LAUNCH_AI_MAX_CHANCE + 0.1);
  }, 60_000);

  it('o humano que a IA assumiu antes do zero também sorteia (a IA dirige o carro)', () => {
    const track = syntheticTrack();
    const results = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const { state } = quickRace({ track, totalCars: 1, seed });
      const car = humanCar(state);
      for (let i = 0; i <= G + 1; i++) stepRace(state, track, [i === 20 ? { ...NEUTRAL_INPUT, takeover: true } : inp(i > 100)]);
      expect(car.ai).not.toBeNull();
      results.add(launchOf(car));
    }
    expect([...results].sort()).toEqual([1, 2]);
  });
});

// ───────────────────────────── Determinismo ─────────────────────────────

describe('largada-foguete: determinismo', () => {
  it('4 humanos e IA, cada um apertando num tick: duas corridas dão o mesmo estado, e serializar no meio da contagem e continuar também', () => {
    const humans = [human(0), human(1, 0, 'trovao'), human(2, 0, 'tornado'), human(3, 0, 'camelo')];
    const pressAt = [G - 15, G - 2, G + 4, G - 30];
    const pilot = (state: RaceState): PlayerInput[] => pressAt.map((p) => inp(state.tick >= p));
    const go = (): RaceState => {
      const { state, track } = quickRace({ humans, totalCars: 20, assists: ALL_ASSISTS, seed: 9 });
      for (let i = 0; i < G + 40; i++) stepRace(state, track, pilot(state));
      return state;
    };
    const a = go();
    expect(serializeRace(go())).toBe(serializeRace(a));
    expect(a.cars.filter((c) => c.seat >= 0).map((c) => launchOf(c))).toEqual([1, 1, 1, 2]);
    const { state: b, track } = quickRace({ humans, totalCars: 20, assists: ALL_ASSISTS, seed: 9 });
    for (let i = 0; i < 200; i++) stepRace(b, track, pilot(b));
    const copy = deserializeRace(serializeRace(b));
    for (let i = 0; i < G + 40 - 200; i++) { stepRace(b, track, pilot(b)); stepRace(copy, track, pilot(copy)); }
    expect(serializeRace(copy)).toBe(serializeRace(b));
    expect(hashRace(copy)).toBe(hashRace(a));
  }, 60_000);
});

// ───────────────────────────── Online: a contagem adiantada pelo atraso ─────────────────────────────

describe('contagem desenhada adiantada: funções puras', () => {
  it('countdownDisplayTick(t, d) é t + d (o atraso nunca é negativo)', () => {
    expect(countdownDisplayTick(100, 0)).toBe(100);
    expect(countdownDisplayTick(100, 3)).toBe(103);
    expect(countdownDisplayTick(100, 12)).toBe(112);
    expect(countdownDisplayTick(100, -4)).toBe(100);
  });

  it.each([[0], [3], [12]])('countdownCue(t, %i) é o evento que o stepRace emite no tick t + atraso (os bipes de 3, 2, 1 e o "JÁ")', (lead) => {
    const track = getTrack('copacabana');
    const state = createRace({ trackId: track.def.id, laps: 2, humans: [human(0)], totalCars: 4, difficulty: 'profissional', manualGear: false, assists: NO_ASSISTS, seed: 1 }, track);
    const sim: Record<number, SimEvent | undefined> = {};
    for (let u = 0; u < G + 4; u++) { stepRace(state, track, []); sim[u] = state.events.find((e) => e.type === 'countdown' || e.type === 'go'); }
    for (let t = 0; t + lead < G + 4; t++) expect(countdownCue(t, lead), `t=${t}`).toEqual(sim[t + lead] ?? null);
    const cues = []; for (let t = 0; t < G + 4; t++) { const c = countdownCue(t, lead); if (c) cues.push(c); }
    expect(cues.map((c) => (c.type === 'countdown' ? c.value : 'go'))).toEqual([3, 2, 1, 'go']);
  });
});

/**
 * Dois clientes de verdade (Lockstep + stepRace) ligados por uma rede sem perda e sem demora (o que atrasa é só o atraso de
 * ENTRADA do lockstep). O jogador local (assento 0, cliente A) aperta o acelerador quando a contagem DESENHADA marca
 * `G + k` — com `compensate`, a desenhada de verdade (countdownDisplayTick); sem, o tick do núcleo (o que a tela mostraria
 * sem a compensação). O assento 1 (cliente B) fica neutro. Devolve a largada do assento 0 em cada cliente e se os hashes fecham.
 */
function onlineLaunch(delay: number, k: number, compensate: boolean): { a: number; b: number; hashesEqual: boolean; landed: number } {
  const track = getTrack('copacabana');
  const cfg: RaceConfig = { trackId: track.def.id, laps: 2, humans: [human(0, 0), human(1, 1, 'trovao')], totalCars: 2, difficulty: 'profissional', manualGear: false, assists: NO_ASSISTS, seed: 31 };
  const A = { state: createRace(cfg, track), ls: null as unknown as Lockstep };
  const B = { state: createRace(cfg, track), ls: null as unknown as Lockstep };
  A.ls = new Lockstep({ seats: [0, 1], localSeats: [0], delay }, { sendInputs: (r) => B.ls.receive(r), sendHash: () => undefined });
  B.ls = new Lockstep({ seats: [0, 1], localSeats: [1], delay }, { sendInputs: (r) => A.ls.receive(r), sendHash: () => undefined });
  let landed = -1;
  const run = (c: typeof A) => c.ls.step(c.state, 0, (inputs) => stepRace(c.state, track, inputs));
  for (let frame = 0; frame < G + 40; frame++) {
    const shown = compensate ? countdownDisplayTick(A.state.tick, delay) : A.state.tick;
    const pressing = shown >= G + k;
    if (pressing && landed < 0) landed = A.state.tick + delay;
    A.ls.setLocalInput(0, inp(pressing));
    B.ls.setLocalInput(1, inp(false));
    let ra = run(A); const rb = run(B);
    if (!ra) ra = run(A);
    if (!ra || !rb) throw new Error(`o lockstep travou no quadro ${frame}`);
  }
  const seatCar = (s: RaceState) => s.cars.find((c) => c.seat === 0)!;
  return { a: seatCar(A.state).launch, b: seatCar(B.state).launch, hashesEqual: hashRace(A.state) === hashRace(B.state) && A.state.tick === B.state.tick, landed };
}

describe('largada-foguete no online: o mesmo instante físico do aperto dá o mesmo resultado com atraso 3 e com 12', () => {
  const ks = [-E - 1, -E, -5, 0, L, L + 1];
  it.each(ks)('aperto quando a contagem desenhada marca G %+i: atraso 3 e atraso 12 dão a mesma largada (perfeita só dentro da janela) e os dois clientes fecham o mesmo hash', (k) => {
    const d3 = onlineLaunch(3, k, true);
    const d12 = onlineLaunch(12, k, true);
    const inside = k >= -E && k <= L;
    for (const r of [d3, d12]) { expect(r.hashesEqual).toBe(true); expect(r.a).toBe(inside ? 1 : 2); expect(r.b, 'o outro cliente vê o mesmo').toBe(r.a); }
    expect(d3.landed, 'o aperto cai no mesmo tick do núcleo nos dois atrasos').toBe(G + k);
    expect(d12.landed).toBe(G + k);
  });

  it('o controle: SEM a compensação, o mesmo aperto (G +2 na tela) dá resultados diferentes — atraso 3 acerta, atraso 12 erra', () => {
    const d3 = onlineLaunch(3, 2, false);
    const d12 = onlineLaunch(12, 2, false);
    expect(d3.landed).toBe(G + 2 + 3);
    expect(d12.landed).toBe(G + 2 + 12);
    expect(d3.a).toBe(1);
    expect(d12.a).toBe(2);
  });
});
