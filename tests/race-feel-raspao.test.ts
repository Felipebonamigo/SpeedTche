// Raspão derivado fora do núcleo (src/game/race-feel.ts: observeScrapes, onda L, L5). O núcleo resolve o contato de lado
// (`sideContact`, core/sim/collisions.ts) sem evento nem cooldown; a interface quer faísca, vibração e som nele. Aqui o
// raspão é DERIVADO só do estado, a cada tick, por episódio. A prova que o cronograma pede: a contagem derivada bate com
// o `sideContact` real (diferença ≤ 5%), em corridas inteiras de IA.
//
// O "real" vem de um oráculo que usa a `resolveCarCollisions` de verdade: um vi.mock a envolve, troca por um instante cada
// carro por um Proxy que registra as escritas e lê o que a função fez. O `sideContact` é a única rotina que escreve, em
// seguida, `x` dos dois carros e depois `speed` dos dois (a batida em fila escreve `z` de quem vem atrás); esse padrão
// conta os raspões de verdade, inclusive os que só aparecem na 2ª passada (engavetamento). Nenhuma linha do núcleo foi tocada.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CAR_LENGTH, COLLISION_COOLDOWN_TICKS } from '../src/core/constants';
import { createRace, stepRace } from '../src/core/sim/race';
import { getTrack } from '../src/core/track';
import type { CarState, RaceState, Track } from '../src/core/types';
import { NEUTRAL_INPUT } from '../src/core/types';
import { createScrapeMemory, observeScrapes } from '../src/game/race-feel';
import { human, quickRace, skipCountdown } from './helpers';

const oracle = vi.hoisted(() => ({ on: false, ticks: new Map<string, number[]>() }));

vi.mock('../src/core/sim/collisions', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/core/sim/collisions')>();
  return {
    ...orig,
    resolveCarCollisions(state: RaceState, track: Track): void {
      if (!oracle.on) { orig.resolveCarCollisions(state, track); return; }
      const real = state.cars;
      const log: Array<[number, string]> = [];
      state.cars = real.map((c, i) => new Proxy(c, { set(target, prop, value) { log.push([i, String(prop)]); (target as unknown as Record<string, unknown>)[String(prop)] = value; return true; } }));
      try { orig.resolveCarCollisions(state, track); } finally { state.cars = real; }
      for (let k = 0; k + 3 < log.length; k++) {
        const [i0, p0] = log[k]; const [i1, p1] = log[k + 1]; const [i2, p2] = log[k + 2]; const [i3, p3] = log[k + 3];
        if (p0 !== 'x' || p1 !== 'x' || p2 !== 'speed' || p3 !== 'speed' || i0 !== i2 || i1 !== i3 || i0 === i1) continue;
        const a = real[i0].id; const b = real[i1].id;
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        const list = oracle.ticks.get(key) ?? [];
        list.push(state.tick);
        oracle.ticks.set(key, list);
      }
    },
  };
});

/** Episódios do oráculo: um por par, a mesma régua do cooldown (contato que continua ou volta dentro dele é o mesmo). */
function oracleEpisodes(): number {
  let n = 0;
  for (const ticks of oracle.ticks.values()) {
    let last = -Infinity;
    for (const t of ticks) { if (t - last > COLLISION_COOLDOWN_TICKS) n++; last = t; }
  }
  return n;
}

beforeEach(() => { oracle.on = false; oracle.ticks.clear(); });

/** Dois carros de verdade no meio da pista, prontos para o `stepRace` resolver o contato. */
function duo() {
  const { state, track } = quickRace({ humans: [human(0)], totalCars: 2 });
  skipCountdown(state, track);
  const [a, b] = state.cars;
  const reset = (over: Partial<CarState>, other: Partial<CarState>) => { Object.assign(a, { z: 20_000, x: -0.1, speed: 3000, skidTicks: 0, collisionCooldown: 0 }, over); Object.assign(b, { z: 20_000, x: 0.1, speed: 3000, skidTicks: 0, collisionCooldown: 0 }, other); };
  const step = () => { stepRace(state, track, []); return observeScrapes(mem, state); };
  const mem = createScrapeMemory();
  return { state, track, a, b, reset, step, mem };
}

