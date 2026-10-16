// V2 (docs/ondas/V2-gt.md): os estilos no desenho HCT "rodada 2" aprovado pelo dono ("um pouco mais realista que o Horizon Chase Turbo"), um bloco
// por estilo (era tests/estilo-carro-gt.test.ts; as sondas moram em tests/hct-probe.ts). Primeiro o `gt` (etapa 1); a cunha e o hipercarro (etapa 2) estão no fim.
// Mede NA MALHA do modelo de produção (`buildModel('gt')`, o mesmo que a corrida, a garagem e o pódio desenham) as proporções do protótipo
// (cabine avançada, bico baixo, teto, vidro com caimento), a traseira-vitrine com profundidade (lanternas embutidas, pisca e ré apagados,
// difusor, escapes, asa com suportes), o farol com projetores, as faixas A e B redesenhadas para a forma nova e o casco simples (lod1).
// Os números são do cartão; o que ele não diz (o vidro escuro, a área da entrada de ar) é o protótipo medido.
import { describe, expect, it } from 'vitest';
import { checkCarModel } from '../src/render/cars/check';
import { buildModel, MODEL_BUILDERS } from '../src/render/cars/models';
import { probe, range } from './hct-probe';

const gt = buildModel('gt');
const { pos, col, mat, T, isA, isB, lit, isGlass, isTail, isHead, painted, fromAbove, fromSide, lensCenters } = probe(gt);

describe('GT HCT: proporções da rodada 2', () => {
  it('cabine avançada: a base do para-brisa fica em z ≤ −0,75 (motor central; o GT de motor dianteiro tinha −0,58)', () => {
    const glassZ = T.filter((t) => isGlass(t.i) && t.c[1] < 1.0 && t.c[2] < 0).map((t) => Math.min(pos.getZ(t.i), pos.getZ(t.i + 1), pos.getZ(t.i + 2)));
    expect(Math.min(...glassZ)).toBeLessThanOrEqual(-0.75);
  });

  it('bico baixo: nada passa de 0,60 m nos primeiros 12 cm do carro (z ≤ −2,08)', () => {
    let top = 0;
    for (let i = 0; i < pos.count; i++) if (pos.getZ(i) <= -2.08) top = Math.max(top, pos.getY(i));
    expect(top).toBeLessThan(0.6);
  });

  it('teto entre 1,12 e 1,26 m (sem a bolha de cartum) e a tampa do motor alta (≥ 0,8 m em z = 1,75)', () => {
    const roof = T.filter((t) => painted(t.i) && t.n[1] > 0.8 && t.c[2] > -0.2 && t.c[2] < 0.9 && t.c[1] > 1.0).map((t) => t.c[1]);
    expect(roof.length).toBeGreaterThan(10);
    expect(Math.max(...roof)).toBeGreaterThanOrEqual(1.12);
    expect(Math.max(...roof)).toBeLessThanOrEqual(1.26);
    expect(fromAbove(0.5, 1.75)?.y ?? 0).toBeGreaterThanOrEqual(0.8);
  });

  it('vidro de trás longo: o vidro vai do teto até z ≥ 1,5', () => {
    let z = 0;
    for (let i = 0; i < pos.count; i++) if (isGlass(i)) z = Math.max(z, pos.getZ(i));
    expect(z).toBeGreaterThanOrEqual(1.5);
  });

  it('vidro com caimento (alto do vidro ÷ vidro todo entre 0,70 e 0,92), escuro e neutro', () => {
    const v: number[] = [];
    for (let i = 0; i < mat.count; i++) if (isGlass(i)) v.push(i);
    const ys = v.map((i) => pos.getY(i));
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    const half = (l: number[]): number => Math.max(...l.map((i) => Math.abs(pos.getX(i))));
    const ratio = half(v.filter((i) => pos.getY(i) >= mid)) / half(v);
    expect(ratio).toBeGreaterThanOrEqual(0.7);
    expect(ratio).toBeLessThan(0.92);
    // O vidro em si (fora as faixas de reflexo, metal 1): luminância baixa e quase sem croma.
    const body = v.filter((i) => mat.getY(i) < 0.99);
    expect(body.length).toBeGreaterThan(30);
    for (const i of body) {
      const r = col.getX(i); const gg = col.getY(i); const bb = col.getZ(i);
      expect(0.2126 * r + 0.7152 * gg + 0.0722 * bb).toBeLessThan(0.03);
      expect(Math.max(r, gg, bb) - Math.min(r, gg, bb)).toBeLessThan(0.03);
    }
  });

  it('entrada de ar no flanco: peça preta colada na pele entre a porta e a roda de trás (z 0,3–0,8), dos dois lados', () => {
    for (const side of [1, -1]) {
      const area = T.filter((t) => !painted(t.i) && !lit(t.i) && col.getX(t.i) < 0.05 && side * t.n[0] > 0.7 && side * t.c[0] > 0.8
        && t.c[2] > 0.3 && t.c[2] < 0.8 && t.c[1] > 0.26 && t.c[1] < 0.56).reduce((s, t) => s + t.area, 0);
      expect(area, `lado ${side}`).toBeGreaterThan(0.08);
    }
  });
});

