# V22 · F6 — Sombras e oclusão de contato (branch `nc/f6-sombras`, base `main` 17d43cc, 22/10/2026)

> Frente F6 do plano gráfico V22 (`docs/ondas/V22-diagnostico-cena.md` §3.7 e §6). Pedido do dono: "ainda parece muito desenho; tinha que parecer mais com o Horizon Chase"; diretriz "um pouco mais realista que o Horizon Chase Turbo e mais bonito que ele". Sem artista, sem Meshy, sem pacote pago.
> **Nada muda em `src/core`**, nem save, protocolo online, `palette.ts`, `stylize.ts` ou programa de shader (o material da mancha é o mesmo; a chave de programa não muda). Escopo do plano: (a) sombra falsa direcional, (b) AO fingido na pista/guia, (c) PCF, (d) copas próximas no mapa do sol (Alta/Ultra).

## 1. O que mudou

| Escopo do plano | Feito | Onde |
|---|---|---|
| **(a) Sombra falsa direcional** | A mancha (lote `blob`) deixou de ser um disco redondo centrado: é uma **elipse esticada para longe do sol** (azimute e elevação vêm do `Sky.sunDirLocal`, já girado para cada viewport). Semieixo maior = altura ÷ tan(elevação), preso a [1,2 ; 3,0] × o raio; largura = o raio de antes; a ponta de trás fica no raio de antes (o pé continua coberto). Três formas no mesmo lote, num atlas de 128 px: **copa** (corpo cheio com contorno de folhagem e buracos de sol), **mastro** (faixa fina com a ponta mais larga: poste, outdoor, cipreste, palmeira fina; teto próprio de 12 m, ver §6) e **contato**. Sem sol informado (estúdio, testes antigos) a mancha fica redonda como antes. | `scenery/sombra-falsa.ts` (puro, novo), `scenery/runtime.ts`, `renderer.ts` (1 argumento) |
| **Contato escuro no pé** | Cada objeto com pé (altura ≥ 1,5 m: poste, árvore, placa, pedra, cacto alto) leva **2 discos empilhados** (100% e 60% do raio de contato, que é 0,5 × o raio da mancha): como a opacidade do material é ≤ 0,34, uma camada só some sobre o verde vivo; duas somam ~0,5 no miolo. Arbusto e flor ficam sem (2 △ a mais por objeto contam no gate). | `sombra-falsa.ts` (`CONTACT_*`), `runtime.ts` |
| **Opacidade e tinta** | Teto 0,34 (`blobOpacityFor`): só a noite desce (0,40 → 0,34); o dia fica 0,32. A tinta de sombra da V10 (azul / lilás / roxo, `palette.ts`) não mudou. | `sombra-falsa.ts`, `runtime.ts` |
| **Mancha visível (defeito achado na captura)** | O disco horizontal ficava **enterrado**: o chão tem relevo (±10–25 cm na borda de uma copa), o deslocamento de profundidade era −2 e só os mastros, na faixa plana junto da pista, apareciam. Deslocamento −8 (decalque: cresce com a inclinação vista de longe). E, pior: **em subida o chão fica acima do olho e o quadrado horizontal era visto de costas (cull): o Cânion inteiro ficava sem mancha** (vermelho opaco e sem teste de profundidade nem aparecia). A mancha agora **deita no plano do declive da pista** (normal com a inclinação do trecho). | `runtime.ts` |
| **(b) AO no pé da guia** | `shoulderContactAo(u)`: o pé de FORA da guia no acostamento escurece até 25% (seno², u 0,36–0,58, suave). Antes o degradê só descia da guia clara ao cascalho: a guia parecia pintada no chão. O lado de dentro já tinha a sarjeta escura, e o pé de fora da zebra já tinha −14% (F2). **A faixa sob o asfalto/borda não foi feita**: a faixa de asfalto é uma tira de 2 vértices (a cor por vértice interpolaria na pista toda) e a borda já tem a sarjeta escura de 0,14 m (V11) + a borracha da curva (F2). | `road-textures.ts` |
| **(c) PCF** | O PCF do three r186 tem 5 pontos (disco de Vogel girado por ruído por pixel): a borda granula se a penumbra (raio × texel) é estreita. Mapa de 2048 (Alta/Ultra, 1–2 jogadores; texel 7,8 cm): raio 2 → **3** (penumbra 0,16 → 0,23 m), normalBias 0,12 → 0,10. Mapa de 1024 (Média e 3–4 jogadores; texel 15,6 cm): raio 2 (0,31 m, igual), **normalBias 0,12 → 0,16** (era menor que o texel). Bias −0,00025 igual. O plano (`shadowPlan`) carrega os três números e o `ShadowRing` os grava a cada quadro (a troca de 2 para 3 jogadores muda o texel). | `postfx/plan.ts`, `postfx/shadows.ts`, `sky.ts` (bloco de sombra) |
| **(d) Copas próximas no mapa do sol** | **Entrou.** Alta e Ultra com 1–2 jogadores: a decoração com copa (as partes marcadas `shadow` das árvores de decoração) a menos de 60 m ao longo da pista passa para o lote que já projeta sombra (`flat`): **0 chamadas novas** (o lote já existia), **+10,9 mil △** só no passe de sombra (§3). Na Baixa, na Média e com 3–4 jogadores: nada (`shadowPlan().crowns` = 0). | `postfx/plan.ts` (`crowns`), `runtime.ts` (variante 2 do modelo), `renderer.ts` |