describe('raspão derivado: um episódio, um sinal', () => {
  it('dois carros lado a lado que se encostam dão UM raspão, com os dois ids e o lado do outro', () => {
    const d = duo();
    d.reset({ x: -0.1 }, { x: 0.1 }); // 0,2 de lado: sobrepõe a caixa (2 × 0,13 = 0,26)
    const cues = d.step();
    expect(cues).toHaveLength(1);
    expect([cues[0].a, cues[0].b].sort()).toEqual([d.a.id, d.b.id].sort());
    // `sideOfA`: de que lado de `a` está o outro (+1 = à direita).
    expect(cues[0].sideOfA).toBe(cues[0].a === d.a.id ? 1 : -1);
    expect(cues[0].strength).toBeGreaterThan(0);
    expect(cues[0].strength).toBeLessThanOrEqual(1);
  });

  it('o contato que continua não conta de novo; outro contato depois do cooldown conta', () => {
    const d = duo();
    d.reset({ x: -0.1 }, { x: 0.1 });
    expect(d.step()).toHaveLength(1);
    let again = 0;
    for (let i = 0; i < 8; i++) again += d.step().length; // seguem colados, na mesma velocidade
    expect(again).toBe(0);
    // afasta por mais que o cooldown…
    d.reset({ x: -0.8 }, { x: 0.8 });
    for (let i = 0; i < COLLISION_COOLDOWN_TICKS + 5; i++) expect(d.step()).toHaveLength(0);
    // …e encosta de novo
    d.reset({ x: -0.1 }, { x: 0.1 });
    expect(d.step()).toHaveLength(1);
  });

  it('batida em fila (por trás) não é raspão', () => {
    const d = duo();
    d.reset({ z: 20_000, x: 0, speed: 5000 }, { z: 20_000 + CAR_LENGTH - 30, x: 0, speed: 2000 });
    const cues = d.step();
    expect(d.state.events.some((e) => e.type === 'collision')).toBe(true);
    expect(cues).toHaveLength(0);
  });

  it('carros separados, ou lado a lado com ar entre eles, não contam', () => {
    const d = duo();
    d.reset({ x: -0.3 }, { x: 0.3 });
    for (let i = 0; i < 10; i++) expect(d.step()).toHaveLength(0);
    d.reset({ z: 20_000, x: 0 }, { z: 26_000, x: 0.05 });
    for (let i = 0; i < 10; i++) expect(d.step()).toHaveLength(0);
  });

  it('só lê: o estado não muda por causa da observação', () => {
    const d = duo();
    d.reset({ x: -0.1 }, { x: 0.1 });
    stepRace(d.state, d.track, [NEUTRAL_INPUT]);
    const before = JSON.stringify(d.state);
    observeScrapes(d.mem, d.state);
    expect(JSON.stringify(d.state)).toBe(before);
  });
});

describe('a contagem derivada bate com o sideContact real (cronograma: diferença ≤ 5%)', () => {
  it('corridas inteiras de IA (3 pistas × 2 sementes, 20 carros, 75 s cada)', () => {
    let derived = 0; let real = 0;
    const perRace: string[] = [];
    for (const trackId of ['copacabana', 'passo_alpino', 'foz_do_iguacu']) {
      for (const seed of [11, 12]) {
        const track = getTrack(trackId);
        // Sem humano a corrida acaba no 1º tick (checkRaceOver): um humano com direção completa, só acelerando, mantém a pista viva.
        const state = createRace({ trackId, laps: 3, humans: [{ ...human(0), assist: 'full' }], totalCars: 20, difficulty: 'campeao', manualGear: false, assists: { sharedNitro: false, tow: false, teamDraft: false, catchup: false }, seed }, track);
        skipCountdown(state, track);
        oracle.on = true; oracle.ticks.clear();
        const mem = createScrapeMemory();
        let d = 0;
        for (let i = 0; i < 60 * 75 && state.phase === 'racing'; i++) { stepRace(state, track, [{ ...NEUTRAL_INPUT, throttle: true }]); d += observeScrapes(mem, state).length; }
        const r = oracleEpisodes();
        perRace.push(`${trackId}/${seed}: real ${r}, derivado ${d}`);
        derived += d; real += r;
      }
    }
    oracle.on = false;
    // Não pode ser vazio: com poucos raspões a razão não prova nada.
    expect(real, perRace.join(' · ')).toBeGreaterThanOrEqual(20);
    expect(Math.abs(derived - real) / real, `${perRace.join(' · ')} → total real ${real}, derivado ${derived}`).toBeLessThanOrEqual(0.05);
  }, 240_000);
});
