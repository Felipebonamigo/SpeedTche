// Construções: prédios (fachadas com textura de janelas que acende à noite), casas por país, torres
// (TV, mastro, farol, caixa-d'água, cata-vento), cercas, postes com fios, e os pontos de referência
// (turbina eólica, torii, pagode, igreja, barcos). Prédios olham a pista pelo +X com a fachada em x = 0
// (o renderizador põe x = 0 na borda de colisão); torres são simétricas e ocupam ±R.
// Puro: só Three, sem DOM.
import * as THREE from 'three';
import { hash2 } from '../noise';
import { bakeAO, bevelBox, box, cone, cyl, facadeCell, gable, hip, ico, jitter, lean, lumpy, merge, mergeRound, mottle, paint, roundedBar, shadeY, sphere, tf, tintUp, tintUpSoft, tris, type Geo, type MatKey, type Model, type ModelPart } from './geom';
import { CREASE, ROOF_TURN_DEG, smoothNormals } from '../normals';

/** Tamanho (m) de uma repetição de cada textura de fachada (4 colunas de janela × 4 andares). */
export const FACADE_TILE: Record<'office' | 'apartment' | 'classic' | 'house', [number, number]> = {
  office: [12, 14], apartment: [12, 12], classic: [14, 15.2], house: [12, 12],
};

type FacadeStyle = keyof typeof FACADE_TILE;

/** V22/F5: liga/desliga a oclusão de ambiente assada (`ao`: pé e sob os beirais) e os adereços de telhado (`roof`); só os testes e o antes × depois desligam, o jogo sempre os tem. */
export const structureDetail = { ao: true, roof: true };

/**
 * V22/F5: oclusão de ambiente assada na COR dos vértices de um prédio (a luz que o sol e o céu não dão nos cantos): (1) o pé, de 0 a 1,4 m do chão, escurece até
 * 50% (o contato com a calçada: sem isto o prédio "flutua" na grama); (2) as faces voltadas para baixo (a barriga das lajes, da cornija, do toldo, dos beirais de 3 m
 * para cima) escurecem 38%. A parede logo abaixo de cada laje leva a sua sombra na textura da fachada (`eaveShade`, textures.ts). O pé pede vértices: `sliceY` corta os
 * triângulos que cruzam 0,4 e 1,0 m (menos os de fundo, voltados para trás: a pista nunca os vê), com a uv, a cor e a normal interpoladas (~+100 △ por prédio).
 */
const FOOT_REACH = 1.4;
const FOOT_STRENGTH = 0.6;
const UNDER_STRENGTH = 0.38;
const FOOT_PLANES = [0.4, 1.0] as const;

/** O mesmo contato escuro do pé, sem cortar a malha (props pequenos: poste, placa): a cor de cada vértice a menos de `reach` m do chão escurece até `strength`. */
export function footShade(g: Geo, reach = 1.0, strength = 0.45): Geo {
  if (!structureDetail.ao) return g;
  const p = g.attributes.position as THREE.BufferAttribute; const c = g.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < -0.01 || y >= reach) continue;
    const f = 1 - strength * Math.pow(1 - Math.max(0, y) / reach, 1.5);
    c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f);
  }
  return g;
}

/** Corta uma malha não indexada nos planos y = `planes` (todos os atributos interpolados, normal renormalizada); o vinco de cada triângulo é mantido. */
export function sliceY(g: Geo, planes: readonly number[], skip?: (nx: number, ny: number, nz: number) => boolean): Geo {
  if (g.index) throw new Error('sliceY: a malha tem de ser não indexada');
  const keys = Object.keys(g.attributes);
  const sizes = keys.map((k) => (g.attributes[k] as THREE.BufferAttribute).itemSize);
  const stride = sizes.reduce((a, b) => a + b, 0);
  const posAt = keys.indexOf('position') === 0 ? 0 : -1;
  if (posAt !== 0) throw new Error('sliceY: a posição tem de ser o primeiro atributo');
  const normAt = keys.indexOf('normal') >= 0 ? sizes.slice(0, keys.indexOf('normal')).reduce((a, b) => a + b, 0) : -1;
  const count = (g.attributes.position as THREE.BufferAttribute).count;
  let verts: number[][] = [];
  for (let i = 0; i < count; i++) {
    const v = new Array<number>(stride); let o = 0;
    keys.forEach((k, ki) => { const arr = (g.attributes[k] as THREE.BufferAttribute).array; for (let c = 0; c < sizes[ki]; c++) v[o++] = arr[i * sizes[ki] + c]; });
    verts.push(v);
  }
  const lerp = (a: number[], b: number[], t: number): number[] => a.map((x, i) => x + (b[i] - x) * t);
  for (const y0 of planes) {
    const out: number[][] = [];
    for (let t = 0; t < verts.length; t += 3) {
      const tri = [verts[t], verts[t + 1], verts[t + 2]];
      const d = tri.map((v) => v[1] - y0);
      if (skip && normAt >= 0 && skip((tri[0][normAt] + tri[1][normAt] + tri[2][normAt]) / 3, (tri[0][normAt + 1] + tri[1][normAt + 1] + tri[2][normAt + 1]) / 3, (tri[0][normAt + 2] + tri[1][normAt + 2] + tri[2][normAt + 2]) / 3)) { out.push(...tri); continue; }
      if (d.every((x) => x >= -1e-6) || d.every((x) => x <= 1e-6)) { out.push(...tri); continue; }
      const lower: number[][] = []; const upper: number[][] = [];
      for (let k = 0; k < 3; k++) {
        const a = tri[k]; const b = tri[(k + 1) % 3]; const da = d[k]; const db = d[(k + 1) % 3];
        if (da <= 1e-6) lower.push(a);
        if (da >= -1e-6) upper.push(a);
        if ((da > 1e-6 && db < -1e-6) || (da < -1e-6 && db > 1e-6)) { const m = lerp(a, b, da / (da - db)); lower.push(m); upper.push(m); }
      }
      for (const poly of [lower, upper]) for (let k = 1; k + 1 < poly.length; k++) out.push(poly[0], poly[k], poly[k + 1]);
    }
    verts = out;
  }
  const res = new THREE.BufferGeometry();
  let off = 0;
  keys.forEach((k, ki) => {
    const arr = new Float32Array(verts.length * sizes[ki]);
    verts.forEach((v, i) => { for (let c = 0; c < sizes[ki]; c++) arr[i * sizes[ki] + c] = v[off + c]; });
    if (k === 'normal') for (let i = 0; i < verts.length; i++) { const l = Math.hypot(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]) || 1; arr[i * 3] /= l; arr[i * 3 + 1] /= l; arr[i * 3 + 2] /= l; }
    res.setAttribute(k, new THREE.BufferAttribute(arr, sizes[ki]));
    off += sizes[ki];
  });
  Object.assign(res.userData, g.userData);
  g.dispose();
  return res;
}

/** A oclusão do pé e da barriga das lajes (ver acima). Devolve a malha cortada (a original é descartada). Desligada por `structureDetail.ao`. */
export function occlude(g: Geo): Geo {
  if (!structureDetail.ao || !g.getAttribute('color') || g.index) return g;
  const o = sliceY(g, FOOT_PLANES, (nx) => nx < -0.5); // o fundo (voltado para trás) não leva corte
  const p = o.attributes.position as THREE.BufferAttribute; const n = o.attributes.normal as THREE.BufferAttribute | undefined; const c = o.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i); let f = 1;
    if (y >= -0.01 && y < FOOT_REACH) { const t = 1 - Math.max(0, y) / FOOT_REACH; f *= 1 - FOOT_STRENGTH * t * Math.sqrt(t); }
    if (n && y > 2.5) { const ny = n.getY(i); if (ny < -0.4) f *= 1 - UNDER_STRENGTH * Math.min(1, (-ny - 0.4) / 0.4); }
    if (f < 1) c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f);
  }
  return o;
}

