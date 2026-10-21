// V17: o herói de UM CARRO (`hero/<id do carro>.glb`, os nacionais livres) vale sobre o `.glb` do próprio carro, não sobre o hatch procedural do estilo dele. A chave do herói já era "estilo ou carro"
// (V9), mas a conferência de pegada, eixos e escapes (`heroProblems`) sempre comparava com o procedural do estilo: o Cuiabano (roda de 0,375 m, escapes em ±0,42) seria recusado por não ser o hatch.
// Aqui, com um arquivo SINTÉTICO (o próprio `.glb` do carro faz de herói: passa por construção, só o que muda é a base da conferência), o contrato do carregador.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadCarAssets } from '../src/render/cars/assets';
import { parseCarGlb, parseHeroGlb } from '../src/render/cars/gltf';
import { buildModel, setHeroOverride, setModelOverride } from '../src/render/cars/models';
import { installNodeFileReader } from '../scripts/lib/node-filereader';
import { installNodeImage } from '../scripts/lib/node-image';

const CARS_DIR = join(__dirname, '..', 'src', 'assets', 'cars');
const dataUrl = (b: Buffer) => `data:model/gltf-binary;base64,${b.toString('base64')}`;
const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const own = (id: string) => ({ [`../../assets/cars/${id}.glb`]: async () => dataUrl(readFileSync(join(CARS_DIR, `${id}.glb`))) });
const asHero = (id: string) => ({ [`../../assets/cars/hero/${id}.glb`]: async () => dataUrl(readFileSync(join(CARS_DIR, `${id}.glb`))) });

beforeAll(() => { installNodeFileReader(); installNodeImage(); });
afterEach(() => { for (const k of ['cuiabano', 'tupiniquim']) { setHeroOverride(k, null); setModelOverride(k, null); } });

describe('o herói de um carro é conferido contra o arquivo do próprio carro', () => {
  it('parseHeroGlb(body, dados, { base, carId }): com a base do carro o arquivo passa; sem ela (o hatch procedural) é recusado pelo eixo', async () => {
    const buf = readFileSync(join(CARS_DIR, 'cuiabano.glb'));
    const base = (await parseCarGlb('hatch', ab(buf), { carId: 'cuiabano' })).model!;
    expect((await parseHeroGlb('hatch', ab(buf), { base, carId: 'cuiabano' })).problems).toEqual([]);
    expect((await parseHeroGlb('hatch', ab(buf), { carId: 'cuiabano' })).problems.join('|')).toContain('o eixo');
  });

  it('loadCarAssets: com o .glb do carro já carregado, o herói dele entra e é do CARRO (os outros hatches seguem sem herói)', async () => {
    const report = await loadCarAssets({ ...own('cuiabano'), ...own('caipora') }, asHero('cuiabano'));
    expect(report.rejected).toEqual([]);
    expect(report.heroes).toEqual(['cuiabano']);
    expect(buildModel('cuiabano').hero, 'herói do Cuiabano').toBeDefined();
    expect(buildModel('caipora').hero, 'o Caipora também é hatch e não ganha o herói do Cuiabano').toBeUndefined();
    expect(buildModel('hatch').hero, 'o estilo hatch segue sem herói').toBeUndefined();
    setModelOverride('caipora', null);
  });

  it('loadCarAssets: herói de um carro cujo .glb não carregou é recusado, com o motivo dito', async () => {
    const report = await loadCarAssets({}, asHero('cuiabano'));
    expect(report.heroes).toEqual([]);
    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0].file).toBe('hero/cuiabano.glb');
    expect(report.rejected[0].problems.join(' ')).toMatch(/\.glb do próprio carro/);
  });
});
