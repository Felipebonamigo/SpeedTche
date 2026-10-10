// Física de um carro por tick: marcha, aceleração, volante, força centrífuga, grama, box,
// combustível e nitro. Pseudo-3D clássico: a pista é uma linha (z) e o carro se desloca em x.
import {
  CATCHUP_TOP_MULT, CENTRIFUGAL, DRAFT_ACCEL_MULT, DRAFT_TOP_MULT, DRIFT_BOOST_ACCEL_MULT, DRIFT_BOOST_SPEED_MULT,
  DRIFT_BOOST_TICKS, DRIFT_CENTRIFUGAL_MULT, DRIFT_CHARGE_MIN_CURVE, DRIFT_DRAG_PER_SECOND, DRIFT_ENTRY_STEER, DRIFT_KEEP_SPEED_FACTOR,
  DRIFT_LEVEL_TICKS, DRIFT_MIN_SPEED_FACTOR, DRIFT_PULL, DT, FUEL_EMPTY_SPEED_FACTOR, GEAR_ACCEL,
  GEAR_COUNT, GEAR_TOP, NITRO_ACCEL_MULT, NITRO_DURATION_TICKS, NITRO_SPEED_MULT, OFFROAD_DECEL_FACTOR,
  OFFROAD_LIMIT_FACTOR, OFFROAD_X, PIT_REFUEL_PER_SECOND, PIT_SPEED_LIMIT_FACTOR, PIT_X, TEAM_DRAFT_TOP_MULT,
} from '../constants';
import { segmentAt } from '../track/builder';
import type { CarState, CarStats, PlayerInput, RaceState, SimEvent, Track } from '../types';
import { fuelLowLevel, pitStillAhead } from './fuel';
import { carStats } from './stats';

/** Modificadores calculados fora da física (vácuo, elástico) e aplicados aqui. */
export interface CarModifiers {
  draft: boolean;
  teamDraft: boolean;
  catchup: boolean;
}

export const NO_MODIFIERS: Readonly<CarModifiers> = Object.freeze({ draft: false, teamDraft: false, catchup: false });

/** Só o que as fórmulas de curva usam: aceita um CarDef ou os CarStats da corrida. */
type Handling = Pick<CarStats, 'handling'>;

/** Taxa de giro do volante por segundo em velocidade máxima. */
export function steerRate(def: Handling): number { return 2.2 * (0.75 + 0.35 * def.handling); }
/** Quanto a curva empurra para fora, por segundo, em velocidade máxima e curva 1. */
export function centrifugalRate(def: Handling): number { return 2.2 * CENTRIFUGAL * (1.2 - 0.4 * def.handling); }

/**
 * Maior fração da velocidade máxima que um carro segura numa curva de força `curve` sem ir
 * para a grama (o volante no máximo compensa 85% do empurrão). Base da IA e do balanceamento.
 * Com `drift`, o limite de quem derrapa: a centrífuga vale DRIFT_CENTRIFUGAL_MULT (×0,55), então segura quase o dobro.
 */
export function holdableSpeedFraction(def: Handling, curve: number, drift = false): number {
  const c = Math.abs(curve);
  if (c < 1e-6) return 1;
  if (drift) return Math.min(1, (0.85 * steerRate(def)) / (centrifugalRate(def) * DRIFT_CENTRIFUGAL_MULT * c));
  return Math.min(1, (0.85 * steerRate(def)) / (centrifugalRate(def) * c));
}

/** Nível da derrapagem (0..3: nenhum, azul, laranja, roxa) para uma carga em ticks (DRIFT_LEVEL_TICKS). */
export function driftLevel(charge: number): number {
  let level = 0;
  for (let i = 0; i < DRIFT_LEVEL_TICKS.length; i++) if (charge >= DRIFT_LEVEL_TICKS[i]) level = i + 1;
  return level;
}

/** Velocidade máxima efetiva neste tick, com todos os multiplicadores. */
export function effectiveTopSpeed(car: CarState, def: Pick<CarStats, 'topSpeed'>, state: RaceState, mods: CarModifiers): number {
  let top = def.topSpeed;
  if (drivesManual(state, car)) top *= GEAR_TOP[car.gear];
  // O impulso da derrapagem não soma com o nitro: vale o maior (o nitro).
  if (car.nitroTicks > 0) top *= NITRO_SPEED_MULT; else if (car.driftBoostTicks > 0) top *= DRIFT_BOOST_SPEED_MULT;
  if (mods.teamDraft) top *= TEAM_DRAFT_TOP_MULT; else if (mods.draft) top *= DRAFT_TOP_MULT;
  if (mods.catchup) top *= CATCHUP_TOP_MULT;
  if (car.fuel <= 0 && !state.config.timeTrial) top *= FUEL_EMPTY_SPEED_FACTOR;
  if (car.finished) top *= 0.6;
  if (car.inPit) top = Math.min(top, def.topSpeed * PIT_SPEED_LIMIT_FACTOR);
  return top;
}

