// Ícones em SVG inline — sem fonte de ícone nem imagem externa. A marcação é constante nossa
// (nunca dado do usuário), por isso o innerHTML de um <template> é seguro aqui.
import type { CarBody, CarDef } from '../../core/types';

export type IconName =
  | 'keyboard' | 'gamepad' | 'lock' | 'sun' | 'dusk' | 'moon' | 'check' | 'trophy'
  | 'chevron-left' | 'chevron-right' | 'clock' | 'flag' | 'users' | 'timer' | 'swords';

const PATHS: Readonly<Record<IconName, string>> = {
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2.5"/><path d="M6.5 10h.01M10.5 10h.01M14.5 10h.01M18.5 10h.01M6.5 14h.01M18.5 14h.01M9.5 14h5"/>',
  gamepad: '<path d="M7 7h10a5 5 0 0 1 5 5v3.5a2.5 2.5 0 0 1-4.6 1.4L15.8 15H8.2l-1.6 1.9A2.5 2.5 0 0 1 2 15.5V12a5 5 0 0 1 5-5z"/><path d="M7.5 10.5v3M6 12h3"/><circle cx="16" cy="11" r=".7"/><circle cx="18.5" cy="13" r=".7"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  dusk: '<path d="M3 16h18M6 20h12"/><path d="M7 16a5 5 0 0 1 10 0"/><path d="M12 5.5v2.5M5.5 9.5l1.8 1.2M18.5 9.5l-1.8 1.2"/>',
  moon: '<path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v3M8 20h8M9.5 17h5"/>',
  'chevron-left': '<path d="M15 5l-7 7 7 7"/>',
  'chevron-right': '<path d="M9 5l7 7-7 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5A5 5 0 0 1 21.5 20"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 2.5h6M12 2.5v2.5"/>',
  // Duelo (rival da copa): duas espadas cruzadas.
  swords: '<path d="M4 4l10.5 10.5M4 4h3.5M4 4v3.5M20 4L9.5 14.5M20 4h-3.5M20 4v3.5"/><path d="M12.5 16.5l4 4M11.5 16.5l-4 4M16.5 12.5l2 2-4 4-2-2M7.5 12.5l-2 2 4 4 2-2"/>',
};

function fromMarkup(markup: string): SVGSVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup;
  return tpl.content.firstElementChild as SVGSVGElement;
}

export function icon(name: IconName, cls = ''): SVGSVGElement {
  return fromMarkup(`<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`);
}

const MEDAL_COLORS = ['#ffc53d', '#cfd6e0', '#d08b5b'];

/** Medalha para 1º, 2º e 3º; nulo para o resto. */
export function medal(position: number): SVGSVGElement | null {
  const color = MEDAL_COLORS[position - 1];
  if (!color) return null;
  return fromMarkup(`<svg class="ico medal" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 2.5l2.2 5.5M15.5 2.5l-2.2 5.5" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="14.5" r="7.5" fill="${color}"/><text x="12" y="18" text-anchor="middle" font-size="9.5" font-weight="800" font-family="Inter, Segoe UI, Roboto, Arial, sans-serif" fill="#1a1c22">${position}</text></svg>`);
}

// ───────────────────────────── Silhuetas de carro ─────────────────────────────
// Vista lateral, frente à direita, uma por estilo de carroceria (CarDef.body): o que distingue cada
// estilo no desenho 3D (src/render) tem de aparecer também aqui, senão a ficha do lobby mostra o mesmo
// carro para todos. Faces planas e linhas retas, como o low-poly do jogo. Coordenadas no viewBox 200×72:
// chão em y≈66, rodas com centro em y≈55.

const GLASS = '#10141f';
const TIRE = '#12161f';
const RIM = '#9aa3b2';
const DARK = '#0b0d14';
const CHROME = '#dfe5ec';
const HEAD = '#ffe9a8';
const TAIL = '#ff5a36';
/** Marcador, nos detalhes, da cor de destaque do carro (o capacete do roadster). */
const ACCENT_SLOT = '@accent@';

/** Contagem para ids únicos do gradiente (vários desenhos na mesma página, cada um com o seu). */
let shineSeq = 0;

type WheelKind = 'std' | 'aero' | 'white' | 'race' | 'offroad';

