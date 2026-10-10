// Traços esticados em UMA malha (M5): cada traço é um quad de cabeça → cauda, de largura em pixels constante, montado no vertex shader a partir de
// dois pontos do mundo. Serve às faíscas (rodas, batida, raspão, escape do nitro), às linhas de velocidade e ao túnel de ar do vácuo: tudo isso
// num lote, UMA chamada de desenho enquanto houver traço (a malha fica `visible = false` quando vazia, e então não conta chamada).
// A cabeça é o ponto brilhante; a cauda apaga. Aditivo, sem escrever profundidade, com teste de profundidade (o carro e o cenário tapam).
// O quadro de tela escreve o lote UMA vez por viewport (`begin`/`add`/`end`), como os pools de partículas de `effects.ts`.
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec3 aTail; attribute vec2 aCorner; attribute vec4 aColor; attribute float aWidth;
varying vec4 vColor; varying vec2 vEdge;
void main() {
  vec4 h = modelViewMatrix * vec4(position, 1.0);
  vec4 t = modelViewMatrix * vec4(aTail, 1.0);
  // Corta o traço no plano próximo: um ponto atrás da câmera não pode ir para a tela.
  float dh = -h.z - 0.3; float dt = -t.z - 0.3;
  if (dh < 0.0 && dt < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vColor = vec4(0.0); vEdge = vec2(0.0); return; }
  if (dh < 0.0) h = mix(h, t, dh / (dh - dt));
  else if (dt < 0.0) t = mix(t, h, dt / (dt - dh));
  vec4 ch = projectionMatrix * h; vec4 ct = projectionMatrix * t;
  vec2 sh = ch.xy / ch.w; vec2 st = ct.xy / ct.w;
  float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
  vec2 d = (st - sh) * vec2(aspect, 1.0);
  float len = length(d);
  vec2 dir = len > 1e-5 ? d / len : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);
  float depth = max(0.3, mix(-h.z, -t.z, aCorner.x));
  // Meia largura em unidades de altura da tela: metros × (1 / tan(fov/2)) / profundidade.
  float w = 0.5 * aWidth * projectionMatrix[1][1] / depth;
  vec2 off = perp * aCorner.y * w;
  off.x /= aspect;
  vec2 p = mix(sh, st, aCorner.x) + off;
  vec4 cc = mix(ch, ct, aCorner.x);
  gl_Position = vec4(p * cc.w, cc.z, cc.w);
  vColor = aColor; vEdge = aCorner;
}`;

const FRAG = /* glsl */ `
varying vec4 vColor; varying vec2 vEdge;
void main() {
  float across = 1.0 - abs(vEdge.y);
  float along = 1.0 - vEdge.x;
  float a = vColor.a * smoothstep(0.0, 0.45, across) * pow(along, 0.8);
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Streaks {
  readonly mesh: THREE.Mesh;
  /** Traços escritos na passada atual. */
  count = 0;
  private readonly head: THREE.BufferAttribute;
  private readonly tail: THREE.BufferAttribute;
  private readonly color: THREE.BufferAttribute;
  private readonly width: THREE.BufferAttribute;
  private readonly material: THREE.ShaderMaterial;

  constructor(readonly capacity: number) {
    const geo = new THREE.BufferGeometry();
    const verts = capacity * 4;
    this.head = new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.tail = new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.color = new THREE.BufferAttribute(new Float32Array(verts * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.width = new THREE.BufferAttribute(new Float32Array(verts), 1).setUsage(THREE.DynamicDrawUsage);
    // Cantos fixos: (0,−1) (0,+1) (1,−1) (1,+1) = cabeça de um lado, cabeça do outro, cauda, cauda; dois triângulos por traço.
    const corner = new Float32Array(verts * 2);
    const index = new Uint16Array(capacity * 6);
    for (let q = 0; q < capacity; q++) {
      corner.set([0, -1, 0, 1, 1, -1, 1, 1], q * 8);
      const v = q * 4;
      index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], q * 6);
    }
    geo.setAttribute('position', this.head);
    geo.setAttribute('aTail', this.tail);
    geo.setAttribute('aColor', this.color);
    geo.setAttribute('aWidth', this.width);
    geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      name: 'SpeedTcheStreaks', vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
    this.mesh.name = 'fx-streaks';
  }

  begin(): void { this.count = 0; }

  /** Um traço: cabeça (h*) e cauda (t*) em metros do referencial do viewport, largura (m), cor HDR e brilho. Falso se o lote está cheio. */
  add(hx: number, hy: number, hz: number, tx: number, ty: number, tz: number, width: number, r: number, g: number, b: number, a: number): boolean {
    if (this.count >= this.capacity) return false;
    const v0 = this.count * 4;
    for (let k = 0; k < 4; k++) {
      const v = v0 + k;
      this.head.setXYZ(v, hx, hy, hz);
      this.tail.setXYZ(v, tx, ty, tz);
      this.color.setXYZW(v, r, g, b, a);
      this.width.setX(v, width);
    }
    this.count++;
    return true;
  }

  /** Fecha a passada: o desenho cobre só o escrito, e só o escrito sobe para a GPU. */
  end(): void {
    const n = this.count;
    this.mesh.geometry.setDrawRange(0, n * 6);
    this.mesh.visible = n > 0;
    if (n === 0) return;
    for (const [attr, size] of [[this.head, 3], [this.tail, 3], [this.color, 4], [this.width, 1]] as const) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * 4 * size);
      attr.needsUpdate = true;
    }
  }

  dispose(): void { this.mesh.geometry.dispose(); this.material.dispose(); }
}
