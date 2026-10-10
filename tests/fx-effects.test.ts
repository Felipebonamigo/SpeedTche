// M5: o `Effects` inteiro (effects.ts) ligando os emissores puros ao lote de traços, nas condições do jogo: derrapagem nas 3 cores, batida num quadro
// de vários ticks, escape do nitro, reduzir efeitos e os degraus de qualidade. Roda no Node.
import { describe, expect, it } from 'vitest';
import { DRIFT_LEVEL_TICKS } from '../src/core/constants';
import { getTrack } from '../src/core/track';
import type { RaceState } from '../src/core/types';
import type { Quality, RenderFrame } from '../src/game/contracts';
import { Effects } from '../src/render/effects';
import type { Streaks } from '../src/render/fx/streaks';
import { buildRoadFrame } from '../src/render/roadframe';
import { human, quickRace } from './helpers';

interface Scene { state: RaceState; frame: RenderFrame; fx: Effects; idx: number }

function scene(quality: Quality = 'high', reduce = false): Scene {
  const track = getTrack('copacabana');
  const { state } = quickRace({ humans: [human(0)], totalCars: 4, track });
  state.phase = 'racing'; state.tick = 600;
  const idx = state.cars.findIndex((c) => c.seat === 0);
  for (const c of state.cars) if (c !== state.cars[idx]) c.z = (state.cars[idx].z + track.length / 2) % track.length; // os outros longe
  const frame = {
    state, track, time: 10, paused: false, coop: false, showHud: false,
    viewports: [{ seat: 0, carIndex: idx, color: '#fff', name: 'P1', messages: [] }],
    options: { quality, showMinimap: false, screenShake: true, reduceEffects: reduce, palette: 'default' },
  } as unknown as RenderFrame;
  const fx = new Effects();
  fx.update(frame); // o primeiro quadro só guarda o que já estava
  return { state, frame, fx, idx };
}

const streaksOf = (fx: Effects): Streaks => (fx as unknown as { streaks: Streaks }).streaks;

/** Anda `n` quadros de 1/60 s com `mutate` antes de cada um; devolve os traços do viewport no fim (passa por `pose`). */
function frames(s: Scene, n: number, mutate: (i: number) => void = () => undefined) {
  const car = s.state.cars[s.idx];
  let peak = 0; let sparksPeak = 0; const rgb: number[][] = [];
  for (let i = 0; i < n; i++) {
    mutate(i);
    s.frame.time += 1 / 60;
    s.fx.update(s.frame);
    const rf = buildRoadFrame(s.frame.track, car.z, 30, 200);
    s.fx.pose(rf, s.frame.track, 600, 0);
    const st = streaksOf(s.fx);
    peak = Math.max(peak, st.count);
    sparksPeak = Math.max(sparksPeak, s.fx.counts().sparks);
    const col = st.mesh.geometry.getAttribute('aColor');
    for (let q = 0; q < st.count; q++) rgb.push([col.getX(q * 4), col.getY(q * 4), col.getZ(q * 4)]);
  }
  return { peak, sparksPeak, rgb, visible: streaksOf(s.fx).mesh.visible };
}

const drift = (s: Scene, level: number) => {
  const c = s.state.cars[s.idx];
  c.speed = 5000; c.driftDir = 1; c.driftTicks = 40; c.driftCharge = level === 0 ? 0 : DRIFT_LEVEL_TICKS[level - 1];
};
const dominant = (rgb: number[][]): number[] => rgb.reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0]).map((v) => v / Math.max(1, rgb.length));