describe('GT HCT: a traseira é a estrela', () => {
  const tails = lensCenters((i) => isTail(i));

  it('quatro lanternas redondas acesas (duas por lado), cada uma uma lente em leque com miolo', () => {
    expect(tails.length).toBe(4);
    expect(tails.filter((p) => p[0] > 0).length).toBe(2);
    for (const p of tails) expect(p[2]).toBeGreaterThan(2.0);
  });

  it('a lente fica no FUNDO de um poço: a moldura sobra ≥ 1 cm além da lente e ≥ 3 cm além da pele da traseira', () => {
    // A pele da traseira: a tampa pintada do casco (a face pintada mais de trás voltada para trás).
    const skin = Math.max(...T.filter((t) => painted(t.i) && t.n[2] > 0.9 && t.c[1] > 0.4 && t.c[1] < 0.8).map((t) => t.c[2]));
    for (const c of tails) {
      const rim = T.filter((t) => !lit(t.i) && t.n[2] > 0.5 && Math.hypot(t.c[0] - c[0], t.c[1] - c[1]) < 0.16 && t.c[2] > c[2] - 0.05);
      expect(rim.length, `moldura da lanterna em x = ${c[0].toFixed(2)}`).toBeGreaterThan(0);
      const lip = Math.max(...rim.map((t) => t.c[2]));
      expect(lip - c[2], `x = ${c[0].toFixed(2)}`).toBeGreaterThanOrEqual(0.01);
      expect(lip - skin, `x = ${c[0].toFixed(2)}`).toBeGreaterThanOrEqual(0.03);
    }
  });

  it('pisca âmbar e luz de ré na traseira, APAGADOS (lente colorida sem emissivo), dos dois lados', () => {
    const back = T.filter((t) => t.c[2] > 2.0 && t.n[2] > 0.5 && !lit(t.i) && !painted(t.i));
    const amber = back.filter((t) => col.getX(t.i) > 0.8 && col.getY(t.i) > 0.15 && col.getY(t.i) < 0.5 && col.getZ(t.i) < 0.05);
    const clear = back.filter((t) => col.getX(t.i) > 0.6 && col.getY(t.i) > 0.6 && col.getZ(t.i) > 0.6);
    for (const side of [1, -1]) {
      expect(amber.filter((t) => side * t.c[0] > 0).length, `âmbar, lado ${side}`).toBeGreaterThan(0);
      expect(clear.filter((t) => side * t.c[0] > 0.2).length, `ré, lado ${side}`).toBeGreaterThan(0);
    }
  });

  it('difusor com ≥ 6 aletas, os escapes de sempre (as saídas da chama não mudam) e a asa presa por dois suportes', () => {
    const r = gt.rear;
    expect(r).toBeDefined();
    if (!r) return;
    expect(r.exhausts).toEqual([{ x: 0.42, y: 0.26, z: 2.26, r: 0.075 }, { x: -0.42, y: 0.26, z: 2.26, r: 0.075 }]);
    // Aletas: caixas verticais finas dentro do difusor (12 triângulos cada), sem pintura e sem luz.
    const d = r.diffuser;
    // Aletas: as faces de lado (normal em ±x) das lâminas de carbono (o pincel `CARBON` do `buildRear`) dentro do difusor; cada aleta, 5 cm de x.
    const carbon = (i: number): boolean => Math.abs(mat.getX(i) - 0.38) < 0.02 && Math.abs(mat.getY(i) - 0.35) < 0.02;
    const fins = T.filter((t) => carbon(t.i) && Math.abs(t.n[0]) > 0.9 && t.c[0] > d.min[0] && t.c[0] < d.max[0] && t.c[1] > d.min[1] && t.c[1] < d.max[1] && t.c[2] > d.min[2] && t.c[2] < d.max[2]);
    // As duas faces de uma aleta ficam a ~2,5 cm uma da outra: agrupa o x delas com folga de 4 cm.
    const xs = fins.map((t) => t.c[0]).sort((p, q) => p - q);
    const groups = xs.filter((x, k) => k === 0 || x - xs[k - 1] > 0.04).length;
    expect(groups).toBeGreaterThanOrEqual(6);
    const w = r.wing;
    expect(w).not.toBeNull();
    if (!w) return;
    // Suportes: peça sem pintura que vai da tampa (≤ 0,9 m) até a lâmina (≥ 0,98 m), dos dois lados.
    for (const side of [1, -1]) {
      const s = T.filter((t) => !painted(t.i) && side * t.c[0] > 0.25 && side * t.c[0] < 0.7 && t.c[2] > w.min[2] - 0.1 && t.c[2] < w.max[2] + 0.1 && t.c[1] > 0.8 && t.c[1] < w.max[1]);
      const ys = s.flatMap((t) => [pos.getY(t.i), pos.getY(t.i + 1), pos.getY(t.i + 2)]);
      expect(Math.min(...ys), `suporte, lado ${side}`).toBeLessThanOrEqual(0.9);
      expect(Math.max(...ys), `suporte, lado ${side}`).toBeGreaterThanOrEqual(0.98);
    }
  });
});

