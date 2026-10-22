// Terreno: duas faixas (uma por lado) que seguem o RoadFrame. Perto da pista o chão fica na
// altura do asfalto (o cenário é posto ali); longe, desce para o fundo do vale (a pista alta
// de montanha olha o vale lá embaixo) e sobe em relevo por bioma. Cor por altura e inclinação
// (prado → mata → rocha → neve; areia → rocha vermelha; praia → penhasco), com a faixa de
// transição (terra, areia, calçada) junto do acostamento. Altura e cor dependem só do índice
// do segmento: vão para uma tabela por pista e o quadro só copia (barato com 4 viewports).
// Mais: mar estilizado com espuma na linha d'água, quadras + prédios de fundo na cidade, disco
// de chão e o horizonte em três planos de montanha, cada um mais dentro da névoa, que gira
// pelo rumo absoluto.
import type { Horizon } from './horizon';
import * as THREE from 'three';
import type { SceneryId, Track } from '../core/types';
import { fbm, hash2, hash3, valueNoise } from './noise';
import { FOREST_FRAG_PARS, FOREST_VERT_BODY, FOREST_VERT_PARS, forestFragBody, ringForestAmp, ringPaint } from './horizon-rings';
import { smoothNormals } from './normals';
import { lightsAmount, mix as mixHex, type LivePalette, type Palette } from './palette';
import { applyGrade, applyStylize } from './stylize';
import type { RoadFrame } from './roadframe';
import { clearingsOf, inClearing } from './scenery/clearings';
import type { Quality } from '../game/contracts';
import { applyBiomeDetail, applyDetailQuality, detailTiling, embankmentRock, installTerrainDetail, silenceDetail, type DetailUniforms } from './terrain-detail';
import { windowTextures } from './textures';
import { HEADING_PER_CURVE, SEGMENT_M, turnPerCurve, Y_SCALE } from './units';

/**
 * Distância lateral (m) de cada coluna da faixa, a partir do centro da pista. As três primeiras
 * são a transição (a faixa de terra/areia/calçada que encosta no acostamento, até 9,6 m, e o
 * degradê curto até o chão em 10,8 m).
 */
export const COLS = [8.4, 9.6, 10.8, 16, 26, 40, 60, 90, 130, 180, 260, 380];
const NC = COLS.length;
/** Até aqui o chão fica na altura da pista (o cenário mais afastado, prédios, chega a ~37 m). */
const FLAT_M = 26;
export const SEA_DEPTH_M = 3.2;
/** Litoral, lado do mar: as primeiras colunas descem de leve até a areia molhada; dali para fora é mar. */
const SEA_SHORE = [0, -0.1, -0.3, -0.9];
/** Raios dos três planos do horizonte (de perto para longe) e a altura de cada um por bioma. */
const LAYER_RADII = [470, 660, 920];

interface BiomeRelief {
  /** Altura máxima do relevo (m) na última coluna e a frequência ao longo da pista. */
  amp: number;
  freq: number;
  /** Quanto o chão distante desce até o fundo do vale quando a pista está alta (0..1). */
  drop: number;
  /** Altura (m acima do fundo do vale) em que começa a neve; Infinity = nunca. */
  snowLine: number;
  /** Alturas dos planos do horizonte (m). */
  layers: [number, number, number];
  /** Facetamento dos planos (0 = silhueta chapada, 1 = faces bem marcadas pelo sol). */
  facet: number;
}

const RELIEF: Record<SceneryId, BiomeRelief> = {
  tropical: { amp: 40, freq: 0.035, drop: 0.8, snowLine: Infinity, layers: [62, 120, 205], facet: 0.35 },
  desert: { amp: 26, freq: 0.016, drop: 0.85, snowLine: Infinity, layers: [48, 96, 150], facet: 0.5 },
  city_night: { amp: 0, freq: 0.03, drop: 0, snowLine: Infinity, layers: [30, 60, 120], facet: 0.2 },
  alpine: { amp: 64, freq: 0.03, drop: 1, snowLine: 60, layers: [70, 150, 265], facet: 0.35 },
  coast: { amp: 34, freq: 0.03, drop: 0.7, snowLine: Infinity, layers: [34, 70, 110], facet: 0.3 },
  savanna: { amp: 11, freq: 0.028, drop: 0.5, snowLine: Infinity, layers: [26, 52, 80], facet: 0.3 },
};

