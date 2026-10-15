## V4 — Pistas com acabamento (auditoria de 14/10/2026)

> **Base conferida:** `main` 550e970 (cor e brilho, câmeras FOV 54, menu novo), branch `nc/pistas`, worktree `/home/user/speedtche-wt/pistas`, 15/10/2026.
> **Arquitetural** (muda o visual de toda pista: asfalto, zebras, céu, mar e prédios das 109), **só render**: `src/core`, `hashRace` e `sim-golden` não mudam;
> carros (`src/render/cars/**`, frente V2) e HUD (`hud*`, frente V5) ficam de fora. Cartão escrito e commitado **antes** do código; o registro vai na §8.
> Pedido do dono (topo de `docs/DIRECAO-DE-ARTE.md`): "um pouco mais realista que o Horizon Chase Turbo, e mais bonito que ele". A auditoria viu:
> asfalto de cor lisa, zebras e faixas pouco nítidas, o mesmo prédio repetido em Copacabana (e fachadas iguais em Sampa), poucas nuvens sem forma
> pintada, água pouco saturada. O quadro-alvo (`nc/estilo-carros:docs/ondas/quadro-alvo.md`): "nuvens pintadas numerosas, água azul saturada em faixa
> larga, pista/zebras desenhadas à mão (ruído de grão não é textura)".

### 1. Design em duas frases

Cinco entregas, cada uma por dado e textura, sem chamada de desenho nova: (1) o asfalto vira uma textura de **agregado** com desgaste (trilhas de pneu
lisas e escuras, gota de óleo no meio da faixa, remendos com borda selada, juntas e trincas seladas), pintada em pixels puros (testável no Node) e com a
mesma densidade de texel ao longo e através (hoje 18 × 85 px/m: o mipmap escolhe o nível pelo eixo comprido e borra as faixas); (2) faixas e zebras
mais largas, de borda limpa, densidade isotrópica e anisotropia por qualidade; (3) prédios com **4 visuais por estilo** (janela, varanda, cor, térreo)
escolhidos por hash da posição na pista, num **atlas 2×2** da fachada (mesmo material, mesmo lote, mesma pegada); (4) **nuvens pintadas** como
impostores com normal pintada (uma malha, ~2 triângulos por nuvem, luz do período no shader), numerosas e na faixa do céu que a câmera vê; (5) **mar**
mais saturado e vivo (menos céu e névoa no raso, brilho do sol com cintilação, espuma com ondas que chegam), tudo pela paleta do período.

### 2. Levantamento (arquivo:símbolo, conferido no 550e970)

