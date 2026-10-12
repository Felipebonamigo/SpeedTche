// Resolução dinâmica (onda L, L2): controle puro, sem three. O renderizador desenha a cena num alvo de tamanho FIXO e usa só um
// sub-retângulo dele (`scale` de cada lado); este módulo decide qual. Histerese longa, de propósito: trocar de degrau é visível
// (a imagem amolece), então só se cai depois de ~2 s de quadros lentos e só se sobe depois de ~6 s de folga, um degrau por vez; subir
// logo depois de ter caído (pisca-pisca) dobra a espera da próxima subida. Mede o tempo ENTRE quadros (CPU ou GPU, não distingue):
// por isso o piso é alto (0,72) e o bench, o harness e os playtests o desligam (docs/ondas/L/L2.md §9).

/** Escala de cada lado do viewport, do cheio ao piso. */
export const DYNRES_STEPS = [1, 0.85, 0.72] as const;

export interface DynResOptions {
  /** Tempo de quadro que a máquina deveria entregar (ms): 1000/60 por padrão; 1000/30 no modo de 30 fps. */
  targetMs?: number;
  /** Janela de quadros lentos antes de descer (ms). */
  downAfterMs?: number;
  /** Folga contínua antes de subir (ms). */
  upAfterMs?: number;
}

/** Quadro acima disto não é carga: é aba escondida, carregamento, depurador. Ignorado por inteiro. */
const SPIKE_MS = 250;
/** Lento = acima da meta com 15% de folga; dentro da janela, 70% do tempo lento é "lento". */
const SLOW_FACTOR = 1.15;
const SLOW_SHARE = 0.7;
/** Um quadro acima da meta + 10% zera a folga (a subida exige quadros limpos). */
const CALM_FACTOR = 1.1;
const FLAP_MS = 20000;
const MAX_UP_MS = 60000;

export class DynamicResolution {
  private index = 0;
  private on = true;
  private windowMs = 0;
  private slowMs = 0;
  private calmMs = 0;
  private upWait: number;
  private sinceUp = Infinity;
  private target: number;
  private readonly downAfter: number;
  private readonly upAfterBase: number;

  constructor(opts: DynResOptions = {}) {
    this.target = opts.targetMs ?? 1000 / 60;
    this.downAfter = opts.downAfterMs ?? 2000;
    this.upAfterBase = opts.upAfterMs ?? 6000;
    this.upWait = this.upAfterBase;
  }

  get scale(): number { return this.on ? DYNRES_STEPS[this.index] : 1; }
  get enabled(): boolean { return this.on; }

  /** Muda a meta de tempo de quadro (33 ms no modo de 30 fps travados; 1000/60 no normal). */
  setTargetMs(ms: number): void { if (ms > 0 && ms !== this.target) { this.target = ms; this.restart(); } }

  setEnabled(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    this.restart();
    if (!on) this.index = 0;
  }

  reset(): void { this.index = 0; this.upWait = this.upAfterBase; this.sinceUp = Infinity; this.restart(); }

  private restart(): void { this.windowMs = 0; this.slowMs = 0; this.calmMs = 0; }

  /** Um quadro de `frameMs` (tempo desde o quadro anterior); devolve a escala para o próximo. */
  update(frameMs: number): number {
    if (!this.on || !(frameMs > 0) || frameMs > SPIKE_MS) return this.scale;
    this.sinceUp += frameMs;
    const slow = frameMs > this.target * SLOW_FACTOR;
    this.windowMs += frameMs;
    if (slow) this.slowMs += frameMs;
    if (frameMs > this.target * CALM_FACTOR) this.calmMs = 0; else this.calmMs += frameMs;
    if (this.windowMs >= this.downAfter) {
      const share = this.slowMs / this.windowMs;
      this.windowMs = 0; this.slowMs = 0;
      if (share >= SLOW_SHARE && this.index < DYNRES_STEPS.length - 1) {
        // Caiu logo depois de subir: a próxima subida espera o dobro.
        if (this.sinceUp < FLAP_MS) this.upWait = Math.min(this.upWait * 2, MAX_UP_MS);
        this.index++;
        this.calmMs = 0;
        return this.scale;
      }
    }
    if (this.index > 0 && this.calmMs >= this.upWait) {
      this.index--;
      this.calmMs = 0; this.sinceUp = 0;
      return this.scale;
    }
    // Um minuto firme em cima sem pisca-pisca devolve a espera ao normal.
    if (this.sinceUp > MAX_UP_MS) this.upWait = this.upAfterBase;
    return this.scale;
  }
}

/**
 * A resolução dinâmica liga sozinha no jogo e desliga onde a imagem tem de ser reprodutível: sob automação (Playwright: o harness, o
 * bench, os playtests: `navigator.webdriver`) ou com `?dynres=0`; `?dynres=1` a liga à força (até sob automação, para testar).
 */
export function dynamicResolutionDefault(search: string, webdriver: boolean): boolean {
  const m = /[?&]dynres=([01])(?:&|$)/.exec(search);
  if (m) return m[1] === '1';
  return !webdriver;
}
