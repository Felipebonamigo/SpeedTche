// Vento do cenário (onda M, M3): o balanço da copa, feito no vertex shader do lote liso. Este arquivo é a FONTE ÚNICA do cálculo: a função pura
// `windSway` (que os testes exercitam) e o mesmo cálculo em GLSL (`WIND_GLSL`, montado com as mesmas constantes) — se um dia o GLSL divergir da
// função, o teste que lê as constantes pega. Sem three além do tipo do material; sem DOM.
//
// Três regras do pedido (docs/CRONOGRAMA.md, M3):
//   1. Amplitude ZERO abaixo de 1,5 m (`WIND_CALM_M`): a faixa do carro (`CAR_BAND`, 5 cm a 1,3 m) nunca se mexe, então a colisão visual continua igual.
//   2. A FASE de cada instância vem de um hash da posição NA PISTA (`windPhase`, no layout, uma vez): o balanço não escorrega quando o carro anda e é o
//      mesmo em todas as telas (a posição na tela é relativa ao carro de cada viewport). A fase mora no ALFA da cor por instância do `BatchedMesh`
//      (o três só lê RGB para pintar; o alfa fica livre), 0 = rígido (rocha, cacto, prédio, poste).
//   3. O tempo é um uniforme só, compartilhado: todas as telas veem o mesmo vento no mesmo instante.
import type * as THREE from 'three';
import { hash3 } from '../noise';

/** Até esta altura (m, no mundo, acima do pé da instância) o vento não mexe em nada. */
export const WIND_CALM_M = 1.5;
/** Da altura de calma até esta distância acima dela a amplitude sobe (com o quadrado), e daí em diante fica no teto. */
export const WIND_RAMP_M = 6;
/** Deslocamento máximo (m) da ponta da copa. */
export const WIND_AMP_M = 0.4;
/** Abaixo desta fração da janela do runtime (a qualidade Baixa desenha 0,59; a Média 0,79) o vento desliga. */
export const WIND_MIN_DETAIL = 0.7;

/** Quem balança: árvore, conífera e palmeira de perto (o modelo de longe, a rocha, o cacto, a moita, o prédio e o poste ficam rígidos). */
export const sways = (modelId: string): boolean => /^(tree|pine|palm):/.test(modelId);

export const windDetailOn = (detail: number): boolean => detail >= WIND_MIN_DETAIL;

const TAU = Math.PI * 2;
const fract = (v: number): number => v - Math.floor(v);

/**
 * Fase (0, 1] de um objeto da pista: do índice do segmento, da lateral (m) e da fração ao longo do segmento. Nada que dependa do quadro,
 * da tela ou do tempo. Nunca 0 (0 é "rígido" no alfa).
 */
export function windPhase(seg: number, lateral: number, f: number): number {
  const h = hash3(seg * 3 + 11, Math.round(lateral * 8), Math.round(f * 64) + 5);
  return 0.001 + 0.999 * h;
}

/**
 * Deslocamento (m, no referencial do modelo: x e z) de um ponto a `heightM` m acima do pé, na fase `phase01`, no instante `timeS`. Zero até
 * `WIND_CALM_M`; acima, `WIND_AMP_M · k²` com `k` subindo de 0 a 1 em `WIND_RAMP_M`. Duas ondas somadas (a lenta, o balanço; a rápida, a rajada),
 * a segunda atrasada no eixo z.
 */
export function windSway(heightM: number, phase01: number, timeS: number): [number, number] {
  const k = Math.min(1, Math.max(0, (heightM - WIND_CALM_M) / WIND_RAMP_M));
  if (k <= 0) return [0, 0];
  const amp = WIND_AMP_M * k * k;
  const a = TAU * fract(0.45 * timeS + phase01);
  const b = TAU * fract(1.13 * timeS + 2.7 * phase01);
  return [amp * (0.75 * Math.sin(a) + 0.25 * Math.sin(b)), amp * 0.45 * (0.75 * Math.sin(a + 1.9) + 0.25 * Math.sin(b + 0.7))];
}

const f3 = (v: number): string => v.toFixed(3);

/** Declarações (antes do `main`) e o deslocamento (depois do `begin_vertex`) do vento. */
export const WIND_PARS_GLSL = 'uniform float uWindTime;\nuniform float uWindAmp;\n';
export const WIND_GLSL = `
#ifdef USE_BATCHING_COLOR
  // Vento (scenery/wind.ts): a fase da instância é o alfa da cor por instância (0 = rígido); a altura é medida no mundo (escala da instância).
  if (vColor.a > 0.0 && uWindAmp > 0.0) {
    float windH = transformed.y * length(batchingMatrix[1].xyz);
    float windK = clamp((windH - ${f3(WIND_CALM_M)}) / ${f3(WIND_RAMP_M)}, 0.0, 1.0);
    if (windK > 0.0) {
      float windAmp = ${f3(WIND_AMP_M)} * windK * windK * uWindAmp;
      float windA = 6.2831853 * fract(0.45 * uWindTime + vColor.a);
      float windB = 6.2831853 * fract(1.13 * uWindTime + 2.7 * vColor.a);
      transformed.x += windAmp * (0.75 * sin(windA) + 0.25 * sin(windB));
      transformed.z += windAmp * 0.45 * (0.75 * sin(windA + 1.9) + 0.25 * sin(windB + 0.7));
    }
  }
#endif
`;

export interface WindUniforms {
  uWindTime: { value: number };
  uWindAmp: { value: number };
}

export const makeWindUniforms = (): WindUniforms => ({ uWindTime: { value: 0 }, uWindAmp: { value: 1 } });

/**
 * Põe o vento num material com luz (`MeshStandard`). COMPÕE com o `onBeforeCompile` e a chave de programa que o material já tem (o
 * `applyStylize` roda depois e compõe por cima, como no `hazeMat` do runtime.ts).
 */
export function applyWind(material: THREE.Material, uniforms: WindUniforms): void {
  const prev = material.onBeforeCompile;
  const own = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey');
  const frozen = own ? null : material.customProgramCacheKey();
  const prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    shader.uniforms.uWindTime = uniforms.uWindTime;
    shader.uniforms.uWindAmp = uniforms.uWindAmp;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', () => `${WIND_PARS_GLSL}void main() {`)
      .replace('#include <begin_vertex>', () => `#include <begin_vertex>${WIND_GLSL}`);
  };
  material.customProgramCacheKey = () => `${frozen ?? prevKey.call(material)}|scenery-wind-v1`;
}
