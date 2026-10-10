// DOM falso mínimo para as telas de menu em Node (o mesmo de tests/garage-stage.test.ts e tests/fluxo-sem-atrito.test.ts, num arquivo só
// para os testes da N4). O que `h`, a lista de foco e as telas usam; nada de layout de verdade.
import { vi } from 'vitest';
import type { DeviceId, InputProvider, MenuNav } from '../src/game/contracts';

export class FakeEl {
  children: unknown[] = [];
  className = '';
  textContent = '';
  title = '';
  innerHTML = '';
  value = '';
  disabled = false;
  isConnected = true;
  scrollTop = 0;
  style: Record<string, unknown> & { setProperty(k: string, v: string): void } = { setProperty(k: string, v: string) { this[k] = v; } };
  dataset: Record<string, string> = {};
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
  setAttribute(k: string, v: string): void { this.attrs[k] = v; if (k === 'class') this.className = v; }
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
  querySelector(): null { return null; }
  focus(): void {}
  select(): void {}
  blur(): void {}
  closest(): null { return null; }
  /** Dispara o ouvinte de `click` como o navegador (o evento sem alvo, que a lista de foco aceita). */
  click(): void { for (const fn of this.listeners.click ?? []) fn({ target: undefined, clientX: 0, clientY: 0 }); }
}

export function all(root: unknown, pred: (el: FakeEl) => boolean, out: FakeEl[] = []): FakeEl[] {
  if (!(root instanceof FakeEl)) return out;
  if (pred(root)) out.push(root);
  for (const c of root.children) all(c, pred, out);
  return out;
}
export const hasClass = (cls: string) => (el: FakeEl) => el.className.split(/\s+/).includes(cls) || el.classList.contains(cls);
export const text = (el: unknown): string => (el instanceof FakeEl ? el.textContent + el.children.map(text).join('') : typeof el === 'object' && el && 'text' in el ? String((el as { text: string }).text) : '');

/** Instala o `document` falso; devolve a função que o tira (use no afterEach). */
export function installDocument(): void {
  // `blurActive` e `isTextField` (common.ts) conferem o elemento ativo com `instanceof`: as classes precisam existir.
  vi.stubGlobal('HTMLElement', class {});
  vi.stubGlobal('HTMLInputElement', class {});
  vi.stubGlobal('HTMLTextAreaElement', class {});
  vi.stubGlobal('document', {
    activeElement: null,
    createElement: (tag: string) => new FakeEl(tag),
    createElementNS: (_ns: string, tag: string) => new FakeEl(tag),
    createTextNode: (t: string) => ({ text: t }),
  });
}

export interface FakeGamepad { id: DeviceId; buttons: number[] }

export function fakeInput(bound: Array<DeviceId | null>, pads: FakeGamepad[] = []): InputProvider {
  const nav: MenuNav = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, device: null };
  return {
    poll() {}, readSeat: () => ({ steer: 0, throttle: false, brake: false, nitro: false, gearUp: false, gearDown: false }),
    bindSeat(seat, device) { bound[seat] = device; }, unbindSeat(seat) { bound[seat] = null; }, seatDevice: (s) => bound[s] ?? null,
    devices: () => pads.map((p) => ({ id: p.id, label: p.id, connected: true, boundSeat: null })),
    joinPressed: () => null, leavePressed: () => null, menuNav: () => nav, pausePressed: () => -1, dispose() {},
    peek: (id: DeviceId) => {
      const p = pads.find((x) => x.id === id);
      return p ? { steer: 0, throttle: false, brake: false, nitro: false, gearUp: false, gearDown: false, pause: false, buttons: [...p.buttons] } : null;
    },
    rumble() {},
  };
}

export const NAV: MenuNav = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, device: null };
