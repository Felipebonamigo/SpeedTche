// L3: um modelo por carro. O instanciamento agrupa por MODELO, não por `CarDef.body`: com um .glb para o Falcão, ele deixa
// de dividir o lote (e a forma) com o Boitatá, que segue com o GT procedural. Também: LOD1 para carro longe, material com
// atlas, roda do arquivo e a carga do arquivo por nome de carro ou de estilo. Roda no Node (canvas 2D falso para as texturas).
import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CARS, carDef } from '../src/core/data/cars';
import { createRace } from '../src/core/sim/race';
import { getTrack } from '../src/core/track';
import type { RaceState } from '../src/core/types';
import type { RenderFrame } from '../src/game/contracts';
import { Cars } from '../src/render/cars';
import { loadCarAssets } from '../src/render/cars/assets';
import { parseCarGlb } from '../src/render/cars/gltf';
import type { CarModel } from '../src/render/cars/model';
import { buildModel, modelKey, modelSource, setModelOverride } from '../src/render/cars/models';
import { buildRoadFrame } from '../src/render/roadframe';
import { installNodeFileReader } from '../scripts/lib/node-filereader';
import { installNodeImage } from '../scripts/lib/node-image';
import { buildTestCar } from '../scripts/lib/test-car';

beforeAll(() => { installNodeFileReader(); installNodeImage(); });
afterEach(() => { vi.unstubAllGlobals(); for (const k of ['falcao', 'gt', 'sedan']) setModelOverride(k, null); });

const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const dataUrl = (b: Buffer) => `data:model/gltf-binary;base64,${b.toString('base64')}`;

/** O carro de caixas como arquivo do Falcão (um carro só). */
async function falcaoModel(): Promise<CarModel> {
  const { model, problems } = await parseCarGlb('gt', ab(buildTestCar({})), { carId: 'falcao' });
  expect(problems).toEqual([]);
  if (!model) throw new Error('sem modelo');
  return model;
}

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

interface Batch { model: CarModel; mesh: THREE.InstancedMesh; count: number; lod1?: { mesh: THREE.InstancedMesh; count: number }; wheels: { mesh: THREE.InstancedMesh; count: number } }
const internals = (cars: Cars) => cars as unknown as {
  styles: Batch[]; wheelBatches: Array<{ mesh: THREE.InstancedMesh; count: number }>; simpleWheels: { mesh: THREE.InstancedMesh; count: number }; ghost: THREE.Mesh;
};

/** Corrida com o jogador de Falcão; `others` põe carros (id e distância à frente em metros) e tira os demais de cena. */
function scene(others: Array<[string, number]>): { state: RaceState; own: number; cars: Cars; frame: RenderFrame; draw: () => void } {
  fakeCanvasDocument();
  const track = getTrack('copacabana');
  const state = createRace({
    trackId: 'copacabana', laps: 2, humans: [{ seat: 0, name: 'P1', carId: 'falcao', teamId: 0, color: '#fff' }], totalCars: 8, difficulty: 'profissional',
    manualGear: false, assists: { sharedNitro: false, tow: false, teamDraft: false, catchup: false }, seed: 42,
  }, track);
  const own = state.cars.findIndex((c) => c.seat === 0);
  const others_ = state.cars.filter((_, i) => i !== own);
  others_.forEach((c, k) => {
    const o = others[k];
    c.carId = o ? o[0] : 'camelo';
    c.z = o ? state.cars[own].z + o[1] * 50 : state.cars[own].z - 100_000; // 50 unidades de pista por metro; sem posição = longe, atrás
    c.x = 0;
  });
  const cars = new Cars(new THREE.Scene());
  const frame: RenderFrame = {
    state, track, viewports: [], time: 0, paused: true, coop: false, showHud: false,
    options: { quality: 'high', showMinimap: false, screenShake: false, reduceEffects: false, palette: 'default' },
  };
  const draw = () => { cars.update(frame); cars.pose(buildRoadFrame(track, state.cars[own].z, 8, 60), state, track, own, [], 0); };
  return { state, own, cars, frame, draw };
}

