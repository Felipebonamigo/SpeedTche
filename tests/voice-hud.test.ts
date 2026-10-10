// A roda de frases e os balões na tela (src/voice/hud.ts, N6): overlay próprio sobre o HUD, com um DOM falso mínimo. O visual é
// conferido pela captura e pelo playtest-layout; aqui se confere que o estado de voz chega aos nós (docs/ondas/N/N6.md, §4.5).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../src/i18n';
import { viewportRects } from '../src/render/layout';
import { createVoiceHud, type VoiceHudView } from '../src/voice/hud';
import { TAUNT_COUNT, tauntText, type Balloon } from '../src/voice/voice';

class FakeEl {
  children: unknown[] = [];
  parent: FakeEl | null = null;
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
      animation: '',
    } as unknown as CSSStyleDeclaration;
  }
  get className(): string { return [...this.classes].join(' '); }
  set className(v: string) { this.classes.clear(); for (const c of v.split(/\s+/)) if (c) this.classes.add(c); }
  setAttribute(k: string, v: string): void { this.attrs[k] = v; }
  getAttribute(k: string): string | null { return this.attrs[k] ?? null; }
  appendChild<T>(c: T): T { if (c instanceof FakeEl) c.parent = this; this.children.push(c); return c; }
  append(...c: unknown[]): void { for (const x of c) this.appendChild(x); }
  remove(): void { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  style_(k: string): string { return this.style.getPropertyValue(k); }
}

function all(root: unknown, pred: (el: FakeEl) => boolean, out: FakeEl[] = []): FakeEl[] {
  if (!(root instanceof FakeEl)) return out;
  if (pred(root)) out.push(root);
  for (const c of root.children) all(c, pred, out);
  return out;
}
const has = (cls: string) => (el: FakeEl) => el.classList.contains(cls);
const textOf = (el: FakeEl): string => el.textContent + el.children.map((c) => (c instanceof FakeEl ? textOf(c) : '')).join('');
const SIZE = { width: 1280, height: 720 };

beforeEach(() => {
  vi.stubGlobal('document', { createElement: (tag: string) => new FakeEl(tag) });
  setLanguage('pt');
});
afterEach(() => vi.unstubAllGlobals());

const balloon = (over: Partial<Balloon> = {}): Balloon => ({ id: 1, seat: 0, name: 'Ana', color: '#ffd23f', text: 'Come poeira!', ttl: 2, total: 2, own: true, ...over });
function view(over: Partial<VoiceHudView> = {}): VoiceHudView {
  return {
    ...SIZE, viewports: [{ seat: 0, color: '#ffd23f', name: 'Ana' }], wheels: [null], balloons: [], paused: false, reduceEffects: false, ...over,
  };
}
function make() {
  const root = new FakeEl('div');
  const hud = createVoiceHud(root as unknown as HTMLElement);
  if (!hud) throw new Error('sem overlay de voz');
  return { root, hud };
}

describe('overlay de voz: criação', () => {
  it('sem DOM (Node) não existe; com DOM nasce no hudRoot e não aparece enquanto ninguém fala', () => {
    vi.unstubAllGlobals();
    expect(createVoiceHud({} as HTMLElement)).toBeNull();
    vi.stubGlobal('document', { createElement: (tag: string) => new FakeEl(tag) });
    const { root, hud } = make();
    expect(root.children).toHaveLength(1);
    hud.update(view());
    expect(all(root, has('vh-wheel')).every((w) => !w.classList.contains('open'))).toBe(true);
    expect(all(root, has('vh-balloon')).every((b) => !b.classList.contains('show'))).toBe(true);
  });

  it('dispose tira só o que criou', () => {
    const { root, hud } = make();
    hud.update(view());
    hud.dispose();
    expect(root.children).toHaveLength(0);
  });

  it('cada viewport local ganha o próprio retângulo, o mesmo do HUD (viewportRects)', () => {
    const { root, hud } = make();
    hud.update(view({ viewports: [{ seat: 0, color: '#fff', name: 'A' }, { seat: 1, color: '#000', name: 'B' }], wheels: [null, null] }));
    const rects = viewportRects(2, SIZE.width, SIZE.height);
    const vps = all(root, has('vh-vp'));
    expect(vps).toHaveLength(2);
    rects.forEach((r, i) => {
      expect(vps[i].style_('left')).toBe(`${r.x}px`);
      expect(vps[i].style_('top')).toBe(`${r.y}px`);
      expect(vps[i].style_('width')).toBe(`${r.w}px`);
      expect(vps[i].style_('height')).toBe(`${r.h}px`);
    });
  });
});

