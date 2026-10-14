---
name: capturar
description: Tira capturas do Speed Tchê no Chromium headless e prova mudança visual com antes × depois. Cobre o vite numa porta própria, tools/capture.mjs, tools/render-harness.mjs, o playtest-layout depois de mexer em CSS, a fila de captura (flock) e a conferência da imagem com o Read. Use para "tira um print", "captura", "screenshot", "antes e depois", "ver como ficou", "roda o playtest" ou depois de qualquer mudança visível.
---
# Capturar e ver o jogo

Fontes: `docs/PLAYBOOK.md` §1, §3 e §5, `docs/ondas/K.md` §2.4 e §3.2, e os cabeçalhos de `tools/capture.mjs` e `tools/render-harness.mjs`.

## Quando usar
Toda mudança visível se prova com captura antes × depois, na mesma câmera (mesma query). "Deveria ficar bom" não conta.

## Passos
1. Escolha uma porta só sua (o PLAYBOOK usa 5601, 5611, 5612…; a 5174 e a 4174 são os padrões que todo mundo pega) e veja se está livre:
   ```bash
   lsof -iTCP:5611 -sTCP:LISTEN -n -P          # sem saída = livre
   ```
2. Suba o vite de desenvolvimento: as ferramentas de `tools/` abrem `/tools/render-harness.html`, que só ele serve. Chame o binário
   local, para que o `$!` seja o PID do próprio servidor. Com `npx vite`, o `$!` é o `npm exec`, e matar esse processo deixa o vite órfão na porta.
   ```bash
   ./node_modules/.bin/vite --port 5611 --strictPort > scratch/vite-5611.log 2>&1 & echo $! > scratch/vite-5611.pid
   until curl -s -o /dev/null http://localhost:5611/; do sleep 1; done
   ```
   O `--strictPort` faz o vite sair com erro se a porta estiver ocupada, em vez de pular para outra.
3. Captura na corrida, dentro da trava (veja "Fila de captura"). Passe sempre o `PORT=`: sem ele, a ferramenta usa a 5601, que pode ser de outra frente.
   ```bash
   PORT=5611 flock /tmp/nc-captura.lock node tools/capture.mjs "x-antes::track=copacabana&seg=70&hud=0"   # → scratch/x-antes.png
   ```
   Parâmetros da query:
   - `track`, `seg`, `hud=0`, `humans=2|3|4`, `car`, `paints`;
   - `q=low|medium|high|ultra` (padrão high), `cam=high|low|hood|bumper` (padrão Alta; por assento: `cam=hood,low`), `tod=day|dusk|night`.
   Para achar o segmento e o lado de um marco: `npx tsx tools/landmark-sight.ts <pista>`. Capture uns 40–80 segmentos antes dele.
4. Cenas prontas do renderizador. Cada uma imprime draw calls, triângulos, texturas, programas e erros.
   ```bash
   flock /tmp/nc-captura.lock node tools/render-harness.mjs 5611 split4      # → scratch/render-<cena>.png
   ```
   O 1º argumento é a porta (padrão 5174). O 2º filtra pelo nome (`copacabana`, `showroom`, `carro_muscle`, `_front34`…).
5. Antes × depois lado a lado: `node tools/tile.mjs scratch/x-ab.png 2 scratch/x-antes.png scratch/x-depois.png`.
   Se o "antes" é de outro commit: crie um worktree só para ele (`git worktree add /tmp/x-antes <commit>`), com os links de
   `node_modules` do PLAYBOOK §4, e suba o vite dele numa segunda porta.