describe('GT HCT: farol com projetores', () => {
  it('dois projetores redondos acesos por lado (lente em leque com miolo), na frente e acima do capô', () => {
    const heads = lensCenters((i) => isHead(i));
    for (const side of [1, -1]) {
      const mine = heads.filter((p) => side * p[0] > 0.3);
      expect(mine.length, `lado ${side}`).toBeGreaterThanOrEqual(2);
      for (const p of mine) {
        expect(p[2]).toBeLessThan(-1.6);
        const below = fromAbove(p[0] * 0.999, p[2]);
        expect(below?.y ?? 0).toBeGreaterThanOrEqual(p[1] - 0.001);
      }
    }
  });
});

describe('GT HCT: as faixas seguem a forma nova', () => {
  it('faixa A: de cima, em x = ±0,22, a primeira coisa é a faixa em ≥ 80% das amostras fora do vidro, do bico (z = −2,15) à cauda (z = 2,15)', () => {
    for (const x of [0.22, -0.22]) {
      const zs = range(-2.15, 2.15, 0.05);
      const hits = zs.map((z) => ({ z, h: fromAbove(x, z) }));
      const off = hits.filter((h) => h.h && !isGlass(h.h.i));
      const a = off.filter((h) => h.h && isA(h.h.i));
      expect(a.length / off.length, `x = ${x}: ${off.filter((h) => h.h && !isA(h.h.i)).map((h) => h.z).join(' ')}`).toBeGreaterThanOrEqual(0.8);
      const at = (z: number) => hits.find((h) => Math.abs(h.z - z) < 1e-6)?.h;
      for (const z of [-2.15, -1.3, 0.3, 1.75, 2.15]) {
        const h = at(z);
        expect(h && isA(h.i), `x = ${x}, z = ${z}: a faixa A tem de estar à vista`).toBe(true);
      }
    }
  });

  it('faixa B: de lado, logo abaixo do vinco, a primeira coisa é a faixa entre as rodas; e o vinco sobe ≥ 0,15 m da frente para trás', () => {
    // Altura da faixa em z: o meio das faces B (de lado) que atravessam esse z.
    const bandY = (z: number, side: 1 | -1): number | null => {
      const b = T.filter((t) => {
        if (!isB(t.i) || side * t.n[0] < 0.7) return false;
        const zz = [pos.getZ(t.i), pos.getZ(t.i + 1), pos.getZ(t.i + 2)];
        return Math.min(...zz) <= z && Math.max(...zz) >= z;
      });
      if (!b.length) return null;
      const ys = b.flatMap((t) => [pos.getY(t.i), pos.getY(t.i + 1), pos.getY(t.i + 2)]);
      return (Math.min(...ys) + Math.max(...ys)) / 2;
    };
    for (const side of [1, -1] as const) {
      const zs = range(-0.8, 0.8, 0.05);
      let ok = 0;
      for (const z of zs) {
        const y = bandY(z, side);
        if (y === null) continue;
        const h = fromSide(y, z, side);
        if (h && isB(h.i)) ok++;
      }
      expect(ok / zs.length, `lado ${side}`).toBeGreaterThanOrEqual(0.8);
      const front = bandY(-1.95, side); const back = bandY(1.95, side);
      expect(front).not.toBeNull();
      expect(back).not.toBeNull();
      expect((back ?? 0) - (front ?? 0), `lado ${side}`).toBeGreaterThanOrEqual(0.15);
    }
  });
});

