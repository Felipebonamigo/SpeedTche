// V22 / F4 — vegetação e cobertura (docs/ondas/V22-f4-vegetacao.md). Contratos escritos ANTES da mudança:
//  1. variação por instância: o tom de cada árvore varia em MATIZ (≥ ±6°) e em valor (≤ ±10%), e a escala não é uniforme (largura x ≠ z);
//  2. cada receita tropical, de savana e alpina planta ≥ 6 árvores de FORMA distinta (silhueta, não só a semente);
//  3. nada novo é sólido: os sprites do núcleo são os mesmos (colisão e `sim-golden` intactos) e o enfeite novo nunca é sprite;
//  4. a saia da árvore não lê como chapéu (aro claro, recorte de capim no contorno) e a copa leva oclusão pintada por baixo;
//  5. densidade por jogadores: sobe com 1–2 viewports (≤ +35 mil △), com 3–4 fica a de antes (≤ +15 mil △), a Baixa continua a mais barata.
import { describe, expect, it } from 'vitest';
import { getTrack, TRACKS } from '../src/core/track';
import { dressingRecipe, getModel, regionOf, spriteVisual } from '../src/render/scenery/catalog';
import { bandPoints } from '../src/render/scenery/geom';
import { baseLayout, lushScenery, sceneryLayout, tintFor } from '../src/render/scenery/layout';
import { modelTriangles } from '../src/render/scenery/vegetation';
import { frameCost } from './scenery-medidas';
import { meanVisibleTriangles } from '../tools/densidade-cenario';

const lum = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Matiz (graus) de uma cor RGB 0..1. */
function hueOf(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
  if (d < 1e-9) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}

/** Quanto o tom (multiplicador por canal) gira o matiz de uma cor de referência, em graus (− = para o amarelo, + = para o azul-esverdeado) e o quanto muda o valor (razão de luminância). */
function shiftOn(ref: [number, number, number], m: readonly [number, number, number]): { hue: number; value: number } {
  const [r, g, b] = ref;
  let dh = hueOf(r * m[0], g * m[1], b * m[2]) - hueOf(r, g, b);
  if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
  return { hue: dh, value: lum(r * m[0], g * m[1], b * m[2]) / lum(r, g, b) };
}

// Verdes de copa de verdade do catálogo (cor por vértice, linear): o tom é um multiplicador, então o giro de matiz é medido sobre eles.
const REFS: Array<[number, number, number]> = [[0.055, 0.2, 0.08], [0.09, 0.3, 0.1], [0.04, 0.26, 0.07]];

describe('F4 · variação por instância de matiz e valor', () => {
  it('tintFor gira o matiz por ≥ ±6° (nos dois sentidos) e o valor por no máximo ±10%', () => {
    for (const amount of [0.07, 0.09]) {
      let lo = Infinity; let hi = -Infinity; let vlo = Infinity; let vhi = -Infinity;
      for (let seed = 0; seed < 1500; seed++) {
        for (const ref of REFS) {
          const s = shiftOn(ref, tintFor(seed * 7 + 3, amount));
          lo = Math.min(lo, s.hue); hi = Math.max(hi, s.hue); vlo = Math.min(vlo, s.value); vhi = Math.max(vhi, s.value);
        }
      }
      expect(lo, `amount ${amount}: giro mínimo`).toBeLessThanOrEqual(-6);
      expect(hi, `amount ${amount}: giro máximo`).toBeGreaterThanOrEqual(6);
      expect(vlo, `amount ${amount}: valor mínimo`).toBeGreaterThanOrEqual(0.9);
      expect(vhi, `amount ${amount}: valor máximo`).toBeLessThanOrEqual(1.1);
    }
  });

  it('o enfeite de árvore do layout usa o tom novo e a escala não é uniforme (largura x ≠ z, ≥ ±12%)', () => {
    for (const id of ['foz_do_iguacu', 'passo_alpino']) {
      const layout = sceneryLayout(getTrack(id));
      let lo = Infinity; let hi = -Infinity; let nonUniform = 0; let trees = 0;
      for (const list of layout.bySeg) for (const p of list) {
        const mid = layout.models[p.model];
        if (p.sprite || !/^(tree|pine):/.test(mid)) continue;
        trees++;
        const s = shiftOn(REFS[1], [p.r, p.g, p.b]);
        lo = Math.min(lo, s.hue); hi = Math.max(hi, s.hue);
        if (Math.abs(p.sx / p.sz - 1) >= 0.12) nonUniform++;
      }
      expect(trees, id).toBeGreaterThan(300);
      expect(lo, `${id} giro mínimo`).toBeLessThanOrEqual(-6);
      expect(hi, `${id} giro máximo`).toBeGreaterThanOrEqual(6);
      expect(nonUniform / trees, `${id}: fração com x ≠ z`).toBeGreaterThan(0.5);
    }
  }, 120000);
});

