// Mensagem de volta (src/game/lap-message.ts, onda L, L5): "VOLTA n/total" ao fechar cada volta, e nada na última:
// quem anuncia a última volta é a faixa do HUD (src/render/hud-motion.ts), e dizer a mesma coisa duas vezes polui a tela.
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../src/i18n';
import { lapMessage } from '../src/game/lap-message';

afterEach(() => setLanguage('pt'));

describe('lapMessage', () => {
  it('volta comum: "VOLTA 2/3" (PT) e "LAP 2/3" (EN)', () => {
    setLanguage('pt');
    expect(lapMessage(2, 3)).toBe('VOLTA 2/3');
    setLanguage('en');
    expect(lapMessage(2, 3)).toBe('LAP 2/3');
  });

  it('a última volta (e depois dela) não tem mensagem: a faixa do HUD faz esse papel', () => {
    expect(lapMessage(3, 3)).toBeNull();
    expect(lapMessage(4, 3)).toBeNull();
  });
});
