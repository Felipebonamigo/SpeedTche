// O4: as peças de tela das estrelas, do troféu, do placar e do retrato (docs/ondas/O/O4.md §4.6, grupo G): DOM falso, as peças são as de verdade.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newCareer } from '../src/core/career';
import { CUPS } from '../src/core/data/cups';
import { TRACKS } from '../src/core/track/tracks';
import { DEFAULT_SAVE } from '../src/game/contracts';
import { cupRival, type RivalSummary } from '../src/game/rivals';
import { STAR_GOAL, STAR_QUALIFY, STAR_RIVAL, STARS_TOTAL, emptyStars, goalFor, type StarsData } from '../src/game/stars';
import { getLanguage, setLanguage, t } from '../src/i18n';
import '../src/stars/strings';
import { cupRivalBlock, garageRivalBlock, rivalCard } from '../src/ui/screens/rival';
import { goalLabel, starsCounter, starsRow, trophyChip } from '../src/ui/screens/star-widgets';
import { all, hasClass, installDocument, text, type FakeEl } from './ui-fake';
import { human } from './helpers';

beforeEach(() => { setLanguage('pt'); installDocument(); });
afterEach(() => { vi.unstubAllGlobals(); setLanguage('pt'); });

const stars = (el: FakeEl): FakeEl[] => all(el, hasClass('star'));
const on = (el: FakeEl): boolean[] => stars(el).map((s) => hasClass('on')(s));
const faceOf = (el: unknown): string[] => all(el, (e) => e.innerHTML.includes('data-face=')).map((e) => /data-face="(\w+)"/.exec(e.innerHTML)?.[1] ?? '');

const SCORE = { you: 5, rival: 7 };
const withScore = (name = 'Ana'): { stars: StarsData } => ({ stars: { profiles: [{ name, tracks: { copacabana: STAR_QUALIFY | STAR_GOAL }, rivals: { ze_turbo: SCORE } }], last: [] } });

describe('as estrelas de uma corrida', () => {
  it('três lugares, um por critério, acesos conforme os bits', () => {
    const row = starsRow(STAR_QUALIFY | STAR_RIVAL | STAR_GOAL) as unknown as FakeEl;
    expect(on(row)).toEqual([true, true, true]);
    expect(on(starsRow(STAR_QUALIFY | STAR_GOAL) as unknown as FakeEl)).toEqual([true, false, true]);
    expect(on(starsRow(0) as unknown as FakeEl)).toEqual([false, false, false]);
  });

  it('o rótulo acessível diz quantas de 3, nos dois idiomas, e cada estrela tem o nome do critério', () => {
    const row = starsRow(STAR_QUALIFY | STAR_GOAL) as unknown as FakeEl;
    expect(row.getAttribute('aria-label')).toBe(t('stars.aria', { n: 2 }));
    expect(stars(row).map((s) => s.title)).toEqual([t('stars.label.qualify'), t('stars.label.rival'), t('stars.label.goal')]);
    setLanguage('en');
    expect((starsRow(7) as unknown as FakeEl).getAttribute('aria-label')).toBe('3 of 3 stars');
  });

  it('as estrelas novas desta corrida levam a marca "new"; com reduceEffects (calm) a linha não anima', () => {
    const row = starsRow(STAR_QUALIFY | STAR_GOAL, { fresh: STAR_GOAL }) as unknown as FakeEl;
    expect(stars(row).map((s) => hasClass('new')(s))).toEqual([false, false, true]);
    expect(hasClass('calm')(row)).toBe(false);
    const calm = starsRow(STAR_QUALIFY | STAR_GOAL, { fresh: STAR_GOAL, calm: true }) as unknown as FakeEl;
    expect(hasClass('calm')(calm)).toBe(true);
  });
});

describe('o objetivo da pista', () => {
  it('toda pista tem texto, em PT e EN, e não é a chave crua', () => {
    for (const lang of ['pt', 'en'] as const) {
      setLanguage(lang);
      for (const tr of TRACKS) {
        const label = goalLabel(tr.id);
        expect(label.length).toBeGreaterThan(5);
        expect(label).not.toContain('stars.goal');
        expect(label).toBe(t(`stars.goal.${goalFor(tr.id)}`));
      }
    }
  });
});

