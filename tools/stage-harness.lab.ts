// Laboratório GL do palco 3D (onda N, N2): as funções que tests/stage-gl.test.ts chama pelo Playwright, no Chromium com swiftshader.
// Monta janelas de palco (divs com retângulo fixo) pelo MESMO caminho das telas (`mountShowroom`/`mountPodium` → `stageBus`) e desenha com o
// `renderIdle` do renderizador do jogo. Nada aqui mede FPS (swiftshader não diz nada sobre GPU): só contagem, compilação e memória.
import type * as THREE from 'three';
import { CARS, createRace, getTrack, seatColor, stepRace, type HumanEntry, type RaceState } from '../src/core';
import type { Track } from '../src/core/types';
import { DEFAULT_SETTINGS, type CarColors, type Quality, type RenderFrame } from '../src/game/contracts';
import { racePaints } from '../src/game/paints';
import { createRenderer, type DebugInfo } from '../src/render/renderer';
import { mountPodium, mountShowroom, type StageHandle } from '../src/render/stage';
import { stageBus } from '../src/render/stage-bus';
import type { StageFocus } from '../src/render/stage-plan';
import { stylizeUniforms } from '../src/render/stylize';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;
const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? window.innerWidth);
const H = Number(q.get('h') ?? window.innerHeight);
const renderer = createRenderer(canvas, hud);
renderer.setDynamicResolution(false);
const gl = (renderer as unknown as { __gl: THREE.WebGLRenderer }).__gl;
const stage = () => (renderer as unknown as { __stage: () => import('../src/render/stage').Stage | null }).__stage();
const shaderErrors: string[] = [];
gl.debug.onShaderError = (ctx, program, vs, fs) => {
  shaderErrors.push(`${ctx.getShaderInfoLog(vs) ?? ''} | ${ctx.getShaderInfoLog(fs) ?? ''} | ${ctx.getProgramInfoLog(program) ?? ''}`.slice(0, 600));
};
renderer.resize(W, H, Number(q.get('dpr') ?? 1));
const track: Track = getTrack('copacabana');

const hosts: HTMLElement[] = [];
const handles: StageHandle[] = [];

export interface HostRect { x: number; y: number; w: number; h: number }

/** Retângulos das janelas, como as colunas da garagem: 1 largo, 2 lado a lado, 3–4 em grade. */
function layoutFor(n: number): HostRect[] {
  if (n === 1) return [{ x: Math.round(W * 0.12), y: Math.round(H * 0.1), w: Math.round(W * 0.76), h: Math.round(H * 0.78) }];
  const cols = n === 2 ? 2 : 2;
  const rows = Math.ceil(n / cols);
  const gap = 12; const cw = Math.floor((W - gap * (cols + 1)) / cols); const ch = Math.floor((H - gap * (rows + 1)) / rows);
  return Array.from({ length: n }, (_, i) => ({ x: gap + (i % cols) * (cw + gap), y: gap + Math.floor(i / cols) * (ch + gap), w: cw, h: ch }));
}

export interface MountOptions { quality?: Quality; reduce?: boolean; cars?: string[]; paints?: Array<CarColors | null>; focus?: StageFocus[]; podium?: boolean; ids?: string[] }

function place(el: HTMLElement, r: HostRect): void {
  el.className = 'lab-host';
  el.style.left = `${r.x}px`; el.style.top = `${r.y}px`; el.style.width = `${r.w}px`; el.style.height = `${r.h}px`;
}

function mount(n: number, o: MountOptions = {}): HostRect[] {
  unmount();
  const rects = layoutFor(n);
  const ring = ['#ffd23f', '#3ddc84', '#4fc3f7', '#ff7ab6'];
  rects.forEach((r, i) => {
    const el = document.createElement('div');
    place(el, r);
    document.body.appendChild(el);
    hosts.push(el);
    const opts = { id: o.ids?.[i] ?? `lab:${i}`, quality: o.quality, reduceEffects: o.reduce ?? false, ring: ring[i % 4] };
    if (o.podium) {
      handles.push(mountPodium(el, [
        { place: 1, carId: 'falcao', paint: null }, { place: 2, carId: 'trovao', paint: { color: '#d7263d', accent: '#f4f4f2' } }, { place: 3, carId: 'tornado', paint: { color: '#2346d6', accent: '#ffcf26' } },
      ], opts));
    } else {
      handles.push(mountShowroom(el, { ...opts, carId: o.cars?.[i] ?? CARS[i % CARS.length].id, paint: o.paints?.[i] ?? null, focus: o.focus?.[i] ?? null }));
    }
  });
  return rects;
}

function unmount(): void {
  for (const h of handles) h.release();
  handles.length = 0;
  for (const el of hosts) el.remove();
  hosts.length = 0;
}

/** Um quadro do menu (o caminho do jogo sem corrida: `renderIdle`). */
function frame(t: number): DebugInfo { renderer.renderIdle(t, track); return renderer.debugInfo(); }

