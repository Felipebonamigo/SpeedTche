// V6c, lote 2: a escada de alumínio do Furgãozinho da Firma balança nas curvas e cai para trás no nitro, SÓ visual e sem chamada de desenho nova:
// o vértice da escada leva um marcador no atributo `aPaint.w` (0,5; o farol escamoteável usa 1), a mola mora num módulo puro (cars/ladder.ts) e o
// resultado vai nos bits altos de `instExtra.w` da instância (o mesmo lote do casco). Os outros carros não mudam.
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { brushForMaterial } from '../src/render/cars/gltf';
import { parseCarGlb } from '../src/render/cars/gltf';
import { decodeLadder, ladderBits, LADDER_SHIFT, newLadder, stepLadder } from '../src/render/cars/ladder';
import { createCarMaterial } from '../src/render/cars/material';
import { installNodeImage } from '../scripts/lib/node-image';

beforeAll(installNodeImage);
const run = (s: ReturnType<typeof newLadder>, input: { roll: number; nitro: number; reduce?: boolean }, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepLadder(s, { reduce: false, ...input }, 1 / 60);
  return s;
};

describe('a mola da escada (cars/ladder.ts, pura)', () => {
  it('na curva a escada vai para o lado do rolamento (e balança: passa do alvo antes de assentar)', () => {
    const s = newLadder();
    let peak = 0;
    for (let t = 0; t < 2; t += 1 / 60) { stepLadder(s, { roll: 0.04, nitro: 0, reduce: false }, 1 / 60); peak = Math.max(peak, s.x); }
    expect(s.x).toBeGreaterThan(0.2);
    expect(peak).toBeGreaterThan(s.x + 0.01); // sub-amortecida: o balanço
    const l = run(newLadder(), { roll: -0.04, nitro: 0 }, 2);
    expect(l.x).toBeLessThan(-0.2);
    expect(Math.abs(l.x)).toBeLessThanOrEqual(1);
  });

  it('no nitro ela cai para trás, e volta devagar quando o nitro acaba', () => {
    const s = run(newLadder(), { roll: 0, nitro: 1 }, 1);
    expect(s.slide).toBeGreaterThan(0.9);
    const back = run(s, { roll: 0, nitro: 0 }, 0.3);
    expect(back.slide).toBeGreaterThan(0.2); // ainda não voltou
    expect(run(back, { roll: 0, nitro: 0 }, 4).slide).toBeLessThan(0.05);
  });

  it('"Reduzir efeitos": a escada fica quieta no lugar', () => {
    const s = newLadder();
    for (let t = 0; t < 2; t += 1 / 60) stepLadder(s, { roll: 0.05, nitro: 1, reduce: true }, 1 / 60);
    expect(s.x).toBe(0);
    expect(s.slide).toBe(0);
  });
});

describe('os bits na instância (instExtra.w, float exato até 2^24)', () => {
  it('ida e volta, no meio é zero (carro sem escada = bits zero) e não pisa nos bits dos outros usos', () => {
    expect(ladderBits(newLadder())).toBe(0);
    const bits = ladderBits({ x: 3 / 7, slide: 5 / 7 });
    expect(bits).toBeGreaterThan(0);
    expect(bits).toBeLessThan(2 ** 22);
    expect(bits & ((1 << LADDER_SHIFT) - 1)).toBe(0); // o freio, as faixas, o acabamento e o corte da câmera ficam abaixo
    const d = decodeLadder(bits);
    expect(d.x).toBeCloseTo(3 / 7, 6); // a escada cabe em 4 + 3 bits: passos de 1/7
    expect(d.slide).toBeCloseTo(5 / 7, 6);
    expect(decodeLadder(ladderBits({ x: -1, slide: 0 })).x).toBeCloseTo(-1, 1);
  });
});

describe('a malha e o shader', () => {
  it('o pincel `ladder` marca o vértice (popup 0,5); o resto do arquivo não', () => {
    expect(brushForMaterial(new THREE.MeshStandardMaterial({ name: 'ladder' })).popup).toBe(0.5);
    expect(brushForMaterial(new THREE.MeshStandardMaterial({ name: 'paint' })).popup).toBe(0);
  });

  it('só o furgão tem escada no modelo (CarModel.ladder)', async () => {
    const load = async (id: string, body: 'micro' | 'hatch') => {
      const b = readFileSync(join(__dirname, '..', 'src', 'assets', 'cars', `${id}.glb`));
      return (await parseCarGlb(body, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, { carId: id })).model!;
    };
    expect((await load('furgao', 'micro')).ladder).toBe(true);
    expect((await load('cuiabano', 'hatch')).ladder).not.toBe(true);
  });

  it('o shader desloca só o vértice marcado, lendo a escada dos bits altos da instância, e o farol escamoteável segue como antes', () => {
    const { material } = createCarMaterial();
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('ladW');
    expect(shader.vertexShader).toContain(`>> ${LADDER_SHIFT}`);
    expect(shader.vertexShader).toMatch(/step\( *0\.9, *aPaint\.w *\) *\* *uPopup/);
  });
});
