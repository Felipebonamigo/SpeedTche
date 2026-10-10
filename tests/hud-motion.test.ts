// Movimento do HUD (src/render/hud-motion.ts, onda L, L5): a mola da posição, o selo "+N"/"−N" da ultrapassagem, a
// janela da faixa ÚLTIMA VOLTA e a persistência do ícone de vácuo. Tudo puro: o HUD só pede "como está agora" a cada
// quadro, e estes testes avançam o relógio à mão.
import { describe, expect, it } from 'vitest';
import {
  BADGE_SECONDS, BAND_SECONDS, DRAFT_HOLD_SECONDS, GRID_SETTLE_TICKS, newDraftHold, newLastLapBand, newPositionMotion, POSITION_IMPULSE,
  springStep, stepDraft, stepLastLapBand, stepPositionMotion, type PositionInput, type SpringState,
} from '../src/render/hud-motion';

const FRAME = 1 / 60;

describe('mola', () => {
  it('depois do impulso estoura acima de 1 e assenta em 1 em até 1,5 s', () => {
    const s: SpringState = { x: 1, v: POSITION_IMPULSE };
    let peak = 1;
    for (let i = 0; i < 90; i++) { springStep(s, 1, FRAME); peak = Math.max(peak, s.x); }
    expect(peak).toBeGreaterThan(1.05);
    expect(Math.abs(s.x - 1)).toBeLessThan(0.01);
    expect(Math.abs(s.v)).toBeLessThan(0.05);
  });

  it('é determinística: o mesmo dt dá a mesma trajetória', () => {
    const a: SpringState = { x: 1, v: POSITION_IMPULSE }; const b: SpringState = { x: 1, v: POSITION_IMPULSE };
    for (let i = 0; i < 40; i++) { springStep(a, 1, FRAME); springStep(b, 1, FRAME); }
    expect(a).toEqual(b);
  });

  it('dt 0 e quadro perdido de 0,25 s não dão NaN nem explodem', () => {
    const s: SpringState = { x: 1, v: POSITION_IMPULSE };
    springStep(s, 1, 0);
    expect(s).toEqual({ x: 1, v: POSITION_IMPULSE });
    for (let i = 0; i < 20; i++) springStep(s, 1, 0.25);
    expect(Number.isFinite(s.x) && Number.isFinite(s.v)).toBe(true);
    expect(Math.abs(s.x)).toBeLessThan(3);
  });
});

/** Um quadro de corrida a 60 Hz: tick e relógio andam juntos. */
function driver() {
  const m = newPositionMotion();
  let tick = 600; let time = 10;
  const input = (position: number, over: Partial<PositionInput> = {}): PositionInput => ({ position, tick, startTick: 0, racing: true, finished: false, time, ...over });
  return {
    m,
    look: (position: number, over: Partial<PositionInput> = {}) => stepPositionMotion(m, input(position, over)),
    advance: (seconds: number, position: number, over: Partial<PositionInput> = {}) => {
      let last = stepPositionMotion(m, input(position, over));
      for (let i = 0; i < Math.round(seconds * 60); i++) { tick++; time += FRAME; last = stepPositionMotion(m, input(position, over)); }
      return last;
    },
  };
}

