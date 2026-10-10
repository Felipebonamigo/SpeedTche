// Paisagem do Rio (onda L, L4; cronograma: "os morros e o Pão de Açúcar na baía, num módulo novo src/render/horizon.ts ligado ao
// terrain.ts na mescla"). `buildHorizon(trackId, paleta, qualidade)` devolve o horizonte pintado no mesmo referencial dos anéis do
// terreno (azimute a: x = cos a · R, z = sin a · R; a = −π/2 é a frente na largada, 0 é a direita, onde fica o mar de Copacabana).
// Puro de DOM: só malhas e cores. Tudo no Node.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Quality } from '../src/game/contracts';
import { buildHorizon, horizonDetail, relToAz, RIO_BAY, RIO_RIDGES, ridgeHeight } from '../src/render/horizon';
import { palette } from '../src/render/palette';

const QUALITIES: readonly Quality[] = ['low', 'medium', 'high', 'ultra'];
const day = palette('coast', 'day');
const night = palette('coast', 'night');

const tris = (o: THREE.Object3D): number => {
  let t = 0;
  o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) t += m.geometry.getAttribute('position').count / 3; });
  return t;
};
const names = (o: THREE.Object3D): string[] => o.children.map((c) => c.name);
/** Distância média (RGB) das cores de um mesh à cor da névoa: menor = mais dentro da névoa. */
const fogDistance = (m: THREE.Mesh, fog: THREE.Color): number => {
  const col = m.geometry.getAttribute('color') as THREE.BufferAttribute;
  let sum = 0;
  for (let i = 0; i < col.count; i++) sum += Math.hypot(col.getX(i) - fog.r, col.getY(i) - fog.g, col.getZ(i) - fog.b);
  return sum / col.count;
};
const lum = (m: THREE.Mesh): number => {
  const col = m.geometry.getAttribute('color') as THREE.BufferAttribute;
  let sum = 0;
  for (let i = 0; i < col.count; i++) sum += (col.getX(i) + col.getY(i) + col.getZ(i)) / 3;
  return sum / col.count;
};

describe('horizonte do Rio: quem ganha e quem não', () => {
  it('Copacabana ganha o horizonte (um Object3D com malhas); as outras pistas devolvem null (a Q4 acrescenta as suas)', () => {
    const h = buildHorizon('copacabana', day, 'high');
    expect(h).not.toBeNull();
    expect(h?.isObject3D).toBe(true);
    expect(tris(h as THREE.Object3D)).toBeGreaterThan(500);
    for (const id of ['sampa_noite', 'foz_do_iguacu', 'monte_fuji', 'nao_existe']) expect(buildHorizon(id, day, 'high'), id).toBeNull();
  });
});

describe('horizonte do Rio: geografia', () => {
  it('a terra (Corcovado, Tijuca, Gávea, Dois Irmãos) fica à esquerda ou atrás, o mar (Leme, Pão, Urca, Niterói, Cagarras) à direita', () => {
    expect(RIO_RIDGES.length).toBeGreaterThanOrEqual(7);
    for (const r of RIO_RIDGES) {
      if (r.side === 'land') expect(r.rel, r.name).toBeLessThan(0);
      else expect(r.rel, r.name).toBeGreaterThan(0);
    }
    const names = RIO_RIDGES.map((r) => r.name);
    for (const n of ['corcovado', 'tijuca', 'gavea', 'dois-irmaos', 'leme']) expect(names, n).toContain(n);
  });

  it('o Pão de Açúcar fica do lado do mar, à frente-direita, com a Urca ao lado dele e mais baixa; as ilhas são baixas', () => {
    expect(RIO_BAY.pao.rel).toBeGreaterThan(0);
    expect(RIO_BAY.pao.rel).toBeLessThan(90);
    expect(Math.abs(RIO_BAY.urca.rel - RIO_BAY.pao.rel)).toBeLessThanOrEqual(12);
    expect(RIO_BAY.urca.h).toBeLessThan(RIO_BAY.pao.h * 0.6);
    for (const i of RIO_BAY.islands) expect(i.h).toBeLessThan(RIO_BAY.urca.h * 0.5);
    const h = buildHorizon('copacabana', day, 'medium') as THREE.Object3D;
    const pao = h.getObjectByName('horizon:pao-de-acucar') as THREE.Object3D;
    expect(pao).toBeDefined();
    // a posição no mundo bate com o azimute dos dados
    const az = relToAz(RIO_BAY.pao.rel);
    expect(Math.atan2(pao.position.z, pao.position.x)).toBeCloseTo(Math.atan2(Math.sin(az), Math.cos(az)), 5);
    expect(Math.hypot(pao.position.x, pao.position.z)).toBeCloseTo(RIO_BAY.pao.radius, 3);
  });

  it('os morros têm crista arredondada: nenhuma dobra do contorno passa de 60° (a régua do horizonte-suave), com a resolução da média', () => {
    const N = horizonDetail('medium').points;
    for (const layer of [0, 1, 2]) {
      const R = [470, 660, 920][layer];
      const pts = Array.from({ length: N + 2 }, (_, i) => [(i / N) * 2 * Math.PI * R, ridgeHeight(layer, ((i % N) / N) * 2 * Math.PI)]);
      let worst = 0;
      for (let i = 1; i <= N; i++) {
        const a = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
        const b = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
        worst = Math.max(worst, (Math.abs(a - b) * 180) / Math.PI);
      }
      expect(worst, `camada ${layer}`).toBeLessThan(60);
    }
  });

  it('o horizonte é de verdade o do Rio: os morros altos de terra passam de 100 m e o contorno some onde é mar aberto (sem morro em frente ao Pão)', () => {
    let tall = 0;
    for (let a = 0; a < 360; a++) if (ridgeHeight(1, (a / 180) * Math.PI) > 100) tall++;
    expect(tall).toBeGreaterThan(8);
    // mar aberto atrás do Pão (a direita, entre a Urca e as Cagarras): nenhum anel passa de 5 m
    for (const layer of [0, 1]) expect(ridgeHeight(layer, relToAz(100)), `camada ${layer}`).toBeLessThan(5);
  });
});

