"""Falcão GT HERÓI (V9): o casco de alta definição do GT, feito no Blender por script (bpy) e exportado em `src/assets/cars/hero/gt.glb`.

O casco nasce da GAIOLA do GT de sempre (`hero/gt-gaiola.json`, exportada de `src/render/cars/hull.ts` por `hero/exportar-gaiola-gt.ts`): mesmos eixos,
pegada e alturas, só que como superfície de subdivisão de verdade (normais suaves no jogo, vincos onde há quina real). Em cima dele: cabine com
vidro de caimento, traseira legível (lanternas de LED com lente, colmeia, difusor com aletas, escapes duplos, placa lisa, asa com suportes), frente
(faróis de projetor embutidos, entradas de ar, divisor) e lados (frestas de porta e de capô, maçanetas embutidas, retrovisores).
Os MESMOS nomes de nó e de material do GT (`paint`, `stripe_a`, `stripe_b`, `accent`, `glass`, `headlight*`, `taillight*`...): o jogo aplica tinta, faixa,
roda, chama e verniz como no GT de sempre. Sem logo nem emblema de marca. Convenção do Blender (carlib.py): x à direita, FRENTE EM −Y, z para cima.

Uso:  /home/user/venv-bpy/bin/python -I tools/blender/build_hero_gt.py <saida.glb> [--preview <pasta> --views a,b]
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy  # noqa: E402
import bmesh  # noqa: E402
import carlib as cl  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

CAGE = json.load(open(os.path.join(HERE, "hero", "gt-gaiola.json")))
AXLES = CAGE["axles"]
RING = 26
# Configuração do que muda de estilo para estilo (o GT é o padrão; `use_cage` troca): raio da borda do teto da cabine, vãos de vidro (0 = para-brisa, 2 = vidro de trás) e a abertura do cockpit.
CFG = {"edge": 0.1, "roof_glass_gaps": (0, 2), "pit": None, "belt_paint_gaps": (), "arch_trim": False}


def use_cage(path):
    """Troca a gaiola (outro estilo): os globais que as funções leem em tempo de chamada. O GT é o padrão do módulo; os outros estilos entram por `build_hero.py`."""
    global CAGE, AXLES, C0, C3
    CAGE = json.load(open(path))
    AXLES = CAGE["axles"]
    if CAGE.get("cabin"):
        C0, C3 = CAGE["cabin"][0]["z"], CAGE["cabin"][-1]["z"]
    else:
        C0, C3 = 99.0, 99.0  # sem cabine (roadster): nenhum "debaixo da cabine"
    CFG["pit"] = CAGE.get("pit")
    CFG["edge"] = CAGE.get("edge") or 0.1


# ───────────────────────────── materiais (os pincéis de `src/render/cars/paints.ts`, em cor linear) ─────────────────────────────
def lin(hexcolor):
    """sRGB em hex → linear (o three converte assim o hex dos pincéis)."""
    h = hexcolor.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


# nome: (cor linear, metal, rugosidade, emissivo)
HERO_MATERIALS = {
    "paint": ((1.0, 1.0, 1.0), 0.04, 0.40, None),
    "stripe_a": ((1.0, 1.0, 1.0), 0.04, 0.40, None),
    "stripe_b": ((1.0, 1.0, 1.0), 0.04, 0.40, None),
    "accent": ((1.0, 1.0, 1.0), 0.04, 0.40, None),
    "glass": (lin("#080a0e"), 0.90, 0.04, None),
    "glint": (lin("#9fb2c6"), 1.0, 0.05, None),
    "trim": (lin("#17181b"), 0.0, 0.72, None),
    "trim_soft": (lin("#2a2c31"), 0.0, 0.60, None),
    "under": (lin("#0c0d0f"), 0.0, 0.95, None),
    "piano": (lin("#0f1013"), 0.30, 0.22, None),
    "carbon": (lin("#1d1f24"), 0.35, 0.38, None),
    "chrome": (lin("#e2e6ec"), 1.0, 0.12, None),
    "metal": (lin("#b9bec6"), 0.9, 0.34, None),
    "gunmetal": (lin("#4a4e57"), 0.85, 0.32, None),
    "housing": (lin("#3a3f48"), 0.8, 0.20, None),
    "reflector": (lin("#c9ced6"), 0.7, 0.25, None),
    "headlight": (lin("#fff6e0"), 0.0, 0.15, 1.0),
    "headlight_dim": (lin("#fff6e0"), 0.0, 0.15, 0.45),
    "taillight": (lin("#ff2616"), 0.0, 0.18, 1.0),
    "taillight_dim": (lin("#ff2616"), 0.0, 0.18, 0.40),
    "tail_well": (lin("#3d0a08"), 0.0, 0.35, None),
    "amber": (lin("#ff9418"), 0.1, 0.15, None),
    "lens_clear": (lin("#d9dde3"), 0.35, 0.12, None),
    "plate": (lin("#bdb9aa"), 0.0, 0.55, None),
    "interior": (lin("#23252a"), 0.0, 0.85, None),
    # V15 (os outros estilos): bancos, número do protótipo, grade fosca, e a tampa dos faróis escamoteáveis da cunha (o "popup" no nome sobe com o farol à noite)
    "seat": (lin("#3a2d27"), 0.0, 0.80, None),
    "white": (lin("#f3f3f0"), 0.0, 0.40, None),
    "grille": (lin("#101114"), 0.0, 0.80, None),
    "paint_popup": ((1.0, 1.0, 1.0), 0.04, 0.40, None),
    "trim_popup": (lin("#17181b"), 0.0, 0.72, None),
    "headlight_popup": (lin("#fff6e0"), 0.0, 0.15, 1.0),
    "glass_dark": (lin("#1b2638"), 0.90, 0.05, None),
    "headlight_amber": (lin("#ffa51f"), 0.0, 0.20, 0.45),
    "headlight_dim_popup": (lin("#fff6e0"), 0.0, 0.15, 0.45),
    # roda do projeto (só dá posição e tamanho; carlib.build_wheel usa estes)
    "tire": (lin("#141416"), 0.0, 0.94, None),
    "rim": (lin("#b9bec6"), 0.9, 0.34, None),
    "hub": (lin("#2a2c31"), 0.3, 0.5, None),
}
cl.MATERIALS.update(HERO_MATERIALS)

SUBDIV = 1          # nível de subdivisão do casco (a gaiola já é fina)
CABIN_SUBDIV = 1


# ───────────────────────────── utilidades ─────────────────────────────
def v3(x, y, z):
    return Vector((x, y, z))


def obj_from(name, bm, mats, parent=None):
    return cl.new_object(name, bm, mats, parent)


def join(objs, name, parent=None):
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    if len(objs) > 1:
        cl.select_only(objs[0])
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active if len(objs) > 1 else objs[0]
    ob.name = name
    ob.data.name = name
    ob.parent = parent
    return ob


class Mats:
    """Lista de materiais de um objeto em construção: nome → índice."""

    def __init__(self):
        self.names = []

    def i(self, n):
        if n not in self.names:
            self.names.append(n)
        return self.names.index(n)


def surface_tree(objs):
    """BVH da pele já subdividida (casco + cabine), onde as peças assentam."""
    bm = bmesh.new()
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in objs:
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        bm.from_mesh(me)
        ev.to_mesh_clear()
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    return tree


def bvh_of(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.transform(ob.matrix_world)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    ev.to_mesh_clear()
    return tree


def drop(tree, x, y, z0=3.0, z1=-1.0):
    """Raio vertical de cima: (x, y, z, normal) da pele em (x, y), ou None."""
    hit = tree.ray_cast(v3(x, y, z0), v3(0, 0, -1), z0 - z1)
    return hit if hit[0] is not None else None


def behind(tree, x, z, y0=4.0):
    """Raio horizontal de trás (+y): o ponto da pele em (x, z) olhando do traseiro."""
    hit = tree.ray_cast(v3(x, y0, z), v3(0, -1, 0), 8.0)
    return hit if hit[0] is not None else None


def front(tree, x, z, y0=-4.0):
    hit = tree.ray_cast(v3(x, y0, z), v3(0, 1, 0), 8.0)
    return hit if hit[0] is not None else None


def side(tree, y, z, sd=1, x0=3.0):
    """Raio horizontal de fora (lado sd) para o centro."""
    hit = tree.ray_cast(v3(sd * x0, y, z), v3(-sd, 0, 0), 6.0)
    return hit if hit[0] is not None else None


# ───────────────────────────── o casco, da gaiola ─────────────────────────────
# região de cada lado do anel (o do Hull sem o topo fino): 0 under, 1-2 well, 3 sill, 4-5 lower, 6 band, 7-8 upper, 9 shoulder, 10 top, 11 stripe, 12 center
REGION = ["under", "well", "well", "sill", "lower", "lower", "band", "upper", "upper", "shoulder", "top", "stripe", "center"]
MAT_OF_REGION = {"under": "under", "well": "under", "sill": "trim", "lower": "paint", "band": "stripe_b", "upper": "paint", "shoulder": "paint", "top": "paint",
                 "stripe": "stripe_a", "center": "paint"}
C0, C3 = CAGE["cabin"][0]["z"], CAGE["cabin"][-1]["z"]


def build_body():
    bm = bmesh.new()
    mats = Mats()
    cache = {}

    def V(x, y, z):
        k = (round(x * 1e5), round(y * 1e5), round(z * 1e5))
        v = cache.get(k)
        if v is None:
            v = cache[k] = bm.verts.new((x, y, z))
        return v

    st = CAGE["stations"]
    rings = [[V(x, s["z"], y) for (x, y) in s["ring"]] for s in st]
    for i in range(len(st) - 1):
        zc = (st[i]["z"] + st[i + 1]["z"]) / 2
        for j in range(RING):
            a, b = rings[i][j], rings[i][(j + 1) % RING]
            c, d = rings[i + 1][(j + 1) % RING], rings[i + 1][j]
            vs = []
            for v in (a, d, c, b):  # mesma ordem de carlib.build_shell
                if v not in vs:
                    vs.append(v)
            if len(vs) < 3:
                continue
            e = j if j < 13 else RING - 1 - j
            region = REGION[e]
            m = MAT_OF_REGION[region]
            if region in ("top", "stripe", "center") and C0 + 0.02 < zc < C3 - 0.02:
                m = "interior"  # debaixo da cabine: o vão do vidro mostra o interior escuro, não pintura
            if CFG["pit"] and region in ("top", "stripe", "center") and CFG["pit"][0] < zc < CFG["pit"][1]:
                continue  # cockpit aberto (roadster): sem as faces de cima entre as portas
            if CFG["arch_trim"] and region in ("sill", "lower") and st[i]["archY"] is not None and st[i + 1]["archY"] is not None:
                m = "trim"  # a borda preta do arco (os para-lamas em caixa do carro de rali)
            try:
                f = bm.faces.new(vs)
            except ValueError:
                continue
            f.material_index = mats.i(m)
    for ring in (rings[0], rings[-1]):  # as duas pontas fecham em tampa (o anel repete pontos nas pontas: sem repetição, senão a face não nasce)
        vs = []
        for v in ring:
            if v not in vs:
                vs.append(v)
        f = bm.faces.new(vs)
        f.material_index = mats.i("paint")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # vincos
    crease = bm.edges.layers.float.get("crease_edge") or bm.edges.layers.float.new("crease_edge")
    index = {}
    for si, ring in enumerate(rings):
        for j, v in enumerate(ring):
            index.setdefault(v.index, []).append((si, j))

    def set_crease(e, val):
        e[crease] = max(e[crease], val)

    for e in bm.edges:
        a, b = e.verts
        for (s0, j0) in index.get(a.index, []):
            for (s1, j1) in index.get(b.index, []):
                if j0 == j1 and abs(s0 - s1) == 1:  # longitudinal
                    pj = j0 if j0 <= 13 else RING - j0  # espelhado: o ponto p do lado direito
                    if pj in (7,):
                        set_crease(e, 1.0)   # o vinco da cintura
                    elif pj in (3, 2):
                        set_crease(e, 1.0)   # a quina da soleira e o teto do vão de roda
                    elif pj in (1,):
                        set_crease(e, 0.8)
    for e in bm.edges:  # a boca das duas pontas
        if all(len(index.get(v.index, [])) and (index[v.index][0][0] in (0, len(st) - 1)) for v in e.verts) and e.verts[0].co.y == e.verts[1].co.y:
            set_crease(e, 0.5)
    ob = obj_from("body", bm, mats.names)
    cl.subsurf(ob, SUBDIV)
    relax(ob)
    return ob


RELAX_ITERS = 2
RELAX_LAMBDA, RELAX_MU = 0.45, -0.47


def relax(ob):
    """Alisa os ângulos que o polígono da gaiola deixa na silhueta (os quadris, a cauda, o focinho): suavização de Taubin (encolhe e desencolhe, o volume fica) só
    nos vértices FORA dos vincos (cintura, soleira, boca do vão de roda) e das pontas do casco; a posição das arestas vivas não muda."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    crease = bm.edges.layers.float.get("crease_edge")
    pinned = set()
    for e in bm.edges:
        if (crease is not None and e[crease] > 0.3) or e.is_boundary or not e.is_manifold:
            pinned.update(v.index for v in e.verts)
    # a boca do vão de roda e o seu entorno (os pneus têm de continuar de fora) e as duas tampas das pontas
    for v in bm.verts:
        co = v.co
        for a in AXLES:
            if abs(co.y - a["z"]) < a["r"] + 0.25 and abs(co.x) < a["x"] + a["w"] / 2 + 0.2 and co.z < a["r"] * 2 + 0.2:
                pinned.add(v.index)
        if co.y < CAGE["zFront"] + 0.03 or co.y > CAGE["zBack"] - 0.03:  # as duas pontas do casco (±2,17 no GT; o carro de rali é mais curto)
            pinned.add(v.index)
    free = [v for v in bm.verts if v.index not in pinned]
    for it in range(RELAX_ITERS):
        for lam in (RELAX_LAMBDA, RELAX_MU):
            new = {}
            for v in free:
                nb = [e.other_vert(v).co for e in v.link_edges]
                if not nb:
                    continue
                avg = sum(nb, Vector((0, 0, 0))) / len(nb)
                new[v.index] = v.co + (avg - v.co) * lam
            for v in free:
                if v.index in new:
                    v.co = new[v.index]
    # a simetria em x continua exata (a conta é simétrica; limpa o resíduo de ponto flutuante)
    bm.to_mesh(ob.data)
    bm.free()