describe('GT HCT: contrato e casco simples', () => {
  it('cabe no orçamento (≤ 8.000 no casco desde a rodada de realismo, §11; era 4.200 no cartão), o lod1 tem ≤ 45% e os dois passam no validador do jogo', () => {
    expect(gt.triangles).toBeLessThanOrEqual(8000);
    expect(checkCarModel(gt)).toEqual([]);
    const low = MODEL_BUILDERS.gt(1);
    expect(low.triangles / gt.triangles).toBeLessThanOrEqual(0.45);
    expect(checkCarModel({ ...gt, shell: low.shell, triangles: low.triangles, lod1: undefined })).toEqual([]);
  });

  it('o lod1 guarda o que se lê de longe: lanternas, farol e as duas faixas', () => {
    const low = MODEL_BUILDERS.gt(1).shell;
    const m = low.getAttribute('aMat'); const p = low.getAttribute('aPaint');
    let tail = 0; let head = 0; let a = 0; let b = 0;
    for (let i = 0; i < m.count; i++) {
      if (m.getW(i) > 0.5) tail++;
      if (m.getZ(i) > 0.5) head++;
      const l = Math.round(p.getZ(i) * 3);
      if (l === 1 || l === 3) a++;
      if (l === 2 || l === 3) b++;
    }
    expect(tail).toBeGreaterThan(0);
    expect(head).toBeGreaterThan(0);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
  });
});

// ─────────────────────────────── V2, etapa 2: a cunha (`wedge`, Iara Turbo) e o hipercarro (`hyper`, Pororoca V10) ───────────────────────────────
// Os dois sobre o mesmo casco por linhas (`cars/hull.ts`) e as mesmas peças (`cars/shaped.ts`) do GT. Do HCT2 vale: vidro escuro com caimento de
// carro de verdade (sem a bolha de cartum), lanternas com profundidade (lente acesa no fundo de uma moldura, em leque com miolo), faixas que seguem a
// forma nova e um lod1 de verdade. O resto é a identidade de cada um (docs/CARROS.md): a cunha reta dos anos 80 com faróis escamoteáveis, frisos e a
// grade-lanterna de ponta a ponta; o hipercarro baixíssimo de cabine avançada, entradas enormes, faróis em fenda e asa em pescoço de cisne.

