// Onda L, L2: o desenho de cada degrau de qualidade (puro, sem three), o desfoque radial, a sombra por viewport e a régua do gate.
// O que o renderizador faz de verdade com isso, em GL, é conferido em tests/gl-render.test.ts.
import { describe, expect, it } from 'vitest';
import type { Quality } from '../src/game/contracts';
import { ULTRA_EFFECTS, ultraEffectsActive } from '../src/bench/ultra';
import { checkCostOrder, checkGate, type GateLimits, type GateSample } from '../src/bench/gate';
import { planFor, qualityEffects, radialBlurStrength, RADIAL_START, shadowDue, shadowPlan, shadowShiftMeters } from '../src/render/postfx/plan';
import { zToMeters } from '../src/render/units';

const LEVELS: readonly Quality[] = ['low', 'medium', 'high', 'ultra'];

describe('planFor: o que cada degrau desenha', () => {
  it('Baixa: sem pós, sem MSAA/bloom/AO, com gradação e a sombra de contato sob o carro', () => {
    for (const n of [1, 2, 4]) {
      const p = planFor('low', n);
      expect(p.post, `${n} viewports`).toBe(false);
      expect(p.aa).toBe('canvas'); // o MSAA do próprio contexto (antialias: true), não um passe
      expect(p.msaa).toBe(0);
      expect(p.bloom).toBeNull();
      expect(p.ao).toBeNull();
      expect(p.radialBlur).toBe(false);
      expect(p.grade).toBe(true);
      expect(p.contactShadow).toBe(true);
      expect(p.dynamicResolution).toBe(false);
    }
  });

  it('Média: pós com bloom em meia resolução e FXAA, sem MSAA, sem AO e sem desfoque radial', () => {
    const p = planFor('medium', 2);
    expect(p.post).toBe(true);
    expect(p.aa).toBe('fxaa');
    expect(p.msaa).toBe(0);
    expect(p.bloom).toEqual({ scale: 0.5 });
    expect(p.ao).toBeNull();
    expect(p.radialBlur).toBe(false);
    expect(p.contactShadow).toBe(true);
    expect(p.dynamicResolution).toBe(true);
  });

  it('Alta: MSAA 4, bloom, desfoque radial e AO em meia resolução só com 1 e 2 jogadores', () => {
    for (const n of [1, 2]) {
      const p = planFor('high', n);
      expect(p.post).toBe(true);
      expect(p.aa).toBe('msaa');
      expect(p.msaa).toBe(4);
      expect(p.bloom).toEqual({ scale: 1 });
      expect(p.radialBlur).toBe(true);
      expect(p.ao, `${n} jogadores`).toMatchObject({ scale: 0.5 });
    }
    for (const n of [3, 4]) expect(planFor('high', n).ao, `${n} jogadores`).toBeNull();
  });

  it('Ultra: AO em resolução cheia de 1 a 4 jogadores, além do que a Alta tem', () => {
    for (const n of [1, 2, 3, 4]) {
      const p = planFor('ultra', n);
      expect(p.ao, `${n} jogadores`).toMatchObject({ scale: 1 });
      expect(p.msaa).toBe(4);
      expect(p.bloom).toEqual({ scale: 1 });
      expect(p.radialBlur).toBe(true);
    }
  });

  it('cada degrau tem todos os efeitos do anterior (Baixa ⊂ Média ⊂ Alta ⊂ Ultra), em qualquer lotação', () => {
    for (const n of [1, 2, 3, 4]) {
      for (let i = 1; i < LEVELS.length; i++) {
        const menor = qualityEffects(LEVELS[i - 1], n);
        const maior = qualityEffects(LEVELS[i], n);
        for (const e of menor) expect(maior, `${LEVELS[i]}/${n} deve ter ${e}`).toContain(e);
        expect(maior.length, `${LEVELS[i]}/${n} tem de ter algo a mais que ${LEVELS[i - 1]}`).toBeGreaterThan(menor.length);
      }
    }
  });

  it('o plano é coerente com a lista de efeitos que ele anuncia', () => {
    const p = planFor('ultra', 1);
    expect(qualityEffects('ultra', 1)).toEqual(expect.arrayContaining(['grade', 'contact-shadow', 'sun-shadow', 'bloom', 'aa', 'radial-blur', 'gtao']));
    expect(qualityEffects('low', 1)).toEqual(['grade', 'contact-shadow']);
    expect(p.ao?.samples).toBeGreaterThan(0);
  });
});

