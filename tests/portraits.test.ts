// O4: retratos procedurais dos pilotos (docs/ondas/O/O4.md §4.5, grupo F): 20 rostos distintos × 3 expressões, determinísticos, SVG sem
// nada externo nem script, e nome desconhecido (humano) sem lançar.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_DRIVERS, CUP_RIVALS } from '../src/core/data/drivers';
import { FACES, portrait, portraitFeatures, portraitSvg, type Face } from '../src/ui/art/portraits';
import { installDocument } from './ui-fake';

/** Confere que as marcações abrem e fecham em ordem (o SVG nosso é pequeno e sem texto). */
function wellFormed(svg: string): boolean {
  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    const [, closing, tag, , selfClosing] = m;
    if (selfClosing) continue;
    if (closing) { if (stack.pop() !== tag) return false; } else stack.push(tag);
  }
  return stack.length === 0 && svg.startsWith('<svg') && svg.endsWith('</svg>');
}

describe('retratos', () => {
  it('há 3 expressões: provoca, venceu, perdeu', () => {
    expect([...FACES]).toEqual(['taunt', 'win', 'lose']);
  });

  it('os 20 pilotos (e os 12 rivais entre eles) têm 20 rostos diferentes, cada um com 3 expressões diferentes: 60 desenhos distintos', () => {
    expect(AI_DRIVERS).toHaveLength(20);
    for (const rival of new Set(Object.values(CUP_RIVALS))) expect(AI_DRIVERS).toContain(rival);
    const all = new Set<string>();
    for (const name of AI_DRIVERS) for (const f of FACES) all.add(portraitSvg(name, f));
    expect(all.size).toBe(60);
  });

  it('dois pilotos quaisquer diferem em pelo menos 3 traços (não é só a cor do fundo)', () => {
    for (let i = 0; i < AI_DRIVERS.length; i++) for (let j = i + 1; j < AI_DRIVERS.length; j++) {
      const a = portraitFeatures(AI_DRIVERS[i]);
      const b = portraitFeatures(AI_DRIVERS[j]);
      const diff = (Object.keys(a) as Array<keyof typeof a>).filter((k) => a[k] !== b[k]).length;
      expect(diff, `${AI_DRIVERS[i]} × ${AI_DRIVERS[j]}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('é determinístico e a expressão não muda quem a pessoa é (mesmos traços nas 3)', () => {
    for (const name of AI_DRIVERS) {
      for (const f of FACES) expect(portraitSvg(name, f)).toBe(portraitSvg(name, f));
      expect(portraitFeatures(name)).toEqual(portraitFeatures(name));
    }
  });

  it('SVG bem formado, sem script, ligação externa, manipulador de evento nem o nome', () => {
    for (const name of [...AI_DRIVERS, 'Fulano', '', '<script>alert(1)</script>', 'x'.repeat(500), 'Zé "Turbo" & Cia']) {
      for (const f of FACES) {
        const svg = portraitSvg(name, f);
        expect(wellFormed(svg), `${name} ${f}`).toBe(true);
        expect(svg).not.toMatch(/<script|href=|xlink|javascript:|\son\w+=|https?:|<image|<foreignObject/i);
        if (name.length > 0) expect(svg).not.toContain(name);
        expect(svg).toContain(`data-face="${f}"`);
        expect(svg).toContain('aria-hidden="true"');
      }
    }
  });

  it('nome desconhecido (um humano) ganha um rosto estável', () => {
    expect(portraitSvg('Felipe', 'win')).toBe(portraitSvg('Felipe', 'win'));
    expect(portraitSvg('Felipe', 'win')).not.toBe(portraitSvg('Bia', 'win'));
  });

  it('o tamanho vai no desenho e a expressão errada cai na de provocar, sem lançar', () => {
    expect(portraitSvg('Zé Turbo', 'win', 48)).toContain('width="48"');
    expect(portraitSvg('Zé Turbo', 'win', 48)).toContain('height="48"');
    expect(portraitSvg('Zé Turbo', 'nada' as Face)).toBe(portraitSvg('Zé Turbo', 'taunt'));
  });
});

describe('portrait() no DOM', () => {
  beforeEach(() => { installDocument(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('devolve o elemento SVG com a marcação do retrato', () => {
    const el = portrait('Zé Turbo', 'lose', 40) as unknown as { innerHTML: string };
    expect(el.innerHTML).toBe(portraitSvg('Zé Turbo', 'lose', 40));
  });
});
