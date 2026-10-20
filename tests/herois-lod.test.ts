// V15 (heróis dos outros estilos): a seleção do nível de detalhe POR ESTILO, no `Cars` de verdade (Node, sem GL): os cascos herói reais (`src/assets/cars/hero/*.glb`) carregados pelo
// `loadCarAssets`, quatro humanos de estilos diferentes de perto, a IA do mesmo estilo e o carro de estilo sem herói. A regra é a de V9 (`carDetail`: humano, a menos de 24 m, 12 m
// na tela dividida) e não muda; o que muda é que cada estilo tem o SEU lote herói — um por modelo, nunca por carro.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRace } from '../src/core/sim/race';
import { getTrack } from '../src/core/track';
import type { RaceState } from '../src/core/types';
import type { RenderFrame } from '../src/game/contracts';
import { Cars } from '../src/render/cars';
import { loadCarAssets } from '../src/render/cars/assets';
import { HERO_MAX_TRIANGLES, HERO_STYLES } from '../src/render/cars/lod';
import type { CarModel } from '../src/render/cars/model';
import { setHeroOverride } from '../src/render/cars/models';
import { buildRoadFrame } from '../src/render/roadframe';
import { installNodeFileReader } from '../scripts/lib/node-filereader';
import { installNodeImage } from '../scripts/lib/node-image';

const DIR = join(__dirname, '..', 'src', 'assets', 'cars', 'hero');
const dataUrl = (b: Buffer) => `data:model/gltf-binary;base64,${b.toString('base64')}`;
/** Os heróis de verdade, como o jogo os carrega (caminho → URL); só os do estilo pedido, ou todos. */
const heroFiles = (only?: readonly string[]): Record<string, () => Promise<string>> => Object.fromEntries(
  readdirSync(DIR).filter((f) => f.endsWith('.glb') && (!only || only.includes(f.replace(/\.glb$/, '')))).map((f) => [`../../assets/cars/hero/${f}`, async () => dataUrl(readFileSync(join(DIR, f)))]),
);

beforeAll(() => { installNodeFileReader(); installNodeImage(); });
afterEach(() => { vi.unstubAllGlobals(); for (const k of ['gt', 'hyper', 'wedge', 'prototype', 'roadster', 'muscle', 'rally']) setHeroOverride(k, null); });

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

interface Lot { model: CarModel; mesh: THREE.InstancedMesh; count: number; hero: { mesh: THREE.InstancedMesh; count: number } | null }
const lots = (cars: Cars) => (cars as unknown as { styles: Lot[] }).styles;

/**
 * Corrida com quatro humanos (o primeiro é o do viewport) e IA; `at` dá a distância à frente (m) de cada carro por id de assento ou, para a IA, por ordem.
 * Humanos: o carro de cada um; IA: `ai` (id do carro e distância).
 */
function scene(humans: Array<{ carId: string; ahead: number }>, ai: Array<{ carId: string; ahead: number }>, heroCars = true, viewports = 0): { cars: Cars; draw: () => void; state: RaceState } {
  fakeCanvasDocument();
  const track = getTrack('copacabana');
  const state = createRace({
    trackId: 'copacabana', laps: 2, humans: humans.map((h, seat) => ({ seat, name: `P${seat + 1}`, carId: h.carId, teamId: seat, color: '#fff' })), totalCars: humans.length + ai.length + 2, difficulty: 'profissional',
    manualGear: false, assists: { sharedNitro: false, tow: false, teamDraft: false, catchup: false }, seed: 42,
  }, track);
  const own = state.cars.findIndex((c) => c.seat === 0);
  const place = (c: RaceState['cars'][number], ahead: number, x: number): void => { c.z = state.cars[own].z + ahead * 50; c.x = x; };
  state.cars.forEach((c) => { if (c.seat < 0) { c.carId = 'camelo'; place(c, -2000, 0); } });
  state.cars.filter((c) => c.seat > 0).forEach((c) => place(c, humans[c.seat].ahead, 0));
  state.cars.filter((c) => c.seat < 0).slice(0, ai.length).forEach((c, k) => { c.carId = ai[k].carId; place(c, ai[k].ahead, 0); });
  const cars = new Cars(new THREE.Scene());
  const frame: RenderFrame = {
    state, track, viewports: [], time: 0, paused: true, coop: false, showHud: false,
    options: { quality: 'high', showMinimap: false, screenShake: false, reduceEffects: false, palette: 'default', heroCars },
  };
  const seats = Array.from({ length: viewports }, (_, k) => ({ seat: k, name: `P${k + 1}`, color: '#fff', carIndex: state.cars.findIndex((c) => c.seat === k) }));
  const draw = () => { cars.update(frame); cars.pose(buildRoadFrame(track, state.cars[own].z, 8, 60), state, track, own, seats, 0); };
  return { cars, draw, state };
}

const STYLE_OF = { pororoca: 'hyper', iara: 'wedge', beijaflor: 'prototype', curupira: 'roadster', falcao: 'gt' } as const;

