// V9 (carro herói), no navegador de verdade (Chromium + swiftshader, pelo laboratório `tools/render-harness.lab.*`): o herói só nos humanos perto, sem chamada de
// desenho nova por carro, sem programa de shader novo, e o PIOR CASO REAL dentro do gate (`src/bench/gate.ts`): 4 humanos no mesmo carro, todos de perto, mais os vizinhos.
// Só CONTAGEM: nenhum FPS. Sem o Chromium o arquivo é pulado (`NC_REQUIRE_GL=1` o exige). Os números medidos vão em docs/ondas/V9-heroi.md.
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GATE_LIMITS } from '../src/bench/gate';
import type { Quality } from '../src/game/contracts';
import type { DebugInfo } from '../src/render/renderer';
import { HERO_MAX_TRIANGLES } from '../src/render/cars/lod';

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const available = existsSync(CHROME);

type Hero = 'auto' | 'on' | 'off';
interface PerfilLinha { cat: string; main: number; shadow: number; mainCalls: number; shadowCalls: number; instances: number }
interface PerfilViewport { total: number; calls: number; rows: PerfilLinha[]; other: number }
interface LabApi {
  setup(track: string, humans: number, ticks: number, tod?: string, looks?: unknown, carIds?: string[]): void;
  render(quality: Quality, frames: number): DebugInfo[];
  perfil(quality: Quality, frames: number): PerfilViewport[];
  setHero(mode: Hero): void;
  setReduce(on: boolean): void;
  programs(): { total: number; bad: string[]; shaderErrors: string[] };
}
const GT4 = ['falcao', 'falcao', 'falcao', 'falcao'];

