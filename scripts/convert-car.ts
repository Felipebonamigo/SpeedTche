// Converte um carro do Kenney Car Kit (CC0, https://kenney.nl/assets/car-kit) para o contrato do asset do jogo
// (scripts/lib/car-convert.ts: receita do colormap, escala por eixo, rodas, LOD, atlas 256²) e confere com o validador do jogo.
// Uso:  npx tsx scripts/convert-car.ts <kenney/GLB format/sedan-sports.glb> <carro> [saida.glb]
//   <carro> é o ID do carro (falcao): o arquivo fica src/assets/cars/<carro>.glb (padrão da saída).
//   O colormap.png é o `Textures/colormap.png` ao lado do .glb (o arquivo do Kenney o referencia por URI externa).
// Depois: npm run check-car -- src/assets/cars/<carro>.glb  e a licença em docs/ARTE.md.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CARS } from '../src/core/data/cars';
import { parseCarGlb } from '../src/render/cars/gltf';
import { convertKenneyCar } from './lib/car-convert';
import { installNodeImage } from './lib/node-image';

const [input, carId, outArg] = process.argv.slice(2);
const car = CARS.find((c) => c.id === carId);
if (!input || !car) { console.error(`uso: npx tsx scripts/convert-car.ts <kenney.glb> <carro: ${CARS.map((c) => c.id).join('|')}> [saida.glb]`); process.exit(2); }
installNodeImage();
const out = outArg ?? `src/assets/cars/${car.id}.glb`;
const { glb, report } = await convertKenneyCar({ glb: readFileSync(input), colormap: readFileSync(join(dirname(input), 'Textures', 'colormap.png')) });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, glb);
console.log(`${out}  ${(glb.length / 1024).toFixed(0)} KB  lod0 ${report.triangles.lod0} · lod1 ${report.triangles.lod1} · roda ${report.triangles.wheel} triângulos  ${report.size.z.toFixed(2)} × ${report.size.x.toFixed(2)} × ${report.size.y.toFixed(2)} m`);
console.log(`papéis (triângulos do casco): ${Object.entries(report.roles).map(([k, n]) => `${k} ${n}`).join(', ')}`);
for (const u of report.unmapped) console.log(`aviso: swatch ${u.cell} (rgb ${u.rgb}) fora da receita: ${u.triangles} triângulos viraram trim`);
const { problems, warnings } = await parseCarGlb(car.body, glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer, { carId: car.id });
for (const w of warnings) console.log(`aviso: ${w}`);
if (problems.length) { for (const p of problems) console.log(`✗ ${p}`); process.exit(1); }
console.log(`✓ passa no validador do jogo como o carro ${car.name}`);
