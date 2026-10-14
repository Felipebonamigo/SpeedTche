// O4: estrelas por corrida, objetivo da pista, troféu, placar e o saneador do save (docs/ondas/O/O4.md §4 e §6, grupos A–D).
import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '../src/core/constants';
import { CUPS } from '../src/core/data/cups';
import { CUP_RIVALS } from '../src/core/data/drivers';
import { TRACKS } from '../src/core/track/tracks';
import type { RaceResultRow } from '../src/core/types';
import { newTelemetry, type RaceTelemetry, type SeatTelemetry } from '../src/game/achievements';
import {
  GOALS, STAR_GOAL, STAR_QUALIFY, STAR_RIVAL, STARS_TOTAL, cupStars, emptyStars, goalFor, goalMet, sanitizeStars, scoreOf, settleStars,
  starCount, trophyFor, type GoalId, type StarsData, type StarsInput,
} from '../src/game/stars';
import { human } from './helpers';

const seatTel = (o: Partial<SeatTelemetry> = {}): SeatTelemetry => ({
  nitros: 0, towsGiven: 0, towsReceived: 0, collisions: 0, crashes: 0, pitStops: 0, draftTicks: 0, startProgress: 0,
  nitroAtFinish: false, lastAfterFirstLap: false, perfectLaunch: false, miniTurbos: 0, maxCharges: 0, nitroEmptyAtFinish: false, ...o,
});

function tel(seat: number, o: Partial<SeatTelemetry> = {}, extra: (t: RaceTelemetry) => void = () => undefined): RaceTelemetry {
  const t = newTelemetry();
  t.seats.set(seat, seatTel(o));
  extra(t);
  return t;
}

function row(seat: number, name: string, position: number, finished = true): RaceResultRow {
  return { carId: seat < 0 ? 50 + position : seat, seat, name, teamId: seat < 0 ? 100 : 0, carDefId: 'falcao', position, finished, totalTicks: 9000, bestLapTicks: 3000, points: 0 };
}

/** Uma pista cujo objetivo é `goal` (existe pelo menos uma de cada nas 109). */
function trackWith(goal: GoalId): string {
  const t = TRACKS.find((x) => goalFor(x.id) === goal);
  if (!t) throw new Error(`nenhuma pista com o objetivo ${goal}`);
  return t.id;
}

const solo = { coop: false, lastVerdict: 'qualified' as const };

function input(o: Partial<StarsInput> & { trackId: string }): StarsInput {
  return {
    mode: 'cup', results: [row(0, 'Ana', 1), row(-1, 'Zé Turbo', 2)], humans: [{ ...human(0), name: 'Ana' }], telemetry: tel(0),
    rival: 'Zé Turbo', champ: solo, ...o,
  };
}

describe('A. objetivo da pista', () => {
  it('é um dos seis, estável e só depende do trackId', () => {
    expect(GOALS).toHaveLength(6);
    for (const t of TRACKS) {
      expect(GOALS).toContain(goalFor(t.id));
      expect(goalFor(t.id)).toBe(goalFor(t.id));
    }
  });

  it('o objetivo de cada pista é parte do formato: não muda sem querer (a ordem de GOALS e o hash)', () => {
    expect(['copacabana', 'paraty', 'serra_dos_orgaos', 'ilhabela', 'sampa_noite', 'pedra_azul'].map(goalFor))
      .toEqual(['draft20', 'comeback', 'nitroFinish', 'nitroFinish', 'noPit', 'draft20']);
  });

  it('as 109 pistas usam os seis objetivos, nenhum com menos de 8 pistas', () => {
    const count = new Map<GoalId, number>();
    for (const t of TRACKS) count.set(goalFor(t.id), (count.get(goalFor(t.id)) ?? 0) + 1);
    expect(count.size).toBe(6);
    for (const n of count.values()) expect(n).toBeGreaterThanOrEqual(8);
  });

  it('cada objetivo: cumprido e não cumprido, e só vale terminando', () => {
    const ok = (goal: GoalId, o: Partial<SeatTelemetry>, pos = 1, extra: (t: RaceTelemetry) => void = () => undefined) => goalMet(goal, 0, true, pos, tel(0, o, extra));
    expect(ok('clean', {})).toBe(true);
    expect(ok('clean', { collisions: 1 })).toBe(false);
    expect(ok('clean', { crashes: 1 })).toBe(false);
    expect(ok('perfectLap', {}, 1, (t) => t.perfectLap.add(0))).toBe(true);
    expect(ok('perfectLap', {})).toBe(false);
    expect(ok('draft20', { draftTicks: 20 * TICK_RATE })).toBe(true);
    expect(ok('draft20', { draftTicks: 20 * TICK_RATE - 1 })).toBe(false);
    expect(ok('noPit', {})).toBe(true);
    expect(ok('noPit', {}, 1, (t) => t.pitted.add(0))).toBe(false);
    expect(ok('comeback', { lastAfterFirstLap: true }, 3)).toBe(true);
    expect(ok('comeback', { lastAfterFirstLap: true }, 4)).toBe(false);
    expect(ok('comeback', { lastAfterFirstLap: false }, 1)).toBe(false);
    expect(ok('nitroFinish', { nitroAtFinish: true })).toBe(true);
    expect(ok('nitroFinish', {})).toBe(false);
    for (const g of GOALS) expect(goalMet(g, 0, false, 1, tel(0, { nitroAtFinish: true, draftTicks: 99999, lastAfterFirstLap: true }, (t) => t.perfectLap.add(0)))).toBe(false);
  });

  it('sem telemetria do assento, nenhum objetivo vale', () => {
    for (const g of GOALS) expect(goalMet(g, 0, true, 1, newTelemetry())).toBe(false);
  });
});

