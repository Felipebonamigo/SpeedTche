// A "impressão legada" de uma corrida: o `hashRace` de ANTES da derrapagem (M1), sem os campos novos. Serve de prova
// de que o carro que não derrapa anda bit a bit como andava: o `hashRace` atual mudou (lê os 4 campos novos), mas esta
// conta, com a fórmula antiga, tem de dar o mesmo valor que deu em 2ce0f48 (docs/ondas/M/M1.md, §6 #14 e §7).
import { hashString } from '../src/core/rng';
import { stepRace } from '../src/core/sim/race';
import { scenarioInputs, startScenario, type SimScenario } from '../scripts/sim-scenarios';
import type { RaceState } from '../src/core/types';

/** O `hashRace` de 2ce0f48, palavra por palavra. */
export function legacyHash(state: RaceState): number {
  const parts: string[] = [String(state.tick), state.phase, String(state.rng.s)];
  for (const c of state.cars) parts.push(`${c.id}:${c.z.toFixed(3)}:${c.x.toFixed(4)}:${c.speed.toFixed(3)}:${c.lap}:${c.fuel.toFixed(5)}:${c.nitroLeft}`);
  return hashString(parts.join('|'));
}

/** Roda o cenário e dobra o hash legado de cada tick num FNV-1a de 32 bits (8 hex). */
export function legacyTrace(s: SimScenario, ticks: number): string {
  const { state, track } = startScenario(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < ticks && state.phase !== 'finished'; i++) {
    stepRace(state, track, scenarioInputs(state, track, s));
    const text = String(legacyHash(state));
    for (let k = 0; k < text.length; k++) { h ^= text.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0; }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Cenários só de humanos (sem IA): o que não derrapa não pode ter mudado. */
export const GUARD_SCENARIOS: readonly SimScenario[] = [
  { name: 'guarda-contra-relogio', trackId: 'passo_alpino', humans: 1, timeTrial: true, seed: 707 },
  {
    name: 'guarda-3-humanos-manual', trackId: 'serra_do_mar', humans: 3, timeTrial: true, manualGear: true, versus: true,
    assistLevels: ['none', 'brake', 'none'], seed: 909,
  },
];
export const GUARD_TICKS = 4000;