describe('ULTRA_EFFECTS: o registro diz a verdade', () => {
  it('o que está `implemented` é exatamente o que o plano do Ultra liga; o resto continua falso', () => {
    expect([...ultraEffectsActive()].sort()).toEqual([...planFor('ultra', 1).ultraEffects].sort());
    expect(ultraEffectsActive()).toContain('gtao');
    // A Alta não liga nenhum efeito do registro do Ultra (o AO dela é o de meia resolução, outro parâmetro).
    expect(planFor('high', 1).ultraEffects).toEqual([]);
    // Sem código no renderizador: não podem estar ligados.
    for (const falta of ['ssr', 'csm', 'taa', 'motion-blur']) expect(ultraEffectsActive(), falta).not.toContain(falta);
    const ids = ULTRA_EFFECTS.map((e) => e.id);
    for (const id of planFor('ultra', 1).ultraEffects) expect(ids, id).toContain(id);
  });

  it('o parâmetro do GTAO no registro é o do plano do Ultra', () => {
    const gtao = ULTRA_EFFECTS.find((e) => e.id === 'gtao');
    const ao = planFor('ultra', 1).ao;
    expect(ao).not.toBeNull();
    expect(gtao?.params).toMatchObject({ resolutionScale: ao?.scale, samples: ao?.samples, radius: ao?.radius });
  });
});

describe('radialBlurStrength: nitro e velocidade acima de 85%', () => {
  it('zero até 85% da velocidade, sobe de 0 a 1 até a máxima e passa disso com 1', () => {
    expect(RADIAL_START).toBe(0.85);
    expect(radialBlurStrength(0, false, false)).toBe(0);
    expect(radialBlurStrength(0.85, false, false)).toBe(0);
    expect(radialBlurStrength(0.925, false, false)).toBeCloseTo(0.5, 6);
    expect(radialBlurStrength(1, false, false)).toBeCloseTo(1, 6);
    expect(radialBlurStrength(1.2, false, false)).toBe(1);
  });

  it('o nitro dá um piso, mesmo devagar, e a velocidade alta o supera', () => {
    const piso = radialBlurStrength(0.3, true, false);
    expect(piso).toBeGreaterThan(0.3);
    expect(piso).toBeLessThan(1);
    expect(radialBlurStrength(1, true, false)).toBe(1);
  });

  it('"reduzir efeitos" (acessibilidade) zera, com nitro e em velocidade máxima', () => {
    expect(radialBlurStrength(1.2, true, true)).toBe(0);
  });
});

describe('sombra por viewport', () => {
  it('com 1 ou 2 viewports todos atualizam o mapa a cada quadro', () => {
    for (const n of [1, 2]) {
      expect(shadowPlan('high', n).every).toBe(1);
      for (let f = 0; f < 4; f++) for (let i = 0; i < n; i++) expect(shadowDue(f, i, 1, true), `n=${n} f=${f} i=${i}`).toBe(true);
    }
  });

  it('com 3 e 4 viewports cada um atualiza a cada 2 quadros: metade (ou quase) por quadro, ninguém fica sem', () => {
    for (const n of [3, 4]) {
      expect(shadowPlan('high', n).every).toBe(2);
      const porQuadro: number[] = [];
      const ultimo = new Array<number>(n).fill(-1);
      for (let f = 0; f < 8; f++) {
        let k = 0;
        for (let i = 0; i < n; i++) if (shadowDue(f, i, 2, true)) { k++; ultimo[i] = f; }
        porQuadro.push(k);
        for (let i = 0; i < n; i++) expect(f - ultimo[i], `n=${n} viewport ${i} no quadro ${f}`).toBeLessThanOrEqual(1);
      }
      for (const k of porQuadro) expect(k).toBeLessThanOrEqual(Math.ceil(n / 2));
      expect(porQuadro.reduce((s, k) => s + k, 0)).toBe(n * 4);
    }
  });

  it('um mapa ainda vazio atualiza sempre, mesmo fora da vez', () => {
    expect(shadowDue(1, 0, 2, false)).toBe(true);
    expect(shadowDue(0, 1, 2, false)).toBe(true);
  });

  it('o mapa por viewport encolhe com 3 e 4 jogadores: os texels refeitos por quadro não passam do dobro dos de 1 jogador, e a Baixa não tem sombra', () => {
    expect(shadowPlan('low', 1)).toMatchObject({ enabled: false });
    expect(shadowPlan('medium', 1)).toMatchObject({ enabled: true, mapSize: 1024 });
    expect(shadowPlan('high', 1)).toMatchObject({ enabled: true, mapSize: 2048 });
    expect(shadowPlan('ultra', 2)).toMatchObject({ enabled: true, mapSize: 2048 });
    for (const q of ['medium', 'high', 'ultra'] as const) {
      for (const n of [3, 4]) {
        const p = shadowPlan(q, n);
        expect(p.mapSize, `${q}/${n}`).toBe(1024);
        const porQuadro = Math.ceil(n / p.every) * p.mapSize ** 2;
        expect(porQuadro, `${q}/${n}`).toBeLessThanOrEqual(2 * shadowPlan(q, 1).mapSize ** 2);
        // Hoje são n mapas do tamanho de 1 jogador por quadro: o novo custa no máximo 3/4 disso (3 jogadores na Média) e muito menos na Alta.
        expect(porQuadro, `${q}/${n}`).toBeLessThanOrEqual(0.75 * n * shadowPlan(q, 1).mapSize ** 2);
      }
    }
  });

  it('shadowShiftMeters: metros avançados entre dois quadros, com a volta da pista', () => {
    const L = 200000;
    expect(shadowShiftMeters(1000, 1000, L)).toBe(0);
    expect(shadowShiftMeters(1000, 1200, L)).toBeCloseTo(zToMeters(200), 9);
    // Cruzou a linha de chegada: 150 u antes do fim e 50 u depois = 200 u andadas, não uma pista inteira para trás.
    expect(shadowShiftMeters(L - 150, 50, L)).toBeCloseTo(zToMeters(200), 9);
    expect(shadowShiftMeters(50, L - 150, L)).toBeCloseTo(-zToMeters(200), 9);
  });
});