// ───────────────────────────── Formas distintas por receita ─────────────────────────────

interface Shape { H: number; prof: number[] }
const shapes = new Map<string, Shape>();
/** Silhueta: altura e raio máximo (÷ altura) em 8 faixas de altura. Só as partes sólidas (o recorte de capim fica fora). */
function shapeOf(id: string): Shape {
  let s = shapes.get(id);
  if (s) return s;
  const m = getModel(id); let H = 0;
  for (const p of m.parts) { if (p.mat !== 'flat') continue; const a = p.geometry.attributes.position; for (let i = 0; i < a.count; i++) H = Math.max(H, a.getY(i)); }
  const prof = new Array<number>(8).fill(0);
  for (const p of m.parts) {
    if (p.mat !== 'flat') continue;
    const a = p.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) { const b = Math.min(7, Math.max(0, Math.floor((a.getY(i) / H) * 8))); prof[b] = Math.max(prof[b], Math.hypot(a.getX(i), a.getZ(i)) / H); }
  }
  s = { H, prof }; shapes.set(id, s);
  return s;
}
/**
 * Duas árvores são de forma distinta se a silhueta (o tronco e a copa, de 2 m para cima: as duas faixas de baixo são o chão e a saia, que variam com a semente) difere
 * ≥ 0,12 do raio relativo em alguma faixa, ou a altura difere ≥ 18%. A semente sozinha (mangueira 0 × 1, gigante 0 × 1, acácia 0 × 1) não passa de 0,10 / 9%.
 */
function distinct(a: Shape, b: Shape): boolean {
  if (Math.abs(Math.log(a.H / b.H)) >= Math.log(1.18)) return true;
  return a.prof.some((v, i) => i >= 2 && Math.abs(v - b.prof[i]) >= 0.12);
}
function distinctShapes(ids: string[]): number {
  const kept: Shape[] = [];
  for (const id of ids) { const s = shapeOf(id); if (kept.every((k) => distinct(k, s))) kept.push(s); }
  return kept.length;
}

