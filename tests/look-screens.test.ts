// O editor do visual do carro (N3, src/ui/screens/paint.ts: lookEditor) no lobby: a linha "Visual" abre o editor no lugar do cartão do assento,
// navegado só pelo dispositivo daquele assento (↑↓ anda, ←→ muda o campo e grava no save, Voltar fecha e devolve o foco). DOM falso mínimo
// (o mesmo de tests/paint-screens.test.ts); o resto é o código de verdade.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARS } from '../src/core/data/cars';
import { DEFAULT_SETTINGS, type DeviceId, type InputProvider, type MenuNav, type SaveData, type Settings } from '../src/game/contracts';
import { FINISH_IDS, LOOK_FIELDS, parseLook, WHEEL_LISTS } from '../src/game/cosmetics';
import { seatLook, seatPaint } from '../src/game/paints';
import { sanitizeSave } from '../src/game/save';
import '../src/ui/strings';
import { lookOptionLabel, lookSummary } from '../src/ui/screens/paint';
import type { LobbyState, ScreenApi, ScreenInstance } from '../src/ui/screens/common';
import { lobbyScreen } from '../src/ui/screens/lobby';
import { setLanguage, t } from '../src/i18n';

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

function one(root: unknown, pred: (el: FakeEl) => boolean): FakeEl {
  const found = all(root, pred);
  expect(found).toHaveLength(1);
  return found[0];
}

const hasClass = (cls: string) => (el: FakeEl) => el.className.split(/\s+/).includes(cls);
const text = (el: unknown): string => (el instanceof FakeEl ? el.textContent + el.children.map(text).join('') : typeof el === 'object' && el && 'text' in el ? String((el as { text: string }).text) : '');

function fakeInput(bound: Array<DeviceId | null>, leaves: DeviceId[] = []): InputProvider {
  const nav: MenuNav = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, device: null };
  return {
    poll() {}, readSeat: () => ({ steer: 0, throttle: false, brake: false, nitro: false, gearUp: false, gearDown: false }),
    bindSeat(seat, device) { bound[seat] = device; }, unbindSeat(seat) { bound[seat] = null; }, seatDevice: (s) => bound[s] ?? null,
    devices: () => [], joinPressed: () => null, leavePressed: () => leaves.shift() ?? null, menuNav: () => nav, pausePressed: () => -1, dispose() {},
    peek: () => null, rumble() {},
  };
}

function api(save: SaveData, bound: Array<DeviceId | null>, lobby: LobbyState, leaves: DeviceId[] = []): ScreenApi {
  const settings: Settings = { ...DEFAULT_SETTINGS, seatAssists: [...DEFAULT_SETTINGS.seatAssists] };
  return {
    ctx: { cars: CARS, save, settings, input: fakeInput(bound, leaves), cups: [], tracks: [] },
    lobby,
    go: () => undefined, back: () => undefined, emit: () => undefined, sfx: () => undefined, refresh: () => undefined,
  } as unknown as ScreenApi;
}

const NAV: MenuNav = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, device: null };
function press(screen: ScreenInstance, device: DeviceId, key: 'up' | 'down' | 'left' | 'right' | 'confirm'): void {
  screen.nav({ ...NAV, [key]: true, device });
}

beforeEach(() => {
  vi.stubGlobal('document', {
    activeElement: null,
    createElement: (tag: string) => new FakeEl(tag),
    createElementNS: (_ns: string, tag: string) => new FakeEl(tag),
    createTextNode: (t: string) => ({ text: t }),
  });
});
afterEach(() => vi.unstubAllGlobals());


const EDITOR_ORDER = ['paint', 'color', 'accent', 'finish', 'wheel', 'rim', 'stripe', 'flame'] as const;

