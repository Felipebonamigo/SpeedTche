// Vento do cenário (onda M, M3; docs/DIRECAO-DE-ARTE.md §2, item 5, "mundo animado: vegetação que balança"). O balanço é um
// deslocamento no vertex shader, feito de uma função PURA (`windSway`, que o teste exercita) e do mesmo cálculo em GLSL (`WIND_GLSL`,
// que o teste confere contra as mesmas constantes). A fase de cada árvore sai do HASH da posição NA PISTA (`Placement.wind`, calculada
// uma vez no layout), escrita no alfa da cor por instância do `BatchedMesh`: o balanço não escorrega com o carro nem difere entre as
// telas. Abaixo de 1,5 m a amplitude é ZERO (a faixa do carro, `CAR_BAND`, nunca se mexe). Tudo no Node, sem GL.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getTrack } from '../src/core/track';
import { buildRoadFrame } from '../src/render/roadframe';
import { CAR_BAND } from '../src/render/scenery/catalog';
import { sceneryLayout } from '../src/render/scenery/layout';
import { WIND_AMP_M, WIND_CALM_M, WIND_GLSL, WIND_MIN_DETAIL, WIND_RAMP_M, windDetailOn, windPhase, windSway } from '../src/render/scenery/wind';
import { fakeCanvasDocument } from './canvas-fake';

const PLANT = /^(tree|pine|palm):/;

describe('vento: a função', () => {
  it('amplitude ZERO até 1,5 m, qualquer fase e qualquer tempo (a faixa do carro não se mexe)', () => {
    expect(WIND_CALM_M).toBe(1.5);
    expect(WIND_CALM_M).toBeGreaterThan(CAR_BAND[1]); // o carro enxerga até 1,3 m
    for (let h = -2; h <= WIND_CALM_M; h += 0.25) {
      for (let p = 0.05; p <= 1; p += 0.19) {
        for (let t = 0; t < 40; t += 1.7) {
          const [dx, dz] = windSway(h, p, t);
          expect(Math.abs(dx) + Math.abs(dz), `h=${h} fase=${p} t=${t}`).toBe(0);
        }
      }
    }
  });

  it('acima de 1,5 m a copa balança (a amplitude cresce com a altura e para no teto)', () => {
    let low = 0; let mid = 0; let high = 0;
    for (let t = 0; t < 30; t += 0.05) {
      low = Math.max(low, Math.hypot(...windSway(WIND_CALM_M + 1.5, 0.3, t)));
      mid = Math.max(mid, Math.hypot(...windSway(WIND_CALM_M + WIND_RAMP_M * 0.6, 0.3, t)));
      high = Math.max(high, Math.hypot(...windSway(WIND_CALM_M + WIND_RAMP_M, 0.3, t)));
    }
    expect(low).toBeGreaterThan(0.005);
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
    expect(high).toBeLessThanOrEqual(WIND_AMP_M * 1.001);
    // Mais alto que a rampa não passa do teto.
    let tall = 0;
    for (let t = 0; t < 30; t += 0.05) tall = Math.max(tall, Math.hypot(...windSway(40, 0.7, t)));
    expect(tall).toBeLessThanOrEqual(WIND_AMP_M * 1.001);
  });

  it('é uma função do tempo e da fase: mesma fase e tempo, mesmo balanço; fases diferentes, balanços diferentes', () => {
    expect(windSway(6, 0.4, 12.5)).toEqual(windSway(6, 0.4, 12.5));
    const a = windSway(6, 0.11, 3.3); const b = windSway(6, 0.62, 3.3);
    expect(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])).toBeGreaterThan(0.02);
    // Anda no tempo (não é uma constante) e volta (limitada).
    const xs = Array.from({ length: 200 }, (_, i) => windSway(6, 0.4, i * 0.1)[0]);
    expect(Math.max(...xs)).toBeGreaterThan(0.05);
    expect(Math.min(...xs)).toBeLessThan(-0.05);
  });

  it('o GLSL é o mesmo cálculo: as constantes saem de wind.ts (uma só fonte) e o alfa é a fase', () => {
    expect(WIND_GLSL).toContain(WIND_CALM_M.toFixed(3));
    expect(WIND_GLSL).toContain(WIND_RAMP_M.toFixed(3));
    expect(WIND_GLSL).toContain(WIND_AMP_M.toFixed(3));
    expect(WIND_GLSL).toContain('vColor.a'); // a fase vem do alfa da cor por instância
    expect(WIND_GLSL).toContain('batchingMatrix[1]'); // a altura é medida no mundo (escala da instância)
    expect(WIND_GLSL).toContain('uWindTime');
    expect(WIND_GLSL).toContain('uWindAmp');
  });

  it('a fase vem só da posição na pista, cai em (0, 1] e se espalha', () => {
    expect(windPhase(10, 4.2, 0.5)).toBe(windPhase(10, 4.2, 0.5));
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const p = windPhase(i, 8 + (i % 7), (i % 5) / 5);
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThanOrEqual(1);
      seen.add(Math.round(p * 1000));
    }
    expect(seen.size).toBeGreaterThan(300);
  });

  it('a qualidade baixa (janela de 140 à frente) não balança; média e alta sim', () => {
    expect(WIND_MIN_DETAIL).toBeGreaterThan(0.59);
    expect(WIND_MIN_DETAIL).toBeLessThan(0.79);
    expect(windDetailOn(0.5)).toBe(false);
    expect(windDetailOn(0.586)).toBe(false);
    expect(windDetailOn(0.793)).toBe(true);
    expect(windDetailOn(1)).toBe(true);
  });
});

