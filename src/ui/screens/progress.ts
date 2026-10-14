// Telas do progresso que fica (O5, docs/ondas/O/O5.md §4.6–§4.7): a linha do cadeado do carro trancado (lobby, festa, online), a aba "Nível"
// dos Recordes e a faixa de progresso do resultado. Só DOM e texto: as contas são de src/game/progression.ts. O estilo VISUAL (cor, ícone,
// moldura) é do tema da interface (nc/menu-estilos); progress.css só tem o mínimo de estrutura para o texto caber.
import '../../career/strings';
import '../../cosmetics/strings';
import '../../progress/strings';
import type { CarDef } from '../../core/types';
import { carAvailable } from '../../game/career-save';
import type { SaveData } from '../../game/contracts';
import { getLanguage, t } from '../../i18n';
import { h, type FocusItem } from './common';
import { icon } from './icons';
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
