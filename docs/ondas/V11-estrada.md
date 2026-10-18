# V11 — a estrada (18/10/2026)

> **Base:** `main` 9b1e2ab, branch `nc/estrada`, worktree `/home/user/speedtche-wt/estrada`. **Só render** (`src/core`, `hashRace`, `sim-golden` não mudam). Continua a V10: a estrada era a maior diferença que sobrou contra o HC2 (referência visual, nunca textura).
> Imagens: folha HC2 × antes × depois `scratch/estrada/folha-hc2.png`; galeria `scratch/galeria/{base-9b1e2ab,estrada}/` e `scratch/galeria/comparar-base-9b1e2ab-vs-estrada.png` (6 cenas de pista; as de tela dividida/menu não são desta frente).

## 1. O que mudou

1. **Cor por bioma e período** (`palette.ts`: `roadBase`, `roadAlt`, `roadEarth`; `ROAD_TONE`). `asphalt` ficou como referência de luz (chão, hemisférica, box); a pista pinta `roadBase`: deserto terra alaranjada, mata terra avermelhada, savana ocre, praia cinza quente, serra pedra rosada, cidade cinza que vira lilás à noite. Textura (`road-textures.ts`): manchas largas e veios na 2ª tinta (`roadAlt`, mesma luma +12%, matiz diferente), tom do trecho ao longo da pista, rachaduras de terra (Voronoi periódico, só onde `roadEarth` > 0), sarjeta escura depois da faixa de bordo. Tom por trecho por vértice (`stretchTint`, 12/9 segmentos, ± 5%/3%, um lado diferente do outro; `road.ts`).
2. **Bordas**: acostamento em pixel puro (`shoulderImage`): sarjeta escura (u < 0,1), guia clara (0,14–0,4), miolo, degradê até o `verge` do chão (sem degrau). Zebra com a cor do bioma (`KERB_TONE`).
3. **Chão** (`terrain.ts`): lombada suave 10,8–26 m (`nearRelief`, 0 na faixa de transição e em 26 m, 0,8–1,8 m no pico por bioma, cidade plana), tom por vértice (`groundTone`: faixas claras/escuras do bioma e manchas de terra), transição na coluna 2, variação por vértice maior nas colunas 2–5. O cenário pousa nela pela mesma conta.
4. **Câmera**: `CAMERA_HIGH_CURVE` (altura 3,4, recuo 6,8, mira 30 m; mesmo FOV) atrás de `CAMERA_EXPERIMENT.highCurve` (**desligado**; harness `?camcurve=1`). A Alta aprovada não mudou (teste de trava). Recomendação, não imposição: pista de 30–150 m à frente 38 → 50 px (1,31×), carro 15% menor. Falta o dono ver × antes/depois jogando (rode a galeria com `camcurve=1`).
5. **Traçado** (`tools/tracado-vitrine.ts`, só leitura): % de segmentos em que a curva a 120 m aparece na tela da Alta (60–420 px do centro): Copacabana 37% (trecho de 788 m), Paraty 27%, Cânion 11%, Fuji 11%, Xingó 13%, Sampa 6%. Os segmentos da galeria de Paraty, Cânion, Sampa, Fuji e Xingó são reta; curva visível mais perto: Paraty +272 m, Cânion +312 m, Sampa +348 m, Fuji +664 m, Xingó −892 m. **Proposta (núcleo, decisão do dono):** trocar o `seg` da galeria/vitrine por esses; e, nas pistas-vitrine retas (Sampa 85% reta, Xingó 74%), inserir uma curva larga (|curve| 1–2 por ~40 segmentos) antes das retas longas — invalida recorde e fantasma.

## 2. Medidas (`tools/medir-imagem.mjs`, centro do quadro; sat / luma / contraste / calor)