# ───────────────────────────── a cabine (loft de seções, vidro entre as colunas) ─────────────────────────────
def cabin_sections(bend=0.1):
    ks = CAGE["cabin"]

    def lerp(a, b, t):
        return {k: a[k] + (b[k] - a[k]) * t for k in ("z", "hwb", "yb", "hwt", "yt", "crown")}
    secs = [ks[0]]
    gaps = []
    for i in range(1, len(ks) - 1):
        p, s, n = ks[i - 1], ks[i], ks[i + 1]
        fa = min(0.3, bend / max(1e-6, s["z"] - p["z"]))
        fb = min(0.3, bend / max(1e-6, n["z"] - s["z"]))
        A = lerp(s, p, fa)
        B = lerp(s, n, fb)
        M = lerp(lerp(A, s, 0.5), lerp(s, B, 0.5), 0.5)
        g = i if i < 2 else i - 1
        gaps += [i - 1, g, g]
        secs += [A, M, B]
    gaps.append(len(ks) - 2)
    secs.append(ks[-1])
    return secs, gaps


def cabin_ring(s):
    """Metade direita do anel da cabine: base, friso da cintura, alto do vidro, arco da borda do teto, e as faixas do teto (8 pontos com o centro)."""
    sx1r, sx2r = CAGE["stripeA"][1], CAGE["stripeA"][0]
    edge = CFG["edge"]
    c = s["crown"] if s["crown"] else 0.03
    sx1 = min(sx1r, s["hwt"] * 0.8)
    sx2 = min(sx2r, sx1 * 0.4)

    def y(x):
        return s["yt"] + c * (1 - (x / max(1e-3, s["hwt"])) ** 2)
    base = (s["hwb"], s["yb"])
    w = (s["hwt"], s["yt"])
    s1 = (sx1, y(sx1))
    ls = math.hypot(w[0] - base[0], w[1] - base[1])
    lr = math.hypot(s1[0] - w[0], s1[1] - w[1])
    d = min(edge, ls * 0.45, lr * 0.45)
    w1 = (w[0] + (base[0] - w[0]) / ls * d, w[1] + (base[1] - w[1]) / ls * d) if ls > 1e-9 else w
    w2 = (w[0] + (s1[0] - w[0]) / lr * d, w[1] + (s1[1] - w[1]) / lr * d) if lr > 1e-9 else w
    wm = (0.25 * w1[0] + 0.5 * w[0] + 0.25 * w2[0], 0.25 * w1[1] + 0.5 * w[1] + 0.25 * w2[1])
    belt = (base[0] + (w1[0] - base[0]) * 0.1, base[1] + (w1[1] - base[1]) * 0.1)
    return [base, belt, w1, wm, w2, s1, (sx2, y(sx2))], (0.0, s["yt"] + c)


