// Kit de modelagem low-poly do cenário: primitivas com cor por vértice, transformação, fusão e
// deformação determinística. Puro (só Three, sem DOM): os modelos podem ser montados e medidos nos
// testes. Toda geometria sai não indexada (a cor é por face: a malha não compartilha vértices) com os
// atributos position, normal e color — e uv só quando pedida (fachadas, painéis). A normal que sai daqui é a
// da face; a normal suave com vinco (copa, tronco e cúpula lisos à luz, caixa e beiral vivos) é aplicada uma
// vez por modelo pelo catálogo (`smooth.ts`, vinco por família) — o material não usa flatShading.
// Cor e deformação têm duas versões: por face/vértice sorteado (`speckle`, `tintUp`, `jitter`: as faces à mostra,
// de propósito — marcos e construções) e por PONTO, contínuas (`mottle`, `tintUpSoft`, `lumpy`: as famílias
// redondas, em que a luz lisa com a cor por face ainda desenhava as facetas; docs/VISUAL.md, "Forma redonda").
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash2, hash3, valueNoise3 } from '../noise';
import { CREASE, ROOF_TURN_DEG, smoothNormals } from '../normals';

export type Geo = THREE.BufferGeometry;

/**
 * Material de cada parte (scenery.ts cria um de cada): `flat` é o geral (cor por face, normal suave com vinco);
 * as fachadas têm textura de janelas que acende à noite; `glow` é luz pintada (brilha à noite);
 * `panel` é o atlas de outdoors e placas; `cone` é o facho de luz aditivo (só à noite); `cutout` é o cartão com recorte alfa
 * (capim, folhagem rala: position, normal, color e uv; `scenery/cutout.ts`).
 */
export type MatKey = 'flat' | 'office' | 'apartment' | 'classic' | 'house' | 'glow' | 'beacon' | 'cone' | 'panel' | 'cutout';

export interface ModelPart {
  geometry: Geo;
  mat: MatKey;
  /** Projeta sombra (só o que fica perto da pista: o cenário distante usa a mancha). */
  shadow?: boolean;
}

/** Um modelo = uma ou mais partes, cada uma vira um InstancedMesh (uma chamada de desenho por parte). */
export interface Model {
  parts: ModelPart[];
  /** Raio (m, escala 1) da mancha de sombra no chão; 0 ou ausente = sem mancha. */
  blob?: number;
}

/** Descrição de uma bolha de pedra ou de copa que o `paint` refina quando a matriz a faz grande (`roundBlob`). */
interface RoundBlob { amount: number; seed: number; detail: number }

/**
 * Bolha de pedra, de morro ou de copa (esfera de raio 1, deformada): `detail` 0 ou 1 é o que a bolha de poucos metros precisa. O `paint` olha a matriz
 * que a leva ao lugar: a bolha com um semieixo de 3 m ou mais vira icosaedro de detalhe 2 (180 faces) em bolhas macias (`lumpy`), e a de 1,5 a 3 m, de
 * detalhe 1 (valores do nível pleno e do lugar "longe"; `roundScale`); a pequena fica como está (poucos pixels a 300 m). Assim o marco paga os triângulos só onde a faceta aparece (M3, a faceta da bíblia).
 */
export function roundBlob(amount: number, seed: number, detail: number): Geo {
  const g = jitter(ico(1, detail), amount, seed);
  g.userData.roundBlob = { amount, seed, detail } satisfies RoundBlob;
  return g;
}

/** O maior semieixo (m) da matriz: o comprimento da maior coluna da parte linear. */
function matrixScale(m: THREE.Matrix4): number {
  const e = m.elements;
  return Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
}

/**
 * Nível de arredondamento do marco (M3): 3 é o pleno (bolha de 5 m já vai a 180 faces, caixa de 2,5 m ganha bisel, cilindro de 1,2 m de raio tem 14 lados);
 * cada nível abaixo exige o dobro do tamanho; 0 é a geometria de antes da M3. O marco é montado no 3 e, se estoura o orçamento do lugar
 * (`LANDMARK_LIMITS`), de novo no 2, no 1 e no 0 (`fitted`, landmarks/kit.ts): ele paga os triângulos onde cabem, sem ninguém tirar um objeto à mão.
 */
let roundLevel = 3;
/** Quanto o lugar do marco (perto 30–80 m, longe 120–400 m, horizonte 400 m+) estica o limite de tamanho: de perto a faceta aparece em peça pequena. */
let roundPlace = 1;
export function setRoundLevel(level: number, placeFactor = 1): void { roundLevel = level; roundPlace = placeFactor; }
export function getRoundLevel(): number { return roundLevel; }
export function getRoundPlace(): number { return roundPlace; }
/** Fator pelo qual o limite de tamanho (m) cresce: 1 no nível pleno; 2, 4, ∞ nos de baixo; vezes o do lugar (perto 0,4; longe 1; horizonte 3). */
export function roundScale(): number { return (roundLevel >= 3 ? 1 : roundLevel === 2 ? 2 : roundLevel === 1 ? 4 : Infinity) * roundPlace; }

/** Detalhe do icosaedro por tamanho (m), nível e lugar: ≥ 12 m (no nível pleno e no lugar "longe"), 320 faces; ≥ 3 m, 180; ≥ 1,5 m, 80; menos, o que o autor pediu. */
function icoDetailFor(base: number, size: number): number {
  const s = size / roundScale();
  return s >= 12 ? 3 : s >= 3 ? 2 : s >= 1.5 ? Math.max(base, 1) : base;
}

/**
 * A bolha deformada de um morro ou de uma pedra grande: `detail`/`amount`/`seed` do autor (a bolha rugosa, `jitter`), refinada pelo tamanho (m) do que ela vai ser — de
 * 3 m em diante (no nível pleno e no lugar "longe") o icosaedro vai a 180 faces e a deformação vira macia (`lumpy`): o morro de 200 m deixa de ser um poliedro.
 */
export function roundHill(detail: number, amount: number, seed: number, size: number): Geo {
  const d = icoDetailFor(detail, size);
  return d === detail ? jitter(ico(1, detail), amount, seed) : lumpy(ico(1, d), amount * 0.7, seed);
}

