// V22/F7: a SAÍDA do pipeline medida na imagem. O `ViewportPipeline` do jogo (plano da Alta com 4 jogadores: sem AO, MSAA, bloom, saída) sobre uma cena só de fundo liso (cor de fundo
// do three, nenhuma malha): o que sobra na imagem é o que a saída faz — a vinheta (luma do canto ÷ luma do centro) e o dither (resíduo fino 5×5 do miolo, onde o fundo é plano).
// `vinheta` = o escurecimento no canto do plano (`PostPlan.vignette`); `semDither` desliga o grão só para o controle negativo (zera o passo no shader, não o código do jogo).
import * as THREE from 'three';
import { palette } from '../src/render/palette';
import { ViewportPipeline } from '../src/render/postfx/pipeline';
import { planFor } from '../src/render/postfx/plan';
import { installToneMapping, setStylizePalette } from '../src/render/stylize';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const W = 640; const H = 360;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setSize(W, H, false); renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
installToneMapping();
renderer.toneMapping = THREE.CustomToneMapping;
const p = palette('coast', 'day');
renderer.toneMappingExposure = setStylizePalette(p).exposure;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#5a6f88'); // um tom que o degrau de 8 bits não representa exato na saída: o dither tem o que fazer
const camera = new THREE.PerspectiveCamera(54, W / H, 0.1, 100);
const plan = planFor('high', 4);
const pipe = new ViewportPipeline(renderer, scene, camera, plan, null, p.bloom);
pipe.setSize(W, H);

function ler(vinheta: number): Float32Array {
  pipe.render({ camera, scale: 1, radial: 0, vignette: vinheta }, false);
  const gl = renderer.getContext(); const buf = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const L = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = ((H - 1 - y) * W + x) * 4; L[y * W + x] = (0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]) / 255; }
  return L;
}
const box = (L: Float32Array, x0: number, y0: number, x1: number, y1: number): number => { let s = 0; let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += L[y * W + x]; n++; } return s / n; };

function medir(o: { vinheta?: number }): { centro: number; canto: number; razao: number; residuoFino: number; borda: number } {
  const L = ler(o.vinheta ?? 0.11);
  const cx = W >> 1; const cy = H >> 1;
  const centro = box(L, cx - 40, cy - 40, cx + 40, cy + 40);
  const cantos = [box(L, 0, 0, 24, 24), box(L, W - 24, 0, W, 24), box(L, 0, H - 24, 24, H), box(L, W - 24, H - 24, W, H)];
  const canto = cantos.reduce((a, b) => a + b, 0) / 4;
  // resíduo fino 5×5 do miolo (o fundo é plano: só o dither deixa resíduo)
  let s2 = 0; let n = 0;
  for (let y = cy - 40; y < cy + 40; y++) for (let x = cx - 40; x < cx + 40; x++) {
    let m = 0;
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) m += L[(y + j) * W + x + i];
    const e = L[y * W + x] - m / 25; s2 += e * e; n++;
  }
  // a borda do meio (a 45% do raio): ainda sem vinheta
  const borda = box(L, cx + Math.round(W * 0.2) - 6, cy - 6, cx + Math.round(W * 0.2) + 6, cy + 6);
  return { centro, canto, razao: canto / centro, residuoFino: Math.sqrt(s2 / n), borda };
}

const shaderErrors: string[] = [];
renderer.debug.onShaderError = (ctx, program, vs, fs) => { shaderErrors.push(`${ctx.getShaderInfoLog(vs) ?? ''} | ${ctx.getShaderInfoLog(fs) ?? ''} | ${ctx.getProgramInfoLog(program) ?? ''}`.slice(0, 800)); };
(window as unknown as { saida: unknown }).saida = { medir, shaderErrors: () => shaderErrors };
(window as unknown as { saidaReady: boolean }).saidaReady = true;
