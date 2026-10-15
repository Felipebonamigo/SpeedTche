// Peças que POUSAM na pele do casco HCT (V2, `hull.ts`): decalques e frisos laterais, faixas coladas nas pontas, remendos no capô,
// lâmpadas embutidas com profundidade, farol com projetores, grade de lamelas, maçaneta e o reflexo do vidro. Vieram do protótipo
// aprovado (`nc/estilo-carros`, `tools/estilo-carros/hct2/parts.ts`) e foram reescritas para o contrato do jogo:
// - luz e faixa só pelos pincéis nomeados (`HEAD`, `TAIL`, `STRIPE_A/B`, `ACCENT`; tests/car-round.test.ts) — pisca e ré ficam APAGADOS
//   (lente colorida sem emissivo), como num carro de verdade andando;
// - toda lente acesa é um LEQUE com o vértice no centro, para o miolo e a borda do `aLens` (kit.ts `lensRadius`, cor-brilho).
// Coordenadas do carro: x para a direita, y para cima, −z é a frente; metros.
import * as THREE from 'three';
import type { Hull } from './hull';
import { AXIS_NZ, AXIS_Z, lathe, type Brush, type MeshBuilder, type P2, type P3 } from './kit';
import { TRIM } from './paints';

/** Normal (não unitária) de um polígono 3D pelos três primeiros pontos. */
const normalOf = (p: readonly P3[]): THREE.Vector3 => {
  const a = new THREE.Vector3(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]);
  const c = new THREE.Vector3(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]);
  return a.cross(c);
};

/** Quad com a normal para o lado `want`, qualquer que seja a ordem dos pontos. */
function quadWant(b: MeshBuilder, p: P3, q: P3, r: P3, s: P3, br: Brush, want: P3): void {
  const n = normalOf([p, q, r]);
  if (n.x * want[0] + n.y * want[1] + n.z * want[2] >= 0) b.quad(p, q, r, s, br); else b.quad(p, s, r, q, br);
}

/**
 * Sólido convexo: o polígono `base` (3D, qualquer ordem de giro) extrudado por `dir`. A tampa de cima fica em base + dir. As normais saem
 * para fora pelo centroide, então vale em qualquer plano (capô inclinado, lateral, traseira). `bottom` null = sem a tampa de baixo
 * (encostada na pele).
 */
export function prism(b: MeshBuilder, base: readonly P3[], dir: P3, top: Brush, side: Brush = top, bottom: Brush | null = side): void {
  const n = base.length;
  const tp = base.map((p) => [p[0] + dir[0], p[1] + dir[1], p[2] + dir[2]] as P3);
  const c = new THREE.Vector3();
  for (const p of base) c.add(new THREE.Vector3(p[0], p[1], p[2]));
  c.divideScalar(n).add(new THREE.Vector3(dir[0] / 2, dir[1] / 2, dir[2] / 2));
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]);
  const fan = (pts: readonly P3[], br: Brush, want: THREE.Vector3): void => {
    const flip = normalOf(pts).dot(want) < 0;
    for (let i = 1; i < pts.length - 1; i++) { if (flip) b.tri(pts[0], pts[i + 1], pts[i], br); else b.tri(pts[0], pts[i], pts[i + 1], br); }
  };
  fan(tp, top, d);
  if (bottom) fan(base, bottom, d.clone().negate());
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const q: P3[] = [base[i], base[j], tp[j], tp[i]];
    const mid = new THREE.Vector3();
    for (const p of q) mid.add(new THREE.Vector3(p[0], p[1], p[2]));
    mid.divideScalar(4).sub(c);
    if (normalOf(q).dot(mid) < 0) b.quad(q[0], q[3], q[2], q[1], side); else b.quad(q[0], q[1], q[2], q[3], side);
  }
}

/**
 * Disco curto deitado no capô (lente de projetor, tampa de tanque): a tampa de cima é um LEQUE com vértice no centro (o `aLens` do farol
 * nasce dele) e a lateral desce até a base. `rz` é o raio em z (o capô inclina: o disco fica oval visto de cima).
 */
