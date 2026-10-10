// Logo PROVISÓRIO do Speed Tchê (onda L, L5): o nome em texto estilizado — duas palavras escalonadas, preenchimento em
// degradê, contorno grosso, sombra sólida e raias de velocidade — desenhado em SVG inline, na fonte de exibição
// (ui/fonts.css). É só o suficiente para a tela de título não dizer mais NITRO CREW: o logo de verdade (e o carro-mascote)
// é arte de verdade, decisão do dono (docs/CRONOGRAMA.md, onda U). A marcação é constante nossa, nunca dado do usuário.

export type LogoSize = 'big' | 'small';

const NAVY = '#0b1030';
const FONT = 'font-family:var(--font-display);font-weight:700;letter-spacing:-1px';

/** Marcação do SVG. Os ids levam o tamanho: dois logos na mesma tela (menu e créditos) não trocam de gradiente. */
export function logoMarkup(size: LogoSize): string {
  const a = `logo-${size}-sun`; const b = `logo-${size}-ice`;
  const word = (text: string, x: number, y: number, fill: string, rim: string): string =>
    `<text x="${x}" y="${y + 9}" font-size="132" style="${FONT}" fill="${NAVY}" stroke="${NAVY}" stroke-width="22" stroke-linejoin="round">${text}</text>`
    + `<text x="${x}" y="${y}" font-size="132" style="${FONT}" fill="${fill}" stroke="${rim}" stroke-width="12" stroke-linejoin="round" paint-order="stroke">${text}</text>`;
  return `<svg class="logo logo-${size}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 250" role="img" aria-label="Speed Tchê">`
    + `<defs>`
    + `<linearGradient id="${a}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff5a8"/><stop offset=".5" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff8a1f"/></linearGradient>`
    + `<linearGradient id="${b}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#9fe3ff"/></linearGradient>`
    + `</defs>`
    + `<g transform="rotate(-5 260 125)">`
    + `<g fill="none" stroke="#53cfff" stroke-width="10" stroke-linecap="round"><path d="M14 74h58M4 106h44M22 138h38"/></g>`
    + word('Speed', 70, 128, `url(#${a})`, '#ff5a36')
    + word('Tchê', 150, 232, `url(#${b})`, '#2a6df4')
    + `<path d="M62 150c90 18 250 14 400-22" fill="none" stroke="#ff5a36" stroke-width="9" stroke-linecap="round"/>`
    + `</g></svg>`;
}
