// V9 (carro herói): a escolha do nível de detalhe de cada carro — herói (alta definição), intermediário (o casco de sempre, lod0) e longe (lod1).
// Puro (sem three): src/render/cars/lod.ts. O herói é do carro HUMANO, perto do carro do viewport, e nunca na Baixa nem com "Reduzir efeitos";
// a entrada e a saída têm histerese (o carro na borda do raio não pisca). Com 1 jogador, tudo o que NÃO é herói segue exatamente como era (V13).
import { describe, expect, it } from 'vitest';
import { CAR_LOD_FAR_M, carDetail, carLodDistance, HERO_EXIT_FACTOR, HERO_MAX_TRIANGLES, HERO_RADIUS_M, heroEnabled, heroRadius, type CarDetailInput } from '../src/render/cars/lod';
import { CAR_LIMITS } from '../src/render/cars/check';

const base: CarDetailInput = { human: true, own: false, mounted: false, distance: 10, ahead: 10, viewports: 1, lowQuality: false, heroOn: true, wasHero: false };
const at = (over: Partial<CarDetailInput>): ReturnType<typeof carDetail> => carDetail({ ...base, ...over });

describe('constantes do herói', () => {
  it('o orçamento do casco herói: de 10 a 20 mil △, bem acima do teto do casco de sempre', () => {
    expect(HERO_MAX_TRIANGLES).toBe(20000);
    expect(HERO_MAX_TRIANGLES).toBeGreaterThan(CAR_LIMITS.maxShellTriangles);
  });
  it('o raio do herói cabe dentro do raio do casco inteiro (o lod0 vira o intermediário) e cai à metade na tela dividida', () => {
    expect(HERO_RADIUS_M).toBeLessThan(CAR_LOD_FAR_M);
    expect(heroRadius(1)).toBe(HERO_RADIUS_M);
    expect(heroRadius(0)).toBe(HERO_RADIUS_M);
    for (const n of [2, 3, 4]) expect(heroRadius(n)).toBe(HERO_RADIUS_M / 2);
    for (const n of [1, 2, 4]) expect(heroRadius(n)).toBeLessThan(carLodDistance(n));
  });
  it('a saída do raio é maior que a entrada (histerese) e passa de 10%', () => {
    expect(HERO_EXIT_FACTOR).toBeGreaterThan(1.1);
  });
});

describe('quando o herói está ligado', () => {
  it('Baixa nunca; "Reduzir efeitos" nunca; interruptor desligado nunca', () => {
    for (const setting of ['auto', 'on', 'off'] as const) expect(heroEnabled({ quality: 'low', reduceEffects: false, setting }), `baixa/${setting}`).toBe(false);
    for (const q of ['medium', 'high', 'ultra'] as const) {
      for (const setting of ['auto', 'on'] as const) expect(heroEnabled({ quality: q, reduceEffects: true, setting }), `reduzir/${q}/${setting}`).toBe(false);
      expect(heroEnabled({ quality: q, reduceEffects: false, setting: 'off' }), `off/${q}`).toBe(false);
    }
  });
  it('automático: ligado só em Alta e Ultra; "ligado" liga também na Média', () => {
    expect(heroEnabled({ quality: 'medium', reduceEffects: false, setting: 'auto' })).toBe(false);
    expect(heroEnabled({ quality: 'high', reduceEffects: false, setting: 'auto' })).toBe(true);
    expect(heroEnabled({ quality: 'ultra', reduceEffects: false, setting: 'auto' })).toBe(true);
    expect(heroEnabled({ quality: 'medium', reduceEffects: false, setting: 'on' })).toBe(true);
  });
  it('sem o campo (save de antes) vale o automático', () => {
    expect(heroEnabled({ quality: 'high', reduceEffects: false })).toBe(true);
    expect(heroEnabled({ quality: 'medium', reduceEffects: false })).toBe(false);
  });
});

