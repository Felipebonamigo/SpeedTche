// L4: o horizonte do Rio entra no `farGroup` do terreno e sai dele (sem vazar) ao trocar de pista ou de qualidade.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Terrain } from '../src/render/terrain';
import { buildHorizon } from '../src/render/horizon';
import { palette } from '../src/render/palette';
import { fakeCanvasDocument } from './canvas-fake';

describe('horizonte ligado ao terreno', () => {
  const p = palette('coast', 'day');
  let restore: () => void;
  beforeEach(() => { restore = fakeCanvasDocument(); });
  afterEach(() => restore());
  it('setHorizon põe a paisagem no farGroup e a troca/retira sem deixar a antiga', () => {
    const terrain = new Terrain(64);
    const a = buildHorizon('copacabana', p, 'high');
    expect(a).not.toBeNull();
    const before = terrain.farGroup.children.length;
    terrain.setHorizon(a);
    expect(terrain.farGroup.children).toContain(a);
    expect(terrain.farGroup.children.length).toBe(before + 1);
    const b = buildHorizon('copacabana', p, 'low');
    terrain.setHorizon(b);
    expect(terrain.farGroup.children).not.toContain(a);
    expect(terrain.farGroup.children).toContain(b);
    terrain.setHorizon(null);
    expect(terrain.farGroup.children.length).toBe(before);
    expect(terrain.farGroup.children.some((o) => o instanceof THREE.Group && o === b)).toBe(false);
  });
  it('pista sem paisagem própria devolve null e setHorizon(null) é inofensivo', () => {
    const terrain = new Terrain(64);
    expect(buildHorizon('rota_66', p, 'high')).toBeNull();
    expect(() => terrain.setHorizon(null)).not.toThrow();
  });
});
