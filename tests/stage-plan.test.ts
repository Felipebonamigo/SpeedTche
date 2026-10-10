// N2, palco 3D (docs/ondas/N/N2.md §4.1, §6 "P"): a parte pura do palco — mola da oficina, linha do tempo da revelação, confete
// determinístico, a câmera que vai ao detalhe da peça em foco, a qualidade própria e os retângulos do GL. Sem `three` aqui
// além dos modelos reais dos carros (só malha; sem GL, sem canvas).
import { describe, expect, it } from 'vitest';
import { CAR_BODIES, CARS } from '../src/core/data/cars';
import { buildModel } from '../src/render/cars/models';
import {
  confettiPiece, CONFETTI_COUNT, CONFETTI_LIFE, focusPose, MAX_PANELS, podiumSlots, REVEAL, revealPlan, springDip, SPRING_DURATION,
  stageQuality, stageViewport, workshopPlan, type ConfettiPiece, type StageFocus,
} from '../src/render/stage-plan';

const range = (n: number, step: number): number[] => Array.from({ length: n }, (_, i) => i * step);

describe('mola da oficina (springDip)', () => {
  it('começa em 0, afunda (negativo), devolve com um repique e acaba em 0 sem resíduo', () => {
    expect(springDip(0)).toBe(0);
    const samples = range(140, 0.01).map(springDip);
    const min = Math.min(...samples);
    expect(min).toBeLessThan(-0.6);
    expect(min).toBeGreaterThanOrEqual(-1.0001);
    expect(Math.max(...samples)).toBeGreaterThan(0.02); // o repique: passa do zero para cima
    expect(springDip(SPRING_DURATION)).toBe(0);
    expect(springDip(SPRING_DURATION + 5)).toBe(0);
    expect(Math.abs(springDip(SPRING_DURATION - 0.05))).toBeLessThan(0.03);
  });
  it('tempo negativo é 0 e a conta é determinística', () => {
    expect(springDip(-1)).toBe(0);
    expect(springDip(0.37)).toBe(springDip(0.37));
  });
});

describe('oficina (workshopPlan)', () => {
  it('com reduzir efeitos: sem faísca e sem tremor em nenhum instante; o afundar continua', () => {
    let dipSeen = false;
    for (const t of range(150, 0.01)) {
      const p = workshopPlan(t, true);
      expect(p.sparks).toBe(0);
      expect(p.shake).toBe(0);
      if (p.dip < -0.3) dipSeen = true;
    }
    expect(dipSeen).toBe(true);
  });
  it('sem reduzir: faísca e tremor aparecem e acabam', () => {
    const plans = range(150, 0.01).map((t) => workshopPlan(t, false));
    expect(Math.max(...plans.map((p) => p.sparks))).toBeGreaterThan(0.5);
    expect(Math.max(...plans.map((p) => p.shake))).toBeGreaterThan(0);
    expect(workshopPlan(2, false).sparks).toBe(0);
    expect(workshopPlan(2, false).shake).toBe(0);
  });
});

describe('revelação (revealPlan)', () => {
  const plans = (reduce: boolean) => range(480, 0.01).map((t) => ({ t, p: revealPlan(t, reduce) }));
  it('a capa só sai: 0 → 1, sem voltar, e os faróis só acendem depois que ela saiu', () => {
    let prev = 0;
    for (const { t, p } of plans(false)) {
      expect(p.cover, `t=${t}`).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = p.cover;
      if (p.head > 0) expect(p.cover, `faróis acesos antes da capa, t=${t}`).toBeGreaterThanOrEqual(0.99);
    }
    expect(revealPlan(0, false).cover).toBe(0);
    expect(revealPlan(REVEAL.coverEnd, false).cover).toBe(1);
    expect(Math.max(...plans(false).map(({ p }) => p.head))).toBeCloseTo(1, 5);
  });
  it('o estouro (flash e confete) vem junto da capa sair; "NOVO!" depois dele', () => {
    const before = revealPlan(REVEAL.burst - 0.01, false);
    expect(before.flash).toBe(0);
    expect(before.confetti).toBe(-1);
    expect(Math.max(...plans(false).map(({ p }) => p.flash))).toBeGreaterThan(0.5);
    const at = revealPlan(REVEAL.burst + 0.5, false);
    expect(at.confetti).toBeCloseTo(0.5, 5);
    expect(revealPlan(REVEAL.novo - 0.01, false).novo).toBe(0);
    expect(revealPlan(REVEAL.novo + 0.5, false).novo).toBeGreaterThan(0.9);
  });
  it('reduzir efeitos: nenhum flash e nenhum confete em instante algum; a capa sai e os faróis acendem', () => {
    for (const { p } of plans(true)) {
      expect(p.flash).toBe(0);
      expect(p.confetti).toBe(-1);
    }
    expect(revealPlan(REVEAL.coverEnd, true).cover).toBe(1);
    expect(Math.max(...plans(true).map(({ p }) => p.head))).toBeCloseTo(1, 5);
    expect(revealPlan(REVEAL.novo + 0.5, true).novo).toBeGreaterThan(0.9);
  });
  it('termina: `done` em REVEAL.end, com holofote, faróis e luz de volta ao normal; antes disso não', () => {
    expect(revealPlan(REVEAL.end - 0.05, false).done).toBe(false);
    const end = revealPlan(REVEAL.end, false);
    expect(end.done).toBe(true);
    expect(end.spot).toBe(0);
    expect(end.head).toBe(0);
    expect(end.dim).toBe(0);
    expect(revealPlan(REVEAL.end + 3, false)).toEqual(end);
    expect(REVEAL.end).toBeGreaterThanOrEqual(REVEAL.burst + CONFETTI_LIFE); // o último confete cai antes do fim
  });
  it('o holofote sobe antes da capa sair e o palco escurece junto', () => {
    const early = revealPlan(REVEAL.coverStart, false);
    expect(early.spot).toBeGreaterThan(0.9);
    expect(early.dim).toBeGreaterThan(0.5);
    expect(revealPlan(0, false).spot).toBe(0);
  });
});

