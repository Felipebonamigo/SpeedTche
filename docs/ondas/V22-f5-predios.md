# V22 · F5 — Prédios, placas e adereços de estrutura (branch `nc/f5-predios`, base `main` 3fec898, 22/10/2026)

> Frente F5 do plano gráfico V22 (`docs/ondas/V22-diagnostico-cena.md` §3.6 e §6). Pedido do dono: "ainda parece muito desenho; tinha que parecer mais com o Horizon Chase"; diretriz "um pouco mais realista que o Horizon Chase Turbo e mais bonito que ele". Sem artista, sem Meshy, sem pacote pago: tudo procedural em `src/render/scenery/`.
> **Nada muda em `src/core`**, nem save, protocolo online, `palette.ts`, `stylize.ts`, `runtime.ts` ou programa de shader novo (o material da fachada é o mesmo; só as texturas e as cores de vértice mudam). A pegada e a altura de todos os prédios, e a largura/altura de poste, outdoor e placas, são as de antes (±1 cm, testado).

## 1. O que mudou

| Escopo do plano | Feito | Onde |
|---|---|---|
| **AO por vértice no pé e sob beirais** | Pé do prédio: escurece até 60% nos primeiros 1,4 m (curva `t^1,5`), com `sliceY` cortando os triângulos em y = 0,5 m para o degradê ter vértices (a face de fundo, voltada para trás, não leva corte). Barriga das lajes, cornija, toldo e beirais (faces voltadas para baixo, de 2,5 m para cima): −38%. A **parede logo abaixo de cada laje** leva a sombra do beiral na textura (gradiente de 16 px = 0,75 m, ~34%, no topo de cada andar, em todos os 16 visuais). Poste, outdoor e placas: contato escuro no pé (`footShade`, sem cortar malha). | `structures.ts` (`occlude`, `sliceY`, `footShade`), `textures.ts` (`eaveShade`), `props.ts` |
| **Adereços de telhado** | Banco de 2 condicionadores junto à borda da frente (o que se vê de baixo), caixa-d'água de plinto com tampa cônica e mastro de antena com travessa; sorteados pela semente, espelhados pelo visual, fora dos retângulos já ocupados (casa de máquinas, caixa-d'água antiga). Prédio clássico: chaminé com tampa, tubos e antena de TV. **Nunca passam do topo de antes** (altura ±1 cm). Mesmo lote `flat`: 0 chamadas. | `structures.ts` (`rooftop`) |
| **Janelas com 3 níveis de acendimento** | Antes todas à mesma força (só mudava o tom). Agora fraco (luma ~0,28: abajur, TV), médio (~0,53) e forte (~0,88), repartidos por sequência de razão áurea sobre a semente; cada janela acesa tem faixa mais escura embaixo (o teto ilumina, o móvel não) e, em 30%, cortina puxada de um lado. | `textures.ts` (`litLevel`, `litRect`) |
| **Reflexo de céu fingido** | O vidro (`glass()`, agora em todos os visuais, inclusive o desenho antigo da célula 0) leva o degradê escuro + uma camada de céu azul-claro que some em 60% da altura + um clarão diagonal. No mapa de luz o vidro **não** herda a luz da parede (janela apagada fica escura) e leva só um fiapo do céu no alto. | `textures.ts` (`glass`) |
| **Parede não fica preta** | Luz difusa própria da parede no mapa emissivo (cor `#44385a`, mais escura no topo de cada andar): no entardecer a face à sombra do sol deixa de ser preta; de dia a emissiva é 0 (o `emissiveIntensity` da fachada é 0), então o dia não muda. | `textures.ts` (`wallLight`) |
| **Poste e painel com suporte detalhado** | Poste: pé alargado, tirante do braço, viseira da luminária. Outdoor: guarda-corpo da passarela (5 montantes e corrimão), escada de marinheiro e mãos-francesas. Placa de curva: sapatas de concreto e travessa. Placa do box: sapata, braçadeira e capa do poste. | `props.ts` |