/** Caixa com UV em metros para a textura da fachada; topo e fundo apontam para um canto sem janela. */
function facadeBox(w: number, h: number, d: number, style: FacadeStyle, color: string, m: THREE.Matrix4, vOffset = 0): Geo {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const [tu, tv] = FACADE_TILE[style];
  const faces: Array<[number, number] | null> = [[d, h], [d, h], null, null, [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const s = faces[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (!s) uv.setXY(i, 0.01, 0.01);
      else uv.setXY(i, (uv.getX(i) * s[0]) / tu, (uv.getY(i) * s[1] + vOffset) / tv);
    }
  }
  return paint(g, color, m, true);
}

interface Parts {
  flat: Geo[]; glow: Geo[]; beacon: Geo[]; facade: Map<MatKey, Geo[]>;
  /** Peças do kit redondo (caixa com bisel, barra de borda redonda): trazem a normal própria e vão por `mergeRound`. */ round: Geo[];
  /** V4: a célula do atlas da fachada (0 = o visual de antes). */
  look: number;
}
function newParts(look = 0): Parts { return { flat: [], glow: [], beacon: [], facade: new Map(), round: [], look }; }

/**
 * V4 (docs/ondas/V4-pistas.md): o que muda entre os 4 visuais de um prédio de cidade, além da célula da fachada e da tinta (catalog.ts): a cor do
 * toldo, a do letreiro da loja, a do térreo e o ritmo das varandas. A pegada, a altura e a frente são as mesmas nos 4 (pistas-v4.test.ts).
 */
const AWNINGS = ['#d63a3a', '#1e88e5', '#ffd23f', '#3ddc84', '#ff8a1f', '#7a3fb8', '#e85aa8', '#2f8a6a'];
const SHOP_GLOW = ['#fff0c0', '#ffd8a0', '#d8f0ff', '#ffe0f0'];
const GROUND_FLOOR = ['#5a5e66', '#4a4440', '#6a6258', '#3e4a52'];
const awningOf = (seed: number, look: number, base: readonly string[]): string => (look === 0 ? base[seed % base.length] : AWNINGS[(seed + look * 3) % AWNINGS.length]);
/** Andares com laje de varanda: todo andar (0), todo andar (1, a fita de vidro pede o ritmo), um sim um não (2), todo andar (3). */
const slabEvery = (look: number): number => (look === 2 ? 2 : 1);
function addFacade(p: Parts, style: MatKey, g: Geo): void {
  const list = p.facade.get(style) ?? [];
  list.push(g);
  p.facade.set(style, list);
}
function toModel(p: Parts, height: number, blob = 0, shadow = true): Model {
  const parts: ModelPart[] = [];
  if (p.flat.length) parts.push({ geometry: occlude(shadeY(merge(p.flat), -1, height, 0.78, 1.06)), mat: 'flat', shadow });
  for (const [mat, list] of p.facade) parts.push({ geometry: facadeCell(occlude(merge(list)), p.look), mat, shadow });
  if (p.glow.length) parts.push({ geometry: merge(p.glow), mat: 'glow' });
  if (p.beacon.length) parts.push({ geometry: merge(p.beacon), mat: 'beacon' });
  return { parts, blob };
}

/** Fachada de caixa com bisel (kit redondo): `r` arredonda a quina vertical e o topo; a face reta fica no plano, com a uv das janelas. */
function bevelFacade(w: number, h: number, d: number, style: FacadeStyle, color: string, m: THREE.Matrix4, r: number, vOffset = 0): Geo {
  return paint(bevelBox(w, h, d, r, FACADE_TILE[style], vOffset), color, m, true);
}

/** Barra de borda redonda (cornija, laje de varanda, toldo): seção `w` × `h` com os cantos de cima em arco, comprimento `L` em Z, pé em y = 0 da peça. */
function roundBar(w: number, h: number, L: number, r: number, color: string, m: THREE.Matrix4): Geo {
  return paint(smoothNormals(roundedBar(w, h, L, r, 1), 50), color, m);
}

/**
 * Fecha um prédio do kit redondo: o liso comum (`flat`, com o vinco de construção e a regra do telhado) e as peças do kit (`round`, com as normais
 * próprias) viram UMA parte `flat`; cada fachada vira uma parte (`mergeRound`). A luz assada é um degradê de altura (pé ≥ 16% mais escuro que o topo),
 * barato o bastante para todo prédio da cidade (o `bakeAO` por raio da orla custa ~300 ms por modelo, e a cidade monta dezenas).
 */
function toRoundModel(p: Parts, height: number, shadow = true): Model {
  const parts: ModelPart[] = [];
  const lisas: Geo[] = [];
  if (p.flat.length) lisas.push(smoothNormals(merge(p.flat), CREASE.built, { roofTurnDeg: ROOF_TURN_DEG }));
  lisas.push(...p.round);
  if (lisas.length) parts.push({ geometry: occlude(shadeY(mergeRound(lisas), -1, height, 0.78, 1.06)), mat: 'flat', shadow });
  for (const [mat, list] of p.facade) parts.push({ geometry: facadeCell(occlude(shadeY(mergeRound(list), 0, height, 0.82, 1.05)), p.look), mat, shadow });
  if (p.glow.length) parts.push({ geometry: merge(p.glow), mat: 'glow' });
  if (p.beacon.length) parts.push({ geometry: merge(p.beacon), mat: 'beacon' });
  return { parts, blob: 0 };
}

/** Fundação que entra 5 m no chão: prédio em terreno inclinado não flutua. */
function foundation(p: Parts, L: number, D: number, color = '#8f8a82'): void {
  p.flat.push(paint(box(D, 5, L), color, tf(-D / 2, -2.4, 0)));
}

// ───────────────────────────── Adereços de telhado (V22/F5) ─────────────────────────────

/** Onde um telhado plano pode receber adereços: a cota do piso (topo da cornija), a borda da frente (x) e o fundo, a meia largura em Z, os retângulos já ocupados e a altura máxima permitida (acima do piso). */
interface Roof { y: number; front: number; back: number; zHalf: number; keep: ReadonlyArray<readonly [number, number, number, number]>; cap: number }

const AC_COLORS = ['#d4d8dc', '#c2c8d0', '#dcd6cc'];
const TANK_COLORS = ['#6a8aa8', '#c9c4b8', '#8a6a52', '#7a9a8a'];
const cylN = (rt: number, rb: number, h: number, seg: number): Geo => new THREE.CylinderGeometry(rt, rb, h, seg, 1, false);
const coneN = (r: number, h: number, seg: number): Geo => new THREE.ConeGeometry(r, h, seg);

/**
 * O topo de um prédio de cidade: um banco de condicionadores de ar junto à borda da frente (o que se vê de baixo), uma caixa-d'água de plinto, um mastro de antena com travessa
 * e um respiro. Posição e quantidade vêm da semente (e o visual espelha em Z), a altura nunca passa de `cap` (a altura total do prédio não muda: V4 ±1 cm). ~170 △, tudo
 * liso (`flat`), nada sólido. Não inventa nada fora da pegada: x entre `back` e `front`, z dentro de ±`zHalf`.
 */
function rooftop(p: Parts, seed: number, look: number, r: Roof): void {
  if (!structureDetail.roof) return;
  const h = (k: number): number => hash2(seed * 7 + 5, k);
  const mir = look % 2 === 0 ? 1 : -1;
  const hits = (x: number, z: number, hx: number, hz: number): boolean => r.keep.some(([x0, x1, z0, z1]) => x + hx > x0 - 0.2 && x - hx < x1 + 0.2 && z + hz > z0 - 0.2 && z - hz < z1 + 0.2) || Math.abs(z) + hz > r.zHalf - 0.3;
  const taken: Array<[number, number, number, number]> = [];
  const free = (x: number, z: number, hx: number, hz: number): boolean => !hits(x, z, hx, hz) && !taken.some(([tx, tz, thx, thz]) => Math.abs(x - tx) < hx + thx && Math.abs(z - tz) < hz + thz);
  const put = (x: number, z: number, hx: number, hz: number): void => { taken.push([x, z, hx, hz]); };
  // Banco de condicionadores: 3 aparelhos de 1,3 × 0,9 × 0,8 m, a ~1,3 m da borda (visíveis de baixo), em fila ao longo de Z a partir de um ponto sorteado.
  const acX = r.front - 1.3;
  const z0 = mir * (-r.zHalf * 0.55 + h(1) * r.zHalf * 0.6);
  let placed = 0;
  for (let k = 0; k < 8 && placed < 3; k++) {
    const z = z0 + mir * k * 1.7;
    if (!free(acX, z, 0.7, 0.55)) continue;
    put(acX, z, 0.7, 0.55);
    const c = AC_COLORS[(seed + placed + look) % AC_COLORS.length];
    p.flat.push(paint(box(1.3, 0.9, 0.8), c, tf(acX, r.y + 0.45, z)));
    p.flat.push(paint(box(1.0, 0.06, 0.55), '#4a4e56', tf(acX, r.y + 0.93, z)));
    placed++;
  }
  // Caixa-d'água de plinto: base de concreto, tanque de 8 faces, tampa cônica (a cor sai da semente).
  for (let k = 0; k < 6; k++) {
    const z = mir * (-r.zHalf * 0.6 + ((h(2) + k * 0.37) % 1) * r.zHalf * 1.2);
    const tx = r.front - 3.4;
    if (!free(tx, z, 1.3, 1.3)) continue;
    put(tx, z, 1.3, 1.3);
    p.flat.push(paint(box(2.4, 0.4, 2.4), '#a8a49c', tf(tx, r.y + 0.2, z)));
    p.flat.push(paint(cylN(1.05, 1.05, 1.5, 8), TANK_COLORS[(seed + look) % TANK_COLORS.length], tf(tx, r.y + 1.15, z)));
    p.flat.push(paint(coneN(1.15, 0.35, 8), '#8a8f96', tf(tx, r.y + 2.07, z)));
    break;
  }
  // Mastro de antena com travessa (TV, rádio) perto da borda; respiro baixo atrás.
  for (let k = 0; k < 6; k++) {
    const z = mir * ((h(3) + k * 0.41) % 1 * 2 - 1) * (r.zHalf - 1.0);
    const mx = r.front - 0.8;
    if (!free(mx, z, 0.5, 0.7)) continue;
    put(mx, z, 0.5, 0.7);
    const mh = Math.min(r.cap, 2.3);
    p.flat.push(paint(cylN(0.04, 0.06, mh, 5), '#b8bcc2', tf(mx, r.y + mh / 2, z)));
    p.flat.push(paint(box(0.04, 0.04, 1.2), '#b8bcc2', tf(mx, r.y + mh * 0.8, z)));
    break;
  }
  const vx = r.back + 1.4;
  for (let k = 0; k < 4; k++) {
    const z = mir * ((h(4) + k * 0.29) % 1 * 2 - 1) * (r.zHalf - 1.0);
    if (!free(vx, z, 0.4, 0.4)) continue;
    put(vx, z, 0.4, 0.4);
    p.flat.push(paint(box(0.6, 0.7, 0.6), '#9aa0a8', tf(vx, r.y + 0.35, z)));
    break;
  }
}

// ───────────────────────────── Prédios de cidade ─────────────────────────────

/** Torre de vidro sobre embasamento; coroa escalonada e antena com luz de balizamento. */
export function glassTower(seed: number, floors: number, tint: string, look = 0): Model {
  const p = newParts(look);
  const L = 18; const D = 18;
  foundation(p, L, D);
  addFacade(p, 'office', bevelFacade(D, 7, L, 'office', '#dfe6ee', tf(-D / 2, 3.5, 0), 0.7)); // o embasamento
  p.round.push(roundBar(D + 0.7, 0.55, L + 0.7, 0.2, '#c8ccd2', tf(-D / 2, 7.0, 0))); // cornija do embasamento
  // Marquise da entrada: aba de borda redonda que sai 1,8 m da fachada, ligeiramente caída.
  p.round.push(roundBar(1.9, 0.24, L * 0.55, 0.1, ['#9aa3ad', '#5a6470', '#b8a888', '#3e4a56'][look], tf(0.95, 4.1, 0, 1, 1, 1, 0, 0, -0.12)));
  const th = floors * 3.5;
  const inset = 2;
  addFacade(p, 'office', bevelFacade(D - inset * 2, th, L - inset * 2, 'office', tint, tf(-D / 2, 7.45 + th / 2, 0), 0.8));
  const top = 7.45 + th;
  p.round.push(roundBar(D - inset * 2 + 0.6, 0.6, L - inset * 2 + 0.6, 0.22, '#d8dde4', tf(-D / 2, top, 0))); // cornija do corpo
  const crown = 3 + hash2(seed, 1) * 5;
  addFacade(p, 'office', bevelFacade(D - 8, crown, L - 8, 'office', tint, tf(-D / 2, top + 0.6 + crown / 2, 0), 0.5));
  p.round.push(roundBar(D - 8 + 0.5, 0.5, L - 8 + 0.5, 0.18, '#d8dde4', tf(-D / 2, top + 0.6 + crown, 0))); // cornija da coroa
  p.round.push(paint(bevelBox(3, 1.4, 3, 0.35), '#9aa0a8', tf(-D / 2 + 3, top + 1.3, 3)));
  const ant = 6 + hash2(seed, 2) * 8;
  p.flat.push(paint(cyl(0.12, 0.2, ant, 8), '#c7c9cc', tf(-D / 2, top + 0.6 + crown + ant / 2, 0)));
  p.beacon.push(paint(sphere(0.35, 10, 6), '#ff3030', tf(-D / 2, top + 0.6 + crown + ant, 0)));
  rooftop(p, seed, look, { y: top + 0.6, front: -inset, back: -D + inset, zHalf: L / 2 - inset, keep: [[-14.2, -3.8, -5.2, 5.2]], cap: 3.4 });
  // Faixa de luz no topo (acende à noite).
  p.glow.push(paint(box(0.08, 0.35, L - inset * 2 - 1), ['#bfe4ff', '#c8fff0', '#ffe0b0', '#e0e4ff'][look], tf(-inset + 0.05, top - 0.6, 0)));
  return toRoundModel(p, top + crown);
}

/** Bloco de apartamentos com sacadas; térreo com portaria e comércio; caixa-d'água no teto. */
export function apartmentBlock(seed: number, floors: number, tint: string, L = 18, D = 15, look = 0): Model {
  const p = newParts(look);
  foundation(p, L, D);
  const H = 4 + floors * 3;
  p.round.push(paint(bevelBox(D, 4, L, 0.4), GROUND_FLOOR[look], tf(-D / 2, 2, 0))); // térreo (portaria e comércio)
  p.flat.push(paint(box(0.1, 2.6, L - 2), '#2c3e55', tf(0.02, 1.6, 0)));
  p.round.push(roundBar(1.3, 0.22, L - 1.6, 0.1, awningOf(seed, look, ['#d63a3a', '#1e88e5', '#ffd23f', '#3ddc84']), tf(0.6, 3.2, 0, 1, 1, 1, 0, 0, -0.15))); // toldo
  addFacade(p, 'apartment', bevelFacade(D, H - 4, L, 'apartment', tint, tf(-D / 2, 4 + (H - 4) / 2, 0), 0.7));
  // Lajes das sacadas em relevo (o que dá volume à fachada), de borda redonda; o ritmo muda com o visual (V4).
  const slab = ['#e8e6e0', '#dcd6cc', '#e8e2d6', '#d8d2c6'][look];
  for (let f = 1; f < floors; f += slabEvery(look)) p.round.push(roundBar(1.0, 0.2, L - 1.4, 0.09, slab, tf(0.45, 4 + f * 3, 0)));
  // Visual 3: pilastras do térreo ao topo entre os pares de janelas.
  if (look === 3) for (const z of [-L / 4, L / 4]) p.flat.push(paint(box(0.4, H - 4.4, 0.6), '#d6cebf', tf(0.15, 4 + (H - 4.4) / 2, z)));
  p.round.push(roundBar(D + 0.7, 0.85, L + 0.7, 0.28, '#d8d4cc', tf(-D / 2, H, 0))); // cornija
  p.round.push(paint(bevelBox(4, 2.6, 3.4, 0.4), '#b8b2a8', tf(-D / 2 - 1, H + 1.3 + 0.85, -L / 4))); // casa de máquinas
  p.flat.push(paint(cyl(1, 1, 1.8, 14), '#6a8aa8', tf(-D / 2 + 2, H + 1.7, L / 4)));
  rooftop(p, seed, look, { y: H + 0.85, front: 0, back: -D, zHalf: L / 2, keep: [[-10.5, -6.5, -6.2, -2.8], [-6.5, -4.5, 3.5, 5.5]], cap: 2.6 });
  p.glow.push(paint(box(0.06, 0.4, 1.8), SHOP_GLOW[look], tf(0.08, 3.6, L / 2 - 2.5)));
  return toRoundModel(p, H + 3);
}

/**
 * Prédio de apartamentos da orla (aptbeach: Copacabana e o litoral brasileiro), do kit redondo (geom.ts): torre de caixa com bisel
 * (cantos verticais e topo arredondados, fachada com as janelas que acendem à noite), embasamento escuro com toldo, uma laje de
 * sacada arredondada por andar (saem ~1 m da fachada), três nervuras, cornija e a casa de máquinas recuada, com a oclusão assada
 * na cor (o pé e as frestas das sacadas escurecem). A fachada reta fica em x = 0, na borda de colisão: o bisel só pega os cantos e o
 * topo, então a faixa do carro continua enxergando a face plana. ~480 triângulos + 22 por andar (o `apartmentBlock` tinha ~12 por andar).
 */
export function beachApartment(seed: number, floors: number, tint: string, L = 20, D = 14, look = 0): Model {
  const H = 4 + floors * 3;
  const round = (g: Geo): Geo => smoothNormals(g, 50);
  const flat: Geo[] = [];
  const glow: Geo[] = [];
  flat.push(paint(box(D, 5, L), '#8f8a82', tf(-D / 2, -2.4, 0))); // fundação: prédio em declive não flutua
  flat.push(paint(bevelBox(D, 4, L, 0.45), GROUND_FLOOR[look], tf(-D / 2, 2, 0))); // embasamento, a fachada reta em x = 0
  flat.push(paint(box(0.1, 2.6, L - 2), '#2c3e55', tf(0.02, 1.6, 0))); // portaria e vitrines
  flat.push(paint(round(roundedBar(1.3, 0.22, L - 1.6, 0.1, 1)), awningOf(seed, look, ['#d63a3a', '#1e88e5', '#ffd23f', '#3ddc84']), tf(0.6, 3.2, 0, 1, 1, 1, 0, 0, -0.15))); // toldo
  // Uma laje de sacada por andar (um sim um não no visual 2), de borda arredondada, e as nervuras: o relevo da fachada. O visual 1 (fita de vidro)
  // não tem nervura (as faixas horizontais mandam); o 2 tem as empenas nas pontas; o 3, cinco nervuras finas.
  const slab = ['#ece9e2', '#e2ddd2', '#f0ece4', '#e6e0d4'][look];
  for (let f = 1; f < floors; f += slabEvery(look)) flat.push(paint(round(roundedBar(1.1, 0.22, L - 1.4, 0.1, 1)), slab, tf(0.5, 4 + f * 3, 0)));
  const ribs = look === 0 ? [-L / 3, 0, L / 3] : look === 1 ? [] : look === 2 ? [-L / 2 + 0.5, L / 2 - 0.5] : [-L * 0.4, -L / 5, 0, L / 5, L * 0.4];
  for (const z of ribs) flat.push(paint(box(look === 3 ? 0.35 : 0.5, H - 4.4, look === 2 ? 0.7 : 0.5), look === 2 ? '#d8d2c8' : '#e2dfd8', tf(0.2, 4 + (H - 4.4) / 2, z)));
  flat.push(paint(round(roundedBar(D + 0.6, 0.9, L + 0.6, 0.3, 1)), '#d8d4cc', tf(-D / 2, H, 0))); // cornija
  flat.push(paint(bevelBox(D - 4, 2.8, L - 6, 0.5), '#b8b2a8', tf(-D / 2 - 1, H + 0.9 + 1.4, -L / 5))); // casa de máquinas
  flat.push(paint(cyl(1.1, 1.1, 1.8, 14), '#6a8aa8', tf(-D / 2 + 2, H + 1.8, L / 4))); // caixa-d'água
  const roof = newParts(look);
  rooftop(roof, seed, look, { y: H + 0.9, front: 0, back: -D, zHalf: L / 2, keep: [[-13.2, -2.8, -11.2, 3.2], [-6.2, -3.8, 3.9, 6.1]], cap: 2.8 }); // adereços do topo (V22/F5)
  flat.push(...roof.flat);
  glow.push(paint(box(0.06, 0.4, 1.8), SHOP_GLOW[look], tf(0.08, 3.6, L / 2 - 2.5)));
  const body = paint(bevelBox(D, H - 4, L, 0.7, FACADE_TILE.apartment), tint, tf(-D / 2, 4 + (H - 4) / 2, 0), true);
  const base = mergeRound(flat);
  const wall = facadeCell(mergeRound([body]), look);
  if (look === 0) {
    bakeAO(base, { occluders: [wall], reach: 2.4, strength: 0.6, rays: 12 });
    bakeAO(wall, { occluders: [base], reach: 2.4, strength: 0.6, rays: 12 });
  } else {
    // V4: os visuais 1–3 levam o degradê de altura dos outros prédios (toRoundModel), não o raio de oclusão (~0,2 s por modelo com a máquina livre):
    // com 4 visuais a Copacabana monta 3× mais prédios da orla, e o raio dobrava o tempo de montar a pista.
    shadeY(wall, 0, H + 3, 0.82, 1.05);
  }
  shadeY(base, -1, H + 3, 0.78, 1.06);
  const parts: ModelPart[] = [{ geometry: occlude(base), mat: 'flat', shadow: true }, { geometry: occlude(wall), mat: 'apartment', shadow: true }, { geometry: merge(glow), mat: 'glow' }];
  return { parts, blob: 0 };
}

/** Prédio clássico (bulevar europeu): térreo de lojas com toldos, cornija, telhado mansarda com lucarnas. */
export function classicBuilding(seed: number, floors: number, tint: string, L = 21, D = 14, look = 0): Model {
  const p = newParts(look);
  foundation(p, L, D, '#9a9286');
  const shopH = 4.6;
  p.round.push(paint(bevelBox(D, shopH, L, 0.4), '#c9bfae', tf(-D / 2, shopH / 2, 0)));
  const shops = 3;
  const awnings = ['#b8322a', '#2f6b4a', '#1f4f8a', '#c98a2a'];
  for (let k = 0; k < shops; k++) {
    const z = -L / 2 + (k + 0.5) * (L / shops);
    p.flat.push(paint(box(0.12, 3.0, L / shops - 1.6), '#23303e', tf(0.03, 1.8, z)));
    p.round.push(roundBar(1.4, 0.16, L / shops - 1.2, 0.07, look === 0 ? awnings[(seed + k) % awnings.length] : AWNINGS[(seed + k + look * 3) % AWNINGS.length], tf(0.65, 3.5, z, 1, 1, 1, 0, 0, -0.35))); // toldo
    p.glow.push(paint(box(0.05, 2.4, L / shops - 2.2), ['#b8844e', '#c89a5a', '#a87a4e', '#d0a070'][look], tf(0.1, 1.6, z)));
  }
  const H = floors * 3.8;
  addFacade(p, 'classic', bevelFacade(D, H, L, 'classic', tint, tf(-D / 2, shopH + H / 2, 0), 0.7));
  // Varandas de ferro: uma laje estreita de borda redonda por andar acima do térreo, com o gradil.
  for (let f = 1; f < floors; f++) {
    const y = shopH + f * 3.8;
    p.round.push(roundBar(0.8, 0.2, L - 4.6, 0.08, '#e6ddcc', tf(0.4, y, 0)));
    p.flat.push(paint(box(0.05, 0.85, L - 4.8), '#2a2e34', tf(0.78, y + 0.55, 0)));
  }
  const top = shopH + H;
  p.round.push(roundBar(D + 0.9, 0.55, L + 0.9, 0.2, '#e6ddcc', tf(-D / 2, top, 0))); // cornija
  // Telhado: ardósia, terracota, cobre e chumbo (V4).
  const roof = ['#5d6878', '#9a5a40', '#4f7466', '#5a5a62'][look];
  p.flat.push(paint(hip(D, 4.2, L, D * 0.5, L * 0.8), roof, tf(-D / 2, top + 0.5, 0)));
  for (let k = 0; k < 4; k++) {
    const z = -L / 2 + (k + 0.5) * (L / 4);
    p.round.push(paint(bevelBox(1.2, 1.6, 1.3, 0.18), '#e6ddcc', tf(-1.4, top + 1.6, z)));
    p.flat.push(paint(gable(1.4, 0.7, 1.5), roof, tf(-1.4, top + 2.4, z, 1, 1, 1, 0, Math.PI / 2, 0)));
  }
  for (const z of [-L / 2 + 1.5, L / 2 - 2]) {
    if (!structureDetail.roof) { p.flat.push(paint(box(0.9, 2.2, 1.4), '#b86a4a', tf(-D * 0.6, top + 4.4, z))); continue; }
    // V22/F5: a chaminé com tampa e dois tubos (a altura total é a de antes) e, numa delas, a antena de TV.
    p.flat.push(paint(box(0.9, 1.9, 1.4), '#b86a4a', tf(-D * 0.6, top + 4.25, z)));
    p.flat.push(paint(box(1.1, 0.1, 1.6), '#d8d2c6', tf(-D * 0.6, top + 5.25, z)));
    for (const dz of [-0.35, 0.35]) p.flat.push(paint(cylN(0.14, 0.16, 0.2, 6), '#8a5a44', tf(-D * 0.6, top + 5.4, z + dz)));
    if (z < 0) { p.flat.push(paint(cylN(0.03, 0.04, 0.9, 4), '#b8bcc2', tf(-D * 0.6 + 0.2, top + 5.0, z - 0.45))); p.flat.push(paint(box(0.03, 0.03, 0.7), '#b8bcc2', tf(-D * 0.6 + 0.2, top + 5.2, z - 0.45))); }
  }
  return toRoundModel(p, top + 5);
}

/** Prédio de tijolo médio com letreiro luminoso no alto (Sampa, Osaka, Las Vegas). */
export function brickMidrise(seed: number, floors: number, tint: string, neon: string, L = 16, D = 14, look = 0): Model {
  const p = newParts(look);
  foundation(p, L, D);
  const H = 4 + floors * 3;
  p.round.push(paint(bevelBox(D, 4, L, 0.4), ['#3a3e46', '#2e3238', '#4a4440', '#34383e'][look], tf(-D / 2, 2, 0)));
  p.glow.push(paint(box(0.06, 2.4, L - 3), SHOP_GLOW[(look + 1) % SHOP_GLOW.length], tf(0.04, 1.7, 0)));
  // Toldo da loja: aba de borda redonda sobre a vitrine.
  p.round.push(roundBar(1.5, 0.2, L * 0.62, 0.09, awningOf(seed, look, ['#d63a3a', '#1e88e5', '#2f8a4a', '#c98a2a']), tf(0.7, 3.4, 0, 1, 1, 1, 0, 0, -0.3)));
  addFacade(p, 'house', bevelFacade(D, H - 4, L, 'house', tint, tf(-D / 2, 4 + (H - 4) / 2, 0), 0.7));
  // Varandas: lajes de borda redonda a cada andar (o prédio de tijolo tem sacada, não só janela); um sim um não no visual 2.
  const trim = ['#6a5a50', '#4e4640', '#7a6a5c', '#5a5a5e'][look];
  for (let f = 1; f < floors; f += slabEvery(look)) p.round.push(roundBar(0.9, 0.2, L * 0.7, 0.08, trim, tf(0.45, 4 + f * 3, 0)));
  p.round.push(roundBar(D + 0.7, 0.75, L + 0.7, 0.25, trim, tf(-D / 2, H, 0))); // cornija
  // Letreiro: estrutura + painel de neon (placa vertical na quina, olhando a pista); a quina troca com o visual.
  const signH = 4 + hash2(seed, 3) * 4;
  const sz = (look % 2 === 0 ? 1 : -1) * (L / 2 - 1.6);
  p.flat.push(paint(box(0.4, signH, 2.2), '#1a1c20', tf(0.8, H - signH / 2 - 1, sz)));
  p.glow.push(paint(box(0.08, signH - 0.6, 1.8), neon, tf(1.02, H - signH / 2 - 1, sz)));
  p.flat.push(paint(box(0.3, 2.6, L * 0.7), '#1a1c20', tf(-D / 2, H + 1.9, 0)));
  p.glow.push(paint(box(0.06, 1.6, L * 0.62), neon, tf(-D / 2 + 0.18, H + 1.95, 0)));
  rooftop(p, seed, look, { y: H + 0.75, front: 0, back: -D, zHalf: L / 2, keep: [[-7.4, -6.6, -5.8, 5.8]], cap: 2.45 });
  return toRoundModel(p, H + 4);
}

// ───────────────────────────── Casas por região ─────────────────────────────

/** Casas cúbicas do Mediterrâneo: blocos brancos ou pastel empilhados, uma cúpula azul, escadinha. */
export function cubeHouses(seed: number, walls: string[], dome: boolean, L = 16, D = 14): Model {
  const p = newParts();
  foundation(p, L, D, '#d8d0c0');
  const blocks: Array<[number, number, number, number, number]> = [
    [0, 0, 7, 6, L * 0.55], [0, 0, 6, 5, -L * 0.3], [-7, 5.5, 6, 5, L * 0.2], [-8, 0, 8, 7, -L * 0.1],
  ];
  blocks.forEach(([x, y, d, h, z], k) => {
    const w = k === 0 ? L * 0.42 : L * 0.38;
    const color = walls[(seed + k) % walls.length];
    addFacade(p, 'house', facadeBox(d, h, w, 'house', color, tf(x - d / 2, y + h / 2, z * 0.5)));
    p.flat.push(paint(box(d + 0.2, 0.25, w + 0.2), '#f4f1ea', tf(x - d / 2, y + h + 0.12, z * 0.5)));
  });
  if (dome) {
    p.flat.push(paint(cyl(1.9, 1.9, 1.2, 16), '#ffffff', tf(-10.5, 7.6, -L * 0.05)));
    p.flat.push(paint(sphere(2.0, 16, 5, 0, Math.PI * 2, 0, Math.PI / 2), '#2a62c9', tf(-10.5, 8.2, -L * 0.05, 1, 0.9, 1)));
    p.flat.push(paint(box(0.2, 1.4, 0.2), '#ffffff', tf(-10.5, 10.3, -L * 0.05)));
  }
  for (let k = 0; k < 5; k++) p.flat.push(paint(box(1.2, 0.3, 1.2), '#f0ece2', tf(-0.2 - k * 0.9, 0.15 + k * 0.3, -L * 0.48)));
  p.flat.push(paint(lumpy(sphere(0.9, 14, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0.1, seed), '#d6368f', tf(0.2, 0.5, L * 0.1, 1, 0.8, 1)));
  return toModel(p, 12);
}

/** Casa de duas águas (Escandinávia, Cabo, Austrália): madeira pintada, telhado, chaminé, varanda. */
export function gableHouse(seed: number, wall: string, roof: string, floors = 2, L = 12, D = 9): Model {
  const p = newParts();
  foundation(p, L, D, '#7a7470');
  const H = floors * 3;
  addFacade(p, 'house', facadeBox(D, H, L, 'house', wall, tf(-D / 2, H / 2, 0)));
  // Cumeeira ao longo da pista: a água da frente olha a estrada.
  p.flat.push(paint(gable(D, 3.6, L, 0.5), roof, tf(-D / 2, H, 0, 1, 1, 1, 0, 0, 0)));
  p.flat.push(paint(box(0.9, 2.4, 0.9), '#6a5a50', tf(-D * 0.7, H + 2.4, L * 0.3)));
  p.flat.push(paint(box(1.6, 0.15, L * 0.5), '#f2f2ea', tf(0.8, 2.6, -L * 0.1)));
  for (let k = 0; k < 3; k++) p.flat.push(paint(box(0.12, 2.6, 0.12), '#f2f2ea', tf(1.5, 1.3, -L * 0.1 - L * 0.22 + k * L * 0.22)));
  p.glow.push(paint(box(0.05, 1.0, 0.9), '#ffdca0', tf(0.03, 1.6, L * 0.3)));
  if (hash2(seed, 5) > 0.5) p.flat.push(paint(box(0.3, 1.4, L + 2), '#f2f2ea', tf(2.8, 0.7, 0)));
  return toModel(p, H + 4);
}

/** Chalé alpino: base de pedra, andar de madeira, beiral largo, sacada com floreiras. */
export function chalet(seed: number): Model {
  const p = newParts();
  const L = 13; const D = 11;
  foundation(p, L, D, '#8a8680');
  p.flat.push(paint(jitter(box(D, 3.2, L), 0.01, seed), '#9a968e', tf(-D / 2, 1.6, 0)));
  p.glow.push(paint(box(0.05, 1.2, 1.4), '#ffd08a', tf(0.02, 1.7, -L * 0.25)));
  addFacade(p, 'house', facadeBox(D, 3.4, L, 'house', '#b87a45', tf(-D / 2, 3.2 + 1.7, 0)));
  p.flat.push(paint(box(1.3, 0.16, L - 1), '#7a4a2a', tf(0.55, 3.35, 0)));
  p.flat.push(paint(box(0.08, 0.9, L - 1), '#6a3e22', tf(1.15, 3.85, 0)));
  for (let k = 0; k < 5; k++) p.flat.push(paint(box(0.3, 0.3, 1.2), '#d63a3a', tf(1.2, 4.4, -L / 2 + 1.5 + k * (L - 3) / 4)));
  p.flat.push(paint(gable(D, 4.4, L, 1.6), '#4a2e22', tf(-D / 2, 6.6, 0)));
  p.flat.push(paint(box(0.8, 1.8, 0.8), '#8a8680', tf(-D * 0.6, 9.8, L * 0.25)));
  const g = toModel(p, 11);
  // Neve no telhado (topo do modelo): pinta as faces voltadas para cima da parte lisa.
  tintUp(g.parts[0].geometry, '#f2f5fb', 0.8, hash2(seed, 9) > 0.4 ? 0.85 : 0);
  return g;
}

/** Casa japonesa: paredes claras, madeira escura, telhado de quatro águas largo e escuro, varanda. */
export function japaneseHouse(seed: number): Model {
  const p = newParts();
  const L = 14; const D = 10;
  foundation(p, L, D, '#6a6258');
  p.flat.push(paint(box(D + 1.6, 0.6, L + 1.6), '#6a4a32', tf(-D / 2, 0.3, 0)));
  addFacade(p, 'house', facadeBox(D, 3.2, L, 'house', '#efe8d8', tf(-D / 2, 0.6 + 1.6, 0)));
  for (let k = 0; k <= 4; k++) p.flat.push(paint(box(0.2, 3.2, 0.2), '#3a2a1e', tf(0.02, 2.2, -L / 2 + k * L / 4)));
  p.flat.push(paint(hip(D + 3.4, 2.8, L + 3.4, 0.6, L * 0.55), '#3a3e46', tf(-D / 2, 3.8, 0)));
  if (hash2(seed, 4) > 0.5) {
    addFacade(p, 'house', facadeBox(D * 0.6, 2.6, L * 0.6, 'house', '#efe8d8', tf(-D / 2, 6.0, 0)));
    p.flat.push(paint(hip(D * 0.6 + 2.4, 2.0, L * 0.6 + 2.4, 0.4, L * 0.3), '#3a3e46', tf(-D / 2, 7.3, 0)));
  }
  p.glow.push(paint(box(0.05, 1.8, L * 0.5), '#ffe0b0', tf(0.04, 2.0, 0)));
  return toModel(p, 9);
}

/** Rondavéis (Drakensberg): cabanas redondas com teto de palha cônico e mureta de pedra. */
export function rondavels(seed: number, L = 14, D = 12): Model {
  const p = newParts();
  const huts: Array<[number, number, number]> = [[-3.2, -L * 0.2, 3.0], [-8.2, L * 0.22, 3.4], [-4, L * 0.38, 2.2]];
  for (const [x, z, r] of huts) {
    p.flat.push(paint(cyl(r, r, 2.8, 12), '#d8b88a', tf(x, 1.4, z)));
    p.flat.push(paint(cyl(r + 0.02, r + 0.02, 0.35, 12), '#f4f0e6', tf(x, 2.5, z)));
    p.flat.push(paint(jitter(cone(r + 0.9, 3.4, 12), 0.03, seed), '#b8964e', tf(x, 2.8 + 1.7, z)));
    p.flat.push(paint(box(0.1, 1.9, 1.0), '#5a3e28', tf(x + r, 0.95, z)));
  }
  for (let k = 0; k < 8; k++) p.flat.push(paint(jitter(box(0.8, 0.7, 1.8), 0.08, seed + k), '#8a8272', tf(0.4, 0.35, -L / 2 + (k + 0.5) * (L / 8))));
  return toModel(p, 7, 0);
}

/** Casa de fazenda: paredes brancas, telhado de telha (quatro águas), varanda de colunas. */
export function farmhouse(seed: number, roof = '#b8552e', wall = '#f2ede2', L = 15, D = 11): Model {
  const p = newParts();
  foundation(p, L, D, '#8a7a6a');
  addFacade(p, 'house', facadeBox(D, 3.6, L, 'house', wall, tf(-D / 2, 1.8, 0)));
  p.flat.push(paint(box(D + 0.2, 0.4, L + 0.2), '#6a4a32', tf(-D / 2, 0.2, 0)));
  p.flat.push(paint(hip(D + 4, 3.2, L + 1.6, 0.6, L * 0.5), roof, tf(-D / 2 + 1.2, 3.6, 0)));
  for (let k = 0; k < 5; k++) p.flat.push(paint(box(0.22, 3.6, 0.22), '#f2ede2', tf(2.8, 1.8, -L / 2 + 0.6 + k * (L - 1.2) / 4)));
  p.flat.push(paint(box(0.12, 0.9, L), '#6a4a32', tf(3.0, 0.45, 0)));
  p.glow.push(paint(box(0.05, 1.1, 1.0), '#ffd8a0', tf(0.03, 1.8, L * 0.2)));
  if (hash2(seed, 2) > 0.5) p.flat.push(paint(lumpy(sphere(1.2, 14, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0.1, seed), '#d6368f', tf(2.6, 0.2, -L * 0.42)));
  return toModel(p, 7);
}

/** Galpão portuário/industrial: telha ondulada (faixas), portões, letreiro. */
export function warehouse(seed: number, wall: string, L = 20, D = 18): Model {
  const p = newParts();
  foundation(p, L, D);
  const H = 9;
  p.flat.push(paint(box(D, H, L), wall, tf(-D / 2, H / 2, 0)));
  for (let k = 0; k < 10; k++) p.flat.push(paint(box(0.06, H, 0.18), new THREE.Color(wall).multiplyScalar(0.85).getStyle(), tf(0.02, H / 2, -L / 2 + (k + 0.5) * (L / 10))));
  p.flat.push(paint(box(0.1, 5, 6), '#3a3e46', tf(0.05, 2.5, -L * 0.2)));
  p.flat.push(paint(gable(D, 2.2, L, 0.3), '#8a9098', tf(-D / 2, H, 0)));
  p.flat.push(paint(box(0.1, 1.3, 8), ['#1e88e5', '#d63a3a'][seed % 2], tf(0.07, H - 1.3, L * 0.18)));
  p.glow.push(paint(box(0.3, 0.25, 0.5), '#fff0c8', tf(0.3, 5.6, -L * 0.2)));
  return toModel(p, H + 2);
}

// ───────────────────────────── Torres (sprite `tower`: simétricas, ±R) ─────────────────────────────

/** Torre de TV de concreto sobre embasamento que ocupa a pegada; cabine com janelas acesas. */
export function tvTower(seed: number, R: number): Model {
  const p = newParts();
  const H = 46 + hash2(seed, 1) * 18;
  p.flat.push(paint(box(2 * R, 5, 2 * R), '#b8bcc4', tf(0, 0, 0)));
  p.flat.push(paint(box(2 * R - 1, 1.4, 2 * R - 1), '#9aa0a8', tf(0, 3.2, 0)));
  p.flat.push(paint(cyl(1.3, 2.2, H, 16), '#d8dade', tf(0, 3.9 + H / 2, 0)));
  const podY = 3.9 + H * 0.82;
  p.flat.push(paint(cyl(4.2, 3.0, 2.2, 16), '#c8ccd2', tf(0, podY - 1.6, 0)));
  p.flat.push(paint(cyl(4.4, 4.4, 0.4, 16), '#e8eaee', tf(0, podY + 1.5, 0)));
  p.flat.push(paint(cyl(3.2, 4.2, 1.6, 16), '#c8ccd2', tf(0, podY + 2.5, 0)));
  p.glow.push(paint(cyl(4.25, 4.25, 1.0, 16, true), '#9fd6ff', tf(0, podY + 0.2, 0)));
  p.flat.push(paint(cyl(0.3, 0.6, 14, 12), '#e0e0e0', tf(0, podY + 10, 0)));
  for (let k = 0; k < 3; k++) p.flat.push(paint(cyl(0.34, 0.34, 1.2, 12), k % 2 ? '#e8e8e8' : '#d63a3a', tf(0, podY + 12 + k * 1.3, 0)));
  p.beacon.push(paint(sphere(0.5, 6, 4), '#ff3030', tf(0, podY + 17.3, 0)));
  return toModel(p, podY + 18, R * 0.9);
}

/** Mastro treliçado vermelho e branco, pés na borda da pegada, luz de balizamento. */
export function latticeMast(seed: number, R: number): Model {
  const p = newParts();
  const H = 38 + hash2(seed, 1) * 16;
  const sections = 5;
  const topR = 0.6;
  for (let s = 0; s < sections; s++) {
    const t0 = s / sections; const t1 = (s + 1) / sections;
    const baseR = R * Math.SQRT2 - 0.16;
    const r0 = baseR + (topR - baseR) * t0; const r1 = baseR + (topR - baseR) * t1;
    const y0 = H * t0; const y1 = H * t1;
    const color = s % 2 ? '#f2f2f2' : '#d63a3a';
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2;
      const c = Math.cos(a); const sn = Math.sin(a);
      const len = Math.hypot(y1 - y0, r0 - r1);
      const tilt = Math.atan2(r0 - r1, y1 - y0);
      p.flat.push(paint(box(0.22, len, 0.22), color, lean(c * (r0 + r1) / 2, (y0 + y1) / 2, sn * (r0 + r1) / 2, a + Math.PI, tilt)));
    }
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      const w = r1 * Math.SQRT2 * 0.7071 * 2;
      p.flat.push(paint(box(dz !== 0 ? w : 0.08, 0.08, dx !== 0 ? w : 0.08), '#8a8a8a', tf(dx * r1 * 0.7071, y1, dz * r1 * 0.7071)));
    }
  }
  p.flat.push(paint(box(2 * R, 0.4, 2 * R), '#9a968e', tf(0, 0.2, 0)));
  p.flat.push(paint(box(3, 2.6, 2.4), '#c8c4bc', tf(R * 0.4, 1.3, -R * 0.4)));
  p.beacon.push(paint(sphere(0.45, 6, 4), '#ff3030', tf(0, H + 0.5, 0)));
  return toModel(p, H, 0);
}

/** Torre de escritórios sobre embasamento que ocupa a pegada (±R): fuste envidraçado, coroa e antena. */
export function officeSpire(seed: number, R: number, tint: string): Model {
  const p = newParts();
  const podH = 7;
  addFacade(p, 'office', bevelFacade(2 * R, podH, 2 * R, 'office', '#dfe6ee', tf(0, podH / 2, 0), 0.7));
  p.round.push(roundBar(2 * R + 0.7, 0.55, 2 * R + 0.7, 0.2, '#c8ccd2', tf(0, podH, 0))); // cornija do embasamento
  const w = Math.max(6, 2 * R - 3);
  const H = 42 + hash2(seed, 1) * 30;
  addFacade(p, 'office', bevelFacade(w, H, w, 'office', tint, tf(0, podH + 0.5 + H / 2, 0), 0.8));
  const top = podH + 0.5 + H;
  p.round.push(roundBar(w + 0.5, 0.6, w + 0.5, 0.2, '#d8dde4', tf(0, top, 0))); // cornija do corpo
  addFacade(p, 'office', bevelFacade(w * 0.6, 5, w * 0.6, 'office', tint, tf(0, top + 3.1, 0), 0.4));
  p.flat.push(paint(cyl(0.12, 0.2, 10, 8), '#c7c9cc', tf(0, top + 10.6, 0)));
  p.beacon.push(paint(new THREE.OctahedronGeometry(0.4, 0), '#ff3030', tf(0, top + 15.8, 0)));
  p.glow.push(paint(box(w + 0.1, 0.3, w + 0.1), '#bfe4ff', tf(0, top - 0.5, 0)));
  return toRoundModel(p, top + 16);
}

/** Prédio clássico com cúpula (Paris, Roma): tambor com colunas sobre base quadrada (±R), cúpula e lanterna. */
export function domeBuilding(seed: number, R: number): Model {
  const p = newParts();
  const baseH = 12;
  addFacade(p, 'classic', bevelFacade(2 * R, baseH, 2 * R, 'classic', '#efe4cc', tf(0, baseH / 2, 0), 0.7));
  p.round.push(roundBar(2 * R + 0.9, 0.8, 2 * R + 0.9, 0.28, '#e6dcc6', tf(0, baseH, 0))); // cornija
  const dr = Math.min(R * 0.72, 9);
  p.flat.push(paint(cyl(dr, dr, 7, 16), '#efe6d2', tf(0, baseH + 0.8 + 3.5, 0)));
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    p.flat.push(paint(box(0.7, 7, 0.7), '#fbf6ea', tf(Math.cos(a) * (dr + 0.4), baseH + 0.8 + 3.5, Math.sin(a) * (dr + 0.4))));
  }
  p.flat.push(paint(cyl(dr + 0.8, dr + 0.8, 0.6, 16), '#e6dcc6', tf(0, baseH + 8.1, 0)));
  p.flat.push(paint(sphere(dr, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), hash2(seed, 2) > 0.5 ? '#6f8f8a' : '#8a929c', tf(0, baseH + 8.4, 0, 1, 1.15, 1)));
  p.flat.push(paint(cyl(1.0, 1.2, 3, 8), '#efe6d2', tf(0, baseH + 8.4 + dr * 1.15 + 1.2, 0)));
  p.flat.push(paint(cone(1.3, 2.4, 8), '#6f8f8a', tf(0, baseH + 8.4 + dr * 1.15 + 3.9, 0)));
  p.glow.push(paint(cyl(dr + 0.05, dr + 0.05, 1.2, 16, true), '#ffd89a', tf(0, baseH + 3.2, 0)));
  return toRoundModel(p, baseH + 8.4 + dr * 1.3 + 6);
}