describe('overlay de voz: a roda', () => {
  it('aberta mostra as 8 frases com a marcada em destaque; fechada some', () => {
    const { root, hud } = make();
    hud.update(view({ wheels: [{ selected: 2, wait: 0 }] }));
    const wheel = all(root, has('vh-wheel'))[0];
    expect(wheel.classList.contains('open')).toBe(true);
    const items = all(root, has('vh-item'));
    expect(items).toHaveLength(TAUNT_COUNT);
    items.forEach((it, i) => {
      expect(textOf(it)).toContain(tauntText(i));
      expect(it.classList.contains('on'), `item ${i}`).toBe(i === 2);
      expect(it.getAttribute('aria-selected')).toBe(i === 2 ? 'true' : 'false');
    });
    expect(all(root, has('vh-hint'))[0].textContent).toContain('Marcha');
    hud.update(view({ wheels: [null] }));
    expect(wheel.classList.contains('open')).toBe(false);
  });

  it('nenhuma frase marcada: nenhum destaque', () => {
    const { root, hud } = make();
    hud.update(view({ wheels: [{ selected: -1, wait: 0 }] }));
    expect(all(root, has('vh-item')).filter((it) => it.classList.contains('on'))).toHaveLength(0);
  });

  it('no intervalo de 5 s mostra quanto falta (arredondado para cima) e marca a roda como em espera', () => {
    const { root, hud } = make();
    hud.update(view({ wheels: [{ selected: 0, wait: 3.2 }] }));
    const wheel = all(root, has('vh-wheel'))[0];
    expect(wheel.classList.contains('wait')).toBe(true);
    expect(textOf(all(root, has('vh-wait'))[0])).toContain('4');
    hud.update(view({ wheels: [{ selected: 0, wait: 0 }] }));
    expect(wheel.classList.contains('wait')).toBe(false);
    expect(textOf(all(root, has('vh-wait'))[0])).toBe('');
  });

  it('os textos acompanham o idioma', () => {
    const { root, hud } = make();
    hud.update(view({ wheels: [{ selected: 0, wait: 0 }] }));
    expect(textOf(all(root, has('vh-item'))[0])).toContain('Come poeira!');
    setLanguage('en');
    hud.update(view({ wheels: [{ selected: 0, wait: 0 }] }));
    expect(textOf(all(root, has('vh-item'))[0])).toContain('Eat my dust!');
    expect(textOf(all(root, has('vh-title'))[0])).toBe('Taunt');
  });
});

