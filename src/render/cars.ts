// Carros: um modelo procedural por estilo de carroceria (cars/styles/*.ts, 13 estilos) ou, quando o carro tem
// `.glb` próprio (cars/assets.ts), um modelo só dele. Agrupados por MODELO (cars/models.ts, `modelKey`) — cada modelo
// presente é UMA chamada de desenho para todos os carros dele (InstancedMesh; outra para o LOD1 dos carros longe), e
// cada desenho de roda presente é outra. Modelo com atlas de paleta (`map`) tem o próprio material. Carroceria, cabine, vidro, cromo, lentes e peças vivem na
// mesma malha e no mesmo material (cars/material.ts): pintura e acento por instância, faixas por
// camada, farol/lanterna emissivos (freio por instância), verniz com o reflexo do céu na qualidade alta.
// Chama de nitro em malha (cor por instância), estrelinhas da batida, sombra de contato e etiqueta de nome. Pose por viewport via
// locateOnFrame; a animação (giro de roda, rolagem, mergulho) é por carro, uma vez por quadro.
// O VISUAL do carro (N3, RenderFrame.looks / src/game/cosmetics.ts) é todo por instância: o acabamento nos bits 3–5 de `instExtra.w`, a faixa
// nos bits A/B do corpo, a roda escolhida é só QUAL dos 9 lotes de roda recebe as 4 instâncias, o aro é o bit B do lote de roda (outro bit
// que o da faixa B do corpo) com a cor do aro em `instExtra.rgb`, e a cor da chama vai em `instanceColor` da chama. Nenhum lote novo.
import * as THREE from 'three';
import { CARS, carDef } from '../core/data/cars';
import { NITRO_DURATION_TICKS } from '../core/constants';
import type { CarDef, CarLook, RaceState, Track } from '../core/types';
import type { CarColors, GhostFrame, Quality, RenderFrame } from '../game/contracts';
import { FINISH_IDS, lookColors, lookKey, RIM_COLORS } from '../game/cosmetics';
import { hash2 } from './noise';
import { locateOnFrame, type FramePoint, type RoadFrame } from './roadframe';
import { blobTexture, labelTexture } from './textures';
import { VIP_COLOR, VIP_NAME } from '../core/modes';
import { zToMeters } from './units';
import { createCarMaterial, FINISH_SHIFT, setCarQuality, type CarUniforms } from './cars/material';
import { applyStylize } from './stylize';
import type { CarModel } from './cars/model';
import { buildModel, modelKey, modelKeys } from './cars/models';
import { carPaint, defaultAccent, LIVERY_B, stripeBits, WHEEL_RIM } from './cars/paints';
import { buildSimpleWheel, buildWheel, spinStep, WHEEL_DESIGNS, type WheelDesign, type WheelModel } from './cars/wheels';
import { FLAME_CHOSEN_WHITE, FLAME_FRAG, FLAME_VERT, buildFlameGeometry, flameChosenColor, flameColorFor } from './cars/flame';
import { newMotion, stepMotion, type Motion, type MotionInput } from './cars/motion';
import { STAR_COLORS, STARS_PER_CAR, buildStarGeometry, starPose, type StarPose } from './cars/stars';
import { CAR_BODIES } from '../core/data/cars';

const MAX_CARS = 20;
/** Posição da etiqueta do VIP na lista de etiquetas (depois dos 4 assentos). */
const VIP_LABEL = 4;
/** Bit de freio em `instExtra.w` (os de pintura vêm de cars/paints.ts). */
const BRAKE_BIT = 1;
const SIDES = [-1, 1] as const;
/** Carro mais que isto à frente do carro do viewport (a câmera fica 7,8 m atrás) usa a roda simples. */
const FAR_WHEELS_M = 30;

interface Batch {
  readonly mesh: THREE.InstancedMesh;
  readonly extra: THREE.InstancedBufferAttribute;
  count: number;
}

/** Um modelo: estilo (`gt`) ou carro com arquivo próprio (`falcao`). `lod1` = o lote do casco simplificado (carros longe). */
interface StyleBatch extends Batch { readonly key: string; readonly model: CarModel; readonly wheels: WheelBatch; readonly lod1: Batch | null }
interface WheelBatch extends Batch { readonly model: WheelModel; readonly label: string }
/** Material e uniformes de um programa de carro: o comum e um por modelo com atlas. */
interface Rig { readonly material: THREE.MeshPhysicalMaterial; readonly uniforms: CarUniforms }

