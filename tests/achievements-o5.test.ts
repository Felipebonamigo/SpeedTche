// O5 (docs/ondas/O/O5.md §4.4): as conquistas novas — as que caem nos primeiros 15 minutos, as de economia e coleção — e NITRO_TRIPLO e
// NITRO_NA_BANDEIRA reescritas com o nitro em barra da N1. A telemetria nova (largada perfeita, mini-turbo, cargas na barra, barra vazia na
// chegada) vem dos eventos e do estado, observados como a sessão observa (observeTick); as regras, de unlockAchievements.
import { describe, expect, it } from 'vitest';
import { CARS } from '../src/core/data/cars';
import { newCareer } from '../src/core/career';
import { NITRO_CHARGE_COST } from '../src/core/constants';
import { stepRace } from '../src/core/sim/race';
import type { RaceState, Track } from '../src/core/types';
import { evaluateAchievements, newTelemetry, observeTick, openAchievements, type RaceTelemetry, type SeatTelemetry } from '../src/game/achievements';
import { DEFAULT_SAVE, type SaveData } from '../src/game/contracts';
import { ACHIEVEMENTS } from '../src/game/desktop';
import { emptyProgress, type ProgressNews } from '../src/game/progression';
import { sanitizeSave } from '../src/game/save';
import { emptyPlayerStats } from '../src/game/stats';
import { human, humanCar, quickRace, run, skipCountdown, syntheticTrack } from './helpers';

const NEW_IDS = ['PRIMEIRA_CORRIDA', 'LARGADA_FOGUETE', 'MINI_TURBO', 'SUBIU_DE_NIVEL', 'PRIMEIRA_PECA', 'CARRO_NOVO', 'OFICINA_COMPLETA', 'COLECIONADOR', 'MAESTRIA_MAXIMA', 'NIVEL_MAXIMO'];

function finished(humans = [human(0)], timeTrial = false) {
  const { state, track } = quickRace({ track: syntheticTrack([{ op: 'straight', length: 300 }]), humans, totalCars: timeTrial ? humans.length : 4, laps: 1, seed: 11, timeTrial });
  run(state, track, 60 * 240);
  expect(state.phase).toBe('finished');
  return state;
}

function tel(seat: Partial<SeatTelemetry>, at = 0): RaceTelemetry {
  const t = newTelemetry();
  t.seats.set(at, { nitros: 0, towsGiven: 0, towsReceived: 0, collisions: 1, crashes: 1, pitStops: 0, draftTicks: 0, startProgress: 0, nitroAtFinish: false, lastAfterFirstLap: false, perfectLaunch: false, miniTurbos: 0, maxCharges: 1, nitroEmptyAtFinish: false, ...seat });
  return t;
}

const fresh = (): SaveData => sanitizeSave({});
const ids = (save: SaveData, state: RaceState, t: RaceTelemetry, progress: ProgressNews[] = [], mode: 'quick' | 'timetrial' = 'quick') =>
  evaluateAchievements(save, mode, state, state.results ?? [], state.config.humans, t, false, null, 'profissional', null, progress);

describe('a lista da Steam', () => {
  it('68 conquistas: as 57 de antes, as 10 do O5 e a Hora de entrega (V6c), com nome PT e EN', () => {
    expect(ACHIEVEMENTS).toHaveLength(68);
    for (const id of NEW_IDS) expect(ACHIEVEMENTS.map((a) => a.id), id).toContain(id);
  });
});

describe('as dos primeiros 15 minutos', () => {
  const state = finished();
  it('PRIMEIRA_CORRIDA: correr uma corrida até o fim, em qualquer modo (o contra-relógio também)', () => {
    expect(ids(fresh(), state, tel({}))).toContain('PRIMEIRA_CORRIDA');
    const tt = finished([human(0)], true);
    expect(ids(fresh(), tt, tel({}), [], 'timetrial')).toContain('PRIMEIRA_CORRIDA');
  });
  it('LARGADA_FOGUETE e MINI_TURBO: pela telemetria da corrida', () => {
    expect(ids(fresh(), state, tel({ perfectLaunch: true }))).toContain('LARGADA_FOGUETE');
    expect(ids(fresh(), state, tel({ miniTurbos: 1 }))).toContain('MINI_TURBO');
    const none = ids(fresh(), state, tel({}));
    expect(none).not.toContain('LARGADA_FOGUETE');
    expect(none).not.toContain('MINI_TURBO');
  });
  it('SUBIU_DE_NIVEL, NIVEL_MAXIMO e MAESTRIA_MAXIMA: pelo que a corrida rendeu ao assento (O5, progression.ts)', () => {
    const news = (level: number, mastery: number): ProgressNews[] => [{ seat: 0, name: 'P1', carId: 'falcao', xp: 50, pilotXp: 0, level: { before: 1, after: level }, carXp: 0, mastery: { before: 0, after: mastery }, unlocks: [] }];
    expect(ids(fresh(), state, tel({}), news(1, 0))).not.toContain('SUBIU_DE_NIVEL');
    expect(ids(fresh(), state, tel({}), news(2, 0))).toContain('SUBIU_DE_NIVEL');
    expect(ids(fresh(), state, tel({}), news(29, 4))).not.toContain('NIVEL_MAXIMO');
    expect(ids(fresh(), state, tel({}), news(30, 4))).toContain('NIVEL_MAXIMO');
    expect(ids(fresh(), state, tel({}), news(30, 4))).not.toContain('MAESTRIA_MAXIMA');
    expect(ids(fresh(), state, tel({}), news(3, 5))).toContain('MAESTRIA_MAXIMA');
  });
});

