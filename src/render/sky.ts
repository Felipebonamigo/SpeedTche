// Céu: domo com gradiente forte (horizonte → meio → topo) e o horizonte do lado do sol puxando
// para o brilho do período; sol grande com halo e lua com crateras no próprio shader; estrelas
// com brilho variado à noite; nuvens low-poly estilizadas (lado iluminado × sombra, numa malha
// só); luzes (direcional com sombras + hemisférica que dá a cor das sombras), névoa colorida e o
// env map (PMREM do próprio domo) para o reflexo nos carros. O grupo do céu gira pelo rumo
// absoluto do carro: é a única coisa "fixa no mundo".
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SceneryId, TimeOfDay } from '../core/types';
import type { Quality } from '../game/contracts';
import { atLeast } from '../game/quality';
import { hash2 } from './noise';
import { smoothNormals } from './normals';
import { buildLensFlare } from './lensflare';
import { bodyColor, lightsAmount, mix, palette, starAlpha, type LivePalette, type Palette } from './palette';
import { applyGrade } from './stylize';

export { FLARE_ELEMENTS, flareFade, lensFlareLayout } from './lensflare';

const SKY_RADIUS = 1400;
/**
 * Densidade da névoa (FogExp2, por metro) por qualidade, antes do multiplicador do período (palette.ts, `fogDensity`):
 * a baixa desenha menos pista. Exportada para a conta de enquadramento dos marcos (scenery/sight.ts).
 */
