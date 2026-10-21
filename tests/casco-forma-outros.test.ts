// V20 (forma do casco NORMAL dos oito nacionais que não são hatch): o V19 deu forma ao Cuiabano, Tupiniquim, Caipora e Pampeiro; aqui o Barão, o Furgãozinho, o Besouro, o Pão de Forma, o Gaúcho V8,
// o Trilheiro, o Lambari e o Jabuti. Cada um tem a forma do ARQUÉTIPO dele, não a do hatch: os limiares abaixo são POR CARRO e foram escritos ANTES dos arquivos novos (o V6c reprova todos).
// Medidas: `tests/forma-medidas.ts` (o mesmo medidor de V18/V19, com `MEDIDA_OUTROS` dizendo onde medir em cada carro). Contratos que NÃO mudam: silhueta de perfil, caixa/pegada, eixos, △ ≤ V6c e ≤ 4.500,
// lanterna, vidro. Nenhum limiar de teste existente foi tocado.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseCarGlb } from '../src/render/cars/gltf';
import type { CarBody } from '../src/core/types';
import type { CarModel } from '../src/render/cars/model';
import { CAR_LIMITS } from '../src/render/cars/check';
import { installNodeFileReader } from '../scripts/lib/node-filereader';
import { installNodeImage } from '../scripts/lib/node-image';
import { formaDe, lanternaDeTras, MEDIDA_OUTROS, perfilDoTopo, vidroLateral, type Forma } from './forma-medidas';

const ROOT = join(__dirname, '..');
const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const NAN = Number.NaN;

/** O V6c medido sobre os .glb de `main` 1d3215a (docs/ondas/V20-forma-outros.md §2): o que o V20 não pode piorar nem mudar. */
interface V6c { tri: number; box: [number, number, number, number]; axles: [number, number]; lamp: number; vidro: number; topo: number[]; body: CarBody }
const ZS_TOPO = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];
const V6C: Record<string, V6c> = {
  barao: { tri: 3344, box: [0.99, 1.592, -2.28, 2.35], axles: [-1.36, 1.32], lamp: 397, vidro: 5128, topo: [0.956, 0.991, 1.42, 1.585, 1.591, 1.563, 1.203, 1.045], body: 'sedan' },
  furgao: { tri: 3500, box: [0.985, 1.805, -1.83, 2.0], axles: [-1.1, 1.1], lamp: 179, vidro: 4816, topo: [0.914, 0.953, 1.132, 1.639, 1.673, 1.666, 1.455, NAN], body: 'micro' },
  besouro: { tri: 3976, box: [0.975, 1.491, -2.15, 2.22], axles: [-1.4, 1.4], lamp: 38, vidro: 5215, topo: [0.871, 0.973, 1.394, 1.469, 1.483, 1.36, 1.137, 0.852], body: 'classic' },
  paodeforma: { tri: 3668, box: [0.985, 1.852, -2.28, 2.29], axles: [-1.35, 1.32], lamp: 220, vidro: 10250, topo: [1.242, 1.789, 1.823, 1.839, 1.847, 1.851, 1.847, 1.507], body: 'pickup' },
  gaucho: { tri: 4028, box: [0.995, 1.406, -2.33, 2.322], axles: [-1.3, 1.3], lamp: 361, vidro: 2264, topo: [0.961, 0.985, 1.023, 1.32, 1.405, 1.342, 1.05, 0.987], body: 'muscle' },
  trilheiro: { tri: 3832, box: [0.99, 1.777, -2.15, 2.21], axles: [-1.35, 1.32], lamp: 105, vidro: 7133, topo: [1.039, 1.567, 1.761, 1.772, 1.777, 1.777, 1.513, 1.103], body: 'pickup' },
  lambari: { tri: 3750, box: [0.985, 1.359, -2.15, 2.21], axles: [-1.4, 1.4], lamp: 174, vidro: 4587, topo: [0.85, 0.884, 1.113, 1.344, 1.354, 1.282, 1.103, 0.905], body: 'classic' },
  jabuti: { tri: 3536, box: [0.985, 1.596, -1.81, 1.85], axles: [-1.1, 1.1], lamp: 122, vidro: 4665, topo: [0.892, 0.932, 1.075, 1.581, 1.594, 1.576, 1.002, NAN], body: 'micro' },
};

