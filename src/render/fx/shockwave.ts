// Onda de choque (M5): um anel que se abre e apaga, na largada (deitado no chão sob o carro; azul e maior na largada-foguete) e no engate do nitro
// (de pé, atrás do carro, atravessado ao rumo da pista). Só liga transições do estado que já existem (fx/cues.ts: `go` e `nitro`); a onda N liga os
// eventos novos aos mesmos anéis. Uma `InstancedMesh` de no máximo 8 anéis, aditiva: o brilho vai pela cor da instância (a cor × o alfa).
// V8 (docs/ondas/V8-efeitos.md): o halo do nitro era um aro grosso (22% do raio, 1,1 m no fim) azul HDR que o bloom pegava; virou um anel FINO (4,5% do
// raio), transparente (cor ≤ 0,4, abaixo do limiar do bloom) e rápido (0,22 s, até 3,2 m), na malha própria `haloMesh` — a geometria é outra, o
// material (e o programa) é o mesmo do anel da largada, que não muda. Os 8 lugares do pool são dos dois.
import * as THREE from 'three';
import type { Track } from '../../core/types';
import { locateOnFrame, type FramePoint, type RoadFrame } from '../roadframe';

export type ShockKind = 'ground' | 'perfect' | 'halo';
export const SHOCK_MAX = 8;
/** Vida (s) e raio inicial e final (m) de cada tipo. */
export const SHOCK_SPECS: Record<ShockKind, { life: number; r0: number; r1: number }> = {
  ground: { life: 0.5, r0: 0.6, r1: 7 },
  perfect: { life: 0.55, r0: 0.8, r1: 11 },
  halo: { life: 0.22, r0: 0.7, r1: 3.2 },
};
/** Cor HDR de cada tipo (o bloom pega). */
const COLORS: Record<ShockKind, readonly [number, number, number]> = { ground: [1.5, 1.35, 0.95], perfect: [0.5, 1.2, 2.2], halo: [0.24, 0.32, 0.4] };
/** As três voltas (raio interno, miolo, externo) do anel da largada e do halo fino do nitro. */
const GROUND_RADII = [0.78, 0.9, 1] as const;
const HALO_RADII = [0.955, 0.978, 1] as const;
const KIND_INDEX: ShockKind[] = ['ground', 'perfect', 'halo'];

/** O anel `age` s depois de nascer: o raio abre rápido e desacelera, o brilho cai. Nulo fora da vida. */
export function shockPose(kind: ShockKind, age: number): { radius: number; alpha: number } | null {
  const sp = SHOCK_SPECS[kind];
  if (age < 0 || age >= sp.life) return null;
  const t = age / sp.life;
  return { radius: sp.r0 + (sp.r1 - sp.r0) * (1 - (1 - t) * (1 - t)), alpha: (1 - t) * (1 - t) };
}

/**
 * O anel macio: três voltas de vértices (raio 0,78 / 0,9 / 1) com cor de vértice 0 / 1 / 0 — com mistura aditiva o preto não soma nada, então as duas bordas
 * somem e o miolo brilha, em vez de uma faixa chapada (a primeira captura mostrou um aro bege duro). 160 triângulos. `radii`: as três voltas (o halo é fino).
 */
