"""Carros HERÓI dos estilos `Hull`-based (V15): hyper, wedge, prototype, roadster (e os que vierem) em alta definição, feitos no Blender por script (bpy).

O casco nasce da GAIOLA do estilo (`hero/<estilo>-gaiola.json`, exportada de `src/render/cars/hull.ts` por `hero/exportar-gaiola.ts`) pelo MESMO método do herói do GT
(`build_hero_gt.py`: superfície de subdivisão, vincos na cintura, soleira e boca do vão, alisamento de Taubin, cabine em loft). As peças de cada estilo (lanternas em tira de LED, faróis,
grades, difusor, escapes, asa, retrovisores, cockpit) ficam em `hero_styles/<estilo>.py`, com as primitivas de `build_hero_gt.py` e de `hero_parts.py`. Mesmos nomes de nó e de material
do estilo de sempre: o jogo aplica tinta, faixa, roda, chama e verniz como no estilo procedural. Sem logo nem emblema de marca.

Uso:  /home/user/venv-bpy/bin/python -I tools/blender/build_hero.py <estilo> <saida.glb> [--preview <pasta> --views a,b --big --backfaces --samples n]
"""
import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_hero_gt as H  # noqa: E402
import carlib as cl  # noqa: E402


def main():
    args = sys.argv[1:]
    style, out = args[0], args[1]
    preview = args[args.index("--preview") + 1] if "--preview" in args else None
    H.use_cage(os.path.join(HERE, "hero", f"{style}-gaiola.json"))
    mod = importlib.import_module(f"hero_styles.{style}")
    H.CFG["roof_glass_gaps"] = mod.ROOF_GLASS_GAPS
    H.CFG["belt_paint_gaps"] = getattr(mod, "BELT_PAINT_GAPS", ())
    H.CFG["arch_trim"] = getattr(mod, "ARCH_TRIM", False)
    cl.reset_scene()
    cl.MATERIALS.update(H.HERO_MATERIALS)
    root = cl.empty("lod0")
    body = H.build_body()
    body.parent = root
    skins = [body]
    if H.CAGE.get("cabin"):
        cabin = H.build_cabin()
        cabin.parent = root
        skins.append(cabin)
    tree = H.surface_tree(skins)
    for ob in ([] if os.environ.get("HERO_SO_CASCO") else mod.build(tree)):  # HERO_SO_CASCO=1: só o casco e a cabine (para olhar a gaiola sem as peças)
        if ob is not None:
            ob.parent = root
    H.wheels_and_empties(exhaust=mod.EXHAUST, seat=mod.SEAT, single_exhaust=mod.SINGLE_EXHAUST)
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
