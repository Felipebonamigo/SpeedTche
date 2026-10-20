"""Carro de rali HERÓI (Carcará RS, estilo `rally`): as peças em cima do casco da gaiola (`hero/rally-gaiola.json`: para-lamas ALARGADOS em caixa com a borda preta no arco). Frente com os dois faróis
retangulares em fenda, a barra com quatro faróis de milha redondos embutidos e a grade; flanco com o painel de número liso e os para-barros; teto com a tomada de ar; a traseira com a faixa de LED
(uma tira larga por lado em duas células), para-choque preto, o escape único e grosso, difusor e o aerofólio grande de acento.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import build_hero_gt as H  # noqa: E402
import hero_parts as HP  # noqa: E402
from build_hero_gt import Part, v3, box, extrude, patch_on, strip_on, rounded, project  # noqa: E402

BELT_PAINT_GAPS = (2,)
ROOF_GLASS_GAPS = (0, 2)
ARCH_TRIM = True
EXHAUST = (-0.55, 2.24, 0.32)   # Blender: +x é a esquerda do carro no jogo; o escape do carro de rali fica à DIREITA (x = +0,55 no jogo)
SEAT = (0.0, 0.1, 0.92)
SINGLE_EXHAUST = True

VIEWS = {"tras_alta": ((2.4, 4.8, 2.4), (0, 1.9, 0.9), 55), "frente_alta": ((-2.4, -4.6, 2.0), (0, -1.9, 0.6), 55)}
HEAD_ROUND = dict(lens="headlight", dim="headlight_dim", floor="reflector", top="piano", outer="piano", lip="chrome", dot="headlight")


def rear(tree):
    out = []
    Pp = Part("painel_traseiro")
    patch_on(Pp, tree, [(-0.80, 0.62), (0.80, 0.62), (0.80, 0.92), (0.66, 0.97), (-0.66, 0.97), (-0.80, 0.92)], "back", "piano", h=0.09, off=0.004)
    patch_on(Pp, tree, [(-0.78, 0.38), (0.78, 0.38), (0.78, 0.62), (-0.78, 0.62)], "back", "trim", h=0.1, off=0.004)   # o para-choque preto
    out.append(Pp.finish())
    Pl, Pled = Part("lamp_tail"), Part("led")
    for sd in (1, -1):
        # a faixa de LED alta: uma tira larga por lado, em duas células, e uma fina por baixo
        HP.strip_lamp(Pl, Pled, tree, "back", sd * 0.575, 0.835, 0.235, 0.075, slope=-sd * 0.05, ribs=(0.0,), dots=7, dot_rows=(-0.38, 0.38), ring_w=0.009, bezel=0.016, N=52)
        HP.strip_lamp(Pl, Pled, tree, "back", sd * 0.57, 0.705, 0.20, 0.014, slope=-sd * 0.05, n=5.0, N=36, height=0.026, floor=0.006, bezel=0.012, ring_w=0.005, lip=False)
    out += [Pl.finish(), Pled.finish()]
    Pc = Part("parachoque_tras")
    H.tube(Pc, [v3(-0.74, 2.15, 0.40), v3(0.0, 2.17, 0.40), v3(0.74, 2.15, 0.40)], [0.045, 0.045, 0.045], "trim", seg=12, ratio=1.0, up=(0, 0, 1))
    out.append(Pc.finish())
    out.append(HP.diffuser_part(0.60, 1.93, 2.26, 0.30, 0.38, 8, fin_h=0.07).finish())
    out.append(HP.exhaust_tip("escape_l", -0.55, 2.08, 0.32, 0.09, 0.20, ri=0.072).finish())
    out += wing()
    return out


def wing():
    out = []
    hs = 0.78
    y0, y1 = 1.74, 2.10
    zc0, zc1 = 1.235, 1.30
    out.append(HP.wing_blade("asa", hs * 2, y0, y1, zc0, zc1, 0.95, [(-hs, -0.5, "accent", "accent"), (-0.5, 0.5, "accent", "accent"), (0.5, hs, "accent", "accent")], gurney=(y1, zc1 + 0.012, 0.016, "carbon")).finish())
    out.append(HP.wing_plates("asa_placas", hs, y0 - 0.02, y1 + 0.03, 1.10, 1.43, "accent").finish())
    for sd, nm in ((1, "suporte_l"), (-1, "suporte_r")):
        out.append(HP.strut(nm, sd * 0.50, [(1.99, 0.99), (1.99, 1.08), (1.98, 1.18), (1.96, 1.24)], [0.075, 0.07, 0.065, 0.06], ratio=0.26).finish())
    return out


def front(tree):
    out = []
    Ph = Part("lamp_head")
    for sd in (1, -1):
        # os dois faróis retangulares em fenda, atrás de uma carcaça preta, e o gancho de reboque de acento
        HP.strip_lamp(Ph, Part("_a"), tree, "front", sd * 0.655, 0.69, 0.165, 0.040, mats=HP.HEAD_MATS, n=4.0, N=34, height=0.020, floor=0.006, bezel=0.014, ring_w=0.008, lip=True)
    out.append(Ph.finish())
    Pf = Part("entradas_frente")
    patch_on(Pf, tree, rounded(0, 0.65, 0.78, 0.14, 0.03), "front", "grille", h=0.07, off=0.004)
    for z in (0.62, 0.65, 0.68):
        strip_on(Pf, tree, [(-0.36, z), (0.36, z)], 0.012, "front", "gunmetal", off=0.009, step=0.06)
    out.append(Pf.finish())
    Pled = Part("_mled")
    for sd, nm in ((1, "l"), (-1, "r")):
        Pm = Part(f"farol_milha_{nm}")
        for x in (0.17, 0.44):
            HP.round_lamp(Pm, Pled, tree, "front", sd * x, 0.48, 0.085, 0.07, HEAD_ROUND, seg=16, led=False)
        out.append(Pm.finish())
    Pb = Part("divisor")
    H.tube(Pb, [v3(-0.75, -2.165, 0.36), v3(0.0, -2.18, 0.36), v3(0.75, -2.165, 0.36)], [0.05, 0.05, 0.05], "trim", seg=12, ratio=1.0, up=(0, 0, 1))
    box(Pb, (0.45, -2.2, 0.24), (0.08, 0.08, 0.06), "accent")
    box(Pb, (-0.45, -2.2, 0.24), (0.08, 0.08, 0.06), "accent")
    out.append(Pb.finish())
    Pc = Part("fresta_capo")
    strip_on(Pc, tree, [(-0.62, -0.96), (0.62, -0.96)], 0.006, "top", "trim", off=0.0025, step=0.04)
    for sd in (1, -1):
        strip_on(Pc, tree, [(sd * 0.62, -0.96), (sd * 0.68, -1.5), (sd * 0.72, -1.95)], 0.006, "top", "trim", off=0.0025, step=0.04)
    out.append(Pc.finish())
    return out


def roof():
    """A tomada de ar do teto: caixa arredondada com a boca escura na frente, e a antena curta."""
    P = Part("tomada_teto")
    HP.rbox(P, (0, 0.1, 1.38), (0.30, 0.36, 0.09), "paint", bevel=0.035, seg=2)
    HP.rbox(P, (0, -0.075, 1.385), (0.24, 0.012, 0.05), "grille", bevel=0.004, seg=1)
    return [P.finish()]


def sides(tree, cab_yb):
    out = []
    P = Part("fresta_porta")
    for ax in ("side+", "side-"):
        strip_on(P, tree, [(-0.62, 0.34), (-0.60, 0.62), (-0.58, 0.80)], 0.006, ax, "trim", off=0.003, step=0.04)
        strip_on(P, tree, [(0.62, 0.34), (0.64, 0.62), (0.66, 0.80)], 0.006, ax, "trim", off=0.003, step=0.04)
    out.append(P.finish())
    Pn = Part("painel_numero")
    for ax in ("side+", "side-"):
        patch_on(Pn, tree, rounded(0.2, 0.39, 0.74, 0.20, 0.05), ax, "white", h=0.05, off=0.006)
    out.append(Pn.finish())
    Pl = Part("lamina_acento")
    for ax in ("side+", "side-"):
        strip_on(Pl, tree, [(-0.95, 0.31), (0.0, 0.315), (1.0, 0.32)], 0.025, ax, "trim", off=0.014, step=0.04)
    out.append(Pl.finish())
    Pm = Part("para_barros")
    for a in H.AXLES:
        for sd in (1, -1):
            HP.rbox(Pm, (sd * 0.80, a["z"] + a["r"] + 0.14, 0.22), (0.30, 0.02, 0.26), "under", bevel=0.007, seg=1)
    out.append(Pm.finish())
    for ax, nm in (("side+", "l"), ("side-", "r")):
        Ph = Part(f"macaneta_{nm}")
        patch_on(Ph, tree, rounded(0.30, 0.73, 0.14, 0.04, 0.016), ax, "trim", h=0.05, off=0.004)
        strip_on(Ph, tree, [(0.25, 0.73), (0.35, 0.73)], 0.012, ax, "trim_soft", off=0.0075, step=0.035)
        out.append(Ph.finish())
        out.append(HP.mirror_part(f"retrovisor_{nm}", 1 if nm == "l" else -1, 0.86, -0.62, cab_yb + 0.10).finish())
    out.append(HP.calipers_part(H.AXLES).finish())
    return out


def glints(tree):
    P = Part("reflexo_vidro")
    patch_on(P, tree, [(-0.40, -0.93), (-0.25, -0.93), (0.06, -0.38), (-0.09, -0.38)], "top", "glint", h=0.07, off=0.0035)
    patch_on(P, tree, [(0.05, -0.93), (0.10, -0.93), (0.30, -0.56), (0.25, -0.56)], "top", "glint", h=0.07, off=0.0035)
    patch_on(P, tree, [(0.32, 1.96), (0.42, 1.96), (0.16, 1.55), (0.06, 1.55)], "top", "glint", h=0.07, off=0.0035)
    for ax in ("side+", "side-"):
        patch_on(P, tree, [(-0.60, 1.04), (-0.47, 1.04), (-0.12, 1.36), (-0.25, 1.36)], ax, "glint", h=0.07, off=0.0035)
        patch_on(P, tree, [(-0.24, 1.04), (-0.19, 1.04), (0.0, 1.30), (-0.05, 1.30)], ax, "glint", h=0.07, off=0.0035)
        patch_on(P, tree, [(0.60, 1.04), (0.66, 1.04), (0.90, 1.30), (0.84, 1.30)], ax, "glint", h=0.07, off=0.0035)
    return [P.finish()]


def build(tree):
    cab_yb = H.CAGE["cabin"][1]["yb"]
    return rear(tree) + front(tree) + roof() + sides(tree, cab_yb) + glints(tree)