export function buildShockRingGeometry(segments = 40, radii: readonly number[] = GROUND_RADII): THREE.BufferGeometry {
  const level = [0, 1, 0];
  const pos: number[] = []; const col: number[] = []; const idx: number[] = [];
  for (let r = 0; r < radii.length; r++) {
    for (let k = 0; k <= segments; k++) {
      const a = (k / segments) * Math.PI * 2;
      pos.push(Math.cos(a) * radii[r], Math.sin(a) * radii[r], 0);
      col.push(level[r], level[r], level[r]);
    }
  }
  const row = segments + 1;
  for (let r = 0; r < radii.length - 1; r++) {
    for (let k = 0; k < segments; k++) {
      const a = r * row + k; const b = a + 1; const c = a + row; const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

export class Shockwaves {
  /** A largada (chão e largada-foguete). */
  readonly mesh: THREE.InstancedMesh;
  /** O halo fino do engate do nitro (V8): outra geometria, o mesmo material. */
  readonly haloMesh: THREE.InstancedMesh;
  private readonly kind = new Uint8Array(SHOCK_MAX);
  private readonly z = new Float32Array(SHOCK_MAX);
  private readonly x = new Float32Array(SHOCK_MAX);
  private readonly h = new Float32Array(SHOCK_MAX);
  private readonly age = new Float32Array(SHOCK_MAX).fill(-1);
  private readonly owner = new Int32Array(SHOCK_MAX).fill(-1);
  private next = 0;
  private readonly pt: FramePoint = { x: 0, y: 0, z: 0, heading: 0 };
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly material: THREE.MeshBasicMaterial;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(buildShockRingGeometry(), this.material, SHOCK_MAX);
    this.haloMesh = new THREE.InstancedMesh(buildShockRingGeometry(48, HALO_RADII), this.material, SHOCK_MAX);
    for (const m of [this.mesh, this.haloMesh]) {
      m.setColorAt(0, this.color.setRGB(0, 0, 0)); // aloca o instanceColor
      m.count = 0;
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 2;
    }
    this.mesh.name = 'fx-shockwaves';
    this.haloMesh.name = 'fx-halo';
  }

  /**
   * Acende um anel em (z, x, altura em m). O mais velho cai se já há 8. `owner` (id do carro, −1 = nenhum): o anel acompanha esse carro enquanto dura
   * (`follow`) — o halo do nitro, que fixo no mundo ficaria 10 m para trás em 0,1 s, atrás da câmera; o do chão da largada fica onde nasceu.
   */
  spawn(kind: ShockKind, z: number, x: number, h: number, owner = -1): void {
    const i = this.next; this.next = (this.next + 1) % SHOCK_MAX;
    this.kind[i] = KIND_INDEX.indexOf(kind); this.z[i] = z; this.x[i] = x; this.h[i] = h; this.age[i] = 0; this.owner[i] = owner;
  }

  /** Leva os anéis do carro `owner` para (z, x): a posição que ele tem agora (já com o afastamento do anel). */
  follow(owner: number, z: number, x: number): void {
    if (owner < 0) return;
    for (let i = 0; i < SHOCK_MAX; i++) if (this.age[i] >= 0 && this.owner[i] === owner) { this.z[i] = z; this.x[i] = x; }
  }

  step(dt: number): void {
    for (let i = 0; i < SHOCK_MAX; i++) {
      if (this.age[i] < 0) continue;
      this.age[i] += dt;
      if (this.age[i] >= SHOCK_SPECS[KIND_INDEX[this.kind[i]]].life) this.age[i] = -1;
    }
  }

  alive(): number { let n = 0; for (let i = 0; i < SHOCK_MAX; i++) if (this.age[i] >= 0) n++; return n; }

  clear(): void {
    this.age.fill(-1);
    for (const m of [this.mesh, this.haloMesh]) { m.count = 0; m.visible = false; }
  }

  /** Escreve as instâncias no referencial do viewport: chão deitado (na `mesh`), halo de pé atravessado ao rumo da pista naquele ponto (na `haloMesh`). */
  pose(rf: RoadFrame, track: Track): void {
    let n = 0; let nh = 0;
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
      const [r, g, b] = COLORS[kind];
      this.color.setRGB(r * p.alpha, g * p.alpha, b * p.alpha);
      if (kind === 'halo') { this.haloMesh.setMatrixAt(nh, d.matrix); this.haloMesh.setColorAt(nh, this.color); nh++; }
      else { this.mesh.setMatrixAt(n, d.matrix); this.mesh.setColorAt(n, this.color); n++; }
    }
    for (const [m, count] of [[this.mesh, n], [this.haloMesh, nh]] as const) {
      m.count = count;
      m.visible = count > 0;
      if (count > 0) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose(); this.haloMesh.geometry.dispose(); this.material.dispose(); this.mesh.dispose(); this.haloMesh.dispose();
  }
}
