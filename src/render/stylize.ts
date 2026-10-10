// Estilização de luz e cor (onda L, L1; docs/DIRECAO-DE-ARTE.md §3, "Forma da luz"). Um ponto só de injeção, por
// `onBeforeCompile`, que COMPÕE com o que o material já tinha (o carro e o `scenery-haze` têm o deles): o callback e a chave de
// programa antigos continuam, e o trecho novo entra depois.
//   - Rampa de luz suave e contínua (difuso "enrolado": a luz passa um pouco do terminador, sem degrau de cel).
//   - Terminador tingido: na passagem da luz para a sombra entra a cor do bioma (calor no pôr do sol, azul-verde na mata).
//   - Luz de borda (rim): separa o objeto do fundo; só nas famílias com volume vertical (chão e pista ficariam brilhando no horizonte).
//   - Tone mapping Neutral (ou AgX) + gradação por bioma × período, como `CustomToneMapping` do three.
// Valores dos uniformes: 0 = identidade. Material que não recebeu os uniformes (a chama dos carros, as partículas) continua sem tinta,
// mas nunca quebra. Os dois caminhos de tone mapping (material na baixa e na média; `OutputPass` na alta) usam o MESMO chunk global
// `tonemapping_pars_fragment`, que `installToneMapping()` remenda uma vez.
import * as THREE from 'three';
import type { Palette } from './palette';

/** Quem recebe qual rampa e qual borda. `rim` 0 = sem o código da borda (a decisão é em JS: o GLSL não faz `#if` com float). */
export type StylizeFamily = 'ground' | 'road' | 'scenery' | 'facade' | 'car' | 'ghost';

export interface FamilyLook {
  /** Quanto da luz passa do terminador (difuso enrolado): 0 = Lambert puro. */
  wrap: number;
  /** Força da luz de borda (0 = nenhuma). */
  rim: number;
  /** Quanto do tom do terminador (0 = sem tinta). */
  term: number;
}

export const STYLIZE_FAMILIES: Readonly<Record<StylizeFamily, FamilyLook>> = {
  ground: { wrap: 0.3, rim: 0, term: 0.8 },
  road: { wrap: 0.2, rim: 0, term: 0.6 },
  scenery: { wrap: 0.35, rim: 0.55, term: 1 },
  facade: { wrap: 0.35, rim: 0.45, term: 1 },
  car: { wrap: 0.25, rim: 0.8, term: 1 },
  ghost: { wrap: 0.3, rim: 0, term: 0 },
};

/** Chave de programa: muda quando o texto do trecho muda (o three guarda o programa pela chave). */
export const STYLIZE_KEY = 'speed-tche-stylize-v1';
const GRADE_KEY = 'speed-tche-grade-v1';

/**
 * Curva de tone mapping. NEUTRAL (Khronos PBR Neutral) mantém o matiz e a saturação que a paleta escolheu até o ombro de ~0,76 e
 * só então comprime; o AgX desatura e acinzenta o que é pintado em cor chapada (escolha pelas capturas da L1, docs/VISUAL.md).
 */
export const TONE_MAP: 'neutral' | 'agx' = 'neutral';

/** Ajuste da exposição para a curva nova (o Neutral não "puxa" o meio-tom como o ACES). Provisório: capturas da L1. */
const EXPOSURE_TRIM = 1.2;

// ───────────────────────────── Gradação e luz por paleta (puro) ─────────────────────────────

export interface Grading {
  toneMapping: 'neutral' | 'agx';
  /** Exposição do renderer (já na curva nova). */
  exposure: number;
  /** Deltas em torno da identidade (0 = nada): saturação e contraste. */
  saturation: number;
  contrast: number;
  /** Tinta somada nas sombras e ganho nas luzes (RGB, deltas; 0 = nada). */
  shadows: [number, number, number];
  highlights: [number, number, number];
}

export interface LightLook {
  /** Cor da luz de borda (linear, já na força do período). */
  rim: [number, number, number];
  /** Cor do terminador (linear, já na força do período). */
  terminator: [number, number, number];
}

type Rgb = [number, number, number];

