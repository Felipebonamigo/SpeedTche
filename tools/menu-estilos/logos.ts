// Variações do logo novo (V3, 14/10/2026) para a folha `tools/menu-estilos/logos.html`: a escolhida para o jogo ("cromo") mora em
// src/ui/logo.ts (`logoMarkup`); as outras duas ("placa" e "fita") ficam SÓ aqui, para o dono comparar e trocar depois. Mesmo contrato do logo do jogo:
// SVG inline, marcação constante, ids únicos por variação e tamanho, `textLength` para a largura não depender da fonte carregada.
import { logoMarkup, type LogoSize } from '../../src/ui/logo';


export type Variante = 'placa' | 'cromo' | 'fita';
export const VARIANTES: Variante[] = ['cromo', 'placa', 'fita'];

const NAVY = '#0b1030';
const FONT = 'font-family:Fredoka,var(--font-display),sans-serif;font-weight:700';

function open(v: string, size: LogoSize, w: number, h: number): string {
  return `<svg class="logo logo-${size} logo-${v}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Speed Tchê">`;
}
function text(x: number, y: number, size: number, len: number, content: string, fill: string, extra = ''): string {
  return `<text x="${x}" y="${y}" font-size="${size}" textLength="${len}" lengthAdjust="spacingAndGlyphs" style="${FONT}" fill="${fill}" ${extra}>${content}</text>`;
}
const sun = (id: string) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a0"/><stop offset=".45" stop-color="#ffc23a"/><stop offset="1" stop-color="#ff6a2b"/></linearGradient>`;
const sky = (id: string) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#bfe6ff"/></linearGradient>`;
const ribbon = (id: string) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff8a1f"/><stop offset=".55" stop-color="#ff3d7f"/><stop offset="1" stop-color="#7b3cff"/></linearGradient>`;

/** "Placa": placa inclinada azul-marinho com aro branco, "TCHÊ" em degradê de sol, a faixa por baixo. */
const PLATE = '#0e1338';


function openPlaca(size: LogoSize, w: number, h: number): string {
  return `<svg class="logo logo-${size} logo-placa" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Speed Tchê">`;
}

/** Degradê de sol do "TCHÊ" (de cima para baixo) e o da placa (um brilho leve no alto). Os ids levam o tamanho (dois logos na mesma tela). */
function defs(p: string): string {
  return `<defs>`
    + `<linearGradient id="${p}-sol" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a0"/><stop offset=".45" stop-color="#ffc23a"/><stop offset="1" stop-color="#ff6a2b"/></linearGradient>`
    + `<linearGradient id="${p}-placa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#25306e"/><stop offset=".5" stop-color="${PLATE}"/><stop offset="1" stop-color="#080b24"/></linearGradient>`
    + `</defs>`;
}

/** A faixa de velocidade: três barras inclinadas que afinam para trás (laranja, rosa, azul). */
function faixa(x: number, y: number, w: number, bar: number, gap: number, skew: number): string {
  const row = (i: number, color: string) => {
    const left = x + i * bar * 2.2; // cada barra começa mais para trás que a de cima: o rastro
    return `<rect x="${left}" y="${y + i * (bar + gap)}" width="${w - i * bar * 2.2}" height="${bar}" rx="${bar / 2}" fill="${color}"/>`;
  };
  return `<g class="logo-faixa" transform="skewX(${skew})">${row(0, '#ff8a1f')}${row(1, '#ff3d7f')}${row(2, '#2f7bff')}</g>`;
}

