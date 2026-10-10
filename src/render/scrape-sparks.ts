// Faíscas do raspão de lado: o sinal vem de `observeScrapes` (race-feel.ts); aqui só a geometria da rajada. Puro, sem three.
import type { ScrapeCue } from '../game/race-feel';

/** Faíscas de um raspão com strength 1 (o fraco solta menos, nunca zero). */
export const SCRAPE_SPARKS = 14;

export interface ScrapeCar { id: number; z: number; x: number; speed: number }
export interface ScrapeSpark { x: number; y: number; z: number; vz: number; vx: number; vy: number; life: number }

/** Rajada no vão entre os dois carros, jogada para trás do mais lento. `rnd` em [0,1). */
export function scrapeSparks(cue: ScrapeCue, a: ScrapeCar, b: ScrapeCar, rnd: () => number, reduceEffects: boolean): ScrapeSpark[] {
  if (reduceEffects) return [];
  const n = Math.max(2, Math.round(SCRAPE_SPARKS * cue.strength));
  const x = (a.x + b.x) / 2;
  const z = (a.z + b.z) / 2;
  const slow = Math.min(a.speed, b.speed);
  const out: ScrapeSpark[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: x + (rnd() - 0.5) * 0.04,
      y: 0.15 + rnd() * 0.35,
      z: z + (rnd() - 0.5) * 60,
      vz: slow - 300 - rnd() * 700,
      vx: (rnd() - 0.5) * 0.8 * cue.sideOfA,
      vy: 0.8 + rnd() * 2.6,
      life: 0.18 + rnd() * 0.22,
    });
  }
  return out;
}
