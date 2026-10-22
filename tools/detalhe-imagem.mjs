// Detalhe fino de regiões de uma captura (V22, diagnóstico §2): desvio-padrão do resíduo `pixel − média 5×5` da luma (0–1), que mede só o detalhe fino e ignora gradiente suave.
//   node tools/detalhe-imagem.mjs captura.png x,y,w,h [x,y,w,h ...]      → uma linha JSON por região
// As regiões do diagnóstico (1280 × 720): estrada de terra da Foz 300,500,170,90 · estrada de terra do Xingó 300,360,200,120 · asfalto de Copacabana 230,400,260,100.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const [file, ...rects] = process.argv.slice(2);
if (!file || !rects.length) { console.error('uso: node tools/detalhe-imagem.mjs imagem x,y,w,h ...'); process.exit(2); }
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
const src = `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const out = await page.evaluate(async ({ src, rects }) => {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const W = c.width; const d = ctx.getImageData(0, 0, W, c.height).data;
  const L = (x, y) => { const i = (y * W + x) * 4; return (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; };
  return rects.map((r) => {
    const [x0, y0, w, h] = r.split(',').map(Number);
    let s2 = 0; let n = 0;
    for (let y = y0 + 2; y < y0 + h - 2; y++) for (let x = x0 + 2; x < x0 + w - 2; x++) {
      let m = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) m += L(x + dx, y + dy);
      const e = L(x, y) - m / 25; s2 += e * e; n++;
    }
    return { regiao: r, detalhe: Math.round(Math.sqrt(s2 / n) * 10000) / 10000 };
  });
}, { src, rects });
for (const o of out) console.log(JSON.stringify({ arquivo: file, ...o }));
await browser.close();
