## V6c (etapa 1) — carros nacionais feitos no Blender por script: Cuiabano e Tupiniquim

> **Base:** `main` local bc19e78, branch `nc/nacionais`, worktree `/home/user/speedtche-wt/nacionais`, 16/10/2026. Pedido do dono: os carros nacionais têm de
> PARECER os arquétipos (ficha `docs/CARROS-NACIONAIS.md`), "um pouco mais realista que o Horizon Chase Turbo"; rota escolhida por ele: **Blender por script (`bpy`)**.
> Esta etapa prova a rota e entrega os 2 hatches livres. Núcleo (`hashRace`, `sim-golden`) intocado para os carros que já existem.
> **Teto de casco: 4.500 △** (`CAR_LIMITS.maxShellTriangles`; o pedido dizia 8.000, o coordenador corrigiu): lod0 ≤ 4.500, lod1 ≤ 45%. Nada subiu.
> Regra de marca da ficha vale: sem nome, logo, grade-assinatura nem desenho gráfico exato de farol/lanterna; a base é modelagem própria a partir de proporções.

### 1. A rota (`tools/blender/`, README lá)
- `bpy` 5.0.1 num venv fora do repositório (`python3.11 -m venv /home/user/venv-bpy && pip install bpy`, via proxy); roda com `python -I`, importa e exporta `.glb` sem janela. O Workbench e o EEVEE não abrem
  (sem `libEGL`/GPU): as prévias de iteração saem do **Cycles em CPU**; as imagens de aprovação saem do **jogo**.
- Receita: dado de projeto (`specs/<carro>.py`: estações em Y, curvas de perfil `floor/belt/top/hwb/hwl/hwr…`, janelas, eixos, contornos de farol e lanterna) → anel de 16 pontos por estação →
  malha quadrangular → **superfície de subdivisão** (nível 1, vincos na cintura, no friso do teto e nas estações do para-brisa/vidro de trás) → **vão de roda por booleana** exata no casco subdividido +
  `symmetrize` + calha escura do vão → **peças separadas**: `glass` (vidro metálico escuro), `lamp_head`, `lamp_tail`, `details` (grade lisa, entrada de ar, placas, frisos de porta, maçanetas, espelhos) —
  as luzes e frisos são remendos planos **projetados na pele** (`shrinkwrap`), com material próprio (`headlight`, `taillight`, `amber`, `trim`, `plate`) → 4 rodas de eixo em X (5–6 raios, prato, calota, `extras.spokes`) →
  `exhaust_l/r`, `seat`, `lod0`/`lod1` → `.glb`. Materiais pelo NOME do contrato (`docs/ARTE.md`): `paint` recebe a cor do carro, `headlight`/`taillight` acendem.
- **`npm run convert-car` não participa**: é o conversor do kit do Kenney (atlas/colormap). O `.glb` do Blender já sai no contrato e passa direto por `npm run check-car` e pelo carregador (`assets.ts`: `src/assets/cars/<id>.glb`).
- Silhueta: conferida contra o Cuiabano do projeto irmão **Detonauto** (`Tools/Blender/make_cuiabano.py`, de Felipe, commit 13cc970; cópia em `tools/blender/base/`, origem registrada em `docs/ARTE.md`):
  para-brisa a ~45°, teto curto, vidro de trás quase até a cauda, para-lamas separados. Aqui é cartum: rodas de raio 0,36 m (reais ~0,31 com a escala), cabine cheia, quinas arredondadas pela subdivisão.
- Dimensões (**estimativas** de dado público, marcadas nos specs; o carro do jogo é ~10% maior que o real para caber na pegada do núcleo): ver `specs/*.py` e `docs/ondas/V6c-passagem-detonauto.md` (tabela dos 12).

