// A distância do casco simplificado (LOD1) e da roda simples dos carros, pelo tamanho que o carro tem NA TELA (V13, docs/ondas/V13-folga.md).
// Puro: sem three, sem DOM (tests/folga-lod.test.ts).

/** Distância (m, à frente do carro do viewport) a partir da qual o carro usa o casco e a roda simples: com 1 jogador (tela cheia) é a de sempre. */
export const CAR_LOD_FAR_M = 30;

/**
 * Com 2, 3 ou 4 jogadores o viewport tem a METADE da altura da tela (2 → em cima/embaixo; 3 e 4 → grade 2×2, layout.ts): um carro a 15 m ocupa os
 * mesmos pixels que a 30 m em tela cheia, onde o LOD1 já entra sem que se note. Mesmo critério (pixels), outra distância. `viewports` = quantos
 * viewports de jogador a tela tem (0 = fundo do menu, sem jogador: tela cheia).
 */
export function carLodDistance(viewports: number): number {
  return viewports >= 2 ? CAR_LOD_FAR_M / 2 : CAR_LOD_FAR_M;
}
