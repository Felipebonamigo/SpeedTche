// Oclusão ambiente assada no vértice (V21, docs/ondas/V21-acabamento.md). O casco do carro não tinha NENHUMA oclusão: a dobra do capô, o pé do para-choque, o vão da roda, a saia
// rente ao chão, o vinco da porta recebiam a mesma luz ambiente e o mesmo "emissivo próprio" do teto aberto. Carro bem-feito tem contato e profundidade nesses lugares; o nosso lia
// como cor chapada, "desenho". Aqui o casco ganha o atributo `aOcc` (0 = aberto, 1 = fechado; Uint8 normalizado) uma vez, na montagem do casco, para TODOS os carros — procedural,
// glTF e herói passam pelo mesmo `MeshBuilder.build`.
//
// Como: grade de voxels de ~4,5 cm em volta do casco (o raio da oclusão é ~10% do maior lado: 45 cm num carro de 4,2 m; a roda unitária e o casco herói escalam sozinhos), triângulos
// rasterizados por amostragem, mais dois sólidos que a malha não tem: o CHÃO (y ≤ 0) e as RODAS (cilindros de proxy: a roda é outra malha, instanciada, e é ela que escurece a borda do
// para-lama). De cada vértice saem `RAYS` raios num hemisfério de cosseno em volta da normal suave; o primeiro voxel cheio de cada raio, a 5 distâncias, conta mais quanto mais perto.
// Sem aleatório (leque dourado fixo): o mesmo casco dá os mesmos bytes. Custo medido: ver o cartão. Só `src/render`; `src/core` não conhece isto.
import type { Axle } from './body';

/** Quantos raios por vértice (hemisfério de cosseno, leque dourado). */
export const OCC_RAYS = 14;
/** Distâncias de amostra de cada raio, em fração do raio de oclusão: o primeiro voxel cheio decide. */
export const OCC_STEPS = [0.12, 0.25, 0.45, 0.7, 1] as const;
/** O raio de oclusão em fração do maior lado do casco (carro de 4,2 m → 45 cm), e quantos voxels cabem nele. */
export const OCC_RADIUS_FRAC = 0.107;
const CELLS_PER_RADIUS = 10;
/** O chão (y ≤ 0) conta como sólido, com alcance PRÓPRIO maior (a saia do carro escurece até uns 80 cm do chão, como o contato de um carro de verdade) e um pouco menos de peso que uma dobra de lataria. */
const GROUND_WEIGHT = 0.9;
export const OCC_GROUND_REACH_FRAC = 0.19;

export interface OcclusionOptions {
  /** Eixos do carro (z, x, raio, largura): vira um cilindro de proxy por roda, centro a `r` do chão. */
  axles?: readonly Axle[];
}

/** Os raios, em coordenadas locais da normal (z = a normal): hemisfério de cosseno, fixo. */
const DIRS: ReadonlyArray<readonly [number, number, number]> = Array.from({ length: OCC_RAYS }, (_, i) => {
  const u = (i + 0.5) / OCC_RAYS;
  const c = Math.sqrt(1 - u); // cosθ, ponderado por cosseno
  const s = Math.sqrt(u);
  const phi = i * 2.399963229728653; // ângulo dourado
  return [Math.cos(phi) * s, Math.sin(phi) * s, c] as const;
});

/**
 * Oclusão de cada vértice (0 a 1) de uma malha NÃO indexada. `pos` e `nor`: 3 floats por vértice (a normal já suave). A grade é pelo casco todo; `opts.axles` põe as rodas de proxy.
 */
