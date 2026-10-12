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
import { driverKey, duelLineKind, rivalBalloon, type Rival, type RivalLineKind, type RivalScore } from './rivals';

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

/** "Zé Turbo: <fala>" no idioma atual (sem tipo novo de mensagem no HUD: sai como "info"). Com o placar do perfil, a fala o cita (O4). */
export function rivalTalkText(rival: Rival, kind: RivalLineKind, score?: RivalScore): string {
  return rivalBalloon(rival, kind, score);
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

// ───────────────────────────── Resposta à provocação (N6) ─────────────────────────────

/** O rival só responde a quem está a até este tanto de posições dele. */
export const REPLY_RANGE = 3;
/** Chance (em %) de ele responder quando as outras condições deixam: "de vez em quando". */
export const REPLY_PERCENT = 60;

/** Um dado de 0 a 99 que sai só do tick e do assento (sem `state.rng`: a resposta é apresentação, não pode mexer na corrida). */
export function replyRoll(tick: number, seat: number): number {
  let h = Math.imul(tick + 1, 0x9e3779b1) ^ Math.imul(seat + 7, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) % 100;
}

/**
 * O humano do assento `seat` acabou de mandar uma frase de provocação (voice.ts). O rival da copa responde — de vez em quando
 * (`REPLY_PERCENT`) — se está na corrida, não chegou, o humano também não e estão a até `REPLY_RANGE` posições um do outro; e
 * só se o intervalo mínimo e o teto de falas dele deixam (a mesma conta de `observeRivalTalk`: uma resposta conta como fala).
 * Devolve o tipo da fala — `taunt` se ele está à frente, `revenge` se está atrás — ou null. Só visual: não toca o estado.
 */
export function rivalReply(mem: RivalTalk, state: RaceState, seat: number): RivalLineKind | null {
  const name = state.config.rival;
  if (!name || state.phase !== 'racing') return null;
  const rival = state.cars.find((c) => c.seat < 0 && c.name === name);
  const human = state.cars.find((c) => c.seat === seat);
  if (!rival || rival.finished || !human || human.finished) return null;
  if (Math.abs(rival.position - human.position) > REPLY_RANGE) return null;
  if (mem.lines >= MAX_LINES || state.tick - mem.lastLineTick < MIN_GAP_SECONDS * TICK_RATE) return null;
  if (replyRoll(state.tick, seat) >= REPLY_PERCENT) return null;
  mem.lines++;
  mem.lastLineTick = state.tick;
  return rival.position < human.position ? 'taunt' : 'revenge';
}
