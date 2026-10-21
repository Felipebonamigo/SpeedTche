# V22 — Diagnóstico da cena: por que ainda parece "desenho" (21/10/2026)

> **Base:** `main` 42ccbbb (0.1.17), branch `nc/diag-cena`, worktree `/home/user/speedtche-wt/diag-cena`. **Só diagnóstico:** nenhum código do jogo foi tocado; saem este documento e `docs/diag-v22/`.
> **Fora do escopo (de propósito):** o carro em si (material, AO, reflexo, livrea), que é da frente `nc/acabamento`. Aqui entra **tudo o mais**: estrada, chão, céu, horizonte, cenário, sombras, luz, pós, efeitos e HUD.
> **Pedido do dono:** "a jogabilidade está quase ok, me incomoda mais o gráfico"; "ainda parece muito desenho; tinha que parecer mais com o Horizon Chase, que são bem feitos"; diretriz: "um pouco mais realista que o Horizon Chase Turbo e mais bonito que ele", comparando com o Horizon Chase 2.

## 0. Resumo em 12 linhas

1. **O jogo não está feio; está liso.** A leitura de "desenho" vem menos da forma e mais de **superfícies grandes de cor única**: medi 600 × 200 px de grama com desvio de detalhe fino de **0,0002** (RGB 17,180,36, saturação 0,90) e céu limpo com **0,0006** (RGB 2,173,255, saturação 0,99). Um cenário pintado "bem feito" tem 0,03–0,05 nessas áreas.
2. **Causa técnica nº 1: o chão não tem textura nem normal nenhuma.** O terreno é `MeshStandardMaterial` só com `vertexColors` (`terrain.ts:537`): uma cor por vértice (a cada 4 m ao longo × 12 colunas), interpolada. Não existe `normalMap`/`roughnessMap` em nada fora dos carros (`grep` vazio em estrada, terreno e cenário).
3. **Causa nº 2: sem profundidade atmosférica de verdade.** A névoa é `FogExp2` de cor única, sem altura e sem lado do sol; os anéis de morros têm a névoa "assada" em cor chapada. Resultado: o horizonte é uma pilha de silhuetas turquesa lisas.
4. **Causa nº 3: saturação sem hierarquia.** Céu 0,99, grama 0,90, terra 0,81–0,90: tudo no teto, sem variação de matiz. O que sobra de "realismo" (asfalto cinza, sat 0,17) fica só na estrada. Um estilizado bem feito varia o matiz (grama que vai do amarelo ao azul-verde) e guarda o saturado máximo para o que importa.
5. **Causa nº 4: repetição e esparsidade.** 3 formas de nuvem + 1 faixa no atlas (`sky.ts`); 4 espécies de árvore por bioma, com 2 sementes (`catalog.ts:382`); 2,6 tufos por segmento de 4 m. Há muito chão vazio entre objetos.
6. **Causa nº 5: sombra e oclusão só em parte da cena.** As árvores **não projetam sombra do sol** (`castShadow` só para prédios, `runtime.ts:355`); têm um disco de mancha + uma "saia" verde de cor chapada na base, que lê como chapéu. Não há oclusão de ambiente nos degraus Baixa e Média, nem na Alta com 3–4 jogadores.
7. **Causa nº 6: o Ultra é a Alta.** Alta × Ultra na mesma cena: **5,2%** dos pixels diferem (>8/255), só o AO em resolução cheia. Os outros seis efeitos prometidos pela bíblia ao Ultra (SSR, raios, DoF, desfoque de movimento, CSM, TAA) têm `implemented: false` (`src/bench/ultra.ts`). Baixa × Alta: 56,3% dos pixels.
8. **Defeitos reais achados (não são questão de gosto):** (a) no Passo Alpino uma **folha de terreno verde corta as árvores** em faixas horizontais (`c04`); (b) uma **linha preta de 1 texel atravessa a pista** de lado a lado (a "junta" do asfalto, `road-textures.ts:97`); (c) a **estrada de terra** tem rachaduras em polígonos e retângulos de "remendo" com contorno que leem como adesivo (`c01`); (d) as **partículas de poeira** são esferas brancas perfeitas (`c08`).
9. **O que já está bom e não deve ser mexido:** nuvens pintadas (V4), noite roxa (V12), HUD, pôr do sol do Cânion (`07`), kerbs, a gradação geral. O diagnóstico mira o que falta, não refaz o que funciona.
10. **Ganho maior por custo:** detalhe procedural estável no chão e na estrada (0 △, 0 chamadas), névoa atmosférica com altura e lado do sol, sombra falsa direcional das árvores, densidade e variação do cenário.
11. **Não dá para resolver sem arte feita à mão:** silhueta e personalidade de árvores, prédios e marcos; pintura de textura com intenção; o "acabamento de cada canto" do HC2. Procedural entrega variação e profundidade, não design (§5).
12. **Plano:** 8 frentes (§6). Ordem: F1, F2, F4, F5, F8 em paralelo (onda 1); F3 e F6 (onda 2); F7, a única arquitetural, sozinha no fim.

## 1. Como foi feito e o que NÃO foi visto

- **Capturas:** 15 quadros 1280 × 720, câmera Alta (padrão), qualidade Alta, harness `tools/render-harness.html` (Chromium headless, swiftshader), vite no worktree, 14–24 quadros de aquecimento. Em `docs/diag-v22/` (JPEG 92%, convertidos dos PNG para caber no git) mais 9 recortes ampliados (`c01…c09`). **Cada quadro foi olhado com a ferramenta de imagem**; medidas com um script de cantos de região (§2).
- **Situações pedidas:** reta de dia (`01`, `10`, `15`), curva com cenário denso (`03`, `04`), noite (`05`), pôr do sol (`06`, `07`), tela dividida 2p e 4p (`08`, `09`), derrapagem/nitro (`12`), neve (`11`), Baixa × Ultra (`13`, `14`).
- **Chuva e neblina não existem.** Não há clima no jogo (`grep` em `src/render` e `src/core`): só a névoa de distância (`FogExp2`) e a "neblina da cidade" como cor de paleta. Não há o que capturar; chuva/asfalto molhado só aparece como item `implemented: false` do Ultra (SSR). Não diagnostiquei o que não existe.
- **Referências do Horizon Chase NÃO estão no repositório.** `scratch/ref/hc2-*.webp` citados na V10 não existem (a política é "imagens de terceiros fora do repo", `DIRECAO-DE-ARTE.md` §1). **A comparação abaixo é pelo conhecimento geral do estilo, sem descrever imagem que eu não vi.** Os números do HC2 que cito (saturação 0,50–0,82 etc.) são **da V10/V11/V12**, medidos por quem tinha as imagens; não os reproduzi.
- **Limites das capturas:** (a) uma captura por cena, a 100% da velocidade, então o **desfoque radial está ligado** (Alta) e amolece as bordas do quadro; (b) swiftshader não dá FPS; (c) **não flagrei "LOD aparecendo"** em imagem parada, só dá para ver em vídeo; (d) a fumaça de pneu não apareceu na captura de derrapagem `12`, então a avalio só pelo código e pelas bolhas de `c08`; (e) a captura `02` caiu atrás de uma crista (câmera na descida), mostrando o chão sem nada: não é cena típica, mas expõe o pior caso do chão liso.

