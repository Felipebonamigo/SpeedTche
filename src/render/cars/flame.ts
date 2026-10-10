// Chama do nitro em MALHA (M4): uma gota de ~120 triângulos ao longo de +Z (0 no escape, 1 na ponta), instanciada uma por
// escape. O tremor, o núcleo branco e a ponta que apaga são do shader; a cor vem por instância (`instanceColor`, a cor
// do visual do carro: flameColorFor) e a fase do tremor por um atributo de instância (`aFlame`). Substitui o billboard
// de textura de 4 quadros — que não tinha cor por instância nem volume visto de lado.
import * as THREE from 'three';
import { FLAME_COLORS } from '../../game/cosmetics';

/** Azul-branco de sempre: a chama do carro que não pediu outra. */
export const FLAME_BASE = '#58b6ff';
/** Quanto do acento do carro tinge a chama (0 = todas azuis). Só vale para quem NÃO escolheu a cor da chama (`CarLook.flame` ausente, N3). */
const FLAME_TINT = 0.35;

const RADIAL = 12;
/** Posição ao longo da chama e raio de cada anel: bico estreito, barriga a ~25%, ponta fechada. */
const RINGS: ReadonlyArray<readonly [number, number]> = [[0, 0.2], [0.1, 0.42], [0.25, 0.5], [0.45, 0.4], [0.7, 0.24], [0.9, 0.09], [1, 0]];

