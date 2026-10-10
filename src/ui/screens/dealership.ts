// A Concessionária (onda N, N2; pedido do dono, 09/10/2026): tela própria no menu, separada da Garagem. Mostra os carros à venda girando
// no palco 3D, com o preço e o "faltam", o antes → depois dos atributos, a pintura para experimentar e a compra, que vira revelação
// (holofote, capa saindo, faróis, confete e "NOVO!"). É a mesma fábrica de painel da garagem no outro modo (garage.ts): o foco, o
// teclado, o controle, a mensagem e o layout andam juntos. A compra é a de sempre (`buyCar` de src/core/career.ts): só a apresentação mudou.
import { carScreen } from './garage';
import type { ScreenFactory } from './common';

export const dealershipScreen: ScreenFactory = (api) => carScreen(api, 'dealership');
