// V22/F3: o céu medido na IMAGEM. O `Sky` do jogo (domo, cirros, bolha do sol, dither) numa cena vazia, câmera Alta (FOV 54°, olhando ~6° para baixo, como o quadro da corrida), o mesmo
// tone mapping do renderer (installToneMapping + setStylizePalette) e a saída direto no canvas (o caminho da Baixa/Média; na Alta o OutputPass faz a mesma conta sobre o alvo).
// `medir` devolve só números (luma 0..1 do céu, a faixa do alto do quadro): média, resíduo fino 5×5, estrutura horizontal (desvio entre colunas depois de tirar a média da linha).
import * as THREE from 'three';
import { palette } from '../src/render/palette';
import { Sky } from '../src/render/sky';
import { installToneMapping, setStylizePalette } from '../src/render/stylize';
import type { SceneryId, TimeOfDay } from '../src/core/types';
import type { Quality } from '../src/game/contracts';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const W = 640; const H = 360;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setSize(W, H, false); renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
installToneMapping();
renderer.toneMapping = THREE.CustomToneMapping;
const scene = new THREE.Scene();
const sky = new Sky(renderer, scene);
const camera = new THREE.PerspectiveCamera(54, W / H, 0.1, 4000);
camera.rotation.x = (-6 * Math.PI) / 180; camera.updateMatrixWorld();
const dome = (sky as unknown as { dome: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> }).dome;
const parts = sky as unknown as { clouds: THREE.Mesh; stars: THREE.Points };

export interface Opts {
  scenery?: SceneryId; time?: TimeOfDay; quality?: Quality;
  /** 0 = de frente para o sol, 180 = de costas; o azimute da câmera relativo ao do sol. */
  facing?: number;
  /** liga a pintura nova (`uPaint`): 0 = o céu de antes (se o Sky não tem o uniforme, nada muda). */
  paint?: number;
  /** cirros ligados (0/1) e a bolha do sol (0/1): para isolar cada pintura. */
  cirrus?: number; bloom?: number;
  clouds?: boolean; seconds?: number;
}

const base = new Map<string, { bloom: number; cirrus: number }>();

function ler(o: Opts): Float32Array {
  const scenery = o.scenery ?? 'coast'; const time = o.time ?? 'day';
  const p = palette(scenery, time);
  const g = setStylizePalette(p); renderer.toneMappingExposure = g.exposure;
  sky.setQuality(o.quality ?? 'high');
  const key = `${scenery}:${time}:${o.quality ?? 'high'}`;
  sky.setPalette(p, time, key);
  const u = dome.material.uniforms;
  // Os valores de base de cada paleta (guardados na primeira vez): cada medida liga e desliga por cima deles, sem vazar para a seguinte.
  if (!base.has(key)) base.set(key, { bloom: (u.uBloom?.value as number) ?? 0, cirrus: (u.uCirrus?.value as number) ?? 0 });
  const b = base.get(key)!;
  if (u.uPaint) u.uPaint.value = o.paint ?? 1;
  if (u.uCirrus) u.uCirrus.value = b.cirrus * (o.cirrus ?? 1);
  if (u.uBloom) u.uBloom.value = b.bloom * (o.bloom ?? 1);
  parts.clouds.visible = o.clouds ?? false; parts.stars.visible = false;
  const a = (p.sunAz * Math.PI) / 180; // a câmera olha para o azimute do sol + `facing`
  sky.update(a - (((o.facing ?? 0) * Math.PI) / 180), o.seconds ?? 0);
  renderer.render(scene, camera);
  const gl = renderer.getContext(); const buf = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const L = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = ((H - 1 - y) * W + x) * 4; L[y * W + x] = (0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]) / 255; }
  return L;
}

/** O céu é o alto do quadro: da linha 0 a 38% da altura (o horizonte fica a ~40%). */
const SKY_ROWS = Math.floor(H * 0.36);

function medir(o: Opts): { media: number; residuoFino: number; estruturaHorizontal: number; valoresDistintos: number } {
  const L = ler(o);
  let soma = 0;
  for (let y = 0; y < SKY_ROWS; y++) for (let x = 0; x < W; x++) soma += L[y * W + x];
  // resíduo fino: desvio do pixel − média 5×5 (só o detalhe fino) numa janela do miolo do céu
  let s2 = 0; let n = 0;
  for (let y = 4; y < SKY_ROWS - 4; y++) for (let x = 4; x < W - 4; x++) {
    let m = 0;
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) m += L[(y + j) * W + x + i];
    const e = L[y * W + x] - m / 25; s2 += e * e; n++;
  }
  // estrutura horizontal: por linha, o desvio-padrão entre as colunas depois de um passa-baixa 9 (o grão do dither some), tirada a média da linha
  let h2 = 0; let hn = 0;
  for (let y = 4; y < SKY_ROWS - 4; y += 2) {
    const row: number[] = [];
    for (let x = 4; x < W - 4; x++) { let m = 0; for (let i = -4; i <= 4; i++) m += L[y * W + x + i]; row.push(m / 9); }
    const mean = row.reduce((a, b) => a + b, 0) / row.length;
    for (const v of row) { h2 += (v - mean) * (v - mean); hn++; }
  }
  const distintos = new Set<number>();
  for (let y = 0; y < SKY_ROWS; y++) distintos.add(Math.round(L[y * W + (W >> 1)] * 255));
  return { media: soma / (SKY_ROWS * W), residuoFino: Math.sqrt(s2 / Math.max(1, n)), estruturaHorizontal: Math.sqrt(h2 / Math.max(1, hn)), valoresDistintos: distintos.size };
}

const shaderErrors: string[] = [];
renderer.debug.onShaderError = (ctx, program, vs, fs) => { shaderErrors.push(`${ctx.getShaderInfoLog(vs) ?? ''} | ${ctx.getShaderInfoLog(fs) ?? ''} | ${ctx.getProgramInfoLog(program) ?? ''}`.slice(0, 800)); };
(window as unknown as { ceu: unknown }).ceu = { medir, shaderErrors: () => shaderErrors, temPintura: () => Boolean(dome.material.uniforms.uPaint) };
(window as unknown as { ceuReady: boolean }).ceuReady = true;
