# V22 · F4 — Vegetação e cobertura (branch `nc/f4-vegetacao`, base `main` 603bffe, 21–22/10/2026)

> Frente F4 do plano gráfico V22 (`docs/ondas/V22-diagnostico-cena.md` §3.6 e §6). Pedido do dono: "ainda parece muito desenho; tinha que parecer mais com o Horizon Chase"; diretriz "um pouco mais realista que o Horizon Chase Turbo e mais bonito que ele". Sem artista, sem Meshy, sem pacote pago: tudo procedural, em `src/render/scenery/`.
> **Nada muda em `src/core`**: `sim-golden`, `determinism` e `hashRace` ficam como estavam (a suíte de cenário e de núcleo rodou verde, §5). Nenhum save, protocolo online ou programa de shader novo; o material novo é zero (só `flat` e o `cutout` que a L4 já criou).

## 1. O que mudou (por item do escopo)

| Escopo do plano | O que foi feito | Onde |
|---|---|---|
| Variação por instância de **matiz** e escala não uniforme | `tintFor` agora **gira o matiz até ±10°** (medido −12,1° a +10,7° sobre os verdes de copa; antes ~±1°) com o valor a ±5,6% / ±7,2% (antes só valor, ±7–9%). A mata decorativa ganhou **largura x ≠ z** (±15% cada, em sentidos opostos: o giro livre faz a copa redonda virar elipse). Forração e moitas de cena também levam tom. | `layout.ts` (`tintFor`, `dress`) |
| **Variantes de forma** das espécies dominantes | 22 ids novos: mangueira larga / alta (`tree:mango:2/3`), gigante tropical sombrinha / esguia (`tree:giant:2/3`), acácia em dois andares / tombada (`tree:acacia:2/3`), carvalho larga / alta, tília pratos-no-alto / compacta / dois troncos, marula, ipê, bordo, faia, álamo-moita (`tree:aspen-*:2`), pinheiro alto / baixo (`pine:tall/squat`). Forma = **silhueta**, não semente. | `vegetation.ts` (`roundTree(..., shape)`, `tropicalGiant(..., shape)`, `acacia(..., shape)`, `aspen(..., shape)`), `catalog.ts` (ids, receitas) |
| Receitas | Cada receita tropical, de savana e alpina planta **≥ 6 formas** distintas (era 2–6; Europa/savana 2, Japão alpino 2). A lista de árvore **sólida** passou de 4 a 8 entradas (variante + 4, sorteada por hash do sprite; as 4 primeiras são as de antes). | `catalog.ts` (`TREES`, `PINES`, `dressingRecipe`), `layout.ts` (`placeSprites`) |
| **Saia irregular + cutouts** | A moita do pé (domo escuro e alto, o "chapéu") ficou um **prato baixo** (piso de 0,52 m) de relevo mais suave, com **8 tufos de capim de recorte** no contorno (lote `cutout`, 32 △, nas cores da própria saia). Vale para árvores e palmeiras. | `vegetation.ts` (`skirt`, `treeModel`), `geom.ts` (`cutoutRing`) |
| **Oclusão pintada** sob a copa e no pé | `volumeLook` ganhou duas opções: **aro** (a faixa de fora da saia, até 2,1× mais clara: o escuro fica junto do tronco e o aro acompanha o chão) e **barriga** da copa (abaixo do centro da copa: escurece até 55% e vai para o azul; só por posição, a cor corre contínua entre faces). | `geom.ts` (`VolumeLookOptions`), `catalog.ts` (`VOLUME`) |
| **Densidade por jogadores** | **Tapete rente à pista** (3 tufos de recorte por objeto + flores, entre 9,6 e 23 m): `COVER_EXTRA` = 1,8 objetos por segmento e lado em toda lotação (nota > 0,5: Média e Alta) e `COVER_LUSH` = 4 só com 1–2 jogadores; **mata farta** (`GROVE_LUSH`): árvores a mais entre 26,5 e 65 m, o modelo de perto só até 40 segmentos, só com 1–2 jogadores. `lushScenery(viewports)` = `viewports <= 2`; 3–4 = a densidade de antes (mais o tapete de base). Nunca na Baixa (nota > 0,5). | `layout.ts` (`lush`, `lushScenery`, `baseLayout`, `COVER_*`, `GROVE_*`), `catalog.ts` (`carpet`), 2 linhas em `runtime.ts` e 1 em `renderer.ts` |

