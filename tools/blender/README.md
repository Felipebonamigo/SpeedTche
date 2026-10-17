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
