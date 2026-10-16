// Progresso que fica (onda O, O5; docs/ondas/O/O5.md): nível do piloto e maestria por carro, em todos os modos, por PERFIL (o nome do
// lobby, a mesma chave das estatísticas e das estrelas) e **sem dinheiro**. Puro, fora o par `loadProgress`/`saveProgress` no fim.
//
// - O NÍVEL não é gravado: sai das estatísticas que o save já guarda por perfil (`stats.players`: corridas, voltas, pódios, vitórias, que
//   todo modo soma, inclusive o online e a festa). A conta do XP é linear nos contadores, então o XP de uma corrida é o XP da contribuição
//   dela às estatísticas, e um save antigo já abre com o nível que merece — sem migração, e a 0.1.4, que continua somando as estatísticas,
//   nunca o desfaz.
// - A MAESTRIA é o dado novo (o XP feito com cada carro), numa chave própria (`speed-tche.progress`) que a 0.1.4 não lê nem grava.
// - O que cada degrau libera: títulos e molduras (nível) e três itens do catálogo da N3 (maestria daquele carro). O cadeado de cosmético é
//   só do seletor: o save e a rede aceitam todo id do catálogo (cosmetics.ts), e o valor atual de um campo nunca é tirado de ninguém.
import { CARS } from '../core/data/cars';
import { carIndexOfSeat } from '../core/modes';
import type { RaceState } from '../core/types';
import { readJson, writeJson } from './storage';
import { MAX_PROFILES, cleanName, profileKey, type Contribution, type PlayerStats, type StatsData } from './stats';

/** Chave do armazenamento (vai para o arquivo e a Steam Cloud como toda `speed-tche.*`, cloudsave.ts). */
export const PROGRESS_KEY = 'speed-tche.progress';

// ───────────────────────────── XP e nível (a confirmar pelo dono) ─────────────────────────────

/** Por corrida corrida até o fim (qualquer modo). */
export const XP_RACE = 20;
/** Por volta completada até a chegada. */
export const XP_LAP = 10;
/** Por pódio (1º a 3º; fora do contra-relógio). */
export const XP_PODIUM = 20;
/** A mais pela vitória (a vitória também conta o pódio: 1º = +50). */
export const XP_WIN = 30;
export const MAX_LEVEL = 30;
/** Do nível n ao n+1: LEVEL_BASE + LEVEL_STEP·(n−1) XP (nível 2 com 100, 5 com 550, 10 com 1.800, 30 com 13.050). */
const LEVEL_BASE = 100;
const LEVEL_STEP = 25;

/** XP de um conjunto de contadores (um perfil inteiro ou a contribuição de uma corrida). Linear: somar contadores é somar XP. */
export function xpOfStats(s: Pick<PlayerStats, 'races' | 'laps' | 'podiums' | 'wins'>): number {
  return s.races * XP_RACE + s.laps * XP_LAP + s.podiums * XP_PODIUM + s.wins * XP_WIN;
}

/** XP total para chegar ao `level` (o 1 é 0). */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level))) - 1;
  return LEVEL_BASE * n + (LEVEL_STEP * n * (n - 1)) / 2;
}

/** Um degrau: o nível, o XP total, quanto já andou no degrau atual e quanto ele pede (0 no teto). */
export interface LevelInfo {
  level: number;
  xp: number;
  into: number;
  need: number;
}

function safeXp(xp: number): number {
  return Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
}

export function levelOf(xp: number): LevelInfo {
  const v = safeXp(xp);
  let level = 1;
  while (level < MAX_LEVEL && v >= xpForLevel(level + 1)) level++;
  if (level >= MAX_LEVEL) return { level: MAX_LEVEL, xp: v, into: 0, need: 0 };
  return { level, xp: v, into: v - xpForLevel(level), need: xpForLevel(level + 1) - xpForLevel(level) };
}

/** Títulos por nível (o mostrado é o mais alto já ganho). Os ids são do texto (`progress.title.<id>`). */
export const TITLES: ReadonlyArray<{ level: number; id: string }> = Object.freeze([
  { level: 1, id: 'estreante' }, { level: 4, id: 'piloto' }, { level: 8, id: 'as' }, { level: 12, id: 'fera' },
  { level: 17, id: 'veterano' }, { level: 22, id: 'craque' }, { level: 26, id: 'lenda' }, { level: 30, id: 'lenda_tche' },
]);

/** Molduras do distintivo do nível; abaixo da primeira, a 'base'. */
export const FRAMES: ReadonlyArray<{ level: number; id: string }> = Object.freeze([
  { level: 5, id: 'bronze' }, { level: 10, id: 'prata' }, { level: 20, id: 'ouro' }, { level: 30, id: 'nitro' },
]);
export const BASE_FRAME = 'base';

function highest(list: ReadonlyArray<{ level: number; id: string }>, level: number, fallback: string): string {
  let out = fallback;
  for (const x of list) if (level >= x.level) out = x.id;
  return out;
}

