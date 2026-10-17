"""Trilheiro: jipe de capô reto e largo, para-brisa em pé, teto reto, grade de barras (as nossas, verticais e grossas), faróis redondos, estepe atrás.
Medidas em metros do JOGO. Estimativas de dimensão pública: ~4,0 m x 1,75 m x 1,85 m, entre-eixos ~2,4 m (no jogo o casco do estilo `pickup` tem entre-eixos de 2,67 m).
(ITEM PARA O ADVOGADO: o desenho de farol, grade e proporção NÃO reproduz o de nenhum modelo real; ver docs/CARROS-NACIONAIS.md.) O estepe passa a traseira (pegada: |z| ≤ 2,35 m).
"""
from carlib import cap_material_of, lamp_stack, line_strip, make_material_of, pchip, rounded_rect, std_details, teardrop

NOSE, TAIL = -2.12, 2.02
FRONT_AXLE, REAR_AXLE, AXLE_X = -1.35, 1.32, 0.77
COWL, ROOF_F, ROOF_R, GLASS_B = -1.10, -0.98, 1.40, 1.62
WIN = dict(side=[(COWL, 0.30), (0.45, 1.20)])
material_of = make_material_of(COWL, ROOF_F, ROOF_R, GLASS_B, WIN["side"], black=[(0.30, 0.45)], bumper_nose=-1.9, bumper_tail=1.80)
_WHEEL = dict(r=0.43, w=0.30, arch_gap=0.05, spokes=5)
_POS = lambda: [(FRONT_AXLE, 1), (FRONT_AXLE, -1), (REAR_AXLE, 1), (REAR_AXLE, -1)]
_W = dict(wheel=_WHEEL, wheel_positions=_POS)
BELT = [(-1.1, 1.02), (0.3, 1.04), (1.5, 1.04)]
PODA = ('tampa_comb', 'tampa_comb_i', 'friso_f', 'friso_t')
BARS = [dict(group="details", name=f"barra{i}", mat="trim", outline=rounded_rect(x, 0.66, 0.045, 0.16, 0.01), offset=0.012, mirror=False, cuts=0, lod1=False) for i, x in enumerate((0.0, 0.15, 0.30))]  # as do lado negativo saem do espelho

