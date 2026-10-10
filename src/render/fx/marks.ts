// Marcas de pneu (M5), num buffer em COORDENADA DE PISTA: cada ponto é (z, x) na pista, com a força e o instante em que nasceu, então a mesma
// marca aparece certa em todos os viewports — cada um a reprojeta pelo seu RoadFrame (`locateOnFrame`), como as partículas de `effects.ts`.
// O anel tem teto de pontos (por degrau de qualidade: `fxPlan.marks`): o mais velho cai primeiro. Cada roda de cada carro é uma FAIXA; um ponto só
// se liga ao anterior da mesma faixa se a lacuna for pequena no espaço e no tempo (senão começa outra passada, sem risco entre as duas).
// A fita no chão é UMA malha (2 triângulos por segmento), vertex color com alfa, `polygonOffset` para não brigar com o asfalto.
import * as THREE from 'three';
import { LAUNCH_PERFECT } from '../../core/constants';
import { wrappedDelta } from '../../core/sim/collisions';
import { driftLevel } from '../../core/sim/physics';
import type { Track } from '../../core/types';
import { locateOnFrame, type FramePoint, type RoadFrame } from '../roadframe';

/** Distância mínima entre dois pontos da mesma faixa (m): mais perto que isto o ponto novo não entra. */
export const MARK_STEP_M = 0.5;
/** Lacuna máxima (m) para o ponto novo ligar ao anterior; acima começa outra faixa. */
export const MARK_GAP_M = 8;
/** Lacuna máxima de tempo (s) para ligar: outra passada pelo mesmo lugar não é a mesma marca. */
const MARK_GAP_S = 0.25;
/** Quanto a marca dura (s) até apagar de vez. */
export const MARK_LIFE_S = 45;
/** Largura de um pneu (m). */
const MARK_WIDTH = 0.2;
/** Altura sobre a pista (m), somada ao polygonOffset. */
const MARK_LIFT = 0.02;
/** Metros por unidade de pista e por meia largura. */
const M_PER_Z = 0.02;
const M_PER_X = 7;
/** Faixas: 20 carros × 2 rodas. */
const STRIPS = 40;

/** O que `markStrength` lê do carro. */
export interface MarkCarState { z: number; x: number; speed: number; driftDir: number; driftTicks: number; driftCharge: number; collisionCooldown: number; launch: number }

const MARK_MIN_SPEED = 1500;
const BRAKE_MIN_SPEED = 2500;
const BURNOUT_SECONDS = 0.7;

/**
 * Quão forte o carro marca o chão agora, 0..1 (0 = não marca): a derrapagem (mais forte com a carga), a freada forte e o arranque da
 * largada-foguete (`sinceGo` = segundos desde o JÁ; negativo = ainda na contagem). Batendo (`collisionCooldown`) não marca.
 */
export function markStrength(c: MarkCarState, decel: number, brake: number, sinceGo: number): number {
  if (c.collisionCooldown > 0) return 0;
  let s = 0;
  if (c.driftTicks > 0 && c.driftDir !== 0 && c.speed >= MARK_MIN_SPEED) s = 0.5 + 0.15 * driftLevel(c.driftCharge);
  if (c.speed > BRAKE_MIN_SPEED && decel > brake * 0.55) s = Math.max(s, 0.45);
  if (c.launch === LAUNCH_PERFECT && sinceGo >= 0 && sinceGo < BURNOUT_SECONDS) s = Math.max(s, 0.8);
  return s;
}

export class MarkBuffer {
  capacity: number;
  private z: Float32Array; private x: Float32Array; private strength: Float32Array; private born: Float32Array;
  private serial: Float64Array; private prev: Int32Array; private prevSerial: Float64Array;
  private next = 0; private filled = 0; private serialCounter = 0;
  private readonly lastSlot = new Int32Array(STRIPS).fill(-1);
  private readonly lastSerial = new Float64Array(STRIPS);

