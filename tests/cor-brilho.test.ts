// Cor e brilho (docs/ondas/cor-brilho.md): os defeitos objetivos da auditoria visual de 14/10/2026, medidos sem GL. A medida que precisa da imagem
// (o clarão no Cânion, as bolhas de Sampa, o teto do bloom, o tom do carro branco NA CAPTURA) está em tests/cor-brilho-gl.test.ts.
//   1. Brilho que esconde a corrida: os faróis do jogador (SpotLight) ficavam na linha central, não no carro, e no entardecer valiam mais que o céu.
//   2. Véu magenta: a luz que cai nos objetos (hemisférica, IBL difusa, sol) era roxa/rosa saturada e o pé do Neutral saturava os escuros.
//      Medido por um modelo de bolso da luz do three (hemisférica + IBL do domo + sol + autoluz → exposição → Neutral → gradação → sRGB), escrito
//      AQUI, independente do código: o teste não repete a conta da implementação, só lê a paleta e os números da gradação.
//   3. Lanternas chapadas: emissivo vermelho uniforme abaixo do limiar do bloom, igual de dia e de noite.
//   4. Pintura sem reflexo: nenhum reflexo do céu/horizonte na carroceria fora do verniz da Alta.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createRace } from '../src/core/sim/race';
import { getTrack } from '../src/core/track';
import type { RenderFrame } from '../src/game/contracts';
import { Cars } from '../src/render/cars';
import { Effects } from '../src/render/effects';
import * as M from '../src/render/cars/material';
import * as K from '../src/render/cars/kit';
import * as F from '../src/render/cars/flame';
import { buildModel } from '../src/render/cars/models';
import { TAIL } from '../src/render/cars/paints';
import { palette, SCENERIES, TIMES_OF_DAY, type Palette } from '../src/render/palette';
import { buildRoadFrame } from '../src/render/roadframe';
import { sunSetup } from '../src/render/sky';
import * as S from '../src/render/stylize';
import { gradingFor } from '../src/render/stylize';
import { ROAD_HALF_WIDTH_M } from '../src/render/units';
import { fakeCanvasDocument } from './canvas-fake';
import type { SceneryId, TimeOfDay } from '../src/core/types';

type V = [number, number, number];
const lin = (hex: string): V => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const lum = (c: readonly number[]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const mixv = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const mulv = (a: V, b: V): V => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const sstep = (e0: number, e1: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// O que a implementação nova expõe (ainda não existe quando o teste é escrito): lido por acesso dinâmico, com o valor de HOJE como reserva, para
// que os critérios falhem pela MEDIDA e não por "não existe".
// `road` (V4b, docs/ondas/V4b-sombra.md): a luz AMBIENTE (hemisférica + IBL do céu) só no material da pista de dia: `mix` = quanto dela vira cinza (a luminância
// dela × `tint`, um tom quente de luminância 1 e ganho embutido); 0 = igual a hoje (entardecer e noite).
interface GradingNew { toe?: number; fill?: number; road?: { tint: V; mix: number } }
const gradeOf = (p: Palette): ReturnType<typeof gradingFor> & GradingNew => gradingFor(p) as ReturnType<typeof gradingFor> & GradingNew;

// ───────────────────────────── modelo de bolso da luz (independente do código) ─────────────────────────────

/** O domo do céu (o gradiente do SKY_FRAG de sky.ts, sem o disco): horizonte → meio → topo, o brilho do lado do sol, a névoa abaixo do horizonte. */
function dome(p: Palette, d: THREE.Vector3, sun: THREE.Vector3): V {
  const hp = Math.max(d.y, 0);
  let col = mixv(lin(p.sky[2]), lin(p.sky[1]), sstep(0, 0.2, hp));
  col = mixv(col, lin(p.sky[0]), sstep(0.16, 0.75, hp));
  const sh = new THREE.Vector2(sun.x, sun.z).normalize(); const dh = new THREE.Vector2(d.x, d.z).normalize();
  const az = dh.dot(sh) * 0.5 + 0.5;
  const glowAmt = p.light >= 0.8 ? 0.35 : p.light >= 0.5 ? 0.8 : 0.35;
  col = mixv(col, lin(p.skyGlow), Math.exp(-hp * 6) * az * az * az * glowAmt);
  return mixv(col, lin(p.fog), sstep(0, -0.06, d.y));
}

/** A IBL difusa do three (PMREM do domo, rugosidade 1): a média do domo ponderada pelo cosseno em volta da normal. */
function envAround(p: Palette, n: THREE.Vector3, sun: THREE.Vector3): V {
  let acc: V = [0, 0, 0]; let w = 0;
  const d = new THREE.Vector3();
  const N = 3000;
  for (let i = 0; i < N; i++) {
    const z = 1 - (2 * (i + 0.5)) / N; const r = Math.sqrt(1 - z * z); const ph = 2 * Math.PI * ((i * 0.6180339887) % 1);
    d.set(r * Math.cos(ph), z, r * Math.sin(ph));
    const c = d.dot(n);
    if (c > 0) { acc = add(acc, mul(dome(p, d, sun), c)); w += c; }
  }
  return mul(acc, 1 / w);
}

/** Khronos PBR Neutral, com o pé do three (subtrai o menor canal) ou, na fração `toe`, o mesmo pé aplicado à luminância (sem mudar o matiz). */
function neutral(c: V, exposure: number, toe: number): V {
  let col = mul(c, exposure);
  const x = Math.min(...col);
  const kh = col.map((v) => v - (x < 0.08 ? x - 6.25 * x * x : 0.04)) as V;
  const l = Math.max(lum(col), 1e-6);
  const sc = mul(col, Math.max(0, (l - (l < 0.08 ? l - 6.25 * l * l : 0.04)) / l));
  col = mixv(kh, sc, toe);
  const peak = Math.max(...col);
  if (peak < 0.76) return col;
  const dd = 0.24; const np = 1 - (dd * dd) / (peak + dd - 0.76);
  col = mul(col, np / peak);
  return mixv(col, [np, np, np], 1 - 1 / (0.15 * (peak - np) + 1));
}

/** A gradação do stylizeGrade (saturação, contraste, tinta das sombras com pé, ganho nas luzes), em ~gama 2. */
function graded(c: V, p: Palette): V {
  const g = gradeOf(p);
  let s = c.map((v) => Math.sqrt(Math.max(v, 0))) as V;
  const l = lum(s);
  s = mixv([l, l, l], s, 1 + g.saturation);
  s = s.map((v) => (v - 0.45) * (1 + g.contrast) + 0.45) as V;
  s = add(s, mul(g.shadows as V, sstep(0, 0.22, l) * (1 - sstep(0.22, 0.6, l))));
  s = mulv(s, add([1, 1, 1], mul(g.highlights as V, sstep(0.4, 1, l))));
  s = s.map((v) => Math.min(1, Math.max(0, v))) as V;
  return mulv(s, s);
}

const srgb8 = (v: number): number => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)));