CABIN_EMBED = 0.03


def build_cabin():
    secs, gaps = cabin_sections()
    bm = bmesh.new()
    mats = Mats()
    rings = []
    for s in secs:
        right, ctr = cabin_ring(s)
        pts = list(right) + [ctr] + [(-x, yy) for (x, yy) in reversed(right)]
        rings.append([bm.verts.new((x, s["z"], yy - (CABIN_EMBED if k in (0, len(pts) - 1) else 0.0))) for k, (x, yy) in enumerate(pts)])
    n = len(rings[0])  # 15
    seg_kind = ["trim", "side", "roof", "roof", "roof", "stripe", "center"]  # base→cintura, cintura→vidro, borda..., faixa, centro
    for i in range(len(secs) - 1):
        gap = gaps[i]
        for j in range(n - 1):
            e = j if j < 7 else n - 2 - j
            kind = seg_kind[e]
            if kind == "trim":
                m = "paint" if gap in CFG["belt_paint_gaps"] else "trim"  # o friso preto da cintura; onde a lateral é pintada (a tampa do motor), a base também
            elif kind == "side":
                m = "paint" if gap == 2 else "glass"
            elif kind in ("roof",):
                m = "paint"
                if e == 4:
                    m = "glass" if gap in CFG["roof_glass_gaps"] else "paint"
            elif kind == "stripe":
                m = "glass" if gap in CFG["roof_glass_gaps"] else "stripe_a"
            else:
                m = "glass" if gap in CFG["roof_glass_gaps"] else "paint"
            a, b = rings[i][j], rings[i][j + 1]
            c, d = rings[i + 1][j + 1], rings[i + 1][j]
            f = bm.faces.new((a, d, c, b))
            f.material_index = mats.i(m)
    # a tampa de trás da cabine e a da frente ficam planas no casco: sem tampa (a seção é rente ao casco)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # a normal do teto aponta para cima? senão inverte tudo
    top = [f for f in bm.faces if f.calc_center_median().z > 1.1]
    if top and sum(f.normal.z for f in top) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    crease = bm.edges.layers.float.get("crease_edge") or bm.edges.layers.float.new("crease_edge")
    ob = obj_from("cabine", bm, mats.names)
    cl.subsurf(ob, CABIN_SUBDIV)
    return ob