function smooth01(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** V11: altura (m) da lombada que corre ao lado da pista, por bioma (a cidade é calçada e quadra: plana). */
const NEAR_AMP: Record<SceneryId, number> = { desert: 1.8, tropical: 1.3, savanna: 1.0, alpine: 1.2, coast: 0.8, city_night: 0 };
/** V11: onde a lombada começa (a coluna da faixa de transição, a que o acostamento já alcançou) e onde termina (FLAT_M: o relevo de longe começa em zero ali). */
const NEAR_FROM = 10.8;

/**
 * V11: relevo suave perto da pista (10,8 a 26 m): uma lombada de dunas/barrancos que sobe da faixa de transição, tem o pico em ~16 m e volta a zero em 26 m, com
 * a altura variando ao longo da pista (ruído por segmento). Zero na faixa de transição (a pista, o acostamento e o verge ficam planos) e na cidade. Por vértice
 * (as colunas de 16 m e 26 m já existiam): nenhuma geometria nova. O cenário pousa nela pela mesma conta (`columnHeightAboveRoad`).
 */
function nearRelief(biome: SceneryId, seg: number, dist: number, side: number): number {
  const amp = NEAR_AMP[biome];
  if (amp === 0 || dist <= NEAR_FROM || dist >= FLAT_M) return 0;
  const bump = smooth01(NEAR_FROM, 16, dist) * (1 - smooth01(16, FLAT_M, dist));
  const n = fbm(side > 0 ? 611 : 827, seg * 0.05 + dist * 0.02, 2) * 0.5 + 0.5;
  return amp * bump * (0.12 + 0.88 * Math.pow(n, 1.2));
}

/**
 * V11: o tom do chão por vértice (0..1), do segmento, do lado e da coluna: manchas de 20 a 60 m ao longo da pista com um pouco de ruído por vértice. O
 * `groundColor` empurra o chão para a cor baixa (clara) ou alta (escura) do bioma por ele: faixas de areia e de ocre no deserto, de capim claro e escuro nos campos.
 */
export function groundTone(biome: SceneryId, seg: number, col: number, side: number): number {
  const a = fbm(side > 0 ? 73 : 97, seg * 0.09 + col * 0.8, 2) * 0.5 + 0.5;
  const b = hash3(seg, col, side + 11) - 0.5;
  return smooth01(0.12, 0.88, a + 0.5 * b * (biome === 'city_night' ? 0 : 1));
}

/** Relevo (m) na distância `dist` do lado `side`, no segmento `seg`: lombada suave perto da pista (V11), plano até FLAT_M, sobe, e cai na borda. */
export function relief(biome: SceneryId, seg: number, dist: number, side: number): number {
  const r = RELIEF[biome];
  if (dist <= FLAT_M) return nearRelief(biome, seg, dist, side);
  if (r.amp === 0) return 0;
  const ramp = Math.pow(Math.min(1, (dist - FLAT_M) / (300 - FLAT_M)), 1.25);
  // A última coluna volta para perto do fundo: a borda da faixa não vira um degrau no disco de chão.
  const edge = 1 - 0.75 * smooth01(300, 380, dist);
  const seed = side > 0 ? 501 : 907;
  const col = dist / 40;
  const n = fbm(seed, seg * r.freq + col * 0.85, 2) * 0.5 + 0.5;
  const m = valueNoise(seed + 77, seg * r.freq * 1.9 + col * 2.3) * 0.5 + 0.5;
  if (biome === 'desert') return (r.amp * Math.pow(n, 1.6) * 0.95 + m * 3) * ramp * edge; // dunas suaves
  if (biome === 'alpine') {
    // Cristas: ruído "dobrado" dá picos em vez de lombadas.
    const ridge = 1 - Math.abs(fbm(seed + 5, seg * r.freq * 0.8 + col * 0.6, 2));
    return (n * 0.55 + ridge * ridge * 0.45 + m * 0.1) * r.amp * ramp * edge;
  }
  return (n * 0.75 + m * 0.25) * r.amp * ramp * edge;
}

/** Peso da descida ao fundo do vale na distância `dist` (0 perto da pista, 1 longe). */
function dropWeight(biome: SceneryId, dist: number): number {
  return RELIEF[biome].drop * smooth01(FLAT_M + 8, 170, dist);
}

// A conta de cada coluna, exportada: o cenário (scenery/ground.ts) pousa os objetos com ela — antes ele copiava a
// fórmula e ficou para trás quando o relevo mudou. A altura de uma coluna, relativa à pista no início do segmento, é
// −(pista acima do fundo do vale) × columnDrop + columnRelief.

/** Relevo (m) da coluna `c` do lado `side` no segmento `seg` (o do mar no lado do mar do litoral). */
export function columnRelief(biome: SceneryId, seg: number, side: number, c: number): number {
  if (biome === 'coast' && side > 0) return c < SEA_SHORE.length ? SEA_SHORE[c] : -(SEA_DEPTH_M + 0.6);
  return relief(biome, seg, COLS[c], side);
}

/** Quanto a coluna desce até o fundo do vale (0..1); no lado do mar, 1 a partir da água. */
export function columnDrop(biome: SceneryId, side: number, c: number): number {
  if (biome === 'coast' && side > 0) return c < SEA_SHORE.length ? 0 : 1;
  return dropWeight(biome, COLS[c]);
}

/** Altura (m) da coluna relativa à pista no início do segmento; `roadH` = pista acima do fundo do vale. */
export function columnHeightAboveRoad(biome: SceneryId, seg: number, roadH: number, side: number, c: number): number {
  return -roadH * columnDrop(biome, side, c) + columnRelief(biome, seg, side, c);
}

/**
 * Distância real (m) da coluna `c`: do lado de dentro da curva ela é presa, senão dobraria para trás. `turn` = o giro por unidade de curva da
 * pista (`turnPerCurve`, M6; o padrão é a escala legada).
 */
export function columnDistance(curve: number, side: number, c: number, turn: number = HEADING_PER_CURVE): number {
  const delta = curve * turn;
  const inside = (side > 0) === (delta > 0) && delta !== 0;
  return inside ? Math.min(COLS[c], 0.9 * SEGMENT_M / (Math.abs(delta) + 1e-6)) : COLS[c];
}

const PERIODIC = 64;
/** Ruído periódico ao redor do anel (t em voltas: 0..1 fecha sem emenda). */
function ringNoise(seed: number, t: number, octaves: number, base = PERIODIC): number {
  let sum = 0; let amp = 1; let norm = 0; let period = base;
  for (let o = 0; o < octaves; o++) {
    const x = t * period;
    const i = Math.floor(x); const f = x - i; const s = f * f * (3 - 2 * f);
    const a = hash2(seed + o * 31, i % period) * 2 - 1;
    const b = hash2(seed + o * 31, (i + 1) % period) * 2 - 1;
    sum += (a + (b - a) * s) * amp;
    norm += amp; amp *= 0.5; period *= 2;
  }
  return sum / norm;
}

/** Quanto a crista alpina arredonda (no |r| suave do perfil): maior = pico mais redondo. */
const RIDGE_SOFT = 0.2;

/** Perfil (0..1) de um plano do horizonte no ângulo t (voltas), por bioma. */
export function ringProfile(biome: SceneryId, layer: number, t: number): number {
  const seed = 11 + layer * 37;
  // 20 e 40 ondulações por volta (eram 64, 128 e 256): morro largo e redondo em vez de serrote.
  const n = ringNoise(seed, t, 2, 20) * 0.5 + 0.5;
  switch (biome) {
    case 'alpine': {
      // Serra de crista redonda (pedido do dono, 04/10: "suavizar as montanhas"): 16 e 22 ondulações por volta
      // em vez de 64 (pico a cada ~90 m com 265 m de altura = agulha) e |r| suave (√(r² + k²) − k) em vez de 1 − |r|.
      const r = ringNoise(seed + 3, t, 2, 16); const k = RIDGE_SOFT;
      const ridge = 1 - (Math.sqrt(r * r + k * k) - k);
      const na = ringNoise(seed, t, 2, 22) * 0.5 + 0.5;
      return Math.min(1, 0.16 + 0.56 * ridge * ridge + 0.38 * na * na);
    }
    case 'desert': {
      // Mesas: topo reto e paredes íngremes (degrau suavizado), com planícies baixas entre elas.
      const m = ringNoise(seed + 9, t, 2);
      const mesa = smooth01(0.02, 0.12, m);
      return 0.12 + 0.1 * n + mesa * (0.62 + 0.12 * n);
    }
    case 'coast': return layer === 0 ? Math.max(0, n - 0.42) * 1.9 : Math.max(0.04, n - 0.25) * 1.35;
    case 'city_night': return 0.25 + 0.45 * n;
    case 'savanna': {
      // Morros-ilha de encosta mansa (degrau largo e poucas ondulações): o degrau curto de antes era um serrote.
      const m = ringNoise(seed + 9, t, 2, 16);
      return 0.2 + 0.25 * n + 0.45 * smooth01(0.0, 0.4, m);
    }
    default: return 0.25 + 0.75 * n;
  }
}

/**
 * Elevação (graus) do topo dos planos do horizonte no ângulo `turns` (voltas, 0..1) do anel, visto do centro: o maior entre os planos
 * (na cidade o plano mais perto é a skyline, não um anel). O anel gira com o céu, então o sol tem um `turns` fixo por bioma:
 * quem escolhe onde o sol fica (`palette.ts`, `SUN`) confere por aqui que ele nasce acima das montanhas.
 */
export function horizonElevation(biome: SceneryId, turns: number): number {
  const t = ((turns % 1) + 1) % 1;
  let top = 0;
  for (let l = 0; l < 3; l++) {
    if (biome === 'city_night' && l === 0) continue;
    top = Math.max(top, Math.atan2(RELIEF[biome].layers[l] * ringProfile(biome, l, t), LAYER_RADII[l]));
  }
  return (top * 180) / Math.PI;
}

const RING_VERT = /* glsl */ `
// colorB / uBlend (M6): a cor do período seguinte por vértice e quanto dela vale (0 = a da pista); sem período seguinte colorB é a própria cor.
attribute vec3 colorB; uniform float uBlend;
varying vec3 vColor; varying vec3 vW; varying vec3 vN;
${FOREST_VERT_PARS}
void main() {
  vColor = mix(color, colorB, uBlend);${FOREST_VERT_BODY}
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

// Planos do horizonte: sem névoa (a névoa já está na cor de cada vértice); encostas lisas (normal suave do vértice —
// antes era a da face e a serra saía facetada) que o sol acende conforme `facet` do bioma.
export const RING_FRAG = /* glsl */ `
uniform vec3 uSunDir; uniform float uFacet;
varying vec3 vColor; varying vec3 vW; varying vec3 vN;
${FOREST_FRAG_PARS}
void main() {
  vec3 n = normalize(vN);
  float l = max(dot(n, uSunDir), 0.0);
  vec3 c = vColor * (1.0 - uFacet + uFacet * (0.62 + 0.7 * l));${forestFragBody('c')}
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SEA_VERT = /* glsl */ `
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

// ───────────────────────────── Mar (V4: saturado e vivo) ─────────────────────────────
/**
 * Quanto do teto de céu refletido da paleta (`seaSky`) o mar usa, a névoa que ele leva e o reforço de saturação no fim (V4, docs/ondas/V4-pistas.md).
 * Até a V4 o mar refletia até 0,5 do horizonte claro no ângulo raso e levava 0,7 da névoa: longe, saía turquesa-acinzentado. A paleta (M2) continua
 * dizendo o caminho de brilho e o teto do reflexo (`seaSky`, `seaGlint`, `seaSpec`: tests/lente-m2.test.ts); o shader usa uma fração deles.
 */
export const SEA_SKY_SCALE = 0.45;
export const SEA_FOG_MIX = 0.4;
/** A névoa que cai no mar puxa para a água funda do bioma: longe, o mar continua azul (a névoa quente do deserto ou da savana o deixava cinza). */
export const SEA_FOG_WATER = 0.6;
export const SEA_SATURATION = 1.3;

/**
 * O que o shader do mar recebe de uma paleta (puro): as águas do bioma, o céu que ela reflete e os números do brilho. O reflexo é o TOPO do céu (o
 * azul fundo de dia, o índigo do entardecer), não o horizonte claro ou o laranja do pôr do sol: a água fica azul como no Horizon Chase; o pôr do sol
 * entra pelo caminho de brilho (`seaGlint`).
 */
export interface SeaLook { deep: string; shallow: string; sky: string; skyMix: number; fogMix: number; saturation: number; spec: number; glint: number; foam: string }
export function seaLook(p: Palette): SeaLook {
  return {
    deep: p.waterDeep, shallow: p.waterShallow, sky: p.sky[0], skyMix: p.seaSky * SEA_SKY_SCALE, fogMix: SEA_FOG_MIX,
    saturation: SEA_SATURATION, spec: p.seaSpec, glint: p.seaGlint, foam: p.foam,
  };
}

/**
 * A cor (sRGB 0..255) que o shader do mar dá a `dist` m no ângulo raso (o céu refletido no teto), sem o brilho do sol: a mesma conta do `SEA_FRAG`
 * (as cores em linear, a névoa exp² e o reforço de saturação no fim). É o que tests/pistas-v4.test.ts mede por bioma e período.
 */
export function seaApparent(look: SeaLook, dist: number, fogDensity: number, fogColor: string): [number, number, number] {
  const lin = (h: string): [number, number, number] => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
  const mixv = (a: number[], b: number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const ss = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let c = mixv(lin(look.shallow), lin(look.deep), ss(25, 320, dist));
  c = mixv(c, lin(look.sky), look.skyMix);
  const f = 1 - Math.exp(-((fogDensity * dist) ** 2));
  c = mixv(c, mixv(lin(fogColor), lin(look.deep), SEA_FOG_WATER), f * look.fogMix);
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  c = c.map((v) => Math.max(0, l + (v - l) * look.saturation)) as [number, number, number];
  const out = new THREE.Color(c[0], c[1], c[2]).convertLinearToSRGB();
  return [out.r * 255, out.g * 255, out.b * 255];
}

// Mar estilizado: turquesa perto, azul fundo longe, faixas largas de onda, um pouco do MEIO do céu refletido no ângulo raso, o caminho de brilho
// do sol/lua com a cintilação das cristas (V4) e a saturação reforçada depois da névoa. As ondas somem com a distância (sem cintilar).
const SEA_FRAG = /* glsl */ `
uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform float uTime; uniform float uSpec; uniform float uGlint; uniform float uSkyMix;
varying vec3 vWorld;
#include <fog_pars_fragment>
void main() {
  vec2 p = vWorld.xz;
  float t = uTime;
  float dist = length(cameraPosition.xz - p);
  float near = 1.0 - smoothstep(60.0, 420.0, dist);
  vec2 g = vec2(0.0);
  g += vec2(0.21, 0.0) * cos(p.x * 0.21 + t * 1.4) * 0.45;
  g += vec2(0.05, 0.17) * cos(p.y * 0.17 + p.x * 0.05 - t * 1.1) * 0.5;
  g += vec2(0.09, 0.09) * cos((p.x + p.y) * 0.09 + t * 0.6) * 0.8;
  vec3 n = normalize(vec3(-g.x * near, 1.0, -g.y * near));
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  vec3 col = mix(uShallow, uDeep, smoothstep(25.0, 320.0, dist));
  float band = sin(dot(p, vec2(0.045, 0.1)) + t * 0.7 + sin(p.x * 0.025 + t * 0.2) * 2.2);
  col *= 1.0 + 0.09 * smoothstep(0.55, 0.95, band) * near;
  col = mix(col, uSky, clamp(fres * uSkyMix * ${SEA_SKY_SCALE.toFixed(3)}, 0.0, uSkyMix * ${SEA_SKY_SCALE.toFixed(3)}));
  vec3 r = reflect(-v, n);
  float s = max(dot(r, uSunDir), 0.0);
  // Cintilação: cristas pequenas que acendem e apagam no caminho do sol (perto), além do brilho firme e do largo.
  float spark = smoothstep(0.86, 1.0, sin(p.x * 1.7 + t * 3.1) * sin(p.y * 1.3 - t * 2.3 + p.x * 0.4)) * near;
  vec3 glint = uSunColor * (pow(s, uSpec) * 2.2 + pow(s, uSpec * 0.08) * 0.12 + pow(s, uSpec * 0.3) * spark * 1.6) * uGlint;
  #if defined(USE_FOG) && defined(FOG_EXP2)
    // Névoa mais leve no mar: o azul chega saturado até o horizonte.
    float seaFog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    col = mix(col, mix(fogColor, uDeep, ${SEA_FOG_WATER.toFixed(3)}), seaFog * ${SEA_FOG_MIX.toFixed(3)});
  #endif
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(vec3(lum) + (col - vec3(lum)) * ${SEA_SATURATION.toFixed(3)}, vec3(0.0));
  gl_FragColor = vec4(col + glint, 1.0);
  #if !(defined(USE_FOG) && defined(FOG_EXP2))
    #include <fog_fragment>
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const FOAM_VERT = /* glsl */ `
attribute float aU;
varying float vU; varying float vV;
#include <fog_pars_vertex>
void main() {
  vU = aU;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vV = uv.y;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

// Linha d'água: espuma branca que vai e volta (a onda quebrando) e a faixa rasa turquesa que
// some mar adentro. `vU`: 0 na linha d'água, 1 na espuma, 2 no fim do raso.
const FOAM_FRAG = /* glsl */ `
uniform vec3 uFoam; uniform vec3 uShallow; uniform float uTime;
varying float vU; varying float vV;
#include <fog_pars_fragment>
void main() {
  float wave = 0.5 + 0.5 * sin(uTime * 1.3 + vV * 0.9);
  float edge = 0.55 + 0.4 * wave;
  float foam = 1.0 - smoothstep(edge - 0.25, edge, vU);
  foam *= 0.8 + 0.2 * sin(vV * 3.1 + uTime * 0.7);
  // V4: as ondas que chegam, linhas de espuma no raso andando para a praia (vU desce) e se desfazendo.
  float crest = sin((vU + uTime * 0.32) * 6.2832 * 1.5 + sin(vV * 0.35) * 1.2);
  float lines = smoothstep(0.82, 0.97, crest) * (1.0 - smoothstep(1.2, 2.0, vU)) * step(0.9, vU) * 0.75;
  foam = max(foam, lines);
  float shallow = (1.0 - smoothstep(1.0, 2.0, vU)) * 0.6;
  vec3 col = mix(uShallow, uFoam, foam);
  float a = max(foam, shallow);
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Faixa com `lanes` vértices por ponto, com cor, normal e `aDet` por vértice. V22/F1: `aDet` = (lateral em m com o sinal do lado, distância ABSOLUTA ao longo da pista em m): é
 * o que o shader do chão usa para o detalhe (terrain-detail.ts) — nunca a posição de mundo, que muda a cada quadro e faria o detalhe "nadar".
 */
class Strip {
  readonly geometry = new THREE.BufferGeometry();
  readonly position: THREE.BufferAttribute;
  readonly color: THREE.BufferAttribute;
  readonly normal: THREE.BufferAttribute;
  readonly det: THREE.BufferAttribute;
  readonly mesh: THREE.Mesh;
  constructor(readonly capacity: number, readonly lanes: number, material: THREE.Material) {
    const verts = capacity * lanes;
    this.position = new THREE.BufferAttribute(new Float32Array(verts * 3), 3);
    this.position.setUsage(THREE.DynamicDrawUsage);
    this.color = new THREE.BufferAttribute(new Float32Array(verts * 3), 3);
    this.color.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.position);
    this.geometry.setAttribute('color', this.color);
    this.normal = new THREE.BufferAttribute(new Float32Array(verts * 3), 3);
    this.normal.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('normal', this.normal);
    this.det = new THREE.BufferAttribute(new Float32Array(verts * 2), 2);
    this.det.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aDet', this.det);
    const index = new Uint32Array((capacity - 1) * (lanes - 1) * 6);
    let k = 0;
    for (let j = 0; j < capacity - 1; j++) for (let l = 0; l < lanes - 1; l++) {
      const a = j * lanes + l; const b = a + 1; const c = a + lanes; const d = c + 1;
      index[k++] = a; index[k++] = b; index[k++] = c;
      index[k++] = b; index[k++] = d; index[k++] = c;
    }
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1));
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
  }
  set(point: number, lane: number, x: number, y: number, z: number, r: number, g: number, b: number, nx: number, ny: number, nz: number, lat: number, along: number): void {
    const i = point * this.lanes + lane;
    this.position.setXYZ(i, x, y, z);
    this.color.setXYZ(i, r, g, b);
    this.normal.setXYZ(i, nx, ny, nz);
    this.det.setXY(i, lat, along);
  }
  finish(points: number): void {
    this.geometry.setDrawRange(0, Math.max(0, points - 1) * (this.lanes - 1) * 6);
    this.position.needsUpdate = true; this.color.needsUpdate = true; this.normal.needsUpdate = true; this.det.needsUpdate = true;
  }
  dispose(): void { this.geometry.dispose(); }
}

/** Plano do horizonte: base (dentro da névoa), meio e topo, com neve nos picos se houver. */
/** Vinco das encostas do horizonte: tudo liso — no vale em V a dobra passava dos 70° e virava costura vertical. */
const RING_CREASE = 120;

export function buildRing(biome: SceneryId, layer: number, radius: number, height: number, top: THREE.Color, fog: THREE.Color, haze: number, snow: THREE.Color | null): THREE.BufferGeometry {
  const N = 300; // pontos por volta: com 150 o contorno da serra saía em degraus
  const pos: number[] = []; const col: number[] = []; const forest: number[] = [];
  const amp = ringForestAmp(biome, layer);
  // V22/F3: a cor do topo, da encosta alta e do meio por coluna, com o ruído de arvoredo e o cume iluminado (horizon-rings.ts): antes, uma cor só por fileira.
  const paint = ringPaint(biome, layer, N, top, fog, haze);
  const cBase = top.clone().lerp(fog, Math.min(1, haze + 0.55));
  const cSnow = snow ? snow.clone().lerp(fog, haze * 0.8) : null;
  const tmp = new THREE.Color();
  // `aForest` = (mancha, contorno, 1 na crista, ravina): a neve e a pedra do pico não levam o arvoredo (`keep`: 1 = mata, 0 = neve) e levam, no lugar dele, as ravinas.
  const push = (x: number, y: number, z: number, c: THREE.Color, keep = 1, crest = 0) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); forest.push(amp.speckle * keep, amp.fringe * keep, crest, cSnow ? 0.9 * (1 - keep) : 0); };
  const heightAt = (i: number): number => height * ringProfile(biome, layer, (i % N) / N);
  const keepAt = (h: number): number => (cSnow ? 1 - smooth01(0.5, 0.85, h / height) : 1);
  // Neve pela altura do próprio vértice, numa faixa larga: decidida por coluna (pico acima de 66–78%), a coluna
  // vizinha saía cinza e a encosta inteira virava faixa vertical — com a serra lisa isso aparecia.
  const topColor = (h: number, i: number): THREE.Color => {
    const cTop = paint.top[i];
    if (!cSnow) return cTop;
    const s = smooth01(0.5, 0.85, h / height);
    return tmp.copy(cTop).lerp(cSnow, s);
  };
  const B = -70;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2; const a1 = ((i + 1) / N) * Math.PI * 2;
    const h0 = heightAt(i); const h1 = heightAt(i + 1);
    const x0 = Math.cos(a0) * radius; const z0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius; const z1 = Math.sin(a1) * radius;
    // O meio fica para fora e o topo para dentro: a encosta tem inclinação (o sol a faceta).
    const m0 = h0 * 0.45; const m1 = h1 * 0.45;
    const ro = 1.02; const ri = 0.975;
    const cMid0 = paint.mid[i]; const cMid1 = paint.mid[i + 1];
    push(x0 * ro, B, z0 * ro, cBase); push(x1 * ro, B, z1 * ro, cBase); push(x0 * ro, m0, z0 * ro, cMid0);
    push(x1 * ro, B, z1 * ro, cBase); push(x1 * ro, m1, z1 * ro, cMid1); push(x0 * ro, m0, z0 * ro, cMid0);
    const t0 = topColor(h0, i).clone(); const t1 = topColor(h1, i + 1).clone();
    const mc0 = paint.slope[i]; const mc1 = paint.slope[i + 1];
    const k0 = keepAt(h0); const k1 = keepAt(h1);
    push(x0 * ro, m0, z0 * ro, mc0, k0); push(x1 * ro, m1, z1 * ro, mc1, k1); push(x0 * ri, h0, z0 * ri, t0, k0, 1);
    push(x1 * ro, m1, z1 * ro, mc1, k1); push(x1 * ri, h1, z1 * ri, t1, k1, 1); push(x0 * ri, h0, z0 * ri, t0, k0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aForest', new THREE.Float32BufferAttribute(forest, 4));
  return smoothNormals(g, RING_CREASE);
}

