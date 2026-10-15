// O5 (docs/ondas/O/O5.md §4.3): a maestria mora numa chave própria (`speed-tche.progress`), o save principal não muda de formato, e o nível
// sai das estatísticas que o save já guarda. Fixture LITERAL de um save da 0.1.4 (o formato que ela gravava): ela abre intacta e o nível
// aparece sem migrar nada; a chave nova tem saneador (que é a migração) e nunca toca `speed-tche.save`.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARS } from '../src/core/data/cars';
import { sanitizeSave, SAVE_KEY } from '../src/game/save';
import { emptyProgress, loadProgress, pilotOf, PROGRESS_KEY, sanitizeProgress, saveProgress } from '../src/game/progression';

const SAVE_0_1_4 = {
  cupsCompleted: ['br_rj'], cupsUnlocked: [], stamps: ['RJ'],
  bestLaps: {}, bestRaces: {},
  achievements: ['PRIMEIRA_VITORIA', 'COPA_BR_RJ', 'NITRO_TRIPLO'], racesRun: 9, racesWon: 2,
  seatNames: ['Felipe', 'P2', 'P3', 'P4'], seatCars: ['falcao', 'trovao', 'tornado', 'camelo'],
  seatLooks: [{ falcao: { paint: 'onix', finish: 'cromado', rim: 'dourado' } }, {}, {}, {}],
  stats: {
    totals: { races: 9, wins: 2, podiums: 4, laps: 27, meters: 61000, nitros: 30, towsGiven: 0, towsReceived: 0, collisions: 5, crashes: 2, pitStops: 1, raceTicks: 200000, coopWins: 0, bestPositions: { copacabana: 1 } },
    players: [{ name: 'Felipe', races: 9, wins: 2, podiums: 4, laps: 27, meters: 61000, nitros: 30, towsGiven: 0, towsReceived: 0, collisions: 5, crashes: 2, pitStops: 1, raceTicks: 200000, coopWins: 0, bestPositions: { copacabana: 1 } }],
  },
  carsUnlocked: [], career: null, cupInProgress: null, tutorialDone: true,
  sessionStart: { at: '2026-10-13T20:00:00.000Z', racesRun: 9, racesWon: 2, stamps: 1, cupsCompleted: 1, achievements: 3, carsBought: 0, earned: 0 },
  recap: null,
  stars: { profiles: [{ name: 'Felipe', tracks: { copacabana: 7 }, rivals: {} }], last: [] },
};

const roundTrip = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('save da 0.1.4 (sem a chave nova)', () => {
  it('abre igual (o formato do save principal não muda) e o nível já sai das estatísticas dele', () => {
    const s = sanitizeSave(roundTrip(SAVE_0_1_4));
    // Nenhuma chave nova no save principal: a O5 não acrescenta campo em `SaveData`.
    expect(Object.keys(s).sort()).toEqual(Object.keys(SAVE_0_1_4).sort());
    expect(s.seatLooks[0]).toEqual({ falcao: { paint: 'onix', finish: 'cromado', rim: 'dourado' } });
    expect(s.achievements).toEqual(['PRIMEIRA_VITORIA', 'COPA_BR_RJ', 'NITRO_TRIPLO']);
    // 9 corridas, 27 voltas, 4 pódios, 2 vitórias = 180 + 270 + 80 + 60 = 590 XP: nível 5.
    expect(pilotOf(s.stats, 'Felipe').xp).toBe(590);
    expect(pilotOf(s.stats, 'Felipe').level.level).toBe(5);
    expect(pilotOf(s.stats, 'Felipe').frame).toBe('bronze');
  });
  it('sem a chave, o progresso é vazio (maestria 0), sem lançar', () => {
    expect(sanitizeProgress(undefined)).toEqual(emptyProgress());
    expect(sanitizeProgress(null)).toEqual(emptyProgress());
  });
});