# ───────────────────────────── peças soltas: um acumulador de malha e as primitivas ─────────────────────────────
class Part:
    """Malha em construção (coordenadas do mundo do Blender). Vértices iguais (a 0,01 mm) são o mesmo vértice."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = Mats()
        self.cache = {}

    def v(self, p):
        k = (round(p[0] * 1e5), round(p[1] * 1e5), round(p[2] * 1e5))
        w = self.cache.get(k)
        if w is None:
            w = self.cache[k] = self.bm.verts.new((p[0], p[1], p[2]))
        return w

    def face(self, pts, mat):
        vs = []
        for p in pts:
            w = self.v(p)
            if w not in vs:
                vs.append(w)
        if len(vs) < 3:
            return None
        try:
            f = self.bm.faces.new(vs)
        except ValueError:
            return None
        f.material_index = self.mats.i(mat)
        return f

    def quad(self, a, b, c, d, mat):
        return self.face((a, b, c, d), mat)

    def tri(self, a, b, c, mat):
        return self.face((a, b, c), mat)

    def finish(self, parent=None, name=None):
        if not self.bm.faces:
            self.bm.free()
            return None
        ob = obj_from(name or self.name, self.bm, self.mats.names, parent)
        return ob


def frame(pos, n, up=(0, 0, 1)):
    """Matriz local → mundo: origem em `pos`, eixo Y local = `n` (para fora da pele), Z local = `up` ortogonalizado, X local = Y × Z."""
    ey = Vector(n).normalized()
    ez = Vector(up) - ey * Vector(up).dot(ey)
    if ez.length < 1e-6:
        ez = Vector((0, 1, 0)) - ey * ey.y
    ez.normalize()
    ex = ey.cross(ez)
    m = Matrix.Identity(4)
    for i in range(3):
        m[i][0], m[i][1], m[i][2] = ex[i], ey[i], ez[i]
        m[i][3] = pos[i]
    return m


def lathe(P, M, profile, seg=16, rot=0.0):
    """Sólido de revolução em torno do eixo Y local, por um perfil (r, d, material do trecho até o ponto seguinte), com r crescente: o perfil é a
    superfície vista de fora (do lado +Y); r = 0 no primeiro ponto dá um leque. Cada trecho é uma faixa de `seg` quadriláteros."""
    for i in range(len(profile) - 1):
        r0, d0, m = profile[i]
        r1, d1, _ = profile[i + 1]
        for k in range(seg):
            a0 = rot + 2 * math.pi * k / seg
            a1 = rot + 2 * math.pi * (k + 1) / seg
            p = lambda r, d, a: M @ Vector((r * math.cos(a), d, r * math.sin(a)))
            P.quad(p(r0, d0, a0), p(r0, d0, a1), p(r1, d1, a1), p(r1, d1, a0), m)


def box(P, c, size, mat, M=None):
    """Caixa alinhada aos eixos (ou à matriz M), faces para fora."""
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    pts = {}
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                q = Vector((c[0] + sx * hx, c[1] + sy * hy, c[2] + sz * hz))
                pts[(sx, sy, sz)] = (M @ q) if M is not None else q
    g = pts
    P.quad(g[-1, -1, -1], g[-1, 1, -1], g[-1, 1, 1], g[-1, -1, 1], mat)  # -x
    P.quad(g[1, -1, -1], g[1, -1, 1], g[1, 1, 1], g[1, 1, -1], mat)      # +x
    P.quad(g[-1, -1, -1], g[-1, -1, 1], g[1, -1, 1], g[1, -1, -1], mat)  # -y
    P.quad(g[-1, 1, -1], g[1, 1, -1], g[1, 1, 1], g[-1, 1, 1], mat)      # +y
    P.quad(g[-1, -1, 1], g[-1, 1, 1], g[1, 1, 1], g[1, -1, 1], mat)      # +z
    P.quad(g[-1, -1, -1], g[1, -1, -1], g[1, 1, -1], g[-1, 1, -1], mat)  # -z


def extrude(P, loop, vec, mat, cap_mat=None, caps=True):
    """Extrusão de um contorno fechado `loop` (pontos 3D, anti-horário visto da ponta de `vec`) ao longo de `vec`: laterais para fora e, se pedidas, as duas tampas."""
    vec = Vector(vec)
    n = len(loop)
    for i in range(n):
        a, b = Vector(loop[i]), Vector(loop[(i + 1) % n])
        P.quad(a, b, b + vec, a + vec, mat)
    if caps:
        cm = cap_mat or mat
        top = [Vector(p) + vec for p in loop]
        for pts, flip in ((top, False), (list(reversed([Vector(p) for p in loop])), False)):
            P.cap(pts, cm)


def _cap(self, pts, mat):
    """Tampa poligonal (triangulada, serve para contorno côncavo)."""
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts]
    try:
        f = bm.faces.new(vs)
    except ValueError:
        bm.free()
        return
    f.material_index = 0
    res = bmesh.ops.triangulate(bm, faces=[f])
    for t in res["faces"]:
        self.tri(*[v.co.copy() for v in t.verts], mat)
    bm.free()


Part.cap = _cap


def tube(P, path, radii, mat, seg=8, ratio=1.0, up=(1, 0, 0), cap_end=True):
    """Tubo ao longo de uma polilinha: um anel (elíptico, `ratio` = largura/profundidade) em cada ponto, com o raio de `radii`."""
    rings = []
    n = len(path)
    for i, p in enumerate(path):
        t = (Vector(path[min(i + 1, n - 1)]) - Vector(path[max(i - 1, 0)])).normalized()
        u = (Vector(up) - t * Vector(up).dot(t)).normalized()
        w = t.cross(u)
        r = radii[i]
        rings.append([Vector(p) + u * (r * ratio * math.cos(2 * math.pi * k / seg)) + w * (r * math.sin(2 * math.pi * k / seg)) for k in range(seg)])
    for i in range(n - 1):
        for k in range(seg):
            P.quad(rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k], mat)
    if cap_end:
        P.cap(rings[-1], mat)
        P.cap(list(reversed(rings[0])), mat)


def sample_normal(tree, x, y, z, axis, d=0.04):
    """Normal suave da pele perto de (x, y, z) olhando pelo eixo de projeção `axis` ('back', 'front', 'top', 'side+', 'side-'): média de 4 amostras."""
    def ray(px, py, pz):
        if axis == "back":
            h = tree.ray_cast(v3(px, 4.0, pz), v3(0, -1, 0), 8)
        elif axis == "front":
            h = tree.ray_cast(v3(px, -4.0, pz), v3(0, 1, 0), 8)
        elif axis == "top":
            h = tree.ray_cast(v3(px, py, 3.0), v3(0, 0, -1), 6)
        elif axis == "side+":
            h = tree.ray_cast(v3(3.0, py, pz), v3(-1, 0, 0), 6)
        else:
            h = tree.ray_cast(v3(-3.0, py, pz), v3(1, 0, 0), 6)
        return h[0]
    if axis in ("back", "front"):
        pts = [ray(x + d, y, z), ray(x - d, y, z), ray(x, y, z + d), ray(x, y, z - d)]
        if any(p is None for p in pts):
            return Vector((0, 1 if axis == "back" else -1, 0))
        dx = (pts[0] - pts[1]).normalized() if (pts[0] - pts[1]).length else Vector((1, 0, 0))
        dz = (pts[2] - pts[3]).normalized()
        n = dx.cross(dz)
        if (n.y > 0) != (axis == "back"):
            n = -n
        return n.normalized()
    if axis == "top":
        pts = [ray(x + d, y, z), ray(x - d, y, z), ray(x, y + d, z), ray(x, y - d, z)]
        if any(p is None for p in pts):
            return Vector((0, 0, 1))
        n = (pts[0] - pts[1]).cross(pts[2] - pts[3])
        return (n if n.z > 0 else -n).normalized()
    pts = [ray(x, y + d, z), ray(x, y - d, z), ray(x, y, z + d), ray(x, y, z - d)]
    if any(p is None for p in pts):
        return Vector((1 if axis == "side+" else -1, 0, 0))
    n = (pts[0] - pts[1]).cross(pts[2] - pts[3])
    return (n if (n.x > 0) == (axis == "side+") else -n).normalized()


def project(tree, a, b, axis):
    """Ponto da pele para as coordenadas 2D (a, b) do eixo de projeção: back (x, z), front (x, z), top (x, y), side± (y, z). Devolve (ponto, normal) ou None."""
    if axis == "back":
        h = tree.ray_cast(v3(a, 4.0, b), v3(0, -1, 0), 8)
    elif axis == "front":
        h = tree.ray_cast(v3(a, -4.0, b), v3(0, 1, 0), 8)
    elif axis == "top":
        h = tree.ray_cast(v3(a, b, 3.0), v3(0, 0, -1), 6)
    elif axis == "side+":
        h = tree.ray_cast(v3(3.0, a, b), v3(-1, 0, 0), 6)
    else:
        h = tree.ray_cast(v3(-3.0, a, b), v3(1, 0, 0), 6)
    if h[0] is None:
        return None
    n = Vector(h[1])
    want = {"back": (0, 1, 0), "front": (0, -1, 0), "top": (0, 0, 1), "side+": (1, 0, 0), "side-": (-1, 0, 0)}[axis]
    if n.dot(Vector(want)) < 0:
        n = -n
    return Vector(h[0]), n


def _plane_pt(a, b, axis):
    return {"back": v3(a, 0, b), "front": v3(a, 0, b), "top": v3(a, b, 0), "side+": v3(0, a, b), "side-": v3(0, a, b)}[axis]


def _clip(poly, xmin, xmax, ymin, ymax):
    """Sutherland-Hodgman: o polígono `poly` (lista de (a, b)) recortado pelo retângulo."""
    def side(pts, inside, inter):
        out = []
        n = len(pts)
        for i in range(n):
            p, q = pts[i], pts[(i + 1) % n]
            ip, iq = inside(p), inside(q)
            if ip:
                out.append(p)
            if ip != iq:
                out.append(inter(p, q))
        return out
    lerp = lambda p, q, t: (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
    pts = list(poly)
    for ins, itr in (
        (lambda p: p[0] >= xmin, lambda p, q: lerp(p, q, (xmin - p[0]) / (q[0] - p[0]))),
        (lambda p: p[0] <= xmax, lambda p, q: lerp(p, q, (xmax - p[0]) / (q[0] - p[0]))),
        (lambda p: p[1] >= ymin, lambda p, q: lerp(p, q, (ymin - p[1]) / (q[1] - p[1]))),
        (lambda p: p[1] <= ymax, lambda p, q: lerp(p, q, (ymax - p[1]) / (q[1] - p[1]))),
    ):
        if not pts:
            break
        pts = side(pts, ins, itr)
    return pts


def patch_on(P, tree, poly, axis, mat, h=0.06, off=0.004):
    """Remendo conforme: o contorno 2D `poly` (coordenadas do eixo de projeção) preenchido por uma grade de células de lado ~h recortadas pelo contorno
    (as de dentro são quadriláteros; as da borda seguem o contorno exato), cada vértice assentado na pele + off."""
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    nx = max(1, int(math.ceil((max(xs) - min(xs)) / h)))
    ny = max(1, int(math.ceil((max(ys) - min(ys)) / h)))
    dx, dy = (max(xs) - min(xs)) / nx, (max(ys) - min(ys)) / ny
    want = {"back": (0, 1, 0), "front": (0, -1, 0), "top": (0, 0, 1), "side+": (1, 0, 0), "side-": (-1, 0, 0)}[axis]
    memo = {}

    def at(a, b):
        k = (round(a * 1e6), round(b * 1e6))
        if k not in memo:
            r = project(tree, a, b, axis)
            memo[k] = None if r is None else r[0] + r[1] * off
        return memo[k]
    for i in range(nx):
        for j in range(ny):
            x0, y0 = min(xs) + i * dx, min(ys) + j * dy
            cell = _clip(poly, x0, x0 + dx, y0, y0 + dy)
            if len(cell) < 3:
                continue
            area = 0.5 * sum(cell[k][0] * cell[(k + 1) % len(cell)][1] - cell[(k + 1) % len(cell)][0] * cell[k][1] for k in range(len(cell)))
            if abs(area) < 1e-7:
                continue
            pts = [at(a, b) for (a, b) in cell]
            if any(p is None for p in pts):
                continue
            # triangulação em leque a partir do centro do recorte (célula inteira: 4 cantos → 2 triângulos pela diagonal curta)
            if len(pts) == 4:
                tris = [(pts[0], pts[1], pts[2]), (pts[0], pts[2], pts[3])]
            else:
                c = sum(pts, Vector((0, 0, 0))) / len(pts)
                tris = [(c, pts[k], pts[(k + 1) % len(pts)]) for k in range(len(pts))]
            for (p, q, r2) in tris:
                if (q - p).cross(r2 - p).dot(Vector(want)) < 0:
                    q, r2 = r2, q
                P.face((p, q, r2), mat)


def strip_on(P, tree, line, width, axis, mat, off=0.003, step=0.04):
    """Faixa fina ao longo de uma polilinha 2D (a, b), de largura `width`, assentada na pele (frestas, frisos)."""
    pts = []
    for i in range(len(line) - 1):
        (a0, b0), (a1, b1) = line[i], line[i + 1]
        L = math.hypot(a1 - a0, b1 - b0)
        n = max(1, int(math.ceil(L / step)))
        for k in range(n):
            t = k / n
            pts.append((a0 + (a1 - a0) * t, b0 + (b1 - b0) * t))
    pts.append(line[-1])
    rows = []
    for i, (a, b) in enumerate(pts):
        pa, pb = pts[min(i + 1, len(pts) - 1)], pts[max(i - 1, 0)]
        da, db = pa[0] - pb[0], pa[1] - pb[1]
        L = math.hypot(da, db) or 1.0
        na, nb = -db / L, da / L
        r0 = project(tree, a + na * width / 2, b + nb * width / 2, axis)
        r1 = project(tree, a - na * width / 2, b - nb * width / 2, axis)
        rows.append((r0, r1))
    want = {"back": (0, 1, 0), "front": (0, -1, 0), "top": (0, 0, 1), "side+": (1, 0, 0), "side-": (-1, 0, 0)}[axis]
    for i in range(len(rows) - 1):
        (a0, a1), (b0, b1) = rows[i], rows[i + 1]
        if None in (a0, a1, b0, b1):
            continue
        q = [a0[0] + a0[1] * off, b0[0] + b0[1] * off, b1[0] + b1[1] * off, a1[0] + a1[1] * off]
        if (q[1] - q[0]).cross(q[2] - q[0]).dot(Vector(want)) < 0:
            q = list(reversed(q))
        P.quad(*q, mat)


# ───────────────────────────── a traseira ─────────────────────────────
REAR_Y = 2.199        # a pele da traseira (o fecho do casco) em x < 0,6
TAIL_LAMPS = [(0.335, 0.625, 0.13, 0.11), (0.615, 0.625, 0.135, 0.115)]   # (x, altura, raio da moldura, raio da lente): as do GT de sempre; a outra metade é o espelho


def tail_lamp(P, Pled, tree, x, z, R, rl, seg=16):
    """Lanterna de LED embutida: moldura saliente (lábio cromado), poço, coroa (taillight_dim), miolo em leque (taillight), anel de LED e pontos de LED."""
    n = sample_normal(tree, x, REAR_Y, z, "back")
    M = frame(v3(x, REAR_Y, z) , n)
    rc = 0.78 * rl
    lathe(P, M, [(0, 0.016, "taillight"), (rc, 0.013, "taillight_dim"), (rl, 0.013, "tail_well"), (rl + 0.005, 0.036, "chrome"), (rl + 0.012, 0.042, "piano"),
                 (R - 0.014, 0.042, "piano"), (R, 0.030, "piano"), (R, -0.004, "piano")], seg)
    lathe(Pled, M, [(0.60 * rl, 0.0145, "taillight"), (0.70 * rl, 0.0145, "taillight"), (0.70 * rl, 0.0145, None)], seg)
    for k in range(8):  # pontos de LED na coroa
        a = 2 * math.pi * (k + 0.5) / 8
        cx, cz = 0.89 * rl * math.cos(a), 0.89 * rl * math.sin(a)
        s0 = 0.0065
        base = [M @ Vector((cx + dx * s0, 0.0132, cz + dz * s0)) for (dx, dz) in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        apex = M @ Vector((cx, 0.0185, cz))
        for i in range(4):
            Pled.tri(base[i], base[(i + 1) % 4], apex, "taillight")


def hex_cells(P, tree, cx, cz, w, h, Rc, mat, axis="back", lift=0.010):
    """Colmeia: células hexagonais (moldura em relevo, anel de 6 lados) em fileiras alternadas, cada uma assentada na pele."""
    dx, dz = math.sqrt(3) * Rc, 1.5 * Rc
    rows = int((h - 2 * Rc) / dz) + 1
    k0 = cz - ((rows - 1) * dz) / 2
    ro, ri = Rc * 0.94, Rc * 0.64
    for r in range(rows):
        z = k0 + r * dz
        off = dx / 2 if r % 2 else 0.0
        cols = int((w - off) / dx)
        x0 = cx - (cols - 1) * dx / 2 + (off - (dx / 2 if cols and r % 2 else 0)) if False else cx - (cols * dx) / 2 + dx / 2 + (off / 2 if r % 2 else -off / 2 * 0)
        for c in range(cols):
            x = cx - ((cols - 1) * dx) / 2 + c * dx + (dx / 4 if r % 2 else -dx / 4)
            if abs(x) + dx / 2 > cx + w / 2 + 1e-6:
                continue
            pr = project(tree, x, z, axis)
            if pr is None:
                continue
            pt, nn = pr
            M = frame(pt + nn * lift, nn)
            for k in range(6):
                a0, a1 = math.radians(30 + 60 * k), math.radians(30 + 60 * (k + 1))
                q = lambda rad, a: M @ Vector((rad * math.cos(a), 0, rad * math.sin(a)))
                P.quad(q(ri, a0), q(ri, a1), q(ro, a1), q(ro, a0), mat)


def rounded(cx, cz, w, h, r, seg=3):
    return cl.rounded_rect(cx, cz, w, h, r, seg)


def build_rear(tree):
    out = []
    # painel preto brilhante da traseira (sob as lanternas)
    Pp = Part("painel_traseiro")
    poly = [(-0.77, 0.475), (0.77, 0.475), (0.77, 0.685), (0.60, 0.785), (-0.60, 0.785), (-0.77, 0.685)]
    patch_on(Pp, tree, poly, "back", "piano", h=0.09, off=0.004)
    out.append(Pp.finish())
    # lanternas de LED (4) e os LEDs
    Pl, Pled = Part("lamp_tail"), Part("led")
    for sd in (1, -1):
        for (x, z, R, rl) in TAIL_LAMPS:
            tail_lamp(Pl, Pled, tree, sd * x, z, R, rl)
    out += [Pl.finish(), Pled.finish()]
    # pisca âmbar e luz de ré apagados, sob as lanternas (como no GT)
    Pi = Part("indicadores")
    for sd in (1, -1):
        patch_on(Pi, tree, [(sd * 0.50, 0.443), (sd * 0.74, 0.443), (sd * 0.74, 0.470), (sd * 0.50, 0.470)][::sd], "back", "amber", h=0.08, off=0.0075)
        patch_on(Pi, tree, [(sd * 0.25, 0.443), (sd * 0.45, 0.443), (sd * 0.45, 0.470), (sd * 0.25, 0.470)][::sd], "back", "lens_clear", h=0.08, off=0.0075)
    out.append(Pi.finish())
    # colmeia
    Pg = Part("grade_colmeia")
    patch_on(Pg, tree, rounded(0, 0.63, 0.40, 0.22, 0.03), "back", "under", h=0.08, off=0.006)
    hex_cells(Pg, tree, 0.0, 0.63, 0.37, 0.20, 0.0265, "gunmetal", "back", lift=0.011)
    out.append(Pg.finish())
    # placa lisa (sem texto), em moldura
    Pa = Part("placa")
    patch_on(Pa, tree, rounded(0, 0.405, 0.35, 0.155, 0.02), "back", "trim", h=0.2, off=0.006)
    patch_on(Pa, tree, rounded(0, 0.405, 0.30, 0.115, 0.012), "back", "plate", h=0.2, off=0.0115)
    out.append(Pa.finish())
    # saia traseira em carbono, com o recorte do difusor
    Pc = Part("saia_traseira")
    patch_on(Pc, tree, [(-0.77, 0.325), (0.77, 0.325), (0.77, 0.42), (-0.77, 0.42)], "back", "carbon", h=0.1, off=0.004)
    out.append(Pc.finish())
    # difusor: bandeja de carbono em rampa e 9 aletas
    Pd = Part("difusor")
    y0, y1, z0, z1 = 1.96, 2.30, 0.165, 0.285
    hw = 0.325
    tray = [v3(-hw, y0, z0), v3(hw, y0, z0), v3(hw, y1, z1), v3(-hw, y1, z1)]
    Pd.quad(tray[0], tray[3], tray[2], tray[1], "carbon")   # a face de baixo, voltada para o chão
    Pd.quad(tray[0], tray[1], tray[2], tray[3], "under")    # a de cima (rente ao casco)
    fins = 9
    for i in range(fins):
        x = -hw + 0.02 + (2 * hw - 0.04) * i / (fins - 1)
        t = 0.0045
        # a aleta: perfil em seis pontos (frente baixa, dorso inclinado, ponta chanfrada) para a luz não a ler como tábua
        prof = [(y0 + 0.02, z0 + 0.012), (y0 + 0.12, z0 + 0.040), (y1, z1 + 0.012), (y1, z1 + 0.012 + 0.040), (y1 - 0.06, z1 + 0.012 + 0.052), (y0 + 0.02, z0 + 0.012 + 0.085)]
        extrude(Pd, [v3(x - t, yy, zz) for (yy, zz) in prof], v3(2 * t, 0, 0), "carbon")
    for sd in (1, -1):  # as cercas das pontas, mais altas e curvas, e o friso de metal do lábio
        xo = sd * (hw + 0.012)
        prof = [(y0 - 0.02, z0 + 0.0), (y0 + 0.10, z0 + 0.03), (y1 + 0.01, z1 + 0.012), (y1 + 0.01, z1 + 0.012 + 0.07), (y0 + 0.14, z0 + 0.012 + 0.11), (y0 - 0.02, z0 + 0.012 + 0.10)]
        loop = [v3(xo - 0.006, yy, zz) for (yy, zz) in prof]
        extrude(Pd, loop if sd > 0 else list(reversed(loop)), v3(0.012 * sd, 0, 0), "carbon")
        box(Pd, (sd * 0.50, y1 + 0.004, z1 + 0.05), (0.16, 0.008, 0.012), "metal")
    out.append(Pd.finish())
    # escapes duplos de metal (a ponteira sai da traseira; o resto fica dentro)
    for sd, nm in ((1, "escape_l"), (-1, "escape_r")):
        Pe = Part(nm)
        M = frame(v3(sd * 0.42, 2.12, 0.26), v3(0, 1, 0))
        ro, ri = 0.075, 0.060
        lathe(Pe, M, [(0, 0.075, "under"), (ri, 0.075, "under"), (ri, 0.185, "chrome"), (ri + 0.004, 0.19, "chrome"), (ro, 0.19, "metal"), (ro, 0.0, None)], 20)
        out.append(Pe.finish())
    return out


# ───────────────────────────── a frente ─────────────────────────────
HEAD_POD = [(0.40, -2.04), (0.63, -2.00), (0.645, -1.66), (0.43, -1.72)]   # a carcaça do farol, no capô (x, y): a mesma do GT de sempre


def projector(Pp, tree, x, y, r):
    """Projetor embutido: aro cromado, coroa (headlight_dim) e miolo em leque (headlight), sobre a pele do capô."""
    pr = project(tree, x, y, "top")
    if pr is None:
        return
    pt, n = pr
    M = frame(pt + n * 0.006, n, up=(0, -1, 0))
    lathe(Pp, M, [(0, 0.012, "headlight"), (0.62 * r, 0.008, "headlight_dim"), (0.84 * r, 0.006, "chrome"), (r, 0.014, "chrome"), (r, -0.004, "chrome")], 14)


def build_front(tree):
    out = []
    # faróis: carcaça, refletor e a luz diurna em L, os projetores à parte
    Ph, Pp = Part("lamp_head"), [Part("farol_projetor_l"), Part("farol_projetor_r")]
    for k, sd in enumerate((1, -1)):
        pod = [(sd * x, y) for (x, y) in HEAD_POD]
        if sd < 0:
            pod = list(reversed(pod))
        patch_on(Ph, tree, pod, "top", "housing", h=0.045, off=0.004)
        inner = [(sd * x, y) for (x, y) in [(0.425, -2.02), (0.615, -1.985), (0.628, -1.69), (0.44, -1.735)]]
        if sd < 0:
            inner = list(reversed(inner))
        patch_on(Ph, tree, inner, "top", "reflector", h=0.045, off=0.0075)
        strip_on(Ph, tree, [(sd * 0.425, -2.025), (sd * 0.62, -1.99)], 0.014, "top", "headlight_dim", off=0.0105, step=0.03)
        strip_on(Ph, tree, [(sd * 0.633, -1.99), (sd * 0.642, -1.69)], 0.012, "top", "headlight_dim", off=0.0105, step=0.03)
        projector(Pp[k], tree, sd * 0.495, -1.93, 0.046)
        projector(Pp[k], tree, sd * 0.57, -1.80, 0.046)
    out += [Ph.finish(), Pp[0].finish(), Pp[1].finish()]
    # entradas de ar do focinho (recorte escuro e barras) e o divisor de carbono
    Pf = Part("entradas_frente")
    for (x0, x1, z0, z1, bars) in ((-0.48, 0.48, 0.295, 0.425, 3), (0.53, 0.72, 0.295, 0.405, 2), (-0.72, -0.53, 0.295, 0.405, 2)):
        patch_on(Pf, tree, rounded((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 0.025), "front", "under", h=0.07, off=0.004)
        for b in range(bars):
            zb = z0 + (z1 - z0) * (b + 1) / (bars + 1)
            strip_on(Pf, tree, [(x0 + 0.02, zb), (x1 - 0.02, zb)], 0.012, "front", "gunmetal", off=0.009, step=0.06)
    out.append(Pf.finish())
    Ps = Part("divisor")
    loop = [v3(-0.76, -2.05, 0.165), v3(-0.70, -2.29, 0.165), v3(0.70, -2.29, 0.165), v3(0.76, -2.05, 0.165)]
    extrude(Ps, loop, v3(0, 0, 0.026), "carbon")
    out.append(Ps.finish())
    # tomadas NACA no capô, por fora das faixas, com duas lâminas
    Pn = Part("naca")
    for sd in (1, -1):
        poly = [(sd * 0.44, -1.56), (sd * 0.61, -1.56), (sd * 0.575, -1.24), (sd * 0.475, -1.24)]
        if sd < 0:
            poly = list(reversed(poly))
        patch_on(Pn, tree, poly, "top", "trim", h=0.05, off=0.004)
        for f in (0.35, 0.68):
            strip_on(Pn, tree, [(sd * (0.44 + 0.17 * 0.0 + (0.01 * f)), -1.56 + 0.32 * f), (sd * (0.61 - 0.035 * f - 0.02), -1.56 + 0.32 * f)], 0.010, "top", "paint", off=0.012, step=0.04)
    out.append(Pn.finish())
    # fresta do capô: a borda do capô em U, do para-brisa às rodas e à frente
    Pc = Part("fresta_capo")
    line = [(-0.60, -0.93), (0.60, -0.93)]
    strip_on(Pc, tree, line, 0.006, "top", "trim", off=0.0025, step=0.04)
    for sd in (1, -1):
        strip_on(Pc, tree, [(sd * 0.60, -0.93), (sd * 0.64, -1.25), (sd * 0.675, -1.45)], 0.006, "top", "trim", off=0.0025, step=0.04)
    strip_on(Pc, tree, [(-0.42, -2.075), (0.42, -2.075)], 0.006, "top", "trim", off=0.0025, step=0.04)
    out.append(Pc.finish())
    return out


# ───────────────────────────── os lados ─────────────────────────────
def uvsphere(P, c, radii, mat, u=10, v=6):
    """Elipsoide (faces para fora) de centro c e semieixos radii."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0)
    for f in bm.faces:
        P.face([v3(c[0] + vt.co.x * radii[0], c[1] + vt.co.y * radii[1], c[2] + vt.co.z * radii[2]) for vt in f.verts], mat)
    bm.free()


