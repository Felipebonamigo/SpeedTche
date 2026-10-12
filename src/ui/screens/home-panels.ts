// Os dois quadros do painel da direita do menu principal (onda N, N5): o "Próximo objetivo" (src/game/goals.ts) e o "Desde a última
// vez" (src/game/expedition.ts). Só montam DOM e texto; as contas são das funções puras. O dinheiro é formatado aqui (a mesma
// conta de `garage.ts` `formatMoney`, que não se importa daqui porque a garagem puxa o palco 3D e esta tela é leve).
import '../../career/strings';
import '../../i18n/core';
import '../../expedition/strings';
import { CARS } from '../../core/data/cars';
import type { CarDef, CupDef } from '../../core/types';
import type { SaveData, SessionRecap } from '../../game/contracts';
import { diffSnapshots, type SnapshotDiff } from '../../game/expedition';
import { nextGoals, type Goal, type GoalsView } from '../../game/goals';
import { getLanguage, t } from '../../i18n';
import { h } from './common';

function money(v: number): string {
  return t('career.money', { v: Math.round(v).toLocaleString(getLanguage() === 'pt' ? 'pt-BR' : 'en-US') });
}

const cupName = (id: string): string => t(`core.cup.${id}`);

function itemName(goal: Goal): string {
  const ref = String(goal.vars.ref ?? '');
  if (goal.vars.item === 'part') return t('career.garage.part.' + ref);
  return CARS.find((c) => c.id === ref)?.name ?? ref;
}

/** O texto de uma meta, a partir do id e das variáveis que `nextGoals` devolve. */
export function goalText(goal: Goal): string {
  const v = goal.vars;
  switch (goal.id) {
    case 'canBuy': return t('expedition.goal.canBuy', { item: itemName(goal) });
    case 'saveFor': return t('expedition.goal.saveFor', { item: itemName(goal), missing: money(Number(v.missing)) });
    case 'firstCup': return t('expedition.goal.firstCup', { cup: cupName(String(v.cup)) });
    case 'finishCup': return t('expedition.goal.finishCup', { cup: cupName(String(v.cup)), n: Number(v.n), m: Number(v.m) });
    case 'stamps': return t('expedition.goal.stamps', { have: Number(v.have), total: Number(v.total) });
    case 'worldCircuit': return t('expedition.goal.worldCircuit', { left: Number(v.left) });
    case 'collection': return t('expedition.goal.collection', { have: Number(v.have), total: Number(v.total) });
    default: return t(`expedition.goal.${goal.id}`);
  }
}

function goalRow(goal: Goal, tag: string | null): HTMLElement {
  const bar = goal.progress === null || goal.id === 'canBuy' ? null : h('span', { class: 'goal-bar', attrs: { 'aria-hidden': 'true' } },
    h('i', { style: `width:${Math.round(Math.max(0, Math.min(1, goal.progress)) * 100)}%` }));
  return h('li', { class: `goal-row goal-${goal.term}${goal.id === 'canBuy' ? ' ready' : ''}` },
    tag ? h('b', { class: 'goal-tag', text: tag }) : null,
    h('span', { class: 'goal-text', text: goalText(goal) }),
    bar);
}

/** As metas de hoje para um save (curta por carteira, média e longa). */
export function goalsFor(save: SaveData, cups: readonly CupDef[], cars: readonly CarDef[]): GoalsView {
  return nextGoals({ career: save.career, save, cups, cars });
}

/** "Próximo objetivo": curta (uma por carteira; no versus, com o assento), média e longa. */
export function goalsPanel(view: GoalsView, versus: boolean): HTMLElement {
  const rows = [
    ...view.short.map((g) => goalRow(g, versus && g.driver !== null ? t('expedition.goal.seat', { n: g.driver + 1 }) : null)),
    view.medium ? goalRow(view.medium, null) : null,
    view.long ? goalRow(view.long, null) : null,
  ];
  return h('div', { class: 'home-box goals-box' },
    h('h3', { class: 'home-box-title', text: t('expedition.goals.title') }),
    h('ul', { class: 'goal-list' }, rows));
}

/** As linhas do quadro: só o que mudou (zero não aparece). Devolve vazio quando nada mudou. */
export function recapLines(d: SnapshotDiff): string[] {
  const out: string[] = [];
  if (d.races > 0) out.push(t('expedition.recap.races', { n: d.races }));
  if (d.wins > 0) out.push(t('expedition.recap.wins', { n: d.wins }));
  if (d.earned > 0) out.push(t('expedition.recap.earned', { v: money(d.earned) }));
  if (d.cars > 0) out.push(t('expedition.recap.cars', { n: d.cars }));
  if (d.stamps > 0) out.push(t('expedition.recap.stamps', { n: d.stamps }));
  if (d.cups > 0) out.push(t('expedition.recap.cups', { n: d.cups }));
  if (d.achievements > 0) out.push(t('expedition.recap.achievements', { n: d.achievements }));
  return out;
}

/** "Desde a última vez"; null quando não há resumo (1ª abertura, ou a sessão anterior não mudou nada). */
export function recapPanel(recap: SessionRecap | null): HTMLElement | null {
  if (!recap) return null;
  const lines = recapLines(diffSnapshots(recap.before, recap.after));
  if (lines.length === 0) return null;
  return h('div', { class: 'home-box recap-box' },
    h('h3', { class: 'home-box-title', text: t('expedition.recap.title') }),
    h('p', { class: 'recap-lines' }, lines.map((l) => h('span', { class: 'recap-chip', text: l }))));
}
