// M5: as bordas do estado que disparam efeitos (src/render/fx/cues.ts). Puro. O núcleo não emite evento para o render (state.events vale
// só para o último tick, e um quadro de tela cobre vários): as transições saem do estado, por carro, como `cars/motion.ts` faz.
import { describe, expect, it } from 'vitest';
import { COLLISION_COOLDOWN_TICKS, DRIFT_BOOST_TICKS, LAUNCH_PERFECT } from '../src/core/constants';
import type { RaceState } from '../src/core/types';
import { newCueMemory, observeCues, type FxCue } from '../src/render/fx/cues';
import { human, quickRace } from './helpers';

function setup(): { state: RaceState; mem: ReturnType<typeof newCueMemory>; seen: () => FxCue[] } {
  const { state } = quickRace({ humans: [human(0), human(1, 1)], totalCars: 6 });
  const mem = newCueMemory();
  observeCues(mem, state, []); // o primeiro quadro só guarda o que já estava
  return { state, mem, seen: () => observeCues(mem, state, []).map((c) => ({ ...c })) };
}

describe('bordas do estado (M5)', () => {
  it('o primeiro quadro não dispara nada, mesmo com o carro já em nitro, batido ou derrapando', () => {
    const { state } = quickRace({ humans: [human(0)], totalCars: 4 });
    state.phase = 'racing';
    state.cars[0].nitroTicks = 80; state.cars[0].collisionCooldown = 15; state.cars[0].driftBoostTicks = 40;
    expect(observeCues(newCueMemory(), state, [])).toEqual([]);
  });

  it('largada: a borda contagem → corrida dispara um "go" por humano, com a largada-foguete marcada', () => {
    const { state, seen } = setup();
    expect(state.phase).toBe('countdown');
    const [h0, h1] = state.cars.filter((c) => c.seat >= 0);
    h1.launch = LAUNCH_PERFECT;
    state.phase = 'racing';
    const cues = seen();
    const gos = cues.filter((c) => c.kind === 'go');
    expect(gos).toHaveLength(2); // só os dois humanos, nenhum da IA
    expect(gos.find((c) => c.kind === 'go' && c.car === h0.id)).toMatchObject({ perfect: false });
    expect(gos.find((c) => c.kind === 'go' && c.car === h1.id)).toMatchObject({ perfect: true });
    expect(seen()).toEqual([]); // e só uma vez
  });

  it('o nitro dispara na subida de nitroTicks, uma vez por engate', () => {
    const { state, seen } = setup();
    state.phase = 'racing'; seen();
    const c = state.cars[0];
    c.nitroTicks = 150;
    expect(seen()).toEqual([{ kind: 'nitro', car: c.id }]);
    c.nitroTicks = 140; expect(seen()).toEqual([]);
    c.nitroTicks = 0; expect(seen()).toEqual([]);
    c.nitroTicks = 150; expect(seen()).toEqual([{ kind: 'nitro', car: c.id }]);
  });

  it('o arranque de nitro da largada-foguete é só o "go" (sem anel de nitro por cima)', () => {
    const { state, seen } = setup();
    const c = state.cars[0];
    c.launch = LAUNCH_PERFECT; c.nitroTicks = 90;
    state.phase = 'racing';
    const cues = seen();
    expect(cues.filter((x) => x.kind === 'nitro')).toEqual([]);
    expect(cues.filter((x) => x.kind === 'go')).toHaveLength(2);
  });

  it('a batida sai da subida do collisionCooldown a partir de 0, mesmo se o quadro de tela cobriu vários ticks', () => {
    const { state, seen } = setup();
    state.phase = 'racing'; seen();
    const c = state.cars[0];
    c.speed = 5000; seen();
    // 3 ticks de núcleo no mesmo quadro de tela: o cooldown já desceu de 20 para 17 (a regra antiga exigia >= 19 e perdia a batida).
    c.speed = 3000; c.collisionCooldown = COLLISION_COOLDOWN_TICKS - 3;
    const cues = seen();
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ kind: 'hit', car: c.id });
    expect((cues[0] as { drop: number }).drop).toBeCloseTo(2000 / c.stats.topSpeed, 6);
    c.collisionCooldown = COLLISION_COOLDOWN_TICKS - 4; expect(seen()).toEqual([]);
    c.collisionCooldown = 0; expect(seen()).toEqual([]);
  });

  it('o impulso da derrapagem dispara com o nível 1, 2 ou 3 lido do tamanho dele', () => {
    const { state, seen } = setup();
    state.phase = 'racing'; seen();
    const c = state.cars[0];
    const cases: Array<[number, number]> = [[DRIFT_BOOST_TICKS[0], 1], [DRIFT_BOOST_TICKS[1] - 2, 2], [DRIFT_BOOST_TICKS[2], 3], [DRIFT_BOOST_TICKS[0] - 1, 1], [DRIFT_BOOST_TICKS[2] - 3, 3]];
    for (const [ticks, level] of cases) {
      c.driftBoostTicks = 0; seen();
      c.driftBoostTicks = ticks;
      expect(seen(), `${ticks} ticks`).toEqual([{ kind: 'boost', car: c.id, level }]);
    }
  });

  it('corrida nova (tick recuado, outra lista de carros ou voltou à contagem) recomeça sem disparar', () => {
    const { state, mem } = setup();
    state.phase = 'racing'; state.tick = 500;
    observeCues(mem, state, []);
    state.cars[0].nitroTicks = 100;
    const novo = quickRace({ humans: [human(0)], totalCars: 3 }).state;
    novo.cars[0].nitroTicks = 100; novo.cars[0].collisionCooldown = 12;
    expect(observeCues(mem, novo, [])).toEqual([]);
    state.tick = 10; state.phase = 'countdown';
    expect(observeCues(mem, state, [])).toEqual([]);
  });
});
