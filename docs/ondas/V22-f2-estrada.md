# V22 · F2 — Estrada (branch `nc/f2-estrada`, base `main` e2703b4, 22/10/2026)

> Frente F2 do plano gráfico V22 (`docs/ondas/V22-diagnostico-cena.md` §3.1 e §6). Pedido do dono: "ainda parece muito desenho; tinha que parecer mais com o Horizon Chase". Sem artista, sem Meshy, sem pacote pago: tudo procedural em `src/render/road-textures.ts` e `src/render/road.ts`.
> **Nada muda em `src/core`**: `sim-golden`, `determinism` e `hashRace` passaram como estavam. Nenhum save, protocolo online, programa de shader novo ou `palette.ts`/`stylize.ts` tocado.

## 1. O que mudou (item do escopo → o que foi feito)

| Escopo do plano | Feito |
|---|---|
| Tirar polígonos da terra | O Voronoi hexagonal (`crackNet`) saiu. No lugar, **seixos** em dois tamanhos (cascalho 3–5 cm, pedra 5–10 cm; mais claros que a terra, aro de contato fraco — a 1ª tentativa, escura com sombra em volta, lia como cratera de Marte na captura), grão fino de 1 px e de 2×2 px e os veios claros que já existiam. Os mesmos seixos alimentam a cor e o relevo (a cúpula no mapa de normais). |
| Remendos sem contorno | O contorno de piche saiu: o remendo é um retângulo de **canto arredondado, borda torta (ruído) e esmaecida ±0,16 m**. |
| 2 escalas de mancha + matiz | Três escalas de tom (larga ~7×3,5 m ±21%, média ~1,5 m ±12%, miúda ~0,3 m ±12%) e **giro de matiz até ±12°** por pixel (matriz de rotação em torno do eixo cinza; o asfalto quase não sente, a terra sim). A cor média continua a da paleta. |
| Junta suave | Faixa em cosseno de 0,48 m (~20 px) e escurecimento ≤ 19% (fator ≥ 0,81), lateral variando e linha levemente torta, no lugar da linha de 1 texel (fator 0,58). A junta longitudinal (0,32 m) ficou larga e fraca. Trincas: finas, interrompidas por ruído, afinando nas pontas. |
| `roughnessMap` + `normalMap` (Média+) | `roughnessImage(earth)` 256×1024 (trilhas polidas ≈0,56 efetivo no asfalto, 0,74 na terra; faixa limpa ≈0,88; óleo ≈0,63) e `normalImage(earth)` 512×1024 (agregado em 3 escalas, mais liso na trilha; sulco da junta e das trincas; na terra, ondas e seixos). Repetem em 48 m sem emenda. A rugosidade do material (0,9 dia / 0,6 noite) **não mudou**: o mapa a multiplica. |
| Faixa gasta | Tinta com cobertura 80–100% por ruído em trechos de ~0,5 m e lascas (3% a 0,5). Média ≈ a de antes (o piso 0,32 de contraste do `pistas-v4` segue). |
| Borracha na curva | (a) **zebra**: escurecimento que sobe da crista para dentro + 6 riscas de pneu por repetição; (b) **asfalto**: a borda de FORA escurece até 12% (`curveRubber`, suave de \|curva\| 1 a 4) pela cor por vértice que o `Road.update` já gravava. |
| Kerb com bisel | Filete claro (+12%) no começo de cada bloco e sombra (−12%) no fim, ~5 px (6 cm). |
| Borda guia → terreno irregular | O ponto onde o terreno entra no acostamento anda de lado (±0,15 em u) e a transição é esfarelada por pixel. |

**Baixa:** não pinta nem usa os dois mapas (`Road.setQuality('low')` os tira; −1,5 milhão de texels e ~4 MB de GPU). O albedo novo vale em todas as qualidades. Mídia, Alta e Ultra: iguais entre si.
**Desempenho:** 0 △, 0 chamadas; +2 texturas = **4,2 MB** de GPU com mipmap (normais 2,8 + rugosidade 1,4; limite do plano 6 MB). A pista de terra e a de asfalto guardam cada uma o seu par (cache de 2 pares ≈ 7 MB de RAM). Custo de CPU de carga: o desenho do asfalto passou de ~0,8 s para ~1,5 s na primeira pista da sessão em Node (não medido no navegador; o `--bench` do dono é o juiz).

## 2. Arquivos