export const FOG_DENSITY: Readonly<Record<Quality, number>> = { low: 0.003, medium: 0.0023, high: 0.0019, ultra: 0.0019 };

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uBelow;
uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform float uSunSize; uniform float uHalo; uniform float uGlowAmt; uniform float uDisc; uniform float uMoon;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float hp = max(h, 0.0);
  // Gradiente forte: o horizonte ocupa pouco, o meio sobe rápido e o topo fica saturado.
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.2, hp));
  col = mix(col, uTop, smoothstep(0.16, 0.75, hp));
  // O horizonte do lado do sol puxa para o brilho do período (o laranja do entardecer).
  vec2 sh = normalize(uSunDir.xz + vec2(1e-5));
  vec2 dh = normalize(d.xz + vec2(1e-5));
  float az = dot(dh, sh) * 0.5 + 0.5;
  float band = exp(-hp * 6.0);
  col = mix(col, uGlow, band * az * az * az * uGlowAmt);
  // Abaixo do horizonte: a cor da névoa, para o chão distante sumir sem emenda.
  col = mix(col, uBelow, smoothstep(0.0, -0.06, h));
  float c = clamp(dot(d, uSunDir), -1.0, 1.0);
  float ang = acos(c);
  float halo = exp(-ang * uHalo);
  float wide = exp(-ang * uHalo * 0.22);
  col += uSunColor * (halo * 0.5 + wide * 0.07) * step(-0.02, h);
  // Disco com borda nítida; a lua ganha crateras (ruído barato no plano do disco).
  float disc = (1.0 - smoothstep(uSunSize * 0.9, uSunSize, ang)) * step(0.0, h);
  vec3 discCol = uSunColor * uDisc;
  // uMoon vai de 0 (sol) a 1 (lua): na corrida que muda (M6) o sol vira lua aos poucos e as crateras entram com ele.
  if (uMoon > 0.001) {
    vec3 t1 = normalize(cross(uSunDir, vec3(0.0, 1.0, 0.0)));
    vec3 t2 = cross(t1, uSunDir);
    vec2 p = vec2(dot(d, t1), dot(d, t2)) / uSunSize;
    float cr = sin(p.x * 7.0 + 1.3) * sin(p.y * 6.0 - 0.7) + 0.6 * sin(p.x * 13.0 - p.y * 11.0);
    discCol *= mix(1.0, 0.86 + 0.1 * smoothstep(0.2, 0.9, cr) - 0.12 * smoothstep(0.5, 1.0, length(p)), uMoon);
  }
  col = mix(col, discCol, disc);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const CLOUD_VERT = /* glsl */ `
varying vec3 vW; varying vec3 vN;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

// Nuvem estilizada: bolhas lisas (normal suave do vértice — antes era a da face e a nuvem saía facetada), dois tons
// pelo sol, barriga mais escura, borda acesa pelo sol baixo e, perto do horizonte, derretendo na cor do horizonte.
export const CLOUD_FRAG = /* glsl */ `
uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uRim; uniform vec3 uHorizon; uniform vec3 uSunDir;
varying vec3 vW; varying vec3 vN;
void main() {
  vec3 n = normalize(vN);
  float l = dot(n, uSunDir) * 0.5 + 0.5;
  vec3 c = mix(uShade, uLit, smoothstep(0.35, 0.8, l));
  c = mix(c, uShade, smoothstep(0.1, -0.7, n.y) * 0.45);
  vec3 v = normalize(vW - cameraPosition);
  float toward = max(dot(v, uSunDir), 0.0);
  c += uRim * pow(toward, 6.0) * 0.5;
  c = mix(uHorizon, c, smoothstep(0.0, 0.2, v.y));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

interface SunSetup { dir: THREE.Vector3; size: number; halo: number; glow: number; disc: number; moon: boolean }

/** O disco e o halo do período (o tamanho cresce no pôr do sol); a direção vem da paleta (`sunAz`, `sunEl`). */
function sunLook(time: TimeOfDay): Omit<SunSetup, 'dir'> {
  if (time === 'day') return { size: 0.038, halo: 7, glow: 0.35, disc: 4, moon: false }; // sol a 34°: sombras longas, halo no alto da tela
  if (time === 'dusk') return { size: 0.07, halo: 4.2, glow: 0.8, disc: 1.5, moon: false }; // sol grande e baixo, à frente, horizonte em brasa
  return { size: 0.05, halo: 9, glow: 0.35, disc: 1.35, moon: true }; // lua grande a 20°, para aparecer nas retas que apontam para ela
}

/** Direção absoluta (x direita, y cima, −z frente na largada) do azimute e da elevação em graus. */
function fromAngles(elevDeg: number, azDeg: number): THREE.Vector3 {
  const el = elevDeg * Math.PI / 180; const az = azDeg * Math.PI / 180;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

/** O sol/lua de uma paleta (M2: o azimute e a elevação são dado da paleta, por bioma × período, e a M6 os interpola). */
export function sunOf(p: Pick<Palette, 'sunAz' | 'sunEl'>, time: TimeOfDay): SunSetup {
  return { dir: fromAngles(p.sunEl, p.sunAz), ...sunLook(time) };
}

/** Direção absoluta do sol/lua e o desenho do disco. O bioma só muda o entardecer (o anel de montanhas, ver `palette.ts`). */
export function sunSetup(time: TimeOfDay, scenery?: SceneryId): SunSetup {
  return sunOf(palette(scenery ?? 'coast', time), time);
}

function buildStars(): THREE.Points {
  const n = 1300;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = hash2(7, i); const v = hash2(13, i);
    const theta = u * Math.PI * 2;
    const y = 0.05 + v * v * 0.95; // mais estrelas perto do horizonte, onde a câmera olha
    const r = Math.sqrt(1 - y * y);
    const R = SKY_RADIUS * 0.96;
    pos[i * 3] = Math.cos(theta) * r * R; pos[i * 3 + 1] = y * R; pos[i * 3 + 2] = Math.sin(theta) * r * R;
    // Brilho variado e um leve tom (azulado/amarelado): céu com profundidade, não chuvisco uniforme.
    const b = 0.35 + 0.65 * Math.pow(hash2(21, i), 3);
    const warm = hash2(29, i);
    col[i * 3] = b * (warm > 0.8 ? 1 : 0.85); col[i * 3 + 1] = b * 0.92; col[i * 3 + 2] = b * (warm < 0.3 ? 1 : 0.85);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ vertexColors: true, size: 2.6, sizeAttenuation: false, transparent: true, opacity: 1, fog: false, depthWrite: false });
  applyGrade(m);
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}

