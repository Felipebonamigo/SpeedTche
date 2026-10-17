"""Jabuti: micro compacto quadradinho de teto reto: caixa curta e alta, farol quadrado pequeno com friso, lanterna vertical estreita, capô com vinco central, grade lisa de uma barra.
Medidas em metros do JOGO. Estimativas de dimensão pública: ~3,2 m x 1,5 m x 1,36 m, entre-eixos ~2,2 m (no jogo o casco do estilo `micro` tem 3,3 m e o núcleo exige > 1,8 m de largura).
"""
from carlib import cap_material_of, lamp_stack, line_strip, make_material_of, pchip, ridge, rounded_rect, std_details

NOSE, TAIL = -1.78, 1.78
FRONT_AXLE, REAR_AXLE, AXLE_X = -1.10, 1.10, 0.78
COWL, ROOF_F, ROOF_R, GLASS_B = -0.58, -0.14, 1.20, 1.45
WIN = dict(side=[(COWL, 0.25), (0.40, 1.20)])
material_of = make_material_of(COWL, ROOF_F, ROOF_R, GLASS_B, WIN["side"], black=[(0.25, 0.40)], bumper_nose=-1.45, bumper_tail=1.55)
_WHEEL = dict(r=0.36, w=0.27, arch_gap=0.05, spokes=5)
_POS = lambda: [(FRONT_AXLE, 1), (FRONT_AXLE, -1), (REAR_AXLE, 1), (REAR_AXLE, -1)]
_W = dict(wheel=_WHEEL, wheel_positions=_POS)
BELT = [(-0.58, 0.93), (0.3, 0.95), (1.2, 0.95)]
PODA = ('tampa_comb', 'tampa_comb_i', 'friso_t', 'soleira')

SPEC = dict(
    name="jabuti", nose=NOSE, tail=TAIL, axle_x=AXLE_X, wheel=_WHEEL, project_wheel=True, wheel_positions=_POS,
    stations=[-1.78, -1.74, -1.64, -1.45, -1.0, COWL, ROOF_F, 0.25, 0.40, ROOF_R, GLASS_B, 1.78],
    curves=dict(
        floor=pchip([(-1.78, 0.36), (-1.74, 0.28), (-1.64, 0.22), (-1.45, 0.19), (-1.0, 0.18), (1.0, 0.18), (1.5, 0.21), (1.74, 0.27), (1.78, 0.34)]),
        belt=pchip([(-1.78, 0.68), (-1.74, 0.78), (-1.64, 0.85), (-1.0, 0.91), (COWL, 0.93), (0.3, 0.95), (1.2, 0.95), (1.78, 0.93)]),
        top=pchip([(-1.78, 0.72), (-1.74, 0.82), (-1.64, 0.88), (-1.0, 0.94), (COWL, 0.96), (ROOF_F, 1.58), (0.3, 1.60), (ROOF_R, 1.58), (GLASS_B, 1.00), (1.78, 0.98)]),
        hwb=pchip([(-1.78, 0.66), (-1.74, 0.78), (-1.64, 0.87), (-1.45, 0.92), (-1.0, 0.93), (1.0, 0.93), (1.5, 0.91), (1.74, 0.85), (1.78, 0.76)]),
        hwl=pchip([(-1.78, 0.62), (-1.64, 0.82), (-1.45, 0.89), (-1.0, 0.90), (1.0, 0.90), (1.5, 0.88), (1.78, 0.72)]),
        hwr=pchip([(-1.78, 0.60), (-1.64, 0.75), (-1.0, 0.84), (COWL, 0.86), (ROOF_F, 0.82), (0.3, 0.84), (ROOF_R, 0.80), (GLASS_B, 0.82), (1.78, 0.76)]),
        bulge=pchip([(-1.78, 0.0), (-1.5, 0.006), (-1.0, 0.012), (1.0, 0.012), (1.5, 0.006), (1.78, 0.0)]),
        sill=pchip([(-1.78, 0.02), (-1.2, 0.06), (1.4, 0.06), (1.78, 0.02)]),
        belt_in=pchip([(-1.78, 0.0), (COWL, 0.01), (ROOF_F, 0.02), (ROOF_R, 0.02), (GLASS_B, 0.0), (1.78, 0.0)]),
        crown=pchip([(-1.78, 0.02), (COWL, 0.04), (ROOF_F, 0.02), (ROOF_R, 0.02), (GLASS_B, 0.02), (1.78, 0.02)]),
    ),
    crease_points={3: 1.0, 6: 1.0, 1: 0.8}, crease_stations=(COWL, ROOF_F, ROOF_R, GLASS_B), end_crease=0.7,
    cap_material_of=cap_material_of, material_of=material_of,
    exhaust=(0.40, 1.75, 0.27), seat=(0.0, 0.10, 0.92), exhaust_tip=True, windows=(COWL, GLASS_B), silhueta_portas=(-0.55, 0.32),
    patches=[
        # farol quadrado pequeno com friso (camadas: caixa, friso claro, refletor, coroa e miolo)
        *lamp_stack("lamp_head", "far", rounded_rect(0.50, 0.70, 0.22, 0.17, 0.012), [("trim", 1.16), ("chrome", 1.07), ("reflector", 0.97), ("headlight_dim", 0.88), ("headlight", 0.46)], lod1_from=3),
        dict(group="lamp_head", name="pisca", mat="amber", outline=rounded_rect(0.72, 0.60, 0.07, 0.04, 0.01), offset=0.007, cuts=0, lod1=False),
        # lanterna vertical estreita (coroa e miolo)
        dict(end="rear", group="lamp_tail", name="moldura", mat="trim", outline=rounded_rect(0.66, 0.74, 0.12, 0.34, 0.02), offset=0.004, cuts=0, lod1=False),
        *lamp_stack("lamp_tail", "v", rounded_rect(0.66, 0.74, 0.085, 0.29, 0.015), [("taillight_dim", 1.0), ("taillight", 0.5)], end="rear", base=0.009, lod1_from=0),
        # grade lisa de uma barra só, vinco central do capô (faixa fina por cima, projetada de cima) e friso de porta
        dict(group="details", name="barra", mat="trim", outline=rounded_rect(0.0, 0.66, 0.50, 0.05, 0.02), offset=0.004, mirror=False, cuts=1, lod1=False),
        dict(end="top", group="details", name="vinco", mat="trim", outline=ridge(-1.70, -0.62, 0.012, n=5), offset=0.004, mirror=False, cuts=0, lod1=False),
        dict(end="side", group="details", name="faixa", mat="stripe_a", axis="x", outline=line_strip([(-0.55, 0.50), (0.3, 0.50), (1.2, 0.50)], 0.045), offset=0.005, cuts=0, lod1=False),
        *std_details(_W, (-0.55, 0.32), BELT, NOSE, TAIL, bf=(1.66, 0.40), br=(1.56, 0.40), plate_r_z=0.60, drop=PODA),
    ],
    misc=[
        ("espelho", "paint", (0.935, -0.48, 1.02), (0.10, 0.10, 0.09), 0.025),
        ("pedestal", "trim", (0.90, -0.50, 0.99), (0.08, 0.09, 0.035), 0.0),
        ("macaneta_f", "trim", (0.945, -0.15, 0.86), (0.03, 0.15, 0.03), 0.0),
    ],
)
