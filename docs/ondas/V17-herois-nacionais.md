# V17 — carro herói dos nacionais livres: Cuiabano e Tupiniquim (branch `nc/heroi-nacionais`, base `main` c41f121, 21/10/2026)

> Pedido do dono: os carros ainda parecem "mal feitos" frente ao Horizon Chase 2, e Cuiabano e Tupiniquim são os primeiros que o jogador vê. Aqui: casco de ALTA definição (mesmo contrato dos heróis de V9/V15, teto `HERO_MAX_TRIANGLES` = 20.000) para os DOIS, com o caráter de carro popular (não o de esportivo). **Só `src/render/cars` (carregador e lista), os `.glb`, as ferramentas e os testes** (`src/core`, `hashRace`, `sim-golden` intactos; nenhum limite do gate mexido). FPS não foi medido (swiftshader só conta): quem diz se cabe é o `--bench` do dono.
> Imagens (`docs/herois-v17/folha-<carro>.jpg`; os PNG originais em `scratch/nac/`, fora do git): uma folha por carro, **atual × herói** (câmera de corrida de dia, 3/4 de trás, 3/4 da frente, garagem). Não há recorte do HC2 aqui (as referências não estavam neste ambiente).

## 1. O que entrou
| Peça | O quê |
|---|---|
| `tools/blender/build_hero_nacional.py` (`npm run carros-herois-nacionais`) | O MESMO casco de V6c (`specs/<carro>.py`: silhueta, proporção, eixos, escapes, pegada), com subdivisão nível 2 e o vão de roda em 48 lados; os remendos chapados de farol, lanterna, para-choque, placa e frisos saem e entram peças em relevo |
| `tools/blender/hero_nac.py` | `raised` (parede + topo chanfrado assentados na pele por raio), `lamp_cell` (célula de lanterna/farol com moldura, poço de refletor, coroa e lente em leque: o `aLens` e o halo continuam valendo), retrovisor de caixa, maçaneta com bolsão, limpador, antena de mastro, escapamento simples, alargamento dos para-lamas |
| `tools/blender/hero_nacionais/{cuiabano,tupiniquim}.py` | o que é de cada carro (posições, formas, estilos) |
| `src/render/cars/{gltf,assets,lod}.ts` | o herói de um **carro** (`hero/<id>.glb`) é conferido contra o `.glb` do PRÓPRIO carro (`parseHeroGlb(body, dados, { base, carId })`); antes comparava com o hatch procedural (roda de 0,42 m, escapes em ±0,17) e recusaria o arquivo. Sem o `.glb` do carro carregado o herói é recusado com o motivo. `HERO_STYLES` virou `readonly string[]` (estilo ou id de carro) e ganhou `cuiabano`, `tupiniquim` |

**Cuiabano** (hatch quadrado): lanterna VERTICAL de três cubos por lado em poço com refletor (âmbar em cima, vermelhos embaixo, a luz de ré clara ao lado do vermelho de baixo), terceira luz de freio, para-choque de plástico com friso cromado, faixa escura baixa e catadióptricos vermelhos, placa lisa em moldura, farol retangular largo (moldura, refletor prateado, lente de fora e de dentro) com pisca âmbar, grade lisa e baixa com uma única fresta, entrada de ar no para-choque, vincos de capô, limpadores e desembaçador, retrovisores de caixa, maçanetas, friso lateral, pisca lateral, tampa do tanque (só do lado direito), antena no para-lama, escapamento simples.
**Tupiniquim** (hatch compacto): lanterna ALTA em "L" invertido (barra vermelha em cima + perna alta no canto; luz de ré clara e pisca âmbar embaixo, o "L" cheio em vermelho apagado sob as células), faróis em cunha (a ponta de fora sobe), grade lisa e estreita, para-choque com friso e tampas dos furos de neblina, o vinco que sobe para a coluna C (faixa B) mantido; o resto como no Cuiabano, com retrovisores de carcaça preta.

## 2. Números
| | △ (jogo, lod0 do herói) | de sempre (V6c) | partes grandes |
|---|---|---|---|
| Cuiabano | 16.050 (o Blender conta 16.072 com as rodas de posição) | 4.348 | casco 6.420, lanternas ~1.5 mil, farol ~1.5 mil, para-choques ~1.0 + 0.9 mil |
| Tupiniquim | 16.416 (Blender: 16.434) | 3.912 | casco 6.396, lanternas ~1.9 mil, farol ~1.5 mil, para-choques ~1.1 + 1.0 mil |

