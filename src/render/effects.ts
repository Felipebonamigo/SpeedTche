// Efeitos: partículas em coordenadas de pista (z ao longo, x lateral, h altura) — assim a
// mesma partícula aparece certa em todos os viewports, cada um a localizando pelo seu
// RoadFrame. Pools com buffers reutilizados; poeira na grama, fumaça de freio e da derrapagem
// (pontos), e as faíscas ESTICADAS (rodas nas 3 cores, batida, raspão, escape do nitro) num lote
// de traços de uma chamada só (fx/streaks.ts). Também o chacoalho de câmera por assento, com decaimento.
// M5: cada efeito respeita `reduceEffects` e o degrau de qualidade (fx/plan.ts); as bordas do
// estado (largada, nitro, batida, impulso) vêm de fx/cues.ts, que não perde a batida num quadro
// de tela que cobre vários ticks.
// V8 (docs/ondas/V8-efeitos.md): a batida é realista por padrão — faíscas metálicas curtas, lascas e um flash no PONTO DE CONTATO (fx/impact.ts) e
// um tranco curto de câmera; o "POW!" e o leque de faíscas de quadrinho só com a opção "Efeitos de cartum" (`options.cartoonEffects`).
import * as THREE from 'three';
import { TICK_RATE } from '../core/constants';
import { wrappedDelta } from '../core/sim/collisions';
import { computeModifiers } from '../core/sim/coop';
import { driftLevel } from '../core/sim/physics';
import type { RaceState, Track } from '../core/types';
import type { RenderFrame } from '../game/contracts';
import { createScrapeMemory, observeScrapes } from '../game/race-feel';
import { newCueMemory, observeCues, type FxCue } from './fx/cues';
import { fxPlan, type FxPlan } from './fx/plan';
import { emitBrakeSmoke, emitGrassDust, emitRoadDust, emitTireSmoke, type PuffCar, type PuffSpec, type Trail } from './fx/smoke';
import { ambientMote, puffAtlas, SPRITE_PX, type Mote } from './fx/sprite';
import { emitBoostSparks, emitExhaustFire, emitHitSparks, emitNitroTrail, emitWheelSparks, SparkPool, type SparkCar, type SparkSpec } from './fx/sparks';
import { Streaks } from './fx/streaks';
import { contactPoint, emitImpact, type Contact } from './fx/impact';
import { Pows, powSize } from './fx/pow';
import { Shockwaves } from './fx/shockwave';
import { cornerStreak, draftLine, lineCount, speedLine, speedLineStrength, type LineSpec } from './fx/lines';
import { markStrength, TireMarks, type MarkCarState } from './fx/marks';
import { hash2 } from './noise';
import type { Palette } from './palette';
import { scrapeSparks } from './scrape-sparks';
import { locateOnFrame, type FramePoint, type RoadFrame } from './roadframe';

const VERT = /* glsl */ `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor; attribute vec2 aSpr;
uniform float uScale; uniform float uNearFade; uniform float uSpriteK;
varying float vAlpha; varying vec3 vColor; varying vec2 vSpr;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // uNearFade > 0 (as bolhas): perto da câmera a partícula para de crescer (profundidade mínima de 3 m) e apaga — a fumaça que passa rente à lente não vira um disco do tamanho da tela.
  float depth = uNearFade > 0.0 ? max(3.0, -mv.z) : max(0.5, -mv.z);
  // aSpr.x = quadro do sprite (0..3), −1 = lasca dura, −2 = partícula ambiente; aSpr.y = rotação (rad). A nuvem enche ~60% do quadrado do ponto: uSpriteK o compensa.
  gl_PointSize = aSize * uScale / depth * (aSpr.x >= 0.0 ? uSpriteK : 1.0);
  gl_Position = projectionMatrix * mv;
  vAlpha = aAlpha * (uNearFade > 0.0 ? smoothstep(uNearFade * 0.3, uNearFade, -mv.z) : 1.0); vColor = aColor; vSpr = aSpr;
}`;

