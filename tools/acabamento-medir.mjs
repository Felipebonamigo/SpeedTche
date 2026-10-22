// V21: mede fotos do carro (recortes do tools/acabamento-lab.mjs / acabamento-folha.mjs): desvio-padrão da luma na área central (quanto de variação de tom há no carro) e a diferença média por pixel entre uma
// foto e a de referência (quanto uma causa mudou a imagem). Também a croma média (HSV) da área central.
//   node tools/acabamento-medir.mjs <referencia.png> <outra.png> [outra.png ...]    → uma linha JSON por imagem (a primeira é a referência: diff 0)
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const [ref, ...outras] = process.argv.slice(2);
if (!ref) { console.error('uso: node tools/acabamento-medir.mjs referencia.png outra.png...'); process.exit(2); }
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
const load = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
const rows = await page.evaluate(async ({ ref, files }) => {
  const read = async (src) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    return { W: c.width, H: c.height, d: ctx.getImageData(0, 0, c.width, c.height).data };
  };
  const a = await read(ref);
  const out = [];
  for (const [name, src] of files) {
    const b = await read(src);
    const x0 = Math.floor(b.W * 0.15), x1 = Math.ceil(b.W * 0.85), y0 = Math.floor(b.H * 0.15), y1 = Math.ceil(b.H * 0.85);
    let n = 0, s = 0, s2 = 0, diff = 0, sat = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * b.W + x) * 4;
      const l = (0.2126 * b.d[i] + 0.7152 * b.d[i + 1] + 0.0722 * b.d[i + 2]) / 255;
      s += l; s2 += l * l; n++;
      const mx = Math.max(b.d[i], b.d[i + 1], b.d[i + 2]), mn = Math.min(b.d[i], b.d[i + 1], b.d[i + 2]);
      sat += mx === 0 ? 0 : (mx - mn) / mx;
      if (a.W === b.W && a.H === b.H) diff += (Math.abs(a.d[i] - b.d[i]) + Math.abs(a.d[i + 1] - b.d[i + 1]) + Math.abs(a.d[i + 2] - b.d[i + 2])) / 3;
    }
    const mean = s / n;
    out.push({ name, lumaMean: +mean.toFixed(4), lumaStd: +Math.sqrt(Math.max(0, s2 / n - mean * mean)).toFixed(4), sat: +(sat / n).toFixed(4), diffVsRef: +(diff / n).toFixed(3) });
  }
  return out;
}, { ref: load(ref), files: [[ref, load(ref)], ...outras.map((f) => [f, load(f)])] });
for (const r of rows) console.log(JSON.stringify(r));
await browser.close();
