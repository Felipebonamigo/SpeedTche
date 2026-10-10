// O rival fala durante a corrida (onda L, L5). As falas já existiam (src/rivals/strings.ts: apresentação, provocação,
// respeito e revanche) e só saíam antes e depois da corrida; aqui se decide QUANDO dizê-las na pista. Puro: lê o estado
// depois de cada tick e devolve quem escuta e que tipo de fala; a sessão a põe no HUD (session.ts). Nada vai para o estado.
//
// Regras (todas com número, para não virar metralhadora): uma apresentação logo depois da largada; provocação (ou revanche,
// se ele tinha perdido o duelo anterior) quando ele passa um humano e se mantém à frente; respeito quando um humano o passa;
// a troca precisa durar HOLD_TICKS (senão é só o emparelhado); no mínimo MIN_GAP_SECONDS entre duas falas e no máximo
// MAX_LINES por corrida. Uma troca que cai no silêncio (intervalo ou teto) não é guardada: a próxima é que fala.
import { TICK_RATE } from '../core/constants';
import { personalityOf } from '../core/data/drivers';
import type { RaceState } from '../core/types';
import { driverKey, duelLineKind, rivalLine, type Rival, type RivalLineKind } from './rivals';

/** A apresentação sai este tanto depois do "JÁ!" (1,5 s: a largada passa e o piloto levanta o olho). */
export const INTRO_DELAY_TICKS = 90;
/** A troca de posição precisa durar 1 s para contar como ultrapassagem. */
export const HOLD_TICKS = 60;
export const MIN_GAP_SECONDS = 25;
export const MAX_LINES = 4;

export interface RivalTalkCue { seat: number; kind: RivalLineKind }

export interface RivalTalk {
  /** O rival terminou à frente do melhor humano na corrida anterior da copa (false = perdeu; null = sem dado). */
  previousDuel: boolean | null;
  tick: number;
  introDone: boolean;
  lines: number;
  lastLineTick: number;
  /** Por assento: o rival está à frente (confirmado) e desde quando a troca pendente começou. */
  ahead: Record<number, boolean | undefined>;
  pendingSince: Record<number, number | undefined>;
}

export function createRivalTalk(previousDuel: boolean | null = null): RivalTalk {
  return { previousDuel, tick: -1, introDone: false, lines: 0, lastLineTick: -Infinity, ahead: {}, pendingSince: {} };
}

/** O rival a partir do nome (config.rival): personalidade e chave das falas próprias. */
export function rivalByName(name: string): Rival {
  return { name, personality: personalityOf(name), key: driverKey(name) };
}

/** "Zé Turbo: <fala>" no idioma atual (sem tipo novo de mensagem no HUD: sai como "info"). */
export function rivalTalkText(rival: Rival, kind: RivalLineKind): string {
  return `${rival.name}: ${rivalLine(rival, kind)}`;
}

/** Chamar logo depois de cada `stepRace`; `localSeats` são os assentos deste computador. */
export function observeRivalTalk(mem: RivalTalk, state: RaceState, localSeats: readonly number[]): RivalTalkCue[] {
  if (state.tick < mem.tick) Object.assign(mem, createRivalTalk(mem.previousDuel)); // corrida nova
  mem.tick = state.tick;
  const name = state.config.rival;
  if (!name || state.phase !== 'racing') return [];
  const rival = state.cars.find((c) => c.seat < 0 && c.name === name);
  if (!rival || rival.finished) return [];
  const listeners = state.cars.filter((c) => c.seat >= 0 && !c.finished && localSeats.includes(c.seat));
  if (listeners.length === 0) return [];

  const canSpeak = mem.lines < MAX_LINES && state.tick - mem.lastLineTick >= MIN_GAP_SECONDS * TICK_RATE;
  const speak = (): void => { mem.lines++; mem.lastLineTick = state.tick; };

  if (!mem.introDone && state.tick - state.startTick >= INTRO_DELAY_TICKS) {
    mem.introDone = true;
    for (const h of listeners) mem.ahead[h.seat] = rival.position < h.position;
    speak();
    return listeners.map((h) => ({ seat: h.seat, kind: 'intro' }));
  }

  const out: RivalTalkCue[] = [];
  for (const h of listeners) {
    const now = rival.position < h.position;
    const stable = mem.ahead[h.seat];
    if (stable === undefined) { mem.ahead[h.seat] = now; continue; }
    if (now === stable) { mem.pendingSince[h.seat] = undefined; continue; }
    const since = mem.pendingSince[h.seat] ?? (mem.pendingSince[h.seat] = state.tick);
    if (state.tick - since < HOLD_TICKS) continue;
    // A troca se firmou: vira o estado confirmado e, se o intervalo e o teto deixam, o rival comenta.
    mem.ahead[h.seat] = now; mem.pendingSince[h.seat] = undefined;
    if (!canSpeak || out.length > 0) continue;
    out.push({ seat: h.seat, kind: duelLineKind(now, mem.previousDuel) });
    speak();
  }
  return out;
}
