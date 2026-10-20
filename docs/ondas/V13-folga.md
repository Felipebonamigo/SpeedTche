## V13 — Folga de triângulos e de chamadas no gate, sem mudar o que se vê (branch `nc/folga`, base `main` 52950f0, 20/10/2026)

> Pedido do dono: o gate de Sampa 4p Média estava quase cheio (344 mil △ de 345 mil) e isso travava carro herói, cenário mais rico e mais efeitos. Aqui: perfil de onde vão os triângulos, três cortes de visibilidade/LOD, comparação de imagem e a folga em números. **Nenhum limite do gate foi mexido. FPS não foi medido (swiftshader só conta); quem diz o que cabe é o `--bench` do dono.** Núcleo, `hashRace` e `sim-golden` intactos (só `src/render`).

### 1. Perfil (antes; pior viewport, Média; `node tools/folga-perfil.mjs`, ganchos por objeto + diferença do `renderer.info`; cena + mapa de sombra)
| categoria | copa-4p △ (cena / sombra) | chamadas | sampa-4p △ (cena / sombra) | chamadas |
|---|---|---|---|---|
| **cenário** (BatchedMesh: árvores, prédios, postes, cercas, marcos) | 77.744 / 61.370 | 12 | 82.670 / 73.630 | 15 |
| **carros** (cascos lod0/lod1, rodas, mancha) | 69.638 / 48.292 | 31 | 98.622 / 67.808 | 28 |
| terreno (2 faixas + horizonte) | 15.690 | 12 | 16.636 | 10 |
| céu (nuvens) | 2.278 | 2 | 2.208 | 2 |
| pista | 2.174 | 5 | 2.110 | 6 |
| efeitos, pós | ~20 | 1 + 16 | ~25 | 1 + 16 |
| **total (pior viewport)** | **277.208** | 79 | **343.710** | 78 |
Alta: copa-4p 305 mil (cenário 163 mil, carros 118 mil); sampa-4p 370 mil (cenário 180 mil, carros 166 mil). Achados: (a) o **passe de sombra era ~40% dos triângulos** (cenário e carros desenhados duas vezes); (b) os lotes do cenário tinham `perObjectFrustumCulled = false`: desenhavam a janela inteira do RoadFrame, atrás da câmera, fora do quadro e fora do mapa de sombra (±80 m); (c) a largada põe 17 cascos completos (3,3–4,4 mil △) a menos de 30 m do líder, e 68 rodas completas (~420 △) — em viewport de meia altura isso é pixel desperdiçado; (d) terreno, céu e pista somam só ~7% e **não foram mexidos** (cortar segmento do terreno renderia < 1,5%, com risco no contorno); (e) as chamadas são estruturais: um lote por estilo de carro × (cena + sombra) × (lod0, lod1) e um por desenho de roda.

### 2. Cortes (cada um com teste escrito antes e visto falhar; `tests/folga-gl.test.ts`, `tests/folga-lod.test.ts`)
1. **Cenário corta por objeto** (`scenery/runtime.ts`: `perObjectFrustumCulled = true`; câmera e caixa do mapa de sombra, +0,35 ms de CPU por quadro com 4 viewports medidos). Teste de pixel no laboratório (mesmo instante, com e sem o corte, limiar 0): **0 pixels trocados** em copa/sampa × Média/Alta × 4 jogadores; galeria: **0 px em 13 de 13 cenas**. Visto falhar: lotes sem corte; Sampa 4p 343.710 > 260.000. (O teste de pixel é "trava": passa antes e depois, porque ligar o corte à mão já era possível; ele prova a invariante. Descobri nele que com 3–4 jogadores a sombra alterna por quadro: snapshot e comparação têm de ter 2 quadros.)
2. **LOD dos carros pelo tamanho na tela** (`cars/lod.ts`, `cars.ts`): casco simplificado e roda simples a **15 m** com 2–4 jogadores (30 m com 1): o viewport tem metade da altura, o carro ocupa os mesmos pixels que a 30 m em tela cheia (mesmo critério já aceito). Visto falhar: módulo inexistente; Sampa 4p 241.390 > 200.000. 1 jogador travado (8 cascos completos em copa-1p).
3. **LOD do cenário pelo mesmo fator** (`runtime.ts` `update(..., lodScale)`): decoração pequena (`maxAhead`) some e o modelo de longe (`farFrom`, palmeiras) entra na metade da distância na tela dividida. Visto falhar: cenário de copa-4p 100.874 > 92.000 (a estimativa de 85.000 que escrevi antes estava otimista: medido 89.294) e `screenLodScale` inexistente. 1 jogador travado (101.126 △ exatos).