/** Pneu, aro e cubo. O arco (vão da roda) vem antes, na cor escura, e dá a leitura de para-lama. */
function wheel(cx: number, cy: number, r: number, kind: WheelKind = 'std'): string {
  const arch = `<circle cx="${cx}" cy="${cy}" r="${r + 1.8}" fill="${DARK}"/>`;
  const tire = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${TIRE}"/>`;
  if (kind === 'aero') return `${arch}${tire}<circle cx="${cx}" cy="${cy}" r="${r * 0.72}" fill="#c9d1dc"/><circle cx="${cx}" cy="${cy}" r="${r * 0.2}" fill="${TIRE}"/>`;
  if (kind === 'white') return `${arch}${tire}<circle cx="${cx}" cy="${cy}" r="${r * 0.74}" fill="#f4f1ea"/><circle cx="${cx}" cy="${cy}" r="${r * 0.52}" fill="${TIRE}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.4}" fill="${CHROME}"/>`;
  if (kind === 'race') return `${arch}${tire}<circle cx="${cx}" cy="${cy}" r="${r * 0.6}" fill="#3a4150"/><circle cx="${cx}" cy="${cy}" r="${r * 0.22}" fill="${RIM}"/>`;
  if (kind === 'offroad') {
    // Pneu de cravos: dentes em volta do pneu.
    const teeth = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      const x = cx + Math.cos(a) * r; const y = cy + Math.sin(a) * r;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.6" fill="${TIRE}"/>`;
    }).join('');
    return `${arch}${teeth}${tire}<circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="${RIM}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.2}" fill="${TIRE}"/>`;
  }
  return `${arch}${tire}<circle cx="${cx}" cy="${cy}" r="${r * 0.52}" fill="${RIM}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.2}" fill="${TIRE}"/>`;
}

interface Shape {
  /** Contorno da carroceria (cor do carro). */
  body: string;
  /** Vidros (e o que mais for escuro por cima da carroceria). */
  glass: string;
  /** Detalhes na cor de destaque (faixa, aerofólio, teto). */
  accent: string;
  /** Detalhes fixos desenhados por cima (cromados, entradas de ar, luzes extras). */
  extra?: string;
  wheels: string;
  /** Farol (frente, à direita) e lanterna (traseira, à esquerda), como retângulos [x, y, w, h]. */
  head: [number, number, number, number];
  tail: [number, number, number, number];
  /** Sombra no chão: centro e meia largura. */
  shadow: [number, number];
}

/**
 * Silhuetas próprias de carros de arte (por id do carro, antes do estilo): geradas do MESMO casco do `.glb` por `tools/blender/silhueta.py`
 * (perfil do teto, vidros, rodas e portas saem do spec do carro; não são desenhadas à mão).
 */
