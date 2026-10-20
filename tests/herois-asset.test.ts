// V15 (heróis dos outros estilos): o contrato do asset de cada carro herói `Hull`-based além do Falcão GT — hyper (Pororoca V10), wedge (Iara Turbo), prototype (Beija-Flor),
// roadster (Curupira S) —, `src/assets/cars/hero/<estilo>.glb`, feitos no Blender por script (`tools/blender/build_hero.py`, gaiola exportada do `hull.ts` do estilo; 10 a 20 mil △).
// O mesmo contrato do GT herói (`heroi-asset.test.ts`): nós, materiais, rodas do projeto, escapes e seat do estilo, mesma pegada e mesmos eixos (a física e a chama não mudam), tinta,
// faixas A/B, acento, vidro e lanternas como no estilo de sempre; sem logo nem marca. As LANTERNAS em tira (o HC2 usa tiras de LED) valem para os estilos que pedem tira.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { checkCarModel } from '../src/render/cars/check';
import { heroProblems, parseHeroGlb } from '../src/render/cars/gltf';
import { HERO_MAX_TRIANGLES } from '../src/render/cars/lod';
import type { CarModel } from '../src/render/cars/model';
import { buildModel } from '../src/render/cars/models';
import { probe, range } from './hct-probe';

const ROOT = join(__dirname, '..');
const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const BRANDS = new RegExp(`\\b(${['gol', 'palio', 'corsa', 'uno', 'fiat', 'vw', 'volks\\w*', 'chevrolet', 'peugeot', 'marea', 'mille', 'ferrari', 'lamborghini', 'porsche', 'mclaren', 'bugatti', 'koenigsegg', 'pagani', 'nissan', 'toyota', 'mazda', 'honda', 'dodge', 'ford', 'bmw', 'audi', 'mercedes', 'jaguar', 'lotus', 'peugeot', 'countach', 'testarossa', 'laferrari', 'corvette', 'viper'].join('|')})\\b`, 'i');
const EMBLEMS = /logo|emblem|badge|brand|marca|insignia|monogram/i;

interface Spec {
  body: 'hyper' | 'wedge' | 'prototype' | 'roadster';
  car: string;
  /** Lanterna em TIRA larga (o HC2) ou redonda (a identidade do estilo). */
  tail: 'strip' | 'round';
  /** Tira: largura mínima de cada lado (m) e altura máxima; redonda: quantas lentes em leque. */
  tailMinW?: number; tailMaxH?: number; tailLenses?: number;
  exhausts: 1 | 2;
  /** Peças (prefixo do nome do nó) que o herói tem de trazer, com o mínimo de triângulos de cada uma. */
  parts: Record<string, number>;
  /** Peças que existem dos dois lados (`_l` e `_r`). */
  sided: Record<string, number>;
  /** Trechos de z (jogo) em que a faixa A tem de aparecer vista de cima em x = ±0,22. */
  stripeZ: Array<[number, number]>;
  /** Estilo de cabine fechada (vidro com caimento) ou aberto (roadster). */
  cabin: boolean;
}

