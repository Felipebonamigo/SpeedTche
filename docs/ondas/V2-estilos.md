## V2 (etapa dos estilos) — os outros 10 estilos no desenho HCT "rodada 2" (16–17/10/2026)

O dono aprovou o GT ("faça tudo que conseguir sem mim"); a base ficou o que o GT, a cunha e o hipercarro montaram (`cars/hull.ts`, `cars/shaped.ts`) mais a
rodada de realismo (tinta que guarda o matiz, sombra de contato, roda nova, vidro e lanterna). Aqui, os dez que faltavam, na ordem do plano: protótipo,
roadster, rali, muscle, elétrico, hatch, sedã, picape, clássico e micro. **Os 12 nacionais (`tools/blender/`) não foram tocados.**

### Contrato (igual ao do GT, `docs/ondas/V2-gt.md`)

Cada estilo é um `styles/<estilo>.ts` sobre `Hull` (linhas em vez de seções) e as peças de `shaped.ts`; mesmos **eixos, pegada, escapes, roda, pinturas e
pincéis nomeados** de antes (`CarModel`, `checkCarModel`; `tests/car-round.test.ts` conferido com a faixa de área de cada um); vidro escuro (`GLASS_TINT`)
com caimento de carro de verdade; vinco da cintura subindo para a traseira; faixas A e B redesenhadas para a forma; e a **traseira como estrela**: lanternas
EMBUTIDAS (moldura que sobra 4,5 cm da pele, lente acesa 3 cm no fundo, leque com miolo e borda para o `aLens`), `boxLamp` nas retangulares e
`recessedLamp` nas redondas. Orçamento: casco **≤ 4.500 △** (o do jogo) e lod1 **≤ 45%**.

### Testes (vistos falhar antes, no modelo de antes)

`tests/hct-common.ts` guarda o bloco que todos dividem (vidro com caimento 0,70–0,92 escuro e neutro; as lentes de lanterna em leque, cada uma no fundo de
uma moldura ≥ 1 cm além dela e ≥ 3 cm além da pele; faixa A de cima ≥ 75% e faixa B de lado ≥ 80% subindo ≥ 12 cm; orçamento, lod1 com luz e as duas
faixas, validador; e, desde o protótipo, **o pneu não fura a lataria**). `tests/estilo-carro-hct2.test.ts` tem um bloco por estilo com a identidade dele
(teto, nariz, para-lamas, faróis em leque, a asa, o escape de sempre...). `tests/estilo-carro.test.ts` isenta cada estilo da cabine bolha de cartum (lista `HCT`).

### Resultado

| estilo (carro) | △ antes → agora | lod1 antes → agora | o que muda |
|---|---|---|---|
| prototype (Beija-Flor) | 3.264 → 3.524 | 1.384 → 1.348 (38%) | deck estreito, cockpit em gota, faróis em fenda, 6 lanternas embutidas, asa em cisne |
| roadster (Curupira S) | 3.530 → 4.244 | 1.666 → 1.784 (42%) | cockpit aberto, para-brisa baixo escuro, faróis e 4 lanternas redondas embutidos |
| rally (Carcará RS) | 3.360 → 3.976 | 1.488 → 1.576 (40%) | para-lamas em caixa, 4 faróis de milha embutidos, 4 lanternas altas embutidas |
| muscle (Trovão V12) | 3.416 → 3.936 | 1.456 → 1.472 (37%) | tomada elevada, grade com 2 faróis cromados embutidos, 6 lanternas verticais |
| electric (Sucuri E) | 2.956 → 3.682 | 1.372 → 1.382 (38%) | teto de vidro, faixa de luz diurna, faixa de lanterna de ponta a ponta |
| hatch (Tornado RS) | 3.192 → 3.676 | 1.392 → 1.424 (39%) | rabo quase vertical, faróis de canto em leque, 2 lanternas grandes embutidas |
| sedan (Camelo X) | 3.108 → 3.372 | 1.416 → 1.360 (40%) | 3 volumes, friso cromado, lanternas largas embutidas + luz de ré em leque |
| pickup (Tatu 4x4) | 2.921 → 3.329 | 1.349 → 1.453 (44%) | caçamba aberta, santantônio, lanternas verticais embutidas |
| classic (Boto Luxo) | 3.264 → 3.978 | 1.424 → 1.578 (40%) | bico estreito, para-lamas bojudos, 4 lanternas redondas com aro cromado |
| micro (Saci Mirim) | 2.724 → 3.508 | 1.292 → 1.504 (43%) | olhos e lanternas redondos embutidos, teto na camada A |

(O protótipo foi corrigido depois da primeira folha: o ombro inclinado ficava abaixo do topo do pneu e o pneu aparecia, preto, na câmera de capô; o teste
do pneu valeu então para todos e só ele falhava.)

**Gate** (`node tools/blender/medir-gate.mjs <carro>x4`, o pior caso: 4 jogadores no mesmo carro, todos de perto, Média; limite de Sampa 4p Média 345.000):
os 10 ficam entre 324.044 (protótipo) e 336.644 △ (Boto Luxo), contra 324.666 dos quatro carros de sempre; copa-4p Média até 272.304. Chamadas iguais
(75–80 por viewport, o mesmo intervalo de antes). Folga mínima de Sampa 4p Média: 8.356 △ (a rodada da roda deixou 184 no `lab.collect()`, que mede outra
cena; os dois contadores são medidos e nenhum estoura).

**Folhas** (atual × novo, 7 vistas, os mesmos Copacabana/seg 300/Alta da etapa do GT): `scratch/lote1/folha-{beijaflor,curupira,carcara}.png`,
`scratch/lote2/folha-{trovao,sucuri,tornado,camelo,tatu,boto,saci}.png`.

### O que falta

- A silhueta 2D (`ui/screens/icons.ts`) de todos, menos o GT, continua a de antes.
- O caimento do vidro do sedã e do hatch precisou de um teto estreito (`hwt` 0,56 e 0,66) para passar do critério 0,70–0,92; de lado ficam mais "cupê" que
  a referência de cada um.
- Rodas: cada estilo conserva a sua (a nova roda de V2 é de todos, mas o desenho do HCT2, de 10 raios escuros com lábio usinado, continua sem catálogo).
