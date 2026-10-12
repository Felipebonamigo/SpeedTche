// Oferta de assistência depois de 2 eliminações seguidas (O3, docs/ondas/O/O3.md): "Freio automático ou Amador?". Pura: a sessão
// registra o fim de cada corrida (`recordRaceEnd`), pergunta se a oferta está na hora (`offerDue`) e aplica a resposta
// (`applyAssistChoice`). A oferta é RECUSÁVEL e aparece UMA vez por sessão (`markOffered`), aceita ou não: não volta a cada corrida.
// atalho: a conta e o "já ofereci" vivem só na sessão (não no save, para não criar campo de save nesta frente); reiniciar o jogo os zera.
// Saída se isso incomodar: dois campos aditivos no save (sequência de eliminações e "oferta recusada"), com saneador.
import type { AssistLevel, Difficulty } from '../core/types';
import type { RaceMode, Settings } from './contracts';

export const ELIMINATIONS_FOR_OFFER = 2;

export type AssistChoice = 'brake' | 'amateur' | 'no';

export interface AssistOffer {
  /** Eliminações seguidas (copa e Expedição). */
  streak: number;
  /** A oferta já foi feita nesta sessão. */
  offered: boolean;
}

export function newAssistOffer(): AssistOffer {
  return { streak: 0, offered: false };
}

/** O fim de uma corrida: só copa e Expedição entram na conta (eliminar é coisa delas); classificar zera. */
export function recordRaceEnd(o: AssistOffer, mode: RaceMode, eliminated: boolean): void {
  if (mode !== 'cup' && mode !== 'career') return;
  o.streak = eliminated ? o.streak + 1 : 0;
}

export function markOffered(o: AssistOffer): void {
  o.offered = true;
}

/** O que a oferta traz: cada opção só existe se ainda ajuda. */
export interface OfferOptions { brake: boolean; amateur: boolean }

/** A oferta está na hora? `seats` = quem corre (um assento sem assistência que ninguém usa não pesa). Null = não. */
export function offerDue(o: AssistOffer, difficulty: Difficulty, seatAssists: readonly AssistLevel[], seats: readonly number[]): OfferOptions | null {
  if (o.offered || o.streak < ELIMINATIONS_FOR_OFFER) return null;
  const brake = seats.some((s) => (seatAssists[s] ?? 'none') === 'none');
  const amateur = difficulty !== 'amador';
  return brake || amateur ? { brake, amateur } : null;
}

/** As opções com a escolha aplicada (cópia: o original não muda). Freio automático só para quem corre e não tinha assistência. */
export function applyAssistChoice(choice: AssistChoice, settings: Settings, seats: readonly number[]): Settings {
  const next: Settings = { ...settings, assists: { ...settings.assists }, seatAssists: [...settings.seatAssists] };
  if (choice === 'brake') for (const s of seats) if ((next.seatAssists[s] ?? 'none') === 'none') next.seatAssists[s] = 'brake';
  if (choice === 'amateur') next.difficulty = 'amador';
  return next;
}