describe('NITRO_TRIPLO e NITRO_NA_BANDEIRA reescritas para a barra', () => {
  const state = finished();
  it('NITRO_TRIPLO: juntar 3 cargas na barra; 3 nitros numa volta (a regra antiga, comum com a barra) não basta', () => {
    const old = tel({ maxCharges: 2 });
    old.maxNitrosInLap.set(0, 3);
    expect(ids(fresh(), state, old)).not.toContain('NITRO_TRIPLO');
    expect(ids(fresh(), state, tel({ maxCharges: 3 }))).toContain('NITRO_TRIPLO');
  });
  it('NITRO_NA_BANDEIRA: nitro ligado E a barra sem carga na chegada; só o nitro ligado (a regra antiga) não basta', () => {
    expect(ids(fresh(), state, tel({ nitroAtFinish: true }))).not.toContain('NITRO_NA_BANDEIRA');
    expect(ids(fresh(), state, tel({ nitroAtFinish: true, nitroEmptyAtFinish: true }))).toContain('NITRO_NA_BANDEIRA');
  });
});

/** Um passo observado com um evento posto à mão no tick (o núcleo emite; aqui só importa a leitura). */
function observeWith(state: RaceState, track: Track, t: RaceTelemetry, push: (s: RaceState) => void): void {
  stepRace(state, track, [{ steer: 0, throttle: true, brake: false, nitro: false, gearUp: false, gearDown: false }]);
  push(state);
  observeTick(t, state, track);
}

describe('telemetria nova (observeTick)', () => {
  it('largada perfeita e mini-turbo vêm dos eventos `launch` e `drift_boost` do carro humano; os da IA não contam', () => {
    const { state, track } = quickRace({ track: syntheticTrack(), humans: [human(0)], totalCars: 3, laps: 2 });
    skipCountdown(state, track);
    const t = newTelemetry();
    const me = humanCar(state).id;
    const ai = state.cars.find((c) => c.seat < 0)!.id;
    observeWith(state, track, t, (s) => { s.events.push({ type: 'launch', carId: ai }, { type: 'drift_boost', carId: ai, level: 2 }); });
    expect(t.seats.get(0)?.perfectLaunch).toBe(false);
    expect(t.seats.get(0)?.miniTurbos).toBe(0);
    observeWith(state, track, t, (s) => { s.events.push({ type: 'launch', carId: me }, { type: 'drift_boost', carId: me, level: 1 }, { type: 'drift_boost', carId: me, level: 3 }); });
    expect(t.seats.get(0)?.perfectLaunch).toBe(true);
    expect(t.seats.get(0)?.miniTurbos).toBe(2);
  });
  it('cargas na barra: o máximo visto correndo', () => {
    const { state, track } = quickRace({ track: syntheticTrack(), humans: [human(0)], totalCars: 2, laps: 2 });
    skipCountdown(state, track);
    const t = newTelemetry();
    observeWith(state, track, t, () => undefined);
    expect(t.seats.get(0)?.maxCharges).toBe(1); // larga com 1 carga
    observeWith(state, track, t, (s) => { humanCar(s).nitroMeter = NITRO_CHARGE_COST * 3; });
    expect(t.seats.get(0)?.maxCharges).toBe(3);
    observeWith(state, track, t, (s) => { humanCar(s).nitroMeter = 0; });
    expect(t.seats.get(0)?.maxCharges).toBe(3);
  });
  it('barra vazia na chegada: nitro ligado e menos de uma carga no tick da bandeirada', () => {
    for (const [meter, empty] of [[0, true], [999, true], [NITRO_CHARGE_COST, false]] as const) {
      const { state, track } = quickRace({ track: syntheticTrack([{ op: 'straight', length: 60 }]), humans: [human(0)], totalCars: 1, laps: 1 });
      skipCountdown(state, track);
      const t = newTelemetry();
      for (let i = 0; i < 60 * 120 && state.phase !== 'finished'; i++) {
        const car = humanCar(state);
        // Perto da linha: nitro aceso à mão e a barra no valor do caso.
        if (!car.finished && car.progress > state.trackLength - 3000) { car.nitroTicks = 100; car.nitroMeter = meter; }
        stepRace(state, track, [{ steer: 0, throttle: true, brake: false, nitro: false, gearUp: false, gearDown: false }]);
        observeTick(t, state, track);
      }
      expect(state.phase).toBe('finished');
      expect(t.seats.get(0)?.nitroAtFinish, `barra ${meter}`).toBe(true);
      expect(t.seats.get(0)?.nitroEmptyAtFinish, `barra ${meter}`).toBe(empty);
    }
  });
});

