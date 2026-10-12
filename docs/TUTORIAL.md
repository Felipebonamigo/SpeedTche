# Tutorial de 90 segundos (passo 1.9)

Uma volta guiada numa pista própria, sem adversários, que ensina o essencial: a largada-foguete,
acelerar, fazer curva, frear antes da curva forte, nitro, box, derrapar e — com 2 ou mais jogadores —
empurrar o companheiro parado. Só local (não existe no online). Desde a O3 (`docs/ondas/O/O3.md`) o
fim dele leva à **Expedição**, e a 1ª corrida de verdade tem dicas na hora (seção "Dicas da 1ª corrida").

## Onde fica
| Arquivo | O quê |
|---|---|
| `src/game/tutorial-track.ts` | A pista (`tutorial`, "Autódromo-Escola") e os trechos de cada lição, calculados das operações do DSL |
| `src/core/track/index.ts` | `registerExtraTrack`: pista fora de `TRACKS` que só o `getTrack` acha (seleção, recordes, copas e os testes que varrem `TRACKS` não a veem) |
| `src/game/tutorial.ts` | A máquina de passos, pura: `updateTutorial(tut, state)` depois de cada tick → eventos; `tutorialView` → o que o painel mostra; `tutorialInput` → o comando do carro que o passo 6 para |
| `src/game/tutorial-session.ts` | A corrida guiada na sessão, como um `RaceDriver` (o mesmo gancho do online); textos do painel com as teclas de cada jogador; fim, pular e flag no save |
| `src/ui/screens/tutorial.ts` + `.css` | "Como jogar" (entrada dos jogadores), tela final, cartão "Primeira vez?" do menu principal e o painel por cima do HUD |
| `src/tutorial/strings.ts` | Textos PT/EN |
| `tests/tutorial.test.ts` | Pista, máquina, painel, sessão (piloto roteirizado faz o tutorial inteiro), save |
| `scripts/playtest-tutorial.mjs` | Playtest no Chromium pelo teclado, com uma captura por passo |

Ganchos nos arquivos compartilhados: `session.ts` (cria a sessão do tutorial e trata
`startTutorial`/`tutorialFirstCup`), `contracts.ts` (telas `tutorial`/`tutorialDone`, os dois eventos,
`TutorialDoneData`, `SaveData.tutorialDone`), `save.ts` (saneia a flag), `menus.ts` (as duas telas),
`simple.ts` (item "Como jogar" e o cartão de oferta), `common.ts` (`ScreenData` aceita `TutorialDoneData`).

## A pista
640 segmentos (~27 s por volta a toda), na ordem das lições; o grid fica na reta curta depois do box:

| Trecho | Segmentos | Operação | Lição |
|---|---|---|---|
| `accel` | 0–119 | reta 120 | 1: acelerar até 150 km/h (e onde o passo 6 para o carro) |
| `curve` | 120–219 | curva 100, força 4 | 2: curva média no asfalto (dá sem frear: o Falcão segura ~80% da máxima) |
| `brakeZone` | 220–309 | reta 90 | tempo de ler o passo 3 e frear |
| `strong` | 310–399 | curva 90, força −6 | 3: frear antes (o Falcão segura ~53%) |
| `nitro` | 400–559 | reta 160 | 4: nitro |
| `pit` | 560–609 | box 50 | 5: abastecer |
| `grid` | 610–639 | reta 30 | grid de até 4 carros |

Corrida de 6 voltas (`TUTORIAL_LAPS`) só para dar margem: quando alguém **começa** a última volta
sem a equipe ter terminado, o tutorial acaba ("sem tempo") antes de qualquer um cruzar a chegada —
o `race_over` nunca acontece e nada vai para recordes, estatísticas ou conquistas.

## Os passos
Cada jogador anda pelos passos 1–5 no próprio ritmo; os de trecho só contam uma **passagem inteira**
(entrou pelo começo, saiu pelo fim). Errou → aviso na hora e o passo espera a próxima volta.

0. **Largada** (O3, antes do passo 1, sem número no contador: "LARGADA") — durante a contagem o painel pede
   para **apertar o acelerador junto com o JÁ**. A regra é a do núcleo (`physics.ts`, N1): vale o ÚLTIMO
   aperto (de solto para apertado) que cair de 18 ticks antes a 6 depois do JÁ com o pedal ainda apertado;
   **segurar desde o começo da contagem larga normal**. O resultado (perfeita ou normal) sai uma vez por
   assento no HUD (evento `launch`); não vale repetir e não trava nada.
