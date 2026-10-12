// A oferta de assistência pela sessão de verdade (O3, docs/ondas/O/O3.md): depois de 2 eliminações seguidas a próxima largada vira
// uma pergunta (Freio automático, Amador ou não); recusável e uma vez por sessão. Dublês copiados de tests/fluxo-sessao.test.ts.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { COUNTDOWN_TICKS } from '../src/core/constants';
import { CUPS } from '../src/core/data/cups';
import type { HumanEntry } from '../src/core/types';
import { NEUTRAL_INPUT } from '../src/core/types';
import type { InputProvider, MenuContext, MenuNav, MenuScreen, Menus } from '../src/game/contracts';
import { SETTINGS_KEY } from '../src/game/settings';
import type { Session } from '../src/game/session';
import type { ResultsScreenData } from '../src/game/contracts';

const shown: MenuScreen[] = [];
let open: MenuScreen | null = null;
let lastData: ResultsScreenData | null = null;

vi.mock('../src/render/renderer', () => ({
  createRenderer: () => ({ canvas: {}, resize() {}, render() {}, renderIdle() {}, dispose() {} }),
}));
vi.mock('../src/audio/audio', () => ({
  createAudio: () => ({
    unlock() {}, update() {}, onEvent() {}, setMusic() {}, currentMusic: () => null, setVolumes() {}, musicList: () => [], ui() {},
  }),
}));
vi.mock('../src/ui/input', () => {
  const bound: Array<string | null> = [null, null, null, null];
  const nav: MenuNav = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, device: null };
  const input: Partial<InputProvider> = {
    poll() {}, readSeat: () => NEUTRAL_INPUT, devices: () => [], joinPressed: () => null, leavePressed: () => null,
    menuNav: () => nav, pausePressed: () => -1, dispose() {}, peek: () => null, rumble() {},
    bindSeat(seat, device) { bound[seat] = device; },
    unbindSeat(seat) { bound[seat] = null; },
    seatDevice: (seat) => (bound[seat] ?? null) as ReturnType<InputProvider['seatDevice']>,
  };
  return { createInput: () => input };
});
vi.mock('../src/ui/menus', () => ({
  createMenus: (_ctx: MenuContext): Partial<Menus> => ({
    show(screen: MenuScreen, data?: unknown) { shown.push(screen); open = screen; lastData = (data ?? null) as ResultsScreenData | null; },
    hide() { open = null; },
    current: () => open,
    navigate() {}, update() {}, refreshLanguage() {},
  }),
}));

const store = new Map<string, string>();
const memStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: () => null,
  get length() { return store.size; },
};

beforeAll(() => {
  vi.stubGlobal('localStorage', memStorage);
  vi.stubGlobal('window', { addEventListener() {}, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 });
});
afterAll(() => { vi.unstubAllGlobals(); });
beforeEach(() => {
  store.clear();
  // Pista menor para a corrida inteira caber no teste (o mínimo das opções).
  store.set(SETTINGS_KEY, JSON.stringify({ totalCars: 8 }));
  shown.length = 0;
  open = null;
});

async function newSession(): Promise<Session> {
  const { createSession } = await import('../src/game/session');
  const dummy = {} as HTMLElement;
  return createSession(dummy as HTMLCanvasElement, dummy, dummy);
}

const HUMANS: HumanEntry[] = [{ seat: 0, name: 'Ana', carId: 'trovao', teamId: 0, color: '#fff' }];

let clock = 1000;

/** Roda a corrida até o resultado com o humano em último (eliminação sem depender do balanceamento) e devolve os dados dele. */
function eliminate(s: Session): ResultsScreenData {
  const r = s.race;
  if (!r) throw new Error('sem corrida');
  s.debugStep(COUNTDOWN_TICKS + 60);
  let k = 0;
  for (const c of r.state.cars) {
    c.lap = r.state.config.laps; c.x = 0;
    if (c.seat >= 0) { c.z = r.track.length - 900; c.speed = 1500; } else { c.z = r.track.length - 40 - k * 3; c.speed = 4000; k++; }
  }
  s.debugStep(600);
  for (let i = 0; i < 40 && open !== 'results'; i++) { clock += 250; s.frame(clock); } // relógio crescente: um quadro com tempo para trás pararia a corrida
  expect(open).toBe('results');
  if (!lastData) throw new Error('sem dados do resultado');
  expect(lastData.champ?.eliminated).toBe(true);
  return lastData;
}