## 2. Medidas minhas (todas 1280 × 720, Alta, luma 0–1)

"Detalhe" = desvio-padrão do resíduo `pixel − média 5×5`: mede só o detalhe fino, ignora gradiente suave. Retângulos `x,y,w,h`.

| Região | Imagem · retângulo | RGB médio | Sat. | Detalhe |
|---|---|---|---|---|
| Grama lisa | `02` · 100,380,500,200 | 17,180,36 | 0,90 | **0,0002** |
| Grama (Serra) | `04` · 0,340,200,90 | 18,165,53 | 0,93 | 0,0151 |
| Céu limpo | `03` · 560,120,250,70 | 2,173,255 | 0,99 | **0,0006** |
| Estrada de terra (Foz) | `03` · 300,500,170,90 | 181,69,18 | 0,90 | 0,0223 |
| Asfalto (Copacabana) | `01` · 230,400,260,100 | 105,100,89 | 0,17 | 0,0389 |
| Asfalto (Fuji) | `15` · 760,420,260,100 | 139,102,103 | 0,29 | 0,0300 |
| Estrada de terra (Xingó) | `10` · 300,360,200,120 | 192,122,73 | 0,62 | 0,0515 |
| Areia (Xingó) | `10` · 780,350,200,50 | 242,179,95 | 0,61 | 0,0419 |

- **Alta × Ultra** (Copacabana seg 300): 5,16% dos pixels com diferença >8/255. **Baixa × Alta:** 56,32%.
- **Leitura:** a estrada (0,022–0,05) tem mais detalhe que a grama (0,0002–0,015). O olho lê grande área sem nada como "cor de desenho". O alvo que proponho (não é medida do HC2): chão de grama ≥ 0,035 e ≤ 0,08; céu continua ≤ 0,01 (céu limpo é certo), mas ganha gradação em faixas largas.

## 3. Elemento por elemento

Escala usada: **ganho** (alto/médio/baixo), **custo** (△ = triângulos, chamadas, passes, shader), **risco** (determinismo `src/core`, gate `src/bench/gate.ts`, save, online). Regras que valem para todos: nada muda `src/core`, `hashRace` ou `sim-golden`; nenhum save ou protocolo online muda; **o mundo é remontado no referencial local a cada quadro** (`DESIGN.md`), então **qualquer detalhe procedural tem de usar coordenada estável (metros ao longo da pista, lateral) e nunca a posição de mundo, senão ele "nada" quando o carro anda.**

### 3.1 Estrada (asfalto, faixas, zebras, textura, ondulação, bordas) — `01`, `03`, `c01`, `c02`, `c07`

1. **O que parece desenho e por quê.**
   - **Terra com padrão de polígonos.** As rachaduras de terra (`asphaltStructure`, Voronoi periódico, só onde `roadEarth > 0`) formam hexágonos escuros grandes sobre cor quase lisa; os remendos são **retângulos com contorno** (`ASPHALT_WEAR.patches`). Leem como piso de tela/adesivo, não como terra batida. Detalhe 0,022 contra 0,039 do asfalto.
   - **O granulado** é uma poeira de pontos claros (`stone`) da mesma escala do rachado: parece papel de embrulho. Ruído de grão não é textura (a V4 já dizia).
   - **Junta de 1 texel** (`joints: [29.0]`, fator 0,58): atravessa a pista de lado a lado como uma linha preta (visível em `01` a y≈467 e em `c02`). Lê como costura de render.
   - **Sem normal e sem rugosidade variável.** `roughness: 0.9` constante (`road.ts:214`): o sol a 34° não risca de brilho as trilhas de pneu, a pista não tem "pele".
   - **Cor uniforme por trecho** (`stretchTint` ±5% / ±3%): a pista da Foz e da Serra varia pouco ao longo (desvio de luma 0,03).
   - **Faixas e kerb:** corretas e limpas (3 m, friso, borracha), mas **limpas demais**: faixa branca de 0,3 m sem desgaste, sem bisel, sem sujeira de borracha na curva. A transição guia → grama é um **degradê aerógrafo de 3 m** (a cor por vértice), sem borda irregular.
   - **Ondulação:** há lombada no chão (V11), mas a **pista em si é lisa** (sem cambagem nem remendo em relevo). Não é o maior problema.
2. **O que um estilizado bem feito faria.** Textura pintada à mão com **duas escalas** de variação (manchas de ~5–10 m e grão fino), trilhas de pneu mais polidas (brilho), faixa gasta, juntas largas e suaves, e normal sutil para o sol rasante. Bordas de pista irregulares, com terra e cascalho invadindo.
3. **Correção proposta (F2).**
   - Remover o contorno dos remendos e tornar a borda irregular (ruído); trocar o Voronoi hexagonal por rede de trincas fina e quebrada, ou tirar na terra e pôr **veios de erosão longitudinais** (estica no sentido da pista).
   - Duas escalas de manchas de tom (`tone`), com variação de **matiz** (±6°) e luma ±10% ao longo de 24 m; granulado em 2 tamanhos com amplitude menor.
   - Junta: 6–8 px, suave, dupla, ou remover.
   - `roughnessMap` (1 canal, 512 × 2048) com trilhas polidas (rugosidade 0,55) e centro/bordas ásperas (0,95), e `normalMap` derivada do agregado, só da Média para cima.
   - Faixa com desgaste (alfa por ruído 0,75–1), bisel de 1 px no kerb, borracha preta nas curvas, borda irregular guia → grama (máscara por ruído no `u`).
   - **Ganho:** médio-alto. **Custo:** 0 △, 0 chamadas; +2 texturas (~5 MB na GPU), +2 leituras de textura só no material da pista; Baixa sem normal/rugosidade. **Risco:** trava de cor (`cor-brilho` 2b/2c, `estrada-v11`: faixa ≥ 3:1, asfalto neutro, "sem azul-marinho"); gate inalterado (mesmas chamadas). Calibrar contra essas travas **antes** de mover qualquer cor.

### 3.2 Chão e acostamento — `02`, `03`, `04`, `c03`, `c04`

1. **O que parece desenho e por quê.**
   - **Plano de cor única.** Chão = vertex color interpolada por 4 m × 12 colunas (8,4 → 380 m), sem textura (`Strip` nem tem `uv`). Mesmo com a variação por vértice de 6–20% (V11) o resultado é um gradiente macio, "feltro verde" (medido 0,0002 na cena `02`).
   - **Verde no teto** (sat 0,90, RGB 17,180,36) e **sem variação de matiz**: nada de amarelado em áreas secas, azul-esverdeado na sombra.
   - **Sem nada rente ao chão:** tufos esparsos (2,6 por segmento), sem pedrinha, sem terra exposta, sem mancha de grama alta.
   - **Transição estrada → chão** em degradê de 3 m (`c01`): "airbrush".
   - **Defeito:** no Passo Alpino (`11`, `c04`) uma **folha de terreno verde** passa por cima/atravessa as árvores do meio da distância, em faixas horizontais. Parece a borda da faixa de terreno (última coluna 380 m) ou colunas com altura diferente do anel de morros 470 m. Reproduzível no harness: `track=passo_alpino&seg=180`.