describe('troféu e contador', () => {
  it('sem troféu, nada; com troféu, a classe da cor e o "x/y"', () => {
    expect(trophyChip('none', 2, 9)).toBeNull();
    for (const tier of ['bronze', 'silver', 'gold'] as const) {
      const chip = trophyChip(tier, 7, 9) as unknown as FakeEl;
      expect(hasClass(`trophy-${tier}`)(chip)).toBe(true);
      expect(text(chip)).toContain('7/9');
      expect(text(chip)).toContain(t(`stars.trophy.${tier}`));
    }
  });

  it('o contador mostra x/327', () => {
    expect(text(starsCounter(undefined))).toContain(`0/${STARS_TOTAL}`);
    const p = { name: 'Ana', tracks: { copacabana: 7, paraty: 1 }, rivals: {} };
    expect(text(starsCounter(p))).toContain(`4/${STARS_TOTAL}`);
    expect(text(starsCounter(p))).toContain('327');
  });
});

describe('o rival com rosto e placar', () => {
  const zeTurbo = cupRival('br_rj');
  const summary = (rivalAhead: boolean): RivalSummary => ({ rival: zeTurbo, position: 2, rivalAhead, kind: rivalAhead ? 'taunt' : 'respect', title: 'Rival: Zé Turbo — 2º', line: 'x' });

  it('cartão do resultado: ele à frente vence (win), atrás perde (lose); o placar aparece quando há corridas', () => {
    const ahead = rivalCard(summary(true), SCORE) as unknown as FakeEl;
    expect(faceOf(ahead)).toEqual(['win']);
    expect(text(ahead)).toContain('Zé Turbo 7 × 5 você');
    const behind = rivalCard(summary(false), SCORE) as unknown as FakeEl;
    expect(faceOf(behind)).toEqual(['lose']);
    const noScore = rivalCard(summary(false)) as unknown as FakeEl;
    expect(text(noScore)).not.toContain('×');
    expect(faceOf(noScore)).toEqual(['lose']);
    expect(text(rivalCard(summary(false), { you: 0, rival: 0 }) as unknown as FakeEl)).not.toContain('×');
  });

  it('o retrato não vira texto lido por leitor de tela (o nome já está no cartão)', () => {
    const card = rivalCard(summary(true), SCORE) as unknown as FakeEl;
    expect(all(card, (e) => e.innerHTML.includes('aria-hidden="true"')).length).toBeGreaterThan(0);
  });

  it('detalhe da copa: retrato de provocação, placar do perfil do assento 1 e a fala escolhida pelo placar', () => {
    const save = { ...DEFAULT_SAVE, seatNames: ['Ana', 'P2', 'P3', 'P4'], ...withScore() };
    const block = cupRivalBlock('br_rj', save) as unknown as FakeEl;
    expect(faceOf(block)).toEqual(['taunt']);
    expect(text(block)).toContain('Zé Turbo 7 × 5 você');
    expect(text(block)).toContain(t('rivals.score.aggressive.rival', { r: 7, y: 5 }));
    // Sem save (ou perfil sem corridas): o bloco de sempre, com a apresentação.
    const plain = cupRivalBlock('br_rj') as unknown as FakeEl;
    expect(text(plain)).not.toContain('×');
    expect(text(plain)).toContain(t('rivals.line.ze_turbo.intro'));
    const other = cupRivalBlock('br_rj', { ...save, seatNames: ['Bia', 'P2', 'P3', 'P4'] }) as unknown as FakeEl;
    expect(text(other)).not.toContain('×');
  });

  it('garagem da Expedição: o objetivo da próxima pista e as estrelas que o perfil já tem nela', () => {
    const career = newCareer([{ ...human(0), name: 'Ana' }]);
    const next = CUPS.find((c) => c.id === career.cupId)!.trackIds[0];
    const save = { ...DEFAULT_SAVE, stars: { profiles: [{ name: 'Ana', tracks: { [next]: STAR_RIVAL }, rivals: {} }], last: [] } };
    const block = garageRivalBlock(career, save) as unknown as FakeEl;
    expect(text(block)).toContain(goalLabel(next));
    expect(on(block)).toEqual([false, true, false]);
    const plain = garageRivalBlock(career) as unknown as FakeEl;
    expect(text(plain)).toContain(goalLabel(next));
    expect(on(plain)).toEqual([false, false, false]);
  });

  it('reaproveita o vazio: save sem estrelas não lança', () => {
    const career = newCareer([human(0)]);
    expect(() => garageRivalBlock(career, { stars: emptyStars() })).not.toThrow();
    expect(() => cupRivalBlock('br_rj', { ...DEFAULT_SAVE, stars: emptyStars() })).not.toThrow();
    expect(getLanguage()).toBe('pt');
  });
});
