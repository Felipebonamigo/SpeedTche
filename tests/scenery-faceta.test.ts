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

/**
 * Marcos que ainda passam de 15° depois da M3 (medido: araucária 19,0°, bonecos de Olinda 18,4°, cajueiro 18,2°, shisa 16,9°). O marco é montado no nível pleno de
 * arredondamento e cai de nível quando estoura o orçamento do lugar (`fitted`, landmarks/kit.ts); estes quatro só cabem no nível 0 (a geometria de antes) ou têm
 * o sub-modelo montado em escala 1 e ampliado depois (o refino por tamanho do `paint` não vê o tamanho final). Cada linha é uma pendência da frente, não uma exceção.
 */
const PENDENTES: Record<string, string> = {
  araucaria: 'as 18 copas de 8 m pedem 180 faces cada e o orçamento "perto" (3.500) não deixa: só cabe no nível 0',
  cajueiro_gigante: 'as copas de 20 m pedem 320 faces e o orçamento "perto" (3.500) não deixa: só cabe no nível 0',
  bonecos_olinda: 'os bonecos são sub-modelos de escala 1 ampliados depois: o refino por tamanho não vê a cabeça de 4 m',
  shisa: 'a shisa é um sub-modelo de escala 1 ampliado depois: o refino por tamanho não vê o corpo de 3 m',
};

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

  it('nenhum modelo passa de 15° de faceta (a silhueta de longe, de 40°), salvo os marcos da lista de pendências', () => {
    const bad: string[] = [];
    for (const id of ids) {
      if (id.startsWith('lm:') && id.slice(3) in PENDENTES) continue;
      const lie = facetOf(id, getModel(id));
      const cap = id.startsWith('far:') ? FAR_MAX : FACET_MAX;
      if (lie > cap) bad.push(`${id}: ${lie.toFixed(1)}° (máx. ${cap}°)`);
    }
    expect(bad, `${bad.length} modelos com faceta`).toEqual([]);
  }, 180000);

  it('a lista de pendências só encolhe: marco que já cabe nos 15° sai dela (e a lista não esconde ninguém que passa)', () => {
    const passa: string[] = [];
    for (const id of Object.keys(PENDENTES)) {
      expect(`lm:${id}` in Object.fromEntries(ids.map((i) => [i, 1])), `${id} não é um marco`).toBe(true);
      if (facetOf(`lm:${id}`, getModel(`lm:${id}`)) <= FACET_MAX) passa.push(id);
    }
    expect(passa, 'tire da lista de pendências').toEqual([]);
  });

  it('o detector separa a malha grossa da fina e dá 0 na caixa (a quina viva é de projeto, não faceta)', async () => {
    const THREE = await import('three');
    const { ico, paint, box } = await import('../src/render/scenery/geom');
    // O `cyl` e o `cone` do geom.ts já sobem de 8–13 lados para 14 e 16: o detector mede os do three, crus.
    const cyl = (r: number, r2: number, h: number, seg: number, open: boolean) => new THREE.CylinderGeometry(r, r2, h, seg, 1, open);
    const cone = (r: number, h: number, seg: number) => new THREE.ConeGeometry(r, h, seg);
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
