// V22/F3: o ruído de arvoredo e de cume dos anéis de horizonte (`buildRing` do terrain.ts e o `ringMesh` do Rio, horizon.ts). Antes cada anel era uma cor só por fileira (topo, meio, pé:
// a pilha de silhuetas turquesa lisas do diagnóstico, §3.5); agora a cor por vértice varia ao longo da volta — manchas de mata (a copa, o claro entre as copas, a clareira) em
// 3 escalas — e o cume pega a luz (um toque mais claro, com uma onda lenta). É só COR por vértice: 0 triângulos, 0 chamadas, 0 programas, nada de geometria.
//
// Periódico (a coluna N é a coluna 0: a volta fecha sem emenda) e determinístico (hash por índice, nunca `Math.random`), como o resto do cenário. A amplitude vale ANTES da névoa
// (o topo é `tom × sombra`, depois lerp para a névoa pelo `haze` da camada): os planos longe, com mais névoa, mostram menos contraste sozinhos — a perspectiva atmosférica.
import * as THREE from 'three';
import type { SceneryId } from '../core/types';
import { hash2 } from './noise';

export interface RingFoliage {
  /** Fator de luma da mancha de mata (≈ 0,87–1,13), antes da névoa. */
  shade: number;
  /** Fator do cume iluminado (≈ 1,05–1,13), depois da névoa: o sol pega o alto da silhueta. */
  crest: number;
}

interface FoliageLook {
  /** Amplitude da mancha (± em torno de 1). */
  amp: number;
  /** Quantas manchas por volta, nas 3 escalas (largas, médias, finas), e o peso de cada uma. */
  scales: readonly [number, number, number];
  weights: readonly [number, number, number];
}

/** O arvoredo de cada bioma: a mata densa (trópico, costa) tem copa fina e mancha grande; a savana é esparsa; a serra, conífera fina; o deserto, faixas largas de rocha. */
const LOOK: Readonly<Record<SceneryId, FoliageLook>> = {
  tropical: { amp: 0.2, scales: [30, 100, 300], weights: [0.5, 0.35, 0.15] },
  coast: { amp: 0.17, scales: [30, 90, 300], weights: [0.5, 0.35, 0.15] },
  savanna: { amp: 0.15, scales: [24, 60, 200], weights: [0.55, 0.3, 0.15] },
  alpine: { amp: 0.17, scales: [40, 150, 300], weights: [0.4, 0.4, 0.2] },
  desert: { amp: 0.16, scales: [18, 48, 150], weights: [0.6, 0.3, 0.1] },
  city_night: { amp: 0.1, scales: [30, 100, 300], weights: [0.5, 0.35, 0.15] },
};

/** O quanto do contraste cada camada guarda (a mais perto, cheia; a mais longe, a metade e mais um pouco de névoa por cima). */
const LAYER_AMP: readonly number[] = [1, 0.85, 0.7];

const BIOME_ID: Readonly<Record<SceneryId, number>> = { tropical: 1, desert: 2, city_night: 3, alpine: 4, coast: 5, savanna: 6 };

/** Ruído de valor 1D periódico em [-1, 1]: `x` em 0..period (inteiro), a hash por inteiro módulo `period`: x = period é igual a x = 0. */
function periodic(seed: number, x: number, period: number): number {
  const i = Math.floor(x); const t = x - i; const s = t * t * (3 - 2 * t);
  const a = hash2(seed, ((i % period) + period) % period) * 2 - 1;
  const b = hash2(seed, (((i + 1) % period) + period) % period) * 2 - 1;
  return a + (b - a) * s;
}

/**
 * O arvoredo e o cume da coluna `i` (de `n`, a coluna `n` é a `0`) do anel `layer` do `biome`. `band` 0 = o topo (a crista), 1 = a encosta (o meio da altura: outra mancha, para
 * a mata não virar listra vertical).
 */
export function ringFoliage(biome: SceneryId, layer: number, i: number, n: number, band: 0 | 1 = 0): RingFoliage {
  const look = LOOK[biome];
  const seed = 1000 + layer * 131 + BIOME_ID[biome] * 17 + band * 7919;
  let v = 0;
  for (let k = 0; k < 3; k++) v += look.weights[k] * periodic(seed + k * 31, (i / n) * look.scales[k], look.scales[k]);
  const amp = look.amp * (LAYER_AMP[layer] ?? 0.7) * (band === 1 ? 0.7 : 1);
  const slow = periodic(seed + 97, (i / n) * 12, 12);
  return { shade: 1 + amp * v, crest: 1.09 + 0.04 * slow };
}

/** As cores por coluna (N + 1 vértices, o último é o primeiro) de um anel já com a névoa: topo (crista, com cume), encosta alta e meio da encosta. */
export interface RingPaint { top: THREE.Color[]; slope: THREE.Color[]; mid: THREE.Color[] }