/** Farol sobre rochedo (o rochedo é a pegada); lanterna acesa e facho girando à noite. */
export function lighthouse(seed: number, R: number, bands = '#d63a3a'): Model {
  const p = newParts();
  p.flat.push(paint(jitter(ico(1, 1), 0.12, seed), '#6f6a64', tf(0, 0.6, 0, R, 3.2, R)));
  const H = 20; const y0 = 2.6;
  const segs = 5;
  for (let k = 0; k < segs; k++) {
    const t0 = k / segs; const t1 = (k + 1) / segs;
    const r0 = 2.3 - 0.7 * t0; const r1 = 2.3 - 0.7 * t1;
    p.flat.push(paint(cyl(r1, r0, H / segs, 16), k % 2 ? bands : '#f6f6f2', tf(0, y0 + (t0 + t1) / 2 * H, 0)));
  }
  const top = y0 + H;
  p.flat.push(paint(cyl(2.2, 2.2, 0.35, 16), '#2e3238', tf(0, top + 0.17, 0)));
  p.flat.push(paint(cyl(2.25, 2.25, 0.7, 16, true), '#2e3238', tf(0, top + 0.7, 0)));
  p.glow.push(paint(cyl(1.3, 1.3, 2.0, 14), '#fff4c8', tf(0, top + 1.4, 0)));
  p.flat.push(paint(cone(1.6, 1.5, 16), bands, tf(0, top + 3.1, 0)));
  p.flat.push(paint(box(4, 3, 3.4), '#f2f0ea', tf(R * 0.35, 2.4 + 1.5, R * 0.3)));
  p.flat.push(paint(gable(4, 1.6, 3.4, 0.2), bands, tf(R * 0.35, 5.4, R * 0.3)));
  return toModel(p, top + 4, 0);
}