describe('o nível de cada carro', () => {
  it('humano perto, de frente: herói; o próprio carro do viewport (distância 0) é herói', () => {
    expect(at({ distance: 5 })).toBe('hero');
    expect(at({ own: true, distance: 0, ahead: 0 })).toBe('hero');
  });
  it('IA nunca é herói, por perto que esteja: fica no casco de sempre', () => {
    expect(at({ human: false, distance: 3, ahead: 3 })).toBe('full');
  });
  it('humano fora do raio cai para o intermediário; passando de 30 m (15 m na tela dividida), o longe — a regra de antes, intacta', () => {
    expect(at({ distance: HERO_RADIUS_M + 1, ahead: HERO_RADIUS_M + 1 })).toBe('full');
    expect(at({ distance: 29, ahead: 29 })).toBe('full');
    expect(at({ distance: 31, ahead: 31 })).toBe('far');
    expect(at({ viewports: 2, distance: 14, ahead: 14, heroOn: false })).toBe('full');
    expect(at({ viewports: 2, distance: 16, ahead: 16 })).toBe('far');
  });
  it('tela dividida: o herói só dentro do raio de metade', () => {
    for (const n of [2, 3, 4]) {
      expect(at({ viewports: n, distance: HERO_RADIUS_M / 2 - 1, ahead: 5 })).toBe('hero');
      expect(at({ viewports: n, distance: HERO_RADIUS_M / 2 + 1, ahead: 5 })).toBe('full');
    }
  });
  it('Baixa: casco simples (lod1) para todos e nada de herói, como sempre foi', () => {
    expect(at({ lowQuality: true, heroOn: false, distance: 2 })).toBe('far');
    expect(at({ lowQuality: true, heroOn: true, distance: 2 })).toBe('far');
  });
  it('herói desligado (interruptor, Reduzir efeitos): tudo como em V13', () => {
    expect(at({ heroOn: false, distance: 5 })).toBe('full');
    expect(at({ heroOn: false, distance: 40, ahead: 40 })).toBe('far');
  });
  it('1 jogador igual a antes: com o herói desligado, o nível é o de `carLodDistance` para qualquer carro, nas duas direções', () => {
    for (const ahead of [-5, 0, 10, 29.9, 30.1, 80]) {
      for (const human of [true, false]) {
        const want = ahead > carLodDistance(1) ? 'far' : 'full';
        expect(at({ heroOn: false, human, ahead, distance: Math.abs(ahead) }), `ahead ${ahead}`).toBe(want);
      }
    }
  });
  it('câmera presa ao carro (Capô, Frente): o próprio carro fica no casco de sempre (o corte da cabine e o olho saem dele)', () => {
    expect(at({ own: true, mounted: true, distance: 0, ahead: 0 })).toBe('full');
    expect(at({ own: false, mounted: true, distance: 5 })).toBe('hero'); // o rival visto da câmera de capô continua herói
  });
});

describe('histerese (sem piscar na borda)', () => {
  const R = heroRadius(1);
  it('quem já é herói só sai depois de R × saída; quem não é só entra dentro de R', () => {
    const inside = R * 0.98; const mid = R * (1 + (HERO_EXIT_FACTOR - 1) / 2); const out = R * HERO_EXIT_FACTOR + 0.5;
    expect(at({ distance: mid, ahead: 5, wasHero: false })).toBe('full');
    expect(at({ distance: mid, ahead: 5, wasHero: true })).toBe('hero');
    expect(at({ distance: inside, ahead: 5, wasHero: false })).toBe('hero');
    expect(at({ distance: out, ahead: 5, wasHero: true })).toBe('full');
  });
  it('um carro que oscila em torno do raio muda de nível uma vez, não a cada quadro', () => {
    let was = false; let flips = 0; let last: string | null = null;
    for (let i = 0; i < 400; i++) {
      const d = R + 1.2 * Math.sin(i / 9); // vai e volta ±1,2 m em torno da borda
      const lvl = at({ distance: d, ahead: 5, wasHero: was });
      was = lvl === 'hero';
      if (last !== null && lvl !== last) flips++;
      last = lvl;
    }
    expect(flips).toBeLessThanOrEqual(1);
  });
});
