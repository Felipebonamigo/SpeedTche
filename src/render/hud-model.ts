// O que o HUD mostra, em números (onda L, L5): a distância em segundos para o carro da frente e o de trás, e os modelos
// de combustível e nitro (percentual, marcas, nível, número de cargas). Puro: lê o estado e devolve valores; o hud.ts
// só escreve nos nós. A cor nunca é o único canal: tudo aqui tem número, marca ou rótulo.
import { COUNTDOWN_TICKS, NITRO_CHARGE_COST, NITRO_METER_MAX, REFERENCE_SPEED, TICK_RATE } from '../core/constants';
import type { CarState, RaceState, SimEvent } from '../core/types';

/** Abaixo desta velocidade o tempo seria enorme: usa-se este piso (15% da referência = 45 km/h). */
export const MIN_GAP_SPEED = REFERENCE_SPEED * 0.15;
/** Mais que isto não diz nada ao piloto: some em vez de mostrar "87 s". */
export const MAX_GAP_SECONDS = 59.9;

export interface GapInfo {
  /** Segundos que faltam para chegar onde o carro da frente está agora (na velocidade de quem pergunta). */
  aheadSeconds: number | null;
  /** Segundos até o carro de trás chegar onde o jogador está agora (na velocidade dele). */
  behindSeconds: number | null;
  aheadName: string | null;
  behindName: string | null;
}

function seconds(distance: number, speed: number): number | null {
  const s = Math.max(0, distance) / Math.max(MIN_GAP_SPEED, speed);
  return Number.isFinite(s) && s <= MAX_GAP_SECONDS ? s : null;
}

/** Vizinhos de posição (±1) que ainda correm. Carro que já terminou não é vizinho (a distância a ele não diz nada). */
export function timeGaps(state: RaceState, car: CarState): GapInfo {
  let ahead: CarState | null = null; let behind: CarState | null = null;
  for (const o of state.cars) {
    if (o === car || o.finished) continue;
    if (o.position === car.position - 1) ahead = o;
    else if (o.position === car.position + 1) behind = o;
  }
  return {
    aheadSeconds: ahead ? seconds(ahead.progress - car.progress, car.speed) : null,
    behindSeconds: behind ? seconds(car.progress - behind.progress, behind.speed) : null,
    aheadName: ahead ? ahead.name : null,
    behindName: behind ? behind.name : null,
  };
}

/** "1,2 s" (PT) ou "1.2 s" (EN); a partir de 10 s sem casa decimal; sem carro, o traço. */
export function formatGap(value: number | null, lang: string): string {
  if (value === null) return '—';
  const n = value < 9.95 ? value.toFixed(1) : String(Math.round(value));
  return `${lang === 'pt' ? n.replace('.', ',') : n} s`;
}

// ───────────────────────────── Combustível ─────────────────────────────

/** A mesma régua do aviso que o HUD já tinha (`fuel < 0.25`). */
export const FUEL_LOW_FRACTION = 0.25;
const FUEL_MARKS = 4;

export type FuelLevel = 'ok' | 'low' | 'empty';

export interface FuelModel {
  percent: number;
  /** Marcas cheias de FUEL_MARKS (arredondadas para cima: 72% = 3 de 4). */
  segments: number;
  level: FuelLevel;
}

export function fuelModel(fuel: number): FuelModel {
  const f = Number.isFinite(fuel) ? Math.min(1, Math.max(0, fuel)) : 0;
  return {
    percent: Math.round(f * 100),
    segments: Math.max(0, Math.ceil(f * FUEL_MARKS - 1e-9)),
    level: f <= 0 ? 'empty' : f < FUEL_LOW_FRACTION ? 'low' : 'ok',
  };
}

// ───────────────────────────── Nitro ─────────────────────────────

export const NITRO_SLOTS = 3;

export interface NitroModel {
  /** Raios cheios (no máximo NITRO_SLOTS): um por carga inteira. */
  filled: number;
  /** Cargas inteiras que o piloto tem. */
  count: number;
  /** "×N" quando passa dos NITRO_SLOTS (a barra da equipe, que tem teto maior), senão vazio. */
  extra: string;
  /** Quanto da barra está cheia, de 0 a 1 (sobre o teto: o do carro, ou o da equipe). */
  fraction: number;
}

/** A barra de nitro (onda N, N1): `meter` em unidades da barra, `cap` o teto dela. */
export function nitroModel(meter: number, cap = NITRO_METER_MAX): NitroModel {
  const m = Number.isFinite(meter) ? Math.max(0, meter) : 0;
  const count = Math.floor(m / NITRO_CHARGE_COST);
  return { filled: Math.min(NITRO_SLOTS, count), count, extra: count > NITRO_SLOTS ? `×${count}` : '', fraction: cap > 0 ? Math.min(1, m / cap) : 0 };
}

// ───────────────────────────── A contagem, desenhada adiantada pelo atraso de entrada ─────────────────────────────

/**
 * No online o que o jogador aperta agora vale no tick `atual + atraso` (lockstep.ts). Para o aperto no instante em que ele VÊ o zero
 * cair exatamente no tick do "JÁ", a contagem é desenhada (e tocada) no tick do núcleo mais o atraso: com atraso 3 ou com 12 o
 * mesmo instante físico dá o mesmo resultado na largada-foguete (docs/ondas/N/N1.md, §4.4). Sem atraso (sofá, tutorial), é o tick do núcleo.
 */
export function countdownDisplayTick(tick: number, lead: number): number {
  return tick + (Number.isFinite(lead) && lead > 0 ? Math.floor(lead) : 0);
}

/**
 * O bipe (3, 2, 1) ou o "JÁ" que cai no tick DESENHADO `tick + lead`: a mesma regra do `stepRace`, que emite `countdown` e `go` no tick
 * do núcleo. A sessão usa isto no lugar dos eventos do núcleo quando há atraso de entrada, para o som e o "JÁ!" saírem junto da luz.
 */
export function countdownCue(tick: number, lead: number): Extract<SimEvent, { type: 'countdown' | 'go' }> | null {
  const shown = countdownDisplayTick(tick, lead);
  const remaining = COUNTDOWN_TICKS - shown;
  if (remaining % TICK_RATE === 0 && remaining > 0 && remaining / TICK_RATE <= 3) return { type: 'countdown', value: remaining / TICK_RATE };
  return shown === COUNTDOWN_TICKS ? { type: 'go' } : null;
}
