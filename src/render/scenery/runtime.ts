// Cenário na tela: o layout da pista (layout.ts) vira instâncias de BatchedMesh — UM lote por material
// (liso com sombra, liso sem sombra, 4 fachadas, luz, baliza, facho, painéis e manchas de sombra), então
// o cenário inteiro custa ~10 chamadas de desenho por viewport, qualquer que seja o bioma. Cada modelo
// é uma geometria dentro do lote; cada lote reserva, por geometria, o máximo de instâncias que cabem
// numa janela do RoadFrame (calculado por pista). A cada quadro, para cada viewport, os objetos da
// janela viram matrizes no referencial local. Sombra de verdade só nos sprites (perto da pista); a
// decoração distante usa mancha no chão (barata e funciona também na qualidade baixa).
import * as THREE from 'three';
import type { Track } from '../../core/types';
import { sceneryLook, type Palette } from '../palette';
import { applyGrade, applyStylize } from '../stylize';
import type { RoadFrame } from '../roadframe';
import { getModel, landmarkOf } from './catalog';
import { FACADE_CELL_SPAN, type MatKey, type Model } from './geom';
import { sceneryLayout, type Layout, type Placement } from './layout';
import { HAZE_FOG_SCALE, SCENERY_BEHIND_DRAW, SCENERY_FOG_REACH } from './sight';
import { bladeTexture, cutoutMaterial } from './cutout';
import { facadeTextures, panelAtlas } from './textures';
import { applyWind, makeWindUniforms, windDetailOn } from './wind';

type BatchKey = 'flat' | 'dress' | 'haze' | 'office' | 'apartment' | 'classic' | 'house' | 'glow' | 'beacon' | 'cone' | 'panel' | 'blob' | 'cutout';

/** Janela máxima do RoadFrame em segmentos (BEHIND + AHEAD alto + 1 = 291) com folga. */
const WINDOW = 300;
/** Segmentos atrás do carro que ainda desenham (sombra e canto da tela). */
const BEHIND_DRAW = SCENERY_BEHIND_DRAW;
/** Pontos da janela na qualidade alta (renderer.ts: BEHIND 30 + AHEAD.high 260). */
const FULL_WINDOW = 290;
/** Mancha de sombra só até aqui (≈ 240 m): mais longe ela tem poucos pixels e custa uma instância. */
const BLOB_AHEAD = 60;

const ATTRS: Record<BatchKey, string[]> = {
  flat: ['position', 'normal', 'color'], dress: ['position', 'normal', 'color'], haze: ['position', 'normal', 'color'], glow: ['position', 'normal', 'color'], beacon: ['position', 'normal', 'color'],
  office: ['position', 'normal', 'color', 'uv'], apartment: ['position', 'normal', 'color', 'uv'], classic: ['position', 'normal', 'color', 'uv'], house: ['position', 'normal', 'color', 'uv'],
  panel: ['position', 'normal', 'uv'], cone: ['position', 'normal'], blob: ['position', 'normal', 'uv'], cutout: ['position', 'normal', 'color', 'uv'],
};

