## Técnica: T2, T3 e T6 da auditoria de 14/10/2026 (frente `nc/tecnica`)

> Base `main` f241703. Itens da lista viva de `docs/CRONOGRAMA.md`, "Auditoria de 14/10/2026". Cada item: causa achada (arquivo:linha)
> → correção → teste (escrito antes e visto falhar). Atualizado a cada causa achada, sempre commitado antes do código.

### T2 — vazamento de texturas (`playtest-memoria`: `textures` +8 por ciclo)
- **Como foi achada:** cópia do `playtest-memoria` (em `scratch/`) que guarda cada textura com entrada no renderizador e a pilha de criação
  (setter de `uuid` no protótipo de `THREE.Texture`), num vite de desenvolvimento; depois uma sonda no laboratório GL que registra cada
  troca de `sun.shadow.map`. As texturas que sobravam eram pares `Texture` + `DepthTexture` (`.shadowMap`) de 1024², criados dentro do
  `WebGLShadowMap.render` e nunca liberados.
- **Causa:** `src/render/renderer.ts:370–383`. Na largada de pista de dia que chega ao entardecer (`prewarmLights`, M6) o viewport 0 é
  desenhado uma vez a mais para aquecer os faróis **antes** de `shadowRing.beginViewport`. Com 3 e 4 jogadores da Média para cima a sombra
  é por viewport (`postfx/shadows.ts`): o `beginFrame` acabou de soltar os mapas (`sun.shadow.map = null`), então o desenho do aquecimento
  faz o three criar um mapa novo, e o `beginViewport` (`postfx/shadows.ts:48`, `sh.map = s.map`) o troca pelo do assento sem guardar nem
  liberar: **1 mapa de sombra (2 texturas, ~8 MB de vídeo) perdido por largada**. No roteiro do `playtest-memoria` isso acontece 4 vezes por
  ciclo (monte_fuji 4j Média, copacabana 3j Alta, daintree 3j Ultra, kruger 4j Ultra): +8 texturas por ciclo. Na sonda: `corrida copa 3j:
  textures 91 → 101`, e os mapas `6dee24`, `6af66a`, `c9a21a` (um por largada) ficaram criados, fora do sol e sem `dispose`.
- **Correção:** o aquecimento passa a desenhar depois do `beginViewport` (dentro da contabilidade da sombra por viewport): o mapa que o
  three cria nele é o do assento, e o `endViewport` o guarda. Só `renderer.ts` (o `postfx/*` é da frente `nc/cor-brilho`).
- **Teste (antes):** `tests/texturas-gl.test.ts` — no laboratório GL, ciclos de largada (3 jogadores, Média, duas pistas de dia) com o
  fundo do menu entre elas: `renderer.info.memory.textures` igual entre o 2º e o 3º ciclo. Visto falhar: `91 → 95 → 99: expected 99 to
  be 95`; passa com a correção (commit 7d9443b).
- **Causa 2 (achada na mesma investigação, também da M6):** `src/render/road.ts:299–304` (`link`) cria objetos de uniforme novos a cada
  `setPalette`, mas o three só chama o `onBeforeCompile` (`installLiveBlend`, road.ts:159) quando compila um programa novo; ao reusar o
  programa (mesma chave `road-live:1`) ele usa os uniformes da última compilação. Sonda no laboratório: depois de trocar de uma pista de dia
  para outra, os 5 materiais da pista leem as texturas do período seguinte da pista **anterior** (já liberadas: o three as reenvia à GPU e
  elas ficam lá sem dono — as texturas `paintAsphalt/Kerb/Shoulder/Pit/StartDecal` de blocos antigos no diagnóstico); depois de uma pista
  de noite, o programa com mistura nem tem `uMapB`/`uEmissiveMapB` nos uniformes. Na tela: no fim da corrida asfalto, zebra, acostamento,
  box e largada misturam para a textura errada.
- **Correção 2:** os uniformes da mistura nascem uma vez por material (objetos fixos), entram sempre no shader, e o `setPalette` só troca
  o `.value`. **Teste 2 (antes):** `tests/corrida-que-muda-estrada.test.ts`, caso novo que imita o three (compila uma vez, troca de pista,
  passa por uma de noite e volta) e confere que os uniformes compilados leem as texturas do período seguinte da pista atual. Visto falhar
  (`uMapB é da pista atual (não uma já liberada)`); passa com a correção (6d9b847). Sonda GL depois: os 5 materiais leem a textura certa
  depois de trocar de pista e depois de uma pista de noite.
