// Carro em glTF → modelo do jogo (passo 2.4 do roteiro). A convenção é a do briefing de arte:
// - metros, +Y para cima, frente em +Z (padrão do glTF); o jogo usa −Z como frente, então a malha gira
//   180° em Y ao entrar (x → −x, z → −z, exato: preserva o sentido das faces);
// - nós `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr` (posição e tamanho das rodas, medidos pela malha de
//   cada um) e os vazios `exhaust_l`/`exhaust_r` (saída da chama do nitro); o resto das malhas é o casco;
// - material pelo nome (`paint`, `accent`, `stripe_a`, `stripe_b`, `headlight`, `taillight`, …): o nome
//   diz como a face recebe a cor do carro e se acende; a cor, a rugosidade e o metal das peças fixas vêm
//   do próprio material. Os modelos-base (template.ts) levam o pincel exato nos extras (`nitro`), para a
//   ida e volta sair idêntica.
// O desenho das rodas continua o do estilo (a malha das rodas do .glb só dá posição e tamanho, por ora).
// Puro (three + GLTFLoader, sem DOM): os testes rodam no Node.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CarBody } from '../../core/types';
import { CAR_LIMITS, checkCarModel } from './check';
import { HERO_MAX_TRIANGLES } from './lod';
import { MeshBuilder, type Brush, type P2, type P3 } from './kit';
import type { Axle } from './body';
import type { CarContract, CarModel } from './model';
import { MODEL_BUILDERS } from './models';
import { CREASE } from '../normals';
import { LIVERY_A, LIVERY_B } from './paints';

export const WHEEL_NODES = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'] as const;
export const EXHAUST_NODES = ['exhaust_l', 'exhaust_r'] as const;

/** Pincel guardado nos extras do material (`userData.nitro`): os 11 bytes da malha do jogo. */
export type BrushBytes = [number, number, number, number, number, number, number, number, number, number, number];

export function brushToBytes(b: Brush): BrushBytes {
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return [q(b.rgb[0]), q(b.rgb[1]), q(b.rgb[2]), q(b.paint), q(b.accent), q((b.layer / 3)), q(b.popup), q(b.rough), q(b.metal), q(b.head), q(b.tail)];
}

export function bytesToBrush(v: readonly number[]): Brush {
  const f = (i: number) => v[i] / 255;
  return {
    rgb: [f(0), f(1), f(2)], paint: f(3), accent: f(4), layer: Math.round(f(5) * 3) as 0 | 1 | 2 | 3, popup: f(6),
    rough: f(7), metal: f(8), head: f(9), tail: f(10),
  };
}

/** Nome limpo: minúsculas, sem o sufixo ".001" que o Blender acrescenta. */
export function cleanName(name: string): string {
  return name.toLowerCase().replace(/\.\d+$/, '').trim();
}

/**
 * Como uma face com este material entra no carro. Pelos extras (`nitro`, os modelos-base) ou pelo nome:
 * - `paint*`, `accent*`, `stripe_a*`, `stripe_b*`, `stripe_ab`: recebem a cor do carro; a cor do material é o
 *   TOM (branco = a cor pura, cinza = um tom abaixo);
 * - `headlight*` / `taillight*`: acendem; a força é a do emissivo (emissivo igual à cor = 1; sem emissivo = 1);
 * - "popup" no nome: sobe com o farol escamoteável à noite;
 * - o resto: peça fixa com a cor, a rugosidade e o metal do próprio material.
 */
