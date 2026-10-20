// Validador de um modelo de carro: as regras do briefing de arte que se medem na malha (pegada, rodas,
// faróis e lanternas, escapamento, orçamento, pinturas em uso). Vale para o carro procedural e para o
// carregado de um .glb (gltf.ts): o mesmo critério de aceite para os dois. Puro, sem DOM.
// Coordenadas do jogo: x para a direita, y para cima, −z é a frente; metros.
import { UPGRADE_MAX_LEVEL } from '../../core/constants';
import { UPGRADE_PARTS } from '../../core/career';
import { CARS } from '../../core/data/cars';
import type { CarModel } from './model';
import { LIVERY_A, LIVERY_B, liveryFor } from './paints';

/** Pegada (do briefing e do tests/car-models.test.ts): casco em |x| ≤ 1,0 e |z| ≤ 2,35, até 1,95 de altura. */
export const CAR_LIMITS = {
  halfWidth: 1.0, halfLength: 2.35, maxHeight: 1.95, minGround: 0.04,
  minLength: 4.2, minLengthMicro: 3.2, minWidth: 1.8,
  minWheelRadius: 0.26,
  /** Casco procedural ou do .glb. Subiu de 3.500 para 4.500 na M4, de propósito (roda grande, traseira-vitrine e aerofólio); a bíblia diz "provisório" até o bench do dono. */
  maxShellTriangles: 4500,
  /** Contrato do asset (docs/CONTRATO-DO-ASSET.md): atlas de paleta quadrado; o lod1 tem no máximo esta fração dos triângulos do lod0; espessura de um decal. */
  atlasSize: 256, lod1MaxRatio: 0.5, maxDecalThickness: 0.02,
} as const;

const m1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = (v: number) => v.toLocaleString('pt-BR');

/** Problemas do modelo, em português (vazio = aceito). */
export function checkCarModel(m: CarModel, opts: { maxTriangles?: number } = {}): string[] {
  const out: string[] = [];
  const L = CAR_LIMITS;
  const g = m.shell;
  g.computeBoundingBox();
  const bb = g.boundingBox;
  if (!bb) return ['malha vazia'];
  const length = bb.max.z - bb.min.z;
  const width = bb.max.x - bb.min.x;
  if (bb.max.z > L.halfLength || bb.min.z < -L.halfLength) out.push(`comprimento ${m1(length)} m sai da pegada (|z| até ${m1(L.halfLength)} m do centro)`);
  if (bb.max.x > L.halfWidth || bb.min.x < -L.halfWidth) out.push(`largura ${m1(width)} m sai da pegada (|x| até ${m1(L.halfWidth)} m do centro)`);
  if (bb.max.y >= L.maxHeight) out.push(`altura ${m1(bb.max.y)} m passa de ${m1(L.maxHeight)} m`);
  if (bb.min.y <= L.minGround) out.push(`a carroceria encosta no chão (ponto mais baixo ${m1(bb.min.y)} m)`);
  const minLength = m.body === 'micro' ? L.minLengthMicro : L.minLength;
  if (length <= minLength) out.push(`comprimento ${m1(length)} m é curto demais (mais de ${m1(minLength)} m; a colisão é de 4,0 m)`);
  if (width <= L.minWidth) out.push(`largura ${m1(width)} m é estreita demais (mais de ${m1(L.minWidth)} m; a colisão é de 1,82 m)`);

  const [front, rear] = m.axles;
  if (!(front.z < 0)) out.push('o eixo da frente tem de ficar na frente (−z no jogo, +z no glTF)');
  if (!(rear.z > 0)) out.push('o eixo de trás tem de ficar atrás (+z no jogo, −z no glTF)');
  for (const [name, a] of [['da frente', front], ['de trás', rear]] as const) {
    if (a.x + a.w / 2 > 0.99) out.push(`as rodas ${name} saem da largura (centro a ${m1(a.x)} m, pneu de ${m1(a.w)} m)`);
    if (a.r <= L.minWheelRadius) out.push(`as rodas ${name} são pequenas demais (raio ${m1(a.r)} m; mais de ${m1(L.minWheelRadius)} m)`);
    if (Math.abs(a.z) + a.r >= 2.2) out.push(`as rodas ${name} passam da ponta do carro`);
  }

  // Faróis (aMat.z) na frente, lanternas (aMat.w) atrás.
  const pos = g.getAttribute('position'); const mat = g.getAttribute('aMat');
  let heads = 0; let tails = 0; let headBack = false; let tailFront = false;
  for (let i = 0; i < pos.count; i++) {
    if (mat.getZ(i) > 0.2) { heads++; if (pos.getZ(i) >= 0.7) headBack = true; }
    if (mat.getW(i) > 0.5) { tails++; if (pos.getZ(i) <= 0.5) tailFront = true; }
  }
  if (heads === 0) out.push('sem farol (material headlight)');
  if (tails === 0) out.push('sem lanterna (material taillight)');
  if (headBack) out.push('farol na traseira (o farol fica na frente: +z no glTF)');
  if (tailFront) out.push('lanterna na frente (a lanterna fica atrás: −z no glTF)');

  if (m.exhausts.length < 1 || m.exhausts.length > 2) out.push(`${m.exhausts.length} saídas de escapamento (são 1 ou 2)`);
  for (const e of m.exhausts) {
    if (e[2] <= bb.max.z - 0.25) out.push('o escapamento tem de ficar na traseira');
    if (Math.abs(e[0]) >= 0.95) out.push('o escapamento sai da largura do carro');
  }

  const cap = opts.maxTriangles ?? L.maxShellTriangles; // o casco herói (V9) tem o teto dele: `HERO_MAX_TRIANGLES`
  if (m.triangles > cap) out.push(`${int(m.triangles)} triângulos no casco (até ${int(cap)})`);

  // As pinturas que os carros deste estilo usam têm de existir na malha (senão dois carros saem iguais).
  const paint = g.getAttribute('aPaint');
  const layers = new Set<number>();
  for (let i = 0; i < paint.count; i++) layers.add(Math.round(paint.getZ(i) * 3));
  // Arquivo de um carro só decide as próprias faixas (gltf.ts deriva `liveries` das camadas que a malha tem): nada a conferir.
  for (const def of m.carId ? [] : CARS.filter((c) => c.body === m.body)) {
    const liv = liveryFor(def, CARS, m.liveries);
    if (liv & LIVERY_A && !layers.has(1) && !layers.has(3)) out.push(`o ${def.name} usa a faixa A (material stripe_a), que o modelo não tem`);
    if (liv & LIVERY_B && !layers.has(2) && !layers.has(3)) out.push(`o ${def.name} usa a faixa B (material stripe_b), que o modelo não tem`);
  }
  out.push(...checkContract(m));
  return out;
}

