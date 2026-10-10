// Textos da Concessionária (onda N, N2): o item do menu, a tela e o selo "NOVO!" da revelação da compra. Namespace próprio, como
// `src/voice/strings.ts`: o `src/ui/strings.ts` é editado por outras frentes.
import { registerStrings } from '../i18n';

registerStrings('dealership', {
  pt: {
    menu: 'Concessionária',
    'menu.hint': 'Os carros à venda girando no palco: veja, experimente a cor e compre.',
    title: 'Concessionária',
    novo: 'NOVO!',
  },
  en: {
    menu: 'Dealership',
    'menu.hint': 'The cars for sale on the turntable: look, try a paint and buy.',
    title: 'Dealership',
    novo: 'NEW!',
  },
});