def facing(P, pts, mat, want):
    """Face poligonal virada para `want` (inverte a ordem se preciso)."""
    pts = [Vector(p) for p in pts]
    n = Vector((0, 0, 0))
    for i in range(1, len(pts) - 1):
        n += (pts[i] - pts[0]).cross(pts[i + 1] - pts[0])
    if n.dot(Vector(want)) < 0:
        pts = list(reversed(pts))
    P.face(pts, mat)


def build_sides(tree):
    out = []
    Pf, Pg = Part("fresta_porta"), Part("fresta_porta_aux")
    for sd, ax in ((1, "side+"), (-1, "side-")):
        strip_on(Pf, tree, [(-0.62, 0.27), (-0.60, 0.50), (-0.585, 0.60)], 0.006, ax, "trim", off=0.003, step=0.04)
        strip_on(Pf, tree, [(0.26, 0.27), (0.28, 0.53), (0.29, 0.61)], 0.006, ax, "trim", off=0.003, step=0.04)
    out.append(Pf.finish())
    for sd, ax, nm in ((1, "side+", "l"), (-1, "side-", "r")):
        # maçaneta embutida: bolsão escuro e a barra rente
        Ph = Part(f"macaneta_{nm}")
        patch_on(Ph, tree, rounded(-0.05, 0.50, 0.15, 0.045, 0.018), ax, "trim", h=0.05, off=0.004)
        strip_on(Ph, tree, [(-0.105, 0.50), (0.0, 0.50)], 0.014, ax, "trim_soft", off=0.0075, step=0.035)
        out.append(Ph.finish())
        # entrada de ar do flanco (entre a porta e a roda de trás): recorte escuro e quatro lâminas na cor do carro
        Pa = Part(f"entrada_ar_{nm}")
        patch_on(Pa, tree, [(0.34, 0.30), (0.80, 0.27), (0.80, 0.52), (0.34, 0.55)], ax, "under", h=0.06, off=0.005)
        for yy in (0.43, 0.545, 0.66, 0.775):
            strip_on(Pa, tree, [(yy, 0.31), (yy, 0.52)], 0.018, ax, "paint", off=0.014, step=0.05)
        out.append(Pa.finish())
        # retrovisor: pedestal, carcaça (elipsoide) e o espelho
        Pm = Part(f"retrovisor_{nm}")
        x = sd * 0.84
        box(Pm, (sd * 0.755, -0.62, 0.845), (0.13, 0.05, 0.03), "trim")
        uvsphere(Pm, (x, -0.60, 0.905), (0.055, 0.085, 0.048), "paint", 10, 6)
        ell = [v3(x + 0.043 * math.cos(2 * math.pi * k / 12), -0.60 + 0.083, 0.905 + 0.038 * math.sin(2 * math.pi * k / 12)) for k in range(12)]
        facing(Pm, ell, "chrome", (0, 1, 0))
        out.append(Pm.finish())
    # pinças de freio (acento) no fundo do aro, como as do GT de sempre
    Pk = Part("pincas")
    for a in AXLES:
        for sd in (1, -1):
            box(Pk, (sd * (a["x"] + a["w"] * 0.08), a["z"] + a["r"] * 0.26, a["r"] + a["r"] * 0.32), (0.05, a["r"] * 0.3, a["r"] * 0.36), "accent")
    out.append(Pk.finish())
    return out


