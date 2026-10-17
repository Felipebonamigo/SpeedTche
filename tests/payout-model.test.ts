// N4, o modelo do Pagamento (docs/ondas/N/N4.md §5 "M"): o que a tela mostra, calculado só do que a carreira já fechou
// (`settleCareerRace` + `walletOf`), sem mudar nenhuma regra de dinheiro. Puro, sem DOM.
import { describe, expect, it } from 'vitest';
import {
  beginCareerCup, buyCar, CAREER_START_MONEY, newCareer, racePrizes, settleCareerRace, upgradePrice, walletOf, type CareerReport, type CareerState,
} from '../src/core/career';
import { POINTS_TABLE } from '../src/core/constants';
import { CARS } from '../src/core/data/cars';
import { AI_TEAM_ID_BASE } from '../src/core/data/drivers';
import type { HumanEntry, RaceResultRow } from '../src/core/types';
import { payoutFrame, payoutModel, payoutTimeline, type PayoutModel } from '../src/game/payout-model';
import { POST_STEP_SECONDS } from '../src/game/post-race';
import { human } from './helpers';

/** Resultado de corrida com os humanos nas posições dadas e a IA preenchendo o resto. */
function fakeResults(humanPositions: Record<number, number>, humans: HumanEntry[], total = 20): RaceResultRow[] {
  const rows: RaceResultRow[] = [];
  const taken = Object.values(humanPositions);
  for (const h of humans) {
    const p = humanPositions[h.seat];
    rows.push({ carId: 100 + h.seat, seat: h.seat, name: h.name, teamId: h.teamId, carDefId: h.carId, position: p, finished: true, totalTicks: 1000, bestLapTicks: 100, points: POINTS_TABLE[p - 1] ?? 0 });
  }
  let ai = 0;
  for (let p = 1; p <= total; p++) {
    if (taken.includes(p)) continue;
    rows.push({ carId: ai, seat: -1, name: `IA${ai}`, teamId: AI_TEAM_ID_BASE + Math.floor(ai / 2), carDefId: 'falcao', position: p, finished: true, totalTicks: 1000, bestLapTicks: 100, points: POINTS_TABLE[p - 1] ?? 0 });
    ai++;
  }
  return rows.sort((a, b) => a.position - b.position);
}

function careerOf(n: number, mode: 'solo' | 'coop' | 'versus'): { career: CareerState; humans: HumanEntry[] } {
  const humans = Array.from({ length: n }, (_, i) => human(i, mode === 'versus' ? i : 0));
  const career = newCareer(humans);
  beginCareerCup(career, 7);
  return { career, humans };
}

/** Corre a corrida na carreira e devolve o modelo do pagamento lido DEPOIS de somada, como a tela faz. */
function pay(career: CareerState, humans: HumanEntry[], positions: Record<number, number>): { report: CareerReport; model: PayoutModel } {
  const { report } = settleCareerRace(career, fakeResults(positions, humans));
  return { report, model: payoutModel(career, report) };
}

describe('payoutModel: solo (M1)', () => {
  it('uma coluna; depois − antes = o prêmio da posição (os números da carreira de verdade)', () => {
    const { career, humans } = careerOf(1, 'solo');
    const { report, model } = pay(career, humans, { 0: 2 });
    expect(model.coop).toBe(false);
    expect(model.columns).toHaveLength(1);
    const col = model.columns[0];
    expect(col.driver).toBe(0);
    expect(col.name).toBe('P1');
    expect(col.position).toBe(2);
    expect(col.kind).toBe('position');
    expect(col.prize).toBe(report.rows[0].prize);
    expect(col.prize).toBeGreaterThan(0);
    expect(col.wallet).not.toBeNull();
    expect(col.wallet?.before).toBe(CAREER_START_MONEY);
    expect(col.wallet?.after).toBe(walletOf(career, 0));
    expect((col.wallet?.after ?? 0) - (col.wallet?.before ?? 0)).toBe(col.prize);
    expect(model.team).toBeNull();
    expect(model.vault).toBeNull();
    expect(model.eliminated).toBe(false);
  });
});

