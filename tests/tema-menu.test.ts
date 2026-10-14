// Tema do menu (V3, docs/ondas/menu-estilos.md): o visual "speedtche" (direção A com os painéis de vidro da B) é o PADRÃO, sem
// parâmetro; o visual anterior fica acessível só por ?tema=classico até a próxima versão, para comparar. As direções B e C puras
// saíram do jogo (ficam no histórico e na folha de componentes em tools/menu-estilos/).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aplicarTema, temaDaUrl, TEMA_PADRAO, TEMAS } from '../src/ui/temas/tema';

function fakeEl() {
  const attrs = new Map<string, string>();
  return { attrs, setAttribute: (k: string, v: string) => { attrs.set(k, v); }, removeAttribute: (k: string) => { attrs.delete(k); } } as unknown as HTMLElement & { attrs: Map<string, string> };
}

describe('tema do menu', () => {
  it('sem parâmetro (ou com um valor desconhecido) o tema é o padrão "speedtche"', () => {
    expect(TEMA_PADRAO).toBe('speedtche');
    expect(TEMAS).toEqual(['speedtche']);
    expect(temaDaUrl('')).toBe('speedtche');
    expect(temaDaUrl('?nosurvey=1')).toBe('speedtche');
    expect(temaDaUrl('?tema=z')).toBe('speedtche');
    // As direções da escolha (a, b, c) não existem mais no jogo: caem no padrão.
    for (const t of ['a', 'b', 'c']) expect(temaDaUrl(`?tema=${t}`)).toBe('speedtche');
  });

  it('?tema=classico (sem diferenciar caixa) desliga o tema e volta ao visual anterior', () => {
    expect(temaDaUrl('?tema=classico')).toBeNull();
    expect(temaDaUrl('?x=1&tema=CLASSICO')).toBeNull();
  });

  it('liga o atributo data-tema na raiz e no #ui e o tira com null', () => {
    const root = fakeEl(); const ui = fakeEl();
    const doc = { documentElement: root, getElementById: (id: string) => (id === 'ui' ? ui : null) } as unknown as Document;
    aplicarTema('speedtche', doc);
    expect(root.attrs.get('data-tema')).toBe('speedtche');
    expect(ui.attrs.get('data-tema')).toBe('speedtche');
    aplicarTema(null, doc);
    expect(root.attrs.has('data-tema')).toBe(false);
    expect(ui.attrs.has('data-tema')).toBe(false);
  });

  it('o pacote do jogo só leva o tema padrão: as direções B e C puras ficam fora de src/', () => {
    const dir = join(__dirname, '..', 'src', 'ui', 'temas');
    const css = readdirSync(dir).filter((f) => f.endsWith('.css')).sort();
    expect(css).toEqual(['tema-base.css', 'tema-speedtche.css']);
    const ts = readFileSync(join(dir, 'tema.ts'), 'utf8');
    expect(ts).not.toMatch(/tema-[abc]\.css/);
  });

  it('os tokens do tema moram no #ui, nunca na raiz: o HUD de corrida (#hud) não muda com o menu', () => {
    const css = readFileSync(join(__dirname, '..', 'src', 'ui', 'temas', 'tema-speedtche.css'), 'utf8');
    // Nenhuma regra ":root[data-tema=…] {" que defina variável na raiz (é a raiz que o HUD herda).
    expect(css).not.toMatch(/:root\[data-tema="speedtche"\]\s*\{/);
    expect(css).toMatch(/:root\[data-tema="speedtche"\] #ui \{[^}]*--accent:/);
  });
});