/**
 * Câmbio manual só para humano no volante. A IA que assume o carro (queda no online) e o piloto automático
 * de quem já terminou (`car.ai` preenchido) usam o automático — a IA não pede marcha.
 */
function drivesManual(state: RaceState, car: CarState): boolean {
  return state.config.manualGear && car.seat >= 0 && !car.ai;
}

function autoGear(speedFrac: number): number {
  for (let g = 0; g < GEAR_COUNT - 1; g++) if (speedFrac < GEAR_TOP[g] * 0.98) return g;
  return GEAR_COUNT - 1;
}

function endDrift(car: CarState): void {
  car.driftDir = 0; car.driftTicks = 0; car.driftCharge = 0;
}

/**
 * A derrapagem de um tick (docs/ondas/M/M1.md, §4.2): entrar, manter, carregar e soltar. Chamada com o carro ainda na
 * posição e na velocidade do começo do tick, depois do nitro e antes da velocidade máxima. Bloqueios (box, grama, batida,
 * velocidade baixa, acabou, contagem) cancelam SEM impulso; soltar o botão com carga dá o impulso do nível.
 */
function stepDrift(car: CarState, def: CarStats, curve: number, input: PlayerInput, racing: boolean, events: SimEvent[]): void {
  const holding = input.drift === true;
  const steer = Math.max(-1, Math.min(1, input.steer));
  const minSpeed = def.topSpeed * (car.driftDir !== 0 ? DRIFT_KEEP_SPEED_FACTOR : DRIFT_MIN_SPEED_FACTOR);
  // A faixa do box (x entre 1,25 e 1,95) fica toda além de OFFROAD_X: a checagem da grama já a cobre; car.inPit é o limitador do box.
  const blocked = !racing || car.finished || car.inPit || Math.abs(car.x) > OFFROAD_X || car.collisionCooldown > 0 || car.speed < minSpeed;
  if (car.driftDir !== 0) {
    if (blocked) {
      endDrift(car);
    } else if (!holding) {
      const level = driftLevel(car.driftCharge);
      if (level > 0) {
        car.driftBoostTicks = Math.max(car.driftBoostTicks, DRIFT_BOOST_TICKS[level - 1]);
        events.push({ type: 'drift_boost', carId: car.id, level });
      }
      endDrift(car);
    }
  } else if (holding && !blocked && Math.abs(steer) >= DRIFT_ENTRY_STEER) {
    car.driftDir = steer > 0 ? 1 : -1;
    car.driftTicks = 0;
    car.driftCharge = 0;
  }
  if (car.driftDir === 0) return;
  car.driftTicks++;
  // Carga: só em curva forte para o lado da derrapagem; satura no terceiro nível.
  if (car.driftCharge < DRIFT_LEVEL_TICKS[DRIFT_LEVEL_TICKS.length - 1] && curve * car.driftDir > 0 && Math.abs(curve) >= DRIFT_CHARGE_MIN_CURVE) {
    const before = driftLevel(car.driftCharge);
    car.driftCharge++;
    const after = driftLevel(car.driftCharge);
    if (after > before) events.push({ type: 'drift_charge', carId: car.id, level: after });
  }
}

