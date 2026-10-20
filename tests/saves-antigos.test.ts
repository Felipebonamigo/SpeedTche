// A1 (docs/ondas/A1-auditoria-save.md): saves e opções de 0.1.1 a 0.1.7 abrindo na 0.1.8. As fixtures em tests/fixtures/saves-antigos/ são a saída
// LITERAL dos saneadores de cada versão (scripts/gerar-fixtures-saves.mts, rodado num worktree do commit da versão) sobre uma entrada rica:
// campanha com carros comprados e peças, copa em andamento, recordes e fantasmas com a impressão DAQUELA versão, estrelas, conquistas.
// Elas dizem o que cada versão GRAVAVA; o teste diz o que a 0.1.8 faz ao abrir. Tudo aqui é puro (sem DOM, sem localStorage).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARS } from '../src/core/data/cars';
import { CUPS } from '../src/core/data/cups';
import { TRACKS } from '../src/core/track';
import { syncConquestCars } from '../src/game/career-save';
import { DEFAULT_SAVE, DEFAULT_SETTINGS } from '../src/game/contracts';
import { lapFingerprint, onlineFingerprint } from '../src/game/content-version';
import { ghostFileText, parseGhostFile } from '../src/game/ghost';
import { ghostFor, judgeGhostFile, sanitizeGhostStore } from '../src/game/ghost-store';
import { openAchievements } from '../src/game/achievements';
import { rollSession } from '../src/game/expedition';
import { sanitizePlaylog } from '../src/game/playlog';
import { sanitizeProgress } from '../src/game/progression';
import { recordFromOtherVersion, sanitizeSave } from '../src/game/save';
import { sanitizeSettings } from '../src/game/settings';
import { t } from '../src/i18n';
import '../src/net/strings';
import { BIND_ACTIONS } from '../src/ui/remap/bindings';

const VERSIONS = ['0.1.1', '0.1.2', '0.1.3', '0.1.4', '0.1.5', '0.1.6', '0.1.7'] as const;
type Version = (typeof VERSIONS)[number];

interface Fixture {
  save: Record<string, any>;
  settings: Record<string, any>;
  ghosts: unknown;
  progress?: unknown;
}

const dir = join(__dirname, 'fixtures', 'saves-antigos');
const load = (name: string): Fixture => JSON.parse(readFileSync(join(dir, name), 'utf8')) as Fixture;
const fixture = (v: Version): Fixture => load(`v${v}.json`);
const roundTrip = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)) as T);

/** O que o save principal guardava e a 0.1.8 tem de devolver idêntico (seatLooks/seatPaints têm teste próprio: N3). */
const PRESERVED = [
  'cupsCompleted', 'cupsUnlocked', 'stamps', 'bestLaps', 'bestRaces', 'achievements', 'racesRun', 'racesWon', 'seatNames', 'seatCars', 'stats',
  'carsUnlocked', 'career', 'cupInProgress', 'tutorialDone',
] as const;

