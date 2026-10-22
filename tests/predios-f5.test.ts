// V22/F5 (docs/ondas/V22-f5-predios.md): prédios, placas e adereços de estrutura — contratos de contorno, escritos ANTES e vistos falhar (o que cada teste media no `main` e2703b4
// está no comentário dele). Tudo em Node: a textura da fachada é medida por um canvas que desenha de verdade (tests/canvas-raster.ts) e os modelos pelos números do `getModel`.
// A medida na imagem (parede do entardecer, janelas) está em `tests/predios-f5-gl.test.ts`.
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getModel, modelBounds } from '../src/render/scenery/catalog';
import { modelTriangles } from '../src/render/scenery/vegetation';
import * as ST from '../src/render/scenery/structures';
import type { Model } from '../src/render/scenery/geom';
import { lumaAt, rasterCanvasDocument, type RasterCanvas } from './canvas-raster';

type Fac = 'office' | 'apartment' | 'classic' | 'house';
const STYLES: readonly Fac[] = ['office', 'apartment', 'classic', 'house'];
const S = 256; const CELL = 64;

// ───────────────────────────── A textura da fachada ─────────────────────────────

describe('F5 · fachada: janelas com 3 níveis de acendimento, sombra do beiral, vidro com céu', () => {
  let restore: () => void;
  const tex = new Map<Fac, { map: RasterCanvas; light: RasterCanvas }>();
  beforeAll(async () => {
    const r = rasterCanvasDocument();
    restore = r.restore;
    const T = await import('../src/render/scenery/textures');
    for (const style of STYLES) {
      r.canvases.length = 0;
      T.facadeTextures(style);
      tex.set(style, { map: r.canvases[0], light: r.canvases[1] });
    }
  });
  afterAll(() => restore?.());

  /** O canto de cima à esquerda da célula `look` no canvas (o mesmo `cellOrigin` do textures.ts: o `flipY` põe a célula 0 embaixo à esquerda). */
  const origin = (look: number): [number, number] => [(look % 2) * S, (1 - Math.floor(look / 2)) * S];

  for (const style of STYLES) for (let look = 0; look < 4; look++) {
    it(`${style} visual ${look}: as janelas acesas têm 3 níveis de luz (fraco 0,22–0,45 · médio 0,45–0,75 · forte ≥ 0,75), cada um com ≥ 8% da área acesa (antes: tudo no forte, 0,85–0,92)`, () => {
      const l = tex.get(style)?.light; if (!l) throw new Error('sem textura');
      const [ox, oy] = origin(look);
      const bands = [0, 0, 0]; let lit = 0;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const v = lumaAt(l.raster, ox + x, oy + y);
        if (v < 0.22) continue; // o fundo da parede (luz difusa, ≤ 0,16) não é janela
        lit++; bands[v < 0.45 ? 0 : v < 0.75 ? 1 : 2]++;
      }
      expect(lit, 'há janela acesa').toBeGreaterThan(2000);
      for (let b = 0; b < 3; b++) expect(bands[b] / lit, `faixa ${b} (${bands.map((n) => (n / lit).toFixed(2)).join('/')})`).toBeGreaterThanOrEqual(0.08);
    });

    it(`${style} visual ${look}: o beiral de cada andar projeta sombra na parede (o topo do andar é ≥ 4% mais escuro que 11 px abaixo em ≥ 65% das colunas de borda; antes: 0–59% por acaso do desenho)`, () => {
      const m = tex.get(style)?.map; if (!m) throw new Error('sem textura');
      const [ox, oy] = origin(look);
      // A primeira coluna de cada coluna de janelas (a parede entre elas, o montante ou a pilastra): sem janela no meio, só a sombra do beiral muda a luma de cima para baixo.
      let n = 0; let ok = 0;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let dx = 0; dx < 2; dx++) {
        const x = ox + c * CELL + dx; const y = oy + r * CELL;
        n++; if (lumaAt(m.raster, x, y + 11) - lumaAt(m.raster, x, y) >= 0.04) ok++;
      }
      expect(ok / n).toBeGreaterThanOrEqual(0.65);
    });

    it(`${style} visual ${look}: o vidro reflete o céu fingido — nas janelas acesas o topo é ≥ 1,45× mais claro que o pé (média por coluna, no albedo; antes: 0,75 a 1,86)`, () => {
      const m = tex.get(style)?.map; const l = tex.get(style)?.light; if (!m || !l) throw new Error('sem textura');
      const [ox, oy] = origin(look);
      let sum = 0; let runs = 0;
      for (let x = 0; x < S; x++) {
        let y = 0;
        while (y < S) {
          if (lumaAt(l.raster, ox + x, oy + y) < 0.22) { y++; continue; }
          let y1 = y; while (y1 < S && lumaAt(l.raster, ox + x, oy + y1) >= 0.22) y1++;
          const len = y1 - y;
          if (len >= 12) {
            const q = Math.max(2, Math.floor(len / 4)); let top = 0; let foot = 0;
            for (let k = 0; k < q; k++) { top += lumaAt(m.raster, ox + x, oy + y + k); foot += lumaAt(m.raster, ox + x, oy + y1 - 1 - k); }
            sum += top / q / Math.max(0.01, foot / q); runs++;
          }
          y = y1;
        }
      }
      expect(runs).toBeGreaterThan(50);
      expect(sum / runs).toBeGreaterThanOrEqual(1.45);
    });
  }

  for (const style of STYLES) {
    it(`${style}: a parede tem uma luz difusa própria no mapa de luz (mediana 0,04–0,16), para não ficar preta quando a face está à sombra do sol (entardecer); antes: 0`, () => {
      const l = tex.get(style)?.light; if (!l) throw new Error('sem textura');
      const vals: number[] = [];
      for (let y = 0; y < S * 2; y += 3) for (let x = 0; x < S * 2; x += 3) vals.push(lumaAt(l.raster, x, y));
      vals.sort((a, b) => a - b);
      const med = vals[Math.floor(vals.length / 2)];
      expect(med).toBeGreaterThanOrEqual(0.04);
      expect(med).toBeLessThanOrEqual(0.16);
    });
  }
});