const SPECS: Spec[] = [
  {
    body: 'hyper', car: 'pororoca', tail: 'strip', tailMinW: 0.45, tailMaxH: 0.24, exhausts: 2,
    parts: { lamp_tail: 500, led: 80, grade_colmeia: 150, difusor: 200, asa: 60, suporte: 40, lamp_head: 100, entradas_frente: 40, divisor: 8, fresta_porta: 20, venezianas: 30 },
    sided: { escape: 80, retrovisor: 40, entrada_ar: 40 }, stripeZ: [[-2.1, 2.1]], cabin: true,
  },
  {
    body: 'wedge', car: 'iara', tail: 'strip', tailMinW: 0.6, tailMaxH: 0.3, exhausts: 2,
    parts: { lamp_tail: 500, led: 80, placa: 2, difusor: 200, asa: 60, suporte: 40, lamp_head: 100, farol_popup: 60, divisor: 8, fresta_porta: 20, venezianas: 30 },
    sided: { escape: 80, retrovisor: 40, entrada_ar: 60 }, stripeZ: [[-2.1, 2.1]], cabin: true,
  },
  {
    body: 'prototype', car: 'beijaflor', tail: 'strip', tailMinW: 0.55, tailMaxH: 0.22, exhausts: 1,
    parts: { lamp_tail: 500, led: 80, difusor: 200, asa: 60, suporte: 40, lamp_head: 100, entradas_frente: 40, divisor: 8, barbatana: 12, painel_numero: 8, venezianas: 30 },
    sided: { retrovisor: 40, entrada_ar: 30 }, stripeZ: [[-2.1, 2.1]], cabin: true,
  },
  {
    body: 'roadster', car: 'curupira', tail: 'round', tailLenses: 4, exhausts: 2,
    parts: { lamp_tail: 500, led: 80, difusor: 150, lamp_head: 100, cockpit: 200, bancos: 150, piloto: 100, parabrisa: 20, santantonio: 40, corcovas: 20, painel_traseiro: 20 },
    sided: { escape: 80, retrovisor: 40, farol_redondo: 60 }, stripeZ: [[-2.1, -0.6], [0.9, 1.6]], cabin: false,
  },
];

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

