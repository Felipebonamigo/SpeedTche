// V22 · F7 (docs/ondas/V22-f7-nevoa.md), a parte PURA: a névoa atmosférica (altura e lado do sol no chunk `fog_fragment` global), a vinheta e o dither do OutputPass (um dither só), o chão
// com 3 tons e a noite com o matiz separado entre chão, pista e prédio. O que se mede na IMAGEM (saturação do chão, vinheta no canto, planos pálidos) é `nevoa-f7-gl.test.ts`.
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRACKS } from '../src/core/track/tracks';
import { QUALITY_ORDER } from '../src/game/quality';
import {
  ATMOS_AMOUNT, ATMOS_ONSET, atmosphereLook, fogFraction, installAtmosphere, patchFogFragment, patchFogParsFragment, patchFogParsVertex, patchFogVertex,
} from '../src/render/atmosphere';
import { blendPalette, palette, PALETTE_KEYS, PALETTE_TABLE, SCENERIES, type Palette } from '../src/render/palette';
import { patchOutputFragment, vignetteAt, VIGNETTE_MAX } from '../src/render/postfx/pipeline';
import { planFor } from '../src/render/postfx/plan';
import { FOG_DENSITY, Sky } from '../src/render/sky';
import { gradeUniforms, setFogView, setStylizePalette, worldLook } from '../src/render/stylize';
import { OutputShader } from 'three/examples/jsm/shaders/OutputShader.js';

const COMBOS = [...new Set(TRACKS.map((t) => `${t.scenery}:${t.timeOfDay}`))].map((k) => {
  const [scenery, time] = k.split(':') as [typeof TRACKS[number]['scenery'], typeof TRACKS[number]['timeOfDay']];
  return { key: k, scenery, time };
});

const rho = (q: 'high' | 'ultra', c: { scenery: typeof COMBOS[number]['scenery']; time: typeof COMBOS[number]['time'] }): number => FOG_DENSITY[q] * palette(c.scenery, c.time).fogDensity;

describe('F7 · o remendo dos chunks de névoa do three (falha alto se o three mudar)', () => {
  const c = THREE.ShaderChunk;
  it('cada chunk ganha a posição de vista, a função da atmosfera e a mistura nova; a conta do FogExp2 do three continua lá', () => {
    expect(patchFogParsVertex(c.fog_pars_vertex)).toContain('varying vec3 vFogRay;');
    expect(patchFogVertex(c.fog_vertex)).toContain('vFogRay = mvPosition.xyz;');
    const pars = patchFogParsFragment(c.fog_pars_fragment);
    expect(pars).toContain('varying vec3 vFogRay;'); expect(pars).toContain('void stylizeAtmosphere(');
    const frag = patchFogFragment(c.fog_fragment);
    expect(frag).toContain('stylizeAtmosphere( fogFactor, stylizeFogCol, vFogRay, vFogDepth );');
    expect(frag).toContain('float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );'); // a base é a do three (o sight.ts a inverte)
  });

  it('âncora que sumiu = erro claro, nunca um remendo calado que não pega', () => {
    expect(() => patchFogParsVertex('nada')).toThrow(/fog_pars_vertex/);
    expect(() => patchFogVertex('nada')).toThrow(/fog_vertex/);
    expect(() => patchFogParsFragment('nada')).toThrow(/fog_pars_fragment/);
    expect(() => patchFogFragment('nada')).toThrow(/fog_fragment/);
  });

  it('installAtmosphere remenda os quatro chunks globais uma vez e é idempotente', () => {
    const before = { ...c };
    try {
      installAtmosphere(); installAtmosphere();
      expect(c.fog_fragment.split('stylizeAtmosphere(').length - 1).toBe(1);
      expect(c.fog_pars_fragment.split('void stylizeAtmosphere(').length - 1).toBe(1);
      expect(c.fog_vertex.split('vFogRay = ').length - 1).toBe(1);
    } finally { Object.assign(c, before); }
  });
});