export function titleFor(level: number): string {
  return highest(TITLES, level, TITLES[0].id);
}

export function frameFor(level: number): string {
  return highest(FRAMES, level, BASE_FRAME);
}

/** O piloto de um perfil, lido das estatísticas (quem nunca correu é nível 1, sem XP). */
export interface PilotView {
  name: string;
  xp: number;
  level: LevelInfo;
  title: string;
  frame: string;
}

export function pilotOf(stats: StatsData, name: string): PilotView {
  const key = profileKey(name);
  const p = stats.players.find((x) => profileKey(x.name) === key);
  const xp = p ? xpOfStats(p) : 0;
  const level = levelOf(xp);
  return { name: p?.name ?? cleanName(name), xp, level, title: titleFor(level.level), frame: frameFor(level.level) };
}

// ───────────────────────────── Maestria por carro ─────────────────────────────

/** XP acumulado com o carro para cada maestria (1 a 5). */
export const MASTERY_XP: readonly number[] = Object.freeze([150, 400, 800, 1400, 2200]);
export const MAX_MASTERY = MASTERY_XP.length;
/** Teto do XP por carro no arquivo (proteção contra save adulterado). */
const CAR_XP_MAX = 99_999_999;

export function masteryOf(xp: number): LevelInfo {
  const v = safeXp(xp);
  let level = 0;
  while (level < MAX_MASTERY && v >= MASTERY_XP[level]) level++;
  if (level >= MAX_MASTERY) return { level: MAX_MASTERY, xp: v, into: 0, need: 0 };
  const from = level === 0 ? 0 : MASTERY_XP[level - 1];
  return { level, xp: v, into: v - from, need: MASTERY_XP[level] - from };
}

/** O que a maestria de um carro libera NAQUELE carro (ids do catálogo da N3, src/game/cosmetics.ts). A confirmar pelo dono. */
export const MASTERY_REWARDS: ReadonlyArray<{ mastery: number; field: 'finish' | 'rim'; value: string }> = Object.freeze([
  { mastery: 1, field: 'rim', value: 'dourado' },
  { mastery: 3, field: 'finish', value: 'cromado' },
  { mastery: 5, field: 'finish', value: 'camaleao' },
]);

/** A maestria que o item pede, ou null se ele é livre. */
export function requiredMastery(field: string, value: string): number | null {
  return MASTERY_REWARDS.find((r) => r.field === field && r.value === value)?.mastery ?? null;
}

// ───────────────────────────── O dado novo ─────────────────────────────

export interface ProgressProfile {
  /** Nome como o jogador digitou por último (a chave é `profileKey`). */
  name: string;
  /** Carro → XP feito com ele. */
  cars: Record<string, number>;
}

export interface ProgressData {
  /** Do mais recente para o mais antigo, no máximo MAX_PROFILES (como as estatísticas). */
  profiles: ProgressProfile[];
}

export function emptyProgress(): ProgressData {
  return { profiles: [] };
}

function findProfile(data: ProgressData | null | undefined, name: string): ProgressProfile | undefined {
  if (!data) return undefined;
  const key = profileKey(name);
  return data.profiles.find((p) => profileKey(p.name) === key);
}

export function carXp(data: ProgressData | null | undefined, name: string, carId: string): number {
  const v = findProfile(data, name)?.cars[carId];
  return typeof v === 'number' ? v : 0;
}

/**
 * O item pode ser ESCOLHIDO por este perfil neste carro? Livre se não é prêmio; prêmio só com a maestria daquele carro (sem progresso,
 * null ou undefined, os prêmios ficam trancados e o resto livre).
 */
export function cosmeticUnlocked(data: ProgressData | null | undefined, name: string, carId: string, field: string, value: string): boolean {
  const need = requiredMastery(field, value);
  if (need === null) return true;
  return masteryOf(carXp(data, name, carId)).level >= need;
}

// ───────────────────────────── Fechar a corrida ─────────────────────────────

export type Unlock =
  | { kind: 'title'; id: string; level: number }
  | { kind: 'frame'; id: string; level: number }
  | { kind: 'cosmetic'; field: 'finish' | 'rim'; value: string; carId: string; mastery: number };

/** O que a corrida rendeu a um humano local (o resultado mostra). */
export interface ProgressNews {
  seat: number;
  name: string;
  /** O carro do resultado (no revezamento, o da dupla). */
  carId: string;
  /** XP desta corrida. */
  xp: number;
  /** XP total do perfil depois dela. */
  pilotXp: number;
  level: { before: number; after: number };
  /** XP com o carro depois dela. */
  carXp: number;
  mastery: { before: number; after: number };
  unlocks: Unlock[];
}

export interface ProgressInput {
  state: RaceState;
  /** O que `recordRaceStats` devolveu (só os humanos locais; as estatísticas já têm a corrida somada). */
  contributions: readonly Contribution[];
}

