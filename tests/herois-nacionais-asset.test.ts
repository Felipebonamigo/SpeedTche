// V17 (heróis dos nacionais livres): o contrato do asset dos DOIS carros que o jogador vê primeiro — Cuiabano (hatch quadrado) e Tupiniquim (hatch compacto de lanterna alta) —
// em alta definição, `src/assets/cars/hero/<id do carro>.glb`, feitos no Blender por script (`tools/blender/build_hero_nacional.py`; 10 a 20 mil △, `HERO_MAX_TRIANGLES`).
// Mesmo contrato dos outros heróis (nós, materiais, eixos, escapes, pegada: `heroi-asset.test.ts`, `herois-asset.test.ts`), com a base do PRÓPRIO carro (o `.glb` dele, não o hatch procedural),
// e o caráter de carro POPULAR em vez do de esportivo: lanterna vertical / em L com refletor e lente em dois tons, para-choque com friso, farol com refletor, retrovisores, maçanetas, limpador,
// antena, grade lisa, escapamento simples, placa lisa sem texto. Regra de marca (docs/CARROS-NACIONAIS.md): nada de nome, logo, grade-assinatura nem desenho exato de farol e lanterna.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { checkCarModel } from '../src/render/cars/check';
import { heroProblems, parseCarGlb, parseHeroGlb } from '../src/render/cars/gltf';
import { HERO_MAX_TRIANGLES } from '../src/render/cars/lod';
import type { CarModel } from '../src/render/cars/model';
import { installNodeFileReader } from '../scripts/lib/node-filereader';
import { installNodeImage } from '../scripts/lib/node-image';
import { probe } from './hct-probe';

const ROOT = join(__dirname, '..');
const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
// O padrão é montado em pedaços para este arquivo não se reprovar sozinho.
const BRANDS = new RegExp(`\\b(${['gol', 'palio', 'corsa', 'uno', 'fiat', 'vw', 'volks\\w*', 'chevrolet', 'peugeot', 'marea', 'mille', 'ferrari', 'lamborghini', 'porsche', 'nissan', 'toyota', 'honda', 'ford', 'bmw', 'audi', 'mercedes'].join('|')})\\b`, 'i');
const EMBLEMS = /logo|emblem|badge|brand|marca|insignia|monogram/i;

interface Spec {
  car: 'cuiabano' | 'tupiniquim';
  /** Lanterna: coluna vertical de cubos (Cuiabano) ou "L" invertido (Tupiniquim). */
  tail: 'vertical' | 'L';
  /** Altura mínima (m) do trecho aceso de cada lado, e quantas lentes em leque (células acesas) por lado. */
  tailMinH: number; tailLenses: number;
  /** A faixa do projeto que o carro usa: A (Cuiabano) ou B (Tupiniquim). */
  stripe: 'a' | 'b';
}

const SPECS: Spec[] = [
  { car: 'cuiabano', tail: 'vertical', tailMinH: 0.16, tailLenses: 2, stripe: 'a' },
  { car: 'tupiniquim', tail: 'L', tailMinH: 0.22, tailLenses: 1, stripe: 'b' },
];

/** O que um carro popular tem e um esportivo não (e o contrário): peças com o mínimo de triângulos; `_l`/`_r` existem dos dois lados. */
const PARTS: Record<string, number> = {
  lamp_tail: 600, lamp_head: 400, parachoque_frente: 120, parachoque_tras: 120, grade: 30, placa_frente: 2, placa_tras: 2,
  limpador: 30, antena: 12, escape_l: 60, fresta_porta: 24, fresta_capo: 6, fresta_tampa: 6, luz_freio: 8, tampa_comb: 12,
};
const SIDED: Record<string, number> = { retrovisor: 60, macaneta: 30, friso_lateral: 8, pisca_lateral: 8 };
/** Peças de esportivo que o herói de um popular NÃO leva. */
const ESPORTIVO = ['led', 'difusor', 'asa', 'suporte', 'grade_colmeia', 'naca', 'pincas', 'venezianas', 'entradas_frente', 'divisor'];

function glbJson(buf: Buffer): { nodes: { name?: string }[]; materials: { name?: string }[]; meshes: { name?: string }[]; images?: unknown[]; textures?: unknown[] } {
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

/** Triângulos e malhas de cada parte nomeada (o nó e tudo abaixo dele). */
async function parts(buf: Buffer): Promise<{ tris: (prefix: string) => number; names: string[]; meshes: (prefix: string) => THREE.Mesh[]; matNames: (prefix: string) => string[] }> {
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
  const matNames = (prefix: string): string[] => [...new Set(meshesOf(prefix).flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material]).map((x) => x.name.toLowerCase().replace(/\.\d+$/, ''))))];
  return { tris, names, meshes: meshesOf, matNames };
}

