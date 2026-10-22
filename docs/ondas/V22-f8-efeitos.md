# V22 · F8 — Partículas, efeitos e cartão do marco (branch `nc/f8-efeitos`, base `main` e6109ff, 22/10/2026)

> Frente F8 do plano gráfico V22 (`docs/ondas/V22-diagnostico-cena.md` §3.10, §3.11 e §6). Pedido do dono: "ainda parece muito desenho; tinha que parecer mais com o Horizon Chase"; diretriz "um pouco mais realista que o Horizon Chase Turbo e mais bonito que ele". Sem artista, sem Meshy, sem pacote pago.
> **Nada muda em `src/core`**, no save, no online nem na física. `cars/flame.ts` não foi tocado.

## 1. O que mudou

| Escopo do plano | Feito | Onde |
|---|---|---|
| Sprite irregular de 4 quadros no lugar da esfera | Atlas **256 × 256 RGBA** (4 quadros de 128 px) pintado uma vez na carga: nuvem de couve-flor (9–11 lóbulos), borda roída por ruído, alfa 0 além do raio 0,97 (gira sem mostrar o quadrado). Canal A = forma, R = ruído de erosão, G = relevo. O fragmento **gira** a nuvem (`aSpr.y`), ilumina pelo relevo com a luz do alto à esquerda da TELA (não gira junto), e **se desfaz pela borda** conforme envelhece (fiapos, não só esmaecer). Sem contorno escuro. Cada partícula leva **quadro, rotação (0..2π), giro (≥ 0,3 rad/s, os dois sentidos) e tom (±6% a ±12%)** próprios. As lascas da batida seguem duras (quadro −1). | `fx/sprite.ts` (novo), `fx/smoke.ts`, `effects.ts` (shader do pool de poeira), `fx/impact.ts` (1 campo) |
| Trilha contínua na terra e na grama | Emissão **por metro andado** numa grade fixa ao longo da pista (sem estado, mesmo número de partículas a 30 ou 144 FPS, sem buraco entre quadros); a poeira do chão fora do asfalto (`emitGrassDust`) e a **da própria estrada de terra** (`emitRoadDust`, `roadEarth` ≥ 0,3: a mata, o deserto e a savana; asfalto não levanta). Só de quem está a < 160 m de um viewport; rival solta metade. | `fx/smoke.ts`, `effects.ts` |
| Partículas ambientes | 10 / 12 / 14 / 16 (Baixa → Ultra) por viewport, **sem estado**, presas ao mundo (o carro anda e elas ficam), alfa ≤ 0,36, 4–10 cm, 0,35–3,85 m de altura, cintilam devagar e apagam nas pontas da janela. Vão **nas vagas que sobram do mesmo pool de poeira** (mesma malha, mesma chamada); cor cai com a luz do período. **Zero em "Reduzir efeitos".** | `fx/sprite.ts` (`ambientMote`), `fx/plan.ts` (`ambient`), `effects.ts` |
| Cartão do marco fora da traseira do carro | `.lmk` foi do pé do viewport para o **alto** (`top: 100 × --s`, abaixo do relógio; ≈ 18–30% da altura em 720p); entra descendo e sai subindo. A caixa do carro na câmera Alta (medida na captura): 34–66% da largura, 60% à base. | `caption/caption.css`; **1 linha fora da lista**: `hud-tips.ts` (o cartão de dica só sobe se a legenda estiver na metade de baixo; senão o `--lift` calculado pelo topo ficaria de ~600 px) |

Plano (`fx/plan.ts`): campos novos `trail` (nuvens/s por carro: 56 / 80 / 100 / 100) e `ambient`. `reduceEffects`: `trail` e `smoke` iguais aos do degrau (a fumaça **não some**, só escala; `dustScale` 1), `ambient` 0.

## 2. Arquivos

Código: `src/render/fx/sprite.ts` (novo), `src/render/fx/smoke.ts`, `src/render/fx/plan.ts`, `src/render/fx/impact.ts`, `src/render/effects.ts`, `src/render/caption/caption.css`. **Fora da lista (1 linha, registrada):** `src/render/hud-tips.ts`.
Testes: **novo** `tests/fx-f8-efeitos.test.ts` (26 testes); `tests/fx-plan.test.ts` (2 nomes na lista de campos); `scripts/playtest-layout.mjs` (+ checagem "legenda × caixa do carro").

## 3. Testes de contrato (escritos antes; ver ressalva 1)

