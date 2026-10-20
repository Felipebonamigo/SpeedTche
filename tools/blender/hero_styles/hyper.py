"""Hipercarro HERÓI (Pororoca V10, estilo `hyper`): as peças em cima do casco da gaiola (`hero/hyper-gaiola.json`). Traseira-vitrine com DUAS TIRAS de LED largas, colmeia no meio entre os dois
escapes centrais, difusor de aletas e a asa em pescoço de cisne na cor de detalhe; frente com faróis em fenda; flanco com a entrada de ar enorme atrás da porta e a lâmina de acento na saia.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import build_hero_gt as H  # noqa: E402
import hero_parts as HP  # noqa: E402
from build_hero_gt import Part, v3, box, extrude, patch_on, strip_on, hex_cells, rounded, project, frame, lathe  # noqa: E402

BELT_PAINT_GAPS = (2,)
ROOF_GLASS_GAPS = (0,)           # só o para-brisa é vidro: o teto e a tampa do motor são pintados
EXHAUST = (0.13, 2.27, 0.46)     # (x, y, z) do Blender = o escape do estilo de sempre (x 0,13, altura 0,46, z 2,27)
SEAT = (0.0, 0.1, 0.78)
SINGLE_EXHAUST = False

VIEWS = {"asa": ((3.6, 5.6, 1.9), (0, 2.0, 0.8), 55), "frente_fenda": ((-1.8, -4.4, 0.7), (0, -2.1, 0.3), 55)}


def rear(tree):
    out = []
    Pp = Part("painel_traseiro")
    patch_on(Pp, tree, [(-0.79, 0.395), (0.79, 0.395), (0.79, 0.69), (0.64, 0.752), (-0.64, 0.752), (-0.79, 0.69)], "back", "piano", h=0.09, off=0.004)
    patch_on(Pp, tree, [(-0.79, 0.30), (0.79, 0.30), (0.79, 0.395), (-0.79, 0.395)], "back", "carbon", h=0.1, off=0.004)  # saia de carbono sob o painel
    out.append(Pp.finish())
    Pl, Pled = Part("lamp_tail"), Part("led")
    for sd in (1, -1):
        # duas tiras por lado: a larga, inclinada para cima na ponta, e uma fina por baixo (a assinatura de LED do HC2)
        HP.strip_lamp(Pl, Pled, tree, "back", sd * 0.525, 0.662, 0.245, 0.060, slope=-sd * 0.10, ribs=(-0.52, 0.0, 0.52), dots=8, dot_rows=(-0.4, 0.4), ring_w=0.008, bezel=0.016)
        HP.strip_lamp(Pl, Pled, tree, "back", sd * 0.50, 0.525, 0.205, 0.016, slope=-sd * 0.10, n=5.0, N=40, height=0.026, floor=0.006, bezel=0.012, ring_w=0.006, lip=False)
    out += [Pl.finish(), Pled.finish()]
    # colmeia entre as tiras, sobre os escapes
    Pg = Part("grade_colmeia")
    patch_on(Pg, tree, rounded(0, 0.635, 0.40, 0.17, 0.025), "back", "under", h=0.08, off=0.006)
    hex_cells(Pg, tree, 0.0, 0.635, 0.37, 0.15, 0.0225, "gunmetal", "back", lift=0.011)
    out.append(Pg.finish())
    out.append(HP.diffuser_part(0.75, 1.95, 2.30, 0.175, 0.285, 11).finish())
    for sd, nm in ((1, "escape_l"), (-1, "escape_r")):
        out.append(HP.exhaust_tip(nm, sd * 0.13, 2.12, 0.46, 0.075, 0.19).finish())
    out += wing()
    return out


def wing():
    out = []
    hs = 0.88
    y0, y1 = 1.78, 2.18
    zc0, zc1 = 1.075, 1.135
    stripe = (0.08, 0.34)
    blade = HP.wing_blade("asa", hs * 2, y0, y1, zc0, zc1, 0.85, [(-hs, -0.5, "accent", "accent"), (-0.5, 0.5, "accent", "accent"), (0.5, hs, "accent", "accent")], pitch=0.0, gurney=(y1, zc1 + 0.012, 0.014, "carbon"))
    out.append(blade.finish())
    out.append(HP.wing_plates("asa_placas", hs, y0 - 0.02, y1 + 0.03, 0.97, 1.20, "accent").finish())
    for sd, nm in ((1, "suporte_l"), (-1, "suporte_r")):
        out.append(HP.strut(nm, sd * 0.42, [(2.13, 0.79), (2.16, 0.90), (2.155, 1.01), (2.11, 1.11), (2.03, 1.16), (1.98, 1.095)], [0.034, 0.032, 0.03, 0.028, 0.026, 0.022]).finish())
    return out


def front(tree):
    out = []
    Ph = Part("lamp_head")
    for sd in (1, -1):
        # carcaça preta em fenda e, dentro dela, a lente em tira (luz baixa) e a luz diurna fina por cima
        HP.strip_lamp(Ph, Part("_x"), tree, "front", sd * 0.62, 0.285, 0.165, 0.021, mats=HP.HEAD_MATS, slope=sd * 0.0, n=4.0, N=28, height=0.018, floor=0.006, bezel=0.014, ring_w=0.008, lip=True)
        HP.strip_lamp(Ph, Part("_y"), tree, "front", sd * 0.60, 0.332, 0.15, 0.0065, mats=HP.HEAD_MATS, n=5.0, N=24, height=0.012, floor=0.004, bezel=0.007, ring_w=0.003, lip=False)
    out.append(Ph.finish())
    Pf = Part("entradas_frente")
    for (x0, x1, z0, z1, bars) in ((-0.30, 0.30, 0.175, 0.265, 2), (0.47, 0.80, 0.175, 0.23, 2), (-0.80, -0.47, 0.175, 0.23, 2)):
        patch_on(Pf, tree, rounded((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 0.02), "front", "grille", h=0.07, off=0.004)
        for b in range(bars):
            zb = z0 + (z1 - z0) * (b + 1) / (bars + 1)
            strip_on(Pf, tree, [(x0 + 0.02, zb), (x1 - 0.02, zb)], 0.011, "front", "gunmetal", off=0.009, step=0.06)
    out.append(Pf.finish())
    Ps = Part("divisor")
    loop = [v3(-0.84, -2.07, 0.115), v3(-0.78, -2.25, 0.115), v3(0.78, -2.25, 0.115), v3(0.84, -2.07, 0.115)]
    extrude(Ps, loop, v3(0, 0, 0.03), "carbon")
    box(Ps, (0, -2.255, 0.13), (1.40, 0.008, 0.012), "metal")
    out.append(Ps.finish())
    # tomadas de ar no capô por fora das faixas, com duas lâminas
    Pn = Part("naca")
    for sd in (1, -1):
        poly = [(sd * 0.42, -1.72), (sd * 0.60, -1.76), (sd * 0.62, -1.50), (sd * 0.44, -1.48)]
        if sd < 0:
            poly = list(reversed(poly))
        patch_on(Pn, tree, poly, "top", "trim", h=0.05, off=0.004)
        for f in (0.35, 0.68):
            strip_on(Pn, tree, [(sd * 0.445, -1.73 + 0.25 * f), (sd * 0.60, -1.74 + 0.25 * f)], 0.010, "top", "paint", off=0.012, step=0.04)
    out.append(Pn.finish())
    return out


def sides(tree, cab_yb):
    out = []
    P = Part("fresta_porta")
    for ax in ("side+", "side-"):
        strip_on(P, tree, [(-0.72, 0.25), (-0.70, 0.46), (-0.68, 0.56)], 0.006, ax, "trim", off=0.003, step=0.04)
        strip_on(P, tree, [(0.02, 0.26), (0.04, 0.47), (0.05, 0.56)], 0.006, ax, "trim", off=0.003, step=0.04)
    out.append(P.finish())
    for ax, nm in (("side+", "l"), ("side-", "r")):
        Pa = Part(f"entrada_ar_{nm}")
        patch_on(Pa, tree, [(0.07, 0.27), (0.92, 0.25), (0.92, 0.44), (0.30, 0.42)], ax, "grille", h=0.06, off=0.005)
        for y0 in (0.40, 0.58, 0.76):  # lâminas de carbono inclinadas, como no estilo de sempre
            strip_on(Pa, tree, [(y0, 0.275), (y0 + 0.07, 0.425)], 0.020, ax, "carbon", off=0.014, step=0.04)
        out.append(Pa.finish())
        Ph = Part(f"macaneta_{nm}")
        patch_on(Ph, tree, rounded(-0.28, 0.40, 0.15, 0.04, 0.016), ax, "trim", h=0.05, off=0.004)
        strip_on(Ph, tree, [(-0.33, 0.40), (-0.23, 0.40)], 0.012, ax, "trim_soft", off=0.0075, step=0.035)
        out.append(Ph.finish())
        out.append(HP.mirror_part(f"retrovisor_{nm}", 1 if nm == "l" else -1, 0.80, -0.72, cab_yb + 0.12).finish())
    Pb = Part("lamina_acento")
    for ax in ("side+", "side-"):
        strip_on(Pb, tree, [(-0.90, 0.205), (0.0, 0.21), (0.90, 0.215)], 0.035, ax, "accent", off=0.008, step=0.04)
    out.append(Pb.finish())
    out.append(HP.calipers_part(H.AXLES).finish())
    return out


def top(tree):
    out = []
    Pv = Part("venezianas")
    for sd in (1, -1):
        poly = [(sd * 0.40, 1.50), (sd * 0.66, 1.50), (sd * 0.66, 1.92), (sd * 0.40, 1.92)]
        if sd < 0:
            poly = list(reversed(poly))
        patch_on(Pv, tree, poly, "top", "trim", h=0.05, off=0.005)
        for z in (1.56, 1.64, 1.72, 1.80, 1.88):
            strip_on(Pv, tree, [(sd * 0.41, z), (sd * 0.65, z)], 0.024, "top", "carbon", off=0.017, step=0.04)
    out.append(Pv.finish())
    return out


def glints(tree):
    P = Part("reflexo_vidro")
    # para-brisa (por cima): duas faixas diagonais; janelas laterais: duas cada
    patch_on(P, tree, [(-0.36, -0.84), (-0.22, -0.84), (0.08, -0.40), (-0.06, -0.40)], "top", "glint", h=0.07, off=0.0035)
    patch_on(P, tree, [(0.06, -0.84), (0.11, -0.84), (0.30, -0.52), (0.25, -0.52)], "top", "glint", h=0.07, off=0.0035)
    for ax in ("side+", "side-"):
        patch_on(P, tree, [(-0.50, 0.74), (-0.38, 0.74), (-0.12, 0.98), (-0.24, 0.98)], ax, "glint", h=0.07, off=0.0035)
        patch_on(P, tree, [(-0.28, 0.74), (-0.24, 0.74), (-0.08, 0.92), (-0.12, 0.92)], ax, "glint", h=0.07, off=0.0035)
    return [P.finish()]


def build(tree):
    cab_yb = H.CAGE["cabin"][1]["yb"]
    return rear(tree) + front(tree) + sides(tree, cab_yb) + top(tree) + glints(tree)