const linear = (hex: string): Rgb => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const mean = (c: Rgb): number => (c[0] + c[1] + c[2]) / 3;
const lerp3 = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** A cor com o maior canal em 1 (só o matiz e a saturação; a força vem depois). */
const hue = (c: Rgb): Rgb => { const m = Math.max(c[0], c[1], c[2], 1e-6); return [c[0] / m, c[1] / m, c[2] / m]; };

/** 0 = noite, 1 = dia (a `light` da paleta: 0,32 · 0,7 · 1). */
const dayness = (p: Palette): number => clamp((p.light - 0.32) / 0.68, 0, 1);

/**
 * A gradação sai da paleta, então já varia por bioma e por período sem tabela: a sombra é puxada para a cor do céu que a pinta
 * (`hemiSky`, azul na costa, roxo no entardecer) e a luz para a do sol (`sunLight`). A exposição parte da da paleta (calibrada
 * para o ACES) com um ajuste da curva nova: valor provisório, calibrado nas capturas de Copacabana (dia) e Sampa (noite).
 */
export function gradingFor(p: Palette): Grading {
  const d = dayness(p);
  const hemi = linear(p.hemiSky); const sun = linear(p.sunLight);
  const sh = hemi.map((v) => (v - mean(hemi)) * (0.08 + 0.12 * d)) as Rgb;
  const hi = sun.map((v) => (v - mean(sun)) * 0.22) as Rgb;
  return {
    toneMapping: TONE_MAP,
    exposure: p.exposure * EXPOSURE_TRIM,
    saturation: 0.02 + 0.04 * d,
    contrast: 0.02 + 0.06 * d,
    shadows: sh.map((v) => clamp(v, -0.1, 0.1)) as Rgb,
    highlights: hi.map((v) => clamp(v, -0.1, 0.1)) as Rgb,
  };
}

/**
 * Luz de borda e terminador por período, da cor da paleta: a borda é o céu (do pôr do sol, o brilho dele); o terminador
 * mistura o céu que pinta a sombra com o chão do bioma de dia (azul-verde na mata), esquenta no entardecer e fica azul à noite.
 */
export function lightFor(p: Palette): LightLook {
  const d = dayness(p);
  const hemi = linear(p.hemiSky);
  const rimBase = p.light < 0.8 ? lerp3(hemi, linear(p.skyGlow), 0.7) : lerp3(hemi, [1, 1, 1], 0.4);
  const rimK = p.light < 0.5 ? 0.3 : p.light < 0.8 ? 0.45 : 0.32;
  const termBase = p.light >= 0.8 ? lerp3(hemi, linear(p.groundLow), 0.5)
    : p.light >= 0.5 ? lerp3(linear(p.sunLight), linear('#ff3a5a'), 0.5) : hemi;
  const termK = 0.22 + 0.18 * (1 - d) * (p.light >= 0.5 ? 1 : 0.3);
  return {
    rim: rimBase.map((v) => v * rimK) as Rgb,
    terminator: hue(termBase).map((v) => v * termK) as Rgb,
  };
}

// ───────────────────────────── Uniformes compartilhados ─────────────────────────────

const vec3 = (): { value: THREE.Vector3 } => ({ value: new THREE.Vector3() });

/** Só a gradação (o que o `OutputPass`, os `ShaderMaterial` e os `MeshBasic` recebem). */
export const gradeUniforms = { uGradeShadows: vec3(), uGradeHighlights: vec3(), uGradeAdjust: vec3() };
/** Tudo o que um material com luz recebe: o mesmo objeto para todos (por referência). */
export const stylizeUniforms = { uStylizeRim: vec3(), uStylizeTerm: vec3(), ...gradeUniforms };

/** Escreve a paleta atual nos uniformes e devolve a gradação (o renderer usa a `exposure`). Chamar a cada troca de pista/período. */
export function setStylizePalette(p: Palette): Grading {
  const g = gradingFor(p); const l = lightFor(p);
  stylizeUniforms.uStylizeRim.value.set(...l.rim);
  stylizeUniforms.uStylizeTerm.value.set(...l.terminator);
  gradeUniforms.uGradeShadows.value.set(...g.shadows);
  gradeUniforms.uGradeHighlights.value.set(...g.highlights);
  gradeUniforms.uGradeAdjust.value.set(g.saturation, g.contrast, 0);
  return g;
}

// ───────────────────────────── Tone mapping Custom ─────────────────────────────

