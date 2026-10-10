// O visual do carro (N3, docs/ondas/N/N3.md): o catálogo, a cor livre com saturação mínima, a forma canônica do
// `CarLook`, e os dois saneadores — o BRANDO (save, copa salva: nunca recusa, o que não existe sai) e o ESTRITO (rede:
// recusa o que não é do catálogo). Puro: sem DOM, sem Three, sem WebGL.
import { describe, expect, it } from 'vitest';
import { CAR_BODIES, CARS } from '../src/core/data/cars';
import type { CarLook } from '../src/core/types';
import {
  COSMETICS_CATALOG, FINISH_IDS, FLAME_IDS, FREE_COLORS, LOOK_FIELDS, lookColors, lookKey, lookOptions, normalizeLook, parseLook,
  RIM_IDS, sanitizeLook, snapFreeColor, STRIPE_IDS, stepLook, WHEEL_IDS, WHEEL_LISTS,
} from '../src/game/cosmetics';
import '../src/cosmetics/strings';
import { setLanguage, t } from '../src/i18n';
import { buildModel } from '../src/render/cars/models';
import { WHEEL_DESIGNS } from '../src/render/cars/wheels';

/** Gerador pseudoaleatório fixo (a suíte é determinística). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const l = (max + min) / 2; const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}

const randomHex = (r: () => number) => `#${Math.floor(r() * 0x1000000).toString(16).padStart(6, '0')}`;

describe('catálogo', () => {
  it('seis acabamentos, o brilho (o de hoje) primeiro; quatro aros; faixa nenhuma, A, B e A+B; oito chamas', () => {
    expect(FINISH_IDS).toEqual(['brilho', 'metalico', 'perolado', 'fosco', 'cromado', 'camaleao']);
    expect(RIM_IDS).toHaveLength(4);
    expect(STRIPE_IDS).toEqual(['nenhuma', 'a', 'b', 'ab']);
    expect(FLAME_IDS).toHaveLength(8);
    for (const list of [FINISH_IDS, RIM_IDS, STRIPE_IDS, FLAME_IDS, WHEEL_IDS]) expect(new Set(list).size).toBe(list.length);
  });

  it('as 9 rodas do render são as do catálogo, na mesma ordem (uma fonte só)', () => {
    expect([...WHEEL_IDS]).toEqual([...WHEEL_DESIGNS]);
    expect(WHEEL_IDS).toHaveLength(9);
  });

  it('uma lista de rodas por estilo: 6, a de fábrica do estilo primeiro, sem repetir; cada desenho está em 3 estilos ou mais', () => {
    expect(Object.keys(WHEEL_LISTS).sort()).toEqual([...CAR_BODIES].sort());
    const uses = new Map<string, number>();
    for (const body of CAR_BODIES) {
      const list = WHEEL_LISTS[body];
      expect(list, body).toHaveLength(6);
      expect(new Set(list).size, body).toBe(6);
      expect(list[0], `${body}: a de fábrica vem primeiro`).toBe(buildModel(body).wheel);
      for (const w of list) { expect(WHEEL_IDS, `${body}/${w}`).toContain(w); uses.set(w, (uses.get(w) ?? 0) + 1); }
    }
    for (const w of WHEEL_IDS) expect(uses.get(w) ?? 0, `a roda ${w} só em poucos estilos`).toBeGreaterThanOrEqual(3);
  });

  it('as cores livres do seletor (12 matizes × 3 tons) já nascem dentro da faixa e não mudam ao sanear', () => {
    expect(FREE_COLORS).toHaveLength(36);
    expect(new Set(FREE_COLORS).size).toBe(36);
    for (const c of FREE_COLORS) expect(snapFreeColor(c), c).toBe(c);
  });

  it('o catálogo que vai na impressão do online é dado puro e muda se um id mudar', () => {
    expect(JSON.parse(JSON.stringify(COSMETICS_CATALOG))).toEqual(COSMETICS_CATALOG);
    expect(COSMETICS_CATALOG).toMatchObject({ finishes: FINISH_IDS, stripes: STRIPE_IDS });
  });
});

describe('nomes do catálogo', () => {
  it('todo id do catálogo tem nome em PT e EN (e os campos do editor também)', () => {
    const groups: Array<[string, readonly string[]]> = [['finish', FINISH_IDS], ['wheel', WHEEL_IDS], ['rim', RIM_IDS], ['stripe', STRIPE_IDS], ['flame', FLAME_IDS]];
    for (const lang of ['pt', 'en'] as const) {
      setLanguage(lang);
      for (const [field, ids] of groups) for (const id of ids) expect(t(`look.${field}.${id}`), `${lang} ${field}.${id}`).not.toBe(`look.${field}.${id}`);
      for (const f of LOOK_FIELDS) expect(t(`look.field.${f}`), `${lang} campo ${f}`).not.toBe(`look.field.${f}`);
      for (const k of ['row', 'open', 'title', 'back', 'standard', 'fromPaint']) expect(t(`look.${k}`), `${lang} ${k}`).not.toBe(`look.${k}`);
    }
    setLanguage('pt');
  });
});

describe('cor livre: saturação mínima', () => {
  it('uma cor dentro da faixa passa igual (em minúsculas)', () => {
    expect(snapFreeColor('#E8433F')).toBe('#e8433f');
    expect(snapFreeColor('#2346d6')).toBe('#2346d6');
  });

  it('saturação baixa sobe a 0,55 ou mais; luminosidade presa em [0,22; 0,78]; o matiz fica', () => {
    const pale = snapFreeColor('#a08585') as string; // rosa desbotado: tem matiz, falta saturação
    expect(hsl('#a08585').s).toBeLessThan(0.55);
    expect(hsl(pale).s).toBeGreaterThanOrEqual(0.55);
    expect(Math.abs(hsl(pale).h - hsl('#a08585').h)).toBeLessThan(4);
    const dark = snapFreeColor('#1a0508') as string;
    expect(hsl(dark).l).toBeGreaterThanOrEqual(0.22);
    const light = snapFreeColor('#ffd6e0') as string;
    expect(hsl(light).l).toBeLessThanOrEqual(0.78);
    expect(hsl(light).s).toBeGreaterThanOrEqual(0.55);
  });

  it('cor sem matiz (cinza, branco, preto) não é cor livre: os neutros são da paleta', () => {
    for (const c of ['#000000', '#ffffff', '#808080', '#7f8082', '#d0d0d0', '#9a8f8f']) expect(snapFreeColor(c), c).toBeNull();
  });

  it('lixo vira null: nome de cor, atalho de 3 dígitos, alfa, tipo errado, texto enorme', () => {
    for (const bad of ['red', '#fff', '#ff00ff00', 'ff0000', '#gg0000', '', null, undefined, 12, {}, [], '#ff0000'.repeat(10_000)]) {
      expect(snapFreeColor(bad), String(bad).slice(0, 12)).toBeNull();
    }
  });

  it('idempotente: sanear o resultado não muda nada (20 mil cores sorteadas)', () => {
    const r = rng(7);
    let kept = 0;
    for (let i = 0; i < 20_000; i++) {
      const once = snapFreeColor(randomHex(r));
      if (once === null) continue;
      kept++;
      expect(snapFreeColor(once), once).toBe(once);
      const { s, l } = hsl(once);
      expect(s, once).toBeGreaterThanOrEqual(0.55);
      expect(l, once).toBeGreaterThanOrEqual(0.22 - 1e-9);
      expect(l, once).toBeLessThanOrEqual(0.78 + 1e-9);
    }
    expect(kept).toBeGreaterThan(15_000);
  });
});

describe('forma canônica', () => {
  it('o que é padrão sai: pintura original, acabamento brilho, roda de fábrica; vazio vira null', () => {
    expect(normalizeLook({ paint: 'original' })).toBeNull();
    expect(normalizeLook({ finish: 'brilho' })).toBeNull();
    expect(normalizeLook({})).toBeNull();
    expect(normalizeLook(null)).toBeNull();
    expect(normalizeLook(undefined)).toBeNull();
    expect(normalizeLook({ wheel: 'sport5' }, 'falcao')).toBeNull(); // sport5 é a roda do gt
    expect(normalizeLook({ wheel: 'mag' }, 'falcao')).toEqual({ wheel: 'mag' });
  });

  it('a ordem das chaves é fixa e o resultado é idempotente', () => {
    const messy: CarLook = { flame: 'roxa', stripe: 'ab', rim: 'dourado', wheel: 'mag', finish: 'cromado', accent: '#2346d6', color: '#d7263d', paint: 'rubi' };
    const once = normalizeLook(messy, 'falcao') as CarLook;
    expect(Object.keys(once)).toEqual([...LOOK_FIELDS]);
    expect(normalizeLook(once, 'falcao')).toEqual(once);
    expect(JSON.stringify(normalizeLook(once, 'falcao'))).toBe(JSON.stringify(once));
  });

  it('lookKey identifica o look inteiro (e o vazio)', () => {
    expect(lookKey(null)).toBe(lookKey(undefined));
    expect(lookKey({ paint: 'rubi' })).not.toBe(lookKey({ paint: 'rubi', stripe: 'a' }));
    expect(lookKey({ paint: 'rubi', stripe: 'a' })).toBe(lookKey({ stripe: 'a', paint: 'rubi' }));
  });
});

describe('sanitizeLook (brando: save e copa salva)', () => {
  it('o campo ruim sai e o resto fica', () => {
    const got = sanitizeLook({ paint: 'rubi', finish: 'inexistente', wheel: 'mag', color: 'azul', stripe: 'ab' }, 'falcao');
    expect(got).toEqual({ paint: 'rubi', wheel: 'mag', stripe: 'ab' });
  });

  it('roda que não é da lista do estilo do carro sai (steel não é do gt)', () => {
    expect(WHEEL_LISTS.gt).not.toContain('steel');
    expect(sanitizeLook({ wheel: 'steel', finish: 'fosco' }, 'falcao')).toEqual({ finish: 'fosco' });
    expect(sanitizeLook({ wheel: 'steel' }, 'tatu')).toBeNull(); // é a de fábrica da picape: padrão, não guarda
  });

  it('cor livre fora da faixa é puxada; sem matiz sai', () => {
    const got = sanitizeLook({ color: '#a08585', accent: '#808080' }, 'falcao') as CarLook;
    expect(hsl(got.color as string).s).toBeGreaterThanOrEqual(0.55);
    expect(got.accent).toBeUndefined();
  });

  it('qualquer lixo vira null sem lançar, inclusive __proto__ e chaves extras', () => {
    for (const bad of [null, undefined, 3, 'rubi', true, [], [{ paint: 'rubi' }], () => 1, Symbol('x')]) {
      expect(sanitizeLook(bad, 'falcao')).toBeNull();
    }
    expect(sanitizeLook(JSON.parse('{"__proto__":{"paint":"rubi"},"extra":1}'), 'falcao')).toBeNull();
    expect(({} as { paint?: string }).paint).toBeUndefined(); // nada vazou para o protótipo
  });

  it('carro que não existe: null', () => {
    expect(sanitizeLook({ paint: 'rubi' }, 'carro_que_nao_existe')).toBeNull();
  });

  it('2.000 objetos aleatórios nunca lançam e sempre saem canônicos', () => {
    const r = rng(11);
    const pool: unknown[] = [...FINISH_IDS, ...RIM_IDS, ...STRIPE_IDS, ...FLAME_IDS, ...WHEEL_IDS, 'rubi', 'original', '#d7263d', '#fff', 'x', 3, null, undefined, {}, [], true];
    const keys = [...LOOK_FIELDS, 'extra', '__proto__', 'constructor'];
    for (let i = 0; i < 2000; i++) {
      const o: Record<string, unknown> = {};
      for (let k = 0; k < 1 + Math.floor(r() * 6); k++) o[keys[Math.floor(r() * keys.length)]] = pool[Math.floor(r() * pool.length)];
      const car = CARS[Math.floor(r() * CARS.length)].id;
      const got = sanitizeLook(o, car);
      expect(normalizeLook(got, car), JSON.stringify(o)).toEqual(got);
      if (got) expect(Object.keys(got).every((k) => (LOOK_FIELDS as readonly string[]).includes(k))).toBe(true);
    }
  });
});

describe('parseLook (estrito: a rede)', () => {
  it('todo look válido do catálogo é aceito e sai igual ao do saneador brando', () => {
    for (const car of ['falcao', 'tatu', 'beijaflor']) {
      const body = CARS.find((c) => c.id === car)?.body ?? 'gt';
      for (const finish of FINISH_IDS) for (const stripe of STRIPE_IDS) {
        const look = { paint: 'cobalto', finish, wheel: WHEEL_LISTS[body][3], rim: RIM_IDS[1], stripe, flame: FLAME_IDS[2], color: FREE_COLORS[5], accent: FREE_COLORS[20] };
        const strict = parseLook(look, car);
        expect(strict, `${car}/${finish}/${stripe}`).not.toBeNull();
        expect(strict?.look).toEqual(sanitizeLook(look, car));
      }
    }
  });

  it('look ausente é válido e vazio; look só de padrões é válido e vazio', () => {
    expect(parseLook(undefined, 'falcao')).toEqual({ look: null });
    expect(parseLook({}, 'falcao')).toEqual({ look: null });
    expect(parseLook({ paint: 'original', finish: 'brilho' }, 'falcao')).toEqual({ look: null });
  });

  it('RECUSA (null): não-objeto, chave desconhecida, id fora do catálogo, roda de outro estilo, cor mal formada, tipo errado', () => {
    const bad: unknown[] = [
      null, 3, 'rubi', [], [{ paint: 'rubi' }], true,
      { extra: 1 }, { paint: 'rubi', extra: 1 }, { paint: 'nao_existe' }, { paint: 3 }, { finish: 'espelho' }, { finish: 'METALICO' },
      { wheel: 'steel' }, { wheel: 'x' }, { rim: 'azul' }, { stripe: 'c' }, { flame: 'verdeagua' },
      { color: 'azul' }, { color: '#fff' }, { color: '#808080' }, { color: 7 }, { accent: '#gggggg' },
      { paint: 'rubi'.repeat(30_000) }, { color: '#'.padEnd(100_000, 'f') },
      JSON.parse('{"__proto__":{"paint":"rubi"}}'), JSON.parse('{"constructor":{"prototype":{"x":1}}}'),
    ];
    for (const v of bad) expect(parseLook(v, 'falcao'), JSON.stringify(v)?.slice(0, 60)).toBeNull();
  });

  it('a mesma roda é recusada num estilo e aceita em outro (a lista é do estilo)', () => {
    expect(parseLook({ wheel: 'steel' }, 'falcao')).toBeNull(); // gt
    expect(parseLook({ wheel: 'dish' }, 'falcao')).not.toBeNull();
    expect(parseLook({ wheel: 'aero' }, 'tatu')).toBeNull(); // picape
  });

  it('cor livre fora da faixa não recusa: é puxada, igual em toda máquina', () => {
    const a = parseLook({ color: '#a08585' }, 'falcao');
    expect(a).not.toBeNull();
    expect(hsl(a?.look?.color as string).s).toBeGreaterThanOrEqual(0.55);
  });

  it('carro que não existe: recusa', () => {
    expect(parseLook({ paint: 'rubi' }, 'nada')).toBeNull();
  });
});

describe('cores do look', () => {
  const factory = { color: '#223344', accent: '#ddeeff' };

  it('sem pintura nem cor livre: null (de fábrica)', () => {
    expect(lookColors(null, factory)).toBeNull();
    expect(lookColors({ finish: 'cromado', wheel: 'mag', stripe: 'a', rim: 'dourado', flame: 'roxa' }, factory)).toBeNull();
  });

  it('a pintura da paleta dá o par; a cor livre vence UMA camada de cada vez', () => {
    expect(lookColors({ paint: 'rubi' }, factory)).toEqual({ color: '#d7263d', accent: '#f4f4f2' });
    expect(lookColors({ paint: 'rubi', color: '#2346d6' }, factory)).toEqual({ color: '#2346d6', accent: '#f4f4f2' });
    expect(lookColors({ paint: 'rubi', accent: '#2346d6' }, factory)).toEqual({ color: '#d7263d', accent: '#2346d6' });
    expect(lookColors({ color: '#2346d6' }, factory)).toEqual({ color: '#2346d6', accent: '#ddeeff' });
    expect(lookColors({ accent: '#2346d6' }, factory)).toEqual({ color: '#223344', accent: '#2346d6' });
  });
});

describe('o seletor da UI (lookOptions / stepLook)', () => {
  it('cada campo tem opções, o padrão em primeiro, todas válidas', () => {
    for (const f of LOOK_FIELDS) {
      const opts = lookOptions(f, 'falcao');
      expect(opts.length, f).toBeGreaterThan(1);
      expect(new Set(opts).size, f).toBe(opts.length);
    }
    expect(lookOptions('finish', 'falcao')).toEqual([...FINISH_IDS]);
    expect(lookOptions('wheel', 'falcao')).toEqual([...WHEEL_LISTS.gt]);
    expect(lookOptions('stripe', 'falcao')).toEqual(['', ...STRIPE_IDS]);
  });

  it('stepLook anda em círculo nos dois sentidos, e o resultado é sempre canônico e passa no estrito', () => {
    for (const f of LOOK_FIELDS) {
      let look: CarLook | null = null;
      const n = lookOptions(f, 'falcao').length;
      const seen = new Set<string>();
      for (let i = 0; i < n; i++) {
        look = stepLook(look, f, 1, 'falcao');
        seen.add(lookKey(look));
        expect(parseLook(look ?? {}, 'falcao'), `${f} passo ${i}`).not.toBeNull();
        expect(normalizeLook(look, 'falcao')).toEqual(look);
      }
      expect(lookKey(look), `${f}: n passos para a frente voltam ao começo`).toBe(lookKey(null));
      expect(seen.size, f).toBe(n);
      expect(lookKey(stepLook(stepLook(null, f, 1, 'falcao'), f, -1, 'falcao')), f).toBe(lookKey(null));
    }
  });

  it('mexer num campo não mexe nos outros', () => {
    const base: CarLook = { paint: 'rubi', finish: 'perolado', stripe: 'ab' };
    const next = stepLook(base, 'flame', 1, 'falcao') as CarLook;
    expect(next).toMatchObject(base);
    expect(next.flame).toBe(FLAME_IDS[0]);
  });
});
