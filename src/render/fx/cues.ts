// Bordas do estado que disparam efeitos (M5). O núcleo não manda evento para o render: `state.events` vale só para o ÚLTIMO tick, e um
// quadro de tela cobre vários (a 30 fps, dois; no monitor de 144 Hz, um quadro cobre zero). Então as transições saem do estado, por
// carro, como `cars/motion.ts` faz com a batida: a subida de um contador é a borda, e o primeiro quadro só guarda o que já estava.
//   go     contagem → corrida (um por humano; `perfect` = largada-foguete, `car.launch`)
//   nitro  `nitroTicks` de 0 para > 0 (o arranque de nitro da largada-foguete NÃO conta: é o "go" perfeito)
//   hit    `collisionCooldown` de 0 para > 0 (a regra antiga `>= COOLDOWN - 1` perdia a batida quando o quadro cobria 2 ticks ou mais)
//   boost  `driftBoostTicks` de 0 para > 0; o nível (1..3) sai do tamanho dele contra `DRIFT_BOOST_TICKS`
// Corrida nova (tick recuado, outra lista de carros, ou de volta à contagem) recomeça sem disparar. Só LÊ o estado.
import { DRIFT_BOOST_TICKS, LAUNCH_PERFECT } from '../../core/constants';
import type { RacePhase, RaceState } from '../../core/types';

export type FxCue =
  | { kind: 'go'; car: number; perfect: boolean }
  | { kind: 'nitro'; car: number }
  | { kind: 'hit'; car: number; drop: number }
  | { kind: 'boost'; car: number; level: number };

export interface CueMemory {
  /** Tick e fase do quadro anterior (−1 = nada visto). */
  tick: number;
  phase: RacePhase | null;
  /** Por carro (índice em `state.cars`). */
  ids: number[];
  cooldown: number[];
  nitro: number[];
  boost: number[];
  speed: number[];
}

export function newCueMemory(): CueMemory {
  return { tick: -1, phase: null, ids: [], cooldown: [], nitro: [], boost: [], speed: [] };
}

/** Quantos ticks do impulso o quadro pode ter gasto até a borda ser vista (2 a 3 num quadro de 30 fps; 4 de folga). */
const BOOST_SLACK = 4;

/** O nível do impulso da derrapagem que tem `ticks` restantes logo depois da borda. */
export function boostLevelOf(ticks: number): number {
  for (let i = 0; i < DRIFT_BOOST_TICKS.length; i++) {
    const full = DRIFT_BOOST_TICKS[i];
    if (ticks <= full && full - ticks <= BOOST_SLACK) return i + 1;
  }
  return 1;
}

function remember(mem: CueMemory, state: RaceState): void {
  const n = state.cars.length;
  mem.tick = state.tick; mem.phase = state.phase;
  mem.ids.length = n; mem.cooldown.length = n; mem.nitro.length = n; mem.boost.length = n; mem.speed.length = n;
  for (let i = 0; i < n; i++) {
    const c = state.cars[i];
    mem.ids[i] = c.id; mem.cooldown[i] = c.collisionCooldown; mem.nitro[i] = c.nitroTicks; mem.boost[i] = c.driftBoostTicks; mem.speed[i] = c.speed;
  }
}

/** Chamar uma vez por quadro de tela. Preenche e devolve `out` (esvaziado antes). */
export function observeCues(mem: CueMemory, state: RaceState, out: FxCue[] = []): FxCue[] {
  out.length = 0;
  const cars = state.cars;
  const same = mem.tick >= 0 && mem.ids.length === cars.length && state.tick >= mem.tick && !(mem.phase !== 'countdown' && state.phase === 'countdown')
    && cars.every((c, i) => c.id === mem.ids[i]);
  if (same) {
    const go = mem.phase === 'countdown' && state.phase === 'racing';
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (go) {
        if (c.seat >= 0) out.push({ kind: 'go', car: c.id, perfect: c.launch === LAUNCH_PERFECT });
      } else if (c.nitroTicks > 0 && mem.nitro[i] === 0) {
        out.push({ kind: 'nitro', car: c.id });
      }
      if (c.collisionCooldown > 0 && mem.cooldown[i] === 0) {
        out.push({ kind: 'hit', car: c.id, drop: c.stats.topSpeed > 0 ? Math.max(0, (mem.speed[i] - c.speed) / c.stats.topSpeed) : 0 });
      }
      if (c.driftBoostTicks > 0 && mem.boost[i] === 0) out.push({ kind: 'boost', car: c.id, level: boostLevelOf(c.driftBoostTicks) });
    }
  }
  remember(mem, state);
  return out;
}
