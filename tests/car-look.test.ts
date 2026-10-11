// O visual do carro (N3) chegando ao 3D: o `Cars` lê `RenderFrame.looks` e põe, POR INSTÂNCIA, o acabamento (bits 3–5 de `instExtra.w`), a faixa
// (bits A e B do corpo), a roda (o lote do desenho escolhido), o aro (o bit B do LOTE DE RODA, separado da faixa B do corpo e com a cor
// do aro em `instExtra.rgb`) e a cor da chama — sem lote nem chamada de desenho novos. Roda no Node, com o canvas 2D falso das outras provas
// dos carros. A cor do GL em si (os acabamentos no shader) é de tests/car-material.test.ts e das capturas.
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { carDef } from '../src/core/data/cars';
import { createRace } from '../src/core/sim/race';
import { getTrack } from '../src/core/track';
import type { CarLook, HumanEntry, RaceState } from '../src/core/types';
import type { CarColors, RenderFrame } from '../src/game/contracts';
import { FINISH_IDS, FLAME_IDS, paintColors, RIM_COLORS, STRIPE_IDS } from '../src/game/cosmetics';
import { Cars } from '../src/render/cars';
import { FLAME_CHOSEN_WHITE, flameChosenColor, flameColorFor } from '../src/render/cars/flame';
import { defaultAccent, LIVERY_A, LIVERY_B } from '../src/render/cars/paints';
import { WHEEL_DESIGNS } from '../src/render/cars/wheels';
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

interface Batch { mesh: THREE.InstancedMesh; extra: THREE.InstancedBufferAttribute; count: number }
interface StyleBatch extends Batch { key: string; model: { body: string; liveries: number[] }; wheels: Batch & { label: string }; lod1: Batch | null }
interface Inner {
  styles: StyleBatch[]; wheelBatches: Array<Batch & { label: string }>; simpleWheels: Batch; flames: THREE.InstancedMesh; flameExtra: THREE.InstancedBufferAttribute;
}
const inner = (c: Cars) => c as unknown as Inner;
const WHITE = '#fff';

interface Scene { state: RaceState; cars: Cars; own: number; draw(frameLooks?: ReadonlyArray<CarLook | null>, paints?: ReadonlyArray<CarColors | null>): void }

/** Corrida pequena com os humanos dados (assento 0 = carro do viewport, `own`); os outros humanos ficam à frente, perto; a IA, longe e atrás. */
function scene(humans: Array<Pick<HumanEntry, 'carId'>>, mutate: (state: RaceState, own: number) => void = () => undefined): Scene {
  fakeCanvasDocument();
  const track = getTrack('copacabana');
  const state = createRace({
    trackId: 'copacabana', laps: 2, humans: humans.map((h, seat) => ({ seat, name: `P${seat + 1}`, carId: h.carId, teamId: 0, color: WHITE })), totalCars: humans.length + 2,
    difficulty: 'profissional', manualGear: false, assists: { sharedNitro: false, tow: false, teamDraft: false, catchup: false }, seed: 42,
  }, track);
  const own = state.cars.findIndex((c) => c.seat === 0);
  state.cars.forEach((c, i) => {
    if (c.seat < 0) { c.z = state.cars[own].z - 100_000; c.x = 0; } // longe, atrás: some
    else if (i !== own) { c.z = state.cars[own].z + 600 + 400 * c.seat; c.x = 0; } // à frente, perto
  });
  mutate(state, own);
  const cars = new Cars(new THREE.Scene());
  const rf = buildRoadFrame(track, state.cars[own].z, 8, 60);
  const draw = (looks?: ReadonlyArray<CarLook | null>, paints?: ReadonlyArray<CarColors | null>) => {
    const frame: RenderFrame = {
      state, track, viewports: [], time: 0, paused: true, coop: false, showHud: false, looks, paints,
      options: { quality: 'high', showMinimap: false, screenShake: false, reduceEffects: false, palette: 'default' },
    };
    cars.update(frame);
    cars.pose(rf, state, track, own, [], 0);
  };
  return { state, cars, own, draw };
}