describe.each(VERSIONS)('save e opções gravados pela %s abrem na 0.1.8', (v) => {
  const fx = fixture(v);

  it('nada some: copas, carimbos, recordes (com a impressão), conquistas, contadores, carros, carreira e copa em andamento', () => {
    const now = sanitizeSave(roundTrip(fx.save));
    for (const key of PRESERVED) expect(now[key], key).toEqual(fx.save[key]);
    // O fixture é "jogado" de verdade: confere que ele tem o que se diz que ele tem (senão a igualdade acima não provaria nada).
    expect(now.career?.drivers[0].garage.owned).toEqual(expect.arrayContaining(['pororoca', 'sucuri', 'iara']));
    expect(now.career?.drivers[0].garage.upgrades.pororoca).toBeDefined();
    expect(now.cupInProgress?.humans.map((h) => h.carId)).toEqual(['pororoca', 'saci']);
    expect(Object.keys(now.bestLaps).length).toBe(4);
    expect(Object.values(now.bestLaps).every((r) => typeof r.fp === 'string')).toBe(true);
    expect(now.seatLooks).toHaveLength(4);
  });

  it('o carro escolhido que ainda existe continua; a campanha continua com os carros comprados', () => {
    const now = sanitizeSave(roundTrip(fx.save));
    expect(now.seatCars).toEqual(['pororoca', 'saci', 'tornado', 'camelo']);
    expect(now.career?.drivers[0].garage.carId).toBe(fx.save.career.drivers[0].garage.carId);
    expect(CARS.find((c) => c.id === now.career?.drivers[0].garage.carId)).toBeDefined();
  });

  it('abre sem lançar e é idempotente (gravar e reabrir não muda mais nada)', () => {
    const once = sanitizeSave(roundTrip(fx.save));
    expect(sanitizeSave(roundTrip(once))).toEqual(once);
    const s = sanitizeSettings(roundTrip(fx.settings));
    expect(sanitizeSettings(roundTrip(s))).toEqual(s);
  });

  it('opções: tudo o que a versão gravava continua; o que é novo abre no padrão; os botões antigos não trocam de ação', () => {
    const now = sanitizeSettings(roundTrip(fx.settings));
    for (const key of Object.keys(fx.settings)) if (key !== 'controls') expect(now[key as keyof typeof now], key).toEqual(fx.settings[key]);
    expect(now.cartoonEffects).toBe(fx.settings.cartoonEffects ?? DEFAULT_SETTINGS.cartoonEffects);
    expect(now.highCurveCamera).toBe(false);
    expect(now.assistOfferDeclined).toBe(fx.settings.assistOfferDeclined ?? false);
    expect(now.seatCameras).toEqual(fx.settings.seatCameras ?? DEFAULT_SETTINGS.seatCameras);
    // Controles: toda ação que a versão conhecia fica com os MESMOS códigos (a câmera, nova, só pega código livre).
    for (const device of ['kb1', 'kb2', 'gamepad'] as const) {
      for (const action of Object.keys(fx.settings.controls[device])) {
        // Exceção documentada (bindings.ts, migrateLegacyPad): o mapa do controle de ANTES da M1 (0.1.1: 8 ações) que ainda está no padrão antigo passa ao novo.
        const legacy = v === '0.1.1' && device === 'gamepad' && ['nitro', 'gearUp', 'gearDown'].includes(action);
        const want = legacy ? DEFAULT_SETTINGS.controls.gamepad[action as (typeof BIND_ACTIONS)[number]] : fx.settings.controls[device][action];
        expect(now.controls[device][action as (typeof BIND_ACTIONS)[number]], `${device}.${action}`).toEqual(want);
      }
      expect(now.controls[device].camera.length, `${device}.camera`).toBeGreaterThan(0);
    }
  });

  it('a abertura do jogo (sessão, conquistas de estado, carros de conquista) não lança, não duplica e só soma', () => {
    const save = sanitizeSave(roundTrip(fx.save));
    const before = { achievements: [...save.achievements], unlocked: [...save.carsUnlocked], owned: [...(save.career?.drivers[0].garage.owned ?? [])] };
    rollSession(save, '2026-10-20T10:00:00.000Z');
    const opened = openAchievements(save, sanitizeProgress(roundTrip(fx.progress)));
    save.achievements.push(...opened);
    syncConquestCars(save);
    expect(new Set(save.achievements).size).toBe(save.achievements.length);
    expect(new Set(save.carsUnlocked).size).toBe(save.carsUnlocked.length);
    expect(save.achievements).toEqual(expect.arrayContaining(before.achievements));
    expect(save.carsUnlocked).toEqual(expect.arrayContaining(before.unlocked));
    expect(save.career?.drivers[0].garage.owned).toEqual(expect.arrayContaining(before.owned));
    // Quem comprou carro e ganhou nível já merece essas, e a Steam as recebe no reenvio da abertura.
    expect(opened).toEqual(expect.arrayContaining(['PRIMEIRA_PECA', 'CARRO_NOVO', 'PRIMEIRA_CORRIDA', 'SUBIU_DE_NIVEL']));
    // Só quem já tinha a maestria (chave `speed-tche.progress`, da 0.1.6 em diante) ganha o Gaúcho; save sem ela não inventa carro.
    const hasMastery = fx.progress !== undefined;
    expect(opened.includes('CAVALO_DE_ACO')).toBe(hasMastery);
    expect(save.carsUnlocked.includes('gaucho')).toBe(hasMastery);
    expect(save.career?.drivers[0].garage.owned.includes('gaucho')).toBe(hasMastery);
  });
});