// ───────────────────────────── Os modelos ─────────────────────────────

/** `main` e2703b4 (medido): triângulos e caixa de cada modelo. A pegada (x, z) e a altura (maxY) NÃO mudam (colisão, ocupação e visada dos marcos; V4: ±1 cm). */
const BASE: Record<string, { tris: number; x: [number, number]; z: [number, number]; maxY: number }> = {
  'bld:aptbeach:12:2:2': { tris: 616, x: [-14.3, 1.261], z: [-11, 10.3], maxY: 43.7 },
  'bld:aptbeach:6:0:1': { tris: 570, x: [-14.3, 1.261], z: [-11, 10.3], maxY: 25.7 },
  'bld:glass:12:2:0': { tris: 700, x: [-18.35, 1.91], z: [-9.35, 9.35], maxY: 61.704 },
  'bld:glassgold:12:1:2': { tris: 700, x: [-18.35, 1.91], z: [-9.35, 9.35], maxY: 70.154 },
  'bld:apt:9:0:0': { tris: 636, x: [-15.35, 1.261], z: [-9.35, 9.35], maxY: 34.45 },
  'bld:apt:5:4:3': { tris: 572, x: [-15.35, 1.261], z: [-9.35, 9.35], maxY: 22.45 },
  'bld:brick:6:1:0': { tris: 442, x: [-14.35, 1.449], z: [-8.35, 8.35], maxY: 25.2 },
  'bld:classic:5:0:0': { tris: 1028, x: [-14.45, 1.338], z: [-10.95, 10.95], maxY: 29.1 },
  'bld:classicwarm:4:1:1': { tris: 994, x: [-14.45, 1.338], z: [-10.95, 10.95], maxY: 25.3 },
};

const pos = (g: THREE.BufferGeometry): THREE.BufferAttribute => g.getAttribute('position') as THREE.BufferAttribute;
const nor = (g: THREE.BufferGeometry): THREE.BufferAttribute => g.getAttribute('normal') as THREE.BufferAttribute;
const col = (g: THREE.BufferGeometry): THREE.BufferAttribute => g.getAttribute('color') as THREE.BufferAttribute;
const lumV = (g: THREE.BufferGeometry, i: number): number => 0.2126 * col(g).getX(i) + 0.7152 * col(g).getY(i) + 0.0722 * col(g).getZ(i);

