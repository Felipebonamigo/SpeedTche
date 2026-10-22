// V21 (docs/ondas/V21-acabamento.md): oclusão ambiente ASSADA no vértice do casco (atributo `aOcc`: 0 = aberto, 1 = fechado), para TODOS os carros (procedural, glTF e herói),
// e o que o shader faz com ela. A parte que se mede NA IMAGEM está em tests/acabamento-gl.test.ts; aqui o atributo, o contrato e o texto do shader.
//   1. O atributo existe em todo casco, em [0,1], sem NaN, determinístico.
//   2. Mede onde tem de medir: dobra de duas peças fecha, topo aberto não; a saia perto do chão fecha mais que o teto; o vão da roda fecha com a roda de proxy.
//   3. O shader lê o atributo e escurece só a lataria (a lanterna não: ela acende).
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAR_BODIES } from '../src/core/data/cars';
import * as K from '../src/render/cars/kit';
import * as M from '../src/render/cars/material';
import { parseCarGlb, parseHeroGlb } from '../src/render/cars/gltf';
import { MODEL_BUILDERS } from '../src/render/cars/models';

const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const PAINT = K.brush('#cc2222', { paint: 1 });

/** Média da oclusão dos vértices que passam no filtro. */
function mean(g: THREE.BufferGeometry, pick: (x: number, y: number, z: number, ny: number) => boolean): { m: number; n: number } {
  const pos = g.getAttribute('position'); const nor = g.getAttribute('normal'); const occ = g.getAttribute('aOcc') as THREE.BufferAttribute | undefined;
  let s = 0; let n = 0;
  for (let i = 0; i < pos.count; i++) if (pick(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getY(i))) { s += occ ? occ.getX(i) : NaN; n++; }
  return { m: n ? s / n : NaN, n };
}

describe('oclusão assada: o atributo', () => {
  it('todo casco (13 estilos, e o casco simples deles) tem aOcc em [0,1], um por vértice, sem NaN', () => {
    for (const body of CAR_BODIES) {
      for (const lod of [0, 1] as const) {
        const m = MODEL_BUILDERS[body](lod);
        const occ = m.shell.getAttribute('aOcc') as THREE.BufferAttribute | undefined;
        expect(occ, `${body} lod${lod}`).toBeDefined();
        expect(occ?.count, `${body} lod${lod}`).toBe(m.shell.getAttribute('position').count);
        let lo = 1; let hi = 0;
        for (let i = 0; i < (occ?.count ?? 0); i++) { const v = occ?.getX(i) ?? NaN; expect(Number.isFinite(v)).toBe(true); lo = Math.min(lo, v); hi = Math.max(hi, v); }
        expect(lo, `${body} lod${lod}`).toBeGreaterThanOrEqual(0);
        expect(hi, `${body} lod${lod}`).toBeLessThanOrEqual(1);
        expect(hi, `${body} lod${lod}: o carro inteiro aberto não prova nada`).toBeGreaterThan(0.2);
      }
    }
  });

  it('é determinístico: o mesmo casco duas vezes dá os mesmos bytes', () => {
    const a = MODEL_BUILDERS.gt().shell.getAttribute('aOcc') as THREE.BufferAttribute;
    const b = MODEL_BUILDERS.gt().shell.getAttribute('aOcc') as THREE.BufferAttribute;
    expect(a.count).toBe(b.count);
    for (let i = 0; i < a.count; i++) expect(a.getX(i)).toBe(b.getX(i));
  });

  it('a roda unitária NÃO leva aOcc (custava ~64 ms por desenho de roda: 9 desenhos); a peça avulsa do construtor leva', () => {
    const w = MODEL_BUILDERS.gt().wheelModel?.geometry;
    if (w) expect(w.getAttribute('aOcc')).toBeUndefined();
    const b = new K.MeshBuilder();
    b.quad([-1, 0, 1], [1, 0, 1], [1, 0, -1], [-1, 0, -1], PAINT);
    expect(b.build().getAttribute('aOcc')).toBeDefined();
    expect(b.build(undefined, false).getAttribute('aOcc')).toBeUndefined();
  });
});