describe('F7 · a névoa em números (a mesma conta do GLSL)', () => {
  it('a 300 m a névoa tira ≥ 40% da cor na Alta e no Ultra, em todo bioma e período (era 28%: FogExp2 sozinho)', () => {
    for (const q of ['high', 'ultra'] as const) {
      for (const c of COMBOS) {
        const f = fogFraction(rho(q, c), 300);
        expect(f, `${q} ${c.key}`).toBeGreaterThanOrEqual(0.4);
        expect(f, `${q} ${c.key} não vira parede`).toBeLessThanOrEqual(0.8);
      }
    }
  });

  it('continua perto de 0 até ~80 m (a bíblia §4): < 5% a 80 m e EXATAMENTE a do FogExp2 até o começo da bruma extra', () => {
    for (const q of ['high', 'ultra'] as const) {
      for (const c of COMBOS) {
        expect(fogFraction(rho(q, c), 80), `${q} ${c.key}`).toBeLessThan(0.05);
        const base = 1 - Math.exp(-(rho(q, c) ** 2) * ATMOS_ONSET ** 2);
        expect(fogFraction(rho(q, c), ATMOS_ONSET)).toBeCloseTo(base, 12);
        expect(fogFraction(rho(q, c), 40)).toBeCloseTo(1 - Math.exp(-(rho(q, c) ** 2) * 40 ** 2), 12);
      }
    }
  });

  it('só soma ao FogExp2 (nunca o tira), cresce com a distância e a Baixa continua mais densa que a Alta', () => {
    for (const c of COMBOS) {
      let prev = 0;
      for (let d = 0; d <= 1200; d += 20) {
        const f = fogFraction(rho('high', c), d);
        expect(f).toBeGreaterThanOrEqual(1 - Math.exp(-(rho('high', c) ** 2) * d * d) - 1e-12);
        expect(f).toBeGreaterThanOrEqual(prev - 1e-12);
        expect(f).toBeLessThanOrEqual(1);
        prev = f;
      }
    }
    const order = QUALITY_ORDER.map((q) => fogFraction(FOG_DENSITY[q], 300));
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeLessThanOrEqual(order[i - 1] + 1e-12);
  });

  it('altura: o vale (abaixo da câmera) pega mais bruma que o cume, na mesma distância; no nível da câmera é o da conta base; amount 0 = FogExp2 puro', () => {
    const r = FOG_DENSITY.high;
    expect(fogFraction(r, 300, -30)).toBeGreaterThan(fogFraction(r, 300, 0) + 0.03);
    expect(fogFraction(r, 300, 0)).toBeGreaterThan(fogFraction(r, 300, 30) + 0.03);
    expect(fogFraction(r, 300, 400)).toBeGreaterThan(1 - Math.exp(-(r * r) * 300 * 300) - 1e-12); // mesmo muito acima, nunca tira a névoa de base
    expect(fogFraction(r, 300, 0, 0)).toBeCloseTo(1 - Math.exp(-(r * r) * 300 * 300), 12);
  });
});

