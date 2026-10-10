// M5: fumaça e poeira em BOLHA (src/render/fx/smoke.ts + o shader de bolha do pool de poeira em effects.ts). Os emissores são puros; a bolha em si
// (contorno escuro, brilho de lado, borda nítida) é shader e só o olho do dono julga (captura): aqui se confere de onde sai, quanto, e que é um pool de bolhas.
import { describe, expect, it } from 'vitest';
import { driftLevel } from '../src/core/sim/physics';
import { getTrack } from '../src/core/track';
import type { Quality, RenderFrame } from '../src/game/contracts';
import { Effects } from '../src/render/effects';
import { emitBrakeSmoke, emitGrassDust, emitTireSmoke, SMOKE_WHITE, type PuffCar, type PuffSpec } from '../src/render/fx/smoke';
import { human, quickRace } from './helpers';

let seed = 1;
const rnd = (): number => { seed = (seed * 16807 + 11) % 2147483647; return (seed % 100003) / 100003; };
const car = (over: Partial<PuffCar> = {}): PuffCar => ({ z: 5000, x: 0.2, speed: 5000, driftDir: 1, driftTicks: 30, driftCharge: 0, skidTicks: 0, ...over });
const collect = (f: (out: (s: PuffSpec) => void) => void): PuffSpec[] => { const l: PuffSpec[] = []; f((s) => l.push({ ...s })); return l; };

describe('fumaça do pneu na derrapagem', () => {
  it('sai das duas rodas traseiras, branco-acinzentada, em bolhas de 1 ou 2 por emissão', () => {
    seed = 3;
    const list = collect((out) => { for (let i = 0; i < 120; i++) emitTireSmoke(car(), 1 / 60, 1, rnd, out); });
    expect(list.length).toBeGreaterThan(20);
    expect(new Set(list.map((s) => Math.sign(s.x - 0.2))).size).toBe(2);
    for (const s of list) {
      expect(s.z).toBeLessThan(5000 - 30); expect(s.z).toBeGreaterThan(5000 - 130);
      expect(s.h).toBeLessThan(0.5);
      expect(Math.min(s.r, s.g, s.b)).toBeGreaterThan(0.7); expect(Math.max(s.r, s.g, s.b) - Math.min(s.r, s.g, s.b)).toBeLessThan(0.1);
      expect(s.size).toBeGreaterThan(0.2); expect(s.grow).toBeGreaterThan(0.5); // bolha que incha
      expect(s.life).toBeGreaterThan(0.4); expect(s.life).toBeLessThan(1.6);
      expect(s.vh).toBeGreaterThan(0); // sobe
    }
    expect(SMOKE_WHITE.every((v) => v > 0.7)).toBe(true);
  });

  it('sai mais com mais carga, escala com o fator do degrau e com o tempo do quadro, e não sai sem derrapar nem parado', () => {
    const media = (c: PuffCar, f: number, dt = 1 / 60) => { seed = 21; let n = 0; for (let i = 0; i < 1200; i++) emitTireSmoke(c, dt, f, rnd, () => { n++; }); return n / 1200; };
    expect(media(car({ driftCharge: 200 }), 1)).toBeGreaterThan(media(car({ driftCharge: 0 }), 1));
    expect(driftLevel(200)).toBe(3);
    expect(media(car(), 0.5)).toBeCloseTo(media(car(), 1) / 2, 0);
    expect(media(car(), 1, 1 / 30)).toBeGreaterThan(media(car(), 1, 1 / 60) * 1.7);
    expect(media(car({ driftTicks: 0 }), 1)).toBe(0);
    expect(media(car({ speed: 300 }), 1)).toBe(0);
    expect(media(car(), 0)).toBe(0);
  });
});

