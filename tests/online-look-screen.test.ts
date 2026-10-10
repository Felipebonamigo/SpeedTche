// O editor do visual do carro (N3) na SALA ONLINE: o botão "Visual" do cartão do jogador local abre o editor logo abaixo, ←→ muda o campo
// (grava no save do assento e publica na sala), Voltar fecha e devolve o foco, e com o "pronto" dado o editor fecha e não abre. A tela de
// verdade (onlineScreen) sobre o controlador de verdade com socket falso; DOM falso mínimo, o mesmo de tests/look-screens.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARS } from '../src/core/data/cars';
import { createRace } from '../src/core/sim/race';
import { getTrack } from '../src/core/track';
import type { CarLook, HumanEntry, RaceConfig, RaceState } from '../src/core/types';
import { DEFAULT_SAVE, DEFAULT_SETTINGS, type DeviceId, type InputProvider, type MenuNav, type RaceDriver, type SaveData, type Settings } from '../src/game/contracts';
import { OnlineController, type OnlineHost } from '../src/game/online-session';
import { seatLook } from '../src/game/paints';
import '../src/ui/strings';
import type { ScreenApi, ScreenInstance } from '../src/ui/screens/common';
import { onlineScreen } from '../src/ui/screens/online';

class FakeEl {
  children: unknown[] = [];
  className = '';
  textContent = '';
  title = '';
  innerHTML = '';
  value = '';
  disabled = false;
  style = { setProperty() {} };
  attrs: Record<string, string> = {};
  dataset: Record<string, string> = {};
  listeners: Record<string, Array<(ev: unknown) => void>> = {};
  private readonly classes = new Set<string>();
  classList = {
    add: (...c: string[]) => { for (const x of c) this.classes.add(x); },
    remove: (...c: string[]) => { for (const x of c) this.classes.delete(x); },
    toggle: (c: string, force?: boolean) => { const on = force ?? !this.classes.has(c); if (on) this.classes.add(c); else this.classes.delete(c); return on; },
    contains: (c: string) => this.classes.has(c),
  };
  constructor(readonly tag: string) {}
  /** `<template>` de icons.ts: o SVG sai com a marcação que recebeu (para conferir as cores do desenho). */
  get content(): { firstElementChild: FakeEl } {
    const svg = new FakeEl('svg');
    svg.innerHTML = this.innerHTML;
    return { firstElementChild: svg };
  }
  setAttribute(k: string, v: string): void { this.attrs[k] = v; }
  getAttribute(k: string): string | null { return this.attrs[k] ?? null; }
  appendChild<T>(c: T): T { this.children.push(c); return c; }
  append(...c: unknown[]): void { this.children.push(...c); }
  prepend(...c: unknown[]): void { this.children.unshift(...c); }
  replaceChildren(...c: unknown[]): void { this.children = [...c]; }
  addEventListener(type: string, fn: (ev: unknown) => void): void { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(): void { /* não usado */ }
  getContext(): null { return null; }
  focus(): void {}
  select(): void {}
  blur(): void {}
  closest(): null { return null; }
}

function all(root: unknown, pred: (el: FakeEl) => boolean, out: FakeEl[] = []): FakeEl[] {
  if (!(root instanceof FakeEl)) return out;
  if (pred(root)) out.push(root);
  for (const c of root.children) all(c, pred, out);
  return out;
}

const hasClass = (cls: string) => (el: FakeEl) => el.className.split(/\s+/).includes(cls);
const text = (el: unknown): string => (el instanceof FakeEl ? el.textContent + el.children.map(text).join('') : typeof el === 'object' && el && 'text' in el ? String((el as { text: string }).text) : '');

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


const focused = (root: unknown) => all(root, (el) => el.classList.contains('focus'));

const TOKEN = 'a'.repeat(24);
const roomMsg = () => ({
  t: 'room', room: {
    code: 'KQXTR', host: 0, started: false, settings: null,
    clients: [
      { id: 0, seats: 1, connected: true, info: { players: [{ name: 'Ana', car: 'falcao' }], ready: false } },
      { id: 1, seats: 1, connected: true, info: { players: [{ name: 'Bia', car: 'trovao' }], ready: false } },
    ],
  },
});
const NAV: MenuNav = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, device: null };
const press = (screen: ScreenInstance, key: 'up' | 'down' | 'left' | 'right' | 'confirm') => screen.nav({ ...NAV, [key]: true, device: 'kb1' });

