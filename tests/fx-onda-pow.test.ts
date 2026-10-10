// M5: a onda de choque (largada e engate do nitro) e o "POW" da batida (src/render/fx/shockwave.ts e pow.ts). Puro/Node.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LAUNCH_PERFECT } from '../src/core/constants';
import { getTrack } from '../src/core/track';
import type { RaceState } from '../src/core/types';
import type { Quality, RenderFrame } from '../src/game/contracts';
import { Effects } from '../src/render/effects';
import { drawPowSprite, POW_MAX, POW_SECONDS, powPose, Pows, powSize } from '../src/render/fx/pow';
import { SHOCK_MAX, SHOCK_SPECS, shockPose, Shockwaves, type ShockKind } from '../src/render/fx/shockwave';
import { buildRoadFrame, locateOnFrame } from '../src/render/roadframe';
import { human, quickRace, syntheticTrack } from './helpers';

const track = syntheticTrack([{ op: 'straight', length: 1200 }]);
const rf = buildRoadFrame(track, 3000, 30, 200);
const KINDS: ShockKind[] = ['ground', 'perfect', 'halo'];

describe('onda de choque: o anel', () => {
  it('abre do raio inicial ao final em toda a vida, sem encolher, e apaga; fora da vida não existe', () => {
    for (const k of KINDS) {
      const sp = SHOCK_SPECS[k];
      expect(shockPose(k, -0.01), k).toBeNull();
      expect(shockPose(k, sp.life + 0.01), k).toBeNull();
      let prevR = 0; let prevA = 2;
      for (let t = 0; t < sp.life; t += sp.life / 50) {
        const p = shockPose(k, t)!;
        expect(p.radius, `${k} ${t}`).toBeGreaterThanOrEqual(prevR); expect(p.alpha, `${k} ${t}`).toBeLessThanOrEqual(prevA);
        prevR = p.radius; prevA = p.alpha;
        expect(p.radius).toBeGreaterThanOrEqual(sp.r0 - 1e-9); expect(p.radius).toBeLessThanOrEqual(sp.r1 + 1e-9);
      }
      expect(shockPose(k, 0)!.alpha).toBeGreaterThan(0.8); // já aparece cheio no primeiro quadro
      expect(shockPose(k, sp.life * 0.99)!.radius).toBeGreaterThan(sp.r0 + (sp.r1 - sp.r0) * 0.9);
      expect(shockPose(k, sp.life * 0.99)!.alpha).toBeLessThan(0.1);
    }
    expect(SHOCK_SPECS.perfect.r1).toBeGreaterThan(SHOCK_SPECS.ground.r1); // a largada-foguete abre mais
    expect(SHOCK_SPECS.ground.life).toBeCloseTo(0.5, 6); expect(SHOCK_SPECS.halo.life).toBeCloseTo(0.35, 6);
    expect(SHOCK_SPECS.ground.r1).toBe(7); expect(SHOCK_SPECS.perfect.r1).toBe(11); expect(SHOCK_SPECS.halo.r1).toBe(5);
  });

  it('o pool: nasce, passa de idade, morre, e no máximo 8 vivos (o mais velho cai)', () => {
    const w = new Shockwaves();
    expect(w.mesh).toBeInstanceOf(THREE.InstancedMesh);
    w.spawn('ground', 3000, 0, 0.05);
    expect(w.alive()).toBe(1);
    w.step(0.3); expect(w.alive()).toBe(1);
    w.step(0.3); expect(w.alive()).toBe(0);
    for (let i = 0; i < 12; i++) w.spawn('halo', 3000 + i * 10, 0, 0.5);
    expect(w.alive()).toBe(SHOCK_MAX);
    w.clear(); expect(w.alive()).toBe(0);
  });

  it('a pose escreve uma instância por anel: posição na pista, raio na escala, chão deitado e halo de pé, atravessado ao rumo', () => {
    const w = new Shockwaves();
    w.spawn('ground', 3000, 0.2, 0.05);
    w.spawn('halo', 3000 - 50 * 4, -0.3, 0.5);
    w.step(0.1);
    w.pose(rf, track);
    expect(w.mesh.visible).toBe(true);
    expect(w.mesh.count).toBe(2);
    const m = new THREE.Matrix4(); const pos = new THREE.Vector3(); const q = new THREE.Quaternion(); const sc = new THREE.Vector3();
    w.mesh.getMatrixAt(0, m); m.decompose(pos, q, sc);
    expect(pos.x).toBeCloseTo(0.2 * 7, 3); expect(pos.z).toBeCloseTo(0, 3); expect(pos.y).toBeCloseTo(0.05, 2);
    const p = shockPose('ground', 0.1)!;
    expect(sc.x).toBeCloseTo(p.radius, 4); expect(sc.y).toBeCloseTo(p.radius, 4);
    const n0 = new THREE.Vector3(0, 0, 1).applyQuaternion(q); // a normal do anel
    expect(Math.abs(n0.y)).toBeGreaterThan(0.99); // o do chão é horizontal
    w.mesh.getMatrixAt(1, m); m.decompose(pos, q, sc);
    expect(pos.z).toBeGreaterThan(2); // 4 m atrás
    expect(pos.y).toBeCloseTo(0.5, 2);
    const n1 = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    expect(Math.abs(n1.z)).toBeGreaterThan(0.99); // o halo é vertical, de frente para o rumo (pista reta: normal no eixo da pista)
  });

  it('numa curva o halo acompanha o rumo da pista (a normal gira com ele)', () => {
    const curva = syntheticTrack([{ op: 'straight', length: 100 }, { op: 'curve', length: 400, curve: 8 }]);
    const f = buildRoadFrame(curva, 60_000 - 20 * 50, 30, 200);
    const w = new Shockwaves();
    w.spawn('halo', 60_000, 0, 0.5); w.step(0.05); w.pose(f, curva);
    const m = new THREE.Matrix4(); const pos = new THREE.Vector3(); const q = new THREE.Quaternion(); const sc = new THREE.Vector3();
    w.mesh.getMatrixAt(0, m); m.decompose(pos, q, sc);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const pt = { x: 0, y: 0, z: 0, heading: 0 };
    expect(locateOnFrame(f, curva, 60_000, 0, pt)).toBe(true);
    expect(Math.abs(pt.heading)).toBeGreaterThan(0.01); // a curva gira de verdade aqui
    expect(Math.abs(n.x)).toBeCloseTo(Math.abs(Math.sin(pt.heading)), 3); // e a normal do anel gira junto: aponta para onde a pista aponta
    expect(Math.abs(n.z)).toBeCloseTo(Math.abs(Math.cos(pt.heading)), 3);
  });

  it('o anel é macio: transparente nas duas bordas e mais brilhante no meio (cor de vértice, aditivo), e leve', () => {
    const w = new Shockwaves();
    const g = w.mesh.geometry;
    const col = g.getAttribute('color');
    expect(col).toBeDefined();
    const vals = Array.from({ length: col.count }, (_, i) => col.getX(i));
    expect(Math.min(...vals)).toBe(0); expect(Math.max(...vals)).toBe(1);
    expect(vals.filter((v) => v === 0).length).toBeGreaterThan(vals.filter((v) => v === 1).length); // duas bordas para um miolo
    expect((g.getIndex()?.count ?? 0) / 3).toBeLessThanOrEqual(200);
    expect((w.mesh.material as THREE.MeshBasicMaterial).vertexColors).toBe(true);
  });

  it('o brilho vai pela cor da instância (aditivo) e cai com a idade; fora da janela da pista não aparece', () => {
    const w = new Shockwaves();
    const mat = w.mesh.material as THREE.MeshBasicMaterial;
    expect(mat.blending).toBe(THREE.AdditiveBlending); expect(mat.depthWrite).toBe(false); expect(mat.transparent).toBe(true);
    w.spawn('perfect', 3000, 0, 0.05); w.step(0.05); w.pose(rf, track);
    const novo = new THREE.Color(); w.mesh.getColorAt(0, novo);
    w.step(0.4); w.pose(rf, track);
    const velho = new THREE.Color(); w.mesh.getColorAt(0, velho);
    expect(novo.b).toBeGreaterThan(novo.r); // a da largada-foguete é azulada
    expect(velho.b).toBeLessThan(novo.b);
    w.pose(buildRoadFrame(track, 3000 + 200 * 400, 30, 200), track);
    expect(w.mesh.count).toBe(0); expect(w.mesh.visible).toBe(false);
  });
});

