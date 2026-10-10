# Lista do Meshy — o que não existe pronto

Regra do dono (09/10/2026, decisão nº 28 do `docs/CRONOGRAMA.md`):
1. **Sempre procurar pronto antes**, nesta ordem: galeria da comunidade do Meshy (só CC0), Kenney, Quaternius, Poly Pizza
   (CC0), Poly Haven / ambientCG (texturas e céus). Registrar a licença de cada arquivo baixado (`docs/ARTE.md`).
2. **O que não existir pronto entra aqui**, com o prompt proposto. **Nada é gerado sem o dono ver a lista** (gasta créditos dele).
3. Gerado ou baixado, todo modelo passa por `tools/convert-landmark.mjs` (marco/peça) ou pelo Blender + `npm run check-car`
   (carro), pelos tetos de triângulos e pela régua de leitura (`tests/front-view.ts`). Nada é gerado em tempo de jogo.

Sem artista (dono, 09/10/2026): os carros também saem daqui, limpos no Blender (rodas separadas, camadas de pintura,
nós `kit_*`, ponto `seat`).

| # | Peça | Onde entra | Procurado pronto em | Resultado da busca | Prompt proposto | Estado |
|---|---|---|---|---|---|---|
| — | (vazia: a 1ª busca é a do piloto de Copacabana da L — Cristo, Pão de Açúcar, quiosque, calçadão, palmeira, barraca, banhista, prédio de orla, guarda-sol, placa) | L | — | — | — | a buscar |
| C1 | Carro GT cartunesco (o Falcão: 4,4 × 1,9 m, roda grande, cabine bolha, traseira-vitrine) | L3/U1, `src/assets/cars/falcao.glb` | Kenney Car Kit 3.1 (CC0: só `sedan-sports`, `hatchback-sports` e `race`, de caixa e ~2.000 triângulos, sem a cara do alvo); Quaternius e Poly Pizza (sem acesso daqui) | só o brinquedo do Kenney; nenhum GT cartunesco de acabamento MK8 | "stylized cartoon sports GT coupe, chunky rounded body, oversized wheels, bubble cabin, Mario Kart 8 / Crash Team Racing Nitro-Fueled style, clean palette colors, no logos, no real car brand, one single object, 3/4 front view" (remalha baixa e textura de paleta; depois Blender: rodas separadas, materiais `paint*`/`accent*`/`headlight*`/`taillight*`, `seat`, `lod1`; `npm run check-car`) | **não gerado**: aguarda o dono ver a lista e dar o teto de créditos (nº 28) |

**Carro-régua (L3, 10/10/2026): achado pronto, então não entra na lista como pendência.** Busca: Kenney Car Kit 3.1 (CC0; `kenney.nl` responde no
proxy daqui, `poly.pizza` e `github.com` dão 403). Entrou o `sedan-sports.glb` como **Falcão GT** (`src/assets/cars/falcao.glb`, licença em
`docs/ARTE.md`). Ele é mais simples que os carros procedurais e é um brinquedo de paleta, não o acabamento de última geração; a linha C1 é a
proposta (não gerada) para o carro com a cara de MK8/CTR, se o dono quiser.
