// Os 161 marcos no kit redondo (onda M, M3; cronograma: "ExtrudeGeometry com bisel nos 4 arquivos que hoje usam bevelEnabled:false e caixa com bisel no kit de
// marcos"). O kit de marcos (`landmarks/kit.ts`) ganha a caixa que arredonda sozinha quando é grande (`box`), a de bisel explícita (`rbox`), a extrusão com bisel que
// MANTÉM a caixa do contorno (`extrudeRound`) e o ajuste de orçamento (`fitted`): o marco é montado no nível pleno e, se passa do orçamento do lugar, de novo num nível
// menor — ninguém tira um objeto à mão, e o que não cabe nem no nível 0 nunca existiu (o 0 é a geometria de antes). Tudo no Node, sem DOM.
import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { getModel } from '../src/render/scenery/catalog';
import { getRoundLevel, getRoundPlace, setRoundLevel } from '../src/render/scenery/geom';
import { LANDMARKS } from '../src/render/scenery/landmarks';
import { checkLandmarkModel, LANDMARK_LIMITS } from '../src/render/scenery/landmarks/check';
import { box, extrudeRound, fitted, rbox } from '../src/render/scenery/landmarks/kit';
import type { LandmarkRegistry } from '../src/render/scenery/landmarks/types';

const tris = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
const boxOf = (g: THREE.BufferGeometry): THREE.Box3 => new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);

afterEach(() => setRoundLevel(3, 1));

describe('kit de marcos: caixa com bisel', () => {
  it('a caixa grande (menor medida ≥ 2,5 m) vira caixa de bisel: 108 triângulos, a caixa exata, normais marcadas para a fusão', () => {
    const g = box(20, 30, 12);
    expect(tris(g)).toBe(108);
    expect(g.userData.roundNormals).toBe(true);
    const b = boxOf(g);
    expect(b.max.x - b.min.x).toBeCloseTo(20, 4);
    expect(b.max.y - b.min.y).toBeCloseTo(30, 4);
    expect(b.max.z - b.min.z).toBeCloseTo(12, 4);
    // A quina viva não existe: o vértice mais perto do canto (10, 15, 6) está a ≥ 5% do bisel de 1,08 m.
    let near = Infinity;
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) near = Math.min(near, Math.hypot(p.getX(i) - 10, p.getY(i) - 15, p.getZ(i) - 6));
    expect(near).toBeGreaterThan(0.4);
  });

  it('a caixa fina ou pequena fica como era (12 triângulos): parede de 0,5 m, janela, viga', () => {
    for (const [w, h, d] of [[40, 12, 0.5], [0.25, 1.2, 1.6], [30, 1.0, 1.0]] as const) {
      const g = box(w, h, d);
      expect(tris(g), `${w}×${h}×${d}`).toBe(12);
      expect(g.userData.roundNormals).toBeUndefined();
    }
  });

  it('de perto (30–80 m) a caixa de 1,2 m já ganha bisel; no horizonte (400 m+), só a de 7,5 m; no nível 0 nenhuma', () => {
    setRoundLevel(3, 0.4);
    expect(tris(box(1.2, 4, 4))).toBe(108);
    setRoundLevel(3, 3);
    expect(tris(box(4, 6, 6))).toBe(12);
    expect(tris(box(8, 9, 9))).toBe(108);
    setRoundLevel(0, 1);
    expect(tris(box(30, 30, 30))).toBe(12);
  });

  it('rbox: bisel explícito de qualquer tamanho, com uv quando pedida (a fachada) e a caixa exata', () => {
    const g = rbox(2, 3, 1.5, 0.2);
    expect(tris(g)).toBe(108);
    const b = boxOf(g);
    expect(b.max.x - b.min.x).toBeCloseTo(2, 5);
    const f = rbox(10, 12, 8, 0.5, [12, 12]);
    expect(f.getAttribute('uv')).toBeDefined();
  });
});

describe('kit de marcos: extrusão com bisel', () => {
  const wall = (): THREE.Shape => {
    const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(40, 0), new THREE.Vector2(40, 12), new THREE.Vector2(0, 12)]);
    const hole = new THREE.Path([new THREE.Vector2(10, 2), new THREE.Vector2(14, 2), new THREE.Vector2(14, 9), new THREE.Vector2(10, 9)]);
    s.holes.push(hole);
    return s;
  };

  it('a extrusão tem bisel (bevelEnabled) e a MESMA caixa da reta: contorno e profundidade não mudam', () => {
    const round = extrudeRound(wall(), 6, 0.5);
    const straight = extrudeRound(wall(), 6, 0);
    const parameters = (round as THREE.ExtrudeGeometry).parameters as { options: { bevelEnabled: boolean; bevelOffset: number } };
    expect(parameters.options.bevelEnabled).toBe(true);
    expect(parameters.options.bevelOffset).toBeLessThan(0);
    const a = boxOf(round); const b = boxOf(straight);
    for (const [lo, hi] of [['x', 'x'], ['y', 'y'], ['z', 'z']] as const) {
      expect(a.min[lo], `min ${lo}`).toBeCloseTo(b.min[lo], 3);
      expect(a.max[hi], `max ${hi}`).toBeCloseTo(b.max[hi], 3);
    }
    expect(tris(round)).toBeGreaterThan(tris(straight));
  });

  it('sem bisel (bisel zero) ou no nível 0 é a extrusão reta de antes; o bisel nunca passa de um quarto da profundidade', () => {
    expect((extrudeRound(wall(), 6, 0) as THREE.ExtrudeGeometry).parameters.options?.bevelEnabled).toBe(false);
    setRoundLevel(0, 1);
    expect((extrudeRound(wall(), 6, 0.5) as THREE.ExtrudeGeometry).parameters.options?.bevelEnabled).toBe(false);
    setRoundLevel(3, 1);
    const g = extrudeRound(wall(), 2, 5); // pede 5 m numa laje de 2 m: vira 0,5 m
    const b = boxOf(g);
    expect(b.max.z - b.min.z).toBeCloseTo(2, 3);
  });
});

