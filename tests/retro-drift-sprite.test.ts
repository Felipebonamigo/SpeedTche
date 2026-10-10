// Modo Retrô, derrapagem (M1): a pose de derrapagem do sprite do carro. O "mínimo" do cartão (docs/ondas/M/M1.md, §4.8):
// o carro derrapando sai inclinado para o lado, com fumaça nas rodas de trás e faíscas na cor do nível de carga (azul,
// laranja ou roxa). Roda em Node, com um canvas 2D falso que guarda o que foi pintado.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DRIFT_SPARK_COLORS, SpriteAtlas } from '../src/render-pseudo3d/sprites';

interface Paint { fills: string[]; rects: string[] }

function fakeCanvasDocument(): Paint {
  const paint: Paint = { fills: [], rects: [] };
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'fillRect') return (...a: number[]) => { paint.rects.push(`${String(target.fillStyle)}@${a.map((n) => Math.round(n)).join(',')}`); };
      // A fumaça são discos (arc + fill): conta como desenho também.
      if (key === 'arc') return (...a: number[]) => { paint.rects.push(`arc:${String(target.fillStyle)}@${a.slice(0, 3).map((n) => Math.round(n)).join(',')}`); };
      if (key === 'measureText') return () => ({ width: 10 });
      return () => undefined;
    },
    set(target, key, value) {
      if (key === 'fillStyle' && typeof value === 'string') paint.fills.push(value);
      target[key] = value;
      return true;
    },
  });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
  return paint;
}

describe('Retrô: pose de derrapagem do carro', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('derrapando o sprite é outro, para cada lado e cada nível; sem derrapar (padrão) é o mesmo bitmap de antes', () => {
    fakeCanvasDocument();
    const atlas = new SpriteAtlas();
    const plain = atlas.car('falcao', 0, false, false);
    expect(atlas.car('falcao', 0, false, false, null, 0, 0)).toBe(plain);
    const right = atlas.car('falcao', 1, false, false, null, 1, 0);
    const left = atlas.car('falcao', -1, false, false, null, -1, 0);
    const blue = atlas.car('falcao', 1, false, false, null, 1, 1);
    const purple = atlas.car('falcao', 1, false, false, null, 1, 3);
    const all = new Set([plain, right, left, blue, purple]);
    expect(all.size).toBe(5);
    // Em cache por direção e nível: pedir de novo não redesenha.
    expect(atlas.car('falcao', 1, false, false, null, 1, 3)).toBe(purple);
  });

  it('o desenho derrapando tem fumaça e inclinação que o normal não tem', () => {
    const paint = fakeCanvasDocument();
    const atlas = new SpriteAtlas();
    atlas.car('falcao', 1, false, false);
    const normal = paint.rects.splice(0);
    atlas.car('falcao', 1, false, false, null, 1, 0);
    const drifting = paint.rects.splice(0);
    expect(drifting.length).toBeGreaterThan(normal.length); // a fumaça das rodas de trás
    expect(drifting).not.toEqual(normal); // e a carroceria deslocada
  });

  it('as faíscas saem na cor do nível: azul, laranja e roxa; sem nível (ou sem derrapar) não há faísca', () => {
    expect(DRIFT_SPARK_COLORS).toHaveLength(3);
    expect(new Set(DRIFT_SPARK_COLORS).size).toBe(3);
    const paint = fakeCanvasDocument();
    const atlas = new SpriteAtlas();
    const colorsOf = (drift: number, level: number) => {
      paint.fills.length = 0;
      atlas.car('trovao', drift, false, false, null, drift, level);
      return DRIFT_SPARK_COLORS.filter((c) => paint.fills.includes(c));
    };
    expect(colorsOf(1, 1)).toEqual([DRIFT_SPARK_COLORS[0]]);
    expect(colorsOf(1, 2)).toEqual([DRIFT_SPARK_COLORS[1]]);
    expect(colorsOf(-1, 3)).toEqual([DRIFT_SPARK_COLORS[2]]);
    expect(colorsOf(1, 0)).toEqual([]);
    expect(colorsOf(0, 3)).toEqual([]); // nível sem derrapagem: nada
  });
});