- **`playtest-memoria` depois** (36 blocos, build com as duas correções, `vite preview`, carga ~50, 5579 s): `⚠ textures: degrau isolado,
  não contínuo (72 → 72 no fim do ciclo; cresceu em 1 de 12 posições, no máximo +2)` — antes, `textures 95 → 103` crescendo nas 12
  posições (L2b). Programas, materiais, objetos, DOM, HUD e heap (+348 KB em 24 corridas) ✓. O veredito do roteiro saiu `1 falha(s)` por
  `✗ listeners: 45 → 45 no fim do ciclo; cresceu em 1 de 12 posições, no máximo +4` (bloco 25: 49 contra 45 no 13; já tinha dado 51 no
  bloco 9 e 47 no 16): oscilação dos ouvintes de áudio no instante da medida, não vazamento — fica anotado, o roteiro não foi afrouxado.

### T3 — playtests não reexecutados desde a N5

| Playtest | 1ª execução (build de f241703) | Depois (build com as correções do T2 e os roteiros corrigidos) |
|---|---|---|
| `playtest-records.mjs` (vite dev) | — | rc 0, `playtest dos recordes OK`, 20 ✓, 2138 s |
| `playtest-paint.mjs` | rc 1, 745 s (roteiro) | rc 0, `playtest da pintura OK`, 3167 s |
| `playtest-ghost.mjs` | rc 0, `OK`, 1106 s | (não reexecutado: nada do que mudou passa por ele além do desenho) |
| `playtest-ghost-version.mjs` | rc 1, 928 s (roteiro) | rc 0, `OK`, 23 ✓, 919 s (2 execuções antes caíram no `filechooser` sob carga, o aviso do cabeçalho) |
| `playtest-online.mjs` (relay próprio) | — | rc 0, `playtest online OK`, 40 ✓, 2536 s |
| `playtest-retro.mjs` | rc 0, `playtest retrô OK`, 652 s | (não reexecutado) |
| `pistas-ui.mjs` | 192 ✓ 2 ✗, cortado no 1600×900 | rc 1: 220 ✓, 2 ✗ = defeito real do detalhe da copa em 1280×800 e 1024×600 (abaixo) |

- Rodados com a máquina em carga 20–55 (outras sessões rodando suíte e capturas).
- `playtest-paint` — **falhou** (rc 1, 745 s): `✗ lobby da corrida rápida com P1 e P2` e as que dependem dele. **Causa: o roteiro.**
  `press` esperava 90 ms fixos por tecla (`scripts/playtest-paint.mjs:18`), mas o lobby e a garagem leem a entrada uma vez por quadro e
  duas batidas da mesma tecla no mesmo quadro viram uma borda (`tapped` em `src/ui/input.ts:290`); com o 3D por software um quadro leva
  segundos e o P2 entrou depois da conferência (os cartões mostraram 2 assentos logo depois). **Correção:** cada tecla espera 2 quadros
  (`settle`), como o `pistas-ui` já faz com `held`. Nenhuma conferência muda. **Depois** (build com as correções do T2, `vite preview`,
  carga ~50): rc 0, `playtest da pintura OK` (3167 s).
- `playtest-ghost-version` — **falhou** (rc 1, 928 s): `✗ fantasma aparece (pose z=undefined, …, 1 malhas translúcidas)` e
  `✗ impressão de outra versão: sem fantasma (0 quadros com pose, 1 malhas translúcidas, …)`. **Causa: o roteiro, duas vezes.**
  (1) o passo 2 dirige até a diferença passar de 0,12 s, mas pilota igual à volta gravada: a diferença só passa disso por ruído do teclado
  (sonda: máximo 0,1206 s numa volta), e quando não passa a corrida acaba e o fantasma some (`pose` nula); (2) a contagem de "malhas
  translúcidas" (`scripts/playtest-ghost-version.mjs:52`) pegava também a mancha do cenário (`scenery:blob`, `MeshBasicMaterial`
  0,32) e esperava ≥ 2 malhas do fantasma, que é **uma** malha desde a onda F (`src/render/cars.ts:225`). O jogo está certo: a sonda
  mostra o fantasma com pose e diferença na segunda corrida. **Correção:** na 2ª corrida o carro freia 1 s logo depois da linha
  (diferença garantida, ~0,58 s na sonda, sem depender de ruído) e a contagem é só das malhas do fantasma (material padrão translúcido, não a
  mancha do cenário), ≥ 1. (A primeira tentativa — esperar 1,5 s parado no grid — não servia: o relógio da volta e o do fantasma começam
  na linha, e a reexecução só passou por sorte, com diferença 0,12; a sonda mostrou isso e a correção foi refeita.)
