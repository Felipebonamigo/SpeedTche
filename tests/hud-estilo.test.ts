// V5 (auditoria de 14/10/2026, docs/ondas/V5-hud.md): o HUD de corrida enxuto, na língua do tema `speedtche`. Os números principais
// ficam SEM caixa (nada de vidro, borda ou desfoque atrás deles), em itálico, com contorno escuro e sombra para ler sobre qualquer fundo
// (dia claro, neve, noite). Aqui se lê o hud.css: os tokens, os seletores e o piso de legibilidade. A medida no navegador (px efetivos,
// estilo computado, sobreposição) é do scripts/playtest-layout.mjs; o DOM (sem `.glass`, sem `div.lines`) é do tests/hud-dom.test.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/render/hud.css', import.meta.url), 'utf8');

/** Regras de nível de topo (sem @keyframes), na ordem do arquivo: a lista de seletores e as declarações. */
function rulesOf(text: string): Array<{ selectors: string[]; decls: Array<[string, string]> }> {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
    decls: m[2].split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
      const i = d.indexOf(':');
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as [string, string];
    }),
  }));
}
const RULES = rulesOf(css);
/** Todas as declarações que valem para o seletor exato (em qualquer lista de seletores), na ordem do arquivo. */
function declsOf(selector: string): Array<[string, string]> {
  return RULES.filter((r) => r.selectors.includes(selector)).flatMap((r) => r.decls);
}
/** O último valor da propriedade para o seletor (o que vence com a mesma especificidade), ou null. */
function last(selector: string, prop: string): string | null {
  const found = declsOf(selector).filter(([p]) => p === prop);
  return found.length ? found[found.length - 1][1] : null;
}

