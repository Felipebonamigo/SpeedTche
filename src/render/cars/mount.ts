// Onde a câmera de Capô e a da Frente ficam em cada carro, e como o corte do próprio carro viaja até o shader. Puro (sem three): lê as
// posições da malha do modelo (referencial do carro: +x direita, +y cima, o bico em −z), então vale para os 13 estilos e para o `.glb`.
// A câmera fica SEMPRE dentro da caixa de colisão do próprio carro (`CAMERA_DYNAMICS.orbit.halfLength`): nenhum outro carro nem cenário
// sólido do núcleo chega ali, e por isso a câmera presa ao carro nunca entra em nada.

/** Meio comprimento da caixa de colisão do carro (m): o mesmo de `CAMERA_DYNAMICS.orbit.halfLength` (sight.ts; repetido aqui para a folha ficar sem importações). */
const HALF_LENGTH = 2;
/** Quanto o olho do capô fica acima do capô (m): 0,3 de plano próximo + folga. */
const HOOD_EYE_ABOVE = 0.55;
/** O corte esconde tudo acima do capô mais esta folga (m). */
const HOOD_CUT_ABOVE = 0.02;
/** O capô é a frente do carro até esta fração do comprimento. */
const HOOD_FRACTION = 0.26;
/** Altura do olho da câmera da Frente (m do chão). */
const BUMPER_EYE_Y = 0.4;

export interface MountPoint { x: number; y: number; z: number; cutY: number }

export interface CarMount {
  /** Ponta do bico e da traseira (z; o bico é o menor). */
  noseZ: number;
  tailZ: number;
  /** Altura do capô (m) e do teto. */
  hoodTop: number;
  roofY: number;
  /** Câmera do Capô: olho sobre o capô; `cutY`: acima disto o próprio carro some (cabine, teto). */
  hood: MountPoint;
  /** Câmera da Frente: na ponta do bico; `cutY` 0: a carroceria inteira some (o bico atrás do olho cortaria no plano próximo). */
  bumper: MountPoint;
}

/** Calcula o ponto de montagem a partir das posições (x, y, z intercalados) da malha. */
export function carMount(positions: ArrayLike<number>): CarMount {
  let minZ = Infinity; let maxZ = -Infinity; let maxY = 0;
  const n = Math.floor(positions.length / 3);
  for (let i = 0; i < n; i++) {
    const y = positions[i * 3 + 1]; const z = positions[i * 3 + 2];
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
    if (y > maxY) maxY = y;
  }
  if (!(n > 0)) { minZ = -2; maxZ = 2; maxY = 1.2; }
  const length = maxZ - minZ;
  let hoodTop = 0;
  const hoodEnd = minZ + length * HOOD_FRACTION;
  for (let i = 0; i < n; i++) if (positions[i * 3 + 2] <= hoodEnd && positions[i * 3 + 1] > hoodTop) hoodTop = positions[i * 3 + 1];
  if (!(hoodTop > 0)) hoodTop = maxY * 0.55;
  hoodTop = Math.min(hoodTop, maxY - 0.15);
  const eyeZ = Math.max(-HALF_LENGTH, Math.min(HALF_LENGTH, minZ + length * 0.52));
  const bumperZ = Math.max(-HALF_LENGTH + 0.1, minZ - 0.05);
  return {
    noseZ: minZ, tailZ: maxZ, hoodTop, roofY: maxY,
    hood: { x: 0, y: hoodTop + HOOD_EYE_ABOVE, z: eyeZ, cutY: hoodTop + HOOD_CUT_ABOVE },
    bumper: { x: 0, y: BUMPER_EYE_Y, z: bumperZ, cutY: 0 },
  };
}

// ───────────────────────────── O corte no shader ─────────────────────────────
// `instExtra.w` já leva os bits da instância (1 freio, 2/4 faixas, 3–5 acabamento). O corte usa o bit 6 (64) e, acima dele, a altura do
// corte em centímetros (0..255): o fragmento descarta o que está acima. É por instância, no mesmo lote e no mesmo material — nenhuma chamada
// de desenho a mais — e só o próprio carro, só no viewport da câmera presa a ele (o `pose` é por viewport).

export const CUT_BIT = 64;
export const CUT_SHIFT = 7;

export function cutFlags(flags: number, cutY: number): number {
  const cm = Math.max(0, Math.min(255, Math.round(cutY * 100)));
  return (flags & (CUT_BIT - 1)) | CUT_BIT | (cm << CUT_SHIFT);
}

/** A altura do corte (m) que `flags` leva, ou null sem o bit. */
export function readCutFlags(flags: number): number | null {
  return (flags & CUT_BIT) === 0 ? null : ((flags >> CUT_SHIFT) & 255) / 100;
}