describe('payoutModel: co-op (M2)', () => {
  it('colunas por piloto, o bônus da equipe e UM cofre com tudo somado', () => {
    const { career, humans } = careerOf(2, 'coop');
    const before = walletOf(career, 0);
    expect(before).toBe(CAREER_START_MONEY * 2);
    const { report, model } = pay(career, humans, { 0: 1, 1: 3 });
    expect(model.coop).toBe(true);
    expect(model.columns.map((c) => c.driver)).toEqual([0, 1]);
    expect(model.columns.every((c) => c.wallet === null)).toBe(true);
    expect(model.team).toEqual({ rank: report.teamRank, bonus: report.teamBonus });
    expect(model.team?.bonus).toBeGreaterThan(0);
    expect(model.vault?.before).toBe(before);
    expect(model.vault?.after).toBe(walletOf(career, 0));
    const credited = report.rows.reduce((s, r) => s + r.prize, 0) + report.teamBonus;
    expect((model.vault?.after ?? 0) - (model.vault?.before ?? 0)).toBe(credited);
  });
});

describe('payoutModel: versus (M3)', () => {
  it('uma carteira por assento, sem bônus e sem cofre; antes e depois de cada um', () => {
    const { career, humans } = careerOf(3, 'versus');
    career.wallets[1] = 9000; // o P2 chega com outro saldo
    const { report, model } = pay(career, humans, { 0: 1, 1: 4, 2: 12 });
    expect(model.coop).toBe(false);
    expect(model.vault).toBeNull();
    expect(model.team).toBeNull();
    expect(model.columns).toHaveLength(3);
    expect(model.columns.map((c) => c.wallet?.before)).toEqual([CAREER_START_MONEY, 9000, CAREER_START_MONEY]);
    model.columns.forEach((c, i) => {
      expect(c.wallet?.after).toBe(walletOf(career, i));
      expect(c.prize).toBe(report.rows[i].prize);
      expect((c.wallet?.after ?? 0) - (c.wallet?.before ?? 0)).toBe(c.prize);
    });
    expect(model.columns[0].wallet?.before).not.toBe(model.columns[1].wallet?.before);
  });
});

describe('payoutModel: eliminação (M4)', () => {
  it('a ajuda de custo vira "allowance" e o modelo sabe que foi eliminado; no co-op não há bônus', () => {
    const { career, humans } = careerOf(1, 'solo');
    // Fora do corte da copa: o último colocado entre 20 elimina na primeira corrida.
    const { report, model } = pay(career, humans, { 0: 20 });
    expect(report.verdict).toBe('eliminated');
    expect(model.eliminated).toBe(true);
    expect(model.columns[0].kind).toBe('allowance');
    expect(model.columns[0].prize).toBe(report.rows[0].prize);

    const coop = careerOf(2, 'coop');
    const out = pay(coop.career, coop.humans, { 0: 19, 1: 20 });
    expect(out.report.verdict).toBe('eliminated');
    expect(out.model.eliminated).toBe(true);
    expect(out.model.team).toBeNull();
  });
});