### 2. O que entrou
| Item | Cuiabano | Tupiniquim |
|---|---|---|
| desenho | caixa reta, teto reto, farol retangular fino, lanterna vertical de 3 cubos, barra escura lisa (sem grade), entrada de ar baixa, frisos de porta | compacto arredondado, teto com caimento, cintura que sobe para a coluna C + ranhura do vinco, faróis em cunha inclinados e afastados, lanterna alta em "L" invertido, fresta e entrada de ar |
| casco (`check-car`) | **3.104 △**, lod1 **752** (24%) | **2.824 △**, lod1 **710** (25%) |
| medidas | 4,30 × 1,98 (com os espelhos a 0,99 m) × 1,56 m; rodas r 0,36 | 4,28 × 1,98 × 1,58 m; rodas r 0,36 |
| eixos | z −1,34 / +1,38, x 0,79 (os do `hatch` procedural: o núcleo, os rastros e a chama não mudam) | idem |
| `CARS` (dado) | livre, `hatch`, `#f9d71c` + `#263238`, Vel. 288 km/h, acel. 780, freio 2.700, curvas 0,85, consumo 0,80 | livre, `hatch`, `#d84315` + `#eceff1`, 279 km/h, 860, 2.900, 0,95, 0,90 |
| textos / som | PT e EN em `src/i18n/core.ts`; timbre de motor e buzina próprios (`engine-timbre.ts`, `horn.ts`) | idem |
| licença | "Criação própria" em `docs/ARTE.md` (o `car-pipeline` aceita a expressão) | idem |

**Ligação ao jogo, sem mexer no núcleo:** `src/core/data/cars.ts` (dois carros livres depois do Boto Luxo: aparecem no seletor `←→`, no lobby e na garagem, "8/9" e "9/9"), textos, timbre e buzina. **A IA continua sorteando só os 7 livres de antes**
(`FORA_DA_IA`): o sorteio usa o tamanho do pool, e pôr carro novo nele mudaria toda corrida gravada (`sim-golden`, fantasmas) — decisão a confirmar com o dono. Save antigo abre igual (ids novos só somam). O `lapFingerprint` de
cada carro antigo não muda (depende só de constantes, física e atributos DELE e da pista); a impressão do online muda (a lista de carros entra nela): quem tem a versão antiga não entra na mesma sala (comportamento de sempre).

**Equilíbrio** (`npx tsx scripts/car-balance.ts`, 109 pistas, solo; relativo ao Falcão): Cuiabano **0,9883**, Tupiniquim **0,9934** (Tornado 0,9864, Saci 0,9931, Boto 0,9976); nenhum domina nem é inútil
(`tests/cars.test.ts`, as três travas de equilíbrio, verdes com os dois). Corrida média: Cuiabano 236,9 s, Tupiniquim 237,7 s.

**Custo no gate** (`node tools/blender/medir.mjs tornado cuiabano tupiniquim`; jogador 1 troca de carro, o resto igual; harness `q=high`, swiftshader):
| cena | Tornado (procedural) | Cuiabano | Tupiniquim |
|---|---|---|---|
| copa-4p | 221 chamadas · 645.011 △ | 221 · 646.339 (**+1.328**) | 221 · 644.571 (**−440**) |
| sampa-4p | 217 · 781.204 △ | 217 · 782.532 (**+1.328**) | 217 · 780.764 (**−440**) |

As chamadas não sobem (cada carro de arte é um lote, como o Tornado); o pior caso (4 jogadores, os 4 no Cuiabano) soma ~+4.000 △ sobre ~645 mil (0,6%). **Não é preciso subir o teto de 4.500 △ nem o gate.**
Observação: o harness conta mais △ que os números do cartão do GT (que usam o gate com a configuração própria); a diferença entre carros é o que vale aqui.

### 3. Testes ANTES do código, vistos falhar pelo motivo certo
`tests/carros-nacionais.test.ts` (novo; asset, marca e ligação):
- 1ª execução, sem `.glb` nem carros: `Tests  3 failed | 12 skipped (15)` — `falta src/assets/cars/cuiabano.glb (npm run carros-blender)` (o `beforeAll` do asset), `expected [ 'falcao', … ] to deeply equal [ …, 'cuiabano', 'tupiniquim' ]`
  (livres e `FORA_DA_IA`) e `pt cuiabano: expected 'car.cuiabano.blurb' not to be 'car.cuiabano.blurb'` (texto). Os 12 pulados são os do asset (dependem do `beforeAll`).