| Cena | HC2 | antes (9b1e2ab) | depois |
|---|---|---|---|
| Xingó | 0,503 / 0,62 / 0,761 / +0,315 | 0,388 / 0,543 / 0,812 / −0,011 | 0,569 / 0,566 / 0,804 / +0,128 |
| Paraty | 0,551 / 0,518 / 0,753 / +0,314 | 0,401 / 0,467 / 0,714 / +0,200 | 0,419 / 0,517 / 0,690 / +0,239 |
| Sampa | 0,727 / 0,274 / 0,584 / +0,009 | 0,566 / 0,214 / 0,702 / 0,000 | 0,521 / 0,299 / 0,757 / −0,049 |
| Copacabana | floresta 0,815 / 0,391 / 0,608 / +0,137 | 0,607 / 0,392 / 0,706 / −0,296 | 0,522 / 0,435 / 0,714 / −0,244 |

Chão (y 0,6–0,85) de Xingó: calor +0,024 → +0,301 (HC2 +0,457). Estrada na imagem (`tests/estrada-gl.test.ts`, faixa da esquerda): Xingó rgb(106,95,94) → (175,102,58); Sampa (60,37,46) → (122,93,146); Copacabana (103,105,106) → (148,135,109). **Ressalva:** a saturação do centro de Copacabana e Sampa caiu (o azul/vinho saturado do asfalto antigo saía); o calor do deserto ainda fica na metade do HC2 (céu azul domina).
**Gate:** chamadas e △ idênticos nas 6 cenas da galeria (54/192560, 52/165882, 41/147362, 56/200898, 45/137527, 41/142937), pois nada de geometria nova (vértice, textura e colunas já existentes). Gate Sampa 4p Média: ver §4.

## 3. Travas que mudaram (e por quê)

| Trava | Era | Agora | Por quê |
|---|---|---|---|
| `cor-brilho` 2b/“asfalto neutro” | medem `asphalt` | seguem medindo `asphalt` (que segue como luz do resto); a pista é medida em **2c** | a pista não pinta mais `asphalt` |
| 2c novo | — | sem azul-marinho (matiz 200–250° com croma > 0,3); faixa ≥ 3:1 à sombra e ao sol; terra com croma ≥ 60; luma 26–150 (dia) / 18–110 | as travas que importam seguem; croma baixo vale só fora da terra (≤ 52) |
| `pistas-v4`: faixa × asfalto | ≥ 0,45 de luma (albedo) | ≥ 0,32 | estrada mais clara no entardecer/noite; o 3:1 com a luz está no 2c |
| `render-ground`: relevo | 0 até 26 m | 0 até 10,8 m e em 26 m, 0–2 m entre | pedido do item 3 |
| remendos (`ASPHALT_WEAR`) | tom 0,93/0,94 | 0,90 | a 2ª tinta escondia a diferença |
| albedo × carro branco/chão (novo, `estrada-v11`) | asfalto ≥ 4,5 | ≥ 3,0; chão: razão ≥ 1,12 ou distância ≥ 0,15 | a estrada de terra tem o tom do chão (como no HC2); as bordas separam |
Intactas: carro branco lê branco, vermelho vermelho, o dia travado da V10 (4ª amostra é `asphalt`), faixa branca ±2.

## 4. Testes (escritos antes, vistos falhar)

`estrada-v11` (22): falhou por “roadBase undefined”, `shoulderImage`/`stretchTint`/`groundTone` inexistentes, relevo 0 (peak 0), sarjeta; cor-brilho 2c: terra “sem cor” (rgb 36,28,21 no deserto à sombra), matiz 180° vs ≤ 24; `camera-v11` (5): `CAMERA_EXPERIMENT` indefinido, ganho 1,00×; `estrada-gl` rodado no main 9b1e2ab: R − B = 12 (Xingó), matiz 337° (Sampa), R 103 < B 106 (Copacabana). Verificação final no §5 do relatório de entrega.

## 5. Ficou fora

Roxo cheio/rosa do HC2 à noite (aqui lilás contido por causa da trava “carro branco lê branco”); estrada mais clara no deserto (limitada pelo 3:1 da faixa à sombra); tom de pista que o HC2 pinta em pedra de calçada (padrão de lajotas); câmera candidata e traçado são propostas.
