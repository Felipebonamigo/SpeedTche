## T4 — marcos mal enquadrados pelo traçado novo (M6) (frente `nc/marcos`)

> Base e31d139 (`main` 0.1.5 + HUD V5 + efeitos V8 + pistas V4). Item T4 da "Auditoria de 14/10/2026" (`docs/CRONOGRAMA.md`). Decisão do dono:
> mexer no `sightline.ts` do núcleo, mesmo invalidando recorde e fantasma das pistas com praça.

### Causa
- A M6 fez o 3D girar a escala de cada pista (`render/units.ts`, `turnPerCurve` = 2π/|Σ curve|: a curva do mapa). O núcleo continuou abrindo as
  praças e os mirantes dos marcos com o giro legado (`core/track/sightline.ts`, `SIGHT_MODEL.headingPerCurve = 0.0035`): a visada era medida para
  uma curva que o jogador não vê, e a curva de verdade escondia o marco ou o tirava do quadro.
- Achada depois, com a escala certa: o traçado do mapa volta perto de si mesmo (grampo, laço). A praça era aberta onde outro trecho passa pela
  pegada do marco; o layout (`render/scenery/layout.ts`) não põe pegada a menos de 26 m de nenhum trecho (±300 segmentos), e o marco ia para a
  faixa dobrada (as 5 pontes do `M6_FAR`, a 400–670 m) ou para fora da praça. Ex.: a igreja da Pampulha (2ª praça, seg 1081) tinha outro trecho a
  41,8 m do lugar dela; os arcos de Aracaju (seg 959), a 4,4 m.

### Correção
- `src/core/track/turn.ts` (novo): `trackTurnPerCurve(segments)` e `HEADING_PER_CURVE`. É a conta do `turnPerCurve`, que agora só a guarda em cache
  (`render/units.ts` importa do núcleo; o núcleo não importa o renderizador). Uma divisão por uma soma: igual em toda máquina.
- `sightline.ts`: `centerline` gira a escala da pista. Um segmento chega a girar 0,33 rad (aracaju), e a série de Taylor valia até 0,03: o giro
  passa a ser dividido em passos de ≤ 0,03 rad e composto (produto de giros, normalizado pela raiz). Sem trigonometria (`determinism.test`).
  ≤ 1 cm do `unrollTrack` do 3D em duas voltas (monaco_noite, roma, sampa_noite, maceio, aracaju, rota_66, pampulha).
- `sightline.ts`, `clearOfRoad`: o lugar do marco precisa ficar a ≥ 45 m (perto) / 135 m (longe) de toda a linha central a ±300 segmentos; nos
  marcos compridos (`LANDMARK_HALF_M` em `plazas.ts`, ≥ 150 m de meio comprimento: pontes e dunas, conferido com a caixa do modelo) o eixo inteiro,
  de 20 em 20 m, a ≥ 36 m. `plazas.ts` prefere os lugares livres; sem nenhum livre, fica o de antes (o que mostra mais). Medido e descartado: folga
  de 60 m no de perto (sem lugar livre, a escolha volta ao pior), e folga graduada em dois níveis (igual à simples).
- `render/terrain.ts` + `scenery/clearings.ts` (efeito colateral, visto no `landmarks.test`): com a praça da ponte estaiada mudando, o MASP de Sampa
  (2ª praça) andou 4 segmentos e uma quadra de fundo de OUTRO trecho (seg ~1101, a 285 m dele) caiu na pegada (`masp#1025: quadra a 64 m, -8 m`).
  A clareira do marco agora também vale no espaço (referencial do segmento do marco no quadro), não só pelo índice do segmento.

