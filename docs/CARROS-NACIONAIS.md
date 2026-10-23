# Carros nacionais: ficha de "inspirados em"

Pedido do dono (16/10/2026): carros que o brasileiro reconhece de longe (Gol, Palio, Corsa, Peugeot 207, Marea, o Uno com escada da firma),
sem pagar licença. **Nada aqui é cópia**: cada carro lembra um arquétipo, muda proporção e detalhes e leva nome próprio do jogo.

## A regra (vale para todos)

- **Nome de modelo e de marca nunca entram**: nem no jogo, nem na loja, nem no código, nem no material de imprensa. Nada de "Gol", "Palio", "Corsa", "207",
  "Marea", "Uno", "Mille", "Fiat", "VW", "Chevrolet", "Peugeot", nem trocadilho que leia o nome ("Palião", "Corça").
- **Sem os sinais que identificam a marca**: nenhum logo, nenhuma grade-assinatura (a "boca" do modelo), nenhuma combinação de faixas, número de placa ou
  adesivo de um modelo real.
- **Reconhecível à primeira vista, sem ser o mesmo carro** (ajuste do dono, 16/10/2026: "eles têm que parecer mais com os carros que mencionei"): a silhueta, as
  proporções, o conjunto de vidros e o desenho geral de faróis e lanternas ficam **perto** do arquétipo, para o brasileiro dizer "isso é um [modelo]" na hora.
  O que muda é só o que a marca registra: logo, grade-assinatura, nome, o desenho gráfico exato do farol/lanterna e as faixas/adesivos. Teste prático: o
  brasileiro reconhece o arquétipo; um advogado não encontra logo, nome nem a grade ou a lanterna reproduzidas ponto a ponto.
- **A inspiração é o arquétipo**: hatch compacto dos anos 90–2000, sedã médio executivo, etc. É o que o Horizon Chase e os jogos de carro indie fazem.
- **Antes da Steam**: passar a lista final por advogado de propriedade intelectual. Esta ficha não é parecer jurídico.

## A lista

Cada carro cai num estilo de carroceria que o jogo já tem (`CAR_BODIES`), então nenhum precisa de motor novo, só de casco novo (Hull + `shaped.ts`, como o GT).
"Quando" depende de como cada um entra: **livre**, **à venda** na Expedição ou **conquista**.

