// Paleta por cenário × hora do dia: o que o chão, o céu e a luz de cada combinação usam.
// Céus do entardecer e da noite são escritos por bioma (o laranja do cânion não é o rosa da
// Lapônia); o resto sai de uma base diurna por bioma e de uma "gradação" por hora (entardecer
// esquenta e puxa para o roxo; noite azula e escurece sem virar preto). Referência de arte:
// Horizon Chase Turbo — cor saturada, céu em gradiente forte, sombra colorida, névoa com cor.
// Funções puras; sem DOM. Calibrado para o ACES; desde a L1 o tone mapping é o Neutral com gradação por paleta (stylize.ts:
// `gradingFor` parte destes valores — a `exposure` ganha o ajuste da curva nova).
// M2 (docs/ondas/M/M2.md): as 18 combinações bioma × período são um DADO exportado (`PALETTE_TABLE`, congelada) — a M6 interpola
// entre elas durante a corrida —, calibradas por critérios que o teste mede (tests/paleta-m2.test.ts): contraste estrada × chão,
// carro branco e escuro × asfalto, saturação máxima, luminância média, céus distintos por bioma, sol acima das montanhas.
import type { SceneryId, TimeOfDay } from '../core/types';

export interface Palette {
  /** Gradiente do céu, de cima para o horizonte. */
  sky: [string, string, string];
  /**
   * V12: o céu que DÁ LUZ ao carro (a IBL difusa do domo e o reflexo do verniz). Igual ao `sky` de dia e no entardecer; à noite é o céu azul de antes do roxo: a noite
   * roxa vive no que se vê (céu, névoa, chão, cenário), não na luz que cai no carro (cor-brilho: carro branco lê branco).
   */
  skyLight: [string, string, string];
  /** Cor do sol (dia/entardecer) ou null. */
  sun: string | null;
  /** Cor da lua (noite) ou null. */
  moon: string | null;
  stars: boolean;
  grassLight: string;
  grassDark: string;
  rumbleLight: string;
  rumbleDark: string;
  roadLight: string;
  roadDark: string;
  /** Faixa central da pista. */
  lane: string;
  fog: string;
  /** V12: a névoa que a luz do carro vê (o "abaixo do horizonte" da IBL): igual à `fog` de dia e no entardecer; à noite, a de antes do roxo. */
  fogLight: string;
  /** Camada de parallax distante (montanhas/skyline) e próxima (colinas/prédios). */
  far: string;
  near: string;
  /** Asfalto do box e a linha que o separa da pista. */
  pit: string;
  pitLine: string;
  /** Luz ambiente 0..1 (1 = dia), para os sprites decidirem se acendem janelas e postes. */
  light: number;

  // ── Céu e luz ──
  /** Brilho do céu em volta do sol/lua (o horizonte do lado do sol puxa para ela). */
  skyGlow: string;
  /** Luz direcional (sol ou lua). */
  sunLight: string;
  sunIntensity: number;
  /** Hemisférica: o céu dá a cor das sombras (azulada/arroxeada), o chão o rebatimento. */
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  /** Força do reflexo do céu (env map) nos materiais. */
  envIntensity: number;
  /** Exposição do tone mapping. */
  exposure: number;
  /** Multiplicador da densidade da névoa (1 = dia). */
  fogDensity: number;
  /** Bloom da qualidade alta: força, raio, limiar (luminância linear antes do tone mapping). */
  bloom: [number, number, number];
  /** Nuvens: lado iluminado e lado da sombra (null = sem nuvens). */
  cloudLit: string | null;
  cloudShade: string;

  // ── Chão ──
  /** Asfalto de referência (a luz do resto da cena parte dele: chão, hemisférica, box). A cor que a PISTA pinta é `roadBase` (V11). */
  asphalt: string;
  /** V11: a cor base que a textura da pista pinta (terra alaranjada, terra avermelhada, ocre, cinza quente, roxo-azulado à noite…), e a segunda tinta das manchas e veios. */
  roadBase: string;
  roadAlt: string;
  /** V11: quanto a pista é terra (0 = asfalto, 1 = terra batida): liga as rachaduras e o desgaste de terra na textura. */
  roadEarth: number;
  /** Acostamento (cascalho/terra/areia) e a faixa de transição até o terreno. */
  shoulder: string;
  verge: string;
  /** Terreno por altura e inclinação. */
  groundLow: string;
  groundHigh: string;
  /** V22/F7: o chão com 3 tons por bioma. `groundLow` (o médio) e `groundHigh` seguem como eram; o claro QUENTE (matiz para o amarelo, mais luz) e o escuro FRIO (matiz para o azul-esmeralda, menos luz) entram onde o tom do chão passa de 0,5 e onde cai abaixo dele (terrain.ts). */
  groundWarm: string;
  groundCool: string;
  rock: string;
  snow: string;
  /** Areia da praia (litoral) e das dunas. */
  sand: string;
  /** Montanhas do horizonte em três planos, de perto para longe (cor do topo; a base some na névoa). */
  layers: [string, string, string];
  /** Quanto cada plano já está dentro da névoa (0 = cor pura, 1 = cor da névoa). */
  layerHaze: [number, number, number];
  /** Água: fundo, raso e espuma. */
  waterDeep: string;
  waterShallow: string;
  foam: string;
  /** Poça de luz dos postes no asfalto (noite) ou null. */
  lampPool: string | null;
  /** Brilho das marcações da pista (tinta refletiva) à noite: 0 de dia. */
  markingGlow: number;

