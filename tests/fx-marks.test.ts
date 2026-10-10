// M5: marcas de pneu (src/render/fx/marks.ts): um anel de pontos em coordenada de pista (z, x) com teto, reprojetado em cada viewport pelo RoadFrame.
import { describe, expect, it } from 'vitest';
import { LAUNCH_PERFECT, LAUNCH_NONE } from '../src/core/constants';
import { getTrack } from '../src/core/track';
import type { Quality, RenderFrame } from '../src/game/contracts';
import { Effects } from '../src/render/effects';
import { MARK_GAP_M, MARK_LIFE_S, MARK_STEP_M, markStrength, MarkBuffer, TireMarks, type MarkCarState } from '../src/render/fx/marks';
import { buildRoadFrame, locateOnFrame } from '../src/render/roadframe';
import { human, quickRace, syntheticTrack } from './helpers';

const M = 50; // unidades de pista por metro
const track = syntheticTrack([{ op: 'straight', length: 1200 }]);

/** Uma faixa reta de `n` pontos de `step` m, a partir de `z0`. */
function line(buf: MarkBuffer, strip: number, n: number, step = 1, z0 = 1000, x = 0, t0 = 0, dt = 0.01): void {
  for (let i = 0; i < n; i++) buf.push(strip, z0 + i * step * M, x, 1, t0 + i * dt);
}
const segs = (buf: MarkBuffer, time: number) => { const l: Array<[number, number, number, number, number, number]> = []; buf.forEachSegment(time, (za, xa, zb, xb, aa, ab) => l.push([za, xa, zb, xb, aa, ab])); return l; };

describe('MarkBuffer: o anel de pontos', () => {
  it('guarda no máximo `capacity` pontos, e o mais velho cai primeiro', () => {
    const buf = new MarkBuffer(100, 1e9);
    line(buf, 0, 5000);
    expect(buf.count()).toBe(100);
    const l = segs(buf, 50);
    expect(l.length).toBeGreaterThan(90); expect(l.length).toBeLessThanOrEqual(99);
    const zMin = Math.min(...l.map((s) => Math.min(s[0], s[2])));
    expect(zMin).toBeGreaterThan(1000 + (5000 - 101) * M - 1); // só sobraram os 100 últimos
  });

  it('um ponto a menos de 0,5 m do anterior da mesma faixa não entra', () => {
    const buf = new MarkBuffer(50, 1e9);
    expect(buf.push(0, 1000, 0, 1, 0)).toBe(true);
    expect(buf.push(0, 1000 + (MARK_STEP_M * M) * 0.5, 0, 1, 0.01)).toBe(false);
    expect(buf.push(0, 1000 + (MARK_STEP_M * M) * 1.2, 0, 1, 0.02)).toBe(true);
    expect(buf.count()).toBe(2);
    expect(buf.push(1, 1000, 0.1, 1, 0.02)).toBe(true); // outra faixa não conta a distância da primeira
  });

  it('a faixa quebra com a lacuna (de espaço ou de tempo) e o ponto novo não liga ao antigo; faixas diferentes não se ligam', () => {
    const buf = new MarkBuffer(50, 1e9);
    buf.push(0, 1000, 0, 1, 0); buf.push(0, 1000 + 2 * M, 0, 1, 0.03);
    expect(segs(buf, 0.1)).toHaveLength(1);
    buf.push(0, 1000 + (2 + MARK_GAP_M + 1) * M, 0, 1, 0.06); // longe demais
    expect(segs(buf, 0.1)).toHaveLength(1);
    buf.push(0, 1000 + (2 + MARK_GAP_M + 1 + 1) * M, 0, 1, 0.09); // este liga ao anterior (a nova faixa)
    expect(segs(buf, 0.1)).toHaveLength(2);
    buf.push(0, 1000 + (2 + MARK_GAP_M + 3) * M, 0, 1, 5); // perto, mas 5 s depois: outra passada, não liga
    expect(segs(buf, 5.1)).toHaveLength(2);
    const b2 = new MarkBuffer(50, 1e9);
    b2.push(0, 1000, 0, 1, 0); b2.push(1, 1000 + M, 0.2, 1, 0); b2.push(0, 1000 + 2 * M, 0, 1, 0.01); b2.push(1, 1000 + 3 * M, 0.2, 1, 0.01);
    expect(segs(b2, 0.1)).toHaveLength(2); // duas faixas, um segmento cada
    b2.breakStrip(0); b2.push(0, 1000 + 4 * M, 0, 1, 0.02);
    expect(segs(b2, 0.1)).toHaveLength(2); // quebrada: o ponto novo começa outra faixa
  });

  it('sobrescrever um ponto não deixa o seguinte ligado ao lixo: o primeiro que sobrou não tem segmento para trás', () => {
    const buf = new MarkBuffer(10, 1e9);
    line(buf, 0, 25, 1);
    const l = segs(buf, 1);
    expect(l).toHaveLength(9); // 10 pontos, 9 segmentos
    for (let i = 1; i < l.length; i++) expect(l[i][0]).toBeCloseTo(l[i - 1][2], 3); // encadeados
  });

  it('a volta da pista emenda: de perto do fim para o começo é um segmento só', () => {
    const buf = new MarkBuffer(10, 20_000);
    buf.push(0, 20_000 - 1.5 * M, 0, 1, 0); buf.push(0, 1.5 * M, 0, 1, 0.03);
    const l = segs(buf, 0.1);
    expect(l).toHaveLength(1);
  });

  it('desbota com a idade e some aos 45 s', () => {
    const buf = new MarkBuffer(10, 1e9);
    buf.push(0, 1000, 0, 1, 0); buf.push(0, 1000 + 2 * M, 0, 1, 0.03);
    const novo = segs(buf, 0.1)[0][4];
    const meio = segs(buf, MARK_LIFE_S / 2)[0][4];
    expect(novo).toBeGreaterThan(0.9); expect(meio).toBeLessThan(novo * 0.7); expect(meio).toBeGreaterThan(0.1);
    expect(segs(buf, MARK_LIFE_S + 1)).toHaveLength(0);
  });

  it('setCapacity troca o teto e limpa; clear zera', () => {
    const buf = new MarkBuffer(100, 1e9);
    line(buf, 0, 80);
    buf.setCapacity(30);
    expect(buf.count()).toBe(0);
    line(buf, 0, 80);
    expect(buf.count()).toBe(30);
    buf.clear();
    expect(buf.count()).toBe(0);
  });
});

