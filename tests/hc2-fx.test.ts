// V10 (HC2), B: efeitos de velocidade vistosos e estilizados. A V8 os deixou tímidos (riscos de 3,5–7 cm, alfa 0,30, chama só no nitro) por causa da diretriz
// "mais realista"; o Horizon Chase 2 (docs/ondas/V10-hc2.md) mostra riscos brancos largos nos cantos, jatos de fogo nos escapes e poeira grande atrás dos pneus.
// Aqui as funções puras (sem GL): o plano por degrau, o risco de canto, o jato do escape e a poeira. A imagem está em hc2-gl.test.ts.
import { describe, expect, it } from 'vitest';
import { fxPlan } from '../src/render/fx/plan';
import { cornerStreak, type LineSpec } from '../src/render/fx/lines';
import { emitExhaustFire, type SparkCar, type SparkSpec } from '../src/render/fx/sparks';
import { emitGrassDust, type PuffCar, type PuffSpec } from '../src/render/fx/smoke';

let seed = 1;
const rnd = (): number => { seed = (seed * 16807 + 11) % 2147483647; return (seed % 100003) / 100003; };
const blank = (): LineSpec => ({ dz: 0, tail: 0, lat: 0, h: 0, width: 0, r: 0, g: 0, b: 0, a: 0 });

describe('B. plano: riscos de canto, jato do escape e poeira por degrau', () => {
  it('riscos de canto: 8, 12, 16 e 20 do Baixa ao Ultra; metade em 3 ou 4 jogadores; nenhum em "Reduzir efeitos"; o cartum acende mais', () => {
    const q = ['low', 'medium', 'high', 'ultra'] as const;
    expect(q.map((l) => fxPlan(l, false).cornerStreaks)).toEqual([8, 12, 16, 20]);
    expect(fxPlan('high', false, 4).cornerStreaks).toBe(8);
    expect(fxPlan('high', true).cornerStreaks).toBe(0);
    expect(fxPlan('high', false, 1, true).cornerStreaks).toBeGreaterThanOrEqual(24);
  });
  it('jato do escape: fator 0,6 a 1 por degrau (cartum 1,5), zero em "Reduzir efeitos"', () => {
    for (const l of ['low', 'medium', 'high', 'ultra'] as const) {
      const f = fxPlan(l, false).exhaustFire;
      expect(f).toBeGreaterThanOrEqual(0.6); expect(f).toBeLessThanOrEqual(1);
      expect(fxPlan(l, true).exhaustFire).toBe(0);
      expect(fxPlan(l, false, 1, true).exhaustFire).toBeCloseTo(f * 1.5, 5);
    }
  });
  it('poeira: tamanho 1 em "Reduzir efeitos" (comportamento de antes), 1,8 no padrão e 2,3 no cartum', () => {
    expect(fxPlan('high', true).dustScale).toBe(1);
    expect(fxPlan('high', false).dustScale).toBeCloseTo(1.8, 5);
    expect(fxPlan('high', false, 1, true).dustScale).toBeCloseTo(2.3, 5);
  });
});

describe('B. riscos largos de canto de tela', () => {
  const N = 16;
  const each = (strength: number, fn: (s: LineSpec, k: number) => void, travel = 123.4, cartoon = false): void => {
    for (let k = 0; k < N; k++) { const s = blank(); if (cornerStreak(k, N, travel, 110, strength, cartoon, s)) fn(s, k); }
  };
  it('largos: de 14 a 34 cm (os de fio têm 3,5 a 7 cm), e no cartum de 20 a 48 cm', () => {
    each(1, (s, k) => { expect(s.width, `risco ${k}`).toBeGreaterThanOrEqual(0.14); expect(s.width, `risco ${k}`).toBeLessThanOrEqual(0.34); });
    each(1, (s, k) => { expect(s.width, `risco ${k}`).toBeGreaterThanOrEqual(0.2); expect(s.width, `risco ${k}`).toBeLessThanOrEqual(0.48); }, 123.4, true);
  });
  it('vistosos: alfa de pico entre 0,45 e 0,6 na velocidade máxima (os de fio: ≤ 0,30)', () => {
    let peak = 0;
    for (let t = 0; t < 40; t += 0.5) each(1, (s) => { peak = Math.max(peak, s.a); }, t);
    expect(peak).toBeGreaterThanOrEqual(0.45); expect(peak).toBeLessThanOrEqual(0.6);
  });
  it('ficam nos cantos: afastados da pista (|lat| de 3 a 6,5 m) e ou baixos (h ≤ 1,3 m) ou altos (h ≥ 2,2 m), nunca na linha do horizonte do meio', () => {
    each(1, (s, k) => {
      expect(Math.abs(s.lat), `risco ${k}`).toBeGreaterThanOrEqual(3); expect(Math.abs(s.lat), `risco ${k}`).toBeLessThanOrEqual(6.5);
      expect(s.h <= 1.3 || s.h >= 2.2, `risco ${k} h=${s.h}`).toBe(true);
    });
  });
  it('os dois lados e os dois cantos (alto e baixo) aparecem', () => {
    const lados = new Set<string>();
    each(1, (s) => { lados.add(`${Math.sign(s.lat)}${s.h >= 2.2 ? 'alto' : 'baixo'}`); });
    expect(lados.size).toBe(4);
  });
  it('sem piscar: o alfa é função só do deslocamento e muda no máximo 0,06 a cada 10 cm andados (nasce e some em rampa)', () => {
    for (let k = 0; k < N; k++) {
      let prev = -1;
      for (let t = 0; t < 120; t += 0.1) {
        const s = blank(); cornerStreak(k, N, t, 110, 1, false, s);
        if (prev >= 0) expect(Math.abs(s.a - prev), `risco ${k} em ${t.toFixed(1)} m`).toBeLessThanOrEqual(0.06);
        prev = s.a;
      }
    }
  });
  it('nada sem intensidade, e a intensidade escala o alfa; riscos fora do conjunto não existem', () => {
    const s = blank();
    expect(cornerStreak(0, N, 10, 110, 0, false, s)).toBe(false);
    expect(cornerStreak(N, N, 10, 110, 1, false, s)).toBe(false);
    expect(cornerStreak(-1, N, 10, 110, 1, false, s)).toBe(false);
    let a1 = 0; let a5 = 0;
    for (let t = 0; t < 40; t += 0.5) { each(1, (x) => { a1 = Math.max(a1, x.a); }, t); each(0.5, (x) => { a5 = Math.max(a5, x.a); }, t); }
    expect(a5).toBeLessThan(a1 * 0.8);
  });
  it('a cauda vai para a frente da cabeça e cresce com a velocidade (risco comprido, não ponto)', () => {
    const slow = blank(); const fast = blank();
    cornerStreak(3, N, 20, 40, 1, false, slow); cornerStreak(3, N, 20, 120, 1, false, fast);
    expect(slow.tail - slow.dz).toBeGreaterThanOrEqual(5);
    expect(fast.tail - fast.dz).toBeGreaterThan(slow.tail - slow.dz);
  });
});

