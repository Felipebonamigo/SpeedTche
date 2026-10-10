// Desfoque radial (Alta e Ultra): puxa a imagem para fora do ponto de fuga quando o carro passa de 85% da velocidade ou está no nitro
// (força: `radialBlurStrength`, plan.ts). Passe de tela cheia sobre o HDR, ANTES da saída; com força zero o passe é desligado (custo zero).
// O miolo da imagem (onde está o carro, abaixo do centro) fica nítido: a máscara só começa a uns 25% do centro.
import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

export const RADIAL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

export const RADIAL_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uStrength;   // 0..1
uniform vec2 uCenter;      // ponto de fuga em UV
uniform float uAspect;     // largura / altura do viewport
varying vec2 vUv;
const int TAPS = 8;
void main() {
  vec2 d = vUv - uCenter;
  float r = length(d * vec2(uAspect, 1.0));
  // Nada no miolo; cheio perto da borda.
  float mask = smoothstep(0.3, 0.9, r);
  float k = uStrength * mask * 0.05;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < TAPS; i++) {
    float t = float(i) / float(TAPS - 1);
    acc += texture2D(tDiffuse, vUv - d * k * t).rgb;
  }
  gl_FragColor = vec4(acc / float(TAPS), 1.0);
}`;

export class RadialBlurPass extends Pass {
  readonly material: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private aspect = 16 / 9;

  constructor() {
    super();
    this.needsSwap = true;
    this.material = new THREE.ShaderMaterial({
      name: 'SpeedTcheRadialBlur',
      vertexShader: RADIAL_VERT, fragmentShader: RADIAL_FRAG,
      depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: { tDiffuse: { value: null }, uStrength: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: 16 / 9 } },
    });
    this.quad = new FullScreenQuad(this.material);
  }

  /** Força 0..1; o passe só roda acima de um mínimo. */
  setStrength(s: number): void {
    this.material.uniforms.uStrength.value = s;
    this.enabled = s > 0.01;
  }

  override setSize(width: number, height: number): void {
    this.aspect = width / Math.max(1, height);
    this.material.uniforms.uAspect.value = this.aspect;
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void { this.material.dispose(); this.quad.dispose(); }
}
