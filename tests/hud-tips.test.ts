// Dicas da 1ª corrida (O3, docs/ondas/O/O3.md): quando cada uma aparece, por assento, com as teclas reais.
import { describe, expect, it } from 'vitest';
import { AI_BRAKE_CURVE, COUNTDOWN_TICKS, NITRO_CHARGE_COST, SEGMENT_LENGTH, TICK_RATE } from '../src/core/constants';
import { stepRace } from '../src/core/sim/race';
import { carStats } from '../src/core/sim/stats';
import { NEUTRAL_INPUT, type PlayerInput, type RaceState, type Track } from '../src/core/types';
import { describeTip, newTipMemory, observeTips, tipOf, tipsEnabled, TIP_GAP_TICKS, TIP_SHOW_TICKS } from '../src/render/hud-tips';
import { setLanguage } from '../src/i18n';
import { DEFAULT_BINDINGS, type ControlBindings } from '../src/ui/remap/bindings';
import { actionKeys } from '../src/ui/remap/labels';
import { human, humanCar, quickRace, skipCountdown, syntheticTrack } from './helpers';

setLanguage('pt');

const none = (): PlayerInput[] => [NEUTRAL_INPUT, NEUTRAL_INPUT];

/** Reta de 150 segmentos, curva forte de 40 (força 6), reta, outra curva forte e reta: a Copacabana de hoje é suave demais para pedir freio. */
const STRONG_TRACK = syntheticTrack([
  { op: 'straight', length: 150 }, { op: 'curve', length: 40, curve: 6 }, { op: 'straight', length: 150 }, { op: 'curve', length: 40, curve: -6 }, { op: 'straight', length: 100 },
]);

/** O 1º segmento em que a curva já passa do limiar de frear (a curva entra em rampa: o começo do trecho é reto). */
const ENTRY = STRONG_TRACK.segments.findIndex((sg) => Math.abs(sg.curve) >= AI_BRAKE_CURVE);

function setup(players = 2, track: Track = STRONG_TRACK): { state: RaceState; track: Track } {
  return quickRace({ track, humans: Array.from({ length: players }, (_, i) => human(i)), totalCars: players });
}

/** Roda a observação sobre o estado como está (sem avançar a simulação). */
function look(mem: ReturnType<typeof newTipMemory>, state: RaceState, track: Track, inputs: PlayerInput[] = none()): void {
  state.events = state.events ?? [];
  observeTips(mem, state, track, inputs);
}

describe('quando as dicas valem', () => {
  it('só na 1ª corrida (racesRun 0), de copa ou Expedição, no sofá', () => {
    expect(tipsEnabled({ racesRun: 0 }, 'career', false)).toBe(true);
    expect(tipsEnabled({ racesRun: 0 }, 'cup', false)).toBe(true);
    expect(tipsEnabled({ racesRun: 1 }, 'career', false)).toBe(false);
    expect(tipsEnabled({ racesRun: 0 }, 'career', true)).toBe(false);
    expect(tipsEnabled({ racesRun: 0 }, 'quick', false)).toBe(false);
    expect(tipsEnabled({ racesRun: 0 }, 'timetrial', false)).toBe(false);
  });
});

describe('largada', () => {
  it('na contagem, a dica ensina a largada; decidida a largada, some e não volta', () => {
    const { state, track } = setup(1);
    const mem = newTipMemory();
    look(mem, state, track, [NEUTRAL_INPUT]);
    expect(tipOf(mem, 0)).toMatchObject({ id: 'launch', actions: ['throttle'] });
    for (let i = 0; i < COUNTDOWN_TICKS + 10; i++) { stepRace(state, track, [NEUTRAL_INPUT]); look(mem, state, track, [NEUTRAL_INPUT]); }
    expect(humanCar(state, 0).launch).not.toBe(0);
    expect(tipOf(mem, 0)).toBeNull();
  });

  it('o texto diz para apertar no JÁ (não segurar desde o começo), com a tecla do assento', () => {
    const { state, track } = setup(2);
    const mem = newTipMemory();
    look(mem, state, track);
    const d1 = describeTip(tipOf(mem, 0)!, 'kb1', DEFAULT_BINDINGS);
    const d2 = describeTip(tipOf(mem, 1)!, 'kb2', DEFAULT_BINDINGS);
    expect(d1.text).toContain('JÁ');
    expect(d1.keys).toEqual([{ label: 'Acelerar', keys: '↑' }]);
    expect(d2.keys).toEqual([{ label: 'Acelerar', keys: 'W' }]);
  });
});