const TONE_ANCHOR = 'vec3 CustomToneMapping( vec3 color ) { return color; }';

const GRADE_GLSL = /* glsl */ `
uniform vec3 uGradeShadows;
uniform vec3 uGradeHighlights;
uniform vec3 uGradeAdjust;
// Gradação por período (uniformes em 0 = identidade): saturação, contraste, tinta nas sombras e ganho nas luzes, em ~gama 2.
vec3 stylizeGrade( vec3 c ) {
  vec3 g = sqrt( max( c, vec3( 0.0 ) ) );
  float l = dot( g, vec3( 0.2126, 0.7152, 0.0722 ) );
  g = mix( vec3( l ), g, 1.0 + uGradeAdjust.x );
  g = ( g - 0.45 ) * ( 1.0 + uGradeAdjust.y ) + 0.45;
  g += uGradeShadows * ( 1.0 - smoothstep( 0.0, 0.6, l ) );
  g *= vec3( 1.0 ) + uGradeHighlights * smoothstep( 0.4, 1.0, l );
  g = clamp( g, 0.0, 1.0 );
  return g * g;
}
`;

/** O chunk do three com a `CustomToneMapping` trocada. Falha alto se o three mudar a linha (senão o remendo viraria no-op calado). */
export function patchToneMapping(chunk: string, kind: 'neutral' | 'agx'): string {
  if (!chunk.includes(TONE_ANCHOR)) throw new Error('stylize: o three mudou a CustomToneMapping do tonemapping_pars_fragment (âncora não achada)');
  const curve = kind === 'agx' ? 'AgXToneMapping' : 'NeutralToneMapping';
  return chunk.replace(TONE_ANCHOR, () => `${GRADE_GLSL}vec3 CustomToneMapping( vec3 color ) { return stylizeGrade( ${curve}( color ) ); }`);
}

/** Remenda o chunk global uma vez (idempotente). O renderer chama antes do primeiro quadro e usa `THREE.CustomToneMapping`. */
export function installToneMapping(kind: 'neutral' | 'agx' = TONE_MAP): void {
  if (THREE.ShaderChunk.tonemapping_pars_fragment.includes('stylizeGrade')) return;
  THREE.ShaderChunk.tonemapping_pars_fragment = patchToneMapping(THREE.ShaderChunk.tonemapping_pars_fragment, kind);
}

// ───────────────────────────── O trecho de luz ─────────────────────────────

const LIGHTS_FN = 'void RE_Direct_Physical(';
const LIGHTS_DIFFUSE = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';

const DIRECT_GLSL = /* glsl */ `
// Luz direta em rampa suave e contínua e o terminador tingido (a faixa de passagem luz → sombra leva uStylizeTerm; zero = sem
// tinta). Sem degrau: abaixo de ~0,2 de N·L vale o difuso "enrolado" com pé suave (a sombra recebe um pouco de luz, não é preta);
// acima de ~0,8 volta ao Lambert (o lado iluminado não clareia). A sombra projetada continua zerando a cor da luz.
vec3 stylizeDirect( const in vec3 lightColor, const in vec3 L, const in vec3 N, const in vec3 albedo ) {
  float d = dot( N, L );
  float x = clamp( ( d + STYLIZE_WRAP ) / ( 1.0 + STYLIZE_WRAP ), 0.0, 1.0 );
  float ramp = mix( x * x * ( 3.0 - 2.0 * x ), max( d, 0.0 ), smoothstep( 0.2, 0.8, d ) );
  float band = smoothstep( 0.0, 0.35, x ) * ( 1.0 - smoothstep( 0.35, 0.8, x ) );
  return lightColor * ( vec3( ramp ) + uStylizeTerm * ( STYLIZE_TERM * band ) ) * BRDF_Lambert( albedo );
}
`;

/** O `lights_physical_pars_fragment` do three com a rampa no lugar do `dotNL` do difuso. Falha alto se o three mudar as âncoras. */
export function patchLightsChunk(chunk: string): string {
  if (!chunk.includes(LIGHTS_FN) || !chunk.includes(LIGHTS_DIFFUSE)) {
    throw new Error('stylize: o three mudou o RE_Direct_Physical (linha do reflectedLight.directDiffuse não achada)');
  }
  return chunk
    .replace(LIGHTS_FN, () => DIRECT_GLSL + LIGHTS_FN)
    .replace(LIGHTS_DIFFUSE, () => 'reflectedLight.directDiffuse += stylizeDirect( directLight.color, directLight.direction, geometryNormal, material.diffuseContribution ) * ( 1.0 - F );');
}

