---
name: conferir-fato
description: 'Confere em fonte confiável o texto do Speed Tchê que fala do mundo real (marcos turísticos, cidades e curiosidades), anota a fonte e só então libera o texto. Use antes de escrever ou mudar nome de marco, cidade ou pista, a legenda, o passaporte ou as curiosidades (R5), quando houver texto marcado para revisão, ou quando o Felipe perguntar "isso está certo?".'
---
# Conferir um fato

O Speed Tchê mostra o nome de 161 marcos reais e o lugar de cada pista (legenda, passaporte, cartão-postal). A
onda R5 vai trazer cerca de 95 curiosidades (2 a 3 por estado, 2 por país, até 120 caracteres, PT e EN), com a fonte
num doc interno, e elas só entram com o Felipe aprovando (`docs/CRONOGRAMA.md`).

## Onde está o texto

- Nomes: `LANDMARKS` em `src/ui/passport/strings.ts` (117 do Brasil) e `WORLD_LANDMARKS`, `BRAZIL_TOWNS` e
  `WORLD_PLACES` em `src/render/caption/strings.ts`.
- Onde fica cada pista: `src/core/data/places.ts` (`placeOf()`).
- Descrição curta dos marcos da primeira leva: `docs/PISTAS-TURISMO.md`.
- Curiosidades da R5: `src/ui/places/strings.ts`, que ainda não existe.

## Fontes que valem

- Prefeitura, governo do estado, IPHAN, UNESCO (patrimônio mundial) e o órgão de turismo do país, para marco e lugar.
- Nome oficial e grafia: a página oficial do lugar; em inglês, a forma usada pelo órgão de turismo ou pela UNESCO.
Não valem: busca de IA, resumo de blog, Wikipédia sozinha (serve para achar a fonte primária), página sem autor nem data.

## Passos

1. Liste o que falta conferir: os nomes novos ou mudados do pedido, e todas as curiosidades da R5 antes de irem ao Felipe.
2. Para cada fato (data, medida, autor, regra, nome), abra a página da fonte com o WebFetch. Trecho de resultado de busca
   não é fonte. Para pesquisa longa, use a skill `deep-research`.
3. Se a fonte confirma: anote a fonte (URL e data) no doc interno das curiosidades (proposta: `docs/CURIOSIDADES.md`, uma linha por texto,
   com PT, EN e fonte); nome de marco com grafia conferida não precisa de nota, mas o commit cita a fonte.
4. Se a fonte desmente ou não acha: reescreva o texto com o que a fonte diz, ou tire o fato. Não deixe "aproximadamente" no lugar de conferir.
5. Texto que nasceu de IA continua sendo de IA depois de conferido: ele entra na declaração (skill `declaracao-ia`).
6. Commit com a lista do que foi conferido e as fontes.

## Armadilhas

- O Cristo Redentor tem direitos da Arquidiocese do Rio: consulta jurídica antes da venda (`docs/ARTE.md`).
- Placa, fachada e logotipo de marca não entram (a placa de Las Vegas diz "WELCOME"). Vocabulário do jogo: passaporte,
  carimbo, cartão-postal; nunca "turnê" nem "world tour" (`docs/PISTAS-TURISMO.md`).
- A curiosidade tem até 120 caracteres: conferir não pode virar texto longo.
