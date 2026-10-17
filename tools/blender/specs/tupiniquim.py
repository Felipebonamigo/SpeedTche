"""Tupiniquim: hatch compacto e arredondado, cintura que sobe para a coluna C, lanterna alta em "L" invertido, faróis separados e inclinados
(arquétipo: hatch compacto nacional dos anos 90-2000).

Medidas em metros do JOGO (~10% maior que o real, para caber na pegada do núcleo). Estimativas de dimensões públicas (comprimento ~3,75 m,
largura ~1,64 m, altura ~1,42 m, entre-eixos ~2,42 m). Mais arredondado e mais alto de teto que o Cuiabano, com a cintura subindo da frente para trás.
"""
from carlib import arch_flares, line_strip, cap_material_of, lamp_stack, make_material_of, pchip, rounded_rect, scaled_outline

NOSE, TAIL = -2.12, 2.14
FRONT_AXLE, REAR_AXLE, AXLE_X = -1.34, 1.38, 0.79

COWL, ROOF_F, ROOF_R, GLASS_B = -0.78, -0.12, 1.62, 2.08
WIN = dict(side=[(COWL, 0.50), (0.64, 1.32)])
material_of = make_material_of(COWL, ROOF_F, ROOF_R, GLASS_B, WIN["side"], black=[(0.50, 0.64)])

# farol em cunha: cantos arredondados, a ponta de fora sobe; fica INTEIRO na face da frente (sem dobrar o canto, que o lia como "seta")
HEAD = [(0.40, 0.640), (0.62, 0.652), (0.715, 0.668), (0.745, 0.695), (0.745, 0.735), (0.715, 0.765), (0.62, 0.77), (0.40, 0.745)]
TAIL_L = [(0.47, 0.57), (0.67, 0.57), (0.67, 0.97), (0.22, 0.97), (0.22, 0.88), (0.47, 0.88)]    # lanterna em "L" invertido

_WHEEL = dict(r=0.375, w=0.25, arch_gap=0.05, spokes=6, spoke_in=0.030, spoke_out=0.048)
SPEC_WHEEL_POS = dict(wheel=_WHEEL, wheel_positions=lambda: [(FRONT_AXLE, 1), (FRONT_AXLE, -1), (REAR_AXLE, 1), (REAR_AXLE, -1)])