describe('F5 · prédios: pegada e altura intactas, adereços de telhado dentro do orçamento', () => {
  for (const [id, b] of Object.entries(BASE)) {
    it(`${id}: pegada (x, z) e altura iguais às do main (±1 cm); +60 a +420 triângulos (adereços de telhado e lajes; antes ${b.tris})`, () => {
      const bb = modelBounds(id);
      expect(bb.minX, 'minX').toBeCloseTo(b.x[0], 1); expect(Math.abs(bb.minX - b.x[0])).toBeLessThanOrEqual(0.01);
      expect(Math.abs(bb.maxX - b.x[1]), 'maxX').toBeLessThanOrEqual(0.01);
      expect(Math.abs(bb.minZ - b.z[0]), 'minZ').toBeLessThanOrEqual(0.01);
      expect(Math.abs(bb.maxZ - b.z[1]), 'maxZ').toBeLessThanOrEqual(0.01);
      expect(Math.abs(bb.maxY - b.maxY), 'maxY (os adereços ficam abaixo do topo de antes)').toBeLessThanOrEqual(0.01);
      const t = modelTriangles(getModel(id));
      expect(t - b.tris, `${t} △`).toBeGreaterThanOrEqual(60);
      expect(t - b.tris, `${t} △`).toBeLessThanOrEqual(420);
    });
  }

  // A oclusão (pé e beirais) se mede pelo mesmo prédio com ela DESLIGADA (`structureDetail.ao`, só para teste e para o antes × depois): os vértices que existem nos dois
  // modelos (a posição e a normal iguais) trazem a mesma cor de base, então a razão entre as duas cores é a oclusão, sem confusão com as cores diferentes das peças.
  const BUILDERS: Record<string, () => Model> = {
    'aptbeach look 2': () => ST.beachApartment(3, 12, '#f2efe8', 20, 14, 2),
    'apt look 1': () => ST.apartmentBlock(2, 9, '#d4c8b4', 18, 15, 1),
    'glass look 0': () => ST.glassTower(1, 12, '#a8c8e8', 0),
    'brick look 3': () => ST.brickMidrise(2, 6, '#a09088', '#ff3fd0', 16, 14, 3),
    'classic look 0': () => ST.classicBuilding(1, 5, '#f2e8d4', 21, 14, 0),
  };
  const keyOf = (g: THREE.BufferGeometry, i: number): string => `${pos(g).getX(i).toFixed(3)},${pos(g).getY(i).toFixed(3)},${pos(g).getZ(i).toFixed(3)},${nor(g).getX(i).toFixed(2)},${nor(g).getY(i).toFixed(2)},${nor(g).getZ(i).toFixed(2)}`;
  function pairs(build: () => Model, pick: (x: number, y: number, nx: number, ny: number) => boolean): number[] {
    ST.structureDetail.ao = false; const off = new Map<string, number>();
    for (const p of build().parts) if (p.mat !== 'glow' && p.mat !== 'beacon') for (let i = 0; i < pos(p.geometry).count; i++) off.set(keyOf(p.geometry, i), lumV(p.geometry, i));
    ST.structureDetail.ao = true;
    const out: number[] = [];
    for (const p of build().parts) if (p.mat !== 'glow' && p.mat !== 'beacon') for (let i = 0; i < pos(p.geometry).count; i++) {
      if (!pick(pos(p.geometry).getX(i), pos(p.geometry).getY(i), nor(p.geometry).getX(i), nor(p.geometry).getY(i))) continue;
      const base = off.get(keyOf(p.geometry, i));
      if (base !== undefined && base > 0.02) out.push(lumV(p.geometry, i) / base);
    }
    return out;
  }
  const avg = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;

  /** A caixa de um modelo (todas as partes). */
  const boxOf = (m: Model): THREE.Box3 => { const b = new THREE.Box3(); for (const p of m.parts) { p.geometry.computeBoundingBox(); b.union(p.geometry.boundingBox as THREE.Box3); } return b; };
  for (const [nome, build] of Object.entries(BUILDERS)) {
    it(`${nome}: o topo ganha adereços (condicionadores, caixa-d'água, mastro, respiro / chaminé com tampa e tubos): +20 a +260 △ e a caixa do modelo não muda (±1 cm: a altura e a pegada são as de antes)`, () => {
      ST.structureDetail.roof = false; const off = build(); const boxOff = boxOf(off);
      ST.structureDetail.roof = true; const on = build(); const boxOn = boxOf(on);
      const d = modelTriangles(on) - modelTriangles(off);
      expect(d, `${d} △`).toBeGreaterThanOrEqual(20); expect(d, `${d} △`).toBeLessThanOrEqual(260);
      for (const k of ['x', 'y', 'z'] as const) {
        expect(Math.abs(boxOn.max[k] - boxOff.max[k]), `max ${k}`).toBeLessThanOrEqual(0.01);
        expect(Math.abs(boxOn.min[k] - boxOff.min[k]), `min ${k}`).toBeLessThanOrEqual(0.01);
      }
    });

    it(`${nome}: a oclusão no pé escurece a fachada reta do térreo (x = 0) de 0,15 a 0,9 m do chão em ≥ 20% (cor com ÷ sem; antes: 1,0), e de 3 m para cima ela não mexe`, () => {
      const foot = pairs(build, (x, y, nx) => Math.abs(x) < 0.012 && nx > 0.9 && y >= 0.15 && y <= 0.9);
      expect(foot.length, 'vértices no pé').toBeGreaterThan(2);
      expect(avg(foot)).toBeLessThanOrEqual(0.8);
      const high = pairs(build, (x, y, nx) => Math.abs(x) < 0.012 && nx > 0.9 && y >= 3.5 && y <= 4.5);
      if (high.length) expect(Math.min(...high)).toBeGreaterThanOrEqual(0.97);
    });

    it(`${nome}: sob as lajes, a cornija e os beirais (faces voltadas para baixo, de 3 m para cima) a cor é ≥ 25% mais escura, e a face de cima não muda (cor com ÷ sem; antes: 1,0)`, () => {
      const under = pairs(build, (_x, y, _nx, ny) => y >= 3 && ny < -0.4);
      expect(under.length, 'vértices sob a laje').toBeGreaterThan(6);
      expect(avg(under)).toBeLessThanOrEqual(0.75);
      const top = pairs(build, (_x, y, _nx, ny) => y >= 3 && ny > 0.4);
      expect(Math.min(...top)).toBeGreaterThanOrEqual(0.97);
    });
  }
});