beforeEach(() => {
  vi.stubGlobal('document', {
    activeElement: null,
    createElement: (tag: string) => new FakeEl(tag),
    createElementNS: (_ns: string, tag: string) => new FakeEl(tag),
    createTextNode: (t: string) => ({ text: t }),
    body: new FakeEl('body'),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('sala online: o editor do visual do carro', () => {
  let online: OnlineController | null = null;
  afterEach(() => { online?.leave(false); online = null; });

  function setup(prepare?: (host: Host) => void) {
    const sock = new FakeSocket();
    const host = new Host();
    prepare?.(host);
    const ctl = new OnlineController(host, { socket: () => sock as unknown as WebSocket, pingMs: 60_000 });
    online = ctl;
    ctl.join('KQXTR', 'kb1');
    sock.open();
    sock.push({ t: 'welcome', room: 'KQXTR', id: 1, token: TOKEN, rejoined: false });
    sock.push(roomMsg());
    expect(ctl.phase).toBe('lobby');
    const api = {
      ctx: { online: ctl, settings: host.settings, save: host.save, input: host.input, cars: CARS, cups: [], tracks: [], trackOutline: () => [] },
      lobby: { mode: 'quick', versus: false, seats: [null, null, null, null] },
      go: () => undefined, back: () => undefined, emit: () => undefined, sfx: () => undefined, refresh: () => undefined,
    } as unknown as ScreenApi;
    const screen = onlineScreen(api);
    const goTo = (pred: (el: FakeEl) => boolean) => {
      for (let i = 0; i < 24 && !focused(screen.el).some(pred); i++) press(screen, 'down');
      expect(focused(screen.el).some(pred), 'o foco chegou').toBe(true);
    };
    return { sock, host, ctl, screen, goTo };
  }
  const infoLook = (sock: FakeSocket): CarLook | undefined => {
    const m = [...sock.sent].reverse().find((x) => x.t === 'info' || x.t === 'join') as { info: { players: Array<{ look?: CarLook }> } };
    return m.info.players[0].look;
  };

  it('o cartão tem o botão "Visual" (resumo De fábrica) e nenhum editor aberto', () => {
    const { screen } = setup();
    const btn = all(screen.el, hasClass('btn-look'));
    expect(btn).toHaveLength(1);
    expect(btn[0].textContent).toBe('Visual: De fábrica');
    expect(all(screen.el, hasClass('look-editor'))).toHaveLength(0);
  });

  it('confirmar em "Visual" abre o editor (8 campos), ←→ muda e publica na sala com o save gravado, Voltar fecha e o foco volta', () => {
    const { sock, host, ctl, screen, goTo } = setup();
    goTo(hasClass('btn-look'));
    press(screen, 'confirm');
    const rows = all(screen.el, hasClass('sel-look'));
    expect(rows.map((r) => r.getAttribute('data-field'))).toEqual(['paint', 'color', 'accent', 'finish', 'wheel', 'rim', 'stripe', 'flame']);
    // O foco continua em "Visual"; o editor vem logo abaixo: pintura, cor, detalhe, acabamento.
    for (let i = 0; i < 4; i++) press(screen, 'down');
    expect(focused(screen.el).map((el) => el.getAttribute('data-field'))).toEqual(['finish']);
    press(screen, 'right');
    expect(ctl.lookOf(0)).toEqual({ finish: 'metalico' });
    expect(infoLook(sock)).toEqual({ finish: 'metalico' });
    expect(seatLook(host.save, 0, 'trovao') ?? seatLook(host.save, 0, 'falcao')).toEqual({ finish: 'metalico' });
    expect(host.saved).toBe(1);
    press(screen, 'down'); press(screen, 'right'); // roda
    expect(infoLook(sock)).toEqual({ finish: 'metalico', wheel: ctl.lookOf(0)?.wheel });
    expect(ctl.lookOf(0)?.wheel).toBeDefined();
    // O botão "Visual" mostra o resumo novo e Voltar fecha o editor, com o foco de volta no botão.
    goTo(hasClass('btn-look-back'));
    press(screen, 'confirm');
    expect(all(screen.el, hasClass('look-editor'))).toHaveLength(0);
    expect(focused(screen.el).some(hasClass('btn-look'))).toBe(true);
    expect(all(screen.el, hasClass('btn-look'))[0].textContent).toBe('Visual: Metálico +1');
  });

  it('a pintura da paleta dentro do editor é a mesma da linha "Pintura" (cyclePaint)', () => {
    const { sock, ctl, screen, goTo } = setup();
    goTo(hasClass('btn-look'));
    press(screen, 'confirm');
    press(screen, 'down'); // pintura
    press(screen, 'right');
    expect(ctl.paintOf(0)).toBe('rubi');
    expect(infoLook(sock)).toEqual({ paint: 'rubi' });
  });

  it('com o "pronto" dado o editor fecha e o botão não abre', () => {
    const { ctl, screen, goTo } = setup();
    goTo(hasClass('btn-look'));
    press(screen, 'confirm');
    expect(all(screen.el, hasClass('look-editor'))).toHaveLength(1);
    ctl.toggleReady();
    screen.update?.(0);
    expect(all(screen.el, hasClass('look-editor'))).toHaveLength(0);
    goTo(hasClass('btn-look'));
    press(screen, 'confirm');
    expect(all(screen.el, hasClass('look-editor'))).toHaveLength(0);
    expect(ctl.lookOf(0)).toBeNull();
  });

  it('o look guardado do carro já vem na sala e no resumo do botão', () => {
    const { screen, sock } = setup((h) => { h.save.seatLooks = [{ trovao: { finish: 'camaleao', rim: 'dourado' }, falcao: { finish: 'camaleao', rim: 'dourado' } }, {}, {}, {}]; });
    expect(infoLook(sock)).toEqual({ finish: 'camaleao', rim: 'dourado' });
    expect(all(screen.el, hasClass('btn-look'))[0].textContent).toBe('Visual: Camaleão +1');
  });
});
