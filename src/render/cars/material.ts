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
}

const VERT_PARS = /* glsl */ `
attribute vec4 aPaint;
attribute vec4 aMat;
attribute vec4 instExtra;
uniform float uPopup;
varying vec4 vMat;
varying float vPaintW;
varying float vBrake;
varying float vFin;
varying float vFinish;
varying vec3 vLocal;
varying vec3 vAccent;
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
  vPaintW = max( aPaint.x, liv );
  // Acabamento: só a carroceria pintada (não o acento nem a face que virou faixa) e só em quem tem o bit na instância.
  vFin = aPaint.x * ( 1.0 - aPaint.y ) * ( 1.0 - liv );
  vFinish = float( ( flags >> ${FINISH_SHIFT} ) & ${FINISH_MASK} );
  vLocal = position;
  vAccent = instExtra.rgb;
}
`;

const FRAG_PARS = /* glsl */ `
uniform float uSelfLight;
uniform float uHeadGlow;
uniform float uTailGlow;
uniform float uBrakeGlow;
uniform float uEnvBoost;
varying vec4 vMat;
varying float vPaintW;
varying float vBrake;
varying float vFin;
varying float vFinish;
varying vec3 vLocal;
varying vec3 vAccent;
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
    uPopup: { value: 0 }, uEnvBoost: { value: 1.6 },
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
      .replace('#include <roughnessmap_fragment>', FRAG_FINISH_MATERIAL)
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = fMetal;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAG_FINISH_COLOR}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // Uma fração da própria cor como emissivo: o lado na sombra (o que a câmera de perseguição vê)
        // continua lendo a cor do carro em vez do azul do céu. Estilização, não física.
        // Menos nas cores claras: o branco já lê branco na sombra e, com mais, estoura no bloom.
        float selfLum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
        totalEmissiveRadiance += diffuseColor.rgb * uSelfLight * ( 1.0 - fMetal * 0.6 ) * ( 1.0 - 0.65 * selfLum ) * ( 1.0 - wChrome );
        totalEmissiveRadiance += diffuseColor.rgb * ( vMat.z * uHeadGlow + vMat.w * mix( uTailGlow, uBrakeGlow, vBrake ) );
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
        #endif`);
  };
  // Um programa para todos os carros: a chave não muda por instância. v2 (N3): os acabamentos. (Era 'nitro-car-v1': o jogo mudou de nome.)
  material.customProgramCacheKey = () => 'speed-tche-car-v2';
  // Luz estilizada (rampa, terminador, luz de borda) DEPOIS do callback e da chave acima: o stylize compõe com os dois.
  applyStylize(material, 'car');
  return { material, uniforms };
}

/** Verniz só na qualidade alta ou melhor (o programa troca uma vez, na troca de qualidade). */
export function setCarQuality(material: THREE.MeshPhysicalMaterial, q: Quality): void {
  material.clearcoat = atLeast(q, 'high') ? 1 : 0;
}