/** Os looks por índice de carro (null para quem não tem). */
const looksFor = (s: Scene, bySeat: Record<number, CarLook>): Array<CarLook | null> => s.state.cars.map((c) => bySeat[c.seat] ?? null);

const styleOf = (c: Cars, body: string) => {
  const st = inner(c).styles.find((b) => b.model.body === body);
  if (!st) throw new Error(`sem lote ${body}`);
  return st;
};
const wheelBatch = (c: Cars, design: string) => {
  const w = inner(c).wheelBatches.find((b) => b.label === design);
  if (!w) throw new Error(`sem lote de roda ${design}`);
  return w;
};
const flagsOf = (b: Batch, i = 0) => Math.round(b.extra.getW(i));
const finishBits = (flags: number) => (flags >> 3) & 7;
const visible = (c: Cars) => [...inner(c).styles.flatMap((s) => (s.lod1 ? [s.mesh, s.lod1.mesh] : [s.mesh])), ...inner(c).wheelBatches.map((w) => w.mesh)].filter((m) => m.visible).length;
const rgbOf = (b: Batch, i = 0) => new THREE.Color(b.extra.getX(i), b.extra.getY(i), b.extra.getZ(i));
const hex = (c: THREE.Color) => `#${c.getHexString()}`;
/** A cor sRGB do catálogo como o three a guarda por dentro (linear), igual à da instância. */
const linear = (h: string) => new THREE.Color(h);

describe('acabamento por instância', () => {
  it('sem look, os bits são os de antes: só a faixa do modelo (o Falcão sai com a A)', () => {
    const s = scene([{ carId: 'falcao' }]);
    s.draw();
    const gt = styleOf(s.cars, 'gt');
    expect(gt.count).toBe(1);
    expect(flagsOf(gt)).toBe(LIVERY_A);
    expect(finishBits(flagsOf(gt))).toBe(0);
  });

  it.each(FINISH_IDS.map((id, i) => [id, i] as const))('o acabamento %s é o valor %i nos bits 3–5, e a faixa do modelo fica', (id, index) => {
    const s = scene([{ carId: 'falcao' }]);
    s.draw(looksFor(s, { 0: id === 'brilho' ? {} : { finish: id } }));
    const flags = flagsOf(styleOf(s.cars, 'gt'));
    expect(finishBits(flags)).toBe(index);
    expect(flags & 7).toBe(LIVERY_A); // freio 1, A 2, B 4: nada mudou
  });

  it('o freio e o acabamento convivem (bit 1 e bits 3–5)', () => {
    const s = scene([{ carId: 'falcao' }]);
    const looks = looksFor(s, { 0: { finish: 'cromado' } });
    s.state.cars[s.own].speed = 2000; s.draw(looks);
    s.state.cars[s.own].speed = 1000; s.draw(looks); // queda forte de velocidade: o freio acende
    const flags = flagsOf(styleOf(s.cars, 'gt'));
    expect(flags & 1).toBe(1);
    expect(finishBits(flags)).toBe(4);
  });

  it('cada carro tem o seu: dois Falcões, um perolado e um fosco, na mesma chamada de desenho', () => {
    const s = scene([{ carId: 'falcao' }, { carId: 'falcao' }]);
    s.draw(looksFor(s, { 0: { finish: 'perolado' }, 1: { finish: 'fosco' } }));
    const gt = styleOf(s.cars, 'gt');
    expect(gt.count).toBe(2);
    const fin = [0, 1].map((i) => finishBits(flagsOf(gt, i)));
    expect(fin.sort()).toEqual([2, 3]);
  });
});

describe('faixa', () => {
  it.each([['nenhuma', 0], ['a', LIVERY_A], ['b', LIVERY_B], ['ab', LIVERY_A | LIVERY_B]] as const)('faixa %s: bits A/B do corpo = %i', (stripe, bits) => {
    const s = scene([{ carId: 'falcao' }]);
    s.draw(looksFor(s, { 0: { stripe } }));
    expect(flagsOf(styleOf(s.cars, 'gt')) & (LIVERY_A | LIVERY_B)).toBe(bits);
  });

  it('as quatro do catálogo existem', () => {
    expect(STRIPE_IDS).toEqual(['nenhuma', 'a', 'b', 'ab']);
  });
});

