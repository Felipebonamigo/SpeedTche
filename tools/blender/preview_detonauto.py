"""Renderiza o Cuiabano REALISTA do Detonauto (base/make_cuiabano_detonauto.py) com o mesmo enquadramento da prévia do Speed Tchê, para a folha de comparação.
Uso: python -I tools/blender/preview_detonauto.py <pasta-de-saida>"""
import math
import os
import runpy
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
out = sys.argv[-1]
sys.argv = ["x", "--", "--no-export"]
runpy.run_path(os.path.join(HERE, "base", "make_cuiabano_detonauto.py"), run_name="__main__")
# o carro do Detonauto: frente +X, esquerda +Y; gira para a convenção desta prévia (frente -Y): rotação de +90 graus em Z leva +X a +Y, então use -90
root = bpy.data.objects.new("rot", None)
bpy.context.scene.collection.objects.link(root)
for ob in list(bpy.data.objects):
    if ob.parent is None and ob is not root:
        ob.parent = root
root.rotation_euler = (0, 0, -math.pi / 2)
for ob in bpy.data.objects:
    if ob.type == "MESH":
        for m in ob.data.materials:
            if m and m.name == "Body":
                m.use_nodes = True
                m.node_tree.nodes["Principled BSDF"].inputs[0].default_value = (0.75, 0.05, 0.05, 1)
sys.path.insert(0, HERE)
import preview as pv  # noqa: E402
pv.render_views(out, "detonauto")
