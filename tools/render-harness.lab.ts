// Laboratório GL do renderizador (onda L, L2): as funções que tests/gl-render.test.ts chama pelo Playwright, no Chromium com swiftshader.
// Nada aqui mede FPS (swiftshader não diz nada sobre GPU): só CONTAGENS (chamadas, triângulos, passes, pixels de alvo), a compilação dos
// programas de shader e o que o renderizador conta de si (composers criados, redimensionamentos, escala dinâmica, mapas de sombra).
import * as THREE from 'three';
import type { CameraMode } from '../src/render/camera-base';
import { CARS, createRace, getTrack, seatColor, stepRace, type AiBrain, type HumanEntry, type RaceState } from '../src/core';
import type { CarLook, Track } from '../src/core/types';
import { DEFAULT_SETTINGS, type Quality, type RenderFrame } from '../src/game/contracts';
import { paintsOfLooks, raceLooks } from '../src/game/paints';
import { loadCarAssets } from '../src/render/cars/assets';
import { createRenderer, type DebugInfo } from '../src/render/renderer';
import { GATE_SCENES, type GateSample } from '../src/bench/gate';
import { resetRenderPrefs, setRenderPrefs } from '../src/render/prefs';
import { ViewportPipeline } from '../src/render/postfx/pipeline';
import { planFor } from '../src/render/postfx/plan';
import { ROAD_HALF_WIDTH_M } from '../src/render/units';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;
const q = new URLSearchParams(location.search);
// Os carros de arte (src/assets/cars/*.glb) entram ANTES do renderizador, como no jogo (main.ts): o gate mede o que o jogador de fato desenha.
await loadCarAssets();
const renderer = createRenderer(canvas, hud);
renderer.setDynamicResolution(false); // o laboratório mede contagem: a escala só muda quando o teste a fixa
const gl = (renderer as unknown as { __gl: import('three').WebGLRenderer }).__gl;
const scene = (renderer as unknown as { __scene: import('three').Scene }).__scene;
const cams = (renderer as unknown as { __cams: import('three').PerspectiveCamera[] }).__cams;
const shaderErrors: string[] = [];
gl.debug.onShaderError = (ctx, program, vs, fs) => {
  shaderErrors.push(`${ctx.getShaderInfoLog(vs) ?? ''} | ${ctx.getShaderInfoLog(fs) ?? ''} | ${ctx.getProgramInfoLog(program) ?? ''}`.slice(0, 600));
};
renderer.resize(Number(q.get('w') ?? window.innerWidth), Number(q.get('h') ?? window.innerHeight), 1);

interface Setup { state: RaceState; track: Track; humans: HumanEntry[]; n: number }
let current: Setup | null = null;
let tick = 0;
/** A câmera de cada assento no quadro (nc/cameras); sem ela, o padrão do jogo (a Alta). */
let seatCameras: CameraMode[] | undefined;
/** A opção "Efeitos de cartum" no quadro (V8; o padrão do jogo é desligada). */
let cartoonFx = false;
/** A opção "Reduzir efeitos" no quadro (V10: a diferença entre o quadro com ela e sem ela é só dos efeitos). */
let reduceFx = false;

/** Monta uma corrida como o bench (src/bench/run.ts): humanos no piloto automático, `ticks` passos, a câmera de cada um. */
function setup(trackId: string, humansN: number, ticks: number, tod?: 'day' | 'dusk' | 'night', looks?: CarLook[], carIds?: string[]): void {
  const base = getTrack(trackId);
  const track = tod ? { ...base, def: { ...base.def, timeOfDay: tod } } : base;
  const humans: HumanEntry[] = Array.from({ length: humansN }, (_, i) => ({ seat: i, name: `P${i + 1}`, carId: CARS[i % 8].id, teamId: 0, color: seatColor(i), ...(looks?.[i] ? { look: looks[i] } : {}) }));
  // O visual (N3) fica com os humanos da sessão e vai ao renderizador em `looks`: a config da corrida não o carrega.
  const state = createRace({ trackId, laps: track.def.laps, humans: humans.map(({ look: _look, ...h }) => h), totalCars: 20, difficulty: 'profissional', manualGear: false,
    assists: { sharedNitro: true, tow: true, teamDraft: true, catchup: true }, seed: 42 }, track);
  for (const c of state.cars) if (c.seat >= 0) c.ai = { skill: 0.97, laneX: 0.2 * (c.seat - 1.5), laneUntil: 0, lookahead: 28, aggression: 0.6 } satisfies AiBrain;
  for (let i = 0; i < ticks; i++) stepRace(state, track, []);
  // Os carros pedidos entram DEPOIS dos 300 ticks: as posições são as da cena padrão e o que muda no quadro é só o carro (a medida do custo de um modelo).
  if (carIds) {
    for (const h of humans) if (carIds[h.seat]) h.carId = carIds[h.seat];
    for (const c of state.cars) if (c.seat >= 0 && carIds[c.seat]) c.carId = carIds[c.seat];
  }
  current = { state, track, humans, n: humansN };
  tick = 0;
}