type Chave = keyof Forma;
/** Os limiares da forma de cada arquétipo: `min` = pelo menos, `max` = no máximo (m, ou graus para `roofTurn`). O porquê de cada número está no V20 §1. */
const LIMIARES: Record<string, { min: Partial<Record<Chave, number>>; max: Partial<Record<Chave, number>>; vidro: number }> = {
  // sedã: ombro largo e bojudo, teto que rola, tampa do porta-malas abaulada (o porta-malas ALTO é a silhueta, travada pelo perfil)
  barao: { min: { roofCamber: 0.04, flankSweep: 0.05, fenderBulge: 0.025, deckCrown: 0.02 }, max: { roofTurn: 25 }, vidro: 0.85 },
  // micro-caixa: cantos arredondados, teto com leve arco, o para-lama e o capô com algum caimento
  furgao: { min: { roofCamber: 0.04, roofArch: 0.02, flankSweep: 0.05, fenderBulge: 0.025, noseDrop: 0.08 }, max: { roofTurn: 25 }, vidro: 0.85 },
  jabuti: { min: { roofCamber: 0.04, roofArch: 0.02, flankSweep: 0.05, fenderBulge: 0.025, noseDrop: 0.08 }, max: { roofTurn: 25 }, vidro: 0.85 },
  // fusca: para-lamas bojudos e redondos (medidos de cima, `planBulge`: o vão de roda do Besouro come a altura em que os outros se medem), capô curto arredondado, teto em CÚPULA (abaulado e arco bem maiores que os do hatch), corpo de barriga
  besouro: { min: { roofCamber: 0.07, roofArch: 0.055, flankSweep: 0.05, planBulge: 0.05, noseDrop: 0.14 }, max: { roofTurn: 20 }, vidro: 0.85 },
  // furgão alto: cantos MUITO arredondados (virada do canto do teto ≤ 30°, V6c 52°: o teto é bem mais estreito que a caixa, a virada até a coluna não desce de ~27°), teto em leve arco, lataria sem barriga (só a cintura de 2 cm) mas com o para-lama saindo
  paodeforma: { min: { roofCamber: 0.04, roofArch: 0.035, flankSweep: 0.015, fenderBulge: 0.025 }, max: { roofTurn: 30 }, vidro: 0.85 },
  // muscle: "power bulge" no capô (o meio ≥ 4,5 cm acima da beira), ombro traseiro largo (bojo sobre a roda de trás ≥ 5 cm), cintura de garrafa, cabine recuada (a silhueta trava)
  gaucho: { min: { hoodCrown: 0.045, rearFender: 0.05, fenderBulge: 0.03, flankSweep: 0.05, roofCamber: 0.035, noseDrop: 0.12 }, max: { roofTurn: 25 }, vidro: 0.85 },
  // jipe: linhas retas MAS com raio nas arestas (virada ≤ 30°, V6c 50°), teto e lateral quase planos (os tetos do hatch, de 7 cm, seriam errados aqui), para-lamas expostos que saem da lateral
  trilheiro: { min: { roofCamber: 0.02, fenderBulge: 0.03 }, max: { roofTurn: 30, roofCamber: 0.05, roofArch: 0.025, flankSweep: 0.045, hoodCrown: 0.02 }, vidro: 0.85 },
  // cupê: teto que rola (abaulado ≥ 3,5 cm; a virada ≤ 36°: o medidor só vê a pintura e o teto cai em cúpula até o vidro, que aqui fica inteiro), cintura baixa (a lateral não infla: ≤ 7 cm), traseira inclinada e VIDRO GRANDE (a forma não pode encolher o vidro lateral nem 1%)
  lambari: { min: { roofCamber: 0.035, flankSweep: 0.04 }, max: { roofTurn: 36, flankSweep: 0.07 }, vidro: 1.0 },
};

beforeAll(() => { installNodeFileReader(); installNodeImage(); });

