// Reflexo de lente do entardecer (onda M, M2; docs/ondas/M/M2.md §4). Uma malha só (1 chamada de desenho), aditiva, que a câmera de CADA viewport
// posiciona no vertex shader a partir da direção local do sol (`uSunDir`) e da `viewMatrix`/`projectionMatrix` que o three já liga: véu largo
// em volta do sol, faixa horizontal fina e fantasmas hexagonais ao longo da reta sol → centro da tela. Some quando o sol sai da tela ou fica
// atrás da câmera. O véu fica na profundidade do fundo e testa profundidade (montanha, prédio e marco o cortam); a faixa e os fantasmas ficam no
// plano próximo (reflexo de lente é da lente, nenhuma árvore o oclui) — o sol em si nunca fica atrás do anel de montanhas (palette.ts, `SUN`).
// O layout (`lensFlareLayout`) é a mesma conta do GLSL, em JS puro: é o que o teste cobre (tests/lente-m2.test.ts).
import * as THREE from 'three';
import { applyGrade } from './stylize';

export type FlareKind = 'veil' | 'streak' | 'ghost';
const KIND_ID: Record<FlareKind, number> = { veil: 0, streak: 1, ghost: 2 };

export interface FlareElement {
  kind: FlareKind;
  /** Posição ao longo da reta centro → sol: 1 = em cima do sol, 0 = no centro da tela, negativo = do outro lado do centro. */
  k: number;
  /** Meia-altura em NDC (1 = metade da altura da tela). */
  size: number;
  /** Intensidade do elemento (antes da força da paleta e da desaparição pela borda). */
  alpha: number;
  /** Só a faixa: meia-largura = `size × stretch` em NDC; os outros são redondos (meia-largura = `size` / proporção da tela). */
  stretch: number;
  /** 0..0.35: quanto a cor do fantasma foge para o lado oposto do matiz (a franja de cor da lente). */
  hue: number;
}

/** Soma de `alpha` ≤ 1,2 (o teste): com o sol no centro nada vira clarão. */
export const FLARE_ELEMENTS: readonly FlareElement[] = [
  { kind: 'veil', k: 1, size: 0.55, alpha: 0.2, stretch: 0, hue: 0 },
  { kind: 'streak', k: 1, size: 0.012, alpha: 0.22, stretch: 70, hue: 0 },
  { kind: 'ghost', k: 0.62, size: 0.06, alpha: 0.14, stretch: 0, hue: 0.1 },
  { kind: 'ghost', k: 0.3, size: 0.1, alpha: 0.1, stretch: 0, hue: 0.2 },
  { kind: 'ghost', k: -0.25, size: 0.05, alpha: 0.12, stretch: 0, hue: 0.3 },
  { kind: 'ghost', k: -0.6, size: 0.16, alpha: 0.09, stretch: 0, hue: 0.15 },
  { kind: 'ghost', k: -1.0, size: 0.08, alpha: 0.1, stretch: 0, hue: 0.35 },
  { kind: 'ghost', k: -1.7, size: 0.22, alpha: 0.07, stretch: 0, hue: 0.25 },
];

/** O sol some entre estes dois raios (NDC, o maior entre |x| e |y|): inteiro até o primeiro, apagado no segundo. */
export const FLARE_FADE_START = 0.55;
export const FLARE_FADE_END = 1.25;

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 1 com o sol na tela, 0 fora dela ou atrás da câmera (mesma conta do vertex shader). */
export function flareFade(sunNdc: readonly [number, number], inFront: boolean): number {
  if (!inFront) return 0;
  return 1 - smooth(FLARE_FADE_START, FLARE_FADE_END, Math.max(Math.abs(sunNdc[0]), Math.abs(sunNdc[1])));
}

export interface FlareQuad {
  kind: FlareKind;
  k: number;
  /** Centro, em NDC. */
  x: number;
  y: number;
  /** Meia-largura e meia-altura, em NDC. */
  halfW: number;
  halfH: number;
  /** Intensidade final (já com a desaparição pela borda; a força da paleta multiplica depois, no uniforme). */
  alpha: number;
}