describe('vento: a fase por instância no layout', () => {
  const track = getTrack('foz_do_iguacu');
  const layout = sceneryLayout(track);

  it('só planta (árvore, conífera, palmeira, de sprite ou de mata) tem fase; rocha, cacto, moita, prédio e poste ficam rígidos (0)', () => {
    let plants = 0; let rigid = 0;
    for (const list of layout.bySeg) for (const p of list) {
      const id = layout.models[p.model];
      if (PLANT.test(id)) {
        plants++;
        expect(p.wind, id).toBeGreaterThan(0);
        expect(p.wind, id).toBeLessThanOrEqual(1);
      } else if (/^(rock|cactus|bush|bld|house|lamp|stand|billboard|sign|pole|fence|tuft|flowers|pebbles):/.test(id) || id === 'lamp') {
        rigid++;
        expect(p.wind, id).toBe(0);
      }
    }
    expect(plants).toBeGreaterThan(200);
    expect(rigid).toBeGreaterThan(100);
  });

  it('é determinística e não depende do quadro nem do tempo: duas montagens dão as mesmas fases', () => {
    const again = sceneryLayout(getTrack('foz_do_iguacu'));
    const a = layout.bySeg.flatMap((l) => l.map((p) => p.wind));
    const b = again.bySeg.flatMap((l) => l.map((p) => p.wind));
    expect(b).toEqual(a);
  });

  it('as fases das árvores se espalham (não é tudo a mesma fase: o bosque não balança em fila)', () => {
    const phases = new Set<number>();
    for (const list of layout.bySeg) for (const p of list) if (p.wind > 0) phases.add(Math.round(p.wind * 1000));
    expect(phases.size).toBeGreaterThan(300);
  });
});

