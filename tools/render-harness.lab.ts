// Laboratório GL do renderizador (onda L, L2): as funções que tests/gl-render.test.ts chama pelo Playwright, no Chromium com swiftshader.
// Nada aqui mede FPS (swiftshader não diz nada sobre GPU): só CONTAGENS (chamadas, triângulos, passes, pixels de alvo), a compilação dos
// programas de shader e o que o renderizador conta de si (composers criados, redimensionamentos, escala dinâmica, mapas de sombra).
import { CARS, createRace, getTrack, seatColor, stepRace, type AiBrain, type HumanEntry, type RaceState } from '../src/core';
import type { Track } from '../src/core/types';
import { DEFAULT_SETTINGS, type Quality, type RenderFrame } from '../src/game/contracts';
import { racePaints } from '../src/game/paints';
import { createRenderer, type DebugInfo } from '../src/render/renderer';
import { GATE_SCENES, type GateSample } from '../src/bench/gate';

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

/** Monta uma corrida como o bench (src/bench/run.ts): humanos no piloto automático, `ticks` passos, a câmera de cada um. */
function setup(trackId: string, humansN: number, ticks: number, tod?: 'day' | 'dusk' | 'night'): void {
  const base = getTrack(trackId);
  const track = tod ? { ...base, def: { ...base.def, timeOfDay: tod } } : base;
  const humans: HumanEntry[] = Array.from({ length: humansN }, (_, i) => ({ seat: i, name: `P${i + 1}`, carId: CARS[i % 8].id, teamId: 0, color: seatColor(i) }));
  const state = createRace({ trackId, laps: track.def.laps, humans, totalCars: 20, difficulty: 'profissional', manualGear: false,
    assists: { sharedNitro: true, tow: true, teamDraft: true, catchup: true }, seed: 42 }, track);
  for (const c of state.cars) if (c.seat >= 0) c.ai = { skill: 0.97, laneX: 0.2 * (c.seat - 1.5), laneUntil: 0, lookahead: 28, aggression: 0.6 } satisfies AiBrain;
  for (let i = 0; i < ticks; i++) stepRace(state, track, []);
  current = { state, track, humans, n: humansN };
  tick = 0;
}

function frameFor(quality: Quality): RenderFrame {
  if (!current) throw new Error('lab.setup primeiro');
  const { state, track, humans } = current;
  return {
    state, track,
    viewports: humans.map((h) => ({ seat: h.seat, carIndex: state.cars.findIndex((c) => c.seat === h.seat), color: h.color, name: h.name, messages: [] })),
    options: { quality, showMinimap: false, screenShake: DEFAULT_SETTINGS.screenShake, reduceEffects: false, palette: DEFAULT_SETTINGS.colorPalette, landmarkCaptions: false },
    time: tick / 60, paused: false, coop: humans.length >= 2, showHud: false, paints: racePaints(state.cars, humans),
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

const lab = {
  renderer, setup, render, idle, programs, collect, blob,
  resize: (w: number, h: number, dpr: number) => renderer.resize(w, h, dpr),
  info: () => renderer.debugInfo(),
  dynamic: (on: boolean, pin: number | null) => { renderer.setDynamicResolution(on); renderer.pinDynamicScale(pin); },
};
declare global { interface Window { lab: typeof lab; labReady: boolean } }
window.lab = lab;
window.labReady = true;
