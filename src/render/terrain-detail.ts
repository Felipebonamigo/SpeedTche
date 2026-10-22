// V22 · F1: o DETALHE do chão (docs/ondas/V22-f1-chao.md). Até aqui o terreno era só cor por vértice (4 m ao longo × 12 colunas, interpolada): um "feltro" liso de 600 × 200 px
// com desvio de detalhe fino de 0,0002. Aqui o material do chão ganha, no fragmento, duas escalas de variação (manchas de ~12 m e tufos de ~2,4 m, mais um grão de ~0,12 m que
// só a Alta e a Ultra pagam), uma deriva de matiz entre elas, a ceifa (faixas de capim) ou o ondulado (areia) por bioma e uma borda irregular entre o acostamento e o chão.
//
// ESTABILIDADE (a regra que manda em tudo daqui): o mundo é remontado no referencial local do carro a cada quadro (docs/DESIGN.md), então o detalhe NUNCA pode vir da posição de
// mundo, da câmera ou da tela: ele vem de `aDet`, um atributo por vértice com a lateral (m, com o sinal do lado) e a distância ABSOLUTA ao longo da pista (m). O mesmo ponto do chão
// tem sempre o mesmo `aDet`, qualquer que seja o quadro, e o detalhe fica NO chão em vez de "nadar" por cima dele.
//
// O ruído é UM ladrilho RGBA 256² (4 ruídos de valor independentes, gerado aqui, sem arquivo): 1 leitura por oitava, mipmap e anisotropia fazem a antiserrilha de graça. O ladrilho
// repete um número INTEIRO de vezes no comprimento da pista (`detailTiling`), então a volta fecha sem emenda e a distância ao longo pode passar do fim da volta (o `Strip` a
// desenrola: 4 m por ponto) sem que o padrão salte.
import * as THREE from 'three';
import type { SceneryId } from '../core/types';
import type { Quality } from '../game/contracts';
import { hash3 } from './noise';

/** Célula do ruído grosso (m), células do ladrilho (por lado), e as razões das outras duas escalas: fina = 12 / 5 = 2,4 m; grão = 12 / 96 = 0,125 m. */
export const DETAIL_COARSE_M = 12;
export const DETAIL_TILE_CELLS = 16;
export const DETAIL_FINE_RATIO = 5;
export const DETAIL_GRAIN_RATIO = 96;
export const DETAIL_FINE_M = DETAIL_COARSE_M / DETAIL_FINE_RATIO;

/** O que o chão de um bioma pede ao detalhe. Todas as amplitudes são multiplicativas e referidas ao que se VÊ na tela (0,10 = ±10% de brilho; o shader eleva ao quadrado: o albedo é linear) e ficam em 0..0,16. */
export interface TerrainDetail {
  /** Mancha grossa (12 m) e tufo fino (2,4 m) em luma, e o grão (0,125 m, só Alta/Ultra). */
  coarseAmp: number;
  fineAmp: number;
  grainAmp: number;
  /** Deriva de matiz (°) das manchas: o capim vai do amarelado ao azul-esverdeado, a areia do ocre ao rosado. */
  hueDeg: number;
  /** A oitava fina começa a sumir em `fadeM` (m da câmera) e acaba em `fadeEndM` (anti-cintilação; a derivada na tela corta antes se a célula passar de ~2 px). */
  fadeM: number;
  fadeEndM: number;
  /** Ceifa (faixas de capim paralelas à pista, `mowPeriodM` de passo) e ondulado (cristas de areia) por lado: [esquerda, direita]. */
  mow: readonly [number, number];
  mowPeriodM: number;
  ripple: readonly [number, number];
  /** 1 = borda irregular entre o acostamento (`verge`) e o chão, com cascalho; 0 = borda reta (a calçada da cidade). */
  edge: number;
  gravel: number;
}

