// M6 (b): o relógio do período no renderizador (render/period-clock.ts). A cada quadro: a fração da corrida do líder entre os carros da tela → o `t` da transição → a paleta ao
// vivo, só quando o `t` andou o bastante (1/512), e nunca para trás. O primeiro quadro, o menu e a pista de noite ficam no período da pista.
import { describe, expect, it } from 'vitest';
import { getTrack } from '../src/core/track';
import { palette } from '../src/render/palette';
import { PeriodClock } from '../src/render/period-clock';

const track = getTrack('copacabana');
const laps = 3;
const at = (lap: number, z: number): number => (lap - 1) * track.length + z;

describe('M6 (b): o relógio do período', () => {
  it('o primeiro quadro é o período da pista e uma pista de noite nunca anda', () => {
    const c = new PeriodClock();
    const f = c.step(track.def.scenery, track.def.timeOfDay, laps, track.length, [at(1, 0)]);
    expect(f.changed).toBe(true); // o primeiro quadro entrega a paleta da pista uma vez
    expect(f.live.t).toBe(0); expect(f.live.p).toBe(palette(track.def.scenery, track.def.timeOfDay));
    expect(c.step(track.def.scenery, track.def.timeOfDay, laps, track.length, [at(1, 4000)]).changed).toBe(false);
    const night = new PeriodClock();
    for (const z of [0, 0.5, 1]) { const g = night.step('city_night', 'night', 3, 1000, [z * 3000]); expect(g.live.t).toBe(0); }
    expect(night.step('city_night', 'night', 3, 1000, [3000]).changed).toBe(false);
  });

  it('anda só na última volta, até 1 na bandeirada, e só avisa quando o t andou 1/512 (no máximo ~512 avisos na corrida inteira)', () => {
    const c = new PeriodClock();
    c.step('coast', 'day', laps, track.length, [0]);
    let changes = 0; let last = 0;
    for (let i = 0; i <= 30000; i++) {
      const progress = (i / 30000) * laps * track.length;
      const f = c.step('coast', 'day', laps, track.length, [progress]);
      if (progress < (2 / 3) * laps * track.length - 1) expect(f.live.t, `i=${i}`).toBe(0);
      expect(f.live.t).toBeGreaterThanOrEqual(last); last = f.live.t;
      if (f.changed) changes++;
    }
    expect(last).toBe(1);
    expect(changes).toBeGreaterThan(400); expect(changes).toBeLessThanOrEqual(520);
  });

  it('o líder de mais de uma tela conta, e o relógio não volta numa pequena regressão (respawn, troca de líder)', () => {
    const c = new PeriodClock();
    c.step('coast', 'day', laps, track.length, [at(3, 1000), at(1, 50)]);
    const a = c.step('coast', 'day', laps, track.length, [at(3, 4000), at(1, 80)]).live.t;
    expect(a).toBeGreaterThan(0);
    const b = c.step('coast', 'day', laps, track.length, [at(3, 3900), at(1, 80)]).live.t; // o líder recuou 100 unidades (respawn)
    expect(b).toBe(a);
  });

  it('corrida nova (a fração cai muito) zera, e o menu (`reset`) volta ao período da pista na hora', () => {
    const c = new PeriodClock();
    c.step('coast', 'day', laps, track.length, [at(3, track.length)]);
    const f = c.step('coast', 'day', laps, track.length, [at(1, 0)]);
    expect(f.live.t).toBe(0); expect(f.changed).toBe(true);
    c.step('coast', 'day', laps, track.length, [at(3, track.length / 2)]);
    const g = c.idle('coast', 'day', laps);
    expect(g.live.t).toBe(0); expect(g.changed).toBe(true);
    expect(c.idle('coast', 'day', laps).changed).toBe(false);
  });
});
