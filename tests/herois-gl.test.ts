// V15 (heróis dos outros estilos), no navegador de verdade (Chromium + swiftshader, pelo laboratório `tools/render-harness.lab.*`): o PIOR CASO REAL com vários estilos —
// 4 humanos de perto em carros de ESTILOS DIFERENTES (cada um com o seu casco herói), copa-4p e sampa-4p em Média, Alta e Ultra — dentro dos limites do gate (`src/bench/gate.ts`),
// e o caso de 1 jogador em cada estilo. Só CONTAGEM (nenhum FPS). Sem o Chromium o arquivo é pulado (`NC_REQUIRE_GL=1` o exige). Os números medidos vão em docs/ondas/V15-herois.md.
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
  programs(): { total: number; bad: string[]; shaderErrors: string[] };
}
/** Quatro humanos, quatro estilos de herói (hyper, wedge, prototype, roadster) e a mistura com o GT. */
const QUATRO = ['pororoca', 'iara', 'beijaflor', 'curupira'];
const OUTROS = ['trovao', 'carcara', 'iara', 'beijaflor'];
const MISTO = ['falcao', 'pororoca', 'iara', 'curupira'];
const POR_ESTILO: Array<[string, string]> = [['hyper', 'pororoca'], ['wedge', 'iara'], ['prototype', 'beijaflor'], ['roadster', 'curupira'], ['muscle', 'trovao'], ['rally', 'carcara']];

