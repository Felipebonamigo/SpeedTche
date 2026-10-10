// M4 — chama do nitro em MALHA (src/render/cars/flame.ts), com cor por instância pronta para o visual do carro, e a
// ligação dela (e da guinada e das estrelinhas) no `Cars`. Roda no Node, com o canvas 2D falso das outras provas dos carros.
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRace } from '../src/core/sim/race';
import { getTrack } from '../src/core/track';
import type { RaceState } from '../src/core/types';
import type { RenderFrame } from '../src/game/contracts';
import { Cars } from '../src/render/cars';
import { FLAME_FRAG, FLAME_VERT, buildFlameGeometry, flameColorFor } from '../src/render/cars/flame';
import { buildRoadFrame } from '../src/render/roadframe';

afterEach(() => { vi.unstubAllGlobals(); });

function fakeCanvasDocument(): void {
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createImageData' || key === 'getImageData') return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      if (key === 'measureText') return () => ({ width: 10 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
}

interface Inner { flames: THREE.InstancedMesh; stars: THREE.InstancedMesh; styles: Array<{ model: { body: string }; mesh: THREE.InstancedMesh; count: number }> }
const inner = (c: Cars) => c as unknown as Inner;

/** Corrida de 4 carros (o jogador de Falcão, que fica em `own`) e uma passada de `update` + `pose`. */
function scene(mutate: (state: RaceState, own: number) => void = () => undefined, paints?: RenderFrame['paints']) {
  fakeCanvasDocument();
  const track = getTrack('copacabana');
  const state = createRace({
    trackId: 'copacabana', laps: 2, humans: [{ seat: 0, name: 'P1', carId: 'falcao', teamId: 0, color: '#fff' }], totalCars: 4, difficulty: 'profissional',
    manualGear: false, assists: { sharedNitro: false, tow: false, teamDraft: false, catchup: false }, seed: 42,
  }, track);
  const own = state.cars.findIndex((c) => c.seat === 0);
  state.cars.forEach((c, i) => { if (i !== own) { c.z = state.cars[own].z - 100_000; c.x = 0; } }); // longe, atrás: só o jogador aparece
  mutate(state, own);
  const cars = new Cars(new THREE.Scene());
  const frame: RenderFrame = {
    state, track, viewports: [], time: 0, paused: true, coop: false, showHud: false, paints,
    options: { quality: 'high', showMinimap: false, screenShake: false, reduceEffects: false, palette: 'default' },
  };
  const rf = buildRoadFrame(track, state.cars[own].z, 8, 60);
  const draw = (time = frame.time) => { frame.time = time; cars.update(frame); cars.pose(rf, state, track, own, [], time); };
  return { state, own, cars, frame, draw };
}

describe('malha da chama', () => {
  const g = buildFlameGeometry();
  const pos = g.getAttribute('position');
  const tri = (g.index ? g.index.count : pos.count) / 3;

  it('é uma gota fechada na ponta, ao longo de +Z (0 no escape, 1 na ponta), de 60 a 160 triângulos', () => {
    expect(tri).toBeGreaterThanOrEqual(60);
    expect(tri).toBeLessThanOrEqual(160);
    g.computeBoundingBox();
    const bb = g.boundingBox as THREE.Box3;
    expect(bb.min.z).toBeCloseTo(0, 5);
    expect(bb.max.z).toBeCloseTo(1, 5);
    expect(bb.max.x).toBeGreaterThan(0.3);
    expect(bb.max.x).toBeLessThanOrEqual(0.6 + 1e-6);
    for (let i = 0; i < pos.count; i++) if (pos.getZ(i) > 0.999) expect(Math.hypot(pos.getX(i), pos.getY(i))).toBeLessThan(1e-6); // a ponta fecha
  });

  it('o uv.y é a posição ao longo da chama (a base é 0 e a ponta 1), para o shader apagar a ponta', () => {
    const uv = g.getAttribute('uv');
    expect(uv).toBeDefined();
    for (let i = 0; i < pos.count; i++) expect(uv.getY(i)).toBeCloseTo(pos.getZ(i), 4);
  });

  it('o shader lê a cor da instância (instanceColor) e não depende mais da textura de quadros', () => {
    expect(FLAME_VERT).toContain('instanceColor');
    expect(FLAME_FRAG).not.toContain('uMap');
  });

  it('a cor da chama liga ao visual do carro: acentos diferentes dão chamas diferentes, sempre claras e saturadas o bastante', () => {
    const a = flameColorFor('#e53935'); const b = flameColorFor('#43a047');
    expect(a.equals(b)).toBe(false);
    for (const c of [a, b, flameColorFor('#000000'), flameColorFor('#ffffff')]) {
      const hsl = { h: 0, s: 0, l: 0 };
      c.getHSL(hsl);
      expect(hsl.l).toBeGreaterThan(0.45); // chama acende, nunca cor de breu
      expect(hsl.s).toBeGreaterThan(0.3);
    }
  });
});

