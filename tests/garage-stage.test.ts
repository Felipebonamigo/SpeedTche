// N2, palco 3D (docs/ondas/N/N2.md §6 "G" e "D"): a Garagem (os seus carros, peças e pintura) e a Concessionária (os carros à venda) como
// telas do palco 3D. DOM falso mínimo (o que `h`, a lista de foco e as telas usam, como o paint-screens.test.ts); o registro do palco
// (`stageBus`) é o de verdade e é ele que o teste lê: é por ele que a tela fala com o renderizador.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newCareer, ownsCar, walletOf, type CareerState } from '../src/core/career';
import { CARS } from '../src/core/data/cars';
import { DEFAULT_SETTINGS, type DeviceId, type InputProvider, type MenuNav, type SaveData, type Settings } from '../src/game/contracts';
import { PAINT_IDS, paintColors, seatLook, seatPaint, setSeatLook } from '../src/game/paints';
import { sanitizeSave } from '../src/game/save';
import { setLanguage, t } from '../src/i18n';
import { stageBus } from '../src/render/stage-bus';
import '../src/ui/strings';
import type { ScreenApi, ScreenInstance } from '../src/ui/screens/common';
import { dealershipScreen } from '../src/ui/screens/dealership';
import { garageScreen } from '../src/ui/screens/garage';
import { garageHubScreen, mainScreen } from '../src/ui/screens/simple';
import { human } from './helpers';

