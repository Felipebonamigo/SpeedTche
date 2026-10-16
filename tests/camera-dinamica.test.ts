// M5: os deslocamentos dinâmicos da câmera de perseguição e os LIMITES deles, modelados em scenery/sight.ts (CAMERA_DYNAMICS):
// câmera mais baixa em velocidade, mola de FOV no engate do nitro, tremor fino acima de 90%, órbita ao cruzar em 1º e a cresta de morro.
// A base (CHASE_CAMERA) não muda. O que importa aqui é o que NUNCA pode acontecer: a câmera dentro do cenário, do chão ou do carro da frente.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRACKS, getTrack } from '../src/core/track';
import { CHASE_CAMERA } from '../src/render/camera';
import { landmarkSightRoad } from '../src/render/scenery/layout';
import {
  CAMERA_DYNAMICS, cameraLowering, crestLift, findCrests, insideCarBox, orbitAmount, orbitCamera, sightRoad, sightSeconds, stepNitroFov, tremorAmount,
  tremorOffset, type BlockHeight, type Neighbor, type NitroFov, type OrbitOut,
} from '../src/render/scenery/sight';
import { SEGMENT_M } from '../src/render/units';
import { syntheticTrack } from './helpers';

const D = CAMERA_DYNAMICS;

describe('a base da câmera não muda', () => {
  it('CHASE_CAMERA é a de sempre (os marcos, a legenda e a conta de enquadramento leem estes números)', () => {
    expect(CHASE_CAMERA).toEqual({ baseFov: 62, speedFov: 13, nitroFov: 8, height: 2.05, back: 7.8, lookAhead: 18, lookY: 0.85 });
  });
});

describe('câmera mais baixa em velocidade', () => {
  it('zero até 55% da máxima, o máximo de 0,32 m na máxima, crescente no meio', () => {
    expect(cameraLowering(0)).toBe(0);
    expect(cameraLowering(D.lower.from)).toBe(0);
    expect(cameraLowering(1)).toBeCloseTo(D.lower.max, 9);
    expect(cameraLowering(1.2)).toBeCloseTo(D.lower.max, 9); // o nitro passa de 100%: o limite vale
    let prev = 0;
    for (let sf = 0; sf <= 1.2001; sf += 0.01) { const v = cameraLowering(sf); expect(v, `sf ${sf}`).toBeGreaterThanOrEqual(prev - 1e-12); prev = v; }
    expect(cameraLowering(0.8)).toBeGreaterThan(0.05);
  });

  it('o piso: mesmo na máxima, a câmera fica a mais de 1,6 m da pista (acima do capô e do chão)', () => {
    expect(CHASE_CAMERA.height - D.lower.max).toBeGreaterThanOrEqual(1.6);
  });

  it('abaixar 0,32 m não custa um marco à vista: numa visada com muro de 1,6 m o marco se vê menos, nunca mais', () => {
    const n = 1000; const k = 500 + n;
    const segments = Array.from({ length: n }, (_, i) => ({ index: i, z: i * 200, curve: 0, y0: 0, y1: 0, band: 0, pit: false, sprites: [] }));
    const track = { def: { id: 'reta', scenery: 'savanna', timeOfDay: 'day' }, segments, length: n * 200, startIndex: 0 } as never;
    const wall: BlockHeight = (_s, side, lat) => (side < 0 && lat >= 10 && lat <= 12 ? 1.6 : 0);
    const road = sightRoad(track, wall, 12, () => true);
    const box = { minX: -3, maxX: 3, minZ: -3, maxZ: 3, maxY: 1.0 };
    const normal = sightSeconds(road, k, 0.5, -60, 0, 0, box, false);
    const baixa = sightSeconds(road, k, 0.5, -60, 0, 0, box, false, -Infinity, D.lower.max);
    expect(baixa).toBeLessThanOrEqual(normal);
    expect(baixa).toBeLessThan(normal); // com o muro de 1,6 m (a visada da base passa por cima, a da câmera baixa não) ela de fato perde o marco
    expect(sightSeconds(road, k, 0.5, 60, 0, Math.PI, box, false, -Infinity, D.lower.max)).toBeCloseTo(sightSeconds(road, k, 0.5, 60, 0, Math.PI, box, false), 5);
  });
});

