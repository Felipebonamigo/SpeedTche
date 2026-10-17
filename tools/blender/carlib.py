"""Biblioteca de modelagem de carros do Speed Tchê (Blender por script, módulo bpy).

Receita: curvas de perfil (lateral, superior, frontal) -> malha quadrangular por estações -> superfície de subdivisão com vincos ->
vão de roda por booleana -> peças separadas (vidro, farol, lanterna, para-choque, detalhes) -> rodas -> .glb.
Tudo em metros do JOGO. Convenção do Blender: x para a direita do carro, FRENTE EM -Y, z para cima; o exportador glTF
(Y para cima) leva isso à convenção do jogo (frente em +Z no glTF, docs/CONTRATO-DO-ASSET.md).
"""
import math
import bmesh
import bpy
from mathutils import Vector


EXTRA_CUTS = 0   # estilo realista: remendos com mais cortes
ARCH_SEG = 28    # lados do cilindro do vão de roda (lod0)


# ───────────────────────────── curvas ─────────────────────────────
def pchip(points):
    """Interpolação cúbica monótona (Fritsch-Carlson) por (x, y): sem ondulação entre pontos. Fora do intervalo, mantém o valor da ponta."""
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    n = len(xs)
    assert n >= 2 and all(xs[i] < xs[i + 1] for i in range(n - 1)), f"pontos fora de ordem: {points}"
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    if n == 2:
        m = [d[0], d[0]]
    else:
        m[0], m[-1] = d[0], d[-1]
        for i in range(1, n - 1):
            m[i] = 0.0 if d[i - 1] * d[i] <= 0 else 2 * d[i - 1] * d[i] / (d[i - 1] + d[i])
    # extremos: derivada de 3 pontos limitada (mantém a monotonia)
    if n > 2:
        for idx, (a, b) in ((0, (d[0], d[1])), (n - 1, (d[-1], d[-2]))):
            hh = (h[0], h[1]) if idx == 0 else (h[-1], h[-2])
            v = ((2 * hh[0] + hh[1]) * a - hh[0] * b) / (hh[0] + hh[1])
            if v * a <= 0:
                v = 0.0
            elif a * b <= 0 and abs(v) > 3 * abs(a):
                v = 3 * a
            m[idx] = v

    def f(x):
        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]
        i = max(k for k in range(n - 1) if xs[k] <= x)
        t = (x - xs[i]) / h[i]
        t2, t3 = t * t, t * t * t
        return ((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i]
                + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1])
    return f


# ───────────────────────────── materiais ─────────────────────────────
MATERIALS = {
    # nome: (cor, metal, rugosidade, emissivo)  — o jogo lê o NOME (docs/ARTE.md): paint* recebe a cor do carro, headlight*/taillight* acendem.
    "paint": ((1.0, 1.0, 1.0), 0.0, 0.45, None),
    "accent": ((1.0, 1.0, 1.0), 0.0, 0.45, None),
    "glass": ((0.05, 0.075, 0.10), 0.88, 0.05, None),
    "trim": ((0.025, 0.025, 0.028), 0.0, 0.7, None),
    "bumper": ((0.07, 0.07, 0.075), 0.0, 0.62, None),
    "headlight": ((1.0, 0.93, 0.78), 0.0, 0.2, 1.0),
    "taillight": ((1.0, 0.07, 0.05), 0.0, 0.25, 1.0),
    "headlight_dim": ((1.0, 0.93, 0.78), 0.0, 0.2, 0.45),   # coroa da lente do farol (fraca); o miolo é o `headlight` (forte)
    "taillight_dim": ((1.0, 0.07, 0.05), 0.0, 0.25, 0.42),  # coroa da lanterna (o miolo é o `taillight`): como o GT, lente que vai do miolo à borda
    "stripe_a": ((1.0, 1.0, 1.0), 0.0, 0.45, None),         # faixa A do projeto (cor de destaque do carro)
    "stripe_b": ((1.0, 1.0, 1.0), 0.0, 0.45, None),         # faixa B
    "amber": ((1.0, 0.55, 0.06), 0.0, 0.3, None),
    "reflector": ((0.55, 0.55, 0.55), 0.7, 0.3, None),
    "plate": ((0.92, 0.92, 0.88), 0.0, 0.5, None),
    "chrome": ((0.62, 0.64, 0.66), 0.9, 0.25, None),
    "ladder": ((0.78, 0.80, 0.83), 0.85, 0.3, None),        # escada de alumínio do carro da firma (o jogo a balança nas curvas e a derruba no nitro)
    "tire": ((0.03, 0.03, 0.032), 0.0, 0.85, None),
    "rim": ((0.62, 0.64, 0.68), 0.75, 0.32, None),
    "hub": ((0.12, 0.12, 0.13), 0.3, 0.5, None),
}
_mat_cache = {}