function profileFor(data: ProgressData, name: string): ProgressProfile {
  const key = profileKey(name);
  const at = data.profiles.findIndex((p) => profileKey(p.name) === key);
  const found = at >= 0 ? data.profiles.splice(at, 1)[0] : { name: '', cars: {} };
  found.name = cleanName(name);
  data.profiles.unshift(found);
  if (data.profiles.length > MAX_PROFILES) data.profiles.length = MAX_PROFILES;
  return found;
}

function levelUnlocks(before: number, after: number): Unlock[] {
  const out: Array<Unlock & { level: number }> = [];
  for (const x of TITLES) if (x.level > before && x.level <= after) out.push({ kind: 'title', id: x.id, level: x.level });
  for (const x of FRAMES) if (x.level > before && x.level <= after) out.push({ kind: 'frame', id: x.id, level: x.level });
  return out.sort((a, b) => a.level - b.level);
}

/**
 * Soma a corrida à maestria de cada humano local e devolve o que mudou. O nível vem das estatísticas (`stats`, já com a corrida somada):
 * o "antes" é o perfil menos o que a corrida deu a ele (dois assentos com o mesmo nome são o mesmo perfil e somam juntos).
 */
export function settleProgress(data: ProgressData, stats: StatsData, input: ProgressInput): ProgressNews[] {
  const gainOf = (c: Contribution) => xpOfStats(c.stats);
  const profileGain = new Map<string, number>();
  for (const c of input.contributions) profileGain.set(profileKey(c.name), (profileGain.get(profileKey(c.name)) ?? 0) + gainOf(c));
  const out: ProgressNews[] = [];
  // Do último para o primeiro na lista de perfis: o P1 termina no topo (o mais recente), como as estatísticas.
  const ordered = [...input.contributions].sort((a, b) => a.seat - b.seat);
  const news = new Map<number, ProgressNews>();
  for (let i = ordered.length - 1; i >= 0; i--) {
    const c = ordered[i];
    if (!cleanName(c.name)) continue;
    const idx = carIndexOfSeat(input.state, c.seat);
    const carId = input.state.cars[idx]?.carId;
    if (!carId) continue;
    const xp = gainOf(c);
    const pilot = pilotOf(stats, c.name);
    const pilotXp = Math.max(pilot.xp, xp);
    const beforeXp = Math.max(0, pilotXp - (profileGain.get(profileKey(c.name)) ?? xp));
    const level = { before: levelOf(beforeXp).level, after: levelOf(pilotXp).level };
    const profile = profileFor(data, c.name);
    const carBefore = profile.cars[carId] ?? 0;
    const carAfter = Math.min(CAR_XP_MAX, carBefore + xp);
    profile.cars[carId] = carAfter;
    const mastery = { before: masteryOf(carBefore).level, after: masteryOf(carAfter).level };
    const unlocks = levelUnlocks(level.before, level.after);
    for (const r of MASTERY_REWARDS) {
      if (r.mastery > mastery.before && r.mastery <= mastery.after) unlocks.push({ kind: 'cosmetic', field: r.field, value: r.value, carId, mastery: r.mastery });
    }
    news.set(c.seat, { seat: c.seat, name: profile.name, carId, xp, pilotXp, level, carXp: carAfter, mastery, unlocks });
  }
  for (const c of ordered) { const n = news.get(c.seat); if (n) out.push(n); }
  return out;
}

// ───────────────────────────── Saneador (a migração da chave nova) ─────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const KNOWN_CARS: ReadonlySet<string> = new Set(CARS.map((c) => c.id));

/** Funde `raw` com o vazio e descarta o item inválido. Nunca lança. Sem a chave (save até a 0.1.4): vazio. */
export function sanitizeProgress(raw: unknown): ProgressData {
  if (!isRecord(raw) || !Array.isArray(raw.profiles)) return emptyProgress();
  const seen = new Set<string>();
  const profiles: ProgressProfile[] = [];
  for (const item of raw.profiles) {
    if (profiles.length >= MAX_PROFILES) break;
    if (!isRecord(item) || typeof item.name !== 'string') continue;
    const name = cleanName(item.name);
    if (!name || seen.has(profileKey(name))) continue;
    seen.add(profileKey(name));
    const cars: Record<string, number> = {};
    if (isRecord(item.cars)) {
      for (const [id, v] of Object.entries(item.cars)) {
        if (!KNOWN_CARS.has(id) || typeof v !== 'number' || !Number.isFinite(v)) continue;
        const xp = Math.min(CAR_XP_MAX, Math.round(v));
        if (xp > 0) cars[id] = xp;
      }
    }
    profiles.push({ name, cars });
  }
  return { profiles };
}

export function loadProgress(): ProgressData {
  return sanitizeProgress(readJson(PROGRESS_KEY));
}

export function saveProgress(data: ProgressData): void {
  writeJson(PROGRESS_KEY, sanitizeProgress(data));
}