/** Geometria só com os atributos do lote (o BatchedMesh exige o mesmo conjunto em todas). */
function normalized(g: THREE.BufferGeometry, keys: string[]): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const out = new THREE.BufferGeometry();
  const n = src.attributes.position.count;
  out.setAttribute('position', new THREE.BufferAttribute((src.attributes.position.array as Float32Array).slice(), 3));
  for (const k of keys) {
    if (k === 'position') continue;
    const a = src.getAttribute(k) as THREE.BufferAttribute | undefined;
    if (a) out.setAttribute(k, new THREE.BufferAttribute((a.array as Float32Array).slice(), a.itemSize));
    else if (k === 'color') out.setAttribute(k, new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    else if (k === 'uv') out.setAttribute(k, new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    else if (k === 'normal') out.computeVertexNormals();
  }
  if (src !== g) src.dispose();
  return out;
}

function batchKeyFor(mat: MatKey, sprite: boolean, haze = false): BatchKey {
  if (mat === 'flat') return haze ? 'haze' : sprite ? 'flat' : 'dress';
  return mat;
}

interface Slot { batch: number; geom: number; start: number; cap: number; used: number; prev: number }
interface Ref { slots: number[]; blob: number }
interface Batch {
  key: BatchKey;
  mesh: THREE.BatchedMesh;
  slots: number[];
  /** Lotes com cor por instância: 1 onde a instância já está branca (null = lote sem cor). */
  white: Uint8Array | null;
  /** O mesmo lote: a fase do vento escrita no alfa da cor de cada instância (0 = rígido; wind.ts). */
  phase: Float32Array | null;
}

const MAP_SAMPLE = 'texture2D( map, vMapUv )';
const EMISSIVE_SAMPLE = 'texture2D( emissiveMap, vEmissiveMapUv )';
/**
 * V4: a fachada é um atlas 2 × 2 (textures.ts): a célula vem da uv (`u = local + célula × FACADE_CELL_SPAN`) e a repetição é por `fract`, com a
 * derivada da uv contínua (`textureGrad`), para o mip não costurar a borda de cada repetição. A uv sem deslocamento (os marcos) cai na célula 0.
 */
const FACADE_ATLAS_GLSL = /* glsl */ `
vec4 facadeAtlas( sampler2D tex, vec2 uv ) {
  float cell = clamp( floor( uv.x / ${FACADE_CELL_SPAN.toFixed(1)} ), 0.0, 3.0 );
  vec2 local = vec2( uv.x - cell * ${FACADE_CELL_SPAN.toFixed(1)}, uv.y );
  vec2 origin = vec2( mod( cell, 2.0 ), floor( cell * 0.5 ) ) * 0.5;
  return textureGrad( tex, origin + fract( local ) * 0.5, dFdx( local ) * 0.5, dFdy( local ) * 0.5 );
}`;
export const FACADE_ATLAS_KEY = 'speed-tche-facade-atlas-v1';

/** Compõe a amostra do atlas com o `onBeforeCompile` e a chave que o material já tem (o estilizador). Falha alto se o three mudar as linhas. */
export function applyFacadeAtlas(m: THREE.Material): void {
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    const mapChunk = THREE.ShaderChunk.map_fragment; const emChunk = THREE.ShaderChunk.emissivemap_fragment;
    if (!mapChunk.includes(MAP_SAMPLE) || !emChunk.includes(EMISSIVE_SAMPLE)) throw new Error('fachada: o three mudou o map_fragment/emissivemap_fragment (amostra da textura não achada)');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', () => `#include <common>\n${FACADE_ATLAS_GLSL}`)
      .replace('#include <map_fragment>', () => mapChunk.replace(MAP_SAMPLE, () => 'facadeAtlas( map, vMapUv )'))
      .replace('#include <emissivemap_fragment>', () => emChunk.replace(EMISSIVE_SAMPLE, () => 'facadeAtlas( emissiveMap, vEmissiveMapUv )'));
  };
  m.customProgramCacheKey = () => `${prevKey.call(m)}|${FACADE_ATLAS_KEY}`;
}

/** Mancha de sombra: disco horizontal de raio 1. */
function blobGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const out = g.toNonIndexed();
  g.dispose();
  return out;
}

function blobTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('sem canvas 2D');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Brilho próprio das fachadas acesas à noite (janelas e vitrines: superfícies grandes) e das luminárias (pontos de
 * luz). O bloom da noite (palette.ts) tem de ficar entre os dois: acima das fachadas, que senão viram um clarão
 * branco com névoa, e abaixo das luminárias, que devem brilhar (tests/render-ground.test.ts).
 */
export const FACADE_LIT_EMISSIVE = 1.25;
// HAZE_FOG_SCALE (a névoa mais fina do lote do horizonte, para os marcos do skyline), SCENERY_FOG_REACH e
// SCENERY_BEHIND_DRAW moram em sight.ts: a conta de enquadramento dos marcos usa os mesmos números que o desenho.
export const GLOW_NIGHT = 2.0;

