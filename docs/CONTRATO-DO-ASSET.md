# Contrato do asset — como um carro e um marco-herói chegam ao jogo

Este contrato é o que o `npm run check-car` (carro) e o `tools/convert-landmark.mjs` (marco e peça) conferem, mais o que
a bíblia de estilo (`docs/DIRECAO-DE-ARTE.md`) pede de acabamento. **O dono aprova no Marco 1.** A **L3 levou a parte do carro ao
`src/render/cars/check.ts`** (marcada **conferido**: atlas, UV, LOD, `seat`, `kit_*`, `decal_*`, roda do arquivo, um modelo por carro);
o que continua só **proposta** não é conferido por nenhum validador e pode mudar na aprovação. **Conferido não é mostrado:** `kit_*`,
`decal_*` e `seat` são lidos e validados, mas quem os desenha no jogo são a P3, a N3/U4 e a câmera interna.

**Independente do motor.** O contrato descreve um arquivo glTF (metros, eixos, nomes de nós e de materiais, tetos), não
uma API. O motor — Unity 6 URP ou Three.js Ultra — será decidido pelo duelo antes da L (decisão nº 27 de
`docs/CRONOGRAMA.md`), e o mesmo arquivo serve aos dois.

**Quem faz a arte.** Não há artista (dono, 09/10/2026; `docs/CRONOGRAMA.md`, "Revisão visual", R4 e decisão nº 28). O
arquivo sai de **modelo pronto CC0**, ou do **Meshy só para o que não existir pronto** (lista em `docs/MESHY-LISTA.md`, nada
gerado sem o dono ver), e **sempre passa por limpeza no Blender** antes de entrar. O Meshy entrega uma malha só; por isso
o carro, em especial, precisa de rodas separadas, camadas de pintura por material, nós `kit_*` e o ponto `seat` (abaixo), e
é o `npm run check-car` que diz se ficou certo.

**Licença.** Registrada **arquivo por arquivo** (página de origem, autor, licença, data: tabela em `docs/ARTE.md`). Nada de
marca, logotipo ou cópia de carro real; o CC0 cobre o arquivo, não marca nem direito de imagem.

---

## 1. Carro

### Convenção de hoje (conferida)

Vem de `docs/ARTE.md`, "Carros — pronto", e do `src/render/cars/check.ts`.

- **Unidades e eixos:** metros; +Y para cima; frente em +Z no glTF (o jogo usa −Z; a conversão é do `gltf.ts`).
- **Nós:** `body`, `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`.
- **Vazios:** `exhaust_l` e `exhaust_r`.
- **Pegada** (`CAR_LIMITS`, `check.ts`):
  - |x| ≤ 1,0 e |z| ≤ 2,35 do centro; altura < 1,95;
  - vão do chão: o ponto mais baixo acima de 0,04;
  - comprimento > 4,2 (micro: > 3,2) e largura > 1,8;
  - raio da roda ≥ 0,26.
- **Casco:** ≤ 8.000 triângulos (`CAR_LIMITS.maxShellTriangles`; 3.500 → 4.500 na M4, → 8.000 na rodada de realismo da V2; provisório até o bench do dono). Roda do procedural ≥ 0,19 do comprimento; cabine bolha: metade de cima do vidro ≥ 92% da largura máxima.
- **Validação:** `npm run check-car -- x.glb` (o mesmo validador do jogo, procedural ou glTF; `x` é o id de um carro ou um estilo).
  O carro de caixas `npx tsx scripts/make-test-car.ts` usa todos os nós do contrato e passa sem aviso: é a fixture dos testes.
- **Conversor** de carro de kit de paleta (Kenney): `npm run convert-car -- <kit/GLB format/sedan-sports.glb> falcao` (receita do colormap,
  escala por eixo, rodas, LOD, atlas 256², nós do contrato). O que entrou: `docs/ARTE.md`, "Licenças dos carros baixados".