describe('modelo por carro: a chave do modelo', () => {
  it('sem arquivo próprio, carros do mesmo estilo dividem o modelo (a chave é o estilo)', () => {
    expect(modelKey(carDef('falcao'))).toBe('gt');
    expect(modelKey(carDef('boitata'))).toBe('gt');
    expect(modelKey(carDef('trovao'))).toBe('muscle');
  });

  it('com falcao.glb, o Falcão tem modelo próprio e o Boitatá segue com o procedural do GT', async () => {
    setModelOverride('falcao', await falcaoModel());
    expect(modelKey(carDef('falcao'))).toBe('falcao');
    expect(modelKey(carDef('boitata'))).toBe('gt');
    expect(modelSource('falcao')).toBe('glb');
    expect(modelSource('boitata')).toBe('procedural');
    expect(modelSource('gt')).toBe('procedural');
    expect(buildModel('falcao').carId).toBe('falcao');
    expect(buildModel('gt').carId).toBeUndefined();
  });

  it('arquivo de um carro só: as faixas vêm da malha, não da ordem do estilo', async () => {
    const estilo = await parseCarGlb('gt', ab(buildTestCar({})));
    const carro = await falcaoModel();
    expect(carro.liveries).toEqual([0]); // a malha de teste não tem camada de faixa
    expect(estilo.model?.liveries.length).toBeGreaterThan(0);
    expect(estilo.model?.liveries).not.toEqual([0]); // a ordem do estilo GT leva faixa
  });
});

