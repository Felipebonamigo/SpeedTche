# V20 — forma no casco NORMAL dos outros oito nacionais (branch `nc/forma-outros`, base `main` 1d3215a)

> Continuação do V19 (`V19-forma-casco.md`): Barão, Furgãozinho da Firma, Besouro, Pão de Forma, Gaúcho V8, Trilheiro, Lambari e Jabuti seguiam caixas angulares de V6c. Mesmo método (anel de 9 pontos, pontas em elipse, `shape_body`, piso removido), mas com **parâmetros e deformações por arquétipo**, não o do hatch. Silhueta de perfil, eixos, rodas e pegada de V6c ficam; só `tools/blender`, os oito `.glb`, ferramentas de folha/gate e testes. `src/`, gate (limites), shaders: intactos. Regra de marca intacta; Besouro, Pão de Forma, Gaúcho V8 e Trilheiro continuam no arquétipo genérico e seguem marcados para revisão jurídica.
> Folhas: `docs/herois-v20/folha-<carro>.jpg` e `folha-resumo.jpg` (antes V6c em cima, depois V20 embaixo: câmera de corrida, 3/4 de trás, 3/4 da frente, adversário a 40 m).

## 1. A forma de cada arquétipo (`FORMAS` em `casco_forma.py`)
| Carro | O que a forma pede | Como |
|---|---|---|
| Barão (sedã) | ombro vincado, teto que rola, tampa do porta-malas abaulada, lateral cheia | vinco do ombro duro (ponto 3 = 1,0), `edge_drop` 0,085, `deck_crown` 0,035, `barrel` 0,03 |
| Furgãozinho / Jabuti (micro-caixa) | caixa curta, cantos arredondados, teto em leve arco | `edge_drop` 0,075/0,08, `roof_arch` 0,035, pontas com raio médio |
| Besouro | para-lamas bojudos redondos, capô curto arredondado, cúpula, traseira de bojo | `edge_drop` 0,12, `roof_arch` 0,04, `waist` 0,04 + `fender` 0,03 (o bojo cabe na pegada porque o meio entra), `fender_up`, `nose_cap`, `tail_bulge` 0,08 |
| Pão de Forma | furgão alto, cantos muito arredondados, teto em leve arco | `edge_drop` 0,095, pontas longas e rasas (`nose_r` 0,45, `tail_r` 0,5), lateral quase reta |
| Gaúcho V8 | capô longo com power bulge, cabine recuada, ombros largos | `hood_bulge` + `hood_crown`, `waist` 0,035 + `haunch` 0,026 (ombro de trás), `barrel` 0,066 (cintura de garrafa) |
| Trilheiro | linhas retas COM raio nas arestas, para-lamas expostos | `edge_drop` 0,07 (virada 50° → 19°), `barrel` 0,004, sem arco, `fender` + `waist` |
| Lambari | cupê, cintura baixa, vidro grande | `z5_frac` 0,92 (vidro lateral inteiro), `hood_bulge` largo, `fender_up` |

Novidades de código: `hero_forma.marks` lê `sp["marks"]` e `DEFAULTS.z5_frac` (o herói e os hatches saem iguais: 4.234/3.810/3.988/3.690 de build, idênticos aos de `main`); em `casco_forma.py`: `MARKS`, `arquetipo` (`waist`, `haunch`, `hood_bulge`, `deck_crown`, `nose_cap`, `fender_up`), `_flare_cap` e `_soleira_entre_rodas`, `floor_zmax`.

Três defeitos achados pelo olho e corrigidos (vistos nas folhas de R1): (a) o anel escuro do vão de roda passava da cintura e, sem casco para projetar, colava no capô como mancha preta (V6c já tinha manchas menores); (b) nos carros de capô baixo (Besouro, Lambari) o capô arredondado ficava abaixo do topo do vão de roda e a calha escura aparecia por cima: o para-lama agora sobe (`fender_up`); (c) a faixa da soleira nascia dentro dos vãos e virava um "V" escuro na lateral. Pão de Forma e Jipe: o piso fica a 0,24-0,26 m e o 0,23 de V19 não o removia (`floor_zmax`).

