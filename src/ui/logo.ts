// Logo PROVISÓRIO do Speed Tchê (onda L, L5): o nome em texto estilizado — preenchimento em degradê, contorno grosso, sombra
// sólida e raias de velocidade — desenhado em SVG inline, na fonte de exibição (ui/fonts.css). É só o suficiente para a
// tela de título não dizer mais NITRO CREW: o logo de verdade (e o carro-mascote) é arte de verdade, decisão do dono
// (docs/CRONOGRAMA.md, onda U). `big` (título): duas palavras escalonadas e inclinadas. `small` (menu e créditos): uma linha
// só, para não pesar na altura do menu. A marcação é constante nossa, nunca dado do usuário.

export type LogoSize = 'big' | 'small';

const NAVY = '#0b1030';
const FONT = 'font-family:var(--font-display);font-weight:700;letter-spacing:-1px';

/** Marcação do SVG. Os ids levam o tamanho: dois logos na mesma tela (menu e créditos) não trocam de gradiente. */
export function logoMarkup(size: LogoSize): string {
  const a = `logo-${size}-sun`; const b = `logo-${size}-ice`;
  const big = size === 'big';
  const fs = big ? 132 : 60; const rim = big ? 12 : 6; const back = big ? 22 : 11; const drop = big ? 9 : 4;
  const word = (text: string, x: number, y: number, fill: string, edge: string): string =>
    `<text x="${x}" y="${y + drop}" font-size="${fs}" style="${FONT}" fill="${NAVY}" stroke="${NAVY}" stroke-width="${back}" stroke-linejoin="round">${text}</text>`
    + `<text x="${x}" y="${y}" font-size="${fs}" style="${FONT}" fill="${fill}" stroke="${edge}" stroke-width="${rim}" stroke-linejoin="round" paint-order="stroke">${text}</text>`;
  const defs = `<defs>`
    + `<linearGradient id="${a}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff5a8"/><stop offset=".5" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff8a1f"/></linearGradient>`
    + `<linearGradient id="${b}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#9fe3ff"/></linearGradient>`
    + `</defs>`;
  const open = (box: string) => `<svg class="logo logo-${size}" xmlns="http://www.w3.org/2000/svg" viewBox="${box}" role="img" aria-label="Speed Tchê">`;
  if (!big) {
    return open('0 0 330 86') + defs
      + `<g transform="rotate(-3 165 43)">`
      + `<g fill="none" stroke="#53cfff" stroke-width="5" stroke-linecap="round"><path d="M6 30h22M2 46h16M10 62h14"/></g>`
      + word('Speed', 34, 60, `url(#${a})`, '#ff5a36')
      + word('Tchê', 190, 60, `url(#${b})`, '#2a6df4')
      + `</g></svg>`;
  }
  return open('0 0 520 280') + defs
    + `<g transform="rotate(-5 260 140)">`
    + `<g fill="none" stroke="#53cfff" stroke-width="10" stroke-linecap="round"><path d="M14 68h58M4 100h44M22 132h38"/></g>`
    + word('Speed', 70, 122, `url(#${a})`, '#ff5a36')
    + word('Tchê', 150, 232, `url(#${b})`, '#2a6df4')
    + `<path d="M96 266c110 14 250 8 372-26" fill="none" stroke="#ff5a36" stroke-width="9" stroke-linecap="round"/>`
    + `</g></svg>`;
}
