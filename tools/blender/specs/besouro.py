"""Besouro: compacto de corpo redondo, teto em cúpula e traseira que cai em curva longa, capô curto, para-lamas bojudos (anéis na cor do carro) e estribo.
Arquétipo comum de "carro bolha" dos anos 50-70; os faróis (redondos, baixos e para dentro) e a lanterna (pequena e redonda sobre a tampa do motor) são nossos.
(ITEM PARA O ADVOGADO: o desenho do carro real que inspira o arquétipo é protegido; aqui só proporção e para-lamas gerais, ver docs/CARROS-NACIONAIS.md.)

Medidas em metros do JOGO. Estimativas de dimensão pública: ~4,1 m x 1,55 m x 1,5 m, entre-eixos ~2,4 m (o casco do estilo `classic` do jogo tem entre-eixos 2,8 m: o núcleo manda).
"""
from carlib import cap_material_of, lamp_stack, line_strip, make_material_of, pchip, rounded_rect, std_details, teardrop

NOSE, TAIL = -2.12, 2.14
FRONT_AXLE, REAR_AXLE, AXLE_X = -1.40, 1.40, 0.77
COWL, ROOF_F, ROOF_R, GLASS_B = -1.00, -0.50, 0.95, 1.45
WIN = dict(side=[(COWL, 0.55)])
material_of = make_material_of(COWL, ROOF_F, ROOF_R, GLASS_B, WIN["side"], black=[(0.55, 0.65)], bumper_nose=-1.9, bumper_tail=1.95)
_WHEEL = dict(r=0.40, w=0.27, arch_gap=0.05, spokes=5)
_POS = lambda: [(FRONT_AXLE, 1), (FRONT_AXLE, -1), (REAR_AXLE, 1), (REAR_AXLE, -1)]
_W = dict(wheel=_WHEEL, wheel_positions=_POS)
BELT = [(-1.0, 0.80), (0.2, 0.84), (1.2, 0.86)]
PODA = ('tampa_comb', 'tampa_comb_i', 'friso_t')

