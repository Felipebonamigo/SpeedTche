// Céu: domo com gradiente forte (horizonte → meio → topo) e o horizonte do lado do sol puxando
// para o brilho do período; sol grande com halo e lua com crateras no próprio shader; estrelas
// com brilho variado à noite; nuvens pintadas (impostores com a normal pintada num atlas, três tons pela luz do período, numa
// malha só; V4); luzes (direcional com sombras + hemisférica que dá a cor das sombras), névoa colorida e o
// env map (PMREM do próprio domo) para o reflexo nos carros. O grupo do céu gira pelo rumo
// absoluto do carro: é a única coisa "fixa no mundo".
import * as THREE from 'three';
import type { SceneryId, TimeOfDay } from '../core/types';
import type { Quality } from '../game/contracts';
import { atLeast } from '../game/quality';
import { hash2 } from './noise';
import { buildLensFlare } from './lensflare';
import { bodyColor, lightsAmount, mix, palette, starAlpha, type LivePalette, type Palette } from './palette';
import { applyGrade } from './stylize';
import { daylight, SKY_GRADIENT_GLSL } from './sky-paint';

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

export const SKY_FRAG = /* glsl */ `
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uBelow;
uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform float uSunSize; uniform float uHalo; uniform float uGlowAmt; uniform float uDisc; uniform float uMoon;
// V22/F3: a pintura nova. uPaint liga e desliga tudo de uma vez (0 = o céu de antes, exato: é o que o env map da IBL do carro vê); uDay = a luz do dia (0..1) das paradas
// do gradiente; uBloom = a bolha larga do lado do sol; uCirrus (0..1) e uCirrusCol = a camada alta de cirros, uCirrusQ (0 Baixa, 1 Média, 2 Alta/Ultra) = quantas oitavas, uCirrusT = o vento.
uniform float uPaint; uniform float uDay; uniform float uBloom; uniform float uCirrus; uniform float uCirrusQ; uniform float uCirrusT; uniform vec3 uCirrusCol;
varying vec3 vDir;
${SKY_GRADIENT_GLSL}
// Hash e ruído de valor 2D (sem textura): só os cirros e o dither leem.
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float hp = max(h, 0.0);
  float day = uDay * uPaint;
  // Gradiente: o de antes (horizonte → meio → topo) e, de dia, mais paradas (bruma clara rente ao chão, zênite anil).
  vec3 col = skyGradient(hp, uTop, uMid, uHorizon, day);
  // O horizonte do lado do sol puxa para o brilho do período (o laranja do entardecer).
  vec2 sh = normalize(uSunDir.xz + vec2(1e-5));
  vec2 dh = normalize(d.xz + vec2(1e-5));
  float az = dot(dh, sh) * 0.5 + 0.5;
  float band = exp(-hp * 6.0);
  col = mix(col, uGlow, band * az * az * az * uGlowAmt);
  // Dois tons por lado do sol (só pintura): o lado do sol esquenta numa faixa mais larga, o lado de lá esfria e puxa para o azul.
  float wide = exp(-hp * 3.2);
  col = mix(col, uGlow, wide * az * az * 0.2 * uPaint);
  col *= mix(vec3(1.0), vec3(0.94, 0.985, 1.04), wide * (1.0 - az) * day);
  // A bolha larga do sol (sem disco): lava o céu em volta dele, de dia o sol fica fora do quadro e é isto que dá "lado" ao céu.
  float cs = clamp(dot(d, uSunDir), -1.0, 1.0);
  float bl = smoothstep(0.3, 1.0, cs); bl *= bl;
  col = mix(col, uGlow, bl * uBloom * uPaint);
  // Cirros: uma camada fina e alta, por ruído numa placa em perspectiva (esticada ao longo do vento), mais forte em cima do que rente ao horizonte.
  if (uCirrusQ > 0.5 && uCirrus * uPaint > 0.01 && hp > 0.05) {
    vec2 q = d.xz / (hp + 0.18) * 1.7;
    q.x += uCirrusT;
    vec2 s = vec2(q.x * 0.55, q.y * 2.4);
    s.x += vn(s * 0.8 + 7.0) * 1.6;
    float n = vn(s) * 0.55 + vn(s * 2.1 + 3.0) * 0.3;
    n = uCirrusQ > 1.5 ? n + vn(s * 4.3 + 9.0) * 0.15 : n / 0.85;
    float cir = smoothstep(0.48, 0.78, n) * smoothstep(0.05, 0.22, hp) * (1.0 - 0.5 * smoothstep(0.6, 1.0, hp));
    col = mix(col, mix(uCirrusCol, uGlow, bl * 0.5), cir * uCirrus * 0.6 * uPaint);
  }
  // Abaixo do horizonte: a cor da névoa, para o chão distante sumir sem emenda.
  col = mix(col, uBelow, smoothstep(0.0, -0.06, h));
  float c = cs;
  float ang = acos(c);
  float halo = exp(-ang * uHalo);
  float wideHalo = exp(-ang * uHalo * 0.22);
  col += uSunColor * (halo * 0.5 + wideHalo * 0.07) * step(-0.02, h);
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
  // Dither de 1 LSB (triangular), no espaço linear do quadro e na escala do degrau de 8 bits da cor que sai: quebra o banding do gradiente suave. uPaint = 0 não põe nada.
  vec3 lsb = pow(max(col, vec3(0.0031308)), vec3(0.5833)) * 0.00892;
  col += (h21(gl_FragCoord.xy) + h21(gl_FragCoord.xy + vec2(17.0, 31.0)) - 1.0) * lsb * uPaint;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const CLOUD_VERT = /* glsl */ `
