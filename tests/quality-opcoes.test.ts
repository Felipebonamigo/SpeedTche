// Onda L, L2: o Ultra chega ao jogador. `ultra` entra no que o save aceita e no seletor de Opções (PT e EN), e o banco de prova passa a
// pedir ao renderizador a qualidade `ultra` de verdade (antes ele desenhava a Alta em 1440p).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/game/contracts';
import { QUALITIES, sanitizeSettings } from '../src/game/settings';
import { QUALITY_ORDER } from '../src/game/quality';
import { setLanguage, t } from '../src/i18n';
import '../src/i18n/core';
import '../src/ui/strings';
import { qualitySelector } from '../src/ui/screens/options';
import type { ScreenApi } from '../src/ui/screens/common';

// DOM mínimo (o vitest roda em Node, sem jsdom): o suficiente para o `selector()` montar a linha.
class FakeEl {
  children: unknown[] = [];
  className = '';
  textContent = '';
  title = '';
  innerHTML = '';
  private readonly attrs: Record<string, string> = {};
  classList = { add: () => undefined, remove: () => undefined, toggle: () => true, contains: () => false };
  constructor(readonly tag: string) {}
  setAttribute(k: string, v: string): void { this.attrs[k] = v; }
  appendChild<T>(c: T): T { this.children.push(c); return c; }
  append(...c: unknown[]): void { this.children.push(...c); }
  addEventListener(): void { /* não usado */ }
}

function installFakeDocument(): void {
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      const el = new FakeEl(tag);
      if (tag === 'template') (el as unknown as { content: unknown }).content = { firstElementChild: new FakeEl('svg') };
      return el;
    },
    createElementNS: (_ns: string, tag: string) => new FakeEl(tag),
    createTextNode: (text: string) => ({ text }),
  });
}

/** O texto do valor da linha (o `.sel-value`), procurado na árvore falsa. */
function valueText(el: unknown): string {
  const node = el as FakeEl;
  if (node.className === 'sel-value') return node.textContent;
  for (const c of node.children) { const v = valueText(c); if (v) return v; }
  return '';
}

function apiWith(settings: Settings): ScreenApi {
  return { ctx: { settings }, sfx: () => undefined } as unknown as ScreenApi;
}

afterEach(() => { vi.unstubAllGlobals(); setLanguage('pt'); });

describe('Ultra nas Opções (L2)', () => {
  it('o save aceita as quatro qualidades, na ordem do renderizador', () => {
    expect([...QUALITIES]).toEqual([...QUALITY_ORDER]);
    expect(QUALITIES).toContain('ultra');
    expect(sanitizeSettings({ quality: 'ultra' }).quality).toBe('ultra');
    expect(sanitizeSettings({ quality: 'maxima' }).quality).toBe(DEFAULT_SETTINGS.quality);
  });

  it('o seletor de Opções cicla os quatro níveis nos dois sentidos e grava a cada passo', () => {
    installFakeDocument();
    const settings = structuredClone(DEFAULT_SETTINGS) as Settings;
    settings.quality = 'low';
    let commits = 0;
    const sel = qualitySelector(apiWith(settings), () => { commits++; });
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) { sel.adjust?.(1); seen.push(settings.quality); }
    expect(seen).toEqual(['medium', 'high', 'ultra', 'low']);
    sel.adjust?.(-1);
    expect(settings.quality).toBe('ultra');
    expect(commits).toBe(5);
  });

  it('o nome do Ultra existe em PT e em EN (não cai na chave)', () => {
    installFakeDocument();
    const settings = structuredClone(DEFAULT_SETTINGS) as Settings;
    settings.quality = 'ultra';
    const sel = qualitySelector(apiWith(settings), () => undefined);
    setLanguage('pt');
    expect(t('ui.options.quality.ultra')).toBe('Ultra');
    expect(valueText(qualitySelector(apiWith(settings), () => undefined).el)).toBe('Ultra');
    setLanguage('en');
    expect(t('ui.options.quality.ultra')).toBe('Ultra');
    sel.refresh();
    expect(valueText(sel.el)).toBe('Ultra');
    for (const q of QUALITIES) expect(t(`ui.options.quality.${q}`), q).not.toBe(`ui.options.quality.${q}`);
  });
});
