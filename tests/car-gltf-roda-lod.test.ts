// L3: a roda vem do próprio .glb (nó wheel_fr, escala unitária) e o casco de menor custo vem do nó `lod1`
// (docs/CONTRATO-DO-ASSET.md). O carro de caixas (scripts/lib/test-car.ts) é a fixture; um defeito por teste.
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseCarGlb } from '../src/render/cars/gltf';
import { buildWheel } from '../src/render/cars/wheels';
import { installNodeFileReader } from '../scripts/lib/node-filereader';
import { installNodeImage } from '../scripts/lib/node-image';
import { buildTestCar, type TestCarOptions } from '../scripts/lib/test-car';

beforeAll(() => { installNodeFileReader(); installNodeImage(); });

const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const load = (o: TestCarOptions = {}) => parseCarGlb('sedan', ab(buildTestCar({ kits: [], decals: [], ...o })));

describe('carro em glTF: a roda vem do arquivo', () => {
  it('model.wheelModel é a malha do wheel_fr em escala unitária (raio 1, largura 1, centro na origem)', async () => {
    const { model, problems } = await load();
    expect(problems).toEqual([]);
    const wm = model?.wheelModel;
    expect(wm).toBeTruthy();
    const bb = new THREE.Box3().setFromBufferAttribute(wm?.geometry.getAttribute('position') as THREE.BufferAttribute);
    expect(bb.min.x).toBeCloseTo(-0.5, 3); expect(bb.max.x).toBeCloseTo(0.5, 3);
    expect(Math.max(bb.max.y, bb.max.z, -bb.min.y, -bb.min.z)).toBeCloseTo(1, 3);
    // Tem os atributos do material dos carros (cor, pintura, material) e a UV do atlas.
    for (const attr of ['color', 'aPaint', 'aMat', 'normal', 'uv']) expect(wm?.geometry.getAttribute(attr), attr).toBeTruthy();
  });

  it('o desenho é o do arquivo (pneu + aro de 12 lados), não o do estilo', async () => {
    const { model } = await load();
    expect(model?.wheelModel?.triangles).toBe(96);
    expect(model?.wheelModel?.triangles).not.toBe(buildWheel(model?.wheel ?? 'hubcap').triangles);
    expect(model?.wheelModel?.symmetry).toBeGreaterThan(0);
  });

  it('a face de fora fica em +x: o aro que sai para fora do pneu aparece do lado +x da roda do jogo', async () => {
    const { model } = await load({ wheelOuterShift: 0.06 });
    const g = model?.wheelModel?.geometry;
    const pos = g?.getAttribute('position'); const mat = g?.getAttribute('aMat');
    let sum = 0; let n = 0;
    for (let i = 0; i < (pos?.count ?? 0); i++) if ((mat?.getY(i) ?? 0) > 0.8) { sum += pos?.getX(i) ?? 0; n++; }
    expect(n).toBeGreaterThan(0);
    expect(sum / n).toBeGreaterThan(0.03);
  });

  it('roda deitada (eixo que não é o x) vira problema', async () => {
    const { problems } = await load({ wheelAxis: 'y' });
    expect(problems.join(' | ')).toMatch(/eixo/);
  });
});

describe('carro em glTF: LOD0 e LOD1', () => {
  it('as malhas do nó lod1 formam model.lod1 e NÃO entram no casco', async () => {
    const { model, problems } = await load();
    expect(problems).toEqual([]);
    expect(model?.triangles).toBe(9 * 12); // lod0: 9 caixas
    expect(model?.lod1?.triangles).toBe(4 * 12);
    expect(model?.lod1?.shell.getAttribute('position').count).toBe(4 * 36);
    for (const attr of ['color', 'aPaint', 'aMat', 'uv']) expect(model?.lod1?.shell.getAttribute(attr), attr).toBeTruthy();
    expect(model?.contract?.lodNodes).toEqual({ lod0: true, lod1: true });
  });

  it('lod1 com mais da metade dos triângulos do lod0: problema', async () => {
    const { problems } = await load({ lod1Extra: 2 });
    expect(problems.join(' | ')).toMatch(/lod1.*metade/);
  });

  it('lod1 sem lod0: problema', async () => {
    const { problems } = await load({ lod: 'so-lod1' });
    expect(problems.join(' | ')).toMatch(/lod1.*lod0/);
  });

  it('guarda: arquivo sem LOD não tem lod1 e o casco é tudo', async () => {
    const { model, problems } = await load({ lod: false });
    expect(problems).toEqual([]);
    expect(model?.lod1).toBeUndefined();
    expect(model?.triangles).toBe(9 * 12);
    expect(model?.contract?.lodNodes).toEqual({ lod0: false, lod1: false });
  });
});