export function discUp(b: MeshBuilder, x: number, y: number, z: number, r: number, rz: number, h: number, lens: Brush, side: Brush, segs = 12): void {
  const ring = (yy: number): P3[] => Array.from({ length: segs }, (_, k) => {
    const a = (k / segs) * Math.PI * 2;
    return [x + Math.cos(a) * r, yy, z + Math.sin(a) * rz] as P3;
  });
  const lo = ring(y); const hi = ring(y + h);
  // O centro sobe 2 mm (lente levemente abaulada): mais que isso o `aLens` do centro deixa de ser ~0 e o miolo perde força.
  const c: P3 = [x, y + h + 0.002, z];
  for (let k = 0; k < segs; k++) {
    const k1 = (k + 1) % segs;
    quadWant(b, lo[k], lo[k1], hi[k1], hi[k], side, [Math.cos(((k + 0.5) / segs) * Math.PI * 2), 0, Math.sin(((k + 0.5) / segs) * Math.PI * 2)]);
    const n = normalOf([c, hi[k], hi[k1]]);
    if (n.y >= 0) b.tri(c, hi[k], hi[k1], lens); else b.tri(c, hi[k1], hi[k], lens);
  }
}

/**
 * Lâmpada redonda EMBUTIDA, com profundidade (V2, a traseira-vitrine): a moldura sai `protrude` m da pele (parede de fora + aro), o poço
 * volta `recess` m para dentro e a lente fica no fundo, em cone raso (LEQUE com o vértice no centro: o miolo e a borda do `aLens`).
 * `z` é a pele na ponta (`back`: a lâmpada olha para +z; `front`: para −z). Um torno só: ~7 triângulos por lado.
 */
export interface RecessedLamp { x: number; y: number; z: number; rOuter: number; rLens: number; protrude: number; recess: number; dome?: number }
export function recessedLamp(b: MeshBuilder, l: RecessedLamp, end: 'front' | 'back', lens: Brush, bezel: Brush, well: Brush, segs = 14): void {
  const fr = { ...(end === 'back' ? AXIS_Z : AXIS_NZ), o: [l.x, l.y, l.z] as P3 };
  const p = l.protrude; const lensT = p - l.recess;
  // A lente quase plana (abaulado de `dome`, 3 mm): o `aLens` mede a distância ao centroide da lente, e um centro alto demais tira força do miolo.
  const prof: P2[] = [[l.rOuter, -0.04], [l.rOuter, p], [l.rLens, p], [l.rLens, lensT], [0, lensT + (l.dome ?? 0.003)]];
  const brushes = [bezel, bezel, well, lens];
  lathe(b, fr, prof, segs, (i) => brushes[i]);
}

/**
 * Peça colada na pele lateral (lado direito + espelho): polígono em (z, y) que fica `off` m para fora da pele do casco. Cada vértice segue
 * a pele (`skinX`): vale para entradas de ar, frisos e molduras.
 */
export function sideDecal(b: MeshBuilder, hull: Hull, poly: readonly P2[], br: Brush, off = 0.008): void {
  const pts: P3[] = poly.map(([z, y]) => [hull.skinX(z, y) + off, y, z]);
  b.mirrored(() => { for (let i = 1; i < pts.length - 1; i++) quadTri(b, pts[0], pts[i], pts[i + 1], br); });
}
/** Triângulo com a normal para +x (lado direito). */
function quadTri(b: MeshBuilder, p: P3, q: P3, r: P3, br: Brush): void {
  const n = normalOf([p, q, r]);
  if (n.x >= 0) b.tri(p, q, r, br); else b.tri(p, r, q, br);
}

