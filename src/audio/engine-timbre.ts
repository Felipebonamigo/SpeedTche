// O timbre do motor de cada carro (N6, docs/ondas/N/N6.md §4.1). Dado puro e congelado, indexado pelo id do carro
// (`CarState.carId`): nada de áudio é campo de `CarDef` — `CARS` entra na impressão de volta dos recordes, e mexer nele
// invalidaria todos eles sem a física ter mudado. Tudo é síntese; o ouvido separa os 14 por altura, mistura de ondas,
// brilho, "ronco" (modulação de amplitude) e "zumbido" (senoide aguda que sobe com o giro).
import { COUNTDOWN_TICKS } from '../core/constants';
import { CARS } from '../core/data/cars';
import type { CarBody } from '../core/types';

export interface EngineTimbre {
  /** Multiplica a faixa de frequência do motor (ENGINE_MIN_HZ..ENGINE_MAX_HZ): < 1 grave, > 1 agudo. */
  pitch: number;
  /** Onda principal e onda do "sub" (a segunda voz, em `subRatio` da fundamental). */
  main: OscillatorType;
  sub: OscillatorType;
  subRatio: number;
  /** Nível do sub em relação ao principal, 0..1. */
  subMix: number;
  /** Passa-baixa que segue o giro: `cutoff + span × giro` (Hz) e a ressonância. */
  cutoff: number;
  span: number;
  q: number;
  /** Ronco: profundidade 0..1 da modulação de amplitude (V8, diesel) e quantas vezes mais rápida que a base ela bate. */
  lope: number;
  lopeRate: number;
  /** Zumbido: nível 0..1 de uma senoide em `whineRatio` vezes a fundamental (elétrico, turbina). */
  whine: number;
  whineRatio: number;
  /** Volume relativo do carro (1 = o Falcão). */
  gain: number;
}

/** Base por carroceria. O `gt` é exatamente o som de antes da N6 (serra + quadrada uma oitava abaixo, `250 + 1400 × giro`). */
const BODY_BASE: Readonly<Record<CarBody, EngineTimbre>> = {
  gt: { pitch: 1, main: 'sawtooth', sub: 'square', subRatio: 0.5, subMix: 1, cutoff: 250, span: 1400, q: 1.2, lope: 0, lopeRate: 0, whine: 0, whineRatio: 1, gain: 1 },
  // V8 grave com ronco.
  muscle: { pitch: 0.72, main: 'sawtooth', sub: 'square', subRatio: 0.5, subMix: 1, cutoff: 170, span: 950, q: 1.4, lope: 0.35, lopeRate: 1, whine: 0, whineRatio: 1, gain: 1.1 },
  // Quatro cilindros, agudo e áspero.
  hatch: { pitch: 1.3, main: 'sawtooth', sub: 'square', subRatio: 0.5, subMix: 0.35, cutoff: 380, span: 2200, q: 1.8, lope: 0, lopeRate: 0, whine: 0, whineRatio: 1, gain: 0.95 },
  sedan: { pitch: 0.95, main: 'triangle', sub: 'square', subRatio: 0.5, subMix: 0.5, cutoff: 220, span: 800, q: 1, lope: 0.1, lopeRate: 1, whine: 0, whineRatio: 1, gain: 0.85 },
  // Elétrico: zumbido de motor de indução, sem ronco.
  electric: { pitch: 1.5, main: 'sine', sub: 'sine', subRatio: 0.5, subMix: 0.2, cutoff: 600, span: 2500, q: 0.7, lope: 0, lopeRate: 0, whine: 0.9, whineRatio: 4, gain: 0.7 },
  // Rali: turbo que solta bolhas no alívio (ronco rápido) e um assobio.
  rally: { pitch: 1.2, main: 'sawtooth', sub: 'sawtooth', subRatio: 0.5, subMix: 0.4, cutoff: 420, span: 2300, q: 1.6, lope: 0.4, lopeRate: 2.2, whine: 0.25, whineRatio: 3, gain: 1 },
  // Hiperesportivo: grito de V10, corte alto e ressonante.
  hyper: { pitch: 1.05, main: 'sawtooth', sub: 'sawtooth', subRatio: 0.5, subMix: 0.8, cutoff: 520, span: 3200, q: 2.4, lope: 0, lopeRate: 0, whine: 0.35, whineRatio: 2, gain: 1 },
  // Clássico: suave, com o balançar de um motor antigo.
  classic: { pitch: 0.9, main: 'triangle', sub: 'square', subRatio: 0.5, subMix: 0.6, cutoff: 230, span: 900, q: 1, lope: 0.28, lopeRate: 1, whine: 0, whineRatio: 1, gain: 0.9 },
  // Cunha turbo: assobio de turbina.
  wedge: { pitch: 1.1, main: 'sawtooth', sub: 'triangle', subRatio: 0.5, subMix: 0.5, cutoff: 340, span: 2000, q: 1.5, lope: 0, lopeRate: 0, whine: 0.6, whineRatio: 5, gain: 0.95 },
  // Picape a diesel: grave, batendo devagar.
  pickup: { pitch: 0.82, main: 'sawtooth', sub: 'square', subRatio: 0.5, subMix: 1, cutoff: 190, span: 800, q: 1.3, lope: 0.5, lopeRate: 0.75, whine: 0, whineRatio: 1, gain: 1.1 },
  // Protótipo: muito agudo, com o "tremor" de asa de beija-flor.
  prototype: { pitch: 1.9, main: 'triangle', sub: 'sawtooth', subRatio: 0.5, subMix: 0.4, cutoff: 500, span: 3000, q: 2, lope: 0.5, lopeRate: 3, whine: 0.3, whineRatio: 2, gain: 0.85 },
  // Micro: motorzinho de dois cilindros, a quinta em vez da oitava.
  micro: { pitch: 1.65, main: 'square', sub: 'sawtooth', subRatio: 0.75, subMix: 0.6, cutoff: 480, span: 2000, q: 1.4, lope: 0.3, lopeRate: 2.5, whine: 0, whineRatio: 1, gain: 0.8 },
  roadster: { pitch: 1.25, main: 'sawtooth', sub: 'square', subRatio: 0.5, subMix: 0.3, cutoff: 450, span: 2600, q: 2, lope: 0, lopeRate: 0, whine: 0.1, whineRatio: 2, gain: 0.95 },
};

