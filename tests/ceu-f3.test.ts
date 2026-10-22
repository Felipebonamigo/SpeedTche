// V22 · F3 (docs/ondas/V22-f3-ceu.md): céu, nuvens, sol e anéis de horizonte. A parte pura e a de CPU (sem navegador): o atlas de nuvens de 3 → 8 células de cúmulo (+ 2 de
// faixa), a distribuição das células no céu (nenhuma repetida na vista), o gradiente com mais paradas (espelho em JS do GLSL), o brilho do lado do sol de dia (opção A do
// dono: a LUZ não muda), o céu que o carro reflete (IBL) intacto, o ruído de arvoredo e de cume dos anéis. A parte na imagem está em tests/ceu-f3-gl.test.ts.
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { palette, SCENERIES, TIMES_OF_DAY, blendPalette, type Palette } from '../src/render/palette';
import { buildHorizon, ridgeHeight } from '../src/render/horizon';
import { buildRing, RING_FRAG } from '../src/render/terrain';
import { FOREST_FRAG_PARS, forestFragBody, ringFoliage, ringForestAmp } from '../src/render/horizon-rings';
import { SKY_STOP_HP, daylight, skyGradient } from '../src/render/sky-paint';
import { buildClouds, cloudAtlasImage, cloudLayout, CLOUD_ATLAS, CLOUD_FRAG, CLOUD_VERT, SKY_FRAG, Sky, sunSetup } from '../src/render/sky';

