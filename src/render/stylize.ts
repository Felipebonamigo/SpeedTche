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
export const STYLIZE_KEY = 'speed-tche-stylize-v3'; // v2 (cor-brilho): a IBL difusa dessaturada por `uStylizeFill`; v3 (V4b): a luz ambiente cinza da pista
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
  /**
   * Quanto do pé do Neutral vale sobre a LUMINÂNCIA (0 = o pé do three, que subtrai o menor canal; 1 = o mesmo pé sem mudar o matiz). Cor-brilho: o pé do
   * three tirava o cinza dos escuros tingidos e o asfalto do entardecer, cinza-arroxeado (49,44,56), saía roxo (23,13,37). 0 de dia (Copacabana intacta).
   */
  toe: number;
  /** Saturação da luz difusa do céu (IBL do domo) nos materiais com luz: 1 = a do domo; menos = mais neutra. O reflexo do céu não muda. */
  fill: number;
  /**
   * V4b: a luz AMBIENTE (hemisférica + IBL do céu) só no material da pista. `mix` = quanto dela vira cinza: a luminância dela × `tint` (um tom quente, já com o
   * ganho); 1 de dia, 0 do entardecer em diante (a mesma `lateness` do resto). Sem isto o asfalto à sombra de dia saía azul-marinho (docs/ondas/V4b-sombra.md).
   */
  road: { tint: [number, number, number]; mix: number };
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
 * 0 de dia, 1 do entardecer em diante (cor-brilho): o que corrige o véu magenta só vale fora do dia, e anda contínuo na corrida que muda (M6) — a luz
 * cai de 1 a 0,7 na última volta e isto sobe junto, por uniforme.
 */
export function lateness(light: number): number { const t = clamp((0.98 - light) / 0.18, 0, 1); return t * t * (3 - 2 * t); }

/** Pé do Neutral sobre a luminância e saturação da IBL difusa no entardecer e na noite (provisórios, calibrados nas capturas da cor-brilho). */
const LATE_TOE = 0.5;
const LATE_FILL = 0.25;

/**
 * V4b, a luz ambiente da pista de dia (provisórios, calibrados nas capturas de Copacabana, Paraty, Fuji e Xingó e no modelo de `tests/cor-brilho.test.ts`).
 * O azul do asfalto à sombra vem de três lugares: a luz (hemisférica e IBL azuis), o pé do Neutral (zera o vermelho) e a tinta das sombras da gradação, que
 * empurra os escuros para o azul do céu em TODO material. Só a pista é tirada disso: o ambiente vira cinza e o tom dele sai da própria tinta das sombras ao
 * contrário (`ROAD_COUNTER` = quanto dela é desfeito, em gama), que é o que a gradação vai pôr de volta; `ROAD_GAIN` repõe a luminância que o pé do Neutral
 * tira de um escuro neutro (6,25·x² no cinza, contra o escuro azul que ele deixava passar).
 */
const ROAD_COUNTER = 2.5;
const ROAD_GAIN = 2.0;

/**
 * A gradação sai da paleta, então já varia por bioma e por período sem tabela: a sombra é puxada para a cor do céu que a pinta
 * (`hemiSky`: azul na costa de dia; quase neutra no entardecer e na noite desde a cor-brilho) e a luz para a do sol (`sunLight`). A exposição parte da da paleta (calibrada
 * para o ACES) com um ajuste da curva nova: valor provisório, calibrado nas capturas de Copacabana (dia) e Sampa (noite).
 */
