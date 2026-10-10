// Ordem das qualidades gráficas e o `atLeast` que substitui os `=== 'high'` (onda L, L1). Módulo puro, de propósito
// fora do `contracts.ts` (que puxa meia interface em tempo de execução): o renderizador só precisa disto.
// `ultra` desenha hoje o mesmo que `high`; a L2 liga os efeitos dele (bloom, GTAO, …).
import type { Quality } from './contracts';

/** Da pior para a melhor. */
export const QUALITY_ORDER: readonly Quality[] = ['low', 'medium', 'high', 'ultra'];

/** `q` é `level` ou melhor? (`atLeast('ultra', 'high')` é verdadeiro; `atLeast('medium', 'high')`, falso.) */
export function atLeast(q: Quality, level: Quality): boolean {
  return QUALITY_ORDER.indexOf(q) >= QUALITY_ORDER.indexOf(level);
}
