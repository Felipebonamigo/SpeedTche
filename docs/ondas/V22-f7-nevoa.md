# V22 · F7 — Névoa atmosférica, gradação e pós (a frente arquitetural)

> Branch `nc/f7-nevoa` (base `9699ede`, o `main` com F1–F6 e F8). Só `src/render` + testes + ferramentas de captura. Nada em `src/core`: `sim-golden`, `hashRace` e `determinism` seguem verdes.
> Imagens em `docs/diag-v22/f7-nevoa/` (JPEG): `antes-NN-*` (o `main` de partida, worktree limpo) × `depois-NN-*`, câmera Alta, 1280×720, desfoque radial ligado: 01 Copacabana (dia), 02 Foz, 03 Xingó, 04 Passo Alpino, 05 Paraty (entardecer), 06 Cânion (entardecer), 07 Sampa (noite), 08 Caldas Novas (savana), 09 Aracaju (noite).

## 1. O que mudou

| Item do plano | Feito | Onde |
|---|---|---|
| (a) névoa com altura e tom por lado do sol | **Sim.** Os 4 chunks globais `fog_*` do three são remendados uma vez (`installAtmosphere`, chamado por `installToneMapping`; falha alto se o three mudar a âncora). A base continua o `FogExp2` (o `sight.ts`, o corte do cenário e `fog-sync` seguem valendo); por cima entra uma bruma extra `1 − (1 − base)(1 − extra)`: começa em 90 m (0 até lá), chega ao teto em 380 m, **vale 1,36× 30 m abaixo da câmera e 0,64× 30 m acima** (vale mais enevoado que o cume) e a cor da névoa vai ao brilho do período do lado do sol e esfria do outro. `vFogRay` (posição de vista) vai do vértice ao fragmento; `uFogUp`/`uFogSunH` são por viewport (`setFogView`, chamado em `drawViewport`). Fragmentos a < 90 m saem no primeiro `if`. | `src/render/atmosphere.ts` (novo), `stylize.ts`, `renderer.ts` |
| (b) mesma conta nos anéis | **Sim.** O shader do anel (fog: false, névoa assada) chama a MESMA `stylizeAtmosphere` (`ATMOS_FN`) com a posição de vista: o pé do morro leva mais bruma que o cume, o tom segue o sol. | `terrain.ts` (só os dois shaders do anel; `buildRing` intacto) |
| (c) split-toning e chão com 3 tons | **Chão sim; split-toning no `gradingFor`: não** (ver §5). `Palette` ganha `groundWarm` (claro, matiz para o amarelo, +14% de valor) e `groundCool` (escuro, matiz para o azul-esmeralda, −20%); o terreno usa os dois no lugar de `low`/`high` onde o tom do chão passa/cai de 0,5. Matiz claro × escuro do chão na imagem: ≥ 13° (antes 7°). | `palette.ts`, `terrain.ts` |
| (d) saturação com hierarquia | **Chão sim**: `GROUND_TRIO.trim` desce a saturação do chão de dia e do entardecer (mata 0,80×; costa/serra 0,90×; savana/cidade 0,92×); céu, carro e HUD não mudaram. | `palette.ts` |
| (e) noite com matiz separado | **Sim.** Pista da cidade à noite → rosa-mauve (321°, mesma luma), pistas da serra e da costa → rosa (320°/325°), tom do prédio/cenário (`worldLook`) → índigo `#4a52d8` (237°). Na imagem de Sampa: pista 315°, chão 294°, prédio 261° (antes 306°/288°/286°). | `palette.ts`, `stylize.ts` |
| (f) vinheta + dither no `OutputPass` | **Sim, 0 passe.** `patchOutputFragment` põe os dois entre o tone mapping e a conversão de cor. Vinheta: 0 até 55% do raio, 11% de luma de tela no canto (1 jogador; 8% com 2; 5% com 3–4: `PostPlan.vignette`; 0 na Baixa, que não tem o passe). **Dither único:** o do domo (F3) saiu do shader e usa a mesma `stylizeDither` (stylize.ts); o domo só o dá na Baixa (`uDither`), da Média em diante é o do `OutputPass`, em todo pixel. | `postfx/pipeline.ts`, `postfx/plan.ts`, `sky.ts`, `stylize.ts` |
| (g) um efeito real a mais no Ultra | **Não entregue** (ver §5). | — |

Marcos do horizonte (`scenery-haze`): **não** levam o tom do lado do sol (tentei: o Pão de Açúcar virava verde-acinzentado, creme sobre a névoa ciano); só a bruma de sempre.

## 2. Medidas (Alta, 640×360, `tools/render-harness.lab.*`; a mesma cena com `uFogAmt` = 0 como "antes")