Código: `src/render/road-textures.ts` (desenho, `roughnessImage`, `normalImage`, `paintRoadDetail`, kerb, acostamento), `src/render/road.ts` (material, `setQuality`/`syncDetail`, `curveRubber`). Ferramenta nova (só leitura): `tools/detalhe-imagem.mjs` (o detalhe fino do diagnóstico §2 numa região de uma captura).
Testes **estendidos** (nenhum substituído): `tests/pistas-v4.test.ts` (+15 testes), `tests/estrada-v11.test.ts` (+5), `tests/estrada-gl.test.ts` (+3, detalhe medido na imagem).

## 3. Medidas antes (`main` e2703b4) → depois

| medida | antes | depois |
|---|---|---|
| detalhe fino GL, Foz (terra), região 300,500,170,90 | 0,0223 | **0,0373** (alvo ≥ 0,035) |
| idem Xingó (terra) 300,360,200,120 | 0,0524 | 0,0636 (teto 0,08) |
| idem Copacabana (asfalto) 230,400,260,100 | 0,0389 | 0,0385 |
| desvio da luma, blocos de 6 m / 1,5 m / 0,2 m (relativo) | 3,4–4,1% / 4,3–5,1% / 3,3–3,9% | 6,4–6,8% / 8,3–8,7% / 4,6% |
| desvio do matiz, blocos de 6 m (terra) | 0,7°–2,1° | 3,3°–4,4° |
| pixels de linha escura comprida (detector do teste) | 1,1–1,8% | ≈ 0,1% |
| junta: largura / fator mínimo | 2 px / 0,58 | ~15 px / ≥ 0,81 |
| degrau de luma na borda do remendo (média de 24 px) | ≈ 0,14 (contorno) | ≤ 0,12 (esmaecido) |
| gate `folga-gate` (Copacabana/Sampa, △ e chamadas) | — | idêntico (§6) |

## 4. Gate e testes (rodados neste turno)

Ver os números do gate na seção 6 (preenchida com a saída do `tools/folga-gate.mjs` de `main` × este branch). Limites de `src/bench/gate.ts` **não foram tocados**.
Rodei verdes: `npx tsc --noEmit -p .`; 25 arquivos / 341 testes (2 pulados): `cor-brilho`, `corrida-que-muda*`, `determinism`, `estrada-v11`, `folga-lod`, `galeria`, `gl-render` (gate e compilação de todos os programas), `hc2-*`, `paint*`, `pistas-v4`, `render-*`, **`sim-golden`**, `stylize`; GL (swiftshader, `NC_REQUIRE_GL=1`): `estrada-gl`, `corrida-que-muda-gl`, `cor-brilho-gl`, `folga-gl`, `noite-roxa-gl`, `hc2-gl`.

## 5. Testes: escritos antes, vistos falhar, e as travas alteradas

**Antes da implementação**, contra o código de `main`, os 15 testes novos de `pistas-v4`, os 5 de `estrada-v11` e o de GL da Foz falharam pelo motivo certo: borda do remendo 0,23 (≤ 0,12); junta com 4 linhas abaixo de 0,97 (≥ 6); desvio de 6 m 0,0146 (relativo 3,4%, exige 6%); matiz 0,9° (exige 3°); 1,1–1,8% de linhas escuras (exige ≤ 0,4%); tinta com variação 4,8% (exige 8%); filete da zebra 1,01 (exige 1,06); dentro × fora da zebra 0,999 (exige 0,9); meia-transição do acostamento com desvio 0,010 (exige 0,03); mapas "não existem" (largura 1); `normalMap` nulo na Média+; borracha na curva 1,000 (exige ≤ 0,93); detalhe da Foz 0,0223 (exige 0,035). Reconfirmei, trocando `road-textures.ts` pelo de `main`, que os 15 de `pistas-v4` voltam a falhar.
Dois critérios mudaram depois de olhar a imagem, com a falha original preservada: o detector de linhas passou a ignorar o tracejado e a suavizar 3×3 (a 1ª versão contava o tracejado e o grão); e o desvio das escalas passou a ser **relativo** à luma média (a absoluta penalizava a terra escura da mata).

**Travas existentes alteradas, com motivo (padrão V10 §3):**
1. `pistas-v4`, "remendos com borda selada": saiu a asserção "a borda é ≥ 8% mais escura que os dois" (media o contorno de piche, que é o defeito do diagnóstico); ficou "≥ 2 remendos, miolo ≥ 3% diferente". O contrário está nos testes novos "remendos sem contorno" e "não são retângulos". Nenhum valor foi afrouxado.
2. Nenhuma outra. `cor-brilho` 2b/2c, faixa ≥ 3:1, "terra com croma ≥ 60", `corrida-que-muda-estrada` (rugosidade 0,9/0,6), a faixa ≥ 0,32 de luma e o agregado > 8% **passaram sem mexer** (o desgaste da tinta e o brilho médio dos seixos foram calibrados para isso: a 1ª versão da tinta, média 0,84, derrubou o 0,32 de `desert:dusk`).