describe('F7 · o tom da névoa por lado do sol e os uniformes', () => {
  it('as 18 paletas dão pesos finitos e o brilho do período; o entardecer pesa mais que o dia no az³ (a mesma conta do horizonte do domo)', () => {
    for (const k of PALETTE_KEYS) {
      const a = atmosphereLook(PALETTE_TABLE[k]);
      for (const v of [a.amount, ...a.base, ...a.sun, ...a.mix]) expect(Number.isFinite(v), k).toBe(true);
      expect(a.amount).toBeCloseTo(ATMOS_AMOUNT, 9);
    }
    const day = atmosphereLook(palette('coast', 'day')); const dusk = atmosphereLook(palette('coast', 'dusk')); const night = atmosphereLook(palette('coast', 'night'));
    expect(dusk.mix[0]).toBeGreaterThan(day.mix[0] + 0.3); expect(dusk.mix[1]).toBe(0); expect(night.mix[1]).toBe(0); expect(night.mix[2]).toBe(0);
    expect(day.mix[1]).toBeGreaterThan(0.1); expect(day.mix[2]).toBeGreaterThan(0.5);
  });

  it('setStylizePalette entrega os uniformes e o setFogView põe o "para cima" e o sol horizontal no espaço de vista da câmera', () => {
    setStylizePalette(palette('tropical', 'day'));
    expect((gradeUniforms as unknown as Record<string, { value: number }>).uFogAmt.value).toBeCloseTo(ATMOS_AMOUNT, 9);
    const cam = new THREE.PerspectiveCamera(54, 16 / 9, 0.1, 4000);
    cam.position.set(0, 4, 0); cam.rotation.y = Math.PI / 2; // olhando para −x; o sol em −x fica "à frente"
    cam.updateMatrixWorld(true);
    setFogView(cam, new THREE.Vector3(-1, 0.5, 0).normalize());
    const g = gradeUniforms as unknown as Record<string, { value: THREE.Vector3 }>;
    expect(g.uFogUp.value.y).toBeCloseTo(1, 6); // câmera sem inclinação: o "para cima" de vista é +y
    expect(g.uFogSunH.value.length()).toBeCloseTo(1, 6); // horizontal e unitário
    expect(g.uFogSunH.value.z).toBeLessThan(-0.99); // à frente da câmera = −z de vista
    expect(g.uFogSunH.value.dot(g.uFogUp.value)).toBeCloseTo(0, 6);
    cam.rotation.y = -Math.PI / 2; cam.updateMatrixWorld(true); // de costas para o sol
    setFogView(cam, new THREE.Vector3(-1, 0.5, 0).normalize());
    expect(g.uFogSunH.value.z).toBeGreaterThan(0.99);
  });

  it('na corrida que muda os uniformes andam contínuos: nenhum canal (cores em sRGB) salta mais que 0,07 por passo de 5% da transição, dia → entardecer e entardecer → noite', () => {
    const srgb = (c: readonly number[]): number[] => { const k = new THREE.Color(c[0], c[1], c[2]).convertLinearToSRGB(); return [k.r, k.g, k.b]; };
    for (const sc of SCENERIES) {
      for (const [from, to] of [['day', 'dusk'], ['dusk', 'night']] as const) {
        let prev: number[] | null = null;
        for (let i = 0; i <= 20; i++) {
          const a = atmosphereLook(blendPalette(palette(sc, from), palette(sc, to), i / 20));
          const v = [a.amount, ...srgb(a.base), ...srgb(a.sun), ...a.mix];
          if (prev) v.forEach((x, j) => expect(Math.abs(x - prev![j]), `${sc} ${from}→${to} passo ${i} canal ${j}`).toBeLessThanOrEqual(0.07));
          prev = v;
        }
      }
    }
  });
});