describe('quando o carro deixa marca', () => {
  const car = (over: Partial<MarkCarState> = {}): MarkCarState => ({ z: 0, x: 0, speed: 5000, driftDir: 0, driftTicks: 0, driftCharge: 0, collisionCooldown: 0, launch: LAUNCH_NONE, ...over });

  it('derrapando deixa marca, mais forte com a carga; andar reto não deixa', () => {
    expect(markStrength(car(), 0, 10000, 999)).toBe(0);
    const s0 = markStrength(car({ driftDir: 1, driftTicks: 20, driftCharge: 0 }), 0, 10000, 999);
    const s3 = markStrength(car({ driftDir: 1, driftTicks: 20, driftCharge: 200 }), 0, 10000, 999);
    expect(s0).toBeGreaterThan(0.3); expect(s3).toBeGreaterThan(s0); expect(s3).toBeLessThanOrEqual(1);
    expect(markStrength(car({ driftDir: 1, driftTicks: 20, speed: 500 }), 0, 10000, 999)).toBe(0); // devagar demais
  });

  it('a freada forte deixa marca (e a batida, não); a largada-foguete queima borracha no primeiro 0,7 s', () => {
    expect(markStrength(car(), 9000, 10000, 999)).toBeGreaterThan(0.3);
    expect(markStrength(car(), 9000, 10000, 999)).toBeLessThan(markStrength(car({ driftDir: 1, driftTicks: 20, driftCharge: 200 }), 0, 10000, 999));
    expect(markStrength(car({ collisionCooldown: 10 }), 9000, 10000, 999)).toBe(0);
    expect(markStrength(car({ launch: LAUNCH_PERFECT, speed: 800 }), 0, 10000, 0.3)).toBeGreaterThan(0.3);
    expect(markStrength(car({ launch: LAUNCH_PERFECT, speed: 800 }), 0, 10000, 0.9)).toBe(0);
    expect(markStrength(car({ launch: LAUNCH_NONE, speed: 800 }), 0, 10000, 0.3)).toBe(0);
  });
});

