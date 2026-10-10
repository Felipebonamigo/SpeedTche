// M6 (a): o traçado 3D é o do mapa (docs/ondas/M/M6.md). O minimapa normaliza a soma das curvas para uma volta (360°); o 3D girava um
// ângulo fixo por unidade de curva (`HEADING_PER_CURVE`), então a pista 3D não fechava e a curva dela não era a do mapa. Agora o 3D gira a escala
// de cada pista (`turnPerCurve`), a mesma do minimapa. Só renderização: a física é 1D e não lê o rumo (o `sim-golden` e o
// `batidas-cenario` são a trava disso; aqui só se confere que o núcleo não importa o renderizador).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEGMENT_LENGTH } from '../src/core/constants';
import { getTrack, TRACKS } from '../src/core/track';
import { trackOutline } from '../src/render/minimap';
import { absoluteHeading, buildRoadFrame } from '../src/render/roadframe';
import { HEADING_PER_CURVE, turnPerCurve } from '../src/render/units';
import { syntheticTrack } from './helpers';

const DEG = 180 / Math.PI;
const tracks = TRACKS.map((d) => getTrack(d.id));

/** Menor diferença entre dois ângulos (rad), em (−π, π]. */
function wrap(a: number): number {
  let x = a % (2 * Math.PI);
  if (x > Math.PI) x -= 2 * Math.PI;
  if (x <= -Math.PI) x += 2 * Math.PI;
  return x;
}

describe('M6 (a): o 3D gira a escala do mapa', () => {
  it('o rumo 3D acumulado de cada uma das 109 pistas fecha em 360° ± 2° (o sinal é o da soma das curvas)', () => {
    expect(tracks).toHaveLength(109);
    const bad: string[] = [];
    for (const track of tracks) {
      const n = track.segments.length;
      let sum = 0;
      for (const s of track.segments) sum += s.curve;
      // O RoadFrame de n segmentos à frente da largada: o rumo do último ponto é o giro da volta inteira.
      const frame = buildRoadFrame(track, 0, 0, n);
      const turned = frame.heading[n] * DEG;
      const want = Math.sign(sum) * 360;
      if (Math.abs(turned - want) > 2) bad.push(`${track.def.id}: ${turned.toFixed(1)}° (esperado ${want}°)`);
      // O mesmo pelo rumo absoluto (o que gira o céu, o sol e os anéis de montanha), um instante antes de a volta fechar.
      const abs = absoluteHeading(track, track.length - 1e-6) * DEG;
      if (Math.abs(abs - want) > 2) bad.push(`${track.def.id}: absoluteHeading ${abs.toFixed(1)}° (esperado ${want}°)`);
    }
    expect(bad.slice(0, 12), `${bad.length} fora de 360° ± 2°`).toEqual([]);
  }, 60000);

  it('o ângulo de cada curva do 3D é o do contorno do minimapa (a virada entre cordas vizinhas, ± 1,5°)', () => {
    const bad: string[] = [];
    let compared = 0;
    for (const track of tracks) {
      const n = track.segments.length;
      const step = Math.max(1, Math.floor(n / 400));
      const outline = trackOutline(track, 1000);
      const frame = buildRoadFrame(track, 0, 0, n);
      // Corda j do 3D: do início do segmento j·step ao de (j+1)·step; a do contorno: do ponto j ao j+1. Mesmos ângulos, só que o
      // contorno é normalizado (escala e translação iguais nos dois eixos), então a direção de cada corda é a do 3D (x = direita, z = trás).
      const chord3 = (j: number): number => Math.atan2(-(frame.pz[(j + 1) * step] - frame.pz[j * step]), frame.px[(j + 1) * step] - frame.px[j * step]);
      const chordMap = (j: number): number => Math.atan2(outline[j + 1][1] - outline[j][1], outline[j + 1][0] - outline[j][0]);
      const m = outline.length;
      let worst = 0;
      for (let j = 0; j + 2 < m && (j + 2) * step <= n; j++) {
        // As cordas do 3D têm o eixo de cima = frente (−z); as do contorno têm o de cima = −y (y cresce para baixo): o mesmo giro, sinal trocado no y.
        const turn3 = wrap(chord3(j + 1) - chord3(j));
        const turnMap = wrap(-(chordMap(j + 1) - chordMap(j)));
        compared++;
        worst = Math.max(worst, Math.abs(wrap(turn3 - turnMap)) * DEG);
      }
      if (worst > 1.5) bad.push(`${track.def.id}: a pior curva difere ${worst.toFixed(1)}° do mapa`);
    }
    expect(compared).toBeGreaterThan(40000);
    expect(bad.slice(0, 12), `${bad.length} pistas com uma curva que não é a do mapa`).toEqual([]);
  }, 120000);

  it('a escala é uma só: `turnPerCurve` = 2π / |soma das curvas|, e é a que o minimapa usa', () => {
    for (const track of tracks.filter((_, i) => i % 9 === 0)) {
      let sum = 0;
      for (const s of track.segments) sum += s.curve;
      expect(turnPerCurve(track), track.def.id).toBeCloseTo((2 * Math.PI) / Math.abs(sum), 12);
    }
  });

  it('pista sem curva líquida (reta, ou S que se anula) fica na escala legada: nada a escalar', () => {
    expect(turnPerCurve(syntheticTrack())).toBe(HEADING_PER_CURVE);
    const s = syntheticTrack([{ op: 'curve', length: 100, curve: 3 }, { op: 'curve', length: 100, curve: -3 }, { op: 'straight', length: 200 }]);
    expect(Math.abs(s.segments.reduce((a, g) => a + g.curve, 0))).toBeLessThan(1);
    expect(turnPerCurve(s)).toBe(HEADING_PER_CURVE);
  });

  it('o núcleo não lê a escala do renderizador (a física não muda): nenhum arquivo de src/core importa src/render/units', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!p.endsWith('.ts')) continue;
        if (/from\s+['"][./]*(?:render|\.\.\/render)\/units['"]/.test(readFileSync(p, 'utf8'))) offenders.push(p);
      }
    };
    walk(join(__dirname, '..', 'src', 'core'));
    expect(offenders).toEqual([]);
  });

  it('SEGMENT_LENGTH continua o que o RoadFrame espera (um segmento = uma corda de 4 m)', () => {
    const track = getTrack('copacabana');
    const frame = buildRoadFrame(track, 0, 0, 10);
    expect(Math.hypot(frame.px[1] - frame.px[0], frame.pz[1] - frame.pz[0])).toBeCloseTo(4, 3);
    expect(SEGMENT_LENGTH).toBe(200);
  });
});