function placa(size: LogoSize): string {
  const p = `lgp-${size}`;
  const rim = (w: number) => `stroke="${NAVY}" stroke-width="${w}" stroke-linejoin="round" paint-order="stroke"`;
  if (size === 'icon') {
    return openPlaca(size, 96, 96) + defs(p)
      + `<rect x="3" y="3" width="90" height="90" rx="20" fill="url(#${p}-placa)" stroke="#fff" stroke-width="5"/>`
      + faixa(38, 70, 56, 5, 2, -20)
      + `<g transform="skewX(-12)">`
      + text(26, 62, 50, 40, 'S', '#fff', rim(4))
      + text(54, 62, 50, 34, 'T', `url(#${p}-sol)`, rim(4))
      + `</g></svg>`;
  }
  if (size === 'small') {
    // 330 × 80: a mesma largura e quase a mesma altura do logo antigo do canto (330 × 86) — o menu não muda de altura.
    return openPlaca(size, 330, 80) + defs(p)
      + faixa(4, 63, 300, 4, 2.5, -24)
      + `<path d="M30 4H326L304 58H8Z" fill="url(#${p}-placa)" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>`
      + `<g transform="skewX(-12)">`
      + text(34, 47, 40, 128, 'SPEED', '#fff')
      + text(178, 47, 40, 112, 'TCHÊ', `url(#${p}-sol)`)
      + `</g></svg>`;
  }
  // 560 × 280 (o antigo: 520 × 280): a placa inclinada no alto, a faixa por baixo.
  return openPlaca(size, 560, 280) + defs(p)
    + faixa(28, 196, 520, 14, 7, -24)
    + `<path d="M74 34H552L506 184H28Z" fill="url(#${p}-placa)" stroke="#fff" stroke-width="9" stroke-linejoin="round"/>`
    + `<path d="M84 46H536L496 172H44Z" fill="none" stroke="#ff8a1f" stroke-width="3" stroke-linejoin="round" opacity=".9"/>`
    + `<g transform="skewX(-12)">`
    + text(100, 164, 92, 226, 'SPEED', '#fff', rim(5))
    + text(350, 164, 92, 190, 'TCHÊ', `url(#${p}-sol)`, rim(5))
    + `</g></svg>`;
}

/** "Fita": uma linha branca de contorno marinho sobre uma fita longa em degradê de pôr do sol, com riscos de velocidade e »». */
function fita(size: LogoSize): string {
  const p = `lgf-${size}`;
  const defs = `<defs>${ribbon(`${p}-fita`)}</defs>`;
  const word = (x: number, y: number, fs: number, len: number, t: string, rim: number) =>
    text(x + rim * 0.4, y + rim * 0.6, fs, len, t, NAVY, `stroke="${NAVY}" stroke-width="${rim * 1.6}" stroke-linejoin="round"`)
    + text(x, y, fs, len, t, '#fff', `stroke="${NAVY}" stroke-width="${rim}" stroke-linejoin="round" paint-order="stroke"`);
  if (size === 'icon') {
    return open('fita', size, 96, 96) + defs + `<rect x="2" y="2" width="92" height="92" rx="18" fill="${NAVY}"/>`
      + `<path class="logo-faixa" d="M10 34L92 26 86 74 4 82z" fill="url(#${p}-fita)"/>`
      + `<g transform="skewX(-12)">${word(26, 70, 50, 58, 'ST', 5)}</g></svg>`;
  }
  if (size === 'small') {
    return open('fita', size, 330, 80) + defs
      + `<path class="logo-faixa" d="M14 18L326 8 318 70 6 78z" fill="url(#${p}-fita)"/>`
      + `<g stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".75"><path d="M12 30h26M8 44h18M14 58h22"/></g>`
      + `<g transform="skewX(-12)">${word(48, 58, 44, 250, 'SPEED TCHÊ', 5)}</g></svg>`;
  }
  return open('fita', size, 600, 230) + defs
    + `<path class="logo-faixa" d="M30 64L596 34 578 176 12 206z" fill="url(#${p}-fita)" stroke="${NAVY}" stroke-width="6" stroke-linejoin="round"/>`
    + `<g stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".8"><path d="M28 96h70M18 130h46M30 164h60"/></g>`
    + `<g transform="skewX(-12)">${word(120, 160, 104, 420, 'SPEED TCHÊ', 11)}</g>`
    + `<g fill="#2f7bff" stroke="${NAVY}" stroke-width="5" stroke-linejoin="round"><path d="M548 92l26 26-26 26-12-0 26-26-26-26z"/></g></svg>`;
}

export function logoVariante(v: Variante, size: LogoSize): string {
  if (v === 'cromo') return logoMarkup(size);
  return v === 'placa' ? placa(size) : fita(size);
}
