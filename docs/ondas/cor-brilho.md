# Cor e brilho — os defeitos objetivos da auditoria visual (14/10/2026)

> **Base:** `main` 150dd01, branch `nc/cor-brilho`, worktree `/home/user/speedtche-wt/cor-brilho`. **Só render** (`src/core`, `hashRace` e `sim-golden` não mudam).
> Cartão escrito e commitado **antes** do código; o registro (como cada teste falhou, saídas, contagens, o que ficou feio) vai na §5.
> Capturas da auditoria: Copacabana (dia), Cânion e Paraty (entardecer), Sampa (noite). Números de linha são do 150dd01.

## 1. Os defeitos, a causa achada e a correção

| # | Defeito (o que a captura mostra) | Causa achada (medida ou lida) | Correção |
|---|---|---|---|
| 1a | **Cânion (entardecer): clarão branco no meio da pista** encobre os carros à frente | Medido no harness (`track=canion&ticks=1600`, região da pista à frente): luminância média 0,62 → **0,21 sem os SpotLights do jogador**; sem o reflexo de lente, igual (0,62: **não é a lente**); sem bloom, 0,27; com o bloom **com teto** de luminância 3, 0,36 (a nuvem some). Os faróis do jogador (`cars.ts:234`, `setLight` `:265`: 110 cd no entardecer, decaimento 1,3) ficam a 2 m da câmera: o realce especular deles volta direto para ela em toda face que olha para trás (vidro, cromo, lente: rugosidade 0,05–0,2) com centenas de vezes o limiar, e o `UnrealBloomPass` (`postfx/pipeline.ts:17`, filtro de brilho do three com `smoothWidth` 0,01) passa o texel HDR **inteiro** ao borrão: poucos pixels a 500 viram uma nuvem. No entardecer o farol num carro a 20 m (2,2) vale **4×** a luz do céu na traseira dele (0,5). | (i) **Teto no bloom**: o filtro de brilho limita a luminância que entra no borrão (`BLOOM_CEILING` × limiar): realce especular vira um brilho do tamanho de uma lâmpada, não uma nuvem. (ii) **Farol do entardecer** abaixo da luz do céu; à noite continua mandando. |
| 1b | **Paraty (entardecer): a poça do farol no asfalto forte demais** (e ao lado do carro) | Os SpotLights estão **fixos na linha central** (`cars.ts:233-240`: "sempre na origem"), não no carro: com o carro na faixa da direita a poça cai à esquerda dele. 110 cd com decaimento 1,3 e o cone de 27° pegando o chão a 3 m: a poça mais forte fica colada no carro. | Os faróis vão com o carro do viewport (posição, rumo e guinada, em `Cars.pose`); feixe suave (penumbra 1, cone mais estreito apontado à pista adiante) e a intensidade por período (i). |
| 1c | **Sampa (noite): bolhas brancas de farol** nos carros à frente | Mesmo mecanismo de 1a com 230 cd (especular dos faróis do jogador nos carros à frente + bloom sem teto); medida com/sem faróis e sem efeitos no registro (§5). | (i) e (1b). |
| 2 | **Véu magenta no entardecer e na noite**: carro branco rosa, asfalto roxo, pouco contraste | Modelo de bolso da luz do three (hemisférica + IBL do domo + sol + autoluz → Neutral → gradação; `tests/cor-brilho.test.ts`), que reproduz a captura (asfalto de Paraty: modelo 35,0,52 × imagem 32,0,53; carro branco 162,108,159 × 160,107,163): (a) a **luz que cai nos objetos é roxa/rosa saturada**: `hemiSky` `#8a6ad2` no entardecer e `#4a66b8`/`#5a5aa8` à noite (`palette.ts:310`, `:317`), sol `#ffab62` (`:309`) e a **IBL difusa** = o próprio domo magenta (`sky.ts:401-410`; na traseira do carro ela é a maior parcela: 0,20 de vermelho contra 0,05 de verde); (b) a tinta das sombras da gradação sai dessa hemisférica (`stylize.ts:89`) e o terminador do entardecer é rosa (`#ff3a5a`, `:111`); (c) o **pé do Neutral do three** (`NeutralToneMapping`: subtrai o MENOR canal dos escuros) transforma qualquer tinta de um escuro em cor saturada: o asfalto cinza-arroxeado (49,44,56) sai 23,13,37 — é o "R = 0"/"G = 0" que a M2 já tinha visto; (d) o albedo do asfalto puxa para o vinho/marinho (`palette.ts:244-246`, `:330`). | A cor forte fica no **céu, na névoa e no reflexo**; a luz que cai nos objetos tem saturação limitada: hemisférica e sol do entardecer/noite em tons quase neutros (o sol quente, a sombra fria), **IBL difusa dessaturada** por um uniforme da estilização (só o difuso; o reflexo do céu continua com cor), o **pé do Neutral aplicado à luminância** (sem mudar o matiz) no entardecer e na noite, terminador quente (laranja, não rosa) e asfalto neutro-quente. Tudo derivado da paleta (`light`): a corrida que muda (M6) interpola sem programa novo. **O dia não muda** (trava: Copacabana). |
| 3 | **Lanternas chapadas**: círculos vermelhos uniformes | `cars/material.ts:174`: emissivo = cor da lente × 0,9 (dia) ou 1,3 (noite) (`cars.ts:262`): luminância 0,30 à noite, abaixo do limiar do bloom (1,6) — nunca brilha —, e a lente toda com o mesmo valor (`aMat.w` = 1 em todos os vértices). | Lente com **miolo e borda** (o `aMat.w` cai do centro da tampa para a borda: já é um leque com vértice central) e emissivo **HDR por período** com o miolo esquentando para laranja-branco: à noite passa do limiar (halo do bloom, com teto), de dia fica abaixo (discreto); o freio sempre mais forte. |
| 4 | **Pintura sem reflexo** | O verniz é o `clearcoat` só na Alta, refletindo o PMREM de um gradiente liso (sem horizonte): na lataria branca, branco sobre branco; na Média nada. | **Verniz estilizado** no shader do carro (sem chamada nova, sem programa por quadro): reflexo analítico do céu do período (topo → horizonte) e do chão escuro abaixo da linha do horizonte, por Fresnel, só na lataria pintada; cores em uniformes compartilhados da estilização (`setStylizePalette`), força por degrau (Baixa 0). Ideia do protótipo `nc/estilo-carros` (`aplicar.ts`, tinta "céu em cima, chão dos lados"), sem o protótipo. |
| 5 | **Chama do nitro: duas gotas brancas opacas e bulbosas** atrás do carro (acréscimo do coordenador; galeria `main-f241703`: Paraty, Fuji, Xingó) | É a **malha da chama** (`cars/flame.ts`), **não** a onda de choque da M5 (`fx/shockwave.ts`): o teste GL isola a malha (mesmo quadro, com e sem ela, os `fx-*` escondidos) e mede 46% dos pixels dela quase brancos de dia. (a) gota de barriga a 25% (raio 0,5 × largura 0,5 = 0,25 m), redonda vista de trás; (b) a normal ia ao mundo pela matriz direta (`mat3(m) * normal`) numa malha esticada 4,6× ao longo: as normais deitavam para trás e, de trás, a chama inteira "encarava" a câmera — o núcleo branco (`pow(vFacing, 2.2)`) cobria tudo; (c) ganho HDR 2,0–2,6 com o miolo puxado ao branco: estourava e acendia o bloom; (d) a tampa do bico, de frente para a câmera de corrida, entrava inteira no núcleo. | Língua que abre na boca e só afina (0,46 × 2,2 m: comprimento 7,5× o diâmetro); normal pela inversa da escala; corpo amarelo-laranja → laranja → vermelho que apaga até a ponta e tremula, em cores saturadas; núcleo azul-branco só na boca, mais fraco que o corpo; máximo 1,25× (sem HDR); força pela luz do período (`uFlameGain` 1 · 0,85 · 0,7); blend pré-multiplicado com a cobertura do fundo pela luz (`uFlameCover` 0,5 · 0,3 · 0,12: de dia o laranja se lê, à noite quase só soma); "Reduzir efeitos" mais curta (0,6×) e mais fraca (0,5×). Mesma malha (mesmos 144 triângulos), mesma chamada, mesmo programa (dois uniformes a mais). |

