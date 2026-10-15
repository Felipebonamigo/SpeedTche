# V8 — efeitos de cartum × diretriz realista (15/10/2026)

> **Base:** `main` 550e970, branch `nc/efeitos`, worktree `/home/user/speedtche-wt/efeitos`. **Só render e uma opção** (`src/core`, `hashRace` e
> `sim-golden` não mudam). Cartão commitado **antes** do código; o registro (como cada teste falhou, medidas, capturas) vai na §5.
> Diretriz do dono: "um pouco mais realista que o Horizon Chase Turbo, e mais bonito que ele" (topo de `docs/DIRECAO-DE-ARTE.md`).
> Fora daqui: carrocerias (`cars/styles/**`, `body.ts`: V2), pista/cenário/céu (V4), HUD (V5).

## 1. O que muda

| # | Hoje (galeria 14/10, `main` f241703/550e970) | Depois |
|---|---|---|
| 1 | Batida: balão **"POW!"** (`fx/pow.ts`), **estrelinhas** no teto (`cars/stars.ts`), leque de faíscas amarelas grossas de 8–22 m/s espalhado ±1,2 m em volta do carro, rodopio de 360° e squash & stretch (`cars/motion.ts`) | **Padrão realista:** no **ponto de contato** (entre os dois carros na batida em fila; a quina de fora no cenário) uma chuva curta de **faíscas metálicas** finas (3–9 m/s, 0,12–0,35 s, com gravidade), **lascas** pequenas escuras que caem e quicam (o pool de bolhas que já existe, sem crescer) e um **flash** breve e contido (dois traços largos de ~0,08 s, no mesmo lote); o **tranco** é o tremor que já existe (`Effects.shake`), mais curto; o carro dá um tranco de guinada (3–9°) e um quique pequeno (≤ 0,12 m), sem rodopio nem squash. **"Efeitos de cartum"** (Opções › Acessibilidade, coluna Visão, desligada por padrão; campo aditivo `cartoonEffects` no settings) devolve o POW, as estrelinhas, o leque antigo, o rodopio e o squash & stretch. |
| 2 | Anel do engate do nitro: aro de 22% do raio (1,1 m no fim), 0,8 → 5 m, cor HDR azul (2,0) que o bloom pega | **Anel fino e transparente que some rápido**: malha própria com faixa de ~4% do raio (mesmo material e programa do anel da largada), 0,7 → 3,2 m em 0,22 s, cor ≤ 0,4 (abaixo do limiar do bloom). O anel da largada não muda. |
| 3 | Linhas de velocidade de 9–20 cm, alfa até 0,75, a partir de 85%, ganho 0,76 no entardecer (o limiar do bloom do entardecer é 1,6, o do dia 2,6): brilham | **Finas e sutis**: 3,5–7 cm, alfa até 0,32, só **acima de 90%** (e no nitro); ganho do período 1 de dia e 0,35 no entardecer e à noite (contínuo na corrida que muda). O **túnel do vácuo** (mesmo lote, lia como as mesmas barras brancas na galeria) também vira fio: 5–10 cm, alfa até 0,4 (eram 14–26 cm e 0,8). |
| 4 | Boca do escape (a tampa e o começo da chama, `cars/flame.ts`) azul-branca × 0,45: de trás, de dia, um disco cinza | **Metal aquecido**: a boca em laranja escuro (`FLAME_MOUTH`), em qualquer cor de chama; o corpo da chama não muda. |

Tudo respeita "Reduzir efeitos" (faíscas, lascas, flash, POW, estrelinhas, anel e linhas = 0; o tranco já segue a opção de tremor) e o degrau (`fxPlan`:
o fator de faíscas escala faíscas e lascas). **Nenhum programa novo**: faíscas e flash no lote de traços, lascas no pool de bolhas, o anel novo no material
do anel da largada, a boca da chama no programa da chama (sem uniforme novo). Chamadas: na batida o POW e as estrelinhas (2 malhas) saem e entra no máximo
o pool de bolhas (1); no engate do nitro o anel vai para a malha própria (+1 só se o da largada estiver aceso ao mesmo tempo).

## 2. Testes escritos antes (vistos falhar pelo motivo certo)