const CAR_SHAPES: Readonly<Record<string, () => Shape>> = {
  cuiabano: () => ({
    body: 'M174.9 41.8 L169.6 36.0 L164.2 35.1 L158.8 34.4 L153.5 34.2 L148.2 34.1 L142.8 34.1 L137.4 34.0 L132.1 33.9 L126.8 33.8 L121.4 32.9 L116.1 26.8 L110.7 18.5 L105.4 12.1 L100.0 11.0 L94.7 11.0 L89.3 11.0 L84.0 11.0 L78.6 11.0 L73.3 11.0 L67.9 11.0 L62.6 11.0 L57.2 11.0 L51.9 11.0 L46.5 11.0 L41.2 11.1 L35.8 17.3 L30.5 27.2 L25.1 33.0 L25.1 53.4 L30.5 58.4 L35.8 59.0 L41.2 59.3 L46.5 59.3 L51.9 59.3 L57.2 59.3 L62.6 59.3 L67.9 59.3 L73.3 59.3 L78.6 59.3 L84.0 59.3 L89.3 59.3 L94.7 59.3 L100.0 59.3 L105.4 59.3 L110.7 59.3 L116.1 59.3 L121.4 59.3 L126.8 59.3 L132.1 59.3 L137.4 59.3 L142.8 59.3 L148.2 59.3 L153.5 59.3 L158.8 59.1 L164.2 59.0 L169.6 58.1 L174.9 52.6 Z',
    glass: 'M123.8 35.5 L114.1 25.6 L104.4 13.3 L94.7 12.8 L85.0 12.8 L75.3 12.8 L65.6 12.8 L55.9 12.8 L46.2 12.8 L36.5 17.8 L26.9 33.8 L26.9 31.7 L36.5 30.7 L46.2 30.6 L55.9 30.6 L65.6 30.7 L75.3 30.7 L85.0 30.8 L94.7 30.9 L104.4 31.0 L114.1 31.6 L123.8 32.4 Z',
    accent: 'M167.9 51.8 L150.9 50.6 L133.9 50.2 L117.0 49.6 L100.0 49.2 L83.0 49.1 L66.1 49.0 L49.1 49.0 L32.1 49.1 L32.1 51.6 L49.1 51.4 L66.1 51.5 L83.0 51.5 L100.0 51.6 L117.0 52.1 L133.9 52.6 L150.9 53.1 L167.9 54.2 Z',
    extra: `<path d="M127.0 34.4 L127.0 55.8 M83.5 34.4 L83.5 55.8 M62.5 34.4 L62.5 55.8" stroke="#000" stroke-opacity=".35" stroke-width="1"/>`,
    wheels: wheel(147, 55, 12) + wheel(51, 55, 12),
    head: [169, 41.1, 6, 3.5], tail: [24, 32.7, 4, 8], shadow: [100, 82],
  }),
  tupiniquim: () => ({
    body: 'M174.6 43.5 L169.2 38.2 L163.9 37.4 L158.6 36.8 L153.2 36.3 L147.9 35.9 L142.6 35.6 L137.3 35.3 L132.0 34.9 L126.6 34.2 L121.3 29.8 L116.0 22.5 L110.7 15.3 L105.3 11.2 L100.0 10.5 L94.7 10.1 L89.4 9.8 L84.0 9.6 L78.7 9.6 L73.4 9.7 L68.1 9.8 L62.7 9.9 L57.4 10.2 L52.1 10.5 L46.8 10.8 L41.4 11.9 L36.1 18.4 L30.8 26.8 L25.5 32.0 L25.5 53.7 L30.8 58.3 L36.1 59.0 L41.4 59.3 L46.8 59.3 L52.1 59.3 L57.4 59.3 L62.7 59.3 L68.1 59.3 L73.4 59.3 L78.7 59.3 L84.0 59.3 L89.4 59.3 L94.7 59.3 L100.0 59.3 L105.3 59.3 L110.7 59.3 L116.0 59.3 L121.3 59.3 L126.6 59.3 L132.0 59.3 L137.3 59.3 L142.6 59.3 L147.9 59.3 L153.2 59.3 L158.6 59.2 L163.9 59.0 L169.2 58.1 L174.6 53.4 Z',
    glass: 'M127.7 36.2 L117.6 26.6 L107.6 14.1 L97.6 12.1 L87.6 11.5 L77.6 11.4 L67.6 11.5 L57.6 11.9 L47.6 12.5 L37.6 18.0 L27.5 32.4 L27.5 29.9 L37.6 29.3 L47.6 29.7 L57.6 30.1 L67.6 30.7 L77.6 31.2 L87.6 31.7 L97.6 32.3 L107.6 32.9 L117.6 33.7 L127.7 34.4 Z',
    accent: 'M167.6 52.7 L150.7 51.8 L133.8 51.2 L116.9 50.6 L100.0 49.9 L83.1 49.4 L66.2 49.0 L49.3 48.5 L32.5 48.3 L32.5 50.7 L49.3 51.0 L66.2 51.4 L83.1 51.9 L100.0 52.4 L116.9 53.0 L133.8 53.6 L150.7 54.2 L167.6 55.2 Z',
    extra: `<path d="M124.8 34.4 L124.8 55.8 M82.8 34.4 L82.8 55.8 M61.8 34.4 L61.8 55.8" stroke="#000" stroke-opacity=".35" stroke-width="1"/>`,
    wheels: wheel(147, 55, 12) + wheel(52, 55, 12),
    head: [169, 41.1, 6, 3.5], tail: [24, 32.7, 4, 8], shadow: [100, 82],
  }),
  caipora: () => ({
    body: 'M174.9 42.5 L169.6 36.5 L164.2 35.5 L158.8 34.9 L153.5 34.5 L148.2 34.2 L142.8 34.1 L137.4 33.9 L132.1 33.8 L126.8 33.5 L121.4 31.3 L116.1 24.9 L110.7 17.6 L105.4 12.6 L100.0 11.4 L94.7 10.7 L89.3 10.4 L84.0 10.3 L78.6 10.3 L73.3 10.3 L67.9 10.3 L62.6 10.3 L57.2 10.5 L51.9 11.3 L46.5 13.0 L41.2 17.2 L35.8 22.9 L30.5 30.0 L25.1 32.7 L25.1 53.4 L30.5 58.2 L35.8 58.9 L41.2 59.2 L46.5 59.3 L51.9 59.3 L57.2 59.3 L62.6 59.3 L67.9 59.3 L73.3 59.3 L78.6 59.3 L84.0 59.3 L89.3 59.3 L94.7 59.3 L100.0 59.3 L105.4 59.3 L110.7 59.3 L116.1 59.3 L121.4 59.3 L126.8 59.3 L132.1 59.3 L137.4 59.3 L142.8 59.3 L148.2 59.3 L153.5 59.3 L158.8 59.1 L164.2 58.9 L169.6 58.0 L174.9 53.0 Z',
    glass: 'M125.5 35.2 L116.0 26.5 L106.4 14.9 L96.8 12.7 L87.2 12.1 L77.6 12.0 L68.0 12.0 L58.4 12.2 L48.8 13.6 L39.2 20.7 L29.6 32.4 L29.6 30.9 L39.2 30.7 L48.8 30.6 L58.4 30.6 L68.0 30.7 L77.6 30.8 L87.2 31.0 L96.8 31.2 L106.4 31.4 L116.0 32.0 L125.5 32.7 Z',
    accent: 'M167.9 51.8 L150.9 50.7 L133.9 50.3 L117.0 49.8 L100.0 49.3 L83.0 49.1 L66.1 49.0 L49.1 49.0 L32.1 49.1 L32.1 51.6 L49.1 51.4 L66.1 51.5 L83.0 51.6 L100.0 51.8 L117.0 52.2 L133.9 52.7 L150.9 53.2 L167.9 54.3 Z',
    extra: `<path d="M125.5 34.4 L125.5 55.8 M82.8 34.4 L82.8 55.8 M63.2 34.4 L63.2 55.8" stroke="#000" stroke-opacity=".35" stroke-width="1"/>`,
    wheels: wheel(147, 55, 12) + wheel(52, 55, 12),
    head: [169, 41.1, 6, 3.5], tail: [24, 32.7, 4, 8], shadow: [100, 82],
  }),
  pampeiro: () => ({
    body: 'M174.9 43.9 L169.6 38.2 L164.2 37.4 L158.8 36.8 L153.5 36.3 L148.2 35.9 L142.8 35.6 L137.4 35.3 L132.1 34.9 L126.8 34.2 L121.4 29.9 L116.1 22.7 L110.7 15.8 L105.4 12.4 L100.0 12.0 L94.7 11.8 L89.3 11.7 L84.0 11.7 L78.6 11.8 L73.3 12.0 L67.9 12.3 L62.6 12.6 L57.2 12.9 L51.9 13.4 L46.5 13.9 L41.2 17.8 L35.8 24.4 L30.5 30.5 L25.1 33.0 L25.1 53.7 L30.5 58.7 L35.8 59.3 L41.2 59.6 L46.5 59.6 L51.9 59.6 L57.2 59.6 L62.6 59.6 L67.9 59.6 L73.3 59.6 L78.6 59.6 L84.0 59.6 L89.3 59.6 L94.7 59.6 L100.0 59.6 L105.4 59.6 L110.7 59.6 L116.1 59.6 L121.4 59.6 L126.8 59.6 L132.1 59.6 L137.4 59.6 L142.8 59.6 L148.2 59.6 L153.5 59.6 L158.8 59.5 L164.2 59.3 L169.6 58.4 L174.9 53.4 Z',
    glass: 'M127.7 36.2 L117.7 26.8 L107.8 15.1 L97.8 13.7 L87.9 13.5 L78.0 13.6 L68.0 14.0 L58.1 14.6 L48.1 15.5 L38.2 23.1 L28.2 33.8 L28.2 31.5 L38.2 31.0 L48.1 31.0 L58.1 31.0 L68.0 31.1 L78.0 31.2 L87.9 31.3 L97.8 31.5 L107.8 31.7 L117.7 32.3 L127.7 33.0 Z',
    accent: 'M167.9 52.4 L150.9 51.3 L133.9 50.5 L117.0 49.8 L100.0 49.5 L83.0 49.3 L66.1 49.2 L49.1 49.2 L32.1 49.3 L32.1 51.8 L49.1 51.6 L66.1 51.7 L83.0 51.8 L100.0 51.9 L117.0 52.3 L133.9 53.0 L150.9 53.7 L167.9 54.8 Z',
    extra: `<path d="M127.7 34.4 L127.7 55.8 M81.5 34.4 L81.5 55.8 M61.8 34.4 L61.8 55.8" stroke="#000" stroke-opacity=".35" stroke-width="1"/>`,
    wheels: wheel(147, 55, 12) + wheel(51, 55, 12),
    head: [169, 41.1, 6, 3.5], tail: [24, 32.7, 4, 8], shadow: [100, 82],
  }),
  barao: () => ({
    body: 'M179.3 41.1 L173.6 35.4 L167.9 34.5 L162.3 33.8 L156.6 33.4 L151.0 33.1 L145.3 32.9 L139.6 32.7 L134.0 32.4 L128.3 28.7 L122.7 21.0 L117.0 13.9 L111.3 11.6 L105.7 11.4 L100.0 11.2 L94.3 11.0 L88.7 11.0 L83.0 11.1 L77.4 11.2 L71.7 11.5 L66.0 11.9 L60.4 13.6 L54.7 19.2 L49.0 24.5 L43.4 29.6 L37.7 30.2 L32.1 29.9 L26.4 30.4 L20.7 32.0 L20.7 53.0 L26.4 58.1 L32.1 58.7 L37.7 59.0 L43.4 59.0 L49.0 59.0 L54.7 59.0 L60.4 59.0 L66.0 59.0 L71.7 59.0 L77.4 59.0 L83.0 59.0 L88.7 59.0 L94.3 59.0 L100.0 59.0 L105.7 59.0 L111.3 59.0 L117.0 59.0 L122.7 59.0 L128.3 59.0 L134.0 59.0 L139.6 59.0 L145.3 59.0 L151.0 59.0 L156.6 58.9 L162.3 58.8 L167.9 58.6 L173.6 57.7 L179.3 52.3 Z',
    glass: 'M133.8 34.1 L124.5 25.4 L115.2 14.3 L106.0 13.1 L96.7 12.8 L87.4 12.8 L78.1 12.9 L68.8 13.4 L59.6 16.0 L50.3 25.0 L41.0 32.0 L41.0 29.7 L50.3 29.9 L59.6 30.0 L68.8 30.0 L78.1 30.0 L87.4 30.1 L96.7 30.1 L106.0 30.2 L115.2 30.3 L124.5 30.6 L133.8 30.9 Z',
    accent: 'M172.3 51.1 L154.2 49.8 L136.1 49.2 L118.1 48.9 L100.0 48.7 L81.9 48.7 L63.9 48.7 L45.8 48.6 L27.7 48.5 L27.7 51.0 L45.8 51.0 L63.9 51.1 L81.9 51.2 L100.0 51.2 L118.1 51.3 L136.1 51.7 L154.2 52.2 L172.3 53.5 Z',
    extra: `<path d="M132.0 34.4 L132.0 55.8 M84.8 34.4 L84.8 55.8 M62.0 34.4 L62.0 55.8" stroke="#000" stroke-opacity=".35" stroke-width="1"/>`,
    wheels: wheel(148, 55, 12) + wheel(54, 55, 12),
    head: [173, 41.1, 6, 3.5], tail: [20, 32.7, 4, 8], shadow: [100, 82],
  }),
  furgao: () => ({
    body: 'M163.0 41.1 L158.5 35.6 L154.0 34.9 L149.5 34.4 L145.0 34.1 L140.5 33.8 L136.0 33.5 L131.5 33.2 L127.0 33.1 L122.5 32.8 L118.0 30.1 L113.5 22.9 L109.0 14.9 L104.5 9.9 L100.0 9.1 L95.5 8.6 L91.0 8.3 L86.5 8.2 L82.0 8.2 L77.5 8.2 L73.0 8.3 L68.5 8.4 L64.0 8.5 L59.5 8.6 L55.0 8.7 L50.5 8.9 L46.0 18.9 L41.5 31.1 L37.0 32.0 L37.0 53.4 L41.5 57.4 L46.0 58.3 L50.5 58.7 L55.0 58.9 L59.5 59.0 L64.0 59.0 L68.5 59.0 L73.0 59.0 L77.5 59.0 L82.0 59.0 L86.5 59.0 L91.0 59.0 L95.5 59.0 L100.0 59.0 L104.5 59.0 L109.0 59.0 L113.5 59.0 L118.0 59.0 L122.5 59.0 L127.0 59.0 L131.5 59.0 L136.0 58.9 L140.5 58.9 L145.0 58.8 L149.5 58.6 L154.0 58.3 L158.5 57.4 L163.0 52.6 Z',
    glass: 'M121.7 34.5 L113.7 24.9 L105.6 12.4 L97.5 10.6 L89.5 10.0 L81.5 10.0 L73.4 10.0 L65.3 10.2 L57.3 10.4 L49.3 11.5 L41.2 33.1 L41.2 31.7 L49.3 31.1 L57.3 31.0 L65.3 31.0 L73.4 31.0 L81.5 31.1 L89.5 31.1 L97.5 31.2 L105.6 31.3 L113.7 31.6 L121.7 32.0 Z',
    accent: 'M156.0 51.3 L142.0 50.6 L128.0 49.9 L114.0 49.5 L100.0 49.3 L86.0 49.2 L72.0 49.2 L58.0 49.2 L44.0 49.4 L44.0 51.9 L58.0 51.6 L72.0 51.6 L86.0 51.7 L100.0 51.8 L114.0 52.0 L128.0 52.4 L142.0 53.0 L156.0 53.8 Z',
    extra: `<path d="M121.0 34.4 L121.0 55.8 M85.3 34.4 L85.3 55.8" stroke="#000" stroke-opacity=".35" stroke-width="1"/>`,
    wheels: wheel(138, 55, 12) + wheel(62, 55, 12),
    head: [157, 41.1, 6, 3.5], tail: [36, 32.7, 4, 8], shadow: [100, 82],
  }),
};