/** Onde cada elemento cai na tela, para o sol em `sunNdc` (NDC) e a tela com `aspect` = largura / altura. */
export function lensFlareLayout(sunNdc: readonly [number, number], aspect: number, inFront = true): FlareQuad[] {
  const fade = flareFade(sunNdc, inFront);
  return FLARE_ELEMENTS.map((e) => ({
    kind: e.kind, k: e.k,
    x: sunNdc[0] * e.k, y: sunNdc[1] * e.k,
    halfW: e.kind === 'streak' ? e.size * e.stretch : e.size / aspect,
    halfH: e.size,
    alpha: e.alpha * fade,
  }));
}

const VERT = /* glsl */ `
uniform vec3 uSunDir;
uniform float uStrength;
attribute float aK; attribute float aSize; attribute float aAlpha; attribute float aKind; attribute float aStretch; attribute float aHue;
varying vec2 vUv; varying float vAlpha; varying float vKind; varying float vHue;
void main() {
  vUv = position.xy; vKind = aKind; vHue = aHue;
  // O sol no espaço da câmera, e dali em NDC (a câmera de cada viewport: o three liga as matrizes antes de cada desenho).
  vec3 d = mat3(viewMatrix) * uSunDir;
  if (d.z > -0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; return; } // atrás da câmera: fora do clip
  vec4 c = projectionMatrix * vec4(d * 1000.0, 1.0);
  vec2 sun = c.xy / c.w;
  float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
  float edge = max(abs(sun.x), abs(sun.y));
  float fade = 1.0 - smoothstep(${FLARE_FADE_START.toFixed(3)}, ${FLARE_FADE_END.toFixed(3)}, edge);
  vec2 hs = vec2(aStretch > 0.0 ? aSize * aStretch : aSize / aspect, aSize);
  gl_Position = vec4(sun * aK + position.xy * hs, aKind < 0.5 ? 0.99999 : -0.999, 1.0);
  vAlpha = aAlpha * fade * uStrength;
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv; varying float vAlpha; varying float vKind; varying float vHue;
void main() {
  float a;
  vec3 col = uColor;
  if (vKind < 0.5) {
    a = pow(max(1.0 - length(vUv), 0.0), 2.0);                       // véu: queda suave
  } else if (vKind < 1.5) {
    a = pow(max(1.0 - abs(vUv.x), 0.0), 3.0) * (1.0 - smoothstep(0.0, 1.0, abs(vUv.y))); // faixa: forte no sol, some nas pontas
    col = mix(vec3(1.0), uColor, 0.6);
  } else {
    float h = max(abs(vUv.x) * 0.866 + abs(vUv.y) * 0.5, abs(vUv.y)); // distância ao hexágono: a abertura do diafragma
    a = (1.0 - smoothstep(0.55, 0.95, h)) * 0.55 + smoothstep(0.55, 0.85, h) * (1.0 - smoothstep(0.85, 1.0, h)) * 0.9;
    col = mix(uColor, uColor.bgr, vHue);                             // franja de cor
  }
  a *= vAlpha;
  if (a < 0.002) discard;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** A malha do reflexo: 4 vértices por elemento, tudo do `FLARE_ELEMENTS`. Invisível até a paleta ligar (`Sky`). */
export function buildLensFlare(): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const n = FLARE_ELEMENTS.length;
  const corner = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const position = new Float32Array(n * 4 * 3);
  const attrs = { aK: new Float32Array(n * 4), aSize: new Float32Array(n * 4), aAlpha: new Float32Array(n * 4), aKind: new Float32Array(n * 4), aStretch: new Float32Array(n * 4), aHue: new Float32Array(n * 4) };
  const index: number[] = [];
  FLARE_ELEMENTS.forEach((e, i) => {
    for (let c = 0; c < 4; c++) {
      const v = i * 4 + c;
      position[v * 3] = corner[c][0]; position[v * 3 + 1] = corner[c][1];
      attrs.aK[v] = e.k; attrs.aSize[v] = e.size; attrs.aAlpha[v] = e.alpha; attrs.aKind[v] = KIND_ID[e.kind]; attrs.aStretch[v] = e.stretch; attrs.aHue[v] = e.hue;
    }
    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  for (const [name, arr] of Object.entries(attrs)) geo.setAttribute(name, new THREE.BufferAttribute(arr, 1));
  geo.setIndex(index);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false,
    uniforms: { uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uStrength: { value: 0 }, uColor: { value: new THREE.Color('#ffb070') } },
  });
  applyGrade(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  mesh.visible = false;
  return mesh;
}