describe('quais estilos têm herói (HERO_STYLES) e o carregamento por estilo', () => {
  it('a lista do jogo é a das pastas: gt, hyper, wedge, prototype e roadster, cada um com o seu arquivo', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.glb')).map((f) => f.replace(/\.glb$/, '')).sort();
    expect([...HERO_STYLES].sort()).toEqual(files);
    for (const s of ['gt', 'hyper', 'wedge', 'prototype', 'roadster']) expect(HERO_STYLES, s).toContain(s);
  });

  it('o jogo aceita todos os arquivos herói (nenhum recusado) e cada estilo ganha o SEU casco herói, de 10 a 20 mil △', async () => {
    const report = await loadCarAssets({}, heroFiles());
    expect(report.rejected).toEqual([]);
    expect([...report.heroes].sort()).toEqual([...HERO_STYLES].sort());
    const { buildModel } = await import('../src/render/cars/models');
    for (const s of HERO_STYLES) {
      const hero = buildModel(s).hero;
      expect(hero, `herói de ${s}`).toBeDefined();
      expect(hero!.triangles, s).toBeLessThanOrEqual(HERO_MAX_TRIANGLES);
      expect(hero!.triangles, s).toBeGreaterThanOrEqual(10000);
    }
    const shells = new Set(HERO_STYLES.map((s) => buildModel(s).hero!.shell));
    expect(shells.size, 'um casco por estilo, nenhum dividido').toBe(HERO_STYLES.length);
    for (const s of ['hatch', 'sedan', 'muscle', 'rally', 'electric', 'classic', 'pickup', 'micro']) if (!HERO_STYLES.includes(s as never)) expect(buildModel(s).hero, `${s} segue sem herói`).toBeUndefined();
  }, 120_000);
});

describe('a seleção de LOD por estilo no Cars', () => {
  it('quatro humanos de estilos diferentes de perto: cada estilo usa o SEU lote herói, um lote por modelo (nunca por carro)', async () => {
    await loadCarAssets({}, heroFiles());
    const { cars, draw } = scene([{ carId: 'pororoca', ahead: 0 }, { carId: 'iara', ahead: 6 }, { carId: 'beijaflor', ahead: 12 }, { carId: 'curupira', ahead: 18 }], []);
    draw();
    for (const [id, style] of [['pororoca', 'hyper'], ['iara', 'wedge'], ['beijaflor', 'prototype'], ['curupira', 'roadster']] as const) {
      const lot = lots(cars).find((l) => l.model.body === style)!;
      expect(lot.hero, `${style} tem lote herói (${id})`).not.toBeNull();
      expect(lot.hero!.count, `${style}: o humano de perto é herói`).toBe(1);
      expect(lot.count, `${style}: o lote de sempre esvazia`).toBe(0);
    }
    cars.dispose();
  }, 120_000);

  it('dois humanos do mesmo estilo dividem o lote herói (1 lote, 2 instâncias); a IA do mesmo estilo, por perto que esteja, fica no casco de sempre', async () => {
    await loadCarAssets({}, heroFiles());
    const { cars, draw } = scene([{ carId: 'pororoca', ahead: 0 }, { carId: 'pororoca', ahead: 7 }], [{ carId: 'pororoca', ahead: 3 }]);
    draw();
    const lot = lots(cars).find((l) => l.model.body === 'hyper')!;
    expect(lot.hero!.count).toBe(2);
    expect(lot.count, 'a IA fica no lod0').toBe(1);
    cars.dispose();
  }, 120_000);

  it('humano fora do raio (24 m; 12 m na tela dividida) não é herói; com o interruptor desligado, ninguém é', async () => {
    await loadCarAssets({}, heroFiles());
    const far = scene([{ carId: 'pororoca', ahead: 0 }, { carId: 'iara', ahead: 28 }], []);
    far.draw();
    expect(lots(far.cars).find((l) => l.model.body === 'wedge')!.hero!.count).toBe(0);
    expect(lots(far.cars).find((l) => l.model.body === 'hyper')!.hero!.count, 'o do viewport sempre').toBe(1);
    far.cars.dispose();
    const split = scene([{ carId: 'pororoca', ahead: 0 }, { carId: 'beijaflor', ahead: 14 }], [], true, 2);
    split.draw();
    expect(lots(split.cars).find((l) => l.model.body === 'prototype')!.hero!.count, 'a 14 m em tela dividida: fora do raio de 12 m').toBe(0);
    split.cars.dispose();
    const off = scene([{ carId: 'curupira', ahead: 0 }, { carId: 'iara', ahead: 5 }], [], false);
    off.draw();
    for (const l of lots(off.cars)) expect(l.hero?.count ?? 0, l.model.body).toBe(0);
    off.cars.dispose();
  }, 120_000);

  it('carro de estilo sem herói (muscle, rally) não ganha lote nem instância herói; os estilos com herói seguem independentes', async () => {
    await loadCarAssets({}, heroFiles());
    const { cars, draw } = scene([{ carId: 'trovao', ahead: 0 }, { carId: 'carcara', ahead: 5 }, { carId: 'iara', ahead: 8 }], []);
    draw();
    for (const style of ['muscle', 'rally']) {
      const lot = lots(cars).find((l) => l.model.body === style)!;
      expect(lot.hero, style).toBeNull();
      expect(lot.count, `${style} no casco de sempre`).toBe(1);
    }
    expect(lots(cars).find((l) => l.model.body === 'wedge')!.hero!.count).toBe(1);
    cars.dispose();
  }, 120_000);

  it('o número de lotes herói é o de estilos distintos de herói em cena, não o de carros: 4 humanos em 4 estilos = 4 lotes herói', async () => {
    await loadCarAssets({}, heroFiles());
    const { cars, draw } = scene([{ carId: 'falcao', ahead: 0 }, { carId: 'iara', ahead: 4 }, { carId: 'beijaflor', ahead: 8 }, { carId: 'curupira', ahead: 12 }], []);
    draw();
    const withHero = lots(cars).filter((l) => (l.hero?.count ?? 0) > 0);
    expect(withHero.map((l) => l.model.body).sort()).toEqual(['gt', 'prototype', 'roadster', 'wedge']);
    expect(STYLE_OF.pororoca).toBe('hyper');
    cars.dispose();
  }, 120_000);
});
