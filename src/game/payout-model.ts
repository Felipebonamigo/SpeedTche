// O modelo do Pagamento (onda N, N4; docs/ondas/N/N4.md §4.2). Puro: lê o que a carreira JÁ fechou (`settleCareerRace` credita e grava
// `lastReport`; `walletOf` dá o saldo) e monta o que a tela conta na tela: as linhas do prêmio, a carteira de antes → depois e o
// "Já dá para". **Nenhuma regra de dinheiro mora aqui**: prêmios, bônus e eliminação são os do relatório; este módulo só mostra,
// e a linha do tempo só decide em que instante cada número aparece.
import { ownsCar, partMaxLevel, levelsOf, UPGRADE_PARTS, upgradePrice, walletOf, type CareerReport, type CareerState } from '../core/career';
import { CARS } from '../core/data/cars';
import type { UpgradePart } from '../core/types';
import { POST_STEP_SECONDS } from './post-race';

/** O que o dinheiro novo passou a comprar. */
export interface PayoutBuy {
  kind: 'part' | 'car';
  /** Piloto que usa o item (no co-op o cofre compra para qualquer um). */
  driver: number;
  /** Para `part`, o carro que leva a melhoria; para `car`, o carro à venda. */
  carId: string;
  part?: UpgradePart;
  /** Nível que a compra leva a peça (1 a 3). */
  level?: number;
  price: number;
}

export interface PayoutWallet {
  before: number;
  after: number;
  canBuy: PayoutBuy | null;
}

export interface PayoutColumn {
  driver: number;
  name: string;
  carId: string;
  position: number;
  prize: number;
  /** `allowance` = a ajuda de custo de quem foi eliminado (metade do prêmio, nunca menos que a de participação). */
  kind: 'position' | 'allowance';
  /** A carteira do piloto (versus e solo); `null` no co-op, onde o dinheiro vai todo para o cofre. */
  wallet: PayoutWallet | null;
}

export interface PayoutModel {
  coop: boolean;
  eliminated: boolean;
  columns: PayoutColumn[];
  /** Co-op: o bônus da equipe pela colocação dela na corrida. */
  team: { rank: number; bonus: number } | null;
  /** Co-op: o cofre da equipe. */
  vault: PayoutWallet | null;
}

/**
 * O próximo item que o dinheiro de `drivers` passa a comprar: o que **cruzou** o preço com este pagamento (`antes < preço ≤ depois`),
 * entre a próxima melhoria do carro que o piloto leva e os carros à venda que ele ainda não tem. Fica o mais caro; sem cruzamento,
 * `null` (o que já cabia antes não é novidade).
 */
function newlyAffordable(career: CareerState, drivers: readonly number[], before: number, after: number): PayoutBuy | null {
  let best: PayoutBuy | null = null;
  const consider = (item: PayoutBuy): void => {
    if (item.price <= before || item.price > after) return;
    if (!best || item.price > best.price) best = item;
  };
  for (const driver of drivers) {
    const d = career.drivers[driver];
    if (!d) continue;
    const carId = d.garage.carId;
    const levels = levelsOf(d.garage, carId);
    for (const part of UPGRADE_PARTS) {
      if (levels[part] >= partMaxLevel(carId, part)) continue;
      const price = upgradePrice(part, levels[part], carId);
      if (price !== null) consider({ kind: 'part', driver, carId, part, level: levels[part] + 1, price });
    }
    for (const car of CARS) {
      if (car.price > 0 && !ownsCar(d.garage, car.id)) consider({ kind: 'car', driver, carId: car.id, price: car.price });
    }
  }
  return best;
}

/** O pagamento de uma corrida da carreira, lido depois de somada. Não altera `career`. */
export function payoutModel(career: CareerState, report: CareerReport): PayoutModel {
  const eliminated = report.verdict === 'eliminated';
  const all = career.drivers.map((_, i) => i);
  const credited = (driver: number) => report.rows.find((r) => r.driver === driver)?.prize ?? 0;

  if (career.coop) {
    const after = walletOf(career, 0);
    const total = report.rows.reduce((s, r) => s + r.prize, 0) + report.teamBonus;
    const before = Math.max(0, after - total);
    return {
      coop: true, eliminated,
      columns: report.rows.map((r) => ({
        driver: r.driver, name: career.drivers[r.driver]?.name ?? `P${r.driver + 1}`, carId: career.drivers[r.driver]?.garage.carId ?? '',
        position: r.position, prize: r.prize, kind: eliminated ? 'allowance' : 'position', wallet: null,
      })),
      team: report.teamBonus > 0 ? { rank: report.teamRank, bonus: report.teamBonus } : null,
      vault: { before, after, canBuy: newlyAffordable(career, all, before, after) },
    };
  }
  return {
    coop: false, eliminated,
    columns: report.rows.map((r) => {
      const after = walletOf(career, r.driver);
      const before = Math.max(0, after - credited(r.driver));
      return {
        driver: r.driver, name: career.drivers[r.driver]?.name ?? `P${r.driver + 1}`, carId: career.drivers[r.driver]?.garage.carId ?? '',
        position: r.position, prize: r.prize, kind: eliminated ? 'allowance' : 'position',
        wallet: { before, after, canBuy: newlyAffordable(career, [r.driver], before, after) },
      } satisfies PayoutColumn;
    }),
    team: null,
    vault: null,
  };
}