describe('B. jatos de fogo nos escapes', () => {
  const car = (over: Partial<SparkCar> = {}): SparkCar => ({ z: 5000, x: 0.1, speed: 6000, driftDir: 0, driftTicks: 0, ...over });
  const run = (mode: 'nitro' | 'accel', factor = 1, seconds = 10): SparkSpec[] => {
    const l: SparkSpec[] = []; seed = 5;
    for (let i = 0; i < 60 * seconds; i++) emitExhaustFire(car(), mode, 1 / 60, factor, rnd, (s) => l.push({ ...s }));
    return l;
  };
  it('com o nitro: ≥ 24 chamas por segundo por carro, fogo (R ≥ 2 G, G ≥ 3 B, HDR ≥ 2), 8 a 16 cm de largura, para trás, saindo dos dois escapes', () => {
    const l = run('nitro');
    expect(l.length / 10).toBeGreaterThanOrEqual(24);
    for (const s of l) {
      expect(s.r, 'R').toBeGreaterThanOrEqual(2); expect(s.r).toBeGreaterThanOrEqual(2 * s.g); expect(s.g).toBeGreaterThanOrEqual(3 * s.b);
      expect(s.width).toBeGreaterThanOrEqual(0.08); expect(s.width).toBeLessThanOrEqual(0.16);
      expect(s.z, 'sai atrás do centro do carro').toBeLessThan(5000);
      expect(s.svz, 'o risco aponta para trás, relativo ao carro').toBeLessThan(0);
    }
    expect(new Set(l.map((s) => Math.sign(s.x - 0.1))).size).toBe(2);
  });
  it('na aceleração: de 4 a 40% do jato do nitro (estouros curtos no escape, não uma chama contínua)', () => {
    const a = run('accel').length; const n = run('nitro').length;
    expect(a / 10).toBeGreaterThanOrEqual(4);
    expect(a).toBeLessThanOrEqual(n * 0.4);
  });
  it('fator 0 não solta nada; o fator escala a taxa', () => {
    expect(run('nitro', 0).length).toBe(0);
    expect(run('nitro', 0.5).length).toBeCloseTo(run('nitro', 1).length / 2, -2);
  });
  it('devagar demais (parado ou quase) não solta fogo', () => {
    const l: SparkSpec[] = [];
    for (let i = 0; i < 600; i++) emitExhaustFire(car({ speed: 300 }), 'nitro', 1 / 60, 1, rnd, (s) => l.push(s));
    expect(l).toEqual([]);
  });
});

describe('B. poeira grande e legível na terra e na areia', () => {
  const car = (over: Partial<PuffCar> = {}): PuffCar => ({ z: 5000, x: 0.2, speed: 5000, driftDir: 1, driftTicks: 30, driftCharge: 0, skidTicks: 6, ...over });
  const cor: readonly [number, number, number] = [0.54, 0.48, 0.35];
  const run = (scale: number): PuffSpec[] => { const l: PuffSpec[] = []; seed = 8; for (let i = 0; i < 120; i++) emitGrassDust(car(), cor, 1, rnd, (s) => l.push({ ...s }), scale); return l; };
  it('com escala 1 é a poeira de antes (bolha de 0,5 m, vida de 0,6 a 1,1 s)', () => {
    for (const s of run(1)) { expect(s.size).toBe(0.5); expect(s.life).toBeGreaterThanOrEqual(0.6); expect(s.life).toBeLessThanOrEqual(1.1); }
  });
  it('com escala 1,8: bolha de ≥ 0,85 m que incha ≥ 2,4 m, vive ≥ 1,0 s e solta ≥ 1,5× mais bolhas por quadro', () => {
    const l = run(1.8); const base = run(1);
    for (const s of l) { expect(s.size).toBeGreaterThanOrEqual(0.85); expect(s.grow).toBeGreaterThanOrEqual(2.4); expect(s.life).toBeGreaterThanOrEqual(1.0); }
    expect(l.length).toBeGreaterThanOrEqual(base.length * 1.5);
  });
});
