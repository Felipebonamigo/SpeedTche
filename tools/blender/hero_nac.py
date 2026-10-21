"""Peças compartilhadas pelos carros herói dos NACIONAIS livres (V17): Cuiabano e Tupiniquim. O caráter é o de carro popular, não o de esportivo: lanterna em células com refletor e lente
em dois tons, para-choque com volume e friso, farol com refletor, grade lisa, frisos de porta, maçanetas, limpadores, antena. Em cima das primitivas do herói do GT (`build_hero_gt.py`:
`Part`, `patch_on`, `strip_on`, `lathe`...) e de `hero_parts.py` (`strip_lamp`, `mirror_part`). Convenção do Blender (carlib.py): x à direita, FRENTE EM −Y, z para cima.
Eixos de projeção das peças: back (x, z), front (x, z), top (x, y), side+ / side- (y, z); y é o comprimento do carro.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_hero_gt as H  # noqa: E402
import carlib as cl  # noqa: E402
import hero_parts as HP  # noqa: E402
from build_hero_gt import Part, Vector, v3, box, patch_on, strip_on, project, frame, lathe, tube  # noqa: E402,F401
from carlib import scaled_outline  # noqa: E402,F401

lin = H.lin
# materiais que o carro popular pede além dos do herói do GT: lentes de dois tons e o refletor catadióptrico (não acende: é só tinta)
cl.MATERIALS.update({
    "amber_dim": (lin("#8f4a10"), 0.1, 0.30, None),
    "lens_clear_dim": (lin("#8e949c"), 0.2, 0.25, None),
    "reflex_red": (lin("#8a1210"), 0.1, 0.30, None),
    "chrome_soft": (lin("#aeb3ba"), 0.9, 0.30, None),
})


# ───────────────────────────── contornos ─────────────────────────────
def densify(poly, step=0.04):
    """Contorno fechado com um ponto a cada `step` m no máximo (as paredes e o topo de uma peça concordam com a pele curva)."""
    out = []
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        k = max(1, int(math.ceil(L / step)))
        for j in range(k):
            t = j / k
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def inset_poly(poly, d):
    """Contorno recuado `d` m para dentro (deslocamento em quina, `miter`): serve a qualquer contorno simples, côncavo ou não."""
    n = len(poly)
    area = 0.5 * sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    s = 1.0 if area > 0 else -1.0  # anti-horário: o de dentro fica à esquerda de cada aresta

    def edge_n(i):
        a, b = poly[i], poly[(i + 1) % n]
        dx, dz = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dz) or 1.0
        return (-dz / L * s, dx / L * s)
    out = []
    for i in range(n):
        n0, n1 = edge_n(i - 1), edge_n(i)
        mx, mz = n0[0] + n1[0], n0[1] + n1[1]
        L = math.hypot(mx, mz)
        if L < 1e-6:
            out.append((poly[i][0] + n1[0] * d, poly[i][1] + n1[1] * d))
            continue
        k = min(2.0 / L, 2.5)  # 1/cos(meio ângulo), limitado nas quinas agudas
        out.append((poly[i][0] + mx / L * d * (L / 2) * k, poly[i][1] + mz / L * d * (L / 2) * k))
    return out


def ribbon(line, width):
    """Contorno fechado de uma faixa de `width` m em torno da polilinha `line` ((a, b), ...)."""
    left, right = [], []
    for i, (a, b) in enumerate(line):
        pa, pb = line[min(i + 1, len(line) - 1)], line[max(i - 1, 0)]
        da, db = pa[0] - pb[0], pa[1] - pb[1]
        L = math.hypot(da, db) or 1.0
        na, nb = -db / L * width / 2, da / L * width / 2
        left.append((a + na, b + nb))
        right.append((a - na, b - nb))
    return left + list(reversed(right))


def rrect(cx, cz, w, h, r, seg=3):
    return cl.rounded_rect(cx, cz, w, h, r, seg=seg)


def mirror_x(poly):
    return [(-a, b) for (a, b) in reversed(poly)]


# ───────────────────────────── peça em relevo: parede + topo, assentada na pele curva ─────────────────────────────
def raised(P, tree, axis, outline, h, mat_top, mat_wall=None, inset=0.010, off0=-0.003, cell=0.05, step=0.035):
    """Bloco baixo assentado na pele vista por `axis`: o contorno `outline` na pele (recuado `off0`, para entrar um pouco), a parede subindo até `h` m e o topo recuado `inset` m
    (a quina chanfrada), preenchido por uma grade conforme. Serve a para-choques, molduras, maçanetas, tampas."""
    ring = densify(outline, step)
    topr = inset_poly(ring, inset)
    at = HP.skin(tree, axis)
    cx = sum(p[0] for p in ring) / len(ring)
    cz = sum(p[1] for p in ring) / len(ring)
    c3 = at(cx, cz, 0.0)
    if c3 is None:
        raise RuntimeError(f"raised fora da pele em ({cx:.2f}, {cz:.2f}) eixo {axis}")
    want = Vector(HP.AXIS_WANT[axis])
    base = [at(a, b, off0) for (a, b) in ring]
    top = [at(a, b, h) for (a, b) in topr]
    outward = lambda c: (lambda d: d - want * d.dot(want))(c - c3)
    HP.band(P, base, top, mat_wall or mat_top, outward)
    patch_on(P, tree, topr, axis, mat_top, h=cell, off=h)


def lamp_cell(Pl, tree, axis, cx, cz, a, b, mats, n=4.5, N=28, height=0.026, floor=0.007, bezel=0.011, ring_w=0.015, lip=False, ribs=(), slope=0.0, dome=0.003):
    """Uma célula de lanterna ou de farol: moldura em relevo, poço com refletor, coroa e lente em leque (`HP.strip_lamp`, o miolo e a borda do `aLens`)."""
    dummy = Part("_led")
    HP.strip_lamp(Pl, dummy, tree, axis, cx, cz, a, b, mats=mats, n=n, N=N, height=height, floor=floor, bezel=bezel, ring_w=ring_w, lip=lip, ribs=ribs, slope=slope, dome=dome)
    dummy.bm.free()


def mats_of(lens, dim, floor="reflector", wall="tail_well", frame_mat="trim", lip="chrome", rib="trim"):
    return dict(lens=lens, dim=dim, floor=floor, wall=wall, top=frame_mat, outer=frame_mat, lip=lip, rib=rib, dot=lens)


RED = mats_of("taillight", "taillight_dim")
AMBER = mats_of("amber", "amber_dim")
CLEAR = mats_of("lens_clear", "lens_clear_dim")


# ───────────────────────────── retrovisor, maçaneta, limpador, antena, escapamento ─────────────────────────────
def mirror(name, sd, x, y, z, shell_mat="paint", size=(0.105, 0.075, 0.100)):
    """Retrovisor de caixa arredondada: pedestal, carcaça (caixa de cantos suaves) e o espelho (retângulo de cantos cortados, voltado para trás, em cromo suave)."""
    P = Part(name)
    box(P, (sd * (x - 0.085), y - 0.012, z - 0.058), (0.12, 0.06, 0.028), "trim")
    HP.rbox(P, (sd * x, y, z), size, shell_mat, bevel=0.024, seg=2)
    yy = y + size[1] / 2 + 0.0015
    hw, hh, c = size[0] / 2 - 0.012, size[2] / 2 - 0.012, 0.016
    pts = [(-hw + c, -hh), (hw - c, -hh), (hw, -hh + c), (hw, hh - c), (hw - c, hh), (-hw + c, hh), (-hw, hh - c), (-hw, -hh + c)]
    H.facing(P, [v3(sd * x + a, yy, z + b) for (a, b) in pts], "chrome_soft", (0, 1, 0))
    return P


def door_handle(P, tree, axis, y, z, length=0.15, mat="trim"):
    """Maçaneta de porta: bolsão escuro rente à porta e a alça em relevo, com a ponta arredondada."""
    patch_on(P, tree, rrect(y, z, length + 0.07, 0.075, 0.02), axis, "under", h=0.05, off=0.003)
    raised(P, tree, axis, rrect(y, z + 0.004, length, 0.028, 0.012, seg=2), 0.017, mat, inset=0.005, cell=0.05, step=0.03)


def wiper(P, tree, pivot, tip, blade, width_arm=0.014, width_blade=0.024, mat_arm="trim_soft", mat_blade="trim_soft"):
    """Limpador de para-brisa (ou de vidro de trás), visto de cima: o braço do pivô ao fim da lâmina e a palheta ao longo do vidro; `blade` = (início, fim) da palheta."""
    raised(P, tree, "top", ribbon([pivot, tip], width_arm), 0.012, mat_arm, inset=0.004, cell=0.12, step=0.08)
    raised(P, tree, "top", ribbon(list(blade), width_blade), 0.016, mat_blade, inset=0.005, cell=0.12, step=0.08)


def antenna(name, tree, x, y, height=0.40, lean=0.05):
    """Antena de mastro no para-lama: base de borracha e mastro fino que afina para a ponta, inclinado para trás."""
    P = Part(name)
    hit = H.drop(tree, x, y)
    if hit is None:
        raise RuntimeError("antena fora da pele")
    p = hit[0]
    n = Vector(hit[1])
    M = frame(p, n)
    lathe(P, M, [(0.0, 0.026, "trim"), (0.014, 0.026, "trim"), (0.021, 0.014, "trim"), (0.024, 0.0, None)], seg=10)
    path = [p + Vector((0, lean * t, 0.02 + height * t)) for t in (0.0, 0.25, 0.5, 0.75, 1.0)]
    tube(P, path, [0.0095, 0.0085, 0.0070, 0.0058, 0.0045], "metal", seg=6, ratio=1.0, up=(1, 0, 0))
    return P


def exhaust_pipe(name, x, y_in, zc, ro=0.040, depth=0.16, seg=14):
    """Escapamento simples: a ponteira de aço lisa, boca escura e o abafador visível embaixo. Sem a ponta cromada dupla de esportivo."""
    P = Part(name)
    M = frame(v3(x, y_in, zc), v3(0, 1, 0))
    ri = ro * 0.80
    lathe(P, M, [(0, depth * 0.30, "under"), (ri, depth * 0.30, "under"), (ri, depth * 0.96, "metal"), (ri + 0.004, depth, "metal"), (ro, depth, "metal"), (ro, 0.0, None)], seg)
    # o abafador: um cilindro achatado preso ao assoalho, à frente da ponteira
    lathe(P, frame(v3(x, y_in - 0.38, zc - 0.018), v3(0, 1, 0)), [(0, 0.36, "gunmetal"), (ro * 1.55, 0.36, "gunmetal"), (ro * 1.55, 0.0, "metal"), (0, 0.0, None)], seg)
    return P


def stub_pipe(name, x, y_in, zc, ro=0.030, depth=0.07, seg=10):
    """Ponta escura e curta da saída que só dá lugar à chama do nitro (o carro popular tem um escapamento só)."""
    P = Part(name)
    M = frame(v3(x, y_in, zc), v3(0, 1, 0))
    lathe(P, M, [(0, depth * 0.5, "under"), (ro * 0.8, depth * 0.5, "under"), (ro * 0.8, depth, "under"), (ro, depth, "gunmetal"), (ro, 0.0, None)], seg)
    return P


# ───────────────────────────── os lados, iguais nos dois carros (só mudam as posições) ─────────────────────────────
def sides_common(tree, doors_y, handles, rub_z=0.375, rub_y=(-0.90, 1.22), marker=(-1.80, 0.60), mirror_at=(0.935, -0.58, 1.03), flap=(1.62, 0.80), antenna_at=(-0.74, -1.12),
                 door_z=(0.325, 0.925), mirror_mat="paint"):
    """Frisos de porta, maçanetas (frente e trás), friso lateral de plástico, pisca lateral, retrovisores, tampa do tanque (só do lado direito) e antena."""
    out = []
    Pf = Part("fresta_porta")
    for ax in ("side+", "side-"):
        for y in doors_y:
            strip_on(Pf, tree, [(y, door_z[0]), (y + 0.004, (door_z[0] + door_z[1]) / 2), (y + 0.006, door_z[1])], 0.010, ax, "under", off=0.0055, step=0.04)
        for ya, yb in zip(doors_y[:-1], doors_y[1:]):
            strip_on(Pf, tree, [(ya, door_z[0] + 0.003), (yb, door_z[0] + 0.003)], 0.010, ax, "under", off=0.0055, step=0.04)
    out.append(Pf.finish())
    for ax, nm, sd in (("side+", "l", 1), ("side-", "r", -1)):
        Ph = Part(f"macaneta_{nm}")
        for (hy, hz) in handles:
            door_handle(Ph, tree, ax, hy, hz)
        out.append(Ph.finish())
        Pr = Part(f"friso_lateral_{nm}")
        raised(Pr, tree, ax, rrect((rub_y[0] + rub_y[1]) / 2, rub_z, rub_y[1] - rub_y[0], 0.052, 0.02, seg=1), 0.012, "bumper", inset=0.006, cell=0.3, step=0.12)
        out.append(Pr.finish())
        Pm = Part(f"pisca_lateral_{nm}")
        raised(Pm, tree, ax, rrect(marker[0], marker[1], 0.11, 0.045, 0.014, seg=2), 0.010, "amber", inset=0.004, cell=0.06, step=0.03)
        out.append(Pm.finish())
        out.append(mirror(f"retrovisor_{nm}", sd, *mirror_at, shell_mat=mirror_mat).finish())
    Pt = Part("tampa_comb")
    raised(Pt, tree, "side-", rrect(flap[0], flap[1], 0.19, 0.19, 0.06, seg=4), 0.010, "trim", inset=0.006, cell=0.08, step=0.04)
    raised(Pt, tree, "side-", rrect(flap[0], flap[1], 0.135, 0.135, 0.045, seg=4), 0.016, "paint", inset=0.006, cell=0.08, step=0.04)
    patch_on(Pt, tree, rrect(flap[0] + 0.035, flap[1], 0.035, 0.016, 0.006, seg=2), "side-", "chrome", h=0.05, off=0.0185)
    out.append(Pt.finish())
    out.append(antenna("antena", tree, antenna_at[0], antenna_at[1], height=0.42).finish())
    return out


def flares(tree, sp, width=0.05, h=0.016):
    """Alargamento dos para-lamas: o anel de plástico em torno de cada vão de roda (frente e trás), em relevo com a quina chanfrada, dos dois lados. Não usa o remendo de V6c: sobre a pele de nível 2 ele serrilhava."""
    out = []
    for ax, nm in (("side+", "l"), ("side-", "r")):
        P = Part(f"alargamento_{nm}")
        for p in cl.arch_flares(sp, width=width):
            raised(P, tree, ax, p["outline"], h, "bumper", inset=0.009, cell=0.12, step=0.06)
        out.append(P.finish())
    return out
