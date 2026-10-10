// Conversor de carro "paleta de swatches" (Kenney Car Kit, CC0) para o contrato do asset do jogo
// (docs/CONTRATO-DO-ASSET.md). Sem Blender neste ambiente, este é o passo de limpeza:
//  - o arquivo do Kenney é UMA malha por peça (`body`, `spoiler`, `wheel-*`) com UM material (o `colormap.png`, 512²) e a cor
//    de cada face vem de qual swatch (16 colunas × 4 linhas) a UV pisa. A RECEITA abaixo diz que papel cada swatch tem;
//  - cada papel vira um material com o NOME da convenção (`paint`, `accent`, `headlight`, `taillight`, `glass`, `trim`, `tire`,
//    `rim`, `plate`), todos com o mesmo atlas (256², a paleta reduzida) e a UV dos swatches; a face pintável aponta para o swatch
//    BRANCO (o jogo multiplica pela cor do carro), conservando a posição dentro do swatch (o degradê é a luz assada do Kenney);
//  - o casco é escalado POR EIXO até a pegada do jogo (o Kenney é estreito); as rodas, uniformemente (redondas e maiores: a
//    direção de arte pede roda grande) em torno do próprio centro, no chão;
//  - nós do contrato: lod0 (casco), lod1 (casco simplificado, meshoptimizer do three), wheel_*, exhaust_l/r e seat.
// Um swatch que a receita não conhece vira `trim` (peça fixa) e entra no relatório: o próximo carro do kit estende a tabela.
// Só para scripts e testes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';
import { installNodeImage } from './node-image';
import { writeGlb, type GlbMaterial, type GlbNode, type GlbPrimitive } from './glb-write';
import { decodePng, encodePng } from './png';

export type Role = 'paint' | 'accent' | 'headlight' | 'taillight' | 'glass' | 'trim' | 'tire' | 'rim' | 'plate';

/** O colormap do Kenney: 16 colunas × 4 linhas de swatches (32 × 128 px em 512²), degradê na vertical. */
const COLS = 16;
const ROWS = 4;
/** Swatch BRANCO (coluna, linha) para onde a pintura aponta. */
const WHITE_CELL: readonly [number, number] = [12, 2];

/** Receita do `colormap` do Kenney Car Kit 3.1: swatch "coluna,linha" → papel. O que não está aqui vira `trim` + aviso. */
export const KENNEY_ROLES: Readonly<Record<string, Role>> = {
  '13,1': 'paint', // laranja-vermelho da lataria
  '3,3': 'headlight', // amarelo
  '5,3': 'taillight', // vermelho
  '1,3': 'glass', // azul-claro das janelas
  '7,2': 'trim', // cinza-azulado: a saia e as caixas de roda (peça fixa, sem metal; NÃO é vidro: refletiria o céu)
  '5,2': 'trim', // cinza-escuro: soleira, para-choques, e nas rodas o pneu (ver roleOf)
  '11,2': 'rim', // cinza-claro azulado do aro
  '13,2': 'plate', // quase branco: placa, frisos
};

export interface KenneyScale { x: number; y: number; z: number }
export interface ConvertOptions {
  /** Escala por eixo do casco (padrão: 1,46 × 1,35 × 1,725 → ~4,4 × 1,9 × 1,5 m a partir do sedan-sports de 2,55 × 1,3 × 1,1). */
  body?: KenneyScale;
  /** Escala uniforme da roda (padrão 1,4: o raio vai de 0,30 para 0,42 m). */
  wheelScale?: number;
  /** Alvo do LOD1: fração dos triângulos do lod0 (padrão 0,45; o contrato pede ≤ 0,5). */
  lod1Ratio?: number;
  /** Peça do casco (nome do nó do Kenney) que recebe o papel `accent` no lugar de `paint` (padrão `spoiler`). */
  accentPart?: string;
}