describe('checkGate: a régua das contagens por viewport', () => {
  const vp = { calls: 40, triangles: 100000, passes: 4, postPx: 2_000_000, targetW: 1280, targetH: 720, samples: 4 };
  const sample = (over: Partial<typeof vp> = {}, quality: Quality = 'high'): GateSample => ({ scene: 'copa-1p', quality, viewports: [{ ...vp, ...over }] });
  const limits: GateLimits = { 'copa-1p': { high: { calls: 50, triangles: 120000, passes: 6, postPxRatio: 3 } } };

  it('dentro dos limites não reclama', () => {
    expect(checkGate([sample()], limits)).toEqual([]);
  });

  it('cada limite estourado aparece com a cena, a qualidade e o nome da conta', () => {
    const erros = checkGate([sample({ calls: 51, triangles: 130000, passes: 7, postPx: 3 * 1280 * 720 + 1 })], limits).join('\n');
    expect(erros).toMatch(/copa-1p\/high.*chamadas 51 > 50/);
    expect(erros).toMatch(/copa-1p\/high.*triângulos 130000 > 120000/);
    expect(erros).toMatch(/copa-1p\/high.*passes 7 > 6/);
    expect(erros).toMatch(/copa-1p\/high.*pixels de pós/);
  });

  it('o limite vale por viewport: o pior dos viewports é o que conta', () => {
    const s: GateSample = { scene: 'copa-1p', quality: 'high', viewports: [vp, { ...vp, calls: 99 }] };
    expect(checkGate([s], limits).join('\n')).toMatch(/viewport 1.*chamadas 99 > 50/);
  });

  it('amostra sem limite escrito é erro (limite que falta não passa em silêncio)', () => {
    expect(checkGate([sample({}, 'ultra')], limits).join('\n')).toMatch(/sem limite para copa-1p\/ultra/);
    expect(checkGate([{ ...sample(), scene: 'marte' }], limits).join('\n')).toMatch(/sem limite para marte\/high/);
  });

  it('a ordem de custo: o preenchimento por pixel (cena × amostras do MSAA + pixels de pós) nunca cai de um degrau para o seguinte', () => {
    const mk = (quality: Quality, over: Partial<typeof vp>): GateSample => sample(over, quality);
    // A Média troca o MSAA por FXAA (um passe a mais, nenhuma amostra a mais): ela pode ter MAIS pixels de pós que a Alta sem AO, e o
    // preenchimento total continua subindo.
    const bom = [mk('low', { passes: 0, postPx: 0, samples: 0 }), mk('medium', { passes: 4, postPx: 4.2 * 921600, samples: 0 }), mk('high', { passes: 3, postPx: 3.9 * 921600, samples: 4 }), mk('ultra', { passes: 4, postPx: 6.9 * 921600, samples: 4 })];
    expect(checkCostOrder(bom)).toEqual([]);
    const ruim = [mk('low', { passes: 0, postPx: 0, samples: 0 }), mk('medium', { passes: 9, postPx: 6 * 921600, samples: 0 }), mk('high', { passes: 3, postPx: 3 * 921600, samples: 0 })];
    expect(checkCostOrder(ruim).join('\n')).toMatch(/copa-1p: preenchimento medium \(7\.00×\) > high \(4\.00×\)/);
  });
});