function frameFor(quality: Quality): RenderFrame {
  if (!current) throw new Error('lab.setup primeiro');
  const { state, track, humans } = current;
  const looks = raceLooks(state.cars, humans);
  return {
    state, track,
    viewports: humans.map((h) => ({ seat: h.seat, carIndex: state.cars.findIndex((c) => c.seat === h.seat), color: h.color, name: h.name, messages: [], ...(seatCameras?.[h.seat] ? { camera: seatCameras[h.seat] } : {}) })),
    options: { quality, showMinimap: false, screenShake: DEFAULT_SETTINGS.screenShake, reduceEffects: reduceFx, palette: DEFAULT_SETTINGS.colorPalette, landmarkCaptions: false, cartoonEffects: cartoonFx },
    time: tick / 60, paused: false, coop: humans.length >= 2, showHud: false, paints: paintsOfLooks(state.cars, looks), looks,
  };
}

function render(quality: Quality, frames: number): DebugInfo[] {
  if (!current) throw new Error('lab.setup primeiro');
  const out: DebugInfo[] = [];
  for (let i = 0; i < frames; i++) {
    stepRace(current.state, current.track, []);
    tick++;
    renderer.render(frameFor(quality));
    out.push(renderer.debugInfo());
  }
  return out;
}

function idle(quality: Quality, frames: number): DebugInfo[] {
  if (!current) throw new Error('lab.setup primeiro');
  const out: DebugInfo[] = [];
  for (let i = 0; i < frames; i++) {
    // O mesmo caminho do jogo: antes do primeiro `render`, a qualidade vem do último; aqui a fixamos com um quadro de corrida só se faltar.
    if (renderer.debugInfo().quality !== quality) render(quality, 1);
    renderer.renderIdle(40 + i / 60, current.track);
    out.push(renderer.debugInfo());
  }
  return out;
}

export interface ProgramReport { total: number; bad: string[]; shaderErrors: string[] }

/** Todo programa vivo no `renderer.info`: o link tem de ter dado certo e os logs (programa e os dois shaders) estar VAZIOS. */
function programs(): ProgramReport {
  const ctx = gl.getContext();
  const bad: string[] = [];
  const list = gl.info.programs ?? [];
  for (const p of list) {
    const prog = (p as unknown as { program: WebGLProgram }).program;
    const vs = (p as unknown as { vertexShader: WebGLShader }).vertexShader;
    const fs = (p as unknown as { fragmentShader: WebGLShader }).fragmentShader;
    const name = (p as unknown as { name: string }).name;
    const log = `${ctx.getProgramInfoLog(prog) ?? ''}${ctx.getShaderInfoLog(vs) ?? ''}${ctx.getShaderInfoLog(fs) ?? ''}`.trim();
    if (!ctx.getProgramParameter(prog, ctx.LINK_STATUS)) bad.push(`${name}: link falhou: ${log.slice(0, 300)}`);
    else if (log) bad.push(`${name}: log não vazio: ${log.slice(0, 300)}`);
  }
  return { total: list.length, bad, shaderErrors: [...shaderErrors] };
}

const QUALITIES: Quality[] = ['low', 'medium', 'high', 'ultra'];

/**
 * A medição inteira do gate e da compilação, de uma vez (uma página, um aquecimento): para cada qualidade, as cenas do gate (4 quadros,
 * valem os 2 últimos), o fundo do menu, `renderer.compile` e o relatório dos programas.
 */
function collect(): { samples: GateSample[]; frames: Array<{ scene: string; quality: Quality; debug: DebugInfo[] }>; programs: Array<{ quality: Quality } & ProgramReport>; forced: Array<{ quality: Quality; debug: DebugInfo[]; off: DebugInfo[] }> } {
  const samples: GateSample[] = [];
  const frames: Array<{ scene: string; quality: Quality; debug: DebugInfo[] }> = [];
  const reports: Array<{ quality: Quality } & ProgramReport> = [];
  const forced: Array<{ quality: Quality; debug: DebugInfo[]; off: DebugInfo[] }> = [];
  for (const quality of QUALITIES) {
    for (const s of GATE_SCENES) {
      setup(s.track, s.humans, 300);
      const debug = render(quality, 4);
      frames.push({ scene: s.id, quality, debug });
      // Por viewport, o pior dos 2 últimos quadros (a sombra alterna: um quadro pode ter mais passes de mapa que o outro).
      const last = debug.slice(-2);
      const viewports = last[0].viewports.map((_, i) => {
        const vs = last.map((d) => d.viewports[i]);
        return {
          calls: Math.max(...vs.map((v) => v.calls)), triangles: Math.max(...vs.map((v) => v.triangles)),
          passes: Math.max(...vs.map((v) => v.passes)), postPx: Math.max(...vs.map((v) => v.postPx)),
          targetW: vs[0].targetW, targetH: vs[0].targetH, samples: vs[0].samples,
        };
      });
      samples.push({ scene: s.id, quality, viewports });
    }
    // Fundo dos menus e a compilação explícita (o que o jogo faz antes de largar, se um dia pré-aquecer).
    setup('copacabana', 1, 300);
    idle(quality, 2);
    gl.compile(scene, cams[0]);
    setup('sampa_noite', 1, 300);
    render(quality, 2);
    idle(quality, 1);
    // Os passes que só rodam em certas condições (o desfoque radial só acima de 85% da velocidade ou no nitro) também têm de compilar:
    // força a condição, 2 jogadores (com AO na Alta e no Ultra), e solta.
    setup('copacabana', 2, 300);
    renderer.pinRadialBlur(0);
    const off = render(quality, 2);
    renderer.pinRadialBlur(1);
    forced.push({ quality, debug: render(quality, 2), off });
    renderer.pinRadialBlur(null);
    reports.push({ quality, ...programs() });
  }
  return { samples, frames, programs: reports, forced };
}

