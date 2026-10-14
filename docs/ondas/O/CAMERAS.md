## Câmeras selecionáveis (frente `nc/cameras`)

> Base `75d0436` (0.1.4). Frente **bounded**: só renderização e entrada local; nada em `src/core`, nada na rede (a câmera nunca entra no lockstep; `hashRace` e `sim-golden` não mudam).
> Decisão do dono: tecla **C** troca a câmera (kb1). kb2 = **V**, controle = **Select/Back (botão 8)**: todos livres (conferido em `bindings.ts`).

### Design (2 frases)
Quatro poses em `camera-base.ts` — **Alta** (nova padrão: h 2,5 · back 7,8 · FOV 36 · lookY 0,7, a pose B do quadro-alvo), **Baixa** (a `CHASE_CAMERA` de hoje), **Capô** e **Frente** (presas ao carro: posição local do modelo, sem atraso lateral) — escolhidas por assento em `Settings.seatCameras` (campo aditivo, padrão Alta) e ciclada em corrida pela ação remapeável `camera` (borda, lida só no cliente local). No Capô o próprio carro tem cabine/teto cortados por um bit novo em `instExtra.w` (corte por altura no fragment, sem chamada nem lote novo); no Frente a câmera fica no para-choque, e os dois reduzem FOV dinâmico, rolagem e tremor.

### Levantamento (arquivo:símbolo)
- `src/render/camera-base.ts` `CHASE_CAMERA` (usada por `scenery/sight.ts` `TAN_V`, `sightSeconds`, `orbitCamera`, `stepNitroFov`) → vira a pose Baixa; ganha `CAMERA_POSES`.
- `src/render/camera.ts` `ChaseCamera.update` (altura, FOV, roll, órbita, crista) → recebe o modo.
- `src/render/scenery/sight.ts` `CAMERA_DYNAMICS`, `cameraLowering`, `tremorOffset`, `stepNitroFov`, `orbitCamera` → ganham tabela por câmera e teste.
- `src/render/renderer.ts` laço por viewport (`cam.update`, `cars.pose`) → passa o modo do assento.
- `src/render/cars.ts` `pose` (flags em `instExtra.w`), `cars/material.ts` (bits 3–5 = acabamento; bit 6 e corte livres).
- `src/ui/input.ts` (`DeviceRaw`, `EDGE_KEYS`, `mapKeyboard/mapGamepad`), `src/game/contracts.ts` (`InputProvider`, `Settings`, `RenderFrame`), `src/game/settings.ts` `sanitizeSettings`, `src/game/session.ts` (aviso na tela).
- `src/ui/remap/bindings.ts` (12ª ação entre `horn` e `pause`), `remap/strings.ts`, `screens/controls.css` (grade de 12 linhas), `screens/options.ts`/`access/screen.ts` (seletor por assento).
- `scripts/playtest-controls.mjs` (ROWS = 11), `playtest-layout.mjs`; `desktop/teste/LEIA-ME.txt`, `docs/CONTROLES.md`, `docs/VISUAL.md`.

### Testes (antes do código)
`tests/cameras.test.ts` (modos, ciclo, poses, limites por câmera em `sight.ts`, corte do capô, enquadramento dos marcos por câmera); `tests/input-remap.test.ts` (12 ações, padrões C/V/8, mapa antigo abre intacto); `tests/settings*.test.ts` (fixture literal sem `seatCameras` → Alta; save novo lido pela 0.1.4 = campo desconhecido ignorado); `gl-render` (chamadas iguais com o Capô).

### Riscos
Grade com 12 linhas estoura 1024×640 (ajustar gap/altura de célula); Alta muda o corredor de visão dos marcos (medir `landmarks-enquadramento*`); capô em carros `.glb` (corte por altura medida da malha); pergunta ao dono: "na frente" foi lido como câmera do para-choque olhando para a frente, não câmera à frente olhando para trás.

### Resultado (fechado)
- **Tecla:** C (teclado 1), V (teclado 2), Select/Back = botão 8 (controle). A ação `camera` é a 12ª e a **última** (depois da pausa): quem chega primeiro fica com o código, então mapa salvo antigo que usava C/V/8 em qualquer ação (inclusive a pausa) não perde nada para ela; o saneador ganhou um passo 3 que garante que nenhuma ação termina vazia (mapa adulterado que gasta todos os 15 botões).
- **Entrada:** `DeviceRaw.camera` (borda) e `InputProvider.cameraPressed?(seat)` — fora do `PlayerInput` (nada vai à rede). Troca em `src/game/camera-switch.ts` (`switchCamera`) e aviso "Câmera: Capô" (1,4 s) só na tela de quem trocou; grava `Settings.seatCameras`. Em pausa, em menu e no Retrô a tecla não faz nada.
- **Seletor:** Opções › Acessibilidade, coluna "Direção assistida": "Câmera J1..J4" (a coluna cabe: 4 linhas de assistência + 4 de câmera + 30 fps).
- **Capô:** `carMount` (cars/mount.ts) mede a malha de cada modelo: olho 0,55 m acima do capô (topo nos 26% da frente), a ~52% do comprimento; o corte (cabine e teto somem) é o bit 6 de `instExtra.w` + altura em cm, descartado no fragmento: **0 chamada e 0 lote novos**. **Frente:** olho a 0,4 m do chão na borda dianteira da caixa de colisão; a carroceria inteira some (cutY 0). Presas ao carro: sem atraso lateral, sem crista, sem órbita (na vitória vira a Alta), tremor/tranco 50%, rolagem 40%, FOV dinâmico 20% com "reduzir efeitos".
- **Régua dos marcos:** `sightSeconds(…, mode)`, `landmarkSight(…, mode)` e `CaptionView.mode` usam a pose da câmera ativa; o layout continua posto com a Baixa. Medido (`tests/landmarks-enquadramento-cameras.test.ts`): média de segundos à vista / instâncias abaixo do mínimo / nunca vistas — Baixa 4,37 / 36 / 3, **Alta 3,09 / 103 / 9**, Capô 4,51 / 33 / 2, Frente 4,66 / 31 / 1. A padrão nova (Alta, FOV 36) vê os marcos de lado por ~1,3 s a menos; decisão do dono: refazer o layout pensando na Alta (muda o cenário das 109 pistas) ou abrir um pouco o FOV da Alta.
- **Chave do programa dos carros:** `speed-tche-car-v3` (o shader ganhou o corte).
- **Pergunta ao dono:** "uma na frente" foi lida como a câmera do para-choque olhando para a frente. Se ele quis uma câmera NA FRENTE do carro olhando para trás (a que mostra o carro vindo), não está feita.
