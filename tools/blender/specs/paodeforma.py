"""Pão de Forma: furgão baixo e largo de teto alto, duas janelas laterais, nariz curto e liso (sem "boca" de modelo nenhum), traseira alta e reta.
Arquétipo comum de furgão de passageiros dos anos 60-90. (ITEM PARA O ADVOGADO: o desenho do carro real que inspira o arquétipo é protegido; aqui só proporção geral e duas janelas, ver docs/CARROS-NACIONAIS.md.)

Medidas em metros do JOGO. Estimativas de dimensão pública: ~4,5 m x 1,72 m x 1,95 m, entre-eixos ~2,4 m (no jogo o casco do estilo `pickup` tem entre-eixos de 2,67 m e a pegada vai a 1,95 m de altura).
"""
from carlib import cap_material_of, lamp_stack, line_strip, make_material_of, pchip, rounded_rect, std_details

NOSE, TAIL = -2.25, 2.22
FRONT_AXLE, REAR_AXLE, AXLE_X = -1.35, 1.32, 0.77
COWL, ROOF_F, ROOF_R, GLASS_B = -1.55, -1.30, 1.85, 2.05
WIN = dict(side=[(COWL, -0.40), (-0.20, 1.45)])
material_of = make_material_of(COWL, ROOF_F, ROOF_R, GLASS_B, WIN["side"], black=[(-0.40, -0.20)], bumper_nose=-2.0, bumper_tail=2.05)
_WHEEL = dict(r=0.42, w=0.30, arch_gap=0.05, spokes=5)
_POS = lambda: [(FRONT_AXLE, 1), (FRONT_AXLE, -1), (REAR_AXLE, 1), (REAR_AXLE, -1)]
_W = dict(wheel=_WHEEL, wheel_positions=_POS)
BELT = [(-1.5, 1.05), (0.0, 1.07), (1.7, 1.07)]
PODA = ('tampa_comb', 'tampa_comb_i', 'friso_f', 'friso_t')

SPEC = dict(
    name="paodeforma", nose=NOSE, tail=TAIL, axle_x=AXLE_X, wheel=_WHEEL, project_wheel=True, wheel_positions=_POS,
    stations=[-2.25, -2.21, -2.10, -1.90, COWL, ROOF_F, -0.40, -0.20, 0.7, 1.45, ROOF_R, GLASS_B, 2.22],
    curves=dict(
        floor=pchip([(-2.25, 0.42), (-2.21, 0.34), (-2.10, 0.28), (-1.9, 0.25), (-1.4, 0.24), (1.6, 0.24), (2.0, 0.26), (2.15, 0.30), (2.22, 0.40)]),
        belt=pchip([(-2.25, 0.84), (-2.21, 0.90), (-2.10, 0.96), (COWL, 1.04), (-1.0, 1.05), (0.0, 1.07), (1.7, 1.07), (2.1, 1.05), (2.22, 1.0)]),
        top=pchip([(-2.25, 0.88), (-2.21, 0.96), (-2.10, 1.02), (-1.7, 1.06), (COWL, 1.10), (ROOF_F, 1.78), (-0.2, 1.84), (1.2, 1.86), (ROOF_R, 1.84), (GLASS_B, 1.40), (2.22, 1.10)]),
        hwb=pchip([(-2.25, 0.66), (-2.21, 0.78), (-2.10, 0.86), (-1.9, 0.91), (-1.4, 0.935), (1.6, 0.935), (2.0, 0.92), (2.15, 0.88), (2.22, 0.78)]),
        hwl=pchip([(-2.25, 0.62), (-2.1, 0.82), (-1.9, 0.88), (-1.4, 0.91), (1.6, 0.91), (2.0, 0.89), (2.22, 0.74)]),
        hwr=pchip([(-2.25, 0.58), (-2.1, 0.78), (-1.7, 0.84), (COWL, 0.86), (ROOF_F, 0.80), (0.0, 0.84), (ROOF_R, 0.82), (GLASS_B, 0.80), (2.22, 0.74)]),
        bulge=pchip([(-2.25, 0.0), (-1.9, 0.005), (-1.0, 0.012), (1.0, 0.012), (2.0, 0.005), (2.22, 0.0)]),
        sill=pchip([(-2.25, 0.02), (-1.5, 0.06), (1.8, 0.06), (2.22, 0.02)]),
        belt_in=pchip([(-2.25, 0.0), (COWL, 0.01), (ROOF_F, 0.03), (ROOF_R, 0.03), (GLASS_B, 0.0), (2.22, 0.0)]),
        crown=pchip([(-2.25, 0.02), (COWL, 0.03), (ROOF_F, 0.03), (ROOF_R, 0.03), (GLASS_B, 0.02), (2.22, 0.02)]),
    ),
    crease_points={3: 1.0, 6: 1.0, 1: 0.8}, crease_stations=(COWL, ROOF_F, ROOF_R, GLASS_B), end_crease=0.7,
    cap_material_of=cap_material_of, material_of=material_of,
    exhaust=(0.45, 2.19, 0.30), seat=(0.0, -0.8, 1.20), exhaust_tip=True, windows=(COWL, GLASS_B), silhueta_portas=(-1.45, -0.30, 1.50),
    patches=[
        # faróis retangulares grandes nos cantos do nariz liso; entrada de ar larga e baixa (sem boca característica)
        *lamp_stack("lamp_head", "far", rounded_rect(0.50, 0.84, 0.30, 0.16, 0.02), [("trim", 1.14), ("chrome", 1.06), ("reflector", 0.97), ("headlight_dim", 0.88), ("headlight", 0.46)], lod1_from=3),
        dict(group="lamp_head", name="pisca", mat="amber", outline=rounded_rect(0.50, 0.70, 0.12, 0.04, 0.01), offset=0.007, cuts=0, lod1=False),
        # lanternas altas e estreitas nos cantos da traseira
        dict(end="rear", group="lamp_tail", name="moldura", mat="trim", outline=rounded_rect(0.72, 0.90, 0.14, 0.50, 0.02), offset=0.004, cuts=0, lod1=False),
        *lamp_stack("lamp_tail", "v", rounded_rect(0.72, 0.90, 0.10, 0.44, 0.015), [("taillight_dim", 1.0), ("taillight", 0.5)], end="rear", base=0.009, lod1_from=0),
        dict(group="details", name="barra", mat="trim", outline=rounded_rect(0.0, 0.60, 0.9, 0.06, 0.02), offset=0.004, mirror=False, cuts=1, lod1=False),
        dict(end="side", group="details", name="faixa", mat="stripe_a", axis="x", outline=line_strip([(-1.5, 0.72), (0.0, 0.72), (1.7, 0.72)], 0.05), offset=0.005, cuts=0, lod1=False),
        *std_details(_W, (-1.45, -0.30, 1.50), BELT, NOSE, TAIL, bf=(1.78, 0.46), br=(1.78, 0.46), plate_f_z=0.52, plate_r_z=0.60, zdoor=(0.34, 1.02), drop=PODA),
    ],
    misc=[
        ("espelho", "paint", (0.935, -1.55, 1.18), (0.10, 0.14, 0.18), 0.02),
        ("macaneta_f", "trim", (0.945, -0.75, 0.92), (0.03, 0.17, 0.03), 0.0),
        ("macaneta_t", "trim", (0.945, 0.55, 0.92), (0.03, 0.17, 0.03), 0.0),
    ],
)