- A **proporção** do carro (a roda ≥ meta da bíblia; mesma pegada × curto e gordo) sai da decisão nº 7, no Marco 2, pela
  folha da L3. Até lá, a roda é **provisória** (bíblia, seção 4).

### Nome do arquivo: um modelo por carro (conferido, L3)

- `src/assets/cars/<carro>.glb` (ex.: `falcao.glb`): o modelo é **só daquele carro**; o instanciamento agrupa por modelo, e o Falcão
  deixa de dividir a forma com o Boitatá (que segue com o GT procedural até ter o seu).
- `src/assets/cars/<estilo>.glb` (ex.: `gt.glb`): vale para o estilo todo, como no passo 2.4. O arquivo do carro vence o do estilo.
- Arquivo de **um carro**: o `seat` é obrigatório (problema se faltar) e o arquivo decide as próprias faixas (as camadas `stripe_*` que a malha
  tem). Arquivo de **estilo**: `seat` faltando é só aviso, e as faixas seguem a ordem dos carros do estilo.
- No Electron o arquivo chega pelo protocolo `speedtche-asset://app/assets/<arquivo>.glb` (`desktop/assets.cjs`), no navegador por `fetch`.

### Materiais (pelo nome)

| Nome do material | O que faz | Origem |
|---|---|---|
| `paint*` | recebe a cor de pintura do carro (a cor do material é o tom: branco = cor pura, cinza = um tom abaixo) | código |
| `accent*` | recebe a cor de detalhe | código |
| `stripe_a*`, `stripe_b*`, `stripe_ab*` | faixas que recebem a cor de faixa A, B ou as duas | código |
| `headlight*`, `taillight*` | emissivos: acendem; força = emissivo ÷ cor (sem emissivo = 1) | código |
| `popup` no nome | sobe com o farol escamoteável | código |
| qualquer outro nome | peça fixa, com a cor, a rugosidade e o metal do material | código |
| `rim*` | o aro da roda; a **cor do aro** é separada da pintura (a N3 separa) | **proposta** (o modelo-base de hoje já grava `rim`; a regra de cor é nova) |
| `glass*` | o vidro; vira o bit de vidro em `aMat` do material da L (reflexo e transparência) | **proposta** (o modelo-base já grava `glass`; o bit é novo) |

### Pontos e nós novos

- **Vazio `seat`** — onde o piloto senta (a cabeça do piloto e o ponto de câmera interna). **Conferido** (L3): um só (dois = problema);
  faltando é problema em arquivo de um carro e aviso em arquivo de estilo. A câmera interna ainda não o usa — **proposta** de uso.
- **Nós `kit_<peça>_<nível>`** — peças que aparecem no carro conforme a melhoria comprada (`docs/CARROS.md`).
  - `peça` ∈ `engine | turbo | tires | brakes | tank | nitro` (`UpgradePart`, `UPGRADE_PARTS` em `src/core/career.ts`);
  - `nível` de 1 a 3 (`UPGRADE_MAX_LEVEL`, `src/core/constants.ts`);
  - **Conferido** (L3): o nome (peça e nível) e que **não entram no casco**. O jogo mostrar o nó do nível comprado e esconder os
    outros é a P3 — **proposta**.
- **`decal_<nome>`** — malha plana (até 2 cm de espessura), com UV, para número, placa e adesivos (N3, U4). **Conferido** (L3): UV,
  planicidade e que **não entra no casco**; desenhá-lo é N3/U4 — **proposta**.

### Textura, UV e LOD

- **Textura:** atlas de paleta **256 × 256** (`map`, sRGB, **uma imagem só** por carro — o casco, o LOD e as rodas dividem o mesmo atlas),
  com normal map opcional. **Conferido e lido** (L3): o `gltf.ts` leva o `map` e o `normalMap` ao modelo, e o `Cars` dá a ele um material
  próprio (o `map` multiplica a cor de vértice e a pintura). Sem atlas, a cor chapada por material de sempre (os 13 modelos-base).
  - **A face pintável aponta para um swatch BRANCO** (o jogo multiplica pela cor do carro); o degradê do swatch é a luz assada do arquivo.
  - O `GLTFLoader` engole a falha de textura: no Node o `check-car` instala um `createImageBitmap` que lê só o cabeçalho do PNG.
