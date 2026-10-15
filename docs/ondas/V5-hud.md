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

## Resultado (15/10/2026, `nc/hud`)

- **O que ficou:** os blocos dos cantos sem caixa; posição 58 u (era 46), tempo 36 (32), velocidade 52 (44), volta 18 (16), "/20" 20 (16),
  combustível/nitro 18 (15). Contorno `-webkit-text-stroke` com `paint-order: stroke fill` (a tinta não é comida) e sombra dura na cor do contorno;
  posição e velocidade com o eco rosa dos títulos do menu; a faixa de três cores embaixo da posição e em cima do minimapa. Itálico sintetizado
  (`font-synthesis: style`: a Fredoka não tem face itálica; peso acima de 700 continua sem síntese). Barras de combustível e nitro finas e
  inclinadas (trilho escuro + fio claro de 1 px); os raios do nitro descem de linha quando o rótulo "NITRO · EQUIPE" não deixa espaço. Minimapa:
  traçado com contorno escuro (`path.casing` + `path.line`, o mesmo na célula livre de 3P) e o nome com piso de 10 px (antes 8 px no 2P). Vidro
  escuro do tema na fala do rival/aviso de câmera (`.msg.info`), na classificação de 3P e na roda de frases (`src/voice/hud.css`, com a cor do
  assento num fio à esquerda). Sai o `div.lines` (M5).
- **Testes:** `tests/hud-estilo.test.ts` (9, vistos falhar: tokens ausentes, `font-synthesis: none`, sem itálico/contorno), `hud-dom` (+1, visto
  falhar: `.tl` era `.glass`), `fx-hud-linhas` (reescrito, visto falhar: `'lines'` no `hud.ts`, `.lines` no `hud.css`); `npx tsc` limpo; 23 arquivos
  de HUD/UI/voz/tutorial/i18n (405 testes) verdes.
- **`playtest-layout`:** no build de antes (550e970 + só o roteiro novo) as 8 conferências novas falharam e o resto da parte do HUD e das dicas passou (175 ✓). Depois:
  telas de menu **686/686** combinações limpas (build de 6894257; o conserto seguinte só tocou `.bl`/`.nitro` do HUD) e a parte do HUD e das dicas
  **toda verde** no build final (a787523: 183 ✓, 0 ✗). A primeira rodada pegou `bl×lmk` e `fuel-flag×lmk` no 4P a 1024×640 com HUD 80%
  (o piso de 150 px do bloco encostava 4 px na legenda dos marcos): piso de 132 px e os raios que descem de linha, a787523. Medidas no 2P a
  1280×800: posição 43 px (era 34,1), "/20" 14,8, volta 13,3, tempo 26,7, velocidade 38,5, marcha 16,3; no 4P a 1024×640 com HUD 80% tudo
  ≥ 12 px e contorno de 1,5 a 2,4 px.
- **`playtest-voz`:** 738 ✓, 0 ✗ (build de 6894257) e o 4J a 1024×640 de novo no build final: 78 ✓, 0 ✗ (a roda e os balões não cobrem os
  blocos do HUD).
- **Galeria antes × depois:** `scratch/galeria/comparar-main-550e970-vs-hud.png` (+ `.json`), cenas Copacabana, Sampa noite, Monte Fuji, 2P,
  4P e largada: as 6 mudaram (15–32% dos pixels, só o HUD); chamadas e triângulos idênticos (nada no 3D). Monte Fuji na reta do segmento 80 tem
  neve só nos morros do fundo: o "dia claro" é o céu azul-claro; a neve de verdade e o asfalto claro entram pelo teste de contraste.
- **`playtest.mjs`** (build final): 37 ✓, 0 ✗ até "Próxima copa" (corrida, HUD de 1 a 4 jogadores, resultado, pausa, copa); a máquina estava com
  carga 40–60 em 4 núcleos e o roteiro foi cortado no limite de 2 h antes do Pagamento da carreira (N4, telas de menu que a V5 não toca). A 1ª
  tentativa morreu na captura do título (timeout de 240 s, carga).
- **Suíte inteira** (`NC_REQUIRE_RELAY=1 NC_REQUIRE_GL=1 … --reporter=dot`, em 3 fatias `--shard` porque a rodada única passou do limite de 2 h
  com a carga): **3811 ✓**, 1 pulado (o de sempre), **14 falhas, todas por tempo** (`Test timed out`, nenhuma asserção): `fuel.test.ts` (11 casos de
  "aviso ao jogador", limite de 30 s), `landmarks.test.ts` (perLap, 120 s), `scenery.test.ts` (sprites × colisão) e `gl-render.test.ts` (compilar
  os programas, 1500 s). Repetidos sozinhos: 269 ✓ e 6 de novo por tempo, **em casos diferentes** dos da 1ª vez (fuel: copacabana, paraty,
  curitiba). `fuel`, `landmarks` e `scenery` não importam nada que a V5 mudou (núcleo e cenário); o `gl-render` sobe a página inteira, mas o que
  estoura é a compilação dos shaders no swiftshader. **Falta rodar a suíte numa máquina folgada antes de mesclar.**
