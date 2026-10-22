// O pós-processamento de UM viewport (Média em diante): a cena num alvo de tamanho fixo (sub-retângulo da resolução dinâmica) →
// AO (Alta e Ultra) → bloom → desfoque radial (Alta e Ultra) → saída (tone mapping Neutral + gradação, sRGB) → FXAA (Média).
// Cada viewport tem o seu pipeline e ele é criado UMA vez: `setSize` redimensiona em lugar (alvos e passes), nunca recria. A Baixa não
// usa isto: desenha direto na tela, e o tone mapping é do material (stylize.ts).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { DITHER_GLSL, gradeUniforms } from '../stylize';
import { AoPass } from './ao';
import type { PostPlan } from './plan';
import { RadialBlurPass } from './radial';
import { SceneStage } from './stage';

/**
 * Teto do bloom (cor-brilho, docs/ondas/cor-brilho.md): a luminância que entra no borrão é limitada a `BLOOM_CEILING` × o limiar. O filtro de brilho
 * do three passa o texel HDR inteiro; um realce especular do farol no vidro de um carro (centenas de vezes o limiar, em poucos pixels) virava uma
 * nuvem branca sobre a pista no Cânion. Com o teto, ele brilha como uma lâmpada; o que fica perto do limiar (luminárias, neon, sol) não muda.
 */
export const BLOOM_CEILING = 2;

const HIGH_PASS_ANCHOR = 'gl_FragColor = mix( outputColor, texel, alpha );';

/** O filtro de brilho do three com o teto. Falha alto se o three mudar a linha (senão o remendo viraria no-op calado). */
export function patchBloomHighPass(fragment: string): string {
  if (!fragment.includes(HIGH_PASS_ANCHOR)) throw new Error('pipeline: o three mudou o LuminosityHighPassShader (âncora do teto do bloom não achada)');
  return fragment.replace(HIGH_PASS_ANCHOR, () => `texel.rgb *= min( 1.0, ( luminosityThreshold * ${BLOOM_CEILING.toFixed(1)} ) / max( v, 1e-4 ) );\n\t\t\t${HIGH_PASS_ANCHOR}`);
}

// ───────────────────────────── vinheta e dither na saída (V22/F7) ─────────────────────────────

/** A vinheta (escurecimento no canto, em luma de TELA: 0,11 = 11% mais escuro): o teto, e a conta que o shader repete. O diagnóstico (V22 §3.9): a bíblia prometia "vinheta leve" e não havia. */
export const VIGNETTE_MAX = 0.11;
/** Onde ela começa, em fração da distância do centro ao canto (0 no miolo, 1 no canto): nada até 45%. */
export const VIGNETTE_FROM = 0.45;

/** O escurecimento (0..`amount`) à fração `r` do centro ao canto: `smoothstep(FROM, 1, r)`, sem degrau. */
export function vignetteAt(r: number, amount: number = VIGNETTE_MAX): number {
  const t = Math.min(1, Math.max(0, (r - VIGNETTE_FROM) / (1 - VIGNETTE_FROM)));
  return amount * t * t * (3 - 2 * t);
}

const OUTPUT_DECL_ANCHOR = 'uniform sampler2D tDiffuse;';
const OUTPUT_COLOR_ANCHOR = '// color space';

/**
 * O fragmento do `OutputShader` do three com a vinheta e o dither entre o tone mapping e a conversão de cor (o pé de tudo: 0 passe a mais). O dither é ESTE, o único da Média em diante
 * (o domo do céu só o dá na Baixa, que não tem este passe). Falha alto se o three mudar as âncoras.
 */