- Com os `.glb` do 1º passe, falharam por motivos verdadeiros: `casco dentro da roda: expected 0.3376 to be greater than 0.3564` (o corte do vão de roda começava 1,5 cm depois da face de dentro do pneu → corrigido no cilindro do corte),
  `expected 0.0192 to be less than 0.01` (simetria: a booleana e a triangulação saíam diferentes de cada lado → `symmetrize` no casco e remendos espelhados por MALHA, não por contorno) e a varredura de marca. **Ajustes de teste (de propósito, ditos):** (1) o padrão de marca
  estava sem `\b` final e olhava o binário do `.glb` (pegava bytes soltos): passou a `\b(gol|palio|…)\b` sobre o JSON do glTF (nós, malhas, materiais) e sobre `tools/blender/`; (2) a contagem de "para-lama sobre a roda" olhava só a faixa do pneu e a calha fica
  fora dela: passou a olhar ±20 cm; (3) as chaves de texto são `core.car.<id>.blurb` (como o resto). Os testes de equilíbrio e de contagem de outros arquivos (14 → 16 carros, 7 → 9 livres) foram atualizados junto, de propósito: `cars`, `career`, `progression`, `voice-engine`, `voice-horn`, `garage-stage`, `car-pipeline` (a regra de licença aceita "Criação própria").
- Outras falhas vistas e corrigidas: `determinism` (`Set(` proibido no núcleo → lista), blurb > 80 caracteres (`cars.test`), `car-pipeline` sem a linha de licença.
- O contrato testado: orçamento (2.500 < △ ≤ 4.500, lod1 ≤ 45%), eixos iguais aos do `hatch`, vão de roda (nenhum vértice do casco dentro do pneu; casco por cima da roda), simetria esquerda × direita (< 1% de vértices sem par a 5 mm), partes separadas e materiais (`paint glass headlight taillight trim bumper tire rim`, nós `lod0 lod1 wheel_* exhaust_* seat`, peças `glass`/`lamp_head`/`lamp_tail`), marca.

### 4. Verificação (esta sessão)
- `npx tsc --noEmit -p .`: sem saída.
- `npx vitest run tests/car-*.test.ts tests/cars.test.ts tests/estilo-carro*.test.ts tests/garage-stage.test.ts tests/stage-*.test.ts tests/carros-nacionais.test.ts tests/voice-*.test.ts tests/career.test.ts tests/progression.test.ts tests/cadeado.test.ts tests/online-cars.test.ts tests/i18n.test.ts tests/determinism.test.ts tests/sim-golden.test.ts tests/cosmetics.test.ts tests/progresso-telas.test.ts tests/cameras*.test.ts tests/cor-brilho.test.ts --testTimeout=600000`:
  `Test Files  38 passed (38)` · `Tests  726 passed | 1 skipped (727)` (o pulado é o de sempre). `NC_REQUIRE_GL=1 npx vitest run tests/gl-render.test.ts tests/stage-gl.test.ts --testTimeout=3000000 --hookTimeout=1500000`: `Test Files  2 passed (2)` · `Tests  25 passed (25)` (o gate de contagem passou).
- A suíte inteira NÃO foi rodada (máquina de 4 núcleos com carga alta; ordem do coordenador).

### 5. Imagens para o dono (todas abertas e conferidas), em `scratch/nacionais/` (fora do git)
`folha-cuiabano.png` e `folha-tupiniquim.png` (3/4 frente, 3/4 traseira, lateral, frente, traseira, câmera de corrida de dia, noite com freio, garagem; Copacabana `seg=300`, 1280×720, Alta),
`folha-cuiabano-x-tupiniquim-x-tornado.png` (os dois × o hatch atual), `folha-detonauto-x-speedtche.png` (Cuiabano: **Detonauto realista × Speed Tchê cartoon × Speed Tchê realista**, prévia do Blender/Cycles). As fotos soltas (`<carro>-front34.png`…) estão na mesma pasta.
Para o "real" não se baixou foto nenhuma. **Proporções-alvo usadas** (texto, no lugar da foto): hatch dos anos 90–2000 de caixa reta — comprimento ~3,9 m, largura ~1,65 m, altura ~1,42 m, entre-eixos ~2,4 m, capô curto e baixo, para-brisa a ~45°,
teto reto até ~0,5 m da cauda, vidro de trás quase vertical, lanterna vertical (Cuiabano); compacto arredondado de ~3,75 m, cintura que sobe para trás, lanterna alta (Tupiniquim). Tudo × ~1,10 na escala do jogo.

