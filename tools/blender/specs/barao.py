"""Barão: sedã médio de porta-malas alto (anos 2000): três volumes, lanterna de ponta a ponta com friso cromado, faixa lateral fina, o "carro do tio".

Medidas em metros do JOGO. Estimativas de dimensão pública: ~4,5 m x 1,75 m x 1,45 m, entre-eixos ~2,6 m (no jogo o casco do estilo `sedan` tem ~4,5 m).
"""
from carlib import cap_material_of, lamp_stack, line_strip, make_material_of, pchip, rounded_rect, std_details

NOSE, TAIL = -2.25, 2.28
FRONT_AXLE, REAR_AXLE, AXLE_X = -1.36, 1.32, 0.78
COWL, ROOF_F, ROOF_R, GLASS_B = -0.95, -0.35, 1.05, 1.70
WIN = dict(side=[(COWL, 0.35), (0.55, 1.05)])
material_of = make_material_of(COWL, ROOF_F, ROOF_R, GLASS_B, WIN["side"], black=[(0.35, 0.55)], bumper_nose=-1.92, bumper_tail=2.10)
_WHEEL = dict(r=0.40, w=0.28, arch_gap=0.05, spokes=5)
_POS = lambda: [(FRONT_AXLE, 1), (FRONT_AXLE, -1), (REAR_AXLE, 1), (REAR_AXLE, -1)]
_W = dict(wheel=_WHEEL, wheel_positions=_POS)
HEAD = rounded_rect(0.50, 0.705, 0.46, 0.125, 0.03)
TAIL_L = rounded_rect(0.46, 0.86, 0.58, 0.115, 0.03)       # lanterna longa, vai quase do centro ao canto
BELT = [(-0.95, 0.99), (0.4, 1.01), (1.7, 1.03)]

SPEC = dict(
    name="barao", nose=NOSE, tail=TAIL, axle_x=AXLE_X, wheel=_WHEEL, project_wheel=True, wheel_positions=_POS,
    stations=[-2.25, -2.21, -2.11, -1.92, -1.45, COWL, ROOF_F, 0.35, 0.55, ROOF_R, 1.38, GLASS_B, 2.0, 2.28],
    curves=dict(
        floor=pchip([(-2.25, 0.37), (-2.21, 0.29), (-2.11, 0.22), (-1.92, 0.19), (-1.5, 0.18), (1.8, 0.18), (2.1, 0.20), (2.22, 0.25), (2.28, 0.35)]),
        belt=pchip([(-2.25, 0.70), (-2.21, 0.78), (-2.11, 0.86), (-1.6, 0.94), (COWL, 0.98), (ROOF_F, 1.0), (1.4, 1.01), (2.0, 1.02), (2.28, 0.98)]),
        top=pchip([(-2.25, 0.74), (-2.21, 0.84), (-2.11, 0.90), (-1.6, 0.96), (COWL, 0.99), (ROOF_F, 1.58), (0.35, 1.60), (ROOF_R, 1.57), (1.38, 1.30), (GLASS_B, 1.05), (2.0, 1.06), (2.28, 1.0)]),
        hwb=pchip([(-2.25, 0.62), (-2.21, 0.76), (-2.11, 0.86), (-1.9, 0.91), (-1.5, 0.93), (-0.5, 0.94), (1.5, 0.94), (2.0, 0.92), (2.2, 0.86), (2.28, 0.72)]),
        hwl=pchip([(-2.25, 0.60), (-2.1, 0.80), (-1.9, 0.89), (-1.5, 0.91), (1.5, 0.91), (2.0, 0.89), (2.28, 0.70)]),
        hwr=pchip([(-2.25, 0.55), (-2.1, 0.72), (-1.6, 0.80), (COWL, 0.82), (ROOF_F, 0.76), (0.35, 0.78), (ROOF_R, 0.74), (1.38, 0.74), (GLASS_B, 0.86), (2.0, 0.86), (2.28, 0.74)]),
        bulge=pchip([(-2.25, 0.0), (-1.9, 0.008), (-1.0, 0.016), (1.0, 0.016), (2.0, 0.008), (2.28, 0.0)]),
        sill=pchip([(-2.25, 0.02), (-1.5, 0.06), (1.8, 0.06), (2.28, 0.02)]),
        belt_in=pchip([(-2.25, 0.0), (COWL, 0.01), (ROOF_F, 0.03), (ROOF_R, 0.03), (GLASS_B, 0.0), (2.28, 0.0)]),
        crown=pchip([(-2.25, 0.02), (COWL, 0.04), (ROOF_F, 0.035), (ROOF_R, 0.035), (GLASS_B, 0.025), (2.28, 0.02)]),
    ),
    crease_points={3: 1.0, 6: 1.0, 1: 0.8}, crease_stations=(COWL, ROOF_F, ROOF_R, GLASS_B), end_crease=0.7,
    cap_material_of=cap_material_of, material_of=material_of,
    exhaust=(0.50, 2.25, 0.27), seat=(0.0, 0.10, 0.95), exhaust_tip=True, windows=(COWL, GLASS_B), silhueta_portas=(-0.90, 0.45, 1.10),
    patches=[
        *lamp_stack("lamp_head", "far", HEAD, [("trim", 1.12), ("chrome", 1.05), ("reflector", 0.97), ("headlight_dim", 0.90), ("headlight", 0.50)], lod1_from=3),
        dict(group="lamp_head", name="pisca", mat="amber", outline=rounded_rect(0.66, 0.600, 0.12, 0.04, 0.01), offset=0.007, cuts=0, lod1=False),
        dict(end="rear", group="lamp_tail", name="moldura", mat="trim", outline=rounded_rect(0.46, 0.86, 0.64, 0.15, 0.03), offset=0.004, cuts=0, lod1=False),
        *lamp_stack("lamp_tail", "l", TAIL_L, [("taillight_dim", 0.96), ("taillight", 0.55)], end="rear", base=0.009, lod1_from=0),
        dict(end="rear", group="lamp_tail", name="friso", mat="chrome", outline=rounded_rect(0.0, 0.86, 0.32, 0.035, 0.012), offset=0.012, mirror=False, cuts=1, lod1=False),
        dict(group="details", name="barra", mat="trim", outline=rounded_rect(0.0, 0.66, 0.56, 0.06, 0.02), offset=0.004, mirror=False, cuts=1, lod1=False),
        dict(end="side", group="details", name="faixa", mat="stripe_a", axis="x", outline=line_strip([(-0.85, 0.62), (0.4, 0.62), (1.9, 0.64)], 0.028), offset=0.005, cuts=0, lod1=False),
        *std_details(_W, (-0.90, 0.45, 1.10), BELT, NOSE, TAIL, bf=(1.78, 0.42), br=(1.70, 0.42), flap=(1.62, 0.88), plate_r_z=0.62),
    ],
    misc=[
        ("espelho", "paint", (0.94, -0.78, 1.05), (0.10, 0.11, 0.09), 0.025),
        ("pedestal", "trim", (0.90, -0.80, 1.02), (0.08, 0.09, 0.035), 0.0),
        ("macaneta_f", "trim", (0.955, -0.20, 0.90), (0.03, 0.17, 0.03), 0.0),
        ("macaneta_t", "trim", (0.955, 0.80, 0.90), (0.03, 0.17, 0.03), 0.0),
    ],
)
