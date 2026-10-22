// O palco 3D (onda N, N2; docs/ondas/N/N2.md §4.3): uma cena só, fora da corrida, que desenha de 1 a 4 painéis no canvas do jogo, por scissor,
// nos retângulos das janelas que as telas de menu registraram no `stageBus`. Prato giratório, domo de estúdio na cor do assento,
// `RoomEnvironment` no PMREM (o reflexo do verniz e do vidro), luz de 3 pontos com contraluz de borda, sombra de contato (a mancha do `Cars`
// mais um disco no prato) e, por cima, a revelação do carro comprado (holofote, capa, faróis, confete), a oficina (mola, faísca) e o pódio.
//
// Os carros são os do renderizador da corrida: o `group` do `Cars` muda de cena enquanto o palco está ativo (`enter`) e volta ao sair (`leave`),
// junto com a luz, a qualidade, os uniformes da estilização e a exposição, que o palco regrava e devolve exatamente. Os menus não conhecem o
// renderizador: só o registro. A parte pura (mola, plano da revelação, confete, câmera de detalhe, retângulos) está em stage-plan.ts.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CARS } from '../core/data/cars';
import type { Quality } from '../game/contracts';
import type { Cars, DisplayCar } from './cars';
import { ensureHeroes } from './cars/assets';
import { heroEnabled } from './cars/lod';
import { hash2 } from './noise';
import { palette, type Palette } from './palette';
import { planFor, type PostPlan } from './postfx/plan';
import { getRenderPrefs } from './prefs';
import { ViewportPipeline } from './postfx/pipeline';
import type { LivePanel, StagePanel } from './stage-bus';
import {
  carToWorld, CONFETTI_COUNT, confettiPiece, fitDistance, focusPose, MAX_PANELS, PLATE_TOP, podiumSlots, revealPlan,
  stageQuality, stageViewport, STAGE_FOV, TURN_SPEED, workshopPlan, type ConfettiPiece, type PodiumSlot, type Rect, type RevealPlan, type WorkshopPlan,
} from './stage-plan';
import { applyGrade, applyStylize, setStylizePalette, stylizeUniforms } from './stylize';
import { canvas2d, texture } from './textures';

export { mountPodium, mountShowroom, type ShowroomOptions, type StageHandle } from './stage-mount';

// ───────────────────────────── Números do estúdio (provisórios: a captura é o juiz) ─────────────────────────────

const BG = 0x0a0d16;
/** Luz base: principal, preenchimento, contraluz e o reflexo do ambiente. */
const BASE = { key: 1.5, fill: 0.35, rim: 1.7, env: 0.3 };
const SPOT_MAX = 110;
const PLATE_R = 3.1;
/** Quanto a mola da oficina desce o casco (m) no ponto mais fundo. */
const DIP_METERS = 0.075;
const SPARKS = 90;
/** Quanto dura a oficina na tela (s): a mola acaba em 1,5 s. */
const WORKSHOP_SECONDS = 1.6;
const BLOOM: [number, number, number] = [0.28, 0.5, 1.8];
/** Segundos sem painel antes de o palco soltar os alvos de GPU e o ambiente (ir e voltar entre a Garagem e a Concessionária não os refaz). */
export const STAGE_IDLE_RELEASE = 4;

/** A paleta do estúdio: luz de dia, céu azulado, sem a tinta de bioma. Só alimenta a gradação e a luz de borda da estilização. */
const STUDIO: Palette = { ...palette('coast', 'day'), light: 1, hemiSky: '#a9b9ff', skyGlow: '#ffe2b8', sunLight: '#fff0d8', exposure: 0.9, bloom: BLOOM };

