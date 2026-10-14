---
name: traduzir
description: 'Escreve e confere o texto do Speed Tchê nos idiomas do jogo (PT e EN), com um glossário único dos termos, e acha texto que ficou fora da tradução. Use ao criar ou mudar qualquer texto que o jogador lê (menu, HUD, tutorial, loja), quando o Felipe pedir "traduz", "põe em inglês/espanhol" ou "tem texto sem tradução".'
---
# Traduzir

Idiomas: português e inglês hoje; ES, DE, FR e JA só depois do lançamento (`docs/ROADMAP.md`). As fontes embutidas só têm
o alfabeto latino: japonês pede refazer o subconjunto (`docs/ARTE.md`).

## Como o texto funciona neste jogo

Cada área registra o próprio namespace: `registerStrings('<ns>', { pt, en })` num `strings.ts` da pasta (23
arquivos em `src/**/strings.ts`, mais `src/i18n/core.ts` com pistas, copas, estados e carros). `t('ns.chave', { n })`
cai para o PT se faltar o EN. O `tests/i18n.test.ts` só exige que toda chave exista nos dois idiomas.

## Passos

1. Escreva o texto já em todos os idiomas do jogo, no mesmo commit. Texto só em PT não entra.
2. Use os termos do glossário: `docs/GLOSSARIO.csv` (colunas `termo_pt`, `en`, `nota`; crie na primeira vez). Termo novo de jogo (golpe, modo, peça, recurso) entra no glossário
   antes de aparecer na tela.
3. Confira: `npx vitest run tests/i18n.test.ts` e o conferidor desta skill, que pega o que o teste não pega (texto vazio,
   `{parâmetro}` diferente entre PT e EN, chave usada no código que não existe em nenhum `strings.ts`):
   ```bash
   node .claude/skills/traduzir/conferir_textos.mjs                     # sai 1 se achou problema
   node .claude/skills/traduzir/conferir_textos.mjs --ns ui --iguais    # mostra também o que ficou igual em PT e EN
   ```
   Hoje passa com 0 problemas; os 160 textos iguais nos dois idiomas são quase todos nome próprio. Parâmetro diferente
   de propósito (o sufixo do ordinal em inglês) entra na lista `PARAMETROS_DE_PROPOSITO` do script, com o motivo.
4. Texto longo (tutorial, loja): releia no idioma de destino como alguém daquele país leria. Tradução literal de
   gíria gaúcha ou de futebol não funciona; ache o equivalente.
5. Veja na tela: o inglês e o espanhol costumam ser 20 a 30 % mais longos que o português. Com o preview no ar, `node scripts/pistas-ui.mjs` (telas em inglês) e `node scripts/playtest-layout.mjs` (texto grande).

## Armadilhas

- Na Steam, "Espanhol - Espanha" e "Espanhol - América Latina" são idiomas separados; o mesmo vale para "Português -
  Brasil" e "Português - Portugal". Declare só os que o jogo tem de verdade.
- Número, data e moeda mudam com o idioma (1.000,5 em PT, 1,000.5 em EN).
- Nome próprio de lugar real, marca e nome de pessoa não se traduzem; e o jogo não tem marca real (CLAUDE.md).
- O jogo abre em PT mesmo num sistema em inglês: não há detecção de idioma, e o item L-4 do `docs/QA.md` espera o
  contrário. É pendência, não regra.
- Ficam fora da tradução o relatório de erros (fixo em inglês) e o Rich Presence da Steam (ainda não configurado).
- "Tchê" é identidade do jogo: não se traduz.