/** Caixa com UV em metros (janelas de 3 m de passo, sem esticar). */
function meteredBox(w: number, h: number, d: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const faces: Array<[number, number]> = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = faces[f];
    for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * su / 6, uv.getY(i) * sv / 6); }
  }
  return g;
}

/** Cores já convertidas (espaço linear) de uma paleta, para o laço por vértice. */
interface GroundColors {
  low: THREE.Color; high: THREE.Color; rock: THREE.Color; snow: THREE.Color; sand: THREE.Color; verge: THREE.Color; wetSand: THREE.Color;
  block: [THREE.Color, THREE.Color, THREE.Color];
}

function groundColorsOf(p: Palette): GroundColors {
  return {
    low: new THREE.Color(p.groundLow), high: new THREE.Color(p.groundHigh), rock: new THREE.Color(p.rock), snow: new THREE.Color(p.snow),
    sand: new THREE.Color(p.sand), verge: new THREE.Color(p.verge), wetSand: new THREE.Color(p.sand).multiplyScalar(0.72),
    block: [new THREE.Color(p.asphalt).multiplyScalar(0.9), new THREE.Color(p.verge).multiplyScalar(0.75), new THREE.Color(p.groundHigh)],
  };
}

/**
 * A quadra (centro em x, z; meia largura ~25 m) cai numa clareira de marco vista no espaço: do lado dele, entre a pista e a borda da clareira, de
 * `back` antes a `ahead` depois do segmento dele (terrain.ts, `updateCityBlocks`).
 */
