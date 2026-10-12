// A Expedição como caminho padrão (onda N, N5): para onde o 1º cartão do menu leva, onde mora a copa avulsa e o quadro
// "Desde a última vez". Nada aqui converte ou apaga save: `career` e `cupInProgress` continuam no formato de sempre, e a "migração"
// dos três tipos de save (só campeonato, só carreira, os dois) é este roteamento, feito na leitura e idempotente. Desenho:
// docs/ondas/N/N5.md §4.2.
import { MONEY_MAX } from '../core/career';
import { CUPS } from '../core/data/cups';
import type { SaveData, SessionRecap, SessionSnapshot } from './contracts';
import { isRecord } from './settings';

// ───────────────────────────── Roteamento ─────────────────────────────

export type ExpeditionRoute =
  /** Sem carreira: o cartão "Expedição" abre o lobby de uma Expedição nova. */
  | { kind: 'new' }
  /** Com carreira (em andamento ou concluída): o cartão abre o resumo, com "Continuar" em foco. */
  | { kind: 'continue'; completed: boolean };

export function expeditionRoute(save: Pick<SaveData, 'career'>): ExpeditionRoute {
  return save.career ? { kind: 'continue', completed: save.career.completed } : { kind: 'new' };
}

/** A copa avulsa salva, que agora vive em "Jogar livre": o "Continuar" dela. */
export function savedFreeCup(save: Pick<SaveData, 'cupInProgress'>): { cupId: string; raceIndex: number; raceCount: number } | null {
  const saved = save.cupInProgress;
  if (!saved) return null;
  const cup = CUPS.find((c) => c.id === saved.champ.cupId);
  return cup ? { cupId: cup.id, raceIndex: saved.champ.raceIndex, raceCount: cup.trackIds.length } : null;
}

// ───────────────────────────── "Desde a última vez" ─────────────────────────────

export function snapshotOf(save: SaveData, at: string): SessionSnapshot {
  return {
    at,
    racesRun: save.racesRun,
    racesWon: save.racesWon,
    stamps: save.stamps.length,
    cupsCompleted: save.cupsCompleted.length,
    achievements: save.achievements.length,
    carsBought: save.carsUnlocked.length,
    earned: save.career ? Math.min(MONEY_MAX, save.career.drivers.reduce((sum, d) => sum + d.earnings, 0)) : 0,
  };
}

export interface SnapshotDiff {
  races: number; wins: number; earned: number; cars: number; stamps: number; cups: number; achievements: number;
}

const gain = (before: number, after: number): number => Math.max(0, after - before);

/** O que cresceu entre dois retratos. Nunca negativo: carreira nova zera o dinheiro ganho, e isso não é "perdeu dinheiro". */
export function diffSnapshots(a: SessionSnapshot, b: SessionSnapshot): SnapshotDiff {
  return {
    races: gain(a.racesRun, b.racesRun), wins: gain(a.racesWon, b.racesWon), earned: gain(a.earned, b.earned),
    cars: gain(a.carsBought, b.carsBought), stamps: gain(a.stamps, b.stamps), cups: gain(a.cupsCompleted, b.cupsCompleted),
    achievements: gain(a.achievements, b.achievements),
  };
}

export function isEmptyDiff(d: SnapshotDiff): boolean {
  return Object.values(d).every((v) => v === 0);
}

/**
 * Chamada UMA vez, na abertura da sessão (session.ts, logo depois de `loadSave`). O que a sessão anterior fez vira o `recap`
 * (o quadro do menu); sessão em que nada aconteceu deixa o `recap` antigo onde está. Depois, o ponto de partida desta sessão.
 * Save antigo, sem os campos: guarda o ponto de partida e não mostra quadro nenhum (não há o que dizer na 1ª vez).
 */
export function rollSession(save: SaveData, at: string): void {
  const now = snapshotOf(save, at);
  const start = save.sessionStart;
  if (start && !isEmptyDiff(diffSnapshots(start, now))) save.recap = { before: start, after: now };
  save.sessionStart = now;
}

// ───────────────────────────── Saneamento (na leitura; lixo vira null, nunca lança) ─────────────────────────────

const COUNT_MAX = Number.MAX_SAFE_INTEGER;

function count(v: unknown, max = COUNT_MAX): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null;
}

export function sanitizeSnapshot(v: unknown): SessionSnapshot | null {
  if (!isRecord(v) || typeof v.at !== 'string' || v.at.length === 0 || v.at.length > 40) return null;
  const racesRun = count(v.racesRun); const racesWon = count(v.racesWon); const stamps = count(v.stamps);
  const cupsCompleted = count(v.cupsCompleted); const achievements = count(v.achievements);
  const carsBought = count(v.carsBought); const earned = count(v.earned, MONEY_MAX);
  if (racesRun === null || racesWon === null || stamps === null || cupsCompleted === null || achievements === null || carsBought === null || earned === null) return null;
  return { at: v.at, racesRun, racesWon, stamps, cupsCompleted, achievements, carsBought, earned };
}

export function sanitizeRecap(v: unknown): SessionRecap | null {
  if (!isRecord(v)) return null;
  const before = sanitizeSnapshot(v.before); const after = sanitizeSnapshot(v.after);
  return before && after ? { before, after } : null;
}