const luma = (c: readonly number[]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const rgb = (hex: string): [number, number, number] => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

describe('F3 · atlas de nuvens: 8 cúmulos distintos + 2 faixas, e no máximo +2 MB de textura', () => {
  const a = cloudAtlasImage();
  const { cellW, cellH, cols, cumulus, cells } = CLOUD_ATLAS;
  /** A cobertura (alfa 0..1) da célula, linha 0 em cima. */
  const cellAlpha = (cell: number): Float32Array => {
    const out = new Float32Array(cellW * cellH);
    const ox = (cell % cols) * cellW; const oy = Math.floor(cell / cols) * cellH;
    for (let y = 0; y < cellH; y++) for (let x = 0; x < cellW; x++) out[y * cellW + x] = a.data[((oy + y) * a.width + ox + x) * 4 + 3] / 255;
    return out;
  };

  it('são 10 células (8 cúmulos + 2 faixas) e o atlas ocupa ≤ 4 MiB (a de antes, 1024 × 512, tinha 2 MiB: o aumento fica em 2 MiB)', () => {
    expect(cumulus).toBe(8); expect(cells).toBe(10);
    expect(a.width).toBe(CLOUD_ATLAS.w); expect(a.height).toBe(CLOUD_ATLAS.h);
    expect(a.data.length).toBe(a.width * a.height * 4);
    expect(CLOUD_ATLAS.w * CLOUD_ATLAS.h * 4).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(cols * cellW).toBeLessThanOrEqual(CLOUD_ATLAS.w); expect(Math.ceil(cells / cols) * cellH).toBeLessThanOrEqual(CLOUD_ATLAS.h);
  });

  it('cada célula tem nuvem de verdade (cobertura 8–55%) e margem livre: o alfa some a 3 px das bordas (o mipmap não sangra uma célula na vizinha)', () => {
    for (let c = 0; c < cells; c++) {
      const al = cellAlpha(c);
      let cov = 0; let edge = 0;
      for (let y = 0; y < cellH; y++) for (let x = 0; x < cellW; x++) {
        cov += al[y * cellW + x];
        if (x < 3 || y < 3 || x >= cellW - 3 || y >= cellH - 3) edge = Math.max(edge, al[y * cellW + x]);
      }
      cov /= cellW * cellH;
      expect(cov, `célula ${c}: cobertura`).toBeGreaterThan(c >= cumulus ? 0.05 : 0.08); expect(cov, `célula ${c}: cobertura`).toBeLessThan(0.55);
      expect(edge, `célula ${c}: alfa na borda`).toBeLessThan(0.02);
    }
  });

  it('os 8 cúmulos têm silhuetas diferentes: os 3 de antes são parentes (largos, IoU < 0,86 entre si); todo par com um dos 5 novos tem IoU < 0,65; largura e altura do conjunto variam ≥ 25% da célula', () => {
    const masks = Array.from({ length: cumulus }, (_, c) => cellAlpha(c).map((v) => (v > 0.5 ? 1 : 0)));
    for (let i = 0; i < cumulus; i++) for (let j = i + 1; j < cumulus; j++) {
      let inter = 0; let uni = 0;
      for (let k = 0; k < masks[i].length; k++) { inter += masks[i][k] * masks[j][k]; uni += masks[i][k] + masks[j][k] - masks[i][k] * masks[j][k]; }
      expect(inter / uni, `células ${i} × ${j}`).toBeLessThan(j < 3 ? 0.86 : 0.65);
    }
    const widths: number[] = []; const tops: number[] = [];
    for (const m of masks) {
      let x0: number = cellW; let x1 = 0; let y1 = 0;
      for (let y = 0; y < cellH; y++) for (let x = 0; x < cellW; x++) if (m[y * cellW + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      widths.push((x1 - x0) / cellW); tops.push(y1 / cellH);
    }
    expect(Math.max(...widths) - Math.min(...widths), 'largura').toBeGreaterThanOrEqual(0.25);
    expect(Math.max(...tops) - Math.min(...tops), 'altura').toBeGreaterThanOrEqual(0.25);
  });
});

describe('F3 · cloudLayout: as células espalhadas pelo céu', () => {
  const high = cloudLayout('high');
  const cumulus = high.filter((c) => !c.streak);
  it('36 nuvens na Alta usam ≥ 8 células distintas, nenhuma passa de 35%, e as faixas usam as duas células de faixa (8 e 9)', () => {
    expect(cumulus.length).toBe(36);
    const used = new Map<number, number>();
    for (const c of cumulus) used.set(c.cell, (used.get(c.cell) ?? 0) + 1);
    expect(used.size).toBeGreaterThanOrEqual(8);
    for (const [cell, n] of used) { expect(cell).toBeLessThan(CLOUD_ATLAS.cumulus); expect(n / cumulus.length, `célula ${cell}`).toBeLessThanOrEqual(0.35); }
    const streaks = new Set(high.filter((c) => c.streak).map((c) => c.cell));
    expect([...streaks].sort()).toEqual([8, 9]);
  });

  it('na ordem do azimute, duas nuvens a menos de 4 posições uma da outra (a volta fecha) nunca repetem a célula: o mesmo desenho não aparece duas vezes na vista', () => {
    const sorted = [...cumulus].sort((x, y) => x.az - y.az);
    const n = sorted.length;
    for (let i = 0; i < n; i++) for (let d = 1; d <= 3; d++) expect(sorted[i].cell, `posição ${i} e ${(i + d) % n}`).not.toBe(sorted[(i + d) % n].cell);
  });

  it('a Baixa e a Média continuam sendo subconjunto da Alta (mesma posição e mesma célula) e a Baixa ainda tem ≥ 6 células', () => {
    for (const q of ['low', 'medium'] as const) {
      const sub = cloudLayout(q);
      for (const c of sub) expect(high.some((h) => h.az === c.az && h.el === c.el && h.cell === c.cell && h.flip === c.flip), `${q}: ${c.az}`).toBe(true);
    }
    expect(new Set(cloudLayout('low').filter((c) => !c.streak).map((c) => c.cell)).size).toBeGreaterThanOrEqual(6);
  });

  it('a malha: o retângulo da uv de cada nuvem é o da célula dela, a deriva (paralaxe) vem por vértice e as nuvens baixas e longe andam mais devagar que as altas', () => {
    const g = buildClouds('high');
    const uv = g.getAttribute('uv'); const drift = g.getAttribute('aDrift');
    expect(drift, 'atributo aDrift').toBeDefined();
    const list = cloudLayout('high');
    const rates = new Set<number>();
    list.forEach((cl, i) => {
      const cx = cl.cell % CLOUD_ATLAS.cols; const cy = Math.floor(cl.cell / CLOUD_ATLAS.cols);
      const rows = Math.ceil(CLOUD_ATLAS.cells / CLOUD_ATLAS.cols);
      const u0 = (cx * CLOUD_ATLAS.cellW) / CLOUD_ATLAS.w; const u1 = ((cx + 1) * CLOUD_ATLAS.cellW) / CLOUD_ATLAS.w;
      const v0 = (cy * CLOUD_ATLAS.cellH) / CLOUD_ATLAS.h; const v1 = ((cy + 1) * CLOUD_ATLAS.cellH) / CLOUD_ATLAS.h;
      expect(rows * CLOUD_ATLAS.cellH).toBeLessThanOrEqual(CLOUD_ATLAS.h);
      for (let k = 0; k < 4; k++) {
        const u = uv.getX(i * 4 + k); const v = uv.getY(i * 4 + k);
        expect(u, `nuvem ${i}`).toBeGreaterThanOrEqual(Math.min(u0, u1) - 1e-6); expect(u).toBeLessThanOrEqual(Math.max(u0, u1) + 1e-6);
        expect(v).toBeGreaterThanOrEqual(v0 - 1e-6); expect(v).toBeLessThanOrEqual(v1 + 1e-6);
      }
      const r = drift.getX(i * 4);
      for (let k = 1; k < 4; k++) expect(drift.getX(i * 4 + k), 'a deriva é a mesma nos 4 cantos').toBe(r);
      rates.add(Math.round(r * 1000));
    });
    expect(rates.size, 'taxas de deriva diferentes').toBeGreaterThanOrEqual(3);
    const lowSlow = list.filter((c) => c.el < 8).map((_, i) => drift.getX(i * 4));
    expect(lowSlow.length).toBeGreaterThan(0);
    const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
    const byEl = list.map((c, i) => ({ el: c.el, r: drift.getX(i * 4) }));
    expect(mean(byEl.filter((x) => x.el >= 13).map((x) => x.r))).toBeGreaterThan(mean(byEl.filter((x) => x.el < 6).map((x) => x.r)));
  });

  it('continua barata: ≤ 2.000 triângulos na Alta, 2 por nuvem', () => {
    const g = buildClouds('high'); const idx = g.getIndex();
    expect((idx ? idx.count : 0) / 3).toBe(cloudLayout('high').length * 2);
    expect((idx ? idx.count : 0) / 3).toBeLessThanOrEqual(2000);
  });

  it('o vertex shader gira cada nuvem pela deriva dela (uDrift × aDrift); o fragmento (a pintura) é o de antes, sem dFdx', () => {
    expect(CLOUD_VERT).toMatch(/uDrift/); expect(CLOUD_VERT).toMatch(/aDrift/);
    expect(CLOUD_FRAG).not.toMatch(/dFdx/);
  });
});

describe('F3 · gradiente do céu com mais paradas', () => {
  const day = (sc: (typeof SCENERIES)[number]): Palette => palette(sc, 'day');
  it('≥ 6 paradas, de 0 a 1, estritamente crescentes (o legado tinha 3)', () => {
    expect(SKY_STOP_HP.length).toBeGreaterThanOrEqual(6);
    expect(SKY_STOP_HP[0]).toBe(0); expect(SKY_STOP_HP[SKY_STOP_HP.length - 1]).toBe(1);
    for (let i = 1; i < SKY_STOP_HP.length; i++) expect(SKY_STOP_HP[i]).toBeGreaterThan(SKY_STOP_HP[i - 1]);
  });

  it('de dia o gradiente é monótono (o horizonte é o mais claro, o zênite o mais escuro) e fica em 0..1, nos 6 biomas', () => {
    for (const sc of SCENERIES) {
      const p = day(sc);
      let prev = Infinity;
      for (let k = 0; k <= 200; k++) {
        const hp = k / 200;
        const c = skyGradient(hp, rgb(p.sky[0]), rgb(p.sky[1]), rgb(p.sky[2]), daylight(p.light));
        for (const v of c) { expect(v, `${sc} hp ${hp}`).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
        const l = luma(c);
        expect(l, `${sc}: hp ${hp} mais claro que o anterior`).toBeLessThanOrEqual(prev + 1e-4);
        prev = l;
      }
    }
  });

  it('o entardecer e a noite NÃO mudam: sem luz do dia o gradiente é o de antes (dois smoothsteps), idêntico', () => {
    const ss = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const legacy = (hp: number, t: number[], m: number[], h: number[]): number[] => {
      const a = ss(0, 0.2, hp); const b = ss(0.16, 0.75, hp);
      return [0, 1, 2].map((i) => { const x = h[i] + (m[i] - h[i]) * a; return x + (t[i] - x) * b; });
    };
    for (const sc of SCENERIES) for (const tod of ['dusk', 'night'] as const) {
      const p = palette(sc, tod);
      expect(daylight(p.light), `${sc}:${tod}`).toBe(0);
      for (let k = 0; k <= 50; k++) {
        const hp = k / 50;
        const got = skyGradient(hp, rgb(p.sky[0]), rgb(p.sky[1]), rgb(p.sky[2]), 0);
        const want = legacy(hp, rgb(p.sky[0]), rgb(p.sky[1]), rgb(p.sky[2]));
        for (let i = 0; i < 3; i++) expect(Math.abs(got[i] - want[i]), `${sc}:${tod} hp ${hp}`).toBeLessThan(1e-6);
      }
    }
    expect(daylight(palette('coast', 'day').light)).toBe(1);
  });

  it('a corrida que muda: o gradiente anda contínuo — nenhum canal salta mais de 0,07 (em 0..1, na tela) por passo de 5% da transição, dia → entardecer e entardecer → noite', () => {
    const enc = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
    for (const sc of SCENERIES) for (const [from, to] of [['day', 'dusk'], ['dusk', 'night']] as const) {
      const a = palette(sc, from); const b = palette(sc, to);
      let prev: number[][] | null = null;
      for (let k = 0; k <= 20; k++) {
        const p = blendPalette(a, b, k / 20);
        const cur = [0, 0.03, 0.08, 0.15, 0.3, 0.5, 0.8].map((hp) => skyGradient(hp, rgb(p.sky[0]), rgb(p.sky[1]), rgb(p.sky[2]), daylight(p.light)).map(enc));
        if (prev) cur.forEach((c, j) => c.forEach((v, i) => expect(Math.abs(v - prev![j][i]), `${sc} ${from}→${to} passo ${k} hp#${j} canal ${i}`).toBeLessThanOrEqual(0.07)));
        prev = cur;
      }
    }
  });
});

describe('F3 · brilho do lado do sol de dia (opção A do dono): pinta o céu, NÃO muda a luz', () => {
  it('de dia o sol continua a 34° (não desceu para ~25°) e a luz do sol, a hemisférica e a exposição são as de antes', () => {
    for (const sc of SCENERIES) {
      const p = palette(sc, 'day');
      expect(p.sunEl, sc).toBe(34); expect(p.sunAz, sc).toBe(-42);
      expect(sunSetup('day', sc).dir.y).toBeCloseTo(Math.sin((34 * Math.PI) / 180), 6);
    }
    const c = palette('coast', 'day');
    expect({ sun: c.sunLight, i: c.sunIntensity, hemi: c.hemiSky, hi: c.hemiIntensity, env: c.envIntensity, exp: c.exposure })
      .toEqual({ sun: '#fff0d6', i: 3.3, hemi: '#87bef4', hi: 1.3, env: 0.45, exp: 0.98 });
  });

  it('o disco e o halo de dia são os de antes (tamanho 0,038, halo 7, brilho do horizonte 0,35, disco 4), e a bolha larga existe só de dia (0,12–0,3); o entardecer (a cena que o diagnóstico elogia) e a lua não a levam', () => {
    const d = sunSetup('day', 'coast');
    expect([d.size, d.halo, d.glow, d.disc]).toEqual([0.038, 7, 0.35, 4]);
    expect(d.bloom).toBeGreaterThanOrEqual(0.12); expect(d.bloom).toBeLessThanOrEqual(0.3);
    expect(sunSetup('dusk', 'coast').bloom).toBe(0);
    expect(sunSetup('night', 'coast').bloom).toBe(0);
  });

  it('o shader do domo tem a bolha do sol, os cirros por ruído (sem textura), o dither e o desligador `uPaint`', () => {
    for (const k of ['uBloom', 'uPaint', 'uCirrus', 'skyGradient']) expect(SKY_FRAG, k).toContain(k);
    expect(SKY_FRAG).not.toMatch(/sampler2D/);
    expect(SKY_FRAG.indexOf('uPaint')).toBeLessThan(SKY_FRAG.indexOf('#include <tonemapping_fragment>'));
  });
});

describe('F3 · o céu que o carro reflete (IBL) e a luz não mudam; só uniforme, nada recompila', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  const makeSky = (probe?: (u: Record<string, THREE.IUniform>) => void): Sky => {
    let sky: Sky | null = null;
    vi.spyOn(THREE.PMREMGenerator.prototype, 'fromScene').mockImplementation(() => {
      if (probe && sky) probe((sky as unknown as { dome: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> }).dome.material.uniforms);
      return { texture: new THREE.Texture(), dispose() {} } as unknown as THREE.WebGLRenderTarget;
    });
    sky = new Sky({} as THREE.WebGLRenderer, new THREE.Scene());
    return sky;
  };

  it('enquanto o env map é fotografado `uPaint` é 0 (o carro vê o céu de antes) e volta ao valor depois', () => {
    const seen: number[] = [];
    const sky = makeSky((u) => { seen.push(u.uPaint.value as number); });
    sky.setPalette(palette('coast', 'day'), 'day', 'ibl');
    expect(seen.length).toBeGreaterThan(0);
    for (const v of seen) expect(v).toBe(0);
    const dome = (sky as unknown as { dome: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> }).dome;
    expect(dome.material.uniforms.uPaint.value).toBe(1);
    expect(dome.material.uniforms.uBloom.value).toBeGreaterThan(0.12);
  });

  it('a luz do sol e a hemisférica que o Sky aplica de dia são as da paleta (a opção A não mexe em sunLight nem em exposição)', () => {
    const sky = makeSky(); const p = palette('coast', 'day');
    sky.setPalette(p, 'day', 'luz');
    expect(sky.sun.intensity).toBe(p.sunIntensity);
    expect(sky.sun.color.getHexString()).toBe(new THREE.Color(p.sunLight).getHexString());
    expect(sky.hemi.intensity).toBe(p.hemiIntensity);
  });

  it('a Baixa não paga cirros (uCirrusQ 0), a Média paga 2 oitavas e a Alta/Ultra 3; nenhuma textura nova no domo (só o atlas das nuvens)', () => {
    const sky = makeSky();
    const dome = (sky as unknown as { dome: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> }).dome;
    const q = (k: 'low' | 'medium' | 'high' | 'ultra'): number => { sky.setQuality(k); return dome.material.uniforms.uCirrusQ.value as number; };
    expect([q('low'), q('medium'), q('high'), q('ultra')]).toEqual([0, 1, 2, 2]);
    expect(Object.values(dome.material.uniforms).filter((u) => (u.value as { isTexture?: boolean } | null)?.isTexture).length).toBe(0);
  });

  it('o tempo anda só por uniforme: `update` escreve a deriva das nuvens e dos cirros, e as nuvens não giram mais o objeto', () => {
    const sky = makeSky();
    const g = sky as unknown as { dome: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>; clouds: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> };
    sky.update(0.3, 100);
    const t100 = [g.clouds.material.uniforms.uDrift.value as number, g.dome.material.uniforms.uCirrusT.value as number];
    sky.update(0.3, 200);
    expect(g.clouds.material.uniforms.uDrift.value).toBeGreaterThan(t100[0]);
    expect(g.dome.material.uniforms.uCirrusT.value).toBeGreaterThan(t100[1]);
    expect(g.clouds.rotation.y).toBe(0);
  });
});

describe('F3 · anéis de horizonte: ruído de arvoredo e de cume', () => {
  const pal = palette('tropical', 'day');
  const fog = new THREE.Color(pal.fog);
  const ring = (b: (typeof SCENERIES)[number], layer: number): THREE.BufferGeometry =>
    buildRing(b, layer, [470, 660, 920][layer], [62, 120, 205][layer], new THREE.Color(pal.layers[layer]), fog, pal.layerHaze[layer], null);
  /** A luma de cada vértice da fileira do topo (o 3º vértice de cada 4º triângulo: 12 vértices por coluna, o topo é o 9º). */
  const topRow = (g: THREE.BufferGeometry): number[] => {
    const col = g.getAttribute('color'); const out: number[] = [];
    for (let i = 0; i < col.count / 12; i++) out.push(luma([col.getX(i * 12 + 8), col.getY(i * 12 + 8), col.getZ(i * 12 + 8)]));
    return out;
  };
  const std = (xs: number[]): number => { const m = xs.reduce((s, x) => s + x, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length) / m; };

  it('`ringFoliage` é determinístico, fecha a volta (coluna 0 = coluna N) e fica em 0,8–1,25 (não vira camuflagem)', () => {
    for (const b of SCENERIES) for (let l = 0; l < 3; l++) {
      const n = 300; let lo = Infinity; let hi = -Infinity;
      for (let i = 0; i <= n; i++) {
        const f = ringFoliage(b, l, i, n);
        lo = Math.min(lo, f.shade, f.crest); hi = Math.max(hi, f.shade, f.crest);
        expect(ringFoliage(b, l, i, n)).toEqual(f);
      }
      expect(ringFoliage(b, l, 0, n), `${b} camada ${l}: a volta fecha`).toEqual(ringFoliage(b, l, n, n));
      expect(lo, `${b} ${l}`).toBeGreaterThanOrEqual(0.8); expect(hi, `${b} ${l}`).toBeLessThanOrEqual(1.25);
    }
  });

  it('o topo do anel de mata (trópico, camada 1) varia ao longo da volta ≥ 3% (antes: uma cor só, 0%) e não passa de 14%; tem os mesmos 300 × 4 triângulos', () => {
    const g = ring('tropical', 1);
    const s = std(topRow(g));
    expect(s).toBeGreaterThanOrEqual(0.03); expect(s).toBeLessThanOrEqual(0.14);
    expect(g.getAttribute('position').count / 12).toBe(300);
    const col = g.getAttribute('color');
    for (let i = 0; i < col.count; i++) { expect(Number.isFinite(col.getX(i))).toBe(true); expect(col.getX(i)).toBeGreaterThanOrEqual(0); expect(col.getY(i)).toBeLessThanOrEqual(1.6); }
  });

  it('os biomas de mata, savana e serra levam o ruído nas 3 camadas; o deserto (parede de pedra) e a costa também, mais fraco ao longe (a névoa come o contraste)', () => {
    for (const b of ['tropical', 'savanna', 'alpine', 'coast', 'desert'] as const) for (let l = 0; l < 3; l++) expect(std(topRow(ring(b, l))), `${b} ${l}`).toBeGreaterThanOrEqual(0.015);
    expect(std(topRow(ring('tropical', 2)))).toBeLessThan(std(topRow(ring('tropical', 0))) + 0.001);
  });

  it('o cume é iluminado: o topo da crista fica a ≥ 94% da encosta logo abaixo na média da volta (antes: 90%: a crista era mais escura que a encosta enevoada)', () => {
    const g = ring('tropical', 1); const col = g.getAttribute('color');
    let top = 0; let mid = 0; const n = col.count / 12;
    for (let i = 0; i < n; i++) { top += col.getY(i * 12 + 8); mid += col.getY(i * 12 + 6); }
    expect(top / n).toBeGreaterThan((mid / n) * 0.94);
  });

  it('a cor B (o período seguinte da corrida que muda) leva o mesmo ruído: o horizonte do Rio varia ao longo da volta e é finito', () => {
    const h = buildHorizon('copacabana', palette('coast', 'day'), 'high', palette('coast', 'dusk'));
    expect(h).not.toBeNull();
    const m = h!.children.find((c) => c.name === 'horizon:layer-2') as THREE.Mesh;
    const col = m.geometry.getAttribute('color');
    const cols: number[] = [];
    for (let i = 0; i < col.count / 12; i++) cols.push(luma([col.getX(i * 12 + 8), col.getY(i * 12 + 8), col.getZ(i * 12 + 8)]));
    // só onde há morro: a luma do topo (já sem o fator de encosta) varia em azimutes vizinhos
    expect(cols.length).toBeGreaterThan(20);
    expect(std(cols)).toBeGreaterThan(0.01);
    expect(ridgeHeight(2, 1.0)).toBeGreaterThanOrEqual(0);
  });
});


describe('F3 · anéis de horizonte: arvoredo fino e contorno de copas por fragmento (estável: só espaço do objeto)', () => {
  const pal = palette('tropical', 'day');
  const mk = (b: (typeof SCENERIES)[number], layer: number, snow: THREE.Color | null = null): THREE.BufferGeometry =>
    buildRing(b, layer, [470, 660, 920][layer], [62, 120, 205][layer], new THREE.Color(pal.layers[layer]), new THREE.Color(pal.fog), pal.layerHaze[layer], snow);

  it('o anel leva `aForest` (mancha, contorno, 1 só na crista, ravina de neve), um por vértice, e a crista são exatamente os vértices do topo (2 de 6 por quadrilátero de cima)', () => {
    const g = mk('tropical', 1); const f = g.getAttribute('aForest');
    expect(f, 'atributo aForest').toBeDefined();
    expect(f.count).toBe(g.getAttribute('position').count); expect(f.itemSize).toBe(4);
    let crest = 0;
    for (let i = 0; i < f.count; i++) { const z = f.getZ(i); expect([0, 1]).toContain(z); crest += z; expect(f.getX(i)).toBeLessThanOrEqual(0.2); expect(f.getY(i)).toBeLessThanOrEqual(1); expect(f.getW(i)).toBeLessThanOrEqual(1); }
    expect(crest).toBe(300 * 3); // 3 vértices do topo por coluna (o 3º do triângulo de cima e os 2 do segundo)
  });

  it('a mata leva as duas forças; a camada longe, menos (a névoa e a distância); o deserto leva mancha mas NENHUM contorno; a neve do pico não leva nada', () => {
    const t = [0, 1, 2].map((l) => ringForestAmp('tropical', l));
    expect(t[0].fringe).toBeGreaterThan(t[1].fringe); expect(t[1].fringe).toBeGreaterThan(t[2].fringe);
    expect(t[0].speckle).toBeGreaterThan(t[2].speckle); expect(t[2].fringe).toBeGreaterThan(0);
    expect(ringForestAmp('desert', 0).fringe).toBe(0); expect(ringForestAmp('desert', 0).speckle).toBeGreaterThan(0);
    const g = mk('alpine', 1, new THREE.Color('#ffffff')); const f = g.getAttribute('aForest'); const pos = g.getAttribute('position');
    const full = ringForestAmp('alpine', 1).fringe;
    let lowCrest = 0; let peakCrest = 0;
    for (let i = 0; i < f.count; i++) if (f.getZ(i) === 1) {
      const r = pos.getY(i) / 120; // (a altura do anel 1 em `mk`) a neve vai de 50% a 85% da altura (smoothstep)
      if (r < 0.5) { lowCrest++; expect(f.getY(i), `crista a ${r.toFixed(2)} da altura`).toBeCloseTo(full, 6); }
      if (r > 0.85) { peakCrest++; expect(f.getY(i), `pico a ${r.toFixed(2)}`).toBeCloseTo(0, 6); }
    }
    expect(lowCrest, 'há crista baixa (mata)').toBeGreaterThan(0); expect(peakCrest, 'há pico de neve').toBeGreaterThan(0);
  });

  it('a neve leva ravinas (w): o pico do anel alpino tem w ≥ 0,6 e a mata (sem neve) tem w = 0; o shader sombreia as ravinas em azul, esticadas na vertical', () => {
    const g = mk('alpine', 1, new THREE.Color('#ffffff')); const f = g.getAttribute('aForest'); const pos = g.getAttribute('position');
    let peak = 0; let peakMin = Infinity; let low = 0;
    for (let i = 0; i < f.count; i++) {
      if (f.getZ(i) !== 1) continue; // as cristas (as encostas de baixo de um pico nevado são nevadas também)
      const r = pos.getY(i) / 120;
      if (r > 0.9) { peak++; peakMin = Math.min(peakMin, f.getW(i)); }
      if (r < 0.45) low = Math.max(low, f.getW(i));
    }
    expect(peak).toBeGreaterThan(0); expect(peakMin, 'ravina no pico').toBeGreaterThanOrEqual(0.6); expect(low, 'sem ravina na mata').toBeCloseTo(0, 6);
    const tropical = mk('tropical', 1).getAttribute('aForest');
    for (let i = 0; i < tropical.count; i++) expect(tropical.getW(i)).toBe(0);
    expect(forestFragBody('c')).toMatch(/vForest\.w/);
    expect(forestFragBody('c')).toMatch(/vec3\(0\.8\d?, 0\.9\d?, 1\.0\)/);
  });

  it('o shader: descarta o contorno e mancha a cor, no espaço do OBJETO (vLocal) — nunca em posição de mundo ou de câmera, que faria o arvoredo "nadar"', () => {
    const body = forestFragBody('c');
    expect(body).toMatch(/discard/); expect(body).toMatch(/vLocal/); expect(body).toMatch(/vForest/);
    for (const bad of ['vW', 'cameraPosition', 'gl_FragCoord', 'uTime']) { expect(body, bad).not.toContain(bad); expect(FOREST_FRAG_PARS, bad).not.toContain(bad); }
    expect(RING_FRAG).toContain('forestN'); expect(RING_FRAG).toMatch(/discard/);
  });

  it('o horizonte do Rio leva o mesmo arvoredo: a crista de morro tem aForest, a cúpula do Pão de Açúcar não (o atributo faltando vale 0: nada muda nela)', () => {
    const h = buildHorizon('copacabana', palette('coast', 'day'), 'high');
    const ring = h!.children.find((c) => c.name === 'horizon:layer-1') as THREE.Mesh;
    const f = ring.geometry.getAttribute('aForest');
    expect(f).toBeDefined(); expect(f.count).toBe(ring.geometry.getAttribute('position').count);
    let crest = 0; let withFringe = 0;
    for (let i = 0; i < f.count; i++) { crest += f.getZ(i); if (f.getY(i) > 0) withFringe++; }
    expect(crest).toBeGreaterThan(0); expect(withFringe).toBeGreaterThan(0);
    const pao = h!.children.find((c) => c.name === 'horizon:pao-de-acucar') as THREE.Mesh;
    expect(pao.geometry.getAttribute('aForest')).toBeUndefined();
    // o granito (pedra nua) fica liso: a força é multiplicada por (1 − granito)
    let maxSpeckle = 0;
    for (let i = 0; i < f.count; i++) maxSpeckle = Math.max(maxSpeckle, f.getX(i));
    expect(maxSpeckle).toBeLessThanOrEqual(ringForestAmp('coast', 1).speckle + 1e-9);
  });

  it('o material do Rio remenda o three por âncora (color_fragment) e a chave de programa muda: um programa só, como antes', () => {
    const h = buildHorizon('copacabana', palette('coast', 'day'), 'high')!;
    const m = (h.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: '#include <common>\n#include <color_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
    m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain('forestN'); expect(shader.fragmentShader).toContain('discard');
    expect(shader.vertexShader).toContain('aForest');
    expect(m.customProgramCacheKey()).toContain('forest');
  });
});

describe('F3 · o tempo de espera: nada além do esperado entra no carregamento', () => {
  it('gerar o atlas (10 células) custa < 3 s no Node e é feito uma vez só (cache)', () => {
    const t0 = Date.now();
    const a = cloudAtlasImage(); const b = cloudAtlasImage();
    expect(a).toBe(b);
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(TIMES_OF_DAY.length).toBe(3);
  });
});