### 6. O que ainda não está no nível (honesto, para o dono julgar jogando)
- **Reconhecível como hatch quadrado/compacto à primeira vista: sim; "mais bem desenhado que o GT novo em acabamento": ainda não.** O Tornado procedural tem aerofólio, faixas e mais peças; os dois nacionais estão limpos e planos (3.100 △ contra o teto de 4.500).
  Há ~1.400 △ de folga para detalhe (calotas, espelhos com carcaça, para-choque com lâmina, friso cromado, faixa de acento).
- **Faróis**: remendos planos projetados: no canto do Tupiniquim o farol em cunha lê como "seta branca" de lado; vale desenhar a carcaça e o refletor.
- **Janelas**: vidro liso e metálico, sem borracha; colunas B em preto, A e C na cor do carro.
- **Rodas**: 5–6 raios de cartum, sem aro com lábio nem pinça; a `sport5` do GT segue sendo a melhor roda do jogo.
- A silhueta 2D dos menus (`icons.ts`) é a do `hatch` genérico (não refeita para os dois).
- Um carro a mais no pool da IA muda as corridas gravadas; fica de fora até o dono decidir (`FORA_DA_IA`).

### 7. Acervo (`Felipebonamigo/acervo-3d`) — NÃO feito, instrução para o dono
Os dois `.glb` são criação própria e só servem a outros jogos do estúdio se o estilo servir (cartum, hatch). Se quiser: copiar `src/assets/cars/cuiabano.glb` e `tupiniquim.glb` para `carros/proprio/`, linhas no `catalogo.csv`
(`arquivo,categoria=carro,titulo,fonte=Speed Tche (script Blender),autor=Felipe Bonamigo,licenca=propria,url=,usado_em=Speed Tche`) e a linha na aba "Modelos 3D" do doc do estúdio. O gerador (`tools/blender/`) é o que vale mais: serve também ao Detonauto
(`docs/ondas/V6c-passagem-detonauto.md`). Sem push feito.

### 8. Commits (em `nc/nacionais`, nada empurrado)
Ver `git log` do branch; o trabalho fecha com este cartão e a passagem para o Detonauto.

## Rodada 2 (16/10/2026) — "mais bem desenhados": o detalhe que lê de longe

Parecer do coordenador/dono sobre a 1ª folha: reconhecível, mas plano e sem charme. Mesmas regras (teto 4.500 △, lod1 ≤ 45%, marca, sem push, sem suíte inteira).

**O que mudou** (`tools/blender/`; os dois carros regenerados por `npm run carros-blender`):
- **Faróis em camadas** (`lamp_stack`): caixa escura, aro claro, refletor, coroa da lente e miolo — a coroa é o material `headlight_dim` (emissivo 0,45) e o miolo o `headlight` (1,0), como a lente do GT que vai do miolo à borda.
  **Lanternas**: moldura + coroa `taillight_dim` + miolo `taillight` em cada cubo do Cuiabano e no "L" do Tupiniquim. O farol em cunha do Tupiniquim agora fica INTEIRO na face da frente (antes dobrava o canto e lia como "seta branca").
- **Para-choques com volume** (banda `bumper` 2,2 cm acima da pele, com friso claro `chrome`, entrada de ar e placa mais altas), **friso da cintura**, **soleira**, **alargamento dos para-lamas** (anel de plástico sobre cada vão), tampa de combustível, marcador âmbar,
  vinco da tampa traseira, maçanetas com volume, espelhos com pedestal, **ponteiras de escapamento** cromadas.
- **Personalidade**: teto +4 cm (1,60 e 1,63 m no total), roda de raio 0,375 m (era 0,36), vincos de caixa no teto e no capô (vinco 1,0 no friso do teto e no ombro).
- **Faixas do projeto**: o Cuiabano leva a **faixa A** (`stripe_a`, friso lateral na porta, cor de destaque `#263238`); o Tupiniquim leva a **faixa B** (`stripe_b`, o vinco que sobe à coluna C, destaque `#eceff1`). O jogo as aplica sozinho (o `.glb` de um carro decide as próprias faixas: `liveries` vêm das camadas que a malha tem).
- **Cor**: o amarelo do Cuiabano lia verde-oliva; `#f9d71c` → `#ffc400` (lê amarelo-ouro de 3/4 e de lado; de trás, na sombra da pista, ainda escurece). `carPaintHold` não existe neste branch (só no do GT): ajuste feito por captura.
- **Roda do projeto, não roda própria** (novo): o nó `wheel_fr` leva `extras.project_wheel`; `gltf.ts` então NÃO monta `wheelModel` do arquivo e o renderizador usa o catálogo do estilo (`WHEEL_LISTS.hatch`, 10 raios) — acompanha a roda nova do GT quando o `nc/gt-hct` entrar, e a escolha de roda do jogador vale nos dois carros. Sem a marca, vale a roda do arquivo (Kenney).
- **Silhueta 2D dos menus**: `icons.ts` ganhou `CAR_SHAPES` (por id do carro, antes do estilo), **gerada do casco** por `tools/blender/silhueta.py` (perfil do teto, vidros, rodas e portas saem do spec; nada desenhado à mão).

