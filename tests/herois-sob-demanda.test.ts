// V16 (heróis sob demanda): `loadCarAssets()` não lê mais os 7 cascos herói (~1 MB cada) na abertura; `ensureHeroes()` os carrega quando a opção os liga
// (sessão e palco chamam), uma vez só, e o `Cars` já criado ganha o lote herói no quadro seguinte, sem programa de shader novo.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRace } from '../src/core/sim/race';
import { getTrack } from '../src/core/track';
import type { RenderFrame } from '../src/game/contracts';
import { Cars } from '../src/render/cars';
import { ensureHeroes, lastCarAssetReport, loadCarAssets } from '../src/render/cars/assets';
import { HERO_STYLES } from '../src/render/cars/lod';
import { buildModel, setHeroOverride, setModelOverride } from '../src/render/cars/models';
import { buildRoadFrame } from '../src/render/roadframe';
import { installNodeFileReader } from '../scripts/lib/node-filereader';
import { installNodeImage } from '../scripts/lib/node-image';

const DIR = join(__dirname, '..', 'src', 'assets', 'cars', 'hero');
const dataUrl = (b: Buffer) => `data:model/gltf-binary;base64,${b.toString('base64')}`;
/** Os heróis de verdade (caminho → URL), só os estilos pedidos, ou todos; `calls` conta quantas vezes cada arquivo foi pedido. */
function heroFiles(only?: readonly string[], calls: string[] = []): Record<string, () => Promise<string>> {
  return Object.fromEntries(readdirSync(DIR).filter((f) => f.endsWith('.glb') && (!only || only.includes(f.replace(/\.glb$/, '')))).map((f) => [`../../assets/cars/hero/${f}`, async () => { calls.push(f); return dataUrl(readFileSync(join(DIR, f))); }]));
}

/** Os .glb dos carros com herói próprio (V17): o herói de um carro só vale sobre o arquivo dele, que o jogo já carregou quando `ensureHeroes` roda. */
const CARS_DIR = join(DIR, '..');
const CAR_HEROES = HERO_STYLES.filter((k) => readdirSync(CARS_DIR).includes(`${k}.glb`));
const carFiles = (): Record<string, () => Promise<string>> => Object.fromEntries(CAR_HEROES.map((k) => [`../../assets/cars/${k}.glb`, async () => dataUrl(readFileSync(join(CARS_DIR, `${k}.glb`)))]));

beforeAll(() => { installNodeFileReader(); installNodeImage(); });
afterEach(() => { vi.unstubAllGlobals(); for (const k of HERO_STYLES) { setHeroOverride(k, null); if (CAR_HEROES.includes(k)) setModelOverride(k, null); } });

describe('loadCarAssets não carrega mais os heróis', () => {
  it('a chamada de abertura (sem argumentos) não registra nenhum herói e o relatório vem sem heróis', async () => {
    // O `fetch` devolve os cascos de verdade pelo nome do arquivo: se a abertura os pedisse, eles entrariam (sem isto o teste passaria por falha de rede).
    const fetched: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(String(url));
      const f = readdirSync(DIR).find((x) => String(url).includes(`/hero/${x}`));
      const car = readdirSync(CARS_DIR).find((x) => x.endsWith('.glb') && String(url).split('?')[0].endsWith(`/cars/${x}`));
      if (!f && !car) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
      const b = readFileSync(f ? join(DIR, f) : join(CARS_DIR, car as string));
      return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
    });
    const report = await loadCarAssets();
    expect(fetched.filter((u) => u.includes('/hero/')), 'nenhum herói pedido na abertura').toEqual([]);
    expect(report.heroes).toEqual([]);
    for (const s of HERO_STYLES) expect(buildModel(s).hero, `${s} sem herói até ser pedido`).toBeUndefined();
  }, 120_000);
});

