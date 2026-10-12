// O próximo objetivo (onda N, N5): três metas, uma curta, uma média e uma longa, calculadas só com leitura (sem DOM, sem `Date`,
// sem aleatoriedade, nada muda no save). A curta é a próxima compra e respeita `walletOf`: no co-op o dono do dinheiro é o cofre da
// equipe (uma meta só, com as compras de todos os pilotos), no versus é a carteira de cada assento (uma meta por piloto).
// O texto sai de `src/expedition/strings.ts`; aqui só vão o id e as variáveis. Desenho e números: docs/ondas/N/N5.md §4.1.
import { levelsOf, ownsCar, upgradePrice, UPGRADE_PARTS, walletOf, type CareerState } from '../core/career';
import { CARS } from '../core/data/cars';
import { CUPS } from '../core/data/cups';
import type { CarDef, CupDef, UpgradePart } from '../core/types';
import type { SaveData } from './contracts';

export type GoalTerm = 'short' | 'medium' | 'long';
export type GoalId =
  | 'startExpedition' | 'canBuy' | 'saveFor' | 'allBought'
  | 'firstCup' | 'finishCup' | 'expeditionDone'
  | 'stamps' | 'worldCircuit' | 'collection';

export interface Goal {
  term: GoalTerm;
  id: GoalId;
  /** Dono da carteira (versus: o assento; solo e co-op: 0); `null` nas metas que não são de dinheiro. */
  driver: number | null;
  /** Variáveis do texto: `item` ('part' | 'car'), `ref` (peça ou carro), `price`, `missing`, `cup`, `n`, `m`, `have`, `total`, `left`. */
  vars: Record<string, string | number>;
  /** Progresso de 0 a 1 para a barrinha; `null` quando não há o que medir. */
  progress: number | null;
}

export interface GoalsView {
  /** Uma por dono de carteira: 1 no solo e no co-op (o cofre), uma por piloto no versus. */
  short: Goal[];
  medium: Goal | null;
  long: Goal | null;
}

export interface GoalsInput {
  career: CareerState | null;
  save: Pick<SaveData, 'cupsCompleted' | 'stamps' | 'carsUnlocked'>;
  cups?: readonly CupDef[];
  cars?: readonly CarDef[];
}

interface Option { item: 'part' | 'car'; ref: string; price: number }

/** As compras possíveis de um piloto: o próximo nível de cada peça do carro escolhido e os carros à venda que ainda não são dele. */
function optionsOf(career: CareerState, driver: number, cars: readonly CarDef[]): Option[] {
  const d = career.drivers[driver];
  if (!d) return [];
  const out: Option[] = [];
  const levels = levelsOf(d.garage, d.garage.carId);
  for (const part of UPGRADE_PARTS as readonly UpgradePart[]) {
    const price = upgradePrice(part, levels[part], d.garage.carId);
    if (price !== null) out.push({ item: 'part', ref: part, price });
  }
  for (const car of cars) if (car.price > 0 && !ownsCar(d.garage, car.id)) out.push({ item: 'car', ref: car.id, price: car.price });
  return out;
}

function shortGoal(career: CareerState, owner: number, cars: readonly CarDef[]): Goal {
  // Co-op: o cofre é de todos, então todas as garagens entram; versus e solo: só a do dono da carteira.
  const drivers = career.coop ? career.drivers.map((_, i) => i) : [owner];
  const options = drivers.flatMap((i) => optionsOf(career, i, cars));
  if (options.length === 0) return { term: 'short', id: 'allBought', driver: owner, vars: {}, progress: 1 };
  const best = options.reduce((a, b) => (b.price < a.price ? b : a));
  const wallet = walletOf(career, owner);
  const vars = { item: best.item, ref: best.ref, price: best.price };
  if (wallet >= best.price) return { term: 'short', id: 'canBuy', driver: owner, vars, progress: 1 };
  return { term: 'short', id: 'saveFor', driver: owner, vars: { ...vars, missing: best.price - wallet }, progress: Math.max(0, wallet) / best.price };
}

export function nextGoals(input: GoalsInput): GoalsView {
  const { career, save } = input;
  const cups = input.cups ?? CUPS;
  const cars = input.cars ?? CARS;
  const stateCups = cups.filter((c) => c.stage === 'brasil' && c.state);
  const worldCups = cups.filter((c) => c.stage === 'mundial');
  const forSale = cars.filter((c) => c.price > 0);

  // Curta.
  const short: Goal[] = [];
  if (!career) short.push({ term: 'short', id: 'startExpedition', driver: null, vars: {}, progress: null });
  else {
    const owners = career.coop ? [0] : career.drivers.map((_, i) => i);
    for (const owner of owners) short.push(shortGoal(career, owner, cars));
  }

  // Média: a copa de agora.
  let medium: Goal | null;
  if (!career) {
    const first = cups.find((c) => !save.cupsCompleted.includes(c.id)) ?? cups[0];
    medium = first ? { term: 'medium', id: 'firstCup', driver: null, vars: { cup: first.id }, progress: null } : null;
  } else if (career.completed) {
    medium = { term: 'medium', id: 'expeditionDone', driver: null, vars: {}, progress: 1 };
  } else {
    const cup = cups.find((c) => c.id === career.cupId);
    const m = cup?.trackIds.length ?? 0;
    const done = Math.min(m, career.champ?.raceIndex ?? 0);
    medium = { term: 'medium', id: 'finishCup', driver: null, vars: { cup: career.cupId, n: Math.min(m, done + 1), m }, progress: m > 0 ? done / m : null };
  }

  // Longa: o passaporte, depois o Mundial, depois a coleção de carros.
  let long: Goal | null = null;
  const have = Math.min(stateCups.length, save.stamps.length);
  if (have < stateCups.length) {
    long = { term: 'long', id: 'stamps', driver: null, vars: { have, total: stateCups.length }, progress: stateCups.length > 0 ? have / stateCups.length : null };
  } else {
    const left = worldCups.filter((c) => !save.cupsCompleted.includes(c.id)).length;
    if (left > 0) {
      long = { term: 'long', id: 'worldCircuit', driver: null, vars: { left, total: worldCups.length }, progress: (worldCups.length - left) / worldCups.length };
    } else {
      const owned = forSale.filter((c) => save.carsUnlocked.includes(c.id)).length;
      if (owned < forSale.length) long = { term: 'long', id: 'collection', driver: null, vars: { have: owned, total: forSale.length }, progress: owned / forSale.length };
    }
  }
  return { short, medium, long };
}