describe('TireMarks: a fita no chão, reprojetada por viewport', () => {
  const rfAt = (z: number) => buildRoadFrame(track, z, 30, 200);

  it('cada segmento vira 2 triângulos, a malha só aparece com marca, e o que sai da janela da pista é pulado', () => {
    const tm = new TireMarks(64);
    tm.buffer.setTrackLength(track.length);
    tm.pose(rfAt(1000), track, 0);
    expect(tm.mesh.visible).toBe(false);
    line(tm.buffer, 0, 10, 1, 1000 + 20 * M, -0.1, 0);
    tm.pose(rfAt(1000), track, 0.2);
    expect(tm.segments).toBe(9);
    expect(tm.mesh.visible).toBe(true);
    expect(tm.mesh.geometry.drawRange.count).toBe(9 * 6);
    tm.pose(rfAt(1000 + 200 * 400), track, 0.2); // câmera 400 segmentos adiante: as marcas ficaram para trás
    expect(tm.segments).toBe(0);
    expect(tm.mesh.visible).toBe(false);
  });

  it('a mesma marca em dois viewports (carros em lugares diferentes) cai à mesma distância dos pontos entre si, e na origem do carro quando está nele', () => {
    const tm = new TireMarks(64);
    tm.buffer.setTrackLength(track.length);
    tm.buffer.push(0, 3000, 0.3, 1, 0); tm.buffer.push(0, 3000 + 3 * M, 0.3, 1, 0.03);
    const medir = (zCar: number) => {
      tm.pose(rfAt(zCar), track, 0.1);
      const p = tm.mesh.geometry.getAttribute('position');
      // vértices 0/1 = lado esquerdo/direito do ponto A; 2/3 = do ponto B
      const a = [(p.getX(0) + p.getX(1)) / 2, (p.getY(0) + p.getY(1)) / 2, (p.getZ(0) + p.getZ(1)) / 2];
      const b = [(p.getX(2) + p.getX(3)) / 2, (p.getY(2) + p.getY(3)) / 2, (p.getZ(2) + p.getZ(3)) / 2];
      return { a, b, d: Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), w: Math.hypot(p.getX(0) - p.getX(1), p.getY(0) - p.getY(1), p.getZ(0) - p.getZ(1)) };
    };
    const um = medir(3000 - 10 * M); const dois = medir(3000 + 30 * M);
    expect(um.d).toBeCloseTo(3, 2); expect(dois.d).toBeCloseTo(3, 2);
    expect(um.w).toBeGreaterThan(0.1); expect(um.w).toBeLessThan(0.4); // a largura de um pneu
    // o carro em cima do ponto A: ele cai na origem do referencial (z = 0), à lateral dele
    const sobre = medir(3000);
    expect(sobre.a[2]).toBeCloseTo(0, 3); expect(sobre.a[0]).toBeCloseTo(0.3 * 7, 3);
    // e não afunda nem flutua longe do chão
    expect(Math.abs(sobre.a[1])).toBeLessThan(0.1);
  });

  it('a cor é escura e o brilho acompanha a força e a idade (um alfa por vértice)', () => {
    const tm = new TireMarks(8); tm.buffer.setTrackLength(track.length);
    tm.buffer.push(0, 3000, 0, 1, 0); tm.buffer.push(0, 3000 + 2 * M, 0, 0.5, 0.03);
    tm.pose(rfAt(3000), track, 0.1);
    const c = tm.mesh.geometry.getAttribute('color');
    expect(c.itemSize).toBe(4);
    expect(c.getX(0)).toBeLessThan(0.15); // escuro
    expect(c.getW(0)).toBeGreaterThan(c.getW(2)); // A (força 1) mais forte que B (força 0,5)
    const m = tm.mesh.material as unknown as { transparent: boolean; depthWrite: boolean; polygonOffset: boolean; vertexColors: boolean };
    expect(m.transparent).toBe(true); expect(m.depthWrite).toBe(false); expect(m.polygonOffset).toBe(true); expect(m.vertexColors).toBe(true);
  });

  it('a lateral e o rumo vêm do RoadFrame: numa curva a fita acompanha a pista (os dois lados do ponto ficam em x e z diferentes)', () => {
    const curva = syntheticTrack([{ op: 'straight', length: 100 }, { op: 'curve', length: 400, curve: 8 }]);
    const tm = new TireMarks(8); tm.buffer.setTrackLength(curva.length);
    tm.buffer.push(0, 60_000, 0, 1, 0); tm.buffer.push(0, 60_000 + 2 * M, 0, 1, 0.03);
    tm.pose(buildRoadFrame(curva, 60_000 - 5 * M, 30, 200), curva, 0.1);
    const p = tm.mesh.geometry.getAttribute('position');
    expect(Math.abs(p.getZ(0) - p.getZ(1))).toBeGreaterThan(0.003); // o rumo não é zero: o "lado" da fita gira junto
  });
});

