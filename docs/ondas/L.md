# Onda L — Fatia vertical de última geração

> Abertura (10/10/2026). Fonte: `docs/CRONOGRAMA.md`, "Onda L" e "Revisão visual" (R1–R6). Cada frente tem seu cartão em
> `docs/ondas/L/L<n>.md`, escrito pelo agente da frente **antes** de codar (plano + testes a escrever) e commitado com ela.

## Desvio do cronograma, registrado (dono: "siga com a onda L")

O cronograma diz que a L **não abre** sem (1) o `.json` do `--bench` do dono (PC e Deck), (2) o duelo de motores (nº 27) e (3) a
bíblia aprovada. Abre assim mesmo, com estas regras, e o dono pode frear a qualquer momento:

1. **Motor: Three.js Ultra** (o padrão da decisão nº 27 quando não há sessão local para o duelo). O duelo Unity × Three.js fica
   como trilha opcional do dono; se o Unity vencer, o que se perde é só o código de render (L1, L2, L4, L5); contrato do asset, modelos,
   desenhos, textos e testes de núcleo seguem.
2. **Sem números reais de FPS:** todo teto e meta é **provisório**. O gate de desempenho (L2) é escrito para ser medido pelo dono
   (`--bench`, `docs/DESEMPENHO.md` §4); nenhuma frente declara "cabe no Deck" sem esse número. O que dá para provar aqui é contagem
   (chamadas de desenho, triângulos, viewports pelo bench no swiftshader) e captura (antes × depois).
3. **A bíblia** (`docs/DIRECAO-DE-ARTE.md`) vale como está; o dono aprovou os 10 desenhos, ainda não a bíblia inteira: onde a bíblia
   disser "provisório", a frente segue o número provisório e anota no relatório.
4. **Sem artista, Meshy só pela lista** (`docs/MESHY-LISTA.md`, decisão nº 28): procurar pronto CC0 antes; o que faltar entra na lista,
   **nada é gerado pela API sem o dono ver**.

## Regras de toda frente (iguais às da K)

- Teste antes, visto falhar pelo motivo certo; nada com teste vermelho; `sim-golden` e `hashRace` **não mudam** (a L é só render).
- Mudança visual se prova com captura antes × depois, mesma câmera (`tools/capture.mjs`, `tools/referencias.mjs`); o dono é o juiz.
- Não commita no `main`: cada frente trabalha no seu worktree/branch, a mescla e a suíte completa são do orquestrador.
- Não mexe nos arquivos de outra frente (tabela abaixo); contratos compartilhados saem na **frente dona** e as outras só leem.

## Frentes desta abertura

| Frente | Entrega | Arquivos (dono) | Depende de |
|---|---|---|---|
| **L1 Luz, cor, chão e céu** | `src/render/stylize.ts` (`applyStylize(material, família)`, `gradingFor(paleta)`), injetado por `onBeforeCompile` **compondo** com os callbacks que existem (`nitro-car-v1` nos carros — renomear junto — e `scenery-haze`); rampa de luz suave, luz de borda, tone mapping Neutral/AgX com gradação por bioma; helper `atLeast(q, nível)` no lugar dos `=== 'high'`; `Quality` ganha `ultra` | `src/render/stylize.ts`, `palette.ts`, `sky.ts`, `terrain.ts`, `road*.ts`, `cars/material.ts`, `scenery/materials*`, o tipo `Quality` | — |
| **L3 Pipeline de arte e o carro-régua** | `gltf.ts` lê UV, `map` (atlas 256²) e normal opcional; roda do `.glb`; LOD0/1; **um modelo por carro**; carga por arquivo no Electron; `check.ts` valida o contrato (`docs/CONTRATO-DO-ASSET.md`); um carro CC0 estilizado de ponta a ponta, licença registrada (se não achar, vai para `docs/MESHY-LISTA.md` e a frente entrega o pipeline com o carro procedural atual) | `src/render/cars/**` (exceto `material.ts`), `src/render/cars.ts`, `desktop/main.cjs` (protocolo), `docs/CONTRATO-DO-ASSET.md` | — |
| **L2 Pós, qualidade e gate** | degraus Baixa/Média/Alta/**Ultra** (bloom, FXAA/SMAA, MSAA, GTAO, desfoque radial), gate de contagem por viewport no bench | `src/render/renderer.ts`, `effects.ts`, `src/bench/**` | **L1** (o `Quality`/`atLeast`) |
| **L4 Copacabana final** | kit redondo em `scenery/geom.ts`, prédios/quiosques/palmeiras do trecho, Cristo e Pão de Açúcar como heróis-régua, paisagem do Rio | `src/render/scenery/**` | L1 |
| **L5 HUD, título, disputa** | fonte OFL, painéis gordos, posição com mola, distância em segundos, faixa ÚLTIMA VOLTA, raspão derivado, rival na pista | `src/render/hud*`, `src/ui/**`, `src/audio/**` | — |

**Ordem:** L1 e L3 em paralelo agora (arquivos disjuntos). L2 depois da mescla da L1. L4 e L5 depois (L4 precisa do `stylize`).

## Fecho da L

Teste cego visual com ≥ 5 pessoas (meta: ≥ 4 de 5 dizem "atual", nota ≥ 3,5), bench do dono no Deck com a fatia, e aprovação do dono.
Isso abre o Marco 2. Sem os números do bench, a L fecha como **DONE_WITH_CONCERNS**, nunca como DONE.