/** Icosaedro de raio `r` que o `paint` refina pelo tamanho que a matriz lhe dá (ver `roundBlob`); passado a `jitter`/`lumpy` antes do `paint`, não é refinado. */
export function blobIco(r: number, detail = 0): Geo {
  const g = ico(r, detail);
  g.userData.roundIco = { r, detail };
  return g;
}

function blobFor(b: RoundBlob, m: THREE.Matrix4): Geo {
  const detail = icoDetailFor(b.detail, matrixScale(m));
  if (detail === b.detail) return jitter(ico(1, detail), b.amount, b.seed);
  return lumpy(ico(1, detail), b.amount * 0.7, b.seed);
}

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();

/** Matriz de posição, escala e giro (ordem YXZ: primeiro o rumo, depois inclinações). */
export function tf(x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0): THREE.Matrix4 {
  tmpQ.setFromEuler(tmpE.set(rx, ry, rz, 'YXZ'));
  return new THREE.Matrix4().compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
}

/**
 * Posição + inclinação: o eixo +Y da peça tomba `tilt` radianos (a partir da vertical) na direção `a`
 * (radianos no plano XZ: 0 = +X, π/2 = +Z). Escala antes do giro.
 */
export function lean(x: number, y: number, z: number, a: number, tilt: number, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  return tf(x, y, z, sx, sy, sz, 0, -a, -tilt);
}

/** Cópia não indexada com cor por vértice (e a transformação aplicada). Descarta a uv, salvo `keepUv`. */
export function paint(geo: Geo, color: THREE.ColorRepresentation, m?: THREE.Matrix4, keepUv = false): Geo {
  const blob = geo.userData.roundBlob as RoundBlob | undefined;
  if (blob && m) { const up = blobFor(blob, m); geo.dispose(); geo = up; }
  const ri = geo.userData.roundIco as { r: number; detail: number } | undefined;
  if (ri && m) { const up = ico(ri.r, icoDetailFor(ri.detail, ri.r * matrixScale(m))); geo.dispose(); geo = up; }
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  geo.dispose();
  if (!keepUv) g.deleteAttribute('uv');
  if (m) g.applyMatrix4(m);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/**
 * Fusão do liso de um marco (M3): as peças do kit redondo (caixa com bisel, `userData.roundNormals`) guardam a normal própria (`mergeRound`) e o
 * resto recebe o vinco do marco (45° e a regra do telhado), como o catálogo faria; sem peça do kit, é o `merge` de sempre (o catálogo suaviza depois).
 */
export function mergeFlat(parts: Geo[]): Geo {
  const round = parts.filter((p) => p.userData.roundNormals);
  if (round.length === 0) return merge(parts);
  const plain = parts.filter((p) => !p.userData.roundNormals);
  const lisas: Geo[] = round.map((p) => { delete p.userData.roundNormals; return p; });
  if (plain.length) lisas.unshift(smoothNormals(merge(plain), CREASE.landmark, { roofTurnDeg: ROOF_TURN_DEG }));
  return mergeRound(lisas);
}

/** Funde as partes (e libera cada uma). Normais por face (a malha não compartilha vértices); o catálogo suaviza depois. */
export function merge(parts: Geo[]): Geo {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('fusão de geometria falhou (atributos diferentes entre as partes?)');
  for (const p of parts) p.dispose();
  g.computeVertexNormals();
  return g;
}

/**
 * Deforma radialmente por hash da posição arredondada: vértices coincidentes recebem o mesmo desvio,
 * então a malha não abre. `amount` é a fração do raio (0,15 = ±15%).
 */
export function jitter(geo: Geo, amount: number, seed: number, keepBottom = false): Geo {
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    const k = hash3(Math.round(x * 97) + seed * 7919, Math.round(y * 97) + seed * 131, Math.round(z * 97));
    const f = 1 + (k - 0.5) * 2 * amount;
    p.setXYZ(i, x * f, keepBottom && y < 0 ? y : y * f, z * f);
  }
  return geo;
}

/** Multiplica a cor pela altura: `f0` em y0, `f1` em y1 (oclusão no pé, luz no topo). */
export function shadeY(geo: Geo, y0: number, y1: number, f0: number, f1: number): Geo {
  const p = geo.attributes.position as THREE.BufferAttribute;
  const c = geo.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, Math.min(1, (p.getY(i) - y0) / (y1 - y0)));
    const f = f0 + (f1 - f0) * t;
    c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f);
  }
  return geo;
}

/** Pinta de `color` as faces voltadas para cima (normal.y > limiar): neve, musgo, grama no topo. */
export function tintUp(geo: Geo, color: THREE.ColorRepresentation, threshold: number, mixAmount = 1): Geo {
  const p = geo.attributes.position as THREE.BufferAttribute;
  const c = geo.attributes.color as THREE.BufferAttribute;
  const top = new THREE.Color(color);
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const d = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); d.fromBufferAttribute(p, i + 2);
    b.sub(a); d.sub(a);
    const n = b.cross(d).normalize();
    if (n.y <= threshold) continue;
    for (let k = 0; k < 3; k++) {
      const j = i + k;
      c.setXYZ(j, c.getX(j) + (top.r - c.getX(j)) * mixAmount, c.getY(j) + (top.g - c.getY(j)) * mixAmount, c.getZ(j) + (top.b - c.getZ(j)) * mixAmount);
    }
  }
  return geo;
}

/** Varia o tom de cada face (±amount) por hash: dá textura às copas e pedras sem textura. */
export function speckle(geo: Geo, amount: number, seed: number): Geo {
  const c = geo.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i + 2 < c.count; i += 3) {
    const f = 1 + (hash3(i, seed, 17) - 0.5) * 2 * amount;
    for (let k = 0; k < 3; k++) c.setXYZ(i + k, c.getX(i + k) * f, c.getY(i + k) * f, c.getZ(i + k) * f);
  }
  return geo;
}