| Medida | antes | depois |
|---|---|---|
| Névoa a 300 m, Alta/Ultra, qualquer bioma e período | 28% | **47–60%** (≥ 40% travado); a 80 m < 5%, e até 90 m exatamente a do FogExp2 |
| Horizonte da Foz: saturação / luma | 0,707 / 0,445 | **0,641** / 0,478 |
| Horizonte de Copacabana: saturação / luma | 0,767 / 0,456 | **0,665** / 0,497 |
| Chão da Foz: matiz claro − escuro | +7,3° | **−15,4°** (|Δ| ≥ 8° travado); saturação 0,722 → 0,713 |
| Chão do Passo Alpino: saturação / Δ de matiz | 0,751 / +12,1° | 0,759 / −13,1° |
| Vinheta (fundo liso, pipeline real) | 1,000 (canto ÷ centro) | **entre 0,88 e 0,97** (limites do teste; valor não registrado); miolo e 28% do raio sem mudança (< 0,3%) |
| Dither na saída (resíduo fino do fundo liso) | 0,00000 | **≥ 0,0012**, < 0,006 |
| Noite de Sampa: pista / chão / prédio (matiz na imagem) | 306° / 288° / 286° | **315° / 294° / 261°** (≥ 20° entre os três) |

**Gate (`src/bench/gate.ts` NÃO foi tocado; `ultra.ts` idem):** `gl-render.test.ts` (o gate de chamadas × △ × passes × pós e a compilação de todos os programas) verde, **0 △ e 0 chamadas a mais, passes 5 (4 na Alta com 3–4 jogadores) e `postPxRatio` inalterados**: a vinheta e o dither são fragmento do `OutputPass`, a névoa é chunk. Programas: nenhum novo na corrida (`corrida-que-muda-gl` verde); os chunks `fog_*` mudam o texto de todos os programas com névoa, recompilados na carga. **ALU não medida** (swiftshader): o plano estimava +3–5 por pixel; a conta tem ~30 mas só roda a partir de 90 m (o `if` corta o resto) e é um bloco só.

## 3. Testes (escritos antes; o GL visto falhar contra o `main` num worktree limpo)

- **Puro (`tests/nevoa-f7.test.ts`, 20):** âncoras e remendo dos 4 chunks (falha alto), idempotência; névoa a 300 m ≥ 40% e a 80 m < 5% e igual ao FogExp2 até 90 m, nunca tira a base, cresce com a distância, Baixa ≥ Alta, altura (vale > nível > cume); uniformes por paleta e `setFogView` na câmera; contínuo na corrida que muda (nenhum canal > 0,07 por passo de 5% da transição); `patchOutputFragment`, `vignetteAt` (0 no miolo, ≤ 12% no canto, sem degrau), `PostPlan.vignette`; **um dither só** (`uDither` 1 só na Baixa, `DITHER_GLSL` única); `groundWarm`/`groundCool`; matiz noite ≥ 20°. Visto falhar: o numérico com `ATMOS_AMOUNT = 0` (0,277 < 0,4: "resultado errado"), o resto por "não existe".
- **GL (`tests/nevoa-f7-gl.test.ts`, 6):** nenhum programa quebra; horizonte perde ≥ 0,03 de saturação e não escurece (Foz, Copacabana); chão 0,60–0,82 e Δ de matiz ≥ 8° (Foz, Alpino); vinheta e dither (página `tools/saida-detalhe.*`: o `ViewportPipeline` de verdade sobre fundo liso); Sampa à noite. Contra o `main` (worktree `f7-antes`): 4 de 6 falharam por resultado errado (horizonte igual com/sem, Δ de matiz 7,3°, vinheta 1,000, pista × chão 17,8°); os 2 que passaram (programas, e o chão dentro de 0,60–0,82) já valiam.
- **Rodados verdes (saída lida):** `tsc --noEmit`; vitest 61 arquivos / 1.027 testes (`render*`, `scenery*`, `hc2*`, `bench`, `postfx*`, `horizon*`, `ceu-f3`, `predios-f5`, `vegetacao*`, `fx*`, `sombras*`, `folga*`, `terrain*`, `quality*`, `determinism`, `sim-golden`, `landmark*`) e mais 20 arquivos de cor/paleta/corrida-que-muda/pós (289 testes); GL (`NC_REQUIRE_GL=1`): `gl-render` (o gate), `nevoa-f7-gl`, `ceu-f3-gl`, `noite-roxa-gl`, `cor-brilho-gl`, `hc2-gl`, `corrida-que-muda-gl`, `estrada-gl`, `terreno-detalhe-gl`, `folga-gl`, `predios-f5-gl`, `sombras-f6-gl`, `efeitos-gl`, `texturas-gl` (12 de 14 na 1ª rodada; os 2 vermelhos eram travas de cor, movidas abaixo; `hc2-gl` B ficou vermelho uma vez com a máquina carregada pela suíte do orquestrador e passou sozinho, 4/4). Suíte inteira: com o orquestrador.

## 4. TODAS as travas alteradas (padrão V10 §3: valor novo, medida, por quê)

