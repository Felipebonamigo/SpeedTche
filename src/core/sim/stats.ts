// Atributos efetivos de cada carro: o CarDef com as melhorias da carreira (humanos) ou com o
// nível da IA aplicados. Calculados uma vez em createRace e guardados em `car.stats` (JSON puro),
// para a corrida ser reproduzível e serializável; física, IA, colisões e co-op leem por carStats().
import {
  HANDLING_MAX, LAUNCH_AI_FULL_SKILL, LAUNCH_AI_MAX_CHANCE, LAUNCH_AI_MIN_SKILL, NITRO_CHARGE_COST, NITRO_METER_MAX, UPGRADE_BRAKES,
  UPGRADE_ENGINE_TOP, UPGRADE_MAX_LEVEL, UPGRADE_NITRO_FILL, UPGRADE_TANK_FUEL, UPGRADE_TIRES_HANDLING, UPGRADE_TURBO_ACCEL,
} from '../constants';
import { carDef } from '../data/cars';
import type { CarDef, CarState, CarStats, NitroSource, RaceConfig, RaceState, UpgradeLevels, UpgradePart } from '../types';

/** Nível dentro de [0, UPGRADE_MAX_LEVEL]; lixo (NaN, infinito, ausente) vale 0. Fracionário é aceito (IA). */
export function clampLevel(v: number | undefined): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  return Math.min(UPGRADE_MAX_LEVEL, Math.max(0, v));
}

/** Atributos do carro `def` com as melhorias `up` (ausente = de fábrica). */
export function effectiveStats(def: CarDef, up?: Partial<UpgradeLevels> | null): CarStats {
  const lv = (part: keyof UpgradeLevels) => clampLevel(up?.[part]);
  return {
    topSpeed: def.topSpeed * (1 + UPGRADE_ENGINE_TOP * lv('engine')),
    accel: def.accel * (1 + UPGRADE_TURBO_ACCEL * lv('turbo')),
    brake: def.brake * (1 + UPGRADE_BRAKES * lv('brakes')),
    handling: Math.max(def.handling, Math.min(HANDLING_MAX, def.handling + UPGRADE_TIRES_HANDLING * lv('tires'))),
    fuelPerUnit: def.fuelPerUnit * (1 - UPGRADE_TANK_FUEL * lv('tank')),
    nitro: 1 + Math.floor(lv('nitro')),
  };
}

/** Atributo que cada peça melhora. */
export const PART_STAT: Readonly<Record<UpgradePart, keyof CarStats>> = {
  engine: 'topSpeed', turbo: 'accel', tires: 'handling', brakes: 'brake', tank: 'fuelPerUnit', nitro: 'nitro',
};

/**
 * Último nível da peça que ainda muda alguma coisa neste carro. É UPGRADE_MAX_LEVEL para quase tudo;
 * os pneus param antes nos carros que batem no teto de dirigibilidade (Tornado RS no 2, Carcará RS
 * no 1). A carreira não vende nível acima disto — seria cobrar por nada.
 */
export function upgradeCap(def: CarDef, part: UpgradePart): number {
  const k = PART_STAT[part];
  let cap = 0;
  for (let level = 1; level <= UPGRADE_MAX_LEVEL; level++) {
    if (effectiveStats(def, { [part]: level })[k] === effectiveStats(def, { [part]: level - 1 })[k]) break;
    cap = level;
  }
  return cap;
}

/** IA da carreira: motor, turbo, pneus e freios no nível `level` (tanque e nitro de fábrica). */
export function aiStats(def: CarDef, level: number): CarStats {
  return effectiveStats(def, { engine: level, turbo: level, tires: level, brakes: level });
}

/** Atributos de um carro da corrida a partir da configuração (humano: suas melhorias; IA: o nível da corrida). */
export function statsFor(config: RaceConfig, car: Pick<CarState, 'seat' | 'carId'>): CarStats {
  const def = carDef(car.carId);
  if (car.seat < 0) return aiStats(def, config.aiLevel ?? 0);
  return effectiveStats(def, config.humans.find((h) => h.seat === car.seat)?.upgrades);
}

