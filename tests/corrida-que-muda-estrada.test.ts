// M6 (b): a pista ao vivo (Road.setLive). As texturas assadas de cada período (asfalto, brilho, zebra, acostamento, box, largada) são pintadas para as DUAS pontas e o
// material mistura as duas por um uniforme: nenhum material novo, nenhum programa recompilado por quadro (a `version` do material não anda), e o primeiro quadro é a paleta da pista.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { livePalette, palette } from '../src/render/palette';
import { Road } from '../src/render/road';
import { fakeCanvasDocument } from './canvas-fake';

type Mat = THREE.MeshStandardMaterial;
interface Inner {
  asphaltMaterial: Mat; shoulderMaterial: Mat; kerbMaterial: Mat; pitMaterial: Mat; decalMaterial: Mat;
  pools: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; night: boolean;
}

describe('M6 (b): a pista ao vivo', () => {
  let restore = (): void => {};
  beforeEach(() => { restore = fakeCanvasDocument(); });
  afterEach(() => restore());
  const inner = (r: Road): Inner => r as unknown as Inner;
  const mats = (r: Road): Mat[] => { const i = inner(r); return [i.asphaltMaterial, i.shoulderMaterial, i.kerbMaterial, i.pitMaterial, i.decalMaterial]; };
  const blendOf = (m: Mat): number => (m.userData.roadBlend as { value: number }).value;

  it('t = 0 é a paleta da pista; t = 1 é a do período seguinte (brilho das marcações, cor da faixa, aspereza da noite, poças de luz)', () => {
    const r = new Road(8, 1);
    const a = palette('city_night', 'dusk'); const b = palette('city_night', 'night');
    r.setPalette(a, false, 'k1', b);
    r.setLive(livePalette('city_night', 'dusk', 3, 0));
    const i = inner(r);
    expect(i.asphaltMaterial.emissiveIntensity).toBeCloseTo(a.markingGlow, 12);
    expect(i.asphaltMaterial.roughness).toBe(0.9);
    expect(blendOf(i.asphaltMaterial)).toBe(0);
    expect(i.pools.visible).toBe(false);
    r.setLive(livePalette('city_night', 'dusk', 3, 1));
    expect(i.asphaltMaterial.emissiveIntensity).toBeCloseTo(b.markingGlow, 12);
    expect(i.asphaltMaterial.roughness).toBeCloseTo(0.6, 12);
    expect(i.asphaltMaterial.emissive.getHexString()).toBe(new THREE.Color(b.lane).getHexString());
    expect(blendOf(i.asphaltMaterial)).toBe(1);
    expect(i.kerbMaterial.emissiveIntensity).toBeCloseTo(b.markingGlow * 0.5, 12);
    expect(i.decalMaterial.emissiveIntensity).toBeCloseTo(b.markingGlow * 0.6, 12);
    expect(i.pools.material.color.getHexString()).toBe(new THREE.Color(b.lampPool ?? '#000').getHexString());
    expect(i.night).toBe(true);
  });

  it('no meio a mistura é a metade e o brilho está entre as pontas', () => {
    const r = new Road(8, 1);
    const a = palette('coast', 'day'); const b = palette('coast', 'dusk');
    r.setPalette(a, false, 'k2', b);
    r.setLive(livePalette('coast', 'day', 3, 2 / 3 + 1 / 6));
    const i = inner(r);
    expect(blendOf(i.asphaltMaterial)).toBeCloseTo(0.5, 12);
    expect(i.asphaltMaterial.emissiveIntensity).toBeGreaterThan(a.markingGlow);
    expect(i.asphaltMaterial.emissiveIntensity).toBeLessThan(b.markingGlow);
  });

  it('nenhum programa recompila por passo: a `version` de cada material não anda e os materiais são os mesmos', () => {
    const r = new Road(8, 1);
    r.setPalette(palette('coast', 'day'), false, 'k3', palette('coast', 'dusk'));
    const before = mats(r); const versions = before.map((m) => m.version);
    for (let n = 0; n <= 300; n++) r.setLive(livePalette('coast', 'day', 3, 2 / 3 + n / 900));
    expect(mats(r)).toEqual(before);
    mats(r).forEach((m, k) => expect(m.version, `material ${k}`).toBe(versions[k]));
  });

  it('o shader dos materiais com sucessor lê as duas texturas; o da pista de noite fica como era (sem mistura, mesma chave de programa)', () => {
    const shaderStub = (): THREE.WebGLProgramParametersWithUniforms => ({ uniforms: {}, vertexShader: '', fragmentShader: '#include <common>\n#include <map_fragment>\n#include <emissivemap_fragment>' }) as unknown as THREE.WebGLProgramParametersWithUniforms;
    const live = new Road(8, 1);
    live.setPalette(palette('coast', 'day'), false, 'k4', palette('coast', 'dusk'));
    for (const m of mats(live)) {
      const s = shaderStub(); m.onBeforeCompile(s, {} as THREE.WebGLRenderer);
      expect(s.fragmentShader, 'mistura das duas texturas').toContain('uRoadBlend');
      expect(Object.keys(s.uniforms)).toEqual(expect.arrayContaining(['uRoadBlend', 'uMapB']));
    }
    const still = new Road(8, 1);
    still.setPalette(palette('coast', 'night'), true, 'k5');
    for (const m of mats(still)) {
      const s = shaderStub(); m.onBeforeCompile(s, {} as THREE.WebGLRenderer);
      expect(s.fragmentShader).not.toContain('uRoadBlend');
    }
    expect(mats(live)[0].customProgramCacheKey()).not.toBe(mats(still)[0].customProgramCacheKey());
  });

  it('trocar de pista com o programa já compilado: os uniformes que o three guardou leem o período seguinte da pista ATUAL (nem textura velha, nem uniforme faltando)', () => {
    // O three só chama o `onBeforeCompile` ao compilar um programa novo; ao reusar um (mesma chave) ele usa os uniformes da ÚLTIMA compilação
    // do material (WebGLRenderer.getProgram). Aqui: compila com uma pista de dia, troca para outra (mesma chave: sem compilar), passa por uma
    // de noite (chave sem mistura: compila e os uniformes dela viram os do material) e volta ao dia (reusa o programa com mistura).
    const shaderStub = (): THREE.WebGLProgramParametersWithUniforms => ({ uniforms: {}, vertexShader: '', fragmentShader: '#include <common>\n#include <map_fragment>\n#include <emissivemap_fragment>' }) as unknown as THREE.WebGLProgramParametersWithUniforms;
    type U = Record<string, { value: unknown } | undefined>;
    const compile = (m: Mat): U => { const s = shaderStub(); m.onBeforeCompile(s, {} as THREE.WebGLRenderer); return s.uniforms as U; };
    const r = new Road(8, 1);
    const current = (): THREE.Texture[] => (r as unknown as { textures: THREE.Texture[] }).textures;
    /** A textura do período seguinte da pista atual: está entre as da pista agora e não é a do período dela (o `map`). */
    const expectNext = (u: U, m: Mat, tag: string): void => {
      for (const name of ['uMapB', 'uEmissiveMapB']) {
        const tex = u[name]?.value as THREE.Texture | undefined;
        expect(tex, `${tag}: ${name} nos uniformes`).toBeDefined();
        expect(current(), `${tag}: ${name} é da pista atual (não uma já liberada)`).toContain(tex);
        expect(tex, `${tag}: ${name} é do período seguinte`).not.toBe(m.map);
      }
    };
    r.setPalette(palette('coast', 'day'), false, 'k8', palette('coast', 'dusk'));
    const day = mats(r).map(compile);
    r.setPalette(palette('city_night', 'dusk'), false, 'k9', palette('city_night', 'night'));
    mats(r).forEach((m, k) => expectNext(day[k], m, `material ${k}, segunda pista de dia`));
    r.setPalette(palette('coast', 'night'), true, 'k10');
    const night = mats(r).map(compile);
    r.setPalette(palette('coast', 'day'), false, 'k11', palette('coast', 'dusk'));
    mats(r).forEach((m, k) => expectNext(night[k], m, `material ${k}, de volta ao dia depois da noite`));
    // A mistura que o `setLive` move é a que os dois programas leem.
    r.setLive(livePalette('coast', 'day', 3, 1));
    mats(r).forEach((_, k) => { expect(day[k].uRoadBlend?.value).toBe(1); expect(night[k].uRoadBlend?.value).toBe(1); });
  });

  it('trocar de pista solta as texturas das duas pontas (nada vaza)', () => {
    const r = new Road(8, 1);
    r.setPalette(palette('coast', 'day'), false, 'k6', palette('coast', 'dusk'));
    const tex = (r as unknown as { textures: THREE.Texture[] }).textures;
    expect(tex.length).toBeGreaterThanOrEqual(12); // 6 por ponta
    let disposed = 0; for (const t of tex) t.addEventListener('dispose', () => { disposed++; });
    r.setPalette(palette('coast', 'night'), true, 'k7');
    expect(disposed).toBe(tex.length);
  });
});