class FakeEl {
  children: unknown[] = [];
  className = '';
  textContent = '';
  title = '';
  innerHTML = '';
  value = '';
  disabled = false;
  style: Record<string, unknown> & { setProperty(k: string, v: string): void } = { setProperty(k: string, v: string) { this[k] = v; } };
  attrs: Record<string, string> = {};
  listeners: Record<string, Array<(ev: unknown) => void>> = {};
  parent: FakeEl | null = null;
  private readonly classes = new Set<string>();
  classList = {
    add: (...c: string[]) => { for (const x of c) this.classes.add(x); },
    remove: (...c: string[]) => { for (const x of c) this.classes.delete(x); },
    toggle: (c: string, force?: boolean) => { const on = force ?? !this.classes.has(c); if (on) this.classes.add(c); else this.classes.delete(c); return on; },
    contains: (c: string) => this.classes.has(c),
  };
  constructor(readonly tag: string) {}
  get content(): { firstElementChild: FakeEl } {
    const svg = new FakeEl('svg');
    svg.innerHTML = this.innerHTML;
    return { firstElementChild: svg };
  }
  setAttribute(k: string, v: string): void { this.attrs[k] = v; }
  getAttribute(k: string): string | null { return this.attrs[k] ?? null; }
  appendChild<T>(c: T): T { if (c instanceof FakeEl) { c.parent?.detach(c); c.parent = this; } this.children.push(c); return c; }
  private detach(c: FakeEl): void { this.children = this.children.filter((x) => x !== c); c.parent = null; }
  remove(): void { this.parent?.detach(this); }
  append(...c: unknown[]): void { for (const x of c) this.appendChild(x); }
  prepend(...c: unknown[]): void { this.children.unshift(...c); }
  replaceChildren(...c: unknown[]): void { this.children = []; for (const x of c) this.appendChild(x); }
  addEventListener(type: string, fn: (ev: unknown) => void): void { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(): void { /* não usado */ }
  getBoundingClientRect() { return { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }; }
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

function fakeInput(bound: Array<DeviceId | null>): InputProvider {
  const nav: MenuNav = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, device: null };
  return {
    poll() {}, readSeat: () => ({ steer: 0, throttle: false, brake: false, nitro: false, gearUp: false, gearDown: false }),
    bindSeat(seat, device) { bound[seat] = device; }, unbindSeat(seat) { bound[seat] = null; }, seatDevice: (s) => bound[s] ?? null,
    devices: () => [], joinPressed: () => null, leavePressed: () => null, menuNav: () => nav, pausePressed: () => -1, dispose() {},
    peek: () => null, rumble() {},
  };
}

interface Rig { save: SaveData; career: CareerState; screen: ScreenInstance; api: ScreenApi; events: unknown[]; went: string[]; backs: number[]; settings: Settings }

function rig(factory: (api: ScreenApi) => ScreenInstance, opts: { drivers?: number; versus?: boolean; settings?: Partial<Settings>; noCareer?: boolean; money?: number; owned?: string[] } = {}): Rig {
  const save = sanitizeSave({});
  const n = opts.drivers ?? 1;
  const humans = Array.from({ length: n }, (_, i) => human(i, opts.versus ? i : 0, ['falcao', 'trovao', 'tornado', 'camelo'][i]));
  const career = newCareer(humans);
  if (opts.money !== undefined) for (let i = 0; i < career.wallets.length; i++) career.wallets[i] = opts.money;
  if (opts.owned) career.drivers[0].garage.owned.push(...opts.owned);
  save.career = opts.noCareer ? null : career;
  const settings: Settings = { ...DEFAULT_SETTINGS, seatAssists: [...DEFAULT_SETTINGS.seatAssists], ...opts.settings };
  const bound: Array<DeviceId | null> = ['kb1', 'kb2', 'gp0', 'gp1'].slice(0, Math.max(1, n)) as DeviceId[];
  const events: unknown[] = []; const went: string[] = []; const backs: number[] = [];
  const api = {
    ctx: { cars: CARS, save, settings, input: fakeInput(bound), cups: [], tracks: [] },
    lobby: { mode: 'career', versus: false, seats: [null, null, null, null] },
    go: (s: string) => { went.push(s); }, back: () => { backs.push(1); }, emit: (e: unknown) => { events.push(e); }, sfx: () => undefined, refresh: () => undefined,
  } as unknown as ScreenApi;
  return { save, career, screen: factory(api), api, events, went, backs, settings };
}

const NAV: MenuNav = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, device: null };
const press = (r: Rig, device: DeviceId, key: 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back'): void => r.screen.nav({ ...NAV, [key]: true, device });
const panels = (r: Rig) => all(r.screen.el, hasClass('gp'));
const names = (r: Rig, seat = 0): string => text(all(panels(r)[seat], hasClass('gp-car-name-text'))[0]);
const tagText = (r: Rig, seat = 0): string => text(all(panels(r)[seat], hasClass('gp-tag'))[0] ?? null);
/** A silhueta SVG do carro (a do painel, não os ícones das setas): só existe dentro de `.gp-car-visual`. */
const silhouettes = (p: FakeEl): FakeEl[] => all(p, hasClass('gp-car-visual')).flatMap((v) => all(v, (el) => el.tag === 'svg' && el.innerHTML.includes('<path')));
const carName = (id: string): string => CARS.find((c) => c.id === id)?.name ?? id;

beforeEach(() => {
  stageBus.clear();
  setLanguage('pt');
  vi.stubGlobal('document', {
    activeElement: null,
    createElement: (tag: string) => new FakeEl(tag),
    createElementNS: (_ns: string, tag: string) => new FakeEl(tag),
    createTextNode: (t: string) => ({ text: t }),
  });
});
afterEach(() => { stageBus.clear(); vi.unstubAllGlobals(); setLanguage('pt'); });

describe('Garagem em 3D: a janela do palco no lugar do SVG', () => {
  it('3D: cada painel tem a janela do palco e NENHUM SVG de carro; o painel do palco existe no registro com o carro do piloto', () => {
    const r = rig(garageScreen, { drivers: 2 });
    const ps = panels(r);
    expect(ps).toHaveLength(2);
    for (const p of ps) {
      expect(all(p, hasClass('gp-stage'))).toHaveLength(1);
      expect(all(p, hasClass('gp-car-visual'))).toHaveLength(0);
      expect(silhouettes(p)).toHaveLength(0);
    }
    expect(stageBus.all().map((x) => x.id).sort()).toEqual(['garage:P1', 'garage:P2']);
    expect(stageBus.panel('garage:P1').carId).toBe('falcao');
    expect(stageBus.panel('garage:P2').carId).toBe('trovao');
  });

  it('Retrô: a silhueta SVG continua e não há janela de palco nem painel no registro', () => {
    const r = rig(garageScreen, { drivers: 2, settings: { renderStyle: 'retro' } });
    for (const p of panels(r)) {
      expect(all(p, hasClass('gp-stage'))).toHaveLength(0);
      expect(silhouettes(p)).toHaveLength(1);
    }
    expect(stageBus.all()).toHaveLength(0);
  });

  it('a tela leva a cor do assento, a qualidade das Opções e o "reduzir efeitos" para o painel', () => {
    const r = rig(garageScreen, { drivers: 2, settings: { quality: 'ultra', reduceEffects: true } });
    for (const id of ['garage:P1', 'garage:P2']) {
      const p = stageBus.panel(id);
      expect(p.quality).toBe('ultra');
      expect(p.reduceEffects).toBe(true);
    }
    expect(stageBus.panel('garage:P1').ring).not.toBe(stageBus.panel('garage:P2').ring);
    void r;
  });

  it('o painel do palco sobrevive a refazer o DOM: o mesmo painel, um host novo, e a lotação não cresce', () => {
    const r = rig(garageScreen, { drivers: 2 });
    const p1 = stageBus.panel('garage:P1');
    const host0 = p1.host;
    press(r, 'kb1', 'down'); // só o foco: não refaz
    press(r, 'kb1', 'up');
    press(r, 'kb1', 'right'); // troca de carro: refaz o DOM
    expect(stageBus.panel('garage:P1')).toBe(p1);
    expect(p1.host).not.toBe(host0);
    expect(stageBus.all()).toHaveLength(2);
  });

  it('sair da tela (destroy) solta os painéis do registro', () => {
    const r = rig(garageScreen, { drivers: 2 });
    expect(stageBus.all()).toHaveLength(2);
    r.screen.destroy?.();
    expect(stageBus.all()).toHaveLength(0);
  });
});

describe('Garagem: só os carros do piloto (a compra mudou para a Concessionária)', () => {
  it('←→ percorre os carros que o piloto tem: os 9 livres; nunca mostra "À VENDA" nem compra', () => {
    const r = rig(garageScreen, { money: 999_999 });
    const seen = new Set<string>();
    for (let i = 0; i < 16; i++) {
      seen.add(names(r));
      expect(tagText(r)).not.toContain(t('career.garage.forSale'));
      press(r, 'kb1', 'right');
    }
    const free = CARS.filter((c) => c.price === 0).map((c) => c.name.toUpperCase());
    expect([...seen].map((s) => s.toUpperCase()).sort()).toEqual(free.sort());
    expect(r.career.drivers[0].garage.owned).toEqual([]); // nada foi comprado
    expect(walletOf(r.career, 0)).toBe(999_999);
  });

  it('um carro comprado (na Concessionária) entra na volta da garagem', () => {
    const r = rig(garageScreen, { owned: ['curupira'] });
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) { seen.add(names(r).toUpperCase()); press(r, 'kb1', 'right'); }
    expect(seen.size).toBe(10);
    expect(seen.has(carName('curupira').toUpperCase())).toBe(true);
  });

  it('o carro à mostra vira o escolhido ao passar (como antes) e o painel do palco o acompanha', () => {
    const r = rig(garageScreen);
    expect(stageBus.panel('garage:P1').carId).toBe('falcao');
    press(r, 'kb1', 'right');
    const second = CARS.filter((c) => c.price === 0)[1];
    expect(r.career.drivers[0].garage.carId).toBe(second.id);
    expect(stageBus.panel('garage:P1').carId).toBe(second.id);
  });
});

