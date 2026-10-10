// Carro de caixas na convenção do contrato do asset (docs/CONTRATO-DO-ASSET.md): o menor .glb que usa TODOS os nós e
// recursos que o validador confere — `lod0`/`lod1`, `wheel_*` (com malha), `exhaust_*`, `seat`, `kit_<peça>_<nível>`,
// `decal_*`, atlas de paleta 256² com UV e normal map opcional. Serve de fixture aos testes (com opções para quebrar
// uma regra de cada vez) e prova o caminho de `npm run check-car` sem depender de arte de ninguém:
//   npx tsx scripts/make-test-car.ts [saida.glb]
// Convenção do glTF: metros, +Y para cima, frente em +Z, esquerda em +X.
import { encodePng } from './png';
import { writeGlb, type GlbMaterial, type GlbNode, type GlbPrimitive } from './glb-write';

export interface TestCarOptions {
  /** Malhas com UV no atlas (padrão: sim). */
  uv?: boolean;
  /** Lado do atlas em pixels; 0 = sem atlas (cor só pelo material). Padrão 256. */
  atlas?: number;
  /** Um 2º atlas (outra imagem) no material da cabine. */
  secondAtlas?: boolean;
  normalMap?: boolean;
  /** `lod0` e `lod1` de topo (padrão: sim). Sem LOD, o casco fica sob `body` na raiz; `'so-lod1'` = o `lod1` sem o `lod0` (defeito). */
  lod?: boolean | 'so-lod1';
  /** Caixas a mais no `lod1` (padrão 0; o lod1 padrão é a metade do lod0 ou menos). */
  lod1Extra?: number;
  /** Quantos vazios `seat` (padrão 1). */
  seats?: number;
  /** Nomes dos nós `kit_*` (padrão: três níveis do motor e o turbo 1). */
  kits?: readonly string[];
  /** `decal_*`: nome, e se a malha tem UV (padrão sim) e é plana (padrão sim). */
  decals?: ReadonlyArray<{ name: string; uv?: boolean; flat?: boolean }>;
  /** Eixo do cilindro da roda: `x` (padrão, certo) ou `y` (deitada: o validador acusa). */
  wheelAxis?: 'x' | 'y';
  /** Raio da roda (padrão 0,36). */
  wheelRadius?: number;
  /** Quanto o aro da roda sai para fora do pneu (m): deixa a roda assimétrica, para o teste ver qual lado é o de fora. */
  wheelOuterShift?: number;
}

const CELL = 16; // atlas de 16 × 16 swatches
/** Swatches do atlas de teste, por papel: (coluna, linha). A pintura é BRANCA: o jogo multiplica pela cor do carro. */
export const TEST_SWATCH = { paint: [0, 0], trim: [1, 0], glass: [2, 0], headlight: [3, 0], taillight: [4, 0], tire: [5, 0], rim: [6, 0], decal: [7, 0] } as const;
const SWATCH_COLOR: Record<keyof typeof TEST_SWATCH, [number, number, number]> = {
  paint: [255, 255, 255], trim: [34, 36, 42], glass: [44, 61, 85], headlight: [255, 246, 224],
  taillight: [255, 38, 22], tire: [20, 20, 22], rim: [185, 190, 198], decal: [240, 200, 40],
};

/** Atlas de paleta (PNG de `size`² com uma cor chapada por swatch). */
export function testAtlasPng(size = 256): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  const cell = size / CELL;
  const colors = Object.entries(TEST_SWATCH).map(([k, [cx, cy]]) => ({ cx, cy, rgb: SWATCH_COLOR[k as keyof typeof TEST_SWATCH] }));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cell); const cy = Math.floor(y / cell);
      const c = colors.find((s) => s.cx === cx && s.cy === cy)?.rgb ?? [128, 128, 128];
      const i = (y * size + x) * 4;
      rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

type Role = keyof typeof TEST_SWATCH;
const uvOf = (role: Role): [number, number] => [(TEST_SWATCH[role][0] + 0.5) / CELL, (TEST_SWATCH[role][1] + 0.5) / CELL];