/** O que muda por carro em cima da carroceria (o Falcão e o Boitatá dividem o `gt`). */
const CAR_TWEAKS: Readonly<Record<string, Partial<EngineTimbre>>> = {
  boitata: { pitch: 0.9, cutoff: 300, span: 1700, q: 1.6, lope: 0.3, lopeRate: 1.2, whine: 0.15, whineRatio: 3, gain: 1.05 },
  pororoca: { pitch: 0.95 },
  // Os dois hatches nacionais (dividem a carroceria com o Tornado): quatro cilindros mais grave e quadrado, e outro mais agudo e arisco.
  cuiabano: { pitch: 1.1, main: 'square', subMix: 0.55, cutoff: 300, span: 1700, q: 1.2, lope: 0.14, lopeRate: 1, gain: 0.95 },
  // V6c, lote 2: redondo e macio (triângulo), europeu de zumbido seco, sedã de tio (grave e arredondado) e o motorzinho do furgão (fraco e áspero).
  caipora: { pitch: 1.25, main: 'triangle', sub: 'triangle', subMix: 0.5, cutoff: 360, span: 1500, q: 1, lope: 0.2, lopeRate: 1.6, gain: 0.9 },
  pampeiro: { pitch: 1.4, main: 'sawtooth', sub: 'sawtooth', subMix: 0.25, cutoff: 520, span: 3000, q: 2.6, whine: 0.35, whineRatio: 3, gain: 0.92 },
  barao: { pitch: 0.82, main: 'sawtooth', sub: 'triangle', subMix: 0.7, cutoff: 190, span: 700, q: 0.9, lope: 0.2, lopeRate: 0.9, gain: 0.85 },
  furgao: { pitch: 1.9, main: 'square', sub: 'square', subRatio: 0.667, subMix: 0.7, cutoff: 560, span: 1500, q: 2, lope: 0.45, lopeRate: 3.2, gain: 0.7 },
  tupiniquim: { pitch: 1.5, main: 'triangle', sub: 'sawtooth', subMix: 0.3, cutoff: 460, span: 2600, q: 2.2, whine: 0.2, whineRatio: 2, gain: 0.9 },
};

const DEFAULT_ID = 'falcao';

function build(): Readonly<Record<string, EngineTimbre>> {
  const out: Record<string, EngineTimbre> = {};
  for (const car of CARS) out[car.id] = Object.freeze({ ...BODY_BASE[car.body], ...CAR_TWEAKS[car.id] });
  return Object.freeze(out);
}

const TIMBRES = build();

/** O timbre do motor do carro; id desconhecido (save antigo, carro de teste) soa como o Falcão. */
export function engineTimbre(carId: string): EngineTimbre {
  return TIMBRES[carId] ?? TIMBRES[DEFAULT_ID];
}

// ───────────────────────────── Contagem e largada ─────────────────────────────

/** Giro (0..1) que o motor alcança no "JÁ". */
export const COUNTDOWN_REV_PEAK = 0.85;
/** Giro de marcha lenta da contagem (um pouco acima do parado: o piloto já está com o pé no acelerador). */
const COUNTDOWN_REV_FLOOR = 0.1;
/** Os números trocam (3, 2, 1) nestes ticks da contagem; em cada um o piloto dá um toque no acelerador. */
const BLIP_TICKS: readonly number[] = [30, 90, 150];
const BLIP_HEIGHT = 0.12;
const BLIP_TICKS_LONG = 15;
/** Depois do "JÁ", o giro de largada leva este tanto de ticks para cair até o que a velocidade pede. */
export const LAUNCH_DECAY_TICKS = 40;

/**
 * Giro alvo do motor durante a contagem, em função do tick dela: sobe da marcha lenta até `COUNTDOWN_REV_PEAK` no "JÁ"
 * (curva suave) com um toque no acelerador a cada número. Puro e sem sorteio. A N1 pode substituí-lo por carro com
 * `EngineBank.setRevHook` (largada perfeita = pé na hora certa).
 */
export function countdownRpm(tick: number): number {
  const f = Math.max(0, Math.min(1, tick / COUNTDOWN_TICKS));
  let rpm = COUNTDOWN_REV_FLOOR + (COUNTDOWN_REV_PEAK - COUNTDOWN_REV_FLOOR) * f * Math.sqrt(f);
  for (const at of BLIP_TICKS) {
    const since = tick - at;
    if (since >= 0 && since < BLIP_TICKS_LONG) rpm += BLIP_HEIGHT * (1 - since / BLIP_TICKS_LONG);
  }
  return Math.max(0, Math.min(1, rpm));
}

/** Giro de largada depois do "JÁ": parte do pico e cai a zero em `LAUNCH_DECAY_TICKS`; o motor usa o maior entre ele e o da velocidade. */
export function launchRpm(ticksSinceGo: number): number {
  if (!(ticksSinceGo >= 0) || ticksSinceGo >= LAUNCH_DECAY_TICKS) return 0;
  return COUNTDOWN_REV_PEAK * (1 - ticksSinceGo / LAUNCH_DECAY_TICKS);
}
