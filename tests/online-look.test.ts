// O visual do carro (N3) na sala online: cada jogador local monta o seu no cartão da sala (acabamento, roda, aro, faixa, chama, cores livres),
// o look vai no `info` (LobbyPlayer.look) e na largada (SeatAssignment.look) e chega IDÊNTICO ao outro computador; cada computador monta a mesma
// corrida — a config sem o look (o estado não carrega cosmético, mesmo `hashRace`) e os humanos da sessão com ele. Um look adulterado de outro
// cliente é recusado (ele aparece sem jogadores) e a sala segue. Controlador com socket falso, no molde de tests/online-paint.test.ts.
import { afterEach, describe, expect, it } from 'vitest';
import { hashRace, serializeRace } from '../src/core/serialize';
import { createRace } from '../src/core/sim/race';
import { getTrack } from '../src/core/track';
import type { CarLook, HumanEntry, RaceConfig, RaceState } from '../src/core/types';
import { DEFAULT_SAVE, DEFAULT_SETTINGS, type DeviceId, type InputProvider, type MenuNav, type RaceDriver, type SaveData, type Settings } from '../src/game/contracts';
import { FREE_COLORS } from '../src/game/cosmetics';
import { assignSeats, OnlineController, raceConfigFrom, startHumans, type OnlineHost } from '../src/game/online-session';
import { raceLooks, seatLook, setSeatLook } from '../src/game/paints';
import type { RoomView, StartConfig } from '../src/net/protocol';