/**
 * Varia o tom (±amount) por PONTO, com ruído 3D suave da posição (`freq` por metro): pontos coincidentes recebem o
 * mesmo fator, então a cor corre contínua de uma face para a outra — manchas largas e macias que não mostram as
 * faces. É o que as famílias redondas (planta, pedra) usam; o `speckle`, por face, fica para quem quer as faces
 * à mostra (marcos, construções).
 */
export function mottle(geo: Geo, amount: number, seed: number, freq = 0.8): Geo {
  const p = geo.attributes.position as THREE.BufferAttribute;
  const c = geo.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const f = 1 + valueNoise3(seed, p.getX(i) * freq, p.getY(i) * freq, p.getZ(i) * freq) * amount;
    c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f);
  }
  return geo;
}

/**
 * Deforma em bolhas macias: cada ponto anda na direção da origem da peça por ruído 3D suave da DIREÇÃO (`lobes` ≈
 * bolhas por volta), então pontos coincidentes andam igual e a malha não abre. `amount` é a fração do raio. É o
 * `jitter` sem aspereza (o jitter sorteia cada vértice: no icosaedro subdividido vira pedra lascada; este, batata).
 * `horizontal` desloca só em X e Z (corpo de cilindro: o pé continua no chão).
 */
export function lumpy(geo: Geo, amount: number, seed: number, lobes = 1.3, horizontal = false): Geo {
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r < 1e-9) continue;
    const f = 1 + valueNoise3(seed, (x / r) * lobes, (y / r) * lobes, (z / r) * lobes) * amount;
    // `horizontal`: só para os lados (corpo de cilindro: o pé e o topo ficam na altura).
    p.setXYZ(i, x * f, horizontal ? y : y * f, z * f);
  }
  return geo;
}

/**
 * `tintUp` sem degrau: o peso de cada ponto vem da normal média das faces que o tocam (pontos soldados pela posição),
 * numa rampa de ±`soft` em volta do limiar — a neve e o musgo escorrem pela pedra em vez de pintar face sim, face
 * não (com a luz lisa, a cor por face era o que ainda desenhava as facetas).
 */
export function tintUpSoft(geo: Geo, color: THREE.ColorRepresentation, threshold: number, mixAmount = 1, soft = 0.25): Geo {
  const p = geo.attributes.position as THREE.BufferAttribute;
  const c = geo.attributes.color as THREE.BufferAttribute;
  const top = new THREE.Color(color);
  const key = (i: number) => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  const acc = new Map<string, [number, number, number]>();
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const d = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); d.fromBufferAttribute(p, i + 2);
    const n = b.sub(a).cross(d.sub(a)); // não normalizada: pesa pela área
    for (let k = 0; k < 3; k++) {
      const s = acc.get(key(i + k));
      if (s) { s[0] += n.x; s[1] += n.y; s[2] += n.z; } else acc.set(key(i + k), [n.x, n.y, n.z]);
    }
  }
  for (let i = 0; i < p.count; i++) {
    const s = acc.get(key(i));
    if (!s) continue;
    const len = Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]);
    if (len < 1e-12) continue;
    const t = Math.max(0, Math.min(1, (s[1] / len - (threshold - soft)) / (2 * soft)));
    const w = t * t * (3 - 2 * t) * mixAmount;
    c.setXYZ(i, c.getX(i) + (top.r - c.getX(i)) * w, c.getY(i) + (top.g - c.getY(i)) * w, c.getZ(i) + (top.b - c.getZ(i)) * w);
  }
  return geo;
}

/**
 * Barra de perfil arredondado ao longo de Z (cerca-viva aparada): seção `w` × `h` com os dois cantos de cima em
 * arco de raio `r` (`n` gomos cada), comprimento `L`, sem fundo (fica no chão); `caps` fecha as pontas. A seção não
 * depende de Z: lances iguais emendam sem degrau.
 */
export function roundedBar(w: number, h: number, L: number, r: number, n = 3, caps = true): Geo {
  // Perfil no plano XY, anti-horário visto de +Z: sobe pela direita, cruza o topo, desce pela esquerda.
  const prof: Array<[number, number]> = [[w / 2, 0]];
  for (let k = 0; k <= n; k++) { const a = (k / n) * (Math.PI / 2); prof.push([w / 2 - r + r * Math.cos(a), h - r + r * Math.sin(a)]); }
  for (let k = 0; k <= n; k++) { const a = Math.PI / 2 + (k / n) * (Math.PI / 2); prof.push([-w / 2 + r + r * Math.cos(a), h - r + r * Math.sin(a)]); }
  prof.push([-w / 2, 0]);
  const z0 = -L / 2; const z1 = L / 2;
  const out: number[] = [];
  for (let i = 0; i + 1 < prof.length; i++) {
    const [ax, ay] = prof[i]; const [bx, by] = prof[i + 1];
    out.push(ax, ay, z0, bx, by, z0, bx, by, z1, ax, ay, z0, bx, by, z1, ax, ay, z1);
  }
  if (caps) {
    let cx = 0; let cy = 0;
    for (const [x, y] of prof) { cx += x / prof.length; cy += y / prof.length; }
    for (let i = 0; i < prof.length; i++) {
      const [ax, ay] = prof[i]; const [bx, by] = prof[(i + 1) % prof.length];
      out.push(cx, cy, z1, ax, ay, z1, bx, by, z1);
      out.push(cx, cy, z0, bx, by, z0, ax, ay, z0);
    }
  }
  return tris(out);
}

/** Elipsoide (centro e semi-eixos, alinhado aos eixos) para `cullInside`. */
export interface Ellipsoid { x: number; y: number; z: number; rx: number; ry: number; rz: number }

/**
 * Tira os triângulos que ficam INTEIROS dentro de algum dos elipsoides (o elipsoide é convexo: os três cantos
 * dentro = o triângulo dentro). A parte de uma bolha enterrada em outra, ou da pedra de cima enterrada no matacão,
 * nunca aparece (a outra peça é fechada) e custava triângulo — é o que paga a copa redonda. Quem chama encolhe o
 * elipsoide pela deformação e pela corda da malha da outra peça. Malha não indexada; todos os atributos seguem.
 */
