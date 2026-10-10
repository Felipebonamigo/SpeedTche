// O rival fala durante a corrida (src/game/rival-talk.ts, onda L, L5). Os textos já existiam (rivals/strings.ts: apresentação,
// provocação, respeito e revanche), só eram ditos antes e depois da corrida. Aqui: QUANDO falar. Regras: uma apresentação
// logo depois da largada; provocação (ou revanche) quando ele passa um humano e se mantém à frente; respeito quando um
// humano o passa; a troca precisa durar 1 s (senão é só os carros emparelhados); no mínimo 25 s entre duas falas e no
// máximo 4 por corrida. Puro: lê o estado, devolve quem escuta e que tipo de fala.
import { afterEach, describe, expect, it } from 'vitest';
import { TICK_RATE } from '../src/core/constants';
import type { RaceState } from '../src/core/types';
import { setLanguage } from '../src/i18n';
import { rivalLine } from '../src/game/rivals';
import {
  createRivalTalk, HOLD_TICKS, INTRO_DELAY_TICKS, MAX_LINES, MIN_GAP_SECONDS, observeRivalTalk, rivalByName, rivalTalkText,
} from '../src/game/rival-talk';
import { human, quickRace, skipCountdown } from './helpers';

afterEach(() => setLanguage('pt'));

/** Corrida de 4 carros com o rival já escolhido (um carro da IA) e os humanos nos assentos dados. */
function scene(seats: number[] = [0], previousDuel: boolean | null = null) {
  const { state, track } = quickRace({ humans: seats.map((s) => human(s)), totalCars: 5 });
  skipCountdown(state, track);
  const rivalCar = state.cars.find((c) => c.seat < 0)!;
  state.config.rival = rivalCar.name;
  const humans = state.cars.filter((c) => c.seat >= 0);
  const mem = createRivalTalk(previousDuel);
  /** Roda `ticks` ticks (o estado só anda o relógio); devolve as falas ditas nesse trecho. */
  const run = (ticks: number) => {
    const out: Array<{ tick: number; seat: number; kind: string }> = [];
    for (let i = 0; i < ticks; i++) {
      state.tick++;
      for (const c of observeRivalTalk(mem, state, seats)) out.push({ tick: state.tick, seat: c.seat, kind: c.kind });
    }
    return out;
  };
  /** Põe o rival à frente (true) ou atrás (false) do humano `h`. */
  const setAhead = (h: number, ahead: boolean) => { rivalCar.position = ahead ? humans[h].position - 1 : humans[h].position + 1; };
  humans[0].position = 3; rivalCar.position = 4; // começa atrás do humano
  return { state: state as RaceState, rivalCar, humans, mem, run, setAhead };
}

describe('quando o rival fala', () => {
  it('sem rival na corrida (rápida, contra-relógio, online) nunca fala', () => {
    const s = scene();
    s.state.config.rival = undefined;
    expect(s.run(60 * 60)).toEqual([]);
  });

  it('só um rival que está no grid fala', () => {
    const s = scene();
    s.state.config.rival = 'Ninguém Aqui';
    expect(s.run(60 * 30)).toEqual([]);
  });

  it('apresenta-se uma vez, INTRO_DELAY_TICKS depois da largada, para cada humano local', () => {
    const s = scene([0, 1]);
    const said = s.run(INTRO_DELAY_TICKS + 600);
    const intros = said.filter((c) => c.kind === 'intro');
    expect(intros.map((c) => c.seat).sort()).toEqual([0, 1]);
    expect(new Set(intros.map((c) => c.tick)).size).toBe(1);
    expect(intros[0].tick - s.state.startTick).toBe(INTRO_DELAY_TICKS);
  });

  it('o humano passa o rival e se mantém à frente: "respect"; o rival o passa de volta: "taunt"', () => {
    const s = scene();
    s.run(INTRO_DELAY_TICKS + 10);
    s.setAhead(0, false); // o rival já estava atrás; segue atrás: nada
    expect(s.run(HOLD_TICKS + 5)).toEqual([]);
    s.setAhead(0, true); // agora o rival passa
    s.run(MIN_GAP_SECONDS * TICK_RATE); // espera o intervalo mínimo desde a apresentação
    s.setAhead(0, false); // o humano retoma
    const said = s.run(HOLD_TICKS + 5);
    expect(said).toHaveLength(1);
    expect(said[0].kind).toBe('respect');
  });

  it('o rival passa o humano: "taunt", ou "revanche" se ele tinha perdido o duelo anterior', () => {
    for (const [previous, kind] of [[null, 'taunt'], [true, 'taunt'], [false, 'revenge']] as const) {
      const s = scene([0], previous);
      s.run(INTRO_DELAY_TICKS + MIN_GAP_SECONDS * TICK_RATE + 10);
      s.setAhead(0, true);
      const said = s.run(HOLD_TICKS + 5);
      expect(said.map((c) => c.kind), `anterior ${String(previous)}`).toEqual([kind]);
    }
  });

  it('uma troca que dura menos de HOLD_TICKS (carros emparelhados) não fala', () => {
    const s = scene();
    s.run(INTRO_DELAY_TICKS + MIN_GAP_SECONDS * TICK_RATE + 10);
    s.setAhead(0, true);
    expect(s.run(HOLD_TICKS - 10)).toEqual([]);
    s.setAhead(0, false);
    expect(s.run(HOLD_TICKS * 3)).toEqual([]);
  });

  it('no mínimo MIN_GAP_SECONDS entre duas falas, e no máximo MAX_LINES por corrida', () => {
    const s = scene();
    const all: Array<{ tick: number }> = [...s.run(INTRO_DELAY_TICKS + 5)];
    // troca de posição a cada 2 s durante 10 minutos: a fala só sai quando o intervalo permite
    for (let i = 0; i < 300; i++) { s.setAhead(0, i % 2 === 0); all.push(...s.run(2 * TICK_RATE)); }
    expect(all.length).toBe(MAX_LINES);
    const gaps = all.slice(1).map((c, i) => c.tick - all[i].tick);
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(MIN_GAP_SECONDS * TICK_RATE);
  });

  it('corrida nova (tick volta atrás) zera a conversa', () => {
    const s = scene();
    s.run(INTRO_DELAY_TICKS + 5);
    s.state.tick = s.state.startTick;
    const again = s.run(INTRO_DELAY_TICKS + 5);
    expect(again.filter((c) => c.kind === 'intro').length).toBe(1);
  });

  it('humano que já terminou não escuta mais', () => {
    const s = scene();
    s.humans[0].finished = true;
    expect(s.run(INTRO_DELAY_TICKS + 5)).toEqual([]);
  });
});

describe('o texto da fala', () => {
  it('vem de rivalLine no idioma atual, com o nome do rival na frente', () => {
    const rival = rivalByName('Zé Turbo');
    expect(rival.key).toBe('ze_turbo');
    setLanguage('pt');
    const pt = rivalTalkText(rival, 'taunt');
    expect(pt).toBe(`Zé Turbo: ${rivalLine(rival, 'taunt')}`);
    setLanguage('en');
    const en = rivalTalkText(rival, 'taunt');
    expect(en).toBe(`Zé Turbo: ${rivalLine(rival, 'taunt')}`);
    expect(en).not.toBe(pt);
  });

  it('rival sem falas próprias usa as da personalidade (nunca uma chave solta na tela)', () => {
    const rival = rivalByName('Ana Volpi');
    for (const kind of ['intro', 'taunt', 'respect', 'revenge'] as const) {
      expect(rivalTalkText(rival, kind)).not.toMatch(/rivals\./);
    }
  });
});
