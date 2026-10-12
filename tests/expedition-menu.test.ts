// N5: o menu principal de 5 cartões, "Jogar livre", a Garagem (com a Concessionária) e o painel do próximo objetivo
// (docs/ondas/N/N5.md §6-C). DOM falso mínimo (o mesmo de tests/fluxo-sem-atrito.test.ts); o resto é o código de verdade.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChampionship } from '../src/core/championship';
import { newCareer } from '../src/core/career';
import { CARS } from '../src/core/data/cars';
import { CUPS } from '../src/core/data/cups';
import { TRACKS } from '../src/core/track/tracks';
import { DEFAULT_SETTINGS, type DeviceId, type InputProvider, type MenuEvent, type MenuNav, type MenuScreen, type RaceMode, type SaveData, type Settings } from '../src/game/contracts';
import { isCupUnlocked, sanitizeSave } from '../src/game/save';
import { setLanguage, t } from '../src/i18n';
import '../src/ui/strings';
import type { LobbyState, ScreenApi, ScreenInstance } from '../src/ui/screens/common';
import { freeScreen, garageHubScreen, mainScreen } from '../src/ui/screens/simple';
import { human } from './helpers';

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

/** O foco da lista mora no classList (createFocusList), não no className. */
const focused = (el: FakeEl) => el.classList.contains('focus');

const went: MenuScreen[] = [];
const events: MenuEvent[] = [];
let bound: Array<DeviceId | null> = [null, null, null, null];
let lobby: LobbyState;

function fakeInput(): InputProvider {
  const nav: MenuNav = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, device: null };
  return {
    poll() {}, readSeat: () => ({ steer: 0, throttle: false, brake: false, nitro: false, gearUp: false, gearDown: false }),
    bindSeat(seat, device) { bound[seat] = device; }, unbindSeat(seat) { bound[seat] = null; }, seatDevice: (s) => bound[s] ?? null,
    devices: () => [], joinPressed: () => null, leavePressed: () => null, menuNav: () => nav, pausePressed: () => -1, dispose() {},
    peek: () => null, rumble() {},
  };
}

function api(save: SaveData, isDesktop = false): ScreenApi {
  const settings: Settings = { ...DEFAULT_SETTINGS, seatAssists: [...DEFAULT_SETTINGS.seatAssists] };
  return {
    ctx: { cars: CARS, save, settings, input: fakeInput(), cups: CUPS, tracks: TRACKS, isDesktop, isCupUnlocked: (id: string) => isCupUnlocked(save, id, CUPS) },
    lobby,
    go: (screen: MenuScreen) => { went.push(screen); },
    back: () => { went.push('main'); },
    emit: (e: MenuEvent) => { events.push(e); },
    sfx: () => undefined,
    refresh: () => undefined,
  } as unknown as ScreenApi;
}

const NAV: MenuNav = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, device: null };
const press = (screen: ScreenInstance, device: DeviceId, key: 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back', times = 1): void => {
  for (let i = 0; i < times; i++) screen.nav({ ...NAV, [key]: true, device });
};

beforeEach(() => {
  went.length = 0; events.length = 0;
  bound = [null, null, null, null];
  lobby = { mode: 'quick', versus: false, seats: [null, null, null, null] } as LobbyState;
  setLanguage('pt');
  vi.stubGlobal('document', {
    activeElement: null,
    createElement: (tag: string) => new FakeEl(tag),
    createElementNS: (_ns: string, tag: string) => new FakeEl(tag),
    createTextNode: (t: string) => ({ text: t }),
  });
});
afterEach(() => { vi.unstubAllGlobals(); setLanguage('pt'); });

const FREE_CUP = () => {
  const humans = [{ seat: 0, name: 'P1', carId: 'falcao', teamId: 0, color: '#fff' }];
  const champ = createChampionship('br_rj', [human(0)]);
  champ.raceIndex = 1;
  return { champ, cupSeed: 11, humans };
};
const withCareer = (extra: Record<string, unknown> = {}) => sanitizeSave({ career: newCareer([human(0, 0)]), ...extra });
const onlyCup = () => sanitizeSave({ cupInProgress: FREE_CUP() });
const cards = (screen: ScreenInstance) => one(screen.el, hasClass('menu-list')).children as FakeEl[];
const corner = (screen: ScreenInstance) => one(screen.el, hasClass('main-corner')).children as FakeEl[];
const labelOf = (el: FakeEl) => el.textContent;