describe('F4 · variantes de árvore por forma (receitas tropical, savana e alpina)', () => {
  const groups = new Map<string, { ids: string[]; track: string }>();
  for (const d of TRACKS) {
    if (d.scenery !== 'tropical' && d.scenery !== 'savanna' && d.scenery !== 'alpine') continue;
    const key = `${d.scenery}:${regionOf(d)}`;
    if (groups.has(key)) continue;
    const trees = dressingRecipe(d).groves.flatMap((g) => g.near).filter((id) => /^(tree|pine|palm):/.test(id));
    groups.set(key, { ids: [...new Set(trees)], track: d.id });
  }
  for (const [key, g] of groups) {
    it(`${key}: ≥ 6 formas de árvore distintas entre as plantadas (${g.track})`, () => {
      expect(distinctShapes(g.ids), g.ids.join(' ')).toBeGreaterThanOrEqual(6);
    });
  }

  it('as variantes extras das espécies dominantes diferem da base por forma, não só pela semente', () => {
    const pairs: Array<[string, string]> = [
      ['tree:mango:0', 'tree:mango:2'], ['tree:mango:0', 'tree:mango:3'], ['tree:giant:0', 'tree:giant:2'], ['tree:giant:0', 'tree:giant:3'],
      ['tree:acacia:0', 'tree:acacia:2'], ['tree:acacia:0', 'tree:acacia:3'], ['tree:oak', 'tree:oak:2'], ['tree:oak', 'tree:oak:3'],
      ['pine:spruce', 'pine:tall'], ['pine:spruce', 'pine:squat'],
    ];
    for (const [a, b] of pairs) expect(distinct(shapeOf(a), shapeOf(b)), `${a} × ${b}`).toBe(true);
  });

  it('toda variante nova mantém a pegada de colisão do sprite (a saia chega à meia largura da árvore em qualquer giro) e só usa os materiais que já existem', () => {
    const ids = [...new Set([...groups.values()].flatMap((g) => g.ids))].filter((id) => /^(tree|pine):/.test(id));
    expect(ids.length).toBeGreaterThan(15);
    const R = 0.25 * 7; // SPRITE_HALF_WIDTH.tree × ROAD_HALF_WIDTH_M
    for (const id of ids) {
      for (const p of getModel(id).parts) expect(['flat', 'cutout'], `${id}: material ${p.mat}`).toContain(p.mat);
      if (id === 'tree:banana' || id === 'tree:fern' || id.startsWith('pine:')) continue;
      // O ponto mais afastado do eixo, na faixa do carro (0,05–1,3 m; com os cruzamentos das arestas, como o `scenery.test`), tem de passar de 0,9 R.
      let reach = 0;
      for (const p of getModel(id).parts) if (p.mat === 'flat') bandPoints(p.geometry, 0.05, 1.3, (x, _y, z) => { reach = Math.max(reach, Math.hypot(x, z)); });
      expect(reach, `${id}: alcance na faixa do carro`).toBeGreaterThanOrEqual(R * 0.9);
    }
  });
});

describe('F4 · variedade de árvores em 80 m (pronto visual: "nenhuma árvore se repete em um trecho de 80 m")', () => {
  // Modelos de árvore distintos (tree:, pine:, palm:) por janela de 20 segmentos (80 m), média em janelas a cada 7 segmentos, no layout inteiro; medidos no `main` 603bffe.
  const BASE: Record<string, number> = { foz_do_iguacu: 9.0, serra_do_navio: 8.8, monte_fuji: 4.9, kruger: 3.2, passo_alpino: 5.9, autobahn: 2.7 };
  for (const [id, base] of Object.entries(BASE)) {
    it(`${id}: ≥ 1,35 × os ${base} modelos distintos por 80 m de antes`, () => {
      const track = getTrack(id); const layout = sceneryLayout(track); const n = track.segments.length;
      let sum = 0; let wins = 0;
      for (let s = 40; s + 20 < n; s += 7) {
        const ids = new Set<string>();
        for (let k = 0; k < 20; k++) for (const p of layout.bySeg[s + k]) { const m = layout.models[p.model]; if (/^(tree|pine|palm):/.test(m)) ids.add(m); }
        if (ids.size) { sum += ids.size; wins++; }
      }
      expect(sum / wins).toBeGreaterThanOrEqual(base * 1.35);
    }, 60000);
  }
});

// ───────────────────────────── Nada novo é sólido ─────────────────────────────

