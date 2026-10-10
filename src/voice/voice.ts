// A voz do carro na sessão (N6, docs/ondas/N/N6.md §4.4): quando uma buzinada ou uma frase de provocação conta, e a roda que o
// jogador local usa para escolher a frase. Puro (sem DOM, sem áudio, sem relógio): a sessão passa o estado e as entradas.
// NADA daqui entra no estado da corrida — o núcleo nunca lê `PlayerInput.horn` nem `.taunt` —, mas os limites são por TICK e
// as entradas decodificadas são as mesmas em todas as máquinas, então todo computador decide igual o que soa e o que aparece.
// As constantes de voz moram AQUI e não em `src/core/constants.ts`: aquelas entram na impressão de volta dos recordes.
import { TICK_RATE } from '../core/constants';
import { carIndexOfSeat } from '../core/modes';
import type { PlayerInput, RaceState } from '../core/types';
import { t } from '../i18n';
import { TAUNT_COUNT } from '../net/protocol';
import './strings';

export { TAUNT_COUNT };

/** Mínimo entre duas buzinadas do mesmo jogador: 0,4 s (quem martela o botão não vira metralhadora). */
export const HORN_MIN_GAP_TICKS = 24;
/** Uma frase a cada 5 s por jogador. */
export const TAUNT_MIN_GAP_TICKS = 5 * TICK_RATE;
/** O balão fica 2 s. */
export const TAUNT_SHOW_SECONDS = 2;
/** Segurar a buzina por este tempo abre a roda de frases (antes disso é só uma buzinada). */
export const WHEEL_OPEN_SECONDS = 0.35;
/** Assentos possíveis (4 humanos). */
const SEATS = 4;

/** As chaves das 8 frases, na ordem do índice que vai na rede. */
export const TAUNT_KEYS: readonly string[] = Array.from({ length: TAUNT_COUNT }, (_, i) => `voice.taunt.${i}`);

/** O texto da frase `index` no idioma atual; vazio para índice inválido. */
export function tauntText(index: number): string {
  return Number.isInteger(index) && index >= 0 && index < TAUNT_COUNT ? t(TAUNT_KEYS[index]) : '';
}

// ───────────────────────────── O que soa e o que aparece ─────────────────────────────

export interface VoiceMemory {
  /** Último tick observado (um tick menor = corrida nova). */
  tick: number;
  /** Por assento: a buzina estava apertada no tick anterior? */
  prevHorn: boolean[];
  lastHornTick: Array<number | undefined>;
  lastTauntTick: Array<number | undefined>;
}

export function createVoiceMemory(): VoiceMemory {
  return { tick: -1, prevHorn: new Array<boolean>(SEATS).fill(false), lastHornTick: new Array<number | undefined>(SEATS).fill(undefined), lastTauntTick: new Array<number | undefined>(SEATS).fill(undefined) };
}

export type VoiceCue =
  | { type: 'horn'; seat: number; carIndex: number; carId: string }
  | { type: 'taunt'; seat: number; carIndex: number; carId: string; index: number };

/**
 * Chamar em CADA tick, com as entradas que o `stepRace` recebeu (as de todos os assentos, locais e vindas da rede), depois do
 * passo. Devolve o que soa e o que aparece NESTE tick:
 * - buzina: a BORDA de subida do botão (segurar é uma buzinada só), com `HORN_MIN_GAP_TICKS` entre duas do mesmo jogador;
 * - frase: o índice 0..7 que chegou neste tick, no máximo uma a cada `TAUNT_MIN_GAP_TICKS` por jogador (a descartada some).
 * Assento sem entrada (tomado pela IA) não emite nada.
 */
export function observeVoice(mem: VoiceMemory, state: RaceState, inputs: ReadonlyArray<PlayerInput | undefined>): VoiceCue[] {
  if (state.tick < mem.tick) Object.assign(mem, createVoiceMemory()); // corrida nova
  mem.tick = state.tick;
  const out: VoiceCue[] = [];
  const seats = Math.min(SEATS, inputs.length);
  for (let seat = 0; seat < seats; seat++) {
    const input = inputs[seat];
    const horn = input?.horn === true;
    const rising = horn && !mem.prevHorn[seat];
    mem.prevHorn[seat] = horn;
    if (!input) continue;
    const carIndex = carIndexOfSeat(state, seat);
    const car = carIndex >= 0 ? state.cars[carIndex] : undefined;
    if (!car) continue;
    const lastHorn = mem.lastHornTick[seat];
    if (rising && (lastHorn === undefined || state.tick - lastHorn >= HORN_MIN_GAP_TICKS)) {
      mem.lastHornTick[seat] = state.tick;
      out.push({ type: 'horn', seat, carIndex, carId: car.carId });
    }
    const taunt = input.taunt;
    if (typeof taunt === 'number' && Number.isInteger(taunt) && taunt >= 0 && taunt < TAUNT_COUNT) {
      const last = mem.lastTauntTick[seat];
      if (last === undefined || state.tick - last >= TAUNT_MIN_GAP_TICKS) {
        mem.lastTauntTick[seat] = state.tick;
        out.push({ type: 'taunt', seat, carIndex, carId: car.carId, index: taunt });
      }
    }
  }
  return out;
}

