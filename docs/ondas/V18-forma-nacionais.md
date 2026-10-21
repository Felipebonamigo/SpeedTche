# V18 — forma do casco herói dos nacionais livres: Cuiabano e Tupiniquim (branch `nc/forma-nacionais`, base `main` 1bca834)

> Pedido do dono (repetido): "os carros parecem mal feitos" frente ao Horizon Chase 2. O V17 deu relevo às peças, mas o CORPO seguia uma caixa lisa e angular (painéis planos, teto reto, para-lama só como arco colado, vidro preto chapado). Aqui o ganho é de FORMA e de leitura a 10 m. Silhueta, proporção, eixos, escapes e pegada de V6c ficam (é o arquétipo); regra de marca intacta. **Só** `tools/blender`, os dois `.glb` herói, `src/render/cars/wheels.ts` (um desenho) e testes. `src/core`, `hashRace`, `sim-golden`, gate: intactos, nenhum limite mexido.
> Folhas (`docs/herois-v18/folha-<carro>.jpg`, câmera de corrida, 3/4 de trás, 3/4 da frente e garagem, **atual (V6c) × herói**; `folha-resumo.jpg` = V18, `folha-resumo-v17.jpg` = o ponto de partida). Os PNG originais ficam em `scratch/v18/` (fora do git). As três rodadas de crítica: `scratch/v18/r1`, `r2`, `r3`.

## 1. O que mudou
| Peça | O quê |
|---|---|
| `tools/blender/hero_forma.py` (novo) | o ANEL de 9 pontos do herói: cintura abaulada (+2 cm) e soleira recolhida (−3 cm); vidro lateral com caimento e barriga (+2,8 cm); canto do teto que rola (a faixa 6 do anel desce 7 cm e o vinco do canto é 0,15, não 1,0); teto com 5,7 a 6,9 cm de abaulado transversal. Pontas do carro fechadas em ELIPSE em planta (raio de uns 30 cm, não a quina de 4 cm) com duas estações a mais na traseira. Deformação suave sobre a pele subdividida: para-lamas bojudos (+4 cm, a lataria sai da roda), capô abaulado com a ponta caindo (−4 cm), frente e traseira abaulados em planta (3 cm), arco longitudinal do teto (3 cm). Piso removido (nunca visto) |
| `carlib.py` | duas chaves OPCIONAIS no spec (`ring_points`, `station_crease`): sem elas nada muda nos carros de V6c (o `.glb` de sempre não foi regerado) |
| `hero_nac.py` | `pane`/`window`/`round_poly`: o vidro virou PAINEL de contorno redondo, com a borda de cima acompanhando o canto do teto e o friso preto chanfrado em volta (antes era faixa de casco: bloco preto de cantos vivos). `streak`: o reflexo do céu é uma faixa inclinada de cantos redondos DENTRO do painel (antes, duas listras retas de ponta cega, "cruas"). `flares`: o arco do alargamento é cortado abaixo da cintura |
| `hero_nacionais/{cuiabano,tupiniquim}.py` | painéis e reflexos de cada carro; lanterna do Cuiabano mais larga (0,18 m), contas de lados das lentes menores (a folga de △ pagou a forma); no Tupiniquim o "L" ganhou painel preto bem maior (1,16×, era 1,05×) e barra/perna mais grossas |
| `src/render/cars/wheels.ts` | só o desenho `multi` (a roda de fábrica dos hatches): raios (5,5 cm, eram 4,5), lábio e cubo em liga CLARA na camada B do aro, não em grafite. Mesmos △. Ver §4 |
| `tests/` | `forma-medidas.ts` + `herois-forma.test.ts` (14), `roda-de-fabrica.test.ts` (2) |