- `playtest-ghost` — ok (rc 0, 1106 s). `playtest-retro` — ok (rc 0, 652 s).
- `pistas-ui` — 192 ✓ e 2 ✗ até ser cortado no 1600×900 (o executor bateu no teto de 2 h da sessão; rodado de novo inteiro):
  - `✗ 1920x1080: subindo, o cartão e o cabeçalho da copa ficam visíveis ({"card":false,"head":false})` — **causa: o roteiro.** O `settle`
    (`scripts/pistas-ui.mjs:98`) sai com 3 leituras iguais de `scrollTop` (300 ms); com a máquina carregada a rolagem suave demorou ~2,5 s
    para **começar** (sonda em 1920×1080: `scrollTop` 7646 parado por 2,5 s, depois 6363 e `{"card":true,"head":true}`). **Correção:** o
    `settle` espera o cartão em foco dentro da área e a posição parada por 5 leituras (até ~20 s); a conferência do cabeçalho não muda.
  - `✗ 1280x800 copas: a tela em si não rola (só a área da lista)` — **defeito real do jogo** (captura
    `scratch/tecnica/t3/pu-tamanho-copas-1280x800.png`): no Steam Deck (1280×800, 16:10) o detalhe da Copa África do Sul — 4 corridas, duas
    com nome em 2 linhas, mais o cartão do rival e o objetivo (O4) — passa da altura da tela: a 4ª corrida fica cortada e por cima da dica
    de teclas. Em 1280×720 e 1366×768 cabe (os nomes ficam numa linha). O `playtest-layout` mede `cups` em 1280×800, mas com outra copa em
    foco. **Não corrigido aqui:** o conserto é CSS do menu (`src/ui/screens/select.css`, detalhe da copa), arquivo da frente
    `nc/menu-estilos`; fica para ela (ou para depois da escolha do estilo), com esta conferência do `pistas-ui` como teste que falha.
  - **Reexecução inteira** (build com as correções, script do `settle` novo, 2413 s): `220 ✓`, `FALHOU: 2 conferências, 0 erros` — o
    "subindo" passa (`{"card":true,"head":true}`); as duas que falham são o mesmo defeito real: `✗ 1280x800 copas: a tela em si não rola` e
    `✗ 1024x600 copas: a tela em si não rola` (captura `scratch/tecnica/t3/pu2-tamanho-copas-1024x600.png`: a 4ª corrida da África do Sul
    passa da borda de baixo). 1600×900 e 1366×768 cabem.

### T6 — suíte frágil sob carga
- **Causa (medida, CPU com `process.cpuUsage`, 14/10):**
  - `tests/ghost.test.ts:96` (`volta de verdade em todas as pistas`): 109 pistas × 2 pilotos num teste só = **~4,3 s de CPU** sozinho
    (montar as pistas ~0,5 s; IA ~2,4 s; ziguezague ~1,5 s). Com a máquina em carga 31, só este arquivo: `Test timed out in 30000ms`.
  - `tests/cars.test.ts:120` (`beforeAll` do balanceamento, 600 s): 14 carros × 109 pistas = 1.526 corridas inteiras solo
    (`scripts/car-balance-lib.ts` `soloRaceTicks`), **~5 µs por tick, ~14 mil ticks por corrida** — o custo é a própria simulação
    (`aiInput` 24%, `stepRace` 22% no perfil); a pista já vem do cache de `getTrack` e as asserções já dividem uma medida só. Só este
    arquivo, carga ~45: `Hook timed out in 600000ms`, 786 s de duração, 160 s de CPU (`time`: real 13m14s, user 2m40s).
- **Correção:** ghost — um teste por pista (`it.for`), 30 s cada (~85× o custo da pista mais cara); cars — tempo-limite do hook
  proporcional ao número de corridas, com o custo medido no comentário. Nenhuma asserção muda.
- **Teste:** os próprios arquivos, sozinhos e na suíte inteira.

| Arquivo (sozinho) | Antes | Depois |
|---|---|---|
| `ghost.test.ts` | carga 31: `1 failed \| 20 passed`, `Test timed out in 30000ms`, 43,87 s | carga 44: `129 passed`, 43,63 s (CPU 10,0 s) |
| `cars.test.ts` | carga ~45: `Hook timed out in 600000ms`, 786 s (CPU 160 s) | carga 30–50: `14 passed`, 809,5 s (CPU 157 s) |