2. **O que um estilizado bem feito faria.** Chão com **duas escalas de variação** (manchas largas de matiz + grama alta em tufos), faixas de ceifa/pisoteio, terra exposta nos pontos de desgaste, pedras e flores pontuais, e **um chão que continua desenhado até o horizonte** (sem prateleira).
3. **Correção proposta (F1).**
   - Atributo `aDet` (vec2: lateral em m, distância **absoluta** ao longo em m) no `Strip` — estável. No `onBeforeCompile` do material do chão: albedo × `(1 + 0,12·n1 + 0,06·n2)` com `n1` de 12 m e `n2` de 2,5 m, deriva de matiz ±4° entre as duas, faixas de ceifa (grama) e ondulado (areia), desvanecer a oitava fina a 60 m (anti-cintilação). Mesmo programa serve às 5 paisagens por uniforme.
   - Borda guia → grama com máscara por ruído (borda irregular) e uma faixa estreita de cascalho.
   - **Corrigir a prateleira do Alpino** (reproduzir, medir `columnHeight` na coluna 11 contra `LAYER_RADII[0]`, teste de continuidade).
   - **Ganho:** **alto** (é a maior área lisa da tela). **Custo:** 0 △, 0 chamadas; +8 B/vértice (`aDet`), ~20–30 ALU no fragmento do chão (cerca de 35–45% dos pixels). Baixa: 1 oitava. **Risco:** programa novo compila na carga (chave `+detail`); `tests/estrada-v11`/`render-ground` (razão chão × estrada ≥ 1,12 ou distância ≥ 0,15) pode mexer; cuidado com **nado** (coordenada estável é obrigatória, ver nota acima).

### 3.3 Céu e nuvens — `03` (`c05`), `07`, `11`

1. **O que parece desenho e por quê.** O gradiente do céu tem **3 paradas** (`uHorizon`, `uMid`, `uTop`) e satura rápido (RGB 2,173,255 a poucos graus do horizonte); sem variação horizontal, sem cirros nem faixas de altitude. Nuvens pintadas **estão bonitas** (`c05`: volume, barriga azulada, borda clara) mas vêm de **3 células de cúmulo + 1 faixa** no atlas (`CLOUD_ATLAS`: 1024 × 512), espelhadas pela metade (`flip`): em 40 s de corrida o olho encontra as mesmas formas. Em Copacabana/Foz o céu tem 4–6 nuvens por quadro e muito azul nu.
2. **O que um estilizado bem feito faria.** Céu com camada fina de cirros e faixas ao horizonte, dither contra banding, gradiente com mais paradas (turquesa claro rente ao horizonte, anil no zênite), mais formas de nuvem e **duas camadas com paralaxe**.
3. **Correção proposta (F3).** (a) Atlas de nuvens de 3 → 8 células (2048 × 1024, mesma pintura procedural de `cloudAtlasImage`, mais variação de silhueta e de barriga); (b) camada alta de cirros por ruído no próprio `SKY_FRAG` (0 textura); (c) 2 paradas a mais no gradiente e dither de 1 LSB; (d) horizonte em dois tons por lado do sol. **Ganho:** médio. **Custo:** +1 textura 2 MB, 0 △ (cada nuvem segue 2 △), shader do céu +15 ALU, 1 draw. **Risco:** trava `corrida-que-muda` (contínuo no tempo) e o teste de nuvens (`pistas-v4`); Baixa/Média usam subconjunto (já é o padrão: `cloudLayout`).

### 3.4 Sol e halo — `07` (único quadro com sol), `06`

1. **O que parece desenho e por quê.**
   - **De dia o sol nunca aparece:** `SUN.day = az −42°, el 34°` (`palette.ts:346`), fora do quadro da Alta (FOV vertical 54° → ±27°). Nenhuma das 8 capturas de dia mostra o sol. Só o entardecer (`07`) tem sol e é a cena mais convincente do jogo. O halo do disco (`exp(-ang·uHalo)`) só existe se o sol estiver visível.
   - **O brilho do lado do sol** (`uGlow` × `az³` × `exp(-6·altura)`) vale **0,35 de dia** (0,8 no entardecer, `sunLook`) e só age rente ao horizonte: nas capturas de dia o céu do lado do sol não se distingue do oposto.
   - **Reflexo de lente** (`lensflare.ts`): só no entardecer; fantasmas hexagonais fracos (`06`: três hexágonos no asfalto, lidos como manchas).
2. **O que um estilizado bem feito faria.** Sol grande e quente que o jogador vê, brilho que lava o céu em torno, raios; mesmo de dia a luz tem lado e o céu tem lado.
3. **Correção proposta (F3, com decisão do dono).** Opção A: **manter a luz e pintar o brilho** do lado do sol de dia (uma bolha larga no gradiente, sem disco), 0 risco, ganho médio. Opção B: **baixar o sol de dia para ~24–26°** (disco entra no quadro em retas voltadas para ele, sombras mais longas e mais dramáticas, como o dono já elogiou em "sombras longas que desenham o relevo"): ganho **alto** mas mexe em `sunLight`/sombra e nas travas `cor-brilho`; **decisão do dono** e vai com F6. Raios volumétricos (Ultra, `implemented: false`) ficam para depois.

### 3.5 Horizonte e névoa de distância — `03`, `04`, `11`, `15`

1. **O que parece desenho e por quê.** (a) **Camadas de morro lisas**: 3 anéis (470/660/920 m) com cor de topo + névoa assada por vértice (`buildRing`), sem ruído de floresta, sem recorte de rocha: pilha de silhuetas turquesa (`03`, `04`). (b) **Névoa de cor única**: `FogExp2` com 1 cor (`fog`) e densidade por qualidade (0,003 → 0,0019); não há **névoa de altura** (vale mais enevoado) nem tom mais quente na direção do sol. A 300 m o jogo tira só 28% da cor (cálculo da V10), então objetos distantes ficam nítidos e saturados demais, o que **achata a profundidade**. (c) Os anéis são **sem névoa do three** (cor assada): se mudar a névoa global, eles não acompanham sem trabalho. (d) A **prateleira do terreno** no Alpino (§3.2).
2. **O que um estilizado bem feito faria.** Perspectiva atmosférica clara: cada plano mais pálido e mais quente/azul que o anterior, vale com bruma baixa, silhuetas com ruído de arvoredo e cume iluminado.
3. **Correção proposta.** **F7 (arquitetural):** substituir o chunk `fog_fragment` por uma versão com **altura** e **cor que varia com o ângulo do sol**, mantendo `FogExp2` como base (mesmo padrão do `installToneMapping`, patch único e testado contra o texto do three) e passar a mesma conta ao `buildRing`. **F3 (não arquitetural):** ruído de arvoredo e cume nas cores por vértice dos anéis e 1 plano a mais. **Ganho:** **alto** (a névoa é o que mais separa "cena" de "papel de parede"). **Custo:** 0 △ e 0 chamadas; +3–5 ALU por pixel de objeto (programas recompilam na carga). **Risco:** toca **todos** os materiais (arquitetural), travas `cor-brilho`, `hc2-*`, `corrida-que-muda-*`; recompilação de programas na carga (nunca no meio da corrida).

