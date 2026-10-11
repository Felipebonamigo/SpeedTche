// M6 (b): o chão ao vivo (Terrain.setLive, Horizon.setBlend). A cor do chão é combinação convexa das cores da paleta com pesos que não dependem delas, então a mistura de duas
// tabelas de cor (a da pista e a do período seguinte) é EXATAMENTE a tabela da paleta interpolada. Os anéis de montanha e o horizonte do Rio levam a segunda cor por vértice
// (`colorB`) e um uniforme; o mar, a espuma, o chão plano e as janelas da cidade são uniformes. Nada recompila por passo.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTrack } from '../src/core/track';
import type { SceneryId, TimeOfDay, Track } from '../src/core/types';
import { buildHorizon } from '../src/render/horizon';
import { blendPalette, livePalette, palette } from '../src/render/palette';
import { buildRoadFrame } from '../src/render/roadframe';
import { Terrain } from '../src/render/terrain';
import { fakeCanvasDocument } from './canvas-fake';

describe('M6 (b): o chão ao vivo', () => {
  let restore = (): void => {};
  beforeEach(() => { restore = fakeCanvasDocument(); });
  afterEach(() => restore());
  const track = (id: string): Track => getTrack(id);
  const colorsOf = (t: Terrain, tr: Track): Float32Array[] => {
    const frame = buildRoadFrame(tr, tr.length * 0.37, 30, 120);
    t.update(frame, tr, 0, new THREE.Vector3(0, 1, 0), 0);
    const strips = t.group.children.slice(0, 2) as THREE.Mesh[];
    return strips.map((m) => Float32Array.from(m.geometry.attributes.color.array as Float32Array));
  };
  const close = (a: Float32Array[], b: Float32Array[], tol: number): void => {
    a.forEach((x, s) => { let worst = 0; for (let i = 0; i < x.length; i++) worst = Math.max(worst, Math.abs(x[i] - b[s][i])); expect(worst).toBeLessThanOrEqual(tol); });
  };
  const staticTerrain = (tr: Track, sc: SceneryId, time: TimeOfDay, key: string): Terrain => { const t = new Terrain(200); t.setTrack(tr, palette(sc, time), key); return t; };

  it('as cores do chão em t = 0 são as da pista, em t = 1 as do período seguinte, e no meio as da paleta interpolada (exato)', () => {
    for (const [id, sc, from, to] of [['serra_dos_orgaos', 'tropical', 'day', 'dusk'], ['sampa_noite', 'city_night', 'dusk', 'night'], ['copacabana', 'coast', 'day', 'dusk']] as Array<[string, SceneryId, TimeOfDay, TimeOfDay]>) {
      const tr = track(id);
      const live = new Terrain(200);
      live.setTrack(tr, palette(sc, from), `${id}:live`, palette(sc, to));
      live.setLive(livePalette(sc, from, 3, 0));
      close(colorsOf(live, tr), colorsOf(staticTerrain(tr, sc, from, `${id}:a`), tr), 1e-6);
      live.setLive(livePalette(sc, from, 3, 1));
      close(colorsOf(live, tr), colorsOf(staticTerrain(tr, sc, to, `${id}:b`), tr), 1e-6);
      const mid = livePalette(sc, from, 3, from === 'day' ? 2 / 3 + 1 / 6 : 2 / 3);
      live.setLive(mid);
      expect(mid.t).toBeGreaterThan(0.2); expect(mid.t).toBeLessThan(0.8);
      const ref = new Terrain(200); ref.setTrack(tr, mid.p, `${id}:mid`);
      close(colorsOf(live, tr), colorsOf(ref, tr), 0.02); // a paleta interpolada tem cores de 8 bits (hex): o resto é o arredondamento
    }
  }, 60000);

  it('o mar, a espuma e o chão plano acompanham a paleta (o caminho de brilho do sol, a cor do disco)', () => {
    const tr = track('copacabana');
    const t = new Terrain(200);
    t.setTrack(tr, palette('coast', 'day'), 'sea', palette('coast', 'dusk'));
    const sea = (t as unknown as { sea: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> }).sea.material.uniforms;
    const a = palette('coast', 'day'); const b = palette('coast', 'dusk');
    t.setLive(livePalette('coast', 'day', 3, 0));
    expect(sea.uSpec.value).toBe(a.seaSpec); expect(sea.uGlint.value).toBe(a.seaGlint);
    t.setLive(livePalette('coast', 'day', 3, 1));
    expect(sea.uSpec.value).toBe(b.seaSpec); expect(sea.uGlint.value).toBe(b.seaGlint);
    expect((sea.uSunColor.value as THREE.Color).getHexString()).toBe(new THREE.Color(b.sun ?? '#fff').getHexString());
    expect((sea.uDeep.value as THREE.Color).getHexString()).toBe(new THREE.Color(b.waterDeep).getHexString());
    const m = livePalette('coast', 'day', 3, 2 / 3 + 1 / 6);
    t.setLive(m);
    expect(sea.uSpec.value).toBeLessThan(a.seaSpec); expect(sea.uSpec.value).toBeGreaterThan(b.seaSpec);
  });

  it('os anéis de montanha levam as duas cores por vértice e o uniforme de mistura anda com t', () => {
    const tr = track('serra_dos_orgaos');
    const t = new Terrain(200);
    t.setTrack(tr, palette('tropical', 'day'), 'ring', palette('tropical', 'dusk'));
    const g = t as unknown as { ringMeshes: THREE.Mesh[]; ringMaterial: THREE.ShaderMaterial };
    expect(g.ringMeshes.length).toBeGreaterThan(0);
    const dusk = new Terrain(200); dusk.setTrack(tr, palette('tropical', 'dusk'), 'ring-b');
    const refRings = (dusk as unknown as { ringMeshes: THREE.Mesh[] }).ringMeshes;
    g.ringMeshes.forEach((m, i) => {
      const colorB = m.geometry.getAttribute('colorB') as THREE.BufferAttribute;
      expect(colorB, `anel ${i}`).toBeDefined();
      const want = refRings[i].geometry.getAttribute('color').array as Float32Array;
      let worst = 0; for (let k = 0; k < want.length; k++) worst = Math.max(worst, Math.abs((colorB.array as Float32Array)[k] - want[k]));
      expect(worst).toBeLessThan(1e-6);
    });
    t.setLive(livePalette('tropical', 'day', 3, 2 / 3 + 1 / 6));
    expect(g.ringMaterial.uniforms.uBlend.value).toBeCloseTo(0.5, 12);
    t.setLive(livePalette('tropical', 'day', 3, 0));
    expect(g.ringMaterial.uniforms.uBlend.value).toBe(0);
    // Sem período seguinte (noite) o atributo existe e aponta para a própria cor: um programa só.
    const night = new Terrain(200); night.setTrack(tr, palette('tropical', 'night'), 'ring-n');
    for (const m of (night as unknown as { ringMeshes: THREE.Mesh[] }).ringMeshes) expect(m.geometry.getAttribute('colorB')).toBeDefined();
  });

  it('a cidade acende: as janelas do fundo e a cor dos prédios andam com a luz do período', () => {
    const tr = track('sampa_noite');
    const day = new Terrain(200);
    day.setTrack(tr, palette('city_night', 'day'), 'city', palette('city_night', 'dusk'));
    const mat = (day as unknown as { cityMaterial: THREE.MeshStandardMaterial }).cityMaterial;
    day.setLive(livePalette('city_night', 'day', 3, 0));
    expect(mat.emissiveIntensity).toBe(0);
    day.setLive(livePalette('city_night', 'day', 3, 2 / 3 + 1 / 6));
    expect(mat.emissiveIntensity).toBeGreaterThan(0); expect(mat.emissiveIntensity).toBeLessThan(1.3);
    day.setLive(livePalette('city_night', 'day', 3, 1));
    expect(mat.emissiveIntensity).toBeCloseTo(1.3, 12);
    expect(mat.color.getHexString()).toBe(new THREE.Color('#6a7488').getHexString());
    const dusk = new Terrain(200);
    dusk.setTrack(tr, palette('city_night', 'dusk'), 'city2', palette('city_night', 'night'));
    const m2 = (dusk as unknown as { cityMaterial: THREE.MeshStandardMaterial }).cityMaterial;
    dusk.setLive(livePalette('city_night', 'dusk', 3, 1));
    expect(m2.color.getHexString()).toBe(new THREE.Color('#4a5470').getHexString());
  });

  it('nenhum material novo e nenhum programa recompilado por passo (a `version` não anda)', () => {
    const tr = track('copacabana');
    const t = new Terrain(200);
    t.setTrack(tr, palette('coast', 'day'), 'v', palette('coast', 'dusk'));
    const mats: THREE.Material[] = [];
    t.group.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) mats.push(m); });
    const versions = mats.map((m) => m.version);
    for (let i = 0; i <= 200; i++) t.setLive(livePalette('coast', 'day', 3, 2 / 3 + i / 600));
    const after: THREE.Material[] = [];
    t.group.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) after.push(m); });
    expect(after).toEqual(mats);
    mats.forEach((m, i) => expect(m.version, `material ${i}`).toBe(versions[i]));
  });

  it('o horizonte do Rio leva as duas cores por vértice (a segunda é a do horizonte pintado no período seguinte) e mistura por uniforme', () => {
    const a = palette('coast', 'day'); const b = palette('coast', 'dusk');
    const h = buildHorizon('copacabana', a, 'high', b);
    const ref = buildHorizon('copacabana', b, 'high');
    expect(h && ref).toBeTruthy();
    if (!h || !ref) return;
    const meshes = (g: THREE.Object3D): THREE.Mesh[] => g.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh);
    const ms = meshes(h); const rs = meshes(ref);
    expect(ms.length).toBe(rs.length);
    ms.forEach((m, i) => {
      const cb = m.geometry.getAttribute('colorB') as THREE.BufferAttribute;
      expect(cb, `malha ${i}`).toBeDefined();
      const want = rs[i].geometry.getAttribute('color').array as Float32Array;
      expect(cb.count).toBe(want.length / 3);
      let worst = 0; for (let k = 0; k < want.length; k++) worst = Math.max(worst, Math.abs((cb.array as Float32Array)[k] - want[k]));
      expect(worst).toBeLessThan(1e-6);
    });
    h.setBlend(0.5);
    expect(h.blend.value).toBe(0.5);
    // Sem período seguinte: o atributo aponta para a própria cor, um programa só.
    const still = buildHorizon('copacabana', a, 'high');
    for (const m of meshes(still as THREE.Object3D)) expect(m.geometry.getAttribute('colorB')).toBeDefined();
    h.dispose(); ref.dispose(); still?.dispose();
    expect(blendPalette(a, b, 0.5).light).toBeCloseTo((a.light + b.light) / 2, 12);
  });
});