function inZone(zones: ReadonlyArray<{ x: number; z: number; c: number; s: number; side: number; lat: number; back: number; ahead: number }>, x: number, z: number): boolean {
  for (const q of zones) {
    const dx = x - q.x; const dz = z - q.z;
    const lat = (dx * q.c + dz * q.s) * q.side;
    const along = dx * q.s - dz * q.c;
    if (lat > 0 && lat - 25 <= q.lat && along > -q.back - 25 && along < q.ahead + 25) return true;
  }
  return false;
}

export class Terrain {
  readonly group = new THREE.Group();
  /** Planos do horizonte e skyline: giram pelo rumo absoluto. */
  readonly farGroup = new THREE.Group();
  private readonly left: Strip;
  private readonly right: Strip;
  private readonly material: THREE.MeshStandardMaterial;
  /** V22/F1: os uniformes do detalhe do chão (terrain-detail.ts); por pista, bioma, qualidade e período só eles mudam. */
  private readonly detail: DetailUniforms;
  private readonly ground: THREE.Mesh<THREE.CircleGeometry, THREE.MeshStandardMaterial>;
  private readonly sea: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly foam: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly foamPos: THREE.BufferAttribute;
  private readonly foamV: THREE.BufferAttribute;
  private readonly cityBlocks: THREE.InstancedMesh[] = [];
  private readonly cityMaterial: THREE.MeshStandardMaterial;
  private readonly skyline: THREE.InstancedMesh;
  private readonly neon: THREE.InstancedMesh;
  private readonly ringMaterial: THREE.ShaderMaterial;
  private ringMeshes: THREE.Mesh[] = [];
  private biome: SceneryId = 'coast';
  private trackKey = '';
  private minRoadY = 0;
  /** Por segmento × lado × coluna: relevo (m), cor (linear) e inclinação (para fora, ao longo). Montado em setTrack. */
  private reliefTable = new Float32Array(0);
  private colorTable = new Float32Array(0);
  /** M6 (b): a tabela de cor do período seguinte (a cor do chão é combinação convexa da paleta, então a mistura das duas tabelas é a tabela da paleta interpolada) e o quanto dela vale. */
  private colorTableB: Float32Array | null = null;
  private blend = 0;
  private baseFacet = 0.3;
  private gradTable = new Float32Array(0);
  /** columnDrop por lado (−1, +1) e coluna. */
  private readonly dropW = new Float32Array(2 * NC);
  private readonly tmp = new THREE.Color();
  private readonly dummy = new THREE.Object3D();
  private readonly ys = new Float32Array(NC);

