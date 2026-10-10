// Recorte alfa do cenário (onda L, L4): a lâmina de capim que os cartões de `cutoutCards` (geom.ts) mostram. A silhueta é uma
// FUNÇÃO (`bladeCoverage`), que a textura rasteriza e o teste mede sem canvas; o material do lote `cutout` (runtime.ts)
// usa `alphaTest`, então não precisa ordenar nem misturar, e funciona dentro do `BatchedMesh`.
import * as THREE from 'three';
import { hash2 } from '../noise';

/** Lâminas por tufo na textura. */
const BLADES = 7;

interface Blade { base: number; lean: number; top: number }

function blade(k: number): Blade {
  const base = 0.18 + (0.64 * (k + 0.5)) / BLADES + (hash2(31, k) - 0.5) * 0.06;
  return { base, lean: (hash2(37, k) - 0.5) * 0.5 + (base - 0.5) * 0.6, top: 0.62 + hash2(41, k) * 0.38 };
}

/** Meia largura da lâmina na altura relativa t (0 no pé, 1 na ponta) e o centro dela. */
const halfWidth = (t: number): number => 0.075 * (1 - t) ** 0.85 + 0.004;
const centreAt = (b: Blade, t: number): number => b.base + b.lean * t ** 1.7;

/**
 * Cobertura (0 ou 1) do ponto (u, v) da textura (v = 0 no pé): um leque de `BLADES` lâminas que saem do pé, curvas, mais finas
 * na ponta, de alturas e inclinações diferentes (sorteadas por hash: a mesma textura sempre).
 */
export function bladeCoverage(u: number, v: number): number {
  for (let k = 0; k < BLADES; k++) {
    const b = blade(k);
    if (v > b.top) continue;
    const t = v / b.top;
    if (Math.abs(u - centreAt(b, t)) < halfWidth(t)) return 1;
  }
  return 0;
}

/** Fração da textura que a silhueta cobre (nos testes: nem quadrado cheio, nem vazio). */
export function bladeFill(size = 64): number {
  let on = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) on += bladeCoverage((x + 0.5) / size, 1 - (y + 0.5) / size);
  return on / (size * size);
}

/** A textura de recorte: a silhueta (o mesmo desenho de `bladeCoverage`) em polígonos brancos sobre fundo transparente. */
export function bladeTexture(size = 64): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('sem canvas 2D');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  const STEPS = 12;
  for (let k = 0; k < BLADES; k++) {
    const b = blade(k);
    ctx.beginPath();
    for (let i = 0; i <= STEPS; i++) { const t = i / STEPS; ctx.lineTo((centreAt(b, t) - halfWidth(t)) * size, (1 - t * b.top) * size); }
    for (let i = STEPS; i >= 0; i--) { const t = i / STEPS; ctx.lineTo((centreAt(b, t) + halfWidth(t)) * size, (1 - t * b.top) * size); }
    ctx.closePath();
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Material do lote `cutout`: cor por vértice × silhueta, `alphaTest` (sem sombra, sem mistura). A normal vale para os dois lados
 * do cartão (o `faceDirection` do three viraria a normal de cima do capim para baixo no verso e o escureceria). O `stylize`
 * entra depois, composto com este callback (runtime.ts).
 */
export function cutoutMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map, alphaTest: 0.45, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
  };
  m.customProgramCacheKey = () => 'scenery-cutout';
  return m;
}