SPEC = dict(
    name="tupiniquim", nose=NOSE, tail=TAIL, axle_x=AXLE_X,
    wheel=_WHEEL, project_wheel=True,
    wheel_positions=lambda: [(FRONT_AXLE, 1), (FRONT_AXLE, -1), (REAR_AXLE, 1), (REAR_AXLE, -1)],
    stations=[-2.12, -2.08, -1.99, -1.83, -1.40, COWL, ROOF_F, 0.50, 0.64, 1.32, ROOF_R, GLASS_B, 2.14],
    curves=dict(
        floor=pchip([(-2.12, 0.34), (-2.08, 0.27), (-1.99, 0.21), (-1.83, 0.18), (-1.4, 0.17), (1.6, 0.17), (1.95, 0.19), (2.07, 0.24), (2.14, 0.33)]),
        belt=pchip([(-2.12, 0.64), (-2.08, 0.71), (-1.99, 0.77), (-1.4, 0.84), (COWL, 0.88), (ROOF_F, 0.93), (0.6, 0.97), (1.6, 1.02), (2.0, 1.03), (2.14, 0.98)]),
        top=pchip([(-2.12, 0.67), (-2.08, 0.76), (-1.99, 0.82), (-1.4, 0.885), (COWL, 0.93), (ROOF_F, 1.60), (0.55, 1.64), (ROOF_R, 1.60), (GLASS_B, 1.04), (2.14, 1.00)]),
        hwb=pchip([(-2.12, 0.58), (-2.08, 0.72), (-1.99, 0.82), (-1.83, 0.885), (-1.5, 0.915), (-0.5, 0.925), (1.5, 0.925), (1.95, 0.90), (2.07, 0.84), (2.14, 0.70)]),
        hwl=pchip([(-2.12, 0.56), (-1.99, 0.76), (-1.8, 0.85), (-1.5, 0.885), (1.5, 0.885), (1.95, 0.84), (2.14, 0.68)]),
        hwr=pchip([(-2.12, 0.50), (-2.0, 0.66), (-1.5, 0.76), (COWL, 0.78), (ROOF_F, 0.69), (0.5, 0.73), (1.32, 0.72), (ROOF_R, 0.66), (GLASS_B, 0.72), (2.14, 0.66)]),
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
    exhaust=(0.42, 2.11, 0.27), seat=(0.0, 0.20, 0.95), exhaust_tip=True, windows=(COWL, GLASS_B), silhueta_portas=(-0.7, 0.5, 1.1),
    patches=[
        # farol: caixa escura, aro claro, refletor, coroa e miolo da lente
        *lamp_stack("lamp_head", "far", HEAD, [("trim", 1.14), ("chrome", 1.06), ("reflector", 0.97), ("headlight_dim", 0.90), ("headlight", 0.50)], lod1_from=3),
        dict(group="lamp_head", name="pisca", mat="amber", outline=rounded_rect(0.66, 0.595, 0.12, 0.04, 0.01), offset=0.007, cuts=0, lod1=False),
        # lanterna alta em "L" invertido: moldura, coroa e miolo; pisca âmbar embaixo
        dict(end="rear", group="lamp_tail", name="moldura", mat="trim", outline=scaled_outline(TAIL_L, 1.12), offset=0.004, cuts=0, lod1=False),
        *lamp_stack("lamp_tail", "l", TAIL_L, [("taillight_dim", 1.0), ("taillight", 0.60)], end="rear", base=0.009, lod1_from=0),
        dict(end="rear", group="lamp_tail", name="pisca", mat="amber", outline=rounded_rect(0.57, 0.62, 0.17, 0.05, 0.01), offset=0.011, cuts=0, lod1=False),
        # frente: fresta lisa, entrada de ar, placa, para-choque com volume e friso claro; traseira: para-choque, placa e vinco da tampa
        dict(group="details", name="fresta", mat="trim", outline=rounded_rect(0.0, 0.60, 0.34, 0.03, 0.01), offset=0.004, mirror=False, cuts=1, lod1=False),
        dict(group="details", name="para_choque_f", mat="bumper", outline=rounded_rect(0.0, 0.385, 1.62, 0.19, 0.05), offset=0.022, mirror=False, cuts=1, lod1=False),
        dict(group="details", name="friso_f", mat="chrome", outline=rounded_rect(0.0, 0.49, 1.46, 0.016, 0.006), offset=0.027, mirror=False, cuts=1, lod1=False),
        dict(group="details", name="entrada", mat="trim", outline=rounded_rect(0.0, 0.37, 0.80, 0.09, 0.03), offset=0.027, mirror=False, cuts=1, lod1=False),
        dict(group="details", name="placa_f", mat="plate", outline=rounded_rect(0.0, 0.45, 0.28, 0.085, 0.01), offset=0.030, mirror=False, cuts=0, lod1=False),
        dict(end="rear", group="details", name="para_choque_t", mat="bumper", outline=rounded_rect(0.0, 0.40, 1.50, 0.19, 0.05), offset=0.022, mirror=False, cuts=1, lod1=False),
        dict(end="rear", group="details", name="tampa", mat="trim", outline=rounded_rect(0.0, 0.50, 1.20, 0.012, 0.004), offset=0.005, mirror=False, cuts=1, lod1=False),
        dict(end="rear", group="details", name="placa_t", mat="plate", outline=rounded_rect(0.0, 0.60, 0.30, 0.095, 0.01), offset=0.008, mirror=False, cuts=0, lod1=False),
        # lateral: friso claro da cintura, soleira, o vinco da lataria (faixa B) até a coluna C, frisos de porta e alargamento dos para-lamas
        dict(end="side", group="details", name="cintura", mat="chrome", axis="x", outline=line_strip([(-0.70, 0.90), (0.5, 0.95), (1.5, 1.0)], 0.012), offset=0.006, cuts=0, lod1=False),
        dict(end="side", group="details", name="soleira", mat="trim", axis="x", outline=line_strip([(-0.86, 0.255), (0.0, 0.255), (0.88, 0.255)], 0.045), offset=0.012, cuts=0, lod1=False),
        dict(end="side", group="details", name="vinco", mat="stripe_b", axis="x", outline=line_strip([(-0.60, 0.50), (0.4, 0.58), (1.2, 0.70), (1.95, 0.84)], 0.034), offset=0.006, cuts=0, lod1=False),
        *[dict(end="side", group="details", name=f"porta{i}", mat="trim", axis="x", outline=[(y - 0.006, 0.32), (y + 0.006, 0.32), (y + 0.006, 0.93), (y - 0.006, 0.93)], offset=0.004, cuts=2, lod1=False) for i, y in enumerate((-0.70, 0.50, 1.10))],
        dict(end="rear", group="details", name="friso_t", mat="chrome", outline=rounded_rect(0.0, 0.507, 1.34, 0.016, 0.006), offset=0.027, mirror=False, cuts=1, lod1=False),
        dict(end="side", group="details", name="tampa_comb", mat="trim", axis="x", outline=rounded_rect(1.66, 0.84, 0.17, 0.17, 0.05, seg=4), offset=0.006, cuts=1, lod1=False),
        dict(end="side", group="details", name="tampa_comb_i", mat="chrome", axis="x", outline=rounded_rect(1.66, 0.84, 0.12, 0.12, 0.04, seg=4), offset=0.010, cuts=1, lod1=False),
        dict(end="side", group="details", name="marcador", mat="amber", axis="x", outline=rounded_rect(-1.80, 0.60, 0.10, 0.04, 0.012), offset=0.006, cuts=1, lod1=False),
        *arch_flares(SPEC_WHEEL_POS),
    ],
    misc=[
        ("espelho", "paint", (0.935, -0.52, 1.00), (0.11, 0.11, 0.095), 0.025),
        ("pedestal", "trim", (0.89, -0.54, 0.965), (0.08, 0.09, 0.035), 0.0),
        ("macaneta_f", "trim", (0.945, 0.08, 0.895), (0.03, 0.16, 0.03), 0.0),
        ("macaneta_t", "trim", (0.945, 0.88, 0.905), (0.03, 0.16, 0.03), 0.0),
    ],
)
