// Piloto de IA: decide o PlayerInput de um carro a cada tick a partir do que vê na pista.
import {
  AI_BRAKE_CURVE, AI_DRIFT_CORNER_GAIN, AI_DRIFT_LIMIT_MIN, AI_DRIFT_MIN_SEGMENTS, AI_DRIFT_RELEASE_SEGMENTS, AI_PASS_CLEARANCE,
  AI_PASS_LANE_MAX, AI_SIDE_LOOK, CAR_HALF_WIDTH, CAR_LENGTH, CATCHUP_DISTANCE, DRIFT_CENTRIFUGAL_MULT, DRIFT_ENTRY_STEER,
  DRIFT_MIN_SPEED_FACTOR, DRIFT_PULL, MISTAKE_BRAKE_LATE, MISTAKE_CORNER_SPEED, MISTAKE_WIDE_SEGMENTS, MISTAKE_WIDE_X, RIVAL_SKILL_BONUS,
  SEGMENT_LENGTH,
} from '../constants';
import { nextFloat, nextRange } from '../rng';
import { maxCurveAhead, segmentAt } from '../track/builder';
import type { AiBrain, CarState, CarStats, Difficulty, Personality, PlayerInput, RaceState, Track } from '../types';
import { wrappedDelta } from './collisions';
import { distanceToFinish, fuelTight, fuelToSkipPit, markFuel, measuredBurn, PIT_LOOKAHEAD, skipPitBurn } from './fuel';
import { blockLane, curveZoneStart, missesBraking, tuningOf } from './personality';
import { centrifugalRate, holdableSpeedFraction, PIT_LANE_X, steerRate } from './physics';
import { carStats, nitroCharges } from './stats';

export { launchChance } from './stats';

export const DIFFICULTY_SPEED: Record<Difficulty, number> = { amador: 0.86, profissional: 0.94, campeao: 1.0 };
export const DIFFICULTY_SKILL: Record<Difficulty, [number, number]> = {
  amador: [0.8, 0.92], profissional: [0.88, 0.98], campeao: [0.94, 1.03],
};

/** As dificuldades em ordem: o `aiPace` anda nesta escada, em degraus. */
const DIFFICULTY_STEPS: readonly Difficulty[] = ['amador', 'profissional', 'campeao'];

/** Os dois degraus vizinhos de dificuldade + ritmo e a fração entre eles (preso entre amador e campeão). */
function paceStep(difficulty: Difficulty, aiPace: number): { lo: Difficulty; hi: Difficulty; t: number } {
  const last = DIFFICULTY_STEPS.length - 1;
  const s = Math.max(0, Math.min(last, DIFFICULTY_STEPS.indexOf(difficulty) + aiPace));
  const i = Math.min(last - 1, Math.floor(s));
  return { lo: DIFFICULTY_STEPS[i], hi: DIFFICULTY_STEPS[i + 1], t: s - i };
}

/** DIFFICULTY_SPEED com o ritmo (`RaceConfig.aiPace`, em degraus); 0 ou ausente devolve a tabela sem conta nenhuma. */
export function pacedSpeed(difficulty: Difficulty, aiPace = 0): number {
  if (!aiPace) return DIFFICULTY_SPEED[difficulty];
  const { lo, hi, t } = paceStep(difficulty, aiPace);
  return DIFFICULTY_SPEED[lo] + (DIFFICULTY_SPEED[hi] - DIFFICULTY_SPEED[lo]) * t;
}

