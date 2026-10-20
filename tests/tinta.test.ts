// V14 (docs/ondas/V14-tinta.md): luz e material dos carros, a parte que não depende de GL. O que se mede NA IMAGEM (gradiente de luma na lataria, halo das
// lanternas, vidro preto) está em tests/tinta-gl.test.ts. Aqui: o shader (o texto sobre o `ShaderLib.physical` real do three), os degraus de qualidade e
// "Reduzir efeitos", o perfil de tira da lanterna e a lista de lanternas que cada casco carrega para o halo.
//   1. Tinta com brilho alongado: lobo do sol esticado ao longo do carro + faixa do horizonte, analíticos (sem cubemap, sem amostra), depois do verniz e antes de a pintura voltar ao matiz.
//   2. Lanternas em tira de LED: patamar aceso (não cone) e halo na lataria em volta, sem chamada nova (uniformes por lote, atributo/lista no casco).
//   3. Vidro: o céu refletido só em faixa, o resto preto.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Quality } from '../src/game/contracts';
import * as K from '../src/render/cars/kit';
import * as M from '../src/render/cars/material';
import { buildModel, MODEL_BUILDERS } from '../src/render/cars/models';
import { palette, SCENERIES, TIMES_OF_DAY } from '../src/render/palette';
import { CARS } from '../src/core';
import { modelKey } from '../src/render/cars/models';
import { TAIL } from '../src/render/cars/paints';

// O que a implementação expõe (lido por acesso dinâmico: o teste falha pela MEDIDA/ausência, não por erro de compilação).
const sheenFor = (M as unknown as { sheenFor?: (q: Quality, reduce: boolean) => { lobe: number; band: number; halo: number } }).sheenFor;
const lensWeight = (M as unknown as { lensWeight?: (r: number) => number }).lensWeight;
const haloEmission = (M as unknown as { haloEmission?: (glow: number) => number }).haloEmission;
const lensLamps = (K as unknown as { lensLamps?: (pos: readonly number[], mat: readonly number[], col: readonly number[]) => Array<{ c: number[]; e: number[]; reach: number }> }).lensLamps;
const MAX_LAMPS = (K as unknown as { MAX_LAMPS?: number }).MAX_LAMPS ?? 0;

function compiled(): { vert: string; frag: string } {
  const { material } = M.createCarMaterial();
  const shader = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return { vert: shader.vertexShader, frag: shader.fragmentShader };
}
const at = (text: string, needle: string): number => { const i = text.indexOf(needle); expect(i, `faltou: ${needle}`).toBeGreaterThanOrEqual(0); return i; };

describe('1. tinta com brilho alongado: o shader', () => {
  const { vert, frag } = compiled();

  it('o brilho da tinta vem DEPOIS do verniz e ANTES de a pintura voltar ao matiz, uma chamada só; sem amostra de textura; o sol vem da luz direcional da cena (o do período), com guarda de #if', () => {
    const varnish = at(frag, 'outgoingLight = carVarnish(');
    const sheen = at(frag, 'outgoingLight = carSheen(');
    const hold = at(frag, 'outgoingLight = carPaintHold(');
    expect(sheen).toBeGreaterThan(varnish);
    expect(sheen).toBeLessThan(hold);
    expect(frag.split('outgoingLight = carSheen(').length - 1).toBe(1);
    const fn = frag.slice(at(frag, 'vec3 carSheen('), at(frag, 'float carLampHalo('));
    expect(fn).toContain('directionalLights[ 0 ]');
    expect(fn).toContain('#if NUM_DIR_LIGHTS > 0');
    expect(fn).not.toContain('texture');
    expect(frag).toContain('uniform vec3 uSheen;');
  });

  it('o eixo do comprimento do carro vai do vértice ao fragmento (varying vFwd, pela matriz da instância): o lobo é esticado AO LONGO da lataria', () => {
    expect(vert).toMatch(/varying vec3 vFwd;/);
    expect(frag).toMatch(/varying vec3 vFwd;/);
    expect(vert).toContain('mat3( instanceMatrix )');
  });

  it('a chave do programa subiu para v9 (o shader mudou)', () => {
    expect(M.createCarMaterial().material.customProgramCacheKey()).toContain('speed-tche-car-v9');
  });

  it('o material guarda os uniformes em userData (o laboratório e o lote leem de lá), com o brilho, as lanternas e o halo', () => {
    const { material, uniforms } = M.createCarMaterial();
    expect((material.userData as { carUniforms?: unknown }).carUniforms).toBe(uniforms);
    for (const k of ['uSheen', 'uLampC', 'uLampE']) expect(uniforms, k).toHaveProperty(k);
  });
});

