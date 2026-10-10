// Traseira-vitrine (M4): o que o jogador mais vê do carro com a câmera de perseguição. Os estilos mantêm as lanternas
// próprias (cada um tem a sua forma, agora grandes); aqui ficam as peças que todo estilo repete: escapes de ponteira
// larga, difusor com aletas e o aerofólio de brinquedo (lâmina grossa, placas altas, suportes). Devolve o descritor
// (`RearKit`) com o que construiu, em caixas do referencial do carro: o teste confere a malha DENTRO delas, então o
// descritor não pode mentir sobre uma peça que não está lá.
import { diffuser, exhaust, wing, type WingSpec } from './details';
import type { MeshBuilder, P3 } from './kit';
import type { RearKit } from './model';
import { CARBON } from './paints';
import type { Brush } from './kit';

export interface RearSpec {
  /** Ponteiras: centro, raio (≥ 0,055; a ponta é cromada com fundo escuro) e comprimento do cilindro. */
  exhausts: ReadonlyArray<{ x: number; y: number; z: number; r: number; len?: number }>;
  diffuser: { y: number; z: number; w: number; fins: number; fin?: Brush };
  /** Aerofólio de brinquedo (só nos esportivos): o `wing` de details.ts com a lâmina grossa. */
  wing?: WingSpec;
}

/** A saída da chama do nitro de cada ponteira: o mesmo lugar, 2 cm à frente da boca. */
export const exhaustPoint = (e: RearKit['exhausts'][number]): P3 => [e.x, e.y, e.z + 0.02];

/** Constrói as peças da traseira e devolve o descritor. */
export function buildRear(b: MeshBuilder, o: RearSpec): RearKit {
  for (const e of o.exhausts) exhaust(b, e.x, e.y, e.z, e.r, e.len ?? 0.2);
  const d = o.diffuser;
  diffuser(b, d.y, d.z, d.w, d.fins, d.fin ?? CARBON);
  let box: RearKit['wing'] = null;
  if (o.wing) {
    wing(b, o.wing);
    const w = o.wing; const hs = w.span / 2;
    box = { min: [-hs - 0.04, w.y - 0.16, w.z - w.chord / 2 - 0.06], max: [hs + 0.04, w.y + 0.16, w.z + w.chord / 2 + 0.06] };
  }
  return {
    exhausts: o.exhausts.map((e) => ({ x: e.x, y: e.y, z: e.z, r: e.r })),
    // O difusor: a caixa base (0,3 de profundidade) e as aletas, que saem 0,08 para trás.
    diffuser: { min: [-d.w / 2, d.y - 0.07, d.z - 0.15], max: [d.w / 2, d.y + 0.12, d.z + 0.23] },
    wing: box,
  };
}
