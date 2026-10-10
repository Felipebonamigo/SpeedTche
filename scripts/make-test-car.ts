// Grava o carro de caixas do contrato do asset (scripts/lib/test-car.ts) para provar o `npm run check-car` sem arte de ninguém.
// Uso: npx tsx scripts/make-test-car.ts [saida.glb]   (padrão: scratch/car-caixas.glb)
//      npm run check-car -- scratch/car-caixas.glb gt
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildTestCar } from './lib/test-car';

const out = process.argv[2] ?? 'scratch/car-caixas.glb';
mkdirSync(dirname(out), { recursive: true });
const glb = buildTestCar();
writeFileSync(out, glb);
console.log(`${out}  ${(glb.length / 1024).toFixed(0)} KB`);
