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
| 3 | Linhas de velocidade de 9–20 cm, alfa até 0,75, a partir de 85%, ganho 0,76 no entardecer (o limiar do bloom do entardecer é 1,6, o do dia 2,6): brilham | **Finas e sutis**: 3,5–7 cm, alfa até 0,32, só **acima de 90%** (e no nitro); ganho do período 1 de dia e 0,35 no entardecer e à noite (contínuo na corrida que muda). O túnel do vácuo segue igual (fora do pedido). |
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

## 5. Registro

(preenchido no fim)
