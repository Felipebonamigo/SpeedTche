// O5 (docs/ondas/O/O5.md §4.1–§4.2): nível do piloto derivado das estatísticas por perfil, maestria por carro e o que cada degrau libera.
// Puro: o XP de uma corrida é o XP da contribuição dela às estatísticas (a conta é linear), e a maestria soma o mesmo XP no carro do resultado.
import { describe, expect, it } from 'vitest';
import { CARS } from '../src/core/data/cars';
import type { HumanEntry } from '../src/core/types';
import { newTelemetry } from '../src/game/achievements';
import {
  carXp, cosmeticUnlocked, emptyProgress, FRAMES, frameFor, levelOf, MASTERY_REWARDS, MASTERY_XP, masteryOf, MAX_LEVEL, MAX_MASTERY, pilotOf,
  settleProgress, TITLES, titleFor, XP_LAP, XP_PODIUM, XP_RACE, XP_WIN, xpForLevel, xpOfStats,
} from '../src/game/progression';
import { emptyPlayerStats, emptyStats, recordRaceStats } from '../src/game/stats';
import { human, quickRace, run, syntheticTrack } from './helpers';

describe('XP do piloto (das estatísticas)', () => {
  it('linear nos contadores: correr, voltas, pódio e vitória (a vitória também é pódio)', () => {
    const s = { ...emptyPlayerStats(), races: 3, laps: 9, podiums: 2, wins: 1 };
    expect(xpOfStats(s)).toBe(3 * XP_RACE + 9 * XP_LAP + 2 * XP_PODIUM + 1 * XP_WIN);
    expect([XP_RACE, XP_LAP, XP_PODIUM, XP_WIN]).toEqual([20, 10, 20, 30]);
    // Meio do grid em 3 voltas = 50; vitória em 3 voltas = 100.
    expect(xpOfStats({ ...emptyPlayerStats(), races: 1, laps: 3 })).toBe(50);
    expect(xpOfStats({ ...emptyPlayerStats(), races: 1, laps: 3, podiums: 1, wins: 1 })).toBe(100);
  });
  it('curva: nível 2 com 100 XP, 5 com 550, 10 com 1.800, 30 com 13.050; teto no 30', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(225);
    expect(xpForLevel(5)).toBe(550);
    expect(xpForLevel(10)).toBe(1800);
    expect(xpForLevel(MAX_LEVEL)).toBe(13050);
    expect(levelOf(0)).toEqual({ level: 1, xp: 0, into: 0, need: 100 });
    expect(levelOf(99).level).toBe(1);
    expect(levelOf(100)).toEqual({ level: 2, xp: 100, into: 0, need: 125 });
    expect(levelOf(230)).toEqual({ level: 3, xp: 230, into: 5, need: 150 });
    expect(levelOf(13050)).toEqual({ level: 30, xp: 13050, into: 0, need: 0 });
    expect(levelOf(1e9).level).toBe(30);
    expect(levelOf(-5).level).toBe(1);
    expect(levelOf(Number.NaN).level).toBe(1);
  });
  it('títulos e molduras: o mais alto já ganho; ids únicos e níveis crescentes dentro de 1..30', () => {
    expect(titleFor(1)).toBe('estreante');
    expect(titleFor(3)).toBe('estreante');
    expect(titleFor(4)).toBe('piloto');
    expect(titleFor(30)).toBe('lenda_tche');
    expect(frameFor(4)).toBe('base');
    expect(frameFor(5)).toBe('bronze');
    expect(frameFor(19)).toBe('prata');
    expect(frameFor(30)).toBe('nitro');
    for (const list of [TITLES, FRAMES]) {
      expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
      for (let i = 1; i < list.length; i++) expect(list[i].level).toBeGreaterThan(list[i - 1].level);
      for (const x of list) { expect(x.level).toBeGreaterThanOrEqual(1); expect(x.level).toBeLessThanOrEqual(MAX_LEVEL); }
    }
    expect(TITLES[0].level).toBe(1);
  });
  it('pilotOf lê o perfil das estatísticas pelo nome (sem caixa nem espaços), e quem nunca correu é nível 1', () => {
    const stats = emptyStats();
    stats.players.push({ name: 'Ana', ...emptyPlayerStats(), races: 4, laps: 12, podiums: 1, wins: 1 });
    expect(pilotOf(stats, '  ana ').xp).toBe(4 * 20 + 12 * 10 + 20 + 30);
    expect(pilotOf(stats, 'ANA').level.level).toBe(3);
    expect(pilotOf(stats, 'ANA').title).toBe('estreante');
    expect(pilotOf(stats, 'Zé').xp).toBe(0);
    expect(pilotOf(stats, 'Zé').level.level).toBe(1);
  });
});

