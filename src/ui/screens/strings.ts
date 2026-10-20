// Textos das Opções que nasceram depois do `src/ui/strings.ts` (namespace `ui`, que as outras frentes também editam): o nível
// Ultra da qualidade gráfica (onda L, L2) e o interruptor dos carros em alta definição (V9). O `registerStrings` junta com o que o namespace já tem.
import { registerStrings } from '../../i18n';

registerStrings('ui', {
  pt: { 'options.quality.ultra': 'Ultra', 'options.fps30': '30 fps (3-4 jog., Média)', 'options.fps30.hint': 'Trava em 30 quadros por segundo na qualidade Média com 3 ou 4 jogadores.',
    'options.heroCars': 'Carros em HD', 'options.heroCars.auto': 'Auto (Alta e Ultra)', 'options.heroCars.on': 'Ligado', 'options.heroCars.off': 'Desligado',
    'options.heroCars.hint': 'O carro dos jogadores, perto da câmera, ganha um casco bem mais detalhado (traseira, faróis, rodas). Automático: só nas qualidades Alta e Ultra. Nunca na Baixa nem com "Reduzir efeitos".' },
  en: { 'options.quality.ultra': 'Ultra', 'options.fps30': '30 fps (3-4 players, Medium)', 'options.fps30.hint': 'Locks to 30 frames per second on Medium quality with 3 or 4 players.',
    'options.heroCars': 'HD cars', 'options.heroCars.auto': 'Auto (High and Ultra)', 'options.heroCars.on': 'On', 'options.heroCars.off': 'Off',
    'options.heroCars.hint': 'The players\' cars, up close to the camera, get a much more detailed body (rear end, headlights, wheels). Auto: only on High and Ultra quality. Never on Low or with "Reduce effects".' },
});
