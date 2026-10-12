// Onda L, L2b: qualidade escolhida sozinha na 1ª abertura. Puro: o que se mede sem GPU real.
import { describe, expect, it } from 'vitest';
import { pickAutoQuality, shouldAutoQuality, applyAutoQuality, type AutoProbe } from '../src/game/auto-quality';
import { DEFAULT_SETTINGS } from '../src/game/contracts';
import { sanitizeSettings } from '../src/game/settings';

const base: AutoProbe = { cores: 8, memoryGb: 16, screenPx: 1920 * 1080, dpr: 1, frameMs: 16.7, gpu: 'NVIDIA GeForce RTX 3060', desktop: false };

describe('escolha automática (L2b)', () => {
  it('máquina folgada cai em Alta; nunca escolhe Ultra sozinha', () => {
    expect(pickAutoQuality(base)).toBe('high');
    expect(pickAutoQuality({ ...base, cores: 32, memoryGb: 32, screenPx: 3840 * 2160 })).not.toBe('ultra');
  });
  it('GPU de software ou quadros lentos viram Baixa', () => {
    expect(pickAutoQuality({ ...base, gpu: 'Google SwiftShader' })).toBe('low');
    expect(pickAutoQuality({ ...base, gpu: 'llvmpipe (LLVM 15.0.7, 256 bits)' })).toBe('low');
    expect(pickAutoQuality({ ...base, frameMs: 45 })).toBe('low');
  });
  it('poucos núcleos, pouca memória ou tela enorme com pouca máquina: Média', () => {
    expect(pickAutoQuality({ ...base, cores: 4 })).toBe('medium');
    expect(pickAutoQuality({ ...base, memoryGb: 4 })).toBe('medium');
    expect(pickAutoQuality({ ...base, frameMs: 26 })).toBe('medium');
    expect(pickAutoQuality({ ...base, cores: 4, screenPx: 3840 * 2160, dpr: 2 })).toBe('low');
  });
  it('Electron/Deck é Média, a não ser que seja software', () => {
    expect(pickAutoQuality({ ...base, desktop: true })).toBe('medium');
    expect(pickAutoQuality({ ...base, desktop: true, gpu: 'SwiftShader' })).toBe('low');
  });
  it('campos que o navegador não informa (nulos) não quebram nem pioram', () => {
    expect(pickAutoQuality({ ...base, memoryGb: null, gpu: null, frameMs: null })).toBe('high');
  });
});

describe('só na primeira abertura (L2b)', () => {
  const env = { webdriver: false, search: '' };
  it('roda quando não existe nada salvo', () => {
    expect(shouldAutoQuality(null, env)).toBe(true);
    expect(shouldAutoQuality(undefined, env)).toBe(true);
  });
  it('não roda para quem já tem settings salvos (mesmo sem o campo novo)', () => {
    expect(shouldAutoQuality({ quality: 'high', language: 'pt' }, env)).toBe(false);
    expect(shouldAutoQuality({}, env)).toBe(false);
  });
  it('não roda com o campo já gravado, sob automação nem com ?autoq=0', () => {
    expect(shouldAutoQuality({ autoQuality: 'medium' }, env)).toBe(false);
    expect(shouldAutoQuality(null, { webdriver: true, search: '' })).toBe(false);
    expect(shouldAutoQuality(null, { webdriver: false, search: '?autoq=0' })).toBe(false);
  });
  it('applyAutoQuality grava a qualidade e a marca, preservando o resto', () => {
    const out = applyAutoQuality(null, 'medium') as Record<string, unknown>;
    expect(out.quality).toBe('medium');
    expect(out.autoQuality).toBe('medium');
  });
  it('o saneamento aceita o campo, ignora lixo, e o padrão não o tem', () => {
    expect(sanitizeSettings({ quality: 'medium', autoQuality: 'medium' }).autoQuality).toBe('medium');
    expect(sanitizeSettings({ autoQuality: 'maxima' }).autoQuality).toBeUndefined();
    expect(sanitizeSettings({}).autoQuality).toBeUndefined();
    expect('autoQuality' in DEFAULT_SETTINGS).toBe(false);
  });
});
