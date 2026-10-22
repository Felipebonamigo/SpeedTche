# V22 · F1 — Chão e acostamento (terreno com detalhe estável)

> Branch `nc/f1-chao` (base `603bffe`, com o `main` da F4 mesclado). Só `src/render` + ferramentas de captura. Nada em `src/core`: `sim-golden`, `hashRace` e `determinism` seguem verdes.
> Imagens em `docs/diag-v22/f1-chao/` (JPEG): `<cena>-antes.jpg` × `<cena>-depois.jpg` (câmera do diagnóstico, desfoque radial ligado) e `<cena>-parado-*.jpg` (carro parado, sem desfoque). Antes = `main` com a F4; depois = esta branch.

## 1. O que mudou

- **`Strip` ganha `aDet`** (vec2, +8 B/vértice): lateral em m (com o sinal do lado) e distância **absoluta** ao longo em m, desenrolada (4 m por ponto, inclusive através do fim da volta). O mundo é remontado a cada quadro; por isso o detalhe nunca lê posição de mundo, câmera ou tela.
- **`src/render/terrain-detail.ts` (novo)**: um ladrilho de ruído RGBA 256² (4 ruídos de valor periódicos, gerado em código, 256 KB) e o remendo do material do chão (`installTerrainDetail`, chave de programa única `+detail` para as cinco paisagens; bioma, pista, qualidade e período são uniformes). O ladrilho repete um número inteiro de vezes no comprimento da pista: a volta fecha sem emenda.
  - duas escalas (manchas de 12 m e tufos de 2,4 m) + grão de 12 cm (só Alta/Ultra), deriva de matiz de 3–6°, a amplitude vale **no que se vê** (o shader eleva ao quadrado: ±12% de albedo linear são ~±3% de brilho na tela e eram invisíveis) e o total das camadas é limitado a ±0,26;
  - ceifa (faixas de capim paralelas à pista) e ondulado (cristas de areia) por bioma e por lado (`coast`: capim à esquerda, areia à direita);
  - **borda irregular acostamento → chão**: o `verge` é pintado no shader até uma borda de ruído (campo, não régua) com cascalho; as colunas 1 e 2 do terreno agora levam o chão puro (antes: o degradê de 3 m "de aerógrafo");
  - antiserrilha: mipmap + anisotropia 8 (o ladrilho), `fwidth` corta a fina e a grossa quando o pixel passa de ~1/3 da célula, a distância (60 → 130 m) corta a fina, o grão some entre 30 e 60 m.
- **Qualidade (só uniformes, nada recompila)**: Baixa 1 oitava (grossa + ceifa + borda), Média + fina, Alta/Ultra + grão. `renderer.ts`: 1 linha, `terrain.setQuality(q)` em `ensureQuality`.
- **Passo Alpino**: ver §3 (a hipótese do diagnóstico foi refutada).
- Ferramentas: `tools/render-harness.lab.ts` ganhou `lumaBox` e `groundDetail` (aditivos); novo `tools/terreno-detalhe.{html,ts}` (chão plano sintético com o material de verdade, para a estabilidade e a cintilação).

Custo: **0 △, 0 chamadas** (calls/△ idênticos antes × depois nas 7 cenas, ver §4), +1 textura (256 KB), +1 leitura de textura na Baixa, +3 na Alta. ALU: o plano pedia ≤ 30; o fragmento do chão ficou mais caro que isso na Alta (3 leituras, hue, ceifa, borda): **não medi ALU** (swiftshader não diz nada de GPU); o `--bench` do dono é o juiz. Se pesar, o primeiro corte é o grão (`Q.y = 0`) na Alta.

## 2. Testes (escritos antes, vistos falhar pelo motivo certo)

| Arquivo | O que trava | Como falhou antes |
|---|---|---|
| `tests/terrain-detail.test.ts` (puro/CPU, 14) | amplitudes ≤ 0,16 e desvanecimento ≥ 50 m por bioma; ladrilho inteiro e célula 9–15,5 m em pistas de 800 m a 60 km; imagem do ruído (periódica, sem emenda, canais independentes); **`aDet` do mesmo (segmento, coluna) idêntico em quadros com o carro 0,5 m, 37 segmentos adiante e através do fim da volta**; texto do shader (sem `gl_FragCoord`/`cameraPosition`/mundo; 3 leituras; chave `+detail`); Baixa/Média/Alta por uniforme; barranca de rocha | módulo inexistente; o teste da tabela de cor foi visto falhar trocando a rocha por rosa e desligando a linha da barranca |
| `tests/terreno-detalhe-gl.test.ts` (GL, 6) | resíduo 5×5 do capim da Foz/Serra em **0,035–0,08**; Baixa < Alta; **estabilidade exata**; **cintilação**; programas sem erro de shader | contra o terreno antigo: resíduo 0,025 (< 0,035), Baixa = Alta, detalhe inexistente |

- Estabilidade: chão plano sintético com o shader de verdade, câmera em duas posições a 4 m; ~660 pontos do chão projetados nas duas imagens (bilinear). Estável **1,4/255**; controle negativo (`aDet` relativo à câmera, o "nadar") **8,8/255**; o teste exige ≤ 3 e > 5.
- Cintilação: câmera andando 8 cm/quadro, diferença segunda no mesmo ponto: **1,12/255** com mipmap (piso de 8 bits ≈ 1); sem mipmap (controle) **8,7/255**; o teste exige ≤ 2 e > 6.
- **Desvio do plano**: o teste (3) do plano falava de `02`/`04` na câmera do diagnóstico. Com o desfoque radial a 100% da velocidade o detalhe fino some; por isso o teste GL mede com o carro parado (sem desfoque), em 4 caixas de capim, e o antes × depois do diagnóstico fica abaixo. Nenhuma trava existente foi afrouxada ou editada.

