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

### 9. Resultado (15/10/2026)

**Commits** (em `nc/gt-hct`, sobre 550e970, nada empurrado): `65380a4` cartão · `969fc75` o `gt` HCT em produção, com os testes · `e96b4fa` farol todo
em cima do capô e placas da asa menores · `3553014` paredes da carcaça do farol na cor do carro · o registro (este).

**O que mudou.** `src/render/cars/curve.ts`, `hull.ts` e `shaped.ts` (novos: o casco por linhas e as peças que pousam na pele, do HCT2 aprovado,
reescritos para o contrato do jogo) e `styles/gt.ts` reescrito. Pequenos e aditivos: `paints.ts` (8 pincéis sem luz nem camada: vidro escuro, dois
reflexos, pisca e ré apagados, poço da lanterna, preto brilhante, refletor), `body.ts` (`cabinGlint` aceita o vidro novo e um pincel de reflexo),
`kit.ts` (`extrudeZYSpans`), `details.ts` (`wing` ganhou `stripe` e `plateH`), `ui/screens/icons.ts` (a silhueta 2D do `gt` com a forma nova).
Diferenças do protótipo, de propósito: as lanternas são **4 redondas embutidas** (a referência do dono, `ref-hct.webp`, e a identidade do GT de
antes) em vez da barra de 3 elementos; o farol ficou todo em cima do capô (no HCT2 ele passava do ombro); a roda continua a `sport5` (o HCT2 trazia
uma roda própria fora do sistema de aro da N3).

**Testes vistos falhar antes** (`npx vitest run tests/estilo-carro-gt.test.ts`, no GT antigo): `Tests  13 failed | 2 passed (15)` —
`expected -0.5799999833106995 to be less than or equal to -0.75` (para-brisa), `expected 0.628231942653656 to be less than 0.6` (bico),
`expected 1.2816548347473145 to be less than or equal to 1.26` (teto), `expected 0.9471077059488068 to be less than 0.92` (vidro bolha),
`lado 1: expected 0.015691571359052223 to be greater than 0.08` (entrada de ar), `x = 0.62: expected -0.019999980926513672 to be greater than or
equal to 0.01` (lente rente à moldura), `âmbar, lado 1: expected 0 to be greater than 0`, `expected 5 to be greater than or equal to 6`
(aletas), `lado 1: expected 0 to be greater than or equal to 2` (projetores), `x = 0.22, z = 2.15: a faixa A tem de estar à vista`,
`lado 1: expected 0.7878787878787878 to be greater than or equal to 0.8` (faixa B), `expected 0.4512396694214876 to be less than or equal to 0.45`
(lod1). Os 2 verdes são travas (4 lanternas redondas acesas; lod1 com luz e as duas faixas).
**Ajustes de teste, de propósito:** (1) `tests/estilo-carro.test.ts`: a cabine bolha (≥ 92%, cartum da M4) não vale para os estilos `HCT`
(`['gt']`); o caimento é conferido no teste novo. (2) No teste novo, antes do código: "vidro de trás longo" media o centroide (1,40 no GT antigo)
e passou ao vértice (o antigo chega a 1,72: virou trava); as aletas eram contadas por baldes de 5 cm (a mesma aleta caía em dois e o antigo passava)
e passaram a grupos por distância (o antigo dá 5). (3) Depois do código: o centro do leque precisa de `aLens` < 0,05 — a lente abaulada (1,2 cm na
lanterna, 4 mm no projetor) tirava força do miolo (o teste da cor-brilho exige o miolo > 0,95); o abaulado caiu para 3 mm e 2 mm.

