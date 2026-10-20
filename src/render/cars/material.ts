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
// - farol escamoteável (`aPaint.w`) sobe à noite;
// - V14 (docs/ondas/V14-tinta.md): brilho alongado da tinta (lobo do sol esticado ao longo do carro + faixa do horizonte, `carSheen`), lanterna em tira de LED
//   com halo na lataria em volta (a lista de lanternas do casco entra por uniformes, lote a lote) e o vidro preto com o céu só em faixa. Tudo analítico no shader.
import * as THREE from 'three';
import type { Quality } from '../../game/contracts';
import { atLeast } from '../../game/quality';
import { applyStylize } from '../stylize';
import { LADDER_SHIFT, LADDER_SIDE_M, LADDER_SLIDE_M } from './ladder';
import { CUT_BIT, CUT_SHIFT } from './mount';
import { LENS_RIM, MAX_LAMPS, type Lamp } from './kit';

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
  /** Teto do realce da luz direta (o sol) no verniz, no vidro e no cromo: ver `SUN_SPEC_CAP`. */
  uSunCap: { value: number };
  /** Quanto a lataria pintada volta ao matiz da tinta depois de toda a luz: ver `PAINT_HOLD`. */
  uPaintHold: { value: number };
  /** Força do céu refletido no vidro (Fresnel; V2, realismo 2): ver `GLASS_SKY`. */
  uGlassSky: { value: number };
  /** V14: (lobo do sol esticado, faixa do horizonte, halo das lanternas), por degrau e por "Reduzir efeitos": ver `sheenFor`. */
  uSheen: { value: THREE.Vector3 };
  /** V14: a faixa de elevação do céu refletido no vidro: `GLASS_BAND`. */
  uGlassBand: { value: THREE.Vector4 };
  /** V14: as lanternas do casco do lote que desenha agora (centro + liga; meia extensão + alcance): `setCarLamps`. */
  uLampC: { value: THREE.Vector4[] };
  uLampE: { value: THREE.Vector4[] };
  /** V14: a faixa de altura do vidro do casco do lote (y mínimo, y máximo): o reflexo do céu fica na parte de cima. */
  uGlassY: { value: THREE.Vector2 };
}

/**
 * O realce do sol tem teto (V2, docs/ondas/V2-gt.md §10). O sol é uma luz de ponto: no verniz (rugosidade 0,06), no vidro (0,05) e no cromo o realce
 * dele chega a milhares de vezes o limiar do bloom, e na câmera de corrida de dia acendia um ponto branco com halo na dobra do teto do GT (medido: some sem
 * o sol e some sem o verniz). O realce continua nítido e no mesmo lugar, só não passa deste valor (linear, antes do tom): fica um brilho, não um clarão.
 * O reflexo do céu (o env map) não tem teto. Provisório: medido no laboratório GL (tests/cor-brilho-gl.test.ts). (Subir a rugosidade só para o sol, a 0,3,
 * foi tentado e espalhou o realce num borrão branco maior: 39% de pixels estourados contra 4%.)
 */
export const SUN_SPEC_CAP = 0.5;

/**
 * A pintura guarda o matiz (V2, realismo; docs/ondas/V2-gt.md §11). O reflexo do céu azul (o env map, o verniz estilizado) e a luz dele somam azul em toda a
 * lataria: o GT de rubi saía ROSA na tampa e ROXO no para-choque na câmera de corrida de dia (medido: 18° e 63° fora do matiz da tinta). No HCT a lataria
 * vermelha lê vermelha e o reflexo fica no brilho. Depois de toda a luz, a cor da lataria pintada volta `PAINT_HOLD` do caminho para a CROMA da tinta com
 * a mesma luminância — o claro e o escuro, o realce e a sombra continuam onde estão, só o matiz deixa de ser o do céu. O brilho estourado (o realce do sol
 * e o do horizonte, luminância ≥ ~1) fica como está: o reflexo continua branco. Provisório: medido no laboratório GL (tests/cor-brilho-gl.test.ts).
 */
export const PAINT_HOLD = 0.7;