describe('kit de marcos: o ajuste de orçamento', () => {
  const heavy = (): LandmarkRegistry => fitted({
    pesado: {
      place: 'near', side: 'any', perLap: 1,
      build: () => {
        const parts: THREE.BufferGeometry[] = [];
        // 35 caixas de 3 m e 25 de 9 m: de perto, no nível pleno e no 2 todas ganham bisel (6.480 triângulos); no 1 só as de 9 m (3.120); no 0 nenhuma (720).
        for (let i = 0; i < 35; i++) parts.push(box(3, 3, 3).translate(i * 5, 1.5, 0));
        for (let i = 0; i < 25; i++) parts.push(box(9, 9, 9).translate(i * 12, 4.5, 20));
        const g = parts.map((p) => p.toNonIndexed());
        const merged = new THREE.BufferGeometry();
        const pos: number[] = [];
        for (const q of g) pos.push(...Array.from(q.getAttribute('position').array));
        merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        return { parts: [{ geometry: merged, mat: 'flat' }] };
      },
    },
  });

  it('o marco que estoura o orçamento do lugar no nível pleno é montado de novo, num nível menor, e cabe', () => {
    const m = heavy().pesado.build();
    const t = m.parts.reduce((s, p) => s + p.geometry.getAttribute('position').count / 3, 0);
    expect(t).toBeLessThanOrEqual(LANDMARK_LIMITS.budget.near);
    expect(t).toBeGreaterThan(720); // não caiu até o nível 0: as caixas grandes mantêm o bisel no nível 1 (3.120 triângulos)
    expect(t).toBeLessThanOrEqual(3500);
  });

  it('o nível e o lugar de antes voltam depois da montagem (nenhuma montagem vaza o nível para a seguinte)', () => {
    setRoundLevel(2, 0.4);
    heavy().pesado.build();
    expect(getRoundLevel()).toBe(2);
    expect(getRoundPlace()).toBe(0.4);
  });
});

describe('os 161 marcos no kit redondo', () => {
  const ids = Object.keys(LANDMARKS);

  it('todos passam no validador do lugar (orçamento, base no chão, origem na pegada) depois do ajuste', () => {
    expect(ids.length).toBe(161);
    const bad: string[] = [];
    for (const id of ids) {
      const problems = checkLandmarkModel(getModel(`lm:${id}`), LANDMARKS[id].place);
      if (problems.length) bad.push(`${id}: ${problems[0]}`);
    }
    expect(bad).toEqual([]);
  }, 120000);

  it('os marcos de leitura mais importantes têm a caixa de bisel (parte lisa com normal do kit)', () => {
    const heroes = ['masp', 'congresso_nacional', 'catedral_brasilia', 'teatro_amazonas', 'torre_toquio', 'castelo_osaka', 'torre_eiffel', 'convento_penha', 'igreja_barroca', 'casario_colonial', 'ponte_hercilio_luz', 'palacio_rio_branco', 'arco_triunfo'];
    for (const id of heroes) {
      const flat = getModel(`lm:${id}`).parts.find((p) => p.mat === 'flat');
      expect(flat?.geometry.userData.keepNormals, id).toBe(true);
    }
  });

  it('a maioria dos marcos (≥ 70 dos 161) tem bisel; o resto é natureza (morro, cachoeira, duna) ou o orçamento do lugar não deixou', () => {
    const withBevel = ids.filter((id) => getModel(`lm:${id}`).parts.some((p) => p.mat === 'flat' && p.geometry.userData.keepNormals));
    expect(withBevel.length).toBeGreaterThanOrEqual(70);
  }, 120000);

  it('a montagem continua determinística (duas montagens, a mesma malha, bit a bit) e o nível voltou ao pleno', () => {
    for (const id of ['masp', 'torre_eiffel', 'ponte_hercilio_luz', 'cavalhada']) {
      const a = LANDMARKS[id].build(); const b = LANDMARKS[id].build();
      expect(a.parts.length).toBe(b.parts.length);
      for (let i = 0; i < a.parts.length; i++) {
        expect(Array.from(a.parts[i].geometry.getAttribute('position').array), `${id} parte ${i}`).toEqual(Array.from(b.parts[i].geometry.getAttribute('position').array));
      }
    }
    expect(getRoundLevel()).toBe(3);
  });
});
