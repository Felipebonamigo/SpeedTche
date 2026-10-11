// Guarda do visual do carro (N3): NENHUM CarLook muda a corrida. O look viaja nos humanos da sessão e do online, mas é tirado antes da
// `RaceConfig` (`withoutLook`); o núcleo nunca o lê. Estes testes rodam a corrida, tick a tick, com e sem look em todos os humanos (2 e 4,
// 25 looks sorteados do catálogo) e exigem o mesmo `hashRace` e o mesmo `serializeRace`; e conferem que o estado e a config não carregam
// nenhuma chave do look. É uma guarda: passa antes e depois da frente, e quebra se alguém passar a ler cosmético no núcleo.
import { describe, expect, it } from 'vitest';
import { CARS } from '../src/core/data/cars';
import { hashRace, serializeRace } from '../src/core/serialize';
import { createRace, stepRace } from '../src/core/sim/race';
import { getTrack } from '../src/core/track';
import { NEUTRAL_INPUT, type CarLook, type HumanEntry, type PlayerInput, type RaceConfig } from '../src/core/types';
import {
  FINISH_IDS, FLAME_IDS, FREE_COLORS, PAINT_IDS, RIM_IDS, STRIPE_IDS, WHEEL_LISTS,
} from '../src/game/cosmetics';
import { withLook, withoutLook } from '../src/game/paints';
import { human, NO_ASSISTS } from './helpers';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomLook(r: () => number, carId: string): CarLook {
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(r() * list.length)];
  const body = CARS.find((c) => c.id === carId)?.body ?? 'gt';
  return {
    paint: pick(PAINT_IDS), color: pick(FREE_COLORS), accent: pick(FREE_COLORS), finish: pick(FINISH_IDS), wheel: pick(WHEEL_LISTS[body]),
    rim: pick(RIM_IDS), stripe: pick(STRIPE_IDS), flame: pick(FLAME_IDS),
  };
}

const CAR_IDS = ['falcao', 'trovao', 'tornado', 'camelo'];

function config(humans: HumanEntry[]): RaceConfig {
  return { trackId: 'copacabana', laps: 2, humans, totalCars: 10, difficulty: 'profissional', manualGear: false, assists: NO_ASSISTS, seed: 20260710 };
}

/** Entradas roteirizadas: acelera, vira e aperta o nitro e a derrapagem em momentos diferentes por assento. */
function script(tick: number, seat: number): PlayerInput {
  return {
    ...NEUTRAL_INPUT, throttle: true, steer: Math.sin((tick + seat * 17) / 40) * 0.8, nitro: (tick + seat * 5) % 97 === 0, drift: (tick + seat * 11) % 150 > 100,
  };
}

describe('guarda: nenhum look muda a corrida', () => {
  it.each([2, 4])('com %i humanos e 25 visuais sorteados: mesmo hashRace e mesmo estado, tick a tick', (n) => {
    const r = rng(0xc0ffee + n);
    for (let round = 0; round < 25; round++) {
      const bare = Array.from({ length: n }, (_, seat) => human(seat, 0, CAR_IDS[seat % CAR_IDS.length]));
      const styled = bare.map((h) => withLook(h, randomLook(r, h.carId)));
      expect(styled.every((h) => h.look !== undefined), 'o sorteio sempre personaliza').toBe(true);
      const track = getTrack('copacabana');
      // O caminho real: a sessão e o online tiram o look antes de montar a config.
      const a = createRace(config(bare), track);
      const b = createRace(config(withoutLook(styled)), track);
      expect(hashRace(b)).toBe(hashRace(a));
      expect(serializeRace(b)).toBe(serializeRace(a));
      const ticks = round < 3 ? 240 : 30; // as 3 primeiras rodadas passam da contagem e correm; as outras conferem a largada
      for (let t = 0; t < ticks; t++) {
        const inputsA: PlayerInput[] = []; const inputsB: PlayerInput[] = [];
        for (let seat = 0; seat < n; seat++) { inputsA[seat] = script(t, seat); inputsB[seat] = script(t, seat); }
        stepRace(a, track, inputsA);
        stepRace(b, track, inputsB);
        if (t % 15 === 0) expect(hashRace(b), `rodada ${round} tick ${t}`).toBe(hashRace(a));
      }
      expect(hashRace(b)).toBe(hashRace(a));
      expect(serializeRace(b)).toBe(serializeRace(a));
    }
  });

  it('nem a config nem o estado carregam o look (nenhuma chave do cosmético)', () => {
    const styled = [withLook(human(0, 0, 'falcao'), { paint: 'rubi', color: FREE_COLORS[3], finish: 'perolado', wheel: 'mag', rim: 'dourado', stripe: 'ab', flame: 'roxa' }), human(1, 0, 'trovao')];
    const state = createRace(config(withoutLook(styled)), getTrack('copacabana'));
    const text = serializeRace(state) + JSON.stringify(state.config);
    expect(text).not.toMatch(/"look"|"paint"|perolado|dourado|"flame"|"stripe"|"rim"|"wheel"/);
    expect(state.config.humans.every((h) => !('look' in h) && !('paint' in h))).toBe(true);
  });

  it('o look nunca vem do núcleo: o estado dos carros não tem campo de visual', () => {
    const state = createRace(config([human(0, 0, 'falcao')]), getTrack('copacabana'));
    const keys = Object.keys(state.cars[0]);
    for (const k of ['look', 'paint', 'finish', 'wheel', 'rim', 'stripe', 'flame']) expect(keys, k).not.toContain(k);
  });
});
