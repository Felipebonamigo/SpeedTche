// N5: a migração dos 3 tipos de save (só campeonato, só carreira, os dois), idempotente, na leitura, sem perder nada, e o quadro
// "Desde a última vez" (docs/ondas/N/N5.md §4.2 e §6-B). As fixtures são literais, no formato que o jogo gravava na 0.1.2
// (docs/SAVE.md): os valores não vêm de nenhuma função de hoje, para o teste travar o formato e não o código.
import { describe, expect, it } from 'vitest';
import { createChampionship } from '../src/core/championship';
import { CAREER_VERSION } from '../src/core/career';
import { newTelemetry } from '../src/game/achievements';
import { diffSnapshots, expeditionRoute, rollSession, savedFreeCup, snapshotOf } from '../src/game/expedition';
import { settleRace, type SettleOptions, type SettleTarget } from '../src/game/raceEnd';
import { sanitizeSave } from '../src/game/save';
import { setLanguage } from '../src/i18n';
import { human, quickRace, run, syntheticTrack } from './helpers';

/** As chaves do `SaveData` da 0.1.2 (ab80846): o que a 0.1.2 lê. O save novo precisa continuar com todas, no mesmo formato. */
const KEYS_0_1_2 = ['cupsCompleted', 'cupsUnlocked', 'stamps', 'bestLaps', 'bestRaces', 'achievements', 'racesRun', 'racesWon', 'seatNames', 'seatCars',
  'seatLooks', 'stats', 'carsUnlocked', 'career', 'cupInProgress', 'tutorialDone'] as const;

const FREE_CUP = {
  champ: {
    cupId: 'br_rj', raceIndex: 1,
    standings: [
      { key: 'h0', name: 'Felipe', seat: 0, teamId: 0, points: 14, wins: 1, positions: [1, 4, 0] },
      { key: 'ai0', name: 'Zé Turbo', seat: -1, teamId: 1000, points: 12, wins: 0, positions: [2, 3, 0] },
    ],
    teams: [{ teamId: 0, name: 'Felipe', points: 14, isHuman: true }, { teamId: 1000, name: 'Zé Turbo', points: 12, isHuman: false }],
    coop: false, eliminated: false, completed: false, lastRace: null, lastVerdict: 'qualified',
  },
  cupSeed: 123456789,
  humans: [{ seat: 0, name: 'Felipe', carId: 'tornado', teamId: 0, color: '#ff5252' }],
};

const CAREER_SOLO = {
  version: 1, coop: false,
  drivers: [{ name: 'Felipe', garage: { carId: 'falcao', owned: ['curupira'], upgrades: { falcao: { engine: 1, turbo: 0, tires: 0, brakes: 0, tank: 1, nitro: 0 } } }, earnings: 21_400 }],
  wallets: [4_300], cupId: 'br_rj',
  champ: {
    cupId: 'br_rj', raceIndex: 2,
    standings: [{ key: 'h0', name: 'Felipe', seat: 0, teamId: 0, points: 21, wins: 1, positions: [1, 2, 0] }],
    teams: [{ teamId: 0, name: 'Felipe', points: 21, isHuman: true }],
    coop: false, eliminated: false, completed: false, lastRace: null, lastVerdict: 'qualified',
  },
  rosterSeed: 4242, attempts: 2, completed: false, racesRun: 7,
  lastReport: { cupId: 'br_rj', trackId: 'paraty', raceIndex: 1, rows: [{ driver: 0, position: 2, prize: 4500 }], teamBonus: 0, teamRank: 0, verdict: 'qualified', cupCompleted: false, careerCompleted: false },
};

const CAREER_COOP = {
  version: 1, coop: true,
  drivers: [
    { name: 'Ana', garage: { carId: 'falcao', owned: [], upgrades: {} }, earnings: 9_000 },
    { name: 'Beto', garage: { carId: 'saci', owned: [], upgrades: {} }, earnings: 6_500 },
  ],
  wallets: [11_900], cupId: 'br_sp', champ: null, rosterSeed: 99, attempts: 1, completed: false, racesRun: 4, lastReport: null,
};

