// V8 (docs/ondas/V8-efeitos.md): a batida REALISTA, no lugar do "POW!" e das estrelinhas — o ponto de contato e o que sai dele: uma chuva curta de
// faíscas metálicas finas, lascas pequenas escuras que caem e um flash breve e contido (src/render/fx/impact.ts). Puro: o sorteio é do teste.
import { describe, expect, it } from 'vitest';
import { CAR_HALF_WIDTH, CAR_LENGTH } from '../src/core/constants';
import { contactPoint, emitImpact, type Contact, type ImpactCar } from '../src/render/fx/impact';
import type { PuffSpec } from '../src/render/fx/smoke';
import type { SparkSpec } from '../src/render/fx/sparks';

let seed = 1;
const rnd = (): number => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const L = 100_000;
/** Unidades de pista por metro e metros por meia largura (units.ts). */
const U = 50; const MX = 7;
const car = (o: Partial<ImpactCar>): ImpactCar => ({ id: 0, z: 10_000, x: 0, speed: 5000, collisionCooldown: 20, ...o });
const blank = (): Contact => ({ z: 0, x: 0, h: 0, partner: -1 });

describe('o ponto de contato', () => {
  it('batida em fila: o ponto fica entre os dois carros, na altura do para-choque; visto de qualquer um dos dois é o mesmo', () => {
    const rear = car({ id: 1, z: 10_000, x: 0.2 }); const front = car({ id: 2, z: 10_000 + CAR_LENGTH, x: 0.3 });
    const a = contactPoint(rear, [rear, front], L, blank()); const b = contactPoint(front, [rear, front], L, blank());
    expect(a.partner).toBe(2); expect(b.partner).toBe(1);
    expect(a.z).toBeCloseTo(10_000 + CAR_LENGTH / 2, 6); expect(a.x).toBeCloseTo(0.25, 6);
    expect(b.z).toBeCloseTo(a.z, 6); expect(b.x).toBeCloseTo(a.x, 6);
    expect(a.h).toBeGreaterThan(0.25); expect(a.h).toBeLessThan(0.8);
  });

  it('com a volta da pista (um carro antes da linha de chegada, o outro depois), o ponto fica entre eles e dentro da pista', () => {
    const rear = car({ id: 1, z: L - 50 }); const front = car({ id: 2, z: 150 });
    const c = contactPoint(rear, [front, rear], L, blank());
    expect(c.partner).toBe(2);
    expect(c.z).toBeCloseTo(50, 6);
  });

  it('carro em outra faixa ou longe não é parceiro; sem parceiro (o cenário) o ponto é a quina da frente, do lado de fora da pista', () => {
    const me = car({ id: 1, x: 1.3 });
    const longe = car({ id: 2, z: 10_000 + CAR_LENGTH * 3, x: 1.3 });
    const outraFaixa = car({ id: 3, z: 10_100, x: -0.6 });
    const calmo = car({ id: 4, z: 10_000 + CAR_LENGTH, x: 1.3, collisionCooldown: 0 }); // sem batida registrada: só passou perto
    const c = contactPoint(me, [me, longe, outraFaixa, calmo], L, blank());
    expect(c.partner).toBe(-1);
    expect(c.x - me.x).toBeCloseTo(CAR_HALF_WIDTH, 6);
    expect(c.z).toBeGreaterThan(me.z); expect(c.z).toBeLessThanOrEqual(me.z + CAR_LENGTH / 2);
    const esquerda = car({ id: 5, x: -1.4 });
    expect(contactPoint(esquerda, [esquerda], L, blank()).x).toBeCloseTo(-1.4 - CAR_HALF_WIDTH, 6);
  });
});

