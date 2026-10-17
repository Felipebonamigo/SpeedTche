// Carros nacionais (docs/CARROS-NACIONAIS.md, docs/ondas/V6c-nacionais.md): Cuiabano e Tupiniquim, hatches LIVRES feitos no Blender por
// script (tools/blender/). O contrato do asset (nomes, orçamento, vão de roda, simetria, partes separadas), a regra de marca (nenhum nome de
// modelo ou marca no .glb nem no código da ferramenta) e a ligação ao jogo (dado, texto PT/EN, seletor).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CARS, AI_CAR_POOL } from '../src/core/data/cars';
import { CAR_LIMITS } from '../src/render/cars/check';
import { parseCarGlb } from '../src/render/cars/gltf';
import { buildModel } from '../src/render/cars/models';
import { installNodeImage } from '../scripts/lib/node-image';
import { setLanguage, t } from '../src/i18n';
import { carSilhouetteMarkup } from '../src/ui/screens/icons';
import '../src/i18n/core';
import '../src/career/strings';

beforeAll(installNodeImage);
const IDS = ['cuiabano', 'tupiniquim', 'caipora', 'pampeiro', 'barao', 'furgao'] as const;
/** Estilo de carroceria (o do `CarDef`) e o comprimento mínimo que o validador exige dele. */
const BODY: Record<(typeof IDS)[number], 'hatch' | 'sedan' | 'micro'> = { cuiabano: 'hatch', tupiniquim: 'hatch', caipora: 'hatch', pampeiro: 'hatch', barao: 'sedan', furgao: 'micro' };
const file = (id: string) => join(__dirname, '..', 'src', 'assets', 'cars', `${id}.glb`);
const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
/** O JSON do .glb (nomes de nó, malha e material). */
function glbJson(buf: Buffer): { nodes: { name?: string }[]; materials: { name?: string }[]; meshes: { name?: string }[] } {
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}
// A regra de marca: o padrão é montado em pedaços para este arquivo não se reprovar sozinho.
const BRANDS = new RegExp(`\\b(${['gol', 'palio', 'corsa', 'uno', 'fiat', 'vw', 'volks\\w*', 'chevrolet', 'peugeot', 'marea', 'mille'].join('|')})\\b`, 'i');