describe('B. settleStars', () => {
  it('o total do jogo é 3 × as corridas das copas (327) e os ids de pista são únicos', () => {
    expect(STARS_TOTAL).toBe(327);
    expect(CUPS.reduce((s, c) => s + c.trackIds.length, 0) * 3).toBe(STARS_TOTAL);
    expect(new Set(TRACKS.map((t) => t.id)).size).toBe(TRACKS.length);
  });

  it('três estrelas: classificou, venceu o rival e cumpriu o objetivo', () => {
    const data = emptyStars();
    const trackId = trackWith('nitroFinish');
    const [last] = settleStars(data, input({ trackId, telemetry: tel(0, { nitroAtFinish: true }) }));
    expect(last).toMatchObject({ name: 'Ana', trackId, got: STAR_QUALIFY | STAR_RIVAL | STAR_GOAL, was: 0, goal: 'nitroFinish', rival: 'Zé Turbo', duel: 'win' });
    expect(data.profiles[0].tracks[trackId]).toBe(7);
    expect(starCount(data.profiles[0])).toBe(3);
    expect(data.last).toEqual([last]);
  });

  it('estrela 1 solo: top 5 classifica, 6º não', () => {
    const at = (pos: number) => settleStars(emptyStars(), input({ trackId: 'copacabana', results: [row(0, 'Ana', pos), row(-1, 'Zé Turbo', 20)] }))[0].got & STAR_QUALIFY;
    expect(at(5)).toBe(STAR_QUALIFY);
    expect(at(6)).toBe(0);
  });

  it('estrela 1 no co-op segue o veredito da equipe, não a posição de cada um', () => {
    const results = [row(0, 'Ana', 9), row(-1, 'Zé Turbo', 20)];
    const got = (lastVerdict: 'qualified' | 'eliminated') => settleStars(emptyStars(), input({ trackId: 'copacabana', results, champ: { coop: true, lastVerdict } }))[0].got & STAR_QUALIFY;
    expect(got('qualified')).toBe(STAR_QUALIFY);
    expect(got('eliminated')).toBe(0);
  });

  it('sem copa (champ nulo) não há estrela de classificar', () => {
    expect(settleStars(emptyStars(), input({ trackId: 'copacabana', champ: null }))[0].got & STAR_QUALIFY).toBe(0);
  });

  it('estrela 2: precisa terminar à frente do rival; atrás perde, e o placar anda para o lado de quem ganhou', () => {
    const data = emptyStars();
    settleStars(data, input({ trackId: 'copacabana', results: [row(0, 'Ana', 1), row(-1, 'Zé Turbo', 2)] }));
    settleStars(data, input({ trackId: 'paraty', results: [row(-1, 'Zé Turbo', 1), row(0, 'Ana', 2)] }));
    settleStars(data, input({ trackId: 'serra_dos_orgaos', results: [row(-1, 'Zé Turbo', 1), row(0, 'Ana', 2)] }));
    expect(data.profiles[0].tracks.copacabana & STAR_RIVAL).toBe(STAR_RIVAL);
    expect(data.profiles[0].tracks.paraty & STAR_RIVAL).toBe(0);
    expect(scoreOf(data, 'Ana', 'ze_turbo')).toEqual({ you: 1, rival: 2 });
    expect(data.last[0].duel).toBe('lose');
  });

  it('sem rival no grid: sem estrela 2 e sem placar', () => {
    const data = emptyStars();
    const [last] = settleStars(data, input({ trackId: 'copacabana', rival: undefined }));
    expect(last.got & STAR_RIVAL).toBe(0);
    expect(last.rival).toBeNull();
    expect(last.duel).toBeNull();
    expect(data.profiles[0].rivals).toEqual({});
  });

  it('só copa e Expedição dão estrela; corrida rápida e festa não gravam nada', () => {
    for (const mode of ['quick', 'timetrial', 'tournament', 'escort', 'relay'] as const) {
      const data = emptyStars();
      expect(settleStars(data, input({ trackId: 'copacabana', mode }))).toEqual([]);
      expect(data).toEqual(emptyStars());
    }
    const data = emptyStars();
    expect(settleStars(data, input({ trackId: 'copacabana', mode: 'career' }))).toHaveLength(1);
  });

  it('as estrelas só sobem: a melhor de cada uma fica (OU de bits)', () => {
    const data = emptyStars();
    const trackId = trackWith('clean');
    settleStars(data, input({ trackId, results: [row(0, 'Ana', 1), row(-1, 'Zé Turbo', 2)], telemetry: tel(0, { collisions: 2 }) })); // 1 + 2
    expect(data.profiles[0].tracks[trackId]).toBe(STAR_QUALIFY | STAR_RIVAL);
    const [second] = settleStars(data, input({ trackId, results: [row(0, 'Ana', 9), row(-1, 'Zé Turbo', 2)], telemetry: tel(0) })); // só o objetivo
    expect(second.was).toBe(3);
    expect(second.got).toBe(STAR_GOAL);
    expect(data.profiles[0].tracks[trackId]).toBe(7);
    settleStars(data, input({ trackId, results: [row(0, 'Ana', 18), row(-1, 'Zé Turbo', 2)], telemetry: tel(0, { crashes: 3 }) })); // nada
    expect(data.profiles[0].tracks[trackId]).toBe(7);
  });

  it('cada humano local tem o seu perfil (nome sem diferenciar maiúsculas) e a sua telemetria', () => {
    const data = emptyStars();
    const humans = [{ ...human(0), name: 'Ana' }, { ...human(1), name: 'bia' }];
    const t = tel(0, {}, (x) => x.seats.set(1, seatTel({ collisions: 4 })));
    const results = [row(0, 'Ana', 1), row(1, 'bia', 7), row(-1, 'Zé Turbo', 3)];
    const trackId = trackWith('clean');
    const out = settleStars(data, input({ trackId, results, humans, telemetry: t }));
    expect(out.map((l) => [l.name, l.got])).toEqual([['Ana', 7], ['bia', 0]]);
    settleStars(data, input({ trackId: 'paraty', results: [row(0, 'ANA', 2), row(-1, 'Zé Turbo', 3)], humans: [{ ...human(0), name: 'ANA' }] }));
    expect(data.profiles.map((p) => p.name)).toEqual(['ANA', 'bia']);
    expect(Object.keys(data.profiles[0].tracks).sort()).toEqual(['paraty', trackId].sort());
  });

  it('o perfil usado mais recentemente vai para a frente e o 33º sai', () => {
    const data = emptyStars();
    for (let i = 0; i < 33; i++) settleStars(data, input({ trackId: 'copacabana', humans: [{ ...human(0), name: `P${i}` }], results: [row(0, `P${i}`, 1), row(-1, 'Zé Turbo', 2)] }));
    expect(data.profiles).toHaveLength(32);
    expect(data.profiles[0].name).toBe('P32');
    expect(data.profiles.some((p) => p.name === 'P0')).toBe(false);
  });

  it('corrida de um humano sem linha no resultado não lança nem grava', () => {
    const data = emptyStars();
    expect(settleStars(data, input({ trackId: 'copacabana', results: [row(-1, 'Zé Turbo', 1)] }))).toEqual([]);
  });
});