describe('recordes e fantasmas das 38 pistas da T4 (mudaram de impressão na 0.1.6)', () => {
  // Quais pistas do fixture ficam "versão anterior" na 0.1.8: a 0.1.1 tinha outra física (todas); da 0.1.2 à 0.1.5 só as de praça/mirante; 0.1.6 em diante nenhuma.
  const STALE: Record<Version, string[]> = {
    '0.1.1': ['copacabana', 'pampulha', 'sampa_noite', 'roma'],
    '0.1.2': ['pampulha', 'sampa_noite', 'roma'], '0.1.3': ['pampulha', 'sampa_noite', 'roma'],
    '0.1.4': ['pampulha', 'sampa_noite', 'roma'], '0.1.5': ['pampulha', 'sampa_noite', 'roma'],
    '0.1.6': [], '0.1.7': [],
  };

  it.each(VERSIONS)('%s: a marca "versão anterior" aparece nas pistas certas (recorde de volta e de prova) e só nelas', (v) => {
    const fx = fixture(v);
    const save = sanitizeSave(roundTrip(fx.save));
    const flagged = Object.entries(save.bestLaps).filter(([track, rec]) => recordFromOtherVersion(rec, track)).map(([track]) => track).sort();
    expect(flagged).toEqual([...STALE[v]].sort());
    // A prova (`pista:voltas`) usa o id da pista, não a chave inteira: mesma resposta.
    const flaggedRaces = Object.entries(save.bestRaces).filter(([key, rec]) => recordFromOtherVersion(rec, key.split(':')[0])).map(([key]) => key.split(':')[0]).sort();
    expect(flaggedRaces).toEqual([...STALE[v]].sort());
    // O recorde antigo NÃO é apagado nem trocado: o tempo continua o gravado.
    for (const [track, rec] of Object.entries(save.bestLaps)) expect(rec.ticks, track).toBe(fx.save.bestLaps[track].ticks);
  });

  it.each(VERSIONS)('%s: o fantasma antigo fica na loja mas não corre como rival; o das pistas que não mudaram continua valendo', (v) => {
    const fx = fixture(v);
    const store = sanitizeGhostStore(roundTrip(fx.ghosts));
    expect(Object.keys(store.ghosts).sort()).toEqual(['copacabana', 'pampulha', 'roma', 'sampa_noite']);
    for (const track of Object.keys(store.ghosts)) {
      const valid = ghostFor(store, track) !== null;
      expect(valid, track).toBe(!STALE[v].includes(track));
    }
  });

  it.each(VERSIONS)('%s: o arquivo de fantasma exportado por ela é recusado como "outra versão" nas pistas que mudaram e aceito nas outras', (v) => {
    const fx = fixture(v);
    const store = sanitizeGhostStore(roundTrip(fx.ghosts));
    for (const [track, stored] of Object.entries(store.ghosts)) {
      const { savedAt: _s, ...rec } = stored;
      const file = ghostFileText(rec);
      expect(parseGhostFile(file), track).toEqual(rec);
      const verdict = judgeGhostFile(file);
      if (STALE[v].includes(track)) expect(verdict, track).toBe('otherVersion');
      else expect(verdict, track).toMatchObject({ trackId: track });
      // v1 (de antes de existir a impressão): sempre versão desconhecida.
      const { fp: _fp, ...noFp } = rec;
      expect(judgeGhostFile(JSON.stringify({ format: 'speed-tche-ghost', v: 1, ...noFp })), `${track} v1`).toBe('otherVersion');
    }
  });

  it('as impressões que a 0.1.4 gravava: 71 pistas iguais na 0.1.8 (recordes e fantasmas continuam valendo) e 38 diferentes — para os 14 carros', () => {
    const f = load('impressoes-0.1.4.json') as unknown as { carros: string[]; laps: Record<string, Record<string, string>> };
    const changed: string[] = [];
    for (const def of TRACKS) {
      const old = f.laps[def.id];
      const diffs = f.carros.map((c) => lapFingerprint(def.id, c) !== old[c]);
      expect(new Set(diffs).size, `${def.id}: a pista muda para todos os carros ou para nenhum`).toBe(1);
      if (diffs[0]) changed.push(def.id);
    }
    expect(TRACKS).toHaveLength(109);
    expect(changed).toHaveLength(38);
    expect(changed).toEqual(expect.arrayContaining(['pampulha', 'sampa_noite', 'roma', 'paraty', 'las_vegas', 'monaco_noite']));
    expect(changed).not.toContain('copacabana');
  });
});

