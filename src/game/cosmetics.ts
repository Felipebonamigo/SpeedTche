// O visual do carro (onda N, N3; docs/ondas/N/N3.md): o catálogo (pintura, acabamento, roda, aro, faixa, chama, cor livre) e os
// saneadores do `CarLook`. Só aparência: o look viaja no `HumanEntry` e no online, mas NUNCA entra na `RaceConfig` nem no estado
// (`withoutLook`, paints.ts). Puro — sem DOM, sem Three, sem armazenamento: os testes e a rede usam direto.
//
// Duas políticas, um catálogo, ambas devolvendo a forma CANÔNICA (chave ausente = padrão; nada de "brilho" explícito):
// - `sanitizeLook` (BRANDO) lê o save e a copa salva: o campo que não existe sai, o resto fica; nunca recusa.
// - `parseLook` (ESTRITO) lê o que vem da rede: qualquer id fora do catálogo, chave desconhecida, roda de outro estilo ou cor mal
//   formada RECUSA (devolve null). Quem fala a mesma versão só manda ids que existem; o resto é adulteração.
// Os ids são do save e do online: renomear um apaga a escolha de quem o usava (vira o padrão).
import { CARS } from '../core/data/cars';
import type { CarBody, CarDef, CarLook } from '../core/types';
import type { CarColors } from './contracts';

export type { CarLook };

// ───────────────────────────── Pintura (a paleta: cor + detalhe já combinados) ─────────────────────────────

/** A cor de fábrica do carro (CarDef.color/accent): a primeira opção da paleta e o valor de quem não escolheu. */
export const ORIGINAL_PAINT = 'original';

/** Uma pintura da paleta: carroceria + detalhe (faixas, aerofólio, pinças, capacete), já combinados. */
export interface PaintDef {
  id: string;
  color: string;
  accent: string;
}

/**
 * A paleta, depois da Original, na ordem do arco-íris e terminando nos neutros. Cada opção é um par cor + detalhe
 * escolhido junto (a combinação feia não existe); nenhuma repete a de fábrica de um carro (tests/paint.test.ts).
 * Os ids são do save e do online: renomear um apaga a escolha de quem o usava (vira a Original).
 */
export const PAINTS: readonly PaintDef[] = Object.freeze([
  { id: 'rubi', color: '#d7263d', accent: '#f4f4f2' },
  { id: 'tangerina', color: '#ff7a1a', accent: '#f6f7f9' },
  { id: 'canarinho', color: '#ffc425', accent: '#0f7a45' },
  { id: 'limao', color: '#9bd61f', accent: '#24282f' },
  { id: 'esmeralda', color: '#0f9d58', accent: '#ffd23f' },
  { id: 'turquesa', color: '#18b8c4', accent: '#ff8a33' },
  { id: 'ceu', color: '#4fb3ff', accent: '#14254f' },
  { id: 'cobalto', color: '#2346d6', accent: '#ffcf26' },
  { id: 'marinho', color: '#1b2b5e', accent: '#e8434f' },
  { id: 'violeta', color: '#7a3ff0', accent: '#ffb02e' },
  { id: 'flamingo', color: '#ff4fa0', accent: '#2fd9e6' },
  { id: 'gelo', color: '#eef1f4', accent: '#d7263d' },
  { id: 'prata', color: '#98a2ae', accent: '#2346d6' },
  { id: 'grafite', color: '#3b4048', accent: '#c8ff2e' },
  { id: 'onix', color: '#17191e', accent: '#d9b25a' },
].map((p) => Object.freeze(p)));

/** Todas as opções, na ordem em que o seletor as percorre: a Original primeiro. */
export const PAINT_IDS: readonly string[] = Object.freeze([ORIGINAL_PAINT, ...PAINTS.map((p) => p.id)]);

export function isPaintId(v: unknown): v is string {
  return typeof v === 'string' && PAINT_IDS.includes(v);
}

/** Cores da pintura; null = a de fábrica (Original, ausente ou id que não existe mais). */
export function paintColors(id: string | null | undefined): CarColors | null {
  const p = PAINTS.find((x) => x.id === id);
  return p ? { color: p.color, accent: p.accent } : null;
}

