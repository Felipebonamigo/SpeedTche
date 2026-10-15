// V8 (docs/ondas/V8-efeitos.md): os efeitos de cartum × a diretriz "um pouco mais realista que o Horizon Chase Turbo". Puro/Node.
//   - a batida, no padrão, não acende o "POW!" nem as estrelinhas (só com a opção "Efeitos de cartum") e solta as faíscas no ponto de contato;
//   - a opção `cartoonEffects` no settings: aditiva, falsa por padrão, o save de antes abre igual;
//   - o anel do engate do nitro: fino, transparente (sem bloom) e rápido;
//   - as linhas de velocidade: só acima de 90%, finas e sutis, sem brilhar no entardecer;
//   - a boca do escape: metal aquecido, não o disco azul-branco (que de dia lê cinza).
// As faíscas, lascas e o flash em si: tests/fx-impacto.test.ts. A reação do carro (rodopio, squash): tests/car-movimento.test.ts.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAR_LENGTH } from '../src/core/constants';
import { createRace } from '../src/core/sim/race';
import { getTrack } from '../src/core/track';
import type { RaceState } from '../src/core/types';
import { DEFAULT_SETTINGS, type RenderFrame } from '../src/game/contracts';
import { sanitizeSettings } from '../src/game/settings';
import { Cars } from '../src/render/cars';
import * as F from '../src/render/cars/flame';
import { Effects } from '../src/render/effects';
import { lineCount, speedLine, speedLineStrength, type LineSpec } from '../src/render/fx/lines';
import type { Pows } from '../src/render/fx/pow';
import { SHOCK_SPECS, Shockwaves } from '../src/render/fx/shockwave';
import { palette, type Palette } from '../src/render/palette';
import { buildRoadFrame } from '../src/render/roadframe';
import { fakeCanvasDocument } from './canvas-fake';
import { human, quickRace, syntheticTrack } from './helpers';

type Opts = RenderFrame['options'] & { cartoonEffects?: boolean };

// ───────────────────────────── a batida ─────────────────────────────

