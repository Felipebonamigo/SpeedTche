// Estrelinhas da batida (M4): três estrelas de cinco pontas girando sobre o teto do carro por ~0,9 s (cartum: "viu estrelas").
// A geometria e a pose de cada uma são puras (testáveis sem GL); `Cars` só liga as instâncias.
import * as THREE from 'three';
import { STARS_SECONDS } from './motion';

/** Quantas estrelas por carro. */
export const STARS_PER_CAR = 3;
/** Cores das estrelas (amarelo, creme, âmbar), uma por posição na órbita. */
export const STAR_COLORS: readonly string[] = ['#ffd23f', '#fff2a8', '#ffb347'];

/** Raio da órbita (m) e velocidade angular (rad/s). */
const ORBIT_R = 0.62;
const ORBIT_W = 7;

/**
 * Estrela de cinco pontas no plano xy (raio externo 1, interno 0,45), com espessura 0,3 em z: lê de qualquer lado.
 * Frente, costas e as dez faces do contorno.
 */
export function buildStarGeometry(): THREE.BufferGeometry {
  const ring: Array<[number, number]> = [];
  for (let k = 0; k < 10; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 === 0 ? 1 : 0.45;
    ring.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const h = 0.15;
  const pos: number[] = [];
  const tri = (a: readonly number[], b: readonly number[], c: readonly number[]) => pos.push(...a, ...b, ...c);
  for (let k = 0; k < 10; k++) {
    const [x0, y0] = ring[k]; const [x1, y1] = ring[(k + 1) % 10];
    // frente (+z) e costas (−z) em leque pelo centro; contorno em dois triângulos
    tri([0, 0, h], [x0, y0, h], [x1, y1, h]);
    tri([0, 0, -h], [x1, y1, -h], [x0, y0, -h]);
    tri([x0, y0, h], [x0, y0, -h], [x1, y1, -h]);
    tri([x0, y0, h], [x1, y1, -h], [x1, y1, h]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

export interface StarPose { x: number; y: number; z: number; scale: number; roll: number }

/**
 * Pose da estrela `k` (0..2), `t` segundos depois da batida, sobre um carro de `height` m de teto, no referencial do carro
 * (sem o rumo: a órbita é um círculo). Cresce nos primeiros 0,1 s e some nos últimos 0,2 s. Fora de [0, STARS_SECONDS) = escala 0.
 */
export function starPose(k: number, t: number, height: number, out: StarPose = { x: 0, y: 0, z: 0, scale: 0, roll: 0 }): StarPose {
  const a = t * ORBIT_W + (k * Math.PI * 2) / STARS_PER_CAR;
  const grow = Math.min(1, t / 0.1);
  const fade = Math.min(1, (STARS_SECONDS - t) / 0.2);
  out.x = Math.cos(a) * ORBIT_R;
  out.z = Math.sin(a) * ORBIT_R * 0.8;
  out.y = height + 0.45 + 0.06 * Math.sin(t * 11 + k * 2.1);
  out.scale = t < 0 || t >= STARS_SECONDS ? 0 : 0.2 * Math.max(0, Math.min(grow, fade));
  out.roll = t * 6 + k;
  return out;
}
