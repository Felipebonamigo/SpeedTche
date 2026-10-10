// A parte PURA do palco 3D (onda N, N2; docs/ondas/N/N2.md §4.1): mola da oficina, linha do tempo da revelação, confete, a câmera que vai ao
// detalhe da peça em foco, a qualidade própria do palco e os retângulos do GL. Sem `three`, sem DOM, sem `Math.random`: o teste de Node
// confere cada número e o `stage.ts` só os lê. Tudo aqui é aparência; nada toca o núcleo, o `hashRace` ou o `sim-golden`.
import type { Quality } from '../game/contracts';
import { atLeast } from '../game/quality';
import { hash2 } from './noise';

/** Painéis do palco desenhados ao mesmo tempo (1 por piloto; o 5º é ignorado). */
export const MAX_PANELS = 4;
/** Campo de visão vertical da câmera do palco (graus): uma teleobjetiva (foto de produto): a 32° a frente do carro, a 1,5 m da câmera, ficava 2× maior que o centro. */
export const STAGE_FOV = 18;
/** Giro do prato na vista geral (rad/s): uma volta em ~14 s. */
export const TURN_SPEED = 0.45;
/** Altura do topo do prato (m): o confete pousa aqui e a sombra de contato mora aqui. */
export const PLATE_TOP = 0.18;

/** O que o item em foco da garagem pede à câmera. Fora destas seis, a vista é a geral. */
export type StageFocus = 'engine' | 'turbo' | 'tires' | 'brakes' | 'tank' | 'nitro' | null;

// ───────────────────────────── Qualidade própria ─────────────────────────────

/**
 * A qualidade com que o palco desenha. O palco é uma cena só, fora da corrida, então ele escolhe a dele (o `planFor` por painel): a que o
 * chamador pede (as Opções) ou, sem pedido, a Média, que é o padrão do Deck. Com 3 e 4 painéis o Ultra cai para a Alta (o AO em
 * resolução cheia por painel não vale a pena em janelas pequenas).
 */
export function stageQuality(q: Quality | undefined, panels: number): Quality {
  const want: Quality = q ?? 'medium';
  return panels >= 3 && atLeast(want, 'ultra') ? 'high' : want;
}

// ───────────────────────────── Retângulos ─────────────────────────────

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * O retângulo da janela (px CSS, origem no canto de cima) como viewport do GL (origem embaixo), preso ao canvas. Janela de tamanho zero,
 * fora da tela (rolada) ou com número inválido não desenha: `null`.
 */
export function stageViewport(rect: Rect, canvasW: number, canvasH: number): Rect | null {
  if (![rect.x, rect.y, rect.w, rect.h, canvasW, canvasH].every(Number.isFinite)) return null;
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(canvasW, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(canvasH, Math.ceil(rect.y + rect.h));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 1 || h < 1) return null;
  return { x: x0, y: canvasH - y0 - h, w, h };
}

// ───────────────────────────── Oficina: o carro afundando como mola ─────────────────────────────

/** Duração da mola (s); depois dela o deslocamento é exatamente 0. */
export const SPRING_DURATION = 1.5;
const SPRING_ZETA = 0.3;
const SPRING_OMEGA = 12;
const SPRING_DAMP = SPRING_ZETA * SPRING_OMEGA;
const SPRING_WD = SPRING_OMEGA * Math.sqrt(1 - SPRING_ZETA * SPRING_ZETA);
/** O 1º vale da curva vale -1 (a escala do afundar é de quem usa). */
const SPRING_NORM = 1 / (Math.exp(-SPRING_DAMP * (Math.atan(SPRING_WD / SPRING_DAMP) / SPRING_WD)) * Math.sin(Math.atan(SPRING_WD / SPRING_DAMP)));

/** Mola amortecida do carro na oficina: 0 em t = 0, afunda até -1, devolve com um repique e acaba em 0 (`SPRING_DURATION`). */
export function springDip(t: number): number {
  if (!(t > 0) || t >= SPRING_DURATION) return 0;
  return -SPRING_NORM * Math.exp(-SPRING_DAMP * t) * Math.sin(SPRING_WD * t);
}

export interface WorkshopPlan {
  /** Deslocamento da mola, -1..~0,4 (o palco escala em metros). */
  dip: number;
  /** Quantidade de faísca, 0..1. */
  sparks: number;
  /** Tremor da câmera, 0..1. */
  shake: number;
}

const SPARK_SECONDS = 0.8;
const SHAKE_SECONDS = 0.4;

/** A oficina em cada instante. `reduce` (Opções › Reduzir efeitos): sem faísca e sem tremor; o afundar continua, é o que mostra a peça instalada. */
export function workshopPlan(t: number, reduce: boolean): WorkshopPlan {
  const dip = springDip(t);
  if (reduce || !(t >= 0)) return { dip, sparks: 0, shake: 0 };
  const sparks = t < SPARK_SECONDS ? Math.sin((Math.PI * t) / SPARK_SECONDS) : 0;
  const shake = t < SHAKE_SECONDS ? (1 - t / SHAKE_SECONDS) * 0.5 : 0;
  return { dip, sparks, shake };
}