describe('menu principal: cinco cartões e um canto', () => {
  it('são exatamente 5 cartões, na ordem do enunciado, e o resto vai para o canto', () => {
    const screen = mainScreen(api(sanitizeSave({})));
    expect(cards(screen).map(labelOf)).toEqual(['Expedição', 'Jogar junto', 'Jogar livre', 'Garagem', t('passport.menu')]);
    expect(corner(screen).map(labelOf)).toEqual([t('ui.main.records'), t('tutorial.menu'), t('ui.main.options'), t('ui.main.controls'), t('ui.main.credits')]);
    expect(all(screen.el, hasClass('btn-card'))).toHaveLength(5);
  });

  it('no Electron o canto ganha o Sair; no navegador não', () => {
    expect(corner(mainScreen(api(sanitizeSave({}), true))).map(labelOf)).toContain(t('ui.main.quit'));
    expect(corner(mainScreen(api(sanitizeSave({}), false))).map(labelOf)).not.toContain(t('ui.main.quit'));
  });

  it('1ª vez: um Enter no 1º cartão vai ao lobby de uma Expedição nova e senta o P1 com quem confirmou', () => {
    const screen = mainScreen(api(sanitizeSave({})));
    expect(focused(cards(screen)[0])).toBe(true);
    press(screen, 'gp0', 'confirm');
    expect(went).toEqual(['lobby']);
    expect(lobby.mode).toBe('career');
    expect(lobby.resume).toBe(false);
    expect(bound[0]).toBe('gp0');
  });

  it('com Expedição em andamento: o 1º cartão CONTINUA direto (lobby de "continuar", sem passar pelo resumo), e a dica diz onde parou', () => {
    const save = withCareer();
    const screen = mainScreen(api(save));
    press(screen, 'gp1', 'confirm');
    expect(went).toEqual(['lobby']);
    expect(lobby.mode).toBe('career');
    expect(lobby.resume).toBe(true);
    expect(bound[0]).toBe('gp1');
    expect(text(one(screen.el, hasClass('main-hint')))).toContain('corrida 1 de 3');
  });

  it('Expedição concluída: o 1º cartão abre o resumo (onde se começa outra), não um beco sem saída', () => {
    const career = newCareer([human(0, 0)]);
    career.completed = true;
    const screen = mainScreen(api(sanitizeSave({ career })));
    press(screen, 'kb1', 'confirm');
    expect(went).toEqual(['career']);
  });

  it('só campeonato salvo: o 1º cartão abre uma Expedição NOVA e a copa fica no save, intacta', () => {
    const save = onlyCup();
    const before = JSON.stringify(save.cupInProgress);
    const screen = mainScreen(api(save));
    press(screen, 'kb1', 'confirm');
    expect(went).toEqual(['lobby']);
    expect(lobby.mode).toBe('career');
    expect(lobby.resume).toBe(false);
    expect(JSON.stringify(save.cupInProgress)).toBe(before);
  });

  it('Jogar junto, Jogar livre, Garagem e Passaporte abrem as telas certas', () => {
    const expected: MenuScreen[] = ['party', 'free', 'garageHub', 'passport'];
    expected.forEach((s, i) => {
      went.length = 0;
      const screen = mainScreen(api(sanitizeSave({})));
      press(screen, 'kb1', 'down', i + 1);
      press(screen, 'kb1', 'confirm');
      expect(went).toEqual([s]);
    });
  });

  it('o cartão "Jogar livre" avisa da copa avulsa em andamento (só quando há)', () => {
    const badge = (save: SaveData) => all(mainScreen(api(save)).el, hasClass('card-badge')).map(text);
    expect(badge(onlyCup())).toEqual([t('expedition.card.free.badge')]);
    expect(badge(sanitizeSave({}))).toEqual([]);
  });

  it('foco: ↑↓ andam cartões, canto e o cartão da 1ª vez; → e ← saltam entre cartão e canto', () => {
    const screen = mainScreen(api(sanitizeSave({})));
    press(screen, 'kb1', 'up');
    expect(focused(one(screen.el, hasClass('tut-offer')))).toBe(true);
    press(screen, 'kb1', 'down');
    expect(focused(cards(screen)[0])).toBe(true);
    press(screen, 'kb1', 'right');
    expect(focused(corner(screen)[0])).toBe(true);
    press(screen, 'kb1', 'right');
    expect(focused(corner(screen)[1])).toBe(true);
    press(screen, 'kb1', 'left', 2);
    expect(focused(cards(screen)[0])).toBe(true);
    press(screen, 'kb1', 'down', 5);
    expect(focused(corner(screen)[0])).toBe(true); // ↓ depois do último cartão entra no canto
  });

  it('VOLTAR leva ao título; Opções, Controles e Créditos continuam a um Enter do canto', () => {
    const screen = mainScreen(api(sanitizeSave({ racesRun: 3 })));
    press(screen, 'kb1', 'back');
    expect(went).toEqual(['title']);
    went.length = 0;
    for (const [i, s] of ([[2, 'options'], [3, 'controls'], [4, 'credits']] as Array<[number, MenuScreen]>)) {
      const sc = mainScreen(api(sanitizeSave({ racesRun: 3 })));
      press(sc, 'kb1', 'right');
      press(sc, 'kb1', 'right', i);
      press(sc, 'kb1', 'confirm');
      expect(went.pop()).toBe(s);
    }
  });

  it.each(['kb1', 'kb2', 'gp0'] as DeviceId[])('Enter do dispositivo %s no 1º cartão senta o P1 com ele', (device) => {
    press(mainScreen(api(sanitizeSave({}))), device, 'confirm');
    expect(bound[0]).toBe(device);
  });
});