## 2. Testes escritos antes (cada um visto falhar pelo motivo certo)

`tests/cor-brilho.test.ts` (puro) e `tests/cor-brilho-gl.test.ts` (Chromium/swiftshader, `NC_REQUIRE_GL=1`).

| Teste | Falha hoje por |
|---|---|
| Faróis no carro: com o carro em x = 0,6, os SpotLights e o alvo ficam nele | farol em x = 0,00 m, carro em 4,20 m |
| Farol × céu: no entardecer o farol a 20 m ≤ a luz do céu na traseira; à noite ≥ 1,5× | 2,23 > 0,46–0,64 nos 6 biomas |
| Carro branco: croma ≤ 0,22 e sem o verde afundado do magenta (à sombra, ao sol, capô), entardecer e noite | 36 de 36 (ex.: Cânion à sombra 164,103,139) |
| Asfalto escuro neutro-quente (máx − mín ≤ 12, B − R ≤ 4) | 12 de 12 (ex.: 40,0,46) |
| Vermelho continua vermelho; o dia não muda; o céu do entardecer continua quente | **travas** (passam hoje e têm de continuar) |
| Lente com miolo e borda (borda ≤ 0,45 do miolo) | borda = miolo (1,00) |
| Lanterna à noite ≥ 1,2 × limiar do bloom; de dia ≤ 0,8 ×; freio > 1,3 × lanterna | à noite 0,30 < 1,92 |
| Verniz: uniformes do céu pela paleta, o trecho no shader, Baixa sem | uniformes e trecho inexistentes |
| GL: teto do bloom (halo de um ponto HDR 200 ≤ 3 × o de HDR 6) | halo proporcional ao HDR |
| GL: Cânion e Sampa, região da pista à frente com faróis ÷ sem faróis, e pixels estourados | Cânion ~3× |
| GL: o carro branco na captura (traseira) não é rosa/roxo no entardecer e à noite | croma 0,42 (Cânion) |
| Chama: afina a partir do escape (raio máximo em t ≤ 0,15) e comprimento ≥ 5× o diâmetro | raio máximo 0,50 em t = 0,25 |
| Chama: "Reduzir efeitos" mais curta (≤ 0,7×) e mais fraca (≤ 0,6×) | igual (1 > 0,7) |
| Chama: força à noite ≤ 0,75× a do dia | sem uniforme (1 > 0,75) |
| GL: a chama isolada, de trás na câmera de corrida, de dia e à noite: ≤ 5% quase branca e soma quente (R ≥ G ≥ B) | 46% quase branca, soma `rgb(185,174,164)` |