1. Sprite: atlas ≤ 256², 4 quadros distintos (≥ 0,05 de alfa médio), **variação angular do alfa ≥ 0,08** nos anéis de raio 0,6 e 0,72 (disco perfeito = 0), alfa 0 nos cantos/borda, cobertura 30–80%.
2. Rotação ≠ 0, giro nos dois sentidos, 4 quadros e tom por partícula (≥ 3% de desvio, ±16%).
3. Trilha: taxa por segundo igual a 30/60/144 FPS (±12%), sem buraco > 4 m a 30 FPS, taxa × vida × 4 jogadores ≤ 85% do pool, em todos os degraus, em "Reduzir efeitos" e no cartum; estrada de terra proporcional a `roadEarth`, asfalto e parado = 0.
4. Ambientes: 8–16, ≤ 0,4 de alfa, estáveis no mundo, movimento ≤ 3 cm/quadro; no `Effects`: **pool continua 900**, "Reduzir efeitos" = 0 ambientes e a poeira continua saindo.
5. Cartão: CSS ancorada em `top` (não `bottom`), retângulo (top + 74 px) fora da caixa do carro em 720 e em tela dividida; `playtest-layout.mjs` mede o cartão real contra a caixa do carro.

**Travas existentes alteradas, com motivo:** só `tests/fx-plan.test.ts`, "o plano tem só os campos conhecidos": entraram `trail` e `ambient` na lista (campos novos do plano; as duas também cumprem "cresce do Baixa ao Ultra"). Nada foi afrouxado: `fx-fumaca` (cor exata da poeira sem trilha, marcador `// bolha` e `discard` no fragmento, `uNearFade` > 3), `hc2-fx` (tamanho/vida da poeira 1 e 1,8) e `efeitos-realistas` passam **sem mexer** (o caminho sem `trail` é o de antes; o tom por partícula só vale na trilha).

## 4. Medidas (antes × depois)

| medida | antes (`main` e6109ff) | depois |
|---|---|---|
| forma da poeira/fumaça | esfera perfeita (alfa sem variação angular, sem rotação, contorno escuro) | nuvem de 4 quadros, variação angular do alfa ≥ 0,08, gira, se desfaz em fiapos |
| poeira atrás do carro na areia (Xingó, `hc2-gl`: pixels que mudam) | 31,7% (V10: 32%) | **≥ 38%** (trava `hc2-gl` passa; 1ª versão do sprite deu 28,8%, depois 32,2%: subi o tamanho do ponto e das nuvens até passar, sem tocar o teste) |
| poeira na estrada de terra | nenhuma | trilha (65% × `roadEarth` da taxa do degrau) |
| partículas ambientes | 0 | 10–16 por viewport; 0 em "Reduzir efeitos" |
| pool de partículas | 900 | 900 |
| textura | — | 1 × 256 × 256 RGBA (256 KB) |
| gate `tools/folga-gate.mjs` (Copacabana e Sampa, pior viewport, 16 combinações) | △ iguais | **△ idênticos (0 de diferença em todas); chamadas +1 em todas** (a malha de poeira agora desenha também sem partícula viva, por causa das ambientes: copa-1p Baixa 34 → 35, Média 78 → 79, Alta 83 → 84, Ultra 84 → 85; sampa-4p Baixa 40 → 41) |

Limites de `src/bench/gate.ts` **não subiram**; `gl-render` (gate e compilação de todos os programas), `efeitos-gl` (≤ 5 malhas de efeito, programas compilam em cada qualidade), `corrida-que-muda-gl` (nenhum programa novo na corrida) e `hc2-gl` passaram. A Baixa segue a mais barata (116 mil △ contra 237 mil da Média). O programa de shader do pool de poeira é o mesmo de antes (só o texto mudou); a textura sobe na primeira vez que o pool desenha (256 KB).

Rodados neste turno: `npx tsc --noEmit -p .`; vitest `fx-f8-efeitos`, `fx-plan`, `fx-fumaca`, `fx-impacto`, `fx-effects`, `fx-*`, `hc2-fx`, `hc2-grade`, `efeitos-realistas`, `landmark-caption`, `galeria`, `corrida-que-muda`, `corrida-que-muda-relogio` verdes; GL (`NC_REQUIRE_GL=1`) `efeitos-gl`, `hc2-gl`, `gl-render`, `corrida-que-muda-gl` verdes. A suíte inteira e o `playtest-layout.mjs` (exige `npm run build` + preview) ficam com o orquestrador.

## 5. Imagens (`docs/diag-v22/f8-efeitos/`, JPEG)