/** Ticks que faltam para o jogador poder falar de novo (0 = já pode). */
export function tauntCooldownTicks(mem: VoiceMemory, seat: number, tick: number): number {
  const last = mem.lastTauntTick[seat];
  return last === undefined ? 0 : Math.max(0, TAUNT_MIN_GAP_TICKS - (tick - last));
}

// ───────────────────────────── A roda de frases ─────────────────────────────

/** A roda de UM jogador local. Mora na sessão e anda UMA vez por quadro de tela (nunca em `readInputs`, que é chamado 2× com driver). */
export interface WheelState {
  /** Segundos com a buzina apertada. */
  held: number;
  open: boolean;
  /** Frase marcada (0..7); -1 = nenhuma. */
  selected: number;
  hornPrev: boolean;
}

export function newWheel(): WheelState {
  return { held: 0, open: false, selected: -1, hornPrev: false };
}

export interface WheelStep {
  /** A frase a enviar neste quadro (soltou a buzina com uma marcada e podia falar), ou null. */
  taunt: number | null;
  /** Com a roda aberta, marcha acima/abaixo são da roda: a sessão as tira da entrada que vai à física. */
  consumeGears: boolean;
}

/**
 * Um quadro da roda. Apertar a buzina buzina na hora (o som é da entrada); segurar `WHEEL_OPEN_SECONDS` abre a roda, sem frase
 * marcada; com ela aberta, marcha acima/abaixo (bordas) giram a marcação; soltar a buzina com uma frase marcada a envia, e sem
 * marcar cancela. `canTaunt` falso (no intervalo de 5 s) deixa a roda abrir e girar, mas soltar não envia nada.
 */
export function stepWheel(w: WheelState, input: { horn: boolean; gearUp: boolean; gearDown: boolean }, dt: number, canTaunt: boolean): WheelStep {
  const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
  let taunt: number | null = null;
  let consumeGears = false;
  if (input.horn) {
    w.held += step;
    if (!w.open && w.held >= WHEEL_OPEN_SECONDS) { w.open = true; w.selected = -1; }
    if (w.open) {
      consumeGears = true;
      if (input.gearUp) w.selected = (w.selected + 1) % TAUNT_COUNT;
      else if (input.gearDown) w.selected = w.selected <= 0 ? TAUNT_COUNT - 1 : w.selected - 1;
    }
  } else {
    if (w.hornPrev && w.open && w.selected >= 0 && canTaunt) taunt = w.selected;
    w.held = 0;
    w.open = false;
    w.selected = -1;
  }
  w.hornPrev = input.horn;
  return { taunt, consumeGears };
}

// ───────────────────────────── Quem escuta o quê, e o balão ─────────────────────────────

/** A buzina de outro computador (online) soa mais baixa que a do próprio jogador. */
export const HORN_REMOTE_GAIN = 0.6;

export function hornGain(local: boolean): number {
  return local ? 1 : HORN_REMOTE_GAIN;
}

/** Este computador apresenta a voz desse jogador? O jogador local sempre; o de outro computador, a menos que esteja silenciado (prefs.ts). */
export function audibleFor(local: boolean, name: string, muted: (name: string) => boolean): boolean {
  return local || !muted(name);
}

/** Um balão de fala: quem falou, o que disse e quanto falta para sumir. */
export interface Balloon {
  id: number;
  /** Assento de quem falou; -1 = o rival da IA. */
  seat: number;
  name: string;
  color: string;
  text: string;
  /** Segundos restantes e o total (para a animação de saída). */
  ttl: number;
  total: number;
  /** O falante é um jogador deste computador: o balão fica sobre o carro dele, no viewport dele. */
  own: boolean;
}

/** Quantos balões vivos, no máximo (quatro jogadores mais o rival e folga). */
export const MAX_BALLOONS = 8;

/** O estado de voz de uma corrida: a memória dos limites, a roda de cada assento local, o que a roda entrega à entrada e os balões vivos. */
export interface VoiceRace {
  mem: VoiceMemory;
  /** Por assento. */
  wheels: WheelState[];
  /** Por assento: o que a roda decidiu NESTE quadro de tela (a frase escolhida, se as marchas são da roda). */
  seatInput: Array<{ taunt?: number; consume: boolean } | undefined>;
  balloons: Balloon[];
  nextId: number;
}

export function createVoiceRace(): VoiceRace {
  return { mem: createVoiceMemory(), wheels: [], seatInput: [], balloons: [], nextId: 1 };
}

/** Põe um balão; quem já tinha um vivo o troca (um por falante), e passando de `MAX_BALLOONS` sai o mais antigo. */
export function addBalloon(v: VoiceRace, b: Omit<Balloon, 'id' | 'total'>): Balloon {
  const balloon: Balloon = { ...b, id: v.nextId++, total: b.ttl };
  const old = v.balloons.findIndex((x) => x.seat === b.seat && x.name === b.name);
  if (old >= 0) v.balloons.splice(old, 1);
  v.balloons.push(balloon);
  while (v.balloons.length > MAX_BALLOONS) v.balloons.shift();
  return balloon;
}

/** Passa o tempo dos balões (só com a corrida andando); os vencidos saem. */
export function ageBalloons(v: VoiceRace, dt: number): void {
  for (let i = v.balloons.length - 1; i >= 0; i--) {
    v.balloons[i].ttl -= dt;
    if (v.balloons[i].ttl <= 0) v.balloons.splice(i, 1);
  }
}