/** A mancha de contato sob os carros (`Cars.blob`, cars.ts): a malha instanciada, translúcida, com textura, visível e com instâncias. */
function blob(): { found: boolean; count: number } {
  let count = 0; let found = false;
  scene.traverse((o) => {
    const m = o as import('three').InstancedMesh;
    const mat = m.material as import('three').MeshBasicMaterial | undefined;
    if (m.isInstancedMesh && mat && mat.isMeshBasicMaterial && mat.transparent && mat.map && !mat.depthWrite && m.visible) { found = true; count = Math.max(count, m.count); }
  });
  return { found, count };
}

/**
 * M5: a cena dos efeitos acesos (tests/efeitos-gl.test.ts). `ticks` = 207: a largada cai no quadro 3 (anel da largada); do quadro 4 em diante os dois humanos
 * derrapam com carga roxa, a velocidade máxima, o nitro engata (halo), a batida acontece no quadro 5 (POW, faíscas) e o impulso da derrapagem solta a rajada;
 * um carro rápido à frente do 1º humano acende o túnel do vácuo. `forced = false` é a mesma cena sem forçar nada (a base da comparação de chamadas).
 * Devolve o `renderer.info` do último quadro e as malhas `fx-*` que têm o que desenhar nele.
 */
function fxScene(quality: Quality, forced: boolean, cartoon = false): { debug: DebugInfo; meshes: Array<{ name: string; visible: boolean; drawn: number }> } {
  setup('copacabana', 2, 207);
  cartoonFx = cartoon; // V8: o POW e as estrelinhas só com a opção de cartum
  if (!current) throw new Error('lab.setup primeiro');
  const { state, track } = current;
  const humans = state.cars.filter((c) => c.seat >= 0);
  const lead = state.cars.find((c) => c.seat < 0);
  let debug = renderer.debugInfo();
  for (let i = 0; i < 16; i++) {
    stepRace(state, track, []);
    tick++;
    if (forced && i >= 3) {
      for (const c of humans) {
        c.speed = c.stats.topSpeed; c.driftDir = 1; c.driftTicks = 30; c.driftCharge = 160; c.nitroTicks = Math.max(c.nitroTicks, 100);
        if (i === 5) { c.collisionCooldown = 20; c.speed = c.stats.topSpeed * 0.5; }
        if (i === 6) c.driftBoostTicks = 88;
      }
      if (lead && humans[0]) { lead.z = (humans[0].z + 700) % track.length; lead.x = humans[0].x; lead.speed = lead.stats.topSpeed; }
    }
    renderer.render(frameFor(quality));
    debug = renderer.debugInfo();
  }
  cartoonFx = false;
  const meshes: Array<{ name: string; visible: boolean; drawn: number }> = [];
  scene.traverse((o) => {
    if (!o.name.startsWith('fx-') && o.name !== 'car-stars') return;
    const m = o as import('three').Mesh;
    const inst = o as import('three').InstancedMesh;
    meshes.push({ name: o.name, visible: o.visible, drawn: inst.isInstancedMesh ? inst.count : m.geometry.drawRange.count });
  });
  return { debug, meshes };
}

/**
 * A corrida que muda (M6, b): a mesma cena com o líder em cada fração da corrida de `fractions` (cada uma `repeat` quadros), sem mexer no que o quadro desenha: só o
 * `progress` do carro do jogador, que o renderizador lê para o período. Devolve, por quadro, o que o renderizador contou, os programas vivos e quantas vezes a paleta ao vivo
 * foi entregue (nunca por quadro), e o relatório de compilação no fim.
 */
function liveScene(quality: Quality, trackId: string, fractions: number[], repeat: number): {
  frames: Array<{ fraction: number; calls: number; triangles: number; programs: number; applied: number; names: string[] }>; report: ProgramReport;
} {
  setup(trackId, 1, 300);
  if (!current) throw new Error('lab.setup primeiro');
  const { state, track } = current;
  const me = state.cars.find((c) => c.seat >= 0);
  if (!me) throw new Error('sem humano');
  const frames: Array<{ fraction: number; calls: number; triangles: number; programs: number; applied: number; names: string[] }> = [];
  for (const fraction of fractions) {
    for (let k = 0; k < repeat; k++) {
      tick++;
      const f = frameFor(quality);
      me.progress = fraction * state.config.laps * track.length;
      renderer.render(f);
      const d = renderer.debugInfo();
      frames.push({ fraction, calls: d.viewports[0].calls, triangles: d.viewports[0].triangles, programs: (gl.info.programs ?? []).length, applied: renderer.liveApplied(), names: (gl.info.programs ?? []).map((p) => `${(p as unknown as { name: string }).name}|${(p as unknown as { cacheKey: string }).cacheKey}`) });
    }
  }
  return { frames, report: programs() };
}

// ───────────── Cor e brilho (docs/ondas/cor-brilho.md): medir a IMAGEM ─────────────
// A medida é feita no mesmo `evaluate` do desenho (o buffer da tela não sobrevive à composição do navegador): `shoot` desenha e lê os pixels.

