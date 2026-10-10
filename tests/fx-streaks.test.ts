// M5: o lote de traços esticados (src/render/fx/streaks.ts) e as faíscas que o enchem (src/render/fx/sparks.ts). Puro/Node: three não precisa de GL.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildRoadFrame, type RoadFrame } from '../src/render/roadframe';
import {
  emitBoostSparks, emitHitSparks, emitNitroTrail, emitWheelSparks, SparkPool, WHEEL_LEVEL_COLORS, WHEEL_SPARK_MIN_SPEED, type SparkCar, type SparkSpec,
} from '../src/render/fx/sparks';
import { Streaks } from '../src/render/fx/streaks';
import { syntheticTrack } from './helpers';

let seed = 1;
const rnd = (): number => { seed = (seed * 16807 + 11) % 2147483647; return (seed % 100003) / 100003; };
const car = (over: Partial<SparkCar> = {}): SparkCar => ({ z: 5000, x: 0.2, speed: 5000, driftDir: 1, driftTicks: 30, ...over });
const collect = (f: (out: (s: SparkSpec) => void) => void): SparkSpec[] => { const l: SparkSpec[] = []; f((s) => l.push({ ...s })); return l; };

describe('lote de traços (Streaks)', () => {
  it('cada traço são 4 vértices e 6 índices; o desenho cobre só o que foi escrito e some quando vazio', () => {
    const st = new Streaks(8);
    expect(st.mesh.visible).toBe(false);
    st.begin();
    expect(st.add(1, 2, 3, 4, 5, 6, 0.05, 1, 0.5, 0.25, 0.8)).toBe(true);
    expect(st.add(0, 0, 0, 0, 0, -2, 0.02, 0.1, 0.2, 0.3, 0.4)).toBe(true);
    st.end();
    expect(st.count).toBe(2);
    expect(st.mesh.geometry.drawRange.count).toBe(12);
    expect(st.mesh.visible).toBe(true);
    const g = st.mesh.geometry;
    const pos = g.getAttribute('position'); const tail = g.getAttribute('aTail'); const col = g.getAttribute('aColor'); const w = g.getAttribute('aWidth'); const corner = g.getAttribute('aCorner');
    for (let v = 0; v < 4; v++) {
      expect([pos.getX(v), pos.getY(v), pos.getZ(v)]).toEqual([1, 2, 3]);
      expect([tail.getX(v), tail.getY(v), tail.getZ(v)]).toEqual([4, 5, 6]);
      expect([col.getX(v), col.getY(v), col.getZ(v), col.getW(v)]).toEqual([1, 0.5, 0.25, 0.800000011920929]);
      expect(w.getX(v)).toBeCloseTo(0.05, 6);
    }
    expect([0, 1, 2, 3].map((v) => [corner.getX(v), corner.getY(v)])).toEqual([[0, -1], [0, 1], [1, -1], [1, 1]]);
    expect(pos.getZ(4)).toBe(0); // o segundo traço começa no vértice 4
    expect(tail.getZ(4)).toBe(-2);
    const idx = g.getIndex()!;
    expect(idx.count).toBe(8 * 6);
    expect(Math.max(...Array.from(idx.array as Uint16Array))).toBe(8 * 4 - 1);
    st.begin(); st.end();
    expect(st.count).toBe(0); expect(st.mesh.visible).toBe(false); expect(st.mesh.geometry.drawRange.count).toBe(0);
  });

  it('para no teto (add devolve falso) e o teto é de verdade: 8 traços cabem, o 9º não', () => {
    const st = new Streaks(8);
    st.begin();
    for (let i = 0; i < 8; i++) expect(st.add(i, 0, 0, i, 0, 1, 0.05, 1, 1, 1, 1), `traço ${i}`).toBe(true);
    expect(st.add(9, 0, 0, 9, 0, 1, 0.05, 1, 1, 1, 1)).toBe(false);
    st.end();
    expect(st.count).toBe(8);
  });

  it('é uma malha só, aditiva, sem escrever profundidade e nunca cortada pelo frustum', () => {
    const st = new Streaks(4);
    expect(st.mesh).toBeInstanceOf(THREE.Mesh);
    const m = st.mesh.material as unknown as THREE.ShaderMaterial;
    expect(m.blending).toBe(THREE.AdditiveBlending); expect(m.transparent).toBe(true); expect(m.depthWrite).toBe(false); expect(m.depthTest).toBe(true);
    expect(st.mesh.frustumCulled).toBe(false);
    expect(m.vertexShader).toContain('aTail'); expect(m.fragmentShader).toContain('tonemapping_fragment');
  });
});

