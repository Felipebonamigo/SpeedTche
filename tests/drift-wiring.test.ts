// A ligação da derrapagem na entrada do jogo (commit "ligação" da M1, fora da tabela do cronograma: docs/ondas/M/M1.md, §2):
// tecla/botão → `DeviceRaw.drift` → `PlayerInput.drift` (nível, não borda) e os nomes das 2 ações novas nos textos PT e EN.
// Roda em Node, sem DOM, com uma janela falsa.
import { describe, expect, it } from 'vitest';
import { setLanguage } from '../src/i18n';
import { closeEdges, createInput, EDGE_KEYS, mapGamepad, mapKeyboard, NEUTRAL_RAW, toPlayerInput } from '../src/ui/input';
import { DEFAULT_BINDINGS } from '../src/ui/remap/bindings';
import { actionLabel } from '../src/ui/remap/labels';

const keys = (...codes: string[]) => new Set(codes);
function buttons(...pressed: number[]): boolean[] {
  const b = new Array<boolean>(17).fill(false);
  for (const i of pressed) b[i] = true;
  return b;
}

function fakeWindow() {
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  const target = {
    addEventListener: (type: string, fn: (e: unknown) => void) => { listeners.set(type, [...(listeners.get(type) ?? []), fn]); },
    removeEventListener: (type: string, fn: (e: unknown) => void) => { listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)); },
    navigator: { getGamepads: () => [] },
  };
  const key = (type: 'keydown' | 'keyup', code: string) => {
    const e = { code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: null, preventDefault: () => undefined };
    for (const fn of listeners.get(type) ?? []) fn(e);
  };
  return { target: target as unknown as Window, down: (code: string) => key('keydown', code), up: (code: string) => key('keyup', code) };
}

describe('derrapar na entrada: do botão ao PlayerInput', () => {
  it('teclado: o Shift direito derrapa no teclado 1 e o Shift esquerdo no teclado 2; um não aciona o outro', () => {
    expect(mapKeyboard(keys('ShiftRight'), 'kb1').drift).toBe(true);
    expect(mapKeyboard(keys('ShiftRight'), 'kb2').drift).toBe(false);
    expect(mapKeyboard(keys('ShiftLeft'), 'kb2').drift).toBe(true);
    expect(mapKeyboard(keys('ShiftLeft'), 'kb1').drift).toBe(false);
    expect(mapKeyboard(keys('ArrowUp', 'Space'), 'kb1').drift).toBe(false);
    // Os dois teclados ao mesmo tempo: cada um lê só a sua tecla.
    const both = keys('ShiftRight', 'ShiftLeft', 'ArrowUp', 'KeyW');
    expect(mapKeyboard(both, 'kb1')).toMatchObject({ drift: true, throttle: true });
    expect(mapKeyboard(both, 'kb2')).toMatchObject({ drift: true, throttle: true });
  });

  it('gamepad: RB derrapa, LB e Y são o nitro, o D-pad ↑/↓ troca de marcha; R3 não aciona nada de pilotagem', () => {
    expect(mapGamepad(buttons(5), [])).toMatchObject({ drift: true, nitro: false });
    expect(mapGamepad(buttons(4), [])).toMatchObject({ nitro: true, drift: false, gearDown: false });
    expect(mapGamepad(buttons(3), [])).toMatchObject({ nitro: true, gearUp: false });
    expect(mapGamepad(buttons(12), [])).toMatchObject({ gearUp: true, drift: false });
    expect(mapGamepad(buttons(13), [])).toMatchObject({ gearDown: true });
    const r3 = mapGamepad(buttons(11), []);
    expect(r3).toMatchObject({ drift: false, nitro: false, gearUp: false, gearDown: false, throttle: false, brake: false });
    expect(mapGamepad(buttons(5), [], DEFAULT_BINDINGS).drift).toBe(true);
  });

  it('derrapar é nível, não borda: segurado, continua verdadeiro quadro a quadro; o fechamento de bordas não o inclui', () => {
    expect((EDGE_KEYS as readonly string[]).includes('drift')).toBe(false);
    const held = { ...NEUTRAL_RAW, drift: true, throttle: true };
    const edges = closeEdges(held, held); // segurado nos dois quadros: nenhuma borda
    expect(toPlayerInput(held, edges)).toMatchObject({ drift: true, throttle: true, nitro: false });
    expect(toPlayerInput(NEUTRAL_RAW, closeEdges(held, NEUTRAL_RAW)).drift).toBe(false);
  });

  it('pelo provedor de entrada: a tecla segurada vira PlayerInput.drift a cada quadro e solta quando levanta', () => {
    const w = fakeWindow();
    const input = createInput(w.target);
    input.bindSeat(0, 'kb1');
    w.down('ShiftRight');
    for (let i = 0; i < 3; i++) { input.poll(); expect(input.readSeat(0).drift, `quadro ${i}`).toBe(true); }
    w.up('ShiftRight');
    input.poll();
    expect(input.readSeat(0).drift).toBe(false);
    input.dispose();
  });
});

describe('as 2 ações novas têm nome em PT e EN', () => {
  it('derrapar e olhar para trás', () => {
    setLanguage('pt');
    expect(actionLabel('drift')).toBe('Derrapar');
    expect(actionLabel('lookBack')).toBe('Olhar para trás');
    setLanguage('en');
    expect(actionLabel('drift')).toBe('Drift');
    expect(actionLabel('lookBack')).toBe('Look back');
    setLanguage('pt');
  });
});
