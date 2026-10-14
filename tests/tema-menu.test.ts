// Temas opcionais do menu (docs/ondas/menu-estilos.md): o parâmetro ?tema= liga um tema por atributo e, sem ele, nada muda.
import { describe, expect, it } from 'vitest';
import { aplicarTema, temaDaUrl, TEMAS } from '../src/ui/temas/tema';

function fakeEl() {
  const attrs = new Map<string, string>();
  return { attrs, setAttribute: (k: string, v: string) => { attrs.set(k, v); }, removeAttribute: (k: string) => { attrs.delete(k); } } as unknown as HTMLElement & { attrs: Map<string, string> };
}

describe('temas do menu', () => {
  it('lê ?tema=a|b|c (sem diferenciar caixa) e ignora o resto', () => {
    for (const t of TEMAS) expect(temaDaUrl(`?x=1&tema=${t}`)).toBe(t);
    expect(temaDaUrl('?tema=B')).toBe('b');
    expect(temaDaUrl('')).toBeNull();
    expect(temaDaUrl('?tema=z')).toBeNull();
    expect(temaDaUrl('?tema=')).toBeNull();
  });

  it('liga o atributo data-tema na raiz e no #ui e o tira com null (o visual atual é o padrão)', () => {
    const root = fakeEl(); const ui = fakeEl();
    const doc = { documentElement: root, getElementById: (id: string) => (id === 'ui' ? ui : null) } as unknown as Document;
    aplicarTema('c', doc);
    expect(root.attrs.get('data-tema')).toBe('c');
    expect(ui.attrs.get('data-tema')).toBe('c');
    aplicarTema(null, doc);
    expect(root.attrs.has('data-tema')).toBe(false);
    expect(ui.attrs.has('data-tema')).toBe(false);
  });
});