const FRAG = /* glsl */ `
varying float vAlpha; varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.12, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Fragmento da poeira e da fumaça (V22 F8: era a BOLHA do M5, um disco com contorno escuro, brilho de lado e borda nítida). Três coisas, pelo quadro `vSpr.x`:
 *   ≥ 0  a NUVEM: o quadro do atlas, girado por `vSpr.y`; a luz vem do alto à esquerda da TELA (a diferença do relevo, canal G, em dois pontos na direção do sol: o lado do
 *        lóbulo que olha para a luz clareia, o oposto escurece — a luz não gira com a partícula), a base um pouco mais escura; e ela se desfaz pela BORDA (o ruído do canal R é o limiar
 *        que sobe conforme o alfa cai: fiapos, não um disco que só esmaece). Sem contorno.
 *   −1   a LASCA da batida: o disco duro de antes (borda nítida, contorno escuro, brilho).
 *   −2   a partícula ambiente: um ponto macio.
 */
const FRAG_BUBBLE = /* glsl */ `
// bolha (nuvem de sprite)
uniform sampler2D uSprite;
varying float vAlpha; varying vec3 vColor; varying vec2 vSpr;
vec4 cloudAt(vec2 c, float s, float k) {
  vec2 p = vec2(k * c.x + s * c.y, -s * c.x + k * c.y);
  float fi = floor(vSpr.x + 0.5);
  vec2 f = vec2(mod(fi, 2.0), floor(fi * 0.5));
  return texture2D(uSprite, (f + clamp(p * 0.5 + 0.5, 0.004, 0.996)) * 0.5);
}
void main() {
  vec2 p = (gl_PointCoord - 0.5) * 2.0;
  float d = length(p);
  if (vSpr.x < -1.5) {
    float a = (1.0 - smoothstep(0.3, 1.0, d)) * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor, a);
  } else if (vSpr.x < 0.0) {
    float edge = 1.0 - smoothstep(0.86, 1.0, d);
    if (edge < 0.01) discard;
    float rim = smoothstep(0.7, 0.93, d);
    float shade = mix(0.7, 1.12, clamp(0.5 + 0.5 * dot(p, vec2(-0.45, 0.89)), 0.0, 1.0));
    float glint = smoothstep(0.45, 0.0, length(p - vec2(-0.34, 0.4)));
    vec3 col = vColor * shade;
    col = mix(col, vColor * vec3(0.34, 0.37, 0.46), rim * 0.65) + glint * 0.2;
    gl_FragColor = vec4(col, vAlpha * edge);
  } else {
    if (d > 1.0) discard;
    float s = sin(vSpr.y); float k = cos(vSpr.y);
    vec4 t = cloudAt(p, s, k);
    float life = clamp(vAlpha / 0.88, 0.0, 1.0);
    float thr = (1.0 - life) * 0.8;
    float body = t.a * mix(0.62, 1.0, t.r);
    float a = smoothstep(thr, thr + 0.3, body) * min(1.0, life * 2.2) * 0.8;
    if (a < 0.01) discard;
    float lit = t.g - cloudAt(p + vec2(-0.14, -0.3), s, k).g;
    float shade = clamp(0.86 + 1.5 * lit, 0.55, 1.14) * (1.0 - 0.16 * clamp(p.y * 0.5 + 0.5, 0.0, 1.0)) * (0.94 + 0.12 * t.r);
    gl_FragColor = vec4(vColor * shade, a);
  }
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Pool de partículas em coordenadas de pista. */
class Pool {
  readonly points: THREE.Points;
  private readonly z: Float32Array; private readonly x: Float32Array; private readonly h: Float32Array;
  private readonly vz: Float32Array; private readonly vx: Float32Array; private readonly vh: Float32Array;
  private readonly life: Float32Array; private readonly maxLife: Float32Array; private readonly size: Float32Array;
  private readonly grow: Float32Array; private readonly gravity: Float32Array;
  /** V22 F8: quadro do sprite (0..3; −1 = lasca dura), rotação inicial e giro (rad/s) de cada partícula. */
  private readonly frame: Float32Array; private readonly rot: Float32Array; private readonly spin: Float32Array;
  private readonly r: Float32Array; private readonly g: Float32Array; private readonly b: Float32Array;
  private readonly position: THREE.BufferAttribute;
  private readonly aSize: THREE.BufferAttribute;
  private readonly aAlpha: THREE.BufferAttribute;
  private readonly aColor: THREE.BufferAttribute;
  private readonly aSpr: THREE.BufferAttribute;
  private readonly material: THREE.ShaderMaterial;
  private next = 0;
  private spawned = 0;
  private readonly atlas: THREE.DataTexture;
  private readonly pt: FramePoint = { x: 0, y: 0, z: 0, heading: 0 };

