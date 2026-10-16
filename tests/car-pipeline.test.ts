// Pipeline de arte dos carros (onda L, frente L3): as ferramentas de scripts/lib (PNG, escritor de .glb, carro de
// caixas do contrato, conversor do Kenney) e o que elas provam no validador do jogo. Tudo no Node, sem DOM.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CAR_BODIES, CARS } from '../src/core/data/cars';
import { checkCarModel } from '../src/render/cars/check';
import { parseCarGlb } from '../src/render/cars/gltf';
import { convertKenneyCar } from '../scripts/lib/car-convert';
import { decodePng, encodePng, pngSize } from '../scripts/lib/png';
import { installNodeImage } from '../scripts/lib/node-image';
import { writeGlb } from '../scripts/lib/glb-write';
import { CELL, kenneyLikeColormap, kenneyLikeGlb } from '../scripts/lib/test-kenney';
import { buildTestCar } from '../scripts/lib/test-car';

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

const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

describe('pipeline de arte: o carro de caixas do contrato', () => {
  it('passa no validador SEM problema e SEM aviso, em arquivo de carro e de estilo (com o seat)', async () => {
    for (const [body, carId] of [['sedan', undefined], ['gt', 'falcao']] as const) {
      const { model, problems, warnings } = await parseCarGlb(body, ab(buildTestCar({})), carId ? { carId } : {});
      expect(problems, body).toEqual([]);
      expect(warnings, body).toEqual([]);
      expect(model?.contract?.seats).toHaveLength(1);
    }
  });
});

describe('pipeline de arte: conversor do carro do Kenney (entrada sintética no formato do kit)', () => {
  let out: { glb: Buffer; report: Awaited<ReturnType<typeof convertKenneyCar>>['report'] };
  beforeAll(async () => { out = await convertKenneyCar({ glb: kenneyLikeGlb(), colormap: kenneyLikeColormap() }); });

  it('a saída passa no validador do jogo como carro de um carro só (casco ≤ 3.500, lod1 ≤ metade, atlas 256², seat)', async () => {
    const { model, problems, warnings } = await parseCarGlb('gt', ab(out.glb), { carId: 'falcao' });
    expect(problems).toEqual([]);
    expect(warnings).toEqual([]);
    expect(model?.triangles).toBeGreaterThan(900);
    expect(model?.triangles).toBeLessThanOrEqual(3500);
    expect(model?.lod1?.triangles).toBeLessThanOrEqual((model?.triangles ?? 0) / 2);
    expect(model?.contract?.atlases).toEqual([{ width: 256, height: 256 }]);
    expect(model?.contract?.lodNodes).toEqual({ lod0: true, lod1: true });
  });

  it('o casco é escalado POR EIXO até a pegada do jogo (~4,4 × 1,9 m) e as rodas ficam redondas, maiores e no chão', async () => {
    const { model } = await parseCarGlb('gt', ab(out.glb), { carId: 'falcao' });
    const bb = model?.shell.boundingBox;
    expect((bb?.max.z ?? 0) - (bb?.min.z ?? 0)).toBeCloseTo(4.4, 1);
    expect((bb?.max.x ?? 0) - (bb?.min.x ?? 0)).toBeCloseTo(1.9, 1);
    const [front, rear] = model?.axles ?? [];
    expect(front?.r).toBeCloseTo(0.42, 2); expect(rear?.r).toBeCloseTo(0.42, 2);
    expect(front?.x).toBeCloseTo(0.62, 2);
    expect(front?.z).toBeCloseTo(-1.14, 2); expect(rear?.z).toBeCloseTo(1.14, 2);
    expect(model?.wheelModel?.triangles).toBe(48); // a roda do kit (cilindro de 12 lados: pneu + duas tampas de aro)
  });

  it('cada swatch vira o papel da receita: janela = vidro (metal), saia = peça fixa (sem metal), farol e lanterna acendem', async () => {
    const { model } = await parseCarGlb('gt', ab(out.glb), { carId: 'falcao' });
    const g = model?.shell; const mat = g?.getAttribute('aMat'); const paint = g?.getAttribute('aPaint'); const uv = g?.getAttribute('uv');
    const inCell = (i: number, cell: readonly [number, number]) => {
      const u = (uv?.getX(i) ?? 0) * 16; const v = (uv?.getY(i) ?? 0) * 4;
      return u >= cell[0] && u < cell[0] + 1 && v >= cell[1] && v < cell[1] + 1;
    };
    const seen = { glass: 0, lower: 0, head: 0, tail: 0 };
    for (let i = 0; i < (uv?.count ?? 0); i++) {
      if (inCell(i, CELL.glass)) { seen.glass++; expect(mat?.getY(i)).toBeGreaterThan(0.5); expect(paint?.getX(i)).toBe(0); }
      if (inCell(i, CELL.lower)) { seen.lower++; expect(mat?.getY(i)).toBeLessThan(0.2); expect(paint?.getX(i)).toBe(0); }
      if (inCell(i, CELL.head)) { seen.head++; expect(mat?.getZ(i)).toBeGreaterThan(0.9); }
      if (inCell(i, CELL.tail)) { seen.tail++; expect(mat?.getW(i)).toBeGreaterThan(0.9); }
    }
    for (const [k, n] of Object.entries(seen)) expect(n, k).toBeGreaterThan(0);
  });

  it('a pintura aponta para o swatch BRANCO (o jogo multiplica pela cor do carro) e o spoiler é o acento', async () => {
    const { model } = await parseCarGlb('gt', ab(out.glb), { carId: 'falcao' });
    const g = model?.shell; const paint = g?.getAttribute('aPaint'); const uv = g?.getAttribute('uv');
    let painted = 0; let accent = 0;
    for (let i = 0; i < (uv?.count ?? 0); i++) {
      if ((paint?.getX(i) ?? 0) < 0.99) continue;
      painted++;
      if ((paint?.getY(i) ?? 0) > 0.99) accent++;
      const u = (uv?.getX(i) ?? 0) * 16; const v = (uv?.getY(i) ?? 0) * 4;
      expect(u, 'u no swatch branco').toBeGreaterThanOrEqual(CELL.white[0]); expect(u).toBeLessThan(CELL.white[0] + 1);
      expect(v, 'v no swatch branco').toBeGreaterThanOrEqual(CELL.white[1]); expect(v).toBeLessThan(CELL.white[1] + 1);
    }
    expect(painted).toBeGreaterThan(0);
    expect(accent).toBe(2 * 2 * 6 * 2 * 3); // o spoiler: grade 2 × 2 por face, 6 faces, 2 triângulos por quadrado, 3 vértices
  });

  it('o atlas reduzido (256²) conserva o branco no swatch da pintura', () => {
    const glb = out.glb;
    // O PNG fica embutido no .glb: acha a assinatura e decodifica.
    const at = glb.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const png = decodePng(glb.subarray(at));
    expect([png.width, png.height]).toEqual([256, 256]);
    const cx = CELL.white[0] * 16 + 8; const cy = CELL.white[1] * 64 + 32; // centro do swatch (16 × 64 px)
    expect([...png.rgba.subarray((cy * 256 + cx) * 4, (cy * 256 + cx) * 4 + 3)]).toEqual([255, 255, 255]);
  });

  it('swatch fora da receita vira peça fixa (trim) e entra no relatório', () => {
    expect(out.report.unmapped).toHaveLength(1);
    expect(out.report.unmapped[0].cell).toBe(`${CELL.unknown[0]},${CELL.unknown[1]}`);
    expect(out.report.unmapped[0].triangles).toBe(12);
  });

  it('é determinístico: converter de novo dá o mesmo arquivo, byte a byte', async () => {
    const again = await convertKenneyCar({ glb: kenneyLikeGlb(), colormap: kenneyLikeColormap() });
    expect(again.glb.equals(out.glb)).toBe(true);
  });

  it('recusa colormap que não é 512 × 512', async () => {
    await expect(convertKenneyCar({ glb: kenneyLikeGlb(), colormap: encodePng(4, 4, new Uint8Array(64)) })).rejects.toThrow(/512/);
  });
});

