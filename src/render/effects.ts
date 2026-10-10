// Efeitos: partículas em coordenadas de pista (z ao longo, x lateral, h altura) — assim a
// mesma partícula aparece certa em todos os viewports, cada um a localizando pelo seu
// RoadFrame. Pools com buffers reutilizados; poeira na grama, fumaça de freio e da derrapagem
// (pontos), e as faíscas ESTICADAS (rodas nas 3 cores, batida, raspão, escape do nitro) num lote
// de traços de uma chamada só (fx/streaks.ts). Também o chacoalho de câmera por assento, com decaimento.
// M5: cada efeito respeita `reduceEffects` e o degrau de qualidade (fx/plan.ts); as bordas do
// estado (largada, nitro, batida, impulso) vêm de fx/cues.ts, que não perde a batida num quadro
// de tela que cobre vários ticks.
import * as THREE from 'three';
import { driftLevel } from '../core/sim/physics';
import type { RaceState, Track } from '../core/types';
import type { RenderFrame } from '../game/contracts';
import { createScrapeMemory, observeScrapes } from '../game/race-feel';
import { newCueMemory, observeCues, type FxCue } from './fx/cues';
import { fxPlan } from './fx/plan';
import { emitBoostSparks, emitHitSparks, emitNitroTrail, emitWheelSparks, SparkPool, type SparkCar, type SparkSpec } from './fx/sparks';
import { Streaks } from './fx/streaks';
import { hash2 } from './noise';
import type { Palette } from './palette';
import { scrapeSparks } from './scrape-sparks';
import { locateOnFrame, type FramePoint, type RoadFrame } from './roadframe';