/** Os 13 estilos. A leitura de cada um (docs/CARROS.md): o que o diferencia de perfil. */
const SHAPES: Readonly<Record<CarBody, () => Shape>> = {
  // GT (V2, estilo HCT): motor central em cunha — bico baixo, para-lamas que sobem sobre as rodas, cabine avançada, tampa do motor longa,
  // entrada de ar no flanco, asa com suporte; a faixa lateral segue o vinco, que sobe para trás (o perfil do modelo 3D, docs/ondas/V2-gt.md).
  gt: () => ({
    body: 'M10 46 L10 33 L24 31.5 L34 29 L45 26.5 L56 25 L66 22 L104 21.3 L134 31.5 L147 30 L158 29.6 L169 32 L180 38 L190 41.5 L191 47 L188 51.5 L12 51.5 Z',
    glass: 'M68 23.2 L103 22.6 L131 31.6 L64 31 Z',
    accent: 'M14 35.5 L188 42.5 L188 45 L14 38 Z',
    extra: `<path d="M68 41 L87 40 L87 48 L68 48.5 Z" fill="${DARK}"/><path d="M8 25 L27 25 L27 27.5 L8 27.5 Z M17 27.5 L19.5 27.5 L19.5 31.5 L17 31.5 Z" fill="${DARK}"/>`,
    wheels: wheel(45, 55, 12) + wheel(156, 55, 12),
    head: [183, 38.5, 6, 3], tail: [8, 35, 4, 5], shadow: [100, 90],
  }),
  // Muscle: caixote de capô comprido e traseira curta (três volumes), tomada de ar no capô, faixas por cima.
  muscle: () => ({
    body: 'M8 52 L8 36 L12 33 L42 33 L62 20 L104 20 L122 32 L186 34 L191 37 L191 50 L188 52 Z',
    glass: 'M60 31 L66 23 L102 23 L114 31 Z',
    accent: 'M12 32 L42 32 L42 34.5 L12 34.5 Z M62 19.5 L104 19.5 L105 22 L63 22 Z M122 31.5 L186 33.5 L186 36 L122 34 Z',
    extra: `<path d="M142 33 L146 28.5 L164 28.5 L166 33.5 Z" fill="${DARK}"/><path d="M84 23 L87 23 L87 31 L84 31 Z" fill="#000" opacity=".45"/>`,
    wheels: wheel(46, 54, 13) + wheel(158, 55, 12),
    head: [186, 38, 5, 5], tail: [8, 37, 5, 6], shadow: [100, 92],
  }),
  // Hatch: dois volumes, curto, teto que vai até a tampa quase vertical, aerofólio de teto.
  hatch: () => ({
    body: 'M24 52 L20 48 L22 24 L30 19 L112 18 L140 31 L174 35 L182 40 L182 50 L178 52 Z',
    glass: 'M28 30 L32 22 L110 21.5 L128 30 Z',
    accent: 'M18 18 L40 17 L42 20 L21 21.5 Z',
    extra: `<path d="M74 22 L77 22 L77 30 L74 30 Z M44 22 L47 22 L46 30 L43 30 Z" fill="${DARK}" opacity=".55"/>`,
    wheels: wheel(50, 55, 12) + wheel(152, 55, 12),
    head: [176, 37, 6, 4], tail: [20, 30, 4, 8], shadow: [101, 82],
  }),
  // Sedã: três volumes, quatro portas (duas janelas e as linhas das portas), porta-malas saliente.
  sedan: () => ({
    body: 'M10 52 L10 40 L13 34 L40 33 L58 21 L112 21 L136 33 L182 36 L188 40 L188 51 L185 52 Z',
    glass: 'M58 32 L64 24 L88 24 L88 32 Z M92 32 L92 24 L110 24 L124 32 Z',
    accent: 'M14 38.5 L186 39.5 L186 41 L14 40 Z',
    extra: `<path d="M90 34 L90 50 M126 34 L127 50 M56 34 L57 50" stroke="#000" stroke-opacity=".3" stroke-width="1.2"/>`,
    wheels: wheel(46, 55, 11.5) + wheel(156, 55, 11.5),
    head: [182, 38, 6, 4], tail: [10, 36, 5, 5], shadow: [100, 90],
  }),
  // Elétrico: uma gota lisa só de curvas, sem grade, faixa de luz na frente e atrás, rodas carenadas.
  electric: () => ({
    body: 'M12 52 L10 43 Q12 33 40 28 Q80 15 118 18 Q152 21 174 33 Q190 37 191 45 L188 52 Z',
    glass: 'M46 29.5 Q82 18.5 116 21 Q136 23 148 30.5 Z',
    accent: 'M16 50 L186 50 L185 52 L17 52 Z',
    extra: '',
    wheels: wheel(46, 55, 11.5, 'aero') + wheel(154, 55, 11.5, 'aero'),
    head: [176, 36.5, 14, 2], tail: [10, 39, 10, 2.2], shadow: [100, 90],
  }),
  // Rali: hatch alto (mais vão livre), aerofólio grande, tomada no teto, para-barros, número na porta, faróis de milha.
  rally: () => ({
    body: 'M22 49 L18 46 L20 24 L28 19 L66 18 L72 14 L86 14 L90 18 L110 18 L138 31 L174 34 L182 39 L182 47 L178 49 Z',
    glass: 'M26 30 L30 22 L108 21.5 L126 30 Z',
    accent: 'M8 13 L40 12 L40 16 L10 17 Z M28 16 L31 16 L30 21 L27 21 Z',
    extra: `<circle cx="94" cy="39" r="6.5" fill="#f4f1ea"/><path d="M92 36 L95 35 L95 43" stroke="${TIRE}" stroke-width="1.6" fill="none"/>` +
      `<path d="M34 48 L38 48 L38 60 L34 60 Z M136 48 L140 48 L140 60 L136 60 Z" fill="${DARK}"/>` +
      `<circle cx="178" cy="43.5" r="2.6" fill="${HEAD}"/><circle cx="172" cy="43.5" r="2.6" fill="${HEAD}"/>`,
    wheels: wheel(50, 55, 12, 'offroad') + wheel(152, 55, 12, 'offroad'),
    head: [176, 36, 6, 3.5], tail: [18, 29, 4, 8], shadow: [100, 84],
  }),
  // Hiper: rente ao chão, comprido, cabine avançada, entrada de ar lateral, asa enorme e difusor.
  hyper: () => ({
    body: 'M8 51 L8 37 L24 33 L58 31 L80 21 L112 20 L148 34 L188 40 L193 46 L189 51 L184 52 L12 52 Z',
    glass: 'M70 30 L82 23.5 L110 23 L132 31 Z',
    accent: 'M4 16 L44 14 L44 19 L6 21 Z M22 20 L26 20 L27 33 L23 33 Z',
    extra: `<path d="M62 35 L88 33 L84 45 L68 45 Z" fill="${DARK}"/><path d="M10 49 L32 49 L30 52 L12 52 Z" fill="${DARK}"/>`,
    wheels: wheel(44, 55, 12.5, 'race') + wheel(160, 55, 12, 'race'),
    head: [182, 39.5, 8, 2.5], tail: [8, 38, 6, 3], shadow: [100, 92],
  }),
  // Clássico (anos 50/60): comprido e arredondado, rabo de peixe, teto em duas cores, saia na roda de trás,
  // para-choques cromados e pneu de faixa branca.
  classic: () => ({
    body: 'M10 50 L10 40 L14 31 L32 34 Q42 33 50 32 Q60 18 78 18 L102 18 Q116 18 126 31 L152 32 Q178 32 186 39 L188 50 Z',
    glass: 'M58 31 Q64 21 78 21 L90 21 L90 31 Z M94 31 L94 21 L102 21 Q112 21 120 31 Z',
    accent: 'M52 31.5 Q62 17 78 17 L102 17 Q116 17 127 31.5 L122 31.5 Q113 20 102 20 L78 20 Q64 20 57 31.5 Z',
    extra: `<path d="M6 43 L16 43 L16 50 L6 50 Z M182 43 L193 43 L193 50 L182 50 Z" fill="${CHROME}"/>` +
      `<path d="M16 41 L182 41" stroke="${CHROME}" stroke-width="1.4"/>`,
    wheels: wheel(46, 56, 11, 'white') + wheel(154, 56, 11, 'white'),
    head: [184, 36, 5, 5], tail: [10, 34, 4, 6], shadow: [100, 92],
  }),
  // Cunha (anos 80): uma linha reta só do bico baixo e pontudo até a traseira alta e reta; venezianas atrás.
  wedge: () => ({
    body: 'M8 51 L8 29 L44 27 L84 20 L106 20 L195 44 L192 51 L186 52 L12 52 Z',
    glass: 'M78 27 L88 22.5 L104 22.5 L132 31 Z',
    accent: 'M10 41 L188 46 L188 48 L10 43.5 Z',
    extra: `<path d="M48 29 L80 23.5 M49 31.5 L81 26 M50 34 L82 28.5" stroke="${DARK}" stroke-width="1.5"/>` +
      `<path d="M6 25 L30 24 L30 27 L6 28 Z" fill="${DARK}"/>`,
    wheels: wheel(46, 55, 12.5) + wheel(160, 55, 11.5),
    head: [184, 40, 8, 2], tail: [8, 32, 5, 4], shadow: [100, 92],
  }),
  // Picape: cabine alta no meio, caçamba aberta atrás com santantônio, vão livre alto e pneu de cravos.
  pickup: () => ({
    body: 'M8 48 L8 27 L70 27 L72 13 L112 13 L130 26 L182 29 L189 33 L189 47 L186 48 Z',
    glass: 'M76 25 L77 16 L108 16 L122 25 Z',
    accent: 'M8 41 L189 41 L189 48 L8 48 Z M58 27 L58 18 L70 18 L70 20.5 L61 20.5 L61 27 Z',
    extra: `<path d="M8 27 L70 27" stroke="${DARK}" stroke-width="2"/><path d="M96 16 L99 16 L99 25 L95 25 Z" fill="${DARK}" opacity=".55"/>`,
    wheels: wheel(40, 53, 13, 'offroad') + wheel(154, 53, 13, 'offroad'),
    head: [182, 31, 7, 5], tail: [8, 29, 4, 8], shadow: [99, 92],
  }),
  // Protótipo (Le Mans): baixíssimo, bolha de cabine no meio, para-lamas saltados, barbatana e asa na cauda longa.
  prototype: () => ({
    body: 'M6 50 L6 36 L30 34 L70 32 Q82 18 102 18 Q118 18 128 30 L190 40 L195 46 L190 51 L10 51 Z ' +
      'M136 38 Q156 26 176 40 Z M26 35 Q46 25 66 33 Z',
    glass: 'M92 29 Q98 21 104 21 Q114 21 120 29 Z',
    accent: 'M40 34 L92 19.5 L96 21 L60 33 Z M2 19 L36 18 L36 23 L4 24 Z M16 23 L20 23 L20 35 L16 35 Z M150 36 L186 41 L186 43.5 L150 38.5 Z',
    extra: `<path d="M8 48 L38 48 L36 51 L10 51 Z" fill="${DARK}"/>`,
    wheels: wheel(46, 55, 12, 'race') + wheel(158, 55, 12, 'race'),
    head: [184, 40.5, 9, 2.2], tail: [6, 38, 4, 3], shadow: [100, 94],
  }),
  // Micro: curtinho (metade do comprimento), uma bolha só, alto, rodinhas pequenas nos cantos.
  micro: () => ({
    body: 'M54 56 L52 38 Q56 16 82 14 L110 14 Q128 16 138 32 L148 38 Q152 43 150 56 Z',
    glass: 'M60 34 Q62 20 82 18 L108 18 Q120 20 128 32 Z',
    accent: 'M58 20 Q66 13 82 12 L110 12 Q124 13 131 21 L128 22 Q118 16 108 16 L82 16 Q68 16 61 22 Z',
    extra: `<path d="M98 18 L101 18 L101 33 L97 33 Z" fill="${DARK}" opacity=".55"/>`,
    wheels: wheel(72, 58, 9) + wheel(132, 58, 9),
    head: [143, 40, 6, 5], tail: [52, 38, 4, 7], shadow: [101, 56],
  }),
  // Roadster: conversível de dois lugares, sem teto: só o quadro do para-brisa, o encosto com santantônio
  // e o capô comprido.
  roadster: () => ({
    body: 'M10 52 L10 39 L18 34 L56 32 Q64 24 74 30 L88 31 L122 31 L178 35 L190 40 L190 50 L187 52 Z',
    glass: 'M112 31 L118 21 L122 21 L127 31 Z M76 31 L88 29 L112 29 L114 31 Z',
    accent: 'M56 31.5 Q64 23 75 29.5 L73 31 Q64 26 58 32 Z M14 38 L186 40 L186 42.5 L14 40.5 Z',
    extra: `<path d="M64 31 Q65 23 70 23 Q75 23 76 31" fill="none" stroke="${DARK}" stroke-width="2.2"/>` +
      `<circle cx="96" cy="24.5" r="5.2" fill="${ACCENT_SLOT}"/><path d="M96.5 22.4 L101.2 22.8 L101 26 L96.5 26 Z" fill="${GLASS}"/>`,
    wheels: wheel(46, 55, 12) + wheel(156, 55, 12),
    head: [182, 38, 7, 4], tail: [10, 36, 5, 5], shadow: [100, 90],
  }),
};

