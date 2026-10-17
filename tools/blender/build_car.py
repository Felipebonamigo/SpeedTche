"""Gera um carro nacional do Speed Tchê em .glb a partir de um spec (tools/blender/specs/<nome>.py).

Uso:  /home/user/venv-bpy/bin/python -I tools/blender/build_car.py <nome> <saida.glb> [--estilo cartoon|realista] [--preview <pasta>] [--views a,b]
"""
import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "specs"))
import bpy  # noqa: E402
import carlib as cl  # noqa: E402


def tri_count(root):
    return sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in root.children if ob.type == "MESH")


def build_lod(sp, lod, levels):
    root = cl.empty("lod%d" % lod)
    body = cl.build_shell(sp, lod)
    cl.subsurf(body, levels)
    cl.cut_wheel_arches(body, sp, lod)
    cl.symmetrize(body)
    body.parent = root
    cl.wheel_wells(sp, lod).parent = root
    cl.add_patches(sp, body, lod, root)
    lad = cl.add_ladder(sp, lod)
    if lad is not None:
        lad.parent = root
    glass = cl.split_material(body, "glass", "glass")
    if glass is not None:
        glass.parent = root
    return root


def main():
    args = sys.argv[1:]
    name, out = args[0], args[1]
    preview = args[args.index("--preview") + 1] if "--preview" in args else None
    # --estilo cartoon (padrão, vai ao jogo: ≤ 4.500 △) | realista (mais subdivisão, para ver a diferença e para o Detonauto; fora do jogo)
    estilo = args[args.index("--estilo") + 1] if "--estilo" in args else "cartoon"
    levels = 1 if estilo == "cartoon" else 2
    if estilo == "realista":
        cl.EXTRA_CUTS, cl.ARCH_SEG = 1, 48
    sp = importlib.import_module(name).SPEC
    cl.reset_scene()
    r0 = build_lod(sp, 0, levels)
    r1 = build_lod(sp, 1, 0)
    cl.finish_wheels_and_empties(sp)
    print("lod0 triângulos:", tri_count(r0), "| lod1:", tri_count(r1))
    print("  partes lod0:", {ob.name: sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in r0.children if ob.type == "MESH"})
    cl.export_glb(out)
    if preview:
        import preview as pv
        r1.hide_render = True
        for ob in r1.children:
            ob.hide_render = True
        pv.render_views(preview, name, views=(args[args.index("--views") + 1].split(",") if "--views" in args else None))


main()
