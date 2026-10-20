"""Protótipo de endurance HERÓI (Beija-Flor, estilo `prototype`): as peças em cima do casco da gaiola (`hero/prototype-gaiola.json`). Traseira com a faixa de LED (uma tira larga por lado,
dividida em três células), o escape central largo, o difusor de oito aletas e mais, a asa de ponta a ponta em pescoço de cisne com placas grandes e a barbatana de tubarão de acento; frente
com faróis em fenda no bico, entradas e divisor largo; flanco com a entrada atrás da roda dianteira e o painel de número redondo (liso, sem algarismo).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import build_hero_gt as H  # noqa: E402
import hero_parts as HP  # noqa: E402
from build_hero_gt import Part, v3, box, extrude, patch_on, strip_on, rounded  # noqa: E402

BELT_PAINT_GAPS = (2,)
ROOF_GLASS_GAPS = (0,)
EXHAUST = (0.0, 2.26, 0.44)
SEAT = (0.0, -0.1, 0.70)
SINGLE_EXHAUST = True

VIEWS = {"tras_alta": ((2.4, 4.8, 2.2), (0, 2.0, 0.7), 55), "barbatana": ((3.2, 1.2, 1.6), (0, 0.6, 0.8), 55)}


def rear(tree):
    out = []
    Pp = Part("painel_traseiro")
    patch_on(Pp, tree, [(-0.78, 0.405), (0.78, 0.405), (0.78, 0.60), (0.64, 0.68), (-0.64, 0.68), (-0.78, 0.60)], "back", "piano", h=0.09, off=0.004)
    patch_on(Pp, tree, [(-0.80, 0.27), (0.80, 0.27), (0.80, 0.405), (-0.80, 0.405)], "back", "carbon", h=0.1, off=0.004)
    out.append(Pp.finish())
    Pl, Pled = Part("lamp_tail"), Part("led")
    for sd in (1, -1):
        # a faixa de LED: uma tira larga por lado com três células (duas divisórias) e uma fileira de LEDs
        HP.strip_lamp(Pl, Pled, tree, "back", sd * 0.495, 0.598, 0.325, 0.052, slope=-sd * 0.05, ribs=(-0.34, 0.34), dots=9, dot_rows=(-0.35, 0.35), ring_w=0.008, bezel=0.015, N=52)
    out += [Pl.finish(), Pled.finish()]
    out.append(HP.diffuser_part(0.80, 1.96, 2.30, 0.155, 0.265, 12, fin_h=0.095).finish())
    out.append(HP.exhaust_tip("escape_l", 0.0, 2.11, 0.44, 0.085, 0.20).finish())
    out += wing()
    return out


def wing():
    out = []
    hs = 0.92
    y0, y1 = 1.80, 2.20
    zc0, zc1 = 0.94, 1.0
    out.append(HP.wing_blade("asa", hs * 2, y0, y1, zc0, zc1, 0.9, [(-hs, -0.5, "accent", "accent"), (-0.5, 0.5, "accent", "accent"), (0.5, hs, "accent", "accent")], gurney=(y1, zc1 + 0.012, 0.014, "carbon")).finish())
    out.append(HP.wing_plates("asa_placas", hs, y0 - 0.02, y1 + 0.03, 0.84, 1.14, "accent").finish())
    for sd, nm in ((1, "suporte_l"), (-1, "suporte_r")):
        out.append(HP.strut(nm, sd * 0.30, [(2.10, 0.72), (2.14, 0.80), (2.14, 0.89), (2.10, 0.97), (2.02, 1.03), (1.98, 0.97)], [0.032, 0.03, 0.03, 0.028, 0.026, 0.022]).finish())
    return out


def fin():
    """A barbatana de tubarão (acento) do teto à asa: uma lâmina fina com a ponta da frente redonda."""
    P = Part("barbatana")
    prof = [(0.25, 0.99), (0.40, 1.03), (0.80, 1.04), (1.40, 1.035), (1.95, 1.03), (2.00, 1.02), (2.00, 0.74), (1.6, 0.72), (1.2, 0.70), (0.5, 0.80), (0.28, 0.90)]
    loop = [v3(-0.014, y, z) for (y, z) in prof]
    extrude(P, list(reversed(loop)), v3(0.028, 0, 0), "accent")
    return [P.finish()]


def front(tree):
    out = []
    Ph = Part("lamp_head")
    for sd in (1, -1):
        # faróis em fenda no bico: carcaça preta e lente em tira
        HP.strip_lamp(Ph, Part("_a"), tree, "front", sd * 0.60, 0.252, 0.19, 0.020, mats=HP.HEAD_MATS, slope=sd * 0.025, n=4.0, N=30, height=0.018, floor=0.006, bezel=0.013, ring_w=0.007, lip=True)
    out.append(Ph.finish())
    Pf = Part("entradas_frente")
    for (x0, x1, z0, z1, bars) in ((-0.30, 0.30, 0.14, 0.24, 2), (0.50, 0.84, 0.14, 0.19, 2), (-0.84, -0.50, 0.14, 0.19, 2)):
        patch_on(Pf, tree, rounded((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 0.02), "front", "grille", h=0.07, off=0.004)
        for b in range(bars):
            zb = z0 + (z1 - z0) * (b + 1) / (bars + 1)
            strip_on(Pf, tree, [(x0 + 0.02, zb), (x1 - 0.02, zb)], 0.010, "front", "gunmetal", off=0.009, step=0.06)
    out.append(Pf.finish())
    Ps = Part("divisor")
    loop = [v3(-0.91, -2.05, 0.10), v3(-0.84, -2.26, 0.10), v3(0.84, -2.26, 0.10), v3(0.91, -2.05, 0.10)]
    extrude(Ps, loop, v3(0, 0, 0.03), "carbon")
    box(Ps, (0, -2.262, 0.115), (1.5, 0.008, 0.012), "metal")
    out.append(Ps.finish())
    return out


def sides(tree, cab_yb):
    out = []
    P = Part("fresta_porta")
    for ax in ("side+", "side-"):
        strip_on(P, tree, [(-0.62, 0.20), (-0.60, 0.40), (-0.58, 0.50)], 0.006, ax, "trim", off=0.003, step=0.04)
        strip_on(P, tree, [(0.30, 0.20), (0.32, 0.40), (0.33, 0.50)], 0.006, ax, "trim", off=0.003, step=0.04)
    out.append(P.finish())
    Pn = Part("painel_numero")
    for ax in ("side+", "side-"):
        disc = [(0.2 + math.cos(2 * math.pi * k / 24) * 0.17, 0.25 + math.sin(2 * math.pi * k / 24) * 0.078) for k in range(24)]
        patch_on(Pn, tree, disc, ax, "white", h=0.05, off=0.006)
    out.append(Pn.finish())
    for ax, nm in (("side+", "l"), ("side-", "r")):
        Pa = Part(f"entrada_ar_{nm}")
        patch_on(Pa, tree, [(-0.95, 0.17), (-0.35, 0.17), (-0.35, 0.29), (-0.9, 0.28)], ax, "grille", h=0.05, off=0.005)
        for y0 in (-0.84, -0.70, -0.56, -0.44):
            strip_on(Pa, tree, [(y0, 0.185), (y0 + 0.03, 0.275)], 0.014, ax, "carbon", off=0.011, step=0.04)
        out.append(Pa.finish())
        out.append(HP.mirror_part(f"retrovisor_{nm}", 1 if nm == "l" else -1, 0.74, -0.70, cab_yb + 0.10, size=(0.05, 0.08, 0.045)).finish())
    Pb = Part("lamina_acento")
    for ax in ("side+", "side-"):
        strip_on(Pb, tree, [(-1.0, 0.13), (0.0, 0.135), (1.0, 0.14)], 0.03, ax, "accent", off=0.008, step=0.04)
    out.append(Pb.finish())
    out.append(HP.calipers_part(H.AXLES).finish())
    return out


def top(tree):
    out = []
    Pv = Part("venezianas")
    for sd in (1, -1):
        poly = [(sd * 0.36, 1.50), (sd * 0.66, 1.50), (sd * 0.66, 1.92), (sd * 0.36, 1.92)]
        if sd < 0:
            poly = list(reversed(poly))
        patch_on(Pv, tree, poly, "top", "trim", h=0.05, off=0.005)
        for z in (1.56, 1.64, 1.72, 1.80, 1.88):
            strip_on(Pv, tree, [(sd * 0.37, z), (sd * 0.65, z)], 0.024, "top", "carbon", off=0.017, step=0.04)
    out.append(Pv.finish())
    return out


def glints(tree):
    P = Part("reflexo_vidro")
    patch_on(P, tree, [(-0.28, -0.96), (-0.17, -0.96), (0.06, -0.50), (-0.05, -0.50)], "top", "glint", h=0.06, off=0.0035)
    patch_on(P, tree, [(0.05, -0.96), (0.09, -0.96), (0.24, -0.62), (0.20, -0.62)], "top", "glint", h=0.06, off=0.0035)
    for ax in ("side+", "side-"):
        patch_on(P, tree, [(-0.60, 0.66), (-0.50, 0.66), (-0.26, 0.92), (-0.36, 0.92)], ax, "glint", h=0.06, off=0.0035)
        patch_on(P, tree, [(-0.40, 0.66), (-0.36, 0.66), (-0.20, 0.88), (-0.24, 0.88)], ax, "glint", h=0.06, off=0.0035)
    return [P.finish()]


def build(tree):
    cab_yb = H.CAGE["cabin"][1]["yb"]
    return rear(tree) + fin() + front(tree) + sides(tree, cab_yb) + top(tree) + glints(tree)
