// Telas do progresso que fica (O5, docs/ondas/O/O5.md §4.6–§4.7): a linha do cadeado do carro trancado (lobby, festa, online), a aba "Nível"
// dos Recordes e a faixa de progresso do resultado. Só DOM e texto: as contas são de src/game/progression.ts. O estilo VISUAL (cor, ícone,
// moldura) é do tema da interface (nc/menu-estilos); progress.css só tem o mínimo de estrutura para o texto caber.
import '../../career/strings';
import '../../cosmetics/strings';
import '../../progress/strings';
import { CARS } from '../../core/data/cars';
import type { CarDef } from '../../core/types';
import { carAvailable } from '../../game/career-save';
import type { SaveData } from '../../game/contracts';
import {
  carXp, FRAMES, levelOf, MASTERY_REWARDS, masteryOf, MAX_MASTERY, pilotOf, TITLES, type ProgressNews, type Unlock,
} from '../../game/progression';
import { getLanguage, t } from '../../i18n';
import { h, type FocusItem, type ScreenApi } from './common';
import { icon } from './icons';
import { lookOptionLabel } from './paint';
import './progress.css';

/** "$ 12.000" / "$12,000" (a conta de garage.ts `formatMoney`, que não se importa daqui porque a garagem puxa o palco 3D). */
export function formatPrice(v: number): string {
  return t('career.money', { v: Math.round(v).toLocaleString(getLanguage() === 'pt' ? 'pt-BR' : 'en-US') });
}

/** O carro está trancado para este save? (o inverso de `carAvailable`: livre ou comprado numa Expedição deste computador). */
export function carLocked(save: Pick<SaveData, 'carsUnlocked'>, car: Pick<CarDef, 'id' | 'price'>): boolean {
  return !carAvailable(save, car);
}

/** "Compre na Expedição por $ 12.000". */
export function lockText(car: Pick<CarDef, 'price'>): string {
  return t('progress.lock.buy', { price: formatPrice(car.price) });
}

/**
 * A linha do cadeado no lugar da pintura (cartão do lobby): o mesmo lugar e a mesma classe-base do seletor de pintura, para o cartão não
 * mudar de altura; ←→ nela troca o carro (`adjust`) e confirmar recusa (`activate`). Sem setas: o texto precisa da largura.
 */
export function lockRow(car: Pick<CarDef, 'price'>, adjust: (dir: -1 | 1) => void, refuse: () => void): FocusItem {
  const text = lockText(car);
  const el = h('div', { class: 'sel sel-paint sel-lock', attrs: { 'data-locked': '1', title: text, 'aria-label': `${t('progress.lock.label')}: ${text}` } },
    h('span', { class: 'sel-label lock-icon' }, icon('lock')),
    h('span', { class: 'sel-box lock-box' }, h('span', { class: 'sel-value lock-value', text })),
  );
  return { el, adjust, activate: refuse };
}

/** Uma nota (não focável) com o cadeado e o texto: na sala online, abaixo do seletor de carro. */
export function lockNote(car: Pick<CarDef, 'price'>, cls = ''): HTMLElement {
  return h('p', { class: `hint lock-note ${cls}`.trim(), attrs: { 'data-locked': '1' } }, icon('lock'), h('span', { class: 'lock-value', text: lockText(car) }));
}

// ───────────────────────────── Peças comuns ─────────────────────────────

/** O distintivo do nível: o número dentro da moldura (`data-frame`: base, bronze, prata, ouro, nitro; o desenho dela é do tema). */
export function levelBadge(level: number, frame: string, cls = ''): HTMLElement {
  return h('span', { class: `lvl-badge ${cls}`.trim(), attrs: { 'data-frame': frame, title: t(`progress.frame.${frame}`), 'aria-label': t('progress.level', { n: level }) } },
    h('b', { class: 'lvl-n mono', text: String(level) }));
}

/** Barra de progresso do degrau (0..1); no teto, cheia. */
export function progressBar(into: number, need: number, cls = 'prog-bar'): HTMLElement {
  const pct = need > 0 ? Math.max(0, Math.min(100, Math.round((into / need) * 100))) : 100;
  return h('span', { class: cls, attrs: { 'aria-hidden': 'true' } }, h('span', { class: `${cls}-fill`, style: `width:${pct}%` }));
}

const carNameOf = (carId: string): string => CARS.find((c) => c.id === carId)?.name ?? carId;

