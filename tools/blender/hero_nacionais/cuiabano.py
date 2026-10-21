"""Cuiabano HERÓI: o hatch quadrado de caixa reta e teto reto (arquétipo dos hatches nacionais dos anos 90 e 2000), em alta definição, em cima do casco de V6c (`specs/cuiabano.py`).
O caráter é o de carro popular: traseira com a lanterna VERTICAL de três cubos (âmbar em cima, vermelhos embaixo, a luz de ré clara) em poço com refletor, para-choque de plástico com
friso, placa lisa, escapamento simples; frente com o farol retangular largo de refletor e lente, o pisca âmbar ao lado, a grade lisa e baixa, o para-choque com a entrada de ar; nos lados
frisos de porta, maçanetas, retrovisores, o friso lateral, a tampa do tanque e a antena no para-lama; limpadores na frente e atrás.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import build_hero_gt as H  # noqa: E402
import hero_nac as N  # noqa: E402
from build_hero_gt import Part, patch_on, strip_on  # noqa: E402
from hero_nac import rrect, raised  # noqa: E402

KEEP = ("faixa", "soleira", "cintura")
EXHAUST = (0.42, 2.10, 0.27)
VIEWS = {
    "tras_perto": ((2.8, 5.0, 1.6), (0, 2.0, 0.65), 55), "tras_baixo": ((0.8, 5.6, 0.7), (0, 2.1, 0.55), 55), "frente_perto": ((-2.8, -5.0, 1.5), (0, -2.0, 0.6), 55),
    "frente_baixo": ((-0.8, -5.6, 0.7), (0, -2.1, 0.55), 55), "lado_perto": ((4.8, 0.2, 1.1), (0, 0.2, 0.7), 55), "capo": ((-1.8, -4.4, 2.2), (0, -1.2, 0.8), 55),
    "tras_cima": ((2.2, 4.6, 2.6), (0, 1.2, 0.9), 55),
}

# lanterna: coluna vertical de três cubos; a base do cubo de baixo é dividida entre o vermelho de fora e a luz de ré clara de dentro
LAMP_X, LAMP_W = 0.578, 0.18
CELL_B = 0.052
CELLS_Z = (0.607, 0.731, 0.855)
DOORS_Y = (-0.78, 0.46, 1.06)
Z_BELT = 0.945


def rear(tree):
    out = []
    Pl = Part("lamp_tail")
    for sd in (1, -1):
        cx = sd * LAMP_X
        # moldura escura de ponta a ponta atrás das células (o painel da lanterna)
        patch_on(Pl, tree, rrect(cx, 0.731, LAMP_W + 0.040, 0.43, 0.03), "back", "trim", h=0.06, off=0.004)
        N.lamp_cell(Pl, tree, "back", cx, CELLS_Z[2], LAMP_W / 2, CELL_B, N.AMBER, n=4.0, N=14, ring_w=0.009)                       # pisca, em cima
        N.lamp_cell(Pl, tree, "back", cx, CELLS_Z[1], LAMP_W / 2, CELL_B, N.RED, n=4.0, N=14, ring_w=0.009)                         # lanterna, no meio
        # embaixo: o vermelho (de fora) e a luz de ré clara (de dentro)
        N.lamp_cell(Pl, tree, "back", cx + sd * 0.0285, CELLS_Z[0], 0.0495, CELL_B, N.RED, n=3.6, N=12, ring_w=0.009)
        N.lamp_cell(Pl, tree, "back", cx - sd * 0.0575, CELLS_Z[0], 0.0225, CELL_B, N.CLEAR, n=3.2, N=10, ring_w=0.007, bezel=0.009)
    out.append(Pl.finish())
    # terceira luz de freio, em cima do vidro de trás: caixa baixa com a lente vermelha
    P3 = Part("luz_freio")
    raised(P3, tree, "back", rrect(0.0, 0.965, 0.46, 0.036, 0.012, seg=2), 0.012, "trim", inset=0.004, cell=0.1, step=0.055)
    patch_on(P3, tree, rrect(0.0, 0.965, 0.40, 0.020, 0.008, seg=2), "back", "taillight", h=0.06, off=0.0135)
    out.append(P3.finish())
    # para-choque de trás: plástico com volume, friso cromado e os catadióptricos vermelhos nas pontas
    Pb = Part("parachoque_tras")
    raised(Pb, tree, "back", rrect(0.0, 0.372, 1.50, 0.27, 0.075), 0.030, "bumper", inset=0.018, cell=0.1, step=0.055)
    raised(Pb, tree, "back", rrect(0.0, 0.452, 1.20, 0.014, 0.006, seg=2), 0.036, "chrome", inset=0.003, cell=0.1, step=0.055)
    raised(Pb, tree, "back", rrect(0.0, 0.268, 1.02, 0.075, 0.03), 0.040, "trim", inset=0.012, cell=0.08, step=0.05)
    for sd in (1, -1):
        raised(Pb, tree, "back", rrect(sd * 0.60, 0.34, 0.14, 0.045, 0.012, seg=2), 0.036, "reflex_red", inset=0.005, cell=0.05, step=0.03)
    out.append(Pb.finish())
    Pp = Part("placa_tras")
    raised(Pp, tree, "back", rrect(0.0, 0.62, 0.40, 0.145, 0.02, seg=1), 0.012, "trim", inset=0.006, cell=0.14, step=0.1)
    patch_on(Pp, tree, rrect(0.0, 0.62, 0.31, 0.10, 0.008, seg=1), "back", "plate", h=0.3, off=0.0145)
    out.append(Pp.finish())
    # tampa traseira: o vinco em volta e a maçaneta embutida
    Pt = Part("fresta_tampa")
    strip_on(Pt, tree, [(-0.70, 0.545), (0.0, 0.55), (0.70, 0.545)], 0.007, "back", "under", off=0.0055, step=0.075)
    for sd in (1, -1):
        strip_on(Pt, tree, [(sd * 0.745, 0.60), (sd * 0.735, 0.80), (sd * 0.715, 0.93)], 0.007, "back", "under", off=0.0055, step=0.075)
    out.append(Pt.finish())
    out.append(N.exhaust_pipe("escape_l", EXHAUST[0], EXHAUST[1] - 0.02, EXHAUST[2], ro=0.040, depth=0.15).finish())
    out.append(N.stub_pipe("escape_r", -EXHAUST[0], EXHAUST[1] + 0.02, EXHAUST[2]).finish())
    # limpador do vidro de trás
    Pw = Part("limpador_tras")
    N.wiper(Pw, tree, (0.0, 2.075), (0.34, 2.050), ((0.10, 2.058), (0.52, 2.012)), width_arm=0.012, width_blade=0.020)
    out.append(Pw.finish())
    # desembaçador do vidro de trás: fios finos, de ponta a ponta, mais claros que o vidro
    Pd = Part("desembacador")
    for y in (1.76, 1.82, 1.88, 1.94, 2.0):
        strip_on(Pd, tree, [(-0.43, y), (0.0, y), (0.43, y)], 0.006, "top", "trim_soft", off=N.GLASS_H + 0.0015, step=0.13)
    out.append(Pd.finish())
    return out


def front(tree):
    out = []
    Pl = Part("lamp_head")
    for sd in (1, -1):
        cx = sd * 0.505
        # o farol retangular largo: moldura, poço de refletor prateado, a lente de fora (coroa) e a de dentro (miolo), mais o pisca âmbar encostado do lado de fora
        patch_on(Pl, tree, rrect(sd * 0.555, 0.675, 0.375, 0.165, 0.03), "front", "trim", h=0.06, off=0.004)
        N.lamp_cell(Pl, tree, "front", cx, 0.675, 0.125, 0.058, N.mats_of("headlight", "reflector", floor="reflector", wall="housing", lip="chrome"), n=4.0, N=20, ring_w=0.034, bezel=0.010, lip=True)
        N.lamp_cell(Pl, tree, "front", cx, 0.675, 0.062, 0.032, N.mats_of("headlight_dim", "reflector", floor="reflector", wall="chrome_soft", lip="chrome"), n=3.4, N=14, ring_w=0.012, bezel=0.007, height=0.034, floor=0.024)
        N.lamp_cell(Pl, tree, "front", sd * 0.7, 0.675, 0.030, 0.048, N.AMBER, n=3.4, N=10, ring_w=0.009, bezel=0.008)
    out.append(Pl.finish())
    # grade lisa e baixa entre os faróis: painel cinza-escuro liso com uma única fresta, sem lamelas
    Pg = Part("grade")
    raised(Pg, tree, "front", rrect(0.0, 0.672, 0.70, 0.125, 0.03), 0.011, "trim_soft", inset=0.008, cell=0.1, step=0.055)
    patch_on(Pg, tree, rrect(0.0, 0.672, 0.52, 0.020, 0.008, seg=2), "front", "under", h=0.06, off=0.0125)
    out.append(Pg.finish())
    Pb = Part("parachoque_frente")
    raised(Pb, tree, "front", rrect(0.0, 0.385, 1.62, 0.26, 0.075), 0.032, "bumper", inset=0.018, cell=0.1, step=0.055)
    raised(Pb, tree, "front", rrect(0.0, 0.482, 1.40, 0.014, 0.006, seg=2), 0.038, "chrome", inset=0.003, cell=0.1, step=0.055)
    raised(Pb, tree, "front", rrect(0.0, 0.340, 0.84, 0.085, 0.035), 0.040, "trim", inset=0.012, cell=0.1, step=0.055)
    out.append(Pb.finish())
    Pp = Part("placa_frente")
    raised(Pp, tree, "front", rrect(0.0, 0.452, 0.36, 0.115, 0.018, seg=1), 0.046, "trim", inset=0.006, cell=0.14, step=0.1)
    patch_on(Pp, tree, rrect(0.0, 0.452, 0.30, 0.088, 0.008, seg=1), "front", "plate", h=0.3, off=0.0475)
    out.append(Pp.finish())
    # capô: o vinco em volta (cowl, laterais) e o do para-brisa
    Pc = Part("fresta_capo")
    strip_on(Pc, tree, [(-0.72, -0.70), (0.0, -0.70), (0.72, -0.70)], 0.010, "top", "under", off=0.0055, step=0.075)
    for sd in (1, -1):
        strip_on(Pc, tree, [(sd * 0.745, -0.74), (sd * 0.75, -1.2), (sd * 0.72, -1.82)], 0.010, "top", "under", off=0.0055, step=0.075)
    strip_on(Pc, tree, [(-0.62, -1.93), (0.0, -1.945), (0.62, -1.93)], 0.010, "top", "under", off=0.0055, step=0.075)
    out.append(Pc.finish())
    Pw = Part("limpador")
    # em repouso, na base do para-brisa: dois braços quase deitados, a palheta ao longo do vidro
    N.wiper(Pw, tree, (0.56, -0.655), (-0.10, -0.585), ((0.34, -0.625), (-0.10, -0.585)))
    N.wiper(Pw, tree, (-0.02, -0.655), (-0.60, -0.600), ((-0.22, -0.627), (-0.62, -0.598)))
    out.append(Pw.finish())
    return out


def sides(tree):
    return N.sides_common(tree, DOORS_Y, [(0.05, 0.855), (0.88, 0.855)], rub_y=(-0.90, 1.22), marker=(-1.78, 0.60), mirror_at=(0.935, -0.58, 1.03), flap=(1.62, 0.80),
                          antenna_at=(-0.74, -1.12), door_z=(0.325, 0.925))


def panes(tree, sp):
    """Os vidros: painéis de contorno redondo na pele (V18). Para-brisa e vidro de trás vistos de cima (x, y); janelas laterais vistas de lado (y, z), com a borda de cima
    acompanhando o canto do teto (`N.window`)."""
    P = Part("vidro")
    rp = N.round_poly
    N.pane(P, tree, "top", rp([(-0.665, -0.62), (0.665, -0.62), (0.585, -0.14), (-0.585, -0.14)], 0.07), cell=0.22, step=0.12)       # para-brisa
    N.pane(P, tree, "top", rp([(-0.50, 1.76), (0.50, 1.76), (0.525, 2.045), (-0.525, 2.045)], 0.075), cell=0.22, step=0.12)           # vidro de trás
    for ax in ("side+", "side-"):
        N.pane(P, tree, ax, rp(N.window(sp, -0.54, 0.40, 1.005, (0.40, 0.36)), 0.06), cell=0.2, step=0.12)                            # porta da frente
        N.pane(P, tree, ax, rp(N.window(sp, 0.68, 1.56, 1.005, (1.60, 1.40)), 0.06), cell=0.2, step=0.12)                             # janela de trás
    return [P.finish()]


def glints(tree):
    """Reflexo do céu nos vidros: uma folha por vidro (fina nas pontas), sobre o painel. Duas faixas retas de ponta cega liam como cano no vidro preto."""
    P = Part("reflexo_vidro")
    top = N.GLASS_H + 0.0025
    patch_on(P, tree, N.streak((0.34, -0.585), (-0.20, -0.17), 0.12), "top", "glint", h=0.14, off=top)
    patch_on(P, tree, N.streak((0.20, 1.80), (0.02, 2.02), 0.07), "top", "glint", h=0.14, off=top)
    for ax in ("side+", "side-"):
        patch_on(P, tree, N.streak((0.03, 1.04), (0.20, 1.34), 0.075), ax, "glint", h=0.14, off=top)
        patch_on(P, tree, N.streak((0.82, 1.04), (0.98, 1.33), 0.06), ax, "glint", h=0.14, off=top)
    return [P.finish()]


def build(tree, sp):
    return rear(tree) + front(tree) + sides(tree) + panes(tree, sp) + glints(tree) + N.flares(tree, sp)
