---
name: verificar
description: Roda a verificação do Speed Tchê antes de dizer "pronto", "corrigido" ou "os testes passam": typecheck, suíte completa com o relay (e com o GL quando mexer em render), sim-golden e impressões digitais, balanceamento, teste visto falhar e o fecho DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED. Use quando pedirem "verifica", "roda os testes", "tá verde?", "pode mesclar", "pode subir", e antes de todo commit, mescla ou push.
---
# Verificar antes de dizer "pronto"

Fontes: `CLAUDE.md` ("Regras do núcleo", "Regras de trabalho") e `docs/PLAYBOOK.md` §1, §2 e §5. Tudo roda da raiz do repositório.

## Quando usar
Antes de qualquer "pronto", "corrigido" ou "os testes passam", e antes de commit, mescla ou push. Nenhuma dessas frases sai sem o comando
rodado **neste turno** e a saída lida. O número vem da saída, nunca da memória.

## Passos
1. Sessão nova: instale as dependências. A suíte completa exige o `ws` do relay.
   ```bash
   npm ci && (cd server && npm ci)
   ```
2. **Defeito corrigido vira teste, escrito ANTES e visto falhar pelo motivo certo** (não por erro de digitação). Se a correção saiu
   antes, apague e recomece. Para ver falhar contra o código antigo, copie o arquivo antigo para `scratch/orig/` e aponte uma cópia do teste para ele.
   ```bash
   npx vitest run tests/<arquivo>.test.ts      # vermelho antes da correção, verde depois
   ```
3. Typecheck. Sem saída = ok.
   ```bash
   npx tsc --noEmit -p .                       # ou npm run typecheck
   ```
4. Enquanto trabalha, rode só os testes da área (ex.: `npx vitest run tests/landmark*.test.ts tests/scenery*.test.ts`).
5. Suíte completa: **uma vez**, com a máquina livre, em segundo plano (`run_in_background`). Espere a notificação, sem ficar consultando.
   ```bash
   ps -eo pid,args | grep -E "[v]itest|[v]ite |[c]hrome|[e]lectron|[r]elay.mjs"   # máquina livre = nenhuma linha
   NC_REQUIRE_RELAY=1 npx vitest run --testTimeout=180000 2>&1 | tail -6
   ```
   Se mexeu em render (shader, material, pós, `src/render/**`), rode com o GL exigido. Os testes de GL usam o Chromium em
   `/opt/pw-browsers`. Sem ele, são pulados em silêncio; com `NC_REQUIRE_GL=1`, a falta do Chromium vira falha.
   ```bash
   NC_REQUIRE_RELAY=1 NC_REQUIRE_GL=1 npx vitest run --testTimeout=300000 --hookTimeout=900000 --reporter=dot 2>&1 | tail -6
   NC_REQUIRE_GL=1 npx vitest run tests/gl-render.test.ts tests/efeitos-gl.test.ts tests/corrida-que-muda-gl.test.ts tests/stage-gl.test.ts   # só os de GL
   ```
6. Núcleo e corridas de referência: `npx vitest run tests/sim-golden.test.ts tests/determinism.test.ts`.
   - Otimização ou trabalho só de render: o `sim-golden` **não pode** mudar. Se mudou, é defeito.
   - Mudança de jogabilidade **de propósito** (constante, IA, física, pista): veja quais corridas mudaram.
   ```bash
   npx tsx scripts/perf-sim.ts --fingerprints | grep -o "fingerprint: '[0-9a-f]*'" > scratch/fp.txt
   git show HEAD:tests/sim-golden.test.ts | grep -o "fingerprint: '[0-9a-f]*'" | diff - scratch/fp.txt   # sem saída = nada mudou
   ```
   No diff só podem aparecer as corridas que deviam mudar. Então cole em `EXPECTED` as linhas do `--fingerprints`, que já saem
   no formato dele, e escreva o porquê no comentário acima. Se o `contra-relogio` mudou, suba `PHYSICS_REVISION` em
   `src/game/content-version.ts` e grave o par novo em `PHYSICS_REVISION_AT`; o teste cobra. Avise o dono: os recordes e os fantasmas dessas pistas passam a "versão anterior".
7. Se mexeu em jogabilidade, rode o balanceamento IA × IA antes e depois, nas sementes 11, 12 e 13. Compare a linha
   "média geral das voltas da IA" e o "termômetro médio" do fim.
   ```bash
   npm run balance -- corrida profissional 11 > scratch/balance-11-depois.txt    # idem 12 e 13; uma pista só: … 11 copacabana
   npx tsx scripts/career-balance.ts                                            # se tocou carreira ou dinheiro × rivais
   ```
   Para regravar a linha de base do termômetro (só com `corrida` e sem pista avulsa; o `tests/race-feel.test.ts` exige as 109 pistas):
   `NC_FEEL_OUT=scripts/race-feel-base/profissional-11.json npm run balance -- corrida profissional 11`.
8. No fecho de uma frente ou onda, e antes de push: `npm run build` → exit 0. Se a mudança é visível, use também a skill `capturar`.

## Como saber se deu certo
- O `tsc` não imprime nada. O vitest mostra `Test Files  N passed (N)` e `Tests  N passed` (às vezes com `| 1 skipped`), sem `failed`.
  A contagem bate com a de antes mais os testes novos.
- Teste pulado não é teste verde. Sem o `ws` em `server/`, o teste do relay pula, e sem o Chromium pulam os de GL. As variáveis
  `NC_REQUIRE_RELAY=1` e `NC_REQUIRE_GL=1` transformam esse pulo em falha.

## Armadilhas (PLAYBOOK §5, CRONOGRAMA T6)
- Com outros agentes rodando, a suíte estoura o tempo em `cars` (beforeAll de 600 s), `ghost` e `fuel` (30 s) e no "perLap" de `landmarks` (120 s).
  Isso não é defeito: rode o arquivo sozinho e diga isso no relatório. A suíte que vale é a que roda com a máquina livre.
- Pista que está no `sim-golden` (copacabana, sampa_noite…) mudou de traçado: o `EXPECTED` muda. Pista e marco mudaram juntos:
  `landmarks-enquadramento` pode cair abaixo de 2,5 s. Rode a suíte depois de mesclar tudo.
- Se o hook de parada pedir push com a suíte ainda rodando, não suba: espere ficar verde. Nada vai para o remoto com teste vermelho.
- Três tentativas seguidas falhando: pare. Volte à causa raiz (reproduza e instrumente cada fronteira) em vez de tentar a quarta.
- O CI (`.github/workflows/ci.yml`) roda `npm test` só com `NC_REQUIRE_RELAY=1`. Os testes de GL não são exigidos lá: quem mexe em render roda aqui.

## Fecho e registro
- Resultado primeiro, em português, curto. Números e textos de erro exatos, nunca parafraseados (ex.: `Tests  2385 passed | 1 skipped (2386)`, o da N1).
- No relatório ou no cartão (`docs/ondas/...`, seção "Resultado"), registre: os comandos rodados, as contagens, como cada teste novo
  falhou antes, e o que não rodou e por quê.
- Termine com **um** destes: `DONE`; `DONE_WITH_CONCERNS` (feito, com ressalva que precisa ser lida); `NEEDS_CONTEXT` (falta decisão do dono); `BLOCKED`.