const CONFETTI_PALETTE = ['#ff5a36', '#ffd23f', '#3ddc84', '#4fc3f7', '#ff7ab6', '#ffffff'];
const PODIUM_COLORS = ['#ffc53d', '#cfd6e0', '#d08b5b'];

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// O fundo do estúdio: degradê do horizonte (tingido pela cor do assento) ao topo, com um halo atrás do carro (-Z, longe da câmera).
const DOME_FRAG = /* glsl */ `
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uGlow;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uMid, smoothstep(-0.02, 0.32, h));
  col = mix(col, uTop, smoothstep(0.22, 0.85, h));
  float back = max(dot(d, normalize(vec3(0.0, 0.12, -1.0))), 0.0);
  col += uGlow * (pow(back, 4.0) * 0.55 + pow(back, 14.0) * 0.45);
  col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.12, h));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** O que o palco desenhou num painel (o `debugInfo` do renderizador e o gate de contagem). */
export interface StagePanelStats { calls: number; triangles: number; targetW: number; targetH: number; samples: number; passes: number; postPx: number }

export interface StageDeps {
  renderer: THREE.WebGLRenderer;
  /** Os carros do renderizador da corrida: o palco os empresta. */
  cars: Cars;
  /** A cena da corrida, para onde o `group` dos carros volta ao sair. */
  raceScene: THREE.Scene;
  /** `palette.light` da pista atual (a luz dos carros na corrida) e a qualidade do material deles, para devolver ao sair. */
  raceCarLight(): number;
  raceCarQuality(): Quality | null;
}

/** O estado de cada painel dentro do palco, por id: sobrevive a a tela refazer o DOM. */
interface Slot {
  camera: THREE.PerspectiveCamera;
  fresh: boolean;
  yaw: number; az: number; el: number; dist: number;
  target: THREE.Vector3;
  steer: number;
  seenReveal: number; seenWorkshop: number;
  revealAt: number | null; workshopAt: number | null;
  ring: THREE.Color; ringKey: string;
}

interface Saved {
  rim: THREE.Vector3; term: THREE.Vector3; shadows: THREE.Vector3; highlights: THREE.Vector3; adjust: THREE.Vector3; exposure: number; clear: THREE.Color; clearAlpha: number;
  /** Cor-brilho: a IBL difusa e o céu/chão do verniz dos carros. */
  fill: number; skyTop: THREE.Vector3; skyHorizon: THREE.Vector3; ground: THREE.Vector3; road: THREE.Vector4;
}
interface Size { width: number; height: number; dpr: number }

const wrapPi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export class Stage {
  readonly scene = new THREE.Scene();
  readonly lights: { key: THREE.DirectionalLight; fill: THREE.DirectionalLight; rim: THREE.DirectionalLight };
  private readonly gl: THREE.WebGLRenderer;
  private readonly cars: Cars;
  private readonly raceScene: THREE.Scene;
  private readonly deps: StageDeps;
  /** Tudo o que o palco criou na GPU (geometrias, materiais, texturas): o `dispose` solta cada um. */
  private readonly owned: Array<{ dispose(): void }> = [];
  private readonly dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly floor: THREE.Mesh;
  private readonly plate: THREE.Group;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly contact: THREE.Mesh;
  private readonly spot: THREE.SpotLight;
  private readonly cone: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly pool: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly cover: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly confetti: THREE.InstancedMesh;
  private readonly sparks: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly sparkPositions: Float32Array;
  private readonly podium: THREE.Group;
  private podiumNumbers = false;
  private readonly slots = new Map<string, Slot>();
  private pipes: Array<ViewportPipeline | undefined> = [];
  private pipeQuality: Quality | null = null;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private saved: Saved | null = null;
  private entered = false;
  private disposed = false;
  private lastTime = -1;
  private quality: Quality | null = null;
  private readonly piece: ConfettiPiece = { x: 0, y: 0, z: 0, rot: 0, scale: 0, color: 0, alive: false };
  private readonly dummy = new THREE.Object3D();
  private readonly paintTmp = new THREE.Color();
  private readonly stats: StagePanelStats[] = [0, 1, 2, 3].map(() => ({ calls: 0, triangles: 0, targetW: 0, targetH: 0, samples: 0, passes: 0, postPx: 0 }));
  private drawn = 0;

  constructor(deps: StageDeps) {
    this.deps = deps;
    this.gl = deps.renderer; this.cars = deps.cars; this.raceScene = deps.raceScene;
    const scene = this.scene;

    // ── Fundo: o domo de estúdio e o chão que se apaga em volta do prato ──
    const domeMat = this.own(new THREE.ShaderMaterial({
      vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: new THREE.Color('#080b1c') }, uMid: { value: new THREE.Color('#10163a') }, uHorizon: { value: new THREE.Color('#1f2347') }, uGlow: { value: new THREE.Color('#ff8a4a') } },
    }));
    applyGrade(domeMat);
    this.dome = new THREE.Mesh(this.own(new THREE.SphereGeometry(40, 32, 16)), domeMat);
    this.dome.name = 'stage:dome'; this.dome.renderOrder = -10; this.dome.frustumCulled = false;
    scene.add(this.dome);

    const radial = this.own(radialTexture());
    const floorMat = this.own(new THREE.MeshStandardMaterial({ color: '#0c101c', roughness: 0.55, metalness: 0.15, alphaMap: radial, transparent: true, depthWrite: false }));
    applyStylize(floorMat, 'ground');
    this.floor = new THREE.Mesh(this.own(new THREE.CircleGeometry(26, 48).rotateX(-Math.PI / 2)), floorMat);
    this.floor.name = 'stage:floor'; this.floor.position.y = -0.002;
    scene.add(this.floor);

    // ── O prato giratório: corpo de cilindro baixo, o anel na cor do assento e a sombra de contato (disco escuro macio) ──
    this.plate = new THREE.Group(); this.plate.name = 'stage:plate';
    const plateMat = this.own(new THREE.MeshStandardMaterial({ color: '#242b3d', roughness: 0.32, metalness: 0.55 }));
    applyStylize(plateMat, 'scenery'); // a rampa de luz e a luz de borda do jogo no prato também
    const body = new THREE.Mesh(this.own(new THREE.CylinderGeometry(PLATE_R, PLATE_R + 0.06, PLATE_TOP, 72)), plateMat);
    body.position.y = PLATE_TOP / 2;
    this.plate.add(body);
    this.ringMat = this.own(new THREE.MeshBasicMaterial({ color: '#ff5a36' }));
    const ring = new THREE.Mesh(this.own(new THREE.TorusGeometry(PLATE_R - 0.06, 0.05, 10, 96).rotateX(Math.PI / 2)), this.ringMat);
    ring.name = 'stage:ring'; ring.position.y = PLATE_TOP + 0.01;
    this.plate.add(ring);
    scene.add(this.plate);
    const contactMat = this.own(new THREE.MeshBasicMaterial({ color: 0x000000, map: radial, transparent: true, opacity: 0.5, depthWrite: false }));
    this.contact = new THREE.Mesh(this.own(new THREE.CircleGeometry(2.2, 40).rotateX(-Math.PI / 2)), contactMat);
    this.contact.name = 'stage:contact'; this.contact.position.y = PLATE_TOP + 0.004; this.contact.scale.set(0.92, 1, 1.55);
    scene.add(this.contact);

    // ── Luz de 3 pontos (sem mapa de sombra): a principal quente à frente-esquerda, o preenchimento frio à direita, o contraluz forte atrás ──
    const key = new THREE.DirectionalLight('#ffe9cc', BASE.key); key.position.set(-5, 7, 5.5);
    const fill = new THREE.DirectionalLight('#9bb6ff', BASE.fill); fill.position.set(6, 3, 4);
    const rim = new THREE.DirectionalLight('#ffffff', BASE.rim); rim.position.set(1.5, 6.5, -7);
    for (const l of [key, fill, rim]) { l.castShadow = false; l.target.position.set(0, 0.5, 0); scene.add(l, l.target); }
    this.lights = { key, fill, rim };

    // ── A revelação: holofote (luz + feixe + poça), capa e confete ──
    this.spot = new THREE.SpotLight('#fff1d0', 0, 40, 0.5, 0.65, 2);
    this.spot.position.set(0, 7.2, 0.6); this.spot.target.position.set(0, 0.4, 0);
    scene.add(this.spot, this.spot.target);
    this.cone = new THREE.Mesh(this.own(beamGeometry(7, 2.2)), this.own(new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0, toneMapped: false,
    })));
    this.cone.name = 'stage:beam'; this.cone.position.set(0, PLATE_TOP + 3.5, 0.3); this.cone.visible = false; this.cone.renderOrder = 3;
    scene.add(this.cone);
    this.pool = new THREE.Mesh(this.own(new THREE.CircleGeometry(2.6, 48).rotateX(-Math.PI / 2)), this.own(new THREE.MeshBasicMaterial({
      color: '#ffe7b0', map: radial, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, toneMapped: false,
    })));
    this.pool.name = 'stage:pool'; this.pool.position.y = PLATE_TOP + 0.012; this.pool.visible = false; this.pool.renderOrder = 2;
    scene.add(this.pool);
    this.cover = new THREE.Mesh(this.own(coverGeometry()), this.own(new THREE.MeshStandardMaterial({ color: '#c8432c', roughness: 0.92, metalness: 0, transparent: true })));
    this.cover.name = 'stage:cover'; this.cover.visible = false;
    applyStylize(this.cover.material, 'scenery');
    scene.add(this.cover);
    const confettiMat = this.own(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }));
    this.confetti = new THREE.InstancedMesh(this.own(new THREE.PlaneGeometry(1, 0.55)), confettiMat, CONFETTI_COUNT);
    this.confetti.name = 'stage:confetti'; this.confetti.visible = false; this.confetti.frustumCulled = false; this.confetti.renderOrder = 5;
    this.confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < CONFETTI_COUNT; i++) this.confetti.setColorAt(i, new THREE.Color(CONFETTI_PALETTE[confettiPiece(i, 0, this.piece).color % CONFETTI_PALETTE.length]));
    scene.add(this.confetti);
    this.sparkPositions = new Float32Array(SPARKS * 3);
    const sparkGeo = this.own(new THREE.BufferGeometry());
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
    this.sparks = new THREE.Points(sparkGeo, this.own(new THREE.PointsMaterial({
      size: 0.12, sizeAttenuation: true, color: '#ffb347', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    })));
    this.sparks.name = 'stage:sparks'; this.sparks.visible = false; this.sparks.frustumCulled = false; this.sparks.renderOrder = 5;
    scene.add(this.sparks);

    // ── O pódio: três blocos (os números entram na primeira vez que um painel de pódio é desenhado) ──
    this.podium = new THREE.Group(); this.podium.name = 'stage:podium'; this.podium.visible = false;
    const blockGeo = this.own(new THREE.BoxGeometry(2.2, 1, 2.2));
    for (const s of podiumSlots(3)) {
      const m = this.own(new THREE.MeshStandardMaterial({ color: PODIUM_COLORS[s.place - 1], roughness: 0.28, metalness: 0.75 }));
      applyStylize(m, 'scenery');
      const block = new THREE.Mesh(blockGeo, m);
      block.name = `stage:block${s.place}`;
      block.scale.y = s.top; block.position.set(s.x, s.top / 2, s.z);
      this.podium.add(block);
    }
    scene.add(this.podium);
  }

  private own<T extends { dispose(): void }>(x: T): T { this.owned.push(x); return x; }

  /** O palco está montado na cena (os carros emprestados estão nele)? */
  get active(): boolean { return this.entered; }

  /** Quantos painéis o último `render` desenhou. */
  get drawnPanels(): number { return this.drawn; }

  // ───────────────────────────── Entra e sai ─────────────────────────────

  /**
   * Pega emprestado o que é da corrida: o grupo dos carros muda de cena, e a estilização (luz de borda, terminador, gradação), a exposição
   * a cor de limpeza do canvas e a luz dos carros ganham os valores do estúdio. Idempotente: um 2º `enter` não regrava o que a corrida tinha com o valor do estúdio.
   */
  enter(): void {
    if (this.entered || this.disposed) return;
    this.entered = true;
    const u = stylizeUniforms;
    this.saved = {
      rim: u.uStylizeRim.value.clone(), term: u.uStylizeTerm.value.clone(), shadows: u.uGradeShadows.value.clone(),
      highlights: u.uGradeHighlights.value.clone(), adjust: u.uGradeAdjust.value.clone(), exposure: this.gl.toneMappingExposure,
      clear: this.gl.getClearColor(new THREE.Color()), clearAlpha: this.gl.getClearAlpha(),
      fill: u.uStylizeFill.value, skyTop: u.uStylizeSkyTop.value.clone(), skyHorizon: u.uStylizeSkyHorizon.value.clone(), ground: u.uStylizeGround.value.clone(), road: u.uStylizeRoad.value.clone(),
    };
    this.gl.toneMappingExposure = setStylizePalette(STUDIO).exposure;
    this.scene.add(this.cars.group);
    this.cars.setLight(1);
  }

  /** Devolve à corrida exatamente o que `enter` guardou. Idempotente; sem `enter` não faz nada. */
  leave(): void {
    if (!this.entered) return;
    this.entered = false;
    const s = this.saved;
    this.saved = null;
    if (s) {
      const u = stylizeUniforms;
      u.uStylizeRim.value.copy(s.rim); u.uStylizeTerm.value.copy(s.term); u.uGradeShadows.value.copy(s.shadows);
      u.uGradeHighlights.value.copy(s.highlights); u.uGradeAdjust.value.copy(s.adjust);
      u.uStylizeFill.value = s.fill; u.uStylizeSkyTop.value.copy(s.skyTop); u.uStylizeSkyHorizon.value.copy(s.skyHorizon); u.uStylizeGround.value.copy(s.ground); u.uStylizeRoad.value.copy(s.road);
      this.gl.toneMappingExposure = s.exposure;
      this.gl.setClearColor(s.clear, s.clearAlpha);
    }
    this.raceScene.add(this.cars.group);
    this.cars.hide();
    this.cars.setLight(this.deps.raceCarLight());
    const q = this.deps.raceCarQuality();
    if (q) this.cars.setQuality(q);
    this.quality = null;
  }

  /**
   * Sem painel há um tempo (ou com a corrida na tela): devolve o que pegou emprestado e solta os alvos de GPU dos pipelines, que são
   * os grandes (voltam sozinhos no próximo painel). O ambiente (PMREM de 128 px) fica: refazê-lo a cada ida à garagem era o custo
   * dominante da reabertura e ele só sai no `dispose()`.
   */
  idleRelease(): void {
    this.leave();
    this.disposePipes();
  }

  private disposePipes(): void {
    for (const p of this.pipes) p?.dispose();
    this.pipes = [];
    this.pipeQuality = null;
  }

  /** O PMREM do `RoomEnvironment`: o reflexo do verniz e do vidro. Criado na primeira vez que o palco desenha. */
  private ensureEnvironment(): void {
    if (this.envTarget) return;
    const pmrem = new THREE.PMREMGenerator(this.gl);
    const room = new RoomEnvironment();
    this.envTarget = pmrem.fromScene(room, 0.04, 0.1, 100, { size: 128 });
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = BASE.env;
    room.dispose();
    pmrem.dispose();
  }

  // ───────────────────────────── Um quadro ─────────────────────────────

  /**
   * Desenha os painéis vivos (no máximo 4) no canvas de `width × height` px CSS. `time` é o relógio do menu (s). Devolve o que cada painel
   * custou. Chamar só quando não há corrida.
   */
  render(time: number, size: Size, live: readonly LivePanel[]): readonly StagePanelStats[] {
    this.drawn = 0;
    if (this.disposed) return [];
    // Só as janelas que estão (ao menos em parte) dentro do canvas: uma rolada para fora, ou de tamanho zero, não é desenhada.
    const items = live.slice(0, MAX_PANELS).flatMap((lp) => {
      const vp = stageViewport(lp.rect, size.width, size.height);
      return vp ? [{ lp, vp }] : [];
    });
    if (items.length === 0) { this.leave(); return []; } // nada a desenhar: o mundo do menu volta com o que é dele
    this.enter();
    this.ensureEnvironment();
    const dt = this.lastTime < 0 ? 1 / 60 : Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    const n = items.length;
    const q = stageQuality(items[0].lp.panel.quality, n);
    const heroOn = heroEnabled({ quality: q, reduceEffects: items[0].lp.panel.reduceEffects, setting: getRenderPrefs().heroCars });
    if (heroOn) void ensureHeroes(); // V16: os cascos herói só são lidos quando alguém os quer; até chegarem a vitrine mostra o casco de sempre (Cars.setHero adota o lote quando vierem)
    this.cars.setHero(heroOn); // a vitrine usa o casco herói, se ligado (V9)
    if (q !== this.quality) {
      this.quality = q;
      this.cars.setQuality(q);
      this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && !Array.isArray(m)) m.needsUpdate = true; });
    }
    if (this.pipeQuality !== q) { this.disposePipes(); this.pipeQuality = q; }
    const plan = planFor(q, n);
    const gl = this.gl;
    gl.setScissorTest(true);
    gl.setViewport(0, 0, size.width, size.height);
    gl.setScissor(0, 0, size.width, size.height);
    gl.setClearColor(BG, 1);
    gl.clear(true, true, true);
    for (let i = 0; i < n; i++) this.drawPanel(i, items[i].lp, items[i].vp, size, plan, time, dt);
    if (this.slots.size > 2 * MAX_PANELS) {
      const ids = new Set(items.map((p) => p.lp.panel.id));
      for (const id of [...this.slots.keys()]) if (!ids.has(id)) this.slots.delete(id);
    }
    return this.stats.slice(0, this.drawn);
  }

  private slotFor(panel: StagePanel): Slot {
    let s = this.slots.get(panel.id);
    if (!s) {
      s = {
        camera: new THREE.PerspectiveCamera(STAGE_FOV, 16 / 9, 0.1, 80), fresh: true, yaw: Math.PI - 0.6, az: 0, el: 0.2, dist: 9, target: new THREE.Vector3(0, 0.6, 0),
        steer: 0, seenReveal: panel.revealCount, seenWorkshop: panel.workshopCount, revealAt: null, workshopAt: null, ring: new THREE.Color('#ff5a36'), ringKey: '',
      };
      this.slots.set(panel.id, s);
    }
    return s;
  }

  private drawPanel(i: number, lp: LivePanel, vp: Rect, size: Size, plan: PostPlan, time: number, dt: number): void {
    const { panel } = lp;
    const slot = this.slotFor(panel);
    const aspect = vp.w / vp.h;
    const reduce = panel.reduceEffects;
    if (slot.ringKey !== panel.ring) { slot.ringKey = panel.ring; slot.ring.set(panel.ring); }

    // O que a tela pediu desde o último quadro: a revelação e a oficina começam agora.
    // Um painel solto e montado de novo (a tela remontou) volta com a contagem em 0: isso não é um pedido novo.
    if (panel.revealCount > slot.seenReveal) slot.revealAt = time;
    if (panel.workshopCount > slot.seenWorkshop) slot.workshopAt = time;
    slot.seenReveal = panel.revealCount; slot.seenWorkshop = panel.workshopCount;
    let reveal: RevealPlan | null = null;
    if (slot.revealAt !== null) {
      reveal = revealPlan(time - slot.revealAt, reduce);
      if (reveal.done) { slot.revealAt = null; reveal = null; panel.fx?.novo(0); panel.fx?.flash(0); }
    }
    let workshop: WorkshopPlan | null = null;
    if (slot.workshopAt !== null) {
      if (time - slot.workshopAt >= WORKSHOP_SECONDS) slot.workshopAt = null;
      else workshop = workshopPlan(time - slot.workshopAt, reduce);
    }
    if (reveal) { panel.fx?.novo(reveal.novo); panel.fx?.flash(reveal.flash); }

    this.paintStudio(slot, reveal);
    if (panel.kind === 'podium') this.posePodium(panel, slot, aspect, time, dt);
    else this.poseCar(panel, slot, aspect, dt, reveal, workshop, slot.revealAt === null ? 0 : time - slot.revealAt, reduce, time);
    this.poseEffects(panel, slot, reveal, workshop, time);

    const cam = slot.camera;
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    const ce = Math.cos(slot.el);
    cam.position.set(slot.target.x + slot.dist * Math.sin(slot.az) * ce, slot.target.y + slot.dist * Math.sin(slot.el), slot.target.z + slot.dist * Math.cos(slot.az) * ce);
    if (workshop && workshop.shake > 0) cam.position.x += Math.sin(time * 61) * 0.025 * workshop.shake;
    cam.lookAt(slot.target);

    const gl = this.gl;
    gl.setViewport(vp.x, vp.y, vp.w, vp.h);
    gl.setScissor(vp.x, vp.y, vp.w, vp.h);
    const c0 = gl.info.render.calls; const t0 = gl.info.render.triangles;
    const st = this.stats[i];
    if (plan.post) {
      const ps = this.pipelineFor(i, vp.w * size.dpr, vp.h * size.dpr, cam).render({ camera: cam, scale: 1, radial: 0, vignette: 0 }, plan.ao !== null);
      st.targetW = ps.targetW; st.targetH = ps.targetH; st.samples = ps.samples; st.passes = ps.passes; st.postPx = ps.postPx;
    } else {
      gl.render(this.scene, cam);
      st.targetW = Math.max(1, Math.round(vp.w * size.dpr)); st.targetH = Math.max(1, Math.round(vp.h * size.dpr)); st.samples = 0; st.passes = 0; st.postPx = 0;
    }
    st.calls = gl.info.render.calls - c0; st.triangles = gl.info.render.triangles - t0;
    this.drawn = i + 1;
  }

  /** O pipeline de pós da vaga `i` (criado uma vez por degrau, redimensionado em lugar), como o do renderizador da corrida. */
  private pipelineFor(i: number, w: number, h: number, camera: THREE.PerspectiveCamera): ViewportPipeline {
    let pipe = this.pipes[i];
    if (!pipe) {
      const full = planFor(this.pipeQuality ?? 'medium', 1);
      pipe = new ViewportPipeline(this.gl, this.scene, camera, full, full.ao, BLOOM);
      this.pipes[i] = pipe;
    }
    pipe.setSize(w, h);
    return pipe;
  }

  /** O fundo e o anel na cor do assento; a luz abaixa com a revelação e o holofote sobe. */
  private paintStudio(slot: Slot, reveal: RevealPlan | null): void {
    const u = this.dome.material.uniforms;
    (u.uHorizon.value as THREE.Color).copy(slot.ring).multiplyScalar(0.16).lerp(this.paintTmp.set('#171a3a'), 0.55);
    (u.uGlow.value as THREE.Color).copy(slot.ring).lerp(this.paintTmp.set('#ffffff'), 0.15).multiplyScalar(0.45);
    this.ringMat.color.copy(slot.ring).multiplyScalar(1.5);
    const dim = reveal ? reveal.dim : 0;
    this.lights.key.intensity = BASE.key * (1 - 0.8 * dim);
    this.lights.fill.intensity = BASE.fill * (1 - 0.7 * dim);
    this.lights.rim.intensity = BASE.rim * (1 - 0.35 * dim);
    this.scene.environmentIntensity = BASE.env * (1 - 0.65 * dim);
    this.lights.rim.color.set('#ffffff').lerp(slot.ring, 0.3);
  }

  private poseCar(panel: StagePanel, slot: Slot, aspect: number, dt: number, reveal: RevealPlan | null, workshop: WorkshopPlan | null, revealAge: number, reduce: boolean, time = 0): void {
    this.plate.visible = true; this.contact.visible = true; this.podium.visible = false;
    const carId = panel.carId && CARS.some((c) => c.id === panel.carId) ? panel.carId : null;
    if (!carId) { this.cars.poseDisplay([]); this.cover.visible = false; return; }
    const model = this.cars.modelOf(carId);
    const pose = focusPose(model, panel.focus, aspect);
    const k = slot.fresh ? 1 : 1 - Math.exp(-dt * 5);
    slot.fresh = false;
    // "Reduzir efeitos" (T8): o prato não gira; o carro fica parado no ângulo de mostra (o foco de uma peça ainda vira o carro para ela).
    if (pose.yaw === null) slot.yaw += reduce ? 0 : TURN_SPEED * dt;
    else slot.yaw += wrapPi(pose.yaw - slot.yaw) * k;
    slot.az += wrapPi(pose.azimuth - slot.az) * k;
    slot.el += (pose.elevation - slot.el) * k;
    slot.dist += (pose.distance - slot.dist) * k;
    slot.target.x += (pose.target[0] - slot.target.x) * k; slot.target.y += (pose.target[1] - slot.target.y) * k; slot.target.z += (pose.target[2] - slot.target.z) * k;
    // Pneus e freios em foco: as rodas da frente viram um pouco, para mostrar o aro.
    const steerTarget = panel.focus === 'tires' || panel.focus === 'brakes' ? 0.38 : 0;
    slot.steer += (steerTarget - slot.steer) * k;
    // O visual inteiro (T8): acabamento, roda, aro e faixa no casco; com o nitro em foco, a chama acesa na cor escolhida.
    const car: DisplayCar = {
      carId, paint: panel.paint, look: panel.look, x: 0, y: PLATE_TOP, z: 0, yaw: slot.yaw, dip: workshop ? workshop.dip * DIP_METERS : 0, steer: slot.steer,
      flame: panel.focus === 'nitro' ? 1 : 0,
    };
    this.cars.setHeadlights(reveal ? reveal.head : 0);
    this.cars.poseDisplay([car], time, reduce);
    this.poseCover(model, slot, reveal, revealAge, reduce);
    this.contact.rotation.y = slot.yaw;
  }

  /** A capa do carro novo: um casulo de tecido nas medidas do modelo, que sai para trás e some (ou só some, com reduzir efeitos). */
  private poseCover(model: ReturnType<Cars['modelOf']>, slot: Slot, reveal: RevealPlan | null, age: number, reduce: boolean): void {
    const cover = this.cover;
    if (!reveal || reveal.cover >= 1) { cover.visible = false; return; }
    const [front, rear] = model.axles;
    const length = rear.z - front.z + 1.9;
    const width = front.x * 2 + 0.75;
    const height = model.height + 0.12;
    const c = reveal.cover;
    const drop = Math.min(1, Math.max(0, age) / 0.25);
    cover.visible = true;
    cover.scale.set(width * 0.6, height * 0.74, length * 0.6);
    const slide = reduce ? 0 : c;
    cover.position.set(0, PLATE_TOP + height * 0.42 + slide * 1.7 + (1 - drop) * (reduce ? 0 : 2.4), slide * -3.4);
    cover.rotation.set(slide * 0.5, slot.yaw, slide * 0.35, 'YXZ');
    cover.material.opacity = reduce ? 1 - c : 1 - Math.max(0, (c - 0.55) / 0.45);
    cover.material.color.copy(slot.ring).multiplyScalar(0.7).lerp(this.paintTmp.set('#c8432c'), 0.25);
  }

  /** Holofote, feixe, poça de luz, confete e faíscas: tudo guiado pelo plano da revelação e da oficina. */
  private poseEffects(panel: StagePanel, slot: Slot, reveal: RevealPlan | null, workshop: WorkshopPlan | null, time: number): void {
    const spot = reveal ? reveal.spot : 0;
    this.spot.intensity = SPOT_MAX * spot;
    this.cone.visible = spot > 0.01;
    this.cone.material.opacity = 0.14 * spot;
    this.pool.visible = spot > 0.01;
    this.pool.material.opacity = 0.32 * spot;
    // Confete: 120 retângulos lançados no estouro (o `confetti` de `revealPlan` é o relógio dele).
    const t = reveal ? reveal.confetti : -1;
    this.confetti.visible = t >= 0;
    if (t >= 0) {
      const d = this.dummy;
      for (let i = 0; i < CONFETTI_COUNT; i++) {
        const p = confettiPiece(i, t, this.piece);
        const s = p.alive ? p.scale : 0;
        d.position.set(p.x, p.y, p.z);
        d.rotation.set(p.rot, p.rot * 0.7, p.rot * 0.3);
        d.scale.set(s, s, s);
        d.updateMatrix();
        this.confetti.setMatrixAt(i, d.matrix);
      }
      this.confetti.instanceMatrix.needsUpdate = true;
    }
    // Faíscas da oficina: saem da roda dianteira e do capô, sobem em leque e caem.
    const carId = panel.carId && CARS.some((c) => c.id === panel.carId) ? panel.carId : null;
    const on = !!workshop && workshop.sparks > 0 && slot.workshopAt !== null && carId !== null;
    this.sparks.visible = on;
    if (on && workshop && slot.workshopAt !== null && carId) {
      const model = this.cars.modelOf(carId);
      const [front] = model.axles;
      const age = time - slot.workshopAt;
      const pos = this.sparkPositions;
      for (let j = 0; j < SPARKS; j++) {
        const h = (kk: number): number => hash2(j * 5 + kk, 977);
        const wheel = j % 3 < 2;
        const side = j % 2 === 0 ? 1 : -1;
        const local: [number, number, number] = wheel ? [side * front.x, front.r * 0.7, front.z] : [0, model.height * 0.55, front.z * 0.6];
        const o = carToWorld(slot.yaw, local);
        const life = 0.45 + h(0) * 0.4;
        const a = h(1) * Math.PI * 2; const sp = 0.7 + h(2) * 1.5; const up = 1.6 + h(3) * 2.4;
        const alive = age >= 0 && age < life;
        const tt = alive ? age : 0;
        pos[j * 3] = alive ? o[0] + Math.cos(a) * sp * tt : 0;
        pos[j * 3 + 1] = alive ? Math.max(PLATE_TOP, o[1] + up * tt - 0.5 * 7 * tt * tt) : -100;
        pos[j * 3 + 2] = alive ? o[2] + Math.sin(a) * sp * tt : 0;
      }
      this.sparks.geometry.getAttribute('position').needsUpdate = true;
      this.sparks.material.opacity = Math.min(1, workshop.sparks);
    }
  }

  private posePodium(panel: StagePanel, slot: Slot, aspect: number, time: number, dt: number): void {
    this.plate.visible = false; this.contact.visible = false; this.podium.visible = true;
    this.cover.visible = false;
    this.ensurePodiumNumbers();
    const slots: readonly PodiumSlot[] = podiumSlots(3);
    const items: DisplayCar[] = [];
    for (const e of panel.podium) {
      const s = slots.find((x) => x.place === e.place);
      if (s) items.push({ carId: e.carId, paint: e.paint, look: e.look ?? null, x: s.x, y: s.top, z: s.z, yaw: s.yaw });
    }
    this.cars.setHeadlights(0);
    this.cars.poseDisplay(items);
    const k = slot.fresh ? 1 : 1 - Math.exp(-dt * 4);
    slot.fresh = false;
    slot.az += (Math.sin(time * 0.4) * 0.1 - slot.az) * k;
    slot.el += (0.2 - slot.el) * k;
    slot.dist += (fitDistance(aspect, STAGE_FOV, 5.5, 2.1) - slot.dist) * k;
    slot.target.x += (0 - slot.target.x) * k; slot.target.y += (1.15 - slot.target.y) * k; slot.target.z += (0.2 - slot.target.z) * k;
  }

  /** Os números 1, 2 e 3 na frente dos blocos (textura de canvas, criada na primeira vez e solta no `dispose`). */
  private ensurePodiumNumbers(): void {
    if (this.podiumNumbers) return;
    this.podiumNumbers = true;
    for (const s of podiumSlots(3)) {
      const [c, ctx] = canvas2d(128, 128);
      ctx.fillStyle = '#1a1c22'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 96px "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillText(String(s.place), 64, 70);
      const sprite = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: this.own(texture(c)), transparent: true, depthWrite: false })));
      sprite.scale.set(0.9, 0.9, 1);
      sprite.position.set(s.x, s.top * 0.5, s.z + 1.12);
      sprite.name = `stage:number${s.place}`;
      this.podium.add(sprite);
    }
  }

  // ───────────────────────────── Fim ─────────────────────────────

  /** Solta tudo o que o palco criou (carros devolvidos à corrida antes). Pode ser chamado de novo sem efeito. */
  dispose(): void {
    if (this.disposed) return;
    this.leave();
    this.disposed = true;
    this.disposePipes();
    if (this.envTarget) { this.envTarget.dispose(); this.envTarget = null; }
    this.scene.environment = null;
    for (const o of this.owned) o.dispose();
    this.owned.length = 0;
    this.spot.dispose();
    this.confetti.dispose();
    this.scene.clear();
    this.slots.clear();
  }
}

// ───────────────────────────── Geometrias e texturas procedurais ─────────────────────────────

/** Degradê radial em RGBA (branco no centro, preto na borda): a sombra de contato, a poça de luz e a borda do chão. */
function radialTexture(): THREE.DataTexture {
  const N = 64;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot((x + 0.5) / N - 0.5, (y + 0.5) / N - 0.5) * 2;
    const a = Math.max(0, 1 - d);
    const v = Math.round(255 * a * a * (3 - 2 * a));
    const k = (y * N + x) * 4;
    data[k] = v; data[k + 1] = v; data[k + 2] = v; data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

/** O feixe do holofote: um cone aberto (ponta em cima), claro na ponta e apagado na base. */
function beamGeometry(height: number, radius: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(radius, height, 40, 1, true);
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const f = (pos.getY(i) + height / 2) / height; // 1 na ponta, 0 na base
    const v = Math.pow(f, 1.6);
    colors[i * 3] = v; colors[i * 3 + 1] = v * 0.94; colors[i * 3 + 2] = v * 0.78;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** A capa: uma esfera com dobras de tecido (ondulação por `hash2`, igual a cada abertura), de normais suaves (vértices soldados). */
function coverGeometry(): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 3);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
    const fold = 1 + 0.035 * Math.sin(Math.atan2(z, x) * 9 + y * 3) + 0.018 * (hash2(Math.round(x * 6), Math.round(z * 6)) - 0.5);
    pos.setXYZ(i, x * fold, Math.max(y, -0.45) * fold, z * fold);
  }
  g.computeVertexNormals();
  return g;
}