## 2. Medidas de forma (`tests/forma-medidas.ts`, sobre o `.glb` entregue; pintura apenas)
| medida | Cuiabano V17 → V18 | Tupiniquim V17 → V18 | limiar do teste (de projeto) |
|---|---|---|---|
| abaulado do teto (m) | 0,021 → 0,057 | 0,023 → 0,069 | ≥ 0,04 |
| virada do canto do teto (° por 3 cm) | 40,0 → 14,6 | 33,5 → 14,8 | ≤ 25 |
| arco longitudinal do teto (m) | 0,002 → 0,023 | 0,031 → 0,050 | ≥ 0,02 |
| cintura abaulada (m) | 0,021 → 0,050 | 0,026 → 0,055 | ≥ 0,04 |
| para-lama bojudo (m) | −0,001 → 0,039 | −0,001 → 0,042 | ≥ 0,03 |
| capô abaulado (m) | 0,009 → 0,027 | 0,015 → 0,034 | ≥ 0,02 |
| ponta do capô cai (m) | 0,088 → 0,129 | 0,128 → 0,156 | ≥ 0,08 |
| lente de lanterna acesa vista de trás (cm²) | 351 → ~421 | 849 → ~1.070 | ≥ 400 / ≥ 960 |
| △ do herói (jogo) | 16.050 → 15.958 | 16.416 → 16.200 | ≤ V17 (16.050 / 16.416) |

Os limiares NÃO foram tirados do arquivo novo; foram escritos antes, e o V17 foi visto REPROVAR (11 de 14 testes vermelhos, pelos motivos certos: "teto 0,021 < 0,04", "para-lama −0,001 < 0,03", "351 cm² < 400"…). Um verificador de diedro entre triângulos vizinhos (a ideia inicial) foi descartado: na malha fundida a pintura mistura a lataria com paredes de peças pintadas (retrovisor, faixa), e o p99 dava 90° nos dois carros, com o V17 igual ao novo: não discrimina. Troquei pela virada do PERFIL da seção do teto, que mede o raio do canto direto.

## 3. Triângulos e gate
**O herói de cada carro ficou ≤ ao do V17** (15.958 e 16.200, contra 16.050 e 16.416): a folga de ~5% do pior caso (copa-4p Alta/Ultra, 4 humanos de nacionais) NÃO foi consumida. De onde vieram os △: duas estações a mais na traseira e o vidro em painel custaram ~+1,6 mil; pagaram o piso removido (−0,6 mil), lentes com menos lados (−0,9 mil: N 28/20/14 → 20/14/10 no farol, 20/16/12 → 14/12/10 na lanterna), frisos de porta/capô/tampa com passo maior (−0,3 mil), arcos do alargamento mais ralos (−0,3 mil) e os reflexos (−0,2 mil). Sem programa de shader novo (nada em `src/render` além do desenho da roda).
Gate (640×360, pior viewport, 300 ticks; `tools/herois-gate.mjs`, e `tests/herois-nacionais-gl.test.ts` + `herois-gl` + `heroi-gl`: 56 testes verdes, dentro dos limites; nenhum limite subiu), △ herói ligado, V18 × V17:
| cena | V17 | V18 | limite △ |
|---|---|---|---|
| copa-4p Alta, 2 Cuiabano + 2 Tupiniquim (PIOR CASO) | 321.020 | 319.782 | 340.000 |
| copa-4p Ultra, idem | 321.699 | 320.479 | 340.000 |
| copa-4p Alta, Cuiabano + Tupiniquim + 2 estilos | 317.391 (Ultra) | 316.088 | 340.000 |
| copa-1p Ultra, Tupiniquim | 279.918 | 279.484 | 340.000 |
Chamadas de desenho: iguais às de V17 (75/78 no pior caso, limites 81/85). A folga do pior caso subiu de ~5,6% para ~6,0%.

## 4. Rodas
O herói só dá posição e tamanho; o jogo desenha a roda do catálogo (`wheels.ts`). A de fábrica dos hatches é `multi` (dez raios finos de GRAFITE sobre fundo escuro), que na folha de V17 lia como um disco azul-marinho chapado. Trocar a roda de fábrica do estilo (para `hubcap`/aço com calota) é mudança de CATÁLOGO (`WHEEL_LISTS.hatch`, `hatch.ts`, impressão de conteúdo do online, looks salvos sem campo de roda que mudariam de roda sozinhos): **não feito, proposta abaixo**. O que coube em dado/estilo pequeno: o desenho `multi` passou a usar liga clara na camada B do aro (prata de fábrica, na cor escolhida quando o aro está ligado; o `grafite` do seletor devolve o visual antigo) e raios 22% mais largos. Mesmos △ (`realismo-roda`, `car-gltf-roda-lod` verdes); visto no jogo nas folhas: a roda agora tem contraste com o pneu e lê como liga. Efeito colateral aceito: `multi` é opção em outros estilos (gt, sedan, electric, rally, hyper, wedge, prototype, micro, roadster, pickup), que também ganham o visual claro.

