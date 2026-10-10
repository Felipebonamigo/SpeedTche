// Fonte de exibição embutida (onda L, L5): as três candidatas do dono (Fredoka, Baloo 2, Lilita One), todas OFL, dentro
// do repositório, com a licença junto e registrada em docs/ARTE.md. A escolha é UMA linha (`--font-display` em
// src/ui/fonts.css); o HUD e os títulos usam essa variável, nunca uma família escrita à mão.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FONTS = join(__dirname, '..', 'src', 'assets', 'fonts');
const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

/** Família do @font-face, arquivo e licença de cada uma. */
const FAMILIES = [
  { family: 'Fredoka', file: 'Fredoka-latin.woff2', license: 'OFL-Fredoka.txt', magic: 'wOF2' },
  { family: 'Baloo 2', file: 'Baloo2-latin.woff2', license: 'OFL-Baloo2.txt', magic: 'wOF2' },
  // Lilita One tem "Reserved Font Name": vai o TTF original, sem subconjunto nem renomear.
  { family: 'Lilita One', file: 'LilitaOne-Regular.ttf', license: 'OFL-LilitaOne.txt', magic: '\x00\x01\x00\x00' },
] as const;

describe('fontes de exibição OFL', () => {
  it('as três fontes e as três licenças estão em src/assets/fonts/, com o formato certo e tamanho que cabe no pacote', () => {
    for (const f of FAMILIES) {
      const path = join(FONTS, f.file);
      expect(existsSync(path), f.file).toBe(true);
      const bytes = readFileSync(path);
      expect(bytes.subarray(0, 4).toString('latin1'), `${f.file}: assinatura`).toBe(f.magic);
      expect(bytes.length, `${f.file}: tamanho`).toBeLessThan(80 * 1024);
      const lic = readFileSync(join(FONTS, f.license), 'utf8');
      expect(lic).toContain('SIL OPEN FONT LICENSE Version 1.1');
    }
    expect(readdirSync(FONTS).filter((n) => /\.(woff2?|ttf|otf)$/i.test(n)).sort()).toEqual(FAMILIES.map((f) => f.file).sort());
  });

  it('fonts.css declara um @font-face por família e o --font-display aponta para uma delas (a escolha é uma linha)', () => {
    const css = read('src', 'ui', 'fonts.css');
    for (const f of FAMILIES) {
      expect(css, f.family).toContain(`font-family: "${f.family}"`);
      expect(css, f.file).toContain(`assets/fonts/${f.file}`);
    }
    const choice = [...css.matchAll(/--font-display:\s*([^;]+);/g)];
    expect(choice, 'uma única definição de --font-display').toHaveLength(1);
    expect(FAMILIES.some((f) => choice[0][1].includes(`"${f.family}"`))).toBe(true);
    expect(choice[0][1]).toContain('Fredoka'); // a padrão; o dono escolhe
  });

  it('o HUD e os títulos usam var(--font-display), e o HUD não tem família solta só de sistema', () => {
    const hud = read('src', 'render', 'hud.css');
    expect(hud).toContain('var(--font-display)');
    const menu = read('src', 'ui', 'styles.css');
    expect(menu).toContain('var(--font-display)');
    expect(hud).not.toMatch(/font-family:\s*"Segoe UI"/);
  });

  it('o hud.ts e a tela de título carregam a fonte (import de fonts.css)', () => {
    expect(read('src', 'render', 'hud.ts')).toContain("import '../ui/fonts.css'");
    expect(read('src', 'ui', 'screens', 'simple.ts')).toContain("import '../fonts.css'");
  });

  it('docs/ARTE.md registra licença, autor, URL e arquivo de cada fonte', () => {
    const doc = read('docs', 'ARTE.md');
    for (const f of FAMILIES) expect(doc, f.family).toContain(f.file);
    expect(doc).toContain('github.com/google/fonts');
    expect(doc).toMatch(/SIL Open Font License/i);
    for (const author of ['Milena Brandão', 'EkType', 'Juan Montoreano']) expect(doc, author).toContain(author);
  });
});