export function patchOutputFragment(fragment: string): string {
  if (!fragment.includes(OUTPUT_DECL_ANCHOR) || !fragment.includes(OUTPUT_COLOR_ANCHOR)) throw new Error('pipeline: o three mudou o OutputShader (âncoras da vinheta e do dither não achadas)');
  return fragment
    .replace(OUTPUT_DECL_ANCHOR, () => `${OUTPUT_DECL_ANCHOR}\nuniform float uVignette;\n${DITHER_GLSL}`)
    .replace(OUTPUT_COLOR_ANCHOR, () => `// V22/F7: vinheta (luma de tela, o quadrado leva à luz linear) e o dither de 1 LSB
\t\t\t{
\t\t\t\tfloat vr = length( ( vUv - 0.5 ) * 2.0 ) * 0.70710678;
\t\t\t\tfloat vt = clamp( ( vr - ${VIGNETTE_FROM.toFixed(2)} ) / ${(1 - VIGNETTE_FROM).toFixed(2)}, 0.0, 1.0 );
\t\t\t\tfloat vv = 1.0 - uVignette * vt * vt * ( 3.0 - 2.0 * vt );
\t\t\t\tgl_FragColor.rgb *= vv * vv;
\t\t\t\tgl_FragColor.rgb = stylizeDither( gl_FragColor.rgb, gl_FragCoord.xy, 1.0 );
\t\t\t}

\t\t\t${OUTPUT_COLOR_ANCHOR}`);
}

/** O bloom com a cadeia começando em `scale` × ½ do alvo: 1 = a do `UnrealBloomPass`; 0,5 = bloom em meia resolução (a Média). Com teto (`BLOOM_CEILING`). */
class ScaledBloomPass extends UnrealBloomPass {
  constructor(private readonly scale: number, resolution: THREE.Vector2, strength: number, radius: number, threshold: number) {
    super(resolution, strength, radius, threshold);
    this.materialHighPassFilter.fragmentShader = patchBloomHighPass(this.materialHighPassFilter.fragmentShader);
    this.materialHighPassFilter.needsUpdate = true;
  }

  override setSize(width: number, height: number): void {
    super.setSize(width * this.scale, height * this.scale);
  }
}

/** O que o pipeline escreveu num quadro, para o `debugInfo` (o gate de contagem). */
export interface PipelineStats { targetW: number; targetH: number; samples: number; passes: number; postPx: number }

export interface FrameParams {
  camera: THREE.PerspectiveCamera;
  /** Escala da resolução dinâmica de cada lado (1 = cheio). */
  scale: number;
  /** Força do desfoque radial, 0..1. */
  radial: number;
  /** V22/F7: a vinheta deste viewport (`PostPlan.vignette`: o escurecimento no canto). */
  vignette: number;
}

export class ViewportPipeline {
  readonly composer: EffectComposer;
  readonly stage: SceneStage;
  readonly bloom: ScaledBloomPass | null;
  readonly ao: AoPass | null;
  readonly radial: RadialBlurPass | null;
  readonly output: OutputPass;
  readonly fxaa: FXAAPass | null;
  /** Tamanho em px (já com a densidade de pixels). */
  width = 1;
  height = 1;
  private readonly bloomValues: [number, number, number];

