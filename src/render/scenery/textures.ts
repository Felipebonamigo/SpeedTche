// Texturas do cenário (canvas → CanvasTexture): fachadas de 4 × 4 janelas por repetição, em atlas de 4 visuais por estilo (cor + mapa
// de luz das janelas acesas à noite; V4) e o atlas de painéis (8 outdoors de marcas inventadas, faixa da
// largada, placa do box, chevrons, xadrez). Criadas uma vez por Scenery e liberadas no dispose.
// Marcas: todas fictícias (a exceção é a PADELIZOU, do próprio dono) — nada de logotipo real.
import * as THREE from 'three';
import { hash2 } from '../noise';
import { canvas2d } from '../textures';
import { FACADE_CELL_SPAN } from './geom';
import { PANEL_ATLAS_SIZE, PANEL_RECTS } from './props';

export interface FacadeTextures { map: THREE.CanvasTexture; light: THREE.CanvasTexture }

function tex(c: HTMLCanvasElement, repeat: boolean, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const S = 256;
const CELL = S / 4;

/**
 * V22/F5: as janelas acesas têm 3 NÍVEIS de luz (antes todas à mesma força, só mudava o tom): fraco (abajur, TV: luma ~0,23), médio (~0,53) e forte (luz de teto: ~0,88).
 * O mapa de luz é sRGB (a emissiva sai ao quadrado no linear): o fraco emite ~5% do forte, e é isso que dá a variedade de uma cidade de verdade (cada apartamento
 * numa hora). Cada janela escolhe o nível pela semente; as bandas medidas por `tests/predios-f5.test.ts` (≥ 8% da área acesa em cada uma).
 */
export const LIT_BANDS = [[0.22, 0.45], [0.45, 0.75], [0.75, 1]] as const;
const LIT_COLORS: ReadonlyArray<readonly string[]> = [['#ff9a5a', '#8fb0ff', '#ffa86a'], ['#ffd79a', '#ffe8c4', '#ffcf8f'], ['#ffe0a8', '#fff0c8', '#cfe4ff']];
const LIT_SCALE = [0.34, 0.62, 1] as const;
function litLevel(seed: number): number {
  // Sequência de razão áurea sobre a semente (as janelas vizinhas têm sementes seguidas): reparte os três níveis por igual até numa célula com poucas janelas acesas, onde o sorteio puro deixava um nível de fora.
  const u = (seed * 0.6180339887 + 0.62 + hash2(seed, 93) * 0.12) % 1;
  return u < 0.3 ? 0 : u < 0.68 ? 1 : 2;
}
function lightColor(seed: number): string {
  const level = litLevel(seed);
  const list = LIT_COLORS[level];
  const hex = list[Math.floor(hash2(seed, 91) * list.length) % list.length];
  const k = LIT_SCALE[level];
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${Math.round(((n >> 16) & 255) * k)},${Math.round(((n >> 8) & 255) * k)},${Math.round((n & 255) * k)})`;
}
/**
 * Uma janela acesa: o nível de luz sorteado e, em baixo, uma faixa mais escura (a luz do teto não chega ao móvel) e, em parte delas, a cortina puxada de um lado:
 * a janela deixa de ser um retângulo chapado.
 */
function litRect(l: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number): void {
  l.fillStyle = lightColor(seed); l.fillRect(x, y, w, h);
  if (h >= 14) { l.fillStyle = 'rgba(0,0,0,0.3)'; l.fillRect(x, y + h * 0.78, w, h * 0.22); }
  if (w >= 12 && hash2(seed, 94) < 0.3) { l.fillStyle = 'rgba(0,0,0,0.45)'; const cw = w * 0.22; l.fillRect(hash2(seed, 95) < 0.5 ? x : x + w - cw, y, cw, h * 0.8); }
}
/** O mapa de luz que o vidro (`glass`) desenha por cima da luz difusa da parede; definido por `facadeTextures`. */
let lightCtx: CanvasRenderingContext2D | null = null;
const SKY_GLOW = '#2a2038';
/** A luz difusa da parede: no entardecer a face à sombra do sol não fica preta, e o topo de cada andar (sob a laje) fica mais escuro (o mesmo beiral do albedo). */
const WALL_LIGHT = '#342c44';
function wallLight(l: CanvasRenderingContext2D, ox: number, oy: number): void {
  for (let r = 0; r < 4; r++) {
    const y = oy + r * CELL;
    const g = l.createLinearGradient(0, y, 0, y + CELL);
    g.addColorStop(0, '#000000'); g.addColorStop(0.3, WALL_LIGHT); g.addColorStop(1, WALL_LIGHT);
    l.fillStyle = g; l.fillRect(ox, y, S, CELL);
  }
}
/** A sombra do beiral: o topo de cada andar (logo abaixo da laje de cima) escurece ~30% e some em 16 px (0,75 m). Roda por último na célula, sobre parede e janela. */
const EAVE_PX = 16;
function eaveShade(m: CanvasRenderingContext2D, ox: number, oy: number): void {
  for (let r = 0; r < 4; r++) {
    const y = oy + r * CELL;
    const g = m.createLinearGradient(0, y, 0, y + EAVE_PX);
    g.addColorStop(0, 'rgba(14,10,30,0.34)'); g.addColorStop(1, 'rgba(14,10,30,0)');
    m.fillStyle = g; m.fillRect(ox, y, S, EAVE_PX);
  }
}

export type FacadeStyle = 'office' | 'apartment' | 'classic' | 'house';

/**
 * V4 (docs/ondas/V4-pistas.md): a fachada é um atlas 2 × 2 de 4 visuais por estilo (janela, varanda, veneziana, ar-condicionado…), e o
 * material amostra a célula com `fract` (runtime.ts, `applyFacadeAtlas`). Contrato da uv: `u = local + célula × FACADE_CELL_SPAN` (local em
 * repetições da fachada, sempre < 64); célula 0 = o desenho de antes da V4 (os marcos, que não deslocam a uv, continuam iguais).
 */
export { FACADE_CELL_SPAN };
/** Quantos visuais por estilo (as células do atlas). */
export const FACADE_LOOKS = 4;

/** Onde a célula `look` fica no canvas do atlas (com o `flipY` da textura, a célula (cx, cy) da uv é o quadrante de baixo para cima). */
function cellOrigin(look: number): [number, number] {
  const cx = look % 2; const cy = Math.floor(look / 2);
  return [cx * S, (1 - cy) * S];
}

/** O desenho de antes da V4 (célula 0), deslocado para (ox, oy). */
function drawClassicCell(m: CanvasRenderingContext2D, l: CanvasRenderingContext2D, style: FacadeStyle, ox: number, oy: number): void {
  const seedBase = { office: 11, apartment: 23, classic: 37, house: 53 }[style];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const x = ox + c * CELL; const y = oy + r * CELL;
    const seed = seedBase * 100 + r * 4 + c;
    const lit = hash2(seed, 7) < (style === 'office' ? 0.55 : 0.5);
    if (style === 'office') {
      if (r === 0 && c === 0) { m.fillStyle = '#c9d0d8'; m.fillRect(ox, oy, S, S); }
      glass(m, x + 3, y + 3, CELL - 6, CELL - 14, '#4a6482', '#26384c');
      m.fillStyle = '#8f9aa8'; m.fillRect(x, y + CELL - 11, CELL, 8);
      m.fillStyle = 'rgba(255,255,255,0.18)'; m.fillRect(x + 6, y + 6, 6, CELL - 22);
      if (lit) {
        const part = hash2(seed, 13) < 0.25 ? 0.45 : 1;
        litRect(l, x + 4, y + 4 + (CELL - 16) * (1 - part), CELL - 8, (CELL - 16) * part, seed);
      }
    } else if (style === 'apartment') {
      if (r === 0 && c === 0) { m.fillStyle = '#f2f0ea'; m.fillRect(ox, oy, S, S); }
      const wx = x + 13; const wy = y + 12; const ww = CELL - 26; const wh = CELL - 26;
      m.fillStyle = '#d8d4cc'; m.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      glass(m, wx, wy, ww, wh, '#3e4c5e', '#222a34');
      if (lit) { litRect(l, wx + 1, wy + 1, ww - 2, wh - 2, seed); }
      // Sacada: guarda-corpo na frente da metade de baixo, em colunas alternadas.
      if ((c + r) % 2 === 0) {
        m.fillStyle = '#6a7078';
        for (let k = 0; k < 7; k++) m.fillRect(x + 6 + k * 8, y + CELL - 26, 2, 20);
        m.fillRect(x + 4, y + CELL - 27, CELL - 8, 3);
        l.fillStyle = '#000000';
        for (let k = 0; k < 7; k++) l.fillRect(x + 6 + k * 8, y + CELL - 26, 2, 20);
      }
      m.fillStyle = '#c8c4bc'; m.fillRect(x, y + CELL - 5, CELL, 5);
    } else if (style === 'classic') {
      if (r === 0 && c === 0) {
        m.fillStyle = '#efe6d4'; m.fillRect(ox, oy, S, S);
        m.fillStyle = 'rgba(120,100,70,0.12)';
        for (let k = 0; k < S; k += 16) m.fillRect(ox, oy + k, S, 1);
      }
      const wx = x + 18; const wy = y + 8; const ww = CELL - 36; const wh = CELL - 18;
      m.fillStyle = '#f8f2e6'; m.fillRect(wx - 4, wy - 6, ww + 8, wh + 8);
      m.fillStyle = '#d8ccb4'; m.fillRect(wx - 6, wy - 9, ww + 12, 4);
      glass(m, wx, wy, ww, wh, '#3a4650', '#1e262c');
      m.fillStyle = '#f8f2e6'; m.fillRect(wx + ww / 2 - 1, wy, 2, wh); m.fillRect(wx, wy + wh * 0.4, ww, 2);
      if (lit) { litRect(l, wx + 1, wy + 1, ww - 2, wh - 2, seed); l.fillStyle = '#000'; l.fillRect(wx + ww / 2 - 1, wy, 2, wh); }
      if (r % 2 === 0) {
        m.fillStyle = '#2a2a2a'; m.fillRect(wx - 6, wy + wh - 10, ww + 12, 2);
        for (let k = 0; k < 6; k++) m.fillRect(wx - 5 + k * ((ww + 10) / 5), wy + wh - 10, 1.5, 10);
      }
    } else {
      if (r === 0 && c === 0) { m.fillStyle = '#f4f0e8'; m.fillRect(ox, oy, S, S); }
      if ((c + r * 3) % 4 === 3) continue; // parede cega aqui e ali
      const wx = x + 20; const wy = y + 16; const ww = CELL - 40; const wh = CELL - 30;
      m.fillStyle = '#ffffff'; m.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      glass(m, wx, wy, ww, wh, '#3e4a5a', '#222a34');
      m.fillStyle = '#ffffff'; m.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      m.fillStyle = '#4a6a8a'; m.fillRect(wx - 11, wy - 2, 8, wh + 4); m.fillRect(wx + ww + 3, wy - 2, 8, wh + 4);
      if (lit) { litRect(l, wx + 1, wy + 1, ww - 2, wh - 2, seed); l.fillStyle = '#000'; l.fillRect(wx + ww / 2 - 1, wy, 2, wh); }
    }
  }
}

/**
 * Vidro com o céu refletido: o degradê escuro do vidro (`top` → `bottom`), uma camada de céu azul-claro que some em 60% da altura (o reflexo do alto, a luz que vem de cima
 * nas janelas de dia) e um clarão diagonal fino (o brilho do sol na quina do vidro). Sem isto a janela era um buraco escuro (V22/F5: o topo ≥ 1,45× mais claro que o pé).
 */
function glass(m: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, top: string, bottom: string): void {
  if (lightCtx) {
    // No mapa de luz o vidro não herda a luz difusa da parede (janela apagada é escura); só um fiapo do céu no alto (o reflexo ao entardecer), que as janelas acesas cobrem.
    const gl = lightCtx.createLinearGradient(0, y, 0, y + h);
    gl.addColorStop(0, SKY_GLOW); gl.addColorStop(0.55, '#000000'); gl.addColorStop(1, '#000000');
    lightCtx.fillStyle = gl; lightCtx.fillRect(x, y, w, h);
  }
  const g = m.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  m.fillStyle = g; m.fillRect(x, y, w, h);
  const sky = m.createLinearGradient(0, y, 0, y + h * 0.6);
  sky.addColorStop(0, 'rgba(176,208,240,0.62)'); sky.addColorStop(1, 'rgba(176,208,240,0)');
  m.fillStyle = sky; m.fillRect(x, y, w, h * 0.6);
  if (w >= 10 && h >= 14) {
    m.fillStyle = 'rgba(255,255,255,0.12)';
    m.beginPath(); m.moveTo(x + w * 0.12, y + h); m.lineTo(x + w * 0.5, y); m.lineTo(x + w * 0.74, y); m.lineTo(x + w * 0.36, y + h); m.fill();
  }
}

/** Os visuais novos (células 1–3) de cada estilo. Cada célula = 4 colunas × 4 andares, como a de antes (a uv em metros não muda). */
function drawNewCell(m: CanvasRenderingContext2D, l: CanvasRenderingContext2D, style: FacadeStyle, look: number, ox: number, oy: number): void {
  const seedBase = { office: 11, apartment: 23, classic: 37, house: 53 }[style] * 1000 + look * 97;
  const lit = (seed: number, p = 0.5): boolean => hash2(seed, 7) < p;
  const wall = (c: string): void => { m.fillStyle = c; m.fillRect(ox, oy, S, S); };
  if (style === 'apartment') {
    if (look === 1) {
      // Fita de vidro (o prédio modernista da orla): janela corrida por andar, peitoril claro e montantes.
      wall('#f0ede6');
      for (let r = 0; r < 4; r++) {
        const y = oy + r * CELL;
        m.fillStyle = '#dcd6cc'; m.fillRect(ox, y + CELL - 20, S, 16);
        glass(m, ox, y + 10, S, CELL - 32, '#4c6272', '#24323e');
        for (let k = 0; k < 16; k++) {
          const x = ox + k * 16;
          m.fillStyle = '#e8e4dc'; m.fillRect(x, y + 10, 2, CELL - 32);
          if (lit(seedBase + r * 16 + k, 0.45)) { litRect(l, x + 2, y + 11, 14, CELL - 34, seedBase + r * 16 + k); }
        }
        m.fillStyle = 'rgba(255,255,255,0.14)'; m.fillRect(ox, y + 12, S, 4);
      }
    } else if (look === 2) {
      // Janelões com venezianas e guarda-corpo de ferro corrido.
      wall('#ece6da');
      const shut = ['#8a5a3a', '#e6e0d4', '#4f7a5a', '#6a8aa8'];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const x = ox + c * CELL; const y = oy + r * CELL; const seed = seedBase + r * 4 + c;
        const wx = x + 12; const wy = y + 6; const ww = CELL - 24; const wh = CELL - 16;
        m.fillStyle = '#d4ccbc'; m.fillRect(wx - 3, wy - 3, ww + 6, wh + 3);
        glass(m, wx, wy, ww, wh, '#3c4a58', '#1e2630');
        // Veneziana: desce de cima até uma altura que varia (louvered: riscos horizontais).
        const down = hash2(seed, 21) < 0.6 ? 0.25 + 0.6 * hash2(seed, 22) : 0;
        if (down > 0) {
          m.fillStyle = shut[(seed + look) % shut.length]; m.fillRect(wx, wy, ww, wh * down);
          m.fillStyle = 'rgba(0,0,0,0.18)';
          for (let k = 3; k < wh * down; k += 4) m.fillRect(wx, wy + k, ww, 1);
        }
        if (lit(seed)) { litRect(l, wx + 1, wy + wh * down + 1, ww - 2, wh * (1 - down) - 2, seed); }
        // Guarda-corpo corrido do andar.
        m.fillStyle = '#3a3e44'; m.fillRect(x, y + CELL - 22, CELL, 3);
        for (let k = 0; k < 8; k++) m.fillRect(x + 3 + k * 8, y + CELL - 22, 2, 16);
        l.fillStyle = '#000000'; for (let k = 0; k < 8; k++) l.fillRect(x + 3 + k * 8, y + CELL - 22, 2, 16);
        m.fillStyle = '#d8d2c6'; m.fillRect(x, y + CELL - 6, CELL, 6);
      }
    } else {
      // Pares de janelas entre pilastras, ar-condicionado debaixo de algumas e cortina em outras.
      wall('#e8e2d6');
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const x = ox + c * CELL; const y = oy + r * CELL; const seed = seedBase + r * 4 + c;
        m.fillStyle = '#d6cebf'; m.fillRect(x, y, 6, CELL);
        for (const [wx, ww] of [[x + 12, 20], [x + 36, 20]] as const) {
          const wy = y + 10; const wh = 30;
          m.fillStyle = '#f6f2ea'; m.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
          glass(m, wx, wy, ww, wh, '#4a5868', '#28323e');
          const curtain = hash2(seed + wx, 31) < 0.35;
          if (curtain) { m.fillStyle = '#d8c8a4'; m.fillRect(wx, wy, ww * 0.45, wh); m.fillRect(wx + ww * 0.6, wy, ww * 0.4, wh); }
          if (lit(seed + wx)) { litRect(l, wx + 1, wy + 1, ww - 2, wh - 2, seed + wx); }
        }
        if (hash2(seed, 41) < 0.5) {
          const ax = x + (hash2(seed, 42) < 0.5 ? 14 : 38);
          m.fillStyle = '#b8bcc0'; m.fillRect(ax, y + 44, 16, 9);
          m.fillStyle = '#7a8086'; for (let k = 0; k < 4; k++) m.fillRect(ax + 2 + k * 4, y + 46, 2, 5);
        }
        m.fillStyle = '#cfc8ba'; m.fillRect(x, y + CELL - 6, CELL, 6);
      }
    }
  } else if (style === 'office') {
    if (look === 1) {
      // Pele de vidro verde-escura, montantes finos de alumínio.
      wall('#b8c2c4');
      for (let r = 0; r < 4; r++) {
        const y = oy + r * CELL;
        glass(m, ox, y + 2, S, CELL - 10, '#5f8a86', '#2a4a4c');
        m.fillStyle = '#9fb0b2'; m.fillRect(ox, y + CELL - 8, S, 6);
        for (let k = 0; k < 8; k++) {
          const x = ox + k * 32;
          m.fillStyle = '#c4ccce'; m.fillRect(x, y, 2, CELL);
          if (lit(seedBase + r * 8 + k, 0.5)) { litRect(l, x + 3, y + 4, 28, CELL - 14, seedBase + r * 8 + k); }
        }
        m.fillStyle = 'rgba(255,255,255,0.12)'; m.fillRect(ox, y + 4, S, 6);
      }
    } else if (look === 2) {
      // Concreto aparente e janela quadrada recuada (com a sombra do recuo).
      wall('#bdb8ae');
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const x = ox + c * CELL; const y = oy + r * CELL; const seed = seedBase + r * 4 + c;
        m.fillStyle = '#8e8a82'; m.fillRect(x + 8, y + 8, CELL - 16, CELL - 20);
        glass(m, x + 12, y + 12, CELL - 20, CELL - 26, '#5a7088', '#2a3848');
        m.fillStyle = 'rgba(0,0,0,0.22)'; m.fillRect(x + 12, y + 12, CELL - 20, 4);
        if (lit(seed, 0.55)) { litRect(l, x + 13, y + 13, CELL - 22, CELL - 28, seed); }
        m.fillStyle = 'rgba(80,70,60,0.10)'; m.fillRect(x, y + CELL - 3, CELL, 3);
      }
    } else {
      // Brises verticais claros sobre vidro bronze.
      wall('#d8d4cc');
      for (let r = 0; r < 4; r++) {
        const y = oy + r * CELL;
        glass(m, ox, y + 3, S, CELL - 12, '#9a8460', '#4a3c28');
        m.fillStyle = '#c8c2b6'; m.fillRect(ox, y + CELL - 9, S, 7);
        for (let k = 0; k < 16; k++) {
          const x = ox + k * 16;
          if (lit(seedBase + r * 16 + k, 0.5)) { litRect(l, x + 7, y + 4, 9, CELL - 14, seedBase + r * 16 + k); }
          m.fillStyle = '#e4e0d6'; m.fillRect(x, y, 6, CELL);
          m.fillStyle = 'rgba(0,0,0,0.12)'; m.fillRect(x + 6, y, 2, CELL);
          l.fillStyle = '#000000'; l.fillRect(x, y, 6, CELL);
        }
      }
    }
  } else if (style === 'classic') {
    wall(look === 3 ? '#e2d4bc' : '#ece2cc');
    m.fillStyle = 'rgba(120,100,70,0.10)';
    for (let k = 0; k < S; k += 16) m.fillRect(ox, oy + k, S, 1);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const x = ox + c * CELL; const y = oy + r * CELL; const seed = seedBase + r * 4 + c;
      const wx = x + 18; const wy = y + 12; const ww = CELL - 36; const wh = CELL - 22;
      if (look === 1) {
        // Janela em arco com pedra de fecho.
        m.fillStyle = '#f8f2e6'; m.beginPath(); m.arc(wx + ww / 2, wy + 2, ww / 2 + 4, Math.PI, 0); m.fill(); m.fillRect(wx - 4, wy + 2, ww + 8, wh);
        { const gg = m.createLinearGradient(0, wy - ww / 2, 0, wy + wh); gg.addColorStop(0, '#8fb0cc'); gg.addColorStop(0.35, '#3c4c5a'); gg.addColorStop(1, '#1e262c'); m.fillStyle = gg; } m.beginPath(); m.arc(wx + ww / 2, wy + 2, ww / 2, Math.PI, 0); m.fill(); m.fillRect(wx, wy + 2, ww, wh - 4);
        l.fillStyle = '#000000'; l.beginPath(); l.arc(wx + ww / 2, wy + 2, ww / 2, Math.PI, 0); l.fill(); l.fillRect(wx, wy + 2, ww, wh - 4);
        m.fillStyle = '#d8ccb4'; m.fillRect(wx + ww / 2 - 3, wy - ww / 2 - 4, 6, 7);
        if (lit(seed)) { l.fillStyle = lightColor(seed); l.beginPath(); l.arc(wx + ww / 2, wy + 2, ww / 2 - 1, Math.PI, 0); l.fill(); l.fillRect(wx + 1, wy + 2, ww - 2, wh - 5); }
      } else if (look === 2) {
        // Venezianas verdes abertas dos dois lados e grade de ferro.
        m.fillStyle = '#f8f2e6'; m.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        glass(m, wx, wy, ww, wh, '#3a4650', '#1e262c');
        m.fillStyle = '#3f6a4a'; m.fillRect(wx - 12, wy - 2, 8, wh + 4); m.fillRect(wx + ww + 4, wy - 2, 8, wh + 4);
        m.fillStyle = 'rgba(0,0,0,0.2)'; for (let k = 2; k < wh; k += 4) { m.fillRect(wx - 12, wy + k, 8, 1); m.fillRect(wx + ww + 4, wy + k, 8, 1); }
        if (lit(seed)) { litRect(l, wx + 1, wy + 1, ww - 2, wh - 2, seed); }
        m.fillStyle = '#26282c'; m.fillRect(wx - 4, wy + wh - 12, ww + 8, 2);
        for (let k = 0; k < 5; k++) m.fillRect(wx - 3 + k * ((ww + 6) / 4), wy + wh - 12, 1.5, 12);
      } else {
        // Pilastras e frontão triangular sobre a janela.
        m.fillStyle = '#d4c6aa'; m.fillRect(x, y, 7, CELL);
        m.fillStyle = '#f4ecdc'; m.fillRect(wx - 3, wy - 2, ww + 6, wh + 4);
        glass(m, wx, wy, ww, wh, '#3a4650', '#1e262c');
        m.fillStyle = '#f4ecdc'; m.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        m.fillStyle = '#cdbd9e'; m.beginPath(); m.moveTo(wx - 6, wy - 3); m.lineTo(wx + ww / 2, wy - 11); m.lineTo(wx + ww + 6, wy - 3); m.fill();
        if (lit(seed)) { litRect(l, wx + 1, wy + 1, ww - 2, wh - 2, seed); l.fillStyle = '#000'; l.fillRect(wx + ww / 2 - 1, wy, 2, wh); }
      }
    }
  } else {
    if (look === 1) {
      // Tijolo aparente (claro: a tinta do prédio dá a cor) e janela de moldura branca.
      wall('#f2ece4');
      m.fillStyle = 'rgba(90,60,40,0.16)';
      for (let y = 0; y < S; y += 6) { m.fillRect(ox, oy + y, S, 1); for (let x = (y / 6) % 2 ? 0 : 7; x < S; x += 14) m.fillRect(ox + x, oy + y, 1, 6); }
    } else wall(look === 2 ? '#f6f0e4' : '#ece8e0');
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const x = ox + c * CELL; const y = oy + r * CELL; const seed = seedBase + r * 4 + c;
      if (look === 3) {
        // Reboco liso com janela de correr larga e baixa.
        const wx = x + 8; const wy = y + 18; const ww = CELL - 16; const wh = 22;
        m.fillStyle = '#9aa0a6'; m.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
        glass(m, wx, wy, ww, wh, '#4c5a68', '#26303a');
        m.fillStyle = '#9aa0a6'; m.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        if (lit(seed)) { litRect(l, wx + 1, wy + 1, ww - 2, wh - 2, seed); }
        continue;
      }
      if ((c + r * 3) % 5 === 4) continue; // parede cega
      const wx = x + 18; const wy = y + 12; const ww = CELL - 36; const wh = CELL - 28;
      m.fillStyle = '#ffffff'; m.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      glass(m, wx, wy, ww, wh, '#4a5868', '#262e38');
      m.fillStyle = '#ffffff'; m.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      if (lit(seed)) { litRect(l, wx + 1, wy + 1, ww - 2, wh - 2, seed); l.fillStyle = '#000'; l.fillRect(wx + ww / 2 - 1, wy, 2, wh); }
      if (look === 2) {
        // Floreira com flores e o toldinho listrado.
        m.fillStyle = '#7a5a40'; m.fillRect(wx - 4, wy + wh + 3, ww + 8, 5);
        for (let k = 0; k < 6; k++) { m.fillStyle = ['#e8402a', '#ff7ab6', '#ffd23f'][(seed + k) % 3]; m.fillRect(wx - 3 + k * ((ww + 4) / 5), wy + wh, 3, 3); }
        for (let k = 0; k < 4; k++) { m.fillStyle = k % 2 ? '#f4f0e8' : '#c8402a'; m.fillRect(wx - 4 + k * ((ww + 8) / 4), wy - 9, (ww + 8) / 4, 5); }
      }
    }
  }
}

export function facadeTextures(style: FacadeStyle): FacadeTextures {
  const [mc, m] = canvas2d(S * 2, S * 2);
  const [lc, l] = canvas2d(S * 2, S * 2);
  l.fillStyle = '#000000'; l.fillRect(0, 0, S * 2, S * 2);
  lightCtx = l;
  for (let look = 0; look < FACADE_LOOKS; look++) {
    const [ox, oy] = cellOrigin(look);
    wallLight(l, ox, oy);
    if (look === 0) drawClassicCell(m, l, style, ox, oy);
    else drawNewCell(m, l, style, look, ox, oy);
    eaveShade(m, ox, oy);
  }
  lightCtx = null;
  return { map: tex(mc, true), light: tex(lc, true) };
}

// ───────────────────────────── Atlas de painéis ─────────────────────────────

interface BillboardDesign { brand: string; tag: string; bg: string; fg: string; accent: string; motif: 'stripes' | 'sun' | 'bubbles' | 'bolt' | 'tire' | 'wave' | 'check' | 'rings' }

/** Os painéis da pista (exportado para o teste do nome antigo: `tests/nome-legado-paineis.test.ts`). */
export const DESIGNS: readonly BillboardDesign[] = [
  { brand: 'NITRO', tag: '', bg: '#e8262c', fg: '#ffffff', accent: '#ffd23f', motif: 'stripes' },
  { brand: 'TCHÊ', tag: 'RACING', bg: '#1b5fc4', fg: '#ffffff', accent: '#9fd4ff', motif: 'check' },
  { brand: 'PADELIZOU', tag: '', bg: '#0f8b5f', fg: '#ffffff', accent: '#b8f06a', motif: 'rings' },
  // Marcas do dono (09/10/2026). Cores provisórias: troca por textura quando chegar o logo (docs/CRONOGRAMA.md, decisão nº 26).
  { brand: 'ATOMATIZA', tag: '', bg: '#0b2a4a', fg: '#ffffff', accent: '#3fe0c5', motif: 'rings' },
  { brand: 'ATOMO', tag: 'GALERIA', bg: '#f4efe6', fg: '#1b1b1b', accent: '#d1495b', motif: 'wave' },
  { brand: 'APEX', tag: '', bg: '#15171b', fg: '#ffd23f', accent: '#ffd23f', motif: 'tire' },
  { brand: 'VOLTZ', tag: '', bg: '#5b2bb5', fg: '#fff34a', accent: '#ff6ad5', motif: 'bolt' },
  { brand: 'SOLARA', tag: '', bg: '#ff8a1f', fg: '#ffffff', accent: '#ffe066', motif: 'sun' },
  { brand: 'FIZZ!', tag: '', bg: '#2fc27a', fg: '#ffffff', accent: '#d9ffe6', motif: 'bubbles' },
  { brand: '66 FM', tag: '', bg: '#101a3a', fg: '#ff5fb0', accent: '#46e0ff', motif: 'wave' },
];

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = '900'): number {
  let s = size;
  for (;;) {
    ctx.font = `${weight} ${s}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxW || s < 12) return s;
    s -= 4;
  }
}