describe('payoutModel: "Já dá para" (M5)', () => {
  it('só o que CRUZOU o preço com este pagamento, o mais caro: de carteira vazia, a peça mais cara de nível 1', () => {
    const { career, humans } = careerOf(1, 'solo');
    career.wallets[0] = 0;
    const { model } = pay(career, humans, { 0: 1 });
    const buy = model.columns[0].wallet?.canBuy;
    expect(buy).toMatchObject({ kind: 'part', part: 'engine', level: 1, carId: 'falcao' });
    expect(buy?.price).toBe(upgradePrice('engine', 0, 'falcao'));
  });
  it('quem já podia comprar antes não conta: sem cruzamento, nada', () => {
    const { career, humans } = careerOf(1, 'solo');
    career.wallets[0] = 3000; // todas as peças de nível 1 (até 2.400) já cabiam; e com o 3º lugar ainda fica abaixo do carro mais barato à venda (Jabuti, 7.000)
    const { model } = pay(career, humans, { 0: 3 });
    expect(model.columns[0].wallet?.canBuy).toBeNull();
  });
  it('um carro à venda cruzado vence a peça mais barata e traz o id do carro', () => {
    const { career, humans } = careerOf(1, 'solo');
    const curupira = CARS.find((c) => c.id === 'curupira');
    expect(curupira?.price).toBeGreaterThan(0);
    career.wallets[0] = 6500; // + 6.000 do 1º = 12.500: cruza o Curupira (12.000), o mais caro cruzado, e fica abaixo do Pampeiro (13.000)
    const { model } = pay(career, humans, { 0: 1 });
    const buy = model.columns[0].wallet?.canBuy;
    expect(buy?.kind).toBe('car');
    expect(buy?.carId).toBe('curupira');
    expect(buy?.price).toBe(curupira?.price);
  });
  it('carro já comprado e peça no máximo não entram', () => {
    const { career, humans } = careerOf(1, 'solo');
    career.wallets[0] = 1_000_000;
    expect(buyCar(career, 0, 'curupira')).toBe('ok');
    career.wallets[0] = 0;
    career.drivers[0].garage.carId = 'curupira';
    career.drivers[0].garage.upgrades.curupira = { engine: 3, turbo: 3, tires: 3, brakes: 3, tank: 3, nitro: 3 };
    const { model } = pay(career, humans, { 0: 1 });
    // Nenhuma peça (todas no 3), nem o Curupira (já é dele); os outros carros custam mais que os 6.000 do prêmio.
    expect(model.columns[0].wallet?.canBuy).toBeNull();
  });
  it('no co-op o cofre compra para qualquer um: o item é do piloto que o usa', () => {
    const { career, humans } = careerOf(2, 'coop');
    career.wallets[0] = 0;
    const { model } = pay(career, humans, { 0: 1, 1: 2 });
    const buy = model.vault?.canBuy;
    expect(buy).not.toBeNull();
    expect([0, 1]).toContain(buy?.driver);
  });
});

