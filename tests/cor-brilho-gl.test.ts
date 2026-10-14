// Cor e brilho (docs/ondas/cor-brilho.md), medido na IMAGEM: Chromium com swiftshader, pelo laboratório `tools/render-harness.lab.*`, a 640×360.
//   - o teto do bloom: um ponto HDR 200 não vaza para fora dele muito mais que um ponto HDR 6 (sem teto, o vazamento cresce com o HDR);
//   - o clarão do Cânion (entardecer) e as bolhas de Sampa (noite): a região da pista à frente com os faróis do jogador × sem eles, e os pixels estourados;
//   - o carro branco no entardecer e à noite: a traseira, na captura, não é rosa nem roxa.
// Sem o Chromium (sem /opt/pw-browsers) o arquivo é pulado; `NC_REQUIRE_GL=1` (o CI) o exige. Nenhum tempo de quadro entra aqui.
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

type Probe = { box: [number, number, number, number, number, number] } | { point: [number, number, number]; r: number };
interface ProbeStat { x0: number; y0: number; x1: number; y1: number; mean: number; white: number; rgb: [number, number, number] }
interface Lab {
  freeze(track: string, ticks: number, opts?: { x?: number; parked?: boolean; tod?: 'day' | 'dusk' | 'night' }): void;
  headlights(on: boolean): void;
  shoot(q: Quality, frames: number, probes: Probe[]): ProbeStat[];
  bloomHalo(hdr: number, bloom: [number, number, number], px?: number): { halo: number; core: number };
  programs(): { total: number; bad: string[]; shaderErrors: string[] };
}

/** A pista à frente do carro do jogador, de 6 a 45 m, 6 m para cada lado, do chão a 1,6 m: onde ficam os carros que ele persegue. */
const AHEAD: Probe = { box: [-6, 0, -45, 6, 1.6, -6] };
/** Pixels estourados que os faróis podem ACRESCENTAR à região (fração): as "bolhas brancas". */
const BLOWN = 0.0005;
/** A traseira do Falcão GT entre as lanternas de dentro (x = 0, na altura delas): lataria branca. */
const REAR: Probe = { point: [0, 0.66, 2.2], r: 2 };

if (REQUIRED) it('o Chromium existe (NC_REQUIRE_GL=1)', () => { expect(available, `sem ${CHROME}`).toBe(true); });

