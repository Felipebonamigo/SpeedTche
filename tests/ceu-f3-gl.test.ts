// V22 · F3 (docs/ondas/V22-f3-ceu.md), o CÉU medido na IMAGEM: Chromium + swiftshader, o `Sky` de verdade (tools/ceu-detalhe.*) numa cena vazia, câmera Alta, o mesmo tone mapping do jogo.
// Os números "antes" são do `main` de partida (ce38f57), medidos com a MESMA página contra o código de antes (docs/ondas/V22-f3-ceu.md, §4). Contratos:
//   1. o lado do sol é visivelmente diferente do oposto de dia (antes: 0,103 de luma; agora ≥ 0,15) e sem estourar o céu (o lado do sol ≤ 0,92);
//   2. cirros: o céu de dia ganha estrutura horizontal em faixas largas (antes 0,014; agora ≥ 0,035, e ≥ 2,5× a de sem cirros); a Baixa não paga cirros;
//   3. dither: o céu liso ganha 1 LSB de grão (resíduo fino 5×5 de 0,0007 para ≥ 0,0012, e < 0,006: continua "céu limpo");
//   4. a luz não muda (opção A do dono): com `uPaint` = 0 o céu é o de antes, pixel a pixel na média (é o que o env map do carro vê), e o entardecer muda pouco (± 0,02 de luma).
// Sem o Chromium o arquivo é pulado; `NC_REQUIRE_GL=1` o exige.
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REQUIRED = process.env.NC_REQUIRE_GL === '1';
const available = existsSync(CHROME);

interface Medida { media: number; residuoFino: number; estruturaHorizontal: number; valoresDistintos: number }
interface Opts { scenery?: string; time?: string; quality?: string; facing?: number; paint?: number; cirrus?: number; bloom?: number }
interface Ceu { medir(o: Opts): Medida; shaderErrors(): string[]; temPintura(): boolean }

if (REQUIRED) it('o Chromium existe (NC_REQUIRE_GL=1)', () => { expect(available, `sem ${CHROME}`).toBe(true); });

describe.skipIf(!available)('V22 · F3 · o céu na imagem (swiftshader)', { timeout: 900_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let page: Page;
  const errors: string[] = [];
  beforeAll(async () => {
    server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-ceu-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
    await server.listen();
    const addr = server.httpServer?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.setDefaultTimeout(800_000);
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}/tools/ceu-detalhe.html`);
    await page.waitForFunction(() => (window as unknown as { ceuReady?: boolean }).ceuReady === true);
  }, 300_000);
  afterAll(async () => { await page?.close().catch(() => undefined); await browser?.close().catch(() => undefined); await server?.close().catch(() => undefined); });

  const medir = (o: Opts): Promise<Medida> => page.evaluate((o) => (window as unknown as { ceu: Ceu }).ceu.medir(o), o);

  it('o shader do domo compila sem erro e a página tem a pintura nova (uPaint)', async () => {
    expect(await page.evaluate(() => (window as unknown as { ceu: Ceu }).ceu.temPintura())).toBe(true);
    await medir({});
    expect(await page.evaluate(() => (window as unknown as { ceu: Ceu }).ceu.shaderErrors())).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('de dia o lado do sol é visivelmente diferente do oposto (≥ 0,15 de luma, antes 0,103) e o céu não estoura (lado do sol ≤ 0,92)', async () => {
    const frente = await medir({ facing: 0 }); const costas = await medir({ facing: 180 });
    expect(frente.media - costas.media, `frente ${frente.media.toFixed(3)} × costas ${costas.media.toFixed(3)}`).toBeGreaterThanOrEqual(0.15);
    expect(frente.media).toBeLessThanOrEqual(0.92);
    expect(frente.media - costas.media).toBeLessThanOrEqual(0.26); // a bolha pinta, não lava o céu
  });

  it('cirros: estrutura horizontal em faixas largas ≥ 0,035 (antes 0,014) e ≥ 2,5× a sem cirros; na Baixa nenhuma (≤ 0,02); a Média tem', async () => {
    const com = await medir({ facing: 180 }); const sem = await medir({ facing: 180, cirrus: 0 });
    expect(com.estruturaHorizontal).toBeGreaterThanOrEqual(0.035);
    expect(com.estruturaHorizontal / sem.estruturaHorizontal).toBeGreaterThanOrEqual(2.5);
    expect((await medir({ facing: 180, quality: 'low' })).estruturaHorizontal).toBeLessThanOrEqual(0.02);
    expect((await medir({ facing: 180, quality: 'medium' })).estruturaHorizontal).toBeGreaterThanOrEqual(0.035);
  });

  it('dither: o céu liso (sem cirros e sem bolha) tem resíduo fino ≥ 0,0012 (antes 0,0007) e < 0,006: grão de 1 LSB, continua céu limpo', async () => {
    const liso = await medir({ facing: 180, cirrus: 0, bloom: 0 });
    expect(liso.residuoFino).toBeGreaterThanOrEqual(0.0012); expect(liso.residuoFino).toBeLessThan(0.006);
    const antes = await medir({ facing: 180, paint: 0 });
    expect(antes.residuoFino, 'com a pintura desligada o céu é o de antes: sem grão').toBeLessThan(0.0009);
  });

  it('a luz não muda: com uPaint = 0 o céu tem a luma do `main` de partida (dia 0,7686 de frente e 0,6653 de costas), o que o env map do carro vê', async () => {
    const f = await medir({ facing: 0, paint: 0 }); const c = await medir({ facing: 180, paint: 0 });
    expect(f.media).toBeCloseTo(0.7686, 3); expect(c.media).toBeCloseTo(0.66533, 3);
  });

  it('o entardecer (a cena que funciona) muda pouco: a luma média fica a ± 0,02 do `main` de partida (frente 0,6988, costas 0,5425)', async () => {
    const f = await medir({ facing: 0, time: 'dusk' }); const c = await medir({ facing: 180, time: 'dusk' });
    expect(Math.abs(f.media - 0.69881)).toBeLessThanOrEqual(0.02); expect(Math.abs(c.media - 0.5425)).toBeLessThanOrEqual(0.02);
  });
});
