// Onda de choque (M5): um anel que se abre e apaga, na largada (deitado no chão sob o carro; azul e maior na largada-foguete) e no engate do nitro
// (de pé, atrás do carro, atravessado ao rumo da pista). Só liga transições do estado que já existem (fx/cues.ts: `go` e `nitro`); a onda N liga os
// eventos novos aos mesmos anéis. Uma `InstancedMesh` de no máximo 8 anéis, aditiva: o brilho vai pela cor da instância (a cor × o alfa).
import * as THREE from 'three';
import type { Track } from '../../core/types';
import { locateOnFrame, type FramePoint, type RoadFrame } from '../roadframe';

export type ShockKind = 'ground' | 'perfect' | 'halo';
export const SHOCK_MAX = 8;
/** Vida (s) e raio inicial e final (m) de cada tipo. */
export const SHOCK_SPECS: Record<ShockKind, { life: number; r0: number; r1: number }> = {
  ground: { life: 0.5, r0: 0.6, r1: 7 },
  perfect: { life: 0.55, r0: 0.8, r1: 11 },
  halo: { life: 0.35, r0: 0.8, r1: 5 },
};
/** Cor HDR de cada tipo (o bloom pega). */
const COLORS: Record<ShockKind, readonly [number, number, number]> = { ground: [1.5, 1.35, 0.95], perfect: [0.5, 1.2, 2.2], halo: [0.8, 1.4, 2.0] };
const KIND_INDEX: ShockKind[] = ['ground', 'perfect', 'halo'];

/** O anel `age` s depois de nascer: o raio abre rápido e desacelera, o brilho cai. Nulo fora da vida. */
export function shockPose(kind: ShockKind, age: number): { radius: number; alpha: number } | null {
  const sp = SHOCK_SPECS[kind];
  if (age < 0 || age >= sp.life) return null;
  const t = age / sp.life;
  return { radius: sp.r0 + (sp.r1 - sp.r0) * (1 - (1 - t) * (1 - t)), alpha: (1 - t) * (1 - t) };
}

export class Shockwaves {
  readonly mesh: THREE.InstancedMesh;
  private readonly kind = new Uint8Array(SHOCK_MAX);
  private readonly z = new Float32Array(SHOCK_MAX);
  private readonly x = new Float32Array(SHOCK_MAX);
  private readonly h = new Float32Array(SHOCK_MAX);
  private readonly age = new Float32Array(SHOCK_MAX).fill(-1);
  private next = 0;
  private readonly pt: FramePoint = { x: 0, y: 0, z: 0, heading: 0 };
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly material: THREE.MeshBasicMaterial;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(new THREE.RingGeometry(0.82, 1, 40), this.material, SHOCK_MAX);
    this.mesh.setColorAt(0, this.color.setRGB(0, 0, 0)); // aloca o instanceColor
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'fx-shockwaves';
  }

  /** Acende um anel em (z, x, altura em m). O mais velho cai se já há 8. */
  spawn(kind: ShockKind, z: number, x: number, h: number): void {
    const i = this.next; this.next = (this.next + 1) % SHOCK_MAX;
    this.kind[i] = KIND_INDEX.indexOf(kind); this.z[i] = z; this.x[i] = x; this.h[i] = h; this.age[i] = 0;
  }

  step(dt: number): void {
    for (let i = 0; i < SHOCK_MAX; i++) {
      if (this.age[i] < 0) continue;
      this.age[i] += dt;
      if (this.age[i] >= SHOCK_SPECS[KIND_INDEX[this.kind[i]]].life) this.age[i] = -1;
    }
  }

  alive(): number { let n = 0; for (let i = 0; i < SHOCK_MAX; i++) if (this.age[i] >= 0) n++; return n; }

  clear(): void { this.age.fill(-1); this.mesh.count = 0; this.mesh.visible = false; }

  /** Escreve as instâncias no referencial do viewport: chão deitado, halo de pé atravessado ao rumo da pista naquele ponto. */
  pose(rf: RoadFrame, track: Track): void {
    let n = 0;
    const d = this.dummy;
    for (let i = 0; i < SHOCK_MAX; i++) {
      if (this.age[i] < 0) continue;
      const kind = KIND_INDEX[this.kind[i]];
      const p = shockPose(kind, this.age[i]);
      if (!p || !locateOnFrame(rf, track, this.z[i], this.x[i], this.pt)) continue;
      d.position.set(this.pt.x, this.pt.y + this.h[i], this.pt.z);
      if (kind === 'halo') d.rotation.set(0, Math.PI - this.pt.heading, 0); else d.rotation.set(-Math.PI / 2, 0, 0);
      d.scale.setScalar(p.radius);
      d.updateMatrix();
      this.mesh.setMatrixAt(n, d.matrix);
      const [r, g, b] = COLORS[kind];
      this.mesh.setColorAt(n, this.color.setRGB(r * p.alpha, g * p.alpha, b * p.alpha));
      n++;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void { this.mesh.geometry.dispose(); this.material.dispose(); this.mesh.dispose(); }
}
