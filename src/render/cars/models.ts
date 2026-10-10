// Registro dos 13 estilos de carroceria: cada `CarBody` tem o seu construtor, sem modelo genérico de
// reserva (estilo sem construtor é erro, e o teste confere que as 13 malhas são diferentes). O modelo de
// um .glb da arte (assets.ts, passo 2.4) tem precedência sobre o construtor — por carro (`falcao.glb`) ou por estilo (`gt.glb`).
import type { CarBody, CarDef } from '../../core/types';
import type { CarModel } from './model';
import { buildClassic } from './styles/classic';
import { buildElectric } from './styles/electric';
import { buildGt } from './styles/gt';
import { buildHatch } from './styles/hatch';
import { buildHyper } from './styles/hyper';
import { buildMicro } from './styles/micro';
import { buildMuscle } from './styles/muscle';
import { buildPickup } from './styles/pickup';
import { buildPrototype } from './styles/prototype';
import { buildRally } from './styles/rally';
import { buildRoadster } from './styles/roadster';
import { buildSedan } from './styles/sedan';
import { buildWedge } from './styles/wedge';

export const MODEL_BUILDERS: Readonly<Record<CarBody, () => CarModel>> = {
  gt: buildGt,
  muscle: buildMuscle,
  hatch: buildHatch,
  sedan: buildSedan,
  electric: buildElectric,
  rally: buildRally,
  hyper: buildHyper,
  classic: buildClassic,
  wedge: buildWedge,
  pickup: buildPickup,
  prototype: buildPrototype,
  micro: buildMicro,
  roadster: buildRoadster,
};

/**
 * Modelos que vieram de um .glb (assets.ts), carregados antes de o renderizador nascer. A chave é o **id de um carro**
 * (`falcao.glb`: o modelo é só dele) ou um **estilo** (`gt.glb`: vale para o estilo todo, como sempre valeu).
 */
const overrides = new Map<string, CarModel>();

/** Troca (ou, com null, devolve ao procedural) o modelo de um carro ou de um estilo. */
export function setModelOverride(key: string, model: CarModel | null): void {
  if (model) overrides.set(key, model); else overrides.delete(key);
}

/** De onde vem o modelo: do arquivo da arte ou do código. */
export function modelSource(key: string): 'glb' | 'procedural' {
  return overrides.has(key) ? 'glb' : 'procedural';
}

/**
 * A chave do modelo de um carro: o próprio id se ele tem arquivo, senão o estilo. Carros com a mesma chave dividem o modelo
 * (e o lote de desenho); o Falcão com arquivo deixa de dividir a forma com o Boitatá.
 */
export function modelKey(def: Pick<CarDef, 'id' | 'body'>): string {
  return overrides.has(def.id) ? def.id : def.body;
}

/** Todas as chaves de modelo em uso: os estilos de `CAR_BODIES` e, depois, os carros com arquivo próprio (na ordem de `cars`). */
export function modelKeys(bodies: readonly CarBody[], cars: readonly Pick<CarDef, 'id'>[]): string[] {
  return [...bodies, ...cars.filter((c) => overrides.has(c.id)).map((c) => c.id)];
}

export function buildModel(key: string): CarModel {
  const loaded = overrides.get(key);
  if (loaded) return loaded;
  const make = MODEL_BUILDERS[key as CarBody];
  if (!make) throw new Error(`Estilo de carroceria sem modelo: ${key}`);
  return make();
}
