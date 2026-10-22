// Diferença entre duas capturas (V22/F6): fração de pixels com |Δluma| > limiar e a imagem da diferença (amplificada) em saida.png.
//   node tools/diff-capturas.mjs a.png b.png saida.png [limiar=0.03] [ganho=6]
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const [fa, fb, out, thr = '0.03', gain = '6'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
const url = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
const r = await page.evaluate(async ({ a, b, thr, gain }) => {
  const load = async (s) => { const i = new Image(); i.src = s; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return { c, d: x.getImageData(0, 0, i.width, i.height) }; };
  const A = await load(a); const B = await load(b);
  const o = document.createElement('canvas'); o.width = A.c.width; o.height = A.c.height; const ox = o.getContext('2d'); const od = ox.createImageData(o.width, o.height);
  let n = 0; let sum = 0;
  for (let i = 0; i < A.d.data.length; i += 4) {
    const la = (0.2126 * A.d.data[i] + 0.7152 * A.d.data[i + 1] + 0.0722 * A.d.data[i + 2]) / 255; const lb = (0.2126 * B.d.data[i] + 0.7152 * B.d.data[i + 1] + 0.0722 * B.d.data[i + 2]) / 255;
    const d = lb - la; if (Math.abs(d) > thr) { n++; sum += d; }
    const v = Math.min(255, Math.abs(d) * gain * 255);
    od.data[i] = d < 0 ? v : 0; od.data[i + 1] = d > 0 ? v : 0; od.data[i + 2] = 0; od.data[i + 3] = 255;
  }
  ox.putImageData(od, 0, 0);
  return { frac: n / (A.d.data.length / 4), meanDelta: n ? sum / n : 0, png: o.toDataURL('image/png').split(',')[1] };
}, { a: url(fa), b: url(fb), thr: Number(thr), gain: Number(gain) });
writeFileSync(out, Buffer.from(r.png, 'base64'));
console.log(JSON.stringify({ frac: +r.frac.toFixed(5), meanDelta: +r.meanDelta.toFixed(4) }));
await browser.close();
