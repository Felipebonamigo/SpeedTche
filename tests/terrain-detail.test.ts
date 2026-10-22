// V22 · F1 (docs/ondas/V22-f1-chao.md): o chão com DETALHE ESTÁVEL. A parte pura e a de CPU (sem navegador): os parâmetros por bioma, o ladrilho do ruído
// (periódico no comprimento da pista, para a volta fechar sem emenda), o atributo `aDet` do `Strip` (lateral em m, distância ABSOLUTA ao longo em m: nunca
// a posição de mundo, porque o mundo é remontado no referencial do carro a cada quadro e o detalhe "nadaria"), o texto do remendo do shader e a barranca do Alpino.
// A parte na imagem (resíduo 5×5, estabilidade, Baixa) está em tests/terreno-detalhe-gl.test.ts.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTrack } from '../src/core/track';
import type { SceneryId } from '../src/core/types';
import { palette, SCENERIES } from '../src/render/palette';
import { buildRoadFrame } from '../src/render/roadframe';
import { COLS, Terrain } from '../src/render/terrain';
import {
  DETAIL_COARSE_M, DETAIL_FINE_M, DETAIL_TILE_CELLS, detailNoiseImage, detailTiling, embankmentRock, installTerrainDetail, terrainDetail,
} from '../src/render/terrain-detail';
import { SEGMENT_M, Y_SCALE } from '../src/render/units';
import { fakeCanvasDocument } from './canvas-fake';

describe('F1: os parâmetros do detalhe por bioma', () => {
  it('as amplitudes ficam em 0..0,16 (o chão não vira camuflagem), a oitava fina some só depois de 50 m e a deriva de matiz é pequena (≤ 6°)', () => {
    for (const b of SCENERIES) {
      const d = terrainDetail(b);
      for (const [nome, v] of [['coarseAmp', d.coarseAmp], ['fineAmp', d.fineAmp], ['grainAmp', d.grainAmp]] as const) {
        expect(v, `${b}.${nome}`).toBeGreaterThanOrEqual(0); expect(v, `${b}.${nome}`).toBeLessThanOrEqual(0.16);
      }
      expect(d.fadeM, `${b}.fadeM`).toBeGreaterThanOrEqual(50);
      expect(d.fadeEndM, `${b}.fadeEndM`).toBeGreaterThan(d.fadeM);
      expect(d.hueDeg, `${b}.hueDeg`).toBeGreaterThanOrEqual(0); expect(d.hueDeg).toBeLessThanOrEqual(6);
      for (const v of [...d.mow, ...d.ripple]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(0.16); }
    }
  });

  it('o capim (trópico, savana, serra) tem as DUAS escalas e a ceifa; o deserto e a areia têm o ondulado; a cidade quase não tem detalhe (é calçada e quadra)', () => {
    for (const b of ['tropical', 'savanna', 'alpine'] as const) {
      const d = terrainDetail(b);
      expect(d.coarseAmp, b).toBeGreaterThanOrEqual(0.08); expect(d.fineAmp, b).toBeGreaterThanOrEqual(0.07);
      expect(d.mow[0] + d.mow[1], `${b}: ceifa`).toBeGreaterThan(0);
    }
    expect(terrainDetail('desert').ripple[0] + terrainDetail('desert').ripple[1], 'deserto: ondulado').toBeGreaterThan(0);
    const coast = terrainDetail('coast'); // o lado do mar é areia (ondulado), o outro é capim (ceifa)
    expect(Math.max(...coast.ripple), 'costa: ondulado').toBeGreaterThan(0); expect(Math.max(...coast.mow), 'costa: ceifa').toBeGreaterThan(0);
    const city = terrainDetail('city_night');
    expect(city.coarseAmp + city.fineAmp, 'cidade').toBeLessThanOrEqual(0.12);
    expect(city.edge, 'cidade: sem borda irregular (a calçada é reta)').toBe(0);
  });

  it('o tamanho das duas escalas é o do plano: ~12 m e ~2,4 m', () => {
    expect(DETAIL_COARSE_M).toBe(12); expect(DETAIL_FINE_M).toBeCloseTo(2.4, 5);
  });
});

