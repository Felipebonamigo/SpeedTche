// Estrelas, troféu e placar do rival (onda O, O4; docs/ondas/O/O4.md). Puro: lê o que a corrida deixou (resultado, telemetria, veredito da
// copa) e grava, por PERFIL (o nome do lobby, a mesma chave das estatísticas), as estrelas de cada pista e o placar contra cada rival.
// Até 3 estrelas por corrida de copa: classificar, vencer o rival da copa e cumprir o objetivo da pista. **Nenhum dinheiro aqui** (o bônus
// das estrelas é da P1): este módulo não importa `core/career`.
//
// Sem importar `contracts.ts` em tempo de execução (só tipos): `contracts.ts` importa `emptyStars` daqui para o DEFAULT_SAVE.
import { QUALIFY_POSITION, TICK_RATE } from '../core/constants';
import { CUP_RIVALS } from '../core/data/drivers';
import { hashString } from '../core/rng';
import { TRACKS } from '../core/track/tracks';
import type { ChampionshipState, CupDef, HumanEntry, RaceResultRow } from '../core/types';
import type { RaceTelemetry } from './achievements';
import type { RaceMode } from './contracts';
import { driverKey, type RivalScore } from './rivals';
import { MAX_PROFILES, cleanName, profileKey } from './stats';

/** Bits do mapa de estrelas de cada pista (a melhor de cada uma, nunca diminui). */
export const STAR_QUALIFY = 1;
export const STAR_RIVAL = 2;
export const STAR_GOAL = 4;

/** O objetivo da pista. A ORDEM é parte do formato: `goalFor` indexa por ela (reordenar muda o objetivo de todas as pistas). */
export type GoalId = 'clean' | 'perfectLap' | 'draft20' | 'noPit' | 'comeback' | 'nitroFinish';
export const GOALS: readonly GoalId[] = ['clean', 'perfectLap', 'draft20', 'noPit', 'comeback', 'nitroFinish'];

/** 109 corridas de copa × 3 estrelas (tests/stars.test.ts confere com `CUPS`). */
export const STARS_TOTAL = 327;
/** Segundos no vácuo do objetivo `draft20` (a conquista MESTRE_DO_VACUO é a de 60 s). */
export const DRAFT_GOAL_TICKS = 20 * TICK_RATE;
/** Placar e perfil: tetos contra save adulterado. */
const COUNT_MAX = 99_999;
const LAST_MAX = 4;

export interface StarProfile {
  /** Nome como o jogador digitou por último (a chave é `profileKey`). */
  name: string;
  /** Pista → bits de estrela (1 classificou, 2 venceu o rival, 4 objetivo). */
  tracks: Record<string, number>;
  /** Rival (`driverKey`) → placar. */
  rivals: Record<string, RivalScore>;
}

/** O que a última corrida rendeu a um perfil, para o Pagamento (`career.lastReport` faz o mesmo papel). */
export interface StarsLast {
  name: string;
  trackId: string;
  /** Estrelas desta corrida (bits) e as que o perfil já tinha nesta pista antes dela. */
  got: number;
  was: number;
  goal: GoalId;
  /** Nome do rival no grid, ou null. */
  rival: string | null;
  duel: 'win' | 'lose' | null;
}

export interface StarsData {
  profiles: StarProfile[];
  last: StarsLast[];
}

export function emptyStars(): StarsData {
  return { profiles: [], last: [] };
}

/** O objetivo da pista: estável, só depende do id (o mesmo para todos os jogadores). */
export function goalFor(trackId: string): GoalId {
  return GOALS[hashString(trackId) % GOALS.length];
}

/** O objetivo foi cumprido por este assento? Só vale para quem terminou a corrida. */
export function goalMet(goal: GoalId, seat: number, finished: boolean, position: number, tel: RaceTelemetry): boolean {
  const s = tel.seats.get(seat);
  if (!finished || !s) return false;
  switch (goal) {
    case 'clean': return s.collisions === 0 && s.crashes === 0;
    case 'perfectLap': return tel.perfectLap.has(seat);
    case 'draft20': return s.draftTicks >= DRAFT_GOAL_TICKS;
    case 'noPit': return !tel.pitted.has(seat);
    case 'comeback': return s.lastAfterFirstLap && position <= 3;
    case 'nitroFinish': return s.nitroAtFinish;
    default: return false;
  }
}