export function cullInside(geo: Geo, solids: readonly Ellipsoid[]): Geo {
  const p = geo.attributes.position as THREE.BufferAttribute;
  const within = (j: number, e: Ellipsoid): boolean => {
    const dx = (p.getX(j) - e.x) / e.rx; const dy = (p.getY(j) - e.y) / e.ry; const dz = (p.getZ(j) - e.z) / e.rz;
    return dx * dx + dy * dy + dz * dz < 1;
  };
  const keep: number[] = [];
  // Os três cantos dentro do MESMO elipsoide (em dois diferentes, o meio do triângulo pode ficar fora dos dois).
  for (let i = 0; i + 2 < p.count; i += 3) if (!solids.some((e) => within(i, e) && within(i + 1, e) && within(i + 2, e))) keep.push(i);
  if (keep.length * 3 === p.count) return geo;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.attributes[name] as THREE.BufferAttribute;
    const arr = new Float32Array(keep.length * 3 * a.itemSize);
    let o = 0;
    for (const i of keep) for (let k = 0; k < 3; k++) for (let c = 0; c < a.itemSize; c++) arr[o++] = a.array[(i + k) * a.itemSize + c];
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  geo.dispose();
  return out;
}

export function box(w: number, h: number, d: number): Geo { return new THREE.BoxGeometry(w, h, d); }
export function cyl(rt: number, rb: number, h: number, seg: number, open = false): Geo { return new THREE.CylinderGeometry(rt, rb, h, roundSides(seg, 14), 1, open); }
export function cone(r: number, h: number, seg: number): Geo { return new THREE.ConeGeometry(r, h, roundSides(seg, 16)); }

/**
 * Lados de um sólido de revolução (M3, a faceta da bíblia): de 8 a 13 lados o vinco do marco (45°) e, de 9 em diante, o de construção (40°) deixam as arestas LISAS, e a luz lisa sobre
 * uma malha tão grossa desenha um polígono (faceta de 18–22°); de 3 a 7 lados as arestas ficam vivas (coluna quadrada, pirâmide, torre de 6 lados: forma
 * de projeto, a quina é a forma). Quem pede de 8 a 13 quer redondo: sobe para `to` (14 lados = 12,9°; cone de 16 = 13,1°).
 */
export function roundSides(seg: number, to: number): number { return seg >= 8 && seg < to ? to : seg; }
export function ico(r: number, detail = 0): Geo { return new THREE.IcosahedronGeometry(r, detail); }
export function dodeca(r: number): Geo { return new THREE.DodecahedronGeometry(r, 0); }
export function sphere(r: number, w: number, h: number, phi0 = 0, phiLen = Math.PI * 2, theta0 = 0, thetaLen = Math.PI): Geo { return new THREE.SphereGeometry(r, w, h, phi0, phiLen, theta0, thetaLen); }

/** Geometria a partir de uma lista de triângulos (x,y,z × 3 por triângulo), sem índice. */
export function tris(positions: number[]): Geo {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return g;
}

/** Prisma triangular (telhado de duas águas): base `w` em X, altura `h`, comprimento `d` em Z. */
export function gable(w: number, h: number, d: number, overhang = 0): Geo {
  const x = w / 2 + overhang; const z = d / 2 + overhang;
  const p = [
    // Águas (a de +X e a de −X).
    x, 0, z, x, 0, -z, 0, h, -z, x, 0, z, 0, h, -z, 0, h, z,
    -x, 0, -z, -x, 0, z, 0, h, z, -x, 0, -z, 0, h, z, 0, h, -z,
    // Oitões.
    -x, 0, z, x, 0, z, 0, h, z,
    x, 0, -z, -x, 0, -z, 0, h, -z,
    // Fundo.
    -x, 0, -z, x, 0, -z, x, 0, z, -x, 0, -z, x, 0, z, -x, 0, z,
  ];
  return tris(p);
}

/** Pirâmide de base retangular (telhado de quatro águas / torre). */
export function hip(w: number, h: number, d: number, topW = 0, topD = 0): Geo {
  const g = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, false);
  g.rotateY(Math.PI / 4);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0.5;
    p.setXYZ(i, p.getX(i) * (top ? topW : w), p.getY(i) * h, p.getZ(i) * (top ? topD : d));
  }
  return g;
}

/**
 * Faixa dobrada (folha de palmeira, samambaia): começa na origem e segue `dir` (radianos em XZ),
 * subindo `rise` e caindo pela `droop` ao longo de `len`, com largura máxima `w` no meio.
 */
export function frond(len: number, w: number, dir: number, rise: number, droop: number, pieces = 3): Geo {
  const pts: Array<[number, number, number]> = [];
  for (let k = 0; k <= pieces; k++) {
    const t = k / pieces;
    const along = len * t;
    const y = rise * t - droop * t * t;
    const half = w * 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.1));
    pts.push([along, y, half]);
  }
  const c = Math.cos(dir); const s = Math.sin(dir);
  const out: number[] = [];
  const P = (a: number, y: number, side: number): [number, number, number] => [a * c - side * s, y, a * s + side * c];
  for (let k = 0; k < pieces; k++) {
    const [a0, y0, h0] = pts[k]; const [a1, y1, h1] = pts[k + 1];
    // Nervura central um pouco acima das bordas: a folha tem vinco (lê melhor com faces planas).
    const m0 = P(a0, y0 + 0.04, 0); const m1 = P(a1, y1 + 0.04, 0);
    const l0 = P(a0, y0, -h0); const l1 = P(a1, y1, -h1);
    const r0 = P(a0, y0, h0); const r1 = P(a1, y1, h1);
    out.push(...m0, ...l0, ...l1, ...m0, ...l1, ...m1);
    out.push(...m0, ...r1, ...r0, ...m0, ...m1, ...r1);
  }
  return tris(out);
}