`tests/efeitos-realistas.test.ts` (novo, puro) e ajustes de propósito em `fx-plan`, `fx-onda-pow`, `fx-linhas`, `car-movimento`, `car-chama`,
`efeitos-gl` e `cor-brilho-gl` (a boca da chama na imagem).

| Teste | Falha hoje por |
|---|---|
| Padrão: a batida não acende POW nem estrelinhas; com "Efeitos de cartum" acende os dois | POW 1 e estrelinhas 3 no padrão |
| Faíscas da batida no ponto de contato (entre os carros), curtas, finas, com gravidade; lascas escuras pequenas no pool de bolhas; flash ≤ 0,12 s | `fx/impact.ts` não existe |
| Settings: `cartoonEffects` falso por padrão; save antigo (sem o campo) abre igual; lixo vira falso | campo inexistente |
| Anel do nitro: faixa ≤ 6% do raio e ≤ 0,2 m no raio final; cor ≤ 0,45; vida ≤ 0,25 s | faixa 22% (1,1 m), cor 2,0, vida 0,35 s |
| Linhas: nada a 89%; largura ≤ 7 cm; pico aditivo de dia ≤ 0,35; no entardecer ≤ 0,12 e ≤ 0,4 × o do dia | começam a 85%; 20 cm; pico 0,86; entardecer 0,65 |
| Túnel do vácuo: 5–10 cm, alfa ≤ 0,4 (acrescentado depois de ver a galeria do 550e970: as barras brancas do 09 são o túnel) | `traço 0: expected 0.24009574867784977 to be less than or equal to 0.1` |
| Batida padrão (motion): sem rodopio (< 0,2 rad), quique ≤ 0,12 m, sem squash; com cartum, como antes | 360°, 0,35 m, squash 16% |
| Chama: a boca em laranja escuro (R ≥ 2,5 G, G ≥ 1,5 B) no shader; GL: o que a boca soma de dia é quente (R − B ≥ 40), não cinza | boca azul-branca |

## 3. Restrições

Gate (`src/bench/gate.ts`, `tests/gl-render.test.ts`) sem subir sem explicação; nenhum programa novo no meio da corrida (`tests/corrida-que-muda-gl.test.ts`);
`tests/cor-brilho*` verdes (a chama segue ≤ 5% quase branca e quente); `i18n` PT/EN; a coluna Visão da Acessibilidade fica com 7 linhas + as amostras
(a de direção tem 9; as das Opções já têm as 10 que cabem); `node scripts/playtest-layout.mjs`.

## 4. Capturas

Galeria antes × depois só nas cenas afetadas (`--so 07-dividida-2p,08-dividida-4p,09-derrapagem-faiscas`; `comparar.mjs`) e uma folha própria
(harness, 1280×720, Alta): batida, nitro engatando com as linhas, de dia (Copacabana) e no entardecer (Paraty), antes (`main` 550e970) × depois, mais a
batida com "Efeitos de cartum".

## 5. Registro (15/10/2026)

**Testes vistos falhar antes do código** (árvore do 77a67f2, só os testes mudados): `npx vitest run tests/fx-impacto.test.ts tests/efeitos-realistas.test.ts
tests/fx-plan.test.ts tests/fx-onda-pow.test.ts tests/fx-linhas.test.ts tests/car-movimento.test.ts tests/car-chama.test.ts` → `Test Files  6 failed | 1 passed (7)` ·
`Tests  21 failed | 50 passed (71)`. Motivos: `fx-impacto` — `Cannot find module '../src/render/fx/impact'`; POW no padrão `expected 2 to be +0`; faíscas
`84 de 84 faíscas longe do contato`; estrelinhas no padrão `expected 3 to be +0`; settings `expected undefined to be false`; anel `faixa ÷ raio: expected
0.22000004818252794 to be less than or equal to 0.06` (e vida `0.35 ≤ 0.25`); linhas `expected 0.2666… to be +0` (a 89%), largura `0.109 ≤ 0.07`, pico de dia
`0.8624764710669623 ≤ 0.35`; boca `FLAME_MOUTH: expected undefined to be defined`; motion padrão `guinada (undefined): expected 6.283100500121666 to be less than or
equal to 0.21`, esticão do nitro `expected 0.0922… to be +0`; fx-plan `expected true to be false` (POW no padrão). O teste do tranco (escrito em seguida, antes de
mexer no `effects.ts`): `expected 0.25924022535489666 to be less than or equal to 0.15`. Os testes de cartum dos arquivos antigos (com `cartoon: true`) passavam
antes e seguem passando: são o comportamento de antes, agora atrás da opção.

