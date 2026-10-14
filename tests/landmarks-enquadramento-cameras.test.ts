// Enquadramento dos marcos turísticos POR CÂMERA (nc/cameras). O layout dos marcos é posto uma vez por pista, com a câmera Baixa (a de sempre:
// `tests/landmarks-enquadramento.test.ts` segue medindo ela, sem mudar), mas o jogador agora escolhe a câmera, e a padrão é a Alta, de FOV
// estreito (36° contra 62°). Este teste MEDE as 4 câmeras sobre os mesmos 292 marcos das 109 pistas (mínimos de `LANDMARK_SIGHT_MIN`; litoral e
// cidade 2,5 s) e trava o resultado, para a próxima mudança de pose não piorar calada.
// Medido em 14/10/2026 (segundos à vista, média / abaixo do mínimo / nunca vistos): Baixa 4,37 / 36 / 3 · Capô 4,51 / 33 / 2 · Frente 4,66 / 31 / 1 ·
// Alta por FOV: 36 → 3,09 / 103 / 9 · 40 → 3,33 / 83 / 7 · 44 → 3,54 / 70 / 5 · 46 → 3,64 / 66 / 4 · 50 → 3,82 / 52 / 3 · 54 → 3,98 / 46 / 3 · 58 → 4,13 / 41 / 3.
// Nem o recuo (back), nem a mira (lookY, lookAhead) mexem na conta: só o FOV. A Alta ficou em 54°. (Com 36° ela perdia ~1,3 s por marco, quase todos os de lado;
// Capô e Frente (FOV 72 e 78) veem igual ou melhor que a Baixa.) NÃO se refez o layout para a Alta: mudaria o cenário das 109 pistas.
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
  it('a Alta fica a no máximo 1,3× a Baixa em marcos abaixo do mínimo e com 4 nunca vistos (FOV 54); Capô e Frente veem igual ou melhor', () => {
    const t = measure();
    for (const m of CAMERA_MODES) expect(t[m].n, m).toBe(292);
    const mean = (m: CameraMode) => t[m].sum / t[m].n;
    // Baixa: as exceções já listadas em tests/landmarks-enquadramento.test.ts (36 instâncias abaixo do mínimo, 3 nunca vistas).
    expect(t.low.below).toBeLessThanOrEqual(36);
    expect(t.low.zero).toBeLessThanOrEqual(3);
    expect(mean('low')).toBeGreaterThan(4.3);
    // Alta: o FOV foi aberto de 36 para 54 para trazer os marcos de volta (36 dava 103 abaixo do mínimo e 9 nunca vistos). Meta: no máximo 1,3× a Baixa, e 4 nunca vistos.
    expect(t.high.below).toBeLessThanOrEqual(Math.floor(1.3 * 36));
    expect(t.high.zero).toBeLessThanOrEqual(4);
    expect(mean('high')).toBeGreaterThan(3.9);
    // Presas ao carro (FOV largo): nunca pior que a Baixa.
    for (const m of ['hood', 'bumper'] as const) {
      expect(t[m].below, m).toBeLessThanOrEqual(t.low.below);
      expect(t[m].zero, m).toBeLessThanOrEqual(t.low.zero);
      expect(mean(m), m).toBeGreaterThanOrEqual(mean('low') - 0.05);
    }
  }, 900000);
});