/** Tufo de lâminas (capim): `n` triângulos finos em leque, altura `h`, abertura `r`. */
export function tuft(n: number, h: number, r: number, seed: number): Geo {
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + hash3(seed, k, 1) * 0.8;
    const lean = r * (0.6 + hash3(seed, k, 2) * 0.6);
    const hh = h * (0.7 + hash3(seed, k, 3) * 0.5);
    const c = Math.cos(a); const s = Math.sin(a);
    const w = 0.07 + r * 0.12;
    out.push(-s * w, 0, c * w, s * w, 0, -c * w, c * lean, hh, s * lean);
  }
  return tris(out);
}

/**
 * Pontos do modelo (escalado por sx, sy, sz) dentro da faixa de altura [y0, y1]: os vértices que caem nela
 * e os cruzamentos das arestas com os planos y0 e y1 — o contorno exato da fatia (um triângulo grande
 * que atravessa a faixa sem vértice dentro dela também conta). É o que o carro pode tocar.
 */
export function bandPoints(geo: Geo, y0: number, y1: number, cb: (x: number, y: number, z: number) => void, sx = 1, sy = 1, sz = 1): void {
  const p = geo.attributes.position as THREE.BufferAttribute;
  const v = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i + 2 < p.count; i += 3) {
    for (let k = 0; k < 3; k++) { v[k * 3] = p.getX(i + k) * sx; v[k * 3 + 1] = p.getY(i + k) * sy; v[k * 3 + 2] = p.getZ(i + k) * sz; }
    for (let k = 0; k < 3; k++) {
      const ax = v[k * 3]; const ay = v[k * 3 + 1]; const az = v[k * 3 + 2];
      if (ay >= y0 && ay <= y1) cb(ax, ay, az);
      const n = (k + 1) % 3;
      const bx = v[n * 3]; const by = v[n * 3 + 1]; const bz = v[n * 3 + 2];
      for (const yp of [y0, y1]) {
        if ((ay - yp) * (by - yp) < 0) {
          const t = (yp - ay) / (by - ay);
          cb(ax + (bx - ax) * t, yp, az + (bz - az) * t);
        }
      }
    }
  }
}

// ───────────────────────────── Kit redondo (onda L, L4) ─────────────────────────────
// Caixa com bisel, extrusão com bisel, oclusão de ambiente por vértice, normal esferizada e recorte alfa: o que o cenário
// usa para sair do "caixote" (docs/DIRECAO-DE-ARTE.md §2, "forma redonda e volumosa"). O bisel é de 1 gomo com a NORMAL
// esférica no vértice: a luz gira 90° no canto (arredonda) e a caixa custa 108 triângulos, não 588 (3 gomos). Como o catálogo
// reescreve a normal de toda parte iluminada (`smoothModel`), a parte que o kit monta sai de `mergeRound` com a marca
// `userData.keepNormals`, e o catálogo a deixa como veio.

/**
 * Caixa `w` × `h` × `d` centrada na origem, com os cantos e as quinas em bisel de raio `r` (1 gomo: grade 4 × 4 por face, 108
 * triângulos) e a normal esférica no vértice. `uvTile` = [largura, altura] (m) de uma repetição da textura de fachada: as
 * paredes ganham uv em metros (como `facadeBox`) e topo e fundo apontam para um canto sem janela; sem ele, sem uv.
 * `r` maior que a metade da menor medida é limitado (a caixa vira um sólido arredondado, não do avesso).
 */
