// O desenho de cada degrau de qualidade, em dados puros (sem three, sem DOM): quem usa é o `renderer.ts`, quem confere é
// `tests/postfx-plan.test.ts`. Ideia: o degrau SOBE em efeitos, nunca troca um por outro sem dizer (a Média tem FXAA, a Alta troca por MSAA:
// os dois são "antialias"). Os números abaixo são PROVISÓRIOS (sem GPU aqui; docs/ondas/L/L2.md): o FPS de verdade é do dono.
import type { Quality } from '../../game/contracts';
import { atLeast } from '../../game/quality';
import { zToMeters } from '../units';

/** Como a borda serrilhada é tratada: o MSAA do contexto (só a tela), FXAA depois da saída, ou MSAA no alvo da cena. */
export type AntiAlias = 'canvas' | 'fxaa' | 'msaa';

export interface BloomPlan {
  /** 1 = a cadeia do `UnrealBloomPass` começa em ½ do alvo (o da Alta); 0,5 = em ¼ (bloom em meia resolução, a Média). */
  scale: number;
}
export interface AoPlan {
  /** Resolução do AO em relação ao viewport (0,5 = meia, 1 = cheia). */
  scale: number;
  /** Raio no mundo (m) e amostras por pixel: os do registro `ULTRA_EFFECTS.gtao` (src/bench/ultra.ts). */
  radius: number;
  samples: number;
}

export interface PostPlan {
  /** Desenha por um alvo HDR + passes (Média em diante); falso = direto na tela, o tone mapping é do material. */
  post: boolean;
  aa: AntiAlias;
  /** Amostras do MSAA do alvo da cena (0 = sem). */
  msaa: 0 | 4;
  bloom: BloomPlan | null;
  ao: AoPlan | null;
  radialBlur: boolean;
  /** A mancha de contato sob o carro (`Cars.blob`, cars.ts): desenha em todos os degraus. */
  contactShadow: boolean;
  /** A gradação por bioma × período (stylize.ts): em todos os degraus. */
  grade: boolean;
  /** A resolução dinâmica só existe onde há alvo da cena (Média em diante). */
  dynamicResolution: boolean;
  /** Ids de `ULTRA_EFFECTS` (src/bench/ultra.ts) que este plano liga: o registro precisa dizer a verdade. */
  ultraEffects: string[];
}

/** AO: o GTAO da Alta (meia resolução) vale até 2 jogadores; o do Ultra (resolução cheia), até 4 (os pixels somados são os de 1). */
const AO_RADIUS = 1.2;
const AO_SAMPLES = 16;
const HIGH_AO_MAX_VIEWPORTS = 2;

export function planFor(q: Quality, viewports: number): PostPlan {
  const n = Math.max(1, Math.min(4, Math.floor(viewports)));
  const post = atLeast(q, 'medium');
  const ultra = atLeast(q, 'ultra');
  const high = atLeast(q, 'high');
  let ao: AoPlan | null = null;
  if (ultra) ao = { scale: 1, radius: AO_RADIUS, samples: AO_SAMPLES };
  else if (high && n <= HIGH_AO_MAX_VIEWPORTS) ao = { scale: 0.5, radius: AO_RADIUS, samples: AO_SAMPLES };
  return {
    post,
    aa: high ? 'msaa' : post ? 'fxaa' : 'canvas',
    msaa: high ? 4 : 0,
    bloom: post ? { scale: high ? 1 : 0.5 } : null,
    ao,
    radialBlur: high,
    contactShadow: true,
    grade: true,
    dynamicResolution: post,
    ultraEffects: ultra ? ['gtao'] : [],
  };
}

/** Ids dos efeitos ligados num degrau e numa lotação (cada degrau tem os do anterior). */
export function qualityEffects(q: Quality, viewports: number): string[] {
  const p = planFor(q, viewports);
  const out = ['grade', 'contact-shadow'];
  if (shadowPlan(q, viewports).enabled) out.push('sun-shadow');
  if (p.bloom) out.push('bloom');
  if (p.aa !== 'canvas') out.push('aa');
  if (p.radialBlur) out.push('radial-blur');
  if (p.ao) out.push('gtao');
  if (p.ao && p.ao.scale >= 1) out.push('gtao-full'); // o que o Ultra tem a mais que a Alta: o AO em resolução cheia
  return out;
}

// ───────────────────────────── desfoque radial ─────────────────────────────