describe('faíscas esticadas (SparkPool, M5)', () => {
  const track = syntheticTrack([{ op: 'straight', length: 800 }]);
  const rf: RoadFrame = buildRoadFrame(track, 5000, 30, 200);

  function pose(pool: SparkPool, streaks: Streaks): void { streaks.begin(); pool.pose(rf, track, streaks); streaks.end(); }
  const spec = (over: Partial<SparkSpec> = {}): SparkSpec => ({
    z: 5000, x: 0.2, h: 0.3, vz: 1000, vx: 0, vh: 2, svz: -3000, svx: 0, svh: 1, life: 0.4, width: 0.05, gravity: 9, r: 2, g: 1, b: 0.5, ...over,
  });

  it('cada faísca viva vira um traço com a cabeça na faísca e a cauda para o lado da origem; some quando a vida acaba', () => {
    const pool = new SparkPool(16); const st = new Streaks(16);
    pool.emit(spec());
    pose(pool, st);
    expect(st.count).toBe(1);
    const pos = st.mesh.geometry.getAttribute('position'); const tail = st.mesh.geometry.getAttribute('aTail');
    // velocidade relativa para trás: a cauda fica mais perto do carro (mais à frente na pista = z local menor), a cabeça é a faísca
    expect(tail.getZ(0)).toBeLessThan(pos.getZ(0));
    const len = Math.hypot(tail.getX(0) - pos.getX(0), tail.getY(0) - pos.getY(0), tail.getZ(0) - pos.getZ(0));
    expect(len).toBeGreaterThanOrEqual(0.18 - 1e-6); expect(len).toBeLessThanOrEqual(2.6 + 1e-6);
    for (let i = 0; i < 60; i++) pool.step(1 / 60);
    pose(pool, st);
    expect(st.count).toBe(0);
  });

  it('o traço tem comprimento mínimo mesmo parado e máximo mesmo muito rápido', () => {
    const pool = new SparkPool(16); const st = new Streaks(16);
    pool.emit(spec({ svz: 0, svx: 0, svh: 0 }));
    pool.emit(spec({ x: -0.2, svz: -90_000, svh: 400 }));
    pose(pool, st);
    expect(st.count).toBe(2);
    const pos = st.mesh.geometry.getAttribute('position'); const tail = st.mesh.geometry.getAttribute('aTail');
    for (let q = 0; q < 2; q++) {
      const v = q * 4;
      const len = Math.hypot(tail.getX(v) - pos.getX(v), tail.getY(v) - pos.getY(v), tail.getZ(v) - pos.getZ(v));
      expect(len, `traço ${q}`).toBeGreaterThanOrEqual(0.18 - 1e-6); expect(len, `traço ${q}`).toBeLessThanOrEqual(2.6 + 1e-6);
      expect(Number.isFinite(len)).toBe(true);
    }
  });

  it('a faísca que sai da janela da pista não vira traço; o anel do pool sobrescreve a mais velha sem estourar', () => {
    const pool = new SparkPool(4); const st = new Streaks(16);
    pool.emit(spec({ z: 5000 + 200 * 400 })); // 400 segmentos à frente: fora da janela de 200
    pose(pool, st);
    expect(st.count).toBe(0);
    for (let i = 0; i < 10; i++) pool.emit(spec({ x: -0.5 + i * 0.1 }));
    pose(pool, st);
    expect(st.count).toBe(4);
  });

  it('cor e brilho vêm da faísca e a cauda apaga com a vida', () => {
    const pool = new SparkPool(4); const st = new Streaks(4);
    pool.emit(spec({ r: 0.3, g: 0.6, b: 2.2, life: 0.4 }));
    pose(pool, st);
    const col = st.mesh.geometry.getAttribute('aColor');
    const novo = col.getW(0);
    expect([col.getX(0), col.getY(0), col.getZ(0)].map((v) => +v.toFixed(3))).toEqual([0.3, 0.6, 2.2]);
    expect(novo).toBeGreaterThan(0.5);
    for (let i = 0; i < 20; i++) pool.step(1 / 60);
    pose(pool, st);
    expect(st.mesh.geometry.getAttribute('aColor').getW(0)).toBeLessThan(novo);
  });
});

