// A roda de frases e os balões de fala na tela (N6, docs/ondas/N/N6.md §4.5). Um overlay PRÓPRIO sobre o HUD, montado pela sessão
// no `hudRoot`: o renderizador (L2) e o HUD (N1) não são tocados, e os dois estilos (moderno e Retrô) o recebem igual. Um nó por
// viewport local, no mesmo retângulo e na mesma escala do HUD (`viewportRects`, `uiScale`). Os nós nascem uma vez; por quadro só
// mudam texto, classe e estilo (cada escrita é comparada antes). Sem DOM (Node, testes de sessão) não existe: `createVoiceHud` → null.
import './hud.css';
import { t } from '../i18n';
import { uiScale, viewportRects, type Rect } from '../render/layout';
import './strings';
import { TAUNT_COUNT, tauntText, type Balloon } from './voice';

/** A roda de um jogador, como a tela a desenha: a frase marcada (-1 = nenhuma) e quantos segundos faltam para ele poder falar (0 = já pode). */
export interface WheelView { selected: number; wait: number }

export interface VoiceHudView {
  /** Tamanho da área do HUD (px CSS) e os viewports locais, na ordem de `RenderFrame.viewports`. */
  width: number;
  height: number;
  viewports: ReadonlyArray<{ seat: number; color: string; name: string }>;
  /** Por viewport (mesma ordem): a roda aberta, ou null. */
  wheels: ReadonlyArray<WheelView | null>;
  balloons: readonly Balloon[];
  paused: boolean;
  reduceEffects: boolean;
}

export interface VoiceHud {
  update(view: VoiceHudView): void;
  /** Esconde tudo (fora da corrida). */
  hide(): void;
  /** Tira só o que este overlay criou. */
  dispose(): void;
}

/** Quantos balões de outros falantes cabem empilhados no alto de um viewport. */
const OTHER_SLOTS = 3;
const FADE_SECONDS = 0.3;

function el(tag: string, cls: string, parent: HTMLElement): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}
function setText(e: HTMLElement, s: string): void { if (e.textContent !== s) e.textContent = s; }
function setClass(e: HTMLElement, cls: string, on: boolean): void { if (e.classList.contains(cls) !== on) e.classList.toggle(cls, on); }
function setStyle(e: HTMLElement, prop: string, value: string): void { if (e.style.getPropertyValue(prop) !== value) e.style.setProperty(prop, value); }
function setAttr(e: HTMLElement, name: string, value: string): void { if (e.getAttribute(name) !== value) e.setAttribute(name, value); }

/** Um balão: o nome de quem falou (só nos balões do alto) e o texto. */
class BalloonNode {
  readonly root: HTMLElement;
  private readonly who: HTMLElement;
  private readonly text: HTMLElement;
  private shownId = -1;

  constructor(parent: HTMLElement, cls: string, withName: boolean) {
    this.root = el('div', `vh-balloon ${cls}`, parent);
    this.who = el('b', 'vh-who', this.root);
    if (!withName) setStyle(this.who, 'display', 'none');
    this.text = el('span', 'vh-text', this.root);
    this.root.setAttribute('role', 'status');
  }

  show(b: Balloon | null): void {
    setClass(this.root, 'show', b !== null);
    if (!b) { this.shownId = -1; return; }
    if (b.id !== this.shownId) {
      this.shownId = b.id;
      setText(this.who, b.name);
      setText(this.text, b.text);
      setAttr(this.root, 'aria-label', t('voice.balloon.label', { name: b.name, text: b.text }));
      setStyle(this.root, '--who', b.color);
      // Reinicia a animação de entrada quando o balão é outro.
      this.root.style.animation = 'none'; void this.root.offsetWidth; this.root.style.animation = '';
    }
    setStyle(this.root, 'opacity', b.ttl < FADE_SECONDS ? Math.max(0, b.ttl / FADE_SECONDS).toFixed(2) : '1');
  }
}