### 3.6 Cenário (árvores, prédios, placas, marcos) — `03`, `04`, `06`, `09`, `10`, `11`, `15`, `c03`, `c06`

1. **O que parece desenho e por quê.**
   - **Árvores de pirulito.** Copas de bolhas de cor chapada com gradiente vertical (V10) e uma **saia verde-escura** sob cada copa (`roundTree(skirtColors)`) que lê como chapéu; faltam folhas recortadas, buracos de luz, oclusão debaixo da copa.
   - **Pouca variedade:** tropical tem `giant:0/1`, `mango:0/1`, `banana`, `fern` (`catalog.ts:382`), com variação de altura 0,24 e tinta ±7–9% só em valor, não em matiz. Em 2 s repete-se a mesma palmeira.
   - **Esparso:** `coverDensity 2.6` tufos por segmento, `groveDensity 1.25`: sobra muito chão entre árvores, e as árvores grandes ficam longe (≥ 26 m da pista).
   - **Prédios** (`c06`): paredes quase pretas ao pôr do sol com janelas **claras iguais**, sem beiral nem ar-condicionado, sem tanque de água no telhado, sem reflexo no vidro; fachada em atlas de 2 × 2 e 4 visuais por estilo (V4).
   - **Placas e marcos:** painéis publicitários bons (`ATOMATIZA`, `NITRO`, "TCHÊ"), mas planos e sem estrutura de suporte detalhada; marcos distantes ficam **pequenos** (a V10 já mediu: 11% da altura de tela a 300 m contra ~35% do HC2).
   - **Elementos do cenário recortam com a névoa tarde:** a 300 m só 28% de névoa (§3.5).
   - **Repetição de modelo** em Copacabana (mesmos 12 ids de prédio em 225 prédios, V4) e **LOD aparecendo:** não observado em quadro parado.
2. **O que um estilizado bem feito faria.** Árvores com silhueta própria e folhagem em placas recortadas, variação por instância de **matiz** e escala não uniforme, camada de arbustos e flores contínua junto à pista, prédios com topo decorado (tanque, antena, letreiro), mais densidade perto da pista (onde o olho está) e menos longe.
3. **Correção proposta.**
   - **F4 Vegetação:** variação por instância em **matiz** (±8°) e escala não uniforme (±15%); 2 variantes extras por espécie dominante com forma de copa diferente (reuso de `geom.ts`); trocar a saia por mancha irregular + tufos de **cutout** (o lote `cutout` já existe, L4); oclusão pintada no vértice sob a copa e no pé do tronco (extensão de `volumeLook`); **densidade subir em 1–2 jogadores** e ficar igual em 3–4 (o gate de 4p não tem folga).
   - **F5 Prédios e estrutura:** AO no pé e sob beirais por cor de vértice; adereços de telhado instanciados (tanque, antena, ar-condicionado) no mesmo lote; janelas com 3 níveis de acendimento e reflexo de céu fingido por gradiente vertical; poste e placa com suporte e luminária.
   - **Ganho:** **alto** (árvore e prédio dominam as laterais). **Custo:** F4 ~+20–35 mil △ por viewport (a V13 mediu a folga ao limite do gate: copa-1p Alta ~85 mil, copa-4p Alta 117 mil, sampa-4p Alta 203 mil; Média 79/111/171 mil), 0 chamadas novas (mesmos lotes). **Lembrar que o passe de sombra repete os △ de quem projeta sombra** (V13: ~40% dos △ da cena): objeto novo que projeta sombra custa o dobro. **Risco:** **colocação sólida vem do núcleo** (a semente do prédio sai do sprite do `core`): **só decoração não sólida** pode ser adicionada, senão muda colisão e `sim-golden`; testes `scenery*`, `scenery-forma` (≤ 900 △ por segmento), `hc2-cenario`.

### 3.7 Sombras (contato, projetada, qualidade) — `01`, `03`, `04`, `07`, `c02`, `c03`

1. **O que parece desenho e por quê.**
   - **Árvores não projetam sombra do sol** (`castShadow` só em `flat/office/apartment/classic/house`, `runtime.ts:355`). A sombra da árvore é a mancha circular (`blobTexture`, 64 px, 0,34 de alfa, cor `#1c2248`) **centrada embaixo**, sem alongar na direção do sol, enquanto o poste e o prédio projetam sombra direcional. Duas lógicas de luz na mesma cena.
   - **Sombra do sol:** `PCFShadowMap`, `radius 2`, mapa 2048 (Alta, 1–2p) ou 1024 com atualização a cada 2 quadros (3–4p). Boas faixas escuras na pista (`01`) mas **borda um pouco serrilhada** e sem degradê de penumbra.
   - **Sem AO:** nenhuma em Baixa e Média; na Alta só até 2 jogadores (GTAO a meia resolução). A base de árvore, poste e prédio "flutua" na grama.
   - **Cor da sombra:** a tinta de sombra é azul-lilás (V10: bom); **a sombra no chão do deserto** (`c07`) é um cinza-marrom com borda desfocada pelo desfoque radial.
2. **O que um estilizado bem feito faria.** Uma única lógica de sombra: direcional e suave, com contato escuro e curto (AO) onde o objeto toca o chão.
3. **Correção proposta (F6).** (a) **Sombra falsa direcional** para árvores, postes e placas: a mancha vira elipse esticada por `1/tan(elevação)` na direção do azimute do sol (uniforme que o `sky.ts` já tem), com textura de folhagem, opacidade 0,34 → 0,28, no mesmo lote `blob` (0 chamadas, serve na Baixa); (b) **AO fingido** por cor de vértice no pé dos objetos (feito com F4/F5) e uma faixa escura sob o kerb e a guia (vértice da pista); (c) ajustar `shadow.radius`/`bias` e **retirar o serrilhado** (amostra rotacionada ou `radius 3`); (d) **opcional Alta/Ultra**: copas dentro de 60 m entram no mapa do sol (custo: +1–2 chamadas por viewport e os △ das copas **em dobro**, pelo passe de sombra: **medir com `tools/folga-gate.mjs`**; só 1–2 jogadores). **Ganho:** **alto** (coerência de luz). **Custo:** (a)–(c) 0 △, 0 chamadas; (d) +calls. **Risco:** `sky.ts` é compartilhado com F3 (ver §6); travas de sombra azul-lilás (`hc2-grade`).