def material(name):
    if name in _mat_cache and _mat_cache[name].name in bpy.data.materials:
        return _mat_cache[name]
    col, metal, rough, emit = MATERIALS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*col, 1.0)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*col, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit
    m.diffuse_color = (*col, 1.0)
    _mat_cache[name] = m
    return m


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mat_cache.clear()


# ───────────────────────────── objetos ─────────────────────────────
def new_object(name, bm, mats, parent=None):
    """bmesh -> objeto com os materiais (lista de nomes, na ordem dos índices de material das faces)."""
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for mn in mats:
        me.materials.append(material(mn))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob


def empty(name, loc=(0, 0, 0), parent=None):
    ob = bpy.data.objects.new(name, None)
    ob.location = loc
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob


def select_only(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def apply_modifier(ob, mod):
    select_only(ob)
    bpy.ops.object.modifier_apply(modifier=mod.name)


# ───────────────────────────── o casco por estações ─────────────────────────────
RING_HALF = 9  # P0 (centro do assoalho) ... P8 (centro do teto)
STRIPS = 8


def ring_points(sp, y):
    """Os 9 pontos (x, z) do lado direito do anel na estação y, a partir das curvas do spec."""
    c = sp["curves"]
    g = lambda k: c[k](y)
    fl, belt, top = g("floor"), g("belt"), g("top")
    hwb, hwl, hwr = g("hwb"), g("hwl"), g("hwr")
    bulge = g("bulge")
    h = max(top - belt, 0.0)
    zlow = fl + (belt - fl) * 0.36
    z4 = belt + min(0.035, h * 0.5)
    z6 = max(top - min(0.035, h * 0.5), z4)
    z5 = z4 + (z6 - z4) * 0.80
    xr = hwr
    pts = [
        (0.0, fl),
        (hwl, fl + g("sill")),
        (hwl + (hwb - hwl) * 0.55 + bulge, zlow),
        (hwb, belt),
        (hwb - g("belt_in"), z4),
        (hwb - g("belt_in") + (xr - (hwb - g("belt_in"))) * 0.16, z5),
        (xr, z6),
        (xr * 0.55, top - g("crown") * 0.45),
        (0.0, top),
    ]
    return pts


def build_shell(sp, lod):
    """Gaiola quadrangular do casco com vincos; devolve (objeto, lista de y das estações)."""
    ys = sp["stations"]
    bm = bmesh.new()
    rings = []
    for y in ys:
        pts = ring_points(sp, y)
        right = pts[1:8]
        left = [(-x, z) for (x, z) in reversed(pts[1:8])]
        full = [pts[0]] + right + [pts[8]] + left  # 16 pontos
        rings.append([bm.verts.new((x, y, z)) for (x, z) in full])
    n = len(rings[0])
    crease = bm.edges.layers.float.get("crease_edge") or bm.edges.layers.float.new("crease_edge")

    def strip_of(j):  # anel j -> j+1: índice da faixa 0..7 (espelhada)
        return j if j < 8 else 15 - j

    mat_names = []

    def mi(name):
        if name not in mat_names:
            mat_names.append(name)
        return mat_names.index(name)

    for i in range(len(ys) - 1):
        for j in range(n):
            a, b = rings[i][j], rings[i][(j + 1) % n]
            c2, d = rings[i + 1][(j + 1) % n], rings[i + 1][j]
            f = bm.faces.new((a, d, c2, b))  # ordem corrigida abaixo pelo recalc
            f.material_index = mi(sp["material_of"](ys[i], ys[i + 1], strip_of(j), j))
    # tampas: faixas horizontais (o painel da frente e o da traseira levam materiais por altura: para-choque embaixo, pintura em cima)
    for e, ring in ((0, rings[0]), (1, rings[-1])):
        yk = ys[0] if e == 0 else ys[-1]
        tri_bottom = bm.faces.new((ring[0], ring[1], ring[15]))
        tri_bottom.material_index = mi(sp["cap_material_of"](yk, 0))
        for k in range(1, 7):
            f = bm.faces.new((ring[k], ring[k + 1], ring[15 - k], ring[16 - k]))
            f.material_index = mi(sp["cap_material_of"](yk, k))
        tri_top = bm.faces.new((ring[7], ring[8], ring[9]))
        tri_top.material_index = mi(sp["cap_material_of"](yk, 7))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # vincos: arestas ao longo (mesmo ponto do anel, estações vizinhas) nos pontos marcados; transversais nas estações marcadas
    for e in bm.edges:
        vs = [(si, j) for si, ring in enumerate(rings) for j, v in enumerate(ring) if v in e.verts] if False else None
    index = {}
    for si, ring in enumerate(rings):
        for j, v in enumerate(ring):
            index[v.index] = (si, j)
    for e in bm.edges:
        (s0, j0), (s1, j1) = index[e.verts[0].index], index[e.verts[1].index]
        if j0 == j1 and s0 != s1:  # longitudinal
            pj = j0 if j0 < 9 else 16 - j0
            if pj in sp["crease_points"]:
                e[crease] = sp["crease_points"][pj]
        elif s0 == s1 and j0 != j1:  # transversal
            if s0 in (0, len(ys) - 1):
                e[crease] = sp.get("end_crease", 0.6)
            elif ys[s0] in sp.get("crease_stations", ()):
                e[crease] = 0.8
    bm.normal_update()
    ob = new_object("body", bm, mat_names)
    return ob


def subsurf(ob, levels):
    if levels <= 0:
        return
    mod = ob.modifiers.new("subsurf", "SUBSURF")
    mod.levels = levels
    mod.render_levels = levels
    mod.use_creases = True
    apply_modifier(ob, mod)


# ───────────────────────────── vão de roda ─────────────────────────────
def cut_wheel_arches(ob, sp, lod):
    seg = ARCH_SEG if lod == 0 else 14
    for (y, side) in sp["wheel_positions"]():
        r = sp["wheel"]["r"] + sp["wheel"]["arch_gap"]
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=0.80)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__("mathutils").Matrix.Rotation(math.pi / 2, 3, "Y"))
        me = bpy.data.meshes.new("cut")
        bm.to_mesh(me)
        bm.free()
        cut = bpy.data.objects.new("cut", me)
        bpy.context.scene.collection.objects.link(cut)
        cut.location = (side * (sp["axle_x"] - sp["wheel"]["w"] / 2 - 0.12 + 0.40), y, sp["wheel"]["r"])
        mod = ob.modifiers.new("arch", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.solver = "EXACT"
        mod.object = cut
        apply_modifier(ob, mod)
        bpy.data.objects.remove(cut)


def symmetrize(ob):
    """Espelha o lado esquerdo sobre o direito: a booleana e a triangulação saem um pouco diferentes de cada lado, e o carro tem de ser simétrico."""
    select_only(ob)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.symmetrize(direction="NEGATIVE_X", threshold=1e-4)
    bpy.ops.object.mode_set(mode="OBJECT")


def wheel_wells(sp, lod):
    """Meia-calha escura sobre cada roda (o fundo do vão): sem ela o vão deixaria ver o oco do casco."""
    bm = bmesh.new()
    seg = 14 if lod == 0 else 8
    r = sp["wheel"]["r"] + sp["wheel"]["arch_gap"] - 0.004
    cz = sp["wheel"]["r"]
    for (y, side) in sp["wheel_positions"]():
        x0 = sp["axle_x"] - sp["wheel"]["w"] / 2 - 0.08
        x1 = min(sp["axle_x"] + sp["wheel"]["w"] / 2 + 0.07, 0.985)  # a calha não pode passar da pegada (|x| ≤ 1,0)
        ring0, ring1 = [], []
        for k in range(seg + 1):
            a = math.pi * k / seg  # 0..180 graus, por cima da roda
            py, pz = y + r * math.cos(a), cz + r * math.sin(a)
            ring0.append(bm.verts.new((side * x0, py, pz)))
            ring1.append(bm.verts.new((side * x1, py, pz)))
        for k in range(seg):
            f = bm.faces.new((ring0[k], ring0[k + 1], ring1[k + 1], ring1[k]))
            f.material_index = 0
            c = f.calc_center_median()
            if f.normal.dot(Vector((c.x, y, cz)) - c) < 0:  # a face visível olha para o eixo da roda
                f.normal_flip()
    return new_object("wheel_wells", bm, ["trim"])


# ───────────────────────────── decalques projetados (farol, lanterna, grade, placa) ─────────────────────────────
def patch(name, outline, mat, target, axis, offset=0.006, cuts=1, plane_y=0.0, direction=0):
    """Remendo plano com o contorno `outline` (lista de (x, z) na vista de frente/trás, ou (y, z) na vista lateral) projetado sobre o casco `target`.
    `axis`: 'y' projeta ao longo de Y (frente/traseira), 'x' ao longo de X (lateral). `offset`: folga sobre a pele (m)."""
    bm = bmesh.new()
    if axis == "y":
        vs = [bm.verts.new((x, plane_y, z)) for (x, z) in outline]
    elif axis == "z":  # por cima: o contorno é (x, y) e o remendo nasce acima do casco, disparando para baixo
        vs = [bm.verts.new((x, y, plane_y)) for (x, y) in outline]
    else:
        vs = [bm.verts.new((plane_y, x, z)) for (x, z) in outline]
    bm.faces.new(vs)
    if axis == "y" and plane_y > 0:  # a traseira olha para +Y: o contorno (x, z) anti-horário dá normal −Y, então inverte (sem isso o jogo esconde a face)
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    for _ in range(cuts):
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=False)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
    ob = new_object(name, bm, [mat])
    mod = ob.modifiers.new("wrap", "SHRINKWRAP")
    mod.target = target
    mod.wrap_method = "PROJECT"
    mod.use_project_x = axis == "x"
    mod.use_project_y = axis == "y"
    mod.use_project_z = axis == "z"
    # o remendo nasce FORA do casco e dispara só para dentro (direction +1: +Y/+X; -1: -Y/-X), para não achar a pele do outro lado
    mod.use_negative_direction = direction <= 0
    mod.use_positive_direction = direction >= 0
    mod.cull_face = "OFF"
    mod.offset = offset
    mod.project_limit = 0.0
    apply_modifier(ob, mod)
    # o que a projeção não alcançou (fora da pegada do casco no canto) cola na pele mais próxima
    mod2 = ob.modifiers.new("snap", "SHRINKWRAP")
    mod2.target = target
    mod2.wrap_method = "NEAREST_SURFACEPOINT"
    mod2.offset = offset
    apply_modifier(ob, mod2)
    return ob


