# Três direções visuais para o menu (A, B, C)

Pedido do dono: "o nosso menu ainda é muito feio visualmente, precisamos de algo moderno e bonito", e o jogo todo mais bonito que o Horizon Chase Turbo.
Esta página é **para escolher**: nada aqui redesenha o menu de forma definitiva. As três direções são **temas opcionais**, ligados por `?tema=a|b|c`
na URL (atributo `data-tema` em `<html>` e no `#ui`). Sem o parâmetro, o visual atual segue como padrão, byte a byte.

- Código: `src/ui/temas/` (`tema.ts` lê o parâmetro; `tema-base.css` é a parte comum; `tema-a.css`, `tema-b.css`, `tema-c.css`; `tema-icones.css` tem os ícones SVG inline).
  Nenhum arquivo de tela, comportamento, navegação ou estado foi tocado: `menus.ts` só ganhou um `import './temas/tema'`. Marcação nova: nenhuma.
- Como ver: `npx vite` e abrir `http://localhost:5173/?tema=a` (ou `b`, `c`). Folha de componentes com as classes reais: `/tools/menu-estilos-componentes.html?tema=a`.
- Como refazer as imagens: `node scripts/menu-estilos-capture.mjs` (telas reais, 1280×720, uma página só: o tema troca em tempo de execução),
  `node tools/menu-estilos-componentes.mjs` (componentes) e `node tools/menu-estilos-folha.mjs` (monta a folha geral). Saída em `scratch/menu-estilos/` (fora do git).
- Regra de ouro dos três: **só repintam** (cor, borda, sombra, fundo, fonte). Contorno e sombra grossos são `box-shadow`, não borda; os cantos "inclinados" são
  `skewX` só em botões que não ficam colados a vizinhos. Nada muda tamanho, posição ou ordem de foco. O palco 3D (`.stage3d`) continua sem fundo no `.screen` e no `.gp`
  (regra em `tema-base.css`): **nenhum tema cobre a janela do carro**.
- Movimento: só `transition`/`@keyframes` leves, e **tudo desliga** com "Reduzir efeitos" (`#ui.reduce-fx`) e com `prefers-reduced-motion`.
- Fontes: só as três embutidas (Fredoka, Baloo 2 e Lilita One, todas OFL). O corpo de texto dos três temas é Fredoka (a Baloo 2 tem a caixa de texto alta demais e reprovou
  centenas de sobreposições de linha no teste de layout); Lilita One é só o display do C. A Fredoka entra como "Fredoka Tema": **o mesmo woff2 já embutido**, redeclarado em
  `tema-base.css` com `ascent-override`/`descent-override` (caixa de linha de 1,08 em em vez de 1,21), que é o que faz o teste de layout passar sem mexer em tela nenhuma. Fontes novas que valeria considerar (OFL, **não baixadas**): *Exo 2 Italic* ou *Barlow Condensed Italic* para o A,
  *Rajdhani* ou *Outfit* (fina de verdade, peso 300) para o B. A Fredoka embutida começa no peso 400; por isso o B é "fino" pelo espaçamento e não pelo peso.

## Imagens (`scratch/menu-estilos/`)

`folha-menu-geral.png` (linhas = telas; colunas = atual, A, B, C), `a-menu.png`, `b-menu.png`, `c-menu.png`, `a-garagem.png`, `b-garagem.png`, `c-garagem.png`
(1280×720 cada), `atual-componentes.png`, `a-componentes.png`, `b-componentes.png`, `c-componentes.png`, e as capturas soltas em `raw/<tema>-<tela>.png`
(título, menu, garagem, copas, pistas, pagamento, resultado, lobby, opções e passaporte).

## A · "Velocidade" — arcade moderno em pôr do sol

- **O que é e referências:** Horizon Chase Turbo e Forza Horizon. Itálico forte, faixas diagonais laranja/rosa/azul, cartões que viram gradiente no foco, **números grandes
  01–05** nos cartões do menu, sombra dura deslocada (rosa e azul) nos títulos, véu de pôr do sol sobre o 3D.
- **Tokens:** `--accent #ff7a1a`, rosa `#ff3d7f`, azul `#2f7bff`, sol `#ffd23f`; `--glass rgba(28,11,50,.6)` (índigo); `--font`/`--font-display` Fredoka 700-800 em itálico;
  `--r` 8u (reto, quase cortado). Gradiente de foco `100deg #ff8a1f → #ff3d7f`.
- **Nas telas:** menu com cartões inclinados e o foco em gradiente cheio com contorno branco; "Próximo objetivo" com barra de pôr do sol; abas de copa e linhas de pista com o
  mesmo gradiente; Garagem com o anel âmbar na janela do carro e a carteira em amarelo grande; Pagamento com valores em itálico.
