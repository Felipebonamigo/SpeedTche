// Onda L, L1: o stylize (src/render/stylize.ts) — a forma da luz da bíblia (docs/DIRECAO-DE-ARTE.md §3) injetada por
// `onBeforeCompile` COMPONDO com o que já existe. Sem GPU aqui: o que se prova é o texto do shader que o three monta
// (o `ShaderLib` de verdade, com o `#include` ainda por resolver) e quem recebeu o trecho; o compilador de GLSL é o do
// Chromium, nas capturas (docs/ondas/L/L1.md §8).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { palette, SCENERIES, TIMES_OF_DAY } from '../src/render/palette';
import { fakeCanvasDocument } from './canvas-fake';
import {
  applyGrade, applyStylize, gradingFor, gradeUniforms, installToneMapping, lightFor, patchLightsChunk, patchToneMapping,
  STYLIZE_FAMILIES, stylizeUniforms, type StylizeFamily,
} from '../src/render/stylize';

const ALL = SCENERIES.flatMap((s) => TIMES_OF_DAY.map((t) => [s, t] as const));

/** O shader de verdade do three para o material (com os `#include` ainda por resolver), como o `onBeforeCompile` o recebe. */
function shaderOf(m: THREE.Material): THREE.WebGLProgramParametersWithUniforms {
  const lib = (m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial ? THREE.ShaderLib.physical
    : (m as THREE.MeshStandardMaterial).isMeshStandardMaterial ? THREE.ShaderLib.standard
      : (m as THREE.PointsMaterial).isPointsMaterial ? THREE.ShaderLib.points : THREE.ShaderLib.basic;
  return { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
}

function compile(m: THREE.Material): THREE.WebGLProgramParametersWithUniforms {
  const shader = shaderOf(m);
  m.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

describe('gradingFor e lightFor (a gradação vem da paleta)', () => {
  it('as 18 combinações bioma × período dão números finitos e pequenos (identidade = 0)', () => {
    for (const [s, t] of ALL) {
      const g = gradingFor(palette(s, t));
      const all = [g.exposure, g.saturation, g.contrast, ...g.shadows, ...g.highlights];
      for (const v of all) expect(Number.isFinite(v), `${s}/${t}`).toBe(true);
      // A exposição da paleta (0,8–1,3, calibrada para o ACES) com o ajuste da curva nova: o Neutral não puxa o meio-tom como o ACES.
      expect(g.exposure, `${s}/${t}`).toBeGreaterThan(0.8); expect(g.exposure, `${s}/${t}`).toBeLessThan(1.7);
      expect(Math.abs(g.saturation), `${s}/${t}`).toBeLessThanOrEqual(0.3);
      expect(Math.abs(g.contrast), `${s}/${t}`).toBeLessThanOrEqual(0.3);
      for (const v of [...g.shadows, ...g.highlights]) expect(Math.abs(v), `${s}/${t}`).toBeLessThanOrEqual(0.12);
      expect(['neutral', 'agx']).toContain(g.toneMapping);
    }
  });

  it('a gradação varia por período e por bioma (não é uma constante)', () => {
    const tint = (s: typeof SCENERIES[number], t: typeof TIMES_OF_DAY[number]) => gradingFor(palette(s, t)).shadows.map((v) => v.toFixed(4)).join();
    expect(new Set(TIMES_OF_DAY.map((t) => tint('coast', t))).size).toBe(3);
    expect(new Set(['coast', 'desert', 'alpine', 'savanna'].map((s) => tint(s as typeof SCENERIES[number], 'day'))).size).toBe(4);
    const lit = (s: typeof SCENERIES[number], t: typeof TIMES_OF_DAY[number]) => gradingFor(palette(s, t)).highlights.map((v) => v.toFixed(4)).join();
    expect(new Set(TIMES_OF_DAY.map((t) => lit('coast', t))).size).toBe(3);
  });

  it('borda e terminador: finitos, diferentes por período; o do pôr do sol é quente e o da mata é azul-esverdeado', () => {
    const rim = (t: typeof TIMES_OF_DAY[number]) => lightFor(palette('coast', t)).rim.map((v) => v.toFixed(4)).join();
    const term = (t: typeof TIMES_OF_DAY[number]) => lightFor(palette('coast', t)).terminator.map((v) => v.toFixed(4)).join();
    expect(new Set(TIMES_OF_DAY.map(rim)).size).toBe(3);
    expect(new Set(TIMES_OF_DAY.map(term)).size).toBe(3);
    for (const [s, t] of ALL) for (const v of [...lightFor(palette(s, t)).rim, ...lightFor(palette(s, t)).terminator]) expect(Number.isFinite(v) && v >= 0, `${s}/${t}`).toBe(true);
    const dusk = lightFor(palette('coast', 'dusk')).terminator;
    expect(dusk[0], 'pôr do sol: R > B').toBeGreaterThan(dusk[2]);
    const mata = lightFor(palette('tropical', 'day')).terminator;
    expect(mata[1], 'mata: G ≥ R').toBeGreaterThanOrEqual(mata[0]);
    expect(mata[2], 'mata: B > R').toBeGreaterThan(mata[0]);
  });
});

describe('tone mapping Custom (Neutral/AgX + gradação), um chunk global', () => {
  const saved = THREE.ShaderChunk.tonemapping_pars_fragment;
  beforeEach(() => { THREE.ShaderChunk.tonemapping_pars_fragment = saved; });
  afterEach(() => { THREE.ShaderChunk.tonemapping_pars_fragment = saved; });

  it('installToneMapping troca a CustomToneMapping do chunk, chama a curva escolhida e é idempotente', () => {
    expect(saved).toContain('vec3 CustomToneMapping( vec3 color ) { return color; }');
    installToneMapping();
    const once = THREE.ShaderChunk.tonemapping_pars_fragment;
    expect(once).toContain('stylizeGrade');
    expect(once).toMatch(/CustomToneMapping\( vec3 color \) \{ return stylizeGrade\( (?:Neutral|AgX)ToneMapping\( color \) \); \}/);
    expect(once).toContain('uniform vec3 uGradeShadows');
    installToneMapping();
    expect(THREE.ShaderChunk.tonemapping_pars_fragment).toBe(once);
    expect(once.split('vec3 CustomToneMapping(').length - 1).toBe(1);
  });

  it('se o three mudar a linha-âncora, o remendo falha alto (e não vira no-op calado)', () => {
    expect(() => patchToneMapping('vec3 CustomToneMapping( vec3 c ) { return c; }', 'neutral')).toThrow(/CustomToneMapping/);
    expect(() => patchLightsChunk('void RE_Direct_Physical() {}')).toThrow(/RE_Direct_Physical|directDiffuse/);
  });
});

describe('applyStylize: compõe, não substitui', () => {
  it('o callback e a chave de programa que o material já tinha continuam, e o trecho novo entra; duas chamadas não injetam duas vezes', () => {
    const mat = new THREE.MeshStandardMaterial();
    mat.onBeforeCompile = (s) => { s.fragmentShader = s.fragmentShader.replace('#include <fog_fragment>', '#include <fog_fragment>\n/*ANTERIOR*/'); };
    mat.customProgramCacheKey = () => 'chave-anterior';
    applyStylize(mat, 'scenery');
    const shader = compile(mat);
    expect(shader.fragmentShader).toContain('/*ANTERIOR*/');
    expect(shader.fragmentShader).toContain('STYLIZE_LIT');
    expect(mat.customProgramCacheKey()).toContain('chave-anterior');
    expect(mat.customProgramCacheKey()).toContain('speed-tche-stylize');
    applyStylize(mat, 'scenery');
    expect(compile(mat).fragmentShader).toBe(shader.fragmentShader);
    expect(mat.customProgramCacheKey().split('speed-tche-stylize').length - 1).toBe(1);
  });

  it('a chave de programa muda por família (o rim é código, não uniforme) e nunca colide com a de um material sem stylize', () => {
    const keys = new Set<string>();
    for (const f of Object.keys(STYLIZE_FAMILIES) as StylizeFamily[]) {
      const m = new THREE.MeshStandardMaterial(); const bare = new THREE.MeshStandardMaterial().customProgramCacheKey();
      applyStylize(m, f);
      expect(m.customProgramCacheKey()).not.toBe(bare);
      keys.add(m.customProgramCacheKey());
    }
    expect(keys.size).toBe(Object.keys(STYLIZE_FAMILIES).length);
  });
});

describe('o trecho de luz (o shader de verdade do three)', () => {
  const RIM: StylizeFamily[] = ['scenery', 'facade', 'car'];
  const NO_RIM: StylizeFamily[] = ['ground', 'road', 'ghost'];

  it('a rampa troca o dotNL do RE_Direct_Physical, no MeshStandard e no MeshPhysical', () => {
    for (const Ctor of [THREE.MeshStandardMaterial, THREE.MeshPhysicalMaterial]) {
      const m = new Ctor();
      applyStylize(m, 'scenery');
      const frag = compile(m).fragmentShader;
      expect(frag, Ctor.name).toContain('stylizeDirect(');
      expect(frag, Ctor.name).not.toContain('reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );');
      expect(frag, Ctor.name).not.toContain('#include <lights_physical_pars_fragment>');
    }
  });

  it('a luz de borda só entra nas famílias que têm borda (chão, pista e fantasma ficam sem)', () => {
    for (const f of RIM) { const m = new THREE.MeshStandardMaterial(); applyStylize(m, f); expect(compile(m).fragmentShader, f).toContain('STYLIZE_RIM_CODE'); }
    for (const f of NO_RIM) { const m = new THREE.MeshStandardMaterial(); applyStylize(m, f); expect(compile(m).fragmentShader, f).not.toContain('STYLIZE_RIM_CODE'); }
  });

  it('os uniformes são os compartilhados, por referência: mexer num muda para todos', () => {
    const a = new THREE.MeshStandardMaterial(); const b = new THREE.MeshPhysicalMaterial();
    applyStylize(a, 'ground'); applyStylize(b, 'car');
    for (const m of [a, b]) {
      const u = compile(m).uniforms;
      for (const k of ['uStylizeRim', 'uStylizeTerm', 'uGradeShadows', 'uGradeHighlights', 'uGradeAdjust'] as const) {
        expect(u[k], `${m.type} ${k}`).toBe(stylizeUniforms[k]);
      }
    }
  });

  it('applyGrade (sem luz): MeshBasic ganha só os uniformes da gradação e a chave; ShaderMaterial, os uniformes', () => {
    const basic = new THREE.MeshBasicMaterial();
    applyGrade(basic);
    const shader = compile(basic);
    expect(shader.uniforms.uGradeShadows).toBe(gradeUniforms.uGradeShadows);
    expect(shader.fragmentShader).not.toContain('STYLIZE_LIT');
    expect(basic.customProgramCacheKey()).toContain('speed-tche-grade');
    const sm = new THREE.ShaderMaterial({ uniforms: { uX: { value: 1 } } });
    applyGrade(sm);
    expect(sm.uniforms.uGradeAdjust).toBe(gradeUniforms.uGradeAdjust);
    expect(sm.uniforms.uX.value).toBe(1);
  });
});

// ───────────────────────────── cobertura: todo material com luz recebe o trecho ─────────────────────────────

describe('cobertura: todo material com luz do jogo recebe o trecho de luz', () => {
  let restore: () => void = () => undefined;
  afterEach(() => restore());

  /** Os materiais de cada parte do mundo, pela cena (o que é desenhado) e, no cenário, pelo catálogo privado de materiais. */
  async function collect(): Promise<{ lit: Map<THREE.Material, string>; plain: Map<THREE.Material, string> }> {
    restore = fakeCanvasDocument();
    const { Road } = await import('../src/render/road');
    const { Terrain } = await import('../src/render/terrain');
    const { Scenery } = await import('../src/render/scenery/runtime');
    const { Cars } = await import('../src/render/cars');
    const { Sky } = await import('../src/render/sky');
    const carScene = new THREE.Scene(); const skyScene = new THREE.Scene();
    const parts: Array<[string, THREE.Object3D]> = [];
    const road = new Road(300, 1); parts.push(['road', road.group]);
    const terrain = new Terrain(300); parts.push(['terrain', terrain.group]);
    const scenery = new Scenery(); parts.push(['scenery', scenery.group]);
    new Cars(carScene); parts.push(['cars', carScene]);
    const sky = new Sky({} as THREE.WebGLRenderer, skyScene); parts.push(['sky', sky.group]);
    const lit = new Map<THREE.Material, string>(); const plain = new Map<THREE.Material, string>();
    const take = (m: THREE.Material, where: string): void => {
      if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) lit.set(m, where); else plain.set(m, where);
    };
    for (const [where, root] of parts) {
      root.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (mat) for (const m of Array.isArray(mat) ? mat : [mat]) take(m, where);
      });
    }
    // O cenário só monta os lotes quando recebe uma pista; o catálogo de materiais (privado) cobre o que ela pode desenhar.
    const catalog = (scenery as unknown as { materials: Record<string, THREE.Material> }).materials;
    for (const m of Object.values(catalog)) take(m, 'scenery');
    return { lit, plain };
  }

  it('são pelo menos 17 (a lista do cartão) e cada um tem a chave e o trecho de luz', async () => {
    const { lit } = await collect();
    expect(lit.size).toBeGreaterThanOrEqual(17);
    const bad: string[] = [];
    for (const [m, where] of lit) {
      const key = m.customProgramCacheKey();
      const frag = compile(m).fragmentShader;
      if (!key.includes('speed-tche-stylize') || !frag.includes('STYLIZE_LIT')) bad.push(`${where}: ${m.type} ${m.name || '(sem nome)'} cor=${(m as THREE.MeshStandardMaterial).color?.getHexString()}`);
    }
    expect(bad).toEqual([]);
  });

  it('os que não têm luz (MeshBasic, Shader, Points) do chão, do céu e do cenário recebem a gradação (menos o neon, toneMapped: false)', async () => {
    const { plain } = await collect();
    expect(plain.size).toBeGreaterThanOrEqual(12);
    const bad: string[] = [];
    for (const [m, where] of plain) {
      if (!m.toneMapped || where === 'cars') continue; // o neon; e a sombra de contato/chama/etiquetas dos carros são da L3
      const u = (m as THREE.ShaderMaterial).isShaderMaterial ? (m as THREE.ShaderMaterial).uniforms : compile(m).uniforms;
      if (u.uGradeShadows !== gradeUniforms.uGradeShadows) bad.push(`${where}: ${m.type} ${m.name || ''}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('varredura de fonte: material com luz criado depois da montagem também passa pelo applyStylize', () => {
  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out.push(...sources(p));
      else if (p.endsWith('.ts')) out.push(p);
    }
    return out;
  }

  it('cada arquivo de src/render (menos os de exportação glTF) tem tantas chamadas applyStylize( quanto construtores de material com luz', () => {
    const bad: string[] = [];
    let ctors = 0;
    for (const file of sources('src/render')) {
      if (/\/template\.ts$/.test(file)) continue; // só exportação para o Blender (ferramenta/teste), não é desenhado no jogo
      const code = readFileSync(file, 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
      const n = (code.match(/new (?:THREE\.)?Mesh(?:Standard|Physical)Material\(/g) ?? []).length;
      const calls = (code.match(/\bapplyStylize\(/g) ?? []).length;
      ctors += n;
      if (file.endsWith('src/render/stylize.ts')) continue;
      if (calls < n) bad.push(`${file}: ${n} construtores, ${calls} applyStylize`);
    }
    expect(ctors).toBeGreaterThanOrEqual(14); // 14 construtores (a fachada nasce de uma função que roda 4 vezes: 17 materiais)
    expect(bad).toEqual([]);
  });
});