describe('horizonte do Rio: cor e névoa', () => {
  it('quanto mais longe a camada, mais dentro da névoa (a névoa assada por vértice); a noite escurece', () => {
    const fog = new THREE.Color(day.fog);
    const h = buildHorizon('copacabana', day, 'high') as THREE.Object3D;
    const layers = [0, 1, 2].map((l) => h.getObjectByName(`horizon:layer-${l}`) as THREE.Mesh);
    for (const m of layers) expect(m).toBeDefined();
    expect(fogDistance(layers[1], fog)).toBeLessThan(fogDistance(layers[0], fog));
    expect(fogDistance(layers[2], fog)).toBeLessThan(fogDistance(layers[1], fog));
    const hn = buildHorizon('copacabana', night, 'high') as THREE.Object3D;
    for (let l = 0; l < 3; l++) expect(lum(hn.getObjectByName(`horizon:layer-${l}`) as THREE.Mesh), `camada ${l}`).toBeLessThan(lum(layers[l]));
  });
});

describe('horizonte do Rio: degraus de qualidade (atLeast)', () => {
  it('pontos e triângulos crescem da baixa à Ultra, tudo ≤ 4.000 triângulos; a média passa de 200 pontos por volta', () => {
    const pts = QUALITIES.map((q) => horizonDetail(q).points);
    const t = QUALITIES.map((q) => tris(buildHorizon('copacabana', day, q) as THREE.Object3D));
    for (let i = 1; i < QUALITIES.length; i++) { expect(pts[i], QUALITIES[i]).toBeGreaterThan(pts[i - 1]); expect(t[i], QUALITIES[i]).toBeGreaterThan(t[i - 1]); }
    for (const x of t) expect(x).toBeLessThanOrEqual(4000);
    expect(pts[1]).toBeGreaterThanOrEqual(200);
    console.log(`horizonte do Rio, triângulos: ${QUALITIES.map((q, i) => `${q} ${t[i]}`).join(' · ')}`);
  });

  it('a baixa é só a silhueta (sem Pão nem Urca nem ilhas); a média traz o Pão e a Urca; a alta, as Cagarras; a Ultra, Niterói ao fundo', () => {
    const has = (q: Quality, n: string): boolean => names(buildHorizon('copacabana', day, q) as THREE.Object3D).includes(n);
    expect(has('low', 'horizon:pao-de-acucar')).toBe(false);
    expect(has('low', 'horizon:urca')).toBe(false);
    expect(has('medium', 'horizon:pao-de-acucar')).toBe(true);
    expect(has('medium', 'horizon:urca')).toBe(true);
    expect(has('medium', 'horizon:cagarras')).toBe(false);
    expect(has('high', 'horizon:cagarras')).toBe(true);
    expect(has('high', 'horizon:niteroi')).toBe(false);
    expect(has('ultra', 'horizon:niteroi')).toBe(true);
  });
});

describe('horizonte do Rio: determinismo e limpeza', () => {
  it('duas chamadas dão a mesma malha, bit a bit', () => {
    const a = buildHorizon('copacabana', day, 'ultra') as THREE.Object3D; const b = buildHorizon('copacabana', day, 'ultra') as THREE.Object3D;
    expect(a.children.length).toBe(b.children.length);
    a.children.forEach((c, i) => {
      const ga = (c as THREE.Mesh).geometry.getAttribute('position').array; const gb = (b.children[i] as THREE.Mesh).geometry.getAttribute('position').array;
      expect(Array.from(ga as Float32Array)).toEqual(Array.from(gb as Float32Array));
    });
  });

  it('dispose() libera as geometrias e o material', () => {
    const h = buildHorizon('copacabana', day, 'high') as THREE.Object3D & { dispose(): void };
    let geos = 0; let mats = 0;
    h.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.addEventListener('dispose', () => geos++);
      (m.material as THREE.Material).addEventListener('dispose', () => mats++);
    });
    const meshes = h.children.length;
    h.dispose();
    expect(geos).toBe(meshes);
    expect(mats).toBeGreaterThanOrEqual(1);
  });
});
