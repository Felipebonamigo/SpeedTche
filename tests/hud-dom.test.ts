// O HUD de verdade (src/render/hud.ts) com um DOM falso mínimo: o que a onda L, L5, põe nele. Segundos para o carro da
// frente e o de trás, selo "+N" da ultrapassagem, faixa ÚLTIMA VOLTA, ícone de vácuo, combustível e nitro com número e
// rótulo (e não só a cor). O visual é conferido pelas capturas e pelo scripts/playtest-layout.mjs; aqui se confere que o
// que o estado diz chega aos nós.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../src/i18n';
import { SEGMENT_LENGTH } from '../src/core/constants';
import type { RenderFrame } from '../src/game/contracts';
import { Hud } from '../src/render/hud';
import { human, quickRace, run, skipCountdown } from './helpers';

class FakeEl {
  children: unknown[] = [];
  textContent = '';
  offsetWidth = 0;
  readonly attrs: Record<string, string> = {};
  private readonly classes = new Set<string>();
  private readonly styles = new Map<string, string>();
  readonly style: CSSStyleDeclaration;
  readonly classList = {
    add: (...c: string[]) => { for (const x of c) this.classes.add(x); },
    remove: (...c: string[]) => { for (const x of c) this.classes.delete(x); },
    toggle: (c: string, force?: boolean) => { const on = force ?? !this.classes.has(c); if (on) this.classes.add(c); else this.classes.delete(c); return on; },
    contains: (c: string) => this.classes.has(c),
  };
  constructor(readonly tag: string) {
    const styles = this.styles;
    this.style = {
      setProperty: (k: string, v: string) => { styles.set(k, v); },
      getPropertyValue: (k: string) => styles.get(k) ?? '',
      removeProperty: (k: string) => { styles.delete(k); },
      get display(): string { return styles.get('display') ?? ''; },
      set display(v: string) { styles.set('display', v); },
      animation: '',
    } as unknown as CSSStyleDeclaration;
  }
  get className(): string { return [...this.classes].join(' '); }
  set className(v: string) { this.classes.clear(); for (const c of v.split(/\s+/)) if (c) this.classes.add(c); }
  get lastChild(): unknown { return this.children[this.children.length - 1] ?? null; }
  setAttribute(k: string, v: string): void { this.attrs[k] = v; }
  getAttribute(k: string): string | null { return this.attrs[k] ?? null; }
  appendChild<T>(c: T): T { this.children.push(c); return c; }
  append(...c: unknown[]): void { this.children.push(...c); }
  remove(): void { /* sem pai guardado: o teste não desmonta */ }
  addEventListener(): void { /* não usado */ }
}

function all(root: unknown, pred: (el: FakeEl) => boolean, out: FakeEl[] = []): FakeEl[] {
  if (!(root instanceof FakeEl)) return out;
  if (pred(root)) out.push(root);
  for (const c of root.children) all(c, pred, out);
  return out;
}
const has = (cls: string) => (el: FakeEl) => el.classList.contains(cls);
function one(root: FakeEl, cls: string): FakeEl {
  const found = all(root, has(cls));
  expect(found, `o nó .${cls}`).toHaveLength(1);
  return found[0];
}
const textOf = (el: FakeEl): string => el.textContent + el.children.map((c) => (c instanceof FakeEl ? textOf(c) : typeof c === 'object' && c && 'text' in c ? String((c as { text: string }).text) : '')).join('');

beforeEach(() => {
  vi.stubGlobal('document', {
    createElement: (tag: string) => new FakeEl(tag),
    createElementNS: (_ns: string, tag: string) => new FakeEl(tag),
    createTextNode: (t: string) => ({ text: t }),
  });
  setLanguage('pt');
});
afterEach(() => vi.unstubAllGlobals());

/** Corrida de 4 carros já andando; o jogador (carro 0) está no 2º lugar, com um carro à frente e um atrás. */
function scene() {
  const { state, track } = quickRace({ humans: [human(0)], totalCars: 4, laps: 2 });
  skipCountdown(state, track);
  run(state, track, 200);
  const me = state.cars[0];
  const [a, b, c] = state.cars.filter((x) => x !== me);
  a.position = 1; a.progress = 56_000; a.speed = 6000;
  me.position = 2; me.progress = 50_000; me.speed = 3000; me.x = 0; me.z = 20_000;
  b.position = 3; b.progress = 47_000; b.speed = 6000; b.x = 0.9;
  c.position = 4; c.progress = 10_000; c.speed = 3000; c.x = -0.9;
  a.x = -0.9; a.z = 40_000; b.z = 17_000; c.z = 5000;
  let time = 5;
  const root = new FakeEl('div');
  const hud = new Hud(root as unknown as HTMLElement);
  const frame = (): RenderFrame => ({
    state, track, time, paused: false, coop: false, showHud: true,
    viewports: [{ seat: 0, carIndex: 0, color: '#ffd23f', name: 'P1', messages: [] }],
    options: { quality: 'high', showMinimap: true, screenShake: true, reduceEffects: false, palette: 'default' },
  });
  const draw = (advance = 0) => { time += advance; state.tick += Math.round(advance * 60); hud.update(frame(), 1280, 720); };
  return { state, track, me, others: { a, b, c }, root, hud, draw };
}