/** Facho do farol: cone aberto deitado (+X), para girar em Y (só à noite). */
export function lighthouseBeam(): Model {
  const g = new THREE.ConeGeometry(6, 70, 12, 1, true).rotateZ(Math.PI / 2).translate(-35, 0, 0).toNonIndexed();
  return { parts: [{ geometry: g, mat: 'cone' }] };
}

/** Caixa-d'água de fazenda: quatro pernas na borda da pegada, travamento, tanque com teto cônico. */
export function waterTower(seed: number, R: number): Model {
  const p = newParts();
  const H = 12 + hash2(seed, 1) * 4;
  const legR = R * Math.SQRT2 - 0.5;
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    const tilt = Math.atan2(legR - 2.2, H);
    p.flat.push(paint(cyl(0.16, 0.2, H / Math.cos(tilt), 6), '#8a7a6a', lean(Math.cos(a) * (legR + 2.2) / 2, H / 2, Math.sin(a) * (legR + 2.2) / 2, a + Math.PI, tilt)));
    p.flat.push(paint(box(0.7, 0.4, 0.7), '#9a968e', tf(Math.cos(a) * legR, 0.2, Math.sin(a) * legR)));
  }
  for (const y of [H * 0.33, H * 0.66]) {
    const r = legR + (2.2 - legR) * (y / H);
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      p.flat.push(paint(box(dz !== 0 ? r * 1.414 : 0.1, 0.1, dx !== 0 ? r * 1.414 : 0.1), '#7a6a5a', tf(dx * r * 0.707, y, dz * r * 0.707)));
    }
  }
  p.flat.push(paint(cyl(3.2, 3.2, 4.6, 16), '#c9c4b8', tf(0, H + 2.3, 0)));
  p.flat.push(paint(cyl(3.25, 3.25, 0.8, 16), '#d63a3a', tf(0, H + 2.8, 0)));
  p.flat.push(paint(cone(3.5, 1.8, 16), '#8a8f96', tf(0, H + 5.5, 0)));
  return toModel(p, H + 6, 0);
}