describe('faíscas das rodas na derrapagem (3 cores)', () => {
  it('cada nível tem a sua cor: azul, laranja e roxa; o nível 0 é um clarão branco-amarelado', () => {
    const [c0, c1, c2, c3] = WHEEL_LEVEL_COLORS;
    expect(c1[2]).toBeGreaterThan(c1[0] * 3); expect(c1[2]).toBeGreaterThan(c1[1] * 2); // azul
    expect(c2[0]).toBeGreaterThan(c2[2] * 4); expect(c2[0]).toBeGreaterThan(c2[1]); expect(c2[1]).toBeGreaterThan(c2[2] * 2); // laranja
    expect(c3[0]).toBeGreaterThan(c3[1] * 3); expect(c3[2]).toBeGreaterThan(c3[1] * 3); // roxa
    expect(Math.min(...c0)).toBeGreaterThan(Math.max(...c0) * 0.5); // quase branco
    for (const c of WHEEL_LEVEL_COLORS) expect(Math.max(...c)).toBeGreaterThan(1.5); // HDR: o bloom pega
  });

  it('as faíscas saem das duas rodas traseiras, atrás e dos lados do eixo do carro, na cor do nível', () => {
    seed = 7;
    for (const level of [1, 2, 3]) {
      const list = collect((out) => { for (let i = 0; i < 120; i++) emitWheelSparks(car(), level, 1 / 60, 1, rnd, out); });
      expect(list.length, `nível ${level}`).toBeGreaterThan(40);
      const xs = new Set(list.map((s) => Math.sign(s.x - 0.2)));
      expect(xs.has(-1) && xs.has(1)).toBe(true); // as duas rodas
      for (const s of list) {
        expect(s.z).toBeLessThan(5000 - 40); expect(s.z).toBeGreaterThan(5000 - 140); // 0,8 a 2,8 m atrás do centro (50 unidades por metro)
        expect(Math.abs(s.x - 0.2)).toBeGreaterThan(0.06); expect(Math.abs(s.x - 0.2)).toBeLessThan(0.25);
        expect(s.h).toBeGreaterThan(0); expect(s.h).toBeLessThan(0.6);
        const [r, g, b] = WHEEL_LEVEL_COLORS[level];
        expect(Math.sign(s.r - s.g)).toBe(Math.sign(r - g)); expect(Math.sign(s.b - s.g)).toBe(Math.sign(b - g));
        expect(s.svz).toBeLessThan(0); // relativo ao carro, para trás
        expect(s.life).toBeGreaterThan(0.1); expect(s.life).toBeLessThan(0.8);
      }
    }
  });

  it('mais carga, mais faíscas; o fator do degrau escala; sem derrapar, devagar ou com fator 0 não sai nenhuma', () => {
    const media = (level: number, f: number, c = car()) => {
      seed = 11; let n = 0;
      for (let i = 0; i < 600; i++) emitWheelSparks(c, level, 1 / 60, f, rnd, () => { n++; });
      return n / 600;
    };
    expect(media(1, 1)).toBeGreaterThan(0.5);
    expect(media(2, 1)).toBeGreaterThan(media(1, 1) * 1.2);
    expect(media(3, 1)).toBeGreaterThan(media(2, 1) * 1.1);
    expect(media(3, 0.5)).toBeCloseTo(media(3, 1) / 2, 0);
    expect(media(3, 0)).toBe(0);
    expect(media(3, 1, car({ driftTicks: 0 }))).toBe(0);
    expect(media(3, 1, car({ driftDir: 0 }))).toBe(0);
    expect(media(3, 1, car({ speed: WHEEL_SPARK_MIN_SPEED - 1 }))).toBe(0);
    // o quadro de 30 fps solta o dobro por quadro (a taxa é por segundo)
    seed = 3; let a = 0; let b = 0;
    for (let i = 0; i < 600; i++) { emitWheelSparks(car(), 3, 1 / 60, 1, rnd, () => { a++; }); emitWheelSparks(car(), 3, 1 / 30, 1, rnd, () => { b++; }); }
    expect(b / a).toBeGreaterThan(1.7); expect(b / a).toBeLessThan(2.3);
  });

  it('o impulso ao soltar solta uma rajada na cor do nível que o carro tinha (1, 2 ou 3)', () => {
    seed = 5;
    for (const level of [1, 2, 3]) {
      const list = collect((out) => emitBoostSparks(car(), level, 1, rnd, out));
      expect(list.length).toBeGreaterThanOrEqual(10);
      const [r, g, b] = WHEEL_LEVEL_COLORS[level];
      for (const s of list) { expect(Math.sign(s.r - s.g)).toBe(Math.sign(r - g)); expect(Math.sign(s.b - s.g)).toBe(Math.sign(b - g)); }
    }
    expect(collect((out) => emitBoostSparks(car(), 3, 0, rnd, out))).toEqual([]);
  });
});

