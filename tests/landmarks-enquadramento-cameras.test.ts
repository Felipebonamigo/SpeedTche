// Enquadramento dos marcos turísticos POR CÂMERA (nc/cameras). O layout dos marcos é posto uma vez por pista, com a câmera Baixa (a de sempre:
// `tests/landmarks-enquadramento.test.ts` segue medindo ela, sem mudar), mas o jogador agora escolhe a câmera, e a padrão é a Alta, de FOV
// estreito (36° contra 62°). Este teste MEDE as 4 câmeras sobre os mesmos 292 marcos das 109 pistas (mínimos de `LANDMARK_SIGHT_MIN`; litoral e
// cidade 2,5 s) e trava o resultado, para a próxima mudança de pose não piorar calada.
// Medido em 14/10/2026 (segundos à vista, média / abaixo do mínimo / nunca vistos): Baixa 4,37 / 36 / 3 · Alta 3,09 / 103 / 9 ·
// Capô 4,51 / 33 / 2 · Frente 4,66 / 31 / 1. A Alta perde ~1,3 s por marco, quase todos os de lado (o FOV estreito os tira do quadro);
// Capô e Frente (FOV 72 e 78) veem igual ou melhor que a Baixa. NÃO se refez o layout para a Alta: mudaria o cenário das 109 pistas.
import { describe, expect, it } from 'vitest';
import { placeOf } from '../src/core/data/places';
import { getTrack, TRACKS } from '../src/core/track';
import { CAMERA_MODES, type CameraMode } from '../src/render/camera-base';
import { landmarkSight, sceneryLayout } from '../src/render/scenery/layout';
import { LANDMARK_SIGHT_MIN } from '../src/render/scenery/sight';

const ROADSIDE_BUILDINGS: ReadonlySet<string> = new Set(['coast', 'city_night']);

interface Tally { n: number; sum: number; below: number; zero: number }

function measure(): Record<CameraMode, Tally> {
  const out = Object.fromEntries(CAMERA_MODES.map((m) => [m, { n: 0, sum: 0, below: 0, zero: 0 }])) as Record<CameraMode, Tally>;
  for (const def of TRACKS) {
    if (!(placeOf(def.id)?.landmarks.length)) continue;
    const track = getTrack(def.id);
    const layout = sceneryLayout(track);
    for (const m of CAMERA_MODES) {
      for (const r of landmarkSight(track, layout, m)) {
        const min = ROADSIDE_BUILDINGS.has(def.scenery) ? 2.5 : LANDMARK_SIGHT_MIN[r.place];
        const t = out[m];
        t.n++; t.sum += r.seen;
        if (r.seen < min) t.below++;
        if (r.seen === 0) t.zero++;
      }
    }
  }
  return out;
}

describe('enquadramento dos marcos por câmera', () => {
  it('a Alta vê menos marcos de lado que a Baixa (medido e travado); Capô e Frente veem igual ou melhor', () => {
    const t = measure();
    for (const m of CAMERA_MODES) expect(t[m].n, m).toBe(292);
    const mean = (m: CameraMode) => t[m].sum / t[m].n;
    // Baixa: as exceções já listadas em tests/landmarks-enquadramento.test.ts (36 instâncias abaixo do mínimo, 3 nunca vistas).
    expect(t.low.below).toBeLessThanOrEqual(36);
    expect(t.low.zero).toBeLessThanOrEqual(3);
    expect(mean('low')).toBeGreaterThan(4.3);
    // Alta: pior, e é o preço do FOV 36 (reportado ao dono). Travado para não piorar.
    expect(t.high.below).toBeLessThanOrEqual(103);
    expect(t.high.zero).toBeLessThanOrEqual(9);
    expect(mean('high')).toBeGreaterThan(3.0);
    expect(mean('high')).toBeLessThan(mean('low'));
    // Presas ao carro (FOV largo): nunca pior que a Baixa.
    for (const m of ['hood', 'bumper'] as const) {
      expect(t[m].below, m).toBeLessThanOrEqual(t.low.below);
      expect(t[m].zero, m).toBeLessThanOrEqual(t.low.zero);
      expect(mean(m), m).toBeGreaterThanOrEqual(mean('low') - 0.05);
    }
  }, 900000);
});
