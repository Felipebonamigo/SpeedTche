// Logo provisório da tela de título (src/ui/logo.ts, onda L, L5): "Speed Tchê" em SVG inline, feito em código com a fonte
// de exibição (ui/fonts.css). Substitui o texto NITRO CREW, que ainda estava no título, no menu e nos créditos.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { logoMarkup, type LogoSize } from '../src/ui/logo';

const SIZES: LogoSize[] = ['big', 'small'];

describe('logo Speed Tchê', () => {
  it('é um SVG com viewBox, papel de imagem e nome acessível', () => {
    for (const size of SIZES) {
      const m = logoMarkup(size);
      expect(m.startsWith('<svg'), size).toBe(true);
      expect(m).toContain('viewBox="');
      expect(m).toContain('role="img"');
      expect(m).toContain('aria-label="Speed Tchê"');
      expect(m).toContain('class="logo logo-' + size + '"');
    }
  });

  it('desenha as palavras "Speed" e "Tchê" (com circunflexo) usando a fonte de exibição', () => {
    const m = logoMarkup('big');
    expect(m).toContain('>Speed<');
    expect(m).toContain('>Tchê<');
    expect(m).toContain('var(--font-display)');
  });

  it('não sobrou NITRO nem CREW: nem no logo nem na tela de título', () => {
    for (const size of SIZES) expect(logoMarkup(size)).not.toMatch(/NITRO|CREW/i);
    const simple = readFileSync(join(__dirname, '..', 'src', 'ui', 'screens', 'simple.ts'), 'utf8');
    expect(simple).not.toMatch(/'NITRO'|'CREW'|wm-nitro|wm-crew/);
    expect(simple).toContain("from '../logo'");
  });

  it('os ids do SVG são únicos por tamanho (dois logos na mesma tela não trocam o gradiente)', () => {
    const ids = (s: string) => [...s.matchAll(/\bid="([^"]+)"/g)].map((x) => x[1]);
    const a = ids(logoMarkup('big')); const b = ids(logoMarkup('small'));
    expect(a.length).toBeGreaterThan(0);
    for (const id of a) expect(b).not.toContain(id);
    expect(new Set(a).size).toBe(a.length);
  });
});
