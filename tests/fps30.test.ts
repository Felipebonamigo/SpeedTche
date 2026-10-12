// Onda L, L2b: modo opcional de 30 fps travados na Média com 3 e 4 jogadores (Opções › Visual, desligado por padrão).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/game/contracts';
import { sanitizeSettings } from '../src/game/settings';
import { fpsLockActive, FrameLimiter } from '../src/render/postfx/fps-lock';
import { DynamicResolution } from '../src/render/postfx/dynres';
import { fps30Selector } from '../src/ui/screens/options';
import { setLanguage, t } from '../src/i18n';
import '../src/i18n/core';
import '../src/ui/strings';
import type { ScreenApi } from '../src/ui/screens/common';

describe('30 fps travados (L2b)', () => {
  it('vem desligado e o save sanea o campo', () => {
    expect(DEFAULT_SETTINGS.lockFps30).toBe(false);
    expect(sanitizeSettings({}).lockFps30).toBe(false);
    expect(sanitizeSettings({ lockFps30: true }).lockFps30).toBe(true);
    expect(sanitizeSettings({ lockFps30: 'sim' }).lockFps30).toBe(false);
  });

  it('só vale na Média com 3 ou 4 jogadores e a opção ligada', () => {
    for (const q of ['low', 'medium', 'high', 'ultra'] as const) {
      for (const n of [1, 2, 3, 4]) {
        expect(fpsLockActive(q, n, true), `${q}/${n}`).toBe(q === 'medium' && n >= 3);
        expect(fpsLockActive(q, n, false), `${q}/${n} desligada`).toBe(false);
      }
    }
  });

  it('a 60 Hz desenha um quadro sim, um não; a 144 Hz não passa de ~36 por segundo; inativo desenha sempre', () => {
    const run = (hz: number, active: boolean): number => {
      const l = new FrameLimiter();
      let drawn = 0;
      for (let i = 0; i < hz * 10; i++) if (l.shouldDraw(i * (1000 / hz), active)) drawn++;
      return drawn / 10;
    };
    expect(run(60, true)).toBeGreaterThanOrEqual(29);
    expect(run(60, true)).toBeLessThanOrEqual(31);
    expect(run(144, true)).toBeLessThanOrEqual(37);
    expect(run(144, true)).toBeGreaterThanOrEqual(28);
    expect(run(60, false)).toBe(60);
  });

  it('o primeiro quadro sempre desenha e um quadro lento (>= 33 ms) nunca é pulado', () => {
    const l = new FrameLimiter();
    expect(l.shouldDraw(1000, true)).toBe(true);
    expect(l.shouldDraw(1040, true)).toBe(true);
    expect(l.shouldDraw(1090, true)).toBe(true);
  });

  it('a resolução dinâmica mede contra 33 ms no modo travado (senão desceria à toa)', () => {
    const free = new DynamicResolution();
    for (let i = 0; i < 100; i++) free.update(33.3);
    expect(free.scale).toBeLessThan(1);
    const locked = new DynamicResolution();
    locked.setTargetMs(1000 / 30);
    for (let i = 0; i < 100; i++) locked.update(33.3);
    expect(locked.scale).toBe(1);
  });
});

describe('opção de 30 fps nas Opções (L2b)', () => {
  afterEach(() => { vi.unstubAllGlobals(); setLanguage('pt'); });
  it('o seletor alterna e grava, com texto em PT e EN', () => {
    class El { children: unknown[] = []; className = ''; textContent = ''; title = ''; innerHTML = ''; classList = { add: () => undefined, remove: () => undefined, toggle: () => true, contains: () => false };
      constructor(readonly tag: string) {}
      setAttribute(): void { /* */ } appendChild<T>(c: T): T { this.children.push(c); return c; } append(...c: unknown[]): void { this.children.push(...c); } addEventListener(): void { /* */ } }
    vi.stubGlobal('document', {
      createElement: (tag: string) => { const e = new El(tag); if (tag === 'template') (e as unknown as { content: unknown }).content = { firstElementChild: new El('svg') }; return e; },
      createElementNS: (_n: string, tag: string) => new El(tag), createTextNode: (text: string) => ({ text }),
    });
    const s = structuredClone(DEFAULT_SETTINGS) as Settings;
    let commits = 0;
    const sel = fps30Selector({ ctx: { settings: s }, sfx: () => undefined } as unknown as ScreenApi, () => { commits++; });
    sel.adjust?.(1);
    expect(s.lockFps30).toBe(true);
    sel.adjust?.(1);
    expect(s.lockFps30).toBe(false);
    expect(commits).toBe(2);
    for (const lang of ['pt', 'en'] as const) { setLanguage(lang); expect(t('ui.options.fps30'), lang).not.toBe('ui.options.fps30'); expect(t('ui.options.fps30.hint'), lang).not.toBe('ui.options.fps30.hint'); }
  });
});