describe('1b. degraus: a Baixa e o "Reduzir efeitos" ficam com o brilho simples e sem halo', () => {
  it('sheenFor existe e a Baixa tem só o lobo (sem faixa de horizonte, sem halo); Média, Alta e Ultra têm os três', () => {
    expect(sheenFor, 'sheenFor não existe em cars/material.ts').toBeTypeOf('function');
    const f = sheenFor as NonNullable<typeof sheenFor>;
    const low = f('low', false);
    expect(low.lobe).toBeGreaterThan(0);
    expect(low.band).toBe(0);
    expect(low.halo).toBe(0);
    for (const q of ['medium', 'high', 'ultra'] as const) {
      const s = f(q, false);
      expect(s.lobe, q).toBeGreaterThan(0);
      expect(s.band, q).toBeGreaterThan(0);
      expect(s.halo, q).toBeGreaterThan(0);
    }
  });

  it('"Reduzir efeitos" em qualquer degrau: sem halo, sem faixa, o lobo mais fraco que o do degrau cheio', () => {
    expect(sheenFor, 'sheenFor não existe').toBeTypeOf('function');
    const f = sheenFor as NonNullable<typeof sheenFor>;
    for (const q of ['low', 'medium', 'high', 'ultra'] as const) {
      const r = f(q, true); const full = f(q, false);
      expect(r.halo, q).toBe(0);
      expect(r.band, q).toBe(0);
      expect(r.lobe, q).toBeGreaterThan(0);
      expect(r.lobe, q).toBeLessThanOrEqual(full.lobe);
    }
  });

  it('setCarQuality leva o brilho do degrau para o uniforme (uSheen) e o "Reduzir efeitos" o desliga', () => {
    const { material, uniforms } = M.createCarMaterial();
    const u = uniforms as unknown as { uSheen?: { value: THREE.Vector3 } };
    M.setCarQuality(material, 'high', uniforms);
    expect(u.uSheen?.value.y ?? 0, 'faixa na Alta').toBeGreaterThan(0);
    M.setCarQuality(material, 'low', uniforms);
    expect(u.uSheen?.value.y ?? 1, 'faixa na Baixa').toBe(0);
    expect(u.uSheen?.value.z ?? 1, 'halo na Baixa').toBe(0);
  });
});

