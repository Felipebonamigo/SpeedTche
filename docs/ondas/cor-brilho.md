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

## 3. Restrições (não quebrar)

Gate de chamadas/triângulos (`src/bench/gate.ts`, `tests/gl-render.test.ts`) sem subir; nenhum programa novo no meio da corrida (`tests/corrida-que-muda-gl.test.ts`); a corrida que muda continua por uniformes;
degraus (`atLeast`) e "Reduzir efeitos" (sem clarões); faixas da M2 (`tests/paleta-m2.test.ts`, `tests/lente-m2.test.ts`) — faixa que mudar, muda de propósito com a razão no comentário.

## 4. Capturas

Antes × depois, mesma câmera, `tools/render-harness.mjs` (copacabana, canion, paraty, sampa_noite, split4) e a folha de `tools/folha-copas.ts … ambos`; montagem em
`scratch/cor-brilho/antes-depois.png`. O "antes" sai de uma cópia congelada do 150dd01 (`git archive`) servida por outro vite, para o código novo não vazar nela.

## 5. Registro

(preenchido no fim)