describe('Garagem: oficina, foco e pintura no palco', () => {
  const down = (r: Rig, n: number): void => { for (let i = 0; i < n; i++) press(r, 'kb1', 'down'); };

  it('o item em foco vira o foco da câmera: peça → o nome dela; carro, pintura e PRONTO → nenhum', () => {
    const r = rig(garageScreen);
    const p = stageBus.panel('garage:P1');
    expect(p.focus).toBeNull();
    const order = ['engine', 'turbo', 'tires', 'brakes', 'tank', 'nitro'];
    for (const part of order) { down(r, 1); expect(p.focus, part).toBe(part); }
    down(r, 1); expect(p.focus, 'pintura').toBeNull();
    down(r, 1); expect(p.focus, 'PRONTO').toBeNull();
    down(r, 1); expect(p.focus, 'volta ao carro').toBeNull();
    down(r, 1); expect(p.focus, 'de novo o motor').toBe('engine');
    press(r, 'kb1', 'up'); expect(p.focus).toBeNull();
  });

  it('comprar peça: o dinheiro e o nível mudam como antes e a oficina dispara; sem dinheiro, não', () => {
    const r = rig(garageScreen);
    const p = stageBus.panel('garage:P1');
    down(r, 1); // motor
    press(r, 'kb1', 'confirm');
    const g = r.career.drivers[0].garage;
    expect(g.upgrades.falcao?.engine).toBe(1);
    expect(walletOf(r.career, 0)).toBe(100); // 2.500 − 2.400
    expect(p.workshopCount).toBe(1);
    expect(p.revealCount).toBe(0);
    press(r, 'kb1', 'confirm'); // 2º nível: 4.200 com 100 → sem dinheiro
    expect(g.upgrades.falcao?.engine).toBe(1);
    expect(p.workshopCount).toBe(1);
  });

  it('a pintura escolhida chega ao painel do palco, para o carro e o assento certos', () => {
    const r = rig(garageScreen, { drivers: 2 });
    down(r, 7); // a linha da pintura
    press(r, 'kb1', 'right');
    expect(seatPaint(r.save, 0, 'falcao')).toBe(PAINT_IDS[1]);
    expect(stageBus.panel('garage:P1').paint).toEqual(paintColors(PAINT_IDS[1]));
    expect(stageBus.panel('garage:P2').paint).toBeNull();
    // A janela leva a cor à mostra no DOM (o playtest-paint confere a prévia por ela, sem SVG): a pintura no 1º, a de fábrica no 2º.
    expect(all(panels(r)[0], hasClass('gp-stage'))[0].getAttribute('data-color')).toBe(paintColors(PAINT_IDS[1])?.color);
    expect(all(panels(r)[1], hasClass('gp-stage'))[0].getAttribute('data-color')).toBe(CARS.find((c) => c.id === 'trovao')?.color);
    press(r, 'kb1', 'left');
    expect(stageBus.panel('garage:P1').paint).toBeNull(); // a Original: as cores de fábrica
  });
});