**Números**: casco Cuiabano **4.348 △** (era 3.104), Tupiniquim **3.912 △** (era 2.824); lod1 752 e 716 (≤ 45%). O Cuiabano está a 152 △ do teto: a próxima rodada de detalhe precisa de poda, não de teto novo. Custo no gate remedido (`node tools/blender/medir.mjs`, jogador 1 troca de carro): copa-4p 221 chamadas em todos; △ Tornado 645.011 → Cuiabano 647.323 (**+2.312**) e Tupiniquim 646.451 (**+1.440**); sampa-4p 217 chamadas; 781.204 → 783.516 (+2.312) e 782.644 (+1.440).
`NC_REQUIRE_GL=1 npx vitest run tests/gl-render.test.ts tests/stage-gl.test.ts --testTimeout=3000000 --hookTimeout=1500000`: `Test Files  2 passed (2)` · `Tests  25 passed (25)` (o gate de contagem passou).

**Testes antes** (`tests/carros-nacionais.test.ts`, vistos falhar): `Tests  3 failed | 15 passed (18)` — `a folga do orçamento tem de virar detalhe: expected 3104 to be greater than 3600` (e 2824, os dois), e a silhueta `expected '<svg …' not to be '<svg …'` (era a do hatch). Depois de implementar,
o Tupiniquim (3.496) ainda reprovava o piso de 3.600 e ganhou mais detalhe (não se afrouxou o teste): `Tests  48 passed | 1 skipped (49)` nos três arquivos de carro. Teste novo da rodada: coroa+miolo (≥ 2 materiais `taillight*` e `headlight*`), faixa do projeto (`stripe_a|b` e `liveries[0] ≠ 0`), roda do projeto (`wheelModel` indefinido).
Área: `Test Files  24 passed (24)` · `Tests  469 passed | 1 skipped (470)`; `tsc --noEmit -p .` sem saída.

**Imagens** (`scratch/nacionais/`): `folha-cuiabano.png`, `folha-tupiniquim.png` (8 vistas cada), `folha-cuiabano-x-tupiniquim-x-tornado-x-gt.png` (3/4 frente, 3/4 trás e corrida; Falcão GT como régua), `folha-detonauto-x-speedtche.png` (Detonauto realista × cartoon × realista;
o realista do Speed Tchê tem agora 12.724 △).

**Ainda abaixo do GT/Tornado** (honesto): a pintura é lisa (sem a lente translúcida nem o brilho do verniz do GT novo); as ponteiras do escape ficam brancas e salientes demais; o vidro continua sem borracha desenhada; faixa e frisos são remendos planos (não relevo); o
Cuiabano visto de trás na sombra ainda escurece o amarelo. O que falta para parecer feito "à mão" é modelagem de relevo (nervuras, caixa de farol embutida no casco), não só remendos: pede espaço de △ que o teto de 4.500 não dá.

## Lote 2 (17/10/2026) — Caipora, Pampeiro, Barão (à venda) e Furgãozinho da Firma (conquista)

> **Base:** `main` local 803dabe (já com o GT realista: roda nova, vidro, lanterna, `carPaintHold`). Mesmas regras: teto 4.500 △ (lod1 ≤ 45%), marca da ficha, sem push, sem suíte inteira, **nenhum entra no sorteio da IA** (`FORA_DA_IA`).
> O worktree é o `nc/nacionais`; o commit do lote é `5e307cb` (+ o do cartão e das cores, abaixo no `git log`).