describe('menu principal: próximo objetivo e "Desde a última vez"', () => {
  const rows = (screen: ScreenInstance) => all(screen.el, hasClass('goal-row'));

  it('sem Expedição: três metas (curta, média, longa)', () => {
    const screen = mainScreen(api(sanitizeSave({})));
    expect(rows(screen).map(text)).toEqual([t('expedition.goal.startExpedition'), 'Vença a Copa Rio de Janeiro', 'Passaporte: 0 de 27 estados']);
  });

  it('solo: a curta é a próxima compra: "já dá para" com a carteira inicial (compra desde a 1ª corrida) e "faltam" quando não dá', () => {
    const rich = mainScreen(api(withCareer()));
    expect(rows(rich)).toHaveLength(3);
    expect(text(rows(rich)[0])).toBe('Já dá para: Tanque!');
    const career = newCareer([human(0, 0)]);
    career.wallets = [300];
    const poor = mainScreen(api(sanitizeSave({ career })));
    expect(text(rows(poor)[0])).toBe('Tanque: faltam $ 1.100');
  });

  it('versus: uma meta curta por piloto, com o assento, cada uma com a carteira dele', () => {
    const career = newCareer([human(0, 0), human(1, 1)]);
    career.wallets = [100, 9_000];
    const screen = mainScreen(api(sanitizeSave({ career })));
    const r = rows(screen);
    expect(r).toHaveLength(4);
    expect(text(r[0])).toContain('P1');
    expect(text(r[0])).toContain('faltam');
    expect(text(r[1])).toContain('P2');
    expect(text(r[1])).toContain('Já dá para');
  });

  it('co-op: uma meta curta, a do cofre', () => {
    const career = newCareer([human(0, 0), human(1, 0)]);
    const screen = mainScreen(api(sanitizeSave({ career })));
    expect(rows(screen)).toHaveLength(3);
    expect(all(screen.el, hasClass('goal-tag'))).toHaveLength(0);
  });

  it('o quadro "Desde a última vez" só existe com resumo', () => {
    const none = mainScreen(api(sanitizeSave({})));
    expect(all(none.el, hasClass('recap-box'))).toHaveLength(0);
    const snap = { at: '2026-10-10T20:00:00.000Z', racesRun: 5, racesWon: 1, stamps: 0, cupsCompleted: 0, achievements: 1, carsBought: 0, earned: 0 };
    const save = sanitizeSave({ recap: { before: snap, after: { ...snap, racesRun: 11, racesWon: 3, earned: 12_300 } } });
    const screen = mainScreen(api(save));
    const chips = all(screen.el, hasClass('recap-chip')).map(text);
    expect(chips).toEqual(['Corridas 6', 'Vitórias 2', 'Ganhou $ 12.300']);
  });

  it('resumo em que nada mudou não desenha o quadro', () => {
    const snap = { at: '2026-10-10T20:00:00.000Z', racesRun: 5, racesWon: 1, stamps: 0, cupsCompleted: 0, achievements: 1, carsBought: 0, earned: 0 };
    const screen = mainScreen(api(sanitizeSave({ recap: { before: snap, after: snap } })));
    expect(all(screen.el, hasClass('recap-box'))).toHaveLength(0);
  });

  it('em inglês os textos saem em inglês', () => {
    setLanguage('en');
    const screen = mainScreen(api(sanitizeSave({})));
    expect(cards(screen).map(labelOf).slice(0, 4)).toEqual(['Expedition', 'Play together', 'Free play', 'Garage']);
    expect(rows(screen).map(text)[0]).toBe('Start the Expedition and run the 1st race');
  });
});

