"""Pampeiro: hatch europeu mais largo e baixo, farol alongado que sobe até o para-lama (outro corte), teto com leve caimento, grade baixa de uma barra só.

Medidas em metros do JOGO. Estimativas de dimensão pública: ~3,95 m x 1,72 m x 1,47 m, entre-eixos ~2,55 m.
"""
from carlib import cap_material_of, lamp_stack, line_strip, make_material_of, pchip, rounded_rect, std_details

NOSE, TAIL = -2.15, 2.13
FRONT_AXLE, REAR_AXLE, AXLE_X = -1.34, 1.38, 0.79
COWL, ROOF_F, ROOF_R, GLASS_B = -0.80, -0.16, 1.50, 2.04
WIN = dict(side=[(COWL, 0.42), (0.62, 1.30)])
material_of = make_material_of(COWL, ROOF_F, ROOF_R, GLASS_B, WIN["side"], black=[(0.42, 0.62)])
_WHEEL = dict(r=0.38, w=0.26, arch_gap=0.05, spokes=5)
_POS = lambda: [(FRONT_AXLE, 1), (FRONT_AXLE, -1), (REAR_AXLE, 1), (REAR_AXLE, -1)]
_W = dict(wheel=_WHEEL, wheel_positions=_POS)
# farol alongado: parte na face da frente e sobe pelo canto até o para-lama (o resto é o remendo lateral)
HEAD = [(0.24, 0.655), (0.50, 0.645), (0.70, 0.665), (0.745, 0.70), (0.72, 0.735), (0.50, 0.75), (0.30, 0.74)]
HEAD_SIDE = [(-2.02, 0.665), (-1.86, 0.655), (-1.72, 0.675), (-1.70, 0.71), (-1.86, 0.725), (-2.02, 0.715)]
TAIL_BAR = [(0.28, 0.80), (0.64, 0.835), (0.675, 0.88), (0.64, 0.92), (0.28, 0.885)]
BELT = [(-0.80, 0.92), (0.4, 0.96), (1.5, 0.98)]