export class Scenery {
  readonly group = new THREE.Group();
  private readonly materials: Record<BatchKey, THREE.Material>;
  private readonly flatMat: THREE.MeshStandardMaterial;
  private readonly hazeMat: THREE.MeshStandardMaterial;
  private readonly facadeMats: THREE.MeshStandardMaterial[] = [];
  private readonly glowMat: THREE.MeshBasicMaterial;
  private readonly beaconMat: THREE.MeshBasicMaterial;
  private readonly panelMat: THREE.MeshStandardMaterial;
  private readonly cutoutMat: THREE.MeshStandardMaterial;
  private readonly blobMat: THREE.MeshBasicMaterial;
  private readonly textures: THREE.Texture[] = [];
  private trackKey = '';
  private layout: Layout | null = null;
  private batches: Batch[] = [];
  private slots: Slot[] = [];
  /** Ref por (modelo, é sprite): índice = modelo * 2 + (sprite ? 1 : 0). */
  private refs: Array<Ref | undefined> = [];
  private blobSlot = -1;
  private night = false;
  /** Vento (wind.ts): tempo e amplitude compartilhados por todas as telas; desliga na janela curta (qualidade Baixa). */
  private readonly windU = makeWindUniforms();
  private windOn = true;
  /** Entardecer: luzes acesas, mas mais fracas que à noite (o céu ainda clareia). */
  private dusk = false;
  /** Facho dos postes (0..1; só na noite fechada) e o quanto de cada material é visto: o período fixo (`applyNight`) ou o ao vivo (`setLive`). */
  private cones = 0;
  private readonly m = new THREE.Matrix4();
  private readonly c4 = new THREE.Vector4();
  private cosH = new Float32Array(WINDOW + 8);
  private sinH = new Float32Array(WINDOW + 8);

  constructor() {
    this.group.name = 'scenery';
    // Sem flatShading: a normal suave com vinco vem do modelo (smooth.ts); caixa continua caixa.
    this.flatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0, side: THREE.DoubleSide });
    this.hazeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    this.hazeMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', `#ifdef USE_FOG
  float hazeD = fogDensity * ${HAZE_FOG_SCALE.toFixed(3)} * vFogDepth;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, 1.0 - exp(-hazeD * hazeD));
