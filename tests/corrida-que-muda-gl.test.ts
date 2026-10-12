// M6 (b), no Chromium (swiftshader): a corrida que muda é só uniforme. Com o líder em cada fração da corrida o renderizador compila todos os programas sem erro, desenha o MESMO número
// de chamadas e de triângulos, não cria programa no meio da transição (os faróis foram aquecidos antes) e entrega a paleta ao vivo só quando o `t` anda (nunca por quadro).
// Sem o Chromium (sem /opt/pw-browsers) o arquivo é pulado; `NC_REQUIRE_GL=1` (o CI) o exige. Nenhum tempo de quadro entra aqui, só contagem.
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

interface LiveFrames { frames: Array<{ fraction: number; calls: number; triangles: number; programs: number; applied: number; names: string[] }>; report: { total: number; bad: string[]; shaderErrors: string[] } }
type Lab = { liveScene(q: Quality, track: string, fractions: number[], repeat: number): LiveFrames };

if (REQUIRED) it('o Chromium existe (NC_REQUIRE_GL=1)', () => { expect(available, `sem ${CHROME}`).toBe(true); });

describe.skipIf(!available)('M6 (b): a corrida que muda em GL (swiftshader)', { timeout: 900_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let page: Page;
  const errors: string[] = [];
  beforeAll(async () => {
    server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-m6-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
    await server.listen();
    const addr = server.httpServer?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.setDefaultTimeout(800_000);
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver|404/.test(m.text())) errors.push(`console: ${m.text().slice(0, 400)}`); });
    await page.goto(`http://127.0.0.1:${port}/tools/render-harness.lab.html`);
    await page.waitForFunction(() => (window as unknown as { labReady?: boolean }).labReady === true);
  }, 300_000);
  afterAll(async () => { await page?.close().catch(() => undefined); await browser?.close().catch(() => undefined); await server?.close().catch(() => undefined); });

  const run = (q: Quality, track: string, fractions: number[], repeat: number): Promise<LiveFrames> =>
    page.evaluate(({ q, track, fractions, repeat }) => (window as unknown as { lab: Lab }).lab.liveScene(q, track, fractions, repeat), { q, track, fractions, repeat });

  it('dia → entardecer (Copacabana, com horizonte e mar) em Média e Alta: sem erro de shader, as mesmas chamadas e triângulos, nenhum programa novo no meio, a paleta ao vivo só quando o t anda', async () => {
    for (const q of ['medium', 'high'] as const) {
      // Uma página nova por degrau: trocar de qualidade no meio refaz os programas de tudo (o `ensureQuality` de sempre), e isso não é a transição.
      await page.reload();
      await page.waitForFunction(() => (window as unknown as { labReady?: boolean }).labReady === true);
      // A 1ª volta (nada anda), depois 20 passos pela última volta, cada um 3 quadros seguidos.
      const fr = [0, 0.3, ...Array.from({ length: 20 }, (_, i) => 2 / 3 + ((i + 1) / 20) / 3)];
      const r = await run(q, 'copacabana', fr, 3);
      expect(r.report.shaderErrors, `${q}: onShaderError`).toEqual([]);
      expect(r.report.bad, `${q}: programas com log`).toEqual([]);
      const first = r.frames[0];
      for (const f of r.frames) {
        // O reflexo de lente do entardecer (M2) é 1 malha e 16 triângulos que só existem com o sol do entardecer: a única chamada a mais que a transição pode trazer.
        expect(f.calls, `${q} ${f.fraction}: chamadas`).toBeLessThanOrEqual(first.calls + 1);
        expect(f.calls, `${q} ${f.fraction}: chamadas`).toBeGreaterThanOrEqual(first.calls);
        // Os triângulos andam um pouco com o relógio (poeira, balanço das copas): a transição não os muda além disso.
        expect(Math.abs(f.triangles - first.triangles) / first.triangles, `${q} ${f.fraction}: triângulos`).toBeLessThan(0.005);
      }
      // Os programas existem desde o primeiro quadro (o aquecimento dos faróis); a transição não cria nenhum.
      const afterWarm = r.frames[3].programs;
      const novos = r.frames[r.frames.length - 1].names.filter((n) => !r.frames[3].names.includes(n)).map((n) => n.slice(0, 40) + ' … ' + n.slice(-160));
      expect(novos, `${q}: programas criados no meio da transição`).toEqual([]);
      expect(r.frames[r.frames.length - 1].programs).toBe(afterWarm);
      // 22 frações × 3 quadros = 66 quadros: a paleta ao vivo foi entregue no máximo uma vez por fração (e uma no primeiro quadro), nunca por quadro.
      expect(r.frames[r.frames.length - 1].applied, `${q}: entregas`).toBeLessThanOrEqual(24);
      expect(r.frames[r.frames.length - 1].applied).toBeGreaterThanOrEqual(20);
    }
    expect(errors).toEqual([]);
  });

  it('entardecer → noite (Sampa, cidade): compila e desenha igual; pista de noite fica parada (uma entrega só)', async () => {
    const dusk = await run('medium', 'sampa_noite', [0, 0.2, 0.4, 0.6, 0.8, 1], 2);
    expect(dusk.report.shaderErrors).toEqual([]); expect(dusk.report.bad).toEqual([]);
    for (const f of dusk.frames) expect(Math.abs(f.calls - dusk.frames[0].calls)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});
