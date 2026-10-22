// V22 · F8 (docs/ondas/V22-f8-efeitos.md): poeira e fumaça com sprite irregular de 4 quadros (no lugar da esfera perfeita), trilha contínua na terra e na grama,
// partículas ambientes sutis e o cartão do marco fora da traseira do carro. Tudo puro (sem GL): o atlas, os emissores, o plano, os pontos ambientes e a CSS.
// A imagem em si (a nuvem de verdade) é do olho: docs/diag-v22/f8-efeitos/. Os limites de custo (0 △, ≤ +1 chamada) são de efeitos-gl.test.ts e gl-render.test.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getTrack } from '../src/core/track';
import type { Quality, RenderFrame } from '../src/game/contracts';
import { Effects } from '../src/render/effects';
import { fxPlan } from '../src/render/fx/plan';
import { contactPoint, emitImpact } from '../src/render/fx/impact';
import { emitBrakeSmoke, emitGrassDust, emitRoadDust, emitTireSmoke, type PuffCar, type PuffSpec } from '../src/render/fx/smoke';
import { AMBIENT_ALPHA_MAX, ambientMote, FRAME_PX, puffAtlas, SPRITE_FRAMES, SPRITE_PX, spriteAlpha, type Mote } from '../src/render/fx/sprite';
import { palette } from '../src/render/palette';
import { buildRoadFrame } from '../src/render/roadframe';
import { human, quickRace } from './helpers';

let seed = 1;
const rnd = (): number => { seed = (seed * 16807 + 11) % 2147483647; return (seed % 100003) / 100003; };
const car = (over: Partial<PuffCar> = {}): PuffCar => ({ z: 5000, x: 0.2, speed: 5000, driftDir: 1, driftTicks: 30, driftCharge: 0, skidTicks: 6, ...over });
const collect = (f: (out: (s: PuffSpec) => void) => void): PuffSpec[] => { const l: PuffSpec[] = []; f((s) => l.push({ ...s })); return l; };
const GRASS: readonly [number, number, number] = [0.5, 0.45, 0.3];
const LEVELS: readonly Quality[] = ['low', 'medium', 'high', 'ultra'];

// ───────────────────────────── 1. o sprite ─────────────────────────────