/** O que se desenha de um carro (resolvido do `CarLook` de src/game/cosmetics.ts, uma vez, quando o carro ou o look mudam). */
interface CarDraw {
  style: StyleBatch;
  color: THREE.Color;
  accent: THREE.Color;
  /** Bits do corpo: faixa A/B (a escolhida ou a do modelo) e o acabamento (`<< FINISH_SHIFT`). O freio entra a cada quadro. */
  body: number;
  /** O lote de roda: o do desenho escolhido ou o do estilo. */
  wheels: WheelBatch;
  /** Bit do aro nas rodas (`WHEEL_RIM` ou 0) e a cor que vai no `instExtra.rgb` do lote de roda (a do aro escolhido, ou o detalhe). */
  rimBit: number;
  rim: THREE.Color;
  /** Cor da chama do nitro (por instância): a escolhida ou o azul tingido pelo detalhe, e a brancura do núcleo dela (1 = a de sempre). */
  flame: THREE.Color;
  flameWhite: number;
}

interface CarAnim {
  spinF: number; spinR: number; yaw: number; roll: number; pitch: number; bob: number;
  brake: boolean; prevSpeed: number; nitro: number;
  /** Guinada da derrapagem, rodopio, quique, squash & stretch e estrelinhas (cars/motion.ts). */
  motion: Motion;
}