export function gradingFor(p: Palette): Grading {
  const d = dayness(p);
  const late = lateness(p.light);
  const hemi = linear(p.hemiSky); const sun = linear(p.sunLight);
  // V10 (HC2): a tinta das sombras ganha um tom por período, somado ao do céu que as pinta (azul-quente de dia, magenta no entardecer, roxo à noite): o
  // Horizon Chase 2 pinta a sombra com cor, a nossa era cinza-azulada. Contínuo na `light` (a corrida que muda anda por aqui).
  const tone = shadowTone(d, late);
  const sh = hemi.map((v, i) => (v - mean(hemi)) * (0.08 + 0.12 * d) + tone[i]) as Rgb;
  // Cor-brilho: fora do dia o ganho quente das luzes cai (o sol do entardecer já é quente; somado, o carro branco ao sol saía pêssego).
  // V10: de dia o sol é mais quente (0,4 em vez de 0,22 do desvio da cor do sol).
  const hi = sun.map((v) => (v - mean(sun)) * (0.4 - 0.18 * late) * (1 - 0.4 * late)) as Rgb;
  const shadows = sh.map((v) => clamp(v, -0.14, 0.14)) as Rgb;
  const counter = shadows.map((v) => { const f = Math.max(0.2, 1 - ROAD_COUNTER * v); return f * f; }) as Rgb;
  const counterLum = 0.2126 * counter[0] + 0.7152 * counter[1] + 0.0722 * counter[2];
  return {
    toneMapping: TONE_MAP,
    exposure: p.exposure * EXPOSURE_TRIM * (1 + NIGHT_LIFT * clamp(1 - d / 0.56, 0, 1)), // V10: a noite sobe até 16% (entupia: 48% dos pixels de Sampa < 0,12)
    saturation: SATURATION_LATE + (SATURATION_DAY - SATURATION_LATE) * d,
    contrast: CONTRAST_NIGHT + (CONTRAST_DAY - CONTRAST_NIGHT) * d,
    shadows,
    highlights: hi.map((v) => clamp(v, -0.14, 0.14)) as Rgb,
    toe: LATE_TOE * late,
    fill: 1 - (1 - LATE_FILL) * late,
    road: { tint: counter.map((v) => (v / counterLum) * ROAD_GAIN) as Rgb, mix: 1 - late },
  };
}

/**
 * V10 (HC2), a gradação mais viva (provisórios, calibrados nas capturas e nas medidas de `tests/hc2-gl.test.ts`): saturação 0,18 (noite) → 0,24 (dia) e
 * contraste 0,10 (noite) → 0,18 (dia), eram 0,02–0,06 e 0,02–0,08. À noite o contraste é menor porque quase tudo já é escuro (mais contraste o afunda).
 */
const NIGHT_LIFT = 0.16;
const SATURATION_DAY = 0.24;
const SATURATION_LATE = 0.18;
const CONTRAST_DAY = 0.18;
const CONTRAST_NIGHT = 0.1;

/** O tom que cada período põe nas sombras (deltas em gama; somados ao do céu): dia azul-quente, entardecer magenta, noite roxo. `late` = `lateness`. */
function shadowTone(d: number, late: number): Rgb {
  const day: Rgb = [0.025, 0.0, 0.0]; const dusk: Rgb = [0.01, 0.0, 0.03]; const night: Rgb = [0.02, -0.012, 0.05];
  // dia → entardecer pela `lateness` (0 → 1); entardecer → noite pelo escurecer (a `dayness` cai de 0,56 a 0)
  const toNight = clamp(1 - d / 0.56, 0, 1);
  return lerp3(lerp3(day, dusk, late), night, toNight);
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
    : p.light >= 0.5 ? lerp3(linear(p.sunLight), linear('#ff8a5a'), 0.25) : hemi; // cor-brilho: era #ff3a5a a 0,5 (rosa) e tingia a lataria
  const termK = 0.22 + 0.18 * (1 - d) * (p.light >= 0.5 ? 1 : 0.3);
  return {
    rim: rimBase.map((v) => v * rimK) as Rgb,
    terminator: hue(termBase).map((v) => v * termK) as Rgb,
  };
}

// ───────────────────────────── Uniformes compartilhados ─────────────────────────────

const vec3 = (): { value: THREE.Vector3 } => ({ value: new THREE.Vector3() });

/** Só a gradação (o que o `OutputPass`, os `ShaderMaterial` e os `MeshBasic` recebem). `uGradeAdjust` = (saturação, contraste, pé sobre a luminância). */
export const gradeUniforms = { uGradeShadows: vec3(), uGradeHighlights: vec3(), uGradeAdjust: vec3() };
/**
 * Tudo o que um material com luz recebe: o mesmo objeto para todos (por referência). `uStylizeFill`: saturação da IBL difusa. O céu e o chão do período
 * (`uStylizeSky*`, `uStylizeGround`, lineares) são o reflexo do verniz dos carros (cor-brilho, cars/material.ts).
 */
