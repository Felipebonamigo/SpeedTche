# V22 · F3 — Céu, nuvens, sol e anéis de horizonte (branch `nc/f3-ceu`, base `main` ce38f57, 22/10/2026)

> Frente F3 do plano gráfico V22 (`docs/ondas/V22-diagnostico-cena.md` §3.3–3.5 e §6). Opção A do dono pendente, resolvida por padrão: **pinta-se o brilho do lado do sol de dia; o sol NÃO desceu (continua a 34°, az −42°) e a luz não mudou** (`sunLight`, `sunIntensity`, hemisférica, `envIntensity` e exposição travados em teste).
> **Nada muda em `src/core`**, no save, no online nem na física. Imagens em `docs/diag-v22/f3-ceu/` (JPEG): `<cena>-antes` × `<cena>-depois` (harness, câmera Alta, 1280 × 720, desfoque radial ligado).

## 1. O que mudou

| Escopo do plano | Feito | Onde |
|---|---|---|
| Atlas de nuvens 3 → 8 células | **8 cúmulos + 2 faixas** (10 células de 448 × 224, atlas 896 × 1120 = **4 MiB**, +2 MiB sobre o de 2 MiB, sem textura nova). Os 3 cúmulos de antes ficam (escala da célula nova); 5 novos: torre, achatado, par, inclinado, esgarçado. Cada célula é atribuída por azimute, a menos usada primeiro, **nunca a mesma a < 4 posições** (a volta fecha); Baixa/Média herdam a célula da Alta (subconjunto). | `sky.ts` (`CLOUD_ATLAS`, `cellPuffs`, `cumulusCells`, `cloudLayout`) |
| Duas camadas com paralaxe | A deriva é **por nuvem no vertex shader** (`uDrift × aDrift`; baixas/longe 0,55×, altas 1,5×) no lugar de `clouds.rotation.y`: 0 chamada nova. | `sky.ts` (`CLOUD_VERT`, `update`) |
| Cirros por ruído | No próprio `SKY_FRAG`: placa em perspectiva, ruído de valor 2D com deformação, esticado ao longo do vento, 3 oitavas (Alta/Ultra), 2 (Média), **0 na Baixa** (`uCirrusQ`); anda por `uCirrusT`. Sem textura. No entardecer, mais fraco. | `sky.ts` |
| Gradiente com mais paradas + dither | 7 paradas (antes 3): horizonte clareado, bruma, meio, zênite anil — **só com luz do dia** (`daylight`); entardecer e noite idênticos aos de antes. Dither triangular de 1 LSB na escala do degrau de 8 bits (vale nos caminhos com e sem pós). O gradiente é gerado de uma tabela única em JS e GLSL. | `sky-paint.ts` (novo), `sky.ts` |
| Brilho do lado do sol de dia (A) | Bolha larga sem disco (`uBloom` 0,17, cone de 60°) + horizonte em dois tons por lado do sol (quente do lado do sol, frio do outro). **Só de dia**: no entardecer `bloom` = 0 (a 1ª versão com bloom lavava o rosa do Cânion e do Paraty: cortei). | `sky.ts` (`sunLook`) |
| A luz do carro (IBL) não muda | Toda a pintura nova se multiplica por `uPaint`, que vai a **0 enquanto o env map é fotografado** (e volta). Com `uPaint` = 0 o céu tem a luma do `main` de partida (provado na imagem). | `sky.ts` (`rebuildEnvironment`) |
| Ruído de arvoredo e cume nos anéis | (1) por vértice (`ringPaint`: manchas em 3 escalas antes da névoa, cume iluminado depois); **(2) por fragmento** (1ª rodada: só vértice, 300 colunas, não aparecia na captura): `aForest` por vértice (mancha, contorno, crista, ravina de neve) e ruído 3D no espaço do **objeto** (estável: o anel gira rígido; nunca posição de mundo) mancha a cor, **descarta o contorno da crista** (copas) e sombreia ravinas azuis na neve. Tamanho angular igual nos 3 anéis. Deserto: mancha sem contorno; neve: sem copas, com ravinas. Mesma conta no horizonte do Rio (`ringMesh`; o Pão de Açúcar e as ilhas não levam). | `horizon-rings.ts` (novo), `terrain.ts` (**só** `buildRing`, `RING_VERT/FRAG`), `horizon.ts` |

