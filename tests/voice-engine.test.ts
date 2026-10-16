// N6 (a): motor por carro (docs/ondas/N/N6.md, §4.1 e §6 E1–E9). Sem placa de som: o áudio se prova por parâmetros
// (timbres, frequências, ganhos) e por agendamento num AudioContext falso (tests/audio-fake.ts).
import { describe, expect, it } from 'vitest';
import { COUNTDOWN_TICKS } from '../src/core/constants';
import { CARS } from '../src/core/data/cars';
import { ENGINE_MAX_HZ, ENGINE_MIN_HZ, EngineBank, engineFrequency, NITRO_PITCH_MULT } from '../src/audio/engine';
import { COUNTDOWN_REV_PEAK, countdownRpm, engineTimbre, launchRpm, type EngineTimbre } from '../src/audio/engine-timbre';
import type { RenderFrame } from '../src/game/contracts';
import { fakeAudio, type FakeOsc } from './audio-fake';
import { human, quickRace } from './helpers';

const WAVES: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle'];

/** Assinatura numérica de um timbre (tudo que o ouvido separa), para medir a distância entre dois. */
function signature(t: EngineTimbre): number[] {
  return [
    Math.log2(t.pitch) * 2, WAVES.indexOf(t.main) * 0.3, WAVES.indexOf(t.sub) * 0.3, t.subRatio, t.subMix, t.cutoff / 1000, t.span / 1500,
    t.q / 2, t.lope * 2, t.lopeRate / 2, t.whine * 2, t.whineRatio / 4, t.gain,
  ];
}
const distance = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);

function frameOf(carIds: string[], tick = 0): RenderFrame {
  const { state, track } = quickRace({ humans: carIds.map((id, seat) => human(seat, seat, id)), totalCars: 6 });
  state.tick = tick; // ainda 'countdown': o motor lê a fase e o tick
  return {
    state, track, paused: false, time: 1, coop: false, showHud: true,
    viewports: carIds.map((_, seat) => ({ seat, carIndex: state.cars.findIndex((c) => c.seat === seat), color: '#fff', name: `P${seat + 1}`, messages: [] })),
    options: { quality: 'high', showMinimap: true, screenShake: true, reduceEffects: false, palette: 'default' },
  };
}

/** A voz `n` do banco (4 osciladores por voz, na ordem fixa: principal, sub, ronco/LFO, zumbido). */
function voiceOscs(oscillators: FakeOsc[], n: number): { main: FakeOsc; sub: FakeOsc; lfo: FakeOsc; whine: FakeOsc } {
  const [main, sub, lfo, whine] = oscillators.slice(n * 4, n * 4 + 4);
  return { main, sub, lfo, whine };
}

function settle(bank: EngineBank, frame: RenderFrame, frames = 90): void {
  for (let i = 0; i < frames; i++) bank.update(frame, 1 / 60);
}

