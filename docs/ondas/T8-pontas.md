# T8 — Pontas soltas das frentes

> Base: 194e32a (`main` 0.1.5 + HUD V5 + efeitos V8 + pistas V4 + progresso O5), branch `nc/pontas`, worktree `/home/user/speedtche-wt/pontas`,
> 15–16/10/2026. Item T8 da "Auditoria de 14/10/2026" (`docs/CRONOGRAMA.md`). Nada em `src/core`: `sim-golden` e `determinism` não mudam.

## Resultado por item

| # | Ponta | O que foi feito | Teste (visto falhar antes) |
|---|---|---|---|
| 1 | Garagem só com as cores | O painel do palco (`StagePanel.look`, `ShowroomOptions.look`) leva o visual inteiro do assento (`seatLook`); o `Stage` o passa ao `Cars.poseDisplay` (acabamento, roda, aro, faixa). Com o **nitro em foco** na garagem, a chama acende nos escapes **na cor escolhida** (`DisplayCar.flame`; menor com "Reduzir efeitos"). | `garage-stage` (2), `stage-bus` (1), `podio-visual` (2): `expected undefined …` |
| 2 | Pódio só com `look.paint` | `podiumEntries` usa `raceLooks` (o visual que a corrida desenhou, com a troca de pintura de dois humanos iguais); `PodiumEntry.look`, `mountPodium` o guarda, `posePodium` o posa. IA de fábrica. | `podio-visual` (3), `stage-bus` (1) |
| 3 | `crestLift` não aplicado ao carro | **Não aplicar** (fica só na câmera, onde já é usado): a elevação começa 10 m **antes** do topo, com o carro ainda na subida — ele sairia do chão no morro; e um carro no ar sem pulo na física pareceria flutuar (a diretriz é "mais realista que o Horizon Chase"). Pulo de verdade seria física (núcleo, `sim-golden`): decisão do dono, se quiser. | `camera-dinamica` "T8": trava a forma e que o `cars.ts` não usa a cresta; visto falhar com um mutante que a importa no `cars.ts` |
| 4 | `mountShowroom` fora do lobby | Fora do Retrô, a silhueta SVG do cartão vira a janela `.car-stage` (mesma proporção 200×72 e altura máxima): o carro de cada assento no palco 3D, com o visual do assento, a cor do assento, a **qualidade** das Opções (a Baixa desenha sem pós, como já provado por `stage-gl` em 1 e 4 janelas por degrau) e o **"Reduzir efeitos"** (o prato não gira — vale também na garagem). Carro trancado (O5): grafite (`LOCKED_PAINT`), sem o visual. O vidro do cartão vira máscara com buraco (como a garagem); assento que sai e o `destroy` soltam o painel; `.stage3d` só enquanto há janela. | `lobby-palco` (5 de 6) e `podio-visual` (prato com reduzir efeitos) |
| 5 | Dicas de frear/derrapar na Copacabana | **Causa:** a dica de derrapar usava a regra da IA (`wantsDrift`: curva ≥ 1,5 por 18 segmentos); a Copacabana do traçado M6 tem no máximo 17. Mas a carga da derrapagem sobe com curva ≥ `DRIFT_CHARGE_MIN_CURVE` (1,0), e nesse critério a Copacabana tem trechos de 30 a 57 segmentos: agora `driftPays` mede o trecho na velocidade de agora contra o nível 1 da carga (×1,2). **Frear:** nível 1, o Falcão (P1) segura todas as curvas na máxima (1,092 de folga na mais fechada), então a dica corretamente não aparece para ele; aparece para Trovão (P2), Pororoca e Iara. Defeito achado de quebra: a dica de frear aparecia acima da máxima (impulso, vácuo) numa reta sem curva (`brakingTarget` com teto 1): agora sem teto. | `dicas-copacabana` 3 de 7 (`expected [null…] to include 'drift'`, `expected 'brake' not to be 'brake'`) |
| 6 | Recusa da oferta só em memória | Campo aditivo `Settings.assistOfferDeclined` (recusar grava; aceitar não); a sessão nova marca a oferta como feita. Opções da 0.1.5 abrem iguais e com a oferta de pé; as novas trazem todos os campos que a 0.1.4/0.1.5 leem, com os mesmos valores (`docs/SAVE.md`, "Recusa da oferta"). | `oferta-assistencia-save` (3), `oferta-assistencia-sessao` (2) |
| 7 | `div.lines` do HUD | Confirmado: já saiu na V5 (`tests/hud-dom.test.ts` e `tests/fx-hud-linhas.test.ts` cobram). | — |
| 8 | O5 sem estilo no tema | Bloco "Progresso (O5)" no `tema-speedtche.css`: cadeado em vidro escuro com listras e texto creme itálico; carro trancado em grafite; distintivo do nível em disco de vidro, número em itálico com contorno (HUD V5) e moldura de fio cinza → bronze → prata → ouro → anel de pôr do sol com brilho azul (nitro); XP em itálico com contorno (subiu de nível: amarelo de sol); cartão do que liberou com o traço de pôr do sol. **Só repinta** (nenhum tamanho, margem, peso ou borda). | `tema-o5` 19 de 20 (regra por classe, contraste ≥ 4,5:1 sobre o pior fundo do vidro, contorno, "só repinta") |