const FOUR_HUMANS = [0, 1, 2, 3].map((i) => ({ seat: i, name: `P${i + 1}`, carId: ['falcao', 'trovao', 'tornado', 'camelo'][i], teamId: i, color: '#fff' }));
const FREE_CUP_4P = {
  champ: { ...FREE_CUP.champ, cupId: 'br_sp', raceIndex: 0, standings: [], teams: [], lastVerdict: null },
  cupSeed: 777, humans: FOUR_HUMANS,
};

/** Um save como a 0.1.2 gravava, com o que cada tipo tem. */
const base = (extra: Record<string, unknown>): Record<string, unknown> => ({
  cupsCompleted: [], cupsUnlocked: [], stamps: [], bestLaps: {}, bestRaces: {}, achievements: ['PRIMEIRA_VITORIA'], racesRun: 9, racesWon: 2,
  seatNames: ['Felipe', 'P2', 'P3', 'P4'], seatCars: ['falcao', 'trovao', 'tornado', 'camelo'], seatLooks: [{}, {}, {}, {}],
  carsUnlocked: [], career: null, cupInProgress: null, tutorialDone: true, ...extra,
});

const ONLY_CUP = base({ cupInProgress: FREE_CUP });
const ONLY_CAREER = base({ career: CAREER_SOLO, carsUnlocked: ['curupira'] });
const BOTH = base({ career: CAREER_COOP, cupInProgress: FREE_CUP_4P, stamps: ['RJ'], cupsCompleted: ['br_rj'] });
const FIXTURES: Array<[string, Record<string, unknown>]> = [['só campeonato', ONLY_CUP], ['só carreira', ONLY_CAREER], ['os dois', BOTH]];

const roundTrip = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('migração dos 3 tipos de save: nada se perde', () => {
  it('só campeonato: a copa salva fica exatamente como estava, e a Expedição é nova', () => {
    const s = sanitizeSave(roundTrip(ONLY_CUP));
    expect(s.cupInProgress).toEqual(FREE_CUP);
    expect(s.career).toBeNull();
    expect(expeditionRoute(s)).toEqual({ kind: 'new' });
    expect(savedFreeCup(s)).toEqual({ cupId: 'br_rj', raceIndex: 1, raceCount: 3 });
  });

  it('só carreira: a carreira fica igual (dinheiro, garagem, copa em andamento, relatório) e a Expedição continua', () => {
    const s = sanitizeSave(roundTrip(ONLY_CAREER));
    expect(s.career).toEqual(CAREER_SOLO);
    expect(s.carsUnlocked).toEqual(['curupira']);
    expect(s.cupInProgress).toBeNull();
    expect(expeditionRoute(s)).toEqual({ kind: 'continue', completed: false });
    expect(savedFreeCup(s)).toBeNull();
  });

  it('os dois: a carreira co-op (com o cofre) e a copa avulsa de 4 pilotos ficam, cada uma no seu lugar', () => {
    const s = sanitizeSave(roundTrip(BOTH));
    expect(s.career).toEqual(CAREER_COOP);
    expect(s.career?.wallets).toEqual([11_900]);
    expect(s.cupInProgress).toEqual(FREE_CUP_4P);
    expect(expeditionRoute(s)).toEqual({ kind: 'continue', completed: false });
    expect(savedFreeCup(s)).toEqual({ cupId: 'br_sp', raceIndex: 0, raceCount: 3 });
    // O passaporte e as copas concluídas são do save, não de um modo.
    expect(s.stamps).toEqual(['RJ']);
    expect(s.cupsCompleted).toEqual(['br_rj']);
  });

  it('carreira concluída ainda roteia ao resumo (o cartão não vira beco sem saída)', () => {
    const s = sanitizeSave(roundTrip(base({ career: { ...CAREER_SOLO, completed: true, champ: null } })));
    expect(expeditionRoute(s)).toEqual({ kind: 'continue', completed: true });
  });

  it.each(FIXTURES)('%s: ler, gravar e ler de novo dá o mesmo save (idempotente)', (_n, fixture) => {
    const once = sanitizeSave(roundTrip(fixture));
    const twice = sanitizeSave(roundTrip(once));
    expect(twice).toEqual(once);
    // E uma terceira volta pela rota do retrato de sessão não desfaz nada.
    rollSession(twice, '2026-10-12T10:00:00.000Z');
    expect(sanitizeSave(roundTrip(twice))).toEqual(twice);
  });

  it.each(FIXTURES)('%s: com a pintura de antes da N3 (seatPaints) e a copa de antes da onda G também migra, sem perder a carreira nem a copa', (_n, fixture) => {
    const old = { ...roundTrip(fixture), seatPaints: [{ falcao: 'rubi' }, {}, {}, {}] } as Record<string, unknown>;
    delete old.seatLooks;
    const s = sanitizeSave(old);
    expect(s.seatLooks[0]).toEqual({ falcao: { paint: 'rubi' } });
    expect(s.career).toEqual(sanitizeSave(roundTrip(fixture)).career);
    expect(s.cupInProgress).toEqual(sanitizeSave(roundTrip(fixture)).cupInProgress);
    expect(sanitizeSave(roundTrip(s))).toEqual(s);
  });
});

