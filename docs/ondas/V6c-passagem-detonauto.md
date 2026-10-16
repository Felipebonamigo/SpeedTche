# V6c — passagem para o Detonauto: o mesmo carro em duas versões (cartoon aqui, realista lá)

> Decisão do dono (16/10/2026): o Speed Tchê faz os carros nacionais **cartoonados** (4.500 △, cor chapada com verniz, rodas grandes); o **realismo detalhado**
> fica com o Detonauto (Unreal), a partir do MESMO arquivo de parâmetros. Este documento é para o dono levar ao outro projeto; nada aqui foi empurrado
> nem escrito no clone do Detonauto. O Cuiabano do Detonauto (`Tools/Blender/make_cuiabano.py`, de Felipe, commit 13cc970) foi a régua da silhueta:
> uma cópia sem alteração está em `tools/blender/base/make_cuiabano_detonauto.py`.

## 1. O que é compartilhado

**A biblioteca bpy parametrizada** — `tools/blender/` deste repositório (README lá):

| Peça | O que faz |
|---|---|
| `carlib.py` | curvas de perfil (`pchip`), casco por estações (anel de 16 pontos × estações → quadrângulos → superfície de subdivisão com vincos), vão de roda (booleana + `symmetrize`), calha do vão, remendos projetados na pele (`patch`: farol, lanterna, grade, placa, frisos de porta, vinco — contorno → `shrinkwrap`), rodas, exportação glTF |
| `specs/<carro>.py` | **PARAMS do carro**: estações em Y, curvas `floor`, `belt`, `top`, `hwb`, `hwl`, `hwr`, `bulge`, `sill`, `belt_in`, `crown`; janelas por intervalo (`WIN`), eixos, roda, contornos de farol e lanterna, peças pequenas. Tudo em metros, um arquivo por carro |
| `build_car.py` | monta lod0 e lod1, rodas, `exhaust_*`, `seat`; **`--estilo cartoon|realista`** |

**Como gerar as duas versões do MESMO arquivo de parâmetros** (venv com `bpy`, ver o README):

```bash
python -I tools/blender/build_car.py cuiabano out/cuiabano-cartoon.glb                    # 3.104 △ (≤ 4.500), lod1 752, vai ao jogo
python -I tools/blender/build_car.py cuiabano out/cuiabano-realista.glb --estilo realista # ~10.800 △: subdivisão 2, vão com 48 lados, remendos com 1 corte a mais
```

| `--estilo` | cartoon (Speed Tchê) | realista (Detonauto) |
|---|---|---|
| subdivisão | nível 1, vinco só na cintura, no friso do teto e no rocker | nível 2+ (ou 3 no casco), vincos finos, chanfro nas quinas |
| faces | ≤ 4.500 △ no lod0, lod1 ≤ 45% | sem teto de jogo (LOD pelo Unreal/Nanite) |
| vidro | uma faixa lisa por janela, escuro e metálico | recortado nas colunas, com borracha e batente |
| roda | grande (raio 0,36 m), 5–6 raios, prato escuro | raio de fábrica (~0,29–0,31 m com a escala real), aro, pneu com banda e freio visível |
| cabine/rodas | levemente exageradas (cabine ~+10%, rodas ~+15%) | proporção de fábrica (dimensão real da tabela do item 3) |
| luzes | remendo emissivo plano | refletor, lente, miolo, pisca separados |
| detalhes | maçaneta e espelho em caixas | maçaneta, espelho com carcaça e vidro, borrachas, soleira, interior básico |
| material | `paint`, `glass`, `trim`… por NOME, cor chapada | PBR por papel (mapa UV, normal, rugosidade) com os mesmos nomes de papel |

O `--estilo realista` do script de hoje é só a **2ª saída simples** (mais subdivisão) para ver a diferença; o trabalho de realismo (interior, refletor,
freio, UV/PBR) é do Detonauto e entra como mais passos em `build_car.py`, não como outro script.

## 2. O que cada projeto mantém

| | Speed Tchê | Detonauto |
|---|---|---|
| eixos | Blender com a **frente em −Y**; o exportador (Y para cima) dá frente em +Z no glTF | frente +X, esquerda +Y, cima +Z (`make_cuiabano.py`): girar 90° ao importar o PARAMS |
| escala | metros **do jogo** (~10% acima do real, para caber na pegada 4,2 × 1,8 m do núcleo) | metros reais (dividir o PARAMS por 1,10) |
| origem | centro do carro no plano do chão (y = 0 sob as rodas) | idem (chão, centro) |
| nós | `lod0`/`lod1`, `body`, `glass`, `lamp_head`, `lamp_tail`, `details`, `wheel_fl/fr/rl/rr`, `exhaust_l/r`, `seat` | `Body`, `Chassi`, `Glass`, `Lights`, `Rim`, `Tire` (slots do Unreal) |
| materiais | pelo nome: `paint*` recebe a cor do carro, `headlight*`/`taillight*` acendem, `glass`, `trim`, `bumper`, `tire`, `rim`, `hub`, `amber`, `plate` (`docs/ARTE.md`) | os nomes de slot do Unreal; mapa `paint→Body`, `trim/bumper→Chassi`, `headlight/taillight/amber→Lights` |
| contrato | `npm run check-car` (pegada, rodas, lod1, `seat`) | `split_car_parts.py`, `export_fbx_batch.py` |

