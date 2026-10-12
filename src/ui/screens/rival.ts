// Rival da copa nas telas (docs/RIVAIS.md): cartão do duelo no resultado e na classificação, bloco do
// rival no detalhe da copa e na garagem da carreira. As regras moram em src/game/rivals.ts.
import type { CareerState } from '../../core/career';
import { cupDef } from '../../core/data/cups';
import type { ChampionshipState, RaceResultRow } from '../../core/types';
import type { SaveData } from '../../game/contracts';
import {
  cupDuels, cupRival, duelLineKind, personalityName, rivalLine, rivalLineFor, rivalRaceSummary, rivalStandingsSummary, scoreLine, scoreState,
  type Rival, type RivalScore, type RivalSummary,
} from '../../game/rivals';
import { findProfile, scoreOf } from '../../game/stars';
import { t } from '../../i18n';
import { portrait, type Face } from '../art/portraits';
import { h } from './common';
import { icon } from './icons';
import { goalLabel, starsRow } from './star-widgets';
import './rival.css';

/** O que as telas leem do save para o rival com rosto: o placar e as estrelas do perfil (opcional: sem save, o cartão é o de antes). */
export type RivalSave = Pick<SaveData, 'stars'> & Partial<Pick<SaveData, 'seatNames'>>;

/** O retrato do rival num quadrado fixo (o rosto não decide a altura do cartão). */
function faceBox(name: string, face: Face, size: number): HTMLElement {
  return h('span', { class: 'rival-face', attrs: { 'data-face': face } }, portrait(name, face, size));
}

/** O placar só aparece depois da primeira corrida contra o rival. */
function scoreEl(rival: Rival, score: RivalScore | null | undefined): HTMLElement | null {
  return score && scoreState(score) !== 'none' ? h('span', { class: 'rival-score mono', text: scoreLine(rival, score) }) : null;
}

/** "Rival: nome — posição" e a fala; a cor segue o duelo (ele à frente = vermelho, atrás = verde). */
export function rivalCard(s: RivalSummary, score?: RivalScore | null): HTMLElement {
  return h('div', { class: `rival-card glass ${s.rivalAhead ? 'ahead' : 'behind'}`, attrs: { 'data-rival': s.rival.name, 'data-kind': s.kind } },
    faceBox(s.rival.name, s.rivalAhead ? 'win' : 'lose', 56),
    h('div', { class: 'rival-card-body' },
      h('span', { class: 'rival-card-head' }, icon('swords'), h('strong', { text: s.title }),
        h('span', { class: 'rival-pers', text: personalityName(s.rival.personality) }), scoreEl(s.rival, score)),
      h('q', { class: 'rival-quote', text: s.line }),
    ),
  );
}

/** O placar do perfil contra o rival da copa (zeros sem save). */
function scoreFor(save: RivalSave | undefined, profile: string | undefined, rival: Rival): RivalScore | null {
  return save && profile ? scoreOf(save.stars, profile, rival.key) : null;
}

/** Resultado de uma corrida da copa (normal ou carreira): o cartão, ou null sem rival no grid. O placar é o do melhor humano da corrida. */
export function rivalRaceCard(champ: ChampionshipState | null, results: readonly RaceResultRow[], save?: RivalSave): HTMLElement | null {
  const s = champ ? rivalRaceSummary(champ, results) : null;
  if (!s) return null;
  const best = results.filter((r) => r.seat >= 0).sort((a, b) => a.position - b.position)[0];
  return rivalCard(s, scoreFor(save, best?.name, s.rival));
}

export function rivalStandingsCard(champ: ChampionshipState, save?: RivalSave): HTMLElement | null {
  const s = rivalStandingsSummary(champ);
  if (!s) return null;
  const human = champ.standings.find((r) => r.seat >= 0);
  return rivalCard(s, scoreFor(save, human?.name, s.rival));
}

/** Etiqueta "RIVAL" ao lado do nome na tabela. */
export function rivalTag(): HTMLElement {
  return h('span', { class: 'rival-tag', text: t('rivals.hudTag') });
}

/** Detalhe da copa: quem é o rival, a personalidade e a frase de apresentação. */
export function cupRivalBlock(cupId: string, save?: RivalSave): HTMLElement {
  const r = cupRival(cupId);
  const score = scoreFor(save, save?.seatNames?.[0], r);
  return h('div', { class: 'cup-rival', attrs: { 'data-rival': r.name } },
    faceBox(r.name, 'taunt', 48),
    h('div', { class: 'cup-rival-body' },
      h('span', { class: 'cup-rival-head' }, icon('swords'),
        h('span', { class: 'cup-rival-k', text: t('rivals.cupRival') }),
        h('strong', { text: r.name }),
        h('span', { class: 'rival-pers', text: personalityName(r.personality) }), scoreEl(r, score)),
      h('q', { class: 'rival-quote', text: rivalLineFor(r, 'intro', score ?? undefined) }),
    ),
  );
}

/** A pista da próxima corrida da Expedição (a da copa em andamento, ou a primeira da copa). */
function nextTrackId(career: CareerState): string {
  return cupDef(career.cupId).trackIds[Math.min(career.champ?.raceIndex ?? 0, cupDef(career.cupId).trackIds.length - 1)] ?? '';
}

/**
 * Garagem da carreira: o rival da copa atual e a fala — a apresentação antes da primeira corrida da
 * copa, depois a do último duelo. Null com a carreira concluída.
 */
export function garageRivalBlock(career: CareerState, save?: RivalSave): HTMLElement | null {
  if (career.completed) return null;
  const r = cupRival(career.cupId);
  const profile = career.drivers[0]?.name;
  const score = scoreFor(save, profile, r);
  const duels = career.champ ? cupDuels(career.champ) : [];
  const last = duels[duels.length - 1];
  const line = last === undefined || last === null ? rivalLineFor(r, 'intro', score ?? undefined) : rivalLine(r, duelLineKind(last, duels[duels.length - 2]));
  const face: Face = last === undefined || last === null ? 'taunt' : last ? 'win' : 'lose';
  const trackId = nextTrackId(career);
  const mask = save && profile ? findProfile(save.stars, profile)?.tracks[trackId] ?? 0 : 0;
  return h('div', { class: 'garage-rival glass', attrs: { 'data-rival': r.name } },
    faceBox(r.name, face, 40),
    h('strong', { text: t('rivals.garage', { name: r.name, personality: personalityName(r.personality) }) }),
    scoreEl(r, score),
    h('q', { class: 'rival-quote', text: line }),
    h('span', { class: 'garage-goal' }, starsRow(mask), h('span', { class: 'garage-goal-text', text: t('stars.goalLine', { goal: goalLabel(trackId) }) })),
  );
}
