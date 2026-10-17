// N6 (b1): a buzina de cada carro, o SOM (docs/ondas/N/N6.md, §4.2 e §6 H1–H5). Sem placa de som: parâmetros e agendamento
// num AudioContext falso (tests/audio-fake.ts).
import { describe, expect, it } from 'vitest';
import { CARS } from '../src/core/data/cars';
import { createHornPlayer, HORN_MAX_GAIN, HORN_MAX_SECONDS, HORN_MAX_VOICES, hornTones } from '../src/audio/horn';
import { fakeAudio } from './audio-fake';

const WAVES: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle'];

/** O que o ouvido separa numa buzina: altura média, onda, número de toques, duração e deslize. */
function features(carId: string): number[] {
  const tones = hornTones(carId, 0, 1);
  const meanLog = tones.reduce((s, t) => s + Math.log2(t.freq), 0) / tones.length;
  const starts = new Set(tones.map((t) => t.at ?? 0));
  const end = Math.max(...tones.map((t) => (t.at ?? 0) + t.dur));
  const first = tones[0];
  const glide = Math.log2((first.freqEnd ?? first.freq) / first.freq);
  return [meanLog, WAVES.indexOf(first.type ?? 'square') * 0.5, starts.size / 3, end, glide, tones.length / 3];
}
const distance = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);

describe('buzina por carro: os tons', () => {
  it('H1: as 20 buzinas existem, são curtas, agudas o bastante para soar e não estouram o ganho', () => {
    expect(CARS).toHaveLength(20);
    for (const car of CARS) {
      const tones = hornTones(car.id, 0, 1);
      expect(tones.length, car.id).toBeGreaterThanOrEqual(1);
      for (const t of tones) {
        expect(t.freq, `${car.id} freq`).toBeGreaterThanOrEqual(80);
        expect(t.freq, `${car.id} freq`).toBeLessThanOrEqual(3600);
        if (t.freqEnd !== undefined) { expect(t.freqEnd, `${car.id} freqEnd`).toBeGreaterThanOrEqual(80); expect(t.freqEnd, `${car.id} freqEnd`).toBeLessThanOrEqual(3600); }
        expect(t.gain ?? 0, `${car.id} ganho`).toBeGreaterThan(0);
        expect(t.gain ?? 0, `${car.id} ganho`).toBeLessThanOrEqual(HORN_MAX_GAIN);
        // Cauda do envelope incluída: nenhuma buzina passa de HORN_MAX_SECONDS.
        expect((t.at ?? 0) + t.dur + (t.env?.release ?? 0), `${car.id} duração`).toBeLessThanOrEqual(HORN_MAX_SECONDS);
        expect(t.at ?? 0, car.id).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('H2: as 20 buzinas são distintas entre si, inclusive os carros que dividem a carroceria', () => {
    for (let i = 0; i < CARS.length; i++) {
      for (let j = i + 1; j < CARS.length; j++) {
        expect(distance(features(CARS[i].id), features(CARS[j].id)), `${CARS[i].id} × ${CARS[j].id}`).toBeGreaterThan(0.3);
      }
    }
    expect(JSON.stringify(hornTones('falcao', 0, 1))).not.toBe(JSON.stringify(hornTones('boitata', 0, 1)));
  });

  it('H3: determinístico — o mesmo carro, o mesmo instante e o mesmo ganho dão os mesmos tons; o instante só desloca', () => {
    for (const car of CARS) {
      expect(hornTones(car.id, 1.5, 0.7)).toEqual(hornTones(car.id, 1.5, 0.7));
      const base = hornTones(car.id, 0, 1);
      const shifted = hornTones(car.id, 2, 1);
      expect(shifted.map((t) => t.at)).toEqual(base.map((t) => (t.at ?? 0) + 2));
      expect(shifted.map((t) => t.freq)).toEqual(base.map((t) => t.freq));
    }
    // Carro desconhecido (save antigo) soa como o Falcão; ganho zero ou inválido não gera nenhum tom.
    expect(hornTones('nao-existe', 0, 1)).toEqual(hornTones('falcao', 0, 1));
    expect(hornTones('falcao', 0, 0)).toEqual([]);
    expect(hornTones('falcao', 0, Number.NaN)).toEqual([]);
  });

  it('H3b: o ganho pedido escala o ganho dos tons', () => {
    const full = Math.max(...hornTones('tatu', 0, 1).map((t) => t.gain ?? 0));
    const half = Math.max(...hornTones('tatu', 0, 0.5).map((t) => t.gain ?? 0));
    expect(half).toBeCloseTo(full / 2, 9);
  });
});

describe('buzina por carro: tocar', () => {
  it('H4: o tocador agenda um oscilador por tom, todos terminam dentro do teto e nada fica vivo', () => {
    const fa = fakeAudio();
    const player = createHornPlayer(fa.ctx, fa.dest);
    fa.currentTime = 3;
    expect(player.play('tornado', 1)).toBe(true);
    const tones = hornTones('tornado', 3, 1);
    expect(fa.oscillators).toHaveLength(tones.length);
    tones.forEach((t, i) => {
      const osc = fa.oscillators[i];
      expect(osc.type).toBe(t.type);
      expect(osc.startedAt).toBeCloseTo(t.at ?? 0, 9);
      expect(osc.stoppedAt ?? Infinity).toBeLessThanOrEqual(3 + HORN_MAX_SECONDS + 0.05);
    });
    // O Boitatá estala (ruído de chama); as outras buzinas são só tons.
    const before = fa.sources.length;
    player.play('boitata', 1);
    expect(fa.sources.length).toBeGreaterThan(before);
  });

  it('H5: no máximo HORN_MAX_VOICES ao mesmo tempo; passada a buzina, a vaga volta', () => {
    const fa = fakeAudio();
    const player = createHornPlayer(fa.ctx, fa.dest);
    const results: boolean[] = [];
    for (let i = 0; i < HORN_MAX_VOICES + 3; i++) results.push(player.play('falcao', 1));
    expect(results.filter(Boolean)).toHaveLength(HORN_MAX_VOICES);
    expect(results.slice(0, HORN_MAX_VOICES).every(Boolean)).toBe(true);
    fa.currentTime = HORN_MAX_SECONDS + 0.1;
    expect(player.play('falcao', 1)).toBe(true);
  });

  it('H6: ganho inválido ou zero não toca', () => {
    const fa = fakeAudio();
    const player = createHornPlayer(fa.ctx, fa.dest);
    expect(player.play('falcao', 0)).toBe(false);
    expect(player.play('falcao', Number.NaN)).toBe(false);
    expect(fa.oscillators).toHaveLength(0);
  });
});

describe('SessionAudio: a buzina', () => {
  it('H7: horn existe e é no-op seguro sem AudioContext (Node)', async () => {
    const { createAudio } = await import('../src/audio/audio');
    const audio = createAudio();
    expect(typeof audio.horn).toBe('function');
    expect(() => audio.horn('falcao', 1)).not.toThrow();
    expect(() => audio.horn('carro-que-nao-existe', 0.4)).not.toThrow();
    expect(() => { audio.unlock(); audio.horn('trovao', 1); }).not.toThrow();
  });
});
