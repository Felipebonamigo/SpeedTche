## V2 (etapa GT) — o carro do jogador no estilo HCT "rodada 2", dentro do jogo

> **Base conferida:** `main` 550e970 (câmeras FOV 54, cor e brilho: verniz `carVarnish`, `aLens` nas lanternas, chama nova; menu novo), branch
> `nc/gt-hct`, worktree `/home/user/speedtche-wt/gt-hct`, 15/10/2026. **Bounded**: só render, um estilo (`gt`); nada de save, protocolo, dinheiro
> nem núcleo. Pedido do dono (13–14/10): carros e cena *"um pouco mais realistas que o Horizon Chase Turbo, e mais bonitos que ele"*; ele aprovou a
> direção da **rodada 2** do protótipo (`nc/estilo-carros`: `docs/ondas/estilo-carros-hct.md`, `tools/estilo-carros/hct2/`). Esta etapa é **só o
> `gt`** (Falcão GT e Boitatá GT), em produção, para o dono dirigir e julgar; os outros 12 estilos vêm depois da aprovação.
> **Não toca:** `src/core` (`hashRace`, `sim-golden`, `CARS`), eixos, pegada, escapes (as saídas da chama), `CarModel`/`checkCarModel`, o
> material (`createCarMaterial`, a chave `speed-tche-car-v4`), as rodas (`WHEEL_LISTS`, `sport5` de fábrica), o `.glb` da arte, o Retrô.

### 1. Design em duas frases
O casco do `gt` passa a ser o do HCT2 (casco descrito por **linhas em z**, `Hull`: capô abaulado sem calha, lateral em dois planos com vinco vivo,
cabine avançada, para-brisa deitado, vidro de trás longo, entrada de ar no flanco), com as peças do protótipo trazidas para `src/render/cars/` e
reescritas para o contrato do jogo (pincéis nomeados de luz e faixa, lente em leque para o `aLens`, lod1 do mesmo construtor). A **traseira é a
estrela**: quatro lanternas redondas **embutidas** num painel preto (moldura saliente, lente recuada em cúpula com miolo e borda, como a
referência do dono), pisca âmbar e luz de ré apagadas, grade de colmeia, placa, difusor de aletas, os dois escapes de sempre e a asa com
suportes; as faixas A (duas faixas do bico à cauda, por cima do capô, teto e tampa do motor) e B (no vinco, que sobe da frente para trás)
são redesenhadas para seguir a forma nova.

### 2. Levantamento (arquivo:símbolo, conferido por grep no 550e970)
| Onde | Fato |
|---|---|
| `src/render/cars/styles/gt.ts` `buildGt` | o GT de hoje: `BodyShape` de motor dianteiro, cabine `bubble`, 4 lanternas `roundLampPair` chapadas, `buildRear` (escapes x ±0,42, y 0,26, z 2,26, r 0,075; difusor; asa `post`). 3.630 △, lod1 1.638 (45%). Eixos `{z −1,36 / 1,34, r 0,44, x 0,79, w 0,32}` |
| `models.ts` `MODEL_BUILDERS`, `buildModel` | o lod1 sai do mesmo construtor com `lod = 1` |
| `body.ts` `BodyShape`, `buildCabin`, `cabinGlint`, `isGlass` | o casco atual por seções; o reflexo das janelas laterais só sai para `GLASS`/`GLASS_DARK` |
| `kit.ts` `MeshBuilder`, `loft`, `lensRadius` | o `aLens` (miolo/borda) só nasce em tampa emissiva **em leque com vértice no centro** |
| `rear.ts` `buildRear`, `details.ts` `wing` | escapes, difusor e asa (`post`/`swan`); o descritor `RearKit` é conferido contra a malha |
| `check.ts` `CAR_LIMITS`, `checkCarModel` | pegada, faróis na frente/lanternas atrás, escapes, ≤ 4.500 △, faixas A/B dos carros do estilo |
| `mount.ts` `carMount` | o Capô corta acima do capô (`hoodTop` = o mais alto do primeiro 26% do comprimento) e o olho fica a 52% do comprimento |
| `paints.ts` `liveryFor`, `LIVERY_A/B` | Falcão (1º GT) com a faixa A, Boitatá (2º) com a B |
| `cosmetics.ts` `WHEEL_LISTS.gt` | `sport5` primeiro (= `buildModel('gt').wheel`) |
| `tests/car-round.test.ts` "o que não pode mudar" | pincéis de luz/faixa do `gt`: só `ACCENT`, `HEAD`, `STRIPE_A`, `STRIPE_B`, `TAIL`; áreas (m²) farol 0,105 (faixa 0,065–0,174), lanterna 0,168 (> 0,068), A 2,081 (1,19–3,17), B 0,351 (0,23–0,60), acento 0,283 (0,13–0,35) |
| `tests/estilo-carro.test.ts` | roda ≥ 19%, lanterna ≥ 0,15 m², difusor/asa na malha, **cabine bolha ≥ 92%**, vidro metal ≥ 0,85 e rugosidade ≤ 0,06 com ≥ 4 faixas de reflexo, lod1 ≤ 50% |
| `tests/cor-brilho.test.ts` "a lente não é chapada" | a lente `TAIL` do GT vai do miolo (1) à borda (≤ 0,45) |
| `src/bench/gate.ts` `GATE_LIMITS` | chamadas e triângulos por cena; o GT novo não cria lote (mesma chave `gt`) |