describe.skipIf(!available)('carros herói dos outros estilos (GL, swiftshader)', { timeout: 1_500_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let page: Page;
  const errors: string[] = [];

  beforeAll(async () => {
    server = await createServer({ logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-v15-vite'), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
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

  /** O pior viewport (triângulos e chamadas) dos dois últimos quadros, como o gate. */
  const pior = (track: string, humans: number, quality: Quality, hero: Hero, carIds: string[] | null): Promise<{ triangles: number; calls: number }> => page.evaluate(([t, n, q, h, ids]) => {
    const L = (window as unknown as { lab: LabApi }).lab;
    L.setHero(h as Hero);
    L.setup(t as string, n as number, 300, undefined, undefined, (ids as string[] | null) ?? undefined);
    const last = L.render(q as Quality, 4).slice(-2);
    const vps = last.flatMap((d) => d.viewports);
    return { triangles: Math.max(...vps.map((v) => v.triangles)), calls: Math.max(...vps.map((v) => v.calls)) };
  }, [track, humans, quality, hero, carIds] as const);

  /** Instâncias de casco herói (malhas de ≥ 9 mil △ por instância) por viewport, no último quadro. */
  const heroes = (track: string, humans: number, quality: Quality, hero: Hero, carIds: string[] | null): Promise<number[]> => page.evaluate(([t, n, q, h, ids]) => {
    const L = (window as unknown as { lab: LabApi }).lab;
    L.setHero(h as Hero);
    L.setup(t as string, n as number, 300, undefined, undefined, (ids as string[] | null) ?? undefined);
    return L.perfil(q as Quality, 2).map((v) => v.rows.filter((r) => Number(/(\d+) △\/inst/.exec(r.cat)?.[1] ?? 0) >= 9000).reduce((s, r) => s + r.instances, 0));
  }, [track, humans, quality, hero, carIds] as const);

  it('4 humanos em 4 estilos diferentes na Alta: cada viewport tem de 1 a 4 cascos herói (de estilos diferentes); com 1 jogador, o dele, em cada estilo', async () => {
    const four = await heroes('copacabana', 4, 'high', 'auto', QUATRO);
    expect(four).toHaveLength(4);
    for (const n of four) { expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(4); }
    for (const [style, car] of POR_ESTILO) expect(await heroes('copacabana', 1, 'high', 'auto', [car]), style).toEqual([1]);
  });

  it('o carro de estilo sem herói (Tornado, hatch) não ganha: o do jogador 1 segue no casco de sempre', async () => {
    expect(await heroes('copacabana', 1, 'high', 'auto', ['tornado'])).toEqual([0]);
  });

  it('sem chamada nova por carro: ligar o herói soma no máximo 2 chamadas por estilo em cena (cena e sombra do lote herói), com 1 humano em cada estilo', async () => {
    for (const [style, car] of POR_ESTILO) {
      const off = await pior('copacabana', 1, 'high', 'off', [car]);
      const on = await pior('copacabana', 1, 'high', 'on', [car]);
      console.log(`[V15] 1 jogador ${style}: ${off.calls} → ${on.calls} chamadas, ${off.triangles} → ${on.triangles} △`);
      expect(on.calls - off.calls, `${style}: chamadas ${off.calls} → ${on.calls}`).toBeLessThanOrEqual(2);
      expect(on.calls - off.calls).toBeGreaterThanOrEqual(0);
    }
  });

  it('1 jogador na Alta e na Ultra, em cada estilo de herói: o herói não passa dos triângulos do gate de copa-1p nem soma chamadas além do que o carro já gasta sem ele (o limite de chamadas foi medido com o Falcão: quem joga de outro estilo já está nele ou acima, herói ou não)', async () => {
    for (const q of ['high', 'ultra'] as const) {
      const lim = GATE_LIMITS['copa-1p'][q];
      for (const [style, car] of POR_ESTILO) {
        const off = await pior('copacabana', 1, q, 'off', [car]);
        const on = await pior('copacabana', 1, q, 'auto', [car]);
        console.log(`[V15] copa-1p/${q}/${style}: ${on.triangles} △, ${on.calls} chamadas (sem herói ${off.triangles} △, ${off.calls}); limite ${lim?.triangles} △ / ${lim?.calls}`);
        expect(on.triangles, `copa-1p/${q}/${style} triângulos`).toBeLessThanOrEqual(lim?.triangles ?? 0);
        expect(on.calls, `copa-1p/${q}/${style} chamadas (limite ${lim?.calls}; sem herói ${off.calls})`).toBeLessThanOrEqual(Math.max(lim?.calls ?? 0, off.calls));
        expect(on.calls - off.calls, `${style}: o herói soma até 2 chamadas`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('2 jogadores em estilos diferentes (copa-2p, Média, Alta e Ultra): dentro dos triângulos do gate e sem somar chamadas além do que os carros já gastam sem herói', async () => {
    for (const q of ['medium', 'high', 'ultra'] as const) {
      const lim = GATE_LIMITS['copa-2p'][q];
      for (const ids of [['pororoca', 'iara'], ['beijaflor', 'curupira']]) {
        const off = await pior('copacabana', 2, q, 'off', ids);
        const on = await pior('copacabana', 2, q, 'on', ids);
        console.log(`[V15] copa-2p/${q}/${ids.join('+')}: ${on.triangles} △, ${on.calls} chamadas (sem herói ${off.triangles} △, ${off.calls}); limite ${lim?.triangles} △ / ${lim?.calls}`);
        expect(on.triangles, `copa-2p/${q}/${ids} triângulos`).toBeLessThanOrEqual(lim?.triangles ?? 0);
        expect(on.calls, `copa-2p/${q}/${ids} chamadas (limite ${lim?.calls}; sem herói ${off.calls})`).toBeLessThanOrEqual(Math.max(lim?.calls ?? 0, off.calls));
        expect(on.calls - off.calls, `${ids}: o herói soma até 4 chamadas (dois estilos)`).toBeLessThanOrEqual(4);
      }
    }
  });

  it('sem programa de shader novo: ligar o herói de quatro estilos no meio da corrida não muda a contagem de programas', async () => {
    const r = await page.evaluate((ids) => {
      const L = (window as unknown as { lab: LabApi }).lab;
      L.setHero('off');
      L.setup('copacabana', 4, 300, undefined, undefined, ids);
      L.render('high', 3);
      const antes = L.programs().total;
      L.setHero('on');
      L.render('high', 3);
      const depois = L.programs();
      return { antes, depois: depois.total, bad: depois.bad, errors: depois.shaderErrors };
    }, QUATRO);
    expect(r.depois, `programas ${r.antes} → ${r.depois}`).toBe(r.antes);
    expect(r.bad).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it('cada casco herói cabe no teto de triângulos (cada instância desenhada ≤ HERO_MAX_TRIANGLES), nos quatro estilos de uma vez', async () => {
    const vps = await page.evaluate((ids) => { const L = (window as unknown as { lab: LabApi }).lab; L.setHero('on'); L.setup('copacabana', 4, 300, undefined, undefined, ids); return L.perfil('high', 2); }, QUATRO);
    const hero = vps.flatMap((v) => v.rows).filter((r) => Number(/(\d+) △\/inst/.exec(r.cat)?.[1] ?? 0) >= 9000);
    expect(hero.length).toBeGreaterThan(0);
    for (const r of hero) expect(Number(/(\d+) △\/inst/.exec(r.cat)?.[1])).toBeLessThanOrEqual(HERO_MAX_TRIANGLES);
  });

  // O PIOR CASO REAL COM VÁRIOS ESTILOS: os 4 humanos em 4 estilos (e a mistura com o GT), todos de perto (a largada), herói ligado em toda qualidade que o aceita.
  for (const [scene, track] of [['copa-4p', 'copacabana'], ['sampa-4p', 'sampa_noite']] as const) {
    for (const q of ['medium', 'high', 'ultra'] as const) {
      for (const [nome, ids] of [['4 estilos', QUATRO], ['GT + 3 estilos', MISTO], ['muscle + rally + 2', OUTROS]] as const) {
        it(`gate: ${scene} ${q} com 4 humanos (${nome}) e o herói ligado fica dentro dos limites de triângulos e de chamadas`, async () => {
          const p = await pior(track, 4, q, 'on', [...ids]);
          const base = await pior(track, 4, q, 'off', [...ids]);
          const lim = GATE_LIMITS[scene][q];
          console.log(`[V15] ${scene}/${q}/${nome}: herói ligado ${p.triangles} △, ${p.calls} chamadas (desligado ${base.triangles} △, ${base.calls}); limite ${lim?.triangles} △ / ${lim?.calls}`);
          expect(lim).toBeDefined();
          expect(p.triangles, `${scene}/${q}/${nome} triângulos`).toBeLessThanOrEqual(lim?.triangles ?? 0);
          expect(p.calls, `${scene}/${q}/${nome} chamadas`).toBeLessThanOrEqual(lim?.calls ?? 0);
          expect(errors).toEqual([]);
        });
      }
    }
  }
});
