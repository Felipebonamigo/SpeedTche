// M6 (b): o céu ao vivo (Sky.setLive) é só uniforme e luz: a paleta da pista é o primeiro quadro, a do período seguinte é o último, e o env map (PMREM) não é refeito por quadro.
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SceneryId, TimeOfDay } from '../src/core/types';
import { livePalette, palette } from '../src/render/palette';
import { Sky } from '../src/render/sky';

interface Probe { top: string; mid: string; fog: string; sunI: number; moon: number; stars: number; starsVisible: boolean; env: number; dir: THREE.Vector3; clouds: boolean; body: string }

describe('M6 (b): o céu ao vivo', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  const makeSky = (): Sky => {
    vi.spyOn(THREE.PMREMGenerator.prototype, 'fromScene').mockReturnValue({ texture: new THREE.Texture(), dispose() {} } as unknown as THREE.WebGLRenderTarget);
    return new Sky({} as THREE.WebGLRenderer, new THREE.Scene());
  };
  const probe = (sky: Sky): Probe => {
    const g = sky as unknown as { dome: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>; stars: THREE.Points; clouds: THREE.Mesh; scene: THREE.Scene };
    const u = g.dome.material.uniforms;
    return {
      top: '#' + (u.uTop.value as THREE.Color).getHexString(), mid: '#' + (u.uMid.value as THREE.Color).getHexString(), fog: '#' + sky.fog.color.getHexString(),
      sunI: sky.sun.intensity, moon: u.uMoon.value as number, stars: (g.stars.material as THREE.PointsMaterial).opacity, starsVisible: g.stars.visible,
      env: g.scene.environmentIntensity, dir: (u.uSunDir.value as THREE.Vector3).clone(), clouds: g.clouds.visible, body: '#' + (u.uSunColor.value as THREE.Color).getHexString(),
    };
  };
  const setStatic = (sky: Sky, sc: SceneryId, t: TimeOfDay, k: string): Probe => { sky.setPalette(palette(sc, t), t, k); return probe(sky); };

  it('t = 0 é o céu da pista, e t = 1 é o do período seguinte (as mesmas uniformes da paleta estática)', () => {
    for (const [sc, from, to] of [['coast', 'day', 'dusk'], ['tropical', 'dusk', 'night'], ['city_night', 'dusk', 'night']] as Array<[SceneryId, TimeOfDay, TimeOfDay]>) {
      const ref = makeSky(); const a = setStatic(ref, sc, from, `a:${sc}`); const b = setStatic(ref, sc, to, `b:${sc}`);
      const sky = makeSky(); sky.setPalette(palette(sc, from), from, `l:${sc}`);
      sky.setLive(livePalette(sc, from, 3, 0), from, to, 'high');
      expect(probe(sky), `${sc} t=0`).toEqual(a);
      sky.setLive(livePalette(sc, from, 3, 1), from, to, 'high');
      expect(probe(sky), `${sc} t=1`).toEqual(b);
    }
  });

  it('no meio do caminho tudo está entre as pontas e nada é NaN: estrelas surgindo, a lua entrando, o sol descendo', () => {
    const sky = makeSky(); sky.setPalette(palette('alpine', 'dusk'), 'dusk', 'm');
    const a = probe(sky);
    sky.setLive(livePalette('alpine', 'dusk', 3, 1 / 3 + 1 / 3), 'dusk', 'night', 'high');
    const m = probe(sky);
    expect(m.moon).toBeGreaterThan(0.2); expect(m.moon).toBeLessThan(0.8);
    expect(m.stars).toBeGreaterThan(0); expect(m.stars).toBeLessThan(1);
    expect(m.starsVisible).toBe(true);
    expect(m.sunI).toBeLessThan(a.sunI);
    expect(m.body).not.toBe(a.body);
    for (const v of [m.dir.x, m.dir.y, m.dir.z, m.sunI, m.env]) expect(Number.isFinite(v)).toBe(true);
    expect(m.clouds).toBe(true); // as nuvens se dissolvem no céu e só somem no fim
    sky.setLive(livePalette('alpine', 'dusk', 3, 1), 'dusk', 'night', 'high');
    expect(probe(sky).clouds).toBe(false);
  });

  it('o env map não é refeito por quadro: no máximo 8 vezes numa transição inteira (3 na Baixa) e uma ao voltar ao período da pista', () => {
    for (const [q, cap] of [['high', 8], ['medium', 8], ['low', 3]] as const) {
      const sky = makeSky(); sky.setPalette(palette('coast', 'day'), 'day', `e:${q}`);
      for (let i = 0; i <= 2000; i++) sky.setLive(livePalette('coast', 'day', 3, 2 / 3 + i / 6000), 'day', 'dusk', q);
      expect(sky.liveEnvRebuilds, q).toBeLessThanOrEqual(cap + 1);
      expect(sky.liveEnvRebuilds, q).toBeGreaterThanOrEqual(cap > 3 ? cap : 2);
      const before = sky.liveEnvRebuilds;
      sky.setLive(livePalette('coast', 'day', 3, 1), 'day', 'dusk', q); // o mesmo passo de novo: nada
      expect(sky.liveEnvRebuilds).toBe(before);
      sky.setLive(livePalette('coast', 'day', 3, 0), 'day', 'dusk', q); // menu: volta ao período da pista, uma refeita
      expect(sky.liveEnvRebuilds).toBe(before + 1);
    }
  });

  it('não cria material nem malha: o domo, as nuvens e as estrelas são os mesmos antes e depois', () => {
    const sky = makeSky(); sky.setPalette(palette('coast', 'day'), 'day', 'n');
    const g = sky as unknown as { dome: THREE.Mesh; clouds: THREE.Mesh };
    const mat = [g.dome.material, g.clouds.material]; const kids = sky.group.children.length;
    for (let i = 0; i <= 50; i++) sky.setLive(livePalette('coast', 'day', 3, 2 / 3 + i / 150), 'day', 'dusk', 'high');
    expect([g.dome.material, g.clouds.material]).toEqual(mat);
    expect(g.dome.material).toBe(mat[0]);
    expect(sky.group.children.length).toBe(kids);
  });
});
