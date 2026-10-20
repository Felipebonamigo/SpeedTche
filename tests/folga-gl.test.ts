// V13 (folga de triângulos e de chamadas): o que o gate de contagem NÃO via e que custava triângulo sem aparecer na tela.
// Cada corte aqui tem os valores MEDIDOS antes (docs/ondas/V13-folga.md) e a prova de que a imagem não muda onde o corte é de visibilidade.
// Chromium com swiftshader pelo laboratório (`tools/render-harness.lab.*`); sem ele o arquivo é pulado (`NC_REQUIRE_GL=1` o exige). Só CONTAGEM: nenhum FPS.
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Quality } from '../src/game/contracts';
import type { DebugInfo } from '../src/render/renderer';

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const available = existsSync(CHROME);

interface PerfilLinha { cat: string; main: number; shadow: number; mainCalls: number; shadowCalls: number; instances: number }
interface PerfilViewport { total: number; calls: number; rows: PerfilLinha[]; other: number }
interface LabApi {
  setup(track: string, humans: number, ticks: number): void;
  render(quality: Quality, frames: number): DebugInfo[];
  perfil(quality: Quality, frames: number): PerfilViewport[];
  hold(on: boolean): void;
  snapshot(quality: Quality, frames: number): void;
  diffFromSnapshot(quality: Quality, frames: number, boxes: Array<[number, number, number, number]>, thr?: number): Array<{ changed: number }>;
  scene: { traverse(f: (o: { name: string; perObjectFrustumCulled?: boolean }) => void): void };
}
declare global { interface Window { lab: LabApi; labReady: boolean } }

/** O pior viewport (triângulos e chamadas) dos dois últimos quadros, como o gate (`collect` em tools/render-harness.lab.ts). */
interface Pior { triangles: number; calls: number }

describe.skipIf(!available)('folga V13 (GL, swiftshader)', { timeout: 1_500_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let page: Page;
  const errors: string[] = [];

  beforeAll(async () => {
    server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-v13-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
    await server.listen();
    const addr = server.httpServer?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.setDefaultTimeout(1_200_000);
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}/tools/render-harness.lab.html`);
    await page.waitForFunction(() => window.labReady === true);
  }, 300_000);

  afterAll(async () => {
    await page?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await server?.close().catch(() => undefined);
  });

  /** A cena do gate (300 ticks de largada, 4 quadros, o pior viewport dos 2 últimos). */
  const pior = (track: string, humans: number, quality: Quality): Promise<Pior> => page.evaluate(([t, n, q]) => {
    window.lab.setup(t as string, n as number, 300);
    const last = window.lab.render(q as Quality, 4).slice(-2);
    const vps = last.flatMap((d) => d.viewports);
    return { triangles: Math.max(...vps.map((v) => v.triangles)), calls: Math.max(...vps.map((v) => v.calls)) };
  }, [track, humans, quality] as const);

  it('cenário: todo lote corta por objeto contra a câmera e contra o mapa de sombra (antes desenhava a janela inteira, 30% dos triângulos de Sampa 4p)', async () => {
    await page.evaluate(() => { window.lab.setup('copacabana', 1, 300); window.lab.render('medium', 2); });
    const lotes = await page.evaluate(() => {
      const out: Array<{ name: string; cull: boolean | undefined }> = [];
      window.lab.scene.traverse((o) => { if (o.name.startsWith('scenery:')) out.push({ name: o.name, cull: o.perObjectFrustumCulled }); });
      return out;
    });
    expect(lotes.length).toBeGreaterThanOrEqual(8);
    expect(lotes.filter((l) => l.cull !== true).map((l) => l.name), 'lotes sem corte por objeto').toEqual([]);
  });

  it('o corte do cenário não muda UM pixel (mesmo instante, com e sem o corte): Copacabana 4 jogadores e Sampa 4 jogadores, Média e Alta', async () => {
    for (const [track, q] of [['copacabana', 'medium'], ['sampa_noite', 'medium'], ['copacabana', 'high'], ['sampa_noite', 'high']] as const) {
      const r = await page.evaluate(([t, quality]) => {
        const lab = window.lab;
        lab.setup(t, 4, 300);
        lab.render(quality as Quality, 2);
        lab.hold(true);
        const set = (on: boolean): void => lab.scene.traverse((o) => { if (o.name.startsWith('scenery:')) o.perObjectFrustumCulled = on; });
        const original: Array<[{ perObjectFrustumCulled?: boolean }, boolean | undefined]> = [];
        lab.scene.traverse((o) => { if (o.name.startsWith('scenery:')) original.push([o, o.perObjectFrustumCulled]); });
        set(false);
        lab.snapshot(quality as Quality, 1);
        set(true);
        const d = lab.diffFromSnapshot(quality as Quality, 1, [[0, 0, 1, 1]], 0)[0];
        lab.hold(false);
        for (const [o, v] of original) o.perObjectFrustumCulled = v; // devolve o que o jogo tinha
        return d.changed;
      }, [track, q] as const);
      expect(r, `${track}/${q}: fração de pixels que mudou com o corte`).toBe(0);
    }
  });

  it('Sampa 4p Média: o pior viewport cai de 343.710 △ para menos de 260.000 △ (e Copacabana 4p de 277.208 para menos de 245.000)', async () => {
    const sampa = await pior('sampa_noite', 4, 'medium');
    const copa = await pior('copacabana', 4, 'medium');
    expect(sampa.triangles).toBeLessThan(260_000);
    expect(copa.triangles).toBeLessThan(245_000);
    expect(errors).toEqual([]);
  });
});
