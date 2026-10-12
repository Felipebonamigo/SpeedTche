// Peças de tela das estrelas, do troféu e do contador (O4; docs/ondas/O/O4.md §4.6). Só MOSTRAM o que `src/game/stars.ts` guarda; nada aqui
// grava. Usadas pelo detalhe da copa (select.ts), pela garagem e pelo cartão do rival (rival.ts) e pelo Pagamento (payout.ts).
import { STARS_TOTAL, STAR_GOAL, STAR_QUALIFY, STAR_RIVAL, goalFor, starCount, type StarProfile, type Trophy } from '../../game/stars';
import { t } from '../../i18n';
import '../../stars/strings';
import { h } from './common';
import { icon } from './icons';
import './star-widgets.css';

const STAR_PATH = 'M12 2.6l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6L2.5 9.5l6.6-.8z';

function starSvg(): SVGSVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = `<svg class="star-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${STAR_PATH}"/></svg>`;
  return tpl.content.firstElementChild as SVGSVGElement;
}

/** Os três critérios, na ordem em que aparecem: classificar, vencer o rival, o objetivo da pista. */
const SLOTS: ReadonlyArray<{ bit: number; label: string }> = [
  { bit: STAR_QUALIFY, label: 'stars.label.qualify' }, { bit: STAR_RIVAL, label: 'stars.label.rival' }, { bit: STAR_GOAL, label: 'stars.label.goal' },
];

export interface StarsRowOptions {
  /** Bits que esta corrida acabou de ganhar (ganham a marca `new`, com brilho). */
  fresh?: number;
  /** `reduceEffects`: sem animação de brilho, só o estado. */
  calm?: boolean;
}

/** As 3 estrelas de uma corrida (um lugar por critério), acesas pelos bits. */
export function starsRow(mask: number, o: StarsRowOptions = {}): HTMLElement {
  const lit = SLOTS.filter((s) => mask & s.bit).length;
  return h('span', { class: `stars${o.calm ? ' calm' : ''}`, attrs: { role: 'img', 'aria-label': t('stars.aria', { n: lit }), 'data-stars': String(lit) } },
    SLOTS.map((s) => h('span', { class: `star${mask & s.bit ? ' on' : ''}${(o.fresh ?? 0) & s.bit ? ' new' : ''}`, title: t(s.label) }, starSvg())));
}

/** O texto do objetivo da pista. */
export function goalLabel(trackId: string): string {
  return t(`stars.goal.${goalFor(trackId)}`);
}

/** Troféu da copa (bronze, prata ou ouro) com as estrelas dela; `null` sem troféu. */
export function trophyChip(tier: Trophy, got: number, max: number): HTMLElement | null {
  if (tier === 'none') return null;
  const name = t(`stars.trophy.${tier}`);
  return h('span', { class: `cup-trophy trophy-${tier}`, title: t('stars.trophyTitle', { tier: name, n: got, total: max }), attrs: { 'data-trophy': tier } },
    icon('trophy'), h('span', { class: 'mono', text: `${name} ${got}/${max}` }));
}

/** "x/327": as estrelas do perfil no jogo todo. */
export function starsCounter(profile: StarProfile | undefined): HTMLElement {
  const n = starCount(profile);
  return h('span', { class: 'stars-counter', title: t('stars.counterTitle', { n, total: STARS_TOTAL }) },
    h('span', { class: 'star on' }, starSvg()), h('span', { class: 'mono', text: t('stars.counter', { n, total: STARS_TOTAL }) }));
}