def rounded_rect(cx, cz, w, h, r, seg=2):
    """Contorno de retângulo de cantos arredondados (lista de (x, z), sentido anti-horário)."""
    r = min(r, w / 2, h / 2)
    pts = []
    for (qx, qz, a0) in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ccx, ccz = cx + qx * (w / 2 - r), cz + qz * (h / 2 - r)
        for k in range(seg + 1):
            a = math.radians(a0 + 90 * k / seg)
            pts.append((ccx + r * math.cos(a), ccz + r * math.sin(a)))
    return pts


def mirror_outline(outline):
    return [(-x, z) for (x, z) in reversed(outline)]


# ───────────────────────────── peças pequenas ─────────────────────────────
def box_part(bm, c, size, mat_index=0, taper=0.0):
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    vs = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                t = taper if sz > 0 else 0
                vs.append(bm.verts.new((c[0] + sx * (hx - t), c[1] + sy * hy, c[2] + sz * hz)))
    idx = lambda sx, sy, sz: ((sx > 0) << 2) | ((sy > 0) << 1) | (sz > 0)
    faces = [((-1, -1, -1), (-1, 1, -1), (-1, 1, 1), (-1, -1, 1)), ((1, -1, -1), (1, -1, 1), (1, 1, 1), (1, 1, -1)),
             ((-1, -1, -1), (-1, -1, 1), (1, -1, 1), (1, -1, -1)), ((-1, 1, -1), (1, 1, -1), (1, 1, 1), (-1, 1, 1)),
             ((-1, -1, 1), (-1, 1, 1), (1, 1, 1), (1, -1, 1)), ((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1))]
    out = []
    for f in faces:
        face = bm.faces.new([vs[idx(*p)] for p in f])
        face.material_index = mat_index
        out.append(face)
    bmesh.ops.recalc_face_normals(bm, faces=out)
    return out


