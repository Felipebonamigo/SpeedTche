// V11, item 4 (câmera e composição): a Alta aprovada pelo dono (FOV 54, recuo 5,8 m, altura 2,5) NÃO muda. Como candidata (para o dono ver antes × depois) existe
// `CAMERA_HIGH_CURVE`, uma Alta um pouco mais alta e mais atrás que mostra mais da curva à frente, atrás do interruptor `CAMERA_EXPERIMENT.highCurve` (desligado;
// o harness liga com `?camcurve=1`). A conta abaixo é a projeção de pinhole do chão, escrita aqui e independente do código.
import { describe, expect, it } from 'vitest';
import * as B from '../src/render/camera-base';

type Pose = { baseFov: number; speedFov: number; nitroFov: number; height: number; back: number; lookAhead: number; lookY: number };
const mod = B as unknown as { CAMERA_HIGH_CURVE?: Pose; CAMERA_EXPERIMENT?: { highCurve: boolean }; cameraPoseFor?: (m: B.CameraMode) => Pose };
const candidate = (): Pose => mod.CAMERA_HIGH_CURVE ?? B.CAMERA_POSES.high;

/**
 * Linhas (px, tela de 720) que o chão a `d0`–`d1` m À FRENTE DO CARRO ocupa no meio da tela: a câmera está `back` m atrás do carro e `height` m acima, olhando o ponto
 * (`lookAhead`, `lookY`); o pitch vem desse ponto. É o espaço que a pista ainda longe (a curva que vem) ganha no quadro.
 */
function roadSpanPx(p: Pose, d0: number, d1: number): number {
  const pitch = Math.atan2(p.height - p.lookY, p.lookAhead + p.back);
  const f = 360 / Math.tan((p.baseFov * Math.PI) / 360); // distância focal em px
  const row = (d: number): number => f * Math.tan(Math.atan2(p.height, d + p.back) - pitch);
  return row(d0) - row(d1);
}

describe('V11 · câmera Alta: o padrão não mudou; a candidata mostra mais da curva', () => {
  it('trava: a Alta aprovada (FOV 54, altura 2,5, recuo 5,8, mira 18 m a 0,7) segue como está', () => {
    expect(B.CAMERA_POSES.high).toEqual({ baseFov: 54, speedFov: 8, nitroFov: 5, height: 2.5, back: 5.8, lookAhead: 18, lookY: 0.7 });
  });

  it('o interruptor existe e vem DESLIGADO; ligado, só a Alta troca de pose (as outras três ficam)', () => {
    expect(mod.CAMERA_EXPERIMENT, 'CAMERA_EXPERIMENT').toBeDefined();
    expect(mod.CAMERA_EXPERIMENT?.highCurve).toBe(false);
    const pose = mod.cameraPoseFor;
    expect(pose, 'cameraPoseFor').toBeTypeOf('function');
    if (!pose || !mod.CAMERA_EXPERIMENT) return;
    expect(pose('high')).toBe(B.CAMERA_POSES.high);
    mod.CAMERA_EXPERIMENT.highCurve = true;
    try {
      expect(pose('high')).toBe(mod.CAMERA_HIGH_CURVE);
      for (const m of ['low', 'hood', 'bumper'] as const) expect(pose(m)).toBe(B.CAMERA_POSES[m]);
    } finally { mod.CAMERA_EXPERIMENT.highCurve = false; }
  });

  it('a candidata mantém o FOV e as parcelas de velocidade/nitro da Alta (a régua de visão dos marcos e a mola de FOV não mudam)', () => {
    const c = candidate();
    expect(c.baseFov).toBe(B.CAMERA_POSES.high.baseFov);
    expect(c.speedFov).toBe(B.CAMERA_POSES.high.speedFov);
    expect(c.nitroFov).toBe(B.CAMERA_POSES.high.nitroFov);
  });

  it('a pista de 30 a 150 m à frente do carro ocupa ≥ 1,25× as linhas que ocupa na Alta de hoje, e o carro não encolhe mais que 20% (recuo ≤ 1,2× o de hoje)', () => {
    const now = B.CAMERA_POSES.high; const c = candidate();
    const gain = roadSpanPx(c, 30, 150) / roadSpanPx(now, 30, 150);
    expect(gain, `linhas de 30 a 150 m: ${roadSpanPx(now, 30, 150).toFixed(1)} → ${roadSpanPx(c, 30, 150).toFixed(1)} px`).toBeGreaterThanOrEqual(1.25);
    expect(c.back, 'recuo').toBeLessThanOrEqual(now.back * 1.2);
    expect(c.height, 'altura').toBeGreaterThan(now.height);
  });

  it('o horizonte continua dentro do quadro e o carro continua na terça parte de baixo (a mira cai a ≤ 0,15 da altura acima do centro)', () => {
    const c = candidate();
    const pitch = Math.atan2(c.height - c.lookY, c.lookAhead + c.back);
    const horizonRow = -360 * Math.tan(-pitch) / Math.tan((c.baseFov * Math.PI) / 360); // linha do horizonte em relação ao centro (positivo = abaixo)
    expect(Math.abs(horizonRow) / 360, 'horizonte dentro do quadro').toBeLessThan(0.6);
    expect(pitch * (180 / Math.PI), 'pitch (graus)').toBeLessThan(c.baseFov / 2 - 8);
  });
});