/**
 * Pinta as colunas de um anel de `n` colunas: `top` = a cor do plano, `fog` = a névoa e `haze` = a parte da névoa na crista (o meio leva 0,22 a mais, a encosta alta, 0,35 do
 * caminho do meio ao topo). O ruído entra no tom ANTES da névoa; o cume, depois (o sol não depende da bruma). Mesmo trabalho no anel B (o período seguinte da corrida que muda):
 * a função só depende do índice, então as duas pontas têm as mesmas manchas e a mistura por uniforme anda suave.
 */
export function ringPaint(biome: SceneryId, layer: number, n: number, top: THREE.Color, fog: THREE.Color, haze: number): RingPaint {
  const out: RingPaint = { top: [], slope: [], mid: [] };
  const tint = new THREE.Color();
  for (let i = 0; i <= n; i++) {
    const t = ringFoliage(biome, layer, i % n, n, 0); const m = ringFoliage(biome, layer, i % n, n, 1);
    const cTop = tint.copy(top).multiplyScalar(t.shade).lerp(fog, haze).clone();
    const cMid = top.clone().multiplyScalar(m.shade).lerp(fog, Math.min(1, haze + 0.22));
    out.mid.push(cMid);
    out.slope.push(cMid.clone().lerp(cTop, 0.35));
    out.top.push(cTop.multiplyScalar(t.crest));
  }
  return out;
}

/**
 * O arvoredo FINO e o contorno de copas: por fragmento, em ruído 3D do espaço do OBJETO (o anel é rígido e gira com o grupo do horizonte: a posição local fica no mesmo ponto
 * do morro, como um desenho no morro — nunca a posição de mundo, que mudaria a cada quadro e faria o arvoredo "nadar", a regra da F1). `aForest` por vértice =
 * (força da mancha, fundo do contorno, 1 na crista e 0 no resto): a mata pega as duas; a neve, a pedra e o deserto, pouco ou nada.
 * Duas escalas de mancha (18 m e 8 m a 700 m: acima de ~8 px, para o ruído não cintilar) e o contorno come até 8% da altura do quadrilátero da crista com `discard`.
 */
export const FOREST_VERT_PARS = /* glsl */ `
attribute vec3 aForest; varying vec3 vForest; varying vec3 vLocal;`;
export const FOREST_VERT_BODY = /* glsl */ `
  vForest = aForest; vLocal = position;`;
export const FOREST_FRAG_PARS = /* glsl */ `
varying vec3 vForest; varying vec3 vLocal;
float forestH(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float forestN(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(forestH(i), forestH(i + vec3(1.0, 0.0, 0.0)), f.x), mix(forestH(i + vec3(0.0, 1.0, 0.0)), forestH(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(forestH(i + vec3(0.0, 0.0, 1.0)), forestH(i + vec3(1.0, 0.0, 1.0)), f.x), mix(forestH(i + vec3(0.0, 1.0, 1.0)), forestH(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}`;
/** O corpo no fragmento: descarta o contorno (copas) e mancha a cor `c` (vec3). */
export function forestFragBody(c: string): string {
  // `lp` = a posição local reescalada para que o tamanho ANGULAR das manchas seja o mesmo nos três anéis (470, 660 e 920 m): em metros a 700 m de distância.
  return /* glsl */ `
  {
    vec3 lp = vLocal * (700.0 / max(length(vLocal.xz), 100.0));
    float fo = forestN(lp / vec3(18.0, 9.0, 18.0)) * 0.55 + forestN(lp / vec3(8.0, 4.5, 8.0)) * 0.45;
    fo = mix(fo, smoothstep(0.36, 0.64, fo), 0.65);
    float fr = smoothstep(0.35, 0.75, forestN(lp / vec3(10.0, 4.0, 10.0)) * 0.65 + forestN(lp / vec3(4.5, 2.2, 4.5)) * 0.35);
    if (vForest.z > 1.0 - 0.08 * vForest.y * fr) discard;
    ${c} *= 1.0 + vForest.x * (fo - 0.5) * 1.6;
  }`;
}

/** A força da mancha e a do contorno de cada bioma e camada (0..1): a mata inteira, a savana esparsa, a serra só abaixo da neve, o deserto (mesa de pedra) sem contorno. */
export function ringForestAmp(biome: SceneryId, layer: number): { speckle: number; fringe: number } {
  const k = LAYER_AMP[layer] ?? 0.7;
  const b: Record<SceneryId, [number, number]> = { tropical: [1, 1], coast: [0.9, 0.9], savanna: [0.8, 0.7], alpine: [0.8, 0.35], desert: [0.5, 0], city_night: [0.5, 0.4] };
  return { speckle: b[biome][0] * 0.2 * k, fringe: b[biome][1] * k };
}
