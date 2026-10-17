"""Furgãozinho da Firma: micro-carro quadrado e alto, com escada de alumínio no teto (bagageiro), adesivo fictício "Firma Ltda" sem logo nem marca real.

Medidas em metros do JOGO. Estimativas de dimensão pública: ~3,65 m x 1,55 m x 1,45 m, entre-eixos ~2,3 m (no jogo o casco do estilo `micro` tem ~3,3 m e o núcleo exige > 1,8 m de largura).
A escada e o bagageiro são peças próprias (`ladder`): o renderizador balança a escada nas curvas e a derruba no nitro (extras do material, sem chamada nova).
"""
from carlib import cap_material_of, lamp_stack, line_strip, make_material_of, pchip, rounded_rect, std_details

NOSE, TAIL = -1.80, 1.80
FRONT_AXLE, REAR_AXLE, AXLE_X = -1.10, 1.10, 0.78
COWL, ROOF_F, ROOF_R, GLASS_B = -0.62, -0.10, 1.42, 1.68
WIN = dict(side=[(COWL, 0.30), (0.45, 1.22)])
material_of = make_material_of(COWL, ROOF_F, ROOF_R, GLASS_B, WIN["side"], black=[(0.30, 0.45)], bumper_nose=-1.45, bumper_tail=1.70)
_WHEEL = dict(r=0.36, w=0.27, arch_gap=0.05, spokes=5)
_POS = lambda: [(FRONT_AXLE, 1), (FRONT_AXLE, -1), (REAR_AXLE, 1), (REAR_AXLE, -1)]
_W = dict(wheel=_WHEEL, wheel_positions=_POS)
BELT = [(-0.62, 0.95), (0.4, 0.97), (1.4, 0.98)]