/** Número de estrelas (bits ligados) de um mapa de pista. */
function bits(mask: number): number {
  return (mask & STAR_QUALIFY ? 1 : 0) + (mask & STAR_RIVAL ? 1 : 0) + (mask & STAR_GOAL ? 1 : 0);
}

/** Estrelas do perfil em todas as pistas (0 a 327). */
export function starCount(p: StarProfile | undefined): number {
  return p ? Object.values(p.tracks).reduce((s, m) => s + bits(m), 0) : 0;
}

export function findProfile(data: StarsData, name: string): StarProfile | undefined {
  const key = profileKey(name);
  return data.profiles.find((p) => profileKey(p.name) === key);
}

/** Estrelas do perfil numa copa e o máximo (3 por corrida). */
export function cupStars(p: StarProfile | undefined, cup: CupDef): { got: number; max: number } {
  return { got: p ? cup.trackIds.reduce((s, id) => s + bits(p.tracks[id] ?? 0), 0) : 0, max: cup.trackIds.length * 3 };
}

export type Trophy = 'none' | 'bronze' | 'silver' | 'gold';

/** Troféu da copa: bronze a partir de 1/3 das estrelas, prata a partir de 2/3, ouro com todas. Derivado, não gravado. */
export function trophyFor(got: number, max: number): Trophy {
  if (max <= 0) return 'none';
  if (got >= max) return 'gold';
  if (got * 3 >= max * 2) return 'silver';
  if (got * 3 >= max) return 'bronze';
  return 'none';
}

/** O placar do perfil contra o rival (`driverKey`); zeros se nunca correram. */
export function scoreOf(data: StarsData, name: string, rivalKey: string): RivalScore {
  const s = findProfile(data, name)?.rivals[rivalKey];
  return s ? { you: s.you, rival: s.rival } : { you: 0, rival: 0 };
}

// ───────────────────────────── Fechar a corrida ─────────────────────────────

/** Modos com copa e rival: os únicos que dão estrela. */
const STAR_MODES: ReadonlySet<RaceMode> = new Set<RaceMode>(['cup', 'career']);

export interface StarsInput {
  mode: RaceMode;
  trackId: string;
  /** Só os assentos deste computador (online) ou todos (local), como as estatísticas. */
  results: readonly RaceResultRow[];
  humans: readonly HumanEntry[];
  telemetry: RaceTelemetry;
  /** `config.rival` da corrida. */
  rival: string | undefined;
  /** A copa já com esta corrida somada (veredito e co-op). Nulo = sem estrela de classificar. */
  champ: Pick<ChampionshipState, 'coop' | 'lastVerdict'> | null;
}

function profileFor(data: StarsData, name: string): StarProfile {
  const key = profileKey(name);
  const at = data.profiles.findIndex((p) => profileKey(p.name) === key);
  const found = at >= 0 ? data.profiles.splice(at, 1)[0] : { name: '', tracks: {}, rivals: {} };
  found.name = cleanName(name);
  data.profiles.unshift(found);
  if (data.profiles.length > MAX_PROFILES) data.profiles.length = MAX_PROFILES;
  return found;
}

/**
 * Soma esta corrida às estrelas e ao placar de cada humano com linha no resultado, e devolve o que mudou (também em `data.last`).
 * Modo sem copa/rival: nada.
 */
export function settleStars(data: StarsData, input: StarsInput): StarsLast[] {
  if (!STAR_MODES.has(input.mode)) return [];
  const goal = goalFor(input.trackId);
  const rivalRow = input.rival ? input.results.find((r) => r.seat < 0 && r.name === input.rival) : undefined;
  const out: StarsLast[] = [];
  for (const h of input.humans) {
    const mine = input.results.find((r) => r.seat === h.seat);
    if (!mine) continue;
    let got = 0;
    const qualified = input.champ ? (input.champ.coop ? input.champ.lastVerdict === 'qualified' : mine.position <= QUALIFY_POSITION) : false;
    if (qualified) got |= STAR_QUALIFY;
    const duel = rivalRow ? (mine.position < rivalRow.position ? 'win' : 'lose') : null;
    if (duel === 'win') got |= STAR_RIVAL;
    if (goalMet(goal, h.seat, mine.finished, mine.position, input.telemetry)) got |= STAR_GOAL;
    const profile = profileFor(data, h.name);
    const was = profile.tracks[input.trackId] ?? 0;
    profile.tracks[input.trackId] = was | got;
    if (input.rival && duel) {
      const key = driverKey(input.rival);
      const score = profile.rivals[key] ?? (profile.rivals[key] = { you: 0, rival: 0 });
      if (duel === 'win') score.you = Math.min(COUNT_MAX, score.you + 1);
      else score.rival = Math.min(COUNT_MAX, score.rival + 1);
    }
    out.push({ name: profile.name, trackId: input.trackId, got, was, goal, rival: input.rival && rivalRow ? input.rival : null, duel });
  }
  data.last = out.slice(0, LAST_MAX);
  return out;
}