## 5. Ressalvas honestas
- **FPS não medido** (swiftshader só conta △ e chamadas): quem diz é o `--bench` do dono.
- O "L" do Tupiniquim ainda lê modesto na câmera de corrida (lanterna vermelha sobre carro vermelho): melhorou (painel preto maior, +26% de área acesa), não igualou o L chapado e laranja de V6c em leitura pura. Com outra cor de pintura lê melhor (o Cuiabano amarelo lê bem).
- O casco NORMAL de V6c (`cuiabano.glb`, 4.348 △, subdivisão 1, teto de 4.500) NÃO recebeu a forma: não foi tentado (a forma de V18 foi afinada em nível 2 de subdivisão e com estações a mais, que não cabem no teto de 4.500 △ do casco normal sem refazer o ajuste). O ganho vale só onde o herói aparece (humano de perto), como em V17. Uma versão barata (só anel e deformação, sem estação a mais) é a próxima tentativa.
- O reflexo do vidro segue sendo faixa de malha (metal 1) e o céu do shader; fica menos cru (cantos redondos, uma por vidro, dentro do painel), não "sem faixa".
- O vidro é PAINEL levantado 1,1 cm sobre a pele com friso preto chanfrado, não um vidro realmente afundado: a faixa de afundar (feita e descartada) gerava cavernas pretas nos cantos. De longe o friso preto + vidro preto fundem-se (o contraste é o do painel contra a pintura).
- A pele do casco no Blender mostra facetas de sombreamento em primeiro plano extremo (pós-booleana do vão de roda); no jogo, nas folhas, não aparecem.
- Piso removido: quem inclinar o carro a ponto de ver por baixo veria o vazio (o jogo não faz isso). Se um dia fizer, recolocar o piso custa ~600 △.
- Caipora e Pampeiro (hatches) pedem o mesmo trabalho e cabe no mesmo módulo (um `FORMA` e painéis por carro).
- O Blender não é determinístico byte a byte (ruído de ponto flutuante nos `.glb`).

## 6. Proposta (não feita): roda de fábrica de popular
Trocar `hatch` de `multi` para `hubcap` (aço com calota de liga: calota prateada com oito entradas escuras) em `src/render/cars/styles/hatch.ts` e `WHEEL_LISTS.hatch` (`['hubcap','multi','sport5','dish','aero','mag']`). Custos: a impressão de conteúdo do online muda (versão incompatível entre builds, como qualquer troca de catálogo), `tests/cosmetics.test.ts` confere a 1ª da lista contra o modelo (seguiria verde, ajustando os dois), looks salvos de hatch com roda de fábrica passam a mostrar a nova sem o jogador ter escolhido, e atinge todos os hatches. Só vale depois de o dono ver `multi` clara e decidir se ainda quer a calota.

## 7. Comandos
`npm run carros-herois-nacionais` regera os dois `.glb`; `node tools/herois-folha.mjs scratch/v18/rX cuiabano tupiniquim` as folhas; `npx vitest run tests/herois-forma.test.ts tests/roda-de-fabrica.test.ts tests/herois-nacionais-asset.test.ts`.

## 8. Arquivos
`src/assets/cars/hero/{cuiabano,tupiniquim}.glb`, `src/render/cars/wheels.ts`, `tools/blender/{hero_forma.py,hero_nac.py,carlib.py,build_hero_nacional.py,hero_nacionais/*.py,README.md}`, `tests/{forma-medidas.ts,herois-forma.test.ts,roda-de-fabrica.test.ts}`, `docs/ondas/V18-forma-nacionais.md`, `docs/herois-v18/`.