describe('maestria por carro', () => {
  it('limiares 150 · 400 · 800 · 1.400 · 2.200, teto na 5', () => {
    expect(MASTERY_XP).toEqual([150, 400, 800, 1400, 2200]);
    expect(MAX_MASTERY).toBe(5);
    expect(masteryOf(0)).toEqual({ level: 0, xp: 0, into: 0, need: 150 });
    expect(masteryOf(149).level).toBe(0);
    expect(masteryOf(150)).toEqual({ level: 1, xp: 150, into: 0, need: 250 });
    expect(masteryOf(2199).level).toBe(4);
    expect(masteryOf(2200)).toEqual({ level: 5, xp: 2200, into: 0, need: 0 });
    expect(masteryOf(1e12).level).toBe(5);
  });
  it('prêmios: aro dourado na 1, cromado na 3, camaleão na 5 (só itens que existem no catálogo da N3)', () => {
    expect(MASTERY_REWARDS).toEqual([
      { mastery: 1, field: 'rim', value: 'dourado' },
      { mastery: 3, field: 'finish', value: 'cromado' },
      { mastery: 5, field: 'finish', value: 'camaleao' },
    ]);
  });
  it('cosmeticUnlocked: livre o que não é prêmio; o prêmio só com a maestria daquele carro e daquele perfil', () => {
    const data = emptyProgress();
    data.profiles.push({ name: 'Ana', cars: { falcao: 400, saci: 2200 } });
    expect(cosmeticUnlocked(data, 'Ana', 'falcao', 'finish', 'metalico')).toBe(true);
    expect(cosmeticUnlocked(data, 'Ana', 'falcao', 'rim', 'prata')).toBe(true);
    expect(cosmeticUnlocked(data, 'Ana', 'falcao', 'paint', 'rubi')).toBe(true);
    expect(cosmeticUnlocked(data, 'Ana', 'falcao', 'rim', 'dourado')).toBe(true); // maestria 2
    expect(cosmeticUnlocked(data, 'Ana', 'falcao', 'finish', 'cromado')).toBe(false); // falta a 3
    expect(cosmeticUnlocked(data, 'ana', 'saci', 'finish', 'camaleao')).toBe(true); // maestria 5, nome sem caixa
    expect(cosmeticUnlocked(data, 'Ana', 'trovao', 'rim', 'dourado')).toBe(false); // outro carro
    expect(cosmeticUnlocked(data, 'Bia', 'saci', 'finish', 'camaleao')).toBe(false); // outro perfil
    expect(cosmeticUnlocked(null, 'Ana', 'saci', 'finish', 'cromado')).toBe(false);
    expect(cosmeticUnlocked(undefined, 'Ana', 'saci', 'finish', 'metalico')).toBe(true);
    expect(carXp(data, 'ANA', 'saci')).toBe(2200);
    expect(carXp(data, 'Bia', 'saci')).toBe(0);
  });
});

/** Uma corrida de verdade (rápida, 1 volta, 4 carros) até o fim, com os humanos dados. */
function finishedRace(humans: HumanEntry[], extra: { timeTrial?: boolean } = {}) {
  const { state, track } = quickRace({ track: syntheticTrack([{ op: 'straight', length: 300 }]), humans, totalCars: extra.timeTrial ? humans.length : 4, laps: 1, seed: 7, ...extra });
  run(state, track, 60 * 240);
  expect(state.phase).toBe('finished');
  return state;
}