describe('ensureHeroes', () => {
  it('carrega e registra os heróis; chamadas seguintes e concorrentes dividem a MESMA promessa e cada arquivo é lido uma vez só', async () => {
    await loadCarAssets(carFiles()); // os carros primeiro, como na abertura do jogo
    const calls: string[] = [];
    const files = heroFiles(undefined, calls);
    const a = ensureHeroes(files);
    const b = ensureHeroes(files);
    expect(b).toBe(a);
    const report = await a;
    expect(await ensureHeroes(files)).toBe(report);
    expect(report.rejected).toEqual([]);
    expect([...report.heroes].sort()).toEqual([...HERO_STYLES].sort());
    expect(calls.length).toBe(HERO_STYLES.length);
    for (const s of HERO_STYLES) expect(buildModel(s).hero, s).toBeDefined();
  }, 120_000);

  it('um arquivo ruim não derruba os outros e fica no relatório; o último relatório do jogo soma os heróis aos carros já carregados', async () => {
    await loadCarAssets({});
    const files = heroFiles(['gt', 'hyper']);
    files['../../assets/cars/hero/wedge.glb'] = async () => 'data:model/gltf-binary;base64,AAAA';
    files['../../assets/cars/hero/fusca.glb'] = async () => 'data:model/gltf-binary;base64,AAAA';
    const report = await ensureHeroes(files);
    expect([...report.heroes].sort()).toEqual(['gt', 'hyper']);
    expect(report.rejected.map((r) => r.file).sort()).toEqual(['hero/fusca.glb', 'hero/wedge.glb']);
    expect(buildModel('wedge').hero).toBeUndefined();
    expect(buildModel('gt').hero).toBeDefined();
    const last = lastCarAssetReport();
    expect([...last.heroes].sort()).toEqual(['gt', 'hyper']);
    expect(last.rejected.map((r) => r.file).sort()).toEqual(['hero/fusca.glb', 'hero/wedge.glb']);
  }, 120_000);
});

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

interface Lot { model: { body: string }; count: number; hero: { mesh: THREE.InstancedMesh; count: number } | null }

describe('o Cars já criado recebe o herói que chega depois', () => {
  it('sem herói o carro segue no casco de sempre; quando o herói chega, o humano de perto passa a ser herói (mesmo material/programa dos outros lotes)', async () => {
    fakeCanvasDocument();
    const track = getTrack('copacabana');
    const state = createRace({
      trackId: 'copacabana', laps: 2, humans: [{ seat: 0, name: 'P1', carId: 'pororoca', teamId: 0, color: '#fff' }], totalCars: 3, difficulty: 'profissional',
      manualGear: false, assists: { sharedNitro: false, tow: false, teamDraft: false, catchup: false }, seed: 42,
    }, track);
    const own = state.cars.findIndex((c) => c.seat === 0);
    state.cars.forEach((c) => { if (c.seat < 0) { c.carId = 'camelo'; c.z = state.cars[own].z - 100000; } });
    const cars = new Cars(new THREE.Scene());
    const frame: RenderFrame = {
      state, track, viewports: [], time: 0, paused: true, coop: false, showHud: false,
      options: { quality: 'high', showMinimap: false, screenShake: false, reduceEffects: false, palette: 'default', heroCars: true },
    };
    const seats = [{ seat: 0, name: 'P1', color: '#fff', carIndex: own }];
    const draw = () => { cars.update(frame); cars.pose(buildRoadFrame(track, state.cars[own].z, 8, 60), state, track, own, seats, 0); };
    const hyper = () => (cars as unknown as { styles: Lot[] }).styles.find((l) => l.model.body === 'hyper')!;

    draw();
    expect(hyper().hero, 'ainda sem lote herói').toBeNull();
    expect(hyper().count, 'o humano desenha no casco de sempre').toBe(1);

    await ensureHeroes(heroFiles(['hyper']));
    draw();
    const lot = hyper();
    expect(lot.hero, 'o lote herói nasceu').not.toBeNull();
    expect(lot.hero!.count).toBe(1);
    expect(lot.count).toBe(0);
    const heroMat = lot.hero!.mesh.material as THREE.MeshPhysicalMaterial;
    const shellMat = (cars as unknown as { styles: Array<{ mesh: THREE.InstancedMesh; model: { body: string } }> }).styles.find((l) => l.model.body === 'hyper')!.mesh.material as THREE.MeshPhysicalMaterial;
    expect(heroMat.customProgramCacheKey(), 'mesma chave de programa: nada compila no meio da corrida').toBe(shellMat.customProgramCacheKey());
    expect(heroMat.clearcoat, 'mesma qualidade aplicada ao material novo').toBe(shellMat.clearcoat);
    cars.dispose();
  }, 120_000);
});
