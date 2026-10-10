// O estado é JSON puro, então serializar é trivial. O hash serve ao lockstep (comparar máquinas).
import { COUNTDOWN_TICKS, LAUNCH_NONE, LAUNCH_PENDING, LAUNCH_PERFECT, LAUNCH_WINDOW_LATE_TICKS, NITRO_CHARGE_COST, NITRO_METER_MAX, NITRO_SLING_COOLDOWN_TICKS, NITRO_START_METER } from './constants';
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
  // Barra de nitro e largada-foguete (N1): estado anterior (com `nitroLeft`, em cargas) vira barra; o que falta ganha o padrão.
  normalizeNitro(s);
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

/** Número finito ou `undefined` (o que o JSON de um estado velho ou mal formado traz no lugar). */
function finite(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * A barra de nitro e a largada-foguete (onda N, N1). Um estado de antes dela (nenhum carro tem `nitroMeter`) guardava CARGAS: em
 * `nitroLeft` por carro e em `teamNitro` por time; cada carga vira NITRO_CHARGE_COST e a barra passa a ter o teto (3 cargas por
 * carro, 3 por humano do time na barra da equipe). Num estado novo, o que não for número vira o padrão e o que passar do teto
 * é cortado nele. A largada de um estado antigo que já passou da janela está encerrada; na contagem, pendente.
 */
function normalizeNitro(s: RaceState): void {
  const cars = s.cars as Array<CarState & { nitroLeft?: unknown }>;
  const legacy = cars.length > 0 && cars.every((c) => c.nitroMeter === undefined);
  for (const c of cars) {
    const raw = legacy ? (finite(c.nitroLeft) ?? 1) * NITRO_CHARGE_COST : finite(c.nitroMeter);
    c.nitroMeter = raw === undefined ? NITRO_START_METER : Math.min(NITRO_METER_MAX, Math.max(0, Math.round(raw)));
    delete c.nitroLeft;
    c.throttleHeld = ticksOrZero(c.throttleHeld);
    c.gainLock = ticksOrZero(c.gainLock);
    // Negativo é o resfriamento do estilingue: inteiro entre −NITRO_SLING_COOLDOWN_TICKS e o que couber; o resto é 0.
    c.draftTicks = Number.isInteger(c.draftTicks) && c.draftTicks >= -NITRO_SLING_COOLDOWN_TICKS ? c.draftTicks : 0;
    const fresh = s.tick <= COUNTDOWN_TICKS + LAUNCH_WINDOW_LATE_TICKS;
    c.launch = c.launch === LAUNCH_PENDING || c.launch === LAUNCH_PERFECT || c.launch === LAUNCH_NONE ? c.launch : fresh ? LAUNCH_PENDING : LAUNCH_NONE;
  }
  const teams: Record<number, number> = {};
  for (const [key, v] of Object.entries(s.teamNitro)) {
    const team = Number(key);
    let humans = 0;
    for (const c of cars) if (c.seat >= 0 && c.teamId === team) humans++;
    const raw = finite(v);
    const units = raw === undefined ? 0 : legacy ? raw * NITRO_CHARGE_COST : raw;
    teams[team] = Math.min(NITRO_METER_MAX * Math.max(1, humans), Math.max(0, Math.round(units)));
  }
  s.teamNitro = teams;
}

/**
 * Hash barato do que importa para detectar dessincronização entre clientes. Leva os 4 campos da derrapagem (sem eles a
 * checagem a cada 60 ticks não veria um cliente que derrapa e outro que não) e, desde a N1, a barra de nitro, o contador da largada,
 * a largada decidida, o vácuo e o anti-farm de cada carro, mais a barra da equipe.
 */
export function hashRace(state: RaceState): number {
  const parts: string[] = [String(state.tick), state.phase, String(state.rng.s)];
  for (const c of state.cars) {
    parts.push(`${c.id}:${c.z.toFixed(3)}:${c.x.toFixed(4)}:${c.speed.toFixed(3)}:${c.lap}:${c.fuel.toFixed(5)}:${c.nitroMeter}:${c.driftDir}:${c.driftTicks}:${c.driftCharge}:${c.driftBoostTicks}:${c.throttleHeld}:${c.launch}:${c.draftTicks}:${c.gainLock}`);
  }
  // Chaves numéricas saem em ordem crescente: a barra da equipe de cada time, igual em toda máquina.
  parts.push(JSON.stringify(state.teamNitro));
  return hashString(parts.join('|'));
}
