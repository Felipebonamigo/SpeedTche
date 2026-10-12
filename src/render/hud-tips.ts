// Dicas da 1ª corrida (O3, docs/ondas/O/O3.md): o que ensinar a quem nunca correu, na hora em que serve — a largada no JÁ, frear
// antes da curva forte, derrapar nela, o nitro que enche, a seta do box. Duas metades:
//   · a decisão (`observeTips`/`tipOf`), pura e por assento: lê o estado depois de cada tick e as entradas dele, nunca o muda;
//   · o overlay DOM (`createTipsHud`), montado pela sessão no `hudRoot` (o padrão de voice/hud.ts): um cartão por viewport, no mesmo
//     retângulo e na mesma escala do HUD, com as teclas DO JOGADOR daquele assento (remap/labels.ts), sem tocar o renderizador.
// Só valem na 1ª corrida local de copa/Expedição (`tipsEnabled`). Cada dica aparece no máximo algumas vezes, some quando o jogador
// faz a coisa (ou depois de TIP_SHOW_TICKS) e a seguinte espera TIP_GAP_TICKS: ninguém é metralhado de texto.
import './hud-tips.css';
import '../tutorial/strings';
import { AI_BRAKE_CURVE, NITRO_CHARGE_COST, SEGMENT_LENGTH, TICK_RATE } from '../core/constants';
import { brakingTarget, wantsDrift } from '../core/sim/ai';
import { carStats, nitroMeterOf } from '../core/sim/stats';
import { segmentAt } from '../core/track/builder';
import type { CarState, PlayerInput, RaceState, Track } from '../core/types';
import type { RaceMode } from '../game/contracts';
import { t } from '../i18n';
import type { BindAction, ControlBindings } from '../ui/remap/bindings';
import { actionChips, type KeyChip, type LayoutMap } from '../ui/remap/labels';
import { uiScale, viewportRects } from './layout';

export type TipId = 'launch' | 'pit' | 'brake' | 'drift' | 'nitro';
/** Ordem de prioridade: a primeira que vale (e que ainda cabe) é a mostrada. */
const PRIORITY: readonly TipId[] = ['launch', 'pit', 'brake', 'drift', 'nitro'];
/** Quantas vezes, no máximo, cada dica aparece numa corrida (as que o jogador cumpre somem antes). */
const MAX_SHOWN: Readonly<Record<TipId, number>> = { launch: 1, pit: 2, brake: 3, drift: 3, nitro: 2 };
const ACTIONS: Readonly<Record<TipId, readonly BindAction[]>> = {
  launch: ['throttle'], pit: ['right', 'brake'], brake: ['brake'], drift: ['left', 'right', 'drift'], nitro: ['nitro'],
};

export const TIP_SHOW_TICKS = 5 * TICK_RATE;
export const TIP_GAP_TICKS = 2 * TICK_RATE;
/** A dica do nitro espera este tempo depois da largada (a da largada e a da primeira curva vêm antes). */
export const TIP_NITRO_AFTER_TICKS = 6 * TICK_RATE;
/** Quantos segmentos à frente a dica de frear olha (a IA olha tanto quanto o piloto dela pede; 36 dá ~3 s a toda). */
const BRAKE_LOOKAHEAD = 36;
/** A dica de frear só vale se o carro estiver acima do que dá para segurar na curva por esta folga. */
const BRAKE_SLACK = 1.03;
/** O box está "perto" (a seta pulsa) a menos disto, em segmentos. */
const PIT_NEAR_SEGMENTS = 30;

/** O que o jogador vê: qual dica, quais ações mostrar, e se há seta para o box (e se ele está perto). */
export interface TipView { id: TipId; actions: readonly BindAction[]; arrow: boolean; near: boolean }

interface SeatTips {
  active: TipId | null;
  since: number;
  nextAt: number;
  near: boolean;
  shown: Record<TipId, number>;
  learned: Set<TipId>;
  pitWanted: boolean;
}

export interface TipMemory { seats: Map<number, SeatTips> }

export function newTipMemory(): TipMemory {
  return { seats: new Map() };
}

/**
 * As dicas valem só na 1ª corrida do jogador (nunca correu), de copa ou Expedição, no sofá (online não: não há como esperar
 * ninguém ler). A sessão decide uma vez, ao montar a corrida; `racesRun` só sobe quando a corrida fecha.
 */