type Face = 'shadow' | 'sun' | 'top';
/**
 * A cor final (sRGB 0..255) de uma superfície de albedo `hex` sob a luz do período: `shadow` = a traseira de costas para o sol (o que a câmera de
 * perseguição vê com o sol à frente), `sun` = um lado a 45° do sol, `top` = virada para cima (capô, asfalto). `car` liga a autoluz do material dos carros.
 */
function shade(p: Palette, s: SceneryId, t: TimeOfDay, hex: string, face: Face, car: boolean, opts: { road?: boolean; sun?: boolean } = {}): V {
  const A = lin(hex);
  const sun = sunSetup(t, s).dir.clone();
  const sunH = new THREE.Vector3(sun.x, 0, sun.z).normalize();
  const n = face === 'top' ? new THREE.Vector3(0, 1, 0) : face === 'shadow' ? sunH.clone().negate() : sunH.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
  const g = gradeOf(p);
  let hemi = mul(mixv(lin(p.hemiGround), lin(p.hemiSky), 0.5 + 0.5 * n.y), p.hemiIntensity);
  const sunE = mul(lin(p.sunLight), p.sunIntensity * Math.max(0, n.dot(sun)) * (opts.sun === false ? 0 : 1));
  const envRaw = envAround(p, n, sun);
  const fill = g.fill ?? 1;
  let env = mul(mixv([lum(envRaw), lum(envRaw), lum(envRaw)], envRaw, fill), p.envIntensity);
  if (opts.road && g.road) { // a luz ambiente da pista de dia: a luminância dela no tom quente (a hemisférica e a IBL; o sol não)
    const grey = (c: V): V => mixv(c, mul(g.road!.tint, lum(c)), g.road!.mix);
    hemi = grey(hemi); env = grey(env);
  }
  const self = car ? mul(A, (0.05 + 0.15 * p.light) * (1 - 0.65 * lum(A))) : [0, 0, 0] as V;
  const radiance = add(add(mul(mulv(add(hemi, sunE), A), 1 / Math.PI), mulv(env, A)), self);
  return graded(neutral(radiance, g.exposure, g.toe ?? 0), p).map(srgb8) as V;
}

/** Croma relativo (máx − mín) / máx; 0 = cinza. */
const chroma = (c: V): number => (Math.max(...c) - Math.min(...c)) / Math.max(1, Math.max(...c));
/** Matiz em graus (0 = vermelho). */
function hueDeg(c: V): number {
  const [r, g, b] = c.map((v) => v / 255); const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
  if (d < 1e-6) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
}

const WHITE = '#f2f2f2'; // Falcão GT
const RED = '#e53935'; // Trovão V12
const LATE: TimeOfDay[] = ['dusk', 'night'];

