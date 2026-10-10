// Vibração a partir da corrida: batida entre carros (força pela intensidade), batida no cenário
// (forte), raspão de lado (curto e fraco), nitro (curto), grama (fraco, pulsando com limite de frequência) e largada. Puro: devolve
// pedidos que a sessão entrega a `input.rumble`, que ignora quem não tem gamepad, controle sem
// motor e a opção de vibração desligada. Chamado uma vez por tick, depois de `stepRace`.
import type { RaceState } from '../core/types';
import type { ScrapeCue } from './race-feel';

export interface RumbleCue { seat: number; strength: number; ms: number }

export const RUMBLE_GO = { strength: 0.55, ms: 220 };
export const RUMBLE_CRASH = { strength: 1, ms: 320 };
export const RUMBLE_NITRO = { strength: 0.35, ms: 110 };
/** Batida entre carros: força = min + intensidade × faixa (a intensidade do evento vai de 0 a 1). */
export const RUMBLE_COLLISION = { min: 0.3, range: 0.6, ms: 110, msRange: 170 };
/** Raspão de lado (race-feel.ts: observeScrapes): um toque curto e fraco, um pouco mais forte com a velocidade. */
export const RUMBLE_SCRAPE = { min: 0.12, range: 0.2, ms: 90 };
/**
 * Grama: um pulso a cada `everyTicks` (≈ 7 por segundo a 60 Hz) enquanto o carro humano estiver fora
 * do asfalto e andando; a duração cobre o intervalo, então o tremor é contínuo sem inundar a API.
 */
export const RUMBLE_GRASS = { strength: 0.16, ms: 160, everyTicks: 9, minSpeed: 400 };

export interface RumbleMemory {
  /** Tick do último pulso de grama por assento. */
  grassTick: Array<number | undefined>;
}

export function newRumbleMemory(): RumbleMemory {
  return { grassTick: [] };
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/** `scrapes`: os raspões novos deste tick (observeScrapes), derivados do estado; ausente = só os eventos do núcleo. */
export function rumbleCues(state: RaceState, mem: RumbleMemory, scrapes: readonly ScrapeCue[] = []): RumbleCue[] {
  const out: RumbleCue[] = [];
  const seatOf = (carId: number) => state.cars[carId]?.seat ?? -1;
  const push = (carId: number, cue: { strength: number; ms: number }) => {
    const seat = seatOf(carId);
    if (seat >= 0) out.push({ seat, strength: cue.strength, ms: cue.ms });
  };
  for (const e of state.events) {
    switch (e.type) {
      case 'go':
        for (const c of state.cars) if (c.seat >= 0) out.push({ seat: c.seat, ...RUMBLE_GO });
        break;
      case 'collision': {
        const s = clamp01(e.strength);
        const cue = { strength: RUMBLE_COLLISION.min + RUMBLE_COLLISION.range * s, ms: Math.round(RUMBLE_COLLISION.ms + RUMBLE_COLLISION.msRange * s) };
        push(e.carId, cue);
        push(e.otherId, cue);
        break;
      }
      case 'crash': push(e.carId, RUMBLE_CRASH); break;
      case 'nitro': push(e.carId, RUMBLE_NITRO); break;
      default: break;
    }
  }
  for (const sc of scrapes) {
    const strength = RUMBLE_SCRAPE.min + RUMBLE_SCRAPE.range * clamp01(sc.strength);
    for (const id of [sc.a, sc.b]) {
      const car = state.cars.find((c) => c.id === id);
      if (car && car.seat >= 0) out.push({ seat: car.seat, strength, ms: RUMBLE_SCRAPE.ms });
    }
  }
  for (const car of state.cars) {
    if (car.seat < 0) continue;
    const last = mem.grassTick[car.seat];
    // Tick menor que o último pulso = corrida nova: esquece o intervalo da anterior.
    if (last !== undefined && last > state.tick) mem.grassTick[car.seat] = undefined;
    if (state.phase !== 'racing' || car.skidTicks <= 0 || car.speed < RUMBLE_GRASS.minSpeed) continue;
    const prev = mem.grassTick[car.seat];
    if (prev !== undefined && state.tick - prev < RUMBLE_GRASS.everyTicks) continue;
    mem.grassTick[car.seat] = state.tick;
    out.push({ seat: car.seat, strength: RUMBLE_GRASS.strength, ms: RUMBLE_GRASS.ms });
  }
  return out;
}
