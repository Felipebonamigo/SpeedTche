"""Tupiniquim: hatch compacto e arredondado, cintura que sobe para a coluna C, lanterna alta em "L" invertido, faróis separados e inclinados
(arquétipo: hatch compacto nacional dos anos 90-2000).

Medidas em metros do JOGO (~10% maior que o real, para caber na pegada do núcleo). Estimativas de dimensões públicas (comprimento ~3,75 m,
largura ~1,64 m, altura ~1,42 m, entre-eixos ~2,42 m). Mais arredondado e mais alto de teto que o Cuiabano, com a cintura subindo da frente para trás.
"""
from carlib import cap_material_of, make_material_of, pchip, rounded_rect, scaled_outline

NOSE, TAIL = -2.12, 2.14
FRONT_AXLE, REAR_AXLE, AXLE_X = -1.34, 1.38, 0.79

COWL, ROOF_F, ROOF_R, GLASS_B = -0.82, -0.22, 1.58, 1.95
WIN = dict(side=[(COWL, 0.45), (0.58, 1.25)])
material_of = make_material_of(COWL, ROOF_F, ROOF_R, GLASS_B, WIN["side"])

HEAD = [(0.50, 0.625), (0.82, 0.66), (0.875, 0.72), (0.84, 0.775), (0.50, 0.725)]               # farol em cunha, a ponta de fora sobe
TAIL_L = [(0.68, 0.57), (0.90, 0.57), (0.90, 0.97), (0.40, 0.97), (0.40, 0.88), (0.68, 0.88)]    # lanterna em "L" invertido

SPEC = dict(
    name="tupiniquim", nose=NOSE, tail=TAIL, axle_x=AXLE_X,
    wheel=dict(r=0.36, w=0.25, arch_gap=0.05, spokes=6, spoke_in=0.022, spoke_out=0.034),
    wheel_positions=lambda: [(FRONT_AXLE, 1), (FRONT_AXLE, -1), (REAR_AXLE, 1), (REAR_AXLE, -1)],
    stations=[-2.12, -2.08, -1.99, -1.83, -1.40, COWL, ROOF_F, 0.45, 0.58, 1.25, ROOF_R, GLASS_B, 2.05, 2.11, 2.14],
    curves=dict(
        floor=pchip([(-2.12, 0.34), (-2.08, 0.27), (-1.99, 0.21), (-1.83, 0.18), (-1.4, 0.17), (1.6, 0.17), (1.95, 0.19), (2.07, 0.24), (2.14, 0.33)]),
        belt=pchip([(-2.12, 0.64), (-2.08, 0.71), (-1.99, 0.77), (-1.4, 0.84), (COWL, 0.88), (ROOF_F, 0.93), (0.6, 0.97), (1.6, 1.02), (2.0, 1.03), (2.14, 0.98)]),
        top=pchip([(-2.12, 0.67), (-2.08, 0.76), (-1.99, 0.82), (-1.4, 0.885), (COWL, 0.93), (ROOF_F, 1.54), (0.5, 1.585), (ROOF_R, 1.55), (GLASS_B, 1.04), (2.05, 1.04), (2.14, 0.99)]),
        hwb=pchip([(-2.12, 0.58), (-2.08, 0.72), (-1.99, 0.82), (-1.83, 0.885), (-1.5, 0.915), (-0.5, 0.925), (1.5, 0.925), (1.95, 0.90), (2.07, 0.84), (2.14, 0.70)]),
        hwl=pchip([(-2.12, 0.56), (-1.99, 0.76), (-1.8, 0.85), (-1.5, 0.885), (1.5, 0.885), (1.95, 0.84), (2.14, 0.68)]),
        hwr=pchip([(-2.12, 0.50), (-2.0, 0.66), (-1.5, 0.76), (COWL, 0.78), (ROOF_F, 0.69), (0.45, 0.73), (1.25, 0.72), (ROOF_R, 0.66), (GLASS_B, 0.72), (2.08, 0.74), (2.14, 0.62)]),
        bulge=pchip([(-2.12, 0.0), (-1.9, 0.01), (-1.0, 0.02), (1.0, 0.022), (1.9, 0.01), (2.14, 0.0)]),
        sill=pchip([(-2.12, 0.02), (-1.5, 0.06), (1.5, 0.06), (2.14, 0.02)]),
        belt_in=pchip([(-2.12, 0.0), (COWL, 0.015), (ROOF_F, 0.045), (ROOF_R, 0.05), (GLASS_B, 0.0), (2.14, 0.0)]),
        crown=pchip([(-2.12, 0.025), (COWL, 0.06), (ROOF_F, 0.05), (ROOF_R, 0.05), (GLASS_B, 0.03), (2.14, 0.03)]),
    ),
    crease_points={3: 1.0, 6: 1.0, 1: 0.8},
    crease_stations=(COWL, ROOF_F, ROOF_R, GLASS_B),
    end_crease=0.7,
    cap_material_of=cap_material_of,
    material_of=material_of,
    exhaust=(0.42, 2.11, 0.27), seat=(0.0, 0.20, 0.95),
    patches=[
        dict(group="lamp_head", name="moldura", mat="trim", outline=scaled_outline(HEAD, 1.16), offset=0.004, lod1=False),
        dict(group="lamp_head", name="lente", mat="headlight", outline=HEAD, offset=0.009, lod1=True),
        dict(group="lamp_head", name="pisca", mat="amber", outline=rounded_rect(0.80, 0.585, 0.12, 0.04, 0.01), offset=0.007, lod1=False),
        dict(end="rear", group="lamp_tail", name="moldura", mat="trim", outline=scaled_outline(TAIL_L, 1.12), offset=0.004, lod1=False),
        dict(end="rear", group="lamp_tail", name="lente", mat="taillight", outline=TAIL_L, offset=0.009, lod1=True),
        dict(end="rear", group="lamp_tail", name="pisca", mat="amber", outline=rounded_rect(0.79, 0.62, 0.16, 0.05, 0.01), offset=0.011, lod1=False),
        dict(group="details", name="fresta", mat="trim", outline=rounded_rect(0.0, 0.60, 0.34, 0.03, 0.01), offset=0.004, mirror=False, lod1=False),
        dict(group="details", name="entrada", mat="trim", outline=rounded_rect(0.0, 0.38, 0.80, 0.09, 0.03), offset=0.004, mirror=False, lod1=False),
        dict(group="details", name="placa_f", mat="plate", outline=rounded_rect(0.0, 0.47, 0.30, 0.09, 0.01), offset=0.006, mirror=False, lod1=False),
        dict(end="rear", group="details", name="placa_t", mat="plate", outline=rounded_rect(0.0, 0.54, 0.32, 0.10, 0.01), offset=0.006, mirror=False, lod1=False),
    ],
    misc=[
        ("espelho", "paint", (0.94, -0.50, 0.98), (0.10, 0.10, 0.085), 0.025),
        ("macaneta_f", "trim", (0.935, 0.08, 0.89), (0.02, 0.14, 0.026), 0.0),
        ("macaneta_t", "trim", (0.935, 0.88, 0.90), (0.02, 0.14, 0.026), 0.0),
    ],
)