# ───────────────────────────── reflexo do céu nos vidros (faixas de espelho claro) ─────────────────────────────
def build_glints(tree):
    P = Part("reflexo_vidro")
    # para-brisa e vidro de trás (por cima): duas faixas diagonais cada
    patch_on(P, tree, [(-0.34, -0.72), (-0.20, -0.72), (0.10, -0.30), (-0.04, -0.30)], "top", "glint", h=0.07, off=0.0035)
    patch_on(P, tree, [(0.06, -0.72), (0.11, -0.72), (0.30, -0.42), (0.25, -0.42)], "top", "glint", h=0.07, off=0.0035)
    patch_on(P, tree, [(0.30, 0.98), (0.40, 0.98), (0.14, 1.38), (0.04, 1.38)], "top", "glint", h=0.07, off=0.0035)
    patch_on(P, tree, [(-0.04, 0.98), (0.0, 0.98), (-0.16, 1.26), (-0.20, 1.26)], "top", "glint", h=0.07, off=0.0035)
    for ax in ("side+", "side-"):  # janelas laterais
        patch_on(P, tree, [(-0.22, 0.745), (-0.10, 0.745), (0.14, 1.07), (0.02, 1.07)], ax, "glint", h=0.07, off=0.0035)
        patch_on(P, tree, [(0.10, 0.745), (0.145, 0.745), (0.29, 0.99), (0.245, 0.99)], ax, "glint", h=0.07, off=0.0035)
    return [P.finish()]