  // ── Sol e lua (M2) ──
  /** Azimute (graus, 0 = à frente na largada, positivo = à direita) e elevação (graus) do sol ou da lua. */
  sunAz: number;
  sunEl: number;

  // ── Mar e reflexo de lente (M2) ──
  /** Força do caminho de brilho do sol/lua na água (1 = o do dia da Copacabana). */
  seaGlint: number;
  /** Quanto do céu o mar reflete no ângulo raso (teto do fresnel, 0..1). */
  seaSky: number;
  /** Expoente do brilho na água: menor = caminho mais largo e comprido (o do pôr do sol). */
  seaSpec: number;
  /** Reflexo de lente: força 0..1 (só o entardecer; 0 nos outros períodos) e a cor dele (a do bioma, a mesma nos 3 períodos para a M6 interpolar a força). */
  flare: number;
  flareColor: string;
}

export const SCENERIES: readonly SceneryId[] = ['tropical', 'desert', 'city_night', 'alpine', 'coast', 'savanna'];
export const TIMES_OF_DAY: readonly TimeOfDay[] = ['day', 'dusk', 'night'];

// ───────────────────────────── Utilitários de cor ─────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mistura `a` com `b` na proporção `t` (0 = só a, 1 = só b). */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** Clareia (f > 1) ou escurece (f < 1). */
export function shade(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * f, g * f, b * f);
}

