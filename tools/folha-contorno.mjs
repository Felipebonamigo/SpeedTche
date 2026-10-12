// Folha A/B/C de contorno para o dono escolher (onda L, L2b). NÃO muda o jogo: captura o carro e o cenário pelo harness (tools/render-harness.html)
// e, numa página à parte, desenha 3 variações de contorno por detecção de borda (Sobel) sobre a imagem — lado a lado com o original.
//   A  fino (1 px), preto a 70%;  B  grosso (2 px) e suave, preto a 55%;  C  colorido (2 px): o tom da própria região, escurecido.
// Honestidade: é borda por COR/luminância na imagem pronta, não por profundidade/normal como seria no jogo (casco invertido ou pós por normal);
// serve para julgar espessura e cor do traço, não a qualidade final. Uso (com o vite no ar):  PORT=5601 node tools/folha-contorno.mjs
// Saída: scratch/folha-contorno.png (linhas: carro, cenário; colunas: original, A, B, C) e as capturas-fonte scratch/contorno-*.png.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
mkdirSync('scratch', { recursive: true });
const port = process.env.PORT ?? 5601;
const exe = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SOURCES = [
  ['carro', 'track=copacabana&car=falcao&carview=front34&ticks=60&frames=6&hud=0'],
  ['cenario', 'track=copacabana&seg=70&hud=0&frames=6'],
];
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
p.setDefaultTimeout(240000);
for (const [name, qs] of SOURCES) {
  await p.goto(`http://localhost:${port}/tools/render-harness.html?${qs}`);
  await p.waitForFunction(() => window.ready, null, { timeout: 240000 }).catch(() => {});
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `scratch/contorno-${name}.png` });
  console.log('ok', `scratch/contorno-${name}.png`);
}
const sheet = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const imgs = SOURCES.map(([n]) => 'data:image/png;base64,' + readFileSync(`scratch/contorno-${n}.png`).toString('base64'));
await sheet.setContent('<body style="margin:0;background:#111"><canvas id=c></canvas></body>');
const dataUrl = await sheet.evaluate(async (srcs) => {
  const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  const W = 480, H = 270, LABELS = ['original', 'A fino', 'B grosso suave', 'C colorido'];
  const c = document.getElementById('c'); c.width = W * 4; c.height = (H + 22) * srcs.length;
  const g = c.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height);
  const edges = (img) => {
    const t = document.createElement('canvas'); t.width = W; t.height = H;
    const tg = t.getContext('2d'); tg.drawImage(img, 0, 0, W, H);
    const d = tg.getImageData(0, 0, W, H).data;
    const lum = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) lum[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
    const e = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = -lum[i - W - 1] - 2 * lum[i - 1] - lum[i + W - 1] + lum[i - W + 1] + 2 * lum[i + 1] + lum[i + W + 1];
      const gy = -lum[i - W - 1] - 2 * lum[i - W] - lum[i - W + 1] + lum[i + W - 1] + 2 * lum[i + W] + lum[i + W + 1];
      e[i] = Math.min(1, Math.hypot(gx, gy) / 160);
    }
    return { d, e, t };
  };
  const dilate = (e, r) => { if (r <= 1) return e; const o = new Float32Array(e.length); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let m = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < H && xx >= 0 && xx < W) m = Math.max(m, e[yy * W + xx]); } o[y * W + x] = m; } return o; };
  const variants = [
    (src, e) => { const out = new Uint8ClampedArray(src); for (let i = 0; i < W * H; i++) { const a = (e[i] > 0.35 ? 0.7 : 0) ; for (let k = 0; k < 3; k++) out[i * 4 + k] = src[i * 4 + k] * (1 - a); } return out; },
    (src, e) => { const e2 = dilate(e, 2); const out = new Uint8ClampedArray(src); for (let i = 0; i < W * H; i++) { const a = Math.min(1, e2[i] * 1.4) * 0.55; for (let k = 0; k < 3; k++) out[i * 4 + k] = src[i * 4 + k] * (1 - a); } return out; },
    (src, e) => { const e2 = dilate(e, 2); const out = new Uint8ClampedArray(src); for (let i = 0; i < W * H; i++) { const a = Math.min(1, e2[i] * 1.4) * 0.8; for (let k = 0; k < 3; k++) out[i * 4 + k] = src[i * 4 + k] * (1 - a) + src[i * 4 + k] * 0.3 * a; } return out; },
  ];
  for (let r = 0; r < srcs.length; r++) {
    const img = await load(srcs[r]);
    const { d, e, t } = edges(img);
    g.drawImage(t, 0, r * (H + 22) + 22);
    variants.forEach((v, k) => { const o = new ImageData(v(d, e), W, H); const tc = document.createElement('canvas'); tc.width = W; tc.height = H; tc.getContext('2d').putImageData(o, 0, 0); g.drawImage(tc, (k + 1) * W, r * (H + 22) + 22); });
    g.fillStyle = '#eee'; g.font = '14px sans-serif';
    LABELS.forEach((l, k) => g.fillText(l, k * W + 8, r * (H + 22) + 15));
  }
  return c.toDataURL('image/png');
}, imgs);
writeFileSync('scratch/folha-contorno.png', Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log('ok scratch/folha-contorno.png');
await b.close();
