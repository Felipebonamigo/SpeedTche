// O5: o gancho de `settleRace` (raceEnd.ts) que soma a corrida à maestria e devolve o que ela rendeu (docs/ondas/O/O5.md §4.1–§4.2, grupo H),
// dirigido como a sessão faz: em todo modo (rápida, contra-relógio, festa, copa, online só os assentos locais), sem dinheiro, e sem perder
// recordes, estatísticas nem conquistas se o progresso falhar.
import { describe, expect, it } from 'vitest';
import type { HumanEntry } from '../src/core/types';
import { newTelemetry } from '../src/game/achievements';
import { emptyProgress, carXp, type ProgressData } from '../src/game/progression';
import { settleRace, type SettleOptions, type SettleTarget } from '../src/game/raceEnd';
import { sanitizeSave } from '../src/game/save';
import { human, quickRace, run, syntheticTrack } from './helpers';

function race(mode: SettleTarget['mode'], names = ['Ana', 'Bia'], cars = ['saci', 'trovao']) {
  const humans: HumanEntry[] = names.map((name, i) => ({ ...human(i, 0, cars[i]), name }));
  const { state, track } = quickRace({ track: syntheticTrack([{ op: 'straight', length: 300 }]), humans, totalCars: mode === 'timetrial' ? humans.length : 6, laps: 1, seed: 5, timeTrial: mode === 'timetrial' });
  run(state, track, 60 * 240);
  expect(state.phase).toBe('finished');
  const target: SettleTarget = { state, track, mode, humans, telemetry: newTelemetry(), outcome: null };
  return target;
}

function options(progress: ProgressData | undefined, fx = { achievements: [] as string[], persisted: 0, progressPersisted: 0 }, o: Partial<SettleOptions> = {}): SettleOptions {
  return {
    champ: null, difficulty: 'profissional', hudTtl: 3.5,
    effects: {
      achievement: (id) => { fx.achievements.push(id); }, hud: () => undefined,
      persist: () => { fx.persisted++; }, persistProgress: () => { fx.progressPersisted++; },
    },
    progress, ...o,
  };
}

describe('settleRace soma o progresso', () => {
  for (const mode of ['quick', 'timetrial', 'escort', 'relay', 'tournament', 'cup', 'career'] as const) {
    it(`${mode}: cada humano local ganha XP e maestria no carro dele; o progresso é gravado uma vez`, () => {
      const r = race(mode === 'timetrial' ? 'timetrial' : mode, mode === 'timetrial' ? ['Ana'] : ['Ana', 'Bia'], mode === 'timetrial' ? ['saci'] : ['saci', 'trovao']);
      const save = sanitizeSave({});
      const progress = emptyProgress();
      const fx = { achievements: [] as string[], persisted: 0, progressPersisted: 0 };
      const out = settleRace(save, r, options(progress, fx));
      expect(out.progress?.map((n) => n.name)).toEqual(mode === 'timetrial' ? ['Ana'] : ['Ana', 'Bia']);
      for (const n of out.progress ?? []) {
        expect(n.xp).toBeGreaterThan(0);
        expect(carXp(progress, n.name, n.carId)).toBe(n.xp);
      }
      expect(out.progress?.[0].carId).toBe('saci');
      expect(fx.progressPersisted).toBe(1);
      expect(fx.persisted).toBe(1);
      // Sem dinheiro: a carreira (nula aqui) não nasce, a carteira não existe.
      expect(save.career).toBeNull();
    });
  }

  it('online: só os assentos deste computador', () => {
    const r = race('quick');
    const progress = emptyProgress();
    const out = settleRace(sanitizeSave({}), r, options(progress, undefined, { localSeats: [1] }));
    expect(out.progress?.map((n) => n.name)).toEqual(['Bia']);
    expect(progress.profiles.map((p) => p.name)).toEqual(['Bia']);
  });

  it('a 2ª corrida de um piloto novo passa do nível 2 e dá SUBIU_DE_NIVEL a ele', () => {
    const save = sanitizeSave({});
    const progress = emptyProgress();
    const fx = { achievements: [] as string[], persisted: 0, progressPersisted: 0 };
    settleRace(save, race('quick', ['Ana'], ['saci']), options(progress, fx));
    const second = settleRace(save, race('quick', ['Ana'], ['saci']), options(progress, fx));
    const ana = second.progress?.[0];
    expect(ana?.level.after).toBeGreaterThanOrEqual(2);
    expect(save.achievements).toContain('SUBIU_DE_NIVEL');
    expect(second.achievements.find((u) => u.id === 'SUBIU_DE_NIVEL')?.seats).toEqual([0]);
  });

  it('idempotente: a segunda chamada não soma de novo', () => {
    const r = race('quick');
    const progress = emptyProgress();
    const fx = { achievements: [] as string[], persisted: 0, progressPersisted: 0 };
    settleRace(sanitizeSave({}), r, options(progress, fx));
    const before = JSON.stringify(progress);
    settleRace(sanitizeSave({}), r, options(progress, fx));
    expect(JSON.stringify(progress)).toBe(before);
    expect(fx.progressPersisted).toBe(1);
  });

  it('sem progresso (quem chama não tem): nada muda no fechamento de antes', () => {
    const r = race('quick');
    const save = sanitizeSave({});
    const out = settleRace(save, r, options(undefined));
    expect(out.progress).toEqual([]);
    expect(save.racesRun).toBe(1);
  });

  it('guarda: progresso quebrado não perde recordes, estatísticas nem conquistas, e o save é gravado', () => {
    const r = race('quick');
    const save = sanitizeSave({});
    const broken = { profiles: Object.freeze([]) } as unknown as ProgressData; // `unshift` num array congelado lança
    const fx = { achievements: [] as string[], persisted: 0, progressPersisted: 0 };
    const out = settleRace(save, r, options(broken, fx));
    expect(save.racesRun).toBe(1);
    expect(save.stats.players.map((p) => p.name).sort()).toEqual(['Ana', 'Bia']);
    expect(save.achievements).toContain('PRIMEIRA_CORRIDA');
    expect(out.achievements.map((u) => u.id)).toContain('PRIMEIRA_CORRIDA');
    expect(fx.persisted).toBe(1);
    expect(out.progress).toEqual([]);
  });
});