/** Luminância relativa (0..1, sRGB aproximado) — para os testes de contraste. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Luminância relativa LINEAR (a do WCAG): o que a razão de contraste dos testes mede. */
function linearLuminance(hex: string): number {
  const f = (c: number): number => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Clareia a cor, sem mudar o matiz, até a luminância linear chegar a `min` (não mexe se já passa). Um piso, não um brilho fixo. */
function liftTo(hex: string, min: number): string {
  const l = linearLuminance(hex);
  if (l >= min) return hex;
  let k = Math.pow(min / Math.max(l, 1e-4), 1 / 2.2);
  let out = shade(hex, k);
  while (linearLuminance(out) < min && k < 4) { k *= 1.04; out = shade(hex, k); }
  return out;
}

/** RGB 0..255 → [matiz°, saturação, valor] (HSV) e de volta: só para derivar os tons do chão. */
function toHsv(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b); const d = mx - Math.min(r, g, b);
  let h = 0;
  if (d > 0) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx === 0 ? 0 : d / mx, mx];
}
function fromHsv(h: number, s: number, v: number): string {
  const hh = (((h % 360) + 360) % 360) / 60; const c = v * s; const x = c * (1 - Math.abs((hh % 2) - 1)); const m = v - c;
  const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
/** A cor com o matiz deslocado `hueDeg` graus, a saturação × `satMul` e o valor × `valMul` (HSV). */
function retone(hex: string, hueDeg: number, satMul: number, valMul: number): string {
  const [h, s, v] = toHsv(hex);
  return fromHsv(h + hueDeg, Math.min(1, s * satMul), Math.min(1, v * valMul));
}

/**
 * V22/F7, o chão com hierarquia de cor (V22 §3.8): o diagnóstico mediu grama a 0,90–0,93 de saturação na tela, no mesmo teto do céu (0,99) — nada guardava o máximo para o carro e a interface.
 * `trim` desce a saturação do chão (o que passa a ~0,70–0,80 na tela depois da gradação); o tom CLARO sai do médio com o matiz para o amarelo (limão) e mais luz, o ESCURO para o azul-
 * esmeralda e menos luz: "a grama que vai do amarelo ao azul-verde". `dir` inverte o sentido do matiz onde o chão já é amarelo-laranja (o deserto: a luz esquenta para o amarelo e a sombra
 * vai ao vermelho-marrom). Valores a olho, calibrados nas capturas e no `nevoa-f7-gl.test.ts`.
 */
const GROUND_TRIO: Record<SceneryId, { trim: number; dir: 1 | -1; warm: number; cool: number }> = {
  tropical: { trim: 0.8, dir: 1, warm: 20, cool: 18 },
  alpine: { trim: 0.9, dir: 1, warm: 28, cool: 26 },
  coast: { trim: 0.9, dir: 1, warm: 16, cool: 14 },
  savanna: { trim: 0.92, dir: 1, warm: 12, cool: 14 },
  city_night: { trim: 0.92, dir: 1, warm: 14, cool: 14 },
  desert: { trim: 1, dir: -1, warm: 10, cool: 12 },
};

// ───────────────────────────── Bases diurnas ─────────────────────────────

interface Base {
  sky: [string, string, string];
  asphalt: string;
  shoulder: string;
  verge: string;
  groundLow: string;
  groundHigh: string;
  rock: string;
  sand: string;
  layers: [string, string, string];
  waterDeep: string;
  waterShallow: string;
}

const BASES: Record<SceneryId, Base> = {
  // Mata atlântica: verde fundo, terra vermelha na beira, serra azulada ao longe.
  tropical: {
    sky: ['#1a5cb8', '#3a9ede', '#c8f0dc'], asphalt: '#4b5059', shoulder: '#8a7460', verge: '#c8784a',
    groundLow: '#34a844', groundHigh: '#238c4c', rock: '#7c6a52', sand: '#e8d49a',
    layers: ['#23814f', '#3c8f82', '#76a9c2'], waterDeep: '#1a6aa8', waterShallow: '#2fd0c4',
  },
  // Deserto: areia dourada, rocha vermelha nas encostas, mesas no horizonte.
  desert: {
    sky: ['#1c5cc2', '#58a2e8', '#ffc98a'], asphalt: '#59565a', shoulder: '#a08a6c', verge: '#eec486',
    groundLow: '#e9b464', groundHigh: '#d9964f', rock: '#bb5a36', sand: '#f0c77e',
    layers: ['#c56a3a', '#d08c62', '#dcae96'], waterDeep: '#1a6aa0', waterShallow: '#3ec0c0',
  },
  // Cidade: calçada clara, grama de praça, prédios no fundo (a skyline vem do terrain.ts).
  city_night: {
    sky: ['#3a6ec4', '#86b2e6', '#d5e2f2'], asphalt: '#484b54', shoulder: '#7a7a7c', verge: '#bdbbb4',
    groundLow: '#4e8f40', groundHigh: '#46853f', rock: '#6c6c74', sand: '#c8c0a8',
    layers: ['#3e4c70', '#5a6892', '#8a94ba'], waterDeep: '#123a6a', waterShallow: '#2a7a9a',
  },
  // Montanha: prado verde, pedra azulada, neve no alto e nos picos do horizonte.
  alpine: {
    sky: ['#2352c0', '#6498e2', '#d2e6ff'], asphalt: '#4d515a', shoulder: '#827c72', verge: '#a0968a',
    groundLow: '#4aab4c', groundHigh: '#378d5a', rock: '#868b98', sand: '#c8c0a8',
    layers: ['#2c6a4c', '#4a6aa0', '#7a8ccc'], waterDeep: '#1a5a8a', waterShallow: '#3aa0b0',
  },
  // Litoral: mar turquesa, praia clara, morros verdes e ilhas ao longe.
  coast: {
    sky: ['#2070d2', '#43b0f5', '#a6e6ff'], asphalt: '#50545c', shoulder: '#b0a080', verge: '#ecd49c',
    groundLow: '#4aa848', groundHigh: '#359552', rock: '#9a8a72', sand: '#f3dca0',
    layers: ['#2a8a5a', '#3a8ab0', '#6aa8dc'], waterDeep: '#1a68b0', waterShallow: '#22d4cf',
  },
  // Savana/planície: capim dourado-esverdeado, terra avermelhada, chapadas baixas.
  savanna: {
    sky: ['#3280d6', '#8cc8ee', '#f2ecb0'], asphalt: '#55524e', shoulder: '#957a58', verge: '#c89456',
    groundLow: '#b5b547', groundHigh: '#86993b', rock: '#a07650', sand: '#e0c88a',
    layers: ['#768a3c', '#9a8c62', '#bcae94'], waterDeep: '#1e6a86', waterShallow: '#40b8a8',
  },
};

/**
 * V11 (docs/ondas/V11-estrada.md): a cor que a pista pinta, por bioma e período (era o `asphalt` cinza escuro de todos: o HC2 pinta terra laranja, pedra rosada, asfalto
 * roxo à noite). `roadBase` é o albedo; `alt` é a segunda tinta das manchas largas e dos veios; `earth` liga o desgaste de terra (rachaduras) na textura. O albedo
 * vai à luz do período, então fica abaixo do que se vê (a cor-brilho: nada de azul-marinho, a faixa branca lê ≥ 3:1, o carro branco lê branco).
 */
const ROAD_TONE: Record<SceneryId, { day: string; dusk: string; night: string; alt: string; earth: number }> = {
  tropical: { day: '#82483c', dusk: '#b0644e', night: '#905a58', alt: '#f08038', earth: 0.9 }, // terra avermelhada da mata
  desert: { day: '#885a40', dusk: '#b8806c', night: '#986a70', alt: '#ffa860', earth: 1 }, // terra alaranjada
  city_night: { day: '#625e74', dusk: '#8a7a9c', night: '#b4729c', alt: '#c8c0f0', earth: 0 }, // asfalto que vira roxo (V12: mauve, não lilás-azulado); V22/F7: à noite rosa-mauve (321°), longe do violeta do chão (295°) e do índigo do prédio (237°), mesma luma
  alpine: { day: '#7c6672', dusk: '#947690', night: '#9a6488', alt: '#f0d8e0', earth: 0.3 }, // pedra rosada; V22/F7: à noite rosa-mauve (320°; era violeta 260°, colado no chão de 267°), mesma luma
  coast: { day: '#6c6a68', dusk: '#a08078', night: '#8c7482', alt: '#e8e0d0', earth: 0.1 }, // asfalto cinza quente; V22/F7: à noite cinza-rosado (325°; era 285°, colado no chão de 268°), mesma luma
  savanna: { day: '#80684a', dusk: '#b08064', night: '#946a58', alt: '#ffc868', earth: 0.85 }, // terra ocre
};

/** V11: a zebra com a cor do bioma (escuro/claro): o claro nunca é só branco, o escuro nunca é só vermelho. Mantém ≥ 0,35 de luma entre os blocos. */
const KERB_TONE: Record<SceneryId, { dark: string; light: string }> = {
  tropical: { dark: '#f0701a', light: '#fff6e4' }, // laranja de mata, creme
  desert: { dark: '#c2391c', light: '#f8e8c8' }, // terracota e creme
  city_night: { dark: '#e8386e', light: '#f6f4fa' }, // rosa-neon
  alpine: { dark: '#d8343c', light: '#f4f8ff' }, // vermelho de esqui, gelo
  coast: { dark: '#1a6cd0', light: '#f8fcff' }, // azul náutico
  savanna: { dark: '#2f8a3a', light: '#f8ecc8' }, // verde de capim e palha
};

/** Céus do entardecer por bioma (topo, meio, horizonte) e o brilho em volta do sol. */
const DUSK_SKY: Record<SceneryId, { sky: [string, string, string]; glow: string }> = {
  tropical: { sky: ['#173f6a', '#e0587a', '#ffb870'], glow: '#ffd27a' },
  desert: { sky: ['#2b1e5e', '#d1526a', '#ffa64e'], glow: '#ffc460' },
  city_night: { sky: ['#2a2470', '#b5509a', '#ffa07c'], glow: '#ffc88a' },
  alpine: { sky: ['#333c90', '#d479aa', '#ffd0aa'], glow: '#ffe0b0' },
  coast: { sky: ['#2a2a80', '#dc5aa0', '#ffb8a4'], glow: '#ffd07a' },
  savanna: { sky: ['#3a2a70', '#e8803a', '#ffd860'], glow: '#ffdc7a' },
};

/**
 * Céus da noite, um por bioma (M2): a cidade tem o horizonte roxo-alaranjado da poluição luminosa; a costa, luar azul sobre o mar;
 * o deserto, o índigo limpo das estrelas; a mata, o verde-petróleo úmido; a montanha, o azul frio da neve sob a lua; a savana,
 * o índigo empoeirado com o horizonte rosado.
 */
const NIGHT_SKY: Record<SceneryId, [string, string, string]> = {
  city_night: ['#05071c', '#161c4c', '#5c3a74'],
  coast: ['#03071a', '#0b1c50', '#26508e'],
  desert: ['#04051a', '#10164a', '#3c3a90'],
  tropical: ['#03101c', '#0a2c3e', '#1f5a64'],
  alpine: ['#050a24', '#101c5c', '#3a5aa8'],
  savanna: ['#0a0720', '#2a1a4a', '#6a4a64'],
};
function nightSky(b: SceneryId): [string, string, string] { return NIGHT_SKY[b]; }

/**
 * V12 (noite roxa, docs/ondas/V12-noite-e-camera.md): o roxo/magenta cheio que o Horizon Chase 2 pinta no céu e na névoa da noite (`scratch/ref/hc2-7.webp`: céu 281°, horizonte 287°),
 * um por bioma para os céus seguirem distintos (a cidade vai ao magenta da poluição luminosa, a costa e a montanha ficam no violeta-azulado do luar, a savana no ameixa). Só o que
 * SE VÊ: a luz que cai no carro segue com o céu azul (`NIGHT_SKY`, que vira `skyLight`).
 */
const NIGHT_SKY_PURPLE: Record<SceneryId, [string, string, string]> = {
  city_night: ['#1c0a4e', '#46168e', '#a43ca8'],
  coast: ['#2a1458', '#4a26a8', '#8c4cc0'],
  desert: ['#1c083e', '#3a1274', '#8230a8'],
  tropical: ['#200c48', '#40208a', '#6234a8'],
  alpine: ['#2a1250', '#5030a8', '#6a4cc0'],
  savanna: ['#200a38', '#481a62', '#984470'],
};

/**
 * O tom de roxo que o chão da noite puxa, por bioma, e quanto (V12). A cor ganha o matiz do tom MANTENDO a luminância dela (a M2 mede o contraste estrada × chão por
 * luminância: roxo não pode clarear nem escurecer o que já foi calibrado). A cidade e o deserto vão mais fundo; a mata e a costa guardam um resto do verde.
 */
const NIGHT_GROUND_PURPLE: Record<SceneryId, { tone: string; amount: number }> = {
  city_night: { tone: '#9a3c9e', amount: 0.78 },
  coast: { tone: '#8c4cb4', amount: 0.72 },
  desert: { tone: '#9a3c8c', amount: 0.7 },
  tropical: { tone: '#8a3aa4', amount: 0.72 },
  alpine: { tone: '#8c4cb8', amount: 0.72 },
  savanna: { tone: '#9c3c9c', amount: 0.74 },
};

/** Puxa `c` para o matiz de `tone` na proporção `amount`, mantendo a luminância de `c`. */
function roxear(c: string, tone: string, amount: number): string {
  const mixed = mix(c, tone, amount);
  const f = luminance(c) / Math.max(1e-3, luminance(mixed));
  return shade(mixed, f);
}

/** A 2ª tinta da pista à noite (V12): mauve na cidade (o lilás-azulado de antes lia azul), a de sempre nos outros biomas. */
const NIGHT_ROAD_ALT: Partial<Record<SceneryId, string>> = { city_night: '#f0bcd8', alpine: '#f0c8ec' }; // V22/F7: a cidade acompanha o rosa-mauve da pista

// ───────────────────────────── Gradação por hora ─────────────────────────────

interface Grade { tint: string; amount: number; bright: number }

const GRADE: Record<TimeOfDay, Grade> = {
  day: { tint: '#000000', amount: 0, bright: 1 },
  // Entardecer: o sol laranja já esquenta o que ilumina; o albedo só puxa um pouco para o vinho.
  dusk: { tint: '#6a2f58', amount: 0.14, bright: 0.96 },
  // Noite: azula sem apagar — quem escurece a cena é a luz, não a cor (senão vira borrão preto).
  night: { tint: '#16204a', amount: 0.34, bright: 0.94 },
};

/** O tom para onde o asfalto vai no entardecer e na noite (cor-brilho): cinza levemente quente. */
const ASPHALT_LATE = '#5a544e';

function grade(c: string, time: TimeOfDay): string {
  const g = GRADE[time];
  return shade(mix(c, g.tint, g.amount), g.bright);
}

/**
 * O brilho do sol/lua na água por período (M2; antes eram 3 números fixos no shader do mar): no entardecer o caminho é mais forte e muito
 * mais comprido (expoente baixo: o sol rasante abre o reflexo); de dia é um ponto firme; o luar é largo e mais fraco.
 */
const SEA: Record<TimeOfDay, { glint: number; sky: number; spec: number }> = {
  day: { glint: 1, sky: 0.5, spec: 180 },
  dusk: { glint: 1.5, sky: 0.55, spec: 60 },
  night: { glint: 0.9, sky: 0.4, spec: 60 },
};

/**
 * Onde o sol/lua está, por período; no entardecer, por bioma. O anel de montanhas gira com o céu, então o azimute do sol sobre ele é constante
 * por bioma: o par (azimute, elevação) do entardecer foi escolhido onde o anel é baixo (tests/paleta-m2.test.ts exige o sol ≥ 2° acima dele).
 * Até a M2 era 22°/9° para todos, e a mata (−1,2°) e a montanha (−3,5°) engoliam o sol.
 */
const SUN: Record<TimeOfDay, (b: SceneryId) => { az: number; el: number }> = {
  day: () => ({ az: -42, el: 34 }), // sombras longas que desenham o relevo
  dusk: (b) => ({ tropical: { az: 34, el: 10.5 }, desert: { az: 34, el: 9 }, city_night: { az: 30, el: 9 }, alpine: { az: 2, el: 10.5 }, coast: { az: 30, el: 9 }, savanna: { az: 32, el: 9 } })[b],
  night: () => ({ az: -28, el: 20 }), // a lua aparece na tela nas retas que apontam para ela
};

/** Reflexo de lente do entardecer por bioma: força e a cor do reflexo (poeira do deserto abre mais; a neblina da cidade, menos). */
const FLARE: Record<SceneryId, { strength: number; color: string }> = {
  tropical: { strength: 0.8, color: '#ffc870' },
  desert: { strength: 0.95, color: '#ff9a5a' },
  city_night: { strength: 0.75, color: '#ff8fb0' },
  alpine: { strength: 0.8, color: '#ffd0b8' },
  coast: { strength: 0.9, color: '#ffb070' },
  savanna: { strength: 0.9, color: '#ffbe50' },
};

/** Aplica a hora do dia a uma base diurna. */
function build(scenery: SceneryId, time: TimeOfDay): Palette {
  const b = BASES[scenery];
  const g = (c: string) => grade(c, time);
  let sky: [string, string, string];
  let skyLight: [string, string, string];
  let glow: string;
  let light: number;
  let sun: string | null = null;
  let moon: string | null = null;
  let sunLight: string; let sunIntensity: number;
  let hemiSky: string; let hemiIntensity: number;
  let envIntensity: number; let exposure: number; let fogDensity: number;
  let bloom: [number, number, number];
  let cloudLit: string | null; let cloudShade: string;
  if (time === 'day') {
    sky = b.sky; skyLight = sky; glow = '#fff6d0'; light = 1; sun = '#fff1b0';
    sunLight = '#fff0d6'; sunIntensity = 3.3;
    // O céu azul saturado é a luz das sombras: é ele que as deixa azuladas em vez de pretas.
    hemiSky = mix(b.sky[1], '#b4c8f4', 0.6); hemiIntensity = 1.3;
    envIntensity = 0.45; exposure = 0.98; fogDensity = 1;
    bloom = [0.34, 0.5, 2.2]; // V10 (HC2): halo no disco do sol (era 0,2 · 0,35 · 2,6)
    cloudLit = '#ffffff'; cloudShade = mix(b.sky[1], '#c8d8f0', 0.55);
  } else if (time === 'dusk') {
    sky = DUSK_SKY[scenery].sky; skyLight = sky; glow = DUSK_SKY[scenery].glow; light = 0.7; sun = '#ffc46a';
    // Cor-brilho: a luz que cai nos objetos é quase neutra — o sol quente, a sombra fria —, e a cor forte fica no céu, na névoa e no reflexo. Era sol
    // #ffab62 e sombra #8a6ad2 (roxo saturado): o carro branco saía rosa e o asfalto roxo (tests/cor-brilho.test.ts).
    sunLight = '#ffe8d0'; sunIntensity = 3.0;
    hemiSky = '#b0b4c4'; hemiIntensity = 1.45;
    envIntensity = 0.35; exposure = 1.0; fogDensity = 0.9;
    bloom = [0.3, 0.4, 1.6];
    cloudLit = mix(glow, '#ffa07a', 0.3); cloudShade = mix(sky[1], sky[0], 0.3);
  } else {
    skyLight = nightSky(scenery); sky = NIGHT_SKY_PURPLE[scenery]; glow = scenery === 'city_night' ? '#ff9a6a' : '#b8c8ff'; light = 0.32; moon = '#f6f2dc';
    // Cor-brilho: luar e céu da noite frios mas quase neutros (eram #9db6ff e #4a66b8/#5a5aa8, azul e roxo saturados); a cidade, um pouco mais quente.
    sunLight = '#dcdee6'; sunIntensity = 0.95;
    hemiSky = scenery === 'city_night' ? '#aaa6aa' : '#a4a6ae'; hemiIntensity = 1.35;
    envIntensity = 0.8; exposure = 1.12; fogDensity = 1.3;
    // Limiar entre as fachadas acesas do cenário (1,25: não brilham) e as luminárias (2,0: brilham) — com 1,0 a
    // cidade inteira virava um clarão (tests/render-ground.test.ts).
    bloom = [0.5, 0.45, 1.6];
    cloudLit = null; cloudShade = sky[1];
  }
  // Névoa: o horizonte com um pouco do meio do céu — tem cor, nunca cinza.
  const fogK = time === 'day' ? 0.28 : time === 'dusk' ? 0.32 : 0.2;
  const fog = mix(sky[2], sky[1], fogK);
  const fogLight = mix(skyLight[2], skyLight[1], fogK); // a névoa que a luz do carro vê: a de antes do roxo (V12)
  // À noite o chão alto sobe um pouco (a mata e a montanha escuras engoliam a pista) e o asfalto leva menos azul que o resto: o carro
  // escuro continua se lendo contra ele (tests/paleta-m2.test.ts: contraste estrada × chão e carro × asfalto).
  const gt = GROUND_TRIO[scenery];
  const trimmed = (c: string): string => retone(c, 0, gt.trim, 1); // V22/F7: a saturação do chão desce; o céu, o carro e a HUD ficam no teto
  const groundLowLight = time === 'night' ? liftTo(g(trimmed(b.groundLow)), 0.125) : g(trimmed(b.groundLow));
  const groundHighLight = time === 'night' ? liftTo(g(trimmed(b.groundHigh)), 0.12) : g(trimmed(b.groundHigh));
  // O claro quente (do médio, mais luz e matiz para o amarelo) e o escuro frio (do alto, menos luz e matiz para o azul-esmeralda). O matiz dos dois vai ao roxo à noite, como o resto do chão.
  const groundWarmLight = retone(groundLowLight, -gt.dir * gt.warm, 0.96, 1.14);
  const groundCoolLight = retone(groundHighLight, gt.dir * gt.cool, 1.0, 0.8);
  // V12: à noite o chão e o que é de chão (beira, rocha, areia, planos do horizonte, neve) são pintados de roxo/magenta, com a luminância de antes. O que cai de luz no carro
  // (`hemiGround`, abaixo) segue saindo do chão de antes: o roxo é albedo do mundo, não luz no carro.
  const gp = NIGHT_GROUND_PURPLE[scenery];
  const purple = (c: string): string => (time === 'night' ? roxear(c, gp.tone, gp.amount) : c);
  const groundLow = purple(groundLowLight);
  const groundHigh = purple(groundHighLight);
  const groundWarm = purple(groundWarmLight);
  const groundCool = purple(groundCoolLight);
  // Cor-brilho: no entardecer e à noite o asfalto é neutro-quente (era o vinho e o marinho da gradação de hora: com a luz roxa, saía roxo).
  const asphalt = time === 'day' ? b.asphalt : shade(mix(b.asphalt, ASPHALT_LATE, time === 'night' ? 0.8 : 0.6), time === 'night' ? 0.72 : 0.92);
  // Os planos do horizonte puxam para o céu do período (o rosa do entardecer, o azul da noite).
  const skyPull = time === 'day' ? 0 : time === 'dusk' ? 0.28 : 0.5;
  const layers = b.layers.map((c, i) => mix(purple(g(c)), mix(sky[1], sky[2], 0.5), skyPull * (0.6 + 0.2 * i))) as [string, string, string];
  const layerHaze: [number, number, number] = time === 'night' ? [0.14, 0.3, 0.48] : [0.14, 0.32, 0.52];
  const pitLine = time === 'night' ? '#ffe45a' : '#ffd83a';
  const rt = ROAD_TONE[scenery];
  const roadBase = rt[time];
  // A segunda tinta muda o matiz (esquenta/esfria) e clareia pouco (+12% de luma): a média da textura segue a `roadBase` que a cor-brilho calibrou.
  const altTint = mix(roadBase, (time === 'night' ? NIGHT_ROAD_ALT[scenery] : undefined) ?? rt.alt, time === 'day' ? 0.42 : time === 'dusk' ? 0.36 : 0.25);
  const roadAlt = shade(altTint, (luminance(roadBase) * 1.12) / Math.max(1e-3, luminance(altTint)));
  const kt = KERB_TONE[scenery];
  const lane = time === 'night' ? '#f2f0dc' : '#f4f4f0';
  return {
    sky, skyLight, sun, moon, stars: time === 'night',
    grassLight: groundLow, grassDark: groundHigh,
    rumbleLight: time === 'night' ? mix(kt.light, '#e8e8f0', 0.5) : kt.light, rumbleDark: time === 'night' ? shade(kt.dark, 0.92) : kt.dark,
    roadLight: shade(asphalt, 1.06), roadDark: shade(asphalt, 0.9),
    lane, fog, fogLight,
    far: layers[2], near: layers[0],
    pit: shade(asphalt, 1.22), pitLine,
    light,
    skyGlow: glow, sunLight, sunIntensity, hemiSky, hemiGround: shade(mix(groundLowLight, asphalt, 0.3), 0.55), hemiIntensity,
    envIntensity, exposure, fogDensity, bloom, cloudLit, cloudShade,
    asphalt, roadBase, roadAlt, roadEarth: rt.earth, shoulder: purple(g(b.shoulder)), verge: purple(g(b.verge)), groundLow, groundHigh, groundWarm, groundCool, rock: purple(g(b.rock)),
    snow: time === 'day' ? '#f4f8ff' : time === 'dusk' ? '#ffe0e4' : '#c2b4ea',
    sand: purple(g(b.sand)),
    layers, layerHaze,
    waterDeep: time === 'day' ? b.waterDeep : time === 'dusk' ? mix(b.waterDeep, '#3a2a7a', 0.45) : mix(b.waterDeep, '#040c30', 0.7),
    waterShallow: time === 'day' ? b.waterShallow : time === 'dusk' ? mix(b.waterShallow, '#e0708a', 0.3) : mix(b.waterShallow, '#0c2a5a', 0.65),
    foam: time === 'night' ? '#9aaee0' : time === 'dusk' ? '#ffe6d8' : '#ffffff',
    lampPool: time === 'night' ? (scenery === 'city_night' ? '#ffc890' : '#ffd8a0') : null,
    markingGlow: time === 'night' ? 0.22 : time === 'dusk' ? 0.05 : 0,
    sunAz: SUN[time](scenery).az, sunEl: SUN[time](scenery).el,
    seaGlint: SEA[time].glint, seaSky: SEA[time].sky, seaSpec: SEA[time].spec,
    flare: time === 'dusk' ? FLARE[scenery].strength : 0, flareColor: FLARE[scenery].color,
  };
}

export type PaletteKey = `${SceneryId}:${TimeOfDay}`;

/** A chave da combinação (a do `PALETTE_TABLE`). */
export function paletteKey(scenery: SceneryId, time: TimeOfDay): PaletteKey { return `${scenery}:${time}`; }

/** As 18 chaves, na ordem bioma × período. */
export const PALETTE_KEYS: readonly PaletteKey[] = SCENERIES.flatMap((sc) => TIMES_OF_DAY.map((t) => paletteKey(sc, t)));

function deepFreeze<T extends object>(o: T): Readonly<T> {
  for (const v of Object.values(o)) if (v !== null && typeof v === 'object') deepFreeze(v as object);
  return Object.freeze(o);
}

/**
 * As 18 combinações bioma × período como DADO (M2): congelada, montada na carga, com as mesmas chaves em todas as entradas — a M6 interpola
 * campo a campo entre dois períodos do mesmo bioma. `null` só em `sun`, `moon`, `cloudLit` e `lampPool` (a cena não tem a coisa).
 */
export const PALETTE_TABLE: Readonly<Record<PaletteKey, Readonly<Palette>>> = Object.freeze(
  Object.fromEntries(SCENERIES.flatMap((sc) => TIMES_OF_DAY.map((t) => [paletteKey(sc, t), deepFreeze(build(sc, t))] as const))),
) as Record<PaletteKey, Readonly<Palette>>;

/** Paleta da combinação (a entrada da `PALETTE_TABLE`: é a mesma para a corrida inteira). */
export function palette(scenery: SceneryId, time: TimeOfDay): Palette {
  return PALETTE_TABLE[paletteKey(scenery, time)] as Palette;
}

// ───────────────────────────── A corrida que muda (M6, b) ─────────────────────────────
// docs/ondas/M/M6.md. O período anda durante a corrida: dia → entardecer na última volta, entardecer → noite nas duas últimas, interpolando campo a campo as
// combinações da `PALETTE_TABLE`. Só visual: a física não lê nada daqui. Tudo puro (sem Three, sem DOM) para os testes e para o renderizador entregar uniformes.

/** Quando e entre quais períodos o céu anda: fração da corrida (0..1) em que a transição começa e termina. */
export interface PeriodPlan { from: TimeOfDay; to: TimeOfDay; start: number; end: number }

/**
 * Plano da pista: dia → entardecer na ÚLTIMA volta; entardecer → noite nas DUAS últimas (os dois números são provisórios, do dono); a noite não anda (null).
 * Termina na bandeirada (fração 1): o fim da corrida é o outro período por inteiro.
 */
export function racePeriodPlan(time: TimeOfDay, laps: number): PeriodPlan | null {
  const l = Math.max(1, Math.floor(laps));
  if (time === 'day') return { from: 'day', to: 'dusk', start: Math.max(0, (l - 1) / l), end: 1 };
  if (time === 'dusk') return { from: 'dusk', to: 'night', start: Math.max(0, (l - 2) / l), end: 1 };
  return null;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number): number => { const t = clamp01(x); return t * t * (3 - 2 * t); };

/** O `t` (0..1) da transição na fração `fraction` da corrida: `smoothstep` do plano, monótona e contínua (sem ponta dura nas duas pontas). */
export function racePeriodBlend(plan: PeriodPlan | null, fraction: number): number {
  if (!plan || plan.end <= plan.start) return 0;
  return smooth((fraction - plan.start) / (plan.end - plan.start));
}

/** Uma queda maior que isto (fração da corrida) é corrida nova: o relógio zera. */
const NEW_RACE_DROP = 0.1;

/** O relógio do período nunca anda para trás (líder trocado de viewport, respawn): máximo corrente, que recomeça numa corrida nova. */
export function advanceRaceProgress(prev: number, now: number): number {
  return now < prev - NEW_RACE_DROP ? now : Math.max(prev, now);
}

/** Fração da corrida (0..1) do líder entre os carros que a tela mostra: `progress` de cada carro (volta × comprimento + z, núcleo) sobre voltas × comprimento. */
export function raceFraction(progresses: readonly number[], laps: number, length: number): number {
  const total = laps * length;
  if (progresses.length === 0 || total <= 0) return 0;
  let best = -Infinity;
  for (const p of progresses) if (p > best) best = p;
  return clamp01(best / total);
}

function blendValue(a: unknown, b: unknown, t: number): unknown {
  if (a === null || b === null || a === undefined || b === undefined) return a ?? b ?? null; // um só nulo: o valor do outro lado (nada pisca em 0,5)
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  if (typeof a === 'boolean') return t >= 0.5 ? b : a;
  if (typeof a === 'string' && typeof b === 'string') return a === b ? a : mix(a, b, t);
  if (Array.isArray(a) && Array.isArray(b)) return a.map((v, i) => blendValue(v, b[i], t));
  return a;
}

/**
 * A paleta entre duas combinações do mesmo bioma, campo a campo: cor por canal (`mix`), número, tupla; booleano vira em t = 0,5; nulo nos dois = nulo e um só nulo =
 * o valor do outro lado (o sol/lua, as nuvens e a poça de luz têm a cor do corpo celeste em `livePalette`, que mistura as duas pontas). `t ≤ 0` devolve `a` e
 * `t ≥ 1` devolve `b` (as próprias entradas da tabela, a mesma referência).
 */
export function blendPalette(a: Palette, b: Palette, t: number): Palette {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(a) as Array<keyof Palette>) out[key] = blendValue(a[key], b[key], t);
  return out as unknown as Palette;
}