### 3. Números (gate, `node tools/folga-gate.mjs`; pior viewport, 640×360, 300 ticks; antes = main 52950f0)
| cena/qualidade | △ antes | △ depois | liberado | chamadas | limite do gate △ / chamadas |
|---|---|---|---|---|---|
| copa-1p Média | 273.892 | 236.278 | 37.614 (14%) | 79 → 78 | 315.000 / 80 |
| copa-1p Alta | 303.317 | 254.963 | 48.354 | 84 → 83 | 340.000 / 84 |
| copa-1p Ultra | 304.003 | 255.649 | 48.354 | 85 → 84 | 340.000 / 85 |
| copa-2p Média | 274.994 | 206.171 | 68.823 (25%) | 78 → 71 | 315.000 / 78 |
| copa-2p Alta | 304.923 | 225.717 | 79.206 | 83 → 76 | 340.000 / 83 |
| copa-2p Ultra | 305.605 | 226.399 | 79.206 | 84 → 77 | 340.000 / 84 |
| copa-4p Média | 277.206 | 204.914 | 72.292 (26%) | 80 → 76 | 316.000 / 82 |
| copa-4p Alta | 305.390 | 222.745 | 82.645 | 81 → 77 | 340.000 / 81 |
| copa-4p Ultra | 306.073 | 223.428 | 82.645 | 85 → 81 | 340.000 / 85 |
| **sampa-4p Média** | **343.704** | **173.456** | **170.248 (50%)** | 78 → 78 | 345.000 / 89 |
| sampa-4p Alta | 370.487 | 176.980 | 193.507 (52%) | 77 → 77 | 380.000 / 88 |
| sampa-4p Ultra | 370.496 | 176.989 | 193.507 | 80 → 80 | 380.000 / 92 |
(Baixa não foi mexida: o corte de câmera vale nela também, mas a Baixa não tem sombra e o gate dela tem folga de sobra.) Chamadas: −4 a −7 na tela dividida (menos estilos de casco completo e de roda completa em cena); em 1 jogador −1. **Ressalva:** na galeria, em tela dividida no meio do pelotão (07, 2p), as chamadas **sobem** 147 → 150 (carros que passam ao casco simplificado abrem lotes lod1 de estilos que antes não tinham): a medida da galeria é de um quadro de corrida, a do gate é a largada.

### 4. Imagem antes × depois (`node tools/galeria/comparar.mjs main-52950f0 folga-3-cenario`, limiar 0,1%; folhas em `scratch/galeria/`)
- 11 de 13 cenas: **0 a 2 pixels** de diferença (corte 1 sozinho: 0 px em todas as 13).
- `07-dividida-2p` 0,66% e `08-dividida-4p` 0,88% dos pixels (as duas únicas que mudam, e só as de tela dividida): são **carros a mais de 15 m passando ao casco simplificado** (0,25% sozinho) e **palmeiras e arbustos do horizonte passando ao modelo de longe**. Recortes ampliados 3–4× com a diferença em vermelho: `docs/v13-recorte-carros-4p.png` e `docs/v13-recorte-palmas-4p.png` (ferramenta `tools/folga-recorte.mjs`). Aberto e conferido: a olho em tamanho de jogo não se nota; ampliado, a copa da palmeira distante tem menos folhas. Julgamento final do dono jogando em 4 jogadores; se incomodar, voltar `screenLodScale` (um número) para 1 só no cenário.
- Pasta com todas as imagens: `scratch/galeria/{main-52950f0,folga-1-corte,folga-2-lod,folga-3-cenario}/` e `comparar-*.png` (a de 6 MB não entrou no git).

### 5. Proposta (decisão do dono depois do `--bench`; nada foi alterado)
Folga em △ de pior viewport, ao limite de hoje: copa-4p Média 111 mil, Alta 117 mil; sampa-4p Média 171 mil, Alta 203 mil; copa-1p Média ~79 mil, Alta ~85 mil. Chamadas: folga de 6 (copa-4p Média) a 13 (sampa-4p Média).
- **Carro herói de 10–20 mil △**: o custo real é em dobro (cena + sombra) = 20–40 mil △, só no viewport dele (os outros carros seguem em lod0 só a 15 m): cabe em qualquer cena com folga de 2–3×. Em 1 jogador o herói é o mesmo carro da câmera; o custo extra é o dele menos os ~4 mil do lod0 atual.
- **Reapertar o gate (se o bench confirmar que a GPU aguenta)**: sugestão por margem de 25% sobre o medido, como na L2: copa-1p Média 300 mil → 295 mil (hoje 315 mil), copa-4p Média ~255 mil, sampa-4p Média ~220 mil, Alta/Ultra ~225–280 mil. Mas o melhor uso é **manter os tetos e gastar a folga**: carro herói (≈ 40 mil △ com sombra), cenário 4p mais rico (+30–50 mil), efeitos. Não reapertar e gastar ao mesmo tempo.
- Não feito (rende pouco ou arrisca a imagem): terreno com menos segmentos (< 1,5%); roda simples com menos lados (já 12); casco lod2 para carros muito longe (precisa de modelo novo; renderia ~15 mil em corrida espalhada); **sombra só dos carros que cabem na caixa do mapa** (truque de `count` por lote; ~7 mil △ em corrida espalhada, nada na largada do gate); encolher a caixa da sombra (muda a sombra); dedup de cenário e faces ocultas de marcos/pontes: o cenário já cai a 18 mil △ de cena em Sampa; sem ganho que valha o risco.

### 6. Ferramentas e arquivos
`tools/folga-perfil.mjs` (perfil por categoria e passe), `tools/folga-gate.mjs <raiz>` (contagens do gate de qualquer worktree), `tools/folga-recorte.mjs` (antes | depois | diferença ampliados), `lab.perfil` e `lab.hold` em `tools/render-harness.lab.ts`. Código de jogo: `src/render/scenery/runtime.ts`, `src/render/cars.ts`, `src/render/cars/lod.ts` (novo), `src/render/renderer.ts` (só passa o número de viewports).
