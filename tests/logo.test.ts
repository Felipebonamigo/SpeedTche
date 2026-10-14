// Logo do Speed Tchê (src/ui/logo.ts). V3 (14/10/2026): o logo novo do tema padrão — "SPEED TCHÊ" em itálico forte numa placa
// inclinada com a faixa de velocidade, em SVG inline (sem dependência), legível em fundo claro e escuro, em três tamanhos: o do
// título (`big`), o do canto do menu (`small`) e o ícone quadrado (`icon`). O logo provisório da onda L5 ("Speed" / "Tchê" em
// degradê) continua só para o ?tema=classico, até a próxima versão (`logoClassicoMarkup`).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { logoClassicoMarkup, logoMarkup, type LogoSize } from '../src/ui/logo';

const SIZES: LogoSize[] = ['big', 'small', 'icon'];
const viewBox = (m: string) => (m.match(/viewBox="0 0 (\d+) (\d+)"/) ?? []).slice(1).map(Number);
const ids = (s: string) => [...s.matchAll(/\bid="([^"]+)"/g)].map((x) => x[1]);

describe('logo Speed Tchê', () => {
  it('é um SVG com viewBox, papel de imagem e nome acessível, nos três tamanhos', () => {
    for (const size of SIZES) {
      const m = logoMarkup(size);
      expect(m.startsWith('<svg'), size).toBe(true);
      expect(viewBox(m).length, size).toBe(2);
      expect(m).toContain('role="img"');
      expect(m).toContain('aria-label="Speed Tchê"');
      expect(m).toContain('class="logo logo-' + size + '"');
    }
  });

  it('o título e o canto escrevem SPEED e TCHÊ (com circunflexo), em itálico (inclinado) e com a faixa de velocidade', () => {
    for (const size of ['big', 'small'] as const) {
      const m = logoMarkup(size);
      expect(m, size).toContain('>SPEED<');
      expect(m, size).toContain('>TCHÊ<');
      expect(m, size).toMatch(/skewX\(-\d+/);
      expect(m, size).toContain('logo-faixa');
    }
  });

  it('o canto do menu é uma linha só (baixo e largo) e o ícone é quadrado', () => {
    const [w, h] = viewBox(logoMarkup('small'));
    expect(w / h).toBeGreaterThan(3);
    const [iw, ih] = viewBox(logoMarkup('icon'));
    expect(iw).toBe(ih);
  });

  it('o logo provisório antigo continua para o ?tema=classico', () => {
    const m = logoClassicoMarkup('big');
    expect(m).toContain('>Speed<');
    expect(m).toContain('>Tchê<');
    expect(m).toContain('class="logo logo-big"');
  });

  it('não sobrou NITRO nem CREW: nem no logo nem na tela de título', () => {
    for (const size of SIZES) expect(logoMarkup(size)).not.toMatch(/NITRO|CREW/i);
    const simple = readFileSync(join(__dirname, '..', 'src', 'ui', 'screens', 'simple.ts'), 'utf8');
    expect(simple).not.toMatch(/'NITRO'|'CREW'|wm-nitro|wm-crew/);
    expect(simple).toContain("from '../logo'");
  });

  it('os ids do SVG são únicos por tamanho e entre o logo novo e o antigo (dois logos na mesma tela não trocam o gradiente)', () => {
    const all = [...SIZES.map((s) => ids(logoMarkup(s))), ids(logoClassicoMarkup('big')), ids(logoClassicoMarkup('small'))];
    for (const list of all) expect(list.length).toBeGreaterThan(0);
    const flat = all.flat();
    expect(new Set(flat).size).toBe(flat.length);
  });
});
