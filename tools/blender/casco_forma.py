"""FORMA do casco NORMAL dos nacionais (V19 os quatro hatches; V20 os outros oito): a forma do herói de V18 (`hero_forma.py`) na versão barata, dentro do teto de 4.500 △ de `maxShellTriangles`.

O casco de V6c (`specs/<carro>.py`) segue uma caixa lisa e angular. Aqui ele ganha, com as MESMAS curvas de silhueta, proporção, eixos e pegada:
  1. o anel de 9 pontos do herói (`hero_forma.make_ring`): cintura abaulada, soleira recolhida, vidro com caimento, canto do teto que rola, teto abaulado;
  2. as pontas fechadas em elipse em planta (`hero_forma._closed`);
  3. a deformação suave (`hero_forma.shape_body`) sobre a pele de subdivisão nível 1: para-lamas bojudos, capô com caimento, frente e traseira abaulados, arco do teto;
  4. o piso removido (`drop_floor`): ninguém o vê e paga a forma em △;
  5. (V20) `arquetipo`: o que um carro tem e o hatch não: cintura recolhida entre as rodas (`waist`: o para-lama bojudo cabe na pegada), ombro traseiro (`haunch`), abaulado do capô (`hood_bulge`, o "power bulge")
     e da tampa do porta-malas (`deck_crown`).
O que é diferente do herói: subdivisão nível 1 (não 2), nenhuma estação a mais (ou uma só) e o vidro segue sendo a faixa do casco (`glass`), não painel. O herói não muda.
Parâmetros POR CARRO, não por estilo: cada arquétipo (sedã, micro, fusca, furgão, muscle, jipe, cupê) pede a forma dele (`docs/ondas/V20-forma-outros.md`).
"""
import math

import hero_forma as HF
from mathutils import Vector

# o que cada carro afina sobre os valores de fábrica do herói (`hero_forma.DEFAULTS`)
BASE = dict(extra_stations=lambda sp: (), nose_anchor=1.0, arch_anchor=0.5, barrel=0.026, nose_r=0.26, nose_rx=0.15, tail_r=0.30, tail_rx=0.22, tail_bulge=0.040, nose_drop=0.050)
# V20: cowl, frente do teto, fim do teto e base do vidro de trás dos specs que não têm o arranjo de estações dos hatches (`hero_forma.marks`)
MARKS = {
    "barao": (-0.95, -0.35, 1.05, 1.70),
    "furgao": (-0.62, -0.10, 1.42, 1.68),
    "besouro": (-1.00, -0.50, 0.95, 1.45),
    "paodeforma": (-1.55, -1.30, 1.85, 2.05),
    "gaucho": (-0.55, 0.12, 0.95, 1.55),
    "trilheiro": (-1.10, -0.98, 1.40, 1.62),
    "lambari": (-0.80, -0.20, 0.85, 1.95),
    "jabuti": (-0.58, -0.14, 1.20, 1.45),
}
FORMAS = {
    "cuiabano": dict(BASE),
    "tupiniquim": dict(BASE),
    "caipora": dict(BASE, crease_points={3: 0.80, 6: 0.0, 1: 0.50}),
    "pampeiro": dict(BASE, fender=0.034),  # a lataria sobre a roda já está a 0,995 m: sai da pegada (|x| ≤ 1,0) com o bojo de fábrica
    # V20 — os outros oito: parâmetros por arquétipo (os números finais e o porquê estão no V20)
    # sedã: ombro com vinco vivo (ponto 3 duro), teto que rola mais baixo que o do hatch, tampa do porta-malas abaulada, lateral cheia
    "barao": dict(BASE, tail_rx=0.16, crease_points={3: 1.0, 6: 0.10, 1: 0.5}, edge_drop=0.085, fender=0.030, waist=0.012, barrel=0.030, deck_crown=0.035, tail_bulge=0.030, z5_frac=0.76),
    # micro-caixa (escada no teto): cantos arredondados, teto com leve arco
    "furgao": dict(BASE, nose_drop=0.065, edge_drop=0.075, barrel=0.030, fender=0.030, waist=0.012, nose_r=0.30, nose_rx=0.20, tail_r=0.34, tail_rx=0.16, roof_arch=0.035, z5_frac=0.76),
    # fusca: para-lamas bojudos e redondos (a lataria entre as rodas entra), cúpula, capô curto arredondado, bojo atrás
    "besouro": dict(BASE, crease_points={3: 0.4, 6: 0.0, 1: 0.3}, barrel=0.026, tuck=0.035, edge_drop=0.12, roof_arch=0.04, arch_anchor=0.5, fender=0.030, waist=0.040, fender_r=0.55,
                    hood_crown=0.015, nose_drop=0.0, nose_cap=0.095, nose_cap_y0=-1.9, fender_up=0.035, nose_r=0.42, nose_rx=0.30, tail_r=0.50, tail_rx=0.22, tail_bulge=0.08, z5_frac=0.76),
    # furgão alto: cantos MUITO arredondados, teto em leve arco
    "paodeforma": dict(BASE, floor_zmax=0.31, edge_drop=0.095, roof_arch=0.04, barrel=0.024, fender=0.030, waist=0.010, nose_r=0.45, nose_rx=0.20, tail_r=0.50, tail_rx=0.14, tail_bulge=0.030, z5_frac=0.76),
    # muscle: power bulge, ombros largos (o meio entra, a roda de trás sai mais), cintura de garrafa
    "gaucho": dict(BASE, tail_rx=0.14, barrel=0.066, tuck=0.052, edge_drop=0.075, fender=0.0, waist=0.035, haunch=0.026, hood_bulge=0.025, hood_w=0.22, hood_crown=0.035, tail_bulge=0.020, z5_frac=0.76),
    # jipe: linhas retas com raio nas arestas, para-lamas expostos
    "trilheiro": dict(BASE, floor_zmax=0.30, crease_points={3: 0.9, 6: 0.0, 1: 0.6}, barrel=0.004, tuck=0.010, edge_drop=0.070, roof_arch=0.012, arch_anchor=0.0, fender=0.030, waist=0.012, hood_crown=0.010, nose_drop=0.020, nose_r=0.20, nose_rx=0.10, tail_r=0.20, tail_rx=0.06, tail_bulge=0.0, z5_frac=0.76),
    # cupê: teto que rola, cintura baixa e vidro grande
    "lambari": dict(BASE, tail_rx=0.16, hood_crown=0.010, nose_drop=0.0, nose_cap=0.06, nose_cap_y0=-1.9, hood_bulge=0.03, hood_w=0.5, fender_up=0.025, edge_drop=0.085, barrel=0.024, fender=0.030, waist=0.010, z5_frac=0.92),
    # micro-caixa quadradinha de teto reto: cantos arredondados, leve arco
    "jabuti": dict(BASE, edge_drop=0.080, barrel=0.022, fender=0.030, waist=0.010, nose_r=0.28, nose_rx=0.18, tail_r=0.32, tail_rx=0.16, roof_arch=0.035, z5_frac=0.76),
}


