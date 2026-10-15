// Batida REALISTA (V8, docs/ondas/V8-efeitos.md): no lugar do "POW!" e das estrelinhas — que ficam na opção "Efeitos de cartum" —, o que sai do
// PONTO DE CONTATO: uma chuva curta de faíscas metálicas finas que caem, lascas pequenas e escuras que voam, caem e quicam, e um flash breve e
// contido. Puro (sem three): as faíscas e o flash vão ao pool de faíscas (o lote de traços, `streaks.ts`) e as lascas ao pool de bolhas de
// `effects.ts` (pontos de 3–9 cm que não incham) — nenhuma malha e nenhum programa novos. O tranco de câmera é o de `Effects.shake`.
// Coordenadas como nos outros emissores: z em unidades de pista, x em meias larguras, altura em m; velocidades `sv*` relativas ao carro (esticam o traço).
import { CAR_HALF_WIDTH, CAR_LENGTH } from '../../core/constants';
import { wrappedDelta } from '../../core/sim/collisions';
import type { PuffSpec } from './smoke';
import type { SparkSpec } from './sparks';

/** Unidades de pista por metro e metros por meia largura (units.ts). */
const U_PER_M = 50;
const M_PER_X = 7;

/** O que o ponto de contato lê de cada carro (um `CarState` serve). */
export interface ImpactCar { id: number; z: number; x: number; speed: number; collisionCooldown: number }
/** O ponto da batida: z, x e altura (m); `partner` é o id do outro carro, ou −1 quando foi no cenário. */
export interface Contact { z: number; x: number; h: number; partner: number }

/** Altura do para-choque (m), onde dois carros se tocam; a quina que pega no cenário fica um pouco mais alta. */
const BUMPER_H = 0.45;
const CORNER_H = 0.5;
/** Até onde um carro com a batida registrada conta como o outro lado do contato: um pouco mais que a caixa (o núcleo já os separou). */
const PARTNER_DZ = CAR_LENGTH * 1.3;
const PARTNER_DX = CAR_HALF_WIDTH * 2.2;

/**
 * O ponto de contato da batida do carro `c`: com outro carro que também está batendo (cooldown) e encostado nele, o meio dos dois (o mesmo visto de
 * qualquer um deles: uma rajada só por batida); sem ninguém (árvore, placa, muro — o carro está fora do asfalto), a quina da frente do lado de fora.
 */
export function contactPoint(c: ImpactCar, cars: readonly ImpactCar[], trackLength: number, out: Contact): Contact {
  let partner = -1; let best = Infinity; let dzBest = 0; let dxBest = 0;
  for (const o of cars) {
    if (o.id === c.id || o.collisionCooldown <= 0) continue;
    const dz = wrappedDelta(o.z, c.z, trackLength);
    const dx = o.x - c.x;
    if (Math.abs(dz) >= PARTNER_DZ || Math.abs(dx) >= PARTNER_DX) continue;
    const d = Math.abs(dz) / CAR_LENGTH + Math.abs(dx) / PARTNER_DX;
    if (d < best) { best = d; partner = o.id; dzBest = dz; dxBest = dx; }
  }
  if (partner >= 0) {
    const z = (c.z + dzBest / 2) % trackLength;
    out.z = z < 0 ? z + trackLength : z; out.x = c.x + dxBest / 2; out.h = BUMPER_H; out.partner = partner;
  } else {
    out.z = (c.z + CAR_LENGTH * 0.35) % trackLength; out.x = c.x + (c.x >= 0 ? 1 : -1) * CAR_HALF_WIDTH; out.h = CORNER_H; out.partner = -1;
  }
  return out;
}

/** Faíscas e lascas por batida, antes do fator do degrau: a forte (queda ≥ 12% da máxima, a que antes dava o rodopio) e a leve. */
const SPARKS = { strong: 26, light: 14 } as const;
const CHIPS = { strong: 8, light: 4 } as const;
const STRONG_DROP = 0.12;
/** Cores das lascas: plástico preto, cinza-escuro, cinza claro (para-choque, carbono, alumínio). */
const CHIP_SHADES: ReadonlyArray<readonly [number, number, number]> = [[0.06, 0.06, 0.07], [0.2, 0.2, 0.22], [0.46, 0.46, 0.48]];

