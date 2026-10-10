// Textos da Concessionária (onda N, N2): o item do menu, a tela e o selo "NOVO!" da revelação da compra. Namespace próprio, como
// `src/voice/strings.ts`: o `src/ui/strings.ts` é editado por outras frentes.
import { registerStrings } from '../i18n';

registerStrings('dealership', {
  pt: {
    menu: 'Concessionária',
    'menu.hint': 'Os carros à venda girando no palco: veja, experimente a cor e compre.',
    title: 'Concessionária',
    novo: 'NOVO!',
    buy: 'COMPRAR',
    hint: '↑↓ escolhe · ←→ troca de carro · Enter compra · Esc volta ao menu',
    viewOnly: 'Comece uma carreira para comprar: aqui você só vê a vitrine.',
    'msg.owned': 'Já está na sua garagem',
  },
  en: {
    menu: 'Dealership',
    'menu.hint': 'The cars for sale on the turntable: look, try a paint and buy.',
    title: 'Dealership',
    novo: 'NEW!',
    buy: 'BUY',
    hint: '↑↓ select · ←→ change car · Enter buys · Esc back to the menu',
    viewOnly: 'Start a career to buy: here you can only look at the showroom.',
    'msg.owned': 'Already in your garage',
  },
});
