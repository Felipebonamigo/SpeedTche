// A ligação da buzina na entrada do jogo (N6, docs/ondas/N/N6.md §4.3 e §6 "Controles"): tecla/botão → `DeviceRaw.horn` →
// `PlayerInput.horn` (nível, não borda) e o nome da ação em PT e EN. Roda em Node, sem DOM, com uma janela falsa.
import { describe, expect, it } from 'vitest';
import { setLanguage } from '../src/i18n';
import { closeEdges, createInput, EDGE_KEYS, mapGamepad, mapKeyboard, NEUTRAL_RAW, toPlayerInput } from '../src/ui/input';
import { DEFAULT_BINDINGS } from '../src/ui/remap/bindings';
import { actionLabel, buttonLabel } from '../src/ui/remap/labels';

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

describe('buzinar na entrada: do botão ao PlayerInput', () => {
  it('teclado: H buzina no teclado 1 e G no teclado 2; um não aciona o outro', () => {
    expect(mapKeyboard(keys('KeyH'), 'kb1').horn).toBe(true);
    expect(mapKeyboard(keys('KeyH'), 'kb2').horn).toBe(false);
    expect(mapKeyboard(keys('KeyG'), 'kb2').horn).toBe(true);
    expect(mapKeyboard(keys('KeyG'), 'kb1').horn).toBe(false);
    expect(mapKeyboard(keys('ArrowUp', 'Space', 'ShiftRight'), 'kb1').horn).toBe(false);
    const both = keys('KeyH', 'KeyG', 'ArrowUp', 'KeyW');
    expect(mapKeyboard(both, 'kb1')).toMatchObject({ horn: true, throttle: true });
    expect(mapKeyboard(both, 'kb2')).toMatchObject({ horn: true, throttle: true });
  });

  it('controle: o L3 (botão 10) buzina e não aciona mais nada; o R3 segue sendo o olhar para trás, sem buzinar', () => {
    expect(mapGamepad(buttons(10), [])).toMatchObject({ horn: true, nitro: false, drift: false, gearUp: false, gearDown: false, throttle: false, brake: false });
    expect(mapGamepad(buttons(11), []).horn).toBe(false);
    expect(mapGamepad(buttons(5), []).horn).toBe(false);
    expect(mapGamepad(buttons(10), [], DEFAULT_BINDINGS).horn).toBe(true);
  });

  it('o mapeamento remapeado vale: a buzina no botão X (2) do controle', () => {
    const bindings = { ...DEFAULT_BINDINGS, gamepad: { ...DEFAULT_BINDINGS.gamepad, horn: [2], brake: [1, 6] } };
    expect(mapGamepad(buttons(2), [], bindings).horn).toBe(true);
    expect(mapGamepad(buttons(10), [], bindings).horn).toBe(false);
  });

  it('buzinar é nível, não borda: segurada, fica verdadeira quadro a quadro; o fechamento de bordas não a inclui', () => {
    expect((EDGE_KEYS as readonly string[]).includes('horn')).toBe(false);
    const held = { ...NEUTRAL_RAW, horn: true, throttle: true };
    expect(toPlayerInput(held, closeEdges(held, held))).toMatchObject({ horn: true, throttle: true, nitro: false });
    expect(toPlayerInput(NEUTRAL_RAW, closeEdges(held, NEUTRAL_RAW)).horn).toBe(false);
  });

  it('pelo provedor de entrada: a tecla segurada vira PlayerInput.horn a cada quadro e solta quando levanta', () => {
    const w = fakeWindow();
    const input = createInput(w.target);
    input.bindSeat(0, 'kb1');
    w.down('KeyH');
    for (let i = 0; i < 3; i++) { input.poll(); expect(input.readSeat(0).horn, `quadro ${i}`).toBe(true); }
    w.up('KeyH');
    input.poll();
    expect(input.readSeat(0).horn).toBe(false);
    input.dispose();
  });

  it('o assento sem dispositivo e o neutro não buzinam', () => {
    const w = fakeWindow();
    const input = createInput(w.target);
    input.poll();
    expect(input.readSeat(2).horn ?? false).toBe(false);
    input.dispose();
  });
});

describe('a buzina tem nome em PT e EN', () => {
  it('a ação e o botão padrão', () => {
    setLanguage('pt');
    expect(actionLabel('horn')).toBe('Buzina');
    setLanguage('en');
    expect(actionLabel('horn')).toBe('Horn');
    setLanguage('pt');
    // O L3 aparece com o nome do estilo do controle (LS no Xbox, L3 no PlayStation).
    expect(buttonLabel(10, 'xbox')).toBe('LS');
    expect(buttonLabel(10, 'playstation')).toBe('L3');
  });
});
