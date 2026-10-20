# tools/blender — carros nacionais por script (Blender, módulo `bpy`)

Gera `src/assets/cars/<carro>.glb` (Cuiabano, Tupiniquim) a partir de **dados de projeto**: medidas em metros do jogo, curvas de perfil e peças
em `specs/<carro>.py`. Nada de malha de terceiros; as proporções do arquétipo são estimativas de dimensão pública (cartão `docs/ondas/V6c-nacionais.md`).

```bash
python3.11 -m venv /home/user/venv-bpy && /home/user/venv-bpy/bin/pip install bpy     # uma vez, FORA do repositório (bpy 5.0.1)
npm run carros-blender                       # os dois, direto em src/assets/cars/ (outro Python: BPY_PYTHON=...)
/home/user/venv-bpy/bin/python -I tools/blender/build_car.py cuiabano scratch/x.glb --preview scratch/prev --views lateral,frente34
/home/user/venv-bpy/bin/python -I tools/blender/build_car.py cuiabano scratch/x.glb --estilo realista   # mais subdivisão, FORA do jogo
npm run check-car -- src/assets/cars/cuiabano.glb                         # o validador do jogo
node tools/blender/capturar.mjs scratch/nacionais cuiabano tupiniquim tornado   # capturas no jogo (sobe o vite e o encerra pelo PID)
```

- `carlib.py`: curvas (`pchip`), casco por estações (anel de 16 pontos × estações → quadrângulos com vincos → subsurf), vão de roda por booleana +
  `symmetrize`, calha do vão, remendos projetados (`patch`: farol, lanterna, grade, placa, frisos de porta — contorno → `shrinkwrap`), rodas, exportação.
- `build_car.py`: monta lod0 (subsurf 1) e lod1 (sem subsurf), rodas (`wheel_*`, eixo em X, `extras.spokes`), vazios `exhaust_l/r` e `seat`.
- `preview.py`: prévia por Cycles (o Workbench/EEVEE não existem sem GPU); só para iterar. As imagens de aprovação saem do jogo (`capturar.mjs`).
- `base/make_cuiabano_detonauto.py` + `preview_detonauto.py`: o Cuiabano realista do projeto irmão Detonauto (de Felipe), só para comparar a silhueta.
- Convenção: Blender com a FRENTE EM −Y; o exportador (Y para cima) leva à do jogo (frente +Z no glTF). Materiais pelo nome (`paint`, `glass`,
  `headlight`, `taillight`, `bumper`, `trim`, `tire`, `rim`…): `docs/ARTE.md`. Teto de casco: `CAR_LIMITS.maxShellTriangles` (4.500), lod1 ≤ 45%.
- Marca: nome, logo, grade-assinatura e desenho exato de farol/lanterna não entram; `tests/carros-nacionais.test.ts` varre o .glb e este diretório.

## Carro herói (V9) — `build_hero_gt.py`

O casco de ALTA definição do Falcão GT (10 a 20 mil △, `HERO_MAX_TRIANGLES`), que o jogo usa só no carro humano perto da câmera (`src/render/cars/lod.ts`; cartão `docs/ondas/V9-heroi.md`).

```bash
npm run carro-heroi                                   # gera src/assets/cars/hero/gt.glb
/home/user/venv-bpy/bin/python -I tools/blender/build_hero_gt.py scratch/x.glb --preview scratch/prev --views tras_perto,frente_perto,lado_perto --big [--backfaces]
npx tsx tools/blender/hero/exportar-gaiola-gt.ts > tools/blender/hero/gt-gaiola.json   # se o GT de sempre (hull.ts) mudar de forma
node tools/heroi-folha.mjs                            # folha HC2 × GT atual × GT herói, no jogo
```

