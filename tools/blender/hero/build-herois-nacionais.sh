#!/bin/sh
# Gera os cascos herói dos nacionais livres (V17) em src/assets/cars/hero/<carro>.glb (npm run carros-herois-nacionais [carro ...]; sem argumento, os dois). O Python com o bpy fica FORA
# do repositório (ver tools/blender/README.md). O herói nasce do mesmo spec do carro de V6c (tools/blender/specs/<carro>.py): se o casco do carro mudar, gere este de novo.
set -e
PY="${BPY_PYTHON:-/home/user/venv-bpy/bin/python}"
cd "$(dirname "$0")/../../.."
mkdir -p src/assets/cars/hero
for car in ${@:-cuiabano tupiniquim}; do
  "$PY" -I tools/blender/build_hero_nacional.py "$car" "src/assets/cars/hero/$car.glb"
done