// ───────────────────────────── Saneador (a migração do save) ─────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const KNOWN_TRACKS: ReadonlySet<string> = new Set(TRACKS.map((t) => t.id));
const KNOWN_RIVALS: ReadonlySet<string> = new Set(Object.values(CUP_RIVALS).map(driverKey));
const KNOWN_GOALS: ReadonlySet<string> = new Set(GOALS);

/** Inteiro de 0 a 99999; qualquer outra coisa vira 0. */
function count(v: unknown): number {
  return Number.isInteger(v) ? Math.min(COUNT_MAX, Math.max(0, v as number)) : 0;
}

/** Bits de estrela (inteiro, `& 7`); qualquer outra coisa vira 0. */
function mask(v: unknown): number {
  return Number.isInteger(v) && (v as number) > 0 ? (v as number) & 7 : 0;
}

function sanitizeProfile(raw: unknown): StarProfile | null {
  if (!isRecord(raw) || typeof raw.name !== 'string') return null;
  const name = cleanName(raw.name);
  if (name === '') return null;
  const tracks: Record<string, number> = {};
  if (isRecord(raw.tracks)) {
    for (const [id, v] of Object.entries(raw.tracks)) {
      const m = mask(v);
      if (KNOWN_TRACKS.has(id) && m > 0) tracks[id] = m;
    }
  }
  const rivals: Record<string, RivalScore> = {};
  if (isRecord(raw.rivals)) {
    for (const [key, v] of Object.entries(raw.rivals)) {
      if (!KNOWN_RIVALS.has(key) || !isRecord(v)) continue;
      const score = { you: count(v.you), rival: count(v.rival) };
      if (score.you > 0 || score.rival > 0) rivals[key] = score;
    }
  }
  return { name, tracks, rivals };
}

function sanitizeLast(raw: unknown): StarsLast | null {
  if (!isRecord(raw) || typeof raw.name !== 'string' || typeof raw.trackId !== 'string' || typeof raw.goal !== 'string') return null;
  const name = cleanName(raw.name);
  if (name === '' || !KNOWN_TRACKS.has(raw.trackId) || !KNOWN_GOALS.has(raw.goal)) return null;
  return {
    name, trackId: raw.trackId, got: mask(raw.got), was: mask(raw.was), goal: raw.goal as GoalId,
    rival: typeof raw.rival === 'string' && raw.rival.length > 0 ? raw.rival.slice(0, 32) : null,
    duel: raw.duel === 'win' || raw.duel === 'lose' ? raw.duel : null,
  };
}

/** Funde `raw` com o vazio e descarta o item inválido. Nunca lança. Save sem o campo (até a 0.1.3) abre vazio. */
export function sanitizeStars(raw: unknown): StarsData {
  if (!isRecord(raw)) return emptyStars();
  const seen = new Set<string>();
  const profiles: StarProfile[] = [];
  for (const item of Array.isArray(raw.profiles) ? raw.profiles : []) {
    const p = sanitizeProfile(item);
    if (!p || seen.has(profileKey(p.name))) continue;
    seen.add(profileKey(p.name));
    profiles.push(p);
    if (profiles.length >= MAX_PROFILES) break;
  }
  const last: StarsLast[] = [];
  for (const item of Array.isArray(raw.last) ? raw.last : []) {
    const l = sanitizeLast(item);
    if (l) last.push(l);
    if (last.length >= LAST_MAX) break;
  }
  return { profiles, last };
}