/** Luz de borda: fresnel × "olhando para cima" (o céu está em cima), na cor do período, um pouco tingida pelo albedo. */
const RIM_GLSL = /* glsl */ `
/* STYLIZE_RIM_CODE */
{
  float sNV = clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
  float sUp = dot( normal, normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) ) * 0.5 + 0.5;
  float sRim = pow( 1.0 - sNV, 3.0 ) * mix( 0.5, 1.0, sUp );
  totalEmissiveRadiance += uStylizeRim * ( sRim * STYLIZE_RIM ) * mix( vec3( 1.0 ), diffuseColor.rgb, 0.5 );
}
`;

let patchedLights: string | null | undefined;
let warned = false;

function lightsChunk(): string | null {
  if (patchedLights !== undefined) return patchedLights;
  try {
    patchedLights = patchLightsChunk(THREE.ShaderChunk.lights_physical_pars_fragment);
  } catch (e) {
    patchedLights = null;
    if (!warned) { warned = true; console.warn(String(e)); } // nunca derruba o jogo por causa de um remendo visual
  }
  return patchedLights;
}

const applied = new WeakSet<THREE.Material>();

/** Guarda o callback e a chave de programa que o material tem agora e os põe de volta compostos com `inject` e `suffix`. */
function compose(material: THREE.Material, inject: (shader: THREE.WebGLProgramParametersWithUniforms) => void, suffix: string): void {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  // Sem chave própria, a do three é o texto do `onBeforeCompile`: congela agora, antes de ele virar o nosso (senão todo material
  // estilizado teria a mesma chave).
  const own = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey');
  const frozen = own ? null : material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => { prev.call(material, shader, renderer); inject(shader); };
  material.customProgramCacheKey = () => `${frozen ?? prevKey.call(material)}|${suffix}`;
}

/**
 * Põe a rampa, o terminador e (nas famílias que têm) a luz de borda num material com luz (`MeshStandard`/`MeshPhysical`).
 * Chamar DEPOIS de o material pôr o `onBeforeCompile` e a `customProgramCacheKey` dele: os dois são compostos, não trocados.
 */
export function applyStylize(material: THREE.Material, family: StylizeFamily): void {
  if (applied.has(material)) return;
  applied.add(material);
  const f = STYLIZE_FAMILIES[family];
  const header = `#define STYLIZE_LIT 1\n#define STYLIZE_WRAP ${f.wrap.toFixed(3)}\n#define STYLIZE_TERM ${f.term.toFixed(3)}\n#define STYLIZE_RIM ${f.rim.toFixed(3)}\nuniform vec3 uStylizeRim;\nuniform vec3 uStylizeTerm;\n`;
  compose(material, (shader) => {
    Object.assign(shader.uniforms, stylizeUniforms);
    let frag = shader.fragmentShader.replace('#include <common>', () => `#include <common>\n${header}`);
    const chunk = lightsChunk();
    if (chunk) frag = frag.replace('#include <lights_physical_pars_fragment>', () => chunk);
    if (f.rim > 0) frag = frag.replace('#include <emissivemap_fragment>', () => `#include <emissivemap_fragment>\n${RIM_GLSL}`);
    shader.fragmentShader = frag;
  }, `${STYLIZE_KEY}:${family}`);
}

/**
 * Só a gradação, para o que não tem luz: `ShaderMaterial` (os uniformes entram no próprio material) e `MeshBasic`/`Points`
 * (entram no `onBeforeCompile`, composto). Sem isto o material sai do tone mapping Custom sem a tinta do período.
 */
export function applyGrade(material: THREE.Material): void {
  if (applied.has(material)) return;
  applied.add(material);
  if ((material as THREE.ShaderMaterial).isShaderMaterial) {
    Object.assign((material as THREE.ShaderMaterial).uniforms, gradeUniforms);
    return;
  }
  compose(material, (shader) => { Object.assign(shader.uniforms, gradeUniforms); }, GRADE_KEY);
}