O protótipo (rodada 2) **não passa** em três contratos do jogo, que esta etapa resolve sem mudar o contrato: pincéis próprios de luz
(`H_LENS`, `T_LENS`, `T_DEEP`, `T_AMBER`… → "desconhecido" no `car-round`), lente sem leque central (sem miolo no `aLens`) e vidro de metal 0,55
(o teste o ignora como vidro). E a **cabine bolha ≥ 92%** (meta de cartum da M4) é o contrário do vidro com caimento do HCT2 aprovado.

### 3. Arquivos
| Arquivo | O quê |
|---|---|
| `src/render/cars/curve.ts` (novo) | curva suave monótona por pontos (do HCT2) |
| `src/render/cars/hull.ts` (novo) | o casco por linhas (`Hull`, do HCT2), com consultas `topAt`, `skinX`, `creaseY`, `endZ` |
| `src/render/cars/shaped.ts` (novo) | peças que pousam no casco: prisma, decalques laterais e de ponta, lâmpada embutida com lente em leque, farol com projetores, grade, maçaneta, reflexo do vidro |
| `src/render/cars/styles/gt.ts` | reescrito sobre o `Hull` |
| `src/render/cars/paints.ts` | pincéis novos **sem** luz nem camada (vidro escuro, reflexo suave, lente âmbar e de ré apagadas, moldura da lanterna) |
| `src/render/cars/body.ts` | `isGlass` reconhece o vidro novo (reflexo nas janelas laterais) |
| `tests/estilo-carro-gt.test.ts` (novo), `tests/estilo-carro.test.ts` | ver §4 |
| docs | este cartão, `docs/CARROS.md` (linha do `gt`), `docs/CRONOGRAMA.md` (V2) |

Não toca: `src/core/**`, `cars.ts` (instâncias, lotes, bits), `material.ts`, `wheels.ts`, `cosmetics.ts`, `mount.ts`, os outros 12 estilos.

### 4. Testes a escrever ANTES (e ver falhar no 550e970)
`tests/estilo-carro-gt.test.ts` (puro, a malha do `buildModel('gt')`):
| Teste | Afirma | Falha hoje por |
|---|---|---|
| proporções do HCT2 | cabine avançada (base do para-brisa em z ≤ −0,75), bico baixo (topo da pele em z ≤ −2,0 abaixo de 0,62 m), teto entre 1,12 e 1,26 m na metade da frente da cabine, vidro de trás longo (≥ 0,6 m em z), traseira alta (tampa a ≥ 0,8 m em z = 1,9) | para-brisa em −0,58 |
| vidro realista | caimento: alto do vidro ÷ vidro todo entre 0,70 e 0,92 (o HCT2), vidro escuro metálico (≥ 0,85) com reflexo nas duas laterais | 0,92+ (bolha) |
| entrada de ar no flanco | peça preta colada na pele lateral entre a porta e a roda de trás (z 0,3–0,8), dos dois lados | não existe |
| lanternas com profundidade | 4 lentes `TAIL` (2 por lado), cada uma em leque com miolo, **recuada** dentro de uma moldura que sobra ≥ 3 cm da pele; pisca âmbar e ré apagados (sem emissivo) | lentes rentes à carcaça, sem moldura saliente nem âmbar |
| asa com suportes, difusor e escapes | dois suportes que ligam a tampa à lâmina; escapes **iguais** aos de hoje; difusor com ≥ 6 aletas | 5 aletas |
| faixa A na forma nova | um raio de cima em x = ±0,22 bate primeiro na faixa A em ≥ 80% das amostras fora do vidro, **do bico (z ≈ −2,1) à cauda (z ≈ 2,1)**; os dois lados iguais | a tampa e a cauda (rabeta, asa) cobrem a faixa |
| faixa B na forma nova | um raio do lado na altura do vinco bate na faixa B do eixo dianteiro ao traseiro; o vinco sobe ≥ 0,15 m da frente para trás | (trava da forma: o vinco do casco novo) |
| farol com projetores | ≥ 2 discos `HEAD` por lado sobre um refletor, numa carcaça que sobra do capô | farol é uma caixa chapada |
| lod1 | ≤ 45% do lod0, com lanterna, farol e as duas faixas | (trava) |

