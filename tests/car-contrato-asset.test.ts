// L3: o validador do jogo confere o contrato do asset (docs/CONTRATO-DO-ASSET.md): nós `kit_<peça>_<nível>`, o vazio
// `seat`, as malhas `decal_*`, o atlas de paleta 256², os tetos de triângulos — e o `npm run check-car` roda sobre ele.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseCarGlb } from '../src/render/cars/gltf';
import { installNodeFileReader } from '../scripts/lib/node-filereader';
import { installNodeImage } from '../scripts/lib/node-image';
import { buildTestCar, type TestCarOptions } from '../scripts/lib/test-car';

beforeAll(() => { installNodeFileReader(); installNodeImage(); });

const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
/** Arquivo do estilo (sedan) ou, com `carId`, de um carro só. */
const load = (o: TestCarOptions = {}, carId?: string) => parseCarGlb('sedan', ab(buildTestCar(o)), carId ? { carId } : {});

describe('contrato do asset: kit_<peça>_<nível>', () => {
  it('as 6 peças × 3 níveis passam, e os kits NÃO entram no casco', async () => {
    const kits = ['engine', 'turbo', 'tires', 'brakes', 'tank', 'nitro'].flatMap((p) => [1, 2, 3].map((n) => `kit_${p}_${n}`));
    const { model, problems } = await load({ kits });
    expect(problems).toEqual([]);
    expect(model?.contract?.kits.map((k) => k.name)).toEqual(kits);
    expect(model?.contract?.kits.every((k) => k.triangles === 12)).toBe(true);
    expect(model?.triangles).toBe(9 * 12); // só o lod0
  });

  it.each([
    ['kit_motor_1', /kit_motor_1.*peça/],
    ['kit_engine_0', /kit_engine_0.*nível/],
    ['kit_engine_4', /kit_engine_4.*nível/],
    ['kit_engine', /kit_engine.*kit_<peça>_<nível>/],
  ])('%s é problema', async (name, rx) => {
    const { problems } = await load({ kits: [name] });
    expect(problems.join(' | ')).toMatch(rx);
  });
});

describe('contrato do asset: seat', () => {
  it('um vazio seat passa e vem no referencial do jogo (frente −z, esquerda −x)', async () => {
    const { model, problems } = await load();
    expect(problems).toEqual([]);
    expect(model?.contract?.seats).toHaveLength(1);
    const [x, y, z] = model?.contract?.seats[0] ?? [0, 0, 0];
    expect([x, y, z].map((v) => Math.round(v * 100) / 100)).toEqual([-0.25, 1.05, 0.1]);
  });

  it('dois seat: problema', async () => {
    expect((await load({ seats: 2 })).problems.join(' | ')).toMatch(/seat.*2/);
  });

  it('sem seat: problema no arquivo de um carro, só aviso no de estilo', async () => {
    const carro = await load({ seats: 0 }, 'camelo');
    expect(carro.problems.join(' | ')).toMatch(/seat/);
    const estilo = await load({ seats: 0 });
    expect(estilo.problems).toEqual([]);
    expect(estilo.warnings.join(' | ')).toMatch(/seat/);
  });
});

describe('contrato do asset: decal_*', () => {
  it('malha plana com UV passa e não entra no casco', async () => {
    const { model, problems } = await load({ decals: [{ name: 'decal_numero' }, { name: 'decal_placa' }] });
    expect(problems).toEqual([]);
    expect(model?.contract?.decals).toEqual([
      { name: 'decal_numero', triangles: 2, hasUv: true, flat: true },
      { name: 'decal_placa', triangles: 2, hasUv: true, flat: true },
    ]);
    expect(model?.triangles).toBe(9 * 12);
  });

  it('sem UV: problema', async () => {
    // Sem atlas, a regra geral "material com atlas sem UV" não existe: só a do decal pode acusar.
    expect((await load({ atlas: 0, decals: [{ name: 'decal_numero', uv: false }] })).problems.join(' | ')).toMatch(/decal_numero.*UV/);
  });

  it('volumosa (não plana): problema', async () => {
    expect((await load({ decals: [{ name: 'decal_numero', flat: false }] })).problems.join(' | ')).toMatch(/decal_numero.*plana/);
  });
});

describe('contrato do asset: atlas e tetos', () => {
  it('o atlas tem de ser 256 × 256', async () => {
    expect((await load({ atlas: 512 })).problems.join(' | ')).toMatch(/512 × 512.*256 × 256/);
    expect((await load({ atlas: 256 })).problems).toEqual([]);
  });

  it('o carro de caixas completo passa sem problema e sem aviso', async () => {
    const { problems, warnings, model } = await load({}, 'camelo');
    expect(problems).toEqual([]);
    expect(warnings).toEqual([]);
    expect(model?.carId).toBe('camelo');
  });
});

describe('npm run check-car sobre o contrato', () => {
  let dir = '';
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'l3-check-car-')); });
  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

  const run = (name: string, o: TestCarOptions) => {
    const file = join(dir, name);
    writeFileSync(file, buildTestCar(o));
    const r = spawnSync(join(__dirname, '..', 'node_modules', '.bin', 'tsx'), [join(__dirname, '..', 'scripts', 'check-car-glb.ts'), file], { encoding: 'utf8' });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };

  it('arquivo com nome de CARRO (falcao.glb) e o contrato inteiro: saída 0 e "aceito"', () => {
    const r = run('falcao.glb', {});
    expect(r.out).toMatch(/aceito/);
    expect(r.code).toBe(0);
  }, 60_000);

  it('arquivo com kit_engine_4: saída 1 e o motivo', () => {
    const r = run('falcao.glb', { kits: ['kit_engine_4'] });
    expect(r.out).toMatch(/kit_engine_4/);
    expect(r.code).toBe(1);
  }, 60_000);
});