Regra: **o arquivo de parâmetros é a fonte**; as duas pontas só traduzem nomes, eixo e escala na importação, e cada uma testa o seu contrato.

## 3. Os 12 carros: dimensões e o que falta para o realismo

Dimensões são **estimativas de dado público** (m, reais); a coluna "no jogo" é o que o núcleo exige (`CAR_LIMITS`: comprimento > 4,2 m e largura > 1,8 m, micro > 3,2 m; a escala de ~1,1 sai disso).
Os nomes são os do jogo; o arquétipo de cada um está na ficha `docs/CARROS-NACIONAIS.md` (mesmo número).

| # | Nome no jogo | C × L × A (m) | Entre-eixos | Estado hoje | O que falta para o realismo |
|---|---|---|---|---|---|
| 1 | Cuiabano | 3,90 × 1,65 × 1,42 | 2,36 | **feito** (cartoon, `specs/cuiabano.py`) | interior básico, farol com refletor, maçaneta e espelho detalhados, borracha dos vidros, rodas com aro e freio, UV/PBR |
| 2 | Tupiniquim | 3,75 × 1,64 × 1,42 | 2,42 | **feito** (cartoon, `specs/tupiniquim.py`) | idem, mais a lanterna em "L" com miolo, o vinco da porta à coluna C em geometria (hoje ranhura projetada) |
| 3 | Caipora | 3,82 × 1,65 × 1,43 | 2,49 | spec a fazer | corpo arredondado (`crown` e `bulge` altos), lanterna em gota, variante sedã de porta-malas curto |
| 4 | Pampeiro | 3,95 × 1,72 × 1,47 | 2,54 | spec a fazer | farol alongado até o para-lama, teto com caimento, grade baixa de uma barra |
| 5 | Barão | 4,55 × 1,75 × 1,45 | 2,60 | spec a fazer (sedã: porta-malas alto, estações novas) | lanterna de ponta a ponta com friso, faixa lateral, interior |
| 6 | Furgãozinho da Firma | 3,65 × 1,55 × 1,45 | 2,31 | spec a fazer (micro) | escada no teto (peça animável `anim_escada`), adesivo fictício, sem nada de marca |
| 7 | Besouro | 4,05 × 1,54 × 1,50 | 2,40 | spec a fazer (forma própria: para-lamas bojudos, capô curto) | para-lamas separados, faróis e lanterna próprios |
| 8 | Pão de Forma | 4,50 × 1,72 × 1,95 | 2,40 | spec a fazer (furgão alto) | duas janelas laterais, teto alto, porta lateral |
| 9 | Gaúcho V8 | 4,60 × 1,78 × 1,35 | 2,68 | spec a fazer (muscle: capô longo, cabine recuada) | grade e capô com entrada, escapamento duplo |
| 10 | Trilheiro | 3,98 × 1,74 × 1,85 | 2,40 | spec a fazer (jipe) | capô reto, grade de barras próprias, estepe atrás |
| 11 | Lambari | 4,00 × 1,57 × 1,33 | 2,40 | spec a fazer (cupê de traseira inclinada) | faróis redondos baixos, lanterna horizontal, para-choque de lâmina |
| 12 | Jabuti | 3,19 × 1,52 × 1,36 | 2,23 | spec a fazer (micro quadradinho) | farol quadrado com friso, capô com vinco central |

Ordem sugerida (do que a biblioteca de hoje já cobre para o que exige código novo): 3 e 4 (hatch: só `specs/`), 5 e 9 (anéis iguais, estações novas),
6, 12 e 11 (micro e cupê), 7, 8 e 10 (formas próprias: pedem peças novas no `carlib.py`).

## 4. O que NÃO se compartilha

- **Nome, logo, emblema e grade-assinatura de marca** — nada disso entra em parâmetro, em nó, em material, em arquivo nem em comentário; também não o
  desenho gráfico exato de farol/lanterna/faixa de um modelo real. A ficha é a regra (`docs/CARROS-NACIONAIS.md`).
- **Teste de varredura**: `tests/carros-nacionais.test.ts` procura os nomes de modelo e marca no JSON do `.glb` (nós, malhas, materiais) e em tudo o que está em
  `tools/blender/` (`\b(gol|palio|corsa|uno|fiat|vw|volks…|chevrolet|peugeot|marea|mille)\b`). O Detonauto deve rodar a mesma varredura sobre o que importar.
- Fotos e modelos de carro de marca (para conferir proporção basta olhar; nunca copiar malha nem textura).
- O que é só do jogo: o teto de 4.500 △, o atlas 256² opcional, o contrato `kit_*`/`decal_*`/`seat`. O que é só do Detonauto: amassado, peças soltas, danos (`make_damage_morphs.py`).