/** Aplica um tick de física ao carro. `input` já é o do humano ou o decidido pela IA. */
export function stepCarPhysics(state: RaceState, track: Track, car: CarState, input: PlayerInput, mods: CarModifiers): void {
  const def = carStats(car);
  const racing = state.phase !== 'countdown';
  const seg = segmentAt(track, car.z);
  const events = state.events;

  // Marcha
  if (drivesManual(state, car)) {
    if (input.gearUp && car.gear < GEAR_COUNT - 1) { car.gear++; events.push({ type: 'gear', carId: car.id, gear: car.gear }); }
    if (input.gearDown && car.gear > 0) { car.gear--; events.push({ type: 'gear', carId: car.id, gear: car.gear }); }
  } else {
    car.gear = autoGear(car.speed / def.topSpeed);
  }

  // Nitro (borda de botão)
  if (input.nitro && racing && !car.finished) {
    const shared = state.config.assists.sharedNitro && car.seat >= 0;
    const available = shared ? (state.teamNitro[car.teamId] ?? 0) : car.nitroLeft;
    if (car.nitroTicks === 0 && available > 0) {
      if (shared) state.teamNitro[car.teamId] = available - 1; else car.nitroLeft--;
      car.nitroTicks = NITRO_DURATION_TICKS;
      events.push({ type: 'nitro', carId: car.id });
    } else if (car.seat >= 0) {
      events.push({ type: 'nitro_denied', carId: car.id });
    }
  }
  if (car.nitroTicks > 0) car.nitroTicks--;
  // O relógio do impulso da derrapagem desce ANTES da decisão do tick: um impulso de N ticks vale exatamente N ticks.
  if (car.driftBoostTicks > 0) car.driftBoostTicks--;

  // Box: faixa à direita do trecho de box. Entrar acima do limite corta a velocidade (limitador).
  const inPitLane = seg.pit && car.x > 1.25 && car.x < 1.95;

  stepDrift(car, def, seg.curve, input, racing, events);

  const top = effectiveTopSpeed(car, def, state, mods);
  const speedFrac = Math.min(1.2, car.speed / def.topSpeed);

  if (inPitLane && !car.inPit && racing) { car.inPit = true; events.push({ type: 'pit_enter', carId: car.id }); }
  if (car.inPit && !inPitLane) { car.inPit = false; events.push({ type: 'pit_exit', carId: car.id }); }
  if (car.inPit) {
    car.fuel = Math.min(1, car.fuel + PIT_REFUEL_PER_SECOND * DT);
  }

  // Aceleração e freio
  if (racing) {
    if (input.brake) {
      car.speed -= def.brake * DT;
    } else if (input.throttle && car.speed < top) {
      let accel = def.accel * GEAR_ACCEL[car.gear];
      if (car.nitroTicks > 0) accel *= NITRO_ACCEL_MULT; else if (car.driftBoostTicks > 0) accel *= DRIFT_BOOST_ACCEL_MULT;
      if (mods.draft || mods.teamDraft) accel *= DRAFT_ACCEL_MULT;
      car.speed += accel * DT;
    } else if (!input.throttle) {
      car.speed -= def.accel * 0.45 * DT; // freio-motor
    }
    if (car.speed > top) car.speed = Math.max(top, car.speed - def.accel * 1.6 * DT);
  } else {
    car.speed = 0;
  }

  // Grama: derrapa e perde velocidade; o box não conta como grama.
  const offroad = Math.abs(car.x) > OFFROAD_X && !inPitLane;
  if (offroad && racing) {
    const limit = def.topSpeed * OFFROAD_LIMIT_FACTOR;
    if (car.speed > limit) car.speed = Math.max(limit, car.speed - def.topSpeed * OFFROAD_DECEL_FACTOR * DT);
    if (car.skidTicks === 0) events.push({ type: 'offroad', carId: car.id, entering: true });
    car.skidTicks = 6;
  } else if (car.skidTicks > 0) {
    car.skidTicks--;
    if (car.skidTicks === 0) events.push({ type: 'offroad', carId: car.id, entering: false });
  }
  if (car.speed < 0) car.speed = 0;
  // Derrapando, o carro perde um pouco de velocidade por segundo (DRIFT_DRAG_PER_SECOND).
  if (car.driftDir !== 0) car.speed = Math.max(0, car.speed - def.topSpeed * DRIFT_DRAG_PER_SECOND * DT);

  // Volante e força centrífuga
  const sf = Math.min(1, car.speed / def.topSpeed);
  const steer = Math.max(-1, Math.min(1, input.steer));
  // Em baixa velocidade o volante ainda responde (25%), senão um carro parado atrás de outro
  // nunca sairia de trás dele. Parado de vez, não vira.
  const steerSf = car.speed > 0 ? Math.max(0.25, sf) : 0;
  // Derrapando: a centrífuga cai a ×0,55 e o volante puxa para dentro (a derrapagem soma DRIFT_PULL ao volante, no lado dela).
  // Fora da derrapagem as duas contas são as de sempre, bit a bit.
  const drifting = car.driftDir !== 0;
  const centrifugal = drifting ? centrifugalRate(def) * DRIFT_CENTRIFUGAL_MULT : centrifugalRate(def);
  const wheel = drifting ? Math.max(-1, Math.min(1, steer + car.driftDir * DRIFT_PULL)) : steer;
  car.x += DT * steerRate(def) * steerSf * wheel;
  car.x -= DT * centrifugal * sf * sf * seg.curve;
  if (car.x > 3.2) car.x = 3.2;
  if (car.x < -3.2) car.x = -3.2;
  car.steerPose = steer > 0.3 ? 1 : steer < -0.3 ? -1 : 0;

  // Combustível
  if (racing && !state.config.timeTrial && !car.inPit) {
    const before = car.fuel;
    const burn = def.fuelPerUnit * car.speed * DT * (input.throttle ? 1 : 0.35) * (car.nitroTicks > 0 ? 1.6 : 1) * (0.7 + 0.3 * speedFrac);
    car.fuel = Math.max(0, car.fuel - burn);
    // Aviso proporcional à volta, e só enquanto ainda há box antes da chegada (sim/fuel.ts).
    const warnAt = fuelLowLevel(def.fuelPerUnit, track.length);
    if (before > warnAt && car.fuel <= warnAt && pitStillAhead(state, car)) events.push({ type: 'fuel_low', carId: car.id });
    if (before > 0 && car.fuel <= 0) events.push({ type: 'fuel_empty', carId: car.id });
  }

  // Avanço ao longo da pista (a volta é contada em positions.ts)
  car.z += car.speed * DT;
  if (car.z >= track.length) car.z -= track.length;
}

/** `x` do centro do box, para a IA e para o renderizador. */
export const PIT_LANE_X = PIT_X;