describe('pipeline de arte: o carro de verdade (Kenney Car Kit, CC0)', () => {
  const kenney = join(__dirname, '..', 'art', 'raw', 'kenney-car-kit', 'GLB format');
  it.skipIf(!existsSync(join(kenney, 'sedan-sports.glb')))('o sedan-sports do kit, em art/raw/ (fora do git), é recusado como vem e aceito depois do conversor', async () => {
    // Como vem: 1.950–2.100 triângulos, 512², sem luz, sem seat, textura por URI externa — não passa.
    const raw = readFileSync(join(kenney, 'sedan-sports.glb'));
    const asIs = await parseCarGlb('gt', ab(raw), { carId: 'falcao' });
    expect(asIs.model === null || asIs.problems.length > 0).toBe(true);
    const { glb } = await convertKenneyCar({ glb: raw, colormap: readFileSync(join(kenney, 'Textures', 'colormap.png')) });
    const { problems } = await parseCarGlb('gt', ab(glb), { carId: 'falcao' });
    expect(problems).toEqual([]);
  });
});

describe('pipeline de arte: os carros .glb (instalados em src/assets/cars/ e o carro-régua em art/cars/)', () => {
  // O Falcão do Kenney (CC0) é o carro-régua: prova o caminho de ponta a ponta, mas hoje o procedural é mais bonito, então
  // ele fica em art/cars/ (não instalado). Para instalar um, mova para src/assets/cars/ com o nome do carro ou do estilo.
  const roots = [
    { dir: join(__dirname, '..', 'src', 'assets', 'cars'), rel: 'src/assets/cars', suffix: '' },
    { dir: join(__dirname, '..', 'art', 'cars'), rel: 'art/cars', suffix: '-kenney' },
  ];
  const files = roots.flatMap((r) => readdirSync(r.dir).filter((f) => f.endsWith('.glb')).map((f) => ({ ...r, file: f })));
  const arte = readFileSync(join(__dirname, '..', 'docs', 'ARTE.md'), 'utf8');

  it('há pelo menos um .glb para provar o pipeline (o carro-régua)', () => { expect(files.length).toBeGreaterThan(0); });

  it.each(files.map((f) => [`${f.rel}/${f.file}`, f] as const))('%s passa no validador do jogo e tem a licença registrada em docs/ARTE.md', async (_label, f) => {
    const name = f.file.replace(/\.glb$/, '').replace(f.suffix, '');
    const car = CARS.find((c) => c.id === name);
    expect(car ?? CAR_BODIES.includes(name as never), `${f.file}: o nome é um carro ou um estilo`).toBeTruthy();
    const { model, problems } = await parseCarGlb(car ? car.body : (name as never), ab(readFileSync(join(f.dir, f.file))), car ? { carId: car.id } : {});
    expect(problems).toEqual([]);
    expect(model && checkCarModel(model)).toEqual([]);
    // Uma linha da tabela de licenças cita o arquivo e uma licença (CC0, CC-BY… ou "Criação própria": carro modelado por nós, tools/blender/).
    const row = arte.split('\n').find((l) => l.startsWith('|') && l.includes(`${f.rel}/${f.file}`));
    expect(row, `docs/ARTE.md: linha da tabela de licenças com "${f.rel}/${f.file}"`).toBeTruthy();
    expect(row).toMatch(/CC0|CC-BY|CC BY|Criação própria/);
  }, 60_000);
});