1. **Acelere** — `speed ≥ 150 km/h`.
2. **Curva média** — atravessar `curve` sem `|x| > 1,05`. Saiu do asfalto → `offroad`.
3. **Curva forte** — entrar em `strong` a no máximo `holdableSpeedFraction(carro, 6) × máxima × 1,15`
   (senão `fast`, "rápido demais", já na entrada) e atravessá-la no asfalto.
4. **Nitro** — o evento `nitro` do carro. Sem carga nenhuma (gastou antes), avisa e segue.
5. **Box** — o tanque começa em 22% (`START_FUEL`: o HUD já pisca e o aviso de combustível do jogo
   aparece); conta estar na faixa do box com ≥ 60%. Passou pelo trecho sem entrar → `pitMissed`;
   entrou mas atravessou embalado (o limitador do box só freia aos poucos) → `pitShort`. O texto
   pede para frear antes.
6. **Derrapar** (O3) — na curva média (`curve`, força 4, de novo na volta seguinte ao box): segurar DERRAPAR e
   carregar o 1º nível (evento `drift_charge`) **dentro** dela. Atravessá-la sem carregar → `noDrift`; sair do
   asfalto → `offroad`; entrar no meio dela espera a próxima passagem inteira. A barra do painel mostra a carga.
7. **Empurrão** (só com 2+) — quando todos passaram da curva de derrapar, o líder é escolhido; ao chegar na reta
   `accel` (no asfalto), o carro dele fica no freio (`tutorialInput`) até o evento `tow` nele.
   Quem passa direto pelo carro parado sem empurrar recebe um aviso (`towMissed`). O empurrão exige
   o parado abaixo de 20% da máxima e o companheiro acima de 40% (`sim/coop.ts`), então o texto pede
   para ficar atrás até ele parar e passar colado acelerando. Colado é **ao lado**: desde a onda F um carro
   não atravessa o outro (`docs/FISICA.md`), então mirar no carro parado é bater e ficar empurrando-o (ele
   está no freio) a 10% da máxima; o piloto do teste de ponta a ponta passa a 0,31 de lado.

Com 1 jogador são 6 passos (7 com 2+). No fim: "TUTORIAL CONCLUÍDO!" por 2,5 s e a tela final.

Configuração da corrida: só humanos (sem IA), co-op (todos no time 0), todas as assistências
ligadas, câmbio automático (mesmo com o manual nas opções), carros de fábrica.

## Painel
Um cartão por viewport, embaixo e no meio (entre combustível/nitro e o velocímetro, sem cobrir o
carro), na mesma divisão de tela do renderizador (`viewportRects`/`uiScale`): "PASSO n/total", título,
instrução, barra de progresso (velocidade no passo 1, tanque no 5), as teclas do dispositivo daquele
jogador (teclado 1, teclado 2 ou controle, com o remapeamento de `Settings.controls` e os nomes de
`src/ui/remap/labels.ts` — Xbox ou PlayStation pelo nome do controle; o controle lembra do analógico)
e "Esc/Start: pular tutorial". O aviso de repetir flutua acima do cartão até o passo ser cumprido.
O DOM só nasce no primeiro uso (os testes de sessão em Node criam a sessão sem `document`).

## Entrada, saída e save
- **Menu principal → Como jogar** (depois de Controles). A tela funciona como um lobby enxuto:
  Enter/Espaço (teclado 1), F (teclado 2) ou A (controle) entra; Esc/B sai do assento; COMEÇAR
  (ou Start) com pelo menos 1 jogador.
- **Primeira abertura**: enquanto `save.tutorialDone` é falso **e** `racesRun` é 0, o menu principal
  mostra o cartão "NOVO · Primeira vez?" (clicável) apontando para "Como jogar". Não é um diálogo que
  bloqueia: os playtests (e quem já sabe jogar) passam direto do título para o Campeonato.
- **Pular**: Esc/Start a qualquer momento (`RaceDriver.pauseKey`) encerra na hora.
- **Tela final**: "Parabéns!" (concluído) ou "Regras de ouro" (pulado/sem tempo), com as regras de
  ouro (a do empurrão só com 2+) e os botões "Começar a Expedição" (ou "Continuar a Expedição" se já há
  uma; **nunca a apaga**) e "Menu principal". O botão leva ao lobby→garagem da Expedição com os mesmos
  jogadores (`TutorialSession.firstCup` → `career.start(humans, resume)`); a copa avulsa sem dinheiro deixou
  de ser o destino (pendência da N5).