describe('F8: o sprite da fumaça não é um disco perfeito', () => {
  const ring = (frame: number, r: number, n = 72): number[] => Array.from({ length: n }, (_, i) => spriteAlpha(frame, r * Math.cos((i / n) * 2 * Math.PI), r * Math.sin((i / n) * 2 * Math.PI)));
  const std = (v: number[]): number => { const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };

  it('é um atlas de 4 quadros em ≤ 256 × 256 (RGBA, um quadro de 128 px)', () => {
    expect(SPRITE_PX).toBeLessThanOrEqual(256);
    expect(SPRITE_FRAMES).toBe(4);
    expect(FRAME_PX * 2).toBe(SPRITE_PX);
    expect(puffAtlas().length).toBe(SPRITE_PX * SPRITE_PX * 4);
  });

  it('a variação angular do alfa num anel a meio caminho do centro é ≥ 0,08 em cada quadro (o disco perfeito dá 0)', () => {
    for (let f = 0; f < SPRITE_FRAMES; f++) {
      for (const r of [0.6, 0.72]) expect(std(ring(f, r)), `quadro ${f}, raio ${r}`).toBeGreaterThanOrEqual(0.08); // o miolo (raio < 0,5) é denso de propósito: a variação está na silhueta
      expect(Math.max(std(ring(f, 0.5)), std(ring(f, 0.6)), std(ring(f, 0.7)))).toBeGreaterThanOrEqual(0.12);
    }
  });

  it('os 4 quadros são diferentes entre si (≥ 0,05 de alfa médio de diferença)', () => {
    const grid = (f: number): number[] => { const l: number[] = []; for (let y = -0.9; y <= 0.9; y += 0.06) for (let x = -0.9; x <= 0.9; x += 0.06) l.push(spriteAlpha(f, x, y)); return l; };
    const g = Array.from({ length: SPRITE_FRAMES }, (_, f) => grid(f));
    for (let i = 0; i < SPRITE_FRAMES; i++) for (let j = i + 1; j < SPRITE_FRAMES; j++) {
      const d = g[i].reduce((a, v, k) => a + Math.abs(v - g[j][k]), 0) / g[i].length;
      expect(d, `quadros ${i} e ${j}`).toBeGreaterThanOrEqual(0.05);
    }
  });

  it('gira sem mostrar o quadrado: alfa 0 fora do raio 0,97 e nos cantos; miolo denso; nuvem (30% a 80% da área), não bloco', () => {
    for (let f = 0; f < SPRITE_FRAMES; f++) {
      expect(Math.max(...ring(f, 0.98), ...ring(f, 1), ...ring(f, 1.2)), `quadro ${f}, borda`).toBeLessThanOrEqual(0.02);
      for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [1, 0]]) expect(spriteAlpha(f, x, y)).toBe(0);
      expect(spriteAlpha(f, 0, 0), `quadro ${f}, centro`).toBeGreaterThanOrEqual(0.7);
      let cover = 0; let n = 0;
      for (let y = -1; y <= 1; y += 0.04) for (let x = -1; x <= 1; x += 0.04) { if (Math.hypot(x, y) > 1) continue; n++; if (spriteAlpha(f, x, y) > 0.3) cover++; }
      expect(cover / n, `quadro ${f}, cobertura`).toBeGreaterThanOrEqual(0.3);
      expect(cover / n, `quadro ${f}, cobertura`).toBeLessThanOrEqual(0.8);
    }
  });

  it('o canal R do atlas é o ruído de erosão (a nuvem se desfaz pela borda): varia dentro da nuvem', () => {
    const a = puffAtlas(); const vals: number[] = [];
    for (let y = 40; y < 90; y += 3) for (let x = 40; x < 90; x += 3) vals.push(a[(y * SPRITE_PX + x) * 4]);
    expect(std(vals.map((v) => v / 255))).toBeGreaterThanOrEqual(0.05);
  });
});

// ───────────────────────────── 2. as partículas giram e variam ─────────────────────────────

describe('F8: cada partícula leva rotação, quadro e tom próprios', () => {
  const all = (): PuffSpec[] => {
    seed = 11;
    return [
      ...collect((o) => { for (let i = 0; i < 200; i++) emitTireSmoke(car(), 1 / 60, 1, rnd, o); }),
      ...collect((o) => { for (let i = 0; i < 400; i++) emitBrakeSmoke(car({ skidTicks: 0 }), 99999, 100, 0, 1, rnd, o); }),
      ...collect((o) => { for (let i = 0; i < 120; i++) emitGrassDust(car(), GRASS, 1, rnd, o, 1.8); }),
    ];
  };
  it('rotação ≠ 0 (de 0 a 2π, espalhada), giro em rad/s ≠ 0 nos dois sentidos, e os 4 quadros aparecem', () => {
    const l = all();
    expect(l.length).toBeGreaterThan(100);
    const rots = l.map((s) => s.rot ?? 0); const spins = l.map((s) => s.spin ?? 0);
    expect(rots.filter((r) => r !== 0).length, 'rotação ≠ 0').toBe(l.length);
    for (const r of rots) { expect(r).toBeGreaterThan(0); expect(r).toBeLessThan(2 * Math.PI + 1e-6); }
    expect(Math.max(...rots) - Math.min(...rots), 'espalhada').toBeGreaterThan(4);
    for (const s of spins) expect(Math.abs(s)).toBeGreaterThanOrEqual(0.3);
    expect(spins.some((s) => s > 0) && spins.some((s) => s < 0)).toBe(true);
    expect(new Set(l.map((s) => s.frame)).size).toBe(4);
    for (const s of l) { expect(Number.isInteger(s.frame)).toBe(true); expect(s.frame).toBeGreaterThanOrEqual(0); expect(s.frame).toBeLessThanOrEqual(3); }
  });
  it('o tom varia por partícula (≥ 3% de desvio no brilho) sem sair de ±16% da cor-base; a fumaça branca continua branca', () => {
    seed = 5;
    const l: PuffSpec[] = []; let cz = 20000;
    for (let i = 0; i < 240; i++) { cz += 5000 / 60; emitGrassDust(car({ z: cz }), GRASS, 1, rnd, (x) => l.push({ ...x }), 1.8, { dt: 1 / 60, rate: 100 }); }
    const lum = l.map((s) => (s.r + s.g + s.b) / 3); const base = (GRASS[0] + GRASS[1] + GRASS[2]) / 3;
    const m = lum.reduce((a, b) => a + b, 0) / lum.length;
    expect(Math.sqrt(lum.reduce((a, b) => a + (b - m) ** 2, 0) / lum.length) / base).toBeGreaterThanOrEqual(0.03);
    for (const v of lum) { expect(v).toBeGreaterThanOrEqual(base * 0.84); expect(v).toBeLessThanOrEqual(base * 1.16); }
    const w = collect((o) => { for (let i = 0; i < 200; i++) emitTireSmoke(car(), 1 / 60, 1, rnd, o); });
    expect(new Set(w.map((s) => s.r.toFixed(3))).size, 'tons distintos').toBeGreaterThan(5);
  });
  it('as lascas da batida continuam duras (quadro −1: pedaço de plástico, não nuvem)', () => {
    seed = 2;
    const chips: PuffSpec[] = [];
    const at = contactPoint({ id: 0, z: 5000, x: 0, speed: 5000, collisionCooldown: 20 }, [], 100000, { z: 0, x: 0, h: 0, partner: -1 });
    emitImpact(at, 5000, 0.3, 1, rnd, () => undefined, (p) => chips.push({ ...p }));
    expect(chips.length).toBeGreaterThanOrEqual(3);
    for (const c of chips) expect(c.frame).toBe(-1);
  });
});