/** Uma caixa (canto mínimo e máximo, m, no referencial do carro do viewport 0: −z à frente) ou um ponto (m) com meia largura em px. */
export type Probe = { box: [number, number, number, number, number, number] } | { point: [number, number, number]; r: number };
export interface ProbeStat { x0: number; y0: number; x1: number; y1: number; mean: number; white: number; rgb: [number, number, number] }

/**
 * Corrida parada no quadro: o mundo não anda (os carros ficam onde a corrida os deixou); `x` põe o jogador numa faixa, `parked` o para; `seg` o leva ao
 * início do segmento (o `seg=` do render-harness.html: a folha do GT e a galeria) e tira os outros da frente; `look` é o visual do jogador (N3).
 */
function freeze(trackId: string, ticks: number, opts: { x?: number; parked?: boolean; tod?: 'day' | 'dusk' | 'night'; seg?: number; look?: CarLook } = {}): void {
  setup(trackId, 1, ticks, opts.tod, opts.look ? [opts.look] : undefined);
  if (!current) throw new Error('lab.setup primeiro');
  const me = current.state.cars.find((c) => c.seat >= 0);
  if (!me) throw new Error('sem humano');
  if (opts.seg !== undefined) {
    const len = current.track.length;
    me.z = (opts.seg * 200) % len;
    for (const c of current.state.cars) if (c !== me) c.z = (me.z + len / 2 + c.id * 300) % len;
  }
  if (opts.x !== undefined) me.x = opts.x;
  me.steerPose = 0;
  if (opts.parked) { me.speed = 0; me.nitroTicks = 0; me.skidTicks = 0; me.driftTicks = 0; }
}

/** Faróis do jogador (os SpotLights da cena) acesos ou apagados pela COR: o renderizador mexe na visibilidade e na intensidade, nunca nela. */
function headlights(on: boolean): void {
  scene.traverse((o) => { const s = o as THREE.SpotLight; if (s.isSpotLight) s.color.set(on ? '#fff3d0' : '#000000'); });
}

/** Desenha `frames` quadros sem andar a corrida e mede as sondas na imagem final (sRGB 0..255; `mean` = luma 0..1; `white` = fração estourada). */
function shoot(quality: Quality, frames: number, probes: Probe[]): ProbeStat[] {
  if (!current) throw new Error('lab.setup primeiro');
  for (let i = 0; i < frames; i++) { tick++; renderer.render(frameFor(quality)); }
  const me = current.state.cars.find((c) => c.seat >= 0);
  const cx = (me?.x ?? 0) * ROAD_HALF_WIDTH_M;
  const ctx = gl.getContext();
  const W = ctx.drawingBufferWidth; const H = ctx.drawingBufferHeight;
  const buf = new Uint8Array(W * H * 4);
  ctx.readPixels(0, 0, W, H, ctx.RGBA, ctx.UNSIGNED_BYTE, buf);
  const cam = cams[0];
  cam.updateMatrixWorld();
  const toPx = (x: number, y: number, z: number): [number, number] => {
    const v = new THREE.Vector3(x, y, z).project(cam);
    return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H];
  };
  return probes.map((p) => {
    let x0: number; let y0: number; let x1: number; let y1: number;
    if ('box' in p) {
      const [ax, ay, az, bx, by, bz] = p.box;
      const pts = [[ax, ay, az], [bx, ay, az], [ax, by, az], [bx, by, az], [ax, ay, bz], [bx, ay, bz], [ax, by, bz], [bx, by, bz]].map(([x, y, z]) => toPx(x + cx, y, z));
      x0 = Math.min(...pts.map((q) => q[0])); x1 = Math.max(...pts.map((q) => q[0])); y0 = Math.min(...pts.map((q) => q[1])); y1 = Math.max(...pts.map((q) => q[1]));
    } else {
      const [px, py] = toPx(p.point[0] + cx, p.point[1], p.point[2]);
      x0 = px - p.r; x1 = px + p.r; y0 = py - p.r; y1 = py + p.r;
    }
    x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0)); x1 = Math.min(W - 1, Math.round(x1)); y1 = Math.min(H - 1, Math.round(y1));
    let n = 0; let sum = 0; let white = 0; const rgb = [0, 0, 0];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = ((H - 1 - y) * W + x) * 4; // readPixels vem de baixo para cima
      const r = buf[i]; const g = buf[i + 1]; const b = buf[i + 2];
      sum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; rgb[0] += r; rgb[1] += g; rgb[2] += b; n++;
      if (r > 235 && g > 235 && b > 225) white++;
    }
    const k = Math.max(1, n);
    return { x0, y0, x1, y1, mean: sum / k, white: white / k, rgb: [Math.round(rgb[0] / k), Math.round(rgb[1] / k), Math.round(rgb[2] / k)] };
  });
}

/** Medida de uma região da tela (fração 0..1 do quadro, y de cima para baixo): saturação HSV média, luma, contraste (p95 − p5 da luma), calor (R − B). */
export interface RegionStat { sat: number; luma: number; p5: number; p95: number; contrast: number; warm: number; dark: number; bright: number; /** V12: cor média da região (0..255) e croma HSV médio. */ rgb: [number, number, number]; chroma: number }
/**
 * V10 (HC2): desenha `frames` quadros sem andar a corrida e mede regiões FRACIONÁRIAS da imagem final (o quadro todo, o céu, a beira da pista...). Sem sonda em
 * metros: serve para a gradação (saturação e contraste por cena) e para contar pixels de efeito (`bright` = fração de pixels com luma > 0,85).
 */
