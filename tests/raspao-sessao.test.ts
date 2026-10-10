// A sessão liga o que a onda L, L5, deriva do estado: o raspão de lado vibra o controle do humano e o rival fala na pista.
// Mesmo dublê de tests/nitro-quadro.test.ts (renderizador e menus falsos, o resto é de verdade).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { carStats } from '../src/core/sim/stats';
import type { MenuContext, Menus, MenuScreen, Renderer } from '../src/game/contracts';
import { rivalLine } from '../src/game/rivals';
import { rivalByName } from '../src/game/rival-talk';
import { createSession, type Session } from '../src/game/session';
import { human } from './helpers';

vi.mock('../src/render/renderer', () => ({
  createRenderer: (canvas: HTMLCanvasElement): Renderer => ({
    canvas, resize: () => undefined, render: () => undefined, renderIdle: () => undefined, dispose: () => undefined,
  }),
}));
vi.mock('../src/ui/menus', () => ({
  createMenus: (_ctx: MenuContext): Menus => {
    let current: MenuScreen | null = null;
    return {
      show: (s: MenuScreen) => { current = s; }, hide: () => { current = null; }, current: () => current,
      navigate: () => undefined, update: () => undefined, refreshLanguage: () => undefined,
    };
  },
}));

function fakePad() {
  return {
    index: 0, id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', connected: true, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    vibrationActuator: { playEffect: vi.fn(() => Promise.resolve('complete')) },
  };
}

let pad: ReturnType<typeof fakePad>;
let session: Session;
let now = 0;
const frame = (): void => { now += 1000 / 60; session.frame(now); };

beforeEach(() => {
  pad = fakePad();
  vi.stubGlobal('window', {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    navigator: { getGamepads: () => [pad, null, null, null] },
  });
  session = createSession({} as HTMLCanvasElement, {} as HTMLElement, {} as HTMLElement);
  now = 1000;
});
afterEach(() => { session.input.dispose(); vi.unstubAllGlobals(); });

describe('raspão na sessão', () => {
  it('dois carros lado a lado que se encostam fazem o controle do humano vibrar (e não há batida em fila no meio)', async () => {
    session.input.bindSeat(0, 'gp0');
    session.startQuick('copacabana', 2, [human(0)]);
    session.debugStep(60 * 6);
    const state = session.race!.state;
    expect(state.phase).toBe('racing');
    const me = state.cars.find((c) => c.seat === 0)!;
    const other = state.cars.find((c) => c.seat < 0)!;
    // Lado a lado, sobrepostos na lateral, na mesma velocidade e longe de todo o resto.
    state.cars.filter((c) => c !== me && c !== other).forEach((c, i) => { c.z = (me.z + 20_000 + i * 2000) % state.trackLength; });
    me.x = -0.1; other.x = 0.1; other.z = me.z; me.speed = other.speed = carStats(me).topSpeed * 0.5;
    me.skidTicks = other.skidTicks = 0; me.collisionCooldown = other.collisionCooldown = 0;
    // O pulso da largada (0,55 por 220 ms, em tempo de relógio) ainda abafaria um toque mais fraco: espera ele acabar.
    await new Promise((resolve) => setTimeout(resolve, 300));
    pad.vibrationActuator.playEffect.mockClear();
    session.debugStep(1);
    expect(state.events.some((e) => e.type === 'collision' && (e.carId === me.id || e.otherId === me.id)), 'sem batida em fila: o contato é de lado').toBe(false);
    expect(pad.vibrationActuator.playEffect).toHaveBeenCalled();
  });
});

describe('o rival fala na pista', () => {
  it('numa copa com rival, ele se apresenta logo depois da largada (texto de rivalLine, com o nome na frente)', () => {
    session.startCup('br_rj', [human(0)]);
    const rival = rivalByName('Zé Turbo');
    expect(session.race!.state.config.rival).toBe('Zé Turbo');
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 9; i++) {
      frame();
      for (const m of session.race!.messages.get(0) ?? []) if (m.kind === 'info') seen.add(m.text);
    }
    expect([...seen]).toContain(`Zé Turbo: ${rivalLine(rival, 'intro')}`);
  });

  it('corrida rápida (sem rival) não tem fala', () => {
    session.startQuick('copacabana', 2, [human(0)]);
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 9; i++) {
      frame();
      for (const m of session.race!.messages.get(0) ?? []) seen.add(m.text);
    }
    expect([...seen].filter((t) => t.includes(': '))).toEqual([]);
  });
});
