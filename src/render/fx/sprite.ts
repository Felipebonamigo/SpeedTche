// V22 · F8 (docs/ondas/V22-f8-efeitos.md): o sprite da poeira e da fumaça e as partículas ambientes. Puro (sem three, sem DOM): quem sobe o atlas à GPU é
// `effects.ts`; aqui moram o desenho procedural (testável) e a conta dos pontos ambientes.
//
// O ATLAS é 256 × 256, RGBA, 2 × 2 quadros de 128 px, pintado UMA vez na carga (≈ 65 mil pixels, alguns ms). Cada quadro é uma nuvem de couve-flor: 6 ou 7 lóbulos
// somados (`1 − Π(1 − lóbulo)`), a borda roída por ruído fractal e uma janela que zera o alfa antes do raio 0,97 — assim o ponto pode girar sem mostrar o quadrado.
//   A = o alfa (a forma, 0..1) · R = um segundo ruído, que o fragmento usa para ROER a nuvem pela borda conforme ela envelhece (se desfaz em fiapos, não só
//   some de uma vez) · G = o relevo (a cúpula de cada lóbulo; o máximo entre eles deixa vincos onde se encontram) · B sem uso. A luz é calculada no fragmento (a diferença
//   do relevo em dois pontos, na direção do sol), não pintada: assim ela não gira junto com a partícula.
import { hash2, valueNoise3 } from '../noise';

export const SPRITE_PX = 256;
export const FRAME_PX = 128;
export const SPRITE_FRAMES = 4;

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Ruído fractal de 3 oitavas em [-1, 1] (o `z` separa os quadros). */
function fbm2(seed: number, x: number, y: number, z: number, oct = 3): number {
  let s = 0; let a = 1; let n = 0; let f = 1;
  for (let o = 0; o < oct; o++) { s += valueNoise3(seed + o * 17, x * f, y * f, z) * a; n += a; a *= 0.5; f *= 2.07; }
  return s / n;
}

/** Os lóbulos de um quadro: centro (cx, cy) e raio, em coordenadas [-1, 1]; um grande no meio e 8 a 10 em volta, de tamanhos diferentes (o contorno de couve-flor). */
function lobesOf(frame: number): Array<[number, number, number]> {
  const n = 9 + (frame % 3);
  const out: Array<[number, number, number]> = [[(hash2(frame, 3) - 0.5) * 0.12, (hash2(frame, 4) - 0.5) * 0.12, 0.5 + 0.06 * hash2(frame, 5)]];
  const phase = hash2(frame, 6) * Math.PI * 2;
  for (let i = 1; i < n; i++) {
    const ang = phase + ((i - 1) / (n - 1)) * Math.PI * 2 + (hash2(frame * 31 + i, 7) - 0.5) * 0.7;
    const dist = 0.28 + 0.2 * hash2(frame * 31 + i, 8);
    const rho = 0.26 + 0.16 * hash2(frame * 31 + i, 9);
    out.push([Math.cos(ang) * dist, Math.sin(ang) * dist, rho]);
  }
  return out;
}

let atlas: Uint8Array | null = null;

/** O atlas RGBA (`SPRITE_PX`²·4 bytes). Guardado: pintar uma vez por carga. */
export function puffAtlas(): Uint8Array {
  if (atlas) return atlas;
  const out = new Uint8Array(SPRITE_PX * SPRITE_PX * 4);
  for (let f = 0; f < SPRITE_FRAMES; f++) {
    const lobes = lobesOf(f);
    const ox = (f % 2) * FRAME_PX; const oy = Math.floor(f / 2) * FRAME_PX;
    for (let py = 0; py < FRAME_PX; py++) {
      for (let px = 0; px < FRAME_PX; px++) {
        const x = ((px + 0.5) / FRAME_PX) * 2 - 1; const y = ((py + 0.5) / FRAME_PX) * 2 - 1;
        let empty = 1; let dome = 0;
        for (const [cx, cy, rho] of lobes) {
          const t = Math.hypot(x - cx, y - cy) / rho;
          empty *= smooth(0.12, 1, t);
          if (t < 1) dome = Math.max(dome, Math.sqrt(1 - t * t) * (0.55 + 0.9 * rho)); // a cúpula de cada lóbulo: o relevo que a luz do fragmento lê
        }
        const v = 1 - empty;
        const n = fbm2(f * 7 + 1, x * 3.1, y * 3.1, f * 3.1, 4);
        // O contorno é a UNIÃO DE DISCOS (a cúpula sobe de pronto na borda de cada lóbulo: bossas de couve-flor), roído pelo ruído; o miolo, denso e um pouco manchado.
        const e = 0.55 * dome + 0.45 * v + 0.42 * n * (1.1 - Math.min(1, dome));
        const r = Math.hypot(x, y);
        const alpha = smooth(0.16, 0.52, e) * (0.86 + 0.14 * n) * (1 - smooth(0.78, 0.965, r));
        const grit = 0.5 + 0.5 * fbm2(f * 7 + 5, x * 3.6, y * 3.6, f * 1.7 + 40, 3);
        const i = ((oy + py) * SPRITE_PX + ox + px) * 4;
        out[i] = Math.round(grit * 255); out[i + 1] = Math.round(Math.min(1, dome) * 255); out[i + 2] = 255; out[i + 3] = Math.round(alpha * 255);
      }
    }
  }
  atlas = out;
  return out;
}