1. `tests/noite-roxa.test.ts` · "o dia e o entardecer não mudam um campo": ignora `groundLow`, `groundHigh`, `grassLight`, `grassDark` (saturação do chão desce de propósito: `GROUND_TRIO.trim`) e `fog` do deserto de dia (o azul do meio do céu cinzava a névoa laranja: mesa distante marrom-acinzentada na captura; `fogK` 0,28 → 0,1). **A luz do carro não mudou**: `hemiGround` (rebatimento) e `fogLight` seguem calculados do chão e da névoa de antes, e as travas "byte a byte" de `hemiGround` e `cor-brilho` "dia travado" continuam intactas.
2. `tests/noite-roxa.test.ts` · tom do cenário: 270–330° → **230–280°** (o `worldLook` foi de `#a83cc4`, 288°, a `#4a52d8`, 237°; medido 237°). Motivo: chão (275–323°) e pista já ocupam o magenta; o prédio precisa de ≥ 20°.
3. `tests/estrada-v11.test.ts` · asfalto da cidade à noite: matiz 245°–290° → **290°–335°** (albedo 287° → 321°, `#a276ae` → `#b4729c`, luma 0,515 → 0,514). Saturação ≥ 0,25 e "sem azul-marinho" intactos.
4. `tests/cor-brilho.test.ts` · 2c, cidade à noite renderizada: matiz 245°–300° → **290°–335°**; B − R 8–60 → **−60…+15** (medido 308° à sombra / 322° no albedo). Mesmo motivo do item 3.
5. `tests/estrada-gl.test.ts` · Sampa à noite na imagem: matiz 245°–300° → **290°–335°**; B − R 5–90 → −60…+15 (medido 315°; antes 285°).
6. `tests/ceu-f3-gl.test.ts` · dither do céu: o ensaio passou de qualidade `high` a **`low`** (o domo desenha direto no canvas: é o caminho da Baixa; da Média em diante o dither é do `OutputPass`, medido em `nevoa-f7-gl`). Valores e limites iguais.
7. Palette: ROAD_TONE night (cidade `#b4729c`, serra `#9a6488`, costa `#8c7482`) e `NIGHT_ROAD_ALT` da cidade (`#f0bcd8`); `fogK` do deserto de dia (0,1); `GROUND_TRIO`. Sem teste de contrato afrouxado além dos listados.

## 5. Ressalvas honestas

- **(g) não entrou.** Raios de sol a meia resolução precisam do sol na tela e de dia ele está fora do quadro (a opção B do dono, sol a ~25°, não foi tomada): o ganho visual seria quase nulo, e o contrato "Alta × Ultra ≥ 12% dos pixels" não se cumpre com raios. DoF só de menus pede o sinal do palco e não muda a corrida. O gate do Ultra, portanto, não foi editado e o Ultra continua "Alta + AO em resolução cheia". Fica para decisão do dono.
- **Split-toning por valor no `gradingFor`: não mexi.** O matiz do chão passou a variar por valor pelo chão de 3 tons (palette), e a medida (Δ ≥ 13°) cumpre o contrato; mexer na gradação global arrisca o carro (tinta de lataria) e as travas hc2/cor-brilho, sem ganho medido a mais.
- **Alpino: a "faixa reta" continua visível** (`04`), só mais suave pela bruma de distância; é a barranca de 25 m vista de baixo (F1 §3), acima da câmera, onde a altura DIMINUI a bruma (0,64×). Eliminar pede geometria.
- **Planos distantes ainda frios na Foz** (os morros seguem turquesa, só mais pálidos): o tom quente do lado do sol foi limitado a 0,25 porque mais creme sobre a névoa ciano da costa vira verde-acinzentado. Os morros do lado oposto ao sol esfriam por desenho.
- **Saturação:** o contrato 0,60–0,82 medido em caixas com cobertura (tufos e árvores dentro) deu 0,71–0,76; o capim liso sob luz direta da Serra (0,93 no diagnóstico) não tem caixa própria no teste. O carro continua o objeto mais saturado (listras azuis e lanternas ≥ 0,85) por inspeção das capturas; **`tools/referencias.mjs` não foi rodado** (20+ min de swiftshader).
- **Vinheta com 4 jogadores:** 5% por viewport (os cantos de dentro se encontram no meio); não conferi visualmente a tela dividida.
- **Cintilação/vídeo, FPS e ALU:** não medidos (só imagens paradas; swiftshader).
- A ordem pedida (teste antes do código) foi seguida nos testes GL e no numérico; `atmosphere.ts` foi escrito antes dos testes puros e depois exercitado com `ATMOS_AMOUNT = 0` para vê-los falhar pelo motivo certo (mesmo recurso da F3).
- Gosto do dono: `ATMOS_AMOUNT` (0,38), `ATMOS_REACH` (380 m), a vinheta (11%), `GROUND_TRIO`, o índigo do prédio.

## 6. Comandos

`npx vitest run tests/nevoa-f7.test.ts` · `NC_REQUIRE_GL=1 npx vitest run tests/nevoa-f7-gl.test.ts --testTimeout=1700000` · `PORT=<porta> node tools/capture.mjs "foz::track=foz_do_iguacu&seg=215&hud=0&q=high&cam=high&frames=14"` (idem `copacabana&seg=300`, `xingo&seg=110`, `passo_alpino&seg=180`, `paraty&seg=200`, `canion&seg=130`, `sampa_noite&seg=970`, `caldas_novas&seg=200`, `aracaju&seg=200`).