attribute vec3 aRight; attribute float aTone; attribute float aDrift;
uniform float uDrift;
varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying vec3 vR; varying float vTone;
void main() {
  vUv = uv;
  vTone = aTone;
  // V22/F3: cada nuvem gira em torno do eixo do céu pela deriva dela (a baixa e longe devagar, a alta mais depressa): paralaxe sem chamada nova.
  // Antes: o objeto inteiro girava (clouds.rotation.y), todas na mesma velocidade.
  float ang = uDrift * aDrift; float cs = cos(ang); float sn = sin(ang);
  mat3 spin = mat3(cs, 0.0, -sn, 0.0, 1.0, 0.0, sn, 0.0, cs);
  vec4 wp = modelMatrix * vec4(spin * position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * (spin * normal));
  vR = normalize(mat3(modelMatrix) * (spin * aRight));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

/**
 * Nuvem pintada (V4, docs/ondas/V4-pistas.md): impostor de um cúmulo com a normal PINTADA no atlas (`cloudAtlasImage`: as bolhas de um
 * campo de alturas, lisas por pixel, sem faceta), três tons pela luz do período (sombra → meio → luz, passagem de pincel), a barriga e as frestas
 * escuras (canal B), o forro de prata contra o sol e a perspectiva aérea perto do horizonte. `uFade` some com a noite.
 */
export const CLOUD_FRAG = /* glsl */ `
uniform sampler2D uAtlas; uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uRim; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform float uFade;
varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying vec3 vR; varying float vTone;
void main() {
  vec4 t = texture2D(uAtlas, vUv);
  float a = t.a * uFade;
  if (a < 0.004) discard;
  vec2 nt = t.rg * 2.0 - 1.0;
  float nz = sqrt(max(0.0, 1.0 - dot(nt, nt)));
  vec3 up = cross(normalize(vN), normalize(vR));
  vec3 n = normalize(nt.x * vR + nt.y * up + nz * vN);
  float l = dot(n, uSunDir) * 0.5 + 0.5;
  vec3 mid = mix(uShade, uLit, 0.55);
  vec3 c = mix(uShade, mid, smoothstep(0.16, 0.42, l));
  c = mix(c, uLit, smoothstep(0.5, 0.8, l));
  c = mix(uShade * 0.9, c, 0.5 + 0.5 * t.b);
  vec3 v = normalize(vW - cameraPosition);
  float toward = max(dot(v, uSunDir), 0.0);
  c += uRim * pow(1.0 - nz, 2.0) * (0.3 + 0.7 * pow(toward, 3.0));
  c *= vTone;
  c = mix(uHorizon, c, 0.4 + 0.6 * smoothstep(0.0, 0.16, v.y));
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

interface SunSetup { dir: THREE.Vector3; size: number; halo: number; glow: number; disc: number; moon: boolean; bloom: number }

/** O disco e o halo do período (o tamanho cresce no pôr do sol); a direção vem da paleta (`sunAz`, `sunEl`). */
function sunLook(time: TimeOfDay): Omit<SunSetup, 'dir'> {
  if (time === 'day') return { size: 0.038, halo: 7, glow: 0.35, disc: 4, moon: false, bloom: 0.45 }; // sol a 34°: sombras longas, halo no alto da tela; V22/F3: a bolha larga pinta o lado do sol (a luz não muda)
  if (time === 'dusk') return { size: 0.07, halo: 4.2, glow: 0.8, disc: 1.5, moon: false, bloom: 0.25 }; // sol grande e baixo, à frente, horizonte em brasa
  return { size: 0.05, halo: 9, glow: 0.35, disc: 1.35, moon: true, bloom: 0 }; // lua grande a 20°, para aparecer nas retas que apontam para ela
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

// ───────────────────────────── Nuvens pintadas (V4) ─────────────────────────────
// Até a V4: 9 cúmulos de icosaedros a 10°–25° de elevação (quase todos acima do quadro da câmera Alta, que vê o céu de 0° a ~18°) e ~20 mil
// triângulos. Agora: impostores (2 triângulos por nuvem) com a normal pintada num atlas, muitos e na faixa baixa do céu, numa malha só.

/**
 * Atlas das nuvens (V22/F3): 2 colunas × 5 linhas de células de 448 × 224 = 896 × 1120 (4 MiB; o de antes, 4 células de 512 × 256, tinha 2 MiB). Células 0–7 = cúmulos
 * (0–2 são os de antes, na escala da célula nova; 3–7 são novos: torre, achatado, par, inclinado, esgarçado); 8 e 9 = as duas faixas baixas (estratos).
 */
export const CLOUD_ATLAS = { w: 896, h: 1120, cellW: 448, cellH: 224, cols: 2, cumulus: 8, cells: 10 } as const;

/**
 * Uma nuvem do céu: azimute (rad, 0 = à frente na largada, + = à direita), elevação (graus) do centro, distância (m), tamanho (m), célula do atlas e a deriva (V22/F3:
 * quanto da velocidade-base de giro ela leva; as baixas e distantes andam mais devagar que as altas: paralaxe, sem chamada nova).
 */
export interface CloudSpec { az: number; el: number; dist: number; w: number; h: number; cell: number; flip: boolean; streak: boolean; tone: number; drift: number }

/** Quantas nuvens por qualidade (cúmulos, faixas baixas): a Baixa paga menos pixels transparentes. */
const CLOUD_COUNT: Readonly<Record<Quality, [number, number]>> = { low: [20, 5], medium: [28, 7], high: [36, 8], ultra: [36, 8] };

/** Velocidade-base do giro das nuvens (rad/s), a de antes da F3; cada nuvem a multiplica por `drift`. */
export const CLOUD_DRIFT_RAD_S = 0.004;

/**
 * V22/F3: a célula de cada cúmulo da volta (36 na Alta), na ordem do azimute: as 8 células do atlas, a menos usada primeiro, e NUNCA a mesma célula a menos de 4 posições
 * (a volta fecha): numa vista de ~80° cabem ~9 nuvens, e o olho não pode ver o mesmo desenho duas vezes. A célula é do índice `j` da Alta (a Baixa e a Média, subconjuntos, herdam).
 */
function cumulusCells(n: number): number[] {
  const out: number[] = []; const used = new Array<number>(CLOUD_ATLAS.cumulus).fill(0);
  for (let j = 0; j < n; j++) {
    const banned = new Set(out.slice(-4));
    const k = n - 1 - j; // as últimas posições também ficam a < 4 das primeiras, pela volta
    if (k < 3) for (const c of out.slice(0, 3 - k)) banned.add(c);
    let best = -1; let bestScore = Infinity;
    for (let c = 0; c < CLOUD_ATLAS.cumulus; c++) {
      if (banned.has(c)) continue;
      const score = used[c] + 0.5 * hash2(j, 700 + c); // a menos usada; o desempate é por hash (deterministico)
      if (score < bestScore) { bestScore = score; best = c; }
    }
    used[best]++; out.push(best);
  }
  return out;
}
const CUMULUS_CELL = cumulusCells(CLOUD_COUNT.high[0]);

/** As nuvens de uma qualidade (puro, determinístico): azimutes estratificados (cobrem a volta toda), elevação baixa, tamanho que cresce para cima. */
export function cloudLayout(q: Quality): CloudSpec[] {
  const [nc, ns] = CLOUD_COUNT[q];
  const out: CloudSpec[] = [];
  for (let k = 0; k < nc; k++) {
    // A Baixa e a Média são um subconjunto da Alta (mesmas posições, menos nuvens): o céu não muda de cara com a qualidade.
    const j = Math.floor((k * CLOUD_COUNT.high[0]) / nc);
    const az = ((j + 0.15 + 0.7 * hash2(j, 401)) / CLOUD_COUNT.high[0]) * Math.PI * 2;
    // Faixas de elevação: 15% baixas (2,5°–6°, atrás dos morros), 50% no meio (6°–13°, o céu que aparece por cima dos prédios e das serras), 35% altas
    // (13°–21°, o alto do quadro).
    const band = hash2(j, 402);
    const e = hash2(j, 404);
    const el = band < 0.15 ? 2.5 + 3.5 * e : band < 0.65 ? 6 + 7 * e : 13 + 8 * e;
    const dist = 950 + 300 * hash2(j, 405);
    const ang = (8 + 9 * hash2(j, 406)) * (0.72 + 0.28 * Math.min(1, el / 12)); // graus de largura: perto do horizonte, menor (mais longe)
    const w = dist * Math.tan((ang * Math.PI) / 180);
    // Paralaxe: a deriva cresce com a elevação (a nuvem alta está "mais perto" e passa mais depressa) e varia 10% por nuvem.
    const drift = (0.55 + 0.95 * Math.min(1, Math.max(0, (el - 2.5) / 18.5))) * (0.9 + 0.2 * hash2(j, 411));
    out.push({ az, el, dist, w, h: w * (0.44 + 0.14 * hash2(j, 407)), cell: CUMULUS_CELL[j], flip: hash2(j, 409) < 0.5, streak: false, tone: 0.93 + 0.1 * hash2(j, 410), drift });
  }
  for (let k = 0; k < ns; k++) {
    const j = Math.floor((k * CLOUD_COUNT.high[1]) / ns);
    const az = ((j + 0.3 + 0.4 * hash2(j, 501)) / CLOUD_COUNT.high[1]) * Math.PI * 2;
    const dist = 1150 + 120 * hash2(j, 502);
    const ang = 13 + 9 * hash2(j, 503);
    const w = dist * Math.tan((ang * Math.PI) / 180);
    out.push({ az, el: 1.3 + 2.6 * hash2(j, 504), dist, w, h: w * (0.1 + 0.05 * hash2(j, 505)), cell: CLOUD_ATLAS.cumulus + (j % 2), flip: hash2(j, 506) < 0.5, streak: true, tone: 0.95 + 0.06 * hash2(j, 507), drift: 0.5 * (0.9 + 0.2 * hash2(j, 508)) });
  }
  return out;
}

/**
 * As nuvens numa malha só (2 triângulos por nuvem, de frente para o centro do céu, onde a câmera está): posição, uv da célula (espelhada ou não),
 * a normal (para a câmera) e o "direita" do quadro (o shader monta a normal pintada no mundo), o tom da nuvem e a deriva dela (`aDrift`).
 */
export function buildClouds(q: Quality): THREE.BufferGeometry {
  const list = cloudLayout(q);
  const pos: number[] = []; const nor: number[] = []; const uv: number[] = []; const right: number[] = []; const tone: number[] = []; const drift: number[] = []; const idx: number[] = [];
  const c = new THREE.Vector3(); const r = new THREE.Vector3(); const u = new THREE.Vector3(); const Y = new THREE.Vector3(0, 1, 0);
  const { cols, cellW, cellH, w: AW, h: AH } = CLOUD_ATLAS;
  list.forEach((cl, i) => {
    c.copy(fromAngles(cl.el, (cl.az * 180) / Math.PI));
    r.crossVectors(c, Y).normalize();
    u.crossVectors(r, c).normalize();
    const center = c.clone().multiplyScalar(cl.dist);
    const cx = cl.cell % cols; const cy = Math.floor(cl.cell / cols);
    const u0 = (cx * cellW) / AW; const u1 = ((cx + 1) * cellW) / AW; const v0 = (cy * cellH) / AH; const v1 = ((cy + 1) * cellH) / AH;
    const [ul, ur] = cl.flip ? [u1, u0] : [u0, u1];
    // A barriga reta da célula fica 16% acima da borda de baixo: o centro do quadro sobe para a nuvem ficar na elevação dela.
    for (const [sx, sy, uu, vv] of [[-1, -1, ul, v0], [1, -1, ur, v0], [1, 1, ur, v1], [-1, 1, ul, v1]] as const) {
      const p = center.clone().addScaledVector(r, (sx * cl.w) / 2).addScaledVector(u, (sy * cl.h) / 2);
      pos.push(p.x, p.y, p.z);
      nor.push(-c.x, -c.y, -c.z);
      // A normal pintada é de quem olha a nuvem: espelhar a uv inverte o "direita" do quadro.
      const rr = cl.flip ? -1 : 1;
      right.push(r.x * rr, r.y * rr, r.z * rr);
      uv.push(uu, vv);
      tone.push(cl.tone);
      drift.push(cl.drift);
    }
    const o = i * 4;
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3); // anti-horário visto do centro (a câmera)
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aRight', new THREE.Float32BufferAttribute(right, 3));
  g.setAttribute('aTone', new THREE.Float32BufferAttribute(tone, 1));
  g.setAttribute('aDrift', new THREE.Float32BufferAttribute(drift, 1));
  g.setIndex(idx);
  return g;
}

/** Uma bolha do cúmulo (px na célula, y para cima) e o quanto ela vem para a frente (`z`, px). */
interface Puff { x: number; y: number; r: number; z: number; sx: number }

/** Escala das medidas absolutas (px) que a pintura de antes tinha numa célula de 512: a célula é de 448 agora. */
const PX = CLOUD_ATLAS.cellW / 512;

/** As bolhas de uma célula do atlas (a barriga reta fica em `base`): cada arquétipo é uma silhueta diferente. */
function cellPuffs(cell: number): { puffs: Puff[]; base: number } {
  const W = CLOUD_ATLAS.cellW; const H = CLOUD_ATLAS.cellH;
  const puffs: Puff[] = [];
  const base = H * 0.17;
  if (cell >= CLOUD_ATLAS.cumulus) {
    // Faixa baixa (estrato): bolhas achatadas e compridas ao longo, bordas macias. A 8 é a de antes; a 9 é mais curta e mais irregular.
    const seed = cell === 8 ? 900 + 3 * 37 : 1500;
    const n = cell === 8 ? 7 : 6;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const span = cell === 8 ? W - 300 * PX : (W - 300 * PX) * 0.78;
      const x0 = cell === 8 ? 150 * PX : (W - span) / 2;
      puffs.push({ x: x0 + t * span, y: H * (0.42 + (cell === 8 ? 0.12 : 0.2) * (hash2(seed, k) - 0.5)), r: H * (cell === 8 ? 0.1 + 0.1 * Math.sin(Math.PI * t) : 0.09 + 0.07 * Math.sin(Math.PI * t) ** 0.8) * (0.85 + 0.3 * hash2(seed, 20 + k)), z: 0, sx: cell === 8 ? 2.2 : 2.6 });
    }
    return { puffs, base: H * 0.18 };
  }
  const seed = cell < 3 ? 900 + cell * 37 : 900 + (10 + cell) * 37;
  const J = (k: number, amp: number): number => (hash2(seed, k) - 0.5) * amp * PX;
  if (cell < 3) {
    // Os três cúmulos de antes (a pintura que o diagnóstico elogiou): barriga, miolo e uma ou duas torres.
    const n = 5 + Math.floor(hash2(seed, 1) * 2);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const r = H * (0.17 + 0.07 * hash2(seed, 10 + k)) * (0.75 + 0.35 * Math.sin(Math.PI * t));
      puffs.push({ x: W * (0.1 + 0.8 * t) + J(30 + k, 18), y: base + r * 0.62, r, z: r * 0.25, sx: 1 });
    }
    const m = 2 + Math.floor(hash2(seed, 2) * 2);
    for (let k = 0; k < m; k++) {
      const t = (k + 0.5) / m;
      puffs.push({ x: W * (0.27 + 0.46 * t) + J(60 + k, 40), y: base + H * 0.3 + J(70 + k, 22), r: H * (0.25 + 0.07 * hash2(seed, 50 + k)), z: 0, sx: 1 });
    }
    const tops = 2 + Math.floor(hash2(seed, 3) * 2);
    for (let k = 0; k < tops; k++) {
      const r = H * (0.13 + 0.06 * hash2(seed, 80 + k));
      puffs.push({ x: W * (0.3 + 0.4 * ((k + hash2(seed, 90 + k)) / tops)), y: base + H * (0.5 + 0.1 * hash2(seed, 95 + k)), r, z: -r * 0.15, sx: 1 });
    }
    return { puffs, base };
  }
  // A fileira da barriga: as bolhas se tocam com folga (espaçamento ≤ 1,5 do raio médio: com a junta quase fechada a fresta vira um desfiladeiro e a normal pintada gira de golpe).
  const belly = (x0: number, x1: number, _n: number, rMin: number, rMax: number, tag: number): void => {
    const n = Math.max(2, Math.ceil((W * (x1 - x0)) / (1.45 * H * (rMin * 0.9 + rMax * 0.1))));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const r = H * (rMin + (rMax - rMin) * hash2(seed, tag + k)) * (0.8 + 0.25 * Math.sin(Math.PI * t));
      puffs.push({ x: W * (x0 + (x1 - x0) * t) + J(tag + 20 + k, 14), y: base + r * 0.62, r, z: r * 0.25, sx: 1 });
    }
  };
  const lump = (x: number, up: number, r: number, z = 0): void => { puffs.push({ x: W * x, y: base + H * up, r: H * r, z: H * z, sx: 1 }); };
  if (cell === 3) {
    // Torre (cúmulo congestus): estreita e alta, uma pilha de bolhas que afina para cima.
    belly(0.24, 0.76, 4, 0.13, 0.17, 10);
    lump(0.42, 0.22, 0.18); lump(0.58, 0.2, 0.17); lump(0.5, 0.38, 0.18);
    lump(0.47, 0.53, 0.14, -0.03); lump(0.55, 0.63, 0.11, -0.03);
  } else if (cell === 4) {
    // Achatado (cúmulo humilis): largo e baixo, quase sem torre.
    belly(0.16, 0.84, 6, 0.1, 0.14, 10);
    lump(0.4, 0.2, 0.15); lump(0.62, 0.18, 0.14); lump(0.5, 0.25, 0.13, -0.03);
  } else if (cell === 5) {
    // Par: dois cúmulos lado a lado, o da esquerda maior, com vão no meio.
    belly(0.08, 0.44, 3, 0.14, 0.19, 10);
    lump(0.22, 0.36, 0.22); lump(0.3, 0.55, 0.14, -0.03);
    belly(0.56, 0.9, 3, 0.1, 0.14, 40);
    lump(0.74, 0.26, 0.17); lump(0.79, 0.38, 0.13, -0.03);
  } else if (cell === 6) {
    // Inclinado: um lóbulo grande à esquerda que se arrasta em bolhas cada vez menores para a direita (o vento).
    belly(0.12, 0.6, 4, 0.16, 0.22, 10);
    lump(0.3, 0.4, 0.27); lump(0.22, 0.62, 0.15, -0.03); lump(0.38, 0.58, 0.14, -0.03);
    belly(0.7, 0.95, 3, 0.08, 0.11, 40);
    lump(0.78, 0.1, 0.1); lump(0.88, 0.08, 0.08);
  } else {
    // Esgarçado (cumulus fractus): um bando de bolhas pequenas soltas, de alturas diferentes.
    for (let k = 0; k < 7; k++) {
      const t = (k + 0.5) / 7;
      const r = H * (0.07 + 0.06 * hash2(seed, 10 + k));
      puffs.push({ x: W * (0.14 + 0.72 * t) + J(30 + k, 20), y: base + r * 0.6 + H * 0.26 * hash2(seed, 50 + k) * (1 - Math.abs(t - 0.5)), r, z: 0, sx: 1 + 0.5 * hash2(seed, 70 + k) });
    }
  }
  return { puffs, base };
}

/** Desfoque de caixa 3 × 3, `passes` vezes, no lugar (a borda repete o pixel de dentro). */
function smoothHeights(h: Float32Array, W: number, H: number, passes: number): void {
  const t = new Float32Array(h.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) t[y * W + x] = (h[y * W + Math.max(0, x - 1)] + h[y * W + x] + h[y * W + Math.min(W - 1, x + 1)]) / 3;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) h[y * W + x] = (t[Math.max(0, y - 1) * W + x] + t[y * W + x] + t[Math.min(H - 1, y + 1) * W + x]) / 3;
  }
}

/**
 * O atlas das nuvens em pixels (linha 0 = v 0): RG = a normal pintada (x, y no quadro, 0,5 + 0,5·n), B = a oclusão (barriga e frestas escuras),
 * A = a cobertura com a borda antisserrilhada. A altura de cada pixel é a união suave das bolhas (esferas), e a normal vem do gradiente dela: lisa,
 * sem faceta (tests/horizonte-suave.test.ts).
 */
let cloudAtlasCache: { width: number; height: number; data: Uint8Array } | null = null;
export function cloudAtlasImage(): { width: number; height: number; data: Uint8Array } {
  if (cloudAtlasCache) return cloudAtlasCache; // constante: montado uma vez por processo (cada Sky tem a sua textura, com os mesmos pixels)
  const { w: AW, h: AH, cellW: W, cellH: H, cols } = CLOUD_ATLAS;
  const data = new Uint8Array(AW * AH * 4);
  const hgt = new Float32Array(W * H); const cov = new Float32Array(W * H);
  for (let cell = 0; cell < CLOUD_ATLAS.cells; cell++) {
    const { puffs, base } = cellPuffs(cell);
    const streak = cell >= CLOUD_ATLAS.cumulus;
    const soft = streak ? 7 * PX : 1.6 * PX;
    let top = 0;
    for (const p of puffs) top = Math.max(top, p.y + p.r);
    // Metabolas: a soma de gaussianas das bolhas é lisa em todo lugar (a borda de uma bolha dentro de outra não vira risco); a forma é onde a soma
    // passa de T (a borda de uma bolha sozinha), e a altura sob ela é √(soma − T): de pé na silhueta (a normal deita) e redonda no miolo.
    // Núcleo compacto de Wyvill (1 − d²/R²)³, R = 1,35 r: liso (derivada 0 em R) e curto, as bolhas se fundem só na junta e os lóbulos ficam.
    const KR = 1.35; const T = (1 - 1 / (KR * KR)) ** 3;
    const slope = (6 / KR) * (1 / (KR * KR)) * (1 - 1 / (KR * KR)) ** 2; // |d soma / d d| na borda de uma bolha sozinha, × r
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let sum = 0; let rw = 0; let wsum = 0;
      for (const p of puffs) {
        const dx = (x + 0.5 - p.x) / p.sx; const dy = y + 0.5 - p.y;
        const q = 1 - (dx * dx + dy * dy) / (p.r * p.r * KR * KR);
        if (q <= 0) continue;
        const e = q * q * q;
        sum += e; rw += e * p.r; wsum += e;
      }
      const i = y * W + x;
      const r = wsum > 1e-6 ? rw / wsum : 40 * PX;
      hgt[i] = sum > T ? r * 1.1 * Math.sqrt((sum - T) / (1 - T)) : 0;
      // Cobertura antisserrilhada: a soma cruza T com inclinação ~slope/r por pixel.
      const d = (sum - T) / ((slope / r) * soft);
      // A barriga reta: abaixo da base a cobertura cai (borda macia).
      const belly = Math.min(1, Math.max(0, (y + 0.5 - base + 2 * PX) / (5 * PX)));
      cov[i] = Math.min(1, Math.max(0, 0.5 + 0.5 * d)) * belly;
    }
    // Os cúmulos novos (3–7): um desfoque leve da altura antes da normal (a junta entre bolhas de tamanhos diferentes afunda; a normal pintada tem de seguir lisa, < 12° entre
    // pixels vizinhos: tests/horizonte-suave.test.ts). Os de antes e as faixas ficam como estavam.
    if (cell >= 3 && !streak) smoothHeights(hgt, W, H, 3);
    const ox = (cell % cols) * W; const oy = Math.floor(cell / cols) * H;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const hx = (hgt[y * W + Math.min(W - 1, x + 1)] - hgt[y * W + Math.max(0, x - 1)]) / 2;
      const hy = (hgt[Math.min(H - 1, y + 1) * W + x] - hgt[Math.max(0, y - 1) * W + x]) / 2;
      const flat = streak ? 2.2 : 1;
      let nx = -hx; let ny = -hy; let nz = flat;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      // Oclusão: a barriga escurece (de baixo até ~45% da altura) e a fresta entre bolhas (onde a altura afunda) também.
      const up = Math.min(1, Math.max(0, (y - base) / Math.max(1, (top - base) * 0.45)));
      const crease = Math.min(1, hgt[i] / (30 * PX));
      const ao = (0.35 + 0.65 * up * up * (3 - 2 * up)) * (0.72 + 0.28 * crease);
      const o = ((oy + y) * AW + ox + x) * 4;
      data[o] = Math.round(255 * (0.5 + 0.5 * nx)); data[o + 1] = Math.round(255 * (0.5 + 0.5 * ny));
      data[o + 2] = Math.round(255 * Math.min(1, streak ? 0.75 + 0.25 * ao : ao)); data[o + 3] = Math.round(255 * cov[i]);
    }
  }
  cloudAtlasCache = { width: AW, height: AH, data };
  return cloudAtlasCache;
}

/** Refeitas do env map por transição (M6): o PMREM é caro, a mudança entre dois passos de 1/8 é só reflexo. */
const ENV_STEPS = 8;
const ENV_STEPS_LOW = 3;

type SunLook = Omit<SunSetup, 'dir' | 'moon'> & { moon: number };

/** `sunLook` com a lua como 0..1 e interpolado entre dois períodos (o sol grande e baixo do entardecer encolhe e vira a lua grande da noite). */
function lerpLook(a: Omit<SunSetup, 'dir'>, b: Omit<SunSetup, 'dir'>, t: number): SunLook {
  const l = (x: number, y: number): number => x + (y - x) * t;
  return { size: l(a.size, b.size), halo: l(a.halo, b.halo), glow: l(a.glow, b.glow), disc: l(a.disc, b.disc), moon: l(a.moon ? 1 : 0, b.moon ? 1 : 0), bloom: l(a.bloom, b.bloom) };
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
  /** Nuvens por qualidade (V4): a Baixa e a Média com menos nuvens (subconjunto das da Alta). */
  private readonly cloudGeo: Record<'low' | 'medium' | 'high', THREE.BufferGeometry> = { low: buildClouds('low'), medium: buildClouds('medium'), high: buildClouds('high') };
  private readonly cloudAtlas: THREE.DataTexture;
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
  /** V12: as cores que o domo mostra à IBL (a luz que cai no carro): o céu e a névoa "de luz" da paleta, não o roxo que se pinta à noite. */
  private readonly envSky = { top: new THREE.Color(), mid: new THREE.Color(), horizon: new THREE.Color(), below: new THREE.Color() };
  private readonly envSaved = { top: new THREE.Color(), mid: new THREE.Color(), horizon: new THREE.Color(), below: new THREE.Color() };
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
        uPaint: { value: 1 }, uDay: { value: 0 }, uBloom: { value: 0 }, uCirrus: { value: 0 }, uCirrusQ: { value: 2 }, uCirrusT: { value: 0 }, uCirrusCol: { value: new THREE.Color('#ffffff') },
      },
    });
    applyGrade(mat);
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 48, 24), mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);
    this.stars = buildStars();
    this.group.add(this.stars);
    const atlas = cloudAtlasImage();
    this.cloudAtlas = new THREE.DataTexture(atlas.data, atlas.width, atlas.height, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.cloudAtlas.generateMipmaps = true;
    this.cloudAtlas.minFilter = THREE.LinearMipmapLinearFilter;
    this.cloudAtlas.magFilter = THREE.LinearFilter;
    this.cloudAtlas.needsUpdate = true; // dado (normal, oclusão, cobertura): sem espaço de cor
    // Transparente e sem escrever profundidade: vai no passe dos transparentes, depois de tudo o que é opaco (montanha e prédio na frente cobrem a
    // nuvem pelo teste de profundidade) e antes dos outros transparentes (renderOrder −9).
    const cloudMat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, fog: false, transparent: true, depthWrite: false,
      uniforms: {
        uAtlas: { value: this.cloudAtlas },
        uLit: { value: new THREE.Color('#ffffff') }, uShade: { value: new THREE.Color('#c8d8f0') }, uRim: { value: new THREE.Color('#000000') },
        uHorizon: { value: new THREE.Color('#d0f0ff') }, uSunDir: { value: this.sunDirLocal }, uFade: { value: 1 }, uDrift: { value: 0 },
      },
    });
    applyGrade(cloudMat);
    this.clouds = new THREE.Mesh(this.cloudGeo.high, cloudMat);
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
    this.clouds.geometry = this.cloudGeo[atLeast(q, 'high') ? 'high' : atLeast(q, 'medium') ? 'medium' : 'low'];
    const size = atLeast(q, 'high') ? 2048 : atLeast(q, 'medium') ? 1024 : 0;
    this.sun.castShadow = size > 0;
    if (size > 0 && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.dome.material.uniforms.uCirrusQ.value = atLeast(q, 'high') ? 2 : atLeast(q, 'medium') ? 1 : 0; // a Baixa não paga os cirros; a Média, 2 oitavas
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
    this.envSky.top.set(p.skyLight[0]); this.envSky.mid.set(p.skyLight[1]); this.envSky.horizon.set(p.skyLight[2]); this.envSky.below.set(p.fogLight);
    (u.uSunDir.value as THREE.Vector3).copy(this.sunDirAbs);
    (u.uSunColor.value as THREE.Color).set(live.body);
    u.uSunSize.value = look.size; u.uHalo.value = look.halo; u.uGlowAmt.value = look.glow; u.uDisc.value = look.disc; u.uMoon.value = look.moon;
    u.uBloom.value = look.bloom; u.uDay.value = daylight(p.light); // V22/F3: a pintura nova do céu, só uniforme
    // Estrelas: a opacidade segue a luz do período (todas à noite, nenhuma no entardecer); sem interpolar um booleano.
    const stars = t <= 0 ? (a.stars ? 1 : 0) : t >= 1 ? (b.stars ? 1 : 0) : starAlpha(p.light);
    const sm = this.stars.material as THREE.PointsMaterial;
    sm.opacity = stars; this.stars.visible = stars > 0.001;
    const cu = this.clouds.material.uniforms;
    // Nuvem: de noite não há lado iluminado, o lado da sombra vale para os dois — ao entrar na noite o iluminado vai para a cor da sombra e a nuvem se dissolve no céu.
    const litA = a.cloudLit ?? a.cloudShade; const litB = b.cloudLit ?? b.cloudShade;
    this.clouds.visible = p.cloudLit !== null;
    (cu.uLit.value as THREE.Color).set(t <= 0 ? litA : t >= 1 ? litB : mix(litA, litB, t));
    const rim = duskAmount(p.light);
    // No entardecer o lado da sombra puxa para o horizonte do período (V4): contra o sol as nuvens eram manchas roxas pesadas sobre o céu rosa.
    (cu.uShade.value as THREE.Color).set(mix(p.cloudShade, p.sky[2], 0.4 * rim));
    // Forro de prata: de dia, um branco fraco na borda; no entardecer, o brilho do sol (V4: era só no entardecer).
    (cu.uRim.value as THREE.Color).set(mix('#3a3a3a', p.skyGlow, rim));
    (cu.uHorizon.value as THREE.Color).set(p.sky[2]);
    // Somem com a noite pela luz (as luzes da cidade acendendo), sem piscar; à noite fechada, `visible` desliga a chamada.
    cu.uFade.value = 1 - lightsAmountNight(p.light);
    // Cirros: a mesma luz e o mesmo sumiço das nuvens (a noite dissolve os dois).
    u.uCirrus.value = cu.uFade.value; (u.uCirrusCol.value as THREE.Color).copy(cu.uLit.value as THREE.Color);
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
    // V12: a IBL (a luz difusa que o carro recebe do céu) vê o céu "de luz", e não o roxo da noite: as cores do domo trocam só durante a captura do env map (rara: troca de
    // pista, passo da corrida que muda) e voltam. Mesmos uniformes, nenhum programa novo.
    const u = this.dome.material.uniforms;
    const paint = u.uPaint.value as number; u.uPaint.value = 0; // V22/F3: a IBL (a luz que o carro recebe) vê o céu de antes: a pintura nova é só para o olho
    const slots = [['uTop', 'top'], ['uMid', 'mid'], ['uHorizon', 'horizon'], ['uBelow', 'below']] as const;
    for (const [uni, k] of slots) { this.envSaved[k].copy(u[uni].value as THREE.Color); (u[uni].value as THREE.Color).copy(this.envSky[k]); }
    try {
      this.envTarget = this.pmrem.fromScene(envScene, 0.02, 1, SKY_RADIUS * 1.5);
    } finally {
      for (const [uni, k] of slots) (u[uni].value as THREE.Color).copy(this.envSaved[k]);
      u.uPaint.value = paint;
    }
    this.scene.environment = this.envTarget.texture;
  }

  /** Gira o céu e a luz pelo rumo absoluto; anima nuvens e a sombra que segue o carro. */
  update(absHeading: number, time: number): void {
    this.group.rotation.y = absHeading;
    // V22/F3: a deriva é por nuvem, no vertex shader (aDrift): o objeto não gira mais; os cirros andam com o vento.
    this.clouds.material.uniforms.uDrift.value = time * CLOUD_DRIFT_RAD_S;
    this.dome.material.uniforms.uCirrusT.value = time * 0.012;
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
    for (const g of Object.values(this.cloudGeo)) g.dispose();
    this.cloudAtlas.dispose();
    this.clouds.material.dispose();
    this.flare.geometry.dispose(); this.flare.material.dispose();
    if (this.envTarget) this.envTarget.dispose();
    this.pmrem.dispose();
    if (this.sun.shadow.map) this.sun.shadow.map.dispose();
  }
}
