// O4: o placar do rival e as falas escolhidas por ele (docs/ondas/O/O4.md §4.4, grupo E). Sem palavrão (decisão nº 24 do cronograma).
import { describe, expect, it } from 'vitest';
import { AI_DRIVERS, CUP_RIVALS } from '../src/core/data/drivers';
import type { Personality } from '../src/core/types';
import { RIVAL_LINE_KINDS, cupRival, rivalBalloon, rivalLine, rivalLineFor, rivalScoreLine, scoreLine, scoreState, type RivalScore } from '../src/game/rivals';
import { rivalByName, rivalTalkText } from '../src/game/rival-talk';
import { getLanguage, setLanguage, t } from '../src/i18n';
import '../src/rivals/strings';

const PERSONALITIES: readonly Personality[] = ['clean', 'aggressive', 'blocker', 'erratic'];
const STATES = ['rival', 'you', 'even'] as const;
const zeTurbo = cupRival('br_rj');

/** Palavrões e xingamentos em PT e EN (lista curta, de propósito: o teste barra o que a classificação etária não aceita). */
const BAD = ['merda', 'porra', 'caralho', 'puta', 'foda', 'fode', 'bosta', 'viado', 'cacete', 'buceta', 'otario', 'idiota', 'imbecil', 'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'cunt', 'damn', 'stupid', 'idiot'];
const clean = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

describe('scoreState', () => {
  it('none sem corrida, rival/you com 2 ou mais de frente, even no resto', () => {
    expect(scoreState({ you: 0, rival: 0 })).toBe('none');
    expect(scoreState({ you: 1, rival: 0 })).toBe('even');
    expect(scoreState({ you: 0, rival: 1 })).toBe('even');
    expect(scoreState({ you: 3, rival: 3 })).toBe('even');
    expect(scoreState({ you: 4, rival: 5 })).toBe('even');
    expect(scoreState({ you: 5, rival: 7 })).toBe('rival');
    expect(scoreState({ you: 0, rival: 2 })).toBe('rival');
    expect(scoreState({ you: 7, rival: 5 })).toBe('you');
    expect(scoreState({ you: 2, rival: 0 })).toBe('you');
  });
});

describe('a linha do placar', () => {
  it('"Zé Turbo 7 × 5 você" em PT e "Zé Turbo 7 × 5 you" em EN', () => {
    setLanguage('pt');
    expect(scoreLine(zeTurbo, { you: 5, rival: 7 })).toBe('Zé Turbo 7 × 5 você');
    setLanguage('en');
    expect(scoreLine(zeTurbo, { you: 5, rival: 7 })).toBe('Zé Turbo 7 × 5 you');
    setLanguage('pt');
  });
});

describe('as falas escolhidas pelo placar', () => {
  const score: Record<(typeof STATES)[number], RivalScore> = { rival: { you: 2, rival: 6 }, you: { you: 6, rival: 2 }, even: { you: 3, rival: 3 } };

  it('sem placar (ou 0 × 0) a fala é a de hoje, em todo tipo', () => {
    for (const k of RIVAL_LINE_KINDS) {
      expect(rivalLineFor(zeTurbo, k)).toBe(rivalLine(zeTurbo, k));
      expect(rivalLineFor(zeTurbo, k, { you: 0, rival: 0 })).toBe(rivalLine(zeTurbo, k));
    }
  });

  it('a apresentação muda com o placar: uma frase por estado, com os números', () => {
    const texts = STATES.map((s) => rivalLineFor(zeTurbo, 'intro', score[s]));
    expect(new Set(texts).size).toBe(3);
    expect(texts[0]).toContain('6 × 2');
    expect(texts[1]).toContain('2 × 6');
    expect(texts[2]).toContain('3 × 3');
    for (const x of texts) expect(x).not.toBe(rivalLine(zeTurbo, 'intro'));
  });

  it('as falas depois da corrida seguem as de sempre (já citam o resultado)', () => {
    for (const k of ['taunt', 'respect', 'revenge'] as const) expect(rivalLineFor(zeTurbo, k, score.rival)).toBe(rivalLine(zeTurbo, k));
  });

  it('a personalidade escolhe a frase: as quatro são diferentes entre si em cada estado', () => {
    for (const s of STATES) {
      const per = PERSONALITIES.map((p) => rivalScoreLine({ name: 'X', personality: p, key: 'x' }, score[s]));
      expect(new Set(per).size).toBe(4);
    }
  });

  it('o balão cita o placar na provocação, na apresentação e na revanche; no respeito, a fala de sempre', () => {
    for (const k of ['intro', 'taunt', 'revenge'] as const) {
      const b = rivalBalloon(zeTurbo, k, score.rival);
      expect(b.startsWith('Zé Turbo: ')).toBe(true);
      expect(b).toContain('6 × 2');
    }
    expect(rivalBalloon(zeTurbo, 'respect', score.rival)).toBe(rivalTalkText(zeTurbo, 'respect'));
  });

  it('o balão sem placar é o texto de antes (rivalTalkText), e o rivalTalkText aceita o placar', () => {
    for (const k of RIVAL_LINE_KINDS) {
      expect(rivalBalloon(zeTurbo, k)).toBe(rivalTalkText(zeTurbo, k));
      expect(rivalTalkText(zeTurbo, k, { you: 0, rival: 0 })).toBe(rivalTalkText(zeTurbo, k));
    }
    expect(rivalTalkText(zeTurbo, 'taunt', score.you)).toBe(rivalBalloon(zeTurbo, 'taunt', score.you));
  });

  it('piloto fora do elenco (copa nova) cai na personalidade, sem lançar', () => {
    const r = rivalByName('Fulano');
    expect(() => rivalLineFor(r, 'intro', score.rival)).not.toThrow();
    expect(rivalLineFor(r, 'intro', score.rival)).toContain('6 × 2');
  });
});

describe('as frases novas: PT e EN, curtas e sem palavrão', () => {
  it('as 12 frases (4 personalidades × 3 estados) existem nos dois idiomas, com {r} e {y}, até 70 caracteres', () => {
    const lang = getLanguage();
    for (const l of ['pt', 'en'] as const) {
      setLanguage(l);
      for (const p of PERSONALITIES) for (const s of STATES) {
        const key = `rivals.score.${p}.${s}`;
        const raw = t(key);
        expect(raw, `${l} ${key}`).not.toBe(key);
        expect(raw).toContain('{r}');
        expect(raw).toContain('{y}');
        expect(t(key, { r: 12, y: 12 }).length, `${l} ${key}`).toBeLessThanOrEqual(70);
      }
    }
    setLanguage(lang);
  });

  it('nenhuma fala de rival (as de sempre e as novas), em PT ou EN, tem palavrão', () => {
    const lang = getLanguage();
    for (const l of ['pt', 'en'] as const) {
      setLanguage(l);
      const keys: string[] = [];
      for (const name of new Set([...Object.values(CUP_RIVALS), ...AI_DRIVERS])) {
        const key = cupRivalKey(name);
        for (const k of RIVAL_LINE_KINDS) keys.push(`rivals.line.${key}.${k}`);
      }
      for (const p of PERSONALITIES) {
        for (const k of RIVAL_LINE_KINDS) keys.push(`rivals.generic.${p}.${k}`);
        for (const s of STATES) keys.push(`rivals.score.${p}.${s}`);
      }
      for (const key of keys) {
        const text = clean(t(key, { r: 7, y: 5 }));
        if (text === clean(key)) continue; // fala própria que não existe: cai na genérica
        for (const bad of BAD) expect(text, `${l} ${key}`).not.toContain(bad);
      }
    }
    setLanguage(lang);
  });
});

function cupRivalKey(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