## 3. Restrições (não quebrar)

Gate de chamadas/triângulos (`src/bench/gate.ts`, `tests/gl-render.test.ts`) sem subir; nenhum programa novo no meio da corrida (`tests/corrida-que-muda-gl.test.ts`); a corrida que muda continua por uniformes;
degraus (`atLeast`) e "Reduzir efeitos" (sem clarões); faixas da M2 (`tests/paleta-m2.test.ts`, `tests/lente-m2.test.ts`) — faixa que mudar, muda de propósito com a razão no comentário.

## 4. Capturas

Antes × depois, mesma câmera, `tools/render-harness.mjs` (copacabana, canion, paraty, sampa_noite, split4) e a folha de `tools/folha-copas.ts … ambos`; montagem em
`scratch/cor-brilho/antes-depois.png`. O "antes" sai de uma cópia congelada do 150dd01 (`git archive`) servida por outro vite, para o código novo não vazar nela.

## 5. Registro (14/10/2026)

**Causas confirmadas na medida** (harness 640×360, região da pista à frente; interruptores na própria cena):
- **Cânion:** com faróis 0,62 de luma × 0,21 sem eles; sem o reflexo de lente 0,62 (não é a lente); sem bloom 0,27; com o teto do bloom 0,36; com o farol a 30 cd
  (sem teto) ainda havia bolha branca no carro à frente — o teto é a correção da nuvem, a força do entardecer é a da luz demais.
