// Material único dos carros (carroceria, vidro, cromo, lentes e rodas de todos os estilos: um programa
// só na GPU). Um MeshPhysicalMaterial com o shader estendido:
// - cor = cor do vértice × (pintura da instância ou acento, conforme `aPaint`); a face de uma camada
//   de pintura (faixa, aro) vira o acento quando a instância usa aquela camada (bits em `instExtra.w`);
// - rugosidade e metal por vértice (`aMat.xy`): verniz, cromo, vidro, borracha no mesmo desenho;
// - farol e lanterna emissivos por vértice (`aMat.zw`), o freio por instância (bit 1 de `instExtra.w`);
// - verniz (clearcoat) só nas faces pintadas, e só na qualidade alta;
// - ACABAMENTO por instância (N3, bits 3–5 de `instExtra.w`): brilho (o de sempre), metálico com flocos, perolado (iridescência),
//   fosco, cromado e camaleão — só sobre a carroceria pintada (`vFin`), sem textura, sem chamada de desenho a mais. Na Média, que não
//   tem o verniz, os acabamentos brilhantes ganham um brilho de Fresnel sobre o reflexo do céu que o shader já amostrou;
// - reflexo do céu (env map da cena) reforçado nas peças metálicas e no vidro;
// - farol escamoteável (`aPaint.w`) sobe à noite.
import * as THREE from 'three';
import type { Quality } from '../../game/contracts';
import { atLeast } from '../../game/quality';
import { applyStylize } from '../stylize';
import { CUT_BIT, CUT_SHIFT } from './mount';
import { LENS_RIM } from './kit';

/** Bits de acabamento em `instExtra.w` (3 bits, a partir do bit 3): 0 brilho, 1 metálico, 2 perolado, 3 fosco, 4 cromado, 5 camaleão (a ordem de `FINISH_IDS`). */
export const FINISH_SHIFT = 3;
export const FINISH_MASK = 7;

export interface CarUniforms {
  uSelfLight: { value: number };
  uHeadGlow: { value: number };
  uTailGlow: { value: number };
  uBrakeGlow: { value: number };
  uPopup: { value: number };
  uEnvBoost: { value: number };
  /** Força do verniz estilizado (reflexo do céu e do horizonte na lataria; cor-brilho): 0 na Baixa. */
  uVarnish: { value: number };
}

/**
 * Lanterna (cor-brilho, docs/ondas/cor-brilho.md): o miolo esquenta para laranja-branco quando o brilho passa de `LAMP_HOT_FROM` (à noite e no freio),
 * a borda continua vermelha. `w` é o peso do emissivo: o do pincel (`aMat.w`) × o da lente, que cai do centro (1) para a borda (`LENS_RIM`, atributo `aLens`).
 */
export const LAMP_HOT: readonly [number, number, number] = [1, 0.6, 0.15];
/** De que peso em diante a lente esquenta (o miolo; a coroa em volta fica vermelha). */
const LAMP_CORE_FROM = 0.75;
const LAMP_HOT_FROM = 1.5;
const LAMP_HOT_MAX = 0.6;

/**
 * Teto da parte vermelha da lente (linear): abaixo do joelho do Neutral (0,76 a 1), onde o vermelho puro ainda não desbota para o rosa. Só o miolo quente
 * passa daí (e é ele que acende o bloom).
 */
const LAMP_RED_MAX = 0.9;

/** O emissivo (linear) da lanterna de cor `rgb` no peso `w` com o brilho `glow`: a conta que o GLSL (`carLamp`) espelha. */
export function lampEmission(rgb: readonly number[], w: number, glow: number): [number, number, number] {
  const sm = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hot = sm(LAMP_CORE_FROM, 1, w) * Math.min(LAMP_HOT_MAX, Math.max(0, (glow - LAMP_HOT_FROM) / 3));
  const red = Math.min(w * glow, LAMP_RED_MAX);
  return [0, 1, 2].map((i) => rgb[i] * red + (LAMP_HOT[i] * w * glow - rgb[i] * red) * hot) as [number, number, number];
}

/**
 * Brilho da lanterna e do freio por período (a `light` da paleta): de dia o miolo fica abaixo do limiar do bloom (discreto), à noite passa dele (halo, com o teto
 * do bloom); o freio é sempre mais forte. Os três números são provisórios, calibrados nas capturas da cor-brilho.
 */
export function tailGlow(light: number): { tail: number; brake: number } {
  if (light < 0.5) return { tail: 7, brake: 12 };
  if (light < 0.8) return { tail: 3.5, brake: 7 };
  return { tail: 1.6, brake: 4 };
}