  constructor(readonly max: number, additive: boolean, private readonly bubble = false) {
    const f = () => new Float32Array(max);
    this.z = f(); this.x = f(); this.h = f(); this.vz = f(); this.vx = f(); this.vh = f();
    this.life = f(); this.maxLife = f(); this.size = f(); this.grow = f(); this.gravity = f(); this.r = f(); this.g = f(); this.b = f();
    this.frame = f(); this.rot = f(); this.spin = f();
    const geo = new THREE.BufferGeometry();
    this.position = new THREE.BufferAttribute(new Float32Array(max * 3), 3); this.position.setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1); this.aSize.setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(new Float32Array(max), 1); this.aAlpha.setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.BufferAttribute(new Float32Array(max * 3), 3); this.aColor.setUsage(THREE.DynamicDrawUsage);
    this.aSpr = new THREE.BufferAttribute(new Float32Array(max * 2), 2); this.aSpr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.position); geo.setAttribute('aSize', this.aSize); geo.setAttribute('aAlpha', this.aAlpha); geo.setAttribute('aColor', this.aColor); geo.setAttribute('aSpr', this.aSpr);
    geo.setDrawRange(0, 0);
    // O atlas do sprite (256 × 256 RGBA, pintado uma vez na carga; só o pool de poeira o usa).
    const atlas = new THREE.DataTexture(puffAtlas(), SPRITE_PX, SPRITE_PX, THREE.RGBAFormat, THREE.UnsignedByteType);
    atlas.minFilter = THREE.LinearFilter; atlas.magFilter = THREE.LinearFilter; atlas.generateMipmaps = false; atlas.needsUpdate = true;
    this.atlas = atlas;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: bubble ? FRAG_BUBBLE : FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 400 }, uNearFade: { value: bubble ? 5 : 0 }, uSprite: { value: atlas }, uSpriteK: { value: 1.9 } },
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    if (bubble) this.points.name = 'fx-dust';
  }

  emit(z: number, x: number, h: number, vz: number, vx: number, vh: number, life: number, size: number, grow: number, gravity: number, r: number, g: number, b: number, frame = -3, rot = 0, spin = 0): void {
    const i = this.next; this.next = (this.next + 1) % this.max;
    // Quem não diz o quadro e a rotação (emissor de antes) ganha os seus por hash do contador: nunca duas iguais em fila.
    this.spawned++;
    this.frame[i] = frame === -3 ? Math.floor(hash2(this.spawned, 91) * 4) : frame;
    this.rot[i] = rot !== 0 ? rot : 0.1 + hash2(this.spawned, 92) * 6; this.spin[i] = spin !== 0 ? spin : (hash2(this.spawned, 93) - 0.5) * 2.4;
    this.z[i] = z; this.x[i] = x; this.h[i] = h; this.vz[i] = vz; this.vx[i] = vx; this.vh[i] = vh;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.grow[i] = grow; this.gravity[i] = gravity;
    this.r[i] = r; this.g[i] = g; this.b[i] = b;
  }

  emitSpec(s: PuffSpec): void {
    this.emit(s.z, s.x, s.h, s.vz, s.vx, s.vh, s.life, s.size, s.grow, s.gravity, s.r, s.g, s.b, s.frame, s.rot, s.spin);
  }

  /** Quantas partículas estão vivas. */
  alive(): number { let n = 0; for (let i = 0; i < this.max; i++) if (this.life[i] > 0) n++; return n; }

  step(dt: number): void {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.z[i] += this.vz[i] * dt; this.x[i] += this.vx[i] * dt;
      this.vh[i] -= this.gravity[i] * dt;
      this.h[i] += this.vh[i] * dt;
      if (this.h[i] < 0.02) { this.h[i] = 0.02; this.vh[i] = Math.abs(this.vh[i]) * 0.3; }
      this.vz[i] *= 1 - 1.2 * dt; this.vx[i] *= 1 - 1.2 * dt;
    }
  }

  clear(): void { this.life.fill(0); this.points.geometry.setDrawRange(0, 0); }

  /**
   * Escreve os buffers no referencial do viewport; `scale` = altura em px / (2·tan(fov/2)). `ambient` (V22 F8): as partículas ambientes deste viewport, escritas nas vagas
   * que sobram depois das vivas (o pool nunca passa do seu teto): quem as pede diz quantas, onde está o carro e a cor.
   */
  pose(rf: RoadFrame, track: Track, scale: number, ambient?: AmbientPose): void {
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      if (!locateOnFrame(rf, track, this.z[i], this.x[i], this.pt)) continue;
      const t = this.life[i] / this.maxLife[i];
      this.position.setXYZ(n, this.pt.x, this.pt.y + this.h[i], this.pt.z);
      this.aSize.setX(n, this.size[i] + this.grow[i] * (1 - t));
      this.aAlpha.setX(n, this.bubble ? Math.min(1, t * 3) * 0.88 : Math.min(1, t * 2.5) * (0.25 + 0.55 * t));
      this.aColor.setXYZ(n, this.r[i], this.g[i], this.b[i]);
      this.aSpr.setXY(n, this.frame[i], this.rot[i] + this.spin[i] * (this.maxLife[i] - this.life[i]));
      n++;
    }
    if (ambient && this.bubble) {
      for (let k = 0; k < ambient.count && n < this.max; k++) {
        ambientMote(k, ambient.time, ambient.z, ambient.x, MOTE);
        if (MOTE.alpha < 0.004 || !locateOnFrame(rf, track, MOTE.z, MOTE.x, this.pt)) continue;
        this.position.setXYZ(n, this.pt.x, this.pt.y + MOTE.h, this.pt.z);
        this.aSize.setX(n, MOTE.size);
        this.aAlpha.setX(n, MOTE.alpha);
        this.aColor.setXYZ(n, ambient.r, ambient.g, ambient.b);
        this.aSpr.setXY(n, -2, 0);
        n++;
      }
    }
    this.points.geometry.setDrawRange(0, n);
    this.points.visible = n > 0;
    if (n > 0) { this.position.needsUpdate = true; this.aSize.needsUpdate = true; this.aAlpha.needsUpdate = true; this.aColor.needsUpdate = true; this.aSpr.needsUpdate = true; }
    this.material.uniforms.uScale.value = scale;
  }

  dispose(): void { this.points.geometry.dispose(); this.material.dispose(); this.atlas.dispose(); }
}

