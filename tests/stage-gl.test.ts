// N2, palco 3D (docs/ondas/N/N2.md §6 "L"): o palco de verdade, em GL (Chromium com swiftshader), pelo laboratório `tools/stage-harness.lab.*`:
//   - 1, 2 e 4 janelas em cada qualidade desenham (o canvas muda onde há janela e só ali), sem erro de shader nem link falho;
//   - 36 ciclos abrir → desenhar → fechar não deixam geometria, textura nem programa para trás;
//   - o palco devolve à corrida a exposição, os uniformes da estilização e os carros, e a corrida desenha depois dele;
//   - a revelação e a oficina desenham em todos os instantes da linha do tempo, com e sem "reduzir efeitos";
//   - contagens (chamadas e triângulos) por janela, com teto provisório.
// Sem o Chromium (sem /opt/pw-browsers) o arquivo é pulado; `NC_REQUIRE_GL=1` (o CI) o exige. swiftshader NÃO mede GPU: nenhum tempo entra aqui.
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Quality } from '../src/game/contracts';
import type { DebugInfo } from '../src/render/renderer';
import { CONFETTI_LIFE, REVEAL } from '../src/render/stage-plan';

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REQUIRED = process.env.NC_REQUIRE_GL === '1';
const available = existsSync(CHROME);
const LEVELS: readonly Quality[] = ['low', 'medium', 'high', 'ultra'];
/** A cor com que o palco limpa o canvas (0x0a0d16) antes de desenhar as janelas. */
const BG = [10, 13, 22];

/** O que `tools/stage-harness.lab.ts` põe em `window.lab` (sem declaração global: o `gl-render.test.ts` já declara outra `Window.lab`). */
interface LabApi {
  mount(n: number, o?: { quality?: Quality; reduce?: boolean; cars?: string[]; podium?: boolean; focus?: Array<string | null> }): Array<{ x: number; y: number; w: number; h: number }>;
  unmount(): void;
  frame(t: number): DebugInfo;
  frames(t0: number, count: number, dt?: number): DebugInfo[];
  sample(x: number, y: number): [number, number, number, number];
  memory(): { geometries: number; textures: number; programs: number };
  programs(): { total: number; bad: string[]; shaderErrors: string[] };
  raceFrame(q: Quality, n: number): DebugInfo;
  snapshot(): { exposure: number; clear: number; rim: number[]; term: number[]; adjust: number[]; carsInRaceScene: boolean };
  effects(): { active: boolean; confetti: boolean; sparks: boolean; cover: boolean; beam: boolean; drawn: number; podium: boolean };
  overlay(i: number): { novo: string | null; flash: string | null };
  reveal(i: number): void;
  workshop(i: number): void;
  set(i: number, patch: Record<string, unknown>): void;
  live(): number;
}

if (REQUIRED) it('o Chromium existe (NC_REQUIRE_GL=1)', () => { expect(available, `sem ${CHROME}`).toBe(true); });

