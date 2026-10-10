// Confere um carro em .glb contra o contrato do asset (docs/CONTRATO-DO-ASSET.md), com o mesmo validador do jogo
// (src/render/cars/gltf.ts + check.ts): rodas e escapes, pegada, faróis e lanternas, orçamento, pinturas e, no arquivo da
// arte nova, o atlas 256², o LOD, o vazio `seat`, os nós `kit_<peça>_<nível>` e as malhas `decal_*`.
// Uso: npm run check-car -- caminho/para/falcao.glb [carro-ou-estilo]
//   O nome do arquivo (ou o 2º argumento) é o ID DE UM CARRO (falcao: arquivo de um carro só, src/assets/cars/falcao.glb) ou um
//   ESTILO de carroceria (gt: vale para o estilo todo).
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { CAR_BODIES, CARS } from '../src/core/data/cars';
import type { CarBody } from '../src/core/types';
import { parseCarGlb } from '../src/render/cars/gltf';
import { installNodeImage } from './lib/node-image';

const file = process.argv[2];
if (!file) { console.error('uso: npm run check-car -- <arquivo.glb> [carro-ou-estilo]'); process.exit(2); }
const name = process.argv[3] ?? basename(file).replace(/\.glb$/i, '');
const car = CARS.find((c) => c.id === name);
const body = (car ? car.body : name) as CarBody;
if (!car && !CAR_BODIES.includes(body)) {
  console.error(`"${name}" não é um carro (${CARS.map((c) => c.id).join(', ')}) nem um estilo (${CAR_BODIES.join(', ')})`);
  process.exit(2);
}
installNodeImage(); // o GLTFLoader só decodifica o atlas com createImageBitmap: aqui basta o tamanho
const buf = readFileSync(file);
const { model, problems, warnings } = await parseCarGlb(body, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), car ? { carId: car.id } : {});
for (const w of warnings) console.log(`aviso: ${w}`);
if (model) {
  const bb = model.shell.boundingBox;
  const m = (v: number) => v.toFixed(2);
  const lod = model.lod1 ? `; lod1 ${model.lod1.triangles}` : '';
  const atlas = model.contract?.atlases[0] ? `; atlas ${model.contract.atlases[0].width}²` : '';
  console.log(`${basename(file)} (${car ? `${car.id}, ${body}` : body}): ${model.triangles} triângulos no casco${lod}${atlas}; ${bb ? `${m(bb.max.z - bb.min.z)} × ${m(bb.max.x - bb.min.x)} × ${m(bb.max.y)} m` : ''}; rodas r ${m(model.axles[0].r)}/${m(model.axles[1].r)} m`);
}
if (problems.length) { for (const p of problems) console.log(`✗ ${p}`); process.exit(1); }
console.log(`✓ aceito: o jogo usa este modelo se ele estiver em src/assets/cars/${car ? `${car.id}.glb (o carro ${car.name})` : `${body}.glb (o estilo todo)`}`);