describe('confete (confettiPiece)', () => {
  const fresh = (): ConfettiPiece => ({ x: 0, y: 0, z: 0, rot: 0, scale: 0, color: 0, alive: false });
  it('são 120 peças e a mesma peça no mesmo instante dá sempre o mesmo resultado (sem Math.random)', () => {
    expect(CONFETTI_COUNT).toBe(120);
    for (const i of [0, 7, 119]) {
      for (const t of [0.1, 0.9, 2.2]) {
        expect({ ...confettiPiece(i, t, fresh()) }).toEqual({ ...confettiPiece(i, t, fresh()) });
      }
    }
  });
  it('as peças são diferentes entre si (posição e cor variam) e sobem no começo', () => {
    const at = (i: number) => ({ ...confettiPiece(i, 0.5, fresh()) });
    const xs = new Set(range(CONFETTI_COUNT, 1).map((i) => at(i).x.toFixed(3)));
    expect(xs.size).toBeGreaterThan(CONFETTI_COUNT * 0.9);
    expect(new Set(range(CONFETTI_COUNT, 1).map((i) => at(i).color)).size).toBeGreaterThan(3);
    const ys = range(CONFETTI_COUNT, 1).map((i) => at(i).y);
    expect(ys.filter((y) => y > confettiPiece(0, 0, fresh()).y).length).toBeGreaterThan(CONFETTI_COUNT * 0.8);
  });
  it('acabam depois da vida (alive = false) e nunca ficam abaixo do prato', () => {
    for (const i of range(CONFETTI_COUNT, 1)) {
      expect(confettiPiece(i, CONFETTI_LIFE + 0.2, fresh()).alive).toBe(false);
      for (const t of range(40, 0.08)) {
        const p = confettiPiece(i, t, fresh());
        expect(p.y, `peça ${i} t=${t}`).toBeGreaterThanOrEqual(0.18);
        expect(Number.isFinite(p.x + p.y + p.z + p.rot + p.scale)).toBe(true);
      }
    }
    expect(confettiPiece(3, 0.5, fresh()).alive).toBe(true);
  });
});

describe('câmera de detalhe (focusPose)', () => {
  const yawed = (yaw: number, p: readonly [number, number, number]): [number, number, number] =>
    [p[0] * Math.cos(yaw) + p[2] * Math.sin(yaw), p[1], -p[0] * Math.sin(yaw) + p[2] * Math.cos(yaw)];
  const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  for (const body of CAR_BODIES) {
    describe(`estilo ${body}`, () => {
      const model = buildModel(body);
      const wheel = (side: 1 | -1): [number, number, number] => [side * model.axles[0].x, model.axles[0].r, model.axles[0].z];

      it('pneus e freios miram a roda dianteira (a ≤ 0,3 m do centro); o freio chega mais perto', () => {
        const tires = focusPose(model, 'tires');
        const brakes = focusPose(model, 'brakes');
        for (const pose of [tires, brakes]) {
          expect(pose.yaw).not.toBeNull();
          const w = Math.min(...[1, -1].map((s) => dist(pose.target, yawed(pose.yaw ?? 0, wheel(s as 1 | -1)))));
          expect(w, `${body} alvo longe da roda`).toBeLessThanOrEqual(0.3);
        }
        expect(brakes.distance).toBeLessThan(tires.distance);
      });
      it('nitro mira o escape (a ≤ 0,3 m) e a câmera vem de trás; tanque olha o quarto traseiro', () => {
        const nitro = focusPose(model, 'nitro');
        const ex = model.exhausts.map((e) => dist(nitro.target, yawed(nitro.yaw ?? 0, e)));
        expect(Math.min(...ex), `${body} alvo longe do escape`).toBeLessThanOrEqual(0.3);
        expect(Math.cos(nitro.azimuth), 'câmera do nitro deveria estar atrás do carro').toBeLessThan(0);
        const tank = focusPose(model, 'tank');
        const local = yawed(-(tank.yaw ?? 0), tank.target); // de volta ao referencial do carro
        expect(local[2], `${body} tanque na metade de trás`).toBeGreaterThan(0.3);
      });
      it('motor e turbo miram o capô: metade da frente, acima do chão, câmera por cima', () => {
        for (const part of ['engine', 'turbo'] as const) {
          const pose = focusPose(model, part);
          const local = yawed(-(pose.yaw ?? 0), pose.target);
          expect(local[2], `${body} ${part}: capô na frente`).toBeLessThan(-0.3);
          expect(local[1]).toBeGreaterThan(0.35);
          expect(pose.elevation).toBeGreaterThan(0.25);
        }
      });
    });
  }

  it('sem foco (ou foco que não é peça) a vista é a geral: o prato gira (yaw nulo) e fica mais longe que qualquer detalhe', () => {
    const model = buildModel('gt');
    const overview = focusPose(model, null);
    expect(overview.yaw).toBeNull();
    for (const part of ['engine', 'turbo', 'tires', 'brakes', 'tank', 'nitro'] as StageFocus[]) {
      expect(focusPose(model, part).distance, String(part)).toBeLessThan(overview.distance);
      expect(focusPose(model, part).yaw, String(part)).not.toBeNull();
    }
    expect(focusPose(model, null, 4 / 3).distance).toBeGreaterThan(overview.distance); // janela mais estreita: afasta
    for (const d of [overview.distance, focusPose(model, 'tires').distance]) { expect(Number.isFinite(d)).toBe(true); expect(d).toBeGreaterThan(0); }
  });

  it('o enquadramento serve aos 14 carros', () => {
    for (const car of CARS) {
      const model = buildModel(car.body);
      for (const f of [null, 'engine', 'tires', 'nitro'] as StageFocus[]) {
        const p = focusPose(model, f, 16 / 9);
        expect([p.azimuth, p.elevation, p.distance, ...p.target].every(Number.isFinite), `${car.id} ${String(f)}`).toBe(true);
      }
    }
  });
});

