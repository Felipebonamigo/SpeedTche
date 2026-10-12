// O4: o campo aditivo `stars` do save (docs/ondas/O/O4.md §4.2, grupo D): save da 0.1.3 abre intacto e migra, ida e volta, e o save novo
// aberto como a 0.1.3 abriria (lista branca de chaves) não perde nada do que ela conhece. A fixture é LITERAL, no formato que a 0.1.3
// gravava (docs/SAVE.md): os valores não vêm de função de hoje, para o teste travar o formato e não o código.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SAVE } from '../src/game/contracts';
import { sanitizeSave } from '../src/game/save';
import { emptyStars } from '../src/game/stars';

const SAVE_0_1_3 = {
  cupsCompleted: ['br_rj', 'br_sp'], cupsUnlocked: [], stamps: ['RJ', 'SP'],
  bestLaps: { copacabana: { ticks: 3120, name: 'Felipe', carId: 'falcao', date: '2026-10-10T20:00:00.000Z' } }, bestRaces: {},
  achievements: ['PRIMEIRA_VITORIA', 'COPA_BR_RJ'], racesRun: 14, racesWon: 5,
  seatNames: ['Felipe', 'Ana', 'P3', 'P4'], seatCars: ['falcao', 'trovao', 'tornado', 'camelo'], seatLooks: [{ falcao: { paint: 'rubi' } }, {}, {}, {}],
  stats: { totals: { races: 14, wins: 5, podiums: 9, laps: 40, meters: 91000, nitros: 12, towsGiven: 0, towsReceived: 0, collisions: 3, crashes: 1, pitStops: 2, raceTicks: 300000, coopWins: 0, bestPositions: {} }, players: [] },
  carsUnlocked: ['curupira'], career: null, cupInProgress: null, tutorialDone: true,
  sessionStart: { at: '2026-10-10T20:00:00.000Z', racesRun: 10, racesWon: 4, stamps: 1, cupsCompleted: 1, achievements: 1, carsBought: 0, earned: 5000 },
  recap: null,
};

const STARS = {
  profiles: [{ name: 'Felipe', tracks: { copacabana: 7, paraty: 3, ilhabela: 1 }, rivals: { ze_turbo: { you: 5, rival: 7 } } }, { name: 'Ana', tracks: { copacabana: 1 }, rivals: {} }],
  last: [{ name: 'Felipe', trackId: 'paraty', got: 3, was: 1, goal: 'comeback', rival: 'Zé Turbo', duel: 'win' }],
};

const roundTrip = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('save sem `stars` (até a 0.1.3)', () => {
  it('abre, com estrelas vazias, e tudo o mais fica exatamente como estava', () => {
    const s = sanitizeSave(roundTrip(SAVE_0_1_3));
    expect(s.stars).toEqual({ profiles: [], last: [] });
    expect(s.cupsCompleted).toEqual(['br_rj', 'br_sp']);
    expect(s.stamps).toEqual(['RJ', 'SP']);
    expect(s.racesRun).toBe(14);
    expect(s.racesWon).toBe(5);
    expect(s.seatNames).toEqual(['Felipe', 'Ana', 'P3', 'P4']);
    expect(s.seatLooks[0]).toEqual({ falcao: { paint: 'rubi' } });
    expect(s.stats.totals.races).toBe(14);
    expect(s.carsUnlocked).toEqual(['curupira']);
    expect(s.sessionStart?.racesRun).toBe(10);
    expect(s.bestLaps.copacabana.ticks).toBe(3120);
  });

  it('é idempotente: ler, gravar e ler de novo dá o mesmo save', () => {
    const once = sanitizeSave(roundTrip(SAVE_0_1_3));
    expect(sanitizeSave(roundTrip(once))).toEqual(once);
  });

  it('o padrão e o vazio são o mesmo, e cada save tem o seu objeto (nada compartilhado)', () => {
    expect(DEFAULT_SAVE.stars).toEqual(emptyStars());
    const a = sanitizeSave({});
    const b = sanitizeSave({});
    a.stars.profiles.push({ name: 'X', tracks: {}, rivals: {} });
    expect(b.stars.profiles).toEqual([]);
    expect(DEFAULT_SAVE.stars.profiles).toEqual([]);
  });
});

describe('save com `stars`', () => {
  it('ida e volta por JSON mantém tudo', () => {
    const s = sanitizeSave(roundTrip({ ...SAVE_0_1_3, stars: STARS }));
    expect(s.stars).toEqual(STARS);
    expect(sanitizeSave(roundTrip(s))).toEqual(s);
  });

  it('lixo no campo cai no vazio sem derrubar o resto do save', () => {
    for (const bad of ['x', 7, [], null, { profiles: 3 }]) {
      const s = sanitizeSave({ ...roundTrip(SAVE_0_1_3), stars: bad });
      expect(s.stars).toEqual(emptyStars());
      expect(s.racesRun).toBe(14);
    }
  });

  it('o save novo, lido só pelas chaves da 0.1.3, é o mesmo save de antes (a 0.1.3 abre sem perda do que conhece)', () => {
    const KEYS_0_1_3 = Object.keys(SAVE_0_1_3);
    const novo = roundTrip(sanitizeSave(roundTrip({ ...SAVE_0_1_3, stars: STARS }))) as unknown as Record<string, unknown>;
    const antigo = roundTrip(sanitizeSave(roundTrip(SAVE_0_1_3))) as unknown as Record<string, unknown>;
    for (const k of KEYS_0_1_3) expect(novo[k], k).toEqual(antigo[k]);
    // A 0.1.3 monta o objeto só com as chaves que conhece: reler isso não quebra o save novo e só descarta `stars`.
    const lidoPelaAntiga: Record<string, unknown> = {};
    for (const k of KEYS_0_1_3) lidoPelaAntiga[k] = novo[k];
    const volta = sanitizeSave(lidoPelaAntiga);
    expect(volta.racesRun).toBe(14);
    expect(volta.stars).toEqual(emptyStars());
  });
});