| Onde | Fato |
|---|---|
| `road-textures.ts:paintAsphalt` | 256 × 2048 px para 14 m × 24 m: **18,3 px/m através × 85,3 px/m ao longo** (4,7× anisotrópico). Trilhas de pneu a 0,86 × alfa 0,55, remendos a 2,5–3,5% de alfa, granulado ±10: na captura, cor lisa. Faixa de bordo 0,25 m (4,6 px), tracejado 0,2 m × 3 m a cada 8 m. Pintura por canvas 2D (gradiente/fillRect): no Node (canvas falso) não há pixel para medir. |
| `road-textures.ts:paintKerb` | 32 × 128 px para 1,22 m × 2 m (26 × 64 px/m, 2,4×); blocos de 1 m: de longe viram rosa. |
| `renderer.ts:100` | `new Road(MAX_POINTS, Math.min(8, maxAniso))`: anisotropia 8 em todo degrau. Conta de pé: câmera a 2,5 m, FOV 54, 720 px; a 60 m o pixel cobre 0,085 m através e 2,04 m ao longo — hoje 174 texels ao longo → nível de mip 4,4 → a faixa de 4,6 px vira 0,2 texel (borrão). |
| `sky.ts:buildClouds` | 9 cúmulos (raio 760–1080 m, altura 190–360 m = **10°–25° de elevação**) + 6 faixas; ~20 mil triângulos (icosaedros). Com a câmera Alta o céu visível vai de 0° a ~18°: quase tudo fica acima do quadro; em média 2 cúmulos num campo de 85°. O shader derrete a nuvem na cor do horizonte até 11° (`smoothstep(0, 0.2, v.y)`). |
| `terrain.ts:SEA_FRAG` | O mar só existe no bioma `coast`. Céu refletido até `seaSky` (0,5 de dia) no ângulo raso com `uSky` = meio do céu × horizonte (claro), névoa do mar a 0,7: a água longe sai turquesa-acinzentada. Espuma: uma faixa que vai e volta (`FOAM_FRAG`). As cores de água dos 6 biomas são dado da paleta (`waterDeep/waterShallow`). |
| `scenery/textures.ts:facadeTextures` | Uma textura 256² por estilo (4 × 4 janelas), `RepeatWrapping`; os marcos (`landmarks/*`) também usam as fachadas com uv em metros (até ~16 repetições). |
| `scenery/catalog.ts:buildingId` | O id é `bld:<tipo>:<andares>:<semente>` e a semente sai da variante do sprite do núcleo: **Copacabana tem 225 prédios em 12 ids** (`aptbeach:*:{0,2,5}` e `glass:*:2`: 3 desenhos de orla, tintas branco/gelo/creme), **Sampa 902 em 12** (`apt:*:{0,4}` → a mesma tinta `#f2efe8`; `brick:*:1`; `glass:*:2`). |
| `scenery/runtime.ts` | Um `BatchedMesh` por material (`office/apartment/classic/house` = 4 lotes): modelo novo no mesmo material é geometria nova no MESMO lote (memória, não chamada). |
| `scenery/layout.ts:placeSprites` | Prédio: `vis.models[0].id` decide `modelFrontX`, `modelBounds` (grade `block` da visada dos marcos, com a altura) e a ocupação. |
| Gate (`src/bench/gate.ts`) | copa Alta: 84 chamadas, 340 mil △ de limite (medido ~310 mil); Sampa 4p Alta 380 mil. As nuvens de hoje somam ~20 mil △ por viewport. |

### 3. Arquivos

| Arquivo | O que muda |
|---|---|
| `src/render/road-textures.ts` | `asphaltImage(p)` (pixels puros: agregado, trilhas, óleo, remendos, juntas, faixas com borda suave) e `kerbImage(p)`; tamanhos e marcações exportados (`ASPHALT_TEX`, `MARKINGS`, `KERB_TEX`); `paintAsphalt`/`paintKerb` só copiam os pixels para o canvas. Período de 48 m (remendo não se repete a cada 24 m), 512 × 2048 px. |
| `src/render/road.ts` | `setQuality(q)`: anisotropia 4/8/16 (Baixa/Média/Alta+), sem programa novo; o resto como está (a mistura da M6 e os uniformes fixos da T2 ficam). |
| `src/render/renderer.ts` | Uma linha: `road.setQuality(q)` em `ensureQuality`. |
| `src/render/sky.ts` | Nuvens: `cloudLayout(q)` (puro) + `cloudAtlas()` (normal, cobertura e oclusão pintadas em canvas) + impostores numa malha só; shader com 3 tons pela luz do período, barriga, oclusão, borda acesa contra o sol; some no anoitecer pela luz. |
| `src/render/terrain.ts` | `seaLook(p)` (puro: os uniformes do mar) e `seaApparent(look, d)` (a cor que o shader dá na água longe, para o teste); shader: menos céu e névoa, cintilação, onda de espuma chegando. |
| `src/render/scenery/textures.ts` | Fachada em atlas 2×2 (célula 0 = a de hoje, os marcos não mudam). |
| `src/render/scenery/structures.ts` | `look` (0–3) nos prédios de cidade e orla: célula do atlas na uv, tinta, varanda, térreo; mesma pegada e mesma altura. |
| `src/render/scenery/catalog.ts` | O id do prédio ganha o 5º campo `look`; `facadeLookOf(id)`. |
| `src/render/scenery/layout.ts` | O `look` do prédio sai de `hash2(segmento, lado)` (determinístico); `block`/ocupação pela pegada (igual nos 4). |
| `src/render/scenery/runtime.ts` | O material de fachada amostra o atlas com `fract` e `textureGrad` (chave de programa própria; compila na carga, como hoje). |