`catalog-structures.ts` **não foi criado**: nenhum id novo foi preciso (os modelos existentes ganharam o detalhe, o catálogo não mudou; degrau 1 da escada de código do projeto: "isso precisa existir?").
As chaves `structureDetail.ao` e `structureDetail.roof` (`structures.ts`) existem só para os testes e para o antes × depois; o jogo sempre as tem ligadas.

## 2. Arquivos

Código: `src/render/scenery/structures.ts`, `textures.ts`, `props.ts` (os da frente). Nada fora da lista.
Testes: **novos** `tests/predios-f5.test.ts` (79 testes), `tests/predios-f5-gl.test.ts` (2), `tests/canvas-raster.ts` (canvas 2D que desenha de verdade em Node: `fillRect`, polígono/arco, gradiente linear, alfa; serve para medir a textura da fachada sem navegador). **Alterados com motivo (§5)**: `tests/scenery-props.test.ts`, `tests/vegetacao-f4.test.ts`. Ferramenta: `tools/png2jpg.mjs` (PNG → JPEG pelo Chromium; a máquina não tem ImageMagick).

## 3. Medidas antes (`main` 3fec898) → depois

| medida | antes | depois |
|---|---|---|
| níveis de luz das janelas (fração da área acesa: fraco / médio / forte) | 0 / 0 / 100% (luma 0,85–0,92) | ≥ 8% em cada um, nos 16 visuais (teste) |
| parede da torre de Paraty ao entardecer, GL 1280×720 (`06`): P75 dos pixels que não são janela acesa; razão a P95 | ≈ 0,02 (mediana da metade escura: 0,018), razão 0,02 | **0,161**, razão **0,331** (plano: ≥ 0,25) |
| topo do vidro ÷ pé, nas janelas acesas (albedo) | 0,75 a 1,86 | ≥ 1,45 em todos |
| pé do térreo ÷ meio (cor, com × sem AO) | 1,0 | ≤ 0,8 (5 prédios) |
| barriga das lajes ÷ cima (com × sem AO) | 1,0 | ≤ 0,75 |
| △ por prédio (catálogo) | aptbeach 12 and.: 616; apt 9: 636; vidro 12: 700; tijolo 6: 442; clássico 5: 1.028 | +~100 a +270 (AO ~+36 a +126, telhado ~+32 a +176) |
| poste / outdoor / placa de curva / placa do box (△) | 272 / 522 / 166 / 138 | 310 / 698 / 202 / 174 |
| custo estático por segmento, pior pista (Roma, `scenery-forma`, teto 900) | ≤ 900 (807 na lotação de 3–4) | 885 |

### Gate (`node tools/folga-gate.mjs`, Copacabana e Sampa, pior viewport; `main` 3fec898 × este branch)

| cena | Baixa | Média | Alta | Ultra |
|---|---|---|---|---|
| copa-1p △ | 116.474 → 118.286 (+1.812) | 237.116 → 240.790 (+3.674) | 257.034 → 262.346 (+5.312) | 257.720 → 263.032 (+5.312) |
| copa-2p △ | 107.649 → 109.461 (+1.812) | 207.684 → 211.320 (+3.636) | 228.351 → 233.663 (+5.312) | 229.033 → 234.345 (+5.312) |
| copa-4p △ | 104.826 → 106.638 (+1.812) | 204.874 → 208.676 (+3.802) | 222.717 → 228.029 (+5.312) | 223.400 → 228.712 (+5.312) |
| sampa-4p △ | 74.798 → 76.266 (+1.468) | 173.456 → 178.014 (+4.558) | 176.980 → 181.538 (+4.558) | 176.989 → 181.547 (+4.558) |