describe('F4 · o enfeite novo nunca é sólido', () => {
  it('os sprites do layout são exatamente os do núcleo (mesma conta de modelos por sprite) e o enfeite farto (`lush`) nunca é sprite', () => {
    for (const id of ['foz_do_iguacu', 'serra_do_navio', 'passo_alpino', 'copacabana', 'kruger']) {
      const track = getTrack(id);
      const layout = sceneryLayout(track);
      let expected = 0; let sprites = 0; let lush = 0;
      track.segments.forEach((seg, i) => {
        for (const sp of seg.sprites) expected += spriteVisual(sp.kind, sp.variant, sp.scale, track.def).models.length;
        for (const p of layout.bySeg[i]) { if (p.sprite) sprites++; if (p.lush) { lush++; expect(p.sprite, `${id}#${i}`).toBe(false); expect(p.rank, `${id}#${i}: o farto nunca aparece na Baixa`).toBeGreaterThan(0.5); } }
      });
      // `cullCrossings` pode tirar sprites que caem em outro trecho, mas nunca criar um.
      expect(sprites, id).toBeLessThanOrEqual(expected);
      expect(sprites, id).toBeGreaterThan(expected * 0.9);
      expect(lush, `${id}: tem enfeite farto`).toBeGreaterThan(400);
    }
  }, 120000);

  it('o enfeite farto de árvore alta nasce além do alcance do carro (|x| − raio ≥ CAR_REACH + 0,1)', () => {
    for (const id of ['foz_do_iguacu', 'passo_alpino']) {
      const layout = sceneryLayout(getTrack(id));
      for (const list of layout.bySeg) for (const p of list) {
        if (!p.lush || !/^(tree|pine|palm):/.test(layout.models[p.model])) continue;
        expect(Math.abs(p.x), `${id} ${layout.models[p.model]}`).toBeGreaterThanOrEqual(7 * 3.2 + 0.95 + 0.1 + 1.0);
      }
    }
  }, 60000);
});

// ───────────────────────────── Saia e oclusão pintada ─────────────────────────────

/** Luminância média dos vértices (partes `flat`) que passam no filtro (posição no referencial do modelo, escala 1). */
function meanLum(id: string, pick: (x: number, y: number, z: number) => boolean): { mean: number; n: number } {
  let sum = 0; let n = 0;
  for (const p of getModel(id).parts) {
    if (p.mat !== 'flat') continue;
    const a = p.geometry.attributes.position; const c = p.geometry.attributes.color;
    for (let i = 0; i < a.count; i++) if (pick(a.getX(i), a.getY(i), a.getZ(i))) { sum += lum(c.getX(i), c.getY(i), c.getZ(i)); n++; }
  }
  return { mean: n ? sum / n : 0, n };
}

const ROUND = ['tree:mango:0', 'tree:oak', 'tree:ipe-pink', 'tree:giant:0'];

describe('F4 · a saia da árvore não lê como chapéu', () => {
  it('o aro da saia (no chão, a ≥ 1,4 m do tronco) não é o ponto mais escuro: ≥ 0,62 da luminância da copa', () => {
    for (const id of ROUND) {
      const rim = meanLum(id, (x, y, z) => y < 0.2 && Math.hypot(x, z) > 1.4);
      const crown = meanLum(id, (_x, y) => y > 3.2);
      expect(rim.n, `${id}: vértices no aro`).toBeGreaterThan(10);
      expect(rim.mean / crown.mean, `${id}: aro ÷ copa`).toBeGreaterThanOrEqual(0.62);
    }
  });

  it('o contorno tem tufos de capim de recorte alfa (≥ 6 cartões = 12 △) dentro da pegada de colisão, no mesmo lote `cutout`', () => {
    for (const id of ROUND) {
      const cut = getModel(id).parts.filter((p) => p.mat === 'cutout');
      expect(cut.length, `${id}: parte de recorte`).toBeGreaterThan(0);
      let tris = 0; let far = 0;
      for (const p of cut) {
        const a = p.geometry.attributes.position; tris += a.count / 3;
        for (let i = 0; i < a.count; i++) far = Math.max(far, Math.hypot(a.getX(i), a.getZ(i)));
        expect(p.geometry.attributes.uv, `${id}: o cartão precisa de uv`).toBeDefined();
      }
      expect(tris, id).toBeGreaterThanOrEqual(12);
      expect(tris, `${id}: pouco: é enfeite, não cena`).toBeLessThanOrEqual(120);
      expect(far, `${id}: o capim não passa de 1,25 × a meia largura`).toBeLessThanOrEqual(1.75 * 1.25);
    }
  });
});

