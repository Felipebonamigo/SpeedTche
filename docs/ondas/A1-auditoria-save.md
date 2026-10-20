## A1 — auditoria dos saves, da volta de versão e das falhas silenciosas (0.1.4 → 0.1.8) (frente `nc/auditoria`)

> Base d2546f1 (`main`, 0.1.8). Comparado com 75d0436 (0.1.4) e com os commits de 0.1.1 (db0cb46), 0.1.2 (ab80846), 0.1.3 (a102f2b), 0.1.5 (6e5aacd),
> 0.1.6 (91506a2) e 0.1.7 (4a882cc), cada um num worktree temporário (nada em `/home/user/speedtche` nem nos outros worktrees).
> **Onde a mudança de dados mora:** tudo entrou na **0.1.6**. Da 0.1.6 à 0.1.8 o código de save é o mesmo (`git diff 91506a2..HEAD -- src/game src/core`: só
> `highCurveCamera` em `Settings`). `cloudsave.ts`, `storage.ts` e `desktop/storage.cjs` são idênticos desde a 0.1.4.

### Resumo (o que é defeito, o que foi corrigido, o que fica como recomendação)

| # | Gravidade | Achado | Estado |
|---|---|---|---|
| A1-01 | baixa | `main.cjs` `steam:achievement`: `isActivated` e `activate` dividiam um `try`; se a consulta lançava (estatísticas da Steam ainda não chegaram), a conquista **nem era ativada**, calada | **corrigido** |
| A1-02 | média-baixa | `store:write` / `store:readAll` devolviam `false`/`null` à página sem rastro no `logs/errors.log`: um disco que recusa o save (Steam Cloud não sincroniza) ninguém via | **corrigido** |
| A1-03 | — | Saves e opções de 0.1.1 a 0.1.7 abrem na 0.1.8 **sem perda**, sem lançar, idempotentes (66 testes sobre fixtures literais) | sem defeito |
| A1-04 | média (aceitável no teste) | Voltar para a **0.1.5 ou antes** depois de abrir a 0.1.8 perde os carros novos comprados, o dinheiro gasto neles e a copa em andamento (se corria com carro novo) | documentado (`docs/SAVE.md`, LEIA-ME); **recomendo** backup na troca de versão |
| A1-05 | baixa | JSON ilegível vale como "não há save" (`readJson`): a abertura usa o padrão e a 1ª gravação o grava por cima, sem cópia e sem rastro; `readPending` ilegível idem (o arquivo velho pode vencer o `localStorage` novo) | **recomendação** (exige dois defeitos de disco juntos) |
| A1-06 | baixa | `main.ts` ignora o relatório de `hydrateFromDisk`: o disco que não respondeu em 3 s (`unknown`) não deixa rastro (o `failed` ficou coberto pela A1-02) | **recomendação** |
| A1-07 | informação | "Versão anterior" nas 38 pistas da T4 está certo, e **conservador**: a corrida inteira é bit a bit a mesma nas 109 pistas (ver A1-09); o que muda é o traçado sólido | por desenho |
| A1-08 | informação | Online: 0.1.2–0.1.5 dividem sala entre si (`61cea52f`), 0.1.6–0.1.8 também (`5c519f5c`); entre os dois grupos o relay recusa com `build` e a mensagem certa | sem defeito |
| A1-09 | informação | Determinismo: `hashRace`/`sim-golden` iguais; impressão de volta dos 14 carros antigos igual em 71 pistas e diferente nas 38 da T4 | sem defeito |
| A1-10 | informação | `resendAchievements`, `adoptSteamName` e `syncSteamOnOpen` não tinham **nenhum** teste | 11 testes novos |
| A1-11 | baixa | `win.loadFile(...)` em `main.cjs` sem `catch` (antigo, não é da 0.1.8): janela vazia sem rastro se o `index.html` faltar | recomendação |
| A1-12 | doc | `desktop/README.md` dizia "hoje são 2 arquivos" no Steam Cloud; são 5 | **corrigido** |

