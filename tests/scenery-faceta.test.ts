// A faceta da bíblia (docs/DIRECAO-DE-ARTE.md §2, item 1 e §4: "faceta visível ≤ 15°; o teste da M3 mede"), medida em TODOS os modelos do jogo — os ids de
// todas as pistas, o registro fixo do catálogo, uma grade de prédios e torres e os 161 marcos —, não só nos heróis da L4. A régua é a da L4
// (`tests/scenery-medidas.ts`, `normalLie`): o ângulo médio entre a normal lisa de cada canto e a normal da própria face, pesado pela área e pelo ângulo do
// canto. Malha grossa sob luz lisa é redonda por dentro e de gomos no contorno; a normal só "mente" o quanto a malha é grossa. Sai da conta o canto
// vivo (a quina de 90° é de projeto: caixa, beiral, degrau) — por isso os prédios e os marcos têm, à parte, o teste da quina chanfrada
// (`scenery-predios`, `landmarks-bisel`). Medido sobre o liso e as quatro fachadas (`LIT_MATS`). Tudo no Node, sem DOM.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTrack, TRACKS } from '../src/core/track';
import { BUILDER_IDS, getModel } from '../src/render/scenery/catalog';
import { sceneryLayout } from '../src/render/scenery/layout';
import { LANDMARKS } from '../src/render/scenery/landmarks';
import { facetOf, normalLie } from './scenery-medidas';

/**
 * O teto da bíblia e o da silhueta de longe. O `far:` é o impostor (≤ 60 triângulos, `farFrom` a 208–360 m: uma árvore de 5,5 m ocupa ~14 pixels
 * a 360 m): ele paga os triângulos do orçamento (`scenery-forma`), então a régua dele é só não voltar a ser um poliedro de poucas faces (icosaedro de
 * 20 faces = 37°).
 */
const FACET_MAX = 15;
const FAR_MAX = 40;

const ids = (() => {
  const s = new Set<string>(BUILDER_IDS);
  for (const d of TRACKS) for (const id of sceneryLayout(getTrack(d.id)).models) s.add(id);
  // Prédios e torres têm parâmetros no id: a grade cobre os três tamanhos e as variações de cor/semente que o catálogo sorteia.
  for (const type of ['glass', 'glassgold', 'apt', 'aptbeach', 'classic', 'classicwarm', 'brick']) for (const f of [4, 9, 16]) for (const v of [0, 1, 2]) s.add(`bld:${type}:${f}:${v}`);
  for (const v of [0, 1, 2]) s.add(`bld:warehouse:0:${v}`);
  for (const type of ['tv', 'mast', 'spire', 'dome', 'lighthouse', 'water', 'windpump']) for (const v of [0, 1, 2]) s.add(`tower:${type}:3.15:${v}`);
  for (const k of Object.keys(LANDMARKS)) s.add(`lm:${k}`);
  return [...s].sort();
})();

describe('faceta da bíblia: todos os modelos', () => {
  it('cobre o jogo inteiro (as pistas, o catálogo, a grade de prédios e os 161 marcos)', () => {
    expect(ids.length).toBeGreaterThan(520);
    expect(ids.filter((i) => i.startsWith('lm:')).length).toBe(161);
    expect(ids.filter((i) => i.startsWith('bld:')).length).toBeGreaterThan(40);
  });

  it('nenhum modelo passa de 15° de faceta (a silhueta de longe, de 25°)', () => {
    const bad: string[] = [];
    for (const id of ids) {
      const lie = facetOf(id, getModel(id));
      const cap = id.startsWith('far:') ? FAR_MAX : FACET_MAX;
      if (lie > cap) bad.push(`${id}: ${lie.toFixed(1)}° (máx. ${cap}°)`);
    }
    expect(bad, `${bad.length} modelos com faceta`).toEqual([]);
  }, 180000);

  it('o detector separa a malha grossa da fina e dá 0 na caixa (a quina viva é de projeto, não faceta)', async () => {
    const { ico, paint, box, cyl, cone } = await import('../src/render/scenery/geom');
    const { smoothNormals } = await import('../src/render/normals');
    const lieOf = (g: Parameters<typeof paint>[0], crease = 60) => normalLie([{ geometry: smoothNormals(paint(g, '#3a8a3a'), crease), mat: 'flat' }]);
    expect(lieOf(ico(1, 0))).toBeGreaterThan(30);
    expect(lieOf(ico(1, 1))).toBeGreaterThan(FACET_MAX);
    expect(lieOf(ico(1, 2))).toBeLessThan(FACET_MAX);
    expect(lieOf(cyl(1, 1, 2, 8, true))).toBeGreaterThan(FACET_MAX);
    expect(lieOf(cyl(1, 1, 2, 14, true))).toBeLessThan(FACET_MAX);
    expect(lieOf(cone(1, 2, 10))).toBeGreaterThan(FACET_MAX);
    expect(lieOf(cone(1, 2, 16))).toBeLessThan(FACET_MAX);
    expect(lieOf(box(2, 2, 2), 40)).toBe(0);
  });
});

describe('faceta da bíblia: a extrusão dos marcos tem bisel', () => {
  const dir = join(__dirname, '..', 'src', 'render', 'scenery', 'landmarks');
  it('nenhum arquivo de marcos extruda com `bevelEnabled: false` (era o que fazia a parede, o arco e o contorno virarem caixa)', () => {
    const bad: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
      const text = readFileSync(join(dir, f), 'utf8');
      text.split('\n').forEach((line, i) => { if (/bevelEnabled\s*:\s*false/.test(line)) bad.push(`${f}:${i + 1}`); });
    }
    expect(bad).toEqual([]);
  });
});