export interface ConvertReport {
  triangles: { lod0: number; lod1: number; wheel: number };
  /** Swatches fora da receita: viraram `trim`. */
  unmapped: Array<{ cell: string; rgb: [number, number, number]; triangles: number }>;
  roles: Record<string, number>;
  size: { x: number; y: number; z: number };
}

const WHEELS: ReadonlyArray<readonly [string, string]> = [
  ['wheel-front-left', 'wheel_fl'], ['wheel-front-right', 'wheel_fr'], ['wheel-back-left', 'wheel_rl'], ['wheel-back-right', 'wheel_rr'],
];

const MATERIALS: Record<Role, Omit<GlbMaterial, 'name' | 'map'>> = {
  paint: { roughness: 0.4, metalness: 0.04 },
  accent: { roughness: 0.4, metalness: 0.04 },
  headlight: { roughness: 0.15, emissive: [1, 0.96, 0.88] },
  taillight: { roughness: 0.18, emissive: [1, 0.15, 0.08] },
  glass: { roughness: 0.05, metalness: 0.72 },
  trim: { roughness: 0.72 },
  tire: { roughness: 0.94 },
  rim: { roughness: 0.3, metalness: 0.9 },
  plate: { roughness: 0.55 },
};
const ROLE_ORDER: readonly Role[] = ['paint', 'accent', 'glass', 'trim', 'plate', 'headlight', 'taillight', 'tire', 'rim'];

interface Tri { p: number[]; n: number[]; uv: number[]; role: Role }

function roleOf(cell: string, part: string, recipe: Readonly<Record<string, Role>>, accentPart: string, unmapped: Map<string, { cell: string; rgb: [number, number, number]; triangles: number }>, rgb: [number, number, number]): Role {
  const role = recipe[cell];
  if (!role) {
    const u = unmapped.get(cell) ?? { cell, rgb, triangles: 0 };
    u.triangles++; unmapped.set(cell, u);
    return part.startsWith('wheel') ? 'tire' : 'trim';
  }
  if (part.startsWith('wheel') && role === 'trim') return 'tire'; // o cinza-escuro da roda é o pneu
  if (role === 'paint' && part === accentPart) return 'accent';
  return role;
}

/** Atlas 512² → 256² (média 2 × 2): os swatches continuam alinhados (32 → 16 px por coluna). */
function halve(rgba: Uint8Array, size: number): Uint8Array {
  const h = size / 2;
  const out = new Uint8Array(h * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < h; x++) {
      for (let c = 0; c < 4; c++) {
        const s = rgba[((2 * y) * size + 2 * x) * 4 + c] + rgba[((2 * y) * size + 2 * x + 1) * 4 + c] + rgba[((2 * y + 1) * size + 2 * x) * 4 + c] + rgba[((2 * y + 1) * size + 2 * x + 1) * 4 + c];
        out[(y * h + x) * 4 + c] = Math.round(s / 4);
      }
    }
  }
  return out;
}

/** Primitiva indexada por papel a partir de triângulos soltos (solda posição+normal+UV iguais). */
function primitiveOf(tris: Tri[], material: number): { positions: number[]; normals: number[]; uvs: number[]; indices: number[]; material: number } {
  const key = new Map<string, number>();
  const positions: number[] = []; const normals: number[] = []; const uvs: number[] = []; const indices: number[] = [];
  const q = (v: number) => Math.round(v * 1e5);
  for (const t of tris) {
    for (let k = 0; k < 3; k++) {
      const p = t.p.slice(k * 3, k * 3 + 3); const n = t.n.slice(k * 3, k * 3 + 3); const uv = t.uv.slice(k * 2, k * 2 + 2);
      const id = `${p.map(q)}|${n.map(q)}|${uv.map(q)}`;
      let i = key.get(id);
      if (i === undefined) { i = positions.length / 3; key.set(id, i); positions.push(...p); normals.push(...n); uvs.push(...uv); }
      indices.push(i);
    }
  }
  return { positions, normals, uvs, indices, material };
}