### 3.8 Luz e gradação de cor — todas as capturas

1. **O que parece desenho e por quê.**
   - **Saturação no teto e sem hierarquia** (tabela §2): céu 0,99, grama 0,90, terra 0,81–0,90. O **centro do quadro** mede 0,40–0,61 só porque o asfalto é cinza (V10: HC2 0,50–0,82). O que falta não é "mais saturação" global: é **variação de matiz e valor dentro do saturado** e reservar o máximo para o carro e a interface.
   - **Exposição e contraste plausíveis**, bloom de dia discreto (`[0.34, 0.5, 2.2]`), noite roxa boa (`05`).
   - **Noite monocromática** (`05`): chão, pista, calçada e prédio quase do mesmo matiz roxo (279–300°); a separação é só de valor. O HC2 separa por matiz (ver V12 §5: a pista rosa do HC2 depende de mover travas).
   - **Pôr do sol:** o rosa-choque do céu (`06`) é um degradê liso de cor só; o Cânion (`07`) funciona porque tem sol, nuvens iluminadas e luz quente no chão.
2. **O que um estilizado bem feito faria.** Paleta com **matiz que muda com o valor** (sombras para o azul/violeta, luzes para o amarelo, meios-tons verdes que andam do amarelo-limão ao azul-esmeralda), contraste local, dois ou três acentos de cor de luz por cena.
3. **Correção proposta (F7, arquitetural).** (a) Variação de matiz em função do valor no `gradingFor` (split-toning por bioma, hoje só `shadows`/`highlights` somados); (b) paleta do chão/grama com 3 tons por bioma (claro quente, médio, escuro frio) em vez de 1 + jitter (`groundTone`); (c) rebalancear saturação do chão para ~0,70–0,80 e deixar céu/carro/HUD no teto; (d) à noite, **separar matiz** de chão, pista e prédio (≥ 20° de diferença) sem mexer em `skyLight`/`fogLight`/luz do carro (travas V12). **Ganho:** **alto**, mas **o mais arriscado**: as travas de cor (`cor-brilho`, `hc2-grade`, `estrada-v11`, `noite-roxa`) foram calibradas passo a passo e cada uma é um contrato. **Custo:** 0. **Risco:** alto (travas) — por isso arquitetural e sozinho.

### 3.9 Bloom e pós — `05`, `07`, `13` × `14`

1. **O que parece desenho e por quê.**
   - **Sem vinheta, sem grão, sem dither**: a bíblia prometia "vinheta leve" (`DIRECAO-DE-ARTE.md` §2.4) mas `grep -i vignet src/render` é vazio. Sem profundidade de campo (Ultra: `implemented: false`), sem raios.
   - **Baixa × Alta** é visível (56% dos pixels): na Baixa não há sombra do sol nem AO nem bloom nem gradação de pós (`13`). Mas **Alta × Ultra** são quase iguais (5%): o degrau do topo não entrega "mais bonito" para quem tem a máquina.
   - **Desfoque radial** a ≥ 85% da velocidade amolece **tudo na borda** inclusive cenário próximo e HUD de jogo (as rochas de `10`, `15` e o poste de `01` ficam em mancha); é o clima de velocidade, mas aparece em todas as capturas porque o harness roda em 100%.
   - **Banding:** o céu é um degradê suave de 8 bits sem dither; não vi faixa nas capturas, mas é o risco clássico quando se suaviza.
2. **O que um estilizado bem feito faria.** Vinheta leve, grão/dither fino, bloom em fontes de luz (sol, vidro, luminária) e **realces suaves** no cenário, desfoque de borda só em velocidade alta e sem borrar o que importa.
3. **Correção proposta (F7).** Vinheta + dither de 1 LSB **no fragmento do `OutputPass` por patch** (mesmo padrão do `patchBloomHighPass`; **0 passe a mais**, o gate de passes `5` não muda), nitidez leve na saída; no Ultra, trazer **um** efeito a mais de verdade (candidato barato: **raios de sol** a meia resolução, 1 passe; ou DoF só no pódio/menus, que já tem o sinal). **Ganho:** médio. **Custo:** vinheta/dither +3 ALU em tela cheia; raios +1 passe (Ultra) e `postPxRatio` sobe (gate Ultra 8,7×: **editar o gate de propósito**, é arquitetural). **Risco:** gate; `postfx-plan.test.ts`.

### 3.10 Partículas e efeitos (poeira, faísca, fumaça, nitro) — `03`, `12`, `c08`

1. **O que parece desenho e por quê.**
   - **Bolhas de poeira/fumaça são esferas brancas perfeitas** (`c08`): disco com borda suave, sem ruído, sem rotação e sem variação de cor; leem como bolas de pingue-pongue. O shader "de bolha" tem contorno escuro e brilho de lado (`effects.ts`), intencional do M5 (cartum), mas agora brigando com a diretriz "mais realista".
   - **Linhas de velocidade rosa** (`12`): da faísca roxa do mini-turbo e dos traços do canto (V10): coerentes, legíveis.
   - **Fogo do escape** (nitro) bom (`12`, `03`): laranja HDR, mas **não é do meu escopo** (é a chama do carro, `cars/flame.ts`).
   - **Faltam partículas ambientes** (poeira em suspensão, folhas, pólen, insetos): o mundo parado de dia não respira.
2. **O que um estilizado bem feito faria.** Poeira como nuvem irregular que se desfaz, trilha contínua atrás da roda na terra, fagulha com cauda, partículas ambientes sutis.
3. **Correção proposta (F8).** Trocar o disco por um **sprite de fumaça** de 4 quadros (atlas pequeno, mesmo painter procedural das nuvens), com rotação, alfa por ruído e variação de cor por partícula; emitir **trilha** (não bolhas soltas) na terra e na grama; 8–16 partículas ambientes por viewport (pontos, 1 chamada em Baixa+). **Ganho:** médio. **Custo:** 0 △ novo, 0–1 chamada, textura 256². **Risco:** testes `fx-*`, `efeitos-realistas`, `hc2-fx` (valores exatos de tamanho/vida); respeitar "Reduzir efeitos" (a fumaça não some, só escala).

### 3.11 HUD — `01`, `c09`, `08`, `09`

- **Está bom:** posição grande em itálico com contorno, velocímetro em arco, barras, tipografia legível (V5). Não é causa de "desenho".
- **Dois ajustes pequenos:** (a) o **cartão do marco** ("Pão de Açúcar") cobre a traseira do carro e o centro da pista por ~4 s: movê-lo para o terço superior ou para o lado do minimapa; (b) em 4p os números de tempo do centro se repetem 4 vezes e o minimapa tem a **silhueta do desenho** sobre a cena. Ganho baixo, custo 0, risco só nos testes de layout (`playtest-layout`). Sem frente própria; pode entrar na F8 (arquivos `caption.css`/`hud.css` disjuntos).

### 3.12 Resumo por elemento (o que mais pesa)