export function bevelBox(w: number, h: number, d: number, r: number, uvTile?: readonly [number, number], vOffset = 0): Geo {
  const half = [w / 2, h / 2, d / 2];
  const rr = Math.max(1e-4, Math.min(r, Math.min(w, h, d) / 2));
  const axes = half.map((hv) => [-hv, -hv + rr, hv - rr, hv]);
  const pos: number[] = []; const nor: number[] = []; const uvs: number[] = [];
  const corner = (a: number, s: number, i: number, j: number): void => {
    const ua = (a + 1) % 3; const va = (a + 2) % 3;
    const p0 = [0, 0, 0];
    p0[a] = s * half[a]; p0[ua] = axes[ua][i]; p0[va] = axes[va][j];
    // Ponto de dentro mais perto (o miolo reto da caixa) e o desvio dele: o arco do canto é a esfera de raio rr em volta.
    const inner = p0.map((v, k) => Math.max(-(half[k] - rr), Math.min(half[k] - rr, v)));
    const ox = p0[0] - inner[0]; const oy = p0[1] - inner[1]; const oz = p0[2] - inner[2];
    const len = Math.hypot(ox, oy, oz) || 1;
    const nx = ox / len; const ny = oy / len; const nz = oz / len;
    pos.push(inner[0] + nx * rr, inner[1] + ny * rr, inner[2] + nz * rr);
    nor.push(nx, ny, nz);
    if (uvTile) {
      if (a === 1) uvs.push(0.01, 0.01);
      else uvs.push(((a === 0 ? p0[2] + half[2] : p0[0] + half[0]) / uvTile[0]), (p0[1] + half[1] + vOffset) / uvTile[1]);
    }
  };
  for (let a = 0; a < 3; a++) {
    for (const s of [1, -1]) {
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          // (e_u × e_v = e_a: a ordem 00,10,11 / 00,11,01 olha para +a; para −a vira do avesso)
          const quad: Array<[number, number]> = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
          const order = s > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
          for (const k of order) corner(a, s, quad[k][0], quad[k][1]);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (uvTile) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

/** Opções de extrusão do kit: bisel ligado, curva com ≥ 6 pontos por trecho (a elipse do three dobra) e bisel de 3 gomos. */
export const BEVEL_EXTRUDE = { bevelEnabled: true, curveSegments: 8, bevelSegments: 3 } as const;

/**
 * `ExtrudeGeometry` com bisel (letra, ilha, pilastra redonda): `shape` extrudado em `depth` ao longo de Z (centrado), com bisel
 * de `bevel` m na espessura e no contorno. Pintada e com a normal suave (vinco de 50°: o bisel e a curva arredondam, a quina
 * do contorno continua viva); usar com `mergeRound`.
 */
export function bevelExtrude(shape: THREE.Shape | THREE.Shape[], depth: number, bevel: number, color: THREE.ColorRepresentation = '#ffffff', m?: THREE.Matrix4): Geo {
  const raw = new THREE.ExtrudeGeometry(shape, { ...BEVEL_EXTRUDE, depth, bevelThickness: bevel, bevelSize: bevel });
  raw.translate(0, 0, -depth / 2);
  return smoothNormals(paint(raw, color, m), 50);
}

/** Fusão do kit: guarda as normais de cada peça (o `merge` as recalcula por face) e marca `userData.keepNormals` (smooth.ts). */
export function mergeRound(parts: Geo[]): Geo {
  for (const p of parts) if (!p.getAttribute('normal')) p.computeVertexNormals();
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('fusão de geometria falhou (atributos diferentes entre as partes?)');
  for (const p of parts) p.dispose();
  g.userData.keepNormals = true;
  return g;
}

export interface AoOptions {
  /** Raios por vértice (hemisfério ponderado pelo cosseno, direções fixas: determinístico). */
  rays?: number;
  /** Alcance (m) da sombra de contato. */
  reach?: number;
  /** Quanto escurece o vértice totalmente tapado (0..1). */
  strength?: number;
  /** O chão (y = `groundY`) também tapa. Vértice abaixo do chão não conta (a fundação não aparece). */
  ground?: boolean;
  groundY?: number;
  /** Outras malhas não indexadas do mesmo modelo que também tapam (o prédio é uma parte `flat` e outra de fachada). */
  occluders?: readonly Geo[];
  /**
   * Vértices no mesmo ponto com normais a menos de `smoothDeg` graus (a superfície lisa: arco do bisel, copa, tronco) dividem a
   * MÉDIA da oclusão — a cor corre contínua pela aresta lisa; a quina viva (90°) mantém um valor por face. Padrão 62°.
   */
  smoothDeg?: number;
}

/** Hemisfério ponderado pelo cosseno (espiral de Fibonacci): `n` direções no referencial local (z para cima). */
function hemisphere(n: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n; const phi = k * 2.399963229728653;
    const r = Math.sqrt(u);
    out.push([r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(1 - u)]);
  }
  return out;
}

/**
 * Oclusão de ambiente assada na COR do vértice (luz assada, R2: o cenário parado já vem escurecido nos cantos): de cada vértice sai
 * um leque de raios no hemisfério da normal dele; cada raio que bate na própria malha (ou no chão) em menos de `reach` tapa o
 * vértice, mais quanto mais perto. A cor é multiplicada por `1 − strength · tapado`. Malha não indexada, com normal e cor; só a
 * cor muda. O custo é por modelo, uma vez (caro demais por quadro): candidatos por esfera, raio × triângulo só nos vizinhos.
 */
export function bakeAO(geo: Geo, o: AoOptions = {}): Geo {
  if (geo.index) throw new Error('bakeAO: a malha tem de ser não indexada');
  if (!geo.getAttribute('color')) throw new Error('bakeAO: a malha tem de ter cor por vértice (a oclusão vai na cor)');
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const rays = o.rays ?? 14; const reach = o.reach ?? 3; const strength = o.strength ?? 0.6;
  const ground = o.ground ?? true; const groundY = o.groundY ?? 0;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const col = geo.getAttribute('color') as THREE.BufferAttribute;
  const sources = [geo, ...(o.occluders ?? [])].map((g) => g.getAttribute('position') as THREE.BufferAttribute);
  const T = sources.reduce((sum, a) => sum + Math.floor(a.count / 3), 0);
  // Por triângulo: um vértice, a normal da face, os lados, o centro e o raio da esfera que o contém.
  const v0 = new Float64Array(T * 3); const e1 = new Float64Array(T * 3); const e2 = new Float64Array(T * 3); const fn = new Float64Array(T * 3);
  const ctr = new Float64Array(T * 3); const rad = new Float64Array(T);
  let t = -1;
  for (const src of sources) {
    for (let k = 0; k + 2 < src.count; k += 3) {
      t++;
      const a = t * 3;
      const ax = src.getX(k); const ay = src.getY(k); const az = src.getZ(k);
      const bx = src.getX(k + 1); const by = src.getY(k + 1); const bz = src.getZ(k + 1);
      const cx = src.getX(k + 2); const cy = src.getY(k + 2); const cz = src.getZ(k + 2);
      v0[a] = ax; v0[a + 1] = ay; v0[a + 2] = az;
      e1[a] = bx - ax; e1[a + 1] = by - ay; e1[a + 2] = bz - az;
      e2[a] = cx - ax; e2[a + 1] = cy - ay; e2[a + 2] = cz - az;
      let nx = e1[a + 1] * e2[a + 2] - e1[a + 2] * e2[a + 1]; let ny = e1[a + 2] * e2[a] - e1[a] * e2[a + 2]; let nz = e1[a] * e2[a + 1] - e1[a + 1] * e2[a];
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-12) { rad[t] = -1; continue; } // degenerado: nunca tapa
      nx /= nl; ny /= nl; nz /= nl;
      fn[a] = nx; fn[a + 1] = ny; fn[a + 2] = nz;
      ctr[a] = (ax + bx + cx) / 3; ctr[a + 1] = (ay + by + cy) / 3; ctr[a + 2] = (az + bz + cz) / 3;
      rad[t] = Math.max(Math.hypot(ax - ctr[a], ay - ctr[a + 1], az - ctr[a + 2]), Math.hypot(bx - ctr[a], by - ctr[a + 1], bz - ctr[a + 2]), Math.hypot(cx - ctr[a], cy - ctr[a + 1], cz - ctr[a + 2]));
    }
  }
  // Grade espacial (célula = alcance): cada triângulo entra nas células que a esfera dele toca; o vértice só olha as vizinhas.
  const cell = Math.max(0.5, reach);
  const cellKey = (ix: number, iy: number, iz: number): number => ((Math.max(-500, Math.min(500, ix)) + 512) * 1024 + (Math.max(-500, Math.min(500, iy)) + 512)) * 1024 + (Math.max(-500, Math.min(500, iz)) + 512);
  const grid = new Map<number, number[]>();
  for (let q = 0; q < T; q++) {
    if (rad[q] < 0) continue;
    const a = q * 3;
    for (let ix = Math.floor((ctr[a] - rad[q]) / cell); ix <= Math.floor((ctr[a] + rad[q]) / cell); ix++) {
      for (let iy = Math.floor((ctr[a + 1] - rad[q]) / cell); iy <= Math.floor((ctr[a + 1] + rad[q]) / cell); iy++) {
        for (let iz = Math.floor((ctr[a + 2] - rad[q]) / cell); iz <= Math.floor((ctr[a + 2] + rad[q]) / cell); iz++) {
          const k = cellKey(ix, iy, iz);
          const list = grid.get(k);
          if (list) list.push(q); else grid.set(k, [q]);
        }
      }
    }
  }
  const seen = new Int32Array(T); let stamp = 0;
  const dirs = hemisphere(rays);
  const cosSmooth = (o.smoothDeg ?? 62) >= 180 ? -2 : Math.cos(((o.smoothDeg ?? 62) * Math.PI) / 180); // 180° = todas (cos = −1 exato falha em float)
  const cache = new Map<string, number>();
  type Entry = { nx: number; ny: number; nz: number; f: number };
  const groups = new Map<string, Entry[]>();
  const near: number[] = [];
  const keys: string[] = []; const normals: Array<[number, number, number]> = [];
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i); const py = pos.getY(i); const pz = pos.getZ(i);
    let nx = nor.getX(i); let ny = nor.getY(i); let nz = nor.getZ(i);
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    // Vértices idênticos (posição, normal) herdam o mesmo valor: a caixa tem 3 a 6 triângulos por canto.
    const pk = `${px.toFixed(4)},${py.toFixed(4)},${pz.toFixed(4)}`;
    const key = `${pk},${nx.toFixed(3)},${ny.toFixed(3)},${nz.toFixed(3)}`;
    keys.push(pk); normals.push([nx, ny, nz]);
    if (cache.has(key)) continue;
    // Origem um pouco acima da superfície (a própria face não tapa); a base do hemisfério gira com a normal.
    const ox = px + nx * 0.04; const oy = py + ny * 0.04; const oz = pz + nz * 0.04;
    near.length = 0;
    stamp++;
    for (let ix = Math.floor((px - reach) / cell); ix <= Math.floor((px + reach) / cell); ix++) {
      for (let iy = Math.floor((py - reach) / cell); iy <= Math.floor((py + reach) / cell); iy++) {
        for (let iz = Math.floor((pz - reach) / cell); iz <= Math.floor((pz + reach) / cell); iz++) {
          const list = grid.get(cellKey(ix, iy, iz));
          if (list) for (const q of list) if (seen[q] !== stamp) { seen[q] = stamp; near.push(q); }
        }
      }
    }
    const hx = Math.abs(nx) < 0.9 ? 1 : 0; const hy = hx ? 0 : 1;
    // tangente = normalize(h × n), bitangente = n × tangente
    let tx = hy * nz; let ty = -hx * nz; let tz = hx * ny - hy * nx;
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    const bx = ny * tz - nz * ty; const by = nz * tx - nx * tz; const bz = nx * ty - ny * tx;
    let occ = 0;
    for (const [lx, ly, lz] of dirs) {
      const dx = tx * lx + bx * ly + nx * lz; const dy = ty * lx + by * ly + ny * lz; const dz = tz * lx + bz * ly + nz * lz;
      let best = reach;
      for (const q of near) {
        const a = q * 3;
        const denom = dx * fn[a] + dy * fn[a + 1] + dz * fn[a + 2];
        if (denom > -1e-9) continue; // por trás da face (ou paralelo): não tapa
        const tt = ((v0[a] - ox) * fn[a] + (v0[a + 1] - oy) * fn[a + 1] + (v0[a + 2] - oz) * fn[a + 2]) / denom;
        if (tt < -1e-4 || tt >= best) continue;
        const hxp = ox + dx * tt - v0[a]; const hyp = oy + dy * tt - v0[a + 1]; const hzp = oz + dz * tt - v0[a + 2];
        // Dentro do triângulo (coordenadas baricêntricas pelo produto escalar com os lados).
        const d00 = e1[a] * e1[a] + e1[a + 1] * e1[a + 1] + e1[a + 2] * e1[a + 2];
        const d01 = e1[a] * e2[a] + e1[a + 1] * e2[a + 1] + e1[a + 2] * e2[a + 2];
        const d11 = e2[a] * e2[a] + e2[a + 1] * e2[a + 1] + e2[a + 2] * e2[a + 2];
        const d20 = hxp * e1[a] + hyp * e1[a + 1] + hzp * e1[a + 2];
        const d21 = hxp * e2[a] + hyp * e2[a + 1] + hzp * e2[a + 2];
        const den = d00 * d11 - d01 * d01;
        if (Math.abs(den) < 1e-14) continue;
        const bv = (d11 * d20 - d01 * d21) / den; const bw = (d00 * d21 - d01 * d20) / den;
        if (bv < -1e-6 || bw < -1e-6 || bv + bw > 1 + 1e-6) continue;
        best = Math.max(0, tt);
      }
      let w = best < reach ? 1 - best / reach : 0;
      if (ground && dy < 0 && oy >= groundY - 1e-4) {
        const tg = (groundY - oy) / dy;
        if (tg < reach) w = Math.max(w, 1 - Math.max(0, tg) / reach);
      }
      occ += w;
    }
    const f = 1 - strength * (occ / rays);
    cache.set(key, f);
    const list = groups.get(pk) ?? [];
    list.push({ nx, ny, nz, f });
    groups.set(pk, list);
  }
  // Média dentro da superfície lisa (mesmo ponto, normais próximas): a cor não dá salto na aresta lisa.
  for (let i = 0; i < pos.count; i++) {
    const [nx, ny, nz] = normals[i];
    let sum = 0; let cnt = 0;
    for (const e of groups.get(keys[i]) ?? []) if (e.nx * nx + e.ny * ny + e.nz * nz >= cosSmooth) { sum += e.f; cnt++; }
    const f = cnt ? sum / cnt : 1;
    col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
  }
  col.needsUpdate = true;
  return geo;
}