  constructor(capacity: number, public trackLength = 1e9) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.z = new Float32Array(0); this.x = this.z; this.strength = this.z; this.born = this.z;
    this.serial = new Float64Array(0); this.prev = new Int32Array(0); this.prevSerial = this.serial;
    this.alloc();
  }

  private alloc(): void {
    const n = this.capacity;
    this.z = new Float32Array(n); this.x = new Float32Array(n); this.strength = new Float32Array(n); this.born = new Float32Array(n);
    this.serial = new Float64Array(n); this.prev = new Int32Array(n).fill(-1); this.prevSerial = new Float64Array(n);
    this.next = 0; this.filled = 0;
    this.lastSlot.fill(-1);
  }

  /** Troca o teto de pontos (limpa o anel). */
  setCapacity(n: number): void {
    const c = Math.max(1, Math.floor(n));
    if (c === this.capacity) return;
    this.capacity = c; this.alloc();
  }

  setTrackLength(n: number): void { this.trackLength = n; }

  count(): number { return this.filled; }

  clear(): void { this.next = 0; this.filled = 0; this.lastSlot.fill(-1); }

  /** A próxima marca desta faixa começa uma passada nova (não liga à anterior). */
  breakStrip(strip: number): void { if (strip >= 0 && strip < STRIPS) this.lastSlot[strip] = -1; }

  /**
   * Põe um ponto da faixa `strip` (z em unidades de pista, x em meias larguras) com a força e o tempo (s). Falso se ficou a menos de
   * `MARK_STEP_M` do anterior da mesma faixa (nada é gravado).
   */
  push(strip: number, z: number, x: number, strength: number, time: number): boolean {
    const s = Math.max(0, Math.min(STRIPS - 1, Math.floor(strip)));
    let link = -1;
    const last = this.lastSlot[s];
    if (last >= 0 && this.serial[last] === this.lastSerial[s]) {
      const d = Math.hypot(wrappedDelta(z, this.z[last], this.trackLength) * M_PER_Z, (x - this.x[last]) * M_PER_X);
      if (d < MARK_STEP_M) return false;
      if (d <= MARK_GAP_M && time - this.born[last] <= MARK_GAP_S) link = last;
    }
    const slot = this.next;
    this.next = (this.next + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled++;
    const serial = ++this.serialCounter;
    this.z[slot] = z; this.x[slot] = x; this.strength[slot] = strength; this.born[slot] = time;
    this.serial[slot] = serial;
    this.prev[slot] = link; this.prevSerial[slot] = link >= 0 ? this.serial[link] : 0;
    this.lastSlot[s] = slot; this.lastSerial[s] = serial;
    return true;
  }

  /** O brilho do ponto `slot` no instante `time`: a força, apagando linearmente até `MARK_LIFE_S`. */
  private alphaOf(slot: number, time: number): number {
    return Math.max(0, this.strength[slot] * (1 - (time - this.born[slot]) / MARK_LIFE_S));
  }

  /** Chama `cb` para cada segmento ligado (do mais velho ao mais novo), com os dois pontos e o brilho de cada um; pula o que já apagou. */
  forEachSegment(time: number, cb: (za: number, xa: number, zb: number, xb: number, alphaA: number, alphaB: number) => void): void {
    const n = this.filled;
    const start = n < this.capacity ? 0 : this.next;
    for (let k = 0; k < n; k++) {
      const slot = (start + k) % this.capacity;
      const p = this.prev[slot];
      if (p < 0 || this.serial[p] !== this.prevSerial[slot]) continue;
      const aa = this.alphaOf(p, time); const ab = this.alphaOf(slot, time);
      if (aa <= 0.01 && ab <= 0.01) continue;
      cb(this.z[p], this.x[p], this.z[slot], this.x[slot], aa, ab);
    }
  }
}

/** A fita no chão: uma malha só que reescreve os segmentos do anel no referencial de cada viewport. */
export class TireMarks {
  readonly mesh: THREE.Mesh;
  readonly buffer: MarkBuffer;
  /** Segmentos escritos na última pose. */
  segments = 0;
  private readonly pos: THREE.BufferAttribute;
  private readonly col: THREE.BufferAttribute;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly a: FramePoint = { x: 0, y: 0, z: 0, heading: 0 };
  private readonly b: FramePoint = { x: 0, y: 0, z: 0, heading: 0 };

  constructor(readonly max: number) {
    this.buffer = new MarkBuffer(max);
    const geo = new THREE.BufferGeometry();
    const verts = max * 4;
    this.pos = new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(verts * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const index = new Uint16Array(max * 6);
    for (let q = 0; q < max; q++) { const v = q * 4; index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], q * 6); }
    geo.setAttribute('position', this.pos); geo.setAttribute('color', this.col);
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.setDrawRange(0, 0);
    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
    this.mesh.name = 'fx-marks';
  }

  /** Reescreve a fita no referencial do viewport `rf`; `time` é o relógio dos pontos (s). */
  pose(rf: RoadFrame, track: Track, time: number): void {
    let n = 0;
    const { a, b, pos, col } = this;
    const half = MARK_WIDTH / 2;
    this.buffer.forEachSegment(time, (za, xa, zb, xb, aa, ab) => {
      if (n >= this.max) return;
      if (!locateOnFrame(rf, track, za, xa, a) || !locateOnFrame(rf, track, zb, xb, b)) return;
      const v = n * 4;
      const ax = Math.cos(a.heading) * half; const az = Math.sin(a.heading) * half;
      const bx = Math.cos(b.heading) * half; const bz = Math.sin(b.heading) * half;
      const ay = a.y + MARK_LIFT; const by = b.y + MARK_LIFT;
      pos.setXYZ(v, a.x - ax, ay, a.z - az); pos.setXYZ(v + 1, a.x + ax, ay, a.z + az);
      pos.setXYZ(v + 2, b.x - bx, by, b.z - bz); pos.setXYZ(v + 3, b.x + bx, by, b.z + bz);
      const ka = Math.min(1, aa) * 0.78; const kb = Math.min(1, ab) * 0.78;
      col.setXYZW(v, 0.04, 0.04, 0.05, ka); col.setXYZW(v + 1, 0.04, 0.04, 0.05, ka);
      col.setXYZW(v + 2, 0.04, 0.04, 0.05, kb); col.setXYZW(v + 3, 0.04, 0.04, 0.05, kb);
      n++;
    });
    this.segments = n;
    this.mesh.geometry.setDrawRange(0, n * 6);
    this.mesh.visible = n > 0;
    if (n > 0) {
      pos.clearUpdateRanges(); pos.addUpdateRange(0, n * 12); pos.needsUpdate = true;
      col.clearUpdateRanges(); col.addUpdateRange(0, n * 16); col.needsUpdate = true;
    }
  }

  dispose(): void { this.mesh.geometry.dispose(); this.material.dispose(); }
}
