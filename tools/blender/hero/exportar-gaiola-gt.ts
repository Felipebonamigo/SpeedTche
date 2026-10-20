// Exporta a GAIOLA do Falcão GT (as estações e os anéis do `Hull` e as seções da cabine de `styles/gt.ts`) para o Blender: o casco herói nasce do MESMO desenho do GT
// de sempre (mesmos eixos, pegada e alturas), só que como superfície de subdivisão. Uso: npx tsx tools/blender/hero/exportar-gaiola-gt.ts > tools/blender/hero/gt-gaiola.json
import { Hull } from '../../../src/render/cars/hull';
import { PAINT, UNDER } from '../../../src/render/cars/paints';
import { GT_CABIN, GT_STRIPE_A } from '../../../src/render/cars/styles/gt';

const axles = [{ z: -1.36, r: 0.44, x: 0.79, w: 0.32 }, { z: 1.34, r: 0.44, x: 0.79, w: 0.32 }] as const;
const hull = new Hull({
  lod: 0,
  zs: [-2.2, -2.17, -2.1, -2.0, -1.85, -1.6, -1.0, -0.4, 0.2, 0.8, 1.3, 1.7, 1.95, 2.08, 2.16, 2.2],
  axles, lift: 0.55, stripe: [GT_STRIPE_A[1], GT_STRIPE_A[0]], band: 0.07,
  // A gaiola do herói: 8 facetas no arco e 8 cm de folga (a subdivisão arredonda o polígono e o puxa uns 3 cm para dentro: sem a folga a boca do vão
  // morderia o pneu), sem o topo fino (a subdivisão faz o abaulado).
  detail: { facets: 8, fine: false }, crisp: true, clear: 0.08,
  yb: [[-2.2, 0.26], [-2.1, 0.18], [-1.9, 0.14], [1.9, 0.14], [2.1, 0.22], [2.2, 0.32]],
  yt: [[-2.2, 0.5], [-2.1, 0.54], [-1.9, 0.6], [-1.5, 0.7], [-0.9, 0.78], [-0.2, 0.8], [0.8, 0.82], [1.5, 0.86], [2.0, 0.86], [2.2, 0.8]],
  crown: [[-2.2, 0], [-2.1, 0.015], [-1.5, 0.035], [-0.5, 0.03], [2, 0.03], [2.2, 0]],
  hw: [[-2.2, 0.78], [-2.16, 0.85], [-2.08, 0.9], [-1.9, 0.93], [-1.4, 0.935], [-0.6, 0.9], [0, 0.87], [0.6, 0.89], [1.3, 0.935], [1.9, 0.935], [2.1, 0.89], [2.2, 0.78]],
  yc: [[-2.2, 0.34], [-2, 0.42], [-1.4, 0.52], [-0.5, 0.58], [0.5, 0.62], [1.3, 0.66], [2, 0.68], [2.2, 0.7]],
  sh: [[-2.2, 0.2], [-2, 0.26], [-1.3, 0.3], [-0.8, 0.22], [-0.2, 0.14], [0.8, 0.14], [1.5, 0.2], [2.0, 0.2], [2.2, 0.16]],
  tuck: [[-2.2, 0.06], [-1.8, 0.09], [0, 0.14], [1.8, 0.09], [2.2, 0.06]],
  flare: [0.02, 0.035], rise: [0.04, 0.04],
  brush: () => PAINT, capFront: PAINT, capBack: UNDER,
});
const [C0, C3] = GT_CABIN;
const base = (z: number) => ({ z, hwb: hull.topHalf(z) - 0.005, yb: hull.topAt(z, hull.topHalf(z)) - 0.004 });
const cabin = [
  { ...base(C0), hwt: base(C0).hwb, yt: base(C0).yb, crown: 0 },
  { ...base(-0.1), hwt: 0.57, yt: 1.17, crown: 0.03 },
  { ...base(0.82), hwt: 0.56, yt: 1.15, crown: 0.03 },
  { ...base(C3), hwt: base(C3).hwb, yt: base(C3).yb, crown: 0 },
];
const out = {
  axles,
  zFront: hull.zFront, zBack: hull.zBack, stripeA: GT_STRIPE_A,
  stations: hull.stations.map((s) => ({ z: s.z, archY: s.archY, axle: s.axle, ring: hull.ring(s).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]) })),
  cabin,
  // consultas que o Blender usa para pousar peças
  crease: Array.from({ length: 45 }, (_, k) => { const z = -2.1 + k * 0.1; return [+z.toFixed(2), +hull.creaseY(z).toFixed(4), +hull.halfWidth(z).toFixed(4), +hull.topHalf(z).toFixed(4), +hull.topAt(z, 0).toFixed(4)]; }),
};
console.log(JSON.stringify(out));