/** Sorteio estocástico de quantas saem para uma taxa esperada `n` (a média certa, como em sparks.ts). */
const draw = (n: number, rnd: () => number): number => Math.floor(n + rnd());

/**
 * O que sai da batida em `at`, com o carro a `speed` (unidades/s) e a queda de velocidade `drop` (fração da máxima). `factor` é o do degrau
 * (`fxPlan.sparks`; 0 em "Reduzir efeitos": nada sai). Tudo nasce andando com o carro (a câmera vai junto) e fica para trás pelo arrasto do pool.
 */
export function emitImpact(at: Contact, speed: number, drop: number, factor: number, rnd: () => number, spark: (s: SparkSpec) => void, chip: (p: PuffSpec) => void): void {
  if (factor <= 0) return;
  const strong = drop >= STRONG_DROP;
  // Faíscas: metal raspando em metal — saem do contato para os lados e para cima, um pouco para trás, a 6–12 m/s, finas e curtas, e caem. Rápidas o
  // bastante para sair da silhueta do carro em ~0,15 s: o contato de uma batida de frente fica atrás da lataria vista pela câmera de perseguição (na
  // galeria do 2P, a 3–9 m/s elas apagavam escondidas). Branco-amareladas a laranja (o metal esfria): sempre R ≥ G ≥ B, HDR no vermelho (o bloom, com
  // teto, pega o miolo).
  const n = draw((strong ? SPARKS.strong : SPARKS.light) * factor, rnd);
  for (let k = 0; k < n; k++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const lat = side * (0.55 + 0.45 * rnd()); const up = 0.3 + 0.7 * rnd(); const back = -(0.1 + 0.4 * rnd());
    const v = (6 + 6 * rnd()) / Math.hypot(lat, up, back);
    const ax = lat * v; const ay = up * v; const az = back * v; // m/s, relativas ao carro
    const hot = rnd();
    spark({
      z: at.z + (rnd() - 0.5) * 20, x: at.x + (rnd() - 0.5) * 0.06, h: at.h + (rnd() - 0.5) * 0.2,
      vz: speed + az * U_PER_M, vx: ax / M_PER_X, vh: ay, svz: az * U_PER_M, svx: ax / M_PER_X, svh: ay,
      life: 0.15 + 0.23 * rnd(), width: 0.018 + 0.014 * rnd(), gravity: 9.8, r: 2.4, g: 1.25 + 0.75 * hot, b: 0.3 + 0.7 * hot * hot,
    });
  }
  // Flash: o clarão do choque, pequeno e breve (~5 quadros), parado no contato — dois traços largos e curtos cruzados (um de pé, um de lado), não um balão.
  const fw = strong ? 0.34 : 0.24;
  spark({ z: at.z, x: at.x, h: at.h, vz: speed, vx: 0, vh: 0, svz: 0, svx: 0, svh: 0.2, life: 0.08, width: fw, gravity: 0, r: 2.6, g: 2.2, b: 1.6 });
  spark({ z: at.z, x: at.x, h: at.h, vz: speed, vx: 0, vh: 0, svz: 0, svx: 0.04, svh: 0, life: 0.08, width: fw, gravity: 0, r: 2.6, g: 2.2, b: 1.6 });
  // Lascas: pedacinhos de para-choque que voam para os lados e para cima, ficam para trás do carro, caem e quicam (o pool de bolhas, sem inchar).
  const m = draw((strong ? CHIPS.strong : CHIPS.light) * factor, rnd);
  for (let k = 0; k < m; k++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const [r, g, b] = CHIP_SHADES[Math.min(CHIP_SHADES.length - 1, Math.floor(rnd() * CHIP_SHADES.length))];
    chip({
      z: at.z + (rnd() - 0.5) * 16, x: at.x + side * 0.02 * rnd(), h: at.h,
      vz: speed * (0.82 + 0.15 * rnd()), vx: (side * (2 + 3 * rnd())) / M_PER_X, vh: 2 + 2.5 * rnd(),
      life: 0.55 + 0.35 * rnd(), size: 0.035 + 0.05 * rnd(), grow: 0, gravity: 9.8, r, g, b,
    });
  }
}
