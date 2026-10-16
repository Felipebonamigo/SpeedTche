// O5 (docs/ondas/O/O5.md §4.5): o que a sessão de verdade (session.ts) faz com a Steam ao ABRIR, com uma DesktopApi falsa em `window.desktop`.
// DEFEITO (o teste veio antes): o desktop/README.md dizia que a conquista guardada em `SaveData.achievements` era "reenviada se a Steam
// estivesse fechada na hora", mas nenhum código reenviava — quem ganhou uma conquista com a Steam fechada nunca a via na Steam.
// Também: o nome do P1 vindo da Steam (sem sobrescrever nome escolhido nem separar o histórico) e as conquistas de estado na abertura.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARS } from '../src/core/data/cars';
import { NEUTRAL_INPUT } from '../src/core/types';
import type { InputProvider, MenuContext, MenuNav, MenuScreen, Menus } from '../src/game/contracts';
import { API_FUNCTIONS, type DesktopApi } from '../src/game/desktop';
import { PROGRESS_KEY } from '../src/game/progression';
import { SAVE_KEY } from '../src/game/save';
import { SETTINGS_KEY } from '../src/game/settings';

let open: MenuScreen | null = null;
let lastCtx: MenuContext | null = null;

vi.mock('../src/render/renderer', () => ({
  createRenderer: () => ({ canvas: {}, resize() {}, render() {}, renderIdle() {}, dispose() {} }),
}));
vi.mock('../src/audio/audio', () => ({
  createAudio: () => ({ unlock() {}, update() {}, onEvent() {}, setMusic() {}, currentMusic: () => null, setVolumes() {}, musicList: () => [], ui() {} }),
}));
vi.mock('../src/ui/input', () => {
  const nav: MenuNav = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, device: null };
  const input: Partial<InputProvider> = {
    poll() {}, readSeat: () => NEUTRAL_INPUT, devices: () => [], joinPressed: () => null, leavePressed: () => null,
    menuNav: () => nav, pausePressed: () => -1, dispose() {}, peek: () => null, rumble() {}, bindSeat() {}, unbindSeat() {}, seatDevice: () => null,
  };
  return { createInput: () => input };
});
vi.mock('../src/ui/screens/tutorial', () => ({ createTutorialPanel: () => ({ update() {}, hide() {}, layout: () => null }) }));
vi.mock('../src/ui/menus', () => ({
  createMenus: (ctx: MenuContext): Partial<Menus> => {
    lastCtx = ctx;
    return { show(screen: MenuScreen) { open = screen; }, hide() { open = null; }, current: () => open, navigate() {}, update() {}, refreshLanguage() {} };
  },
}));

const store = new Map<string, string>();
const memStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(), key: () => null, get length() { return store.size; },
};

/** DesktopApi falsa: todas as funções (senão `getDesktop()` a recusa), anotando as conquistas enviadas. */
function fakeDesktop(steamName: string | null, steamAccepts = true): DesktopApi & { sent: string[] } {
  const sent: string[] = [];
  const api: Record<string, unknown> = {};
  for (const k of API_FUNCTIONS) api[k] = () => Promise.resolve(null);
  api.steamName = () => Promise.resolve(steamName);
  api.achievement = (id: string) => { sent.push(id); return Promise.resolve(steamAccepts); };
  api.storeReadAll = () => Promise.resolve({});
  api.storeWrite = () => Promise.resolve(true);
  api.onFullscreen = () => undefined;
  return Object.assign(api as unknown as DesktopApi, { sent });
}

let desktop: (DesktopApi & { sent: string[] }) | undefined;
beforeAll(() => {
  vi.stubGlobal('localStorage', memStorage);
  vi.stubGlobal('window', {
    addEventListener() {}, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    get desktop() { return desktop; },
  });
});
afterAll(() => { vi.unstubAllGlobals(); });
beforeEach(() => {
  store.clear();
  store.set(SETTINGS_KEY, JSON.stringify({ totalCars: 8 }));
  desktop = undefined;
  open = null;
  lastCtx = null;
});

async function newSession() {
  const { createSession } = await import('../src/game/session');
  const dummy = {} as HTMLElement;
  const s = createSession(dummy as HTMLCanvasElement, dummy, dummy);
  // As promessas da ponte (nome da Steam, reenvio) andam em microtarefas: deixa todas acabarem.
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  return s;
}
const saved = () => JSON.parse(store.get(SAVE_KEY) ?? 'null') as Record<string, any>;
const T = 60_000;

