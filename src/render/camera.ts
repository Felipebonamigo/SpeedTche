// Câmeras: perseguição por viewport (atrás e acima do carro, olhando à frente, atraso lateral
// suave, FOV que abre com a velocidade e no nitro, inclinação leve nas curvas, chacoalho só na
// batida) e a câmera automática do fundo dos menus (voa pela pista, mais alta, sem carro).
// M5: além da base (`CHASE_CAMERA`, que não muda) a câmera de perseguição ganha deslocamentos DINÂMICOS, todos com limite e modelados em
// `scenery/sight.ts` (`CAMERA_DYNAMICS`, com teste): mais baixa em velocidade, mola de FOV no engate do nitro, tremor fino acima de 90%,
// cresta de morro e a órbita ao cruzar a linha em 1º. "Reduzir efeitos" tira o tranco da mola, o tremor e a órbita.
import * as THREE from 'three';
import { TICK_RATE } from '../core/constants';
import { wrappedDelta } from '../core/sim/collisions';
import type { RenderFrame } from '../game/contracts';
import { CHASE_CAMERA } from './camera-base';
import type { Shake } from './effects';
import { frameYAt, type RoadFrame } from './roadframe';
import {
  CAMERA_DYNAMICS, cameraLowering, crestLift, findCrests, orbitAmount, orbitCamera, stepNitroFov, tremorAmount, tremorOffset,
  type Neighbor, type NitroFov, type OrbitOut, type Tremor,
} from './scenery/sight';
import { ROAD_HALF_WIDTH_M, SEGMENT_M } from './units';

export { CHASE_CAMERA };
const BASE_FOV = CHASE_CAMERA.baseFov;
const SPEED_FOV = CHASE_CAMERA.speedFov;
const NITRO_FOV = CHASE_CAMERA.nitroFov;
/** Metros por unidade de pista (200 unidades = 1 segmento de 4 m). */
const Z_TO_M = SEGMENT_M / 200;
/** Vizinhos mais longe que isto (m, ao longo e de lado) não entram na conta da órbita: ela chega a ~8 m do carro. */
const NEIGHBOR_RANGE_M = 20;

/** O que a câmera de perseguição precisa além do estado da pista (montado por `cameraExtraFor`, uma vez por quadro e viewport). */
export interface CameraExtra {
  /** Reduzir efeitos (acessibilidade): sem tranco na mola de FOV, sem tremor e sem órbita. */
  reduce: boolean;
  /** O tremor fino está ligado (a opção de tremor da tela ligada e não é reduzir efeitos). */
  tremor: boolean;
  /** Segundos desde que este carro cruzou a linha em 1º; negativo = não cruzou em 1º. */
  finishSeconds: number;
  /** Elevação da cresta (m) sob o carro. */
  crest: number;
  /** Os outros carros perto, em metros relativos a este (`dz` positivo = à frente); só os `count` primeiros valem. */
  neighbors: Neighbor[];
  count: number;
}

export function newCameraExtra(): CameraExtra {
  return { reduce: false, tremor: false, finishSeconds: -1, crest: 0, neighbors: [], count: 0 };
}

const DEFAULT_EXTRA = newCameraExtra();

/** Monta o extra do carro `carIndex` a partir do quadro do renderizador (reaproveita `out`: nada alocado por quadro depois dos primeiros). */
export function cameraExtraFor(frame: RenderFrame, carIndex: number, out: CameraExtra = newCameraExtra()): CameraExtra {
  const state = frame.state;
  const car = state.cars[carIndex];
  out.reduce = frame.options.reduceEffects === true;
  out.tremor = frame.options.screenShake === true && !out.reduce;
  out.finishSeconds = -1; out.crest = 0; out.count = 0;
  if (!car) return out;
  // Cruzou a linha em 1º: finished + a 1ª posição (os que terminaram vêm antes, por `finishTick`: positions.ts).
  if (car.finished && car.position === 1 && state.tick >= car.finishTick) out.finishSeconds = (state.tick - car.finishTick) / TICK_RATE;
  const length = frame.track.length;
  const top = car.stats.topSpeed;
  out.crest = crestLift(findCrests(frame.track), car.z, length, top > 0 ? car.speed / top : 0);
  for (const o of state.cars) {
    if (o === car) continue;
    const dz = wrappedDelta(o.z, car.z, length) * Z_TO_M;
    if (Math.abs(dz) > NEIGHBOR_RANGE_M) continue;
    const dx = (o.x - car.x) * ROAD_HALF_WIDTH_M;
    if (Math.abs(dx) > NEIGHBOR_RANGE_M) continue;
    const n = out.neighbors[out.count] ?? (out.neighbors[out.count] = { dx: 0, dz: 0 });
    n.dx = dx; n.dz = dz;
    out.count++;
  }
  return out;
}

const smooth01 = (v: number): number => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };

export class ChaseCamera {
  readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 16 / 9, 0.3, 3000);
  private lagX = 0;
  /** A parcela do FOV que vem da velocidade (°), suavizada; a do nitro é a mola. */
  private speedFov = 0;
  private roll = 0;
  private readonly nitroFov: NitroFov = { x: 0, v: 0 };
  private nitroPrev = false;
  /** Fração da órbita da vitória que vale agora (já cortada pela folga contra os vizinhos). */
  private orbit = 0;
  private lastTime = -1;
  private readonly target = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly tremor: Tremor = { x: 0, y: 0, roll: 0 };
  private readonly orbitOut: OrbitOut = { lat: 0, back: 0, lift: 0, alpha: 0, yaw: 0 };

  /** `carX` em meias larguras, `speedFrac` 0..1,2, `curve` do segmento atual. */
  update(rf: RoadFrame, carX: number, speedFrac: number, curve: number, nitroOn: boolean, time: number, shake: Shake, extra: CameraExtra = DEFAULT_EXTRA): void {
    const first = this.lastTime < 0;
    const dt = first ? 1 / 60 : Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    const xm = carX * ROAD_HALF_WIDTH_M;
    if (first) { this.lagX = xm; this.nitroPrev = nitroOn; this.nitroFov.x = nitroOn ? NITRO_FOV : 0; this.nitroFov.v = 0; } // sem "deslizar" no primeiro quadro
    const k = 1 - Math.exp(-dt * 5.5);
    this.lagX += (xm - this.lagX) * k; // segue o x do carro por inteiro (com atraso): o carro nunca sai do centro
    // FOV: a parcela da velocidade suaviza; a do nitro é uma mola com tranco no engate (sight.ts: stepNitroFov, com teto).
    stepNitroFov(this.nitroFov, nitroOn, nitroOn && !this.nitroPrev && !first, dt, extra.reduce);
    this.nitroPrev = nitroOn;
    this.speedFov += (SPEED_FOV * Math.min(1.2, speedFrac) - this.speedFov) * (1 - Math.exp(-dt * 3));
    const fov = Math.min(CAMERA_DYNAMICS.fov.hardMax, Math.max(BASE_FOV, BASE_FOV + this.speedFov + this.nitroFov.x));
    const rollTarget = -curve * 0.012 * Math.min(1, speedFrac);
    this.roll += (rollTarget - this.roll) * (1 - Math.exp(-dt * 3));
    // Altura: a base, menos o que a velocidade abaixa, mais a cresta; sempre sobre a pista sob a câmera (piso em CAMERA_DYNAMICS).
    const camY = CHASE_CAMERA.height - cameraLowering(speedFrac) + frameYAt(rf, -CHASE_CAMERA.back) + extra.crest;
    // Pitch limitado: em rampa forte o alvo sobe/desce no máximo 4 m (o carro fica no quadro).
    const aheadY = CHASE_CAMERA.lookY + Math.max(-4, Math.min(4, frameYAt(rf, CHASE_CAMERA.lookAhead) * 0.6));
    const tr = this.tremor;
    if (extra.tremor && !extra.reduce) tremorOffset(time, tremorAmount(speedFrac), tr); else { tr.x = 0; tr.y = 0; tr.roll = 0; }
    // Órbita da vitória (só em 1º, só sem reduzir efeitos): sobe com o tempo desde a linha, cortada pelos vizinhos.
    let px = this.lagX; let py = camY; let pz: number = CHASE_CAMERA.back;
    let tx = this.lagX * 0.7 + xm * 0.3; let ty = aheadY; let tz = -CHASE_CAMERA.lookAhead;
    if (extra.finishSeconds >= 0 && !extra.reduce) {
      this.orbit += (orbitAmount(extra.finishSeconds) - this.orbit) * (1 - Math.exp(-dt * 8));
      const o = orbitCamera(this.orbit, xm, this.lagX, extra.neighbors, extra.count, this.orbitOut);
      this.orbit = Math.min(this.orbit, o.alpha); // um carro no caminho recua a órbita de uma vez; ela volta devagar
      px = o.lat; py = camY + o.lift; pz = o.back;
      const w = smooth01(o.alpha);
      tx += (xm - tx) * w; ty += (0.7 - ty) * w; tz += (0 - tz) * w; // olha para o carro
    } else this.orbit = 0;
    const c = this.camera;
    c.position.set(px + shake.x + tr.x, py + shake.y + tr.y, pz);
    this.target.set(tx, ty, tz);
    const r = this.roll + shake.roll + tr.roll;
    this.up.set(Math.sin(r), Math.cos(r), 0);
    c.up.copy(this.up);
    c.lookAt(this.target);
    if (Math.abs(c.fov - fov) > 0.05) { c.fov = fov; c.updateProjectionMatrix(); }
  }

  setAspect(aspect: number): void {
    if (Math.abs(this.camera.aspect - aspect) > 1e-4) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
  }

  reset(): void {
    this.lagX = 0; this.speedFov = 0; this.roll = 0; this.lastTime = -1; this.orbit = 0;
    this.nitroFov.x = 0; this.nitroFov.v = 0; this.nitroPrev = false;
  }
}

export class IdleCamera {
  readonly camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.5, 3000);
  private readonly target = new THREE.Vector3();

  update(rf: RoadFrame, time: number): void {
    const sway = Math.sin(time * 0.23);
    const c = this.camera;
    c.position.set(4.5 * sway, 8.5 + frameYAt(rf, -4) * 0.5, 4);
    this.target.set(-2 * sway, 1.5 + frameYAt(rf, 40) * 0.6, -45);
    c.up.set(0, 1, 0);
    c.lookAt(this.target);
  }

  setAspect(aspect: number): void {
    if (Math.abs(this.camera.aspect - aspect) > 1e-4) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
  }
}