/** O prêmio com o nome do campo: "Aro dourado", "Acabamento cromado" / "Gold rim", "Chrome finish" ("Dourado" sozinho não diz o que é). */
export function itemName(field: 'finish' | 'rim', value: string): string {
  const f = t(`look.field.${field}`);
  const v = lookOptionLabel(field, value);
  return t('progress.item', { field: f, value: v, fieldLower: f.toLowerCase(), valueLower: v.toLowerCase() });
}

/** "Dourado no Falcão GT", "Título: Piloto", "Moldura de bronze". */
export function unlockText(u: Unlock): string {
  switch (u.kind) {
    case 'title': return t('progress.unlock.title', { title: t(`progress.title.${u.id}`) });
    case 'frame': return t('progress.unlock.frame', { frame: t(`progress.frame.${u.id}`) });
    case 'cosmetic': return t('progress.unlock.cosmetic', { item: itemName(u.field, u.value), car: carNameOf(u.carId) });
  }
}

/** O próximo prêmio da maestria de um carro ("Maestria 3: Cromado"), ou "Tudo liberado". */
export function nextMasteryText(mastery: number): string {
  const next = MASTERY_REWARDS.find((r) => r.mastery > mastery);
  return next ? t('progress.next.cosmetic', { n: next.mastery, item: itemName(next.field, next.value) }) : t('progress.next.cosmeticNone');
}

/** O próximo título ou moldura (o que vier antes), ou "Todos ganhos". */
export function nextLevelText(level: number): string {
  const title = TITLES.find((x) => x.level > level);
  const frame = FRAMES.find((x) => x.level > level);
  if (title && (!frame || title.level <= frame.level)) return t('progress.next.title', { title: t(`progress.title.${title.id}`), n: title.level });
  if (frame) return t('progress.next.frame', { frame: t(`progress.frame.${frame.id}`), n: frame.level });
  return t('progress.next.none');
}

const fmt = (n: number): string => n.toLocaleString(getLanguage() === 'pt' ? 'pt-BR' : 'en-US');

// ───────────────────────────── Resultado: o progresso sem altura nova ─────────────────────────────
// O resultado é a tela mais apertada (o playtest-layout reprovou uma faixa própria a 1024×640 com texto grande): o XP vai na linha de cada
// humano da tabela e o que ficou liberado entra no quadro das conquistas, que só aparece quando há o que mostrar.

/** "+50 XP" (e " · Nível 3!" para quem subiu) na linha do humano; o resto (nível, barra, maestria) vai na dica do mouse. */
export function xpTag(n: ProgressNews | undefined): HTMLElement | null {
  if (!n) return null;
  const up = n.level.after > n.level.before;
  const lv = levelOf(n.pilotXp);
  const xp = t('progress.xpGain', { n: fmt(n.xp) });
  const detail = [
    t('progress.level', { n: n.level.after }),
    lv.need > 0 ? t('progress.xpBar', { into: fmt(lv.into), need: fmt(lv.need) }) : t('progress.maxLevel'),
    t('progress.masteryUp', { car: carNameOf(n.carId), n: n.mastery.after }),
  ].join(' · ');
  return h('span', { class: `xp-tag mono${up ? ' up' : ''}`, attrs: { title: detail, 'data-level': String(n.level.after) },
    text: up ? `${xp} · ${t('progress.unlock.levelUp', { n: n.level.after })}` : xp });
}

/**
 * O que ficou liberado, no quadro das conquistas (as mesmas classes `ach-chip`, com a bolinha do assento): UM cartão por humano que ganhou
 * alguma coisa — o prêmio de maestria na frente (o mais raro), depois o título e a moldura, e o "Nível N!" junto. Subir de nível sem prêmio
 * não vira cartão (o "Nível N!" já está na linha dele na tabela). O quadro do resultado não tem altura para um cartão por item.
 */
export function progressChips(news: readonly ProgressNews[] | undefined, seatColor: (seat: number) => string | null, nameOf: (seat: number) => string): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const n of news ?? []) {
    if (n.unlocks.length === 0) continue;
    const ordered = [...n.unlocks.filter((u) => u.kind === 'cosmetic'), ...n.unlocks.filter((u) => u.kind !== 'cosmetic')].map(unlockText);
    const [head, ...rest] = ordered;
    if (n.level.after > n.level.before) rest.push(t('progress.unlock.levelUp', { n: n.level.after }));
    const desc = rest.join(' · ');
    out.push(h('div', { class: 'ach-chip prog-chip', attrs: { title: desc ? `${head} — ${desc}` : head, 'data-seat': String(n.seat) } },
      h('span', { class: 'ach-chip-seats' }, h('i', { class: 'seat-dot', style: `--seat:${seatColor(n.seat) ?? 'var(--accent)'}`, title: nameOf(n.seat) })),
      h('span', { class: 'ach-chip-text' }, h('strong', { text: head }), desc ? h('span', { text: desc }) : null),
    ));
  }
  return out;
}

