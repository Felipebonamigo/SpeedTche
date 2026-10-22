// M6 (b): o cenário ao vivo (sceneryLook + Scenery.setLive). Os três períodos têm valores fixos no cenário (runtime.ts: filtro de cor, janelas, letreiros, brilho, cones, mancha);
// `sceneryLook(light)` os interpola pela luz do período, e `Scenery.setLive` os aplica em cor e intensidade de material, sem programa novo.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getTrack } from '../src/core/track';
import { livePalette, mix, palette, sceneryLook } from '../src/render/palette';
import { buildRoadFrame } from '../src/render/roadframe';
import { fakeCanvasDocument } from './canvas-fake';

describe('M6 (b): o cenário ao vivo', () => {
  let restore = (): void => {};
  beforeEach(() => { restore = fakeCanvasDocument(); });
  afterEach(() => restore());

  it('nas três luzes do período dá os valores que o cenário usa hoje (dia · entardecer · noite)', () => {
    const day = sceneryLook(1); const dusk = sceneryLook(0.7); const night = sceneryLook(0.32);
    expect(day.tint).toBe('#ffffff'); expect(dusk.tint).toBe(mix('#ffffff', '#5a2e4a', 0.22)); expect(night.tint).toBe(mix('#ffffff', '#3a0a60', 0.5)); // V12: a noite do cenário é roxa (era mix com #0a1030, 0,42, azul-marinho)
    expect([day.lit, dusk.lit, night.lit]).toEqual([0, 0.6, 1].map((v) => expect.closeTo(v, 12)));
    expect([day.panel, dusk.panel, night.panel]).toEqual([0.3, 0.6, 0.6].map((v) => expect.closeTo(v, 12)));
    expect([day.glow, dusk.glow, night.glow]).toEqual([0.95, 1.4, 2.0].map((v) => expect.closeTo(v, 12)));
    expect([day.cones, dusk.cones, night.cones]).toEqual([0, 0, 1].map((v) => expect.closeTo(v, 12)));
    expect([day.blob, dusk.blob, night.blob]).toEqual(['#1c2a5a', '#2c1a48', '#12051e']); // V12: a mancha de sombra da noite é roxo-escura (era #050818)
    expect([day.blobOpacity, dusk.blobOpacity, night.blobOpacity]).toEqual([0.32, 0.32, 0.4].map((v) => expect.closeTo(v, 12)));
  });

  it('é contínua e monótona nas luzes que acendem: 1 → 0,32 nunca apaga o que acendeu', () => {
    let prev = sceneryLook(1);
    for (let i = 1; i <= 680; i++) {
      const cur = sceneryLook(1 - i / 1000);
      expect(cur.lit).toBeGreaterThanOrEqual(prev.lit); expect(cur.glow).toBeGreaterThanOrEqual(prev.glow - 1e-12); expect(cur.cones).toBeGreaterThanOrEqual(prev.cones);
      expect(cur.lit - prev.lit).toBeLessThan(0.01); expect(Math.abs(cur.glow - prev.glow)).toBeLessThan(0.01); expect(cur.cones - prev.cones).toBeLessThan(0.01);
      for (const v of [cur.lit, cur.panel, cur.glow, cur.cones, cur.blobOpacity]) expect(Number.isFinite(v)).toBe(true);
      expect(cur.tint).toMatch(/^#[0-9a-f]{6}$/);
      prev = cur;
    }
  });

  it('Scenery.setLive aplica o olhar em material (fachadas, letreiros, brilho, mancha, cones) sem mexer na `version`', async () => {
    const { Scenery } = await import('../src/render/scenery/runtime');
    const track = getTrack('sampa_noite');
    const s = new Scenery();
    s.update(buildRoadFrame(track, track.length * 0.2, 30, 200), track, 1);
    const g = s as unknown as { facadeMats: THREE.MeshStandardMaterial[]; panelMat: THREE.MeshStandardMaterial; glowMat: THREE.MeshBasicMaterial; blobMat: THREE.MeshBasicMaterial; flatMat: THREE.MeshStandardMaterial; materials: { cone: THREE.MeshBasicMaterial } };
    const versions = [...g.facadeMats, g.panelMat, g.glowMat, g.blobMat, g.flatMat].map((m) => m.version);
    const live = livePalette('city_night', 'dusk', 3, 1);
    s.setLive(live.p);
    expect(g.facadeMats[0].emissiveIntensity).toBeCloseTo(1.25, 12);
    expect(g.panelMat.emissiveIntensity).toBeCloseTo(0.6, 12);
    expect(g.glowMat.color.r).toBeCloseTo(2.0, 12);
    expect(g.blobMat.opacity).toBeCloseTo(0.34, 12); // V22/F6: a mancha esticada cobre mais chão que o disco redondo: 0,40 → 0,34 à noite (o teto do runtime; palette.ts não mudou)
    expect(g.flatMat.color.getHexString()).toBe(new THREE.Color(sceneryLook(0.32).tint).getHexString());
    expect(g.materials.cone.opacity).toBeCloseTo(0.035, 12);
    s.setLive(livePalette('city_night', 'dusk', 3, 0).p);
    expect(g.facadeMats[0].emissiveIntensity).toBeCloseTo(0.6 * 1.25, 12);
    expect(g.materials.cone.opacity).toBe(0);
    expect([...g.facadeMats, g.panelMat, g.glowMat, g.blobMat, g.flatMat].map((m) => m.version)).toEqual(versions);
    expect(palette('city_night', 'dusk').light).toBe(0.7);
  }, 60000);
});