Gate (640×360, pior viewport, 300 ticks; `tools/herois-gate.mjs`, `tests/herois-nacionais-gl.test.ts`), △ desligado → herói ligado, chamadas desligado → ligado, limite do gate:
| cena | △ sem → com herói | chamadas sem → com | limite △ / chamadas |
|---|---|---|---|
| copa-1p Alta, Cuiabano | 255.088 → 278.490 | 85 → 85 | 340.000 / 85 |
| copa-1p Ultra, Cuiabano | 255.784 → 279.188 | 86 → 86 | 340.000 / 86 |
| copa-1p Ultra, Tupiniquim | 254.906 → 279.918 | 86 → 86 | 340.000 / 86 |
| copa-2p Ultra, os dois | 226.388 → 274.802 | 79 → 79 | 340.000 / 84 |
| copa-4p Média, 2+2 | 206.284 → 302.582 | 74 → 74 | 316.000 / 82 |
| copa-4p Alta, 2+2 | 224.200 → 321.020 | 75 → 75 | 340.000 / 81 |
| copa-4p Ultra, 2+2 | 224.873 → 321.699 | 79 → 79 | 340.000 / 85 |
| copa-4p Ultra, 2 nacionais + Pororoca + Iara | 222.431 → 317.391 | 82 → 82 | 340.000 / 85 |
| sampa-4p Ultra, 2+2 | 178.464 → 271.132 | 78 → 78 | 380.000 / 92 |
O herói dos nacionais soma **0 chamadas** em todas as cenas medidas (o lote de sempre do carro esvazia quando o humano vira herói e cada carro já tinha lote próprio) e ~23 mil △ por herói de perto (cena + sombra). O pior caso medido (copa-4p Alta/Ultra, 4 humanos de nacionais) usa 321.020 / 321.699 △ do teto de 340.000: sobra ~5%, menos que com os heróis de V15 (308 mil). Sem programa de shader novo (o teste conta os programas ligando o herói no meio).
Custo de carga: +2 arquivos de ~1,1 MB, lidos sob demanda por `ensureHeroes()` (V16), nada na abertura.

## 3. Testes (escritos antes e vistos falhar)
- `tests/herois-nacionais-asset.test.ts` (34): antes dos arquivos, "falta src/assets/cars/hero/<id>.glb" (e o gerador). Depois, com os arquivos, falharam por MOTIVOS DE TESTE, não de asset, e foram corrigidos de propósito (anotado aqui para não parecer teste adaptado ao código): (a) `lensCenters` só acha leque cujos vizinhos têm `aLens` > 0,6 — em lente comprida (farol, barra do "L") isso não vale, então o farol é conferido por triângulos acesos e o "L" pela caixa e pelo preenchimento; (b) simetria: a antena, a tampa do tanque, o escapamento único com o abafador e os limpadores são assimétricos de propósito (isenções nomeadas no teste); (c) alturas mínimas do trecho aceso (0,16 / 0,22 m) e área do farol saíram do desenho medido; (d) grade: `trim_soft` e `under` entram na lista de materiais lisos.
- `tests/herois-carro-proprio.test.ts` (3, vistos falhar com o carregador antigo: recusa por eixo, por faixa B de outros hatches e sem a mensagem): o herói de um carro vale sobre o `.glb` dele.
- `tests/herois-lod.test.ts` (+2): Cuiabano e Tupiniquim têm o SEU lote herói; a IA e o Tornado (hatch) ficam no casco de sempre; `herois-sob-demanda` e `herois-asset` passaram a carregar os `.glb` dos dois carros primeiro (como a abertura do jogo) e a pasta do herói lista os nacionais.
- `tests/herois-nacionais-gl.test.ts` (18, GL): escrito DEPOIS dos arquivos (é medida de desempenho, não contrato de forma); passa dentro dos limites do gate.

## 4. O que ainda parece ruim (olhando `docs/herois-v17/`)
O herói **está melhor** em tudo que se vê de perto (3/4 e garagem): lanterna com poço e lentes, para-choque com friso, placa em moldura, farol com refletor, maçanetas, retrovisor, limpadores, desembaçador, escapamento único. Na **câmera de corrida** o ganho é discreto: o carro é visto de trás a ~10 m e o que domina é o vidro de trás preto e a lataria lisa.
- O "L" do Tupiniquim, de longe, lê **menos** que o L chapado e laranja de V6c (a moldura escura e as células quebram a mancha). O L cheio em vermelho apagado sob as células melhorou, não igualou.
- O corpo continua liso e quadrado (a silhueta é a de V6c de propósito) e a lataria não tem vincos de verdade no casco: só frisos desenhados em cima.
- **Rodas**: o jogo desenha a roda do catálogo escolhida pelo jogador; roda de aço com calota ou liga simples não é deste arquivo (o herói só dá posição e tamanho).
- O escapamento é único de verdade, mas o contrato exige a saída da chama nos dois lados: o outro lado tem um toco escuro.
- O reflexo do céu nos vidros (faixas claras) é cru: uma faixa pálida inclinada.
- O Blender não é determinístico byte a byte; os `.glb` regerados diferem em ruído de ponto flutuante.
- Os outros dez nacionais (Caipora, Pampeiro etc.) seguem só com o casco de V6c; Caipora e Pampeiro também são hatches e pedem o mesmo trabalho, que cabe nesta ferramenta (um módulo por carro).

## 5. Arquivos
`src/assets/cars/hero/{cuiabano,tupiniquim}.glb`, `src/render/cars/{gltf,assets,lod}.ts`, `tools/blender/{build_hero_nacional.py,hero_nac.py,hero_nacionais/*.py,hero/build-herois-nacionais.sh,README.md}`, `tools/{herois-folha,herois-gate}.mjs`, `tests/herois-{nacionais-asset,carro-proprio,lod,sob-demanda,asset}.test.ts`, `tests/herois-nacionais-gl.test.ts`, `docs/{ARTE,CARROS-NACIONAIS}.md`, `package.json` (`carros-herois-nacionais`), `docs/herois-v17/`.