describe('a batida: realista por padrão, o cartum é opção', () => {
  /** O jogador bate na traseira de um rival logo à frente (os dois com a batida registrada no mesmo tick, como em `rearContact`). */
  function batida(cartoon?: boolean) {
    const t = getTrack('copacabana');
    const { state } = quickRace({ humans: [human(0)], totalCars: 4, track: t });
    state.phase = 'racing'; state.tick = 600;
    const me = state.cars.find((c) => c.seat === 0)!;
    const ia = state.cars.filter((c) => c !== me);
    ia.forEach((c, i) => { c.z = (me.z + t.length / 2 + i * 5000) % t.length; });
    const alvo = ia[0];
    alvo.z = (me.z + CAR_LENGTH) % t.length; alvo.x = me.x;
    const options: Opts = { quality: 'high', showMinimap: false, screenShake: true, reduceEffects: false, palette: 'default', ...(cartoon === undefined ? {} : { cartoonEffects: cartoon }) };
    const frame = { state, track: t, time: 5, paused: false, coop: false, showHud: false,
      viewports: [{ seat: 0, carIndex: state.cars.indexOf(me), color: '#fff', name: 'P1', messages: [] }], options } as unknown as RenderFrame;
    const fx = new Effects();
    me.speed = 5000; alvo.speed = 3000; fx.update(frame);
    frame.time += 1 / 60; fx.update(frame);
    // a batida: quem vinha atrás cai para perto da velocidade do outro; os dois ganham o cooldown no mesmo tick
    me.speed = 400; alvo.speed = 420; me.collisionCooldown = 20; alvo.collisionCooldown = 20;
    frame.time += 1 / 60; fx.update(frame);
    return { fx, me, alvo, track: t, state, frame };
  }
  const pows = (fx: Effects) => (fx as unknown as { pows: Pows }).pows.alive();
  interface Pool { z: Float32Array; x: Float32Array; life: Float32Array; width: Float32Array }
  const sparks = (fx: Effects) => (fx as unknown as { sparks: Pool }).sparks;

  it('no padrão a batida não acende o POW; com "Efeitos de cartum", acende', () => {
    expect(pows(batida().fx), 'padrão (opção ausente)').toBe(0);
    expect(pows(batida(false).fx), 'opção desligada').toBe(0);
    expect(pows(batida(true).fx), 'opção ligada').toBeGreaterThan(0);
  });

  it('as faíscas saem do ponto de contato (entre os dois carros), uma rajada só para os dois; e as lascas entram no pool de bolhas', () => {
    const { fx, me, track } = batida();
    const p = sparks(fx);
    const meio = (me.z + CAR_LENGTH / 2) % track.length;
    let vivas = 0; let longe = 0;
    for (let i = 0; i < p.life.length; i++) {
      if (p.life[i] <= 0) continue;
      vivas++;
      let d = p.z[i] - meio; if (d > track.length / 2) d -= track.length; if (d < -track.length / 2) d += track.length;
      if (Math.abs(d) > 40 || Math.abs(p.x[i] - me.x) * 7 > 0.6) longe++; // 0,8 m ao longo (um quadro andado incluso), 0,6 m ao lado
    }
    expect(vivas).toBeGreaterThanOrEqual(16);
    expect(longe, `${longe} de ${vivas} faíscas longe do contato`).toBe(0);
    expect(vivas, 'uma rajada (não uma por carro)').toBeLessThanOrEqual(40);
    expect(fx.counts().puffs, 'lascas').toBeGreaterThanOrEqual(3);
  });

  it('o tranco da câmera (o tremor da batida que já existia) é curto: em 0,3 s cai abaixo de 15% do pico', () => {
    const { fx, frame } = batida();
    const amp = (fx as unknown as { shakeAmp: Float32Array }).shakeAmp;
    const pico = amp[0];
    expect(pico, 'a batida dá o tranco').toBeGreaterThan(0.5);
    for (let i = 0; i < 18; i++) { frame.time += 1 / 60; fx.update(frame); } // 0,3 s sem batida nova: só o decaimento
    expect(amp[0] / pico).toBeLessThanOrEqual(0.15);
  });

  function estrelas(cartoon?: boolean): number {
    const restore = fakeCanvasDocument();
    const track = getTrack('copacabana');
    const state: RaceState = createRace({
      trackId: 'copacabana', laps: 2, humans: [{ seat: 0, name: 'P1', carId: 'falcao', teamId: 0, color: '#fff' }], totalCars: 4, difficulty: 'profissional',
      manualGear: false, assists: { sharedNitro: false, tow: false, teamDraft: false, catchup: false }, seed: 42,
    }, track);
    const own = state.cars.findIndex((c) => c.seat === 0);
    state.cars.forEach((c, i) => { if (i !== own) c.z = state.cars[own].z - 100_000; });
    const cars = new Cars(new THREE.Scene());
    restore();
    const options: Opts = { quality: 'high', showMinimap: false, screenShake: false, reduceEffects: false, palette: 'default', ...(cartoon === undefined ? {} : { cartoonEffects: cartoon }) };
    const frame: RenderFrame = { state, track, viewports: [], time: 0, paused: true, coop: false, showHud: false, options };
    const rf = buildRoadFrame(track, state.cars[own].z, 8, 60);
    const draw = (time: number) => { frame.time = time; cars.update(frame); cars.pose(rf, state, track, own, [], time); };
    state.cars[own].speed = 4000;
    draw(0); draw(0.016);
    state.cars[own].collisionCooldown = 20; state.cars[own].speed = 2000;
    draw(0.032); draw(0.3);
    const n = (cars as unknown as { stars: THREE.InstancedMesh }).stars.count;
    cars.dispose();
    return n;
  }

  it('no padrão a batida não acende as estrelinhas; com "Efeitos de cartum", as três', { timeout: 120_000 }, () => {
    expect(estrelas(), 'padrão').toBe(0);
    expect(estrelas(true), 'opção ligada').toBe(3);
  });
});

// ───────────────────────────── a opção ─────────────────────────────

