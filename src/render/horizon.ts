// Horizonte próprio de uma pista (onda L, L4; docs/ondas/L/L4.md). Hoje só o do Rio de Janeiro (Copacabana): os morros — o Corcovado
// de topo plano, a serra da Tijuca, a Pedra da Gávea, os Dois Irmãos — e, na baía, o Pão de Açúcar com a Urca, o Leme, as Cagarras e
// Niterói ao fundo. É a mesma ideia dos três planos de montanha do `terrain.ts` (anéis que giram pelo rumo absoluto da pista, a névoa
// já assada na cor de cada vértice, sem névoa do three), mas com a silhueta autoral no lugar do ruído; a Q4 acrescenta uma pista por
// entrada em `HORIZONS`. Puro de DOM (só Three): as malhas e as cores se medem nos testes.
//
// Como ligar (na mescla, `terrain.ts`, que esta frente não toca): em `buildFar(p)`, depois dos anéis,
//   `this.horizon?.dispose(); this.horizon = buildHorizon(track.def.id, p, quality); if (this.horizon) this.farGroup.add(this.horizon);`
// (o `farGroup` já gira por `absHeading`; o `quality` vem do `setQuality` do renderizador). Opcional: esconder os anéis 1 e 2 genéricos
// do litoral (`ringMeshes`), que ficam atrás dos morros do Rio. Referencial = o dos anéis: azimute `a` → x = cos a · R, z = sin a · R;
// `a = −π/2` é a frente na largada, `0` a direita (o mar de Copacabana), `π` a esquerda. Os dados usam `rel`: graus a partir da frente na
// largada, para a direita (a geografia: Copacabana olhando para o Leme, o mar à direita, o Corcovado à esquerda).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Quality } from '../game/contracts';
import { atLeast } from '../game/quality';
import { ringFoliage } from './horizon-rings';
import { valueNoise } from './noise';
import type { Palette } from './palette';
import { applyGrade } from './stylize';

/** Os raios dos três planos do horizonte do `terrain.ts` (`LAYER_RADII`): perto, meio e longe. */
export const HORIZON_RADII = [470, 660, 920] as const;

export type RidgeKind = 'bell' | 'plateau' | 'twin' | 'block' | 'ridge';

export interface Ridge {
  name: string;
  /** Do lado da terra (esquerda e atrás) ou do mar (direita). */
  side: 'land' | 'sea';
  /** Centro: graus a partir da frente na largada, + = direita. */
  rel: number;
  /** Largura total (graus) e altura (m) no plano `layer`. */
  width: number;
  h: number;
  layer: 0 | 1 | 2;
  kind: RidgeKind;
  /** Quanto do topo é pedra nua (0..1): a Gávea e o Corcovado, sim; a Tijuca, mata. */
  granite?: number;
  /** Só neste degrau de qualidade (e nos de cima). */
  only?: 'ultra';
}

/** Os morros do Rio: ver o cabeçalho para a geografia. Altura exagerada (a névoa e a distância comem metade). */
export const RIO_RIDGES: readonly Ridge[] = [
  { name: 'corcovado', side: 'land', rel: -95, width: 42, h: 140, layer: 1, kind: 'plateau', granite: 0.35 },
  { name: 'tijuca', side: 'land', rel: -45, width: 90, h: 120, layer: 2, kind: 'ridge' },
  { name: 'gavea', side: 'land', rel: -156, width: 26, h: 150, layer: 1, kind: 'block', granite: 0.75 },
  { name: 'dois-irmaos', side: 'land', rel: -178, width: 34, h: 100, layer: 1, kind: 'twin', granite: 0.5 },
  { name: 'santa-teresa', side: 'land', rel: -70, width: 36, h: 50, layer: 0, kind: 'bell' },
  { name: 'leme', side: 'sea', rel: 24, width: 24, h: 58, layer: 0, kind: 'bell', granite: 0.2 },
  { name: 'niteroi', side: 'sea', rel: 78, width: 80, h: 50, layer: 2, kind: 'ridge', only: 'ultra' },
];