class FakeSocket {
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  send(data: string): void { this.sent.push(JSON.parse(data) as Record<string, unknown>); }
  close(): void { this.readyState = 3; }
  open(): void { this.readyState = 1; this.onopen?.(); }
  push(msg: unknown): void { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

function fakeInput(): InputProvider {
  const seats: Array<DeviceId | null> = [null, null, null, null];
  const nav: MenuNav = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, device: null };
  return {
    poll() {}, readSeat: () => ({ steer: 0, throttle: false, brake: false, nitro: false, gearUp: false, gearDown: false }),
    bindSeat(seat, device) { seats[seat] = device; }, unbindSeat(seat) { seats[seat] = null; }, seatDevice: (s) => seats[s] ?? null,
    devices: () => [], joinPressed: () => null, leavePressed: () => null, menuNav: () => nav, pausePressed: () => -1, dispose() {},
    peek: () => null, rumble() {},
  };
}

class Host implements OnlineHost {
  readonly settings: Settings = { ...DEFAULT_SETTINGS, assists: { ...DEFAULT_SETTINGS.assists }, seatAssists: [...DEFAULT_SETTINGS.seatAssists] };
  readonly save: SaveData = { ...DEFAULT_SAVE, seatNames: ['Ana', 'P2', 'P3', 'P4'], seatCars: [...DEFAULT_SAVE.seatCars] };
  readonly input = fakeInput();
  state: RaceState | null = null;
  config: RaceConfig | null = null;
  humans: HumanEntry[] | null = null;
  saved = 0;
  startRace(config: RaceConfig, _localSeats: number[], _driver: RaceDriver, state?: RaceState, humans?: HumanEntry[]): void {
    this.config = config;
    this.humans = humans ?? null;
    this.state = state ?? createRace(config, getTrack(config.trackId));
  }
  raceState() { return this.state; }
  clearRace() { this.state = null; }
  showScreen() {}
  hideScreen() {}
  menuOpen() { return false; }
  exitToMain() {}
  persistSettings() {}
  persistSave() { this.saved++; }
}

const TOKEN = 'a'.repeat(24);
type PlayerMsg = Record<string, unknown>;

function roomMsg(guest: PlayerMsg[] = [{ name: 'Bia', car: 'trovao' }], guestReady = false) {
  const infos: Record<number, { players: PlayerMsg[]; ready: boolean }> = { 0: { players: [{ name: 'Ana', car: 'falcao' }], ready: false }, 1: { players: guest, ready: guestReady } };
  return {
    t: 'room', room: {
      code: 'KQXTR', host: 0, started: false, settings: null,
      clients: [0, 1].map((id) => ({ id, seats: infos[id].players.length, connected: true, info: infos[id] })),
    },
  };
}

type Info = { players: Array<{ name: string; car: string; look?: CarLook }>; ready: boolean };
const lastInfo = (sock: FakeSocket): Info => {
  const m = [...sock.sent].reverse().find((x) => x.t === 'info' || x.t === 'create' || x.t === 'join');
  return (m as { info: Info }).info;
};

const FULL: CarLook = { paint: 'rubi', color: FREE_COLORS[7], accent: FREE_COLORS[20], finish: 'camaleao', wheel: 'mag', rim: 'dourado', stripe: 'ab', flame: 'roxa' };

describe('online: o visual inteiro do carro', () => {
  let online: OnlineController | null = null;
  afterEach(() => { online?.leave(false); online = null; });

  function setup(myId: number, prepare?: (host: Host) => void, guest?: PlayerMsg[]): { sock: FakeSocket; host: Host; ctl: OnlineController } {
    const sock = new FakeSocket();
    const host = new Host();
    prepare?.(host);
    const ctl = new OnlineController(host, { socket: () => sock as unknown as WebSocket, pingMs: 60_000 });
    online = ctl;
    if (myId === 0) ctl.create('kb1'); else ctl.join('KQXTR', 'kb1');
    sock.open();
    sock.push({ t: 'welcome', room: 'KQXTR', id: myId, token: TOKEN, rejoined: false });
    sock.push(roomMsg(guest));
    expect(ctl.phase).toBe('lobby');
    return { sock, host, ctl };
  }

  it('cada campo do cartão grava no save do assento e publica na sala; o look de fábrica não vai na mensagem', () => {
    const { sock, host, ctl } = setup(1);
    expect(ctl.lookOf(0)).toBeNull();
    expect(lastInfo(sock).players[0]).not.toHaveProperty('look');
    ctl.stepLookField(0, 'finish', 1);
    expect(ctl.lookOf(0)).toEqual({ finish: 'metalico' });
    expect(lastInfo(sock).players[0].look).toEqual({ finish: 'metalico' });
    expect(seatLook(host.save, 0, 'falcao')).toEqual({ finish: 'metalico' });
    ctl.stepLookField(0, 'stripe', 1);
    ctl.stepLookField(0, 'wheel', 1);
    ctl.stepLookField(0, 'flame', -1);
    expect(lastInfo(sock).players[0].look).toEqual({ finish: 'metalico', wheel: 'mag', stripe: 'nenhuma', flame: 'roxa' });
    expect(host.saved).toBe(4);
    // Voltar ao padrão tira a chave: a mensagem de quem não personaliza é a de antes.
    ctl.stepLookField(0, 'finish', -1);
    ctl.stepLookField(0, 'wheel', -1);
    ctl.stepLookField(0, 'stripe', -1);
    ctl.stepLookField(0, 'flame', 1);
    expect(lastInfo(sock).players[0]).not.toHaveProperty('look');
    expect(host.save.seatLooks[0]).toEqual({});
  });

  it('o look guardado do carro aparece ao abrir a sala e acompanha a troca de carro', () => {
    const { sock, ctl } = setup(1, (h) => { setSeatLook(h.save, 0, 'falcao', FULL); setSeatLook(h.save, 0, 'trovao', { finish: 'fosco' }); });
    expect(ctl.lookOf(0)).toEqual(FULL);
    expect(lastInfo(sock).players[0].look).toEqual(FULL);
    ctl.cycleCar(0, 1);
    expect(ctl.locals[0].car).toBe('trovao');
    expect(ctl.lookOf(0)).toEqual({ finish: 'fosco' });
    expect(lastInfo(sock).players[0].look).toEqual({ finish: 'fosco' });
  });

  it('travado com o "pronto" dado: não muda, não grava, não publica', () => {
    const { sock, host, ctl } = setup(1);
    ctl.toggleReady();
    const sent = sock.sent.length;
    ctl.stepLookField(0, 'finish', 1);
    expect(ctl.lookOf(0)).toBeNull();
    expect(sock.sent.length).toBe(sent);
    expect(host.saved).toBe(0);
  });

  it('o look do convidado chega idêntico ao anfitrião, vai na largada e as duas pontas montam a mesma corrida (mesmo hash, config sem look)', () => {
    const { sock, host, ctl } = setup(0, undefined, [{ name: 'Bia', car: 'trovao', look: { paint: 'cobalto', finish: 'cromado', wheel: 'steel', stripe: 'a' } }]);
    sock.push(roomMsg([{ name: 'Bia', car: 'trovao', look: { paint: 'cobalto', finish: 'cromado', wheel: 'steel', stripe: 'a' } }], true));
    const seats = assignSeats(ctl.room as RoomView);
    expect(seats.map((s) => s.look)).toEqual([undefined, { paint: 'cobalto', finish: 'cromado', wheel: 'steel', stripe: 'a' }]);
    ctl.stepLookField(0, 'finish', 1); // o anfitrião também personaliza, antes de largar
    ctl.stepLookField(0, 'finish', 1);
    expect(ctl.startRace()).toBe(true);
    const start = sock.sent.find((m) => m.t === 'start') as { cfg: StartConfig };
    expect(start.cfg.seats.map((s) => s.look)).toEqual([{ finish: 'perolado' }, { paint: 'cobalto', finish: 'cromado', wheel: 'steel', stripe: 'a' }]);
    sock.push({ t: 'start', from: 0, cfg: start.cfg });

    // O "outro computador": recebe a MESMA mensagem pelo fio (JSON) e monta a corrida por conta própria.
    const wire = JSON.parse(JSON.stringify(start.cfg)) as StartConfig;
    expect(host.config?.humans.some((h) => 'look' in h)).toBe(false);
    expect(raceConfigFrom(wire)).toEqual(host.config);
    expect(startHumans(wire)).toEqual(host.humans);
    const state = host.state as RaceState;
    const other = createRace(raceConfigFrom(wire), getTrack(wire.trackId));
    expect(hashRace(other)).toBe(hashRace(state));
    expect(serializeRace(other)).toBe(serializeRace(state));
    expect(JSON.stringify(state)).not.toMatch(/cromado|perolado|"look"|steel/);

    // E o que cada um desenha é a mesma lista.
    const mine = raceLooks(state.cars, host.humans ?? []);
    const theirs = raceLooks(other.cars, startHumans(wire));
    expect(theirs).toEqual(mine);
    expect(mine[state.cars.findIndex((c) => c.seat === 1)]).toEqual({ paint: 'cobalto', finish: 'cromado', wheel: 'steel', stripe: 'a' });
    expect(mine[state.cars.findIndex((c) => c.seat === 0)]).toEqual({ finish: 'perolado' });
  });

  it('o look não muda o hash: a corrida com todos os visuais tem o mesmo hashRace e o mesmo estado da de fábrica', () => {
    const humans = (looks: Array<CarLook | undefined>): StartConfig['seats'] => [0, 1, 2, 3].map((seat) => ({ seat, client: seat, name: `P${seat + 1}`, car: 'falcao', ...(looks[seat] ? { look: looks[seat] } : {}) }));
    const base = { trackId: 'copacabana', laps: 1, versus: false, difficulty: 'amador' as const, totalCars: 8, manualGear: false, assists: { sharedNitro: true, tow: true, teamDraft: true, catchup: true }, delay: 3, seed: 42 };
    const plain: StartConfig = { ...base, seats: humans([]) };
    const styled: StartConfig = { ...base, seats: humans([FULL, { finish: 'cromado' }, { wheel: 'dish', rim: 'prata' }, { stripe: 'b', flame: 'verde' }]) };
    const a = createRace(raceConfigFrom(plain), getTrack('copacabana'));
    const b = createRace(raceConfigFrom(styled), getTrack('copacabana'));
    expect(hashRace(b)).toBe(hashRace(a));
    expect(serializeRace(b)).toBe(serializeRace(a));
  });

  it('um cliente com look adulterado aparece sem jogadores e a sala segue: o anfitrião larga sem ele', () => {
    const { sock, ctl } = setup(0, undefined, [{ name: 'Mau', car: 'trovao', look: { finish: 'ouro-puro' } }]);
    const room = ctl.room as RoomView;
    expect(room.clients.find((c) => c.id === 1)?.info).toBeNull();
    expect(room.clients.find((c) => c.id === 0)?.info?.players).toHaveLength(1);
    expect(assignSeats(room).map((s) => s.name)).toEqual(['Ana']);
    expect(sock.sent.some((m) => m.t === 'error')).toBe(false);
  });
});