function regions(quality: Quality, frames: number, boxes: Array<[number, number, number, number]>): RegionStat[] {
  if (!current) throw new Error('lab.setup primeiro');
  for (let i = 0; i < frames; i++) { tick++; renderer.render(frameFor(quality)); }
  const ctx = gl.getContext();
  const W = ctx.drawingBufferWidth; const H = ctx.drawingBufferHeight;
  const buf = new Uint8Array(W * H * 4);
  ctx.readPixels(0, 0, W, H, ctx.RGBA, ctx.UNSIGNED_BYTE, buf);
  return boxes.map(([fx0, fy0, fx1, fy1]) => {
    const x0 = Math.max(0, Math.floor(fx0 * W)); const x1 = Math.min(W, Math.ceil(fx1 * W));
    const y0 = Math.max(0, Math.floor(fy0 * H)); const y1 = Math.min(H, Math.ceil(fy1 * H));
    const hist = new Uint32Array(256);
    let n = 0; let sat = 0; let luma = 0; let warm = 0; let dark = 0; let bright = 0; let sr = 0; let sg = 0; let sb = 0; let chroma = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = ((H - 1 - y) * W + x) * 4;
      const r = buf[i]; const g = buf[i + 1]; const b = buf[i + 2];
      const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
      const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      sat += mx === 0 ? 0 : (mx - mn) / mx; luma += l; warm += (r - b) / 255; n++; sr += r; sg += g; sb += b; chroma += (mx - mn) / 255;
      hist[Math.round(l * 255)]++;
      if (l < 0.12) dark++;
      if (l > 0.85) bright++;
    }
    const k = Math.max(1, n);
    const pct = (q: number): number => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= q * k) return v / 255; } return 1; };
    const p5 = pct(0.05); const p95 = pct(0.95);
    return { sat: sat / k, luma: luma / k, p5, p95, contrast: p95 - p5, warm: warm / k, dark: dark / k, bright: bright / k, rgb: [sr / k, sg / k, sb / k], chroma: chroma / k };
  });
}

/** O jogador no quadro parado (V10): `speed` = fração da velocidade máxima, `nitro` liga o nitro, `skid` põe as rodas fora do asfalto (poeira). */
function drive(o: { speed?: number; nitro?: boolean; skid?: boolean }): void {
  if (!current) throw new Error('lab.setup primeiro');
  const me = current.state.cars.find((c) => c.seat >= 0);
  if (!me) throw new Error('sem humano');
  if (o.speed !== undefined) me.speed = me.stats.topSpeed * o.speed;
  me.nitroTicks = o.nitro ? 100 : 0;
  me.skidTicks = o.skid ? 6 : 0;
}

/** V13: com o relógio preso, `snapshot` e `diffFromSnapshot` desenham o MESMO instante (a única diferença entre as duas imagens é o que o teste mudou). */
let holdClock = false;
let snapBuf: Uint8Array | null = null;
function readBuf(): Uint8Array {
  const ctx = gl.getContext();
  const buf = new Uint8Array(ctx.drawingBufferWidth * ctx.drawingBufferHeight * 4);
  ctx.readPixels(0, 0, ctx.drawingBufferWidth, ctx.drawingBufferHeight, ctx.RGBA, ctx.UNSIGNED_BYTE, buf);
  return buf;
}
/** Desenha `frames` quadros e guarda a imagem (o "sem efeito" de uma comparação por pixel). */
function snapshot(quality: Quality, frames: number): void {
  for (let i = 0; i < frames; i++) { if (!holdClock) tick++; renderer.render(frameFor(quality)); }
  snapBuf = readBuf();
}
export interface DiffStat { changed: number; warm: number; bright: number; luma: number }
/**
 * Desenha `frames` quadros e compara com o `snapshot` nas regiões (frações da tela, y de cima para baixo): `changed` = fração de pixels que mudaram mais de `thr`/255,
 * `warm` = fração destes que é quente (R ≥ 1,3 G e R ≥ 1,6 B: fogo, poeira de terra), `bright` = fração destes com luma > 0,8, `luma` = a média do que mudou (0..1).
 */