/**
 * O vidro preto-azulado com o céu refletido (V2, realismo 2; §12). O vidro lia azul-marinho (15,33,75 na câmera de corrida de dia, luma 0,125): o reflexo do
 * env map, em toda a face, era o grosso da luz do vidro. Medido: sem ele o vidro cai para (9,13,27), o preto-azulado do cenário. Agora o reflexo do env map
 * no vidro vale 15% (`wGlass`) e o céu entra pelo Fresnel de expoente 7 (`carGlassSky`: o gradiente do verniz, com 40% da croma, sem amostra nem chamada):
 * fraco de frente, forte nas quinas, onde o vidro deita (a câmera de corrida vê o vidro de trás quase de raspão, por isso o Fresnel pesa tanto). O reflexo
 * em faixa continua nas faixas de reflexo da cabine (`GLINT_SKY`). `GLASS_SKY` é a força, como o `uVarnish` é a da lataria. Provisório: medido no GL.
 */
export const GLASS_SKY = 0.9;
/** A faixa de elevação do céu refletido no vidro (V14): sobe de r.y = a até b e desce de c até d. Provisório: medido no GL. */
export const GLASS_BAND = [0.2, 0.3, 0.6, 0.75] as const;
/** O brilho da faixa de reflexo do vidro (V14): o céu refletido, com 30% da croma, vezes isto (a faixa é clara; o resto do vidro é preto). */
export const GLASS_GAIN = 1.9;
/** Onde, na altura do vidro (0 = a borda de baixo, 1 = a de cima), o céu refletido sobe de nada a cheio (V14): a faixa de reflexo mora na parte de cima do vidro. */
/** O teto do brilho da faixa de céu no vidro (linear, antes do tom): a borda de cima do vidro não acende (V2: o ponto branco no teto do GT). */
export const GLASS_PEAK = 0.45;
export const GLASS_TOP = [0.3, 0.8] as const;
/** A croma do céu no vidro (V14): quanto da cor do céu sobra na faixa (era 40%: o vidro lia azul-marinho; o pé do Neutral satura qualquer tom em escuro, então a faixa é quase cinza). */
export const GLASS_CHROMA = 0.08;

/**
 * Lanterna (cor-brilho, docs/ondas/cor-brilho.md): o miolo esquenta para laranja-branco quando o brilho passa de `LAMP_HOT_FROM` (à noite e no freio),
 * a borda continua vermelha. `w` é o peso do emissivo: o do pincel (`aMat.w`) × o da lente, que cai do centro (1) para a borda (`LENS_RIM`, atributo `aLens`).
 */
export const LAMP_HOT: readonly [number, number, number] = [1, 0.6, 0.15];
/** De que peso em diante a lente esquenta (o miolo; a coroa em volta fica vermelha). */
const LAMP_CORE_FROM = 0.75;
const LAMP_HOT_FROM = 0.9;
const LAMP_HOT_MAX = 0.6;

/**
 * Teto da parte vermelha da lente (linear): abaixo do joelho do Neutral (0,76 a 1), onde o vermelho puro ainda não desbota para o rosa. Só o miolo quente
 * passa daí (e é ele que acende o bloom).
 */
const LAMP_RED_MAX = 0.9;

/**
 * O emissivo (linear) da lanterna de cor `rgb` no peso `w` com o brilho `glow`: a conta que o GLSL (`carLamp`) espelha. `wRed` é o peso da parte VERMELHA (a tira, com patamar:
 * `lensWeight`); o miolo quente (e o bloom que ele acende) segue o peso linear `w`: o patamar no miolo dobrava a área acesa e o bloom dela clareava a pista à noite (estrada-gl).
 */