describe('F4 · oclusão pintada sob a copa', () => {
  it('a barriga da copa (quarto de baixo) é ≤ 0,44 do quarto de cima em luminância,', () => {
    for (const id of ROUND) {
      const pts: Array<[number, number]> = [];
      for (const p of getModel(id).parts) {
        if (p.mat !== 'flat') continue;
        const a = p.geometry.attributes.position; const c = p.geometry.attributes.color;
        for (let i = 0; i < a.count; i++) if (a.getY(i) > 2.4) pts.push([a.getY(i), lum(c.getX(i), c.getY(i), c.getZ(i))]);
      }
      pts.sort((x, y) => x[0] - y[0]);
      const q = Math.floor(pts.length / 4);
      const mean = (s: Array<[number, number]>): number => s.reduce((t, v) => t + v[1], 0) / s.length;
      expect(mean(pts.slice(0, q)) / mean(pts.slice(-q)), `${id}: barriga ÷ topo`).toBeLessThanOrEqual(0.44);
    }
  });

  it('a sombra da copa é fria: no quarto de baixo da copa a razão azul ÷ verde é ≥ 8% maior que no de cima (copas de um verde só: a do ipê tem uma cor por bolha)', () => {
    for (const id of ROUND.filter((i) => !i.includes('ipe'))) {
      const pts: Array<[number, number, number]> = [];
      for (const p of getModel(id).parts) {
        if (p.mat !== 'flat') continue;
        const a = p.geometry.attributes.position; const c = p.geometry.attributes.color;
        for (let i = 0; i < a.count; i++) if (a.getY(i) > 2.4 && Math.hypot(a.getX(i), a.getZ(i)) > 1.0) pts.push([a.getY(i), c.getY(i), c.getZ(i)]);
      }
      pts.sort((x, y) => x[0] - y[0]);
      const q = Math.floor(pts.length / 4);
      const ratio = (s: Array<[number, number, number]>): number => s.reduce((t, v) => t + v[2], 0) / s.reduce((t, v) => t + v[1], 0);
      expect(ratio(pts.slice(0, q)) / ratio(pts.slice(-q)), `${id}: azul ÷ verde da barriga contra o topo`).toBeGreaterThanOrEqual(1.08);
    }
  });
});

// ───────────────────────────── Densidade por jogadores ─────────────────────────────

