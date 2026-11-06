// Os alvos dos desenhos em cartum (scripts/track-art.ts; docs/PISTAS.md, "Desenhos em cartum"; docs/ondas/K.md, K0, T2):
// cada desenho fecha, é horário, não se cruza, não encosta em si mesmo e põe a largada onde o box cabe.
import { describe, expect, it } from 'vitest';
import { ART } from '../scripts/track-art';
import { fitArt, selfCrossings } from '../scripts/shape-to-track';

type V = [number, number];

/**
 * As três rodadas da trilha D (CRONOGRAMA, "Trilhas contínuas"): estado e comprimento da volta (o `segments` de SHAPES; a
 * cuia, `--current`). A rodada 1 saiu na K (9 + o Cristo); as rodadas 2 e 3 (17) entram para a O1.
 */
const ROUNDS: Readonly<Record<string, { state: string; segments: number }>> = {
  // rodada 1
  copacabana: { state: 'RJ', segments: 1800 },
  sampa_noite: { state: 'SP', segments: 1850 },
  pampulha: { state: 'MG', segments: 2050 },
  convento_penha: { state: 'ES', segments: 1980 },
  floripa: { state: 'SC', segments: 2010 },
  cuia_gaucha: { state: 'RS', segments: 1970 },
  curitiba: { state: 'PR', segments: 1990 },
  brasilia: { state: 'DF', segments: 2120 },
  caldas_novas: { state: 'GO', segments: 1990 },
  bonito: { state: 'MS', segments: 2020 },
  // rodada 2
  transpantaneira: { state: 'MT', segments: 2130 },
  porto_seguro: { state: 'BA', segments: 1870 },
  aracaju: { state: 'SE', segments: 1790 },
  maceio: { state: 'AL', segments: 1760 },
  olinda: { state: 'PE', segments: 1770 },
  campina_grande: { state: 'PB', segments: 1820 },
  cajueiro_pirangi: { state: 'RN', segments: 2030 },
  canoa_quebrada: { state: 'CE', segments: 1950 },
  serra_capivara: { state: 'PI', segments: 1890 },
  // rodada 3
  sao_luis: { state: 'MA', segments: 2070 },
  belem: { state: 'PA', segments: 1800 },
  manaus: { state: 'AM', segments: 2110 },
  macapa: { state: 'AP', segments: 1750 },
  monte_roraima: { state: 'RR', segments: 2040 },
  porto_velho: { state: 'RO', segments: 1960 },
  rio_branco: { state: 'AC', segments: 2080 },
  palmas: { state: 'TO', segments: 1780 },
};

/** Comprimento acumulado ao longo do traço fechado: cum[i] até o ponto i; cum[n] é o perímetro (com o trecho de fechamento). */
function arcLengths(p: V[]): number[] {
  const cum = [0];
  for (let i = 1; i <= p.length; i++) {
    const a = p[i - 1]; const b = p[i % p.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return cum;
}

describe('desenhos em cartum (scripts/track-art.ts)', () => {
  it('as três rodadas estão desenhadas: os 27 desenhos, um por estado', () => { // T2b (K) e O1
    expect(Object.keys(ART).sort()).toEqual(Object.keys(ROUNDS).sort());
  });

  for (const id of Object.keys(ART)) {
    describe(id, () => {
      const art = ART[id](); // ART guarda funções que devolvem o desenho
      const p = art.pts as V[];
      const n = p.length;

      it('o estado bate', () => {
        expect(art.state).toBe(ROUNDS[id]?.state);
      });

      it('fecha: o último ponto fica a menos de 1 do primeiro', () => {
        expect(Math.hypot(p[0][0] - p[n - 1][0], p[0][1] - p[n - 1][1])).toBeLessThan(1);
      });

      it('é horário na tela (y para baixo): a soma do shoelace é positiva', () => {
        let s = 0;
        for (let i = 0; i < n; i++) { const a = p[i]; const b = p[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; }
        expect(s).toBeGreaterThan(0);
      });

      it('não se cruza', () => {
        expect(selfCrossings(p)).toBe(0);
      });

      it('as partes não encostam: pontos a mais de 3% do perímetro um do outro (ao longo do traço) ficam a ≥ 3', () => {
        const cum = arcLengths(p);
        const perim = cum[n];
        let gap = Infinity;
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const along = cum[j] - cum[i];
            if (Math.min(along, perim - along) <= 0.03 * perim) continue; // distância circular: o traço é fechado
            gap = Math.min(gap, Math.hypot(p[i][0] - p[j][0], p[i][1] - p[j][1]));
          }
        }
        expect(gap).toBeGreaterThanOrEqual(3);
      });

      it('o box cabe: fitArt não avisa do box nem da largada', () => {
        const fit = fitArt(art, ROUNDS[id]?.segments ?? 2000, 3, 6);
        expect(fit.warnings.filter((w) => /box|largada/.test(w))).toEqual([]);
      });
    });
  }
});
