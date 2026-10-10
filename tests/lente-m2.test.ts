// Onda M, M2: o reflexo de lente do entardecer (as 39 pistas desse período) e a folha de contato (34 copas).
// Sem GPU: o que se prova é o LAYOUT puro (onde cada elemento cai na tela, para qualquer posição do sol), quem liga o quê no Sky
// (só no entardecer, Média ou melhor) e a seleção das capturas. Se o reflexo fica bonito é do dono (M2.md §8).
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CUPS } from '../src/core/data/cups';
import { getTrack } from '../src/core/track';
import { palette, SCENERIES, TIMES_OF_DAY } from '../src/render/palette';
import * as S from '../src/render/sky';
import { Sky } from '../src/render/sky';
import { combinacaoShots, copaShots } from '../tools/folha-copas';
import type { Quality } from '../src/game/contracts';
import type { TimeOfDay } from '../src/core/types';

type Quad = { kind: 'veil' | 'streak' | 'ghost'; k: number; x: number; y: number; halfW: number; halfH: number; alpha: number };
const layout = (sun: [number, number], aspect = 16 / 9, inFront = true): Quad[] =>
  (S as unknown as { lensFlareLayout: (s: [number, number], a: number, f?: boolean) => Quad[] }).lensFlareLayout(sun, aspect, inFront);
const fade = (sun: [number, number], inFront = true): number =>
  (S as unknown as { flareFade: (s: [number, number], f: boolean) => number }).flareFade(sun, inFront);

describe('reflexo de lente: o layout em tela (puro)', () => {
  it('todo fantasma cai sobre a reta sol → centro da tela, e há fantasmas dos dois lados do centro', () => {
    for (const sun of [[0.4, 0.3], [-0.6, 0.1], [0.1, -0.5], [0.7, 0.45]] as Array<[number, number]>) {
      const ghosts = layout(sun).filter((q) => q.kind === 'ghost');
      expect(ghosts.length, `sol ${sun}`).toBeGreaterThanOrEqual(5);
      for (const g of ghosts) {
        // produto vetorial com a direção do sol ~ 0: está na reta que passa pelo centro e pelo sol
        expect(Math.abs(g.x * sun[1] - g.y * sun[0]), `sol ${sun} k ${g.k}`).toBeLessThan(1e-9);
        expect(g.x).toBeCloseTo(g.k * sun[0], 9); expect(g.y).toBeCloseTo(g.k * sun[1], 9);
      }
      expect(ghosts.some((g) => g.k > 0), 'um fantasma entre o centro e o sol').toBe(true);
      expect(ghosts.some((g) => g.k < 0), 'um fantasma do outro lado do centro').toBe(true);
    }
  });

  it('o véu e a faixa ficam em cima do sol; a faixa é fina e larga; os tamanhos respeitam a proporção da tela', () => {
    const sun: [number, number] = [0.35, 0.2];
    const q = layout(sun, 2);
    const veil = q.find((e) => e.kind === 'veil'); const streak = q.find((e) => e.kind === 'streak');
    expect(veil && streak, 'véu e faixa existem').toBeTruthy();
    for (const e of [veil, streak]) { expect(e?.x).toBeCloseTo(sun[0], 9); expect(e?.y).toBeCloseTo(sun[1], 9); }
    expect(streak!.halfW).toBeGreaterThan(streak!.halfH * 8);
    for (const e of q) { expect(e.halfW * 2, e.kind).toBeCloseTo(e.halfH, 9); } // largura em NDC = altura / proporção: o disco sai redondo (aspecto 2)
  });

  it('some quando o sol sai da tela ou fica atrás da câmera, e cresce rumo ao centro', () => {
    expect(fade([0, 0], true)).toBeCloseTo(1, 9);
    expect(fade([0.5, 0.2], true)).toBeGreaterThan(0.9);
    expect(fade([1.3, 0], true)).toBe(0);
    expect(fade([0, 1.4], true)).toBe(0);
    expect(fade([0.2, 0.1], false)).toBe(0);
    let prev = 1.0001;
    for (let r = 0; r <= 1.5; r += 0.05) { const f = fade([r, 0], true); expect(f, `r ${r}`).toBeLessThanOrEqual(prev); prev = f; }
    expect(layout([2, 2]).every((q) => q.alpha === 0)).toBe(true);
    expect(layout([0.2, 0.1], 16 / 9, false).every((q) => q.alpha === 0)).toBe(true);
  });

  it('a soma das intensidades no centro não vira clarão (≤ 1,2), e nada tem alfa negativo ou NaN', () => {
    for (const sun of [[0, 0], [0.3, 0.2], [0.8, 0.5]] as Array<[number, number]>) {
      const q = layout(sun);
      const sum = q.reduce((a, e) => a + e.alpha, 0);
      expect(sum, `sol ${sun}`).toBeLessThanOrEqual(1.2);
      for (const e of q) { expect(Number.isFinite(e.alpha) && e.alpha >= 0, `${e.kind} ${e.k}`).toBe(true); expect(Number.isFinite(e.x + e.y + e.halfW + e.halfH)).toBe(true); }
    }
  });
});