| Elemento | Parece "desenho" por | Ganho | Frente |
|---|---|---|---|
| Chão | cor única por vértice, sem textura; prateleira (Alpino) | **alto** | F1 |
| Estrada | cor lisa, polígonos de terra, junta preta, sem normal/rugosidade | médio-alto | F2 |
| Horizonte e névoa | silhuetas lisas, névoa de cor única | **alto** | F7 (+F3) |
| Cenário | pirulito, pouca variação, esparso, sem AO | **alto** | F4, F5 |
| Sombras | duas lógicas de luz; sem AO nos degraus baixos | **alto** | F6 |
| Cor e luz | saturação no teto sem hierarquia | **alto** (arriscado) | F7 |
| Céu e sol | 3 formas de nuvem, sol fora do quadro de dia | médio | F3 |
| Pós | sem vinheta/dither; Ultra = Alta | médio | F7 |
| Partículas | esferas perfeitas | médio | F8 |
| HUD | ok; cartão cobre o carro | baixo | F8 |

## 4. Comparação com o Horizon Chase (pelo conhecimento geral do estilo)

Sem as imagens no repositório (ver §1), só afirmo o que se sabe do estilo em geral, não de quadros específicos: o Horizon Chase (Turbo e 2) é um estilizado de **superfícies simples, mas com gradientes fortes, sol/horizonte grandes e quentes, bastante cenário colado à pista, luz quente e contraste de valor claro**; o HC2 acrescenta acabamento (reflexo, luz de borda, sombras e profundidade) por cima disso. Nossa cena já tem a base certa (low-poly legível, gradação, nuvens pintadas, noite roxa), mas **perde na densidade ao redor da pista, na profundidade atmosférica e no "acabamento" das áreas grandes** (chão e estrada). A boa notícia é que é o tipo de coisa que o shader e a textura procedural resolvem (ganho da §3), sem arte nova.

## 5. O que NÃO dá para resolver sem arte feita à mão (honesto)

- **Silhueta e personalidade de árvores, prédios e marcos.** Procedural dá variação (escala, matiz, dobra), não **design**: uma copa "bonita" é decisão de artista. As 161 formas de marco e as espécies de árvore estão no limite do que o código e o `tools/convert-landmark.mjs` entregam. Para subir, é arte pronta CC0 limpa no Blender (decisão nº 28) ou Meshy aprovado pelo dono.
- **Textura pintada com intenção** (asfalto com remendos que contam história, parede com sujeira em lugar certo). O que dá: ruído com duas escalas, trilha de pneu, desgaste de faixa. Falta o "olhar" do artista; o resultado será **bom, não único**.
- **Prédios e fachadas do tamanho do HC2**: janela, balcão, letreiro e telhado com detalhe só crescem com modelo/atlas feitos por alguém.
- **Luz assada por pista (R2).** É o maior salto de acabamento por real gasto (`DIRECAO-DE-ARTE.md` §3), mas sai do Blender em lote, não do código do jogo. Meu plano usa AO por vértice e sombra falsa como substitutos baratos, que cobrem ~60% do efeito.
- **Chuva, neblina e clima:** não existem; precisam de sistema novo e de decisão de design (afetam leitura de pista).

## 6. Plano: 8 frentes, ordem de execução

Regras de `docs/PLAYBOOK.md` §3: no máximo **5 agentes ao mesmo tempo, 3 capturando**; implementador não faz merge; frentes só rodam juntas com **arquivos disjuntos**. Não existe `ONDAS-PARALELAS.md` neste repositório (é do Padelizou): vale o PLAYBOOK.
**Para todas:** só `src/render` (e `tools/` de captura); testes **escritos antes e vistos falhar pelo motivo certo**; capturas antes × depois na mesma câmera (galeria `tools/galeria`, 13 cenas, `comparar.mjs`: "chamadas e △ que subiram" tem de ser 0 ou explicado); `gl-render` (gate) verde; nenhum programa novo no meio da corrida (`corrida-que-muda-gl`); Baixa continua a mais barata.

**Ordem:** onda 1 = F1, F2, F4, F5, F8 (5 agentes); onda 2 = F3 e F6; onda 3 = **F7 sozinha** (recalibra cor e névoa em cima do que as outras deixarem, e mexe nas travas).

### F1 — Chão e acostamento (terreno com detalhe estável) · não arquitetural
- **Escopo:** `Strip` ganha `aDet`; material do chão com detalhe em 2 escalas, ceifa/ondulado por bioma, borda irregular guia → chão; **corrigir a prateleira do Alpino**.
- **Arquivos:** `src/render/terrain.ts` (só `Strip`, material do chão, bloco de colunas), novo `src/render/terrain-detail.ts` (GLSL + parâmetros por bioma), testes novos. **Não tocar:** `buildRing`/horizonte (F3 chama de fora), `palette.ts` (campos novos só aditivos no fim do tipo, ou uniforme local).
- **Testes de contrato (antes):** (1) puro: `terrainDetail(bioma)` devolve amplitudes ≤ 0,16 e distância de desvanecimento ≥ 50 m; (2) **estabilidade:** duas capturas com o carro 0,5 m adiante, região do chão, diferença média ≤ 2/255 **após** compensar o deslocamento (teste GL com `aDet` fixo; prova que não "nada"); (3) GL: detalhe fino (resíduo 5×5) do chão da Foz/Serra ≥ 0,035 e ≤ 0,08 (hoje 0,0151/0,0002); (4) continuidade: nenhuma folha de terreno acima do anel de morros no Alpino (altura da coluna 11 ≤ base do anel 0).
- **Limite de desempenho:** 0 △, 0 chamadas; +≤ 30 ALU só no chão; Baixa 1 oitava; `gl-render` sem subir △/chamadas.
- **Pronto visual:** `02` e `04` deixam de ter faixa lisa ≥ 100 px de lado; Alpino sem a folha atravessando as árvores; a borda guia → chão tem forma irregular; nenhuma cintilação em vídeo curto.

### F2 — Estrada (asfalto, terra, faixas, zebra) · não arquitetural
- **Escopo:** tirar polígonos/remendos com contorno, 2 escalas de mancha com variação de matiz, junta suave, `roughnessMap` + `normalMap` (Média+), faixa gasta, borracha na curva, kerb com bisel.
- **Arquivos:** `src/render/road-textures.ts`, `src/render/road.ts` (material e `setQuality`), testes `estrada-v11`/`pistas-v4` **estendidos** (não substituídos). **Não tocar:** `palette.ts` (`roadBase/Alt/Earth` ficam), `stylize.ts`.
- **Testes de contrato:** (1) puro (`asphaltImage`): nenhum retângulo com borda (gradiente da borda do remendo ≤ 0,12 de luma por px); junta ≥ 6 px e fator ≥ 0,75; duas escalas (variância a 5–10 m ≥ 0,01 e a 0,2 m ≥ 0,004); (2) puro: `roughnessImage` com trilhas 0,5–0,65 e centro ≥ 0,9; (3) GL: detalhe da estrada de terra ≥ 0,035 (hoje 0,022); (4) **travas existentes continuam**: faixa ≥ 3:1, asfalto neutro (`cor-brilho` 2b), terra com croma ≥ 60 (`2c`).
- **Limite de desempenho:** 0 △, 0 chamadas; +2 texturas (≤ 6 MB); Baixa sem normal/rugosidade.
- **Pronto visual:** `c01` e `c07` sem hexágonos nem retângulos; trilha de pneu com brilho visível ao sol; linha preta transversal inexistente.