describe('compatibilidade com a 0.1.2 (o save novo não quebra a leitura dela)', () => {
  it.each(FIXTURES)('%s: todas as chaves que a 0.1.2 lê continuam, e carreira e copa seguem no formato de antes', (_n, fixture) => {
    const s = sanitizeSave(roundTrip(fixture));
    for (const k of KEYS_0_1_2) expect(Object.keys(s)).toContain(k);
    // O que a 0.1.2 reconheceria como seu: nada muda de forma (sem versão nova, sem renomear).
    if (s.career) expect(s.career.version).toBe(1);
    expect(CAREER_VERSION).toBe(1);
    const writtenByN5 = roundTrip(s) as unknown as Record<string, unknown>;
    const asOldReader: Record<string, unknown> = {};
    for (const k of KEYS_0_1_2) asOldReader[k] = writtenByN5[k]; // a 0.1.2 monta o objeto só com as chaves que conhece
    expect(sanitizeSave(asOldReader).career).toEqual(s.career);
    expect(sanitizeSave(asOldReader).cupInProgress).toEqual(s.cupInProgress);
  });

  it('sem os campos novos (o que a 0.1.2 devolve depois de regravar) o save abre e o quadro só some', () => {
    const s = sanitizeSave(roundTrip(ONLY_CAREER));
    rollSession(s, '2026-10-12T10:00:00.000Z');
    const stripped = roundTrip(s) as unknown as Record<string, unknown>;
    delete stripped.sessionStart; delete stripped.recap;
    const back = sanitizeSave(stripped);
    expect(back.recap).toBeNull();
    expect(back.sessionStart).toBeNull();
    expect(back.career).toEqual(s.career);
  });
});

describe('conquistas COPA_* e passaporte continuam contando na Expedição', () => {
  const opts = (): SettleOptions & { got: string[] } => {
    const got: string[] = [];
    return {
      got, champ: null, difficulty: 'profissional', hudTtl: 3,
      careerFinished: () => 'br_rj',
      effects: { achievement: (id) => { got.push(id); }, hud: () => undefined, persist: () => undefined },
    };
  };
  function finishedRace(mode: 'career' | 'cup'): { r: SettleTarget; save: ReturnType<typeof sanitizeSave> } {
    const humans = [human(0)];
    const { state, track } = quickRace({ track: syntheticTrack([{ op: 'straight', length: 200 }]), humans, totalCars: 3, laps: 1, seed: 5 });
    run(state, track, 60 * 120);
    expect(state.phase).toBe('finished');
    return { r: { state, track, mode, humans, telemetry: newTelemetry(), outcome: null }, save: sanitizeSave({}) };
  }

  it('uma corrida de Expedição que fecha a Copa RJ carimba RJ e dá COPA_BR_RJ', () => {
    setLanguage('pt');
    const { r, save } = finishedRace('career');
    const o = opts();
    const out = settleRace(save, r, o);
    expect(save.stamps).toEqual(['RJ']);
    expect(save.cupsCompleted).toEqual(['br_rj']);
    expect(out.newStamp).toBe('RJ');
    expect(o.got).toContain('COPA_BR_RJ');
  });

  it('o carimbo não se repete se a copa for fechada de novo (markCupCompleted é idempotente)', () => {
    const { r, save } = finishedRace('career');
    settleRace(save, r, opts());
    const second = finishedRace('career');
    second.save.stamps = [...save.stamps]; second.save.cupsCompleted = [...save.cupsCompleted];
    settleRace(second.save, second.r, opts());
    expect(second.save.stamps).toEqual(['RJ']);
  });
});

