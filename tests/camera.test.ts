// M5: a câmera de perseguição com os deslocamentos dinâmicos (camera.ts), contra os limites de scenery/sight.ts. Roda no Node (three não precisa de GL).
import { describe, expect, it } from 'vitest';
import { CAR_LENGTH, TICK_RATE } from '../src/core/constants';
import type { RenderFrame } from '../src/game/contracts';
import { cameraExtraFor, ChaseCamera, newCameraExtra, type CameraExtra } from '../src/render/camera';
import { buildRoadFrame } from '../src/render/roadframe';
import { CAMERA_DYNAMICS as D, findCrests, insideCarBox } from '../src/render/scenery/sight';
import { SEGMENT_M } from '../src/render/units';
import { getTrack } from '../src/core/track';
import { human, quickRace, syntheticTrack } from './helpers';

const NO_SHAKE = { x: 0, y: 0, roll: 0 };
const track = syntheticTrack([{ op: 'straight', length: 800 }]);
const rf = buildRoadFrame(track, 4000, 30, 200);

/** Anda a câmera `seconds` s a 60 quadros por segundo com a velocidade e o extra dados; devolve o último quadro e a série. */
function run(cam: ChaseCamera, seconds: number, speed: number, nitro: boolean, extra: CameraExtra, carX = 0, t0 = 0) {
  const series: Array<{ y: number; x: number; z: number; fov: number }> = [];
  for (let i = 0; i < seconds * 60; i++) {
    cam.update(rf, carX, speed, 0, nitro, t0 + i / 60, NO_SHAKE, extra);
    series.push({ y: cam.camera.position.y, x: cam.camera.position.x, z: cam.camera.position.z, fov: cam.camera.fov });
  }
  return series;
}
const extra = (over: Partial<CameraExtra> = {}): CameraExtra => ({ ...newCameraExtra(), ...over });

describe('câmera mais baixa e FOV', () => {
  it('parada, a câmera é a de sempre; na máxima, fica 0,32 m mais baixa e com o FOV aberto', () => {
    const a = new ChaseCamera(); const parada = run(a, 2, 0, false, extra()).at(-1)!;
    expect(parada.y).toBeCloseTo(2.05, 3); expect(parada.z).toBeCloseTo(7.8, 6); expect(parada.fov).toBeCloseTo(62, 1);
    const b = new ChaseCamera(); const rapida = run(b, 3, 1, false, extra()).at(-1)!;
    expect(rapida.y).toBeCloseTo(2.05 - D.lower.max, 3);
    expect(rapida.fov).toBeCloseTo(62 + 13, 0.5);
  });

  it('o piso vale mesmo no nitro (velocidade acima de 100%)', () => {
    const c = new ChaseCamera();
    for (const p of run(c, 3, 1.2, true, extra())) expect(p.y).toBeGreaterThanOrEqual(2.05 - D.lower.max - 1e-9);
  });
});

describe('mola de FOV no engate do nitro', () => {
  it('o FOV passa do valor de repouso do nitro e assenta; nunca passa de repouso + 5° nem de 92°', () => {
    const c = new ChaseCamera();
    run(c, 3, 0.6, false, extra());
    const fim = run(new ChaseCamera(), 5, 0.6, true, extra()).at(-1)!.fov; // o repouso com nitro
    const serie = run(c, 4, 0.6, true, extra(), 0, 3);
    const pico = Math.max(...serie.map((p) => p.fov));
    expect(pico).toBeGreaterThan(fim + 0.5);
    expect(pico).toBeLessThanOrEqual(fim + D.fov.springMax + 0.05);
    expect(pico).toBeLessThanOrEqual(D.fov.hardMax);
    expect(Math.abs(serie.at(-1)!.fov - fim)).toBeLessThan(0.3);
  });

  it('reduzir efeitos: abre para o nitro sem passar do repouso', () => {
    const c = new ChaseCamera();
    run(c, 3, 0.6, false, extra({ reduce: true }));
    const fim = run(new ChaseCamera(), 5, 0.6, true, extra({ reduce: true })).at(-1)!.fov;
    const pico = Math.max(...run(c, 4, 0.6, true, extra({ reduce: true }), 0, 3).map((p) => p.fov));
    expect(pico).toBeLessThanOrEqual(fim + 0.05);
  });

  it('o FOV nunca passa do teto nem no pior caso (velocidade 120%, nitro, tranco)', () => {
    const c = new ChaseCamera();
    for (const p of run(c, 4, 1.2, true, extra())) expect(p.fov).toBeLessThanOrEqual(D.fov.hardMax + 1e-9);
  });
});

