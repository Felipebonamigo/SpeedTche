// Onda L, L2: a resolução dinâmica (controle puro; o renderizador a aplica no alvo de tamanho fixo, conferido em tests/gl-render.test.ts).
// Degraus, histerese LONGA (cair só depois de ~2 s lentos, subir só depois de ~6 s de folga), um degrau por vez, sem oscilar.
import { describe, expect, it } from 'vitest';
import { DYNRES_STEPS, DynamicResolution, dynamicResolutionDefault } from '../src/render/postfx/dynres';

/** Alimenta o controle com quadros de `ms` por `seconds` segundos e devolve a escala no fim. */
function feed(dr: DynamicResolution, ms: number, seconds: number): number {
  let scale = dr.scale;
  for (let t = 0; t < seconds * 1000; t += ms) scale = dr.update(ms);
  return scale;
}

describe('DynamicResolution', () => {
  it('os degraus são 1, 0,85 e 0,72 (o piso)', () => {
    expect([...DYNRES_STEPS]).toEqual([1, 0.85, 0.72]);
    expect(new DynamicResolution().scale).toBe(1);
  });

  it('quadros lentos por menos da histerese não descem; ao completar ~2 s descem UM degrau, e o piso segura', () => {
    const dr = new DynamicResolution();
    expect(feed(dr, 25, 1.8)).toBe(1);
    expect(feed(dr, 25, 0.5)).toBe(0.85); // passou dos 2 s no total
    expect(feed(dr, 25, 1.5)).toBe(0.85); // a janela recomeça: mais ~2 s para o próximo
    expect(feed(dr, 25, 0.5)).toBe(0.72);
    expect(feed(dr, 25, 20)).toBe(0.72); // piso
  });

  it('só sobe depois de ~6 s de folga, um degrau por vez', () => {
    const dr = new DynamicResolution();
    feed(dr, 25, 4.5); // 1 → 0,85 → 0,72
    expect(dr.scale).toBe(0.72);
    expect(feed(dr, 16, 5.5)).toBe(0.72);
    expect(feed(dr, 16, 1)).toBe(0.85); // 6 s de folga: um degrau
    expect(feed(dr, 16, 5)).toBe(0.85); // e os 6 s recomeçam: não pula para 1
    expect(feed(dr, 16, 2)).toBe(1);
  });

  it('um quadro lento no meio da folga zera a contagem de subida', () => {
    const dr = new DynamicResolution();
    feed(dr, 25, 2.2); // 0,85
    feed(dr, 16, 5);
    dr.update(40); // um tropeço
    expect(feed(dr, 16, 5)).toBe(0.85);
    expect(feed(dr, 16, 1.5)).toBe(1);
  });

  it('alternar lento e rápido a cada 0,5 s nunca troca de degrau (sem oscilação)', () => {
    const dr = new DynamicResolution();
    const seen = new Set<number>();
    for (let k = 0; k < 80; k++) seen.add(feed(dr, k % 2 === 0 ? 30 : 12, 0.5));
    expect([...seen]).toEqual([1]);
  });

  it('um degrau que volta a ser lento logo depois de subir dobra a espera da próxima subida (sem pisca-pisca)', () => {
    const dr = new DynamicResolution();
    feed(dr, 25, 2.2); // 0,85
    feed(dr, 16, 6.2); // sobe a 1
    expect(dr.scale).toBe(1);
    feed(dr, 25, 2.2); // cai de novo, perto demais da subida
    expect(dr.scale).toBe(0.85);
    expect(feed(dr, 16, 7)).toBe(0.85); // antes bastavam 6 s
    expect(feed(dr, 16, 6)).toBe(1); // agora ~12 s
  });

  it('pico isolado (aba escondida, carregamento) é ignorado: nem desce, nem zera a folga', () => {
    const dr = new DynamicResolution();
    feed(dr, 25, 2.2); // 0,85
    feed(dr, 16, 5);
    dr.update(800);
    dr.update(1500);
    expect(dr.scale).toBe(0.85);
    expect(feed(dr, 16, 1.5)).toBe(1);
    const dr2 = new DynamicResolution();
    for (let i = 0; i < 20; i++) dr2.update(900);
    expect(dr2.scale).toBe(1);
  });

  it('desligado devolve sempre 1; reset volta a 1; a meta de 30 fps muda o que é lento', () => {
    const dr = new DynamicResolution();
    dr.setEnabled(false);
    expect(feed(dr, 40, 10)).toBe(1);
    dr.setEnabled(true);
    expect(feed(dr, 25, 2.2)).toBe(0.85);
    dr.reset();
    expect(dr.scale).toBe(1);
    const lento30 = new DynamicResolution({ targetMs: 1000 / 30 });
    expect(feed(lento30, 25, 6)).toBe(1); // 40 fps é folga para quem mira 30
    expect(feed(lento30, 45, 2.2)).toBe(0.85);
  });
});

describe('dynamicResolutionDefault: desligada onde a imagem tem de ser reprodutível', () => {
  it('liga no jogo, desliga sob automação (Playwright) e obedece ?dynres=0|1', () => {
    expect(dynamicResolutionDefault('', false)).toBe(true);
    expect(dynamicResolutionDefault('?nosurvey=1', false)).toBe(true);
    expect(dynamicResolutionDefault('', true)).toBe(false);
    expect(dynamicResolutionDefault('?dynres=0', false)).toBe(false);
    expect(dynamicResolutionDefault('?x=1&dynres=1', true)).toBe(true);
    expect(dynamicResolutionDefault('?dynres=10', false)).toBe(true); // valor torto: cai no padrão
  });
});
