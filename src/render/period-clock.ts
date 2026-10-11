// O relógio do período no renderizador (M6, b). Puro: a cada quadro vira "fração da corrida do líder entre os carros da tela" → `t` da transição → paleta ao vivo, e só diz
// que mudou quando o `t` andou o bastante (1/512: abaixo disso é o degrau de 8 bits da cor) — assim o renderizador não reescreve uniformes nem aloca a cada quadro.
import type { SceneryId, TimeOfDay } from '../core/types';
import { advanceRaceProgress, livePalette, raceFraction, type LivePalette } from './palette';

/** O `t` anda no mínimo isto para o renderizador reescrever os uniformes. */
export const LIVE_STEP = 1 / 512;

export interface ClockFrame { live: LivePalette; changed: boolean }

export class PeriodClock {
  private fraction = 0;
  private lastT = Number.NaN;

  private frame(scenery: SceneryId, time: TimeOfDay, laps: number): ClockFrame {
    const live = livePalette(scenery, time, laps, this.fraction);
    const endpoint = (live.t === 0 || live.t === 1) && live.t !== this.lastT;
    const changed = Number.isNaN(this.lastT) || endpoint || Math.abs(live.t - this.lastT) >= LIVE_STEP;
    if (changed) this.lastT = live.t;
    return { live, changed };
  }

  /** Um quadro de corrida: `progresses` = o `progress` (volta × comprimento + z, núcleo) de cada carro que uma tela mostra. */
  step(scenery: SceneryId, time: TimeOfDay, laps: number, length: number, progresses: readonly number[]): ClockFrame {
    this.fraction = advanceRaceProgress(this.fraction, raceFraction(progresses, laps, length));
    return this.frame(scenery, time, laps);
  }

  /** Fora da corrida (o fundo do menu): o período da pista. */
  idle(scenery: SceneryId, time: TimeOfDay, laps: number): ClockFrame {
    this.fraction = 0;
    return this.frame(scenery, time, laps);
  }

  /** Pista nova: o próximo quadro entrega a paleta dela. */
  reset(): void { this.fraction = 0; this.lastT = Number.NaN; }
}