**Não toco:** `src/core/**`, `src/render/cars/**`, `src/render/hud*`, `palette.ts` (as cores de água já são saturadas: o lavado é do shader), marcos.

### 4. Testes a escrever ANTES (e ver falhar pelo motivo certo)

| Arquivo | Teste | Falha hoje por |
|---|---|---|
| `tests/pistas-v4.test.ts` | **Faixas e zebras:** densidade de texel do asfalto e da zebra através ÷ ao longo entre 0,75 e 1,35 (lida do canvas que `paintAsphalt`/`paintKerb` criam) | 18,3 ÷ 85,3 = 0,21 e 26 ÷ 64 = 0,41 |
| idem | **Faixas:** a faixa de bordo e o tracejado ≥ 8 texels de largura, e a 60 m (câmera Alta, anisotropia da Alta) a faixa ainda cobre ≥ 1,5 texel no nível de mip escolhido; bloco de zebra ≥ 1,5 m | `MARKINGS` não existe (com a cópia do 550e970 + as exportações: 4,6 texels, 0,2 texel a 60 m, bloco 1 m) |
| idem | **Asfalto** (`asphaltImage`): agregado (desvio da luma fina ≥ 3%), trilhas de pneu ≥ 6% mais escuras que o meio da faixa, ≥ 2 remendos com borda, ≥ 1 junta, faixa × asfalto com contraste ≥ 0,45 (a régua de `render-ground`), mesma imagem nas duas pontas da mistura (só a cor muda) | `asphaltImage` não existe; medido no Chromium no 550e970 (§8) |
| idem | **Fachadas:** em Copacabana e em Sampa, cada estilo tem ≥ 4 visuais (célula do atlas lida da uv da geometria de verdade) e toda janela de 80 segmentos com ≥ 4 prédios mostra ≥ 3 visuais distintos; o visual é função da posição (mesmo layout duas vezes = mesmo id); os 4 visuais de um id têm a MESMA pegada e altura (±1 cm) e o mesmo material (lote) | 1 visual por estilo (a célula é 0 em todos) |
| idem | **Nuvens** (`cloudLayout`): ≥ 24 nuvens na Alta; em qualquer rumo (de 10° em 10°) a câmera Alta vê ≥ 5 (centro entre 1° e 17° de elevação e dentro do campo horizontal); a malha custa ≤ 2.000 triângulos | `cloudLayout` não existe (no 550e970: 9 cúmulos a 10°–25°) |
| idem | **Água** (`seaLook` + `seaApparent`): nos 6 biomas × 3 períodos a água a 300 m tem saturação HSV ≥ 0,55 de dia, ≥ 0,45 no entardecer, ≥ 0,4 à noite, e o matiz de dia entre 175° e 225° | `seaLook` não existe (com as contas do shader de hoje: ver §8) |
| `tests/gl-render.test.ts`, `tests/corrida-que-muda-gl.test.ts` | o gate e "nenhum programa novo no meio da transição" **sem mudança**: rodam de novo e continuam verdes | — |

O "antes" dos que não existem é medido na cópia do 550e970 (`scratch/orig/`, com as mesmas exportações e os valores de hoje) e citado na §8.

### 5. Riscos → mitigação

1. **Memória:** asfalto 512 × 2048 (4 MB + mips) × 2 pontas da M6; atlas de fachada 512² × 2 × 4 estilos; atlas de nuvem 1024 × 512. ~+12 MB de vídeo. → medido (`renderer.info.memory`), dito no relatório.
2. **Costura do atlas** (`fract` + mip): `textureGrad` com a derivada da uv contínua; células com borda de parede (o vazamento de mip é parede em parede).
3. **Marcos que usam fachada:** célula 0 = a fachada de hoje e uv sem o deslocamento do `look` → marcos iguais (régua de leitura e `landmarks-*` verdes).
4. **Visada dos marcos:** os 4 visuais têm a mesma pegada e altura (teste), então `block`, ocupação e `landmarks-enquadramento` não mudam.
5. **Nuvem impostora:** transparente, sem escrever profundidade, `renderOrder` −9 (logo depois do domo): o que é desenhado depois cobre a nuvem (montanha na frente de nuvem baixa é natural). De noite some pela luz (`lightsAmount`), sem piscar.
6. **Programa novo:** fachada (atlas), nuvem e mar mudam de shader, compilados na carga como hoje (o `corrida-que-muda-gl` cobra "nenhum programa novo no meio da transição"); a anisotropia não compila nada.
7. **M6:** o asfalto continua pintado para as duas pontas com o MESMO desenho (só a cor muda) e os uniformes fixos da T2; `corrida-que-muda*` rodam de novo.