describe('F4 · densidade por número de jogadores', () => {
  it('o cenário farto vale com 0–2 viewports e não com 3–4', () => {
    expect([0, 1, 2, 3, 4].map(lushScenery)).toEqual([true, true, true, false, false]);
  });

  // △ visíveis de cenário (sem o corte de câmera e sem o LOD de tela dividida por objeto, então SUPERESTIMA ~4×: a medição real em GL, `tools/folga-pista.mjs`, deu +7 mil onde esta conta dá +30 mil; ver
  // docs/ondas/V22-f4-vegetacao.md) medidos no `main` 603bffe, médias de 24 câmeras por pista. O limite do plano (≤ +35 mil △ reais por viewport em 1–2 jogadores) é o da medição real, não o desta conta.
  const BASE: Record<string, { low: number; medium: number; high: number; low2: number; medium2: number; high2: number }> = {
    foz_do_iguacu: { low: 60233, medium: 80263, high: 109167, low2: 37680, medium2: 51647, high2: 71780 },
    serra_do_navio: { low: 58450, medium: 76621, high: 100968, low2: 35705, medium2: 48400, high2: 65500 },
    passo_alpino: { low: 55537, medium: 68853, high: 85791, low2: 33487, medium2: 42426, high2: 53996 },
    kruger: { low: 51878, medium: 63592, high: 77851, low2: 31021, medium2: 38140, high2: 46979 },
    monte_fuji: { low: 58948, medium: 74394, high: 93249, low2: 35454, medium2: 45758, high2: 59028 },
  };
  for (const [id, b] of Object.entries(BASE)) {
    it(`${id}: 1 jogador ganha entre +12 e +60 mil △ (da conta de visíveis) na Alta; 2 jogadores ≤ +60 mil; 3–4 jogadores ≤ +15 mil; a Baixa não passa de +4 mil`, () => {
      const layout = sceneryLayout(getTrack(id));
      const t = (q: 'low' | 'medium' | 'high', v: number): number => meanVisibleTriangles(layout, q, v);
      const high1 = t('high', 1) - b.high; const high2 = t('high', 2) - b.high2; const high4 = t('high', 4) - b.high2; const high3 = t('high', 3) - b.high2;
      expect(high1, 'Alta 1p').toBeGreaterThanOrEqual(12000);
      expect(high1, 'Alta 1p').toBeLessThanOrEqual(60000);
      expect(high2, 'Alta 2p').toBeLessThanOrEqual(60000);
      expect(high2, 'Alta 2p sobe').toBeGreaterThanOrEqual(4000);
      expect(high3, 'Alta 3p').toBeLessThanOrEqual(15000);
      expect(high4, 'Alta 4p').toBeLessThanOrEqual(15000);
      expect(t('medium', 4) - b.medium2, 'Média 4p').toBeLessThanOrEqual(15000);
      expect(t('medium', 1) - b.medium, 'Média 1p').toBeLessThanOrEqual(35000);
      expect(t('low', 1) - b.low, 'Baixa 1p').toBeLessThanOrEqual(4000);
      expect(t('low', 4) - b.low2, 'Baixa 4p').toBeLessThanOrEqual(4000);
      expect(t('low', 1), 'Baixa < Média').toBeLessThan(t('medium', 1));
      expect(t('medium', 1), 'Média < Alta').toBeLessThan(t('high', 1));
    }, 120000);
  }

  it('o custo estático de quadro (o de `scenery-forma`) do layout INTEIRO fica ≤ 1.250 △ por segmento de janela e ≤ 16 objetos por segmento; o da lotação de 3–4 (`baseLayout`) não passa de +8% do de antes (781 no pior caso)', () => {
    const tris = new Map<string, number>();
    const trisOf = (m: string): number => { let t = tris.get(m); if (t === undefined) { t = modelTriangles(getModel(m)); tris.set(m, t); } return t; };
    let worstFull = 0; let worstBase = 0;
    for (const d of TRACKS) {
      const track = getTrack(d.id); const layout = sceneryLayout(track); const n = track.segments.length;
      worstFull = Math.max(worstFull, frameCost(layout, n, trisOf)); worstBase = Math.max(worstBase, frameCost(baseLayout(layout), n, trisOf));
      let objs = 0; for (const l of layout.bySeg) objs += l.length;
      expect(objs / n, `${d.id}: objetos por segmento`).toBeLessThanOrEqual(16);
    }
    expect(worstFull, 'pior pista, layout inteiro').toBeLessThanOrEqual(1250);
    expect(worstBase, 'pior pista, 3–4 jogadores').toBeLessThanOrEqual(781 * 1.08);
  }, 120000);

  it('a cobertura rente à pista é contínua: ≥ 8 tufos de forração por segmento e lado (entre 9,6 e 23 m; o tapete conta 3) com 1–2 jogadores, ≥ 4 com 3–4 (sem o enfeite farto)', () => {
    const layout = sceneryLayout(getTrack('foz_do_iguacu'));
    let segs = 0; let all = 0; let base = 0;
    layout.bySeg.forEach((list, i) => {
      if (i < 40) return; // fora da zona de largada
      for (const side of [-1, 1]) {
        let a = 0; let b = 0;
        for (const p of list) {
          const id = layout.models[p.model];
          if (p.sprite || !/^(tuft|flowers|pebbles|bush):/.test(id)) continue;
          if (Math.sign(p.x) !== side || Math.abs(p.x) < 9.6 || Math.abs(p.x) > 23.2) continue;
          const pieces = id.startsWith('tuft:patch') ? 3 : 1; // o tapete é um objeto de 3 tufos
          a += pieces; if (!p.lush) b += pieces;
        }
        segs++; all += a; base += b;
      }
    });
    expect(all / segs, 'peças por segmento e lado (farto)').toBeGreaterThanOrEqual(8);
    expect(base / segs, 'peças por segmento e lado (base, 3–4 jogadores)').toBeGreaterThanOrEqual(4);
  }, 60000);
});
