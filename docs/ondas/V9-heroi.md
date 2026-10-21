# V9 — o carro herói (Falcão GT em alta definição) (branch `nc/hero`, base `main` bc2586f, 20/10/2026)

> Pedido do dono (18–22/10): "os carros do Horizon Chase são muito mais bem feitos que o nosso"; "os carros ainda parecem mal feitos". Aqui: o carro de quem está na câmera ganha um casco de ALTA definição feito no Blender; os outros seguem leves. **Só `src/render`, opções e ferramentas** (`src/core`, `hashRace`, `sim-golden` intactos). Nenhum limite do gate foi mexido. FPS não foi medido (swiftshader só conta): quem diz se cabe é o `--bench` do dono.
> Imagens (fora do git): `scratch/hero/folha-hc2-gt-heroi.png` (HC2 × GT atual × GT herói, 5 vistas), fotos soltas em `scratch/hero/fotos/`, prévias do Blender em `scratch/hero/prev*/`.

## 1. O que entrou
| Peça | O quê |
|---|---|
| `tools/blender/build_hero_gt.py` (`npm run carro-heroi`) | casco por **superfície de subdivisão** (nível 1) sobre a gaiola do próprio `Hull` do GT (`hero/gt-gaiola.json`, exportada por `hero/exportar-gaiola-gt.ts`): mesmos eixos, pegada e alturas; vincos na cintura, soleira e boca do vão; alisamento de Taubin fora dos vincos. Cabine em loft com vidro de caimento e 6 faixas de reflexo. **13.846 △** (teto `HERO_MAX_TRIANGLES` = 20.000; o casco de sempre tem 4.388) |
| Traseira | 4 lanternas de LED embutidas (bezel saliente, poço, coroa `taillight_dim`, **miolo em leque** `taillight` que o jogo esquenta para laranja, anel e 8 pontos de LED), colmeia de 38 células hexagonais em relevo, placa lisa sem texto, saia de carbono, difusor com 9 aletas e cercas, escapes duplos de metal, asa com perfil, gurney, placas e 2 suportes em pescoço |
| Frente e lados | faróis de projetor embutidos (2 por lado, aro/coroa/miolo, refletor, luz diurna em L), 3 entradas de ar com barras, divisor de carbono, tomadas NACA, fresta do capô, frestas de porta, maçanetas embutidas, entradas de ar do flanco, retrovisores com pedestal e espelho, pinças de freio (acento) |
| Contrato | mesmos nós e materiais do GT (`paint`, `stripe_a/b`, `accent`, `glass`, `headlight*`, `taillight*`...); roda do projeto (a do catálogo, a que o jogador escolheu); `heroProblems` (`gltf.ts`) trava eixos (2 cm), escapes (2 cm), pegada e altura (6 cm) contra o GT de sempre. Arquivo em `src/assets/cars/hero/gt.glb` (pasta própria; licença "criação própria" em `docs/ARTE.md`) |
| `src/render/cars/lod.ts` | `carDetail`: **herói** (humano, a menos de `HERO_RADIUS_M` = 24 m do carro do viewport; 12 m na tela dividida; saída a ×1,25: histerese), **intermediário** (o `lod0` de sempre) e **longe** (`lod1`, regra de V13 intacta). Baixa e "Reduzir efeitos": sem herói. Câmera Capô/Frente: o próprio carro fica no `lod0` (o corte da cabine e o olho saem dele) |
| `src/render/cars.ts` | um lote herói **por modelo** (não por carro), mesmo material/programa (a chave do shader não muda); a vitrine (garagem, lobby, pódio) usa o herói quando ligado (`stage.ts` + `prefs.ts`) |
| Opção | `Settings.heroCars` = `auto` (ligado só em Alta e Ultra) / `on` (liga também na Média) / `off`; campo aditivo (save antigo abre no automático; a 0.1.9 o ignora). Mora em **Opções › Acessibilidade** ("Carros em HD", ao lado do 30 fps): as colunas da tela de Opções já têm as 10 linhas que cabem. Para a linha caber, `access.css` ficou mais enxuto (padding, descrição, rodapé). `playtest-layout` em `options` e `access`, 7 resoluções × 2 tamanhos de texto: **28/28 limpas** |