### F3 — Céu, nuvens, sol e anéis de horizonte · não arquitetural (tem decisão do dono)
- **Escopo:** atlas de nuvens 3 → 8 células, cirros por ruído, gradiente com mais paradas e dither, brilho do lado do sol de dia (opção A) ou sol de dia a ~25° (opção B, **decisão do dono**), ruído de arvoredo/cume nos anéis.
- **Arquivos:** `src/render/sky.ts`, `src/render/horizon.ts`, `src/render/lensflare.ts`; `terrain.ts` **só** em `buildRing` (hunk disjunto de F1; fazer depois da F1 mesclar, ou entregar função em arquivo novo `horizon-rings.ts` e uma linha de chamada).
- **Testes:** (1) puro: `cloudLayout` — ≥ 8 células distintas usadas em 36 nuvens, nenhuma célula > 35% das nuvens; (2) puro: gradiente monótono e dentro de limites; contínuo na corrida que muda (nenhum salto > 0,07 por passo de 5%); (3) GL: com a opção B, o sol de dia aparece no quadro em ≥ 1 câmera de referência; (4) trava: `sunLight`/exposição do carro inalterados na opção A.
- **Limite:** +1 textura 2 MB, 0 △ de cenário, +1 chamada no máximo (cirros no próprio domo = 0).
- **Pronto visual:** céu de `03` sem repetição reconhecível em 5 quadros; o lado do sol é visivelmente diferente do oposto; os anéis têm silhueta com ruído.

### F4 — Vegetação e cobertura · não arquitetural
- **Escopo:** variação por instância de matiz e escala não uniforme; variantes extras das espécies dominantes; saia irregular + cutouts; oclusão pintada sob a copa; **densidade por número de jogadores** (sobe em 1–2p, igual em 3–4p).
- **Arquivos:** `src/render/scenery/vegetation.ts`, `geom.ts` (`volumeLook`), `catalog.ts` (receitas de vegetação), `layout.ts` (só colocação decorativa não sólida). **Não tocar:** `structures.ts`, `textures.ts` (F5).
- **Testes:** (1) puro: cada receita tropical/savana/alpino ≥ 6 variantes de árvore distintas por forma; (2) puro: `tintFor` agora varia matiz ≥ ±6° e valor ≤ ±10%; (3) **nenhum item novo é sólido** (varre o layout: `collisionHalfM` do novo = 0 ou fora da pegada do núcleo; `sim-golden` e `hashRace` inalterados); (4) `scenery-forma`: ≤ 900 △ por segmento; (5) densidade em 3–4p ≤ +15 mil △ sobre a de hoje (teste de contagem por número de jogadores).
- **Limite:** ≤ +35 mil △ por viewport em 1–2p e ≤ +15 mil em 3–4p (folga V13: 111 mil na copa-4p Média, mas 4 viewports somam); **0 chamadas novas**; nenhuma cena acima do limite do gate (Sampa 4p Média ≤ 345 mil).
- **Pronto visual:** `03`, `04`, `15`: nenhuma árvore se repete em um trecho de 80 m; chão rente à pista com cobertura contínua; a saia da árvore não lê como chapéu.

### F5 — Prédios, placas e adereços de estrutura · não arquitetural
- **Escopo:** AO por vértice no pé e sob beirais, adereços de telhado instanciados, janelas com 3 níveis de acendimento e reflexo de céu fingido, poste e painel com suporte detalhado.
- **Arquivos:** `src/render/scenery/structures.ts`, `scenery/textures.ts` (fachada), `scenery/props.ts`. Entradas novas no `catalog.ts` por **arquivo novo** `catalog-structures.ts` mesclado numa linha (o `catalog.ts` é da F4).
- **Testes:** (1) puro: cada estilo de prédio tem ≥ 3 níveis de acendimento (histograma da emissiva); (2) puro: pegada e altura dos 4 visuais iguais (±1 cm: trava da V4); (3) GL: `c06` — razão claro/escuro da parede ≥ 0,25 (hoje a parede é quase preta); (4) ≤ 900 △ por segmento.
- **Limite:** ≤ +8 mil △ por viewport; 0 chamadas novas (mesmos lotes `office/apartment/classic/house`); 4p Média intacto.
- **Pronto visual:** prédios de `01`, `06`, `09` com topo e base legíveis; nenhuma parede preta chapada no pôr do sol.

### F6 — Sombras e oclusão de contato · não arquitetural
- **Escopo:** sombra falsa **direcional** para árvores/postes/placas (elipse esticada pelo sol), AO fingido na pista/guia, ajuste de PCF (raio/bias), copas próximas no mapa do sol só na Alta/Ultra (opcional, medir).
- **Arquivos:** `src/render/scenery/runtime.ts` (lote `blob`, `castShadow`), `src/render/postfx/shadows.ts`, `src/render/postfx/plan.ts` (`shadowPlan`); `sky.ts` só o bloco de sombra (linhas ~444–465): **fazer depois da F3** ou pedir a ela 3 linhas.
- **Testes:** (1) puro: o eixo maior da elipse acompanha o azimute do sol e o comprimento = `altura / tan(el)` limitado a [1,2, 3,0] × raio; (2) puro: opacidade ≤ 0,34 e cor com tinta de sombra (V10); (3) GL: sombra da árvore e do poste na mesma direção (ângulo ≤ 10°); (4) gate: chamadas e △ inalterados na Baixa/Média; se (d) entrar, +≤ 2 chamadas por viewport na Alta/Ultra.
- **Limite:** 0 △; 0 chamadas (a)–(c); (d) ≤ +2 chamadas e medido.
- **Pronto visual:** em `03`/`04` as sombras de árvore e de poste apontam juntas; o pé de cada objeto tem contato escuro curto.