describe('roda escolhida', () => {
  it('de fábrica: as 4 rodas do Falcão no lote do desenho do estilo (sport5), e só nele', () => {
    const s = scene([{ carId: 'falcao' }]);
    s.draw();
    expect(wheelBatch(s.cars, 'sport5').count).toBe(4);
    for (const d of WHEEL_DESIGNS) if (d !== 'sport5') expect(wheelBatch(s.cars, d).count, d).toBe(0);
  });

  it.each(WHEEL_DESIGNS.map((d) => [d] as const))('a roda %s escolhida leva as 4 rodas para o lote dela, e só ele fica com instâncias', (design) => {
    const s = scene([{ carId: 'falcao' }]);
    s.draw(looksFor(s, { 0: { wheel: design } }));
    for (const d of WHEEL_DESIGNS) expect(wheelBatch(s.cars, d).count, d).toBe(d === design ? 4 : 0);
  });

  it('dois carros do mesmo estilo com rodas diferentes: 4 + 4 em lotes diferentes', () => {
    const s = scene([{ carId: 'falcao' }, { carId: 'falcao' }]);
    s.draw(looksFor(s, { 0: { wheel: 'mag' }, 1: { wheel: 'aero' } }));
    expect([wheelBatch(s.cars, 'mag').count, wheelBatch(s.cars, 'aero').count, wheelBatch(s.cars, 'sport5').count]).toEqual([4, 4, 0]);
  });

  it('o look só de acabamento, faixa, aro e chama não muda o número de chamadas de desenho; trocar a roda só muda QUAL lote desenha', () => {
    const base = scene([{ carId: 'falcao' }]);
    base.draw();
    const n0 = visible(base.cars);
    const s = scene([{ carId: 'falcao' }]);
    s.draw(looksFor(s, { 0: { finish: 'camaleao', stripe: 'ab', rim: 'dourado', flame: 'roxa', color: '#2346d6', accent: '#ffcf26' } }));
    expect(visible(s.cars)).toBe(n0);
    const w = scene([{ carId: 'falcao' }]);
    w.draw(looksFor(w, { 0: { wheel: 'mag' } }));
    expect(visible(w.cars)).toBe(n0);
  });
});