### 1. Abrir saves antigos na 0.1.8

**Como foi montado.** `scripts/gerar-fixtures-saves.mts` roda os saneadores *daquela versão* (`sanitizeSave`, `sanitizeSettings`, `sanitizeProgress`) sobre uma entrada rica
e imprime o JSON que ela gravaria: campanha com carros comprados e peças (`pororoca`, `sucuri`, `iara` e, da 0.1.6 em diante, `jabuti` e `caipora`), copa em andamento com dois
humanos, 4 recordes de volta e de prova com a **impressão daquela versão** (`copacabana`, `pampulha`, `sampa_noite`, `roma`), um fantasma por pista, estrelas, 14 conquistas,
opções com tudo mudado. Saída literal em `tests/fixtures/saves-antigos/v0.1.{1..7}.json` (+ `impressoes-0.1.4.json` com as impressões de 3 carros nas 109 pistas e
`v0.1.8-completo.json`, o save da 0.1.8 usado na volta).

**O que `tests/saves-antigos.test.ts` prova, para cada uma das 7 versões:**
- `PRESERVED` (copas, carimbos, `bestLaps`/`bestRaces` com `fp`, conquistas, contadores, nomes, `seatCars`, `stats`, `carsUnlocked`, `career`, `cupInProgress`) volta **idêntico**;
  campo novo (`cartoonEffects`, `assistOfferDeclined`, `highCurveCamera`, `seatCameras`) abre no padrão; todo botão que a versão conhecia fica com o **mesmo código**
  (única troca: o mapa do controle de antes da M1, 0.1.1, vai ao padrão novo, como `migrateLegacyPad` documenta); a câmera nova só pega código livre.
- A abertura do jogo (`rollSession` + `openAchievements` + `syncConquestCars`) não lança, não duplica e só soma: quem comprou carro e subiu de nível ganha `PRIMEIRA_PECA`,
  `CARRO_NOVO`, `PRIMEIRA_CORRIDA`, `SUBIU_DE_NIVEL`; só quem tem `speed-tche.progress` (0.1.6+) ganha `CAVALO_DE_ACO` e o Gaúcho.
- Preços: os 7 carros à venda da 0.1.4 custam o mesmo (12/16/20/22/24/30/40 mil) e os 7 livres seguem livres — **ninguém pagou um preço que mudou**. Os novos entram abaixo e acima, sem mexer nos antigos.
- Carro desconhecido: o assento cai no padrão **daquele assento** (um livre), a garagem da Expedição no Falcão GT, o recorde fica (e vira "versão anterior": a impressão não bate), a
  copa salva é descartada **inteira** (`sanitizeSavedCup` devolve null) — o resto do save fica.
- Copa renomeada: `brasil` → `br_rj`, `COPA_BRASIL` → `COPA_BR_RJ`; copa que nunca existiu fica em `cupsCompleted` (inofensiva, não destrava nada) e não derruba. Nenhuma copa foi renomeada de 0.1.4 a 0.1.8 (`cups.ts` não mudou).
- `syncConquestCars` com a conquista já ganha: soma o carro a `carsUnlocked` e a **todo** piloto da Expedição (co-op de 2 testado), idempotente, `career: null` ok; o save da 0.1.5 com 12 vitórias
  e nenhum carro comprado ganha `HORA_DE_ENTREGA` + Furgão na abertura e o mantém ao gravar e reabrir.
- Entrada hostil: `1e999` (que o `JSON.parse` entrega como `Infinity`), `-1e999`, texto no lugar de número, `__proto__`, carteira `1e300`: padrão ou borda, nunca lança. Mais 1.000
  mutações aleatórias (semente fixa) de um save da 0.1.7 em 4 saneadores: nenhum lança, todos idempotentes. (Rodei 16.000 fora do teste, com a mesma conclusão.)