describe('HUD: segundos para o carro da frente e o de trás', () => {
  it('2º lugar mostra os dois tempos; o líder não mostra o da frente', () => {
    const s = scene();
    s.draw();
    expect(textOf(one(s.root, 'gap-ahead'))).toContain('2,0');
    expect(textOf(one(s.root, 'gap-behind'))).toContain('0,5');
    expect(one(s.root, 'gap-ahead').classList.contains('none')).toBe(false);
    s.me.position = 1; s.others.a.position = 2; s.me.progress = 70_000;
    s.draw(0.1);
    expect(one(s.root, 'gap-ahead').classList.contains('none')).toBe(true);
  });
});

describe('HUD: posição com mola', () => {
  it('ultrapassar põe o selo "+1" e o tom de ganho; perder põe "−1" e o tom de perda; depois de uns segundos some', () => {
    const s = scene();
    s.draw();
    s.me.position = 1; s.others.a.position = 2;
    s.draw(0.05);
    expect(one(s.root, 'pos').classList.contains('gain')).toBe(true);
    expect(textOf(one(s.root, 'pos-badge'))).toBe('+1');
    s.draw(3);
    expect(one(s.root, 'pos').classList.contains('gain')).toBe(false);
    expect(textOf(one(s.root, 'pos-badge'))).toBe('');
    s.me.position = 2; s.others.a.position = 1;
    s.draw(0.05);
    expect(one(s.root, 'pos').classList.contains('loss')).toBe(true);
    expect(textOf(one(s.root, 'pos-badge'))).toBe('−1');
  });
});

describe('HUD: faixa ÚLTIMA VOLTA', () => {
  it('aparece ao entrar na última volta e some depois da janela', () => {
    const s = scene();
    s.me.lap = 1;
    s.draw();
    expect(one(s.root, 'final-band').classList.contains('show')).toBe(false);
    s.me.lap = 2;
    s.draw(0.05);
    expect(one(s.root, 'final-band').classList.contains('show')).toBe(true);
    expect(textOf(one(s.root, 'final-band'))).toContain('ÚLTIMA VOLTA');
    s.draw(4);
    expect(one(s.root, 'final-band').classList.contains('show')).toBe(false);
  });
});

describe('HUD: ícone de vácuo', () => {
  it('liga com um carro logo à frente na mesma linha e desliga com ele longe', () => {
    const s = scene();
    s.others.a.z = s.me.z + SEGMENT_LENGTH * 3; s.others.a.x = s.me.x; s.others.a.speed = 3000; s.me.speed = 3000;
    s.draw();
    expect(one(s.root, 'draft').classList.contains('on')).toBe(true);
    expect(textOf(one(s.root, 'draft'))).toContain('VÁCUO');
    s.others.a.z = s.me.z + SEGMENT_LENGTH * 40;
    s.draw(1);
    expect(one(s.root, 'draft').classList.contains('on')).toBe(false);
  });
});

describe('HUD: combustível e nitro legíveis sem depender da cor', () => {
  it('o combustível traz o percentual, o nível e, quando baixo, o rótulo em texto', () => {
    const s = scene();
    s.me.fuel = 0.72;
    s.draw();
    expect(textOf(one(s.root, 'fuel-pct'))).toBe('72%');
    expect(one(s.root, 'fuel').getAttribute('data-level')).toBe('ok');
    expect(textOf(one(s.root, 'fuel-flag'))).toBe('');
    s.me.fuel = 0.2;
    s.draw(0.1);
    expect(one(s.root, 'fuel').getAttribute('data-level')).toBe('low');
    expect(textOf(one(s.root, 'fuel-flag'))).toBe('BAIXO');
  });

  it('o nitro traz o número de cargas e um raio por carga', () => {
    const s = scene();
    s.me.nitroLeft = 2;
    s.draw();
    expect(textOf(one(s.root, 'nitro-n'))).toBe('2');
    const caps = all(one(s.root, 'caps'), (e) => e.tag === 'i');
    expect(caps).toHaveLength(3);
    expect(caps.filter((c) => c.classList.contains('on'))).toHaveLength(2);
  });
});
