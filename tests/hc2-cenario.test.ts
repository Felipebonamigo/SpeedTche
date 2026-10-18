// V10 (HC2), C: volume do cenário perto da pista. O Horizon Chase 2 pinta rochas, árvores e arbustos com gradiente (claro em cima, escuro embaixo, luz no topo
// virado para o céu); os nossos eram quase chapados (razão topo ÷ pé da luminância ≈ 1,3 nos arbustos e 1,65 nas rochas). Por vértice, sem geometria nem
// textura nova: nenhuma chamada e nenhum triângulo a mais no gate. Medido aqui na cor por vértice dos modelos do catálogo (terço de cima ÷ terço de baixo).
import { describe, expect, it } from 'vitest';
import { BUILDER_IDS, getModel, spriteVisual } from '../src/render/scenery/catalog';
import { getTrack } from '../src/core/track';

const lum = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const GROUPS: Record<string, { pick: (id: string) => boolean; ratio: number; base: number }> = {
  bush: { pick: (i) => i.startsWith('bush:') && i !== 'bush:hedge', ratio: 1.9, base: 0.2027 },
  rock: { pick: (i) => i.startsWith('rock:') && i !== 'rock:snowy', ratio: 2.3, base: 0.1825 },
  mesa: { pick: (i) => i.startsWith('mesa:') || i.startsWith('stack:'), ratio: 1.8, base: 0.2351 },
  farRock: { pick: (i) => /^far:(rock|boulder)/.test(i), ratio: 1.75, base: 0.2386 },
  tree: { pick: (i) => /^tree:/.test(i) && !/ipe-yellow|beech|maple-orange/.test(i), ratio: 2.0, base: 0.217 },
};

/** Mediana da razão (luminância média do terço de cima ÷ a do terço de baixo) do grupo, e a luminância média de todos os vértices. */
function measure(pick: (id: string) => boolean): { median: number; mean: number } {
  const ratios: number[] = []; let sum = 0; let n = 0;
  for (const id of BUILDER_IDS.filter(pick)) {
    const m = getModel(id);
    let ymin = Infinity; let ymax = -Infinity;
    for (const p of m.parts) { const a = p.geometry.attributes.position; for (let i = 0; i < a.count; i++) { ymin = Math.min(ymin, a.getY(i)); ymax = Math.max(ymax, a.getY(i)); } }
    let lo = 0; let nl = 0; let hi = 0; let nh = 0;
    for (const p of m.parts) {
      const a = p.geometry.attributes.position; const c = p.geometry.attributes.color;
      if (!c) continue;
      for (let i = 0; i < a.count; i++) {
        const t = (a.getY(i) - ymin) / Math.max(1e-6, ymax - ymin); const l = lum(c.getX(i), c.getY(i), c.getZ(i));
        sum += l; n++;
        if (t < 0.33) { lo += l; nl++; } else if (t > 0.66) { hi += l; nh++; }
      }
    }
    if (nl && nh) ratios.push(hi / nh / Math.max(1e-6, lo / nl));
  }
  ratios.sort((x, y) => x - y);
  return { median: ratios[Math.floor(ratios.length / 2)], mean: sum / n };
}

describe('C. gradiente vertical nas rochas, árvores e arbustos', () => {
  for (const [name, g] of Object.entries(GROUPS)) {
    it(`${name}: o topo é ≥ ${g.ratio}× mais claro que o pé (mediana do grupo) e a luminância média fica a ±15% da de antes (${g.base})`, () => {
      const r = measure(g.pick);
      expect(r.median, `${name} razão topo ÷ pé`).toBeGreaterThanOrEqual(g.ratio);
      expect(r.mean, `${name} luminância média`).toBeGreaterThanOrEqual(g.base * 0.85);
      expect(r.mean, `${name} luminância média`).toBeLessThanOrEqual(g.base * 1.15);
    });
  }
});

describe('C. mais variação de escala perto da pista', () => {
  it('a altura varia ≥ ±24% nas árvores, ≥ ±28% nas rochas e ≥ ±38% nos arbustos (eram 18%, 12% e 25%): a largura segue a colisão', () => {
    const def = getTrack('copacabana').def;
    expect(spriteVisual('tree', 0, 1, def).heightJitter).toBeGreaterThanOrEqual(0.24);
    expect(spriteVisual('boulder', 0, 1, def).heightJitter).toBeGreaterThanOrEqual(0.28);
    expect(spriteVisual('bush', 0, 1, def).heightJitter).toBeGreaterThanOrEqual(0.38);
  });
});
