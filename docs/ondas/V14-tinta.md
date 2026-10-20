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
| medida | antes | depois |
|---|---|---|
| Perfil lateral da tampa, rubi (6 faixas do para-lama ao meio, luma) | 0,25 · 0,23 · 0,24 · 0,31 · 0,34 · 0,35 (variação 0,12) | 0,24 · 0,22 · 0,24 · 0,32 · 0,39 · 0,46 (variação 0,24; o meio 248,79,109: salmão, matiz e saturação do rubi mantidos) |
| Perfil ao longo da tampa (5 faixas, rubi) | 0,43 · 0,44 · 0,39 · 0,35 · 0,27 | 0,47 · 0,48 · 0,43 · 0,41 · 0,34 (sem ganho de variação: o ganho está na lateral e na profundidade) |
| Branco (gelo) e azul (cobalto) | tampa ≥ 0,81 de luma, B ≥ 1,8 × R | iguais (trava passa) |
| Teto do ônix estourado (V2) | 0,19% | dentro do teto de 0,5% (o ônix não leva o realce) |
| Vidro do GT de ônix, caixas do `cor-brilho-gl` | embaixo luma 0,074 (14,18,44), em cima 0,101: 1,37× (teste vermelho já na base) | passa: embaixo ≤ 0,07, em cima ≥ 0,14 e ≥ 2× |
| Vidro de trás dos 21 carros com vidro virado para trás (ponto mais escuro) | 12 de 21 azul-marinho (B 42–54, ex. cuiabano 0,2,45; lambari 0,8,54) | 0 de 21 (todos luma ≤ 0,07, B ≤ 36; a maioria lê 0,0–1,12 de B) |
| Halo na lataria a 40% do alcance fora da lente (R) | sem halo | dia e noite: ≥ +20 de R; com "Reduzir efeitos" apagado |
| Pista de Sampa à noite (`estrada-gl`, B − R) | 9 | 9 (o patamar no miolo quente a levava a 2: corrigido, ver §5) |
| Gate (`gl-render`, `folga-gl`, `heroi-gl`) | limites de a66d119 | **limites iguais, testes verdes**: só uniformes, atributo no casco e shader; mesmas chamadas e triângulos |

## 3. Testes (escritos antes e vistos falhar)
- `tests/tinta.test.ts` (15, puros): 11 falhavam de saída ("sheenFor/lensWeight/haloEmission/lensLamps não existe", "faltou: outgoingLight = carSheen(", chave v8 em vez de v9, `userData.carUniforms` indefinido). `glassRange` e o ombro vermelho da tira foram escritos com o código já feito; vistos falhar apagando o código de novo ("glassRange não existe"; "ombro 0,800 × linear 0,800").
- `tests/tinta-gl.test.ts` (6, GL): na base falhavam 3 de 6: lateral da tampa (variação 0,12 < 0,20), halo ("o Falcão GT carrega as lanternas": 0 lanternas) e vidro (12 de 21 azul-marinho). As travas (branco, azul, sem erro de shader) passavam e seguem passando. **A medida da tinta mudou no meio**: a 1ª versão media a variação ao longo da tampa (era 0,19 na base e 0,21 depois: sem ganho); passei para o perfil lateral, medido na base ANTES de fixar o limite (0,12) e vista falhar.
- Já existentes: o teste do vidro da V2 (`cor-brilho-gl`, embaixo ≤ 0,07, em cima ≥ 0,14 e 2×) estava **vermelho na base** (0,074 e 1,37×) e passa agora.
- Medida no GL tem história: a luma de uma caixa varia ~0,03 entre duas medidas na mesma página (câmera e molas do carro assentam). Os testes rodam na ordem do arquivo; o do teto do ônix tem folga curta (0,19% contra 0,5%).

## 4. O que ainda separa do HC2 (comparação honesta, olhando as folhas)
Olhando `scratch/tinta/folha-hc2-antes-depois.png` e a dos 26 carros: **melhorou o que a V9 apontou, mas o HC2 ainda está longe**.
- **Vidro**: era o maior ganho visível; agora é preto profundo como o do HC2 (o do HC2 tem reflexo de cidade em faixa mais rica; o nosso é uma faixa cinza suave na parte de cima).
- **Lanterna**: agora tem halo vermelho na lataria e na bezel (de dia e à noite, mais forte no freio); mas continuam discos redondos, não as tiras largas e contínuas do HC2. Para tira de verdade falta geometria (uma barra de luz por carro), que a regra desta frente proibiu.
- **Tinta**: cor mais funda, dobras escuras e uma faixa clara no meio; **o HC2 tem realces mais nítidos e muito mais claros** (o teto do realce e a trava de estouro do sol seguram: o realce do sol é um platô sob o estouro). O carro de tinta muito escura (ônix) não ganhou nada. Na garagem (palco com 3 luzes, carro branco pequeno) a diferença é praticamente invisível.
- Continua sendo malha e proporção: carro baixo e longo, rodas menores, nenhuma faixa de luz acompanha a curvatura real (o brilho é analítico, não lê a malha).

## 5. Travas e testes que mudaram (de propósito)
- `tests/car-material.test.ts`: chave do carro v8 → v9; a chamada de `carGlassSky` ganhou o argumento da altura relativa no vidro.
- `tests/car-por-modelo.test.ts`: "o material comum é um só para todos os procedurais" virou "os procedurais têm o MESMO programa (a chave é igual)": cada casco com lanternas ou vidro tem o material dele (o three só reenvia uniformes quando o material muda entre desenhos). Programas não aumentam (`gl-render`, `corrida-que-muda-gl` verdes).
- **Nenhuma trava da cor-brilho, hc2, estrada ou noite mudou de número.** O halo e o miolo respeitam: miolo de dia laranja abaixo de 0,8 × o limiar do bloom, borda vermelha, à noite acima de 1,2 ×. O patamar da lanterna ficou só no vermelho porque no miolo quente subia o bloom e o `estrada-gl` (Sampa à noite) caía de B − R 9 para 2.
- Mudança de comportamento do vidro que o dono pode notar: os dois "reflexos azuis" soltos dos vidros do GT (faixas metálicas) sumiram; o céu aparece só como a faixa de cima.

## 6. Arquivos
`src/render/cars/material.ts`, `kit.ts`, `src/render/cars.ts`, `src/render/stylize.ts`, `tools/render-harness.lab.ts` (sondas com p5/p95, `freeze({car})`, `glassPoints`, `lamps`, `carUniform`), `tools/render-harness.html` (`allcars=1`), `tools/tinta-folha.mjs`, `tests/tinta.test.ts`, `tests/tinta-gl.test.ts`, `tests/car-material.test.ts`, `tests/car-por-modelo.test.ts`.