describe('3. vidro: preto, com o céu só na parte de cima', () => {
  const glassRange = (K as unknown as { glassRange?: (pos: readonly number[], mat: readonly number[], pnt: readonly number[]) => [number, number] | null }).glassRange;
  it('glassRange: a faixa de altura do vidro do casco (a regra de vidro do shader); o casco do GT carrega a dele em userData.glassY, abaixo do teto do carro', () => {
    expect(glassRange, 'glassRange não existe em cars/kit.ts').toBeTypeOf('function');
    const f = glassRange as NonNullable<typeof glassRange>;
    // dois vértices de vidro (rugosidade 0,05, metal 1... aqui metal 0,8) a 1,0 e 1,2 m, e um de lataria pintada a 1,5 m que não conta
    const pos = [0, 1.0, 0, 0, 1.2, 0, 0, 1.5, 0]; const pnt = [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
    const mat = [0.05, 0.8, 0, 0, 0.05, 0.8, 0, 0, 0.05, 0.8, 0, 0];
    expect(f(pos, mat, pnt)).toEqual([1.0, 1.2]);
    expect(f(pos, mat.map(() => 0.9), pnt)).toBeNull();
    const gy = (buildModel('gt').shell.userData as { glassY?: [number, number] | null }).glassY;
    expect(gy, 'userData.glassY do GT').toBeTruthy();
    expect((gy as [number, number])[1]).toBeGreaterThan((gy as [number, number])[0]);
    expect((gy as [number, number])[1]).toBeLessThan(1.6);
  });
});

describe('2. lanternas em tira de LED', () => {
  it('o perfil da lente é um patamar aceso (≥ 0,9 até metade do raio) que cai para a borda (≤ 0,45 em r = 1), sem subir: tira, não cone', () => {
    expect(lensWeight, 'lensWeight não existe em cars/material.ts').toBeTypeOf('function');
    const w = lensWeight as NonNullable<typeof lensWeight>;
    expect(w(0)).toBeCloseTo(1, 5);
    expect(w(0.5)).toBeGreaterThanOrEqual(0.9);
    expect(w(1)).toBeLessThanOrEqual(0.45);
    expect(w(1)).toBeGreaterThan(0);
    let prev = 2;
    for (let r = 0; r <= 1.0001; r += 0.05) { const v = w(r); expect(v).toBeLessThanOrEqual(prev + 1e-9); prev = v; }
  });

  it('o halo é discreto de dia e abaixo do teto do bloom (≤ 0,5 × o limiar), e à noite mais forte que de dia; o freio brilha mais que a lanterna', () => {
    expect(haloEmission, 'haloEmission não existe em cars/material.ts').toBeTypeOf('function');
    const h = haloEmission as NonNullable<typeof haloEmission>;
    for (const s of SCENERIES) {
      const day = palette(s, 'day'); const night = palette(s, 'night');
      const tg = (l: number) => M.tailGlow(l);
      expect(h(tg(day.light).tail), `${s} dia: lanterna`).toBeLessThanOrEqual(0.5 * day.bloom[2]);
      expect(h(tg(day.light).brake), `${s} dia: freio`).toBeLessThanOrEqual(0.5 * day.bloom[2]);
      expect(h(tg(day.light).tail), `${s} dia: o halo existe`).toBeGreaterThan(0.1);
      expect(h(tg(night.light).tail), `${s}: noite > dia`).toBeGreaterThan(h(tg(day.light).tail));
      for (const t of TIMES_OF_DAY) expect(h(tg(palette(s, t).light).brake), `${s}:${t} freio > lanterna`).toBeGreaterThan(h(tg(palette(s, t).light).tail));
    }
  });

  it('cada casco com lente em leque carrega a lista das lanternas vermelhas (centro, meia extensão, alcance) para o halo; nunca mais que MAX_LAMPS', () => {
    expect(lensLamps, 'lensLamps não existe em cars/kit.ts').toBeTypeOf('function');
    expect(MAX_LAMPS).toBeGreaterThanOrEqual(4);
    for (const key of ['gt', 'wedge', 'hyper']) {
      const g = buildModel(key).shell;
      const lamps = (g.userData as { lamps?: Array<{ c: number[]; e: number[]; reach: number }> }).lamps;
      expect(lamps, `${key}: userData.lamps`).toBeDefined();
      expect(lamps?.length ?? 0, `${key}: tem lanternas`).toBeGreaterThanOrEqual(2);
      expect(lamps?.length ?? 99, `${key}: no máximo MAX_LAMPS`).toBeLessThanOrEqual(MAX_LAMPS);
      for (const l of lamps ?? []) {
        expect(l.c[2], `${key}: a lanterna fica atrás do centro do carro`).toBeGreaterThan(0.3);
        expect(l.reach, `${key}: alcance do halo em metros`).toBeGreaterThan(0.03);
        expect(l.reach).toBeLessThanOrEqual(0.2);
      }
    }
  });

  it('o casco herói do GT também carrega as lanternas dele (as posições são as dele, não as do casco de sempre)', () => {
    const hero = buildModel('gt').hero;
    if (!hero) return; // sem o arquivo do herói neste ambiente (o teste de ativo cobra a existência)
    const lamps = (hero.shell.userData as { lamps?: unknown[] }).lamps;
    expect(lamps, 'hero.userData.lamps').toBeDefined();
    expect((lamps ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('só lanterna vermelha entra: a luz de ré (clara) e o farol não ganham halo vermelho', () => {
    expect(lensLamps, 'lensLamps não existe').toBeTypeOf('function');
    const f = lensLamps as NonNullable<typeof lensLamps>;
    // dois leques de lente num casco de brinquedo: um vermelho (canal da lanterna, aMat.w) e um branco (ré).
    const fan = (cx: number, col: [number, number, number]) => {
      const pos: number[] = []; const mat: number[] = []; const colr: number[] = [];
      const ring = [[0.1, 0], [0, 0.05], [-0.1, 0], [0, -0.05]];
      for (let k = 0; k < 4; k++) {
        const p = ring[k]; const q = ring[(k + 1) % 4];
        for (const v of [[0, 0], p, q]) { pos.push(cx + v[0], 0.8, 2.2); mat.push(0.2, 0.3, 0, 1); colr.push(...col); }
      }
      return { pos, mat, colr };
    };
    const a = fan(0.5, [TAIL.rgb[0], TAIL.rgb[1], TAIL.rgb[2]]); const b = fan(-0.5, [1, 1, 1]);
    const lamps = f([...a.pos, ...b.pos], [...a.mat, ...b.mat], [...a.colr, ...b.colr]);
    expect(lamps.length).toBe(1);
    expect(lamps[0].c[0]).toBeCloseTo(0.5, 2);
    expect(lamps[0].e[0]).toBeGreaterThan(lamps[0].e[1]); // a tira é mais larga que alta: a extensão acompanha
  });

  it('nenhum modelo passa de MAX_LAMPS e todos os carros do jogo têm modelo construível (a lista não quebra casco nenhum)', () => {
    for (const c of CARS) {
      const key = modelKey(c);
      if (!(key in MODEL_BUILDERS) && key === c.id) continue; // carros de arquivo: cobertos por tests/car-*.test.ts
      const lamps = (buildModel(key).shell.userData as { lamps?: unknown[] }).lamps ?? [];
      expect(lamps.length, key).toBeLessThanOrEqual(MAX_LAMPS);
    }
  });
});