### 6. Ordem (um commit cada)

1. Este cartão. 2. `tests/pistas-v4.test.ts` vermelho (e a cópia do 550e970 em `scratch/orig/`). 3. Asfalto, faixas, zebra, anisotropia. 4. Fachadas (atlas, looks, layout).
5. Nuvens. 6. Mar. 7. Testes da área, `tsc`, GL (gate, corrida que muda), galeria antes × depois, suíte inteira; §8, `VISUAL.md`, linha V4 do `CRONOGRAMA.md`.

### 7. Pronto quando

`npx tsc --noEmit -p .` sem saída; `tests/pistas-v4.test.ts` verde e visto vermelho; `render-ground`, `paleta-m2`, `scenery*`, `corrida-que-muda*`, `landmarks*` verdes;
`NC_REQUIRE_GL=1` `gl-render`, `corrida-que-muda-gl`, `texturas-gl` verdes com chamadas iguais e triângulos ≤ os de antes (ou a subida medida e explicada);
galeria `main-550e970` × `pistas` nas cenas 01–06 e 08 (`scratch/galeria/comparar-main-550e970-vs-pistas.png`), cada imagem aberta; suíte inteira uma vez no fim.

### 8. Registro (15/10/2026)

**Entregue** (commits em `nc/pistas`, sem push; `src/core`, `hashRace` e `sim-golden` intocados; carros e HUD fora):

| Item | Onde | Antes → depois |
|---|---|---|
| Asfalto com agregado e desgaste | `road-textures.ts` (`asphaltImage`, `ASPHALT_WEAR`) | granulado ±10 e trilhas a 0,86 em canvas → pixels puros: agregado (pedrisco/poro), manchas, trilhas polidas, óleo, 3 remendos com borda selada, junta, 2 trincas seladas, junta da pavimentação. Medido no canvas de verdade (Chromium, a conta do teste): **agregado 6,6% → 10,9%**, **trilhas 4,9%–6,3% → 9,5%–11,1%** mais escuras |
| Faixas e zebras nítidas | `road-textures.ts`, `road.ts` (`setQuality`), `renderer.ts` (1 linha) | densidade de texel **18,3 × 85,3 → 36,6 × 42,7 px/m** (repetição 24 → 48 m); faixa de bordo 0,25 → 0,3 m (**4,6 → 11 texels**), traço 0,2 × 3 m → 0,3 × 4 m; a 60 m na Alta a faixa cobre **0,2 → 2,0 texels** no nível de mip escolhido; anisotropia 8 fixa → 4/8/16/16; zebra 32 × 128 → 96 × 256 px, bloco **1 → 1,5 m** |
| Fachadas variadas | `scenery/textures.ts` (atlas), `geom.ts` (`facadeCell`), `structures.ts`, `catalog.ts`, `layout.ts`, `runtime.ts` (`applyFacadeAtlas`) | **1 → 4 visuais por estilo**; Copacabana: 225 prédios em 12 ids → 48 ids, cada janela de 80 segmentos com ≥ 4 prédios mostra ≥ 3 visuais; Sampa: 902 prédios, idem. Mesmo material e lote (0 chamada nova) |
| Nuvens pintadas | `sky.ts` (`cloudLayout`, `cloudAtlasImage`, `buildClouds`) | 9 cúmulos a 10°–25° + 6 faixas, **1–4 à vista por rumo**, ~20 mil △ → **36 cúmulos + 8 estratos** (Alta; Média 28 + 7, Baixa 20 + 5), ≥ 5 à vista em todo rumo, **80 △** |
| Mar saturado | `terrain.ts` (`seaLook`, `seaApparent`, `SEA_FRAG`, `FOAM_FRAG`) | saturação a 300 m no ângulo raso (a conta do shader): Copacabana de dia **0,56 → 1,00** (rgb 0,116,204 antes do tone mapping); 9 das 18 combinações abaixo do piso → 0 (a menor: savana no entardecer, 0,50; de dia ≥ 0,7, entardecer e noite ≥ 0,45) |

