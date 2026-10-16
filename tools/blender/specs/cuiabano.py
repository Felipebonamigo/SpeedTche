"""Cuiabano: hatch quadrado, caixa reta, teto reto, farol retangular fino, lanterna vertical (arquétipo: hatch nacional dos anos 90-2000).

Medidas em metros do JOGO (o carro do jogo é ~10% maior que o real para caber na pegada de 4,2 x 1,8 m do núcleo). Os números do arquétipo
são ESTIMATIVAS de dimensões públicas (comprimento ~3,9 m, largura ~1,65 m, altura ~1,42 m, entre-eixos ~2,47 m, balanços ~0,75/0,68 m),
ajustadas: o Cuiabano é de propósito mais largo e mais baixo que o carro real. Nada aqui é medida de um carro de fábrica.
"""
from carlib import cap_material_of, make_material_of, pchip, rounded_rect

NOSE, TAIL = -2.15, 2.13
FRONT_AXLE, REAR_AXLE, AXLE_X = -1.34, 1.38, 0.79

COWL, ROOF_F, ROOF_R, GLASS_B = -0.69, -0.08, 1.65, 2.08  # base do para-brisa, frente do teto, fim do teto, base do vidro de trás
WIN = dict(  # intervalos em y (m) da vista lateral: janelas de vidro entre colunas
    windshield=(COWL, ROOF_F), rear_glass=(ROOF_R, GLASS_B),
    side=[(COWL, 0.43), (0.65, 1.39)],  # porta da frente, janela de trás (colunas B e C entre elas)
)


material_of = make_material_of(COWL, ROOF_F, ROOF_R, GLASS_B, WIN["side"], black=[(0.43, 0.65)])


