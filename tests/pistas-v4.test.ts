// V4, pistas com acabamento (auditoria de 14/10/2026; docs/ondas/V4-pistas.md): o que a auditoria viu e se mede sem GPU.
//   1. Asfalto de cor lisa → agregado, trilhas de pneu, remendos com borda e juntas, na imagem pura do asfalto (`asphaltImage`).
//   2. Faixas e zebras pouco nítidas → densidade de texel isotrópica (o mipmap escolhe o nível pelo eixo comprido: com 18 × 85 px/m a faixa
//      borrava), faixas largas e ainda com ≥ 1,5 texel no nível de mip que a câmera Alta usa a 60 m; bloco de zebra que não vira rosa de longe.
//   3. O mesmo prédio repetido → visuais por estilo (a célula do atlas da fachada, lida da uv da geometria de verdade) variando por trecho.
//   4. Poucas nuvens → nuvens na faixa do céu que a câmera Alta vê, em qualquer rumo, numa malha barata.
//   5. Água pouco saturada → a cor que o mar dá longe (o céu refletido no ângulo raso e a névoa) continua saturada, por bioma e período.
// Tudo no Node (o canvas é falso: a imagem do asfalto, da zebra e das nuvens é pixel puro).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTrack } from '../src/core/track';
import type { SceneryId } from '../src/core/types';
import { CAMERA_POSES } from '../src/render/camera-base';
import { palette, SCENERIES, TIMES_OF_DAY, type Palette } from '../src/render/palette';
import * as RT from '../src/render/road-textures';
import { getModel, modelBounds, modelFrontX } from '../src/render/scenery/catalog';
import { sceneryLayout } from '../src/render/scenery/layout';
import * as SKY from '../src/render/sky';
import * as TER from '../src/render/terrain';
import * as TEX from '../src/render/scenery/textures';
import { ROAD_HALF_WIDTH_M } from '../src/render/units';
import { fakeCanvasDocument } from './canvas-fake';

type V = [number, number, number];
type Img = { width: number; height: number; data: ArrayLike<number> };
const ROAD_M = ROAD_HALF_WIDTH_M * 2;
/** A zebra vai de −0,12 a 1,1 m da borda do asfalto (road.ts, KERB_IN/KERB_OUT): a uv dela atravessa 1,22 m. */
const KERB_SPAN_M = 1.22;
/** O contrato da uv das fachadas (scenery/textures.ts, FACADE_CELL_SPAN): u = local + célula × 64. */
const CELL_SPAN = 64;

const luma = (r: number, g: number, b: number): number => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
function satHsv(c: V): number { const mx = Math.max(...c); return mx <= 0 ? 0 : (mx - Math.min(...c)) / mx; }
function hueDeg([r, g, b]: V): number {
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
  if (d < 1e-6) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
}

/**
 * O nível de mip que a GPU escolhe para um ponto do chão a `d` m à frente da câmera de corrida (altura `h`, FOV vertical `fov`, 720 px de altura),
 * com `aniso` amostras anisotrópicas: o pixel cobre d/f m através e d²/(h·f) m ao longo; o nível sai do eixo maior dividido pelo número de amostras.
 */
function mipLevel(d: number, pxPerMAcross: number, pxPerMAlong: number, aniso: number, h: number, fovDeg: number): number {
  const f = 360 / Math.tan((fovDeg / 2) * Math.PI / 180);
  const across = (d / f) * pxPerMAcross;
  const along = ((d * d) / (h * f)) * pxPerMAlong;
  const major = Math.max(across, along); const minor = Math.max(1e-6, Math.min(across, along));
  const n = Math.min(Math.ceil(major / minor), aniso);
  return Math.max(0, Math.log2(major / n));
}