function drawBillboard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, d: BillboardDesign): void {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = d.bg; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = d.accent;
  switch (d.motif) {
    case 'stripes':
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(x + w * 0.62 + k * 34, y + h); ctx.lineTo(x + w * 0.72 + k * 34, y); ctx.lineTo(x + w * 0.72 + k * 34 + 16, y); ctx.lineTo(x + w * 0.62 + k * 34 + 16, y + h); ctx.fill(); }
      break;
    case 'check':
      for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) if ((r + c) % 2 === 0) ctx.fillRect(x + w - 4 * 32 + c * 32, y + r * 32, 32, 32);
      break;
    case 'rings':
      ctx.lineWidth = 10; ctx.strokeStyle = d.accent;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x + w * 0.86, y + h * 0.5, 30 + k * 26, 0, Math.PI * 2); ctx.stroke(); }
      break;
    case 'tire':
      ctx.beginPath(); ctx.arc(x + w * 0.84, y + h * 0.5, 70, 0, Math.PI * 2); ctx.fillStyle = '#2a2d33'; ctx.fill();
      ctx.lineWidth = 14; ctx.strokeStyle = d.accent; ctx.beginPath(); ctx.arc(x + w * 0.84, y + h * 0.5, 44, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = d.accent; ctx.fillRect(x, y + h - 16, w, 16);
      break;
    case 'bolt':
      ctx.beginPath(); ctx.moveTo(x + w * 0.86, y + 10); ctx.lineTo(x + w * 0.76, y + h * 0.55); ctx.lineTo(x + w * 0.84, y + h * 0.55); ctx.lineTo(x + w * 0.78, y + h - 10); ctx.lineTo(x + w * 0.94, y + h * 0.42); ctx.lineTo(x + w * 0.86, y + h * 0.42); ctx.lineTo(x + w * 0.93, y + 10); ctx.fill();
      break;
    case 'sun':
      ctx.beginPath(); ctx.arc(x + w * 0.85, y + h * 0.95, 80, 0, Math.PI * 2); ctx.fill();
      for (let k = 0; k < 9; k++) { const a = Math.PI + (k / 8) * Math.PI; ctx.fillRect(x + w * 0.85 + Math.cos(a) * 100, y + h * 0.95 + Math.sin(a) * 100, 10, 10); }
      break;
    case 'bubbles':
      for (let k = 0; k < 9; k++) { ctx.beginPath(); ctx.arc(x + w * (0.7 + hash2(k, 1) * 0.28), y + h * hash2(k, 2), 8 + hash2(k, 3) * 18, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 'wave':
      ctx.lineWidth = 8; ctx.strokeStyle = d.accent; ctx.beginPath();
      for (let k = 0; k <= 40; k++) { const px = x + w * 0.62 + k * 4.6; const py = y + h * 0.5 + Math.sin(k * 0.7) * 40 * Math.sin(k * 0.08); if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.stroke();
      break;
  }
  ctx.fillStyle = d.fg;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const maxW = w * (d.motif === 'check' || d.motif === 'rings' || d.motif === 'tire' ? 0.64 : 0.6);
  const size = fitText(ctx, d.brand, maxW, 118);
  ctx.fillText(d.brand, x + 26, y + h * (d.tag ? 0.42 : 0.52));
  if (d.tag) { fitText(ctx, d.tag, maxW, 44, '700'); ctx.fillStyle = d.accent; ctx.fillText(d.tag, x + 30, y + h * 0.42 + size * 0.62); }
  // Borda escura: o painel descola da moldura mesmo contra o céu.
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 8; ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
  ctx.restore();
}

function drawChevrons(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dir: -1 | 1): void {
  ctx.fillStyle = '#ffd21f'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#141414';
  for (let k = 0; k < 3; k++) {
    const cx = x + w * (0.22 + k * 0.28);
    const tip = cx + dir * 22; const back = cx - dir * 22;
    ctx.beginPath();
    ctx.moveTo(back, y + 8); ctx.lineTo(back + dir * 20, y + 8); ctx.lineTo(tip + dir * 20, y + h / 2); ctx.lineTo(back + dir * 20, y + h - 8); ctx.lineTo(back, y + h - 8); ctx.lineTo(tip, y + h / 2);
    ctx.fill();
  }
}

export function panelAtlas(): THREE.CanvasTexture {
  const [c, ctx] = canvas2d(PANEL_ATLAS_SIZE, PANEL_ATLAS_SIZE);
  ctx.fillStyle = '#202020'; ctx.fillRect(0, 0, PANEL_ATLAS_SIZE, PANEL_ATLAS_SIZE);
  PANEL_RECTS.billboard.forEach(([x, y, w, h], i) => drawBillboard(ctx, x, y, w, h, DESIGNS[i]));
  {
    const [x, y, w, h] = PANEL_RECTS.banner;
    ctx.fillStyle = '#111111'; ctx.fillRect(x, y, w, h);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
      ctx.fillStyle = (r + k) % 2 ? '#ffffff' : '#111111';
      ctx.fillRect(x + k * 32, y + r * 32, 32, 32); ctx.fillRect(x + w - 128 + k * 32, y + r * 32, 32, 32);
    }
    ctx.fillStyle = '#ffd23f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitText(ctx, 'SPEED TCHÊ', w - 300, 96);
    ctx.fillText('SPEED TCHÊ', x + w / 2, y + h / 2 + 4);
    ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x + 128, y, w - 256, 8); ctx.fillRect(x + 128, y + h - 8, w - 256, 8);
  }
  {
    const [x, y, w, h] = PANEL_RECTS.pit;
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#111111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitText(ctx, 'BOX →', w - 30, 80);
    ctx.fillText('BOX →', x + w / 2, y + h / 2 + 3);
  }
  { const [x, y, w, h] = PANEL_RECTS.chevronLeft; drawChevrons(ctx, x, y, w, h, -1); }
  { const [x, y, w, h] = PANEL_RECTS.chevronRight; drawChevrons(ctx, x, y, w, h, 1); }
  {
    const [x, y, w, h] = PANEL_RECTS.checker;
    for (let r = 0; r < 4; r++) for (let k = 0; k < 8; k++) { ctx.fillStyle = (r + k) % 2 ? '#ffffff' : '#111111'; ctx.fillRect(x + k * (w / 8), y + r * (h / 4), w / 8, h / 4); }
  }
  return tex(c, false);
}