/** A baía: o Pão de Açúcar e a Urca (cúpulas de perfil de bala, `rx` = raio na base) e as ilhas das Cagarras. */
export const RIO_BAY = {
  pao: { rel: 44, h: 125, radius: 610, rx: 52 },
  urca: { rel: 51, h: 62, radius: 590, rx: 38 },
  islands: [
    { rel: 128, h: 13, radius: 780, rx: 20 },
    { rel: 136, h: 9, radius: 800, rx: 14 },
    { rel: 121, h: 8, radius: 770, rx: 12 },
  ],
} as const;

export interface HorizonDetail {
  /** Pontos por volta de cada anel. */
  points: number;
  /** O Pão e a Urca (média e acima), as ilhas (alta e acima) e Niterói ao fundo (Ultra). */
  bay: boolean;
  islands: boolean;
  far: boolean;
}

/** O que cada degrau de qualidade desenha (`atLeast`, src/game/quality.ts). */
export function horizonDetail(q: Quality): HorizonDetail {
  return {
    points: atLeast(q, 'ultra') ? 420 : atLeast(q, 'high') ? 300 : atLeast(q, 'medium') ? 200 : 120,
    bay: atLeast(q, 'medium'), islands: atLeast(q, 'high'), far: atLeast(q, 'ultra'),
  };
}

/** Azimute do anel (rad) de um `rel` em graus: a frente na largada é −π/2, a direita 0. */
export function relToAz(rel: number): number { return -Math.PI / 2 + (rel * Math.PI) / 180; }

const wrapDeg = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;
const smooth01 = (t: number): number => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
const bell = (u: number): number => (Math.abs(u) >= 1 ? 0 : (0.5 + 0.5 * Math.cos(Math.PI * Math.abs(u))) ** 1.15);

/** O formato de cada morro, 0..1, em u = distância ao centro ÷ meia largura (|u| ≥ 1 = 0). */
function shape(kind: RidgeKind, u: number, rel: number): number {
  const a = Math.abs(u);
  if (a >= 1) return 0;
  switch (kind) {
    case 'plateau': return 0.62 * smooth01((1 - a) / 0.6) + 0.38 * bell(u); // topo quase plano (o Corcovado), encosta de pedra
    case 'twin': return 0.92 * (bell((u - 0.4) / 0.62) + bell((u + 0.4) / 0.62)); // duas pontas, vale macio entre elas (sem `min`: o corte virava quina)
    case 'block': return (1 - a ** 2.4) ** 1.3; // bloco de encosta íngreme e topo largo
    case 'ridge': return bell(u) ** 0.7 * (0.8 + 0.2 * (valueNoise(77, rel / 4) * 0.5 + 0.5) * 1.25); // serra comprida e irregular
    default: return bell(u);
  }
}

/** Altura (m) do contorno do plano `layer` no azimute `az` (rad): a soma dos morros dele; `only` pede só os do degrau Ultra. */
export function ridgeHeight(layer: number, az: number, only?: 'ultra'): number {
  const rel = wrapDeg(((az + Math.PI / 2) * 180) / Math.PI);
  let h = 0;
  for (const r of RIO_RIDGES) {
    if (r.layer !== layer || (only === 'ultra') !== (r.only === 'ultra')) continue;
    h += r.h * shape(r.kind, wrapDeg(rel - r.rel) / (r.width / 2), rel);
  }
  // Um balanço de ±5% no topo (por camada), para a crista não parecer régua; fora dos morros continua zero.
  return h * (1 + 0.05 * valueNoise(31 + layer, rel / 7));
}

/** Quanto do topo é pedra nua (0..1) no azimute: a média dos morros, pelo peso do formato. */
function graniteAt(layer: number, az: number, only?: 'ultra'): number {
  const rel = wrapDeg(((az + Math.PI / 2) * 180) / Math.PI);
  let w = 0; let g = 0;
  for (const r of RIO_RIDGES) {
    if (r.layer !== layer || (only === 'ultra') !== (r.only === 'ultra')) continue;
    const s = shape(r.kind, wrapDeg(rel - r.rel) / (r.width / 2), rel);
    w += s; g += s * (r.granite ?? 0);
  }
  return w > 1e-6 ? g / w : 0;
}