describe('online entre versões', () => {
  it('a impressão do online da 0.1.4/0.1.5 não é a de hoje: a sala recusa com a mensagem certa em PT e EN', () => {
    const f = load('impressoes-0.1.4.json') as unknown as { online: string };
    expect(onlineFingerprint()).not.toBe(f.online);
    expect(t('online.err.build')).toMatch(/outra versão do jogo/);
    expect(t('online.err.build')).not.toBe('online.err.build');
  });
});

describe('preços: a campanha de quem já comprou não muda de valor', () => {
  it('os carros que a 0.1.4 vendia custam o mesmo (comprar pelo id continua valendo o que foi pago)', () => {
    const price = (id: string) => CARS.find((c) => c.id === id)?.price;
    expect(price('curupira')).toBe(12_000); expect(price('sucuri')).toBe(16_000); expect(price('carcara')).toBe(20_000);
    expect(price('pororoca')).toBe(22_000); expect(price('iara')).toBe(24_000); expect(price('boitata')).toBe(30_000);
    expect(price('beijaflor')).toBe(40_000);
    // E os 7 livres de sempre seguem livres.
    for (const id of ['falcao', 'trovao', 'tornado', 'camelo', 'saci', 'tatu', 'boto']) expect(price(id), id).toBe(0);
  });
});

describe('cópias que o save guarda por id: nada que sumiu do jogo derruba o save', () => {
  const base = () => roundTrip(fixture('0.1.5').save);

  it('carro desconhecido: o assento cai num livre, a garagem num livre, o recorde fica, a copa salva é descartada — o resto do save não perde nada', () => {
    const raw = base();
    raw.seatCars = ['fusca', 'saci', 42, null];
    raw.career.drivers[0].garage.carId = 'fusca';
    raw.career.drivers[0].garage.owned.push('fusca');
    raw.career.drivers[0].garage.upgrades.fusca = { engine: 3 };
    raw.bestLaps.copacabana.carId = 'fusca';
    raw.cupInProgress.humans[0].carId = 'fusca';
    raw.carsUnlocked.push('fusca', 'falcao'); // 'falcao' é livre: não é "comprado"
    const now = sanitizeSave(raw);
    expect(now.seatCars).toEqual(['falcao', 'saci', 'tornado', 'camelo']);
    expect(now.career?.drivers[0].garage.carId).toBe('falcao');
    expect(now.career?.drivers[0].garage.owned).toEqual(['pororoca', 'sucuri', 'iara']);
    expect(Object.keys(now.career?.drivers[0].garage.upgrades ?? {}).sort()).toEqual(['pororoca']);
    expect(now.carsUnlocked).toEqual(['pororoca', 'sucuri', 'iara']);
    expect(now.bestLaps.copacabana.carId).toBe('fusca');
    expect(recordFromOtherVersion(now.bestLaps.copacabana, 'copacabana')).toBe(true); // impressão que o jogo não reconhece mais
    expect(now.cupInProgress).toBeNull();
    for (const key of ['cupsCompleted', 'stamps', 'achievements', 'racesRun', 'stats', 'stars']) expect(now[key as keyof typeof now], key).toEqual(raw[key]);
  });

  it('copa renomeada (a Copa Brasil virou a Copa Rio) e copa que não existe: a vencida segue vencida, a desconhecida não destrava nada e não derruba', () => {
    const raw = base();
    raw.cupsCompleted = ['brasil', 'copa_do_futuro', 'br_rj'];
    raw.achievements = ['COPA_BRASIL', 'COPA_DO_FUTURO', 'PRIMEIRA_VITORIA'];
    raw.career.cupId = 'brasil';
    const now = sanitizeSave(raw);
    expect(now.cupsCompleted).toEqual(['br_rj', 'copa_do_futuro']);
    expect(now.achievements).toEqual(['COPA_BR_RJ', 'COPA_DO_FUTURO', 'PRIMEIRA_VITORIA']);
    expect(now.career?.cupId).toBe('br_rj');
    expect(CUPS.some((c) => c.id === 'copa_do_futuro')).toBe(false);
    expect(now.cupsUnlocked.every((id) => CUPS.some((c) => c.id === id))).toBe(true);
  });
});