SPEC = dict(
    name="cuiabano", nose=NOSE, tail=TAIL, axle_x=AXLE_X,
    wheel=dict(r=0.36, w=0.25, arch_gap=0.05, spokes=5, spoke_in=0.040, spoke_out=0.062),
    wheel_positions=lambda: [(FRONT_AXLE, 1), (FRONT_AXLE, -1), (REAR_AXLE, 1), (REAR_AXLE, -1)],
    stations=[-2.15, -2.11, -2.02, -1.86, -1.40, COWL, ROOF_F, 0.43, 0.65, 1.39, ROOF_R, GLASS_B, 2.13],
    curves=dict(
        floor=pchip([(-2.15, 0.36), (-2.11, 0.28), (-2.02, 0.21), (-1.86, 0.18), (-1.4, 0.17), (1.6, 0.17), (1.95, 0.19), (2.06, 0.24), (2.13, 0.34)]),
        belt=pchip([(-2.15, 0.68), (-2.11, 0.76), (-2.02, 0.82), (-1.6, 0.89), (COWL, 0.94), (ROOF_F, 0.98), (1.6, 0.99), (2.0, 0.98), (2.13, 0.94)]),
        top=pchip([(-2.15, 0.72), (-2.11, 0.82), (-2.02, 0.88), (-1.6, 0.935), (COWL, 0.95), (ROOF_F, 1.56), (ROOF_R, 1.56), (GLASS_B, 1.00), (2.13, 0.97)]),
        hwb=pchip([(-2.15, 0.60), (-2.11, 0.74), (-2.02, 0.83), (-1.86, 0.89), (-1.5, 0.915), (-0.5, 0.925), (1.5, 0.925), (1.95, 0.905), (2.06, 0.86), (2.13, 0.72)]),
        hwl=pchip([(-2.15, 0.58), (-2.02, 0.78), (-1.8, 0.86), (-1.5, 0.89), (1.5, 0.89), (1.95, 0.85), (2.13, 0.70)]),
        hwr=pchip([(-2.15, 0.55), (-2.0, 0.70), (-1.6, 0.78), (COWL, 0.80), (ROOF_F, 0.745), (0.43, 0.78), (1.39, 0.76), (ROOF_R, 0.73), (GLASS_B, 0.77), (2.13, 0.70)]),
        bulge=pchip([(-2.15, 0.0), (-1.9, 0.005), (-1.0, 0.012), (1.0, 0.012), (1.9, 0.005), (2.13, 0.0)]),
        sill=pchip([(-2.15, 0.02), (-1.5, 0.06), (1.5, 0.06), (2.13, 0.02)]),
        belt_in=pchip([(-2.15, 0.0), (COWL, 0.01), (ROOF_F, 0.03), (ROOF_R, 0.03), (GLASS_B, 0.0), (2.13, 0.0)]),
        crown=pchip([(-2.15, 0.02), (COWL, 0.045), (ROOF_F, 0.03), (ROOF_R, 0.03), (GLASS_B, 0.02), (2.13, 0.02)]),
    ),
    crease_points={3: 1.0, 6: 1.0, 1: 0.8},
    crease_stations=(COWL, ROOF_F, ROOF_R, GLASS_B),
    end_crease=0.7,
    cap_material_of=cap_material_of,
    material_of=material_of,
    exhaust=(0.42, 2.10, 0.27), seat=(0.0, 0.20, 0.95),
    patches=[
        # farol retangular fino que contorna o canto; moldura escura sob a lente; pisca âmbar (o desenho é nosso, não o de nenhum carro de fábrica)
        dict(group="lamp_head", name="moldura", mat="trim", outline=rounded_rect(0.66, 0.675, 0.46, 0.155, 0.03), offset=0.004, lod1=False),
        dict(group="lamp_head", name="lente", mat="headlight", outline=rounded_rect(0.66, 0.68, 0.40, 0.105, 0.02), offset=0.009, lod1=True),
        dict(group="lamp_head", name="pisca", mat="amber", outline=rounded_rect(0.80, 0.585, 0.13, 0.045, 0.01), offset=0.007, lod1=False),
        # lanterna vertical de três cubos no canto da tampa
        dict(end="rear", group="lamp_tail", name="moldura", mat="trim", outline=rounded_rect(0.57, 0.73, 0.19, 0.40, 0.025), offset=0.004, lod1=False),
        dict(end="rear", group="lamp_tail", name="cubo_a", mat="taillight", outline=rounded_rect(0.57, 0.615, 0.15, 0.105, 0.012), offset=0.009, lod1=True),
        dict(end="rear", group="lamp_tail", name="cubo_b", mat="taillight", outline=rounded_rect(0.57, 0.735, 0.15, 0.105, 0.012), offset=0.009, lod1=True),
        dict(end="rear", group="lamp_tail", name="cubo_c", mat="amber", outline=rounded_rect(0.57, 0.855, 0.15, 0.105, 0.012), offset=0.009, lod1=False),
        # frente: barra escura lisa (sem grade de marca), entrada de ar baixa e placa; traseira: placa
        dict(group="details", name="barra", mat="trim", outline=rounded_rect(0.0, 0.64, 0.80, 0.075, 0.02), offset=0.004, mirror=False, lod1=False),
        dict(group="details", name="entrada", mat="trim", outline=rounded_rect(0.0, 0.40, 0.92, 0.10, 0.03), offset=0.004, mirror=False, lod1=False),
        dict(group="details", name="placa_f", mat="plate", outline=rounded_rect(0.0, 0.50, 0.30, 0.09, 0.01), offset=0.006, mirror=False, lod1=False),
        dict(end="rear", group="details", name="placa_t", mat="plate", outline=rounded_rect(0.0, 0.56, 0.32, 0.10, 0.01), offset=0.006, mirror=False, lod1=False),
        dict(end="side", group="details", name="porta0", mat="trim", axis="x", outline=[(-0.786,0.32),(-0.774,0.32),(-0.774,0.93),(-0.786,0.93)], offset=0.004, cuts=2, lod1=False),
        dict(end="side", group="details", name="porta1", mat="trim", axis="x", outline=[(0.454,0.32),(0.466,0.32),(0.466,0.93),(0.454,0.93)], offset=0.004, cuts=2, lod1=False),
        dict(end="side", group="details", name="porta2", mat="trim", axis="x", outline=[(1.054,0.32),(1.066,0.32),(1.066,0.93),(1.054,0.93)], offset=0.004, cuts=2, lod1=False),
    ],
    misc=[
        ("espelho", "paint", (0.94, -0.56, 1.02), (0.10, 0.10, 0.085), 0.02),
        ("macaneta_f", "trim", (0.935, 0.05, 0.86), (0.02, 0.15, 0.028), 0.0),
        ("macaneta_t", "trim", (0.935, 0.85, 0.86), (0.02, 0.15, 0.028), 0.0),
    ],
)