describe('POW da batida', () => {
  it('estoura (passa de 1 e assenta), segura e some em 0,55 s', () => {
    expect(powPose(-0.01)).toBeNull();
    expect(powPose(POW_SECONDS + 0.01)).toBeNull();
    expect(POW_SECONDS).toBeCloseTo(0.55, 9);
    expect(powPose(0)!.scale).toBeLessThan(0.3);
    let max = 0;
    for (let t = 0; t < POW_SECONDS; t += 0.005) { const p = powPose(t)!; max = Math.max(max, p.scale); expect(p.scale).toBeGreaterThanOrEqual(0); expect(p.alpha).toBeGreaterThanOrEqual(0); expect(p.alpha).toBeLessThanOrEqual(1); }
    expect(max).toBeGreaterThan(1.1); expect(max).toBeLessThanOrEqual(1.3);
    expect(powPose(0.3)!.scale).toBeCloseTo(1, 1);
    expect(powPose(0.3)!.alpha).toBe(1);
    expect(powPose(POW_SECONDS - 0.01)!.alpha).toBeLessThan(0.2);
  });

  it('o tamanho cresce com a queda de velocidade, entre 1,8 e 3,4 m', () => {
    expect(powSize(0)).toBeCloseTo(1.8, 6);
    expect(powSize(0.12)).toBeGreaterThan(3.0);
    expect(powSize(1)).toBeCloseTo(3.4, 6);
    let prev = 0;
    for (let d = 0; d <= 0.5; d += 0.01) { const v = powSize(d); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
  });

  it('o pool: no máximo 6, passa de idade e morre; a pose põe o centro na pista e a escala/o brilho/a rotação por instância', () => {
    const p = new Pows();
    for (let i = 0; i < 10; i++) p.spawn(3000 + i, 0, 1.6, 2.5, 0.1);
    expect(p.alive()).toBe(POW_MAX);
    p.clear();
    p.spawn(3000, 0.2, 1.6, 2.5, 0.2);
    p.step(0.2); p.pose(rf, track);
    expect(p.mesh.count).toBe(1); expect(p.mesh.visible).toBe(true);
    const m = new THREE.Matrix4(); const pos = new THREE.Vector3();
    p.mesh.getMatrixAt(0, m); pos.setFromMatrixPosition(m);
    expect(pos.x).toBeCloseTo(1.4, 3); expect(pos.y).toBeCloseTo(1.6, 2); expect(pos.z).toBeCloseTo(0, 3);
    const pop = p.mesh.geometry.getAttribute('aPop') as THREE.InstancedBufferAttribute;
    expect(pop.getX(0)).toBeCloseTo(2.5 * powPose(0.2)!.scale, 4); expect(pop.getY(0)).toBeCloseTo(powPose(0.2)!.alpha, 4); expect(pop.getZ(0)).toBeCloseTo(0.2, 4);
    p.step(1); p.pose(rf, track);
    expect(p.alive()).toBe(0); expect(p.mesh.visible).toBe(false);
  });

  it('o POW acompanha o carro que bateu enquanto dura (senão o carro anda e deixa o quadrinho para trás, perto da câmera, enorme)', () => {
    const p = new Pows();
    p.spawn(3000, 0.2, 1.6, 2.5, 0, 7);
    p.follow(7, 3300, 0.1); // o carro 7 andou 6 m
    p.follow(8, 9999, 0.9); // outro dono: não mexe
    p.step(0.1); p.pose(rf, track);
    const m = new THREE.Matrix4(); p.mesh.getMatrixAt(0, m);
    const pos = new THREE.Vector3().setFromMatrixPosition(m);
    expect(pos.z).toBeCloseTo(-(300 / 50), 3); expect(pos.x).toBeCloseTo(0.1 * 7, 3); // rf está em z = 3000: 300 unidades à frente = 6 m
    p.spawn(3000, 0, 1.6, 2.5, 0); // sem dono: fica onde nasceu
    p.follow(-1, 5000, 0.5);
    p.pose(rf, track);
    p.mesh.getMatrixAt(1, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).z).toBeCloseTo(0, 3);
  });

  it('é um billboard instanciado, por cima de tudo (sem teste de profundidade), de mistura normal', () => {
    const p = new Pows();
    const mat = p.mesh.material as unknown as THREE.ShaderMaterial;
    expect(p.mesh).toBeInstanceOf(THREE.InstancedMesh);
    expect(mat.transparent).toBe(true); expect(mat.depthTest).toBe(false); expect(mat.depthWrite).toBe(false);
    expect(mat.vertexShader).toContain('instanceMatrix'); expect(mat.vertexShader).toContain('aPop');
    expect(mat.fragmentShader).toContain('discard');
  });

  it('o desenho do quadrinho: uma explosão e a palavra POW!', () => {
    const calls: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : (...a: unknown[]) => { calls.push(`${String(k)}:${a[0] ?? ''}`); }), set: (t, k, v) => { t[k as string] = v; return true; } });
    drawPowSprite(ctx as never, 256);
    expect(calls.some((c) => c.startsWith('fillText:POW!'))).toBe(true);
    expect(calls.filter((c) => c.startsWith('lineTo')).length).toBeGreaterThan(20); // a explosão tem pontas
    expect(calls.some((c) => c.startsWith('stroke'))).toBe(true); // com contorno
  });
});