/** Vinco das bolhas de nuvem: a bolha inteira lisa; a barriga reta (dobra de ~90°) continua com quina. */
const CLOUD_CREASE = 75;

/**
 * Um cúmulo: bolhas de icosaedro achatadas por baixo, com normal suave; `streak` = faixa comprida e fina. `detail` 1
 * (alta) usa icosaedro de 320 faces; 0 (média/baixa), de 80 — a mesma silhueta de longe, lisa nos dois.
 */
function cloudPuffs(seed: number, streak: boolean, detail: number, m: THREE.Matrix4, out: THREE.BufferGeometry[]): void {
  const blobs = streak ? 9 : 4 + Math.floor(hash2(seed, 1) * 4);
  for (let k = 0; k < blobs; k++) {
    const r = (streak ? 10 : 12) + hash2(seed, 10 + k) * (streak ? 6 : 14);
    const taper = streak ? 1 - Math.abs((k / (blobs - 1)) - 0.5) * 1.2 : 1;
    const g = new THREE.IcosahedronGeometry(r * taper, streak ? 1 : detail + 1);
    const sx = streak ? 2.6 : 1.6; const sy = streak ? 0.22 : 0.8; const sz = streak ? 0.9 : 1.15;
    // Faixa: puffs ao longo de x, afinando nas pontas; cúmulo: aglomerado.
    const along = streak ? (k / (blobs - 1) - 0.5) : 0;
    const x = streak ? along * 260 + (hash2(seed, 20 + k) - 0.5) * 20 : (hash2(seed, 20 + k) - 0.5) * 64;
    const y = (hash2(seed, 30 + k) - 0.2) * (streak ? 5 : 10);
    const z = (hash2(seed, 40 + k) - 0.5) * (streak ? 16 : 26);
    g.applyMatrix4(new THREE.Matrix4().makeScale(sx, sy, sz).setPosition(x, y, z));
    // Base reta: nuvem estilizada tem barriga plana.
    const p = g.attributes.position as THREE.BufferAttribute;
    const floor = -r * sy * 0.35;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < floor) p.setY(i, floor);
    smoothNormals(g, CLOUD_CREASE);
    g.applyMatrix4(m);
    out.push(g);
  }
}

export function buildClouds(detail: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const place = (a: number, r: number, y: number, yaw: number, s: number) =>
    new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(s, s, s));
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + hash2(k, 99) * 0.5;
    const r = 760 + hash2(k, 5) * 320;
    cloudPuffs(k * 17 + 3, false, detail, place(a, r, 190 + hash2(k, 6) * 170, hash2(k, 7) * Math.PI, 1.3 + hash2(k, 8) * 1.1), parts);
  }
  // Faixas baixas perto do horizonte (o entardecer as acende por baixo).
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.4 + hash2(k, 55) * 0.6;
    const r = 1150 + hash2(k, 56) * 120;
    // Tangente ao círculo: a faixa corre ao longo do horizonte.
    cloudPuffs(k * 29 + 101, true, detail, place(a, r, 95 + hash2(k, 57) * 70, -a + Math.PI / 2, 1.6 + hash2(k, 58)), parts);
  }
  const merged = mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g), false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('nuvem vazia');
  return merged;
}

/** Refeitas do env map por transição (M6): o PMREM é caro, a mudança entre dois passos de 1/8 é só reflexo. */
const ENV_STEPS = 8;
const ENV_STEPS_LOW = 3;

type SunLook = Omit<SunSetup, 'dir' | 'moon'> & { moon: number };

/** `sunLook` com a lua como 0..1 e interpolado entre dois períodos (o sol grande e baixo do entardecer encolhe e vira a lua grande da noite). */
function lerpLook(a: Omit<SunSetup, 'dir'>, b: Omit<SunSetup, 'dir'>, t: number): SunLook {
  const l = (x: number, y: number): number => x + (y - x) * t;
  return { size: l(a.size, b.size), halo: l(a.halo, b.halo), glow: l(a.glow, b.glow), disc: l(a.disc, b.disc), moon: l(a.moon ? 1 : 0, b.moon ? 1 : 0) };
}