# ───────────────────────────── a asa (lâmina, placas laterais, suportes) ─────────────────────────────
def wing():
    out = []
    Pw = Part("asa")
    y0, y1, zle, zte = 1.835, 2.135, 1.015, 1.045
    pts_low, pts_up = [], []
    N = 7
    for i in range(N + 1):
        u = i / N
        thick = 5 * 0.215 * (0.2969 * math.sqrt(u) - 0.1260 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1015 * u ** 4) * 0.30
        yy = y0 + (y1 - y0) * u
        zc = zle + (zte - zle) * u
        pts_low.append((yy, zc - thick * 0.85))
        pts_up.append((yy, zc + thick * 0.15))
    loop = pts_low + list(reversed(pts_up))[:-1] if False else pts_low + list(reversed(pts_up))
    loop = [loop[0]] + [p for i, p in enumerate(loop[1:], 1) if (abs(p[0] - loop[i - 1][0]) + abs(p[1] - loop[i - 1][1])) > 1e-9]
    n = len(loop)
    up_edge = set(range(N, n))  # as arestas da face de cima (do bordo de fuga de volta ao de ataque)
    segs = [(-0.80, -0.36, "paint"), (-0.36, -0.08, "stripe_a"), (-0.08, 0.08, "paint"), (0.08, 0.36, "stripe_a"), (0.36, 0.80, "paint")]
    for (xa, xb, top_mat) in segs:
        for i in range(n):
            (ya, za), (yb, zb) = loop[i], loop[(i + 1) % n]
            m = top_mat if i in up_edge else "paint"
            Pw.quad(v3(xa, ya, za), v3(xa, yb, zb), v3(xb, yb, zb), v3(xb, ya, za), m)
    for sd in (1, -1):  # tampas da lâmina (as placas laterais cobrem)
        pass
    # gurney (carbono) no bordo de fuga
    box(Pw, (0, y1 - 0.004, zte + 0.014), (1.58, 0.008, 0.028), "carbon")
    out.append(Pw.finish())
    # placas laterais (rabeta com cantos arredondados)
    Pe = Part("asa_placas")
    plate = [(1.845, 0.955), (2.145, 0.985), (2.175, 1.0), (2.18, 1.20), (2.16, 1.215), (1.90, 1.13), (1.835, 1.04), (1.83, 0.99)]
    for sd in (1, -1):
        xa = sd * 0.80
        loopp = [v3(xa, y, z) for (y, z) in plate]
        # anti-horário visto da ponta do vetor (+x para o lado +; −x para o lado −)
        if sd < 0:
            loopp = list(reversed(loopp))
        extrude(Pe, loopp, v3(sd * 0.02, 0, 0), "paint")
        box(Pe, (sd * 0.822, 2.0, 1.17), (0.004, 0.16, 0.012), "carbon")
    out.append(Pe.finish())
    # suportes (pescoço de cisne): tubos elípticos do deck à lâmina
    for sd, nm in ((1, "suporte_l"), (-1, "suporte_r")):
        Ps = Part(nm)
        x = sd * 0.44
        path = [v3(x, 1.945, 0.80), v3(x, 1.955, 0.88), v3(x, 1.975, 0.95), v3(x, 2.00, 0.995), v3(x, 2.035, 1.020)]
        tube(Ps, path, [0.034, 0.031, 0.028, 0.026, 0.024], "carbon", seg=8, ratio=0.38, up=(1, 0, 0))
        out.append(Ps.finish())
    return out


