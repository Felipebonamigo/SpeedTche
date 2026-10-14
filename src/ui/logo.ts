// Logo do Speed Tchê em SVG inline (marcação constante nossa, nunca dado do usuário; sem dependência).
//
// V3 (14/10/2026), tema padrão "speedtche" — variação "cromo", a escolhida entre três (folha: tools/menu-estilos/logos.html;
// as outras duas, "placa" e "fita", moram só em tools/menu-estilos/logos.ts): "SPEED" e "TCHÊ" em itálico forte (o texto
// inclinado com skewX, porque a Fredoka embutida não tem itálico), "SPEED" em branco-céu e "TCHÊ" em degradê de sol, com contorno
// azul-marinho grosso e sombra sólida (é o contorno que deixa o logo legível em fundo claro e escuro) e a FAIXA DE VELOCIDADE
// (laranja, rosa e azul) cruzando por trás. Três tamanhos: `big` (título, duas linhas), `small` (canto do menu e créditos, uma
// linha, a mesma caixa do logo antigo) e `icon` (quadrado, "ST"). `textLength` fixa a largura de cada palavra: se a fonte não
// carregar, o desenho não muda de tamanho.
//
// `logoClassicoMarkup` é o logo provisório da onda L5 ("Speed" / "Tchê" em degradê), que fica só para o ?tema=classico até a
// próxima versão (sai junto com o parâmetro).

export type LogoSize = 'big' | 'small' | 'icon';

const NAVY = '#0b1030';
const FONT = 'font-family:Fredoka,var(--font-display),sans-serif;font-weight:700';

function text(x: number, y: number, size: number, len: number, content: string, fill: string, extra = ''): string {
  return `<text x="${x}" y="${y}" font-size="${size}" textLength="${len}" lengthAdjust="spacingAndGlyphs" style="${FONT}" fill="${fill}" ${extra}>${content}</text>`;
}
function open(size: LogoSize, w: number, h: number): string {
  return `<svg class="logo logo-${size}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Speed Tchê">`;
}
const sun = (id: string) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a0"/><stop offset=".45" stop-color="#ffc23a"/><stop offset="1" stop-color="#ff6a2b"/></linearGradient>`;
const sky = (id: string) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#bfe6ff"/></linearGradient>`;

export function logoMarkup(size: LogoSize): string {
  const p = `lgc-${size}`;
  const defs = `<defs>${sun(`${p}-sun`)}${sky(`${p}-sky`)}</defs>`;
  const word = (x: number, y: number, fs: number, len: number, t: string, fill: string, rim: number) =>
    text(x + rim * 0.5, y + rim * 0.7, fs, len, t, NAVY, `stroke="${NAVY}" stroke-width="${rim * 1.8}" stroke-linejoin="round"`)
    + text(x, y, fs, len, t, fill, `stroke="${NAVY}" stroke-width="${rim}" stroke-linejoin="round" paint-order="stroke"`);
  if (size === 'icon') {
    return open(size, 96, 96) + defs + `<rect x="2" y="2" width="92" height="92" rx="18" fill="${NAVY}"/>`
      + `<g class="logo-faixa" transform="skewX(-14)"><rect x="18" y="66" width="80" height="7" fill="#ff8a1f"/><rect x="26" y="76" width="70" height="7" fill="#ff3d7f"/></g>`
      + `<g transform="skewX(-12)">${word(22, 64, 56, 62, 'ST', `url(#${p}-sun)`, 5)}</g></svg>`;
  }
  if (size === 'small') {
    return open(size, 330, 80) + defs
      + `<g class="logo-faixa" transform="skewX(-20)"><path d="M40 70h270v6H40z" fill="#ff8a1f"/><path d="M60 62h250v5H60z" fill="#ff3d7f"/></g>`
      + `<g transform="skewX(-12)">${word(24, 54, 48, 120, 'SPEED', `url(#${p}-sky)`, 6)}${word(166, 54, 48, 116, 'TCHÊ', `url(#${p}-sun)`, 6)}</g></svg>`;
  }
  return open(size, 560, 290) + defs
    + `<g class="logo-faixa" transform="skewX(-30)"><rect x="150" y="150" width="400" height="16" fill="#ff8a1f"/><rect x="190" y="174" width="360" height="16" fill="#ff3d7f"/><rect x="230" y="198" width="320" height="16" fill="#2f7bff"/></g>`
    + `<g transform="skewX(-12)">${word(70, 130, 128, 400, 'SPEED', `url(#${p}-sky)`, 12)}${word(170, 262, 132, 360, 'TCHÊ', `url(#${p}-sun)`, 12)}</g></svg>`;
}

/** O logo provisório da onda L5, só para o ?tema=classico (até a próxima versão). */
export function logoClassicoMarkup(size: LogoSize): string {
  const a = `logo-${size}-sun`; const b = `logo-${size}-ice`;
  const big = size === 'big';
  const fs = big ? 132 : 60; const rim = big ? 12 : 6; const back = big ? 22 : 11; const drop = big ? 9 : 4;
  const style = 'font-family:var(--font-display);font-weight:700;letter-spacing:-1px';
  const word = (t: string, x: number, y: number, fill: string, edge: string): string =>
    `<text x="${x}" y="${y + drop}" font-size="${fs}" style="${style}" fill="${NAVY}" stroke="${NAVY}" stroke-width="${back}" stroke-linejoin="round">${t}</text>`
    + `<text x="${x}" y="${y}" font-size="${fs}" style="${style}" fill="${fill}" stroke="${edge}" stroke-width="${rim}" stroke-linejoin="round" paint-order="stroke">${t}</text>`;
  const d = `<defs>`
    + `<linearGradient id="${a}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff5a8"/><stop offset=".5" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff8a1f"/></linearGradient>`
    + `<linearGradient id="${b}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#9fe3ff"/></linearGradient>`
    + `</defs>`;
  const svg = (box: string) => `<svg class="logo logo-${size}" xmlns="http://www.w3.org/2000/svg" viewBox="${box}" role="img" aria-label="Speed Tchê">`;
  if (!big) {
    return svg('0 0 330 86') + d
      + `<g transform="rotate(-3 165 43)">`
      + `<g fill="none" stroke="#53cfff" stroke-width="5" stroke-linecap="round"><path d="M6 30h22M2 46h16M10 62h14"/></g>`
      + word('Speed', 34, 60, `url(#${a})`, '#ff5a36')
      + word('Tchê', 190, 60, `url(#${b})`, '#2a6df4')
      + `</g></svg>`;
  }
  return svg('0 0 520 280') + d
    + `<g transform="rotate(-5 260 140)">`
    + `<g fill="none" stroke="#53cfff" stroke-width="10" stroke-linecap="round"><path d="M14 68h58M4 100h44M22 132h38"/></g>`
    + word('Speed', 70, 122, `url(#${a})`, '#ff5a36')
    + word('Tchê', 150, 232, `url(#${b})`, '#2a6df4')
    + `<path d="M96 266c110 14 250 8 372-26" fill="none" stroke="#ff5a36" stroke-width="9" stroke-linecap="round"/>`
    + `</g></svg>`;
}