## 2. Arquivos

Código: `src/render/scenery/sombra-falsa.ts` (novo, puro), `scenery/runtime.ts`, `postfx/plan.ts`, `postfx/shadows.ts`, `sky.ts` (só o bloco de sombra, ~l. 586), `renderer.ts` (2 linhas: o sol e `crowns` para o cenário), `road-textures.ts` (`shoulderContactAo`).
Testes: **novos** `tests/sombras-f6.test.ts` (24 testes) e `tests/sombras-f6-gl.test.ts` (1 + o do Chromium). **Alterados com motivo (§4)**: `tests/corrida-que-muda-cenario.test.ts`, `tests/folga-gl.test.ts`.
Ferramentas (só leitura do jogo): `tools/zoom-recorte.mjs` (recorte ampliado), `tools/luma-regioes.mjs` (luma média de regiões), `tools/diff-capturas.mjs` (diferença de duas capturas, com imagem).

## 3. Medidas antes (`main` 17d43cc) → depois

### Gate (`node tools/folga-gate.mjs`, Copacabana e Sampa, pior viewport; mesma máquina, rodado nos dois worktrees)

| cena | Baixa | Média | Alta | Ultra |
|---|---|---|---|---|
| copa-1p △ | 117.646 → 117.682 (+36) | 239.390 → 239.430 (+40) | 259.982 → 270.833 (**+10.851**) | 260.668 → 271.519 (**+10.851**) |
| copa-2p △ | 108.821 → 108.871 (+50) | 209.920 → 209.978 (+58) | 231.299 → 242.172 (**+10.873**) | 231.981 → 242.854 (**+10.873**) |
| copa-4p △ | 105.998 → 106.030 (+32) | 207.188 → 207.224 (+36) | 225.665 → 225.701 (+36) | 226.348 → 226.384 (+36) |
| sampa-4p △ | 75.602 → 75.610 (+8) | 176.030 → 176.038 (+8) | 179.554 → 179.562 (+8) | 179.563 → 179.571 (+8) |

**Chamadas: idênticas nas 16 células** (35/37/39/41 Baixa; 79/72/77/79 Média; 84/77/78/78 Alta; 85/78/82/81 Ultra). O plano pedia **≤ +2 chamadas por viewport** na Alta/Ultra para (d): deu **0**. A parte (a)–(c) deu **0 chamadas** e +8 a +58 △ (as manchas de 2 △ viraram até 6 △ por objeto com pé). Limites de `src/bench/gate.ts` **não foram tocados**; copa-1p Alta 270.833 contra o limite 340.000; Baixa segue a mais barata (117 mil contra 239 mil da Média). A conta do perfil (`tools/folga-perfil.mjs copa-4p medium`): o lote `blob` custa +32 △ por viewport; **o resto que apareceu na 1ª versão (+2,4 mil △ no passe de sombra do lote `flat` na Média 4p) era um defeito meu**, ver §4.

