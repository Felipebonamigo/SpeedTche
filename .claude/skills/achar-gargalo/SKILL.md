---
name: achar-gargalo
description: 'Acha o que está pesando no quadro do Speed Tchê: qual linha de execução manda, qual função ou passo de GPU, quanto passa da meta (60 fps na Baixa, 120 no Ultra a 1440p) e onde anotar. Use quando o fps cair, antes de aprovar sistema novo de dano, tráfego, efeito ou multidão, ou quando o Felipe disser "está travando", "caiu o fps", "mede isso" ou "por que pesa".'
---
# Achar o gargalo

A meta: 60 fps na Baixa e na Média com até 2 jogadores; Ultra a 120 fps em 2560×1440 numa RTX 4070 Ti (`src/bench/ultra.ts`,
`src/bench/metrics.ts`). A simulação gasta, no pior caso, 0,5 ms dos 16,7 ms do quadro (`docs/DESEMPENHO.md`). Nenhum fps
foi medido em máquina real: falta o `--bench` do Felipe.

Medir o fps diz *se* pesa; esta rotina diz *o quê*. Sem saber o quê, otimização é chute.

## Passos

1. Reproduza com números: a mesma cena, a mesma câmera, o mesmo preset.
   Na nuvem: as contagens do `GATE_LIMITS` e o perfil de CPU (abaixo). No PC: o Felipe roda o executável com
   `--bench` e manda o `<userData>/bench/bench-<data>.json`; leia na ordem do `docs/DESEMPENHO.md` §4.
2. Ache a linha de execução ou a etapa que manda (seções abaixo).
3. Ache a função ou o passo culpado e meça de novo sem ele (desligue o sistema, troque o efeito por nada) para provar.
4. Corrija o culpado e meça de novo nas mesmas condições. Sem antes e depois, não está provado.
5. Anote data, cena, preset, máquina, antes e depois, e o que mudou em `docs/DESEMPENHO.md`, na seção da onda, com a tabela antes e depois (chamadas, triângulos, geometrias, texturas),
   o commit de base e a ferramenta.

## No navegador (Three.js)

1. **Quanto custa.** Contagens, que valem no swiftshader: `GATE_LIMITS` em `src/bench/gate.ts` (chamadas, triângulos, passes por
   cena e nível), cobrado no `tests/gl-render.test.ts` com `NC_REQUIRE_GL=1`. Banco de prova `?bench=1` (6 cenas, 600
   quadros; `node tools/bench.mjs <porta>` só prova o formato). Simulação: `npx tsx scripts/perf-sim.ts`.
2. **Onde está o tempo.** Com o vite numa porta sua, o script desta skill grava o perfil de CPU de uma cena e lista as funções por tempo
   próprio, separando o JavaScript do `(program)`:
   ```bash
   node .claude/skills/achar-gargalo/perfil_da_cena.mjs <porta> "/?bench=1&cenas=copa-2p" 10
   node .claude/skills/achar-gargalo/perfil_da_cena.mjs <porta> "/tools/render-harness.html?track=copacabana&seg=70&humans=2" 8
   ```
   O `.cpuprofile` fica em `scratch/` (abre no DevTools, aba Performance). Para a simulação:
   `node --cpu-prof --cpu-prof-dir=scratch/prof --import tsx scripts/perf-sim.ts --quick`.
3. A renderização por software do container (swiftshader) deixa o tempo de GPU pessimista: na nuvem, confie no tempo
   de JavaScript e nas contagens (draw calls, triângulos, texturas); fps de verdade só no PC do Felipe.

## Armadilhas

- Média esconde engasgo: olhe também o p95 e o pior quadro.
- Primeira execução compila shader e carrega asset: descarte os primeiros segundos.
- No swiftshader, compare contagens e tempo de JavaScript, nunca fps.
- Encerre o vite que você abriu pelo PID dele; nunca `pkill -f` (CLAUDE.md).
