// V13: o que mudou entre duas capturas, de perto. Lê dois PNG do mesmo tamanho, acha a caixa dos pixels trocados (tolerância 8/255, como a galeria),
// e grava um PNG com ANTES | DEPOIS | DIFERENÇA ampliados (3×) sobre essa caixa (ou sobre `--caixa x0,y0,x1,y1`).
//   node tools/folga-recorte.mjs antes.png depois.png saida.png [--caixa 300,500,700,720] [--zoom 3]
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const pos = []; const opt = { caixa: '', zoom: '3' };
for (let i = 2; i < process.argv.length; i++) { const k = process.argv[i]; if (k === '--caixa' || k === '--zoom') opt[k.slice(2)] = process.argv[++i]; else pos.push(k); }
if (pos.length !== 3) { console.error('uso: node tools/folga-recorte.mjs antes.png depois.png saida.png [--caixa x0,y0,x1,y1] [--zoom 3]'); process.exit(2); }
const [fa, fb, out] = pos;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
const r = await page.evaluate(async ({ a, c, caixa, zoom }) => {
  const load = async (s) => { const i = new Image(); i.src = `data:image/png;base64,${s}`; await i.decode(); const cv = document.createElement('canvas'); cv.width = i.width; cv.height = i.height; const g = cv.getContext('2d'); g.drawImage(i, 0, 0); return { cv, g, w: i.width, h: i.height, d: g.getImageData(0, 0, i.width, i.height).data }; };
  const A = await load(a); const B = await load(c);
  let x0 = A.w, y0 = A.h, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) { const i = (y * A.w + x) * 4; if (Math.abs(A.d[i] - B.d[i]) > 8 || Math.abs(A.d[i + 1] - B.d[i + 1]) > 8 || Math.abs(A.d[i + 2] - B.d[i + 2]) > 8) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  let box = caixa ? caixa.split(',').map(Number) : (n ? [Math.max(0, x0 - 12), Math.max(0, y0 - 12), Math.min(A.w, x1 + 12), Math.min(A.h, y1 + 12)] : [0, 0, 64, 64]);
  const [bx0, by0, bx1, by1] = box; const w = bx1 - bx0, h = by1 - by0; const z = Number(zoom);
  const o = document.createElement('canvas'); o.width = w * z * 3 + 8; o.height = h * z; const g = o.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#000'; g.fillRect(0, 0, o.width, o.height);
  g.drawImage(A.cv, bx0, by0, w, h, 0, 0, w * z, h * z); g.drawImage(B.cv, bx0, by0, w, h, w * z + 4, 0, w * z, h * z);
  const dd = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = ((by0 + y) * A.w + bx0 + x) * 4; const j = (y * w + x) * 4; const m = Math.max(Math.abs(A.d[i] - B.d[i]), Math.abs(A.d[i + 1] - B.d[i + 1]), Math.abs(A.d[i + 2] - B.d[i + 2])); const ch = m > 8; dd.data[j] = ch ? 255 : 20; dd.data[j + 1] = ch ? 40 : 20; dd.data[j + 2] = ch ? 40 : 20; dd.data[j + 3] = 255; }
  const t = document.createElement('canvas'); t.width = w; t.height = h; t.getContext('2d').putImageData(dd, 0, 0);
  g.drawImage(t, 0, 0, w, h, (w * z + 4) * 2, 0, w * z, h * z);
  return { png: o.toDataURL('image/png').split(',')[1], n, box, total: A.w * A.h };
}, { a: readFileSync(fa).toString('base64'), c: readFileSync(fb).toString('base64'), caixa: opt.caixa, zoom: opt.zoom });
writeFileSync(out, Buffer.from(r.png, 'base64'));
console.log(`${r.n} pixels trocados (${(r.n / r.total * 100).toFixed(3)}%), caixa ${r.box.join(',')} → ${out}`);
await b.close();
