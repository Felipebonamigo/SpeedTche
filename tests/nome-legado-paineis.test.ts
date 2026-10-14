// O jogo foi renomeado de "Nitro Crew" para Speed Tchê (10/10/2026). A galeria (V7, 14/10) achou na pista um painel
// "CREW RACING" — com o "NITRO" do painel vizinho, o nome antigo inteiro. Nenhum painel pode carregar o nome antigo.
import { describe, expect, it } from 'vitest';
import { DESIGNS } from '../src/render/scenery/textures';

describe('painéis da pista sem o nome antigo', () => {
  it('nenhum painel diz CREW (de "Nitro Crew")', () => {
    const textos = DESIGNS.map((d) => `${d.brand} ${d.tag}`.toUpperCase());
    expect(textos.filter((t) => /\bCREW\b/.test(t))).toEqual([]);
  });
  it('a quantidade de painéis não muda (o atlas é indexado pela posição)', () => {
    expect(DESIGNS.length).toBe(10);
  });
});