describe('F7 · vinheta e dither no OutputPass (0 passe; um dither só)', () => {
  const frag = OutputShader.fragmentShader;
  it('o remendo põe a vinheta e o dither entre o tone mapping e a conversão de cor, e falha alto se o three mudar', () => {
    const out = patchOutputFragment(frag);
    const iTone = out.indexOf('CustomToneMapping( gl_FragColor.rgb )'); const iVig = out.indexOf('gl_FragColor.rgb *= vv * vv'); const iColor = out.indexOf('sRGBTransferOETF( gl_FragColor )');
    expect(iTone).toBeGreaterThan(-1); expect(iVig).toBeGreaterThan(iTone); expect(iColor).toBeGreaterThan(iVig);
    expect(out).toContain('stylizeDither(');
    expect(() => patchOutputFragment('nada')).toThrow(/OutputShader/);
  });

  it('a vinheta é 0 no miolo (até 45% do raio), cresce sem degrau e vale ≤ 12% no canto', () => {
    expect(VIGNETTE_MAX).toBeLessThanOrEqual(0.12);
    expect(vignetteAt(0)).toBe(0);
    expect(vignetteAt(0.45)).toBe(0);
    expect(vignetteAt(1)).toBeCloseTo(VIGNETTE_MAX, 9);
    let prev = 0;
    for (let r = 0; r <= 1.0001; r += 0.01) { const v = vignetteAt(r); expect(v).toBeGreaterThanOrEqual(prev - 1e-12); expect(v - prev).toBeLessThan(0.01); prev = v; }
    expect(vignetteAt(5)).toBeCloseTo(VIGNETTE_MAX, 9);
  });

  it('o plano: a Baixa não tem OutputPass (sem vinheta); da Média em diante a vinheta existe e é mais leve com mais jogadores (os cantos de dentro se encontram no meio da tela)', () => {
    for (const n of [1, 2, 3, 4]) expect(planFor('low', n).vignette, `baixa ${n}p`).toBe(0);
    for (const q of ['medium', 'high', 'ultra'] as const) {
      const v = [1, 2, 3, 4].map((n) => planFor(q, n).vignette);
      expect(v[0]).toBeGreaterThan(0); expect(v[0]).toBeLessThanOrEqual(VIGNETTE_MAX);
      for (let i = 1; i < v.length; i++) expect(v[i]).toBeLessThanOrEqual(v[i - 1]);
      expect(v[3]).toBeLessThan(v[0]);
    }
  });

  describe('um dither só', () => {
    afterEach(() => { vi.restoreAllMocks(); });
    it('o domo só dá o grão do dither quando NÃO há OutputPass (Baixa); da Média em diante o OutputPass o dá, em todo pixel, e o céu não leva o seu', () => {
      vi.spyOn(THREE.PMREMGenerator.prototype, 'fromScene').mockReturnValue({ texture: new THREE.Texture(), dispose() {} } as unknown as THREE.WebGLRenderTarget);
      const sky = new Sky({} as THREE.WebGLRenderer, new THREE.Scene());
      const u = (sky as unknown as { dome: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> }).dome.material.uniforms;
      for (const q of ['low', 'medium', 'high', 'ultra'] as const) {
        sky.setQuality(q);
        expect(u.uDither.value, q).toBe(q === 'low' ? 1 : 0);
      }
    });
    it('a função do dither é uma só (stylize.ts) e os dois shaders a chamam, nenhum tem hash própria do grão', async () => {
      const { SKY_FRAG } = await import('../src/render/sky');
      const { DITHER_GLSL } = await import('../src/render/stylize');
      expect(DITHER_GLSL).toContain('vec3 stylizeDither(');
      expect(SKY_FRAG).toContain('stylizeDither(');
      expect(SKY_FRAG).not.toContain('lsb *'); // o dither de 1 LSB inline da F3 saiu daqui
      expect(patchOutputFragment(frag)).toContain('stylizeDither(');
    });
  });
});

