"""FORMA do casco dos heróis nacionais (V18): o que V17 deixou de fora, as superfícies com curvatura.

O casco de V6c é uma gaiola de anéis de 9 pontos por estação: lados verticais, teto com 3 cm de abaulado, vidro quase em pé e uma quina viva em cada aresta. Aqui o herói troca
três coisas, sem mexer em silhueta, proporção, eixos nem pegada (o `.glb` do carro de sempre continua valendo):
  1. o ANEL (`make_ring`): cintura abaulada e soleira recolhida, vidro com caimento e barriga, canto do teto que rola em vez de chanfrar, teto com 7 cm de abaulado transversal;
  2. a DEFORMAÇÃO (`shape_body`), em cima da malha subdividida (liso por construção): para-lamas bojudos (a lataria sai da roda), capô com caimento na ponta e abaulado, para-choques e
     tampa traseira abaulados, teto com arco longitudinal;
  3. o VIDRO (`recess_glass`): afundado na moldura (a borda do vidro entra, o miolo volta à pele) com um friso preto que o emoldura, em vez de um bloco preto colado na pele.
Tudo em metros do jogo, convenção do Blender (x à direita, frente em −Y, z para cima). Nada aqui conhece um carro de verdade: os números são de projeto.
"""
import math

import bmesh
from mathutils import Vector

import carlib as cl

# o que cada carro pode afinar; os valores de fábrica são os do Cuiabano
DEFAULTS = dict(
    barrel=0.020,        # cintura abaulada: a lataria da porta sai assim da linha reta (m)
    tuck=0.030,          # soleira recolhida (m)
    zlow=0.42,           # altura relativa (piso→cintura) do ponto da barriga
    edge_drop=0.072,     # canto do teto abaixo do centro: abaulado transversal (m)
    glass_frac=0.46,     # onde o anel do teto muda de faixa (fração do meio-teto): para-brisa
    glass_frac_rear=0.74,  # idem no vidro de trás: sobra uma coluna C larga em pintura
    bow=0.028,           # barriga do vidro lateral (m)
    fender=0.042,        # bojo do para-lama sobre a roda (m)
    fender_r=0.62,       # meia-largura do bojo ao longo do carro (m)
    hood_crown=0.032,    # o canto do capô cai em relação ao meio (m)
    nose_drop=0.040,     # a ponta do capô cai (m)
    nose_bulge=0.034,    # a frente abaulada em planta (m)
    tail_bulge=0.030,    # a traseira abaulada em planta (m)
    roof_arch=0.030,     # arco longitudinal do teto (m)
    nose_r=0.30, nose_rx=0.30,   # ponta da frente fechada em elipse: comprimento e recuo em x (m)
    tail_r=0.30, tail_rx=0.22,   # idem na traseira
    extra_stations=lambda sp: (sp["tail"] - 0.16, sp["tail"] - 0.30),  # estações a mais para a elipse da traseira
    crease_points={3: 0.80, 6: 0.15, 1: 0.50},
    station_crease=0.45,
    end_crease=0.25,
    nose_anchor=0.0,     # V19: 1 = o centro da frente fica onde estava e os cantos recuam (a caixa do carro não cresce); 0 = o centro avança (herói)
    z5_frac=0.60,        # V20: onde o ponto 5 do anel fica entre a cintura e o canto do teto (0,60 de V18; mais alto = vidro lateral maior)
    arch_anchor=0.0,     # V19: fração do arco do teto que o teto 'paga' descendo nas pontas (0 = o meio sobe o arco todo, herói; 0,5 = o topo sobe só metade)
)


def sstep(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3.0 - 2.0 * t)


def marks(sp):
    """cowl, frente do teto, fim do teto, base do vidro de trás: as estações de mesmo lugar nos dois specs."""
    if "marks" in sp:  # V20: os specs que não têm o arranjo de estações dos hatches dizem onde estão (casco_forma.MARKS)
        return sp["marks"]
    st = sp["stations"]
    return st[5], st[6], st[10], st[11]


def _w_end(sp, y, span=0.9):
    """0 nas pontas do carro, 1 a `span` m delas: a barriga some onde o casco já se fecha em planta."""
    return sstep((y - sp["nose"]) / span) * sstep((sp["tail"] - y) / span)


def make_ring(F):
    """Anel de 9 pontos do herói (a mesma convenção de `carlib.ring_points`: P0 centro do piso … P3 cintura … P6 canto do teto … P8 centro do teto)."""
    def ring(sp, y):
        c = sp["curves"]
        g = lambda k: c[k](y)
        fl, belt, top = g("floor"), g("belt"), g("top")
        hwb, hwl, hwr, bulge = g("hwb"), g("hwl"), g("hwr"), g("bulge")
        we = _w_end(sp, y)
        h = max(top - belt, 0.0)
        cab = sstep(h / 0.25)  # 0 no capô e na tampa, 1 na cabine
        zlow = fl + (belt - fl) * F["zlow"]
        z4 = belt + min(0.035, h * 0.5)
        z6 = max(top - min(F["edge_drop"] * cab + 0.035 * (1 - cab), h * 0.5), z4)
        z5 = z4 + (z6 - z4) * F["z5_frac"]
        x4 = hwb - g("belt_in")
        xr = hwr
        # fração do meio-teto em que muda de faixa: o vidro de trás deixa uma coluna C larga (a faixa 6 vira pintura), o para-brisa vai até o canto
        rear = sstep((y - marks(sp)[2] + 0.05) / 0.12)
        frac = F["glass_frac"] + (F["glass_frac_rear"] - F["glass_frac"]) * rear
        x5 = x4 + (xr - x4) * 0.50 + F["bow"] * cab
        z7 = top - (top - z6) * 0.22
        return [
            (0.0, fl),
            (hwl - F["tuck"] * we, fl + g("sill")),
            (hwl + (hwb - hwl) * 0.55 + bulge + F["barrel"] * we, zlow),
            (hwb, belt),
            (x4, z4),
            (x5, z5),
            (xr, z6),
            (xr * frac, z7),
            (0.0, top),
        ]
    return ring