Mesma câmera (Alta, 1280 × 720, harness, `top=0.85` para o carro correr): `antes-`/`depois-poeira-xingo` (areia fora do asfalto), `antes-`/`depois-terra-foz` (estrada de terra: antes nada, depois a trilha ocre), `antes-`/`depois-derrapa-foz` (o antes foi capturado sem `top` e o carro estava devagar demais para soltar fumaça: **não é comparação justa**; a fumaça branca do pneu e a poeira ocre aparecem no depois), `antes-`/`depois-cartao-marco` (1p) e `depois-cartao-marco-4p`.
Comandos: `PORT=<porta> node tools/capture.mjs "xingo::track=xingo&seg=110&hud=0&skid=1&top=0.85&frames=60"`, `"foz::track=foz_do_iguacu&seg=215&hud=0&top=0.85&frames=60"` (+ `&drift=1&driftlevel=3`); cartão: `scratch`-script que liga `.lmk.show` (como o `playtest-layout`) sobre `track=copacabana&seg=380&frames=10` (1p) e `humans=4&ticks=1500` (4p). Medidas do cartão (px, 1280 × 720): antes 614–699 (cobria a traseira, carro em 430–660); depois 133–218; em 4p, viewport de 360: 67–110, sem tocar `.tl`, `.tr`, `.mates`, `.mini`.

**Rodadas de crítica (olhando as capturas):** (1) 1ª captura: nuvens boas na areia, mas na terra vermelha a poeira saiu cinza (fumaça) → cor da pista sem branco; (2) escura e fina, sumia na terra vermelha → mais clara (ocre) e maior; (3) ocre, mas opaca demais, cobria as lanternas → alfa e taxa menores; (4) com isso a cobertura do `hc2-gl` caiu a 28,8% e a poeira ficou "avulsa" → nuvens maiores e mais densas, trilha contínua visível em `depois-poeira-xingo`.

**Pronto visual do plano, honestamente:** `c08` **sem esferas perfeitas: atendido**; **trilha de poeira atrás da roda na terra: atendido** (areia e estrada de terra); **cartão fora do carro: atendido**. **Não chegou lá:** (a) não capturei nitro e batida depois (o nitro/chama é `cars/flame.ts`, intocado; as lascas ficam duras de propósito); (b) as ambientes são pontos de 4–10 cm e quase não aparecem em imagem parada (medidas só em teste); (c) a nuvem ainda é uma textura de 4 quadros: repete com o tempo.

## 6. Ressalvas

1. **Ordem dos testes:** escrevi `tests/fx-f8-efeitos.test.ts` antes do código, mas rodei só depois de escrever a implementação; para registrar a falha, guardei o código (`git stash -- src`, o `sprite.ts` novo ficou) e rodei contra o `smoke.ts`/`plan.ts`/`effects.ts` de antes: 19 dos 26 falharam pelo motivo certo ("rotação ≠ 0: expected +0", campos `trail`/`ambient` inexistentes, a emissão sem `dt`). Alguns limiares (anéis do alfa, cobertura do sprite) foram ajustados depois de ver o atlas.
2. **+1 chamada em tudo** (limite do plano: ≤ +1): a malha `fx-dust` agora desenha também só com as ambientes. O `gl-render` (que compara com os limites de `src/bench/gate.ts`, sem alterá-los) passou com a chamada a mais; com o herói ligado do jogador (V9) a folga de copa-1p Alta/Ultra é a mais apertada: confira no `--bench` do dono.
3. **Fora da lista:** `src/render/hud-tips.ts` (1 expressão); o cartão de dica só sobe se a legenda estiver na metade de baixo.
4. **O cartão no alto pode dividir espaço** com as mensagens do alto (`.top-msgs`, pit e pouco combustível) por ~3 s; e cobre parte do céu/prédios altos do centro. Não rodei o `playtest-layout.mjs` (exige build) — o orquestrador deve rodar; a checagem "legenda × caixa do carro" já está nele.
5. **Gosto é do dono:** tamanho (`uSpriteK` 1,9 em `effects.ts`; `size`/`grow` em `smoke.ts`) e opacidade (0,8 no fragmento) da nuvem são os botões; a trilha da estrada de terra é 65% × `roadEarth`. A caixa do carro (34–66% × 60–100%) é da câmera Alta; Baixa/Capô/Frente têm outra.
6. Sem FPS medido (swiftshader); o `--bench` do dono é o juiz. Sem imagem de vídeo: a rotação e o desfazer por fiapos só se confirmam em movimento.