**Números** (sem FPS). Casco 3.630 → **3.804 △** (+174; teto 4.500), lod1 1.638 → **1.500** (45% → 39%). Áreas (m², a faixa do `car-round`):
farol 0,105 → 0,080 (0,065–0,174), lanterna 0,168 → 0,154 (> 0,068; ≥ 0,15 vista de trás), faixa A 2,081 → 2,205, faixa B 0,351 → 0,391,
acento 0,283 → 0,283. Câmera de capô: `hoodTop` 1,01 → 1,00, corte 1,03 → 1,02, teto 1,286 → 1,198. Eixos, pegada, escapes (as saídas da chama)
iguais. **Chamadas iguais** (o mesmo lote `gt` e o mesmo lote de lod1); triângulos por cena: +348 com o GT do jogador perto (carview e corrida
201.763 → 202.111 e 203.952 → 204.300).

**Galeria antes × depois** (`node tools/galeria/comparar.mjs main-550e970 gt-hct`; as 6 cenas pedidas, o resto fica "sem imagem"): `6 de 13 cenas
mudaram`, todas por causa do GT — Copacabana 5,54% dos pixels, Paraty 5,13%, Sampa 4,65%, derrapagem 6,30%, os 14 de trás 2,16%, garagem 6,34%.
**Chamadas iguais nas 6** (54, 52, 56, 76, 52, 26). Triângulos ▲: Copacabana 205.270 → 205.618, Paraty 178.534 → 178.882, Sampa 184.795 →
185.143, os 14 de trás 191.648 → 191.996 (+348: dois GT de perto), derrapagem 274.492 → 275.536 (+1.044: seis GT de perto), garagem 8.402 → 8.576
(+174: um). É o +174 △ de cada GT desenhado no casco inteiro; o GT longe (lod1) tem 138 a menos. A base de Copacabana, Paraty e Sampa veio da
galeria `main-550e970` gerada pela frente `nc/pistas` (mesmo commit, limpo, mesma raiz); a derrapagem, os 14 de trás e a garagem foram gerados aqui.

**Capturas** (abertas e conferidas): `scratch/gt-hct/folha-gt.png` (atual × novo: 3/4 frente, 3/4 traseira, lateral, câmera de corrida, capô, noite
com freio, Boitatá com a faixa B; Copacabana `seg=300`, 1280×720, Alta), `scratch/galeria/comparar-main-550e970-vs-gt-hct.png` e
`scratch/galeria/gt-hct/folha.png`. As vistas de trás da folha saíram do `e96b4fa` (o `3553014` só pinta as paredes do farol da frente); as da frente,
do `3553014`. Para iterar a forma sem a fila de captura, `scratch/raster.ts` (rasterizador em software, fora do git).

**O que ainda não está no nível do HCT** (honesto, para o dono julgar dirigindo):
- **Reflexo do sol no vidro de trás**: na câmera de corrida de dia aparece um ponto branco com halo no alto do vidro (o sol num vidro quase espelho);
  o teto do bloom (cor-brilho) segura o tamanho, mas ele chama atenção. Ajuste fino de rugosidade do vidro/faixa de reflexo, na rodada seguinte.
- **Superfície**: continua um loft de ~2.000 faces no casco; o vinco da cintura é macio (dobra de ~35°, abaixo do vinco de 45° das normais).
- **Rodas**: a `sport5` de sempre (5 raios prata). A roda do HCT2 (10 raios escuros, lábio usinado, pinça vermelha) não entrou: ela não tem a camada
  de aro da N3. Proposta: um desenho novo de roda no catálogo (`WHEEL_IDS`) com aro, para o GT e os esportivos.
- **Lanternas**: profundidade e miolo aceso de verdade, mas sem lente translúcida nem LED desenhado; à noite o halo é o do bloom do jogo.
- **Faróis**: carcaça embutida com projetores; de frente ainda leem um pouco como "óculos" (a carcaça é um prisma de 4 lados).
- **Silhueta 2D** (`icons.ts`) refeita só no `gt`.