/** O alfa (0..1) do quadro `frame` em (nx, ny) ∈ [-1, 1]², interpolado; 0 fora do quadro. Para os testes e a conferência. */
export function spriteAlpha(frame: number, nx: number, ny: number): number {
  if (nx < -1 || nx > 1 || ny < -1 || ny > 1) return 0;
  const a = puffAtlas();
  const fx = (nx * 0.5 + 0.5) * FRAME_PX - 0.5; const fy = (ny * 0.5 + 0.5) * FRAME_PX - 0.5;
  const x0 = Math.floor(fx); const y0 = Math.floor(fy); const tx = fx - x0; const ty = fy - y0;
  const ox = (frame % 2) * FRAME_PX; const oy = Math.floor(frame / 2) * FRAME_PX;
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= FRAME_PX || y >= FRAME_PX ? 0 : a[((oy + y) * SPRITE_PX + ox + x) * 4 + 3] / 255);
  const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
  const bot = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
  return top * (1 - ty) + bot * ty;
}

// ───────────────────────────── partículas ambientes ─────────────────────────────

/** Uma partícula ambiente: posição em coordenada de pista (z em unidades, x em meias larguras, h em m), tamanho em m, alfa 0..1. */
export interface Mote { z: number; x: number; h: number; size: number; alpha: number }

/** O alfa de pico: sutil de propósito (poeira em suspensão, não neve). */
export const AMBIENT_ALPHA_MAX = 0.36;
/** O ciclo ao longo da pista (m): a partícula volta ao fim dele, apagada nas duas pontas, e vai de −12 m (atrás do carro) a +63 m à frente. */
const SPAN = 75;
const BEHIND = 12;
const M_PER_UNIT = 1 / 50;
const M_PER_X = 7;
const TAU = Math.PI * 2;

/**
 * A partícula `k` num instante `time` (s) com o carro em `carZ`: SEM ESTADO (hash por índice), presa ao MUNDO — o carro anda e ela fica onde está (só uma brisa
 * de 0,3 a 0,8 m/s a leva e ela sobe e desce 25 cm) — em vez de nadar junto com a câmera. Dentro de uma janela de 75 m em volta do carro, a ±8,5 m do eixo da pista,
 * entre 0,35 e 3,85 m de altura; apaga nas pontas da janela (entra e sai sem piscar) e cintila devagar. `out.alpha` = 0 quando está apagada.
 */
export function ambientMote(k: number, time: number, carZ: number, _carX: number, out: Mote): Mote {
  const u = hash2(k, 501); const v = hash2(k, 502); const w = hash2(k, 503); const s = hash2(k, 504); const ph = hash2(k, 505) * TAU;
  const zm = carZ * M_PER_UNIT;
  const base = u * SPAN + time * (0.3 + 0.5 * s);
  const rel = ((((base - zm + BEHIND) % SPAN) + SPAN) % SPAN) - BEHIND;
  // apagada até 3 m à frente do carro (câmera e chão sob o carro ficam limpos: o detalhe da estrada na captura não pode borrar) e cheia só a partir de 12 m
  const fade = smooth(3, 12, rel) * (1 - smooth(48, SPAN - BEHIND, rel));
  const twinkle = 0.6 + 0.4 * Math.sin(time * (0.5 + 0.6 * v) + ph);
  out.z = (zm + rel) / M_PER_UNIT;
  out.x = ((w - 0.5) * 17 + 0.6 * Math.sin(time * 0.3 + ph)) / M_PER_X;
  out.h = 0.6 + 3 * v + 0.25 * Math.sin(time * 0.7 + ph * 1.3);
  out.size = 0.04 + 0.06 * s;
  out.alpha = AMBIENT_ALPHA_MAX * fade * twinkle;
  return out;
}