/** Fração da velocidade máxima a partir da qual o desfoque radial começa (o cronograma: "acima de 85% da velocidade"). */
export const RADIAL_START = 0.85;
/** O que o nitro garante mesmo devagar (0..1). */
export const RADIAL_NITRO_FLOOR = 0.55;

/** Força do desfoque radial, 0..1: sobe de 0 em `RADIAL_START` a 1 na velocidade máxima; o nitro dá um piso; reduzir efeitos zera. */
export function radialBlurStrength(speedFrac: number, nitro: boolean, reduceEffects: boolean): number {
  if (reduceEffects) return 0;
  const fast = Math.max(0, Math.min(1, (speedFrac - RADIAL_START) / (1 - RADIAL_START)));
  return nitro ? Math.max(fast, RADIAL_NITRO_FLOOR) : fast;
}

// ───────────────────────────── sombra por viewport ─────────────────────────────

export interface ShadowPlan {
  enabled: boolean;
  /** Lado do mapa de cada viewport (px). */
  mapSize: number;
  /** A cada quantos quadros cada viewport re-desenha o mapa dele (1 = todo quadro). */
  every: 1 | 2;
  /** PCF (V22/F6): raio do filtro em texels, e o bias e o normalBias da luz (m). */
  radius: number;
  bias: number;
  normalBias: number;
}

/** O lado do quadrado que o mapa de sombra cobre (m): a câmera da luz vai de −80 a +80 (sky.ts). */
export const SHADOW_SPAN_M = 160;
/** O bias de profundidade, igual em todos os mapas (era `sun.shadow.bias` em sky.ts). */
const SHADOW_BIAS = -0.00025;

/**
 * V22/F6: o PCF do three r186 tem 5 pontos (disco de Vogel girado por ruído por pixel): a borda é granulada se a penumbra (raio × texel) for estreita. Com o mapa de 2048 (texel 7,8 cm)
 * o raio 2 dava 0,16 m de penumbra; o raio 3 dá 0,23 m. O mapa de 1024 (texel 15,6 cm) já tinha 0,31 m (raio 2). O `normalBias` acompanha o texel (um raio maior com bias fixo
 * faz o chão se auto-sombrear em rampa): ~1,3 texel nos 2048 (0,10 m), ~1 texel nos 1024 (0,16 m; era 0,12, abaixo do texel).
 */
const PCF_2048 = { radius: 3, bias: SHADOW_BIAS, normalBias: 0.1 };
const PCF_1024 = { radius: 2, bias: SHADOW_BIAS, normalBias: 0.16 };

/**
 * Sombra do sol por qualidade e lotação. Com 3 e 4 jogadores cada viewport tem o seu mapa de 1024², refeito a cada 2 quadros (e o
 * deslocamento do mundo entre eles é compensado: `shadowShiftMeters`): os texels por quadro caem a ⅛ do que 4 mapas de 2048² custavam.
 */
export function shadowPlan(q: Quality, viewports: number): ShadowPlan {
  if (!atLeast(q, 'medium')) return { enabled: false, mapSize: 0, every: 1, radius: 0, bias: 0, normalBias: 0 };
  if (viewports >= 3) return { enabled: true, mapSize: 1024, every: 2, ...PCF_1024 };
  return atLeast(q, 'high') ? { enabled: true, mapSize: 2048, every: 1, ...PCF_2048 } : { enabled: true, mapSize: 1024, every: 1, ...PCF_1024 };
}

/** O viewport `i` re-desenha o mapa dele neste quadro? Mapa ainda vazio sempre re-desenha (primeiro uso, tamanho trocado). */
export function shadowDue(frame: number, viewport: number, every: number, mapReady: boolean): boolean {
  if (!mapReady || every <= 1) return true;
  return (frame + viewport) % every === 0;
}

/**
 * Quantos metros o mundo andou entre o quadro em que o mapa foi desenhado e este (o carro foi de `zThen` a `zNow`, em unidades de
 * pista; a pista dá a volta em `trackLength`). O mundo se reposiciona a cada quadro, então um mapa velho fica deslocado dessa distância.
 */
export function shadowShiftMeters(zThen: number, zNow: number, trackLength: number): number {
  let d = zNow - zThen;
  if (trackLength > 0) {
    d = ((d % trackLength) + trackLength) % trackLength;
    if (d > trackLength / 2) d -= trackLength;
  }
  return zToMeters(d);
}