describe('lobby: o editor do visual do carro', () => {
  const lobbyState = (): LobbyState => ({ mode: 'quick', versus: false, seats: [null, null, null, null] });
  const setup = (bound: Array<DeviceId | null> = ['kb1', 'gp0', null, null], leaves: DeviceId[] = []) => {
    const save = sanitizeSave({});
    const screen = lobbyScreen(api(save, bound, lobbyState(), leaves));
    const slots = () => all(screen.el, hasClass('slot')).filter(hasClass('occupied'));
    return { save, screen, slots, bound, leaves };
  };
  const openEditor = (screen: ScreenInstance, device: DeviceId = 'kb1') => {
    press(screen, device, 'down'); // pintura
    press(screen, device, 'down'); // visual
    press(screen, device, 'confirm');
  };
  const editorOf = (slot: FakeEl) => one(slot, hasClass('look-editor'));
  const rowOf = (slot: FakeEl, field: string) => one(slot, (el) => el.getAttribute('data-field') === field);

  it('o cartão tem a linha "Visual" depois da pintura, com o resumo (De fábrica), e nenhum editor aberto', () => {
    const { slots } = setup();
    const btn = one(slots()[0], hasClass('btn-look'));
    expect(btn.textContent).toBe('Visual: De fábrica');
    expect(all(slots()[0], hasClass('look-editor'))).toHaveLength(0);
  });

  it('confirmar em "Visual" abre o editor no lugar do carro: 8 linhas na ordem dos campos, o cartão do outro assento intacto', () => {
    const { screen, slots } = setup();
    openEditor(screen);
    expect(hasClass('editing')(slots()[0])).toBe(true);
    const rows = all(editorOf(slots()[0]), hasClass('sel-look'));
    expect(rows.map((r) => r.getAttribute('data-field'))).toEqual([...EDITOR_ORDER]);
    expect(all(slots()[0], (el) => el.getAttribute('data-car') !== null && hasClass('car-card')(el))).toHaveLength(0); // as barras saíram
    expect(hasClass('editing')(slots()[1])).toBe(false);
    expect(all(slots()[1], hasClass('btn-look'))).toHaveLength(1);
  });

  it('cada campo: → muda e GRAVA no save do assento e do carro, a linha mostra o valor e o look continua válido para a rede', () => {
    const { save, screen, slots } = setup();
    openEditor(screen);
    LOOK_FIELDS.forEach((field, i) => {
      expect(rowOf(slots()[0], field).classList.contains('focus'), `foco em ${field}`).toBe(true);
      press(screen, 'kb1', 'right');
      const look = seatLook(save, 0, 'falcao');
      expect(look?.[field] ?? (field === 'paint' ? seatPaint(save, 0, 'falcao') : undefined), field).toBeDefined();
      expect(parseLook(look ?? {}, 'falcao'), `${field}: o look gravado passa no saneador estrito`).not.toBeNull();
      expect(rowOf(slots()[0], field).getAttribute('data-value'), field).toBe(String(look?.[field] ?? ''));
      if (i < LOOK_FIELDS.length - 1) press(screen, 'kb1', 'down');
    });
    const full = seatLook(save, 0, 'falcao');
    expect(Object.keys(full ?? {})).toEqual([...LOOK_FIELDS].filter((f) => f !== 'wheel' || full?.wheel)); // todos os campos mudaram do padrão
    expect(seatLook(save, 1, 'trovao')).toBeNull(); // o P2 não foi tocado
  });

  it('o acabamento anda pelo catálogo e a linha mostra o nome (PT e EN)', () => {
    const { screen, slots } = setup();
    openEditor(screen);
    press(screen, 'kb1', 'down'); press(screen, 'kb1', 'down'); press(screen, 'kb1', 'down'); // paint → color → accent → finish
    expect(text(rowOf(slots()[0], 'finish'))).toContain('Brilho');
    press(screen, 'kb1', 'right');
    expect(text(rowOf(slots()[0], 'finish'))).toContain('Metálico');
    expect(lookOptionLabel('finish', 'perolado')).toBe('Perolado');
    setLanguage('en');
    expect(lookOptionLabel('finish', 'perolado')).toBe('Pearl');
    expect(t('look.field.finish')).toBe('Finish');
    setLanguage('pt');
    for (const id of FINISH_IDS) expect(lookOptionLabel('finish', id)).not.toMatch(/^look\./);
  });

  it('só o dispositivo do assento mexe: o controle do P2 anda na lista dele enquanto o P1 edita', () => {
    const { save, screen, slots } = setup();
    openEditor(screen);
    press(screen, 'gp0', 'down'); // pintura do P2
    press(screen, 'gp0', 'right');
    expect(seatPaint(save, 1, 'trovao')).not.toBe('original');
    expect(seatPaint(save, 0, 'falcao')).toBe('original'); // o editor do P1 não recebeu o toque
    expect(hasClass('editing')(slots()[0])).toBe(true);
  });

  it('Voltar do controle (leavePressed) fecha o editor sem tirar o assento; o segundo Voltar tira', () => {
    const { screen, slots, leaves } = setup(['kb1', 'gp0', null, null], []);
    openEditor(screen);
    screen.update?.(0); // o primeiro quadro só arma a tela (a carência da borda que a abriu)
    leaves.push('kb1');
    screen.update?.(0);
    expect(slots()).toHaveLength(2); // o assento ficou
    expect(all(slots()[0], hasClass('look-editor'))).toHaveLength(0);
    leaves.push('kb1');
    screen.update?.(0);
    expect(slots()).toHaveLength(1); // o segundo Voltar saiu do assento
  });

  it('o botão Voltar do editor fecha e o foco volta para "Visual"', () => {
    const { screen, slots } = setup();
    openEditor(screen);
    for (let i = 0; i < EDITOR_ORDER.length; i++) press(screen, 'kb1', 'down'); // até o Voltar
    expect(one(slots()[0], hasClass('btn-look-back')).classList.contains('focus')).toBe(true);
    press(screen, 'kb1', 'confirm');
    expect(all(slots()[0], hasClass('look-editor'))).toHaveLength(0);
    expect(one(slots()[0], hasClass('btn-look')).classList.contains('focus')).toBe(true);
  });

  it('o resumo do cartão acompanha o look', () => {
    const { screen, slots } = setup();
    openEditor(screen);
    for (let i = 0; i < 3; i++) press(screen, 'kb1', 'down');
    press(screen, 'kb1', 'right'); // acabamento: metálico
    for (let i = 0; i < EDITOR_ORDER.length - 3; i++) press(screen, 'kb1', 'down');
    press(screen, 'kb1', 'confirm');
    expect(one(slots()[0], hasClass('btn-look')).textContent).toBe('Visual: Metálico');
    expect(lookSummary({ finish: 'cromado', wheel: 'mag', stripe: 'ab' })).toBe('Cromado +2');
    expect(lookSummary(null)).toBe('De fábrica');
    expect(lookSummary({ paint: 'rubi' })).toBe('De fábrica'); // a pintura tem o seletor próprio
  });

  it('com o PRONTO dado o editor não abre e nada muda', () => {
    const { save, screen, slots } = setup();
    press(screen, 'kb1', 'confirm'); // PRONTO
    press(screen, 'kb1', 'down'); press(screen, 'kb1', 'down');
    press(screen, 'kb1', 'confirm');
    expect(all(slots()[0], hasClass('look-editor'))).toHaveLength(0);
    expect(seatLook(save, 0, 'falcao')).toBeNull();
  });

  it('a roda oferecida é a da lista do estilo do carro: a picape (Tatu) anda pela dela, não pela do GT', () => {
    const save = sanitizeSave({ seatCars: ['tatu', 'trovao', 'tornado', 'camelo'] });
    const screen = lobbyScreen(api(save, ['kb1', null, null, null], lobbyState()));
    const slots = () => all(screen.el, hasClass('slot')).filter(hasClass('occupied'));
    openEditor(screen);
    for (let i = 0; i < 4; i++) press(screen, 'kb1', 'down'); // paint → color → accent → finish → wheel
    expect(rowOf(slots()[0], 'wheel').classList.contains('focus')).toBe(true);
    expect(rowOf(slots()[0], 'wheel').getAttribute('data-value')).toBe(WHEEL_LISTS.pickup[0]);
    press(screen, 'kb1', 'right');
    expect(seatLook(save, 0, 'tatu')?.wheel).toBe(WHEEL_LISTS.pickup[1]);
    expect(parseLook(seatLook(save, 0, 'tatu') ?? {}, 'tatu')).not.toBeNull();
  });
});