describe('marcas no Effects', () => {
  function cena(quality: Quality, reduce = false) {
    const t = getTrack('copacabana');
    const { state } = quickRace({ humans: [human(0)], totalCars: 3, track: t });
    state.phase = 'racing'; state.tick = 600;
    const idx = state.cars.findIndex((c) => c.seat === 0);
    for (const c of state.cars) if (c !== state.cars[idx]) c.z = (state.cars[idx].z + t.length / 2) % t.length;
    const frame = { state, track: t, time: 5, paused: false, coop: false, showHud: false, viewports: [{ seat: 0, carIndex: idx, color: '#fff', name: 'P1', messages: [] }],
      options: { quality, showMinimap: false, screenShake: true, reduceEffects: reduce, palette: 'default' } } as unknown as RenderFrame;
    const fx = new Effects(); fx.update(frame);
    return { state, frame, fx, car: state.cars[idx], track: t };
  }
  const run = (s: ReturnType<typeof cena>, frames: number, drifting: boolean) => {
    for (let i = 0; i < frames; i++) {
      s.car.speed = 5000; s.car.z = (s.car.z + 5000 / 60) % s.track.length;
      if (drifting) { s.car.driftDir = 1; s.car.driftTicks = 40; s.car.driftCharge = 120; } else { s.car.driftDir = 0; s.car.driftTicks = 0; }
      s.frame.time += 1 / 60; s.fx.update(s.frame);
      s.fx.pose(buildRoadFrame(s.track, s.car.z, 30, 200), s.track, 600, 0);
    }
    return s.fx.counts();
  };

  it('derrapar deixa marca nas duas rodas; andar reto, nenhuma; reduzir efeitos não tira a marca', () => {
    expect(run(cena('high'), 120, true).marks).toBeGreaterThan(100);
    expect(run(cena('high'), 120, false).marks).toBe(0);
    expect(run(cena('high', true), 120, true).marks).toBeGreaterThan(100);
  });

  it('o teto de pontos vale por degrau: depois de muito derrapar, o Baixo guarda ≤ 192, o Alto ≤ 1280 e mais que o Baixo', () => {
    const baixo = run(cena('low'), 1500, true).marks;
    const alto = run(cena('high'), 1500, true).marks;
    expect(baixo).toBeLessThanOrEqual(192); expect(baixo).toBeGreaterThan(100);
    expect(alto).toBeLessThanOrEqual(1280); expect(alto).toBeGreaterThan(baixo);
  });

  it('a marca atravessa a linha de chegada (a volta da pista) sem quebrar: o Effects diz o comprimento da pista ao buffer', () => {
    const s = cena('high');
    const buf = (s.fx as unknown as { marks: { buffer: MarkBuffer } }).marks.buffer;
    s.car.z = s.track.length - 5 * 50 * 1.7; // 8,5 m antes da linha: o carro anda 1,67 m por quadro
    let pushes = 0;
    for (let i = 0; i < 12; i++) {
      s.car.speed = 5000; s.car.z = (s.car.z + 5000 / 60) % s.track.length;
      s.car.driftDir = 1; s.car.driftTicks = 40; s.car.driftCharge = 120;
      s.frame.time += 1 / 60; s.fx.update(s.frame); pushes++;
    }
    let n = 0; buf.forEachSegment(s.frame.time, () => { n++; });
    expect(n).toBe(2 * (pushes - 1)); // duas rodas, cada uma uma faixa só de ponta a ponta
  });

  it('a malha de marcas entra no grupo do Effects e fica oculta sem marca', () => {
    const s = cena('high');
    expect(s.fx.group.children.some((o) => o.name === 'fx-marks')).toBe(true);
    s.fx.pose(buildRoadFrame(s.track, s.car.z, 30, 200), s.track, 600, 0);
    expect(s.fx.group.children.find((o) => o.name === 'fx-marks')?.visible).toBe(false);
  });
});

void locateOnFrame;