export function brushForMaterial(material: THREE.Material): Brush {
  const extra = (material.userData as { nitro?: unknown }).nitro;
  if (Array.isArray(extra) && extra.length === 11 && extra.every((n) => typeof n === 'number')) return bytesToBrush(extra);
  const name = cleanName(material.name);
  const std = material as THREE.MeshStandardMaterial;
  const c = std.color ?? new THREE.Color('#808080');
  const base: Brush = {
    rgb: [c.r, c.g, c.b], paint: 0, accent: 0, layer: 0, rough: std.roughness ?? 0.6, metal: std.metalness ?? 0,
    head: 0, tail: 0, popup: name.includes('popup') ? 1 : 0,
  };
  // Força da luz = emissivo ÷ cor (o modelo-base grava emissivo = cor × força).
  const glow = (): number => {
    const e = std.emissive;
    if (!e || Math.max(e.r, e.g, e.b) === 0) return 1;
    const k = Math.max(e.r, e.g, e.b) * (std.emissiveIntensity ?? 1) / Math.max(1e-6, c.r, c.g, c.b);
    return Math.min(1, k);
  };
  // V6c: a escada do carro da firma — vértice marcado (popup 0,5; o farol escamoteável é 1) que o shader balança com os bits da instância (cars/ladder.ts).
  if (name.startsWith('ladder')) return { ...base, popup: 0.5 };
  if (name.startsWith('stripe_ab')) return { ...base, paint: 1, layer: 3 };
  if (name.startsWith('stripe_a')) return { ...base, paint: 1, layer: 1 };
  if (name.startsWith('stripe_b')) return { ...base, paint: 1, layer: 2 };
  if (name.startsWith('accent')) return { ...base, paint: 1, accent: 1 };
  if (name.startsWith('paint')) return { ...base, paint: 1 };
  if (name.startsWith('headlight')) return { ...base, head: glow() };
  if (name.startsWith('taillight')) return { ...base, tail: glow() };
  return base;
}

interface Part { mesh: THREE.Mesh; under: string | null; lod: 0 | 1 | null; kit: string | null; decal: string | null }

interface Collected { parts: Part[]; nodes: Map<string, THREE.Object3D>; lodNodes: { lod0: boolean; lod1: boolean }; seats: THREE.Object3D[] }

/**
 * Malhas do arquivo e, para cada uma, o nó da convenção (roda ou escape) acima dela e o LOD (`lod0`/`lod1`) em que está.
 * Roda e escape se procuram fora do `lod1`: o `lod1` só leva casco. Malha sob `kit_*` ou `decal_*` não é casco; os vazios `seat` vêm à parte.
 */
function collect(root: THREE.Object3D): Collected {
  const nodes = new Map<string, THREE.Object3D>();
  const parts: Part[] = [];
  const lodNodes = { lod0: false, lod1: false };
  const seats: THREE.Object3D[] = [];
  const known = new Set<string>([...WHEEL_NODES, ...EXHAUST_NODES]);
  const walk = (o: THREE.Object3D, under: string | null, lod: 0 | 1 | null, kit: string | null, decal: string | null) => {
    const n = cleanName(o.name);
    let here = under; let lodHere = lod; let kitHere = kit; let decalHere = decal;
    if (lod !== 1 && known.has(n) && !nodes.has(n)) { nodes.set(n, o); here = n; }
    if (lod === null && n === 'lod0') { lodHere = 0; lodNodes.lod0 = true; }
    if (lod === null && n === 'lod1') { lodHere = 1; lodNodes.lod1 = true; }
    if (!kitHere && n.startsWith('kit_')) kitHere = n;
    if (!decalHere && n.startsWith('decal_')) decalHere = n;
    if (/^seat(_\d+)?$/.test(n)) seats.push(o); // `seat_1`: o GLTFLoader renomeia nome repetido
    if ((o as THREE.Mesh).isMesh) parts.push({ mesh: o as THREE.Mesh, under: here, lod: lodHere, kit: kitHere, decal: decalHere });
    for (const c of o.children) walk(c, here, lodHere, kitHere, decalHere);
  };
  walk(root, null, null, null, null);
  return { parts, nodes, lodNodes, seats };
}

/** glTF (frente +Z) → jogo (frente −Z): giro de 180° em Y. */
const TO_GAME = new THREE.Matrix4().makeScale(-1, 1, -1);