/** As partículas ambientes de um viewport (V22 F8): quantas, o carro (z em unidades, x em meias larguras), o relógio (s) e a cor. */
interface AmbientPose { count: number; z: number; x: number; time: number; r: number; g: number; b: number }
const MOTE: Mote = { z: 0, x: 0, h: 0, size: 0, alpha: 0 };

/** Teto de pontos do anel das marcas de pneu (o do Ultra, `fxPlan`); o degrau escolhe quantos usa. */
const MARKS_MAX = 2048;
/** A que distância (unidades de pista) de um viewport uma batida ainda ganha o quadrinho POW: 8.000 = 160 m. */
const NEAR_VIEWER = 8000;
/** O POW fica 0,4 m (20 unidades) à frente do centro do carro que bateu, e vai com ele. */
const POW_AHEAD = 20;
/** O halo do nitro nasce 1,4 m (70 unidades) atrás do centro do carro, no escape, e vai com ele. */
const HALO_BEHIND = 70;
/**
 * Decaimento (1/s) do tranco de câmera da batida: em 0,3 s fica abaixo de 10% — um tranco, não um tremor (V8; era 4,5: ~0,5 s balançando).
 * A amplitude e o desenho do movimento são os da M5 (`shake`).
 */
const SHAKE_DECAY = 8;
/** Duas batidas a menos que isto (unidades de pista; 1 m) no mesmo quadro são a mesma: os dois carros da batida em fila dão UMA rajada. */
const SAME_CONTACT = 50;

/** O que cada viewport guarda entre quadros para as linhas: intensidades suavizadas e a posição do carro dele. */
interface ViewFx { lineS: number; draftI: number; z: number; x: number; travel: number; speedMs: number; time: number }

export interface Shake { x: number; y: number; roll: number }

export class Effects {
  readonly group = new THREE.Group();
  private readonly dust = new Pool(900, false, true);
  /** Faíscas esticadas: o pool anda em coordenada de pista e cada viewport as escreve no lote de traços. */
  private readonly sparks = new SparkPool(700);
  readonly streaks = new Streaks(900);
  /** Marcas de pneu: o buffer é em coordenada de pista (teto por degrau) e cada viewport o reprojeta. */
  private readonly marks = new TireMarks(MARKS_MAX);
  private readonly waves = new Shockwaves();
  private readonly pows = new Pows();
  private readonly markCar: MarkCarState = { z: 0, x: 0, speed: 0, driftDir: 0, driftTicks: 0, driftCharge: 0, collisionCooldown: 0, launch: 0 };
  private markClock = 0;
  private plan: FxPlan = fxPlan('high', false);
  private readonly views: ViewFx[] = [0, 1, 2, 3].map(() => ({ lineS: 0, draftI: 0, z: 0, x: 0, travel: 0, speedMs: 0, time: 0 }));
  private readonly spec: LineSpec = { dz: 0, tail: 0, lat: 0, h: 0, width: 0, r: 0, g: 0, b: 0, a: 0 };
  private readonly cues: FxCue[] = [];
  private readonly cueMemory = newCueMemory();
  private readonly sparkCar: SparkCar = { z: 0, x: 0, speed: 0, driftDir: 0, driftTicks: 0 };
  private readonly emitSpark = (s: SparkSpec): void => this.sparks.emit(s);
  private readonly emitPuff = (s: PuffSpec): void => this.dust.emitSpec(s);
  /** O ponto de contato da batida (fx/impact.ts) e os já usados neste quadro (z, x), para não soltar duas rajadas no mesmo lugar. */
  private readonly contact: Contact = { z: 0, x: 0, h: 0, partner: -1 };
  private readonly contactsZ = new Float32Array(8);
  private readonly contactsX = new Float32Array(8);
  private contactsN = 0;
  private readonly puffCar: PuffCar = { z: 0, x: 0, speed: 0, driftDir: 0, driftTicks: 0, driftCharge: 0, skidTicks: 0 };
  private readonly dustRgb: [number, number, number] = [0.54, 0.48, 0.35];
  /** V22 F8: a poeira da própria estrada de terra (cor da pista, mais clara), o quanto a pista é terra (`roadEarth`), a taxa da trilha deste quadro e a cor das partículas ambientes. */
  private readonly roadRgb: [number, number, number] = [0.5, 0.36, 0.26];
  private readonly roadColor = new THREE.Color('#a07050');
  private roadEarth = 0;
  private readonly trail: Trail = { dt: 1 / 60, rate: 100 };
  private readonly moteRgb: [number, number, number] = [1, 0.96, 0.85];
  private readonly ambientPose = { count: 0, z: 0, x: 0, time: 0, r: 1, g: 1, b: 1 };
  private readonly prevSpeed = new Float32Array(20);
  private readonly shakeAmp = new Float32Array(4);
  private readonly dustColor = new THREE.Color('#8a7a5a');
  private readonly scrapeMemory = createScrapeMemory();
  private lastTime = -1;
  private seed = 0;

