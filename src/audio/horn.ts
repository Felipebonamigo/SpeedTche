// A buzina de cada carro (N6, docs/ondas/N/N6.md §4.2): 14 buzinas curtas em síntese, indexadas pelo id do carro (nada de
// áudio vai para `CarDef`: `CARS` entra na impressão de volta dos recordes). Cada buzina é uma lista de PULSOS (instante,
// duração, notas, deslize); `hornTones` a transforma nos tons que o `playTone` toca — pura, para se provar sem placa de som.
// Nenhuma passa de `HORN_MAX_SECONDS`: buzina sustentada não existe (segurar o botão abre a roda de frases, não prolonga o som).
import { ENV_PAD, noiseBurst, playTone, type Envelope, type FilterSpec, type ToneOpts } from './synth';

/** Duração máxima de uma buzina inteira, com a cauda do envelope. */
export const HORN_MAX_SECONDS = 0.9;
/** Quantas buzinas soam ao mesmo tempo, no máximo (quatro telas buzinando juntas não viram uma parede de som). */
export const HORN_MAX_VOICES = 6;
/** Pico de ganho de UM tom (a soma do acorde fica abaixo de ~0,5 antes do compressor mestre). */
export const HORN_MAX_GAIN = 0.35;

const HORN_ENV: Readonly<Envelope> = Object.freeze({ attack: 0.012, decay: 0.04, sustain: 0.85, release: 0.06 });

interface HornPulse {
  /** Instante (s) e duração (s) até começar o release. */
  at: number;
  dur: number;
  /** Notas deste toque (Hz); sem elas vale `notes` da buzina. */
  notes?: readonly number[];
  /** Multiplicador da frequência no fim do toque (deslize): 0,5 = uma oitava para baixo. */
  glide?: number;
}

interface HornSpec {
  wave: OscillatorType;
  notes: readonly number[];
  pulses: readonly HornPulse[];
  filter?: FilterSpec;
  /** Volume relativo da buzina, 0..1. */
  gain: number;
  /** Estalo de ruído (a chama do Boitatá), em segundos a partir do começo. */
  crackle?: { at: number; dur: number; freq: number };
}

const SPECS: Readonly<Record<string, HornSpec>> = {
  // Buzina de carro de verdade: duas notas, terça maior, um toque.
  falcao: { wave: 'square', notes: [440, 554.37], pulses: [{ at: 0, dur: 0.38 }], filter: { type: 'lowpass', freq: 3000 }, gain: 0.9 },
  // V12: grave e comprida.
  trovao: { wave: 'sawtooth', notes: [196, 246.94], pulses: [{ at: 0, dur: 0.66 }], filter: { type: 'lowpass', freq: 900 }, gain: 1 },
  // "bi-bi" do hatch.
  tornado: { wave: 'square', notes: [523.25, 659.25], pulses: [{ at: 0, dur: 0.1 }, { at: 0.16, dur: 0.1 }], filter: { type: 'lowpass', freq: 3500 }, gain: 0.85 },
  // O camelo: "mééé", descendo.
  camelo: { wave: 'sawtooth', notes: [185, 196], pulses: [{ at: 0, dur: 0.5, glide: 0.75 }], filter: { type: 'lowpass', freq: 1500 }, gain: 0.95 },
  // O Saci: duas piadinhas agudas subindo.
  saci: { wave: 'triangle', notes: [1174.66, 1568], pulses: [{ at: 0, dur: 0.1, glide: 1.4 }, { at: 0.15, dur: 0.1, glide: 1.4 }], gain: 0.8 },
  // Trompa de caminhão: três notas.
  tatu: { wave: 'sawtooth', notes: [311.13, 369.99, 466.16], pulses: [{ at: 0, dur: 0.76 }], filter: { type: 'lowpass', freq: 1400 }, gain: 1 },
  // "fom-fom" de fusca.
  boto: { wave: 'sawtooth', notes: [329.63, 415.3], pulses: [{ at: 0, dur: 0.2 }, { at: 0.27, dur: 0.2 }], filter: { type: 'lowpass', freq: 1100 }, gain: 0.9 },
  // Três notas subindo.
  curupira: {
    wave: 'square', notes: [659.25],
    pulses: [{ at: 0, dur: 0.1, notes: [659.25] }, { at: 0.13, dur: 0.1, notes: [783.99] }, { at: 0.26, dur: 0.24, notes: [987.77] }],
    filter: { type: 'lowpass', freq: 3200 }, gain: 0.8,
  },
  // Elétrico: "pe-pooo".
  sucuri: { wave: 'sine', notes: [880, 1318.5], pulses: [{ at: 0, dur: 0.09 }, { at: 0.14, dur: 0.34, glide: 0.7 }], gain: 0.95 },
  // O grito do carcará: desliza para baixo.
  carcara: { wave: 'sawtooth', notes: [1244.51, 1318.51], pulses: [{ at: 0, dur: 0.46, glide: 0.5 }], filter: { type: 'lowpass', freq: 3000 }, gain: 0.8 },
  // V10: um berro que sobe uma oitava.
  pororoca: { wave: 'sawtooth', notes: [196, 246.94], pulses: [{ at: 0, dur: 0.56, glide: 2 }], filter: { type: 'lowpass', freq: 2200 }, gain: 0.95 },
  // Sirene: alterna duas notas.
  iara: {
    wave: 'triangle', notes: [659.25],
    pulses: [{ at: 0, dur: 0.14, notes: [659.25] }, { at: 0.16, dur: 0.14, notes: [880] }, { at: 0.32, dur: 0.14, notes: [659.25] }, { at: 0.48, dur: 0.14, notes: [880] }],
    gain: 0.85,
  },
  // Corneta de fogo: uma quinta, com estalo de chama.
  boitata: { wave: 'sawtooth', notes: [261.63, 392], pulses: [{ at: 0, dur: 0.62 }], filter: { type: 'lowpass', freq: 1800 }, gain: 0.95, crackle: { at: 0.02, dur: 0.3, freq: 2400 } },
  // Trinado de beija-flor: seis toques rápidos alternando duas notas.
  beijaflor: {
    wave: 'sine', notes: [1568],
    pulses: [0, 1, 2, 3, 4, 5].map((i) => ({ at: i * 0.07, dur: 0.05, notes: [i % 2 === 0 ? 1568 : 1760] })),
    gain: 0.8,
  },
};