/** Os blocos que os dois (e os próximos) dividem: vidro, lente com moldura, faixas, lod1 e o validador. */
function hctCommon(body: 'wedge' | 'hyper', o: { tailCenters: number; bandFront: number; bandBack: number }): void {
  const m = buildModel(body);
  const P = probe(m);
  it(`${body}: vidro com caimento (0,70–0,92), escuro e neutro, com o reflexo do céu nas janelas`, () => {
    const r = P.glassTaper();
    expect(r).toBeGreaterThanOrEqual(0.7);
    expect(r).toBeLessThan(0.92);
    const cs = P.glassColors();
    expect(cs.length).toBeGreaterThan(30);
    for (const [r0, g0, b0] of cs) {
      expect(0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0).toBeLessThan(0.03);
      expect(Math.max(r0, g0, b0) - Math.min(r0, g0, b0)).toBeLessThan(0.03);
    }
  });

  it(`${body}: ${o.tailCenters} lentes de lanterna em leque (miolo e borda), cada uma no fundo de uma moldura que sobra ≥ 1 cm além dela e ≥ 3 cm além da pele`, () => {
    const tails = P.lensCenters((i) => P.isTail(i));
    expect(tails.length).toBe(o.tailCenters);
    expect(tails.filter((p) => p[0] > 0).length).toBe(o.tailCenters / 2);
    const skin = Math.max(...P.T.filter((t) => P.painted(t.i) && t.n[2] > 0.9 && t.c[1] > 0.3 && t.c[1] < 0.9 && t.c[2] > 1.8).map((t) => t.c[2]));
    for (const c of tails) {
      const rim = P.T.filter((t) => !P.lit(t.i) && t.n[2] > 0.5 && Math.abs(t.c[1] - c[1]) < 0.12 && Math.abs(t.c[0] - c[0]) < 0.4 && t.c[2] > c[2] - 0.05);
      expect(rim.length, `moldura em x = ${c[0].toFixed(2)}`).toBeGreaterThan(0);
      const lip = Math.max(...rim.map((t) => t.c[2]));
      expect(lip - c[2], `x = ${c[0].toFixed(2)}`).toBeGreaterThanOrEqual(0.01);
      expect(lip - skin, `x = ${c[0].toFixed(2)}`).toBeGreaterThanOrEqual(0.03);
    }
  });

  it(`${body}: faixa A de cima (x = ±0,22) à vista em ≥ 75% das amostras fora do vidro, do bico à cauda; faixa B de lado entre as rodas, e o vinco sobe da frente para trás`, () => {
    for (const x of [0.22, -0.22]) {
      const hits = range(-2.1, 2.1, 0.05).map((z) => ({ z, h: P.fromAbove(x, z) })).filter((h) => h.h && !P.isGlass(h.h.i));
      const a = hits.filter((h) => h.h && P.isA(h.h.i));
      expect(a.length / hits.length, `x = ${x}: ${hits.filter((h) => h.h && !P.isA(h.h.i)).map((h) => h.z).join(' ')}`).toBeGreaterThanOrEqual(0.75);
    }
    const bandY = (z: number, side: 1 | -1): number | null => {
      const b = P.T.filter((t) => {
        if (!P.isB(t.i) || side * t.n[0] < 0.7) return false;
        const zz = [P.pos.getZ(t.i), P.pos.getZ(t.i + 1), P.pos.getZ(t.i + 2)];
        return Math.min(...zz) <= z && Math.max(...zz) >= z;
      });
      if (!b.length) return null;
      const ys = b.flatMap((t) => [P.pos.getY(t.i), P.pos.getY(t.i + 1), P.pos.getY(t.i + 2)]);
      return (Math.min(...ys) + Math.max(...ys)) / 2;
    };
    for (const side of [1, -1] as const) {
      const zs = range(-0.75, 0.75, 0.05);
      let ok = 0;
      for (const z of zs) { const y = bandY(z, side); if (y === null) continue; const h = P.fromSide(y, z, side); if (h && P.isB(h.i)) ok++; }
      expect(ok / zs.length, `lado ${side}`).toBeGreaterThanOrEqual(0.8);
      const front = bandY(o.bandFront, side); const back = bandY(o.bandBack, side);
      expect(front, `faixa B em z = ${o.bandFront}`).not.toBeNull();
      expect(back, `faixa B em z = ${o.bandBack}`).not.toBeNull();
      expect((back ?? 0) - (front ?? 0), `lado ${side}`).toBeGreaterThanOrEqual(0.12);
    }
  });

  it(`${body}: ≤ 4.200 △ no casco, lod1 ≤ 45% com luz e as duas faixas, os dois no validador do jogo`, () => {
    expect(m.triangles).toBeLessThanOrEqual(4200);
    expect(checkCarModel(m)).toEqual([]);
    const low = MODEL_BUILDERS[body](1);
    expect(low.triangles / MODEL_BUILDERS[body]().triangles).toBeLessThanOrEqual(0.45);
    expect(checkCarModel({ ...m, shell: low.shell, triangles: low.triangles, lod1: undefined })).toEqual([]);
    const L = probe(low);
    const n = (f: (i: number) => boolean): number => L.T.filter((t) => f(t.i)).length;
    expect(n(L.isTail)).toBeGreaterThan(0);
    expect(n(L.isHead) + n((i) => L.popup(i))).toBeGreaterThan(0);
    expect(n(L.isA)).toBeGreaterThan(0);
    expect(n(L.isB)).toBeGreaterThan(0);
  });
}