- **Custo de levar ao jogo todo:** baixo a médio. O que está pronto cobre ~90% das classes. Falta o HUD de corrida (ver abaixo) e um logo novo que acompanhe o itálico.
- **Riscos:** as faixas diagonais do fundo competem com cenas claras (a de dia) e viram ruído em telas densas (tabela de resultado); `skewX` aumenta a caixa do elemento,
  então vizinhos colados (botões do canto) não podem usá-lo (já tratado). O itálico é sintetizado (a Fredoka não tem itálico): em texto grande fica um pouco mais largo.
- **Arte nova:** nenhuma obrigatória. Ganharia muito com uma fonte itálica de verdade e um logo inclinado com as raias de velocidade.

## B · "Vidro" — vidro escuro premium

- **O que é e referências:** Gran Turismo 7 e Need for Speed Heat. Painéis translúcidos escuros com blur e **quinas em "L"**, tipografia fina e espaçada em caixa alta,
  linhas de 1px, **um acento neon por contexto** (ciano no menu e no lobby, âmbar na garagem, magenta em copas/pistas/passaporte, esmeralda em pagamento/resultado),
  varredura de luz lenta no item em foco, ícones de linha fina nos cinco cartões (SVG inline como máscara: herdam a cor do texto).
- **Tokens:** `--accent #4cd6ff` (trocado por tela em `.scr-garage` etc.), `--glass rgba(7,10,16,.58)` + `backdrop-filter: blur(26px) saturate(1.35)`, `--r` 5u, `--font` Fredoka 400-500
  com `letter-spacing` de 0,14 a 0,3em; véu só nas bordas (o 3D e o carro ficam no centro).
- **Nas telas:** menu em linhas finas com ícone e foco com fio e brilho; Garagem em âmbar com o palco 3D inteiro à mostra e o botão CORRER só em contorno;
  copas e pistas em magenta; tabelas com cabeçalho no acento.
- **Custo de levar ao jogo todo:** médio. É o que mais depende de manter a disciplina "um acento por contexto" em cada tela nova, e o `backdrop-filter` de 26px em muitos painéis
  tem custo de GPU (no Steam Deck e em máquina fraca, pode ser preciso cair para fundo sólido quando `quality` for `low`).
- **Riscos:** legibilidade sobre cenas claras (a abertura com o mar de dia precisou de um degradê escuro por baixo do subtítulo); o peso fino some no texto pequeno e no "Texto grande";
  é o tema mais distante do logo atual (gordo e cartunesco): fica parecendo outro jogo se o logo não for refeito.
- **Arte nova:** logo mais sóbrio (monocromático ou com um acento), e uma fonte fina de verdade (Rajdhani/Outfit, peso 300) se quiserem o acabamento de GT7.

## C · "Cartum" — cartum brasileiro vibrante

- **O que é e referências:** Mario Kart 8 e Hot Wheels Unleashed, com sabor de Brasil. Cartões gordos com **contorno azul-marinho e sombra deslocada**, cada cartão do menu
  numa cor (verde, azul, amarelo, laranja, rosa) com **ícone colorido grande**, texto com contorno (Lilita One + `-webkit-text-stroke`), selos/etiquetas inclinadas
  (`.card-badge`), faixa verde-amarelo-azul nos painéis e nos títulos, abertura com listras diagonais, **azulejo** no rodapé, quadros claros (creme) para "Próximo objetivo".
- **Tokens:** `--c-navy #0d2250`, verde `#00b25f`, azul `#1c5be0`, amarelo `--accent #ffd400`, laranja `#ff8a2b`, rosa `#ff4f9a`, creme `#fff6dc`; `--r` 20u/14u (muito arredondado);
  anel de contorno `--c-ring` (3u marinho + 5u de sombra); display Lilita One, corpo Fredoka 600.
- **Nas telas:** menu com cinco cartões coloridos (foco = mais claro, anel branco e escala); copas e pistas em azul profundo com foco amarelo; Pagamento e resultado em painéis
  de contorno grosso; Garagem com a janela do palco emoldurada em marinho/amarelo e setas amarelas.
- **Custo de levar ao jogo todo:** médio. Os painéis são opacos (sem `backdrop-filter` caro) e o contraste é alto, então tende a ser o mais robusto; em contrapartida, tudo
  que for tela nova precisa de cor própria por item e de ícone colorido (hoje são 5 no menu).
- **Riscos:** contorno de texto em fonte pequena pesa (aplicado só em títulos e cartões, nunca no corpo); o `skew` não é usado, mas o anel e a sombra de 5u passam do retângulo do
  elemento (desenham por fora, o teste de layout não os conta, mas encostam em vizinhos a 4u); pode soar infantil para um jogo que quer encarar o Horizon Chase.