/** Linha fina (friso, junta de porta, lamela) na pele lateral: tira de largura `w` (m) ao longo do caminho (z, y), lado direito + espelho. */
export function sideLine(b: MeshBuilder, hull: Hull, path: readonly P2[], w: number, br: Brush, off = 0.006): void {
  b.mirrored(() => {
    const at = (z: number, y: number): P3 => [hull.skinX(z, y) + off, y, z];
    for (let i = 0; i < path.length - 1; i++) {
      const [za, ya] = path[i]; const [zb, yb] = path[i + 1];
      const dz = zb - za; const dy = yb - ya; const l = Math.hypot(dz, dy) || 1;
      const nz = (-dy / l) * (w / 2); const ny = (dz / l) * (w / 2);
      quadWant(b, at(za - nz, ya - ny), at(za + nz, ya + ny), at(zb + nz, yb + ny), at(zb - nz, yb - ny), br, [1, 0, 0]);
    }
  });
}

/**
 * Faixa colada na frente ou na traseira (lado direito + espelho), entre as curvas ylo(t) e yhi(t) de x0 a x1: cada ponto pousa na pele
 * (`endZ`) e sobra `out` m para fora; como segue a ponta redonda em planta, não some dentro da carroceria.
 */
export function endDecal(b: MeshBuilder, hull: Hull, end: 'front' | 'back', x0: number, x1: number, ylo: (t: number) => number, yhi: (t: number) => number, out: number, br: Brush, n = 6, mirror = true): void {
  const dir = end === 'front' ? -1 : 1;
  const at = (x: number, y: number): P3 => [x, y, hull.endZ(x, y, end) + dir * out];
  const draw = (): void => {
    for (let i = 0; i < n; i++) {
      const xa = x0 + ((x1 - x0) * i) / n; const xb = x0 + ((x1 - x0) * (i + 1)) / n;
      const ta = i / n; const tb = (i + 1) / n;
      quadWant(b, at(xa, ylo(ta)), at(xb, ylo(tb)), at(xb, yhi(tb)), at(xa, yhi(ta)), br, [0, 0, dir]);
    }
  };
  if (mirror) b.mirrored(draw); else draw();
}

/** Remendo fino colado na superfície de cima do casco (tomada de ar, venezianas): polígono (x, z) que pousa em `topAt`. */
export function topPatch(b: MeshBuilder, hull: Hull, poly: ReadonlyArray<readonly [number, number]>, br: Brush, thick = 0.012, mirror = true, side: Brush = br): void {
  const draw = (): void => prism(b, poly.map(([x, z]) => [x, hull.topAt(z, x) + 0.002, z] as P3), [0, thick, 0], br, side, null);
  if (mirror) b.mirrored(draw); else draw();
}

/** Grade na ponta (lado direito + espelho): fundo escuro e `rows` lamelas claras finas, em relevo. */
export function meshGrille(b: MeshBuilder, hull: Hull, end: 'front' | 'back', x0: number, x1: number, y0: number, y1: number, rows: number, back: Brush, slat: Brush): void {
  endDecal(b, hull, end, x0, x1, () => y0, () => y1, 0.012, back, 3);
  const h = (y1 - y0) / (rows * 2 + 1);
  for (let i = 0; i < rows; i++) {
    const ya = y0 + h * (1 + i * 2);
    endDecal(b, hull, end, x0 + 0.015, x1 - 0.015, () => ya, () => ya + h, 0.02, slat, 3);
  }
}

/** Maçaneta: caixinha em relevo na pele lateral (lado direito + espelho). */
export function doorHandle(b: MeshBuilder, hull: Hull, z: number, y: number, br: Brush = TRIM, len = 0.13): void {
  const x = hull.skinX(z, y) + 0.004;
  b.mirrored(() => prism(b, [[x, y - 0.013, z - len / 2], [x, y + 0.013, z - len / 2], [x, y + 0.013, z + len / 2], [x, y - 0.013, z + len / 2]], [0.02, 0, 0], br, br, null));
}

export interface GlassEdge { z: number; y: number; hw: number }

/**
 * Reflexo do céu no vidro inclinado (para-brisa ou vidro de trás): duas faixas diagonais claras, um pouco para fora da face, ESPELHADAS
 * (o reflexo vai nos dois lados, como o das janelas). `a` é a borda de baixo, `c` a de cima; `facing` −1 = frente, +1 = trás.
 */
