// V19 (forma do casco NORMAL dos hatches nacionais): o casco de V6c (`src/assets/cars/<id>.glb`, ≤ 4.500 △) é o que a maioria das corridas vê (adversários, Média/Baixa, a distância) e
// seguia uma caixa lisa e angular. Aqui, as medidas de forma do V18 (`tests/forma-medidas.ts`) sobre o `.glb` NORMAL, com limiares de PROJETO (o que um hatch popular tem), escritos antes do
// arquivo novo: o V6c (teto 0,021 / virada 40° / para-lama −0,002 …) reprova. Mais o que não pode mudar: silhueta (caixa), eixos, pegada, △ por carro ≤ aos de V6c (o gate não absorve mais) e a lanterna.
// Limiares iguais aos do herói (`herois-forma.test.ts`), menos o para-lama (0,025: a pele do casco normal é nível 1, o bojo de 4,2 cm do herói vira ~3 cm).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseCarGlb } from '../src/render/cars/gltf';
import type { CarModel } from '../src/render/cars/model';
import { CAR_LIMITS } from '../src/render/cars/check';
import { installNodeFileReader } from '../scripts/lib/node-filereader';
import { installNodeImage } from '../scripts/lib/node-image';
import { formaDe, type Forma } from './forma-medidas';
import { probe } from './hct-probe';

const ROOT = join(__dirname, '..');
const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

/** Os △ do casco de V6c (docs/ondas/V6c-nacionais.md, `main` 0390778): o V19 não gasta nada além disso (o gate de △ já absorve só esses). */
const V6C_TRIANGLES: Record<string, number> = { cuiabano: 4348, tupiniquim: 3912, caipora: 4118, pampeiro: 3826 };
/** Lente de lanterna acesa vista de trás no V6c (cm², Σ área × |normal·z|, z > 1,8): a lanterna é o que se lê na câmera de corrida; não pode encolher mais que 10%. */
const V6C_TAIL_CM2: Record<string, number> = { cuiabano: 179, tupiniquim: 738, caipora: 329, pampeiro: 173 };
/** Caixa do casco de V6c (m): [x máx, y topo, z nariz, z traseira]; a silhueta é a do arquétipo e a pegada (|x| ≤ 1,0; |z| ≤ 2,35) é a da física. */
const V6C_BOX: Record<string, [number, number, number, number]> = {
  cuiabano: [0.99, 1.596, -2.18, 2.2], tupiniquim: [0.99, 1.631, -2.15, 2.21], caipora: [0.99, 1.608, -2.16, 2.22], pampeiro: [0.995, 1.57, -2.18, 2.2],
};
/** Onde medir o arco do teto: o do Caipora (vidro de trás inclinado, teto até 1,45 m) acaba antes de 1,5 m. */
const ROOF_Z: Record<string, [number, number, number]> = { cuiabano: [0, 0.7, 1.5], tupiniquim: [0, 0.7, 1.5], caipora: [0, 0.7, 1.3], pampeiro: [0, 0.7, 1.5] };

beforeAll(() => { installNodeFileReader(); installNodeImage(); });

for (const car of ['cuiabano', 'tupiniquim', 'caipora', 'pampeiro'] as const) {
  describe(`a forma do casco normal: ${car}`, () => {
    let model: CarModel;
    let forma: Forma;
    beforeAll(async () => {
      const r = await parseCarGlb('hatch', ab(readFileSync(join(ROOT, 'src', 'assets', 'cars', `${car}.glb`))), { carId: car });
      expect(r.problems).toEqual([]);
      model = r.model as CarModel;
      forma = formaDe(model, ROOF_Z[car]);
    });

    it('teto abaulado (meio ≥ 4 cm acima de 0,62 m do eixo) e canto que rola (virada do perfil ≤ 25° a cada 3 cm)', () => {
      expect(forma.roofCamber, 'abaulado transversal do teto').toBeGreaterThanOrEqual(0.04);
      expect(forma.roofTurn, 'virada máxima do perfil da seção').toBeLessThanOrEqual(25);
    });

    it('teto com arco longitudinal (o meio ≥ 2 cm acima da média das pontas)', () => {
      expect(forma.roofArch).toBeGreaterThanOrEqual(0.02);
    });

    it('cintura abaulada: a porta sai da soleira para a barriga em pelo menos 4 cm', () => {
      expect(forma.flankSweep).toBeGreaterThanOrEqual(0.04);
    });

    it('para-lamas bojudos: a lataria sobre a roda passa da lataria entre as rodas em pelo menos 2,5 cm', () => {
      expect(forma.fenderBulge).toBeGreaterThanOrEqual(0.025);
    });

    it('capô com caimento: o meio é ≥ 2 cm mais alto que a 0,7 m do eixo e a ponta cai ao menos 8 cm', () => {
      expect(forma.hoodCrown).toBeGreaterThanOrEqual(0.02);
      expect(forma.noseDrop).toBeGreaterThanOrEqual(0.08);
    });

    it(`orçamento: ≤ ${V6C_TRIANGLES[car]} △ (os de V6c; o teto é ${CAR_LIMITS.maxShellTriangles}) e o lod1 continua ≤ 45% do lod0`, () => {
      expect(model.triangles).toBeLessThanOrEqual(V6C_TRIANGLES[car]);
      expect(model.triangles).toBeLessThanOrEqual(CAR_LIMITS.maxShellTriangles);
      expect(model.lod1?.triangles ?? 0).toBeLessThanOrEqual(model.triangles * 0.45);
    });

    it('mesma silhueta e pegada de V6c: caixa do casco dentro de 2 cm (e de |x| ≤ 1,0), topo dentro de 3 cm, eixos onde estavam', () => {
      const bb = model.shell.boundingBox ?? (model.shell.computeBoundingBox(), model.shell.boundingBox);
      if (!bb) throw new Error('sem caixa');
      const [x, top, z0, z1] = V6C_BOX[car];
      expect(bb.max.x).toBeLessThanOrEqual(1.0);
      expect(bb.min.x).toBeGreaterThanOrEqual(-1.0);
      expect(Math.abs(bb.max.x - x)).toBeLessThanOrEqual(0.02);
      expect(Math.abs(bb.max.y - top)).toBeLessThanOrEqual(0.03);
      expect(Math.abs(bb.min.z - z0)).toBeLessThanOrEqual(0.02);
      expect(Math.abs(bb.max.z - z1)).toBeLessThanOrEqual(0.02);
      const zs = model.axles.map((a) => a.z).sort((a, b) => a - b);
      expect(zs[0]).toBeCloseTo(-1.34, 2);
      expect(zs[zs.length - 1]).toBeCloseTo(1.38, 2);
    });

    it(`a lanterna não encolhe: pelo menos 90% dos ${V6C_TAIL_CM2[car]} cm² de lente acesa de V6c`, () => {
      const P = probe(model);
      let area = 0;
      for (const t of P.T) if (P.isTail(t.i) && t.c[2] > 1.8 && t.n[2] > 0.3) area += t.area * t.n[2];
      expect(area * 1e4).toBeGreaterThanOrEqual(V6C_TAIL_CM2[car] * 0.9);
    });
  });
}
