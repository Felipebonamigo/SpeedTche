// Retratos dos pilotos (onda O, O4; docs/ondas/O/O4.md §4.5): rostos de cartum em SVG procedural, PROVISÓRIOS até a encomenda 2D da trilha A
// (que troca este arquivo inteiro, na mesma assinatura). Determinístico pelo nome: os 20 pilotos da IA (entre eles os 12 rivais de copa)
// saem de seus índices em `AI_DRIVERS`, com módulos diferentes por traço, de modo que dois pilotos quaisquer diferem em pelo menos 3 traços;
// qualquer outro nome (um humano) sai do hash dele. Três expressões: provoca, venceu, perdeu.
//
// Marcação só nossa: o nome entra apenas no hash (nunca no SVG), por isso `innerHTML` de um <template> é seguro aqui (como em icons.ts).
import { AI_DRIVERS } from '../../core/data/drivers';
import { hashString } from '../../core/rng';

export type Face = 'taunt' | 'win' | 'lose';
export const FACES: readonly Face[] = ['taunt', 'win', 'lose'];

const SKIN = ['#f5cfa8', '#e6b184', '#c98f62', '#a86b45', '#7d4a2e', '#f0c4b0'];
const HAIR = ['#2b1b12', '#5a3a22', '#a8742f', '#d9b25f', '#8a8f99', '#c4452f', '#1c1c24', '#6b4a8a', '#3a6f5a'];
/** Capacete e macacão: os pares são pegos do mesmo índice, então o conjunto muda junto. */
const HELMET = ['#ef476f', '#ffd23f', '#3ddc84', '#4fc3f7', '#ff7ab6', '#ff9f43', '#b388ff', '#e8edf5'];
const SUIT = ['#26324a', '#3b2a4a', '#1f4a43', '#4a3a1f', '#4a1f2b', '#2b2f36', '#1f3b5a', '#5a2d1f'];

/** Os traços sorteados de um piloto (dois pilotos da IA diferem em pelo menos 3 deles). */
export interface PortraitFeatures {
  skin: number;
  hair: number;
  style: number;
  helmet: number;
  accessory: number;
  bg: number;
}

export function portraitFeatures(name: string): PortraitFeatures {
  const known = AI_DRIVERS.indexOf(name);
  const n = known >= 0 ? known : hashString(`rosto:${name}`) % 360;
  return { skin: n % 6, hair: n % 9, style: n % 5, helmet: n % 8, accessory: n % 4, bg: n % 12 };
}

const esc = (n: number) => n.toFixed(1).replace(/\.0$/, '');

function hairShape(style: number, c: string): string {
  switch (style) {
    case 0: return `<path d="M15.5 28 Q14 12 32 10.5 Q50 12 48.5 28 Q44 20 32 19 Q20 20 15.5 28Z" fill="${c}"/>`; // curto
    case 1: return `<path d="M15 30 Q12 10 32 9 Q52 10 49 30 L49 42 Q46 38 46 30 Q42 20 32 20 Q22 20 18 30 Q18 38 15 42Z" fill="${c}"/>`; // comprido
    case 2: return `<path d="M27 19 L29 5 L32 15 L35 4 L37 19Z" fill="${c}"/><path d="M16 27 Q17 18 27 18 L37 18 Q47 18 48 27 Q42 21 32 21 Q22 21 16 27Z" fill="${c}"/>`; // crista
    case 3: return `<path d="M17 26 Q18 20 24 19 Q22 25 17 26Z M47 26 Q46 20 40 19 Q42 25 47 26Z" fill="${c}"/>`; // quase careca
    default: return `<g fill="${c}"><circle cx="20" cy="20" r="6"/><circle cx="27" cy="15" r="6"/><circle cx="37" cy="15" r="6"/><circle cx="44" cy="20" r="6"/><circle cx="32" cy="17" r="6"/></g>`; // cacheado
  }
}

function accessory(kind: number, hair: string): string {
  switch (kind) {
    case 1: return '<g fill="none" stroke="#1d1d27" stroke-width="1.4"><circle cx="25.5" cy="31" r="4.6"/><circle cx="38.5" cy="31" r="4.6"/><path d="M30.1 31 H33.9"/></g>'; // óculos
    case 2: return `<path d="M25 38.5 Q32 35 39 38.5 Q35 40.5 32 38.8 Q29 40.5 25 38.5Z" fill="${hair}"/>`; // bigode
    case 3: return `<path d="M17 36 Q18 50 32 51 Q46 50 47 36 Q43 44 32 44 Q21 44 17 36Z" fill="${hair}" opacity=".9"/>`; // barba
    default: return '';
  }
}

