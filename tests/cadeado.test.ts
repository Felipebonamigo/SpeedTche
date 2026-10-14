// O5 (docs/ondas/O/O5.md §4.6): carro com cadeado e "Compre na Expedição por $ X" no lobby, na festa e no online, em vez de sumir.
// O carro trancado aparece no seletor, mas NÃO pode ser escolhido: PRONTO, INICIAR e "Pronto"/"Largar" do online recusam, e nenhum
// HumanEntry nem mensagem da sala sai com ele. DOM falso (tests/ui-fake.ts); o resto é o código de verdade.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CARS } from '../src/core/data/cars';
import { createRace } from '../src/core/sim/race';
import { getTrack } from '../src/core/track';
import type { RaceConfig, RaceState } from '../src/core/types';
import { DEFAULT_SAVE, DEFAULT_SETTINGS, type DeviceId, type MenuEvent, type RaceDriver, type SaveData, type Settings } from '../src/game/contracts';
import { OnlineController, type OnlineHost } from '../src/game/online-session';
import { sanitizeSave } from '../src/game/save';
import { setLanguage } from '../src/i18n';
import type { LobbyState, ScreenApi, ScreenInstance } from '../src/ui/screens/common';
import { lobbyHumans, lobbyScreen } from '../src/ui/screens/lobby';
import { tournamentScreen } from '../src/ui/screens/party';
import '../src/ui/strings';
import { all, fakeInput, hasClass, installDocument, NAV, text } from './ui-fake';
import { vi } from 'vitest';

const FREE = CARS.filter((c) => c.price === 0).map((c) => c.id);
const PRICED = CARS.filter((c) => c.price > 0);

function api(save: SaveData, bound: Array<DeviceId | null>, lobby: LobbyState, extra: Record<string, unknown> = {}) {
  const settings: Settings = { ...DEFAULT_SETTINGS, seatAssists: [...DEFAULT_SETTINGS.seatAssists] };
  const events: MenuEvent[] = [];
  const goes: string[] = [];
  const a = {
    ctx: { cars: CARS, save, settings, input: fakeInput(bound), cups: [], tracks: [], isCupUnlocked: () => true, ...extra },
    lobby,
    go: (s: string) => { goes.push(s); }, back: () => undefined, emit: (e: MenuEvent) => { events.push(e); }, sfx: () => undefined, refresh: () => undefined,
  } as unknown as ScreenApi;
  return { api: a, events, goes };
}
const press = (screen: ScreenInstance, device: DeviceId, key: 'up' | 'down' | 'left' | 'right' | 'confirm' | 'start') => screen.nav({ ...NAV, [key]: true, device });
/** Repete `step` até `done` (no máximo uma volta e meia nos 14 carros): o carro que nunca aparece falha o teste em vez de travar. */
function until(done: () => boolean, step: () => void): void {
  for (let i = 0; i < CARS.length * 2 && !done(); i++) step();
  expect(done()).toBe(true);
}

beforeEach(() => { installDocument(); setLanguage('pt'); });
afterEach(() => { vi.unstubAllGlobals(); setLanguage('pt'); });