describe('F1: o ladrilho do ruído fecha na volta da pista', () => {
  it('o número de ladrilhos é inteiro e a célula grossa fica entre 9 e 15,5 m em qualquer comprimento de pista (de 800 m a 60 km)', () => {
    for (const len of [800, 1500, 3200, 6400, 12000, 25000, 60000]) {
      const t = detailTiling(len);
      expect(Number.isInteger(t.tiles), `${len} m`).toBe(true); expect(t.tiles).toBeGreaterThanOrEqual(1);
      expect(t.tiles / t.invPeriod, `${len} m: tiles/invPeriod = comprimento`).toBeCloseTo(len, 6);
      const cell = t.periodM / DETAIL_TILE_CELLS;
      expect(cell, `${len} m: célula grossa`).toBeGreaterThanOrEqual(9); expect(cell).toBeLessThanOrEqual(15.5);
    }
  });

  it('a imagem do ruído: RGBA, 4 canais com espalhamento próprio, quase sem correlação entre si, e sem emenda (o texel 0 é vizinho do último)', () => {
    const size = 128;
    const im = detailNoiseImage(size);
    expect(im.length).toBe(size * size * 4);
    const stat = (ch: number): { mean: number; sd: number; seam: number; inner: number } => {
      let s = 0; let s2 = 0; let seam = 0; let inner = 0; let nSeam = 0; let nInner = 0;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const v = im[(y * size + x) * 4 + ch] / 255; s += v; s2 += v * v;
        const xr = (x + 1) % size; const dv = Math.abs(im[(y * size + xr) * 4 + ch] / 255 - v);
        if (x === size - 1) { seam += dv; nSeam++; } else { inner += dv; nInner++; }
        const yb = (y + 1) % size; const dy = Math.abs(im[(yb * size + x) * 4 + ch] / 255 - v);
        if (y === size - 1) { seam += dy; nSeam++; } else { inner += dy; nInner++; }
      }
      const n = size * size; const mean = s / n;
      return { mean, sd: Math.sqrt(s2 / n - mean * mean), seam: seam / nSeam, inner: inner / nInner };
    };
    const st = [0, 1, 2, 3].map(stat);
    for (const [i, c] of st.entries()) {
      expect(c.mean, `canal ${i}: média`).toBeGreaterThan(0.4); expect(c.mean).toBeLessThan(0.6);
      expect(c.sd, `canal ${i}: espalhamento`).toBeGreaterThan(0.12);
      expect(c.seam, `canal ${i}: a emenda não é mais forte que o interior`).toBeLessThanOrEqual(c.inner * 1.6 + 0.004);
    }
    const corr = (a: number, b: number): number => {
      let sab = 0;
      for (let k = 0; k < size * size; k++) sab += (im[k * 4 + a] / 255 - st[a].mean) * (im[k * 4 + b] / 255 - st[b].mean);
      return sab / (size * size) / (st[a].sd * st[b].sd);
    };
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) expect(Math.abs(corr(a, b)), `canais ${a} × ${b}`).toBeLessThan(0.15);
  });
});

