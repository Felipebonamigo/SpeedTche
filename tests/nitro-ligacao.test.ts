// A ligação da N1 com o resto do jogo (commit separado, fora da tabela da frente; docs/ondas/N/N1.md, §2): o texto da peça de nitro no
// catálogo da garagem. O núcleo e o HUD não dependem disto.
import { describe, expect, it } from 'vitest';
import { UPGRADE_NITRO_FILL } from '../src/core/constants';

describe('a peça de nitro na garagem (N1)', () => {
  it('o texto da peça no catálogo da garagem diz o mesmo percentual que a constante (PT e EN)', async () => {
    const { setLanguage, t } = await import('../src/i18n');
    await import('../src/career/strings');
    const pct = String(Math.round(UPGRADE_NITRO_FILL * 100));
    for (const lang of ['pt', 'en'] as const) {
      setLanguage(lang);
      const text = t('career.garage.effect.nitro');
      expect(text, lang).toContain(pct);
      expect(text, lang).not.toMatch(/carga|charge/i); // a peça não dá mais carga: enche a barra mais depressa
    }
    setLanguage('pt');
  });
});
