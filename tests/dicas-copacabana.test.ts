// T8 (docs/ondas/T8-pontas.md, item 5): as dicas de frear e derrapar na 1ª corrida, que é a Orla de Copacabana.
// A dica de derrapar usava a regra da IA (`wantsDrift`: trecho de curva ≥ AI_BRAKE_CURVE com 18 segmentos), que a Copacabana do
// traçado M6 não tem (o maior trecho ≥ 1,5 tem 17). Mas a carga da derrapagem sobe com curva ≥ DRIFT_CHARGE_MIN_CURVE (1,0), e
// nesse critério a Copacabana tem trechos de 30 a 57 segmentos: derrapar ali dá turbo, e a dica tem de aparecer.
import { describe, expect, it } from 'vitest';
import { DRIFT_CHARGE_MIN_CURVE, DRIFT_LEVEL_TICKS, DT, SEGMENT_LENGTH } from '../src/core/constants';
import { carStats } from '../src/core/sim/stats';
import { getTrack } from '../src/core/track';
import { NEUTRAL_INPUT, type PlayerInput, type RaceState, type Track } from '../src/core/types';
import { newTipMemory, observeTips, tipOf, type TipId } from '../src/render/hud-tips';
import { human, humanCar, quickRace, skipCountdown, syntheticTrack } from './helpers';

const COPA = getTrack('copacabana');

/** Os trechos (início e tamanho em segmentos) de curva ≥ `min` do mesmo lado. */
function runs(track: Track, min: number): Array<{ start: number; length: number }> {
  const out: Array<{ start: number; length: number }> = [];
  const segs = track.segments;
  for (let i = 0; i < segs.length;) {
    const c = segs[i].curve;
    if (Math.abs(c) < min) { i++; continue; }
    let j = i;
    while (j < segs.length && Math.abs(segs[j].curve) >= min && Math.sign(segs[j].curve) === Math.sign(c)) j++;
    out.push({ start: i, length: j - i });
    i = j;
  }
  return out;
}

/** Põe o carro do assento 0 no segmento `seg`, no meio da pista, a `frac` da máxima, sem derrapar, e diz a dica que aparece (memória nova). */
function tipAt(state: RaceState, track: Track, seg: number, frac: number, input: PlayerInput = NEUTRAL_INPUT): TipId | null {
  const car = humanCar(state, 0);
  Object.assign(car, { z: seg * SEGMENT_LENGTH, x: 0, speed: carStats(car).topSpeed * frac, driftDir: 0, nitroTicks: 0, inPit: false });
  state.events = [];
  const mem = newTipMemory();
  observeTips(mem, state, track, [input]);
  return tipOf(mem, 0)?.id ?? null;
}

function race(carId: string, track: Track = COPA): RaceState {
  const { state } = quickRace({ track, humans: [human(0, 0, carId)], totalCars: 1 });
  skipCountdown(state, track);
  return state;
}

describe('dicas da 1ª corrida na Orla de Copacabana', () => {
  it('a Copacabana tem trechos em que a derrapagem chega ao turbo (carga ≥ nível 1 com curva ≥ DRIFT_CHARGE_MIN_CURVE)', () => {
    const state = race('falcao');
    const perSeg = SEGMENT_LENGTH / (carStats(humanCar(state, 0)).topSpeed * 0.9 * DT); // ticks por segmento a 90%
    const long = runs(COPA, DRIFT_CHARGE_MIN_CURVE).filter((r) => r.length * perSeg >= DRIFT_LEVEL_TICKS[0]);
    expect(long.length).toBeGreaterThan(0);
  });

  it('entrando num desses trechos a 90% da máxima, sem derrapar, o Falcão recebe a dica de derrapar', () => {
    const state = race('falcao');
    const perSeg = SEGMENT_LENGTH / (carStats(humanCar(state, 0)).topSpeed * 0.9 * DT);
    const long = runs(COPA, DRIFT_CHARGE_MIN_CURVE).filter((r) => r.length * perSeg >= DRIFT_LEVEL_TICKS[0] * 1.2);
    const seen = long.map((r) => tipAt(state, COPA, r.start + 1, 0.9));
    expect(seen).toContain('drift');
  });

  it('uma volta inteira da Copacabana, segmento a segmento a 90%: a dica de derrapar aparece', () => {
    const state = race('falcao');
    const tips = new Set<TipId | null>();
    for (let s = 0; s < COPA.segments.length; s++) tips.add(tipAt(state, COPA, s, 0.9));
    expect(tips.has('drift')).toBe(true);
  });

  it('num trecho curto demais para carregar o nível 1, a dica de derrapar não aparece (derrapar ali só perde velocidade)', () => {
    const state = race('falcao');
    const perSeg = SEGMENT_LENGTH / (carStats(humanCar(state, 0)).topSpeed * 0.9 * DT);
    const shortRuns = runs(COPA, DRIFT_CHARGE_MIN_CURVE).filter((r) => r.length * perSeg < DRIFT_LEVEL_TICKS[0]);
    expect(shortRuns.length).toBeGreaterThan(0);
    // O fim de um trecho curto, sem nada do mesmo lado logo depois.
    for (const r of shortRuns) expect(tipAt(state, COPA, r.start + r.length - 1, 0.9)).not.toBe('drift');
  });

  it('frear: na Copacabana o Falcão (o carro do P1) segura todas as curvas na máxima — nível 1, nenhuma freia — e a dica não mente', () => {
    const state = race('falcao');
    for (let s = 0; s < COPA.segments.length; s++) expect(tipAt(state, COPA, s, 1)).not.toBe('brake');
  });

  it('frear: o Trovão (o carro do P2, mais pesado de volante) precisa aliviar na curva mais fechada, e a dica aparece antes dela', () => {
    const state = race('trovao');
    const tips = new Set<TipId | null>();
    for (let s = 0; s < COPA.segments.length; s++) tips.add(tipAt(state, COPA, s, 1));
    expect(tips.has('brake')).toBe(true);
  });

  it('frear: acima da máxima (impulso da derrapagem, vácuo) numa reta sem curva à frente, a dica de frear NÃO aparece', () => {
    const straight = syntheticTrack([{ op: 'straight', length: 600 }]);
    const state = race('falcao', straight);
    expect(tipAt(state, straight, 100, 1.1)).not.toBe('brake');
  });
});