### 1. Os quatro carros (`tools/blender/specs/`, `npm run carros-blender`, mesma biblioteca `carlib.py`)
| Carro | Estilo | Entra | Preço | Casco | lod1 | Desenho (o que lê de longe; nada de marca) |
|---|---|---|---|---|---|---|
| **Caipora** | `hatch` | à venda | $ 9.000 | **4.118 △** | 784 | corpo redondo (teto abaulado, ombro cheio), farol e lanterna **em gota**, para-choque com faixa lisa na cor de destaque (faixa A), vidro de trás inclinado |
| **Pampeiro** | `hatch` | à venda | $ 13.000 (a ficha dizia 12 mil: o Curupira S já custa 12 e o preço é único por teste) | **3.826 △** | 700 | mais largo e baixo, **farol alongado que sobe pelo canto até o para-lama** (peça frontal + peça lateral), teto com leve caimento, grade baixa de uma barra só, faixa B fina |
| **Barão** | `sedan` | à venda | $ 14.000 | **4.236 △** | 751 | três volumes, **porta-malas alto** com deque, **lanterna de ponta a ponta** (duas lentes com friso cromado no meio), faixa lateral fina (faixa A), 4 portas |
| **Furgãozinho da Firma** | `micro` | **conquista** | nominal $ 39.000 (nunca cobrado) | **4.392 △** | 772 | micro quadrado e alto, **escada de alumínio sobre o bagageiro** que passa da traseira, **adesivo fictício** na porta (placa branca, tarja e duas linhas de "texto": nenhum logo, nome, telefone ou marca real), lanterna vertical estreita |
Todos: aprovados no `npm run check-car` (eixos e bitola iguais aos do estilo; roda do projeto, `project_wheel`), rodas do estilo pelo catálogo (`hubcap` no sedã, `multi` nos hatches e no micro), nó de escapamento e `seat`, material por papel.
Nenhum passou do teto, então **nada a propor sobre o limite**: o Furgão é o mais carregado (a escada e o bagageiro custam 180 △: 15 caixas de 12); o Caipora precisou de poda (4.544 → 4.124, camadas do farol sem cortes extras) para caber.

### 2. Loja, preço, equilíbrio e a IA
- **Loja da Expedição**: Caipora, Pampeiro e Barão entram na Concessionária em ordem de preço (Caipora 9.000, Curupira S 12.000, Pampeiro 13.000, Barão 14.000, Sucuri E 16.000…), com a revelação de sempre; o de conquista **não aparece** (`dealer` filtra `conquest`), `buyCar` o recusa (`'unknown'`) e a meta "junte para comprar" (`goals.ts`) nunca o sugere.
- **Números** (`npx tsx scripts/car-balance.ts`, 109 pistas, tempo relativo ao Falcão): Pampeiro **0,9495**, Barão **0,9585**, Caipora **0,9887**, Furgão **0,9925**. Pampeiro: 2º melhor freio (3.100) × arrancada fraca e sede (0,88); Barão: a maior reta dos baratos (321 km/h) × arrancada 640, freio 2.350 e curva 0,68; Caipora: o mais econômico à venda (0,52) e curva fácil × a menor reta (282);
  Furgão: o melhor freio do jogo (3.150) × a menor reta (279). As travas de equilíbrio de `tests/cars.test.ts` e `tests/career.test.ts` (cada carro à venda vence um livre em algum atributo e perde em outro; nenhum domina nem é inútil) seguem verdes; o carro de conquista fica fora dos duelos de preço por não ter preço de verdade (`DUELISTS`).
- **A IA continua com os 7 livres de antes** (`FORA_DA_IA`; sorteio, `sim-golden` e fantasmas intactos, `tests/sim-golden` verde). Carro novo só aparece em corrida se um humano o escolher.

### 3. A conquista "Hora de entrega" e o carro dela (save aditivo, sem campo novo)
- **Regra implementada: 10 vitórias sem comprar nenhum carro** (`totals.wins ≥ 10` e nenhum carro COMPRADO em `carsUnlocked`; o próprio Furgão, quando liberado, não conta como compra). Sai no fim da corrida (como a `DEZ_VITORIAS`) e na abertura do jogo para quem já está nesse estado.
  **A alternativa da ficha ("5 vitórias seguidas no Saci Mirim") NÃO foi feita**: pede um contador de sequência por carro que o save de hoje não tem, e a ordem era não mexer no save. Se o dono quiser, é um campo `stats.streaks` aditivo (valor padrão vazio) — decisão dele.
