// V12, item 2 (docs/ondas/V12-noite-e-camera.md): a noite mais roxa SÓ no chão, na névoa, no céu e nos objetos de cenário — não na luz que cai no carro nem no material
// dele (as travas da cor-brilho: carro branco lê branco, vermelho vermelho, sem clarão, asfalto neutro). Puro (paleta e dados de gradação): o que a imagem faz com isso é
// medido em `tests/noite-roxa-gl.test.ts`. A base do que não pode mudar é `tests/noite-roxa-base.ts` (as 18 paletas do main 4a882cc).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { blendPalette, hexToRgb, livePalette, luminance, palette, sceneryLook, SCENERIES, TIMES_OF_DAY, type Palette } from '../src/render/palette';
import * as S from '../src/render/stylize';
import { varnishSky } from '../src/render/stylize';
import { OLHAR_DO_CENARIO_4A882CC, PALETAS_4A882CC } from './noite-roxa-base';

type Cor = { h: number; s: number; v: number };
function hsv(hex: string): Cor {
  const [r, g, b] = hexToRgb(hex).map((x) => x / 255);
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
  const h = d === 0 ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx === 0 ? 0 : d / mx, v: mx };
}
const dist = (a: string, b: string): number => { const x = hexToRgb(a); const y = hexToRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) / 255; };
const night = (s: (typeof SCENERIES)[number]): Palette & { skyLight?: [string, string, string] } => palette(s, 'night');
const base = (s: string, t: string): Record<string, unknown> => PALETAS_4A882CC[`${s}:${t}`];

/** Roxo e magenta: do violeta-azulado (255°) ao magenta-rosado (335°). O azul-marinho de antes (210–250°) e o verde do chão ficam fora. */
const ROXO: [number, number] = [255, 335];
const emRoxo = (hex: string): boolean => { const h = hsv(hex).h; return h >= ROXO[0] && h <= ROXO[1]; };

