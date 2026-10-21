"""FORMA do casco NORMAL dos hatches nacionais (V19): a forma do herói de V18 (`hero_forma.py`) na versão barata, dentro do teto de 4.500 △ de `maxShellTriangles`.

O casco de V6c (`specs/<carro>.py`) segue uma caixa lisa e angular. Aqui ele ganha, com as MESMAS curvas de silhueta, proporção, eixos e pegada:
  1. o anel de 9 pontos do herói (`hero_forma.make_ring`): cintura abaulada, soleira recolhida, vidro com caimento, canto do teto que rola, teto abaulado;
  2. as pontas fechadas em elipse em planta (`hero_forma._closed`);
  3. a deformação suave (`hero_forma.shape_body`) sobre a pele de subdivisão nível 1: para-lamas bojudos, capô com caimento, frente e traseira abaulados, arco do teto;
  4. o piso removido (`drop_floor`): ninguém o vê e paga a forma em △.
O que é diferente do herói: subdivisão nível 1 (não 2), nenhuma estação a mais (ou uma só) e o vidro segue sendo a faixa do casco (`glass`), não painel. O herói e os `.glb` dos outros nacionais não mudam.
Só os quatro hatches (Cuiabano, Tupiniquim, Caipora, Pampeiro): os outros (sedã, micro, clássicos, pickups) seguem em V6c.
"""
import hero_forma as HF

# o que cada carro afina sobre os valores de fábrica do herói (`hero_forma.DEFAULTS`)
BASE = dict(extra_stations=lambda sp: (), nose_anchor=1.0, arch_anchor=0.5, barrel=0.026, nose_r=0.26, nose_rx=0.15, tail_r=0.30, tail_rx=0.22, tail_bulge=0.040, nose_drop=0.050)
FORMAS = {
    "cuiabano": dict(BASE),
    "tupiniquim": dict(BASE),
    "caipora": dict(BASE, crease_points={3: 0.80, 6: 0.0, 1: 0.50}),
    "pampeiro": dict(BASE, fender=0.034),  # a lataria sobre a roda já está a 0,995 m: sai da pegada (|x| ≤ 1,0) com o bojo de fábrica
}


def forma_de(nome):
    """Os parâmetros do carro, ou None se o carro não leva a forma (fica em V6c)."""
    return dict(HF.DEFAULTS, **FORMAS[nome]) if nome in FORMAS else None


def spec_com_forma(sp, F, lod):
    """O spec de V6c com o anel e as pontas do herói; o vidro segue faixa do casco (material de V6c) e o lod1 não ganha estação nenhuma."""
    F = dict(F)
    if lod == 1:
        F["extra_stations"] = lambda s: ()
    return HF.hero_spec(sp, F, sp["material_of"])


def deformar(body, sp, F):
    HF.shape_body(body, sp, F)
    HF.drop_floor(body)