/** A cor do corpo celeste (sol de dia e entardecer, lua à noite). */
export function bodyColor(p: Pick<Palette, 'sun' | 'moon'>): string { return p.sun ?? p.moon ?? '#ffffff'; }

/** A paleta no instante da corrida: as duas pontas (cada uma uma entrada da tabela), o `t` e a interpolada. */
export interface LivePalette {
  a: Palette; b: Palette; t: number;
  /** `blendPalette(a, b, t)`: a própria `a` com t = 0 e a própria `b` com t = 1. */
  p: Palette;
  /** Cor do disco (sol → lua) interpolada entre as duas pontas: o sol do entardecer não pode virar a lua num salto ao chegar a `t = 1`. */
  body: string;
}

/**
 * A paleta ao vivo de uma pista (bioma + período + voltas) na fração `fraction` da corrida. Pista de noite não anda (`a === b`, t = 0).
 */
export function livePalette(scenery: SceneryId, time: TimeOfDay, laps: number, fraction: number): LivePalette {
  const a = palette(scenery, time);
  const plan = racePeriodPlan(time, laps);
  if (!plan) return { a, b: a, t: 0, p: a, body: bodyColor(a) };
  const b = palette(scenery, plan.to);
  const t = racePeriodBlend(plan, fraction);
  const body = t <= 0 ? bodyColor(a) : t >= 1 ? bodyColor(b) : mix(bodyColor(a), bodyColor(b), t);
  return { a, b, t, p: blendPalette(a, b, t), body };
}