describe('F5 · poste e painéis com suporte detalhado', () => {
  it('poste de luz: +30 a +160 △ (base com parafusos, colar, braço com tirante e luminária com viseira; antes 272), mesma cabeça (LAMP_HEAD_X), mesma pegada e altura', () => {
    const b = modelBounds('lamp');
    expect(Math.abs(b.minX - -0.49)).toBeLessThanOrEqual(0.01); expect(Math.abs(b.maxX - 5.08)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(b.minZ - -2.8)).toBeLessThanOrEqual(0.01); expect(Math.abs(b.maxZ - 2.8)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(b.maxY - 9.808)).toBeLessThanOrEqual(0.01);
    const t = modelTriangles(getModel('lamp'));
    expect(t - 272, `${t} △`).toBeGreaterThanOrEqual(30);
    expect(t - 272, `${t} △`).toBeLessThanOrEqual(160);
  });

  it('outdoor: +70 a +340 △ (passarela com guarda-corpo, escada de marinheiro, mãos-francesas e rodapé; antes 522), a mesma largura (R), altura e profundidade (±1 cm)', () => {
    for (const id of ['billboard:0', 'billboard:5']) {
      const b = modelBounds(id);
      expect(Math.abs(b.minX - -3.94), `${id} minX`).toBeLessThanOrEqual(0.01); expect(Math.abs(b.maxX - 3.94), `${id} maxX`).toBeLessThanOrEqual(0.01);
      expect(Math.abs(b.maxY - 8.66), `${id} maxY`).toBeLessThanOrEqual(0.01);
      expect(b.minZ, `${id} minZ`).toBeGreaterThanOrEqual(-0.26); expect(b.maxZ, `${id} maxZ`).toBeLessThanOrEqual(1.11);
      const t = modelTriangles(getModel(id));
      expect(t - 522, `${id}: ${t} △`).toBeGreaterThanOrEqual(70);
      expect(t - 522, `${id}: ${t} △`).toBeLessThanOrEqual(340);
    }
  });

  it('placa de curva e placa do box: +30 a +160 △ (sapatas, parafusos, travessa; antes 166 e 138), a mesma largura e altura (±1 cm)', () => {
    for (const [id, base, halfX, maxY] of [['sign:left', 166, 1.54, 1.9], ['sign:right', 166, 1.54, 1.9], ['pitsign', 138, 0.9, 3.05]] as const) {
      const b = modelBounds(id);
      expect(Math.abs(b.minX + halfX), `${id} minX`).toBeLessThanOrEqual(0.01); expect(Math.abs(b.maxX - halfX), `${id} maxX`).toBeLessThanOrEqual(0.01);
      expect(Math.abs(b.maxY - maxY), `${id} maxY`).toBeLessThanOrEqual(0.01);
      const t = modelTriangles(getModel(id));
      expect(t - base, `${id}: ${t} △`).toBeGreaterThanOrEqual(30);
      expect(t - base, `${id}: ${t} △`).toBeLessThanOrEqual(160);
    }
  });
});