**Testes vistos falhar antes** (`tests/pistas-v4.test.ts`, no código do 550e970; commit dd8742b): `Tests  17 failed | 1 passed (18)`. Pelo resultado:
`asfalto 256×2048 px para 14 × 24 m: 18.3 × 85.3 px/m: expected 0.214 to be greater than or equal to 0.75`; `copacabana apartment: 167 prédios: expected 1 to be
greater than or equal to 4`; `sampa_noite apartment: 476 prédios: expected 1 to be greater than or equal to 4`; malha de nuvens `expected 4320 to be less than or equal to 2000`.
Por "não existe": `asphaltImage`, `kerbImage`, `MARKINGS`, `ASPHALT_WEAR`, `cloudLayout`, `seaLook`, `FACADE_CELL_SPAN`. Os "antes" desses, medidos com as contas do
550e970: a faixa de bordo de 4,6 texels cobria 0,2 texel a 60 m (anisotropia 8, nível de mip 4,4); 15 nuvens, 1 a 4 à vista por rumo (os cúmulos a 12°–22°); o mar abaixo do piso
em 9 combinações (desert:day 0,14, savanna:day 0,15, city_night:day 0,28, alpine:dusk 0,26…); o agregado do canvas (Chromium) 6,6% e as trilhas 4,9%–6,3%: o piso do
agregado subiu de 3% para 8% depois dessa medida (b497e37), para o teste separar o agregado do granulado de antes (com 3% ele passaria no 550e970).

**Testes mudados de propósito:** `horizonte-suave` — "nuvem sem faceta" passa a ser medida no atlas (a normal pintada: no miolo, entre pixels vizinhos, < 12°), porque a
malha virou de quadros; `corrida-que-muda-estrada` — tempo-limite de 60 s (o desenho do asfalto, 1 milhão de pixels, é montado uma vez por processo: ~0,2 s com a máquina
livre, segundos sob carga).

**Contagens** (galeria, 1280 × 720, Alta, swiftshader, sem FPS): chamadas **iguais** nas 7 cenas (54 · 52 · 40 · 56 · 45 · 41 · 285); triângulos **caíram** em todas — Copacabana 205.270 → 190.882, Paraty 178.534 → 164.166, Cânion 159.260 → 145.668, Sampa à noite 184.795 → 183.519, Fuji 149.403 → 135.811, Xingó 154.811 → 141.219, 4 jogadores 917.986 → 857.894 (as nuvens custam ~14 mil △ a menos por viewport; à noite não há nuvem, e Sampa só perde as lajes dos visuais 2 e 3). **Gate e GL:** `NC_REQUIRE_GL=1 npx vitest run tests/gl-render.test.ts tests/corrida-que-muda-gl.test.ts tests/texturas-gl.test.ts` (carga ~50, a galeria rodando junto) → `Tests  1 failed | 18 passed (19)`, 3900 s: caiu o 1º do `gl-render` **por tempo** (`Test timed out in 1500000ms`: a coleta de todas as qualidades × cenas passou dos 25 min); os testes seguintes usam a MESMA coleta e passaram, inclusive o gate de contagem (`checkGate` sem violação) e, no `corrida-que-muda-gl`, nenhum programa novo no meio da transição; `texturas-gl` verde. A checagem do 1º teste foi refeita à parte no laboratório (Copacabana, Sampa e Paraty × 4 qualidades): **0 programa com log, 0 erro de shader, 0 erro de página**; Alta: 83 / 78 / 80 chamadas, 293 mil / 370 mil / 270 mil △ (limites 84 / 88 chamadas, 340 mil / 380 mil △).
Memória de vídeo a mais (conta, não medida em GPU): asfalto 2 → 4 MB por ponta da corrida que muda, atlas de fachada 4 × 2 de 256² → 512², atlas de nuvem 2 MB: ~+16 MB
com os mipmaps. Programas: a fachada (chave `speed-tche-facade-atlas-v1`), a nuvem e o mar mudam de shader, compilados na carga como antes.

