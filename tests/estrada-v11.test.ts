// V11 (docs/ondas/V11-estrada.md): a ESTRADA do jogo contra a do Horizon Chase 2 (referência visual, só olhar). O dono achou o jogo feio; a V10 mediu que a maior
// diferença que sobrou é a pista: cinza escuro lisa ocupando metade do quadro, sem tom. Aqui, sem GPU (pixel puro e paleta):
//   1. Cor da estrada por bioma e período (terra alaranjada no deserto, terra avermelhada na mata, ocre na savana, cinza quente na praia, roxo-azulado na
//      cidade à noite) e tom pintado na textura (manchas largas, veios, tom por trecho).
//   2. Bordas e meios-fios: sarjeta escura, guia clara, zebra com a cor do bioma.
//   3. Chão fora da pista: tom por vértice e relevo suave perto da pista.
// A medida da luz sobre a cor (o modelo de bolso) está em tests/cor-brilho.test.ts (2c); a da imagem, em tests/estrada-gl.test.ts.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTrack } from '../src/core/track';
import type { SceneryId, TimeOfDay } from '../src/core/types';
import { blendPalette, hexToRgb, mix, palette, SCENERIES, TIMES_OF_DAY, type Palette } from '../src/render/palette';
import { Road } from '../src/render/road';
import { buildRoadFrame } from '../src/render/roadframe';
import * as RT from '../src/render/road-textures';
import * as TER from '../src/render/terrain';
import { ROAD_HALF_WIDTH_M } from '../src/render/units';
import { fakeCanvasDocument } from './canvas-fake';

type V = [number, number, number];
type Img = { width: number; height: number; data: ArrayLike<number> };
const ROAD_M = ROAD_HALF_WIDTH_M * 2;

// O que a implementação nova expõe (ainda não existe quando o teste é escrito): lido por acesso dinâmico, para os critérios falharem pela MEDIDA.
interface PaletteNew { roadBase?: string; roadAlt?: string; roadEarth?: number }
const pn = (p: Palette): Palette & PaletteNew => p as Palette & PaletteNew;
const RB = (p: Palette): string => pn(p).roadBase ?? p.asphalt;

