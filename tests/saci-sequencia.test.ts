// V6d: "Hora de entrega" ganhou o SEGUNDO caminho da ficha: 5 vitórias seguidas no Saci Mirim (o primeiro, 10 vitórias sem comprar carro, é da V6c).
// O contador mora na chave `speed-tche.progress` (O5), por perfil e aditivo: `saciStreak`. Ausente = 0; o save principal não muda.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARS } from '../src/core/data/cars';
import type { HumanEntry } from '../src/core/types';
import { evaluateAchievements, newTelemetry, openAchievements, SACI_STREAK_TARGET, unlockAchievements } from '../src/game/achievements';
import { carAvailable, syncConquestCars } from '../src/game/career-save';
import type { SaveData } from '../src/game/contracts';
import { settleRace, type SettleOptions, type SettleTarget } from '../src/game/raceEnd';
import { emptyProgress, loadProgress, PROGRESS_KEY, type ProgressData, sanitizeProgress, saveProgress, settleProgress, type ProgressNews } from '../src/game/progression';
import { sanitizeSave } from '../src/game/save';
import { emptyPlayerStats, emptyStats, type Contribution } from '../src/game/stats';
import { lockText } from '../src/ui/screens/progress';
import '../src/progress/strings';
import { setLanguage, t } from '../src/i18n';
import '../src/i18n/core';
import '../src/stats/strings';
import { human, quickRace, run, syntheticTrack } from './helpers';

/** Uma corrida de verdade até o fim; só serve de estado (o carro de cada assento é o que importa). */
function raceOf(humans: HumanEntry[], extra: { timeTrial?: boolean } = {}) {
  const { state, track } = quickRace({ track: syntheticTrack([{ op: 'straight', length: 300 }]), humans, totalCars: 4, laps: 1, seed: 11, ...extra });
  run(state, track, 60 * 240);
  expect(state.phase).toBe('finished');
  return state;
}
const named = (seat: number, car: string, name: string): HumanEntry => ({ ...human(seat, 0, car), name });
/** A contribuição é montada à mão (vitória ou não): o que se testa é o contador, não quem ganhou a corrida simulada. */
const contribution = (seat: number, name: string, won: boolean): Contribution => ({ seat, name, stats: { ...emptyPlayerStats(), races: 1, laps: 1, wins: won ? 1 : 0, podiums: won ? 1 : 0 } });
const streakOf = (data: ReturnType<typeof emptyProgress>, name: string) => data.profiles.find((p) => p.name === name)?.saciStreak ?? 0;

/** Uma corrida: cada item é [assento, carro, nome, venceu]. */
function raceWith(data: ReturnType<typeof emptyProgress>, rows: Array<[number, string, string, boolean]>, extra: { timeTrial?: boolean } = {}) {
  const humans = rows.map(([seat, car, name]) => named(seat, car, name));
  const state = raceOf(humans, extra);
  const contributions = rows.map(([seat, , name, won]) => contribution(seat, name, won));
  return settleProgress(data, emptyStats(), { state, contributions });
}

