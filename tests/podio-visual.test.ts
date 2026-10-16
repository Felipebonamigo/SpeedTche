// T8 (docs/ondas/T8-pontas.md, itens 1 e 2): o palco desenha o visual inteiro (DisplayCar.look: acabamento, roda, aro, faixa e chama),
// não só a pintura — na garagem (o painel do carro) e no pódio do resultado (cada lugar com o look da corrida). Sem GL: o `Stage` posa os
// carros e o teste lê o que ele entregou ao `Cars.poseDisplay` e o que o `Cars` desenhou (chama do nitro).
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResultsScreenData } from '../src/game/contracts';
import type { CarLook, RaceResultRow } from '../src/core/types';
import { StageBus } from '../src/render/stage-bus';
import { podiumEntries } from '../src/ui/screens/results';
import { fakeCanvasDocument } from './canvas-fake';
import { human } from './helpers';

let restoreDoc: () => void;
beforeEach(() => { restoreDoc = fakeCanvasDocument(); });
afterEach(() => restoreDoc());

const LOOK: CarLook = { finish: 'cromado', wheel: 'mag', rim: 'dourado', stripe: 'nenhuma', flame: 'rosa' };

function fakeGl(): THREE.WebGLRenderer {
  const clear = new THREE.Color(0); let alpha = 1;
  return {
    toneMappingExposure: 1, setScissorTest() {}, info: { reset() {}, render: { calls: 0, triangles: 0 } },
    getClearColor: (t: THREE.Color) => t.copy(clear), getClearAlpha: () => alpha, setClearColor: (c: THREE.ColorRepresentation, a = 1) => { clear.set(c); alpha = a; },
  } as unknown as THREE.WebGLRenderer;
}

async function setup() {
  const { Cars } = await import('../src/render/cars');
  const { Stage } = await import('../src/render/stage');
  const raceScene = new THREE.Scene();
  const cars = new Cars(raceScene);
  const stage = new Stage({ renderer: fakeGl(), cars, raceScene, raceCarLight: () => 1, raceCarQuality: () => 'high' });
  const posed = vi.spyOn(cars, 'poseDisplay');
  return { cars, stage, posed };
}

type Internal = {
  slotFor(p: unknown): unknown;
  poseCar(p: unknown, slot: unknown, aspect: number, dt: number, reveal: null, workshop: null, age: number, reduce: boolean): void;
  posePodium(p: unknown, slot: unknown, aspect: number, time: number, dt: number): void;
};

describe('o palco desenha o look inteiro', () => {
  it('painel de carro (garagem/lobby): o DisplayCar leva o look do painel', async () => {
    const { stage, posed } = await setup();
    const panel = new StageBus().panel('garage:P1');
    panel.set({ carId: 'falcao', paint: null, look: LOOK });
    const s = stage as unknown as Internal;
    s.poseCar(panel, s.slotFor(panel), 16 / 9, 1 / 60, null, null, 0, false);
    expect(posed.mock.calls.at(-1)?.[0][0]).toMatchObject({ carId: 'falcao', look: LOOK });
    stage.dispose();
  });

  it('pódio: cada lugar posado com o look da entrada', async () => {
    const { stage, posed } = await setup();
    const panel = new StageBus().panel('results:podium');
    panel.set({ kind: 'podium', podium: [{ place: 1, carId: 'falcao', paint: null, look: LOOK }, { place: 2, carId: 'trovao', paint: null, look: null }] });
    const s = stage as unknown as Internal;
    s.posePodium(panel, s.slotFor(panel), 16 / 9, 0, 1 / 60);
    const items = posed.mock.calls.at(-1)?.[0] ?? [];
    expect(items.find((i) => i.carId === 'falcao')?.look).toEqual(LOOK);
    expect(items.find((i) => i.carId === 'trovao')?.look ?? null).toBeNull();
    stage.dispose();
  });

  it('garagem com o foco no nitro: a chama acende nos escapes, na cor escolhida; fora dele, apagada', async () => {
    const { cars, stage } = await setup();
    const panel = new StageBus().panel('garage:P1');
    panel.set({ carId: 'falcao', paint: null, look: LOOK, focus: 'nitro' });
    const s = stage as unknown as Internal;
    s.poseCar(panel, s.slotFor(panel), 16 / 9, 1 / 60, null, null, 0, false);
    const flames = (cars as unknown as { flames: THREE.InstancedMesh }).flames;
    expect(flames.visible).toBe(true);
    expect(flames.count).toBe(cars.modelOf('falcao').exhausts.length);
    const { flameChosenColor } = await import('../src/render/cars/flame');
    const c = new THREE.Color(); flames.getColorAt(0, c);
    expect(c.getHexString()).toBe(flameChosenColor('rosa')?.getHexString());
    panel.set({ focus: 'engine' });
    s.poseCar(panel, s.slotFor(panel), 16 / 9, 1 / 60, null, null, 0, false);
    expect(flames.visible).toBe(false);
    stage.dispose();
  });
});

