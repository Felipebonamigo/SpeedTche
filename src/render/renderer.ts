// Renderizador 3D (Three.js). Uma cena só; a cada quadro, para cada viewport, o mundo é
// reposicionado no referencial do carro daquele jogador (RoadFrame) e desenhado por
// scissor. Tone mapping Custom (Neutral + gradação por bioma × período, stylize.ts) com a exposição da paleta.
// Os degraus de qualidade (onda L, L2; o desenho de cada um está em postfx/plan.ts):
//   Baixa  — direto na tela (o tone mapping é do material), sem sombra do sol, com a mancha de contato sob o carro;
//   Média  — cena num alvo HDR + bloom em meia resolução + saída + FXAA;
//   Alta   — MSAA no alvo, bloom, desfoque radial (nitro e > 85% da velocidade) e GTAO em meia resolução até 2 jogadores;
//   Ultra  — a Alta com o GTAO em resolução cheia (de 1 a 4 jogadores).
// Cada viewport tem um ViewportPipeline (postfx/pipeline.ts) criado UMA vez e redimensionado em lugar (resize, lotação); a resolução
// dinâmica usa um sub-retângulo do alvo de tamanho fixo. O limiar do bloom fica acima do branco iluminado pelo sol (de dia só o disco
// do sol e os emissivos brilham; à noite, faróis, postes e neon).
// Fora da corrida, se uma tela de menu registrou janelas de palco (stage-bus.ts), o `renderIdle` desenha o PALCO 3D (stage.ts) no lugar do mundo:
// garagem, Concessionária e pódio. O palco empresta os carros e a estilização daqui e os devolve ao sair; a corrida o tira de cena.
import * as THREE from 'three';
import { TICK_RATE } from '../core/constants';
import { segmentAt } from '../core/track/builder';
import type { TimeOfDay, Track } from '../core/types';
import type { Quality, RenderFrame, Renderer } from '../game/contracts';
import { DEFAULT_CAMERA_MODE, pickCameraMode } from './camera-base';
import { cameraExtraFor, ChaseCamera, IdleCamera, newCameraExtra } from './camera';
import { CaptionDirector, captionScene, captionSpots, type CaptionScene, type CaptionView } from './caption/caption';
import { Cars } from './cars';
import { Effects, type Shake } from './effects';
import { Hud } from './hud';
import { viewportRects, type Rect } from './layout';
import { palette, racePeriodPlan, type LivePalette, type Palette } from './palette';
import { PeriodClock } from './period-clock';
import { DynamicResolution, dynamicResolutionDefault } from './postfx/dynres';
import { fpsLockActive, FrameLimiter, LOCK_MS } from './postfx/fps-lock';
import { backdropCount, MenuBackdrop } from './menu-backdrop';
import { getRenderPrefs } from './prefs';
import { ViewportPipeline } from './postfx/pipeline';
import { planFor, radialBlurStrength, shadowPlan, type PostPlan } from './postfx/plan';
import { ShadowRing } from './postfx/shadows';
import { Road } from './road';
import { absoluteHeading, buildRoadFrame, FRAME_AHEAD, FRAME_BEHIND, type RoadFrame } from './roadframe';
import { Scenery } from './scenery';
import type { Layout } from './scenery/layout';
import { Sky } from './sky';
import { Stage, STAGE_IDLE_RELEASE } from './stage';
import { stageBus } from './stage-bus';
import { installToneMapping, setStylizePalette } from './stylize';
import { Terrain } from './terrain';
import { buildHorizon } from './horizon';

const BEHIND = FRAME_BEHIND;
const AHEAD = FRAME_AHEAD;
const MAX_POINTS = BEHIND + Math.max(AHEAD.high, AHEAD.ultra) + 1;
/** Velocidade da câmera automática dos menus (unidades de pista por segundo). */
const IDLE_SPEED = 2600;