const DETAIL: Record<SceneryId, TerrainDetail> = {
  tropical: { coarseAmp: 0.15, fineAmp: 0.13, grainAmp: 0.16, hueDeg: 5, fadeM: 60, fadeEndM: 130, mow: [0.09, 0.09], mowPeriodM: 5.5, ripple: [0, 0], edge: 1, gravel: 0.7 },
  savanna: { coarseAmp: 0.15, fineAmp: 0.13, grainAmp: 0.16, hueDeg: 6, fadeM: 60, fadeEndM: 130, mow: [0.07, 0.07], mowPeriodM: 6.5, ripple: [0, 0], edge: 1, gravel: 0.7 },
  alpine: { coarseAmp: 0.14, fineAmp: 0.12, grainAmp: 0.15, hueDeg: 4, fadeM: 60, fadeEndM: 130, mow: [0.07, 0.07], mowPeriodM: 5.5, ripple: [0, 0], edge: 1, gravel: 0.6 },
  desert: { coarseAmp: 0.14, fineAmp: 0.12, grainAmp: 0.16, hueDeg: 5, fadeM: 60, fadeEndM: 130, mow: [0, 0], mowPeriodM: 5, ripple: [0.10, 0.10], edge: 1, gravel: 1 },
  // O lado do mar (direita) é areia: ondulado; o outro é capim: ceifa.
  coast: { coarseAmp: 0.14, fineAmp: 0.12, grainAmp: 0.16, hueDeg: 5, fadeM: 60, fadeEndM: 130, mow: [0.09, 0], mowPeriodM: 5.5, ripple: [0, 0.09], edge: 1, gravel: 0.8 },
  // Calçada e quadra: concreto, quase sem variação e com a borda reta.
  city_night: { coarseAmp: 0.06, fineAmp: 0.05, grainAmp: 0.04, hueDeg: 0, fadeM: 60, fadeEndM: 130, mow: [0, 0], mowPeriodM: 5, ripple: [0, 0], edge: 0, gravel: 0 },
};

export function terrainDetail(biome: SceneryId): TerrainDetail { return DETAIL[biome]; }

/**
 * O ladrilho cobre `DETAIL_TILE_CELLS` células grossas (192 m); na pista de `lengthM` metros ele repete `tiles` vezes (inteiro: a volta fecha sem emenda) e a célula grossa
 * fica em `lengthM / tiles / 16` (12 m ± 3 m em qualquer pista de 800 m para cima). `invPeriod` (ladrilhos por metro) multiplica a lateral e a distância ao longo no shader.
 */
export function detailTiling(lengthM: number): { tiles: number; periodM: number; invPeriod: number } {
  const tiles = Math.max(1, Math.round(lengthM / (DETAIL_COARSE_M * DETAIL_TILE_CELLS)));
  return { tiles, periodM: lengthM / tiles, invPeriod: tiles / lengthM };
}

/** Ruído de valor periódico (4×16 células por lado, interpolação quíntica) do canal `ch` no ponto (x, y) em células, já dentro do ladrilho. */
function tileNoise(ch: number, x: number, y: number): number {
  const n = DETAIL_TILE_CELLS;
  const xi = Math.floor(x); const yi = Math.floor(y);
  const fx = x - xi; const fy = y - yi;
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10); const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const at = (i: number, j: number): number => hash3(((i % n) + n) % n, ((j % n) + n) % n, 7001 + ch * 131);
  const a = at(xi, yi); const b = at(xi + 1, yi); const c = at(xi, yi + 1); const d = at(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** A imagem RGBA (`size`², bytes) do ladrilho: 4 ruídos de valor independentes e periódicos, cada um em 0..1 com média ~0,5 (R: luma, G: matiz, B: forma da borda/da ceifa, A: pedrinhas). */
export function detailNoiseImage(size = 256): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const k = DETAIL_TILE_CELLS / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    for (let ch = 0; ch < 4; ch++) out[i + ch] = Math.round(tileNoise(ch, x * k, y * k) * 255);
  }
  return out;
}