// ───────────────────────────── 3. a trilha contínua ─────────────────────────────

describe('F8: trilha contínua na terra e na grama', () => {
  /** `seconds` de corrida a `fps` quadros por segundo: o carro anda `speed·dt` por quadro e o emissor vê o `dt` do quadro. */
  const run = (fps: number, over: Partial<PuffCar> = {}, rate = 100, seconds = 4, speed = 5000): { l: PuffSpec[]; z: number[] } => {
    seed = 9; const l: PuffSpec[] = []; const z: number[] = []; let cz = 20000;
    for (let i = 0; i < fps * seconds; i++) {
      cz += speed / fps;
      emitGrassDust(car({ z: cz, speed, ...over }), GRASS, 1, rnd, (s) => { l.push({ ...s }); z.push(s.z); }, 1.8, { dt: 1 / fps, rate });
    }
    return { l, z };
  };
  it('taxa por segundo (não por quadro): 30, 60 e 144 quadros/s soltam o mesmo número de partículas (±12%)', () => {
    const n = [30, 60, 144].map((fps) => run(fps).l.length);
    for (const v of n) { expect(v / n[1], `${n}`).toBeGreaterThanOrEqual(0.88); expect(v / n[1]).toBeLessThanOrEqual(1.12); }
    expect(n[1] / 4, 'por segundo').toBeGreaterThanOrEqual(60);
  });
  it('é uma trilha: os pontos de nascimento cobrem o caminho andado, sem buraco maior que 4 m, a 30 quadros/s (o carro anda 3,3 m por quadro)', () => {
    const { z } = run(30, {}, 100, 4, 5000);
    const lado = run(30, {}, 100, 4, 5000).l.map((s, i) => ({ side: Math.sign(s.x - 0.2), z: z[i] }));
    for (const side of [-1, 1]) {
      const zs = lado.filter((p) => p.side === side).map((p) => p.z).sort((a, b) => a - b);
      expect(zs.length).toBeGreaterThan(40);
      let gap = 0; for (let i = 1; i < zs.length; i++) gap = Math.max(gap, zs[i] - zs[i - 1]);
      expect(gap / 50, `maior buraco do lado ${side} (m)`).toBeLessThanOrEqual(4);
    }
  });
  it('os dois lados do carro, fora do asfalto e em movimento: parado ou no asfalto não solta nada', () => {
    const { l } = run(60);
    expect(new Set(l.map((s) => Math.sign(s.x - 0.2))).size).toBe(2);
    expect(run(60, { skidTicks: 0 }).l).toEqual([]);
    expect(run(60, { speed: 100 }, 100, 4, 100).l).toEqual([]);
  });
  it('dentro dos tetos do plano: taxa × vida × 4 jogadores cabe no pool de 900 com folga, em todos os degraus e em "Reduzir efeitos" (que NÃO tira a poeira)', () => {
    for (const q of LEVELS) for (const reduce of [false, true]) for (const cartoon of [false, true]) {
      const p = fxPlan(q, reduce, 4, cartoon);
      expect(p.trail, `${q}${reduce ? ' reduzido' : ''}`).toBeGreaterThanOrEqual(40);
      expect(p.trail).toBeLessThanOrEqual(120);
      seed = 4; const l: PuffSpec[] = [];
      for (let i = 0; i < 600; i++) emitGrassDust(car({ z: 20000 + i * (5000 / 60) }), GRASS, p.smoke, rnd, (s) => l.push({ ...s }), p.dustScale, { dt: 1 / 60, rate: p.trail });
      const maxLife = Math.max(...l.map((s) => s.life));
      expect(p.trail * maxLife * 4, `${q}: vivas de 4 jogadores`).toBeLessThanOrEqual(900 * 0.85);
      expect(l.length / 10, 'por segundo, no teto do plano').toBeLessThanOrEqual(p.trail * 1.25);
    }
    expect(fxPlan('high', true).trail).toBe(fxPlan('high', false).trail);
    expect(fxPlan('low', false).trail).toBeLessThan(fxPlan('ultra', false).trail);
  });
  it('terra na própria pista (roadEarth ≥ 0,5): solta poeira das duas rodas traseiras, atrás do carro, proporcional à terra; asfalto (< 0,3) e parado não', () => {
    const rate = (earth: number, speed = 5000): { n: number; l: PuffSpec[] } => {
      seed = 3; const l: PuffSpec[] = [];
      for (let i = 0; i < 600; i++) emitRoadDust(car({ skidTicks: 0, speed, z: 20000 + i * (speed / 60) }), GRASS, earth, 1, rnd, (s) => l.push({ ...s }), 1.8, { dt: 1 / 60, rate: 100 });
      return { n: l.length / 10, l };
    };
    const t = rate(1);
    expect(t.n, 'por segundo na terra').toBeGreaterThanOrEqual(30);
    expect(new Set(t.l.map((s) => Math.sign(s.x - 0.2))).size).toBe(2);
    for (const s of t.l) { expect(s.z, 'atrás do carro').toBeLessThan(20000 + 600 * (5000 / 60) - 30); expect(s.h).toBeLessThan(0.6); }
    expect(rate(0.5).n).toBeLessThan(t.n * 0.8); expect(rate(0.5).n).toBeGreaterThan(0);
    expect(rate(0.25).n).toBe(0); expect(rate(0).n).toBe(0);
    expect(rate(1, 100).n).toBe(0);
  });
});