describe('settleProgress: a corrida soma XP ao nível (pelas estatísticas) e à maestria do carro', () => {
  it('cada humano: XP = o da contribuição; nível antes/depois; maestria no carro do resultado', () => {
    const humans = [{ ...human(0, 0, 'saci'), name: 'Ana' }, { ...human(1, 0, 'trovao'), name: 'Bia' }];
    const state = finishedRace(humans);
    const stats = emptyStats();
    const data = emptyProgress();
    const contributions = recordRaceStats(stats, { mode: 'quick', state, results: state.results ?? [], humans, telemetry: newTelemetry() });
    const news = settleProgress(data, stats, { state, contributions });
    expect(news.map((n) => [n.seat, n.name, n.carId])).toEqual([[0, 'Ana', 'saci'], [1, 'Bia', 'trovao']]);
    for (const n of news) {
      const c = contributions.find((x) => x.seat === n.seat)!;
      expect(n.xp).toBe(xpOfStats(c.stats));
      expect(n.xp).toBeGreaterThanOrEqual(XP_RACE);
      expect(n.pilotXp).toBe(pilotOf(stats, n.name).xp);
      expect(n.level.before).toBe(1);
      expect(n.level.after).toBe(levelOf(n.pilotXp).level);
      expect(n.carXp).toBe(n.xp);
      expect(carXp(data, n.name, n.carId)).toBe(n.xp);
    }
    // Uma segunda corrida soma: a maestria acumula, e o "antes" do nível é o "depois" da primeira.
    const state2 = finishedRace(humans);
    const c2 = recordRaceStats(stats, { mode: 'quick', state: state2, results: state2.results ?? [], humans, telemetry: newTelemetry() });
    const news2 = settleProgress(data, stats, { state: state2, contributions: c2 });
    expect(news2[0].carXp).toBe(news[0].carXp + news2[0].xp);
    expect(news2[0].pilotXp).toBe(news[0].pilotXp + news2[0].xp);
    expect(news2[0].level.before).toBe(news[0].level.after);
    expect(data.profiles.map((p) => p.name)).toEqual(['Ana', 'Bia']); // o P1 no topo (o mais recente)
  });

  it('prêmios do degrau cruzado: título e moldura do nível, item do carro da maestria; nada repetido depois', () => {
    const humans = [{ ...human(0, 0, 'falcao'), name: 'Ana' }];
    const stats = emptyStats();
    // Ana com 350 XP (nível 3; o 4, título "piloto", vem com 375): qualquer corrida de 1 volta (30 a 80 XP) cruza o 4 e não chega ao 5 (550).
    stats.players.push({ name: 'Ana', ...emptyPlayerStats(), races: 2, laps: 27, podiums: 2 });
    expect(xpOfStats(stats.players[0])).toBe(350);
    expect(xpForLevel(4)).toBe(375);
    // E com o Falcão a 1 XP da maestria 1 (aro dourado).
    const data = emptyProgress();
    data.profiles.push({ name: 'Ana', cars: { falcao: MASTERY_XP[0] - 1 } });
    expect(pilotOf(stats, 'Ana').level.level).toBe(3);
    const state = finishedRace(humans);
    const contributions = recordRaceStats(stats, { mode: 'quick', state, results: state.results ?? [], humans, telemetry: newTelemetry() });
    const [n] = settleProgress(data, stats, { state, contributions });
    expect(n.level).toEqual({ before: 3, after: 4 });
    expect(n.mastery).toEqual({ before: 0, after: 1 });
    expect(n.unlocks).toEqual([
      { kind: 'title', id: 'piloto', level: 4 },
      { kind: 'cosmetic', field: 'rim', value: 'dourado', carId: 'falcao', mastery: 1 },
    ]);
    const state2 = finishedRace(humans);
    const c2 = recordRaceStats(stats, { mode: 'quick', state: state2, results: state2.results ?? [], humans, telemetry: newTelemetry() });
    expect(settleProgress(data, stats, { state: state2, contributions: c2 })[0].unlocks).toEqual([]);
  });

  it('contra-relógio conta (voltas, sem posição); o carro de cada um é o do resultado', () => {
    const humans = [{ ...human(0, 0, 'tatu'), name: 'Caio' }];
    const state = finishedRace(humans, { timeTrial: true });
    const stats = emptyStats();
    const data = emptyProgress();
    const contributions = recordRaceStats(stats, { mode: 'timetrial', state, results: state.results ?? [], humans, telemetry: newTelemetry() });
    const [n] = settleProgress(data, stats, { state, contributions });
    expect(n.carId).toBe('tatu');
    expect(n.xp).toBe(XP_RACE + XP_LAP); // 1 volta, sem pódio nem vitória no contra-relógio
  });

  it('dois assentos com o mesmo nome somam no mesmo perfil, sem "antes" negativo', () => {
    const humans = [{ ...human(0, 0, 'saci'), name: 'Ana' }, { ...human(1, 0, 'saci'), name: 'ana' }];
    const state = finishedRace(humans);
    const stats = emptyStats();
    const data = emptyProgress();
    const contributions = recordRaceStats(stats, { mode: 'quick', state, results: state.results ?? [], humans, telemetry: newTelemetry() });
    const news = settleProgress(data, stats, { state, contributions });
    expect(data.profiles).toHaveLength(1);
    expect(carXp(data, 'Ana', 'saci')).toBe(news[0].xp + news[1].xp);
    for (const n of news) { expect(n.level.before).toBeGreaterThanOrEqual(1); expect(n.level.after).toBeGreaterThanOrEqual(n.level.before); }
  });

  it('teto de 32 perfis (os mais recentes ficam), como as estatísticas', () => {
    const data = emptyProgress();
    for (let i = 0; i < 32; i++) data.profiles.push({ name: `P${i}`, cars: { falcao: 10 } });
    const humans = [{ ...human(0, 0, 'falcao'), name: 'Novo' }];
    const state = finishedRace(humans);
    const stats = emptyStats();
    const contributions = recordRaceStats(stats, { mode: 'quick', state, results: state.results ?? [], humans, telemetry: newTelemetry() });
    settleProgress(data, stats, { state, contributions });
    expect(data.profiles).toHaveLength(32);
    expect(data.profiles[0].name).toBe('Novo');
    expect(data.profiles.some((p) => p.name === 'P31')).toBe(false);
  });

  it('só carros que existem: prêmio de maestria aponta para ids do catálogo da N3', async () => {
    const { FINISH_IDS, RIM_IDS } = await import('../src/game/cosmetics');
    for (const r of MASTERY_REWARDS) expect(r.field === 'finish' ? FINISH_IDS : RIM_IDS).toContain(r.value);
    expect(CARS.length).toBe(20);
  });
});