  /**
   * `plan` é o degrau (planFor): que passes existem é decidido AQUI, uma vez, e o AO e o radial só se ligam e desligam por quadro.
   * `aoPlan`: o plano do AO do degrau com o AO mais amplo que ele pode ter (Alta: meia resolução; Ultra: cheia).
   */
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, plan: PostPlan, aoPlan: PostPlan['ao'], bloom: [number, number, number]) {
    this.bloomValues = [...bloom];
    const buffer = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.composer = new EffectComposer(renderer, buffer);
    this.composer.setPixelRatio(1); // o pipeline já pensa em px: ver setSize
    this.stage = new SceneStage(scene, camera, { samples: plan.msaa, depth: aoPlan !== null });
    this.composer.addPass(this.stage);
    this.ao = aoPlan ? new AoPass(camera, aoPlan) : null;
    if (this.ao) this.composer.addPass(this.ao);
    this.bloom = plan.bloom
      ? new ScaledBloomPass(plan.bloom.scale, new THREE.Vector2(1, 1), bloom[0], bloom[1], bloom[2])
      : null;
    if (this.bloom) this.composer.addPass(this.bloom);
    this.radial = plan.radialBlur ? new RadialBlurPass() : null;
    if (this.radial) this.composer.addPass(this.radial);
    // O OutputPass faz o tone mapping aqui (o desenho foi a um alvo): os uniformes da gradação (L1) entram no material dele.
    this.output = new OutputPass();
    Object.assign(this.output.uniforms, gradeUniforms);
    // V22/F7: a vinheta e o dither entram no fragmento da saída (0 passe: o gate de passes não muda); `uVignette` é por quadro (a lotação muda o valor).
    this.output.uniforms.uVignette = { value: plan.vignette };
    this.output.material.fragmentShader = patchOutputFragment(this.output.material.fragmentShader);
    this.output.material.needsUpdate = true;
    this.composer.addPass(this.output);
    this.fxaa = plan.aa === 'fxaa' ? new FXAAPass() : null;
    if (this.fxaa) this.composer.addPass(this.fxaa);
  }

  /** Em px; redimensiona em lugar (alvos e passes) e só se o tamanho mudou. Devolve se mudou. */
  setSize(w: number, h: number): boolean {
    const pw = Math.max(1, Math.round(w)); const ph = Math.max(1, Math.round(h));
    if (pw === this.width && ph === this.height) return false;
    this.width = pw; this.height = ph;
    this.composer.setSize(pw, ph);
    return true;
  }

  setBloom(values: [number, number, number]): void {
    this.bloomValues[0] = values[0]; this.bloomValues[1] = values[1]; this.bloomValues[2] = values[2];
    if (this.bloom) { this.bloom.strength = values[0]; this.bloom.radius = values[1]; this.bloom.threshold = values[2]; }
  }

  /** A profundidade só existe se o AO ligado a pede (3 e 4 jogadores na Alta não têm AO: sem o custo de resolver a profundidade). */
  private syncDepth(aoOn: boolean): void {
    if (this.ao) this.stage.setDepth(aoOn);
  }

  render(p: FrameParams, aoOn: boolean): PipelineStats {
    this.stage.camera = p.camera;
    this.syncDepth(aoOn);
    this.stage.setRegion(this.width * p.scale, this.height * p.scale);
    if (this.ao) { this.ao.enabled = aoOn; this.ao.bind(p.camera, this.stage.depthTexture, this.stage.regionW, this.stage.regionH); }
    this.radial?.setStrength(p.radial);
    this.output.uniforms.uVignette.value = p.vignette;
    this.composer.render();
    return this.stats();
  }

  /** Pixels escritos pelos passes de pós neste quadro (o gate: `postPx`), com o que cada passe habilitado escreve. */
  private stats(): PipelineStats {
    const vp = this.width * this.height;
    let px = 0; let passes = 0;
    for (const pass of this.composer.passes) {
      if (!pass.enabled) continue;
      passes++;
      if (pass === this.stage) px += vp;
      else if (pass === this.ao) px += this.ao.lastPixels;
      else if (pass === this.bloom && this.bloom) {
        const b = this.bloom;
        px += b.renderTargetBright.width * b.renderTargetBright.height;
        for (const t of b.renderTargetsHorizontal) px += t.width * t.height;
        for (const t of b.renderTargetsVertical) px += t.width * t.height;
        px += vp; // a mistura aditiva no buffer cheio
      } else px += vp; // radial, saída e FXAA: um quadro cheio cada
    }
    return { targetW: this.stage.regionW, targetH: this.stage.regionH, samples: this.stage.samples, passes, postPx: px };
  }

  /**
   * O `EffectComposer.dispose()` do three só libera os dois alvos dele: o bloom (11 alvos e 9 materiais), o AO e os demais passes
   * ficavam na GPU a cada troca de qualidade (docs/DESEMPENHO.md, scripts/playtest-memoria.mjs). O dispose() do UnrealBloomPass (r186)
   * também esquece o material do filtro de brilho (`materialHighPassFilter`): liberado aqui.
   */
  dispose(): void {
    for (const pass of this.composer.passes) {
      pass.dispose();
      if (pass instanceof UnrealBloomPass) pass.materialHighPassFilter.dispose();
    }
    this.composer.dispose();
  }
}
