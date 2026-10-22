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

  // V22/F2: o contrato mudou de propósito (o dono: "parece desenho"; o diagnóstico §3.1: os remendos eram retângulos com CONTORNO preto, leem como adesivo). Continua
  // exigido: ≥ 2 remendos e o miolo ≥ 3% diferente do asfalto em volta. SAIU: "a borda é ≥ 8% mais escura que os dois" (o contorno selado em piche) — o contrário
  // disso (sem contorno, sem canto reto) é o teste novo "V22/F2 · remendos sem contorno" mais abaixo. Nenhum valor foi afrouxado: a trava que saiu media o defeito.
  it('remendos (≥ 2): o miolo difere ≥ 3% do asfalto em volta', () => {
    const patches = RT.ASPHALT_WEAR.patches;
    expect(patches.length).toBeGreaterThanOrEqual(2);
    for (const q of patches) {
      const inner = mean(col(q.x0 + 0.25), col(q.x1 - 0.25), row(q.y0 + 0.25), row(q.y1 - 0.25));
      const around = (mean(col(q.x0 - 0.7), col(q.x0 - 0.3), row(q.y0), row(q.y1)) + mean(col(q.x1 + 0.3), col(q.x1 + 0.7), row(q.y0), row(q.y1))) / 2;
      expect(Math.abs(inner / around - 1), `remendo ${JSON.stringify(q)}: miolo ${inner.toFixed(3)} × em volta ${around.toFixed(3)}`).toBeGreaterThanOrEqual(0.03);
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

// ───────────────────────────── V22/F2 · a estrada deixa de parecer desenho ─────────────────────────────
// docs/ondas/V22-diagnostico-cena.md §3.1 e §6 (F2). O que o diagnóstico viu na estrada (`c01`, `c02`, `c07`): polígonos de rachadura na terra, remendos com contorno,
// uma linha preta de 1 texel (a junta), faixa limpa demais, sem brilho nem relevo, uma escala só de mancha. Aqui, no Node (pixel puro): o desenho do asfalto e da terra, o mapa de
// rugosidade e o mapa de normais, a zebra com bisel e borracha e o acostamento de borda irregular. O GL (detalhe medido na imagem) está em estrada-gl.test.ts.
describe('V22/F2 · a estrada sem polígono, sem contorno, com duas escalas de mancha', { timeout: 300_000 }, () => {
  const W = RT.ASPHALT_TEX.w; const H = RT.ASPHALT_TEX.h;
  const col = (m: number): number => Math.min(W - 1, Math.max(0, Math.floor(((m + ROAD_M / 2) / ROAD_M) * W)));
  const row = (m: number): number => Math.min(H - 1, Math.max(0, Math.floor((m / RT.ASPHALT_REPEAT_M) * H)));
  const cache = new Map<string, Img>();
  const img = (s: SceneryId): Img => { let i = cache.get(s); if (!i) { i = RT.asphaltImage(palette(s, 'day')) as Img; cache.set(s, i); } return i; };
  const Lx = (im: Img, x: number, y: number): number => { const d = im.data; const k = ((((y % H) + H) % H) * W + x) * 4; return luma(d[k], d[k + 1], d[k + 2]); };
  const CLEAN: Array<[number, number]> = [[-2.1, -0.6], [0.6, 2.1]];
  const EARTH: readonly SceneryId[] = ['desert', 'tropical', 'savanna'];
  const std = (v: number[]): number => { const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };

  /** Média da luma e do matiz (°) de cada bloco de `bm` metros ao longo, nas duas faixas limpas. */
  function blocks(im: Img, bm: number): Array<{ l: number; hue: number }> {
    const out: Array<{ l: number; hue: number }> = [];
    for (const [a, b] of CLEAN) for (let m0 = 0; m0 + bm <= RT.ASPHALT_REPEAT_M + 1e-9; m0 += bm) {
      let l = 0; let r = 0; let g = 0; let bl = 0; let n = 0;
      for (let y = row(m0); y < row(m0 + bm); y += 2) for (let x = col(a); x <= col(b); x += 2) { const k = (y * W + x) * 4; r += im.data[k]; g += im.data[k + 1]; bl += im.data[k + 2]; l += Lx(im, x, y); n++; }
      out.push({ l: l / n, hue: hueDeg([r / n, g / n, bl / n]) });
    }
    return out;
  }

  it('remendos sem contorno: o degrau de luma ao cruzar a borda de cada remendo é ≤ 0,12 por pixel (média de 24 px ao longo da borda; o contorno selado de antes dava ~0,14)', () => {
    for (const s of ['coast', 'desert'] as const) {
      const im = img(s);
      for (const q of RT.ASPHALT_WEAR.patches) {
        let worst = 0;
        const avgRow = (y: number, x0: number): number => { let a = 0; for (let x = x0; x < x0 + 24; x++) a += Lx(im, Math.min(x, W - 1), y); return a / 24; };
        const avgCol = (x: number, y0: number): number => { let a = 0; for (let y = y0; y < y0 + 24; y++) a += Lx(im, x, y); return a / 24; };
        for (const ye of [q.y0, q.y1]) for (let y = row(ye) - 18; y < row(ye) + 18; y++) for (let x = col(q.x0 + 0.5); x < col(q.x1 - 0.5) - 24; x += 24) worst = Math.max(worst, Math.abs(avgRow(y + 1, x) - avgRow(y, x)));
        for (const xe of [q.x0, q.x1]) for (let x = col(xe) - 16; x < col(xe) + 16; x++) for (let y = row(q.y0 + 0.5); y < row(q.y1 - 0.5) - 24; y += 24) worst = Math.max(worst, Math.abs(avgCol(x + 1, y) - avgCol(x, y)));
        expect(worst, `${s}: remendo ${JSON.stringify(q)}`).toBeLessThanOrEqual(0.12);
      }
    }
  });

  it('remendos não são retângulos: a cobertura (0..1) é ≥ 0,95 no meio, ≤ 0,4 no canto nominal (recuado 0,1 m: cantos arredondados), ≥ 0,5 a 0,25 m para dentro de cada lado e ≤ 0,5 a 0,25 m para fora, ≈ 0 a 0,5 m da borda; e a borda anda (≥ 0,03 m de desvio ao longo do lado de cima)', () => {
    const cov = (RT as unknown as { patchCoverage?: (q: RT.AsphaltPatch, mx: number, my: number) => number }).patchCoverage;
    for (const q of RT.ASPHALT_WEAR.patches) {
      const f = (mx: number, my: number): number => cov?.(q, mx, my) ?? (mx >= q.x0 && mx <= q.x1 && my >= q.y0 && my <= q.y1 ? 1 : 0); // sem a função: o retângulo duro de antes
      const cx = (q.x0 + q.x1) / 2; const cy = (q.y0 + q.y1) / 2;
      const tag = JSON.stringify(q);
      expect(f(cx, cy), `meio ${tag}`).toBeGreaterThanOrEqual(0.95);
      for (const [x, y] of [[q.x0 + 0.1, q.y0 + 0.1], [q.x1 - 0.1, q.y0 + 0.1], [q.x0 + 0.1, q.y1 - 0.1], [q.x1 - 0.1, q.y1 - 0.1]]) expect(f(x, y), `canto ${tag}`).toBeLessThanOrEqual(0.4);
      for (const [x, y] of [[cx, q.y0 - 0.5], [cx, q.y1 + 0.5], [q.x0 - 0.5, cy], [q.x1 + 0.5, cy]]) expect(f(x, y), `fora ${tag}`).toBeLessThanOrEqual(0.02);
      for (const [xi, yi, xo, yo] of [[cx, q.y0 + 0.25, cx, q.y0 - 0.25], [cx, q.y1 - 0.25, cx, q.y1 + 0.25], [q.x0 + 0.25, cy, q.x0 - 0.25, cy], [q.x1 - 0.25, cy, q.x1 + 0.25, cy]]) { expect(f(xi, yi), `0,25 m para dentro da borda ${tag}`).toBeGreaterThanOrEqual(0.5); expect(f(xo, yo), `0,25 m para fora ${tag}`).toBeLessThanOrEqual(0.5); }
      // Onde a cobertura passa de 0,5 ao longo do lado de cima, de dentro para fora: a borda torta.
      const edge: number[] = [];
      for (let x = q.x0 + 0.6; x <= q.x1 - 0.6; x += 0.05) { let y = cy; while (y > q.y0 - 0.6 && f(x, y) > 0.5) y -= 0.01; edge.push(y); }
      expect(std(edge), `desvio da borda de cima ${tag}`).toBeGreaterThanOrEqual(0.03);
    }
  });

  it('junta suave: a faixa escura da junta tem ≥ 6 px de largura (a de antes tinha 2) e fator ≥ 0,75 (nunca uma linha preta) — a luma média da faixa limpa contra a de 0,45 m dela', () => {
    for (const s of ['coast', 'desert'] as const) {
      const im = img(s); const [a, b] = CLEAN[1];
      const lane = (y: number): number => { let t = 0; let n = 0; for (let x = col(a); x <= col(b); x++) { t += Lx(im, x, y); n++; } return t / n; };
      for (const j of RT.ASPHALT_WEAR.joints) {
        const off = (lane(row(j - 0.45)) + lane(row(j + 0.45))) / 2;
        let wide = 0; let min = 1;
        for (let y = row(j) - 24; y <= row(j) + 24; y++) { const r = lane(y) / off; if (r < 0.97) wide++; min = Math.min(min, r); }
        expect(wide, `${s}: junta em ${j} m, linhas abaixo de 0,97`).toBeGreaterThanOrEqual(6);
        expect(min, `${s}: junta em ${j} m, o ponto mais escuro`).toBeGreaterThanOrEqual(0.75);
      }
    }
  });

  it('duas escalas de mancha (desvio relativo à luma média): os blocos de 6 m ≥ 6%, os de 1,5 m ≥ 7,5% (antes 3,4–4,1% e 4,3–5,1%) e o grão de 0,2 m entre 4,3% e 12% (antes 3,3–3,9%), no asfalto e nos 3 biomas de terra', () => {
    const bad: string[] = [];
    for (const s of ['coast', 'desert', 'tropical', 'savanna'] as const) {
      const im = img(s);
      const b6 = blocks(im, 6).map((q) => q.l); const mean = b6.reduce((a, b) => a + b, 0) / b6.length;
      const a = std(b6) / mean; const b = std(blocks(im, 1.5).map((q) => q.l)) / mean;
      let s2 = 0; let n = 0;
      for (const [c0, c1] of CLEAN) for (let y = 40; y < H - 40; y += 7) for (let x = col(c0); x < col(c1) - 35; x += 7) {
        let l7 = 0; for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) l7 += Lx(im, x + dx, y + dy);
        let l35 = 0; let c = 0; for (let dy = -14; dy < 21; dy += 3) for (let dx = -14; dx < 21; dx += 3) { l35 += Lx(im, x + dx, y + dy); c++; }
        s2 += (l7 / 49 - l35 / c) ** 2; n++;
      }
      const f = Math.sqrt(s2 / n) / mean;
      if (a < 0.06) bad.push(`${s}: 6 m ${(a * 100).toFixed(1)}%`);
      if (b < 0.075) bad.push(`${s}: 1,5 m ${(b * 100).toFixed(1)}%`);
      if (f < 0.043 || f > 0.12) bad.push(`${s}: 0,2 m ${(f * 100).toFixed(1)}%`);
    }
    expect(bad).toEqual([]);
  });

  it('variação de matiz na terra: o desvio do matiz dos blocos de 6 m ≥ 3° (antes 0,7° a 2,1°) e a amplitude ≤ 20° (a estrada não vira arco-íris)', () => {
    const bad: string[] = [];
    for (const s of EARTH) {
      const h = blocks(img(s), 6).map((q) => q.hue);
      const mean = h.reduce((a, b) => a + b, 0) / h.length;
      const dev = h.map((v) => { let d = v - mean; if (d > 180) d -= 360; if (d < -180) d += 360; return d; });
      if (std(dev) < 3) bad.push(`${s}: desvio ${std(dev).toFixed(2)}°`);
      if (Math.max(...dev) - Math.min(...dev) > 20) bad.push(`${s}: amplitude ${(Math.max(...dev) - Math.min(...dev)).toFixed(1)}°`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * Fração dos pixels da pista (fora das faixas de bordo e do tracejado) onde passa uma LINHA ESCURA comprida: na luma suavizada 3×3, o pixel é ≥ 10% mais escuro que o par de
   * linhas paralelas a 4 px dele, numa média de 17 amostras (49 px) ao longo de uma de 8 direções. As rachaduras em polígonos da terra, os contornos dos remendos, a junta e a
   * trinca acendem isto; grão, manchas, trilhas e seixos, não.
   */
  function lineFraction(im: Img): number {
    const Lm = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) Lm[y * W + x] = Lx(im, x, y);
    const B = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let t = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) t += Lm[((y + dy + H) % H) * W + Math.min(W - 1, Math.max(0, x + dx))]; B[y * W + x] = t / 9; }
    const A = (x: number, y: number): number => B[(((y % H) + H) % H) * W + Math.min(W - 1, Math.max(0, x))];
    const dirs: Array<[number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1], [2, 1], [1, 2], [2, -1], [1, -2]];
    let hit = 0; let tot = 0;
    for (let y = 0; y < H; y += 2) for (let x = col(-6); x < col(6); x += 2) {
      if (Math.abs(x - W / 2) < (0.5 * W) / ROAD_M) continue;
      let best = 0;
      for (const [dx, dy] of dirs) {
        const n = Math.hypot(dx, dy); const px = -dy / n; const py = dx / n;
        let line = 0; let side = 0; let c = 0;
        for (let k = -24; k <= 24; k += 3) { line += A(Math.round(x + (dx * k) / n), Math.round(y + (dy * k) / n)); for (const sg of [-4, 4]) side += A(Math.round(x + (dx * k) / n + px * sg), Math.round(y + (dy * k) / n + py * sg)); c++; }
        line /= c; side /= 2 * c; best = Math.max(best, (side - line) / Math.max(0.05, side));
      }
      if (best > 0.1) hit++;
      tot++;
    }
    return hit / tot;
  }

  it('sem rede de linhas escuras: ≤ 0,4% dos pixels da pista (terra e asfalto; antes 1,1% a 1,8%: os hexágonos do Voronoi, os contornos dos remendos, a junta de 1 texel)', () => {
    const bad: string[] = [];
    for (const s of ['coast', 'desert', 'tropical'] as const) {
      const f = lineFraction(img(s));
      if (f > 0.004) bad.push(`${s}: ${(f * 100).toFixed(2)}% (máx 0,4%)`);
    }
    expect(bad).toEqual([]);
  });

  it('faixa gasta: a tinta da faixa de bordo varia de bloco de 0,5 m a bloco (≥ 8% entre o mais cheio e o mais gasto) e o mais gasto ainda guarda ≥ 70% do contraste do mais cheio', () => {
    for (const s of ['coast', 'desert'] as const) {
      const im = img(s);
      const xc = col(ROAD_M / 2 - RT.MARKINGS.edgeOffsetM - RT.MARKINGS.edgeWidthM / 2);
      const contrast: number[] = [];
      // A referência é o asfalto médio ao lado da faixa (um valor só para a pista toda): contra a luma local, o remendo e a junta moveriam a medida.
      let ref = 0; for (let y = 0; y < H; y++) for (let dx = -3; dx <= 3; dx++) ref += Lx(im, col(5.7) + dx, y); ref /= 7 * H;
      for (let y0 = 0; y0 + 21 <= H; y0 += 21) {
        let line = 0; let n = 0;
        for (let y = y0; y < y0 + 21; y++) { for (let dx = -2; dx <= 2; dx++) line += Lx(im, xc + dx, y); n++; }
        contrast.push(line / (5 * n) - ref);
      }
      const hi = Math.max(...contrast); const lo = Math.min(...contrast);
      expect((hi - lo) / hi, `${s}: variação da tinta`).toBeGreaterThanOrEqual(0.08);
      expect(lo / hi, `${s}: o mais gasto`).toBeGreaterThanOrEqual(0.7);
    }
  });

  // ── o mapa de rugosidade e o de normais (Média e acima; a Baixa não os tem)
  type RoughFn = (earth: number) => Img;
  const roughness = (earth: number): Img => (RT as unknown as { roughnessImage?: RoughFn }).roughnessImage?.(earth) ?? { width: 1, height: 1, data: [0, 0, 0, 255] };
  const normals = (earth: number): Img => (RT as unknown as { normalImage?: RoughFn }).normalImage?.(earth) ?? { width: 1, height: 1, data: [128, 128, 255, 255] };
  const ROUGH_DAY = (RT as unknown as { ROAD_ROUGHNESS?: number }).ROAD_ROUGHNESS ?? 0.9;

  it('rugosidade: o desenho é o mesmo do asfalto (v em 48 m), com trilhas de pneu polidas em 0,5–0,65 e a faixa limpa ≥ 0,85 (rugosidade do material 0,9 × o mapa; a de hoje é 0,9 em tudo)', () => {
    const im = roughness(0); const w = im.width; const h = im.height;
    expect(w, 'largura do mapa (px)').toBeGreaterThanOrEqual(128);
    const at = (m: number, y: number): number => im.data[(y * w + Math.min(w - 1, Math.max(0, Math.floor(((m + ROAD_M / 2) / ROAD_M) * w)))) * 4 + 1] / 255 * ROUGH_DAY; // o three lê o canal G
    const avg = (m0: number, m1: number): number => { let t = 0; let n = 0; for (let y = 0; y < h; y += 2) for (let m = m0; m <= m1; m += 0.05) { t += at(m, y); n++; } return t / n; };
    for (const t of [-4.3, -2.7, 2.7, 4.3]) { const r = avg(t - 0.12, t + 0.12); expect(r, `trilha em ${t} m: ${r.toFixed(3)}`).toBeGreaterThanOrEqual(0.5); expect(r).toBeLessThanOrEqual(0.65); }
    for (const [a, b] of CLEAN) { const r = avg(a, b); expect(r, `faixa limpa ${a}…${b}: ${r.toFixed(3)}`).toBeGreaterThanOrEqual(0.85); }
    expect(avg(5.2, 6.0), 'junto da borda').toBeGreaterThanOrEqual(0.85);
  });

  it('rugosidade: a terra batida polida pela roda é menos lisa que o asfalto (trilha ≥ 0,70) e a aspereza do resto fica ≥ 0,85', () => {
    const im = roughness(1); const w = im.width; const h = im.height;
    const at = (m: number, y: number): number => im.data[(y * w + Math.floor(((m + ROAD_M / 2) / ROAD_M) * w)) * 4 + 1] / 255 * ROUGH_DAY;
    let tr = 0; let n = 0; for (let y = 0; y < h; y += 2) for (let m = 2.58; m <= 2.82; m += 0.05) { tr += at(m, y); n++; }
    expect(tr / n, 'trilha na terra').toBeGreaterThanOrEqual(0.7);
  });

  /** O vetor normal decodificado (x, y, z em −1..1) de cada texel do mapa de normais. */
  function decode(im: Img): { nx: Float32Array; ny: Float32Array; nz: Float32Array } {
    const n = im.width * im.height; const nx = new Float32Array(n); const ny = new Float32Array(n); const nz = new Float32Array(n);
    for (let i = 0; i < n; i++) { nx[i] = (im.data[i * 4] / 255) * 2 - 1; ny[i] = (im.data[i * 4 + 1] / 255) * 2 - 1; nz[i] = (im.data[i * 4 + 2] / 255) * 2 - 1; }
    return { nx, ny, nz };
  }

  it('mapa de normais: relevo sutil (o desvio de nx e ny entre 0,03 e 0,25 no asfalto, z médio ≥ 0,95), maior na terra, e a trilha polida é mais lisa que a faixa limpa', () => {
    const a = normals(0); const e = normals(1);
    expect(a.width, 'o mapa existe (largura)').toBeGreaterThanOrEqual(256);
    const A = decode(a); const E = decode(e);
    const spread = (d: ReturnType<typeof decode>, im: Img, m0: number, m1: number): number => {
      const v: number[] = []; const w = im.width;
      for (let y = 0; y < im.height; y += 2) for (let x = Math.floor(((m0 + ROAD_M / 2) / ROAD_M) * w); x <= Math.floor(((m1 + ROAD_M / 2) / ROAD_M) * w); x += 2) v.push(d.nx[y * w + x], d.ny[y * w + x]);
      return std(v);
    };
    const all = spread(A, a, -5.5, 5.5);
    expect(all, 'asfalto: desvio do relevo').toBeGreaterThanOrEqual(0.03); expect(all).toBeLessThanOrEqual(0.25);
    let z = 0; for (let i = 0; i < A.nz.length; i++) z += A.nz[i]; expect(z / A.nz.length, 'z médio').toBeGreaterThanOrEqual(0.95);
    expect(spread(E, e, -5.5, 5.5), 'terra: relevo maior que o do asfalto').toBeGreaterThan(all * 1.2);
    expect(spread(A, a, 2.6, 2.8), 'trilha').toBeLessThanOrEqual(0.8 * spread(A, a, 0.6, 2.1));
  });

  it('mapa de normais: fecha a repetição de 48 m sem emenda (a última linha é vizinha da primeira como duas linhas quaisquer)', () => {
    const im = normals(0); const w = im.width; const h = im.height;
    const rowDiff = (y0: number, y1: number): number => { let t = 0; for (let x = 0; x < w; x++) for (let c = 0; c < 2; c++) t += Math.abs(im.data[(y0 * w + x) * 4 + c] - im.data[(y1 * w + x) * 4 + c]); return t / (2 * w); };
    let typical = 0; for (let y = 10; y < h - 10; y += 97) typical += rowDiff(y, y + 1); typical /= Math.ceil((h - 20) / 97);
    expect(im.height, 'mapa existe').toBeGreaterThanOrEqual(256);
    expect(rowDiff(h - 1, 0), `emenda ${rowDiff(h - 1, 0).toFixed(1)} × linhas vizinhas ${typical.toFixed(1)}`).toBeLessThanOrEqual(2 * typical + 1);
  });

  it('as duas texturas novas (normais + rugosidade, com mipmap) ocupam ≤ 6 MB de GPU', () => {
    const bytes = (im: Img): number => im.width * im.height * 4 * (4 / 3);
    const mb = (bytes(roughness(0)) + bytes(normals(0))) / 1048576;
    expect(roughness(0).width, 'mapas existem').toBeGreaterThanOrEqual(128);
    expect(mb, `${mb.toFixed(2)} MB`).toBeLessThanOrEqual(6);
  });

  // ── a zebra e o acostamento
  const kerb = (): Img => RT.kerbImage(palette('tropical', 'day')) as Img;

  it('zebra com bisel: a borda de cada bloco vermelho tem um filete claro (≥ 6% acima do miolo do bloco) e a borda de baixo um sombreado (≥ 5% abaixo), com o friso escuro entre eles', () => {
    const im = kerb(); const w = im.width; const hh = im.height;
    const at = (y: number): number => { let t = 0; let n = 0; for (let x = Math.floor(w * 0.4); x < Math.floor(w * 0.6); x++) { const k = (y * w + x) * 4; t += luma(im.data[k], im.data[k + 1], im.data[k + 2]); n++; } return t / n; };
    const mid = (at(Math.floor(hh * 0.18)) + at(Math.floor(hh * 0.3))) / 2;
    // O bloco vermelho vai de 0 a hh/2; o friso (3 px) fica em torno de hh/2 e de 0.
    const hi = Math.max(at(3), at(4), at(5)); const lo = Math.min(at(hh / 2 - 6), at(hh / 2 - 5), at(hh / 2 - 4));
    expect(hi / mid, `filete de cima ${hi.toFixed(3)} × miolo ${mid.toFixed(3)}`).toBeGreaterThanOrEqual(1.06);
    expect(lo / mid, `sombra de baixo ${lo.toFixed(3)} × miolo ${mid.toFixed(3)}`).toBeLessThanOrEqual(0.95);
  });

  it('zebra com borracha: nos blocos brancos a metade de dentro (u 0,12–0,4) é ≥ 10% mais escura que a de fora (u 0,6–0,85), com as marcas do pneu em riscas (não um degradê liso: desvio vertical ≥ 0,02)', () => {
    const im = kerb(); const w = im.width; const hh = im.height;
    const colMean = (u0: number, u1: number, y: number): number => { let t = 0; let n = 0; for (let x = Math.floor(w * u0); x < Math.floor(w * u1); x++) { const k = (y * w + x) * 4; t += luma(im.data[k], im.data[k + 1], im.data[k + 2]); n++; } return t / n; };
    const ys: number[] = []; for (let y = hh / 2 + 8; y < hh - 8; y++) ys.push(y);
    const inner = ys.map((y) => colMean(0.12, 0.4, y)); const outer = ys.map((y) => colMean(0.6, 0.85, y));
    const mi = inner.reduce((a, b) => a + b, 0) / inner.length; const mo = outer.reduce((a, b) => a + b, 0) / outer.length;
    expect(mi / mo, `dentro ${mi.toFixed(3)} × fora ${mo.toFixed(3)}`).toBeLessThanOrEqual(0.9);
    expect(std(inner), 'as marcas ao longo do bloco').toBeGreaterThanOrEqual(0.02);
  });

  it('acostamento: a borda guia → terreno é irregular (o ponto de meia-transição varia ≥ 0,03 em u ao longo da pista; era reto) e termina na cor do chão', () => {
    // O par (acostamento, verge) mais distinto dos 18 períodos, para a transição ser mensurável.
    let best: Palette | null = null; let far = -1;
    for (const s of SCENERIES) for (const t of TIMES_OF_DAY) { const p = palette(s, t); const a = RT.shoulderImage(p) as Img; const k = (Math.floor(a.height / 2) * a.width + Math.floor(a.width * 0.6)) * 4; const v = hexToRgbLocal(p.verge); const d = Math.abs(a.data[k] - v[0]) + Math.abs(a.data[k + 1] - v[1]) + Math.abs(a.data[k + 2] - v[2]); if (d > far) { far = d; best = p; } }
    const im = RT.shoulderImage(best as Palette) as Img; const w = im.width;
    const mid = [0, 1, 2].map((c) => { let t = 0; let n = 0; for (let y = 0; y < im.height; y += 4) for (let x = Math.floor(w * 0.55); x < Math.floor(w * 0.65); x++) { t += im.data[(y * w + x) * 4 + c]; n++; } return t / n; });
    const verge = hexToRgbLocal((best as Palette).verge);
    const axis = [verge[0] - mid[0], verge[1] - mid[1], verge[2] - mid[2]]; const n2 = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2;
    expect(far, `distância acostamento × verge ${far}`).toBeGreaterThanOrEqual(30);
    const cross: number[] = [];
    for (let y0 = 0; y0 + 8 <= im.height; y0 += 8) {
      let found = 1;
      for (let x = Math.floor(w * 0.55); x < w; x++) {
        let t = 0; for (let y = y0; y < y0 + 8; y++) { const k = (y * w + x) * 4; t += ((im.data[k] - mid[0]) * axis[0] + (im.data[k + 1] - mid[1]) * axis[1] + (im.data[k + 2] - mid[2]) * axis[2]) / n2; }
        if (t / 8 >= 0.5) { found = x / w; break; }
      }
      cross.push(found);
    }
    expect(std(cross), `o ponto de meia-transição, em u: ${cross.slice(0, 6).map((v) => v.toFixed(2)).join(' ')}…`).toBeGreaterThanOrEqual(0.03);
  });
});

function hexToRgbLocal(hex: string): [number, number, number] { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
