"""Roadster HERÓI (Curupira S, estilo `roadster`): as peças em cima do casco da gaiola (`hero/roadster-gaiola.json`, cockpit ABERTO: sem as faces de cima entre as portas). O interior de verdade
(tina, painel, dois bancos com encosto, o piloto de capacete na cor de acento, à esquerda, e o volante), para-brisa baixo com moldura cromada, santantônio duplo e as corcovas atrás dos bancos;
faróis redondos EMBUTIDOS nos para-lamas (aro cromado, lente acesa no fundo), boca cromada e piscas; a traseira com as quatro lanternas redondas de LED, escapes gêmeos e difusor.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import build_hero_gt as H  # noqa: E402
import hero_parts as HP  # noqa: E402
from build_hero_gt import Part, Vector, v3, box, extrude, patch_on, strip_on, rounded, tube, project, frame  # noqa: E402
from mathutils import Matrix  # noqa: E402

BELT_PAINT_GAPS = ()
ROOF_GLASS_GAPS = ()
EXHAUST = (0.40, 2.28, 0.27)
SEAT = (-0.36, 0.42, 0.62)
SINGLE_EXHAUST = False

PIT0, PIT1 = -0.5, 0.78
INNER = 0.75        # meia largura da tina (a abertura do cockpit)
VIEWS = {"cockpit": ((-2.2, -2.6, 2.6), (0, 0.15, 0.6), 50), "cockpit2": ((2.6, 2.2, 2.4), (0, 0.15, 0.6), 50), "frente_redonda": ((-2.4, -4.2, 1.2), (0.3, -2.1, 0.5), 55)}

HEAD_ROUND = dict(lens="headlight", dim="headlight_dim", floor="reflector", top="chrome", outer="chrome", lip="chrome", dot="headlight")


def cockpit():
    """A tina do cockpit: piso, paredes de dentro, o painel com o quadro de instrumentos, o túnel central e a coluna do volante. Tudo em `interior`/`trim` (faces para dentro)."""
    P = Part("cockpit")
    zf, zt = 0.36, 0.77
    # piso, paredes e antepara (faces voltadas para dentro do cockpit)
    HP.oriented(P, [v3(-INNER, PIT0, zf), v3(INNER, PIT0, zf), v3(INNER, PIT1, zf), v3(-INNER, PIT1, zf)], "interior", (0, 0, 1))
    for sd in (1, -1):
        HP.oriented(P, [v3(sd * INNER, PIT0, zf), v3(sd * INNER, PIT1, zf), v3(sd * INNER, PIT1, zt), v3(sd * INNER, PIT0, zt)], "interior", (-sd, 0, 0))
    HP.oriented(P, [v3(-INNER, PIT1, zf), v3(INNER, PIT1, zf), v3(INNER, PIT1, zt), v3(-INNER, PIT1, zt)], "interior", (0, -1, 0))   # atrás dos bancos
    HP.oriented(P, [v3(-INNER, PIT0, zf), v3(INNER, PIT0, zf), v3(INNER, PIT0, zt), v3(-INNER, PIT0, zt)], "interior", (0, 1, 0))     # a antepara da frente
    # o painel (topo arredondado) e o quadro de instrumentos, o túnel entre os bancos e as soleiras de couro
    HP.rbox(P, (0, -0.44, 0.72), (2 * INNER - 0.02, 0.14, 0.13), "trim", bevel=0.035, seg=2)
    HP.rbox(P, (-0.36, -0.37, 0.80), (0.34, 0.07, 0.10), "piano", bevel=0.025, seg=2)       # o quadro de instrumentos, na frente do piloto
    for sx in (-0.36, 0.0, 0.36):
        pass
    HP.rbox(P, (0, 0.1, 0.52), (0.20, 1.0, 0.24), "trim_soft", bevel=0.04, seg=2)           # o túnel
    for sd in (1, -1):
        HP.rbox(P, (sd * (INNER - 0.03), 0.14, zt - 0.02), (0.07, 1.20, 0.05), "trim_soft", bevel=0.02, seg=1)   # o friso de couro da borda do cockpit
    # a coluna e o volante (toro inclinado para o piloto), com o cubo
    HP.rbox(P, (-0.36, -0.30, 0.74), (0.06, 0.26, 0.06), "trim", bevel=0.015, seg=1, M=Matrix.Rotation(0.5, 4, "X"))
    HP.torus(P, (-0.36, -0.08, 0.83), 0.155, 0.014, (0, 0.55, 0.83), "trim", seg=20, tube=6)
    HP.rbox(P, (-0.36, -0.07, 0.83), (0.07, 0.04, 0.07), "chrome", bevel=0.012, seg=1)
    return P


def seats():
    P = Part("bancos")
    tilt = Matrix.Rotation(-0.22, 4, "X")
    for sx in (-0.36, 0.36):
        HP.rbox(P, (sx, 0.44, 0.47), (0.44, 0.46, 0.10), "seat", bevel=0.035, seg=2)                 # a almofada
        HP.rbox(P, (sx, 0.68, 0.70), (0.44, 0.11, 0.50), "seat", bevel=0.04, seg=2, M=tilt)          # o encosto reclinado
        HP.rbox(P, (sx, 0.745, 1.00), (0.22, 0.09, 0.15), "seat", bevel=0.035, seg=2, M=tilt)        # o apoio de cabeça
        for sd in (1, -1):
            HP.rbox(P, (sx + sd * 0.20, 0.58, 0.62), (0.06, 0.30, 0.34), "seat", bevel=0.02, seg=1, M=tilt)  # os reforços laterais do encosto
    return P


def driver():
    """O piloto (à esquerda: o Brasil dirige pela direita da pista): tronco, braços até o volante, capacete na cor de acento com viseira escura."""
    P = Part("piloto")
    HP.rbox(P, (-0.36, 0.42, 0.74), (0.40, 0.26, 0.36), "trim_soft", bevel=0.07, seg=2)               # o tronco
    HP.rbox(P, (-0.36, 0.44, 0.58), (0.34, 0.30, 0.14), "trim", bevel=0.05, seg=2)                    # as pernas, sentado
    for sd in (1, -1):
        H_ = Vector((-0.36 + sd * 0.15, -0.08, 0.86))   # a mão no volante
        S_ = Vector((-0.36 + sd * 0.18, 0.40, 0.84))    # o ombro
        mid = (H_ + S_) / 2 + Vector((sd * 0.04, 0.0, -0.06))
        H.tube(P, [S_, mid, H_], [0.05, 0.042, 0.036], "trim_soft", seg=8, ratio=1.0, up=(1, 0, 0), cap_end=True)
    HP.helmet(P, (-0.36, 0.40, 1.02), 0.15, "accent", "glass")
    return P


def windshield(tree):
    """Para-brisa baixo de vidro escuro, levemente curvo, com a moldura cromada e as duas colunas."""
    P = Part("parabrisa")
    wy0, wy1 = 0.76, 1.05
    wz0, wz1 = PIT0 - 0.02, -0.36
    N = 12
    pts = []
    for i in range(N + 1):
        x = -0.72 + 1.44 * i / N
        crown = 0.025 * (1 - (x / 0.72) ** 2)
        pts.append((x, crown))
    for i in range(N):
        xa, ca = pts[i]
        xb, cb = pts[i + 1]
        q = [v3(xa, wz0 - ca, wy0), v3(xb, wz0 - cb, wy0), v3(xb, wz1 - cb, wy1), v3(xa, wz1 - ca, wy1)]
        HP.oriented(P, q, "glass", (0, -0.29, 0.16))
    for sd in (1, -1):  # as colunas cromadas e o friso de cima
        H.tube(P, [v3(sd * 0.735, wz0, wy0 - 0.01), v3(sd * 0.735, wz1, wy1)], [0.021, 0.021], "chrome", seg=8, ratio=1.0, up=(1, 0, 0))
    H.tube(P, [v3(-0.74, wz1, wy1), v3(0.0, wz1 - 0.025, wy1 + 0.004), v3(0.74, wz1, wy1)], [0.02, 0.02, 0.02], "chrome", seg=8, ratio=1.0, up=(0, 0, 1))
    # os reflexos do céu: duas faixas diagonais de espelho
    N2 = lambda x, u: v3(x, wz0 + (wz1 - wz0) * u - 0.03 * (1 - (x / 0.72) ** 2) - 0.004, wy0 + (wy1 - wy0) * u)
    for sd in (1, -1):
        for (x0, w) in ((0.12, 0.14), (0.31, 0.04)):
            a, b = sd * x0, sd * (x0 + w)
            HP.oriented(P, [N2(a, 0.12), N2(a + sd * 0.22, 0.88), N2(b + sd * 0.22, 0.88), N2(b, 0.12)], "glint", (0, -0.29, 0.16))
    return P


def roll_hoops():
    """O santantônio duplo (dois arcos cromados por lado, ligados por uma barra) e as corcovas pintadas atrás dos bancos."""
    P = Part("santantonio")
    for sd in (1, -1):
        for xo in (0.20, 0.52):
            H.tube(P, [v3(sd * xo, PIT1 + 0.03, 0.76), v3(sd * xo, PIT1 + 0.01, 0.98), v3(sd * xo, PIT1 - 0.03, 1.10), v3(sd * xo * 0.94, PIT1 - 0.045, 1.125)], [0.026, 0.026, 0.025, 0.024], "chrome", seg=8, ratio=1.0, up=(1, 0, 0), cap_end=True)
        H.tube(P, [v3(sd * 0.19, PIT1 - 0.045, 1.125), v3(sd * 0.36, PIT1 - 0.05, 1.135), v3(sd * 0.535, PIT1 - 0.045, 1.125)], [0.024, 0.024, 0.024], "chrome", seg=8, ratio=1.0, up=(0, 0, 1), cap_end=True)
    Pc = Part("corcovas")
    for sd in (1, -1):
        prof = [(PIT1 - 0.02, 0.78), (PIT1 + 0.01, 0.90), (PIT1 + 0.06, 0.975), (PIT1 + 0.2, 1.0), (1.05, 0.97), (1.4, 0.90), (1.7, 0.84), (1.7, 0.78)]
        loop = [v3(sd * 0.20, y, z) for (y, z) in prof]
        loop = loop if sd > 0 else list(reversed(loop))
        HP.ext_bevel(Pc, loop, v3(sd * 0.32, 0, 0), "paint", bevel=0.035, seg=2)
    return [P.finish(), Pc.finish()]


def front(tree):
    out = []
    Pl, Pled = Part("lamp_head"), Part("_hled")
    for sd, nm in ((1, "l"), (-1, "r")):
        Pr = Part(f"farol_redondo_{nm}")
        HP.round_lamp(Pr, Pled, tree, "front", sd * 0.60, 0.53, 0.14, 0.12, HEAD_ROUND, seg=20, led=False)
        out.append(Pr.finish())
        # o pisca âmbar, aceso como no estilo de sempre, no para-choque; um aro fino de luz diurna sob o farol
        HP.strip_lamp(Pl, Pled, tree, "front", sd * 0.62, 0.345, 0.07, 0.020, mats=dict(HP.HEAD_MATS, lens="headlight_amber", dim="headlight_dim", floor="piano", wall="piano"), n=4.0, N=26, height=0.014, floor=0.005, bezel=0.010, ring_w=0.005, lip=False)
        HP.strip_lamp(Pl, Pled, tree, "front", sd * 0.33, 0.43, 0.115, 0.007, mats=HP.HEAD_MATS, n=5.0, N=22, height=0.010, floor=0.004, bezel=0.006, ring_w=0.003, lip=False)
    out.append(Pl.finish())
    # a boca cromada: recorte escuro, barras cromadas e a moldura
    Pg = Part("entradas_frente")
    patch_on(Pg, tree, rounded(0, 0.36, 0.64, 0.15, 0.03), "front", "under", h=0.06, off=0.004)
    for z in (0.325, 0.36, 0.395):
        strip_on(Pg, tree, [(-0.29, z), (0.29, z)], 0.012, "front", "chrome", off=0.010, step=0.05)
    for z in (0.275, 0.445):
        strip_on(Pg, tree, [(-0.33, z), (0.33, z)], 0.014, "front", "chrome", off=0.008, step=0.05)
    for x in (-0.33, 0.33):
        strip_on(Pg, tree, [(x, 0.285), (x, 0.435)], 0.014, "front", "chrome", off=0.008, step=0.05)
    out.append(Pg.finish())
    # o para-choque fino (tubo) e a lâmina do divisor
    Pb = Part("divisor")
    H.tube(Pb, [v3(-0.66, -2.205, 0.245), v3(0.0, -2.215, 0.245), v3(0.66, -2.205, 0.245)], [0.032, 0.032, 0.032], "trim", seg=10, ratio=1.0, up=(0, 0, 1))
    box(Pb, (0, -2.18, 0.19), (1.1, 0.14, 0.02), "carbon")
    for sd in (1, -1):
        box(Pb, (sd * 0.55, -2.17, 0.215), (0.03, 0.08, 0.05), "trim")
    out.append(Pb.finish())
    Pc = Part("fresta_capo")
    strip_on(Pc, tree, [(-0.62, -0.53), (0.62, -0.53)], 0.006, "top", "trim", off=0.0025, step=0.04)
    for sd in (1, -1):
        strip_on(Pc, tree, [(sd * 0.60, -0.53), (sd * 0.64, -1.0), (sd * 0.66, -1.45)], 0.006, "top", "trim", off=0.0025, step=0.04)
    strip_on(Pc, tree, [(-0.40, -2.10), (0.40, -2.10)], 0.006, "top", "trim", off=0.0025, step=0.04)
    out.append(Pc.finish())
    return out


def sides(tree):
    out = []
    P = Part("fresta_porta")
    for ax in ("side+", "side-"):
        strip_on(P, tree, [(-0.46, 0.30), (-0.45, 0.50), (-0.44, 0.58)], 0.006, ax, "trim", off=0.003, step=0.04)
        strip_on(P, tree, [(0.60, 0.30), (0.61, 0.50), (0.62, 0.58)], 0.006, ax, "trim", off=0.003, step=0.04)
    out.append(P.finish())
    for ax, nm in (("side+", "l"), ("side-", "r")):
        Pa = Part(f"entrada_ar_{nm}")
        patch_on(Pa, tree, [(-1.02, 0.36), (-0.80, 0.36), (-0.80, 0.47), (-1.02, 0.45)], ax, "trim", h=0.04, off=0.005)
        for y0 in (-0.98, -0.91, -0.84):
            strip_on(Pa, tree, [(y0, 0.37), (y0 + 0.01, 0.455)], 0.012, ax, "chrome", off=0.009, step=0.04)
        out.append(Pa.finish())
        out.append(HP.mirror_part(f"retrovisor_{nm}", 1 if nm == "l" else -1, 0.84, -0.44, 0.86, shell_mat="chrome", glass_mat="glass", ped_z=0.80).finish())
    out.append(HP.calipers_part(H.AXLES).finish())
    return out


def rear(tree):
    out = []
    Pp = Part("painel_traseiro")
    patch_on(Pp, tree, [(-0.75, 0.50), (0.75, 0.50), (0.75, 0.74), (0.60, 0.77), (-0.60, 0.77), (-0.75, 0.74)], "back", "trim", h=0.09, off=0.004)
    out.append(Pp.finish())
    Pl, Pled = Part("lamp_tail"), Part("led")
    for sd in (1, -1):
        for (x, z, R, rl) in ((0.625, 0.64, 0.145, 0.125), (0.33, 0.64, 0.12, 0.10)):
            HP.round_lamp(Pl, Pled, tree, "back", sd * x, z, R, rl, dict(HP.TAIL_MATS, lip="chrome", top="piano", outer="piano"), seg=18)
    out += [Pl.finish(), Pled.finish()]
    Pb = Part("parachoque_tras")
    H.tube(Pb, [v3(-0.70, 2.205, 0.335), v3(0.0, 2.215, 0.335), v3(0.70, 2.205, 0.335)], [0.036, 0.036, 0.036], "trim", seg=10, ratio=1.0, up=(0, 0, 1))
    out.append(Pb.finish())
    Pi = Part("indicadores")
    for sd in (1, -1):
        patch_on(Pi, tree, [(sd * 0.50, 0.445), (sd * 0.74, 0.445), (sd * 0.74, 0.470), (sd * 0.50, 0.470)][::sd], "back", "amber", h=0.08, off=0.0075)
    out.append(Pi.finish())
    out.append(HP.diffuser_part(0.55, 1.95, 2.29, 0.245, 0.33, 9, fin_h=0.07).finish())
    for sd, nm in ((1, "escape_l"), (-1, "escape_r")):
        out.append(HP.exhaust_tip(nm, sd * 0.40, 2.12, 0.27, 0.075, 0.19).finish())
    return out


def glints_none():
    return []


def build(tree):
    out = [cockpit().finish(), seats().finish(), driver().finish(), windshield(tree).finish()]
    out += roll_hoops()
    return out + front(tree) + sides(tree) + rear(tree)
