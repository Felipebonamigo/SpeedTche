## Técnica: T2, T3 e T6 da auditoria de 14/10/2026 (frente `nc/tecnica`)

> Base `main` f241703. Itens da lista viva de `docs/CRONOGRAMA.md`, "Auditoria de 14/10/2026". Cada item: causa achada (arquivo:linha)
> → correção → teste (escrito antes e visto falhar). Atualizado a cada causa achada, sempre commitado antes do código.

### T2 — vazamento de texturas (`playtest-memoria`: `textures` +8 por ciclo)
- **Causa:** em investigação. Instrumentação: cópia do `playtest-memoria` que guarda cada textura com entrada no renderizador e a pilha de
  criação (setter de `uuid` no protótipo de `THREE.Texture`), num vite de desenvolvimento.
- **Correção / teste:** a preencher.

### T3 — playtests não reexecutados desde a N5
- Em andamento: records, paint, ghost, ghost-version, online, retro e `pistas-ui`, um por vez (build de f241703 em `vite preview`; o
  records no vite de desenvolvimento).

### T6 — suíte frágil sob carga
- **Causa (medida, CPU com `process.cpuUsage`, 14/10):**
  - `tests/ghost.test.ts:96` (`volta de verdade em todas as pistas`): 109 pistas × 2 pilotos num teste só = **~4,3 s de CPU** sozinho
    (montar as pistas ~0,5 s; IA ~2,4 s; ziguezague ~1,5 s). Com a máquina em carga 31, só este arquivo: `Test timed out in 30000ms`.
  - `tests/cars.test.ts:120` (`beforeAll` do balanceamento, 600 s): 14 carros × 109 pistas = 1.526 corridas inteiras solo
    (`scripts/car-balance-lib.ts` `soloRaceTicks`), **~5 µs por tick, ~14 mil ticks por corrida** — o custo é a própria simulação
    (`aiInput` 24%, `stepRace` 22% no perfil); a pista já vem do cache de `getTrack` e as asserções já dividem uma medida só.
- **Correção:** ghost — um teste por pista (`it.for`), 30 s cada (~85× o custo da pista mais cara); cars — tempo-limite do hook
  proporcional ao número de corridas, com o custo medido no comentário. Nenhuma asserção muda.
- **Teste:** os próprios arquivos, sozinhos e na suíte inteira (tempos antes × depois abaixo).
