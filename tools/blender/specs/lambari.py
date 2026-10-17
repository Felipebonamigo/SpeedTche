"""Lambari: cupê compacto de traseira inclinada e vidro de trás grande, faróis redondos baixos e afastados, lanterna horizontal fina, para-choque de lâmina.
Medidas em metros do JOGO. Estimativas de dimensão pública: ~4,0 m x 1,57 m x 1,33 m, entre-eixos ~2,4 m (o casco do estilo `classic` tem 2,8 m de entre-eixos).
"""
from carlib import cap_material_of, lamp_stack, line_strip, make_material_of, pchip, rounded_rect, std_details, teardrop

NOSE, TAIL = -2.12, 2.14
FRONT_AXLE, REAR_AXLE, AXLE_X = -1.40, 1.40, 0.77
COWL, ROOF_F, ROOF_R, GLASS_B = -0.80, -0.20, 0.85, 1.95
WIN = dict(side=[(COWL, 0.90)])
material_of = make_material_of(COWL, ROOF_F, ROOF_R, GLASS_B, WIN["side"], black=[], bumper_nose=-1.9, bumper_tail=GLASS_B)
_WHEEL = dict(r=0.395, w=0.27, arch_gap=0.05, spokes=5)
_POS = lambda: [(FRONT_AXLE, 1), (FRONT_AXLE, -1), (REAR_AXLE, 1), (REAR_AXLE, -1)]
_W = dict(wheel=_WHEEL, wheel_positions=_POS)
BELT = [(-0.8, 0.86), (0.4, 0.89), (1.7, 0.90)]
PODA = ('tampa_comb', 'tampa_comb_i', 'friso_f', 'friso_t', 'entrada')