/** Verniz estilizado por degrau: nada na Baixa; na Alta e no Ultra um pouco menos (o clearcoat de verdade já reflete o céu). */
export function varnishFor(q: Quality): number {
  return atLeast(q, 'high') ? 0.7 : atLeast(q, 'medium') ? 0.9 : 0;
}

const VERT_PARS = /* glsl */ `
attribute vec4 aPaint;
attribute vec4 aMat;
attribute float aLens;
varying float vLens;
attribute vec4 instExtra;
uniform float uPopup;
varying vec4 vMat;
varying float vPaintW;
varying float vBrake;
varying float vFin;
varying float vFinish;
varying vec3 vLocal;
varying vec3 vAccent;
varying float vCut;
`;

const VERT_COLOR = /* glsl */ `
vColor = vec4( 1.0 );
{
  int flags = int( instExtra.w + 0.5 );
  float livA = ( flags & 2 ) != 0 ? 1.0 : 0.0;
  float livB = ( flags & 4 ) != 0 ? 1.0 : 0.0;
  int layer = int( aPaint.z * 3.0 + 0.5 );
  float liv = layer == 1 ? livA : ( layer == 2 ? livB : ( layer == 3 ? max( livA, livB ) : 0.0 ) );
  vec3 painted = mix( instanceColor.rgb, instExtra.rgb, aPaint.y );
  vec3 base = color.rgb * mix( vec3( 1.0 ), painted, aPaint.x );
  vColor.rgb = mix( base, instExtra.rgb, liv );
  vBrake = ( flags & 1 ) != 0 ? 1.0 : 0.0;
  vMat = aMat;
  vLens = aLens;
  vPaintW = max( aPaint.x, liv );
  // Acabamento: só a carroceria pintada (não o acento nem a face que virou faixa) e só em quem tem o bit na instância.
  vFin = aPaint.x * ( 1.0 - aPaint.y ) * ( 1.0 - liv );
  vFinish = float( ( flags >> ${FINISH_SHIFT} ) & ${FINISH_MASK} );
  vLocal = position;
  vAccent = instExtra.rgb;
  // Câmera de Capô/Frente (nc/cameras): o bit 64 liga o corte e a altura dele (cm) vem acima dele; fora do corte vale 'infinito'.
  vCut = ( flags & ${CUT_BIT} ) != 0 ? float( ( flags >> ${CUT_SHIFT} ) & 255 ) * 0.01 : 1.0e4;
}
`;

const FRAG_PARS = /* glsl */ `
uniform float uSelfLight;
uniform float uHeadGlow;
uniform float uTailGlow;
uniform float uBrakeGlow;
uniform float uEnvBoost;
uniform float uVarnish;
uniform vec3 uStylizeSkyTop;
uniform vec3 uStylizeSkyHorizon;
uniform vec3 uStylizeGround;
varying float vLens;
// Lanterna (lampEmission em material.ts): a parte vermelha fica abaixo do joelho do Neutral (LAMP_RED_MAX); o miolo esquenta para LAMP_HOT acima de LAMP_HOT_FROM.
vec3 carLamp( vec3 lens, float w, float glow ) {
  float hot = smoothstep( ${LAMP_CORE_FROM.toFixed(2)}, 1.0, w ) * clamp( ( glow - ${LAMP_HOT_FROM.toFixed(2)} ) / 3.0, 0.0, ${LAMP_HOT_MAX.toFixed(2)} );
  return mix( lens * min( w * glow, ${LAMP_RED_MAX.toFixed(2)} ), vec3( ${LAMP_HOT.map((v) => v.toFixed(3)).join(', ')} ) * ( w * glow ), hot );
}
// Verniz estilizado (cor-brilho): a lataria reflete o céu do período (topo → horizonte) e, abaixo da linha do horizonte, o chão escuro, por um Fresnel de
// cartum (expoente 3). Analítico: nenhuma amostra de textura, nenhuma chamada; as cores vêm de setStylizePalette (uniformes compartilhados).
vec3 carVarnish( vec3 col, vec3 n, vec3 viewPos, float k ) {
  vec3 v = normalize( viewPos );
  float ndv = clamp( dot( n, v ), 0.0, 1.0 );
  vec3 r = inverseTransformDirection( reflect( -v, n ), viewMatrix );
  vec3 sky = mix( uStylizeSkyHorizon, uStylizeSkyTop, smoothstep( 0.03, 0.65, r.y ) );
  vec3 refl = mix( uStylizeGround, sky, smoothstep( -0.025, 0.025, r.y ) );
  float f = 0.05 + 0.95 * pow( 1.0 - ndv, 3.0 );
  return mix( col, refl, clamp( k * f, 0.0, 1.0 ) );
}
varying vec4 vMat;
varying float vPaintW;
varying float vBrake;
varying float vFin;
varying float vFinish;
varying vec3 vLocal;
varying vec3 vAccent;
varying float vCut;
// Gira a cor em volta do eixo cinza (o matiz anda, a luminosidade fica): o "outro tom" do camaleão quando o detalhe não tem cor.
vec3 carHueRot( vec3 c, float a ) {
  const vec3 k = vec3( 0.57735 );
  float ca = cos( a ); float sa = sin( a );
  return c * ca + cross( k, c ) * sa + k * dot( k, c ) * ( 1.0 - ca );
}
`;