/** Atributos de desempenho do carro nesta corrida. Cor e nome continuam no CarDef. */
export function carStats(car: CarState): CarStats {
  return car.stats;
}

// ───────────────────────────── A barra de nitro (onda N, N1) ─────────────────────────────

/** Multiplicador do que a barra enche: 1 de fábrica, +UPGRADE_NITRO_FILL por nível da peça de nitro (CarStats.nitro = 1 + nível). */
export function nitroFillMult(stats: Pick<CarStats, 'nitro'>): number {
  return 1 + UPGRADE_NITRO_FILL * (stats.nitro - 1);
}

/** O humano de um time com `sharedNitro` gasta e ganha na barra da equipe; a IA e quem joga sem o cofre, na do carro. */
function usesTeamBar(state: RaceState, car: CarState): boolean {
  return state.config.assists.sharedNitro && car.seat >= 0;
}

/** A barra de onde o carro gasta e ganha (a da equipe ou a dele), em unidades. */
export function nitroMeterOf(state: RaceState, car: CarState): number {
  return usesTeamBar(state, car) ? (state.teamNitro[car.teamId] ?? 0) : car.nitroMeter;
}

/** Cargas inteiras que o carro pode gastar agora. */
export function nitroCharges(state: RaceState, car: CarState): number {
  return Math.floor(nitroMeterOf(state, car) / NITRO_CHARGE_COST);
}

/** O teto da barra do carro: NITRO_METER_MAX, e NITRO_METER_MAX por humano do time na barra da equipe. */
export function nitroCap(state: RaceState, car: CarState): number {
  if (!usesTeamBar(state, car)) return NITRO_METER_MAX;
  let humans = 0;
  for (const c of state.cars) if (c.seat >= 0 && c.teamId === car.teamId) humans++;
  return NITRO_METER_MAX * Math.max(1, humans);
}

/**
 * Enche a barra de `car` com `base` unidades (vezes a peça de nitro de quem ganhou, arredondado), até o teto. Devolve o que
 * realmente entrou; com a barra cheia, nada entra e nada é emitido. Quem chama decide SE o ganho vale (corrida andando, carro
 * não terminado, resfriamento): aqui só a conta.
 */
export function grantNitro(state: RaceState, car: CarState, source: NitroSource, base: number): number {
  const gain = Math.round(base * nitroFillMult(car.stats));
  const before = nitroMeterOf(state, car);
  const added = Math.max(0, Math.min(nitroCap(state, car), before + gain) - before);
  if (added <= 0) return 0;
  if (usesTeamBar(state, car)) state.teamNitro[car.teamId] = before + added; else car.nitroMeter = before + added;
  state.events.push({ type: 'nitro_gain', carId: car.id, source, amount: added });
  return added;
}

/** Gasta uma carga da barra do carro, se houver; devolve se gastou. */
export function spendNitroCharge(state: RaceState, car: CarState): boolean {
  const before = nitroMeterOf(state, car);
  if (before < NITRO_CHARGE_COST) return false;
  if (usesTeamBar(state, car)) state.teamNitro[car.teamId] = before - NITRO_CHARGE_COST; else car.nitroMeter = before - NITRO_CHARGE_COST;
  return true;
}

/**
 * Chance de a IA acertar a largada-foguete: 0 até LAUNCH_AI_MIN_SKILL, sobe reto até LAUNCH_AI_MAX_CHANCE em LAUNCH_AI_FULL_SKILL.
 * Fica aqui (e o ai.ts a reexporta) porque a física, que faz o sorteio, não pode importar do ai.ts (que já importa dela).
 */
export function launchChance(skill: number): number {
  const t = (skill - LAUNCH_AI_MIN_SKILL) / (LAUNCH_AI_FULL_SKILL - LAUNCH_AI_MIN_SKILL);
  return LAUNCH_AI_MAX_CHANCE * (t < 0 ? 0 : t > 1 ? 1 : t);
}