**Plano para os outros 12** (depois da aprovação do GT): o `Hull` e o `shaped.ts` servem a todos; cada estilo vira um `styles/<estilo>.ts` sobre
eles (~150–250 linhas) com o seu bloco no `tests/estilo-carro-gt.test.ts` (proporções, lanternas com profundidade, faixas na forma nova, lod1) e a
entrada em `HCT` no `tests/estilo-carro.test.ts`. Ordem por parentesco e risco: `wedge` e `hyper` (variantes do GT: cunha mais radical com faróis
escamoteáveis — atenção ao pincel `POP_*` do `car-round` — e o largo de asa em pescoço de cisne), `prototype`, `roadster` (sem teto), depois `hatch`,
`sedan` e `pickup` (o HCT2 já tem a forma), `rally` (do hatch), `muscle` e `electric` (do sedã), e por fim `classic` e `micro` (forma própria). ~9
sessões, uma folha antes × depois e a galeria por estilo; os contratos que este GT resolveu (pincéis nomeados, lente em leque, vidro que conta como
vidro, faixa que não some debaixo de peça) valem igual para eles.

**Verificação** (código do `3553014`): `npx tsc --noEmit -p .` sem saída; `npm run build` exit 0. Área (`npx vitest run tests/car-* tests/estilo-carro*
tests/cameras* tests/stage* tests/cor-brilho* tests/garage-stage*`, com o Chromium, no `969fc75`): `Test Files  23 passed (23)` · `Tests  511 passed |
1 skipped (512)`; depois de cada ajuste, `estilo-carro-gt`, `car-round`, `estilo-carro`, `car-models`, `cameras` e `cor-brilho`: `Tests  207 passed
(207)`; `cosmetics`, `paint`, `render-normals`, `track`: `Tests  238 passed (238)`; a silhueta (`cars.test -t silhueta`): 3 verdes.
**Suíte inteira, uma vez** (`NC_REQUIRE_RELAY=1 NC_REQUIRE_GL=1 npx vitest run --testTimeout=300000 --hookTimeout=900000 --reporter=dot`, com a máquina
a 35–60 de carga e 3 suítes de outras frentes rodando juntas): `Test Files  6 failed | 205 passed (211)` · `Tests  7 failed | 3822 passed | 1 skipped
(3830)` em 6.754 s. **Os 7 são tempo-limite** (`Test timed out in …`, o limite escrito no próprio teste): `ai` (30 s), `batidas-cenario` (120 s),
`fuel` ×2 (30 s), `gl-render` "compila todos os programas" (1.500 s), `landmarks-enquadramento` (180 s), `landmarks` "perLap" (120 s) — a
armadilha conhecida do PLAYBOOK §5. Cada um rodado sozinho, verde: `gl-render` 14/14 (2.103 s), `ai` 251/251, `batidas-cenario` 4/4, `fuel` 227/227,
`landmarks-enquadramento` 6/6, `landmarks` 23/23. Na suíte inteira o **gate de contagem** (`gl-render`, "dentro dos limites provisórios") passou, e
`stage-gl` (garagem, pódio, revelação), `cor-brilho-gl`, `corrida-que-muda-gl` e `efeitos-gl` passaram inteiros. O pulado é o de sempre
(`car-pipeline`, o carro do Kenney fora do git).

### 10. Etapa 2 (15–16/10/2026): o reflexo do sol, a cunha e o hipercarro

**Commits** (em `nc/gt-hct`, nada empurrado): `fa55659` mescla do `main` 3662d4a (0.1.5, HUD V5, efeitos V8; sem conflito) · `9008d5f` teto no realce
do sol · `845db36` cunha e hipercarro no estilo HCT · o registro (este).

**O ponto branco com halo** (câmera de corrida de dia) não era o vidro: era o realce DIRETO do sol no verniz do arco pintado do teto (some sem o sol e
sem o verniz; o reflexo do céu não muda nada). Correção em `cars/material.ts`: o realce direto (o do verniz também) tem teto, `SUN_SPEC_CAP = 0,5`,
aplicado depois de `lights_fragment_begin` e antes do reflexo do céu (chave do programa `speed-tche-car-v5`). Um piso de rugosidade para a luz
direta foi tentado e piorou (38,8% de branco). Teste no laboratório GL (`cor-brilho-gl`, Copacabana seg 300, ônix sem faixa): **13,64%** de pixels
brancos na sonda do teto sem a correção, **0,30%** com ela (limite 0,5%; vidro 0,2%; carro todo 0,1%).