describe('syncConquestCars com a conquista já ganha', () => {
  const owned = (carIds: string[]) => ({ carId: 'falcao', owned: carIds, upgrades: {} });
  const career = (drivers: number) => ({
    drivers: Array.from({ length: drivers }, (_, i) => ({ name: `P${i + 1}`, garage: owned([]), earnings: 0 })),
  });

  it('save da 0.1.5 que já tinha 10 vitórias sem comprar: ganha a conquista e o Furgão na abertura, em todo piloto da Expedição', () => {
    const raw = roundTrip(fixture('0.1.5').save);
    raw.carsUnlocked = []; raw.career.drivers[0].garage.owned = []; raw.career.drivers[0].garage.carId = 'falcao'; raw.career.drivers[0].garage.upgrades = {};
    raw.stats.totals.wins = 12;
    const save = sanitizeSave(raw);
    const opened = openAchievements(save, sanitizeProgress(undefined));
    expect(opened).toContain('HORA_DE_ENTREGA');
    save.achievements.push(...opened);
    expect(syncConquestCars(save)).toBe(true);
    expect(save.carsUnlocked).toEqual(['furgao']);
    expect(save.career?.drivers[0].garage.owned).toEqual(['furgao']);
    expect(syncConquestCars(save)).toBe(false); // idempotente: a abertura seguinte não regrava
    // Gravar e reabrir mantém (o `furgao` tem preço nominal > 0, então passa pelo saneador como carro de garagem).
    const again = sanitizeSave(roundTrip(save));
    expect(again.carsUnlocked).toEqual(['furgao']);
    expect(again.career?.drivers[0].garage.owned).toEqual(['furgao']);
  });

  it('co-op com 2 pilotos, sem carreira, conquista que não é de carro, id repetido: cada caso certo e sem duplicar', () => {
    const coop = { carsUnlocked: ['gaucho'], achievements: ['CAVALO_DE_ACO', 'CAVALO_DE_ACO', 'DEZ_VITORIAS'], career: career(2) } as never;
    expect(syncConquestCars(coop)).toBe(true);
    const c = coop as { carsUnlocked: string[]; career: { drivers: Array<{ garage: { owned: string[] } }> } };
    expect(c.carsUnlocked).toEqual(['gaucho']);
    expect(c.career.drivers.map((d) => d.garage.owned)).toEqual([['gaucho'], ['gaucho']]);
    expect(syncConquestCars({ carsUnlocked: [], achievements: ['CAVALO_DE_ACO'], career: null })).toBe(true);
    expect(syncConquestCars({ carsUnlocked: [], achievements: ['DEZ_VITORIAS', 'COPA_BR_RJ'], career: null })).toBe(false);
  });
});