/** A gota: anéis de `RADIAL` lados ao longo de +Z, tampa no bico e ponta fechada. `uv` = (volta, posição ao longo da chama). */
export function buildFlameGeometry(): THREE.BufferGeometry {
  const pos: number[] = []; const uv: number[] = []; const idx: number[] = [];
  for (const [t, r] of RINGS) {
    for (let k = 0; k <= RADIAL; k++) {
      const a = (k / RADIAL) * Math.PI * 2;
      pos.push(Math.cos(a) * r, Math.sin(a) * r, t);
      uv.push(k / RADIAL, t);
    }
  }
  const row = RADIAL + 1;
  for (let i = 0; i < RINGS.length - 1; i++) {
    for (let k = 0; k < RADIAL; k++) {
      const a = i * row + k; const b = a + 1; const c = a + row; const d = c + 1;
      if (RINGS[i + 1][1] === 0) idx.push(a, c, b); // a ponta: o último anel é um ponto, só um triângulo por gomo
      else idx.push(a, c, b, b, c, d);
    }
  }
  // Tampa do bico (fica dentro da ponteira do escape).
  const centre = pos.length / 3;
  pos.push(0, 0, 0); uv.push(0.5, 0);
  for (let k = 0; k < RADIAL; k++) idx.push(centre, k, k + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/**
 * A cor da chama de um carro, pronta por instância: o azul-branco de sempre tingido pelo acento do carro, sempre clara e
 * com cor (nunca breu nem branco liso). `out` reaproveita o objeto.
 */
export function flameColorFor(accent: string | THREE.Color, out: THREE.Color = new THREE.Color()): THREE.Color {
  const base = new THREE.Color(FLAME_BASE);
  const c = accent instanceof THREE.Color ? accent.clone() : new THREE.Color(accent);
  base.lerp(c, FLAME_TINT);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  return out.setHSL(hsl.h, Math.max(hsl.s, 0.5), Math.min(0.72, Math.max(hsl.l, 0.55)));
}

/**
 * O tom que o fragmento aplica à cor da instância (`hue = vCol * FLAME_HUE`): afinado para o azul-branco de sempre. A cor ESCOLHIDA
 * (`CarLook.flame`, catálogo em cosmetics.ts) entra na instância dividida por isto, e o fragmento a devolve como está no catálogo.
 */
/** Brancura do núcleo (a `aFlame.z`) da chama escolhida: a cor aparece, com só um fiapo de branco no meio. A do azul-branco de sempre é 1. */
export const FLAME_CHOSEN_WHITE = 0.12;

export const FLAME_HUE: readonly [number, number, number] = [0.55, 0.85, 1.45];

/** A cor de instância da chama escolhida pelo jogador (id do catálogo), pronta para `instanceColor`; null se o id não existe. */
export function flameChosenColor(id: string | undefined, out: THREE.Color = new THREE.Color()): THREE.Color | null {
  const hex = id !== undefined && Object.hasOwn(FLAME_COLORS, id) ? FLAME_COLORS[id] : undefined;
  if (!hex) return null;
  out.set(hex);
  return out.setRGB(out.r / FLAME_HUE[0], out.g / FLAME_HUE[1], out.b / FLAME_HUE[2]);
}

/**
 * Vértice: tremor (a chama balança e a barriga pulsa, mais perto da ponta) e as saídas para o fragmento — posição ao longo,
 * o quanto a face encara a câmera (núcleo) e o quanto o EIXO encara (de trás a chama é um brilho curto, para não engolir as lanternas).
 * `aFlame` = (fase, força 0..1, brancura do núcleo 0..1) por instância; a cor é `instanceColor`. A brancura é 1 no azul-branco de sempre e menor na cor
 * ESCOLHIDA (N3): com o núcleo e o ganho de antes, qualquer cor sairia branca vista de trás.
 */
export const FLAME_VERT = /* glsl */ `
attribute vec3 aFlame;
uniform float uTime;
varying float vT; varying float vFacing; varying float vAxis; varying vec3 vCol; varying float vLevel; varying float vWhite;
void main() {
  float t = uv.y;
  float ph = aFlame.x;
  vec3 p = position;
  float wob = 1.0 + 0.16 * t * sin(t * 13.0 - uTime * 41.0 + ph) + 0.08 * sin(uTime * 63.0 + ph * 2.3);
  p.xy *= wob;
  p.x += 0.14 * t * t * sin(uTime * 29.0 + ph * 2.1 + t * 5.0);
  p.y += 0.10 * t * t * sin(uTime * 23.0 + ph * 3.3 + t * 4.0);
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(p, 1.0);
  vec3 toCam = normalize(cameraPosition - wp.xyz);
  vec3 n = normalize(mat3(m) * normal + 1e-5); // com o z: de trás, a parte que afina para a ponta encara a câmera (o núcleo aparece)
  vec3 axis = normalize(mat3(m) * vec3(0.0, 0.0, 1.0));
  vT = t; vFacing = abs(dot(n, toCam)); vAxis = abs(dot(axis, toCam)); vCol = instanceColor; vLevel = aFlame.y; vWhite = aFlame.z;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

/**
 * Fragmento: núcleo branco onde a face encara a câmera, azul saturado (a cor do carro) nas bordas e um toque quente na ponta; a borda
 * da silhueta some (esconde as facetas da malha) e a ponta apaga. Aditivo: a cor sai SEM multiplicar pelo alfa (o blend já o faz).
 */
export const FLAME_FRAG = /* glsl */ `
varying float vT; varying float vFacing; varying float vAxis; varying vec3 vCol; varying float vLevel; varying float vWhite;
void main() {
  float rim = smoothstep(0.0, 0.55, vFacing);
  float body = 1.0 - smoothstep(0.5, 1.0, vT);
  float core = pow(vFacing, 2.2) * (1.0 - vT * 0.8) * vWhite;
  vec3 hue = vCol * vec3(0.55, 0.85, 1.45);
  vec3 c = mix(hue, vec3(1.0), clamp(core * 1.25, 0.0, 1.0));
  c = mix(c, vCol * vec3(1.4, 0.8, 0.55), smoothstep(0.4, 0.95, vT) * 0.5);
  float a = body * rim * (0.75 + 0.25 * vLevel) * mix(1.0, 0.8, vAxis);
  float gain = mix(2.6, 2.0, vAxis) * mix(0.5, 1.0, vWhite);
  gl_FragColor = vec4(c * gain, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
