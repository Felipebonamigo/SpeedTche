# V12 — noite mais roxa e a câmera Alta em curva (18/10/2026)

> **Base:** `main` 4a882cc (0.1.7), branch `nc/noite`, worktree `/home/user/speedtche-wt/noite`. **Só render e opções** (`src/core`, `hashRace`, `sim-golden` e o gate `src/bench/gate.ts` não mudam). Versão não subiu.
> Imagens: `scratch/noite/folha-hc2.png` (HC2 × antes × depois, 4 cenas da galeria), `scratch/noite/folha-cenas-noite.png` (7 noites, antes × depois), galerias `scratch/galeria/{base-4a882cc,noite}/` e `scratch/galeria/comparar-base-4a882cc-vs-noite.png` (1 de 13 cenas mudou: Sampa; chamadas e △ idênticos nas 13).

## 1. A câmera Alta "curva" nas Opções

`CAMERA_HIGH_CURVE` (V11: altura 3,4, recuo 6,8, mira 30 m, mesmo FOV 54) virou a opção **Opções › Acessibilidade › "Alta em curva"** (coluna da direita, depois das câmeras por assento).
- **Global** (não por assento: o seletor por assento escolhe entre as quatro câmeras; esta troca a *pose* da Alta de todos): cabe numa linha, e o ciclo da tecla C/V continua com as quatro.
- **Desligada por padrão.** `Settings.highCurveCamera` (booleano), campo **aditivo**: opções sem ele abrem desligadas, lixo vira `false`, a 0.1.7 ignora o campo (saneador em lista branca) e abre as opções novas sem perder nada; se ela regravar, o campo cai (docs/SAVE.md, "Alta em curva (V12)").
- Caminho: `Settings` → `RenderOptions.highCurveCamera` (`session.ts`) → `cameraExtraFor` → `CameraExtra.curve` → `cameraPoseFor(mode, curve)` (`camera-base.ts`). O interruptor do harness (`?camcurve=1`) continua.
- Texto PT/EN (`access.options.highCurve`, `access.desc.highCurve`). Baixa, Capô e Frente e a Alta aprovada (FOV 54 / recuo 5,8 / altura 2,5) não mudam (teste de trava).
- Testes (`tests/camera-curva-opcao.test.ts`, 11; vistos falhar: 9 de 11, "expected undefined to be false", `cameraPoseFor` ignora o 2º argumento, "linha da opção" ausente, chave de texto crua; os 2 que passaram são as travas da Alta aprovada e do saneador).

## 2. Noite roxa só no chão, na névoa, no céu e no cenário

Roxo no que se **vê**, não na luz que cai no carro: a paleta ganhou dois campos, `skyLight` e `fogLight` (= `sky`/`fog` de dia e no entardecer; à noite, o céu azul de antes). A IBL do carro (o env map é capturado com essas cores, trocadas só durante a captura, `sky.ts`) e o reflexo do verniz (`varnishSky`) leem esses; `hemiSky`, `hemiGround`, `sunLight`, `skyGlow`, intensidades e exposição são **byte a byte** os do 4a882cc (teste contra as 18 paletas congeladas em `tests/noite-roxa-base.ts`).

