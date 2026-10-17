# V4b — Asfalto de dia à sombra (17/10/2026)

> **Base:** `main` 40fbefb, branch `nc/sombra`, worktree `/home/user/speedtche-wt/sombra`. **Só render** (`src/core`, `hashRace`, `sim-golden` não mudam).
> Decisão do dono (17/10): liberar a trava "o dia não muda" da cor-brilho **só para a pista**, de dia. Sem programa novo no meio da corrida; a chave de programa muda na carga.

## 1. Onde o azul entra (medido no modelo de bolso de `tests/cor-brilho.test.ts`, Copacabana de dia, asfalto à sombra, sem sol)

Radiância antes do tone map `(0,009 · 0,028 · 0,074)` (a hemisférica `#87bef4` e a IBL do domo, `0,03 · 0,23 · 0,70`), e o resultado `(0,33,90)`. Três causas somadas:
1. **a luz** (hemisférica + IBL do céu, azuis);
2. **o pé do Neutral** (subtrai o menor canal: zera o vermelho de um escuro azulado; `toe` 0 de dia);
3. **a tinta das sombras da gradação** (`shadows` ≈ −0,06 · −0,01 · +0,07 em gama, pesa nos escuros de QUALQUER material): sozinha empurra B − R em ~+30.
Só neutralizar a luz não bastava: com luz 100% cinza o asfalto à sombra ainda saía `(1,11,32)` (a tinta e o pé deixam um escuro neutro quase preto: 6,25·x²).

## 2. A correção (mínima, só na família `road`)

`stylize.ts`: `gradingFor(p).road = { tint, mix }` e o uniforme compartilhado `uStylizeRoad` (vec4). No shader da pista (`ROAD_GLSL`, depois do `fill`), a luz AMBIENTE
(`irradiance` hemisférica e `iblIrradiance`) vira a **luminância dela × `tint`**, na fração `mix × (1 − smoothstep(0,22; 0,5; luminância do albedo))`.
- `tint`: o contrário da tinta das sombras do período (`(1 − 3,5·sombra)²` por canal, luminância 1) × ganho 1,6 (repõe o que o pé do Neutral tira de um escuro neutro). Vem da paleta: varia por bioma.
- `mix = 1 − lateness(light)`: 1 de dia, 0 do entardecer em diante, contínuo na corrida que muda (por uniforme; `stage.ts` guarda e devolve o uniforme no estúdio).
- O corte pela luminância do albedo existe porque as faixas e a zebra estão na MESMA textura/material: sem ele a faixa branca saía alaranjada (`213,195,160` no GL; achado na 1ª versão).
- O sol (luz direta), o reflexo do céu, o carro, o chão, o acostamento, o céu e a gradação **não mudam**. `STYLIZE_KEY` v3.

## 3. Testes (escritos antes, vistos falhar)

| Teste | Falhou por |
|---|---|
| `cor-brilho.test.ts` 2b: B − R ≤ 20 e máx − mín ≤ 32, à sombra e ao sol, 6 biomas | 12 de 12 (ex.: Copacabana `0,33,90` à sombra, `18,54,106` ao sol) |
| 2b: mix 1 de dia / 0 no entardecer e noite, contínuo; uniforme e trecho só na família `road` | `road` não existe |
| 2b (travas que passam): luminância 0,8–1,7× a de hoje; contraste da faixa ≥ 3:1 e ≥ 0,6× o de hoje; entardecer e noite idênticos | — |
| `cor-brilho-gl.test.ts` V4b (Copacabana seg 300): asfalto B − R ≤ 20 e faixa branca R − B ≤ 15 | 1ª versão sem o corte: faixa `213,195,160` (R − B = 53) |
| 2b: o corte pela luminância no shader; faixa do modelo ±2 | trecho inexistente |

**Muda de propósito:** o asfalto de dia sob a luz da pista (e só ele). **Continua travado:** "o dia não muda" (carro branco/vermelho, e o MESMO asfalto sob a luz dos outros materiais), `toe`/`fill` de dia, entardecer e noite (mix 0, mesma cor), carro vermelho, céu quente, sem clarão, borda da lente, faróis de dia, piso de contraste com as faixas.

## 4. Medidas

Modelo (sRGB 0..255, antes → depois, à sombra | ao sol): Copacabana `0,33,90`→`32,32,25` | `18,54,106`→`57,63,70`; Paraty-tropical `0,26,77`→`23,23,16` | `13,46,93`→`44,53,63`; Savana `0,29,64`→`48,40,22` | `39,55,79`→`75,67,53`. Captura 1280×720, Copacabana seg 300: asfalto à sombra `(0,43,104)` → `(40,45,54)`; ao sol `(62,86,122)` → `(87,92,99)`; faixa branca igual (`90,142,200` → `90,142,200` à sombra). Fuji ao sol `(51,68,112)` → `(73,77,87)`; Xingó `(104,107,128)` → `(123,113,109)`.
Galeria (1280×720, Alta): `scratch/galeria/comparar-base-40fbefb-vs-sombra.png` — `9 de 13 cenas mudaram · contagens que subiram em 0`: mudaram só as de dia (Copacabana, Fuji, Xingó, 2 e 4 jogadores, derrapagem, largada, os 14 carros, menu); **Paraty (entardecer), Cânion, Sampa (noite) e Garagem: iguais (2 px)**. Chamadas e triângulos idênticos nas 13 cenas.

## 5. Ressalvas

- O asfalto ao sol de dia ficou ~20% mais claro (o ganho 1,6 vale para a luz ambiente toda); à sombra a luminância ficou igual.
- O tom é um modelo (constantes `ROAD_COUNTER` 3,5 e `ROAD_GAIN` 1,6, calibradas em 6 biomas e em Copacabana/Fuji/Xingó); a pista de dia de um bioma novo pode precisar de ajuste.
- O acostamento (`ground`) segue azulado à sombra; não era o pedido.