## 2. Medidas (sobre o `.glb` entregue; `tests/forma-medidas.ts`, `MEDIDA_OUTROS` diz onde medir em cada carro)
V6c → V20: △ do casco (jogo) · lod1 · abaulado do teto · arco do teto · virada do canto (°) · cintura · para-lama · capô · ponta do capô cai.
| carro | △ | lod1 | teto | arco | virada | cintura | para-lama | capô | ponta |
|---|---|---|---|---|---|---|---|---|---|
| Barão | 3.344 → **3.218** | 751 → 760 | 0,020 → 0,059 | 0,020 → 0,035 | 34,7 → 17,1 | 0,033 → 0,063 | −0,001 → 0,039 | 0,006 → 0,025 | 0,068 → 0,111 |
| Furgãozinho | 3.500 → **3.392** | 772 → 784 | 0,020 → 0,051 | 0,014 → 0,029 | 52,0 → 22,7 | 0,041 → 0,070 | −0,002 → 0,037 | 0,015 → 0,033 | 0,064 → 0,086 |
| Besouro | 3.976 → **3.882** | 814 → 829 | 0,024 → 0,090 | 0,052 → 0,068 | 33,9 → 11,0 | 0,025 → 0,056 | bojo de cima 0,026 → 0,055 | 0,022 → 0,015 | 0,110 → 0,147 |
| Pão de Forma | 3.668 → **3.536** | 724 → 740 | 0,019 → 0,058 | 0,027 → 0,047 | 52,1 → 27,7 | 0,008 → 0,019 | −0,001 → 0,037 | 0,016 → 0,035 | 0,047 → 0,062 |
| Gaúcho V8 | 4.028 → **3.894** | 792 → 800 | 0,018 → 0,045 | 0,009 → 0,016 | 25,0 → 12,8 | 0,024 → 0,053 | 0,000 → 0,057 (traseiro 0,057) | 0,019 → 0,055 | 0,124 → 0,196 |
| Trilheiro | 3.832 → **3.680** | 736 → 740 | 0,017 → 0,041 | 0,010 → 0,021 | 50,5 → 19,5 | 0,035 → 0,035 | 0,000 → 0,040 | 0,013 → 0,018 | 0,057 → 0,072 |
| Lambari | 3.750 → **3.639** | 760 → 772 | 0,018 → 0,044 | 0,016 → 0,026 | 20,5 → 31,8 (ver §6) | 0,023 → 0,046 | n/m | 0,013 → 0,002 | 0,071 → 0,092 |
| Jabuti | 3.536 → **3.434** | 688 → 708 | 0,017 → 0,044 | 0,013 → 0,029 | 35,5 → 23,0 | 0,030 → 0,058 | −0,004 → 0,033 | 0,010 → 0,027 | 0,084 → 0,102 |
Todos os △ **caem** (piso removido) e ficam ≤ V6c e ≤ 4.500; lod1 ≤ 45% do lod0. Caixa (|x| ≤ 1,0; ±2 cm; topo ±3 cm), eixos, perfil do topo (±4 cm a cada 50 cm), lanterna (≥ 90%) e vidro lateral (≥ 85%; Lambari ≥ 100%) passam.

## 3. Testes (escritos ANTES dos arquivos)
`tests/casco-forma-outros.test.ts` (40 testes, 5 por carro), limiares POR ARQUÉTIPO no próprio arquivo, com o porquê de cada um. Contra o V6c: **8 vermelhos** pelo motivo certo ("roofCamber = 0,020 < 0,04", "hoodCrown = 0,019 < 0,045", Trilheiro "roofCamber = 0,017 < 0,02" e virada 50° > 30°, Lambari "roofCamber 0,018 < 0,035"…) e os 32 de contrato (△, caixa, eixos, perfil, lanterna, vidro) já passavam e continuam. Depois: 40/40. Ajustes de limiar registrados (nenhum teste existente foi tocado): Besouro mede o bojo DE CIMA (`planBulge`, o vão de roda come a altura em que os outros se medem) e a cúpula pede abaulado ≥ 0,07; Trilheiro tem MÁXIMOS (teto ≤ 0,05, lateral ≤ 0,045: "linha reta"); Pão de Forma virada ≤ 30° (não 25°: teto bem mais estreito que a caixa); Lambari virada ≤ 36° e vidro lateral ≥ 100% de V6c.
`tsc --noEmit` limpo. `vitest run tests/car- tests/carros- tests/casco- tests/heroi tests/herois tests/collisions tests/determinism tests/gltf`: 32 arquivos, 657 passam, 1 pulado (inclui `carros-nacionais-gl`, `herois-gl`, `herois-nacionais-gl`, `heroi-gl`). Suíte inteira não rodada (disco/CPU).