describe('contador de vitórias seguidas no Saci Mirim (por perfil)', () => {
  it('conta 1, 2, 3… a cada vitória com o Saci Mirim, e a notícia da corrida leva o valor', () => {
    const data = emptyProgress();
    for (let i = 1; i <= 5; i++) {
      const [n] = raceWith(data, [[0, 'saci', 'Ana', true]]);
      expect(n.saciStreak, `corrida ${i}`).toBe(i);
      expect(streakOf(data, 'Ana')).toBe(i);
    }
    expect(SACI_STREAK_TARGET).toBe(5);
  });

  it('outro carro zera, mesmo vencendo', () => {
    const data = emptyProgress();
    raceWith(data, [[0, 'saci', 'Ana', true]]);
    raceWith(data, [[0, 'saci', 'Ana', true]]);
    const [n] = raceWith(data, [[0, 'trovao', 'Ana', true]]);
    expect(n.saciStreak ?? 0).toBe(0);
    expect(streakOf(data, 'Ana')).toBe(0);
    const [again] = raceWith(data, [[0, 'saci', 'Ana', true]]);
    expect(again.saciStreak).toBe(1); // recomeça do 1
  });

  it('corrida sem vitória (mesmo com o Saci Mirim) zera', () => {
    const data = emptyProgress();
    for (let i = 0; i < 4; i++) raceWith(data, [[0, 'saci', 'Ana', true]]);
    expect(streakOf(data, 'Ana')).toBe(4);
    raceWith(data, [[0, 'saci', 'Ana', false]]);
    expect(streakOf(data, 'Ana')).toBe(0);
  });

  it('contra-relógio não conta nem zera (não é corrida de verdade: sem vitória possível)', () => {
    const data = emptyProgress();
    raceWith(data, [[0, 'saci', 'Ana', true]]);
    raceWith(data, [[0, 'saci', 'Ana', true]]);
    const [n] = raceWith(data, [[0, 'saci', 'Ana', false]], { timeTrial: true });
    expect(n.saciStreak).toBe(2);
    expect(streakOf(data, 'Ana')).toBe(2);
    raceWith(data, [[0, 'trovao', 'Ana', false]], { timeTrial: true });
    expect(streakOf(data, 'Ana')).toBe(2);
  });

  it('tela dividida e festa: cada perfil tem a sua sequência', () => {
    const data = emptyProgress();
    raceWith(data, [[0, 'saci', 'Ana', true], [1, 'saci', 'Bia', true]]);
    raceWith(data, [[0, 'saci', 'Ana', true], [1, 'saci', 'Bia', false]]);
    raceWith(data, [[0, 'saci', 'Ana', true], [1, 'trovao', 'Bia', true]]);
    expect(streakOf(data, 'Ana')).toBe(3);
    expect(streakOf(data, 'Bia')).toBe(0);
  });

  it('o mesmo nome em dois assentos é um perfil só: a sequência sobe de 1 em 1 (e zera se algum dos dois não qualificou)', () => {
    const data = emptyProgress();
    raceWith(data, [[0, 'saci', 'Ana', true], [1, 'saci', 'ana', true]]);
    expect(streakOf(data, 'Ana')).toBe(1);
    raceWith(data, [[0, 'saci', 'Ana', true], [1, 'saci', 'ana', false]]);
    expect(streakOf(data, 'Ana')).toBe(0);
  });

  it('a notícia traz o valor também para o perfil que zerou (nunca undefined perigoso) e o contador tem teto', () => {
    const data = emptyProgress();
    data.profiles.push({ name: 'Ana', cars: {}, saciStreak: 999 });
    raceWith(data, [[0, 'saci', 'Ana', true]]);
    expect(streakOf(data, 'Ana')).toBe(999);
  });
});

describe('persistência: aditivo na chave do progresso, save antigo = 0', () => {
  const store = new Map<string, string>();
  const real = globalThis.localStorage;
  beforeAll(() => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } });
  });
  afterAll(() => { vi.stubGlobal('localStorage', real); });
  beforeEach(() => store.clear());

  it('grava e relê (ida e volta pela chave speed-tche.progress)', () => {
    const data = emptyProgress();
    for (let i = 0; i < 3; i++) raceWith(data, [[0, 'saci', 'Ana', true]]);
    saveProgress(data);
    expect(JSON.parse(store.get(PROGRESS_KEY) ?? '{}').profiles[0].saciStreak).toBe(3);
    expect(streakOf(loadProgress(), 'Ana')).toBe(3);
  });

  it('progresso de antes (sem o campo) abre com 0, igual ao de sempre; 0 não é gravado', () => {
    const old = { profiles: [{ name: 'Ana', cars: { saci: 80 } }] };
    expect(sanitizeProgress(old)).toEqual(old);
    expect(streakOf(sanitizeProgress(old), 'Ana')).toBe(0);
    expect('saciStreak' in sanitizeProgress({ profiles: [{ name: 'Ana', cars: {}, saciStreak: 0 }] }).profiles[0]).toBe(false);
  });

  it('lixo no campo vira 0 e o resto do perfil fica; nunca lança', () => {
    for (const bad of ['5', -3, Number.NaN, Infinity, null, [], {}, true]) {
      const s = sanitizeProgress({ profiles: [{ name: 'Ana', cars: { saci: 80 }, saciStreak: bad }] });
      expect(s.profiles[0], String(bad)).toEqual({ name: 'Ana', cars: { saci: 80 } });
    }
    expect(sanitizeProgress({ profiles: [{ name: 'Ana', cars: {}, saciStreak: 4.6 }] }).profiles[0].saciStreak).toBe(5);
    expect(sanitizeProgress({ profiles: [{ name: 'Ana', cars: {}, saciStreak: 1e9 }] }).profiles[0].saciStreak).toBe(999);
  });

  it('o save principal não ganha campo nenhum', () => {
    expect(Object.keys(sanitizeSave({})).sort()).toEqual(Object.keys(sanitizeSave(JSON.parse(JSON.stringify(sanitizeSave({}))))).sort());
    expect(JSON.stringify(sanitizeSave({}))).not.toContain('saciStreak');
  });
});

