# V14 — Tinta, lanterna e vidro: luz e material do carro (branch `nc/tinta`, base `main` a66d119 = 0.1.10, 20/10/2026)

> Pedido do dono: "os carros do Horizon Chase são muito mais bem feitos que o nosso, eu quero que os nossos fiquem melhores". A V9 deu malha ao carro herói e concluiu que o que ainda separava o HC2 do nosso era **luz e material**, não polígono (`docs/ondas/V9-heroi.md` §4). Aqui: três coisas no shader do carro, que vale para **todos os 26 carros** (o material é um só): tinta com brilho alongado, lanterna em tira com halo e vidro preto profundo. **Só `src/render` e ferramentas** (`src/core`, `hashRace`, `sim-golden` intactos); sem malha nova, sem chamada de desenho nova, sem programa novo no meio da corrida. FPS não foi medido (swiftshader só conta): quem diz se cabe é o `--bench` do dono.
> Imagens (fora do git): `scratch/tinta/folha-hc2-antes-depois.png` (HC2 × antes × depois), `scratch/tinta/folha-hc2-antes-depois-26-carros.png` (os 26 carros, antes e depois), `scratch/galeria/tinta/folha.png` (as 13 cenas da galeria) e `scratch/galeria/comparar-base-a66d119-vs-tinta.png`.

## 1. O que entrou
| Peça | O quê |
|---|---|
| **Tinta** (`cars/material.ts`, `carSheen`) | Brilho analítico, depois do verniz e antes de a pintura voltar ao matiz (`carPaintHold`): (1) **lobo do sol esticado ao longo do carro** (Ward anisotrópico: estreito na largura, largo no comprimento; o eixo do carro vem do vértice por `vFwd`, pela matriz da instância; o sol é `directionalLights[0]`, o do período); (2) **faixa do horizonte** (clara, logo acima da linha refletida); (3) **profundidade**: a tinta colorida perde 22% fora do brilho (cor funda onde não há luz, como no HC2); (4) **dobras**: o que olha para baixo escurece até 30%. A luz do brilho é branca puxada 45% ao matiz da tinta e entra "em tela" (nunca passa de 1). Teto do realce (`SHEEN_PEAK` 0,7). Tinta **muito escura** (ônix) não leva o realce (rampa pela luminância do albedo): o realce do sol dela é um platô logo abaixo do estouro e qualquer soma o acende (trava V2). Sem cubemap, sem amostra, sem chamada. |
| **Lanterna** (`material.ts` + `kit.ts`) | **Tira**: o perfil da lente (`lensWeight`) ganhou patamar aceso até 35% do raio e cai suave para a borda (era uma rampa linear: o miolo era um ponto). **Halo**: o vermelho escorre pela lataria em volta da lente (emissivo, `carLampHalo`, `haloEmission`: de dia 0,39 na lanterna e 0,64 no freio, à noite mais), a partir da **lista de lanternas do casco** (`lensLamps`: centro, meia extensão e alcance das lentes vermelhas em leque; máximo 6; `geometry.userData.lamps`). A lista entra por uniformes do material, **um material por casco com lanternas/vidro** (o three só reenvia uniformes quando o material muda de um desenho para o outro), mesmo programa (a chave é a mesma). O miolo de dia continua laranja, a borda vermelha e o teto do bloom de dia (o halo é emissivo na lataria, abaixo de 0,5 × o limiar) não muda. |
| **Vidro** (`material.ts`, `stylize.ts`) | O azul-marinho tinha três causas, todas medidas: a **luz de borda** da estilização (azul do céu na raspa; agora `STYLIZE_RIM_MASK` a corta no vidro), o **realce do sol** neutro e rente (30% do teto no vidro), e a **cor própria** do vidro de arquivo (azul; perde 90% da croma e metade do brilho). O céu entra só numa **faixa** (`carGlassSky`: elevação do reflexo entre ~12° e ~37°, croma 8%, teto 0,45) e **na parte de cima do vidro** (`glassRange` → `uGlassY`: a altura relativa no vidro do casco). O resto é preto. |
| **Degraus** | `sheenFor(q, reduzir)`: Média, Alta, Ultra = lobo + faixa + halo; **Baixa = só o lobo** (brilho simples, sem halo); **"Reduzir efeitos" = lobo mais fraco, sem faixa e sem halo**. O uniforme `uSheen` troca com a qualidade e com a opção (sem programa novo). |
| Chaves de programa | carro `speed-tche-car-v9` (era v8), estilização `speed-tche-stylize-v5` (era v4): compilam na carga, nunca no meio da corrida (`corrida-que-muda-gl`). |

## 2. Números (laboratório GL, 640×360, Alta, câmera de corrida de dia, Copacabana seg 300, o Falcão GT sem herói; antes = a66d119)
§NUMEROS§

## 3. Testes (escritos antes e vistos falhar)
§TESTES§

## 4. O que ainda separa do HC2 (comparação honesta, olhando as folhas)
§HC2§

## 5. Travas e testes que mudaram (de propósito)
§TRAVAS§

## 6. Arquivos
`src/render/cars/material.ts`, `kit.ts`, `src/render/cars.ts`, `src/render/stylize.ts`, `tools/render-harness.lab.ts` (sondas com p5/p95, `freeze({car})`, `glassPoints`, `lamps`, `carUniform`), `tools/render-harness.html` (`allcars=1`), `tools/tinta-folha.mjs`, `tests/tinta.test.ts`, `tests/tinta-gl.test.ts`, `tests/car-material.test.ts`, `tests/car-por-modelo.test.ts`.
