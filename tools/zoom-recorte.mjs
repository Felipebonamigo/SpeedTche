// Recorte ampliado (vizinho mais próximo) de uma captura, para olhar borda de sombra pixel a pixel (V22/F6).
//   node tools/zoom-recorte.mjs captura.png saida.png x,y,w,h [fator=4]
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const [file, out, rect, k = '4'] = process.argv.slice(2);
if (!file || !out || !rect) { console.error('uso: node tools/zoom-recorte.mjs in.png out.png x,y,w,h [fator]'); process.exit(2); }
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
const src = `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const b64 = await page.evaluate(async ({ src, rect, k }) => {
  const img = new Image(); img.src = src; await img.decode();
  const [x, y, w, h] = rect.split(',').map(Number);
  const c = document.createElement('canvas'); c.width = w * k; c.height = h * k;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x, y, w, h, 0, 0, w * k, h * k);
  return c.toDataURL('image/png').split(',')[1];
}, { src, rect, k: Number(k) });
writeFileSync(out, Buffer.from(b64, 'base64'));
await browser.close();
console.log('ok', out);
