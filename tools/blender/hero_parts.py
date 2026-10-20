"""Peças compartilhadas pelos carros herói dos estilos `Hull`-based (V15): lanterna e farol em TIRA de LED (moldura em relevo, poço, lente em leque, divisórias e LEDs), asa, difusor e
ponteira de escape parametrizados, além do que os quatro estilos repetem. Usa as primitivas do herói do GT (`build_hero_gt.py`): `Part`, `lathe`, `box`, `extrude`, `patch_on`, `project`...
Convenção do Blender (carlib.py): x à direita, FRENTE EM −Y, z para cima; o que o jogo chama de z (comprimento) é o y daqui e a altura é o z daqui.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_hero_gt as H  # noqa: E402
from mathutils import Matrix  # noqa: E402
from build_hero_gt import Part, Vector, v3, frame, lathe, box, extrude, tube, project, patch_on, strip_on, hex_cells, rounded, facing  # noqa: E402,F401

AXIS_WANT = {"back": (0, 1, 0), "front": (0, -1, 0), "top": (0, 0, 1), "side+": (1, 0, 0), "side-": (-1, 0, 0)}


# ───────────────────────────── curvas e pele ─────────────────────────────
def sgn(v):
    return 1.0 if v >= 0 else -1.0


def superellipse(cx, cz, a, b, n=4.0, N=48, slope=0.0):
    """Contorno fechado (anti-horário) de uma superelipse de semieixos a (x) e b (z): n = 2 é a elipse, n grande tende ao retângulo; `slope` inclina a tira (z sobe com x)."""
    pts = []
    for k in range(N):
        t = 2 * math.pi * k / N
        c, s = math.cos(t), math.sin(t)
        x = cx + a * sgn(c) * abs(c) ** (2.0 / n)
        pts.append((x, cz + b * sgn(s) * abs(s) ** (2.0 / n) + slope * (x - cx)))
    return pts


def skin(tree, axis):
    """`at(a, b, off)`: o ponto da pele (projeção `axis`) em (a, b) levantado `off` m na normal, ou None."""
    memo = {}

    def at(a, b, off=0.0):
        k = (round(a * 1e6), round(b * 1e6))
        if k not in memo:
            memo[k] = project(tree, a, b, axis)
        r = memo[k]
        return None if r is None else r[0] + r[1] * off
    at.normal = lambda a, b: (project(tree, a, b, axis) or (None, Vector(AXIS_WANT[axis])))[1]
    return at


def oriented(P, pts, mat, want):
    """Face (quadrilátero ou triângulo) com a normal virada para `want`."""
    if any(p is None for p in pts):
        return
    n = Vector((0, 0, 0))
    for i in range(1, len(pts) - 1):
        n += (pts[i] - pts[0]).cross(pts[i + 1] - pts[0])
    if n.dot(Vector(want)) < 0:
        pts = list(reversed(pts))
    P.face(pts, mat)


def band(P, ringA, ringB, mat, want_fn):
    """Faixa de quadriláteros entre dois anéis de pontos 3D (mesmo número de pontos); `want_fn(centro)` dá a normal desejada de cada face."""
    n = len(ringA)
    for i in range(n):
        q = [ringA[i], ringA[(i + 1) % n], ringB[(i + 1) % n], ringB[i]]
        if any(p is None for p in q):
            continue
        c = sum(q, Vector((0, 0, 0))) / 4
        oriented(P, q, mat, want_fn(c))


def fan(P, ring, center, mat, want):
    n = len(ring)
    for i in range(n):
        oriented(P, [center, ring[i], ring[(i + 1) % n]], mat, want)


# ───────────────────────────── a tira de LED (lanterna e farol) ─────────────────────────────
TAIL_MATS = dict(lens="taillight", dim="taillight_dim", floor="tail_well", wall="tail_well", top="piano", outer="piano", lip="chrome", rib="piano", dot="taillight")
HEAD_MATS = dict(lens="headlight", dim="headlight_dim", floor="reflector", wall="housing", top="piano", outer="piano", lip="chrome", rib="piano", dot="headlight")


def strip_lamp(Pl, Pled, tree, axis, cx, cz, a, b, mats=TAIL_MATS, slope=0.0, n=4.0, N=48, height=0.034, floor=0.008, ribs=(), dots=0, dot_rows=(0.0,), lip=True, bezel=0.020, dome=0.003,
               ring_w=0.014, dot_mat=None, hbars=(), hbar_w=0.014):
    """Lanterna (ou farol) em TIRA de LED, embutida na pele vista por `axis` ('back' ou 'front'): moldura em relevo (parede de fora, topo, lábio cromado, parede de dentro), poço escuro,
    LENTE em leque (um vértice no centro: o miolo e a borda do `aLens`) rodeada por uma coroa apagada, divisórias finas em `ribs` (frações de −1 a 1 do comprimento) e `dots` LEDs em pirâmide
    por fileira de `dot_rows` (frações de b). `Pl` leva a moldura e a lente (a peça `lamp_*`), `Pled` os LEDs."""
    at = skin(tree, axis)
    want = AXIS_WANT[axis]
    ring = lambda aa, bb, off: [at(x, z, off) for (x, z) in superellipse(cx, cz, aa, bb, n, N, slope)]
    out_w, out_h = a + bezel, b + bezel * 0.9
    base_out = ring(out_w, out_h, 0.0)
    top_out = ring(out_w, out_h, height)
    top_in = ring(a + 0.004, b + 0.004, height)
    c3 = at(cx, cz, 0.0)
    if c3 is None or any(p is None for p in base_out):
        raise RuntimeError(f"strip_lamp fora da pele em ({cx:.2f}, {cz:.2f}) a={a:.2f} b={b:.2f}")
    outward = lambda c: (lambda d: d - Vector(want) * d.dot(Vector(want)))(c - c3)
    band(Pl, base_out, top_out, mats["outer"], outward)                 # parede de fora
    band(Pl, top_out, top_in, mats["top"], lambda c: want)              # topo
    if lip:
        band(Pl, top_in, ring(a, b, height + 0.0015), mats["lip"], lambda c: want)  # lábio cromado
        lip_in = ring(a, b, height + 0.0015)
    else:
        lip_in = top_in
    inner_top = lip_in
    inner_floor = ring(a, b, floor)
    band(Pl, inner_top, inner_floor, mats["wall"], lambda c: -outward(c))  # parede de dentro (voltada para o poço)
    fc = at(cx, cz, floor)
    fan(Pl, inner_floor, fc, mats["floor"], want)                       # fundo do poço
    # a lente, na coroa: o anel apagado (borda) e o leque aceso
    lens_off = floor + 0.006
    ring_o = ring(a - 0.006, b - 0.006, lens_off)
    ring_i = ring(a - 0.006 - ring_w, b - 0.006 - ring_w * 0.9, lens_off + 0.0005)
    band(Pl, ring_o, ring_i, mats["dim"], lambda c: want)
    lens_ring = ring_i
    lc = at(cx, cz, lens_off + dome)
    fan(Pl, lens_ring, lc, mats["lens"], want)
    # divisórias finas (por cima da lente) e LEDs
    bx = Vector(want)
    for f in ribs:
        x = cx + f * (a - 0.02)
        z0, z1 = cz + slope * (x - cx) - (b - 0.012), cz + slope * (x - cx) + (b - 0.012)
        p0, p1 = at(x, z0, lens_off + 0.0035), at(x, z1, lens_off + 0.0035)
        pm = at(x, (z0 + z1) / 2, lens_off + 0.0035)
        if p0 is None or p1 is None or pm is None:
            continue
        nrm = project(tree, x, (z0 + z1) / 2, axis)[1]
        M = frame(pm, nrm, up=(0, 0, 1))
        box(Pl, (0, 0, 0), (0.007, 0.0075, (p1 - p0).length), mats["rib"], M)
    for f in hbars:  # barras horizontais por cima da lente (venezianas): de ponta a ponta, na altura f × b, acompanhando a inclinação
        xa, xb = cx - (a - 0.016), cx + (a - 0.016)
        za, zb = cz + slope * (xa - cx) + f * (b - 0.01), cz + slope * (xb - cx) + f * (b - 0.01)
        pa, pb = at(xa, za, lens_off + 0.0035), at(xb, zb, lens_off + 0.0035)
        pm = at((xa + xb) / 2, (za + zb) / 2, lens_off + 0.0035)
        if pa is None or pb is None or pm is None:
            continue
        nrm = project(tree, (xa + xb) / 2, (za + zb) / 2, axis)[1]
        M = frame(pm, nrm, up=(0, 0, 1))
        ang = math.atan2(zb - za, xb - xa)
        # a barra: caixa no plano da pele, comprimento pelo eixo x local, girada pela inclinação
        Mr = M @ Matrix.Rotation(-ang, 4, "Y")
        box(Pl, (0, 0, 0), ((pb - pa).length, 0.0075, hbar_w), mats["rib"], Mr)
    if dots:
        for rr in dot_rows:
            for k in range(dots):
                f = (k + 0.5) / dots * 2 - 1
                x = cx + f * (a - 0.04)
                z = cz + slope * (x - cx) + rr * (b - 0.02)
                pr = project(tree, x, z, axis)
                if pr is None:
                    continue
                p, nrm = pr
                M = frame(p + nrm * (lens_off + dome + 0.0015), nrm, up=(0, 0, 1))
                s0 = 0.0058
                base = [M @ Vector((dx * s0, 0, dz * s0)) for (dx, dz) in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
                apex = M @ Vector((0, 0.0065, 0))
                for i in range(4):
                    oriented(Pled, [base[i], base[(i + 1) % 4], apex], dot_mat or mats["dot"], (M @ Vector((0, 1, 0)) - M.translation))


# ───────────────────────────── a asa ─────────────────────────────
def airfoil_loop(y0, y1, zc0, zc1, thick, pitch=0.0, N=7):
    """Perfil da lâmina no plano (y, z) do Blender: bordo de ataque redondo em y0 e de fuga em y1 (a corda segue de zc0 a zc1 em altura); `pitch` gira o perfil em torno do centro."""
    low, up = [], []
    for i in range(N + 1):
        u = i / N
        th = 5 * 0.215 * (0.2969 * math.sqrt(u) - 0.1260 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1015 * u ** 4) * thick
        yy = y0 + (y1 - y0) * u
        zc = zc0 + (zc1 - zc0) * u
        low.append((yy, zc - th * 0.85))
        up.append((yy, zc + th * 0.15))
    loop = low + list(reversed(up))
    loop = [loop[0]] + [p for i, p in enumerate(loop[1:], 1) if (abs(p[0] - loop[i - 1][0]) + abs(p[1] - loop[i - 1][1])) > 1e-9]
    if pitch:
        cy, cz = (y0 + y1) / 2, (zc0 + zc1) / 2
        ca, sa = math.cos(pitch), math.sin(pitch)
        loop = [(cy + (y - cy) * ca - (z - cz) * sa, cz + (y - cy) * sa + (z - cz) * ca) for (y, z) in loop]
    return loop


def wing_blade(name, span, y0, y1, zc0, zc1, thick, segs, pitch=0.0, gurney=None):
    """Lâmina da asa de ponta a ponta (largura `span`, em x), perfil de `airfoil_loop`; `segs` = [(xa, xb, material de cima)] (as faixas A na cor de faixa); o resto, `paint`."""
    P = Part(name)
    loop = airfoil_loop(y0, y1, zc0, zc1, thick, pitch)
    n = len(loop)
    # as arestas de cima (a metade de volta do bordo de fuga ao de ataque)
    up_edge = set(range(7, n))  # N = 7 do airfoil_loop: do bordo de fuga de volta ao de ataque
    for (xa, xb, top_mat, under_mat) in segs:
        for i in range(n):
            (ya, za), (yb, zb) = loop[i], loop[(i + 1) % n]
            m = top_mat if i in up_edge else under_mat
            P.quad(v3(xa, ya, za), v3(xa, yb, zb), v3(xb, yb, zb), v3(xb, ya, za), m)
    if gurney:
        ytip, ztip, gh, gm = gurney
        box(P, (0, ytip - 0.004, ztip + gh / 2), (span * 0.98, 0.008, gh), gm)
    return P


def wing_plates(name, hs, y0, y1, zlo, zhi, mat, trim_mat="carbon", thick=0.02):
    """Placas das pontas da asa (rabeta de cantos arredondados), em x = ±hs, de y0 a y1 e de zlo a zhi (alturas), com o friso de carbono no meio."""
    P = Part(name)
    ym = (y0 + y1) / 2
    dy = (y1 - y0) / 2
    plate = [(y0 + 0.02 * dy, zlo), (y1 - 0.04 * dy, zlo + 0.03), (y1 + 0.02, zlo + 0.05), (y1 + 0.035, zlo + (zhi - zlo) * 0.5), (y1 + 0.02, zhi), (ym + dy * 0.2, zhi - 0.02), (y0 + 0.15 * dy, zlo + (zhi - zlo) * 0.5), (y0 - 0.01, zlo + 0.03)]
    for sd in (1, -1):
        loopp = [v3(sd * hs, y, z) for (y, z) in plate]
        if sd < 0:
            loopp = list(reversed(loopp))
        extrude(P, loopp, v3(sd * thick, 0, 0), mat)
        box(P, (sd * (hs + thick + 0.002), ym + 0.02, (zlo + zhi) / 2 + 0.01), (0.004, (y1 - y0) * 0.55, 0.012), trim_mat)
    return P


def strut(name, x, path, radii, mat="carbon", ratio=0.38, seg=8):
    """Suporte da asa: tubo elíptico ao longo de `path` (pontos 3D)."""
    P = Part(name)
    tube(P, [v3(x, y, z) for (y, z) in path], radii, mat, seg=seg, ratio=ratio, up=(1, 0, 0))
    return P


# ───────────────────────────── difusor e escape ─────────────────────────────
def diffuser_part(hw, y0, y1, z0, z1, fins, fin_mat="carbon", under_mat="under", tray_mat="carbon", fence=True, fin_h=0.085, lip=False):
    """Difusor: bandeja de carbono em rampa de y0 a y1 (z sobe de z0 a z1), `fins` aletas de perfil chanfrado e cercas nas pontas com friso de metal."""
    P = Part("difusor")
    tray = [v3(-hw, y0, z0), v3(hw, y0, z0), v3(hw, y1, z1), v3(-hw, y1, z1)]
    P.quad(tray[0], tray[3], tray[2], tray[1], tray_mat)
    P.quad(tray[0], tray[1], tray[2], tray[3], under_mat)
    for i in range(fins):
        x = -hw + 0.02 + (2 * hw - 0.04) * i / (fins - 1)
        t = 0.0045
        prof = [(y0 + 0.02, z0 + 0.012), (y0 + 0.12, z0 + 0.040), (y1, z1 + 0.012), (y1, z1 + 0.012 + 0.040), (y1 - 0.06, z1 + 0.012 + fin_h * 0.6), (y0 + 0.02, z0 + 0.012 + fin_h)]
        extrude(P, [v3(x - t, yy, zz) for (yy, zz) in prof], v3(2 * t, 0, 0), fin_mat)
    if fence:
        for sd in (1, -1):
            xo = sd * (hw + 0.012)
            prof = [(y0 - 0.02, z0 + 0.0), (y0 + 0.10, z0 + 0.03), (y1 + 0.01, z1 + 0.012), (y1 + 0.01, z1 + 0.012 + 0.07), (y0 + 0.14, z0 + 0.012 + 0.11), (y0 - 0.02, z0 + 0.012 + 0.10)]
            loop = [v3(xo - 0.006, yy, zz) for (yy, zz) in prof]
            extrude(P, loop if sd > 0 else list(reversed(loop)), v3(0.012 * sd, 0, 0), "carbon")
            if lip:
                box(P, (sd * hw * 0.62, y1 + 0.004, z1 + 0.05), (hw * 0.5, 0.008, 0.012), "metal")
    return P


def exhaust_tip(name, x, y_in, zc, ro, depth, ri=None, seg=20):
    """Ponteira de escape: sólido de revolução em torno do eixo y (a ponta sai para trás: +y), de metal, com o fundo escuro, de `y_in` a `y_in + depth`."""
    ri = ri or ro * 0.8
    P = Part(name)
    M = frame(v3(x, y_in, zc), v3(0, 1, 0))
    lathe(P, M, [(0, depth * 0.395, "under"), (ri, depth * 0.395, "under"), (ri, depth * 0.975, "chrome"), (ri + 0.004, depth, "chrome"), (ro, depth, "metal"), (ro, 0.0, None)], seg)
    return P


# ───────────────────────────── retrovisor, maçaneta, frestas, entradas ─────────────────────────────
def mirror_part(name, sd, x, y, z, shell_mat="paint", glass_mat="chrome", ped=(0.13, 0.05, 0.03), size=(0.055, 0.085, 0.048), ped_z=None):
    """Retrovisor: pedestal, carcaça (elipsoide) e o espelho (disco oval voltado para trás)."""
    P = Part(name)
    pz = z - 0.06 if ped_z is None else ped_z
    box(P, (sd * (x - 0.085), y - 0.02, pz), ped, "trim")
    H.uvsphere(P, (sd * x, y, z), size, shell_mat, 10, 6)
    ell = [v3(sd * x + 0.043 * math.cos(2 * math.pi * k / 12), y + size[1] - 0.002, z + 0.038 * math.sin(2 * math.pi * k / 12)) for k in range(12)]
    facing(P, ell, glass_mat, (0, 1, 0))
    return P


def door_seams(tree, lines, axis_sides=(("side+", "l"), ("side-", "r")), mat="trim", width=0.006):
    """Frestas finas (faixas assentadas na pele) em `lines` = [[(y, z), ...], ...], dos dois lados: devolve a peça `fresta_porta`."""
    P = Part("fresta_porta")
    for ax, _ in axis_sides:
        for ln in lines:
            strip_on(P, tree, ln, width, ax, mat, off=0.003, step=0.04)
    return P


def side_vent(tree, ax, poly, blades, name, blade_mat="paint", w=0.018, backing="under", blade_zs=(0.31, 0.52), blade_off=0.014):
    """Entrada de ar do flanco: recorte escuro (`poly`, em (y, z)) e lâminas na cor do carro nas posições y de `blades`, com a altura `blade_zs`."""
    P = Part(name)
    patch_on(P, tree, poly, ax, backing, h=0.06, off=0.005)
    for yy in blades:
        strip_on(P, tree, [(yy, blade_zs[0]), (yy, blade_zs[1])], w, ax, blade_mat, off=blade_off, step=0.05)
    return P


def calipers_part(axles, mat="accent"):
    P = Part("pincas")
    for a in axles:
        for sd in (1, -1):
            box(P, (sd * (a["x"] + a["w"] * 0.08), a["z"] + a["r"] * 0.26, a["r"] + a["r"] * 0.32), (0.05, a["r"] * 0.3, a["r"] * 0.36), mat)
    return P


# ───────────────────────────── primitivas com cantos arredondados, esfera com viseira, toro (roadster) ─────────────────────────────
def rbox(P, c, size, mat, bevel=0.02, seg=2, M=None):
    """Caixa de arestas arredondadas (bevel) de centro `c` e lados `size`; `M` (matriz 4×4 em torno de `c`) gira a peça. Faces para fora."""
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, offset_type="OFFSET", segments=seg, affect="EDGES")
    cc = Vector(c)
    for f in bm.faces:
        pts = [((M @ v.co) if M is not None else v.co) + cc for v in f.verts]
        P.face(pts, mat)
    bm.free()


def ext_bevel(P, loop, vec, mat, bevel=0.02, seg=2):
    """Extrusão de um contorno CONVEXO `loop` (pontos 3D) ao longo de `vec` com todas as arestas arredondadas: uma corcova, uma barbatana gorda."""
    import bmesh
    bm = bmesh.new()
    a = [bm.verts.new(p) for p in loop]
    b = [bm.verts.new(Vector(p) + Vector(vec)) for p in loop]
    n = len(loop)
    for i in range(n):
        bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(list(reversed(a)))
    bm.faces.new(b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, offset_type="OFFSET", segments=seg, affect="EDGES")
    for f in bm.faces:
        P.face([v.co.copy() for v in f.verts], mat)
    bm.free()


def helmet(P, c, r, shell_mat="accent", visor_mat="glass", u=14, v=8):
    """Capacete: esfera de `r` com a faixa da viseira (um pouco acima do equador, voltada para a frente −y) no material do vidro."""
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0)
    for f in bm.faces:
        pts = [Vector((c[0] + vt.co.x * r, c[1] + vt.co.y * r * 1.08, c[2] + vt.co.z * r * 0.98)) for vt in f.verts]
        ctr = f.calc_center_median()
        visor = ctr.y < -0.35 and -0.12 < ctr.z < 0.42
        P.face(pts, visor_mat if visor else shell_mat)
    bm.free()


def torus(P, c, R, r, normal, mat, seg=18, tube=6):
    """Toro (volante) de centro `c`, raio maior R e do tubo r, no plano perpendicular a `normal`."""
    n = Vector(normal).normalized()
    ex = n.cross(Vector((0, 0, 1))) if abs(n.z) < 0.99 else Vector((1, 0, 0))
    ex.normalize()
    ey = n.cross(ex)
    cc = Vector(c)
    rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        d = ex * math.cos(a) + ey * math.sin(a)
        ring = []
        for k in range(tube):
            t = 2 * math.pi * k / tube
            ring.append(cc + d * (R + r * math.cos(t)) + n * (r * math.sin(t)))
        rings.append(ring)
    for i in range(seg):
        for k in range(tube):
            q = [rings[i][k], rings[(i + 1) % seg][k], rings[(i + 1) % seg][(k + 1) % tube], rings[i][(k + 1) % tube]]
            ctr = sum(q, Vector((0, 0, 0))) / 4
            axis_pt = cc + (ctr - cc) - n * (ctr - cc).dot(n)
            axis_pt = cc + (axis_pt - cc).normalized() * R
            oriented(P, q, mat, ctr - axis_pt)


def round_lamp(P, Pled, tree, axis, x, z, R, rl, mats, seg=18, led=True, depth=0.0):
    """Lanterna ou farol REDONDO embutido (a identidade do roadster): moldura saliente, poço, coroa apagada e miolo em leque, assentado na pele vista por `axis` (normal e ponto da pele no centro)."""
    pr = project(tree, x, z, axis)
    if pr is None:
        raise RuntimeError(f"lâmpada redonda fora da pele em ({x:.2f}, {z:.2f})")
    pt, n = pr
    M = frame(pt - n * depth, n)
    rc = 0.78 * rl
    H.lathe(P, M, [(0, 0.016, mats["lens"]), (rc, 0.013, mats["dim"]), (rl, 0.013, mats["floor"]), (rl + 0.005, 0.036, mats["lip"]), (rl + 0.012, 0.042, mats["top"]),
                   (R - 0.014, 0.042, mats["top"]), (R, 0.030, mats["outer"]), (R, -0.004, mats["outer"])], seg)
    if led:
        H.lathe(Pled, M, [(0.60 * rl, 0.0145, mats["dot"]), (0.70 * rl, 0.0145, mats["dot"]), (0.70 * rl, 0.0145, None)], seg)
        for k in range(8):
            a = 2 * math.pi * (k + 0.5) / 8
            cx, cz = 0.89 * rl * math.cos(a), 0.89 * rl * math.sin(a)
            s0 = 0.0065
            base = [M @ Vector((cx + dx * s0, 0.0132, cz + dz * s0)) for (dx, dz) in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            apex = M @ Vector((cx, 0.0185, cz))
            for i in range(4):
                Pled.tri(base[i], base[(i + 1) % 4], apex, mats["dot"])
