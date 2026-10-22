// PNG → JPEG (qualidade 0.88) pelo canvas do Chromium (sem ImageMagick na máquina). Uso: node tools/png2jpg.mjs saida-dir a.png b.png …  (grava <saida-dir>/<nome>.jpg)
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
const [dir, ...files] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
for (const f of files) {
  const src = `data:image/png;base64,${readFileSync(f).toString('base64')}`;
  const jpg = await p.evaluate(async (s) => {
    const img = new Image(); img.src = s; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/jpeg', 0.88).split(',')[1];
  }, src);
  const out = `${dir}/${basename(f).replace(/\.png$/, '.jpg')}`;
  writeFileSync(out, Buffer.from(jpg, 'base64'));
  console.log('ok', out);
}
await b.close();