describe('V4 · faixas e zebras nítidas', () => {
  let restore = (): void => {};
  beforeEach(() => { restore = fakeCanvasDocument(); });
  afterEach(() => restore());
  const sizeOf = (t: { image: unknown }): { w: number; h: number } => { const i = t.image as { width: number; height: number }; return { w: i.width, h: i.height }; };

  it('o asfalto e a zebra têm a mesma densidade de texel através e ao longo (0,75–1,35): senão o mip do eixo comprido borra as faixas', () => {
    const p = palette('coast', 'day');
    const a = sizeOf(RT.paintAsphalt(p, 8).map);
    const k = sizeOf(RT.paintKerb(p, 8));
    const ra = (a.w / ROAD_M) / (a.h / RT.ASPHALT_REPEAT_M);
    const rk = (k.w / KERB_SPAN_M) / (k.h / RT.KERB_REPEAT_M);
    expect(ra, `asfalto ${a.w}×${a.h} px para ${ROAD_M} × ${RT.ASPHALT_REPEAT_M} m: ${(a.w / ROAD_M).toFixed(1)} × ${(a.h / RT.ASPHALT_REPEAT_M).toFixed(1)} px/m`).toBeGreaterThanOrEqual(0.75);
    expect(ra).toBeLessThanOrEqual(1.35);
    expect(rk, `zebra ${k.w}×${k.h} px para ${KERB_SPAN_M} × ${RT.KERB_REPEAT_M} m`).toBeGreaterThanOrEqual(0.75);
    expect(rk).toBeLessThanOrEqual(1.35);
  });

  it('faixa de bordo e tracejado com ≥ 8 texels de largura e, a 60 m na câmera Alta, ainda ≥ 1,5 texel no nível de mip escolhido; bloco de zebra ≥ 1,5 m', () => {
    const M = RT.MARKINGS;
    const pxU = RT.ASPHALT_TEX.w / ROAD_M; const pxV = RT.ASPHALT_TEX.h / RT.ASPHALT_REPEAT_M;
    expect(M.edgeWidthM * pxU, 'faixa de bordo (texels)').toBeGreaterThanOrEqual(8);
    expect(M.dashWidthM * pxU, 'tracejado (texels)').toBeGreaterThanOrEqual(8);
    expect(M.dashLengthM, 'traço (m)').toBeGreaterThanOrEqual(3);
    const cam = CAMERA_POSES.high;
    const level = mipLevel(60, pxU, pxV, RT.ROAD_ANISOTROPY.high, cam.height, cam.baseFov);
    expect((M.edgeWidthM * pxU) / 2 ** level, `a 60 m: nível ${level.toFixed(2)}`).toBeGreaterThanOrEqual(1.5);
    expect(RT.KERB_REPEAT_M / 2, 'bloco da zebra (m)').toBeGreaterThanOrEqual(1.5);
    // Anisotropia por qualidade: a Baixa paga menos, a Alta e a Ultra o máximo usual.
    expect(RT.ROAD_ANISOTROPY.low).toBeLessThanOrEqual(RT.ROAD_ANISOTROPY.medium);
    expect(RT.ROAD_ANISOTROPY.medium).toBeLessThanOrEqual(RT.ROAD_ANISOTROPY.high);
    expect(RT.ROAD_ANISOTROPY.high).toBeGreaterThanOrEqual(16);
  });

  it('a zebra: vermelho × branco com contraste (≥ 0,35 de luma) e friso escuro entre os blocos, nas duas pontas da corrida que muda', () => {
    for (const p of [palette('coast', 'day'), palette('desert', 'dusk'), palette('city_night', 'night')]) {
      const img = RT.kerbImage(p) as Img;
      const W = img.width; const H = img.height;
      const at = (x: number, y: number): number => { const i = (y * W + x) * 4; return luma(img.data[i], img.data[i + 1], img.data[i + 2]); };
      const x = Math.floor(W * 0.6);
      const red = at(x, Math.floor(H * 0.25)); const white = at(x, Math.floor(H * 0.75));
      expect(white - red, `${p.rumbleDark} × ${p.rumbleLight}`).toBeGreaterThanOrEqual(0.35);
      let darkest = 1;
      for (let y = Math.floor(H * 0.46); y <= Math.floor(H * 0.54); y++) darkest = Math.min(darkest, at(x, y));
      expect(darkest, 'friso entre os blocos').toBeLessThan(red * 0.85);
    }
  });
});

