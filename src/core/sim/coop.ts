// Mecânicas de equipe: vácuo, empurrão e elástico entre companheiros.
import {
  CAR_HALF_WIDTH, CAR_LENGTH, CATCHUP_DISTANCE, COLLISION_SLOP_X, DRAFT_DISTANCE, DRAFT_LATERAL, NITRO_GAIN_SCRAPE, NITRO_LOCK_SCRAPE_TICKS, TEAM_DRAFT_DISTANCE,
  TEAM_DRAFT_LATERAL, TOW_COOLDOWN_TICKS, TOW_DISTANCE, TOW_GIVER_MIN_FACTOR, TOW_LATERAL, TOW_MIN_SPEED_FACTOR, TOW_SPEED_FACTOR,
} from '../constants';
import { applyEscortPush, isVip } from '../modes';
import type { CarState, RaceState, Track } from '../types';
import { wrappedDelta } from './collisions';
import type { CarModifiers } from './physics';
import { carStats, grantNitro } from './stats';

export function computeModifiers(state: RaceState, track: Track, car: CarState): CarModifiers {
  const mods: CarModifiers = { draft: false, teamDraft: false, catchup: false };
  if (state.phase === 'countdown') return mods;
  for (const o of state.cars) {
    if (o === car) continue;
    const d = wrappedDelta(o.z, car.z, track.length);
    if (d <= 0 || o.speed <= car.speed * 0.6) continue;
    // Companheiro humano na frente: alcance maior (vácuo de equipe); qualquer outro carro: o vácuo comum.
    const mate = state.config.assists.teamDraft && o.teamId === car.teamId && o.seat >= 0 && car.seat >= 0;
    const reach = mate ? TEAM_DRAFT_DISTANCE : DRAFT_DISTANCE;
    const lateral = mate ? TEAM_DRAFT_LATERAL : DRAFT_LATERAL;
    if (d < reach && Math.abs(o.x - car.x) < lateral) {
      mods.draft = true;
      if (mate) mods.teamDraft = true;
    }
  }
  if (state.config.assists.catchup && car.seat >= 0 && !car.finished) {
    let mates = 0; let behindAll = true;
    for (const o of state.cars) {
      if (o === car || o.teamId !== car.teamId || o.seat < 0) continue;
      mates++;
      if (o.progress - car.progress < CATCHUP_DISTANCE) behindAll = false;
    }
    mods.catchup = mates > 0 && behindAll;
  }
  return mods;
}

/** Entre os centros de dois carros que o `sideContact` (collisions.ts) acabou de separar: 2 × CAR_HALF_WIDTH + a folga, exatos. */
const SCRAPE_GAP = CAR_HALF_WIDTH * 2 + COLLISION_SLOP_X;
/** Sobra aceita na assinatura (o empurrão de outro par no mesmo tick tira o encaixe exato; a L5 mediu 96,7% de acordo). */
const SCRAPE_TOLERANCE = COLLISION_SLOP_X / 20;

/**
 * O raspão sem bater (N1): depois de `resolveCarCollisions`, dois carros com as caixas sobrepostas em z e separados em x pela
 * distância exata que o `sideContact` deixa são um contato de lado (a batida em fila separa em z, nunca casa). Os dois, se
 * nenhum está se recuperando de uma batida (`collisionCooldown`) e cada um fora do anti-farm (`gainLock`) e correndo, ganham
 * NITRO_GAIN_SCRAPE e o `gainLock` do raspão. É a mesma assinatura que a L5 usa para a faísca e a vibração (race-feel.ts:
 * observeScrapes), lida aqui para o ganho nascer no núcleo sem mexer no collisions.ts.
 */
export function applyScrapes(state: RaceState, track: Track): void {
  if (state.phase !== 'racing') return;
  const cars = state.cars;
  for (let i = 0; i < cars.length; i++) {
    const p = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const q = cars[j];
      if (Math.abs(Math.abs(q.x - p.x) - SCRAPE_GAP) > SCRAPE_TOLERANCE) continue;
      if (Math.abs(wrappedDelta(p.z, q.z, track.length)) >= CAR_LENGTH) continue;
      if (p.collisionCooldown > 0 || q.collisionCooldown > 0) continue;
      for (const c of [p, q]) {
        if (c.finished || c.gainLock > 0) continue;
        grantNitro(state, c, 'scrape', NITRO_GAIN_SCRAPE);
        c.gainLock = NITRO_LOCK_SCRAPE_TICKS;
      }
    }
  }
}

/**
 * Companheiro que passa perto de um parado dá um empurrão. Na escolta o VIP também é socorrido
 * quando para, e a equipe o empurra por trás mesmo andando (modes.ts: applyEscortPush).
 */
export function applyTow(state: RaceState, track: Track): void {
  applyEscortPush(state, track);
  if (!state.config.assists.tow || state.phase !== 'racing') return;
  for (const car of state.cars) {
    if (car.towCooldown > 0) { car.towCooldown--; continue; }
    // No box o limitador segura o carro a 25%: não é caso de socorro.
    if ((car.seat < 0 && !isVip(state, car)) || car.finished || car.inPit) continue;
    const def = carStats(car);
    if (car.speed > def.topSpeed * TOW_MIN_SPEED_FACTOR) continue;
    for (const mate of state.cars) {
      if (mate === car || mate.seat < 0 || mate.teamId !== car.teamId) continue;
      if (mate.speed < carStats(mate).topSpeed * TOW_GIVER_MIN_FACTOR) continue;
      const d = Math.abs(wrappedDelta(mate.z, car.z, track.length));
      if (d < TOW_DISTANCE && Math.abs(mate.x - car.x) < TOW_LATERAL) {
        car.speed = Math.max(car.speed, mate.speed * TOW_SPEED_FACTOR);
        car.towCooldown = TOW_COOLDOWN_TICKS;
        state.events.push({ type: 'tow', carId: car.id, byId: mate.id });
        break;
      }
    }
  }
}