// ───────────────────────────── 4. partículas ambientes ─────────────────────────────

describe('F8: partículas ambientes sutis', () => {
  it('plano: 8 a 16 por viewport, mais nos degraus de cima, e ZERO em "Reduzir efeitos" (a fumaça continua escalada)', () => {
    for (const q of LEVELS) {
      const p = fxPlan(q, false); expect(p.ambient, q).toBeGreaterThanOrEqual(8); expect(p.ambient, q).toBeLessThanOrEqual(16);
      expect(fxPlan(q, true).ambient, `${q} reduzido`).toBe(0);
      expect(fxPlan(q, true).smoke, `${q}: fumaça não some`).toBeGreaterThan(0);
      expect(fxPlan(q, true).smoke).toBe(p.smoke);
      expect(fxPlan(q, true, 4).ambient).toBe(0);
    }
    for (let i = 1; i < LEVELS.length; i++) expect(fxPlan(LEVELS[i], false).ambient).toBeGreaterThanOrEqual(fxPlan(LEVELS[i - 1], false).ambient);
  });
  const M: Mote = { z: 0, x: 0, h: 0, size: 0, alpha: 0 };
  it('sem estado, perto do carro, pequenas e fracas: alfa ≤ 0,4, 4 a 10 cm, 0,3 a 4 m de altura, dentro de −12 m a +63 m ao longo e ±10 m de lado', () => {
    expect(AMBIENT_ALPHA_MAX).toBeLessThanOrEqual(0.4);
    let visible = 0;
    for (let t = 0; t < 30; t += 1.7) for (let k = 0; k < 16; k++) {
      ambientMote(k, t, 30000, 0.1, M);
      expect(M.alpha).toBeGreaterThanOrEqual(0); expect(M.alpha).toBeLessThanOrEqual(AMBIENT_ALPHA_MAX);
      if (M.alpha <= 0) continue;
      visible++;
      expect(M.size).toBeGreaterThanOrEqual(0.04); expect(M.size).toBeLessThanOrEqual(0.1);
      expect(M.h).toBeGreaterThanOrEqual(0.3); expect(M.h).toBeLessThanOrEqual(4.1);
      expect((M.z - 30000) / 50).toBeGreaterThanOrEqual(-12); expect((M.z - 30000) / 50).toBeLessThanOrEqual(63);
      expect(Math.abs(M.x - 0.1) * 7).toBeLessThanOrEqual(10);
    }
    expect(visible, 'a maioria está acesa').toBeGreaterThan(100);
    const a = { ...M }; ambientMote(3, 5, 30000, 0.1, M); const b = { ...M }; ambientMote(3, 5, 30000, 0.1, M);
    expect(b).toEqual({ ...M }); expect(a).toBeDefined();
  });
  it('estáveis no mundo: o carro anda 10 m e a mesma partícula continua no mesmo ponto da pista (não "nada" com o carro); só muda no giro do ciclo, apagada', () => {
    let achou = 0;
    for (let k = 0; k < 16; k++) {
      const a: Mote = { z: 0, x: 0, h: 0, size: 0, alpha: 0 }; const b: Mote = { ...a };
      ambientMote(k, 3, 30000, 0, a); ambientMote(k, 3, 30500, 0, b);
      if (a.alpha > 0.01 && b.alpha > 0.01 && Math.abs(a.z - b.z) < 37 * 50) { achou++; expect(Math.abs(a.z - b.z), `partícula ${k}`).toBeLessThan(1); expect(Math.abs(a.x - b.x)).toBeLessThan(1e-6); } // |Δz| > meio ciclo = deu a volta (o carro pulou 10 m de uma vez)
    }
    expect(achou).toBeGreaterThan(6);
  });
  it('movimento suave: a 60 quadros/s anda ≤ 3 cm por quadro e o alfa muda ≤ 0,02 por quadro', () => {
    for (let k = 0; k < 16; k++) {
      const a: Mote = { z: 0, x: 0, h: 0, size: 0, alpha: 0 }; const b: Mote = { ...a };
      for (let t = 0; t < 20; t += 1 / 60) {
        ambientMote(k, t, 30000, 0, a); ambientMote(k, t + 1 / 60, 30000, 0, b);
        expect(Math.abs(a.alpha - b.alpha), `partícula ${k} em ${t.toFixed(2)}`).toBeLessThanOrEqual(0.02);
        if (a.alpha > 0.005 && b.alpha > 0.005) expect(Math.hypot((a.z - b.z) / 50, (a.x - b.x) * 7, a.h - b.h)).toBeLessThanOrEqual(0.03);
      }
    }
  });
});