describe('T8: a garagem mostra o visual inteiro, não só as cores', () => {
  const down = (r: Rig, n: number): void => { for (let i = 0; i < n; i++) press(r, 'kb1', 'down'); };
  const LOOK = { finish: 'cromado', wheel: 'mag', rim: 'dourado', stripe: 'nenhuma', flame: 'rosa' };

  it('acabamento, roda, aro, faixa e chama do assento chegam ao painel do palco (o look, além da pintura)', () => {
    const r = rig(garageScreen, { drivers: 2 });
    setSeatLook(r.save, 0, 'falcao', LOOK);
    down(r, 7); // a linha da pintura
    press(r, 'kb1', 'right'); // troca a pintura: a tela refaz o painel
    const p1 = stageBus.panel('garage:P1');
    expect(p1.look).toEqual(seatLook(r.save, 0, 'falcao'));
    expect(p1.look).toMatchObject({ ...LOOK, paint: PAINT_IDS[1] });
    expect(stageBus.panel('garage:P2').look).toBeNull(); // de fábrica
  });

  it('já na abertura da tela o painel leva o look gravado', () => {
    const r0 = rig(garageScreen);
    setSeatLook(r0.save, 0, 'falcao', LOOK);
    r0.screen.destroy?.();
    stageBus.clear();
    const again = garageScreen(r0.api);
    expect(stageBus.panel('garage:P1').look).toMatchObject(LOOK);
    again.destroy?.();
  });
});