describe.skipIf(!available)('palco 3D em GL (swiftshader)', { timeout: 1_500_000 }, () => {
  let server: ViteDevServer; let browser: Browser; let page: Page;
  const errors: string[] = [];

  beforeAll(async () => {
    server = await createServer({
      logLevel: 'silent', cacheDir: join(tmpdir(), 'speedtche-n2-vite'),
      server: { port: 0, host: '127.0.0.1', hmr: false, watch: null },
    });
    await server.listen();
    const addr = server.httpServer?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.setDefaultTimeout(1_200_000);
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver|404/.test(m.text())) errors.push(`console: ${m.text().slice(0, 400)}`); });
    await page.goto(`http://127.0.0.1:${port}/tools/stage-harness.lab.html?w=640&h=360`);
    await page.waitForFunction(() => (window as unknown as { labReady?: boolean }).labReady === true);
  }, 300_000);

  afterAll(async () => {
    await page?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await server?.close().catch(() => undefined);
  });

  const differs = (a: number[], b: number[], tol: number): boolean => a.slice(0, 3).some((v, i) => Math.abs(v - b[i]) > tol);

  it('1, 2 e 4 janelas em cada degrau (2 janelas na Média): o canvas muda DENTRO de cada janela (grade de 49 pontos) e só ali, sem erro de shader nem link falho', async () => {
    const combos: Array<[Quality, number]> = LEVELS.flatMap((q) => [[q, 1], [q, 4]] as Array<[Quality, number]>).concat([['medium', 2]]);
    const result = await page.evaluate(async (list) => {
      const L = (window as unknown as { lab: LabApi }).lab; const out: Array<{ q: string; n: number; drawn: number; vps: number; calls: number[]; inside: number[][][]; outside: number[][] }> = [];
      for (const [q, n] of list) {
        const rects = L.mount(n, { quality: q as Quality });
        const dbg = L.frames(1, 2).pop() as DebugInfo;
        out.push({
          q, n, drawn: L.effects().drawn, vps: dbg.viewports.length, calls: dbg.viewports.map((v) => v.calls),
          // Uma grade 7×7 dentro de cada janela, não um pixel: o do centro pode cair num pneu ou na sombra do carro, que é quase a cor de fundo.
          inside: rects.map((r) => { const g: Array<[number, number, number, number]> = []; for (let i = 1; i <= 7; i++) for (let j = 1; j <= 7; j++) g.push(L.sample(r.x + (r.w * i) / 8, r.y + (r.h * j) / 8)); return g; }),
          outside: [L.sample(2, 2), L.sample(638, 358)],
        });
        L.unmount();
        L.frame(100);
      }
      return { out, programs: L.programs() };
    }, combos);
    for (const r of result.out) {
      const tag = `${r.q} × ${r.n}`;
      expect(r.drawn, tag).toBe(r.n);
      expect(r.vps, `${tag}: viewports no debugInfo`).toBe(r.n);
      for (const c of r.calls) expect(c, `${tag}: chamadas`).toBeGreaterThan(5);
      // O palco desenhou DENTRO de cada janela: a maioria dos 49 pontos difere do fundo (com nada desenhado, seriam todos o fundo).
      for (const grid of r.inside) { const n = grid.filter((px) => differs(px, BG, 6)).length; expect(n, `${tag}: só ${n} de 49 pontos da janela diferem do fundo`).toBeGreaterThanOrEqual(30); }
      for (const px of r.outside) expect(differs(px, BG, 3), `${tag}: fora da janela mudou ${px}`).toBe(false);
    }
    expect(result.programs.total).toBeGreaterThan(8);
    expect(result.programs.shaderErrors).toEqual([]);
    expect(result.programs.bad).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('o pódio desenha os três carros sobre os blocos (a cena do pódio, não a do carro)', async () => {
    const r = await page.evaluate(() => {
      const L = (window as unknown as { lab: LabApi }).lab;
      const rects = L.mount(1, { quality: 'medium', podium: true });
      const dbg = L.frames(1, 3).pop() as DebugInfo;
      const fx = L.effects();
      const r0 = rects[0]; const grid: number[][] = []; for (let i = 1; i <= 7; i++) for (let j = 1; j <= 7; j++) grid.push(L.sample(r0.x + (r0.w * i) / 8, r0.y + (r0.h * j) / 8));
      L.unmount(); L.frame(100);
      return { fx, grid, calls: dbg.viewports[0].calls, tri: dbg.viewports[0].triangles };
    });
    expect(r.fx.podium).toBe(true);
    expect(r.grid.filter((px) => differs(px, BG, 6)).length).toBeGreaterThanOrEqual(30);
    // Três carros com ~3.500 triângulos de casco cada, mais as rodas e os blocos.
    expect(r.tri).toBeGreaterThan(15_000);
  });

  it('36 ciclos abrir → desenhar → fechar: depois do aquecimento (os 6 primeiros), geometrias, texturas e programas ficam iguais', async () => {
    const r = await page.evaluate(() => {
      const L = (window as unknown as { lab: LabApi }).lab;
      const cycle = (i: number): void => {
        const base = 1000 + i * 20;
        L.mount(1, { quality: 'medium', ids: [`m:${i % 3}`] } as never);
        L.frames(base, 1);
        if (i % 4 === 0) { L.reveal(0); L.frame(base + 0.5); }
        if (i % 4 === 2) { L.workshop(0); L.frame(base + 0.3); }
        L.unmount();
        L.frame(base + 1); // sai (leave)
        L.frame(base + 10); // passou o tempo ocioso: solta os alvos de GPU dos pipelines
      };
      for (let i = 0; i < 6; i++) cycle(i);
      const baseline = L.memory();
      const mid: Array<{ geometries: number; textures: number; programs: number }> = [];
      for (let i = 6; i < 36; i++) { cycle(i); if (i % 10 === 5) mid.push(L.memory()); }
      return { baseline, mid, last: L.memory(), effects: L.effects() };
    });
    expect(r.last.geometries).toBe(r.baseline.geometries);
    expect(r.last.textures).toBe(r.baseline.textures);
    expect(r.last.programs).toBe(r.baseline.programs);
    for (const m of r.mid) { expect(m.geometries).toBe(r.baseline.geometries); expect(m.textures).toBe(r.baseline.textures); }
    expect(r.effects.active).toBe(false); // sem janela, o palco devolveu o que pegou
    expect(errors).toEqual([]);
  });

  it('janela que sai do canvas (rolada, sem tamanho): o palco sai de cena e o mundo do menu é desenhado com o que é dele', async () => {
    const r = await page.evaluate(() => {
      const L = (window as unknown as { lab: LabApi }).lab;
      L.raceFrame('medium', 1); L.raceFrame('medium', 1);
      const before = L.snapshot();
      L.mount(1, { quality: 'medium' });
      L.frames(1, 2);
      const on = L.effects(); // a janela está na tela: o palco está montado
      const host = document.querySelector('.lab-host') as HTMLElement;
      host.style.left = '5000px'; // a lista rolou: a janela saiu do canvas
      const dbg = L.frame(3);
      const fx = L.effects();
      const after = L.snapshot();
      L.unmount(); L.frame(100);
      return { on, fx, before, after, vps: dbg.viewports.length, calls: dbg.calls };
    });
    expect(r.on.active).toBe(true);
    expect(r.fx.active).toBe(false);
    expect(r.after).toEqual(r.before);
    expect(r.vps).toBe(1); // o fundo do menu (um viewport, o mundo todo)
    expect(r.calls).toBeGreaterThan(20);
  });

  it('o palco devolve à corrida a exposição, os uniformes da estilização e os carros; e a corrida desenha depois dele', async () => {
    const r = await page.evaluate(() => {
      const L = (window as unknown as { lab: LabApi }).lab;
      L.raceFrame('high', 1); L.raceFrame('high', 1);
      const before = L.snapshot();
      L.mount(2, { quality: 'high' });
      L.frames(1, 3);
      const during = L.snapshot();
      const duringFx = L.effects();
      L.unmount();
      L.frame(10);
      const after = L.snapshot();
      const race = L.raceFrame('high', 1);
      // Com a janela ainda registrada, a corrida também tira o palco de cena (render() chama leave antes de qualquer coisa).
      L.mount(1, { quality: 'high' });
      L.frames(20, 2);
      const raceWithPanel = L.raceFrame('high', 1);
      const afterRace = L.snapshot();
      const fxAfterRace = L.effects();
      L.unmount(); L.frame(40);
      return { before, during, duringFx, after, race: { calls: race.calls, vps: race.viewports.length }, raceWithPanel: { calls: raceWithPanel.calls }, afterRace, fxAfterRace };
    });
    expect(r.during.carsInRaceScene).toBe(false);
    expect(r.duringFx.active).toBe(true);
    expect(r.during.exposure).not.toBe(r.before.exposure);
    expect(r.after).toEqual(r.before);
    expect(r.after.carsInRaceScene).toBe(true);
    expect(r.race.vps).toBe(1);
    expect(r.race.calls).toBeGreaterThan(20);
    expect(r.raceWithPanel.calls).toBeGreaterThan(20);
    expect(r.afterRace).toEqual(r.before);
    expect(r.fxAfterRace.active).toBe(false);
    expect(errors).toEqual([]);
  });

  it('contagens por janela (provisórias, sem GPU): o que 1 carro em cada degrau custa em chamadas e triângulos', async () => {
    const r = await page.evaluate(() => {
      const L = (window as unknown as { lab: LabApi }).lab; const out: Record<string, { calls: number; triangles: number; passes: number }> = {};
      for (const q of ['low', 'medium', 'high', 'ultra'] as Quality[]) {
        L.mount(1, { quality: q, cars: ['falcao'] });
        const v = (L.frames(1, 3).pop() as DebugInfo).viewports[0];
        out[q] = { calls: v.calls, triangles: v.triangles, passes: v.passes };
        L.unmount(); L.frame(100);
      }
      return out;
    });
    for (const q of LEVELS) {
      // Teto provisório: o gate de contagem da corrida é por viewport com o mundo inteiro; o palco é 1 carro, um prato e o fundo.
      expect(r[q].calls, `${q}: chamadas`).toBeLessThanOrEqual(60);
      expect(r[q].triangles, `${q}: triângulos`).toBeLessThanOrEqual(60_000);
      expect(r[q].triangles, `${q}: o carro está lá`).toBeGreaterThan(3_000);
    }
    expect(r.low.passes).toBe(0);
    expect(r.medium.passes).toBeGreaterThanOrEqual(3);
  });

  it('a revelação desenha em todo instante da linha do tempo e acaba limpa; com "reduzir efeitos" não há confete nem clarão', async () => {
    const run = (reduce: boolean) => page.evaluate(async (reduceEffects) => {
      const L = (window as unknown as { lab: LabApi }).lab;
      L.mount(1, { quality: 'medium', reduce: reduceEffects, cars: ['trovao'] });
      L.frames(1, 2);
      const T0 = 50;
      L.reveal(0);
      const seen = { cover: false, beam: false, confetti: false, maxFlash: 0, maxNovo: 0, errors: 0 };
      let last: ReturnType<LabApi['effects']> | null = null;
      for (let k = 0; k <= 48; k++) {
        L.frame(T0 + k * 0.1);
        const e = L.effects(); const o = L.overlay(0);
        last = e;
        seen.cover ||= e.cover; seen.beam ||= e.beam; seen.confetti ||= e.confetti;
        seen.maxFlash = Math.max(seen.maxFlash, Number(o.flash ?? 0)); seen.maxNovo = Math.max(seen.maxNovo, Number(o.novo ?? 0));
      }
      const end = L.overlay(0);
      L.unmount(); L.frame(T0 + 100);
      return { seen, last, end };
    }, reduce);
    const normal = await run(false);
    expect(normal.seen.cover).toBe(true);
    expect(normal.seen.beam).toBe(true);
    expect(normal.seen.confetti).toBe(true);
    expect(normal.seen.maxFlash).toBeGreaterThan(0.5);
    expect(normal.seen.maxNovo).toBeGreaterThan(0.9);
    // No fim (4,8 s) a capa, o feixe e o confete saíram, o selo apagou.
    expect(normal.last).toMatchObject({ cover: false, beam: false, confetti: false });
    expect(Number(normal.end.novo)).toBe(0);
    expect(REVEAL.end).toBeLessThan(4.8);
    expect(REVEAL.burst + CONFETTI_LIFE).toBeLessThanOrEqual(REVEAL.end);
    const reduced = await run(true);
    expect(reduced.seen.cover).toBe(true);
    expect(reduced.seen.confetti).toBe(false);
    expect(reduced.seen.maxFlash).toBe(0);
    expect(reduced.end.flash).toBeNull(); // o selo de clarão nem existe
    expect(reduced.seen.maxNovo).toBeGreaterThan(0.9);
    expect(errors).toEqual([]);
  });

  it('a tela remontada com o mesmo id (o menu refaz o DOM, ou muda o idioma) não repete a revelação nem a oficina', async () => {
    const r = await page.evaluate(() => {
      const L = (window as unknown as { lab: LabApi }).lab;
      const ids = { ids: ['again:0'] };
      L.mount(1, { quality: 'low', cars: ['tornado'], ...ids } as never);
      L.frames(1, 2);
      L.reveal(0); L.workshop(0);
      L.frame(300); L.frame(300.5);
      const during = L.effects();
      L.frame(310); // a revelação (4,6 s) e a oficina (1,6 s) acabaram
      L.unmount();
      L.frame(311);
      L.mount(1, { quality: 'low', cars: ['tornado'], ...ids } as never); // o painel nasce de novo, com a contagem em 0
      const seen = { cover: false, confetti: false, sparks: false, beam: false };
      for (let k = 0; k < 6; k++) { L.frame(312 + k * 0.4); const e = L.effects(); seen.cover ||= e.cover; seen.confetti ||= e.confetti; seen.sparks ||= e.sparks; seen.beam ||= e.beam; }
      L.unmount(); L.frame(400);
      return { during, seen };
    });
    expect(r.during.cover || r.during.beam).toBe(true); // a revelação de verdade começou
    expect(r.seen).toEqual({ cover: false, confetti: false, sparks: false, beam: false });
    expect(errors).toEqual([]);
  });

  it('a oficina: o carro afunda e há faíscas; com "reduzir efeitos" o afundar fica e as faíscas não', async () => {
    const run = (reduce: boolean) => page.evaluate((reduceEffects) => {
      const L = (window as unknown as { lab: LabApi }).lab;
      L.mount(1, { quality: 'medium', reduce: reduceEffects, cars: ['falcao'], focus: ['engine'] });
      L.frames(1, 2);
      const T0 = 80;
      L.workshop(0);
      let sparks = false;
      for (let k = 0; k <= 20; k++) { L.frame(T0 + k * 0.1); sparks ||= L.effects().sparks; }
      const end = L.effects();
      L.unmount(); L.frame(T0 + 100);
      return { sparks, end };
    }, reduce);
    const normal = await run(false);
    expect(normal.sparks).toBe(true);
    expect(normal.end.sparks).toBe(false);
    const reduced = await run(true);
    expect(reduced.sparks).toBe(false);
    expect(errors).toEqual([]);
  });

  it('o foco muda a câmera: a mesma janela com o carro de frente e com a roda em foco desenha pixels diferentes', async () => {
    const r = await page.evaluate(() => {
      const L = (window as unknown as { lab: LabApi }).lab;
      const shoot = (focus: string | null) => {
        const rects = L.mount(1, { quality: 'low', cars: ['falcao'], focus: [focus] });
        L.frames(1, 40, 1 / 20); // a câmera suaviza até a pose
        const w = rects[0];
        const px: number[][] = [];
        for (let i = 0; i < 12; i++) px.push(L.sample(w.x + (w.w * (i + 0.5)) / 12, w.y + w.h * 0.55));
        L.unmount(); L.frame(200);
        return px;
      };
      return { overview: shoot(null), tires: shoot('tires') };
    });
    const diff = r.overview.filter((p, i) => differs(p, r.tires[i], 12)).length;
    expect(diff).toBeGreaterThanOrEqual(4);
  });
});