for (const car of Object.keys(V6C)) {
  describe(`a forma do casco normal: ${car}`, () => {
    let model: CarModel;
    let forma: Forma;
    const v = V6C[car];
    const L = LIMIARES[car];
    beforeAll(async () => {
      const r = await parseCarGlb(v.body, ab(readFileSync(join(ROOT, 'src', 'assets', 'cars', `${car}.glb`))), { carId: car });
      expect(r.problems).toEqual([]);
      model = r.model as CarModel;
      forma = formaDe(model, MEDIDA_OUTROS[car].roof, MEDIDA_OUTROS[car].onde);
    });

    it('a forma do arquétipo: cada medida dentro do limiar DESTE carro', () => {
      const falhas: string[] = [];  // todas de uma vez: o relatório diz o que falta em cada medida, não só a primeira
      for (const [k, lim] of Object.entries(L.min)) if (!(forma[k as Chave] >= (lim as number))) falhas.push(`${k} = ${forma[k as Chave].toFixed(3)} < ${lim}`);
      for (const [k, lim] of Object.entries(L.max)) if (!(forma[k as Chave] <= (lim as number))) falhas.push(`${k} = ${forma[k as Chave].toFixed(3)} > ${lim}`);
      expect(falhas, `${car}: fora do limiar do arquétipo`).toEqual([]);
    });

    it(`orçamento: ≤ ${v.tri} △ (os de V6c; o teto é ${CAR_LIMITS.maxShellTriangles}) e o lod1 continua ≤ 45% do lod0`, () => {
      expect(model.triangles).toBeLessThanOrEqual(v.tri);
      expect(model.triangles).toBeLessThanOrEqual(CAR_LIMITS.maxShellTriangles);
      expect(model.lod1?.triangles ?? 0).toBeLessThanOrEqual(model.triangles * 0.45);
    });

    it('mesma pegada de V6c: caixa do casco dentro de 2 cm (e |x| ≤ 1,0), topo dentro de 3 cm, eixos onde estavam', () => {
      const bb = model.shell.boundingBox ?? (model.shell.computeBoundingBox(), model.shell.boundingBox);
      if (!bb) throw new Error('sem caixa');
      const [x, top, z0, z1] = v.box;
      expect(bb.max.x).toBeLessThanOrEqual(1.0);
      expect(bb.min.x).toBeGreaterThanOrEqual(-1.0);
      expect(Math.abs(bb.max.x - x)).toBeLessThanOrEqual(0.02);
      expect(Math.abs(bb.max.y - top)).toBeLessThanOrEqual(0.03);
      expect(Math.abs(bb.min.z - z0)).toBeLessThanOrEqual(0.02);
      expect(Math.abs(bb.max.z - z1)).toBeLessThanOrEqual(0.02);
      const zs = model.axles.map((a) => a.z).sort((a, b) => a - b);
      expect(zs[0]).toBeCloseTo(v.axles[0], 2);
      expect(zs[zs.length - 1]).toBeCloseTo(v.axles[1], 2);
    });

    it('mesma silhueta de perfil: o alto do casco no eixo, a cada 50 cm, dentro de 4 cm do V6c (a cabine recuada, o porta-malas alto, a traseira inclinada ficam)', () => {
      const topo = perfilDoTopo(model, ZS_TOPO);
      ZS_TOPO.forEach((z, i) => {
        if (!Number.isFinite(v.topo[i])) return;
        expect(Number.isFinite(topo[i]), `z=${z}: sem casco`).toBe(true);
        expect(Math.abs(topo[i] - v.topo[i]), `z=${z}: ${topo[i]} × V6c ${v.topo[i]}`).toBeLessThanOrEqual(0.04);
      });
    });

    it(`a lanterna não encolhe (≥ 90% dos ${v.lamp} cm² de V6c) e o vidro lateral fica (≥ ${Math.round(L.vidro * 100)}% dos ${v.vidro} cm²)`, () => {
      expect(lanternaDeTras(model)).toBeGreaterThanOrEqual(v.lamp * 0.9);
      expect(vidroLateral(model)).toBeGreaterThanOrEqual(v.vidro * L.vidro);
    });
  });
}