describe('C. troféu', () => {
  it('bronze a partir de 1/3, prata a partir de 2/3, ouro só com tudo', () => {
    expect(trophyFor(0, 9)).toBe('none');
    expect(trophyFor(2, 9)).toBe('none');
    expect(trophyFor(3, 9)).toBe('bronze');
    expect(trophyFor(5, 9)).toBe('bronze');
    expect(trophyFor(6, 9)).toBe('silver');
    expect(trophyFor(8, 9)).toBe('silver');
    expect(trophyFor(9, 9)).toBe('gold');
    expect(trophyFor(4, 12)).toBe('bronze');
    expect(trophyFor(8, 12)).toBe('silver');
    expect(trophyFor(12, 12)).toBe('gold');
    expect(trophyFor(0, 0)).toBe('none');
  });

  it('cupStars soma os bits das pistas da copa e conta o máximo (3 por corrida)', () => {
    const cup = CUPS.find((c) => c.id === 'eua');
    if (!cup) throw new Error('copa eua');
    const data = emptyStars();
    data.profiles.push({ name: 'Ana', tracks: { [cup.trackIds[0]]: 7, [cup.trackIds[1]]: 1, copacabana: 7 }, rivals: {} });
    expect(cupStars(data.profiles[0], cup)).toEqual({ got: 4, max: 12 });
    expect(cupStars(undefined, cup)).toEqual({ got: 0, max: 12 });
  });
});