/** Sobrancelhas, olhos e boca de cada expressão. */
function expression(face: Face, brow: string): string {
  const eye = '<circle cx="25.5" cy="31" r="2.1" fill="#1d1d27"/><circle cx="38.5" cy="31" r="2.1" fill="#1d1d27"/>';
  const browLine = (d: string) => `<path d="${d}" stroke="${brow}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`;
  switch (face) {
    case 'win': // olhos fechados de alegria e boca aberta
      return browLine('M21.5 25 Q25.5 22.5 29.5 25 M34.5 25 Q38.5 22.5 42.5 25')
        + '<path d="M22.5 31.5 Q25.5 27.5 28.5 31.5 M35.5 31.5 Q38.5 27.5 41.5 31.5" stroke="#1d1d27" stroke-width="1.8" stroke-linecap="round" fill="none"/>'
        + '<path d="M23.5 38 Q32 49 40.5 38Z" fill="#3a1414"/><path d="M25.5 38.6 Q32 41 38.5 38.6 L38 40.2 Q32 42.2 26 40.2Z" fill="#fff"/>';
    case 'lose': // sobrancelhas tristes, boca virada para baixo
      return browLine('M21.5 27 L29.5 23.5 M34.5 23.5 L42.5 27') + eye
        + '<path d="M26 43 Q32 37.5 38 43" stroke="#7a2a2a" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M42.5 34 Q44 37 42.5 39" stroke="#6ec6ff" stroke-width="1.6" stroke-linecap="round" fill="none"/>';
    default: // provoca: uma sobrancelha erguida, olhar de lado, sorriso torto
      return browLine('M21.5 26 L29.5 25.5 M34.5 24.5 L42 20.5')
        + '<circle cx="26.5" cy="31" r="2.1" fill="#1d1d27"/><circle cx="39.5" cy="31" r="2.1" fill="#1d1d27"/><path d="M22.5 29.2 H28.8 M35.8 29.2 H42.2" stroke="#00000033" stroke-width="2.6" stroke-linecap="round"/>'
        + '<path d="M26 40.5 Q33 43.5 40.5 37.5" stroke="#7a2a2a" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M40.5 37.5 L42 38.8" stroke="#7a2a2a" stroke-width="1.6" stroke-linecap="round"/>';
  }
}

/** A marcação do retrato (SVG de 64 × 64). Expressão desconhecida cai em `taunt`. */
export function portraitSvg(name: string, face: Face, size = 64): string {
  const f: Face = FACES.includes(face) ? face : 'taunt';
  const t = portraitFeatures(name);
  const skin = SKIN[t.skin];
  const hair = HAIR[t.hair];
  const helmet = HELMET[t.helmet];
  const bg = `hsl(${t.bg * 30} 42% 26%)`;
  const px = esc(size);
  return `<svg class="portrait" viewBox="0 0 64 64" width="${px}" height="${px}" data-face="${f}" aria-hidden="true" focusable="false">`
    + `<circle cx="32" cy="32" r="32" fill="${bg}"/>`
    + `<path d="M6 64 Q8 47 32 46 Q56 47 58 64Z" fill="${SUIT[t.helmet]}"/><rect x="27" y="39" width="10" height="9" rx="3" fill="${skin}" stroke="#00000022"/>`
    + `<circle cx="16" cy="31" r="3.6" fill="${skin}"/><circle cx="48" cy="31" r="3.6" fill="${skin}"/>`
    + `<ellipse cx="32" cy="30" rx="16" ry="18" fill="${skin}"/>`
    + hairShape(t.style, hair)
    + `<path d="M31 32 L29.4 37 L33 37.2" stroke="#00000030" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
    + expression(f, hair)
    + accessory(t.accessory, hair)
    + `<path d="M14.5 28 Q14 7 32 7 Q50 7 49.5 28 Q47 21 44 20 Q32 14 20 20 Q17 21 14.5 28Z" fill="${helmet}"/>`
    + `<path d="M30 7.2 H34 V17 H30Z" fill="#ffffff" opacity=".85"/><path d="M14.5 28 Q15 25 17 23.5 L17 30 Q15.3 30 14.5 28Z M49.5 28 Q49 25 47 23.5 L47 30 Q48.7 30 49.5 28Z" fill="#00000033"/>`
    + `</svg>`;
}

/** O retrato como elemento SVG (marcação constante nossa: o `innerHTML` de um <template> é seguro, como em icons.ts). */
export function portrait(name: string, face: Face, size = 64): SVGSVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = portraitSvg(name, face, size);
  return tpl.content.firstElementChild as SVGSVGElement;
}