describe('o que sai da batida', () => {
  const at: Contact = { z: 20_000, x: 0.1, h: 0.45, partner: 3 };
  const SPEED = 5000;
  function collect(drop: number, factor: number) {
    const sparks: SparkSpec[] = []; const chips: PuffSpec[] = [];
    emitImpact(at, SPEED, drop, factor, rnd, (s) => sparks.push(s), (p) => chips.push(p));
    return { sparks, chips, flash: sparks.filter((s) => s.width >= 0.15), metal: sparks.filter((s) => s.width < 0.15) };
  }
  /** Velocidade relativa ao carro (m/s): o que estica o traço na tela. */
  const rel = (s: SparkSpec): number => Math.hypot(s.svz / U, s.svx * MX, s.svh);

  it('faíscas metálicas: uma chuva curta, fina e quente que sai do ponto de contato e cai (não o leque de 8–22 m/s espalhado em volta do carro)', () => {
    seed = 7;
    const { metal } = collect(0.3, 1);
    expect(metal.length).toBeGreaterThanOrEqual(16);
    for (const s of metal) {
      expect(Math.abs(s.z - at.z) / U, 'distância do contato ao longo (m)').toBeLessThanOrEqual(0.3);
      expect(Math.abs(s.x - at.x) * MX, 'distância do contato ao lado (m)').toBeLessThanOrEqual(0.3);
      expect(Math.abs(s.h - at.h), 'altura').toBeLessThanOrEqual(0.2);
      expect(s.life, 'curta').toBeLessThanOrEqual(0.4);
      expect(s.width, 'fina').toBeLessThanOrEqual(0.035);
      expect(s.gravity, 'cai').toBeGreaterThanOrEqual(9);
      expect(rel(s), 'velocidade relativa (m/s)').toBeGreaterThanOrEqual(2);
      expect(rel(s), 'velocidade relativa (m/s)').toBeLessThanOrEqual(10);
      expect(s.r, 'metal em brasa: HDR').toBeGreaterThan(1);
      expect(s.r >= s.g && s.g >= s.b, `quente: rgb(${s.r}, ${s.g}, ${s.b})`).toBe(true);
    }
    expect(metal.some((s) => s.svx > 0) && metal.some((s) => s.svx < 0), 'para os dois lados').toBe(true);
  });

  it('mais forte com a queda de velocidade; o degrau escala; fator 0 ("Reduzir efeitos") não solta nada — nem lasca nem flash', () => {
    seed = 11;
    const fraca = collect(0.03, 1); const forte = collect(0.3, 1); const meia = collect(0.3, 0.5); const zero = collect(0.3, 0);
    expect(forte.metal.length).toBeGreaterThan(fraca.metal.length);
    expect(fraca.metal.length).toBeGreaterThan(0);
    expect(meia.metal.length).toBeLessThan(forte.metal.length);
    expect(forte.chips.length).toBeGreaterThanOrEqual(fraca.chips.length);
    expect(zero.sparks).toEqual([]); expect(zero.chips).toEqual([]);
  });

  it('o flash: breve (≤ 0,12 s), contido (um ou dois traços de no máximo 0,5 m) e parado no ponto de contato', () => {
    seed = 5;
    const { flash } = collect(0.2, 1);
    expect(flash.length).toBeGreaterThanOrEqual(1); expect(flash.length).toBeLessThanOrEqual(2);
    for (const s of flash) {
      expect(s.life).toBeLessThanOrEqual(0.12);
      expect(s.width).toBeLessThanOrEqual(0.5);
      expect(Math.abs(s.z - at.z) / U).toBeLessThanOrEqual(0.05);
      expect(rel(s)).toBeLessThanOrEqual(0.5);
    }
  });

  it('lascas: pequenas, escuras, que caem e quicam (não incham como a fumaça), perto do contato', () => {
    seed = 3;
    const { chips } = collect(0.3, 1);
    expect(chips.length).toBeGreaterThanOrEqual(4);
    for (const c of chips) {
      expect(c.size).toBeGreaterThanOrEqual(0.03); expect(c.size).toBeLessThanOrEqual(0.1);
      expect(c.grow).toBe(0);
      expect(c.gravity).toBeGreaterThanOrEqual(9);
      expect(c.life).toBeLessThanOrEqual(1);
      expect(Math.max(c.r, c.g, c.b), 'escura').toBeLessThanOrEqual(0.6);
      expect(Math.abs(c.z - at.z) / U).toBeLessThanOrEqual(0.3);
      expect(c.vh, 'sobe e cai').toBeGreaterThan(0);
    }
  });

  it('tudo anda com o carro (a câmera vai junto): a velocidade de mundo é perto da do carro, não parada no chão', () => {
    seed = 9;
    const { sparks, chips } = collect(0.3, 1);
    for (const s of sparks) { expect(s.vz).toBeGreaterThanOrEqual(SPEED * 0.85); expect(s.vz).toBeLessThanOrEqual(SPEED * 1.1); }
    for (const c of chips) { expect(c.vz).toBeGreaterThanOrEqual(SPEED * 0.7); expect(c.vz).toBeLessThanOrEqual(SPEED * 1.05); }
  });
});