SPEC = dict(
    name="besouro", nose=NOSE, tail=TAIL, axle_x=AXLE_X, wheel=_WHEEL, project_wheel=True, wheel_positions=_POS,
    stations=[-2.12, -2.08, -1.98, -1.75, -1.40, COWL, ROOF_F, 0.20, 0.55, 0.65, ROOF_R, GLASS_B, 1.85, 2.14],
    curves=dict(
        floor=pchip([(-2.12, 0.34), (-2.08, 0.27), (-1.98, 0.21), (-1.75, 0.18), (-1.4, 0.17), (1.4, 0.17), (1.85, 0.20), (2.04, 0.25), (2.14, 0.33)]),
        belt=pchip([(-2.12, 0.60), (-2.08, 0.68), (-1.98, 0.74), (-1.5, 0.80), (COWL, 0.82), (0.2, 0.84), (1.2, 0.86), (1.9, 0.82), (2.14, 0.76)]),
        top=pchip([(-2.12, 0.62), (-2.08, 0.72), (-1.98, 0.79), (-1.5, 0.88), (COWL, 0.98), (ROOF_F, 1.42), (0.2, 1.52), (0.8, 1.46), (ROOF_R, 1.40), (GLASS_B, 1.20), (1.85, 0.92), (2.14, 0.80)]),
        hwb=pchip([(-2.12, 0.56), (-2.08, 0.70), (-1.98, 0.80), (-1.75, 0.88), (-1.4, 0.93), (-0.4, 0.93), (0.6, 0.93), (1.4, 0.94), (1.85, 0.88), (2.05, 0.80), (2.14, 0.64)]),
        hwl=pchip([(-2.12, 0.52), (-1.98, 0.74), (-1.75, 0.85), (-1.4, 0.90), (1.4, 0.90), (1.85, 0.84), (2.14, 0.62)]),
        hwr=pchip([(-2.12, 0.50), (-2.0, 0.66), (-1.5, 0.74), (COWL, 0.76), (ROOF_F, 0.62), (0.2, 0.64), (ROOF_R, 0.58), (GLASS_B, 0.58), (1.85, 0.60), (2.14, 0.52)]),
        bulge=pchip([(-2.12, 0.0), (-1.9, 0.03), (-1.4, 0.07), (-0.9, 0.02), (0.6, 0.01), (1.0, 0.03), (1.4, 0.075), (1.9, 0.04), (2.14, 0.0)]),
        sill=pchip([(-2.12, 0.02), (-1.5, 0.07), (1.5, 0.07), (2.14, 0.02)]),
        belt_in=pchip([(-2.12, 0.0), (COWL, 0.04), (ROOF_F, 0.09), (ROOF_R, 0.09), (GLASS_B, 0.06), (2.14, 0.0)]),
        crown=pchip([(-2.12, 0.04), (COWL, 0.09), (ROOF_F, 0.10), (ROOF_R, 0.10), (GLASS_B, 0.07), (2.14, 0.05)]),
    ),
    crease_points={3: 1.0, 6: 0.6, 1: 0.8}, crease_stations=(COWL, ROOF_F), end_crease=0.7,
    cap_material_of=cap_material_of, material_of=material_of,
    exhaust=(0.38, 2.12, 0.27), seat=(0.0, 0.0, 0.92), exhaust_tip=True, windows=(COWL, GLASS_B), silhueta_portas=(-0.95, 0.55),
    patches=[
        # farol redondo, baixo e para dentro (o nosso arranjo); camadas: caixa, aro, refletor, coroa e miolo
        *lamp_stack("lamp_head", "far", teardrop(0.52, 0.62, 0.070, 0.0, 0.0, n=14), [("trim", 1.22), ("chrome", 1.12), ("reflector", 1.0), ("headlight_dim", 0.9), ("headlight", 0.5)], lod1_from=3),
        dict(group="lamp_head", name="pisca", mat="amber", outline=rounded_rect(0.80, 0.56, 0.07, 0.04, 0.01), offset=0.007, cuts=0, lod1=False),
        # lanterna: bolinha vermelha na tampa do motor (coroa e miolo) + a placa abaixo
        *lamp_stack("lamp_tail", "r", teardrop(0.60, 0.74, 0.050, 0.0, 0.0, n=12), [("trim", 1.4), ("taillight_dim", 1.0), ("taillight", 0.5)], end="rear", base=0.004, lod1_from=1),
        dict(group="details", name="barra", mat="trim", outline=rounded_rect(0.0, 0.66, 0.40, 0.04, 0.015), offset=0.004, mirror=False, cuts=1, lod1=False),
        # estribo largo e para-lamas na cor do carro (aneis bojudos)
        dict(end="side", group="details", name="estribo", mat="bumper", axis="x", outline=line_strip([(-0.95, 0.22), (0.0, 0.22), (0.98, 0.22)], 0.07), offset=0.030, cuts=0, lod1=False),
        dict(end="side", group="details", name="faixa", mat="stripe_a", axis="x", outline=line_strip([(-0.9, 0.52), (0.4, 0.52), (1.1, 0.52)], 0.025), offset=0.005, cuts=0, lod1=False),
        *std_details(_W, (-0.95, 0.55), BELT, NOSE, TAIL, bf=(1.50, 0.40), br=(1.38, 0.42), plate_f_z=0.44, plate_r_z=0.56, zdoor=(0.30, 0.78), drop=PODA, flare=dict(width=0.085, off=0.022, mat="paint")),
    ],
    misc=[
        ("espelho", "chrome", (0.90, -0.74, 0.97), (0.07, 0.07, 0.07), 0.015),
        ("macaneta_f", "chrome", (0.945, 0.05, 0.80), (0.03, 0.12, 0.03), 0.0),
    ],
)
