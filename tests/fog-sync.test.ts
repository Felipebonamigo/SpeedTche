// Onda L, L1: a névoa que o render desenha é a mesma que o `sight.ts` (e o `caption.ts`) usam para decidir se um marco está
// à vista. Hoje a conta do `sight.ts` é a inversa do `FogExp2` do three, e o lote do horizonte (`scenery-haze`) tem a escala
// própria; nenhum teste ligava uma ponta à outra. Estes são TRAVAS (passam de primeira): só falham no dia em que alguém mudar a
// névoa de um lado só (a L1 e a L2 vão mexer no render; o `sight.ts` é da L4).
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTrack } from '../src/core/track';
import { TRACKS } from '../src/core/track/tracks';
import { QUALITY_ORDER } from '../src/game/quality';
import { CAPTION_FOG, CAPTION_FOG_SCALE } from '../src/render/caption/caption';
import { palette } from '../src/render/palette';
import { fakeCanvasDocument } from './canvas-fake';
import { HAZE_FOG_SCALE, sightRoad, SIGHT_FOG } from '../src/render/scenery/sight';
import { FOG_DENSITY, Sky } from '../src/render/sky';

/** A névoa do `fog_fragment` do three (FogExp2) a `d` metros, com a densidade `rho`. */
const fogFactor = (rho: number, d: number): number => 1 - Math.exp(-rho * rho * d * d);

const COMBOS = [...new Set(TRACKS.map((t) => `${t.scenery}:${t.timeOfDay}`))].map((k) => {
  const [scenery, time] = k.split(':') as [typeof TRACKS[number]['scenery'], typeof TRACKS[number]['timeOfDay']];
  return { key: k, scenery, time, track: TRACKS.find((t) => t.scenery === scenery && t.timeOfDay === time)!.id };
});

describe('a névoa do render × a do sight.ts', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('o fog_fragment do three ainda é 1 − exp(−ρ²·d²) (se mudar, a conta do sight.ts deixa de bater)', () => {
    expect(THREE.ShaderChunk.fog_fragment).toContain('float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );');
  });

  it('a densidade que o Sky põe na cena é a do sight.ts, e no fogM dele a névoa do render é SIGHT_FOG (e no hazeM, a do lote do horizonte)', () => {
    // O PMREM precisa de GPU: só o env map fica de fora, a névoa é posta antes dele.
    vi.spyOn(THREE.PMREMGenerator.prototype, 'fromScene').mockReturnValue({ texture: new THREE.Texture(), dispose() {} } as unknown as THREE.WebGLRenderTarget);
    const sky = new Sky({} as THREE.WebGLRenderer, new THREE.Scene());
    expect(COMBOS.length).toBeGreaterThanOrEqual(3);
    for (const c of COMBOS) {
      const track = getTrack(c.track);
      sky.setQuality('high');
      sky.setPalette(palette(c.scenery, c.time), c.time, `fog:${c.key}`);
      const rho = sky.fog.density;
      expect(rho, c.key).toBeCloseTo(FOG_DENSITY.high * palette(c.scenery, c.time).fogDensity, 12);
      const road = sightRoad(track, () => 0, 0, () => false);
      expect(fogFactor(rho, road.fogM), `${c.key} fogM`).toBeCloseTo(SIGHT_FOG, 9);
      expect(fogFactor(rho * HAZE_FOG_SCALE, road.hazeM), `${c.key} hazeM`).toBeCloseTo(SIGHT_FOG, 9);
      expect(fogFactor(rho, road.fogM * CAPTION_FOG_SCALE), `${c.key} legenda`).toBeCloseTo(CAPTION_FOG, 9);
      // O ultra é a alta com efeitos: a névoa não pode divergir da que o sight.ts conta (até a L2 decidir o contrário, junto com ele).
      sky.setQuality('ultra');
      expect(sky.fog.density, `${c.key} ultra`).toBe(rho);
    }
  });

  it('o lote do horizonte (scenery-haze) usa HAZE_FOG_SCALE na mesma fórmula, e ela sobrevive ao stylize', async () => {
    const restore = fakeCanvasDocument();
    const { Scenery } = await import('../src/render/scenery/runtime');
    const haze = (new Scenery() as unknown as { materials: Record<string, THREE.Material> }).materials.haze;
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
    haze.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    const scale = /fogDensity \* ([0-9.]+) \* vFogDepth/.exec(shader.fragmentShader);
    expect(scale, 'o trecho da névoa do horizonte sumiu do shader').not.toBeNull();
    expect(Number(scale?.[1])).toBeCloseTo(HAZE_FOG_SCALE, 9);
    expect(shader.fragmentShader).toContain('1.0 - exp(-hazeD * hazeD)');
    expect(shader.fragmentShader).toContain('STYLIZE_LIT'); // e o stylize entrou por cima, sem apagá-lo
    expect(haze.customProgramCacheKey()).toContain('scenery-haze');
    restore();
  });

  it('a bíblia (§4): nada de névoa até ~80 m — menos de 5% na alta e no ultra, em todo bioma e período', () => {
    for (const q of ['high', 'ultra'] as const) {
      for (const c of COMBOS) {
        expect(fogFactor(FOG_DENSITY[q] * palette(c.scenery, c.time).fogDensity, 80), `${q} ${c.key}`).toBeLessThan(0.05);
      }
    }
    // A baixa e a média são mais densas DE PROPÓSITO (desenham menos pista); a ordem se mantém.
    const order = QUALITY_ORDER.map((q) => FOG_DENSITY[q]);
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeLessThanOrEqual(order[i - 1]);
  });
});
