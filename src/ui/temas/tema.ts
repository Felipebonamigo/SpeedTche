// Temas visuais OPCIONAIS dos menus (docs/ondas/menu-estilos.md): `?tema=a|b|c` na URL liga um deles; sem o parâmetro (ou com
// qualquer outro valor) nada muda e o visual atual segue como padrão. O tema é só o atributo `data-tema` na raiz (<html>) e no
// #ui: as folhas tema-a/b/c.css repintam o que já existe (cores, bordas, sombras, fonte) sem mexer em comportamento, navegação
// ou estado. Reservado para a experimentação do dono: a escolha definitiva vira o padrão e esta camada some.
import './tema-icones.css';
import './tema-base.css';
import './tema-a.css';
import './tema-b.css';
import './tema-c.css';

export const TEMAS = ['a', 'b', 'c'] as const;
export type TemaId = typeof TEMAS[number];

/** O tema pedido na query string (`?tema=b`), ou null. */
export function temaDaUrl(search: string): TemaId | null {
  const v = new URLSearchParams(search).get('tema')?.toLowerCase() ?? '';
  return (TEMAS as readonly string[]).includes(v) ? (v as TemaId) : null;
}

/** Liga (ou, com null, desliga) o tema na raiz e no #ui. */
export function aplicarTema(tema: TemaId | null, doc: Document = document): void {
  for (const el of [doc.documentElement, doc.getElementById('ui')]) {
    if (!el) continue;
    if (tema) el.setAttribute('data-tema', tema); else el.removeAttribute('data-tema');
  }
}

if (typeof document !== 'undefined' && typeof location !== 'undefined') aplicarTema(temaDaUrl(location.search));
