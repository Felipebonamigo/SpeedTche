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
/**
 * Posição ao longo da chama e raio de cada anel: língua que abre na boca do escape e só afina até a ponta fechada (cor-brilho: era uma gota de barriga a
 * 25%, que de trás virava um disco branco).
 */
const RINGS: ReadonlyArray<readonly [number, number]> = [[0, 0.24], [0.08, 0.32], [0.22, 0.29], [0.42, 0.21], [0.65, 0.12], [0.85, 0.05], [1, 0]];

/**
 * O tamanho da chama no carro (m): largura (escala x/y da malha) e comprimento (escala z) com o nitro cheio; `cars.ts` a pulsa e encurta com a força.
 * Comprimento ≥ 5× o diâmetro (tests/cor-brilho.test.ts): língua, não gota. Era 0,5 × 2,3 com a barriga de 0,5 (diâmetro 0,5 m).
 */
export const FLAME_SIZE = { width: 0.46, length: 2.2 } as const;
/** "Reduzir efeitos": a chama mais curta e mais fraca. */
export const FLAME_REDUCED = { length: 0.6, level: 0.5 } as const;

/** Força da chama pela luz do período (`light` da paleta): cheia de dia (legível no claro), mais fraca no entardecer e à noite (sem estourar no escuro). */
export function flameGain(light: number): number {
  return light >= 0.8 ? 1 : light >= 0.5 ? 0.85 : 0.7;
}

/**
 * Quanto a chama COBRE o fundo (o blend é pré-multiplicado: cor·alfa + fundo·(1 − alfa·cobertura)). Só somar luz (aditivo puro) num asfalto claro de
 * dia dá um laranja lavado, cor de pêssego, que mal se lê; cobrindo metade, o laranja aparece. À noite quase só soma (brilha no escuro).
 */
export function flameCover(light: number): number {
  return light >= 0.8 ? 0.5 : light >= 0.5 ? 0.3 : 0.12;
}

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
 * Vértice: tremor (a língua balança e ondula, mais perto da ponta) e as saídas para o fragmento — posição ao longo, o quanto a face encara a câmera e o
 * quanto o EIXO encara (de trás a chama vem para a câmera; um pouco mais fraca, para não engolir as lanternas).
 * A normal vai ao mundo pela inversa da escala (`normal / escala²` antes da matriz): a malha é esticada 6× ao longo, e a matriz direta deitava as normais
 * para trás — de trás, a chama inteira "encarava" a câmera e o núcleo branco cobria tudo (a gota branca, cor-brilho).
 * `aFlame` = (fase, força 0..1, brancura do núcleo 0..1) por instância; a cor é `instanceColor`. A brancura é 1 na chama de sempre e menor na cor
 * ESCOLHIDA (N3), que tinge o corpo inteiro.
 */
export const FLAME_VERT = /* glsl */ `
attribute vec3 aFlame;
uniform float uTime;
varying float vT; varying float vFacing; varying float vAxis; varying vec3 vCol; varying float vLevel; varying float vWhite; varying float vPh;
void main() {
  float t = uv.y;
  float ph = aFlame.x;
  vec3 p = position;
  float wob = 1.0 + 0.14 * t * sin(t * 13.0 - uTime * 41.0 + ph) + 0.07 * sin(uTime * 63.0 + ph * 2.3);
  p.xy *= wob;
  p.x += 0.16 * t * t * sin(uTime * 29.0 + ph * 2.1 + t * 5.0);
  p.y += 0.12 * t * t * sin(uTime * 23.0 + ph * 3.3 + t * 4.0);
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(p, 1.0);
  vec3 toCam = normalize(cameraPosition - wp.xyz);
  vec3 sc = vec3(dot(m[0].xyz, m[0].xyz), dot(m[1].xyz, m[1].xyz), dot(m[2].xyz, m[2].xyz));
  vec3 n = normalize(mat3(m) * (normal / max(sc, vec3(1e-6))) + 1e-5);
  vec3 axis = normalize(mat3(m) * vec3(0.0, 0.0, 1.0));
  vT = t; vFacing = abs(dot(n, toCam)); vAxis = abs(dot(axis, toCam)); vCol = instanceColor; vLevel = aFlame.y; vWhite = aFlame.z; vPh = ph;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

/**
 * Fragmento (cor-brilho: "o nitro mais parecido com fogo"). Núcleo azul-branco CURTO: a boca do escape (a tampa, t = 0, e os primeiros 6%), mais fraca
 * que o corpo — de trás é o escape aceso, não um disco; corpo amarelo-laranja → laranja → vermelho que apaga até a ponta e tremula em línguas (a chama de
 * sempre); a cor ESCOLHIDA (N3) tinge o corpo, com um núcleo claro dela. A borda da silhueta some (esconde as facetas). Sem ganho HDR: a gota antiga saía a
 * 2,0–2,6× com o miolo puxado ao branco e estourava; aqui o máximo é 1,25× (no núcleo), e `uFlameGain` cai com a luz do período (`flameGain`); `uFlameCover`: quanto ela cobre o fundo (`flameCover`). Cores
 * saturadas (pouco verde e azul): somadas ao asfalto e passadas pelo Neutral, as claras saíam pêssego. Blend pré-multiplicado (cars.ts): a cor sai já multiplicada pelo alfa.
 */
export const FLAME_FRAG = /* glsl */ `
uniform float uTime; uniform float uFlameGain; uniform float uFlameCover;
varying float vT; varying float vFacing; varying float vAxis; varying vec3 vCol; varying float vLevel; varying float vWhite; varying float vPh;
void main() {
  vec3 hue = vCol * vec3(0.55, 0.85, 1.45);
  vec3 fire = mix(vec3(1.0, 0.5, 0.1), vec3(1.0, 0.28, 0.04), smoothstep(0.08, 0.4, vT));
  fire = mix(fire, vec3(0.85, 0.1, 0.02), smoothstep(0.4, 0.95, vT));
  vec3 body = mix(hue, fire, vWhite);
  vec3 coreCol = mix(hue, vec3(0.75, 0.87, 1.0), 0.2 + 0.5 * vWhite);
  float core = 1.0 - smoothstep(0.0, 0.06, vT);
  vec3 c = mix(body, coreCol, core);
  float tongues = 0.7 + 0.3 * sin(vT * 19.0 - uTime * 47.0 + vPh * 3.0);
  float edge = smoothstep(0.0, 0.3, vFacing);
  float along = mix(0.45, 1.0, smoothstep(0.0, 0.06, vT)) * (1.0 - smoothstep(0.02, 1.0, vT)); // a boca (e a tampa, t = 0) mais fraca: de trás era o disco
  float a = edge * along * mix(1.0, tongues, smoothstep(0.1, 0.4, vT)) * (0.45 + 0.55 * vLevel) * mix(1.0, 0.75, smoothstep(0.7, 1.0, vAxis));
  gl_FragColor = vec4(c * uFlameGain * mix(1.15, 1.25, core) * a, a * uFlameCover);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
