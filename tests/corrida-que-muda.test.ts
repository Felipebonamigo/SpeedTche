// M6 (b): a corrida que muda (docs/ondas/M/M6.md). O período anda durante a corrida — dia → entardecer na última volta, entardecer → noite nas duas últimas —,
// interpolando campo a campo as 18 combinações que a M2 deixou em `PALETTE_TABLE`. Aqui, a parte pura (plano, relógio, interpolação, luzes); o que os
// uniformes do céu, da pista e do terreno recebem é conferido em tests/corrida-que-muda-gl.test.ts, no Chromium.
import { describe, expect, it } from 'vitest';
import { getTrack, TRACKS } from '../src/core/track';
import type { SceneryId, TimeOfDay } from '../src/core/types';
import {
  advanceRaceProgress, blendPalette, bodyColor, hexToRgb, lightsAmount, livePalette, PALETTE_TABLE, palette, paletteKey, racePeriodBlend, racePeriodPlan, raceFraction,
  SCENERIES, starAlpha, type Palette,
} from '../src/render/palette';

const NEXT: Record<'day' | 'dusk', TimeOfDay> = { day: 'dusk', dusk: 'night' };
const HEX = /^#[0-9a-f]{6}$/;

/** Todas as folhas numéricas e de cor de uma paleta, com o caminho (para medir campo a campo). */
function leaves(p: unknown, path = ''): Array<[string, number | string | boolean | null]> {
  if (p === null || typeof p === 'number' || typeof p === 'string' || typeof p === 'boolean') return [[path, p as number | string | boolean | null]];
  if (Array.isArray(p)) return p.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  return Object.entries(p as object).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}

const rgb = (hex: string): number[] => hexToRgb(hex);

describe('M6 (b): o plano da corrida (quando o período anda)', () => {
  it('dia → entardecer na última volta; entardecer → noite nas duas últimas; a noite não anda', () => {
    expect(racePeriodPlan('day', 3)).toEqual({ from: 'day', to: 'dusk', start: 2 / 3, end: 1 });
    expect(racePeriodPlan('day', 4)).toEqual({ from: 'day', to: 'dusk', start: 3 / 4, end: 1 });
    expect(racePeriodPlan('dusk', 3)).toEqual({ from: 'dusk', to: 'night', start: 1 / 3, end: 1 });
    expect(racePeriodPlan('dusk', 4)).toEqual({ from: 'dusk', to: 'night', start: 2 / 4, end: 1 });
    expect(racePeriodPlan('night', 3)).toBeNull();
    // Corrida de uma volta só (não existe hoje): o plano começa na largada, nunca antes dela.
    expect(racePeriodPlan('day', 1)?.start).toBe(0);
    expect(racePeriodPlan('dusk', 1)?.start).toBe(0);
  });

  it('o tempo da transição é monótono, contínuo, 0 antes de começar e 1 no fim (smoothstep)', () => {
    const plan = racePeriodPlan('day', 3);
    expect(racePeriodBlend(plan, 0)).toBe(0);
    expect(racePeriodBlend(plan, 2 / 3 - 1e-9)).toBe(0);
    expect(racePeriodBlend(plan, 1)).toBe(1);
    expect(racePeriodBlend(plan, 1.7)).toBe(1);
    expect(racePeriodBlend(plan, -0.4)).toBe(0);
    expect(racePeriodBlend(plan, 2 / 3 + 1 / 6)).toBeCloseTo(0.5, 12);
    let prev = 0;
    for (let i = 0; i <= 2000; i++) {
      const t = racePeriodBlend(plan, i / 2000);
      expect(t).toBeGreaterThanOrEqual(prev);
      expect(t - prev).toBeLessThan(0.004); // sem salto: no pior ponto a derivada do smoothstep (1,5) × o passo de 1/2000 × 3 (a janela é 1/3 da corrida)
      prev = t;
    }
    expect(racePeriodBlend(null, 0.9)).toBe(0);
  });

  it('o relógio nunca volta, e uma queda grande é corrida nova', () => {
    expect(advanceRaceProgress(0.5, 0.52)).toBe(0.52);
    expect(advanceRaceProgress(0.5, 0.49)).toBe(0.5); // o líder trocado de viewport, um respawn: o tempo não anda para trás
    expect(advanceRaceProgress(0.9, 0.0)).toBe(0); // corrida nova
    expect(advanceRaceProgress(0.9, 0.7)).toBe(0.7); // caiu mais que 25%: corrida nova, mesmo que não zerada
    expect(advanceRaceProgress(0, 0)).toBe(0);
  });

  it('a fração da corrida é a do líder entre os carros que a tela mostra (0..1)', () => {
    const length = 400 * 200; const laps = 3;
    const at = (lap: number, z: number): number => (lap - 1) * length + z;
    expect(raceFraction([at(1, 0)], laps, length)).toBe(0);
    expect(raceFraction([at(1, 0), at(2, 1000)], laps, length)).toBeCloseTo((length + 1000) / (laps * length), 12);
    expect(raceFraction([at(3, length)], laps, length)).toBe(1);
    expect(raceFraction([at(1, -300)], laps, length)).toBe(0); // a grade de largada fica atrás da linha
    expect(raceFraction([], laps, length)).toBe(0);
    expect(raceFraction([at(5, 0)], laps, length)).toBe(1);
  });
});

