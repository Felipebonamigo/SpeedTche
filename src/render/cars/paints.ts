// Pincéis dos carros (pintura, acento, faixas, cromo, vidro, lentes, borracha) e a escolha pura da
// segunda cor e da pintura (camadas A/B) de cada carro. Nada de DOM: os testes usam direto.
import * as THREE from 'three';
import type { CarBody, CarDef } from '../../core/types';
import type { CarColors } from '../../game/contracts';
import { brush, withBrush } from './kit';

// Pintura sólida: quase sem metal (o metal come o difuso e desbota a cor); o brilho de verniz vem do
// clearcoat (qualidade alta) com o reflexo do céu do env map da cena.
export const PAINT = brush('#ffffff', { paint: 1, rough: 0.4, metal: 0.04 });
/** Pintura um tom abaixo (painéis de baixo, para-choque pintado). */
export const PAINT_SHADE = brush('#b4b4b4', { paint: 1, rough: 0.45, metal: 0.04 });
export const ACCENT = brush('#ffffff', { paint: 1, accent: 1, rough: 0.4, metal: 0.04 });
/** Faixas: pintura que vira acento quando o carro usa a camada. */
export const STRIPE_A = withBrush(PAINT, { layer: 1 });
export const STRIPE_B = withBrush(PAINT, { layer: 2 });
export const STRIPE_AB = withBrush(PAINT, { layer: 3 });

export const UNDER = brush('#0c0d0f', { rough: 0.95 });
export const TRIM = brush('#17181b', { rough: 0.72 });
export const TRIM_SOFT = brush('#2a2c31', { rough: 0.6 });
export const CARBON = brush('#1d1f24', { rough: 0.38, metal: 0.35 });
export const GRILLE = brush('#101114', { rough: 0.8 });
export const CHROME = brush('#e2e6ec', { rough: 0.12, metal: 1 });
export const ALU = brush('#b9bec6', { rough: 0.34, metal: 0.9 });
export const GUNMETAL = brush('#4a4e57', { rough: 0.32, metal: 0.85 });
// Vidro com reflexo (M4): polido e quase espelho (o env map do céu manda), mais claro que o de antes para o azul ler com o céu por cima.
export const GLASS = brush('#34507a', { rough: 0.04, metal: 0.92 });
export const GLASS_DARK = brush('#1b2638', { rough: 0.05, metal: 0.9 });
/** Faixa de brilho do vidro (cartum: o reflexo diagonal do céu): espelho puro, claro. */
export const GLINT = brush('#eaf6ff', { rough: 0.04, metal: 1 });
export const HEAD = brush('#fff6e0', { rough: 0.15, head: 1 });
export const HEAD_HOUSING = brush('#3a3f48', { rough: 0.2, metal: 0.8 });
export const DRL = brush('#e8f4ff', { rough: 0.15, head: 0.8 });
export const AMBER = brush('#ffa51f', { rough: 0.2, head: 0.45 });
export const TAIL = brush('#ff2616', { rough: 0.18, tail: 1 });
export const TAIL_DIM = brush('#5a1210', { rough: 0.2, tail: 0.25 });
export const REVERSE = brush('#e8e8e8', { rough: 0.2, tail: 0.1 });
export const TIRE = brush('#141416', { rough: 0.94 });
export const TIRE_SIDE = brush('#1d1e21', { rough: 0.88 });
/** Inscrição lisa do flanco (V2, realismo 2): a faixa de borracha mais clara, fosca, sem texto. */
export const TIRE_LETTER = brush('#2c2d31', { rough: 0.9 });
/** Disco de freio no fundo do aro (V2, realismo 2): aço polido, escuro. */
export const BRAKE_DISC = brush('#6b7078', { rough: 0.38, metal: 0.9 });
export const WHITEWALL = brush('#ecebe4', { rough: 0.7 });
export const INTERIOR = brush('#23252a', { rough: 0.85 });
// Estilo HCT (V2, docs/ondas/V2-gt.md): pincéis SEM luz nem camada (os de luz e de faixa continuam os de cima; tests/car-round.test.ts).
/** Vidro escuro neutro (o HCT2 aprovado): reflete o céu como o `GLASS`, sem o azul liso. */
export const GLASS_TINT = brush('#080a0e', { rough: 0.04, metal: 0.9 });
/** Reflexo do céu nas janelas laterais do vidro escuro: mais contido que o `GLINT`. */
export const GLINT_SOFT = brush('#c6d4e2', { rough: 0.04, metal: 1 });
/** Reflexo no para-brisa e no vidro de trás: o céu de cima, mais apagado ainda. */
export const GLINT_SKY = brush('#9fb2c6', { rough: 0.05, metal: 1 });
/** Pisca e luz de ré APAGADOS (o carro andando): lente colorida, sem emissivo. */
export const LENS_AMBER = brush('#ff9418', { rough: 0.15, metal: 0.1 });
export const LENS_CLEAR = brush('#d9dde3', { rough: 0.12, metal: 0.35 });
/** Fundo vermelho-escuro do poço da lanterna embutida (a lente acesa fica no fundo dele). */
export const TAIL_WELL = brush('#3d0a08', { rough: 0.35 });
/** Preto brilhante (painel da traseira, moldura do farol). */
export const PIANO = brush('#0f1013', { rough: 0.22, metal: 0.3 });
/** Refletor do farol, atrás dos projetores. */
export const REFLECTOR = brush('#c9ced6', { rough: 0.25, metal: 0.7 });
export const SEAT = brush('#3a2d27', { rough: 0.8 });
export const PLATE = brush('#bdb9aa', { rough: 0.55 });
export const WHITE = brush('#f3f3f0', { rough: 0.4 });
export const MUD = brush('#15161a', { rough: 0.9 });