export function bakeOcclusion(pos: ArrayLike<number>, nor: ArrayLike<number>, opts: OcclusionOptions = {}): Float32Array {
  const n = Math.floor(pos.length / 3);
  const out = new Float32Array(n);
  if (n < 3) return out;
  let x0 = Infinity; let y0 = Infinity; let z0 = Infinity; let x1 = -Infinity; let y1 = -Infinity; let z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3]; const y = pos[i * 3 + 1]; const z = pos[i * 3 + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const extent = Math.max(x1 - x0, y1 - y0, z1 - z0, 1e-6);
  const R = extent * OCC_RADIUS_FRAC;
  const GR = extent * OCC_GROUND_REACH_FRAC;
  const cell = R / CELLS_PER_RADIUS;
  const inv = 1 / cell;
  const ox = x0 - R * 1.2; const oy = Math.min(y0, 0) - cell; const oz = z0 - R * 1.2; // o chão entra na grade só no chão do carro (a roda unitária não tem chão: ver `grounded`)
  const nx = Math.ceil((x1 + R * 1.2 - ox) * inv) + 1; const ny = Math.ceil((y1 + R * 1.2 - oy) * inv) + 1; const nz = Math.ceil((z1 + R * 1.2 - oz) * inv) + 1;
  const solid = new Uint8Array(nx * ny * nz);
  const idx = (x: number, y: number, z: number): number => (x * ny + y) * nz + z;

  // Triângulos → voxels, por amostras em grade baricêntrica de passo ≤ 0,6 célula.
  for (let t = 0; t + 2 < n; t += 3) {
    const ax = pos[t * 3]; const ay = pos[t * 3 + 1]; const az = pos[t * 3 + 2];
    const bx = pos[t * 3 + 3]; const by = pos[t * 3 + 4]; const bz = pos[t * 3 + 5];
    const cx = pos[t * 3 + 6]; const cy = pos[t * 3 + 7]; const cz = pos[t * 3 + 8];
    const e = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - ax, cy - ay, cz - az), Math.hypot(cx - bx, cy - by, cz - bz));
    const k = Math.max(1, Math.ceil(e * inv / 0.6));
    for (let i = 0; i <= k; i++) {
      for (let j = 0; j <= k - i; j++) {
        const u = i / k; const v = j / k; const w = 1 - u - v;
        const px = ax * w + bx * u + cx * v; const py = ay * w + by * u + cy * v; const pz = az * w + bz * u + cz * v;
        solid[idx(Math.floor((px - ox) * inv), Math.floor((py - oy) * inv), Math.floor((pz - oz) * inv))] = 1;
      }
    }
  }
  // Rodas de proxy: cilindro com o eixo em x (centro a `r` do chão), um pouco menor que a roda (o pneu de 12 lados é menor que o círculo).
  for (const a of opts.axles ?? []) {
    for (const side of [-1, 1]) {
      const cxw = side * a.x; const cyw = a.r; const czw = a.z; const rr = a.r * 0.96; const hw = a.w * 0.5;
      const lox = Math.max(0, Math.floor((cxw - hw - ox) * inv)); const hix = Math.min(nx - 1, Math.floor((cxw + hw - ox) * inv));
      const loy = Math.max(0, Math.floor((cyw - rr - oy) * inv)); const hiy = Math.min(ny - 1, Math.floor((cyw + rr - oy) * inv));
      const loz = Math.max(0, Math.floor((czw - rr - oz) * inv)); const hiz = Math.min(nz - 1, Math.floor((czw + rr - oz) * inv));
      for (let ix = lox; ix <= hix; ix++) for (let iy = loy; iy <= hiy; iy++) for (let iz = loz; iz <= hiz; iz++) {
        const wy = oy + (iy + 0.5) * cell - cyw; const wz = oz + (iz + 0.5) * cell - czw;
        if (wy * wy + wz * wz <= rr * rr) solid[idx(ix, iy, iz)] = 1;
      }
    }
  }
  // O chão só vale para o carro (o casco apoia em y ≈ 0); a roda unitária (centro na origem) não pousa em lugar nenhum.
  const grounded = y0 >= -0.05 && y0 < 0.4 * extent;

  // Vértices com a mesma posição (1 mm) e a mesma normal (1/32) dão o mesmo resultado: o casco é não indexado (3 vértices por triângulo, um leque de normal lisa repete o ponto): calcula uma vez.
  const seen = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos[i * 3] * 1000)},${Math.round(pos[i * 3 + 1] * 1000)},${Math.round(pos[i * 3 + 2] * 1000)},${Math.round(nor[i * 3] * 32)},${Math.round(nor[i * 3 + 1] * 32)},${Math.round(nor[i * 3 + 2] * 32)}`;
    const prev = seen.get(key);
    if (prev !== undefined) { out[i] = out[prev]; continue; }
    seen.set(key, i);
    const px = pos[i * 3]; const py = pos[i * 3 + 1]; const pz = pos[i * 3 + 2];
    let nx_ = nor[i * 3]; let ny_ = nor[i * 3 + 1]; let nz_ = nor[i * 3 + 2];
    const nl = Math.hypot(nx_, ny_, nz_);
    if (nl < 1e-6) continue;
    nx_ /= nl; ny_ /= nl; nz_ /= nl;
    // Base ortonormal fixa (sem aleatório): o eixo menos alinhado à normal gera o primeiro tangente.
    const hx = Math.abs(nx_) < 0.8 ? 1 : 0; const hy = hx ? 0 : 1;
    let tx = hy * nz_; let ty = -hx * nz_; let tz = hx * ny_ - hy * nx_; // t = h × n
    const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
    const bx = ny_ * tz - nz_ * ty; const by = nz_ * tx - nx_ * tz; const bz = nx_ * ty - ny_ * tx; // b = n × t
    // o ponto de partida sobe 1,2 célula pela normal: a própria chapa (que ocupa a célula dela) não se oclui
    const sx = px + nx_ * cell * 1.2; const sy = py + ny_ * cell * 1.2; const sz = pz + nz_ * cell * 1.2;
    let acc = 0;
    for (let r = 0; r < OCC_RAYS; r++) {
      const d = DIRS[r];
      const dx = tx * d[0] + bx * d[1] + nx_ * d[2]; const dy = ty * d[0] + by * d[1] + ny_ * d[2]; const dz = tz * d[0] + bz * d[1] + nz_ * d[2];
      // O chão é exato (um plano): o raio que desce o alcança a `tg` metros.
      const tg = grounded && dy < -1e-4 ? -sy / dy : Infinity;
      const groundHit = tg < GR ? GROUND_WEIGHT * (1 - 0.5 * (tg / GR)) : 0;
      let hit = 0;
      for (const f of OCC_STEPS) {
        const q = R * f;
        if (q >= tg) break; // o chão vem antes
        const qx = sx + dx * q; const qy = sy + dy * q; const qz = sz + dz * q;
        const gx = Math.floor((qx - ox) * inv); const gy = Math.floor((qy - oy) * inv); const gz = Math.floor((qz - oz) * inv);
        if (gx < 0 || gy < 0 || gz < 0 || gx >= nx || gy >= ny || gz >= nz) continue;
        if (solid[idx(gx, gy, gz)]) { hit = 1 - 0.5 * f; break; }
      }
      acc += hit > 0 ? hit : groundHit;
    }
    out[i] = Math.min(1, acc / OCC_RAYS);
  }
  return out;
}