- **Arte nova:** ícones coloridos para o canto (Recordes, Como jogar, Opções, Controles, Créditos) e para as abas de região; um cobogó/azulejo desenhado de verdade (o de hoje é um
  ladrilho simples gerado em SVG); logo já combina.

## O HUD de corrida (só anotação)

Nenhum dos temas toca no HUD (`src/render/hud.css`, `.nc-hud`): os tokens ficam no `#ui`, e o `#hud` é irmão dele. Ele é DOM e não entra no `hashRace`/`sim-golden`, então **dá para temá-lo com segurança**, mas é onde o risco do
Deck está (números de posição, volta e velocidade com mínimo de 12 px efetivos, medidos em `playtest-layout.mjs`). Seria uma segunda etapa: `:root[data-tema] .nc-hud { … }` só
com cor, contorno e fonte (sem tamanho), e rodar a parte do HUD do playtest.

## Teste de layout (`scripts/playtest-layout.mjs`)

Os temas entram pela URL (`node scripts/playtest-layout.mjs 'http://localhost:PORTA/?nosurvey=1&dynres=0&tema=a'`); o script não foi alterado.

Resultado com o CSS final (672 combinações = 48 cenas × 7 resoluções de 1024×640 a 2560×1440 × texto normal e grande, mais a parte do HUD/dicas do Deck):

| Tema | Combinações limpas | Como foi medido |
|---|---|---|
| A · Velocidade | **672/672**, HUD verde | uma execução completa |
| B · Vidro | **672/672**, HUD verde | em duas execuções do mesmo script: 490 (cenas sem corrida de preparação, mais o HUD) + 182 (as que dependem dela: menu com "Continuar", resultado, Pagamento) |
| C · Cartum | **672/672**, HUD verde | idem (490 + 182) |

O que o teste reprovou no caminho (e que ficou registrado em comentário nos CSS, para a próxima sessão não refazer): a **Baloo 2** como fonte de corpo (centenas de
sobreposições de linha: caixa de texto alta demais); a **Fredoka** pura (1px de sobreposição nas grades apertadas, resolvido com o `@font-face` de métricas trocadas);
`skewX` em botões colados (a caixa cresce e encosta no vizinho); sublinhado de título mais alto que o atual (empurra a lista de copas por cima da legenda no 1600×900 com texto grande);
`font-family`/`--font-display` na raiz (o HUD lê as duas variáveis: com a Lilita One do C, as dicas da 1ª corrida a 4 jogadores no 1024×640 cobriam o painel do HUD; por isso **os tokens
dos temas moram no `#ui`**, e o HUD não muda com o tema). Sem o parâmetro, nada disto roda: o visual atual segue medido pelas suítes de sempre.

Testes: `npx tsc --noEmit -p .` limpo; `tests/tema-menu.test.ts` (novo: lê o parâmetro e liga/desliga o atributo) e os de UI que a mudança poderia tocar (`ui`, `ui-text`, `fluxo-*`, `garage-stage`,
`look-screens`, `online-look-screen`, `paint-screens`, `payout-screen`, `stars-screens`) passam; nenhum arquivo de simulação foi tocado (`hashRace`/`sim-golden` intactos).

## Recomendação

É uma escolha de gosto, mas quem me pediu "honesta" ganha isto:

1. **Eu levaria o C ("Cartum") como base do jogo todo.** É o único dos três a que o logo atual (gordo, contornado, de brinquedo) e a arte low-poly colorida já pertencem: nos
   outros dois o logo parece de outro jogo. É também o mais robusto: painéis opacos (sem `backdrop-filter` caro), contraste alto sobre qualquer cena do 3D, cor própria por item
   (o jogador acha o cartão pela cor, também no Deck), e o sabor brasileiro (verde-amarelo-azul, azulejo) é diferencial real frente ao Horizon Chase, que o A só imitaria.
2. **O A é o que mais se parece com o Horizon Chase Turbo**, e é a segunda escolha: ótimo para o título, o resultado e o HUD (itálico, faixas, números grandes), ruim para telas
   densas (as faixas diagonais viram ruído). O caminho de menor risco para "mais bonito que o Horizon Chase" é **C nos menus e a energia do A (itálico nos números, faixa diagonal)
   no título, no Pagamento e no HUD**, não um tema só. Isso são duas folhas pequenas, não um terceiro tema.
3. **O B é o mais bonito em captura parada e o que menos eu recomendo.** O vidro com quinas em L é o visual "premium" de GT7, mas o peso fino perde no "Texto grande" e no
   Deck, o desfoque custa GPU em muitos painéis, e exige logo e fonte refeitos para não destoar. Só valeria se a direção do jogo mudasse para simulação séria.

Antes de qualquer uma virar o padrão: decidir o logo (C e A pedem arte nova do logo), e rodar a parte do HUD do playtest se o tema passar a tocar o HUD.