describe('F1: o Strip leva aDet — lateral em m e distância ABSOLUTA ao longo (estável)', () => {
  let restore = (): void => {};
  beforeEach(() => { restore = fakeCanvasDocument(); });
  afterEach(() => restore());

  /** O `aDet` (x = lateral, y = ao longo) das duas faixas de um quadro com o carro em `seg` (fração permitida). */
  function dets(terrain: Terrain, id: string, seg: number, ahead = 120): { x: Float32Array; y: Float32Array; si: Int32Array; lanes: number; count: number }[] {
    const tr = getTrack(id);
    const frame = buildRoadFrame(tr, seg * 200, 30, ahead);
    terrain.update(frame, tr, 0, new THREE.Vector3(0, 1, 0), 0);
    return (terrain.group.children.slice(0, 2) as THREE.Mesh[]).map((m) => {
      const a = m.geometry.getAttribute('aDet');
      expect(a, 'o Strip tem o atributo aDet').toBeDefined();
      expect(a.itemSize).toBe(2);
      const arr = a.array as Float32Array;
      const lanes = COLS.length;
      return { x: Float32Array.from({ length: arr.length / 2 }, (_, i) => arr[i * 2]), y: Float32Array.from({ length: arr.length / 2 }, (_, i) => arr[i * 2 + 1]), si: frame.segIndex.slice(), lanes, count: frame.count };
    });
  }

  it('o mesmo (segmento, coluna) tem o mesmo aDet em dois quadros com o carro em pontos diferentes (0,5 m e 37 segmentos adiante): o detalhe fica NO chão', () => {
    const tr = getTrack('serra_do_navio');
    const L = tr.segments.length * SEGMENT_M;
    const t = new Terrain(400); t.setTrack(tr, palette('tropical', 'day'), 'det-a');
    const A = dets(t, 'serra_do_navio', 400.0);
    const B = dets(t, 'serra_do_navio', 400.0 + 0.5 / SEGMENT_M);
    const C = dets(t, 'serra_do_navio', 437.3);
    for (const side of [0, 1]) {
      for (const other of [B, C]) {
        let compared = 0;
        for (let ja = 0; ja < A[side].count; ja++) {
          const jb = other[side].si.indexOf(A[side].si[ja]);
          if (jb < 0 || jb >= other[side].count) continue;
          for (let c = 0; c < COLS.length; c++) {
            const lane = (j: number): number => j * COLS.length + (side === 0 ? COLS.length - 1 - c : c);
            expect(other[side].x[lane(jb)], `lado ${side} seg ${A[side].si[ja]} col ${c}: lateral`).toBeCloseTo(A[side].x[lane(ja)], 4);
            const da = A[side].y[lane(ja)]; const db = other[side].y[lane(jb)];
            const dd = (((da - db) % L) + L) % L;
            expect(Math.min(dd, L - dd), `seg ${A[side].si[ja]} col ${c}: ao longo (mod o comprimento da pista)`).toBeLessThan(1e-3);
            compared++;
          }
        }
        expect(compared, 'comparou colunas de verdade').toBeGreaterThan(300);
      }
    }
  }, 120000);

  it('a lateral é a distância da coluna com o sinal do lado (esquerda < 0, direita > 0) e a distância ao longo cresce 4 m por ponto, inclusive através do fim da volta', () => {
    const tr = getTrack('serra_do_navio');
    const n = tr.segments.length;
    const t = new Terrain(400); t.setTrack(tr, palette('tropical', 'day'), 'det-b');
    const D = dets(t, 'serra_do_navio', n - 20 + 0.3); // a janela atravessa o segmento n − 1 → 0
    for (const side of [0, 1]) {
      let wrapped = false;
      for (let j = 0; j < D[side].count; j++) {
        if (j > 0 && D[side].si[j] < D[side].si[j - 1]) wrapped = true;
        for (let c = 0; c < COLS.length; c++) {
          const lane = j * COLS.length + (side === 0 ? COLS.length - 1 - c : c);
          const lat = D[side].x[lane];
          expect(Math.sign(lat) === (side === 0 ? -1 : 1) || lat === 0, `lado ${side}: sinal`).toBe(true);
          expect(Math.abs(lat), 'a lateral nunca passa da coluna (presa só do lado de dentro da curva)').toBeLessThanOrEqual(COLS[c] + 1e-4);
          if (j > 0) {
            const prev = D[side].y[(j - 1) * COLS.length + (side === 0 ? COLS.length - 1 - c : c)];
            expect(D[side].y[lane] - prev, `lado ${side} j ${j}: passo ao longo`).toBeCloseTo(SEGMENT_M, 4);
          }
        }
      }
      expect(wrapped, 'o teste atravessou o fim da volta').toBe(true);
    }
  }, 120000);

  it('tem 8 B a mais por vértice e nenhuma chamada nova: o mesmo número de atributos de antes + aDet, sem malha extra no grupo', () => {
    const t = new Terrain(200); t.setTrack(getTrack('copacabana'), palette('coast', 'day'), 'det-c');
    const strip = t.group.children[0] as THREE.Mesh;
    expect(Object.keys(strip.geometry.attributes).sort()).toEqual(['aDet', 'color', 'normal', 'position']);
    expect(t.group.children.length, 'faixa esquerda, direita, disco, mar, espuma, 3 quadras e o grupo do horizonte').toBe(9);
  });
});