// ───────────────────────────── Recordes › Nível ─────────────────────────────

/** A aba "Nível": os perfis (das estatísticas) à esquerda; à direita o nível, o título, a moldura e a maestria dos 14 carros. */
export function levelTab(api: ScreenApi): { el: HTMLElement; rows: FocusItem[]; detailRows: FocusItem[]; show(i: number): void } {
  const { save, cars } = api.ctx;
  const progress = api.ctx.progress;
  const names = save.stats.players.map((p) => p.name);
  if (names.length === 0) return { el: h('p', { class: 'empty lvl-empty', text: t('progress.empty') }), rows: [], detailRows: [], show: () => undefined };
  const rows: FocusItem[] = names.map((name) => {
    const p = pilotOf(save.stats, name);
    return { el: h('div', { class: 'pl-row lvl-row', attrs: { 'data-name': name } },
      levelBadge(p.level.level, p.frame, 'pl-avatar'),
      h('span', { class: 'pl-text' },
        h('span', { class: 'pl-name', text: name }),
        h('span', { class: 'pl-sub', text: `${t('progress.level', { n: p.level.level })} · ${t(`progress.title.${p.title}`)}` }),
      ),
    ) };
  });
  const head = h('div', { class: 'lvl-head' });
  // As 14 linhas de maestria existem uma vez (focáveis, para o controle rolar até elas); trocar de perfil só refaz o conteúdo.
  const detailRows: FocusItem[] = cars.map((c) => ({ el: h('div', { class: 'mastery-row', attrs: { 'data-car': c.id } }) }));
  const fillCar = (row: FocusItem, car: CarDef, name: string) => {
    const m = masteryOf(carXp(progress, name, car.id));
    row.el.setAttribute('data-mastery', String(m.level));
    row.el.replaceChildren(
      h('span', { class: 'mastery-car', text: car.name }),
      h('span', { class: 'mastery-n mono', text: m.level >= MAX_MASTERY ? t('progress.masteryMax') : t('progress.mastery', { n: m.level }) }),
      progressBar(m.into, m.need, 'mastery-bar'),
      h('span', { class: 'mastery-next', text: nextMasteryText(m.level) }),
    );
  };
  let shown = -1;
  const show = (i: number) => {
    const idx = Math.max(0, Math.min(names.length - 1, i));
    if (idx === shown) return;
    shown = idx;
    const name = names[idx];
    const p = pilotOf(save.stats, name);
    head.replaceChildren(
      levelBadge(p.level.level, p.frame, 'lvl-badge-big'),
      h('span', { class: 'lvl-head-text' },
        h('h2', { class: 'pl-detail-name', text: name }),
        h('span', { class: 'lvl-title', text: `${t('progress.level', { n: p.level.level })} · ${t(`progress.title.${p.title}`)}` }),
        progressBar(p.level.into, p.level.need, 'lvl-bar'),
        h('span', { class: 'lvl-xp mono', text: p.level.need > 0 ? t('progress.xpBar', { into: fmt(p.level.into), need: fmt(p.level.need) }) : t('progress.maxLevel') }),
        h('span', { class: 'lvl-next hint', text: nextLevelText(p.level.level) }),
      ),
    );
    detailRows.forEach((r, k) => fillCar(r, cars[k], name));
    rows.forEach((r, k) => r.el.classList.toggle('shown', k === idx));
  };
  const el = h('div', { class: 'players-layout lvl-tab' },
    h('div', { class: 'pl-list glass' }, h('p', { class: 'hint pl-hint', text: t('progress.listHint') }), rows.map((r) => r.el)),
    h('div', { class: 'pl-detail glass' },
      head,
      h('h3', { class: 'sub-title', text: t('progress.masteryTitle') }),
      h('p', { class: 'hint lvl-mastery-hint', text: t('progress.masteryHint') }),
      h('div', { class: 'mastery-list' }, detailRows.map((r) => r.el)),
    ),
  );
  show(0);
  return { el, rows, detailRows, show };
}