- **Carro de conquista** (`CarDef.conquest = 'HORA_DE_ENTREGA'`, `price` nominal > 0 só para o carro nascer trancado): `carAvailable` o libera quando o save tem a conquista (corrida avulsa, torneio, online); `syncConquestCars` (idempotente; no fim da corrida, na abertura e na abertura da garagem) soma o id a `carsUnlocked` e à garagem de todo piloto da Expedição.
  Antes da conquista o lobby mostra o cadeado com **"Conquista "Hora de entrega": 10 vitórias sem comprar carro"** (em vez de "Compre na Expedição por $ X"). `CARRO_NOVO` e `COLECIONADOR` ignoram o de conquista (um não vira o outro sem querer).
- Entra na lista da Steam (`ACHIEVEMENTS`, 67 → **68**; `desktop/README.md`, textos PT e EN em `src/stats/strings.ts`).
- **Buzina** do Furgão: a mais fraca do jogo (ganho 0,35: um "fon-fon" curto de onda quadrada, 349/440 Hz). Timbre de motor próprio (agudo, áspero, ronco rápido) e, para os outros três, timbre e buzina próprios (`engine-timbre.ts`, `horn.ts`).

### 4. A escada que balança e cai no nitro — sem chamada de desenho nova
- O vértice da escada (material `ladder`) leva um marcador em `aPaint.w = 0,5` (o farol escamoteável usa 1: o shader passou a `step(0,9, w)` para ele); o movimento sai de bits altos de `instExtra.w` da MESMA instância do casco (bits 15–21: lado em 4 bits com sinal, escorregão em 3), calculados por uma mola pura (`src/render/cars/ladder.ts`) a partir do rolamento do carro (curva) e do nitro.
  Na curva ela acompanha o rolamento e **balança** (mola sub-amortecida, até 7 cm); no nitro **escorrega 30 cm para trás** e volta devagar; com "Reduzir efeitos" fica quieta. A chave do programa do carro subiu para `speed-tche-car-v8`. Nenhum lote novo, nenhuma chamada nova, nenhum outro carro muda (vértice sem marcador = deslocamento zero).
- Visto na captura `furgao-corrida-nitro.png`: a escada pendurada na ponta do teto com o nitro aceso. O balanço na curva está coberto pelo teste da mola (a captura é de um quadro só).

### 5. Testes antes (vistos falhar) e verificação
- `tests/carros-conquista.test.ts` (novo): `Tests  7 failed | 3 passed (10)` — `buyCar` devolvia 'ok' para o furgão (`expected 'ok' not to be 'ok'`), a conquista não estava na lista (`expected [ 'PRIMEIRA_VITORIA', …(66) ] to include 'HORA_DE_ENTREGA'`), `carAvailable` trancado (`expected false to be true`), `syncConquestCars` inexistente e as 10 vitórias não davam a conquista (`expected [ 'PRIMEIRA_CORRIDA', 'DEZ_VITORIAS' ] to include 'HORA_DE_ENTREGA'`; `CARRO_NOVO` aparecia com o furgão liberado). Os 3 verdes eram travas (loja, IA, save antigo).
- `tests/escada-do-furgao.test.ts` (novo): `Error: Cannot find module '../src/render/cars/ladder'` (a mola não existia); depois de implementar, uma falha de teste minha (a quantização de 3 bits: 0,5 → 0,571) virou valores na grade de 1/7 — ajuste de teste, dito.
- `tests/carros-nacionais.test.ts` generalizado para os 6 carros (estilo certo, eixos do estilo, comprimento, vão de roda, simetria, partes, marca, detalhe e silhueta): a silhueta dos 4 novos reprovava (`caipora: expected '<svg …' not to be '<svg …'`) até `CAR_SHAPES` ser gerado do casco (`tools/blender/silhueta.py`).
- Ajustes de teste de propósito, de outros arquivos: 16 → 20 carros, 9 livres + 11 de preço, conquistas 67 → 68, a vitrine começa em $ 9 mil (4 arquivos de teste), a vitrine tem 10 carros (sem o de conquista), `car-material` v7 → v8, `cadeado` (depois do Curupira S vem o Pampeiro), `goals` (a coleção ignora o de conquista),
  `car-models` (o estilo `sedan` agora tem 2 carros e o 2º, o Barão, tem arquivo próprio com a faixa dele: o teste "dois carros do mesmo estilo nunca saem com a mesma pintura" pula o sedã, e a lista de pinturas do sedã procedural ficou `[0, 0, B, A]` para o estilo não exigir faixa B dos arquivos de caixas dos testes de contrato), e o piso de △ de detalhe.