// ───────────────────────────── Revelação do carro comprado ─────────────────────────────

/** A linha do tempo da revelação (s). A capa sai entre `coverStart` e `coverEnd`; o estouro é no fim dela; os faróis acendem depois. */
export const REVEAL = Object.freeze({
  dimEnd: 0.5, coverStart: 0.5, coverEnd: 1.5, burst: 1.5, headStart: 1.6, headEnd: 2.6, novo: 1.8, end: 4.6,
});

export interface RevealPlan {
  /** 0 = coberto, 1 = a capa saiu. */
  cover: number;
  /** Quanto o palco escurece em volta do holofote, 0..1. */
  dim: number;
  /** Força do holofote, 0..1. */
  spot: number;
  /** Faróis acesos, 0..1. */
  head: number;
  /** Clarão do estouro, 0..1 (sempre 0 com `reduce`). */
  flash: number;
  /** Segundos desde o estouro do confete, ou -1 (antes dele, depois do fim e sempre com `reduce`). */
  confetti: number;
  /** O selo "NOVO!", 0..1. */
  novo: number;
  done: boolean;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, t: number): number => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const FADE_OUT = 0.8;

const REVEAL_REST: Readonly<RevealPlan> = Object.freeze({ cover: 1, dim: 0, spot: 0, head: 0, flash: 0, confetti: -1, novo: 0, done: true });

/**
 * A revelação em cada instante: o palco escurece e o holofote sobe, a capa sai, estoura o confete com um clarão, os faróis acendem e o
 * "NOVO!" carimba; no `end` tudo volta ao normal (`done`). `reduce`: sem clarão e sem confete — o resto acontece, mais suave.
 */
export function revealPlan(t: number, reduce: boolean): RevealPlan {
  if (t >= REVEAL.end) return { ...REVEAL_REST };
  const time = Math.max(0, t);
  const fadeStart = REVEAL.end - FADE_OUT;
  const dim = time < REVEAL.burst ? smooth(0, REVEAL.dimEnd, time) : 1 - smooth(REVEAL.burst, REVEAL.burst + 0.6, time);
  const spot = Math.min(smooth(0, REVEAL.dimEnd, time), 1 - smooth(fadeStart, REVEAL.end, time));
  const head = Math.min(smooth(REVEAL.headStart, REVEAL.headEnd, time), 1 - smooth(fadeStart, REVEAL.end, time));
  const novo = Math.min(smooth(REVEAL.novo, REVEAL.novo + 0.2, time), 1 - smooth(REVEAL.end - 0.4, REVEAL.end, time));
  return {
    cover: smooth(REVEAL.coverStart, REVEAL.coverEnd, time),
    dim, spot, head, novo,
    flash: reduce || time < REVEAL.burst ? 0 : Math.exp(-(time - REVEAL.burst) / 0.12),
    confetti: reduce || time < REVEAL.burst ? -1 : time - REVEAL.burst,
    done: false,
  };
}

// ───────────────────────────── Confete ─────────────────────────────

export const CONFETTI_COUNT = 120;
/** Vida de cada peça (s) desde o estouro. */
export const CONFETTI_LIFE = 3;
/** Quantas cores a paleta do confete tem (o `color` de uma peça é um índice nela). */
export const CONFETTI_COLORS = 6;
const CONFETTI_Y0 = 1.5;
const CONFETTI_DRAG = 1.4;
const CONFETTI_AIR = 2.2;
const CONFETTI_FALL = 1.6;

export interface ConfettiPiece { x: number; y: number; z: number; rot: number; scale: number; color: number; alive: boolean }

/**
 * A peça `i` do confete `t` segundos depois do estouro. Lançamento e esvoaçar saem do `hash2` (nada de `Math.random`): a mesma peça no
 * mesmo instante dá sempre a mesma posição. Sobe, o ar a freia, cai devagar (velocidade terminal) e pousa no prato. `out` é reaproveitado.
 */
export function confettiPiece(i: number, t: number, out: ConfettiPiece): ConfettiPiece {
  const h = (k: number): number => hash2(i * 8 + k, 4242);
  const angle = h(0) * Math.PI * 2;
  const speed = 0.8 + h(1) * 1.8;
  const up = 1.5 + h(2) * 2.5;
  const spin = (h(3) - 0.5) * 14;
  const sway = h(4) * 6;
  const time = Math.max(0, t);
  const reach = (speed * (1 - Math.exp(-CONFETTI_DRAG * time))) / CONFETTI_DRAG;
  const flutter = 0.12 * Math.sin(time * 5 + sway);
  out.x = Math.cos(angle) * reach + flutter;
  out.z = Math.sin(angle) * reach - flutter;
  const y = CONFETTI_Y0 - CONFETTI_FALL * time + ((up + CONFETTI_FALL) * (1 - Math.exp(-CONFETTI_AIR * time))) / CONFETTI_AIR;
  out.y = Math.max(PLATE_TOP + 0.02, y);
  out.rot = spin * time;
  const base = 0.09 + h(6) * 0.07;
  out.scale = base * Math.min(1, Math.max(0, (CONFETTI_LIFE - time) / 0.4));
  out.color = Math.floor(h(5) * CONFETTI_COLORS);
  out.alive = t >= 0 && t < CONFETTI_LIFE;
  return out;
}