describe('tremor fino acima de 90%', () => {
  it('nada até 90% da máxima, cheio na máxima, crescente', () => {
    expect(tremorAmount(0)).toBe(0);
    expect(tremorAmount(0.5)).toBe(0);
    expect(tremorAmount(D.tremor.from)).toBe(0);
    expect(tremorAmount(0.95)).toBeCloseTo(0.5, 6);
    expect(tremorAmount(1)).toBeCloseTo(1, 9);
    expect(tremorAmount(1.2)).toBe(1);
    let prev = 0;
    for (let sf = 0; sf <= 1.2001; sf += 0.005) { const v = tremorAmount(sf); expect(v).toBeGreaterThanOrEqual(prev - 1e-12); prev = v; }
  });

  it('o deslocamento nunca passa de 2 cm (0,003 rad no giro) e some com intensidade zero', () => {
    let maxX = 0; let maxY = 0; let maxR = 0; let moved = false; let last = Infinity;
    for (let t = 0; t < 20; t += 0.0013) {
      const o = tremorOffset(t, 1);
      maxX = Math.max(maxX, Math.abs(o.x)); maxY = Math.max(maxY, Math.abs(o.y)); maxR = Math.max(maxR, Math.abs(o.roll));
      if (Math.abs(o.x - last) > 1e-4) moved = true;
      last = o.x;
      const z = tremorOffset(t, 0);
      expect(Math.abs(z.x)).toBe(0); expect(Math.abs(z.y)).toBe(0); expect(Math.abs(z.roll)).toBe(0);
    }
    expect(moved).toBe(true);
    expect(maxX).toBeLessThanOrEqual(D.tremor.offset + 1e-12); expect(maxY).toBeLessThanOrEqual(D.tremor.offset + 1e-12); expect(maxR).toBeLessThanOrEqual(D.tremor.roll + 1e-12);
    expect(maxX).toBeGreaterThan(D.tremor.offset * 0.5); // o tremor existe (não é só o limite)
    const meio = tremorOffset(1.234, 0.5); const cheio = tremorOffset(1.234, 1);
    expect(Math.abs(meio.x)).toBeCloseTo(Math.abs(cheio.x) / 2, 9);
  });
});

describe('mola de FOV no engate do nitro', () => {
  const run = (reduce: boolean, seconds: number, dt = 1 / 60, engaged = true) => {
    const s: NitroFov = { x: 0, v: 0 };
    const xs: number[] = [];
    for (let t = 0, first = true; t < seconds; t += dt) { stepNitroFov(s, engaged, first, dt, reduce); first = false; xs.push(s.x); }
    return xs;
  };

  it('passa do alvo (sobrepasso) no engate, até 5° no máximo, e assenta em 1,5 s', () => {
    const xs = run(false, 3);
    const alvo = CHASE_CAMERA.nitroFov;
    const pico = Math.max(...xs);
    expect(pico).toBeGreaterThan(alvo + 0.5);
    expect(pico).toBeLessThanOrEqual(alvo + D.fov.springMax + 1e-9);
    expect(Math.abs(xs[Math.round(1.5 * 60)] - alvo)).toBeLessThan(0.3);
    expect(Math.abs(xs[xs.length - 1] - alvo)).toBeLessThan(0.05);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
  });

  it('o nitro que acaba devolve o FOV sem passar do zero', () => {
    const s: NitroFov = { x: CHASE_CAMERA.nitroFov, v: 0 };
    let min = Infinity;
    for (let t = 0; t < 2; t += 1 / 60) { stepNitroFov(s, false, false, 1 / 60, false); min = Math.min(min, s.x); }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(s.x).toBeLessThan(0.2);
  });

  it('reduzir efeitos: chega ao alvo sem sobrepasso nem tranco', () => {
    const xs = run(true, 3);
    expect(Math.max(...xs)).toBeLessThanOrEqual(CHASE_CAMERA.nitroFov + 1e-9);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1] - 1e-9);
    expect(Math.abs(xs[xs.length - 1] - CHASE_CAMERA.nitroFov)).toBeLessThan(0.1);
  });

  it('estável com quadro lento (10 fps) e o teto absoluto do FOV vale na soma de tudo', () => {
    const xs = run(false, 3, 0.1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(CHASE_CAMERA.nitroFov + D.fov.springMax + 1e-9);
    expect(Math.abs(xs[xs.length - 1] - CHASE_CAMERA.nitroFov)).toBeLessThan(0.5);
    const maximo = CHASE_CAMERA.baseFov + CHASE_CAMERA.speedFov * 1.2 + CHASE_CAMERA.nitroFov + D.fov.springMax;
    expect(maximo).toBeLessThanOrEqual(D.fov.hardMax);
  });
});

