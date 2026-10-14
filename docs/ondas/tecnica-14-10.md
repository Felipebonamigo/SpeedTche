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
  fundo do menu entre elas: `renderer.info.memory.textures` igual entre o 2º e o 3º ciclo.

### T3 — playtests não reexecutados desde a N5
- Em andamento: records, paint, ghost, ghost-version, online, retro e `pistas-ui`, um por vez (build de f241703 em `vite preview`; o
  records no vite de desenvolvimento).

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
- **Teste:** os próprios arquivos, sozinhos e na suíte inteira (tempos antes × depois abaixo).