**Não achei defeito de dado nesta parte.** Os testes passaram de primeira (são de caracterização, não de defeito): conferi que não são vazios com duas mutações — zerar `carsUnlocked` no
`sanitizeSave` reprova 19 deles, subir `PHYSICS_REVISION` reprova 19 — e restaurei o código.

### 2. Voltar para uma versão anterior

Medido com `scripts/comparar-versoes.mts feed` (o save completo da 0.1.8 passado pelos saneadores de cada versão). Tabela em `docs/SAVE.md` ("Voltar a uma versão anterior").

| Volta para | Perde ao regravar |
|---|---|
| 0.1.7, 0.1.6 | só `highCurveCamera` |
| 0.1.5, 0.1.4 | `assistOfferDeclined`, `cartoonEffects` (+ `seatCameras` e botão de câmera na 0.1.4); **os 12 carros novos** em `carsUnlocked`, `seatCars` e na garagem da Expedição (peças incluídas); **a copa em andamento** se um humano corre com carro novo; **dinheiro gasto não volta** |
| 0.1.3 | + `lockFps30`, `autoQuality`, `stars` |
| 0.1.2, 0.1.1 | + `sessionStart`/`recap`; a 0.1.1 também `seatLooks` e 3 botões |

- **`speed-tche.progress` sobrevive.** As versões ≤ 0.1.5 não leem nem gravam a chave, mas o espelho de arquivo e o `hydrateFromDisk` tratam toda `speed-tche.*` igual (código idêntico desde a
  0.1.4): ela fica no `localStorage` e em `saves/`. O que se joga lá soma `stats` (o nível acompanha), não maestria.
- **Steam Cloud.** O arquivo da nuvem vence o `localStorage` na abertura (a menos que haja pendência), então a regravação de uma versão antiga em outro computador chega ao primeiro como perda do mesmo
  tipo. Auto-Cloud sincroniza `saves/*.json` sem recursão (`desktop/README.md`).
- **Volta de ida e volta (0.1.8 → 0.1.5 → 0.1.8), medida:** os carros de **conquista** voltam sozinhos (as conquistas são texto e sobrevivem; `syncConquestCars` os devolve na abertura); os
  comprados, as peças deles e a copa não; `bestLaps`, `bestRaces`, `stats`, carteira (já sem o dinheiro dos carros) ficam.
- **Aceitável?** Para a versão de teste, sim, com o aviso no LEIA-ME (agora diz isto; antes só falava das estrelas da 0.1.3). Para a loja não basta: **recomendo** que a primeira abertura depois de uma
  troca de versão copie `saves/*.json` para `saves/backup/<versão anterior>/` (fora do Auto-Cloud). Custa ~20 linhas em `main.cjs`, dá ao Felipe como devolver o save a quem reclamar e é a única defesa
  possível contra um futuro 0.2 que mude formato — a versão antiga não pode ser corrigida depois de distribuída. Não fiz: é decisão de produto (onde guardar, por quanto tempo).

### 3. Recordes e fantasmas das 38 pistas da T4

- **O aviso está certo** (`recordFromOtherVersion`, `info.ts` passa o id da pista também nas provas `pista:voltas`): em cada fixture, só as pistas cuja impressão mudou ficam com "versão anterior"
  (0.1.2–0.1.5: `pampulha`, `sampa_noite`, `roma`; `copacabana` não; 0.1.6/0.1.7: nenhuma). O tempo gravado nunca é trocado.
  A 0.1.1 marca **tudo**, inclusive Copacabana: a 0.1.2 mudou constantes da simulação — consequência antiga, não da T4.
- **O fantasma antigo não corre como rival**: `ghostFor` entrega só `checkGhost === 'ok'`; fica na loja, invisível, e a 1ª volta da pista (`FANTASMA GRAVADO`) o substitui. O arquivo exportado por uma
  versão antiga é recusado como `otherVersion` nas 38 e aceito nas outras; arquivo v1 (sem impressão), sempre `otherVersion`.