describe('Jogar livre', () => {
  const items = (screen: ScreenInstance) => all(screen.el, hasClass('btn-main')).map(labelOf);
  const run = (save: SaveData, downs: number, device: DeviceId = 'kb1') => {
    const screen = freeScreen(api(save));
    press(screen, device, 'down', downs);
    press(screen, device, 'confirm');
  };

  it('sem copa salva: corrida rápida, contra-relógio, online e copa avulsa', () => {
    expect(items(freeScreen(api(sanitizeSave({}))))).toEqual(['Corrida rápida', 'Contra-relógio', 'Online', 'Copa avulsa']);
  });

  it('com copa salva, o "Continuar copa avulsa" vem primeiro e reabre o lobby em "continuar"', () => {
    const save = onlyCup();
    expect(items(freeScreen(api(save)))[0]).toBe('Continuar copa avulsa');
    run(save, 0, 'gp0');
    expect(went).toEqual(['lobby']);
    expect(lobby.mode).toBe('cup');
    expect(lobby.resume).toBe(true);
    expect(bound[0]).toBe('gp0');
  });

  it.each([[0, 'quick'], [1, 'timetrial'], [3, 'cup']] as Array<[number, RaceMode]>)('o item %i abre o lobby em %s (sem "continuar")', (down, mode) => {
    run(sanitizeSave({}), down);
    expect(went).toEqual(['lobby']);
    expect(lobby.mode).toBe(mode);
    expect(lobby.resume).toBe(false);
  });

  it('Online abre a tela online; VOLTAR volta ao menu', () => {
    run(sanitizeSave({}), 2);
    expect(went).toEqual(['online']);
    went.length = 0;
    press(freeScreen(api(sanitizeSave({}))), 'kb1', 'back');
    expect(went).toEqual(['main']);
  });
});

describe('Garagem (com a Concessionária dentro)', () => {
  const items = (screen: ScreenInstance) => all(screen.el, hasClass('btn-main')).map(labelOf);

  it('sem Expedição: só a Concessionária (vitrine), que continua acessível', () => {
    const screen = garageHubScreen(api(sanitizeSave({})));
    expect(items(screen)).toEqual(['Concessionária']);
    press(screen, 'gp1', 'confirm');
    expect(went).toEqual(['dealership']);
    expect(bound[0]).toBe('gp1'); // o menu principal desliga os assentos: o P1 senta com quem confirmou
  });

  it('com Expedição: Minha garagem (passa pelo lobby de "continuar"), Concessionária e o resumo (onde se começa outra Expedição)', () => {
    const save = withCareer();
    const screen = garageHubScreen(api(save));
    expect(items(screen)).toEqual(['Minha garagem', 'Concessionária', 'Resumo da Expedição']);
    press(screen, 'kb1', 'confirm');
    expect(went).toEqual(['lobby']);
    expect(lobby.mode).toBe('career');
    expect(lobby.resume).toBe(true);
    went.length = 0;
    const again = garageHubScreen(api(save));
    press(again, 'kb1', 'down');
    press(again, 'kb1', 'confirm');
    expect(went).toEqual(['dealership']);
    went.length = 0;
    const third = garageHubScreen(api(save));
    press(third, 'kb1', 'down', 2);
    press(third, 'kb1', 'confirm');
    expect(went).toEqual(['career']);
  });
});