describe.skipIf(!available)('cor e brilho na imagem (swiftshader)', { timeout: 1_800_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let page: Page;
  const errors: string[] = [];
  beforeAll(async () => {
    server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-cor-brilho-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
    await server.listen();
    const addr = server.httpServer?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.setDefaultTimeout(1_700_000);
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver|404/.test(m.text())) errors.push(`console: ${m.text().slice(0, 400)}`); });
    await page.goto(`http://127.0.0.1:${port}/tools/render-harness.lab.html`);
    await page.waitForFunction(() => (window as unknown as { labReady?: boolean }).labReady === true);
  }, 300_000);
  afterAll(async () => { await page?.close().catch(() => undefined); await browser?.close().catch(() => undefined); await server?.close().catch(() => undefined); });

  const lab = <T>(fn: (L: Lab, arg: unknown) => T, arg?: unknown): Promise<T> =>
    page.evaluate(({ src, arg }) => (new Function('L', 'arg', `return (${src})(L, arg)`))((window as unknown as { lab: Lab }).lab, arg), { src: fn.toString(), arg }) as Promise<T>;

  it('o bloom tem teto: o que vaza de um ponto HDR 200 é no máximo 3× o de um ponto HDR 6 (sem teto, cresce com o HDR); o ponto de 6 brilha', async () => {
    const r = await lab((L) => {
      const night: [number, number, number] = [0.5, 0.45, 1.6];
      return { low: L.bloomHalo(6, night), high: L.bloomHalo(200, night) };
    });
    expect(r.low.halo, 'o ponto HDR 6 vaza (o bloom existe)').toBeGreaterThan(1);
    expect(r.high.halo / r.low.halo, `vazamento HDR 200 ${r.high.halo.toFixed(1)} × HDR 6 ${r.low.halo.toFixed(1)}`).toBeLessThanOrEqual(3);
  });

  it('Cânion (entardecer): os faróis do jogador não acendem um clarão na pista à frente (com ÷ sem faróis ≤ 1,3) nem estouram pixels (≤ +0,05%)', async () => {
    const r = await lab((L, ahead) => {
      L.freeze('canion', 1600);
      L.headlights(false);
      const off = L.shoot('high', 6, [ahead as Probe])[0];
      L.headlights(true);
      const on = L.shoot('high', 6, [ahead as Probe])[0];
      return { on, off };
    }, AHEAD);
    expect(r.on.mean / r.off.mean, `luma com ${r.on.mean.toFixed(3)} × sem ${r.off.mean.toFixed(3)} (caixa ${r.on.x0},${r.on.y0}–${r.on.x1},${r.on.y1})`).toBeLessThanOrEqual(1.3);
    expect(r.on.white - r.off.white, `estourados com ${r.on.white.toFixed(4)} × sem ${r.off.white.toFixed(4)}`).toBeLessThanOrEqual(BLOWN);
    expect(errors).toEqual([]);
  });

  it('Sampa (noite): os faróis iluminam, mas sem bolha branca nos carros à frente (com ÷ sem faróis ≤ 1,6; estourados ≤ +0,05%)', async () => {
    const r = await lab((L, ahead) => {
      L.freeze('sampa_noite', 1400);
      L.headlights(false);
      const off = L.shoot('high', 6, [ahead as Probe])[0];
      L.headlights(true);
      const on = L.shoot('high', 6, [ahead as Probe])[0];
      return { on, off };
    }, AHEAD);
    expect(r.on.mean / r.off.mean, `luma com ${r.on.mean.toFixed(3)} × sem ${r.off.mean.toFixed(3)}`).toBeLessThanOrEqual(1.6);
    expect(r.on.white - r.off.white, `estourados com ${r.on.white.toFixed(4)} × sem ${r.off.white.toFixed(4)}`).toBeLessThanOrEqual(BLOWN);
    expect(errors).toEqual([]);
  });

  it('o carro branco na captura: no entardecer (Cânion) e à noite (Sampa) a traseira é branca/cinza, não rosa nem roxa (croma ≤ 0,25, sem o verde afundado)', async () => {
    const r = await lab((L, rear) => {
      const out: Record<string, ProbeStat> = {};
      for (const [name, track, ticks] of [['canion', 'canion', 1600], ['sampa', 'sampa_noite', 1400]] as const) {
        L.freeze(track, ticks, { x: 0, parked: true });
        L.headlights(true);
        out[name] = L.shoot('high', 10, [rear as Probe])[0];
      }
      return out;
    }, REAR);
    for (const [name, s] of Object.entries(r)) {
      const [R, G, B] = s.rgb;
      const chroma = (Math.max(R, G, B) - Math.min(R, G, B)) / Math.max(1, Math.max(R, G, B));
      expect(chroma, `${name}: traseira rgb(${s.rgb.join(',')}) em ${s.x0},${s.y0}`).toBeLessThanOrEqual(0.25);
      expect(Math.min(R, B) - G, `${name}: magenta rgb(${s.rgb.join(',')})`).toBeLessThanOrEqual(8);
      expect(Math.max(R, G, B), `${name}: a traseira é clara (é a lataria, não a lanterna nem a placa)`).toBeGreaterThan(70);
    }
    expect(errors).toEqual([]);
  });

  it('o laboratório desenhou sem erro de shader', async () => {
    const p = await lab((L) => L.programs());
    expect(p.shaderErrors).toEqual([]);
    expect(p.bad).toEqual([]);
  });
});