export function glassGlints(b: MeshBuilder, a: GlassEdge, c: GlassEdge, facing: 1 | -1, br: Brush, crown = 0.03): void {
  if (b.lod) return;
  const dz = c.z - a.z; const dy = c.y - a.y; const l = Math.hypot(dz, dy);
  const ny = Math.abs(dz / l); const nz = facing * Math.abs(dy / l);
  const off = 0.008;
  // O vidro é abaulado como o teto (`crown` no meio, 0 na borda): a faixa sobe junto, senão afunda nele perto do teto.
  const P = (u: number, s: number): P3 => [s * (a.hw + (c.hw - a.hw) * u), a.y + dy * u + crown * u * (1 - s * s) + ny * off, a.z + dz * u + nz * off];
  b.mirrored(() => {
    for (const [s0, k, w] of [[0.22, 0.42, 0.17], [0.62, 0.3, 0.06]] as const) {
      const lo0 = P(0.12, s0); const lo1 = P(0.12, s0 + w); const hi0 = P(0.88, s0 + k * 0.76); const hi1 = P(0.88, s0 + k * 0.76 + w);
      quadWant(b, lo0, lo1, hi1, hi0, br, [0, ny, nz]);
    }
  });
}

/** Escala um polígono 2D em torno do centroide. */
export function shrink(poly: ReadonlyArray<readonly [number, number]>, k: number): Array<[number, number]> {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length; const cz = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  return poly.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k]);
}

export interface HeadlampBrushes { lens: Brush; bezel: Brush; side: Brush; reflector: Brush }

/**
 * Farol deitado no capô, com profundidade (lado direito + espelho): carcaça preta que sobra 4,5 cm do capô, refletor embutido, dois
 * projetores redondos acesos (leque com centro: miolo e borda) e a linha de luz diurna em L na borda de dentro e na da frente. O
 * polígono (x, z) vai na ordem dentro-frente, fora-frente, fora-trás, dentro-trás; cada ponto pousa em `topAt`.
 */
export function headlampPod(b: MeshBuilder, hull: Hull, poly: ReadonlyArray<readonly [number, number]>, br: HeadlampBrushes): void {
  const on = (pts: ReadonlyArray<readonly [number, number]>, lift: number): P3[] => pts.map(([x, z]) => [x, hull.topAt(z, x) + lift, z] as P3);
  const H = 0.045;
  b.mirrored(() => {
    prism(b, on(poly, 0), [0, H, 0], br.bezel, br.side, null);
    prism(b, on(shrink(poly, 0.82), H + 0.001), [0, 0.004, 0], br.reflector, br.reflector, null);
    const [a, d, e, c] = poly;
    const inner: [number, number] = [(a[0] + c[0]) / 2 + 0.06, (a[1] + c[1]) / 2];
    const outer: [number, number] = [(d[0] + e[0]) / 2 - 0.05, (d[1] + e[1]) / 2];
    for (let i = 0; i < 2; i++) {
      const t = 0.18 + 0.58 * i;
      const x = inner[0] + (outer[0] - inner[0]) * t; const z = inner[1] + (outer[1] - inner[1]) * t;
      const r = 0.07 - i * 0.01;
      discUp(b, x, hull.topAt(z, x) + H + 0.003, z, r, r * 0.8, 0.022, br.lens, br.side, 12);
    }
    // Luz diurna em L: a borda de dentro (a → c) e a da frente (a → d), 3,5 cm de largura.
    const w = 0.035;
    const along = (p: readonly [number, number], q: readonly [number, number], inward: readonly [number, number]): Array<[number, number]> =>
      [[p[0], p[1]], [q[0], q[1]], [q[0] + inward[0] * w, q[1] + inward[1] * w], [p[0] + inward[0] * w, p[1] + inward[1] * w]];
    prism(b, on(along(a, c, [1, 0]), H + 0.002), [0, 0.012, 0], br.lens, br.side, null);
    prism(b, on(along([a[0] + w, a[1]], d, [0, 1]), H + 0.002), [0, 0.012, 0], br.lens, br.side, null);
  });
}