## 3. A "prateleira" do Alpino: a hipótese do diagnóstico estava errada

Reproduzida (`track=passo_alpino&seg=180`). Medido: a folha **não** é a coluna 11 (380 m) contra o anel 0 — a altura da coluna 11 é ±2 m, o anel está a −70 m; cortar a faixa em 150 pontos a faz sumir; pintar por coluna mostra que ela é feita das colunas 6–8 (60–130 m) de trechos da estrada 20–30 m acima do vale (o traçado sobe em grampos), a 250–640 m em linha reta, vistos de baixo: uma face lisa de ~25 m, verde viva como o prado, com a borda de cima reta (a altura da pista). Não é bug de geometria; é uma barranca que lê como folha.

Correção feita (só cor, `embankmentRock`): na serra, a barranca da pista alta (`roadH` 10–28 m acima do vale, no meio da descida) vira rocha. **Resultado: mitigada, não eliminada** — a faixa ainda aparece como uma fita de borda reta, agora azul-acinzentada em vez de verde viva (`alpino180-antes/depois.jpg`). Tentei descer a serra mais cedo (fim da descida em 95 e 130 m): muda a vista de forma imprevisível (com 130 a câmera ficou dentro do terreno num cruzamento do traçado) e foi descartado. Eliminar de vez pede névoa no terreno distante (F7) ou relevo/anéis (F3), e a causa de fundo é que cada segmento monta o terreno na altura da própria pista (trechos que se cruzam em alturas diferentes).

## 4. Medidas (1280×720, Alta)

Resíduo 5×5 (luma 0–1), mesmas caixas, antes → depois:

| Caixa | antes | depois |
|---|---|---|
| diagnóstico `04` Serra (0,340,200,90) | 0,0237 | **0,0414** |
| diagnóstico `03` Foz (1000,340,260,80) | 0,0446 | 0,0485 |
| diagnóstico `02` Serra (100,380,500,200), atrás da crista, desfoque total | 0,0002 | **0,0033** (21×21: 0,0004 → 0,0147) — **não chega a 0,035** |
| teste GL, carro parado: Foz perto / meio, Serra perto / meio (com a F4 mesclada, o cenário novo já entra nas caixas: "sem o detalhe" = o chão antigo) | 0,041 / 0,054 / 0,045 / 0,063 (antes da F4: 0,024 / 0,026 / 0,027 / 0,037) | **0,052 / 0,061 / 0,058 / 0,074** (antes da mescla: 0,045 / 0,039 / 0,046 / 0,052) |

Rodados na branch já com o `main` mesclado, todos verdes: `gl-render` (14, é o gate), `corrida-que-muda-gl` (3), `cor-brilho-gl` (11), `estrada-gl` (5), `noite-roxa-gl` (4), `hc2-gl` (4), `texturas-gl` (2), `terreno-detalhe-gl` (6); `tsc` limpo; `terrain-detail`, `corrida-que-muda-terreno`, `render-ground`, `terreno-curva-fechada`, `estrada-v11`, `pistas-v4`, `scenery`, `galeria`, `determinism`, `sim-golden` verdes. Gate (`src/bench/gate.ts` não foi tocado): Chamadas × △ por cena, antes = depois: serra300 45 × 81 843, serra1100 46 × 101 424, foz215 47 × 97 277, alpino180 44 × 140 765, xingo110 42 × 161 376, copa300 54 × 185 855, fuji80 45 × 133 263 (Baixa serra1100: 25 × 36 970). Texturas +1; programas iguais. `corrida-que-muda-gl` verde (nenhum programa novo na corrida).

## 5. Rodadas de imagem (antes × depois, mesma câmera)

1. Primeiro depois: nada se via (±12% de albedo linear ≈ 3% de brilho). Passei a amplitude para o que se vê (quadrado) e o chão ganhou manchas e tufos.
2. A borda acostamento → chão ainda parecia reta de perto e o acostamento liso: mais frequência no campo da borda (2,4 m e 12 cm) e variação de tom/cascalho no `verge` (`foz215-borda-*.jpg`).
3. As camadas empilhadas escureciam faixas inteiras (`02`: G 180 → 136): total limitado a ±0,26 e amplitudes menores. Grão com guarda por derivada foi testado e descartado (derrubava o resíduo a 0,029 sem ganho de cintilação medido).

**Pronto visual:** `04`/`03`/`10`/`01` sem faixa lisa; `02` (pior caso) deixa de ser uma lousa e ganha faixas de ceifa e manchas, mas sob desfoque total o detalhe fino não aparece; borda guia → chão irregular (sim); Alpino sem a folha (**não**, mitigado); cintilação conferida só por medida (sem vídeo).

## 6. Ressalvas

- Saturação do capim sobe um pouco (0,76 → 0,79 na Foz; Serra 0,91 → 0,93; o chão já estava no teto): fica para a F7 recalibrar (chão 0,70–0,80).
- ALU do fragmento do chão não medida (ver §1). Sem FPS (swiftshader).
- Sem vídeo: "nenhuma cintilação" só pelas medidas de §2.
- Travas alteradas: nenhuma. `terrain.ts`: `groundColor` colunas 1 e 2 sem o `verge` misturado (o shader pinta), e a rocha da barranca; `buildRing`/horizonte e `palette.ts` intactos.
- Comandos: `npx vitest run tests/terrain-detail.test.ts`; `NC_REQUIRE_GL=1 npx vitest run tests/terreno-detalhe-gl.test.ts --testTimeout=1700000`.