describe('reduzir efeitos no palco (T8, lobby e garagem)', () => {
  it('com "reduzir efeitos" o prato não gira: o carro fica parado no ângulo de mostra; sem, gira', async () => {
    const { stage } = await setup();
    const s = stage as unknown as Internal & { slots: Map<string, { yaw: number }> };
    const spin = (reduce: boolean): number => {
      const panel = new StageBus().panel(`lobby:${reduce}`);
      panel.set({ carId: 'falcao', reduceEffects: reduce });
      const slot = s.slotFor(panel) as { yaw: number };
      s.poseCar(panel, slot, 16 / 9, 1 / 60, null, null, 0, reduce);
      const y0 = slot.yaw;
      for (let i = 0; i < 30; i++) s.poseCar(panel, slot, 16 / 9, 1 / 30, null, null, 0, reduce);
      return Math.abs(slot.yaw - y0);
    };
    expect(spin(false)).toBeGreaterThan(0.1);
    expect(spin(true)).toBe(0);
    stage.dispose();
  });
});

describe('pódio do resultado: as entradas trazem o look da corrida', () => {
  const row = (position: number, seat: number, carDefId: string): RaceResultRow => ({
    carId: position, seat, name: seat >= 0 ? `P${seat + 1}` : `IA ${position}`, teamId: 0, carDefId, position, finished: true, totalTicks: 1000 * position, bestLapTicks: 300, points: 0,
  });

  it('o humano no pódio leva o look inteiro dele; a IA, o de fábrica', () => {
    const d = {
      results: [row(1, 0, 'falcao'), row(2, -1, 'trovao'), row(3, -1, 'tornado')],
      humans: [{ ...human(0, 0, 'falcao'), look: LOOK }],
    } as unknown as ResultsScreenData;
    const p = podiumEntries(d);
    expect(p[0]).toMatchObject({ place: 1, carId: 'falcao', look: LOOK });
    expect(p[1].look ?? null).toBeNull();
  });

  it('dois humanos com o mesmo carro e o mesmo visual: o pódio repete a troca de pintura da corrida (raceLooks), não dois carros iguais', () => {
    const d = {
      results: [row(1, 0, 'falcao'), row(2, 1, 'falcao'), row(3, -1, 'tornado')],
      humans: [{ ...human(0, 0, 'falcao'), look: LOOK }, { ...human(1, 0, 'falcao'), look: LOOK }],
    } as unknown as ResultsScreenData;
    const p = podiumEntries(d);
    expect(p[0].look).toMatchObject(LOOK);
    expect(p[1].look?.paint).toBeDefined();
    expect(p[1].look?.paint).not.toBe(p[0].look?.paint ?? 'original');
    expect(p[1].look).toMatchObject({ finish: 'cromado', wheel: 'mag', rim: 'dourado' });
  });
});