// ───────────────────────────── 5. no Effects: pool sem crescer, "Reduzir efeitos" ─────────────────────────────

describe('F8: no Effects', () => {
  function cena(quality: Quality, reduce: boolean) {
    const track = getTrack('xingo');
    const { state } = quickRace({ humans: [human(0)], totalCars: 3, track });
    state.phase = 'racing'; state.tick = 600;
    const idx = state.cars.findIndex((c) => c.seat === 0);
    for (const c of state.cars) if (c !== state.cars[idx]) c.z = (state.cars[idx].z + track.length / 2) % track.length;
    const frame = { state, track, time: 5, paused: false, coop: false, showHud: false, viewports: [{ seat: 0, carIndex: idx, color: '#fff', name: 'P1', messages: [] }],
      options: { quality, showMinimap: false, screenShake: true, reduceEffects: reduce, palette: 'default' } } as unknown as RenderFrame;
    const fx = new Effects(); fx.setPalette(palette('desert', 'day')); fx.update(frame);
    const me = state.cars[idx];
    const step = (n: number, drive: (c: typeof me) => void): void => { for (let i = 0; i < n; i++) { drive(me); me.z = (me.z + me.speed / 60) % track.length; frame.time += 1 / 60; fx.update(frame); } };
    const pose = (): { n: number; max: number; alphas: number[] } => {
      fx.pose(buildRoadFrame(track, me.z, 30, 200), track, 600, 0);
      const d = (fx as unknown as { dust: { points: { geometry: { drawRange: { count: number }; getAttribute: (n: string) => { array: Float32Array; count: number } } } } }).dust.points.geometry;
      const al = d.getAttribute('aAlpha');
      return { n: d.drawRange.count, max: al.count, alphas: Array.from(al.array.slice(0, d.drawRange.count)) };
    };
    return { fx, me, step, pose };
  }
  const parado = (c: { speed: number; skidTicks: number }): void => { c.speed = 0; c.skidTicks = 0; };

  it('o pool de partículas não cresce: 900 vagas, e as ambientes só usam as que sobram', () => {
    const s = cena('high', false);
    s.step(3, parado);
    const p = s.pose();
    expect(p.max).toBe(900);
    expect(p.n, 'parado: só as ambientes').toBeGreaterThanOrEqual(8);
    expect(p.n).toBeLessThanOrEqual(16);
    for (const a of p.alphas) expect(a).toBeLessThanOrEqual(AMBIENT_ALPHA_MAX + 1e-6);
  });
  it('"Reduzir efeitos": zero ambientes; e a poeira/fumaça continua saindo (escalada, não some)', () => {
    const on = cena('high', false); const off = cena('high', true);
    on.step(3, parado); off.step(3, parado);
    expect(off.pose().n, 'reduzido, parado: nada').toBe(0);
    expect(on.pose().n).toBeGreaterThanOrEqual(8);
    const fora = (c: { speed: number; skidTicks: number; driftDir: number; driftTicks: number }): void => { c.speed = 5000; c.skidTicks = 6; c.driftDir = 1; c.driftTicks = 30; };
    off.step(90, fora); on.step(90, fora);
    expect(off.fx.counts().puffs, 'reduzido: a poeira não some').toBeGreaterThan(30);
    expect(on.fx.counts().puffs).toBeGreaterThan(30);
    const nOff = off.pose().n;
    expect(nOff, 'reduzido: só partículas de poeira, nenhuma ambiente a mais').toBeLessThanOrEqual(off.fx.counts().puffs);
    expect(nOff).toBeGreaterThan(off.fx.counts().puffs * 0.9);
  });
  it('Baixa solta menos que Alta (mesma poeira, degrau menor) e o Baixa também tem ambientes', () => {
    const low = cena('low', false); const high = cena('high', false);
    const fora = (c: { speed: number; skidTicks: number }): void => { c.speed = 5000; c.skidTicks = 6; };
    low.step(120, fora); high.step(120, fora);
    expect(low.fx.counts().puffs).toBeLessThan(high.fx.counts().puffs);
    expect(low.fx.counts().puffs).toBeGreaterThan(0);
    const p = cena('low', false); p.step(3, parado);
    expect(p.pose().n).toBeGreaterThanOrEqual(8);
  });
  it('terra na pista: o carro em cima da estrada de terra (roadEarth ≥ 0,5) deixa trilha; em asfalto (Copacabana), não', () => {
    const terra = cena('high', false);
    const asfalto = (() => { const s = cena('high', false); s.fx.setPalette(palette('coast', 'day')); return s; })();
    const rodando = (c: { speed: number; skidTicks: number }): void => { c.speed = 5000; c.skidTicks = 0; };
    terra.step(90, rodando); asfalto.step(90, rodando);
    expect(terra.fx.counts().puffs, 'estrada de terra').toBeGreaterThan(40);
    expect(asfalto.fx.counts().puffs, 'asfalto').toBe(0);
  });
  it('o fragmento é o do sprite: amostra o atlas, gira a coordenada, mantém o marcador "// bolha" e o discard', () => {
    const fx = new Effects();
    const m = (fx as unknown as { dust: { points: { material: { fragmentShader: string; vertexShader: string; uniforms: Record<string, { value: unknown }> } } } }).dust.points.material;
    expect(m.fragmentShader).toContain('// bolha');
    expect(m.fragmentShader).toContain('uSprite');
    expect(m.fragmentShader).toContain('discard');
    expect(m.vertexShader).toContain('aSpr');
    const tex = m.uniforms.uSprite.value as { image: { width: number; height: number } };
    expect(tex.image.width).toBeLessThanOrEqual(256); expect(tex.image.height).toBeLessThanOrEqual(256);
  });
});