- **UV:** a malha leva UV no atlas de paleta. **Conferido** (L3): material com atlas e malha sem UV é problema. A 2ª UV, reservada
  para a luz assada (bíblia, seção 3), continua **proposta**.
- **LOD:** nós de topo `lod0` e `lod1`; o `lod1` com no máximo **metade** dos triângulos do `lod0`. **Conferido** (L3): sem `lod0`, ou com
  mais da metade, é problema. Roda e escape ficam na raiz (o `lod1` só leva casco). O `Cars` desenha o `lod1` nos carros a mais de
  30 m à frente do carro do viewport e na qualidade Baixa (o mesmo critério da roda simples).
- **Roda do arquivo:** o desenho da roda é a malha do nó `wheel_fr`, **eixo em x** (deitada = problema), reescalada para raio 1 e largura 1;
  as quatro rodas usam essa malha (posição e tamanho vêm de cada nó). `extras.spokes` no nó diz quantos raios (o giro por quadro é limitado
  por `360°/spokes × 40%`); sem ele, 6. **Conferido** (L3).
- **Faceta:** nenhuma faceta visível acima de 15° na distância de jogo (bíblia, seção 4).

---

## 2. Marco-herói

### Convenção de hoje (conferida)

Vem de `src/render/scenery/landmarks/types.ts` e de `docs/ARTE.md`, "Marcos baixados".

- **Origem** no centro da base; y = 0 no chão (o que fica abaixo de 0 cobre o declive).
- **Frente** (o lado que o jogador vê) para **+X**; o **comprimento ao longo da pista** em Z.
- **Metros reais.** **Sem sombra projetada** (o marco é longe demais para o mapa de sombra) e sem `blob`.
- **Lugar**, medido na **borda de dentro da pegada** (`LANDMARK_LAT`, `src/render/scenery/layout.ts`; `docs/VISUAL.md`,
  "Marcos turísticos"):
  - **perto:** 30–80 m;
  - **longe:** 120–330 m;
  - **horizonte:** 220–300 m (o pico fica a ~400 m ou mais).
- **Distância mínima:** nenhuma parte a menos de **26 m** do centro da pista à vista (`LANDMARK_CLEAR_M`, `layout.ts`).
- **`perLap`, `place` e `side` não mudam** (`LANDMARK_PLAZAS`, `src/core/track/plazas.ts`): as praças abrem a colisão das
  pistas de cidade e de litoral.
- **Tetos de triângulos** (`docs/ARTE.md`): perto 2.500 (teto 3.500), longe 4.000 (5.000), horizonte 2.000 (2.500).
  O **teto do marco-herói** é diferente e fica **"a confirmar no bench da L"**.
- **Régua de leitura:** todo marco passa por `tests/front-view.ts` (`docs/VISUAL.md`, "Leitura").
- **Validação:** `node tools/convert-landmark.mjs art/raw/x.glb --id <marco>` (saída 0 = aceito).

### Propostas

- **Nós animáveis `anim_<nome>`**, com o pivô na origem do nó: a Q5 e a U2 animam por código (bondinho, hélice, bandeira) —
  **proposta**.
- **LOD** `lod0`/`lod1`, como no carro — **proposta**.
- **Luz assada** em 2ª UV (`lightMap`/`aoMap`), por período — **proposta** (bíblia, seção 3; R2).

---

## 3. O que este contrato ainda não decide

- A proporção do carro (decisão nº 7) e o contorno (nº 8): Marco 2.
- O teto de triângulos do herói e os tetos por qualidade: dependem do bench da K4 e do bench do dono (`docs/DESEMPENHO.md`
  §4); até lá são **provisórios**.
- Se o motor mudar (nº 27), os **nomes e os eixos** deste contrato ficam; só muda quem lê o arquivo.