### Imagem

| medida | antes | depois |
|---|---|---|
| Baixa, Serra seg 1100: luma do chão do lado de sombra do pé da palmeira ÷ grama de controle (GL, `sombras-f6-gl`) | **1,059** (a mancha enterrada não aparecia) | **0,85** (−20%; o lado do sol 1,07 → 1,11, não escurece) |
| Alta, Serra seg 1100: luma da faixa do pé da palmeira (160,396,130,12) | 0,4155 | 0,3577 (−14%, com o contato e a sombra real das copas) |
| Alta, Serra: pixels que mudam > 3% de luma com × sem as copas no mapa do sol (`diff-capturas`) | — | 1,5% do quadro (copas autossombreadas e faixas de sombra na grama; ver `copas-04.jpg`) |
| penumbra do PCF (raio × texel) | 2048: 0,156 m · 1024: 0,31 m | 2048: **0,234 m** · 1024: 0,31 m |
| normalBias ÷ texel | 2048: 1,5 · 1024: **0,77** | 2048: 1,3 · 1024: **1,0** |
| Cânion (subida), mancha vista (vermelho opaco, sem teste de profundidade) | 0 pixels | aparece (teste de inclinação em Node, §4) |

## 4. Testes

`tests/sombras-f6.test.ts`, **escritos antes e vistos falhar pelo motivo certo** contra o `main`:
- (A) forma pura: o módulo `sombra-falsa` "não existe" (import); depois de criado o módulo, os de runtime caíram em "blobSlots não existe" (as três formas de mancha não existiam).
- (B) plano do PCF: "high/1 radius: expected 1 to be 3" (o `ShadowRing` não gravava nada; a luz ficava com o raio de fábrica); penumbra e normalBias por mapa.
- (C) no `Scenery` de verdade, em Node (lê as matrizes das instâncias do lote): todas as manchas de copa e de mastro a ≤ 10° do azimute oposto ao sol em 3 trechos (a árvore e o poste na MESMA direção; plano V22 §3.7 teste 3); copa com razão eixo maior ÷ menor entre 1,2 e 3,0 e alguma > 1,5; sol baixo estica mais que sol alto; contato dentro da própria elipse; sem sol = redondo; opacidade ≤ 0,34 e B ≥ R nos três períodos, sem tocar a `version`.
- (D) `shoulderContactAo` e o acostamento: "pé 0,534 ÷ miolo 0,467: expected 1,143 ≤ 0,97" (valor, antes do AO).
- (E) copas no mapa do sol: `shadowPlan().crowns`; "esperado ≥ 132, recebido 128"; e o teste do `ahead` (abaixo).
- **Dois defeitos meus achados pelos testes/medidas e corrigidos com teste antes**: (1) a decoração **atrás do carro** (`ahead` < 0) passava em `ahead < crownSegs` mesmo com `crowns` = 0 e entrava no mapa do sol (+2,4 mil △ no passe de sombra da Média 4p, e a trava `folga-gl` 4p Média estourou: 94.022 contra 92.000); teste "com `crowns` = 0 NUNCA" falhou com "crowns 0: ahead -4: expected true to be false"; (2) a mancha horizontal em subida (acima), teste "a mancha acompanha a INCLINAÇÃO": "normal·frente 0.000 esperado -0.151".
- `tests/sombras-f6-gl.test.ts` (Chromium, 1280×720, Baixa): **visto falhar no `main`** ("sombra ÷ controle 1.059: expected … ≤ 0.92") e passar aqui (0,85).

