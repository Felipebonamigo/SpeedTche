"""Gaúcho V8: muscle de capô longo e cabine recuada, grade e para-choques cromados, quatro lanternas retangulares, dois escapes, abaulado no capô.
Arquétipo comum de "muscle car" nacional dos anos 70. (ITEM PARA O ADVOGADO: faixas, grade e lanternas deste desenho NÃO reproduzem as de nenhum modelo real; ver docs/CARROS-NACIONAIS.md.)

Medidas em metros do JOGO. Estimativas de dimensão pública: ~4,6 m x 1,75 m x 1,35 m, entre-eixos ~2,6 m (o casco do estilo `muscle` do jogo tem entre-eixos de 2,6 m).
"""
from carlib import cap_material_of, lamp_stack, line_strip, make_material_of, pchip, rounded_rect, std_details

NOSE, TAIL = -2.30, 2.30
FRONT_AXLE, REAR_AXLE, AXLE_X = -1.30, 1.30, 0.785
COWL, ROOF_F, ROOF_R, GLASS_B = -0.55, 0.12, 0.95, 1.55
WIN = dict(side=[(COWL, 0.35), (0.50, 1.00)])
material_of = make_material_of(COWL, ROOF_F, ROOF_R, GLASS_B, WIN["side"], black=[(0.35, 0.50)], bumper_nose=-2.05, bumper_tail=2.05)
_WHEEL = dict(r=0.44, w=0.32, arch_gap=0.05, spokes=5)
_POS = lambda: [(FRONT_AXLE, 1), (FRONT_AXLE, -1), (REAR_AXLE, 1), (REAR_AXLE, -1)]
_W = dict(wheel=_WHEEL, wheel_positions=_POS)
BELT = [(-0.55, 0.96), (0.5, 0.99), (1.8, 1.0)]
PODA = ('tampa_comb', 'tampa_comb_i', 'friso_f', 'friso_t')

