// A distância do casco simplificado (LOD1) e da roda simples dos carros, pelo tamanho que o carro tem NA TELA (V13, docs/ondas/V13-folga.md).
// Puro: sem three, sem DOM (tests/folga-lod.test.ts).
import type { Quality } from '../../game/contracts';
import { atLeast } from '../../game/quality';

/** Distância (m, à frente do carro do viewport) a partir da qual o carro usa o casco e a roda simples: com 1 jogador (tela cheia) é a de sempre. */
export const CAR_LOD_FAR_M = 30;

/**
 * Com 2, 3 ou 4 jogadores o viewport tem a METADE da altura da tela (2 → em cima/embaixo; 3 e 4 → grade 2×2, layout.ts): um carro a 15 m ocupa os
 * mesmos pixels que a 30 m em tela cheia, onde o LOD1 já entra sem que se note. Mesmo critério (pixels), outra distância. `viewports` = quantos
 * viewports de jogador a tela tem (0 = fundo do menu, sem jogador: tela cheia).
 */
export function carLodDistance(viewports: number): number {
  return CAR_LOD_FAR_M * screenLodScale(viewports);
}

/** Fator das distâncias de LOD pelo tamanho do viewport: 1 em tela cheia, 0,5 quando o viewport tem a metade da altura (também usado pelo cenário, scenery/runtime.ts). */
export function screenLodScale(viewports: number): number {
  return viewports >= 2 ? 0.5 : 1;
}

// ───────────── Carro herói (V9, docs/ondas/V9-heroi.md) ─────────────
// Três níveis: HERÓI (casco de alta definição feito no Blender, só para carro HUMANO e perto do carro do viewport), INTERMEDIÁRIO (o casco de
// sempre, o `lod0` do estilo) e LONGE (o `lod1`, mais a roda simples). Sem lote por carro: cada modelo com herói tem UM lote a mais (cars.ts).

/** Teto de triângulos do casco herói (o do estilo é `CAR_LIMITS.maxShellTriangles`, 4.500). O custo real é em dobro: cena e mapa de sombra. */
export const HERO_MAX_TRIANGLES = 20000;

/**
 * Os modelos que têm casco herói (`src/assets/cars/hero/<chave>.glb`): a chave é um **estilo** (V9, V15: `gt`, `hyper`, `wedge`, `prototype`, `roadster`, `muscle`, `rally`: o herói vale para o estilo
 * todo) ou o **id de um carro** com arquivo próprio (V17: `cuiabano`, `tupiniquim`, os hatches livres do começo do jogo; o herói vale só para aquele carro e é conferido contra o `.glb` dele).
 * O jogo carrega o que há na pasta; esta lista é o contrato que `tests/herois-lod.test.ts` confere com ela (modelo novo = arquivo + linha aqui + linha em `docs/ARTE.md` + teste de contrato).
 */
export const HERO_STYLES: readonly string[] = ['gt', 'hyper', 'wedge', 'prototype', 'roadster', 'muscle', 'rally', 'cuiabano', 'tupiniquim'];

/** Raio (m, em torno do carro do viewport) dentro do qual um carro humano é herói, com 1 jogador; é metade na tela dividida (`screenLodScale`). */
export const HERO_RADIUS_M = 24;

/** Quem já é herói só deixa de ser a `HERO_RADIUS_M × HERO_EXIT_FACTOR`: sem esta folga o carro na borda do raio trocaria de malha a cada quadro. */
export const HERO_EXIT_FACTOR = 1.25;

/** O interruptor "Carros em alta definição" (Settings.heroCars): automático = ligado só em Alta e Ultra. */
export type HeroSetting = 'auto' | 'on' | 'off';

export function heroRadius(viewports: number): number {
  return HERO_RADIUS_M * screenLodScale(viewports);
}

/** O herói está ligado? Nunca na Baixa nem com "Reduzir efeitos"; o interruptor decide o resto (sem o campo, automático). */
export function heroEnabled(o: { quality: Quality; reduceEffects: boolean; setting?: HeroSetting }): boolean {
  if (o.quality === 'low' || o.reduceEffects) return false;
  const setting = o.setting ?? 'auto';
  if (setting === 'off') return false;
  return setting === 'on' || atLeast(o.quality, 'high');
}

export type CarDetail = 'hero' | 'full' | 'far';

export interface CarDetailInput {
  /** Carro de humano (assento ≥ 0). */
  human: boolean;
  /** É o carro do próprio viewport. */
  own: boolean;
  /** A câmera do viewport é presa ao carro (Capô ou Frente): o corte da cabine e o olho saem do casco `lod0` do próprio carro. */
  mounted: boolean;
  /** Distância (m) ao carro do viewport, no plano. */
  distance: number;
  /** Quanto o carro está à frente do carro do viewport (m; negativo = atrás): a regra do LOD1 de antes (V13). */
  ahead: number;
  viewports: number;
  lowQuality: boolean;
  heroOn: boolean;
  /** Era herói no quadro anterior (a histerese). */
  wasHero: boolean;
}

/** O nível de detalhe de um carro neste quadro. Pura; `heroOn` falso reproduz exatamente a regra de V13. */
export function carDetail(i: CarDetailInput): CarDetail {
  if (i.lowQuality) return 'far';
  if (i.heroOn && i.human && !(i.own && i.mounted)) {
    const r = heroRadius(i.viewports);
    if (i.distance < (i.wasHero ? r * HERO_EXIT_FACTOR : r)) return 'hero';
  }
  return i.ahead > carLodDistance(i.viewports) ? 'far' : 'full';
}