describe('tremor fino', () => {
  const spread = (e: CameraExtra, speed: number) => {
    const s = run(new ChaseCamera(), 3, speed, false, e).slice(60);
    const ys = s.map((p) => p.y); const xs = s.map((p) => p.x);
    return { y: Math.max(...ys) - Math.min(...ys), x: Math.max(...xs) - Math.min(...xs) };
  };

  it('acima de 90% da máxima a câmera treme até 2 cm; abaixo não', () => {
    const fino = spread(extra({ tremor: true }), 1);
    expect(fino.x).toBeGreaterThan(0.01); expect(fino.y).toBeGreaterThan(0.01);
    expect(fino.x).toBeLessThanOrEqual(2 * D.tremor.offset + 1e-9); expect(fino.y).toBeLessThanOrEqual(2 * D.tremor.offset + 1e-9);
    const devagar = spread(extra({ tremor: true }), 0.8);
    expect(devagar.x).toBeLessThan(1e-9); expect(devagar.y).toBeLessThan(1e-9);
  });

  it('desligado nas opções ou em reduzir efeitos: a câmera fica parada na velocidade máxima', () => {
    for (const e of [extra({ tremor: false }), extra({ tremor: true, reduce: true })]) {
      const s = spread(e, 1);
      expect(s.x).toBeLessThan(1e-9); expect(s.y).toBeLessThan(1e-9);
    }
  });
});

describe('órbita ao cruzar em 1º', () => {
  const lateral = (e: CameraExtra, carX: number) => { const c = new ChaseCamera(); const p = run(c, 4, 0.4, false, e, carX).at(-1)!; return { ...p, cam: c }; };

  it('sem ter cruzado em 1º a câmera é a de perseguição; com a órbita completa, vai para o lado da pista, perto e mais alta', () => {
    const base = lateral(extra(), 0.4);
    expect(base.z).toBeCloseTo(7.8, 6);
    const orbita = lateral(extra({ finishSeconds: 3 }), 0.4);
    expect(orbita.z).toBeLessThan(3);
    expect(orbita.z).toBeGreaterThan(0);
    expect(orbita.x).toBeLessThan(base.x - 3); // o carro está à direita: a câmera roda para o centro
    expect(orbita.y).toBeGreaterThan(base.y + 0.3);
    expect(Math.abs(orbita.x)).toBeLessThanOrEqual(Math.max(D.orbit.lateralFree, Math.abs(base.x)) + 1e-6);
  });

  it('a órbita vai se abrindo com o tempo desde a linha (não pula)', () => {
    const c = new ChaseCamera();
    let prev = 7.8;
    for (let i = 0; i <= 2.4 * 60; i++) {
      c.update(rf, 0.4, 0.4, 0, false, i / 60, NO_SHAKE, extra({ finishSeconds: i / 60 }));
      expect(c.camera.position.z).toBeLessThanOrEqual(prev + 1e-6);
      expect(prev - c.camera.position.z).toBeLessThan(0.35); // no máximo 35 cm por quadro
      prev = c.camera.position.z;
    }
  });

  it('reduzir efeitos: sem órbita', () => {
    const o = lateral(extra({ finishSeconds: 3, reduce: true }), 0.4);
    expect(o.z).toBeCloseTo(7.8, 6);
  });

  it('um carro no caminho segura a órbita: a câmera não entra na caixa dele', () => {
    const vizinho = { dx: -5, dz: -3 };
    const e = extra({ finishSeconds: 3, neighbors: [vizinho], count: 1 });
    const c = new ChaseCamera();
    for (let i = 0; i < 4 * 60; i++) {
      c.update(rf, 0.4, 0.4, 0, false, i / 60, NO_SHAKE, e);
      const rel = c.camera.position.x - 0.4 * 7; const back = c.camera.position.z;
      expect(insideCarBox(rel, back, vizinho), `quadro ${i}`).toBe(false);
    }
  });
});

describe('cresta', () => {
  it('a cresta que o renderizador soma levanta a câmera (nada além do que veio)', () => {
    const sem = run(new ChaseCamera(), 2, 0.5, false, extra()).at(-1)!.y;
    const com = run(new ChaseCamera(), 2, 0.5, false, extra({ crest: 0.4 })).at(-1)!.y;
    expect(com - sem).toBeCloseTo(0.4, 6);
  });
});