describe('Concessionária: os carros à venda, a compra e a revelação', () => {
  const forSale = CARS.filter((c) => c.price > 0 && !c.conquest);

  it('mostra só os carros à venda (15, sem os de conquista), em ordem de preço, com o preço; o palco recebe o primeiro', () => {
    const r = rig(dealershipScreen);
    const seen: string[] = [];
    for (let i = 0; i < forSale.length; i++) { seen.push(names(r).toUpperCase()); press(r, 'kb1', 'right'); }
    expect(seen).toEqual(forSale.map((c) => c.name.toUpperCase()));
    expect(names(r).toUpperCase()).toBe(forSale[0].name.toUpperCase()); // deu a volta
    expect(stageBus.panel('dealership:P1').carId).toBe(forSale[0].id);
    expect(tagText(r)).toContain('7.000'); // o Jabuti abre a vitrine
  });

  it('sem dinheiro não compra, não muda a carreira e não revela', () => {
    const r = rig(dealershipScreen);
    press(r, 'kb1', 'confirm');
    expect(r.career.drivers[0].garage.owned).toEqual([]);
    expect(walletOf(r.career, 0)).toBe(2500);
    expect(stageBus.panel('dealership:P1').revealCount).toBe(0);
  });

  it('compra com dinheiro: igual ao buyCar (dinheiro, garagem, carro escolhido), o carro desbloqueia no lobby e a revelação dispara UMA vez', () => {
    const r = rig(dealershipScreen, { money: 50_000 });
    const car = forSale[0];
    press(r, 'kb1', 'confirm');
    const g = r.career.drivers[0].garage;
    expect(g.owned).toEqual([car.id]);
    expect(g.carId).toBe(car.id);
    expect(ownsCar(g, car.id)).toBe(true);
    expect(walletOf(r.career, 0)).toBe(50_000 - car.price);
    expect(r.save.carsUnlocked).toContain(car.id);
    expect(stageBus.panel('dealership:P1').revealCount).toBe(1);
    press(r, 'kb1', 'confirm'); // já é dele: nada de nova compra nem nova revelação
    expect(walletOf(r.career, 0)).toBe(50_000 - car.price);
    expect(stageBus.panel('dealership:P1').revealCount).toBe(1);
    expect(tagText(r)).toContain(t('career.garage.selected')); // comprado, o carro já vira o da pista (buyCar)
  });

  it('o preço e o "faltam" aparecem na etiqueta de quem não tem o dinheiro', () => {
    const r = rig(dealershipScreen);
    expect(tagText(r)).toContain('faltam');
  });

  it('com 2 pilotos, um painel e uma carteira por piloto; a compra de um não mexe no outro', () => {
    const r = rig(dealershipScreen, { drivers: 2, versus: true, money: 20_000 });
    expect(panels(r)).toHaveLength(2);
    expect(stageBus.all().map((p) => p.id).sort()).toEqual(['dealership:P1', 'dealership:P2']);
    press(r, 'kb2', 'confirm');
    expect(r.career.drivers[1].garage.owned).toEqual([forSale[0].id]);
    expect(r.career.drivers[0].garage.owned).toEqual([]);
    expect(walletOf(r.career, 0)).toBe(20_000);
    expect(walletOf(r.career, 1)).toBe(20_000 - forSale[0].price);
    expect(stageBus.panel('dealership:P2').revealCount).toBe(1);
    expect(stageBus.panel('dealership:P1').revealCount).toBe(0);
  });

  it('co-op: o dinheiro é um cofre só', () => {
    const r = rig(dealershipScreen, { drivers: 2, money: 20_000 });
    expect(r.career.coop).toBe(true);
    press(r, 'kb1', 'confirm');
    expect(walletOf(r.career, 0)).toBe(20_000 - forSale[0].price);
    expect(walletOf(r.career, 1)).toBe(20_000 - forSale[0].price);
  });

  it('sem carreira: vitrine só de ver — um painel, nada para comprar, e Enter não faz nada nem quebra', () => {
    const r = rig(dealershipScreen, { noCareer: true });
    expect(panels(r)).toHaveLength(1);
    expect(stageBus.panel('dealership:P1').carId).toBe(forSale[0].id);
    press(r, 'kb1', 'right');
    expect(stageBus.panel('dealership:P1').carId).toBe(forSale[1].id);
    expect(() => press(r, 'kb1', 'confirm')).not.toThrow();
    expect(r.save.career).toBeNull();
    expect(stageBus.panel('dealership:P1').revealCount).toBe(0);
    expect(text(r.screen.el)).toContain(t('dealership.viewOnly'));
  });

  it('a pintura se experimenta antes de comprar e vai ao palco', () => {
    const r = rig(dealershipScreen);
    press(r, 'kb1', 'down'); // pintura
    press(r, 'kb1', 'right');
    expect(stageBus.panel('dealership:P1').paint).toEqual(paintColors(PAINT_IDS[1]));
    expect(seatPaint(r.save, 0, forSale[0].id)).toBe(PAINT_IDS[1]);
  });

  it('Esc do P1 volta; sair solta os painéis; Retrô mantém a silhueta', () => {
    const r = rig(dealershipScreen);
    press(r, 'kb1', 'back');
    expect(r.backs).toHaveLength(1);
    r.screen.destroy?.();
    expect(stageBus.all()).toHaveLength(0);
    const retro = rig(dealershipScreen, { settings: { renderStyle: 'retro' } });
    expect(all(retro.screen.el, hasClass('gp-stage'))).toHaveLength(0);
    expect(silhouettes(all(retro.screen.el, hasClass('gp'))[0])).toHaveLength(1);
    expect(stageBus.all()).toHaveLength(0);
  });

  it('a revelação respeita o "reduzir efeitos" das opções (o painel recebe a marca)', () => {
    const r = rig(dealershipScreen, { money: 50_000, settings: { reduceEffects: true } });
    press(r, 'kb1', 'confirm');
    const p = stageBus.panel('dealership:P1');
    expect(p.reduceEffects).toBe(true);
    expect(p.revealCount).toBe(1);
  });
});