describe('HORA_DE_ENTREGA pelo segundo caminho: 5 vitórias seguidas no Saci Mirim', () => {
  const fresh = (): SaveData => sanitizeSave({});
  function finished() {
    const q = quickRace({ track: syntheticTrack([{ op: 'straight', length: 300 }]), humans: [human(0)], totalCars: 4, laps: 1, seed: 11 });
    run(q.state, q.track, 60 * 240);
    return q.state;
  }
  const news = (saciStreak: number | undefined): ProgressNews[] => [{ seat: 0, name: 'P1', carId: 'saci', xp: 50, pilotXp: 0, level: { before: 1, after: 1 }, carXp: 0, mastery: { before: 0, after: 0 }, unlocks: [], saciStreak }];
  const ids = (save: SaveData, progress: ProgressNews[]) => { const st = finished(); return evaluateAchievements(save, 'quick', st, st.results ?? [], st.config.humans, newTelemetry(), false, null, 'profissional', null, progress); };

  it('5 seguidas liberam (com poucas vitórias no total e até com carro comprado); 4 não', () => {
    expect(ids(fresh(), news(5))).toContain('HORA_DE_ENTREGA');
    expect(ids(fresh(), news(4))).not.toContain('HORA_DE_ENTREGA');
    expect(ids(fresh(), news(undefined))).not.toContain('HORA_DE_ENTREGA');
    const bought = fresh(); bought.carsUnlocked = ['curupira'];
    expect(ids(bought, news(5))).toContain('HORA_DE_ENTREGA');
  });

  it('quem ganhou é o assento da sequência', () => {
    const st = finished();
    const out = unlockAchievements(fresh(), 'quick', st, st.results ?? [], st.config.humans, newTelemetry(), false, null, 'profissional', null, news(5));
    expect(out.find((u) => u.id === 'HORA_DE_ENTREGA')?.seats).toEqual([0]);
  });

  it('as duas regras cumpridas juntas dão UMA conquista só; já tendo a conquista, nada de novo', () => {
    const save = fresh();
    save.stats.totals.wins = 10; save.stats.players = [{ ...save.stats.totals, name: 'P1' }];
    const st = finished();
    const out = unlockAchievements(save, 'quick', st, st.results ?? [], st.config.humans, newTelemetry(), false, null, 'profissional', null, news(5));
    expect(out.filter((u) => u.id === 'HORA_DE_ENTREGA')).toHaveLength(1);
    save.achievements.push('HORA_DE_ENTREGA');
    expect(ids(save, news(5))).not.toContain('HORA_DE_ENTREGA');
  });

  it('na abertura do jogo: o progresso gravado com 5 seguidas libera; com 4 ou sem o campo, não', () => {
    const progress = (s: number | undefined) => ({ profiles: [{ name: 'Ana', cars: {}, ...(s === undefined ? {} : { saciStreak: s }) }] });
    expect(openAchievements(fresh(), progress(5))).toContain('HORA_DE_ENTREGA');
    expect(openAchievements(fresh(), progress(4))).not.toContain('HORA_DE_ENTREGA');
    expect(openAchievements(fresh(), progress(undefined))).not.toContain('HORA_DE_ENTREGA');
    expect(openAchievements(fresh(), emptyProgress())).not.toContain('HORA_DE_ENTREGA');
  });

  it('libera o Furgãozinho da Firma (a mesma conquista)', () => {
    const save = fresh();
    const furgao = CARS.find((c) => c.id === 'furgao')!;
    expect(carAvailable(save, furgao)).toBe(false);
    save.achievements.push(...ids(save, news(5)));
    expect(carAvailable(save, furgao)).toBe(true);
    syncConquestCars(save);
    expect(save.carsUnlocked).toContain('furgao');
  });
});