let sharedMap: THREE.DataTexture | null = null;
/** O ladrilho de ruído (uma textura para todos os materiais do chão; 256 KB + mips). */
export function detailMap(): THREE.DataTexture {
  if (sharedMap) return sharedMap;
  const t = new THREE.DataTexture(detailNoiseImage(256), 256, 256, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = 4; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  sharedMap = t;
  return t;
}

/**
 * V22 (a "prateleira" do Passo Alpino): quanto da rocha a barranca da pista alta ganha na cor. Medido (docs/ondas/V22-f1-chao.md): a "folha de terreno verde" do diagnóstico NÃO é a
 * coluna 11 contra o anel de morros; é a barranca (colunas 6–8, 60–130 m) de um trecho da estrada 20–30 m acima do vale, vista de baixo a ~500 m: uma face lisa de 25 m, verde viva como o
 * prado e com a borda de cima reta (a altura da pista). A inclinação local dela é só 0,2–0,3 (abaixo dos 0,42 em que o chão geral vira rocha), então o critério é a GEOMETRIA da barranca:
 * `roadH` = quanto a pista está acima do fundo do vale e `drop` = quanto a coluna já desceu (0 no platô da pista, 1 no vale): a rocha vale mais no meio da descida de uma pista alta
 * (4·drop·(1 − drop) × a altura da pista de 10 a 28 m). Só a serra.
 */
export function embankmentRock(biome: SceneryId, roadH: number, drop: number): number {
  if (biome !== 'alpine') return 0;
  const high = Math.max(0, Math.min(1, (roadH - 10) / 18));
  const mid = 4 * Math.max(0, Math.min(1, drop)) * (1 - Math.max(0, Math.min(1, drop)));
  return 0.9 * high * high * (3 - 2 * high) * mid;
}

/** Os uniformes do detalhe (referências compartilhadas com o programa: mexer neles nunca recompila). */
export interface DetailUniforms {
  map: { value: THREE.Texture };
  /** (ladrilhos por m, amplitude grossa, amplitude fina, deriva de matiz em rad). */
  A: { value: THREE.Vector4 };
  /** (início do desvanecimento da fina em m, fim, ceifa esquerda, ceifa direita). */
  B: { value: THREE.Vector4 };
  /** (ondulado esquerda, ondulado direita, borda irregular 0/1, cascalho). */
  C: { value: THREE.Vector4 };
  /** (oitava fina liga, grão liga, amplitude do grão, passo da ceifa em m). */
  Q: { value: THREE.Vector4 };
  verge: { value: THREE.Color };
}

const VERT_HEAD = /* glsl */ `attribute vec2 aDet; varying vec2 vDet;`;

const FRAG_HEAD = /* glsl */ `
uniform sampler2D uDetailMap; uniform vec4 uDetailA; uniform vec4 uDetailB; uniform vec4 uDetailC; uniform vec4 uDetailQ; uniform vec3 uVergeC;
varying vec2 vDet;
vec3 tdHue( vec3 c, float a ) { float ca = 1.0 - 0.5 * a * a; vec3 k = vec3( 0.57735 ); return c * ca + cross( k, c ) * a + k * dot( k, c ) * ( 1.0 - ca ); }
`;

// vDet.x = lateral (m, − esquerda, + direita), vDet.y = distância ao longo (m, absoluta). Nada aqui lê posição de mundo, câmera ou tela.
const FRAG_BODY = /* glsl */ `
{
  float tdDist = length( vViewPosition );
  float tdSide = vDet.x < 0.0 ? -1.0 : 1.0;
  float tdLat = abs( vDet.x );
  vec2 tdUv = vDet * uDetailA.x;
  float tdPix = max( fwidth( vDet.x ), fwidth( vDet.y ) );
  float tdA = 1.0 - smoothstep( 0.3, 0.9, tdPix / ${DETAIL_COARSE_M.toFixed(1)} );
  float tdF = ( 1.0 - smoothstep( uDetailB.x, uDetailB.y, tdDist ) ) * ( 1.0 - smoothstep( 0.2, 0.6, tdPix / ${DETAIL_FINE_M.toFixed(1)} ) );
  vec4 s1 = texture2D( uDetailMap, tdUv );
  vec4 s2 = vec4( 0.5 );
  float m = uDetailA.y * clamp( ( s1.r - 0.5 ) * 2.8, -1.0, 1.0 ) * tdA;
  float hue = ( s1.g - 0.5 ) * 2.0 * tdA;
  float tdLum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  float tdKeep = 1.0 - 0.6 * smoothstep( 0.55, 0.85, tdLum );
  vec4 s3 = vec4( 0.5 );
  if ( uDetailQ.x > 0.5 ) {
    s2 = texture2D( uDetailMap, tdUv * ${DETAIL_FINE_RATIO.toFixed(1)} );
    m += uDetailA.z * clamp( ( s2.r - 0.5 ) * 2.8, -1.0, 1.0 ) * tdF;
    hue += ( s2.g - 0.5 ) * 1.4 * tdF;
    if ( uDetailQ.y > 0.5 ) {
      s3 = texture2D( uDetailMap, tdUv * ${DETAIL_GRAIN_RATIO.toFixed(1)} );
      m += uDetailQ.z * clamp( ( s3.r - 0.5 ) * 3.6, -1.0, 1.0 ) * ( 1.0 - smoothstep( uDetailB.x * 0.5, uDetailB.x, tdDist ) );
    }
  }
  // Ceifa: faixas de capim paralelas à pista, com a largura e a força ondulando (a forma vem do ruído, não de uma régua).
  float tdMow = tdSide < 0.0 ? uDetailB.z : uDetailB.w;
  if ( tdMow > 0.0 ) {
    float zone = smoothstep( 11.0, 18.0, tdLat ) * ( 1.0 - smoothstep( 50.0, 100.0, tdLat ) );
    float ph = tdLat / uDetailQ.w + ( s1.b - 0.5 ) * 1.1;
    float st = smoothstep( -0.3, 0.3, sin( ph * 6.2832 ) );
    float aa = 1.0 - smoothstep( 0.2, 0.5, fwidth( vDet.x ) / uDetailQ.w );
    m += tdMow * ( st * 2.0 - 1.0 ) * ( 0.55 + 0.9 * s1.a ) * zone * aa;
  }
  // Ondulado: cristas de areia oblíquas, de ~3 m, que se desmancham longe.
  float tdRip = tdSide < 0.0 ? uDetailC.x : uDetailC.y;
  if ( tdRip > 0.0 ) {
    float zone = smoothstep( 11.0, 20.0, tdLat );
    float ph = ( vDet.y * 0.22 + tdLat * 0.9 ) / 3.2 + ( s1.b - 0.5 ) * 2.6;
    float aa = 1.0 - smoothstep( 0.2, 0.5, tdPix / 3.2 );
    m += tdRip * sin( ph * 6.2832 ) * ( 0.6 + 0.8 * s1.a ) * zone * aa;
  }
  // A amplitude é a do que se VÊ (referida à tela, ~gama 2): o albedo é linear, e ±12% de albedo são ~±3% de brilho na tela (invisíveis); o quadrado dá ±12% de brilho.
  float tdK = max( 1.0 + tdKeep * m, 0.0 );
  vec3 tdCol = tdHue( diffuseColor.rgb, hue * uDetailA.w ) * ( tdK * tdK );
  // Borda irregular entre o acostamento (terra do \`verge\`) e o chão: a forma é um campo de ruído, não uma linha; junto à borda, cascalho.
  if ( uDetailC.z > 0.5 && tdLat < 14.0 ) {
    float F = ( tdLat - 10.0 ) / 1.4 + ( s1.b - 0.5 ) * 2.3 + ( s2.b - 0.5 ) * 2.0 * tdF + ( s3.b - 0.5 ) * 1.0 * uDetailQ.y * ( 1.0 - smoothstep( uDetailB.x * 0.5, uDetailB.x, tdDist ) );
    F -= 1.0 - smoothstep( 8.4, 9.9, tdLat );
    float w = max( 0.09, fwidth( F ) );
    float t = smoothstep( -w, w, F );
    vec3 verge = uVergeC * ( 0.88 + 0.16 * s1.r + 0.30 * ( s2.r - 0.5 ) * tdF + 0.22 * ( s3.r - 0.5 ) * uDetailQ.y * ( 1.0 - smoothstep( uDetailB.x * 0.5, uDetailB.x, tdDist ) ) );
    float near = 1.0 - smoothstep( 0.0, 0.8, abs( F ) );
    float peb = smoothstep( 0.64, 0.74, s3.a ) * uDetailC.w * near * uDetailQ.y;
    verge = mix( verge, verge * ( s3.g > 0.5 ? 1.45 : 0.62 ), peb );
    tdCol = mix( verge, tdCol, t );
  }
  diffuseColor.rgb = tdCol;
}
`;

/**
 * Põe o detalhe num `MeshStandardMaterial` com `vertexColors` e o atributo `aDet` na geometria. Compõe com o `onBeforeCompile` e a chave que o material já tem (o estilizador): chamar
 * DEPOIS de `applyStylize`. Uma chave só (`+detail`) para as cinco paisagens: o que muda por bioma, por pista, por qualidade e por período são uniformes, nunca um programa novo.
 */
export function installTerrainDetail(material: THREE.MeshStandardMaterial): DetailUniforms {
  const u: DetailUniforms = {
    map: { value: detailMap() },
    A: { value: new THREE.Vector4(1 / 192, 0.1, 0.1, 0.07) },
    B: { value: new THREE.Vector4(60, 130, 0, 0) },
    C: { value: new THREE.Vector4(0, 0, 1, 0.6) },
    Q: { value: new THREE.Vector4(1, 1, 0.05, 5.5) },
    verge: { value: new THREE.Color('#b98a5a') },
  };
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  const own = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey');
  const frozen = own ? null : material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    Object.assign(shader.uniforms, { uDetailMap: u.map, uDetailA: u.A, uDetailB: u.B, uDetailC: u.C, uDetailQ: u.Q, uVergeC: u.verge });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', () => `#include <common>\n${VERT_HEAD}`)
      .replace('#include <color_vertex>', () => '#include <color_vertex>\n  vDet = aDet;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', () => `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <color_fragment>', () => `#include <color_fragment>\n${FRAG_BODY}`);
  };
  material.customProgramCacheKey = () => `${frozen ?? prevKey.call(material)}|+detail`;
  return u;
}

/** Aplica os parâmetros de um bioma aos uniformes (as constantes por pista — `invPeriod` — entram à parte, em `setDetailTrack`). */
export function applyBiomeDetail(u: DetailUniforms, biome: SceneryId): void {
  const d = DETAIL[biome];
  u.A.value.y = d.coarseAmp; u.A.value.z = d.fineAmp; u.A.value.w = (d.hueDeg * Math.PI) / 180;
  u.B.value.set(d.fadeM, d.fadeEndM, d.mow[0], d.mow[1]);
  u.C.value.set(d.ripple[0], d.ripple[1], d.edge, d.gravel);
  u.Q.value.z = d.grainAmp; u.Q.value.w = d.mowPeriodM;
}

/** O que a qualidade liga: Baixa 1 oitava (só a grossa), Média a fina também, Alta e Ultra o grão. Só uniformes: nenhum programa recompila. */
export function applyDetailQuality(u: DetailUniforms, q: Quality): void {
  u.Q.value.x = q === 'low' ? 0 : 1;
  u.Q.value.y = q === 'high' || q === 'ultra' ? 1 : 0;
}

/** Zera tudo o que o detalhe pinta (amplitudes, ceifa, ondulado, borda irregular): o chão volta a ser só a cor por vértice. Só para medir o campo do detalhe (o inverso de `applyBiomeDetail`). */
export function silenceDetail(u: DetailUniforms): void {
  u.A.value.y = 0; u.A.value.z = 0; u.A.value.w = 0;
  u.B.value.z = 0; u.B.value.w = 0;
  u.C.value.set(0, 0, 0, 0);
  u.Q.value.z = 0;
}