describe('V4 · asfalto com agregado e desgaste', { timeout: 120_000 }, () => {
  const p = palette('coast', 'day');
  // Preguiçoso: sem a função (o 550e970), cada teste falha sozinho, e não o arquivo inteiro na coleta.
  let cached: Img | null = null;
  const image = (): Img => (cached ??= RT.asphaltImage(p) as Img);
  const W = RT.ASPHALT_TEX?.w ?? 0; const H = RT.ASPHALT_TEX?.h ?? 0;
  const col = (m: number): number => Math.min(W - 1, Math.max(0, Math.floor(((m + ROAD_M / 2) / ROAD_M) * W)));
  const row = (m: number): number => Math.min(H - 1, Math.max(0, Math.floor((m / RT.ASPHALT_REPEAT_M) * H)));
  const L = (x: number, y: number): number => { const d = image().data; const i = (y * W + x) * 4; return luma(d[i], d[i + 1], d[i + 2]); };
  const mean = (x0: number, x1: number, y0: number, y1: number): number => {
    let s = 0; let n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { s += L(x, y); n++; }
    return s / Math.max(1, n);
  };
  /** Faixa lateral limpa: entre a trilha de dentro da faixa e o tracejado central (sem trilha, sem óleo, sem tinta). */
  const CLEAN: Array<[number, number]> = [[-2.1, -0.6], [0.6, 2.1]];
  /** Trilhas de pneu: o centro de cada faixa (±3,5 m) ± 0,8 m. */
  const TRACKS = [-4.3, -2.7, 2.7, 4.3];

  it('tem o tamanho e a densidade do contrato (ASPHALT_TEX)', () => {
    expect([image().width, image().height]).toEqual([RT.ASPHALT_TEX.w, RT.ASPHALT_TEX.h]);
  });

  // O granulado de antes (550e970, medido no canvas de verdade no Chromium com esta mesma conta; docs/ondas/V4-pistas.md §8) dava 6,6%: o piso de 8%
  // separa o agregado do granulado (o novo dá 10,9%).
  it('agregado: na faixa limpa, o desvio da luma fina (contra a média 5×5 em volta) passa de 8% da média (o granulado de antes dava 6,6%)', () => {
    let s2 = 0; let n = 0; let m = 0;
    for (const [a, b] of CLEAN) for (let y = 4; y < H - 4; y += 3) for (let x = col(a); x <= col(b); x += 2) {
      let loc = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) loc += L(x + dx, y + dy);
      const d = L(x, y) - loc / 25;
      s2 += d * d; m += L(x, y); n++;
    }
    expect(Math.sqrt(s2 / n) / (m / n)).toBeGreaterThan(0.08);
  });

  it('trilhas de pneu ≥ 6% mais escuras que a faixa limpa (antes: 4,9% a 6,3%, no canvas do 550e970)', () => {
    const clean = CLEAN.reduce((s, [a, b]) => s + mean(col(a), col(b), 0, H - 1), 0) / CLEAN.length;
    for (const t of TRACKS) {
      const tr = mean(col(t - 0.15), col(t + 0.15), 0, H - 1);
      expect(tr / clean, `trilha em ${t} m`).toBeLessThanOrEqual(0.94);
    }
  });

  it('remendos (≥ 2) com borda selada: o miolo difere ≥ 3% do asfalto em volta e a borda é ≥ 8% mais escura que os dois', () => {
    const patches = RT.ASPHALT_WEAR.patches;
    expect(patches.length).toBeGreaterThanOrEqual(2);
    for (const q of patches) {
      const inner = mean(col(q.x0 + 0.25), col(q.x1 - 0.25), row(q.y0 + 0.25), row(q.y1 - 0.25));
      const around = (mean(col(q.x0 - 0.7), col(q.x0 - 0.3), row(q.y0), row(q.y1)) + mean(col(q.x1 + 0.3), col(q.x1 + 0.7), row(q.y0), row(q.y1))) / 2;
      const border = mean(col(q.x0 + 0.3), col(q.x1 - 0.3), row(q.y0), row(q.y0) + 1);
      expect(Math.abs(inner / around - 1), `remendo ${JSON.stringify(q)}: miolo ${inner.toFixed(3)} × em volta ${around.toFixed(3)}`).toBeGreaterThanOrEqual(0.03);
      expect(border, 'borda selada').toBeLessThanOrEqual(Math.min(inner, around) * 0.92);
    }
  });

  it('juntas (≥ 1): a linha da junta é ≥ 12% mais escura que o asfalto a 0,3 m dela', () => {
    expect(RT.ASPHALT_WEAR.joints.length).toBeGreaterThanOrEqual(1);
    for (const j of RT.ASPHALT_WEAR.joints) {
      const [a, b] = CLEAN[1];
      const line = mean(col(a), col(b), row(j), row(j));
      const off = (mean(col(a), col(b), row(j - 0.3), row(j - 0.3)) + mean(col(a), col(b), row(j + 0.3), row(j + 0.3))) / 2;
      expect(line / off, `junta em ${j} m`).toBeLessThanOrEqual(0.88);
    }
  });

  it('a tinta da faixa de bordo se lê contra o asfalto (≥ 0,32 de luma no albedo; era 0,45 até a V11, que clareou a estrada no entardecer e na noite — o 3:1 com a luz está em cor-brilho 2c) nos 18 períodos', () => {
    const M = RT.MARKINGS;
    for (const s of SCENERIES) for (const t of TIMES_OF_DAY) {
      const q = palette(s, t);
      const im = RT.asphaltImage(q) as Img;
      const Lq = (x: number, y: number): number => { const i = (y * im.width + x) * 4; return luma(im.data[i], im.data[i + 1], im.data[i + 2]); };
      const xLine = col(ROAD_M / 2 - M.edgeOffsetM - M.edgeWidthM / 2);
      let line = 0; let asph = 0; let n = 0;
      for (let y = 0; y < im.height; y += 7) { line += Lq(xLine, y); asph += Lq(col(1.4), y); n++; }
      expect((line - asph) / n, `${s}:${t}`).toBeGreaterThanOrEqual(0.32);
    }
  });

  it('o mesmo desenho nas duas pontas da corrida que muda: a luma do dia e a do entardecer andam juntas (correlação ≥ 0,95)', () => {
    const b = RT.asphaltImage(palette('coast', 'dusk')) as Img;
    let sa = 0; let sb = 0; let saa = 0; let sbb = 0; let sab = 0; let n = 0;
    const img = image();
    for (let i = 0; i < W * H; i += 37) {
      const la = luma(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]); const lb = luma(b.data[i * 4], b.data[i * 4 + 1], b.data[i * 4 + 2]);
      sa += la; sb += lb; saa += la * la; sbb += lb * lb; sab += la * lb; n++;
    }
    const cov = sab / n - (sa / n) * (sb / n);
    const r = cov / Math.sqrt((saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2));
    expect(r).toBeGreaterThanOrEqual(0.95);
  });
});