export function tipsEnabled(save: { racesRun: number }, mode: RaceMode, online: boolean): boolean {
  return save.racesRun === 0 && !online && (mode === 'career' || mode === 'cup');
}

function pitAhead(track: Track, car: CarState): boolean {
  for (let i = 0; i < PIT_NEAR_SEGMENTS; i++) if (segmentAt(track, car.z + i * SEGMENT_LENGTH).pit) return true;
  return false;
}

/** Um tick: chamar depois de cada `stepRace`, com as entradas que a simulação usou (por assento). */
export function observeTips(mem: TipMemory, state: RaceState, track: Track, inputs: ReadonlyArray<PlayerInput | undefined>): void {
  const tick = state.tick;
  for (const car of state.cars) {
    if (car.seat < 0) continue;
    let st = mem.seats.get(car.seat);
    if (!st) {
      st = { active: null, since: 0, nextAt: 0, near: false, shown: { launch: 0, pit: 0, brake: 0, drift: 0, nitro: 0 }, learned: new Set(), pitWanted: false };
      mem.seats.set(car.seat, st);
    }
    const input = inputs[car.seat] ?? { steer: 0, throttle: false, brake: false, nitro: false, gearUp: false, gearDown: false };
    const stats = carStats(car);
    const racing = state.phase === 'racing';

    if (state.events.some((e) => e.type === 'fuel_low' && e.carId === car.id)) st.pitWanted = true;
    if (car.inPit) st.pitWanted = false;
    const used = car.nitroTicks > 0 || state.events.some((e) => e.type === 'nitro' && e.carId === car.id);

    const curve = Math.abs(segmentAt(track, car.z).curve);
    const needBrake = racing && !car.inPit && car.nitroTicks === 0
      && brakingTarget(track, car.z, stats, 1, BRAKE_LOOKAHEAD, 1) * stats.topSpeed * BRAKE_SLACK < car.speed;
    const wants: Record<TipId, boolean> = {
      launch: state.phase === 'countdown' && car.launch === 0,
      pit: racing && st.pitWanted && !car.inPit,
      brake: needBrake && !input.brake,
      drift: racing && !car.inPit && car.driftDir === 0 && !input.brake && wantsDrift(track, car, stats),
      nitro: racing && tick >= state.startTick + TIP_NITRO_AFTER_TICKS && !car.inPit && nitroMeterOf(state, car) >= NITRO_CHARGE_COST
        && car.nitroTicks === 0 && curve < AI_BRAKE_CURVE && car.speed >= stats.topSpeed * 0.4,
    };
    // O que o jogador já fez dispensa a dica (e ela não volta).
    if (car.launch !== 0) st.learned.add('launch');
    if (needBrake && input.brake) st.learned.add('brake');
    if (car.driftDir !== 0) st.learned.add('drift');
    if (used) st.learned.add('nitro');

    if (st.active) {
      const id = st.active;
      if (!wants[id] || st.learned.has(id) || tick - st.since >= TIP_SHOW_TICKS) { st.active = null; st.nextAt = tick + TIP_GAP_TICKS; }
    }
    if (!st.active && tick >= st.nextAt) {
      const next = PRIORITY.find((id) => wants[id] && !st.learned.has(id) && st.shown[id] < MAX_SHOWN[id]);
      if (next) { st.active = next; st.since = tick; st.shown[next]++; }
    }
    if (st.active === 'pit') st.near = pitAhead(track, car);
  }
}

/** A dica do momento deste assento; null = nenhuma. */
export function tipOf(mem: TipMemory, seat: number): TipView | null {
  const st = mem.seats.get(seat);
  if (!st || !st.active) return null;
  return { id: st.active, actions: ACTIONS[st.active], arrow: st.active === 'pit', near: st.active === 'pit' && st.near };
}

/** A dica pronta para o overlay: texto no idioma atual e as teclas do dispositivo (e do remapeamento) daquele jogador. */
export interface TipText { id: TipId; text: string; keys: KeyChip[]; arrow: boolean; near: boolean }

export function describeTip(view: TipView, device: string | null, controls: ControlBindings, padName = '', layout: LayoutMap | null = null): TipText {
  return {
    id: view.id, text: t(`tutorial.tip.${view.id}`), keys: actionChips(view.actions, device, controls, padName, layout),
    arrow: view.arrow, near: view.near,
  };
}

