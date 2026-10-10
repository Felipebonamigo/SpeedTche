// Cristo Redentor e Pão de Açúcar como heróis-régua (onda L, L4; cronograma: "refeitos como heróis-régua, procedurais no padrão novo
// até a arte contratada chegar: só a malha muda, `perLap`, `place` e `side` ficam iguais"). A régua de leitura é a vista de frente
// (tests/front-view.ts): o que o jogador vê a 300 m na névoa. Os heróis são o padrão da forma redonda: sem faceta visível, com a
// oclusão assada e a cor lisa — e cabem no orçamento do horizonte (2.500 triângulos) com a MESMA caixa de medida dos antigos (a
// conta de enquadramento, sight.ts, lê `modelBounds`: se a caixa mudasse, o lugar escolhido e os segundos à vista mudariam).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LANDMARK_PLAZAS } from '../src/core/track/plazas';
import { getModel } from '../src/render/scenery/catalog';
import { LANDMARKS } from '../src/render/scenery/landmarks';
import { checkLandmarkModel } from '../src/render/scenery/landmarks/check';
import { frontView, hsl } from './front-view';
import { edgeStats, normalLie } from './scenery-medidas';

/** A caixa dos modelos de antes (medida em 9db0a2f): os novos ficam a ±3% do tamanho de cada eixo. */
const OLD = {
  cristo_redentor: { minX: -233.68, maxX: 159.35, minY: -103.31, maxY: 291.69, minZ: -135.38, maxZ: 156.56 },
  pao_de_acucar: { minX: -154.86, maxX: 144.26, minY: -68.66, maxY: 176.87, minZ: -221.42, maxZ: 240.47 },
} as const;
const IDS = ['cristo_redentor', 'pao_de_acucar'] as const;

const tris = (id: string): number => getModel(`lm:${id}`).parts.reduce((s, p) => s + p.geometry.getAttribute('position').count / 3, 0);
const boundsOf = (id: string): Record<keyof (typeof OLD)['cristo_redentor'], number> => {
  const box = new THREE.Box3();
  for (const p of getModel(`lm:${id}`).parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox as THREE.Box3); }
  return { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, minZ: box.min.z, maxZ: box.max.z };
};

describe('heróis-régua: contrato (nada do que o resto do jogo lê muda)', () => {
  it('perLap, place e side iguais aos de antes; o registro de praças não foi tocado', () => {
    expect(LANDMARKS.cristo_redentor).toMatchObject({ place: 'skyline', side: 'land', perLap: 2 });
    expect(LANDMARKS.pao_de_acucar).toMatchObject({ place: 'skyline', side: 'sea', perLap: 2 });
    expect(LANDMARK_PLAZAS.cristo_redentor).toBeDefined();
    expect(LANDMARK_PLAZAS.cristo_redentor).toBe(LANDMARK_PLAZAS.pao_de_acucar); // os dois do horizonte: a mesma regra
  });

  for (const id of IDS) {
    it(`${id}: passa no validador de marco (horizonte), custa entre 1.200 e 2.500 triângulos e tem a caixa de antes (±3%)`, () => {
      expect(checkLandmarkModel(getModel(`lm:${id}`), 'skyline')).toEqual([]);
      expect(tris(id)).toBeGreaterThanOrEqual(1200);
      expect(tris(id)).toBeLessThanOrEqual(2500);
      const b = boundsOf(id); const o = OLD[id];
      for (const [lo, hi] of [['minX', 'maxX'], ['minY', 'maxY'], ['minZ', 'maxZ']] as const) {
        const span = o[hi] - o[lo];
        expect(Math.abs(b[lo] - o[lo]), `${id} ${lo}`).toBeLessThanOrEqual(span * 0.03);
        expect(Math.abs(b[hi] - o[hi]), `${id} ${hi}`).toBeLessThanOrEqual(span * 0.03);
      }
    });
  }
});

describe('heróis-régua: forma redonda e luz assada', () => {
  for (const id of IDS) {
    it(`${id}: nenhuma faceta visível (a normal lisa fica, em média, a ≤ 15° da face) e a cor corre lisa (≤ 1% de salto entre faces vizinhas)`, () => {
      const parts = getModel(`lm:${id}`).parts;
      expect(normalLie(parts), `${id} faceta`).toBeLessThanOrEqual(15);
      let jump = 0;
      for (const p of parts) if (p.mat === 'flat') jump = Math.max(jump, edgeStats(p.geometry, 50).maxJump);
      expect(jump, `${id} mancha por face`).toBeLessThanOrEqual(0.01);
    });
  }

  it('a oclusão está assada: o pedestal do Cristo é de uma pedra só e a cor dele varia ≥ 10% (só a oclusão faz isso)', () => {
    const g = getModel('lm:cristo_redentor').parts[0].geometry;
    const pos = g.getAttribute('position') as THREE.BufferAttribute; const col = g.getAttribute('color') as THREE.BufferAttribute;
    let lo = Infinity; let hi = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      // o pedestal: do mirante (y ≈ 192) ao começo da túnica (y ≈ 216), dentro da base dele (24 m de lado em volta de x = −14, z = 6)
      if (pos.getY(i) > 192.5 && pos.getY(i) < 215.5 && Math.abs(pos.getX(i) + 14) < 13 && Math.abs(pos.getZ(i) - 6) < 13) { lo = Math.min(lo, col.getY(i)); hi = Math.max(hi, col.getY(i)); }
    }
    expect(Number.isFinite(lo)).toBe(true);
    expect((hi - lo) / hi).toBeGreaterThanOrEqual(0.1);
  });
});