/**
 * Quanto das luzes feitas pelo homem (janelas, postes, faróis) está aceso, de `light` (1 dia · 0,7 entardecer · 0,32 noite): 0 de dia, 0,6 no entardecer (o que o
 * cenário já faz hoje) e 1 à noite, contínua e monótona. Acende a partir de 0,9 (o céu começando a cair) e termina a 0,32.
 */
export function lightsAmount(light: number): number {
  if (light >= 0.7) return 0.6 * smooth((0.9 - light) / 0.2);
  return 0.6 + 0.4 * smooth((0.7 - light) / 0.38);
}

/** A opacidade das estrelas de `light`: nenhuma até o entardecer, todas à noite. */
export function starAlpha(light: number): number { return smooth((0.62 - light) / 0.3); }

/** O que o cenário de beira de pista mostra de cada hora (runtime.ts, `setTrack` e `applyNight`): filtro de cor, janelas e letreiros acesos, brilho, cones do poste, mancha de sombra. */
export interface SceneryLook {
  /** Cor que multiplica o cenário (o mesmo filtro de hora da paleta). */
  tint: string;
  /** Fração das janelas acesas (0 · 0,6 · 1), brilho dos letreiros e dos faróis/luminárias (cor escalar do material `glow`). */
  lit: number; panel: number; glow: number;
  /** Facho dos postes (0..1: só na noite fechada) e a mancha de sombra no chão (cor e opacidade). */
  cones: number; blob: string; blobOpacity: number;
}