describe('vento: no runtime (BatchedMesh e material)', () => {
  /** Alfas (fases) de todas as instâncias VISÍVEIS dos lotes de liso do cenário. */
  function visibleAlphas(group: THREE.Group): { phase: number[]; rigid: number } {
    const phase: number[] = []; let rigid = 0;
    for (const o of group.children) {
      if (o.name !== 'scenery:flat' && o.name !== 'scenery:dress') continue;
      const mesh = o as THREE.BatchedMesh;
      const v = new THREE.Vector4();
      for (let id = 0; id < mesh.maxInstanceCount; id++) {
        if (!mesh.getVisibleAt(id)) continue;
        mesh.getColorAt(id, v);
        if (v.w > 0) phase.push(v.w); else rigid++;
      }
    }
    return { phase, rigid };
  }

  it('as instâncias de árvore levam a fase do layout no alfa da cor; o resto leva 0', async () => {
    const restore = fakeCanvasDocument();
    try {
      const { Scenery } = await import('../src/render/scenery/runtime');
      const track = getTrack('foz_do_iguacu');
      const scenery = new Scenery();
      scenery.update(buildRoadFrame(track, track.length * 0.3, 30, 260), track, 2.5);
      const { phase, rigid } = visibleAlphas(scenery.group);
      expect(phase.length).toBeGreaterThan(100);
      expect(rigid).toBeGreaterThan(20);
      const layoutPhases = new Set(sceneryLayout(track).bySeg.flatMap((l) => l.filter((p) => p.wind > 0).map((p) => Math.fround(p.wind))));
      for (const a of phase) expect(layoutPhases.has(Math.fround(a)), `alfa ${a} não é fase de nenhum objeto do layout`).toBe(true);
      scenery.dispose();
    } finally { restore(); }
  }, 60000);

  it('a mesma árvore leva a mesma fase de um quadro para o outro e de uma tela para a outra (a fase não é do quadro nem do tempo)', async () => {
    const restore = fakeCanvasDocument();
    try {
      const { Scenery } = await import('../src/render/scenery/runtime');
      const track = getTrack('foz_do_iguacu');
      const scenery = new Scenery();
      scenery.update(buildRoadFrame(track, track.length * 0.3, 30, 260), track, 2.5);
      const a = visibleAlphas(scenery.group).phase.sort((x, y) => x - y);
      // Outro instante e outra tela: o mesmo carro, a mesma janela.
      scenery.update(buildRoadFrame(track, track.length * 0.3, 30, 260), track, 9.1);
      const b = visibleAlphas(scenery.group).phase.sort((x, y) => x - y);
      expect(b).toEqual(a);
      scenery.dispose();
    } finally { restore(); }
  }, 60000);

  it('na qualidade baixa (janela curta) ninguém balança: nenhum alfa; a Média e a Alta balançam', async () => {
    const restore = fakeCanvasDocument();
    try {
      const { Scenery } = await import('../src/render/scenery/runtime');
      const track = getTrack('foz_do_iguacu');
      const scenery = new Scenery();
      scenery.update(buildRoadFrame(track, track.length * 0.3, 30, 140), track, 1);
      expect(visibleAlphas(scenery.group).phase.length, 'baixa').toBe(0);
      scenery.update(buildRoadFrame(track, track.length * 0.3, 30, 200), track, 1);
      expect(visibleAlphas(scenery.group).phase.length, 'média').toBeGreaterThan(50);
      scenery.dispose();
    } finally { restore(); }
  }, 60000);

  it('o material liso compõe o vento com o stylize: o GLSL entra depois do begin_vertex, os uniformes e as chaves de programa ficam', async () => {
    const restore = fakeCanvasDocument();
    try {
      const { Scenery } = await import('../src/render/scenery/runtime');
      const scenery = new Scenery();
      const mats = (scenery as unknown as { materials: Record<string, THREE.Material> }).materials;
      const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
      mats.flat.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      expect(shader.vertexShader).toContain('uniform float uWindTime');
      const i = shader.vertexShader.indexOf('#include <begin_vertex>');
      expect(i).toBeGreaterThan(0);
      expect(shader.vertexShader.indexOf('vColor.a', i), 'o trecho do vento tem de vir depois do begin_vertex').toBeGreaterThan(i);
      expect(Object.keys(shader.uniforms)).toEqual(expect.arrayContaining(['uWindTime', 'uWindAmp', 'uStylizeRim']));
      const key = mats.flat.customProgramCacheKey();
      expect(key).toContain('scenery-wind');
      expect(key).toContain('speed-tche-stylize');
      // O lote do horizonte e os que não são planta não ganham o vento.
      const haze = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
      mats.haze.onBeforeCompile(haze, {} as THREE.WebGLRenderer);
      expect(haze.vertexShader).not.toContain('uWindTime');
      scenery.dispose();
    } finally { restore(); }
  }, 60000);
});