/**
 * Rugosidade e metal por acabamento (peso `w*` = 1 só na carroceria pintada do acabamento da instância). Os pesos e o metal efetivo
 * (`fMetal`) ficam no escopo de `main` para o resto do fragmento (cor, emissivo, verniz, reflexo) usar.
 */
const FRAG_FINISH_MATERIAL = /* glsl */ `
float wMetallic = vFin * step( abs( vFinish - 1.0 ), 0.5 );
float wPearl = vFin * step( abs( vFinish - 2.0 ), 0.5 );
float wMatte = vFin * step( abs( vFinish - 3.0 ), 0.5 );
float wChrome = vFin * step( abs( vFinish - 4.0 ), 0.5 );
float wCham = vFin * step( abs( vFinish - 5.0 ), 0.5 );
float roughnessFactor = vMat.x;
float fMetal = vMat.y;
roughnessFactor = mix( roughnessFactor, 0.30, wMetallic ); fMetal = mix( fMetal, 0.55, wMetallic );
roughnessFactor = mix( roughnessFactor, 0.28, wPearl ); fMetal = mix( fMetal, 0.25, wPearl );
roughnessFactor = mix( roughnessFactor, 0.88, wMatte ); fMetal = mix( fMetal, 0.0, wMatte );
roughnessFactor = mix( roughnessFactor, 0.06, wChrome ); fMetal = mix( fMetal, 1.0, wChrome );
roughnessFactor = mix( roughnessFactor, 0.26, wCham ); fMetal = mix( fMetal, 0.45, wCham );
`;

/**
 * Depois da normal: a cor muda com o ângulo de visão (perolado, camaleão) ou vira espelho tingido (cromado), o fosco perde um pouco de
 * cor e o metálico ganha flocos. Os flocos são ruído de células de ~4,5 cm em coordenada de OBJETO (colam no carro quando ele anda) e
 * esmaecem com a distância (de longe seriam cintilação de subpixel).
 */
const FRAG_FINISH_COLOR = /* glsl */ `
float fFlake = 0.0;
{
  vec3 V = normalize( vViewPosition );
  float ndv = clamp( dot( normal, V ), 0.0, 1.0 );
  float fres = 1.0 - ndv;
  // Perolado: uma rampa de cores em tons pastel que anda com o ângulo, por cima da cor (sutil: a cor manda).
  vec3 ramp = mix( 0.5 + 0.5 * cos( 6.2831 * ( vec3( 0.0, 0.33, 0.67 ) + fres * 1.2 ) ), vec3( 1.0 ), 0.35 );
  diffuseColor.rgb = mix( diffuseColor.rgb, mix( diffuseColor.rgb, ramp, 0.34 ) + 0.05, wPearl );
  // Camaleão: de frente a cor da carroceria, de lado o outro tom — o do detalhe, se ele tem cor, ou a própria cor com o matiz girado.
  float camSat = max( vAccent.r, max( vAccent.g, vAccent.b ) ) - min( vAccent.r, min( vAccent.g, vAccent.b ) );
  vec3 camB = mix( clamp( carHueRot( diffuseColor.rgb, 2.3 ), 0.0, 1.0 ), vAccent, smoothstep( 0.25, 0.5, camSat ) );
  float flip = smoothstep( 0.32, 1.0, fres * 1.2 );
  diffuseColor.rgb = mix( diffuseColor.rgb, mix( diffuseColor.rgb, camB, flip ), wCham );
  diffuseColor.rgb = mix( diffuseColor.rgb, mix( vec3( 1.0 ), diffuseColor.rgb, 0.7 ), wChrome );
  float lum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( lum ), 0.14 * wMatte );
  if ( wMetallic > 0.0 ) {
    // Flocos: discos de ~1 cm em células de 2 cm (cada um com a sua orientação, que pisca com o ângulo); poucas células têm floco.
    vec3 p = vLocal * 48.0;
    vec3 cell = floor( p );
    float h1 = fract( sin( dot( cell, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
    float h2 = fract( h1 * 17.31 );
    float disc = 1.0 - smoothstep( 0.12, 0.34, length( fract( p ) - 0.5 ) );
    float spark = pow( abs( sin( h2 * 6.2831 + ndv * 7.0 + h1 * 11.0 ) ), 10.0 ) * step( 0.62, h1 );
    fFlake = disc * spark * wMetallic * ( 1.0 - smoothstep( 8.0, 30.0, length( vViewPosition ) ) );
  }
}
`;