/**
 * Normal esferizada: mistura (`mix` 0..1) a normal de cada vértice com a direção do centro da copa até ele. A copa de uma palmeira
 * de cartum, feita de folhas chatas, lê como uma bola só à luz (não como um monte de pratos). `mix` 0 não muda nada.
 */
export function sphericalNormals(geo: Geo, center: readonly [number, number, number], mix: number, keep?: (i: number) => boolean): Geo {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  let nor = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!nor) { geo.computeVertexNormals(); nor = geo.getAttribute('normal') as THREE.BufferAttribute; }
  for (let i = 0; i < pos.count; i++) {
    if (keep && !keep(i)) continue;
    const rx = pos.getX(i) - center[0]; const ry = pos.getY(i) - center[1]; const rz = pos.getZ(i) - center[2];
    const rl = Math.hypot(rx, ry, rz);
    if (rl < 1e-9) continue;
    const x = nor.getX(i) + (rx / rl - nor.getX(i)) * mix; const y = nor.getY(i) + (ry / rl - nor.getY(i)) * mix; const z = nor.getZ(i) + (rz / rl - nor.getZ(i)) * mix;
    const l = Math.hypot(x, y, z) || 1;
    nor.setXYZ(i, x / l, y / l, z / l);
  }
  nor.needsUpdate = true;
  return geo;
}

