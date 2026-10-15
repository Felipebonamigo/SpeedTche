// "POW" da batida (M5) — desde a V8 só com a opção "Efeitos de cartum" (docs/ondas/V8-efeitos.md; no padrão, fx/impact.ts): a explosão de quadrinhos com a palavra, um billboard que estoura, segura e some em 0,55 s, em cima do carro batido. É
// somado às estrelinhas sobre o teto (cars/stars.ts, da M4) e às faíscas. Uma `InstancedMesh` de no máximo 6 quads, sem teste de profundidade (o
// quadrinho aparece por cima, como no desenho). A textura vem de um canvas 2D desenhado uma vez; sem canvas (testes no Node) fica uma textura branca.
import * as THREE from 'three';
import type { Track } from '../../core/types';
import { locateOnFrame, type FramePoint, type RoadFrame } from '../roadframe';

export const POW_SECONDS = 0.55;
export const POW_MAX = 6;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number): number => { const t = clamp01(v); return t * t * (3 - 2 * t); };

/**
 * O quadrinho `age` s depois da batida: estoura de 0,2 a 1,22 em 0,12 s, assenta em 1 até 0,22 s, segura, e nos últimos 0,15 s apaga e encolhe um pouco.
 * Nulo fora da vida.
 */
export function powPose(age: number): { scale: number; alpha: number } | null {
  if (age < 0 || age >= POW_SECONDS) return null;
  let scale: number;
  if (age < 0.12) scale = 0.2 + 1.02 * smooth(age / 0.12);
  else if (age < 0.22) scale = 1.22 - 0.22 * smooth((age - 0.12) / 0.1);
  else scale = 1;
  const fade = clamp01((POW_SECONDS - age) / 0.15);
  return { scale: scale * (0.8 + 0.2 * fade), alpha: fade };
}

/** O lado do quadrinho (m): de 1,8 m numa batida fraca a 3,4 m numa pancada (queda de 15% da velocidade máxima ou mais). */
export function powSize(drop: number): number {
  return 1.8 + 1.6 * clamp01(drop / 0.15);
}

/** O que `drawPowSprite` usa do contexto 2D (o resto vai por propriedade). */
export interface PowCtx {
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; closePath(): void;
  fill(): void; stroke(): void; fillText(text: string, x: number, y: number): void; strokeText(text: string, x: number, y: number): void;
  [k: string]: unknown;
}