const GREEN = new THREE.Color('#4f8f5a');
const GRANITE = new THREE.Color('#a9a59b');

/**
 * O horizonte do Rio: um grupo de malhas e a limpeza (`dispose`: geometrias e o material compartilhado). Cada malha leva a cor do período da pista (`color`) e a do período
 * seguinte (`colorB`; sem ele, a mesma): `setBlend(t)` mistura as duas por um uniforme (M6, a corrida que muda), sem material novo nem programa recompilado.
 */
export class Horizon extends THREE.Group {
  private readonly material: THREE.MeshBasicMaterial;
  readonly blend = { value: 0 };
  constructor(material: THREE.MeshBasicMaterial) {
    super(); this.name = 'horizon:rio'; this.material = material;
    // Compõe com o que o material já tem (a gradação do `applyGrade`): o callback e a chave de programa antigos continuam.
    const prev = material.onBeforeCompile; const prevKey = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderer) => {
      prev.call(material, shader, renderer);
      const chunk = THREE.ShaderChunk.color_vertex;
      if (!chunk.includes('vColor *= color;')) throw new Error('horizon: o three mudou o color_vertex (vColor *= color não achado)');
      shader.uniforms.uHorizonBlend = this.blend;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', () => '#include <common>\nattribute vec3 colorB;\nuniform float uHorizonBlend;')
        .replace('#include <color_vertex>', () => chunk.replace('vColor *= color;', 'vColor *= mix( color, colorB, uHorizonBlend );'));
    };
    material.customProgramCacheKey = () => `${prevKey.call(material)}|horizon-blend-v1`;
  }
  setBlend(t: number): void { this.blend.value = Math.max(0, Math.min(1, t)); }
  override dispose(): void {
    this.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    this.material.dispose();
  }
}

/** Cores do plano: topo (verde de mata, com a pedra) e o degradê para a névoa (a mesma conta do `buildRing`). */
function layerColors(p: Palette, layer: number): { top: THREE.Color; mid: THREE.Color; base: THREE.Color; fog: THREE.Color } {
  const fog = new THREE.Color(p.fog);
  const tone = new THREE.Color(p.layers[layer]).lerp(GREEN, 0.42);
  const haze = p.layerHaze[layer];
  return { top: tone.clone().lerp(fog, haze), mid: tone.clone().lerp(fog, Math.min(1, haze + 0.22)), base: tone.clone().lerp(fog, Math.min(1, haze + 0.55)), fog };
}

/**
 * Plano de morros: o contorno `ridgeHeight` em `points` pontos por volta, só onde há morro (o mar aberto não gasta triângulo).
 * Mesma forma do anel do terrain.ts: pé em −70 m (some na névoa), meio-fio da encosta para fora e topo para dentro.
 */