const FACES: ReadonlyArray<{ n: [number, number, number]; v: ReadonlyArray<[number, number, number]> }> = [
  { n: [1, 0, 0], v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];

/** Caixa (12 triângulos, normais por face, UV no centro do swatch do papel). */
function box(material: number, role: Role, c: readonly [number, number, number], s: readonly [number, number, number], uv: boolean): GlbPrimitive {
  const positions: number[] = []; const normals: number[] = []; const uvs: number[] = []; const indices: number[] = [];
  const [u, v] = uvOf(role);
  FACES.forEach((f, k) => {
    for (const p of f.v) { positions.push(c[0] + (p[0] * s[0]) / 2, c[1] + (p[1] * s[1]) / 2, c[2] + (p[2] * s[2]) / 2); normals.push(...f.n); uvs.push(u, v); }
    indices.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
  });
  return { positions, normals, ...(uv ? { uvs } : {}), indices, material };
}

/** Roda: cilindro de 12 lados com o eixo em x (certo) ou y, centro na origem do nó. */
function wheelMesh(material: number, role: Role, r: number, width: number, axis: 'x' | 'y', uv: boolean, shift = 0): GlbPrimitive {
  const positions: number[] = []; const normals: number[] = []; const uvs: number[] = []; const indices: number[] = [];
  const [u, v] = uvOf(role);
  const N = 12;
  const at = (a: number, h0: number, rad: number): [number, number, number] => {
    const h = h0 + shift;
    const p = [h, Math.cos(a) * rad, Math.sin(a) * rad] as [number, number, number];
    return axis === 'x' ? p : [p[1], p[0], p[2]];
  };
  const dir = (a: number): [number, number, number] => (axis === 'x' ? [0, Math.cos(a), Math.sin(a)] : [Math.cos(a), 0, Math.sin(a)]);
  const push = (p: [number, number, number], n: [number, number, number]) => { positions.push(...p); normals.push(...n); uvs.push(u, v); return positions.length / 3 - 1; };
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2; const a1 = ((k + 1) / N) * Math.PI * 2;
    const i = positions.length / 3;
    push(at(a0, -width / 2, r), dir(a0)); push(at(a1, -width / 2, r), dir(a1)); push(at(a1, width / 2, r), dir(a1)); push(at(a0, width / 2, r), dir(a0));
    indices.push(i, i + 2, i + 1, i, i + 3, i + 2);
    for (const side of [-1, 1]) {
      const c = push(at(0, (side * width) / 2, 0), axis === 'x' ? [side, 0, 0] : [0, side, 0]);
      const p0 = push(at(a0, (side * width) / 2, r), axis === 'x' ? [side, 0, 0] : [0, side, 0]);
      const p1 = push(at(a1, (side * width) / 2, r), axis === 'x' ? [side, 0, 0] : [0, side, 0]);
      indices.push(...(side > 0 ? [c, p1, p0] : [c, p0, p1]));
    }
  }
  return { positions, normals, ...(uv ? { uvs } : {}), indices, material };
}