  constructor() { this.group.add(this.marks.mesh, this.waves.mesh, this.waves.haloMesh, this.dust.points, this.streaks.mesh, this.pows.mesh); }

  /** Poeira da cor do chão que o carro levanta: a faixa de terra/areia/cascalho da beira. */
  setPalette(p: Palette): void {
    this.dustColor.set(p.verge).lerp(new THREE.Color(p.shoulder), 0.4).multiplyScalar(p.light < 0.5 ? 0.7 : 0.92);
    // V22 F8: a poeira da estrada de terra leva a cor da pista, um pouco puxada para o acostamento e mais clara (poeira no ar pega luz; sem branco: virava fumaça cinza sobre a terra vermelha na 1ª captura); as partículas
    // ambientes, um branco quente de dia que escurece e esfria com a luz do período (à noite, normal sobre o escuro, não vira estrela).
    this.roadColor.set(p.roadBase).lerp(new THREE.Color('#e2b88a'), 0.5).multiplyScalar(p.light < 0.5 ? 0.62 : 1);
    this.roadEarth = p.roadEarth;
    const lt = Math.min(1, Math.max(0, (p.light - 0.3) / 0.6));
    this.moteRgb[0] = (0.34 + 0.66 * lt) * (1 - 0.1 * (1 - lt)); this.moteRgb[1] = (0.34 + 0.66 * lt) * (0.96 - 0.06 * (1 - lt)); this.moteRgb[2] = (0.4 + 0.6 * lt) * (0.85 + 0.15 * (1 - lt));
    // Cor-brilho: as linhas brancas (velocidade e túnel do vácuo) são aditivas; com o mesmo brilho sobre a cena da noite, 10× mais escura, viravam
    // barras de farol ao lado dos carros (Sampa). Caem com a luz do período. V8: 1 de dia e 0,33 no entardecer e à noite (eram ~0,76 e 0,45: no
    // entardecer, o de limiar de bloom mais baixo, 1,6, elas brilhavam); contínuo entre os dois (a corrida que muda chama isto com a luz ao vivo).
    const t = Math.min(1, Math.max(0, (p.light - 0.7) / 0.25));
    this.lineGain = 0.33 + 0.67 * t * t * (3 - 2 * t);
    // V10: os riscos largos de canto são o efeito de velocidade principal; caem menos que os fios (0,6 no entardecer e à noite) e o `Effects` do viewport os
    // acende só abaixo do limiar do bloom do entardecer (alfa ≤ 0,6 × cor ≤ 1,08 não passa de 0,65 somado).
    this.cornerGain = 0.6 + 0.4 * t * t * (3 - 2 * t);
  }

  /** Brilho das linhas de velocidade e do túnel pelo período (`setPalette`). */
  private lineGain = 1;
  /** Brilho dos riscos largos de canto pelo período (V10). */
  private cornerGain = 1;
  /** "Efeitos de cartum" do último quadro (os riscos de canto ficam mais largos). */
  private cartoon = false;

  private rnd(): number { this.seed++; return hash2(this.seed, 77); }

  private puffCarOf(c: PuffCar): PuffCar {
    const o = this.puffCar;
    o.z = c.z; o.x = c.x; o.speed = c.speed; o.driftDir = c.driftDir; o.driftTicks = c.driftTicks; o.driftCharge = c.driftCharge; o.skidTicks = c.skidTicks;
    return o;
  }

  private sparkCarOf(c: { z: number; x: number; speed: number; driftDir: number; driftTicks: number }): SparkCar {
    const o = this.sparkCar;
    o.z = c.z; o.x = c.x; o.speed = c.speed; o.driftDir = c.driftDir; o.driftTicks = c.driftTicks;
    return o;
  }

  /** O ponto `z` está a menos de `NEAR_VIEWER` unidades (160 m) de algum viewport? Batida de rival lá longe não ganha quadrinho. */
  private nearViewer(frame: RenderFrame, z: number): boolean {
    for (const vp of frame.viewports) {
      const v = frame.state.cars[vp.carIndex];
      if (v && Math.abs(wrappedDelta(z, v.z, frame.track.length)) < NEAR_VIEWER) return true;
    }
    return false;
  }