describe('textos: a conquista e o cadeado dizem as duas formas', () => {
  it('PT e EN citam 10 vitórias sem comprar carro e 5 seguidas no Saci Mirim', () => {
    setLanguage('pt');
    expect(t('stats.achDesc.HORA_DE_ENTREGA')).toMatch(/10 vitórias.*5 .*Saci Mirim/s);
    expect(lockText(CARS.find((c) => c.id === 'furgao')!)).toMatch(/10 vitórias.*5 .*Saci Mirim/s);
    setLanguage('en');
    expect(t('stats.achDesc.HORA_DE_ENTREGA')).toMatch(/10 races.*5 .*Saci Mirim/s);
    expect(lockText(CARS.find((c) => c.id === 'furgao')!)).toMatch(/10 wins.*5 .*Saci Mirim/s);
    setLanguage('pt');
  });
});

describe('de ponta a ponta pelo settleRace (como a sessão fecha a corrida)', () => {
  function soloRace(mode: SettleTarget['mode'], car: string) {
    const humans: HumanEntry[] = [{ ...human(0, 0, car), name: 'Ana' }];
    const { state, track } = quickRace({ track: syntheticTrack([{ op: 'straight', length: 300 }]), humans, totalCars: 1, laps: 1, seed: 5, timeTrial: mode === 'timetrial' });
    run(state, track, 60 * 240);
    expect(state.phase).toBe('finished');
    return { state, track, mode, humans, telemetry: newTelemetry(), outcome: null } as SettleTarget;
  }
  const opts = (progress: ProgressData, fx: { achievements: string[] }): SettleOptions => ({
    champ: null, difficulty: 'profissional', hudTtl: 3.5,
    effects: { achievement: (id) => { fx.achievements.push(id); }, hud: () => undefined, persist: () => undefined, persistProgress: () => undefined },
    progress,
  });

  it('a 5ª vitória seguida libera HORA_DE_ENTREGA e o Furgão; a 4ª não; depois dela não repete', () => {
    const save = sanitizeSave({});
    const progress: ProgressData = { profiles: [{ name: 'Ana', cars: {}, saciStreak: 3 }] };
    const fx = { achievements: [] as string[] };
    const fourth = settleRace(save, soloRace('quick', 'saci'), opts(progress, fx));
    expect(fourth.progress?.[0].saciStreak).toBe(4);
    expect(save.achievements).not.toContain('HORA_DE_ENTREGA');
    const fifth = settleRace(save, soloRace('quick', 'saci'), opts(progress, fx));
    expect(fifth.progress?.[0].saciStreak).toBe(5);
    expect(save.achievements).toContain('HORA_DE_ENTREGA');
    expect(carAvailable(save, CARS.find((c) => c.id === 'furgao')!)).toBe(true);
    settleRace(save, soloRace('quick', 'saci'), opts(progress, fx));
    expect(fx.achievements.filter((id) => id === 'HORA_DE_ENTREGA')).toHaveLength(1);
  });

  it('com outro carro a sequência zera; o contra-relógio não mexe', () => {
    const save = sanitizeSave({});
    const progress: ProgressData = { profiles: [{ name: 'Ana', cars: {}, saciStreak: 4 }] };
    const fx = { achievements: [] as string[] };
    settleRace(save, soloRace('timetrial', 'trovao'), opts(progress, fx));
    expect(progress.profiles[0].saciStreak).toBe(4);
    settleRace(save, soloRace('quick', 'trovao'), opts(progress, fx));
    expect(progress.profiles[0].saciStreak).toBeUndefined();
    expect(save.achievements).not.toContain('HORA_DE_ENTREGA');
  });
});
