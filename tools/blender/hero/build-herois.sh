#!/bin/sh
# Gera os cascos herói dos estilos Hull-based (V15) em src/assets/cars/hero/<estilo>.glb (npm run carros-herois [estilo ...]; sem argumento, todos). O Python com o bpy fica FORA do repositório
# (ver tools/blender/README.md). Cada gaiola (hero/<estilo>-gaiola.json) sai de src/render/cars/hull.ts: se o estilo de sempre mudar de forma, este script a exporta de novo antes de gerar.
set -e
PY="${BPY_PYTHON:-/home/user/venv-bpy/bin/python}"
cd "$(dirname "$0")/../../.."
mkdir -p src/assets/cars/hero
STYLES="${*:-hyper wedge prototype roadster muscle rally}"
for s in $STYLES; do
  npx tsx tools/blender/hero/exportar-gaiola.ts "$s" > "tools/blender/hero/$s-gaiola.json"
  "$PY" -I tools/blender/build_hero.py "$s" "src/assets/cars/hero/$s.glb"
done