describe('F1: o remendo do material do chão (texto do shader, sem GL)', () => {
  /** Roda o `onBeforeCompile` do material sobre um shader mínimo com os pontos de ancoragem do three e devolve os textos. */
  function patched(m: THREE.Material): { vs: string; fs: string; uniforms: Record<string, THREE.IUniform> } {
    const shader = {
      vertexShader: '#include <common>\n#include <color_vertex>\nvoid main(){}',
      fragmentShader: '#include <common>\n#include <color_fragment>\nvoid main(){}',
      uniforms: {} as Record<string, THREE.IUniform>,
    };
    m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
    return { vs: shader.vertexShader, fs: shader.fragmentShader, uniforms: shader.uniforms };
  }

  it('o detalhe vem do atributo aDet (nunca de gl_FragCoord, da posição de mundo ou da câmera: o mundo é remontado a cada quadro e o detalhe nadaria)', () => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true });
    installTerrainDetail(m);
    const { vs, fs, uniforms } = patched(m);
    expect(vs).toContain('attribute vec2 aDet'); expect(vs).toContain('vDet = aDet');
    expect(fs).toContain('varying vec2 vDet');
    for (const bad of ['gl_FragCoord', 'vWorldPosition', 'cameraPosition', 'modelMatrix']) expect(fs, `o fragmento não usa ${bad}`).not.toContain(bad);
    expect(Object.keys(uniforms)).toEqual(expect.arrayContaining(['uDetailMap', 'uDetailA', 'uDetailB', 'uDetailC', 'uDetailQ', 'uVergeC']));
  });

  it('o programa tem chave própria (+detail): nunca o mesmo programa do chão plano (o disco do fundo e o acostamento da pista seguem como estavam)', () => {
    const a = new THREE.MeshStandardMaterial({ vertexColors: true }); const b = new THREE.MeshStandardMaterial({ vertexColors: true });
    installTerrainDetail(a);
    expect(a.customProgramCacheKey()).toContain('+detail');
    expect(b.customProgramCacheKey()).not.toContain('+detail');
  });

  it('as duas escalas e o grão são três leituras do MESMO ladrilho (3 amostras, nenhuma textura a mais por oitava) e a fina some com a distância e com a derivada na tela', () => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true });
    installTerrainDetail(m);
    const { fs } = patched(m);
    expect((fs.match(/texture2D\s*\(\s*uDetailMap/g) ?? []).length).toBe(3);
    expect(fs).toContain('smoothstep'); expect(fs).toContain('fwidth'); // anti-cintilação: a oitava fina morre antes de a célula passar de ~2 px
    expect(fs).toContain('vViewPosition'); // a distância do desvanecimento é a da câmera ao fragmento
  });
});