describe('aro separado da faixa B', () => {
  // O Boitatá é o 2º GT: a faixa de fábrica dele é a B (liveries [A, B]); o aro de fábrica segue essa faixa do MODELO.
  it('de fábrica o aro acompanha a faixa B do modelo, como sempre (Boitatá liga, Falcão não)', () => {
    const s = scene([{ carId: 'boitata' }]);
    s.draw();
    expect(flagsOf(styleOf(s.cars, 'gt')) & LIVERY_B).toBe(LIVERY_B);
    expect(flagsOf(wheelBatch(s.cars, 'sport5')) & LIVERY_B).toBe(LIVERY_B);
    const f = scene([{ carId: 'falcao' }]);
    f.draw();
    expect(flagsOf(wheelBatch(f.cars, 'sport5')) & LIVERY_B).toBe(0);
  });

  it('tirar a faixa B do Boitatá NÃO tira o aro: a faixa e o aro são bits diferentes', () => {
    const s = scene([{ carId: 'boitata' }]);
    s.draw(looksFor(s, { 0: { stripe: 'nenhuma' } }));
    expect(flagsOf(styleOf(s.cars, 'gt')) & (LIVERY_A | LIVERY_B)).toBe(0);
    expect(flagsOf(wheelBatch(s.cars, 'sport5')) & LIVERY_B).toBe(LIVERY_B);
    const a = scene([{ carId: 'boitata' }]);
    a.draw(looksFor(a, { 0: { stripe: 'a' } }));
    expect(flagsOf(styleOf(a.cars, 'gt')) & LIVERY_B).toBe(0);
    expect(flagsOf(wheelBatch(a.cars, 'sport5')) & LIVERY_B).toBe(LIVERY_B);
  });

  it('pôr a faixa B no Falcão NÃO liga o aro dele', () => {
    const s = scene([{ carId: 'falcao' }]);
    s.draw(looksFor(s, { 0: { stripe: 'b' } }));
    expect(flagsOf(styleOf(s.cars, 'gt')) & LIVERY_B).toBe(LIVERY_B);
    expect(flagsOf(wheelBatch(s.cars, 'sport5')) & LIVERY_B).toBe(0);
  });

  it.each(['prata', 'grafite', 'dourado'] as const)('o aro %s liga o bit do aro e põe a cor dele em instExtra.rgb do lote de roda', (rim) => {
    const s = scene([{ carId: 'falcao' }]);
    s.draw(looksFor(s, { 0: { rim } }));
    const w = wheelBatch(s.cars, 'sport5');
    for (let i = 0; i < 4; i++) {
      expect(flagsOf(w, i) & LIVERY_B).toBe(LIVERY_B);
      expect(hex(rgbOf(w, i))).toBe(hex(linear(RIM_COLORS[rim] as string)));
    }
    // O corpo não foi tocado.
    expect(flagsOf(styleOf(s.cars, 'gt')) & LIVERY_B).toBe(0);
  });

  it('o aro "acento" usa a cor do detalhe do carro (a da pintura, se houver)', () => {
    const s = scene([{ carId: 'falcao' }]);
    s.draw(looksFor(s, { 0: { rim: 'acento', paint: 'cobalto' } }));
    const w = wheelBatch(s.cars, 'sport5');
    expect(flagsOf(w) & LIVERY_B).toBe(LIVERY_B);
    expect(hex(rgbOf(w))).toBe(hex(linear((paintColors('cobalto') as CarColors).accent)));
  });

  it('a roda simples dos carros longe e da Baixa também acompanha o aro', () => {
    const s = scene([{ carId: 'falcao' }, { carId: 'falcao' }], (state) => {
      // O 2º humano a mais de 30 m do viewport usa a roda simples.
      state.cars.forEach((c) => { if (c.seat === 1) c.z += 5000; });
    });
    s.draw(looksFor(s, { 1: { rim: 'dourado' } }));
    const simple = inner(s.cars).simpleWheels;
    expect(simple.count).toBe(4);
    expect(flagsOf(simple) & LIVERY_B).toBe(LIVERY_B);
    expect(hex(rgbOf(simple))).toBe(hex(linear(RIM_COLORS.dourado as string)));
  });
});

describe('cores do look no 3D', () => {
  it('a cor livre vence a pintura da paleta camada por camada, no corpo', () => {
    const s = scene([{ carId: 'falcao' }]);
    s.draw(looksFor(s, { 0: { paint: 'rubi', color: '#2346d6' } }));
    const gt = styleOf(s.cars, 'gt');
    const color = new THREE.Color().fromArray(gt.mesh.instanceColor?.array as ArrayLike<number> as number[], 0);
    expect(hex(color)).toBe(hex(linear('#2346d6')));
    expect(hex(rgbOf(gt))).toBe(hex(linear((paintColors('rubi') as CarColors).accent)));
  });

  it('só roda/acabamento: as cores continuam as de fábrica do carro', () => {
    const s = scene([{ carId: 'falcao' }]);
    s.draw(looksFor(s, { 0: { wheel: 'mag', finish: 'cromado' } }));
    const gt = styleOf(s.cars, 'gt');
    const color = new THREE.Color().fromArray(gt.mesh.instanceColor?.array as ArrayLike<number> as number[], 0);
    expect(hex(color)).toBe(hex(linear(carDef('falcao').color)));
    expect(hex(rgbOf(gt))).toBe(hex(linear(carDef('falcao').accent ?? defaultAccent(carDef('falcao').color))));
  });

  it('sem `looks` no quadro, `paints` continua valendo (quem ainda manda só as cores: o Retrô, o bench, a garagem da N2)', () => {
    const s = scene([{ carId: 'falcao' }]);
    const paints = s.state.cars.map((c) => (c.seat === 0 ? { color: '#123456', accent: '#abcdef' } : null));
    s.draw(undefined, paints);
    const gt = styleOf(s.cars, 'gt');
    const color = new THREE.Color().fromArray(gt.mesh.instanceColor?.array as ArrayLike<number> as number[], 0);
    expect(hex(color)).toBe(hex(linear('#123456')));
    expect(hex(rgbOf(gt))).toBe(hex(linear('#abcdef')));
  });

  it('o look novo no mesmo carro reconstrói a aparência; o mesmo look de novo não a muda', () => {
    const s = scene([{ carId: 'falcao' }]);
    s.draw(looksFor(s, { 0: { finish: 'fosco' } }));
    expect(finishBits(flagsOf(styleOf(s.cars, 'gt')))).toBe(3);
    s.draw(looksFor(s, { 0: { finish: 'fosco' } })); // outro objeto, mesmo conteúdo
    expect(finishBits(flagsOf(styleOf(s.cars, 'gt')))).toBe(3);
    s.draw(looksFor(s, { 0: { finish: 'cromado' } }));
    expect(finishBits(flagsOf(styleOf(s.cars, 'gt')))).toBe(4);
    s.draw(looksFor(s, {}));
    expect(finishBits(flagsOf(styleOf(s.cars, 'gt')))).toBe(0);
  });
});

