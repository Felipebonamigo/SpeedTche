// L3: o .glb do carro com UV, atlas de paleta (`map`) e normal map opcional chega ao modelo do jogo.
// O GLTFLoader engole a falha de textura no Node (o `map` vira null): `installNodeImage` põe um createImageBitmap que lê
// só o cabeçalho do PNG, e é com ele que o atlas existe aqui (scripts/lib/node-image.ts).
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseCarGlb } from '../src/render/cars/gltf';
import { brush, MeshBuilder } from '../src/render/cars/kit';
import { MODEL_BUILDERS } from '../src/render/cars/models';
import { carTemplateScene, exportGlb } from '../src/render/cars/template';
import { installNodeFileReader } from '../scripts/lib/node-filereader';
import { installNodeImage } from '../scripts/lib/node-image';
import { buildTestCar, type TestCarOptions } from '../scripts/lib/test-car';

beforeAll(() => { installNodeFileReader(); installNodeImage(); });

const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
/** O carro de caixas sem LOD, kits nem decals: só o casco, as rodas e o atlas. */
const plain = (o: TestCarOptions = {}) => parseCarGlb('sedan', ab(buildTestCar({ lod: false, kits: [], decals: [], ...o })));

describe('MeshBuilder com UV', () => {
  const tri = [[0, 0], [1, 0], [0, 1]] as const;

  it('tri(…, uv) grava o atributo uv (2 floats por vértice); mirrored copia; sem uv não nasce atributo', () => {
    const b = new MeshBuilder();
    const br = brush('#ffffff');
    b.tri([0, 0, 0], [1, 0, 0], [0, 1, 0], br, tri);
    b.mirrored(() => b.tri([0.5, 0, 0], [1.5, 0, 0], [0.5, 1, 0], br, [[0.25, 0.5], [0.75, 0.5], [0.25, 1]]));
    const uv = b.build().getAttribute('uv');
    expect(uv.count).toBe(9);
    expect([uv.getX(1), uv.getY(1), uv.getX(2), uv.getY(2)]).toEqual([1, 0, 0, 1]);
    // A peça original (3–5) e, no fim, a cópia espelhada (6–8), que reordena os vértices (0, 2, 1): cada vértice leva a UV do seu original.
    expect([uv.getX(3), uv.getY(3), uv.getX(4), uv.getY(4), uv.getX(5), uv.getY(5)]).toEqual([0.25, 0.5, 0.75, 0.5, 0.25, 1]);
    expect([uv.getX(6), uv.getY(6), uv.getX(7), uv.getY(7), uv.getX(8), uv.getY(8)]).toEqual([0.25, 0.5, 0.25, 1, 0.75, 0.5]);

    const plainB = new MeshBuilder();
    plainB.tri([0, 0, 0], [1, 0, 0], [0, 1, 0], br);
    expect(plainB.build().getAttribute('uv')).toBeUndefined();
  });

  it('triângulo sem UV numa malha com UV fica com 0,0 (o buffer tem de fechar)', () => {
    const b = new MeshBuilder();
    const br = brush('#ffffff');
    b.tri([0, 0, 0], [1, 0, 0], [0, 1, 0], br);
    b.tri([0, 0, 1], [1, 0, 1], [0, 1, 1], br, tri);
    const uv = b.build().getAttribute('uv');
    expect(uv.count).toBe(6);
    expect([uv.getX(0), uv.getY(2), uv.getX(4), uv.getY(5)]).toEqual([0, 0, 1, 1]);
  });
});

describe('carro em glTF: UV e atlas de paleta', () => {
  it('o .glb com UV chega ao casco com as UV do arquivo (os swatches de cada material)', async () => {
    const { model, problems } = await plain();
    expect(problems).toEqual([]);
    const uv = model?.shell.getAttribute('uv');
    expect(uv).toBeTruthy();
    expect(uv?.count).toBe(model?.shell.getAttribute('position').count);
    // Lataria (0,0), soleira (1,0), vidro (2,0), faróis (3,0), lanternas (4,0): centro do swatch de 16 × 16.
    const seen = new Set<string>();
    for (let i = 0; i < (uv?.count ?? 0); i++) seen.add(`${Math.round((uv?.getX(i) ?? 0) * 32)},${Math.round((uv?.getY(i) ?? 0) * 32)}`);
    expect([...seen].sort()).toEqual(['1,1', '3,1', '5,1', '7,1', '9,1']);
  });

  it('o atlas do material vira model.map (sRGB, 256²) e o aviso "textura ignorada" some', async () => {
    const { model, warnings } = await plain();
    expect(model?.map).toBeInstanceOf(THREE.Texture);
    expect(model?.map?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect((model?.map?.image as { width: number; height: number }).width).toBe(256);
    expect((model?.map?.image as { width: number; height: number }).height).toBe(256);
    expect(warnings.join(' | ')).not.toMatch(/textura ignorada/);
  });

  it('normal map opcional: model.normalMap com ele, undefined sem ele', async () => {
    expect((await plain({ normalMap: true })).model?.normalMap).toBeInstanceOf(THREE.Texture);
    expect((await plain()).model?.normalMap).toBeUndefined();
  });

  it('sem atlas nada muda: model.map é undefined, sem aviso (cor pelo material)', async () => {
    const { model, problems, warnings } = await plain({ atlas: 0, uv: false });
    expect(problems).toEqual([]);
    expect(warnings).toEqual([]);
    expect(model?.map).toBeUndefined();
    expect(model?.shell.getAttribute('uv')).toBeUndefined();
  });

  it('material com atlas e malha sem UV: problema "sem UV"', async () => {
    const { problems } = await plain({ uv: false });
    expect(problems.join(' | ')).toMatch(/sem UV/);
  });

  it('dois atlas diferentes nos materiais: problema "um atlas só"', async () => {
    const { problems } = await plain({ secondAtlas: true });
    expect(problems.join(' | ')).toMatch(/um atlas só/);
  });

  it('guarda: os modelos-base (cor chapada) continuam sem uv e sem map depois da ida e volta', async () => {
    for (const body of ['gt', 'micro'] as const) {
      const { model } = await parseCarGlb(body, await exportGlb(carTemplateScene(body)));
      expect(model?.shell.getAttribute('uv'), body).toBeUndefined();
      expect(model?.map, body).toBeUndefined();
      expect(MODEL_BUILDERS[body]().shell.getAttribute('uv'), body).toBeUndefined();
    }
  }, 30_000);
});
