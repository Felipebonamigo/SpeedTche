// Carregador das amostras embutidas (src/assets/audio/*.ogg): o Vite entrega cada arquivo como data URL (`?inline`), em
// pedaços que só são baixados quando o áudio nasce (o AudioContext só existe depois de um gesto do jogador).
import { SAMPLE_FILES, type SampleId } from './samples';

const FILES = import.meta.glob<string>('../assets/audio/*.ogg', { query: '?inline', import: 'default' });

/** Data URL do arquivo da amostra; rejeita se o arquivo não foi embutido (o banco trata como "não pronta"). */
export function loadSampleUrl(id: SampleId): Promise<string> {
  const load = FILES[`../assets/audio/${SAMPLE_FILES[id]}`];
  return load ? load() : Promise.reject(new Error(`amostra ${id} sem arquivo`));
}
