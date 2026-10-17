# BASE (origem): Detonauto `Tools/Blender/make_cuiabano.py`, de Felipe Bonamigo (github.com/Felipebonamigo/detonauto, commit 13cc970). Cópia sem alteração,
# só para conferir a silhueta realista (preview_detonauto.py) e para as proporções de specs/cuiabano.py. O Speed Tchê usa carlib.py.
"""
Cuiabano, o hatch compacto quadradão do tráfego nacional (docs/carros-nacionais.md). Modelo PRÓPRIO feito por script, sem marca, logo nem
emblema: proporções de hatch compacto de anos 90 (3,90 x 1,65 x 1,42 m), capô baixo, para-brisa em pé, traseira quase vertical. Eixos do
Blender como no carro do jogo: frente +X, esquerda +Y, cima +Z, metros, origem no chão no centro do carro.

Como é montado: cada volume (carroceria baixa e cabine) nasce de uma caixa subdividida cujos vértices são levados para a forma pelas
funções de perfil de PARAMS (a silhueta lateral e a largura em cada altura); depois vêm as quinas chanfradas, os vidros (recortados na
cabine por planos nas colunas) e as peças: rodas, para-choques, faróis, lanternas, grade, retrovisores, placa.

Uso (dentro do Blender):
    blender -b -P Tools/Blender/make_cuiabano.py -- --out-dir Sandbox/cuiabano [--renders docs/img/carros] [--no-export]
"""
import argparse
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

# --- parâmetros do desenho (metros) ---
PARAMS = {
    "length": 3.90,
    "ground": 0.17,          # vão livre embaixo (a base da carroceria)
    "belt": 0.90,            # linha de cintura (topo da carroceria baixa atrás do capô)
    "hood_front": 0.72,      # altura do capô na frente
    "hood_end_x": 0.58,      # onde o capô acaba (base do para-brisa)
    "hood_end_z": 0.86,
    "roof": 1.42,
    "width_bottom": 0.74,    # meia largura na base
    "width_shoulder": 0.815, # meia largura no ombro (a parte mais larga)
    "width_top": 0.745,      # meia largura no topo da carroceria baixa
    "shoulder_v": 0.52,      # altura relativa do ombro (0 base, 1 topo)
    "nose_taper": 0.075,     # quanto a frente e a traseira se estreitam (meia largura, m)
    "wind_base_x": 0.62,     # para-brisa: base e topo (x)
    "wind_top_x": 0.07,
    "rear_base_x": -1.93,    # vidro traseiro: base e topo (x); a tampa do hatch quase colada no vidro
    "rear_top_x": -1.50,
    "cabin_w_base": 0.725,   # meia largura da cabine na base e no teto (tumblehome)
    "cabin_w_top": 0.60,
    "wheel_r": 0.285,
    "wheel_w": 0.17,
    "wheel_x_front": 1.19,
    "wheel_x_rear": -1.17,
    "track": 0.705,
    "arch_r": 0.37,
}

# materiais por nome (o Unreal liga cada um pelo nome do slot) e a cor de pré-visualização
MATERIALS = {
    "Body": (0.80, 0.80, 0.78, 1.0),       # pintura (o jogo põe o material de amassado e a cor do carro)
    "Chassi": (0.02, 0.02, 0.025, 1.0),    # plástico preto, grade, vãos
    "Glass": (0.05, 0.08, 0.10, 1.0),
    "Lights": (0.9, 0.85, 0.7, 1.0),       # lentes dos faróis e das lanternas (separadas por ilha, como no template)
    "Rim": (0.55, 0.56, 0.58, 1.0),
    "Tire": (0.015, 0.015, 0.015, 1.0),
}


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3.0 - 2.0 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def parse_args(argv):
    parser = argparse.ArgumentParser(prog="make_cuiabano.py")
    parser.add_argument("--out-dir", default="Sandbox/cuiabano")
    parser.add_argument("--renders", default="")
    parser.add_argument("--no-export", action="store_true")
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(args)