describe('a opção "Efeitos de cartum" no settings', () => {
  const cartoon = (s: unknown) => (s as { cartoonEffects?: unknown }).cartoonEffects;

  it('desligada por padrão; o save de antes da opção (fixture literal, sem o campo) abre igual e com ela desligada', () => {
    expect(cartoon(DEFAULT_SETTINGS)).toBe(false);
    const antigo = '{"language":"en","quality":"medium","reduceEffects":true,"screenShake":false,"seatCameras":["hood","high","high","high"],"lockFps30":true}';
    const s = sanitizeSettings(JSON.parse(antigo));
    expect(cartoon(s)).toBe(false);
    expect(s.language).toBe('en'); expect(s.quality).toBe('medium'); expect(s.reduceEffects).toBe(true); expect(s.screenShake).toBe(false);
    expect(s.seatCameras).toEqual(['hood', 'high', 'high', 'high']); expect(s.lockFps30).toBe(true);
  });

  it('ligada fica ligada (ida e volta pelo JSON); lixo vira desligada', () => {
    const s = sanitizeSettings(JSON.parse(JSON.stringify(sanitizeSettings({ cartoonEffects: true }))));
    expect(cartoon(s)).toBe(true);
    for (const lixo of ['sim', 1, null, {}]) expect(cartoon(sanitizeSettings({ cartoonEffects: lixo }))).toBe(false);
  });
});

// ───────────────────────────── o anel do nitro ─────────────────────────────

describe('o anel do engate do nitro: fino, transparente e rápido', () => {
  const track = syntheticTrack([{ op: 'straight', length: 1200 }]);
  const rf = buildRoadFrame(track, 3000, 30, 200);
  /** A malha que desenhou o único anel aceso (a do halo, se existir uma própria), e a faixa do anel (1 − raio interno ÷ externo). */
  function aceso(kind: 'halo' | 'ground') {
    const w = new Shockwaves();
    w.spawn(kind, 3000, 0, 0.5);
    w.step(0.005); w.pose(rf, track);
    const all = [w.mesh, (w as unknown as { haloMesh?: THREE.InstancedMesh }).haloMesh].filter((m): m is THREE.InstancedMesh => !!m && m.count > 0);
    expect(all, 'uma malha acesa').toHaveLength(1);
    const m = all[0];
    const pos = m.geometry.getAttribute('position');
    let min = Infinity; let max = 0;
    for (let i = 0; i < pos.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); min = Math.min(min, r); max = Math.max(max, r); }
    const c = new THREE.Color(); m.getColorAt(0, c);
    return { band: 1 - min / max, peak: Math.max(c.r, c.g, c.b) };
  }

  it('o halo do nitro: faixa ≤ 6% do raio (≤ 0,2 m no raio final), brilho ≤ 0,45 (abaixo do limiar do bloom, sem HDR) e vida ≤ 0,25 s', () => {
    const h = aceso('halo');
    expect(h.band, 'faixa ÷ raio').toBeLessThanOrEqual(0.06);
    expect(h.band * SHOCK_SPECS.halo.r1, 'faixa no raio final (m)').toBeLessThanOrEqual(0.2);
    expect(h.peak, 'brilho no 1º quadro').toBeLessThanOrEqual(0.45);
    expect(h.peak, 'mas aparece').toBeGreaterThan(0.05);
    expect(SHOCK_SPECS.halo.life).toBeLessThanOrEqual(0.25);
    expect(SHOCK_SPECS.halo.r1).toBeLessThanOrEqual(3.5);
  });

  it('o anel da largada continua o mesmo (trava: não é deste pedido)', () => {
    const g = aceso('ground');
    expect(g.band).toBeCloseTo(0.22, 6);
    expect(SHOCK_SPECS.ground).toEqual({ life: 0.5, r0: 0.6, r1: 7 });
  });
});

// ───────────────────────────── as linhas de velocidade ─────────────────────────────