  /** Emissores + física, uma vez por quadro. */
  update(frame: RenderFrame): void {
    const dt = this.lastTime < 0 ? 1 / 60 : Math.min(0.1, Math.max(0, frame.time - this.lastTime));
    this.lastTime = frame.time;
    if (frame.paused) return;
    const state: RaceState = frame.state;
    const reduce = frame.options.reduceEffects === true;
    const plan = fxPlan(frame.options.quality, reduce, frame.viewports.length, frame.options.cartoonEffects === true);
    this.plan = plan;
    this.cartoon = frame.options.cartoonEffects === true;
    this.marks.buffer.setTrackLength(frame.track.length);
    this.marks.buffer.setCapacity(plan.marks);
    this.markClock += dt;
    this.dustRgb[0] = this.dustColor.r; this.dustRgb[1] = this.dustColor.g; this.dustRgb[2] = this.dustColor.b;
    this.roadRgb[0] = this.roadColor.r; this.roadRgb[1] = this.roadColor.g; this.roadRgb[2] = this.roadColor.b;
    this.trail.dt = dt;
    const rnd = () => this.rnd();
    for (let i = 0; i < state.cars.length && i < 20; i++) {
      const c = state.cars[i];
      // Poeira na grama, fumaça da freada forte e fumaça do pneu na derrapagem: bolhas.
      const pc = this.puffCarOf(c);
      // V22 F8: poeira em TRILHA (uma nuvem por metro andado, taxa do degrau): a do chão fora do asfalto e a da própria estrada de terra. Só de quem está a menos de
      // 160 m de algum viewport (rival lá longe levantaria poeira que ninguém vê e tomaria vagas do pool); rival perto solta metade.
      if (this.nearViewer(frame, c.z)) {
        this.trail.rate = plan.trail * (c.seat >= 0 ? 1 : 0.5);
        emitGrassDust(pc, this.dustRgb, plan.smoke, rnd, this.emitPuff, plan.dustScale, this.trail);
        emitRoadDust(pc, this.roadRgb, this.roadEarth, plan.smoke, rnd, this.emitPuff, plan.dustScale, this.trail);
      }
      const acceleration = (c.speed - this.prevSpeed[i]) / dt; // unidades/s²: a aceleração deste quadro (o `prevSpeed` é trocado mais abaixo)
      emitBrakeSmoke(pc, (this.prevSpeed[i] - c.speed) / dt, c.stats.brake, c.collisionCooldown, plan.smoke, rnd, this.emitPuff);
      if (state.phase !== 'countdown') emitTireSmoke(pc, dt, plan.smoke, rnd, this.emitPuff);
      // Marca de pneu nas duas rodas traseiras (derrapagem, freada forte, arranque da largada-foguete).
      const mc = this.markCar;
      mc.z = c.z; mc.x = c.x; mc.speed = c.speed; mc.driftDir = c.driftDir; mc.driftTicks = c.driftTicks; mc.driftCharge = c.driftCharge; mc.collisionCooldown = c.collisionCooldown; mc.launch = c.launch;
      const strength = state.phase === 'countdown' ? 0 : markStrength(mc, (this.prevSpeed[i] - c.speed) / dt, c.stats.brake, (state.tick - state.startTick) / TICK_RATE);
      for (let w = 0; w < 2; w++) {
        if (strength > 0) this.marks.buffer.push(i * 2 + w, c.z - 67, c.x + (w === 0 ? -0.112 : 0.112), strength, this.markClock);
        else this.marks.buffer.breakStrip(i * 2 + w);
      }
      this.prevSpeed[i] = c.speed;
      this.pows.follow(c.id, c.z + POW_AHEAD, c.x);
      this.waves.follow(c.id, c.z - HALO_BEHIND, c.x);
      // Faíscas das rodas na derrapagem, na cor da carga (azul, laranja, roxa).
      if (plan.wheelSparks && state.phase !== 'countdown') emitWheelSparks(this.sparkCarOf(c), driftLevel(c.driftCharge), dt, plan.sparks, rnd, this.emitSpark);
      // Rastro do nitro: traços curtos e discretos (a chama em si é a malha de cars.ts).
      if (c.nitroTicks > 0 && state.phase === 'racing') emitNitroTrail(this.sparkCarOf(c), plan.sparks, rnd, this.emitSpark);
      // V10 (HC2): os jatos de fogo dos escapes de quem joga (rival não: 19 carros tomariam o lote de traços): no nitro, e nos estouros da aceleração (carro
      // ganhando ≥ 6% da máxima por segundo, abaixo de 92% dela, sem derrapar).
      if (c.seat >= 0 && state.phase === 'racing' && plan.exhaustFire > 0) {
        const top = c.stats.topSpeed;
        const mode = c.nitroTicks > 0 ? 'nitro' : acceleration >= 0.06 * top && c.speed < 0.92 * top && c.driftTicks <= 0 ? 'accel' : null;
        if (mode) emitExhaustFire(this.sparkCarOf(c), mode, dt, plan.exhaustFire, rnd, this.emitSpark);
      }
    }
    // Bordas do estado (fx/cues.ts): a batida e o impulso da derrapagem.
    this.contactsN = 0;
    for (const cue of observeCues(this.cueMemory, state, this.cues)) {
      const c = state.cars[cue.car]?.id === cue.car ? state.cars[cue.car] : state.cars.find((o) => o.id === cue.car);
      if (!c) continue;
      if (cue.kind === 'go' && plan.shockwave) {
        this.waves.spawn(cue.perfect ? 'perfect' : 'ground', c.z, c.x, 0.05);
      } else if (cue.kind === 'nitro' && plan.shockwave) {
        // O halo é do carro de quem joga: o dos rivais (até 19) tomaria as 8 vagas dos anéis que se veem.
        if (c.seat >= 0) this.waves.spawn('halo', c.z - HALO_BEHIND, c.x, 0.55, c.id);
      } else if (cue.kind === 'hit') {
        if (plan.pow) {
          // "Efeitos de cartum": o quadrinho e o leque de faíscas de antes, em volta do carro.
          if (this.nearViewer(frame, c.z)) this.pows.spawn(c.z + POW_AHEAD, c.x, 1.5, powSize(cue.drop), (rnd() - 0.5) * 0.5, c.id);
          emitHitSparks(this.sparkCarOf(c), cue.drop, plan.sparks, rnd, this.emitSpark);
        } else if (plan.sparks > 0) {
          // Realista: faíscas, lascas e flash no ponto de contato — uma rajada por batida (os dois carros da batida em fila dão o mesmo ponto).
          const at = contactPoint(c, state.cars, frame.track.length, this.contact);
          if (this.freshContact(at, frame.track.length)) emitImpact(at, c.speed, cue.drop, plan.sparks, rnd, this.emitSpark, this.emitPuff);
        }
        if (c.seat >= 0 && c.seat < 4) this.shakeAmp[c.seat] = Math.min(1, this.shakeAmp[c.seat] + 0.6 + 0.4 * (c.speed / c.stats.topSpeed));
      } else if (cue.kind === 'boost') {
        emitBoostSparks(this.sparkCarOf(c), cue.level, plan.sparks, rnd, this.emitSpark);
      }
    }
    // Raspão de lado (L5): rajada de faíscas no vão entre os carros.
    for (const cue of observeScrapes(this.scrapeMemory, state)) {
      const a = state.cars.find((c) => c.id === cue.a); const b = state.cars.find((c) => c.id === cue.b);
      if (!a || !b) continue;
      const slow = Math.min(a.speed, b.speed);
      for (const s of scrapeSparks(cue, a, b, rnd, reduce)) {
        if (plan.sparks < 1 && this.rnd() > plan.sparks) continue;
        this.sparks.emit({ z: s.z, x: s.x, h: s.y, vz: s.vz, vx: s.vx, vh: s.vy, svz: s.vz - slow, svx: s.vx, svh: s.vy, life: s.life, width: 0.05, gravity: 9, r: 2.2, g: 1.5, b: 0.5 });
      }
    }
    // Linhas de velocidade e túnel do vácuo: a intensidade de cada viewport sobe e desce com suavidade (nada de piscar ao cruzar 85%).
    for (let v = 0; v < 4; v++) {
      const view = this.views[v];
      const car = v < frame.viewports.length ? state.cars[frame.viewports[v].carIndex] : undefined;
      if (!car) { view.lineS = 0; view.draftI = 0; continue; }
      const live = state.phase !== 'countdown';
      const top = car.stats.topSpeed;
      const lineT = live && plan.speedLines > 0 ? speedLineStrength(top > 0 ? car.speed / top : 0, car.nitroTicks > 0) : 0;
      view.lineS += (lineT - view.lineS) * (1 - Math.exp(-dt * 5));
      if (lineT === 0 && view.lineS < 0.02) view.lineS = 0;
      const draftT = live && plan.draftLines > 0 && !car.finished && computeModifiers(state, frame.track, car).draft ? 1 : 0;
      view.draftI += (draftT - view.draftI) * (1 - Math.exp(-dt * 6));
      if (draftT === 0 && view.draftI < 0.02) view.draftI = 0;
      view.z = car.z; view.x = car.x; view.travel = car.progress * 0.02; view.speedMs = car.speed * 0.02; view.time = frame.time;
    }
    this.dust.step(dt);
    this.sparks.step(dt);
    this.waves.step(dt);
    this.pows.step(dt);
    for (let s = 0; s < 4; s++) this.shakeAmp[s] *= Math.exp(-SHAKE_DECAY * dt);
  }