const f = (c: number): number => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const linLum = (c: V): number => 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
const wcag = (a: V, b: V): number => { const x = linLum(a); const y = linLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const rgb = (hex: string): V => hexToRgb(hex);
const luma = (c: ArrayLike<number>): number => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
function hueDeg([r, g, b]: V): number {
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
  if (d < 1e-6) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
}
const sat = (c: V): number => { const mx = Math.max(...c); return mx <= 0 ? 0 : (mx - Math.min(...c)) / mx; };
const COMBOS: Array<[SceneryId, TimeOfDay]> = SCENERIES.flatMap((s) => TIMES_OF_DAY.map((t) => [s, t] as [SceneryId, TimeOfDay]));

describe('V11 · a cor da estrada (paleta por bioma e período)', () => {
  it('toda combinação bioma × período tem cor de estrada própria (roadBase, roadAlt) e quanto ela é terra (roadEarth 0..1)', () => {
    const bad: string[] = [];
    for (const [s, t] of COMBOS) {
      const p = pn(palette(s, t));
      if (!/^#[0-9a-f]{6}$/i.test(p.roadBase ?? '')) bad.push(`${s}:${t} roadBase ${p.roadBase}`);
      if (!/^#[0-9a-f]{6}$/i.test(p.roadAlt ?? '')) bad.push(`${s}:${t} roadAlt ${p.roadAlt}`);
      if (!(typeof p.roadEarth === 'number' && p.roadEarth >= 0 && p.roadEarth <= 1)) bad.push(`${s}:${t} roadEarth ${p.roadEarth}`);
    }
    expect(bad).toEqual([]);
  });

  it('de dia, a família de cor do bioma: deserto terra alaranjada, mata terra avermelhada, savana ocre, praia cinza quente, cidade e serra cinza com um toque frio/rosado', () => {
    const day = (s: SceneryId): V => rgb(RB(palette(s, 'day')));
    const hue = (s: SceneryId): number => hueDeg(day(s));
    expect(hue('desert'), 'deserto').toBeGreaterThanOrEqual(12); expect(hue('desert')).toBeLessThanOrEqual(34);
    expect(hue('tropical'), 'mata (avermelhada)').toBeGreaterThanOrEqual(4); expect(hue('tropical')).toBeLessThanOrEqual(20);
    expect(hue('savanna'), 'savana (ocre)').toBeGreaterThanOrEqual(26); expect(hue('savanna')).toBeLessThanOrEqual(46);
    for (const s of ['desert', 'tropical', 'savanna'] as const) expect(sat(day(s)), `${s}: terra tem cor (HSV ≥ 0,4)`).toBeGreaterThanOrEqual(0.4);
    const coast = day('coast');
    expect(coast[0], 'praia: cinza quente (R ≥ B)').toBeGreaterThanOrEqual(coast[2]);
    expect(sat(coast), 'praia: asfalto, pouca saturação').toBeLessThanOrEqual(0.22);
    const city = day('city_night');
    expect(city[2], 'cidade: o azul leva a frente').toBeGreaterThan(city[0]);
    expect(sat(city)).toBeLessThanOrEqual(0.25);
    const alpine = day('alpine');
    expect(sat(alpine), 'serra: pedra rosada').toBeGreaterThanOrEqual(0.04); expect(sat(alpine)).toBeLessThanOrEqual(0.2);
  });

  it('a cidade à noite tem asfalto roxo-azulado (matiz 245°–290°, saturação ≥ 0,25: lilás, não néon) e nenhum bioma tem azul-marinho (matiz 200°–245° com saturação > 0,4) em período nenhum', () => {
    const c = rgb(RB(palette('city_night', 'night')));
    expect(hueDeg(c), 'matiz').toBeGreaterThanOrEqual(245); expect(hueDeg(c)).toBeLessThanOrEqual(290);
    expect(sat(c), 'saturação').toBeGreaterThanOrEqual(0.25);
    const navy = COMBOS.filter(([s, t]) => { const x = rgb(RB(palette(s, t))); return hueDeg(x) >= 200 && hueDeg(x) < 245 && sat(x) > 0.4; }).map((k) => k.join(':'));
    expect(navy).toEqual([]);
  });

  it('a estrada é bem mais viva que o asfalto de antes na terra (deserto, mata, savana: saturação HSV ≥ 0,3 em TODOS os períodos) e as cores dos seis biomas se distinguem de dia (soma dos canais ≥ 0,1)', () => {
    for (const s of ['desert', 'tropical', 'savanna'] as const) for (const t of TIMES_OF_DAY) expect(sat(rgb(RB(palette(s, t)))), `${s}:${t}`).toBeGreaterThanOrEqual(0.3);
    const d = (a: SceneryId, b: SceneryId): number => { const x = rgb(RB(palette(a, 'day'))); const y = rgb(RB(palette(b, 'day'))); return (Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2])) / 255; };
    const close: string[] = [];
    for (let i = 0; i < SCENERIES.length; i++) for (let j = i + 1; j < SCENERIES.length; j++) if (d(SCENERIES[i], SCENERIES[j]) < 0.1) close.push(`${SCENERIES[i]}×${SCENERIES[j]} ${d(SCENERIES[i], SCENERIES[j]).toFixed(2)}`);
    expect(close).toEqual([]);
  });

  it('a estrada continua lendo contra o carro e o chão (a paleta-m2 mede o `asphalt`; aqui a cor que a pista pinta de verdade): albedo contra o carro branco ≥ 3,0 e o escuro ≥ 1,35; contra o chão baixo e o alto, razão ≥ 1,12 ou distância de cor (soma dos canais) ≥ 0,15 (a estrada de terra tem o tom do chão, como no HC2: as bordas é que a separam); contra o acostamento, razão ≥ 1,05 ou distância ≥ 0,2 (a faixa de transição `verge` fica de fora: o acostamento com sarjeta e guia separa as duas)', () => {
    const bad: string[] = [];
    const dist = (a: V, b: V): number => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 255;
    for (const [s, t] of COMBOS) {
      const p = palette(s, t); const r = rgb(RB(p));
      const white = wcag(r, rgb('#f4f4f4')); const dark = wcag(r, rgb('#1c1c22'));
      if (!(white >= 3)) bad.push(`${s}:${t} branco ${white.toFixed(2)}`);
      if (!(dark >= 1.35)) bad.push(`${s}:${t} escuro ${dark.toFixed(2)}`);
      for (const k of ['groundLow', 'groundHigh'] as const) { const q = dist(r, rgb(p[k])); const w = wcag(r, rgb(p[k])); if (!(q >= 0.15 || w >= 1.12)) bad.push(`${s}:${t} ${k} distância ${q.toFixed(2)} razão ${w.toFixed(2)}`); }
      const sh = wcag(r, rgb(p.shoulder)); if (!(sh >= 1.05 || dist(r, rgb(p.shoulder)) >= 0.2)) bad.push(`${s}:${t} acostamento ${sh.toFixed(2)} / ${dist(r, rgb(p.shoulder)).toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });

  it('a corrida que muda interpola a cor da estrada campo a campo (a M6 mistura as duas pontas)', () => {
    const a = palette('desert', 'day'); const b = palette('desert', 'dusk');
    const m = pn(blendPalette(a, b, 0.5));
    expect(m.roadBase, 'roadBase').toBe(mix(RB(a), RB(b), 0.5));
    expect(m.roadAlt, 'roadAlt').toBeDefined();
    expect(m.roadEarth).toBeCloseTo(((pn(a).roadEarth ?? 0) + (pn(b).roadEarth ?? 0)) / 2, 9);
  });

  it('a zebra tem a cor do bioma (≥ 5 pares distintos em 6 biomas de dia), cada par com ≥ 0,35 de luma entre os blocos em todos os períodos', () => {
    const pairs = new Set(SCENERIES.map((s) => `${palette(s, 'day').rumbleDark}/${palette(s, 'day').rumbleLight}`));
    expect(pairs.size, 'pares de zebra distintos').toBeGreaterThanOrEqual(5);
    const bad: string[] = [];
    for (const [s, t] of COMBOS) { const p = palette(s, t); const d = luma(rgb(p.rumbleLight)) - luma(rgb(p.rumbleDark)); if (d < 0.35) bad.push(`${s}:${t} ${d.toFixed(2)}`); }
    expect(bad).toEqual([]);
  });
});

describe('V11 · a estrada pintada na textura', { timeout: 180_000 }, () => {
  const W = RT.ASPHALT_TEX.w; const H = RT.ASPHALT_TEX.h;
  const col = (m: number): number => Math.min(W - 1, Math.max(0, Math.floor(((m + ROAD_M / 2) / ROAD_M) * W)));
  const row = (m: number): number => Math.min(H - 1, Math.max(0, Math.floor((m / RT.ASPHALT_REPEAT_M) * H)));
  const cache = new Map<string, Img>();
  const image = (s: SceneryId, t: TimeOfDay): Img => { const k = `${s}:${t}`; let i = cache.get(k); if (!i) { i = RT.asphaltImage(palette(s, t)) as Img; cache.set(k, i); } return i; };
  const px = (im: Img, x: number, y: number): V => { const i = (y * W + x) * 4; return [im.data[i], im.data[i + 1], im.data[i + 2]]; };
  /** Faixas limpas entre a trilha e o tracejado (a mesma da V4); a faixa de rolamento da direita e da esquerda. */
  const CLEAN: Array<[number, number]> = [[-2.1, -0.6], [0.6, 2.1]];
  /** A média de cor de uma faixa de `bandM` metros ao longo (v), nas faixas limpas. */
  function bands(im: Img, bandM: number): V[] {
    const out: V[] = [];
    for (let m0 = 0; m0 + bandM <= RT.ASPHALT_REPEAT_M + 1e-9; m0 += bandM) {
      let r = 0; let g = 0; let b = 0; let n = 0;
      for (const [a, c] of CLEAN) for (let y = row(m0); y < row(m0 + bandM); y += 3) for (let x = col(a); x <= col(c); x += 3) { const p = px(im, x, y); r += p[0]; g += p[1]; b += p[2]; n++; }
      out.push([r / n, g / n, b / n]);
    }
    return out;
  }
  const mean = (v: number[]): number => v.reduce((s, x) => s + x, 0) / v.length;
  const std = (v: number[]): number => { const m = mean(v); return Math.sqrt(mean(v.map((x) => (x - m) ** 2))); };

  it('a cor média da faixa limpa tem o matiz e a luma da roadBase do bioma (± 16° e 0,8×–1,2×), nos três períodos', () => {
    const bad: string[] = [];
    for (const s of ['desert', 'tropical', 'savanna', 'coast', 'city_night'] as const) for (const t of TIMES_OF_DAY) {
      const base = rgb(RB(palette(s, t)));
      const b = bands(image(s, t), 12); const m: V = [mean(b.map((c) => c[0])), mean(b.map((c) => c[1])), mean(b.map((c) => c[2]))];
      const dh = Math.abs(hueDeg(m) - hueDeg(base)); const dist = Math.min(dh, 360 - dh);
      const lr = luma(m) / luma(base);
      if (sat(base) > 0.2 && dist > 16) bad.push(`${s}:${t} matiz ${hueDeg(m).toFixed(0)}° × ${hueDeg(base).toFixed(0)}°`);
      if (lr < 0.8 || lr > 1.2) bad.push(`${s}:${t} luma ${lr.toFixed(2)}×`);
    }
    expect(bad).toEqual([]);
  });

  it('tom por trecho: a média de cada 3 m de pista varia — luma (máx ÷ mín ≥ 1,10) e calor (R − B, desvio ≥ 0,02) na terra; na praia e na cidade a luma varia ≥ 1,06×', () => {
    const bad: string[] = [];
    for (const s of ['desert', 'tropical', 'savanna', 'coast', 'city_night'] as const) {
      const b = bands(image(s, 'day'), 3);
      const l = b.map(luma); const ratio = Math.max(...l) / Math.min(...l);
      const warm = b.map((c) => (c[0] - c[2]) / 255);
      const earth = s === 'desert' || s === 'tropical' || s === 'savanna';
      if (ratio < (earth ? 1.1 : 1.06)) bad.push(`${s} luma ${ratio.toFixed(3)}×`);
      if (earth && std(warm) < 0.02) bad.push(`${s} calor desvio ${std(warm).toFixed(4)}`);
    }
    expect(bad).toEqual([]);
  });

  it('veios e manchas largas: na terra, de 12% a 60% da faixa limpa fica mais perto da roadAlt que da roadBase (duas tintas pintadas, não uma só)', () => {
    const bad: string[] = [];
    for (const s of ['desert', 'tropical', 'savanna'] as const) {
      const p = pn(palette(s, 'day')); const base = rgb(RB(p)); const alt = rgb(p.roadAlt ?? RB(p)); const im = image(s, 'day');
      const axis: V = [alt[0] - base[0], alt[1] - base[1], alt[2] - base[2]]; const n2 = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2;
      let near = 0; let all = 0;
      for (const [a, c] of CLEAN) for (let y = 0; y < H; y += 5) for (let x = col(a); x <= col(c); x += 5) {
        const q = px(im, x, y); const t = n2 < 1 ? 0 : ((q[0] - base[0]) * axis[0] + (q[1] - base[1]) * axis[1] + (q[2] - base[2]) * axis[2]) / n2;
        if (t > 0.5) near++; all++;
      }
      const frac = near / all;
      if (frac < 0.12 || frac > 0.6) bad.push(`${s}: ${(frac * 100).toFixed(0)}%`);
    }
    expect(bad).toEqual([]);
  });

  it('a faixa (tinta) lê contra a estrada na própria imagem (albedo, sem a luz): ≥ 2:1 (WCAG) nos 18 períodos — o 3:1 com a luz está em cor-brilho 2c', () => {
    const M = RT.MARKINGS;
    const bad: string[] = [];
    for (const [s, t] of COMBOS) {
      const im = image(s, t);
      const xLine = col(ROAD_M / 2 - M.edgeOffsetM - M.edgeWidthM / 2);
      let line: V = [0, 0, 0]; let road: V = [0, 0, 0]; let n = 0;
      for (let y = 0; y < H; y += 7) { const a = px(im, xLine, y); const b = px(im, col(1.4), y); line = [line[0] + a[0], line[1] + a[1], line[2] + a[2]]; road = [road[0] + b[0], road[1] + b[1], road[2] + b[2]]; n++; }
      const r = wcag(line.map((v) => v / n) as V, road.map((v) => v / n) as V);
      if (r < 2) bad.push(`${s}:${t} ${r.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });

  it('a sarjeta: a borda de fora da pista, depois da faixa de bordo, é ≥ 22% mais escura que a faixa limpa (e a de dentro não escurece)', () => {
    const bad: string[] = [];
    for (const s of SCENERIES) {
      const im = image(s, 'day');
      let gut = 0; let clean = 0; let n = 0;
      for (let y = 0; y < H; y += 5) {
        for (const sg of [-1, 1]) gut += luma(px(im, col(sg * (ROAD_M / 2 - 0.11)), y));
        for (const [a, c] of CLEAN) clean += luma(px(im, col((a + c) / 2), y)) / 2;
        n++;
      }
      gut /= 2 * n; clean /= n;
      if (gut > 0.78 * clean) bad.push(`${s}: sarjeta ${gut.toFixed(3)} × faixa ${clean.toFixed(3)}`);
    }
    expect(bad).toEqual([]);
  });

  it('o mesmo desenho nas duas pontas da corrida que muda: terra de dia e de entardecer andam juntas (correlação da luma ≥ 0,95)', () => {
    const a = image('desert', 'day'); const b = image('desert', 'dusk');
    let sa = 0; let sb = 0; let saa = 0; let sbb = 0; let sab = 0; let n = 0;
    for (let i = 0; i < W * H; i += 37) {
      const la = luma([a.data[i * 4], a.data[i * 4 + 1], a.data[i * 4 + 2]]); const lb = luma([b.data[i * 4], b.data[i * 4 + 1], b.data[i * 4 + 2]]);
      sa += la; sb += lb; saa += la * la; sbb += lb * lb; sab += la * lb; n++;
    }
    const r = (sab / n - (sa / n) * (sb / n)) / Math.sqrt((saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2));
    expect(r).toBeGreaterThanOrEqual(0.95);
  });
});

describe('V11 · acostamento e meio-fio', () => {
  const shoulderImage = (p: Palette): Img => (RT as unknown as { shoulderImage?: (p: Palette) => Img }).shoulderImage?.(p) ?? { width: 1, height: 1, data: [0, 0, 0, 255] };
  const at = (im: Img, u: number, y = 0): V => { const x = Math.min(im.width - 1, Math.floor(u * im.width)); const i = (y * im.width + x) * 4; return [im.data[i], im.data[i + 1], im.data[i + 2]]; };
  const avg = (im: Img, u0: number, u1: number): V => {
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (let y = 0; y < im.height; y += 3) for (let u = u0; u <= u1; u += 1 / im.width) { const c = at(im, u, y); r += c[0]; g += c[1]; b += c[2]; n++; }
    return [r / n, g / n, b / n];
  };

  it('a imagem do acostamento é pixel puro com 64+ px de largura, e a sarjeta (u < 0,12) é ≥ 35% mais escura que o miolo, nos 18 períodos', () => {
    const bad: string[] = [];
    for (const [s, t] of COMBOS) {
      const im = shoulderImage(palette(s, t));
      if (im.width < 64) { bad.push(`${s}:${t} sem imagem pura (${im.width})`); continue; }
      const gut = luma(avg(im, 0, 0.1)); const mid = luma(avg(im, 0.55, 0.7));
      if (gut > 0.65 * mid) bad.push(`${s}:${t} sarjeta ${gut.toFixed(3)} × miolo ${mid.toFixed(3)}`);
    }
    expect(bad).toEqual([]);
  });

  it('a guia clara: uma faixa entre u 0,14 e 0,40 com ≥ 1,25× a luma do miolo do acostamento, nos 18 períodos', () => {
    const bad: string[] = [];
    for (const [s, t] of COMBOS) {
      const im = shoulderImage(palette(s, t));
      const curb = luma(avg(im, 0.2, 0.34)); const mid = luma(avg(im, 0.55, 0.7));
      if (!(mid > 0.05) || curb < 1.25 * mid) bad.push(`${s}:${t} guia ${curb.toFixed(3)} × miolo ${mid.toFixed(3)}`);
    }
    expect(bad).toEqual([]);
  });

  it('o acostamento termina na cor da faixa de transição do chão (verge): sem degrau entre o acostamento e o terreno (± 26 por canal)', () => {
    const bad: string[] = [];
    for (const [s, t] of COMBOS) {
      const p = palette(s, t); const im = shoulderImage(p); const c = avg(im, 0.96, 1); const v = rgb(p.verge);
      const d = Math.max(Math.abs(c[0] - v[0]), Math.abs(c[1] - v[1]), Math.abs(c[2] - v[2]));
      if (d > 26) bad.push(`${s}:${t} fim ${c.map(Math.round).join(',')} × verge ${v.join(',')}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('V11 · tom por trecho (cor por vértice do asfalto)', () => {
  const tintOf = (RT as unknown as { stretchTint?: (index: number, side: number) => V }).stretchTint;
  const t = (i: number, side = 1): V => tintOf?.(i, side) ?? [1, 1, 1];

  it('o tom de cada trecho fica em 0,92–1,08 por canal, varia de um trecho a outro (desvio ≥ 0,02 na luma e ≥ 0,02 no calor) e é contínuo (≤ 0,02 entre segmentos vizinhos)', () => {
    const lum: number[] = []; const warm: number[] = [];
    let worst = 0;
    for (let i = 0; i < 600; i++) {
      const c = t(i);
      for (const v of c) { expect(v, `segmento ${i}`).toBeGreaterThanOrEqual(0.92); expect(v).toBeLessThanOrEqual(1.08); }
      lum.push((c[0] + c[1] + c[2]) / 3); warm.push(c[0] - c[2]);
      if (i > 0) { const p = t(i - 1); worst = Math.max(worst, Math.abs(c[0] - p[0]), Math.abs(c[1] - p[1]), Math.abs(c[2] - p[2])); }
    }
    const sd = (v: number[]): number => { const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
    expect(sd(lum), 'desvio da luma').toBeGreaterThanOrEqual(0.02);
    expect(sd(warm), 'desvio do calor').toBeGreaterThanOrEqual(0.02);
    expect(worst, 'maior salto entre vizinhos').toBeLessThanOrEqual(0.02);
  });

  it('é função só do índice do segmento (o mesmo trecho tem sempre o mesmo tom) e os dois lados da pista diferem em algum ponto', () => {
    expect(t(123, 1)).toEqual(t(123, 1));
    let differ = 0;
    for (let i = 0; i < 200; i++) { const a = t(i, -1); const b = t(i, 1); if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 0.01) differ++; }
    expect(differ).toBeGreaterThan(60);
  });

  describe('na malha de verdade', () => {
    let restore = (): void => {};
    beforeEach(() => { restore = fakeCanvasDocument(); });
    afterEach(() => restore());
    it('o Road.update grava o tom do trecho na cor por vértice do asfalto: os 80 primeiros pontos não são todos da mesma cor (antes: só as faixas de 3 segmentos 1 / 0,93)', () => {
      const track = getTrack('xingo');
      const r = new Road(120, 1);
      r.setPalette(palette('desert', 'day'), false, 'v11');
      const frame = buildRoadFrame(track, 400 * 40, 10, 100);
      r.update(frame, track);
      const colors = ((r as unknown as { asphalt: { color: { array: Float32Array } } }).asphalt.color.array);
      const seen = new Set<string>();
      for (let j = 0; j < 80; j++) seen.add([colors[j * 6], colors[j * 6 + 1], colors[j * 6 + 2]].map((v) => v.toFixed(3)).join(','));
      expect(seen.size, 'cores distintas por ponto').toBeGreaterThan(8);
    });
  });
});

describe('V11 · o chão fora da pista (tom e relevo suave)', () => {
  it('relevo suave perto da pista: zero até a faixa de transição (10,8 m), sobe devagar até ≤ 2,0 m, nunca negativo, e volta a zero em 26 m (onde o relevo de longe começa) — nos biomas de terra', () => {
    const bad: string[] = [];
    let peak = 0;
    for (const s of ['desert', 'tropical', 'savanna', 'alpine', 'coast'] as const) for (let seg = 0; seg < 2000; seg += 13) for (const side of [-1, 1]) {
      if (s === 'coast' && side > 0) continue; // o lado do mar
      for (const d of [8.4, 9.6, 10.8]) { const h = TER.relief(s, seg, d, side); if (h !== 0) bad.push(`${s} seg ${seg} ${d} m: ${h}`); }
      const h26 = TER.relief(s, seg, 26, side); if (h26 !== 0) bad.push(`${s} seg ${seg} 26 m: ${h26}`);
      for (const d of [14, 16, 18, 22]) { const h = TER.relief(s, seg, d, side); if (!(h >= 0 && h <= 2)) bad.push(`${s} seg ${seg} ${d} m: ${h}`); peak = Math.max(peak, h); }
    }
    expect(bad).toEqual([]);
    expect(peak, 'o pico do relevo perto da pista (m): precisa aparecer').toBeGreaterThanOrEqual(0.8);
  });

  it('a cidade continua plana (as quadras e a calçada) e o relevo perto da pista varia de um segmento a outro (não é uma valeta uniforme)', () => {
    for (let seg = 0; seg < 800; seg += 7) for (const d of [14, 16, 22]) expect(TER.relief('city_night', seg, d, 1), `cidade seg ${seg}`).toBe(0);
    const v = Array.from({ length: 120 }, (_, i) => TER.relief('desert', i * 3, 16, 1));
    expect(Math.max(...v) - Math.min(...v), 'amplitude ao longo da pista').toBeGreaterThanOrEqual(0.25);
  });

  it('o tom do chão varia ao longo da pista e em direção ao chão (não é uma cor lisa): `groundTone` devolve um deslocamento por vértice com desvio ≥ 0,12 nas colunas de perto', () => {
    const gt = (TER as unknown as { groundTone?: (biome: SceneryId, seg: number, col: number, side: number) => number }).groundTone;
    const v: number[] = [];
    for (let i = 0; i < 400; i++) v.push(gt?.('desert', i, 3, 1) ?? 0);
    const m = v.reduce((a, b) => a + b, 0) / v.length; const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
    expect(sd, 'desvio do tom').toBeGreaterThanOrEqual(0.12);
    for (const x of v) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1); }
  });
});
