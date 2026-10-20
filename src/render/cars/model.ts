// O que cada estilo de carroceria entrega ao renderizador: a malha única (carroceria, cabine, vidro,
// lentes e peças, uma chamada de desenho por estilo), as rodas (desenho, eixos), as saídas do nitro e
// a ordem das pinturas. Um arquivo por estilo em styles/ — a porta para trocar um modelo por glTF.
import * as THREE from 'three';
import type { CarBody } from '../../core/types';
import type { Axle, Region } from './body';
import type { Brush, Lod, MeshBuilder, P3 } from './kit';
import { PAINT, STRIPE_A, STRIPE_B, TRIM, UNDER } from './paints';
import type { WheelDesign, WheelModel } from './wheels';

/** Casco de menor custo (nó `lod1` do .glb): carros longe e qualidade Baixa. */
export interface CarLod { shell: THREE.BufferGeometry; triangles: number }

/**
 * O que o arquivo do contrato do asset (docs/CONTRATO-DO-ASSET.md) trouxe além do casco, para o `check.ts` conferir.
 * `kit_*`, `seat` e `decal_*` ainda não são mostrados no jogo (P3, N3/U4 e a câmera interna os usam): ficam só aqui.
 */
export interface CarContract {
  /** Vazios `seat` (onde o piloto senta), no referencial do jogo. */
  seats: P3[];
  /** Nós `kit_<peça>_<nível>` (peça que aparece com a melhoria comprada) e os triângulos de cada um. */
  kits: Array<{ name: string; triangles: number }>;
  /** Nós `decal_<nome>` (malha plana para número, placa, adesivo). */
  decals: Array<{ name: string; triangles: number; hasUv: boolean; flat: boolean }>;
  /** Uma entrada por imagem diferente usada como atlas pelos materiais do casco, do LOD e das rodas. */
  atlases: Array<{ width: number; height: number }>;
  /** Malhas cujo material tem atlas mas que não trazem UV. */
  meshesWithoutUv: string[];
  /** Os nós de topo de LOD que o arquivo traz. */
  lodNodes: { lod0: boolean; lod1: boolean };
}

export type { Lod };

/** Caixa no referencial do carro (metros), para o teste conferir a peça contra a malha. */
export interface Box3Like { min: P3; max: P3 }

/**
 * A traseira-vitrine (M4, cars/rear.ts): onde ficam os escapes (com o raio da ponteira), o difusor e o aerofólio de brinquedo.
 * É o descritor do que o `buildRear` construiu; o teste confere a malha DENTRO destas caixas, então ele não pode mentir.
 */
export interface RearKit {
  exhausts: Array<{ x: number; y: number; z: number; r: number }>;
  diffuser: Box3Like;
  wing: Box3Like | null;
}

export interface CarModel {
  body: CarBody;
  /** Id do carro quando o modelo é de um carro só (`src/assets/cars/<carId>.glb`); sem ele, vale para o estilo todo. */
  carId?: string;
  shell: THREE.BufferGeometry;
  /** Atlas de paleta 256² (glTF `map`), multiplicado pela cor de vértice e pela pintura; só em modelo de .glb com textura. */
  map?: THREE.Texture;
  /** Normal map opcional (glTF `normalTexture`). */
  normalMap?: THREE.Texture;
  /** Casco do nó `lod1`, se o arquivo trouxe (no máximo metade dos triângulos do `lod0`). */
  lod1?: CarLod;
  /** Casco HERÓI (V9, `src/assets/cars/hero/<modelo>.glb`): alta definição, só para o carro humano perto da câmera (cars/lod.ts). Sem ele, o modelo não tem herói. */
  hero?: CarLod;
  /** Roda do próprio arquivo (nó `wheel_fr`, em escala unitária); sem ela, o desenho é o de `wheel`. */
  wheelModel?: WheelModel;
  /** Só em modelo de .glb: o que o contrato do asset pede além do casco. */
  contract?: CarContract;
  wheel: WheelDesign;
  axles: readonly [Axle, Axle];
  /** Saídas da chama do nitro (1 ou 2), na ponta do escapamento. */
  exhausts: readonly P3[];
  /** Altura do teto (a etiqueta de nome fica acima). */
  height: number;
  /** Ordem das pinturas (bits LIVERY_A/LIVERY_B) para o 1º, 2º... carro do estilo. */
  liveries: readonly number[];
  triangles: number;
  /** Só em modelo de .glb (V6c): o casco tem a escada do carro da firma (material `ladder`), que o renderizador balança (cars/ladder.ts). */
  ladder?: boolean;
  /** Só no procedural (M4): a traseira-vitrine, para o teste conferir. */
  rear?: RearKit;
}

export interface ModelParts {
  wheel: WheelDesign;
  axles: readonly [Axle, Axle];
  exhausts: readonly P3[];
  liveries: readonly number[];
  rear?: RearKit;
}

/** Fecha o modelo: mede a altura, conta triângulos, monta a geometria. */
export function finish(body: CarBody, b: MeshBuilder, parts: ModelParts): CarModel {
  const shell = b.build();
  const bb = shell.boundingBox ?? new THREE.Box3();
  return { body, shell, ...parts, height: bb.max.y, triangles: b.triangles };
}

const STANDARD: Record<Region, Brush | null> = {
  under: UNDER, well: UNDER, sill: TRIM, lower: PAINT, band: STRIPE_B, upper: PAINT, shoulder: PAINT, top: PAINT, stripe: STRIPE_A, center: PAINT,
};

/** Pincel por região da carroceria: o padrão (soleira preta, faixa B no vinco, faixas A no capô) com trocas. */
export function regions(over: Partial<Record<Region, Brush | null>> = {}): (r: Region) => Brush | null {
  const m = { ...STANDARD, ...over };
  return (r) => m[r];
}