describe('ao abrir, a Steam recebe as conquistas guardadas (o defeito do reenvio)', () => {
  it('todo id guardado que está na lista da Steam é enviado; o desconhecido não', async () => {
    store.set(SAVE_KEY, JSON.stringify({ achievements: ['PRIMEIRA_VITORIA', 'COPA_BR_RJ', 'NAO_EXISTE_NA_STEAM'] }));
    desktop = fakeDesktop(null);
    await newSession();
    expect(desktop.sent).toEqual(['PRIMEIRA_VITORIA', 'COPA_BR_RJ']);
  }, T);

  it('a Steam recusando (fechada) não derruba nada; a próxima abertura manda de novo', async () => {
    store.set(SAVE_KEY, JSON.stringify({ achievements: ['SEM_BOX'] }));
    desktop = fakeDesktop(null, false);
    await newSession();
    expect(desktop.sent).toEqual(['SEM_BOX']);
    expect(saved().achievements).toEqual(['SEM_BOX']);
  }, T);

  it('fora do Electron (sem ponte) não há envio nem erro', async () => {
    store.set(SAVE_KEY, JSON.stringify({ achievements: ['SEM_BOX'] }));
    await expect(newSession()).resolves.toBeTruthy();
  }, T);
});

describe('conquistas de estado na abertura (quem já as merecia na 0.1.4)', () => {
  it('compra e corrida do save viram conquista, vão para o save e para a Steam', async () => {
    const priced = CARS.filter((c) => c.price > 0).map((c) => c.id);
    store.set(SAVE_KEY, JSON.stringify({ achievements: ['PRIMEIRA_VITORIA'], racesRun: 4, carsUnlocked: priced }));
    desktop = fakeDesktop(null);
    await newSession();
    expect(saved().achievements).toEqual(expect.arrayContaining(['PRIMEIRA_VITORIA', 'PRIMEIRA_CORRIDA', 'CARRO_NOVO', 'COLECIONADOR']));
    expect(desktop.sent).toEqual(expect.arrayContaining(['PRIMEIRA_VITORIA', 'PRIMEIRA_CORRIDA', 'CARRO_NOVO', 'COLECIONADOR']));
  }, T);
});

describe('nome do P1 vindo da Steam', () => {
  it('com o nome padrão e sem histórico, o P1 passa a ter o nome da Steam (no limite do lobby)', async () => {
    desktop = fakeDesktop('Felipe Bonamigo');
    await newSession();
    expect(saved().seatNames[0]).toBe('Felipe Bonam');
    expect(lastCtx?.save.seatNames[0]).toBe('Felipe Bonam');
  }, T);

  it('nome escolhido não é sobrescrito', async () => {
    store.set(SAVE_KEY, JSON.stringify({ seatNames: ['Ana', 'P2', 'P3', 'P4'] }));
    desktop = fakeDesktop('Felipe');
    await newSession();
    expect(saved().seatNames[0]).toBe('Ana');
  }, T);

  it('"P1" com corridas nas estatísticas fica (o nível, as estrelas e o histórico são desse perfil)', async () => {
    store.set(SAVE_KEY, JSON.stringify({ stats: { totals: {}, players: [{ name: 'P1', races: 3, laps: 9 }] } }));
    desktop = fakeDesktop('Felipe');
    await newSession();
    expect(saved().seatNames[0]).toBe('P1');
  }, T);

  it('sem Steam (nome nulo ou vazio) nada muda', async () => {
    desktop = fakeDesktop('   ');
    await newSession();
    expect(saved().seatNames[0]).toBe('P1');
  }, T);
});

describe('o progresso é lido na abertura e chega aos menus', () => {
  it('a chave própria é lida (saneada) e entregue aos menus; o save principal não ganha campo', async () => {
    store.set(PROGRESS_KEY, JSON.stringify({ profiles: [{ name: 'Ana', cars: { saci: 900, inventado: 3 } }] }));
    const s = await newSession();
    expect(s.debugProgress()).toEqual({ profiles: [{ name: 'Ana', cars: { saci: 900 } }] });
    expect(lastCtx?.progress).toBe(s.debugProgress());
    expect(Object.keys(saved())).not.toContain('progress');
  }, T);
});