// ───────────────────────────── Câmera de detalhe ─────────────────────────────

/** O que a câmera precisa saber do modelo (um `CarModel` serve): eixos, saídas do escape e altura. */
export interface FocusModel {
  readonly axles: readonly [{ x: number; z: number; r: number; w: number }, { x: number; z: number; r: number; w: number }];
  readonly exhausts: ReadonlyArray<readonly [number, number, number]>;
  readonly height: number;
}

export interface CameraPose {
  /** Em volta do alvo: 0 = a câmera no +Z do mundo (olhando o carro de frente quando o prato está em `yaw = π`), π = atrás. */
  azimuth: number;
  elevation: number;
  distance: number;
  /** Ponto mirado, no mundo (o carro no centro do prato com o `yaw` abaixo). */
  target: [number, number, number];
  /** Giro do prato que o detalhe pede (π = a frente do carro para a câmera); `null` na vista geral, onde o prato gira sozinho. */
  yaw: number | null;
}

/** Distância para uma caixa de meia-largura `halfW` e meia-altura `halfH` caber no quadro (campo vertical `fovDeg`, razão `aspect`). */
export function fitDistance(aspect: number, fovDeg: number, halfW: number, halfH: number): number {
  const vHalf = (fovDeg * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(0.2, aspect));
  return Math.max(halfH / Math.sin(vHalf), halfW / Math.sin(hHalf));
}

/** Ponto do referencial do carro no mundo, com o prato girado `yaw` (a mesma conta do `Object3D.rotation.y` do three). */
export function carToWorld(yaw: number, p: readonly [number, number, number]): [number, number, number] {
  const c = Math.cos(yaw); const s = Math.sin(yaw);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}

const FRONT = Math.PI;

/**
 * Para onde a câmera vai quando um item da garagem ganha o foco. Tudo sai das MEDIDAS do modelo (eixos, escape, altura): motor e turbo no
 * capô, pneus e freios na roda dianteira (o freio mais de perto), tanque no quarto traseiro, nitro no escape. Sem foco, a vista geral
 * (3/4, o prato gira) enquadrada pela largura da janela.
 */
export function focusPose(model: FocusModel, focus: StageFocus | string, aspect = 16 / 9): CameraPose {
  const [front, rear] = model.axles;
  const fit = (halfW: number, halfH: number): number => fitDistance(aspect, STAGE_FOV, halfW, halfH);
  const pose = (azimuth: number, elevation: number, halfW: number, halfH: number, local: readonly [number, number, number]): CameraPose =>
    ({ azimuth, elevation, distance: fit(halfW, halfH), target: carToWorld(FRONT, local), yaw: FRONT });
  const hood = Math.min(0.75, Math.max(0.45, model.height * 0.55));
  switch (focus) {
    case 'engine': return pose(0.5, 0.42, 1.2, 0.7, [0, hood, front.z * 0.62]);
    case 'turbo': return pose(-0.55, 0.36, 1.2, 0.7, [0, hood, front.z * 0.62]);
    case 'tires': return pose(1.15, 0.14, 0.75, 0.5, [-front.x, front.r, front.z]);
    case 'brakes': return pose(1.35, 0.06, 0.45, 0.35, [-front.x, front.r, front.z]);
    case 'tank': return pose(Math.PI - 0.65, 0.25, 1.3, 0.8, [-rear.x, 0.62, rear.z - 0.2]);
    case 'nitro': {
      const e = model.exhausts[0] ?? [0, 0.4, rear.z + 0.7];
      return pose(Math.PI - 0.22, 0.14, 0.9, 0.6, [e[0], e[1], e[2]]);
    }
    default:
      return { azimuth: 0, elevation: 0.22, distance: fit(2.3, 0.95), target: [0, Math.max(0.45, model.height * 0.38), 0], yaw: null };
  }
}

// ───────────────────────────── Pódio ─────────────────────────────

export interface PodiumSlot {
  place: 1 | 2 | 3;
  x: number;
  z: number;
  /** Altura do topo do bloco (m): o carro fica em cima. */
  top: number;
  /** Giro do carro (π = de frente para a câmera), um pouco para dentro. */
  yaw: number;
}

const PODIUM: readonly PodiumSlot[] = Object.freeze([
  { place: 1, x: 0, z: 0, top: 0.9, yaw: FRONT },
  { place: 2, x: -2.7, z: 0.3, top: 0.6, yaw: FRONT - 0.35 },
  { place: 3, x: 2.7, z: 0.3, top: 0.35, yaw: FRONT + 0.35 },
] as PodiumSlot[]);

/** Os lugares do pódio para `n` carros (1 a 3): o 1º no centro e mais alto, o 2º à esquerda, o 3º à direita. */
export function podiumSlots(n: number): PodiumSlot[] {
  return PODIUM.filter((s) => s.place <= Math.min(3, Math.max(0, Math.floor(n)))).map((s) => ({ ...s }));
}