6. Mexeu em CSS de menu ou de HUD? Rode o `playtest-layout` (26 telas × 7 resoluções × texto normal e grande). Ele usa o build:
   gere o `dist/` de novo e suba o preview na sua porta.
   ```bash
   npm run build
   ./node_modules/.bin/vite preview --port 4181 --strictPort > scratch/preview-4181.log 2>&1 & echo $! > scratch/preview-4181.pid
   flock /tmp/nc-captura.lock node scripts/playtest-layout.mjs http://localhost:4181/ scratch/x-layout
   ```
   Para filtrar: `NC_LAYOUT_ONLY=options,lobby-4`, `NC_LAYOUT_RES=1280x720`, `NC_LAYOUT_TEXT=large`, `NC_LAYOUT_SKIP_HUD=1`, `NC_LAYOUT_DESKTOP=1`.
   Os outros `scripts/playtest*.mjs` também usam o preview e recebem a URL como 1º argumento: passe sempre a URL (o padrão é a 4174).
   O `playtest-records.mjs` é a exceção: exige o vite de desenvolvimento.
7. Abra cada PNG com a ferramenta **Read** antes de afirmar qualquer coisa visual. Captura preta ou vazia não prova nada.
8. Encerre só o que você iniciou: `kill "$(cat scratch/vite-5611.pid)"`, e o mesmo com `scratch/preview-4181.pid`.

## Fila de captura (no máximo 3 ao mesmo tempo)
- A máquina tem 4 núcleos e o swiftshader é lento. Por isso há 3 vagas: `/tmp/nc-captura.lock`, `/tmp/nc-captura-2.lock` e `/tmp/nc-captura-3.lock`.
  Use a vaga que o cartão da onda lhe deu. Sem cartão, use a vaga 1. Quem pega uma vaga ocupada espera a vez sozinho, então rode com `run_in_background`.
- Vai sob a trava todo comando que abre o Chromium com WebGL, ou o Electron:
  - `tools/`: `capture`, `render-harness`, `landmark-sheet`, `bench` e `referencias`;
  - `scripts/`: `playtest*.mjs` e `pistas-ui.mjs`;
  - `xvfb-run … electron`.
  Num laço, a trava vai em cada comando.
- Ficam fora da trava: vitest, `svg2png`, `tile`, `art-sheet`, `shape-to-track`, `landmark-sight` e `balance`.
- No máximo 5 agentes ao mesmo tempo, e no máximo 3 deles capturando (PLAYBOOK §3 e §8; CRONOGRAMA, princípio 11).

## Armadilhas
- Captura preta: pista noturna logo na largada (em `sampa_noite`, use o seg 970), ou o harness não terminou.
- Com 4 jogadores e a máquina carregada, a captura passa dos 30 s padrão do Playwright.
  - O `capture.mjs` e a maioria dos playtests já usam 240 s. O `playtest.mjs` e o `playtest-cameras.mjs` aceitam `NC_PT_TIMEOUT`.
  - O `render-harness.mjs`, o `playtest-online.mjs` e o `playtest-save.mjs` não definem limite: rode uma cópia em `scratch/` com
    `page.setDefaultTimeout(240000)`. Não edite a ferramenta original.
- swiftshader não mede GPU: nenhum FPS daqui vale, só contagem e imagem. O FPS vem do `--bench` do dono.
- Preview velho: ele serve o `dist/` do último `npm run build`.
- `scratch/` é ignorado pelo git (e todo `*.png` fora de `docs/` também): a próxima sessão não vê o que ficou lá. Ferramenta útil
  vai para `tools/` ou `scripts/`, com o modo de usar no cabeçalho.
- **Nunca** use `pkill -f` nem `kill $(pgrep -f …)`: eles casam com o próprio shell e com processos de outras sessões.
  Relay órfão: ache o processo `node` com `ps -eo pid,comm,args`, e só encerre se foi você que o subiu.

## O que registrar
- Os caminhos `scratch/<prefixo>-antes.png` e `-depois.png` e a query usada (a mesma nos dois lados).
- O resultado do `playtest-layout`: `N/N combinações limpas`, `tudo verde` e exit 0, comparado com a linha de base.
- Mande as imagens ao dono com a recomendação (PLAYBOOK §3, passo 8, e §6).
