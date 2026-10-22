// M5: o plano de efeitos por degrau (src/render/fx/plan.ts). Puro. Cada degrau tem tudo do anterior; `reduceEffects` tira o que pisca
// (faíscas, POW, onda de choque, linhas e túnel) e deixa o que não pisca (bolhas de fumaça e marcas de pneu). V8: o POW é só da opção "Efeitos de cartum".
import { describe, expect, it } from 'vitest';
import type { Quality } from '../src/game/contracts';
import { fxPlan, type FxPlan } from '../src/render/fx/plan';

const LEVELS: readonly Quality[] = ['low', 'medium', 'high', 'ultra'];
// V22 F8: + `trail` (nuvens/s da trilha de poeira) e `ambient` (partículas ambientes): campos novos do plano, e as duas crescem do Baixa ao Ultra como os outros números (o motivo de estarem aqui).
const NUMBERS = ['sparks', 'smoke', 'marks', 'speedLines', 'draftLines', 'cornerStreaks', 'exhaustFire', 'dustScale', 'trail', 'ambient'] as const;
const FLAGS = ['wheelSparks', 'shockwave', 'pow'] as const;

describe('plano de efeitos (M5)', () => {
  it('cada teto numérico cresce (ou fica) do Baixa ao Ultra, e o Ultra tem mais que o Baixa em marcas e linhas', () => {
    for (const k of NUMBERS) {
      for (let i = 1; i < LEVELS.length; i++) {
        expect(fxPlan(LEVELS[i], false)[k], `${k} ${LEVELS[i - 1]} → ${LEVELS[i]}`).toBeGreaterThanOrEqual(fxPlan(LEVELS[i - 1], false)[k]);
      }
    }
    expect(fxPlan('ultra', false).marks).toBeGreaterThan(fxPlan('low', false).marks);
    expect(fxPlan('ultra', false).speedLines).toBeGreaterThan(fxPlan('low', false).speedLines);
    expect(fxPlan('low', false).marks).toBeGreaterThan(0); // a Baixa também deixa marca (uma malha só, barata)
  });

  it('o que liga num degrau fica ligado nos de cima', () => {
    for (const k of FLAGS) {
      let on = false;
      for (const q of LEVELS) { const v = fxPlan(q, false)[k]; if (on) expect(v, `${k} em ${q}`).toBe(true); on = on || v; }
    }
    expect(fxPlan('low', false).shockwave).toBe(false); // a onda de choque só a partir da Média
    expect(fxPlan('medium', false).shockwave).toBe(true);
    expect(fxPlan('low', false).wheelSparks).toBe(true);
    // V8 (docs/ondas/V8-efeitos.md): o POW é cartum — só com a opção "Efeitos de cartum" (o 4º argumento), em qualquer degrau.
    expect(fxPlan('low', false).pow).toBe(false);
    expect(fxPlan('low', false, 1, true).pow).toBe(true);
  });

  it('fatores de emissão ficam em 0..1', () => {
    for (const q of LEVELS) for (const r of [false, true]) {
      const p = fxPlan(q, r);
      expect(p.sparks).toBeGreaterThanOrEqual(0); expect(p.sparks).toBeLessThanOrEqual(1);
      expect(p.smoke).toBeGreaterThanOrEqual(0); expect(p.smoke).toBeLessThanOrEqual(1);
    }
  });

  it('reduzir efeitos: sem faíscas, POW, onda, linhas e túnel; as marcas e a fumaça (que não piscam) ficam', () => {
    for (const q of LEVELS) {
      const on = fxPlan(q, false); const off = fxPlan(q, true);
      expect(on.sparks, `${q} ligado`).toBeGreaterThan(0); expect(on.speedLines, `${q} ligado`).toBeGreaterThan(0); expect(fxPlan(q, false, 1, true).pow, `${q} cartum`).toBe(true);
      expect(fxPlan(q, true, 1, true).pow, `${q} cartum + reduzir`).toBe(false);
      expect(off.sparks, q).toBe(0); expect(off.wheelSparks, q).toBe(false); expect(off.pow, q).toBe(false); expect(off.shockwave, q).toBe(false);
      expect(off.speedLines, q).toBe(0); expect(off.draftLines, q).toBe(0);
      expect(off.marks, q).toBe(on.marks); expect(off.smoke, q).toBe(on.smoke);
    }
  });

  it('com 3 ou 4 jogadores as linhas por viewport caem pela metade (os pixels somados são os de 1 tela)', () => {
    for (const q of LEVELS) {
      const um = fxPlan(q, false, 1); expect(um.speedLines, q).toBeGreaterThanOrEqual(10); const dois = fxPlan(q, false, 2); const tres = fxPlan(q, false, 3); const quatro = fxPlan(q, false, 4);
      expect(dois.speedLines, q).toBe(um.speedLines);
      for (const split of [tres, quatro]) {
        expect(split.speedLines, q).toBe(Math.floor(um.speedLines / 2));
        expect(split.draftLines, q).toBe(Math.floor(um.draftLines / 2));
      }
    }
  });

  it('o plano tem só os campos conhecidos (nada esquecido na tabela)', () => {
    const keys: Array<keyof FxPlan> = [...NUMBERS, ...FLAGS];
    expect(Object.keys(fxPlan('high', false)).sort()).toEqual([...keys].sort());
  });
});
