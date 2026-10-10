// O primeiro passe de cada viewport (Média em diante): desenha a CENA num alvo próprio de tamanho FIXO (o do viewport, com MSAA e,
// se há AO, com textura de profundidade) usando só um sub-retângulo dele — a resolução dinâmica —, e "resolve" esse sub-retângulo,
// esticado com filtro bilinear, para o buffer do composer em tamanho cheio. Daqui para a frente (AO, bloom, saída, FXAA) tudo é do
// tamanho cheio do viewport: trocar de degrau da resolução dinâmica não recria nem redimensiona nada, só muda `region`.
import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

const RESOLVE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// O sub-retângulo começa em (0,0): a UV do viewport inteiro (0..1) vira 0..uRegion no alvo, presa a meio texel da borda (senão o filtro
// bilinear sangra o que sobrou de um quadro maior).
const RESOLVE_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uRegion;
uniform vec2 uHalfTexel;
varying vec2 vUv;
void main() {
  vec2 uv = clamp(vUv * uRegion, uHalfTexel, uRegion - uHalfTexel);
  gl_FragColor = texture2D(tScene, uv);
}`;

export interface StageOptions {
  /** Amostras do MSAA do alvo da cena (0 = sem). */
  samples: 0 | 4;
  /** Com textura de profundidade (o AO lê dela). */
  depth: boolean;
}

export class SceneStage extends Pass {
  camera: THREE.Camera;
  /** O alvo da cena (tamanho fixo do viewport). */
  target: THREE.WebGLRenderTarget;
  /** Quanto do alvo é desenhado, em px (a resolução dinâmica); cheio por padrão. */
  regionW = 1;
  regionH = 1;
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private opts: StageOptions;
  private w = 1;
  private h = 1;

  constructor(private readonly scene: THREE.Scene, camera: THREE.Camera, opts: StageOptions) {
    super();
    this.camera = camera;
    this.opts = opts;
    this.needsSwap = false; // como o RenderPass: escreve no readBuffer, que é o que o próximo passe lê
    this.target = this.makeTarget(1, 1);
    this.material = new THREE.ShaderMaterial({
      name: 'SpeedTcheSceneResolve',
      vertexShader: RESOLVE_VERT, fragmentShader: RESOLVE_FRAG,
      depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: { tScene: { value: null }, uRegion: { value: new THREE.Vector2(1, 1) }, uHalfTexel: { value: new THREE.Vector2(0, 0) } },
    });
    this.quad = new FullScreenQuad(this.material);
  }

  private makeTarget(w: number, h: number): THREE.WebGLRenderTarget {
    const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.opts.samples });
    t.texture.name = 'SpeedTche.scene';
    if (this.opts.depth) {
      const d = new THREE.DepthTexture(w, h);
      d.format = THREE.DepthFormat; d.type = THREE.UnsignedIntType;
      d.minFilter = THREE.NearestFilter; d.magFilter = THREE.NearestFilter;
      t.depthTexture = d;
    }
    t.scissorTest = true; // limpa e desenha só o sub-retângulo
    return t;
  }

  /** A profundidade só existe quando o AO a pede; mudar isso refaz o alvo da cena (e só ele). */
  setDepth(on: boolean): boolean {
    if (this.opts.depth === on) return false;
    this.opts = { ...this.opts, depth: on };
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.target = this.makeTarget(this.w, this.h);
    return true;
  }

  get depthTexture(): THREE.DepthTexture | null { return this.target.depthTexture; }
  get samples(): number { return this.opts.samples; }
  get size(): { w: number; h: number } { return { w: this.w, h: this.h }; }

  override setSize(width: number, height: number): void {
    this.w = Math.max(1, Math.round(width)); this.h = Math.max(1, Math.round(height));
    this.target.setSize(this.w, this.h);
    this.regionW = this.w; this.regionH = this.h;
  }

  /** Em px; preso a 1..tamanho do alvo. */
  setRegion(w: number, h: number): void {
    this.regionW = Math.max(1, Math.min(this.w, Math.round(w)));
    this.regionH = Math.max(1, Math.min(this.h, Math.round(h)));
  }

  override render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const t = this.target;
    t.viewport.set(0, 0, this.regionW, this.regionH);
    t.scissor.set(0, 0, this.regionW, this.regionH);
    renderer.setRenderTarget(t);
    // O `autoClear` do renderer limpa antes de desenhar; o scissor do alvo prende a limpeza ao sub-retângulo.
    renderer.render(this.scene, this.camera);
    // O resolve: o sub-retângulo (esticado) vira o buffer do composer, cheio.
    const u = this.material.uniforms;
    u.tScene.value = t.texture;
    (u.uRegion.value as THREE.Vector2).set(this.regionW / this.w, this.regionH / this.h);
    (u.uHalfTexel.value as THREE.Vector2).set(0.5 / this.w, 0.5 / this.h);
    renderer.setRenderTarget(readBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
