# V5 — HUD de corrida enxuto, no estilo do menu novo

> Base: `main` 550e970 (tema padrão `speedtche` e logo "cromo" já no `main`), branch `nc/hud`, worktree `/home/user/speedtche-wt/hud`, 15/10/2026.
> Item V5 da "Auditoria de 14/10/2026" (`docs/CRONOGRAMA.md`). Frente **bounded**: só CSS/DOM do HUD; nada no núcleo.

## Objetivo

A auditoria viu painéis com moldura nos 4 cantos (posição/volta, tempo, combustível/nitro, velocímetro + minimapa) ocupando muito da tela;
a referência (Horizon Chase Turbo) usa **números grandes, itálicos e sem caixa**, com contorno/sombra para ler sobre qualquer fundo. Diretriz do
dono: "mais bonito que o Horizon Chase". O HUD passa a falar a língua do tema `speedtche` (V3): itálico forte nos números, faixa de pôr do sol
(laranja/rosa/azul) como acento, vidro escuro só onde há texto corrido (fala do rival, classificação da célula livre).

## O que muda (só apresentação)

| Onde | Antes | Depois |
|---|---|---|
| Posição, volta, segundos (canto sup. esq.) | painel gordo com contorno branco | sem caixa: "12º" grande em itálico com contorno escuro e sombra dura; "/20", volta e ▲▼ segundos em itálico menor |
| Tempo (topo) | painel | sem caixa, itálico; últimas voltas e fantasma embaixo |
| Combustível e nitro (inf. esq.) | painel | sem caixa: ícone + rótulo + número e barras **finas** com trilho escuro e fio claro (forma + número + rótulo; nada só de cor) |
| Velocímetro (inf. dir.) | disco de vidro | sem disco: número grande em itálico, arco fino de RPM com trilho escuro, marcha |
| Minimapa | caixa de vidro | moldura mínima: traçado com contorno escuro, nome da pista em itálico com a faixa de três cores |
| Selos e mensagens (+N, VÁCUO, BAIXO, LARGADA PERFEITA, ÚLTIMA VOLTA, contagem, avisos) | pílulas com contorno branco | mesma informação e mesmo lugar, no estilo do tema (itálico, inclinado, degradê/sombra dura) |
| `div.lines` (M5) | criado, ligado e escondido por CSS | removido do `hud.ts`, do `hud.css` e do `access.css` |

Tokens do HUD na raiz `.nc-hud` (`--h-ink`, `--h-edge`, `--h-sun`…), **não** no `:root` nem no `#ui`: o menu não muda, e o HUD não depende do
`data-tema` (vale também no render-harness e na galeria). `?tema=classico` continua só para os menus.

**Mantém** (nada de comportamento muda): mola da posição e o selo ±N, segundos para frente/trás, ÚLTIMA VOLTA, VÁCUO, LARGADA PERFEITA,
dicas (O3), balões e roda de frases (N6), estrelas/placar do rival (O4: falas `info`), aviso "Câmera: Capô", legenda dos marcos, tela dividida
2–4P com HUD por viewport e a célula livre de 3P, escala do HUD 80–150 % (`--hud-scale`), "Reduzir efeitos", piso de 12 px efetivos nos números
e 10 px nos rótulos. Os nós e as classes que os testes e as outras frentes leem ficam (só sai `.glass` dos painéis dos cantos e o `div.lines`).

## Testes antes (vistos falhar)

- `tests/hud-estilo.test.ts` (novo): (1) os painéis dos números principais (`.tl`, `.tr`, `.bl`, `.br`, `.mini`) não são `.glass` e o `hud.css`
  não lhes dá fundo, borda nem desfoque; (2) os números principais (`.pos-n`, `.time`, `.kmh`, `.lap`) estão em itálico e têm contorno
  (`-webkit-text-stroke` com `paint-order`) e sombra; (3) **contraste do contorno**: tinta × contorno ≥ 7:1 (WCAG) e, em cada fundo de
  referência (neve/céu claro, asfalto de dia, entardecer, noite), a tinta ou o contorno passa de 4,5:1; (4) piso: todo seletor de número do
  HUD segue com `max(12px, …)` e o contorno com piso em px (não some no 4P a 80 %); (5) não existe mais `div.lines`.
- `tests/fx-hud-linhas.test.ts`: passa a exigir que `.lines` não exista em `hud.ts`, `hud.css` nem `access.css` (antes exigia a regra escondida).
- `scripts/playtest-layout.mjs` (só **acrescenta**): na parte do HUD, por viewport, os painéis dos números sem fundo/borda/desfoque e os
  números com contorno; o resto (piso, sobreposição, dicas) igual.

## Verificação

`npx tsc --noEmit -p .`; testes de HUD/UI (`hud-*`, `fx-hud-linhas`, `fonts-hud`, `voice-hud`, `assist`, `ui*`); `node scripts/playtest-layout.mjs`
completo; `node scripts/playtest.mjs`; `node scripts/playtest-voz.mjs` se a roda de frases mudar; galeria antes × depois
(`main-550e970` × `hud`: Copacabana, Sampa noite, Monte Fuji, 2P, 4P, largada) com `comparar.mjs`; suíte completa no fim.

## Fora

Arte nova (fonte itálica de verdade, ícones desenhados), velocímetro em barra no estilo HCT (o arco fino fica: mesma caixa, layout medido), o
HUD do modo Retrô ganhar visual próprio (ele usa este mesmo `Hud`), `src/render/cars/**` (V2) e pista/cenário/céu (V4).
