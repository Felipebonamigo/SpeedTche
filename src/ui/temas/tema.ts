// Tema visual do menu (V3, docs/ondas/menu-estilos.md). O padrão, sem parâmetro, é o "speedtche": a direção A (arcade moderno em
// pôr do sol: itálico forte nos títulos e nos botões, faixas diagonais, números grandes) com os painéis de informação da B (vidro
// escuro limpo, texto reto e legível). O visual anterior fica acessível só por `?tema=classico` até a próxima versão, para comparar;
// então este parâmetro, o `logoClassicoMarkup` e este arquivo de escolha saem e o CSS do tema vira o styles.css.
// O tema é o atributo `data-tema` em <html> e no #ui: as folhas repintam o que já existe (cor, borda, sombra, fonte) sem mexer em
// comportamento, navegação ou estado. As direções B e C puras saíram do jogo: ficam no histórico e na folha de componentes
// (tools/menu-estilos/).
import './tema-base.css';
import './tema-speedtche.css';

export const TEMA_PADRAO = 'speedtche' as const;
export const TEMAS = [TEMA_PADRAO] as const;
export type TemaId = typeof TEMAS[number];

/** O tema pedido na query string: o padrão, ou null com `?tema=classico` (o visual anterior). */
export function temaDaUrl(search: string): TemaId | null {
  const v = new URLSearchParams(search).get('tema')?.toLowerCase() ?? '';
  return v === 'classico' ? null : TEMA_PADRAO;
}

/** O tema ligado agora (null = clássico). */
export function temaAtivo(doc: Document = document): TemaId | null {
  return doc.documentElement.getAttribute('data-tema') === TEMA_PADRAO ? TEMA_PADRAO : null;
}

/** Liga (ou, com null, desliga) o tema na raiz e no #ui. */
export function aplicarTema(tema: TemaId | null, doc: Document = document): void {
  for (const el of [doc.documentElement, doc.getElementById('ui')]) {
    if (!el) continue;
    if (tema) el.setAttribute('data-tema', tema); else el.removeAttribute('data-tema');
  }
}

if (typeof document !== 'undefined' && typeof location !== 'undefined') aplicarTema(temaDaUrl(location.search));
