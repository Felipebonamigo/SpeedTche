// Oclusão de ambiente GTAO (Alta em meia resolução, Ultra em resolução cheia). Usa os SHADERS do GTAO e do desfoque de Poisson do
// three (`three/examples/jsm/shaders`), mas NÃO o `GTAOPass` dele: aquele desenha a cena inteira de novo (passe de normais) e quebra com
// profundidade externa. Aqui a profundidade é a do próprio alvo da cena (`SceneStage`), as normais saem dela (NORMAL_VECTOR_TYPE 0) e
// nenhuma geometria é desenhada de novo.
//
// A profundidade tem tamanho fixo e a cena só ocupa um sub-retângulo dela (resolução dinâmica): os dois shaders ganham `uDepthRegion`
// (px do sub-retângulo) e leem a profundidade em UV escalada e presa ao sub-retângulo. O remendo troca trechos do GLSL do three por
// texto exato e FALHA ALTO se o three mudar o trecho (como o `installToneMapping` da L1): um remendo que não pega não passa calado.
import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { generateMagicSquareNoise, GTAOBlendShader, GTAOShader } from 'three/examples/jsm/shaders/GTAOShader.js';
import { PoissonDenoiseShader } from 'three/examples/jsm/shaders/PoissonDenoiseShader.js';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import type { AoPlan } from './plan';

/** Troca `from` por `to` no GLSL; lança se `from` não existe (o three mudou o shader). */
export function patchOnce(source: string, from: string, to: string, what: string): string {
  if (!source.includes(from)) throw new Error(`postfx/ao: o trecho "${what}" do shader do three mudou; o remendo da resolução dinâmica precisa ser refeito`);
  return source.split(from).join(to);
}

/** GLSL do GTAO com a profundidade lida só dentro do sub-retângulo `uDepthRegion` do alvo. */
export function patchGtaoFragment(src: string): string {
  let s = src;
  s = patchOnce(s, 'uniform highp sampler2D tDepth;', 'uniform highp sampler2D tDepth;\n\t\tuniform vec2 uDepthRegion;', 'declaração de tDepth');
  s = patchOnce(s, 'return textureLod(tDepth, uv.xy, 0.0).DEPTH_SWIZZLING;',
    'vec2 dsz = vec2(textureSize(tDepth, 0)); vec2 dscale = uDepthRegion / dsz; return textureLod(tDepth, clamp(uv.xy * dscale, 0.5 / dsz, dscale - 0.5 / dsz), 0.0).DEPTH_SWIZZLING;', 'getDepth');
  s = patchOnce(s, 'return texelFetch(tDepth, uv.xy, 0).DEPTH_SWIZZLING;',
    'return texelFetch(tDepth, clamp(uv.xy, ivec2(0), ivec2(uDepthRegion) - 1), 0).DEPTH_SWIZZLING;', 'fetchDepth');
  s = patchOnce(s, 'vec2 size = vec2(textureSize(tDepth, 0));', 'vec2 size = uDepthRegion;', 'tamanho em computeNormalFromDepth');
  return s;
}

/** O mesmo para o desfoque de Poisson. */
export function patchDenoiseFragment(src: string): string {
  let s = src;
  s = patchOnce(s, 'uniform sampler2D tDepth;', 'uniform sampler2D tDepth;\n\t\tuniform vec2 uDepthRegion;', 'declaração de tDepth');
  s = patchOnce(s, 'return textureLod(tDepth, uv.xy, 0.0).r;',
    'vec2 dsz = vec2(textureSize(tDepth, 0)); vec2 dscale = uDepthRegion / dsz; return textureLod(tDepth, clamp(uv.xy * dscale, 0.5 / dsz, dscale - 0.5 / dsz), 0.0).r;', 'getDepth');
  s = patchOnce(s, 'return texelFetch(tDepth, uv.xy, 0).r;',
    'return texelFetch(tDepth, clamp(uv.xy, ivec2(0), ivec2(uDepthRegion) - 1), 0).r;', 'fetchDepth');
  s = patchOnce(s, 'vec2 size = vec2(textureSize(tDepth, 0));', 'vec2 size = uDepthRegion;', 'tamanho em computeNormalFromDepth');
  return s;
}