#endif`);
    };
    this.hazeMat.customProgramCacheKey = () => 'scenery-haze';
    // Vento no lote liso (copa que balança; o alfa da cor por instância é a fase) ANTES do stylize, que compõe por cima.
    applyWind(this.flatMat, this.windU);
    // Luz estilizada DEPOIS do callback e da chave acima: o stylize compõe com eles (o `fog_fragment` da névoa do horizonte fica).
    // V12: `world` = o albedo do cenário vai ao roxo da noite pelo uniforme `uStylizeWorld` (0 de dia e no entardecer).
    applyStylize(this.flatMat, 'scenery', { world: true });
    applyStylize(this.hazeMat, 'scenery', { world: true });
    const facade = (style: 'office' | 'apartment' | 'classic' | 'house'): THREE.MeshStandardMaterial => {
      const t = facadeTextures(style);
      this.textures.push(t.map, t.light);
      const glass = style === 'office';
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: t.map, emissiveMap: t.light, emissive: '#ffffff', emissiveIntensity: 0, roughness: glass ? 0.34 : 0.78, metalness: glass ? 0.22 : 0 });
      applyStylize(mat, 'facade', { world: true });
      applyFacadeAtlas(mat); // depois do estilizador: a luz de borda dele vem logo depois do `emissivemap_fragment`, que o atlas troca
      this.facadeMats.push(mat);
      return mat;
    };
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.beaconMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    applyGrade(this.glowMat); applyGrade(this.beaconMat);
    const atlas = panelAtlas();
    this.textures.push(atlas);
    this.panelMat = new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: '#ffffff', emissiveIntensity: 0.3, roughness: 0.55, side: THREE.DoubleSide });
    applyStylize(this.panelMat, 'facade');
    const blobTex = blobTexture();
    this.textures.push(blobTex);
    this.blobMat = new THREE.MeshBasicMaterial({ map: blobTex, color: '#1c2248', transparent: true, opacity: 0.34, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    applyGrade(this.blobMat);
    const cone = new THREE.MeshBasicMaterial({ color: '#ffd98a', transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    applyGrade(cone);
    // Recorte alfa (capim de cartão, L4): um lote só, sem sombra; o `stylize` compõe com o callback do material.
    const blade = bladeTexture();
    this.textures.push(blade);
    this.cutoutMat = cutoutMaterial(blade); // o `applyStylize` já foi (cutout.ts)
    this.materials = {
      flat: this.flatMat, dress: this.flatMat, haze: this.hazeMat, office: facade('office'), apartment: facade('apartment'), classic: facade('classic'), house: facade('house'),
      glow: this.glowMat, beacon: this.beaconMat, cone, panel: this.panelMat, blob: this.blobMat, cutout: this.cutoutMat,
    };
    this.applyNight();
  }

  /** O layout da pista atual (montado no primeiro `update` dela): a legenda dos marcos lê as instâncias dele (render/caption/). */
  get currentLayout(): Layout | null { return this.layout; }

  setNight(night: boolean): void {
    this.night = night;
    this.applyNight();
  }

  /**
   * M6 (b): o cenário no instante da corrida, pela paleta ao vivo (`sceneryLook(p.light)`): só cor e intensidade de material, nenhum programa recompilado (a `version` não anda).
   * Nos três períodos dá exatamente os valores de `setTrack`/`applyNight`.
   */
  setLive(p: Palette): void {
    const look = sceneryLook(p.light);
    this.night = look.lit > 0.3;
    this.cones = look.cones;
    this.flatMat.color.set(look.tint);
    for (const m of this.facadeMats) { m.color.copy(this.flatMat.color); m.emissiveIntensity = FACADE_LIT_EMISSIVE * look.lit; }
    this.hazeMat.color.copy(this.flatMat.color);
    this.cutoutMat.color.copy(this.flatMat.color);
    this.blobMat.color.set(look.blob);
    this.blobMat.opacity = look.blobOpacity;
    this.panelMat.emissiveIntensity = look.panel;
    this.glowMat.color.setScalar(look.glow);
    const cone = this.materials.cone as THREE.MeshBasicMaterial;
    cone.opacity = 0.035 * look.cones;
    for (const b of this.batches) if (b.key === 'cone') b.mesh.visible = this.cones > 0.001;
  }

  private applyNight(): void {
    const lit = this.night ? (this.dusk ? 0.6 : 1) : 0;
    for (const m of this.facadeMats) m.emissiveIntensity = FACADE_LIT_EMISSIVE * lit;
    // De dia um pouco de brilho próprio: o outdoor lê a 300 km/h mesmo contra o sol.
    this.panelMat.emissiveIntensity = this.night ? 0.6 : 0.3;
    this.glowMat.color.setScalar(this.night ? (this.dusk ? 1.4 : GLOW_NIGHT) : 0.95);
    this.cones = this.night && !this.dusk ? 1 : 0;
    (this.materials.cone as THREE.MeshBasicMaterial).opacity = 0.035;
    for (const b of this.batches) if (b.key === 'cone') b.mesh.visible = this.cones > 0.001;
  }

  // ───────────────────────────── Montagem por pista ─────────────────────────────

  private setTrack(track: Track): void {
    this.disposeBatches();
    // Com a pista da conta de enquadramento: a legenda dos marcos (render/caption/) mede com ela.
    const layout = sceneryLayout(track, undefined, true);
    this.layout = layout;
    const n = track.segments.length;
    const time = track.def.timeOfDay;
    this.dusk = time === 'dusk';
    // O mesmo filtro de hora da paleta (entardecer esquenta, noite fica roxa: V12): o cenário casa com o chão. É o `sceneryLook` das três luzes (1 · 0,7 · 0,32): um valor só.
    const look = sceneryLook(time === 'day' ? 1 : time === 'dusk' ? 0.7 : 0.32);
    this.flatMat.color.set(look.tint);
    for (const m of this.facadeMats) m.color.copy(this.flatMat.color);
    this.hazeMat.color.copy(this.flatMat.color);
    this.cutoutMat.color.copy(this.flatMat.color);
    this.blobMat.color.set(look.blob);
    this.blobMat.opacity = time === 'night' ? 0.4 : 0.32;

    // Geometrias por lote e contagem por segmento de cada uma (para a capacidade por janela).
    const batchGeoms = new Map<BatchKey, THREE.BufferGeometry[]>();
    const slotOf = new Map<string, number>();
    const counts: Int32Array[] = [];
    const slots: Slot[] = [];
    const batchIndex = new Map<BatchKey, number>();
    const keys: BatchKey[] = [];
    const addGeom = (key: BatchKey, geom: THREE.BufferGeometry, name: string): number => {
      const found = slotOf.get(name);
      if (found !== undefined) return found;
      let bi = batchIndex.get(key);
      if (bi === undefined) { bi = keys.length; keys.push(key); batchIndex.set(key, bi); batchGeoms.set(key, []); }
      const list = batchGeoms.get(key);
      if (!list) throw new Error('lote sem lista');
      list.push(normalized(geom, ATTRS[key]));
      const si = slots.length;
      slots.push({ batch: bi, geom: list.length - 1, start: 0, cap: 0, used: 0, prev: 0 });
      counts.push(new Int32Array(n));
      slotOf.set(name, si);
      return si;
    };
    const refs: Array<Ref | undefined> = [];
    const refFor = (model: number, sprite: boolean): Ref => {
      const k = model * 2 + (sprite ? 1 : 0);
      const r = refs[k];
      if (r) return r;
      const id = layout.models[model];
      const mdl: Model = getModel(id);
      const haze = landmarkOf(id)?.place === 'skyline';
      const ref: Ref = { slots: mdl.parts.map((p, pi) => { const key = batchKeyFor(p.mat, sprite, haze); return addGeom(key, p.geometry, `${id}#${pi}#${key}`); }), blob: mdl.blob ?? 0 };
      refs[k] = ref;
      return ref;
    };
    const blobGeo = blobGeometry();
    let blobSlot = -1;
    for (let i = 0; i < n; i++) {
      for (const p of layout.bySeg[i]) {
        for (const model of p.far >= 0 ? [p.model, p.far] : [p.model]) {
          const ref = refFor(model, p.sprite);
          for (const s of ref.slots) counts[s][i]++;
          if (ref.blob > 0) {
            if (blobSlot < 0) blobSlot = addGeom('blob', blobGeo, 'blob');
            counts[blobSlot][i]++;
          }
        }
      }
    }
    blobGeo.dispose();
    this.refs = refs;
    this.blobSlot = blobSlot;
    // Capacidade = maior soma numa janela de WINDOW segmentos (com volta).
    for (let s = 0; s < slots.length; s++) {
      const c = counts[s];
      const w = Math.min(WINDOW, n);
      let sum = 0;
      for (let i = 0; i < w; i++) sum += c[i];
      let best = sum;
      for (let i = 1; i < n; i++) { sum += c[(i + w - 1) % n] - c[i - 1]; if (sum > best) best = sum; }
      slots[s].cap = best;
    }
    // Um BatchedMesh por lote: geometrias, e as instâncias de cada geometria em sequência (invisíveis).
    const batches: Batch[] = [];
    for (let b = 0; b < keys.length; b++) {
      const key = keys[b];
      const geoms = batchGeoms.get(key) ?? [];
      let verts = 0; let inst = 0;
      for (const g of geoms) verts += g.attributes.position.count;
      const mine = slots.map((s, i) => ({ s, i })).filter((e) => e.s.batch === b);
      for (const e of mine) inst += e.s.cap;
      const mesh = new THREE.BatchedMesh(Math.max(1, inst), Math.max(3, verts), 0, this.materials[key]);
      mesh.name = `scenery:${key}`;
      // V13: corte por objeto (esfera da geometria × câmera, e × a caixa do mapa de sombra no passe de sombra). Antes cada lote desenhava a janela inteira do
      // RoadFrame nos dois passes, mesmo o que estava atrás da câmera, fora do quadro ou fora do mapa de sombra (±80 m): ~30% dos triângulos de Sampa 4p Média,
      // 0,35 ms de CPU por quadro com 4 viewports. A imagem é a mesma (tests/folga-gl.test.ts compara pixel a pixel). Sem ordenação: nada é transparente aqui que dependa dela.
      mesh.perObjectFrustumCulled = true;
      mesh.sortObjects = false;
      mesh.frustumCulled = false;
      mesh.castShadow = key === 'flat' || key === 'office' || key === 'apartment' || key === 'classic' || key === 'house';
      mesh.receiveShadow = key !== 'haze' && key !== 'glow' && key !== 'beacon' && key !== 'cone' && key !== 'blob';
      if (key === 'blob') mesh.renderOrder = 1;
      const geomIds = geoms.map((g) => mesh.addGeometry(g));
      for (const g of geoms) g.dispose();
      for (const e of mine) {
        e.s.start = -1;
        for (let k = 0; k < e.s.cap; k++) {
          const id = mesh.addInstance(geomIds[e.s.geom]);
          if (e.s.start < 0) e.s.start = id;
          mesh.setVisibleAt(id, false);
        }
      }
      mesh.visible = false;
      this.group.add(mesh);
      const tinted = key === 'flat' || key === 'dress';
      // A textura de cor por instância nasce já (senão o programa compila sem `USE_BATCHING_COLOR` e recompila na 1ª árvore tingida). Ela nasce
      // toda em 1 (inclusive o alfa, a fase do vento): `phase` começa em 1 para casar, e a 1ª escrita de cada instância põe o alfa certo.
      if (tinted && inst > 0) mesh.setColorAt(0, this.c4.set(1, 1, 1, 1));
      batches.push({ key, mesh, slots: mine.map((e) => e.i), white: tinted ? new Uint8Array(Math.max(1, inst)).fill(1) : null, phase: tinted ? new Float32Array(Math.max(1, inst)).fill(1) : null });
    }
    this.batches = batches;
    this.slots = slots;
    this.applyNight();
  }

  private disposeBatches(): void {
    for (const b of this.batches) { this.group.remove(b.mesh); b.mesh.dispose(); }
    this.batches = [];
    this.slots = [];
    this.refs = [];
    this.layout = null;
  }

  // ───────────────────────────── Por quadro, por viewport ─────────────────────────────

  /** `lodScale` (cars/lod.ts `screenLodScale`): 0,5 na tela dividida, onde o viewport tem a metade da altura — a decoração pequena some e o modelo de longe entra na metade da distância (mesmos pixels). */
  /** `lush` (layout.ts `lushScenery`): com 1–2 jogadores entra também o enfeite farto (F4: mais árvores e tapete rente à pista); com 3–4 a densidade é a de antes. */
  update(frame: RoadFrame, track: Track, time: number, lodScale = 1, lush = true): void {
    const key = `${track.def.id}:${track.segments.length}`;
    if (key !== this.trackKey || !this.layout) { this.trackKey = key; this.setTrack(track); }
    const layout = this.layout;
    if (!layout) return;
    for (const s of this.slots) { s.prev = s.used; s.used = 0; }
    const count = frame.count;
    if (this.cosH.length < count) { this.cosH = new Float32Array(count); this.sinH = new Float32Array(count); }
    for (let j = 0; j < count; j++) { this.cosH[j] = Math.cos(frame.heading[j]); this.sinH[j] = Math.sin(frame.heading[j]); }
    // Até onde a névoa ainda deixa ver (o resto nem entra no lote).
    const fog = (this.group.parent as THREE.Scene | null)?.fog;
    const fogSegs = fog instanceof THREE.FogExp2 && fog.density > 0 ? SCENERY_FOG_REACH / fog.density / 4 : 1e9;
    // Qualidade: o renderizador pede uma janela menor na baixa (140 à frente) e na média (200) do que na alta (260).
    // O cenário acompanha: com menos vista, desenha só a fração correspondente dos enfeites dispensáveis
    // (forração, mata, soltos — `rank`), nunca os sprites da física, cercas, postes ou pontos de referência.
    const detail = Math.min(1, Math.max(0.5, (count - 1) / FULL_WINDOW));
    // O vento acompanha a janela como o resto do enfeite: a qualidade Baixa (140 à frente) fica parada (docs/ondas/M/M3.md).
    this.windOn = windDetailOn(detail);
    this.windU.uWindTime.value = time;
    this.windU.uWindAmp.value = this.windOn ? 1 : 0;
    const first = Math.max(0, frame.behind - BEHIND_DRAW);
    for (let j = first; j < count - 1; j++) {
      const list = layout.bySeg[frame.segIndex[j]];
      if (list.length === 0) continue;
      const ahead = j - frame.behind;
      if (ahead > fogSegs) break;
      for (let k = 0; k < list.length; k++) {
        const p = list[k];
        if (ahead > p.maxAhead * lodScale || p.rank > detail || (p.lush !== 0 && !lush)) continue;
        const useFar = p.far >= 0 && ahead >= p.farFrom * lodScale;
        this.place(p, useFar ? p.far : p.model, frame, j, time, ahead < BLOB_AHEAD);
      }
    }
    // Visibilidade: só as pontas que mudaram.
    for (const b of this.batches) {
      let any = false;
      for (const si of b.slots) {
        const s = this.slots[si];
        if (s.used > 0) any = true;
        if (s.used === s.prev) continue;
        const lo = Math.min(s.used, s.prev); const hi = Math.max(s.used, s.prev);
        const vis = s.used > s.prev;
        for (let k = lo; k < hi; k++) b.mesh.setVisibleAt(s.start + k, vis);
      }
      // Facho de luz dos postes só na noite fechada (no entardecer o céu ainda clareia e o cone vira um véu bege).
      b.mesh.visible = any && (b.key !== 'cone' || this.cones > 0.001);
    }
    // Baliza piscando (torres, antenas).
    const blink = Math.sin(time * 5) > 0.2 ? (this.night ? 3.2 : 1.6) : 0.35;
    this.beaconMat.color.setScalar(blink);
  }

  private place(p: Placement, model: number, frame: RoadFrame, j: number, time: number, blob: boolean): void {
    const ref = this.refs[model * 2 + (p.sprite ? 1 : 0)];
    if (!ref) return;
    const f = p.f;
    const c0 = this.cosH[j]; const s0 = this.sinH[j]; const c1 = this.cosH[j + 1]; const s1 = this.sinH[j + 1];
    const ax = frame.px[j] + p.x * c0; const az = frame.pz[j] + p.x * s0;
    const bx = frame.px[j + 1] + p.x * c1; const bz = frame.pz[j + 1] + p.x * s1;
    let x = ax + (bx - ax) * f; let z = az + (bz - az) * f;
    let y = frame.py[j] + p.y;
    const h = frame.heading[j] + (frame.heading[j + 1] - frame.heading[j]) * f;
    const e = this.m.elements;
    if (p.linkSeg > 0) {
      // Fios: do poste até o próximo (que precisa estar na janela).
      const j2 = j + p.linkSeg;
      if (j2 >= frame.count - 1) return;
      const cc0 = this.cosH[j2]; const ss0 = this.sinH[j2]; const cc1 = this.cosH[j2 + 1]; const ss1 = this.sinH[j2 + 1];
      const x2 = frame.px[j2] + p.linkX * cc0 + ((frame.px[j2 + 1] + p.linkX * cc1) - (frame.px[j2] + p.linkX * cc0)) * p.linkF;
      const z2 = frame.pz[j2] + p.linkX * ss0 + ((frame.pz[j2 + 1] + p.linkX * ss1) - (frame.pz[j2] + p.linkX * ss0)) * p.linkF;
      const y2 = frame.py[j2] + p.linkY;
      const dx = x2 - x; const dy = y2 - y; const dz = z2 - z;
      const dh = Math.hypot(dx, dz);
      const len = Math.hypot(dh, dy);
      this.compose(Math.atan2(-dx, -dz), Math.atan2(dy, dh), 0, 1, 1, len, x, y, z);
      this.write(ref, p, false, 0);
      return;
    }
    // Rumo no ponto: interpola cos/sen do rumo dos dois pontos (o giro por segmento é < 0,03 rad) e soma o giro do
    // objeto por identidade trigonométrica — sem cos/sen por objeto (o que gira sozinho, como o facho, usa a conta cheia).
    const cH = c0 + (c1 - c0) * f; const sH = s0 + (s1 - s0) * f;
    let cy: number; let sy: number; let yaw = 0;
    if (p.spinY === 0) {
      cy = cH * p.yawC + sH * p.yawS; sy = cH * p.yawS - sH * p.yawC;
    } else {
      yaw = -h + p.yaw + p.spinY * time;
      cy = Math.cos(yaw); sy = Math.sin(yaw);
    }
    if (p.ox !== 0 || p.oy !== 0 || p.oz !== 0) {
      const ox = p.ox * p.sx; const oz = p.oz * p.sz;
      x += cy * ox + sy * oz; z += -sy * ox + cy * oz; y += p.oy * p.sy;
    }
    const pitch = p.pitch + (p.bob !== 0 ? p.bob * Math.sin(time * 1.3 + p.x) : 0);
    const spin = p.spin !== 0 ? p.spin * time + p.phase : (p.bob !== 0 ? p.bob * Math.cos(time * 1.1 + p.x) : 0);
    if (pitch === 0 && spin === 0) {
      e[0] = cy * p.sx; e[1] = 0; e[2] = -sy * p.sx; e[3] = 0;
      e[4] = 0; e[5] = p.sy; e[6] = 0; e[7] = 0;
      e[8] = sy * p.sz; e[9] = 0; e[10] = cy * p.sz; e[11] = 0;
      e[12] = x; e[13] = y; e[14] = z; e[15] = 1;
    } else {
      this.compose(p.spinY === 0 ? Math.atan2(sy, cy) : yaw, pitch, spin, p.sx, p.sy, p.sz, x, y, z);
    }
    this.write(ref, p, true, this.windOn && model === p.model ? p.wind : 0);
    if (blob && ref.blob > 0 && this.blobSlot >= 0) {
      // Mancha: disco no chão alinhado ao rumo da pista (giro −h: cos = cH, sen = −sH).
      const r = ref.blob * Math.max(p.sx, p.sz);
      e[0] = cH * r; e[1] = 0; e[2] = sH * r; e[3] = 0;
      e[4] = 0; e[5] = 1; e[6] = 0; e[7] = 0;
      e[8] = -sH * r; e[9] = 0; e[10] = cH * r; e[11] = 0;
      e[12] = x; e[13] = y + 0.07; e[14] = z; e[15] = 1;
      this.writeSlot(this.blobSlot, null);
    }
  }

  /** Matriz = T · Ry(yaw) · Rx(pitch) · Rz(spin) · S. */
  private compose(yaw: number, pitch: number, spin: number, sx: number, sy: number, sz: number, x: number, y: number, z: number): void {
    const e = this.m.elements;
    const cyw = Math.cos(yaw); const syw = Math.sin(yaw);
    const cp = Math.cos(pitch); const sp = Math.sin(pitch);
    const cs = Math.cos(spin); const ss = Math.sin(spin);
    e[0] = (cyw * cs + syw * sp * ss) * sx; e[1] = (cp * ss) * sx; e[2] = (-syw * cs + cyw * sp * ss) * sx; e[3] = 0;
    e[4] = (-cyw * ss + syw * sp * cs) * sy; e[5] = (cp * cs) * sy; e[6] = (syw * ss + cyw * sp * cs) * sy; e[7] = 0;
    e[8] = (syw * cp) * sz; e[9] = (-sp) * sz; e[10] = (cyw * cp) * sz; e[11] = 0;
    e[12] = x; e[13] = y; e[14] = z; e[15] = 1;
  }

  private write(ref: Ref, p: Placement, tint: boolean, wind: number): void {
    for (let k = 0; k < ref.slots.length; k++) this.writeSlot(ref.slots[k], tint ? p : null, wind);
  }

  private writeSlot(si: number, tint: Placement | null, wind = 0): void {
    const s = this.slots[si];
    if (s.used >= s.cap) return;
    const b = this.batches[s.batch];
    const id = s.start + s.used++;
    b.mesh.setMatrixAt(id, this.m);
    if (!b.white || !b.phase) return;
    // Cor por instância só quando muda (a maioria é branca e rígida: nada a escrever de novo). O alfa é a fase do vento.
    const white = !tint || (tint.r === 1 && tint.g === 1 && tint.b === 1);
    if (white && b.white[id] === 1 && b.phase[id] === wind) return;
    b.mesh.setColorAt(id, white || !tint ? this.c4.set(1, 1, 1, wind) : this.c4.set(tint.r, tint.g, tint.b, wind));
    b.white[id] = white ? 1 : 0;
    b.phase[id] = wind;
  }

  dispose(): void {
    this.disposeBatches();
    const seen = new Set<THREE.Material>();
    for (const m of Object.values(this.materials)) if (!seen.has(m)) { seen.add(m); m.dispose(); }
    for (const t of this.textures) t.dispose();
  }
}