function diffFromSnapshot(quality: Quality, frames: number, boxes: Array<[number, number, number, number]>, thr = 8): DiffStat[] {
  if (!snapBuf) throw new Error('lab.snapshot primeiro');
  for (let i = 0; i < frames; i++) { if (!holdClock) tick++; renderer.render(frameFor(quality)); }
  const now = readBuf(); const ctx = gl.getContext();
  const W = ctx.drawingBufferWidth; const H = ctx.drawingBufferHeight;
  return boxes.map(([fx0, fy0, fx1, fy1]) => {
    const x0 = Math.floor(fx0 * W); const x1 = Math.ceil(fx1 * W); const y0 = Math.floor(fy0 * H); const y1 = Math.ceil(fy1 * H);
    let n = 0; let ch = 0; let warm = 0; let bright = 0; let luma = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = ((H - 1 - y) * W + x) * 4; n++;
      const dr = now[i] - snapBuf![i]; const dg = now[i + 1] - snapBuf![i + 1]; const db = now[i + 2] - snapBuf![i + 2];
      if (Math.abs(dr) <= thr && Math.abs(dg) <= thr && Math.abs(db) <= thr) continue;
      ch++;
      const l = (0.2126 * now[i] + 0.7152 * now[i + 1] + 0.0722 * now[i + 2]) / 255; luma += l;
      if (now[i] >= 1.3 * now[i + 1] && now[i] >= 1.6 * now[i + 2]) warm++;
      if (l > 0.8) bright++;
    }
    return { changed: ch / Math.max(1, n), warm: warm / Math.max(1, ch), bright: bright / Math.max(1, ch), luma: luma / Math.max(1, ch) };
  });
}

/**
 * O teto do bloom, isolado: um quadrado de `px` px com emissão HDR `hdr` no centro de uma cena preta, pelo MESMO pipeline da Alta com o bloom
 * `bloom` (força, raio, limiar), e quanta luz vaza para FORA dele (soma da luma 0..1 dos pixels a 3 px da borda em diante).
 */
function bloomHalo(hdr: number, bloom: [number, number, number], px = 8): { halo: number; core: number } {
  const ctx = gl.getContext();
  const W = ctx.drawingBufferWidth; const H = ctx.drawingBufferHeight;
  const sc = new THREE.Scene();
  sc.background = new THREE.Color(0, 0, 0);
  const cam = new THREE.PerspectiveCamera(60, W / H, 0.1, 100);
  const d = (H / 2) / Math.tan((30 * Math.PI) / 180); // a 1 px por unidade no plano z = −d
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(px, px), new THREE.MeshBasicMaterial({ color: new THREE.Color(hdr, hdr, hdr), toneMapped: false }));
  quad.position.z = -d;
  cam.far = d * 2;
  cam.updateProjectionMatrix();
  sc.add(quad);
  const pipe = new ViewportPipeline(gl, sc, cam, planFor('high', 1), null, bloom);
  pipe.setSize(W, H);
  gl.setViewport(0, 0, W, H); gl.setScissor(0, 0, W, H);
  pipe.render({ camera: cam, scale: 1, radial: 0 }, false);
  const buf = new Uint8Array(W * H * 4);
  ctx.readPixels(0, 0, W, H, ctx.RGBA, ctx.UNSIGNED_BYTE, buf);
  pipe.dispose(); quad.geometry.dispose(); quad.material.dispose();
  let halo = 0; let core = 0;
  const inner = px / 2 + 3;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const l = (0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]) / 255;
    if (Math.max(Math.abs(x + 0.5 - W / 2), Math.abs(y + 0.5 - H / 2)) > inner) halo += l; else core += l;
  }
  return { halo, core };
}

/**
 * Chama do nitro isolada (cor-brilho): o nitro do carro do jogador ligado na corrida parada (a câmera abre o FOV no nitro: ele fica ligado nas duas imagens),
 * o desfoque radial preso em 0, os efeitos da M5 (faíscas do escape, halo) escondidos, e a malha da chama visível ou não (`material.visible`, que o `pose`
 * não mexe) — a diferença entre as duas imagens é só a chama.
 */
function nitro(flame: boolean): void {
  if (!current) throw new Error('lab.setup primeiro');
  const me = current.state.cars.find((c) => c.seat >= 0);
  if (!me) throw new Error('sem humano');
  me.nitroTicks = 100;
  renderer.pinRadialBlur(0);
  scene.traverse((o) => {
    if (o.name.startsWith('fx-') && o.parent) o.parent.visible = false;
    const m = o as THREE.InstancedMesh;
    if (m.isInstancedMesh && m.geometry.getAttribute('aFlame')) (m.material as THREE.Material).visible = flame;
  });
}

type Box = [number, number, number, number, number, number];
interface FlameStat { changed: number; whiteOfChanged: number; addRgb: [number, number, number]; addLuma: number; x0: number; y0: number; x1: number; y1: number }

/**
 * Desenha os dois quadros (sem e com nitro) e mede o que a chama acrescenta na caixa `box`: pixels que mudaram, os quase brancos, a cor média somada.
 * `mouth` (V8): a mesma medida numa segunda caixa — a boca do escape —, dos mesmos dois quadros.
 */