function frames(t0: number, count: number, dt = 1 / 30): DebugInfo[] {
  const out: DebugInfo[] = [];
  for (let i = 0; i < count; i++) out.push(frame(t0 + i * dt));
  return out;
}

/** O pixel do canvas (x, y em px CSS, origem em cima), lido logo depois do desenho (o buffer ainda vale na mesma tarefa). */
function sample(x: number, y: number): [number, number, number, number] {
  const ctx = gl.getContext();
  const out = new Uint8Array(4);
  const dpr = gl.getPixelRatio();
  ctx.readPixels(Math.round(x * dpr), Math.round((H - y) * dpr) - 1, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, out);
  return [out[0], out[1], out[2], out[3]];
}

function memory(): { geometries: number; textures: number; programs: number } {
  return { geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, programs: gl.info.programs?.length ?? 0 };
}

export interface ProgramReport { total: number; bad: string[]; shaderErrors: string[] }

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

// ── A corrida (para provar que o palco devolve o que pegou emprestado) ──
let race: { state: RaceState; humans: HumanEntry[] } | null = null;
let tick = 0;
function raceFrame(quality: Quality, n: number): DebugInfo {
  if (!race) {
    const humans: HumanEntry[] = Array.from({ length: n }, (_, i) => ({ seat: i, name: `P${i + 1}`, carId: CARS[i].id, teamId: 0, color: seatColor(i) }));
    const state = createRace({ trackId: 'copacabana', laps: 3, humans, totalCars: 12, difficulty: 'profissional', manualGear: false, assists: { sharedNitro: true, tow: true, teamDraft: true, catchup: true }, seed: 42 }, track);
    for (let i = 0; i < 200; i++) stepRace(state, track, []);
    race = { state, humans };
  }
  stepRace(race.state, track, []); tick++;
  const f: RenderFrame = {
    state: race.state, track,
    viewports: race.humans.map((h) => ({ seat: h.seat, carIndex: race!.state.cars.findIndex((c) => c.seat === h.seat), color: h.color, name: h.name, messages: [] })),
    options: { quality, showMinimap: false, screenShake: true, reduceEffects: false, palette: DEFAULT_SETTINGS.colorPalette, landmarkCaptions: false },
    time: tick / 60, paused: false, coop: false, showHud: false, paints: racePaints(race.state.cars, race.humans),
  };
  renderer.render(f);
  return renderer.debugInfo();
}

/** O que o palco mexe e tem de devolver: exposição, uniformes da estilização, pai do grupo dos carros. */
function snapshot(): { exposure: number; rim: number[]; term: number[]; adjust: number[]; carsInRaceScene: boolean } {
  const scene = (renderer as unknown as { __scene: THREE.Scene }).__scene;
  let inRace = false;
  scene.traverse((o) => { if (o.type === 'Group' && o.children.some((c) => (c as THREE.InstancedMesh).isInstancedMesh)) inRace = true; });
  return { exposure: gl.toneMappingExposure, rim: stylizeUniforms.uStylizeRim.value.toArray(), term: stylizeUniforms.uStylizeTerm.value.toArray(), adjust: stylizeUniforms.uGradeAdjust.value.toArray(), carsInRaceScene: inRace };
}

/** O estado dos efeitos da cena do palco (o que está visível agora). */
function effects(): { active: boolean; confetti: boolean; sparks: boolean; cover: boolean; beam: boolean; drawn: number; podium: boolean } {
  const s = stage();
  const vis = (name: string): boolean => s?.scene.getObjectByName(name)?.visible === true;
  return { active: s?.active ?? false, confetti: vis('stage:confetti'), sparks: vis('stage:sparks'), cover: vis('stage:cover'), beam: vis('stage:beam'), drawn: s?.drawnPanels ?? 0, podium: vis('stage:podium') };
}

/** Os selos DOM do host `i`: a opacidade atual do "NOVO!" e do clarão (null = não existe). */
function overlay(i: number): { novo: string | null; flash: string | null } {
  const el = hosts[i];
  const novo = el?.querySelector('.stage-novo') as HTMLElement | null;
  const flash = el?.querySelector('.stage-flash') as HTMLElement | null;
  return { novo: novo ? novo.style.opacity : null, flash: flash ? flash.style.opacity : null };
}

const lab = {
  renderer, mount, unmount, frame, frames, sample, memory, programs, raceFrame, snapshot, effects, overlay,
  reveal: (i: number) => handles[i]?.reveal(),
  workshop: (i: number) => handles[i]?.workshop(),
  set: (i: number, patch: Parameters<StageHandle['set']>[0]) => handles[i]?.set(patch),
  live: () => stageBus.live().length,
  info: () => renderer.debugInfo(),
  gl: () => ({ w: W, h: H }),
};
declare global { interface Window { lab: typeof lab; labReady: boolean } }
window.lab = lab;
window.labReady = true;