describe('Cars: a chama em malha, por instância', () => {
  it('sem nitro não há chama; com nitro, uma por escape (2 no GT) com a cor do visual do carro', () => {
    const none = scene();
    none.draw();
    expect(inner(none.cars).flames.count).toBe(0);
    expect(inner(none.cars).flames.visible).toBe(false);
    none.cars.dispose();

    const on = scene((s, own) => { s.cars[own].nitroTicks = 90; }, [{ color: '#2244ff', accent: '#e53935' }]);
    on.draw(0.5);
    const flames = inner(on.cars).flames;
    expect(flames.count).toBe(2);
    expect(flames.visible).toBe(true);
    expect(flames.instanceColor).not.toBeNull();
    const want = flameColorFor('#e53935');
    for (let k = 0; k < 2; k++) {
      expect(flames.instanceColor?.getX(k)).toBeCloseTo(want.r, 5);
      expect(flames.instanceColor?.getY(k)).toBeCloseTo(want.g, 5);
      expect(flames.instanceColor?.getZ(k)).toBeCloseTo(want.b, 5);
    }
    // A geometria é a malha, não mais um plano.
    expect((flames.geometry.getAttribute('position') as THREE.BufferAttribute).count).toBeGreaterThan(60);
    on.cars.dispose();
  });
});

/** Rumo do carro (rad, + = direita) lido da matriz da instância do jogador. */
function heading(c: Cars): number {
  const lot = inner(c).styles.find((s) => s.count > 0);
  if (!lot) throw new Error('sem carro desenhado');
  const m = new THREE.Matrix4();
  lot.mesh.getMatrixAt(0, m);
  const f = new THREE.Vector3(0, 0, -1).transformDirection(m);
  return Math.atan2(f.x, -f.z);
}

describe('Cars: guinada da derrapagem e estrelinhas', () => {
  it('derrapando para a direita o bico aponta ~0,35 rad mais para a direita; para a esquerda, o contrário', () => {
    const base = scene();
    for (let k = 0; k < 90; k++) base.draw(k / 60);
    const h0 = heading(base.cars);
    base.cars.dispose();
    for (const dir of [1, -1]) {
      const s = scene((st, own) => { st.cars[own].driftDir = dir; st.cars[own].driftTicks = 40; });
      for (let k = 0; k < 90; k++) s.draw(k / 60);
      expect((heading(s.cars) - h0) * dir).toBeGreaterThan(0.33);
      expect((heading(s.cars) - h0) * dir).toBeLessThan(0.37);
      s.cars.dispose();
    }
  });

  it('a batida liga 3 estrelinhas sobre o carro por ~0,9 s; passado o tempo, somem', () => {
    const s = scene((st, own) => { st.cars[own].speed = 4000; });
    s.draw(0);
    s.draw(0.016);
    expect(inner(s.cars).stars.count).toBe(0);
    s.state.cars[s.own].collisionCooldown = 20;
    s.state.cars[s.own].speed = 2000;
    s.draw(0.032);
    s.draw(0.3);
    expect(inner(s.cars).stars.count).toBe(3);
    expect(inner(s.cars).stars.visible).toBe(true);
    s.state.cars[s.own].collisionCooldown = 0;
    s.draw(1.4);
    expect(inner(s.cars).stars.count).toBe(0);
    expect(inner(s.cars).stars.visible).toBe(false);
    s.cars.dispose();
  });

  it('"Reduzir efeitos" desliga as estrelinhas', () => {
    const s = scene((st, own) => { st.cars[own].speed = 4000; });
    s.frame.options.reduceEffects = true;
    s.draw(0);
    s.state.cars[s.own].collisionCooldown = 20;
    s.state.cars[s.own].speed = 2000;
    s.draw(0.032);
    s.draw(0.3);
    expect(inner(s.cars).stars.count).toBe(0);
    s.cars.dispose();
  });
});