def material(name):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
        mat.diffuse_color = MATERIALS[name]
    return mat


def new_mesh_object(name, bm, mats):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(material(m))
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def box_grid(nx, ny, nz):
    """Caixa de [-1,1] x [-1,1] x [0,1] com nx x ny x nz divisões (u, s, v), como bmesh. Cada eixo tem a sua contagem: o corte dos arcos
    das rodas pede malha fina ao longo do carro (X) e da altura (Z) e grossa na largura (Y)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    for v in bm.verts:
        v.co.z = (v.co.z + 1.0) * 0.5
    for axis, n in ((0, nx), (1, ny), (2, nz)):
        if n < 2:
            continue
        # arestas paralelas ao eixo: as que só mudam nessa coordenada
        edges = [e for e in bm.edges if abs(e.verts[0].co[axis] - e.verts[1].co[axis]) > 1e-6
                 and all(abs(e.verts[0].co[o] - e.verts[1].co[o]) < 1e-6 for o in range(3) if o != axis)]
        bmesh.ops.subdivide_edges(bm, edges=edges, cuts=n - 1, use_grid_fill=True)
    return bm


def body_top(x):
    """Altura do topo da carroceria baixa em x: o capô desce para a frente; atrás do para-brisa fica na linha de cintura."""
    p = PARAMS
    half = p["length"] / 2.0
    if x >= p["hood_end_x"]:
        t = (x - p["hood_end_x"]) / (half - p["hood_end_x"])
        return lerp(p["hood_end_z"], p["hood_front"], smoothstep(0.0, 1.0, t) * 0.55 + t * 0.45)
    return p["belt"] + 0.012 * smoothstep(p["hood_end_x"], -0.8, x)


def body_halfwidth(x, v):
    p = PARAMS
    half = p["length"] / 2.0
    if v <= p["shoulder_v"]:
        w = lerp(p["width_bottom"], p["width_shoulder"], smoothstep(0.0, 1.0, v / p["shoulder_v"]))
    else:
        w = lerp(p["width_shoulder"], p["width_top"], smoothstep(0.0, 1.0, (v - p["shoulder_v"]) / (1.0 - p["shoulder_v"])))
    return w - p["nose_taper"] * smoothstep(half - 0.55, half, abs(x))


def build_lower_body():
    p = PARAMS
    half = p["length"] / 2.0
    bm = box_grid(60, 10, 14)
    for v in bm.verts:
        u, s, t = v.co.x, v.co.y, v.co.z
        x = u * half
        top = body_top(x)
        z = p["ground"] + t * (top - p["ground"])
        y = s * body_halfwidth(x, t)
        v.co = Vector((x, y, z))
    return bm


def build_cabin():
    p = PARAMS
    bm = box_grid(30, 10, 10)
    z0 = p["belt"] - 0.01
    for v in bm.verts:
        u, s, t = v.co.x, v.co.y, v.co.z
        front = lerp(p["wind_base_x"], p["wind_top_x"], t)
        rear = lerp(p["rear_base_x"], p["rear_top_x"], t)
        x = lerp(rear, front, (u + 1.0) * 0.5)
        z = z0 + t * (p["roof"] - z0)
        y = s * lerp(p["cabin_w_base"], p["cabin_w_top"], t)
        v.co = Vector((x, y, z))
    return bm


def near_arch(co, margin=0.07):
    """Perto de um arco de roda (no plano X-Z): o chanfro não mexe aí, o friso de para-lama cobre a borda."""
    p = PARAMS
    return any((co.x - xc) ** 2 + (co.z - p["wheel_r"]) ** 2 < (p["arch_r"] + margin) ** 2 for xc in (p["wheel_x_front"], p["wheel_x_rear"]))


def bevel_sharp(bm, width=0.04, segments=2, angle_deg=35.0, skip_arches=False):
    sharp = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(angle_deg)
             and not (skip_arches and near_arch((e.verts[0].co + e.verts[1].co) / 2))]
    bmesh.ops.bevel(bm, geom=sharp, offset=width, segments=segments, profile=0.6, affect="EDGES")


def cut_planes(bm, planes):
    """Corta a malha nos planos (ponto, normal) para as bordas dos vidros ficarem retas."""
    for co, no in planes:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5, plane_co=Vector(co), plane_no=Vector(no))
    bm.faces.ensure_lookup_table()


def make_windows(bm, mat_index_glass):
    """Marca como vidro (e afunda um pouco) as faces da cabine dentro das janelas; as colunas ficam de pintura."""
    p = PARAMS
    bm.faces.ensure_lookup_table()
    glass = []
    for f in bm.faces:
        c = f.calc_center_median()
        n = f.normal
        side = abs(n.y) > 0.80 and p["belt"] + 0.06 < c.z < p["roof"] - 0.05
        door = side and -0.40 < c.x < p["wind_base_x"] - 0.20 - 0.35 * (c.z - p["belt"]) / (p["roof"] - p["belt"])
        quarter = side and -1.27 < c.x < -0.60
        wind = n.x > 0.35 and n.z > 0.15 and c.z > p["belt"] + 0.03 and abs(c.y) < p["cabin_w_top"] + 0.06 and -0.05 < c.x
        rear = n.x < -0.35 and c.z > p["belt"] + 0.05 and abs(c.y) < p["cabin_w_top"] + 0.04 and c.x < -1.35
        if door or quarter or wind or rear:
            glass.append(f)
    for f in glass:
        f.material_index = mat_index_glass
    # use_even_offset estica espetos nos cantos pontudos do para-brisa (visto na captura); sem ele o recorte fica reto
    ret = bmesh.ops.inset_region(bm, faces=glass, thickness=0.045, depth=-0.006, use_even_offset=False)
    return glass


def cylinder_along_y(bm, radius, depth, segments):
    """Cilindro com o eixo ao longo de Y. Trocar dois eixos espelha a malha: as normais saem invertidas (o booleano devolvia vazio), então volta."""
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments, radius1=radius, radius2=radius, depth=depth)
    for v in bm.verts:
        v.co = Vector((v.co.x, v.co.z, v.co.y))
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:])


def box_part(name, center, size, mat, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2])) + Vector(center)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=2, profile=0.6, affect="EDGES")
    return new_mesh_object(name, bm, [mat])


def ribbon(name, points, width, mat, lift=0.0015):
    """Fita fina (frestas dos painéis, frisos) ao longo de uma linha de pontos já sobre a superfície; a largura vai na horizontal (Y) ou,
    se a linha anda em Y, na vertical. Fica 1,5 mm acima da superfície: é só visual, sem espessura."""
    bm = bmesh.new()
    prev = None
    for i, pt in enumerate(points):
        a = Vector(pt)
        b = Vector(points[min(i + 1, len(points) - 1)]) if i + 1 < len(points) else a + (a - Vector(points[i - 1]))
        d = (b - a)
        d = d.normalized() if d.length > 1e-9 else Vector((1, 0, 0))
        side = Vector((0, 0, 1)).cross(d)
        if side.length < 1e-6:
            side = Vector((0, 1, 0))
        side.normalize()
        up = d.cross(side)
        verts = (bm.verts.new(a + side * width / 2), bm.verts.new(a - side * width / 2))
        if prev:
            bm.faces.new((prev[0], prev[1], verts[1], verts[0]))
        prev = verts
    new = new_mesh_object(name, bm, [mat])
    return new


def tube(name, points, radius, sides, mat):
    """Tubo redondo ao longo de uma linha (o friso de plástico do para-lama). Anéis perpendiculares à linha, com as pontas fechadas."""
    bm = bmesh.new()
    rings = []
    pts = [Vector(q) for q in points]
    for i, a in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        ref = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))
        n1 = d.cross(ref).normalized()
        n2 = d.cross(n1).normalized()
        rings.append([bm.verts.new(a + (n1 * math.cos(2 * math.pi * k / sides) + n2 * math.sin(2 * math.pi * k / sides)) * radius) for k in range(sides)])
    for i in range(len(rings) - 1):
        for k in range(sides):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]))
    bm.faces.new(rings[0])
    bm.faces.new(rings[-1][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return new_mesh_object(name, bm, [mat])


def side_line(x_of_v, z0, z1, sign, steps=14):
    """Pontos sobre a lateral da carroceria baixa: x constante em cada altura (função x_of_v) de z0 a z1."""
    p = PARAMS
    pts = []
    for i in range(steps + 1):
        z = lerp(z0, z1, i / steps)
        x = x_of_v(z)
        v = (z - p["ground"]) / max(1e-6, body_top(x) - p["ground"])
        pts.append((x, sign * (body_halfwidth(x, min(1.0, v)) + 0.0015), z))
    return pts


def panel_lines():
    """Frestas dos painéis em preto: porta (frente e trás), soleira, capô, tampa traseira."""
    p = PARAMS
    out = []
    belt = p["belt"]
    for sgn in (1, -1):
        for x in (0.40, -0.62):  # portas: borda dianteira e traseira
            out.append(ribbon("fresta_porta", side_line(lambda z, x=x: x, 0.27, belt, sgn), 0.006, "Chassi"))
        # soleira da porta
        out.append(ribbon("fresta_soleira", [(x, sgn * (body_halfwidth(x, 0.12) + 0.0015), 0.27) for x in (0.40 - i * 0.102 for i in range(11))], 0.006, "Chassi"))
        # capô: borda lateral até a frente
        out.append(ribbon("fresta_capo", [(x, sgn * (body_halfwidth(x, 1.0) - 0.075), body_top(x) + 0.0015) for x in (p["hood_end_x"] + i * (1.86 - p["hood_end_x"]) / 12 for i in range(13))], 0.006, "Chassi"))
    # capô: borda dianteira
    out.append(ribbon("fresta_capo_frente", [(1.86, y, body_top(1.86) + 0.0015) for y in [lerp(-0.66, 0.66, i / 10) for i in range(11)]], 0.006, "Chassi"))
    # tampa traseira: borda de baixo, na face de trás
    half = p["length"] / 2.0
    out.append(ribbon("fresta_tampa", [(-half - 0.0015, y, 0.58) for y in [lerp(-0.64, 0.64, i / 10) for i in range(11)]], 0.006, "Chassi"))
    return out


def wheel_wells():
    """Em cada arco: o friso de plástico preto em volta (esconde as lascas do corte) e o fundo escuro do arco (profundidade)."""
    p = PARAMS
    out = []
    for xc in (p["wheel_x_front"], p["wheel_x_rear"]):
        zc = p["wheel_r"]
        for sgn in (1, -1):
            pts = []
            for i in range(33):
                a = math.radians(lerp(2.0, 178.0, i / 32))
                x = xc + math.cos(a) * (p["arch_r"] + 0.012)
                z = zc + math.sin(a) * (p["arch_r"] + 0.012)
                v = (z - p["ground"]) / max(1e-6, body_top(x) - p["ground"])
                pts.append((x, sgn * (body_halfwidth(x, min(1.0, v)) - 0.004), z))  # o tubo afunda um pouco na lataria: a emenda some
            out.append(tube("friso_arco", pts, 0.021, 8, "Chassi"))
        # fundo do arco: meio cilindro (parte de cima) entre a roda e a carroceria, aberto
        bm = bmesh.new()
        segs = 24
        ys = (0.53, 0.80)
        rings = []
        for y in ys:
            for sgn in (1, -1):
                pass
        for sgn in (1, -1):
            rows = []
            for y in (0.50, 0.78):
                row = []
                for i in range(segs + 1):
                    a = math.radians(lerp(0.0, 180.0, i / segs))
                    row.append(bm.verts.new((xc + math.cos(a) * (p["arch_r"] - 0.01), sgn * y, zc + math.sin(a) * (p["arch_r"] - 0.01))))
                rows.append(row)
            for i in range(segs):
                bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
        out.append(new_mesh_object("fundo_arco", bm, ["Chassi"]))
    return out


def door_handles():
    out = []
    for sgn in (1, -1):
        x, z = -0.42, 0.84
        out.append(box_part("macaneta", (x, sgn * (body_halfwidth(x, 0.9) + 0.012), z), (0.13, 0.025, 0.028), "Chassi", 0.008))
    return out


def make_wheel(name, x, y):
    p = PARAMS
    r, w = p["wheel_r"], p["wheel_w"]
    bm = bmesh.new()
    cylinder_along_y(bm, r, w, 28)
    bevel = [e for e in bm.edges if abs(abs(e.verts[0].co.y) - w / 2) < 1e-4 and abs(abs(e.verts[1].co.y) - w / 2) < 1e-4]
    bmesh.ops.bevel(bm, geom=bevel, offset=0.03, segments=2, profile=0.6, affect="EDGES")
    for f in bm.faces:
        f.material_index = 0
    tire = new_mesh_object(name + "_pneu", bm, ["Tire"])
    # aro: disco um pouco para fora do pneu
    rm = bmesh.new()
    cylinder_along_y(rm, r * 0.64, w * 0.55, 24)
    rim = new_mesh_object(name + "_aro", rm, ["Rim"])
    side = 1.0 if y > 0 else -1.0
    off = Vector((x, y, r))
    tire.location = off
    rim.location = off + Vector((0.0, side * w * 0.25, 0.0))
    return tire, rim


def arch_cut(obj):
    """Os vãos das rodas: cilindros ao longo de Y subtraídos da carroceria baixa."""
    p = PARAMS
    for x in (p["wheel_x_front"], p["wheel_x_rear"]):
        bm = bmesh.new()
        cylinder_along_y(bm, p["arch_r"], 2.2, 32)
        cutter = new_mesh_object("corte_arco", bm, ["Body"])
        cutter.location = Vector((x, 0.0, p["wheel_r"]))
        mod = obj.modifiers.new("arco", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.object = cutter
        mod.solver = "EXACT"
        # a malha avaliada vira a malha do objeto (o modifier_apply por operador devolvia vazio neste contexto sem janela)
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        new_data = bpy.data.meshes.new_from_object(evaluated)
        old = obj.data
        obj.modifiers.remove(mod)
        obj.data = new_data
        bpy.data.meshes.remove(old)
        bpy.data.objects.remove(cutter)


def main():
    args = parse_args(sys.argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    p = PARAMS
    half = p["length"] / 2.0

    # os arcos das rodas ANTES do chanfro e só na carroceria baixa: o booleano exato devolve vazio com as quinas já chanfradas
    # (geometria degenerada) ou com a cabine cruzada com ela (medido no lote do Cuiabano)
    body_obj = new_mesh_object("carroceria", build_lower_body(), ["Body", "Glass"])
    arch_cut(body_obj)
    lb = bmesh.new()
    lb.from_mesh(body_obj.data)
    # o booleano deixa lascas e faces quase sem área nas bordas dos arcos: some com elas antes do chanfro
    bmesh.ops.dissolve_degenerate(lb, dist=0.004, edges=lb.edges[:])
    bmesh.ops.remove_doubles(lb, verts=lb.verts[:], dist=0.0015)
    bevel_sharp(lb, 0.045, 2, skip_arches=True)
    bmesh.ops.recalc_face_normals(lb, faces=lb.faces[:])
    lb.to_mesh(body_obj.data)
    lb.free()
    cab = build_cabin()
    bevel_sharp(cab, 0.03, 2)
    # cabine e carroceria baixa na mesma malha (uma só pintura)
    cab_obj = new_mesh_object("cabine", cab, ["Body", "Glass"])
    bpy.ops.object.select_all(action="DESELECT")
    cab_obj.select_set(True)
    body_obj.select_set(True)
    bpy.context.view_layer.objects.active = body_obj
    bpy.ops.object.join()

    bm = bmesh.new()
    bm.from_mesh(body_obj.data)
    cut_planes(bm, [((-0.40, 0, 0), (1, 0, 0)), ((-0.60, 0, 0), (1, 0, 0)), ((-1.27, 0, 0), (1, 0, 0)),
                    ((0, 0, p["belt"] + 0.06), (0, 0, 1)), ((0, 0, p["roof"] - 0.05), (0, 0, 1))])
    make_windows(bm, 1)
    bm.to_mesh(body_obj.data)
    bm.free()
    body_obj.data.update()
    for poly in body_obj.data.polygons:
        poly.use_smooth = False
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))

    parts = []
    # para-choques (plástico preto) e saias
    parts.append(box_part("parachoque_diant", (half - 0.09, 0.0, 0.34), (0.22, 1.50, 0.26), "Chassi", 0.04))
    parts.append(box_part("parachoque_tras", (-half + 0.09, 0.0, 0.34), (0.22, 1.50, 0.26), "Chassi", 0.04))
    # grade e faróis
    parts.append(box_part("grade", (half + 0.004, 0.0, 0.575), (0.05, 0.50, 0.10), "Chassi", 0.01))
    for sgn in (1, -1):
        parts.append(box_part("farol_%d" % sgn, (half - 0.010, sgn * 0.54, 0.585), (0.07, 0.34, 0.14), "Lights", 0.02))
        parts.append(box_part("lanterna_%d" % sgn, (-half + 0.010, sgn * 0.57, 0.80), (0.07, 0.30, 0.15), "Lights", 0.02))
        parts.append(box_part("retrovisor_%d" % sgn, (0.40, sgn * 0.83, 0.98), (0.10, 0.07, 0.07), "Body", 0.02))
    parts.append(box_part("placa_tras", (-half + 0.015, 0.0, 0.66), (0.03, 0.40, 0.13), "Chassi", 0.005))
    parts.extend(panel_lines())
    parts.extend(door_handles())
    parts.extend(wheel_wells())
    wheels = []
    for name, x, y in (("re", p["wheel_x_rear"], p["track"]), ("rd", p["wheel_x_rear"], -p["track"]),
                       ("fe", p["wheel_x_front"], p["track"]), ("fd", p["wheel_x_front"], -p["track"])):
        wheels.extend(make_wheel("roda_" + name, x, y))

    out_dir = os.path.abspath(args.out_dir)
    os.makedirs(out_dir, exist_ok=True)
    print("[make_cuiabano] carroceria: %d vértices, %d faces" % (len(body_obj.data.vertices), len(body_obj.data.polygons)))
    if args.renders:
        render_views(os.path.abspath(args.renders))
    if not args.no_export:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "cuiabano.blend"))
        print("[make_cuiabano] salvo em %s" % out_dir)


def render_views(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    sh = scene.display.shading
    sh.light = "STUDIO"
    sh.color_type = "MATERIAL"
    sh.show_shadows = True
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.lens = 50
    target = Vector((0.0, 0.0, 0.62))
    for name, direction in (("frente-esq", (1.0, 1.0, 0.35)), ("lado", (0.0, 1.0, 0.12)), ("tras-dir", (-1.0, -1.0, 0.35)), ("frente", (1.0, 0.0, 0.15))):
        cam.location = target + Vector(direction).normalized() * 6.2
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(out_dir, "cuiabano-%s.png" % name)
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
