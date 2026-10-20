# V6d — "Hora de entrega" pelo Saci Mirim: 5 vitórias seguidas (20/10/2026)

> **Base:** `main` d2546f1 (0.1.8), branch `nc/saci`, worktree `/home/user/speedtche-wt/saci`. Pedido do dono: a ficha de nacionais (`docs/CARROS-NACIONAIS.md`) previu duas regras para a
> conquista; a V6c (`docs/ondas/V6c-nacionais.md` §3) fez as 10 vitórias sem comprar carro e deixou esta de fora por pedir contador. **Sem push.**

## 1. A regra
- **Segundo caminho para a MESMA conquista** (`HORA_DE_ENTREGA`, id e contagem 69 intactos): 5 vitórias SEGUIDAS, em corrida de verdade, com o Saci Mirim. Qualquer uma das duas regras libera a conquista e o Furgão; se as duas se cumprem juntas é uma conquista só (`add` dedupe pelo save e por um `Set`).
- **Seguida** = por perfil (o nome do lobby, a chave das estatísticas e da maestria): vitória com `saci` soma 1; corrida do perfil com outro carro, ou sem vitória, zera. **Contra-relógio não conta nem zera** (não há vitória possível ali; decisão minha, uma linha para o dono trocar). "Vitória" é a do resto do jogo: `stats.wins` da contribuição (1º, fora do contra-relógio). Tela dividida/festa: cada humano local tem a sua; dois assentos com o mesmo nome são um perfil e só mantêm a sequência se todos venceram de Saci. Online: só os assentos locais, como a maestria.

## 2. Onde mora
`ProgressProfile.saciStreak?` na chave **`speed-tche.progress`** (O5), aditivo: o save principal não muda de formato. `settleProgress` atualiza (e o `ProgressNews.saciStreak` leva o valor); `unlockAchievements` avalia no fim da corrida e `openAchievements` na abertura (quem já tem 5 gravadas). `raceEnd.ts` passa `mode` ao `settleProgress`.
Saneador: nunca lança; finito, arredondado, 1..999 (`SACI_STREAK_MAX`); ausente, 0 ou lixo = sem campo. Detalhes de compatibilidade (0.1.7/0.1.8 abrem sem perda e, ao regravar a chave, descartam só o contador) em `docs/SAVE.md` ("Sequência no Saci Mirim").

## 3. Textos
`stats.achDesc.HORA_DE_ENTREGA` e `progress.lock.conquest.HORA_DE_ENTREGA` (PT e EN) dizem as duas formas; `desktop/README.md` (tabela de IDs) e `desktop/teste/LEIA-ME.txt` idem.

## 4. Mudanças em arquivos compartilhados com a frente de auditoria de save (aditivas)
`src/game/progression.ts`: campo opcional em `ProgressProfile`/`ProgressNews`/`ProgressInput`, bloco no `settleProgress` e uma linha de leitura/escrita em `sanitizeProgress` (o laço ganha uma constante `streak` e o `push` fica condicional). Nada do que existia foi reescrito.

## 5. Testes (antes do código, vistos falhar) e verificação
`tests/saci-sequencia.test.ts` (19): contagem, zera com outro carro, zera sem vitória, contra-relógio neutro, perfis independentes, mesmo nome em dois assentos, persistência pela chave, save antigo = 0, lixo, save principal sem campo novo, 5 libera / 4 não, não duplica, abertura, Furgão liberado, textos, e ponta a ponta pelo `settleRace`.
Primeira execução (código ausente): `Tests  13 failed | 4 passed (17)`, todas pelo motivo certo (`expected undefined to be 1`, `expected [ 'PRIMEIRA_CORRIDA' ] to include 'HORA_DE_ENTREGA'`, texto sem "Saci Mirim"). Os 4 verdes eram travas (o save principal sem campo, 0 e ausente, e o teto).
