// Folha HC2 × nosso antes × nosso depois (V10), nas mesmas quatro cenas da galeria (Xingó deserto, Paraty entardecer, Sampa noite, Copacabana dia).
//   node tools/folha-hc2.mjs --refs scratch/ref --antes scratch/galeria/base-08033d9 --depois scratch/galeria/hc2 --saida scratch/hc2/folha-hc2.png [--rotulo-antes 'antes (main 9b1e2ab)'] [--rotulo-depois 'depois (V11)']
// As referências do Horizon Chase 2 (hc2-6, -9, -7, -8 .webp) são SÓ referência visual, nunca textura nem entrada de modelo. Chromium: /opt/pw-browsers.
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const opt = { refs: 'scratch/ref', antes: null, depois: null, saida: 'scratch/hc2/folha-hc2.png', 'rotulo-antes': 'antes (main 08033d9)', 'rotulo-depois': 'depois (V10)' };
for (let i = 2; i < process.argv.length; i += 2) opt[process.argv[i].slice(2)] = process.argv[i + 1];
if (!opt.antes || !opt.depois) { console.error('uso: node tools/folha-hc2.mjs --antes <pasta> --depois <pasta> [--refs scratch/ref] [--saida x.png]'); process.exit(2); }
const data = (p) => `data:${p.endsWith('.webp') ? 'image/webp' : 'image/png'};base64,${readFileSync(p).toString('base64')}`;
const LINHAS = [
  ['Horizon Chase 2 · deserto', 'hc2-6.webp', 'Xingó · deserto', '06-xingo-deserto-br.png'],
  ['Horizon Chase 2 · entardecer', 'hc2-9.webp', 'Paraty · entardecer', '02-paraty-entardecer.png'],
  ['Horizon Chase 2 · noite', 'hc2-7.webp', 'Sampa · noite', '04-sampa-noite.png'],
  ['Horizon Chase 2 · floresta', 'hc2-8.webp', 'Copacabana · dia', '01-copacabana-dia.png'],
];
const cel = (titulo, src) => `<div><div style="padding:6px 4px">${titulo}</div><img src="${data(src)}" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block"></div>`;
const html = `<body style="margin:0;background:#101018;font:600 20px sans-serif;color:#fff"><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:8px;width:2400px">${LINHAS.map(([a, ai, b, bi]) =>
  cel(a, resolve(opt.refs, ai)) + cel(`${b} · ${opt['rotulo-antes']}`, resolve(opt.antes, bi)) + cel(`${b} · ${opt['rotulo-depois']}`, resolve(opt.depois, bi))).join('')}</div></body>`;
mkdirSync(dirname(resolve(opt.saida)), { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 2416, height: 1000 } });
await p.setContent(html); await p.waitForTimeout(800);
await p.screenshot({ path: resolve(opt.saida), fullPage: true });
await b.close();
console.log(`folha: ${resolve(opt.saida)}`);