/** Quanto do entardecer há na luz `light` (1 em 0,7; 0 de dia e à noite): a borda acesa das nuvens e o laranja do horizonte. */
export function duskAmount(light: number): number { return Math.max(0, Math.min(1, 1 - Math.abs(light - 0.7) / 0.3)); }

/** Quanto da noite há na luz (0 de dia e no entardecer, 1 à noite): usa as luzes acesas, de 0,6 em diante. */
function lightsAmountNight(light: number): number { return Math.max(0, (lightsAmount(light) - 0.6) / 0.4); }

export class Sky {
  /** Domo, estrelas e nuvens: gira pelo rumo absoluto. */
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fog = new THREE.FogExp2('#ffffff', 0.002);
  /** Direção do sol no referencial local (atualizada por quadro). */
  readonly sunDirLocal = new THREE.Vector3(0, 1, 0);
  private readonly sunDirAbs = new THREE.Vector3(0, 1, 0);
  private readonly dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly stars: THREE.Points;
  private readonly clouds: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** Nuvens por qualidade: redondas na alta, facetadas (¼ dos triângulos) na média e na baixa. */
  private readonly cloudGeo: [THREE.BufferGeometry, THREE.BufferGeometry] = [buildClouds(0), buildClouds(1)];
  /** Reflexo de lente do entardecer (lensflare.ts): uma malha, visível só quando a paleta, a qualidade e o jogador deixam. */
  readonly flare: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> = buildLensFlare();
  private flareStrength = 0;
  private flareQualityOk = true;
  private flareAllowed = true;
  private readonly pmrem: THREE.PMREMGenerator;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private paletteKey = '';
  /** A última paleta ao vivo entregue (para não repetir o mesmo passo), o `t` do último env map e quantas vezes ele foi refeito por `setLive`. */
  private livePair: { a: Palette; b: Palette; t: number } | null = null;
  private envT = 0;
  private envRebuilds = 0;
  private fogBase = FOG_DENSITY.high;
  private fogMul = 1;
  private night = false;
  private readonly target = new THREE.Object3D();