/**
 * `SceneryLook` pela luz do período (1 dia · 0,7 entardecer · 0,32 noite): nas três luzes são exatamente os valores fixos do cenário (a M6 só os interpola, em passos contínuos).
 * As janelas seguem `lightsAmount`; o resto anda linear entre as duas estações vizinhas.
 */
export function sceneryLook(light: number): SceneryLook {
  const day = light >= 0.7;
  const w = day ? clamp01((light - 0.7) / 0.3) : clamp01((0.7 - light) / 0.38); // quanto falta para a estação de cima (dia) ou quanto já é a de baixo (noite)
  const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
  // `k`: 0 na estação do entardecer, 1 na outra ponta (dia acima de 0,7, noite abaixo).
  const pick = (dayV: number, duskV: number, nightV: number): number => (day ? lerp(duskV, dayV, w) : lerp(duskV, nightV, w));
  // V12: à noite o filtro do cenário (e a mancha de sombra no chão) é roxo, não azul-marinho: as árvores, os prédios e a skyline pegam o roxo do HC2.
  const tint = day ? mix(mix('#ffffff', '#5a2e4a', 0.22), '#ffffff', w) : mix(mix('#ffffff', '#5a2e4a', 0.22), mix('#ffffff', '#3a0a60', 0.5), w);
  const blob = day ? mix('#2c1a48', '#1c2a5a', w) : mix('#2c1a48', '#12051e', w);
  return {
    tint, lit: lightsAmount(light), panel: pick(0.3, 0.6, 0.6), glow: pick(0.95, 1.4, 2.0),
    cones: day ? 0 : w, blob, blobOpacity: pick(0.32, 0.32, 0.4),
  };
}