/** Matiz (°) de uma cor #rrggbb. */
function hue(hex: string): number {
  const c = new THREE.Color(hex).convertLinearToSRGB();
  const [r, g, b] = [c.r, c.g, c.b]; const mx = Math.max(r, g, b); const d = mx - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const hueGap = (a: number, b: number): number => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
const hsvOf = (hex: string): { s: number; v: number } => { const c = new THREE.Color(hex).convertLinearToSRGB(); const mx = Math.max(c.r, c.g, c.b); return { s: mx === 0 ? 0 : (mx - Math.min(c.r, c.g, c.b)) / mx, v: mx }; };

describe('F7 · o chão com 3 tons por bioma (claro quente, médio, escuro frio)', () => {
  const GRASS: Array<[typeof SCENERIES[number], 'day' | 'dusk']> = SCENERIES.filter((s) => s !== 'city_night' && s !== 'desert').flatMap((s) => [[s, 'day'], [s, 'dusk']] as Array<[typeof SCENERIES[number], 'day' | 'dusk']>);
  it('toda paleta tem `groundWarm` e `groundCool` (hex)', () => {
    for (const k of PALETTE_KEYS) {
      const p = PALETTE_TABLE[k] as Palette & { groundWarm?: string; groundCool?: string };
      expect(p.groundWarm, k).toMatch(/^#[0-9a-f]{6}$/); expect(p.groundCool, k).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('de dia o tom quente é mais claro e mais amarelo que o médio, o frio mais escuro e mais azul-esmeralda: a deriva de matiz entre os dois é ≥ 12° e o médio fica no meio', () => {
    for (const [sc] of GRASS.filter(([, t]) => t === 'day')) {
      const p = palette(sc, 'day') as Palette & { groundWarm: string; groundCool: string };
      expect(hsvOf(p.groundWarm).v, `${sc} quente mais claro`).toBeGreaterThan(hsvOf(p.groundLow).v);
      expect(hsvOf(p.groundCool).v, `${sc} frio mais escuro`).toBeLessThan(hsvOf(p.groundHigh).v + 1e-9);
      expect(hueGap(hue(p.groundWarm), hue(p.groundCool)), `${sc} deriva de matiz`).toBeGreaterThanOrEqual(12);
      // o quente anda para o amarelo (matiz cai) e o frio para o verde-azulado (matiz sobe), a partir do médio
      expect(hue(p.groundWarm)).toBeLessThan(hue(p.groundLow) - 4);
      expect(hue(p.groundCool)).toBeGreaterThan(hue(p.groundHigh) + 4);
    }
  });

  it('a saturação do chão desce para a faixa 0,70–0,80 (HSV do tom médio, antes do tone mapping; o céu, o carro e a HUD ficam no teto): ≤ 0,80 nos tons de capim', () => {
    for (const [sc] of GRASS.filter(([, t]) => t === 'day')) {
      const p = palette(sc, 'day') as Palette & { groundWarm: string; groundCool: string };
      for (const hex of [p.groundLow, p.groundHigh, p.groundWarm, p.groundCool]) expect(hsvOf(hex).s, `${sc} ${hex}`).toBeLessThanOrEqual(0.8);
    }
  });
});

describe('F7 · a noite com o matiz separado entre chão, pista e prédio (≥ 20°)', () => {
  it('em todo bioma, o chão, a pista e o tom do prédio (worldLook) estão a ≥ 20° um do outro', () => {
    const building = hue(`#${new THREE.Color().setRGB(...worldLook(0.32).tone, THREE.LinearSRGBColorSpace).getHexString()}`);
    for (const sc of SCENERIES) {
      const p = palette(sc, 'night');
      const g = hue(p.groundLow); const r = hue(p.roadBase);
      expect(hueGap(g, r), `${sc}: chão ${g.toFixed(0)}° × pista ${r.toFixed(0)}°`).toBeGreaterThanOrEqual(20);
      expect(hueGap(g, building), `${sc}: chão ${g.toFixed(0)}° × prédio ${building.toFixed(0)}°`).toBeGreaterThanOrEqual(20);
      expect(hueGap(r, building), `${sc}: pista ${r.toFixed(0)}° × prédio ${building.toFixed(0)}°`).toBeGreaterThanOrEqual(20);
    }
  });

  it('segue roxo (a V12): o tom do prédio é violeta-azulado (230–280°) e a pista da cidade à noite não é azul (B − R ≤ +0,06 no albedo)', () => {
    const w = worldLook(0.32);
    const h = hue(`#${new THREE.Color().setRGB(...w.tone, THREE.LinearSRGBColorSpace).getHexString()}`);
    expect(h).toBeGreaterThanOrEqual(230); expect(h).toBeLessThanOrEqual(280);
    const road = new THREE.Color(palette('city_night', 'night').roadBase).convertLinearToSRGB();
    expect(road.b - road.r).toBeLessThanOrEqual(0.06);
  });
});