describe('frear antes da curva forte', () => {
  it('rápido demais, olhando uma curva forte à frente e sem frear: dica; frear a encerra e não volta', () => {
    const { state, track } = setup(1);
    skipCountdown(state, track);
    const i = ENTRY;
    const car = humanCar(state, 0);
    Object.assign(car, { z: (i - 8) * SEGMENT_LENGTH, x: 0, speed: carStats(car).topSpeed * 0.95 });
    const mem = newTipMemory();
    look(mem, state, track, [NEUTRAL_INPUT]);
    expect(tipOf(mem, 0)).toMatchObject({ id: 'brake', actions: ['brake'] });
    state.tick += 1;
    look(mem, state, track, [{ ...NEUTRAL_INPUT, brake: true }]);
    expect(tipOf(mem, 0)).toBeNull();
    state.tick += TIP_GAP_TICKS + 5;
    look(mem, state, track, [NEUTRAL_INPUT]);
    expect(tipOf(mem, 0)).toBeNull(); // quem já freou uma vez aprendeu
  });

  it('devagar o bastante, ou já frenando, não recebe a dica', () => {
    const { state, track } = setup(1);
    skipCountdown(state, track);
    const i = ENTRY;
    const car = humanCar(state, 0);
    Object.assign(car, { z: (i - 8) * SEGMENT_LENGTH, x: 0, speed: carStats(car).topSpeed * 0.3 });
    const mem = newTipMemory();
    look(mem, state, track, [NEUTRAL_INPUT]);
    expect(tipOf(mem, 0)).toBeNull();
    car.speed = carStats(car).topSpeed * 0.95;
    look(mem, state, track, [{ ...NEUTRAL_INPUT, brake: true }]);
    expect(tipOf(mem, 0)).toBeNull();
  });
});

describe('derrapar', () => {
  it('dentro de uma curva forte longa, sem derrapar: dica; derrapando, some e não volta', () => {
    const { state, track } = setup(1);
    skipCountdown(state, track);
    const i = ENTRY;
    const car = humanCar(state, 0);
    // Já na velocidade que a curva segura (senão a dica de frear vem antes): o que falta é derrapar.
    Object.assign(car, { z: (i + 4) * SEGMENT_LENGTH, x: 0, speed: carStats(car).topSpeed * 0.47 });
    const mem = newTipMemory();
    look(mem, state, track, [NEUTRAL_INPUT]);
    expect(tipOf(mem, 0)).toMatchObject({ id: 'drift', actions: ['left', 'right', 'drift'] });
    car.driftDir = 1;
    look(mem, state, track, [NEUTRAL_INPUT]);
    expect(tipOf(mem, 0)).toBeNull();
    car.driftDir = 0;
    state.tick += TIP_GAP_TICKS + 5;
    look(mem, state, track, [NEUTRAL_INPUT]);
    expect(tipOf(mem, 0)).toBeNull();
  });
});

describe('nitro', () => {
  it('com a barra cheia numa reta e o nitro nunca usado: a dica diz como a barra enche; usar encerra', () => {
    const { state, track } = setup(1);
    skipCountdown(state, track);
    state.tick += 6 * TICK_RATE;
    const car = humanCar(state, 0);
    Object.assign(car, { z: 5 * SEGMENT_LENGTH, x: 0, speed: carStats(car).topSpeed * 0.7, nitroMeter: NITRO_CHARGE_COST });
    expect(Math.abs(track.segments[5].curve)).toBeLessThan(AI_BRAKE_CURVE);
    const mem = newTipMemory();
    look(mem, state, track, [NEUTRAL_INPUT]);
    expect(tipOf(mem, 0)).toMatchObject({ id: 'nitro', actions: ['nitro'] });
    const d = describeTip(tipOf(mem, 0)!, 'kb1', DEFAULT_BINDINGS);
    expect(d.text).toContain('enche');
    car.nitroTicks = 30;
    look(mem, state, track, [NEUTRAL_INPUT]);
    expect(tipOf(mem, 0)).toBeNull();
  });
});