describe('payoutTimeline / payoutFrame (M6)', () => {
  function modelFor(kind: 'solo' | 'coop' | 'versus'): PayoutModel {
    const n = kind === 'solo' ? 1 : 3;
    const { career, humans } = careerOf(n, kind);
    career.wallets.fill(0);
    const positions: Record<number, number> = n === 1 ? { 0: 1 } : { 0: 1, 1: 2, 2: 5 };
    return pay(career, humans, positions).model;
  }

  it('cabe no passo do pagamento do relógio (e deixa tempo para ler o "Já dá para")', () => {
    for (const kind of ['solo', 'coop', 'versus'] as const) {
      for (const reduce of [false, true]) {
        const tl = payoutTimeline(modelFor(kind), reduce);
        expect(tl.duration, kind).toBeLessThanOrEqual(POST_STEP_SECONDS.payout);
        expect(tl.buyAt + 1.2, kind).toBeLessThanOrEqual(tl.duration);
        for (const c of tl.coins) expect(c.at + c.dur, kind).toBeLessThanOrEqual(tl.walletStart + tl.walletDur + 1e-9);
      }
    }
  });

  it('em t = 0 mostra o "antes"; em t = duração, exatamente os números do relatório', () => {
    for (const kind of ['solo', 'coop', 'versus'] as const) {
      const model = modelFor(kind);
      const tl = payoutTimeline(model, false);
      const first = payoutFrame(tl, model, 0);
      expect(first.rows.every((v) => v === 0)).toBe(true);
      expect(first.team).toBe(0);
      expect(first.buy).toBe(false);
      expect(first.landed).toBe(0);
      const last = payoutFrame(tl, model, tl.duration);
      expect(last.rows).toEqual(model.columns.map((c) => c.prize));
      expect(last.team).toBe(model.team?.bonus ?? 0);
      expect(last.wallets).toEqual(model.vault ? [model.vault.after] : model.columns.map((c) => c.wallet?.after));
      expect(first.wallets).toEqual(model.vault ? [model.vault.before] : model.columns.map((c) => c.wallet?.before));
      expect(last.buy).toBe(true);
      expect(last.landed).toBe(tl.coins.length);
      expect(last.flying).toEqual([]);
    }
  });

  it('os números só sobem (rows, equipe e carteiras) e as moedas só pousam, nunca desfazem', () => {
    const model = modelFor('coop');
    const tl = payoutTimeline(model, false);
    let prev = payoutFrame(tl, model, 0);
    for (let t = 0.05; t <= tl.duration + 0.05; t += 0.05) {
      const f = payoutFrame(tl, model, t);
      f.rows.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(prev.rows[i]));
      expect(f.team).toBeGreaterThanOrEqual(prev.team);
      f.wallets.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(prev.wallets[i]));
      expect(f.landed).toBeGreaterThanOrEqual(prev.landed);
      prev = f;
    }
  });

  it('as moedas existem (e voam entre o prêmio e o cofre) fora do reduceEffects', () => {
    const model = modelFor('versus');
    const tl = payoutTimeline(model, false);
    expect(tl.coins.length).toBeGreaterThan(0);
    const mid = payoutFrame(tl, model, tl.walletStart + 0.3);
    expect(mid.flying.length).toBeGreaterThan(0);
    for (const f of mid.flying) { expect(f.progress).toBeGreaterThanOrEqual(0); expect(f.progress).toBeLessThanOrEqual(1); }
  });

  it('com reduceEffects: nenhuma moeda e nenhum clarão, só o número — e os MESMOS números', () => {
    for (const kind of ['solo', 'coop', 'versus'] as const) {
      const model = modelFor(kind);
      const full = payoutTimeline(model, false);
      const calm = payoutTimeline(model, true);
      expect(calm.coins).toEqual([]);
      for (let t = 0; t <= calm.duration; t += 0.1) {
        const f = payoutFrame(calm, model, t);
        expect(f.flying).toEqual([]);
        expect(f.flash).toBe(0);
        expect(f.landed).toBe(0);
      }
      const a = payoutFrame(full, model, full.duration);
      const b = payoutFrame(calm, model, calm.duration);
      expect(b.rows).toEqual(a.rows);
      expect(b.wallets).toEqual(a.wallets);
      expect(b.team).toBe(a.team);
      expect(b.buy).toBe(a.buy);
    }
  });

  it('o clarão acompanha o "Já dá para" quando há efeitos: sobe no instante e apaga', () => {
    const model = modelFor('solo');
    const tl = payoutTimeline(model, false);
    expect(payoutFrame(tl, model, tl.buyAt - 0.01).flash).toBe(0);
    expect(payoutFrame(tl, model, tl.buyAt + 0.05).flash).toBeGreaterThan(0);
    expect(payoutFrame(tl, model, tl.buyAt + 1).flash).toBe(0);
  });
});

describe('o pagamento só lê (M7)', () => {
  it('payoutModel, payoutTimeline e payoutFrame não mexem na carreira nem no relatório', () => {
    for (const kind of ['solo', 'coop', 'versus'] as const) {
      const n = kind === 'solo' ? 1 : 2;
      const { career, humans } = careerOf(n, kind);
      const positions: Record<number, number> = n === 1 ? { 0: 1 } : { 0: 1, 1: 4 };
      const { report } = settleCareerRace(career, fakeResults(positions, humans));
      const snapshot = JSON.stringify(career);
      const model = payoutModel(career, report);
      const tl = payoutTimeline(model, false);
      for (let t = 0; t <= tl.duration; t += 0.25) payoutFrame(tl, model, t);
      expect(JSON.stringify(career)).toBe(snapshot);
    }
  });
  it('os prêmios do modelo são os de racePrizes (a regra de dinheiro de antes), não uma cópia deles', () => {
    const { career, humans } = careerOf(2, 'coop');
    const results = fakeResults({ 0: 2, 1: 6 }, humans);
    const expected = racePrizes(results, humans, true, 1);
    const { report } = settleCareerRace(career, results);
    const model = payoutModel(career, report);
    expect(model.columns.map((c) => c.prize)).toEqual(expected.rows.map((r) => r.prize));
    expect(model.team?.bonus).toBe(expected.teamBonus);
  });
});