- `npx tsc --noEmit -p .`: sem saída. Área (57 arquivos, `car-*`, `cars`, `estilo-carro*`, `stage-*`, `garage-stage`, `carros-*`, `escada-do-furgao`, `voice-*`, `career*`, `progress*`, `cadeado`, `online-cars`, `i18n`, `determinism`, `sim-golden`, `cosmetics`, `paint`, `achievements-o5`, `stats`, `goals`, `desktop*`, `save*`, `lobby*`, `expedi*`): `Test Files  57 passed (57)` · `Tests  979 passed | 1 skipped (980)`.
  `NC_REQUIRE_GL=1 gl-render` + `stage-gl`: `Test Files  2 passed (2)` · `Tests  25 passed (25)` (o gate de contagem passou).

### 6. Custo no gate (`node tools/blender/medir.mjs`; jogador 1 troca de carro, o resto igual; △ sobre o Tornado procedural)
| cena | Tornado | Caipora | Pampeiro | Barão | Furgão | (Cuiabano) |
|---|---|---|---|---|---|---|
| copa-4p | 645.563 △ · 221 chamadas | +1.852 | +1.268 | +1.960 | +2.272 | +2.312 |
| sampa-4p | 781.756 △ · 217 chamadas | +1.852 | +1.268 | +1.960 | +2.272 | +2.312 |
**Chamadas iguais em todos.** O custo só existe com o carro NA TELA (de perto, lod0; longe, o lod1 de ~700–780 △ é mais barato que o do procedural). O gate (`gl-render`) usa os carros padrão da cena (Falcão, Trovão, Tornado, Camelo), então ele não muda: passou.
**Pior caso real**: 4 jogadores, os 4 num Furgão, todos de perto, sobem ~ +9.100 △ em Sampa 4p (1,2% dos ~782 mil medidos aqui); como o gate de Sampa 4p **Média** tem só ~184 △ de folga, esse caso passaria do limite provisório. Proposta (não feita: não mexi no gate): ou subir o teto de Sampa 4p Média em ~10 mil △ (explicado no cartão do gate), ou poda de ~700 △ no Furgão e no Barão (calotas, soleira e friso cromado saem do lod0 de perto) — decisão do dono.

### 7. Imagens (em `scratch/lote2/`, fora do git; abertas e conferidas)
`folha-caipora.png`, `folha-pampeiro.png`, `folha-barao.png`, `folha-furgao.png` (8 vistas cada; o Furgão tem a 9ª, `furgao-corrida-nitro.png`) · `folha-comparacao-A-hatches.png` (Caipora × Pampeiro × Tornado × Falcão GT realista) · `folha-comparacao-B-sedan-micro.png` (Barão × Furgão × Camelo X × Saci Mirim). Como a garagem só mostra carro do piloto, a captura põe o carro à venda/de conquista na garagem do P1 (`capturar.mjs`).
Cores: Pampeiro `#cfd8dc` (era `#8e9aaf`: lia cinza chumbo) e Barão `#a1887f` (era `#5d4037`: lia preto) foram trocadas por captura; o Caipora é verde `#43a047` com faixa `#fff59d`; o Furgão branco `#f5f5f5` com detalhe azul `#1565c0`.

### 8. O que ainda não está bom (honesto)
- Os quatro leem como o arquétipo à primeira vista (hatch redondo, hatch europeu baixo, sedã de porta-malas alto, furgão com escada), **mas continuam mais lisos que o Tornado e o Falcão GT**: sem a lente translúcida, sem o verniz do GT, frisos e faixas como remendo plano. O teto de 4.500 △ já está quase cheio (Furgão 4.392, Caipora 4.118): mais charme pede poda, não teto.
- Barão e Furgão visto de lado são os mais "chapados" (uma só tinta). O adesivo do Furgão é uma placa com três barras, não texto: de propósito (sem nada que se leia como marca).
- A conquista da sequência no Saci Mirim não foi feita (item 3). O Furgão (0,9925 do Falcão) anda entre o Caipora e o Saci Mirim: nada de brinde lento.
- Acervo `acervo-3d`: **sem push**; instrução do item 7 do lote 1 vale também para os quatro novos `.glb`.