// ───────────────────────────── 6. o cartão do marco ─────────────────────────────

describe('F8: o cartão do marco fica fora da traseira do carro', () => {
  const css = readFileSync('src/render/caption/caption.css', 'utf8');
  const rule = (sel: string): string => { const m = css.match(new RegExp(`${sel.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`)); return m ? m[1] : ''; };
  const base = rule('.nc-hud .lmk');
  /** Pixels a --s = 1 de `calc(Npx * var(--s))` ou `Npx`. */
  const px = (decl: string): number | null => { const m = base.match(new RegExp(`(?:^|[;\\s])${decl}:\\s*(?:calc\\()?\\s*(-?[\\d.]+)px`)); return m ? Number(m[1]) : null; };

  it('ancorado no alto (top), não no pé (bottom): o pé do viewport, no meio, é a traseira do carro', () => {
    expect(base).not.toBe('');
    expect(base).not.toMatch(/(?:^|[;\s])bottom\s*:/);
    expect(px('top'), 'top em px a --s = 1').not.toBeNull();
  });
  /** A caixa do carro na tela (medida nas capturas 1280 × 720 da câmera Alta: docs/ondas/V22-f8-efeitos.md): do meio horizontal ±16%, de 60% da altura para baixo. */
  const CAR = { x0: 0.34, x1: 0.66, y0: 0.6, y1: 1 };
  it('o retângulo do cartão (top + 74 px de altura, 720 px de viewport, --s = 1) não cruza a caixa do carro, e a legenda não sobe para dentro dos painéis de cima (≥ 60 px)', () => {
    const top = px('top') ?? 9999;
    expect(top).toBeGreaterThanOrEqual(60);
    expect((top + 74) / 720, 'borda de baixo do cartão').toBeLessThan(CAR.y0);
    expect(base).toMatch(/left:\s*50%/); // centrado, onde o carro está: só fica livre por estar no alto
  });
  it('em tela dividida (viewport de 360 px de altura, --s = 0,5) continua acima da caixa do carro e abaixo do relógio do topo', () => {
    const top = (px('top') ?? 9999) * 0.5;
    expect((top + 74 * 0.5) / 360).toBeLessThan(CAR.y0);
  });
  it('"Reduzir efeitos" mantém a entrada simples; a saída desce de cima (translateY positivo some para baixo? não: sobe), nunca pelo pé', () => {
    expect(css).toMatch(/\.reduce-fx \.lmk/);
    expect(rule('.nc-hud .lmk')).toMatch(/transform:\s*translate\(-50%,\s*calc\(-/);
  });
});