describe('modelo por carro: o instanciamento (Cars)', () => {
  it('Falcão e Boitatá caem em lotes diferentes; dois Boitatás dividem o lote', async () => {
    setModelOverride('falcao', await falcaoModel());
    const { cars, draw, own, state } = scene([['boitata', 8], ['boitata', 16]]);
    draw();
    const lots = internals(cars).styles;
    const falcao = lots.find((s) => s.model.carId === 'falcao');
    const gt = lots.find((s) => s.model.body === 'gt' && !s.model.carId);
    expect(state.cars[own].carId).toBe('falcao');
    expect(falcao?.count).toBe(1);
    expect(gt?.count).toBe(2);
    cars.dispose();
  });

  it('sem arquivo próprio os três GT dividem um lote só (nada mudou para quem não tem arte)', () => {
    const { cars, draw } = scene([['boitata', 8], ['falcao', 16]]);
    draw();
    const gts = internals(cars).styles.filter((s) => s.model.body === 'gt');
    expect(gts).toHaveLength(1);
    expect(gts[0].count).toBe(3);
    cars.dispose();
  });

  it('carro longe (mais de 30 m à frente) usa o lote do LOD1; o de perto, o do LOD0', async () => {
    setModelOverride('falcao', await falcaoModel());
    const { cars, draw } = scene([['falcao', 8], ['falcao', 60]]);
    draw();
    const falcao = internals(cars).styles.find((s) => s.model.carId === 'falcao');
    expect(falcao?.lod1).toBeTruthy();
    expect(falcao?.count).toBe(2); // o jogador e o de 8 m
    expect(falcao?.lod1?.count).toBe(1); // o de 60 m
    expect(falcao?.lod1?.mesh.geometry).toBe(falcao?.model.lod1?.shell);
    cars.dispose();
  });

  it('o modelo com atlas usa material próprio com o map; o procedural, o material comum', async () => {
    const model = await falcaoModel();
    setModelOverride('falcao', model);
    const { cars } = scene([]);
    const lots = internals(cars).styles;
    const falcao = lots.find((s) => s.model.carId === 'falcao');
    const gt = lots.find((s) => s.model.body === 'gt' && !s.model.carId);
    const matF = falcao?.mesh.material as THREE.MeshPhysicalMaterial;
    const matG = gt?.mesh.material as THREE.MeshPhysicalMaterial;
    expect(matF.map).toBe(model.map);
    expect(matG.map).toBeNull();
    expect(matF).not.toBe(matG);
    expect(falcao?.lod1?.mesh.material).toBe(matF);
    // O material comum é um só para todos os procedurais.
    expect(new Set(lots.filter((s) => !s.model.carId).map((s) => s.mesh.material)).size).toBe(1);
    cars.dispose();
  });

  it('o normal map do arquivo vai para o material do modelo (e só dele)', async () => {
    const { model } = await parseCarGlb('gt', ab(buildTestCar({ normalMap: true })), { carId: 'falcao' });
    if (!model) throw new Error('sem modelo');
    setModelOverride('falcao', model);
    const { cars } = scene([]);
    const lots = internals(cars).styles;
    expect((lots.find((s) => s.model.carId === 'falcao')?.mesh.material as THREE.MeshPhysicalMaterial).normalMap).toBe(model.normalMap);
    expect((lots.find((s) => s.model.body === 'gt' && !s.model.carId)?.mesh.material as THREE.MeshPhysicalMaterial).normalMap).toBeNull();
    cars.dispose();
  });

  it('a roda de perto é a do arquivo; longe, a roda simples de todos', async () => {
    const model = await falcaoModel();
    setModelOverride('falcao', model);
    const { cars, draw } = scene([['falcao', 60]]);
    draw();
    const inner = internals(cars);
    const fileWheels = inner.wheelBatches.find((w) => w.mesh.geometry === model.wheelModel?.geometry);
    expect(fileWheels?.count).toBe(4); // só o jogador
    expect(inner.simpleWheels.count).toBe(4); // o Falcão de 60 m
    cars.dispose();
  });

  it('o fantasma usa a malha do modelo do carro dele', async () => {
    const model = await falcaoModel();
    setModelOverride('falcao', model);
    const { cars, state, own } = scene([]);
    const track = getTrack('copacabana');
    cars.poseGhost(buildRoadFrame(track, state.cars[own].z, 8, 60), track, { pose: { z: state.cars[own].z + 400, x: 0, speed: 0, steerPose: 0, nitro: false }, carId: 'falcao', delta: 0 });
    expect(internals(cars).ghost.geometry).toBe(model.shell);
    cars.dispose();
  });

  it('stats(): um lote por modelo (os estilos de sempre e o carro com arquivo)', async () => {
    setModelOverride('falcao', await falcaoModel());
    const { cars } = scene([]);
    const stats = cars.stats();
    expect(stats.styles.falcao).toBe(108);
    expect(stats.styles.gt).toBeGreaterThan(600);
    expect(Object.keys(stats.styles)).toHaveLength(14);
    cars.dispose();
  });
});

describe('modelo por carro: a carga do arquivo (assets.ts)', () => {
  it('falcao.glb entra por carro, sedan.glb por estilo, outro nome é recusado, e carro sem seat é recusado com o motivo', async () => {
    const full = dataUrl(buildTestCar({}));
    const noSeat = dataUrl(buildTestCar({ seats: 0 }));
    const report = await loadCarAssets({
      '../../assets/cars/falcao.glb': async () => full,
      '../../assets/cars/sedan.glb': async () => full,
      '../../assets/cars/fusca.glb': async () => full,
      '../../assets/cars/tatu.glb': async () => noSeat,
    });
    expect(report.loaded.sort()).toEqual(['falcao', 'sedan']);
    expect(modelSource('falcao')).toBe('glb');
    expect(modelSource('sedan')).toBe('glb');
    const rejected = Object.fromEntries(report.rejected.map((r) => [r.file, r.problems.join(' | ')]));
    expect(rejected['fusca.glb']).toMatch(/não é um carro nem um estilo/);
    expect(rejected['tatu.glb']).toMatch(/seat/);
    expect(CARS.some((c) => c.id === 'tatu')).toBe(true);
  }, 30_000);
});