describe('órbita ao cruzar a linha em 1º', () => {
  it('sobe de 0 a 1 em 2,4 s, suave nas pontas', () => {
    expect(orbitAmount(-1)).toBe(0);
    expect(orbitAmount(0)).toBe(0);
    expect(orbitAmount(D.orbit.seconds)).toBe(1);
    expect(orbitAmount(D.orbit.seconds * 3)).toBe(1);
    expect(orbitAmount(0.02)).toBeLessThan(0.001);
    expect(orbitAmount(D.orbit.seconds - 0.02)).toBeGreaterThan(0.999);
    let prev = 0;
    for (let s = 0; s <= 3; s += 0.01) { const v = orbitAmount(s); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
  });

  it('sem órbita a câmera fica onde a base a põe; com ela, vai para o lado do centro da pista, mais perto e mais alto', () => {
    const sem = orbitCamera(0, 3, 2.7, [], 0);
    expect(sem.lat).toBeCloseTo(2.7, 9); expect(sem.back).toBeCloseTo(CHASE_CAMERA.back, 9); expect(sem.lift).toBe(0); expect(sem.alpha).toBe(0);
    const dir = orbitCamera(1, 3, 2.7, [], 0);
    expect(dir.lat).toBeLessThan(2.7); // o carro está à direita do eixo: a câmera roda para o lado da pista
    expect(dir.back).toBeLessThan(CHASE_CAMERA.back);
    expect(dir.back).toBeGreaterThan(0);
    expect(dir.lift).toBeGreaterThan(0); expect(dir.lift).toBeLessThanOrEqual(D.orbit.lift);
    const esq = orbitCamera(1, -3, -2.7, [], 0);
    expect(esq.lat).toBeGreaterThan(-2.7);
    expect(Math.abs(dir.yaw)).toBeLessThanOrEqual(D.orbit.yawMax + 1e-9);
  });

  it('a lateral nunca passa de max(5,5 m, a da câmera-base): o corredor de 5,5 m está livre em todas as pistas', () => {
    const out: OrbitOut = { lat: 0, back: 0, lift: 0, alpha: 0, yaw: 0 };
    for (const carLat of [-7, -5, -2, 0, 2, 5, 7]) for (const camLag of [0, 0.5, 0.9, 1]) for (const a of [0.1, 0.4, 0.7, 1]) {
      const camLat = carLat * camLag;
      orbitCamera(a, carLat, camLat, [], 0, out);
      expect(Math.abs(out.lat), `carro ${carLat}, base ${camLat}, α ${a}`).toBeLessThanOrEqual(Math.max(D.orbit.lateralFree, Math.abs(camLat)) + 1e-9);
      expect(out.back).toBeGreaterThan(0);
    }
  });

  it('nas 109 pistas não há célula ocupada nem sólido dentro do corredor livre da câmera', { timeout: 120_000 }, () => {
    const ids = TRACKS.map((t) => t.id);
    expect(ids.length).toBeGreaterThanOrEqual(109);
    for (const id of ids) {
      const track = getTrack(id);
      const road = landmarkSightRoad(track);
      const ocupadas: string[] = [];
      for (let s = 0; s < road.n; s++) for (const side of [-1, 1]) for (let lat = 0; lat <= D.orbit.lateralFree; lat += 0.5) {
        if (road.block(s, side, lat) > 0) ocupadas.push(`seg ${s} lado ${side} a ${lat} m`);
      }
      for (const seg of track.segments) for (const sp of seg.sprites) {
        if (sp.solid && Math.abs(sp.x) * 7 < D.orbit.lateralFree + 1) ocupadas.push(`${sp.kind} sólido a ${Math.abs(sp.x) * 7} m`);
      }
      expect(ocupadas.slice(0, 3), id).toEqual([]);
    }
  });

  /** Os vizinhos possíveis: qualquer posição (dx, dz) em volta que não se sobrepõe ao carro da câmera (a colisão não deixa). */
  function vizinhos(): Neighbor[] {
    const list: Neighbor[] = [];
    for (let dx = -10; dx <= 10; dx += 0.5) for (let dz = -12; dz <= 12; dz += 0.5) {
      if (Math.abs(dx) < 2 * D.orbit.halfWidth && Math.abs(dz) < 2 * D.orbit.halfLength) continue; // dentro do carro dono da câmera
      list.push({ dx, dz });
    }
    return list;
  }

  it('varredura: a câmera nunca cai na caixa do carro da frente nem na dos lados (se a base já não estava)', () => {
    const out: OrbitOut = { lat: 0, back: 0, lift: 0, alpha: 0, yaw: 0 };
    let checked = 0; let reduced = 0;
    for (const carLat of [-6, -2, 0, 3, 6]) for (const a of [0.25, 0.5, 0.75, 1]) for (const n of vizinhos()) {
      const camLat = carLat * 0.9;
      orbitCamera(a, carLat, camLat, [n], 1, out);
      if (insideCarBox(camLat - carLat, CHASE_CAMERA.back, n)) continue; // a base já estava dentro de um carro de trás: não é do deslocamento
      checked++;
      if (out.alpha < a - 1e-9) reduced++;
      expect(insideCarBox(out.lat - carLat, out.back, n), `carro ${carLat}, α ${a}, vizinho ${n.dx},${n.dz}: câmera em ${out.lat - carLat},${out.back}`).toBe(false);
    }
    expect(checked).toBeGreaterThan(1000);
    expect(reduced).toBeGreaterThan(0); // houve vizinho que de fato fez a órbita recuar
  });

  it('nem o carro dono da câmera: a órbita não entra na própria caixa', () => {
    const out: OrbitOut = { lat: 0, back: 0, lift: 0, alpha: 0, yaw: 0 };
    for (const carLat of [-6, 0, 6]) for (let a = 0; a <= 1.0001; a += 0.05) {
      orbitCamera(a, carLat, carLat * 0.9, [], 0, out);
      expect(insideCarBox(out.lat - carLat, out.back, { dx: 0, dz: 0 }), `carro ${carLat}, α ${a}`).toBe(false);
    }
  });

  it('com vários vizinhos a câmera continua fora de todos', () => {
    const out: OrbitOut = { lat: 0, back: 0, lift: 0, alpha: 0, yaw: 0 };
    const grupo: Neighbor[] = [{ dx: 3, dz: -4 }, { dx: -3, dz: -6 }, { dx: 5, dz: -2 }, { dx: -5.5, dz: -3 }, { dx: 0, dz: 6 }];
    for (const carLat of [-3, 0, 3]) for (let a = 0.1; a <= 1.0001; a += 0.1) {
      orbitCamera(a, carLat, carLat * 0.9, grupo, grupo.length, out);
      for (const n of grupo) {
        if (insideCarBox(carLat * 0.9 - carLat, CHASE_CAMERA.back, n)) continue;
        expect(insideCarBox(out.lat - carLat, out.back, n)).toBe(false);
      }
    }
  });
});

describe('cristas de morro (só visuais)', () => {
  it('as pistas têm de 0 a 4 cristas por volta, afastadas de 40 segmentos, e a maioria tem ao menos uma', { timeout: 60_000 }, () => {
    let comUma = 0;
    for (const t of TRACKS) {
      const track = getTrack(t.id);
      const cs = findCrests(track);
      expect(cs.length, t.id).toBeLessThanOrEqual(D.crest.max);
      if (cs.length > 0) comUma++;
      const n = track.segments.length;
      for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
        const d = Math.abs(cs[i].seg - cs[j].seg); expect(Math.min(d, n - d), `${t.id}: ${cs[i].seg} × ${cs[j].seg}`).toBeGreaterThanOrEqual(D.crest.spacing);
      }
      for (const c of cs) { expect(c.z).toBeGreaterThanOrEqual(0); expect(c.z).toBeLessThan(track.length); expect(c.drop).toBeGreaterThan(0); }
    }
    expect(comUma).toBeGreaterThanOrEqual(70);
  });

  it('pista plana não tem cresta', () => {
    expect(findCrests(syntheticTrack())).toEqual([]);
  });

  it('a elevação some longe da cresta e devagar, sobe com a velocidade e nunca passa de 0,5 m', () => {
    const track = getTrack('palmas');
    const cs = findCrests(track);
    expect(cs.length).toBeGreaterThanOrEqual(1);
    const c = cs[0];
    const zAt = (m: number) => c.z + (m / SEGMENT_M) * 200;
    expect(crestLift(cs, zAt(-80), track.length, 1)).toBe(0);
    expect(crestLift(cs, zAt(120), track.length, 1)).toBe(0);
    let max = 0;
    for (let m = -40; m <= 60; m += 0.5) { const v = crestLift(cs, zAt(m), track.length, 1); max = Math.max(max, v); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(D.crest.lift + 1e-9); }
    expect(max).toBeGreaterThan(0.1);
    // devagar não flutua
    for (let m = -40; m <= 60; m += 0.5) expect(crestLift(cs, zAt(m), track.length, 0.3)).toBe(0);
    // mais rápido, mais alto
    const at = zAt(4);
    expect(crestLift(cs, at, track.length, 1)).toBeGreaterThanOrEqual(crestLift(cs, at, track.length, 0.7));
    // sem crista, sem elevação
    expect(crestLift([], at, track.length, 1)).toBe(0);
  });

  it('T8: a cresta é só da câmera — a elevação já sobe ANTES da cresta (o carro ainda subindo o morro), então não serve de "carro no ar"', () => {
    const track = getTrack('palmas');
    const cs = findCrests(track);
    const c = cs[0];
    const zAt = (m: number) => c.z + (m / SEGMENT_M) * 200;
    // 5 m antes do topo o morro ainda sobe sob o carro, e a câmera já flutua: um carro que subisse junto sairia do chão na subida.
    expect(crestLift(cs, zAt(-5), track.length, 1)).toBeGreaterThan(0.1);
    // O renderizador dos carros não usa a elevação da cresta (o carro fica na pista; o pulo de verdade seria física, no núcleo).
    expect(readFileSync('src/render/cars.ts', 'utf8')).not.toMatch(/crestLift|findCrests/);
  });

  it('a elevação é contínua: nenhum salto de mais de 3 cm entre dois pontos a 25 cm um do outro', () => {
    const track = getTrack('palmas');
    const cs = findCrests(track);
    for (const c of cs) {
      let prev = crestLift(cs, c.z + ((-60 / SEGMENT_M) * 200), track.length, 1);
      for (let m = -59.75; m <= 90; m += 0.25) {
        const v = crestLift(cs, c.z + ((m / SEGMENT_M) * 200), track.length, 1);
        expect(Math.abs(v - prev), `a ${m} m`).toBeLessThan(0.03);
        prev = v;
      }
    }
  });
});