/** Cata-vento de fazenda (Karoo, Outback, Rota 66): torre treliçada até a pegada; o cata-vento é à parte. */
export function windpumpTower(seed: number, R: number): Model {
  const p = newParts();
  const H = 11 + hash2(seed, 1) * 3;
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    const legR = R * Math.SQRT2 - 0.1;
    const tilt = Math.atan2(legR - 0.3, H);
    p.flat.push(paint(box(0.12, H / Math.cos(tilt), 0.12), '#9a9ea4', lean(Math.cos(a) * (legR + 0.3) / 2, H / 2, Math.sin(a) * (legR + 0.3) / 2, a + Math.PI, tilt)));
    p.flat.push(paint(box(0.5, 0.3, 0.5), '#9a968e', tf(Math.cos(a) * (legR - 0.1), 0.15, Math.sin(a) * (legR - 0.1))));
  }
  for (let s = 1; s < 5; s++) {
    const y = (H * s) / 5; const r = (R * Math.SQRT2 - 0.1) + (0.3 - (R * Math.SQRT2 - 0.1)) * (y / H);
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) p.flat.push(paint(box(dz !== 0 ? r * 1.414 : 0.06, 0.06, dx !== 0 ? r * 1.414 : 0.06), '#8a8e94', tf(dx * r * 0.707, y, dz * r * 0.707)));
  }
  p.flat.push(paint(box(0.8, 0.5, 0.5), '#6a6e74', tf(0, H + 0.2, 0)));
  p.flat.push(paint(box(0.06, 1.8, 3.2), '#b8bcc2', tf(0, H + 0.6, -2.0)));
  // Tanque australiano de chapa ao lado (dentro da pegada).
  p.flat.push(paint(cyl(1.6, 1.6, 2.2, 16), '#b8bcc2', tf(R * 0.55, 1.1, R * 0.4)));
  p.flat.push(paint(cone(1.7, 0.5, 16), '#9a9ea4', tf(R * 0.55, 2.45, R * 0.4)));
  return toModel(p, H + 2, 0);
}