describe('linhas de velocidade: finas, sutis, só acima de 90% (e no nitro)', () => {
  it('nada a 89% da máxima; acesas a 95%; o nitro ainda as acende devagar', () => {
    expect(speedLineStrength(0.89, false)).toBe(0);
    expect(speedLineStrength(0.95, false)).toBeGreaterThan(0);
    expect(speedLineStrength(0.5, true)).toBeGreaterThan(0);
  });

  it('finas: de 3 a 7 cm de largura (eram 9 a 20 cm)', () => {
    const n = 40;
    for (let k = 0; k < n; k++) {
      const s: LineSpec = { dz: 0, tail: 0, lat: 0, h: 0, width: 0, r: 0, g: 0, b: 0, a: 0 };
      expect(speedLine(k, n, 123.4, 110, 1, s)).toBe(true);
      expect(s.width, `linha ${k}`).toBeGreaterThanOrEqual(0.03); expect(s.width, `linha ${k}`).toBeLessThanOrEqual(0.07);
    }
  });

  /** O maior brilho aditivo de uma linha acesa (cor × alfa × ganho do período) com o carro na máxima, sem nitro e sem ninguém à frente. */
  function pico(p: Palette): number {
    const t = getTrack('copacabana');
    const { state } = quickRace({ humans: [human(0)], totalCars: 4, track: t });
    state.phase = 'racing'; state.tick = 900;
    const me = state.cars.find((c) => c.seat === 0)!;
    for (const c of state.cars) if (c !== me) c.z = (me.z + t.length / 2) % t.length;
    const frame = { state, track: t, time: 5, paused: false, coop: false, showHud: false,
      viewports: [{ seat: 0, carIndex: state.cars.indexOf(me), color: '#fff', name: 'P1', messages: [] }],
      options: { quality: 'high', showMinimap: false, screenShake: false, reduceEffects: false, palette: 'default' } } as unknown as RenderFrame;
    const fx = new Effects(); fx.setPalette(p);
    for (let i = 0; i < 120; i++) {
      me.speed = me.stats.topSpeed; me.z = (me.z + me.speed / 60) % t.length; me.progress += me.speed / 60;
      frame.time += 1 / 60; fx.update(frame); fx.pose(buildRoadFrame(t, me.z, 30, 200), t, 600, 0);
    }
    const col = (fx.streaks as unknown as { color: THREE.BufferAttribute }).color;
    expect(fx.streaks.count, 'há linhas acesas').toBeGreaterThan(5);
    let peak = 0;
    for (let k = 0; k < fx.streaks.count; k++) peak = Math.max(peak, Math.max(col.getX(k * 4), col.getY(k * 4), col.getZ(k * 4)) * col.getW(k * 4));
    return peak;
  }

  it('sutis de dia (pico ≤ 0,35) e sem brilhar no entardecer (pico ≤ 0,12 e ≤ 40% do dia; o limiar do bloom do entardecer é o mais baixo)', { timeout: 120_000 }, () => {
    const dia = pico(palette('tropical', 'day'));
    const tarde = pico(palette('tropical', 'dusk'));
    expect(dia, 'dia').toBeLessThanOrEqual(0.35);
    expect(tarde, 'entardecer').toBeLessThanOrEqual(0.12);
    expect(tarde / dia, 'entardecer ÷ dia').toBeLessThanOrEqual(0.4);
  });

  it('o número de linhas acesas segue o teto do degrau (nada mudou nisso)', () => {
    expect(lineCount(36, 1)).toBe(36);
  });
});

// ───────────────────────────── a boca do escape ─────────────────────────────

describe('a boca do escape: metal aquecido, não disco azul-branco', () => {
  it('a cor da boca é laranja escuro (R ≥ 2,5 G, G ≥ 1,5 B, R entre 0,35 e 0,75) e o núcleo do fragmento a usa no lugar do azul-branco', () => {
    const mouth = (F as unknown as { FLAME_MOUTH?: readonly [number, number, number] }).FLAME_MOUTH;
    expect(mouth, 'FLAME_MOUTH').toBeDefined();
    const [r, g, b] = mouth ?? [0, 0, 0];
    expect(r).toBeGreaterThanOrEqual(0.35); expect(r).toBeLessThanOrEqual(0.75);
    expect(r).toBeGreaterThanOrEqual(2.5 * g); expect(g).toBeGreaterThanOrEqual(1.5 * b);
    expect(F.FLAME_FRAG).toContain(`vec3(${r}, ${g}, ${b})`);
    expect(F.FLAME_FRAG, 'o azul-branco da boca').not.toContain('vec3(0.75, 0.87, 1.0)');
  });
});
