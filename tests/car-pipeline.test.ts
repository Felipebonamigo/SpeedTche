// Pipeline de arte dos carros (onda L, frente L3): as ferramentas de scripts/lib (PNG, escritor de .glb, carro de
// caixas do contrato, conversor do Kenney) e o que elas provam no validador do jogo. Tudo no Node, sem DOM.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodePng, encodePng, pngSize } from '../scripts/lib/png';
import { installNodeImage } from '../scripts/lib/node-image';
import { writeGlb } from '../scripts/lib/glb-write';

beforeAll(installNodeImage);

describe('pipeline de arte: PNG sem dependência', () => {
  it('recodifica sem perda e lê o tamanho do cabeçalho', () => {
    const w = 8; const h = 4;
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 37 + 11) & 255;
    const png = encodePng(w, h, rgba);
    expect(pngSize(png)).toEqual({ width: 8, height: 4 });
    const back = decodePng(png);
    expect([back.width, back.height]).toEqual([8, 4]);
    expect([...back.rgba]).toEqual([...rgba]);
  });

  it('recusa o que não é PNG', () => {
    expect(pngSize(Buffer.from('nao sou png de jeito nenhum'))).toBeNull();
    expect(() => decodePng(Buffer.from('lixo'))).toThrow(/PNG/);
  });
});

describe('pipeline de arte: escritor de .glb', () => {
  it('o .glb escrito abre no GLTFLoader com nós, UV e o atlas embutido', async () => {
    const atlas = encodePng(4, 4, new Uint8Array(4 * 4 * 4).fill(255));
    const glb = writeGlb({
      images: [atlas],
      materials: [{ name: 'paint', map: 0 }],
      nodes: [{
        name: 'body', translation: [0, 1, 0],
        mesh: [{ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], uvs: [0, 0, 1, 0, 0, 1], material: 0 }],
        children: [{ name: 'seat' }],
      }],
    });
    const gltf = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer, '');
    const body = gltf.scene.getObjectByName('body') as THREE.Mesh;
    expect(body.position.y).toBe(1);
    expect(gltf.scene.getObjectByName('seat')).toBeTruthy();
    const uv = body.geometry.getAttribute('uv');
    expect([uv.getX(1), uv.getY(2)]).toEqual([1, 1]);
    const material = body.material as THREE.MeshStandardMaterial;
    expect(material.name).toBe('paint');
    expect((material.map?.image as { width: number }).width).toBe(4);
  });
});
