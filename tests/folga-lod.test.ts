// V13: a distância do LOD dos carros pelo tamanho que o carro tem NA TELA. Puro (sem three): src/render/cars/lod.ts.
import { describe, expect, it } from 'vitest';
import { CAR_LOD_FAR_M, carLodDistance } from '../src/render/cars/lod';

describe('distância do casco simplificado e da roda simples (V13)', () => {
  it('1 jogador (tela cheia) segue como sempre foi: 30 m', () => {
    expect(CAR_LOD_FAR_M).toBe(30);
    expect(carLodDistance(1)).toBe(30);
    expect(carLodDistance(0)).toBe(30); // fundo do menu: sem viewport de jogador
  });
  it('2, 3 e 4 jogadores (o viewport tem a METADE da altura): o carro tem os mesmos pixels na metade da distância', () => {
    for (const n of [2, 3, 4]) expect(carLodDistance(n)).toBe(15);
  });
  it('nunca passa de 30 m nem cai a zero (assento extra ou número quebrado não estoura)', () => {
    for (const n of [-1, 0.5, 1.9, 5, 99, Number.NaN]) {
      const d = carLodDistance(n);
      expect(d).toBeGreaterThanOrEqual(15);
      expect(d).toBeLessThanOrEqual(30);
    }
  });
});