describe('qualidade própria do palco (stageQuality)', () => {
  it('sem informação, a Média (o padrão do Deck)', () => {
    expect(stageQuality(undefined, 1)).toBe('medium');
  });
  it('respeita a qualidade pedida; 3–4 painéis não passam de Alta; nunca sobe', () => {
    expect(stageQuality('low', 4)).toBe('low');
    expect(stageQuality('medium', 1)).toBe('medium');
    expect(stageQuality('high', 4)).toBe('high');
    expect(stageQuality('ultra', 1)).toBe('ultra');
    expect(stageQuality('ultra', 2)).toBe('ultra');
    expect(stageQuality('ultra', 3)).toBe('high');
    expect(stageQuality('ultra', 4)).toBe('high');
  });
  it('no máximo 4 painéis', () => { expect(MAX_PANELS).toBe(4); });
});

describe('retângulo do GL (stageViewport)', () => {
  it('inverte o y (o GL conta de baixo) e mantém as medidas dentro do canvas', () => {
    expect(stageViewport({ x: 100, y: 50, w: 300, h: 200 }, 1280, 720)).toEqual({ x: 100, y: 470, w: 300, h: 200 });
  });
  it('prende o que passa da borda e recusa o que sumiu ou não tem tamanho', () => {
    expect(stageViewport({ x: -20, y: 600, w: 100, h: 200 }, 1280, 720)).toEqual({ x: 0, y: 0, w: 80, h: 120 });
    expect(stageViewport({ x: 1200, y: 10, w: 200, h: 50 }, 1280, 720)).toEqual({ x: 1200, y: 660, w: 80, h: 50 });
    expect(stageViewport({ x: 10, y: 10, w: 0, h: 50 }, 1280, 720)).toBeNull();
    expect(stageViewport({ x: 10, y: 10, w: 50, h: 0 }, 1280, 720)).toBeNull();
    expect(stageViewport({ x: 2000, y: 10, w: 50, h: 50 }, 1280, 720)).toBeNull(); // rolou para fora
    expect(stageViewport({ x: 10, y: -300, w: 50, h: 100 }, 1280, 720)).toBeNull();
    expect(stageViewport({ x: Number.NaN, y: 0, w: 10, h: 10 }, 1280, 720)).toBeNull();
  });
});

describe('pódio (podiumSlots)', () => {
  it('o 1º é o central e o mais alto; o 2º e o 3º ficam dos lados, simétricos, e o 2º é mais alto que o 3º', () => {
    const slots = podiumSlots(3);
    expect(slots).toHaveLength(3);
    const by = (place: number) => slots.find((s) => s.place === place);
    const [p1, p2, p3] = [by(1), by(2), by(3)];
    expect(p1 && p2 && p3).toBeTruthy();
    if (!p1 || !p2 || !p3) return;
    expect(p1.x).toBe(0);
    expect(p2.x).toBe(-p3.x);
    expect(p2.x).toBeLessThan(0);
    expect(p1.top).toBeGreaterThan(p2.top);
    expect(p2.top).toBeGreaterThan(p3.top);
  });
  it('com menos de 3 carros, só os lugares que existem', () => {
    expect(podiumSlots(1).map((s) => s.place)).toEqual([1]);
    expect(podiumSlots(2).map((s) => s.place).sort()).toEqual([1, 2]);
    expect(podiumSlots(0)).toEqual([]);
  });
});
