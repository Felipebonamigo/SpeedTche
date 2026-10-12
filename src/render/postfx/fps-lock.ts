// 30 fps travados (onda L, L2b): opção das Opções › Visual para quem joga a 3 ou 4 jogadores na Média e prefere 30 estáveis a 40–50
// oscilando. Puro. O renderizador continua animando carros, efeitos e HUD a cada quadro do navegador e só pula o DESENHO dos viewports
// (a parte cara); o quadro anterior fica na tela.
import type { Quality } from '../../game/contracts';

/** Meta de tempo entre desenhos. */
export const LOCK_MS = 1000 / 30;
/** Desenha quando já passou 85% da meta: a 60 Hz alterna quadro sim/não, a 144 Hz dá ~35 por segundo, e o jitter do rAF não faz pular dois. */
const DRAW_AFTER = LOCK_MS * 0.85;

/** O travamento vale só na Média, com 3 ou 4 jogadores e a opção ligada. */
export function fpsLockActive(q: Quality, viewports: number, on: boolean): boolean {
  return on && q === 'medium' && viewports >= 3;
}

export class FrameLimiter {
  private last = -Infinity;
  /** Este quadro (instante `nowMs`) deve ser desenhado? Inativo, sempre sim; ativo, só se passou o suficiente desde o último desenho. */
  shouldDraw(nowMs: number, active: boolean): boolean {
    if (!active) { this.last = nowMs; return true; }
    if (nowMs - this.last >= DRAW_AFTER) { this.last = nowMs; return true; }
    return false;
  }
}