describe('timbre do motor por carro', () => {
  it('E1: há um timbre para cada um dos 16 carros', () => {
    expect(CARS).toHaveLength(16);
    for (const car of CARS) {
      const t = engineTimbre(car.id);
      expect(t.pitch, car.id).toBeGreaterThan(0);
      expect(WAVES, car.id).toContain(t.main);
      expect(WAVES, car.id).toContain(t.sub);
    }
  });

  it('E2: os 16 timbres são distintos — inclusive Falcão e Boitatá, que dividem a carroceria gt', () => {
    expect(CARS.find((c) => c.id === 'falcao')?.body).toBe(CARS.find((c) => c.id === 'boitata')?.body);
    for (let i = 0; i < CARS.length; i++) {
      for (let j = i + 1; j < CARS.length; j++) {
        const d = distance(signature(engineTimbre(CARS[i].id)), signature(engineTimbre(CARS[j].id)));
        expect(d, `${CARS[i].id} × ${CARS[j].id}`).toBeGreaterThan(0.4);
      }
    }
  });

  it('E3: V8 grave, quatro cilindros agudo; sem o carro, o som é o de sempre (o do Falcão)', () => {
    for (const rpm of [0, 0.25, 0.5, 0.75, 1]) {
      for (const nitro of [false, true]) {
        expect(engineFrequency(rpm, nitro, 'trovao'), `trovão ${rpm}`).toBeLessThan(engineFrequency(rpm, nitro, 'tornado'));
        expect(engineFrequency(rpm, nitro, 'tatu'), `tatu ${rpm}`).toBeLessThan(engineFrequency(rpm, nitro, 'saci'));
        expect(engineFrequency(rpm, nitro), `sem carro ${rpm}`).toBe(engineFrequency(rpm, nitro, 'falcao'));
      }
    }
    // O som sem carro é o de antes da N6: a faixa 55–260 Hz e o tom do nitro.
    expect(engineFrequency(0, false)).toBe(ENGINE_MIN_HZ);
    expect(engineFrequency(1, false)).toBe(ENGINE_MAX_HZ);
    expect(engineFrequency(0.5, true)).toBeCloseTo(engineFrequency(0.5, false) * NITRO_PITCH_MULT, 9);
  });

  it('E4: determinístico, congelado, e carro desconhecido cai no Falcão', () => {
    for (const car of CARS) {
      expect(engineTimbre(car.id)).toEqual(engineTimbre(car.id));
      expect(Object.isFrozen(engineTimbre(car.id)), car.id).toBe(true);
    }
    expect(engineTimbre('nao-existe')).toEqual(engineTimbre('falcao'));
    expect(engineFrequency(0.4, false, 'nao-existe')).toBe(engineFrequency(0.4, false, 'falcao'));
  });

  it('E5: toda frequência dos 16 carros fica em 20–700 Hz, e o nitro sobe o tom', () => {
    for (const car of CARS) {
      for (let k = 0; k <= 10; k++) {
        const rpm = k / 10;
        const f = engineFrequency(rpm, false, car.id);
        expect(f, `${car.id} ${rpm}`).toBeGreaterThanOrEqual(20);
        expect(f, `${car.id} ${rpm}`).toBeLessThanOrEqual(700);
        expect(engineFrequency(rpm, true, car.id), `${car.id} nitro ${rpm}`).toBeGreaterThan(f);
        expect(engineFrequency(rpm, true, car.id), `${car.id} nitro ${rpm}`).toBeLessThanOrEqual(700 * NITRO_PITCH_MULT);
      }
    }
  });

  it('E6: o elétrico tem zumbido e nenhum ronco; V8, picape e clássico têm ronco', () => {
    const sucuri = engineTimbre('sucuri');
    expect(sucuri.whine).toBeGreaterThan(0);
    expect(sucuri.lope).toBe(0);
    for (const id of ['trovao', 'tatu', 'boto']) expect(engineTimbre(id).lope, id).toBeGreaterThan(0);
  });

  it('E7: a contagem sobe o giro da marcha lenta até o "JÁ", sem sair de 0..1 e sem sorteio', () => {
    expect(countdownRpm(0)).toBeGreaterThanOrEqual(0.05);
    expect(countdownRpm(0)).toBeLessThan(0.2);
    expect(countdownRpm(COUNTDOWN_TICKS - 1)).toBeGreaterThanOrEqual(0.8);
    expect(COUNTDOWN_REV_PEAK).toBeGreaterThanOrEqual(0.8);
    const mean = (from: number, to: number) => { let s = 0; for (let t = from; t < to; t++) s += countdownRpm(t); return s / (to - from); };
    expect(mean(COUNTDOWN_TICKS - 60, COUNTDOWN_TICKS)).toBeGreaterThan(mean(0, 60) + 0.4);
    for (let t = 0; t <= COUNTDOWN_TICKS; t++) {
      const r = countdownRpm(t);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(countdownRpm(t)).toBe(r);
    }
    // Um toque no acelerador a cada número (os números trocam nos ticks 30, 90 e 150).
    expect(countdownRpm(31)).toBeGreaterThan(countdownRpm(29));
    expect(countdownRpm(91)).toBeGreaterThan(countdownRpm(89));
  });

  it('E9: depois do "JÁ" o giro de largada cai devagar até o que a velocidade pede (sem buraco no som)', () => {
    expect(launchRpm(0)).toBeGreaterThanOrEqual(COUNTDOWN_REV_PEAK - 0.02);
    let prev = launchRpm(0);
    for (let t = 1; t <= 60; t++) { const r = launchRpm(t); expect(r).toBeLessThanOrEqual(prev); prev = r; }
    expect(launchRpm(60)).toBe(0);
    expect(launchRpm(10_000)).toBe(0);
  });
});