/** Ligeiramente mais escuro que a cor: o destaque de quem não tem `accent`. */
function darker(hex: string, f = 0.62): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#1b1f2a';
  const n = parseInt(m[1], 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * f).toString(16).padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** Marcação SVG da silhueta (pura, testável sem DOM). */
export function carSilhouetteMarkup(car: Pick<CarDef, 'color' | 'body' | 'accent'> & { id?: string }): string {
  const s = ((car.id ? CAR_SHAPES[car.id] : undefined) ?? SHAPES[car.body] ?? SHAPES.gt)();
  const accent = car.accent ?? darker(car.color);
  const id = `carShine${++shineSeq}`;
  const rect = ([x, y, w, hh]: [number, number, number, number], fill: string) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="1" fill="${fill}"/>`;
  const extra = (s.extra ?? '').split(ACCENT_SLOT).join(accent);
  return `<svg class="car-svg" viewBox="0 0 200 72" aria-hidden="true" data-body="${car.body}">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient></defs>
<ellipse cx="${s.shadow[0]}" cy="66" rx="${s.shadow[1]}" ry="4.5" fill="rgba(0,0,0,.45)"/>
<path d="${s.body}" fill="${car.color}"/>
<path d="${s.body}" fill="url(#${id})"/>
<path d="${s.accent}" fill="${accent}"/>
<path d="${s.glass}" fill="${GLASS}" opacity=".9"/>
${extra}
${s.wheels}
${rect(s.head, HEAD)}${rect(s.tail, TAIL)}
</svg>`;
}

/** Silhueta do carro (vista lateral, low-poly), no estilo da carroceria dele e nas cores dele. */
export function carSilhouette(car: Pick<CarDef, 'color' | 'body' | 'accent'>): SVGSVGElement {
  return fromMarkup(carSilhouetteMarkup(car));
}
