// Movimento do HUD (onda L, L5): a mola do número da posição, o selo "+N"/"−N" da ultrapassagem, a janela da faixa
// ÚLTIMA VOLTA e a persistência do ícone de vácuo. Tudo puro e sem DOM nem relógio próprio: o HUD entrega "como está
// agora" (posição, tick, tempo da tela) a cada quadro e lê de volta o que desenhar. A memória é de cada viewport e se
// zera sozinha quando o tick volta atrás (corrida nova). Nada disso toca o estado da corrida.

// ───────────────────────────── Mola ─────────────────────────────

export interface SpringState { x: number; v: number }

/** Subpassos de no máximo 1/120 s: a mola fica estável mesmo num quadro perdido (dt limitado a 0,1 s). */
const SPRING_SUBSTEP = 1 / 120;
const SPRING_MAX_DT = 0.1;
/** Rigidez e amortecimento: razão de amortecimento ~0,37, ou seja, estoura uns 25% e assenta em ~0,7 s. */
export const POSITION_SPRING = { stiffness: 220, damping: 11 } as const;
/** Velocidade dada à mola a cada posição ganha ou perdida (unidades de escala por segundo). */
export const POSITION_IMPULSE = 5;

/** Avança a mola `dt` segundos em direção a `target` (integração semi-implícita com subpassos). */
export function springStep(s: SpringState, target: number, dt: number, k: number = POSITION_SPRING.stiffness, c: number = POSITION_SPRING.damping): void {
  let left = Math.min(SPRING_MAX_DT, Math.max(0, Number.isFinite(dt) ? dt : 0));
  while (left > 1e-9) {
    const h = Math.min(SPRING_SUBSTEP, left);
    s.v += (-k * (s.x - target) - c * s.v) * h;
    s.x += s.v * h;
    left -= h;
  }
}

// ───────────────────────────── Posição ─────────────────────────────

/** Quanto tempo o selo "+N" fica (os últimos 0,4 s são de desbotar). */
export const BADGE_SECONDS = 1.6;
const BADGE_FADE_SECONDS = 0.4;
/** A grade se ajeita no 1º segundo da corrida: troca de posição ali não é ultrapassagem. */
export const GRID_SETTLE_TICKS = 60;

export type PositionTone = 'none' | 'gain' | 'loss';

export interface PositionInput {
  position: number;
  tick: number;
  startTick: number;
  /** Fase 'racing' (a contagem e o fim não contam). */
  racing: boolean;
  finished: boolean;
  /** Relógio da tela, em segundos (`RenderFrame.time`). */
  time: number;
}

export interface PositionMotion {
  position: number;
  lastTick: number;
  lastTime: number;
  /** Saldo do selo atual (+ = ganhou posições). */
  delta: number;
  since: number;
  spring: SpringState;
}

export function newPositionMotion(): PositionMotion {
  return { position: 0, lastTick: -1, lastTime: -1, delta: 0, since: -Infinity, spring: { x: 1, v: 0 } };
}

export interface PositionLook {
  /** Escala do número (a mola). */
  scale: number;
  tone: PositionTone;
  /** "+2", "−1" ou "" (com o sinal: a cor não carrega a informação sozinha). */
  badge: string;
  badgeOpacity: number;
}

/** Chamar uma vez por quadro de tela. Devolve como o número da posição e o selo devem estar agora. */
export function stepPositionMotion(m: PositionMotion, o: PositionInput): PositionLook {
  // Tick que volta atrás = corrida nova: esquece tudo (nada de selo da anterior).
  if (o.tick < m.lastTick) { m.position = 0; m.delta = 0; m.since = -Infinity; m.spring.x = 1; m.spring.v = 0; }
  const dt = m.lastTime < 0 ? 0 : o.time - m.lastTime;
  m.lastTick = o.tick; m.lastTime = o.time;

  const counts = o.racing && !o.finished && o.tick - o.startTick >= GRID_SETTLE_TICKS;
  if (counts && m.position > 0 && o.position !== m.position) {
    const change = m.position - o.position; // > 0: subiu na classificação
    const active = o.time - m.since < BADGE_SECONDS;
    m.delta = active && Math.sign(m.delta) === Math.sign(change) ? m.delta + change : change;
    m.since = o.time;
    m.spring.v += Math.sign(change) * POSITION_IMPULSE * Math.min(2, Math.abs(change));
  }
  m.position = o.position;
  springStep(m.spring, 1, dt);

  const age = o.time - m.since;
  const active = age >= 0 && age < BADGE_SECONDS && m.delta !== 0;
  return {
    scale: m.spring.x,
    tone: !active ? 'none' : m.delta > 0 ? 'gain' : 'loss',
    badge: !active ? '' : `${m.delta > 0 ? '+' : '−'}${Math.abs(m.delta)}`,
    badgeOpacity: !active ? 0 : Math.min(1, (BADGE_SECONDS - age) / BADGE_FADE_SECONDS),
  };
}

// ───────────────────────────── Faixa ÚLTIMA VOLTA ─────────────────────────────

/** Quanto a faixa fica na tela (a entrada e a saída são animação de CSS dentro dessa janela). */
export const BAND_SECONDS = 2.6;

export interface LastLapBand { lap: number; lastTick: number; until: number }

export function newLastLapBand(): LastLapBand {
  return { lap: -1, lastTick: -1, until: -Infinity };
}

export interface LastLapInput { lap: number; laps: number; finished: boolean; racing: boolean; tick: number; time: number }

/**
 * Verdadeiro enquanto a faixa deve aparecer. Dispara na transição para a última volta (laps ≥ 2): quem abre o HUD
 * já nela (reconexão) e a corrida de 1 volta não levam faixa.
 */
export function stepLastLapBand(b: LastLapBand, o: LastLapInput): boolean {
  if (o.tick < b.lastTick) { b.lap = -1; b.until = -Infinity; }
  b.lastTick = o.tick;
  if (o.laps >= 2 && o.racing && !o.finished && b.lap >= 0 && b.lap < o.laps && o.lap >= o.laps) b.until = o.time + BAND_SECONDS;
  b.lap = o.lap;
  return !o.finished && o.time < b.until;
}

// ───────────────────────────── Vácuo ─────────────────────────────

/** O vácuo some e volta com o carro da frente mudando de linha: o ícone fica um pouco mais, sem piscar. */
export const DRAFT_HOLD_SECONDS = 0.35;

export interface DraftHold { until: number }

export function newDraftHold(): DraftHold {
  return { until: -Infinity };
}

export function stepDraft(h: DraftHold, active: boolean, time: number): boolean {
  if (active) h.until = time + DRAFT_HOLD_SECONDS;
  return time <= h.until;
}