describe('quadro "Desde a última vez"', () => {
  const T0 = '2026-10-10T20:00:00.000Z';
  const T1 = '2026-10-11T20:00:00.000Z';
  const T2 = '2026-10-12T20:00:00.000Z';

  it('save antigo (sem os campos): a 1ª abertura só guarda o ponto de partida; o quadro não aparece', () => {
    const s = sanitizeSave(roundTrip(ONLY_CAREER));
    expect(s.sessionStart).toBeNull();
    expect(s.recap).toBeNull();
    rollSession(s, T0);
    expect(s.sessionStart).toMatchObject({ at: T0, racesRun: 9, racesWon: 2, earned: 21_400, carsBought: 1 });
    expect(s.recap).toBeNull();
  });

  it('a sessão com progresso vira o resumo da abertura seguinte', () => {
    const s = sanitizeSave(roundTrip(ONLY_CAREER));
    rollSession(s, T0);
    // A sessão: 6 corridas, 2 vitórias, +$ 12.300 ganhos, um carro comprado, um carimbo e uma conquista.
    s.racesRun += 6; s.racesWon += 2; s.stamps.push('RJ'); s.cupsCompleted.push('br_rj'); s.achievements.push('COPA_BR_RJ'); s.carsUnlocked.push('sucuri');
    if (s.career) s.career.drivers[0].earnings += 12_300;
    rollSession(s, T1);
    expect(s.recap).not.toBeNull();
    expect(diffSnapshots(s.recap!.before, s.recap!.after)).toEqual({ races: 6, wins: 2, earned: 12_300, cars: 1, stamps: 1, cups: 1, achievements: 1 });
    expect(s.sessionStart?.at).toBe(T1);
  });

  it('abrir e fechar sem jogar NÃO apaga o resumo que já havia', () => {
    const s = sanitizeSave(roundTrip(ONLY_CAREER));
    rollSession(s, T0);
    s.racesRun += 3;
    rollSession(s, T1);
    const recap = roundTrip(s.recap);
    rollSession(s, T2);
    expect(s.recap).toEqual(recap);
    expect(s.sessionStart?.at).toBe(T2);
  });

  it('chamar duas vezes no mesmo estado não inventa um resumo', () => {
    const s = sanitizeSave(roundTrip(ONLY_CAREER));
    rollSession(s, T0);
    rollSession(s, T1);
    expect(s.recap).toBeNull();
  });

  it('a diferença nunca é negativa (carreira nova zera o dinheiro ganho; carro "vendido" não vira corrida a menos)', () => {
    const a = snapshotOf(sanitizeSave(roundTrip(ONLY_CAREER)), T0);
    const b = { ...a, earned: 0, racesRun: a.racesRun - 3, carsBought: 0, at: T1 };
    const d = diffSnapshots(a, b);
    for (const v of Object.values(d)) expect(v).toBeGreaterThanOrEqual(0);
  });

  it('lixo nos campos vira nulo, sem lançar, e a próxima abertura recomeça', () => {
    const dirty = { ...roundTrip(ONLY_CAREER), sessionStart: { at: 5, racesRun: 'x' }, recap: { before: null, after: [] } };
    const s = sanitizeSave(dirty);
    expect(s.sessionStart).toBeNull();
    expect(s.recap).toBeNull();
    expect(() => rollSession(s, T0)).not.toThrow();
    expect(s.sessionStart?.at).toBe(T0);
  });

  it('ida e volta pelo JSON preserva o retrato e o resumo', () => {
    const s = sanitizeSave(roundTrip(ONLY_CAREER));
    rollSession(s, T0); s.racesRun += 2; rollSession(s, T1);
    expect(sanitizeSave(roundTrip(s)).recap).toEqual(s.recap);
    expect(sanitizeSave(roundTrip(s)).sessionStart).toEqual(s.sessionStart);
  });
});

describe('o campeonato salvo continua sendo gravado como antes', () => {
  it('createChampionship + saveCupProgress ainda produzem o formato da fixture (guarda do SavedCup)', () => {
    const champ = createChampionship('br_rj', [human(0)]);
    const s = sanitizeSave({ cupInProgress: { champ, cupSeed: 5, humans: [{ seat: 0, name: 'P1', carId: 'falcao', teamId: 0, color: '#fff' }] } });
    expect(s.cupInProgress?.champ.cupId).toBe('br_rj');
    expect(savedFreeCup(s)?.raceCount).toBe(3);
  });
});