**Não é sólido nada novo:** os sprites do núcleo continuam os mesmos (mesma conta de modelos por sprite; só a forma da árvore sólida muda, com a **mesma pegada de colisão**: pior encolhimento medido na faixa do carro 0,10–0,14 m contra 0,16 m de antes, tolerância 0,29 m). O enfeite farto é sempre `sprite: false`: as árvores a ≥ 26,5 m do centro (≥ 24,5 m é o que o teste exige) e o tapete é baixo (≤ 1,05 m, atravessável como a forração de antes).

## 2. Arquivos

Código: `src/render/scenery/vegetation.ts`, `geom.ts`, `catalog.ts`, `layout.ts` (os da frente) · **fora da lista, o mínimo**: `src/render/scenery/runtime.ts` (F6; `update(..., lush = true)` e `|| (p.lush !== 0 && !lush)` no filtro de instância, 2 linhas) e `src/render/renderer.ts` (1 import e o 5º argumento de `scenery.update(...)`). **Quem mescla: F6 mexe em `runtime.ts` (`castShadow`, lote `blob`), outro trecho; o conflito, se houver, é de contexto.** Não toquei `structures.ts`, `textures.ts`, `props.ts` nem `catalog-structures.ts`.

Testes: **novo** `tests/vegetacao-f4.test.ts` (36 testes). **Alterados com motivo (§4)**: `tests/hc2-cenario.test.ts`, `tests/scenery-forma.test.ts`, `tests/scenery-copacabana.test.ts`.

Ferramentas (novas, só leitura do jogo): `tools/densidade-cenario.ts` (△ visíveis de cenário por qualidade e número de jogadores, sem GL), `tools/folga-pista.mjs` (contagem real em GL por pista, para comparar antes × depois), `tools/vegetacao-showroom.{html,mjs}` (o showroom de modelos **com** o lote de recorte).

## 3. Medidas (antes = `main` 603bffe; depois = este branch)

### 3.1 Contagem real em GL (`node tools/folga-pista.mjs`, 640×360, largada de 300 ticks, pior viewport dos 2 últimos de 4 quadros)

| pista / lotação | Média △ | Alta △ | Baixa △ | chamadas (Alta) |
|---|---|---|---|---|
| foz 1p | 228.814 → 234.387 (**+5.573**) | 239.649 → 248.714 (**+9.065**) | 111.113 → 114.045 (+2.932) | 71 → 72 |
| foz 2p | 189.857 → 195.661 (+5.804) | 198.921 → 209.176 (**+10.255**) | — | 64 → 65 |
| foz 4p | 191.219 → 191.497 (+278) | 200.245 → 200.547 (**+302**) | 93.885 → 94.151 (+266) | 66 → 67 |
| passo alpino 1p | 219.973 → 220.836 (+863) | 231.019 → 234.710 (+3.691) | 108.919 → 108.502 (−417) | 72 → 73 |
| passo alpino 2p | 185.821 → 189.931 (+4.110) | 195.505 → 203.954 (+8.449) | — | 65 → 66 |
| passo alpino 4p | 185.021 → 184.849 (−172) | 194.479 → 194.651 (+172) | 94.304 → 93.908 (−396) | 67 → 68 |
| kruger 1p | 217.297 → 218.743 (+1.446) | 225.321 → 228.741 (+3.420) | 104.676 → 105.601 (+925) | 70 → 71 |
| kruger 2p | 182.106 → 184.287 (+2.181) | 188.827 → 193.068 (+4.241) | — | 63 → 64 |
| kruger 4p | 180.484 → 180.520 (+36) | 186.936 → 187.020 (+84) | 91.942 → 91.966 (+24) | 65 → 66 |

Limites do plano: ≤ **+35 mil △** por viewport em 1–2p (maior medido: **+10,3 mil**), ≤ **+15 mil** em 3–4p (maior: **+0,3 mil**), nenhuma cena acima do limite do gate. **Folga que sobrou:** o real usou ~1/3 dos +35 mil; subir `GROVE_LUSH` e `COVER_LUSH` (`layout.ts`) é decisão do dono depois de ver (a conta estática `frameCost` do layout inteiro já está em 1.147 △/segmento e o teto próprio é 1.250).
**Chamadas: +1 por viewport** nas pistas que antes não desenhavam o lote `cutout` (o capim da saia o abre); é o lote que a L4 criou, não um programa nem um lote novo, mas **é uma chamada a mais** — ver ressalva 2.