- **Sampa:** com faróis 0,311 × 0,20 sem (estourados 0,6% → 0%): as bolhas nos carros à frente são o farol + bloom. As **barras brancas** ao lado dos carros
  NÃO são farol: somem com o grupo `fx-*` escondido (com os faróis ligados) — são as linhas aditivas da M5 (velocidade e túnel do vácuo), com o brilho do dia
  sobre a cena da noite. Correção a mais (fora da lista do pedido, dentro do defeito 1): as linhas caem com a luz do período (`effects.ts`, `lineGain`: 1 · ~0,76 · 0,45),
  com teste visto falhar (razão noite/dia = 1).
- **Paraty:** a poça e o clarão no carro à frente-direita (antes-paraty: amarelo estourado) somem sem os faróis (poça 0,268 × 0,214; carro 0,472 × 0,238).

**Testes vistos falhar antes do código.** `npx vitest run tests/cor-brilho.test.ts` (antes de tocar em `src`): `Tests  9 failed | 5 passed (14)`; os 5 que passaram
são **travas** (o vermelho segue vermelho, o dia não muda, o céu do entardecer segue quente, de dia os faróis não acendem, a borda da lente segue vermelha). Motivos:
farol em x = 0,00 m com o carro em 4,20 m; farol a 20 m no entardecer 2,23 contra o céu 0,46–0,64; branco 36/36 fora (ex.: `desert:dusk shadow rgb(164,103,139)`);
asfalto 12/12 (ex.: `desert:dusk rgb(40,0,46)`); lente borda = miolo (1,00); lanterna à noite 0,30 < 1,92; verniz: uniformes e trecho inexistentes.
`tests/cor-brilho-gl.test.ts` rodado numa cópia congelada do 150dd01 (`git archive`, outro vite): teto do bloom `vazamento HDR 200 48450,4 × HDR 6 1552,3` (31×);
Cânion `luma com 0,329 × sem 0,197` (1,67×; caixa a partir de 6 m); Sampa `estourados com 0,0011 × sem 0,0000`; carro branco no Cânion `rgb(255,158,135)` croma 0,47.
O teste das linhas do vácuo: `expected 1 to be less than or equal to 0.55`.

**Ajustes de teste, de propósito:** (1) a âncora do verniz no shader passou a ser o USO (`outgoingLight = carVarnish(`), não a 1ª ocorrência (a declaração);
(2) o ponto da traseira no teste GL: em Sampa (0; 0,66; 2,2) caía 2 px fora da tela e media preto — passou a (±0,5; 0,86; 2,18), a lataria acima das lanternas;
(3) a lente com miolo passou de `aMat.w` para o atributo novo `aLens` (mudar o `aMat` quebrava o contrato do asset: glTF ida e volta, "mesmos pincéis", área das
lanternas) — o critério (borda ≤ 0,45 do miolo) não mudou; (4) `tests/stylize.test.ts`: a curva é `stylizeNeutral` (o Neutral do three com o pé que pode valer
sobre a luminância); (5) `tests/car-material.test.ts`: chave do programa `speed-tche-car-v4`. Nenhuma faixa da M2 mudou: `paleta-m2` e `lente-m2` verdes como estão
(o asfalto novo do entardecer/noite foi escurecido até respeitar estrada × chão ≥ 1,6, a borda da pista e o carro escuro × asfalto).

**Depois** (mesmas medidas): teto do bloom 753 × 753 (1,0×); Cânion 1,07× (estourados +0,004%); Sampa 1,08× (+0,013%); carro branco no entardecer
(Cânion) `rgb(243,207,185)`/`rgb(244,208,186)` (croma 0,24, quente, não rosa) e à noite (Sampa) `rgb(143,139,147)` (cinza; era `rgb(107,108,179)`, azul-roxo).
Nas capturas 1280×720 (pixels, antes → depois): **Cânion** — o meio do clarão `255,247,219` → `143,86,72` (o carro à frente), a traseira do carro branco
`255,150,135` → `243,209,190`, o asfalto `89,57,83` → `79,71,74`, a sombra no asfalto `37,1,48` → `17,7,12`; **Sampa** — a traseira do carro branco `88,80,143` →
`126,118,122`, o asfalto `63,56,79` → `67,61,65`, a pista acesa pelo farol `88,88,89` → `104,88,68`; **lanterna** do jogador no Cânion: disco chapado
`255,114,111` → coroa `255,110,107` e miolo `255,187,152`.

