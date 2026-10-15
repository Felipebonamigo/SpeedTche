// Curva suave por pontos-chave (cúbica de Hermite monótona, Fritsch-Carlson): sem "ondas" entre os pontos e com os picos achatados. É o que
// descreve um carro HCT (V2) como LINHAS em z — capô, cintura, largura — em vez de caixas por seção (`hull.ts`). Do protótipo aprovado
// (`nc/estilo-carros`, `tools/estilo-carros/hct2/curve.ts`). Puro.
export type Pts = ReadonlyArray<readonly [number, number]>;
export type Curve = (x: number) => number;

export function curve(pts: Pts): Curve {
  const n = pts.length;
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m: number[] = new Array<number>(n).fill(0);
  if (n > 1) { m[0] = d[0]; m[n - 1] = d[n - 2]; }
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i]; const b = m[i + 1] / d[i]; const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (n === 1 || x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i]; const t = (x - xs[i]) / h;
    const t2 = t * t; const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
