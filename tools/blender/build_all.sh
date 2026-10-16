#!/bin/sh
# Gera os carros nacionais em src/assets/cars/<id>.glb (npm run carros-blender). O Python com o bpy fica FORA do repositório:
#   python3.11 -m venv /home/user/venv-bpy && /home/user/venv-bpy/bin/pip install bpy   (outro caminho: BPY_PYTHON=...)
set -e
PY="${BPY_PYTHON:-/home/user/venv-bpy/bin/python}"
cd "$(dirname "$0")/../.."
for car in ${@:-cuiabano tupiniquim}; do
  "$PY" -I tools/blender/build_car.py "$car" "src/assets/cars/$car.glb"
done