export const stylizeUniforms = {
  uStylizeRim: vec3(), uStylizeTerm: vec3(), uStylizeFill: { value: 1 },
  uStylizeSkyTop: vec3(), uStylizeSkyHorizon: vec3(), uStylizeGround: vec3(),
  /** (tom quente da luz ambiente da pista × ganho, quanto dela vale: 0 = nada), só na família `road` (V4b). */
  uStylizeRoad: { value: new THREE.Vector4(1, 1, 1, 0) },
  ...gradeUniforms,
};

/** O que o verniz reflete (linear): o topo do céu, o horizonte (com um pouco do meio) e o chão escuro abaixo da linha do horizonte. */
export function varnishSky(p: Palette): { top: Rgb; horizon: Rgb; ground: Rgb } {
  const ground = lerp3(linear(p.hemiGround), linear(p.asphalt), 0.5).map((v) => v * 0.7) as Rgb;
  return { top: linear(p.sky[0]), horizon: lerp3(linear(p.sky[2]), linear(p.sky[1]), 0.3), ground };
}

/** Escreve a paleta atual nos uniformes e devolve a gradação (o renderer usa a `exposure`). Chamar a cada troca de pista/período. */
export function setStylizePalette(p: Palette): Grading {
  const g = gradingFor(p); const l = lightFor(p);
  stylizeUniforms.uStylizeRim.value.set(...l.rim);
  stylizeUniforms.uStylizeTerm.value.set(...l.terminator);
  gradeUniforms.uGradeShadows.value.set(...g.shadows);
  gradeUniforms.uGradeHighlights.value.set(...g.highlights);
  gradeUniforms.uGradeAdjust.value.set(g.saturation, g.contrast, g.toe);
  stylizeUniforms.uStylizeFill.value = g.fill;
  stylizeUniforms.uStylizeRoad.value.set(...g.road.tint, g.road.mix);
  const v = varnishSky(p);
  stylizeUniforms.uStylizeSkyTop.value.set(...v.top);
  stylizeUniforms.uStylizeSkyHorizon.value.set(...v.horizon);
  stylizeUniforms.uStylizeGround.value.set(...v.ground);
  return g;
}

// ───────────────────────────── Tone mapping Custom ─────────────────────────────

const TONE_ANCHOR = 'vec3 CustomToneMapping( vec3 color ) { return color; }';

const GRADE_GLSL = /* glsl */ `
uniform vec3 uGradeShadows;
uniform vec3 uGradeHighlights;
uniform vec3 uGradeAdjust;
// Gradação por período (uniformes em 0 = identidade): saturação, contraste, tinta nas sombras (nem no preto nem nas luzes) e ganho nas luzes, em ~gama 2.
vec3 stylizeGrade( vec3 c ) {
  vec3 g = sqrt( max( c, vec3( 0.0 ) ) );
  float l = dot( g, vec3( 0.2126, 0.7152, 0.0722 ) );
  g = mix( vec3( l ), g, 1.0 + uGradeAdjust.x );
  g = ( g - 0.45 ) * ( 1.0 + uGradeAdjust.y ) + 0.45;
  // A tinta das sombras some no preto (M2): somada em gama sem esse pé, o asfalto escuro virava azul-marinho puro (R = 0) com o céu azul de dia.
  g += uGradeShadows * smoothstep( 0.0, 0.22, l ) * ( 1.0 - smoothstep( 0.22, 0.6, l ) );
  g *= vec3( 1.0 ) + uGradeHighlights * smoothstep( 0.4, 1.0, l );
  g = clamp( g, 0.0, 1.0 );
  return g * g;
}
// O Khronos PBR Neutral do three, com o pé (escuros) aplicado à luminância na fração uGradeAdjust.z (cor-brilho): o pé do three subtrai o MENOR canal,
// o que tira o cinza de um escuro tingido e o deixa saturado (o asfalto do entardecer saía roxo). 0 = idêntico ao NeutralToneMapping do three.
vec3 stylizeNeutral( vec3 color ) {
  const float StartCompression = 0.8 - 0.04;
  const float Desaturation = 0.15;
  color *= toneMappingExposure;
  float x = min( color.r, min( color.g, color.b ) );
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  float lum = max( dot( color, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-6 );
  float lumOffset = lum < 0.08 ? lum - 6.25 * lum * lum : 0.04;
  color = mix( color - offset, color * max( 0.0, ( lum - lumOffset ) / lum ), uGradeAdjust.z );
  float peak = max( color.r, max( color.g, color.b ) );
  if ( peak < StartCompression ) return color;
  float d = 1. - StartCompression;
  float newPeak = 1. - d * d / ( peak + d - StartCompression );
  color *= newPeak / peak;
  float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
  return mix( color, vec3( newPeak ), g );
}
`;