for (const spec of SPECS) {
  const FILE = join(ROOT, 'src', 'assets', 'cars', 'hero', `${spec.body}.glb`);
  describe(`o asset do herói: ${spec.body} (${spec.car})`, () => {
    let model: CarModel;
    let base: CarModel;
    let buf: Buffer;
    let json: ReturnType<typeof glbJson>;
    let P: Awaited<ReturnType<typeof parts>>;
    let problems: string[];
    beforeAll(async () => {
      expect(existsSync(FILE), `falta src/assets/cars/hero/${spec.body}.glb (npm run carros-herois)`).toBe(true);
      buf = readFileSync(FILE);
      json = glbJson(buf);
      P = await parts(buf);
      const r = await parseHeroGlb(spec.body, ab(buf));
      problems = r.problems;
      model = r.model as CarModel;
      base = buildModel(spec.body);
    });

    it('o validador do jogo não acha problema (pegada, faróis na frente, lanternas atrás, escapes, faixas deste estilo, orçamento do herói)', () => {
      expect(problems).toEqual([]);
      expect(model).toBeDefined();
    });

    it('orçamento: de 10.000 △ até HERO_MAX_TRIANGLES (casco todo, sem as rodas) e pelo menos o dobro do casco de sempre', () => {
      expect(model.triangles).toBeLessThanOrEqual(HERO_MAX_TRIANGLES);
      expect(model.triangles, 'herói magro demais: a folga é para o detalhe').toBeGreaterThanOrEqual(10000);
      expect(model.triangles / base.triangles).toBeGreaterThanOrEqual(2);
      expect(checkCarModel({ ...model }).join('|'), 'acima do teto do casco normal, só o validador do herói o aceita').toContain('triângulos no casco');
    });

    it('mesma geometria base do estilo: eixos (por eixo, a frente e a traseira diferem), escapes iguais, pegada e altura dentro de 6 cm', () => {
      expect(heroProblems(model, base)).toEqual([]);
      for (let i = 0; i < 2; i++) for (const k of ['z', 'x', 'r', 'w'] as const) expect(model.axles[i][k], `eixo ${i} ${k}`).toBeCloseTo(base.axles[i][k], 2);
      expect(model.exhausts.length, 'a chama sai de tantas pontas quanto as do estilo').toBe(spec.exhausts);
      expect(model.exhausts.length).toBe(base.exhausts.length);
      for (const e of model.exhausts) {
        const b = base.exhausts.find((x) => Math.sign(x[0]) === Math.sign(e[0]))!;
        for (let k = 0; k < 3; k++) expect(e[k], `escape ${k}`).toBeCloseTo(b[k], 2);
      }
      const a = model.shell.boundingBox!; const b = base.shell.boundingBox!;
      for (const k of ['x', 'z'] as const) {
        expect(a.max[k]).toBeGreaterThan(b.max[k] - 0.06); expect(a.max[k]).toBeLessThan(b.max[k] + 0.06);
        expect(a.min[k]).toBeGreaterThan(b.min[k] - 0.06); expect(a.min[k]).toBeLessThan(b.min[k] + 0.06);
      }
      expect(a.max.y).toBeGreaterThan(b.max.y - 0.06); expect(a.max.y).toBeLessThan(b.max.y + 0.06);
      expect(a.min.y).toBeGreaterThan(0.06); expect(a.min.y).toBeLessThan(b.min.y + 0.08);
    });

    it('nós e materiais do contrato: lod0, rodas do projeto, escapes e seat; pintura, faixas A e B, acento, vidro, farol e lanterna (coroa e miolo)', () => {
      expect(P.names, 'lod0').toContain('lod0');
      for (const n of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr', 'exhaust_l', 'seat']) expect(P.names, n).toContain(n);
      if (spec.exhausts === 2) expect(P.names, 'exhaust_r').toContain('exhaust_r'); else expect(P.names, 'um escape só: um vazio só').not.toContain('exhaust_r');
      expect(model.wheelModel, 'a roda é a do projeto (a escolhida pelo jogador), não uma roda do arquivo').toBeUndefined();
      const mats = json.materials.map((m) => (m.name ?? '').toLowerCase());
      for (const want of ['paint', 'stripe_a', 'stripe_b', 'accent', 'glass', 'headlight', 'headlight_dim', 'taillight', 'taillight_dim', 'trim', 'chrome']) {
        expect(mats.some((m) => m === want || m.startsWith(`${want}.`)), `material ${want}`).toBe(true);
      }
      const pr = probe(model);
      const area = (want: (t: ReturnType<typeof probe>['T'][number]) => boolean): number => pr.T.filter(want).reduce((s, t) => s + t.area, 0);
      const bp = probe(base);
      const baseArea = (want: (t: ReturnType<typeof probe>['T'][number]) => boolean): number => bp.T.filter(want).reduce((s, t) => s + t.area, 0);
      expect(area((t) => pr.isA(t.i) && t.n[1] > 0.5), 'faixa A de cima').toBeGreaterThan(0.4 * baseArea((t) => bp.isA(t.i) && t.n[1] > 0.5));
      expect(area((t) => pr.isB(t.i) && Math.abs(t.n[0]) > 0.5), 'faixa B no flanco').toBeGreaterThan(0.4 * baseArea((t) => bp.isB(t.i) && Math.abs(t.n[0]) > 0.5));
      expect(pr.T.some((t) => pr.accent(t.i)), 'acento na malha').toBe(true);
    });

    it('simetria esquerda × direita (5 mm; fora o reflexo do céu nos vidros e o piloto do roadster, à esquerda de propósito)', () => {
      const pos = model.shell.getAttribute('position');
      const mat = model.shell.getAttribute('aMat');
      const key = (x: number, y: number, z: number) => `${Math.round(x * 200)},${Math.round(y * 200)},${Math.round(z * 200)}`;
      const set = new Set<string>();
      const mine: number[] = [];
      for (let i = 0; i < pos.count; i++) {
        if (mat.getY(i) > 0.99 && mat.getX(i) < 0.08) continue; // o espelho do reflexo
        if (spec.body === 'roadster' && pos.getX(i) < -0.05 && pos.getX(i) > -0.7 && pos.getY(i) > 0.55 && pos.getZ(i) > -0.45 && pos.getZ(i) < 0.75) continue; // o piloto, o volante e o banco dele, à esquerda
        if (spec.body === 'roadster' && pos.getX(i) > 0.05 && pos.getX(i) < 0.7 && pos.getY(i) > 0.55 && pos.getZ(i) > -0.45 && pos.getZ(i) < 0.75) continue; // e o banco do outro lado, sem piloto
        mine.push(i); set.add(key(pos.getX(i), pos.getY(i), pos.getZ(i)));
      }
      let miss = 0;
      for (const i of mine) {
        const [a, b, c] = key(-pos.getX(i), pos.getY(i), pos.getZ(i)).split(',').map(Number);
        const near = [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dz) => set.has(`${a + dx},${b + dy},${c + dz}`))));
        if (!near && !(spec.exhausts === 1 && Math.abs(pos.getX(i)) < 0.02)) miss++;
      }
      expect(miss / mine.length).toBeLessThan(0.012);
    });

    it('vão de roda: o casco não entra no pneu mais do que o casco de sempre entra (o teto do vão do estilo é preso 10 cm abaixo da borda do para-lama) e o pneu não fura a lataria', () => {
      /** O ponto do casco mais fundo dentro do pneu (distância ao centro da roda ÷ raio; a pinça de freio mora DENTRO do aro e não conta). */
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

    it('vidro escuro e neutro (luminância < 0,03) com reflexo; cabine fechada: caimento de 0,70 até o do estilo; faixa A de cima à vista onde o estilo a tem', () => {
      const pr = probe(model);
      const cs = pr.glassColors();
      expect(cs.length).toBeGreaterThan(spec.cabin ? 30 : 8);
      for (const [r0, g0, b0] of cs) {
        expect(0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0).toBeLessThan(0.03);
        expect(Math.max(r0, g0, b0) - Math.min(r0, g0, b0)).toBeLessThan(0.03);
      }
      if (spec.cabin) { const r = pr.glassTaper(); expect(r).toBeGreaterThanOrEqual(0.7); expect(r, 'caimento do vidro: o do estilo de sempre, no máximo 0,15 a mais (as colunas finas do herói alargam o vidro; parede reta = 1)').toBeLessThan(Math.min(0.99, Math.max(0.95, probe(base).glassTaper() + 0.15))); }
      for (const x of [0.22, -0.22]) {
        for (const [z0, z1] of spec.stripeZ) {
          const hits = range(z0, z1, 0.05).map((z) => ({ z, h: pr.fromAbove(x, z) })).filter((h) => h.h && !pr.isGlass(h.h.i));
          expect(hits.filter((h) => h.h && pr.isA(h.h.i)).length / hits.length, `faixa A em x = ${x}, z ${z0}…${z1}`).toBeGreaterThanOrEqual(0.5);
        }
      }
    });

    if (spec.tail === 'strip') {
      it(`a traseira é a estrela, em TIRA de LED larga: uma lente em leque por lado de pelo menos ${spec.tailMinW} m e no máximo ${spec.tailMaxH} m de altura, em poço, mais LEDs`, () => {
        const pr = probe(model);
        const tails = pr.lensCenters((i) => pr.isTail(i));
        expect(tails.filter((p) => p[0] > 0).length, 'lentes à direita').toBeGreaterThanOrEqual(1);
        expect(tails.filter((p) => p[0] < 0).length, 'lentes à esquerda').toBeGreaterThanOrEqual(1);
        for (const c of tails) expect(c[2], 'lanterna atrás').toBeGreaterThan(1.8);
        for (const sd of [1, -1]) {
          const lit = pr.T.filter((t) => pr.isTail(t.i) && t.c[0] * sd > 0 && t.area > 2e-5 && t.n[2] > 0.3 && t.c[2] > 1.8);
          expect(lit.length, `tira acesa do lado ${sd}`).toBeGreaterThan(0);
          const vs = lit.flatMap((t) => [0, 1, 2].map((k) => t.i + k));
          const xs = vs.map((v) => pr.pos.getX(v)); const ys = vs.map((v) => pr.pos.getY(v));
          const w = Math.max(...xs) - Math.min(...xs); const h = Math.max(...ys) - Math.min(...ys);
          expect(w, `largura da tira (lado ${sd})`).toBeGreaterThanOrEqual(spec.tailMinW!);
          expect(h, `altura da tira (lado ${sd})`).toBeLessThanOrEqual(spec.tailMaxH!);
          expect(w / Math.max(h, 1e-3), 'é uma tira, não um disco').toBeGreaterThanOrEqual(2);
        }
        expect(P.tris('lamp_tail'), 'lanternas (moldura, poço, lente, divisórias)').toBeGreaterThanOrEqual(spec.parts.lamp_tail);
        expect(P.tris('led'), 'LEDs desenhados').toBeGreaterThanOrEqual(spec.parts.led);
        for (const c of tails) {
          const rim = pr.T.filter((t) => !pr.lit(t.i) && t.n[2] > 0.5 && Math.abs(t.c[1] - c[1]) < 0.12 && Math.abs(t.c[0] - c[0]) < 0.5 && t.c[2] > c[2] - 0.05);
          expect(rim.length, `moldura em x = ${c[0].toFixed(2)}`).toBeGreaterThan(0);
          expect(Math.max(...rim.map((t) => t.c[2])) - c[2], `a lente de x = ${c[0].toFixed(2)} fica no fundo do poço (≥ 1 cm)`).toBeGreaterThanOrEqual(0.01);
        }
        const baseLit = probe(base).T.filter((t) => probe(base).isTail(t.i) && t.n[2] > 0.3).reduce((s, t) => s + t.area, 0);
        const heroLit = pr.T.filter((t) => pr.isTail(t.i) && t.n[2] > 0.3).reduce((s, t) => s + t.area, 0);
        expect(heroLit, 'a tira acesa tem pelo menos metade da área acesa da lanterna de sempre').toBeGreaterThanOrEqual(0.5 * baseLit);
      });
    } else {
      it(`a traseira: ${spec.tailLenses} lanternas redondas de LED com lente (miolo e coroa), em poço, mais LEDs`, () => {
        const pr = probe(model);
        const tails = pr.lensCenters((i) => pr.isTail(i));
        expect(tails.length, 'lentes em leque').toBeGreaterThanOrEqual(spec.tailLenses!);
        expect(tails.filter((p) => p[0] > 0).length).toBeGreaterThanOrEqual(2);
        for (const c of tails) expect(c[2], 'lanterna atrás').toBeGreaterThan(1.8);
        expect(P.tris('lamp_tail')).toBeGreaterThanOrEqual(spec.parts.lamp_tail);
        expect(P.tris('led')).toBeGreaterThanOrEqual(spec.parts.led);
        for (const c of tails) {
          const rim = pr.T.filter((t) => !pr.lit(t.i) && t.n[2] > 0.5 && Math.abs(t.c[1] - c[1]) < 0.12 && Math.abs(t.c[0] - c[0]) < 0.4 && t.c[2] > c[2] - 0.05);
          expect(rim.length, `moldura em x = ${c[0].toFixed(2)}`).toBeGreaterThan(0);
          expect(Math.max(...rim.map((t) => t.c[2])) - c[2], `x = ${c[0].toFixed(2)}`).toBeGreaterThanOrEqual(0.01);
        }
      });
    }

    it('peças do estilo, com o mínimo de triângulos de cada uma (traseira, frente, lados, asa e cabine)', () => {
      for (const [prefix, min] of Object.entries(spec.parts)) expect(P.tris(prefix), prefix).toBeGreaterThanOrEqual(min);
      for (const [prefix, min] of Object.entries(spec.sided)) for (const sd of ['l', 'r']) expect(P.tris(`${prefix}_${sd}`), `${prefix}_${sd}`).toBeGreaterThanOrEqual(min);
    });

    it('traseira: difusor com mais aletas que o de sempre, escapes de metal, asa com os dois suportes do estilo', () => {
      const fins = new Set<number>();
      for (const m of P.meshes('difusor')) {
        m.updateWorldMatrix(true, false);
        const pos = m.geometry.getAttribute('position');
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); // glTF → jogo: x e z trocam de sinal
          if (-v.z > 2.0 && v.y < 0.45 && Math.abs(v.x) < 0.8) fins.add(Math.round((-v.x * 100) / 3));
        }
      }
      const baseFins = { hyper: 7, wedge: 6, prototype: 8, roadster: 4 }[spec.body];
      expect(fins.size, `posições em x das aletas (≥ ${baseFins + 2})`).toBeGreaterThanOrEqual(baseFins + 2);
      for (const nm of spec.exhausts === 2 ? ['escape_l', 'escape_r'] : ['escape_l']) {
        expect(P.tris(nm), nm).toBeGreaterThanOrEqual(80);
        const ms = P.meshes(nm);
        const mat = ms.flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material])) as THREE.MeshStandardMaterial[];
        expect(mat.some((x) => x.metalness >= 0.8), `${nm} é de metal`).toBe(true);
      }
      if (spec.body !== 'roadster') {
        expect(P.names.filter((n) => n.startsWith('suporte')).length, 'suportes da asa').toBeGreaterThanOrEqual(2);
        const wing = new THREE.Box3();
        for (const m of P.meshes('asa')) wing.expandByObject(m);
        const bw = base.shell.boundingBox!;
        expect(Math.abs(wing.min.z), 'a asa chega ao fim do carro (a mesma pegada de sempre)').toBeGreaterThan(bw.max.z - 0.35);
      }
    });

    it('regra de marca: nenhum nome de marca ou modelo, nenhum logo ou emblema, nenhuma textura (a placa, onde há, é lisa)', () => {
      const names = [...json.nodes, ...json.materials, ...json.meshes].map((x) => x.name ?? '');
      for (const n of names) { expect(n, n).not.toMatch(BRANDS); expect(n, n).not.toMatch(EMBLEMS); }
      expect(json.images ?? [], 'sem imagem embutida').toHaveLength(0);
      expect(json.textures ?? [], 'sem textura').toHaveLength(0);
      expect(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8')).not.toMatch(BRANDS);
      if (P.tris('placa') > 0) expect(P.tris('placa'), 'placa lisa: sem texto, poucas faces').toBeLessThanOrEqual(80);
    });

    it('a licença está registrada em docs/ARTE.md (criação própria, sem terceiros)', () => {
      const arte = readFileSync(join(ROOT, 'docs', 'ARTE.md'), 'utf8');
      const row = arte.split('\n').find((l) => l.startsWith('|') && l.includes(`src/assets/cars/hero/${spec.body}.glb`));
      expect(row, `linha da tabela de licenças com "src/assets/cars/hero/${spec.body}.glb"`).toBeTruthy();
      expect(row).toMatch(/Criação própria/);
    });
  });
}