def _closed(fn, nose, tail, F, k=1.0):
    """A curva de meia-largura `fn` com as pontas fechadas em elipse (em planta): o canto do para-choque deixa de ser uma quina de 4 cm e vira um raio de verdade."""
    rn, xn, rt, xt = F["nose_r"], F["nose_rx"], F["tail_r"], F["tail_rx"]
    x0n, x0t = fn(nose + rn), fn(tail - rt)

    def f(y):
        dn, dt = y - nose, tail - y
        if dn < rn:
            return max(0.3, x0n - k * xn * (1.0 - math.sqrt(max(0.0, 1.0 - ((rn - dn) / rn) ** 2))))
        if dt < rt:
            return max(0.3, x0t - k * xt * (1.0 - math.sqrt(max(0.0, 1.0 - ((rt - dt) / rt) ** 2))))
        return fn(y)
    return f


def hero_spec(sp, F, material_of):
    """O spec de V6c com o anel, as pontas fechadas em elipse, as estações a mais na traseira, os vincos e o material do herói."""
    out = dict(sp)
    out["curves"] = dict(sp["curves"])
    for k in ("hwb", "hwl", "hwr"):
        out["curves"][k] = _closed(sp["curves"][k], sp["nose"], sp["tail"], F)
    st = sorted(set(list(sp["stations"]) + list(F["extra_stations"](sp))))
    out["stations"] = st
    out["ring_points"] = make_ring(F)
    out["crease_points"] = dict(F["crease_points"])
    out["station_crease"] = F["station_crease"]
    out["end_crease"] = F["end_crease"]
    out["material_of"] = material_of
    return out


def shape_body(ob, sp, F):
    """Deformação suave sobre a pele subdividida (simétrica em x): para-lamas, capô, frente, traseira e arco do teto."""
    c = sp["curves"]
    me = ob.data
    wheels = sorted({y for (y, _s) in sp["wheel_positions"]()})
    rf = F["fender_r"]
    nose, tail = sp["nose"], sp["tail"]
    cowl, roof_f, roof_r, _gb = marks(sp)
    for v in me.vertices:
        x, y, z = v.co
        a = abs(x)
        s = 1.0 if x >= 0 else -1.0
        belt, top, fl, hwb = c["belt"](y), c["top"](y), c["floor"](y), c["hwb"](y)
        dx = dy = dz = 0.0
        # 1. para-lamas bojudos: a lataria sai da roda e volta à linha da porta; o bojo morre acima da cintura
        if a > 0.5:
            for yw in wheels:
                d = (y - yw) / rf
                if abs(d) < 1.0:
                    bump = math.cos(math.pi / 2 * d) ** 2
                    hz = sstep((z - 0.27) / 0.20) * (1.0 - sstep((z - (belt - 0.03)) / 0.16))
                    dx += s * F["fender"] * bump * hz * sstep((a - 0.5) / 0.3)
        # 2. capô: o canto cai em relação ao meio e a ponta cai (a lataria desce para o para-choque)
        if y < cowl + 0.05 and z > belt - 0.10:
            zh = sstep((z - (belt - 0.10)) / 0.08)
            rr = min(1.0, a / max(hwb, 0.3))
            dz -= F["hood_crown"] * (rr ** 2.2) * (1.0 - sstep((rr - 0.80) / 0.20)) * sstep((cowl - y) / 0.30) * zh  # o canto do para-lama (rr → 1) volta à linha da cintura
            dz -= F["nose_drop"] * (sstep((-1.30 - y) / 0.85) ** 1.5) * sstep((z - 0.55) / 0.30) * zh
        # 3. frente e traseira abaulada em planta (o para-choque deixa de ser um plano)
        rr = min(1.0, a / 0.80)
        if y < nose + 0.16:  # o para-choque é o que mais avança; o capô recua um pouco
            zr = math.exp(-(((z - 0.50) / 0.24) ** 2))
            dy -= F["nose_bulge"] * ((1.0 - rr ** 2) - F["nose_anchor"]) * zr * sstep((nose + 0.16 - y) / 0.12)
        if y > tail - 0.16:
            zr = math.exp(-(((z - 0.62) / 0.34) ** 2))
            dy += F["tail_bulge"] * (1.0 - rr ** 2) * zr * sstep((y - (tail - 0.16)) / 0.12)
        # 4. arco longitudinal do teto (só o que está no alto da cabine)
        if roof_f - 0.1 < y < roof_r + 0.1 and top - belt > 0.3:
            vv = sstep(((z - belt) / (top - belt) - 0.70) / 0.25)
            t = (y - (roof_f + roof_r) / 2) / ((roof_r - roof_f) / 2 + 0.1)
            dz += F["roof_arch"] * (max(0.0, 1.0 - t * t) - F["arch_anchor"] * sstep((1.0 - abs(t)) / 0.3)) * vv
        v.co = Vector((x + dx, y + dy, z + dz))
    me.update()


def drop_floor(ob, zmax=0.23, nz=-0.92):
    """Tira o piso (as faces viradas para baixo, perto do chão): ninguém o vê (a câmera nunca passa por baixo do carro) e são ~900 △ a menos para gastar no que se vê."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    dead = [f for f in bm.faces if f.normal.z < nz and f.calc_center_median().z < zmax]
    bmesh.ops.delete(bm, geom=dead, context="FACES_ONLY")
    bm.to_mesh(ob.data)
    ob.data.update()
    bm.free()
    return len(dead)