Não feito: **`lensflare.ts` não foi tocado** (o diagnóstico só o cita como fraco no entardecer; fora do "pronto visual" da F3); **o 1 plano a mais de anel** (custaria chamada/△ e o gate de chamadas está no limite depois de F5/F8); a faixa reta do Alpino é da F1.

## 2. Arquivos

Código: `src/render/sky.ts`, `src/render/sky-paint.ts` (novo), `src/render/horizon-rings.ts` (novo), `src/render/horizon.ts`, `src/render/terrain.ts` (só `buildRing` e os dois shaders do anel). Ferramenta: `tools/ceu-detalhe.{html,ts}` (o domo de verdade numa cena vazia). Testes: **novos** `tests/ceu-f3.test.ts` (32) e `tests/ceu-f3-gl.test.ts` (7).

## 3. Testes de contrato e travas

- **Puro (`ceu-f3.test.ts`)**: atlas ≤ 4 MiB, 10 células com cobertura e margem livre, 8 silhuetas distintas (IoU); 36 nuvens em ≥ 8 células, nenhuma > 35%, nenhuma repetida a < 4 posições; uv da célula e deriva por vértice (altas > baixas); 7 paradas monótonas de dia em 6 biomas; **idêntico ao de antes** sem luz do dia; contínuo na corrida que muda (nenhum canal > 0,07 por passo de 5%, dia→entardecer e entardecer→noite); sol de dia a 34° e luz/exposição pinados; disco/halo de dia iguais; `uPaint` = 0 durante a foto do env map; Baixa sem cirros; `aForest` (periódico, estável, só espaço do objeto); mesmos 300 × 4 △ por anel.
- **GL (`ceu-f3-gl.test.ts`, vistos falhar contra o `main`)**: lado do sol × oposto 0,103 → ≥ 0,15 (sem estourar, ≤ 0,92); estrutura dos cirros 0,014 → ≥ 0,035 (≥ 2,5× sem cirros; Baixa ≤ 0,02); dither 0,0007 → ≥ 0,0012 e < 0,006; `uPaint` = 0 = luma do `main` (0,7686 / 0,6653); entardecer a ± 0,02 do `main`.
- **Travas existentes alteradas: nenhuma.** O teste da V4 (normal pintada lisa < 12° entre pixels vizinhos) **mantido**: 1ª versão dos cúmulos novos dava 13–24°; corrigi o desenho (barriga com sobreposição, bolhas menores maiores, desfoque leve da altura nas células novas), não o teste.

## 4. Medidas (antes × depois)

| medida | antes (`main` ce38f57) | depois |
|---|---|---|
| células de nuvem | 3 cúmulos + 1 faixa | 8 + 2 |
| textura do atlas | 2 MiB | 4 MiB (mesma textura) |
| luma do céu, de frente × de costas p/ o sol (dia) | 0,769 × 0,665 (Δ 0,103) | 0,860 × 0,685 (Δ 0,175) |
| estrutura horizontal do céu (cirros) | 0,014 | 0,050 (Média 0,058, Baixa 0,015) |
| resíduo fino do céu liso (dither) | 0,0007 | 0,0016 |
| △ e chamadas, `tools/folga-gate.mjs`, 16 combinações (pior viewport) | — | **idênticos em todas (0 △, 0 chamadas)**: copa-1p Baixa 117.646 △ / 35, Alta 259.982 / 84, Ultra 260.668 / 85; sampa-4p Média 176.030 / 79 |
| programas de shader | — | os mesmos (domo, nuvem, anel, Rio: texto novo, nenhum programa a mais) |

