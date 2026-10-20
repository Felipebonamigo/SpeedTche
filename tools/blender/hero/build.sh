#!/bin/sh
# Gera o casco herói do Falcão GT em src/assets/cars/hero/gt.glb (npm run carro-heroi). O Python com o bpy fica FORA do repositório (ver tools/blender/README.md).
# A gaiola (hero/gt-gaiola.json) sai de src/render/cars/hull.ts: se o GT de sempre mudar de forma, rode antes `npx tsx tools/blender/hero/exportar-gaiola-gt.ts > tools/blender/hero/gt-gaiola.json`.
set -e
PY="${BPY_PYTHON:-/home/user/venv-bpy/bin/python}"
cd "$(dirname "$0")/../../.."
mkdir -p src/assets/cars/hero
"$PY" -I tools/blender/build_hero_gt.py src/assets/cars/hero/gt.glb
