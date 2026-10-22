// V22/F6: a sombra falsa do cenário (o lote `blob` de runtime.ts), em dados puros (sem three, sem DOM; tests/sombras-f6.test.ts).
// Antes ela era um disco redondo centrado embaixo do objeto, enquanto o poste e o prédio projetavam sombra direcional do sol: duas lógicas de luz na mesma cena.
// Agora é uma ELIPSE esticada para longe do sol, com o comprimento que a altura do objeto dá àquela elevação, mais um contato escuro e curto no pé.
// Serve a Baixa (sem mapa de sombra): 0 triângulos novos, 0 chamadas (as instâncias entram no mesmo lote).

/** Direção PARA o sol, no referencial da cena (x direita, y cima, −z frente: `Sky.sunDirLocal`); não precisa ser unitária. */
export interface SunDir { x: number; y: number; z: number }

/** O semieixo maior da copa fica preso a [1,2 ; 3,0] × o raio da mancha (o plano V22 §3.7 (a)). */
export const BLOB_LEN_MIN = 1.2;
export const BLOB_LEN_MAX = 3.0;
/**
 * Mastro (poste, outdoor, cipreste, palmeira fina): altura ÷ raio da mancha de 6,5 ou mais. O raio de um poste é 0,7 m, e preso a 3 × 0,7 a sombra de um mastro de 10 m
 * teria 2 m: o mastro tem teto de comprimento próprio, em metros (a sombra do poste de verdade, ao sol de 34°, passa de 14 m).
 * atalho: teto fixo de 12 m; sombra de mastro mais longa (sol a menos de ~35° num poste de 9,8 m) é cortada aí.
 */
export const THIN_RATIO = 6.5;
export const THIN_LEN_MAX_M = 12;
/** A largura do mastro (× o raio) e o quanto a faixa recua atrás do pé (× o raio). */
export const THIN_ACROSS = 0.8;
export const THIN_BACK = 0.35;
/**
 * Teto da opacidade da mancha (o plano V22 §3.7 pede ≤ 0,34): `sceneryLook().blobOpacity` (0,32 dia e entardecer, 0,40 noite; palette.ts, da F7) passa por aqui. Só a noite desce (0,40 → 0,34):
 * a elipse esticada cobre mais chão que o disco redondo, e a noite roxa já era a mancha mais pesada. O dia fica em 0,32 (uma mancha mais fraca some sobre o verde vivo: medido, §3 do cartão).
 */
export const BLOB_OPACITY_MAX = 0.34;
export function blobOpacityFor(lookOpacity: number): number { return Math.min(BLOB_OPACITY_MAX, lookOpacity); }

export interface BlobShape {
  /** Direção da sombra no chão (unitária: para longe do sol). */
  dirX: number; dirZ: number;
  /** Semieixo maior (ao longo da direção) e menor (m, escala 1 do raio dado). */
  along: number; across: number;
  /** Quanto o centro da elipse anda do pé do objeto, ao longo da direção. */
  shift: number;
}

export function isThin(radius: number, height: number): boolean {
  return radius > 0 && height / radius >= THIN_RATIO;
}

/** A elipse da sombra de um objeto de `height` m com a mancha de `radius` m, ao sol de `sun`. */
export function blobShape(sun: SunDir, radius: number, height: number, thin: boolean, out: BlobShape = { dirX: 0, dirZ: 0, along: 0, across: 0, shift: 0 }): BlobShape {
  const hz = Math.hypot(sun.x, sun.z);
  const aimed = hz > 1e-6;
  // Longe do sol; sem azimute (a pino, ou sem direção) a mancha fica sobre o pé (comprimento mínimo).
  const dirX = aimed ? -sun.x / hz : 1; const dirZ = aimed ? -sun.z / hz : 0;
  const reach = aimed && sun.y > 0 ? height * hz / sun.y : aimed ? Infinity : 0; // altura ÷ tan(elevação)
  const lo = BLOB_LEN_MIN * radius;
  if (thin) {
    const along = Math.min(THIN_LEN_MAX_M, Math.max(lo, reach));
    out.dirX = dirX; out.dirZ = dirZ; out.along = along; out.across = THIN_ACROSS * radius; out.shift = along - THIN_BACK * radius;
    return out;
  }
  const along = Math.min(BLOB_LEN_MAX * radius, Math.max(lo, reach));
  out.dirX = dirX; out.dirZ = dirZ; out.along = along; out.across = radius; out.shift = along - radius;
  return out;
}

/** Discos de contato empilhados no pé (o de cima, de 60% do raio, soma ao de baixo: o miolo fica ~0,5 de alfa com o material em 0,32) e a razão de raio de cada um. */
export const CONTACT_LAYERS = 2;
export const CONTACT_LAYER_SCALE: readonly number[] = [1, 0.6];

/** Raio do disco de contato no pé (a oclusão curta e escura onde o objeto toca o chão). */
export function contactRadius(radius: number, _thin: boolean): number {
  return Math.min(1.4, Math.max(0.35, 0.5 * radius));
}