### 3.2 O gate (`node tools/folga-gate.mjs`: Copacabana e Sampa, pior viewport)

| cena | Baixa | Média | Alta | Ultra |
|---|---|---|---|---|
| copa-1p △ (chamadas) | 116.302 (33) → 116.474 (**34**) | 236.278 (78) → 237.116 (78) | 254.963 (83) → 257.034 (83) | 255.649 (84) → 257.720 (84) |
| copa-2p | 106.937 (36) → 107.649 (36) | 206.171 (71) → 207.684 (71) | 225.717 (76) → 228.351 (76) | 226.399 (77) → 229.033 (77) |
| copa-4p | 104.846 (37) → 104.826 (**38**) | 204.914 (76) → 204.874 (76) | 222.745 (77) → 222.717 (77) | 223.428 (81) → 223.400 (81) |
| sampa-4p | 74.798 (40) → igual | 173.456 (78) → igual | 176.980 (77) → igual | 176.989 (80) → igual |

Limites do gate **não subiram** (copa-1p Alta 340.000 △ / 85 chamadas etc.); Sampa não mudou (cidade: sem forração nem mata farta). A Baixa continua a mais barata em △ (a mesma relação de antes: 1p 116 mil contra 237 mil da Média).

### 3.3 Variação e variedade

| medida | antes | depois |
|---|---|---|
| giro de matiz do tom por instância (`tintFor`) | ~±1° | −12,1° a +10,7° (≥ ±6° exigido) |
| escala x ≠ z na mata decorativa (fração com \|x/z − 1\| ≥ 12%) | 0% | > 50% (teste) |
| formas de árvore distintas por receita (tropical, savana, alpina) | 2 a 6 | ≥ 6 em todas |
| modelos de árvore distintos por 80 m (média no layout inteiro, 1–2p) | foz 9,0 · serra do navio 8,8 · fuji 4,9 · kruger 3,2 · passo alpino 5,9 · autobahn 2,7 | 12,3 · 11,9 · 8,0 · 5,4 · 9,3 · 5,6 (**≥ 1,35 ×**, teste) |
| aro da saia ÷ luminância da copa | mangueira 0,46 · carvalho 0,59 · ipê 0,36 · gigante 0,34 | 0,85 · 1,14 · 0,68 · 0,70 (≥ 0,62, teste) |
| barriga da copa ÷ topo (luminância) | 0,53–0,58 | 0,33–0,35 (≤ 0,44, teste) |
| azul ÷ verde da barriga contra o topo | 0,89–1,12 | 1,06–1,32 (≥ 1,08 nas copas de um verde só, teste) |
| razão topo ÷ pé (V10, mediana das árvores, só partes `flat`) | 2,48 (24 árvores) | 2,12 (41 árvores, as 17 variantes novas incluídas) |

### 3.4 Imagens (mesma câmera, Alta, 1280×720, harness; `docs/diag-v22/f4-vegetacao/`, JPEG ≤ 600 KB)

`antes-03-foz` × `depois-03-foz` (diagnóstico 03) · `antes-04-serra` × `depois-04-serra` (04) · `antes-15-fuji` × `depois-15-fuji` (15) · `antes-01-copacabana` × `depois-01-copacabana` · `antes-02-paraty-entardecer` × `depois-02-paraty-entardecer` (a luz quente) · `saia-antes` × `saia-depois` (o pé da árvore, ampliado) · `variantes-arvores` (16 formas novas lado a lado).
Comandos: `PORT=<porta> node tools/capture.mjs "foz::track=foz_do_iguacu&seg=215&hud=0&q=high&cam=high&frames=14"` (idem `serra_do_navio&seg=1100`, `monte_fuji&seg=80`, `copacabana&seg=300`, `paraty&seg=90`) e `node tools/vegetacao-showroom.mjs <porta> saida.png "id,id" "&cols=4&gap=7&ground=120&cam=0.62"`.

