---
name: triar-playtest
description: Ler, organizar e resolver os problemas de playtest do Speed Tchê que chegam como Issues "[Playtest]" no GitHub. Use quando o Felipe disser que jogou, mandar uma lista de problemas ou pedir para ver as Issues.
---
# Triar o playtest

Os problemas de playtest chegam como Issues com o título "[Playtest] ..." e o rótulo `bug`, pelo modelo `.github/ISSUE_TEMPLATE/playtest.yml`. Se o Felipe mandar a lista pelo chat, abra uma Issue por item com esse mesmo modelo antes de começar.

## Passos

1. Liste as Issues abertas com "[Playtest]" no título pelo conector do GitHub (`search_issues` ou `list_issues` no repositório `Felipebonamigo/SpeedTche`).
2. Ordene pela gravidade do formulário: trava, quebra a partida ou progresso, atrapalha, incômodo, sugestão. Sugestão não é defeito: vira item de plano, não correção.
3. Reproduza antes de mexer: use a skill `capturar` e os `scripts/playtest*.mjs`. Se não reproduzir, comente na Issue o que tentou e pergunte o que falta.
4. Corrija com teste: o defeito vira teste visto falhar antes da correção, quando a regra for testável.
5. Verifique com a skill `verificar`.
6. Commit pequeno em português, citando a Issue: `Corrige <o quê> (fecha #N)`, no branch `main`.
7. Comente na Issue o commit e o que mudou, numa frase, terminando com o rodapé do Claude Code. Se a correção depende de o Felipe jogar de novo, diga isso e deixe aberta.
8. Ao fim, resuma para o Felipe: o que fechou, o que ficou aberto e por quê.