/** Roda do cata-vento (no plano XY, gira em torno de Z): 12 pás num aro. */
export function windpumpFan(): Model {
  const parts: Geo[] = [paint(cyl(0.25, 0.25, 0.3, 8), '#6a6e74', tf(0, 0, 0, 1, 1, 1, Math.PI / 2, 0, 0))];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    parts.push(paint(box(0.36, 1.3, 0.04), '#d8dce2', tf(Math.sin(a) * 1.05, Math.cos(a) * 1.05, 0.1, 1, 1, 1, 0, 0, -a)));
  }
  parts.push(paint(cyl(1.75, 1.75, 0.06, 16, true), '#9a9ea4', tf(0, 0, 0.1, 1, 1, 1, Math.PI / 2, 0, 0)));
  return { parts: [{ geometry: merge(parts), mat: 'flat', shadow: true }] };
}

// ───────────────────────────── Decoração de beira (só visual) ─────────────────────────────

export type FenceStyle = 'ranch' | 'rail' | 'armco' | 'stone' | 'railing' | 'hedge';

/** Um lance de cerca de 4 m (um segmento) ao longo de Z, com o poste em z = −2. */
export function fence(style: FenceStyle, seed: number): Model {
  const parts: Geo[] = [];
  const L = 4.02;
  // Barra de borda arredondada (4 gomos por canto: 22,5° cada, lisa à luz de construção — o vinco é 40°; com 2 gomos de 45° a quina ficava viva) e fio redondo ao longo de Z.
  const bar = (w: number, h: number, r: number, color: string, y: number, x = 0): Geo => paint(smoothNormals(roundedBar(w, h, L, r, 4), 50), color, tf(x, y, 0));
  const wire = (r: number, color: string, y: number, x = 0): Geo => paint(cyl(r, r, L, 12, true), color, tf(x, y, 0, 1, 1, 1, Math.PI / 2, 0, 0));
  switch (style) {
    case 'ranch':
      parts.push(paint(cyl(0.065, 0.07, 1.35, 14, true), '#7a5a3a', tf(0, 0.62, -2, 1, 1, 1, 0, 0, (hash2(seed, 1) - 0.5) * 0.08)));
      for (const y of [0.75, 1.15]) parts.push(wire(0.014, '#6a6a6a', y));
      break;
    case 'rail':
      parts.push(paint(cyl(0.08, 0.08, 1.3, 14, true), '#f2f0ea', tf(0, 0.6, -2)));
      for (const y of [0.37, 0.72, 1.07]) parts.push(bar(0.07, 0.17, 0.03, '#f2f0ea', y));
      break;
    case 'armco':
      parts.push(paint(cyl(0.06, 0.06, 0.8, 12, true), '#8a9098', tf(-0.1, 0.4, -2)));
      parts.push(bar(0.1, 0.34, 0.05, '#c8ccd2', 0.45, 0.02));
      break;
    case 'stone': {
      // Muro baixo de duas fiadas de pedra de topo arredondado, em lances de ~1 m de tons alternados (eram caixas sorteadas).
      const lance = (w: number, h: number, y: number, z0: number, len: number, c: string, x: number): Geo => paint(smoothNormals(roundedBar(w, h, len, Math.min(0.2, h / 2.1), 4), 50), c, tf(x, y, z0));
      for (let k = 0; k < 4; k++) parts.push(lance(0.62, 0.42, 0, -1.5 + k * 1.0, 1.0, k % 2 ? '#a8a092' : '#968e80', 0));
      for (let k = 0; k < 3; k++) parts.push(lance(0.54, 0.38, 0.38, -1.3 + k * 1.3, 1.25, k % 2 ? '#9a9284' : '#b0a898', 0));
      break;
    }
    case 'railing':
      parts.push(paint(cyl(0.04, 0.045, 1.05, 14, true), '#e8eaee', tf(0, 0.52, -2)));
      for (const y of [0.55, 1.02]) parts.push(wire(0.032, '#e8eaee', y));
      break;
    case 'hedge':
      // Cerca-viva aparada de quinas redondas (era uma caixa). A seção não muda ao longo do lance: emenda sem degrau.
      parts.push(paint(roundedBar(0.9, 1.1, L + 0.1, 0.32, 3), '#3c7a3a'));
      break;
  }
  const g = merge(parts);
  return { parts: [{ geometry: shadeY(g, 0, 1.3, 0.8, 1.08), mat: 'flat' }] };
}

