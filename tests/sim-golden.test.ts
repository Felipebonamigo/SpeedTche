// Trava de comportamento da simulação: a impressão digital de corridas inteiras (hash de cada tick, todos
// os eventos e o estado completo) tem de bater com o valor fixo abaixo. Existe para as otimizações de CPU
// (docs/DESEMPENHO.md): otimizar o stepRace não pode mudar um único bit da corrida. Os valores foram
// gravados no commit 1605294, antes de qualquer otimização, e regravados em 28/09 depois do co-op afinado
// (passo 1.4: empurrão, vácuo de equipe, elástico, box da IA) — com e sem a otimização deram o mesmo valor.
// Regravados na onda F (30/09), com os dois lados juntos: a IA sorteia entre os 7 carros livres (eram 4), e a
// colisão ficou do tamanho do carro na tela, com o grid mais espaçado e a IA que escolhe o lado da ultrapassagem e
// não esterça para dentro de quem está do lado (docs/FISICA.md). Só o contra-relógio ficou igual — um carro sozinho
// não bate em ninguém e não tem IA. Por isso PHYSICS_REVISION não subiu: ela anda presa a esse hash, e as constantes
// novas já renovam sozinhas a impressão de toda volta (fantasmas e recordes antigos viram "outra versão").
//
// Onda M, M1 (derrapagem, 10/10/2026): as 8 impressões mudaram, por dois motivos que o relatório da M1 separa (docs/ondas/M/M1.md, §7).
// (1) Os 4 campos novos do CarState (driftDir, driftTicks, driftCharge, driftBoostTicks) entram no serializeRace e no hashRace que o
// fingerprintScenario mistura: mudam TODAS, inclusive o contra-relógio. Conferido tick a tick contra o 2ce0f48 com o hash "legado"
// (a fórmula antiga do hashRace): contra-relogio, solo-sem-assistencias (Copacabana) e versus-cambio-manual (Noite em Sampa) têm o
// hash legado IDÊNTICO nos 7768, 7812 e 9520 ticks — nelas a IA nunca derrapa (curvas de menos de 18 segmentos) e quem não derrapa
// anda bit a bit como antes. (2) Nas outras 5 a IA passa a derrapar nas curvas fortes compridas: o hash legado diverge no tick da
// primeira derrapagem de uma IA (coop4-tudo 848, escolta 887, revezamento 939, tomada-pela-ia 859, sem-personalidades 641).
// PHYSICS_REVISION subiu de 1 para 2 junto com o contra-relógio (o teste lá embaixo prende os dois).
//
// Onda N, N1 (nitro que se ganha e largada-foguete, 10/10/2026): as 8 impressões mudaram de novo (docs/ondas/N/N1.md, §7), por três motivos.
// (1) Os campos novos do CarState (nitroMeter no lugar do nitroLeft, throttleHeld, launch, draftTicks, gainLock) entram no serializeRace e no hashRace.
// (2) O nitro larga com 1 carga em vez de 3 e enche com as fontes: o piloto de roteiro aperta o nitro a cada 700 ticks, e o 2º aperto (tick 1400) já
// é negado — o contra-relógio (sem IA, sem sorteio, o rng nunca diverge) é igual ao de 640538f até o tick 1400 e muda dali. (3) O sorteio da
// largada-foguete (um por IA, no tick 210 = JÁ) anda o rng das 7 corridas com IA: o rng diverge no tick 210 em todas, e o primeiro carro com
// estado diferente é o da primeira fila que acertou o arranque (tick 210 em coop4-tudo, revezamento e solo; 231 na tomada-pela-ia) ou a primeira
// decisão que sorteia depois disso (248 na escolta, 432 no versus, 598 sem-personalidades). Conferido tick a tick contra o 640538f
// (scratch/n1-trace.ts, fora do git). PHYSICS_REVISION 2 → 3 junto com o contra-relógio.
//
// Mudou a jogabilidade DE PROPÓSITO (constante, IA, física)? Aí o hash muda e é esperado: rode
// `npx tsx scripts/perf-sim.ts --fingerprints`, confira que só mudaram as corridas que deviam e atualize.
import { describe, expect, it } from 'vitest';
import { fingerprintScenario, GOLDEN_SCENARIOS } from '../scripts/sim-scenarios';
import { SEGMENT_LENGTH } from '../src/core/constants';
import { wrappedDelta } from '../src/core/sim/collisions';
import { getTrack } from '../src/core/track';
import { fmodFast, maxCurveAhead, segmentAt } from '../src/core/track/builder';
import { PHYSICS_REVISION } from '../src/game/content-version';