describe('o que o renderizador entrega à câmera (cameraExtraFor)', () => {
  function cena() {
    const { state, track: tr } = quickRace({ humans: [human(0)], totalCars: 6 });
    state.phase = 'racing';
    const frame = { state, track: tr, viewports: [], options: { quality: 'high', showMinimap: false, screenShake: true, reduceEffects: false, palette: 'default' }, time: 0, paused: false, coop: false, showHud: false } as unknown as RenderFrame;
    const idx = state.cars.findIndex((c) => c.seat === 0);
    return { state, frame, idx, car: state.cars[idx] };
  }

  it('a opção de tremor e o reduzir efeitos vêm das opções do quadro', () => {
    const { frame, idx } = cena();
    expect(cameraExtraFor(frame, idx)).toMatchObject({ tremor: true, reduce: false });
    frame.options.screenShake = false;
    expect(cameraExtraFor(frame, idx)).toMatchObject({ tremor: false, reduce: false });
    frame.options.screenShake = true; frame.options.reduceEffects = true;
    expect(cameraExtraFor(frame, idx)).toMatchObject({ tremor: false, reduce: true });
  });

  it('só quem cruzou a linha em 1º tem a órbita, contada em segundos desde o tick da chegada', () => {
    const { state, frame, idx, car } = cena();
    expect(cameraExtraFor(frame, idx).finishSeconds).toBeLessThan(0);
    car.finished = true; car.finishTick = 600; car.position = 2; state.tick = 720;
    expect(cameraExtraFor(frame, idx).finishSeconds).toBeLessThan(0); // 2º lugar: sem órbita
    car.position = 1;
    expect(cameraExtraFor(frame, idx).finishSeconds).toBeCloseTo(120 / TICK_RATE, 9);
    car.finished = false;
    expect(cameraExtraFor(frame, idx).finishSeconds).toBeLessThan(0);
  });

  it('os vizinhos vêm em metros relativos ao carro (dz positivo = à frente), só os até 20 m', () => {
    const { state, frame, idx, car } = cena();
    car.z = 10_000; car.x = 0.2;
    const [a, b, c] = state.cars.filter((_, i) => i !== idx);
    a.z = car.z + CAR_LENGTH * 3; a.x = -0.3; // 3 carros à frente = 12 m
    b.z = car.z - 50 * 5; b.x = 0.6; // 5 m atrás (50 unidades por metro... o segmento tem 200 u = 4 m)
    c.z = car.z + 5000; c.x = 0; // 100 m: fora
    for (const o of state.cars) if (o !== car && o !== a && o !== b && o !== c) { o.z = car.z + 20_000; }
    const e = cameraExtraFor(frame, idx);
    expect(e.count).toBe(2);
    const na = e.neighbors[0]; const nb = e.neighbors[1];
    const metros = (u: number) => (u * SEGMENT_M) / 200;
    const [pa, pb] = Math.abs(na.dz - metros(CAR_LENGTH * 3)) < 1e-6 ? [na, nb] : [nb, na];
    expect(pa.dz).toBeCloseTo(metros(CAR_LENGTH * 3), 6); expect(pa.dx).toBeCloseTo((-0.3 - 0.2) * 7, 6);
    expect(pb.dz).toBeCloseTo(-metros(250), 6); expect(pb.dx).toBeCloseTo((0.6 - 0.2) * 7, 6);
  });

  it('a elevação da cresta vem das cristas da pista (zero longe delas e devagar)', () => {
    const tr = getTrack('palmas');
    const { state, frame, idx, car } = cena();
    (frame as { track: unknown }).track = tr; state.trackLength = tr.length;
    const c0 = findCrests(tr)[0];
    car.z = c0.z; car.speed = car.stats.topSpeed;
    const sobre = cameraExtraFor(frame, idx).crest;
    expect(sobre).toBeGreaterThan(0.1); expect(sobre).toBeLessThanOrEqual(D.crest.lift);
    car.speed = car.stats.topSpeed * 0.3;
    expect(cameraExtraFor(frame, idx).crest).toBe(0);
    // Um ponto a 60 m ou mais de todas as cristas (fora das janelas de subida e de descida): sem elevação.
    const cs = findCrests(tr);
    let longe = -1;
    for (let z = 0; z < tr.length && longe < 0; z += 200 * 5) if (cs.every((c) => Math.abs(((z - c.z + tr.length * 1.5) % tr.length) - tr.length / 2) * (SEGMENT_M / 200) > 60)) longe = z;
    expect(longe).toBeGreaterThanOrEqual(0);
    car.speed = car.stats.topSpeed; car.z = longe;
    expect(cameraExtraFor(frame, idx).crest).toBe(0);
  });
});

describe('sem ciclo de importação entre camera.ts e scenery/sight.ts', () => {
  it('carregar um ou outro primeiro dá o mesmo CHASE_CAMERA (a pose-base vive na folha camera-base.ts)', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    const a = await import('../src/render/camera');
    const b = await import('../src/render/scenery/sight');
    expect(a.CHASE_CAMERA.height).toBe(2.05);
    expect(b.SIGHT_TAN_H).toBeGreaterThan(0);
    vi.resetModules();
    const b2 = await import('../src/render/scenery/sight');
    const a2 = await import('../src/render/camera');
    expect(b2.SIGHT_TAN_H).toBe(b.SIGHT_TAN_H);
    expect(a2.CHASE_CAMERA).toBe((await import('../src/render/camera-base')).CHASE_CAMERA);
  });
});
