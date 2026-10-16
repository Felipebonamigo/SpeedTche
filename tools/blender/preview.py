"""Prévia por Cycles (CPU): o Workbench/EEVEE precisam de GPU, que o bpy de pip não tem. Só para iterar na forma; as imagens finais saem do jogo."""
import math
import os
import bpy
from mathutils import Vector

VIEWS = {
    "lateral": (Vector((9, 0, 0.9)), (math.radians(90), 0, math.radians(90))),
    "frente34": (Vector((-6.2, -6.2, 2.6)), None),
    "tras34": (Vector((6.2, 6.2, 2.6)), None),
    "frente": (Vector((0, -9, 0.9)), (math.radians(90), 0, 0)),
}


def look_at(cam, target):
    d = target - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def render_views(folder, name, res=(560, 350), samples=12, views=None):
    os.makedirs(folder, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    sc.cycles.device = "CPU"
    sc.render.resolution_x, sc.render.resolution_y = res
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.62, 0.72, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 1.1
    sc.world = w
    # chão
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    gm = bpy.data.materials.new("g")
    gm.diffuse_color = (0.3, 0.3, 0.3, 1)
    gm.use_nodes = True
    gm.node_tree.nodes["Principled BSDF"].inputs[0].default_value = (0.25, 0.25, 0.26, 1)
    bpy.context.object.data.materials.append(gm)
    sun = bpy.data.lights.new("s", "SUN")
    sun.energy = 3.0
    so = bpy.data.objects.new("s", sun)
    so.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))
    sc.collection.objects.link(so)
    cam = bpy.data.cameras.new("c")
    cam.lens = 70
    co = bpy.data.objects.new("c", cam)
    sc.collection.objects.link(co)
    sc.camera = co
    # cor do carro: a "paint" já é branca; tinge para a prévia
    for m in bpy.data.materials:
        if m.name.startswith("paint"):
            m.node_tree.nodes["Principled BSDF"].inputs[0].default_value = (0.75, 0.05, 0.05, 1)
    for vn, (loc, rot) in [(k, v) for k, v in VIEWS.items() if views is None or k in views]:
        co.location = loc
        if rot:
            co.rotation_euler = rot
        else:
            look_at(co, Vector((0, 0, 0.7)))
        sc.render.filepath = os.path.join(folder, f"{name}-{vn}.png")
        bpy.ops.render.render(write_still=True)
