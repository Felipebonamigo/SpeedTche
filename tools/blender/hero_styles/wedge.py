"""Cunha HERÓI (Iara Turbo, estilo `wedge`): as peças em cima do casco da gaiola (`hero/wedge-gaiola.json`). A traseira é a grade-lanterna de ponta a ponta (uma tira de LED larga por lado,
atrás de três lâminas pretas), com placa lisa, difusor, dois escapes e a asa de postes; a frente tem os faróis ESCAMOTEÁVEIS (a tampa rente ao capô; à noite sobe 11 cm: material com "popup" no
nome), luzes de posição e tomada preta; o flanco, a entrada de ar com frisos na cor do carro; a tampa de trás, as venezianas pretas.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import build_hero_gt as H  # noqa: E402
import hero_parts as HP  # noqa: E402
from build_hero_gt import Part, Vector, v3, box, extrude, patch_on, strip_on, rounded, project, frame  # noqa: E402

BELT_PAINT_GAPS = (2,)
ROOF_GLASS_GAPS = (0,)
EXHAUST = (0.42, 2.28, 0.26)
SEAT = (0.0, 0.1, 0.80)
SINGLE_EXHAUST = False

VIEWS = {"popup": ((-3.0, -4.6, 1.5), (0, -1.8, 0.5), 55), "tras_alta": ((2.4, 4.8, 2.2), (0, 2.0, 0.7), 55)}


def rear(tree):
    out = []
    Pp = Part("painel_traseiro")
    patch_on(Pp, tree, [(-0.76, 0.44), (0.76, 0.44), (0.76, 0.78), (0.6, 0.82), (-0.6, 0.82), (-0.76, 0.78)], "back", "piano", h=0.09, off=0.004)
    patch_on(Pp, tree, [(-0.76, 0.30), (0.76, 0.30), (0.76, 0.44), (-0.76, 0.44)], "back", "under", h=0.1, off=0.004)   # o painel baixo, escuro
    out.append(Pp.finish())
    Pl, Pled = Part("lamp_tail"), Part("led")
    for sd in (1, -1):
        # a grade-lanterna: uma tira por lado, de ponta a ponta, com três lâminas pretas por cima e duas fileiras de LEDs entre elas
        HP.strip_lamp(Pl, Pled, tree, "back", sd * 0.475, 0.62, 0.365, 0.083, slope=-sd * 0.05, ribs=(-0.5, 0.0, 0.5), dots=11, dot_rows=(-0.27, 0.27), ring_w=0.009, bezel=0.016, hbars=(-0.5, 0.0, 0.5), hbar_w=0.016, N=56)
    out += [Pl.finish(), Pled.finish()]
    # placa lisa (sem texto), em moldura
    Pa = Part("placa")
    patch_on(Pa, tree, rounded(0, 0.385, 0.38, 0.150, 0.02), "back", "trim", h=0.2, off=0.006)
    patch_on(Pa, tree, rounded(0, 0.385, 0.33, 0.110, 0.012), "back", "plate", h=0.2, off=0.0115)
    out.append(Pa.finish())
    out.append(HP.diffuser_part(0.70, 1.96, 2.30, 0.18, 0.285, 10).finish())
    for sd, nm in ((1, "escape_l"), (-1, "escape_r")):
        out.append(HP.exhaust_tip(nm, sd * 0.42, 2.12, 0.26, 0.075, 0.19).finish())
    out += wing()
    return out


def wing():
    out = []
    hs = 0.81
    y0, y1 = 1.81, 2.15
    zc0, zc1 = 1.045, 1.075
    sa = (0.08, 0.34)
    segs = [(-hs, -sa[1], "paint", "paint"), (-sa[1], -sa[0], "stripe_a", "paint"), (-sa[0], sa[0], "paint", "paint"), (sa[0], sa[1], "stripe_a", "paint"), (sa[1], hs, "paint", "paint")]
    out.append(HP.wing_blade("asa", hs * 2, y0, y1, zc0, zc1, 0.85, segs, gurney=(y1, zc1 + 0.012, 0.014, "carbon")).finish())
    out.append(HP.wing_plates("asa_placas", hs, y0 - 0.02, y1 + 0.03, 0.96, 1.115, "paint").finish())
    for sd, nm in ((1, "suporte_l"), (-1, "suporte_r")):
        out.append(HP.strut(nm, sd * 0.58, [(2.03, 0.84), (2.03, 0.93), (2.025, 1.01), (2.02, 1.045)], [0.075, 0.07, 0.065, 0.06], ratio=0.26).finish())
    return out


def popups(tree):
    """Os faróis escamoteáveis: caixa rente ao capô, 12 cm de fundo; a tampa de cima é um remendo conforme ao capô (pintura), a frente leva a lente (projetor em leque dentro de um aro), o resto,
    paredes pintadas e a junta preta atrás. Tudo "popup" no nome do material: sobe com o farol à noite."""
    PX, PY = (0.33, 0.60), (-1.84, -1.60)
    DEPTH, LIFT = 0.12, 0.003
    P = Part("farol_popup")

    def hood(x, y):
        r = project(tree, x, y, "top")
        if r is None:
            raise RuntimeError("farol escamoteável fora do capô")
        return r[0].z + LIFT
    N = 6
    for sd in (1, -1):
        xa, xb = sorted([sd * PX[0], sd * PX[1]])
        poly = [(xa, PY[0]), (xb, PY[0]), (xb, PY[1]), (xa, PY[1])]
        patch_on(P, tree, poly if sd > 0 else poly, "top", "paint_popup", h=0.06, off=LIFT)   # a tampa, rente ao capô
        xs = [xa + (xb - xa) * i / N for i in range(N + 1)]
        ys = [PY[0] + (PY[1] - PY[0]) * i / N for i in range(N + 1)]
        # parede da frente (y = PY[0]) e a de trás (PY[1], junta preta): do capô para baixo
        for i in range(N):
            for (yy, mat, want) in ((PY[0], "paint_popup", (0, -1, 0)), (PY[1], "trim_popup", (0, 1, 0))):
                t0, t1 = hood(xs[i], yy), hood(xs[i + 1], yy)
                HP.oriented(P, [v3(xs[i], yy, t0), v3(xs[i + 1], yy, t1), v3(xs[i + 1], yy, t1 - DEPTH), v3(xs[i], yy, t0 - DEPTH)], mat, want)
        for j in range(N):  # paredes laterais (x = xa, xb)
            for (xx, want) in ((xa, (-1, 0, 0)), (xb, (1, 0, 0))):
                t0, t1 = hood(xx, ys[j]), hood(xx, ys[j + 1])
                HP.oriented(P, [v3(xx, ys[j], t0), v3(xx, ys[j + 1], t1), v3(xx, ys[j + 1], t1 - DEPTH), v3(xx, ys[j], t0 - DEPTH)], "paint_popup", want)
        # o fundo, escuro
        HP.oriented(P, [v3(xa, PY[0], hood(xa, PY[0]) - DEPTH), v3(xb, PY[0], hood(xb, PY[0]) - DEPTH), v3(xb, PY[1], hood(xb, PY[1]) - DEPTH), v3(xa, PY[1], hood(xa, PY[1]) - DEPTH)], "trim_popup", (0, 0, -1))
        # a lente na parede da frente: aro escuro, coroa apagada e o leque aceso
        xc = (xa + xb) / 2
        zc = hood(xc, PY[0]) - DEPTH / 2
        yf = PY[0] - 0.003

        def ring(a, b, dy):
            pts = []
            for k in range(28):
                t = 2 * math.pi * k / 28
                pts.append(v3(xc + a * HP.sgn(math.cos(t)) * abs(math.cos(t)) ** 0.5, yf - dy, zc + b * HP.sgn(math.sin(t)) * abs(math.sin(t)) ** 0.5))
            return pts
        HP.band(P, ring(0.125, 0.049, 0.0), ring(0.108, 0.034, 0.004), "trim_popup", lambda _c: (0, -1, 0))
        dim_i = ring(0.092, 0.026, 0.006)
        HP.band(P, ring(0.108, 0.034, 0.004), dim_i, "headlight_dim_popup", lambda _c: (0, -1, 0))
        HP.fan(P, dim_i, v3(xc, yf - 0.009, zc), "headlight_popup", (0, -1, 0))
    return [P.finish()]


def front(tree):
    out = []
    Ph = Part("lamp_head")
    for sd in (1, -1):
        # luzes de posição no para-choque: pisca âmbar por fora, luz baixa por dentro (tiras em fenda), as duas acesas como no estilo de sempre
        HP.strip_lamp(Ph, Part("_a"), tree, "front", sd * 0.60, 0.30, 0.125, 0.026, mats=dict(HP.HEAD_MATS, lens="headlight_amber", dim="headlight_dim", floor="trim", wall="piano"), n=4.0, N=28, height=0.016, floor=0.005, bezel=0.012, ring_w=0.006, lip=False)
        HP.strip_lamp(Ph, Part("_b"), tree, "front", sd * 0.325, 0.30, 0.10, 0.026, mats=HP.HEAD_MATS, n=4.0, N=28, height=0.016, floor=0.005, bezel=0.012, ring_w=0.006, lip=True)
    out.append(Ph.finish())
    Pf = Part("entradas_frente")
    patch_on(Pf, tree, rounded(0, 0.30, 0.34, 0.075, 0.02), "front", "grille", h=0.06, off=0.004)
    for b in range(2):
        strip_on(Pf, tree, [(-0.15, 0.285 + 0.03 * b), (0.15, 0.285 + 0.03 * b)], 0.010, "front", "gunmetal", off=0.009, step=0.06)
    out.append(Pf.finish())
    Ps = Part("divisor")
    loop = [v3(-0.78, -2.05, 0.15), v3(-0.72, -2.25, 0.15), v3(0.72, -2.25, 0.15), v3(0.78, -2.05, 0.15)]
    extrude(Ps, loop, v3(0, 0, 0.028), "carbon")
    out.append(Ps.finish())
    # a junta atrás dos faróis
    Pc = Part("fresta_capo")
    for sd in (1, -1):
        strip_on(Pc, tree, [(sd * 0.31, -1.585), (sd * 0.62, -1.585)], 0.006, "top", "trim", off=0.0025, step=0.04)
    out.append(Pc.finish())
    return out


def sides(tree, cab_yb):
    out = []
    P = Part("fresta_porta")
    for ax in ("side+", "side-"):
        strip_on(P, tree, [(-0.62, 0.22), (-0.60, 0.50), (-0.58, 0.60)], 0.006, ax, "trim", off=0.003, step=0.04)
        strip_on(P, tree, [(0.06, 0.22), (0.08, 0.50), (0.09, 0.60)], 0.006, ax, "trim", off=0.003, step=0.04)
    out.append(P.finish())
    for ax, nm in (("side+", "l"), ("side-", "r")):
        Pa = Part(f"entrada_ar_{nm}")
        patch_on(Pa, tree, [(0.10, 0.24), (0.95, 0.24), (0.95, 0.47), (0.10, 0.43)], ax, "trim", h=0.06, off=0.005)
        for i in range(4):  # frisos na cor do carro, como no estilo de sempre
            y = 0.28 + i * 0.048
            strip_on(Pa, tree, [(0.08, y), (0.97, y + 0.008)], 0.020, ax, "paint", off=0.016, step=0.05)
        out.append(Pa.finish())
        Ph = Part(f"macaneta_{nm}")
        patch_on(Ph, tree, rounded(-0.30, 0.50, 0.15, 0.04, 0.016), ax, "trim", h=0.05, off=0.004)
        strip_on(Ph, tree, [(-0.355, 0.50), (-0.255, 0.50)], 0.012, ax, "trim_soft", off=0.0075, step=0.035)
        out.append(Ph.finish())
        out.append(HP.mirror_part(f"retrovisor_{nm}", 1 if nm == "l" else -1, 0.80, -0.50, cab_yb + 0.12).finish())
    out.append(HP.calipers_part(H.AXLES).finish())
    return out


def top(tree):
    out = []
    Pv = Part("venezianas")
    for sd in (1, -1):
        for k in range(6):
            y = 0.62 + k * 0.145
            strip_on(Pv, tree, [(sd * 0.38, y), (sd * 0.62, y)], 0.075, "top", "trim", off=0.014, step=0.04)
            strip_on(Pv, tree, [(sd * 0.39, y), (sd * 0.61, y)], 0.030, "top", "carbon", off=0.022, step=0.04)
    out.append(Pv.finish())
    return out


def glints(tree):
    P = Part("reflexo_vidro")
    patch_on(P, tree, [(-0.36, -0.70), (-0.22, -0.70), (0.06, -0.28), (-0.08, -0.28)], "top", "glint", h=0.07, off=0.0035)
    patch_on(P, tree, [(0.04, -0.70), (0.09, -0.70), (0.28, -0.40), (0.23, -0.40)], "top", "glint", h=0.07, off=0.0035)
    for ax in ("side+", "side-"):
        patch_on(P, tree, [(-0.46, 0.80), (-0.34, 0.80), (-0.04, 1.00), (-0.16, 1.00)], ax, "glint", h=0.07, off=0.0035)
        patch_on(P, tree, [(-0.20, 0.80), (-0.155, 0.80), (0.04, 0.97), (-0.005, 0.97)], ax, "glint", h=0.07, off=0.0035)
    return [P.finish()]


def build(tree):
    cab_yb = H.CAGE["cabin"][1]["yb"]
    return rear(tree) + popups(tree) + front(tree) + sides(tree, cab_yb) + top(tree) + glints(tree)
VIEWS["capo"] = ((-1.2, -3.4, 2.4), (0, -1.7, 0.6), 50)