**Cunha (`wedge`, Iara Turbo)** e **hipercarro (`hyper`, Pororoca V10)** reescritos sobre `Hull` + `shaped.ts`, com os mesmos eixos, escapes, rodas,
pinturas e pincéis nomeados (`car-round`). Peças novas: `boxLamp` (lanterna retangular embutida: barras de moldura que saem 4,5 cm da pele, poço de
paredes escuras, lentes em leque 3 cm atrás da borda; no lod1 uma caixa só) e `lensRect` (lente plana em leque); o `Hull` ganhou `cabinBase`/`cabinEnd`
(a base do para-brisa acompanha o capô fundo entre para-lamas altos) e `ramp` (rampa do para-lama mais longa: a cunha de capô baixo subia o
para-lama dianteiro em 20 cm de z). O `render-harness` aceita `car=` também na corrida e na câmera de capô (para a folha de cada estilo).

| | △ casco antes → depois | lod1 | chamadas |
|---|---|---|---|
| wedge | 3.098 → **3.322** (+224) | 1.386 → 1.374 (**41%**) | iguais |
| hyper | 3.298 → **3.132** (−166) | 1.466 → 1.344 (**43%**) | iguais |

Áreas (m²; farol, lanterna, escamoteável, A, B, acento): wedge 0,254 · 0,340 · 0,554 · 2,549 · 0,343 · 0; hyper 0,024 · 0,176 · 0 · 2,091 · 0,332 ·
2,437 (o farol em fenda fica perto do piso do `car-round`, 0,0216).

**Testes** (`tests/estilo-carro-hct.test.ts`, era `estilo-carro-gt`; sondas em `tests/hct-probe.ts`): um bloco comum (vidro com caimento e escuro,
4 lentes de lanterna em leque com moldura ≥ 1 cm além da lente e ≥ 3 cm além da pele, faixa A de cima ≥ 75% e B de lado ≥ 80% subindo ≥ 12 cm, ≤ 4.200
△, lod1 ≤ 45% com luz e faixas) e a identidade de cada um (cunha reta, escamoteável rente, lâminas na frente da lanterna, entrada de ar; hipercarro
baixo de cabine avançada, farol em fenda, asa em cisne, 7 aletas). Vistos falhar nos modelos de antes: `Tests  8 failed | 22 passed (30)` — os que
passavam já nos velhos são guarda da identidade, não motor da mudança. Depois: 30/30; área (`tests/car-* estilo-carro* camera* stage-* cor-brilho
render-normals cosmetics* cars`): `Test Files  27 passed (27)` · `Tests  618 passed | 1 skipped (619)`; `tsc --noEmit` sem saída.

**Folhas** atual × novo, 7 vistas cada (as 6 do GT e, como os dois só têm um carro cada, a 7ª é a frente à noite — o escamoteável aceso da cunha):
`scratch/wh/folha-iara.png`, `scratch/wh/folha-pororoca.png`.

**O que falta**: a silhueta 2D (`icons.ts`) dos dois continua a velha; o para-lama dianteiro dos dois é alto (o pneu grande obriga a borda a
0,99 m) e lê mais "protótipo de Le Mans" que Countach; no lod1 do hipercarro o painel preto de trás (3 segmentos) não acompanha a planta redonda nos
cantos de baixo; na câmera de capô do hipercarro aparecem pedaços claros na borda de baixo (o vidro cortado da cabine em gota, a conferir); o farol em fenda quase não se vê à noite.
Nas capturas: 52 chamadas de dia e 55 à noite, iguais antes e depois.