def forma_de(nome):
    """Os parâmetros do carro, ou None se o carro não leva a forma (fica em V6c)."""
    return dict(HF.DEFAULTS, **FORMAS[nome]) if nome in FORMAS else None


def spec_com_forma(sp, F, lod):
    """O spec de V6c com o anel e as pontas do herói; o vidro segue faixa do casco (material de V6c) e o lod1 não ganha estação nenhuma."""
    F = dict(F)
    if lod == 1:
        F["extra_stations"] = lambda s: ()
    out = HF.hero_spec(sp, F, sp["material_of"])
    if sp["name"] in MARKS:
        out["marks"] = MARKS[sp["name"]]
        out["patches"] = [_flare_cap(p, sp, F) if p["name"].startswith("flare") else _soleira_entre_rodas(p, sp) if p["name"] == "soleira" else p for p in sp["patches"]]
    return out


def _soleira_entre_rodas(p, sp):
    """V20: a soleira (`carlib.std_details`: faixa escura de 3 pontos na lateral) nascia com as pontas DENTRO dos vãos de roda; sem casco para projetar, elas colavam na borda do vão e a faixa virava um "V" escuro
    na lateral do furgão. Aqui a faixa vai só de um vão ao outro (as pontas presas à borda dos vãos mais 4 cm)."""
    ws = sorted({y for (y, _s) in sp["wheel_positions"]()})
    r = sp["wheel"]["r"] + sp["wheel"]["arch_gap"] + 0.04
    lo, hi = ws[0] + r, ws[-1] - r
    return dict(p, outline=[(min(max(a, lo), hi), z) for (a, z) in p["outline"]])


def _flare_cap(p, sp, F):
    """V20: o anel escuro do vão de roda (`carlib.arch_flares`) acaba a `flare_gap` m abaixo da cintura. Nos carros de cintura baixa o anel passava da cintura e, com o capô que cai e o para-lama que rola,
    não achava casco ao projetar: colava no capô como uma mancha preta. O anel é 13 pontos de fora + 13 de dentro (de dentro invertidos)."""
    belt = sp["curves"]["belt"](sum(y for (y, _z) in p["outline"]) / len(p["outline"]))
    cap = belt - F.get("flare_gap", 0.05)
    n = len(p["outline"]) // 2
    outer = [(y, min(z, cap)) for (y, z) in p["outline"][:n]]
    inner = [(y, min(z, cap - 0.025)) for (y, z) in p["outline"][n:]]
    return dict(p, outline=outer + inner)