describe('F1: Baixa tem 1 oitava', () => {
  let restore = (): void => {};
  beforeEach(() => { restore = fakeCanvasDocument(); });
  afterEach(() => restore());

  it('setQuality muda só um uniforme (nenhum programa recompila): Baixa desliga a oitava fina e o grão, Média tira o grão, Alta e Ultra têm tudo', () => {
    const t = new Terrain(100);
    const q = (): number[] => {
      const u = (t as unknown as { detail: { Q: { value: THREE.Vector4 } } }).detail.Q.value;
      return [u.x, u.y];
    };
    t.setQuality('high'); expect(q()).toEqual([1, 1]);
    t.setQuality('ultra'); expect(q()).toEqual([1, 1]);
    t.setQuality('medium'); expect(q()).toEqual([1, 0]);
    t.setQuality('low'); expect(q()).toEqual([0, 0]);
  });
});

describe('F1: a barranca do Passo Alpino (a "prateleira" do diagnóstico)', () => {
  // A V22 suspeitava da coluna 11 contra o anel 0. Medido: NÃO é isso (cortar a faixa em 150 pontos tira a folha; o anel não tem nada a ver). A "folha" é a barranca (colunas 6–8, 60–130 m) de
  // um trecho da estrada 20–30 m acima do vale, vista de baixo a ~500 m: uma face lisa, verde viva, de borda reta. A correção é de COR: a barranca da pista alta vira rocha.
  it('embankmentRock: só na serra, só com a pista alta sobre o vale, e mais forte no meio da descida (0 no platô e 0 no vale)', () => {
    expect(embankmentRock('alpine', 30, 0)).toBe(0); // o platô da pista
    expect(embankmentRock('alpine', 30, 1)).toBe(0); // o vale
    expect(embankmentRock('alpine', 30, 0.5)).toBeGreaterThanOrEqual(0.8);
    expect(embankmentRock('alpine', 30, 0.4)).toBeGreaterThanOrEqual(0.5);
    expect(embankmentRock('alpine', 4, 0.5), 'pista baixa: o prado segue prado').toBe(0);
    expect(embankmentRock('alpine', 20, 0.5)).toBeGreaterThan(0.1); expect(embankmentRock('alpine', 20, 0.5)).toBeLessThan(embankmentRock('alpine', 30, 0.5));
    for (const b of ['tropical', 'desert', 'coast', 'savanna', 'city_night'] as SceneryId[]) expect(embankmentRock(b, 30, 0.5), b).toBe(0);
  });

  it('na tabela de cor do Passo Alpino, a barranca (colunas 6–8) de onde a pista está ≥ 20 m acima do vale puxa para a rocha: trocar a cor da rocha por rosa-choque a muda por ≥ 0,08 (soma dos canais lineares); no prado (pista baixa) a troca não muda nada acima do que o chão geral já fazia', () => {
    const tr = getTrack('passo_alpino');
    const p = palette('alpine', 'day');
    const build = (rock: string, key: string): Float32Array => {
      const t = new Terrain(100); t.setTrack(tr, { ...p, rock }, key);
      return (t as unknown as { colorTable: Float32Array }).colorTable.slice();
    };
    const A = build('#ff00ff', 'emb-a'); const B = build(p.groundHigh, 'emb-b');
    let minY = Infinity; for (const s of tr.segments) minY = Math.min(minY, s.y0, s.y1);
    let high = 0; let highSum = 0;
    for (let i = 0; i < tr.segments.length; i += 3) {
      const roadH = tr.segments[i].y0 * Y_SCALE - minY * Y_SCALE;
      if (roadH < 20) continue;
      for (const si of [0, 1]) for (const c of [6, 7, 8]) {
        const k = ((i * 2 + si) * COLS.length + c) * 3;
        highSum += Math.abs(A[k] - B[k]) + Math.abs(A[k + 1] - B[k + 1]) + Math.abs(A[k + 2] - B[k + 2]); high++;
      }
    }
    expect(high, 'o Passo Alpino tem trechos de pista alta').toBeGreaterThan(30);
    expect(highSum / high, 'tinta de rocha na barranca da pista alta').toBeGreaterThanOrEqual(0.08);
  }, 120000);
});
