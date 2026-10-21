"""Carros HERÓI dos nacionais livres (V17): Cuiabano e Tupiniquim em alta definição, feitos no Blender por script (bpy).

O casco é o MESMO dos carros de V6c (`specs/<carro>.py`: silhueta, proporção, eixos, escapes e pegada), só que com subdivisão nível 2 e o vão de roda em 48 lados; os remendos
chapados de V6c (farol, lanterna, para-choque, placa, frisos) saem e entram peças de verdade em relevo (`hero_nac.py`, `hero_nacionais/<carro>.py`): lanternas em células com refletor e
lente em dois tons, farol com refletor, para-choque com friso, grade lisa, placas lisas, retrovisores, maçanetas, limpadores, antena, escapamento simples. Mesmos nomes de nó e de
material de um carro da arte (`paint`, `stripe_a/b`, `glass`, `headlight*`, `taillight*`...): o jogo aplica tinta, faixa, roda, chama e verniz como no carro de sempre. Sem logo nem emblema.

Uso:  /home/user/venv-bpy/bin/python -I tools/blender/build_hero_nacional.py <carro> <saida.glb> [--preview <pasta> --views a,b --big --backfaces --samples n]
"""
import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "specs"))
import bpy  # noqa: E402,F401
import build_hero_gt as H  # noqa: E402
import carlib as cl  # noqa: E402
import hero_nac  # noqa: E402,F401  (registra os materiais a mais)


def build_body(sp, keep):
    """Casco de V6c com mais subdivisão e só os remendos de `keep` (a faixa do projeto, a soleira, a cintura e os alargamentos dos para-lamas); o resto vira peça em relevo."""
    cl.EXTRA_CUTS, cl.ARCH_SEG = 1, 48
    root = cl.empty("lod0")
    body = cl.build_shell(sp, 0)
    cl.subsurf(body, 2)
    cl.cut_wheel_arches(body, sp, 0)
    cl.symmetrize(body)
    body.parent = root
    cl.wheel_wells(sp, 0).parent = root
    # os remendos que ficam (faixa, soleira, cintura, alargamentos) sobem um pouco mais: sobre a pele de nível 2 a folga de V6c deixava pontos do casco furarem a borda
    sp2 = dict(sp, patches=[dict(p, offset=p.get("offset", 0.006) + 0.006) for p in sp["patches"] if any(p["name"].startswith(k) for k in keep)], misc=[], cyls=[])
    cl.add_patches(sp2, body, 0, root)
    glass = cl.split_material(body, "glass", "glass")
    glass.parent = root
    return root, body, glass


def main():
    args = sys.argv[1:]
    car, out = args[0], args[1]
    preview = args[args.index("--preview") + 1] if "--preview" in args else None
    sp = importlib.import_module(car).SPEC
    mod = importlib.import_module(f"hero_nacionais.{car}")
    cl.reset_scene()
    cl.MATERIALS.update(H.HERO_MATERIALS)
    root, body, glass = build_body(sp, mod.KEEP)
    tree = H.surface_tree([body, glass])
    for ob in ([] if os.environ.get("HERO_SO_CASCO") else mod.build(tree, sp)):  # HERO_SO_CASCO=1: só o casco, sem as peças
        if ob is not None:
            ob.parent = root
    cl.finish_wheels_and_empties(sp)
    print("lod0 triângulos:", H.tri_count(root))
    print("  partes:", {ob.name: sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in root.children if ob.type == "MESH"})
    cl.export_glb(out)
    if preview:
        if "--backfaces" in args:
            H.debug_backfaces()
        H.VIEWS.update(getattr(mod, "VIEWS", {}))
        H.render_views(preview, args[args.index("--views") + 1].split(",") if "--views" in args else ["tras34"],
                       res=(900, 560) if "--big" in args else (560, 350), samples=int(args[args.index("--samples") + 1]) if "--samples" in args else 12)


if __name__ == "__main__":
    main()