function burst(ctx: PowCtx, size: number, outer: number, inner: number, spikes: number, twist: number): void {
  ctx.beginPath();
  for (let k = 0; k < spikes * 2; k++) {
    const a = (k * Math.PI) / spikes - Math.PI / 2 + twist;
    const jitter = 1 + 0.08 * Math.sin(k * 2.7 + twist * 5); // pontas desiguais, como o desenho à mão
    const r = (k % 2 === 0 ? outer * jitter : inner) * size;
    const x = size / 2 + Math.cos(a) * r; const y = size / 2 + Math.sin(a) * r;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Desenha o quadrinho num quadrado de `size` px: explosão amarela com contorno escuro, miolo vermelho e "POW!" branco contornado. */
export function drawPowSprite(ctx: PowCtx, size: number): void {
  ctx.clearRect(0, 0, size, size);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  burst(ctx, size, 0.49, 0.33, 14, 0);
  ctx.fillStyle = '#ffd23f'; ctx.fill();
  ctx.lineWidth = size * 0.035; ctx.strokeStyle = '#14182b'; ctx.stroke();
  burst(ctx, size, 0.37, 0.26, 12, 0.12);
  ctx.fillStyle = '#ff4d2e'; ctx.fill();
  ctx.lineWidth = size * 0.02; ctx.stroke();
  ctx.font = `900 italic ${Math.round(size * 0.27)}px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = size * 0.055; ctx.strokeStyle = '#14182b';
  ctx.strokeText('POW!', size / 2, size / 2 + size * 0.02);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('POW!', size / 2, size / 2 + size * 0.02);
}

function makeTexture(): THREE.Texture {
  try {
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawPowSprite(ctx as unknown as PowCtx, 256);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
      }
    }
  } catch { /* sem canvas: textura branca */ }
  const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  tex.needsUpdate = true;
  return tex;
}

const VERT = /* glsl */ `
attribute vec3 aPop; // escala (m), brilho, rotação (rad)
varying vec2 vUv; varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float c = cos(aPop.z); float s = sin(aPop.z);
  vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aPop.x;
  mv.xy += p;
  gl_Position = projectionMatrix * mv;
  vUv = uv; vAlpha = aPop.y;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv; varying float vAlpha;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vAlpha;
  if (a < 0.02) discard;
  gl_FragColor = vec4(t.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Pows {
  readonly mesh: THREE.InstancedMesh;
  private readonly z = new Float32Array(POW_MAX); private readonly x = new Float32Array(POW_MAX); private readonly h = new Float32Array(POW_MAX);
  private readonly size = new Float32Array(POW_MAX); private readonly roll = new Float32Array(POW_MAX);
  private readonly age = new Float32Array(POW_MAX).fill(-1);
  private readonly owner = new Int32Array(POW_MAX).fill(-1);
  private next = 0;
  private readonly pop: THREE.InstancedBufferAttribute;
  private readonly pt: FramePoint = { x: 0, y: 0, z: 0, heading: 0 };
  private readonly dummy = new THREE.Object3D();
  private readonly material: THREE.ShaderMaterial;
  private readonly texture: THREE.Texture;

  constructor() {
    this.texture = makeTexture();
    this.material = new THREE.ShaderMaterial({
      name: 'SpeedTchePow', vertexShader: VERT, fragmentShader: FRAG, uniforms: { uMap: { value: this.texture } },
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    this.pop = new THREE.InstancedBufferAttribute(new Float32Array(POW_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPop', this.pop);
    this.mesh = new THREE.InstancedMesh(geo, this.material, POW_MAX);
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = 'fx-pow';
  }

  /**
   * Estoura um POW em (z, x, altura em m), de `size` m de lado e girado `roll` rad. O mais velho cai se já há 6. `owner` (id do carro, −1 = nenhum): o
   * quadrinho acompanha esse carro enquanto dura (`follow`); fixo no mundo, ele ficaria para trás e passaria rente à câmera, enorme.
   */
  spawn(z: number, x: number, h: number, size: number, roll: number, owner = -1): void {
    const i = this.next; this.next = (this.next + 1) % POW_MAX;
    this.z[i] = z; this.x[i] = x; this.h[i] = h; this.size[i] = size; this.roll[i] = roll; this.age[i] = 0; this.owner[i] = owner;
  }

  /** Leva os POW do carro `owner` para (z, x): a posição que ele tem agora. */
  follow(owner: number, z: number, x: number): void {
    if (owner < 0) return;
    for (let i = 0; i < POW_MAX; i++) if (this.age[i] >= 0 && this.owner[i] === owner) { this.z[i] = z; this.x[i] = x; }
  }

  step(dt: number): void {
    for (let i = 0; i < POW_MAX; i++) {
      if (this.age[i] < 0) continue;
      this.age[i] += dt;
      if (this.age[i] >= POW_SECONDS) this.age[i] = -1;
    }
  }

  alive(): number { let n = 0; for (let i = 0; i < POW_MAX; i++) if (this.age[i] >= 0) n++; return n; }

  clear(): void { this.age.fill(-1); this.mesh.count = 0; this.mesh.visible = false; }

  pose(rf: RoadFrame, track: Track): void {
    let n = 0;
    for (let i = 0; i < POW_MAX; i++) {
      if (this.age[i] < 0) continue;
      const p = powPose(this.age[i]);
      if (!p || !locateOnFrame(rf, track, this.z[i], this.x[i], this.pt)) continue;
      this.dummy.position.set(this.pt.x, this.pt.y + this.h[i], this.pt.z);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      this.pop.setXYZ(n, this.size[i] * p.scale, p.alpha, this.roll[i]);
      n++;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n > 0) { this.mesh.instanceMatrix.needsUpdate = true; this.pop.needsUpdate = true; }
  }

  dispose(): void { this.mesh.geometry.dispose(); this.material.dispose(); this.texture.dispose(); this.mesh.dispose(); }
}