/** DIFFICULTY_SKILL com o ritmo; 0 ou ausente devolve a tabela sem conta nenhuma. */
export function pacedSkill(difficulty: Difficulty, aiPace = 0): readonly [number, number] {
  if (!aiPace) return DIFFICULTY_SKILL[difficulty];
  const { lo, hi, t } = paceStep(difficulty, aiPace);
  const a = DIFFICULTY_SKILL[lo]; const b = DIFFICULTY_SKILL[hi];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Quem é o piloto: personalidade fixa (data/drivers.ts) e se é o rival principal da copa. */
export interface DriverProfile {
  personality: Personality | null;
  rival: boolean;
}

export function createBrain(state: RaceState, difficulty: Difficulty, slot: number, profile?: DriverProfile): AiBrain {
  const [lo, hi] = pacedSkill(difficulty, state.config.aiPace);
  // Os quatro sorteios na mesma ordem de sempre: o perfil não muda o acaso dos outros pilotos.
  const brain: AiBrain = {
    skill: nextRange(state.rng, lo, hi),
    laneX: nextRange(state.rng, -0.6, 0.6),
    laneUntil: 0,
    lookahead: 20 + Math.floor(nextFloat(state.rng) * 15) + slot % 3,
    aggression: nextFloat(state.rng),
  };
  if (profile?.personality) brain.personality = profile.personality;
  if (profile?.rival) brain.skill += RIVAL_SKILL_BONUS;
  return brain;
}

/** Distância (em unidades, positiva = à frente) até o carro mais próximo na mesma faixa. */
export function nearestAhead(state: RaceState, track: Track, car: CarState, lateral: number, range: number): CarState | null {
  let best: CarState | null = null;
  let bestD = range;
  for (const o of state.cars) {
    if (o === car) continue;
    const d = wrappedDelta(o.z, car.z, track.length);
    if (d <= 0 || d >= bestD) continue;
    if (Math.abs(o.x - car.x) > lateral) continue;
    best = o; bestD = d;
  }
  return best;
}

function bestHumanProgress(state: RaceState): number {
  // Escolta (modes.ts): o elástico da IA mira o VIP — é ele que a equipe precisa levar ao pódio.
  const vip = state.party && state.party.vipId >= 0 ? state.cars[state.party.vipId] : undefined;
  if (vip) return vip.progress;
  let best = -Infinity;
  for (const c of state.cars) if (c.seat >= 0 && c.progress > best) best = c.progress;
  return best;
}

/** O humano mais atrás (o VIP na escolta): o reforço do elástico só vale para a IA que ficou atrás dele. */
function lastHumanProgress(state: RaceState): number {
  const vip = state.party && state.party.vipId >= 0 ? state.cars[state.party.vipId] : undefined;
  if (vip) return vip.progress;
  let last = Infinity;
  for (const c of state.cars) if (c.seat >= 0 && c.progress < last) last = c.progress;
  return last;
}

/**
 * Quantos segmentos seguidos, a partir de `z`, são curva forte (|curva| ≥ AI_BRAKE_CURVE) do MESMO lado do segmento de `z`;
 * 0 se o de `z` não for forte. Conta até `cap` (quem pergunta só quer saber se passa de um tamanho).
 */
export function strongRun(track: Track, z: number, cap: number): number {
  const first = segmentAt(track, z).curve;
  if (Math.abs(first) < AI_BRAKE_CURVE) return 0;
  const dir = first > 0 ? 1 : -1;
  let n = 1;
  while (n < cap) {
    const c = segmentAt(track, z + n * SEGMENT_LENGTH).curve;
    if (Math.abs(c) < AI_BRAKE_CURVE || (c > 0 ? 1 : -1) !== dir) break;
    n++;
  }
  return n;
}

/**
 * Fração da velocidade máxima que a IA (ou a direção assistida) usa como limite de uma curva forte quando conta derrapar
 * nela: do limite sem derrapar até o limite com derrapagem, na proporção `gain` (AI_DRIFT_CORNER_GAIN). `gain` 0 é o limite
 * de sempre. Se o resultado não deixa velocidade para entrar na derrapagem (AI_DRIFT_LIMIT_MIN), fica o limite de sempre.
 */
export function cornerHoldable(def: CarStats, curve: number, gain: number): number {
  const plain = holdableSpeedFraction(def, curve);
  if (gain <= 0) return plain;
  const drifting = plain + (holdableSpeedFraction(def, curve, true) - plain) * gain;
  return drifting >= AI_DRIFT_LIMIT_MIN ? drifting : plain;
}

/**
 * Ponto de frenagem: a maior fração da velocidade máxima (até `cap`) com que dá para chegar a cada
 * curva forte dos próximos `lookahead` segmentos freando a partir de agora. `grip` escala o limite
 * de cada curva (holdableSpeedFraction). Usado pela direção assistida (sim/assist.ts); é a conta da IA sem
 * personalidade — o aiInput repete o laço com o freio tardio e os erros de frenagem de cada piloto.
 * `driftGain` > 0 conta com a derrapagem (cornerHoldable); com `driftMinRun` > 0 só nos trechos fortes de pelo menos esse tamanho.
 */
export function brakingTarget(track: Track, z: number, def: CarStats, grip: number, lookahead: number, cap: number, driftGain = 0, driftMinRun = 0): number {
  let target = cap;
  const brakeDecel = def.brake * 0.8 + def.accel * 0.45;
  for (let i = 0; i < lookahead; i++) {
    const seg = segmentAt(track, z + i * SEGMENT_LENGTH);
    if (Math.abs(seg.curve) < AI_BRAKE_CURVE) continue;
    const gain = driftGain > 0 && (driftMinRun <= 0 || strongRun(track, z + i * SEGMENT_LENGTH, driftMinRun) >= driftMinRun) ? driftGain : 0;
    const limit = (gain > 0 ? cornerHoldable(def, seg.curve, gain) : holdableSpeedFraction(def, seg.curve)) * grip * def.topSpeed;
    const allowed = Math.sqrt(limit * limit + 2 * brakeDecel * i * SEGMENT_LENGTH) / def.topSpeed;
    if (allowed < target) target = allowed;
  }
  return target;
}

/**
 * Contra-esterço que anula o empurrão da curva `curve` na fração de velocidade `sf` (0..1). Com `driftDir` ≠ 0 (o carro
 * derrapando): a centrífuga é DRIFT_CENTRIFUGAL_MULT dela, e o puxão da derrapagem para dentro (DRIFT_PULL) já ajuda.
 */
export function counterSteer(def: CarStats, sf: number, curve: number, driftDir = 0): number {
  const plain = sf > 0.05 ? (centrifugalRate(def) * sf * curve) / steerRate(def) : 0;
  return driftDir === 0 ? plain : DRIFT_CENTRIFUGAL_MULT * plain - driftDir * DRIFT_PULL;
}

/**
 * A IA (ou a direção assistida) quer o botão de derrapar apertado neste tick? Entra numa curva forte (≥ AI_BRAKE_CURVE) cujo
 * trecho, do mesmo lado, tem pelo menos AI_DRIFT_MIN_SEGMENTS segmentos, com a velocidade de entrada; derrapando, mantém
 * enquanto a curva segue para o mesmo lado e faltam AI_DRIFT_RELEASE_SEGMENTS segmentos ou mais — soltar aí é o impulso na saída.
 * Quem chama decide se pode (box, erro de frenagem, carro acabado).
 */
export function wantsDrift(track: Track, car: CarState, def: CarStats): boolean {
  const curve = segmentAt(track, car.z).curve;
  if (car.driftDir !== 0) return curve * car.driftDir > 0 && strongRun(track, car.z, AI_DRIFT_RELEASE_SEGMENTS) >= AI_DRIFT_RELEASE_SEGMENTS;
  return Math.abs(curve) >= AI_BRAKE_CURVE && car.speed >= def.topSpeed * DRIFT_MIN_SPEED_FACTOR
    && strongRun(track, car.z, AI_DRIFT_MIN_SEGMENTS) >= AI_DRIFT_MIN_SEGMENTS;
}

/**
 * O carro do lado que está no caminho de `car` até a faixa `laneTarget` — o corpo dele cruza a faixa que o carro
 * varreria indo para lá —, o mais perto de lado; null com o caminho livre. "Do lado" é até AI_SIDE_LOOK à frente e
 * até `behind` atrás. Indo para o box, `behind` é só o encosto (CAR_LENGTH): quem entrava na faixa do box logo atrás,
 * na mesma velocidade, prendia o outro do lado de fora até o fim dela, e ele secava (tests/ai.test.ts, Autobahn).
 */
export function sideBlocker(state: RaceState, track: Track, car: CarState, laneTarget: number, behind = AI_SIDE_LOOK): CarState | null {
  const dir = laneTarget > car.x ? 1 : -1;
  const reach = Math.abs(laneTarget - car.x) + CAR_HALF_WIDTH * 2;
  let best: CarState | null = null;
  let bestDx = reach;
  for (const o of state.cars) {
    if (o === car) continue;
    const dx = (o.x - car.x) * dir;
    if (dx <= 0 || dx >= bestDx) continue;
    const dz = wrappedDelta(o.z, car.z, track.length);
    if (dz >= AI_SIDE_LOOK || dz <= -behind) continue;
    best = o; bestDx = dx;
  }
  return best;
}

/** Faixa para passar por `aheadX` pela esquerda ou pela direita, `offset` ao lado dele, dentro de ±AI_PASS_LANE_MAX. */
function passLane(aheadX: number, left: boolean, offset: number): number {
  return Math.max(-AI_PASS_LANE_MAX, Math.min(AI_PASS_LANE_MAX, aheadX + (left ? -offset : offset)));
}

export function aiInput(state: RaceState, track: Track, car: CarState): PlayerInput {
  const brain = car.ai!;
  const tune = tuningOf(brain);
  const def = carStats(car);
  const seg = segmentAt(track, car.z);
  const speedFrac = car.speed / def.topSpeed;
  const difficulty = state.config.difficulty;
  const input: PlayerInput = { steer: 0, throttle: true, brake: false, nitro: false, gearUp: false, gearDown: false };

  if (state.phase === 'countdown') return input;

  // ── Velocidade-alvo: na reta, o que a habilidade permite; para cada curva à frente, a
  // velocidade que dá para chegar nela freando a partir de agora (ponto de frenagem).
  const lookahead = brain.lookahead + Math.floor(speedFrac * 30);
  // Perto do box (a 30 segmentos ou menos dele) ou nele, a IA não derrapa: o limitador e a faixa do box não combinam com a pose.
  const pitAhead = seg.pit || segmentAt(track, car.z + PIT_LOOKAHEAD).pit;
  const driftOk = !car.finished && !car.inPit && !pitAhead;
  const straightLimit = brain.skill * (car.seat < 0 ? pacedSpeed(difficulty, state.config.aiPace) : DIFFICULTY_SPEED[difficulty]);
  let target = straightLimit;
  // Personalidade: o agressivo supõe frear mais forte (freia mais tarde) e entrar mais rápido; o
  // errático (e, menos, o agressivo) às vezes erra o ponto de frenagem de um trecho e vai à grama.
  const brakeDecel = (def.brake * 0.8 + def.accel * 0.45) * tune.brakeLate;
  let zone = -1; let miss = false;
  /** Segmentos já andados dentro de um trecho de curva em que errou a frenagem (-1 = não está num). */
  let missedFor = -1;
  /** O trecho forte (do mesmo lado) em que o laço está merece derrapagem: tamanho suficiente (ou já derrapando nele) e pode. */
  let runDir = 0; let runDrifts = false;
  for (let i = 0; i < lookahead; i++) {
    const seg = segmentAt(track, car.z + i * SEGMENT_LENGTH);
    if (Math.abs(seg.curve) < AI_BRAKE_CURVE) { zone = -1; runDir = 0; continue; }
    const dir = seg.curve > 0 ? 1 : -1;
    if (dir !== runDir) {
      runDir = dir;
      runDrifts = driftOk && ((i === 0 && car.driftDir !== 0) || strongRun(track, car.z + i * SEGMENT_LENGTH, AI_DRIFT_MIN_SEGMENTS) >= AI_DRIFT_MIN_SEGMENTS);
    }
    if (tune.mistake > 0 && zone < 0) {
      zone = i === 0 ? curveZoneStart(track, seg.index) : seg.index;
      miss = missesBraking(state, car, tune, zone);
      if (miss && i === 0) missedFor = (seg.index - zone + track.segments.length) % track.segments.length;
    }
    const hold = runDrifts && !miss ? cornerHoldable(def, seg.curve, AI_DRIFT_CORNER_GAIN) : holdableSpeedFraction(def, seg.curve);
    const limit = hold * (0.9 + 0.12 * brain.skill) * tune.cornerSpeed * (miss ? MISTAKE_CORNER_SPEED : 1) * def.topSpeed;
    const allowed = Math.sqrt(limit * limit + 2 * brakeDecel * (miss ? MISTAKE_BRAKE_LATE : 1) * i * SEGMENT_LENGTH) / def.topSpeed;
    if (allowed < target) target = allowed;
  }
  const curveAhead = maxCurveAhead(track, car.z, tune.nitroLook);

  // Elástico: quem ficou para trás de TODOS os humanos acelera um pouco (menos com o tanque justo, que
  // não aguenta o pé no fundo até o box — sim/fuel.ts); quem disparou à frente do melhor, segura. Mirar o
  // melhor humano no reforço acelerava a IA que estava no meio do grupo, contra quem já ia mal (onda D).
  const human = bestHumanProgress(state);
  if (human > -Infinity && !car.finished) {
    if (car.progress - lastHumanProgress(state) < -CATCHUP_DISTANCE && !fuelTight(state, track, car, def.fuelPerUnit)) target *= difficulty === 'amador' ? 1.03 : 1.06;
    else if (car.progress - human > CATCHUP_DISTANCE * 1.5) target *= difficulty === 'campeao' ? 0.99 : 0.96;
  }
  if (car.finished) target = Math.min(target, 0.6);

  // ── Box: com o box à frente, para se o que resta — no consumo medido volta a volta — não chega
  // à próxima passagem por ele (ou à chegada). Era "abaixo de 22%", que secava o tanque nas voltas
  // longas (sim/fuel.ts).
  markFuel(brain, car, track.length);
  const toFinish = distanceToFinish(state, track, car);
  const burn = skipPitBurn(measuredBurn(brain, car, def.fuelPerUnit, track.length), def.fuelPerUnit, track.length, toFinish);
  const short = pitAhead && car.fuel < fuelToSkipPit(burn, track.length, toFinish);
  const wantsPit = !state.config.timeTrial && (short || (car.inPit && car.fuel < 0.98));
  let laneTarget = brain.laneX;
  if (wantsPit) {
    laneTarget = PIT_LANE_X;
    if (seg.pit && car.x > 1.1) target = Math.min(target, 0.24);
  } else {
    // Dentro da curva é mais curto e sofre menos com o empurrão.
    if (Math.abs(seg.curve) >= 2) laneTarget = Math.max(-0.75, Math.min(0.75, laneTarget - Math.sign(seg.curve) * tune.insideLine));
    // Desvio de quem está na frente (o agressivo chega mais perto, passa raspando e troca mais de faixa).
    const ahead = nearestAhead(state, track, car, 0.5, SEGMENT_LENGTH * tune.avoidRange);
    // O bloqueador só fecha a porta com a frente livre: desviar de quem está na frente vem primeiro.
    const block = ahead ? null : blockLane(state, track, car, brain, tune);
    if (ahead) {
      if (state.tick >= brain.laneUntil) {
        const goLeft = ahead.x > car.x || (ahead.x === car.x && nextFloat(state.rng) < 0.5);
        let lane = passLane(ahead.x, goLeft, tune.passOffset);
        // Perto da borda o limite da faixa come a folga: sem espaço para o carro inteiro, passa pelo outro lado.
        if (Math.abs(lane - ahead.x) < AI_PASS_CLEARANCE) lane = passLane(ahead.x, !goLeft, tune.passOffset);
        brain.laneX = lane;
        brain.laneUntil = state.tick + tune.laneHold;
      }
      laneTarget = brain.laneX;
      const aheadFrac = ahead.speed / def.topSpeed;
      // Carro andando: iguala a velocidade dele até conseguir passar (o agressivo cola e bate; o limpo
      // fica um pouco atrás). Carro quase parado é obstáculo: mantém um mínimo para conseguir esterçar.
      if (aheadFrac >= 0.3 && ahead.speed < car.speed) target = Math.min(target, aheadFrac * tune.follow);
      else if (aheadFrac < 0.3) target = Math.min(target, 0.35);
    } else if (block !== null) {
      laneTarget = block;
    }
    // Errou a frenagem: no começo do trecho o carro abre para fora da curva e passa pela grama.
    if (missedFor >= 0 && missedFor < MISTAKE_WIDE_SEGMENTS) laneTarget = -Math.sign(seg.curve) * MISTAKE_WIDE_X;
    // De vez em quando troca de faixa por conta própria (nunca no meio de um bloqueio).
    if (block === null && state.tick >= brain.laneUntil && nextFloat(state.rng) < tune.wander) {
      brain.laneX = nextRange(state.rng, -0.6, 0.6);
      brain.laneUntil = state.tick + 120;
    }
  }
  // Não esterça para dentro de quem está do lado: um carro não atravessa o outro (docs/FISICA.md), e empurrar de
  // lado custa velocidade aos dois. Segura a faixa ao lado dele; indo para o box, tira o pé e passa por trás — se ele
  // está andando (o limitador do box segura quem já está nele a 25%): parado, esperar ao lado dele seria para sempre;
  // aí segue e passa. O erro de frenagem é a exceção: o carro abre para fora porque não segura a curva.
  const erring = missedFor >= 0 && missedFor < MISTAKE_WIDE_SEGMENTS;
  const beside = erring ? null : sideBlocker(state, track, car, laneTarget, wantsPit ? CAR_LENGTH : AI_SIDE_LOOK);
  if (beside) {
    laneTarget = beside.x + (laneTarget > car.x ? -AI_PASS_CLEARANCE : AI_PASS_CLEARANCE);
    const besideFrac = beside.speed / def.topSpeed;
    if (wantsPit && besideFrac >= 0.1) target = Math.min(target, besideFrac * 0.9);
  }

  // ── Acelerador/freio
  const targetSpeed = target * def.topSpeed;
  if (car.speed > targetSpeed * 1.08) { input.throttle = false; input.brake = true; }
  else if (car.speed > targetSpeed) { input.throttle = false; }

  // ── Volante: vai para a faixa e compensa o empurrão da curva.
  const sf = Math.min(1, speedFrac);
  const counter = counterSteer(def, sf, seg.curve, car.driftDir);
  const toLane = (laneTarget - car.x) * 5;
  input.steer = Math.max(-1, Math.min(1, toLane + counter));

  // ── Derrapagem: nas curvas fortes compridas (wantsDrift), longe do box e sem estar no erro de frenagem. Na entrada o
  // volante vai ao menos ao mínimo de entrada, para o lado da curva (o "pulinho").
  if (driftOk && !erring && wantsDrift(track, car, def)) {
    input.drift = true;
    if (car.driftDir === 0) {
      const side = seg.curve > 0 ? 1 : -1;
      if (input.steer * side < DRIFT_ENTRY_STEER) input.steer = side * DRIFT_ENTRY_STEER;
    }
  }

  // ── Nitro: reta livre, velocidade alta, ninguém colado na frente (o limpo só em reta longa; o
  // agressivo mais cedo, mais vezes e com curva leve à frente).
  if (nitroCharges(state, car) > 0 && car.nitroTicks === 0 && !car.finished && !wantsPit && curveAhead < tune.nitroCurveMax && speedFrac > tune.nitroMinSpeed) {
    const blocked = nearestAhead(state, track, car, 0.45, SEGMENT_LENGTH * 4);
    if (!blocked && nextFloat(state.rng) < tune.nitroBase + brain.aggression * tune.nitroAggression) input.nitro = true;
  }
  return input;
}