export class Cars {
  readonly group = new THREE.Group();
  /** O material comum (rigs[0]) e um por modelo com atlas de paleta; luz e qualidade vão para todos. */
  private readonly rigs: Rig[] = [];
  /** Modelos (estilos, depois carros com arquivo) e desenhos de roda, na ordem de `modelKeys` (lista, não Map: ordem de desenho estável). */
  private readonly styles: StyleBatch[] = [];
  private readonly wheelBatches: WheelBatch[] = [];
  /** Estilos + LOD1 + rodas numa lista só (fechamento de cada pose sem alocar). */
  private readonly batches: Batch[] = [];
  /** Roda única da qualidade baixa e dos carros distantes (todas numa chamada). */
  private readonly simpleWheels: WheelBatch;
  private lowQuality = false;
  private readonly blob: THREE.InstancedMesh;
  private readonly flames: THREE.InstancedMesh;
  private readonly flameMaterial: THREE.ShaderMaterial;
  /** (fase do tremor, força 0..1) de cada chama. */
  private readonly flameExtra: THREE.InstancedBufferAttribute;
  /** Estrelinhas da batida (3 por carro). */
  private readonly stars: THREE.InstancedMesh;
  private readonly starPose: StarPose = { x: 0, y: 0, z: 0, scale: 0, roll: 0 };
  /** Entrada reaproveitada do `stepMotion` (nada de objeto novo por carro por quadro). */
  private readonly motionIn: MotionInput = { driftDir: 0, driftTicks: 0, driftBoostTicks: 0, nitroTicks: 0, collisionCooldown: 0, speed: 0, maxSpeed: 1, reduce: false };
  /** Aparência por carro (estilo, cores, acabamento, roda, aro, chama), recalculada só quando o carro ou o look mudam. */
  private readonly looks: Array<CarDraw | null> = [];
  private readonly lookIds: string[] = [];
  private readonly lookCars: string[] = [];
  /** O que gerou cada aparência (por identidade: o `RenderFrame.looks`/`paints` da sessão é montado na largada e não muda por quadro). */
  private readonly lookRefs: Array<CarLook | CarColors | null | undefined> = [];
  /** Visual de cada carro no quadro atual (RenderFrame.looks; ausente = vale `paints`, e sem ele todos de fábrica). */
  private looksIn: ReadonlyArray<CarLook | null> | undefined;
  /** Só as cores de cada carro no quadro atual (RenderFrame.paints: o Retrô, o bench, quem ainda não manda o look). */
  private paints: ReadonlyArray<CarColors | null> | undefined;
  /** Os lotes de roda por desenho (os 9 de `WHEEL_DESIGNS`, criados todos: qualquer um pode ser escolhido pela lista do estilo). */
  private readonly wheelByDesign = new Map<string, WheelBatch>();
  /** Etiquetas por assento (0..3) e, no índice VIP_LABEL, a do VIP da escolta; denso de propósito. */
  private readonly labels: Array<THREE.Sprite | null> = [null, null, null, null, null];
  private readonly labelKeys = ['', '', '', '', ''];
  private readonly spots: THREE.SpotLight[] = [];
  private readonly anims: CarAnim[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly wheelDummy = new THREE.Object3D();
  private readonly m = new THREE.Matrix4();
  private readonly mw = new THREE.Matrix4();
  private readonly pt: FramePoint = { x: 0, y: 0, z: 0, heading: 0 };
  private lastTime = -1;
  /** Fantasma do contra-relógio: a malha do estilo dele, translúcida e clara, fora das instâncias (só visual). */
  private readonly ghostMaterial = new THREE.MeshStandardMaterial({
    color: '#cfeaff', emissive: '#6fb4ff', emissiveIntensity: 0.5, transparent: true, opacity: 0.38, depthWrite: false, roughness: 0.6,
  });
  private readonly ghost: THREE.Mesh;

  private get instanced(): THREE.InstancedMesh[] {
    return [...this.styles.flatMap((s) => (s.lod1 ? [s.mesh, s.lod1.mesh] : [s.mesh])), ...this.wheelBatches.map((w) => w.mesh), this.blob, this.flames, this.stars];
  }

  constructor(scene: THREE.Scene) {
    const base = createCarMaterial();
    this.rigs.push(base);
    // Os 9 desenhos de roda têm lote desde o início (N3): o look escolhe QUAL recebe as 4 rodas do carro. Com o material comum: o desenho
    // procedural não tem atlas, mesmo em carro cujo casco tem.
    const wheelByDesign = new Map<WheelDesign | CarModel, WheelBatch>();
    for (const design of WHEEL_DESIGNS) {
      const wm = buildWheel(design);
      const batch: WheelBatch = { ...this.batch(wm.geometry, MAX_CARS * 4, false, base.material), model: wm, label: wm.design };
      wheelByDesign.set(design, batch);
      this.wheelByDesign.set(design, batch);
      this.wheelBatches.push(batch);
    }
    for (const key of modelKeys(CAR_BODIES, CARS)) {
      const model = buildModel(key);
      // Atlas de paleta: material próprio (o `map` multiplica a cor de vértice e a pintura; o resto do shader é o mesmo).
      let rig = base;
      if (model.map || model.normalMap) {
        rig = createCarMaterial();
        rig.material.map = model.map ?? null;
        rig.material.normalMap = model.normalMap ?? null;
        this.rigs.push(rig);
      }
      // A roda do arquivo é de um modelo só; as dos estilos dividem por desenho. Rodas não fazem sombra: ficam dentro da
      // sombra da carroceria e da de contato.
      const wheelKey: WheelDesign | CarModel = model.wheelModel ? model : model.wheel;
      let wheels = wheelByDesign.get(wheelKey);
      if (!wheels) { // a roda do próprio arquivo (.glb): um lote só dele
        const wm = model.wheelModel ?? buildWheel(model.wheel);
        wheels = { ...this.batch(wm.geometry, MAX_CARS * 4, false, rig.material), model: wm, label: model.wheelModel ? `${key}:roda` : wm.design };
        wheelByDesign.set(wheelKey, wheels);
        this.wheelBatches.push(wheels);
      }
      const lod1 = model.lod1 ? this.batch(model.lod1.shell, MAX_CARS, true, rig.material) : null;
      const style: StyleBatch = { ...this.batch(model.shell, MAX_CARS, true, rig.material), key, model, wheels, lod1 };
      style.mesh.receiveShadow = true;
      if (lod1) lod1.mesh.receiveShadow = true;
      this.styles.push(style);
    }
    const simple = buildSimpleWheel();
    this.simpleWheels = { ...this.batch(simple.geometry, MAX_CARS * 4, false, base.material), model: simple, label: 'simple' };
    this.wheelBatches.push(this.simpleWheels);
    for (const st of this.styles) { this.batches.push(st); if (st.lod1) this.batches.push(st.lod1); }
    this.batches.push(...this.wheelBatches);
    this.blob = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.5, 4.9).rotateX(-Math.PI / 2).translate(0, 0.02, 0), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }), MAX_CARS);
    this.blob.renderOrder = 1;
    // Chama em malha: a cor vem de `instanceColor` (a do visual do carro) e a fase do tremor de `aFlame`, por instância.
    this.flameMaterial = new THREE.ShaderMaterial({
      vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
    });
    const flameGeometry = buildFlameGeometry();
    this.flameExtra = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CARS * 2 * 3), 3);
    this.flameExtra.setUsage(THREE.DynamicDrawUsage);
    flameGeometry.setAttribute('aFlame', this.flameExtra);
    this.flames = new THREE.InstancedMesh(flameGeometry, this.flameMaterial, MAX_CARS * 2);
    this.flames.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CARS * 2 * 3), 3);
    this.flames.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.flames.renderOrder = 4;
    this.stars = new THREE.InstancedMesh(buildStarGeometry(), new THREE.MeshBasicMaterial({ toneMapped: false, fog: false }), MAX_CARS * STARS_PER_CAR);
    this.stars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CARS * STARS_PER_CAR * 3), 3);
    for (let k = 0; k < MAX_CARS * STARS_PER_CAR; k++) this.stars.setColorAt(k, new THREE.Color(STAR_COLORS[k % STAR_COLORS.length]));
    this.stars.renderOrder = 6;
    for (const im of this.instanced) {
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      im.visible = false;
      this.group.add(im);
    }
    applyStylize(this.ghostMaterial, 'ghost');
    this.ghost = new THREE.Mesh(this.styles[0].model.shell, this.ghostMaterial);
    this.ghost.matrixAutoUpdate = false; this.ghost.frustumCulled = false; this.ghost.visible = false; this.ghost.renderOrder = 3;
    this.group.add(this.ghost);
    for (let i = 0; i < MAX_CARS; i++) {
      this.anims.push({ spinF: 0, spinR: 0, yaw: 0, roll: 0, pitch: 0, bob: 0, brake: false, prevSpeed: 0, nitro: 0, motion: newMotion() });
      this.looks.push(null); this.lookIds.push(''); this.lookCars.push('');
    }
    // Faróis do carro do viewport (sempre na origem, olhando −Z): dois SpotLights fixos.
    for (const sx of [-0.55, 0.55]) {
      const spot = new THREE.SpotLight('#fff3d0', 230, 110, 0.48, 0.6, 1.3);
      spot.position.set(sx, 0.6, -2.0);
      spot.target.position.set(sx * 2.2, -0.6, -45);
      spot.visible = false;
      scene.add(spot, spot.target);
      this.spots.push(spot);
    }
    scene.add(this.group);
  }

  /** InstancedMesh do material dos carros com a cor (pintura) e o extra (acento + bits) por instância. */
  private batch(geometry: THREE.BufferGeometry, capacity: number, castShadow: boolean, material: THREE.Material): Batch {
    const extra = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    extra.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('instExtra', extra);
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = castShadow;
    return { mesh, extra, count: 0 };
  }

  /** `light` = palette.light (1 dia, 0,7 entardecer, 0,32 noite). */
  setLight(light: number): void {
    const night = light < 0.5;
    for (const { uniforms } of this.rigs) {
      uniforms.uSelfLight.value = 0.05 + 0.15 * light;
      uniforms.uHeadGlow.value = night ? 2.6 : light < 0.8 ? 0.9 : 0.35;
      uniforms.uTailGlow.value = night ? 1.3 : 0.9;
      uniforms.uPopup.value = light < 0.8 ? 1 : 0;
    }
    for (const s of this.spots) { s.visible = light < 0.8; s.intensity = night ? 230 : 110; }
  }

  /** Verniz (clearcoat) só na alta; média e baixa ficam no programa sem a segunda camada. */
  setQuality(q: Quality): void {
    for (const { material } of this.rigs) setCarQuality(material, q); // um material por modelo com atlas (L3); a L1 passa o nível, não um boolean
    this.lowQuality = q === 'low';
  }

  private look(i: number, carId: string): CarDraw {
    const lk = this.looksIn ? this.looksIn[i] ?? null : null;
    const colors = this.looksIn ? null : this.paints?.[i] ?? null; // `looks` vale mais que `paints`; sem nenhum dos dois, de fábrica
    const cached = this.looks[i];
    const ref = lk ?? colors;
    // Mesmo carro e mesmo objeto da sessão: nada a refazer (sem alocar por quadro). Objeto novo de mesmo conteúdo: confere pela chave.
    if (cached && this.lookCars[i] === carId && this.lookRefs[i] === ref) return cached;
    const key = lk ? lookKey(lk) : colors ? `${colors.color}|${colors.accent}` : '';
    if (cached && this.lookCars[i] === carId && this.lookIds[i] === key) { this.lookRefs[i] = ref; return cached; }
    const def = carDef(carId);
    const style = this.styleOf(def);
    const factory = { color: def.color, accent: def.accent ?? defaultAccent(def.color) };
    const paint = carPaint(def, CARS, style.model.liveries, colors ?? lookColors(lk, factory));
    const finish = Math.max(0, FINISH_IDS.indexOf(lk?.finish ?? FINISH_IDS[0])); // id que não existe: brilho
    const accent = new THREE.Color(paint.accent);
    // O aro: o escolhido (liga o bit e traz a cor) ou, sem escolha, o de fábrica — que segue a faixa B do MODELO, não a escolhida.
    const rimHex = lk?.rim !== undefined && Object.hasOwn(RIM_COLORS, lk.rim) ? RIM_COLORS[lk.rim] : undefined;
    const rimChosen = lk?.rim !== undefined && Object.hasOwn(RIM_COLORS, lk.rim);
    const draw: CarDraw = {
      style, color: new THREE.Color(paint.color), accent,
      body: stripeBits(lk?.stripe, paint.livery) | (finish << FINISH_SHIFT),
      wheels: (lk?.wheel !== undefined ? this.wheelByDesign.get(lk.wheel) : undefined) ?? style.wheels,
      rimBit: rimChosen || (paint.livery & LIVERY_B) !== 0 ? WHEEL_RIM : 0,
      rim: rimChosen && rimHex ? new THREE.Color(rimHex) : accent,
      flame: flameChosenColor(lk?.flame) ?? flameColorFor(paint.accent),
      flameWhite: flameChosenColor(lk?.flame) ? FLAME_CHOSEN_WHITE : 1,
    };
    this.looks[i] = draw; this.lookIds[i] = key; this.lookCars[i] = carId; this.lookRefs[i] = ref;
    return draw;
  }

  /** O lote do modelo do carro: o dele (com `.glb` próprio) ou o do estilo. */
  private styleOf(def: Pick<CarDef, 'id' | 'body'>): StyleBatch {
    const key = modelKey(def);
    const s = this.styles.find((x) => x.key === key);
    if (!s) throw new Error(`Estilo de carroceria sem modelo: ${key}`);
    return s;
  }

  /** Animação por carro (uma vez por quadro, independente do viewport). */
  update(frame: RenderFrame): void {
    const dt = this.lastTime < 0 ? 1 / 60 : Math.min(0.1, Math.max(0, frame.time - this.lastTime));
    this.lastTime = frame.time;
    this.looksIn = frame.looks;
    this.paints = frame.paints;
    const cars = frame.state.cars;
    const segs = frame.track.segments;
    for (let i = 0; i < cars.length && i < MAX_CARS; i++) {
      const c = cars[i];
      const a = this.anims[i];
      const look = this.look(i, c.carId);
      const [fa, ra] = look.style.model.axles;
      const sym = look.wheels.model.symmetry;
      const sf = Math.min(1.2, c.speed / c.stats.topSpeed);
      const dist = zToMeters(c.speed) * dt;
      a.spinF += spinStep(dist / fa.r, sym);
      a.spinR += spinStep(dist / ra.r, sym);
      const decel = (a.prevSpeed - c.speed) / Math.max(1e-3, dt);
      a.brake = c.speed > 200 && decel > c.stats.brake * 0.55 && c.collisionCooldown === 0;
      a.prevSpeed = c.speed;
      const seg = segs[Math.floor((((c.z % frame.track.length) + frame.track.length) % frame.track.length) / 200) % segs.length];
      const k = 1 - Math.exp(-dt * 8);
      a.yaw += (c.steerPose * 0.08 * Math.min(1, sf + 0.3) - a.yaw) * k;
      const rollTarget = (seg.curve * 0.045 * sf * sf + c.steerPose * 0.03 * sf);
      a.roll += (rollTarget - a.roll) * k;
      const pitchTarget = a.brake ? -0.045 : (c.nitroTicks > 0 ? 0.03 : 0);
      a.pitch += (pitchTarget - a.pitch) * k;
      a.bob = c.skidTicks > 0 && c.speed > 200 ? 1 : 0;
      a.nitro = c.nitroTicks > 0 ? c.nitroTicks / NITRO_DURATION_TICKS : 0;
      // M4: guinada da derrapagem, batida e esticão, só visuais, por borda do estado (cars/motion.ts).
      const mi = this.motionIn;
      mi.driftDir = c.driftDir; mi.driftTicks = c.driftTicks; mi.driftBoostTicks = c.driftBoostTicks; mi.nitroTicks = c.nitroTicks;
      mi.collisionCooldown = c.collisionCooldown; mi.speed = c.speed; mi.maxSpeed = c.stats.topSpeed; mi.reduce = frame.options.reduceEffects;
      stepMotion(a.motion, mi, dt);
    }
    this.flameMaterial.uniforms.uTime.value = frame.time;
  }

  /** Uma instância: a matriz, a cor da carroceria e `instExtra` = (cor do detalhe — no lote de roda, a do aro —, bits). */
  private put(b: Batch, m: THREE.Matrix4, look: CarDraw, flags: number, extra: THREE.Color = look.accent): void {
    const idx = b.count++;
    b.mesh.setMatrixAt(idx, m);
    b.mesh.setColorAt(idx, look.color);
    b.extra.setXYZW(idx, extra.r, extra.g, extra.b, flags);
  }

  /** Posiciona os carros no referencial do viewport (`ownIndex` = carro do viewport). */
  pose(rf: RoadFrame, state: RaceState, track: Track, ownIndex: number, viewportSeats: ReadonlyArray<{ seat: number; name: string; color: string; carIndex: number }>, time: number): void {
    const cars = state.cars;
    const d = this.dummy;
    const w = this.wheelDummy;
    let nBlob = 0; let nFlames = 0; let nStars = 0;
    for (const s of this.styles) { s.count = 0; if (s.lod1) s.lod1.count = 0; }
    for (const wb of this.wheelBatches) wb.count = 0;
    for (const s of this.labels) if (s) s.visible = false;
    for (let i = 0; i < cars.length && i < MAX_CARS; i++) {
      const c = cars[i];
      if (!locateOnFrame(rf, track, c.z, c.x, this.pt)) continue;
      // Carro atrás do carro do viewport ficaria entre ele e a câmera (a 8 m), enorme e
      // cortado: só aparece quando o centro dele passa 2,2 m atrás do centro do jogador.
      if (i !== ownIndex && this.pt.z > 2.2) continue;
      const a = this.anims[i];
      const look = this.look(i, c.carId);
      const model = look.style.model;
      const bobY = a.bob ? Math.sin(time * 71 + i) * 0.025 : 0;
      const bobR = a.bob ? Math.sin(time * 57 + i * 2) * 0.02 : 0;
      // Rumo do desenho: o da pista + o volante + a guinada da derrapagem + o rodopio da batida (cars/motion.ts); quique e squash & stretch no mesmo lugar.
      const mo = a.motion;
      const yaw = a.yaw + mo.drift + mo.spin;
      d.position.set(this.pt.x, this.pt.y + bobY + mo.hop, this.pt.z);
      d.rotation.set(a.pitch, -(this.pt.heading + yaw), a.roll + bobR, 'YXZ');
      d.scale.set(mo.sx, mo.sy, mo.sz);
      d.updateMatrix();
      this.m.copy(d.matrix);
      const flags = look.body | (a.brake ? BRAKE_BIT : 0);
      // Longe (e na Baixa) o casco simplificado do LOD1, se o modelo tem; o mesmo critério da roda simples.
      const far = this.lowQuality || this.pt.z < -FAR_WHEELS_M;
      this.put(far && look.style.lod1 ? look.style.lod1 : look.style, this.m, look, flags);
      // Sombra de contato: no chão, sem rolagem/mergulho.
      d.rotation.set(0, -(this.pt.heading + yaw), 0, 'YXZ');
      d.position.y = this.pt.y;
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      this.blob.setMatrixAt(nBlob++, d.matrix);
      // Rodas: matriz do carro × deslocamento × giro (dianteiras viram com o volante). O desenho
      // é montado com a face de fora em +x: as da esquerda giram meia volta em y (e o giro inverte).
      // Longe (roda com ~10 px na tela) o desenho do aro não aparece: vai a roda simples, com as dos
      // outros carros distantes, numa chamada só.
      const wheels = far ? this.simpleWheels : look.wheels;
      for (let ax = 0; ax < 2; ax++) {
        const axle = model.axles[ax];
        const spin = ax === 0 ? a.spinF : a.spinR;
        const steer = ax === 0 ? c.steerPose * 0.32 : 0;
        for (const sx of SIDES) {
          w.position.set(sx * axle.x, axle.r, axle.z);
          if (sx > 0) w.rotation.set(-spin, -steer, 0, 'YXZ');
          else w.rotation.set(spin, Math.PI - steer, 0, 'YXZ');
          w.scale.set(axle.w, axle.r, axle.r);
          w.updateMatrix();
          this.mw.multiplyMatrices(this.m, w.matrix);
          this.put(wheels, this.mw, look, look.rimBit, look.rim);
        }
      }
      // Chama do nitro (malha): origem no escape, +Z para trás = comprimento, escala x/y = largura. Cor e fase por instância.
      if (a.nitro > 0) {
        const pulse = 0.85 + 0.3 * Math.sin(time * 41 + i * 1.7) + 0.25 * hash2(Math.floor(time * 28), i);
        let e = 0;
        for (const ex of model.exhausts) {
          if (nFlames >= MAX_CARS * 2) break;
          w.position.set(ex[0], ex[1], ex[2]);
          w.rotation.set(0, 0, 0);
          w.scale.set(0.5, 0.5, 2.3 * pulse * (0.55 + 0.45 * a.nitro));
          w.updateMatrix();
          this.mw.multiplyMatrices(this.m, w.matrix);
          this.flames.setMatrixAt(nFlames, this.mw);
          this.flames.setColorAt(nFlames, look.flame);
          this.flameExtra.setXYZ(nFlames, i * 1.7 + e * 3.1, a.nitro, look.flameWhite);
          nFlames++; e++;
        }
      }
      // Estrelinhas da batida: três, em órbita sobre o teto (no referencial do carro sem o rumo: é um círculo).
      if (mo.starsT >= 0) {
        for (let k = 0; k < STARS_PER_CAR && nStars < MAX_CARS * STARS_PER_CAR; k++) {
          const sp = starPose(k, mo.starsT, model.height + mo.hop, this.starPose);
          w.position.set(this.pt.x + sp.x, this.pt.y + sp.y, this.pt.z + sp.z);
          w.rotation.set(0, 0, sp.roll);
          w.scale.set(sp.scale, sp.scale, sp.scale);
          w.updateMatrix();
          this.stars.setMatrixAt(nStars++, w.matrix);
        }
      }
      const labelY = this.pt.y + model.height + 0.9;
      // Escolta: o VIP leva etiqueta própria para a equipe não perdê-lo de vista (docs/MODOS.md).
      if (state.party && c.id === state.party.vipId) {
        const label = this.label(VIP_LABEL, VIP_NAME, VIP_COLOR);
        label.position.set(this.pt.x, labelY, this.pt.z);
        label.visible = true;
      }
      // Etiqueta de jogador local visto de outro viewport.
      if (c.seat >= 0 && c.seat < 4 && i !== ownIndex) {
        const vp = viewportSeats.find((v) => v.seat === c.seat);
        if (vp) {
          const label = this.label(c.seat, vp.name, vp.color);
          label.position.set(this.pt.x, labelY, this.pt.z);
          label.visible = true;
        }
      }
    }
    for (const b of this.batches) {
      b.mesh.count = b.count;
      b.mesh.visible = b.count > 0;
      if (b.count > 0) {
        b.mesh.instanceMatrix.needsUpdate = true;
        if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
        b.extra.needsUpdate = true;
      }
    }
    this.blob.count = nBlob; this.flames.count = nFlames; this.stars.count = nStars;
    this.blob.visible = nBlob > 0; if (nBlob > 0) this.blob.instanceMatrix.needsUpdate = true;
    this.flames.visible = nFlames > 0;
    if (nFlames > 0) {
      this.flames.instanceMatrix.needsUpdate = true;
      if (this.flames.instanceColor) this.flames.instanceColor.needsUpdate = true;
      this.flameExtra.needsUpdate = true;
    }
    this.stars.visible = nStars > 0; if (nStars > 0) this.stars.instanceMatrix.needsUpdate = true;
  }

  /**
   * Fantasma no referencial do viewport (chamar depois de `pose`). Some quando não há pose, quando
   * está fora da janela da pista ou atrás do carro do viewport (como os outros carros).
   */
  poseGhost(rf: RoadFrame, track: Track, ghost: GhostFrame | undefined): void {
    const p = ghost?.pose;
    const z = p ? ((p.z % track.length) + track.length) % track.length : 0;
    const on = !!p && locateOnFrame(rf, track, z, p.x, this.pt) && this.pt.z <= 2.2;
    this.ghost.visible = on;
    if (!on || !p || !ghost) return;
    this.ghost.geometry = this.ghostShell(ghost.carId);
    const d = this.dummy;
    d.position.set(this.pt.x, this.pt.y, this.pt.z);
    d.rotation.set(0, -(this.pt.heading + p.steerPose * 0.08), 0, 'YXZ');
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    this.ghost.matrix.copy(d.matrix);
    this.ghost.matrixWorldNeedsUpdate = true;
  }

  /** Malha do estilo do carro do fantasma (carro que não existe mais cai no primeiro estilo). */
  private ghostShell(carId: string): THREE.BufferGeometry {
    const def = CARS.find((c) => c.id === carId);
    return def ? this.styleOf(def).model.shell : this.styles[0].model.shell;
  }

  /** Esconde todos os carros (fundo dos menus). */
  hide(): void {
    this.ghost.visible = false;
    for (const im of this.instanced) { im.count = 0; im.visible = false; }
    for (const s of this.labels) if (s) s.visible = false;
  }

  private label(seat: number, name: string, color: string): THREE.Sprite {
    const key = `${name}|${color}`;
    let sprite = this.labels[seat];
    if (!sprite) {
      sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, fog: false }));
      sprite.scale.set(3.2, 1.0, 1);
      sprite.renderOrder = 5;
      this.labels[seat] = sprite;
      this.group.add(sprite);
    }
    if (this.labelKeys[seat] !== key) {
      const mat = sprite.material;
      if (mat.map) mat.map.dispose();
      mat.map = labelTexture(name, color);
      mat.needsUpdate = true;
      this.labelKeys[seat] = key;
    }
    return sprite;
  }

  /** Números para o harness e o relatório de desempenho: triângulos por estilo e por roda. */
  stats(): { styles: Record<string, number>; wheels: Record<string, number> } {
    const styles: Record<string, number> = {}; const wheels: Record<string, number> = {};
    for (const s of this.styles) styles[s.key] = s.model.triangles;
    for (const w of this.wheelBatches) wheels[w.label] = w.model.triangles;
    return { styles, wheels };
  }

  dispose(): void {
    for (const im of this.instanced) { im.geometry.dispose(); im.dispose(); }
    for (const { material } of this.rigs) material.dispose();
    (this.blob.material as THREE.Material).dispose();
    (this.blob.material as THREE.MeshBasicMaterial).map?.dispose();
    this.flameMaterial.dispose();
    (this.stars.material as THREE.Material).dispose();
    this.ghostMaterial.dispose(); // a geometria é a de um estilo, já liberada acima
    for (const s of this.labels) if (s) { if (s.material.map) s.material.map.dispose(); s.material.dispose(); }
    for (const s of this.spots) s.dispose();
  }
}