/** Pontos (no referencial do jogo) das malhas sob um nó. */
function gamePoints(parts: Part[], under: string): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const p of parts) {
    if (p.under !== under) continue;
    const pos = p.mesh.geometry.getAttribute('position');
    const m = new THREE.Matrix4().multiplyMatrices(TO_GAME, p.mesh.matrixWorld);
    for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m));
  }
  return out;
}

export interface GltfCar { model: CarModel | null; problems: string[]; warnings: string[] }

/** Giros por volta da roda quando o arquivo não diz (extras `spokes` no nó): conservador, o giro por quadro fica curto. */
const DEFAULT_SPOKES = 6;

/**
 * Modelo do jogo a partir da cena de um .glb (já com `matrixWorld` atualizada). Devolve `model: null` quando
 * falta o que a convenção exige; os problemas de medida (pegada, rodas, luzes…) vêm do validador comum.
 * `carId`: o arquivo é de um carro só (`src/assets/cars/<carId>.glb`), não do estilo.
 */
export function carModelFromGltf(body: CarBody, root: THREE.Object3D, carId?: string, opts: { maxTriangles?: number } = {}): GltfCar {
  root.updateMatrixWorld(true);
  const { parts, nodes, lodNodes, seats } = collect(root);
  const missing = WHEEL_NODES.filter((n) => !nodes.has(n) || !parts.some((p) => p.under === n));
  if (missing.length) return { model: null, problems: [`faltam as rodas (nós com malha): ${missing.join(', ')}`], warnings: [] };
  const isShell = (p: Part) => p.under === null && !p.kit && !p.decal;
  const shellParts = parts.filter((p) => isShell(p) && p.lod !== 1);
  const lod1Parts = parts.filter((p) => isShell(p) && p.lod === 1);
  const shellHasLadder = shellParts.some((p) => (Array.isArray(p.mesh.material) ? p.mesh.material : [p.mesh.material]).some((m) => cleanName(m.name).startsWith('ladder')));
  if (!shellParts.length) {
    const why = lod1Parts.length ? 'só há o nó lod1: falta o lod0 com o casco (o lod1 é a versão simplificada dele)' : 'nenhuma malha de carroceria (fora dos nós wheel_* e exhaust_*)';
    return { model: null, problems: [why], warnings: [] };
  }

  const warnings: string[] = [];
  const problems: string[] = [];
  const a = new THREE.Vector3(); const bv = new THREE.Vector3(); const c = new THREE.Vector3();
  // Atlas de paleta: uma imagem só para o carro (as outras viram problema no check.ts, pelo contrato).
  const atlases = new Map<string, { width: number; height: number }>();
  const meshesWithoutUv = new Set<string>();
  let map: THREE.Texture | undefined; let normalMap: THREE.Texture | undefined;

  /** Triângulos de uma malha para o construtor, no referencial do jogo; `extra` (opcional) é aplicada depois (ex.: escala unitária da roda). */
  const emit = (b: MeshBuilder, part: Part, extra?: THREE.Matrix4) => {
    const geo = part.mesh.geometry;
    const pos = geo.getAttribute('position');
    const uvAttr = geo.getAttribute('uv');
    const index = geo.getIndex();
    const m = new THREE.Matrix4().multiplyMatrices(TO_GAME, part.mesh.matrixWorld);
    if (extra) m.premultiply(extra);
    const mats = Array.isArray(part.mesh.material) ? part.mesh.material : [part.mesh.material];
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];
    // Peça espelhada (escala negativa): a ordem dos vértices inverte, senão a face fica para dentro.
    const flip = m.determinant() < 0;
    for (const grp of groups) {
      const material = mats[grp.materialIndex ?? 0] ?? mats[0];
      const std = material as THREE.MeshStandardMaterial;
      if (std.map) {
        const img = std.map.image as { width: number; height: number };
        atlases.set(std.map.source.uuid, { width: img?.width ?? 0, height: img?.height ?? 0 });
        map ??= std.map;
        if (!uvAttr) meshesWithoutUv.add(part.mesh.name || material.name);
      }
      normalMap ??= std.normalMap ?? undefined;
      const br = brushForMaterial(material);
      const at = (k: number) => (index ? index.getX(k) : k);
      const uv = (k: number): P2 => [uvAttr.getX(at(k)), uvAttr.getY(at(k))];
      for (let k = grp.start; k + 2 < grp.start + grp.count; k += 3) {
        a.fromBufferAttribute(pos, at(k)).applyMatrix4(m);
        bv.fromBufferAttribute(pos, at(flip ? k + 2 : k + 1)).applyMatrix4(m);
        c.fromBufferAttribute(pos, at(flip ? k + 1 : k + 2)).applyMatrix4(m);
        b.tri([a.x, a.y, a.z], [bv.x, bv.y, bv.z], [c.x, c.y, c.z], br, uvAttr ? [uv(k), uv(flip ? k + 2 : k + 1), uv(flip ? k + 1 : k + 2)] : undefined);
      }
    }
  };

  const b = new MeshBuilder();
  for (const part of shellParts) emit(b, part);
  let lod1: CarModel['lod1'];
  if (lod1Parts.length) {
    const b1 = new MeshBuilder();
    for (const part of lod1Parts) emit(b1, part);
    lod1 = { shell: b1.build(), triangles: b1.triangles };
  }

  // Rodas (eixo em x): centro e largura pela caixa; o raio é o do vértice mais longe do eixo — a caixa
  // de um pneu de 12 lados mede cos 15° do raio, e o carro afundaria no chão.
  const wheel = (n: string) => {
    const pts = gamePoints(parts, n);
    const box = new THREE.Box3().setFromPoints(pts);
    const ctr = box.getCenter(new THREE.Vector3());
    let r = 0;
    for (const p of pts) r = Math.max(r, Math.hypot(p.y - ctr.y, p.z - ctr.z));
    // A roda é um disco com o eixo em x: o mais fino dos três lados é a largura (em x). Deitada, o jogo a giraria de lado.
    if (box.max.x - box.min.x >= Math.min(box.max.y - box.min.y, box.max.z - box.min.z)) {
      problems.push(`a roda ${n} está deitada: o eixo dela tem de ser o X (a largura, em x, é menor que o diâmetro)`);
    }
    return { z: ctr.z, x: Math.abs(ctr.x), r, w: box.max.x - box.min.x, ctr };
  };
  const wheels = Object.fromEntries(WHEEL_NODES.map((n) => [n, wheel(n)])) as Record<(typeof WHEEL_NODES)[number], ReturnType<typeof wheel>>;
  const axle = (l: (typeof WHEEL_NODES)[number], r: (typeof WHEEL_NODES)[number]): Axle => {
    const p = wheels[l]; const q = wheels[r];
    return { z: (p.z + q.z) / 2, x: (p.x + q.x) / 2, r: (p.r + q.r) / 2, w: (p.w + q.w) / 2 };
  };
  const front = axle('wheel_fl', 'wheel_fr');
  const rear = axle('wheel_rl', 'wheel_rr');

  // A roda do arquivo (a da frente à direita) em escala unitária — raio 1, largura 1, centro na origem, face de fora em
  // +x —, que é o formato que `wheels.ts` e as instâncias de roda usam (`scale(axle.w, axle.r, axle.r)`).
  const fr = wheels.wheel_fr;
  const unit = new THREE.Matrix4().makeScale(1 / fr.w, 1 / fr.r, 1 / fr.r).multiply(new THREE.Matrix4().makeTranslation(-fr.ctr.x, -fr.ctr.y, -fr.ctr.z));
  const wb = new MeshBuilder();
  for (const part of parts) if (part.under === 'wheel_fr') emit(wb, part, unit);
  const spokes = Number((nodes.get('wheel_fr')?.userData as { spokes?: unknown } | undefined)?.spokes);

  // O estilo dá a ordem das pinturas e o escape quando o arquivo não traz nenhum.
  const style = MODEL_BUILDERS[body]();
  const exhausts: P3[] = [];
  for (const n of EXHAUST_NODES) {
    const o = nodes.get(n);
    if (!o) continue;
    const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(TO_GAME);
    exhausts.push([p.x, p.y, p.z]);
  }

  // Contrato do asset: o que vem além do casco (kits, decals, seat) só é lido e conferido; o jogo ainda não o mostra.
  const trisOf = (p: Part) => { const g = p.mesh.geometry; return (g.getIndex() ? (g.getIndex()?.count ?? 0) : g.getAttribute('position').count) / 3; };
  const kits = new Map<string, number>();
  const decals = new Map<string, { triangles: number; hasUv: boolean; box: THREE.Box3 }>();
  for (const part of parts) {
    if (part.kit) kits.set(part.kit, (kits.get(part.kit) ?? 0) + trisOf(part));
    if (part.decal) {
      const d = decals.get(part.decal) ?? { triangles: 0, hasUv: true, box: new THREE.Box3() };
      d.triangles += trisOf(part);
      d.hasUv &&= !!part.mesh.geometry.getAttribute('uv');
      d.box.union(new THREE.Box3().setFromBufferAttribute(part.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).applyMatrix4(new THREE.Matrix4().multiplyMatrices(TO_GAME, part.mesh.matrixWorld)));
      decals.set(part.decal, d);
    }
  }
  const shell = b.build();
  const contract: CarContract = {
    seats: seats.map((o): P3 => { const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(TO_GAME); return [p.x, p.y, p.z]; }),
    kits: [...kits].map(([name, triangles]) => ({ name, triangles })),
    decals: [...decals].map(([name, d]) => {
      const size = d.box.getSize(new THREE.Vector3());
      return { name, triangles: d.triangles, hasUv: d.hasUv, flat: Math.min(size.x, size.y, size.z) <= CAR_LIMITS.maxDecalThickness };
    }),
    atlases: [...atlases.values()], meshesWithoutUv: [...meshesWithoutUv], lodNodes,
  };
  if (!seats.length && !carId) warnings.push('sem o vazio seat (onde o piloto senta): a câmera interna usará o ponto padrão do estilo; o contrato pede o seat');
  // Arquivo de um carro só: ele decide as próprias faixas (as camadas A/B que a malha tem). Arquivo de estilo: a ordem do estilo.
  let liveries = style.liveries;
  if (carId) {
    const layers = new Set<number>();
    const paint = shell.getAttribute('aPaint');
    for (let i = 0; i < paint.count; i++) layers.add(Math.round(paint.getZ(i) * 3));
    liveries = [(layers.has(1) || layers.has(3) ? LIVERY_A : 0) | (layers.has(2) || layers.has(3) ? LIVERY_B : 0)];
  }
  const model: CarModel = {
    body, shell, wheel: style.wheel, axles: [front, rear], exhausts: exhausts.length ? exhausts : style.exhausts,
    height: shell.boundingBox?.max.y ?? 0, liveries, triangles: b.triangles, contract,
    // `extras.project_wheel` no nó wheel_fr: a roda é a do catálogo do estilo (WHEEL_LISTS: acompanha a roda nova do projeto e a escolha
    // do jogador); o arquivo só dá posição e tamanho. Sem a marca, vale a roda do arquivo (o caso do Kenney e dos carros de arte própria de roda).
    ...((nodes.get('wheel_fr')?.userData as { project_wheel?: unknown } | undefined)?.project_wheel ? {} : {
      wheelModel: {
        design: style.wheel, geometry: wb.build(CREASE.wheel), triangles: wb.triangles,
        symmetry: (Math.PI * 2) / (Number.isFinite(spokes) && spokes > 0 ? spokes : DEFAULT_SPOKES),
      },
    }),
    ...(shellHasLadder ? { ladder: true } : {}),
    ...(carId ? { carId } : {}), ...(lod1 ? { lod1 } : {}), ...(map ? { map } : {}), ...(normalMap ? { normalMap } : {}),
  };
  return { model, problems: [...problems, ...checkCarModel(model, opts)], warnings: [...new Set(warnings)] };
}

