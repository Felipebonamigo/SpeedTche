"""Caipora: hatch compacto de corpo redondo (anos 2000): capô alto que desce suave, teto abaulado, vidro de trás inclinado, lanterna em gota, faixa lisa no para-choque.

Medidas em metros do JOGO (~10% acima do real). Estimativas de dimensão pública: ~3,8 m x 1,65 m x 1,43 m, entre-eixos ~2,5 m. Mais redondo e mais largo no meio que o Cuiabano.
"""
from carlib import cap_material_of, lamp_stack, line_strip, make_material_of, pchip, rounded_rect, std_details, teardrop

NOSE, TAIL = -2.13, 2.15
FRONT_AXLE, REAR_AXLE, AXLE_X = -1.34, 1.38, 0.79
COWL, ROOF_F, ROOF_R, GLASS_B = -0.72, -0.10, 1.45, 2.02
WIN = dict(side=[(COWL, 0.40), (0.60, 1.30)])
material_of = make_material_of(COWL, ROOF_F, ROOF_R, GLASS_B, WIN["side"], black=[(0.40, 0.60)])
_WHEEL = dict(r=0.375, w=0.25, arch_gap=0.05, spokes=5)
_POS = lambda: [(FRONT_AXLE, 1), (FRONT_AXLE, -1), (REAR_AXLE, 1), (REAR_AXLE, -1)]
_W = dict(wheel=_WHEEL, wheel_positions=_POS)
HEAD = teardrop(0.43, 0.69, 0.072, 0.21, 0.035)             # farol grande em gota, a ponta vai para o para-lama
TAIL_DROP = teardrop(0.575, 0.66, 0.068, 0.0, 0.27)         # lanterna em gota: ponta para cima
BELT = [(-0.72, 0.93), (0.4, 0.97), (1.45, 0.98)]

SPEC = dict(
    name="caipora", nose=NOSE, tail=TAIL, axle_x=AXLE_X, wheel=_WHEEL, project_wheel=True, wheel_positions=_POS,
    stations=[-2.13, -2.09, -1.99, -1.80, -1.40, COWL, ROOF_F, 0.40, 0.60, 1.30, ROOF_R, 1.76, GLASS_B, 2.15],
    curves=dict(
        floor=pchip([(-2.13, 0.35), (-2.09, 0.28), (-1.99, 0.21), (-1.8, 0.18), (-1.4, 0.17), (1.6, 0.17), (1.95, 0.19), (2.07, 0.24), (2.15, 0.34)]),
        belt=pchip([(-2.13, 0.66), (-2.09, 0.75), (-1.99, 0.82), (-1.5, 0.89), (COWL, 0.93), (ROOF_F, 0.97), (1.5, 0.99), (2.05, 0.98), (2.15, 0.94)]),
        top=pchip([(-2.13, 0.70), (-2.09, 0.80), (-1.99, 0.87), (-1.5, 0.93), (COWL, 0.96), (ROOF_F, 1.57), (0.4, 1.62), (1.1, 1.62), (ROOF_R, 1.58), (1.76, 1.36), (GLASS_B, 1.04), (2.15, 0.98)]),
        hwb=pchip([(-2.13, 0.55), (-2.09, 0.70), (-1.99, 0.81), (-1.8, 0.88), (-1.4, 0.925), (-0.5, 0.935), (1.4, 0.935), (1.9, 0.90), (2.08, 0.82), (2.15, 0.66)]),
        hwl=pchip([(-2.13, 0.52), (-2.0, 0.74), (-1.8, 0.85), (-1.4, 0.895), (1.5, 0.895), (1.95, 0.85), (2.15, 0.66)]),
        hwr=pchip([(-2.13, 0.50), (-2.0, 0.68), (-1.5, 0.77), (COWL, 0.79), (ROOF_F, 0.66), (0.4, 0.70), (1.3, 0.69), (ROOF_R, 0.62), (GLASS_B, 0.70), (2.15, 0.60)]),
        bulge=pchip([(-2.13, 0.0), (-1.9, 0.012), (-1.0, 0.03), (1.0, 0.032), (1.9, 0.012), (2.15, 0.0)]),
        sill=pchip([(-2.13, 0.02), (-1.5, 0.06), (1.5, 0.06), (2.15, 0.02)]),
        belt_in=pchip([(-2.13, 0.0), (COWL, 0.02), (ROOF_F, 0.05), (ROOF_R, 0.055), (GLASS_B, 0.0), (2.15, 0.0)]),
        crown=pchip([(-2.13, 0.03), (COWL, 0.07), (ROOF_F, 0.07), (ROOF_R, 0.07), (GLASS_B, 0.04), (2.15, 0.03)]),
    ),
    crease_points={3: 1.0, 6: 1.0, 1: 0.8}, crease_stations=(COWL, ROOF_F, ROOF_R, GLASS_B), end_crease=0.7,
    cap_material_of=cap_material_of, material_of=material_of,
    exhaust=(0.42, 2.12, 0.27), seat=(0.0, 0.20, 0.95), exhaust_tip=True, windows=(COWL, GLASS_B), silhueta_portas=(-0.72, 0.50, 1.06),
    patches=[
        *lamp_stack("lamp_head", "far", HEAD, [("trim", 1.16), ("chrome", 1.08), ("reflector", 0.99), ("headlight_dim", 0.92), ("headlight", 0.52)], lod1_from=3, cuts=0),
        dict(group="lamp_head", name="pisca", mat="amber", outline=rounded_rect(0.62, 0.585, 0.10, 0.04, 0.01), offset=0.007, cuts=0, lod1=False),
        dict(end="rear", group="lamp_tail", name="moldura", mat="trim", outline=teardrop(0.575, 0.66, 0.068, 0.0, 0.27)[:], offset=0.004, cuts=0, lod1=False),
        *lamp_stack("lamp_tail", "g", TAIL_DROP, [("taillight_dim", 0.93), ("taillight", 0.52)], end="rear", base=0.009, lod1_from=0),
        dict(end="rear", group="lamp_tail", name="pisca", mat="amber", outline=rounded_rect(0.575, 0.52, 0.10, 0.04, 0.01), offset=0.011, cuts=0, lod1=False),
        dict(group="details", name="grade", mat="trim", outline=rounded_rect(0.0, 0.64, 0.5, 0.05, 0.02), offset=0.004, mirror=False, cuts=1, lod1=False),
        # faixa lisa no para-choque (na cor de destaque)
        dict(group="details", name="faixa_f", mat="stripe_a", outline=rounded_rect(0.0, 0.43, 1.30, 0.05, 0.02), offset=0.030, mirror=False, cuts=1, lod1=False),
        dict(end="rear", group="details", name="faixa_t", mat="stripe_a", outline=rounded_rect(0.0, 0.43, 1.20, 0.05, 0.02), offset=0.030, mirror=False, cuts=1, lod1=False),
        *std_details(_W, (-0.72, 0.50, 1.06), BELT, NOSE, TAIL, bf=(1.66, 0.40), br=(1.50, 0.40), flap=(1.62, 0.80)),
    ],
    misc=[
        ("espelho", "paint", (0.935, -0.52, 1.03), (0.11, 0.11, 0.095), 0.025),
        ("pedestal", "trim", (0.89, -0.54, 0.99), (0.08, 0.09, 0.035), 0.0),
        ("macaneta_f", "trim", (0.945, 0.05, 0.865), (0.03, 0.17, 0.03), 0.0),
        ("macaneta_t", "trim", (0.945, 0.85, 0.865), (0.03, 0.17, 0.03), 0.0),
    ],
)