describe('heróis-régua: leitura de frente', () => {
  const rowsAbove = (fv: ReturnType<typeof frontView>, y: number): number => Math.round(y - fv.y0);

  it('Cristo: os braços abertos passam de 4× a largura do corpo, a cabeça fica acima deles, a estátua é pedra clara e o morro é mata', () => {
    const fv = frontView(getModel('lm:cristo_redentor'), 1);
    const width = (y: number): number => { let n = 0; for (let q = 0; q < fv.cols; q++) if (fv.at(q, rowsAbove(fv, y))) n++; return n; };
    const body = width(245); // a túnica, abaixo dos braços
    const arms = width(277.5); // a altura dos braços (ya = 277,5)
    expect(body).toBeGreaterThan(4);
    expect(arms / body, 'envergadura ÷ corpo').toBeGreaterThanOrEqual(4);
    // a cabeça: o ponto mais alto fica sobre o eixo do corpo (z ≈ 6), acima dos braços
    let topRow = 0; let topCol = 0;
    for (let r = 0; r < fv.rows; r++) for (let q = 0; q < fv.cols; q++) if (fv.at(q, r)) { topRow = r; topCol = q; }
    expect(Math.abs(fv.z0 + topCol - 6), 'cabeça no eixo').toBeLessThanOrEqual(6);
    expect(fv.y0 + topRow).toBeGreaterThan(285);
    // a estátua (acima de 215 m): ≥ 70% das células de pedra clara
    let light = 0; let total = 0;
    for (let r = rowsAbove(fv, 218); r < fv.rows; r++) for (let q = 0; q < fv.cols; q++) { const c = fv.at(q, r); if (!c) continue; total++; if (hsl(c).l > 0.6) light++; }
    expect(light / total, 'estátua clara').toBeGreaterThanOrEqual(0.7);
    // o morro: abaixo do mirante (y < 150) ≥ 60% das células são mata (verde)
    let green = 0; let all = 0;
    for (let r = 0; r < rowsAbove(fv, 150); r++) for (let q = 0; q < fv.cols; q++) {
      const c = fv.at(q, r); if (!c) continue; all++;
      const { h, s } = hsl(c);
      if (h > 0.17 && h < 0.45 && s > 0.15) green++;
    }
    expect(green / all, 'morro de mata').toBeGreaterThanOrEqual(0.6);
  });

  it('Pão de Açúcar: duas cúpulas de granito (o Pão ≥ 1,6× a Urca), mata só no pé e no cocuruto, cabo ligando as duas e cabines vermelhas', () => {
    const fv = frontView(getModel('lm:pao_de_acucar'), 1);
    // perfil do alto por coluna (z): máximos locais com folga de 20 m
    const top: number[] = [];
    for (let q = 0; q < fv.cols; q++) { let t = -1; for (let r = fv.rows - 1; r >= 0; r--) if (fv.at(q, r)) { t = r; break; } top.push(t + fv.y0); }
    const peaks: Array<{ z: number; y: number }> = [];
    for (let q = 0; q < fv.cols; q++) {
      if (top[q] < 40) continue;
      if (top[q] < Math.max(...top.slice(Math.max(0, q - 8), q + 9))) continue; // só o mais alto da vizinhança de ±8 m
      if (peaks.length === 0 || q + fv.z0 - peaks[peaks.length - 1].z > 16) peaks.push({ z: q + fv.z0, y: top[q] });
    }
    const sorted = [...peaks].sort((a, b) => b.y - a.y);
    expect(sorted.length, 'cúpulas').toBeGreaterThanOrEqual(2);
    expect(sorted[0].y / sorted[1].y, 'Pão ÷ Urca').toBeGreaterThanOrEqual(1.6);
    expect(sorted[0].y / sorted[1].y).toBeLessThanOrEqual(2.4);
    // a faixa do meio das cúpulas (40–150 m) é pedra: ≥ 60% das células de baixa saturação
    let stone = 0; let all = 0;
    for (let r = Math.round(40 - fv.y0); r < Math.round(150 - fv.y0); r++) for (let q = 0; q < fv.cols; q++) {
      const c = fv.at(q, r); if (!c) continue;
      const { s, h } = hsl(c);
      if (h < 0.04 || h > 0.96) continue; // o vermelho das cabines fica fora da conta
      all++; if (s < 0.3) stone++;
    }
    expect(stone / all, 'granito').toBeGreaterThanOrEqual(0.6);
    // a cor mais saturada do conjunto é o vermelho das cabines (o bondinho se acha de longe)
    let best = 0; let bestHue = 0.33;
    for (let r = 0; r < fv.rows; r++) for (let q = 0; q < fv.cols; q++) { const c = fv.at(q, r); if (!c) continue; const { s, l, h } = hsl(c); const v = s * (1 - Math.abs(2 * l - 1)); if (v > best) { best = v; bestHue = h; } }
    expect(bestHue < 0.04 || bestHue > 0.96, `matiz mais saturado ${bestHue.toFixed(2)}`).toBe(true);
  });
});