describe('cor da chama', () => {
  const withNitro = (state: RaceState, own: number) => { state.cars[own].nitroTicks = 60; };
  const flameColor = (s: Scene) => {
    const f = inner(s.cars).flames;
    expect(f.count, 'a chama do carro com nitro').toBeGreaterThan(0);
    return new THREE.Color().fromArray(f.instanceColor?.array as ArrayLike<number> as number[], 0);
  };

  it('sem escolha: o azul tingido pelo detalhe do carro, como na M4', () => {
    const s = scene([{ carId: 'falcao' }], withNitro);
    s.draw();
    const accent = carDef('falcao').accent ?? defaultAccent(carDef('falcao').color);
    expect(hex(flameColor(s))).toBe(hex(flameColorFor(accent)));
  });

  it.each(FLAME_IDS.map((id) => [id] as const))('a chama %s escolhida vai por instância, já compensada pelo tom do shader', (flame) => {
    const s = scene([{ carId: 'falcao' }], withNitro);
    s.draw(looksFor(s, { 0: { flame } }));
    const want = flameChosenColor(flame) as THREE.Color;
    const got = flameColor(s);
    expect(got.r).toBeCloseTo(want.r, 5);
    expect(got.g).toBeCloseTo(want.g, 5);
    expect(got.b).toBeCloseTo(want.b, 5);
  });

  it('o fragmento devolve a cor do catálogo: instância × tom do shader = a cor escolhida', () => {
    const c = flameChosenColor('laranja') as THREE.Color;
    const target = new THREE.Color('#ff7a1a');
    expect(c.r * 0.55).toBeCloseTo(target.r, 5);
    expect(c.g * 0.85).toBeCloseTo(target.g, 5);
    expect(c.b * 1.45).toBeCloseTo(target.b, 5);
  });

  it('a brancura do núcleo (aFlame.z): 1 na chama de sempre, menor na escolhida — senão qualquer cor sairia branca vista de trás', () => {
    const plain = scene([{ carId: 'falcao' }], withNitro);
    plain.draw();
    expect(inner(plain.cars).flameExtra.getZ(0)).toBe(1);
    const chosen = scene([{ carId: 'falcao' }], withNitro);
    chosen.draw(looksFor(chosen, { 0: { flame: 'verde' } }));
    expect(inner(chosen.cars).flameExtra.getZ(0)).toBeCloseTo(FLAME_CHOSEN_WHITE, 6);
    expect(FLAME_CHOSEN_WHITE).toBeLessThan(0.5);
    expect(inner(chosen.cars).flameExtra.itemSize).toBe(3);
  });

  it('id que não existe: nada (cai no azul tingido)', () => {
    expect(flameChosenColor('nao-existe')).toBeNull();
    expect(flameChosenColor(undefined)).toBeNull();
    expect(flameChosenColor('__proto__')).toBeNull();
  });
});