function pdNoise(size = 64): THREE.DataTexture {
  const simplex = new SimplexNoise();
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
    const k = (i * size + j) * 4;
    data[k] = (simplex.noise(i, j) * 0.5 + 0.5) * 255;
    data[k + 1] = (simplex.noise(i + size, j) * 0.5 + 0.5) * 255;
    data[k + 2] = (simplex.noise(i, j + size) * 0.5 + 0.5) * 255;
    data[k + 3] = (simplex.noise(i + size, j + size) * 0.5 + 0.5) * 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** Quanto o AO escurece (1 = o do GTAO; o cartum pede mais leve). */
const BLEND_INTENSITY = 0.85;

export class AoPass extends Pass {
  private readonly gtao: THREE.ShaderMaterial;
  private readonly denoise: THREE.ShaderMaterial;
  private readonly blend: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly gtaoNoise = generateMagicSquareNoise();
  private readonly pdNoiseTex = pdNoise();
  private readonly aoTarget: THREE.WebGLRenderTarget;
  private readonly pdTarget: THREE.WebGLRenderTarget;
  private camera: THREE.PerspectiveCamera;
  private depth: THREE.DepthTexture | null = null;
  private fullW = 1;
  private fullH = 1;
  /** Pixels que o AO escreveu no último quadro (os dois alvos + a mistura no buffer cheio): para o gate. */
  lastPixels = 0;

  constructor(camera: THREE.PerspectiveCamera, private readonly plan: AoPlan) {
    super();
    this.camera = camera;
    this.needsSwap = false; // multiplica em cima do buffer de leitura
    this.aoTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.pdTarget = this.aoTarget.clone();
    this.gtao = new THREE.ShaderMaterial({
      name: 'SpeedTcheGTAO',
      defines: { ...GTAOShader.defines, NORMAL_VECTOR_TYPE: 0, DEPTH_SWIZZLING: 'x', SAMPLES: plan.samples, PERSPECTIVE_CAMERA: 1 },
      uniforms: { ...THREE.UniformsUtils.clone(GTAOShader.uniforms), uDepthRegion: { value: new THREE.Vector2(1, 1) } },
      vertexShader: GTAOShader.vertexShader, fragmentShader: patchGtaoFragment(GTAOShader.fragmentShader),
      blending: THREE.NoBlending, depthTest: false, depthWrite: false,
    });
    this.gtao.uniforms.tNoise.value = this.gtaoNoise;
    this.gtao.uniforms.radius.value = plan.radius;
    this.denoise = new THREE.ShaderMaterial({
      name: 'SpeedTcheAoDenoise',
      defines: { ...PoissonDenoiseShader.defines, NORMAL_VECTOR_TYPE: 0, DEPTH_VALUE_SOURCE: 0 },
      uniforms: { ...THREE.UniformsUtils.clone(PoissonDenoiseShader.uniforms), uDepthRegion: { value: new THREE.Vector2(1, 1) } },
      vertexShader: PoissonDenoiseShader.vertexShader, fragmentShader: patchDenoiseFragment(PoissonDenoiseShader.fragmentShader),
      depthTest: false, depthWrite: false,
    });
    this.denoise.uniforms.tDiffuse.value = this.aoTarget.texture;
    this.denoise.uniforms.tNoise.value = this.pdNoiseTex;
    this.denoise.uniforms.lumaPhi.value = 10;
    this.denoise.uniforms.depthPhi.value = 2;
    this.denoise.uniforms.normalPhi.value = 3;
    this.denoise.uniforms.radius.value = 8;
    // A mistura multiplica o AO na cena (como o `blendMaterial` do GTAOPass): resultado = AO × cor.
    this.blend = new THREE.ShaderMaterial({
      name: 'SpeedTcheAoBlend',
      uniforms: THREE.UniformsUtils.clone(GTAOBlendShader.uniforms),
      vertexShader: GTAOBlendShader.vertexShader, fragmentShader: GTAOBlendShader.fragmentShader,
      transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor, blendEquation: THREE.AddEquation,
      blendSrcAlpha: THREE.DstAlphaFactor, blendDstAlpha: THREE.ZeroFactor, blendEquationAlpha: THREE.AddEquation,
    });
    this.blend.uniforms.intensity.value = BLEND_INTENSITY;
    this.quad = new FullScreenQuad(this.gtao);
  }

  /** A câmera do viewport e a profundidade do alvo da cena (com o sub-retângulo desenhado, em px) deste quadro. */
  bind(camera: THREE.PerspectiveCamera, depth: THREE.DepthTexture | null, regionW: number, regionH: number): void {
    this.camera = camera;
    this.depth = depth;
    (this.gtao.uniforms.uDepthRegion.value as THREE.Vector2).set(regionW, regionH);
    (this.denoise.uniforms.uDepthRegion.value as THREE.Vector2).set(regionW, regionH);
  }

  override setSize(width: number, height: number): void {
    this.fullW = Math.max(1, Math.round(width)); this.fullH = Math.max(1, Math.round(height));
    const w = Math.max(1, Math.round(this.fullW * this.plan.scale)); const h = Math.max(1, Math.round(this.fullH * this.plan.scale));
    this.aoTarget.setSize(w, h); this.pdTarget.setSize(w, h);
    this.gtao.uniforms.resolution.value.set(w, h);
    this.denoise.uniforms.resolution.value.set(w, h);
  }

  override render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    if (!this.depth) { this.lastPixels = 0; return; }
    const cam = this.camera;
    const g = this.gtao.uniforms;
    g.tDepth.value = this.depth;
    g.cameraNear.value = cam.near; g.cameraFar.value = cam.far;
    g.cameraProjectionMatrix.value.copy(cam.projectionMatrix);
    g.cameraProjectionMatrixInverse.value.copy(cam.projectionMatrixInverse);
    g.cameraWorldMatrix.value.copy(cam.matrixWorld);
    const d = this.denoise.uniforms;
    d.tDepth.value = this.depth;
    d.cameraProjectionMatrixInverse.value.copy(cam.projectionMatrixInverse);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    const clearColor = new THREE.Color(); renderer.getClearColor(clearColor); const clearAlpha = renderer.getClearAlpha();
    // 1. AO (limpo a branco: o céu e o que o shader descarta ficam sem oclusão).
    this.pass(renderer, this.gtao, this.aoTarget, true);
    // 2. Desfoque de Poisson, 3. multiplica na cena.
    this.pass(renderer, this.denoise, this.pdTarget, true);
    this.blend.uniforms.tDiffuse.value = this.pdTarget.texture;
    this.pass(renderer, this.blend, readBuffer, false);
    renderer.setClearColor(clearColor, clearAlpha);
    renderer.autoClear = autoClear;
    this.lastPixels = this.aoTarget.width * this.aoTarget.height + this.pdTarget.width * this.pdTarget.height + readBuffer.width * readBuffer.height;
  }

  private pass(renderer: THREE.WebGLRenderer, material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget, clearWhite: boolean): void {
    renderer.setRenderTarget(target);
    if (clearWhite) { renderer.setClearColor(0xffffff, 1); renderer.clear(); }
    this.quad.material = material;
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.aoTarget.dispose(); this.pdTarget.dispose();
    this.gtaoNoise.dispose(); this.pdNoiseTex.dispose();
    this.gtao.dispose(); this.denoise.dispose(); this.blend.dispose();
    this.quad.dispose();
  }
}
