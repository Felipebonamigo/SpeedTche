"""Tupiniquim HERÓI: o hatch compacto e arredondado de lanterna ALTA em "L" invertido (arquétipo dos hatches compactos nacionais dos anos 90 e 2000), em alta definição, em cima do casco de V6c
(`specs/tupiniquim.py`). O caráter é o de carro popular: traseira com a lanterna em "L" (a barra vermelha em cima e a perna alta pelo canto: vermelho, luz de ré clara e pisca âmbar) em poço com
refletor, para-choque de plástico com friso e a faixa escura embaixo, placa lisa, escapamento simples; frente com os faróis em cunha (a ponta de fora sobe) de refletor e lente, grade lisa e
estreita, para-choque com a entrada de ar; nos lados o vinco que sobe para a coluna C (faixa B), frisos de porta, maçanetas, retrovisores de carcaça preta, friso lateral, tampa do tanque e
antena; limpadores na frente e atrás.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import build_hero_gt as H  # noqa: E402
import hero_nac as N  # noqa: E402
from build_hero_gt import Part, patch_on, strip_on  # noqa: E402
from hero_nac import rrect, raised  # noqa: E402

KEEP = ("vinco", "soleira", "cintura")
EXHAUST = (0.42, 2.11, 0.27)
VIEWS = {
    "tras_perto": ((2.8, 5.0, 1.6), (0, 2.0, 0.65), 55), "tras_baixo": ((0.8, 5.6, 0.7), (0, 2.1, 0.55), 55), "frente_perto": ((-2.8, -5.0, 1.5), (0, -2.0, 0.6), 55),
    "frente_baixo": ((-0.8, -5.6, 0.7), (0, -2.1, 0.55), 55), "lado_perto": ((4.8, 0.2, 1.1), (0, 0.2, 0.7), 55), "capo": ((-1.8, -4.4, 2.2), (0, -1.2, 0.8), 55),
    "tras_cima": ((2.2, 4.6, 2.6), (0, 1.2, 0.9), 55),
}
DOORS_Y = (-0.70, 0.50, 1.10)
# o contorno do "L" invertido da lanterna (x, z): a perna alta no canto e a barra para dentro, em cima
TAIL_L = [(0.47, 0.57), (0.67, 0.57), (0.67, 0.97), (0.22, 0.97), (0.22, 0.88), (0.47, 0.88)]


def rear(tree):
    out = []
    Pl = Part("lamp_tail")
    for sd in (1, -1):
        # painel escuro em "L" atrás das células, um pouco maior que a lanterna
        poly = N.scaled_outline(TAIL_L, 1.05)
        poly = poly if sd > 0 else N.mirror_x(poly)
        patch_on(Pl, tree, poly, "back", "trim", h=0.06, off=0.004)
        # o "L" inteiro em vermelho apagado sob as células: de longe a lanterna lê como um L cheio, de perto são as células com a moldura
        poly_fill = N.scaled_outline(TAIL_L, 0.99)
        poly_fill = poly_fill if sd > 0 else N.mirror_x(poly_fill)
        patch_on(Pl, tree, poly_fill, "back", "taillight_dim", h=0.05, off=0.0065)
        N.lamp_cell(Pl, tree, "back", sd * 0.445, 0.923, 0.208, 0.040, N.RED, n=4.0, N=26, ring_w=0.011, bezel=0.008)                    # a barra de cima
        N.lamp_cell(Pl, tree, "back", sd * 0.575, 0.7825, 0.092, 0.1025, N.RED, n=4.0, N=22, ring_w=0.013, bezel=0.008)               # a perna: lanterna e freio, encostada na barra
        N.lamp_cell(Pl, tree, "back", sd * 0.570, 0.652, 0.085, 0.026, N.CLEAR, n=3.6, N=14, ring_w=0.008, bezel=0.008)                # luz de ré, clara
        N.lamp_cell(Pl, tree, "back", sd * 0.570, 0.594, 0.085, 0.018, N.AMBER, n=3.6, N=14, ring_w=0.006, bezel=0.007)                # pisca âmbar
    out.append(Pl.finish())
    P3 = Part("luz_freio")
    raised(P3, tree, "back", rrect(0.0, 1.045, 0.40, 0.034, 0.012, seg=2), 0.012, "trim", inset=0.004, cell=0.1, step=0.055)
    patch_on(P3, tree, rrect(0.0, 1.045, 0.34, 0.018, 0.007, seg=2), "back", "taillight", h=0.06, off=0.0135)
    out.append(P3.finish())
    Pb = Part("parachoque_tras")
    raised(Pb, tree, "back", rrect(0.0, 0.385, 1.50, 0.26, 0.075), 0.030, "bumper", inset=0.018, cell=0.1, step=0.055)
    raised(Pb, tree, "back", rrect(0.0, 0.462, 1.20, 0.014, 0.006, seg=2), 0.036, "chrome", inset=0.003, cell=0.1, step=0.055)
    raised(Pb, tree, "back", rrect(0.0, 0.272, 1.00, 0.075, 0.03), 0.040, "trim", inset=0.012, cell=0.08, step=0.05)
    for sd in (1, -1):
        raised(Pb, tree, "back", rrect(sd * 0.62, 0.345, 0.13, 0.042, 0.012, seg=2), 0.036, "reflex_red", inset=0.005, cell=0.05, step=0.03)
    out.append(Pb.finish())
    Pp = Part("placa_tras")
    raised(Pp, tree, "back", rrect(0.0, 0.63, 0.40, 0.145, 0.02, seg=1), 0.012, "trim", inset=0.006, cell=0.14, step=0.1)
    patch_on(Pp, tree, rrect(0.0, 0.63, 0.31, 0.10, 0.008, seg=1), "back", "plate", h=0.3, off=0.0145)
    out.append(Pp.finish())
    Pt = Part("fresta_tampa")
    strip_on(Pt, tree, [(-0.70, 0.555), (0.0, 0.56), (0.70, 0.555)], 0.007, "back", "under", off=0.0055, step=0.04)
    for sd in (1, -1):
        strip_on(Pt, tree, [(sd * 0.745, 0.60), (sd * 0.735, 0.80), (sd * 0.715, 0.94)], 0.007, "back", "under", off=0.0055, step=0.04)
    out.append(Pt.finish())
    out.append(N.exhaust_pipe("escape_l", EXHAUST[0], EXHAUST[1] - 0.02, EXHAUST[2], ro=0.040, depth=0.15).finish())
    out.append(N.stub_pipe("escape_r", -EXHAUST[0], EXHAUST[1] + 0.02, EXHAUST[2]).finish())
    Pw = Part("limpador_tras")
    N.wiper(Pw, tree, (0.0, 2.07), (0.34, 2.045), ((0.10, 2.052), (0.52, 2.008)), width_arm=0.012, width_blade=0.020)
    out.append(Pw.finish())
    # desembaçador do vidro de trás: fios finos, de ponta a ponta, mais claros que o vidro
    Pd = Part("desembacador")
    for y in (1.74, 1.80, 1.86, 1.92, 1.98):
        strip_on(Pd, tree, [(-0.52, y), (0.0, y), (0.52, y)], 0.006, "top", "trim_soft", off=0.0055, step=0.13)
    out.append(Pd.finish())
    return out


# o farol em cunha de V6c (a ponta de fora sobe): a moldura segue o contorno e as células seguem a inclinação
HEAD = [(0.40, 0.640), (0.62, 0.652), (0.715, 0.668), (0.745, 0.695), (0.745, 0.735), (0.715, 0.765), (0.62, 0.77), (0.40, 0.745)]
SLOPE = 0.07


def front(tree):
    out = []
    Pl = Part("lamp_head")
    for sd in (1, -1):
        poly = N.scaled_outline(HEAD, 1.07)
        poly = poly if sd > 0 else N.mirror_x(poly)
        patch_on(Pl, tree, poly, "front", "trim", h=0.06, off=0.004)
        N.lamp_cell(Pl, tree, "front", sd * 0.545, 0.700, 0.130, 0.050, N.mats_of("headlight", "reflector", floor="reflector", wall="housing", lip="chrome"), n=3.6, N=28, ring_w=0.030, bezel=0.009, lip=True, slope=sd * SLOPE)
        N.lamp_cell(Pl, tree, "front", sd * 0.520, 0.696, 0.060, 0.028, N.mats_of("headlight_dim", "reflector", floor="reflector", wall="chrome_soft", lip="chrome"), n=3.2, N=20, ring_w=0.011, bezel=0.006, height=0.032, floor=0.022, slope=sd * SLOPE)
        N.lamp_cell(Pl, tree, "front", sd * 0.705, 0.723, 0.026, 0.030, N.AMBER, n=3.2, N=14, ring_w=0.008, bezel=0.007)
    out.append(Pl.finish())
    Pg = Part("grade")
    raised(Pg, tree, "front", rrect(0.0, 0.672, 0.66, 0.095, 0.025), 0.010, "trim", inset=0.007, cell=0.1, step=0.055)
    for z in (0.652, 0.692):
        patch_on(Pg, tree, rrect(0.0, z, 0.46, 0.014, 0.005, seg=2), "front", "trim_soft", h=0.06, off=0.0115)
    out.append(Pg.finish())
    Pb = Part("parachoque_frente")
    raised(Pb, tree, "front", rrect(0.0, 0.370, 1.62, 0.26, 0.075), 0.032, "bumper", inset=0.018, cell=0.1, step=0.055)
    raised(Pb, tree, "front", rrect(0.0, 0.468, 1.40, 0.014, 0.006, seg=2), 0.038, "chrome", inset=0.003, cell=0.1, step=0.055)
    raised(Pb, tree, "front", rrect(0.0, 0.322, 0.80, 0.085, 0.035), 0.040, "trim", inset=0.012, cell=0.1, step=0.055)
    for sd in (1, -1):
        raised(Pb, tree, "front", rrect(sd * 0.62, 0.34, 0.13, 0.06, 0.02, seg=2), 0.036, "trim", inset=0.008, cell=0.06, step=0.03)  # tampa do furo do farol de neblina
    out.append(Pb.finish())
    Pp = Part("placa_frente")
    raised(Pp, tree, "front", rrect(0.0, 0.434, 0.36, 0.115, 0.018, seg=1), 0.046, "trim", inset=0.006, cell=0.14, step=0.1)
    patch_on(Pp, tree, rrect(0.0, 0.434, 0.30, 0.088, 0.008, seg=1), "front", "plate", h=0.3, off=0.0475)
    out.append(Pp.finish())
    Pc = Part("fresta_capo")
    strip_on(Pc, tree, [(-0.72, -0.78), (0.0, -0.78), (0.72, -0.78)], 0.010, "top", "under", off=0.0055, step=0.04)
    for sd in (1, -1):
        strip_on(Pc, tree, [(sd * 0.745, -0.82), (sd * 0.75, -1.2), (sd * 0.72, -1.82)], 0.010, "top", "under", off=0.0055, step=0.04)
    strip_on(Pc, tree, [(-0.62, -1.90), (0.0, -1.915), (0.62, -1.90)], 0.010, "top", "under", off=0.0055, step=0.04)
    out.append(Pc.finish())
    Pw = Part("limpador")
    N.wiper(Pw, tree, (0.56, -0.745), (-0.10, -0.675), ((0.34, -0.715), (-0.10, -0.675)))
    N.wiper(Pw, tree, (-0.02, -0.745), (-0.60, -0.690), ((-0.22, -0.717), (-0.62, -0.688)))
    out.append(Pw.finish())
    return out


def sides(tree):
    return N.sides_common(tree, DOORS_Y, [(0.08, 0.895), (0.90, 0.905)], rub_y=(-0.82, 1.30), marker=(-1.78, 0.60), mirror_at=(0.935, -0.52, 1.00), flap=(1.66, 0.84),
                          antenna_at=(-0.74, -1.10), door_z=(0.325, 0.93), mirror_mat="trim")


def glints(tree):
    P = Part("reflexo_vidro")
    patch_on(P, tree, [(-0.34, -0.70), (-0.20, -0.70), (0.10, -0.30), (-0.04, -0.30)], "top", "glint", h=0.07, off=0.0035)
    patch_on(P, tree, [(0.06, -0.70), (0.11, -0.70), (0.30, -0.42), (0.25, -0.42)], "top", "glint", h=0.07, off=0.0035)
    patch_on(P, tree, [(0.22, 1.74), (0.27, 1.74), (0.17, 2.02), (0.12, 2.02)], "top", "glint", h=0.07, off=0.0035)
    for ax in ("side+", "side-"):
        patch_on(P, tree, [(-0.52, 1.0), (-0.40, 1.0), (-0.14, 1.30), (-0.26, 1.30)], ax, "glint", h=0.07, off=0.0035)
        patch_on(P, tree, [(0.80, 1.0), (0.85, 1.0), (1.00, 1.24), (0.95, 1.24)], ax, "glint", h=0.07, off=0.0035)
    return [P.finish()]


def build(tree, sp):
    return rear(tree) + front(tree) + sides(tree) + glints(tree) + N.flares(tree, sp)