/** O chunk do three com a `CustomToneMapping` trocada. Falha alto se o three mudar a linha (senão o remendo viraria no-op calado). */
export function patchToneMapping(chunk: string, kind: 'neutral' | 'agx'): string {
  if (!chunk.includes(TONE_ANCHOR)) throw new Error('stylize: o three mudou a CustomToneMapping do tonemapping_pars_fragment (âncora não achada)');
  const curve = kind === 'agx' ? 'AgXToneMapping' : 'stylizeNeutral';
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

/**
 * A luz difusa do céu (IBL do domo) perde saturação por `uStylizeFill` (cor-brilho): no entardecer o domo é rosa e magenta, e era ele a maior parcela da
 * luz na traseira do carro branco. Só o difuso: o reflexo (`radiance`) continua com a cor do céu.
 */
const FILL_GLSL = /* glsl */ `
#if defined( RE_IndirectDiffuse )
  iblIrradiance = mix( vec3( dot( iblIrradiance, vec3( 0.2126, 0.7152, 0.0722 ) ) ), iblIrradiance, uStylizeFill );
#endif
`;

/**
 * V4b, só na família da pista: a luz ambiente (hemisférica em `irradiance`, IBL em `iblIrradiance`, já com o `fill`) vira a luminância dela no tom quente
 * `uStylizeRoad.rgb`, na fração `uStylizeRoad.w` (0 = igual a antes). O sol (luz direta) e o reflexo do céu não mudam. O tom quente desfaz a tinta azul das
 * sombras da gradação, que só pesa nos ESCUROS: num albedo claro (a faixa branca, a zebra) o mesmo tom ficaria alaranjado, então o efeito cai com a luminância
 * do albedo (cheio no asfalto, ≤ 0,22; zero a partir de 0,5).
 */
const ROAD_GLSL = /* glsl */ `
/* STYLIZE_ROAD_CODE */
#if defined( RE_IndirectDiffuse )
{
  float rW = uStylizeRoad.w * ( 1.0 - smoothstep( 0.22, 0.5, dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ) );
  irradiance = mix( irradiance, vec3( dot( irradiance, vec3( 0.2126, 0.7152, 0.0722 ) ) ) * uStylizeRoad.rgb, rW );
  iblIrradiance = mix( iblIrradiance, vec3( dot( iblIrradiance, vec3( 0.2126, 0.7152, 0.0722 ) ) ) * uStylizeRoad.rgb, rW );
}
#endif
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
  const header = `#define STYLIZE_LIT 1\n#define STYLIZE_WRAP ${f.wrap.toFixed(3)}\n#define STYLIZE_TERM ${f.term.toFixed(3)}\n#define STYLIZE_RIM ${f.rim.toFixed(3)}\nuniform vec3 uStylizeRim;\nuniform vec3 uStylizeTerm;\nuniform float uStylizeFill;\n${family === 'road' ? 'uniform vec4 uStylizeRoad;\n' : ''}`;
  compose(material, (shader) => {
    Object.assign(shader.uniforms, stylizeUniforms);
    let frag = shader.fragmentShader.replace('#include <common>', () => `#include <common>\n${header}`);
    const chunk = lightsChunk();
    if (chunk) frag = frag.replace('#include <lights_physical_pars_fragment>', () => chunk);
    if (f.rim > 0) frag = frag.replace('#include <emissivemap_fragment>', () => `#include <emissivemap_fragment>\n${RIM_GLSL}`);
    frag = frag.replace('#include <lights_fragment_maps>', () => `#include <lights_fragment_maps>\n${FILL_GLSL}${family === 'road' ? ROAD_GLSL : ''}`);
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