describe('os eventos ligam o anel e o POW (Effects)', () => {
  function cena(quality: Quality, reduce = false) {
    const t = getTrack('copacabana');
    const { state } = quickRace({ humans: [human(0), human(1, 1)], totalCars: 4, track: t });
    const idx = state.cars.findIndex((c) => c.seat === 0);
    const frame = { state, track: t, time: 5, paused: false, coop: true, showHud: false,
      viewports: state.cars.filter((c) => c.seat >= 0).map((c) => ({ seat: c.seat, carIndex: state.cars.indexOf(c), color: '#fff', name: `P${c.seat + 1}`, messages: [] })),
      options: { quality, showMinimap: false, screenShake: true, reduceEffects: reduce, palette: 'default' } } as unknown as RenderFrame;
    const fx = new Effects(); fx.update(frame);
    return { state, frame, fx, car: state.cars[idx] };
  }
  const tick = (s: ReturnType<typeof cena>) => { s.frame.time += 1 / 60; s.fx.update(s.frame); };
  const waves = (fx: Effects) => (fx as unknown as { waves: Shockwaves }).waves.alive();
  const pows = (fx: Effects) => (fx as unknown as { pows: Pows }).pows.alive();

  it('a largada acende um anel por humano; na largada-foguete, também; na Baixa e em reduzir efeitos, nenhum', () => {
    const s = cena('high'); s.state.phase = 'racing';
    tick(s);
    expect(waves(s.fx)).toBe(2);
    const p = cena('high'); p.car.launch = LAUNCH_PERFECT; p.car.nitroTicks = 90; p.state.phase = 'racing';
    tick(p);
    expect(waves(p.fx)).toBe(2); // o "go" perfeito não ganha um halo de nitro por cima
    const lo = cena('low'); lo.state.phase = 'racing'; tick(lo);
    expect(waves(lo.fx)).toBe(0);
    const red = cena('high', true); red.state.phase = 'racing'; tick(red);
    expect(waves(red.fx)).toBe(0);
  });

  it('o engate do nitro acende um halo (um por engate)', () => {
    const s = cena('high'); s.state.phase = 'racing'; tick(s);
    const antes = waves(s.fx);
    s.car.nitroTicks = 150; tick(s);
    expect(waves(s.fx)).toBe(antes + 1);
    s.car.nitroTicks = 140; tick(s);
    expect(waves(s.fx)).toBe(antes + 1);
  });

  it('só os carros dos humanos ganham o halo do nitro, e só a batida perto de um viewport ganha POW (o anel e o quadrinho dos rivais longe não tomam a vaga dos que se veem)', () => {
    const s = cena('high'); s.state.phase = 'racing'; s.state.tick = 600; tick(s);
    const ia = s.state.cars.filter((c) => c.seat < 0);
    const humano = s.car;
    ia.forEach((c, i) => { c.z = (humano.z + 40_000 + i * 2000) % s.state.trackLength; }); // longe: 800 m+
    tick(s);
    const antes = waves(s.fx);
    ia[0].nitroTicks = 150; tick(s);
    expect(waves(s.fx)).toBe(antes); // nitro de rival: sem halo
    ia[0].speed = 5000; tick(s); ia[0].speed = 2000; ia[0].collisionCooldown = 20; tick(s);
    expect(pows(s.fx)).toBe(0); // batida longe: sem POW
    ia[1].z = (humano.z + 3000) % s.state.trackLength; tick(s); ia[1].speed = 5000; tick(s); ia[1].speed = 2000; ia[1].collisionCooldown = 20; tick(s);
    expect(pows(s.fx)).toBe(1); // batida a 60 m do jogador: POW
  });

  it('a batida acende um POW (mesmo num quadro de 3 ticks); reduzir efeitos não; o anel/POW passam de idade e somem', () => {
    const s = cena('high'); s.state.phase = 'racing'; s.state.tick = 600; tick(s); s.car.speed = 5000; tick(s);
    s.car.speed = 3000; s.car.collisionCooldown = 17; tick(s);
    expect(pows(s.fx)).toBe(1);
    // o carro anda 6 m nos próximos quadros e o quadrinho vai junto, 0,4 m à frente do centro dele
    const z0 = s.car.z;
    s.car.z = (z0 + 300) % s.state.trackLength; s.car.speed = 3000; tick(s);
    const pose = (s.fx as unknown as { pows: Pows }).pows;
    pose.pose(buildRoadFrame(s.frame.track, s.car.z, 30, 200), s.frame.track);
    const mm = new THREE.Matrix4(); pose.mesh.getMatrixAt(0, mm);
    expect(new THREE.Vector3().setFromMatrixPosition(mm).z).toBeCloseTo(-20 / 50, 2);
    for (let i = 0; i < 40; i++) tick(s);
    expect(pows(s.fx)).toBe(0);
    const r = cena('high', true); r.state.phase = 'racing'; tick(r); r.car.speed = 5000; tick(r); r.car.collisionCooldown = 20; r.car.speed = 3000; tick(r);
    expect(pows(r.fx)).toBe(0);
  });
});

void (null as unknown as RaceState);
