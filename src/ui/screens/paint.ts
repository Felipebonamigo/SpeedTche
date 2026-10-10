// Pintura do carro nos menus: a amostra (cor + detalhe) e o seletor "Pintura ‹ ● Rubi ›" que o lobby, a garagem
// e a sala online usam (docs/CARROS.md, "Pintura"). ←→ (ou clique nas setas) percorrem a paleta; o desenho do
// carro da própria tela é a prévia. A marcação é nossa (nunca dado do usuário).
import type { CarDef, CarLook } from '../../core/types';
import '../../cosmetics/strings';
import {
  factoryColors, FLAME_COLORS, FREE_COLORS, lookColors, lookOptions, normalizeLook, ORIGINAL_PAINT, RIM_COLORS, type LookField,
} from '../../game/cosmetics';
import { paintColors, paintedCar } from '../../game/paints';
import { t } from '../../i18n';
import { arrowButton, button, h, type FocusItem, type ScreenApi, type Selector } from './common';
import { carSilhouette } from './icons';
import './paint.css';

/** Estilo da amostra: a cor e o detalhe da pintura (ou do look inteiro, com as cores livres); a Original mostra os do carro. */
export function swatchStyle(paint: string | CarLook | null | undefined, car: Pick<CarDef, 'color' | 'accent'>): string {
  const c = (typeof paint === 'string' || paint == null ? paintColors(paint) : lookColors(paint, factoryColors(car))) ?? { color: car.color, accent: car.accent ?? car.color };
  return `--paint:${c.color};--paint-accent:${c.accent}`;
}

/** Amostra redonda: a cor e, na diagonal, o detalhe. Aceita o id da paleta ou o look. */
export function paintSwatch(paint: string | CarLook | null | undefined, car: Pick<CarDef, 'color' | 'accent'>): HTMLElement {
  const id = typeof paint === 'string' || paint == null ? paint ?? ORIGINAL_PAINT : paint.paint ?? ORIGINAL_PAINT;
  return h('i', { class: 'paint-swatch', style: swatchStyle(paint, car), attrs: { 'aria-hidden': 'true', 'data-paint': id } });
}

export interface PaintSelectorOptions {
  /** Id da pintura à mostra agora. */
  current(): string;
  /** O carro que ela pinta (a Original mostra as cores dele). */
  car(): Pick<CarDef, 'color' | 'accent'>;
  /** ←/→: troca (e grava) a pintura; quem chama redesenha a prévia. */
  onAdjust(dir: -1 | 1): void;
  sfx?: ScreenApi['sfx'];
  /** Confirmar na linha (no lobby é PRONTO, como no carro); sem isto, avança uma. */
  onActivate?: () => void;
  cls?: string;
}

/** Linha "Pintura  ‹ ● Rubi ›" (um seletor como os outros, com a amostra antes do nome). */
export function paintSelector(o: PaintSelectorOptions): Selector {
  const swatch = h('i', { class: 'paint-swatch', attrs: { 'aria-hidden': 'true' } });
  const name = h('span', { class: 'paint-name' });
  const arrow = (dir: -1 | 1) => arrowButton(dir, () => { o.onAdjust(dir); sel.refresh(); o.sfx?.('move'); });
  const el = h('div', { class: `sel sel-paint ${o.cls ?? ''}`.trim() },
    h('span', { class: 'sel-label', text: t('ui.lobby.paint') }),
    h('span', { class: 'sel-box' }, arrow(-1), h('span', { class: 'sel-value paint-value' }, swatch, name), arrow(1)),
  );
  const sel: Selector = {
    el,
    adjust: (dir) => { o.onAdjust(dir); sel.refresh(); },
    activate: o.onActivate ?? (() => { o.onAdjust(1); sel.refresh(); }),
    refresh: () => {
      const id = o.current();
      swatch.setAttribute('style', swatchStyle(id, o.car()));
      name.textContent = t(`ui.paint.${id}`);
      el.setAttribute('data-paint', id);
      // Onde o rótulo some (garagem) ou o nome não cabe (3–4 pilotos), a dica do mouse diz qual é.
      el.setAttribute('title', `${t('ui.lobby.paint')}: ${name.textContent}`);
    },
  };
  sel.refresh();
  return sel;
}

// ───────────────────────────── O visual inteiro (N3) ─────────────────────────────

/** Os campos do editor, na ordem das linhas: a pintura da paleta, as duas cores livres, o acabamento, a roda, o aro, a faixa e a chama. */
export const EDITOR_FIELDS: readonly LookField[] = ['paint', 'color', 'accent', 'finish', 'wheel', 'rim', 'stripe', 'flame'];

/** Nome de uma opção de um campo do look (`value` '' = o padrão: "De fábrica" ou, nas cores livres, "Da pintura"). */
export function lookOptionLabel(field: LookField, value: string): string {
  switch (field) {
    case 'paint': return t(`ui.paint.${value || ORIGINAL_PAINT}`);
    case 'color': case 'accent': return value ? t('look.freeColor', { n: FREE_COLORS.indexOf(value) + 1 }) : t('look.fromPaint');
    case 'finish': return t(`look.finish.${value || 'brilho'}`);
    case 'wheel': return t(`look.wheel.${value}`);
    case 'rim': case 'stripe': case 'flame': return value ? t(`look.${field}.${value}`) : t('look.standard');
  }
}