# ───────────────────────────── rodas (só posição e tamanho; o jogo usa a roda do catálogo) e vazios ─────────────────────────────
def wheels_and_empties(exhaust=(0.42, 2.28, 0.26), seat=(0.0, 0.1, 0.80), single_exhaust=False):
    """As quatro rodas (só posição e tamanho: o jogo usa a roda do catálogo, um desenho por eixo) e os vazios do escape e do assento. `exhaust` = (x, y, z) do Blender (a ponta
    à esquerda; a da direita é o espelho; `single_exhaust`: uma ponta só, no `exhaust_l`); cada eixo tem o seu raio e a sua largura (a traseira de um hipercarro é mais larga)."""
    names = (("wheel_fl", "wheel_fr"), ("wheel_rl", "wheel_rr"))
    for ai, a in enumerate(AXLES):
        w = dict(r=a["r"], w=(a["w"] - 0.0077) / 1.044, spokes=5, spoke_in=0.03, spoke_out=0.048)  # a roda de carlib mede 1,044 w + 0,0077 (pneu abaulado e friso do aro): o jogo mede o tamanho pela caixa
        sp = dict(wheel=w)
        for sd, nm in zip((1, -1), names[ai]):
            ob = cl.build_wheel(nm, sp)
            ob["project_wheel"] = True  # o jogo usa a roda do catálogo do estilo; este desenho só dá posição e tamanho
            ob.location = (sd * a["x"], a["z"], w["r"])
            if sd < 0:  # roda da direita (x < 0 no Blender = direita do carro): a face de fora olha para -X
                ob.rotation_euler = (0, 0, math.pi)
            cl.select_only(ob)
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            ob.location = (0, 0, 0)
    cl.empty("exhaust_l", (exhaust[0], exhaust[1], exhaust[2]))
    if not single_exhaust:
        cl.empty("exhaust_r", (-exhaust[0], exhaust[1], exhaust[2]))
    cl.empty("seat", seat)


def debug_backfaces():
    """Só para a prévia: o que o jogo não desenha (faces viradas para dentro) sai em magenta."""
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        nt = m.node_tree
        out = nt.nodes.get("Material Output")
        bsdf = nt.nodes.get("Principled BSDF")
        if out is None or bsdf is None:
            continue
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = (1, 0, 1, 1)
        em.inputs["Strength"].default_value = 3.0
        mix = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(geo.outputs["Backfacing"], mix.inputs["Fac"])
        nt.links.new(bsdf.outputs["BSDF"], mix.inputs[1])
        nt.links.new(em.outputs["Emission"], mix.inputs[2])
        nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])


# (posição da câmera, alvo, lente em mm)
VIEWS = {
    "lateral": ((9, 0, 0.9), (0, 0, 0.7), 70), "frente34": ((-6.2, -6.2, 2.6), (0, 0, 0.7), 70), "tras34": ((6.2, 6.2, 2.6), (0, 0, 0.7), 70),
    "tras": ((0, 9, 1.0), (0, 0, 0.65), 70), "frente": ((0, -9, 0.9), (0, 0, 0.65), 70), "cima": ((0, 0.01, 9), (0, 0, 0.7), 60),
    "tras_perto": ((2.6, 5.2, 1.5), (0, 2.1, 0.6), 60), "tras_perto2": ((-2.4, 5.0, 1.3), (0, 2.1, 0.55), 60), "frente_perto": ((-2.6, -5.0, 1.5), (0, -2.0, 0.55), 60),
    "capo": ((-1.8, -4.4, 2.0), (0, -1.6, 0.6), 60), "corrida": ((0, 9.4, 3.0), (0, 0, 0.75), 55), "lado_perto": ((4.5, 0.2, 1.1), (0, 0.2, 0.6), 60),
    "tras_baixo": ((0, 6.0, 0.5), (0, 2.1, 0.55), 60),
}


def render_views(folder, names, res=(560, 350), samples=12):
    """Prévia por Cycles (CPU): só para iterar na forma; as imagens de aprovação saem do jogo."""
    os.makedirs(folder, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    sc.cycles.device = "CPU"
    sc.render.resolution_x, sc.render.resolution_y = res
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.62, 0.72, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 1.1
    sc.world = w
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    gm = bpy.data.materials.new("g")
    gm.use_nodes = True
    gm.node_tree.nodes["Principled BSDF"].inputs[0].default_value = (0.25, 0.25, 0.26, 1)
    bpy.context.object.data.materials.append(gm)
    sun = bpy.data.lights.new("s", "SUN")
    sun.energy = 3.0
    so = bpy.data.objects.new("s", sun)
    so.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))
    sc.collection.objects.link(so)
    cam = bpy.data.cameras.new("c")
    co = bpy.data.objects.new("c", cam)
    sc.collection.objects.link(co)
    sc.camera = co
    for m in bpy.data.materials:
        if m.name.startswith("paint") or m.name.startswith("stripe") or m.name.startswith("accent"):
            m.node_tree.nodes["Principled BSDF"].inputs[0].default_value = (0.75, 0.05, 0.05, 1) if m.name.startswith("paint") else ((0.9, 0.9, 0.9, 1) if m.name.startswith("stripe") else (0.9, 0.5, 0.05, 1))
    for vn in names:
        loc, tgt, lens = VIEWS[vn]
        co.location = Vector(loc)
        cam.lens = lens
        d = Vector(tgt) - co.location
        co.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = os.path.join(folder, f"heroi-{vn}.png")
        bpy.ops.render.render(write_still=True)


def tri_count(root):
    return sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in root.children if ob.type == "MESH")


def main():
    args = sys.argv[1:]
    out = args[0]
    preview = args[args.index("--preview") + 1] if "--preview" in args else None
    cl.reset_scene()
    cl.MATERIALS.update(HERO_MATERIALS)
    root = cl.empty("lod0")
    body = build_body()
    body.parent = root
    cabin = build_cabin()
    cabin.parent = root
    tree = surface_tree([body, cabin])
    for ob in build_rear(tree) + build_front(tree) + build_sides(tree) + build_glints(tree) + wing():
        if ob is not None:
            ob.parent = root
    wheels_and_empties()
    print("lod0 triângulos:", tri_count(root))
    print("  partes:", {ob.name: sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in root.children if ob.type == "MESH"})
    cl.export_glb(out)
    if preview:
        if "--backfaces" in args:
            debug_backfaces()
        render_views(preview, args[args.index("--views") + 1].split(",") if "--views" in args else ["tras34"],
                     res=(900, 560) if "--big" in args else (560, 350), samples=int(args[args.index("--samples") + 1]) if "--samples" in args else 12)


if __name__ == "__main__":
    main()