/** Lê um .glb (ArrayBuffer) e devolve o modelo do jogo e os problemas. `opts.carId`: o arquivo é de um carro só; `opts.maxTriangles`: outro teto de casco (o herói). */
export async function parseCarGlb(body: CarBody, data: ArrayBuffer, opts: { carId?: string; maxTriangles?: number } = {}): Promise<GltfCar> {
  try {
    const gltf = await new GLTFLoader().parseAsync(data, '');
    return carModelFromGltf(body, gltf.scene, opts.carId, opts);
  } catch (e) {
    return { model: null, problems: [`o arquivo não abre como glTF: ${e instanceof Error ? e.message : String(e)}`], warnings: [] };
  }
}

/**
 * O casco HERÓI de um estilo (V9, `src/assets/cars/hero/<estilo>.glb`): o mesmo contrato dos carros da arte (nós, materiais, rodas do projeto, escapes), com o teto
 * `HERO_MAX_TRIANGLES`, e a geometria base do estilo intacta — a física, os rastros e a chama não podem notar a troca. Devolve os problemas de um e de outro.
 */
export async function parseHeroGlb(body: CarBody, data: ArrayBuffer): Promise<GltfCar> {
  const r = await parseCarGlb(body, data, { maxTriangles: HERO_MAX_TRIANGLES });
  if (!r.model) return r;
  return { ...r, problems: [...r.problems, ...heroProblems(r.model, MODEL_BUILDERS[body]())] };
}