describe('a gaiola de cada herói segue o estilo de sempre (a exportação do hull.ts não envelheceu)', () => {
  for (const spec of SPECS) {
    it(`${spec.body}: tools/blender/hero/${spec.body}-gaiola.json tem os mesmos eixos e pontas do estilo, anéis de 26 pontos e seções da cabine`, () => {
      const file = join(ROOT, 'tools', 'blender', 'hero', `${spec.body}-gaiola.json`);
      expect(existsSync(file), `falta ${spec.body}-gaiola.json (npx tsx tools/blender/hero/exportar-gaiola.ts ${spec.body})`).toBe(true);
      const cage = JSON.parse(readFileSync(file, 'utf8')) as { axles: Array<{ z: number; r: number; x: number; w: number }>; zFront: number; zBack: number; stations: Array<{ ring: number[][] }>; cabin: unknown[] | null };
      const base = buildModel(spec.body);
      cage.axles.forEach((a, i) => { for (const k of ['z', 'r', 'x', 'w'] as const) expect(a[k], `eixo ${i} ${k}`).toBeCloseTo(base.axles[i][k], 3); });
      expect(cage.zFront).toBeCloseTo(-2.2, 3); expect(cage.zBack).toBeCloseTo(2.2, 3);
      for (const s of cage.stations) expect(s.ring.length).toBe(26);
      if (spec.cabin) expect(cage.cabin).toHaveLength(4); else expect(cage.cabin).toBeNull();
    });
  }
  it('a pasta do herói só tem os estilos que têm teste de contrato aqui (e o GT, que tem o dele)', () => {
    const files = readdirSync(join(ROOT, 'src', 'assets', 'cars', 'hero')).filter((f) => f.endsWith('.glb')).map((f) => f.replace(/\.glb$/, '')).sort();
    expect(files).toEqual(['gt', ...SPECS.map((s) => s.body)].sort());
  });
});

describe('regra de marca: nada no código das ferramentas que geram os heróis (tools/blender)', () => {
  it('nenhum nome de marca ou modelo nos .py, .ts, .json e .sh de herói', () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    const files = walk(join(ROOT, 'tools', 'blender')).filter((f) => /\.(py|md|sh|json|ts)$/.test(f) && /hero|heroi/.test(f));
    expect(files.length, 'há os geradores dos heróis').toBeGreaterThanOrEqual(6);
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(BRANDS);
  });
});
