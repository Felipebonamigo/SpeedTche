// Um carro "no formato do Kenney Car Kit" feito em código: uma malha por peça (`body`, `spoiler`, `wheel-*`), UM material com o
// colormap de 512² (16 × 4 swatches) e a cor decidida só pela UV. Serve de entrada ao conversor (scripts/lib/car-convert.ts) nos testes
// sem baixar nada: os swatches usados são os mesmos da receita do Kenney (KENNEY_ROLES) e há um swatch FORA da receita.
import { writeGlb, type GlbNode, type GlbPrimitive } from './glb-write';
import { encodePng } from './png';

export const CELL = { paint: [13, 1], lower: [7, 2], tire: [5, 2], rim: [11, 2], glass: [1, 3], head: [3, 3], tail: [5, 3], plate: [13, 2], white: [12, 2], unknown: [0, 0] } as const;
type Cell = readonly [number, number];

const rgbOfCell = (c: Cell): [number, number, number] => {
  if (c[0] === CELL.white[0] && c[1] === CELL.white[1]) return [255, 255, 255];
  return [(c[0] * 16 + 40) & 255, (c[1] * 60 + 30) & 255, (c[0] * 7 + c[1] * 31 + 90) & 255];
};

/** Colormap 512²: cada swatch uma cor chapada (o Kenney tem degradê; a conta é a mesma). */
export function kenneyLikeColormap(): Buffer {
  const rgba = new Uint8Array(512 * 512 * 4);
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const c = rgbOfCell([Math.floor(x / 32), Math.floor(y / 128)]);
      const i = (y * 512 + x) * 4;
      rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
    }
  }
  return encodePng(512, 512, rgba);
}

const FACES: ReadonlyArray<{ n: [number, number, number]; u: [number, number, number]; v: [number, number, number] }> = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] }, { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

/** Caixa de w × h × d com cada face em n × n quadrados (12·n² triângulos) toda no swatch `cell`. */
function gridBox(c: readonly [number, number, number], s: readonly [number, number, number], n: number, cell: Cell): GlbPrimitive {
  const positions: number[] = []; const normals: number[] = []; const uvs: number[] = []; const indices: number[] = [];
  for (const f of FACES) {
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const a = (i / n) * 2 - 1; const b = (j / n) * 2 - 1;
        positions.push(...[0, 1, 2].map((k) => c[k] + ((f.n[k] + f.u[k] * a + f.v[k] * b) * s[k]) / 2));
        normals.push(...f.n);
        uvs.push((cell[0] + 0.25 + 0.5 * (i / n)) / 16, (cell[1] + 0.25 + 0.5 * (j / n)) / 4);
      }
    }
    const base = positions.length / 3 - (n + 1) * (n + 1);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const p = base + i * (n + 1) + j;
        // anti-horário visto de fora: a ordem depende do sinal do produto u × v em relação à normal
        const flip = f.u[0] * (f.v[1] * f.n[2] - f.v[2] * f.n[1]) + f.u[1] * (f.v[2] * f.n[0] - f.v[0] * f.n[2]) + f.u[2] * (f.v[0] * f.n[1] - f.v[1] * f.n[0]) < 0;
        indices.push(...(flip ? [p, p + 1, p + n + 2, p, p + n + 2, p + n + 1] : [p, p + n + 2, p + 1, p, p + n + 1, p + n + 2]));
      }
    }
  }
  return { positions, normals, uvs, indices, material: 0 };
}

/** Roda do Kenney: cilindro de 12 lados com o eixo em x (raio 0,3, largura 0,35); o lado é pneu, as tampas são aro. */
function wheel(): GlbPrimitive {
  const positions: number[] = []; const normals: number[] = []; const uvs: number[] = []; const indices: number[] = [];
  const N = 12; const r = 0.3; const w = 0.35;
  const uv = (cell: Cell): [number, number] => [(cell[0] + 0.5) / 16, (cell[1] + 0.5) / 4];
  const add = (p: number[], n: number[], cell: Cell) => { positions.push(...p); normals.push(...n); uvs.push(...uv(cell)); return positions.length / 3 - 1; };
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2; const a1 = ((k + 1) / N) * Math.PI * 2;
    const p = (a: number, x: number) => [x, Math.cos(a) * r, Math.sin(a) * r];
    const nn = (a: number) => [0, Math.cos(a), Math.sin(a)];
    const i = add(p(a0, -w / 2), nn(a0), CELL.tire); add(p(a1, -w / 2), nn(a1), CELL.tire); add(p(a1, w / 2), nn(a1), CELL.tire); add(p(a0, w / 2), nn(a0), CELL.tire);
    indices.push(i, i + 2, i + 1, i, i + 3, i + 2);
    for (const side of [-1, 1]) {
      const c = add([side * (w / 2), 0, 0], [side, 0, 0], CELL.rim);
      const q0 = add(p(a0, side * (w / 2)), [side, 0, 0], CELL.rim); const q1 = add(p(a1, side * (w / 2)), [side, 0, 0], CELL.rim);
      indices.push(...(side > 0 ? [c, q1, q0] : [c, q0, q1]));
    }
  }
  return { positions, normals, uvs, indices, material: 0 };
}

/** O arquivo: 768 + 12·(grade) triângulos de casco em vários swatches; spoiler; 4 rodas de 96 triângulos. */
export function kenneyLikeGlb(): Buffer {
  const body: GlbNode = {
    name: 'body', translation: [0, 0.15, 0],
    mesh: [
      gridBox([0, 0.6, 0], [1.3, 0.8, 2.55], 8, CELL.paint), // 768
      gridBox([0, 0.2, 0], [1.3, 0.2, 2.55], 4, CELL.lower), // 192: a saia (cinza do meio)
      gridBox([0, 0.95, -0.1], [1.1, 0.12, 1.0], 1, CELL.glass), // vidro
      gridBox([0.45, 0.45, 1.245], [0.3, 0.12, 0.06], 1, CELL.head), gridBox([-0.45, 0.45, 1.245], [0.3, 0.12, 0.06], 1, CELL.head),
      gridBox([0.45, 0.45, -1.245], [0.3, 0.12, 0.06], 1, CELL.tail), gridBox([-0.45, 0.45, -1.245], [0.3, 0.12, 0.06], 1, CELL.tail),
      gridBox([0, 0.1, 1.25], [0.4, 0.1, 0.05], 1, CELL.plate),
      gridBox([0, 0.5, 0.8], [0.2, 0.05, 0.2], 1, CELL.unknown), // swatch fora da receita
    ],
  };
  const spoiler: GlbNode = { name: 'spoiler', translation: [0, 0.45, -1.04], mesh: [gridBox([0, 0, 0], [1.1, 0.06, 0.24], 2, CELL.paint)] };
  const wheels: GlbNode[] = [
    ['wheel-back-right', -0.3, -0.66], ['wheel-back-left', 0.3, -0.66], ['wheel-front-left', 0.3, 0.66], ['wheel-front-right', -0.3, 0.66],
  ].map(([name, x, z]) => ({ name: name as string, translation: [(x as number) * (0.425 / 0.3), 0.3, z as number] as const, mesh: [wheel()] }));
  return writeGlb({ nodes: [body, spoiler, ...wheels], materials: [{ name: 'colormap', roughness: 1, metalness: 0 }] });
}