`src/bench/gate.ts` **não foi tocado**. Rodados (saídas: verdes): `npx tsc --noEmit -p .`; vitest `ceu-f3`, `horizonte-suave`, `pistas-v4`, `corrida-que-muda*` (5), `cor-brilho`, `lente-m2`, `paleta-m2`, `fog-sync`, `horizon-terreno`, `scenery-horizonte-rio`, `render-ground`, `stylize`, `terrain-detail`, `quality-levels`, `galeria`, `noite-roxa`, `estrada-v11`, `landmarks`, `terreno-curva-fechada` (22 arquivos, 302 testes); GL (`NC_REQUIRE_GL=1`) `gl-render` (14, gate e compilação), `corrida-que-muda-gl`, `cor-brilho-gl`, `noite-roxa-gl`, `terreno-detalhe-gl` (24), `ceu-f3-gl` (7). Suíte inteira: com o orquestrador.

## 5. Rodadas de crítica (olhando as capturas)

1. **Cirros e anéis por vértice**: cirros grossos demais (pinceladas gigantes) e o ruído por vértice dos anéis **invisível** (300 colunas de ~19 px) → cirros em escala menor e 0,42 de opacidade; ruído passou para o fragmento (`aForest`) com `discard` da crista.
2. **Bolha do sol**: o Cânion perdeu o magenta e o Copacabana ficou lavado → bloom do entardecer a 0, só de dia, 0,45 → 0,17 e cone mais estreito; o céu deixa de estourar (0,95 → 0,86 de frente).
3. **Anéis**: a neve do Alpino continuava bolha lisa → ravinas azuis verticais; o contorno de copas pixelado → tamanho angular constante e mais suave. 4 quadros da Foz em sequência (`foz-sequencia-depois`): formas de nuvem diferentes em cada um.

**Pronto visual, honestamente:** *céu da Foz sem repetição reconhecível em 5 quadros* — atendido nos 4 quadros capturados (formas e posições diferentes); *lado do sol visivelmente diferente do oposto* — atendido (0,103 → 0,175; no Alpino/Copa o lado esquerdo é mais claro e quente); *anéis com silhueta com ruído* — atendido nos de mata/costa/savana (contorno de copas e manchas), parcial na neve (ravinas, sem recorte de rocha) e **não** no deserto (só manchas). **Não chegou lá:** o céu continua sem **duas camadas de nuvens de verdade** (só deriva diferente por altura) nem sol visível de dia (opção B é do dono); os cirros têm sempre a mesma orientação (esticados no vento fixo) e a 100% de velocidade o desfoque radial os amolece.

## 6. Ressalvas

1. **Ordem dos testes**: o contrato do atlas/layout/gradiente/bolha/IBL e o GL foram escritos antes e vistos falhar (os puros contra stubs com o comportamento antigo; o GL contra um worktree do `main`). O `aForest` por fragmento e as ravinas saíram da crítica visual e os testes vieram **depois** do código; para registrar a falha guardei o código com `git stash` e rodei: 5 de 5 falharam por "não existe" (`aForest`, `forestFragBody`…). Não apaguei e refiz do zero.
2. **Dither duplicado com a F7**: a F7 planeja dither no `OutputPass`; o do céu soma 1 LSB só nos pixels de céu (≈ 1,4 LSB onde os dois valem). Se a F7 entrar, `uPaint`/o dither do domo podem sair sem mexer no resto.
3. **Contorno de copas por `discard`**: borda sem antisserrilhado (MSAA não suaviza `discard`); estável no mundo, mas **só vi quadros parados** — cintilação em vídeo não verificada. O `--bench` e o olho do dono são o juiz; `FOREST_*` em `horizon-rings.ts` tem as escalas.
4. Gosto do dono: `uBloom` (`sunLook`, 0,17), a opacidade dos cirros (0,42 no shader) e `ringForestAmp`.
5. O atlas passou de 2 para 4 MiB (interpretei "+1 textura 2 MB" como +2 MiB; sem textura nova). Geração ~1 s no carregamento (cache por processo).
6. `terrain.ts`: hunk em `buildRing` e nos dois shaders do anel (F7 também mexe em `buildRing`: conflito provável, mas só de linhas; a conta de cor por coluna agora está em `ringPaint`).
