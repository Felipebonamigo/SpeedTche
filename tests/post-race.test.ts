// N4, o relógio do pós-corrida (docs/ondas/N/N4.md §5 "R"): chegada → pódio → pagamento → a decisão de "próxima", com avanço automático,
// no máximo 15 s e pulo segurando o botão. Puro, sem DOM.
import { describe, expect, it } from 'vitest';
import type { RaceMode } from '../src/game/contracts';
import {
  createHoldSkip, createPostRace, guardConfirm, HOLD_SKIP_SECONDS, planPostRace, POST_FRAME_MAX, POST_RACE_BUDGET, POST_STEP_SECONDS, planSeconds,
} from '../src/game/post-race';

const ALL_MODES: RaceMode[] = ['cup', 'quick', 'timetrial', 'career', 'tournament', 'escort', 'relay'];

describe('planPostRace (R1)', () => {
  it('carreira com pódio 3D e relatório: chegada, pódio, pagamento', () => {
    expect(planPostRace({ mode: 'career', podium: true, payout: true })).toEqual(['arrival', 'podium', 'payout']);
  });
  it('corrida rápida e copa: chegada e pódio; o pagamento só existe na carreira', () => {
    expect(planPostRace({ mode: 'quick', podium: true, payout: true })).toEqual(['arrival', 'podium']);
    expect(planPostRace({ mode: 'cup', podium: true, payout: false })).toEqual(['arrival', 'podium']);
  });
  it('Retrô (sem pódio 3D): sem o passo do pódio', () => {
    expect(planPostRace({ mode: 'quick', podium: false, payout: false })).toEqual(['arrival']);
    expect(planPostRace({ mode: 'career', podium: false, payout: true })).toEqual(['arrival', 'payout']);
  });
  it('carreira sem relatório (nada foi pago): sem o passo do pagamento', () => {
    expect(planPostRace({ mode: 'career', podium: true, payout: false })).toEqual(['arrival', 'podium']);
  });
  it('contra-relógio e modos de festa ficam como são hoje: nenhum passo, pronto na hora', () => {
    for (const mode of ['timetrial', 'tournament', 'escort', 'relay'] as RaceMode[]) {
      expect(planPostRace({ mode, podium: true, payout: true })).toEqual([]);
    }
  });
});

describe('orçamento de tempo (R2)', () => {
  it('o pior plano de cada modo cabe em 15 s', () => {
    expect(POST_RACE_BUDGET).toBe(15);
    for (const mode of ALL_MODES) {
      const worst = planSeconds(planPostRace({ mode, podium: true, payout: true }));
      expect(worst, mode).toBeLessThanOrEqual(POST_RACE_BUDGET);
    }
  });
  it('as somas esperadas: carreira 14 s, rápida 7 s, só a chegada 2,5 s', () => {
    expect(planSeconds(['arrival', 'podium', 'payout'])).toBeCloseTo(14, 6);
    expect(planSeconds(['arrival', 'podium'])).toBeCloseTo(7, 6);
    expect(planSeconds(['arrival'])).toBeCloseTo(2.5, 6);
    expect(planSeconds([])).toBe(0);
    expect(POST_STEP_SECONDS.payout).toBeGreaterThan(0);
  });
});