// ───────────── cor e contraste (WCAG 2.x) ─────────────
type Rgba = [number, number, number, number];
function parseColor(c: string): Rgba {
  const s = c.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(s);
  if (hex) { const n = parseInt(hex[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i.exec(s);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
  throw new Error(`cor que o teste não lê: ${c}`);
}
/** A cor (com alfa) composta sobre um fundo opaco. */
function over(c: Rgba, bg: Rgba): Rgba {
  const a = c[3];
  return [c[0] * a + bg[0] * (1 - a), c[1] * a + bg[1] * (1 - a), c[2] * a + bg[2] * (1 - a), 1];
}
function lum([r, g, b]: Rgba): number {
  const f = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** Valor de um token do HUD (custom property declarada na raiz `.nc-hud`). */
function token(name: string): string {
  const v = last('.nc-hud', name);
  expect(v, `o token ${name} na raiz .nc-hud`).not.toBeNull();
  return v as string;
}

/**
 * Fundos de referência sobre os quais o HUD tem de ler (amostras das capturas da galeria: céu e neve do Monte Fuji, asfalto e areia de
 * Copacabana de dia, o céu do entardecer de Paraty, o céu de Sampa à noite).
 */
const FUNDOS: Record<string, string> = {
  neve: '#f1f4f8', 'céu claro': '#bcdcf3', 'asfalto de dia': '#787d86', areia: '#e3cf9f', entardecer: '#f2996b', noite: '#0c1124',
};

/** Os números que o jogador lê de relance: posição, volta, tempo, velocidade (e os menores que moram junto deles). */
const NUMEROS = ['.nc-hud .pos-n', '.nc-hud .pos-of', '.nc-hud .lap', '.nc-hud .gap-n', '.nc-hud .time', '.nc-hud .kmh', '.nc-hud .gear', '.nc-hud .fuel-pct', '.nc-hud .nitro-n'];
/** Os painéis que eram caixas de vidro nos 4 cantos (e os companheiros, no canto de cima à direita). */
const PAINEIS = ['.nc-hud .tl', '.nc-hud .tr', '.nc-hud .bl', '.nc-hud .br', '.nc-hud .mini', '.nc-hud .mates'];

describe('V5: os números principais sem caixa', () => {
  it('nenhum painel dos cantos ganha fundo, borda, sombra de caixa nem desfoque no hud.css', () => {
    for (const sel of PAINEIS) {
      const boxy = declsOf(sel).filter(([p, v]) => /^(background(-color|-image)?|-webkit-backdrop-filter|backdrop-filter|box-shadow|border(-top|-right|-bottom|-left)?(-width|-style|-color)?)$/.test(p)
        && !/^(none|0|transparent)$/.test(v));
      expect(boxy, sel).toEqual([]);
    }
  });

  it('os números estão em itálico, com contorno por fora da letra (paint-order) na cor do token e sombra', () => {
    for (const sel of NUMEROS) {
      expect(last(sel, 'font-style'), `${sel}: itálico`).toBe('italic');
      expect(last(sel, '-webkit-text-stroke') ?? '', `${sel}: contorno`).toContain('var(--h-edge)');
      expect(last(sel, 'paint-order'), `${sel}: o contorno por baixo da tinta (não come a letra)`).toBe('stroke fill');
      expect(last(sel, 'text-shadow') ?? 'none', `${sel}: sombra`).not.toBe('none');
    }
  });

  it('o itálico existe de fato: a Fredoka não tem face itálica, então o HUD deixa o navegador inclinar (font-synthesis: style), mas não engordar', () => {
    const synth = last('.nc-hud', 'font-synthesis') ?? '';
    expect(synth.split(/\s+/)).toContain('style');
    expect(synth.split(/\s+/)).not.toContain('weight');
  });

  it('rótulos e textos pequenos que moravam dentro das caixas ganham sombra para ler sem elas', () => {
    for (const sel of ['.nc-hud .tag', '.nc-hud .label', '.nc-hud .unit', '.nc-hud .laps', '.nc-hud .mates', '.nc-hud .mini .mini-name']) {
      expect(last(sel, 'text-shadow') ?? 'none', sel).not.toBe('none');
    }
  });
});

describe('V5: contraste do contorno', () => {
  it('tinta × contorno ≥ 7:1 (AAA): a letra se lê dentro do próprio contorno em qualquer fundo', () => {
    const ink = parseColor(token('--h-ink')); const edge = parseColor(token('--h-edge'));
    expect(ink[3]).toBe(1); expect(edge[3]).toBe(1);
    expect(contrast(ink, edge)).toBeGreaterThanOrEqual(7);
  });

  it('em cada fundo de referência, a tinta ou o contorno passa de 3:1 (AA de texto grande): o número nunca some', () => {
    const ink = parseColor(token('--h-ink')); const edge = parseColor(token('--h-edge'));
    for (const [nome, hex] of Object.entries(FUNDOS)) {
      const bg = parseColor(hex);
      expect(Math.max(contrast(ink, bg), contrast(edge, bg)), nome).toBeGreaterThanOrEqual(3);
    }
  });

  it('barras de combustível e nitro: o enchimento × o trilho ≥ 3:1 (contraste de componente) e a barra inteira se destaca do fundo (trilho ou fio)', () => {
    const track = parseColor(token('--h-track')); const hair = parseColor(token('--h-hair'));
    for (const fill of ['--h-fuel', '--h-nitro']) {
      const f = parseColor(token(fill));
      for (const [nome, hex] of Object.entries(FUNDOS)) {
        const bg = parseColor(hex);
        expect(contrast(over(f, bg), over(track, bg)), `${fill} × trilho sobre ${nome}`).toBeGreaterThanOrEqual(3);
        expect(Math.max(contrast(over(track, bg), bg), contrast(over(hair, bg), bg)), `barra sobre ${nome}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('V5: piso de legibilidade (docs/TELAS.md)', () => {
  const floorPx = (v: string | null): number => { const m = /^max\(\s*([\d.]+)px\s*,/.exec(v ?? ''); return m ? Number(m[1]) : 0; };

  it('o último font-size de cada número tem piso de 12 px; o de cada rótulo, 10 px', () => {
    for (const sel of [...NUMEROS, '.nc-hud .laps', '.nc-hud .pos-badge']) expect(floorPx(last(sel, 'font-size')), sel).toBeGreaterThanOrEqual(12);
    for (const sel of ['.nc-hud .tag', '.nc-hud .label', '.nc-hud .unit', '.nc-hud .fuel-flag', '.nc-hud .draft', '.nc-hud .mates']) {
      expect(floorPx(last(sel, 'font-size')), sel).toBeGreaterThanOrEqual(10);
    }
  });

  it('o contorno tem piso em px (não some no 4P a 1024×640 com o HUD em 80%) e não é mais grosso que a letra aguenta', () => {
    const strokes = RULES.flatMap((r) => r.decls).filter(([p]) => p === '--h-stroke' || p === '-webkit-text-stroke');
    expect(strokes.length).toBeGreaterThan(0);
    for (const [p, v] of strokes) {
      if (p === '-webkit-text-stroke') { expect(v, p).toMatch(/^var\(--h-stroke\)\s+var\(--h-edge\)$/); continue; }
      expect(floorPx(v), `${p}: ${v}`).toBeGreaterThanOrEqual(1);
      const scale = /calc\(\s*([\d.]+)px\s*\*\s*var\(--s\)\s*\)/.exec(v);
      expect(scale && Number(scale[1]), `${p}: ${v} escala com o HUD`).toBeGreaterThan(0);
      expect(Number(scale?.[1]), `${p}: ${v}`).toBeLessThanOrEqual(6);
    }
  });
});