/** A opção seguinte (ou a anterior) da paleta, em círculo; um id desconhecido conta como a Original. */
export function nextPaint(id: string, dir: -1 | 1): string {
  const i = Math.max(0, PAINT_IDS.indexOf(id));
  return PAINT_IDS[(i + dir + PAINT_IDS.length) % PAINT_IDS.length];
}

// ───────────────────────────── Acabamento, aro, faixa, chama ─────────────────────────────

/** Acabamentos; o índice é o que vai nos bits de instância do render (`flags >> 3`), então a ordem é parte do contrato. O brilho é o de hoje. */
export const FINISH_IDS: readonly string[] = Object.freeze(['brilho', 'metalico', 'perolado', 'fosco', 'cromado', 'camaleao']);
export const DEFAULT_FINISH = FINISH_IDS[0];

/** Cor dos 4 aros; `acento` não tem cor própria: é a cor do detalhe do carro. */
export const RIM_COLORS: Readonly<Record<string, string | null>> = Object.freeze({ prata: '#c9ced6', grafite: '#2b2f36', dourado: '#e0b13c', acento: null });
export const RIM_IDS: readonly string[] = Object.freeze(Object.keys(RIM_COLORS));

/** Faixa: nenhuma, só a A (capô e teto), só a B (vinco lateral) ou as duas. */
export const STRIPE_IDS: readonly string[] = Object.freeze(['nenhuma', 'a', 'b', 'ab']);

/** Cor da chama do nitro (a luminosa que o shader da chama tinge; `flameColorFor` da M4 é o padrão, sem escolha). */
export const FLAME_COLORS: Readonly<Record<string, string>> = Object.freeze({
  azul: '#2f8cff', ciano: '#22e0d0', verde: '#3de06b', ouro: '#ffc830', laranja: '#ff7a1a', vermelha: '#ff3b30', rosa: '#ff4fa0', roxa: '#9b5cff',
});
export const FLAME_IDS: readonly string[] = Object.freeze(Object.keys(FLAME_COLORS));

// ───────────────────────────── Rodas por estilo ─────────────────────────────

/** Os 9 desenhos de roda (src/render/cars/wheels.ts); a ordem é a de `WHEEL_DESIGNS`. */
export type WheelId = 'sport5' | 'mag' | 'multi' | 'hubcap' | 'aero' | 'dish' | 'center' | 'wire' | 'steel';
export const WHEEL_IDS: readonly WheelId[] = Object.freeze(['sport5', 'mag', 'multi', 'hubcap', 'aero', 'dish', 'center', 'wire', 'steel'] as const);

/**
 * Uma lista por estilo de carroceria: 6 desenhos, a roda de fábrica do estilo SEMPRE em primeiro (tests/cosmetics.test.ts a confere
 * contra o modelo). Escolha de forma, não de esquecimento: a picape não ganha o disco aerodinâmico, o clássico não ganha a trava
 * central de protótipo. Cada desenho aparece em pelo menos 3 estilos.
 */
export const WHEEL_LISTS: Readonly<Record<CarBody, readonly WheelId[]>> = Object.freeze({
  gt: ['sport5', 'mag', 'multi', 'aero', 'center', 'dish'],
  muscle: ['mag', 'sport5', 'steel', 'wire', 'multi', 'dish'],
  hatch: ['multi', 'sport5', 'hubcap', 'dish', 'aero', 'mag'],
  sedan: ['hubcap', 'multi', 'sport5', 'steel', 'wire', 'aero'],
  electric: ['aero', 'center', 'multi', 'sport5', 'hubcap', 'mag'],
  rally: ['dish', 'steel', 'multi', 'sport5', 'mag', 'hubcap'],
  hyper: ['center', 'aero', 'sport5', 'multi', 'mag', 'wire'],
  classic: ['wire', 'hubcap', 'mag', 'steel', 'sport5', 'dish'],
  wedge: ['aero', 'center', 'sport5', 'multi', 'mag', 'dish'],
  pickup: ['steel', 'dish', 'hubcap', 'mag', 'multi', 'wire'],
  prototype: ['center', 'aero', 'multi', 'sport5', 'mag', 'dish'],
  micro: ['hubcap', 'multi', 'dish', 'sport5', 'wire', 'steel'],
  roadster: ['mag', 'wire', 'sport5', 'multi', 'center', 'hubcap'],
});