describe('Concessionária no menu principal', () => {
  // N5: o menu principal tem 5 cartões; a Concessionária mora dentro do cartão Garagem (um cartão + um Enter), com e sem Expedição.
  it('o cartão Garagem do menu principal abre o submenu, e dele a Concessionária abre a tela dela; PT e EN', () => {
    const main = rig(mainScreen);
    const cards = all(main.screen.el, hasClass('btn-card'));
    expect(cards.map((b) => b.textContent)).toContain('Garagem');
    for (let i = 0; i < cards.findIndex((b) => b.textContent === 'Garagem'); i++) press(main, 'kb1', 'down');
    press(main, 'kb1', 'confirm');
    expect(main.went).toEqual(['garageHub']);
    for (const noCareer of [true, false]) {
      const hub = rig(garageHubScreen, { noCareer });
      const buttons = all(hub.screen.el, (el) => el.tag === 'button' && hasClass('btn-main')(el));
      const label = t('dealership.menu');
      expect(label).toBe('Concessionária');
      const entry = buttons.findIndex((b) => b.textContent === label);
      expect(entry).toBeGreaterThanOrEqual(0);
      for (let i = 0; i < entry; i++) press(hub, 'kb1', 'down');
      press(hub, 'kb1', 'confirm');
      expect(hub.went).toEqual(['dealership']);
    }
    setLanguage('en');
    expect(t('dealership.menu')).toBe('Dealership');
    expect(t('expedition.garageHub.shop')).toBe('Dealership');
    expect(t('dealership.menu.hint')).not.toBe('dealership.menu.hint');
  });
});