beforeAll(() => { installNodeFileReader(); installNodeImage(); });

for (const spec of SPECS) {
  const FILE = join(ROOT, 'src', 'assets', 'cars', 'hero', `${spec.car}.glb`);
  const OWN = join(ROOT, 'src', 'assets', 'cars', `${spec.car}.glb`);
  describe(`o asset do herói nacional: ${spec.car}`, () => {
    let model: CarModel;
    let base: CarModel;
    let buf: Buffer;
    let json: ReturnType<typeof glbJson>;
    let P: Awaited<ReturnType<typeof parts>>;
    let problems: string[];
    beforeAll(async () => {
      expect(existsSync(FILE), `falta src/assets/cars/hero/${spec.car}.glb (npm run carros-herois-nacionais)`).toBe(true);
      buf = readFileSync(FILE);
      json = glbJson(buf);
      P = await parts(buf);
      // a base é o PRÓPRIO carro (o .glb dele, de rodas, eixos e escapes diferentes do hatch procedural)
      base = (await parseCarGlb('hatch', ab(readFileSync(OWN)), { carId: spec.car })).model as CarModel;
      const r = await parseHeroGlb('hatch', ab(buf), { base, carId: spec.car });
      problems = r.problems;
      model = r.model as CarModel;
    });

    it('o validador do jogo não acha problema (pegada, faróis na frente, lanternas atrás, escapes, faixas, orçamento do herói) contra o .glb do próprio carro', () => {
      expect(problems).toEqual([]);
      expect(model).toBeDefined();
    });

    it('com a base do hatch procedural o herói seria recusado: a base certa é a do carro (as rodas e os escapes do arquivo dele diferem)', async () => {
      const r = await parseHeroGlb('hatch', ab(buf), { carId: spec.car });
      expect(r.problems.join('|'), 'o eixo do hatch procedural tem outro raio').toContain('o eixo');
    });

    it('orçamento: de 10.000 △ até HERO_MAX_TRIANGLES e pelo menos 2,3× o casco de sempre do carro', () => {
      expect(model.triangles).toBeLessThanOrEqual(HERO_MAX_TRIANGLES);
      expect(model.triangles, 'herói magro demais: a folga é para o detalhe').toBeGreaterThanOrEqual(10000);
      expect(model.triangles / base.triangles).toBeGreaterThanOrEqual(2.3);
      expect(checkCarModel({ ...model }).join('|'), 'acima do teto do casco normal, só o validador do herói o aceita').toContain('triângulos no casco');
    });

    it('mesma geometria base do carro: eixos, escapes, pegada e altura dentro de 6 cm', () => {
      expect(heroProblems(model, base)).toEqual([]);
      for (let i = 0; i < 2; i++) for (const k of ['z', 'x', 'r', 'w'] as const) expect(model.axles[i][k], `eixo ${i} ${k}`).toBeCloseTo(base.axles[i][k], 2);
      expect(model.exhausts.length).toBe(base.exhausts.length);
    });

    it('nós e materiais do contrato: lod0, rodas do projeto, escapes e seat; pintura, faixa do carro, vidro, farol e lanterna (coroa e miolo), âmbar, refletor, para-choque, placa', () => {
      expect(P.names, 'lod0').toContain('lod0');
      for (const n of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr', 'exhaust_l', 'exhaust_r', 'seat']) expect(P.names, n).toContain(n);
      expect(model.wheelModel, 'a roda é a do projeto (a escolhida pelo jogador), não uma roda do arquivo').toBeUndefined();
      const mats = json.materials.map((m) => (m.name ?? '').toLowerCase());
      for (const want of ['paint', `stripe_${spec.stripe}`, 'glass', 'headlight', 'headlight_dim', 'taillight', 'taillight_dim', 'amber', 'reflector', 'bumper', 'trim', 'chrome', 'plate']) {
        expect(mats.some((m) => m === want || m.startsWith(`${want}.`)), `material ${want}`).toBe(true);
      }
      const pr = probe(model);
      const bp = probe(base);
      const flank = (p: ReturnType<typeof probe>): number => p.T.filter((t) => (spec.stripe === 'a' ? p.isA(t.i) : p.isB(t.i)) && Math.abs(t.n[0]) > 0.5).reduce((s, t) => s + t.area, 0);
      expect(flank(pr), `faixa ${spec.stripe.toUpperCase()} no flanco`).toBeGreaterThan(0.4 * flank(bp));
    });

    it('é carro popular, não esportivo: nenhuma tira de LED, difusor, asa, colmeia, tomada NACA, pinça nem divisor de carbono', () => {
      for (const n of ESPORTIVO) expect(P.names.filter((x) => x.startsWith(n)), n).toEqual([]);
      for (const m of json.materials) expect((m.name ?? '').toLowerCase(), 'sem carbono').not.toMatch(/carbon|piano/);
    });

    it(spec.tail === 'vertical'
      ? 'a lanterna é uma COLUNA vertical de cubos por lado, em poço com refletor, lente em dois tons (vermelha, âmbar e a de ré clara)'
      : 'a lanterna é ALTA em "L" invertido por lado (a perna alta na lateral e o pé para dentro), em poço com refletor, lente em dois tons', () => {
      const pr = probe(model);
      const tails = pr.lensCenters((i) => pr.isTail(i));
      for (const sd of [1, -1]) {
        expect(tails.filter((p) => p[0] * sd > 0).length, `lentes em leque do lado ${sd}`).toBeGreaterThanOrEqual(1);
        const lit = pr.T.filter((t) => pr.isTail(t.i) && t.c[0] * sd > 0.2 && t.area > 1e-6 && t.n[2] > 0.3 && t.c[2] > 1.8); // fora a terceira luz de freio, no meio
        expect(lit.length, `lente acesa do lado ${sd}`).toBeGreaterThan(0);
        const vs = lit.flatMap((t) => [0, 1, 2].map((k) => t.i + k));
        const xs = vs.map((v) => pr.pos.getX(v)); const ys = vs.map((v) => pr.pos.getY(v));
        const w = Math.max(...xs) - Math.min(...xs); const h = Math.max(...ys) - Math.min(...ys);
        expect(h, `altura do trecho aceso (lado ${sd})`).toBeGreaterThanOrEqual(spec.tailMinH);
        // células acesas separadas por uma divisória (um vão de mais de 1 cm na altura dos vértices acesos)
        const yv = [...new Set(ys.map((y) => Math.round(y * 1000)))].sort((a, b) => a - b);
        const cells = 1 + yv.slice(1).filter((y, k) => y - yv[k] > 10).length;
        expect(cells, `células acesas do lado ${sd}`).toBeGreaterThanOrEqual(spec.tailLenses);
        if (spec.tail === 'vertical') expect(h / w, 'é uma coluna, mais alta que larga').toBeGreaterThanOrEqual(1.3);
        else {
          const area = lit.reduce((s, t) => s + t.area * Math.abs(t.n[2]), 0);
          expect(area / (w * h), 'o "L" tem um canto vazado: preenche bem menos que a caixa').toBeLessThan(0.8);
          expect(w, 'o pé do L avança para dentro').toBeGreaterThanOrEqual(0.2);
        }
      }
      for (const c of tails) expect(c[2], 'lanterna atrás').toBeGreaterThan(1.8);
      const mats = P.matNames('lamp_tail');
      for (const want of ['taillight', 'taillight_dim', 'amber', 'reflector', 'lens_clear', 'tail_well']) expect(mats, `lamp_tail leva ${want}`).toContain(want);
      expect(P.tris('lamp_tail')).toBeGreaterThanOrEqual(PARTS.lamp_tail);
      // o poço: a lente fica pelo menos 5 mm atrás da borda da moldura (refletor fundo, lente em dois tons)
      for (const c of tails) {
        const rim = pr.T.filter((t) => !pr.lit(t.i) && t.n[2] > 0.5 && Math.abs(t.c[1] - c[1]) < 0.14 && Math.abs(t.c[0] - c[0]) < 0.3 && t.c[2] > c[2] - 0.05);
        expect(rim.length, `moldura em x = ${c[0].toFixed(2)}`).toBeGreaterThan(0);
        expect(Math.max(...rim.map((t) => t.c[2])) - c[2], `a lente de x = ${c[0].toFixed(2)} fica no fundo do poço`).toBeGreaterThanOrEqual(0.005);
      }
    });

    it('o farol tem refletor e lente (coroa e miolo) em poço, mais o pisca âmbar, nos dois lados da frente', () => {
      const pr = probe(model);
      // lente do farol: triângulos acesos dos dois lados da frente, em quantidade de lente de verdade (o miolo e a coroa são leques; num farol comprido o `aLens` do leque não passa de 0,6)
      for (const sd of [1, -1]) {
        const lit = pr.T.filter((t) => pr.isHead(t.i) && t.c[0] * sd > 0);
        expect(lit.length, `triângulos acesos do farol do lado ${sd}`).toBeGreaterThanOrEqual(16);
        for (const t of lit) expect(t.c[2], 'farol na frente').toBeLessThan(-1.8);
        expect(lit.reduce((s, t) => s + t.area, 0), `área acesa do farol do lado ${sd}`).toBeGreaterThan(0.004);
      }
      const mats = P.matNames('lamp_head');
      for (const want of ['headlight', 'headlight_dim', 'reflector', 'amber']) expect(mats, `lamp_head leva ${want}`).toContain(want);
      expect(P.tris('lamp_head')).toBeGreaterThanOrEqual(PARTS.lamp_head);
    });

    it('peças do carro popular, com o mínimo de triângulos de cada uma (frente, traseira, lados, vidros)', () => {
      for (const [prefix, min] of Object.entries(PARTS)) expect(P.tris(prefix), prefix).toBeGreaterThanOrEqual(min);
      for (const [prefix, min] of Object.entries(SIDED)) for (const sd of ['l', 'r']) expect(P.tris(`${prefix}_${sd}`), `${prefix}_${sd}`).toBeGreaterThanOrEqual(min);
    });

    it('para-choques com friso (cromado) e a entrada de ar escura embaixo; a grade é lisa e escura; o escapamento é simples e de metal', () => {
      for (const nm of ['parachoque_frente', 'parachoque_tras']) {
        const mats = P.matNames(nm);
        expect(mats, `${nm}: o corpo do para-choque`).toContain('bumper');
        expect(mats, `${nm}: friso`).toContain('chrome');
      }
      expect(P.matNames('parachoque_frente'), 'entrada de ar escura').toContain('trim');
      const grille = P.matNames('grade');
      expect(grille.every((m) => ['trim', 'trim_soft', 'under', 'grille', 'chrome', 'bumper', 'paint'].includes(m)), `grade: ${grille.join(',')}`).toBe(true);
      expect(P.tris('grade'), 'grade lisa: poucas faces, sem colmeia nem lamelas à marca').toBeLessThanOrEqual(400);
      const mat = P.meshes('escape_l').flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material])) as THREE.MeshStandardMaterial[];
      expect(mat.some((x) => x.metalness >= 0.7), 'escape_l é de metal').toBe(true);
      expect(P.tris('escape_l'), 'ponteira simples: sem as 200+ faces de uma de esportivo').toBeLessThanOrEqual(200);
      expect(P.names.filter((n) => /^escape_[lr]$/.test(n)).length, 'a ponteira de verdade é uma só: a outra é um toco escuro que só dá lugar à chama').toBe(2);
      expect(P.tris('escape_r'), 'o toco do outro lado é bem menor que a ponteira').toBeLessThan(P.tris('escape_l') * 0.6);
    });

    it('as placas são brancas e lisas, sem texto: poucas faces, material plate, sem imagem nem textura', () => {
      for (const nm of ['placa_frente', 'placa_tras']) {
        expect(P.tris(nm), nm).toBeLessThanOrEqual(80);
        expect(P.matNames(nm), nm).toContain('plate');
      }
      expect(json.images ?? []).toHaveLength(0);
      expect(json.textures ?? []).toHaveLength(0);
    });

    it('simetria esquerda × direita (5 mm; fora o escapamento simples, a antena e a tampa do tanque, que são de um lado só de propósito, e o reflexo do céu nos vidros)', () => {
      const pos = model.shell.getAttribute('position');
      const mat = model.shell.getAttribute('aMat');
      const key = (x: number, y: number, z: number) => `${Math.round(x * 200)},${Math.round(y * 200)},${Math.round(z * 200)}`;
      const set = new Set<string>();
      const mine: number[] = [];
      for (let i = 0; i < pos.count; i++) {
        if (mat.getY(i) > 0.99 && mat.getX(i) < 0.08) continue;
        mine.push(i); set.add(key(pos.getX(i), pos.getY(i), pos.getZ(i)));
      }
      // assimetria de propósito, como no carro de verdade: o escapamento único (e o abafador à frente dele), a antena do para-lama, a tampa do tanque (só do lado direito) e os limpadores
      // (o do vidro de trás é um só; os da frente têm tamanhos diferentes)
      const exempt = (x: number, y: number, z: number): boolean => (z > 1.65 && y < 0.45 && Math.abs(Math.abs(x) - 0.42) < 0.14)
        || (z < -0.6 && z > -1.3 && y > 0.85 && y < 1.5 && Math.abs(x) > 0.5 && Math.abs(x) < 0.95)
        || (z > 1.3 && z < 2.0 && y > 0.6 && y < 1.0 && Math.abs(x) > 0.5)
        || (z < -0.1 && z > -0.9 && y > 0.9 && y < 1.4)
        || (z > 1.8 && y > 0.9 && y < 1.4);
      let miss = 0;
      for (const i of mine) {
        const [a, b, c] = key(-pos.getX(i), pos.getY(i), pos.getZ(i)).split(',').map(Number);
        const near = [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dz) => set.has(`${a + dx},${b + dy},${c + dz}`))));
        if (!near && !exempt(pos.getX(i), pos.getY(i), pos.getZ(i))) miss++;
      }
      expect(miss / mine.length).toBeLessThan(0.012);
    });

    it('vão de roda: o casco não entra no pneu mais do que o casco de sempre entra e o pneu não fura a lataria', () => {
      const deepest = (m: CarModel): number => {
        const pos = m.shell.getAttribute('position'); const pnt = m.shell.getAttribute('aPaint');
        let low = 9;
        for (const a of m.axles) {
          for (let i = 0; i < pos.count; i++) {
            if (pnt.getY(i) > 0.5) continue;
            const x = Math.abs(pos.getX(i));
            if (x > a.x - a.w / 2 + 0.01 && x < a.x + a.w / 2 - 0.01) low = Math.min(low, Math.hypot(pos.getZ(i) - a.z, pos.getY(i) - a.r) / a.r);
          }
        }
        return low;
      };
      expect(deepest(model), 'casco dentro da roda').toBeGreaterThan(Math.min(0.99, deepest(base) - 0.01));
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

    it('vidro escuro e neutro (luminância < 0,03); a cabine mantém o caimento do carro de sempre (no máximo 0,15 a mais)', () => {
      const pr = probe(model);
      const cs = pr.glassColors();
      expect(cs.length).toBeGreaterThan(30);
      for (const [r0, g0, b0] of cs) {
        expect(0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0).toBeLessThan(0.03);
        expect(Math.max(r0, g0, b0) - Math.min(r0, g0, b0)).toBeLessThan(0.03);
      }
      expect(pr.glassTaper()).toBeLessThan(Math.min(0.99, Math.max(0.95, probe(base).glassTaper() + 0.15)));
    });

    it('regra de marca: nenhum nome de marca ou modelo, nenhum logo ou emblema, nenhuma textura', () => {
      const names = [...json.nodes, ...json.materials, ...json.meshes].map((x) => x.name ?? '');
      for (const n of names) { expect(n, n).not.toMatch(BRANDS); expect(n, n).not.toMatch(EMBLEMS); }
      expect(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8')).not.toMatch(BRANDS);
    });

    it('a licença está registrada em docs/ARTE.md (criação própria, sem terceiros)', () => {
      const arte = readFileSync(join(ROOT, 'docs', 'ARTE.md'), 'utf8');
      const row = arte.split('\n').find((l) => l.startsWith('|') && l.includes(`src/assets/cars/hero/${spec.car}.glb`));
      expect(row, `linha da tabela de licenças com "src/assets/cars/hero/${spec.car}.glb"`).toBeTruthy();
      expect(row).toMatch(/Criação própria/);
    });
  });
}

describe('os heróis nacionais no conjunto dos heróis', () => {
  it('a pasta do herói só tem arquivos com teste de contrato: os estilos de V9/V15 e os dois nacionais livres', () => {
    const files = readdirSync(join(ROOT, 'src', 'assets', 'cars', 'hero')).filter((f) => f.endsWith('.glb')).map((f) => f.replace(/\.glb$/, '')).sort();
    expect(files).toEqual(['cuiabano', 'gt', 'hyper', 'muscle', 'prototype', 'rally', 'roadster', 'tupiniquim', 'wedge']);
  });

  it('o gerador (tools/blender): sem nome de marca ou modelo nos .py de herói dos nacionais', () => {
    const dir = join(ROOT, 'tools', 'blender');
    expect(existsSync(join(dir, 'build_hero_nacional.py')), 'falta tools/blender/build_hero_nacional.py').toBe(true);
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    const files = walk(dir).filter((f) => /\.py$/.test(f) && /hero_nac|hero_nacionais/.test(f));
    expect(files.length, 'o gerador e os dois carros').toBeGreaterThanOrEqual(3);
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(BRANDS);
  });
});