/** O que o herói tem de manter do modelo de sempre: eixos, bitola e tamanho das rodas, escapes (2 cm) e a pegada (6 cm). */
export function heroProblems(hero: CarModel, base: CarModel): string[] {
  const out: string[] = [];
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
  hero.axles.forEach((a, i) => {
    for (const k of ['z', 'x', 'r', 'w'] as const) if (!near(a[k], base.axles[i][k], 0.02)) out.push(`o eixo ${i === 0 ? 'da frente' : 'de trás'} difere do modelo de sempre em ${k} (${a[k].toFixed(3)} × ${base.axles[i][k].toFixed(3)}): a física e a chama dependem dele`);
  });
  for (const b of base.exhausts) {
    const e = hero.exhausts.find((x) => Math.sign(x[0]) === Math.sign(b[0]));
    if (!e || [0, 1, 2].some((k) => !near(e[k], b[k], 0.02))) out.push(`o escapamento ${b[0] > 0 ? 'direito' : 'esquerdo'} não está onde o do modelo de sempre está (a chama do nitro sai dele)`);
  }
  const hb = hero.shell.boundingBox; const bb = base.shell.boundingBox;
  if (hb && bb) {
    for (const k of ['x', 'z'] as const) if (hb.max[k] > bb.max[k] + 0.06 || hb.max[k] < bb.max[k] - 0.06 || hb.min[k] > bb.min[k] + 0.06 || hb.min[k] < bb.min[k] - 0.06) out.push(`a pegada em ${k} sai de ±6 cm do modelo de sempre`);
    if (Math.abs(hb.max.y - bb.max.y) > 0.06) out.push(`a altura (${hb.max.y.toFixed(2)} m) sai de ±6 cm da do modelo de sempre (${bb.max.y.toFixed(2)} m)`);
    if (hb.min.y < 0.06 || hb.min.y > bb.min.y + 0.08) out.push(`o ponto mais baixo (${hb.min.y.toFixed(2)} m) sai da faixa do modelo de sempre`);
  }
  return out;
}