class ViewportNodes {
  readonly root: HTMLElement;
  private readonly wheel: HTMLElement;
  private readonly title: HTMLElement;
  private readonly items: HTMLElement[] = [];
  private readonly hint: HTMLElement;
  private readonly wait: HTMLElement;
  private readonly own: BalloonNode;
  private readonly others: BalloonNode[] = [];

  constructor(parent: HTMLElement) {
    this.root = el('div', 'vh-vp', parent);
    this.wheel = el('div', 'vh-wheel', this.root);
    this.wheel.setAttribute('role', 'group');
    this.title = el('div', 'vh-title', this.wheel);
    const grid = el('div', 'vh-grid', this.wheel);
    grid.setAttribute('role', 'listbox');
    for (let i = 0; i < TAUNT_COUNT; i++) {
      const item = el('div', 'vh-item', grid);
      item.setAttribute('role', 'option');
      this.items.push(item);
    }
    this.wait = el('div', 'vh-wait', this.wheel);
    this.hint = el('div', 'vh-hint', this.wheel);
    this.own = new BalloonNode(this.root, 'vh-own', false);
    const top = el('div', 'vh-top', this.root);
    for (let i = 0; i < OTHER_SLOTS; i++) this.others.push(new BalloonNode(top, 'vh-other', true));
  }

  update(vp: { seat: number; color: string; name: string }, rect: Rect, wheel: WheelView | null, balloons: readonly Balloon[], calm: boolean): void {
    const r = this.root;
    setStyle(r, 'left', `${rect.x}px`); setStyle(r, 'top', `${rect.y}px`); setStyle(r, 'width', `${rect.w}px`); setStyle(r, 'height', `${rect.h}px`);
    setStyle(r, '--s', `calc(${uiScale(rect).toFixed(3)} * var(--hud-scale, 1))`); setStyle(r, '--accent', vp.color);
    setClass(r, 'calm', calm);
    // A roda: 8 frases, a marcada em destaque; no intervalo de 5 s diz quanto falta.
    setClass(this.wheel, 'open', wheel !== null);
    if (wheel) {
      setClass(this.wheel, 'wait', wheel.wait > 0);
      setText(this.title, t('voice.wheel.title'));
      setText(this.hint, t('voice.wheel.hint'));
      setText(this.wait, wheel.wait > 0 ? t('voice.wheel.wait', { s: Math.ceil(wheel.wait) }) : '');
      setAttr(this.wheel, 'aria-label', t('voice.wheel.label', { name: vp.name }));
      for (let i = 0; i < TAUNT_COUNT; i++) {
        setText(this.items[i], tauntText(i));
        setClass(this.items[i], 'on', i === wheel.selected);
        setAttr(this.items[i], 'aria-selected', i === wheel.selected ? 'true' : 'false');
      }
    }
    // Balões: o do próprio falante em cima do carro dele; os de outros (outro assento, outro computador, o rival) no alto.
    let own: Balloon | null = null;
    let k = 0;
    for (const b of balloons) {
      if (b.own && b.seat === vp.seat) { own = b; continue; }
      if (k < this.others.length) this.others[k++].show(b);
    }
    this.own.show(own);
    for (; k < this.others.length; k++) this.others[k].show(null);
  }
}

export function createVoiceHud(root: HTMLElement): VoiceHud | null {
  if (typeof document === 'undefined') return null;
  const base = el('div', 'vh-root', root);
  const viewports: ViewportNodes[] = [];
  return {
    update(view) {
      setClass(base, 'hidden', false);
      const n = Math.min(4, view.viewports.length);
      while (viewports.length < n) viewports.push(new ViewportNodes(base));
      const rects = viewportRects(n, view.width, view.height);
      for (let i = 0; i < viewports.length; i++) {
        const nodes = viewports[i];
        if (i >= n) { setStyle(nodes.root, 'display', 'none'); continue; }
        setStyle(nodes.root, 'display', 'block');
        nodes.update(view.viewports[i], rects[i], view.paused ? null : view.wheels[i] ?? null, view.paused ? [] : view.balloons, view.reduceEffects);
      }
    },
    hide() { setClass(base, 'hidden', true); },
    dispose() { base.remove(); viewports.length = 0; },
  };
}
