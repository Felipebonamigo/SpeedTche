# V19 — forma no casco NORMAL dos hatches nacionais: Cuiabano, Tupiniquim, Caipora e Pampeiro (branch `nc/forma-casco`, base `main` 0390778)

> Pedido do dono: "os carros parecem mal feitos". O V18 deu corpo curvo ao casco HERÓI (só visto de perto, só em Alta/Ultra). O que a maioria vê é o casco NORMAL de V6c (teto `maxShellTriangles` 4.500), uma caixa lisa e angular: adversários, Média/Baixa, distância, câmera de corrida quando o herói não está ativo. Aqui a forma de V18 entra nesse casco, na "versão barata" que a V18 deixou como próxima tentativa. Silhueta, proporção, eixos, rodas e pegada de V6c ficam. Caipora e Pampeiro: só o casco normal (sem herói). Regra de marca intacta. **Só** `tools/blender`, os quatro `.glb`, o harness de ferramentas e testes; `src/`, `src/core`, gate, shaders: intactos.
> Folhas: `docs/herois-v19/folha-<carro>.jpg` (antes V6c em cima, depois V19 embaixo: câmera de corrida, 3/4 de trás, 3/4 da frente, adversário a 40 m = LOD far) e `folha-resumo.jpg`. PNG originais e as rodadas de crítica em `scratch/v19/` (fora do git).

## 1. O que mudou
| Peça | O quê |
|---|---|
| `tools/blender/casco_forma.py` (novo) | `FORMAS`: os parâmetros de forma de cada carro sobre os de fábrica do herói (`hero_forma.DEFAULTS`); `spec_com_forma` (o anel de 9 pontos e as pontas em elipse do herói, **sem estação a mais**; o vidro segue sendo a faixa do casco, não painel), `deformar` (`shape_body` + `drop_floor`) |
| `tools/blender/build_car.py` | usa `casco_forma` nos quatro hatches (lod0 com subdivisão 1 + deformação + piso removido; lod1 só com o anel e as pontas, sem subdivisão, sem estação a mais). `--sem-forma` gera o V6c de sempre; `--estilo realista` também não leva a forma |
| `tools/blender/hero_forma.py` | duas chaves OPCIONAIS em `DEFAULTS` (`nose_anchor`, `arch_anchor`, 0 = comportamento de V18; o herói não muda e não foi regerado): a frente que avança no centro (+3,4 cm) e o topo que sobe o arco do teto (+3 cm) alargavam a caixa de V6c, então no casco normal o centro da frente fica onde estava (os cantos recuam) e o arco "paga" metade descendo nas pontas |
| `tests/casco-forma.test.ts` (novo, 32) | ver §3 |
| `tests/forma-medidas.ts` | `formaDe(model, roofZ?)`: onde medir o arco do teto (o do Caipora acaba antes de 1,5 m); padrão igual ao de antes |
| `tools/casco-folha.mjs`, `tools/render-harness.html` | fotos e folhas antes × depois; o harness ganhou `ahead=<m>&aicar=<id>` (um adversário a tantos metros à frente, para ver o LOD far) |
| `src/assets/cars/{cuiabano,tupiniquim,caipora,pampeiro}.glb` | regerados |

Parâmetros (de fábrica do herói, salvo): `extra_stations` vazio, `barrel` 0,026, `nose_r` 0,26 / `nose_rx` 0,15 (a ponta fechada), `tail_r` 0,30 / `tail_rx` 0,22, `tail_bulge` 0,040, `nose_drop` 0,050, `nose_anchor` 1, `arch_anchor` 0,5. Caipora: vinco do canto do teto 0 (o canto redondo dele já pedia, e a virada ficava em 26,8° contra o limiar de 25°). Pampeiro: `fender` 0,034 (com 0,042 a lataria saía da pegada: |x| 1,001 m; o limite do jogo é 1,0).