describe('sanitizeProgress (a migração da chave nova)', () => {
  const GOOD = { profiles: [{ name: 'Felipe', cars: { falcao: 1234, saci: 80 } }, { name: 'Ana', cars: { beijaflor: 2200 } }] };

  it('ida e volta mantém tudo, e é idempotente', () => {
    const once = sanitizeProgress(roundTrip(GOOD));
    expect(once).toEqual(GOOD);
    expect(sanitizeProgress(roundTrip(once))).toEqual(once);
  });

  it('lixo vira vazio; item ruim sai sozinho', () => {
    for (const bad of ['x', 7, [], true, { profiles: 3 }, { profiles: 'a' }]) expect(sanitizeProgress(bad)).toEqual(emptyProgress());
    const s = sanitizeProgress({
      profiles: [
        null, 7, 'Ana', { cars: {} }, { name: '   ', cars: { falcao: 10 } }, // sem nome válido
        { name: '  Bia   Lima  ', cars: { falcao: 10.6, naoexiste: 50, saci: -3, trovao: 0, tornado: 'x', camelo: Number.NaN, boto: 1e12, __proto__: 5 } },
        { name: 'bia lima', cars: { falcao: 999 } }, // repetido (mesma chave de perfil): fica o primeiro
        { name: 'Caio', cars: 'nada' },
      ],
    });
    expect(s.profiles).toEqual([
      { name: 'Bia Lima', cars: { falcao: 11, boto: 99_999_999 } },
      { name: 'Caio', cars: {} },
    ]);
  });

  it('nome com mais de 12 caracteres é cortado como no lobby; no máximo 32 perfis', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ name: `Piloto${i}-equipe-azul`, cars: { falcao: i + 1 } }));
    const s = sanitizeProgress({ profiles: many });
    expect(s.profiles).toHaveLength(32);
    expect(s.profiles[0].name).toBe('Piloto0-equi');
    expect(s.profiles[31].name).toBe('Piloto31-equ');
    // Cortados no limite do lobby, dois nomes que viram a mesma chave são o mesmo perfil: fica o primeiro.
    expect(sanitizeProgress({ profiles: [{ name: 'Piloto número 1', cars: { falcao: 1 } }, { name: 'Piloto número 2', cars: { falcao: 2 } }] }).profiles)
      .toEqual([{ name: 'Piloto númer', cars: { falcao: 1 } }]);
  });

  it('só carros de CARS', () => {
    const cars = Object.fromEntries(CARS.map((c, i) => [c.id, i + 1]));
    expect(Object.keys(sanitizeProgress({ profiles: [{ name: 'A', cars: { ...cars, inventado: 9 } }] }).profiles[0].cars).sort()).toEqual(CARS.map((c) => c.id).sort());
  });
});

describe('a chave própria no armazenamento', () => {
  const store = new Map<string, string>();
  beforeAll(() => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(), key: () => null, get length() { return store.size; },
    });
  });
  afterAll(() => { vi.unstubAllGlobals(); });
  beforeEach(() => { store.clear(); });

  it('`speed-tche.progress`, que a 0.1.4 não lê nem grava; gravar nunca toca o save principal', () => {
    expect(PROGRESS_KEY).toBe('speed-tche.progress');
    store.set(SAVE_KEY, JSON.stringify(SAVE_0_1_4));
    const before = store.get(SAVE_KEY);
    const p = loadProgress();
    expect(p).toEqual(emptyProgress());
    p.profiles.push({ name: 'Felipe', cars: { falcao: 300 } });
    saveProgress(p);
    expect(store.get(SAVE_KEY)).toBe(before);
    expect(JSON.parse(store.get(PROGRESS_KEY) ?? 'null')).toEqual({ profiles: [{ name: 'Felipe', cars: { falcao: 300 } }] });
    expect(loadProgress()).toEqual({ profiles: [{ name: 'Felipe', cars: { falcao: 300 } }] });
  });
  it('arquivo estragado abre vazio', () => {
    store.set(PROGRESS_KEY, '{"profiles": [');
    expect(loadProgress()).toEqual(emptyProgress());
  });
});
