// Laboratório GL do renderizador (onda L, L2): as funções que tests/gl-render.test.ts chama pelo Playwright, no Chromium com swiftshader.
// Nada aqui mede FPS (swiftshader não diz nada sobre GPU): só CONTAGENS (chamadas, triângulos, passes, pixels de alvo), a compilação dos
// programas de shader e o que o renderizador conta de si (composers criados, redimensionamentos, escala dinâmica, mapas de sombra).
import type { CameraMode } from '../src/render/camera-base';
import { CARS, createRace, getTrack, seatColor, stepRace, type AiBrain, type HumanEntry, type RaceState } from '../src/core';
import type { CarLook, Track } from '../src/core/types';
import { DEFAULT_SETTINGS, type Quality, type RenderFrame } from '../src/game/contracts';
import { paintsOfLooks, raceLooks } from '../src/game/paints';
import { createRenderer, type DebugInfo } from '../src/render/renderer';
import { GATE_SCENES, type GateSample } from '../src/bench/gate';
import { resetRenderPrefs, setRenderPrefs } from '../src/render/prefs';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;
const q = new URLSearchParams(location.search);
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

/** Monta uma corrida como o bench (src/bench/run.ts): humanos no piloto automático, `ticks` passos, a câmera de cada um. */
function setup(trackId: string, humansN: number, ticks: number, tod?: 'day' | 'dusk' | 'night', looks?: CarLook[]): void {
  const base = getTrack(trackId);
  const track = tod ? { ...base, def: { ...base.def, timeOfDay: tod } } : base;
  const humans: HumanEntry[] = Array.from({ length: humansN }, (_, i) => ({ seat: i, name: `P${i + 1}`, carId: CARS[i % 8].id, teamId: 0, color: seatColor(i), ...(looks?.[i] ? { look: looks[i] } : {}) }));
  // O visual (N3) fica com os humanos da sessão e vai ao renderizador em `looks`: a config da corrida não o carrega.
  const state = createRace({ trackId, laps: track.def.laps, humans: humans.map(({ look: _look, ...h }) => h), totalCars: 20, difficulty: 'profissional', manualGear: false,
    assists: { sharedNitro: true, tow: true, teamDraft: true, catchup: true }, seed: 42 }, track);
  for (const c of state.cars) if (c.seat >= 0) c.ai = { skill: 0.97, laneX: 0.2 * (c.seat - 1.5), laneUntil: 0, lookahead: 28, aggression: 0.6 } satisfies AiBrain;
  for (let i = 0; i < ticks; i++) stepRace(state, track, []);
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
    options: { quality, showMinimap: false, screenShake: DEFAULT_SETTINGS.screenShake, reduceEffects: false, palette: DEFAULT_SETTINGS.colorPalette, landmarkCaptions: false },
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
function fxScene(quality: Quality, forced: boolean): { debug: DebugInfo; meshes: Array<{ name: string; visible: boolean; drawn: number }> } {
  setup('copacabana', 2, 207);
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
  const meshes: Array<{ name: string; visible: boolean; drawn: number }> = [];
  scene.traverse((o) => {
    if (!o.name.startsWith('fx-')) return;
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

const lab = {
  /** As preferências visuais que o renderizador lê fora da corrida (render/prefs.ts); nulo as devolve ao começo. */
  prefs: (p: { quality: Quality; reduceEffects: boolean; lockFps30?: boolean } | null) => { if (p) setRenderPrefs(p); else resetRenderPrefs(); },
  cameras: (list: CameraMode[] | null) => { seatCameras = list ?? undefined; },
  renderer, setup, render, idle, programs, collect, blob, fxScene, liveScene,
  resize: (w: number, h: number, dpr: number) => renderer.resize(w, h, dpr),
  info: () => renderer.debugInfo(),
  dynamic: (on: boolean, pin: number | null) => { renderer.setDynamicResolution(on); renderer.pinDynamicScale(pin); },
};
declare global { interface Window { lab: typeof lab; labReady: boolean } }
window.lab = lab;
window.labReady = true;
