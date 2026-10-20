// V9 (carro herói): o contrato do asset do Falcão GT em alta definição — `src/assets/cars/hero/gt.glb`, feito no Blender por script
// (`tools/blender/build_hero_gt.py`; superfície de subdivisão, 10 a 20 mil △). O .glb é o MESMO contrato dos carros da arte (nós, materiais, rodas do projeto,
// escapes, seat) com um casco bem mais detalhado: o jogo aplica tinta, faixas A/B, acento, roda, chama e verniz como no GT de sempre, e a física não muda
// (mesmos eixos, pegada e escapes). Sem logo nem emblema de marca.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { checkCarModel } from '../src/render/cars/check';
import { HERO_MAX_TRIANGLES } from '../src/render/cars/lod';
import { heroProblems, parseHeroGlb } from '../src/render/cars/gltf';
import type { CarModel } from '../src/render/cars/model';
import { buildModel } from '../src/render/cars/models';
import { probe, range } from './hct-probe';

const FILE = join(__dirname, '..', 'src', 'assets', 'cars', 'hero', 'gt.glb');
const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const BRANDS = new RegExp(`\\b(${['gol', 'palio', 'corsa', 'uno', 'fiat', 'vw', 'volks\\w*', 'chevrolet', 'peugeot', 'marea', 'mille', 'ferrari', 'lamborghini', 'porsche', 'mclaren', 'bugatti', 'koenigsegg', 'pagani', 'nissan', 'toyota', 'mazda', 'honda', 'dodge', 'ford', 'bmw', 'audi', 'mercedes'].join('|')})\\b`, 'i');
const EMBLEMS = /logo|emblem|badge|brand|marca|insignia|monogram/i;

function glbJson(buf: Buffer): { nodes: { name?: string }[]; materials: { name?: string }[]; meshes: { name?: string }[]; images?: unknown[]; textures?: unknown[] } {
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

/** Triângulos e malhas de cada parte nomeada (o nó e tudo abaixo dele). */
async function parts(buf: Buffer): Promise<{ tris: (prefix: string) => number; names: string[]; meshes: (prefix: string) => THREE.Mesh[] }> {
  const gltf = await new GLTFLoader().parseAsync(ab(buf), '');
  const names: string[] = [];
  const meshesOf = (prefix: string): THREE.Mesh[] => {
    const out: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => {
      if (!o.name.toLowerCase().startsWith(prefix)) return;
      o.traverse((c) => { if ((c as THREE.Mesh).isMesh && !out.includes(c as THREE.Mesh)) out.push(c as THREE.Mesh); });
    });
    return out;
  };
  gltf.scene.traverse((o) => { names.push(o.name.toLowerCase()); });
  const tris = (prefix: string): number => meshesOf(prefix).reduce((n, m) => { const g = m.geometry; return n + (g.getIndex() ? g.getIndex()!.count : g.getAttribute('position').count) / 3; }, 0);
  return { tris, names, meshes: meshesOf };
}