const BODY_OF = new Map<string, CarBody>(CARS.map((c) => [c.id, c.body]));

/** A lista de rodas do carro, ou null se o carro não existe. */
export function wheelListOf(carId: string): readonly WheelId[] | null {
  const body = BODY_OF.get(carId);
  return body ? WHEEL_LISTS[body] : null;
}

// ───────────────────────────── Cor livre ─────────────────────────────

/** Saturação mínima (HSL) da cor livre: abaixo disso a cor é puxada para cá. Para o carro não sair da paleta (o objeto mais saturado do quadro). */
export const FREE_SAT_MIN = 0.55;
/** Para onde a saturação é puxada (com folga, para o arredondamento do hex não a deixar de novo abaixo do mínimo). */
const FREE_SAT_SNAP = 0.58;
/** Abaixo desta saturação a cor não tem matiz (cinza, branco, preto): não é cor livre, os neutros são da paleta. */
export const FREE_SAT_NEUTRAL = 0.1;
/** Faixa de luminosidade (HSL): nem breu nem papel. */
export const FREE_LIGHT_MIN = 0.22;
export const FREE_LIGHT_MAX = 0.78;
const FREE_LIGHT_MARGIN = 0.01;

const HEX6 = /^#[0-9a-fA-F]{6}$/;

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const l = (max + min) / 2; const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: ((h * 60) + 360) % 360, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round((v + m) * 255))).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/**
 * A cor livre saneada: `#rrggbb` (minúsculo) dentro da faixa — saturação ≥ 0,55 e luminosidade em [0,22; 0,78]; fora dela a cor é PUXADA
 * (o matiz fica). Cor sem matiz (saturação < 0,10) e qualquer coisa que não seja `#rrggbb` devolvem null. Idempotente: sanear o resultado
 * não muda nada, então toda máquina que recebe a mesma cor chega à mesma.
 */
export function snapFreeColor(v: unknown): string | null {
  if (typeof v !== 'string' || v.length !== 7 || !HEX6.test(v)) return null;
  const hex = v.toLowerCase();
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const { h, s, l } = rgbToHsl(r, g, b);
  if (s < FREE_SAT_NEUTRAL) return null;
  const inBand = s >= FREE_SAT_MIN && l >= FREE_LIGHT_MIN && l <= FREE_LIGHT_MAX;
  if (inBand) return hex;
  const l2 = Math.min(FREE_LIGHT_MAX - FREE_LIGHT_MARGIN, Math.max(FREE_LIGHT_MIN + FREE_LIGHT_MARGIN, l));
  return hslToHex(h, s < FREE_SAT_MIN ? FREE_SAT_SNAP : s, l2);
}

/** As 36 cores que o seletor oferece (12 matizes × 3 tons: vivo, claro, fundo), todas já dentro da faixa. Matiz-maior: o tom muda mais rápido. */
export const FREE_COLORS: readonly string[] = Object.freeze(
  Array.from({ length: 12 }, (_, k) => k * 30).flatMap((hue) => [[0.85, 0.5], [0.8, 0.68], [0.7, 0.32]].map(([s, l]) => hslToHex(hue, s, l))),
);

// ───────────────────────────── O look: campos, forma canônica ─────────────────────────────

/** Os campos do look, na ordem canônica (a das chaves do JSON). */
export const LOOK_FIELDS = ['paint', 'color', 'accent', 'finish', 'wheel', 'rim', 'stripe', 'flame'] as const;
export type LookField = (typeof LOOK_FIELDS)[number];

/** O catálogo como dado puro: vai na impressão do online (`fingerprintContent`), para dois builds de catálogo diferente nem dividirem sala. */
export const COSMETICS_CATALOG = Object.freeze({
  paints: PAINTS, finishes: FINISH_IDS, rims: RIM_COLORS, stripes: STRIPE_IDS, flames: FLAME_COLORS, wheels: WHEEL_LISTS,
  free: { satMin: FREE_SAT_MIN, satNeutral: FREE_SAT_NEUTRAL, lightMin: FREE_LIGHT_MIN, lightMax: FREE_LIGHT_MAX, colors: FREE_COLORS },
});