describe('D. sanitizeStars', () => {
  const valid: StarsData = {
    profiles: [{ name: 'Ana', tracks: { copacabana: 7, paraty: 3 }, rivals: { ze_turbo: { you: 5, rival: 7 } } }],
    last: [{ name: 'Ana', trackId: 'paraty', got: 3, was: 1, goal: 'noPit', rival: 'Zé Turbo', duel: 'win' }],
  };

  it('o formato válido passa intacto, também por JSON', () => {
    expect(sanitizeStars(valid)).toEqual(valid);
    expect(sanitizeStars(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
  });

  it('nada ou lixo vira vazio, sem lançar', () => {
    for (const bad of [undefined, null, 0, 'x', [], true, { profiles: 'x', last: 7 }, { profiles: [null, 3, 'a', []] }]) {
      expect(sanitizeStars(bad)).toEqual(emptyStars());
    }
  });

  it('descarta só o item ruim: pista que não existe, estrela fora de 1..7, rival que não existe, contagem inválida', () => {
    const out = sanitizeStars({
      profiles: [{ name: 'Ana', tracks: { copacabana: 15, paraty: 0, fantasma: 7, sampa_noite: 'x', ilhabela: 2.5, itaunas: -1 }, rivals: { ze_turbo: { you: 1.5, rival: 3 }, ninguem: { you: 1, rival: 1 }, caio_brasa: { you: -2, rival: 100000 }, nina_costa: { you: 0, rival: 0 } } }],
    });
    expect(out.profiles[0].tracks).toEqual({ copacabana: 7 });
    expect(out.profiles[0].rivals).toEqual({ ze_turbo: { you: 0, rival: 3 }, caio_brasa: { you: 0, rival: 99999 } });
  });

  it('perfil repetido (mesma chave) vale o primeiro; nome vazio ou longo é limpo; no máximo 32', () => {
    const out = sanitizeStars({ profiles: [
      { name: 'Ana', tracks: { copacabana: 1 } }, { name: ' ANA ', tracks: { paraty: 1 } }, { name: '', tracks: { paraty: 1 } }, { name: 'x'.repeat(40), tracks: { paraty: 1 } },
      ...Array.from({ length: 40 }, (_, i) => ({ name: `Q${i}`, tracks: { copacabana: 1 } })),
    ] });
    expect(out.profiles[0].tracks).toEqual({ copacabana: 1 });
    expect(out.profiles.filter((p) => p.name.toLowerCase().trim() === 'ana')).toHaveLength(1);
    expect(out.profiles.some((p) => p.name === '')).toBe(false);
    expect(out.profiles.every((p) => p.name.length <= 12)).toBe(true);
    expect(out.profiles).toHaveLength(32);
  });

  it('last: no máximo 4, objetivo conhecido, bits & 7, duelo win/lose/null', () => {
    const e = (o: object) => ({ name: 'Ana', trackId: 'paraty', got: 1, was: 0, goal: 'clean', rival: null, duel: null, ...o });
    const out = sanitizeStars({ last: [e({}), e({ goal: 'voar' }), e({ trackId: 'nada' }), e({ got: 15, was: 9, duel: 'win' }), e({ duel: 'x' }), e({}), e({}), e({}), e({})] });
    expect(out.last.length).toBeLessThanOrEqual(4);
    expect(out.last.every((l) => GOALS.includes(l.goal))).toBe(true);
    expect(out.last.some((l) => l.trackId === 'nada')).toBe(false);
    const masked = out.last.find((l) => l.duel === 'win');
    expect(masked).toMatchObject({ got: 7, was: 1 });
    expect(out.last.every((l) => l.duel === null || l.duel === 'win' || l.duel === 'lose')).toBe(true);
  });

  it('todo rival de copa é uma chave aceita pelo saneador', () => {
    const rivals = Object.fromEntries([...new Set(Object.values(CUP_RIVALS))].map((n) => [n, n]));
    expect(Object.keys(rivals)).toHaveLength(12);
    const keys = Object.keys(rivals).map((n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_'));
    const out = sanitizeStars({ profiles: [{ name: 'Ana', rivals: Object.fromEntries(keys.map((k) => [k, { you: 1, rival: 1 }])) }] });
    expect(Object.keys(out.profiles[0].rivals).sort()).toEqual([...keys].sort());
  });
});