/** O contrato do asset (docs/CONTRATO-DO-ASSET.md) para o que o .glb traz além do casco; modelo procedural (sem `contract`) não tem o que conferir. */
function checkContract(m: CarModel): string[] {
  const c = m.contract;
  if (!c) return [];
  const LIM = CAR_LIMITS;
  const out: string[] = [];
  for (const k of c.kits) {
    const mm = /^kit_([a-z]+)_(\d+)$/.exec(k.name);
    if (!mm) out.push(`o nó "${k.name}" não segue kit_<peça>_<nível> (peça: ${UPGRADE_PARTS.join(', ')}; nível de 1 a ${UPGRADE_MAX_LEVEL})`);
    else if (!(UPGRADE_PARTS as readonly string[]).includes(mm[1])) out.push(`o nó "${k.name}" tem a peça "${mm[1]}": use ${UPGRADE_PARTS.join(', ')}`);
    else if (Number(mm[2]) < 1 || Number(mm[2]) > UPGRADE_MAX_LEVEL) out.push(`o nó "${k.name}" tem o nível ${mm[2]}: de 1 a ${UPGRADE_MAX_LEVEL}`);
  }
  if (c.seats.length > 1) out.push(`o vazio seat aparece ${c.seats.length} vezes (só um: onde o piloto senta)`);
  if (c.seats.length === 0 && m.carId) out.push('falta o vazio seat (onde o piloto senta e a câmera interna fica)');
  for (const d of c.decals) {
    if (!d.hasUv) out.push(`a malha ${d.name} está sem UV (o decal precisa de UV para o número, a placa ou o adesivo)`);
    if (!d.flat) out.push(`a malha ${d.name} não é plana (decal é um plano de até ${m1(LIM.maxDecalThickness * 100)} cm de espessura)`);
  }
  for (const at of c.atlases) {
    if (at.width !== LIM.atlasSize || at.height !== LIM.atlasSize) out.push(`o atlas tem ${at.width} × ${at.height}: o contrato é ${LIM.atlasSize} × ${LIM.atlasSize}`);
  }
  for (const name of c.meshesWithoutUv) out.push(`a malha "${name}" tem atlas mas está sem UV (exporte a UV do atlas de paleta)`);
  if (c.lodNodes.lod1 && !c.lodNodes.lod0) out.push('existe o nó lod1 mas não o lod0: o casco completo tem de estar no lod0');
  if (m.lod1 && m.lod1.triangles > m.triangles * LIM.lod1MaxRatio) out.push(`o lod1 tem ${int(m.lod1.triangles)} triângulos: no máximo a metade do lod0 (${int(m.triangles)} → até ${int(Math.floor(m.triangles * LIM.lod1MaxRatio))})`);
  if (c.atlases.length > 1) out.push(`${c.atlases.length} atlas diferentes nos materiais: o contrato pede um atlas só por carro`);
  return out;
}