describe.skipIf(!available)('carro herói (GL, swiftshader)', { timeout: 1_500_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let page: Page;
  const errors: string[] = [];

  beforeAll(async () => {
    server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-v9-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
    await server.listen();
    const addr = server.httpServer?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.setDefaultTimeout(1_200_000);
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}/tools/render-harness.lab.html`);
    await page.waitForFunction(() => (window as unknown as { labReady?: boolean }).labReady === true);
  }, 300_000);

  afterAll(async () => {
    await page?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await server?.close().catch(() => undefined);
  });

  /** O pior viewport (triângulos e chamadas) dos dois últimos quadros, como o gate; `carIds` troca os carros dos humanos depois da largada. */
  const pior = (track: string, humans: number, quality: Quality, hero: Hero, carIds: string[] | null = GT4, reduce = false): Promise<{ triangles: number; calls: number }> => page.evaluate(([t, n, q, h, ids, red]) => {
    const L = (window as unknown as { lab: LabApi }).lab;
    L.setHero(h as Hero); L.setReduce(red as boolean);
    L.setup(t as string, n as number, 300, undefined, undefined, (ids as string[] | null) ?? undefined);
    const last = L.render(q as Quality, 4).slice(-2);
    L.setReduce(false);
    const vps = last.flatMap((d) => d.viewports);
    return { triangles: Math.max(...vps.map((v) => v.triangles)), calls: Math.max(...vps.map((v) => v.calls)) };
  }, [track, humans, quality, hero, carIds, reduce] as const);

  /** Instâncias do casco herói (a malha de ~13 mil △) por viewport, no último quadro. */
  const heroes = (track: string, humans: number, quality: Quality, hero: Hero, carIds: string[] | null = GT4, reduce = false): Promise<number[]> => page.evaluate(([t, n, q, h, ids, red]) => {
    const L = (window as unknown as { lab: LabApi }).lab;
    L.setHero(h as Hero); L.setReduce(red as boolean);
    L.setup(t as string, n as number, 300, undefined, undefined, (ids as string[] | null) ?? undefined);
    const vps = L.perfil(q as Quality, 2);
    L.setReduce(false);
    return vps.map((v) => v.rows.filter((r) => Number(/(\d+) △\/inst/.exec(r.cat)?.[1] ?? 0) >= 9000).reduce((s, r) => s + r.instances, 0));
  }, [track, humans, quality, hero, carIds, reduce] as const);

  it('o herói aparece só nos humanos perto: 4 Falcões GT na Alta têm de 1 a 4 cascos herói por viewport; com 1 jogador, o dele', async () => {
    const four = await heroes('copacabana', 4, 'high', 'auto');
    expect(four).toHaveLength(4);
    for (const n of four) { expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(4); }
    expect(await heroes('copacabana', 1, 'high', 'auto', ['falcao'])).toEqual([1]);
  });

  it('o carro que não tem casco herói não ganha: o Tornado (hatch) do jogador 1 segue no casco de sempre', async () => {
    expect(await heroes('copacabana', 1, 'high', 'auto', ['tornado'])).toEqual([0]);
  });

  it('desligado: Baixa nunca, Reduzir efeitos nunca, interruptor desligado nunca, Média no automático nunca; Média com "ligado" sim', async () => {
    expect(await heroes('copacabana', 4, 'low', 'on')).toEqual([0, 0, 0, 0]);
    expect(await heroes('copacabana', 4, 'high', 'auto', GT4, true)).toEqual([0, 0, 0, 0]);
    expect(await heroes('copacabana', 4, 'high', 'off')).toEqual([0, 0, 0, 0]);
    expect(await heroes('copacabana', 4, 'medium', 'auto')).toEqual([0, 0, 0, 0]);
    expect((await heroes('copacabana', 4, 'medium', 'on')).every((n) => n >= 1)).toBe(true);
  });

  it('sem chamada de desenho nova por carro: ligar o herói soma no máximo 2 chamadas (cena e sombra do lote herói), com 1 ou com 4 humanos', async () => {
    for (const [n, ids] of [[1, ['falcao']], [4, GT4]] as const) {
      const off = await pior('copacabana', n, 'high', 'off', [...ids]);
      const on = await pior('copacabana', n, 'high', 'on', [...ids]);
      expect(on.calls - off.calls, `${n} jogador(es): chamadas ${off.calls} → ${on.calls}`).toBeLessThanOrEqual(2);
      expect(on.calls - off.calls).toBeGreaterThanOrEqual(0);
    }
  });

  it('1 jogador na Alta e na Ultra: o herói soma 1 ou 2 chamadas (o lote dele, cena e sombra) sobre o gate de copa-1p; o que passa do limite fica registrado, não escondido', async () => {
    for (const q of ['high', 'ultra'] as const) {
      const off = await pior('copacabana', 1, q, 'off', null);
      const on = await pior('copacabana', 1, q, 'auto', null);
      const lim = GATE_LIMITS['copa-1p'][q];
      console.log(`[V9] copa-1p/${q} (padrão do jogo): herói ${on.triangles} △, ${on.calls} chamadas (sem ${off.triangles} △, ${off.calls}); limite ${lim?.triangles} △ / ${lim?.calls}`);
      expect(on.calls - off.calls).toBeLessThanOrEqual(2);
      expect(on.triangles, `copa-1p/${q} triângulos`).toBeLessThanOrEqual(lim?.triangles ?? 0);
    }
  });

  it('sem programa de shader novo: o herói reaproveita o programa do carro (a contagem de programas não muda ao ligá-lo no meio da corrida)', async () => {
    const r = await page.evaluate(() => {
      const L = (window as unknown as { lab: LabApi }).lab;
      L.setHero('off');
      L.setup('copacabana', 2, 300, undefined, undefined, ['falcao', 'falcao']);
      L.render('high', 3);
      const antes = L.programs().total;
      L.setHero('on');
      L.render('high', 3);
      const depois = L.programs();
      return { antes, depois: depois.total, bad: depois.bad, errors: depois.shaderErrors };
    });
    expect(r.depois, `programas ${r.antes} → ${r.depois}`).toBe(r.antes);
    expect(r.bad).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it('o casco herói cabe no teto de triângulos (cada instância desenhada ≤ HERO_MAX_TRIANGLES)', async () => {
    const vps = await page.evaluate(() => { const L = (window as unknown as { lab: LabApi }).lab; L.setHero('on'); L.setup('copacabana', 1, 300, undefined, undefined, ['falcao']); return L.perfil('high', 2); });
    const hero = vps[0].rows.filter((r) => Number(/(\d+) △\/inst/.exec(r.cat)?.[1] ?? 0) >= 9000);
    expect(hero.length).toBeGreaterThan(0);
    for (const r of hero) expect(Number(/(\d+) △\/inst/.exec(r.cat)?.[1])).toBeLessThanOrEqual(HERO_MAX_TRIANGLES);
  });

  // O PIOR CASO REAL: os 4 humanos no mesmo carro (Falcão GT), todos de perto (a largada), herói ligado em toda qualidade que o aceita, contra os limites do gate.
  for (const [scene, track] of [['copa-4p', 'copacabana'], ['sampa-4p', 'sampa_noite']] as const) {
    for (const q of ['medium', 'high', 'ultra'] as const) {
      it(`gate: ${scene} ${q} com 4 humanos em Falcão GT e o herói ligado fica dentro dos limites de triângulos e de chamadas`, async () => {
        const p = await pior(track, 4, q, 'on');
        const base = await pior(track, 4, q, 'off');
        const lim = GATE_LIMITS[scene][q];
        console.log(`[V9] ${scene}/${q}: herói ligado ${p.triangles} △, ${p.calls} chamadas (desligado ${base.triangles} △, ${base.calls}); limite ${lim?.triangles} △ / ${lim?.calls}`);
        expect(lim).toBeDefined();
        expect(p.triangles, `${scene}/${q} triângulos`).toBeLessThanOrEqual(lim?.triangles ?? 0);
        expect(p.calls, `${scene}/${q} chamadas`).toBeLessThanOrEqual(lim?.calls ?? 0);
        expect(errors).toEqual([]);
      });
    }
  }
});