export function createCarMaterial(): { material: THREE.MeshPhysicalMaterial; uniforms: CarUniforms } {
  const uniforms: CarUniforms = {
    uSelfLight: { value: 0.2 }, uHeadGlow: { value: 0.4 }, uTailGlow: { value: 0.9 }, uBrakeGlow: { value: 3.2 },
    uPopup: { value: 0 }, uEnvBoost: { value: 1.6 }, uVarnish: { value: varnishFor('high') },
  };
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.4, metalness: 0.2, // normal suave da malha (kit.ts), não sombreado plano
    clearcoat: 0, clearcoatRoughness: 0.06,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <color_vertex>', VERT_COLOR)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += aPaint.w * uPopup * 0.11;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif ( vLocal.y > vCut ) discard;')
      .replace('#include <roughnessmap_fragment>', FRAG_FINISH_MATERIAL)
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = fMetal;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAG_FINISH_COLOR}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // Uma fração da própria cor como emissivo: o lado na sombra (o que a câmera de perseguição vê)
        // continua lendo a cor do carro em vez do azul do céu. Estilização, não física.
        // Menos nas cores claras: o branco já lê branco na sombra e, com mais, estoura no bloom.
        float selfLum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
        totalEmissiveRadiance += diffuseColor.rgb * uSelfLight * ( 1.0 - fMetal * 0.6 ) * ( 1.0 - 0.65 * selfLum ) * ( 1.0 - wChrome );
        // Lente com miolo e borda (aLens: 0 no centro da tampa, 1 na borda; kit.ts, lensRadius).
        float lensW = mix( 1.0, ${LENS_RIM.toFixed(2)}, vLens );
        totalEmissiveRadiance += diffuseColor.rgb * ( vMat.z * lensW * uHeadGlow ) + carLamp( diffuseColor.rgb, vMat.w * lensW, mix( uTailGlow, uBrakeGlow, vBrake ) );
        totalEmissiveRadiance += mix( vec3( 1.0 ), diffuseColor.rgb * 2.2, 0.5 ) * fFlake * 0.9;`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat *= vPaintW * 0.7 * ( 1.0 - wMatte );
        #endif`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
        #if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
          // Peças metálicas (cromo, aro) e vidro refletem mais o céu; a pintura, pouco (a cor manda).
          radiance *= uEnvBoost * ( 0.35 + fMetal );
          #ifdef USE_CLEARCOAT
            clearcoatRadiance *= uEnvBoost * 0.55;
          #else
            // Média: não há verniz de verdade (setCarQuality). Os acabamentos brilhantes (metálico, perolado, camaleão) ganham, no lugar dele,
            // um brilho de Fresnel sobre a reflexão do céu que já foi amostrada: zero amostra a mais, zero chamada.
            radiance *= 1.0 + ( wMetallic + wPearl + wCham ) * 1.1 * pow( 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 ), 3.0 );
          #endif
        #endif`)
      // Verniz: só a lataria pintada (pintura e faixas), menos no fosco e no cromado (que já é espelho), depois de toda a luz e antes da saída.
      .replace('#include <opaque_fragment>', `outgoingLight = carVarnish( outgoingLight, normal, vViewPosition, uVarnish * vPaintW * ( 1.0 - wMatte ) * ( 1.0 - wChrome ) );
        #include <opaque_fragment>`);
  };
  // Um programa para todos os carros: a chave não muda por instância. v2 (N3): os acabamentos. (Era 'nitro-car-v1': o jogo mudou de nome.)
  // v4 (cor-brilho): a lanterna com miolo e o verniz estilizado.
  material.customProgramCacheKey = () => 'speed-tche-car-v4';
  // Luz estilizada (rampa, terminador, luz de borda) DEPOIS do callback e da chave acima: o stylize compõe com os dois.
  applyStylize(material, 'car');
  return { material, uniforms };
}

/**
 * Verniz de verdade (clearcoat) só na qualidade alta ou melhor (o programa troca uma vez, na troca de qualidade); o estilizado (reflexo do céu) é um
 * uniforme (`uVarnish`, 0 na Baixa), passado com os uniformes do material.
 */
export function setCarQuality(material: THREE.MeshPhysicalMaterial, q: Quality, uniforms?: CarUniforms): void {
  material.clearcoat = atLeast(q, 'high') ? 1 : 0;
  if (uniforms) uniforms.uVarnish.value = varnishFor(q);
}
