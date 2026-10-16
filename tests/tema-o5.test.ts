// T8 (docs/ondas/T8-pontas.md, item 8): as classes do progresso (O5) ficaram com CSS provisório em `progress.css`; o tema padrão `speedtche`
// as pinta no visual dele (vidro escuro, itálico com contorno como o HUD da V5, acento laranja/rosa/azul). Aqui: cada classe tem regra no
// tema, e o texto que o tema pinta tem contraste ≥ 4,5:1 contra o pior fundo do vidro (o vidro do tema sobre um cenário claro). O layout
// (nada estoura) é do scripts/playtest-layout.mjs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(join(__dirname, '..', 'src', 'ui', 'temas', 'tema-speedtche.css'), 'utf8');
const P = ':root[data-tema="speedtche"]';

/** As regras cujo seletor menciona `cls` (texto exato), com o corpo. */
function rulesFor(cls: string): string[] {
  const out: string[] = [];
  for (const m of CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)) if (m[1].split(',').some((s) => s.includes(P) && s.includes(cls))) out.push(m[2]);
  return out;
}

const hex = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]: number[]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = (top: number[], alpha: number, under: number[]) => top.map((c, i) => c * alpha + under[i] * (1 - alpha));
/** O pior fundo do texto: o vidro do tema (rgba(8,10,18,0.62)) sobre um cenário claro (#b8c0cc, o céu de dia mais claro do menu). */
const WORST_BG = over([8, 10, 18], 0.62, [184, 192, 204]);

const CLASSES = [
  '.sel-lock', '.lock-icon', '.lock-value', '.car-hero.is-locked', '.tp-car.is-locked', '.tp-lock', '.lock-note.online-lock',
  '.lvl-badge[data-frame="base"]', '.lvl-badge[data-frame="bronze"]', '.lvl-badge[data-frame="prata"]', '.lvl-badge[data-frame="ouro"]',
  '.lvl-badge[data-frame="nitro"]', '.xp-tag', '.xp-tag.up', '.prog-chip', '.results-ach-head', '.prog-chip-compact',
];

describe('O5 no tema speedtche', () => {
  it.each(CLASSES)('%s tem regra no tema', (cls) => {
    expect(rulesFor(cls).length, cls).toBeGreaterThan(0);
  });

  it('o texto pintado pelo tema nas classes do O5 tem contraste ≥ 4,5:1 contra o pior fundo do vidro', () => {
    const seen: string[] = [];
    for (const cls of CLASSES) {
      for (const body of rulesFor(cls)) {
        for (const m of body.matchAll(/(?:^|;)\s*color:\s*(#[0-9a-f]{6})/gi)) {
          seen.push(cls);
          expect(contrast(hex(m[1]), WORST_BG), `${cls} ${m[1]}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
    expect(seen.length).toBeGreaterThanOrEqual(6);
  });

  it('os números do nível e do XP no estilo do HUD da V5: itálico com contorno escuro por baixo da tinta', () => {
    for (const cls of ['.lvl-n', '.xp-tag']) {
      const body = rulesFor(cls).join(';');
      expect(body, cls).toMatch(/font-style:\s*italic/);
      expect(body, cls).toMatch(/paint-order:\s*stroke fill/);
      expect(body, cls).toMatch(/-webkit-text-stroke/);
    }
  });

  it('o tema só repinta: nenhuma regra do O5 mexe em tamanho, margem, padding, largura de borda ou peso de fonte', () => {
    for (const cls of CLASSES.concat(['.lvl-n'])) {
      for (const body of rulesFor(cls)) {
        expect(body, cls).not.toMatch(/(^|[;\s])(width|height|margin|padding|font-size|font-weight|line-height|border-width|gap|letter-spacing)\s*:/);
      }
    }
  });
});