describe('EngineBank com um AudioContext falso', () => {
  it('E8a: dois carros no mesmo banco criam vozes de timbre diferente', () => {
    const fa = fakeAudio();
    const bank = new EngineBank(fa.ctx, fa.dest);
    settle(bank, frameOf(['trovao', 'tornado']));
    const a = voiceOscs(fa.oscillators, 0);
    const b = voiceOscs(fa.oscillators, 1);
    const ta = engineTimbre('trovao');
    const tb = engineTimbre('tornado');
    expect(a.main.type).toBe(ta.main);
    expect(a.sub.type).toBe(ta.sub);
    expect(b.main.type).toBe(tb.main);
    expect(b.sub.type).toBe(tb.sub);
    // A fundamental do V8 é mais grave que a do quatro cilindros no mesmo giro, e o sub segue a razão do timbre.
    expect(a.main.frequency.value).toBeLessThan(b.main.frequency.value);
    expect(a.sub.frequency.value / a.main.frequency.value).toBeCloseTo(ta.subRatio, 6);
    expect(b.sub.frequency.value / b.main.frequency.value).toBeCloseTo(tb.subRatio, 6);
    // O V8 ronca (LFO ligado); o quatro cilindros do Tornado, não.
    expect(a.lfo.frequency.value).toBeGreaterThan(0);
    expect(ta.lope).toBeGreaterThan(0);
    expect(tb.lope).toBe(0);
  });

  it('E8b: na contagem o motor sobe de giro, e o gancho (largada-foguete da N1) manda no alvo', () => {
    const fa = fakeAudio();
    const bank = new EngineBank(fa.ctx, fa.dest);
    settle(bank, frameOf(['trovao'], 0));
    const idle = voiceOscs(fa.oscillators, 0).main.frequency.value;
    expect(idle).toBeCloseTo(engineFrequency(countdownRpm(0), false, 'trovao'), 0);
    settle(bank, frameOf(['trovao'], COUNTDOWN_TICKS - 10), 120);
    const revved = voiceOscs(fa.oscillators, 0).main.frequency.value;
    expect(revved).toBeGreaterThan(idle * 1.5);
    expect(revved).toBeCloseTo(engineFrequency(countdownRpm(COUNTDOWN_TICKS - 10), false, 'trovao'), 0);
    // O gancho: devolve um giro → vale ele; devolve nada → volta ao padrão da contagem.
    bank.setRevHook(() => 0.3);
    settle(bank, frameOf(['trovao'], COUNTDOWN_TICKS - 10), 240);
    expect(voiceOscs(fa.oscillators, 0).main.frequency.value).toBeCloseTo(engineFrequency(0.3, false, 'trovao'), 0);
    bank.setRevHook(() => undefined);
    settle(bank, frameOf(['trovao'], COUNTDOWN_TICKS - 10), 240);
    expect(voiceOscs(fa.oscillators, 0).main.frequency.value).toBeCloseTo(revved, 0);
    bank.setRevHook(null);
  });

  it('E8c: trocar o carro do viewport (corrida nova) troca o timbre da voz', () => {
    const fa = fakeAudio();
    const bank = new EngineBank(fa.ctx, fa.dest);
    settle(bank, frameOf(['trovao']));
    const v = voiceOscs(fa.oscillators, 0);
    expect(v.main.type).toBe(engineTimbre('trovao').main);
    settle(bank, frameOf(['sucuri']), 120);
    expect(fa.oscillators).toHaveLength(4); // a mesma voz, sem nó novo
    expect(v.main.type).toBe(engineTimbre('sucuri').main);
    expect(v.main.frequency.value).toBeCloseTo(engineFrequency(countdownRpm(0), false, 'sucuri'), 0);
    // O zumbido do elétrico agora soa (a senoide aguda acima da fundamental).
    expect(v.whine.frequency.value).toBeGreaterThan(v.main.frequency.value);
  });
});

describe('SessionAudio: o gancho do motor', () => {
  it('E10: setRevHook existe e é seguro antes do unlock (Node, sem AudioContext), com função ou null', async () => {
    const { createAudio } = await import('../src/audio/audio');
    const audio = createAudio();
    expect(typeof audio.setRevHook).toBe('function');
    expect(() => audio.setRevHook(() => 0.5)).not.toThrow();
    expect(() => audio.setRevHook(null)).not.toThrow();
    expect(() => audio.unlock()).not.toThrow();
  });
});
