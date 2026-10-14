---
name: ler-crash
description: 'Lê o que o Speed Tchê deixa quando trava ou fecha sozinho (o relatório de erros e o errors.log), acha a linha de código e transforma em Issue "[Playtest]" com o passo a passo. Use quando o jogo travar, fechar sozinho, um testador mandar log ou pasta de crash, ou o Felipe disser "crashou", "fechou do nada" ou "deu erro".'
---
# Ler um crash

## Onde fica

- Relatório de erros do jogo (`src/game/errors.ts`): os últimos 50 erros (`error`, `rejection`, `loop`, `fatal`)
  com versão, modo, pista e tela, no localStorage `speed-tche.errors`.
- No executável, também em arquivo: Windows `%APPDATA%\SpeedTche\logs\errors.log`, Linux e Deck
  `~/.config/SpeedTche/logs/errors.log` (gira em 512 KB para `errors.1.log`). O processo principal grava ali
  `render-process-gone` e `gpu-process-gone`.
- O testador copia tudo em Opções › "Copiar relatório" (erros e diário de jogo) e cola na Issue.
- Diário de jogo: `<userData>/saves/speed-tche.playlog.json`.

## Passos

1. Junte os arquivos. Do PC do Felipe, leia direto. De um testador, peça a pasta zipada anexada à Issue "[Playtest]"
   (o modelo da Issue tem o campo de anexo). Anote a versão do jogo e a data.
2. Ache a primeira linha que é do jogo. A pilha vem minificada, porque o pacote não leva os `.map`. Para ler: faça checkout do commit da versão,
   `npm run build` (o vite gera `dist/assets/*.js.map`) e traduza a linha e a coluna com o `source-map-js` que já está no
   `node_modules`: `new SourceMapConsumer(JSON.parse(mapa)).originalPositionFor({ line, column })`.
3. Leia as 50 linhas de log antes do erro: o que o jogo estava fazendo (cena, modo, último comando).
4. Ligue ao código: abra o arquivo e a linha, e o `git log` daquele trecho perto da data da versão.
5. Reproduza com a skill `capturar` ou os `scripts/playtest*.mjs`. Se reproduziu, o defeito vira teste visto falhar antes da correção.
6. Registre: Issue "[Playtest]" com gravidade "trava" ou "quebra a partida", o trecho da pilha, o arquivo e a linha, e
   como reproduzir. A correção segue a skill `triar-playtest`.

## Armadilhas

- Não há `crashReporter` nem minidump: queda do processo de GPU só aparece como `gpu-process-gone` no `errors.log`.
  Tela com a dica `--ignore-gpu-blocklist` é a tela fatal de GL (`src/errors/fatal.ts`).
- Duas quedas do renderizador em 30 s não recarregam a página (`desktop/main.cjs`): o jogo para de propósito.
- O `scrubPaths` já troca a pasta pessoal por `~`, mas confira antes de colar.
- Log de testador pode ter nome de usuário e caminho do computador dele: não copie isso para a Issue pública.