describe('faíscas das rodas nas 3 cores (Effects)', () => {
  it('derrapando com carga azul, laranja e roxa, as faíscas saem na cor do nível', () => {
    const cores: Array<(m: number[]) => boolean> = [
      (m) => m[2] > m[0] * 2 && m[2] > m[1], // azul
      (m) => m[0] > m[2] * 3 && m[0] > m[1], // laranja
      (m) => m[0] > m[1] * 2 && m[2] > m[1] * 2, // roxa
    ];
    [1, 2, 3].forEach((level, i) => {
      const s = scene(); drift(s, level);
      const r = frames(s, 30, () => drift(s, level));
      expect(r.peak, `nível ${level}`).toBeGreaterThan(3);
      expect(r.visible).toBe(true);
      expect(cores[i](dominant(r.rgb)), `nível ${level}: ${dominant(r.rgb).map((v) => v.toFixed(2))}`).toBe(true);
    });
  });

  it('sem derrapar não há faísca; reduzir efeitos também não solta nenhuma', () => {
    const s = scene(); s.state.cars[s.idx].speed = 5000;
    expect(frames(s, 30, () => { s.state.cars[s.idx].speed = 5000; }).peak).toBe(0);
    const r = scene('high', true); drift(r, 3);
    expect(frames(r, 30, () => drift(r, 3)).peak).toBe(0);
  });

  it('o degrau de qualidade escala a emissão: o Baixo solta menos que o Alto', () => {
    // o pool é o mesmo em todos os degraus: compara as faíscas vivas depois de 2 s
    const vivas = (q: Quality) => { const s = scene(q); drift(s, 3); frames(s, 120, () => drift(s, 3)); return (s.fx as unknown as { sparks: { alive(): number } }).sparks.alive(); };
    expect(vivas('low')).toBeLessThan(vivas('high'));
    expect(vivas('low')).toBeGreaterThan(0);
  });

  it('o impulso da derrapagem solta uma rajada na cor do nível', () => {
    const s = scene();
    const c = s.state.cars[s.idx]; c.speed = 5000;
    const r = frames(s, 3, (i) => { if (i === 1) c.driftBoostTicks = 88; }); // borda: 0 → 88 do nível 3 (2 ticks de folga)
    expect(r.peak).toBeGreaterThanOrEqual(10);
    const m = dominant(r.rgb);
    expect(m[0] > m[1] * 2 && m[2] > m[1] * 2, `roxa: ${m.map((v) => v.toFixed(2))}`).toBe(true);
  });
});

describe('faíscas da batida e do escape (Effects)', () => {
  it('a batida solta a rajada mesmo quando o quadro de tela cobre 3 ticks (cooldown já em 17)', () => {
    const s = scene(); const c = s.state.cars[s.idx]; c.speed = 5000;
    const r = frames(s, 2, (i) => { if (i === 1) { c.speed = 3000; c.collisionCooldown = 17; } });
    expect(r.peak).toBeGreaterThanOrEqual(20);
    expect((s.fx as unknown as { shakeAmp: Float32Array }).shakeAmp[0]).toBeGreaterThan(0.3); // e o tremor da batida
  });

  it('reduzir efeitos: a batida não solta faíscas (o tremor da batida segue a opção de tremor)', () => {
    const s = scene('high', true); const c = s.state.cars[s.idx]; c.speed = 5000;
    expect(frames(s, 2, (i) => { if (i === 1) { c.speed = 3000; c.collisionCooldown = 20; } }).peak).toBe(0);
  });

  it('o nitro solta o rastro de traços azul-brancos; sem nitro, nada; reduzir efeitos, nada', () => {
    // (conta as faíscas vivas: a 6000 u/s o carro já passa de 85% da máxima e as linhas de velocidade também entram no lote)
    const s = scene(); const c = s.state.cars[s.idx]; c.speed = 6000;
    const r = frames(s, 40, () => { c.nitroTicks = 100; c.speed = 6000; });
    expect(r.sparksPeak).toBeGreaterThan(0);
    const q = scene(); q.state.cars[q.idx].speed = 6000;
    expect(frames(q, 40, () => { q.state.cars[q.idx].speed = 6000; }).sparksPeak).toBe(0);
    const red = scene('high', true); const rc = red.state.cars[red.idx];
    expect(frames(red, 40, () => { rc.nitroTicks = 100; rc.speed = 6000; }).sparksPeak).toBe(0);
  });

  it('a cor do rastro do nitro é azul-branca (traços com mais azul que vermelho)', () => {
    const s = scene('high'); const c = s.state.cars[s.idx];
    // o nitro acende metade das linhas de velocidade (azul 1,1) além do rastro (azul 1,8): fica só o que tem azul acima de 1,5, o rastro
    c.speed = 1200;
    const r = frames(s, 40, () => { c.nitroTicks = 100; c.speed = 1200; });
    const rgb = r.rgb.filter((v) => v[2] > 1.5);
    expect(rgb.length).toBeGreaterThan(0);
    const m = dominant(rgb); expect(m[2]).toBeGreaterThan(m[0]);
  });

  it('pausado não emite nem anda', () => {
    const s = scene(); const c = s.state.cars[s.idx]; drift(s, 3);
    s.frame.paused = true;
    expect(frames(s, 30, () => drift(s, 3)).peak).toBe(0);
    void c;
  });
});
