// Exporta a GAIOLA de um estilo `Hull`-based (hyper, wedge, prototype, roadster, muscle e rally) para o Blender: o casco herói nasce do MESMO desenho do estilo de sempre
// (mesmos eixos, pegada e alturas), só que como superfície de subdivisão. Uso: npx tsx tools/blender/hero/exportar-gaiola.ts <estilo> > tools/blender/hero/<estilo>-gaiola.json
// (`npm run carros-herois` regera os quatro). O GT tem o exportador dele (`exportar-gaiola-gt.ts`, que copia a especificação à mão); aqui o `Hull` do estilo é capturado de dentro do
// próprio construtor (o `build` do `Hull` é espiado), então a gaiola sai da especificação REAL do estilo e `tests/herois-asset.test.ts` pega qualquer envelhecimento.
import { Hull, type HullSpec } from '../../../src/render/cars/hull';
import { MODEL_BUILDERS } from '../../../src/render/cars/models';
import { HYPER_CABIN, HYPER_STRIPE_A } from '../../../src/render/cars/styles/hyper';
import { MUSCLE_CABIN, MUSCLE_STRIPE_A } from '../../../src/render/cars/styles/muscle';
import { PROTOTYPE_CABIN, PROTOTYPE_STRIPE_A } from '../../../src/render/cars/styles/prototype';
import { RALLY_CABIN, RALLY_STRIPE_A } from '../../../src/render/cars/styles/rally';
import { ROADSTER_STRIPE_A } from '../../../src/render/cars/styles/roadster';
import { WEDGE_CABIN, WEDGE_STRIPE_A } from '../../../src/render/cars/styles/wedge';
import type { CarBody } from '../../../src/core/types';

const style = process.argv[2] as CarBody;
if (!(style in MODEL_BUILDERS)) throw new Error(`estilo desconhecido: ${style}`);

// Espia o `Hull` que o construtor do estilo cria (no lod0).
let spec: HullSpec | null = null;
const original = Hull.prototype.build;
Hull.prototype.build = function (this: Hull, b) { spec ??= this.spec; return original.call(this, b); };
MODEL_BUILDERS[style](0);
Hull.prototype.build = original;
if (!spec) throw new Error(`o estilo ${style} não criou um Hull`);
const base: HullSpec = spec;

// A gaiola do herói: 8 facetas no arco e 8 cm de folga (a subdivisão arredonda o polígono e o puxa uns 3 cm para dentro: sem a folga a boca do vão morderia o pneu), sem o topo fino
// (a subdivisão faz o abaulado) e sempre no lod0.
const hull = new Hull({ ...base, lod: 0, detail: { facets: 8, fine: false }, clear: 0.08 });

const stripe = { hyper: HYPER_STRIPE_A, wedge: WEDGE_STRIPE_A, prototype: PROTOTYPE_STRIPE_A, roadster: ROADSTER_STRIPE_A, muscle: MUSCLE_STRIPE_A, rally: RALLY_STRIPE_A } as Partial<Record<CarBody, readonly [number, number]>>;
if (!stripe[style]) throw new Error(`sem faixa A conhecida para ${style}`);

/** Seções-chave da cabine (as mesmas dos construtores dos estilos). `crown` nunca sai 0 exato (o gerador trata 0 como "padrão"). */
function cabin(): Array<Record<string, number>> | null {
  const nz = (v: number): number => (v === 0 ? 1e-6 : v);
  const sec = (s: { z: number; hwb: number; yb: number; hwt: number; yt: number; crown?: number }) => ({ z: s.z, hwb: s.hwb, yb: s.yb, hwt: s.hwt, yt: s.yt, crown: nz(s.crown ?? 0.03) });
  const mid = (z: number, hwt: number, yt: number, crown: number) => sec({ ...hull.cabinBase(z), hwt, yt, crown });
  switch (style) {
    case 'hyper': { const [C0, C3] = HYPER_CABIN; return [sec(hull.cabinEnd(C0)), mid(-0.3, 0.54, 1.05, 0.03), mid(0.32, 0.5, 1.03, 0.03), sec(hull.cabinEnd(C3))]; }
    case 'wedge': { const [C0, C3] = WEDGE_CABIN; return [sec(hull.cabinEnd(C0)), mid(-0.08, 0.6, 1.06, 0.02), mid(0.5, 0.6, 1.05, 0.02), sec(hull.cabinEnd(C3))]; }
    case 'prototype': { const [C0, C3] = PROTOTYPE_CABIN; return [sec(hull.cabinEnd(C0)), mid(-0.36, 0.45, 1.03, 0.04), mid(0.3, 0.42, 1.01, 0.04), sec(hull.cabinEnd(C3))]; }
    case 'muscle': { const [C0, C3] = MUSCLE_CABIN; return [sec(hull.cabinEnd(C0)), mid(-0.08, 0.66, 1.27, 0.03), mid(0.52, 0.66, 1.26, 0.03), sec(hull.cabinEnd(C3))]; }
    case 'rally': { const [C0, C3] = RALLY_CABIN; return [sec(hull.cabinEnd(C0)), mid(-0.28, 0.7, 1.36, 0.02), mid(1.5, 0.68, 1.34, 0.02), sec(hull.cabinEnd(C3))]; }
    case 'roadster': return null; // cockpit aberto: sem cabine
    default: throw new Error(`cabine de ${style} ainda não exportada`);
  }
}
// Cabine: o `edge` (raio da borda do teto) de cada estilo, e o cockpit aberto do roadster (a abertura em z, sem as faces de cima).
const edge = { hyper: 0.1, wedge: 0.05, prototype: 0.08, muscle: 0.07, rally: 0.05 } as Partial<Record<CarBody, number>>;
const pit = style === 'roadster' ? [-0.5, 0.78] : null;

const out = {
  style,
  axles: base.axles,
  zFront: hull.zFront, zBack: hull.zBack, stripeA: stripe[style],
  edge: edge[style] ?? null,
  pit,
  stations: hull.stations.map((s) => ({ z: s.z, archY: s.archY, axle: s.axle, ring: hull.ring(s).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]) })),
  cabin: cabin(),
  // consultas que o Blender usa para pousar peças
  crease: Array.from({ length: 45 }, (_, k) => { const z = -2.1 + k * 0.1; return [+z.toFixed(2), +hull.creaseY(z).toFixed(4), +hull.halfWidth(z).toFixed(4), +hull.topHalf(z).toFixed(4), +hull.topAt(z, 0).toFixed(4)]; }),
};
console.log(JSON.stringify(out));