describe('cunha HCT (wedge, Iara Turbo)', () => {
  const m = buildModel('wedge');
  const P = probe(m);
  hctCommon('wedge', { tailCenters: 4, bandFront: -1.95, bandBack: 1.95 });

  it('cunha reta: no meio do capô a pele sobe do bico ao para-brisa sem calombo (≤ 4 cm da reta) e o bico fica abaixo de 0,45 m', () => {
    const glass = P.T.filter((t) => P.isGlass(t.i) && t.c[2] < 0).map((t) => Math.min(P.pos.getZ(t.i), P.pos.getZ(t.i + 1), P.pos.getZ(t.i + 2)));
    const zW = Math.min(...glass) - 0.05;
    const z0 = -2.12;
    const y0 = P.fromAbove(0, z0)?.y ?? 9; const yW = P.fromAbove(0, zW)?.y ?? 9;
    expect(y0).toBeLessThan(0.45);
    for (const z of range(z0, zW, 0.05)) {
      const y = P.fromAbove(0, z)?.y ?? 9;
      const line = y0 + ((yW - y0) * (z - z0)) / (zW - z0);
      expect(Math.abs(y - line), `z = ${z}`).toBeLessThanOrEqual(0.04);
    }
  });

  it('faróis escamoteáveis: de dia a tampa fica rente ao capô (até 1,5 cm) e a lente olha para a frente', () => {
    const pods = P.T.filter((t) => P.popup(t.i));
    expect(pods.length).toBeGreaterThan(0);
    for (const side of [1, -1]) {
      const mine = pods.filter((t) => side * t.c[0] > 0.2);
      expect(mine.length, `lado ${side}`).toBeGreaterThan(0);
      const top = Math.max(...mine.map((t) => t.c[1]));
      const cx = mine.reduce((s, t) => s + t.c[0], 0) / mine.length; const cz = mine.reduce((s, t) => s + t.c[2], 0) / mine.length;
      const hood = P.fromAbove(cx, cz + 0.2, (i) => !P.popup(i))?.y ?? 0;
      expect(top - hood, `lado ${side}`).toBeLessThanOrEqual(0.015);
      expect(mine.some((t) => P.isHead(t.i) && t.n[2] < -0.5), `lente do lado ${side}`).toBe(true);
    }
  });

  it('grade-lanterna de ponta a ponta: lâminas pretas na frente da lente (≥ 3, cobrindo ≥ 70% da largura dela)', () => {
    const tail = P.T.filter((t) => P.isTail(t.i) && t.n[2] > 0.5);
    const zLens = Math.max(...tail.map((t) => t.c[2]));
    const xs = tail.map((t) => Math.abs(t.c[0]));
    const width = Math.max(...xs);
    const ys = tail.map((t) => t.c[1]);
    const slats = P.T.filter((t) => !P.lit(t.i) && !P.painted(t.i) && t.n[2] > 0.5 && t.c[2] > zLens + 0.005 && t.c[1] > Math.min(...ys) && t.c[1] < Math.max(...ys));
    const rows = new Set(slats.map((t) => Math.round(t.c[1] / 0.02)));
    expect(rows.size).toBeGreaterThanOrEqual(3);
    expect(Math.max(...slats.map((t) => Math.abs(t.c[0])))).toBeGreaterThanOrEqual(0.7 * width);
  });

  it('entrada de ar atrás da porta, preta e colada na pele (≥ 0,06 m² por lado), e os frisos da porta', () => {
    for (const side of [1, -1]) {
      const area = P.T.filter((t) => !P.painted(t.i) && !P.lit(t.i) && P.col.getX(t.i) < 0.05 && side * t.n[0] > 0.7 && side * t.c[0] > 0.8
        && t.c[2] > 0.3 && t.c[2] < 0.85 && t.c[1] > 0.25 && t.c[1] < 0.6).reduce((s, t) => s + t.area, 0);
      expect(area, `lado ${side}`).toBeGreaterThan(0.06);
    }
  });
});