## 2. Medidas (sobre o `.glb` entregue, pintura apenas; `tests/forma-medidas.ts`)
| medida | limiar | Cuiabano V6c → V19 | Tupiniquim | Caipora | Pampeiro |
|---|---|---|---|---|---|
| abaulado do teto (m) | ≥ 0,04 | 0,021 → 0,060 | 0,023 → 0,074 | 0,023 → 0,086 | 0,021 → 0,057 |
| virada do canto (° por 3 cm) | ≤ 25 | 39,8 → 24,7 | 36,7 → 23,6 | 31,5 → 19,4 | 38,9 → 15,3 |
| arco longitudinal do teto (m) | ≥ 0,02 | 0,005 → 0,023 | 0,034 → 0,053 | 0,032 → 0,048 | 0,035 → 0,054 |
| cintura abaulada (m) | ≥ 0,04 | 0,029 → 0,065 | 0,033 → 0,068 | 0,037 → 0,074 | 0,027 → 0,061 |
| para-lama bojudo (m) | ≥ 0,025 | −0,002 → 0,038 | −0,002 → 0,040 | −0,001 → 0,040 | 0,000 → 0,033 |
| capô abaulado (m) | ≥ 0,02 | 0,008 → 0,027 | 0,015 → 0,035 | 0,010 → 0,030 | 0,004 → 0,022 |
| ponta do capô cai (m) | ≥ 0,08 | 0,088 → 0,139 | 0,130 → 0,172 | 0,124 → 0,173 | 0,112 → 0,157 |
| lente de lanterna acesa de trás (cm²) | ≥ 90% do V6c | 179 → 180 | 738 → 738 | 329 → 329 | 174 → 174 |
| **△ do casco (jogo)** | ≤ V6c e ≤ 4.500 | **4.348 → 4.234** | **3.912 → 3.810** | **4.118 → 3.980** | **3.826 → 3.690** |
| △ do lod1 | ≤ 45% do lod0 | 752 → 764 | 716 → 720 | 784 → 788 | 700 → 708 |
| caixa (|x| máx., topo, nariz, traseira) | ±2 cm / ±3 cm, |x| ≤ 1,0 | 0,990 / 1,610 (V6c 1,596) / −2,179 / 2,200 | 0,990 / 1,647 / −2,149 / 2,210 | 0,997 / 1,627 / −2,159 / 2,220 | 0,995 / 1,585 / −2,179 / 2,200 |
Os △ **caíram** em todos (piso removido −~230, a forma não precisou de estação a mais). Os limiares são os do herói (V18), menos o do para-lama (0,025, não 0,03: a pele de nível 1 dá ~3,5 cm onde a de nível 2 dá 4 cm) — decisão registrada aqui, antes de ver o arquivo novo. Nenhum teste existente foi afrouxado.

## 3. Testes
`tests/casco-forma.test.ts` foi escrito ANTES dos arquivos e visto falhar pelos motivos certos: 17 de 32 vermelhos ("abaulado 0,021 < 0,04", "para-lama −0,002 < 0,025", "cintura 0,029 < 0,04", "capô 0,008 < 0,02", virada 39,8° > 25°, e o arco do Cuiabano 0,005 < 0,02); os guardas de orçamento, silhueta, eixos e lanterna passavam no V6c (são contrato que NÃO pode mudar) e continuam passando. O Caipora media NaN no arco do teto (o teto acaba antes de 1,5 m): corrigido no MEDIDOR (`roofZ`), não no limiar. Depois da forma, a suíte inteira (`npx vitest run`, 269 arquivos, incluindo `heroi-gl`, `herois-gl`, `herois-nacionais-gl`, `carros-nacionais-gl`, `car-*`, `carros-*`, `herois-forma`, `collisions`, `determinism`, `cosmetics`): 4.772 passam, 1 falha — `tests/lente-m2.test.ts` "34 capturas…" estoura o timeout de 5 s; **falha igual no `main` 0390778** (ambiente lento, não tem relação com carros). `tsc --noEmit` limpo.