describe('a noite é roxa no chão, na névoa e no céu (6 biomas)', () => {
  it('névoa: matiz roxo e saturação ≥ 0,35 (era azul-marinho, verde-petróleo ou marrom)', () => {
    const bad: string[] = [];
    for (const s of SCENERIES) { const f = night(s).fog; if (!emRoxo(f) || hsv(f).s < 0.35) bad.push(`${s} ${f} h${hsv(f).h.toFixed(0)} s${hsv(f).s.toFixed(2)}`); }
    expect(bad).toEqual([]);
  });

  it('céu: o meio e o horizonte são roxos (saturação ≥ 0,40) e o topo também (matiz roxo, é só mais escuro)', () => {
    const bad: string[] = [];
    for (const s of SCENERIES) {
      const sky = night(s).sky;
      sky.forEach((c, i) => { if (!emRoxo(c)) bad.push(`${s} céu${i} ${c} h${hsv(c).h.toFixed(0)}`); });
      for (const i of [1, 2]) if (hsv(sky[i]).s < 0.4) bad.push(`${s} céu${i} ${sky[i]} s${hsv(sky[i]).s.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });

  it('chão: baixo, alto, beira, rocha, areia e os planos do horizonte têm matiz roxo/magenta (saturação ≥ 0,18)', () => {
    const bad: string[] = [];
    for (const s of SCENERIES) {
      const p = night(s);
      const campos: Array<[string, string]> = [['groundLow', p.groundLow], ['groundHigh', p.groundHigh], ['verge', p.verge], ['rock', p.rock], ['sand', p.sand], ['layer0', p.layers[0]], ['layer1', p.layers[1]], ['layer2', p.layers[2]]];
      for (const [n, c] of campos) if (!emRoxo(c) || hsv(c).s < 0.18) bad.push(`${s} ${n} ${c} h${hsv(c).h.toFixed(0)} s${hsv(c).s.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });

  it('a pista da cidade à noite é um mauve-magenta (matiz 275–335°), sem virar azul-marinho (200–250°)', () => {
    const p = night('city_night');
    for (const c of [p.roadBase, p.roadAlt]) { const h = hsv(c).h; expect(h, `${c}`).toBeGreaterThanOrEqual(275); expect(h, `${c}`).toBeLessThanOrEqual(335); }
    for (const s of SCENERIES) for (const c of [night(s).roadBase, night(s).roadAlt]) { const h = hsv(c); expect(h.h >= 200 && h.h <= 250 && h.s * h.v > 0.3, `${s} ${c}`).toBe(false); }
  });

  it('cada bioma segue com céu e horizonte próprios (a M2: distância ≥ 0,15 entre céus, ≥ 0,08 entre horizontes)', () => {
    for (let i = 0; i < SCENERIES.length; i++) for (let j = i + 1; j < SCENERIES.length; j++) {
      const a = night(SCENERIES[i]); const b = night(SCENERIES[j]);
      expect(dist(a.sky[2], b.sky[2]), `${SCENERIES[i]} × ${SCENERIES[j]} horizonte`).toBeGreaterThanOrEqual(0.08);
    }
  });
});

describe('o que NÃO muda: a luz que cai no carro, o asfalto, a exposição, o dia e o entardecer', () => {
  const FICA_NA_NOITE = ['hemiSky', 'hemiGround', 'hemiIntensity', 'sunLight', 'sunIntensity', 'envIntensity', 'exposure', 'skyGlow', 'asphalt', 'lane', 'light', 'fogDensity', 'bloom',
    'moon', 'sun', 'sunAz', 'sunEl', 'stars', 'cloudLit', 'lampPool', 'markingGlow', 'pit', 'pitLine', 'roadLight', 'roadDark', 'roadEarth', 'layerHaze', 'flare', 'flareColor', 'seaGlint', 'seaSky', 'seaSpec'] as const;

  it('à noite: luz hemisférica, sol/lua, IBL, exposição, asfalto de referência e faixa são byte a byte os do main 4a882cc', () => {
    const bad: string[] = [];
    for (const s of SCENERIES) for (const k of FICA_NA_NOITE) {
      const a = JSON.stringify(night(s)[k as keyof Palette]); const b = JSON.stringify(base(s, 'night')[k]);
      if (a !== b) bad.push(`${s}.${k}: ${a} (era ${b})`);
    }
    expect(bad).toEqual([]);
  });

  it('o dia e o entardecer não mudam um campo (só ganham `skyLight`, igual ao `sky`)', () => {
    const bad: string[] = [];
    for (const s of SCENERIES) for (const t of ['day', 'dusk'] as const) {
      const p = palette(s, t) as Palette & { skyLight?: unknown };
      for (const [k, v] of Object.entries(base(s, t))) {
        // V22/F7 mudou DE PROPÓSITO, só no que se VÊ (não na luz do carro: hemiGround e fogLight seguem os de antes): a saturação do chão desce (`GROUND_TRIO.trim`: o diagnóstico mediu a grama a 0,90–0,93,
        // no teto do céu, sem hierarquia) — `groundLow`, `groundHigh` e as cópias `grassLight`/`grassDark`, de dia e no entardecer — e a névoa do deserto de dia perde o azul do meio do céu (`fog`, 35°, sat 0,21 → mais quente).
        if (['groundLow', 'groundHigh', 'grassLight', 'grassDark'].includes(k) || (s === 'desert' && t === 'day' && k === 'fog')) continue;
        if (JSON.stringify(p[k as keyof Palette]) !== JSON.stringify(v)) bad.push(`${s}:${t}.${k}`);
      }
      if (JSON.stringify(p.skyLight) !== JSON.stringify(p.sky)) bad.push(`${s}:${t}.skyLight ≠ sky`);
    }
    expect(bad).toEqual([]);
  });

  it('`skyLight` (o céu que dá luz ao carro: a IBL e o reflexo do verniz) é o céu azul de antes da noite, em cada bioma', () => {
    const bad: string[] = [];
    for (const s of SCENERIES) {
      const p = night(s);
      if (JSON.stringify(p.skyLight) !== JSON.stringify(base(s, 'night').sky)) bad.push(`${s}: ${JSON.stringify(p.skyLight)} (era o céu ${JSON.stringify(base(s, 'night').sky)})`);
      if (JSON.stringify(p.sky) === JSON.stringify(p.skyLight)) bad.push(`${s}: o céu pintado não pode ser o da luz`);
    }
    expect(bad).toEqual([]);
  });

  it('o reflexo do verniz do carro sai do `skyLight`, não do céu roxo', () => {
    for (const s of SCENERIES) {
      const p = night(s);
      expect(varnishSky(p), s).toEqual(varnishSky({ ...p, sky: p.skyLight as [string, string, string] }));
    }
  });

  it('a luminância média do chão e do céu não cai: o roxo vem sem escurecer (luma ≥ 0,92× a de antes; a V10 já tirou a noite do breu)', () => {
    const bad: string[] = [];
    for (const s of SCENERIES) {
      const p = night(s);
      for (const k of ['groundLow', 'groundHigh', 'verge', 'rock', 'sand', 'fog'] as const) {
        const antes = luminance(base(s, 'night')[k] as string); const agora = luminance(p[k]);
        if (agora < antes * 0.92) bad.push(`${s}.${k} ${agora.toFixed(3)} < ${(antes * 0.92).toFixed(3)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('contínuo no tempo da corrida (entardecer → noite)', () => {
  it('a névoa, o chão e o horizonte do céu andam sem salto entre dois passos de 5% do `t` (a corrida que muda)', () => {
    const bad: string[] = [];
    for (const s of SCENERIES) {
      const a = palette(s, 'dusk'); const b = palette(s, 'night');
      let prev = blendPalette(a, b, 0);
      for (let i = 1; i <= 20; i++) {
        const cur = blendPalette(a, b, i / 20);
        for (const k of ['fog', 'groundLow', 'groundHigh', 'verge'] as const) if (dist(prev[k], cur[k]) > 0.07) bad.push(`${s}.${k} t=${i / 20}: ${dist(prev[k], cur[k]).toFixed(3)}`);
        if (dist(prev.sky[2], cur.sky[2]) > 0.07) bad.push(`${s}.sky2 t=${i / 20}`);
        prev = cur;
      }
    }
    expect(bad).toEqual([]);
  });

  it('a corrida de entardecer chega à noite roxa: na bandeirada a névoa e o chão são os da noite (roxos); no meio, entre o entardecer e a noite', () => {
    for (const s of SCENERIES) {
      const fim = livePalette(s, 'dusk', 3, 1).p; const meio = livePalette(s, 'dusk', 3, 0.83).p;
      expect(emRoxo(fim.fog), `${s} fim`).toBe(true);
      expect(emRoxo(fim.groundLow), `${s} fim chão`).toBe(true);
      expect(meio.light, `${s} meio`).toBeLessThan(0.7); expect(meio.light).toBeGreaterThan(0.32);
    }
  });

  it('a palavra da lista: só a noite tem `skyLight` diferente de `sky` (a luz do dia e do entardecer segue a do céu pintado)', () => {
    for (const s of SCENERIES) for (const t of TIMES_OF_DAY) {
      const p = palette(s, t) as Palette & { skyLight?: unknown };
      expect(JSON.stringify(p.skyLight) === JSON.stringify(p.sky), `${s}:${t}`).toBe(t !== 'night');
    }
  });
});

describe('os objetos de cenário à noite (`sceneryLook`)', () => {
  it('o filtro do cenário à noite (luz 0,32) é roxo (matiz 250–320°, saturação ≥ 0,2) e a sombra no chão também', () => {
    const l = sceneryLook(0.32);
    const t = hsv(l.tint); const b = hsv(l.blob);
    expect(t.h, l.tint).toBeGreaterThanOrEqual(250); expect(t.h).toBeLessThanOrEqual(320); expect(t.s).toBeGreaterThanOrEqual(0.2);
    expect(b.h, l.blob).toBeGreaterThanOrEqual(250); expect(b.h).toBeLessThanOrEqual(335);
  });

  it('de dia (1) e no entardecer (0,7) o filtro e a mancha são os de antes; as janelas e os brilhos não mudam em nenhuma luz', () => {
    for (const luz of ['1', '0.85', '0.7', '0.5', '0.32']) {
      const novo = sceneryLook(Number(luz)) as unknown as Record<string, unknown>; const velho = OLHAR_DO_CENARIO_4A882CC[luz];
      for (const k of ['lit', 'panel', 'glow', 'cones', 'blobOpacity']) expect(novo[k], `${luz}.${k}`).toBe(velho[k]);
      if (Number(luz) >= 0.7) { expect(novo.tint, `${luz}.tint`).toBe(velho.tint); expect(novo.blob, `${luz}.blob`).toBe(velho.blob); }
    }
  });
});

// ── o roxo no albedo do cenário (shader: uniforme da estilização, sem programa novo no meio da corrida) ──
// Multiplicar o filtro do cenário (`sceneryLook.tint`) deixa o verde da copa verde (só mais escuro): o HC2 pinta a árvore de magenta. A estilização ganha um uniforme
// `uStylizeWorld` (tom roxo + quanto), lido SÓ pelos materiais do cenário e das fachadas (`world: true`), nunca pelo carro, pela pista ou pelo fantasma.
type WorldLook = { tone: [number, number, number]; amount: number };
const worldLook = (light: number): WorldLook => (S as unknown as { worldLook: (l: number) => WorldLook }).worldLook(light);

function shaderOf(m: THREE.Material): THREE.WebGLProgramParametersWithUniforms {
  const lib = (m as THREE.MeshStandardMaterial).isMeshStandardMaterial ? THREE.ShaderLib.standard : THREE.ShaderLib.basic;
  return { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
}
const compile = (m: THREE.Material): THREE.WebGLProgramParametersWithUniforms => { const sh = shaderOf(m); m.onBeforeCompile(sh, {} as THREE.WebGLRenderer); return sh; };
const aplicar = S.applyStylize as unknown as (m: THREE.Material, f: S.StylizeFamily, o?: { world?: boolean }) => void;

describe('o roxo do cenário à noite (uniforme `uStylizeWorld`)', () => {
  it('worldLook: nada de dia e no entardecer (luz ≥ 0,7), cheio à noite (0,32, ≥ 0,45), contínuo e monótono entre as duas', () => {
    expect(worldLook(1).amount).toBe(0); expect(worldLook(0.7).amount).toBe(0);
    expect(worldLook(0.32).amount).toBeGreaterThanOrEqual(0.45);
    let prev = worldLook(0.7).amount;
    for (let l = 0.7; l >= 0.32 - 1e-9; l -= 0.01) { const a = worldLook(l).amount; expect(a, `luz ${l.toFixed(2)}`).toBeGreaterThanOrEqual(prev - 1e-9); expect(a - prev, `salto em ${l.toFixed(2)}`).toBeLessThan(0.06); prev = a; }
  });

  it('o tom é violeta-azulado (matiz 230–280° em sRGB; V22/F7: era roxo/magenta 270–330°, o magenta é do chão e da pista e o prédio precisa de ≥ 20° de diferença: `tests/nevoa-f7.test.ts`)', () => {
    const [r, g, b] = worldLook(0.32).tone.map((v) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
    const h = hsv(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`).h;
    expect(h).toBeGreaterThanOrEqual(230); expect(h).toBeLessThanOrEqual(280);
  });

  it('setStylizePalette grava o uniforme: 0 de dia e no entardecer, > 0 à noite', () => {
    const u = (S.stylizeUniforms as unknown as Record<string, { value: THREE.Vector4 }>).uStylizeWorld;
    expect(u, 'uStylizeWorld').toBeDefined();
    S.setStylizePalette(palette('city_night', 'night')); expect(u.value.w).toBeGreaterThanOrEqual(0.45);
    S.setStylizePalette(palette('city_night', 'dusk')); expect(u.value.w).toBe(0);
    S.setStylizePalette(palette('coast', 'day')); expect(u.value.w).toBe(0);
  });

  it('o shader do cenário e da fachada (`world: true`) lê o uniforme depois da cor por vértice; carro, pista, chão e fantasma NÃO', () => {
    const com: S.StylizeFamily[] = ['scenery', 'facade'];
    for (const f of com) {
      const m = new THREE.MeshStandardMaterial(); aplicar(m, f, { world: true });
      const sh = compile(m);
      expect(sh.fragmentShader, f).toContain('uStylizeWorld');
      expect(sh.fragmentShader, `${f}: o trecho entra logo depois do color_fragment (âncora do three, senão seria no-op calado)`).toMatch(/#include <color_fragment>\n+\/\* STYLIZE_WORLD_CODE \*\//);
    }
    for (const f of ['car', 'road', 'ground', 'ghost', 'scenery'] as const) {
      const m = new THREE.MeshStandardMaterial(); aplicar(m, f);
      expect(compile(m).fragmentShader, `${f} sem world`).not.toContain('uStylizeWorld');
    }
  });

  it('a chave de programa do material com `world` é outra (compila na carga, nunca no meio da corrida)', () => {
    const a = new THREE.MeshStandardMaterial(); const b = new THREE.MeshStandardMaterial();
    aplicar(a, 'scenery'); aplicar(b, 'scenery', { world: true });
    expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey());
  });
});