/** O valor atual de um campo na forma das opções do seletor ('' = o padrão). */
function currentValue(field: LookField, look: CarLook | null | undefined, options: readonly string[]): string {
  const v = look?.[field];
  if (v === undefined || v === '') return field === 'paint' ? ORIGINAL_PAINT : field === 'finish' ? options[0] : field === 'wheel' ? options[0] : '';
  return v;
}

/** A cor da bolinha de um campo (null = sem bolinha): a escolhida ou, nas cores livres, a da pintura / do carro. */
function dotColor(field: LookField, look: CarLook | null | undefined, car: Pick<CarDef, 'color' | 'accent'>): string | null {
  const colors = lookColors(look, factoryColors(car)) ?? factoryColors(car);
  switch (field) {
    case 'paint': return colors.color;
    case 'color': return look?.color ?? colors.color;
    case 'accent': return look?.accent ?? colors.accent;
    case 'rim': return look?.rim === undefined ? null : look.rim === 'acento' ? colors.accent : RIM_COLORS[look.rim] ?? null;
    case 'flame': return look?.flame !== undefined && Object.hasOwn(FLAME_COLORS, look.flame) ? FLAME_COLORS[look.flame] : null;
    default: return null;
  }
}

/** Resumo do look numa linha ("Metálico +2"; "De fábrica" sem nada além da pintura). A pintura tem o seletor próprio e fica de fora. */
export function lookSummary(look: CarLook | null | undefined): string {
  const parts: string[] = [];
  for (const f of ['finish', 'wheel', 'stripe', 'rim', 'flame', 'color', 'accent'] as const) {
    const v = look?.[f];
    if (v) parts.push(lookOptionLabel(f, v));
  }
  if (parts.length === 0) return t('look.summary.none');
  return parts.length === 1 ? parts[0] : t('look.summary.more', { first: parts[0], n: parts.length - 1 });
}

export interface LookEditorOptions {
  /** O carro que o visual veste (as cores de fábrica e a lista de rodas dele). */
  car(): CarDef;
  /** O look à mostra agora (null = de fábrica). */
  look(): CarLook | null;
  /** ←/→ num campo: quem chama aplica (grava, publica) e o editor se redesenha. */
  onStep(field: LookField, dir: -1 | 1): void;
  /** O botão Voltar. */
  onClose(): void;
  sfx?: ScreenApi['sfx'];
  cls?: string;
}

export interface LookEditor {
  el: HTMLElement;
  /** Uma linha por campo e, por último, o Voltar: a lista de foco do assento troca para esta enquanto o editor está aberto. */
  items: FocusItem[];
  refresh(): void;
}

/**
 * O editor do visual do carro: a prévia (a silhueta na cor e no detalhe) e uma linha "Rótulo ‹ ● Valor ›" por campo do `CarLook`.
 * Navegado como o resto do cartão (↑↓ anda, ←→ muda, confirmar avança uma); quem o monta cuida do que mudar (save, sala).
 */
export function lookEditor(o: LookEditorOptions): LookEditor {
  const preview = h('div', { class: 'look-preview', attrs: { 'aria-hidden': 'true' } });
  const rows = EDITOR_FIELDS.map((field) => {
    const dot = h('i', { class: 'paint-swatch look-dot', attrs: { 'aria-hidden': 'true' } });
    const name = h('span', { class: 'look-name' });
    const arrow = (dir: -1 | 1) => arrowButton(dir, () => { o.onStep(field, dir); editor.refresh(); o.sfx?.('move'); });
    const el = h('div', { class: `sel sel-look sel-look-${field}` },
      h('span', { class: 'sel-label', text: t(`look.field.${field}`) }),
      h('span', { class: 'sel-box' }, arrow(-1), h('span', { class: 'sel-value look-value' }, dot, name), arrow(1)),
    );
    el.setAttribute('data-field', field);
    const item: FocusItem & { refresh(): void } = {
      el,
      adjust: (dir) => { o.onStep(field, dir); editor.refresh(); },
      activate: () => { o.onStep(field, 1); editor.refresh(); },
      refresh: () => {
        const car = o.car();
        const options = lookOptions(field, car.id);
        const value = currentValue(field, o.look(), options);
        name.textContent = lookOptionLabel(field, value);
        const c = dotColor(field, o.look(), car);
        dot.setAttribute('style', c ? `--paint:${c};--paint-accent:${c}` : 'display:none');
        el.setAttribute('data-value', value);
        el.setAttribute('title', `${t(`look.field.${field}`)}: ${name.textContent}`);
      },
    };
    return item;
  });
  const back = button(t('look.back'), () => o.onClose(), 'btn-look-back');
  const editor: LookEditor = {
    el: h('div', { class: `look-editor ${o.cls ?? ''}`.trim() }, preview, h('div', { class: 'look-rows' }, rows.map((r) => r.el)), back.el),
    items: [...rows, back],
    refresh() {
      const car = o.car();
      preview.replaceChildren(carSilhouette(paintedCar(car, normalizeLook(o.look(), car.id))));
      for (const r of rows) r.refresh();
    },
  };
  editor.refresh();
  return editor;
}