const VERT = /* glsl */ `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
uniform float uScale;
varying float vAlpha; varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.5, -mv.z);
  gl_Position = projectionMatrix * mv;
  vAlpha = aAlpha; vColor = aColor;
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

/** Pool de partículas em coordenadas de pista. */
class Pool {
  readonly points: THREE.Points;
  private readonly z: Float32Array; private readonly x: Float32Array; private readonly h: Float32Array;
  private readonly vz: Float32Array; private readonly vx: Float32Array; private readonly vh: Float32Array;
  private readonly life: Float32Array; private readonly maxLife: Float32Array; private readonly size: Float32Array;
  private readonly grow: Float32Array; private readonly gravity: Float32Array;
  private readonly r: Float32Array; private readonly g: Float32Array; private readonly b: Float32Array;
  private readonly position: THREE.BufferAttribute;
  private readonly aSize: THREE.BufferAttribute;
  private readonly aAlpha: THREE.BufferAttribute;
  private readonly aColor: THREE.BufferAttribute;
  private readonly material: THREE.ShaderMaterial;
  private next = 0;
  private readonly pt: FramePoint = { x: 0, y: 0, z: 0, heading: 0 };

  constructor(readonly max: number, additive: boolean) {
    const f = () => new Float32Array(max);
    this.z = f(); this.x = f(); this.h = f(); this.vz = f(); this.vx = f(); this.vh = f();
    this.life = f(); this.maxLife = f(); this.size = f(); this.grow = f(); this.gravity = f(); this.r = f(); this.g = f(); this.b = f();
    const geo = new THREE.BufferGeometry();
    this.position = new THREE.BufferAttribute(new Float32Array(max * 3), 3); this.position.setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1); this.aSize.setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(new Float32Array(max), 1); this.aAlpha.setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.BufferAttribute(new Float32Array(max * 3), 3); this.aColor.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.position); geo.setAttribute('aSize', this.aSize); geo.setAttribute('aAlpha', this.aAlpha); geo.setAttribute('aColor', this.aColor);
    geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { uScale: { value: 400 } },
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  emit(z: number, x: number, h: number, vz: number, vx: number, vh: number, life: number, size: number, grow: number, gravity: number, r: number, g: number, b: number): void {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.z[i] = z; this.x[i] = x; this.h[i] = h; this.vz[i] = vz; this.vx[i] = vx; this.vh[i] = vh;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.grow[i] = grow; this.gravity[i] = gravity;
    this.r[i] = r; this.g[i] = g; this.b[i] = b;
  }

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

  /** Escreve os buffers no referencial do viewport; `scale` = altura em px / (2·tan(fov/2)). */
  pose(rf: RoadFrame, track: Track, scale: number, _viewport = 0): void {
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      if (!locateOnFrame(rf, track, this.z[i], this.x[i], this.pt)) continue;
      const t = this.life[i] / this.maxLife[i];
      this.position.setXYZ(n, this.pt.x, this.pt.y + this.h[i], this.pt.z);
      this.aSize.setX(n, this.size[i] + this.grow[i] * (1 - t));
      this.aAlpha.setX(n, Math.min(1, t * 2.5) * (0.25 + 0.55 * t));
      this.aColor.setXYZ(n, this.r[i], this.g[i], this.b[i]);
      n++;
    }
    this.points.geometry.setDrawRange(0, n);
    this.points.visible = n > 0;
    if (n > 0) { this.position.needsUpdate = true; this.aSize.needsUpdate = true; this.aAlpha.needsUpdate = true; this.aColor.needsUpdate = true; }
    this.material.uniforms.uScale.value = scale;
  }

  dispose(): void { this.points.geometry.dispose(); this.material.dispose(); }
}

export interface Shake { x: number; y: number; roll: number }

export class Effects {
  readonly group = new THREE.Group();
  private readonly dust = new Pool(900, false);
  /** Faíscas esticadas: o pool anda em coordenada de pista e cada viewport as escreve no lote de traços. */
  private readonly sparks = new SparkPool(700);
  readonly streaks = new Streaks(900);
  private readonly cues: FxCue[] = [];
  private readonly cueMemory = newCueMemory();
  private readonly sparkCar: SparkCar = { z: 0, x: 0, speed: 0, driftDir: 0, driftTicks: 0 };
  private readonly emitSpark = (s: SparkSpec): void => this.sparks.emit(s);
  private readonly prevSpeed = new Float32Array(20);
  private readonly shakeAmp = new Float32Array(4);
  private readonly dustColor = new THREE.Color('#8a7a5a');
  private readonly scrapeMemory = createScrapeMemory();
  private lastTime = -1;
  private seed = 0;

  constructor() { this.group.add(this.dust.points, this.streaks.mesh); }

  /** Poeira da cor do chão que o carro levanta: a faixa de terra/areia/cascalho da beira. */
  setPalette(p: Palette): void {
    this.dustColor.set(p.verge).lerp(new THREE.Color(p.shoulder), 0.4).multiplyScalar(p.light < 0.5 ? 0.7 : 0.92);
  }

  private rnd(): number { this.seed++; return hash2(this.seed, 77); }

  private sparkCarOf(c: { z: number; x: number; speed: number; driftDir: number; driftTicks: number }): SparkCar {
    const o = this.sparkCar;
    o.z = c.z; o.x = c.x; o.speed = c.speed; o.driftDir = c.driftDir; o.driftTicks = c.driftTicks;
    return o;
  }

  /** Emissores + física, uma vez por quadro. */
  update(frame: RenderFrame): void {
    const dt = this.lastTime < 0 ? 1 / 60 : Math.min(0.1, Math.max(0, frame.time - this.lastTime));
    this.lastTime = frame.time;
    if (frame.paused) return;
    const state: RaceState = frame.state;
    const reduce = frame.options.reduceEffects === true;
    const plan = fxPlan(frame.options.quality, reduce, frame.viewports.length);
    const dc = this.dustColor;
    const rnd = () => this.rnd();
    for (let i = 0; i < state.cars.length && i < 20; i++) {
      const c = state.cars[i];
      // Poeira na grama.
      if (c.skidTicks > 0 && c.speed > 250) {
        for (let k = 0; k < 2; k++) {
          const side = k % 2 === 0 ? -0.16 : 0.16;
          this.dust.emit(c.z - 50 + this.rnd() * 30, c.x + side * (1 + this.rnd()), 0.3, c.speed * (0.5 + this.rnd() * 0.2), (this.rnd() - 0.5) * 0.4 + side * 0.8, 1.2 + this.rnd() * 1.6, 0.6 + this.rnd() * 0.5, 0.5, 1.4, 0.5, dc.r, dc.g, dc.b);
        }
      }
      // Fumaça leve na frenagem forte.
      const decel = (this.prevSpeed[i] - c.speed) / dt;
      if (c.speed > 2500 && decel > c.stats.brake * 0.55 && c.collisionCooldown === 0 && this.rnd() < 0.6) {
        const side = this.rnd() < 0.5 ? -0.14 : 0.14;
        this.dust.emit(c.z - 60, c.x + side, 0.15, c.speed * 0.6, side * 0.3, 0.8, 0.5, 0.5, 1.6, 0.2, 0.75, 0.75, 0.78);
      }
      this.prevSpeed[i] = c.speed;
      // Faíscas das rodas na derrapagem, na cor da carga (azul, laranja, roxa).
      if (plan.wheelSparks && state.phase !== 'countdown') emitWheelSparks(this.sparkCarOf(c), driftLevel(c.driftCharge), dt, plan.sparks, rnd, this.emitSpark);
      // Rastro do nitro: traços curtos e discretos (a chama em si é a malha de cars.ts).
      if (c.nitroTicks > 0 && state.phase === 'racing') emitNitroTrail(this.sparkCarOf(c), plan.sparks, rnd, this.emitSpark);
    }
    // Bordas do estado (fx/cues.ts): a batida e o impulso da derrapagem.
    for (const cue of observeCues(this.cueMemory, state, this.cues)) {
      const c = state.cars[cue.car]?.id === cue.car ? state.cars[cue.car] : state.cars.find((o) => o.id === cue.car);
      if (!c) continue;
      if (cue.kind === 'hit') {
        emitHitSparks(this.sparkCarOf(c), cue.drop, plan.sparks, rnd, this.emitSpark);
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
    this.dust.step(dt);
    this.sparks.step(dt);
    for (let s = 0; s < 4; s++) this.shakeAmp[s] *= Math.exp(-4.5 * dt);
  }

  /** `viewport` = o índice do viewport desta pose (as linhas de velocidade e o túnel são de quem corre nele). */
  pose(rf: RoadFrame, track: Track, scale: number, _viewport = 0): void {
    this.dust.pose(rf, track, scale);
    const st = this.streaks;
    st.begin();
    this.sparks.pose(rf, track, st);
    st.end();
  }

  clear(): void {
    this.dust.clear(); this.sparks.clear(); this.shakeAmp.fill(0); this.lastTime = -1; this.cueMemory.tick = -1;
    this.streaks.begin(); this.streaks.end();
  }

  /** Deslocamento da câmera pelo chacoalho do assento (zero se desligado nas opções). */
  shake(seat: number, time: number, enabled: boolean, out: Shake): Shake {
    const a = enabled && seat >= 0 && seat < 4 ? this.shakeAmp[seat] : 0;
    out.x = a * Math.sin(time * 47) * 0.14;
    out.y = a * Math.cos(time * 61) * 0.1;
    out.roll = a * Math.sin(time * 37) * 0.02;
    return out;
  }

  dispose(): void { this.dust.dispose(); this.streaks.dispose(); }
}