  /** O ponto `at` ainda não soltou rajada neste quadro? (Guarda-o, se não.) */
  private freshContact(at: Contact, trackLength: number): boolean {
    for (let i = 0; i < this.contactsN; i++) {
      if (Math.abs(wrappedDelta(at.z, this.contactsZ[i], trackLength)) < SAME_CONTACT && Math.abs(at.x - this.contactsX[i]) * 7 < 1) return false;
    }
    if (this.contactsN < this.contactsZ.length) { this.contactsZ[this.contactsN] = at.z; this.contactsX[this.contactsN] = at.x; this.contactsN++; }
    return true;
  }

  /** `viewport` = o índice do viewport desta pose (as linhas de velocidade e o túnel são de quem corre nele). */
  pose(rf: RoadFrame, track: Track, scale: number, viewport = 0): void {
    const v = this.views[viewport];
    const amb = this.ambientPose;
    amb.count = v && v.time > 0 ? this.plan.ambient : 0;
    if (amb.count > 0) { amb.z = v.z; amb.x = v.x; amb.time = v.time; amb.r = this.moteRgb[0]; amb.g = this.moteRgb[1]; amb.b = this.moteRgb[2]; }
    this.dust.pose(rf, track, scale, amb.count > 0 ? amb : undefined);
    const st = this.streaks;
    st.begin();
    this.sparks.pose(rf, track, st);
    this.poseLines(rf, track, st, viewport);
    st.end();
    this.marks.pose(rf, track, this.markClock);
    this.waves.pose(rf, track);
    this.pows.pose(rf, track);
  }

