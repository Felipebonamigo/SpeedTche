// N4, os sons do Pagamento (docs/ondas/N/N4.md §4.3): moeda caindo, o tique da contagem do número e o sino do "Já dá para".
// Provados por parâmetros (frequência, duração, instante) com o AudioContext de mentira, sem placa de som.
import { describe, expect, it } from 'vitest';
import { createSfx } from '../src/audio/sfx';
import { fakeAudio } from './audio-fake';

function play(kind: Parameters<ReturnType<typeof createSfx>['ui']>[0]) {
  const f = fakeAudio();
  const sfx = createSfx(f.ctx, f.dest, f.dest);
  sfx.ui(kind);
  const tones = f.oscillators.map((o) => ({ freq: o.frequency.calls[0]?.value ?? 0, at: o.frequency.calls[0]?.at ?? 0, dur: (o.stoppedAt ?? 0) - (o.startedAt ?? 0) }));
  return { f, tones };
}

describe('sons do pagamento', () => {
  it('a moeda caindo é um "tim" metálico: pelo menos duas notas agudas, a segunda mais alta', () => {
    const { tones } = play('coin');
    expect(tones.length).toBeGreaterThanOrEqual(2);
    expect(tones.every((t) => t.freq >= 1000)).toBe(true);
    const sorted = [...tones].sort((a, b) => a.at - b.at);
    expect(sorted[sorted.length - 1].freq).toBeGreaterThan(sorted[0].freq);
  });
  it('o tique da contagem é um só e curto (toca várias vezes por segundo)', () => {
    const { tones } = play('count');
    expect(tones).toHaveLength(1);
    expect(tones[0].dur).toBeLessThanOrEqual(0.12);
    expect(tones[0].dur).toBeGreaterThan(0);
  });
  it('o sino do "Já dá para" sobe em pelo menos três notas', () => {
    const { tones } = play('chime');
    expect(tones.length).toBeGreaterThanOrEqual(3);
    const sorted = [...tones].sort((a, b) => a.at - b.at);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].freq).toBeGreaterThanOrEqual(sorted[i - 1].freq);
  });
  it('os sons de menu de sempre seguem como eram', () => {
    expect(play('move').tones).toHaveLength(1);
    expect(play('confirm').tones).toHaveLength(2);
    expect(play('back').tones).toHaveLength(1);
  });
});