describe('oferta de assistência depois de 2 eliminações (O3)', () => {
  it('na 1ª eliminação a copa recomeça direto; na 2ª seguida a largada espera a pergunta, e aceitar o Freio automático a aplica e larga', async () => {
    const s = await newSession();
    s.input.bindSeat(0, 'kb1');
    s.handleMenuEvent({ type: 'startCup', cupId: CUPS[0].id, humans: HUMANS });
    const first = eliminate(s);
    s.handleMenuEvent({ type: 'startCup', cupId: CUPS[0].id, humans: first.humans });
    expect(open).not.toBe('assistOffer');
    expect(s.race?.state.phase).toBe('countdown');
    eliminate(s);
    const before = s.race;
    s.handleMenuEvent({ type: 'startCup', cupId: CUPS[0].id, humans: HUMANS });
    expect(open).toBe('assistOffer');
    expect(s.race).toBe(before); // ainda a corrida velha: nada largou
    expect(lastData).toMatchObject({ brake: true, amateur: true });
    s.handleMenuEvent({ type: 'assistOfferAnswer', choice: 'brake' });
    expect(s.settings.seatAssists[0]).toBe('brake');
    expect(s.settings.difficulty).toBe('profissional');
    expect(s.race).not.toBe(before);
    expect(s.race?.state.phase).toBe('countdown');
    expect(s.race?.state.config.humans[0].assist).toBe('brake');
  }, 180_000);

  it('Amador troca a dificuldade; recusar não muda nada e larga; a oferta não volta na sessão', async () => {
    const s = await newSession();
    s.input.bindSeat(0, 'kb1');
    s.handleMenuEvent({ type: 'startCup', cupId: CUPS[0].id, humans: HUMANS });
    eliminate(s);
    s.handleMenuEvent({ type: 'startCup', cupId: CUPS[0].id, humans: HUMANS });
    eliminate(s);
    s.handleMenuEvent({ type: 'startCup', cupId: CUPS[0].id, humans: HUMANS });
    expect(open).toBe('assistOffer');
    s.handleMenuEvent({ type: 'assistOfferAnswer', choice: 'no' });
    expect(s.settings.seatAssists[0]).toBe('none');
    expect(s.settings.difficulty).toBe('profissional');
    expect(s.race?.state.phase).toBe('countdown');
    eliminate(s);
    s.handleMenuEvent({ type: 'startCup', cupId: CUPS[0].id, humans: HUMANS });
    eliminate(s);
    shown.length = 0;
    s.handleMenuEvent({ type: 'startCup', cupId: CUPS[0].id, humans: HUMANS });
    expect(shown).not.toContain('assistOffer');
    expect(s.race?.state.phase).toBe('countdown');
  }, 240_000);

  it('quem escolhe Amador muda só a dificuldade (e fica salvo nas opções)', async () => {
    const s = await newSession();
    s.input.bindSeat(0, 'kb1');
    s.handleMenuEvent({ type: 'startCup', cupId: CUPS[0].id, humans: HUMANS });
    eliminate(s);
    s.handleMenuEvent({ type: 'startCup', cupId: CUPS[0].id, humans: HUMANS });
    eliminate(s);
    s.handleMenuEvent({ type: 'retryRace' });
    expect(open).toBe('assistOffer'); // também o "tentar de novo" do resultado segura a largada
    s.handleMenuEvent({ type: 'assistOfferAnswer', choice: 'amateur' });
    expect(s.settings.difficulty).toBe('amador');
    expect(s.settings.seatAssists[0]).toBe('none');
    expect(JSON.parse(store.get(SETTINGS_KEY) ?? '{}').difficulty).toBe('amador');
    expect(s.race?.state.config.difficulty).toBe('amador');
    expect(s.race?.state.phase).toBe('countdown');
  }, 180_000);
});
