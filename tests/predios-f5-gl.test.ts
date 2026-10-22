// V22/F5 (docs/ondas/V22-f5-predios.md), a PAREDE do prédio medida na IMAGEM: o harness do jogo (`tools/render-harness.html`, Chromium + swiftshader, 1280×720, câmera Alta, qualidade Alta)
// no entardecer de Paraty (a captura `06` do diagnóstico: a torre da esquerda tinha a face à sombra do sol, "quase preta", com as janelas acesas iguais). Sem o Chromium o arquivo é
// pulado; `NC_REQUIRE_GL=1` o exige.
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REQUIRED = process.env.NC_REQUIRE_GL === '1';
const available = existsSync(CHROME);

function registrar(linha: string): void {
  console.log(linha);
  try { mkdirSync('scratch', { recursive: true }); appendFileSync('scratch/predios-f5-medidas.log', `${linha}\n`); } catch { /* só diagnóstico */ }
}

if (REQUIRED) it('o Chromium existe (NC_REQUIRE_GL=1)', () => { expect(available, `sem ${CHROME}`).toBe(true); });

describe.skipIf(!available)('V22/F5 · a parede do prédio na imagem (swiftshader)', { timeout: 1_800_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let port = 0;
  beforeAll(async () => {
    server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-predios-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
    await server.listen();
    const addr = server.httpServer?.address();
    port = typeof addr === 'object' && addr ? addr.port : 0;
    browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  }, 300_000);
  afterAll(async () => { await browser?.close().catch(() => undefined); await server?.close().catch(() => undefined); });

  /** Luma (sRGB 0..1) de cada pixel de uma região da captura, ordenada. */
  async function lumas(qs: string, rect: [number, number, number, number]): Promise<number[]> {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(1_700_000);
    try {
      await page.goto(`http://127.0.0.1:${port}/tools/render-harness.html?${qs}&hud=0&q=high&cam=high&frames=14`);
      await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true);
      await page.waitForTimeout(2500);
      const png = (await page.screenshot()).toString('base64');
      return await page.evaluate(async ({ src, rect }) => {
        const img = new Image(); img.src = src; await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const ctx = cv.getContext('2d'); if (!ctx) return [];
        ctx.drawImage(img, 0, 0);
        const [x0, y0, w, h] = rect; const px = ctx.getImageData(x0, y0, w, h).data; const out: number[] = [];
        for (let i = 0; i < px.length; i += 4) out.push((0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255);
        return out.sort((a, b) => a - b);
      }, { src: `data:image/png;base64,${png}`, rect });
    } finally { await page.close().catch(() => undefined); }
  }

  // A torre de Paraty (06): a fachada de x 250–510, y 10–170 (sem a copa da palmeira, que só entra mais abaixo). A parede é tudo o que não é janela acesa (pixels abaixo de metade do P95).
  it('Paraty ao entardecer: a parede da torre (o que não é janela acesa) tem luma P75 ≥ 0,13 e ≥ 0,25 do brilho das janelas (P95) — antes: parede quase preta, ~0,09 e ~0,10', async () => {
    const v = await lumas('track=paraty&seg=200', [250, 10, 260, 160]);
    const p95 = v[Math.floor(v.length * 0.95)];
    const wall = v.filter((x) => x < 0.5 * p95); // tudo o que não é janela acesa: parede, montante e vidro apagado
    const q = (f: number): number => wall[Math.floor(wall.length * f)];
    // O vidro apagado é ~metade da fachada e fica escuro (é vidro); a PAREDE é o tom de cima do que sobra: o quartil mais claro (P75) dos pixels que não são janela acesa.
    const medWall = q(0.75);
    registrar(`[V22/F5] paraty (06): não-janela P25 ${q(0.25).toFixed(3)} · P50 ${q(0.5).toFixed(3)} · P75 (parede) ${medWall.toFixed(3)} · P90 ${q(0.9).toFixed(3)} · janelas P95 ${p95.toFixed(3)} · razão ${(medWall / p95).toFixed(3)}`);
    expect(medWall, `luma da parede ${medWall.toFixed(3)}`).toBeGreaterThanOrEqual(0.13);
    expect(medWall / p95, `razão parede ÷ janela ${(medWall / p95).toFixed(3)}`).toBeGreaterThanOrEqual(0.25);
  });
});