describe('2. véu magenta: a luz do entardecer e da noite deixa a pintura com a cor dela', () => {
  it('o carro branco lê branco (quente ou frio, nunca rosa/roxo): croma ≤ 0,22 na traseira à sombra, no lado ao sol e no capô, e sem o verde afundado do magenta', () => {
    const bad: string[] = [];
    for (const s of SCENERIES) for (const t of LATE) {
      const p = palette(s, t);
      for (const face of ['shadow', 'sun', 'top'] as const) {
        const c = shade(p, s, t, WHITE, face, true);
        const magenta = Math.min(c[0], c[2]) - c[1];
        if (chroma(c) > 0.22 || magenta > 6) bad.push(`${s}:${t} ${face} rgb(${c.join(',')}) croma ${chroma(c).toFixed(2)} magenta ${magenta}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('o carro vermelho continua vermelho: matiz a ±18° do vermelho e saturação ≥ 0,75 à sombra e ao sol', () => {
    const bad: string[] = [];
    for (const s of SCENERIES) for (const t of LATE) {
      const p = palette(s, t);
      for (const face of ['shadow', 'sun'] as const) {
        const c = shade(p, s, t, RED, face, true);
        const h = hueDeg(c); const dist = Math.min(h, 360 - h);
        if (dist > 18 || chroma(c) < 0.75) bad.push(`${s}:${t} ${face} rgb(${c.join(',')}) matiz ${h.toFixed(0)}° croma ${chroma(c).toFixed(2)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('o asfalto é escuro neutro-quente: croma ≤ 0,30 (escuro: em 0..255, máx − mín ≤ 12) e o azul não passa do vermelho em mais de 4', () => {
    const bad: string[] = [];
    for (const s of SCENERIES) for (const t of LATE) {
      const p = palette(s, t);
      const c = shade(p, s, t, p.asphalt, 'top', false);
      const spread = Math.max(...c) - Math.min(...c);
      if (spread > 12 || c[2] - c[0] > 4) bad.push(`${s}:${t} asfalto rgb(${c.join(',')})`);
    }
    expect(bad).toEqual([]);
  });

  it('o dia não muda (trava: Copacabana de dia é o melhor quadro): os 6 biomas de dia dão as mesmas cores de antes', () => {
    // Medido no `main` 150dd01 com este mesmo modelo (branco à sombra · branco ao sol · vermelho à sombra · asfalto).
    const BEFORE: Record<SceneryId, [V, V, V, V]> = {
      tropical: [[124, 174, 201], [241, 249, 241], [140, 1, 25], [13, 46, 93]],
      desert: [[159, 165, 187], [255, 244, 233], [166, 0, 22], [38, 52, 96]],
      city_night: [[152, 176, 210], [248, 246, 243], [163, 1, 28], [20, 40, 86]],
      alpine: [[140, 169, 213], [242, 241, 244], [153, 0, 32], [22, 43, 96]],
      coast: [[117, 178, 221], [229, 242, 245], [133, 1, 35], [18, 54, 106]],
      savanna: [[166, 189, 197], [255, 252, 235], [172, 3, 19], [39, 55, 79]],
    };
    for (const s of SCENERIES) {
      const p = palette(s, 'day');
      const now = [shade(p, s, 'day', WHITE, 'shadow', true), shade(p, s, 'day', WHITE, 'sun', true), shade(p, s, 'day', RED, 'shadow', true), shade(p, s, 'day', p.asphalt, 'top', false)];
      now.forEach((c, i) => c.forEach((v, k) => expect(Math.abs(v - BEFORE[s][i][k]), `${s} dia, amostra ${i}: ${c.join(',')} × ${BEFORE[s][i].join(',')}`).toBeLessThanOrEqual(1)));
    }
  });

  it('o céu continua quente no entardecer (o topo pode ser roxo, o horizonte é laranja/rosa) e a névoa tem cor: a correção é na luz, não no céu', () => {
    for (const s of SCENERIES) {
      const p = palette(s, 'dusk');
      const h = lin(p.sky[2]);
      expect(h[0], `${s}: horizonte R > B`).toBeGreaterThan(h[2]);
      expect(chroma(lin(p.fog).map(srgb8) as V), `${s}: névoa com cor`).toBeGreaterThan(0.25);
    }
  });
});

// ───────────────────────────── 2b. asfalto de dia à sombra (V4b) ─────────────────────────────
// A cor-brilho travou "o dia não muda" (Copacabana, o melhor quadro) e com ela o azul-marinho do asfalto à sombra, `(0,40,98)` na captura: a luz que cai nele é
// a hemisférica + a IBL do céu (azuis) e o pé do Neutral zera o vermelho; com a textura nova da V4 (pedrisco, trilhas, remendos) o marinho engole o desgaste.
// O dono liberou a trava SÓ para a pista, de dia (docs/ondas/V4b-sombra.md). O que muda de propósito: a luz AMBIENTE do material da pista (hemisférica + IBL
// do céu) vira cinza quente da mesma luminância (`gradingFor(p).road`). O que continua travado: o resto do dia (o teste "o dia não muda" acima, que mede o
// MESMO asfalto sob a luz dos outros materiais), o entardecer e a noite (a pista não muda), o piso de contraste com as faixas.

const wcagLum = (c: V): number => { const f = (v: number): number => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
/** Razão de contraste do WCAG entre duas cores 0..255 (1 = iguais). */
const wcag = (a: V, b: V): number => { const x = wcagLum(a); const y = wcagLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const luma8 = (c: V): number => lum(c);

describe('2b. asfalto de dia à sombra: cinza quente, não azul-marinho (só a pista; V4b)', () => {
  const DAY = SCENERIES.map((s) => [s, palette(s, 'day')] as const);
  const roadShade = (s: SceneryId, p: Palette, road: boolean, sun: boolean, hex = p.asphalt): V => shade(p, s, 'day', hex, 'top', false, { road, sun });

  it('à sombra e ao sol, nos 6 biomas: o azul não passa do vermelho em mais de 20 e a cor é de saturação baixa (máx − mín ≤ 32, em 0..255)', () => {
    const bad: string[] = [];
    for (const [s, p] of DAY) for (const sun of [false, true]) {
      const c = roadShade(s, p, true, sun);
      if (c[2] - c[0] > 20 || Math.max(...c) - Math.min(...c) > 32) bad.push(`${s} ${sun ? 'ao sol' : 'à sombra'} rgb(${c.join(',')})`);
    }
    expect(bad).toEqual([]);
  });

  it('a luminância parecida (0,8× a 1,7× a de hoje): o asfalto não vira um buraco preto nem um clarão', () => {
    const bad: string[] = [];
    for (const [s, p] of DAY) for (const sun of [false, true]) {
      const before = luma8(roadShade(s, p, false, sun)); const now = luma8(roadShade(s, p, true, sun));
      if (now < 0.8 * before || now > 1.7 * before) bad.push(`${s} ${sun ? 'ao sol' : 'à sombra'}: luma ${before.toFixed(0)} → ${now.toFixed(0)}`);
    }
    expect(bad).toEqual([]);
  });

  it('o piso de contraste com as faixas se mantém: a faixa branca contra o asfalto, à sombra e ao sol, ≥ 3:1 (WCAG) e ≥ 0,6× o de hoje', () => {
    const bad: string[] = [];
    for (const [s, p] of DAY) for (const sun of [false, true]) {
      const before = wcag(roadShade(s, p, false, sun, p.lane), roadShade(s, p, false, sun));
      const now = wcag(roadShade(s, p, true, sun, p.lane), roadShade(s, p, true, sun));
      if (now < 3 || now < 0.6 * before) bad.push(`${s} ${sun ? 'ao sol' : 'à sombra'}: ${before.toFixed(2)} → ${now.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });

  it('só a luz ambiente da pista de dia muda: entardecer e noite (mix 0) dão a MESMA cor do asfalto, com e sem a luz da pista', () => {
    for (const s of SCENERIES) for (const t of LATE) {
      const p = palette(s, t);
      expect(gradeOf(p).road?.mix ?? 0, `${s}:${t} mix`).toBe(0);
      for (const sun of [false, true]) expect(shade(p, s, t, p.asphalt, 'top', false, { road: true, sun }), `${s}:${t}`).toEqual(shade(p, s, t, p.asphalt, 'top', false, { road: false, sun }));
    }
  });

  it('a luz da pista não vaza para o resto do dia: a gradação do dia (pé do Neutral e saturação da IBL) segue a de antes, e a luz ambiente da pista de dia tem mix 1', () => {
    for (const s of SCENERIES) {
      const g = gradeOf(palette(s, 'day'));
      expect(g.toe ?? 0, `${s}: pé`).toBe(0); expect(g.fill ?? 1, `${s}: fill`).toBe(1);
      expect(g.road?.mix, `${s}: mix de dia`).toBe(1);
    }
  });

  it('no shader: só a família da pista tem o trecho da luz ambiente cinza, depois da IBL e antes da luz ser usada; o uniforme é compartilhado e o setStylizePalette o escreve', () => {
    const frag = (family: S.StylizeFamily): string => {
      const m = new THREE.MeshStandardMaterial(); S.applyStylize(m, family);
      const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
      m.onBeforeCompile(sh, {} as THREE.WebGLRenderer);
      expect(sh.uniforms).toHaveProperty('uStylizeRoad');
      return sh.fragmentShader;
    };
    const road = frag('road');
    expect(road).toContain('STYLIZE_ROAD_CODE');
    expect(road.indexOf('STYLIZE_ROAD_CODE'), 'depois do trecho da IBL (lights_fragment_maps)').toBeGreaterThan(road.indexOf('iblIrradiance = mix('));
    for (const f of ['ground', 'scenery', 'facade', 'car', 'ghost'] as const) expect(frag(f), f).not.toContain('STYLIZE_ROAD_CODE');
    const u = (S.stylizeUniforms as unknown as Record<string, { value: THREE.Vector4 }>).uStylizeRoad;
    expect(u?.value, 'uStylizeRoad').toBeInstanceOf(THREE.Vector4);
    S.setStylizePalette(palette('coast', 'day'));
    const g = gradeOf(palette('coast', 'day')).road!;
    expect([u!.value.x, u!.value.y, u!.value.z, u!.value.w].map((v) => +v.toFixed(5))).toEqual([...g.tint, g.mix].map((v) => +v.toFixed(5)));
    S.setStylizePalette(palette('coast', 'dusk'));
    expect(u!.value.w, 'entardecer: mix 0').toBe(0);
  });

  it('continua contínua na corrida que muda: o mix cai de 1 a 0 junto com a luz (1 → 0,7), sem degrau', () => {
    const p = palette('coast', 'day');
    const at = (light: number): number => gradeOf({ ...p, light }).road?.mix ?? -1;
    expect(at(1)).toBe(1); expect(at(0.7)).toBe(0);
    let prev = 1;
    for (let l = 1; l >= 0.7; l -= 0.01) { const m = at(l); expect(m, `light ${l.toFixed(2)}`).toBeLessThanOrEqual(prev + 1e-9); expect(prev - m, `degrau em ${l.toFixed(2)}`).toBeLessThan(0.2); prev = m; }
  });
});

// ───────────────────────────── 1. faróis do jogador ─────────────────────────────

function raceWith(x: number) {
  const restore = fakeCanvasDocument();
  const track = getTrack('copacabana');
  const state = createRace({
    trackId: 'copacabana', laps: 2, humans: [{ seat: 0, name: 'P1', carId: 'falcao', teamId: 0, color: '#fff' }], totalCars: 4, difficulty: 'profissional',
    manualGear: false, assists: { sharedNitro: false, tow: false, teamDraft: false, catchup: false }, seed: 42,
  }, track);
  const own = state.cars.findIndex((c) => c.seat === 0);
  state.cars[own].z = 200 * 120; state.cars[own].x = x; state.cars[own].steerPose = 0;
  state.cars.forEach((c, i) => { if (i !== own) c.z = state.cars[own].z - 100_000; });
  const scene = new THREE.Scene();
  const cars = new Cars(scene);
  restore();
  const frame: RenderFrame = {
    state, track, viewports: [], time: 0, paused: true, coop: false, showHud: false,
    options: { quality: 'high', showMinimap: false, screenShake: false, reduceEffects: false, palette: 'default' },
  };
  const pose = () => { cars.update(frame); cars.pose(buildRoadFrame(track, state.cars[own].z, 8, 60), state, track, own, [], 0); };
  const spots = scene.children.filter((o): o is THREE.SpotLight => (o as THREE.SpotLight).isSpotLight === true);
  return { cars, pose, spots, scene };
}

/** A irradiância que o three dá a um ponto a `d` m no eixo do SpotLight (cd ÷ d^decay × o corte suave da distância). */
const spotAt = (s: THREE.SpotLight, d: number): number => {
  const fall = 1 / Math.max(Math.pow(d, s.decay), 0.01);
  const cut = s.distance > 0 ? Math.pow(Math.min(1, Math.max(0, 1 - Math.pow(d / s.distance, 4))), 2) : 1;
  return s.intensity * fall * cut;
};

describe('1. faróis do jogador: no carro, e no entardecer sem passar a luz do céu', () => {
  it('os dois faróis saem da frente do carro do viewport: com o carro na faixa da direita (x = 0,6) os SpotLights e o alvo estão nele, não na linha central', { timeout: 120_000 }, () => {
    const { cars, pose, spots } = raceWith(0.6);
    cars.setLight(0.32);
    pose();
    expect(spots.length).toBe(2);
    const carX = 0.6 * ROAD_HALF_WIDTH_M;
    const mid = (spots[0].position.x + spots[1].position.x) / 2;
    expect(Math.abs(mid - carX), `farol no meio de x = ${mid.toFixed(2)} m, carro em ${carX.toFixed(2)} m`).toBeLessThan(0.3);
    for (const s of spots) expect(Math.abs(s.position.x - carX), 'cada farol dentro da largura do carro').toBeLessThan(1.1);
    const tmid = (spots[0].target.position.x + spots[1].target.position.x) / 2;
    expect(Math.abs(tmid - carX), `alvo em x = ${tmid.toFixed(2)} m`).toBeLessThan(2.5);
    // E de volta ao centro: o mesmo carro na linha central leva os faróis com ele.
    const c2 = raceWith(0);
    c2.cars.setLight(0.32); c2.pose();
    expect(Math.abs((c2.spots[0].position.x + c2.spots[1].position.x) / 2)).toBeLessThan(0.3);
  });

  it('no entardecer o farol, num carro 20 m à frente, não passa da luz do céu na traseira dele (hemisférica + IBL); à noite ele manda (≥ 1,5×)', { timeout: 120_000 }, () => {
    const bad: string[] = [];
    const { cars, spots } = raceWith(0);
    for (const s of SCENERIES) {
      for (const t of ['dusk', 'night'] as const) {
        const p = palette(s, t);
        cars.setLight(p.light);
        const head = spots[0].visible ? spotAt(spots[0], 20) : 0;
        const sun = sunSetup(t, s).dir;
        const back = new THREE.Vector3(sun.x, 0, sun.z).normalize().negate();
        const fill = p.hemiIntensity * lum(mixv(lin(p.hemiGround), lin(p.hemiSky), 0.5)) + Math.PI * p.envIntensity * lum(envAround(p, back, sun));
        if (t === 'dusk' && head > fill) bad.push(`${s}:dusk farol ${head.toFixed(2)} > céu ${fill.toFixed(2)}`);
        if (t === 'night' && head < 1.5 * fill) bad.push(`${s}:night farol ${head.toFixed(2)} < 1,5 × céu ${fill.toFixed(2)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('de dia os faróis não acendem', { timeout: 120_000 }, () => {
    const { cars, spots } = raceWith(0);
    cars.setLight(1);
    for (const s of spots) expect(s.visible && s.intensity > 0).toBe(false);
  });
});

describe('1. as linhas de velocidade e do vácuo à noite (as barras brancas de Sampa)', () => {
  // Em Sampa as barras brancas ao lado dos carros à frente somem sem os efeitos (medido no harness com o grupo `fx-*` escondido): são as linhas
  // aditivas brancas (M5), com o MESMO brilho de dia e à noite; sobre a cena 10× mais escura elas viram um feixe de farol.
  function alphaAt(p: Palette): number {
    const t = getTrack('copacabana');
    const state = createRace({
      trackId: 'copacabana', laps: 3, humans: [{ seat: 0, name: 'P1', carId: 'falcao', teamId: 0, color: '#fff' }], totalCars: 4, difficulty: 'profissional',
      manualGear: false, assists: { sharedNitro: false, tow: false, teamDraft: false, catchup: false }, seed: 42,
    }, t);
    state.phase = 'racing'; state.tick = 900;
    const me = state.cars.find((c) => c.seat === 0)!;
    for (const c of state.cars) if (c !== me) c.z = (me.z + t.length / 2) % t.length;
    const frame = { state, track: t, time: 5, paused: false, coop: false, showHud: false,
      viewports: [{ seat: 0, carIndex: state.cars.indexOf(me), color: '#fff', name: 'P1', messages: [] }],
      options: { quality: 'high', showMinimap: false, screenShake: false, reduceEffects: false, palette: 'default' } } as unknown as RenderFrame;
    const fx = new Effects();
    fx.setPalette(p);
    let sum = 0; let n = 0;
    for (let i = 0; i < 90; i++) {
      me.speed = me.stats.topSpeed; me.z = (me.z + me.speed / 60) % t.length; me.progress += me.speed / 60;
      frame.time += 1 / 60; fx.update(frame);
      fx.pose(buildRoadFrame(t, me.z, 30, 200), t, 600, 0);
    }
    const color = (fx.streaks as unknown as { color: THREE.BufferAttribute }).color;
    for (let k = 0; k < fx.streaks.count; k++) { sum += color.getW(k * 4); n++; }
    expect(n, 'há linhas acesas').toBeGreaterThan(5);
    return sum / n;
  }

  it('à noite as linhas brancas têm no máximo 55% do brilho do dia; no entardecer, no máximo 85%', { timeout: 120_000 }, () => {
    const day = alphaAt(palette('city_night', 'day'));
    expect(alphaAt(palette('city_night', 'night')) / day).toBeLessThanOrEqual(0.55);
    expect(alphaAt(palette('city_night', 'dusk')) / day).toBeLessThanOrEqual(0.85);
  });
});

// ───────────────────────────── 3. lanternas ─────────────────────────────

/** O emissivo da lanterna (linear) no centro (w = 1) e na borda: a função pura que o GLSL espelha, ou a conta de hoje (lente × brilho) se ela não existe. */
const lampEmission = (rgb: readonly number[], w: number, glow: number): V => {
  const f = (M as unknown as { lampEmission?: (rgb: readonly number[], w: number, glow: number) => V }).lampEmission;
  return f ? f(rgb, w, glow) : [rgb[0] * w * glow, rgb[1] * w * glow, rgb[2] * w * glow];
};

describe('3. lanternas: emissivas de verdade, com miolo e borda, fortes à noite e discretas de dia', () => {
  let shared: Cars | null = null;
  const uniformsAt = (light: number) => {
    if (!shared) { const restore = fakeCanvasDocument(); shared = new Cars(new THREE.Scene()); restore(); }
    shared.setLight(light);
    const u = (shared as unknown as { rigs: Array<{ uniforms: M.CarUniforms }> }).rigs[0].uniforms;
    return { uTailGlow: { value: u.uTailGlow.value }, uBrakeGlow: { value: u.uBrakeGlow.value } };
  };

  it('a lente não é chapada: no modelo do GT o emissivo da lanterna vai do miolo (1) à borda (≤ 0,45 do miolo), sem tocar no farol', { timeout: 120_000 }, () => {
    const g = buildModel('gt').shell;
    const mat = g.getAttribute('aMat'); const col = g.getAttribute('color');
    // O peso do emissivo que o shader usa: o do pincel (aMat.w) × o da lente (atributo aLens, 0 no centro e 1 na borda; sem ele, chapado).
    const lens = g.getAttribute('aLens') as THREE.BufferAttribute | undefined;
    const rim = (K as unknown as { LENS_RIM?: number }).LENS_RIM ?? 1;
    let hi = 0; let lo = Infinity;
    for (let i = 0; i < mat.count; i++) {
      const w = mat.getW(i) * (1 - (1 - rim) * (lens ? lens.getX(i) : 0));
      // Só a lente vermelha acesa (a cor do pincel TAIL), não a lanterna apagada nem o escape.
      if (w > 0 && Math.abs(col.getX(i) - TAIL.rgb[0]) < 0.02 && Math.abs(col.getY(i) - TAIL.rgb[1]) < 0.02) { hi = Math.max(hi, w); lo = Math.min(lo, w); }
    }
    expect(hi).toBeGreaterThan(0.95);
    expect(lo / hi, `borda ${lo.toFixed(2)} × miolo ${hi.toFixed(2)}`).toBeLessThanOrEqual(0.45);
  });

  it('V2 (realismo 2): de dia o miolo da lanterna já esquenta para laranja (verde ≥ 20% do vermelho; era 2%), a borda continua vermelha e o miolo segue abaixo do limiar do bloom', { timeout: 120_000 }, () => {
    // No HCT a lanterna acesa de dia tem o miolo laranja visível. O teto (0,8 × o limiar do bloom de dia) é o do teste seguinte e não muda.
    for (const s of SCENERIES) {
      const p = palette(s, 'day');
      const u = uniformsAt(p.light);
      const core = lampEmission(TAIL.rgb, 1, u.uTailGlow.value);
      const rim = lampEmission(TAIL.rgb, K.LENS_RIM ?? 0.4, u.uTailGlow.value);
      expect(core[1] / core[0], `${s}: miolo ${core.map((v) => v.toFixed(2)).join(',')}`).toBeGreaterThanOrEqual(0.2);
      expect(rim[1] / rim[0], `${s}: borda ${rim.map((v) => v.toFixed(2)).join(',')}`).toBeLessThanOrEqual(0.08);
      expect(lum(core), `${s}: miolo de dia ${lum(core).toFixed(2)} × limiar ${p.bloom[2]}`).toBeLessThanOrEqual(0.8 * p.bloom[2]);
    }
  });

  it('à noite o miolo da lanterna passa do limiar do bloom (o halo existe); de dia fica abaixo (sem halo); o freio é sempre mais forte', { timeout: 120_000 }, () => {
    const bad: string[] = [];
    for (const s of SCENERIES) {
      for (const t of TIMES_OF_DAY) {
        const p = palette(s, t);
        const u = uniformsAt(p.light);
        const core = lum(lampEmission(TAIL.rgb, 1, u.uTailGlow.value));
        const brake = lum(lampEmission(TAIL.rgb, 1, u.uBrakeGlow.value));
        const threshold = p.bloom[2];
        if (t === 'night' && core < 1.2 * threshold) bad.push(`${s}:night miolo ${core.toFixed(2)} < 1,2 × limiar ${threshold}`);
        if (t === 'day' && core > 0.8 * threshold) bad.push(`${s}:day miolo ${core.toFixed(2)} > 0,8 × limiar ${threshold}`);
        if (!(brake > core * 1.3)) bad.push(`${s}:${t} freio ${brake.toFixed(2)} ≤ 1,3 × lanterna ${core.toFixed(2)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('a borda da lente segue vermelha (o miolo pode esquentar para o laranja-branco, a borda não): G ≤ 0,35 × R na borda, à noite', { timeout: 120_000 }, () => {
    const u = uniformsAt(0.32);
    const rim = lampEmission(TAIL.rgb, 0.4, u.uTailGlow.value);
    expect(rim[1] / rim[0]).toBeLessThanOrEqual(0.35);
    expect(rim[0]).toBeGreaterThan(0);
  });
});

// ───────────────────────────── 4. verniz com reflexo ─────────────────────────────

describe('4. pintura com reflexo do céu e do horizonte, coerente com o período', () => {
  const sky = (): Record<string, { value: THREE.Vector3 }> => S.stylizeUniforms as unknown as Record<string, { value: THREE.Vector3 }>;

  it('setStylizePalette escreve o céu (topo, horizonte) e o chão do período em uniformes compartilhados: o entardecer e o dia dão reflexos diferentes', () => {
    S.setStylizePalette(palette('coast', 'day'));
    const day = ['uStylizeSkyTop', 'uStylizeSkyHorizon', 'uStylizeGround'].map((k) => sky()[k]?.value?.clone());
    S.setStylizePalette(palette('coast', 'dusk'));
    const dusk = ['uStylizeSkyTop', 'uStylizeSkyHorizon', 'uStylizeGround'].map((k) => sky()[k]?.value?.clone());
    for (const v of [...day, ...dusk]) expect(v, 'uniforme do céu no reflexo').toBeInstanceOf(THREE.Vector3);
    // O horizonte do entardecer é mais quente (R/B) que o do dia.
    expect(dusk[1]!.x / Math.max(1e-3, dusk[1]!.z)).toBeGreaterThan(day[1]!.x / Math.max(1e-3, day[1]!.z));
    // O chão refletido é mais escuro que o horizonte (a linha do horizonte aparece na lataria).
    for (const v of [day, dusk]) expect(lum([v[2]!.x, v[2]!.y, v[2]!.z])).toBeLessThan(lum([v[1]!.x, v[1]!.y, v[1]!.z]));
  });

  it('o shader dos carros mistura o reflexo na lataria pintada com Fresnel (horizonte nítido entre céu e chão), depois da luz e antes da saída', () => {
    const { material } = M.createCarMaterial();
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    const f = shader.fragmentShader;
    expect(f).toContain('uStylizeSkyHorizon');
    expect(f).toContain('uVarnish');
    const at = (n: string) => f.indexOf(n);
    // O uso (não a declaração): depois de toda a luz, antes da saída.
    expect(at('outgoingLight = carVarnish(')).toBeGreaterThan(at('#include <lights_fragment_end>'));
    expect(at('outgoingLight = carVarnish(')).toBeLessThan(at('#include <opaque_fragment>'));
    expect(shader.uniforms).toHaveProperty('uStylizeSkyHorizon');
  });

  it('degraus: a Baixa não tem o reflexo (força 0); Média, Alta e Ultra têm', () => {
    const { material, uniforms } = M.createCarMaterial();
    const u = uniforms as unknown as Record<string, { value: number } | undefined>;
    for (const [q, on] of [['low', false], ['medium', true], ['high', true], ['ultra', true]] as const) {
      M.setCarQuality(material, q, uniforms);
      expect(u.uVarnish?.value ?? 0, q).toSatisfy((v: number) => (on ? v > 0 : v === 0));
    }
  });
});

// ───────────────────────────── 5. chama do nitro ─────────────────────────────

describe('5. chama do nitro: língua de fogo alongada, não gota branca', () => {
  /** Raio de cada anel da malha (por posição ao longo da chama, 0 no escape e 1 na ponta). */
  const rings = (): Array<[number, number]> => {
    const pos = F.buildFlameGeometry().getAttribute('position');
    const by = new Map<number, number>();
    for (let i = 0; i < pos.count; i++) { const t = Math.round(pos.getZ(i) * 1000) / 1000; by.set(t, Math.max(by.get(t) ?? 0, Math.hypot(pos.getX(i), pos.getY(i)))); }
    return [...by.entries()].sort((a, b) => a[0] - b[0]);
  };
  // O tamanho da chama no carro: o exportado novo, ou o de hoje (largura 0,5, comprimento 2,3 em cars.ts) se ele não existe.
  const size = (): { width: number; length: number } => (F as unknown as { FLAME_SIZE?: { width: number; length: number } }).FLAME_SIZE ?? { width: 0.5, length: 2.3 };

  it('afina: o raio maior fica junto do escape (t ≤ 0,15) e só diminui até a ponta; no carro, o comprimento é ≥ 5× o diâmetro (era uma gota de barriga a 25%)', () => {
    const r = rings();
    const max = r.reduce((m, x) => (x[1] > m[1] ? x : m));
    expect(max[0], `raio máximo ${max[1].toFixed(2)} em t = ${max[0]}`).toBeLessThanOrEqual(0.15);
    for (let i = 1; i < r.length; i++) if (r[i][0] > max[0]) expect(r[i][1], `t = ${r[i][0]}`).toBeLessThanOrEqual(r[i - 1][1] + 1e-9);
    const { width, length } = size();
    expect(length / (2 * max[1] * width), 'comprimento ÷ diâmetro').toBeGreaterThanOrEqual(5);
  });

  function flameAt(reduce: boolean, light = 1): { len: number; level: number; gain: number } {
    const restore = fakeCanvasDocument();
    const track = getTrack('copacabana');
    const state = createRace({
      trackId: 'copacabana', laps: 2, humans: [{ seat: 0, name: 'P1', carId: 'falcao', teamId: 0, color: '#fff' }], totalCars: 4, difficulty: 'profissional',
      manualGear: false, assists: { sharedNitro: false, tow: false, teamDraft: false, catchup: false }, seed: 42,
    }, track);
    const own = state.cars.findIndex((c) => c.seat === 0);
    state.cars.forEach((c, i) => { if (i !== own) c.z = state.cars[own].z - 100_000; });
    state.cars[own].nitroTicks = 90;
    const cars = new Cars(new THREE.Scene());
    restore();
    cars.setLight(light);
    const frame: RenderFrame = {
      state, track, viewports: [], time: 0.5, paused: true, coop: false, showHud: false,
      options: { quality: 'high', showMinimap: false, screenShake: false, reduceEffects: reduce, palette: 'default' },
    };
    cars.update(frame); cars.pose(buildRoadFrame(track, state.cars[own].z, 8, 60), state, track, own, [], 0.5);
    const inner = cars as unknown as { flames: THREE.InstancedMesh; flameExtra: THREE.InstancedBufferAttribute; flameMaterial: THREE.ShaderMaterial };
    const m = new THREE.Matrix4(); inner.flames.getMatrixAt(0, m);
    const sc = new THREE.Vector3(); m.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc);
    const gain = (inner.flameMaterial.uniforms as Record<string, { value: number } | undefined>).uFlameGain?.value ?? 1;
    return { len: sc.z, level: inner.flameExtra.getY(0), gain };
  }

  it('"Reduzir efeitos": a chama fica mais curta (≤ 0,7×) e mais fraca (força ≤ 0,6×)', { timeout: 120_000 }, () => {
    const full = flameAt(false); const calm = flameAt(true);
    expect(calm.len / full.len).toBeLessThanOrEqual(0.7);
    expect(calm.level / full.level).toBeLessThanOrEqual(0.6);
  });

  it('a força da chama segue a luz do período: à noite ≤ 0,75× a do dia (legível de dia, sem estourar no escuro)', { timeout: 120_000 }, () => {
    expect(flameAt(false, 0.32).gain / flameAt(false, 1).gain).toBeLessThanOrEqual(0.75);
  });
});