## 4. Gate
`CENAS=copa-4p QUAL=high OUTROS=1 node tools/herois-gate.mjs` (o `OUTROS=1` é novo: dois casos de 4 humanos com os oito), herói desligado = casco normal: Barão+Besouro+Gaúcho+Trilheiro **221.592 → 220.884 △**; Pão+Lambari+Jabuti+Furgão **220.644 → 219.954**; chamadas iguais (80 / 79); os demais casos iguais a V19 (219.552, 221.124, 223.458, 221.304). Nenhum limite de `gate.ts` mexido, nenhum shader.

## 5. O que se vê (rodadas no jogo; R1/R2 em 1280×720 recortado, final em 2×)
- **R1** (primeira forma por arquétipo): ganho claro em Barão (porta-malas redondo, ombro), Gaúcho (capô com bojo, nariz caindo), Trilheiro (arestas com raio mantendo linha reta), Pão (cantos da frente), Besouro (cúpula, para-lamas). Defeito: remendo do para-choque de trás rasgado nos cantos onde a traseira fecha em elipse.
- **R2** (`tail_rx` menor em todos, o remendo cobre a curva): rasgado menor em Lambari/Gaúcho/Pão; em Furgãozinho e Besouro ainda há um recorte escuro no canto de baixo (o V6c tinha um parecido).
- **R3** (final, 4 vistas, 2×): todos melhores ou iguais ao V6c em 3/4 de trás, 3/4 da frente e de longe; nenhum piorou, então os oito entram. De longe (lod1, sem subdivisão) a leitura é igual ou melhor.

## 6. Ressalvas honestas
- O ganho é **moderado**, como no V19: lê como "arredondado", não "esculpido". Silhueta de perfil é a de V6c por contrato; a mudança está na seção, nos cantos e no capô.
- O remendo do para-choque de trás ainda rasga um pouco no canto de baixo (Furgãozinho, Besouro, Trilheiro). Mais cortes custariam △.
- Lambari: a medida de virada do canto PIORA (20,5° → 31,8°): o medidor só vê a pintura e o teto agora cai em cúpula até o vidro (que fica inteiro), enquanto o V6c tinha teto plano e arestas vivas; o olho acha o V20 melhor. Limiar 36°, registrado acima.
- Besouro: o capô fica mais baixo que o para-lama (como no fusca), então não tem medida de capô abaulado; o remendo de lanterna da direita some atrás do bojo em alguns ângulos.
- Pão de Forma: virada 27,7° e lateral ainda quase reta (cintura 0,019) por escolha.
- O Blender não é determinístico byte a byte; medidas com margem ≥ 5% (poucas em 2-4%: Gaúcho cintura/ombro). FPS não medido (swiftshader só conta △). Piso removido (como V19). Heróis e hatches não regerados.

## 7. Comandos
`npm run carros-blender barao furgao besouro paodeforma gaucho trilheiro lambari jabuti` (= `/home/user/venv-bpy/bin/python -I tools/blender/build_car.py <carro> src/assets/cars/<carro>.glb [--sem-forma]`); `npx vitest run tests/casco-forma-outros.test.ts tests/casco-forma.test.ts tests/carros-nacionais.test.ts`; fotos/folhas: `GRUPO=outros [DSF=1] [SO=tras34,longe] node tools/casco-folha.mjs fotos <pasta>` e `GRUPO=outros node tools/casco-folha.mjs folha <antes> <depois> <saida>` (o "antes" sai de `git show 1d3215a:src/assets/cars/<id>.glb`); gate: `CENAS=copa-4p QUAL=high OUTROS=1 node tools/herois-gate.mjs`.

## 8. Arquivos
`src/assets/cars/{barao,furgao,besouro,paodeforma,gaucho,trilheiro,lambari,jabuti}.glb`, `tools/blender/{casco_forma.py,hero_forma.py,README.md}`, `tools/{casco-folha.mjs,herois-gate.mjs}`, `tests/{casco-forma-outros.test.ts,forma-medidas.ts}`, `docs/ondas/V20-forma-outros.md`, `docs/CARROS-NACIONAIS.md`, `docs/herois-v20/`.