- A **gaiola** (`hero/gt-gaiola.json`) sai do `Hull` de `src/render/cars/hull.ts`: as estações e os anéis do GT de sempre (mesmos eixos, pegada e alturas), com 8 facetas no arco e 8 cm de folga (a subdivisão puxa o polígono uns 3 cm para dentro). O casco é a gaiola + superfície de subdivisão (nível 1, vincos na cintura, na soleira e na boca do vão de roda) + um alisamento de Taubin fora dos vincos; a cabine é um loft de seções (nível 1) com o vidro entre as colunas.
- As peças (`lamp_tail`, `led`, `grade_colmeia`, `placa`, `difusor`, `escape_l/r`, `asa`, `suporte_l/r`, `lamp_head`, `farol_projetor_l/r`, `naca`, `fresta_*`, `macaneta_*`, `entrada_ar_*`, `retrovisor_*`, `pincas`) são geometria própria: sólidos de revolução (`lathe`), extrusões e **remendos conformes** (`patch_on`: o contorno 2D preenchido por uma grade recortada e assentado na pele subdividida por raios). Os nomes dos nós e materiais são os do contrato do GT (`paint`, `stripe_a/b`, `accent`, `glass`, `headlight*`, `taillight*`...), em cor linear dos pincéis de `paints.ts`.
- `--backfaces` pinta de magenta, na prévia, o que o jogo não desenha (face virada para dentro): as rodas de `carlib.py` aparecem assim e não importam (o jogo usa a roda do catálogo).
- Sem marca: `tests/heroi-asset.test.ts` varre o `.glb` e este diretório.

## Carros herói dos outros estilos (V15) — `build_hero.py`

O mesmo método do herói do GT para os estilos `Hull`-based: **hyper** (Pororoca V10), **wedge** (Iara Turbo), **prototype** (Beija-Flor) e **roadster** (Curupira S). Cada estilo é a **gaiola** do `Hull` do estilo (`hero/<estilo>-gaiola.json`, exportada por `hero/exportar-gaiola.ts`, que espia o `Hull` dentro do construtor do estilo: mesmos eixos, pegada e escapes, 8 facetas no arco, 8 cm de folga) + subdivisão lisa + as peças do estilo em `hero_styles/<estilo>.py`.

```bash
npm run carros-herois                       # exporta as quatro gaiolas e gera src/assets/cars/hero/{hyper,wedge,prototype,roadster}.glb (ou: npm run carros-herois wedge)
/home/user/venv-bpy/bin/python -I tools/blender/build_hero.py hyper scratch/x.glb --preview scratch/prev --views tras_perto,tras34,frente_perto --big [--backfaces]
HERO_SO_CASCO=1 /home/user/venv-bpy/bin/python -I tools/blender/build_hero.py wedge scratch/x.glb --preview scratch/prev --views capo   # só o casco e a cabine
node tools/herois-folha.mjs scratch/herois                   # folhas HC2 × atual × herói por estilo e o resumo, no jogo
node tools/herois-gate.mjs                                   # as chamadas e os triângulos do pior caso (4 humanos em 4 estilos) nas cenas do gate
```

- `build_hero_gt.py` é a biblioteca (casco, cabine, `Part`, `lathe`, `patch_on`, `strip_on`...; `use_cage` troca a gaiola, `CFG` leva o que muda de estilo: borda do teto, vãos de vidro, cockpit aberto); `hero_parts.py` traz o que os estilos repetem: **lanterna e farol em TIRA de LED** (`strip_lamp`: moldura em relevo, poço, lente em leque de uma peça só — o `aLens` e o halo da lanterna seguem valendo —, divisórias, venezianas e LEDs), asa, difusor, ponteira de escape, retrovisor, lanterna redonda, caixa e extrusão de cantos arredondados.
- O jogo aplica ao herói de cada estilo a mesma tinta, faixas A/B, acento, roda, chama e verniz do estilo de sempre (mesmos nomes de nó e de material; a tampa dos faróis escamoteáveis da cunha usa `*_popup` no nome do material, que o jogo sobe à noite).
- Sem marca: `tests/herois-asset.test.ts` varre os `.glb` e este diretório.
