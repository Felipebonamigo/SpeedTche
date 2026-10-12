// Textos das Opções que nasceram depois do `src/ui/strings.ts` (namespace `ui`, que as outras frentes também editam): o nível
// Ultra da qualidade gráfica (onda L, L2). O `registerStrings` junta com o que o namespace já tem.
import { registerStrings } from '../../i18n';

registerStrings('ui', {
  pt: { 'options.quality.ultra': 'Ultra', 'options.fps30': '30 fps (3-4 jog., Média)', 'options.fps30.hint': 'Trava em 30 quadros por segundo na qualidade Média com 3 ou 4 jogadores.' },
  en: { 'options.quality.ultra': 'Ultra', 'options.fps30': '30 fps (3-4 players, Medium)', 'options.fps30.hint': 'Locks to 30 frames per second on Medium quality with 3 or 4 players.' },
});