/** O .glb do carro de caixas. */
export function buildTestCar(o: TestCarOptions = {}): Buffer {
  const uv = o.uv ?? true;
  const atlasSize = o.atlas ?? 256;
  const withAtlas = atlasSize > 0;
  const images: Buffer[] = withAtlas ? [testAtlasPng(atlasSize)] : [];
  if (withAtlas && o.secondAtlas) images.push(testAtlasPng(atlasSize));
  if (withAtlas && o.normalMap) images.push(testAtlasPng(atlasSize));
  const normalIndex = o.normalMap ? images.length - 1 : undefined;
  const mat = (name: string, role: Role, extra: Partial<GlbMaterial> = {}): GlbMaterial => ({
    name, ...(withAtlas ? { map: 0 } : { color: [SWATCH_COLOR[role][0] / 255, SWATCH_COLOR[role][1] / 255, SWATCH_COLOR[role][2] / 255, 1] as const }),
    ...(normalIndex !== undefined && name === 'paint' ? { normalMap: normalIndex } : {}), ...extra,
  });
  const materials: GlbMaterial[] = [
    mat('paint', 'paint', { roughness: 0.4 }), // 0
    mat('trim', 'trim'), // 1
    mat('glass', 'glass', withAtlas && o.secondAtlas ? { map: 1 } : {}), // 2
    mat('headlight', 'headlight', { emissive: [1, 0.96, 0.88] }), // 3
    mat('taillight', 'taillight', { emissive: [1, 0.15, 0.08] }), // 4
    mat('tire', 'tire', { roughness: 0.94 }), // 5
    mat('rim', 'rim', { metalness: 0.9, roughness: 0.3 }), // 6
    mat('decal', 'decal'), // 7
  ];

  const lod0Parts: GlbPrimitive[] = [
    box(0, 'paint', [0, 0.7, 0], [1.86, 0.62, 4.3], uv), // lataria
    box(2, 'glass', [0, 1.2, -0.2], [1.5, 0.5, 2.0], uv), // cabine
    box(1, 'trim', [0, 0.38, 0], [1.7, 0.16, 4.1], uv), // soleira
    box(3, 'headlight', [0.6, 0.8, 2.16], [0.34, 0.14, 0.06], uv), box(3, 'headlight', [-0.6, 0.8, 2.16], [0.34, 0.14, 0.06], uv),
    box(4, 'taillight', [0.6, 0.8, -2.16], [0.34, 0.14, 0.06], uv), box(4, 'taillight', [-0.6, 0.8, -2.16], [0.34, 0.14, 0.06], uv),
    box(1, 'trim', [0, 0.45, 2.1], [1.6, 0.08, 0.3], uv), // spoiler baixo (para-choque dianteiro)
    box(1, 'trim', [0, 1.0, -1.9], [1.6, 0.06, 0.4], uv), // aerofólio
  ];
  const lod1Parts: GlbPrimitive[] = [
    box(0, 'paint', [0, 0.7, 0], [1.86, 0.62, 4.3], uv),
    box(2, 'glass', [0, 1.2, -0.2], [1.5, 0.5, 2.0], uv),
    box(3, 'headlight', [0, 0.8, 2.16], [1.4, 0.14, 0.06], uv),
    box(4, 'taillight', [0, 0.8, -2.16], [1.4, 0.14, 0.06], uv),
    ...Array.from({ length: o.lod1Extra ?? 0 }, (_, i) => box(1, 'trim', [0, 0.4 + i * 0.01, 0], [1.7, 0.05, 4], uv)),
  ];

  const r = o.wheelRadius ?? 0.36;
  // O aro sai para o lado de fora: +x no glTF para a roda da esquerda (x > 0), −x para a da direita.
  const wheel = (name: string, x: number, z: number): GlbNode => ({
    name, translation: [x, r, z],
    mesh: [wheelMesh(5, 'tire', r, 0.26, o.wheelAxis ?? 'x', uv), wheelMesh(6, 'rim', r * 0.6, 0.28, o.wheelAxis ?? 'x', uv, Math.sign(x) * (o.wheelOuterShift ?? 0))],
  });
  const kits = (o.kits ?? ['kit_engine_1', 'kit_engine_2', 'kit_engine_3', 'kit_turbo_1']).map((name, i): GlbNode => ({
    name, translation: [0, 0.98, 1.4], mesh: [box(1, 'trim', [0.0 + i * 0.02, 0, 0], [0.5, 0.2, 0.5], uv)],
  }));
  const decals = (o.decals ?? [{ name: 'decal_numero' }]).map((d): GlbNode => ({
    name: d.name, translation: [0.94, 0.8, 0],
    mesh: [{
      positions: d.flat === false ? [0, -0.2, -0.2, 0, -0.2, 0.2, 0.3, 0.2, 0.2, 0.3, 0.2, -0.2] : [0, -0.2, -0.2, 0, -0.2, 0.2, 0, 0.2, 0.2, 0, 0.2, -0.2],
      normals: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0],
      ...(d.uv === false ? {} : { uvs: [...uvOf('decal'), ...uvOf('decal'), ...uvOf('decal'), ...uvOf('decal')] }),
      indices: [0, 1, 2, 0, 2, 3], material: 7,
    }],
  }));

  const nodes: GlbNode[] = [];
  const lod = o.lod ?? true;
  if (lod === 'so-lod1') {
    nodes.push({ name: 'lod1', children: [{ name: 'body', mesh: lod1Parts }] });
  } else if (lod) {
    nodes.push({ name: 'lod0', children: [{ name: 'body', mesh: lod0Parts }] });
    nodes.push({ name: 'lod1', children: [{ name: 'body', mesh: lod1Parts }] });
  } else {
    nodes.push({ name: 'body', mesh: lod0Parts });
  }
  nodes.push(wheel('wheel_fl', 0.8, 1.45), wheel('wheel_fr', -0.8, 1.45), wheel('wheel_rl', 0.8, -1.45), wheel('wheel_rr', -0.8, -1.45));
  nodes.push({ name: 'exhaust_l', translation: [0.45, 0.4, -2.2] }, { name: 'exhaust_r', translation: [-0.45, 0.4, -2.2] });
  for (let i = 0; i < (o.seats ?? 1); i++) nodes.push({ name: 'seat', translation: [0.25 + i * 0.1, 1.05, -0.1] });
  nodes.push(...kits, ...decals);
  return writeGlb({ nodes: [{ name: 'car_teste', children: nodes }], materials, images });
}