/**
 * Forma canônica: só o que difere do padrão, na ordem de `LOOK_FIELDS`; sem nenhum, null (o look vazio não existe). Não valida
 * ids (quem lê de fora usa `sanitizeLook`/`parseLook`); com `carId`, a roda de fábrica do estilo também é padrão.
 */
export function normalizeLook(look: CarLook | null | undefined, carId?: string): CarLook | null {
  if (!look) return null;
  const stock = carId ? wheelListOf(carId)?.[0] : undefined;
  const out: CarLook = {};
  for (const f of LOOK_FIELDS) {
    const v = look[f];
    if (typeof v !== 'string' || v === '') continue;
    if ((f === 'paint' && v === ORIGINAL_PAINT) || (f === 'finish' && v === DEFAULT_FINISH) || (f === 'wheel' && v === stock)) continue;
    out[f] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Texto único do look (a chave de cache do render e a comparação de identidade visual). */
export function lookKey(look: CarLook | null | undefined): string {
  if (!look) return '';
  return LOOK_FIELDS.map((f) => look[f] ?? '').join('|');
}

export function lookEquals(a: CarLook | null | undefined, b: CarLook | null | undefined): boolean {
  return lookKey(a) === lookKey(b);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Valida um campo contra o catálogo; devolve o valor (já saneado) ou undefined se não existe. */
function readField(f: LookField, v: unknown, wheels: readonly WheelId[]): string | undefined {
  if (typeof v !== 'string') return undefined;
  switch (f) {
    case 'paint': return isPaintId(v) ? v : undefined;
    case 'color': case 'accent': return snapFreeColor(v) ?? undefined;
    case 'finish': return FINISH_IDS.includes(v) ? v : undefined;
    case 'wheel': return (wheels as readonly string[]).includes(v) ? v : undefined;
    case 'rim': return RIM_IDS.includes(v) ? v : undefined;
    case 'stripe': return STRIPE_IDS.includes(v) ? v : undefined;
    case 'flame': return FLAME_IDS.includes(v) ? v : undefined;
  }
}

function read(v: unknown, carId: string, strict: boolean): { look: CarLook | null } | null {
  const wheels = wheelListOf(carId);
  if (!wheels) return strict ? null : { look: null };
  if (v === undefined) return { look: null };
  if (!isPlainObject(v)) return strict ? null : { look: null }; // o `null` explícito também: nosso remetente omite a chave, nunca a manda nula
  const raw: CarLook = {};
  for (const key of Object.keys(v)) {
    const f = (LOOK_FIELDS as readonly string[]).includes(key) ? (key as LookField) : null;
    const value = v[key];
    if (value === undefined) continue;
    const ok = f ? readField(f, value, wheels) : undefined;
    if (ok === undefined) { if (strict) return null; continue; }
    raw[f as LookField] = ok;
  }
  return { look: normalizeLook(raw, carId) };
}

/** BRANDO (save, copa salva): o campo que não existe sai, o resto fica; qualquer lixo vira null, nunca lança. */
export function sanitizeLook(v: unknown, carId: string): CarLook | null {
  return read(v, carId, false)?.look ?? null;
}

/**
 * ESTRITO (rede): null = RECUSA (chave desconhecida, id fora do catálogo, roda fora da lista do estilo, cor mal formada, tipo errado);
 * `{look}` = aceito, com `look` já canônico (null = o de fábrica). Cor fora da faixa de saturação não recusa: é puxada, igual em toda máquina.
 */
export function parseLook(v: unknown, carId: string): { look: CarLook | null } | null {
  return read(v, carId, true);
}

// ───────────────────────────── Cores e seletor ─────────────────────────────

/**
 * O par de cores que o look pede, camada por camada: a cor livre vence a pintura da paleta, que vence a de fábrica. null = o carro
 * continua inteiro de fábrica nas duas camadas (o que só mexe em roda, acabamento ou faixa não pinta).
 */
export function lookColors(look: CarLook | null | undefined, factory: CarColors): CarColors | null {
  if (!look) return null;
  const pal = paintColors(look.paint);
  if (!pal && !look.color && !look.accent) return null;
  return { color: look.color ?? pal?.color ?? factory.color, accent: look.accent ?? pal?.accent ?? factory.accent };
}

/** As cores de fábrica de um carro dos dados (sem o acento padrão do render, que usa Three: `accent ?? color` como os menus). */
export function factoryColors(car: Pick<CarDef, 'color' | 'accent'>): CarColors {
  return { color: car.color, accent: car.accent ?? car.color };
}

/**
 * As opções de um campo, na ordem do seletor, a primeira sempre o PADRÃO (o que a forma canônica deixa ausente): pintura Original,
 * brilho, a roda do estilo; nos demais, '' ("de fábrica", "da pintura"). Carro desconhecido: só o padrão.
 */
export function lookOptions(field: LookField, carId: string): string[] {
  switch (field) {
    case 'paint': return [...PAINT_IDS];
    case 'finish': return [...FINISH_IDS];
    case 'wheel': return [...(wheelListOf(carId) ?? [])];
    case 'rim': return ['', ...RIM_IDS];
    case 'stripe': return ['', ...STRIPE_IDS];
    case 'flame': return ['', ...FLAME_IDS];
    case 'color': case 'accent': return ['', ...FREE_COLORS];
  }
}

/**
 * ←/→ num campo do look: a opção seguinte (ou anterior) em círculo, já na forma canônica. Valor atual que não é do seletor conta como o padrão.
 * `allowed` (O5, o cadeado dos prêmios de maestria, src/game/progression.ts): a opção recusada é pulada — menos o padrão e o valor atual, que
 * nunca saem do círculo (quem já usava um prêmio continua com ele até trocar). Sem `allowed`, o catálogo inteiro (a rede e o save não filtram).
 */
export function stepLook(look: CarLook | null | undefined, field: LookField, dir: -1 | 1, carId: string, allowed?: (field: LookField, value: string) => boolean): CarLook | null {
  const all = lookOptions(field, carId);
  const now = look?.[field] ?? '';
  const options = allowed ? all.filter((v, i) => i === 0 || v === now || allowed(field, v)) : all;
  if (options.length === 0) return normalizeLook(look, carId);
  const cur = now;
  const i = Math.max(0, options.indexOf(cur === '' ? options[0] : cur));
  const next = options[(i + dir + options.length) % options.length];
  return normalizeLook({ ...look, [field]: next }, carId);
}

// ───────────────────────────── Save ─────────────────────────────

/** Assentos locais que o save lembra (P1..P4), como `seatNames`/`seatCars`. */
export const SEAT_SLOTS = 4;

/**
 * Leitura do save: 4 mapas carro → look, só com carro que existe e look não vazio. MIGRAÇÃO (N3): o save de antes guardava só a
 * pintura (`seatPaints`, carro → id da paleta); cada uma que ainda existe vira o look `{paint}` equivalente quando o `seatLooks` não
 * tem nada para aquele assento e carro. Quem tem os dois fica com o `seatLooks`. Nada se apaga. Idempotente.
 */
export function sanitizeSeatLooks(looks: unknown, legacyPaints?: unknown): Array<Record<string, CarLook>> {
  const arrL = Array.isArray(looks) ? looks : [];
  const arrP = Array.isArray(legacyPaints) ? legacyPaints : [];
  return Array.from({ length: SEAT_SLOTS }, (_, i) => {
    const out: Record<string, CarLook> = {};
    const m: unknown = arrL[i];
    if (isPlainObject(m)) {
      for (const [carId, raw] of Object.entries(m)) {
        const look = sanitizeLook(raw, carId);
        if (look) out[carId] = look;
      }
    }
    const old: unknown = arrP[i];
    if (isPlainObject(old)) {
      for (const [carId, id] of Object.entries(old)) {
        if (!BODY_OF.has(carId) || Object.hasOwn(out, carId) || !isPaintId(id) || id === ORIGINAL_PAINT) continue;
        out[carId] = { paint: id };
      }
    }
    return out;
  });
}