/**
 * Tufo de recorte alfa: `n` cartões verticais cruzados (largura `w`, altura `h`) com uv de 0 a 1 para a textura de lâmina
 * (`scenery/cutout.ts`), normal para cima (o capim acende como o chão) e cor mais escura no pé. Só os atributos do lote
 * `cutout`: position, normal, color e uv. 2 triângulos por cartão.
 */
export function cutoutCards(n: number, w: number, h: number, seed: number, foot = '#7fa86a', head = '#ffffff'): Geo {
  const pos: number[] = []; const nor: number[] = []; const col: number[] = []; const uvs: number[] = [];
  const cf = new THREE.Color(foot); const ch = new THREE.Color(head);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI + (hash2(seed, k) - 0.5) * 0.35;
    const c = Math.cos(a); const s = Math.sin(a);
    const hh = h * (0.8 + hash2(seed, k + 9) * 0.4);
    const x0 = -c * w / 2; const z0 = -s * w / 2; const x1 = c * w / 2; const z1 = s * w / 2;
    const q: Array<[number, number, number, number, number]> = [[x0, 0, z0, 0, 0], [x1, 0, z1, 1, 0], [x1, hh, z1, 1, 1], [x0, 0, z0, 0, 0], [x1, hh, z1, 1, 1], [x0, hh, z0, 0, 1]];
    for (const [x, y, z, u, v] of q) {
      pos.push(x, y, z); nor.push(0, 1, 0); uvs.push(u, v);
      const t = Math.min(1, y / hh);
      col.push(cf.r + (ch.r - cf.r) * t, cf.g + (ch.g - cf.g) * t, cf.b + (ch.b - cf.b) * t);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

export interface WavyStripOptions {
  /** Comprimento (Z) e largura (X) em metros; a tira fica centrada na origem, com a tampa em y = `thick`. */
  len: number;
  width: number;
  /** Ondas inteiras no comprimento (inteiro: a tira emenda sem degrau na seguinte) e a amplitude (m) das fronteiras. */
  waves: number;
  amp: number;
  /** Faixas pretas e brancas alternadas e fileiras por tira (pontos da onda). */
  bands: number;
  zdiv: number;
  /** Altura da tampa acima do chão (m); a tira desce `skirt` m (0,3 por padrão: o calçadão pousa em declive sem mostrar o fundo). */
  thick: number;
  skirt?: number;
  /** Cores das faixas e do meio-fio. */
  dark?: THREE.ColorRepresentation;
  light?: THREE.ColorRepresentation;
  curb?: THREE.ColorRepresentation;
}

/**
 * Calçadão em ondas (o mosaico de pedra portuguesa de Copacabana): faixas largas, pretas e brancas, de fronteira senoidal ao
 * longo de Z — todas na mesma fase, paralelas —, com os dois lados em meio-fio. Plana (tampa em y = `thick`); a onda é a cor.
 */
export function wavyStrip(o: WavyStripOptions): Geo {
  const dark = new THREE.Color(o.dark ?? '#1b1b1d'); const light = new THREE.Color(o.light ?? '#f1efe8'); const curb = new THREE.Color(o.curb ?? '#8f8c86');
  const pos: number[] = []; const col: number[] = [];
  const hw = o.width / 2; const hl = o.len / 2; const low = -(o.skirt ?? 0.3);
  const edge = (b: number, z: number): number => -hw + (o.width * b) / o.bands + (b > 0 && b < o.bands ? o.amp * Math.sin((2 * Math.PI * o.waves * (z + hl)) / o.len) : 0);
  const quad = (a: number[], b: number[], c: number[], d: number[], color: THREE.Color): void => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) col.push(color.r, color.g, color.b);
  };
  for (let r = 0; r < o.zdiv; r++) {
    const z0 = -hl + (o.len * r) / o.zdiv; const z1 = -hl + (o.len * (r + 1)) / o.zdiv;
    for (let b = 0; b < o.bands; b++) {
      // visto de cima (+Y), anti-horário: (x0,z0) → (x0,z1) → (x1,z1) → (x1,z0)
      quad([edge(b, z0), o.thick, z0], [edge(b, z1), o.thick, z1], [edge(b + 1, z1), o.thick, z1], [edge(b + 1, z0), o.thick, z0], b % 2 ? light : dark);
    }
  }
  // Meio-fio dos dois lados (uma face comprida cada, para fora).
  quad([-hw, o.thick, hl], [-hw, o.thick, -hl], [-hw, low, -hl], [-hw, low, hl], curb);
  quad([hw, o.thick, -hl], [hw, o.thick, hl], [hw, low, hl], [hw, low, -hl], curb);
  return paint(tris(pos), '#ffffff', undefined).setAttribute('color', new THREE.Float32BufferAttribute(col, 3)) as Geo;
}