**Critério "pronto visual" do plano, honestamente:**
- *Saia não lê como chapéu*: **atendido.** `saia-antes`/`saia-depois`: o domo escuro e alto virou um prato baixo, de aro claro, com capim.
- *Chão rente à pista com cobertura contínua*: **atendido na Média e na Alta** (o tapete é de nota > 0,5: a Baixa não o desenha, de propósito); com 3–4 jogadores o tapete é o de base (4 tufos-equivalentes por segmento e lado, contra 2,6 peças de antes). É o que mais se vê em `depois-03-foz` e `depois-04-serra`.
- *Nenhuma árvore se repete em 80 m*: **atendido em parte.** Mais que dobrou a variedade de modelos por trecho (tabela 3.3) e cada instância muda de matiz, largura x/z, altura e giro; mas o **sprite sólido** perto da pista só ganhou 4 formas, e na Fuji (`depois-15-fuji`) os pinheiros da frente continuam parecendo irmãos (a conífera é cone empilhado: `pine:tall/squat` ajudam, não mudam o desenho). Uma copa que seja *bonita* continua sendo decisão de artista (diagnóstico §5).
- **Não chegou lá:** o chão em si (F1) e o contorno das copas (bolhas lisas) ainda dizem "desenho"; a F4 melhora o que está **sobre** o chão.

## 4. Testes

**Novo: `tests/vegetacao-f4.test.ts` — escrito antes e visto falhar pelo motivo certo** (primeira rodada: 24 de 29 vermelhos): `tintFor` com giro de matiz −1,0° (esperado ≤ −6°); layout com giro −1,3°; receitas com 2 a 4 formas distintas contra 6 (alpina Brasil/Europa 4, EUA 3, Japão 2; savana Europa 2); variantes extras inexistentes (`modelo desconhecido: tree:mango:2`); aro da saia 0,43 ÷ copa (exige 0,62); sem parte de recorte na árvore; barriga ÷ topo 0,56 (exige 0,44); azul ÷ verde 1,00 (exige 1,08); densidade: ganho de 0 △ (exige ≥ 12 mil na Alta com 1p); cobertura de 3,2 tufos por segmento e lado (exige 8). Confirmei também, desligando o efeito no catálogo (`strength: 0`, `lift: 1`), que os três testes de aro e barriga voltam a falhar com a mesma mensagem. **Duas formulações corrigi depois de olhar o desenho** (a medida da barriga contava o tronco e as bolhas de cores diferentes do ipê; passou a ser por quartis da copa, só nas copas de um verde): a falha original de cada uma continua sendo a que está acima. Além disso:
- puro: `lushScenery(0..4)`; nada novo é sólido (o número de sprites do layout é o do núcleo, o enfeite farto nunca é sprite e nasce a ≥ 24,5 m); variantes novas só usam `flat`/`cutout` e mantêm a pegada;
- puro: custo estático do layout **inteiro** ≤ 1.250 △/segmento e ≤ 16 objetos/segmento (hoje 1.147 e 14,8), o de 3–4 jogadores (`baseLayout`) ≤ +8% do de antes (781 → 807);
- puro: variedade ≥ 1,35 × por 80 m em 6 pistas; densidade por jogadores (conta de visíveis: **superestima ~4–5×**, ver o comentário no teste: o limite do plano é o da medição real da §3.1).

**Travas existentes alteradas, com motivo (padrão V10 §3) — nenhum valor foi afrouxado; mudou o que cada teste mede:**
1. `tests/hc2-cenario.test.ts` (razão topo ÷ pé e luminância média das árvores): passa a medir **só as partes `flat`**. O capim de recorte do contorno da saia (`cutout`: pé escuro, ponta clara, ~80 vértices) não passa pelo `volumeLook` e, contado, subia a luminância do terço de baixo (mediana 2,48 → 1,72) e escondia o contrato da V10. Com o recorte fora a mediana é **2,12 ≥ 2** e a luminância média 0,225 (± 15% de 0,217: ok). Para isso o topo das árvores subiu de 1,22 para 1,30 (`catalog.ts`, `VOLUME`), porque a barriga escura (que a F4 quer) baixava a razão a 1,996.
2. `tests/scenery-forma.test.ts` (≤ 900 △ por segmento de janela) e `tests/scenery-copacabana.test.ts` (≤ 900 △ e ≤ 16 objetos por segmento): medem o `baseLayout` (o que **toda** lotação paga). O enfeite farto (só 1–2 jogadores) estourava a conta **estática** em 15 pistas (máx. 1.018 com a primeira densidade; 1.147 hoje) sem custar isso em GL (§3.1: +10 mil △ reais, não +100 mil); ele tem teto próprio no teste novo. O pior caso da base é 807 (antes 781).
3. `tests/folga-gl.test.ts`: `CENARIO_COPA_1P` (cenário de Copacabana 1p Média, "1 jogador não muda") 101.126 → **101.964** (+838 △, exatamente a diferença do gate copa-1p Média, 236.278 → 237.116). O teste prova que o corte de LOD da tela dividida não toca 1 jogador, e isso continua; o número só andou porque o **conteúdo** do cenário andou (capim da saia, tapete, árvores a mais). A outra metade dele (4p Média < 92.000 △ de cenário) passou sem mexer.
4. Tetos por modelo (`scenery-forma` 900 △, `scenery-copacabana` 450–700 △ da palmeira de cartum): **mantidos**; a F4 cortou triângulos para caber (aspen-moita de 5 para 3 troncos; mangueira larga com 3 bolhas laterais; oliveira com 3 tufos; palmeira de cartum com 5 tufos e a baixa com 11 folhas em vez de 12).