describe('overlay de voz: os balões', () => {
  it('o balão do próprio falante fica em cima do carro dele, no viewport dele', () => {
    const { root, hud } = make();
    hud.update(view({ balloons: [balloon()] }));
    const own = all(root, has('vh-own'))[0];
    expect(own.classList.contains('show')).toBe(true);
    expect(textOf(own)).toContain('Come poeira!');
    expect(all(root, has('vh-other')).every((o) => !o.classList.contains('show'))).toBe(true);
  });

  it('no viewport de outro jogador (e no de quem escuta online) o balão leva o nome e a cor do falante, no alto', () => {
    const { root, hud } = make();
    hud.update(view({
      viewports: [{ seat: 0, color: '#ffd23f', name: 'Ana' }, { seat: 1, color: '#3dd6ff', name: 'Bia' }], wheels: [null, null],
      balloons: [balloon({ seat: 0, name: 'Ana', text: 'Segura essa!' })],
    }));
    const vps = all(root, has('vh-vp'));
    const first = all(vps[0], has('vh-own'))[0];
    const second = all(vps[1], has('vh-other')).find((o) => o.classList.contains('show'));
    expect(first.classList.contains('show')).toBe(true);
    expect(second).toBeDefined();
    expect(textOf(second as FakeEl)).toContain('Ana');
    expect(textOf(second as FakeEl)).toContain('Segura essa!');
    expect((second as FakeEl).style_('--who')).toBe('#ffd23f');
    // O falante de outro computador (sem viewport aqui) e o rival da IA também entram nos viewports locais, pelo alto.
    hud.update(view({ balloons: [balloon({ seat: 3, name: 'Caio', own: false, text: 'Bom jogo!' }), balloon({ id: 2, seat: -1, name: 'Zé Turbo', own: false, text: 'Ha!', color: '#ff4d4d' })] }));
    const shown = all(root, has('vh-other')).filter((o) => o.classList.contains('show')).map(textOf);
    expect(shown.some((s) => s.includes('Caio') && s.includes('Bom jogo!'))).toBe(true);
    expect(shown.some((s) => s.includes('Zé Turbo') && s.includes('Ha!'))).toBe(true);
    expect(all(root, has('vh-own'))[0].classList.contains('show')).toBe(false);
  });

  it('só cabem 2 balões de outros no canto (mais que isso desce até o minimapa): ficam os mais novos', () => {
    const { root, hud } = make();
    hud.update(view({
      balloons: [balloon({ id: 1, seat: 1, name: 'Bia', own: false, text: 'Velho!' }), balloon({ id: 2, seat: 2, name: 'Caio', own: false, text: 'Meio!' }), balloon({ id: 3, seat: -1, name: 'Zé Turbo', own: false, text: 'Novo!' })],
    }));
    const shown = all(root, has('vh-other')).filter((o) => o.classList.contains('show')).map(textOf);
    expect(shown).toHaveLength(2);
    expect(shown.some((x) => x.includes('Novo!'))).toBe(true);
    expect(shown.some((x) => x.includes('Meio!'))).toBe(true);
    expect(shown.some((x) => x.includes('Velho!'))).toBe(false);
  });

  it('o balão some quando acaba o tempo e esmaece no último instante', () => {
    const { root, hud } = make();
    hud.update(view({ balloons: [balloon({ ttl: 2 })] }));
    const own = all(root, has('vh-own'))[0];
    expect(own.style_('opacity')).toBe('1');
    hud.update(view({ balloons: [balloon({ ttl: 0.15 })] }));
    expect(Number(own.style_('opacity'))).toBeCloseTo(0.5, 2);
    hud.update(view({ balloons: [] }));
    expect(own.classList.contains('show')).toBe(false);
  });

  it('na pausa nada aparece; com "reduzir efeitos" o balão não anima', () => {
    const { root, hud } = make();
    hud.update(view({ balloons: [balloon()], wheels: [{ selected: 1, wait: 0 }], paused: true }));
    expect(all(root, has('vh-own'))[0].classList.contains('show')).toBe(false);
    expect(all(root, has('vh-wheel'))[0].classList.contains('open')).toBe(false);
    hud.update(view({ balloons: [balloon()], reduceEffects: true }));
    expect(all(root, has('vh-vp'))[0].classList.contains('calm')).toBe(true);
  });

  it('o texto só é reescrito quando o balão muda (nenhum nó novo por quadro)', () => {
    const { root, hud } = make();
    hud.update(view({ balloons: [balloon()] }));
    const count = all(root, () => true).length;
    for (let i = 0; i < 30; i++) hud.update(view({ balloons: [balloon({ ttl: 2 - i * 0.05 })] }));
    expect(all(root, () => true).length).toBe(count);
  });

  it('leitor de tela: o balão diz quem falou e o quê', () => {
    const { root, hud } = make();
    hud.update(view({ balloons: [balloon()] }));
    expect(all(root, has('vh-own'))[0].getAttribute('aria-label')).toBe('Ana diz: Come poeira!');
  });
});