function ringMesh(name: string, layer: number, points: number, p: Palette, material: THREE.Material, only?: 'ultra'): THREE.Mesh {
  const R = HORIZON_RADII[layer];
  const { top, mid, base } = layerColors(p, layer);
  const pos: number[] = []; const col: number[] = [];
  const B = -70; const ro = 1.02; const ri = 0.975;
  const push = (x: number, y: number, z: number, k: THREE.Color, f = 1): void => { pos.push(x, y, z); col.push(k.r * f, k.g * f, k.b * f); };
  const hAt = (i: number): number => ridgeHeight(layer, ((i % points) / points) * Math.PI * 2, only);
  for (let i = 0; i < points; i++) {
    const a0 = (i / points) * Math.PI * 2; const a1 = ((i + 1) / points) * Math.PI * 2;
    const h0 = hAt(i); const h1 = hAt(i + 1);
    if (h0 < 0.4 && h1 < 0.4) continue;
    const x0 = Math.cos(a0) * R; const z0 = Math.sin(a0) * R; const x1 = Math.cos(a1) * R; const z1 = Math.sin(a1) * R;
    const m0 = h0 * 0.45; const m1 = h1 * 0.45;
    // A encosta que olha para a direita pega a luz (um toque, assado): f > 1 onde o contorno desce para a direita.
    const arc = (R * Math.PI * 2) / points;
    const f = 1 + 0.14 * Math.max(-1, Math.min(1, -(h1 - h0) / (arc * 1.2)));
    const g0 = graniteAt(layer, a0, only); const g1 = graniteAt(layer, a1, only);
    // V22/F3: o arvoredo e o cume (horizon-rings.ts) só onde há mata: a pedra nua (granito) fica lisa. Mesmo índice nas cores A e B (a corrida que muda).
    const f0 = ringFoliage('coast', layer, i, points); const f1 = ringFoliage('coast', layer, i + 1, points);
    const k0 = 1 + (f0.shade * f0.crest - 1) * (1 - g0); const k1 = 1 + (f1.shade * f1.crest - 1) * (1 - g1);
    const t0 = top.clone().lerp(GRANITE, g0 * 0.75).multiplyScalar(k0); const t1 = top.clone().lerp(GRANITE, g1 * 0.75).multiplyScalar(k1);
    const mc = mid.clone().lerp(top, 0.35);
    push(x0 * ro, B, z0 * ro, base); push(x1 * ro, B, z1 * ro, base); push(x0 * ro, m0, z0 * ro, mid, f);
    push(x1 * ro, B, z1 * ro, base); push(x1 * ro, m1, z1 * ro, mid, f); push(x0 * ro, m0, z0 * ro, mid, f);
    push(x0 * ro, m0, z0 * ro, mc, f); push(x1 * ro, m1, z1 * ro, mc, f); push(x0 * ri, h0, z0 * ri, t0, f);
    push(x1 * ro, m1, z1 * ro, mc, f); push(x1 * ri, h1, z1 * ri, t1, f); push(x0 * ri, h0, z0 * ri, t0, f);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(g, material);
  mesh.name = name; mesh.frustumCulled = false; mesh.renderOrder = -5 + (2 - layer);
  return mesh;
}

/**
 * Cúpula de perfil de bala (o Pão de Açúcar, a Urca, uma ilha): raio R(y) = rx·(1 − (y/h)^2,2)^0,5 acima da água, pé a −70 m (some na
 * névoa), `sides` gomos e `rings` anéis. Cor por altura: pé na névoa, granito no meio, mata no cocuruto. Posta a `radius` m, no `rel`.
 */
function domeGeometry(spec: { h: number; radius: number; rx: number }, p: Palette, sides: number, rings: number): THREE.BufferGeometry {
  const { fog } = layerColors(p, 1);
  const haze = Math.min(1, p.layerHaze[1] + (spec.radius > 700 ? 0.15 : 0));
  const stone = GRANITE.clone().lerp(new THREE.Color(p.layers[0]), 0.3).lerp(fog, haze * 0.75);
  const cap = new THREE.Color(p.layers[0]).lerp(GREEN, 0.7).lerp(fog, haze * 0.75);
  const foot = stone.clone().lerp(fog, 0.6);
  const ys: number[] = [-70, -20, 0];
  for (let k = 1; k <= rings; k++) ys.push(spec.h * (1 - (1 - k / rings) ** 1.6));
  const pts = ys.map((y) => new THREE.Vector2(Math.max(0.05, y >= 0 ? spec.rx * (1 - (y / spec.h) ** 2.2) ** 0.5 : spec.rx * (y === -70 ? 1.25 : 1.1)), y));
  const g = new THREE.LatheGeometry(pts, sides);
  const ni = g.toNonIndexed(); g.dispose();
  const pos = ni.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, pos.getY(i) / spec.h));
    const under = pos.getY(i) < 0 ? smooth01(-pos.getY(i) / 40) : 0;
    c.copy(stone).lerp(cap, smooth01((t - 0.78) / 0.14)).lerp(foot, under);
    // luz de um lado só (a direita): o lado de lá do Pão fica um pouco mais escuro, assado
    const side = Math.max(-1, Math.min(1, pos.getX(i) / Math.max(1, spec.rx)));
    const f = 1 + 0.12 * side;
    col[i * 3] = c.r * f; col[i * 3 + 1] = c.g * f; col[i * 3 + 2] = c.b * f;
  }
  ni.deleteAttribute('normal'); ni.deleteAttribute('uv');
  ni.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ni;
}