/** Segunda cor que combina quando o carro não traz `accent`: escuro nos quentes e claros, branco nos frios. */
export function defaultAccent(color: string): string {
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  if (hsl.l > 0.8) return '#1c2b4f'; // branco → azul-marinho
  if (hsl.s < 0.18) return hsl.l < 0.35 ? '#e8e8e8' : '#15171c';
  const hue = hsl.h * 360;
  const warm = hue < 70 || hue > 320;
  return warm ? '#15171c' : '#f2f2f2';
}

/** Bits de pintura da instância (combinam com `layer` dos pincéis): 2 = camada A, 4 = camada B. */
export const LIVERY_A = 2;
export const LIVERY_B = 4;
/**
 * No LOTE DE RODA o bit da camada B (as faces `layer: 2` da roda: o aro) é o do ARO, não o da faixa B do corpo (N3): o corpo e as rodas
 * são lotes diferentes, cada um com o seu `instExtra`. Mesmo valor, outro bit: tirar a faixa B do corpo não tira o aro.
 */
export const WHEEL_RIM = LIVERY_B;

/** Bits da faixa que o look pede (`nenhuma`, `a`, `b`, `ab`); sem escolha (ou id que não existe) vale a faixa do modelo (`stock`). */
export function stripeBits(stripe: string | undefined, stock: number): number {
  switch (stripe) {
    case 'nenhuma': return 0;
    case 'a': return LIVERY_A;
    case 'b': return LIVERY_B;
    case 'ab': return LIVERY_A | LIVERY_B;
    default: return stock;
  }
}

/**
 * Pintura de cada carro: o n-ésimo carro de um estilo (na ordem de `cars`) usa a n-ésima pintura da
 * lista do modelo. Assim dois carros do mesmo estilo (Falcão GT e Boitatá GT) nunca saem iguais.
 */
export function liveryFor(def: CarDef, cars: readonly CarDef[], order: readonly number[]): number {
  const same = cars.filter((c) => c.body === def.body);
  const n = Math.max(0, same.findIndex((c) => c.id === def.id));
  return order.length ? order[n % order.length] : 0;
}

export interface CarPaint { color: string; accent: string; livery: number; body: CarBody }

/**
 * Cores e pintura (camadas A/B) do carro na pista. `chosen` é a pintura que o jogador escolheu (RenderFrame.paints,
 * src/game/paints.ts): troca a cor e a segunda cor, e as faixas continuam as do carro. Sem ela, a de fábrica.
 */
export function carPaint(def: CarDef, cars: readonly CarDef[], order: readonly number[], chosen?: CarColors | null): CarPaint {
  const livery = liveryFor(def, cars, order);
  if (chosen) return { color: chosen.color, accent: chosen.accent, livery, body: def.body };
  return { color: def.color, accent: def.accent ?? defaultAccent(def.color), livery, body: def.body };
}