| # | Inspirado em (só aqui na ficha) | Nome no jogo (proposta) | Estilo | Como entra | O que muda para não ser cópia |
|---|---|---|---|---|---|
| 1 | Gol (quadrado, anos 90–2000) | **"Cuiabano"** | hatch | livre | proporção mais larga e baixa que o original, farol retangular fino, lanterna vertical com 3 cubos, sem grade; teto reto |
| 2 | Palio (hatch compacto, lanterna alta) | **"Tupiniquim"** | hatch | livre | lanterna em "L" invertido, vinco na porta que sobe para a coluna C, faróis mais separados e inclinados |
| 3 | Corsa (hatch/sedã redondo, anos 2000) | **"Caipora"** | hatch | à venda ($ 8–10 mil) | corpo mais arredondado, lanterna em gota, para-choque com faixa lisa; sedã de porta-malas curto como variante de cor |
| 4 | Peugeot 206/207 (hatch europeu, farol "garra"; foto de referência do Felipe, 23/10/2026: o 206 de 5 portas) | **"Pampeiro"** | hatch | à venda ($ 12 mil) | farol alongado para o para-lama, mas com outro corte; teto com leve caimento; grade baixa de uma barra só |
| 5 | Marea (sedã médio, anos 2000, lanterna larga) | **"Barão"** | sedan | à venda ($ 14 mil) | porta-malas alto, lanterna de ponta a ponta com friso cromado, faixa lateral fina; é o "carro do tio" |
| 6 | Uno com escada (o carro da firma) | **"Furgãozinho da Firma"** | micro | **conquista** (ver abaixo) | micro-carro quadrado, escada de alumínio no teto e adesivo "Firma Ltda" fictício; sem nada do Uno real |
| 7 | Fusca | **"Besouro"** | classic | à venda ($ 10 mil) | para-lamas bojudos e capô curto: o arquétipo é domínio comum, com faróis e lanterna próprios |
| 8 | Kombi | **"Pão de Forma"** | pickup | à venda ($ 18 mil) | furgão baixo e largo, teto alto, duas janelas laterais; sem a "boca" característica |
| 9 | Opala / Maverick (clássicos nacionais) | **"Gaúcho V8"** | muscle | conquista | capô longo, cabine recuada; o V8 grave de buzina e escapamento já existe no som do Trovão |
| 10 | Jipe / Troller | **"Trilheiro"** | pickup | à venda ($ 22 mil) | capô reto, grade de barras próprias, estepe atrás; sem o desenho do Troller |
| 11 | Chevette (cupê/hatch compacto, anos 70–80) | **"Lambari"** | classic | à venda ($ 9 mil) | cupê de traseira inclinada e vidro de trás grande; faróis redondos mais baixos e afastados, lanterna horizontal fina; para-choque de lâmina; sem a grade de barras do modelo real |
| 12 | Fiat 147 (compacto quadradinho, anos 70–80) | **"Jabuti"** | micro | à venda ($ 7 mil) | caixa curta e alta de teto reto, farol quadrado pequeno com friso, lanterna vertical estreita, capô com vinco central; grade lisa de uma só barra |
| 13 | Ford Ka 2ª geração (hatch 3 portas, 2008–2013; foto de referência do Felipe, 23/10/2026) | **"Sagui"** | micro | a decidir (pedido do Felipe para o Detonauto, 23/10/2026; não está no jogo) | faróis grandes em gota com outro corte, grade de duas barras lisas sem emblema, para-lamas redondos e bojudos, só 3 portas |

Os clássicos dos anos 70–80 (Besouro, Lambari, Jabuti, Gaúcho V8) combinam com a **Copa Retrô** (ideia): uma copa só com eles, sem nitro de verdade. Três já estão cobertos pelo roster atual e **não precisam de carro novo**: o Saci Mirim (micro), o Tatu 4x4 (picape), o Boto Luxo (clássico). A proposta é
**trocar o visual** deles quando fizer sentido, em vez de acumular carros: o Saci Mirim pode virar o "Furgãozinho da Firma" com o desenho novo.

## O carro da firma (#6) como conquista

Folclore brasileiro: o carro compacto com escada no teto, adesivo da empresa e, no jogo, a escada que balança nas curvas.
- **Conquista** sugerida: "**Hora de entrega**" — vença 10 corridas **sem comprar nenhum carro** (só com os livres), ou 5 vitórias seguidas no Saci Mirim.
  O prêmio é o carro mais o aro "firma". Entra na lista das 10 conquistas do O5 (`docs/ondas/O/O5.md`) com maestria própria.
- **Piada visual**: a escada do teto balança nas curvas e cai no nitro (um efeito barato por instância; sem chamada nova se estiver no mesmo casco).
- **Buzina própria**: a mais fraca do jogo ("fon-fon").
- **Cuidado**: o adesivo é de empresa fictícia; nada de logo real, de telefone, nem de nome de loja existente.

## Como fazer, em ordem

1. **Você aprova** a lista, os nomes e quem é livre, à venda ou conquista (marque na tabela).
2. **Casco e folha**: cada carro vira um `styles/<nome>.ts` sobre o `Hull` + `shaped.ts` do GT, depois da rodada de realismo do GT (a base que os 12 estilos também vão herdar).
3. **Folha antes × depois** (como a do GT) e **foto de referência lado a lado** para conferir que não é cópia.
4. **Números**: cada carro entra na tabela de `docs/CARROS.md` com Vel./Acel./Freio/Curvas/Consumo medidos (`scripts/car-balance.ts`); nenhum carro é melhor em tudo.
5. **Save**: carro novo só entra por dado (`CARS`), a loja e a conquista; save antigo abre sem perder nada.
6. **Textos** PT e EN (`src/i18n/core.ts`, `src/career/strings.ts`).