describe('reflexo de lente no Sky', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  const makeSky = (): Sky => {
    vi.spyOn(THREE.PMREMGenerator.prototype, 'fromScene').mockReturnValue({ texture: new THREE.Texture(), dispose() {} } as unknown as THREE.WebGLRenderTarget);
    return new Sky({} as THREE.WebGLRenderer, new THREE.Scene());
  };
  const flareOf = (sky: Sky): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> => (sky as unknown as { flare: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> }).flare;
  let n = 0;
  const pal = (sky: Sky, scenery: (typeof SCENERIES)[number], t: TimeOfDay): void => sky.setPalette(palette(scenery, t), t, `lente:${scenery}:${t}:${n++}`);

  it('é uma malha só (1 chamada), aditiva, sem escrita de profundidade, com a gradação, e vive no grupo do céu', () => {
    const sky = makeSky();
    const f = flareOf(sky);
    expect(f, 'sky.flare não existe').toBeDefined();
    expect(f.material.transparent).toBe(true);
    expect(f.material.blending).toBe(THREE.AdditiveBlending);
    expect(f.material.depthWrite).toBe(false);
    expect(f.frustumCulled).toBe(false);
    for (const k of ['uGradeShadows', 'uGradeHighlights', 'uGradeAdjust']) expect(f.material.uniforms, k).toHaveProperty(k);
    expect(f.parent).toBe(sky.group);
    expect(f.geometry.getAttribute('position')).toBeDefined();
  });

  it('só liga no entardecer e na Média ou melhor; de dia, à noite e na Baixa fica desligado; trocar a paleta liga e desliga', () => {
    const sky = makeSky();
    const f = flareOf(sky);
    const on = (q: Quality): boolean => { sky.setQuality(q); pal(sky, 'coast', 'dusk'); const v = f.visible; return v; };
    expect(on('medium')).toBe(true);
    expect(on('high')).toBe(true);
    expect(on('ultra')).toBe(true);
    expect(on('low')).toBe(false);
    sky.setQuality('high');
    for (const s of SCENERIES) {
      pal(sky, s, 'day'); expect(f.visible, `${s} dia`).toBe(false);
      pal(sky, s, 'dusk'); expect(f.visible, `${s} entardecer`).toBe(true);
      pal(sky, s, 'night'); expect(f.visible, `${s} noite`).toBe(false);
    }
    // a qualidade depois da paleta também vale
    pal(sky, 'tropical', 'dusk'); sky.setQuality('low'); expect(f.visible).toBe(false); sky.setQuality('medium'); expect(f.visible).toBe(true);
  });

  it('o jogador pode desligar (Reduzir efeitos): setFlare(false) apaga mesmo no entardecer, e setFlare(true) volta', () => {
    const sky = makeSky();
    const f = flareOf(sky);
    sky.setQuality('high'); pal(sky, 'savanna', 'dusk');
    expect(f.visible).toBe(true);
    (sky as unknown as { setFlare: (on: boolean) => void }).setFlare(false);
    expect(f.visible).toBe(false);
    pal(sky, 'coast', 'dusk'); expect(f.visible, 'trocar de pista não religa sozinho').toBe(false);
    (sky as unknown as { setFlare: (on: boolean) => void }).setFlare(true);
    expect(f.visible).toBe(true);
  });

  it('a cor e a força do reflexo vêm da paleta do bioma', () => {
    const sky = makeSky();
    const f = flareOf(sky);
    sky.setQuality('high');
    const seen = new Set<string>();
    for (const s of SCENERIES) {
      pal(sky, s, 'dusk');
      const p = palette(s, 'dusk');
      expect(f.material.uniforms.uStrength.value, s).toBeCloseTo(p.flare, 9);
      expect('#' + (f.material.uniforms.uColor.value as THREE.Color).getHexString(), s).toBe('#' + new THREE.Color(p.flareColor).getHexString());
      seen.add(p.flareColor);
    }
    expect(seen.size, 'o reflexo de cada bioma tem a sua cor').toBeGreaterThanOrEqual(4);
  });
});

describe('folha de contato', () => {
  it('34 capturas, uma por copa, na pista e no período dela, num segmento que existe', () => {
    const shots = copaShots();
    expect(CUPS).toHaveLength(34);
    expect(shots).toHaveLength(34);
    expect(new Set(shots.map((s) => s.cup)).size).toBe(34);
    expect(new Set(shots.map((s) => s.name)).size, 'nomes de arquivo únicos').toBe(34);
    for (const s of shots) {
      const cup = CUPS.find((c) => c.id === s.cup);
      expect(cup, s.cup).toBeDefined();
      expect(cup!.trackIds, s.cup).toContain(s.track);
      const t = getTrack(s.track);
      expect(s.seg, s.name).toBeGreaterThanOrEqual(0); expect(s.seg, s.name).toBeLessThan(t.segments.length);
      expect(s.tod).toBe(t.def.timeOfDay);
      expect(s.name).toMatch(/^[a-z0-9_-]+$/);
    }
  });

  it('as 18 combinações bioma × período, cada uma com uma pista do bioma e o período forçado', () => {
    const shots = combinacaoShots();
    expect(shots).toHaveLength(18);
    expect(new Set(shots.map((s) => `${s.scenery}:${s.tod}`)).size).toBe(18);
    for (const s of shots) {
      expect(getTrack(s.track).def.scenery, s.name).toBe(s.scenery);
      expect(TIMES_OF_DAY).toContain(s.tod);
      expect(SCENERIES).toContain(s.scenery);
    }
  });
});
