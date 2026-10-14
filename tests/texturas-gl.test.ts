// T2 (auditoria de 14/10/2026), no Chromium (swiftshader): uma sessão de largadas seguidas não deixa textura a mais na GPU. O `playtest-memoria`
// acusava +8 texturas por ciclo de 24 corridas: a cada largada de 3 ou 4 jogadores (sombra por viewport, postfx/shadows.ts) da Média para cima numa
// pista de dia que chega ao entardecer, o aquecimento dos faróis (`prewarmLights`, renderer.ts) desenhava o viewport 0 fora da contabilidade da
// sombra e o three criava um mapa de sombra (cor + profundidade) que ninguém guardava nem liberava. Ver docs/ondas/tecnica-14-10.md.
// Sem o Chromium (sem /opt/pw-browsers) o arquivo é pulado; `NC_REQUIRE_GL=1` (o CI) o exige. Só contagem, nenhum tempo de quadro.
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Quality } from '../src/game/contracts';

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REQUIRED = process.env.NC_REQUIRE_GL === '1';
const available = existsSync(CHROME);

/** O que este teste usa de `window.lab` (tools/render-harness.lab.ts). */
type Lab = {
  renderer: { __gl: { info: { memory: { textures: number } } } };
  setup(track: string, humans: number, ticks: number): void;
  render(q: Quality, frames: number): unknown;
  idle(q: Quality, frames: number): unknown;
};

if (REQUIRED) it('o Chromium existe (NC_REQUIRE_GL=1)', () => { expect(available, `sem ${CHROME}`).toBe(true); });

describe.skipIf(!available)('T2: texturas na GPU estáveis entre largadas (swiftshader)', { timeout: 1_800_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let page: Page;
  const errors: string[] = [];
  beforeAll(async () => {
    server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-t2-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
    await server.listen();
    const addr = server.httpServer?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    // Pequena: o 3D por software custa por pixel, e aqui só se contam texturas.
    page = await browser.newPage({ viewport: { width: 320, height: 180 } });
    page.setDefaultTimeout(1_700_000);
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver|404/.test(m.text())) errors.push(`console: ${m.text().slice(0, 400)}`); });
    await page.goto(`http://127.0.0.1:${port}/tools/render-harness.lab.html`);
    await page.waitForFunction(() => (window as unknown as { labReady?: boolean }).labReady === true);
  }, 300_000);
  afterAll(async () => { await page?.close().catch(() => undefined); await browser?.close().catch(() => undefined); await server?.close().catch(() => undefined); });

  it('largadas de 3 jogadores na Média em duas pistas de dia (aquecimento dos faróis), com o fundo do menu entre elas: nenhuma textura a mais por ciclo', async () => {
    const counts = await page.evaluate(() => {
      const lab = (window as unknown as { lab: Lab }).lab;
      const out: number[] = [];
      for (let cycle = 0; cycle < 3; cycle++) {
        // Cada `setup` troca de pista: a largada seguinte aquece os faróis (as duas são de dia e chegam ao entardecer). O fundo do menu
        // (`idle`) volta a sombra a um mapa só, como entre as corridas do jogo.
        for (const track of ['copacabana', 'monte_fuji']) {
          lab.setup(track, 3, 300);
          lab.render('medium', 2);
          lab.idle('medium', 1);
        }
        out.push(lab.renderer.__gl.info.memory.textures);
      }
      return out;
    });
    // O 1º ciclo é aquecimento (o que é criado uma vez: pipelines, rótulos, texturas da pista); do 2º para o 3º nada pode sobrar.
    expect(counts[2], `texturas no fim de cada ciclo: ${counts.join(' → ')}`).toBe(counts[1]);
    expect(errors).toEqual([]);
  });
});
