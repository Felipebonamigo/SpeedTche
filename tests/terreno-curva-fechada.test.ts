// M6 (a): com o traçado do mapa algumas curvas ficam fechadas (raio de 12 a 30 m em 18 pistas). Do lado de dentro da curva as colunas do terreno são presas (`columnDistance`) para não
// dobrarem para trás — mas as presas guardavam a altura do relevo DA COLUNA DE LONGE, e no mesmo ponto do chão apareciam degraus de dezenas de metros: um paredão de terra ao lado
// da pista (visto na captura da rota_66, seg 1005, antes desta correção). Colunas presas na mesma distância têm a mesma altura (a da última coluna livre), e o cenário assenta nela.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTrack } from '../src/core/track';
import { palette } from '../src/render/palette';
import { buildRoadFrame } from '../src/render/roadframe';
import { columnDistance, columnHeight, groundAt, TERRAIN_COLS } from '../src/render/scenery/ground';
import { Terrain } from '../src/render/terrain';
import { turnPerCurve } from '../src/render/units';
import { fakeCanvasDocument } from './canvas-fake';

describe('M6 (a): o terreno do lado de dentro de uma curva fechada', () => {
  let restore = (): void => {};
  beforeEach(() => { restore = fakeCanvasDocument(); });
  afterEach(() => restore());

  // As curvas mais fortes (segmento onde a soma de 20 |curve| é a maior) das pistas que mais se fecham, e uma suave.
  const CASES: Array<[string, number]> = [['rota_66', 1005], ['aracaju', 0], ['ouro_preto', 662], ['floripa', 0], ['copacabana', 1625]];

  function strongest(id: string): number {
    const t = getTrack(id); let best = 0; let at = 0;
    for (let i = 0; i < t.segments.length; i++) { let a = 0; for (let j = 0; j < 20; j++) a += Math.abs(t.segments[(i + j) % t.segments.length].curve); if (a > best) { best = a; at = i; } }
    return at;
  }

  it('nenhum degrau de altura entre colunas na mesma distância (sem paredão), nas curvas mais fechadas', () => {
    const terrain = new Terrain(300);
    const bad: string[] = [];
    for (const [id] of CASES) {
      const track = getTrack(id);
      terrain.setTrack(track, palette(track.def.scenery, track.def.timeOfDay), `${id}:wall`);
      const frame = buildRoadFrame(track, strongest(id) * 200, 30, 120);
      terrain.update(frame, track, 0, new THREE.Vector3(0, 1, 0), 0);
      const strips = terrain.group.children.slice(0, 2) as THREE.Mesh[];
      const lanes = TERRAIN_COLS.length;
      for (const strip of strips) {
        const pos = strip.geometry.attributes.position;
        for (let j = 0; j < frame.count; j++) {
          for (let l = 0; l + 1 < lanes; l++) {
            const a = j * lanes + l; const b = a + 1;
            const run = Math.hypot(pos.getX(a) - pos.getX(b), pos.getZ(a) - pos.getZ(b));
            const rise = Math.abs(pos.getY(a) - pos.getY(b));
            if (run < 0.25 && rise > 0.3) bad.push(`${id} ponto ${j} faixa ${l}: ${rise.toFixed(1)} m de degrau em ${run.toFixed(2)} m`);
          }
        }
      }
    }
    expect(bad.slice(0, 8), `${bad.length} degraus`).toEqual([]);
    terrain.dispose();
  }, 60000);

  it('o cenário assenta na mesma altura: columnHeight das colunas presas é a da última coluna livre, e groundAt não salta', () => {
    for (const [id] of CASES) {
      const track = getTrack(id);
      const turn = turnPerCurve(track);
      const i = strongest(id) + 5;
      const seg = track.segments[i];
      for (const side of [-1, 1]) {
        let free = 0;
        for (let c = 0; c < TERRAIN_COLS.length; c++) {
          const pinned = columnDistance(seg, side, c, turn) < TERRAIN_COLS[c];
          if (!pinned) free = c;
          else expect(columnHeight(track, seg, side, c), `${id} #${i} lado ${side} coluna ${c}`).toBeCloseTo(columnHeight(track, seg, side, free), 9);
        }
        // Do lado de fora de uma curva ou dentro, a altura do chão varia contínua com a distância (nenhum salto > 2 m entre 1 m e outro).
        let prev = groundAt(track, seg, side, 0);
        for (let d = 1; d <= 300; d++) { const h = groundAt(track, seg, side, d); expect(Math.abs(h - prev), `${id} #${i} lado ${side} d=${d}`).toBeLessThan(6); prev = h; }
      }
    }
  });
});