describe('faíscas da batida e do escape (esticadas)', () => {
  it('a batida solta uma rajada em todas as direções, mais forte com a queda de velocidade; reduzir efeitos (fator 0) não solta nada', () => {
    seed = 9;
    const fraca = collect((out) => emitHitSparks(car(), 0.03, 1, rnd, out));
    const forte = collect((out) => emitHitSparks(car(), 0.3, 1, rnd, out));
    expect(fraca.length).toBeGreaterThanOrEqual(20);
    expect(forte.length).toBeGreaterThan(fraca.length);
    expect(forte.some((s) => s.vx > 0.3) && forte.some((s) => s.vx < -0.3)).toBe(true);
    for (const s of forte) { expect(s.h).toBeGreaterThan(0.1); expect(Math.hypot(s.svz * 0.02, s.svx * 7, s.svh)).toBeGreaterThan(5); } // esticada: a velocidade relativa é grande
    expect(collect((out) => emitHitSparks(car(), 0.3, 0, rnd, out))).toEqual([]);
    expect(collect((out) => emitHitSparks(car(), 0.3, 0.5, rnd, out)).length).toBeLessThan(forte.length);
  });

  it('uma batida de pouca queda de velocidade (e o carro quase parado) ainda solta faíscas', () => {
    seed = 13;
    expect(collect((out) => emitHitSparks(car({ speed: 1000 }), 0.05, 1, rnd, out)).length).toBeGreaterThan(0);
  });

  it('o escape do nitro solta um traço azul-branco para trás, curto', () => {
    seed = 2;
    const list = collect((out) => { for (let i = 0; i < 50; i++) emitNitroTrail(car(), 1, rnd, out); });
    expect(list.length).toBeGreaterThan(20);
    for (const s of list) { expect(s.b).toBeGreaterThan(s.r); expect(s.z).toBeLessThan(5000); expect(s.life).toBeLessThan(0.4); expect(s.svz).toBeLessThan(0); }
    expect(collect((out) => emitNitroTrail(car(), 0, rnd, out))).toEqual([]);
  });
});