### Testes vistos falhar antes da correção (árvore e31d139, saídas)
- `landmarks-enquadramento`: `M6_LIMITED` 27 → 7 pares, `ponte_rio_negro` 1,65 → 2,35, Luxor 1,5 → 1,65: `31 marcos pouco vistos`.
- `landmarks-enquadramento-cameras`: Baixa ≤ 13 abaixo, 0 nunca vistos; Alta ≤ 22 e 0: `expected 36 to be less than or equal to 13`.
- `landmarks-pracas`: `M6_NO_PLAZA` → nenhum (`expected [ …(4) ] to deeply equal []`, nas duas verificações); giro do núcleo = do 3D
  (`Cannot find module '/src/core/track/turn'`, import dinâmico só nesse teste); linha central na escala da pista (`monaco_noite: expected
  13073.97 to be less than 0.01`); `clearOfRoad` num estádio sintético (`expected 618.0 to be less than 0.01`: a volta não fechava no giro legado);
  `LANDMARK_HALF_M` (`expected undefined to deeply equal { ponte_estaiada: 152, …(13) }`).
- `landmarks` (`M6_FAR` → nenhum): `expected [ …(5) ] to deeply equal []`.
- `landmark-caption` (`M6_MISSED` 5 → 1): `5 marcos sem legenda na volta 1`.
- `content-version` (T4): `38 pistas mudaram de impressão`: `expected [] to deeply equal [ 'paraty', 'ilhabela', …(36) ]`; recorde de antes na
  Pampulha "versão anterior": `expected false to be true`.
- Visto falhar com a correção do núcleo e antes da do terreno: `landmarks` "as quadras de fundo da cidade não nascem na pegada…":
  `1 quadras: expected [ 'masp#1025: quadra a 64 m, -8 m' ] to deeply equal []`.

### Números (Baixa, a conta de `landmarks-enquadramento`; perto/longe ≥ 2,5 s, horizonte ≥ 4 s, cidade e litoral 2,5 s)

| | antes (e31d139) | depois |
|---|---|---|
| pares pista × marco abaixo do mínimo (com as janelas e o Luxor) | 33 | 13 |
| colocações abaixo do mínimo | 36 | 13 |
| `M6_LIMITED` (pares) | 27 | 7 |
| `M6_NO_PLAZA` | 4 | 0 |
| `M6_FAR` | 5 | 0 |
| `M6_MISSED` (sem legenda na volta 1) | 5 | 1 |
| câmera Baixa: abaixo / nunca vistos / média | 36 / 3 / 4,37 s | 13 / 0 / 4,58 s |
| câmera Alta (FOV 54): abaixo / nunca vistos / média | 46 / 3 / 3,97 s | 22 / 0 / 4,19 s |
| Capô · Frente: abaixo | 33 · 31 | 9 · 7 |
| sprites do núcleo em cima de outro trecho (`cenario-fechado`) | 1.006 | 1.011 |

**O que sobrou** (pior lugar medido, s; o mínimo é 2,5):
- `M6_LIMITED`: Pampulha igreja 2,4 (1ª, seg 116; era 0,8) · ponte JK 1,2 (1ª, seg 60; era 0,0) · arcos de Aracaju 2,3 (1ª, seg 136; era 1,6) ·
  convento da Penha 2,2 (2ª praça, seg 1058, x −309: **entrou**; a conta do núcleo vê os 264 m pedidos e o layout põe o marco na faixa dobrada) ·
  Stratosphere 2,3 (1ª, seg 320; era 1,2) · Rainbow Bridge 1,9 (1ª, seg 88; era 0,0) · cassino de Monte Carlo 1,3 (1ª, seg 184, x −178; era 1,0).
  Todos menos o convento são o primeiro do marco, presos à janela perto da largada.
- Janela da largada (`WINDOW_LIMITED`, sem mudança de causa): farol do Cabo Branco 1,3 · Cape Point 1,6 · Great Ocean 2,3 · Alter do Chão 2,3 ·
  ponte do Rio Negro 2,4 (era 1,7).