**Galeria antes × depois:** `scratch/galeria/comparar-main-550e970-vs-pistas.png` (cenas 01–06 e 08). `7 de 13 cenas mudaram · 6 sem imagem num dos lados · contagens que subiram em 0` (as 6 sem imagem ficaram fora do `--so`: carros, menus, largada, derrapagem e 2 jogadores não são desta frente).

**O que ainda está feio (para o dono):**
1. **Asfalto de dia à sombra é azul-marinho** (Copacabana, `(0,40,98)` na captura; `(18,54,106)` ao sol no modelo da cor-brilho). É a luz do dia — hemisférica azul +
   IBL do céu + o pé do Neutral que zera o vermelho — que a cor-brilho travou ("o dia não muda", `tests/cor-brilho.test.ts`). A textura nova aparece ao sol (Paraty, Fuji,
   Copacabana seg 380), mas à sombra o marinho engole o desgaste. **Recomendação:** abrir a trava para a família `road` (dessaturar a hemisférica/IBL no asfalto, ou o pé do
   Neutral sobre a luminância também de dia), com antes × depois de Copacabana. Decisão do dono.
2. **Repetição de 48 m:** remendos e trincas voltam no mesmo lugar a cada 48 m (a 270 km/h, ~1,5 vez por segundo); uma camada de decalques por hash do segmento (+1 chamada) resolveria.
3. **Prédios:** os 4 visuais mudam janela, cor, varanda, térreo e telhado, mas a **silhueta** (coroa, recuos) é a mesma por tipo: mudar a altura mexe na visada dos marcos
   (`block` da `sight.ts`). Fica para quando a régua dos marcos for refeita (T4).
4. **Nuvens:** sem sombra no chão e sem nuvem à noite (somem com a luz, como antes); os impostores olham para o centro do céu (correto para a câmera de corrida).
5. **Água:** o mar só existe no bioma `coast`; lago e rio dos outros biomas continuam conteúdo de pista (Q).

**Custo de montar a pista:** com 4 visuais a Copacabana monta 39 prédios distintos em vez de 12, e o raio de oclusão do prédio da orla (`bakeAO`) dobrava o
layout (19,8 → 43,7 s com a máquina a ~38 de carga). Os visuais 1–3 da orla levam o degradê de altura dos outros prédios (9e436bb): 22,9–30,7 s contra 20,2–25,0 s
do 550e970 na mesma carga; o layout das 109 pistas, 45,4 s contra 56,9 s do 550e970 (carga ~12: ruído de medida, nenhuma subida).

**Suíte inteira** (`NC_REQUIRE_RELAY=1 NC_REQUIRE_GL=1 npx vitest run --testTimeout=300000 --hookTimeout=900000 --reporter=dot`, código do 9e436bb, com outras 4 suítes
de outras frentes rodando juntas, carga 20–40): `Test Files  4 failed | 207 passed (211)` · `Tests  5 failed | 3828 passed | 1 skipped (3834)` · 4748 s. As 5 são
**de tempo**, as conhecidas sob carga (PLAYBOOK §5, T6): `fuel` (2 × 30 s), `landmarks` "perLap" (120 s), `scenery` "borda de cada sprite sólido" (240 s) e o 1º do
`gl-render` (1500 s). Sozinhas: `fuel` + `scenery` verdes (a borda dos sólidos em 135 s), `landmarks` `Tests  23 passed (23)` (perLap em 30 s), `NC_REQUIRE_GL=1` `gl-render` `Tests  14 passed (14)` em 2035 s (o 1º, que compila todos os programas, em 674 s).
(A 1ª tentativa da suíte, antes do 9e436bb, foi cortada pelo `timeout 7000` antes do resumo e não conta.)