## 2. Números (gate, 640×360, pior viewport, 300 ticks; `tests/heroi-gl.test.ts`, `tools/heroi-gate.mjs`)
Pior caso real: **4 humanos no Falcão GT, todos de perto** (até 4 cascos herói por viewport), herói ligado em toda qualidade.
| cena/qualidade | △ sem herói → com herói | chamadas | limite do gate △ / chamadas |
|---|---|---|---|
| copa-4p Média | 207.254 → **282.846** (+75,6 mil) | 73 → 73 | 316.000 / 82 |
| copa-4p Alta | 225.688 → **301.286** | 74 → 74 | 340.000 / 81 |
| copa-4p Ultra | 226.459 → **302.059** | 77 → 77 | 340.000 / 85 |
| sampa-4p Média | 175.506 → **247.900** (+72,4 mil) | 74 → 74 | 345.000 / 89 |
| sampa-4p Alta | 179.041 → **251.405** | 73 → 73 | 380.000 / 88 |
| sampa-4p Ultra | 179.062 → **251.424** | 76 → 76 | 380.000 / 92 |
Cada herói custa ~19 mil △ (cena + sombra), então 4 de perto somam ~75 mil: **cabe**, com 33 mil de folga em copa-4p Média e 97 mil em sampa-4p Média. As chamadas ficam iguais porque, com todos os GT perto, o lote `lod0` do GT esvazia.
**Ressalva que precisa de decisão do dono: copa-1p (1 jogador), Alta e Ultra, no padrão do jogo (herói no carro do jogador, Falcões da IA no `lod0`): 83 → 85 chamadas (limite 84) e 84 → 86 (limite 85): +1 sobre o limite**, △ 255.062 → 274.032 (limite 340.000). Não subi o limite: o laboratório do gate nasce com o herói desligado (o gate de V13 e os testes de imagem seguem medindo o casco de sempre) e a medida do herói é do `heroi-gl`. Saídas: subir copa-1p Alta/Ultra em 1 chamada (84→85, 85→86), ou deixar o herói só da Ultra, ou tirar um lote em outro lugar. Recomendo a primeira, depois do `--bench`.
Sem programa novo: o teste liga o herói no meio da corrida e a contagem de programas não muda. Sem chamada por carro: ligar o herói soma ≤ 2 chamadas com 1 ou com 4 humanos.

## 3. Testes (escritos antes e vistos falhar)
- `tests/heroi-lod.test.ts` (16): módulo `carDetail`/`heroEnabled` inexistente ("is not a function").
- `tests/heroi-ajuste.test.ts` (8): 7 falharam ("expected undefined to be 'auto'", linha da opção ausente, chave de texto crua); o que passou é a idempotência do saneador.
- `tests/heroi-asset.test.ts` (13): "falta src/assets/cars/hero/gt.glb". Falhas depois, pelos motivos certos: largura da roda do arquivo 0,342 × 0,320 (parâmetro da roda), boca do vão de roda 6 cm dentro do pneu (a subdivisão puxa o polígono: gaiola com 8 facetas e 8 cm de folga), miolo da lente com `aLens` 0,07 > 0,05 (abaulado de 6 mm → 3 mm), difusor 110 △ < 200 e simetria 1,85% (as faixas de reflexo do vidro são diagonais).
- `tests/heroi-gl.test.ts` (13, GL): sem a integração em `cars.ts`, 3 falharam ("expected 0 to be greater than or equal to 1": nenhum casco herói); os outros guardam os limites e passam trivialmente sem herói.
- **Ajustes de teste, de propósito:** (1) `camera-curva-opcao`: a lista de chaves da 0.1.7 agora espera `['highCurveCamera','heroCars']`; (2) `heroi-asset`: a pinça de freio (acento) mora dentro do aro como a do GT de sempre, então sai da conta "casco dentro do pneu"; o espelho do reflexo (metal 1, rugosidade < 0,08) sai da simetria; três testes meus tinham defeito de teste (expressão sobrando, coordenadas glTF × jogo, o primeiro material do escape) e foram corrigidos antes de olhar o código.
- Núcleo intacto: `determinism` e `sim-golden` verdes. Área (`car-`, `cars`, `estilo-carro`, `carros-`, `heroi`, `folga-lod`, `garage-stage`, `stage-*`, `quality`, `bench`, `camera`, `i18n`, `fps30`, `saves-antigos`, `car-pipeline`, `efeitos-realistas`, `online-settings`): sem vermelho.