**Chamadas: idênticas em todas as 16 células** (34/36/38/40 Baixa; 78/71/76/78 Média; 83/76/77/77 Alta; 84/77/81/80 Ultra). **Maior acréscimo: +5,3 mil △** (limite do plano: +8 mil). Limites de `src/bench/gate.ts` **não foram tocados**; Baixa segue a mais barata. **Desvio:** "4p Média intacto" **não foi atingido**: copa-4p Média +3.802 △ (+1,9%) e sampa-4p Média +4.558 △ (+2,6%, 178.014 contra o limite de 345.000). O motivo: o detalhe está na geometria do prédio (o `runtime.ts`, da F6, não tem como variar o modelo por lotação), então todo prédio visível o paga. Para zerar na 4p, a saída é a F6 passar uma "versão simples" do prédio na tela dividida (hoje só o LOD de distância existe, e prédio não tem modelo `far`).

## 4. Testes

`tests/predios-f5.test.ts`, **escrito antes e visto falhar pelo motivo certo** contra o código do `main`: níveis de luz "faixa 0 (0,00/…): esperado ≥ 0,08" em 16/16 visuais; beiral 0–59% das colunas contra 65%; vidro 0,75 a 1,26 contra 1,45; luz difusa da parede "0 (exige ≥ 0,04)"; razão com × sem AO "esperado 1 ≤ 0,8 / 0,75" nos 5 prédios; adereços "0 △ (exige ≥ 20)" (com o telhado neutralizado: 4 de 5 vermelhos pela mesma razão; o 5º, o clássico, tem a chaminé fora da chave `roof` e não é contado como vermelho); poste/outdoor/placas com delta de △ abaixo do mínimo. O GL (`predios-f5-gl.test.ts`) falhou antes com a parede em 0,018. Três formulações foram corrigidas **depois de olhar o dado**, preservando a falha original: (a) o teste do pé media a mediana de cores de peças diferentes (a fundação enterrada, o vidro do térreo) e passava por acaso → passou a comparar o **mesmo prédio com e sem AO** (vértices de mesma posição e normal); (b) o beiral media a luma em colunas que atravessam janelas → passou a olhar só a coluna de borda de cada janela; (c) a "parede" do GL, a mediana da metade escura, era vidro apagado → passou a ser o P75 dos pixels que não são janela acesa.
A semente do nível de luz (`+ 0,62` na sequência de razão áurea) foi escolhida entre 3 valores para que as 16 células tenham os 3 níveis (as outras deixavam 1 a 3 células sem um nível): é sorte determinística, documentada no código.

**Travas existentes alteradas, com motivo (padrão V10 §3); nenhuma foi afrouxada às cegas:**
1. `tests/scenery-props.test.ts`, teto de △ do outdoor 600 → 680 (o suporte detalhado custa ~+176 △ por outdoor, poucos por pista; o teto é por modelo, e o custo de quadro continua preso em 900 por segmento). O poste (≤ 320) e as placas (≤ 220) **couberam** sem mexer.
2. `tests/vegetacao-f4.test.ts`, "custo estático do layout de 3–4 jogadores": `781 × 1,08` → `781 × 1,18`. O teto media só o enfeite da F4; a F5 acrescenta ~+78 △ no pior segmento (Roma: 885 contra 807) por prédio, e o teto próprio de 900 do `scenery-forma` segue valendo.
3. Nenhuma outra: `scenery-forma` (≤ 900 △/segmento), `scenery-copacabana`, `pistas-v4` (4 visuais com a mesma pegada, altura e frente), `hc2-cenario`, `cor-brilho(-gl)`, `noite-roxa-gl`, `gl-render` passaram sem mexer.

## 5. Imagens (mesma câmera, Alta, 1280×720, harness; `docs/diag-v22/f5-predios/`, JPEG)

`antes-`/`depois-` de `01` (Copacabana, dia), `05` (Sampa, noite) e `06` (Paraty, entardecer). Comandos: `PORT=<porta> node tools/capture.mjs "06::track=paraty&seg=200&hud=0&q=high&cam=high&frames=14"` (idem `copacabana&seg=300`, `sampa_noite&seg=970`); `node tools/png2jpg.mjs <dir> a.png b.png`.

