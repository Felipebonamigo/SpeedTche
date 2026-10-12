## L2b — Restos da L2 (fundo do menu, qualidade automática, 30 fps, folha de contorno)

> Cartão **bounded** escrito sobre `01c383e` (0.1.3), branch `nc/l2b`, worktree `/home/user/speedtche-wt/l2b`. Sem GPU aqui: nenhum FPS
> vale; só contagem e captura. Procure sempre pelo símbolo (linhas conferidas em 12/10/2026).

### Itens, design em duas frases e levantamento

1. **Fundo do menu com carros correndo.** O `renderIdle` troca `cars.hide()` por `cars.update/pose` com uma lista decorativa de carros
   (`render/menu-backdrop.ts`, puro: z à frente da câmera do fundo, rodando a quase a velocidade dela, sem núcleo, sem `RaceState` real); o
   número de carros vem do degrau (`backdropCount`: Baixa 0, Média 3, Alta/Ultra 5) e é 0 com `reduceEffects`; o palco da garagem (N2) segue
   com prioridade porque `renderStage` devolve antes. *Onde:* `renderer.ts: renderIdle` (`cars.hide()`), `cars.ts: update/pose/hide`.
   O fundo só sabe a qualidade e o `reduceEffects` por um módulo de preferências (`render/prefs.ts`) alimentado pelo `commitSettings` e pelo
   boot, porque `renderIdle(time, track)` não recebe opções e o `session.ts` não é desta frente.
2. **Qualidade automática na 1ª abertura.** `pickAutoQuality(probe)` (puro: núcleos, memória, tela × dpr, mediana de ~20 quadros, nome do
   GPU: software ⇒ Baixa; Electron/Deck ⇒ Média) roda no `boot()` do `main.ts` **só quando não há settings salvos** e grava
   `quality` + `autoQuality` (campo aditivo opcional); quem já tem settings salvos nunca é tocado, e Opções sobrescreve sempre.
   *Onde:* `settings.ts: sanitizeSettings` (campo novo), `main.ts: boot`. Desligada sob automação (`navigator.webdriver`) e com `?autoq=0`.
3. **30 fps travados na Média (3 e 4 jogadores).** Campo `lockFps30` (padrão falso) em Opções › Visual; o renderizador pula só o
   **desenho** dos viewports (não `cars.update`/`effects.update`/HUD) quando o intervalo desde o último desenho é < ~28 ms, e a resolução
   dinâmica passa a medir contra 33 ms nesse modo. *Onde:* `renderer.ts: render`, `postfx/fps-lock.ts` (novo), `dynres.ts` (meta mutável).
4. **Resolução dinâmica:** já existe (`postfx/dynres.ts`, ligada no jogo, desligada sob automação e com `?dynres=0`). Só confirmada.
5. **Folha A/B/C de contorno:** `tools/folha-contorno.mjs` captura o carro e o cenário pelo harness e, numa página à parte, aplica 3 contornos
   (A fino escuro, B grosso suave, C colorido pelo tom) lado a lado em `scratch/folha-contorno.png`. Não mexe no jogo.
6. **`playtest-memoria`**: rodar e reportar; ponto da M6: aquecimento do primeiro quadro.

### Testes (antes, vistos falhar)
`tests/menu-backdrop.test.ts` (contagem por degrau, 0 com reduzir efeitos, carros sempre à frente e nas faixas, determinístico),
`tests/qualidade-automatica.test.ts` (escolha pura, só sem settings salvos, `webdriver`, campo aditivo no saneamento),
`tests/fps30.test.ts` (limitador só na Média com 3–4 jogadores e opção ligada; Opções mostra e grava), `tests/gl-render.test.ts` (já cobre o
fundo do menu; o fundo com carros entra na compilação).

### Riscos
- Fundo com carros usa os mesmos materiais dos da corrida: na 1ª vez compila programas (aquecimento do primeiro quadro do menu).
- Pular desenho não pode deixar o HUD parado nem a resolução dinâmica descer por engano (por isso o alvo de 33 ms).
- Nenhuma migration: campos novos são aditivos com padrão (`lockFps30: false`, `autoQuality` ausente).