describe('fumaça da freada forte e poeira da grama', () => {
  it('a freada forte solta uma bolha cinza de um dos lados; sem freada ou batendo, nada', () => {
    seed = 4;
    const n = (decel: number, brake: number, cd = 0, speed = 5000) => { let k = 0; seed = 4; for (let i = 0; i < 400; i++) emitBrakeSmoke(car({ speed }), decel, brake, cd, 1, rnd, () => { k++; }); return k; };
    expect(n(9000, 10000)).toBeGreaterThan(100);
    expect(n(1000, 10000)).toBe(0);
    expect(n(9000, 10000, 5)).toBe(0);
    expect(n(9000, 10000, 0, 2000)).toBe(0);
    const l = collect((out) => emitBrakeSmoke(car(), 9000, 10000, 0, 1, rnd, out));
    for (const s of l) { expect(Math.abs(s.x - 0.2)).toBeGreaterThan(0.1); expect(s.r).toBeGreaterThan(0.6); }
  });

  it('a poeira da grama sai na cor do chão da pista, dos dois lados, só andando e fora do asfalto', () => {
    const cor: readonly [number, number, number] = [0.54, 0.48, 0.35];
    seed = 8;
    const l = collect((out) => { for (let i = 0; i < 30; i++) emitGrassDust(car({ skidTicks: 6 }), cor, 1, rnd, out); });
    expect(l.length).toBeGreaterThan(20);
    for (const s of l) { expect([s.r, s.g, s.b]).toEqual([...cor]); expect(s.size).toBeGreaterThan(0.3); }
    expect(new Set(l.map((s) => Math.sign(s.x - 0.2))).size).toBe(2);
    expect(collect((out) => emitGrassDust(car({ skidTicks: 0 }), cor, 1, rnd, out))).toEqual([]);
    expect(collect((out) => emitGrassDust(car({ skidTicks: 6, speed: 100 }), cor, 1, rnd, out))).toEqual([]);
  });
});

describe('pool de bolhas (Effects)', () => {
  function cena(quality: Quality, reduce: boolean) {
    const track = getTrack('copacabana');
    const { state } = quickRace({ humans: [human(0)], totalCars: 3, track });
    state.phase = 'racing'; state.tick = 600;
    const idx = state.cars.findIndex((c) => c.seat === 0);
    for (const c of state.cars) if (c !== state.cars[idx]) c.z = (state.cars[idx].z + track.length / 2) % track.length;
    const frame = { state, track, time: 5, paused: false, coop: false, showHud: false, viewports: [{ seat: 0, carIndex: idx, color: '#fff', name: 'P1', messages: [] }],
      options: { quality, showMinimap: false, screenShake: true, reduceEffects: reduce, palette: 'default' } } as unknown as RenderFrame;
    const fx = new Effects(); fx.update(frame);
    return { state, frame, fx, car: state.cars[idx] };
  }
  const bolhas = (q: Quality, reduce = false): number => {
    const s = cena(q, reduce);
    for (let i = 0; i < 90; i++) { s.car.speed = 5000; s.car.driftDir = 1; s.car.driftTicks = 40; s.car.driftCharge = 100; s.frame.time += 1 / 60; s.fx.update(s.frame); }
    return s.fx.counts().puffs;
  };

  it('derrapar solta bolhas; o Baixo solta menos que o Alto; reduzir efeitos NÃO tira a fumaça (ela não pisca)', () => {
    expect(bolhas('high')).toBeGreaterThan(10);
    expect(bolhas('low')).toBeGreaterThan(0);
    expect(bolhas('low')).toBeLessThan(bolhas('high'));
    expect(bolhas('high', true)).toBeGreaterThan(10);
  });

  it('o material é de bolha: mistura normal, sem escrever profundidade, com contorno e brilho no fragmento', () => {
    const fx = new Effects();
    const pts = (fx as unknown as { dust: { points: { material: { blending: number; depthWrite: boolean; fragmentShader: string } } } }).dust.points;
    expect(pts.material.blending).toBe(1); // THREE.NormalBlending
    expect(pts.material.depthWrite).toBe(false);
    expect(pts.material.fragmentShader).toContain('// bolha');
    expect(pts.material.fragmentShader).toContain('discard');
    // a bolha que passa rente à câmera apaga e para de crescer (ajuste visual depois da captura: a fumaça virava um disco do tamanho da tela)
    const u = (pts.material as unknown as { uniforms: { uNearFade: { value: number } } }).uniforms.uNearFade.value;
    expect(u).toBeGreaterThan(3);
  });
});