const DEFAULT_ID = 'falcao';

function specOf(carId: string): HornSpec {
  return SPECS[carId] ?? SPECS[DEFAULT_ID];
}

/**
 * Os tons da buzina do carro a partir do instante `at` (s do contexto), com `gain` 0..1. Puro. Ganho zero ou inválido não
 * gera nenhum tom. Carro desconhecido soa como o Falcão.
 */
export function hornTones(carId: string, at: number, gain: number): ToneOpts[] {
  if (!(gain > 0)) return [];
  const spec = specOf(carId);
  const tones: ToneOpts[] = [];
  for (const pulse of spec.pulses) {
    const notes = pulse.notes ?? spec.notes;
    for (const freq of notes) {
      tones.push({
        freq, dur: pulse.dur, type: spec.wave, at: at + pulse.at, env: HORN_ENV, filter: spec.filter,
        gain: Math.min(HORN_MAX_GAIN, (HORN_MAX_GAIN / Math.sqrt(notes.length)) * spec.gain * Math.min(1, gain)),
        ...(pulse.glide !== undefined ? { freqEnd: freq * pulse.glide } : {}),
      });
    }
  }
  return tones;
}

/** Toca a buzina do carro a partir de `at`; devolve o instante em que ela deixa de soar (o teto de `HORN_MAX_SECONDS`). */
export function playHorn(ctx: BaseAudioContext, dest: AudioNode, carId: string, at: number, gain: number): number {
  const spec = specOf(carId);
  for (const tone of hornTones(carId, at, gain)) playTone(ctx, dest, tone);
  if (spec.crackle && gain > 0) {
    noiseBurst(ctx, dest, {
      dur: spec.crackle.dur, gain: 0.18 * Math.min(1, gain), at: at + spec.crackle.at,
      filter: { type: 'bandpass', freq: spec.crackle.freq, q: 0.8 }, env: ENV_PAD,
    });
  }
  return at + HORN_MAX_SECONDS;
}

export interface HornPlayer {
  /** Toca a buzina do carro com o ganho dado (0..1). Falso = não tocou (ganho inválido ou já há `HORN_MAX_VOICES` soando). */
  play(carId: string, gain: number): boolean;
}

/** O tocador do grafo de áudio: guarda até quando cada buzina soa para impor o teto de vozes simultâneas. */
export function createHornPlayer(ctx: AudioContext, dest: AudioNode): HornPlayer {
  const endsAt: number[] = [];
  return {
    play(carId, gain) {
      if (!(gain > 0)) return false;
      const now = ctx.currentTime;
      for (let i = endsAt.length - 1; i >= 0; i--) if (endsAt[i] <= now) endsAt.splice(i, 1);
      if (endsAt.length >= HORN_MAX_VOICES) return false;
      endsAt.push(playHorn(ctx, dest, carId, now, gain));
      return true;
    },
  };
}