SPEC = dict(
    name="trilheiro", nose=NOSE, tail=TAIL, axle_x=AXLE_X, wheel=_WHEEL, project_wheel=True, wheel_positions=_POS,
    stations=[-2.12, -2.08, -1.98, -1.75, -1.40, COWL, ROOF_F, 0.30, 0.45, 1.20, ROOF_R, GLASS_B, 2.02],
    curves=dict(
        floor=pchip([(-2.12, 0.40), (-2.08, 0.32), (-1.98, 0.27), (-1.75, 0.24), (-1.4, 0.23), (1.5, 0.23), (1.85, 0.25), (1.98, 0.30), (2.02, 0.38)]),
        belt=pchip([(-2.12, 0.80), (-2.08, 0.88), (-1.98, 0.94), (-1.6, 1.0), (COWL, 1.02), (0.3, 1.04), (1.5, 1.04), (2.02, 1.02)]),
        top=pchip([(-2.12, 0.86), (-2.08, 0.94), (-1.98, 1.0), (-1.6, 1.04), (COWL, 1.06), (ROOF_F, 1.76), (0.3, 1.78), (ROOF_R, 1.78), (GLASS_B, 1.20), (2.02, 1.10)]),
        hwb=pchip([(-2.12, 0.66), (-2.08, 0.80), (-1.98, 0.88), (-1.75, 0.92), (-1.4, 0.935), (1.5, 0.935), (1.85, 0.92), (1.98, 0.88), (2.02, 0.80)]),
        hwl=pchip([(-2.12, 0.62), (-1.98, 0.84), (-1.75, 0.89), (-1.4, 0.92), (1.5, 0.92), (1.98, 0.86), (2.02, 0.78)]),
        hwr=pchip([(-2.12, 0.60), (-1.98, 0.82), (-1.6, 0.86), (COWL, 0.88), (ROOF_F, 0.84), (0.3, 0.86), (ROOF_R, 0.84), (GLASS_B, 0.86), (2.02, 0.80)]),
        bulge=pchip([(-2.12, 0.0), (-1.9, 0.006), (-1.0, 0.014), (1.0, 0.014), (1.9, 0.006), (2.02, 0.0)]),
        sill=pchip([(-2.12, 0.02), (-1.5, 0.06), (1.7, 0.06), (2.02, 0.02)]),
        belt_in=pchip([(-2.12, 0.0), (COWL, 0.01), (ROOF_F, 0.02), (ROOF_R, 0.02), (GLASS_B, 0.0), (2.02, 0.0)]),
        crown=pchip([(-2.12, 0.02), (COWL, 0.02), (ROOF_F, 0.02), (ROOF_R, 0.02), (GLASS_B, 0.015), (2.02, 0.015)]),
    ),
    crease_points={3: 1.0, 6: 1.0, 1: 0.8}, crease_stations=(COWL, ROOF_F, ROOF_R, GLASS_B), end_crease=0.7,
    cap_material_of=cap_material_of, material_of=material_of,
    exhaust=(0.45, 2.05, 0.32), seat=(0.0, -0.1, 1.15), exhaust_tip=True, windows=(COWL, GLASS_B), silhueta_portas=(-0.95, 0.40, 1.10),
    # estepe na porta traseira: pneu + aro (cilindros em y; atrás do casco)
    cyls=[("tire", (0.0, 2.10, 0.98), 0.38, 0.16, "y", 14), ("rim", (0.0, 2.19, 0.98), 0.19, 0.04, "y", 10)],
    patches=[
        # faróis redondos grandes nos cantos, grade de 5 barras verticais grossas sobre fundo escuro
        *lamp_stack("lamp_head", "far", teardrop(0.60, 0.72, 0.085, 0.0, 0.0, n=14), [("trim", 1.2), ("chrome", 1.1), ("reflector", 1.0), ("headlight_dim", 0.9), ("headlight", 0.5)], lod1_from=3),
        dict(group="lamp_head", name="pisca", mat="amber", outline=rounded_rect(0.60, 0.58, 0.10, 0.04, 0.01), offset=0.007, cuts=0, lod1=False),
        dict(end="rear", group="lamp_tail", name="moldura", mat="trim", outline=rounded_rect(0.74, 0.86, 0.12, 0.30, 0.02), offset=0.004, cuts=0, lod1=False),
        *lamp_stack("lamp_tail", "v", rounded_rect(0.74, 0.86, 0.085, 0.25, 0.015), [("taillight_dim", 1.0), ("taillight", 0.5)], end="rear", base=0.009, lod1_from=0),
        dict(group="details", name="grade_fundo", mat="trim", outline=rounded_rect(0.0, 0.66, 0.74, 0.20, 0.02), offset=0.006, mirror=False, cuts=1, lod1=False),
        *BARS,
        dict(end="side", group="details", name="faixa", mat="stripe_b", axis="x", outline=line_strip([(-1.0, 0.55), (0.3, 0.55), (1.5, 0.55)], 0.04), offset=0.005, cuts=0, lod1=False),
        *std_details(_W, (-0.95, 0.40, 1.10), BELT, NOSE, TAIL, bf=(1.78, 0.46), br=(1.60, 0.46), plate_f_z=0.54, plate_r_z=0.52, zdoor=(0.34, 1.0), drop=PODA),
    ],
    misc=[
        ("espelho", "trim", (0.945, -1.00, 1.05), (0.09, 0.07, 0.18), 0.0),
        ("macaneta_f", "trim", (0.955, -0.30, 0.92), (0.03, 0.16, 0.03), 0.0),
    ],
)