// ───────────────────────────── Overlay ─────────────────────────────

export interface TipsHudView {
  width: number;
  height: number;
  /** Os viewports locais, na ordem de `RenderFrame.viewports`, cada um com a dica já descrita (null = nada). */
  viewports: ReadonlyArray<{ seat: number; color: string; tip: TipText | null }>;
  paused: boolean;
  reduceEffects: boolean;
}

export interface TipsHud {
  update(view: TipsHudView): void;
  hide(): void;
}

function setText(e: HTMLElement, s: string): void { if (e.textContent !== s) e.textContent = s; }
function setClass(e: HTMLElement, cls: string, on: boolean): void { if (e.classList.contains(cls) !== on) e.classList.toggle(cls, on); }
function setStyle(e: HTMLElement, prop: string, value: string): void { if (e.style.getPropertyValue(prop) !== value) e.style.setProperty(prop, value); }

interface Node { vp: HTMLElement; card: HTMLElement; arrow: HTMLElement; text: HTMLElement; keys: HTMLElement; keysSig: string; shownId: string }

/** Sem DOM (Node, testes de sessão) não existe: devolve null. Os nós nascem uma vez; por quadro só mudam texto, classe e estilo. */
export function createTipsHud(root: HTMLElement): TipsHud | null {
  if (typeof document === 'undefined') return null;
  let host: HTMLElement | null = null;
  let nodes: Node[] = [];

  function build(count: number): void {
    if (!host) { host = document.createElement('div'); host.className = 'ht-root hidden'; root.appendChild(host); }
    host.replaceChildren();
    nodes = Array.from({ length: count }, () => {
      const vp = document.createElement('div'); vp.className = 'ht-vp';
      const card = document.createElement('div'); card.className = 'ht-card';
      const arrow = document.createElement('span'); arrow.className = 'ht-arrow'; arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '➜';
      const body = document.createElement('div'); body.className = 'ht-body';
      const text = document.createElement('div'); text.className = 'ht-text';
      const keys = document.createElement('div'); keys.className = 'ht-keys';
      body.append(text, keys);
      card.append(arrow, body);
      vp.appendChild(card);
      host?.appendChild(vp);
      return { vp, card, arrow, text, keys, keysSig: '', shownId: '' };
    });
  }

  return {
    update(view) {
      if (view.paused || view.viewports.every((v) => v.tip === null)) { host?.classList.add('hidden'); return; }
      if (!host || view.viewports.length !== nodes.length) build(view.viewports.length);
      host?.classList.remove('hidden');
      const rects = viewportRects(view.viewports.length, view.width, view.height);
      view.viewports.forEach((vp, i) => {
        const n = nodes[i]; const rect = rects[i];
        if (!n || !rect) return;
        setStyle(n.vp, 'left', `${rect.x}px`); setStyle(n.vp, 'top', `${rect.y}px`); setStyle(n.vp, 'width', `${rect.w}px`); setStyle(n.vp, 'height', `${rect.h}px`);
        setStyle(n.vp, '--s', `calc(${uiScale(rect).toFixed(3)} * var(--hud-scale, 1))`); setStyle(n.vp, '--seat', vp.color);
        const tip = vp.tip;
        setClass(n.card, 'show', tip !== null);
        if (!tip) { n.shownId = ''; return; }
        n.card.dataset.tip = tip.id;
        setText(n.text, tip.text);
        setClass(n.arrow, 'on', tip.arrow);
        setClass(n.arrow, 'near', tip.near && !view.reduceEffects);
        const sig = tip.keys.map((k) => `${k.label}=${k.keys}`).join('|');
        if (sig !== n.keysSig) {
          n.keysSig = sig;
          n.keys.replaceChildren(...tip.keys.map((k) => {
            const chip = document.createElement('span'); chip.className = 'ht-key';
            const kbd = document.createElement('kbd'); kbd.textContent = k.keys;
            const label = document.createElement('span'); label.textContent = k.label;
            chip.append(kbd, label);
            return chip;
          }));
        }
        n.shownId = tip.id;
      });
    },
    hide() { host?.classList.add('hidden'); },
  };
}