/** Poste de madeira com travessa e isoladores (os fios são um modelo à parte, esticado por quadro). */
export function utilityPole(): Model {
  const g = merge([
    paint(cyl(0.12, 0.16, 9.4, 14), '#6a5238', tf(0, 4.7, 0)),
    paint(box(0.14, 0.16, 2.4), '#5a4430', tf(0, 8.8, 0)),
    paint(cyl(0.06, 0.06, 0.2, 10), '#e8ecf0', tf(0, 9.0, -1.0)), paint(cyl(0.06, 0.06, 0.2, 10), '#e8ecf0', tf(0, 9.0, 1.0)),
    paint(cyl(0.06, 0.06, 0.2, 10), '#e8ecf0', tf(0, 9.5, 0)),
  ]);
  return { parts: [{ geometry: g, mat: 'flat' }], blob: 0.4 };
}

/** Fios entre dois postes: comprimento 1 em −Z (a instância estica até o próximo poste). */
export function wires(): Model {
  const parts: Geo[] = [];
  for (const [x, y] of [[-1.0, 9.1], [1.0, 9.1], [0, 9.6]] as const) parts.push(paint(box(0.035, 0.035, 1), '#2a2a2a', tf(x, y, -0.5)));
  return { parts: [{ geometry: merge(parts), mat: 'flat' }] };
}

/** Turbina eólica (torre + nacele); o rotor é à parte e gira em torno de X. */
export function windTurbine(): Model {
  const g = merge([
    paint(cyl(1.1, 2.0, 62, 16), '#f2f4f6', tf(0, 31, 0)),
    paint(box(2.2, 2.4, 6.0), '#e8eaee', tf(0, 63, -0.8)),
    paint(box(3, 0.6, 3), '#c8ccd2', tf(0, 0.3, 0)),
  ]);
  return { parts: [{ geometry: shadeY(g, 0, 64, 0.85, 1.05), mat: 'flat' }], blob: 2.5 };
}

/** Rotor de três pás (gira em torno de Z do modelo, que o renderizador põe olhando a pista). */
export function turbineRotor(): Model {
  const parts: Geo[] = [paint(sphere(1.0, 16, 10), '#f2f4f6', tf(0, 0, 0, 1, 1, 1.4))];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    parts.push(paint(box(0.3, 26, 1.4), '#f6f7f8', tf(Math.sin(a) * 13, Math.cos(a) * 13, 0.2, 1, 1, 1, 0, 0, -a)));
  }
  return { parts: [{ geometry: merge(parts), mat: 'flat' }] };
}