`tests/estilo-carro.test.ts`: a cabine bolha (≥ 92%) deixa de valer para o `gt` (estilos HCT, lista `HCT`), **de propósito**: a diretriz nova do
dono (mais realista que o HCT) substitui o cartum da M4 nesse ponto; o caimento passa a ser conferido no teste novo. O resto (roda, lanterna,
difusor, asa, vidro, lod1, teto de 4.500) continua valendo para os 13.

Continuam como estão e têm de passar: `car-round` (pincéis e áreas do `gt`), `cor-brilho` (lente com miolo), `car-models`, `car-look`,
`car-contrato-asset`, `car-gltf*`, `cameras`, `stage*`, `gl-render` (gate).

### 5. Riscos
| Risco | Mitigação |
|---|---|
| O protótipo dependia da luz do harness (`hct2`) | só o material do jogo (verniz da cor-brilho); julgar nas capturas do jogo, não nas do protótipo |
| Triângulos sobem no gate | casco ≤ 4.200 (orçamento 4.500), lod1 ≤ 45%; medir as cenas do gate e a galeria; explicar qualquer subida |
| Capô: o corte (`hoodTop`) é o para-lama dianteiro (≈ 1,0 m, roda grande) | captura do Capô antes × depois; o `mount.ts` não muda |
| Lanterna sem miolo (leque sem centro) | lente montada em leque com o vértice no centro; teste do `cor-brilho` + o novo |
| Faixa A coberta por peça (tomadas, venezianas) | as peças do capô e da tampa ficam fora de x ∈ [0,08; 0,40]; o teste do raio de cima pega |
| Silhueta 2D (`icons.ts`) diz "motor dianteiro" | fora do escopo desta etapa (anotado para o dono) |

### 6. Ordem (um commit cada)
1. Este cartão. 2. Testes novos vistos falhar + `curve.ts`/`hull.ts`/`shaped.ts`/`gt.ts` até verdes (registro da falha aqui). 3. Capturas, galeria e
ajustes. 4. Suíte inteira, docs, cronograma.

### 7. Pronto quando
`npx tsc --noEmit -p .` sem saída; `npx vitest run tests/car-* tests/estilo-carro* tests/cameras* tests/stage* tests/cor-brilho*` verdes;
`NC_REQUIRE_GL=1 npx vitest run tests/gl-render.test.ts tests/stage-gl.test.ts tests/cor-brilho-gl.test.ts` verdes (gate sem subir); suíte inteira
(`NC_REQUIRE_RELAY=1 NC_REQUIRE_GL=1 npx vitest run --testTimeout=300000 --hookTimeout=900000 --reporter=dot`) verde uma vez no fim; galeria antes ×
depois (Copacabana dia, Paraty, Sampa noite, derrapagem, 14 carros de trás, garagem) e a folha do GT (3/4 frente, 3/4 traseira, lateral, câmera de
corrida, capô, noite; atual × novo) abertas e conferidas.

### 8. Capturas
`scratch/gt-hct/folha-gt.png` (atual × novo, 6 vistas) e `scratch/galeria/comparar-main-550e970-vs-gt-hct.png`. O "antes" sai de uma cópia congelada
do 550e970 (`git archive`) servida por outro vite.