## 6. Gate (`node tools/folga-gate.mjs`, pior viewport)

Saída de `tools/folga-gate.mjs` (Copacabana e Sampa, △ e chamadas, 4 qualidades × 1/2/4 jogadores) de `main` e2703b4 e deste branch: **JSON idêntico** (`diff` sem diferença). Exemplos: copa-1p Baixa 116.474 △ / 34 ch; Média 237.116 / 78; Alta 257.034 / 83; Ultra 257.720 / 84; copa-4p Baixa 104.826 / 38; sampa-4p Média 173.456 / 78. **0 △ e 0 chamadas novas**; Baixa segue a mais barata; limites de `src/bench/gate.ts` intactos. O mesmo vale em `gl-render`, `folga-gl`, `corrida-que-muda-gl` (verdes; 42 testes GL em `estrada-gl`, `gl-render`, `corrida-que-muda-gl`, `cor-brilho-gl`, `folga-gl` na última rodada).

## 7. Imagens (mesma câmera, Alta, 1280×720, harness; `docs/diag-v22/f2-estrada/`, JPEG ≤ 600 KB)

`antes-`/`depois-` de `foz` (c01), `xingo` (c07), `copa` (c02), `serra` (curva), `paraty` (entardecer), `sampa` (noite); `recorte-antes-foz`/`recorte-depois-foz` (2×) e `kerb-antes`/`kerb-depois` (3×).
Comandos: `PORT=<porta> node tools/capture.mjs "foz::track=foz_do_iguacu&seg=215&hud=0&q=high&cam=high&frames=14"` (idem `xingo&seg=110`, `copacabana&seg=300`, `serra_do_navio&seg=1100`, `paraty&seg=90`, `sampa_noite&seg=970`); `node tools/detalhe-imagem.mjs captura.png 300,500,170,90`.

**Três rodadas de crítica olhando a captura:** (1) 1º desenho: sem hexágonos nem retângulos, mas os seixos escuros com sombra liam como crateras e o detalhe da Foz ficou em 0,0224 → seixos claros, aro fraco, grão fino da terra; (2) detalhe 0,0307 → mais grão e mais cascalho (0,0369); pontos azuis no agregado da faixa (reflexo do céu na tinta lisa) → tinta áspera; (3) a média dos seixos subia a luma da terra e derrubava a faixa em `desert:dusk` → seixos de média ≈ 0 e −2% de compensação; o detalhe voltou a cair a 0,0337 → grão a 0,34/0,26 → 0,0373 (e 0,0636 no Xingó).

**Pronto visual do plano, honestamente:** `c01` e `c07` **sem hexágonos nem retângulos: atendido** (`depois-foz`, `depois-xingo`); **linha preta transversal inexistente: atendido** (junta suave de ~15 px; no asfalto de Copacabana ela some na captura); **trilha com brilho ao sol: atendido na Média+** (`depois-paraty`: faixas claras nas trilhas no entardecer). **Não chegou lá:** (a) a zebra e a borda do acostamento ficaram mais ricas só de perto (`kerb-depois`); a 20 m não se vê a diferença; (b) a borracha do asfalto na curva é um escurecer gradual de 12% da borda de fora (sem geometria nova, não há faixa localizada de marca de pneu); (c) o tracejado branco ainda mostra pontinhos azulados que já existiam em `antes-serra` (não é do F2).

## 8. Ressalvas

1. **Gosto é do dono**: a direção das imagens é boa, mas "mais bonito que o Horizon Chase" só se decide jogando. A terra ficou mais "terra de verdade" do que cartum; se parecer muito rugosa, o botão é `earth * 0.34/0.26` (grão) e a densidade `[0.15, 0.42, …]` de `pebbles()`.
2. **O que a Baixa ganha e não ganha**: albedo novo sim; relevo e brilho não. O programa do asfalto muda ao trocar de degrau (`normalMap` presente/ausente), junto com os demais materiais que já recompilam em `ensureQuality`; durante a corrida nada compila (o `corrida-que-muda-gl` passou).
3. **Primeira pista da sessão**: o desenho da estrada custa ~2× mais para montar (hitch de carga, não de corrida); só se mede com o `--bench`.
4. O mapa de normais usa derivadas da tela (a malha não tem tangentes); mipmap achata o relevo na distância, sem cintilação vista nas capturas (sem vídeo).
5. A `curveRubber` escurece a metade de fora do asfalto linearmente até 12% (2 vértices por ponto): sem geometria nova, mas não é "mancha de borracha".