SPEC = dict(
    name="pampeiro", nose=NOSE, tail=TAIL, axle_x=AXLE_X, wheel=_WHEEL, project_wheel=True, wheel_positions=_POS,
    stations=[-2.15, -2.11, -2.01, -1.82, -1.40, COWL, ROOF_F, 0.42, 0.62, 1.30, ROOF_R, GLASS_B, 2.13],
    curves=dict(
        floor=pchip([(-2.15, 0.34), (-2.11, 0.27), (-2.01, 0.20), (-1.82, 0.17), (-1.4, 0.16), (1.6, 0.16), (1.95, 0.18), (2.06, 0.23), (2.13, 0.33)]),
        belt=pchip([(-2.15, 0.65), (-2.11, 0.73), (-2.01, 0.79), (-1.5, 0.86), (COWL, 0.92), (ROOF_F, 0.96), (1.5, 0.98), (2.0, 0.97), (2.13, 0.94)]),
        top=pchip([(-2.15, 0.66), (-2.11, 0.76), (-2.01, 0.82), (-1.5, 0.88), (COWL, 0.93), (ROOF_F, 1.56), (0.3, 1.58), (ROOF_R, 1.52), (GLASS_B, 1.00), (2.13, 0.97)]),
        hwb=pchip([(-2.15, 0.62), (-2.11, 0.76), (-2.01, 0.86), (-1.82, 0.91), (-1.5, 0.935), (-0.5, 0.945), (1.5, 0.945), (1.95, 0.925), (2.06, 0.88), (2.13, 0.74)]),
        hwl=pchip([(-2.15, 0.60), (-2.01, 0.80), (-1.8, 0.88), (-1.5, 0.91), (1.5, 0.91), (1.95, 0.87), (2.13, 0.72)]),
        hwr=pchip([(-2.15, 0.56), (-2.0, 0.72), (-1.6, 0.80), (COWL, 0.82), (ROOF_F, 0.76), (0.42, 0.79), (1.3, 0.78), (ROOF_R, 0.73), (GLASS_B, 0.78), (2.13, 0.70)]),
        bulge=pchip([(-2.15, 0.0), (-1.9, 0.008), (-1.0, 0.016), (1.0, 0.016), (1.9, 0.008), (2.13, 0.0)]),
        sill=pchip([(-2.15, 0.02), (-1.5, 0.06), (1.5, 0.06), (2.13, 0.02)]),
        belt_in=pchip([(-2.15, 0.0), (COWL, 0.012), (ROOF_F, 0.035), (ROOF_R, 0.035), (GLASS_B, 0.0), (2.13, 0.0)]),
        crown=pchip([(-2.15, 0.02), (COWL, 0.05), (ROOF_F, 0.04), (ROOF_R, 0.04), (GLASS_B, 0.02), (2.13, 0.02)]),
    ),
    crease_points={3: 1.0, 6: 1.0, 1: 0.8}, crease_stations=(COWL, ROOF_F, ROOF_R, GLASS_B), end_crease=0.7,
    cap_material_of=cap_material_of, material_of=material_of,
    exhaust=(0.42, 2.10, 0.27), seat=(0.0, 0.20, 0.95), exhaust_tip=True, windows=(COWL, GLASS_B), silhueta_portas=(-0.80, 0.52, 1.08),
    patches=[
        *lamp_stack("lamp_head", "far", HEAD, [("trim", 1.12), ("chrome", 1.05), ("reflector", 0.97), ("headlight_dim", 0.90), ("headlight", 0.50)], lod1_from=3),
        # a ponta do farol sobe pelo para-lama
        dict(end="side", group="lamp_head", name="canto0", mat="trim", axis="x", outline=HEAD_SIDE, offset=0.004, cuts=1, lod1=False),
        dict(end="side", group="lamp_head", name="canto1", mat="headlight_dim", axis="x", outline=[(y, z) for (y, z) in [(-2.00, 0.672), (-1.86, 0.664), (-1.75, 0.68), (-1.74, 0.705), (-1.86, 0.715), (-2.00, 0.708)]], offset=0.010, cuts=1, lod1=False),
        dict(group="lamp_head", name="pisca", mat="amber", outline=rounded_rect(0.64, 0.585, 0.10, 0.04, 0.01), offset=0.007, cuts=0, lod1=False),
        dict(end="rear", group="lamp_tail", name="moldura", mat="trim", outline=[(x * 1.0, z) for (x, z) in TAIL_BAR], offset=0.004, cuts=0, lod1=False),
        *lamp_stack("lamp_tail", "b", TAIL_BAR, [("taillight_dim", 0.93), ("taillight", 0.52)], end="rear", base=0.009, lod1_from=0),
        # grade baixa de uma barra só e a entrada de ar larga
        dict(group="details", name="barra", mat="trim", outline=rounded_rect(0.0, 0.43, 0.96, 0.05, 0.02), offset=0.030, mirror=False, cuts=1, lod1=False),
        dict(end="side", group="details", name="faixa", mat="stripe_b", axis="x", outline=line_strip([(-0.76, 0.52), (0.3, 0.52), (1.4, 0.58)], 0.03), offset=0.005, cuts=0, lod1=False),
        *std_details(_W, (-0.80, 0.52, 1.08), BELT, NOSE, TAIL, bf=(1.72, 0.39), br=(1.56, 0.40), flap=(1.66, 0.82)),
    ],
    misc=[
        ("espelho", "paint", (0.94, -0.62, 1.00), (0.11, 0.11, 0.095), 0.025),
        ("pedestal", "trim", (0.90, -0.64, 0.97), (0.08, 0.09, 0.035), 0.0),
        ("macaneta_f", "trim", (0.955, 0.06, 0.88), (0.03, 0.17, 0.03), 0.0),
        ("macaneta_t", "trim", (0.955, 0.88, 0.88), (0.03, 0.17, 0.03), 0.0),
    ],
)
