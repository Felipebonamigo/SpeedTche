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
