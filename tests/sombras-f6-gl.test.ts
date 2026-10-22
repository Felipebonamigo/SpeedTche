// V22/F6 (docs/ondas/V22-f6-sombras.md): a mancha de sombra medida na IMAGEM (o harness do jogo, Chromium + swiftshader, 1280×720). Sem o Chromium o arquivo é pulado; `NC_REQUIRE_GL=1` o exige.
// A Baixa não tem mapa de sombra do sol: tudo o que escurece o chão ao pé de uma árvore é a mancha falsa (runtime.ts, lote `blob`). Antes da F6 ela ficava ENTERRADA no relevo (deslocamento de
// profundidade −2, disco horizontal) e só os mastros, na faixa plana junto da pista, apareciam; no Cânion e em qualquer subida o disco horizontal ficava acima do olho e era visto de costas.
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
  try { mkdirSync('scratch', { recursive: true }); appendFileSync('scratch/sombras-f6-medidas.log', `${linha}\n`); } catch { /* só diagnóstico */ }
}

if (REQUIRED) it('o Chromium existe (NC_REQUIRE_GL=1)', () => { expect(available, `sem ${CHROME}`).toBe(true); });

describe.skipIf(!available)('V22/F6 · a mancha de sombra na imagem (swiftshader)', { timeout: 1_800_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let port = 0;
  beforeAll(async () => {
    server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-sombras-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
    await server.listen();
    const addr = server.httpServer?.address();
    port = typeof addr === 'object' && addr ? addr.port : 0;
    browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  }, 300_000);
  afterAll(async () => { await browser?.close().catch(() => undefined); await server?.close().catch(() => undefined); });

  /** Luma média (sRGB 0..1) de cada região de uma captura. */
  async function lumas(qs: string, rects: Array<[number, number, number, number]>): Promise<number[]> {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(1_700_000);
    try {
      await page.goto(`http://127.0.0.1:${port}/tools/render-harness.html?${qs}&hud=0&cam=high&frames=14`);
      await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true);
      await page.waitForTimeout(2500);
      const png = (await page.screenshot()).toString('base64');
      return await page.evaluate(async ({ src, rects }) => {
        const img = new Image(); img.src = src; await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const ctx = cv.getContext('2d'); if (!ctx) return [];
        ctx.drawImage(img, 0, 0);
        return rects.map(([x0, y0, w, h]) => { const px = ctx.getImageData(x0, y0, w, h).data; let s = 0; for (let i = 0; i < px.length; i += 4) s += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; return s / (px.length / 4) / 255; });
      }, { src: `data:image/png;base64,${png}`, rects });
    } finally { await page.close().catch(() => undefined); }
  }

  // A Serra do Navio (04 do diagnóstico), segmento 1100, Baixa, de dia: a palmeira grande à esquerda (tronco em x ≈ 270, pé em y ≈ 395). O sol aqui cai do lado direito, então a sombra vai para
  // a ESQUERDA do pé (x 175–270) e o lado direito (295–390) fica ao sol; a faixa de controle (20–130) é grama longe de qualquer pé.
  it('Baixa, Serra seg 1100: o chão do lado de sombra do pé da palmeira é ≥ 8% mais escuro que a grama de controle — antes (disco enterrado no relevo): 1,06×; depois: ~0,85×', async () => {
    const [sombra, sol, controle] = await lumas('track=serra_do_navio&seg=1100&q=low', [[175, 396, 95, 12], [295, 396, 95, 12], [20, 396, 110, 12]]);
    registrar(`[V22/F6] serra 1100 Baixa: lado da sombra ${sombra.toFixed(4)} · lado do sol ${sol.toFixed(4)} · controle ${controle.toFixed(4)} → sombra/controle ${(sombra / controle).toFixed(3)}, sol/controle ${(sol / controle).toFixed(3)}`);
    expect(sombra / controle, `sombra ÷ controle ${(sombra / controle).toFixed(3)}`).toBeLessThanOrEqual(0.92);
    // e do lado do sol não escurece (a mancha aponta para longe do sol, não é um disco centrado)
    expect(sol / controle, `sol ÷ controle ${(sol / controle).toFixed(3)}`).toBeGreaterThanOrEqual(0.97);
  });
});