  constructor(capacity: number) {
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.6 });
    applyStylize(this.material, 'ground');
    this.detail = installTerrainDetail(this.material); // DEPOIS do estilizador: compõe com ele
    // Só para os testes de imagem (tools/render-harness.lab.ts, `groundDetail`): liga e desliga o detalhe SEM recompilar, para isolar o campo do detalhe (a razão entre o quadro com e sem).
    this.material.userData.terrainDetail = { off: () => silenceDetail(this.detail), on: () => applyBiomeDetail(this.detail, this.biome) };
    this.left = new Strip(capacity, NC, this.material);
    this.right = new Strip(capacity, NC, this.material);
    this.group.add(this.left.mesh, this.right.mesh);

    this.ground = new THREE.Mesh(new THREE.CircleGeometry(1500, 48), new THREE.MeshStandardMaterial({ color: '#333333', roughness: 1 }));
    applyStylize(this.ground.material, 'ground');
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -14;
    this.ground.receiveShadow = false;
    this.group.add(this.ground);

    const seaMat = new THREE.ShaderMaterial({
      vertexShader: SEA_VERT, fragmentShader: SEA_FRAG, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uDeep: { value: new THREE.Color('#0b4f8a') }, uShallow: { value: new THREE.Color('#2aa8c8') }, uSky: { value: new THREE.Color('#cfefff') },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color('#fff3a0') }, uTime: { value: 0 }, uSpec: { value: 180 }, uGlint: { value: 1 }, uSkyMix: { value: 0.5 },
      }]),
    });
    applyGrade(seaMat);
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), seaMat);
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.frustumCulled = false;
    this.sea.visible = false;
    this.group.add(this.sea);

    // Espuma: 3 vértices por ponto (linha d'água, fim da espuma, fim do raso).
    const fg = new THREE.BufferGeometry();
    this.foamPos = new THREE.BufferAttribute(new Float32Array(capacity * 3 * 3), 3);
    this.foamPos.setUsage(THREE.DynamicDrawUsage);
    this.foamV = new THREE.BufferAttribute(new Float32Array(capacity * 3 * 2), 2);
    this.foamV.setUsage(THREE.DynamicDrawUsage);
    const aU = new Float32Array(capacity * 3);
    for (let j = 0; j < capacity; j++) { aU[j * 3] = 0; aU[j * 3 + 1] = 1; aU[j * 3 + 2] = 2; }
    fg.setAttribute('position', this.foamPos);
    fg.setAttribute('uv', this.foamV);
    fg.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
    const fidx = new Uint32Array((capacity - 1) * 2 * 6);
    let k = 0;
    for (let j = 0; j < capacity - 1; j++) for (let l = 0; l < 2; l++) {
      const a = j * 3 + l; const b = a + 1; const c = a + 3; const d = c + 1;
      fidx[k++] = a; fidx[k++] = c; fidx[k++] = b; fidx[k++] = b; fidx[k++] = c; fidx[k++] = d;
    }
    fg.setIndex(new THREE.BufferAttribute(fidx, 1));
    this.foam = new THREE.Mesh(fg, new THREE.ShaderMaterial({
      vertexShader: FOAM_VERT, fragmentShader: FOAM_FRAG, fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uFoam: { value: new THREE.Color('#ffffff') }, uShallow: { value: new THREE.Color('#2fd0c4') }, uTime: { value: 0 } }]),
    }));
    applyGrade(this.foam.material);
    this.foam.frustumCulled = false;
    this.foam.visible = false;
    this.foam.renderOrder = 1;
    this.group.add(this.foam);

    const win = windowTextures();
    this.cityMaterial = new THREE.MeshStandardMaterial({ map: win.wall, emissiveMap: win.win, emissive: '#ffd27a', emissiveIntensity: 1.3, color: '#5a6478', roughness: 0.7 });
    applyStylize(this.cityMaterial, 'facade', { world: true }); // V12: o roxo da noite nos prédios da skyline
    for (const [w, h, d] of [[18, 22, 18], [16, 42, 16], [22, 70, 22]] as const) {
      const im = new THREE.InstancedMesh(meteredBox(w, h, d), this.cityMaterial, 160);
      im.frustumCulled = false; im.castShadow = false; im.visible = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.cityBlocks.push(im);
      this.group.add(im);
    }
    this.skyline = new THREE.InstancedMesh(meteredBox(1, 1, 1), this.cityMaterial, 160);
    this.skyline.frustumCulled = false; this.skyline.visible = false;
    this.farGroup.add(this.skyline);
    this.neon = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ff3fd0', toneMapped: false }), 48);
    this.neon.frustumCulled = false; this.neon.visible = false;
    this.farGroup.add(this.neon);
    this.ringMaterial = new THREE.ShaderMaterial({
      vertexShader: RING_VERT, fragmentShader: RING_FRAG, vertexColors: true, fog: false,
      uniforms: { uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uFacet: { value: 0.3 }, uBlend: { value: 0 } },
    });
    applyGrade(this.ringMaterial);
    this.group.add(this.farGroup);
  }

  /** V22/F1: o detalhe do chão por degrau (Baixa 1 oitava, Média a fina, Alta o grão); só uniformes, nada recompila. */
  setQuality(q: Quality): void { applyDetailQuality(this.detail, q); }

  /** `pTo`: a paleta do período seguinte, se a corrida o alcança (M6, `racePeriodPlan`); `setLive` mistura as duas. */
  setTrack(track: Track, p: Palette, key: string, pTo?: Palette): void {
    if (key === this.trackKey) return;
    this.trackKey = key;
    this.biome = track.def.scenery;
    let minY = Infinity;
    for (const s of track.segments) minY = Math.min(minY, s.y0, s.y1);
    this.minRoadY = minY * Y_SCALE;
    for (let si = 0; si < 2; si++) for (let c = 0; c < NC; c++) this.dropW[si * NC + c] = columnDrop(this.biome, si === 0 ? -1 : 1, c);
    this.buildTables(track, groundColorsOf(p));
    this.colorTableB = null; this.blend = 0;
    applyBiomeDetail(this.detail, this.biome);
    this.detail.A.value.x = detailTiling(track.segments.length * SEGMENT_M).invPeriod; // o ladrilho de ruído fecha na volta da pista
    this.detail.verge.value.set(p.verge);
    if (pTo) {
      const a = this.colorTable.slice();
      this.buildTables(track, groundColorsOf(pTo));
      this.colorTableB = this.colorTable; this.colorTable = a;
    }
    this.ground.material.color.set(p.groundHigh).lerp(this.tmp.set(p.fog), 0.25);
    this.ground.visible = this.biome !== 'coast';
    this.sea.visible = this.biome === 'coast';
    this.foam.visible = this.biome === 'coast';
    const su = this.sea.material.uniforms;
    (su.uDeep.value as THREE.Color).set(p.waterDeep);
    (su.uShallow.value as THREE.Color).set(p.waterShallow);
    (su.uSky.value as THREE.Color).set(seaLook(p).sky);
    (su.uSunColor.value as THREE.Color).set(p.sun ?? p.moon ?? '#ffffff');
    // O caminho de brilho do sol/lua na água vem da paleta (M2): comprido e forte no pôr do sol, firme de dia, largo no luar.
    su.uSpec.value = p.seaSpec; su.uGlint.value = p.seaGlint; su.uSkyMix.value = p.seaSky;
    const fu = this.foam.material.uniforms;
    (fu.uFoam.value as THREE.Color).set(p.foam);
    (fu.uShallow.value as THREE.Color).set(p.waterShallow);
    const city = this.biome === 'city_night';
    for (const im of this.cityBlocks) im.visible = city;
    this.skyline.visible = city;
    this.neon.visible = city;
    this.buildFar(p, pTo);
    this.liveCity(p.light); // a cor dos prédios e as janelas: 4a5470 e 1,3 à noite, 6a7488 e 1,3 no entardecer, apagadas de dia (a mesma conta do setLive)
  }

  /** Relevo e cor de cada (segmento, lado, coluna): só dependem da pista e da paleta. */
  private buildTables(track: Track, gc: GroundColors): void {
    const segs = track.segments;
    const n = segs.length;
    const size = n * 2 * NC;
    if (this.reliefTable.length !== size) { this.reliefTable = new Float32Array(size); this.colorTable = new Float32Array(size * 3); this.gradTable = new Float32Array(size * 2); }
    const b = this.biome;
    const out = this.tmp;
    const hs = new Float32Array(NC);
    const hAll = new Float32Array(size);
    for (let i = 0; i < n; i++) {
      const roadH = segs[i].y0 * Y_SCALE - this.minRoadY; // pista acima do fundo do vale
      for (let si = 0; si < 2; si++) {
        const side = si === 0 ? -1 : 1;
        // Altura (m acima do fundo) de cada coluna, e o relevo guardado na tabela.
        for (let c = 0; c < NC; c++) {
          const r = columnRelief(b, i, side, c);
          this.reliefTable[(i * 2 + si) * NC + c] = r;
          const w = this.dropW[si * NC + c];
          hs[c] = roadH * (1 - w) + r;
          hAll[(i * 2 + si) * NC + c] = hs[c];
        }
        for (let c = 0; c < NC; c++) {
          const slope = c === 0 ? 0 : Math.abs(hs[c] - hs[c - 1]) / (COLS[c] - COLS[c - 1]);
          this.groundColor(i, c, side, hs[c], slope, roadH, gc, out);
          // Leve variação por vértice: o chão fica "pintado", não de plástico.
          const j = (c >= 2 && c <= 5 ? 0.9 + hash3(i, c, side + 7) * 0.2 : 0.94 + hash3(i, c, side + 7) * 0.12); // V11: mais variação perto da pista
          const k = ((i * 2 + si) * NC + c) * 3;
          this.colorTable[k] = out.r * j; this.colorTable[k + 1] = out.g * j; this.colorTable[k + 2] = out.b * j;
        }
      }
    }
    // Inclinações: para fora (entre as colunas vizinhas) e ao longo (entre os segmentos vizinhos).
    for (let i = 0; i < n; i++) {
      const prev = (i - 1 + n) % n; const next = (i + 1) % n;
      for (let si = 0; si < 2; si++) {
        const base = (i * 2 + si) * NC;
        for (let c = 0; c < NC; c++) {
          const c0 = Math.max(0, c - 1); const c1 = Math.min(NC - 1, c + 1);
          const gA = (hAll[base + c1] - hAll[base + c0]) / (COLS[c1] - COLS[c0]);
          const gL = (hAll[(next * 2 + si) * NC + c] - hAll[(prev * 2 + si) * NC + c]) / (2 * SEGMENT_M);
          this.gradTable[(base + c) * 2] = gA; this.gradTable[(base + c) * 2 + 1] = gL;
        }
      }
    }
  }

  /** Cor do chão: transição junto do acostamento, depois altura/inclinação/manchas por bioma. */
  private groundColor(seg: number, col: number, side: number, h: number, slope: number, roadH: number, gc: GroundColors, out: THREE.Color): THREE.Color {
    const b = this.biome;
    const patch = fbm(side > 0 ? 31 : 57, seg * 0.07 + col * 1.3, 2) * 0.5 + 0.5;
    if (b === 'coast' && side > 0) {
      // Praia: areia seca → molhada perto d'água; penhasco (inclinação) vira rocha.
      if (col <= 1) return out.copy(gc.verge);
      out.copy(gc.sand);
      if (col >= 3) out.lerp(gc.wetSand, 0.5);
      if (col >= 4) out.copy(gc.wetSand).multiplyScalar(0.7);
      return out.lerp(gc.rock, smooth01(0.35, 0.9, slope) * (roadH > 4 ? 1 : 0.4));
    }
    if (b === 'city_night') {
      if (col <= 1) return out.copy(gc.verge);
      const block = hash3(Math.floor(seg / 10), col, side);
      return out.copy(gc.block[block < 0.4 ? 0 : block < 0.7 ? 1 : 2]);
    }
    // Faixa de transição: terra/areia/cascalho encostada no acostamento, com borda irregular.
    if (col === 0) return out.copy(gc.verge);
    const ground = out.copy(gc.low).lerp(gc.high, Math.min(1, smooth01(4, 45, h) * 0.85 + (patch - 0.5) * 0.7));
    if (b === 'savanna') ground.lerp(gc.verge, smooth01(0.62, 0.8, patch) * 0.55); // capim seco
    if (b === 'desert') ground.copy(gc.low).lerp(gc.high, patch * 0.6 + smooth01(0, 30, h) * 0.3);
    // V22/F1: a borda acostamento → chão é irregular e vem do shader (terrain-detail.ts: o `verge` pintado até uma borda de ruído); aqui as colunas 1 e 2 levam o chão PURO
    // (antes: o `verge` misturado em 55–100% na coluna 1 e 38% na 2, o degradê de 3 m "de aerógrafo"). A cidade (calçada reta) retorna antes e não muda.
    // V11: o tom do chão por vértice (faixas claras e escuras do bioma, não um plano liso) e a transição suave da faixa de terra até o chão (coluna 2).
    const tone = groundTone(b, seg, col, side);
    ground.lerp(tone > 0.5 ? gc.low : gc.high, Math.abs(tone - 0.5) * 1.4);
    // Manchas de terra à mostra (a rocha vermelha no deserto e na costa/serra, a terra do `verge` na mata e na savana) onde o tom passa de 0,8.
    ground.lerp(b === 'desert' || b === 'alpine' || b === 'coast' ? gc.rock : gc.verge, 0.3 * smooth01(0.78, 1, tone));
    // Encosta íngreme: rocha (vermelha no deserto, azulada na montanha). V22/F1: na serra, com a pista alta sobre o vale, a barranca inteira (a meia descida) vira rocha (`embankmentRock`).
    ground.lerp(gc.rock, Math.max(smooth01(0.42, 0.95, slope) * (b === 'tropical' ? 0.55 : 0.9), col >= 5 ? embankmentRock(b, roadH, columnDrop(b, side, col)) : 0));
    // Neve acima da linha (com ruído na borda), nunca colada na pista.
    if (col >= 3 && Number.isFinite(RELIEF[b].snowLine)) {
      const line = RELIEF[b].snowLine + (patch - 0.5) * 16;
      ground.lerp(gc.snow, smooth01(line - 4, line + 6, h) * (1 - smooth01(0.9, 1.4, slope) * 0.4));
    }
    return ground;
  }

  private buildFar(p: Palette, pTo?: Palette): void {
    for (const m of this.ringMeshes) { this.farGroup.remove(m); m.geometry.dispose(); }
    this.ringMeshes = [];
    const fog = new THREE.Color(p.fog);
    const b = this.biome;
    const rel = RELIEF[b];
    const snow = Number.isFinite(rel.snowLine) ? new THREE.Color(p.snow) : null;
    this.baseFacet = rel.facet;
    this.ringMaterial.uniforms.uFacet.value = rel.facet * (p.moon ? 0.4 : 1);
    this.ringMaterial.uniforms.uBlend.value = 0;
    const fogB = pTo ? new THREE.Color(pTo.fog) : null;
    const snowB = pTo && Number.isFinite(rel.snowLine) ? new THREE.Color(pTo.snow) : null;
    for (let l = 2; l >= 0; l--) {
      const top = new THREE.Color(p.layers[l]);
      // Na cidade o plano mais perto é a skyline (instanciada); os anéis ficam só como morros ao fundo.
      if (b === 'city_night' && l === 0) continue;
      const useSnow = l > 0 || b === 'alpine';
      const geo = buildRing(b, l, LAYER_RADII[l], rel.layers[l], top, fog, p.layerHaze[l], useSnow ? snow : null);
      // A segunda cor por vértice (M6): o mesmo anel pintado com a paleta do período seguinte; sem ela, `colorB` é a própria cor (um programa só).
      if (pTo && fogB) {
        const geoB = buildRing(b, l, LAYER_RADII[l], rel.layers[l], new THREE.Color(pTo.layers[l]), fogB, pTo.layerHaze[l], useSnow ? snowB : null);
        geo.setAttribute('colorB', new THREE.BufferAttribute((geoB.getAttribute('color').array as Float32Array).slice(), 3));
        geoB.dispose();
      } else geo.setAttribute('colorB', geo.getAttribute('color'));
      const mesh = new THREE.Mesh(geo, this.ringMaterial);
      mesh.frustumCulled = false;
      mesh.renderOrder = -5 + (2 - l); // de longe para perto (sem névoa, a ordem não importa para a cor)
      this.farGroup.add(mesh);
      this.ringMeshes.push(mesh);
    }
    if (b === 'city_night') this.buildSkyline();
  }

  private buildSkyline(): void {
    const d = this.dummy;
    let k = 0;
    for (let i = 0; i < this.skyline.count; i++) {
      const a = hash2(i, 3) * Math.PI * 2;
      const r = 300 + hash2(i, 4) * 260;
      const w = 18 + hash2(i, 5) * 26; const dep = 18 + hash2(i, 6) * 22;
      const env = 0.55 + 0.45 * Math.cos(a - 0.8);
      const h = (30 + hash2(i, 7) * 130) * env;
      d.position.set(Math.cos(a) * r, h / 2 - 10, Math.sin(a) * r);
      d.rotation.set(0, hash2(i, 8) * 0.6, 0);
      d.scale.set(w, h, dep);
      d.updateMatrix();
      this.skyline.setMatrixAt(i, d.matrix);
      if (k < this.neon.count && hash2(i, 9) > 0.7) {
        d.position.y = h - 10 + 1.5;
        d.scale.set(w * 0.7, 2.2, 2.2);
        d.updateMatrix();
        this.neon.setMatrixAt(k, d.matrix);
        this.neon.setColorAt(k, this.tmp.set(hash2(i, 10) > 0.5 ? '#ff3fd0' : '#3fe8ff'));
        k++;
      }
    }
    this.neon.count = k;
    this.skyline.instanceMatrix.needsUpdate = true;
    this.neon.instanceMatrix.needsUpdate = true;
    if (this.neon.instanceColor) this.neon.instanceColor.needsUpdate = true;
  }

  update(frame: RoadFrame, track: Track, time: number, sunDirLocal: THREE.Vector3, absHeading: number): void {
    const segs = track.segments;
    const n = frame.count;
    const coast = this.biome === 'coast';
    const originY = segs[frame.baseIndex].y0 * Y_SCALE - frame.py[frame.behind];
    const floorY = this.minRoadY - originY;
    const seaY = floorY - SEA_DEPTH_M;
    const rt = this.reliefTable; const ct = this.colorTable; const gt = this.gradTable;
    const ys = this.ys;
    const turn = turnPerCurve(track);
    // M6 (b): a cor do chão é a mistura das duas tabelas (sem período seguinte, a própria tabela e peso 0).
    const cb = this.colorTableB ?? ct; const bl = this.colorTableB ? this.blend : 0;
    let foamPoints = 0;
    for (let j = 0; j < n; j++) {
      const si = frame.segIndex[j];
      const s = segs[si];
      const h = frame.heading[j];
      const cx = Math.cos(h); const sz = Math.sin(h);
      const px = frame.px[j]; const py = frame.py[j]; const pz = frame.pz[j];
      const delta = s.curve * turn;
      const along = (frame.segIndex[0] + j) * SEGMENT_M;
      // Do lado de dentro da curva, colunas longe demais dobrariam para trás: prende a distância.
      const clampD = 0.9 * SEGMENT_M / (Math.abs(delta) + 1e-6);
      for (let sIdx = 0; sIdx < 2; sIdx++) {
        const side = sIdx === 0 ? -1 : 1;
        const inside = (side > 0) === (delta > 0) && delta !== 0;
        const seaSide = coast && side > 0;
        const strip = side < 0 ? this.left : this.right;
        const base = (si * 2 + sIdx) * NC;
        for (let c = 0; c < NC; c++) {
          const dist = inside ? Math.min(COLS[c], clampD) : COLS[c];
          const w = this.dropW[sIdx * NC + c];
          // Coluna presa (do lado de dentro de uma curva fechada, M6): na mesma distância da última coluna livre, tem a altura dela — com a do relevo de longe virava um paredão.
          const y = c > 0 && inside && COLS[c] > clampD ? ys[c - 1] : py + (floorY - py) * w + rt[base + c];
          ys[c] = y;
          // Esquerda: pistas de fora para dentro (x crescente), como a pista.
          const lane = side < 0 ? NC - 1 - c : c;
          const k = (base + c) * 3;
          // Normal = cima − inclinação para fora (lado × direita) − inclinação ao longo (frente = (sen, 0, −cos)).
          const gA = gt[(base + c) * 2]; const gL = gt[(base + c) * 2 + 1];
          let nx = -gA * side * cx - gL * sz; let nz = -gA * side * sz + gL * cx;
          const inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
          nx *= inv; nz *= inv;
          // `along` desenrolado (4 m por ponto, mesmo através do fim da volta): o ladrilho de ruído repete um número inteiro de vezes no comprimento da pista.
          strip.set(j, lane, px + side * dist * cx, y, pz + side * dist * sz, ct[k] + (cb[k] - ct[k]) * bl, ct[k + 1] + (cb[k + 1] - ct[k + 1]) * bl, ct[k + 2] + (cb[k + 2] - ct[k + 2]) * bl, nx, inv, nz, side * dist, along);
        }
        if (seaSide) {
          // Linha d'água: onde o chão cruza o nível do mar (entre a coluna 3 e a 4).
          const y3 = ys[3]; const y4 = ys[4];
          const t = y3 <= seaY ? 0 : Math.min(1, (y3 - seaY) / Math.max(1e-3, y3 - y4));
          let dw = COLS[3] + t * (COLS[4] - COLS[3]);
          if (inside) dw = Math.min(dw, clampD);
          const yf = seaY + 0.06;
          const fp = this.foamPos; const fv = this.foamV;
          const o = foamPoints * 3;
          const v = s.index * SEGMENT_M * 0.25;
          const d1 = inside ? Math.min(dw + 3, clampD) : dw + 3;
          const d2 = inside ? Math.min(dw + 16, clampD) : dw + 16;
          fp.setXYZ(o, px + dw * cx, yf, pz + dw * sz); fv.setXY(o, 0, v);
          fp.setXYZ(o + 1, px + d1 * cx, yf, pz + d1 * sz); fv.setXY(o + 1, 1, v);
          fp.setXYZ(o + 2, px + d2 * cx, yf, pz + d2 * sz); fv.setXY(o + 2, 2, v);
          foamPoints++;
        }
      }
    }
    this.left.finish(n);
    this.right.finish(n);
    if (coast) {
      this.foam.geometry.setDrawRange(0, Math.max(0, foamPoints - 1) * 12);
      this.foamPos.needsUpdate = true; this.foamV.needsUpdate = true;
      this.foam.material.uniforms.uTime.value = time;
    }
    this.sea.position.y = seaY;
    const su = this.sea.material.uniforms;
    su.uTime.value = time;
    (su.uSunDir.value as THREE.Vector3).copy(sunDirLocal);
    (this.ringMaterial.uniforms.uSunDir.value as THREE.Vector3).copy(sunDirLocal);
    this.ground.position.y = coast ? seaY - 20 : floorY - 2;
    this.farGroup.rotation.y = absHeading;
    if (this.biome === 'city_night') this.updateCityBlocks(frame, track);
  }

  /** As janelas e a cor dos prédios de fundo da cidade pela luz do período (a luz 0,7 do entardecer em diante já acende; de dia, apagadas). */
  private liveCity(light: number): void {
    const night = Math.max(0, Math.min(1, (0.7 - light) / 0.38));
    const sm = night * night * (3 - 2 * night);
    this.cityMaterial.color.set(mixHex('#6a7488', '#4a5470', sm));
    this.cityMaterial.emissiveIntensity = 1.3 * Math.min(1, lightsAmount(light) / 0.6);
  }

  /**
   * M6 (b): o chão no instante da corrida, SÓ uniformes e a mistura das duas tabelas de cor (nenhum material novo, nenhum programa recompilado): o mar e a espuma, o chão
   * plano, a mistura dos anéis, as janelas da cidade e o horizonte do Rio. `t = 0` repõe a cena exatamente como `setTrack` a deixou.
   */
  setLive(live: LivePalette): void {
    const { p, t } = live;
    this.blend = this.colorTableB ? t : 0;
    this.ringMaterial.uniforms.uBlend.value = this.blend;
    const night = Math.max(0, Math.min(1, (lightsAmount(p.light) - 0.6) / 0.4));
    this.ringMaterial.uniforms.uFacet.value = this.baseFacet * (1 - 0.6 * night);
    this.horizon?.setBlend(this.blend);
    this.ground.material.color.set(p.groundHigh).lerp(this.tmp.set(p.fog), 0.25);
    this.detail.verge.value.set(p.verge);
    const su = this.sea.material.uniforms;
    (su.uDeep.value as THREE.Color).set(p.waterDeep);
    (su.uShallow.value as THREE.Color).set(p.waterShallow);
    (su.uSky.value as THREE.Color).set(seaLook(p).sky);
    (su.uSunColor.value as THREE.Color).set(live.body);
    su.uSpec.value = p.seaSpec; su.uGlint.value = p.seaGlint; su.uSkyMix.value = p.seaSky;
    const fu = this.foam.material.uniforms;
    (fu.uFoam.value as THREE.Color).set(p.foam);
    (fu.uShallow.value as THREE.Color).set(p.waterShallow);
    this.liveCity(p.light);
  }

  /** Prédios de fundo da cidade: um a cada 2 segmentos por lado, entre 45 e 300 m da pista. */
  private updateCityBlocks(frame: RoadFrame, track: Track): void {
    const counts = [0, 0, 0];
    const d = this.dummy;
    const segs = track.segments;
    const turn = turnPerCurve(track);
    // T4: a clareira também no espaço. Com o traçado do mapa a pista volta perto de si mesma, e uma quadra de outro trecho (a 285 m dele) caía na
    // pegada do MASP: as clareiras que estão no quadro, no referencial do segmento do marco.
    const zones: Array<{ x: number; z: number; c: number; s: number; side: number; lat: number; back: number; ahead: number }> = [];
    for (const c of clearingsOf(track)) {
      for (let j = 0; j < frame.count; j++) {
        if (frame.segIndex[j] !== c.seg) continue;
        const h = frame.heading[j];
        zones.push({ x: frame.px[j], z: frame.pz[j], c: Math.cos(h), s: Math.sin(h), side: c.side, lat: c.lat, back: c.back * SEGMENT_M, ahead: c.ahead * SEGMENT_M });
        break;
      }
    }
    for (let j = 0; j < frame.count; j += 2) {
      const s = segs[frame.segIndex[j]];
      const h = frame.heading[j];
      const cx = Math.cos(h); const sz = Math.sin(h);
      const delta = s.curve * turn;
      for (const side of [-1, 1] as const) {
        const r = hash2(s.index, side + 10);
        if (r < 0.25) continue;
        const cls = r < 0.6 ? 0 : r < 0.85 ? 1 : 2;
        if (counts[cls] >= 160) continue;
        const inside = (side > 0) === (delta > 0) && delta !== 0;
        let dist = 45 + hash2(s.index, side + 20) * 240;
        if (inside) dist = Math.min(dist, 0.9 * SEGMENT_M / (Math.abs(delta) + 1e-6));
        // Clareira de marco turístico (scenery/clearings.ts): a quadra não esconde o MASP nem a Ponte Estaiada.
        if (inClearing(track, s.index, side, dist - 25)) continue;
        const bx = frame.px[j] + side * dist * cx; const bz = frame.pz[j] + side * dist * sz;
        if (inZone(zones, bx, bz)) continue;
        const ws = 0.8 + hash2(s.index, side + 30) * 0.6;
        d.position.set(bx, frame.py[j] - 1, bz);
        d.rotation.set(0, -h + (hash2(s.index, side + 40) - 0.5) * 0.5, 0);
        d.scale.set(ws, 1, ws);
        d.updateMatrix();
        this.cityBlocks[cls].setMatrixAt(counts[cls]++, d.matrix);
      }
    }
    for (let c = 0; c < 3; c++) {
      this.cityBlocks[c].count = counts[c];
      this.cityBlocks[c].instanceMatrix.needsUpdate = true;
    }
  }

  private horizon: Horizon | null = null;

  /** Paisagem própria da pista (L4: o Rio na baía). Troca a anterior sem deixar nada para trás; `null` só retira. */
  setHorizon(h: Horizon | null): void {
    if (this.horizon) { this.farGroup.remove(this.horizon); this.horizon.dispose(); }
    this.horizon = h;
    if (h) { h.setBlend(this.blend); this.farGroup.add(h); }
  }

  dispose(): void {
    this.setHorizon(null);
    this.left.dispose(); this.right.dispose(); this.material.dispose();
    this.ground.geometry.dispose(); this.ground.material.dispose();
    this.sea.geometry.dispose(); this.sea.material.dispose();
    this.foam.geometry.dispose(); this.foam.material.dispose();
    for (const im of this.cityBlocks) { im.geometry.dispose(); im.dispose(); }
    this.skyline.geometry.dispose(); this.skyline.dispose();
    this.neon.geometry.dispose(); (this.neon.material as THREE.Material).dispose(); this.neon.dispose();
    this.cityMaterial.dispose();
    for (const m of this.ringMeshes) m.geometry.dispose();
    this.ringMaterial.dispose();
  }
}
