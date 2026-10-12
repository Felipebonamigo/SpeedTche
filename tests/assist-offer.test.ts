// Oferta de assistência depois de 2 eliminações seguidas (O3, docs/ondas/O/O3.md): Freio automático ou Amador, recusável e uma vez por sessão.
import { describe, expect, it } from 'vitest';
import type { AssistLevel } from '../src/core/types';
import { DEFAULT_SETTINGS } from '../src/game/contracts';
import { applyAssistChoice, ELIMINATIONS_FOR_OFFER, markOffered, newAssistOffer, offerDue, recordRaceEnd } from '../src/game/assist-offer';

const none: AssistLevel[] = ['none', 'none', 'none', 'none'];

describe('quando oferecer', () => {
  it('só depois de 2 eliminações SEGUIDAS de copa ou Expedição; uma classificação zera a conta', () => {
    expect(ELIMINATIONS_FOR_OFFER).toBe(2);
    const o = newAssistOffer();
    recordRaceEnd(o, 'cup', true);
    expect(offerDue(o, 'profissional', none, [0])).toBeNull();
    recordRaceEnd(o, 'cup', false);
    recordRaceEnd(o, 'career', true);
    expect(offerDue(o, 'profissional', none, [0])).toBeNull();
    recordRaceEnd(o, 'career', true);
    expect(offerDue(o, 'profissional', none, [0])).toEqual({ brake: true, amateur: true });
  });

  it('corrida rápida, contra-relógio e festa não contam nem zeram', () => {
    const o = newAssistOffer();
    recordRaceEnd(o, 'cup', true);
    recordRaceEnd(o, 'quick', false);
    recordRaceEnd(o, 'timetrial', false);
    recordRaceEnd(o, 'escort', true);
    recordRaceEnd(o, 'cup', true);
    expect(offerDue(o, 'profissional', none, [0])).not.toBeNull();
  });

  it('feita a oferta, não volta nesta sessão (aceita ou recusada), mesmo com mais eliminações', () => {
    const o = newAssistOffer();
    recordRaceEnd(o, 'cup', true); recordRaceEnd(o, 'cup', true);
    markOffered(o);
    expect(offerDue(o, 'profissional', none, [0])).toBeNull();
    recordRaceEnd(o, 'cup', true); recordRaceEnd(o, 'cup', true);
    expect(offerDue(o, 'profissional', none, [0])).toBeNull();
  });

  it('só oferece o que ainda ajuda: Freio automático some se todos já têm assistência; Amador some se já está no Amador; nada a oferecer = sem oferta', () => {
    const o = newAssistOffer();
    recordRaceEnd(o, 'cup', true); recordRaceEnd(o, 'cup', true);
    expect(offerDue(o, 'profissional', ['brake', 'none', 'none', 'none'], [0])).toEqual({ brake: false, amateur: true });
    expect(offerDue(o, 'amador', none, [0])).toEqual({ brake: true, amateur: false });
    expect(offerDue(o, 'amador', ['full', 'none', 'none', 'none'], [0])).toBeNull();
    // Só conta quem corre: o assento 1 sem assistência não pesa se só o 0 joga.
    expect(offerDue(o, 'amador', ['steer', 'none', 'none', 'none'], [0])).toBeNull();
  });
});

describe('aplicar a escolha', () => {
  it('Freio automático: só quem corre e não tinha assistência; nunca rebaixa quem tem outra; o resto das opções fica', () => {
    const s = { ...DEFAULT_SETTINGS, seatAssists: ['none', 'steer', 'none', 'none'] as AssistLevel[] };
    const next = applyAssistChoice('brake', s, [0, 1]);
    expect(next.seatAssists).toEqual(['brake', 'steer', 'none', 'none']);
    expect(next.difficulty).toBe(s.difficulty);
    expect(s.seatAssists).toEqual(['none', 'steer', 'none', 'none']); // não muta o original
  });

  it('Amador: só a dificuldade', () => {
    const next = applyAssistChoice('amateur', { ...DEFAULT_SETTINGS, seatAssists: [...none] }, [0]);
    expect(next.difficulty).toBe('amador');
    expect(next.seatAssists).toEqual(none);
  });

  it('recusar não muda nada', () => {
    const s = { ...DEFAULT_SETTINGS, seatAssists: [...none] };
    expect(applyAssistChoice('no', s, [0])).toEqual(s);
  });
});