describe('M6 (b): interpolar as 18 combinações campo a campo', () => {
  const pairs: Array<[SceneryId, 'day' | 'dusk']> = SCENERIES.flatMap((sc) => (['day', 'dusk'] as const).map((t) => [sc, t] as [SceneryId, 'day' | 'dusk']));

  it('t = 0 e t = 1 são as entradas da tabela (a mesma referência), e a primeira volta da corrida é a paleta da pista', () => {
    for (const [sc, time] of pairs) {
      const a = PALETTE_TABLE[paletteKey(sc, time)]; const b = PALETTE_TABLE[paletteKey(sc, NEXT[time])];
      expect(blendPalette(a, b, 0), `${sc} ${time} t=0`).toBe(a);
      expect(blendPalette(a, b, 1), `${sc} ${time} t=1`).toBe(b);
      expect(blendPalette(a, b, -3)).toBe(a);
      expect(blendPalette(a, b, 4)).toBe(b);
    }
    for (const def of TRACKS) {
      const plan = racePeriodPlan(def.timeOfDay, def.laps);
      const live = livePalette(def.scenery, def.timeOfDay, def.laps, 0);
      expect(live.p, def.id).toBe(palette(def.scenery, def.timeOfDay));
      expect(live.t, def.id).toBe(0);
      expect(plan === null, def.id).toBe(def.timeOfDay === 'night');
      // Na largada e na primeira volta (antes de `start`), o período é o da pista.
      if (plan) expect(livePalette(def.scenery, def.timeOfDay, def.laps, plan.start * 0.99).p, def.id).toBe(palette(def.scenery, def.timeOfDay));
    }
  });

  it('nenhum campo vira NaN, toda cor continua #rrggbb, as chaves são as da tabela — 6 biomas × 2 transições × 101 passos', () => {
    for (const [sc, time] of pairs) {
      const a = PALETTE_TABLE[paletteKey(sc, time)]; const b = PALETTE_TABLE[paletteKey(sc, NEXT[time])];
      const keys = Object.keys(a).sort();
      for (let i = 0; i <= 100; i++) {
        const p = blendPalette(a, b, i / 100);
        expect(Object.keys(p).sort(), `${sc} ${time} ${i}`).toEqual(keys);
        for (const [path, v] of leaves(p)) {
          if (typeof v === 'number') expect(Number.isFinite(v), `${sc} ${time} t=${i / 100} ${path}`).toBe(true);
          else if (typeof v === 'string') expect(v, `${sc} ${time} t=${i / 100} ${path}`).toMatch(HEX);
        }
      }
    }
  });

  it('cada canal de cor e cada número anda monótono de uma ponta à outra (nunca passa do intervalo das duas entradas)', () => {
    for (const [sc, time] of pairs) {
      const a = PALETTE_TABLE[paletteKey(sc, time)]; const b = PALETTE_TABLE[paletteKey(sc, NEXT[time])];
      const la = leaves(a); const lb = leaves(b);
      let prev = leaves(blendPalette(a, b, 0));
      for (let i = 1; i <= 100; i++) {
        const cur = leaves(blendPalette(a, b, i / 100));
        cur.forEach(([path, v], j) => {
          const from = la[j][1]; const to = lb[j][1]; const before = prev[j][1];
          if (typeof v === 'number' && typeof before === 'number' && typeof from === 'number' && typeof to === 'number') {
            const dir = Math.sign(to - from);
            expect((v - before) * dir, `${sc} ${time} ${path}`).toBeGreaterThanOrEqual(-1e-9);
          } else if (typeof v === 'string' && typeof before === 'string' && typeof from === 'string' && typeof to === 'string' && HEX.test(v)) {
            const x = rgb(v); const y = rgb(before); const f = rgb(from); const e = rgb(to);
            for (let c = 0; c < 3; c++) expect((x[c] - y[c]) * Math.sign(e[c] - f[c]), `${sc} ${time} ${path}[${c}]`).toBeGreaterThanOrEqual(0);
          }
        });
        prev = cur;
      }
    }
  });

  it('é contínua: um passo de 1/100 de t move cada canal, no máximo, 1/100 da distância das pontas (mais 1 de arredondamento)', () => {
    for (const [sc, time] of pairs) {
      const a = PALETTE_TABLE[paletteKey(sc, time)]; const b = PALETTE_TABLE[paletteKey(sc, NEXT[time])];
      const la = leaves(a); const lb = leaves(b);
      let prev = leaves(blendPalette(a, b, 0));
      for (let i = 1; i <= 100; i++) {
        const cur = leaves(blendPalette(a, b, i / 100));
        cur.forEach(([path, v], j) => {
          const from = la[j][1]; const to = lb[j][1]; const before = prev[j][1];
          if (typeof v === 'number' && typeof from === 'number' && typeof to === 'number' && typeof before === 'number') {
            expect(Math.abs(v - before), `${sc} ${time} ${path}`).toBeLessThanOrEqual(Math.abs(to - from) / 100 + 1e-9);
          } else if (typeof v === 'string' && typeof from === 'string' && typeof to === 'string' && typeof before === 'string' && HEX.test(v)) {
            const x = rgb(v); const y = rgb(before); const f = rgb(from); const e = rgb(to);
            for (let c = 0; c < 3; c++) expect(Math.abs(x[c] - y[c]), `${sc} ${time} ${path}[${c}]`).toBeLessThanOrEqual(Math.abs(e[c] - f[c]) / 100 + 1);
          }
        });
        prev = cur;
      }
    }
  });

  it('o sol desce: a elevação anda de 34° (dia) a 9–10,5° (entardecer) sem subir, e o disco muda de cor com o céu', () => {
    for (const sc of SCENERIES) {
      const a = PALETTE_TABLE[paletteKey(sc, 'day')]; const b = PALETTE_TABLE[paletteKey(sc, 'dusk')];
      expect(a.sunEl).toBe(34);
      expect(b.sunEl).toBeGreaterThanOrEqual(9); expect(b.sunEl).toBeLessThanOrEqual(10.5);
      let prev = Infinity;
      for (let i = 0; i <= 100; i++) {
        const p = blendPalette(a, b, i / 100);
        expect(p.sunEl, `${sc} ${i}`).toBeLessThanOrEqual(prev + 1e-12);
        prev = p.sunEl;
        // O sol aparece na paleta nas duas pontas (sun não nulo), então o disco existe a corrida inteira.
        expect(p.sun, `${sc} ${i}`).not.toBeNull();
      }
    }
  });

  it('nulos: nulo nos dois = nulo; um só nulo = o valor do outro lado (nada pisca em 0,5); o corpo celeste (sol → lua) tem cor própria', () => {
    for (const sc of SCENERIES) {
      const dusk = PALETTE_TABLE[paletteKey(sc, 'dusk')]; const night = PALETTE_TABLE[paletteKey(sc, 'night')]; const day = PALETTE_TABLE[paletteKey(sc, 'day')];
      expect(blendPalette(day, dusk, 0.5).moon).toBeNull();
      expect(blendPalette(day, dusk, 0.5).lampPool).toBeNull();
      const mid = blendPalette(dusk, night, 0.5);
      expect(mid.sun, sc).toBe(dusk.sun); // a noite não tem sol: o do entardecer fica até o fim, sem piscar
      expect(mid.moon, sc).toBe(night.moon);
      expect(mid.cloudLit, sc).toBe(dusk.cloudLit);
      expect(mid.lampPool, sc).toBe(night.lampPool);
      // A cor do disco (sol ou lua) vai de uma ponta à outra: em 0 é a do sol do entardecer, em 1 a da lua, e no meio é a mistura.
      expect(bodyColor(dusk)).toBe(dusk.sun);
      expect(bodyColor(night)).toBe(night.moon);
      const live = livePalette(sc, 'dusk', 3, 1);
      expect(live.t).toBe(1);
      expect(live.body).toBe(night.moon);
      const halfway = livePalette(sc, 'dusk', 3, 1 / 3 + (2 / 3) / 2);
      expect(halfway.t).toBeCloseTo(0.5, 12);
      expect(halfway.body).not.toBe(dusk.sun);
      expect(halfway.body).not.toBe(night.moon);
    }
  });

  it('as luzes da cidade acendem com a luz do período: 0 de dia, 0,6 no entardecer, 1 à noite (os números do cenário), monótona e contínua; as estrelas só à noite', () => {
    expect(lightsAmount(1)).toBe(0);
    expect(lightsAmount(0.7)).toBeCloseTo(0.6, 12);
    expect(lightsAmount(0.32)).toBeCloseTo(1, 12);
    expect(lightsAmount(0)).toBe(1);
    expect(lightsAmount(2)).toBe(0);
    let prev = 0;
    for (let i = 0; i <= 1000; i++) {
      const l = lightsAmount(1 - (0.68 * i) / 1000);
      expect(l).toBeGreaterThanOrEqual(prev);
      expect(l - prev).toBeLessThan(0.01);
      prev = l;
    }
    expect(starAlpha(1)).toBe(0); expect(starAlpha(0.7)).toBe(0); expect(starAlpha(0.32)).toBeCloseTo(1, 12);
    expect(starAlpha(0.5)).toBeGreaterThan(0); expect(starAlpha(0.5)).toBeLessThan(1);
    // A paleta de cada período dá o que o renderizador de hoje faz por degrau (applyNight: 0 · 0,6 · 1).
    expect(lightsAmount(PALETTE_TABLE[paletteKey('tropical', 'day')].light)).toBe(0);
    expect(lightsAmount(PALETTE_TABLE[paletteKey('tropical', 'dusk')].light)).toBeCloseTo(0.6, 12);
    expect(lightsAmount(PALETTE_TABLE[paletteKey('tropical', 'night')].light)).toBeCloseTo(1, 12);
  });

  it('a pista que já é de noite não anda: a paleta ao vivo é sempre a dela', () => {
    for (const def of TRACKS.filter((d) => d.timeOfDay === 'night')) {
      for (const f of [0, 0.5, 1]) {
        const live = livePalette(def.scenery, def.timeOfDay, def.laps, f);
        expect(live.p).toBe(palette(def.scenery, def.timeOfDay));
        expect(live.t).toBe(0);
      }
    }
  });

  it('o tipo de uma paleta ao vivo expõe as duas pontas (a e b) para quem monta duas tabelas (chão, anéis, texturas)', () => {
    const live = livePalette('coast', 'day', 3, 1);
    expect(live.a).toBe(palette('coast', 'day'));
    expect(live.b).toBe(palette('coast', 'dusk'));
    const p: Palette = live.p;
    expect(p).toBe(live.b);
    expect(getTrack('copacabana').def.timeOfDay).toBe('day');
  });
});