def cylinder_part(bm, c, r, length, axis="y", seg=8, mat_index=0, r2=None):
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=length)
    verts = res["verts"]
    rot = {"x": __import__("mathutils").Matrix.Rotation(math.pi / 2, 3, "Y"), "y": __import__("mathutils").Matrix.Rotation(math.pi / 2, 3, "X"),
           "z": __import__("mathutils").Matrix.Identity(3)}[axis]
    bmesh.ops.rotate(bm, verts=verts, cent=(0, 0, 0), matrix=rot)
    bmesh.ops.translate(bm, verts=verts, vec=c)
    for f in {f for v in verts for f in v.link_faces}:
        f.material_index = mat_index
    return verts


# ───────────────────────────── rodas ─────────────────────────────
def build_wheel(name, sp):
    """Roda no tamanho do jogo, eixo em X, centro na origem, face de fora em +X: pneu de ombro arredondado, aro com friso, prato escuro e raios."""
    w = sp["wheel"]
    r, ww, n = w["r"], w["w"], w["spokes"]
    bm = bmesh.new()
    prof = [(r * 0.60, -ww * 0.50), (r * 0.78, -ww * 0.53), (r * 0.945, -ww * 0.47), (r, -ww * 0.30), (r, ww * 0.30),
            (r * 0.945, ww * 0.47), (r * 0.78, ww * 0.53), (r * 0.62, ww * 0.50)]
    seg = 8 * n // math.gcd(8, n) if n else 16
    seg = max(seg, 16)
    while seg < 20:
        seg *= 2
    pt = lambda x, rad, a: bm.verts.new((x, rad * math.cos(a), rad * math.sin(a)))
    ang = lambda k: 2 * math.pi * k / seg
    rings = [[pt(px, pr, ang(k)) for k in range(seg)] for (pr, px) in prof]
    for i in range(len(prof) - 1):
        for k in range(seg):
            f = bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
            f.material_index = 0
    x_out = ww * 0.50
    rim_r = r * 0.62
    lip = [pt(x_out + 0.012, rim_r * 0.97, ang(k)) for k in range(seg)]
    dish = [pt(x_out - 0.045, rim_r * 0.82, ang(k)) for k in range(seg)]
    ctr = bm.verts.new((x_out - 0.052, 0, 0))
    for k in range(seg):
        k1 = (k + 1) % seg
        bm.faces.new((rings[-1][k], rings[-1][k1], lip[k1], lip[k])).material_index = 1       # friso do aro
        bm.faces.new((lip[k], lip[k1], dish[k1], dish[k])).material_index = 1               # lábio do aro
        bm.faces.new((dish[k], dish[k1], ctr)).material_index = 2                            # prato escuro
    # raios: trapézios do cubo ao aro, um pouco acima do prato
    hub_r, sw_in, sw_out = rim_r * 0.20, w.get("spoke_in", 0.030), w.get("spoke_out", 0.045)
    for s in range(n):
        a = 2 * math.pi * s / n
        c, sn = math.cos(a), math.sin(a)
        def p(rad, half, xo):
            return bm.verts.new((xo, rad * c - half * sn, rad * sn + half * c))
        v = [p(hub_r, -sw_in, x_out - 0.02), p(hub_r, sw_in, x_out - 0.02), p(rim_r * 0.84, sw_out, x_out - 0.012), p(rim_r * 0.84, -sw_out, x_out - 0.012)]
        bm.faces.new(v).material_index = 1
    # tampa do cubo (calota): disco que sobe do prato
    cap_r = hub_r * 1.6
    cap = [pt(x_out - 0.012, cap_r, ang(k * (seg // 10 or 1))) for k in range(10)] if False else [pt(x_out - 0.012, cap_r, 2 * math.pi * k / 10) for k in range(10)]
    cctr = bm.verts.new((x_out - 0.004, 0, 0))
    for k in range(10):
        bm.faces.new((cap[k], cap[(k + 1) % 10], cctr)).material_index = 1
    for f in bm.faces:  # orientação explícita: pneu para fora do eixo; aro, prato e raios para +X
        c = f.calc_center_median()
        if f.material_index == 0:
            if f.normal.dot(Vector((0, c.y, c.z))) < 0:
                f.normal_flip()
        elif f.normal.x < 0:
            f.normal_flip()
    ob = new_object(name, bm, ["tire", "rim", "hub"])
    ob["spokes"] = n
    return ob


# ───────────────────────────── exportação ─────────────────────────────
def export_glb(path):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", export_yup=True, export_apply=True, export_extras=True,
        export_materials="EXPORT", export_normals=True, export_texcoords=False, export_cameras=False, export_lights=False,
        export_image_format="NONE", use_selection=False,
    )


# ───────────────────────────── montagem ─────────────────────────────
def split_material(ob, mat_name, new_name):
    """Tira do objeto as faces de um material e as devolve como outro objeto (peça separada)."""
    me = ob.data
    idx = [i for i, m in enumerate(me.materials) if m and m.name == mat_name]
    if not idx:
        return None
    bm = bmesh.new()
    bm.from_mesh(me)
    sel = [f for f in bm.faces if f.material_index == idx[0]]
    if not sel:
        bm.free()
        return None
    nb = bmesh.new()
    vmap = {}
    for f in sel:
        vs = []
        for v in f.verts:
            if v.index not in vmap:
                vmap[v.index] = nb.verts.new(v.co)
            vs.append(vmap[v.index])
        nf = nb.faces.new(vs)
        nf.material_index = 0
    bmesh.ops.delete(bm, geom=sel, context="FACES")
    bm.to_mesh(me)
    bm.free()
    part = new_object(new_name, nb, [mat_name])
    part.parent = ob.parent
    return part


def half_outline(outline):
    """Metade x >= 0 de um contorno (corte pelo plano x = 0, Sutherland-Hodgman)."""
    out = []
    n = len(outline)
    for i in range(n):
        a, b = outline[i], outline[(i + 1) % n]
        ina, inb = a[0] >= 0, b[0] >= 0
        if ina:
            out.append(a)
        if ina != inb:
            t = a[0] / (a[0] - b[0])
            out.append((0.0, a[1] + (b[1] - a[1]) * t))
    return out


def mirrored_copy(ob, name):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for v in bm.verts:
        v.co.x = -v.co.x
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    mats = [m.name for m in ob.data.materials]
    return new_object(name, bm, mats)


def add_patches(sp, body, lod, parent):
    """Remendos do spec (farol, lanterna, grade, pisca, placa...) projetados sobre o casco, juntados por grupo."""
    groups = {}
    for p in sp["patches"]:
        if lod == 1 and not p.get("lod1", False):
            continue
        face = p.get("end", "front")  # frente (y < 0), traseira (y > 0), lado (x) ou topo (z)
        base = f"{p['group']}_{p['name']}"
        center = not p.get("mirror", True)  # remendo no eixo do carro: a metade x >= 0 e o espelho dela (a triangulação sai simétrica)
        outline = half_outline(p["outline"]) if center else p["outline"]
        if face == "side":
            ob = patch(base + "_l", outline, p["mat"], body, "x", offset=p.get("offset", 0.006), cuts=0 if lod == 1 else p.get("cuts", 1),
                       plane_y=3.0, direction=-1)
        elif face == "top":
            ob = patch(base + "_l", outline, p["mat"], body, "z", offset=p.get("offset", 0.006), cuts=0 if lod == 1 else p.get("cuts", 1),
                       plane_y=4.0, direction=-1)
        else:
            ob = patch(base + "_l", outline, p["mat"], body, p.get("axis", "y"),
                       offset=p.get("offset", 0.006), cuts=0 if lod == 1 else p.get("cuts", 1) + EXTRA_CUTS,
                       plane_y=-3.0 if face == "front" else 3.0, direction=1 if face == "front" else -1)
        groups.setdefault(p["group"], []).append(ob)
        if True:  # o outro lado é o ESPELHO da malha (e não o contorno espelhado, que triangula diferente)
            groups[p["group"]].append(mirrored_copy(ob, base + "_r"))
    misc = add_misc(sp, lod)
    if misc is not None:
        groups.setdefault("details", []).append(misc)
    out = []
    for g, obs in groups.items():
        select_only(obs[0])
        for o in obs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = obs[0]
        bpy.ops.object.join()
        j = bpy.context.view_layer.objects.active
        j.name = g
        j.data.name = g
        j.parent = parent
        out.append(j)
    return out


def add_misc(sp, lod):
    """Peças pequenas do spec: espelho, maçaneta, ponteira do escapamento. (nome, material, centro, tamanho, afunilamento); espelhadas em x."""
    if lod == 1 or not (sp.get("misc") or sp.get("cyls")):
        return None
    bm = bmesh.new()
    mats = []
    if sp.get("exhaust_tip"):
        ex = sp["exhaust"]
        mats.append("chrome")
        for sd in (1, -1):
            cylinder_part(bm, (sd * ex[0], ex[1] + 0.03, ex[2]), 0.042, 0.14, axis="y", seg=8, mat_index=0)
    for (mat, c, r, length, axis, seg) in sp.get("cyls", []):  # cilindros (estepe, ponteiras extras): (material, centro, raio, comprimento, eixo, lados), espelhados só se x != 0
        if mat not in mats:
            mats.append(mat)
        for sd in ((1, -1) if abs(c[0]) > 1e-6 else (1,)):
            cylinder_part(bm, (sd * c[0], c[1], c[2]), r, length, axis=axis, seg=seg, mat_index=mats.index(mat))
    for (nm, mat, c, size, taper) in sp["misc"]:
        if mat not in mats:
            mats.append(mat)
        for sd in (1, -1):
            box_part(bm, (sd * c[0], c[1], c[2]), size, mats.index(mat), taper)
    return new_object("details_misc", bm, mats)


def finish_wheels_and_empties(sp):
    w = sp["wheel"]
    for nm, (y, sd) in zip(("wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"), sp["wheel_positions"]()):
        ob = build_wheel(nm, sp)
        if sp.get("project_wheel"):
            ob["project_wheel"] = True  # o jogo usa a roda do catálogo do estilo; este desenho só dá posição e tamanho
        ob.location = (sd * sp["axle_x"], y, w["r"])
        if sd < 0:  # roda da direita (x < 0 no Blender = direita do carro): a face de fora olha para -X
            ob.rotation_euler = (0, 0, math.pi)
        select_only(ob)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        ob.location = (0, 0, 0)
    ex = sp["exhaust"]
    empty("exhaust_l", (ex[0], ex[1], ex[2]))
    empty("exhaust_r", (-ex[0], ex[1], ex[2]))
    empty("seat", sp["seat"])


def make_material_of(cowl, roof_f, roof_r, glass_b, side, black=(), bumper_nose=-1.86, bumper_tail=None):
    """Regra de material da gaiola de um hatch: vidros entre as colunas, friso preto da cintura e do teto, para-choque embaixo nas pontas."""
    e = 1e-6

    def material_of(y0, y1, strip, j):
        nose = y1 <= bumper_nose + e
        tail = y0 >= (glass_b if bumper_tail is None else bumper_tail) - e
        if (nose or tail) and strip in (0, 1):
            return "bumper"
        if strip == 0:
            return "trim"
        cab = cowl - e <= y0 and y1 <= glass_b + e
        if strip == 3 and cab:
            return "trim"  # friso preto da cintura
        if strip == 4:
            if any(a - e <= y0 and y1 <= b + e for a, b in side) or (roof_r - e <= y0 and y1 <= glass_b + e):
                return "glass"
            return "trim" if any(a - e <= y0 and y1 <= b + e for a, b in black) else "paint"  # coluna B preta; A e C na cor do carro
        if strip == 5:
            return "paint"
        if strip in (6, 7) and ((cowl - e <= y0 and y1 <= roof_f + e) or (roof_r - e <= y0 and y1 <= glass_b + e)):
            return "glass"
        return "paint"
    return material_of


def cap_material_of(y, strip):
    """Painel da frente e da traseira: para-choque embaixo, pintura em cima."""
    return "bumper" if strip <= 1 else "paint"


def scaled_outline(outline, k):
    """Contorno ampliado em torno do centro (moldura de um farol ou lanterna de forma qualquer)."""
    cx = sum(p[0] for p in outline) / len(outline)
    cz = sum(p[1] for p in outline) / len(outline)
    return [(cx + (x - cx) * k, cz + (z - cz) * k) for (x, z) in outline]


def line_strip(points, width):
    """Faixa fina ao longo de uma linha (lista de (a, z)): contorno com os pontos da linha em cima e embaixo (sem subdivisão: a projeção segue os pontos)."""
    up = [(a, z + width) for (a, z) in points]
    return list(points) + list(reversed(up))


# ───────────────────────────── conjuntos de detalhe (rodada 2) ─────────────────────────────
def lamp_stack(group, name, outline, layers, end="front", base=0.004, step=0.005, lod1_from=None, cuts=1):
    """Farol ou lanterna em camadas, de fora para dentro (moldura, aro, refletor, coroa, miolo): cada camada é o contorno reduzido em torno do centro,
    uma casca mais alta que a anterior. `layers`: lista de (material, escala). Devolve dicts de remendo para o spec."""
    out = []
    for i, (mat, k) in enumerate(layers):
        out.append(dict(group=group, name=f"{name}{i}", mat=mat, outline=scaled_outline(outline, k), end=end, offset=base + step * i,
                        cuts=cuts, lod1=(lod1_from is not None and i == lod1_from)))
    return out


def arch_flares(sp, width=0.045, off=0.010, cuts=1, mat="bumper"):
    """Alargamento dos para-lamas: anel de plástico escuro por cima do vão de cada roda (frente e trás), projetado na lateral."""
    r_in = sp["wheel"]["r"] + sp["wheel"]["arch_gap"] + 0.002
    cz = sp["wheel"]["r"]
    out = []
    for (y, sd) in sp["wheel_positions"]():
        if sd < 0:
            continue
        outer = [(y + (r_in + width) * math.cos(a), cz + (r_in + width) * math.sin(a)) for a in [math.radians(8 + 164 * k / 12) for k in range(13)]]
        inner = [(y + r_in * math.cos(a), cz + r_in * math.sin(a)) for a in [math.radians(8 + 164 * k / 12) for k in range(13)]]
        out.append(dict(end="side", group="details", name=f"flare{int(y * 100)}", mat=mat, axis="x", outline=outer + list(reversed(inner)), offset=off, cuts=cuts, lod1=False))
    return out


def teardrop(cx, cz, r, tdx, tdz, n=16):
    """Contorno em gota: círculo de raio r com a ponta esticada na direção (tdx, tdz) (comprimento da ponta = |tdx, tdz|)."""
    L = math.hypot(tdx, tdz)
    ang = math.atan2(tdz, tdx)
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n
        stretch = max(0.0, math.cos(a - ang)) ** 4 * L
        pts.append((cx + (r + stretch) * math.cos(a), cz + (r + stretch) * math.sin(a)))
    return pts


def std_details(sp, door_ys, belt_pts, nose_z, tail_z, bf=(1.66, 0.40), br=(1.50, 0.40), flap=None, plate_f_z=0.47, plate_r_z=0.60, zdoor=(0.32, 0.93), cuts=1, drop=(), flare=None):
    """Detalhes que todo carro leva (rodada 2): para-choques com volume e friso claro, entrada de ar e placas, friso da cintura, soleira, frisos de porta,
    alargamento dos para-lamas. `belt_pts`: [(y, z)] da cintura; `bf`/`br`: (largura, altura) do para-choque da frente e de trás."""
    out = [
        dict(group="details", name="para_choque_f", mat="bumper", outline=rounded_rect(0.0, bf[1], bf[0], 0.19, 0.05), offset=0.022, mirror=False, cuts=1, lod1=False),
        dict(group="details", name="friso_f", mat="chrome", outline=rounded_rect(0.0, bf[1] + 0.107, bf[0] - 0.16, 0.016, 0.006), offset=0.027, mirror=False, cuts=1, lod1=False),
        dict(group="details", name="entrada", mat="trim", outline=rounded_rect(0.0, bf[1] - 0.015, bf[0] * 0.5, 0.09, 0.03), offset=0.027, mirror=False, cuts=1, lod1=False),
        dict(group="details", name="placa_f", mat="plate", outline=rounded_rect(0.0, plate_f_z, 0.28, 0.085, 0.01), offset=0.030, mirror=False, cuts=0, lod1=False),
        dict(end="rear", group="details", name="para_choque_t", mat="bumper", outline=rounded_rect(0.0, br[1], br[0], 0.19, 0.05), offset=0.022, mirror=False, cuts=1, lod1=False),
        dict(end="rear", group="details", name="friso_t", mat="chrome", outline=rounded_rect(0.0, br[1] + 0.107, br[0] - 0.16, 0.016, 0.006), offset=0.027, mirror=False, cuts=1, lod1=False),
        dict(end="rear", group="details", name="tampa", mat="trim", outline=rounded_rect(0.0, br[1] + 0.10, br[0] - 0.3, 0.012, 0.004), offset=0.005, mirror=False, cuts=1, lod1=False),
        dict(end="rear", group="details", name="placa_t", mat="plate", outline=rounded_rect(0.0, plate_r_z, 0.30, 0.095, 0.01), offset=0.008, mirror=False, cuts=0, lod1=False),
        dict(end="side", group="details", name="cintura", mat="chrome", axis="x", outline=line_strip(belt_pts, 0.012), offset=0.006, cuts=0, lod1=False),
        dict(end="side", group="details", name="soleira", mat="trim", axis="x", outline=line_strip([(door_ys[0] - 0.08, 0.255), (0.0, 0.255), (door_ys[-1] - 0.18, 0.255)], 0.045), offset=0.012, cuts=0, lod1=False),
        *[dict(end="side", group="details", name=f"porta{i}", mat="trim", axis="x", outline=[(y - 0.006, zdoor[0]), (y + 0.006, zdoor[0]), (y + 0.006, zdoor[1]), (y - 0.006, zdoor[1])], offset=0.004, cuts=2, lod1=False) for i, y in enumerate(door_ys)],
        *( [dict(end="side", group="details", name="tampa_comb", mat="trim", axis="x", outline=rounded_rect(flap[0], flap[1], 0.17, 0.17, 0.05, seg=4), offset=0.006, cuts=1, lod1=False),
            dict(end="side", group="details", name="tampa_comb_i", mat="chrome", axis="x", outline=rounded_rect(flap[0], flap[1], 0.12, 0.12, 0.04, seg=4), offset=0.010, cuts=1, lod1=False)] if flap else []),
        *arch_flares(sp, cuts=cuts, **(flare or {})),
    ]
    # poda (V6c, lote 3): `cuts` rebaixa a subdivisão dos remendos de forma simples e `drop` tira os detalhes que não leem de longe
    for p in out:
        if p.get('cuts', 0) == 1:
            p['cuts'] = cuts
    return [p for p in out if p['name'] not in drop]


def add_ladder(sp, lod):
    """Escada de alumínio no teto do carro da firma + bagageiro: caixas finas no material `ladder` (o jogo a balança: popup 0,5 no pincel) e `trim` no bagageiro."""
    L = sp.get("ladder")
    if not L:
        return None
    bm = bmesh.new()
    mats = ["ladder", "trim"]
    z = L["z"]
    y0, y1 = L["y"]
    for sd in (1, -1):
        box_part(bm, (sd * L["x"], (y0 + y1) / 2, z), (0.045, y1 - y0, 0.07), 0, 0.0)
    if lod == 0:
        n = max(2, int((y1 - y0) / 0.27))
        for i in range(n + 1):
            box_part(bm, (0, y0 + 0.07 + (y1 - y0 - 0.14) * i / n, z), (2 * L["x"] - 0.04, 0.035, 0.04), 0, 0.0)
        for y in L["rack"]:
            for sd in (1, -1):
                box_part(bm, (sd * L["x"], y, z - 0.08), (0.05, 0.05, 0.08), 1, 0.0)
    return new_object("ladder", bm, mats)


def ridge(y0, y1, half_w, n=6):
    """Faixa fina ao longo do eixo do carro (vinco do capô, friso do teto): contorno (x, y) para o remendo `end="top"`."""
    ys = [y0 + (y1 - y0) * i / n for i in range(n + 1)]
    return [(-half_w, y) for y in ys] + [(half_w, y) for y in reversed(ys)]