## 4. Gate
`node tools/herois-gate.mjs` (`CENAS=copa-4p QUAL=high`), 640×360, △ do pior viewport, com o herói desligado (o casco normal): copa-4p Alta, 2 Cuiabano + 2 Tupiniquim **224.186 → 223.458** (−728); as cenas sem nacionais ficam iguais (219.552 e 221.124). Com herói ligado (pior caso): 319.782, igual ao de V18 (limite 340.000). Chamadas iguais. Nenhum limite do gate mexido, nenhum shader novo.

## 5. O que se vê (folhas, três rodadas)
- **R1** (anel + deformação com os valores do herói): teto e canto do teto rolando, lataria da porta abaulada, para-lama que sai da roda, capô que cai na ponta. Antes, o 3/4 de trás era uma caixa de arestas vivas.
- **R2** (cintura 0,026, traseira mais arredondada, queda do capô maior): a traseira ficou redonda demais; o para-choque de trás (remendo plano de 1,50 m) ficou com um degrau no canto.
- **R3** (pontas moderadas): traseira com raio, mas sem o degrau; frente arredondada; o farol da frente voltou a ler. Escolhido.
- Visto na câmera de corrida: o teto deixa de ser um retângulo e o vidro de trás ganha cantos redondos; o ombro bojudo lê de longe. De longe (adversário a 40 m, lod1, sem subdivisão): lê igual ou melhor que V6c; o lod1 não ganhou estação.

## 6. Ressalvas honestas
- **O ganho é real, mas moderado** perto do herói (V18): o casco normal tem subdivisão 1; o canto do teto ainda vira ~24° (limiar 25°) no Cuiabano/Tupiniquim, a traseira segue um painel quase plano com o friso da tampa, e a lataria lê "arredondada", não "esculpida". O vidro de trás continua um bloco preto grande.
- **Remendos projetados distorcem um pouco** onde a curvatura aumentou: o farol do Tupiniquim ganhou uma ponta no canto externo da frente (antes era limpo); o farol em gota do Caipora e o farol-garra do Pampeiro já eram irregulares em V6c (visível nas fotos "antes") e seguem. Mais cortes nos remendos resolveriam, mas gastam △ do teto de 4.500.
- **Piso removido** (como no herói): quem inclinar o carro até ver por baixo veria o vazio; o jogo não faz isso. Recolocar custa ~230 △ por carro.
- Os 12 outros nacionais (Barão, Besouro, Pão de Forma, Gaúcho, Trilheiro, Lambari, Jabuti, Furgãozinho) seguem em V6c; o método (anel + deformação) vale para os que têm carroceria de caixa, mas cada um pede parâmetros e olho.
- FPS não medido (swiftshader só conta △ e chamadas). O Blender não é determinístico byte a byte (ruído de ponto flutuante nos `.glb`).
- O herói do Cuiabano e do Tupiniquim e os `.glb` herói não foram regerados.

## 7. Comandos
`npm run carros-blender cuiabano tupiniquim caipora pampeiro` regera os quatro `.glb` (`/home/user/venv-bpy/bin/python -I tools/blender/build_car.py <carro> src/assets/cars/<carro>.glb [--sem-forma]`); `npx vitest run tests/casco-forma.test.ts tests/herois-forma.test.ts tests/carros-nacionais.test.ts`; fotos: `node tools/casco-folha.mjs fotos scratch/v19/depois` e `node tools/casco-folha.mjs folha scratch/v19/antes scratch/v19/depois scratch/v19/folha` (o "antes" sai de `git show 0390778:src/assets/cars/<id>.glb`).

## 8. Arquivos
`src/assets/cars/{cuiabano,tupiniquim,caipora,pampeiro}.glb`, `tools/blender/{casco_forma.py,build_car.py,hero_forma.py,README.md}`, `tools/{casco-folha.mjs,render-harness.html}`, `tests/{casco-forma.test.ts,forma-medidas.ts}`, `docs/ondas/V19-forma-casco.md`, `docs/CARROS-NACIONAIS.md`, `docs/herois-v19/`.