- `save.tutorialDone = true` ao concluir, pular ou acabar o tempo.
- **Direção assistida**: o tutorial corre sempre sem ela (ensina a frear e a esterçar), mesmo para quem
  escolheu uma nas opções; a copa que vem depois usa a de cada um. Se o dono preferir o contrário, é
  trocar a montagem dos humanos em `tutorial-session.ts` por `assistedHumans`.

## Verificação
`tests/tutorial.test.ts` (38 testes) e `node scripts/playtest-tutorial.mjs http://localhost:<porta>/ scratch/tut`
com `npx vite preview` no ar: 2 jogadores pelo teclado fazem o tutorial inteiro (capturas de cada
passo, da largada, da derrapagem, do carro parado e da tela final), "Começar a Expedição" (garagem), depois
1 jogador pula com Esc.

## Cartão "Primeira vez?" focável (K1)

O cartão do menu principal é um item da lista de foco (`tutorialOfferCard` devolve um `FocusItem`; clique e som vêm da lista), por último e fora de `.menu-list`. O foco inicial continua no 1º botão; chega-se ao cartão com ↑ a partir do 1º item, com ↓ a partir do último botão ou com →, e ← volta ao 1º botão. Quem já correu (`racesRun > 0`) ou fez o tutorial não vê o cartão.

## Nitro no tutorial (N1)

o passo do nitro agora começa com 1 carga por humano (a barra da equipe soma); sem carga, avisa e segue como antes.

## Dicas da 1ª corrida (O3)

Na **1ª corrida local de copa ou Expedição** (`save.racesRun === 0`, `tipsEnabled`: nada de online, corrida rápida ou
contra-relógio) a sessão liga `src/render/hud-tips.ts`. A decisão é pura e por assento (`observeTips` depois de cada tick,
`tipOf` por assento); o overlay (`createTipsHud`) é um cartão por viewport, embaixo e no meio (a faixa livre entre o
combustível e o velocímetro, a mesma do painel do tutorial), na escala do HUD (`--s` × `--hud-scale`), com texto e
teclas de no mínimo 12 px. As teclas são **as do jogador daquele assento** (`actionKeys`/`actionChips` em
`remap/labels.ts`: teclado 1, teclado 2, controle Xbox ou PlayStation, remapeamento das Opções, layout do sistema).

| Dica | Quando | Some quando | Máx. |
|---|---|---|---|
| Largada | na contagem, largada pendente | a largada é decidida | 1 |
| Box (seta →) | depois do `fuel_low` | entra no box | 2 |
| Frear | `brakingTarget` (a conta da IA) diz que está rápido demais para a curva forte que vem | freia | 3 |
| Derrapar | dentro de uma curva forte longa (`wantsDrift`), sem derrapar, sem frear | derrapa | 3 |
| Nitro | barra cheia, reta, nitro nunca usado, 6 s depois da largada: "enche quando você derrapa, raspa, ultrapassa e larga bem" | usa o nitro | 2 |

Ritmo: cada dica dura até 5 s (`TIP_SHOW_TICKS`) e a seguinte espera 2 s (`TIP_GAP_TICKS`); prioridade
largada > box > frear > derrapar > nitro. `reduceEffects` tira a animação do cartão e o pulso da seta. A Copacabana de hoje
tem curvas suaves (força ≤ 1,8, trechos de até 17 segmentos): as dicas de frear e de derrapar não disparam nela até o K5
mexer no traçado; a regra vale para qualquer pista.

## Oferta de assistência (O3)

Depois de **2 eliminações seguidas** (copa ou Expedição; classificar zera, outros modos não contam) a próxima largada
(`startCup`, `continueCup`, `nextRace`, `retryRace`, `careerRace`) é segurada por uma tela: **Freio automático**
(`seatAssists` = `brake` só para quem corre sem assistência), **Nível Amador** (`difficulty`) ou **Seguir assim**
(Esc/B também). Cada opção só aparece se ainda ajuda. **Uma vez por sessão**, aceita ou recusada. A conta vive na
sessão (`src/game/assist-offer.ts`), não no save: reiniciar o jogo a zera (atalho, com a saída no cabeçalho do módulo).