- **Impressões da 0.1.4 × HEAD** (14 carros testados via 3 representantes × 109 pistas, e 14 × 109 no roteiro): 71 pistas iguais, **38 diferentes — para todos os carros ou para nenhum**
  (lista da T4 conferida: `paraty`, `ilhabela`, `sampa_noite`, `pampulha`, …, `roma`).
- **Online recusa certo.** `onlineFingerprint` leva `CARS` e os traçados; 0.1.2–0.1.5 = `61cea52f`, 0.1.6–0.1.8 = `5c519f5c`. O relay devolve `error build`; `online.err.build` existe em PT ("Esta sala foi
  criada com outra versão do jogo… Atualizem os dois computadores.") e EN (teste novo). 0.1.1 falava protocolo 1 e outra impressão; também recusada.
- Observação de desenho (A1-07): um recorde "versão anterior" **mais rápido** que o que a versão nova consegue fica para sempre (só sai quando batido; `FANTASMA.md` diz que é de propósito). Se isso incomodar
  nas 38 pistas, a saída é deixar a 1ª volta válida da versão atual substituir o recorde marcado.

### 4. Falhas silenciosas (arquivos mudados de `75d0436` a HEAD em `src` e `desktop`)

| Onde | Caminho de erro | Efeito no jogador | Vale corrigir? |
|---|---|---|---|
| `main.cjs` `steam:achievement` (A1-01) | `isActivated` lança → `catch` engole → `false` sem `activate` | conquista não chega à Steam; o reenvio da abertura tenta de novo, mas lança de novo | **corrigido** (2 `try`) |
| `main.cjs` `store:write` / `store:readAll` (A1-02) | `writeSave` falha (EACCES, disco cheio, pasta que é arquivo) → `false`; arquivo ilegível → `null` | a chave fica "pendente" no `localStorage`; **nada diz que a nuvem não está recebendo**; o aviso "O progresso não foi salvo" só sai se o `localStorage` também recusar | **corrigido**: linha `store-write-failed` / `store-read-failed` no `logs/errors.log` (chave e tamanho, nunca o conteúdo) |
| `storage.ts` `readJson` (A1-05) | `JSON.parse` lança → `undefined` | save/opções/progresso/fantasmas ilegíveis viram "novo jogo"; a 1ª gravação (`rollSession` → `saveSave`) escreve o padrão por cima | recomendo: avisar o relator (`setReadFailureHandler`, ligado em `main.ts`) e guardar o texto em `speed-tche.<chave>.ilegivel`. Não corrigi: precisa decidir se essa cópia vai à nuvem |
| `cloudsave.ts` `readPending` (A1-05) | marcação ilegível → `Set` vazio | "nada pendente": o arquivo (mais velho) vence o `localStorage` mais novo na abertura | baixa: exige a falha de disco que criou a pendência **e** a marcação ilegível |
| `main.ts` `hydrateFromDisk` (A1-06) | relatório (`failed`, `unknown`) descartado | IPC sem resposta em 3 s: a sessão segue com o `localStorage`, sem rastro | recomendo `reporter.report(...)` quando `failed`/`unknown` não vazios |
| `ghost-store.ts` / `playlog.ts` `sanitize*` | formato desconhecido → vazio | diário/fantasmas somem na próxima gravação (versão futura) | baixa, por desenho |
| `main.cjs` `win.loadFile(...)` (A1-11) | promessa sem `catch` | janela vazia, sem rastro | recomendo `.catch(e => logProcessEvent('load-failed', …))` |
| `session.ts` `void syncSteamOnOpen(...)` | rejeição só se `persist()` ou `steamName()` lançar de forma síncrona | cairia no relator global (`installGlobalHandlers`) | não |
| `achievement: … .catch(() => undefined)` (fim de corrida) | IPC caído | a conquista fica no save; o reenvio da abertura a manda | ok (é o conserto da O5) |
| `file:save` / `file:open` (exportar/importar fantasma) | `fs.writeFile`/`readFile` rejeita | a página devolve `false`/`'invalid'` e a tela diz o motivo | ok |

`?? padrão` que esconde dado corrompido: `pickNumber`/`pickEnum` aplicam o padrão (ou a borda) a campo fora da faixa **sem dizer nada** — é o contrato dos saneadores, e a saída é estável (testado);
o risco real é só quando o objeto inteiro é lixo (A1-05).

**Steam `isActivated` antes de `activate`:** conferido com o `main.cjs` rodando de verdade (`tests/desktop-main-ipc.test.ts`, `electron` e `steamworks.js` falsos): já ativada → devolve `true` sem
`activate`; não ativada → ativa; sem `isActivated` (steamworks.js antigo) → ativa direto; lança → ativa (A1-01); sem Steam, id vazio ou que não é texto → `false`. O que **não** dá para provar daqui:
que as 14 conquistas novas (12 da O5 + 2 da V6c) existem no painel da Steamworks — sem elas `activate` devolve `false` e o reenvio tenta em toda abertura. **Conferir no painel.**

### 5. Determinismo (sem tocar em `/home/user/speedtche`)

Worktrees temporários de 75d0436 e HEAD, `npx tsx scripts/comparar-versoes.mts hashes|sweep <raiz>`:
- **As 8 corridas de referência** (`fingerprintScenario`): idênticas (`5c5c0457:8085`, `7082fd5b:7815`, `4879fcd7:9076`, `e4b941e7:8491`, `c4458cea:11554`, `1c1efad5:8952`, `def5c918:7786`, `2fc453a0:9942`).
  `git diff 75d0436..HEAD -- tests/sim-golden.test.ts` vazio; `PHYSICS_REVISION` segue 3.
- **109 pistas × 14 carros antigos, `hashRace` tick a tick**: uma corrida de 4 humanos (carros em rodízio pelos 14, `versus`) + 16 IA por pista, 1 volta, até 6.000 ticks: **109 de 109 idênticas**, inclusive
  as 38 pistas da T4. Ou seja, a impressão das 38 acusa obstáculos sólidos que se moveram, não mudança de física no caminho de pilotos de roteiro; a marca é conservadora, como a T4 decidiu.
- **Impressão de volta** (`lapFingerprint`, 14 carros × 109 pistas = 1.526 pares): 71 pistas iguais, 38 diferentes.
- `src/core` mudou só em `career.ts` (`buyCar` recusa carro de conquista), `types.ts` (`conquest?`), `cars.ts` (12 carros + `FORA_DA_IA`: o sorteio da IA continua nos 7 livres de sempre) e
  `track/{plazas,sightline,turn}.ts` (T4).

### Testes e verificação (rodados neste turno)

- Novos: `tests/saves-antigos.test.ts` (66), `tests/steam-abertura.test.ts` (11), `tests/desktop-main-ipc.test.ts` (10; 4 vistos falhar antes da correção:
  `expected false to be true` na `isActivated` que lança, `expected '' to contain 'store-write-failed'` ×2 e `'store-read-failed'`).
- `npx tsc --noEmit -p .`: sem saída.
- Área (`save settings progress career migra ghost net- desktop achievements carros- cloudsave storage-full content-version sim-golden determinism idioma oferta paint stars-save expedition-save
  saves-antigos steam-abertura progresso`): 43 arquivos, 786 testes ✓.
- Não rodei a suíte inteira (máquina de 4 núcleos) nem o Electron de verdade; o Steam real só entra pelos falsos.

### Roteiros

- `scripts/gerar-fixtures-saves.mts <raiz>` — fixture de "save jogado" de uma versão.
- `scripts/comparar-versoes.mts hashes|sweep|feed <raiz> [save.json]` — hashes de corrida e de volta, corrida por pista, e o que uma versão perde ao regravar um save de outra.