O título do quadro de conquistas no resultado compacto usa `#ffbd85` em vez do `#ffad6b` dos rótulos do tema: este dava 4,46:1 sobre o vidro com
cenário claro atrás (o teste mediu). Os outros rótulos do tema com `#ffad6b` não foram tocados (fora do escopo; ficam como observação).

## Ressalvas (para o dono ler)

- **Lobby em 3D perde o fundo do menu.** Como na garagem, com uma janela de palco na tela o canvas é do palco (fundo azul-marinho liso) e o
  `.stage3d` tira o véu de pôr do sol: o lobby deixa de mostrar a cidade 3D atrás dos cartões (`comparar-lobby-*.png`). E o carro fica pequeno
  na janela do cartão 2×2 (a janela é do tamanho da silhueta antiga, para o layout não mudar). Se incomodar: janela maior no cartão (mexe no
  layout, refazer o `playtest-layout`) ou desenhar o fundo do menu por trás das janelas do palco (mexe no `stage.ts`).
- **Dica de frear na Copacabana:** com o Falcão (o carro do P1) ela continua não aparecendo, porque no nível 1 nenhuma curva pede freio para
  ele. Querer a lição de frear na 1ª corrida com o Falcão é decisão de traçado (curva mais fechada) ou de texto (uma dica de "aliviar"), não de
  gatilho.
- **0.1.4/0.1.5 regravando as opções** derrubam o `assistOfferDeclined` (lista branca do saneador delas): a oferta pode aparecer mais uma vez.
- `playtest-layout` mede o layout mas fotografa o palco atrás da corrida que ele prepara (o palco só desenha sem corrida): as capturas do
  lobby 3D vêm de `scratch/t8-lobby.mjs` (página nova, sem corrida); as do palco, do laboratório `tools/stage-harness.lab.html`.

## Saídas (16/10/2026)

- `npx tsc --noEmit -p .`: sem saída (código 0).
- Testes da área (23 arquivos: os 6 novos + tips, sessão de dicas, oferta, palco, garagem, cadeado, look, pintura, câmera, temas, progresso,
  HUD, i18n, determinism): `Test Files  23 passed (23)`, `Tests  273 passed (273)`.
- `playtest-layout` nas cenas tocadas (lobby-1/4, editores, trancados, torneio 8/trancado/tabela, os 5 resultados, recordes, recordes-nível,
  garagem 1/2/4), 7 resoluções × 2 textos: `✓ telas de menu sem problema de layout: 266/266 combinações limpas`, `✓ sem erros no console ()`.
- GL (`NC_REQUIRE_GL=1 npx vitest run tests/stage-gl.test.ts tests/gl-render.test.ts --no-file-parallelism`): `Test Files  2 passed (2)`, `Tests  25 passed (25)`, `Duration  2152.55s`.

## Capturas (antes = 194e32a, depois = `nc/pontas`; mesma câmera)

`scratch/t8/comparar-garagem.png`, `comparar-garagem-nitro.png`, `comparar-podio.png`, `comparar-lobby-1.png`, `comparar-lobby-4-trancado.png`,
`comparar-o5-{lobby-4-locked,tournament-locked,results-busy-progress,results-progress-4,records-level}.png` (`scratch/` não vai para o git).
