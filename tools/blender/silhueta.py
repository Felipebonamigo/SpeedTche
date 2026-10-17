"""Gera a silhueta 2D dos menus (SVG, viewBox 200x72) de um carro a partir do SEU spec (o mesmo casco do .glb): perfil do teto, vidros, rodas, luzes.
Uso: python3 tools/blender/silhueta.py cuiabano  -> imprime o trecho para `CAR_SHAPES` em src/ui/screens/icons.ts. Só Python puro (pchip do carlib sem bpy)."""
import importlib
import os
import sys
import types

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "specs"))
for m in ("bpy", "bmesh", "mathutils"):  # o carlib importa o bpy; aqui só se usa a curva
    sys.modules.setdefault(m, types.ModuleType(m))
sys.modules["mathutils"].Vector = object
sp = importlib.import_module(sys.argv[1]).SPEC
K, CX, GROUND = 35.0, 100.0, 67.0
ymid = (sp["nose"] + sp["tail"]) / 2


def X(y):
    return CX - (y - ymid) * K  # frente (y < 0) à direita


def Z(z):
    return GROUND - z * K


c = sp["curves"]
N = 28
ys = [sp["nose"] + (sp["tail"] - sp["nose"]) * i / N for i in range(N + 1)]
top = [(X(y), Z(c["top"](y))) for y in ys]
bot = [(X(y), Z(c["floor"](y) + 0.05)) for y in reversed(ys)]
body = "M" + " L".join(f"{x:.1f} {z:.1f}" for x, z in top + bot) + " Z"
w = sp["windows"]
gy = [w[0] + (w[1] - w[0]) * i / 10 for i in range(11)]
glass_top = [(X(y), Z(c["top"](y) - 0.05)) for y in gy]
glass_bot = [(X(y), Z(c["belt"](y) + 0.05)) for y in reversed(gy)]
glass = "M" + " L".join(f"{x:.1f} {z:.1f}" for x, z in glass_top + glass_bot) + " Z"
yb = [sp["nose"] + 0.2 + (sp["tail"] - sp["nose"] - 0.4) * i / 8 for i in range(9)]
acc = "M" + " L".join(f"{X(y):.1f} {Z(c['belt'](y) * 0.52):.1f}" for y in yb) + " L" + " L".join(f"{X(y):.1f} {Z(c['belt'](y) * 0.52 - 0.07):.1f}" for y in reversed(yb)) + " Z"
fa, ra = X(sp["wheel_positions"]()[0][0]), X(sp["wheel_positions"]()[2][0])
door = " ".join(f"M{X(y):.1f} {Z(0.93):.1f} L{X(y):.1f} {Z(0.32):.1f}" for y in sp["silhueta_portas"])
print(f"""  {sys.argv[1]}: () => ({{
    body: '{body}',
    glass: '{glass}',
    accent: '{acc}',
    extra: `<path d="{door}" stroke="#000" stroke-opacity=".35" stroke-width="1"/>`,
    wheels: wheel({fa:.0f}, 55, 12) + wheel({ra:.0f}, 55, 12),
    head: [{X(sp['nose']) - 6:.0f}, {Z(0.74):.1f}, 6, 3.5], tail: [{X(sp['tail']) - 1:.0f}, {Z(0.98):.1f}, 4, 8], shadow: [100, 82],
  }}),""")
