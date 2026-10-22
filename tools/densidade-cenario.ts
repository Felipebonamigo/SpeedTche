// V22/F4: conta os triângulos de cenário que o runtime (`scenery/runtime.ts`, `update`) poria à vista, SEM GL: para cada câmera de amostra, soma os
// triângulos de cada instância da janela que passa nos mesmos filtros do desenho (alcance `maxAhead × lodScale`, nota `rank` ≤ detalhe da qualidade,
// modelo de longe a partir de `farFrom × lodScale`, e o enfeite "farto" `lush` só com 1–2 jogadores). Não vê o corte de câmera (frustum), então
// SUPERESTIMA o número absoluto: serve para a DIFERENÇA entre dois estados do cenário (antes × depois) e para o teste de densidade por jogadores
// (`tests/vegetacao-f4.test.ts`); o valor real do gate é `node tools/folga-gate.mjs`.
//   npx tsx tools/densidade-cenario.ts [pista,pista] [saida.json]
import { writeFileSync } from 'node:fs';
import { getTrack } from '../src/core/track';
import { getModel } from '../src/render/scenery/catalog';
import { lushScenery, sceneryLayout, type Layout } from '../src/render/scenery/layout';

/** Detalhe do runtime por qualidade (`(count - 1) / FULL_WINDOW` limitado a [0,5, 1]): a Baixa vê 140 à frente, a Média 200, a Alta 260. */
export const DETAIL: Record<'low' | 'medium' | 'high', number> = { low: 0.5, medium: 0.7, high: 1 };
/** Segmentos à frente por qualidade (`renderer.ts` AHEAD). */
export const AHEAD: Record<'low' | 'medium' | 'high', number> = { low: 140, medium: 200, high: 260 };
const BEHIND = 6;

const triCache = new Map<string, number>();
function trisOf(id: string): number {
  let t = triCache.get(id);
  if (t === undefined) { t = 0; for (const p of getModel(id).parts) t += p.geometry.attributes.position.count / 3; triCache.set(id, t); }
  return t;
}

/** Triângulos de cenário (cena, sem o passe de sombra) à vista de uma câmera no segmento `cam`, para a qualidade e o número de jogadores. */
export function visibleTriangles(layout: Layout, cam: number, quality: 'low' | 'medium' | 'high', viewports: number): number {
  const n = layout.bySeg.length;
  const detail = DETAIL[quality]; const lodScale = viewports >= 2 ? 0.5 : 1; const lush = lushScenery(viewports);
  let tris = 0;
  for (let a = -BEHIND; a < AHEAD[quality]; a++) {
    const list = layout.bySeg[((cam + a) % n + n) % n];
    for (const p of list) {
      if (a > p.maxAhead * lodScale || p.rank > detail || (p.lush && !lush)) continue;
      const useFar = p.far >= 0 && a >= p.farFrom * lodScale;
      tris += trisOf(layout.models[useFar ? p.far : p.model]);
    }
  }
  return tris;
}

/** Média em `samples` câmeras igualmente espaçadas na pista. */
export function meanVisibleTriangles(layout: Layout, quality: 'low' | 'medium' | 'high', viewports: number, samples = 24): number {
  const n = layout.bySeg.length; let sum = 0;
  for (let k = 0; k < samples; k++) sum += visibleTriangles(layout, Math.floor((k * n) / samples), quality, viewports);
  return sum / samples;
}

if (process.argv[1]?.endsWith('densidade-cenario.ts')) {
  const ids = (process.argv[2] ?? 'copacabana,sampa_noite,foz_do_iguacu,serra_do_navio,passo_alpino,kruger,monte_fuji,xingo').split(',');
  const out: Record<string, number> = {};
  for (const id of ids) {
    const layout = sceneryLayout(getTrack(id));
    for (const q of ['low', 'medium', 'high'] as const) for (const v of [1, 2, 3, 4]) out[`${id}/${q}/${v}p`] = Math.round(meanVisibleTriangles(layout, q, v));
  }
  console.log(Object.entries(out).map(([k, v]) => `${k}: ${v}`).join('\n'));
  if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
}
