// Faíscas laterais do raspão (L5 entregou o sinal `observeScrapes`; aqui a ligação visual, pura e sem three).
import { describe, expect, it } from 'vitest';
import { scrapeSparks, SCRAPE_SPARKS } from '../src/render/scrape-sparks';
import type { ScrapeCue } from '../src/game/race-feel';

const cue = (over: Partial<ScrapeCue> = {}): ScrapeCue => ({ a: 0, b: 1, sideOfA: 1, strength: 0.8, ...over });
const car = (id: number, z: number, x: number, speed: number) => ({ id, z, x, speed });
let seed = 0;
const rnd = () => { seed = (seed * 16807 + 11) % 2147483647; return (seed % 1000) / 1000; };

describe('faíscas do raspão', () => {
  it('emite uma rajada entre os dois carros, do lado do contato, para trás relativo ao mais lento', () => {
    seed = 3;
    const a = car(0, 1000, -0.2, 4000); const b = car(1, 1030, 0.2, 3600);
    const sparks = scrapeSparks(cue({ strength: 1 }), a, b, rnd, false);
    expect(sparks).toHaveLength(SCRAPE_SPARKS);
    for (const s of sparks) {
      expect(s.x).toBeGreaterThan(-0.2); expect(s.x).toBeLessThan(0.2);   // no vão entre os dois, na linha do contato
      expect(s.z).toBeGreaterThan(960); expect(s.z).toBeLessThan(1070);
      expect(s.vz).toBeLessThan(3600);                                   // as faíscas ficam para trás do mais lento
      expect(s.y).toBeGreaterThan(0);
    }
  });

  it('reduzir efeitos (acessibilidade): nenhuma faísca', () => {
    expect(scrapeSparks(cue(), car(0, 0, 0, 3000), car(1, 0, 0.4, 3000), rnd, true)).toEqual([]);
  });

  it('raspão fraco solta menos faíscas que o forte, e nunca zero com strength > 0', () => {
    seed = 5;
    const fraco = scrapeSparks(cue({ strength: 0.15 }), car(0, 0, 0, 3000), car(1, 0, 0.4, 3000), rnd, false).length;
    const forte = scrapeSparks(cue({ strength: 1 }), car(0, 0, 0, 3000), car(1, 0, 0.4, 3000), rnd, false).length;
    expect(fraco).toBeGreaterThan(0);
    expect(forte).toBeGreaterThan(fraco);
  });
});