describe('o que vem do armazenamento nunca derruba o jogo (números absurdos, NaN, texto no lugar de número, chaves perigosas)', () => {
  const hostile = (text: string) => JSON.parse(text) as unknown;

  it('JSON cru absurdo: 1e999 vira Infinity no parse; os saneadores devolvem o padrão ou a borda', () => {
    const s = sanitizeSettings(hostile('{"masterVolume":1e999,"musicVolume":-1e999,"sfxVolume":"alto","hudScale":-5,"totalCars":"12","quickLaps":99999,"language":"xx","quality":null,"serverUrl":5,"telemetryConsent":1e999}'));
    expect(s.masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
    expect(s.musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
    expect(s.sfxVolume).toBe(DEFAULT_SETTINGS.sfxVolume);
    expect(s.hudScale).toBe(0.8);
    expect(s.totalCars).toBe(DEFAULT_SETTINGS.totalCars);
    expect(s.quickLaps).toBe(8);
    expect(s.language).toBe(DEFAULT_SETTINGS.language);
    expect(s.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(s.serverUrl).toBe(DEFAULT_SETTINGS.serverUrl);
    expect(s.telemetryConsent).toBe(DEFAULT_SETTINGS.telemetryConsent);
    const save = sanitizeSave(hostile(`{"racesRun":1e999,"racesWon":-3,"seatNames":[1,"  ",{},"${'x'.repeat(99)}"],"bestLaps":{"copacabana":{"ticks":1e999},"roma":{"ticks":"3000"},"paris":{"ticks":-5},"x":{"ticks":3000.6,"fp":"ZZZZZZZZ"}},"career":{"drivers":[{"name":5,"earnings":1e300,"garage":{"carId":{},"owned":"pororoca"}}],"wallets":[1e999,-1,"9"],"attempts":1e999}}`));
    expect(save.racesRun).toBe(DEFAULT_SAVE.racesRun);
    expect(save.racesWon).toBe(0);
    expect(save.seatNames.slice(0, 2)).toEqual(DEFAULT_SAVE.seatNames.slice(0, 2));
    expect(save.seatNames[3]).toBe('x'.repeat(12));
    expect(save.bestLaps).toEqual({ x: { ticks: 3001, name: '?', carId: DEFAULT_SAVE.seatCars[0], date: '' } });
    expect(save.career?.drivers[0].garage).toEqual({ carId: 'falcao', owned: [], upgrades: {} });
    expect(save.career?.drivers[0].earnings).toBe(999_999_999);
    expect(save.career?.wallets).toEqual([0]);
    expect(save.career?.attempts).toBe(1);
    expect(sanitizeProgress(hostile('{"profiles":[{"name":"Ana","cars":{"falcao":1e999,"trovao":1e300,"__proto__":9}}]}'))).toEqual({ profiles: [{ name: 'Ana', cars: { trovao: 99_999_999 } }] });
  });

  it('nada do que não é objeto (texto, número, lista, null, vazio) lança em nenhum saneador', () => {
    for (const raw of [undefined, null, 0, 1e999, '', 'x', [], [[]], true, {}, { format: 'speed-tche-playlog' }]) {
      expect(() => { sanitizeSave(raw); sanitizeSettings(raw); sanitizeProgress(raw); sanitizeGhostStore(raw); sanitizePlaylog(raw); }).not.toThrow();
    }
    expect(sanitizeSave(null)).toEqual(sanitizeSave({}));
  });

  it('1.000 mutações aleatórias (semente fixa) de um save da 0.1.7: nunca lança, e o que sai é estável ao regravar', () => {
    let seed = 20261020;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const junk = (): unknown => [null, 1e300, -1, 0.5, '', 'x'.repeat(2000), [], {}, [[[]]], true, { constructor: 5, toString: 1 }][Math.floor(rnd() * 11)];
    const mutate = (x: unknown): unknown => {
      if (rnd() < 0.08) return junk();
      if (Array.isArray(x)) return x.map(mutate);
      if (typeof x === 'object' && x !== null) {
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(x)) if (rnd() >= 0.03) out[k] = mutate(val);
        return out;
      }
      return x;
    };
    const fx = fixture('0.1.7');
    const targets: Array<[string, (r: unknown) => unknown, unknown]> = [
      ['save', sanitizeSave, fx.save], ['settings', sanitizeSettings, fx.settings], ['progress', sanitizeProgress, fx.progress], ['ghosts', sanitizeGhostStore, fx.ghosts],
    ];
    for (const [name, fn, base] of targets) {
      for (let i = 0; i < 250; i++) {
        const m = roundTrip(mutate(base));
        let a: unknown;
        expect(() => { a = fn(m); }, `${name} #${i}`).not.toThrow();
        expect(fn(roundTrip(a)), `${name} #${i} idempotente`).toEqual(a);
      }
    }
  });
});
