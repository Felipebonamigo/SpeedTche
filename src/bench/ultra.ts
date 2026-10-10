// O nível Ultra no banco de prova (pedido do dono, 09/10/2026; docs/CRONOGRAMA.md, "Revisão visual", R1): alvo de uma
// RTX 4070 Ti a 1440p com 120 fps ou mais. Aqui mora SÓ o registro (nome, meta, efeitos previstos e os parâmetros que
// se espera deles) e a régua de medida. Os efeitos em si são da onda L (L2): `implemented` é verdadeiro só para o que tem código no
// renderizador (src/render/postfx/; hoje o GTAO) e tests/postfx-plan.test.ts cobra que o registro bata com o plano do Ultra. O que
// ainda é falso o Ultra não faz: o número dele é o dos efeitos que existem, e o aviso do relatório diz quantos são.
// Puro: sem DOM e sem three (tests/bench.test.ts).
import type { Quality } from '../game/contracts';

/** O que o bench mede: as qualidades do jogo (o Ultra é uma delas desde a L2; o nome fica para os relatórios antigos). */
export type BenchLevel = Quality;

/** Meta do Ultra: placa, resolução de desenho e quadros por segundo (média). */
export const ULTRA_TARGET = { fps: 120, width: 2560, height: 1440, gpu: 'NVIDIA GeForce RTX 4070 Ti' } as const;
/** O piso de sempre: 60 fps na Baixa e na Média (docs/DESEMPENHO.md §4; o Deck e o PC médio). */
export const FLOOR_TARGET_FPS = 60;

export interface UltraEffect {
  id: string;
  /** Rótulo para o painel e os docs. */
  label: string;
  /** Parâmetros previstos — PONTO DE PARTIDA da L2, não medida: ela ajusta com o bench na mão. */
  params: Readonly<Record<string, number | string | boolean>>;
  /** Falso até a L2 implementar; o relatório diz quantos estão ativos. */
  implemented: boolean;
}

export const ULTRA_EFFECTS: readonly UltraEffect[] = [
  { id: 'gtao', label: 'Oclusão de ambiente (GTAO)', params: { samples: 16, radius: 1.2, resolutionScale: 1, denoise: true }, implemented: true },
  { id: 'ssr', label: 'Reflexo em tela (água e asfalto molhado)', params: { maxSteps: 64, maxDistance: 80, resolutionScale: 0.5, surfaces: 'water,wet-asphalt' }, implemented: false },
  { id: 'volumetric-rays', label: 'Raios de sol volumétricos', params: { samples: 48, density: 0.35, resolutionScale: 0.5 }, implemented: false },
  { id: 'dof', label: 'Profundidade de campo (menus e pódio)', params: { where: 'menus+podium', bokehScale: 3, maxBlurPx: 12 }, implemented: false },
  { id: 'motion-blur', label: 'Desfoque de movimento', params: { samples: 8, shutter: 0.5, maxBlurPx: 24 }, implemented: false },
  { id: 'csm', label: 'Sombras em cascata de 4K', params: { cascades: 4, mapSize: 4096, maxFar: 400 }, implemented: false },
  { id: 'taa', label: 'Antisserrilhado temporal', params: { jitterSamples: 16, historyWeight: 0.9, sharpen: 0.15 }, implemented: false },
];

/** Ids dos efeitos do Ultra que já existem no renderizador (a L2 liga cada um ao implementá-lo). */
export function ultraEffectsActive(): string[] {
  return ULTRA_EFFECTS.filter((e) => e.implemented).map((e) => e.id);
}

/** A qualidade do renderizador com que o nível é desenhado: desde a L2 o Ultra é uma qualidade de verdade. */
export function renderQualityOf(level: BenchLevel): Quality {
  return level;
}