export function lampEmission(rgb: readonly number[], w: number, glow: number, wRed: number = w): [number, number, number] {
  const sm = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hot = sm(LAMP_CORE_FROM, 1, w) * Math.min(LAMP_HOT_MAX, Math.max(0, (glow - LAMP_HOT_FROM) / 3));
  const red = Math.min(wRed * glow, LAMP_RED_MAX);
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

/**
 * Brilho alongado da tinta (V14; docs/ondas/V14-tinta.md). O HC2 tem gradientes longos e nítidos na lataria: uma faixa de luz que corre pelo capô, pelo teto e pela lateral, e
 * escurece nas dobras; a nossa lia quase uniforme (o realce do sol tem teto de 0,5 desde a V2, e o verniz só mexe na quina). `carSheen` soma, analiticamente, (1) o LOBO do
 * sol esticado AO LONGO do carro (Ward anisotrópico: estreito na largura, largo no comprimento: onde a lataria é curva na largura vira uma faixa que corre por ela) e (2) a
 * FAIXA DO HORIZONTE (uma faixa clara logo acima da linha do horizonte refletida, a que o Fresnel do verniz não alcança). Sem cubemap, sem amostra, sem programa por quadro.
 * A luz do brilho é branca puxada 45% ao matiz da tinta e some onde a lataria já é clara (luma ≥ 0,7 → 1,2): o branco não estoura, o vermelho continua vermelho. Provisório: medido no GL.
 */
/** A largura do lobo do sol (V14), em tan² do meio-vetor: larga ao longo do carro, estreita na largura. */
export const SHEEN_LOBE_ALONG = 0.45;
export const SHEEN_LOBE_ACROSS = 0.015;
/** O teto do realce do brilho da tinta (linear, antes do tom): a faixa clara de uma lataria escura fica abaixo do estouro (ver `carSheen`). */
export const SHEEN_PEAK = 0.7;
/** A rampa pela luminância do albedo (linear) em que o realce entra (V14): abaixo de a nada, acima de b cheio. Ver `carSheen`. */
export const SHEEN_DARK = [0.02, 0.12] as const;
/** Quanto a tinta colorida escurece fora da faixa de brilho (V14): ver `carSheen`. */
export const SHEEN_DEPTH = 0.22;
export const SHEEN_FULL = { lobe: 0.8, band: 0.55, halo: 1 } as const;

/** O brilho por degrau e por "Reduzir efeitos": a Baixa fica com o lobo só (o brilho simples); "Reduzir efeitos" idem e mais fraco, sem faixa e sem halo (sem clarão). */
export function sheenFor(q: Quality, reduce: boolean): { lobe: number; band: number; halo: number } {
  if (reduce) return { lobe: 0.35, band: 0, halo: 0 };
  if (!atLeast(q, 'medium')) return { lobe: 0.45, band: 0, halo: 0 };
  return { ...SHEEN_FULL };
}

/**
 * Perfil da lente (V14): a lanterna é uma TIRA acesa, não um cone. O peso do emissivo fica em 1 até `LENS_PLATEAU` do raio (o `aLens`: 0 no centro, 1 na borda) e cai suave
 * até `LENS_RIM` na borda (era linear: o miolo era um ponto e o resto, uma rampa). Numa lente retangular o `aLens` é a distância "de caixa" (o leque tem o vértice no centro e
 * as bordas do polígono a 1): a tira acende uniforme e a moldura vermelha fica fina. A função que o GLSL (`lensW`) espelha.
 */
export const LENS_PLATEAU = 0.35;
export function lensWeight(r: number): number {
  const t = Math.min(1, Math.max(0, (r - LENS_PLATEAU) / (1 - LENS_PLATEAU)));
  return 1 - (1 - LENS_RIM) * t * t * (3 - 2 * t);
}

/**
 * Halo da lanterna na lataria em volta (V14): o brilho (linear) do emissivo vermelho que escorre pela carroceria perto da lente, por `glow` (o mesmo da lanterna: período e
 * freio). Cresce com o brilho de forma suave (expoente 0,55: o freio de dia pesa ~1,6× a lanterna, a noite ~2,2×) e fica abaixo da metade do limiar do bloom de dia
 * (o teto do bloom de dia continua o da lanterna, tests/cor-brilho.test.ts). A função que o GLSL (`carHaloEmission`) espelha.
 */
export function haloEmission(glow: number): number { return 0.3 * Math.pow(Math.max(glow, 0), 0.55); }

/** Escreve as lanternas e a faixa de altura do vidro do casco nos uniformes do material (nenhuma = zeradas). O lote chama uma vez, na criação: um material por casco com lanternas. */
export function setCarLamps(uniforms: Pick<CarUniforms, 'uLampC' | 'uLampE' | 'uGlassY'>, lamps: ReadonlyArray<Lamp> | undefined, glassY?: readonly [number, number] | null): void {
  if (glassY) uniforms.uGlassY.value.set(glassY[0], glassY[1]); else uniforms.uGlassY.value.set(0, 1);
  for (let i = 0; i < MAX_LAMPS; i++) {
    const l = lamps?.[i];
    if (l) { uniforms.uLampC.value[i].set(l.c[0], l.c[1], l.c[2], 1); uniforms.uLampE.value[i].set(l.e[0], l.e[1], l.e[2], l.reach); }
    else { uniforms.uLampC.value[i].set(0, 0, 0, 0); uniforms.uLampE.value[i].set(0, 0, 0, 0.05); }
  }
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
varying vec3 vFwd;
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
  // V14: o eixo do comprimento do carro (+z do casco) no espaço da vista, pela matriz da instância: o lobo do brilho é esticado ao longo dele.
  #ifdef USE_INSTANCING
    vFwd = mat3( modelViewMatrix ) * mat3( instanceMatrix ) * vec3( 0.0, 0.0, 1.0 );
  #else
    vFwd = mat3( modelViewMatrix ) * vec3( 0.0, 0.0, 1.0 );
  #endif
  // Câmera de Capô/Frente (nc/cameras): o bit 64 liga o corte e a altura dele (cm) vem acima dele; fora do corte vale 'infinito'.
  vCut = ( flags & ${CUT_BIT} ) != 0 ? float( ( flags >> ${CUT_SHIFT} ) & 255 ) * 0.01 : 1.0e4;
}
`;

/** O brilho da tinta e o halo das lanternas: depois de `lights_pars_begin` (a luz direcional da cena, `directionalLights`, é declarada lá). */
const FRAG_SHEEN = /* glsl */ `
// Brilho alongado da tinta (SHEEN_FULL em material.ts): o lobo do sol esticado ao longo do carro (Ward anisotrópico: estreito na largura, largo no comprimento) e a faixa
// clara logo acima do horizonte refletido. \`k\` = (lobo, faixa, halo) × o peso da lataria pintada. Só a luz direcional da cena (o sol do período: some à noite com a luz dele).
vec3 carSheen( vec3 col, vec3 paint, vec3 n, vec3 viewPos, vec3 fwd, vec3 k ) {
  const vec3 W = vec3( 0.2126, 0.7152, 0.0722 );
  vec3 v = normalize( viewPos );
  float ndv = clamp( dot( n, v ), 0.0, 1.0 );
  float s = 0.0;
  #if NUM_DIR_LIGHTS > 0
    vec3 L = directionalLights[ 0 ].direction;
    float sunK = clamp( dot( directionalLights[ 0 ].color, W ) * 0.3, 0.0, 1.0 );
    vec3 t = fwd - n * dot( fwd, n );
    t *= inversesqrt( max( dot( t, t ), 1.0e-4 ) );
    vec3 b = cross( n, t );
    vec3 h = normalize( L + v );
    float hn = max( dot( n, h ), 0.2 );
    float ht = dot( h, t ) / hn;
    float hb = dot( h, b ) / hn;
    s += k.x * sunK * exp( - ( ht * ht / ${SHEEN_LOBE_ALONG.toFixed(3)} + hb * hb / ${SHEEN_LOBE_ACROSS.toFixed(4)} ) );
  #endif
  vec3 r = inverseTransformDirection( reflect( -v, n ), viewMatrix );
  float strip = smoothstep( -0.02, 0.05, r.y ) * ( 1.0 - smoothstep( 0.08, 0.45, r.y ) );
  s += k.y * strip * ( 0.35 + 0.65 * pow( 1.0 - ndv, 2.0 ) );
  vec3 tint = paint / max( max( paint.r, max( paint.g, paint.b ) ), 1.0e-3 );
  float lc = dot( col, W );
  // Profundidade da tinta (como o HC2: cor funda onde não há brilho, claro só na faixa): a tinta COLORIDA perde ${SHEEN_DEPTH.toFixed(2)} fora do brilho; o branco, o prata e o preto não (o branco lê branco).
  float chroma = ( max( paint.r, max( paint.g, paint.b ) ) - min( paint.r, min( paint.g, paint.b ) ) ) / max( max( paint.r, max( paint.g, paint.b ) ), 1.0e-3 );
  col *= 1.0 - ${SHEEN_DEPTH.toFixed(2)} * smoothstep( 0.25, 0.7, chroma ) * ( 1.0 - clamp( s * 1.6, 0.0, 1.0 ) ) * clamp( k.y * 2.2, 0.0, 1.0 );
  // Escurece nas dobras: o que olha para baixo (a saia, a cava da roda, o ventre do para-lama) perde até 30% (só com a faixa ligada: a Baixa e o \`Reduzir efeitos\` não escurecem).
  float down = smoothstep( 0.45, -0.1, inverseTransformDirection( n, viewMatrix ).y );
  col *= 1.0 - 0.30 * down * clamp( k.y * 2.2, 0.0, 1.0 );
  // O realce satura suave (teto ${SHEEN_PEAK.toFixed(2)}, antes do tom): o carro escuro não acende um ponto branco (V2: o sol no teto do GT de ônix), o claro e o médio ganham a faixa inteira.
  s = ${SHEEN_PEAK.toFixed(2)} * ( 1.0 - exp( - s * 1.6 ) );
  // A tinta muito escura (ônix) não leva o realce: o teto e o capô dela já refletem o céu rente, o realce do sol já fica num platô logo abaixo do estouro (uSunCap), e somar
  // qualquer coisa nele o acende em branco (V2: 0,19% estourado sem o brilho, 0,6–1,1% com ele, mesmo com 10% da força). Rampa pela luminância do albedo: ônix 0, grafite um quarto.
  s *= smoothstep( ${SHEEN_DARK[0].toFixed(3)}, ${SHEEN_DARK[1].toFixed(3)}, dot( paint, W ) );
  // Soma "em tela" (screen): o que já é claro ganha menos, e nunca passa de 1.
  return col + ( vec3( 1.0 ) - min( col, vec3( 1.0 ) ) ) * mix( vec3( 1.0 ), tint, 0.45 ) * s;
}
// Halo das lanternas (V14): quanto a lataria em \`p\` (espaço do casco) está perto de uma lente acesa: 1 na lente, caindo exponencialmente com a distância à caixa dela
// (alcance em uLampE.w). \`carHaloEmission\` é a \`haloEmission\` de material.ts.
float carLampHalo( vec3 p ) {
  float h = 0.0;
  for ( int i = 0; i < ${MAX_LAMPS}; i++ ) {
    vec4 c = uLampC[ i ]; vec4 e = uLampE[ i ];
    vec3 q = max( abs( p - c.xyz ) - e.xyz, 0.0 );
    h += c.w * exp( - 2.2 * length( q ) / e.w );
  }
  return min( h, 1.0 );
}
float carHaloEmission( float glow ) { return 0.3 * pow( max( glow, 0.0 ), 0.55 ); }
`;

const FRAG_PARS = /* glsl */ `
uniform float uSelfLight;
uniform float uHeadGlow;
uniform float uTailGlow;
uniform float uBrakeGlow;
uniform float uEnvBoost;
uniform float uVarnish;
uniform float uSunCap;
uniform float uPaintHold;
uniform float uGlassSky;
uniform vec3 uSheen;
uniform vec4 uGlassBand;
uniform vec2 uGlassY;
uniform vec4 uLampC[ ${MAX_LAMPS} ];
uniform vec4 uLampE[ ${MAX_LAMPS} ];
uniform vec3 uStylizeSkyTop;
uniform vec3 uStylizeSkyHorizon;
uniform vec3 uStylizeGround;
varying float vLens;
// Lanterna (lampEmission em material.ts): a parte vermelha fica abaixo do joelho do Neutral (LAMP_RED_MAX); o miolo esquenta para LAMP_HOT acima de LAMP_HOT_FROM.
vec3 carLamp( vec3 lens, float w, float wRed, float glow ) {
  float hot = smoothstep( ${LAMP_CORE_FROM.toFixed(2)}, 1.0, w ) * clamp( ( glow - ${LAMP_HOT_FROM.toFixed(2)} ) / 3.0, 0.0, ${LAMP_HOT_MAX.toFixed(2)} );
  return mix( lens * min( wRed * glow, ${LAMP_RED_MAX.toFixed(2)} ), vec3( ${LAMP_HOT.map((v) => v.toFixed(3)).join(', ')} ) * ( w * glow ), hot );
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
// Céu no vidro (GLASS_SKY em material.ts): o gradiente do verniz com o azul puxado para o cinza (40% da croma), mas só numa FAIXA de reflexo (V14): onde o vidro vê o céu entre
// ~15° e ~50° de elevação (a faixa), pesando pelo Fresnel de expoente 4. Fora da faixa o vidro fica preto. Era o Fresnel de expoente 7 em todo o vidro (azul-marinho chapado).
vec3 carGlassSky( vec3 col, vec3 n, vec3 viewPos, float k, float gh ) {
  vec3 v = normalize( viewPos );
  float ndv = clamp( dot( n, v ), 0.0, 1.0 );
  vec3 r = inverseTransformDirection( reflect( -v, n ), viewMatrix );
  vec3 sky = mix( uStylizeSkyHorizon, uStylizeSkyTop, smoothstep( 0.03, 0.65, r.y ) );
  vec3 refl = mix( uStylizeGround, sky, smoothstep( -0.025, 0.025, r.y ) );
  refl = mix( vec3( dot( refl, vec3( 0.2126, 0.7152, 0.0722 ) ) ), refl, ${GLASS_CHROMA.toFixed(2)} ) * ${GLASS_GAIN.toFixed(2)};
  refl *= min( 1.0, ${GLASS_PEAK.toFixed(2)} / max( dot( refl, vec3( 0.2126, 0.7152, 0.0722 ) ), 1.0e-3 ) );
  float band = smoothstep( uGlassBand.x, uGlassBand.y, r.y ) * ( 1.0 - smoothstep( uGlassBand.z, uGlassBand.w, r.y ) );
  return mix( col, refl, clamp( k * band * smoothstep( ${GLASS_TOP[0].toFixed(2)}, ${GLASS_TOP[1].toFixed(2)}, gh ) * ( 0.1 + 0.9 * pow( 1.0 - ndv, 4.0 ) ), 0.0, 1.0 ) );
}
// A pintura guarda o matiz (PAINT_HOLD em material.ts): a cor vai para a croma da tinta (\`paint\`, o albedo) com a luminância que a luz deu, menos no
// brilho estourado. \`k\` = força × peso da lataria pintada.
vec3 carPaintHold( vec3 col, vec3 paint, float k ) {
  const vec3 W = vec3( 0.2126, 0.7152, 0.0722 );
  float lc = dot( col, W );
  vec3 chroma = paint / max( dot( paint, W ), 1.0e-3 );
  vec3 held = chroma * lc;
  // Acima de 1 a croma da tinta estoura um canal sozinho: divide pelo maior canal acima de 1 (mantém o matiz, o tom mapping cuida do resto).
  held /= max( 1.0, max( held.r, max( held.g, held.b ) ) );
  return mix( col, held, k * ( 1.0 - smoothstep( 0.55, 1.1, lc ) ) );
}
varying vec4 vMat;
varying float vPaintW;
varying float vBrake;
varying float vFin;
varying float vFinish;
varying vec3 vLocal;
varying vec3 vAccent;
varying float vCut;
varying vec3 vFwd;
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
// Vidro: rugosidade baixa, metal alto, sem luz (o mesmo critério dos testes: tests/estilo-carro.test.ts).
float wGlass = step( vMat.x, 0.081 ) * step( 0.6, vMat.y ) * ( 1.0 - step( 0.01, vMat.z + vMat.w ) ) * ( 1.0 - vPaintW );
// V14: a luz de borda (stylize) não tinge o vidro de azul: preto profundo, o céu só na faixa de reflexo (carGlassSky).
#define STYLIZE_RIM_MASK ( 1.0 - 0.92 * wGlass )
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
  // V14: o vidro é preto (o do HC2 é quase preto, com o céu em faixa): a cor própria dele (o azul dos vidros de arquivo) perde 90% da croma e metade do brilho.
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( lum * 0.5 ), 0.9 * wGlass );
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

// Partes que se mexem no vértice (aPaint.w): 1 = farol escamoteável (sobe com `uPopup`); 0,5 = a escada do carro da firma (V6c), que anda de lado e
// para trás conforme os bits altos da instância (cars/ladder.ts: o mesmo lote do casco, sem chamada nova). Os demais vértices têm w = 0.
const VERT_MOVE = /* glsl */ `
transformed.y += step( 0.9, aPaint.w ) * uPopup * 0.11;
{
  float ladW = step( 0.3, aPaint.w ) * ( 1.0 - step( 0.7, aPaint.w ) );
  if ( ladW > 0.0 ) {
    int fl = int( instExtra.w + 0.5 );
    float lq = float( ( fl >> ${LADDER_SHIFT} ) & 15 );
    lq = lq > 7.5 ? lq - 16.0 : lq;
    float ls = float( ( fl >> ${LADDER_SHIFT + 4} ) & 7 ) / 7.0;
    transformed.x += lq / 7.0 * ${LADDER_SIDE_M.toFixed(3)};
    transformed.z += ls * ${LADDER_SLIDE_M.toFixed(3)};
    transformed.y -= ls * 0.04;
  }
}
`;

export function createCarMaterial(): { material: THREE.MeshPhysicalMaterial; uniforms: CarUniforms } {
  const uniforms: CarUniforms = {
    uSelfLight: { value: 0.2 }, uHeadGlow: { value: 0.4 }, uTailGlow: { value: 0.9 }, uBrakeGlow: { value: 3.2 },
    uPopup: { value: 0 }, uEnvBoost: { value: 1.6 }, uVarnish: { value: varnishFor('high') }, uSunCap: { value: SUN_SPEC_CAP }, uPaintHold: { value: PAINT_HOLD }, uGlassSky: { value: GLASS_SKY },
    uSheen: { value: new THREE.Vector3(SHEEN_FULL.lobe, SHEEN_FULL.band, SHEEN_FULL.halo) },
    uGlassBand: { value: new THREE.Vector4(...GLASS_BAND) },
    uGlassY: { value: new THREE.Vector2(0, 1) },
    uLampC: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4()) },
    uLampE: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4(0, 0, 0, 0.05)) },
  };
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.4, metalness: 0.2, // normal suave da malha (kit.ts), não sombreado plano
    clearcoat: 0, clearcoatRoughness: 0.06,
  });
  material.userData.carUniforms = uniforms; // V14: o lote (cars.ts) e o laboratório leem os uniformes do material
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <color_vertex>', VERT_COLOR)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
${VERT_MOVE}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <lights_pars_begin>', `#include <lights_pars_begin>\n${FRAG_SHEEN}`)
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
        // A lanterna é uma tira (patamar, lensWeight) só na parte VERMELHA: o miolo quente (que acende o bloom) e o farol seguem com a rampa linear de sempre (V14: o patamar no miolo dobrava a área acesa e o bloom clareava a pista à noite: estrada-gl).
        float lensW = mix( 1.0, ${LENS_RIM.toFixed(2)}, vLens );
        float tailW = 1.0 - ( 1.0 - ${LENS_RIM.toFixed(2)} ) * smoothstep( ${LENS_PLATEAU.toFixed(2)}, 1.0, vLens );
        totalEmissiveRadiance += diffuseColor.rgb * ( vMat.z * lensW * uHeadGlow ) + carLamp( diffuseColor.rgb, vMat.w * lensW, vMat.w * tailW, mix( uTailGlow, uBrakeGlow, vBrake ) );
        totalEmissiveRadiance += mix( vec3( 1.0 ), diffuseColor.rgb * 2.2, 0.5 ) * fFlake * 0.9;
        // V14: o halo da lanterna escorre pela lataria em volta da lente (fora da própria lente), no brilho dela (período e freio).
        totalEmissiveRadiance += vec3( 1.0, 0.14, 0.07 ) * ( carLampHalo( vLocal ) * uSheen.z * ( 1.0 - step( 0.01, vMat.w ) ) * carHaloEmission( mix( uTailGlow, uBrakeGlow, vBrake ) ) );`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat *= vPaintW * 0.7 * ( 1.0 - wMatte );
        #endif`)
      .replace('#include <lights_fragment_maps>', `// O realce do sol tem teto (SUN_SPEC_CAP): aqui a luz direta já foi somada (lights_fragment_begin) e o reflexo do céu ainda não.
        reflectedLight.directSpecular = min( reflectedLight.directSpecular, vec3( uSunCap ) );
        #ifdef USE_CLEARCOAT
          clearcoatSpecularDirect = min( clearcoatSpecularDirect, vec3( uSunCap ) );
        #endif
        // V14: o vidro é preto: o sol nele (neutro, rente) vale 30% do teto (o reflexo claro do vidro é a faixa de céu, carGlassSky).
        reflectedLight.directSpecular *= 1.0 - 0.7 * wGlass;
        #include <lights_fragment_maps>
        #if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
          // Peças metálicas (cromo, aro) e vidro refletem mais o céu; a pintura, pouco (a cor manda).
          radiance *= uEnvBoost * ( 0.35 + fMetal );
          radiance *= mix( 1.0, 0.15, wGlass );
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
        // V14: o brilho alongado da tinta (lobo do sol + faixa do horizonte), só na lataria pintada, antes de ela voltar ao matiz.
        outgoingLight = carSheen( outgoingLight, diffuseColor.rgb, normal, vViewPosition, vFwd, uSheen * ( vPaintW * ( 1.0 - wMatte ) * ( 1.0 - wChrome ) ) );
        // O vidro reflete o céu pelo Fresnel (GLASS_SKY): o reflexo do env map dele caiu acima, a base é preta.
        outgoingLight = carGlassSky( outgoingLight, normal, vViewPosition, uGlassSky * wGlass, clamp( ( vLocal.y - uGlassY.x ) / max( uGlassY.y - uGlassY.x, 0.05 ), 0.0, 1.0 ) );
        // A pintura guarda o matiz (PAINT_HOLD): só a lataria pintada, menos o cromado (espelho) e o camaleão e o perolado (que mudam de cor de propósito).
        outgoingLight = carPaintHold( outgoingLight, diffuseColor.rgb, uPaintHold * vPaintW * ( 1.0 - wChrome ) * ( 1.0 - wCham ) * ( 1.0 - wPearl ) );
        #include <opaque_fragment>`);
  };
  // Um programa para todos os carros: a chave não muda por instância. v2 (N3): os acabamentos. (Era 'nitro-car-v1': o jogo mudou de nome.)
  // v4 (cor-brilho): a lanterna com miolo e o verniz estilizado. v5 (V2): o teto no realce do sol (`SUN_SPEC_CAP`). v6 (V2, realismo): a pintura guarda o matiz. v7 (V2, realismo 2): o céu refletido no vidro. v9 (V14): o brilho alongado, a lanterna em tira com halo e o vidro em faixa.
  material.customProgramCacheKey = () => 'speed-tche-car-v9';
  // Luz estilizada (rampa, terminador, luz de borda) DEPOIS do callback e da chave acima: o stylize compõe com os dois.
  applyStylize(material, 'car');
  return { material, uniforms };
}

/**
 * Verniz de verdade (clearcoat) só na qualidade alta ou melhor (o programa troca uma vez, na troca de qualidade); o estilizado (reflexo do céu) é um
 * uniforme (`uVarnish`, 0 na Baixa), passado com os uniformes do material.
 */
export function setCarQuality(material: THREE.MeshPhysicalMaterial, q: Quality, uniforms?: CarUniforms, reduce = false): void {
  material.clearcoat = atLeast(q, 'high') ? 1 : 0;
  if (uniforms) { uniforms.uVarnish.value = varnishFor(q); setCarSheen(uniforms, q, reduce); }
}

/** O brilho da tinta e o halo das lanternas do degrau (e de "Reduzir efeitos") nos uniformes (V14). */
export function setCarSheen(uniforms: Pick<CarUniforms, 'uSheen'>, q: Quality, reduce: boolean): void {
  const s = sheenFor(q, reduce);
  uniforms.uSheen.value.set(s.lobe, s.band, s.halo);
}
