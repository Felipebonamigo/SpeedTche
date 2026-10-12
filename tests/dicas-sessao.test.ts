// O3: as dicas da 1ª corrida ligadas à sessão (docs/ondas/O/O3.md). Roda em Node: o renderizador (WebGL) e os menus (DOM) são
// dublês; entrada, simulação, save, dicas e áudio são os de verdade.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuContext, MenuNav, MenuScreen, Menus, Renderer } from '../src/game/contracts';
import { createSession, type Session } from '../src/game/session';
import { tipOf } from '../src/render/hud-tips';
import { human } from './helpers';

vi.mock('../src/render/renderer', () => ({
  createRenderer: (canvas: HTMLCanvasElement): Renderer => ({
    canvas, resize: () => undefined, render: () => undefined, renderIdle: () => undefined, dispose: () => undefined,
  }),
}));

vi.mock('../src/ui/menus', () => ({
  createMenus: (ctx: MenuContext): Menus => {
    let current: MenuScreen | null = null;
    return {
      show: (screen: MenuScreen) => { current = screen; },
      hide: () => { current = null; },
      current: () => current,
      navigate: (nav: MenuNav) => { void nav; void ctx; },
      update: () => undefined,
      refreshLanguage: () => undefined,
    };
  },
}));

/** Janela mínima para a sessão e a entrada: ouvintes, tamanho e a Gamepad API vazia. */
function fakeWindow() {
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  const win = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener: (type: string, fn: (e: unknown) => void) => { listeners.set(type, [...(listeners.get(type) ?? []), fn]); },
    removeEventListener: (type: string, fn: (e: unknown) => void) => { listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)); },
    navigator: { getGamepads: () => [null, null, null, null] },
  };
  const key = (type: 'keydown' | 'keyup', code: string) => {
    const e = { code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: null, preventDefault: () => undefined };
    for (const fn of listeners.get(type) ?? []) fn(e);
  };
  return { win, down: (code: string) => key('keydown', code), up: (code: string) => key('keyup', code) };
}

const element = {} as HTMLElement;
let w: ReturnType<typeof fakeWindow>;
let session: Session;
let now = 0;

/** Um quadro da sessão, a 60 Hz (um tick por quadro). */
function frame(ms = 1000 / 60): void {
  now += ms;
  session.frame(now);
}

beforeEach(() => {
  w = fakeWindow();
  vi.stubGlobal('window', w.win);
  session = createSession({} as HTMLCanvasElement, element, element);
  now = 1000;
});

afterEach(() => {
  session.input.dispose();
  vi.unstubAllGlobals();
});

describe('sessão: dicas da 1ª corrida', () => {
  it('na 1ª corrida de copa (racesRun 0) a sessão liga as dicas, e a da largada aparece na contagem', () => {
    session.input.bindSeat(0, 'kb1');
    expect(session.debugSave().racesRun).toBe(0);
    session.startCup('br_rj', [human(0)]);
    frame();
    const tips = session.race?.tips;
    expect(tips).toBeTruthy();
    if (!tips) return;
    expect(tipOf(tips, 0)?.id).toBe('launch');
  });

  it('corrida rápida e contra-relógio não recebem dicas, mesmo na 1ª vez', () => {
    session.input.bindSeat(0, 'kb1');
    session.startQuick('copacabana', 2, [human(0)]);
    expect(session.race?.tips).toBeNull();
    session.startQuick('copacabana', 2, [human(0)], true);
    expect(session.race?.tips).toBeNull();
  });

  it('quem já correu (racesRun > 0) não recebe dicas', () => {
    session.input.bindSeat(0, 'kb1');
    session.debugSave().racesRun = 1;
    session.startCup('br_rj', [human(0)]);
    expect(session.race?.tips).toBeNull();
  });
});