describe('posição: ultrapassagem e perda', () => {
  it('de 5º para 3º: "+2", tom de ganho, e a mola estoura o tamanho', () => {
    const d = driver();
    d.look(5);
    const first = d.advance(0.1, 3);
    expect(first.badge).toBe('+2');
    expect(first.tone).toBe('gain');
    expect(Math.max(first.scale, d.advance(0.1, 3).scale)).toBeGreaterThan(1.05);
  });

  it('de 3º para 4º: "−1" (com o sinal, a cor não carrega a informação sozinha) e tom de perda', () => {
    const d = driver();
    d.look(3);
    const l = d.advance(0.1, 4);
    expect(l.badge).toBe('−1');
    expect(l.tone).toBe('loss');
  });

  it('duas ultrapassagens seguidas dentro da janela somam: "+2"', () => {
    const d = driver();
    d.look(5);
    d.advance(0.3, 4);
    expect(d.advance(0.1, 3).badge).toBe('+2');
  });

  it('sem mudança de posição não há selo nem tom', () => {
    const d = driver();
    d.look(4);
    const l = d.advance(1, 4);
    expect(l.badge).toBe('');
    expect(l.tone).toBe('none');
    expect(l.scale).toBeCloseTo(1, 3);
  });

  it('o selo some depois de BADGE_SECONDS e a cor volta ao normal', () => {
    const d = driver();
    d.look(5);
    expect(d.advance(0.05, 4).tone).toBe('gain');
    const later = d.advance(BADGE_SECONDS + 0.2, 4);
    expect(later.tone).toBe('none');
    expect(later.badge).toBe('');
    expect(later.badgeOpacity).toBe(0);
  });

  it('o selo some devagar no fim (opacidade cai antes de zerar)', () => {
    const d = driver();
    d.look(5);
    d.advance(0.05, 4);
    const mid = d.advance(BADGE_SECONDS - 0.25, 4);
    expect(mid.badge).toBe('+1');
    expect(mid.badgeOpacity).toBeGreaterThan(0);
    expect(mid.badgeOpacity).toBeLessThan(1);
  });

  it('não conta durante a contagem, depois de terminar nem no 1º segundo (a grade se ajeita)', () => {
    const a = driver(); a.look(5, { racing: false });
    expect(a.advance(0.1, 3, { racing: false }).tone).toBe('none');
    const b = driver(); b.look(5, { finished: true });
    expect(b.advance(0.1, 3, { finished: true }).tone).toBe('none');
    const c = driver(); c.look(5, { tick: 10, startTick: 0 });
    expect(c.look(3, { tick: 10 + GRID_SETTLE_TICKS - 20, startTick: 0 }).tone).toBe('none');
  });

  it('tick que volta atrás (corrida nova) zera a memória: nada de selo da corrida anterior', () => {
    const d = driver();
    d.look(5);
    expect(d.advance(0.1, 3).badge).toBe('+2');
    const restarted = stepPositionMotion(d.m, { position: 8, tick: 3, startTick: 0, racing: false, finished: false, time: 11 });
    expect(restarted.badge).toBe('');
    expect(restarted.tone).toBe('none');
  });
});

describe('faixa ÚLTIMA VOLTA', () => {
  const at = (lap: number, over: Partial<Parameters<typeof stepLastLapBand>[1]> = {}) => ({ lap, laps: 3, finished: false, racing: true, tick: 100, time: 5, ...over });

  it('dispara só na transição para a última volta e dura BAND_SECONDS', () => {
    const b = newLastLapBand();
    expect(stepLastLapBand(b, at(1))).toBe(false);
    expect(stepLastLapBand(b, at(2, { time: 6 }))).toBe(false);
    expect(stepLastLapBand(b, at(3, { time: 7 }))).toBe(true);
    expect(stepLastLapBand(b, at(3, { time: 7 + BAND_SECONDS - 0.05 }))).toBe(true);
    expect(stepLastLapBand(b, at(3, { time: 7 + BAND_SECONDS + 0.05 }))).toBe(false);
    // e não volta sozinha
    expect(stepLastLapBand(b, at(3, { time: 20 }))).toBe(false);
  });

  it('numa corrida de 1 volta (a corrida inteira é a última) não dispara', () => {
    const b = newLastLapBand();
    expect(stepLastLapBand(b, at(1, { laps: 1 }))).toBe(false);
    expect(stepLastLapBand(b, at(1, { laps: 1, time: 9 }))).toBe(false);
  });

  it('quem abre o HUD já na última volta (reconexão) não leva a faixa; o carro terminado a esconde', () => {
    const b = newLastLapBand();
    expect(stepLastLapBand(b, at(3))).toBe(false);
    const c = newLastLapBand();
    stepLastLapBand(c, at(2));
    expect(stepLastLapBand(c, at(3, { finished: true, time: 6 }))).toBe(false);
  });

  it('tick que volta atrás (corrida nova) rearma a faixa', () => {
    const b = newLastLapBand();
    stepLastLapBand(b, at(2)); expect(stepLastLapBand(b, at(3, { time: 6, tick: 500 }))).toBe(true);
    stepLastLapBand(b, at(1, { time: 30, tick: 5 }));
    stepLastLapBand(b, at(2, { time: 31, tick: 900 }));
    expect(stepLastLapBand(b, at(3, { time: 32, tick: 1900 }))).toBe(true);
  });
});

describe('ícone de vácuo', () => {
  it('fica ligado DRAFT_HOLD_SECONDS depois do último quadro verdadeiro e desliga depois', () => {
    const h = newDraftHold();
    expect(stepDraft(h, false, 1)).toBe(false);
    expect(stepDraft(h, true, 2)).toBe(true);
    expect(stepDraft(h, false, 2 + DRAFT_HOLD_SECONDS - 0.05)).toBe(true);
    expect(stepDraft(h, false, 2 + DRAFT_HOLD_SECONDS + 0.05)).toBe(false);
  });
});