describe('hipercarro HCT (hyper, Pororoca V10)', () => {
  const m = buildModel('hyper');
  const P = probe(m);
  hctCommon('hyper', { tailCenters: 4, bandFront: -1.97, bandBack: 1.9 });

  it('baixíssimo e de cabine avançada: teto ≤ 1,12 m, base do para-brisa em z ≤ −0,95, bico abaixo de 0,45 m', () => {
    const roof = P.T.filter((t) => P.painted(t.i) && t.n[1] > 0.8 && t.c[2] > -0.4 && t.c[2] < 0.6 && t.c[1] > 0.9).map((t) => t.c[1]);
    expect(roof.length).toBeGreaterThan(5);
    expect(Math.max(...roof)).toBeLessThanOrEqual(1.12);
    const glass = P.T.filter((t) => P.isGlass(t.i) && t.c[2] < 0).map((t) => Math.min(P.pos.getZ(t.i), P.pos.getZ(t.i + 1), P.pos.getZ(t.i + 2)));
    expect(Math.min(...glass)).toBeLessThanOrEqual(-0.95);
    let top = 0;
    for (let i = 0; i < P.pos.count; i++) if (P.pos.getZ(i) <= -2.08) top = Math.max(top, P.pos.getY(i));
    expect(top).toBeLessThan(0.45);
  });

  it('faróis em fenda: um projetor em leque por lado dentro de uma fenda de no máximo 7 cm de altura', () => {
    const heads = P.lensCenters((i) => P.isHead(i));
    for (const side of [1, -1]) {
      const mine = heads.filter((p) => side * p[0] > 0.2);
      expect(mine.length, `lado ${side}`).toBeGreaterThanOrEqual(1);
      const lit = P.T.filter((t) => P.isHead(t.i) && side * t.c[0] > 0.2);
      const ys = lit.flatMap((t) => [P.pos.getY(t.i), P.pos.getY(t.i + 1), P.pos.getY(t.i + 2)]);
      expect(Math.max(...ys) - Math.min(...ys), `lado ${side}`).toBeLessThanOrEqual(0.07);
    }
  });

  it('asa em pescoço de cisne na cor de detalhe: os suportes passam por cima da lâmina; difusor de ≥ 7 aletas e o escape central duplo de sempre', () => {
    const r = m.rear;
    expect(r).toBeDefined();
    if (!r?.wing) throw new Error('sem asa');
    expect(r.exhausts).toEqual([{ x: 0.13, y: 0.46, z: 2.25, r: 0.075 }, { x: -0.13, y: 0.46, z: 2.25, r: 0.075 }]);
    const w = r.wing;
    const blade = P.T.filter((t) => P.accent(t.i) && t.c[2] > w.min[2] && t.c[2] < w.max[2] && t.c[1] > w.min[1] && Math.abs(t.c[0]) < 0.3);
    expect(blade.length, 'a lâmina é da cor de detalhe').toBeGreaterThan(4);
    const bladeTop = Math.max(...blade.map((t) => t.c[1]));
    for (const side of [1, -1]) {
      const strut = P.T.filter((t) => !P.painted(t.i) && side * t.c[0] > 0.3 && side * t.c[0] < 0.6 && t.c[2] > w.min[2] - 0.15 && t.c[2] < w.max[2] + 0.15 && t.c[1] > 0.85);
      const ys = strut.flatMap((t) => [P.pos.getY(t.i), P.pos.getY(t.i + 1), P.pos.getY(t.i + 2)]);
      expect(Math.max(...ys), `suporte, lado ${side}`).toBeGreaterThan(bladeTop);
    }
    const d = r.diffuser;
    const carbon = (i: number): boolean => Math.abs(P.mat.getX(i) - 0.38) < 0.02 && Math.abs(P.mat.getY(i) - 0.35) < 0.02;
    const fins = P.T.filter((t) => carbon(t.i) && Math.abs(t.n[0]) > 0.9 && t.c[0] > d.min[0] && t.c[0] < d.max[0] && t.c[1] > d.min[1] && t.c[1] < d.max[1] && t.c[2] > d.min[2] && t.c[2] < d.max[2]);
    const xs = fins.map((t) => t.c[0]).sort((p, q) => p - q);
    expect(xs.filter((x, k) => k === 0 || x - xs[k - 1] > 0.04).length).toBeGreaterThanOrEqual(7);
  });
});
