// M5: linhas de velocidade 3D acima de 85% da máxima (no lugar do gradiente CSS) e o túnel de ar do vácuo (computeModifiers). Os geradores
// (src/render/fx/lines.ts) são funções do deslocamento do carro, sem estado e sem sorteio; o Effects as junta ao lote de traços de cada viewport.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getTrack } from '../src/core/track';
import type { Quality, RenderFrame } from '../src/game/contracts';
import { Effects } from '../src/render/effects';
import { draftLine, lineCount, SPEED_LINES_START, speedLine, speedLineStrength, type LineSpec } from '../src/render/fx/lines';
import { fxPlan } from '../src/render/fx/plan';
import { buildRoadFrame } from '../src/render/roadframe';
import { human, quickRace } from './helpers';

const blank = (): LineSpec => ({ dz: 0, tail: 0, lat: 0, h: 0, width: 0, r: 0, g: 0, b: 0, a: 0 });
const all = (n: number, travel: number, strength: number, speed = 110): LineSpec[] => {
  const l: LineSpec[] = [];
  for (let k = 0; k < n; k++) { const s = blank(); if (speedLine(k, n, travel, speed, strength, s)) l.push(s); }
  return l;
};

describe('intensidade das linhas de velocidade', () => {
  it('nada até 85% da máxima, cheia na máxima, crescente; o nitro garante metade mesmo devagar', () => {
    expect(SPEED_LINES_START).toBe(0.85);
    expect(speedLineStrength(0.5, false)).toBe(0);
    expect(speedLineStrength(0.85, false)).toBe(0);
    expect(speedLineStrength(0.925, false)).toBeCloseTo(0.5, 6);
    expect(speedLineStrength(1, false)).toBeCloseTo(1, 9);
    expect(speedLineStrength(1.2, false)).toBe(1);
    let prev = 0;
    for (let sf = 0; sf <= 1.2001; sf += 0.005) { const v = speedLineStrength(sf, false); expect(v).toBeGreaterThanOrEqual(prev - 1e-12); prev = v; }
    expect(speedLineStrength(0.3, true)).toBeCloseTo(0.5, 6);
    expect(speedLineStrength(1, true)).toBe(1);
  });

  it('o número de linhas acesas cresce com a intensidade e vai de 0 ao teto', () => {
    expect(lineCount(40, 0)).toBe(0);
    expect(lineCount(40, 1)).toBe(40);
    expect(lineCount(40, 0.5)).toBe(20);
    expect(lineCount(10, 0.01)).toBe(1);
    expect(lineCount(0, 1)).toBe(0);
  });
});

