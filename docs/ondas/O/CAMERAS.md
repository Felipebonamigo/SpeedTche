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