/** Portal torii vermelho (Japão). */
export function torii(): Model {
  const g = merge([
    paint(cyl(0.45, 0.5, 9, 16), '#d8402a', tf(-4.4, 4.5, 0)), paint(cyl(0.45, 0.5, 9, 16), '#d8402a', tf(4.4, 4.5, 0)),
    paint(box(12.4, 0.8, 1.1), '#2a2a2a', tf(0, 9.4, 0)), paint(box(11.6, 0.6, 0.9), '#d8402a', tf(0, 8.7, 0)),
    paint(box(10, 0.5, 0.6), '#d8402a', tf(0, 7.3, 0)), paint(box(0.7, 1.4, 0.4), '#d8402a', tf(0, 8.0, 0)),
    paint(box(1.3, 0.6, 1.3), '#3a3a3a', tf(-4.4, 0.3, 0)), paint(box(1.3, 0.6, 1.3), '#3a3a3a', tf(4.4, 0.3, 0)),
  ]);
  return { parts: [{ geometry: g, mat: 'flat', shadow: true }], blob: 3 };
}

/** Pagode de cinco andares (Japão). */
export function pagoda(): Model {
  const parts: Geo[] = [paint(box(9, 1.2, 9), '#8a8680', tf(0, 0.6, 0))];
  let y = 1.2;
  for (let k = 0; k < 5; k++) {
    const w = 6.4 - k * 0.8; const h = 2.6;
    parts.push(paint(box(w, h, w), k % 2 ? '#e8e0cc' : '#c8402a', tf(0, y + h / 2, 0)));
    parts.push(paint(hip(w + 3.6, 1.3, w + 3.6, w * 0.5, w * 0.5), '#3a3e46', tf(0, y + h, 0)));
    y += h + 1.1;
  }
  parts.push(paint(cyl(0.18, 0.25, 5, 6), '#b8a060', tf(0, y + 2.5, 0)));
  return { parts: [{ geometry: shadeY(merge(parts), 0, y + 5, 0.8, 1.06), mat: 'flat', shadow: true }], blob: 5 };
}

/** Igrejinha de vila com torre pontuda (Alpes, Escandinávia, interior do Brasil). */
export function chapel(seed: number, wall = '#f2efe6', roof = '#6a4a3a'): Model {
  const parts: Geo[] = [
    paint(box(8, 6, 14), wall, tf(0, 3, 0)), paint(gable(8, 4, 14, 0.4), roof, tf(0, 6, 0)),
    paint(box(4, 13, 4), wall, tf(0, 6.5, 8)), paint(hip(4.4, 7, 4.4), roof, tf(0, 13, 8)),
    paint(box(0.1, 1.6, 1.2), '#2a2a2a', tf(2.05, 10.5, 8)), paint(box(0.2, 2.6, 2.0), '#5a3e28', tf(0, 1.3, 10.02)),
  ];
  const g = shadeY(merge(parts), 0, 20, 0.82, 1.05);
  return { parts: [{ geometry: g, mat: 'flat', shadow: true }, { geometry: paint(box(0.4, 0.5, 0.3), '#ffe0a0', tf(0, 4.2, -7.02 + hash2(seed, 1) * 0)), mat: 'glow' }], blob: 0 };
}

/** Veleiro (flutua no mar). */
export function sailboat(seed: number): Model {
  const hull = hash2(seed, 1) > 0.5 ? '#f4f4f4' : '#1e3a5a';
  const parts: Geo[] = [
    paint(box(2.4, 1.0, 8), hull, tf(0, 0.3, 0)), paint(cone(1.2, 2.4, 4), hull, tf(0, 0.3, -5.1, 1, 0.42, 1, -Math.PI / 2, 0, 0)),
    paint(box(1.6, 0.7, 2.6), '#e8e4da', tf(0, 1.1, 1)), paint(cyl(0.07, 0.07, 10, 5), '#d8d8d8', tf(0, 5.8, -0.8)),
    paint(tris([0, 1.4, -0.7, 0, 10.4, -0.9, 0, 1.4, 3.2]), '#fbfbf6'), paint(tris([0, 1.4, -1.2, 0, 9, -1.0, 0, 1.4, -4.8]), '#f2f0e8'),
  ];
  return { parts: [{ geometry: merge(parts), mat: 'flat' }], blob: 0 };
}

/** Iate (Mônaco): casco branco, conveses escalonados, janelas escuras. */
export function yacht(seed: number): Model {
  const parts: Geo[] = [
    paint(box(5, 2.0, 18), '#f6f6f4', tf(0, 0.6, 0)), paint(cone(2.5, 5, 4), '#f6f6f4', tf(0, 0.6, -11.4, 1, 0.4, 1, -Math.PI / 2, Math.PI / 4, 0)),
    paint(box(4.2, 1.6, 10), '#f0f0ee', tf(0, 2.4, 1.5)), paint(box(4.25, 0.5, 9.6), '#1f2a38', tf(0, 2.4, 1.5)),
    paint(box(3.2, 1.4, 6), '#f0f0ee', tf(0, 3.9, 2.2)), paint(box(3.25, 0.4, 5.6), '#1f2a38', tf(0, 3.9, 2.2)),
    paint(box(0.2, 2.4, 0.2), '#c8ccd2', tf(0, 5.6, 1.5)),
  ];
  const lights: Geo[] = [paint(box(4.3, 0.12, 9.2), '#ffe6b0', tf(0, 2.0, 1.5)), paint(sphere(0.2, 5, 3), '#ff4040', tf(-2.5, 1.8, -4)), paint(sphere(0.2, 5, 3), '#40ff60', tf(2.5, 1.8, -4))];
  return { parts: [{ geometry: merge(parts), mat: 'flat' }, { geometry: merge(lights), mat: 'glow' }], blob: 0 };
}

/** Barco de pesca colorido (Escandinávia, Japão, Cabo). */
export function fishingBoat(seed: number): Model {
  const hullColors = ['#d63a3a', '#1e88e5', '#2f8a4a', '#f2c33a'];
  const hull = hullColors[seed % hullColors.length];
  const parts: Geo[] = [
    paint(box(3, 1.6, 9), hull, tf(0, 0.4, 0)), paint(box(3.05, 0.3, 9.05), '#f4f4f4', tf(0, 1.15, 0)),
    paint(box(2.2, 2.2, 2.8), '#f4f4f4', tf(0, 2.3, 1.6)), paint(box(2.3, 0.3, 3.0), '#3a3e46', tf(0, 3.5, 1.6)),
    paint(cyl(0.08, 0.08, 5, 5), '#d8d8d8', tf(0, 3.5, -2)),
  ];
  return { parts: [{ geometry: merge(parts), mat: 'flat' }, { geometry: paint(box(2.25, 0.5, 0.1), '#ffe6b0', tf(0, 2.6, 0.18)), mat: 'glow' }], blob: 0 };
}

/** Guarda-sol de praia com cadeiras (fica na areia além do alcance do carro). */
export function beachUmbrella(seed: number): Model {
  const colors = ['#ff4f5a', '#ffd23f', '#1e88e5', '#3ddc84', '#ff8c1a'];
  const c = colors[seed % colors.length];
  const parts: Geo[] = [paint(cyl(0.04, 0.04, 2.4, 5), '#e8e8e8', tf(0, 1.2, 0))];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    parts.push(paint(tris([0, 2.6, 0, Math.cos(a) * 1.4, 2.1, Math.sin(a) * 1.4, Math.cos(a + 0.785) * 1.4, 2.1, Math.sin(a + 0.785) * 1.4]), k % 2 ? c : '#ffffff'));
  }
  parts.push(paint(box(0.6, 0.3, 1.6), colors[(seed + 2) % colors.length], tf(0.9, 0.2, 0.4, 1, 1, 1, 0, 0, 0.2)));
  return { parts: [{ geometry: merge(parts), mat: 'flat' }], blob: 1.2 };
}

/** Moinho de vento clássico de pedra (Mediterrâneo): corpo cilíndrico caiado e telhado cônico. */
export function stoneWindmill(): Model {
  const g = merge([
    paint(cyl(2.4, 2.8, 8, 16), '#f4f2ea', tf(0, 4, 0)), paint(cone(2.8, 2.6, 16), '#8a5a3a', tf(0, 9.3, 0)),
    paint(box(0.1, 1.8, 1.0), '#3a5a8a', tf(2.62, 0.9, 0)),
  ]);
  const sails: Geo[] = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.3;
    sails.push(paint(box(0.1, 6, 1.2), '#e8e2d2', tf(3.0, 8.4 + Math.cos(a) * 3.2, Math.sin(a) * 3.2, 1, 1, 1, a, 0, 0)));
  }
  return { parts: [{ geometry: merge([g, ...sails]), mat: 'flat', shadow: true }], blob: 3 };
}

/** Molhe de madeira entrando no mar (+X é a praia): 40 m de deque sobre estacas. */
export function pier(): Model {
  const parts: Geo[] = [paint(box(40, 0.3, 3), '#8a6a4a', tf(-20, 0, 0))];
  for (let k = 0; k < 9; k++) for (const z of [-1.3, 1.3]) parts.push(paint(cyl(0.15, 0.15, 5, 5), '#6a5238', tf(-2 - k * 4.6, -2.4, z)));
  for (let k = 0; k < 9; k++) parts.push(paint(box(0.08, 1.0, 0.08), '#f2f0ea', tf(-2 - k * 4.6, 0.6, 1.4)));
  parts.push(paint(box(40, 0.06, 0.06), '#f2f0ea', tf(-20, 1.1, 1.4)));
  return { parts: [{ geometry: merge(parts), mat: 'flat' }] };
}

/** Pedras soltas grandes no mar/encosta (um penedo): redondo em bolhas macias, a cor por ponto (era por face). */
export function seaRock(seed: number, color: string, r: number): Model {
  const g = paint(lumpy(sphere(1, 16, 8), 0.09, seed), color, tf(0, r * 0.2, 0, r, r * 0.8, r * 0.9));
  return { parts: [{ geometry: mottle(tintUpSoft(g, '#ffffff', 0.7, 0.2), 0.1, seed, 0.5), mat: 'flat' }] };
}