**Travas existentes alteradas, com motivo (padrão V10 §3); nenhuma afrouxada às cegas:**
1. `tests/corrida-que-muda-cenario.test.ts`, `blobMat.opacity` à noite 0,4 → **0,34** (o teto do runtime; a elipse esticada cobre mais chão que o disco; `palette.ts` continua 0,32 · 0,32 · 0,40 e a trava de `sceneryLook` na mesma suíte segue igual).
2. `tests/folga-gl.test.ts`, `CENARIO_COPA_1P` 104.238 → **104.276** (+38 △: a mancha em elipse + contato em duas camadas, 2 △ → até 6 △ por objeto com pé; o que o teste prova, que o corte de LOD da tela dividida não toca 1 jogador, segue; a metade "4p Média < 92.000" **passou sem mexer**).
3. Nenhuma outra: `scenery*`, `hc2-*`, `vegetacao-f4`, `predios-f5`, `cor-brilho(-gl)`, `noite-roxa-gl`, `corrida-que-muda*`, `estrada-*`, `pistas-v4`, `postfx-plan`, `stylize`, `gl-render` (gate) passaram sem mexer.

## 5. Imagens e rodadas de crítica (`docs/diag-v22/f6-sombras/`, JPEG ≤ 250 KB; mesma câmera, 1280×720, harness)

`antes-NN` / `depois-NN` de `01` (Copacabana dia), `03` (Foz), `04` (Serra, o quadro que mostra o ganho), `05` (Sampa, noite), `06` (Paraty, entardecer), `07` (Cânion, contraluz), `08` (2 jogadores), `09` (4 jogadores), `13` (Baixa); `copas-04` = recorte 3× da Serra, em cima SEM e embaixo COM as copas no mapa do sol. Alta, salvo `13`. Comandos: `PORT=<porta> node tools/capture.mjs "04::track=serra_do_navio&seg=1100&hud=0&q=high&cam=high&frames=14"` (idem `copacabana&seg=300`, `foz_do_iguacu&seg=215`, `sampa_noite&seg=970`, `paraty&seg=200`, `canion&seg=130`; `&humans=2|4&ticks=1500`; `q=low`).

**Rodadas olhando a captura:**
1. **1ª — a mancha não aparecia.** Elipse esticada e textura de folhagem prontas, e na Serra e na Foz não se via nada. Vermelho opaco mostrou: a mancha estava enterrada no relevo (só os mastros, na faixa plana, apareciam). Deslocamento de decalque −8; luma do pé da palmeira 0,4155 → 0,372 (−10%, ainda tímido). Corpo cheio na textura + contato em 2 camadas (a opacidade do material é ≤ 0,34, e uma camada só some no verde vivo): −14% no pé, −20% do lado da sombra na Baixa.
2. **2ª — as copas (d).** Medido com × sem: as árvores ganham sombra no chão (faixas escuras para o mesmo lado, em todas) e autossombra (face de baixo e do lado oposto ao sol mais escura): é o ganho de coerência que o diagnóstico pedia e o que mais se vê (`copas-04`). **Cânion sem mancha nenhuma** (nem com vermelho opaco e sem teste de profundidade): achado pelo `_multiDrawCount` (101 desenhadas) × zero pixels → a mancha horizontal vista de baixo. Corrigido deitando a mancha no declive, com teste.
3. **3ª — todas as cenas.** Média (`q=medium`, sem copas, 1024): sem acne, a mancha dá o pé escuro; noite roxa e entardecer sem lavar a cor (`noite-roxa-gl`, `cor-brilho-gl` verdes); 2 e 4 jogadores sem artefato; Baixa quase igual (poucas árvores em Copacabana): só o contato dos postes e das palmeiras e a faixa da guia.

**Critério de "pronto visual" do plano, honestamente:**
- *Em `03`/`04` as sombras de árvore e de poste apontam juntas:* **atendido** na Alta (real e falsa vêm do mesmo vetor do sol; teste: todas a ≤ 10° do azimute) — na Serra, copas, palmeiras e postes projetam para o mesmo lado (`copas-04`). Na Média e na Baixa só a mancha falsa aponta (a real das copas de decoração é só Alta/Ultra).
- *O pé de cada objeto tem contato escuro curto:* **atendido, mas tímido**: o contato é −14% de luma no pé da palmeira da Serra (−20% o lado da sombra na Baixa). É legível de perto (`depois-03`, `depois-04`), pouco na Copacabana (a faixa de areia tem poucas árvores) e quase nada no Cânion contra o sol.
- **Não chegou lá:** (i) a mancha é um quadro plano de alfa ≤ 0,34: não substitui a sombra de verdade (de longe e contra o sol some); (ii) o "serrilhado" do PCF: a penumbra subiu de 0,16 para 0,23 m na Alta e **não consegui ver diferença nas capturas** (a diferença de luma na borda das sombras da pista é < 1% e as bordas já eram suaves; raio 24 de teste muda 15% do quadro, então o parâmetro age); fica registrado como ajuste de contrato, não como defeito comprovado resolvido.