describe('o asset do herói (Falcão GT)', () => {
  let model: CarModel;
  let base: CarModel;
  let buf: Buffer;
  let json: ReturnType<typeof glbJson>;
  let P: Awaited<ReturnType<typeof parts>>;
  let problems: string[];
  beforeAll(async () => {
    expect(existsSync(FILE), 'falta src/assets/cars/hero/gt.glb (npm run carro-heroi)').toBe(true);
    buf = readFileSync(FILE);
    json = glbJson(buf);
    P = await parts(buf);
    const r = await parseHeroGlb('gt', ab(buf));
    problems = r.problems;
    model = r.model as CarModel;
    base = buildModel('gt');
  });

  it('o validador do jogo não acha problema (pegada, faróis na frente, lanternas atrás, escapes, faixas, orçamento do herói)', () => {
    expect(problems).toEqual([]);
    expect(model).toBeDefined();
  });

  it('orçamento: de 10.000 △ até HERO_MAX_TRIANGLES (casco todo, sem as rodas) e bem mais que o casco de sempre', () => {
    expect(model.triangles).toBeLessThanOrEqual(HERO_MAX_TRIANGLES);
    expect(model.triangles, 'herói magro demais: a folga é para o detalhe').toBeGreaterThanOrEqual(10000);
    expect(model.triangles / base.triangles, 'pelo menos o dobro do casco de sempre').toBeGreaterThanOrEqual(2);
    expect(checkCarModel({ ...model }).join('|'), 'acima do teto do casco normal, só o validador do herói o aceita').toContain('triângulos no casco');
  });

  it('mesma geometria base do GT: eixos, bitola e escapes iguais, pegada e altura dentro de 6 cm (a física e a chama não mudam)', () => {
    expect(heroProblems(model, base)).toEqual([]);
    for (let i = 0; i < 2; i++) {
      for (const k of ['z', 'x', 'r', 'w'] as const) expect(model.axles[i][k], `eixo ${i} ${k}`).toBeCloseTo(base.axles[i][k], 2);
    }
    expect(model.exhausts.length).toBe(2);
    for (const e of model.exhausts) {
      const b = base.exhausts.find((x) => Math.sign(x[0]) === Math.sign(e[0]))!;
      for (let k = 0; k < 3; k++) expect(e[k], `escape ${e[0] > 0 ? 'direito' : 'esquerdo'} ${k}`).toBeCloseTo(b[k], 2);
    }
    const a = model.shell.boundingBox!; const b = base.shell.boundingBox!;
    for (const k of ['x', 'z'] as const) {
      expect(a.max[k], `max ${k}`).toBeGreaterThan(b.max[k] - 0.06); expect(a.max[k]).toBeLessThan(b.max[k] + 0.06);
      expect(a.min[k], `min ${k}`).toBeGreaterThan(b.min[k] - 0.06); expect(a.min[k]).toBeLessThan(b.min[k] + 0.06);
    }
    expect(a.max.y).toBeGreaterThan(b.max.y - 0.06); expect(a.max.y).toBeLessThan(b.max.y + 0.06);
    expect(a.min.y).toBeGreaterThan(0.06); expect(a.min.y).toBeLessThan(b.min.y + 0.08);
  });

  it('nós e materiais do contrato: lod0, rodas do projeto, escapes e seat; pintura, faixas A e B, acento, vidro, farol e lanterna (coroa e miolo)', () => {
    expect(P.names, 'lod0').toContain('lod0');
    for (const n of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr', 'exhaust_l', 'exhaust_r', 'seat']) expect(P.names, n).toContain(n);
    expect(model.wheelModel, 'a roda é a do projeto (catálogo do estilo, a escolhida pelo jogador), não uma roda do arquivo').toBeUndefined();
    const mats = json.materials.map((m) => (m.name ?? '').toLowerCase());
    for (const want of ['paint', 'stripe_a', 'stripe_b', 'accent', 'glass', 'headlight', 'headlight_dim', 'taillight', 'taillight_dim', 'trim', 'chrome', 'plate']) {
      expect(mats.some((m) => m === want || m.startsWith(`${want}.`)), `material ${want}`).toBe(true);
    }
    const pr = probe(model);
    expect(pr.T.some((t) => pr.isA(t.i)) && pr.T.some((t) => pr.isB(t.i)), 'faixa A e faixa B na malha').toBe(true);
    expect(pr.T.some((t) => pr.accent(t.i)), 'acento (pinças) na malha').toBe(true);
  });

  it('simetria esquerda × direita (posição dos vértices, tolerância de 5 mm; fora as faixas de reflexo do céu nos vidros, que são diagonais de propósito)', () => {
    const pos = model.shell.getAttribute('position');
    const mat = model.shell.getAttribute('aMat');
    const key = (x: number, y: number, z: number) => `${Math.round(x * 200)},${Math.round(y * 200)},${Math.round(z * 200)}`;
    const set = new Set<string>();
    const mine: number[] = [];
    for (let i = 0; i < pos.count; i++) { if (mat.getY(i) > 0.99 && mat.getX(i) < 0.08) continue; mine.push(i); set.add(key(pos.getX(i), pos.getY(i), pos.getZ(i))); } // metal 1,0 e rugosidade baixa = o espelho do reflexo (o cromo é mais fosco e entra na conta)
    let miss = 0;
    for (const i of mine) {
      const [a, b, c] = key(-pos.getX(i), pos.getY(i), pos.getZ(i)).split(',').map(Number);
      const near = [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dz) => set.has(`${a + dx},${b + dy},${c + dz}`))));
      if (!near) miss++;
    }
    expect(miss / mine.length).toBeLessThan(0.01);
  });

  it('vão de roda: nenhum vértice do casco dentro do pneu e o pneu não fura a lataria (o casco passa do topo dele)', () => {
    const pos = model.shell.getAttribute('position');
    const pnt = model.shell.getAttribute('aPaint');
    for (const a of model.axles) {
      for (let i = 0; i < pos.count; i++) {
        if (pnt.getY(i) > 0.5) continue; // a pinça de freio (acento) mora DENTRO do aro, entre os raios, como a do GT de sempre
        const x = Math.abs(pos.getX(i));
        if (x > a.x - a.w / 2 + 0.01 && x < a.x + a.w / 2 - 0.01) expect(Math.hypot(pos.getZ(i) - a.z, pos.getY(i) - a.r), 'casco dentro da roda').toBeGreaterThan(a.r * 0.99);
      }
    }
    const P2 = probe(model);
    for (const ax of model.axles) {
      for (const dz of [-0.2, 0, 0.2]) {
        const top = ax.r + Math.sqrt(ax.r * ax.r - dz * dz);
        for (let x = ax.x - ax.w / 2 + 0.03; x <= ax.x + ax.w / 2 - 0.03; x += 0.08) {
          expect(P2.fromAbove(x, ax.z + dz)?.y ?? 0, `x = ${x.toFixed(2)}, z = ${(ax.z + dz).toFixed(2)}`).toBeGreaterThanOrEqual(top);
        }
      }
    }
  });

  it('vidro escuro, neutro, com caimento (0,70–0,92) e reflexo; faixa A de cima à vista; faixa B no vinco', () => {
    const pr = probe(model);
    const r = pr.glassTaper();
    expect(r).toBeGreaterThanOrEqual(0.7); expect(r).toBeLessThan(0.92);
    const cs = pr.glassColors();
    expect(cs.length).toBeGreaterThan(30);
    for (const [r0, g0, b0] of cs) {
      expect(0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0).toBeLessThan(0.03);
      expect(Math.max(r0, g0, b0) - Math.min(r0, g0, b0)).toBeLessThan(0.03);
    }
    for (const x of [0.22, -0.22]) {
      const hits = range(-2.1, 2.1, 0.05).map((z) => ({ z, h: pr.fromAbove(x, z) })).filter((h) => h.h && !pr.isGlass(h.h.i));
      expect(hits.filter((h) => h.h && pr.isA(h.h.i)).length / hits.length, `faixa A em x = ${x}`).toBeGreaterThanOrEqual(0.6);
    }
    let bandSeen = 0;
    for (const z of range(-0.75, 0.75, 0.05)) { const h = pr.fromSide(0.55 + 0.06 * (z + 0.75), z, 1); if (h && pr.isB(h.i)) bandSeen++; }
    expect(bandSeen, 'faixa B de lado, na altura do vinco').toBeGreaterThan(8);
  });

  it('a traseira é a estrela: 4 lanternas de LED com lente (miolo e coroa), em poço, mais LEDs; nenhuma lente rente à pele', () => {
    const pr = probe(model);
    const tails = pr.lensCenters((i) => pr.isTail(i));
    expect(tails.length, 'lentes em leque (miolo ≈ 0, borda ≈ 1)').toBeGreaterThanOrEqual(4);
    expect(tails.filter((p) => p[0] > 0).length).toBeGreaterThanOrEqual(2);
    for (const c of tails) expect(c[2], 'lanterna atrás').toBeGreaterThan(1.8);
    expect(P.tris('lamp_tail'), 'lanternas (moldura, poço, lente, LEDs)').toBeGreaterThanOrEqual(500);
    expect(P.tris('led'), 'LEDs desenhados').toBeGreaterThanOrEqual(80);
    // a lente de cada lanterna fica no fundo do poço: a moldura passa ≥ 1 cm dela
    const skin = Math.max(...pr.T.filter((t) => pr.painted(t.i) && t.n[2] > 0.9 && t.c[1] > 0.3 && t.c[1] < 0.9 && t.c[2] > 1.8).map((t) => t.c[2]));
    for (const c of tails) {
      const rim = pr.T.filter((t) => !pr.lit(t.i) && t.n[2] > 0.5 && Math.abs(t.c[1] - c[1]) < 0.12 && Math.abs(t.c[0] - c[0]) < 0.4 && t.c[2] > c[2] - 0.05);
      expect(rim.length, `moldura em x = ${c[0].toFixed(2)}`).toBeGreaterThan(0);
      expect(Math.max(...rim.map((t) => t.c[2])) - c[2], `x = ${c[0].toFixed(2)}`).toBeGreaterThanOrEqual(0.01);
      expect(Math.max(...rim.map((t) => t.c[2])) - skin, `x = ${c[0].toFixed(2)}`).toBeGreaterThanOrEqual(0.02);
    }
  });

  it('traseira: grade em colmeia, difusor com 7 aletas ou mais, escapes duplos de metal, placa lisa, asa com dois suportes', () => {
    expect(P.tris('grade_colmeia'), 'colmeia (células com moldura em relevo)').toBeGreaterThanOrEqual(300);
    expect(P.tris('difusor'), 'difusor').toBeGreaterThanOrEqual(200);
    const fins = new Set<number>();
    for (const m of P.meshes('difusor')) {
      m.updateWorldMatrix(true, false);
      const pos = m.geometry.getAttribute('position');
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); // glTF → jogo: x e z trocam de sinal
        if (-v.z > 2.0 && v.y < 0.4 && Math.abs(v.x) < 0.7) fins.add(Math.round((-v.x * 100) / 3));
      }
    }
    expect(fins.size, 'posições em x das aletas (a cada ≥ 3 cm)').toBeGreaterThanOrEqual(8);
    for (const side of ['l', 'r']) {
      expect(P.tris(`escape_${side}`), `escape ${side}`).toBeGreaterThanOrEqual(80);
      const ms = P.meshes(`escape_${side}`);
      const mat = ms.flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material])) as THREE.MeshStandardMaterial[];
      expect(mat.some((x) => x.metalness >= 0.8), `escape ${side} é de metal`).toBe(true);
      const box = new THREE.Box3();
      for (const m of ms) box.expandByObject(m);
      expect(Math.abs((box.min.x + box.max.x) / 2), 'escape em x = ±0,42').toBeGreaterThan(0.38); expect(Math.abs((box.min.x + box.max.x) / 2)).toBeLessThan(0.46);
    }
    expect(P.tris('placa'), 'placa').toBeGreaterThanOrEqual(2);
    expect(P.tris('placa'), 'placa lisa: sem texto, poucas faces').toBeLessThanOrEqual(80);
    expect(P.tris('asa'), 'lâmina da asa').toBeGreaterThanOrEqual(60);
    expect(P.tris('suporte'), 'dois suportes (pescoço) da asa').toBeGreaterThanOrEqual(40);
    expect(P.names.filter((n) => n.startsWith('suporte')).length, 'um suporte de cada lado').toBeGreaterThanOrEqual(2);
  });

  it('frente e lados: faróis de projetor embutidos, entradas de ar, retrovisores, maçanetas embutidas, frestas finas de porta e de capô', () => {
    expect(P.tris('farol_projetor'), 'projetores (disco, aro, lente) dos dois lados').toBeGreaterThanOrEqual(240);
    expect(P.tris('lamp_head'), 'faróis: carcaça, refletor, lente').toBeGreaterThanOrEqual(240);
    for (const side of ['l', 'r']) {
      expect(P.tris(`entrada_ar_${side}`), `entrada de ar ${side}`).toBeGreaterThanOrEqual(30);
      expect(P.tris(`retrovisor_${side}`), `retrovisor ${side}`).toBeGreaterThanOrEqual(40);
      expect(P.tris(`macaneta_${side}`), `maçaneta ${side}`).toBeGreaterThanOrEqual(8);
    }
    expect(P.tris('fresta_porta'), 'frestas de porta').toBeGreaterThanOrEqual(20);
    expect(P.tris('fresta_capo'), 'fresta do capô').toBeGreaterThanOrEqual(20);
    const fr = new THREE.Box3();
    for (const m of P.meshes('fresta')) fr.expandByObject(m);
    expect(fr.isEmpty(), 'frestas existem').toBe(false);
  });

  it('regra de marca: nenhum nome de marca ou modelo, nenhum logo ou emblema, nenhuma textura (a placa é lisa, sem texto)', () => {
    const names = [...json.nodes, ...json.materials, ...json.meshes].map((x) => x.name ?? '');
    for (const n of names) { expect(n, n).not.toMatch(BRANDS); expect(n, n).not.toMatch(EMBLEMS); }
    expect(json.images ?? [], 'sem imagem embutida').toHaveLength(0);
    expect(json.textures ?? [], 'sem textura').toHaveLength(0);
    expect(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8')).not.toMatch(BRANDS);
  });

  it('a licença está registrada em docs/ARTE.md (criação própria, sem terceiros)', () => {
    const arte = readFileSync(join(__dirname, '..', 'docs', 'ARTE.md'), 'utf8');
    const row = arte.split('\n').find((l) => l.startsWith('|') && l.includes('src/assets/cars/hero/gt.glb'));
    expect(row, 'linha da tabela de licenças com "src/assets/cars/hero/gt.glb"').toBeTruthy();
    expect(row).toMatch(/Criação própria/);
  });

  it('regra de marca: nada no código da ferramenta que gera o herói (tools/blender)', () => {
    const dir = join(__dirname, '..', 'tools', 'blender');
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    const files = walk(dir).filter((f) => /\.(py|md|sh|json)$/.test(f) && /hero|heroi/.test(f));
    expect(files.length, 'há o gerador do herói').toBeGreaterThanOrEqual(1);
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(BRANDS);
  });
});
