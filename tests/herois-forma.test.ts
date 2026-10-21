// V18 (forma dos heróis nacionais): o casco do Cuiabano e do Tupiniquim tem de ser CURVO, não só detalhado. O V17 deu relevo a lanterna, farol e para-choque, mas a lataria seguia uma caixa de
// painéis planos (teto reto, para-lama só arco colado, canto do teto em chanfro de 45 graus). Aqui, medidas de forma sobre o `.glb` entregue (`tests/forma-medidas.ts`), com limiares de PROJETO:
// o que um carro popular de verdade tem. Os limiares NÃO vêm do arquivo novo: o V17 (Cuiabano roofCamber 0,021 / flankSweep 0,021 / fenderBulge −0,001 / hoodCrown 0,009 / roofTurn 40;
// Tupiniquim 0,023 / 0,026 / −0,001 / 0,015 / 33,5) reprova em quase todos, o novo passa. E o orçamento: o herói não pode gastar a folga do gate (docs/ondas/V17-herois-nacionais.md): os
// triângulos de cada herói ficam ≤ aos do V17 (16.050 e 16.416).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseCarGlb, parseHeroGlb } from '../src/render/cars/gltf';
import { HERO_MAX_TRIANGLES } from '../src/render/cars/lod';
import type { CarModel } from '../src/render/cars/model';
import { installNodeFileReader } from '../scripts/lib/node-filereader';
import { installNodeImage } from '../scripts/lib/node-image';
import { formaDe, type Forma } from './forma-medidas';
import { probe } from './hct-probe';

const ROOT = join(__dirname, '..');
const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

/** Os triângulos do herói de V17 (`docs/ondas/V17-herois-nacionais.md`): o teto de V18, porque o pior caso do gate (copa-4p Alta/Ultra, 4 humanos de nacionais) só tem ~5% de folga. */
/** Área acesa mínima da lanterna vista de trás (cm², Σ área × |normal·z|): o V17 tinha 351 (Cuiabano) e 849 (Tupiniquim); a lanterna é o que se lê a ~10 m na câmera de corrida. */
const TAIL_LIT_MIN_CM2: Record<string, number> = { cuiabano: 400, tupiniquim: 960 };

const V17_TRIANGLES: Record<string, number> = { cuiabano: 16050, tupiniquim: 16416 };

beforeAll(() => { installNodeFileReader(); installNodeImage(); });

for (const car of ['cuiabano', 'tupiniquim'] as const) {
  describe(`a forma do herói nacional: ${car}`, () => {
    let model: CarModel;
    let forma: Forma;
    beforeAll(async () => {
      const file = join(ROOT, 'src', 'assets', 'cars', 'hero', `${car}.glb`);
      expect(existsSync(file)).toBe(true);
      const base = (await parseCarGlb('hatch', ab(readFileSync(join(ROOT, 'src', 'assets', 'cars', `${car}.glb`))), { carId: car })).model as CarModel;
      const r = await parseHeroGlb('hatch', ab(readFileSync(file)), { base, carId: car });
      expect(r.problems).toEqual([]);
      model = r.model as CarModel;
      forma = formaDe(model);
    });

    it('teto abaulado: o meio é pelo menos 4 cm mais alto que a 0,62 m do eixo, e o canto do teto rola (a virada do perfil a cada 3 cm é de no máximo 25 graus (raio de uns 7 cm), não um chanfro de 40)', () => {
      expect(forma.roofCamber, 'abaulado transversal do teto').toBeGreaterThanOrEqual(0.04);
      expect(forma.roofTurn, 'virada máxima do perfil da seção').toBeLessThanOrEqual(25);
    });

    it('teto com arco longitudinal (o meio ao menos 2 cm acima da média das pontas)', () => {
      expect(forma.roofArch).toBeGreaterThanOrEqual(0.02);
    });

    it('cintura abaulada: a lataria da porta sai da soleira para a barriga em pelo menos 4 cm', () => {
      expect(forma.flankSweep).toBeGreaterThanOrEqual(0.04);
    });

    it('para-lamas bojudos: a lataria sobre a roda passa da lataria entre as rodas em pelo menos 3 cm', () => {
      expect(forma.fenderBulge).toBeGreaterThanOrEqual(0.03);
    });

    it('capô com caimento: o meio é pelo menos 2 cm mais alto que a 0,7 m do eixo, e a ponta cai ao menos 8 cm', () => {
      expect(forma.hoodCrown).toBeGreaterThanOrEqual(0.02);
      expect(forma.noseDrop).toBeGreaterThanOrEqual(0.08);
    });

    it(`a lanterna se destaca de trás: pelo menos ${TAIL_LIT_MIN_CM2[car]} cm² de lente acesa virada para trás`, () => {
      const P = probe(model);
      let area = 0;
      for (const t of P.T) if (P.isTail(t.i) && t.c[2] > 1.8 && t.n[2] > 0.3) area += t.area * t.n[2];
      expect(area * 1e4).toBeGreaterThanOrEqual(TAIL_LIT_MIN_CM2[car]);
    });

    it(`orçamento: os triângulos ficam em no máximo ${V17_TRIANGLES[car]} (o do V17) e ao teto do herói: a folga do gate não é gasta`, () => {
      expect(model.triangles).toBeLessThanOrEqual(V17_TRIANGLES[car]);
      expect(model.triangles).toBeLessThanOrEqual(HERO_MAX_TRIANGLES);
    });
  });
}