describe('createPostRace (R3, R4)', () => {
  it('passa pelos passos na ordem e termina pronto, sem largar nada sozinho', () => {
    const post = createPostRace(['arrival', 'podium', 'payout']);
    expect(post.ready).toBe(false);
    expect(post.step).toBe('arrival');
    const seen: string[] = [];
    for (let i = 0; i < 600; i++) {
      post.advance(1 / 30);
      if (post.step && seen[seen.length - 1] !== post.step) seen.push(post.step);
    }
    expect(seen).toEqual(['arrival', 'podium', 'payout']);
    expect(post.ready).toBe(true);
    expect(post.step).toBeNull();
    // Depois de pronto, o tempo não anda para trás nem reabre passo.
    const t = post.elapsed;
    post.advance(5);
    expect(post.ready).toBe(true);
    expect(post.elapsed).toBe(t);
  });
  it('o tempo até o pronto, andando quadro a quadro, é a soma do plano (≤ 15 s)', () => {
    const post = createPostRace(['arrival', 'podium', 'payout']);
    let t = 0;
    while (!post.ready && t < 60) { post.advance(1 / 60); t += 1 / 60; }
    expect(t).toBeGreaterThan(13.9);
    expect(t).toBeLessThanOrEqual(POST_RACE_BUDGET);
  });
  it('um quadro enorme (aba parada, engasgo) não pula passos: o dt é preso a 0,1 s', () => {
    expect(POST_FRAME_MAX).toBeCloseTo(0.1, 6);
    const post = createPostRace(['arrival', 'podium']);
    post.advance(30);
    expect(post.ready).toBe(false);
    expect(post.elapsed).toBeCloseTo(POST_FRAME_MAX, 6);
    expect(post.step).toBe('arrival');
  });
  it('plano vazio já nasce pronto', () => {
    const post = createPostRace([]);
    expect(post.ready).toBe(true);
    expect(post.step).toBeNull();
  });
  it('skip() vai ao fim de uma vez e é idempotente', () => {
    const post = createPostRace(['arrival', 'podium', 'payout']);
    post.advance(1);
    post.skip();
    expect(post.ready).toBe(true);
    expect(post.skipped).toBe(true);
    expect(post.step).toBeNull();
    post.skip();
    expect(post.ready).toBe(true);
  });
  it('enterStep() salta para o começo do passo (a tela do Pagamento chamada direto)', () => {
    const post = createPostRace(['arrival', 'podium', 'payout']);
    post.enterStep('payout');
    expect(post.step).toBe('payout');
    expect(post.stepTime).toBe(0);
    // Não volta atrás: de dentro do pagamento, pedir o pódio não faz nada.
    post.advance(POST_FRAME_MAX);
    post.enterStep('podium');
    expect(post.step).toBe('payout');
    expect(post.stepTime).toBeCloseTo(POST_FRAME_MAX, 6);
  });
  it('stepIndex acompanha a ordem do plano', () => {
    const post = createPostRace(['arrival', 'podium']);
    expect(post.stepIndex).toBe(0);
    post.advance(POST_FRAME_MAX);
    for (let i = 0; i < 30; i++) post.advance(POST_FRAME_MAX);
    expect(post.stepIndex).toBe(1);
  });
});

describe('createHoldSkip (R5)', () => {
  it('A já preso na chegada (o botão de acelerar) não pula: precisa ter sido visto solto antes', () => {
    const hold = createHoldSkip();
    let fired = false;
    for (let i = 0; i < 100; i++) fired ||= hold.observe(0.05, true);
    expect(fired).toBe(false);
  });
  it('solto e depois segurado por 0,45 s pula, uma vez só', () => {
    expect(HOLD_SKIP_SECONDS).toBeCloseTo(0.45, 6);
    const hold = createHoldSkip();
    expect(hold.observe(0.05, false)).toBe(false);
    let fires = 0;
    let t = 0;
    for (let i = 0; i < 40; i++) { t += 0.05; if (hold.observe(0.05, true)) fires++; if (t < HOLD_SKIP_SECONDS - 0.06) expect(fires).toBe(0); }
    expect(fires).toBe(1);
  });
  it('soltar no meio zera a conta', () => {
    const hold = createHoldSkip();
    hold.observe(0.05, false);
    for (let i = 0; i < 6; i++) expect(hold.observe(0.05, true)).toBe(false); // 0,30 s
    hold.observe(0.05, false);
    for (let i = 0; i < 6; i++) expect(hold.observe(0.05, true)).toBe(false); // outros 0,30 s: nunca chegou a 0,45 seguidos
  });
});

describe('guardConfirm (R6)', () => {
  it('engole o confirmar com a sequência andando e deixa passar quando está pronta', () => {
    const post = createPostRace(['arrival', 'podium']);
    expect(guardConfirm(post)).toBe(false);
    post.skip();
    expect(guardConfirm(post)).toBe(true);
  });
  it('sem sequência (festa, contra-relógio) o confirmar sempre passa', () => {
    expect(guardConfirm(createPostRace([]))).toBe(true);
  });
});
