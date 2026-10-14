---
name: modelo-3d
description: Procurar, registrar e reaproveitar modelos 3D entre os jogos do estúdio. Use antes de baixar, gerar no Meshy ou trocar qualquer modelo, textura ou animação do Speed Tchê, e sempre que um modelo novo entrar no jogo.
---
# Modelo 3D: procurar antes, registrar depois

Os quatro jogos do Felipe dividem um acervo de modelos. Esta rotina evita baixar duas vezes, gastar crédito do Meshy à toa e perder a licença de um arquivo.

## Antes de baixar ou gerar

1. Procure na aba "Modelos 3D" do doc do estúdio (https://claude.ai/artifact/72KXW2Tve5gB65BHD1CDp6). Leia pelo conector do Claude Docs (`read` do doc e depois da aba "Modelos 3D"); nunca por WebFetch.
2. Procure no repositório `Felipebonamigo/acervo-3d`, no `catalogo.csv` (colunas `arquivo`, `categoria`, `titulo`, `fonte`, `autor`, `licenca`, `url`, `usado_em`). Se ele não estiver na sessão, anexe com `add_repo` ou leia pelo conector do GitHub.
3. Confira se o estilo serve: o Speed Tchê é cartunesco: todo modelo baixado passa por `tools/convert-landmark.mjs` ou `npm run convert-car`; nada da Epic (o jogo não é Unreal).
4. Se nada servir, procure pronto nesta ordem: Sketchfab (a chave já vem pelo proxy em `api.sketchfab.com`), galeria CC0 do Meshy, Poly Haven, Kenney, Quaternius.
5. Gerar no Meshy só em último caso, e **sempre perguntando ao Felipe antes**, com o número de créditos (~30 por modelo com textura). Aceitar EULA, logar em conta ou comprar: só o Felipe autoriza.

## Licença

- Aceita: CC0, CC BY 4.0 com crédito, gerado na conta do Meshy (com crédito "3D models generated with Meshy (meshy.ai)." enquanto o plano da data não for confirmado), conteúdo da Epic só em jogo Unreal, o que o Felipe criar.
- Recusa: NC, ND, "uso pessoal", "from <jogo>", reupload sem autor, origem não comprovada.
- Conteúdo de IA que o jogador vê é declarado na Steam: marque no registro do jogo.

## Depois que o modelo entrou (no mesmo dia)

1. No jogo: a linha na tabela de licenças de `docs/ARTE.md` (o teste `car-pipeline` reprova `.glb` sem linha) e, se faltar pronto, o item em `docs/MESHY-LISTA.md`.
2. No acervo (`Felipebonamigo/acervo-3d`, público): o arquivo em `<categoria>/<fonte>/`, a linha no `catalogo.csv` e, se for CC BY ou da conta do Meshy, a linha em `CREDITOS.md`. Nada acima de 50 MB, nada da Epic nem do Mixamo.
3. No doc do estúdio: a linha na tabela da categoria certa da aba "Modelos 3D", com o menu "Licença" preenchido.
4. Se o modelo veio de outro jogo, acrescente o Speed Tchê em `usado_em` no `catalogo.csv` e na coluna "Usado em" da aba.