function flameDiff(quality: Quality, frames: number, box: Box, mouth?: Box): FlameStat & { mouth?: FlameStat } {
  const read = (): { buf: Uint8Array; W: number; H: number } => {
    const ctx = gl.getContext();
    const W = ctx.drawingBufferWidth; const H = ctx.drawingBufferHeight;
    const buf = new Uint8Array(W * H * 4);
    ctx.readPixels(0, 0, W, H, ctx.RGBA, ctx.UNSIGNED_BYTE, buf);
    return { buf, W, H };
  };
  // Os dois quadros no MESMO instante (o tremor da câmera no nitro, o da chama e as suavizações andam com o tempo): aquece sem a chama, lê, e desenha
  // de novo o mesmo `tick` com ela (passo de tempo 0) — a diferença é só a chama.
  nitro(false);
  for (let i = 0; i < frames; i++) { tick++; renderer.render(frameFor(quality)); }
  const off = read();
  nitro(true); renderer.render(frameFor(quality));
  const on = read();
  const { W, H } = on;
  const measure = (b: Box): FlameStat => {
    const [st] = shoot(quality, 0, [{ box: b }]); // só a caixa em px (sem desenhar de novo)
    let changed = 0; let white = 0; const add = [0, 0, 0]; let luma = 0; let n = 0;
    for (let y = st.y0; y <= st.y1; y++) for (let x = st.x0; x <= st.x1; x++) {
      const i = ((H - 1 - y) * W + x) * 4; n++;
      const d = [on.buf[i] - off.buf[i], on.buf[i + 1] - off.buf[i + 1], on.buf[i + 2] - off.buf[i + 2]];
      const dl = (0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]) / 255;
      if (dl > 0.04) {
        changed++; add[0] += d[0]; add[1] += d[1]; add[2] += d[2]; luma += dl;
        if (on.buf[i] > 235 && on.buf[i + 1] > 235 && on.buf[i + 2] > 225) white++;
      }
    }
    const k = Math.max(1, changed);
    return { changed: changed / Math.max(1, n), whiteOfChanged: white / k, addRgb: [add[0] / k, add[1] / k, add[2] / k], addLuma: luma / k, x0: st.x0, y0: st.y0, x1: st.x1, y1: st.y1 };
  };
  return { ...measure(box), ...(mouth ? { mouth: measure(mouth) } : {}) };
}

/** V13: onde vão os triângulos e as chamadas de um quadro, por viewport, por categoria e por passe (cena principal × mapa de sombra). */
export interface PerfilLinha { cat: string; main: number; shadow: number; mainCalls: number; shadowCalls: number; instances: number }
export interface PerfilViewport { total: number; calls: number; rows: PerfilLinha[]; other: number }
type Hooked = THREE.Object3D & { __perfilCat?: string; __perfilDone?: boolean };

