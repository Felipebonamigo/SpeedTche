"""Muscle car HERÓI (Trovão V12, estilo `muscle`): as peças em cima do casco da gaiola (`hero/muscle-gaiola.json`). Capô comprido com a tomada de ar elevada (a boca escura na frente), frente alta e
chata com a grade e dois faróis redondos cromados embutidos, para-choques cromados finos; a traseira com a faixa de LED (uma tira larga por lado em três células) e o painel escuro no meio, a placa
lisa, para-choque cromado, escapes gêmeos largos, difusor e a asa de postes; no flanco, a entrada de ar escura atrás da porta com as lâminas.
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
EXHAUST = (0.52, 2.30, 0.27)
SEAT = (0.0, 0.1, 0.84)
SINGLE_EXHAUST = False

VIEWS = {"tras_alta": ((2.4, 4.8, 2.2), (0, 2.0, 0.8), 55), "capo": ((-1.4, -3.6, 2.2), (0, -1.4, 0.8), 50)}
HEAD_ROUND = dict(lens="headlight", dim="headlight_dim", floor="reflector", top="chrome", outer="chrome", lip="chrome", dot="headlight")


def rear(tree):
    out = []
    Pp = Part("painel_traseiro")
    patch_on(Pp, tree, [(-0.78, 0.60), (0.78, 0.60), (0.78, 0.86), (0.66, 0.90), (-0.66, 0.90), (-0.78, 0.86)], "back", "piano", h=0.09, off=0.004)
    out.append(Pp.finish())
    Pl, Pled = Part("lamp_tail"), Part("led")
    for sd in (1, -1):
        # a faixa de LED: uma tira larga por lado com três células (duas divisórias) e uma fileira de LEDs
        HP.strip_lamp(Pl, Pled, tree, "back", sd * 0.575, 0.745, 0.265, 0.075, slope=-sd * 0.06, ribs=(-0.34, 0.34), dots=8, dot_rows=(-0.38, 0.38), ring_w=0.009, bezel=0.016, N=52)
    out += [Pl.finish(), Pled.finish()]
    Pa = Part("placa")
    patch_on(Pa, tree, rounded(0, 0.545, 0.36, 0.17, 0.02), "back", "trim", h=0.2, off=0.006)
    patch_on(Pa, tree, rounded(0, 0.545, 0.31, 0.125, 0.012), "back", "plate", h=0.2, off=0.0115)
    out.append(Pa.finish())
    Pc = Part("parachoque_tras")
    H.tube(Pc, [v3(-0.80, 2.215, 0.40), v3(0.0, 2.235, 0.40), v3(0.80, 2.215, 0.40)], [0.04, 0.04, 0.04], "chrome", seg=12, ratio=1.0, up=(0, 0, 1))
    out.append(Pc.finish())
    out.append(HP.diffuser_part(0.65, 1.96, 2.29, 0.20, 0.30, 9, fin_h=0.075).finish())
    for sd, nm in ((1, "escape_l"), (-1, "escape_r")):
        out.append(HP.exhaust_tip(nm, sd * 0.52, 2.12, 0.27, 0.085, 0.19, ri=0.068).finish())
    out += wing()
    return out


def wing():
    out = []
    hs = 0.78
    y0, y1 = 1.86, 2.22
    zc0, zc1 = 1.10, 1.14
    sa = (0.08, 0.30)
    segs = [(-hs, -sa[1], "paint", "paint"), (-sa[1], -sa[0], "stripe_a", "paint"), (-sa[0], sa[0], "paint", "paint"), (sa[0], sa[1], "stripe_a", "paint"), (sa[1], hs, "paint", "paint")]
    out.append(HP.wing_blade("asa", hs * 2, y0, y1, zc0, zc1, 0.85, segs, gurney=(y1, zc1 + 0.012, 0.014, "carbon")).finish())
    out.append(HP.wing_plates("asa_placas", hs, y0 - 0.02, y1 + 0.03, 1.03, 1.18, "paint").finish())
    for sd, nm in ((1, "suporte_l"), (-1, "suporte_r")):
        out.append(HP.strut(nm, sd * 0.55, [(2.07, 0.91), (2.07, 1.00), (2.06, 1.07), (2.05, 1.10)], [0.075, 0.07, 0.065, 0.06], ratio=0.26).finish())
    return out


def front(tree, hood_y):
    out = []
    Pg = Part("entradas_frente")
    # a grade: painel escuro de ponta a ponta e as lamelas cromadas no meio
    patch_on(Pg, tree, rounded(0, 0.53, 1.30, 0.26, 0.04), "front", "grille", h=0.07, off=0.004)
    for z in (0.46, 0.53, 0.60):
        strip_on(Pg, tree, [(-0.20, z), (0.20, z)], 0.024, "front", "chrome", off=0.011, step=0.05)
    out.append(Pg.finish())
    Ps = Part("lamp_head")
    Pled = Part("_hled")
    for sd, nm in ((1, "l"), (-1, "r")):
        Pr = Part(f"farol_redondo_{nm}")
        HP.round_lamp(Pr, Pled, tree, "front", sd * 0.64, 0.54, 0.14, 0.115, HEAD_ROUND, seg=20, led=False)
        out.append(Pr.finish())
        HP.strip_lamp(Ps, Pled, tree, "front", sd * 0.40, 0.36, 0.10, 0.012, mats=HP.HEAD_MATS, n=5.0, N=22, height=0.010, floor=0.004, bezel=0.006, ring_w=0.003, lip=False)
    out.append(Ps.finish())
    Pb = Part("divisor")
    H.tube(Pb, [v3(-0.86, -2.225, 0.30), v3(0.0, -2.24, 0.30), v3(0.86, -2.225, 0.30)], [0.038, 0.038, 0.038], "chrome", seg=12, ratio=1.0, up=(0, 0, 1))
    out.append(Pb.finish())
    # a tomada de ar elevada do capô, toda arredondada, com a boca escura na frente
    Ph = Part("tomada_capo")
    HP.rbox(Ph, (0, -1.06, hood_y + 0.075), (0.40, 0.72, 0.15), "paint", bevel=0.05, seg=2)
    HP.rbox(Ph, (0, -1.418, hood_y + 0.075), (0.30, 0.012, 0.08), "grille", bevel=0.004, seg=1)
    for k in range(3):
        HP.rbox(Ph, (0, -1.42, hood_y + 0.052 + k * 0.026), (0.28, 0.008, 0.006), "chrome", bevel=0.002, seg=1)
    out.append(Ph.finish())
    Pc = Part("fresta_capo")
    strip_on(Pc, tree, [(-0.62, -0.74), (0.62, -0.74)], 0.006, "top", "trim", off=0.0025, step=0.04)
    for sd in (1, -1):
        strip_on(Pc, tree, [(sd * 0.62, -0.74), (sd * 0.66, -1.3), (sd * 0.70, -1.9)], 0.006, "top", "trim", off=0.0025, step=0.04)
    out.append(Pc.finish())
    return out


def sides(tree, cab_yb):
    out = []
    P = Part("fresta_porta")
    for ax in ("side+", "side-"):
        strip_on(P, tree, [(-0.55, 0.30), (-0.54, 0.62), (-0.53, 0.76)], 0.006, ax, "trim", off=0.003, step=0.04)
        strip_on(P, tree, [(0.38, 0.30), (0.39, 0.62), (0.40, 0.76)], 0.006, ax, "trim", off=0.003, step=0.04)
    out.append(P.finish())
    for ax, nm in (("side+", "l"), ("side-", "r")):
        Pa = Part(f"entrada_ar_{nm}")
        patch_on(Pa, tree, [(0.52, 0.36), (1.0, 0.36), (1.0, 0.50), (0.52, 0.50)], ax, "grille", h=0.05, off=0.005)
        for y0 in (0.60, 0.72, 0.84, 0.96):
            strip_on(Pa, tree, [(y0, 0.37), (y0, 0.49)], 0.016, ax, "paint", off=0.012, step=0.04)
        out.append(Pa.finish())
        Ph = Part(f"macaneta_{nm}")
        patch_on(Ph, tree, rounded(0.14, 0.66, 0.15, 0.042, 0.017), ax, "trim", h=0.05, off=0.004)
        strip_on(Ph, tree, [(0.085, 0.66), (0.195, 0.66)], 0.012, ax, "chrome", off=0.0075, step=0.035)
        out.append(Ph.finish())
        out.append(HP.mirror_part(f"retrovisor_{nm}", 1 if nm == "l" else -1, 0.86, -0.50, cab_yb + 0.10, shell_mat="chrome").finish())
    out.append(HP.calipers_part(H.AXLES).finish())
    return out


def glints(tree):
    P = Part("reflexo_vidro")
    patch_on(P, tree, [(-0.38, -0.72), (-0.24, -0.72), (0.06, -0.30), (-0.08, -0.30)], "top", "glint", h=0.07, off=0.0035)
    patch_on(P, tree, [(0.04, -0.72), (0.09, -0.72), (0.28, -0.42), (0.23, -0.42)], "top", "glint", h=0.07, off=0.0035)
    patch_on(P, tree, [(0.30, 1.06), (0.40, 1.06), (0.14, 1.52), (0.04, 1.52)], "top", "glint", h=0.07, off=0.0035)
    patch_on(P, tree, [(-0.04, 1.06), (0.0, 1.06), (-0.16, 1.40), (-0.20, 1.40)], "top", "glint", h=0.07, off=0.0035)
    for ax in ("side+", "side-"):
        patch_on(P, tree, [(-0.44, 0.88), (-0.32, 0.88), (-0.06, 1.18), (-0.18, 1.18)], ax, "glint", h=0.07, off=0.0035)
        patch_on(P, tree, [(-0.18, 0.88), (-0.135, 0.88), (0.02, 1.12), (-0.025, 1.12)], ax, "glint", h=0.07, off=0.0035)
        patch_on(P, tree, [(0.40, 0.88), (0.46, 0.88), (0.56, 1.10), (0.50, 1.10)], ax, "glint", h=0.07, off=0.0035)
    return [P.finish()]


def build(tree):
    cab_yb = H.CAGE["cabin"][1]["yb"]
    r = project(tree, 0.0, -1.06, "top")
    return rear(tree) + front(tree, r[0].z) + sides(tree, cab_yb) + glints(tree)
