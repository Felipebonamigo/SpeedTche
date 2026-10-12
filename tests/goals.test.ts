// N5: o próximo objetivo (src/game/goals.ts, puro). A meta curta é a próxima compra e respeita walletOf: o cofre no co-op, a carteira
// de cada assento no versus. Escrito antes do módulo (docs/ondas/N/N5.md §6-A).
import { describe, expect, it } from 'vitest';
import { newCareer, NO_UPGRADES, upgradePrice, UPGRADE_PARTS, walletOf, type CareerState } from '../src/core/career';
import { CARS } from '../src/core/data/cars';
import { CUPS } from '../src/core/data/cups';
import { nextGoals, type GoalsView } from '../src/game/goals';
import { human } from './helpers';

const STATE_CUPS = CUPS.filter((c) => c.stage === 'brasil');
const WORLD_CUPS = CUPS.filter((c) => c.stage === 'mundial');
const FOR_SALE = CARS.filter((c) => c.price > 0);
const noSave = { cupsCompleted: [] as string[], stamps: [] as string[], carsUnlocked: [] as string[] };

/** O item mais barato que um piloto de garagem nova pode comprar: a meta curta dele. */
const cheapest = Math.min(
  ...UPGRADE_PARTS.map((p) => upgradePrice(p, 0, 'falcao') ?? Infinity),
  ...FOR_SALE.map((c) => c.price),
);

const solo = (): CareerState => newCareer([human(0, 0)]);
const coop = (): CareerState => newCareer([human(0, 0, 'falcao'), human(1, 0, 'tornado')]);
const versus = (): CareerState => newCareer([human(0, 0), human(1, 1)]);

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}

describe('goals: sem Expedição', () => {
  it('curta é começar a Expedição, média é a 1ª copa e longa o passaporte 0/27', () => {
    const g = nextGoals({ career: null, save: noSave });
    expect(g.short.map((x) => x.id)).toEqual(['startExpedition']);
    expect(g.medium).toMatchObject({ id: 'firstCup', vars: { cup: CUPS[0].id } });
    expect(g.long).toMatchObject({ id: 'stamps', vars: { have: 0, total: STATE_CUPS.length } });
  });

  it('a "1ª copa" é a primeira ainda não concluída (quem só tinha campeonato vê o passaporte de verdade)', () => {
    const save = { ...noSave, cupsCompleted: [CUPS[0].id, CUPS[1].id], stamps: ['RJ', 'SP'] };
    const g = nextGoals({ career: null, save });
    expect(g.medium).toMatchObject({ id: 'firstCup', vars: { cup: CUPS[2].id } });
    expect(g.long).toMatchObject({ id: 'stamps', vars: { have: 2, total: STATE_CUPS.length } });
  });
});