- Luxor (`SHAPE_LIMITED`): 1,7 (era 1,8; o facho de luz no céu).
- `M6_MISSED`: castelo de Osaka (o enquadramento já passa: 2,6 s, era 0,4; a legenda da volta 1 não dispara, causa não isolada).
- `cenario-fechado`: lago_paranoa 25 → 26, baia_toquio 74 → 75, osaka_neon 135 → 138 prédios do núcleo em cima de outro trecho (a praça mudou de
  lugar e o prédio que ela tirava por acaso voltou). Teto subido nessas 3.

### Recordes e fantasmas
- O mecanismo já existia: `lapFingerprint` (`src/game/content-version.ts`) leva o traçado construído (`trackLayout`: os sprites sólidos), e os
  prédios que a praça tira são sólidos. Nenhuma versão precisou subir; `PHYSICS_REVISION` segue 3.
- **38 pistas mudam de impressão** (recorde e fantasma de antes viram "versão anterior"; nada é apagado, o save antigo é lido igual, teste novo em
  `content-version.test.ts` com as impressões de e31d139 das 109): paraty, ilhabela, sampa_noite, pampulha, itaunas, convento_penha, curitiba,
  floripa, camboriu, orla_guaiba, lago_paranoa, torre_de_tv, brasilia, cuiaba, porto_seguro, salvador, aracaju, maragogi, maceio, recife_antigo,
  olinda, joao_pessoa, jericoacoara, fortaleza_beira_mar, sao_luis, belem, manaus, ponte_rio_negro, boa_vista, palmas, las_vegas, baia_toquio,
  osaka_neon, paris, monaco_noite, sydney, santorini, roma. As outras 71 (Copacabana inclusive: só marcos de horizonte) ficam iguais.
- `sim-golden` e `hashRace`: iguais (as 8 corridas passam sem mudar `EXPECTED`).
- A impressão do online também muda (leva os traçados): build com a T4 e build sem ela não dividem sala, como esperado.

### Verificação (rodada nesta frente)
- `npx tsc --noEmit -p .` sem saída.
- Área: `tests/landmark* tests/scenery* cenario-fechado track* tracado-mapa terreno-curva-fechada sim-golden determinism ghost cloudsave
  content-version cidade-da-pista corrida-que-muda-terreno horizon-terreno render stars-save expedition-save`: 44 arquivos, 1081 ✓ e 1 estouro de
  tempo (`landmarks` "perLap", 120 s com carga); `landmarks.test.ts` sozinho: 23 ✓.
- `gl-render`: ver o relatório da frente.

### Capturas
- Galeria (V7): `scratch/galeria/base-e31d139/` × `scratch/galeria/marcos/` (60b6817), `scratch/galeria/comparar-base-e31d139-vs-marcos.png`:
  **1 de 13 cenas mudou**, Sampa · noite (6,19% dos pixels; chamadas 56 → 56, triângulos 183.519 → 199.188): a 2ª praça da ponte estaiada saiu de
  1039–1153 (lado direito) para 1017–1097 (esquerdo), e os prédios da beira que ela tirava voltaram ao quadro da chegada ao MASP (seg 970). As
  outras 12, iguais (Paraty: 485 px, abaixo do limiar).
- Antes × depois, câmera Alta, sem HUD (`tools/capture.mjs`, `cam=high&q=high&hud=0`), lado a lado em `scratch/t4-par-*.png`:
  - `floripa` seg 1095 (2ª Hercílio Luz): antes só prédios e a orla; depois a ponte à esquerda.
  - `sampa` (2ª ponte estaiada): antes seg 1090 (ela a 329 m, atrás das quadras: 0,2 s); depois seg 1035, os estais à esquerda do centro.
  - `aracaju` (ponte, 1ª): antes seg 112 (ela a 671 m, fora de vista); depois seg 250, a ponte à direita, sobre o mar.
  - `curitiba` seg 1062 (2ª Ópera de Arame, 1,0 → 3,1 s na conta): a captura não a mostra em nenhum dos dois (o quadro não serve de prova).