describe('lobby: o carro trancado aparece com o cadeado e não pode ser escolhido', () => {
  const lobbyState = (): LobbyState => ({ mode: 'quick', versus: false, seats: [null, null, null, null] });
  function setup(save = sanitizeSave({}), bound: Array<DeviceId | null> = ['kb1', null, null, null]) {
    const x = api(save, bound, lobbyState());
    const screen = lobbyScreen(x.api);
    const slot = () => all(screen.el, hasClass('slot')).filter(hasClass('occupied'))[0];
    const carId = () => all(slot(), hasClass('car-card'))[0]?.getAttribute('data-car');
    const lock = () => all(slot(), hasClass('sel-lock'));
    return { ...x, save, screen, slot, carId, lock };
  }

  it('←→ percorre os 14 carros (os 7 à venda também), em vez de só os livres', () => {
    const { screen, carId } = setup();
    const seen = new Set<string>();
    for (let i = 0; i < CARS.length; i++) { seen.add(String(carId())); press(screen, 'kb1', 'right'); }
    expect([...seen].sort()).toEqual(CARS.map((c) => c.id).sort());
  });

  it('no trancado: a linha do cadeado com "Compre na Expedição por $ X" no lugar da pintura, e o cartão marcado', () => {
    const { screen, carId, lock, slot } = setup();
    until(() => carId() === 'curupira', () => press(screen, 'kb1', 'right'));
    expect(lock()).toHaveLength(1);
    expect(text(lock()[0])).toContain('Compre na Expedição por $ 12.000');
    expect(all(slot(), hasClass('sel-paint')).filter((e) => !e.classList.contains('sel-lock') && !e.className.includes('sel-lock'))).toHaveLength(0);
    expect(all(slot(), (e) => e.className.split(/\s+/).includes('car-hero') && e.className.includes('is-locked'))).toHaveLength(1);
    // De volta a um livre: a pintura volta e o cadeado some.
    until(() => carId() === 'falcao', () => press(screen, 'kb1', 'right'));
    expect(lock()).toHaveLength(0);
    expect(all(slot(), hasClass('sel-paint'))).toHaveLength(1);
  });

  it('EN: "Buy it in the Expedition for $12,000"', () => {
    setLanguage('en');
    const { screen, carId, lock } = setup();
    until(() => carId() === 'curupira', () => press(screen, 'kb1', 'right'));
    expect(text(lock()[0])).toContain('Buy it in the Expedition for $12,000');
  });

  it('PRONTO e INICIAR recusam com o carro trancado; com o carro liberado, larga', () => {
    const { screen, carId, slot, events, goes } = setup();
    until(() => carId() === 'curupira', () => press(screen, 'kb1', 'right'));
    press(screen, 'kb1', 'confirm'); // confirmar no carro = PRONTO
    expect(slot().classList.contains('ready') || slot().className.includes('ready')).toBe(false);
    press(screen, 'kb1', 'start'); // Enter segurado / Start: pronto + iniciar
    expect(goes).toEqual([]);
    expect(events).toEqual([]);
    until(() => carId() === 'falcao', () => press(screen, 'kb1', 'right'));
    press(screen, 'kb1', 'start');
    expect(goes).toEqual(['tracks']);
  });

  it('comprado numa Expedição deste computador: sem cadeado', () => {
    const save = sanitizeSave({});
    save.carsUnlocked = ['curupira'];
    const { screen, carId, lock } = setup(save);
    until(() => carId() === 'curupira', () => press(screen, 'kb1', 'right'));
    expect(lock()).toHaveLength(0);
  });

  it('o assento começa no carro guardado só se ele estiver liberado; lobbyHumans nunca sai com carro trancado', () => {
    const save = sanitizeSave({});
    save.seatCars = ['beijaflor', 'trovao', 'tornado', 'camelo'];
    const { carId, api: a } = setup(save);
    expect(carId()).toBe(FREE[0]);
    // Mesmo que o índice de um assento aponte para um trancado (estado antigo), a corrida sai com um livre.
    a.lobby.seats[0]!.carIndex = CARS.findIndex((c) => c.id === 'beijaflor');
    expect(lobbyHumans(a).map((h) => h.carId)).toEqual([FREE[0]]);
    save.carsUnlocked = ['beijaflor'];
    expect(setup(save).carId()).toBe('beijaflor');
  });
});

describe('festa (torneio): o seletor de carro de cada piloto', () => {
  function setup(save = sanitizeSave({})) {
    const draft = { players: [] as Array<{ name: string; carId: string }>, rounds: 1, cupId: 'br_rj' };
    const x = api(save, ['kb1', null, null, null], { mode: 'tournament', versus: false, seats: [{ seat: 0, device: 'kb1', name: 'P1', carIndex: 0, ready: false, cursor: 0 }, null, null, null] },
      { party: { draft, tournament: null }, cups: [{ id: 'br_rj', name: 'Copa RJ', country: 'BR', flag: '', trackIds: ['copacabana', 'paraty', 'ilha_grande'], requires: null, stage: 'brasil', state: 'RJ' }] });
    const screen = tournamentScreen(x.api);
    return { ...x, draft, screen };
  }
  it('percorre os 14; o trancado mostra o cadeado e a linha de erro diz "Compre na Expedição por $ X"; INICIAR recusa', () => {
    const { screen, draft, events } = setup();
    const seen = new Set<string>();
    for (let i = 0; i < CARS.length; i++) { seen.add(draft.players[0].carId); press(screen, 'kb1', 'right'); }
    expect([...seen].sort()).toEqual(CARS.map((c) => c.id).sort());
    until(() => draft.players[0].carId === 'curupira', () => press(screen, 'kb1', 'right'));
    const row = all(screen.el, (e) => e.getAttribute('data-player') === '0')[0];
    expect(all(row, hasClass('is-locked'))).not.toHaveLength(0);
    expect(text(all(screen.el, hasClass('tp-error'))[0])).toContain('Compre na Expedição por $ 12.000');
    press(screen, 'kb1', 'start');
    expect(events).toEqual([]);
  });
});