describe('box', () => {
  it('o aviso de pouco combustível acende a seta do box (à direita) até entrar nele', () => {
    const { state, track } = setup(1);
    skipCountdown(state, track);
    const car = humanCar(state, 0);
    const mem = newTipMemory();
    state.events = [{ type: 'fuel_low', carId: car.id }];
    observeTips(mem, state, track, [NEUTRAL_INPUT]);
    expect(tipOf(mem, 0)).toMatchObject({ id: 'pit', arrow: true });
    const d = describeTip(tipOf(mem, 0)!, 'kb1', DEFAULT_BINDINGS);
    expect(d.arrow).toBe(true);
    expect(d.keys.map((k) => k.label)).toEqual(['Virar à direita', 'Frear']);
    state.events = [];
    car.inPit = true;
    observeTips(mem, state, track, [NEUTRAL_INPUT]);
    expect(tipOf(mem, 0)).toBeNull();
  });

  it('o box tem prioridade sobre as outras dicas', () => {
    const { state, track } = setup(1);
    skipCountdown(state, track);
    const i = ENTRY;
    const car = humanCar(state, 0);
    Object.assign(car, { z: (i - 8) * SEGMENT_LENGTH, x: 0, speed: carStats(car).topSpeed * 0.95 });
    state.events = [{ type: 'fuel_low', carId: car.id }];
    const mem = newTipMemory();
    observeTips(mem, state, track, [NEUTRAL_INPUT]);
    expect(tipOf(mem, 0)?.id).toBe('pit');
  });
});

describe('ritmo', () => {
  it('uma dica some sozinha depois de TIP_SHOW_TICKS, e a seguinte espera TIP_GAP_TICKS', () => {
    const { state, track } = setup(1);
    skipCountdown(state, track);
    state.tick += 6 * TICK_RATE;
    const car = humanCar(state, 0);
    Object.assign(car, { z: 5 * SEGMENT_LENGTH, x: 0, speed: carStats(car).topSpeed * 0.7, nitroMeter: NITRO_CHARGE_COST });
    const mem = newTipMemory();
    look(mem, state, track, [NEUTRAL_INPUT]);
    expect(tipOf(mem, 0)?.id).toBe('nitro');
    state.tick += TIP_SHOW_TICKS - 1;
    look(mem, state, track, [NEUTRAL_INPUT]);
    expect(tipOf(mem, 0)?.id).toBe('nitro');
    state.tick += 2;
    look(mem, state, track, [NEUTRAL_INPUT]);
    expect(tipOf(mem, 0)).toBeNull();
    state.events = [{ type: 'fuel_low', carId: car.id }];
    look(mem, state, track, [NEUTRAL_INPUT]);
    expect(tipOf(mem, 0)).toBeNull(); // dentro do intervalo
    state.events = [];
    state.tick += TIP_GAP_TICKS;
    look(mem, state, track, [NEUTRAL_INPUT]);
    expect(tipOf(mem, 0)?.id).toBe('pit');
  });

  it('cada assento tem a sua dica (o jogador 2 pode estar aprendendo outra coisa)', () => {
    const { state, track } = setup(2);
    skipCountdown(state, track);
    state.tick += 6 * TICK_RATE;
    const [a, b] = [humanCar(state, 0), humanCar(state, 1)];
    Object.assign(a, { z: 5 * SEGMENT_LENGTH, x: 0, speed: carStats(a).topSpeed * 0.7, nitroMeter: NITRO_CHARGE_COST });
    Object.assign(b, { z: 340 * SEGMENT_LENGTH, x: 0, speed: carStats(b).topSpeed * 0.2, nitroMeter: 0 });
    const mem = newTipMemory();
    look(mem, state, track);
    expect(tipOf(mem, 0)?.id).toBe('nitro');
    expect(tipOf(mem, 1)).toBeNull();
  });
});

describe('teclas reais (remap/labels.ts)', () => {
  it('teclado 1 e 2, controle Xbox e PlayStation, remapeamento e layout do sistema', () => {
    expect(actionKeys('kb1', 'throttle', DEFAULT_BINDINGS)).toBe('↑');
    expect(actionKeys('gp0', 'drift', DEFAULT_BINDINGS, 'Xbox Wireless Controller')).toBe('RB');
    expect(actionKeys('gp1', 'drift', DEFAULT_BINDINGS, 'DualSense Wireless Controller')).toBe('R1');
    const controls = JSON.parse(JSON.stringify(DEFAULT_BINDINGS)) as ControlBindings;
    controls.kb2.drift = ['Semicolon'];
    expect(actionKeys('kb2', 'drift', controls, '', new Map([['Semicolon', 'ç']]))).toBe('Ç');
    controls.kb1.nitro = ['KeyR'];
    const nitro = describeTip({ id: 'nitro', actions: ['nitro'], arrow: false, near: false }, 'kb1', controls);
    expect(nitro.keys).toEqual([{ label: 'Nitro', keys: 'R' }]);
  });
});