describe('linhas de velocidade 3D', () => {
  it('cada linha fica fora da silhueta do carro, na janela da pista (de 12 m atrás a 70 m à frente), fina e comprida', () => {
    for (const travel of [0, 13.7, 500.25]) {
      const l = all(40, travel, 1);
      expect(l).toHaveLength(40);
      for (const s of l) {
        expect(Math.hypot(s.lat, s.h - 0.8), `lat ${s.lat} h ${s.h}`).toBeGreaterThanOrEqual(2.2);
        expect(s.h).toBeGreaterThanOrEqual(0.45);
        expect(s.dz).toBeGreaterThanOrEqual(-12 - 1e-9); expect(s.dz).toBeLessThanOrEqual(70 + 1e-9);
        expect(s.tail - s.dz).toBeGreaterThanOrEqual(2); expect(s.tail - s.dz).toBeLessThanOrEqual(14);
        expect(s.width).toBeGreaterThanOrEqual(0.025); expect(s.width).toBeLessThanOrEqual(0.07);
        expect(s.a).toBeGreaterThanOrEqual(0); expect(s.a).toBeLessThanOrEqual(0.6);
        expect(Math.max(s.r, s.g, s.b)).toBeGreaterThan(0.8); expect(s.b).toBeGreaterThanOrEqual(s.r); // azul-branco
      }
    }
  });

  it('espalhadas: dos dois lados da pista, em alturas e distâncias diferentes, sem empilhar', () => {
    const l = all(40, 100, 1);
    expect(l.filter((s) => s.lat < 0).length).toBeGreaterThan(10); expect(l.filter((s) => s.lat > 0).length).toBeGreaterThan(10);
    expect(new Set(l.map((s) => s.lat.toFixed(2))).size).toBeGreaterThan(30);
    expect(new Set(l.map((s) => s.h.toFixed(2))).size).toBeGreaterThan(30);
    expect(Math.max(...l.map((s) => s.dz)) - Math.min(...l.map((s) => s.dz))).toBeGreaterThan(40);
  });

  it('são fixas no mundo: andar 1 m puxa cada linha 1 m para a câmera (só salta, uma volta de 82 m, ao reaparecer lá longe)', () => {
    let saltos = 0;
    for (let travel = 0; travel < 300; travel += 0.37) {
      const a = all(40, travel, 1); const b = all(40, travel + 1, 1);
      a.forEach((s, k) => {
        const d = s.dz - b[k].dz; // 1 m, ou 1 − 82 quando a linha deu a volta
        if (Math.abs(d - 1) < 1e-6) return;
        expect(Math.abs(d - 1 + 82) < 1e-6, `linha ${k} em ${travel}: ${d}`).toBe(true);
        saltos++;
      });
    }
    expect(saltos).toBeGreaterThan(0); // e as voltas existem (nem todas as linhas ficam paradas no mesmo ciclo)
    expect(saltos).toBeLessThan(40 * 810 * 0.02); // uma por linha a cada 82 m de deslocamento
  });

  it('apagam nas pontas (reaparecem sem piscar) e o brilho sobe com a intensidade', () => {
    const l = all(40, 300, 1);
    const longe = l.filter((s) => s.dz > 60); const perto = l.filter((s) => s.dz < -8);
    const meio = l.filter((s) => s.dz > 5 && s.dz < 40);
    expect(meio.length).toBeGreaterThan(0);
    for (const s of [...longe, ...perto]) expect(s.a).toBeLessThan(Math.min(...meio.map((m) => m.a)) + 1e-9);
    const fraco = all(40, 300, 0.2); const forte = all(40, 300, 1);
    expect(Math.max(...forte.map((s) => s.a))).toBeGreaterThan(Math.max(...fraco.map((s) => s.a)));
  });

  it('sem intensidade ou fora de `count`, a linha não existe; as linhas mais compridas na velocidade maior; determinísticas', () => {
    expect(speedLine(0, 40, 10, 110, 0, blank())).toBe(false);
    expect(speedLine(40, 40, 10, 110, 1, blank())).toBe(false);
    expect(speedLine(-1, 40, 10, 110, 1, blank())).toBe(false);
    const lento = all(40, 10, 1, 90); const rapido = all(40, 10, 1, 140);
    expect(Math.max(...rapido.map((s) => s.tail - s.dz))).toBeGreaterThan(Math.max(...lento.map((s) => s.tail - s.dz)));
    expect(all(40, 77.7, 0.8)).toEqual(all(40, 77.7, 0.8));
    expect(readFileSync(new URL('../src/render/fx/lines.ts', import.meta.url), 'utf8')).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
});

describe('túnel de ar do vácuo', () => {
  const tunel = (n: number, travel: number, time: number, intensity: number, speed = 100): LineSpec[] => {
    const l: LineSpec[] = [];
    for (let k = 0; k < n; k++) { const s = blank(); if (draftLine(k, n, travel, time, speed, intensity, s)) l.push(s); }
    return l;
  };

  it('um anel de traços claros em volta do eixo do carro, do lado de trás da câmera até o carro da frente, comprido na direção da pista', () => {
    const l = tunel(24, 50, 3, 1);
    expect(l).toHaveLength(24);
    for (const s of l) {
      const r = Math.hypot(s.lat, (s.h - 0.8) / 0.75);
      expect(r).toBeGreaterThanOrEqual(1.2); expect(r).toBeLessThanOrEqual(1.9); // o tubo abraça o carro
      expect(s.dz).toBeGreaterThanOrEqual(-9 - 1e-9); expect(s.dz).toBeLessThanOrEqual(46);
      expect(s.tail - s.dz).toBeGreaterThanOrEqual(3);
      expect(Math.min(s.r, s.g, s.b)).toBeGreaterThan(0.7); // claro
      expect(s.a).toBeGreaterThan(0);
    }
    expect(l.filter((s) => s.lat < 0).length).toBeGreaterThan(5); expect(l.filter((s) => s.lat > 0).length).toBeGreaterThan(5);
    expect(l.filter((s) => s.h > 0.8).length).toBeGreaterThan(5); expect(l.filter((s) => s.h < 0.8).length).toBeGreaterThan(5);
  });

  it('o brilho acompanha a intensidade; sem vácuo não existe; gira devagar com o tempo', () => {
    const cheio = tunel(24, 50, 3, 1); const meio = tunel(24, 50, 3, 0.5);
    expect(Math.max(...cheio.map((s) => s.a))).toBeGreaterThan(Math.max(...meio.map((s) => s.a)));
    expect(tunel(24, 50, 3, 0)).toHaveLength(0);
    expect(draftLine(24, 24, 50, 3, 100, 1, blank())).toBe(false);
    const a = tunel(24, 50, 3, 1); const b = tunel(24, 50, 3.5, 1);
    expect(a[0].lat).not.toBeCloseTo(b[0].lat, 3);
    // gira 0,9 rad/s × 0,5 s = 0,45 rad (e não sorteia de novo): o ângulo do traço no anel, com a volta
    const ang = (l: LineSpec) => Math.atan2((l.h - 0.8) / 0.75, l.lat);
    let d = ang(b[0]) - ang(a[0]); d = Math.atan2(Math.sin(d), Math.cos(d));
    expect(d).toBeGreaterThan(0.4); expect(d).toBeLessThan(0.5);
  });
});

describe('as linhas no Effects', () => {
  function cena(quality: Quality, opts: { reduce?: boolean; humans?: number } = {}) {
    const t = getTrack('copacabana');
    const n = opts.humans ?? 1;
    const { state } = quickRace({ humans: Array.from({ length: n }, (_, i) => human(i, i)), totalCars: 6, track: t });
    state.phase = 'racing'; state.tick = 900;
    const mine = state.cars.filter((c) => c.seat >= 0);
    for (const c of state.cars) if (!mine.includes(c)) c.z = (mine[0].z + t.length / 2) % t.length;
    mine.forEach((c, i) => { c.z = (mine[0].z + i * 60_000) % t.length; });
    const frame = { state, track: t, time: 5, paused: false, coop: n > 1, showHud: false,
      viewports: mine.map((c) => ({ seat: c.seat, carIndex: state.cars.indexOf(c), color: '#fff', name: `P${c.seat + 1}`, messages: [] })),
      options: { quality, showMinimap: false, screenShake: true, reduceEffects: opts.reduce === true, palette: 'default' } } as unknown as RenderFrame;
    const fx = new Effects(); fx.update(frame);
    return { state, frame, fx, mine, track: t };
  }
  /** Corre `frames` quadros com os carros dos humanos a `speed` (fração da máxima) e devolve quantos traços o viewport `vp` tem na pose. */
  function corre(s: ReturnType<typeof cena>, frames: number, speed: number, vp = 0, nitro = false): number {
    let n = 0;
    for (let i = 0; i < frames; i++) {
      for (const c of s.mine) { c.speed = c.stats.topSpeed * speed; c.nitroTicks = nitro ? 100 : 0; c.z = (c.z + c.speed / 60) % s.track.length; c.progress += c.speed / 60; }
      s.frame.time += 1 / 60; s.fx.update(s.frame);
      const car = s.mine[vp];
      s.fx.pose(buildRoadFrame(s.track, car.z, 30, 200), s.track, 600, vp);
      n = s.fx.counts().streaks;
    }
    return n;
  }

  it('abaixo de 85% da máxima não há linha; a 100% há, até o teto do degrau; reduzir efeitos não tem', () => {
    expect(corre(cena('high'), 90, 0.8)).toBe(0);
    const cheio = corre(cena('high'), 120, 1);
    expect(cheio).toBe(fxPlan('high', false).speedLines);
    expect(corre(cena('high', { reduce: true }), 120, 1)).toBe(0);
  });

  it('o teto sobe do Baixo ao Ultra e cai pela metade com 3 ou 4 jogadores', () => {
    const q = (x: Quality) => corre(cena(x), 120, 1);
    expect(q('low')).toBe(fxPlan('low', false).speedLines);
    expect(q('medium')).toBe(fxPlan('medium', false).speedLines);
    expect(q('ultra')).toBe(fxPlan('ultra', false).speedLines);
    expect(q('low')).toBeLessThan(q('ultra'));
    const quatro = cena('high', { humans: 4 });
    expect(corre(quatro, 120, 1)).toBe(fxPlan('high', false, 4).speedLines);
  });

  it('sobe e desce com suavidade ao cruzar 85% (sem piscar de uma vez)', () => {
    const s = cena('high');
    corre(s, 60, 0.8);
    const subida: number[] = [];
    for (let i = 0; i < 30; i++) subida.push(corre(s, 1, 1));
    expect(subida[0]).toBeLessThan(subida[subida.length - 1]);
    for (let i = 1; i < subida.length; i++) expect(subida[i]).toBeGreaterThanOrEqual(subida[i - 1]);
    expect(subida[0]).toBeLessThan(fxPlan('high', false).speedLines * 0.5);
  });

  it('o túnel acende no vácuo (computeModifiers.draft), some ao sair dele, e não existe sem carro à frente', () => {
    const s = cena('high');
    const me = s.mine[0]; const lead = s.state.cars.find((c) => c.seat < 0)!;
    const noVacuo = () => { lead.z = (me.z + 800) % s.track.length; lead.x = me.x; lead.speed = me.stats.topSpeed; };
    // a 70% da máxima: nada de linha de velocidade; só o túnel
    expect(corre(s, 90, 0.7)).toBe(0);
    for (let i = 0; i < 90; i++) { noVacuo(); corre(s, 1, 0.7); }
    const com = s.fx.counts().streaks;
    expect(com).toBeGreaterThan(5); expect(com).toBeLessThanOrEqual(fxPlan('high', false).draftLines);
    lead.z = (me.z + s.track.length / 2) % s.track.length;
    for (let i = 0; i < 90; i++) corre(s, 1, 0.7);
    expect(s.fx.counts().streaks).toBe(0);
    const baixo = cena('low');
    baixo.mine[0].speed = 1;
    expect(fxPlan('low', false).draftLines).toBe(0); // a Baixa não tem túnel
  });
});