describe('goals: a meta curta respeita walletOf', () => {
  it('solo: carteira que cobre o item mais barato é "dá para comprar"; a que não cobre diz quanto falta', () => {
    const rich = solo(); rich.wallets[0] = 9_999;
    expect(nextGoals({ career: rich, save: noSave }).short[0]).toMatchObject({ id: 'canBuy', driver: 0 });
    const poor = solo(); poor.wallets[0] = cheapest - 700;
    const g = nextGoals({ career: poor, save: noSave }).short;
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ id: 'saveFor', driver: 0, vars: { price: cheapest, missing: 700 } });
    expect(g[0].progress).toBeCloseTo((cheapest - 700) / cheapest, 5);
  });

  it('co-op: UMA meta, calculada sobre o cofre, e a compra pode ser da garagem de qualquer dos pilotos', () => {
    const c = coop();
    expect(c.wallets).toHaveLength(1);
    c.wallets[0] = cheapest - 100;
    const g = nextGoals({ career: c, save: noSave }).short;
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ id: 'saveFor', driver: 0, vars: { missing: 100 } });
    // O piloto 2 já tem o 1º nível de tudo no Tornado; o item mais barato do cofre passa a ser o 2º nível das peças dele ou do piloto 1.
    for (const p of UPGRADE_PARTS) c.drivers[1].garage.upgrades.tornado = { ...NO_UPGRADES, ...(c.drivers[1].garage.upgrades.tornado ?? {}), [p]: 1 };
    c.wallets[0] = 0;
    const after = nextGoals({ career: c, save: noSave }).short[0];
    expect(after.id).toBe('saveFor');
    // O Falcão do piloto 1 continua no nível 0: a meta é a mais barata entre as DUAS garagens.
    expect(after.vars.price).toBe(cheapest);
  });

  it('versus: uma meta por piloto, cada uma com a carteira DELE (usar wallets[0] para todos falharia)', () => {
    const c = versus();
    expect(c.wallets).toHaveLength(2);
    c.wallets[0] = 100;
    c.wallets[1] = 9_000;
    expect(walletOf(c, 0)).toBe(100);
    expect(walletOf(c, 1)).toBe(9_000);
    const g = nextGoals({ career: c, save: noSave }).short;
    expect(g.map((x) => [x.driver, x.id])).toEqual([[0, 'saveFor'], [1, 'canBuy']]);
    expect(g[0].vars.missing).toBe(cheapest - 100);
  });

  it('nada mais a comprar: "allBought"', () => {
    const c = solo(); c.wallets[0] = 5;
    for (const car of FOR_SALE) c.drivers[0].garage.owned.push(car.id);
    for (const car of CARS) {
      const max = Object.fromEntries(UPGRADE_PARTS.map((p) => [p, 3]));
      c.drivers[0].garage.upgrades[car.id] = { ...NO_UPGRADES, ...max };
    }
    // `partMaxLevel` limita pneus etc.: o nível 3 em tudo é o teto ou passa dele, e `upgradePrice` devolve null nos dois casos.
    expect(nextGoals({ career: c, save: noSave }).short.map((x) => x.id)).toEqual(['allBought']);
  });
});

describe('goals: média e longa', () => {
  it('média acompanha a corrida da copa atual', () => {
    const c = solo();
    c.champ = { cupId: c.cupId, raceIndex: 1, standings: [], teams: [], coop: false, eliminated: false, completed: false, lastRace: null, lastVerdict: null };
    const g = nextGoals({ career: c, save: noSave });
    expect(g.medium).toMatchObject({ id: 'finishCup', vars: { cup: c.cupId, n: 2, m: CUPS[0].trackIds.length } });
    expect(g.medium?.progress).toBeCloseTo(1 / CUPS[0].trackIds.length, 5);
  });

  it('Expedição concluída: "expeditionDone"', () => {
    const c = solo(); c.completed = true;
    expect(nextGoals({ career: c, save: noSave }).medium?.id).toBe('expeditionDone');
  });

  it('longa: carimbos, depois o Mundial, depois a coleção, depois nada', () => {
    const all = STATE_CUPS.map((c) => c.state as string);
    const stamps = nextGoals({ career: null, save: { ...noSave, stamps: all.slice(0, 5) } }).long;
    expect(stamps).toMatchObject({ id: 'stamps', vars: { have: 5, total: 27 } });
    const states = { ...noSave, stamps: all, cupsCompleted: STATE_CUPS.map((c) => c.id) };
    expect(nextGoals({ career: null, save: states }).long).toMatchObject({ id: 'worldCircuit', vars: { left: WORLD_CUPS.length } });
    const world = { ...states, cupsCompleted: CUPS.map((c) => c.id) };
    expect(nextGoals({ career: null, save: world }).long).toMatchObject({ id: 'collection', vars: { have: 0, total: FOR_SALE.length } });
    const everything = { ...world, carsUnlocked: FOR_SALE.map((c) => c.id) };
    expect(nextGoals({ career: null, save: everything }).long).toBeNull();
  });
});

describe('goals: é leitura pura', () => {
  it('não muda a carreira nem o save (congelados) e dá o mesmo resultado duas vezes', () => {
    const c = deepFreeze(versus());
    const save = deepFreeze({ ...noSave });
    const a: GoalsView = nextGoals({ career: c, save });
    const b: GoalsView = nextGoals({ career: c, save });
    expect(b).toEqual(a);
  });
});