  /** Contagens vivas (relatório e testes): bolhas, faíscas e traços escritos na última pose. */
  counts(): { puffs: number; sparks: number; streaks: number; marks: number; waves: number; pows: number } {
    return { puffs: this.dust.alive(), sparks: this.sparks.alive(), streaks: this.streaks.count, marks: this.marks.buffer.count(), waves: this.waves.alive(), pows: this.pows.alive() };
  }

  clear(): void {
    this.dust.clear(); this.sparks.clear(); this.shakeAmp.fill(0); this.lastTime = -1; this.cueMemory.tick = -1;
    this.streaks.begin(); this.streaks.end();
    this.marks.buffer.clear(); this.marks.mesh.visible = false;
    this.waves.clear(); this.pows.clear();
    for (const v of this.views) { v.lineS = 0; v.draftI = 0; }
  }

  /** As linhas de velocidade e o túnel do vácuo do viewport, no lote de traços (coordenada de pista em volta do carro dele). */
  private poseLines(rf: RoadFrame, track: Track, st: Streaks, viewport: number): void {
    const v = this.views[viewport];
    if (!v || (v.lineS === 0 && v.draftI === 0)) return;
    const s = this.spec;
    const nSpeed = lineCount(this.plan.speedLines, v.lineS);
    for (let k = 0; k < nSpeed; k++) if (speedLine(k, nSpeed, v.travel, v.speedMs, v.lineS, s)) this.addLine(rf, track, st, v, s);
    // V10 (HC2): os riscos largos dos cantos, na mesma passada (a mesma intensidade suavizada, o brilho do período em `cornerGain`).
    const nCorner = lineCount(this.plan.cornerStreaks, v.lineS);
    for (let k = 0; k < nCorner; k++) if (cornerStreak(k, nCorner, v.travel, v.speedMs, v.lineS, this.cartoon, s)) this.addLine(rf, track, st, v, s, this.cornerGain);
    const ring = this.plan.draftLines;
    const nDraft = lineCount(ring, v.draftI);
    for (let k = 0; k < nDraft; k++) if (draftLine(k, ring, v.travel, v.time, v.speedMs, v.draftI, s)) this.addLine(rf, track, st, v, s);
  }

  private readonly lineHead: FramePoint = { x: 0, y: 0, z: 0, heading: 0 };
  private readonly lineTail: FramePoint = { x: 0, y: 0, z: 0, heading: 0 };

  private addLine(rf: RoadFrame, track: Track, st: Streaks, v: ViewFx, s: LineSpec, gain = this.lineGain): void {
    const hd = this.lineHead; const tl = this.lineTail;
    if (!locateOnFrame(rf, track, v.z + s.dz * 50, v.x + s.lat / 7, hd)) return;
    const ok = locateOnFrame(rf, track, v.z + s.tail * 50, v.x + s.lat / 7, tl);
    st.add(hd.x, hd.y + s.h, hd.z, ok ? tl.x : hd.x, ok ? tl.y + s.h : hd.y + s.h, ok ? tl.z : hd.z - 1, s.width, s.r, s.g, s.b, s.a * gain);
  }

  /** Deslocamento da câmera pelo chacoalho do assento (zero se desligado nas opções). */
  shake(seat: number, time: number, enabled: boolean, out: Shake): Shake {
    const a = enabled && seat >= 0 && seat < 4 ? this.shakeAmp[seat] : 0;
    out.x = a * Math.sin(time * 47) * 0.14;
    out.y = a * Math.cos(time * 61) * 0.1;
    out.roll = a * Math.sin(time * 37) * 0.02;
    return out;
  }

  dispose(): void { this.dust.dispose(); this.streaks.dispose(); this.marks.dispose(); this.waves.dispose(); this.pows.dispose(); }
}