## 4. O que separa o HC2 do nosso (olhando `scratch/hero/folha-hc2-gt-heroi.png`)
O herói **está mais bem feito**: casco liso (sem os quadris em facetas), traseira legível de perto (colmeia, LED, aletas, escapes, placa, asa com suportes), faróis de projetor, frestas e maçanetas. Na **câmera de corrida** a diferença é discreta (o carro tem ~180 px; o ganho é a silhueta suave e a asa/difusor/escapes). O que ainda falta para chegar ao HC2, por ganho:
1. **Iluminação e material da lataria**: o HC2 tem gradiente de brilho longo e nítido em toda a lataria, reflexo de céu alongado e luz de recorte; o nosso verniz é quase uniforme (o realce do sol tem teto de 0,5 desde V2). É shader/luz, não malha.
2. **Lanternas**: o HC2 usa faixas largas de LED com brilho e halo; as nossas são 4 discos (a identidade do GT) e o bloom de dia segura o miolo. Falta halo (bloom) e uma barra de luz contínua.
3. **Vidro**: o do HC2 é preto profundo com reflexo; o nosso fica azul-escuro e, com as faixas de reflexo, um pouco mais claro embaixo (luma 0,099 contra a meta de 0,07 do `cor-brilho-gl` para o GT de sempre).
4. **Proporção**: o HC2 usa carro mais alto e quadris mais largos com rodas enormes; o nosso GT é baixo e longo, e o herói fica ±6 cm dele de propósito (a física não muda).
5. **Rodas**: a `sport5` de sempre (com flanco, aro fundo e disco); falta o desenho de 10 raios do HC2.

## 5. Recomendação para estender aos outros carros
O custo de um herói é o arquivo + um lote por modelo (+2 chamadas só quando ele aparece). O pipeline (`gaiola.json` exportada do `Hull` → Blender → `hero/<modelo>.glb`) serve a `wedge`, `hyper`, `prototype` e `roadster`, que já usam `Hull`; ~1 sessão por carro. O limite real é o orçamento de **chamadas** (cada modelo com herói visível soma até 2) e a **sombra** (metade do custo em △): com 4 modelos diferentes entre os humanos, o pior caso sobe +8 chamadas. Ordem sugerida: Pororoca V10 (`hyper`), Iara Turbo (`wedge`), Tornado (hatch), depois os nacionais (já são `.glb`, bastaria subir `--estilo realista`, 12.724 △). Antes: decidir copa-1p (seção 2) e o FPS do `--bench`.

## 6. Arquivos
`src/render/cars/lod.ts`, `cars.ts`, `models.ts`, `model.ts`, `assets.ts`, `gltf.ts`, `check.ts`, `src/render/stage.ts`, `prefs.ts`, `src/game/{contracts,settings,session}.ts`, `src/ui/screens/{options,strings}.ts`, `src/access/{screen.ts,access.css}`, `tools/blender/{build_hero_gt.py,hero/*}`, `tools/{heroi-folha,heroi-gate}.mjs`, `tools/render-harness.{html,lab.ts}` (`hero=` e `lab.setHero`), `tests/heroi-*.test.ts`.


> **Atualização (V15, 20/10/2026):** o pipeline foi estendido a hyper, wedge, prototype, roadster, muscle e rally (`docs/ondas/V15-herois.md`): 4 humanos em 4 estilos cabem no gate; o herói soma 0 chamadas fora do GT.

> **Atualização (V16, herói sob demanda):** `loadCarAssets()` não lê mais os 7 cascos herói (~1 MB cada, ~0,6–1 s na abertura mesmo com "Carros em HD" desligado). `ensureHeroes()` (`assets.ts`) os carrega e registra quando `heroEnabled` é verdadeiro — chamado por `session.ts` (`heroCarsOn`, a cada quadro: só consulta a promessa em cache) e por `stage.ts` (vitrine) — uma vez só, com chamadas concorrentes dividindo a mesma promessa; falha de um arquivo fica em `rejected` sem derrubar os outros, e `lastCarAssetReport()` soma os heróis ao relatório. Ligar a opção/qualidade no meio da sessão funciona igual: até o herói chegar o carro segue no casco de sempre, e o `Cars` (`adoptHeroes`, comparando `heroRevision()` de `models.ts`) cria o lote herói no quadro seguinte, com o material copiando o estado dos uniformes dos já existentes e a mesma `customProgramCacheKey` (nenhum programa de shader novo). `tools/render-harness.lab.ts` (gate de contagem) e `tools/render-harness.html` (galeria/folhas) chamam `ensureHeroes()` explicitamente, então continuam medindo COM herói quando `hero=` liga o desenho; o `--bench` do jogo nunca ligou `heroCars`. Atalho: arquivo que falhou não é tentado de novo na sessão. Testes: `tests/herois-sob-demanda.test.ts`.