### F7 — Névoa atmosférica, gradação e pós · **ARQUITETURAL** (shader global, paleta, travas de cor, gate)
- **Escopo:** (a) patch global de `fog_fragment` com **altura** e **tom por ângulo do sol**; (b) mesma conta nos anéis de horizonte; (c) variação de matiz por valor (split-toning) e chão com 3 tons por bioma; (d) saturação com hierarquia (chão ~0,70–0,80, céu/carro/HUD no teto); (e) noite com matiz separado entre chão, pista e prédio; (f) **vinheta + dither no `OutputPass` por patch** (0 passe); (g) um efeito real a mais no Ultra (raios de sol a meia resolução, **ou** DoF de menus) com o gate do Ultra editado de propósito.
- **Arquivos:** `src/render/stylize.ts`, `palette.ts`, `postfx/pipeline.ts`, `postfx/plan.ts`, `src/bench/gate.ts` e `ultra.ts` (se (g)), `terrain.ts` só `buildRing` (cor assada), testes de cor.
- **Testes (antes):** (1) puro: o chunk de névoa tem a âncora do three (falha alto se o three mudar, como o do bloom); (2) puro: névoa a 300 m ≥ 40% de cor (hoje 28%) e **continua 0% até ~80 m** (bíblia §4: "nenhuma até ~80 m"); (3) GL: saturação do chão de grama ≤ 0,82 e ≥ 0,60; matiz do chão varia ≥ 8° entre sombra e luz; (4) GL: vinheta ≤ 12% no canto e 0 no centro; (5) **travas de cor atuais continuam verdes**, e **toda trava que mudar leva o motivo escrito** (padrão V10 §3); (6) `corrida-que-muda-*` (nenhum salto > 0,07 por passo) e Alta × Ultra diferem ≥ 12% dos pixels se (g) entrar.
- **Limite:** 0 △; 0 chamadas; passes inalterados (5) e `postPxRatio` inalterado, **a menos que (g) entre** (então +1 passe só no Ultra, gate editado e justificado); +3–5 ALU por pixel de objeto; programas recompilam na carga, nunca no meio da corrida.
- **Pronto visual:** `03`, `11`, `15`: planos distantes visivelmente mais pálidos e quentes que os próximos; o horizonte deixa de ser pilha de silhuetas turquesa; `05` separa chão, pista e prédio por matiz; o carro continua o objeto mais saturado do quadro (alerta do `referencias.mjs`).
- **Por que sozinha:** mexe em todos os materiais e nas travas calibradas da V10–V12; roda depois, para calibrar em cima do chão, da estrada e do cenário novos.

### F8 — Partículas, efeitos e cartão do marco · não arquitetural
- **Escopo:** poeira/fumaça com sprite irregular (4 quadros), trilha contínua na terra/grama, partículas ambientes sutis, cartão do marco fora da traseira do carro.
- **Arquivos:** `src/render/fx/*.ts`, `src/render/effects.ts`, `src/render/caption/caption.css`. **Não tocar:** `cars/flame.ts` (carro: outra frente).
- **Testes:** (1) puro: a bolha não é um disco perfeito (alfa com variação angular ≥ 0,08) e a rotação ≠ 0; (2) puro: trilha emite com taxa contínua e dentro dos tetos do `fxPlan`; (3) `hc2-fx`/`efeitos-realistas` atualizados **com motivo**; (4) "Reduzir efeitos": partículas ambientes = 0 e a fumaça continua escalada (não some); (5) layout: o cartão do marco não intersecta a caixa do carro (`playtest-layout` e teste puro do retângulo).
- **Limite:** 0 △ novo; ≤ +1 chamada; textura ≤ 256²; pool de partículas sem crescer.
- **Pronto visual:** `c08` sem esferas perfeitas; trilha de poeira atrás da roda na terra; cartão fora do carro.

### Mapa de arquivos e conflitos (para quem mescla)

| Arquivo | Dono | Observação |
|---|---|---|
| `terrain.ts` | F1 (`Strip`, material) · F3 e F7 (`buildRing`) | hunks disjuntos; F1 mescla primeiro |
| `sky.ts` | F3 · F6 (bloco de sombra, ~l. 444–465) | F6 depois de F3 |
| `palette.ts` | F7 (os outros só **adicionam** campos no fim do tipo) | evita retrabalho nas travas |
| `catalog.ts` | F4 (F5 usa arquivo novo) | |
| `stylize.ts`, `postfx/*`, `gate.ts` | F7 | |
| `road*.ts` | F2 | |
| `fx/*`, `effects.ts` | F8 | |
| `scenery/runtime.ts` | F6 | |
| `scenery/structures.ts`, `textures.ts`, `props.ts` | F5 | |
| `scenery/vegetation.ts`, `geom.ts`, `layout.ts` | F4 | |

## 7. Riscos transversais (e como medi-los)

- **Gate (`src/bench/gate.ts`):** a V13 abriu folga medida por △ no pior viewport (§3.6), mas o limite escrito no gate segue o de antes (ex.: sampa-4p Média 345 mil) e **cada viewport paga a sua conta** (4p = 4×). Todo adicional de geometria tem de **escalar por número de jogadores** (como `shadowPlan`, `fxPlan` e o LOD por tamanho na tela dividida da V13) e **ser medido por `node tools/folga-gate.mjs`**. Quem projeta sombra paga em dobro (passe de sombra).
- **Determinismo e online:** nada em `src/core`; o layout decorativo usa `hash2/hash3` por segmento (nunca `Math.random`), igual ao que o cenário faz hoje. Item **sólido** novo muda colisão e quebra `sim-golden`: proibido nestas frentes.
- **Save:** nenhuma frente grava dado novo. Se alguma quiser opção do jogador (ex.: intensidade da vinheta), é campo **aditivo** como `highCurveCamera` (V12 §1).
- **Programas de shader:** cada `onBeforeCompile` novo precisa de chave de programa nova; compilar **na carga**, nunca durante a corrida (`corrida-que-muda-gl`).
- **Desempenho real:** nada deste documento mede FPS (swiftshader); o `--bench` do dono é o juiz (T1 do cronograma). Todas as estimativas de custo são por contagem de △, chamadas, passes e ALU, **provisórias**.
- **Gosto:** "bonito" é do dono. Cada frente entrega antes × depois e fica na dúvida até ele jogar.

## 8. Arquivos desta frente

Imagens em `docs/diag-v22/` (JPEG): `01-reta-dia-copacabana`, `02-curva-densa-serra` (atrás de uma crista, mostra o pior caso do chão), `03-curva-densa-foz`, `04-curva-serra-b`, `05-noite-sampa`, `06-por-do-sol-paraty`, `07-canion-entardecer`, `08-dividida-2p`, `09-dividida-4p`, `10-deserto-xingo-dia`, `11-neve-alpino-dia`, `12-derrapagem-nitro`, `13-copa-baixa`, `14-copa-ultra`, `15-fuji-dia`; recortes `c01-estrada-terra-foz`, `c02-estrada-asfalto-copa`, `c03-chao-e-arvores-serra`, `c04-faixa-flutuante-alpino`, `c05-ceu-nuvens-foz`, `c06-predio-pordosol`, `c07-estrada-deserto`, `c08-particulas-bolhas`, `c09-hud-e-aviso`.
Comandos (vite no worktree, porta livre): `track=copacabana&seg=300` (01, 13 com `&q=low`, 14 com `&q=ultra`), `track=serra_do_navio&seg=300|1100`, `track=foz_do_iguacu&seg=215`, `track=sampa_noite&seg=970`, `track=paraty&seg=200`, `track=canion&seg=130`, `track=xingo&seg=110`, `track=passo_alpino&seg=180`, `track=monte_fuji&seg=80`, `humans=2|4&ticks=1500`, `drift=1&driftlevel=3&nitro=1&ticks=1500`.