| O quê | Como | Onde |
|---|---|---|
| Céu | gradiente roxo/magenta por bioma (cidade magenta, costa e montanha violeta-azulado, savana ameixa) | `NIGHT_SKY_PURPLE` |
| Névoa | derivada do céu novo (a mesma conta) | `fog` |
| Chão, beira, rocha, areia, planos do horizonte, neve | `roxear()`: o matiz vai ao tom do bioma **mantendo a luminância** (a M2 mede estrada × chão por luminância), 0,66–0,78 | `NIGHT_GROUND_PURPLE` |
| Pista da cidade | mauve (#9a76ae → #a276ae, 285°) e 2ª tinta mauve | `ROAD_TONE`, `NIGHT_ROAD_ALT` |
| Cenário (árvores, prédios, skyline, cutouts) | filtro e mancha de sombra roxos (`sceneryLook`) **e** o uniforme `uStylizeWorld` (tom + quanto, 0 de dia/entardecer → 0,6 à noite, contínuo na `light`), que leva o albedo ao roxo mantendo a luminância — só multiplicar deixava a copa verde | `stylize.ts` `worldLook`, `applyStylize(..., { world: true })` |

Contínuo no tempo da corrida: tudo é campo da paleta ou função da `light`, então a mistura entardecer → noite (M6) anda sozinha (teste: nenhum salto > 0,07 por passo de 5%). Sem programa novo no meio da corrida: a chave do programa da estilização subiu de v3 para v4 (e `+world` nos materiais do cenário), compilada na carga.

## 3. Medidas (`tools/medir-imagem.mjs`, 1280×720, regiões céu y 0,12–0,32 · horizonte/névoa y 0,36–0,5 · chão y 0,6–0,85; matiz / croma / luma / B − R)

HC2 (`hc2-7.webp`): céu 281° / 0,414 / 0,151 / +0,124 · horizonte 287° / 0,325 / 0,145 / +0,064 · chão 322° / 0,333 / 0,416 / −0,114.

| Cena (noite) | Céu antes → depois | Horizonte antes → depois | Chão antes → depois |
|---|---|---|---|
| Sampa | 263° 0,228 0,183 +0,108 → **281° 0,467** 0,218 +0,133 | 330° 0,179 → 312° **0,275** (luma 0,269 → 0,275) | 274° 0,210 +0,075 → **289° 0,229 +0,035** (luma 0,318 → 0,328) |
| Curitiba | 289° 0,183 → **279° 0,404** | 289° 0,150 → 293° **0,283** | 287° 0,177 +0,027 → 300° 0,190 +0,000 |
| Aracaju (costa) | 230° 0,332 luma 0,088 → 260° 0,775 luma 0,194 | 210° 0,324 → 270° 0,469 | 174° → 265° (verde → violeta) |
| Xingó (deserto) | 240° 0,213 → 258° 0,368 | 267° 0,249 → 286° 0,437 | 320° → 319° (pista de terra: não mudou) |
| Fuji (montanha) | 233° 0,288 → 254° 0,472 | 221° → 264° | 259° → 259° |
| Foz (mata) | 217° 0,218 → 256° 0,468 | 189° → 270° | 336° → 334° (terra) |
| Canastra (savana) | 254° 0,199 → 270° 0,282 (a lua branqueia) | 285° 0,129 → 301° 0,293 | 348° → 347° (terra) |

Lê-se: céu e névoa chegaram perto do HC2 em matiz (260–281° × 281°) e croma (0,28–0,47 em Sampa/Curitiba; costa e montanha passam do HC2, mais azul-violeta). **O chão do quadro de baixo é quase todo pista**: nas cidades ela foi para o mauve (B − R +0,075 → +0,035; o HC2 é −0,114, rosa), mas nos biomas de terra a pista é a terra da V11 e a medida não se mexe — o roxo do chão aparece nas laterais (ver a folha). Luma dos céus subiu (HC2 0,15 e ~0,2 o nosso; a noite não ficou mais escura). **Não chegou ao rosa do HC2 na pista**: ver §5.

## 4. Travas que mudaram (e por quê)

| Trava | Era | Agora | Por quê |
|---|---|---|---|
| `estrada-gl` Sampa, B − R da pista | 15–90 | **5**–90 (matiz 245–300° e saturação ≥ 0,3 iguais) | a pista da cidade à noite é mauve (matiz ~285°, mais perto do 322° do HC2) e não lilás-azulado; medido 9 |
| `cor-brilho` (modelo de bolso): o domo da IBL | lia `sky`/`fog` | lê `skyLight`/`fogLight` | é o que o renderizador agora entrega à IBL (o carro vê o céu de luz, não o roxo): o carro branco/vermelho continua pelas MESMAS contas |
| `render.test` "noite mais escura que o dia" | soma dos canais | luminância (pesos do olho) | o chão roxo tem R e B altos e G baixo: a soma superava o verde do dia, a luminância (a que a M2 mantém) não |
Intactas (visto passar): carro branco lê branco (croma ≤ 0,22), vermelho vermelho, sem clarão, faróis à noite, faixa ≥ 3:1, asfalto de referência (`asphalt`) neutro, M2 inteira (`paleta-m2`), `stylize`, `hc2-grade`, `estrada-v11`.

## 5. Ficou fora / propostas

- **Pista rosa do HC2** (calçada mauve-rosada brilhante, B − R −0,11): exige mover as travas de matiz e B − R da pista da V11 (`estrada-v11`, `cor-brilho` 2c, `estrada-gl`) e clarear o albedo; proposta separada.
- Halo da lua do savana/deserto branqueia o céu (croma 0,28 em Canastra): daria um `skyGlow` só da pintura do domo (hoje ele também entra na luz de borda do carro, que não pode mudar).
- Árvore vermelha/magenta como no HC2 (hoje o roxo é o albedo levado ao tom): passar cor por espécie é trabalho do catálogo do cenário.
- LEIA-ME de `desktop/teste/` não foi tocado (versão não subiu); na próxima versão entram "Alta em curva" e a noite roxa nas novidades.

## 6. Testes (escritos antes, vistos falhar)

`noite-roxa` (20): 10 falharam no 1º rodar por "névoa/céu/chão sem matiz roxo" (ex.: tropical `#1b515c` 190°; chão da cidade 128°), `skyLight`/`fogLight` inexistentes, filtro do cenário 228°; depois `worldLook`/`uStylizeWorld`/`world: true` ausentes (5 de 20); os que passaram de primeira são as travas do que não pode mudar (luz do carro, asfalto, exposição, contínuo). `noite-roxa-gl` rodado no 4a882cc: 3 de 4 falharam (céu azul 211–243°, croma 0,18–0,25; chão de Sampa 270°) e o 4º passou (programas compilam); os limiares foram então calibrados contra o HC2 e os números de antes (e o piso de luma do céu de 0,45 para 0,55: o Fuji já tinha 0,46 com a lua). `camera-curva-opcao` (11), em §1.

## 7. Verificação (rodada no mesmo turno)

Ver o fecho no relatório de entrega; comandos: `npx tsc --noEmit -p .`, os arquivos de área sem GL, e com `NC_REQUIRE_GL=1`: `noite-roxa-gl`, `cor-brilho-gl`, `hc2-gl`, `estrada-gl`, `corrida-que-muda-gl`, `gl-render` (gate de chamadas/△), mais `playtest-layout` das Opções e da Acessibilidade (7 resoluções × 2 tamanhos de texto).