  constructor(renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color('#1b6fd6') }, uMid: { value: new THREE.Color('#4fa6ef') }, uHorizon: { value: new THREE.Color('#bfe6ff') },
        uGlow: { value: new THREE.Color('#fff6d0') }, uBelow: { value: new THREE.Color('#bfe6ff') },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color('#fff3a0') },
        uSunSize: { value: 0.03 }, uHalo: { value: 9 }, uGlowAmt: { value: 0.3 }, uDisc: { value: 6 }, uMoon: { value: 0 },
      },
    });
    applyGrade(mat);
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 48, 24), mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);
    this.stars = buildStars();
    this.group.add(this.stars);
    const cloudMat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, fog: false,
      uniforms: {
        uLit: { value: new THREE.Color('#ffffff') }, uShade: { value: new THREE.Color('#c8d8f0') }, uRim: { value: new THREE.Color('#000000') },
        uHorizon: { value: new THREE.Color('#d0f0ff') }, uSunDir: { value: this.sunDirLocal },
      },
    });
    applyGrade(cloudMat);
    this.clouds = new THREE.Mesh(this.cloudGeo[1], cloudMat);
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -9;
    this.group.add(this.clouds);
    this.group.add(this.flare); // a posição dele é em tela (a câmera de cada viewport): o giro do grupo não conta
    scene.add(this.group);

    this.sun = new THREE.DirectionalLight('#ffffff', 3);
    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    cam.left = -80; cam.right = 80; cam.top = 80; cam.bottom = -80; cam.near = 1; cam.far = 600;
    cam.updateProjectionMatrix(); // o three não recalcula sozinho depois de mudar os limites
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.12;
    this.sun.shadow.radius = 2;
    this.target.position.set(0, 0, -30);
    scene.add(this.target);
    this.sun.target = this.target;
    scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight('#bfe6ff', '#3a6a2a', 0.9);
    scene.add(this.hemi);
    scene.fog = this.fog;
    this.pmrem = new THREE.PMREMGenerator(renderer);
  }

  /** Tamanho do mapa de sombra por qualidade (0 = sem sombra) e a névoa (a baixa desenha menos pista). */
  setQuality(q: Quality): void {
    this.clouds.geometry = this.cloudGeo[atLeast(q, 'high') ? 1 : 0];
    const size = atLeast(q, 'high') ? 2048 : atLeast(q, 'medium') ? 1024 : 0;
    this.sun.castShadow = size > 0;
    if (size > 0 && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.fogBase = FOG_DENSITY[q];
    this.fog.density = this.fogBase * this.fogMul;
    this.flareQualityOk = atLeast(q, 'medium'); // a Baixa não paga os pixels aditivos do reflexo
    this.syncFlare();
  }

  /** O jogador liga e desliga o reflexo de lente (Reduzir efeitos): vale para as próximas pistas também. */
  setFlare(on: boolean): void {
    this.flareAllowed = on;
    this.syncFlare();
  }

  private syncFlare(): void {
    this.flare.visible = this.flareAllowed && this.flareQualityOk && this.flareStrength > 0;
  }

  setPalette(p: Palette, time: TimeOfDay, key: string): void {
    if (key === this.paletteKey) return;
    this.paletteKey = key;
    this.livePair = null;
    this.apply({ a: p, b: p, t: 0, p, body: bodyColor(p) }, time, time);
    this.envT = 0;
    this.rebuildEnvironment();
  }

  /**
   * M6 (b), a corrida que muda: a paleta entre os dois períodos (`livePalette`), só em uniformes e luzes — nenhum material novo, nenhum shader recompilado. O env map
   * (PMREM do próprio domo) é refeito no máximo `steps` vezes por transição (3 na Baixa, 8 nas outras), nunca por quadro, e uma vez ao voltar ao período da pista.
   * `timeA`/`timeB` = os períodos das duas pontas (o disco do sol/lua e o brilho das nuvens vêm deles).
   */
  setLive(live: LivePalette, timeA: TimeOfDay, timeB: TimeOfDay, quality: Quality): void {
    const prev = this.livePair;
    if (prev && prev.t === live.t && prev.a === live.a && prev.b === live.b) return;
    this.livePair = { a: live.a, b: live.b, t: live.t };
    this.apply(live, timeA, timeB);
    const steps = atLeast(quality, 'medium') ? ENV_STEPS : ENV_STEPS_LOW;
    const ends = (live.t === 0 || live.t === 1) && this.envT !== live.t;
    if (ends || Math.abs(live.t - this.envT) >= 1 / steps) { this.envT = live.t; this.rebuildEnvironment(); this.envRebuilds++; }
  }

  /** Quantas vezes o env map foi refeito por `setLive` (os testes conferem o teto: nunca por quadro). */
  get liveEnvRebuilds(): number { return this.envRebuilds; }

  private apply(live: LivePalette, timeA: TimeOfDay, timeB: TimeOfDay): void {
    const { p, a, b, t } = live;
    const lookA = sunLook(timeA); const lookB = sunLook(timeB);
    const look = t <= 0 ? lookA : t >= 1 ? lookB : lerpLook(lookA, lookB, t);
    this.night = p.light < 0.5;
    this.sunDirAbs.copy(fromAngles(p.sunEl, p.sunAz));
    const u = this.dome.material.uniforms;
    (u.uTop.value as THREE.Color).set(p.sky[0]);
    (u.uMid.value as THREE.Color).set(p.sky[1]);
    (u.uHorizon.value as THREE.Color).set(p.sky[2]);
    (u.uGlow.value as THREE.Color).set(p.skyGlow);
    (u.uBelow.value as THREE.Color).set(p.fog);
    (u.uSunDir.value as THREE.Vector3).copy(this.sunDirAbs);
    (u.uSunColor.value as THREE.Color).set(live.body);
    u.uSunSize.value = look.size; u.uHalo.value = look.halo; u.uGlowAmt.value = look.glow; u.uDisc.value = look.disc; u.uMoon.value = look.moon;
    // Estrelas: a opacidade segue a luz do período (todas à noite, nenhuma no entardecer); sem interpolar um booleano.
    const stars = t <= 0 ? (a.stars ? 1 : 0) : t >= 1 ? (b.stars ? 1 : 0) : starAlpha(p.light);
    const sm = this.stars.material as THREE.PointsMaterial;
    sm.opacity = stars; this.stars.visible = stars > 0.001;
    const cu = this.clouds.material.uniforms;
    // Nuvem: de noite não há lado iluminado, o lado da sombra vale para os dois — ao entrar na noite o iluminado vai para a cor da sombra e a nuvem se dissolve no céu.
    const litA = a.cloudLit ?? a.cloudShade; const litB = b.cloudLit ?? b.cloudShade;
    this.clouds.visible = p.cloudLit !== null;
    (cu.uLit.value as THREE.Color).set(t <= 0 ? litA : t >= 1 ? litB : mix(litA, litB, t));
    (cu.uShade.value as THREE.Color).set(p.cloudShade);
    const rim = duskAmount(p.light);
    (cu.uRim.value as THREE.Color).set(mix('#000000', p.skyGlow, rim));
    (cu.uHorizon.value as THREE.Color).set(p.sky[2]);
    this.sun.color.set(p.sunLight);
    this.sun.intensity = p.sunIntensity;
    // Sombra um pouco aberta: a hemisférica (céu) pinta o que o sol não alcança (mais aberta à noite).
    this.sun.shadow.intensity = 0.9 - 0.2 * lightsAmountNight(p.light);
    this.hemi.color.set(p.hemiSky);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.fog.color.set(p.fog);
    this.fogMul = p.fogDensity;
    this.fog.density = this.fogBase * this.fogMul;
    this.flareStrength = p.flare;
    const fu = this.flare.material.uniforms;
    fu.uStrength.value = p.flare;
    (fu.uColor.value as THREE.Color).set(p.flareColor);
    this.syncFlare();
    this.scene.environmentIntensity = p.envIntensity;
  }

  private rebuildEnvironment(): void {
    if (this.envTarget) { this.envTarget.dispose(); this.envTarget = null; }
    const envScene = new THREE.Scene();
    const dome = new THREE.Mesh(this.dome.geometry, this.dome.material);
    envScene.add(dome);
    this.envTarget = this.pmrem.fromScene(envScene, 0.02, 1, SKY_RADIUS * 1.5);
    this.scene.environment = this.envTarget.texture;
  }

  /** Gira o céu e a luz pelo rumo absoluto; anima nuvens e a sombra que segue o carro. */
  update(absHeading: number, time: number): void {
    this.group.rotation.y = absHeading;
    this.clouds.rotation.y = time * 0.004;
    const d = this.sunDirAbs;
    const c = Math.cos(absHeading); const s = Math.sin(absHeading);
    this.sunDirLocal.set(d.x * c + d.z * s, d.y, -d.x * s + d.z * c);
    this.sun.position.copy(this.sunDirLocal).multiplyScalar(260).add(this.target.position);
    (this.flare.material.uniforms.uSunDir.value as THREE.Vector3).copy(this.sunDirLocal);
  }

  get isNight(): boolean { return this.night; }

  dispose(): void {
    this.dome.geometry.dispose(); this.dome.material.dispose();
    this.stars.geometry.dispose(); (this.stars.material as THREE.Material).dispose();
    for (const g of this.cloudGeo) g.dispose();
    this.clouds.material.dispose();
    this.flare.geometry.dispose(); this.flare.material.dispose();
    if (this.envTarget) this.envTarget.dispose();
    this.pmrem.dispose();
    if (this.sun.shadow.map) this.sun.shadow.map.dispose();
  }
}