SPEC = dict(
    name="gaucho", nose=NOSE, tail=TAIL, axle_x=AXLE_X, wheel=_WHEEL, project_wheel=True, wheel_positions=_POS,
    stations=[-2.30, -2.26, -2.15, -1.95, -1.45, -1.0, COWL, ROOF_F, 0.50, ROOF_R, GLASS_B, 1.90, 2.15, 2.30],
    curves=dict(
        floor=pchip([(-2.30, 0.36), (-2.26, 0.28), (-2.15, 0.21), (-1.95, 0.18), (-1.4, 0.16), (1.6, 0.16), (2.0, 0.19), (2.2, 0.25), (2.30, 0.34)]),
        belt=pchip([(-2.30, 0.66), (-2.26, 0.74), (-2.15, 0.82), (-1.5, 0.92), (COWL, 0.96), (0.5, 0.99), (1.8, 1.0), (2.2, 0.98), (2.30, 0.94)]),
        top=pchip([(-2.30, 0.70), (-2.26, 0.80), (-2.15, 0.88), (-1.5, 0.98), (-1.0, 1.0), (COWL, 1.0), (ROOF_F, 1.40), (0.5, 1.42), (ROOF_R, 1.38), (GLASS_B, 1.02), (1.90, 1.0), (2.30, 0.96)]),
        hwb=pchip([(-2.30, 0.64), (-2.26, 0.78), (-2.15, 0.88), (-1.9, 0.93), (-1.4, 0.945), (1.4, 0.945), (2.0, 0.93), (2.2, 0.88), (2.30, 0.76)]),
        hwl=pchip([(-2.30, 0.60), (-2.15, 0.82), (-1.9, 0.90), (-1.4, 0.92), (1.4, 0.92), (2.0, 0.89), (2.30, 0.72)]),
        hwr=pchip([(-2.30, 0.58), (-2.15, 0.80), (-1.0, 0.86), (COWL, 0.86), (ROOF_F, 0.74), (0.5, 0.76), (ROOF_R, 0.72), (GLASS_B, 0.82), (2.30, 0.78)]),
        bulge=pchip([(-2.30, 0.0), (-1.9, 0.01), (-1.3, 0.02), (1.3, 0.02), (2.0, 0.01), (2.30, 0.0)]),
        sill=pchip([(-2.30, 0.02), (-1.5, 0.06), (1.8, 0.06), (2.30, 0.02)]),
        belt_in=pchip([(-2.30, 0.0), (COWL, 0.015), (ROOF_F, 0.035), (ROOF_R, 0.035), (GLASS_B, 0.0), (2.30, 0.0)]),
        crown=pchip([(-2.30, 0.03), (-1.5, 0.08), (COWL, 0.08), (ROOF_F, 0.03), (ROOF_R, 0.03), (GLASS_B, 0.025), (2.30, 0.02)]),
    ),
    crease_points={3: 1.0, 6: 1.0, 1: 0.8}, crease_stations=(COWL, ROOF_F, ROOF_R, GLASS_B), end_crease=0.7,
    cap_material_of=cap_material_of, material_of=material_of,
    exhaust=(0.50, 2.20, 0.27), seat=(0.0, 0.20, 0.90), exhaust_tip=True, windows=(COWL, GLASS_B), silhueta_portas=(-0.45, 0.42, 1.0),
    patches=[
        # farol retangular largo, baixo e fundo (o nosso desenho), grade lisa de cromo baixa
        *lamp_stack("lamp_head", "far", rounded_rect(0.52, 0.58, 0.34, 0.10, 0.02), [("trim", 1.14), ("chrome", 1.06), ("reflector", 0.97), ("headlight_dim", 0.88), ("headlight", 0.46)], lod1_from=3),
        dict(group="lamp_head", name="pisca", mat="amber", outline=rounded_rect(0.80, 0.50, 0.10, 0.04, 0.01), offset=0.007, cuts=0, lod1=False),
        # quatro lanternas retangulares (duas por lado: uma sobre a outra)
        dict(end="rear", group="lamp_tail", name="moldura", mat="trim", outline=rounded_rect(0.54, 0.78, 0.46, 0.22, 0.02), offset=0.004, cuts=0, lod1=False),
        *lamp_stack("lamp_tail", "a", rounded_rect(0.54, 0.84, 0.40, 0.075, 0.012), [("taillight_dim", 1.0), ("taillight", 0.55)], end="rear", base=0.009, lod1_from=0),
        *lamp_stack("lamp_tail", "b", rounded_rect(0.54, 0.73, 0.40, 0.075, 0.012), [("taillight_dim", 1.0), ("taillight", 0.55)], end="rear", base=0.009, lod1_from=0),
        dict(group="details", name="grade", mat="chrome", outline=rounded_rect(0.0, 0.63, 0.62, 0.10, 0.02), offset=0.006, mirror=False, cuts=1, lod1=False),
        dict(group="details", name="grade_i", mat="trim", outline=rounded_rect(0.0, 0.63, 0.56, 0.07, 0.015), offset=0.010, mirror=False, cuts=1, lod1=False),
        dict(end="side", group="details", name="faixa", mat="stripe_a", axis="x", outline=line_strip([(-1.9, 0.55), (0.0, 0.57), (1.9, 0.57)], 0.03), offset=0.005, cuts=0, lod1=False),
        *std_details(_W, (-0.45, 0.42, 1.0), BELT, NOSE, TAIL, bf=(1.80, 0.40), br=(1.76, 0.40), plate_f_z=0.46, plate_r_z=0.58, zdoor=(0.32, 0.94), drop=PODA),
    ],
    misc=[
        ("espelho", "paint", (0.945, -0.62, 1.00), (0.10, 0.11, 0.08), 0.02),
        ("macaneta_f", "trim", (0.955, 0.0, 0.88), (0.03, 0.16, 0.03), 0.0),
        ("macaneta_t", "trim", (0.955, 0.80, 0.88), (0.03, 0.16, 0.03), 0.0),
    ],
)