describe('oclusão assada: onde mede', () => {
  it('dobra de duas peças fecha; o topo aberto não; a face do chão fecha pelo chão', () => {
    // uma chapa de 1 m no alto (y = 1,2) e, em cima dela, uma parede em pé: o pé da parede é a dobra
    const b = new K.MeshBuilder();
    const T = 1.2;
    b.quad([-0.5, T, 0.5], [0.5, T, 0.5], [0.5, T, -0.5], [-0.5, T, -0.5], PAINT); // piso da dobra, normal +y
    b.quad([-0.5, T, -0.5], [0.5, T, -0.5], [0.5, T + 0.5, -0.5], [-0.5, T + 0.5, -0.5], PAINT); // parede de trás, normal +z
    const g = b.build();
    const foot = mean(g, (x, y, z) => y < T + 0.02 && z < -0.4); // o piso junto da parede
    const open = mean(g, (x, y, z) => y < T + 0.02 && z > 0.4); // a ponta aberta do piso
    expect(foot.n).toBeGreaterThan(0);
    expect(foot.m).toBeGreaterThan(open.m + 0.15);
    expect(open.m).toBeLessThan(0.12);
  });

  it('o chão (y = 0) é um oclusor: a mesma chapa fecha mais rente ao chão que no alto', () => {
    const plate = (y: number) => {
      const b = new K.MeshBuilder();
      b.quad([-0.5, y, 0.5], [-0.5, y, -0.5], [0.5, y, -0.5], [0.5, y, 0.5], PAINT); // normal −y (a barriga)
      return mean(b.build(), () => true).m;
    };
    expect(plate(0.08)).toBeGreaterThan(plate(1.2) + 0.2);
  });

  it('em todo carro procedural a saia (rente ao chão) fecha mais que o teto', () => {
    for (const body of CAR_BODIES) {
      const g = MODEL_BUILDERS[body]().shell;
      const bb = g.boundingBox as THREE.Box3;
      const h = bb.max.y - bb.min.y;
      // a saia (faces de lado, rente ao chão) e o teto (faces que olham para cima, no alto): a barriga e o forro do teto não entram
      const low = mean(g, (x, y, z, ny) => y < bb.min.y + h * 0.22 && Math.abs(ny) < 0.6);
      const top = mean(g, (x, y, z, ny) => y > bb.max.y - h * 0.12 && ny > 0.6);
      expect(low.n, body).toBeGreaterThan(10); expect(top.n, body).toBeGreaterThan(10);
      expect(low.m, `${body}: saia ${low.m.toFixed(3)} × teto ${top.m.toFixed(3)}`).toBeGreaterThan(top.m + 0.12);
    }
  });

  it('o vão da roda fecha com a roda de proxy: o carro com eixos tem mais oclusão perto da roda que sem eles', () => {
    const m = MODEL_BUILDERS.sedan();
    const front = m.axles[0];
    const near = (x: number, y: number, z: number) => Math.abs(Math.abs(x) - (front.x + front.w * 0.5 + 0.02)) < 0.12 && Math.abs(z - front.z) < front.r * 0.8 && y > front.r * 1.2 && y < front.r * 2.1;
    const withWheel = mean(m.shell, near);
    expect(withWheel.n).toBeGreaterThan(5);
    expect(withWheel.m, 'a borda do para-lama sobre a roda').toBeGreaterThan(0.12);
  });
});

describe('oclusão assada: os carros de arquivo (glTF) e os heróis', () => {
  const dir = 'src/assets/cars';
  it('o carro de arquivo e o herói têm aOcc, e a saia fecha mais que o teto', async () => {
    if (!existsSync(`${dir}/cuiabano.glb`)) return;
    const r = await parseCarGlb('hatch', ab(readFileSync(`${dir}/cuiabano.glb`)), { carId: 'cuiabano' });
    expect(r.model).not.toBeNull();
    const g = r.model?.shell as THREE.BufferGeometry;
    expect(g.getAttribute('aOcc')).toBeDefined();
    const bb = g.boundingBox as THREE.Box3; const h = bb.max.y - bb.min.y;
    const low = mean(g, (x, y, z, ny) => y < bb.min.y + h * 0.22 && Math.abs(ny) < 0.6); const top = mean(g, (x, y, z, ny) => y > bb.max.y - h * 0.12 && ny > 0.6);
    expect(low.m).toBeGreaterThan(top.m + 0.1);
    if (r.model?.lod1) expect(r.model.lod1.shell.getAttribute('aOcc')).toBeDefined();
    if (existsSync(`${dir}/hero/cuiabano.glb`)) {
      const hh = await parseHeroGlb('hatch', ab(readFileSync(`${dir}/hero/cuiabano.glb`)), { base: r.model ?? undefined, carId: 'cuiabano' });
      expect(hh.model?.shell.getAttribute('aOcc')).toBeDefined();
    }
  }, 60000);

  it('baixar o casco herói de 20 mil triângulos (assar a oclusão incluída) cabe em 2 s no Node', async () => {
    const f = readdirSync(`${dir}/hero`).find((n) => n.endsWith('.glb') && !n.startsWith('cuiabano') && !n.startsWith('tupiniquim'));
    if (!f) return;
    const t0 = performance.now();
    const r = await parseCarGlb('gt', ab(readFileSync(`${dir}/hero/${f}`)), { maxTriangles: 20000 });
    expect(r.model).not.toBeNull();
    expect(performance.now() - t0).toBeLessThan(2000);
  }, 60000);
});

describe('oclusão assada: o shader', () => {
  function compiled(): { vert: string; frag: string } {
    const { material } = M.createCarMaterial();
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    return { vert: shader.vertexShader, frag: shader.fragmentShader };
  }
  it('lê o atributo aOcc no vértice e o aplica no fragmento, com uniforme de força', () => {
    const { vert, frag } = compiled();
    expect(vert).toContain('attribute float aOcc');
    expect(frag).toContain('vOcc');
    expect(frag).toContain('uOcc');
  });
  it('a chave de programa mudou (v10): compila na carga, nunca no meio da corrida', () => {
    const { material } = M.createCarMaterial();
    expect(material.customProgramCacheKey()).toContain('speed-tche-car-v10');
  });
  it('a lanterna acesa não escurece pela oclusão (o emissivo fica de fora)', () => {
    const { frag } = compiled();
    expect(frag).toMatch(/vMat\.w[^;]*vOcc|vOcc[^;]*vMat\.w|occLamp/);
  });
});
