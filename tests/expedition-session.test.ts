// N5: a sessão de verdade (session.ts) fecha o "Desde a última vez" na abertura: o que a sessão anterior rendeu vira o `recap`
// no save, e o ponto de partida desta é gravado. Renderizador, entrada, áudio e menus são dublês; o save mora num localStorage em memória.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NEUTRAL_INPUT } from '../src/core/types';
import type { InputProvider, MenuContext, MenuNav, MenuScreen, Menus, RenderFrame } from '../src/game/contracts';
import { SAVE_KEY } from '../src/game/save';
import { SETTINGS_KEY } from '../src/game/settings';

const frames: RenderFrame[] = [];
let open: MenuScreen | null = null;

vi.mock('../src/render/renderer', () => ({
  createRenderer: () => ({ canvas: {}, resize() {}, render(f: RenderFrame) { frames.push(f); }, renderIdle() {}, dispose() {} }),
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
// O painel do tutorial é DOM no HUD; aqui só importa o que a sessão manda desenhar.
vi.mock('../src/ui/screens/tutorial', () => ({
  createTutorialPanel: () => ({ update() {}, hide() {}, layout: () => null }),
}));
vi.mock('../src/ui/menus', () => ({
  createMenus: (_ctx: MenuContext): Partial<Menus> => ({
    show(screen: MenuScreen) { open = screen; },
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
  store.set(SETTINGS_KEY, JSON.stringify({ totalCars: 8 }));
  frames.length = 0;
  open = null;
});

async function newSession() {
  const { createSession } = await import('../src/game/session');
  const dummy = {} as HTMLElement;
  return createSession(dummy as HTMLCanvasElement, dummy, dummy);
}

const SESSION_TIMEOUT = 60_000;
const saved = () => JSON.parse(store.get(SAVE_KEY) ?? 'null') as Record<string, any> | null;

describe('sessão: o quadro "Desde a última vez" fecha na abertura', () => {
  it('a sessão anterior (do retrato guardado até o save de agora) vira o recap, e o ponto de partida é regravado', async () => {
    store.set(SAVE_KEY, JSON.stringify({
      racesRun: 12, racesWon: 4, achievements: ['A', 'B'], carsUnlocked: ['curupira'],
      sessionStart: { at: '2026-10-10T20:00:00.000Z', racesRun: 5, racesWon: 1, stamps: 0, cupsCompleted: 0, achievements: 1, carsBought: 0, earned: 0 },
    }));
    await newSession();
    const out = saved();
    expect(out?.recap.before.racesRun).toBe(5);
    expect(out?.recap.after).toMatchObject({ racesRun: 12, racesWon: 4, achievements: 2, carsBought: 1 });
    expect(out?.sessionStart.racesRun).toBe(12);
  }, SESSION_TIMEOUT);

  it('save de antes da N5 (sem os campos): abre, guarda o ponto de partida e não inventa quadro', async () => {
    store.set(SAVE_KEY, JSON.stringify({ racesRun: 7 }));
    await newSession();
    expect(saved()?.sessionStart.racesRun).toBe(7);
    expect(saved()?.recap).toBeNull();
  }, SESSION_TIMEOUT);

  it('sem save nenhum (1ª vez): abre limpo', async () => {
    await newSession();
    expect(saved()?.recap).toBeNull();
    expect(saved()?.sessionStart.racesRun).toBe(0);
  }, SESSION_TIMEOUT);
});
