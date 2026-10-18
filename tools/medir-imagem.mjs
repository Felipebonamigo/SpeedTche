// Mede imagens (V10, HC2): saturação HSV média, luma, contraste (p95 − p5 da luma) e calor (R − B) de uma região central (fora do HUD) e de faixas.
//   node tools/medir-imagem.mjs a.png b.webp ...   → uma linha JSON por imagem
// Região "centro" = x 0,2–0,8 · y 0,15–0,85 (o HUD fica nos cantos e no topo); "céu" = y 0,12–0,32; "chão" = y 0,6–0,85.
// A mesma conta de `regions()` em tools/render-harness.lab.ts (a medida do teste), para comparar a referência com o jogo.
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { chromium } from 'playwright';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const MIME = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const files = process.argv.slice(2);
if (!files.length) { console.error('uso: node tools/medir-imagem.mjs imagem...'); process.exit(2); }
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage();
for (const f of files) {
  const url = `data:${MIME[extname(f).toLowerCase()] ?? 'image/png'};base64,${readFileSync(f).toString('base64')}`;
  const out = await page.evaluate(async (src) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const W = c.width; const H = c.height; const d = ctx.getImageData(0, 0, W, H).data;
    const stat = ([fx0, fy0, fx1, fy1]) => {
      const x0 = Math.floor(fx0 * W), x1 = Math.ceil(fx1 * W), y0 = Math.floor(fy0 * H), y1 = Math.ceil(fy1 * H);
      const hist = new Uint32Array(256); let n = 0, sat = 0, luma = 0, warm = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4; const r = d[i], g = d[i + 1], b = d[i + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        sat += mx === 0 ? 0 : (mx - mn) / mx; luma += l; warm += (r - b) / 255; n++; hist[Math.round(l * 255)]++;
      }
      const pct = (q) => { let a = 0; for (let v = 0; v < 256; v++) { a += hist[v]; if (a >= q * n) return v / 255; } return 1; };
      const r3 = (v) => Math.round(v * 1000) / 1000;
      return { sat: r3(sat / n), luma: r3(luma / n), contraste: r3(pct(0.95) - pct(0.05)), calor: r3(warm / n) };
    };
    return { w: W, h: H, centro: stat([0.2, 0.15, 0.8, 0.85]), ceu: stat([0.2, 0.12, 0.8, 0.32]), chao: stat([0.2, 0.6, 0.8, 0.85]) };
  }, url);
  console.log(JSON.stringify({ arquivo: f, ...out }));
}
await browser.close();
