// A escada do Furgãozinho da Firma (V6c): balança nas curvas e cai para trás no nitro. SÓ visual e puro (sem Three, sem DOM), como motion.ts.
// A malha da escada (material `ladder`) tem o vértice marcado em `aPaint.w = 0,5`; o vértice se desloca no shader (cars/material.ts) lendo
// o estado da escada nos bits altos de `instExtra.w` da instância: o MESMO lote do casco, nenhuma chamada de desenho nova.

/** Primeiro bit da escada em `instExtra.w` (abaixo: freio 1, faixas 2 e 4, acabamento 3–5, corte da câmera 6–14; o float guarda 24 bits exatos). */
export const LADDER_SHIFT = 15;
/** Quanto a escada anda de lado (m) e para trás (m) no máximo; o shader usa os mesmos números. */
export const LADDER_SIDE_M = 0.07;
export const LADDER_SLIDE_M = 0.3;

export interface LadderState {
  /** Deslocamento lateral, −1..1 (positivo = para o lado do rolamento). */
  x: number;
  /** Velocidade da mola. */
  v: number;
  /** Quanto escorregou para trás, 0..1. */
  slide: number;
}

export interface LadderInput {
  /** Rolamento do carro (rad, `CarAnim.roll`): o que a curva faz com a carroceria. */
  roll: number;
  /** 0..1: o nitro aceso (fração da duração). */
  nitro: number;
  /** "Reduzir efeitos": a escada fica quieta. */
  reduce: boolean;
}

export const newLadder = (): LadderState => ({ x: 0, v: 0, slide: 0 });

/** Rigidez e atrito da mola lateral (sub-amortecida: balança), e a velocidade com que ela cai (nitro) e volta (1/s). */
const K = 90;
const C = 6;
const ROLL_GAIN = 14;
const SLIDE_IN = 9;
const SLIDE_OUT = 1.2;

export function stepLadder(s: LadderState, input: LadderInput, dt: number): void {
  if (input.reduce) { s.x = 0; s.v = 0; s.slide = 0; return; }
  const target = Math.max(-1, Math.min(1, input.roll * ROLL_GAIN));
  s.v += (K * (target - s.x) - C * s.v) * dt;
  s.x = Math.max(-1, Math.min(1, s.x + s.v * dt));
  const to = input.nitro > 0 ? 1 : 0;
  const rate = to > s.slide ? SLIDE_IN : SLIDE_OUT;
  s.slide += (to - s.slide) * (1 - Math.exp(-rate * dt));
}

/** Os bits da instância: x em 4 bits com sinal (−7..7, complemento de dois) e o escorregão em 3 bits (0..7). Estado neutro = 0. */
export function ladderBits(s: Pick<LadderState, 'x' | 'slide'>): number {
  const qx = Math.max(-7, Math.min(7, Math.round(s.x * 7)));
  const qs = Math.max(0, Math.min(7, Math.round(s.slide * 7)));
  return ((qx & 15) << LADDER_SHIFT) | (qs << (LADDER_SHIFT + 4));
}

export function decodeLadder(bits: number): { x: number; slide: number } {
  let qx = (bits >> LADDER_SHIFT) & 15;
  if (qx > 7) qx -= 16;
  return { x: qx / 7, slide: ((bits >> (LADDER_SHIFT + 4)) & 7) / 7 };
}