**GL, vistos falhar numa cópia congelada da árvore de antes** (`git archive` do 77a67f2 em `scratch/v8/antes/` com os testes e o laboratório novos;
`NC_REQUIRE_GL=1 npx vitest run tests/efeitos-gl.test.ts tests/cor-brilho-gl.test.ts -t "efeitos|chama|cartum|malha"`, 1845 s com a máquina a ~55 de carga):
`Tests  6 failed | 1 passed`. Os 4 degraus: `POW: só com "Efeitos de cartum" (V8): expected true to be false`; o cartum: `estrelinhas: expected undefined to be
true` (a malha não tinha nome); a boca do escape: `caixa 264,308–376,328: 8.8% mudou, soma rgb(103,109,121)` → `metal aquecido é R − B ≥ 40: expected -18 to be
greater than or equal to 40` (o disco cinza-azulado, medido). **Depois**, a árvore nova inteira dos dois arquivos: `Test Files  2 passed (2)` · `Tests  14 passed
(14)` (2231 s).

**Visto na captura e corrigido (teste primeiro):** (1) na galeria do 9 as barras brancas eram o **túnel do vácuo** (mesmo lote): virou fio, teste
`traço 0: expected 0.24009574867784977 to be less than or equal to 0.1` antes; (2) no 2P a batida de frente não mostrava nada — o contato fica atrás da
lataria vista pela câmera de perseguição e as faíscas de 3–9 m/s apagavam escondidas: passaram a 6–12 m/s, mais para os lados e para cima, com o teste
"em 0,15 s ao menos 40% saem da silhueta" visto falhar antes (`1 de 26: expected 0.0384… to be greater than or equal to 0.4`).

**Galeria** (`--so 07-dividida-2p,08-dividida-4p,09-derrapagem-faiscas`; `main-550e970` × `efeitos` c8e87fd; `comparar.mjs`): 3 de 3 mudaram (17,33%, 9,35%,
5,87% dos pixels) · **contagens que subiram: 0** — chamadas 2P 151 → 147, 4P 285 → 277, derrapagem 76 → 76; triângulos 583.467 → 582.873, 917.986 → 916.674,
274.492 → 274.480 (saem POW e estrelinhas; nada novo desenha fora da batida). Folha própria (harness 1280×720, Alta, sem HUD; antes no `main` 550e970,
depois aqui): batida e nitro com linhas, Copacabana de dia e Paraty no entardecer — chamadas iguais ou menores em todas (batida dia 55 → 54, nitro dia
57 → 57, batida tarde 54 → 53, nitro tarde 52 → 52) e **programas** iguais ou menores (56 → 55, 58 → 58, 45 → 44, 43 → 43: o do POW e o das
estrelinhas não compilam mais na batida; nenhum novo). Montagens em `scratch/v8/folha-antes-depois.png`, `scratch/galeria/comparar-main-550e970-vs-efeitos.png`
e os recortes `scratch/v8/crop-*.png` (fora do git).

**Opções › Acessibilidade:** `NC_LAYOUT_ONLY=access NC_LAYOUT_SKIP_HUD=1 node scripts/playtest-layout.mjs` (build de produção, `vite preview`) →
`✓ telas de menu sem problema de layout: 14/14 combinações limpas` (7 resoluções × texto normal/grande); a mais apertada, 1024×640 com texto grande, sobra 20 px.

**O que ficou discreto ou ainda feio:** na tela dividida a batida realista lê pouco (faíscas de 1,8–3,2 cm, um ou dois pixels no viewport de 2P/4P;
é um número se o dono quiser mais); a fumaça do pneu continua em **bolhas de cartum** (contorno escuro, M5) e as faíscas da derrapagem nas 3 cores
continuam grossas — fora deste pedido, candidatas à próxima rodada; a boca do escape lê laranja-acastanhado de dia (metal aquecido, não brasa).