/** Contadores de um viewport no último quadro (banco de prova, src/bench/; gate da L2). */
export interface ViewportDebug {
  calls: number; triangles: number;
  /** O pedaço do alvo da cena realmente desenhado (px): menor que o viewport quando a resolução dinâmica está num degrau abaixo de 1. */
  targetW: number; targetH: number;
  /** Amostras do MSAA do alvo da cena (0 = sem). */
  samples: number;
  /** Passes de pós habilitados no quadro (a Baixa não tem). */
  passes: number;
  /** Pixels escritos pelos passes de pós no quadro (a cena resolvida, o AO, os alvos do bloom, a saída…). */
  postPx: number;
}
/** O que o renderizador conta de si: composers criados (um por viewport usado, nunca mais um por resize ou lotação) e os redimensionamentos em lugar. */
export interface PostDebug { builds: number; resizes: number; scale: number; dynamic: boolean; /** Quadros cujo desenho o modo de 30 fps travados pulou (L2b). */ skipped: number; /** Carros decorativos desenhados no fundo do menu no último `renderIdle` (L2b). */ backdropCars: number }
export interface DebugInfo {
  calls: number; triangles: number; frameMs: number; quality: Quality | null; shadows: boolean; viewports: ViewportDebug[];
  post: PostDebug;
  /** Mapas de sombra do sol redesenhados no quadro (com 3 e 4 jogadores, metade deles). */
  shadowUpdates: number;
}

/** O renderizador do jogo: o contrato `Renderer` mais o que o banco de prova, o harness e os testes usam. */
export type GameRenderer = Renderer & {
  debugInfo(): DebugInfo;
  /** Liga ou desliga a resolução dinâmica (ligada por padrão no jogo; desligada sob automação e com `?dynres=0`). */
  setDynamicResolution(on: boolean): void;
  /** Fixa a escala da resolução dinâmica (harness e testes); nulo volta ao controle automático. */
  pinDynamicScale(scale: number | null): void;
  /** Fixa a força do desfoque radial (0..1) no lugar da velocidade e do nitro (harness e testes); nulo volta ao normal. */
  pinRadialBlur(strength: number | null): void;
  /** Quantas vezes a paleta ao vivo foi entregue (M6): no máximo ~520 numa corrida inteira, nunca por quadro. */
  liveApplied(): number;
};