**Rodadas de crítica olhando a captura:**
1. 1ª: janelas e beirais legíveis (`depois-06`: andares separados pela sombra do beiral, vidro apagado com céu, janelas de 3 intensidades), mas a parede ainda quase preta (P75 0,109, razão 0,224) → luz difusa da parede de `#342c44` para `#44385a` e janela fraca de 0,34 para 0,42 (para continuar acima da luz da parede).
2. 2ª: `depois-05` (noite): a mesma cidade roxa, os prédios da esquerda mais claros e com os andares marcados; sem lavar o roxo (`noite-roxa-gl` verde). `depois-01` (dia): andares e janelas com reflexo, topos com a faixa de AC/caixa-d'água só como silhueta de longe (de perto o parapeito da cornija esconde o que está recuado: o adereço só aparece se estiver a < ~1,5 m da borda ou for alto).
3. 3ª: o gate: +5,3 mil △ (limite 8 mil); cortei o AO de 3 para 1 plano de corte, o banco de AC de 3 para 2 e o respiro e a porta do poste, para caber em 900 △/segmento em Roma e em +~5 mil.

**Critério de "pronto visual" do plano, honestamente:**
- *Prédios de `01`, `06`, `09` com topo e base legíveis*: **atendido em `06` e `01`** (base com contato escuro; topo com cornija sombreada, banco de AC e caixa-d'água quando visíveis); `09` (4p) não foi recapturado nesta rodada (a captura é de 7+ minutos sob a carga das outras sessões): ver ressalva 1.
- *Nenhuma parede preta chapada no pôr do sol*: **atendido** (GL: P75 0,161, razão 0,331; `depois-06`).
- **Não chegou lá:** o prédio continua uma caixa com janelas desenhadas num atlas (a forma, a cor da parede e o letreiro são decisão de artista: diagnóstico §5). O adereço de telhado só lê de longe.

## 6. Ressalvas

1. **`09` (tela dividida 4p) não recapturada** e a trava "4p Média intacto" **não** foi atingida (+1,9% copa, +2,6% Sampa; ver §3). Folga: Sampa 4p Média 178 mil contra 345 mil.
2. **Gosto é do dono.** Direção boa nas imagens; "mais bonito que o Horizon Chase" só se decide jogando.
3. **Luz difusa da parede** vale também à noite (a emissiva sobe junto com as janelas): os prédios da noite ficaram um tom mais claros e lilás; `noite-roxa-gl` e `cor-brilho-gl` passaram, mas a separação de matiz da noite é da F7, que deve recalibrar em cima disto.
4. **CPU de carga**: o `sliceY` e os adereços rodam uma vez por modelo; não medi o tempo de montar a pista (o desenho da fachada com 3 canvas a mais por gradiente também); o `--bench` do dono é o juiz.
5. Os adereços de telhado não existem nas torres (`spire`, `dome`), casas e galpões; só nos 5 estilos de prédio de cidade.
6. A célula 0 da fachada (o desenho de antes da V4, usada pelos marcos) ganhou o vidro com céu e a luz difusa também: os marcos que usam a fachada mudam de aparência de propósito.

## 7. Comandos

```
npx tsc --noEmit -p .
npx vitest run tests/predios-f5.test.ts tests/scenery tests/pistas-v4.test.ts tests/hc2-cenario.test.ts tests/vegetacao-f4.test.ts
NC_REQUIRE_GL=1 npx vitest run tests/predios-f5-gl.test.ts tests/gl-render.test.ts tests/noite-roxa-gl.test.ts tests/cor-brilho-gl.test.ts tests/corrida-que-muda-gl.test.ts tests/hc2-gl.test.ts tests/folga-gl.test.ts
node tools/folga-gate.mjs <raiz> saida.json          # o gate (Copacabana e Sampa); main × branch
```