## O que preciso de você

- ~~Aprovar os nomes~~ **Aprovados em 16/10/2026** (os 10 da tabela; Chevette e Fiat 147 entraram no mesmo dia com os nomes Lambari e Jabuti, a confirmar).
- Quem fica **livre** no começo: o primeiro carro do jogo hoje é o Falcão GT. Dá para o jogador **escolher** entre um GT e um hatch nacional logo no início.
- A **conquista** do carro da firma e a do Gaúcho V8: aceitar a regra proposta ou mudar.
- Se quer algum modelo que **não** está na lista (diga o nome do carro; eu proponho o arquétipo e o nome do jogo).

## Estado (V6c, `docs/ondas/V6c-nacionais.md`)

Todos os doze feitos no Blender (`tools/blender/`): **livres** #1 Cuiabano e #2 Tupiniquim; **à venda** #3 Caipora ($ 9 mil), #4 Pampeiro ($ 13 mil: o Curupira S já custa 12), #5 Barão ($ 14 mil), #7 Besouro ($ 10 mil), #8 Pão de Forma ($ 18 mil), #10 Trilheiro ($ 22,5 mil: o Pororoca V10 já custa 22), #11 Lambari ($ 9,5 mil: o Caipora já custa 9) e #12 Jabuti ($ 7 mil);
**conquista** #6 Furgãozinho da Firma ("Hora de entrega" = 10 vitórias sem comprar carro) e #9 Gaúcho V8 ("Cavalo de aço" = Maestria 3 com o Trovão V12). Faltam só as variantes de ficha: o Caipora sedã e a conquista "5 seguidas no Saci Mirim" (pede contador no save).
**Itens para o advogado antes da Steam:** Besouro e Pão de Forma (arquétipos de desenho protegido), e, por precaução, Gaúcho V8 e Trilheiro.
**Herói (V17, `docs/ondas/V17-herois-nacionais.md`):** os dois livres do começo do jogo, **Cuiabano e Tupiniquim**, ganharam casco de ALTA definição (~16,5 mil △, `src/assets/cars/hero/<id>.glb`, `npm run carros-herois-nacionais`) com caráter de carro popular: lanterna vertical de três cubos / em "L" com refletor e lente em dois tons, farol com refletor e lente, para-choque com friso, grade lisa, placa lisa, retrovisores, maçanetas, limpadores, antena, escapamento simples. Os outros dez nacionais seguem só com o casco de V6c.
**Forma do casco normal (V19, `docs/ondas/V19-forma-casco.md`):** os quatro hatches (Cuiabano, Tupiniquim, Caipora, Pampeiro) ganharam, no casco NORMAL de ≤ 4.500 △ (o que adversários, Média/Baixa, distância e câmera de corrida veem), a forma do herói de V18 na versão barata: cintura abaulada, teto com arco e canto que rola, para-lamas bojudos, capô com caimento, pontas arredondadas em planta; △ por carro **menores** que os de V6c (4.234 / 3.810 / 3.980 / 3.690). Silhueta, eixos, rodas e pegada de V6c intactos. `npm run carros-blender cuiabano tupiniquim caipora pampeiro`.
**Forma do casco normal dos outros oito (V20, `docs/ondas/V20-forma-outros.md`):** Barão, Furgãozinho, Besouro, Pão de Forma, Gaúcho V8, Trilheiro, Lambari e Jabuti ganharam a forma do arquétipo de cada um (sedã de ombro vincado, micro-caixa de cantos redondos, fusca de cúpula e para-lamas bojudos, furgão de cantos arredondados, muscle com power bulge e ombro traseiro, jipe de linha reta com raio nas arestas, cupê de vidro grande) no casco NORMAL, com △ **menores** que os de V6c (3.218 / 3.392 / 3.882 / 3.536 / 3.894 / 3.680 / 3.639 / 3.434). Silhueta, eixos, rodas e pegada intactos. `npm run carros-blender barao furgao besouro paodeforma gaucho trilheiro lambari jabuti`.