SPEC = dict(
    name="lambari", nose=NOSE, tail=TAIL, axle_x=AXLE_X, wheel=_WHEEL, project_wheel=True, wheel_positions=_POS,
    stations=[-2.12, -2.08, -1.98, -1.75, -1.35, COWL, ROOF_F, 0.35, ROOF_R, 1.40, GLASS_B, 2.05, 2.14],
    curves=dict(
        floor=pchip([(-2.12, 0.34), (-2.08, 0.26), (-1.98, 0.20), (-1.75, 0.17), (-1.4, 0.16), (1.4, 0.16), (1.9, 0.19), (2.05, 0.24), (2.14, 0.32)]),
        belt=pchip([(-2.12, 0.64), (-2.08, 0.71), (-1.98, 0.76), (-1.5, 0.82), (COWL, 0.86), (0.4, 0.89), (1.7, 0.90), (2.05, 0.88), (2.14, 0.84)]),
        top=pchip([(-2.12, 0.66), (-2.08, 0.75), (-1.98, 0.80), (-1.5, 0.86), (COWL, 0.90), (ROOF_F, 1.34), (0.35, 1.38), (ROOF_R, 1.34), (1.40, 1.16), (GLASS_B, 0.92), (2.05, 0.90), (2.14, 0.86)]),
        hwb=pchip([(-2.12, 0.60), (-2.08, 0.74), (-1.98, 0.84), (-1.75, 0.90), (-1.4, 0.925), (-0.5, 0.93), (1.5, 0.93), (1.95, 0.91), (2.08, 0.85), (2.14, 0.72)]),
        hwl=pchip([(-2.12, 0.58), (-1.98, 0.80), (-1.75, 0.88), (-1.4, 0.90), (1.5, 0.90), (1.95, 0.87), (2.14, 0.70)]),
        hwr=pchip([(-2.12, 0.54), (-2.0, 0.72), (-1.5, 0.80), (COWL, 0.82), (ROOF_F, 0.72), (0.35, 0.74), (ROOF_R, 0.72), (1.40, 0.70), (GLASS_B, 0.72), (2.14, 0.62)]),
        bulge=pchip([(-2.12, 0.0), (-1.9, 0.006), (-1.0, 0.014), (1.0, 0.014), (1.9, 0.006), (2.14, 0.0)]),
        sill=pchip([(-2.12, 0.02), (-1.5, 0.06), (1.5, 0.06), (2.14, 0.02)]),
        belt_in=pchip([(-2.12, 0.0), (COWL, 0.02), (ROOF_F, 0.04), (ROOF_R, 0.04), (GLASS_B, 0.0), (2.14, 0.0)]),
        crown=pchip([(-2.12, 0.02), (COWL, 0.05), (ROOF_F, 0.05), (ROOF_R, 0.05), (GLASS_B, 0.03), (2.14, 0.02)]),
    ),
    crease_points={3: 1.0, 6: 1.0, 1: 0.8}, crease_stations=(COWL, ROOF_F, ROOF_R, GLASS_B), end_crease=0.7,
    cap_material_of=cap_material_of, material_of=material_of,
    exhaust=(0.42, 2.11, 0.27), seat=(0.0, 0.0, 0.90), exhaust_tip=True, windows=(COWL, GLASS_B), silhueta_portas=(-0.70, 0.90),
    patches=[
        # faróis redondos, baixos e afastados (o outro arranjo de farol redondo do jogo: o do Besouro é mais para dentro)
        *lamp_stack("lamp_head", "far", teardrop(0.62, 0.60, 0.068, 0.0, 0.0, n=14), [("trim", 1.2), ("chrome", 1.1), ("reflector", 1.0), ("headlight_dim", 0.9), ("headlight", 0.5)], lod1_from=3),
        dict(group="lamp_head", name="pisca", mat="amber", outline=rounded_rect(0.34, 0.56, 0.10, 0.035, 0.01), offset=0.007, cuts=0, lod1=False),
        # lanterna horizontal fina, de uma ponta à outra do vidro
        dict(end="rear", group="lamp_tail", name="moldura", mat="trim", outline=rounded_rect(0.42, 0.72, 0.62, 0.075, 0.02), offset=0.004, cuts=0, lod1=False),
        *lamp_stack("lamp_tail", "h", rounded_rect(0.42, 0.72, 0.58, 0.05, 0.015), [("taillight_dim", 1.0), ("taillight", 0.55)], end="rear", base=0.009, lod1_from=0),
        dict(group="details", name="barra", mat="trim", outline=rounded_rect(0.0, 0.62, 0.50, 0.04, 0.015), offset=0.004, mirror=False, cuts=1, lod1=False),
        # para-choque de lâmina: faixa fina de cromo na frente e atrás
        dict(group="details", name="lamina_f", mat="chrome", outline=rounded_rect(0.0, 0.36, 1.66, 0.05, 0.02), offset=0.030, mirror=False, cuts=1, lod1=False),
        dict(end="rear", group="details", name="lamina_t", mat="chrome", outline=rounded_rect(0.0, 0.36, 1.56, 0.05, 0.02), offset=0.030, mirror=False, cuts=1, lod1=False),
        dict(end="side", group="details", name="faixa", mat="stripe_b", axis="x", outline=line_strip([(-0.8, 0.50), (0.4, 0.52), (1.8, 0.56)], 0.03), offset=0.005, cuts=0, lod1=False),
        *std_details(_W, (-0.70, 0.90), BELT, NOSE, TAIL, bf=(1.66, 0.44), br=(1.56, 0.44), plate_f_z=0.46, plate_r_z=0.58, drop=PODA),
    ],
    misc=[
        ("espelho", "paint", (0.93, -0.55, 0.98), (0.11, 0.10, 0.08), 0.025),
        ("pedestal", "trim", (0.89, -0.57, 0.95), (0.08, 0.09, 0.03), 0.0),
        ("macaneta_f", "trim", (0.945, 0.15, 0.82), (0.03, 0.17, 0.03), 0.0),
    ],
)
