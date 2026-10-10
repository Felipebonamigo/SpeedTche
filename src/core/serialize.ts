// O estado é JSON puro, então serializar é trivial. O hash serve ao lockstep (comparar máquinas).
import { hashString } from './rng';
import { normalizeParty } from './modes';
import { statsFor } from './sim/stats';
import type { CarState, RaceState } from './types';

export function serializeRace(state: RaceState): string {
  return JSON.stringify(state);
}

export function deserializeRace(json: string): RaceState {
  const s = JSON.parse(json) as RaceState;
  if (!Array.isArray(s.cars) || typeof s.tick !== 'number') throw new Error('Estado de corrida inválido');
  s.events = s.events ?? [];
  s.teamNitro = s.teamNitro ?? {};
  // Ritmo da IA (carreira, RaceConfig.aiPace): ausente vale 0 e continua AUSENTE — gravar 0 aqui mudaria o JSON do
  // estado (tests/determinism.test.ts, "sobrevive a serializar e desserializar"). Lixo vira ausente.
  if (s.config && (typeof s.config.aiPace !== 'number' || !Number.isFinite(s.config.aiPace))) delete s.config.aiPace;
  // Estado anterior às melhorias da carreira: atributos recalculados da configuração.
  for (const c of s.cars) if (!c.stats) c.stats = statsFor(s.config, c);
  // Derrapagem (M1): estado anterior a ela, ou vindo da rede num snapshot, ganha o padrão; lixo vira 0 (nada de NaN no hash).
  for (const c of s.cars) normalizeDrift(c);
  // Modos de festa (modes.ts): ausente = corrida normal; campos que faltam ganham o padrão.
  const party = normalizeParty(s.party);
  if (party) s.party = party; else delete s.party;
  return s;
}

/** Contador de ticks: inteiro finito ≥ 0; qualquer outra coisa vale 0. */
function ticksOrZero(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0;
}

/** Os 4 campos da derrapagem (types.ts: CarState): lado -1/0/1 e três contadores; o que não for isso vira 0. */
function normalizeDrift(c: CarState): void {
  c.driftDir = c.driftDir === 1 || c.driftDir === -1 ? c.driftDir : 0;
  c.driftTicks = ticksOrZero(c.driftTicks);
  c.driftCharge = ticksOrZero(c.driftCharge);
  c.driftBoostTicks = ticksOrZero(c.driftBoostTicks);
}

/**
 * Hash barato do que importa para detectar dessincronização entre clientes. Leva os 4 campos da derrapagem: sem eles a
 * checagem a cada 60 ticks não veria um cliente que derrapa e outro que não.
 */
export function hashRace(state: RaceState): number {
  const parts: string[] = [String(state.tick), state.phase, String(state.rng.s)];
  for (const c of state.cars) {
    parts.push(`${c.id}:${c.z.toFixed(3)}:${c.x.toFixed(4)}:${c.speed.toFixed(3)}:${c.lap}:${c.fuel.toFixed(5)}:${c.nitroLeft}:${c.driftDir}:${c.driftTicks}:${c.driftCharge}:${c.driftBoostTicks}`);
  }
  return hashString(parts.join('|'));
}