def _s(t):
    return HF.sstep(t)


def arquetipo(body, sp, F):
    """V20: o que cada arquétipo pede além de `hero_forma.shape_body` (tudo opcional, 0 = nada).
    waist: m, o casco entre as rodas entra tanto (o para-lama bojudo, que cabe na pegada de 1,0 m, passa a medir bojo + waist);
    haunch: m, bojo a mais sobre a roda de trás (ombro largo) · nose_cap/nose_cap_y0: m e y onde começa a queda da ponta do capô · hood_bulge/hood_w: m e meia-largura (m) do "power bulge" do capô · deck_crown: m, abaulado da tampa do porta-malas."""
    waist = F.get("waist", 0.0)
    haunch = F.get("haunch", 0.0)
    hb, hw = F.get("hood_bulge", 0.0), F.get("hood_w", 0.26)
    dc = F.get("deck_crown", 0.0)
    nd, nd_y0 = F.get("nose_cap", 0.0), F.get("nose_cap_y0", -1.9)
    fu = F.get("fender_up", 0.0)
    if not (waist or haunch or hb or dc or nd or fu):
        return
    c = sp["curves"]
    cowl, roof_f, roof_r, glass_b = HF.marks(sp)
    wheels = sorted({y for (y, _w) in sp["wheel_positions"]()})
    rear = max(wheels)
    rf = F["fender_r"]
    me = body.data
    for v in me.vertices:
        x, y, z = v.co
        a = abs(x)
        s = 1.0 if x >= 0 else -1.0
        belt = c["belt"](y)
        dx = dz = 0.0
        if a > 0.5 and (waist or haunch):
            hz = _s((z - 0.27) / 0.20) * (1.0 - _s((z - (belt - 0.03)) / 0.16)) * _s((a - 0.5) / 0.3)
            near = 0.0
            for yw in wheels:
                d = (y - yw) / rf
                if abs(d) < 1.0:
                    near = max(near, math.cos(math.pi / 2 * d) ** 2)
            dx -= s * waist * (1.0 - near) * hz
            d = (y - rear) / (rf * 1.15)
            if abs(d) < 1.0:
                dx += s * haunch * math.cos(math.pi / 2 * d) ** 2 * hz
        if hb and y < cowl - 0.05 and z > belt - 0.04:  # o capô: um vinco largo no meio, que morre antes da ponta e antes do vidro
            ey = _s((y - (sp["nose"] + 0.55)) / 0.5) * _s((cowl - 0.05 - y) / 0.35)
            dz += hb * math.exp(-((a / hw) ** 2)) * ey * _s((z - (belt - 0.02)) / 0.05)
        if fu and a > 0.45 and z > belt - 0.12:  # o para-lama sobe sobre a roda: o vão de roda é cortado depois e, com o capô baixo e a forma arredondada, comeria a pele do para-lama (a calha escura aparecia por cima)
            near = max((math.cos(math.pi / 2 * (y - yw) / rf) ** 2 for yw in wheels if abs(y - yw) < rf), default=0.0)
            dz += fu * near * _s((a - 0.45) / 0.20) * _s((z - (belt - 0.12)) / 0.06)
        if nd and y < nd_y0 and z > belt - 0.10:  # a ponta do capô cai SÓ à frente do vão da roda (o casco de capô baixo deixaria a caixa da roda furar a lataria)
            dz -= nd * (_s((nd_y0 - y) / (nd_y0 - sp["nose"])) ** 1.5) * _s((z - 0.55) / 0.30) * _s((z - (belt - 0.10)) / 0.08)
        if dc and y > glass_b - 0.05 and z > belt - 0.05:  # a tampa do porta-malas abaulada: o meio sobe, o canto não
            ey = _s((y - (glass_b - 0.05)) / 0.25) * _s((sp["tail"] - 0.10 - y) / 0.30)
            dz += dc * max(0.0, 1.0 - (a / 0.85) ** 2) * ey * _s((z - (belt - 0.02)) / 0.05)
        v.co = Vector((x + dx, y, z + dz))
    me.update()


def deformar(body, sp, F):
    HF.shape_body(body, sp, F)
    arquetipo(body, sp, F)
    HF.drop_floor(body, zmax=F.get("floor_zmax", 0.23))  # V20: o piso do furgão e do jipe fica mais alto (0,24-0,26 m): o 0,23 dos hatches não o alcançava