// ───────────────────────────── A linha do tempo da contagem ─────────────────────────────

/** Uma moeda em voo: sai da linha do prêmio (`source`; -1 = o bônus da equipe) e cai na carteira `target`. */
export interface PayoutCoin {
  source: number;
  target: number;
  at: number;
  dur: number;
}

export interface PayoutTimeline {
  /** A duração do passo (o relógio do pós-corrida). */
  duration: number;
  countStart: number;
  countDur: number;
  teamStart: number;
  teamDur: number;
  walletStart: number;
  walletDur: number;
  /** O instante em que "Já dá para" aparece. */
  buyAt: number;
  /** Vazio com `reduceEffects`. */
  coins: PayoutCoin[];
  reduce: boolean;
}

const COUNT_START = 0.4;
const COUNT_DUR = 1.2;
const TEAM_DUR = 0.8;
const WALLET_DUR = 2.0;
const COIN_FLIGHT = 0.5;
const COIN_GAP = 0.14;
const SOURCE_GAP = 0.1;
const BUY_FLASH = 0.5;
/** Uma moeda a cada tanto de dinheiro (de 1 a 6 por linha): o tamanho do prêmio se vê na chuva. */
const COIN_UNIT = 800;
const COINS_MAX = 6;

export function payoutTimeline(model: PayoutModel, reduce: boolean): PayoutTimeline {
  const countEnd = COUNT_START + COUNT_DUR;
  const teamStart = countEnd + 0.1;
  const walletStart = (model.team ? teamStart + TEAM_DUR : countEnd) + 0.2;
  const coins: PayoutCoin[] = [];
  if (!reduce) {
    const sources: Array<{ source: number; amount: number; target: number }> = model.columns.map((c, i) => ({ source: i, amount: c.prize, target: model.coop ? 0 : i }));
    if (model.team) sources.push({ source: -1, amount: model.team.bonus, target: 0 });
    sources.forEach((s, k) => {
      const n = Math.min(COINS_MAX, Math.max(1, Math.round(s.amount / COIN_UNIT)));
      if (s.amount <= 0) return;
      for (let i = 0; i < n; i++) coins.push({ source: s.source, target: s.target, at: walletStart + k * SOURCE_GAP + i * COIN_GAP, dur: COIN_FLIGHT });
    });
  }
  return {
    duration: POST_STEP_SECONDS.payout, countStart: COUNT_START, countDur: COUNT_DUR, teamStart, teamDur: TEAM_DUR,
    walletStart, walletDur: WALLET_DUR, buyAt: walletStart + WALLET_DUR + 0.3, coins, reduce,
  };
}

export interface PayoutFrame {
  /** O prêmio de cada coluna contado até agora. */
  rows: number[];
  /** O bônus da equipe contado até agora (0 fora do co-op). */
  team: number;
  /** Co-op: [cofre]; senão, a carteira de cada coluna. */
  wallets: number[];
  /** "Já dá para" visível. */
  buy: boolean;
  /** Quantas moedas já pousaram. */
  landed: number;
  flying: Array<{ coin: number; source: number; target: number; progress: number }>;
  /** O clarão do "Já dá para" (0..1); sempre 0 com `reduceEffects`. */
  flash: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (p: number) => 1 - (1 - clamp01(p)) ** 3;

/** `from → to` por `p` (0..1), em passos de 10 (dinheiro do jogo é múltiplo de 10) e exato nas pontas. */
function mix(from: number, to: number, p: number): number {
  if (p <= 0) return from;
  if (p >= 1) return to;
  return from + Math.round(((to - from) * easeOut(p)) / 10) * 10;
}

/** O que mostrar no instante `t` (segundos dentro do passo do pagamento). Em `t ≥ duração`, os números do relatório. */
export function payoutFrame(tl: PayoutTimeline, model: PayoutModel, t: number): PayoutFrame {
  const countP = (t - tl.countStart) / tl.countDur;
  const teamP = (t - tl.teamStart) / tl.teamDur;
  const walletP = (t - tl.walletStart) / tl.walletDur;
  const walletsDef = model.vault ? [model.vault] : model.columns.map((c) => c.wallet);
  const buys = walletsDef.some((w) => w?.canBuy);
  const buyOn = buys && t >= tl.buyAt;
  const flying: PayoutFrame['flying'] = [];
  let landed = 0;
  tl.coins.forEach((c, coin) => {
    if (t >= c.at + c.dur) landed++;
    else if (t >= c.at) flying.push({ coin, source: c.source, target: c.target, progress: (t - c.at) / c.dur });
  });
  return {
    rows: model.columns.map((c) => mix(0, c.prize, countP)),
    team: model.team ? mix(0, model.team.bonus, teamP) : 0,
    wallets: walletsDef.map((w) => (w ? mix(w.before, w.after, walletP) : 0)),
    buy: buyOn,
    landed, flying,
    flash: !tl.reduce && buyOn && t < tl.buyAt + BUY_FLASH ? 1 - (t - tl.buyAt) / BUY_FLASH : 0,
  };
}