**Contagens, sem FPS** (harness 1280×720, Alta): chamadas e triângulos **iguais** antes e depois nas 5 cenas — copacabana 73 / 274.172, canion 62 / 224.656,
paraty 76 / 301.728, sampa_noite 71 / 301.953, split4 285 / 917.986. O verniz e a lente com miolo não criam chamada (aritmética no shader + 1 atributo de 1 byte por
vértice); nenhum passe novo (o teto é dentro do filtro de brilho do bloom). Programas: a chave do carro (v4) e a da estilização (v2) mudaram (compilados na carga).
`NC_REQUIRE_GL=1 npx vitest run tests/cor-brilho-gl.test.ts tests/corrida-que-muda-gl.test.ts tests/gl-render.test.ts`: `Test Files  3 passed (3)` ·
`Tests  23 passed (23)` (5172 s, com a máquina a ~45 de carga; código do commit d10177b).

**Chama do nitro (acréscimo do coordenador).** A gota branca é a **malha da chama**, não a onda de choque/halo da M5: o laboratório (`flameDiff`) desenha o mesmo
quadro, no mesmo instante, com e sem a malha, com os `fx-*` escondidos — no 150dd01 a diferença é 46% de pixels quase brancos de dia. (O anel grande em volta
do carro na folha `alpine` é a onda de choque do engate do nitro; ela não foi tocada.) Testes vistos falhar antes do código: `tests/cor-brilho.test.ts` §5 —
`raio máximo 0.50 em t = 0.25: expected 0.25 to be less than or equal to 0.15`, "Reduzir efeitos" `expected 1 to be less than or equal to 0.7`, noite × dia
`expected 1 to be less than or equal to 0.75`; GL no 150dd01: `dia: fração quase branca da chama (soma rgb(77,80,72)): expected 0.124…` (1ª versão) e, com o teste
final, `soma rgb(185,174,164)): expected 0.4604 to be less than or equal to 0.05`.
**Teste mudado de propósito** (o meu, antes do merge, razão no comentário): a noite era `sampa_noite` 1400, onde a chama fica abaixo do quadro — a "diferença"
lá era o tempo andando entre os dois quadros (tremor do nitro); passou a Copacabana com o período forçado (mesmo enquadramento do dia), os dois quadros no mesmo
`tick` e a caixa mais justa. Medido (laboratório, Copacabana 1500, câmera de corrida): **150dd01** dia 45,9% quase branca, soma `rgb(185,175,164)`; noite 39,3%,
`rgb(58,99,138)` (azul) → **depois** dia 0%, `rgb(134,87,46)`; noite 0%, `rgb(81,75,61)`. A malha mantém 144 triângulos e a mesma chamada; o programa da chama é o
mesmo (compila no 1º nitro como antes — não mudou nesta frente). Montagem: `scratch/cor-brilho/antes-depois-chama.png` (Fuji da galeria, Copacabana dia e
noite, Sampa noite, Paraty, "Reduzir efeitos", traseira 3/4 e lado) e a folha das 8 chamas escolhidas (`chama/antes-escolhidas.png` × `chama/depois-escolhidas.png`).

**Folha (`tools/folha-copas.ts`).** Só `combinacoes` (18 cenas), não `ambos`: com a máquina a 15–45 de carga e o cadeado global de captura, cada cena levou
~10 min. Montagem `scratch/cor-brilho/antes-depois-combinacoes.png`. O "depois" da folha saiu da árvore congelada do c0a1c4a (antes da chama): as gotas brancas
ainda aparecem nela; a chama nova está só na montagem dela.