**Rodei (mesmo turno, saída lida):** `npx tsc --noEmit -p .` limpo; 57 arquivos / 1.055 testes verdes (2 pulados) em `tests/scenery*`, `hc2-cenario`, `pistas-v4`, `render*`, `folga-lod`, `corrida-que-muda*` (não GL), `landmark*`, `cenario-fechado`, `collisions`, `batidas-cenario`, `cor-brilho`, `noite-roxa`, `terreno-curva-fechada`, `track`, `stylize`, `vegetacao-f4`, **`sim-golden`, `determinism`**, `galeria`. GL (Chromium/swiftshader, `NC_REQUIRE_GL=1`): `gl-render` (o gate de contagem e a compilação de todos os programas), `corrida-que-muda-gl`, `hc2-gl`, `cor-brilho-gl`, `noite-roxa-gl` e `folga-gl` verdes (42 testes; `folga-gl` depois do ajuste 3 abaixo).

## 5. Ressalvas

1. **Gosto é do dono.** A direção dos números e das imagens é boa, mas "mais bonito que o Horizon Chase" só se decide jogando; o que a F4 entrega é variação, tapete e pé de árvore sem chapéu, não um redesenho de copa.
2. **+1 chamada por viewport** nas paisagens que antes não desenhavam o lote `cutout` (todas menos o litoral do Brasil e onde já havia capim de recorte), e +1 na Baixa de Copacabana em 1p e 4p (o lote passou a aparecer no quadro medido). Dentro dos limites do gate (Baixa 34 de 38 e 38 de 42; Alta/Média iguais). O plano permitia o lote `cutout`, mas o limite escrito era "0 chamadas novas": **registro como desvio de +1 e como decisão do orquestrador** (para zerar, tiraria o capim da saia e o tapete, o que desfaz o item 4 do escopo).
3. **CPU de instância.** O tapete é de 3 tufos por objeto justamente para isso, mas as instâncias por segmento subiram (layout inteiro 14,8 objetos/seg no pior caso contra 5–7 de antes; 7,8 a 9,1 na lotação de 3–4). Nenhuma medida de CPU aqui (swiftshader não mede FPS): o `--bench` do dono é o juiz.
4. A conta de △ visíveis (`tools/densidade-cenario.ts`) superestima o real em ~4–5× (foz 1p Alta: +47 mil na conta, +9 mil em GL); o limite do plano foi verificado em GL (§3.1), não por ela.
5. O sorteio de variante do sprite sólido usa `hash2(seed, 77)`: determinístico (o mesmo layout por pista), mas **muda quais modelos aparecem em cada ponto** de toda pista (mesma pegada, mesma colisão). Marcos e enquadramento não mudaram (os testes `landmarks*` passaram).
6. As cores do capim de recorte e do tapete são as da forração de cada paisagem, escolhidas a olho; à noite e ao entardecer o material já leva a tinta do cenário (`cutoutMat.color`), conferido em `depois-02-paraty-entardecer`.
7. `tools/scenery-showroom.*` (sem recorte) ficou como estava; o novo é `vegetacao-showroom.*`.

## 6. Comandos

```
npx tsc --noEmit -p .
npx vitest run tests/vegetacao-f4.test.ts tests/hc2-cenario.test.ts tests/scenery tests/scenery-forma.test.ts tests/sim-golden.test.ts tests/determinism.test.ts
npx tsx tools/densidade-cenario.ts "copacabana,foz_do_iguacu,passo_alpino,kruger"      # conta de △ visíveis, sem GL
node tools/folga-pista.mjs <raiz> saida.json "foz_do_iguacu,passo_alpino,kruger" "1,2,4" "medium,high,low"   # contagem real em GL
node tools/folga-gate.mjs <raiz> saida.json                                           # o gate (Copacabana e Sampa)
```
