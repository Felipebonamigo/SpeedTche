// O que o HUD mostra, em números (src/render/hud-model.ts, onda L, L5): distância em segundos para o carro da frente e
// o de trás, e os modelos de combustível e nitro (percentual, marcas, rótulo e forma, além da cor). Puro.
import { describe, expect, it } from 'vitest';
import { NITRO_CHARGE_COST, NITRO_METER_MAX, REFERENCE_SPEED } from '../src/core/constants';
import type { CarState } from '../src/core/types';
import {
  countdownDisplayTick, formatGap, FUEL_LOW_FRACTION, fuelModel, MAX_GAP_SECONDS, nitroModel, timeGaps,
} from '../src/render/hud-model';
import { quickRace } from './helpers';

/** Três carros em fase de corrida, posições 1, 2 e 3, com progresso e velocidade escolhidos. */
function podium(spec: Array<{ progress: number; speed: number; finished?: boolean }>) {
  const { state } = quickRace({ totalCars: spec.length });
  state.phase = 'racing';
  state.cars.forEach((c, i) => {
    c.progress = spec[i].progress; c.speed = spec[i].speed; c.finished = spec[i].finished ?? false; c.position = i + 1;
  });
  return { state, cars: state.cars as CarState[] };
}

describe('segundos para o carro da frente e o de trás', () => {
  it('2º de 3: 6.000 u para o 1º com 3.000 u/s = 2,0 s; 3.000 u para o 3º que anda a 6.000 u/s = 0,5 s', () => {
    const { state, cars: [first, me, last] } = podium([{ progress: 56_000, speed: 6000 }, { progress: 50_000, speed: 3000 }, { progress: 47_000, speed: REFERENCE_SPEED }]);
    const g = timeGaps(state, me);
    expect(g.aheadSeconds).toBeCloseTo(2, 5);
    expect(g.behindSeconds).toBeCloseTo(0.5, 5);
    expect(g.aheadName).toBe(first.name);
    expect(g.behindName).toBe(last.name);
  });

  it('o líder não tem "frente" e o último não tem "atrás"', () => {
    const { state, cars } = podium([{ progress: 9000, speed: 3000 }, { progress: 6000, speed: 3000 }, { progress: 3000, speed: 3000 }]);
    expect(timeGaps(state, cars[0]).aheadSeconds).toBeNull();
    expect(timeGaps(state, cars[0]).behindSeconds).toBeCloseTo(1, 5);
    expect(timeGaps(state, cars[2]).behindSeconds).toBeNull();
  });

  it('carro que já terminou não é vizinho', () => {
    const { state, cars } = podium([{ progress: 90_000, speed: 3000, finished: true }, { progress: 6000, speed: 3000 }, { progress: 3000, speed: 3000, finished: true }]);
    const g = timeGaps(state, cars[1]);
    expect(g.aheadSeconds).toBeNull();
    expect(g.behindSeconds).toBeNull();
  });

  it('carro parado não dá 999 s: tem piso de velocidade e, acima de MAX_GAP_SECONDS, não mostra nada', () => {
    // 54.000 u de distância, carro parado: com o piso de 900 u/s dá 60 s, acima da régua.
    const far = podium([{ progress: 60_000, speed: 3000 }, { progress: 6000, speed: 0 }, { progress: 3000, speed: 0 }]);
    expect(timeGaps(far.state, far.cars[1]).aheadSeconds).toBeNull();
    expect(MAX_GAP_SECONDS).toBe(59.9);
    // 600 u de distância: 0,67 s, finito.
    const near = podium([{ progress: 6600, speed: 3000 }, { progress: 6000, speed: 0 }, { progress: 3000, speed: 0 }]);
    const ahead = timeGaps(near.state, near.cars[1]).aheadSeconds;
    expect(ahead).not.toBeNull();
    expect(ahead as number).toBeCloseTo(600 / (REFERENCE_SPEED * 0.15), 5);
  });
});

describe('formatGap', () => {
  it('PT com vírgula, EN com ponto, e traço quando não há carro', () => {
    expect(formatGap(1.24, 'pt')).toBe('1,2 s');
    expect(formatGap(1.24, 'en')).toBe('1.2 s');
    expect(formatGap(12.6, 'pt')).toBe('13 s');
    expect(formatGap(null, 'pt')).toBe('—');
  });
});

describe('combustível: percentual, marcas e rótulo (não só a cor)', () => {
  it('72% = 3 de 4 marcas, nível normal', () => {
    const m = fuelModel(0.72);
    expect(m.percent).toBe(72);
    expect(m.segments).toBe(3);
    expect(m.level).toBe('ok');
  });

  it('abaixo de FUEL_LOW_FRACTION (a régua de hoje, 0,25) é "low"; 0 é "empty"; o limite ainda é normal', () => {
    expect(FUEL_LOW_FRACTION).toBe(0.25);
    expect(fuelModel(0.2499).level).toBe('low');
    expect(fuelModel(0.25).level).toBe('ok');
    expect(fuelModel(0).level).toBe('empty');
    expect(fuelModel(0).segments).toBe(0);
  });

  it('valores fora da faixa e NaN são trazidos para 0–100%', () => {
    expect(fuelModel(1.4).percent).toBe(100);
    expect(fuelModel(-3).percent).toBe(0);
    expect(fuelModel(Number.NaN).percent).toBe(0);
  });
});

describe('nitro: barra, cargas e número', () => {
  it('2 cargas cheias e meia: 2 raios cheios, o número 2 e a fração da barra', () => {
    const n = nitroModel(NITRO_CHARGE_COST * 2.5);
    expect(n.filled).toBe(2);
    expect(n.count).toBe(2);
    expect(n.extra).toBe('');
    expect(n.fraction).toBeCloseTo((NITRO_CHARGE_COST * 2.5) / NITRO_METER_MAX, 9);
  });

  it('a barra da equipe (teto de 6 cargas) com 5 cheias: 3 raios cheios, "×5" e a fração sobre o teto da equipe', () => {
    const n = nitroModel(NITRO_CHARGE_COST * 5, NITRO_METER_MAX * 2);
    expect(n.filled).toBe(3);
    expect(n.count).toBe(5);
    expect(n.extra).toBe('×5');
    expect(n.fraction).toBeCloseTo(5 / 6, 9);
  });

  it('meia carga não acende raio nenhum e a barra cheia é fração 1', () => {
    expect(nitroModel(NITRO_CHARGE_COST - 1).filled).toBe(0);
    expect(nitroModel(NITRO_CHARGE_COST - 1).count).toBe(0);
    expect(nitroModel(NITRO_METER_MAX).fraction).toBe(1);
  });

  it('vazio e lixo: nenhum raio, fração 0 (e nunca acima de 1)', () => {
    expect(nitroModel(0).filled).toBe(0);
    expect(nitroModel(-1).count).toBe(0);
    expect(nitroModel(Number.NaN).fraction).toBe(0);
    expect(nitroModel(NITRO_METER_MAX * 9).fraction).toBe(1);
  });
});

describe('contagem desenhada adiantada (N1)', () => {
  it('o tick desenhado é o do núcleo mais o atraso de entrada; atraso negativo ou lixo vale 0', () => {
    expect(countdownDisplayTick(50, 12)).toBe(62);
    expect(countdownDisplayTick(50, -3)).toBe(50);
    expect(countdownDisplayTick(50, Number.NaN)).toBe(50);
  });
});
