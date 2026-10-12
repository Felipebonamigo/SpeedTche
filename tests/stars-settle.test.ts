// O4: o gancho de `settleRace` (raceEnd.ts) que fecha as estrelas e o placar (docs/ondas/O/O4.md §6, grupo H), dirigido como a sessão faz.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createChampionship } from '../src/core/championship';
import type { HumanEntry } from '../src/core/types';
import { newTelemetry } from '../src/game/achievements';
import { settleRace, type SettleOptions, type SettleTarget } from '../src/game/raceEnd';
import { sanitizeSave } from '../src/game/save';
import { scoreOf } from '../src/game/stars';
import { human, quickRace, run, syntheticTrack } from './helpers';

const options = (o: Partial<SettleOptions> = {}): SettleOptions => ({
  champ: null, difficulty: 'profissional', hudTtl: 3.5, effects: { achievement: () => undefined, hud: () => undefined, persist: () => undefined }, ...o,
});

function race(mode: SettleTarget['mode'], names = ['Ana', 'Bia']) {
  const humans: HumanEntry[] = names.map((name, i) => ({ ...human(i), name }));
  const { state, track } = quickRace({ track: syntheticTrack([{ op: 'straight', length: 300 }]), humans, totalCars: 6, laps: 1, seed: 5 });
  run(state, track, 60 * 240);
  expect(state.phase).toBe('finished');
  // O rival da copa: o primeiro carro da IA do resultado (a sessão põe `config.rival` na largada).
  const rival = (state.results ?? []).find((r) => r.seat < 0)!.name;
  state.config.rival = rival;
  const target: SettleTarget = { state, track, mode, humans, telemetry: newTelemetry(), outcome: null };
  return { target, humans, rival };
}

describe('settleRace fecha as estrelas', () => {
  it('copa: cada humano local ganha o perfil dele, com a estrela de classificar e o placar contra o rival', () => {
    const { target, humans, rival } = race('cup');
    const save = sanitizeSave({});
    const champ = createChampionship('br_rj', humans);
    settleRace(save, target, options({ champ }));
    const names = save.stars.profiles.map((p) => p.name).sort();
    expect(names).toEqual(['Ana', 'Bia']);
    const results = target.state.results ?? [];
    const ana = results.find((r) => r.name === 'Ana')!;
    const rv = results.find((r) => r.name === rival)!;
    const ahead = ana.position < rv.position;
    const score = scoreOf(save.stars, 'Ana', rival.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
    expect(score).toEqual(ahead ? { you: 1, rival: 0 } : { you: 0, rival: 1 });
    expect(save.stars.last.map((l) => l.name).sort()).toEqual(['Ana', 'Bia']);
    expect(save.stars.last[0].trackId).toBe(target.track.def.id);
  });

  it('corrida rápida não dá estrela nem placar', () => {
    const { target } = race('quick');
    const save = sanitizeSave({});
    settleRace(save, target, options());
    expect(save.stars).toEqual({ profiles: [], last: [] });
  });

  it('online: só os assentos deste computador', () => {
    const { target, humans } = race('cup');
    const save = sanitizeSave({});
    settleRace(save, target, options({ champ: createChampionship('br_rj', humans), localSeats: [1] }));
    expect(save.stars.profiles.map((p) => p.name)).toEqual(['Bia']);
  });

  it('idempotente: a segunda chamada não soma de novo', () => {
    const { target, humans } = race('cup');
    const save = sanitizeSave({});
    const o = options({ champ: createChampionship('br_rj', humans) });
    settleRace(save, target, o);
    const once = JSON.stringify(save.stars);
    settleRace(save, target, o);
    expect(JSON.stringify(save.stars)).toBe(once);
  });

  it('uma falha nas estrelas não perde recordes, estatísticas nem conquistas já somados, e o save é gravado', () => {
    const { target, humans } = race('cup');
    const save = sanitizeSave({});
    (save as { stars: unknown }).stars = null; // save corrompido na memória: as estrelas lançam
    let persisted = 0;
    expect(() => settleRace(save, target, options({ champ: createChampionship('br_rj', humans), effects: { achievement: () => undefined, hud: () => undefined, persist: () => { persisted++; } } }))).toThrow();
    expect(save.racesRun).toBe(1);
    expect(save.stats.players.length).toBe(2);
    expect(persisted).toBe(1);
    expect(() => settleRace(save, target, options())).not.toThrow();
  });
});

describe('estrelas e dinheiro não se misturam', () => {
  it('stars.ts não importa a economia (o bônus das estrelas é da P1)', () => {
    const src = fs.readFileSync('src/game/stars.ts', 'utf8');
    expect(src).not.toMatch(/from '\.\.\/core\/career'/);
    expect(src).not.toMatch(/from '\.\/payout/);
  });

  it('a sessão não reimplementa: passa por settleRace', () => {
    const src = fs.readFileSync('src/game/session.ts', 'utf8');
    expect(src).not.toMatch(/\bsettleStars\(/);
  });
});