describe('carros nacionais: o asset do Blender', () => {
  for (const id of IDS) {
    describe(id, () => {
      let model: NonNullable<Awaited<ReturnType<typeof parseCarGlb>>['model']>;
      let json: ReturnType<typeof glbJson>;
      beforeAll(async () => {
        expect(existsSync(file(id)), `falta src/assets/cars/${id}.glb (npm run carros-blender)`).toBe(true);
        const buf = readFileSync(file(id));
        json = glbJson(buf);
        const r = await parseCarGlb(BODY[id], ab(buf), { carId: id });
        expect(r.problems).toEqual([]);
        expect(r.warnings).toEqual([]);
        model = r.model!;
      });

      it('orçamento: casco ≤ teto do jogo, lod1 ≤ 45% e há lod1', () => {
        expect(model.triangles).toBeLessThanOrEqual(CAR_LIMITS.maxShellTriangles);
        expect(model.lod1, 'sem nó lod1').toBeDefined();
        expect(model.lod1!.triangles).toBeLessThanOrEqual(Math.floor(model.triangles * 0.45));
        expect(model.triangles, 'casco magro demais para ser desenho de verdade').toBeGreaterThan(2500);
      });

      it('rodada 2: detalhe que lê de longe (casco entre 3.600 e 4.500 △), lanterna com coroa e miolo, faixa do projeto, roda do projeto', () => {
        expect(model.triangles, 'a folga do orçamento tem de virar detalhe').toBeGreaterThan(3600);
        const mats = json.materials.map((m) => (m.name ?? '').toLowerCase());
        expect(mats.filter((m) => m.startsWith('taillight')).length, 'lanterna: coroa (fraca) + miolo (forte)').toBeGreaterThanOrEqual(2);
        expect(mats.filter((m) => m.startsWith('headlight')).length, 'farol: coroa + miolo').toBeGreaterThanOrEqual(2);
        expect(mats.some((m) => m.startsWith('stripe_a') || m.startsWith('stripe_b')), 'faixa A ou B do projeto').toBe(true);
        expect(model.liveries[0], 'o jogo aplica a faixa do arquivo').not.toBe(0);
        expect(model.wheelModel, 'a roda é a do projeto (catálogo do estilo), não uma roda própria').toBeUndefined();
      });

      it('eixos e pegada do estilo do carro (o núcleo e os rastros não mudam): mesma posição e bitola das rodas', () => {
        const ref = buildModel(BODY[id]).axles;
        for (let i = 0; i < 2; i++) {
          expect(model.axles[i].z, `eixo ${i}`).toBeCloseTo(ref[i].z, 1);
          expect(model.axles[i].x, `bitola ${i}`).toBeCloseTo(ref[i].x, 1);
          expect(model.axles[i].r).toBeGreaterThan(0.33);
        }
        const bb = model.shell.boundingBox!;
        expect(bb.max.z - bb.min.z).toBeGreaterThan(BODY[id] === 'micro' ? 3.2 : 4.2);
        expect(bb.max.x - bb.min.x).toBeGreaterThan(1.8);
      });

      it('vão de roda: nenhum vértice do casco dentro do pneu, e o casco abraça a roda por cima', () => {
        const pos = model.shell.getAttribute('position');
        for (const a of model.axles) {
          let above = 0;
          for (let i = 0; i < pos.count; i++) {
            const x = Math.abs(pos.getX(i)); const dz = pos.getZ(i) - a.z; const dy = pos.getY(i) - a.r;
            if (x > a.x - a.w / 2 + 0.01 && x < a.x + a.w / 2 - 0.01) {
              expect(Math.hypot(dz, dy), 'casco dentro da roda').toBeGreaterThan(a.r * 0.99);
            }
            if (x > a.x - a.w / 2 - 0.2 && x < a.x + a.w / 2 + 0.2 && Math.abs(dz) < a.r * 0.8 && dy > a.r && dy < a.r + 0.2) above++;
          }
          expect(above, 'sem para-lama sobre a roda').toBeGreaterThan(12);
        }
      });

      it('simetria esquerda × direita (posição dos vértices, tolerância de 5 mm)', () => {
        const pos = model.shell.getAttribute('position');
        const key = (x: number, y: number, z: number) => `${Math.round(x * 200)},${Math.round(y * 200)},${Math.round(z * 200)}`;
        const set = new Set<string>();
        for (let i = 0; i < pos.count; i++) set.add(key(pos.getX(i), pos.getY(i), pos.getZ(i)));
        let miss = 0;
        for (let i = 0; i < pos.count; i++) {
          const k = key(-pos.getX(i), pos.getY(i), pos.getZ(i));
          const near = [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dz) => {
            const [a, b, c] = k.split(',').map(Number);
            return set.has(`${a + dx},${b + dy},${c + dz}`);
          })));
          if (!near) miss++;
        }
        expect(miss / pos.count).toBeLessThan(0.01);
      });

      it('partes separadas, cada uma com material próprio: pintura, vidro, farol, lanterna, para-choque, pneu e aro', () => {
        const mats = json.materials.map((m) => (m.name ?? '').toLowerCase());
        for (const want of ['paint', 'glass', 'headlight', 'taillight', 'trim', 'bumper', 'tire', 'rim']) {
          expect(mats.some((m) => m.startsWith(want)), `material ${want}`).toBe(true);
        }
        const nodes = json.nodes.map((n) => n.name ?? '');
        for (const want of ['body', 'lod0', 'lod1', 'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr', 'exhaust_l', 'exhaust_r', 'seat']) expect(nodes, want).toContain(want);
        expect(nodes.filter((n) => /^glass|^lamp_head|^lamp_tail/.test(n)).length, 'vidro, farol e lanterna como peças').toBeGreaterThanOrEqual(3);
      });

      it('regra de marca: nenhum nome de modelo ou marca em nó, malha, material ou no arquivo', () => {
        const names = [...json.nodes, ...json.materials, ...json.meshes].map((x) => x.name ?? '');
        for (const n of names) expect(n, n).not.toMatch(BRANDS);
        expect(file(id)).not.toMatch(BRANDS);
        const buf = readFileSync(file(id));
        expect(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'), 'texto do glTF (JSON)').not.toMatch(BRANDS);
      });
    });
  }

  it('regra de marca: nada no código da ferramenta (tools/blender)', () => {
    const dir = join(__dirname, '..', 'tools', 'blender');
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    const files = walk(dir).filter((f) => /\.(py|md|sh|json)$/.test(f));
    expect(files.length).toBeGreaterThan(2);
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(BRANDS);
  });
});

describe('carros nacionais: ligação ao jogo', () => {
  it('os dois primeiros são carros livres do estilo hatch, depois dos 7 livres de antes, e a IA segue com os 7 de antes', () => {
    const free = CARS.filter((c) => c.price === 0).map((c) => c.id);
    expect(free).toEqual(['falcao', 'trovao', 'tornado', 'camelo', 'saci', 'tatu', 'boto', 'cuiabano', 'tupiniquim']);
    for (const id of IDS) expect(CARS.find((c) => c.id === id)?.body, id).toBe(BODY[id]);
    expect(AI_CAR_POOL.map((c) => c.id)).toEqual(['falcao', 'trovao', 'tornado', 'camelo', 'saci', 'tatu', 'boto']);
  });

  it('a silhueta 2D dos menus é de cada carro (não a do estilo genérico) e todas diferem entre si', () => {
    const strip = (m: string) => m.replace(/id="[^"]*"|url\(#[^)]*\)/g, '');
    const marks = IDS.map((id) => {
      const car = CARS.find((x) => x.id === id)!;
      const generic = strip(carSilhouetteMarkup({ body: car.body, color: car.color, accent: car.accent }));
      const own = strip(carSilhouetteMarkup(car));
      expect(own, id).not.toBe(generic);
      return own;
    });
    expect(new Set(marks).size).toBe(IDS.length);
  });

  it('texto em PT e EN para cada um', () => {
    for (const lang of ['pt', 'en'] as const) {
      setLanguage(lang);
      for (const id of IDS) expect(t(`core.car.${id}.blurb`), `${lang} ${id}`).not.toBe(`core.car.${id}.blurb`);
    }
    setLanguage('pt');
  });
});
