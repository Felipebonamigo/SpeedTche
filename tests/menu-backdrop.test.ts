// Onda L, L2b: o fundo do menu com carros correndo. Parte pura (quantos carros por degrau, onde ficam) e a ligação com o renderizador.
import { describe, expect, it } from 'vitest';
import { backdropCount, MenuBackdrop } from '../src/render/menu-backdrop';
import { QUALITY_ORDER } from '../src/game/quality';
import { CARS } from '../src/core/data/cars';

describe('fundo do menu com carros (L2b)', () => {
  it('a Baixa não tem carros; Média tem poucos; Alta e Ultra mais; reduzir efeitos zera', () => {
    expect(backdropCount('low', false)).toBe(0);
    expect(backdropCount('medium', false)).toBe(3);
    expect(backdropCount('high', false)).toBe(5);
    expect(backdropCount('ultra', false)).toBe(5);
    for (const q of QUALITY_ORDER) expect(backdropCount(q, true), q).toBe(0);
  });

  it('os carros ficam à frente da câmera, dentro do asfalto, andando e de modelos conhecidos', () => {
    const b = new MenuBackdrop();
    const length = 120000;
    for (const time of [0, 7.3, 41, 300]) {
      const camZ = (time * 2600) % length;
      const cars = b.update(time, camZ, length, 5);
      expect(cars).toHaveLength(5);
      for (const c of cars) {
        const ahead = (((c.z - camZ) % length) + length) % length;
        expect(ahead, 'à frente da câmera (unidades de pista)').toBeGreaterThan(500);
        expect(ahead).toBeLessThan(6000);
        expect(Math.abs(c.x)).toBeLessThanOrEqual(0.8);
        expect(c.speed).toBeGreaterThan(1500);
        expect(CARS.some((d) => d.id === c.carId)).toBe(true);
        expect(c.stats.topSpeed).toBeGreaterThan(0);
        expect(c.seat).toBe(-1);
      }
      expect(new Set(cars.map((c) => c.carId)).size, 'carros diferentes').toBeGreaterThan(1);
    }
  });

  it('é determinístico no tempo e não usa Math.random', () => {
    const a = new MenuBackdrop().update(12.5, 5000, 90000, 3).map((c) => [c.z, c.x, c.carId]);
    const b = new MenuBackdrop().update(12.5, 5000, 90000, 3).map((c) => [c.z, c.x, c.carId]);
    expect(a).toEqual(b);
  });

  it('a distância à câmera oscila devagar: o carro não some nem cola no vidro', () => {
    const b = new MenuBackdrop();
    let min = Infinity; let max = 0;
    for (let t = 0; t < 120; t += 0.5) {
      const cars = b.update(t, 0, 1e9, 5);
      for (const c of cars) { min = Math.min(min, c.z); max = Math.max(max, c.z); }
    }
    expect(min).toBeGreaterThan(500);
    expect(max).toBeLessThan(6000);
  });
});