describe('economia e coleção: de estado (leem o save, não mexem em dinheiro)', () => {
  const state = finished();
  const priced = CARS.filter((c) => c.price > 0).map((c) => c.id);

  function expedition(): SaveData {
    const save = fresh();
    save.career = newCareer([human(0)]);
    return save;
  }

  it('PRIMEIRA_PECA: alguma melhoria comprada na Expedição', () => {
    const save = expedition();
    expect(ids(save, state, tel({}))).not.toContain('PRIMEIRA_PECA');
    save.career!.drivers[0].garage.upgrades.falcao = { engine: 1, turbo: 0, tires: 0, brakes: 0, tank: 0, nitro: 0 };
    expect(ids(save, state, tel({}))).toContain('PRIMEIRA_PECA');
  });
  it('CARRO_NOVO: um carro comprado; COLECIONADOR: os 7 à venda', () => {
    const save = fresh();
    save.carsUnlocked = [priced[0]];
    expect(ids(save, state, tel({}))).toContain('CARRO_NOVO');
    expect(ids(save, state, tel({}))).not.toContain('COLECIONADOR');
    save.carsUnlocked = [...priced];
    expect(ids(save, state, tel({}))).toContain('COLECIONADOR');
  });
  it('OFICINA_COMPLETA: todas as peças de um carro no máximo dele', async () => {
    const { UPGRADE_PARTS, partMaxLevel } = await import('../src/core/career');
    const save = expedition();
    const full = Object.fromEntries(UPGRADE_PARTS.map((p) => [p, partMaxLevel('falcao', p)])) as Record<string, number>;
    save.career!.drivers[0].garage.upgrades.falcao = { ...full, engine: full.engine - 1 } as never;
    expect(ids(save, state, tel({}))).not.toContain('OFICINA_COMPLETA');
    save.career!.drivers[0].garage.upgrades.falcao = full as never;
    expect(ids(save, state, tel({}))).toContain('OFICINA_COMPLETA');
  });
  it('na abertura (openAchievements): quem já tinha comprado, corrido ou subido de nível na 0.1.4 ganha sem correr de novo', () => {
    const save = expedition();
    save.racesRun = 3;
    save.carsUnlocked = [...priced];
    save.stats.players.push({ name: 'Ana', ...emptyPlayerStats(), races: 3, laps: 9 }); // 150 XP: nível 2
    const progress = emptyProgress();
    progress.profiles.push({ name: 'Ana', cars: { saci: 2200 } });
    expect(openAchievements(save, progress).sort()).toEqual(['CARRO_NOVO', 'COLECIONADOR', 'MAESTRIA_MAXIMA', 'PRIMEIRA_CORRIDA', 'SUBIU_DE_NIVEL']);
    // Já guardadas não voltam; save novo não ganha nada.
    save.achievements = ['CARRO_NOVO', 'PRIMEIRA_CORRIDA'];
    expect(openAchievements(save, progress).sort()).toEqual(['COLECIONADOR', 'MAESTRIA_MAXIMA', 'SUBIU_DE_NIVEL']);
    expect(openAchievements(fresh(), emptyProgress())).toEqual([]);
  });
  it('nenhuma regra muda carteira, garagem ou save', () => {
    const save = expedition();
    save.carsUnlocked = [...priced];
    const before = JSON.stringify(save);
    ids(save, state, tel({ perfectLaunch: true, miniTurbos: 3, maxCharges: 3, nitroAtFinish: true, nitroEmptyAtFinish: true }));
    openAchievements(save, emptyProgress());
    expect(JSON.stringify(save)).toBe(before);
    expect(DEFAULT_SAVE.achievements).toEqual([]);
  });
});
