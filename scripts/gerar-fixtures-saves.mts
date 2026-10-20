// Gera a fixture de "save jogado" de uma versão do jogo (A1, docs/ondas/A1-auditoria-save.md): roda os saneadores DAQUELA versão sobre uma
// entrada rica e imprime o JSON que ela gravaria. Uso (de dentro de um worktree da versão, com node_modules ligado):
//   git worktree add --detach /tmp/v014 75d0436 && ln -s $PWD/node_modules /tmp/v014/node_modules
//   (cd /tmp/v014 && npx tsx <este arquivo> /tmp/v014) > tests/fixtures/saves-antigos/v0.1.4.json
// As fixtures commitadas são a saída disso para 0.1.1 … 0.1.7; os testes (tests/saves-antigos.test.ts) as leem como texto literal.
const tree = process.argv[2];
const imp = (p: string) => import(`${tree}/${p}`);
const { sanitizeSave } = await imp('src/game/save.ts');
const { sanitizeSettings } = await imp('src/game/settings.ts');
const { DEFAULT_SETTINGS } = await imp('src/game/contracts.ts');
const { newCareer, buyCar, buyUpgrade } = await imp('src/core/career.ts');
const { createChampionship } = await imp('src/core/championship.ts');
const { CUPS } = await imp('src/core/data/cups.ts');
const { CARS } = await imp('src/core/data/cars.ts');
const { ACHIEVEMENTS } = await imp('src/game/desktop.ts');
const cv = await imp('src/game/content-version.ts');
const { makeGhostRecord, traceEnd } = await imp('src/game/ghost.ts');
const { getTrack } = await imp('src/core/track/index.ts');

const has = (id: string) => CARS.some((c: { id: string }) => c.id === id);
const humans = [
  { seat: 0, name: 'Ana', carId: 'pororoca', teamId: 0, color: '#e53935' },
  { seat: 1, name: 'Beto', carId: 'saci', teamId: 1, color: '#1e88e5' },
];

const career = newCareer([{ ...humans[0], carId: 'falcao' }]);
career.wallets[0] = 500_000;
for (const id of ['pororoca', 'sucuri', 'iara', ...(has('jabuti') ? ['jabuti', 'caipora'] : [])]) buyCar(career, 0, id);
buyUpgrade(career, 0, 'engine', 'pororoca'); buyUpgrade(career, 0, 'tires', 'pororoca');
career.drivers[0].garage.carId = has('jabuti') ? 'jabuti' : 'pororoca';
career.drivers[0].earnings = 34_000; career.racesRun = 7;

const lapFor = (trackId: string, carId: string) => {
  const length = getTrack(trackId).length;
  const n = 1500;
  const samples = Array.from({ length: n }, (_, i) => ({ z: 2 + (length - 6) * (i / (n - 1)), x: 0, speed: 4000, steer: 0, nitro: false }));
  const trace = { sampleTicks: 3, t0: 1, samples };
  return makeGhostRecord(trackId, traceEnd(trace), trace, { name: 'Ana', carId }, '2026-10-12T20:00:00.000Z');
};
const tracks = ['copacabana', 'pampulha', 'sampa_noite', 'roma'].filter((t) => cv.trackLength(t) !== null);
const lap = (trackId: string, ticks: number, carId = 'falcao') => ({ ticks, name: 'Ana', carId, date: '2026-10-12T20:00:00.000Z', fp: cv.lapFingerprint(trackId, carId) });
const stat = { races: 9, wins: 2, podiums: 4, laps: 27, meters: 61000, nitros: 30, towsGiven: 0, towsReceived: 0, collisions: 5, crashes: 2, pitStops: 1, raceTicks: 200000, coopWins: 0, bestPositions: { copacabana: 1 } };
const champ = createChampionship(CUPS[1].id, humans);

const raw = {
  cupsCompleted: CUPS.slice(0, 3).map((c: { id: string }) => c.id), cupsUnlocked: [], stamps: ['RJ'],
  bestLaps: Object.fromEntries(tracks.map((t, i) => [t, lap(t, 3200 + i * 100)])),
  bestRaces: Object.fromEntries(tracks.map((t, i) => [`${t}:3`, lap(t, 9800 + i * 100)])),
  achievements: ACHIEVEMENTS.slice(0, 14).map((a: { id: string }) => a.id), racesRun: 41, racesWon: 12,
  seatNames: ['Ana', 'Beto', 'P3', 'P4'], seatCars: ['pororoca', 'saci', 'tornado', 'camelo'],
  seatLooks: [{ pororoca: { paint: 'onix', finish: 'cromado', rim: 'dourado' } }, {}, {}, {}],
  stats: { totals: stat, players: [{ name: 'Ana', ...stat }] },
  carsUnlocked: ['pororoca', 'sucuri', 'iara', ...(has('jabuti') ? ['jabuti', 'caipora'] : [])],
  career,
  cupInProgress: { champ, cupSeed: 4242, humans: humans.map((h) => ({ seat: h.seat, name: h.name, carId: h.carId, teamId: h.teamId, color: h.color })) },
  tutorialDone: true,
  sessionStart: { at: '2026-10-13T20:00:00.000Z', racesRun: 40, racesWon: 12, stamps: 1, cupsCompleted: 3, achievements: 12, carsBought: 3, earned: 0 },
  recap: null,
  stars: { profiles: [{ name: 'Ana', tracks: { copacabana: 7 }, rivals: {} }], last: [] },
};
const rawSettings = {
  ...DEFAULT_SETTINGS, language: 'en', masterVolume: 0.5, quality: 'ultra', difficulty: 'campeao', quickLaps: 5, totalCars: 12, hudScale: 1.2,
  seatAssists: ['brake', 'none', 'none', 'none'], ghost: false, autoQuality: 'high', telemetryConsent: 1,
};
const out: Record<string, unknown> = {
  save: sanitizeSave(raw),
  settings: sanitizeSettings(rawSettings),
  ghosts: { ghosts: Object.fromEntries(tracks.map((t) => [t, { ...lapFor(t, 'falcao'), savedAt: '2026-10-12T20:00:00.000Z' }])) },
};
try {
  const { sanitizeProgress } = await imp('src/game/progression.ts');
  out.progress = sanitizeProgress({ profiles: [{ name: 'Ana', cars: { pororoca: 900, falcao: 120, trovao: 2300 } }] });
} catch { /* versões sem a chave (antes da 0.1.6) */ }
console.log(JSON.stringify(out, null, 1));