/** A cúpula como malha própria, posta no azimute e no raio dela (o Pão e a Urca). */
function domeMesh(name: string, spec: { rel: number; h: number; radius: number; rx: number }, p: Palette, material: THREE.Material, sides: number, rings: number): THREE.Mesh {
  const mesh = new THREE.Mesh(domeGeometry(spec, p, sides, rings), material);
  const az = relToAz(spec.rel);
  mesh.position.set(Math.cos(az) * spec.radius, 0, Math.sin(az) * spec.radius);
  mesh.name = name; mesh.frustumCulled = false; mesh.renderOrder = -4;
  return mesh;
}

/** Uma entrada por pista com paisagem própria (a Q4 acrescenta as outras). */
const HORIZONS: Readonly<Record<string, (p: Palette, q: Quality, material: THREE.MeshBasicMaterial) => THREE.Object3D[]>> = {
  copacabana: (p, q, material) => {
    const d = horizonDetail(q);
    const out: THREE.Object3D[] = [2, 1, 0].map((l) => ringMesh(`horizon:layer-${l}`, l, d.points, p, material));
    if (d.bay) {
      out.push(domeMesh('horizon:pao-de-acucar', RIO_BAY.pao, p, material, 14, 9));
      out.push(domeMesh('horizon:urca', RIO_BAY.urca, p, material, 12, 6));
    }
    if (d.islands) {
      // as três ilhas das Cagarras numa malha só (posições assadas no mundo)
      const geos = RIO_BAY.islands.map((s) => {
        const g = domeGeometry(s, p, 8, 3);
        const az = relToAz(s.rel);
        return g.translate(Math.cos(az) * s.radius, 0, Math.sin(az) * s.radius);
      });
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (merged) {
        const mesh = new THREE.Mesh(merged, material);
        mesh.name = 'horizon:cagarras'; mesh.frustumCulled = false; mesh.renderOrder = -4;
        out.push(mesh);
      }
    }
    if (d.far) out.push(ringMesh('horizon:niteroi', 2, d.points, p, material, 'ultra'));
    return out;
  },
};

/**
 * O horizonte da pista (ou `null` sem paisagem própria). `palette` dá as cores dos planos e a névoa (a noite escurece sozinha) e `quality` o
 * degrau (`horizonDetail`). Quem recebe é dono: `dispose()` ao trocar de pista ou de qualidade.
 */
export function buildHorizon(trackId: string, palette: Palette, quality: Quality, paletteTo?: Palette): Horizon | null {
  const make = HORIZONS[trackId];
  if (!make) return null;
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
  applyGrade(material);
  const h = new Horizon(material);
  const meshes = make(palette, quality, material);
  // A segunda cor por vértice (M6): o mesmo horizonte pintado com a paleta do período seguinte (a geometria só depende da qualidade). Sem ela, `colorB` é a própria cor.
  const other = paletteTo ? make(paletteTo, quality, new THREE.MeshBasicMaterial()) : null;
  meshes.forEach((o, i) => {
    const m = o as THREE.Mesh;
    const color = m.geometry.getAttribute('color');
    const b = other?.[i] as THREE.Mesh | undefined;
    m.geometry.setAttribute('colorB', b ? new THREE.BufferAttribute((b.geometry.getAttribute('color').array as Float32Array).slice(), 3) : color);
    h.add(o);
  });
  if (other) for (const o of other) { const m = o as THREE.Mesh; m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
  return h;
}
