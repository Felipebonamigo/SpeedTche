# Pedido para a sessão local: teste de 1 carro no Meshy

Texto para o Felipe colar numa sessão LOCAL do Claude Code, no PC dele, dentro do clone do `Felipebonamigo/SpeedTche`.
Escrito em 18/10/2026.

```
Contexto: Speed Tchê (corrida arcade, TypeScript + Three.js + Electron). O dono acha que os carros ainda parecem mal feitos perto do
Horizon Chase Turbo e quer testar se o Meshy faz um carro melhor que a nossa modelagem por script. Esta tarefa é UM teste, com UM carro.

Antes de tudo, leia: CLAUDE.md, docs/PLAYBOOK.md, .claude/skills/modelo-3d/SKILL.md, docs/ARTE.md (tabela de licenças e pipeline de
carros), docs/CARROS.md, tools/blender/README (nossa biblioteca Blender por script) e src/render/cars/check.ts e gltf.ts (o contrato do
.glb de carro: nós, materiais, orçamento de triângulos).

Tarefa: gerar no Meshy o **Falcão GT** (o carro de referência do jogo) e ligá-lo ao jogo numa BRANCH para comparação.
1. Chave e créditos: use o Meshy que já estiver ligado nesta sessão (MCP ou a variável MESHY_API_KEY). TETO: 60 créditos no total
   (≈ 30 por modelo com textura; no máximo 2 tentativas). Passou disso, pare e me avise. Não compre nada, não aceite EULA, não
   mude de plano.
2. Entrada: gere por TEXTO (text-to-3D), ou por imagem SÓ se a imagem for nossa (uma captura do Falcão do próprio jogo, de
   `tools/galeria` ou `tools/capture.mjs`). **NÃO use a imagem do Horizon Chase nem foto de carro de marca como entrada**: é arte e
   marca de terceiros. A imagem do Horizon Chase serve só para eu comparar com os olhos.
   Prompt-base (ajuste): "stylized arcade supercar, mid-engine GT, low and wide, smooth glossy body panels, dark tinted glass, four round
   tail lights with glowing orange cores in a black rear panel, honeycomb grille vents, dual chrome exhaust tips, rear wing on struts,
   large five-spoke wheels with deep rims, clean game-ready topology, no logos, no text, no badges" — modo PBR com textura, pose A/neutra,
   carro de frente +X como no jogo, escala 4,4 m.
3. Pós-processo: remalha para ≤ 20.000 triângulos no total (herói), separe as rodas em 4 nós, vidro, luzes (faróis e lanternas) e casco
   em materiais separados com os NOMES que o jogo espera (veja check.ts e a biblioteca tools/blender), origem no chão no centro do
   carro, eixos e pegada iguais aos do Falcão atual (z −1,34/+1,38, x 0,79 — confira em src/core/data/cars.ts e CARROS.md) para a
   física não mudar. Tire qualquer logo, emblema ou texto que o Meshy tenha inventado. Use o Blender (pip install bpy num venv fora do repo)
   ou o que houver na máquina.
4. Ligue ao jogo numa branch `nc/meshy-gt` (NÃO empurre no main; empurre só a branch): registre em docs/ARTE.md a linha de licença
   "gerado na conta do Meshy — crédito '3D models generated with Meshy (meshy.ai).'" e marque como conteúdo de IA para a declaração
   da Steam (.claude/skills/declaracao-ia). Se o jogo não aceitar o modelo do Falcão trocado de forma simples, faça a opção
   `?carro=falcao-meshy` no harness (tools/render-harness) só para a comparação, sem tocar nos dados do jogo.
5. Comparação (o que importa): a mesma câmera de corrida de dia (câmera Alta), a 3/4 traseira, a 3/4 frente, a noite com freio e a
   garagem, para (a) o Falcão atual do main, (b) o Falcão do Meshy. Use `node tools/galeria/gerar.mjs` e o harness. Monte uma folha
   (atual × Meshy) e abra as imagens. Eu mesmo coloco ao lado da referência do Horizon Chase.
6. Custo no jogo: triângulos e chamadas em copa-4p e Sampa-4p (Média/Alta) com o carro novo, contra src/bench/gate.ts. Diga quanto
   estoura, sem subir limite.
7. Relatório curto: créditos gastos de verdade, o que o Meshy errou (rodas, simetria, topologia, textura), tempo de retrabalho, se o
   resultado é melhor, igual ou pior que o atual, e a sua recomendação (vale para os outros 25 carros? só para o herói? descartar?).

Regras: commits pequenos na branch com o rodapé de atribuição de sempre; nunca pkill/killall/kill $(pgrep -f …) (só pelo PID que
você iniciou); nunca mexa no main; termine com DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED e os caminhos das imagens.
```

Dica: anexe na conversa a captura do Horizon Chase que você me mandou, para a sessão local comparar com os olhos. Ela não pode virar
entrada do Meshy.