/** A categoria de um objeto da cena (só para o perfil): o filho direto da cena a que ele pertence, e o nome do lote do cenário. */
function perfilCategories(): Map<THREE.Object3D, string> {
  const out = new Map<THREE.Object3D, string>();
  const groups = scene.children.filter((c) => c.type === 'Group');
  const nameOfTop = new Map<THREE.Object3D, string>();
  // A ordem de criação em renderer.ts: Sky (grupo), carros (grupo grande), terreno, estrada, cenário (name 'scenery'), efeitos (fx-*).
  for (const g of groups) {
    if (g.name === 'scenery') nameOfTop.set(g, 'cenário');
    else if (g.children.some((c) => c.name.startsWith('fx-'))) nameOfTop.set(g, 'efeitos');
    else if (g.children.length > 40) nameOfTop.set(g, 'carros');
  }
  const rest = groups.filter((g) => !nameOfTop.has(g));
  // sobram: céu (4 filhos, o primeiro grupo), terreno (9), estrada (6)
  for (const g of rest) nameOfTop.set(g, g === groups[0] ? 'céu' : g.children.length >= 9 ? 'terreno' : 'pista');
  scene.traverse((o) => {
    let top: THREE.Object3D = o;
    while (top.parent && top.parent !== scene) top = top.parent;
    const base = nameOfTop.get(top) ?? 'outros';
    const idx = top.children.indexOf(o.parent === top ? o : o);
    if (base === 'cenário') out.set(o, `cenário:${o.name.replace('scenery:', '')}`);
    else if (base === 'carros') {
      const m = o as THREE.InstancedMesh;
      const tri = m.geometry ? (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 : 0;
      const i = top.children.indexOf(o);
      out.set(o, `carros:#${i} ${m.isInstancedMesh ? `${Math.round(tri)} △/inst` : 'outros'}`);
    } else if (base === 'terreno' || base === 'pista' || base === 'céu') out.set(o, `${base}#${top.children.indexOf(o) >= 0 ? top.children.indexOf(o) : idx}${o.name ? ':' + o.name : ''}`);
    else out.set(o, `${base}${o.name ? ':' + o.name : ''}`);
  });
  return out;
}

/**
 * V13: renderiza `frames` quadros e devolve, por viewport do último, os triângulos e as chamadas por categoria, separando a cena principal do mapa de sombra
 * (ganchos onBefore/AfterRender e onBefore/AfterShadow de cada objeto: a diferença do `renderer.info`). `other` = o que sobra (pós-processamento, quadros cheios).
 */
function perfil(quality: Quality, frames: number): PerfilViewport[] {
  if (!current) throw new Error('lab.setup primeiro');
  render(quality, 2); // cria o que nasce tarde (lotes de carro, anéis)
  const cats = perfilCategories();
  const acc = new Map<string, PerfilLinha>();
  let vp = 0;
  const rows: Array<Map<string, PerfilLinha>> = [new Map(), new Map(), new Map(), new Map()];
  let t0 = 0; let c0 = 0;
  const row = (o: Hooked): PerfilLinha => {
    const k = cats.get(o) ?? 'outros';
    let r = rows[vp].get(k);
    if (!r) { r = { cat: k, main: 0, shadow: 0, mainCalls: 0, shadowCalls: 0, instances: 0 }; rows[vp].set(k, r); }
    return r;
  };
  const hooks: Array<() => void> = [];
  // O viewport vem da câmera da chamada `render(scene, camera)` (o mapa de sombra desenha dentro dela, com outra câmera nos ganchos).
  const origRender = gl.render.bind(gl);
  gl.render = ((sc: THREE.Object3D, cam: THREE.Camera) => { if (sc === scene) { const i = cams.indexOf(cam as THREE.PerspectiveCamera); if (i >= 0) vp = i; } return origRender(sc, cam); }) as typeof gl.render;
  hooks.push(() => { gl.render = origRender as typeof gl.render; });
  scene.traverse((o) => {
    const h = o as Hooked;
    const any = o as unknown as { isMesh?: boolean; isPoints?: boolean; isLine?: boolean; isSprite?: boolean };
    if (!(any.isMesh || any.isPoints || any.isLine || any.isSprite)) return;
    const oBR = o.onBeforeRender; const oAR = o.onAfterRender; const oBS = o.onBeforeShadow; const oAS = o.onAfterShadow;
    o.onBeforeRender = function (this: THREE.Object3D, ...a: Parameters<typeof oBR>) { t0 = gl.info.render.triangles; c0 = gl.info.render.calls; oBR.apply(this, a); };
    o.onAfterRender = function (this: THREE.Object3D, ...a: Parameters<typeof oAR>) {
      oAR.apply(this, a); const r = row(h); r.main += gl.info.render.triangles - t0; r.mainCalls += gl.info.render.calls - c0;
      const ic = o as THREE.InstancedMesh; r.instances = Math.max(r.instances, ic.isInstancedMesh ? ic.count : 0);
    };
    o.onBeforeShadow = function (this: THREE.Object3D, ...a: Parameters<typeof oBS>) { t0 = gl.info.render.triangles; c0 = gl.info.render.calls; oBS.apply(this, a); };
    o.onAfterShadow = function (this: THREE.Object3D, ...a: Parameters<typeof oAS>) { oAS.apply(this, a); const r = row(h); r.shadow += gl.info.render.triangles - t0; r.shadowCalls += gl.info.render.calls - c0; };
    hooks.push(() => { o.onBeforeRender = oBR; o.onAfterRender = oAR; o.onBeforeShadow = oBS; o.onAfterShadow = oAS; });
  });
  void acc;
  try {
    // o último quadro vale (a sombra alterna com 3 e 4 jogadores: dois quadros, o pior de cada viewport)
    const per: Array<Array<Map<string, PerfilLinha>>> = [];
    const dbg: DebugInfo[] = [];
    for (let f = 0; f < frames; f++) {
      for (const m of rows) m.clear();
      dbg.push(render(quality, 1)[0]);
      per.push(rows.map((m) => new Map([...m].map(([k, v]) => [k, { ...v }]))));
    }
    const d = dbg[dbg.length - 1];
    return d.viewports.map((v, i) => {
      // o quadro com mais triângulos neste viewport (o pior dos `frames`)
      let best = 0;
      dbg.forEach((x, j) => { if (x.viewports[i].triangles > dbg[best].viewports[i].triangles) best = j; });
      const list = [...per[best][i].values()];
      const attributed = list.reduce((s, r) => s + r.main + r.shadow, 0);
      return { total: dbg[best].viewports[i].triangles, calls: dbg[best].viewports[i].calls, rows: list.sort((a, b) => b.main + b.shadow - a.main - a.shadow), other: dbg[best].viewports[i].triangles - attributed };
    });
  } finally { for (const h of hooks) h(); }
}

const lab = {
  hold: (on: boolean): void => { holdClock = on; },
  freeze, headlights, shoot, regions, drive, snapshot, diffFromSnapshot, bloomHalo, nitro, flameDiff,
  /** "Reduzir efeitos" e "Efeitos de cartum" nos quadros seguintes (V10). */
  setReduce: (on: boolean): void => { reduceFx = on; },
  setCartoon: (on: boolean): void => { cartoonFx = on; },
  /** Esconde (ou mostra) a malha de efeito `name` (`fx-streaks`, `fx-dust`...) só pelo material: `Effects` mexe na `visible` da malha a cada quadro. */
  hideFx: (name: string, hide: boolean): void => {
    scene.traverse((o) => { const m = o as THREE.Mesh; if (o.name === name && m.material) (m.material as THREE.Material).visible = !hide; });
  },
  /** As preferências visuais que o renderizador lê fora da corrida (render/prefs.ts); nulo as devolve ao começo. */
  prefs: (p: { quality: Quality; reduceEffects: boolean; lockFps30?: boolean } | null) => { if (p) setRenderPrefs(p); else resetRenderPrefs(); },
  cameras: (list: CameraMode[] | null) => { seatCameras = list ?? undefined; },
  renderer, setup, render, idle, programs, collect, perfil, blob, fxScene, liveScene,
  /** A cena (para um teste ligar e desligar uma luz, ou o reflexo do céu, e isolar a causa de um brilho). */
  scene,
  resize: (w: number, h: number, dpr: number) => renderer.resize(w, h, dpr),
  info: () => renderer.debugInfo(),
  dynamic: (on: boolean, pin: number | null) => { renderer.setDynamicResolution(on); renderer.pinDynamicScale(pin); },
};
declare global { interface Window { lab: typeof lab; labReady: boolean } }
window.lab = lab;
window.labReady = true;