## 6. Ressalvas

1. **(d) custa +10,9 mil △ por viewport na Alta/Ultra com 1–2 jogadores** (copa-1p Alta 271 mil contra o limite 340 mil; só passe de sombra, 0 chamadas). Folga boa, mas é o que mais pesa nesta frente; o `--bench` do dono é o juiz. Para desligar: `CROWN_SHADOW_M = 0` em `postfx/plan.ts`.
2. A sombra de copa **entra e sai a 60 m** (a árvore cruza o corte e a sombra dela aparece): pequena, de longe; o mapa cobre ±80 m. Não suavizei o corte.
3. **Mastro**: o raio da mancha de um poste é 0,7 m e a regra "[1,2 ; 3,0] × o raio" daria 2 m a um poste de 10 m; mastro (altura ÷ raio ≥ 6,5) tem teto próprio de 12 m (`THIN_LEN_MAX_M`), documentado no código (atalho: sombra de poste mais longa, com sol a menos de ~35°, é cortada ali).
4. **O disco deita no declive ao longo da pista, não de lado**: relevo lateral (±10–25 cm na borda da copa) ainda enterra um canto da mancha; o decalque −8 cobre a maior parte.
5. **Opacidade**: o plano dizia 0,34 → 0,28; o dia ficou em 0,32 de propósito (uma mancha mais fraca some no verde vivo, medido) e só a noite desceu (0,40 → 0,34).
6. **Bônus (prédio em tela dividida): avaliado e não feito.** A F5 deixou +1,1% (copa-4p Média) e +1,5% (Sampa-4p Média) de △ nos prédios; o ganho de uma versão "simples" no `lodScale` 0,5 é ≤ ~2,5 mil △ (sem fonte nova de contas: Sampa-4p Média 176 mil contra o limite 345 mil e a trava `folga-gl` 4p Média passa com folga depois desta frente), a custo de um segundo modelo por prédio (os visuais moram em `structures.ts`/`catalog.ts`, fora do meu escopo) e de um salto visível na fachada no corte de distância. Não vale; fica registrado.
7. **Gosto é do dono.** O ganho que se vê de longe é o das copas na Alta (`copas-04`); a mancha falsa é discreta por desenho.

## 7. Comandos

```
npx tsc --noEmit -p .
npx vitest run tests/sombras-f6.test.ts tests/scenery tests/postfx-plan.test.ts tests/corrida-que-muda-cenario.test.ts tests/estrada-v11.test.ts tests/pistas-v4.test.ts tests/vegetacao-f4.test.ts tests/predios-f5.test.ts
NC_REQUIRE_GL=1 npx vitest run tests/sombras-f6-gl.test.ts tests/gl-render.test.ts tests/folga-gl.test.ts tests/corrida-que-muda-gl.test.ts tests/cor-brilho-gl.test.ts tests/hc2-gl.test.ts tests/noite-roxa-gl.test.ts tests/predios-f5-gl.test.ts tests/estrada-gl.test.ts tests/ceu-f3-gl.test.ts tests/terreno-detalhe-gl.test.ts tests/efeitos-gl.test.ts --no-file-parallelism
node tools/folga-gate.mjs <raiz> saida.json          # o gate (Copacabana e Sampa); main × branch
node tools/folga-perfil.mjs saida.json copa-4p medium  # △ por lote, principal × sombra
node tools/diff-capturas.mjs a.png b.png saida.png     # onde duas capturas diferem
```
