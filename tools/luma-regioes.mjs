// Luma média (sRGB 0..1) de regiões de uma captura: node tools/luma-regioes.mjs captura.png x,y,w,h [x,y,w,h ...]  (uma linha por região). V22/F6.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const [file, ...rects] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
const src = `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const out = await page.evaluate(async ({ src, rects }) => {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  return rects.map((r) => { const [x, y, w, h] = r.split(',').map(Number); const d = ctx.getImageData(x, y, w, h).data; let s = 0, R = 0, G = 0, B = 0; const n = d.length / 4; for (let i = 0; i < d.length; i += 4) { s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; R += d[i]; G += d[i + 1]; B += d[i + 2]; } return { r, luma: +(s / n / 255).toFixed(4), rgb: [R / n, G / n, B / n].map((v) => Math.round(v)) }; });
}, { src, rects });
for (const o of out) console.log(JSON.stringify(o));
await browser.close();