// Pistas com desenho (04/10, docs/PISTAS.md): Copacabana (o Cristo) e Noite em Sampa (o MASP) ganharam traçado novo —
// só as duas corridas delas mudaram; as outras seis deram o mesmo bit.
// Onda K (K5): Copacabana com o Cristo em traço de cartum (`bend`), e as placas de curva só em curva forte de ≥ 12
// segmentos — Noite em Sampa (quinas de 8–9) perdeu as placas. Só as duas corridas delas mudaram.
const EXPECTED: Record<string, { fingerprint: string; ticks: number }> = {
  'solo-sem-assistencias': { fingerprint: '5c5c0457', ticks: 8085 },
  'coop4-tudo': { fingerprint: '7082fd5b', ticks: 7815 },
  'versus-cambio-manual': { fingerprint: '4879fcd7', ticks: 9076 },
  escolta: { fingerprint: 'e4b941e7', ticks: 8491 },
  revezamento: { fingerprint: 'c4458cea', ticks: 11554 },
  'tomada-pela-ia': { fingerprint: '1c1efad5', ticks: 8952 },
  'contra-relogio': { fingerprint: 'def5c918', ticks: 7786 },
  'sem-personalidades': { fingerprint: '2fc453a0', ticks: 9942 },
};

describe('corridas de referência (impressão digital fixa)', () => {
  it('toda corrida de referência tem valor gravado', () => {
    expect(GOLDEN_SCENARIOS.map((s) => s.name).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const s of GOLDEN_SCENARIOS) {
    it(`${s.name}: a corrida inteira é bit a bit a mesma`, () => {
      const run = fingerprintScenario(s);
      expect(run.finished).toBe(true);
      expect({ fingerprint: run.fingerprint, ticks: run.ticks }).toEqual(EXPECTED[s.name]);
    }, 120_000);
  }

  // O contra-relógio de referência é o carro sozinho na pista (sem IA): se o hash dele mudou, a física de quem pilota
  // mudou, e um fantasma ou recorde gravado antes pode ter ficado impossível. As constantes, o carro e o traçado já
  // entram na impressão da volta; mudança só de CÓDIGO não entra — por isso a revisão manual anda presa a este hash.
  const PHYSICS_REVISION_AT = { revision: 3, contraRelogio: 'def5c918' };
  it('a revisão da física dos fantasmas e recordes anda junto com o contra-relógio de referência', () => {
    expect(
      { revision: PHYSICS_REVISION, contraRelogio: EXPECTED['contra-relogio'].fingerprint },
      'o contra-relógio mudou? suba PHYSICS_REVISION em src/game/content-version.ts e grave o par novo aqui (docs/FANTASMA.md)',
    ).toEqual(PHYSICS_REVISION_AT);
  });
});

describe('atalhos sem fmod (docs/DESEMPENHO.md) dão o mesmo bit que as fórmulas originais', () => {
  const track = getTrack('copacabana');
  const len = track.length;
  const n = track.segments.length;
  // Bordas (±0, ±len, 2·len, o maior double abaixo de len) e uma varredura densa com frações quebradas.
  const below = (v: number) => v - v * Number.EPSILON;
  const values = [0, -0, len, -len, 2 * len, -2 * len, below(len), -below(len), below(2 * len), 3.5 * len, -3.5 * len, 1e-300, -1e-300, NaN, Infinity, -Infinity];
  for (let k = -2000; k <= 4000; k++) values.push(k * (len / 997) + k * 0.123456789, k * SEGMENT_LENGTH, k * SEGMENT_LENGTH - 1e-9);

  it('fmodFast(v, len) é v % len', () => {
    expect(values.filter((v) => !Object.is(fmodFast(v, len), v % len))).toEqual([]);
  });

  it('segmentAt e maxCurveAhead escolhem os mesmos segmentos', () => {
    const segmentAtRef = (z: number) => { let zz = z % len; if (zz < 0) zz += len; return track.segments[Math.floor(zz / SEGMENT_LENGTH) % n]; };
    const maxCurveRef = (z: number, count: number) => {
      const start = Math.floor(((z % len) + len) % len / SEGMENT_LENGTH);
      let max = 0;
      for (let i = 0; i < count; i++) { const c = Math.abs(track.segments[(start + i) % n].curve); if (c > max) max = c; }
      return max;
    };
    const wrong: string[] = [];
    for (const z of values) {
      if (!Number.isFinite(z)) continue;
      if (segmentAt(track, z) !== segmentAtRef(z)) wrong.push(`segmentAt ${z}`);
      for (const count of [1, 12, 40, n + 5]) if (!Object.is(maxCurveAhead(track, z, count), maxCurveRef(z, count))) wrong.push(`maxCurveAhead ${z} ${count}`);
    }
    expect(wrong).toEqual([]);
  });

  it('wrappedDelta é a conta original', () => {
    const ref = (a: number, b: number) => { let d = a - b; d %= len; if (d < 0) d += len; if (d > len / 2) d -= len; return d; };
    const wrong: string[] = [];
    for (let i = 0; i < values.length; i += 7) {
      for (let j = 0; j < values.length; j += 13) if (!Object.is(wrappedDelta(values[i], values[j], len), ref(values[i], values[j]))) wrong.push(`${values[i]} ${values[j]}`);
    }
    expect(wrong).toEqual([]);
  });
});
