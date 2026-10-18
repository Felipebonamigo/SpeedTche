// Traçado das pistas-vitrine (V11, item 5): em que parte de cada pista a câmera Alta MOSTRA a curva à frente? Só leitura: o traçado é do núcleo e não se toca aqui.
//   npx tsx tools/tracado-vitrine.ts [pista ...]      (sem argumentos: as 6 pistas da galeria)
// Para cada segmento (o carro no começo dele) monta a janela de 160 m à frente (`buildRoadFrame`, a mesma da câmera) e mede onde o EIXO da pista a 120 m cai na tela
// de 1280 × 720 da câmera Alta (FOV 54): deslocamento lateral em px do centro. Classes: RETA (< 60 px: a pista é uma fita reta), CURVA VISÍVEL (60 a 420 px: a curva à
// frente aparece inteira e ainda dentro do quadro), FECHADA (> 420 px: sai do quadro, a câmera não segue a curva). Imprime a fração de cada classe e o maior trecho
// contínuo de CURVA VISÍVEL (segmentos e metros) — o que a galeria e os marcos "à vista" podem usar de vitrine.
import { getTrack } from '../src/core/track';
import { CAMERA_POSES } from '../src/render/camera-base';
import { buildRoadFrame } from '../src/render/roadframe';
import { SEGMENT_M } from '../src/render/units';

const DEFAULT = ['copacabana', 'paraty', 'canion', 'sampa_noite', 'monte_fuji', 'xingo'];
/** O segmento de cada pista na galeria (tools/galeria/nucleo.ts): a classe dele e o trecho de curva visível mais perto. */
const GALERIA: Record<string, number> = { copacabana: 300, paraty: 90, canion: 130, sampa_noite: 970, monte_fuji: 80, xingo: 110 };
const names = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;
const AHEAD_M = 120; const SPAN_SEGS = 160 / SEGMENT_M;
const cam = CAMERA_POSES.high;
const F = 360 / Math.tan((cam.baseFov * Math.PI) / 360); // focal em px (FOV vertical, 720 px)

type Cls = 'reta' | 'curva' | 'fechada';
const cls = (px: number): Cls => (px < 60 ? 'reta' : px <= 420 ? 'curva' : 'fechada');

for (const id of names) {
  const track = getTrack(id);
  const n = track.segments.length;
  const frame = buildRoadFrame(track, 0, 0, Math.ceil(SPAN_SEGS) + 2);
  const count = { reta: 0, curva: 0, fechada: 0 };
  const classes: Cls[] = [];
  const offs: number[] = [];
  for (let i = 0; i < n; i++) {
    buildRoadFrame(track, i * 200 + 1, 0, Math.ceil(SPAN_SEGS) + 2, frame);
    // O ponto do eixo a AHEAD_M metros À FRENTE do carro, medido ao longo do eixo (a câmera olha −Z, o eixo da pista é a curva).
    let along = 0; let j = 0;
    while (j + 1 < frame.count && along < AHEAD_M) { along += Math.hypot(frame.px[j + 1] - frame.px[j], frame.pz[j + 1] - frame.pz[j]); j++; }
    const dx = frame.px[j] - frame.px[0]; const dz = -(frame.pz[j] - frame.pz[0]) + cam.back; // lateral e à frente da câmera (atrás do carro `back` m)
    const px = Math.abs(F * (dx / Math.max(1, dz)));
    const c = cls(px); classes.push(c); count[c]++; offs.push(px);
  }
  // Maior trecho contínuo de CURVA VISÍVEL (a pista é fechada: dá a volta).
  let best = 0; let run = 0;
  for (let k = 0; k < n * 2; k++) { if (classes[k % n] === 'curva') { run++; best = Math.max(best, Math.min(run, n)); } else run = 0; }
  const pct = (v: number): string => `${((100 * v) / n).toFixed(0)}%`;
  console.log(`${id.padEnd(14)} ${String(n).padStart(5)} seg · reta ${pct(count.reta).padStart(4)} · curva visível ${pct(count.curva).padStart(4)} · fechada ${pct(count.fechada).padStart(4)} · maior trecho de curva visível ${best} seg (${best * SEGMENT_M} m) · desvio mediano ${[...offs].sort((a, b) => a - b)[n >> 1].toFixed(0)} px`);
  const g = GALERIA[id];
  if (g !== undefined) {
    let near = -1;
    for (let d = 0; d < n / 2 && near < 0; d++) for (const k of [g + d, g - d]) if (near < 0 && classes[((k % n) + n) % n] === 'curva') near = ((k % n) + n) % n;
    console.log(`${''.padEnd(14)} galeria seg ${g}: ${classes[g]} (${offs[g].toFixed(0)} px) · curva visível mais perto: seg ${near} (${near < 0 ? '-' : `${((((near - g + n / 2) % n) + n) % n - n / 2) * SEGMENT_M} m`}, + = à frente)`);
  }
}