// ───────────────────────────── Online ─────────────────────────────

class FakeSocket {
  readyState = 0;
  sent: Array<Record<string, any>> = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  send(data: string): void { this.sent.push(JSON.parse(data) as Record<string, unknown>); }
  close(): void { this.readyState = 3; }
  open(): void { this.readyState = 1; this.onopen?.(); }
  push(msg: unknown): void { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

class Host implements OnlineHost {
  readonly settings: Settings = { ...DEFAULT_SETTINGS, assists: { ...DEFAULT_SETTINGS.assists }, seatAssists: [...DEFAULT_SETTINGS.seatAssists] };
  readonly save: SaveData;
  readonly input = fakeInput([null, null, null, null]);
  state: RaceState | null = null;
  constructor(unlocked: string[]) { this.save = { ...DEFAULT_SAVE, seatNames: ['Ana', 'P2', 'P3', 'P4'], seatCars: ['falcao', 'trovao', 'tornado', 'camelo'], carsUnlocked: unlocked }; }
  startRace(config: RaceConfig, _l: number[], _d: RaceDriver, state?: RaceState): void { this.state = state ?? createRace(config, getTrack(config.trackId)); }
  raceState() { return this.state; }
  clearRace() { this.state = null; }
  showScreen() {}
  hideScreen() {}
  menuOpen() { return false; }
  exitToMain() {}
  persistSettings() {}
}

describe('online: o carro trancado fica só na tela deste computador', () => {
  let ctl: OnlineController | null = null;
  afterEach(() => { ctl?.leave(false); ctl = null; });
  function lobby(asHost: boolean, unlocked: string[] = []) {
    const sock = new FakeSocket();
    const c = new OnlineController(new Host(unlocked), { socket: () => sock as unknown as WebSocket, pingMs: 60_000 });
    ctl = c;
    c.create('kb1');
    sock.open();
    const me = asHost ? 0 : 1;
    sock.push({ t: 'welcome', room: 'KQXTR', id: me, token: 'a'.repeat(24), rejoined: false });
    sock.push({ t: 'room', room: { code: 'KQXTR', host: 0, started: false, settings: null, clients: [
      { id: 0, seats: 1, connected: true, info: { players: [{ name: 'Ana', car: 'falcao' }], ready: false } },
      { id: 1, seats: 1, connected: true, info: { players: [{ name: 'Bia', car: 'trovao' }], ready: false } },
    ] } });
    return { c, sock };
  }
  const lastInfo = (sock: FakeSocket) => [...sock.sent].reverse().find((m) => m.t === 'info')?.info;

  it('←→ mostra os 14; no trancado a sala continua recebendo o último carro liberado', () => {
    const { c, sock } = lobby(false);
    const seen = new Set<string>();
    for (let i = 0; i < CARS.length; i++) { seen.add(c.viewCarOf(0)); c.cycleCar(0, 1); }
    expect([...seen].sort()).toEqual(CARS.map((x) => x.id).sort());
    until(() => c.viewCarOf(0) === 'curupira', () => c.cycleCar(0, 1));
    expect(c.viewLocked(0)).toBe(true);
    expect(FREE).toContain(c.locals[0].car);
    expect(FREE).toContain(lastInfo(sock).players[0].car);
    for (const m of sock.sent) for (const p of m.info?.players ?? []) expect(PRICED.map((x) => x.id)).not.toContain(p.car);
  });

  it('"Pronto" recusa com o carro trancado à vista; com um liberado, vale', () => {
    const { c } = lobby(false);
    until(() => c.viewCarOf(0) === 'curupira', () => c.cycleCar(0, 1));
    expect(c.toggleReady()).toBe(false);
    expect(c.ready).toBe(false);
    until(() => !c.viewLocked(0), () => c.cycleCar(0, 1));
    expect(c.toggleReady()).toBe(true);
    expect(c.ready).toBe(true);
  });

  it('anfitrião: "Largar" fica bloqueado com o cadeado à vista', () => {
    const { c } = lobby(true);
    until(() => c.viewCarOf(0) === 'curupira', () => c.cycleCar(0, 1));
    expect(c.startBlocker()).toBe('progress.lock.online');
  });

  it('comprado aqui: vai para a sala normalmente', () => {
    const { c, sock } = lobby(false, ['curupira']);
    until(() => c.viewCarOf(0) === 'curupira', () => c.cycleCar(0, 1));
    expect(c.viewLocked(0)).toBe(false);
    expect(lastInfo(sock).players[0].car).toBe('curupira');
  });
});