SPEC = dict(
    name="furgao", nose=NOSE, tail=TAIL, axle_x=AXLE_X, wheel=_WHEEL, project_wheel=True, wheel_positions=_POS,
    stations=[-1.80, -1.76, -1.66, -1.45, -1.0, COWL, ROOF_F, 0.30, 0.45, 1.22, ROOF_R, GLASS_B, 1.80],
    curves=dict(
        floor=pchip([(-1.80, 0.36), (-1.76, 0.28), (-1.66, 0.22), (-1.45, 0.19), (-1.0, 0.18), (1.2, 0.18), (1.55, 0.20), (1.76, 0.26), (1.80, 0.34)]),
        belt=pchip([(-1.80, 0.68), (-1.76, 0.78), (-1.66, 0.85), (-1.0, 0.92), (COWL, 0.95), (ROOF_F, 0.97), (1.3, 0.98), (1.8, 0.95)]),
        top=pchip([(-1.80, 0.74), (-1.76, 0.84), (-1.66, 0.90), (-1.0, 0.96), (COWL, 0.98), (ROOF_F, 1.64), (0.4, 1.68), (ROOF_R, 1.66), (GLASS_B, 1.02), (1.80, 1.0)]),
        hwb=pchip([(-1.80, 0.66), (-1.76, 0.78), (-1.66, 0.87), (-1.45, 0.92), (-1.0, 0.93), (1.2, 0.93), (1.55, 0.91), (1.76, 0.85), (1.80, 0.76)]),
        hwl=pchip([(-1.80, 0.62), (-1.66, 0.82), (-1.45, 0.89), (-1.0, 0.90), (1.2, 0.90), (1.55, 0.88), (1.80, 0.72)]),
        hwr=pchip([(-1.80, 0.60), (-1.66, 0.75), (-1.0, 0.82), (COWL, 0.84), (ROOF_F, 0.80), (0.3, 0.82), (ROOF_R, 0.78), (GLASS_B, 0.80), (1.80, 0.74)]),
        bulge=pchip([(-1.80, 0.0), (-1.5, 0.006), (-1.0, 0.012), (1.2, 0.012), (1.6, 0.006), (1.80, 0.0)]),
        sill=pchip([(-1.80, 0.02), (-1.2, 0.06), (1.4, 0.06), (1.80, 0.02)]),
        belt_in=pchip([(-1.80, 0.0), (COWL, 0.01), (ROOF_F, 0.02), (ROOF_R, 0.02), (GLASS_B, 0.0), (1.80, 0.0)]),
        crown=pchip([(-1.80, 0.02), (COWL, 0.04), (ROOF_F, 0.03), (ROOF_R, 0.03), (GLASS_B, 0.02), (1.80, 0.02)]),
    ),
    crease_points={3: 1.0, 6: 1.0, 1: 0.8}, crease_stations=(COWL, ROOF_F, ROOF_R, GLASS_B), end_crease=0.7,
    cap_material_of=cap_material_of, material_of=material_of,
    exhaust=(0.42, 1.77, 0.27), seat=(0.0, 0.10, 0.95), exhaust_tip=True, windows=(COWL, GLASS_B), silhueta_portas=(-0.60, 0.42),
    # escada de alumínio sobre o bagageiro (2 longarinas + degraus), passa uns 20 cm da traseira
    ladder=dict(x=0.40, z=1.77, y=(-0.30, 2.00), rack=(-0.05, 1.20)),
    patches=[
        *lamp_stack("lamp_head", "far", rounded_rect(0.52, 0.70, 0.28, 0.12, 0.02), [("trim", 1.14), ("chrome", 1.06), ("reflector", 0.97), ("headlight_dim", 0.90), ("headlight", 0.50)], lod1_from=3),
        dict(end="rear", group="lamp_tail", name="moldura", mat="trim", outline=rounded_rect(0.62, 0.75, 0.15, 0.40, 0.025), offset=0.004, cuts=0, lod1=False),
        *lamp_stack("lamp_tail", "a", rounded_rect(0.62, 0.64, 0.10, 0.15, 0.012), [("taillight_dim", 1.0), ("taillight", 0.55)], end="rear", base=0.009, lod1_from=0),
        *lamp_stack("lamp_tail", "b", rounded_rect(0.62, 0.80, 0.10, 0.15, 0.012), [("taillight_dim", 1.0), ("taillight", 0.55)], end="rear", base=0.009, lod1_from=0),
        dict(group="details", name="barra", mat="trim", outline=rounded_rect(0.0, 0.64, 0.56, 0.05, 0.02), offset=0.004, mirror=False, cuts=1, lod1=False),
        # adesivo fictício da firma na porta: placa branca, duas linhas de "texto" e uma tarja de destaque (nenhum logo, nome ou telefone reais)
        dict(end="side", group="details", name="adesivo", mat="plate", axis="x", outline=rounded_rect(-0.05, 0.66, 0.78, 0.26, 0.02), offset=0.006, cuts=0, lod1=False),
        dict(end="side", group="details", name="adesivo_t", mat="stripe_a", axis="x", outline=rounded_rect(-0.05, 0.72, 0.62, 0.05, 0.01), offset=0.010, cuts=0, lod1=False),
        dict(end="side", group="details", name="adesivo_l", mat="stripe_b", axis="x", outline=rounded_rect(-0.12, 0.62, 0.48, 0.03, 0.006), offset=0.010, cuts=0, lod1=False),
        dict(end="side", group="details", name="adesivo_l2", mat="stripe_b", axis="x", outline=rounded_rect(-0.16, 0.57, 0.40, 0.03, 0.006), offset=0.010, cuts=0, lod1=False),
        *std_details(_W, (-0.60, 0.42), BELT, NOSE, TAIL, bf=(1.66, 0.40), br=(1.56, 0.40), flap=(1.38, 0.82), plate_r_z=0.60),
    ],
    misc=[
        ("espelho", "paint", (0.935, -0.50, 1.04), (0.10, 0.11, 0.09), 0.025),
        ("pedestal", "trim", (0.90, -0.52, 1.01), (0.08, 0.09, 0.035), 0.0),
        ("macaneta_f", "trim", (0.945, -0.20, 0.88), (0.03, 0.15, 0.03), 0.0),
    ],
)