export function createRenderer(canvas: HTMLCanvasElement, hudRoot: HTMLElement): GameRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  installToneMapping(); // antes do primeiro quadro: troca a CustomToneMapping do chunk global (Neutral + gradação, stylize.ts)
  renderer.toneMapping = THREE.CustomToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft foi removido no r186
  renderer.info.autoReset = false;
  renderer.setScissorTest(true);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  const sky = new Sky(renderer, scene);
  const road = new Road(MAX_POINTS, Math.min(8, maxAniso));
  const terrain = new Terrain(MAX_POINTS);
  const scenery = new Scenery();
  const cars = new Cars(scene);
  const effects = new Effects();
  scene.add(terrain.group, road.group, scenery.group, effects.group);
  const hud = new Hud(hudRoot);

  // Janelas alocadas na primeira chamada e reutilizadas (zero alocação por quadro).
  const frames: Array<RoadFrame | undefined> = [undefined, undefined, undefined, undefined];
  const cameras = [new ChaseCamera(), new ChaseCamera(), new ChaseCamera(), new ChaseCamera()];
  const idleCamera = new IdleCamera();
  const cameraExtras = [newCameraExtra(), newCameraExtra(), newCameraExtra(), newCameraExtra()];
  const shake: Shake = { x: 0, y: 0, roll: 0 };
  // Legenda dos marcos turísticos (caption/caption.ts): uma por viewport, sobre as instâncias do layout que o cenário
  // desenha; a cena é montada uma vez por pista (o layout novo) e a câmera de cada jogador é conferida a 5 Hz.
  const captions = [new CaptionDirector(), new CaptionDirector(), new CaptionDirector(), new CaptionDirector()];
  const captionView: CaptionView = { z: 0, x: 0, fov: 62, aspect: 16 / 9, ahead: AHEAD.high };
  let captionLayout: Layout | null = null;
  let captionTrack: CaptionScene | null = null;

  let width = 1; let height = 1; let dpr = 1;
  let quality: Quality | null = null;
  let trackKey = '';
  /** Bloom da paleta atual: força, raio, limiar. */
  let bloom: [number, number, number] = [0.3, 0.4, 1];
  /** Um pipeline de pós por viewport usado (postfx/pipeline.ts); nasce na primeira vez e é redimensionado em lugar. */
  const pipes: Array<ViewportPipeline | undefined> = [];
  let builds = 0;
  let resizes = 0;
  const dynamic = new DynamicResolution();
  dynamic.setEnabled(dynamicResolutionDefault(typeof location === 'undefined' ? '' : location.search, typeof navigator !== 'undefined' && navigator.webdriver === true));
  let pinned: number | null = null;
  let lastScale = 1;
  let pinnedRadial: number | null = null;
  let lastRenderAt = -1;
  // L2b: 30 fps travados (postfx/fps-lock.ts) e os carros decorativos do fundo do menu (menu-backdrop.ts).
  const limiter = new FrameLimiter();
  let skipped = 0;
  const backdrop = new MenuBackdrop();
  let backdropShown = 0;
  let lastBlurAt = 0;
  /** Desfoque radial suavizado por viewport (0..1). */
  const radial = [0, 0, 0, 0];
  const debug: DebugInfo = { calls: 0, triangles: 0, frameMs: 0, quality: null, shadows: false, viewports: [], post: { builds: 0, resizes: 0, scale: 1, dynamic: true, skipped: 0, backdropCars: 0 }, shadowUpdates: 0 };
  // O sol é uma luz só (sky.ts); a sombra dele é por viewport com 3 e 4 jogadores (postfx/shadows.ts).
  const sun = scene.children.find((o): o is THREE.DirectionalLight => (o as THREE.DirectionalLight).isDirectionalLight === true);
  const shadowRing = sun ? new ShadowRing(sun.shadow) : null;
  /** Contadores por viewport do último quadro: 4 objetos fixos; a cópia só acontece em debugInfo(). */
  const vps: ViewportDebug[] = [0, 1, 2, 3].map(() => ({ calls: 0, triangles: 0, targetW: 0, targetH: 0, samples: 0, passes: 0, postPx: 0 }));
  let vpCount = 0;
  let disposed = false;
  /** O palco 3D (garagem, Concessionária, pódio): nasce na primeira janela registrada e morre com o renderizador. */
  let stage: Stage | null = null;
  /** `palette.light` da pista atual (a luz dos carros na corrida): o palco a devolve ao sair. */
  let carLight = 1;
  let lastStageAt = -1;

  let horizonFor: { id: string; p: Palette; pTo?: Palette } | null = null;
  function rebuildHorizon(): void {
    if (horizonFor) terrain.setHorizon(buildHorizon(horizonFor.id, horizonFor.p, quality ?? 'high', horizonFor.pTo));
  }

  // A corrida que muda (M6, b; docs/ondas/M/M6.md): o período anda durante a corrida, só visual. As duas pontas de cada pista (a dela e a seguinte) são montadas UMA vez em
  // `ensureTrack` (texturas, tabelas de cor, anéis); daí em diante cada passo é só uniforme (`applyLive`), sem material novo e sem programa recompilado.
  const clock = new PeriodClock();
  /** Os períodos das duas pontas da pista atual (a pista de noite não tem a seguinte). */
  let liveTimes: { a: TimeOfDay; b: TimeOfDay } = { a: 'day', b: 'day' };
  /** A faixa de luz dos carros (≥ 0,8 · 0,5–0,8 · < 0,5): `cars.setLight` só é chamado quando ela muda (os SpotLights ligam em 0,8). */
  let lightBand = 0;
  const bandOf = (light: number): number => (light >= 0.8 ? 2 : light >= 0.5 ? 1 : 0);
  /** Pista de dia com período seguinte: os SpotLights dos carros vão ligar no meio da corrida (muda o número de luzes da cena e recompila os programas): o primeiro quadro desenha uma vez com eles ligados. */
  let prewarmLights = false;
  /** Quantas vezes `applyLive` rodou (o teste e o banco de prova conferem: nunca por quadro). */
  let liveApplied = 0;

  function applyLive(live: LivePalette): void {
    liveApplied++;
    const p = live.p;
    const envBefore = sky.liveEnvRebuilds;
    sky.setLive(live, liveTimes.a, liveTimes.b, quality ?? 'high');
    road.setLive(live);
    terrain.setLive(live);
    scenery.setLive(p);
    renderer.toneMappingExposure = setStylizePalette(p).exposure;
    bloom = p.bloom;
    for (const pipe of pipes) pipe?.setBloom(bloom);
    const band = bandOf(p.light);
    if (band !== lightBand) { lightBand = band; cars.setLight(p.light); carLight = p.light; }
    if (sky.liveEnvRebuilds !== envBefore) effects.setPalette(p);
  }

  function ensureTrack(track: Track): void {
    const key = `${track.def.id}:${track.def.scenery}:${track.def.timeOfDay}`;
    if (key === trackKey) return;
    trackKey = key;
    const p = palette(track.def.scenery, track.def.timeOfDay);
    const night = p.light < 0.8;
    // A paleta do período seguinte (se a corrida o alcança): a segunda ponta das tabelas de cor, das texturas e dos anéis.
    const next = racePeriodPlan(track.def.timeOfDay, track.def.laps)?.to;
    const pTo = next ? palette(track.def.scenery, next) : undefined;
    liveTimes = { a: track.def.timeOfDay, b: next ?? track.def.timeOfDay };
    clock.reset();
    sky.setPalette(p, track.def.timeOfDay, key);
    road.setPalette(p, track.def.timeOfDay === 'night', key, pTo);
    terrain.setTrack(track, p, key, pTo);
    horizonFor = { id: track.def.id, p, pTo };
    rebuildHorizon();
    scenery.setNight(night);
    cars.setLight(p.light);
    carLight = p.light;
    lightBand = bandOf(p.light);
    prewarmLights = pTo !== undefined && lightBand === 2;
    effects.setPalette(p);
    effects.clear();
    renderer.toneMappingExposure = setStylizePalette(p).exposure;
    bloom = p.bloom;
    for (const pipe of pipes) pipe?.setBloom(bloom);
    for (const c of cameras) c.reset();
    if (quality) sky.setQuality(quality);
  }

  function ensureQuality(q: Quality): void {
    if (q === quality) return;
    quality = q;
    renderer.shadowMap.enabled = q !== 'low';
    sky.setQuality(q);
    cars.setQuality(q);
    rebuildHorizon();
    // Materiais com sombra precisam recompilar quando o shadow map liga/desliga.
    scene.traverse((o) => { if (o instanceof THREE.Mesh) { const m = o.material as THREE.Material; m.needsUpdate = true; } });
    disposePosts(); // os passes de cada degrau são outros
    dynamic.reset();
    prewarmLights = liveTimes.a !== liveTimes.b && lightBand === 2; // os programas do degrau novo também precisam ser aquecidos
  }

  function disposePosts(): void {
    for (const p of pipes) p?.dispose();
    pipes.length = 0;
  }

  /** O pipeline do viewport `i` (criado na primeira vez, nunca recriado), do tamanho do viewport em px, redimensionado em lugar. */
  function pipelineFor(i: number, rect: Rect, camera: THREE.PerspectiveCamera, q: Quality): ViewportPipeline {
    let pipe = pipes[i];
    if (!pipe) {
      pipe = new ViewportPipeline(renderer, scene, camera, planFor(q, 1), planFor(q, 1).ao, bloom);
      pipes[i] = pipe;
      builds++;
    }
    if (pipe.setSize(rect.w * dpr, rect.h * dpr)) resizes++;
    return pipe;
  }

  /** A escala da resolução dinâmica que vale neste quadro (1 com ela desligada). */
  function currentScale(): number { return dynamic.enabled ? (pinned ?? dynamic.scale) : 1; }

  /**
   * Desenha um viewport (com pós a partir da Média) e conta o que ele custou. Mede a diferença do `renderer.info` em volta do
   * desenho, e não do `setViewport`: a passada de sombra e os quadros cheios do bloom acontecem dentro do `render()`.
   * `vpCount` só conta os viewports de fato desenhados (o `continue` da corrida pula assento sem carro).
   */
  function drawViewport(i: number, rect: Rect, camera: THREE.PerspectiveCamera, q: Quality, plan: PostPlan, blur: number): void {
    const c0 = renderer.info.render.calls; const tri0 = renderer.info.render.triangles;
    const v = vps[vpCount];
    if (plan.post) {
      const pipe = pipelineFor(i, rect, camera, q);
      lastScale = currentScale();
      const st = pipe.render({ camera, scale: lastScale, radial: plan.radialBlur ? blur : 0 }, plan.ao !== null);
      v.targetW = st.targetW; v.targetH = st.targetH; v.samples = st.samples; v.passes = st.passes; v.postPx = st.postPx;
    } else {
      renderer.render(scene, camera);
      v.targetW = Math.max(1, Math.round(rect.w * dpr)); v.targetH = Math.max(1, Math.round(rect.h * dpr)); // a Baixa desenha direto
      v.samples = 0; v.passes = 0; v.postPx = 0;
    }
    v.calls = renderer.info.render.calls - c0; v.triangles = renderer.info.render.triangles - tri0;
    vpCount++;
  }

  function setViewport(rect: Rect): void {
    const y = height - rect.y - rect.h;
    renderer.setViewport(rect.x, y, rect.w, rect.h);
    renderer.setScissor(rect.x, y, rect.w, rect.h);
  }

  function poseWorld(rf: RoadFrame, track: Track, z: number, time: number): void {
    const absH = absoluteHeading(track, z);
    sky.update(absH, time);
    road.update(rf, track);
    terrain.update(rf, track, time, sky.sunDirLocal, absH);
    scenery.update(rf, track, time);
  }

  /** A cena da legenda da pista atual (null antes do cenário montar o layout dela). */
  function captionSceneFor(track: Track): CaptionScene | null {
    const layout = scenery.currentLayout;
    if (layout !== captionLayout) {
      captionLayout = layout;
      // A pista da conta vem do layout (a grade de alturas que ele já montou); sem marco, nem cena.
      captionTrack = layout?.sight ? captionScene(track, captionSpots(layout), layout.sight) : null;
    }
    return captionTrack;
  }

  function render(frame: RenderFrame): void {
    if (disposed) return;
    stage?.idleRelease(); // a corrida tira o palco de cena (devolve os carros, a estilização e a exposição) e solta os alvos de GPU dele
    lastStageAt = -1;
    const t0 = performance.now();
    ensureTrack(frame.track);
    ensureQuality(frame.options.quality);
    sky.setFlare(!frame.options.reduceEffects);
    const q = frame.options.quality;
    const track = frame.track;
    {
      // O líder entre os carros que uma tela mostra decide o período (a corrida que muda); o relógio nunca volta e só avisa quando o `t` andou 1/512.
      const progresses: number[] = [];
      for (let i = 0; i < Math.min(4, frame.viewports.length); i++) { const c = frame.state.cars[frame.viewports[i].carIndex]; if (c) progresses.push(c.progress); }
      const f = clock.step(track.def.scenery, track.def.timeOfDay, frame.state.config.laps, track.length, progresses);
      if (f.changed) applyLive(f.live);
    }
    cars.update(frame);
    effects.update(frame);
    const n = Math.max(1, Math.min(4, frame.viewports.length));
    const rects = viewportRects(n, width, height);
    // 30 fps travados (L2b): pula só o DESENHO; carros, efeitos e HUD seguem a cada quadro do navegador. Pausado, desenha sempre.
    const lockOn = fpsLockActive(q, n, getRenderPrefs().lockFps30);
    dynamic.setTargetMs(lockOn ? LOCK_MS : 1000 / 60);
    if (!limiter.shouldDraw(frame.time * 1000, lockOn && !frame.paused)) {
      skipped++;
      if (frame.showHud) hud.update(frame, width, height, captions); else hud.hide();
      return;
    }
    const plan = planFor(q, n);
    const sp = shadowPlan(q, n);
    tickDynamic(t0);
    const blurDt = frame.paused ? 0 : Math.min(0.1, Math.max(0, (t0 - lastBlurAt) / 1000));
    lastBlurAt = t0;
    renderer.info.reset();
    vpCount = 0;
    if (shadowRing && sp.enabled) shadowRing.beginFrame(sp);
    for (let i = 0; i < n; i++) {
      const vp = frame.viewports[i];
      const car = frame.state.cars[vp.carIndex];
      if (!car) continue;
      const rf = buildRoadFrame(track, car.z, BEHIND, AHEAD[q], frames[i]);
      frames[i] = rf;
      poseWorld(rf, track, car.z, frame.time);
      const camMode = pickCameraMode(vp.camera, DEFAULT_CAMERA_MODE); // a escolha do assento (nada no núcleo nem na rede)
      cars.pose(rf, frame.state, track, vp.carIndex, frame.viewports, frame.time, camMode);
      cars.poseGhost(rf, track, frame.ghost);
      const cam = cameras[i];
      const rect = rects[i];
      cam.setAspect(rect.w / Math.max(1, rect.h));
      const seg = segmentAt(track, car.z);
      effects.shake(vp.seat, frame.time, frame.options.screenShake && !frame.options.reduceEffects, shake);
      cam.update(rf, car.x, car.speed / car.stats.topSpeed, seg.curve, car.nitroTicks > 0, frame.time, shake, cameraExtraFor(frame, vp.carIndex, cameraExtras[i]), camMode, cars.eyeOfOwn());
      effects.pose(rf, track, (rect.h * dpr) / (2 * Math.tan((cam.camera.fov * Math.PI / 180) / 2)), i);
      // Legenda dos marcos: só correndo (nem na contagem, nem depois da chegada); desligada nas opções, sem cena (nada
      // montado, e a que estava na tela some). O relógio é o da corrida: parado na pausa (o HUD esconde a legenda), e
      // volta a zero numa corrida nova.
      const captionsOn = frame.options.landmarkCaptions !== false;
      captionView.z = car.z; captionView.x = car.x; captionView.fov = cam.camera.fov; captionView.mode = camMode;
      captionView.aspect = rect.w / Math.max(1, rect.h); captionView.ahead = AHEAD[q];
      captions[i].update(captionsOn ? captionSceneFor(track) : null, captionView, Math.max(1, car.lap), frame.state.tick / TICK_RATE,
        frame.state.phase === 'racing' && !car.finished);
      // Desfoque radial: velocidade acima de 85% ou nitro (plan.ts), com subida e descida suaves (nada de piscar).
      const blurTarget = radialBlurStrength(car.speed / car.stats.topSpeed, car.nitroTicks > 0, frame.options.reduceEffects);
      radial[i] += (blurTarget - radial[i]) * (1 - Math.exp(-blurDt * 7));
      if (pinnedRadial !== null) radial[i] = pinnedRadial;
      setViewport(rect);
      // A sombra do viewport ANTES de qualquer desenho dele, inclusive o aquecimento abaixo (T2, docs/ondas/tecnica-14-10.md): com a sombra por
      // viewport (3 e 4 jogadores) o mapa que o three cria num desenho fora dela era trocado pelo do assento no `beginViewport` e ficava na GPU
      // sem dono (1 mapa, 2 texturas, por largada). Dentro dela, o aquecimento desenha o mapa do assento e o desenho de verdade o reaproveita.
      const due = shadowRing && sp.enabled ? shadowRing.beginViewport(i, car.z, track.length) : false;
      if (prewarmLights) {
        // Aquece os faróis: uma vez, desenha este viewport com os SpotLights ligados (é o que a corrida faz no meio, e muda o número de luzes: todo programa lit recompilaria na hora, no quadro).
        // Desenhado, e não `renderer.compile`: o programa muda com o alvo de renderização (tone mapping e espaço de cor) e o compile solto compilaria outras variantes.
        prewarmLights = false;
        cars.setLight(0.7);
        const flare = sky.flare.visible; // o reflexo de lente (entardecer) também compila na primeira vez que aparece
        if (q !== 'low') sky.flare.visible = true;
        const n0 = vpCount;
        drawViewport(i, rect, cam.camera, q, plan, 0);
        vpCount = n0;
        sky.flare.visible = flare;
        cars.setLight(carLight);
      }
      drawViewport(i, rect, cam.camera, q, plan, radial[i]);
      if (shadowRing && sp.enabled) shadowRing.endViewport(i, due, car.z);
    }
    if (frame.showHud) hud.update(frame, width, height, captions); else hud.hide();
    debug.calls = renderer.info.render.calls;
    debug.triangles = renderer.info.render.triangles;
    debug.quality = q; debug.shadows = renderer.shadowMap.enabled;
    debug.shadowUpdates = sp.enabled && shadowRing ? shadowRing.updates : 0;
    debug.frameMs = performance.now() - t0;
  }

  /** O tempo entre dois quadros alimenta a resolução dinâmica (postfx/dynres.ts); o primeiro quadro só marca o relógio. */
  function tickDynamic(now: number): void {
    if (lastRenderAt >= 0) dynamic.update(now - lastRenderAt);
    lastRenderAt = now;
  }

  /**
   * O palco 3D no lugar do mundo, se alguma tela registrou janelas (stage-bus.ts). Sem janelas, devolve o que o palco pegou emprestado e,
   * passado `STAGE_IDLE_RELEASE`, solta os alvos de GPU dele. Devolve se desenhou (então o mundo do menu não é desenhado).
   */
  function renderStage(time: number): boolean {
    const live = stageBus.live();
    if (live.length === 0) {
      if (stage) {
        stage.leave();
        if (lastStageAt >= 0 && time - lastStageAt > STAGE_IDLE_RELEASE) { stage.idleRelease(); lastStageAt = -1; }
      }
      return false;
    }
    const t0 = performance.now();
    stage ??= new Stage({ renderer, cars, raceScene: scene, raceCarLight: () => carLight, raceCarQuality: () => quality });
    renderer.info.reset();
    const stats = stage.render(time, { width, height, dpr }, live);
    lastStageAt = time;
    vpCount = stats.length;
    stats.forEach((s, i) => Object.assign(vps[i], s));
    hud.hide();
    debug.calls = renderer.info.render.calls;
    debug.triangles = renderer.info.render.triangles;
    debug.quality = quality; debug.shadows = false; debug.shadowUpdates = 0;
    debug.frameMs = performance.now() - t0;
    return stats.length > 0;
  }

  function renderIdle(time: number, track: Track): void {
    if (disposed) return;
    if (renderStage(time)) return;
    const t0 = performance.now();
    ensureTrack(track);
    ensureQuality(getRenderPrefs().quality ?? quality ?? 'high');
    // O fundo do menu é o período da pista (o do `track.def`), não o da corrida que acabou.
    const idle = clock.idle(track.def.scenery, track.def.timeOfDay, track.def.laps);
    if (idle.changed) applyLive(idle.live);
    tickDynamic(t0);
    const z = (time * IDLE_SPEED) % track.length;
    const rf = buildRoadFrame(track, z, BEHIND, AHEAD[quality ?? 'high'], frames[0]);
    frames[0] = rf;
    poseWorld(rf, track, z, time);
    // Fundo com carros correndo (L2b, menu-backdrop.ts): só com a qualidade das Opções (Média ou mais) e sem "reduzir efeitos"; a Baixa e o Retrô ficam como eram.
    const prefs = getRenderPrefs();
    const bq = prefs.quality ?? quality ?? 'high';
    backdropShown = backdropCount(bq, prefs.reduceEffects);
    if (backdropShown > 0) {
      const list = backdrop.update(time, z, track.length, backdropShown);
      const f = { state: { cars: list, party: undefined }, track, time, options: { reduceEffects: false }, looks: undefined, paints: undefined } as unknown as RenderFrame;
      cars.update(f);
      cars.pose(rf, f.state, track, -1, [], time);
    } else cars.hide();
    effects.clear();
    effects.pose(rf, track, 1);
    idleCamera.setAspect(width / Math.max(1, height));
    idleCamera.update(rf, time);
    const rect: Rect = { x: 0, y: 0, w: width, h: height };
    setViewport(rect);
    renderer.info.reset();
    vpCount = 0;
    const q = quality ?? 'high';
    // Fundo dos menus: um viewport, um mapa de sombra (o jeito do three), sem desfoque radial.
    shadowRing?.shared();
    drawViewport(0, rect, idleCamera.camera, q, planFor(q, 1), 0);
    hud.hide();
    debug.calls = renderer.info.render.calls;
    debug.triangles = renderer.info.render.triangles;
    debug.quality = quality; debug.shadows = renderer.shadowMap.enabled;
    debug.shadowUpdates = shadowPlan(q, 1).enabled ? 1 : 0;
    debug.frameMs = performance.now() - t0;
  }

  function resize(w: number, h: number, ratio: number): void {
    width = Math.max(1, Math.floor(w)); height = Math.max(1, Math.floor(h)); dpr = Math.max(0.5, Math.min(3, ratio));
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    // Os pipelines NÃO são recriados: cada um se redimensiona em lugar no próximo quadro (pipelineFor).
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    disposePosts();
    shadowRing?.dispose();
    stage?.dispose(); stage = null;
    sky.dispose(); road.dispose(); terrain.dispose(); scenery.dispose(); cars.dispose(); effects.dispose(); hud.dispose();
    renderer.dispose();
  }

  return {
    canvas, resize, render, renderIdle, dispose,
    liveApplied: () => liveApplied,
    debugInfo: () => ({ ...debug, viewports: vps.slice(0, vpCount).map((v) => ({ ...v })), post: { builds, resizes, scale: lastScale, dynamic: dynamic.enabled, skipped, backdropCars: backdropShown } }),
    setDynamicResolution: (on: boolean) => { dynamic.setEnabled(on); if (!on) lastScale = 1; },
    pinDynamicScale: (scale: number | null) => { pinned = scale; },
    pinRadialBlur: (strength: number | null) => { pinnedRadial = strength; },
    /** Só para depuração no harness (não faz parte do contrato). */
    __scene: scene, __gl: renderer, __stage: () => stage, __pipes: pipes, __cams: cameras.map((c) => c.camera), __idle: idleCamera.camera,
  } as GameRenderer;
}