describe('V4 · fachadas variadas', { timeout: 300_000 }, () => {
  type Fac = 'office' | 'apartment' | 'classic' | 'house';
  const FACS: readonly Fac[] = ['office', 'apartment', 'classic', 'house'];
  /** A célula do atlas da fachada de um modelo (a uv das paredes; o topo e o fundo apontam para o canto 0,01). */
  function cellsOf(id: string): Map<Fac, Set<number>> {
    const out = new Map<Fac, Set<number>>();
    for (const part of getModel(id).parts) {
      if (!FACS.includes(part.mat as Fac)) continue;
      const uv = part.geometry.getAttribute('uv');
      if (!uv) continue;
      const set = out.get(part.mat as Fac) ?? new Set<number>();
      for (let i = 0; i < uv.count; i++) { const u = uv.getX(i); if (u > 0.02) set.add(Math.min(3, Math.max(0, Math.floor(u / CELL_SPAN)))); }
      out.set(part.mat as Fac, set);
    }
    return out;
  }

  it('o contrato da uv é o do atlas (célula × 64)', () => {
    expect(TEX.FACADE_CELL_SPAN).toBe(CELL_SPAN);
  });

  for (const trackId of ['copacabana', 'sampa_noite']) {
    it(`${trackId}: cada estilo de fachada com ≥ 8 prédios mostra ≥ 4 visuais na pista, e toda janela de 80 segmentos com ≥ 4 prédios mostra ≥ 3`, () => {
      const track = getTrack(trackId);
      const lay = sceneryLayout(track);
      const bySeg: Array<Array<string>> = lay.bySeg.map((list) => list.map((p) => lay.models[p.model]).filter((id) => id.startsWith('bld:')));
      const visuals = (id: string): string[] => [...cellsOf(id).entries()].flatMap(([fac, cells]) => [...cells].map((c) => `${fac}:${c}`));
      const perStyle = new Map<Fac, { n: number; cells: Set<number> }>();
      for (const list of bySeg) for (const id of list) for (const [fac, cells] of cellsOf(id)) {
        const e = perStyle.get(fac) ?? { n: 0, cells: new Set<number>() };
        e.n++; for (const c of cells) e.cells.add(c);
        perStyle.set(fac, e);
      }
      for (const [fac, e] of perStyle) if (e.n >= 8) expect(e.cells.size, `${trackId} ${fac}: ${e.n} prédios`).toBeGreaterThanOrEqual(4);
      const n = bySeg.length; const bad: string[] = [];
      for (let s = 0; s < n; s += 20) {
        const ids: string[] = [];
        for (let k = 0; k < 80; k++) ids.push(...bySeg[(s + k) % n]);
        if (ids.length < 4) continue;
        const v = new Set(ids.flatMap(visuals));
        if (v.size < 3) bad.push(`${s}: ${ids.length} prédios, ${v.size} visuais (${[...v].join(' ')})`);
      }
      expect(bad).toEqual([]);
    });
  }

  it('o visual sai da posição na pista (determinístico): o mesmo layout duas vezes dá os mesmos ids', () => {
    const t = getTrack('copacabana');
    const a = sceneryLayout(t); const b = sceneryLayout(t);
    expect(b.models).toEqual(a.models);
  });

  it('os 4 visuais de um prédio têm a MESMA pegada, altura e frente (a colisão, a ocupação e a visada dos marcos não mudam) e os mesmos materiais (o mesmo lote)', () => {
    const bases = ['bld:aptbeach:12:2', 'bld:aptbeach:6:0', 'bld:glass:12:2', 'bld:apt:9:0', 'bld:apt:5:4', 'bld:brick:6:1', 'bld:classic:5:0', 'bld:classicwarm:4:1'];
    for (const base of bases) {
      const b0 = modelBounds(base); const f0 = modelFrontX(base);
      const mats0 = getModel(base).parts.map((p) => p.mat).sort().join(',');
      for (let look = 0; look < 4; look++) {
        const id = `${base}:${look}`;
        const b = modelBounds(id);
        for (const k of ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'] as const) expect(Math.abs(b[k] - b0[k]), `${id} ${k}`).toBeLessThanOrEqual(0.01);
        expect(Math.abs(modelFrontX(id) - f0), `${id} frente`).toBeLessThanOrEqual(0.01);
        expect(getModel(id).parts.map((p) => p.mat).sort().join(','), id).toBe(mats0);
      }
    }
  });
});

describe('V4 · nuvens pintadas, numerosas e na faixa do céu que a câmera vê', () => {
  it('≥ 24 nuvens na Alta; em qualquer rumo a câmera Alta vê ≥ 5 (centro entre 1° e 18° de elevação, dentro do campo horizontal)', () => {
    const list = SKY.cloudLayout('high');
    expect(list.length).toBeGreaterThanOrEqual(24);
    const cam = CAMERA_POSES.high;
    const half = Math.atan(Math.tan((cam.baseFov / 2) * Math.PI / 180) * (16 / 9));
    const bad: string[] = [];
    for (let h = 0; h < 360; h += 10) {
      const hr = (h * Math.PI) / 180;
      const seen = list.filter((c) => {
        const d = Math.atan2(Math.sin(c.az - hr), Math.cos(c.az - hr));
        return Math.abs(d) <= half && c.el >= 1 && c.el <= 18;
      }).length;
      if (seen < 5) bad.push(`${h}°: ${seen}`);
    }
    expect(bad).toEqual([]);
  });

  it('a malha das nuvens custa ≤ 2.000 triângulos (eram ~20 mil de icosaedros) e a Baixa desenha menos', () => {
    const tri = (q: 'low' | 'high'): number => { const g = SKY.buildClouds(q); const idx = g.getIndex(); return (idx ? idx.count : g.getAttribute('position').count) / 3; };
    expect(tri('high')).toBeLessThanOrEqual(2000);
    expect(SKY.cloudLayout('low').length).toBeLessThan(SKY.cloudLayout('high').length);
    expect(tri('low')).toBeLessThan(tri('high'));
  });
});

describe('V4 · água saturada e viva', () => {
  const MIN: Record<'day' | 'dusk' | 'night', number> = { day: 0.7, dusk: 0.45, night: 0.45 };
  it('a 300 m, no ângulo raso (o céu refletido e a névoa no máximo), a água tem saturação ≥ 0,7 de dia, ≥ 0,45 no entardecer e à noite, nos 6 biomas; de dia o matiz é azul-turquesa (175°–225°)', () => {
    const bad: string[] = [];
    for (const s of SCENERIES as readonly SceneryId[]) for (const t of TIMES_OF_DAY) {
      const p: Palette = palette(s, t);
      const c = TER.seaApparent(TER.seaLook(p), 300, SKY.FOG_DENSITY.high * p.fogDensity, p.fog) as V;
      const sat = satHsv(c); const hue = hueDeg(c);
      if (sat < MIN[t]) bad.push(`${s}:${t} rgb(${c.map(Math.round).join(',')}) saturação ${sat.toFixed(2)}`);
      if (t === 'day' && (hue < 175 || hue > 225)) bad.push(`${s}:day matiz ${hue.toFixed(0)}°`);
    }
    expect(bad).toEqual([]);
  });
});