/** Reduz a primitiva ao alvo de triângulos (meshoptimizer; a posição guia o erro, a UV/normal seguem o vértice que fica). */
function simplifyPrimitive(p: ReturnType<typeof primitiveOf>, ratio: number): ReturnType<typeof primitiveOf> {
  const goal = Math.max(3, Math.floor((p.indices.length / 3) * ratio) * 3);
  if (goal >= p.indices.length) return p;
  const [out] = MeshoptSimplifier.simplify(new Uint32Array(p.indices), new Float32Array(p.positions), 3, goal, 1, []);
  return { ...p, indices: [...out] };
}

export async function convertKenneyCar(input: { glb: Buffer | Uint8Array; colormap: Buffer | Uint8Array }, opts: ConvertOptions = {}): Promise<{ glb: Buffer; report: ConvertReport }> {
  installNodeImage();
  await MeshoptSimplifier.ready;
  const scale = opts.body ?? { x: 1.46, y: 1.35, z: 1.725 };
  const wheelScale = opts.wheelScale ?? 1.4;
  const ratio = opts.lod1Ratio ?? 0.45;
  const accentPart = opts.accentPart ?? 'spoiler';

  const map = decodePng(input.colormap);
  if (map.width !== 512 || map.height !== 512) throw new Error(`o colormap do Kenney tem 512 × 512 (veio ${map.width} × ${map.height})`);
  const gltf = await new GLTFLoader().parseAsync(new Uint8Array(input.glb).buffer as ArrayBuffer, '');
  gltf.scene.updateMatrixWorld(true);

  const unmapped = new Map<string, { cell: string; rgb: [number, number, number]; triangles: number }>();
  const bodyTris: Tri[] = []; const wheelTris = new Map<string, { tris: Tri[]; center: THREE.Vector3 }>();
  const v = new THREE.Vector3(); const nv = new THREE.Vector3();
  const cw = 1 / COLS; const ch = 1 / ROWS;
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const part = mesh.name;
    const wheel = WHEELS.find(([from]) => from === part);
    const geo = mesh.geometry;
    const pos = geo.getAttribute('position'); const nor = geo.getAttribute('normal'); const uvA = geo.getAttribute('uv'); const idx = geo.getIndex();
    if (!uvA) throw new Error(`a malha ${part} não tem UV`);
    // Mundo do Kenney (frente +Z, esquerda +X): o casco é escalado por eixo; a roda fica no próprio centro (o centro vai ao nó).
    let center = new THREE.Vector3();
    if (wheel) center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
    const count = (idx ? idx.count : pos.count) / 3;
    const tris: Tri[] = [];
    for (let t = 0; t < count; t++) {
      const at = (k: number) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
      const p: number[] = []; const n: number[] = []; const uv: number[] = [];
      let uc = 0; let vc = 0;
      for (let k = 0; k < 3; k++) {
        const i = at(k);
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        nv.fromBufferAttribute(nor, i).transformDirection(mesh.matrixWorld);
        if (wheel) { v.sub(center).multiplyScalar(wheelScale); n.push(nv.x, nv.y, nv.z); } else {
          v.set(v.x * scale.x, v.y * scale.y, v.z * scale.z);
          // normal de uma escala por eixo: multiplica pelo inverso e renormaliza
          nv.set(nv.x / scale.x, nv.y / scale.y, nv.z / scale.z).normalize(); n.push(nv.x, nv.y, nv.z);
        }
        p.push(v.x, v.y, v.z);
        uv.push(uvA.getX(i), uvA.getY(i));
        uc += uvA.getX(i) / 3; vc += uvA.getY(i) / 3;
      }
      const cx = Math.min(COLS - 1, Math.floor(uc * COLS)); const cy = Math.min(ROWS - 1, Math.floor(vc * ROWS));
      const px = Math.min(511, Math.floor(uc * 512)); const py = Math.min(511, Math.floor(vc * 512));
      const rgb: [number, number, number] = [map.rgba[(py * 512 + px) * 4], map.rgba[(py * 512 + px) * 4 + 1], map.rgba[(py * 512 + px) * 4 + 2]];
      const role = roleOf(`${cx},${cy}`, part, KENNEY_ROLES, accentPart, unmapped, rgb);
      if (role === 'paint' || role === 'accent') {
        // Pintura: a UV vai para o swatch branco, na mesma posição dentro do swatch.
        for (let k = 0; k < 3; k++) { uv[k * 2] += (WHITE_CELL[0] - cx) * cw; uv[k * 2 + 1] += (WHITE_CELL[1] - cy) * ch; }
      }
      tris.push({ p, n, uv, role });
    }
    if (wheel) wheelTris.set(wheel[1], { tris, center });
    else bodyTris.push(...tris);
  });
  for (const [, to] of WHEELS) if (!wheelTris.has(to)) throw new Error(`falta a roda ${to} no arquivo do Kenney`);

  const roleIndex = (r: Role) => ROLE_ORDER.indexOf(r);
  const byRole = (tris: Tri[]) => {
    const m = new Map<Role, Tri[]>();
    for (const t of tris) m.set(t.role, [...(m.get(t.role) ?? []), t]);
    return ROLE_ORDER.filter((r) => m.has(r)).map((r) => primitiveOf(m.get(r) as Tri[], roleIndex(r)));
  };
  const lod0 = byRole(bodyTris);
  const lod1 = lod0.map((p) => simplifyPrimitive(p, ratio));
  const tri = (ps: readonly GlbPrimitive[]) => ps.reduce((s, p) => s + (p.indices?.length ?? p.positions.length / 3) / 3, 0);

  // Casco no chão: o Kenney já tem y = 0 embaixo; o centro das rodas vai a y = raio (a roda encosta no chão).
  const wheelNodes: GlbNode[] = WHEELS.map(([, to]) => {
    const w = wheelTris.get(to) as { tris: Tri[]; center: THREE.Vector3 };
    const radius = 0.3 * wheelScale; // o Kenney tem roda de raio 0,30 sobre y = 0
    return {
      name: to, translation: [w.center.x * scale.x, radius, w.center.z * scale.z] as const,
      mesh: byRole(w.tris),
    };
  });

  const bodyBox = new THREE.Box3();
  for (const p of lod0) for (let i = 0; i < p.positions.length; i += 3) bodyBox.expandByPoint(v.set(p.positions[i], p.positions[i + 1], p.positions[i + 2]));
  const size = bodyBox.getSize(new THREE.Vector3());
  const rearZ = bodyBox.min.z;

  const materials: GlbMaterial[] = ROLE_ORDER.map((r) => ({ name: r, map: 0, ...MATERIALS[r] }));
  const nodes: GlbNode[] = [
    { name: 'lod0', children: [{ name: 'body', mesh: lod0 }] },
    { name: 'lod1', children: [{ name: 'body', mesh: lod1 }] },
    ...wheelNodes,
    { name: 'exhaust_l', translation: [0.42, 0.4, rearZ + 0.04] }, { name: 'exhaust_r', translation: [-0.42, 0.4, rearZ + 0.04] },
    { name: 'seat', translation: [0.25, bodyBox.max.y * 0.62, -0.05] },
  ];
  const atlas = encodePng(256, 256, halve(map.rgba, 512));
  const glb = writeGlb({ nodes: [{ name: 'car', children: nodes }], materials, images: [atlas] });

  const roles: Record<string, number> = {};
  for (const t of bodyTris) roles[t.role] = (roles[t.role] ?? 0) + 1;
  return {
    glb,
    report: {
      triangles: { lod0: tri(lod0), lod1: tri(lod1), wheel: tri(wheelNodes[1].mesh ?? []) },
      unmapped: [...unmapped.values()], roles, size: { x: size.x, y: size.y, z: size.z },
    },
  };
}
