// Canvas 2D que DESENHA de verdade (em Node, sem DOM): só o subconjunto que a fachada usa (V22/F5) — `fillRect` e `fill` de polígono/arco, cor sólida (`#rgb`,
// `#rrggbb`, `rgba()`) ou gradiente linear, com mistura por alfa. Serve para medir a TEXTURA da fachada (mapa de luz das janelas, sombra do beiral, reflexo do vidro)
// sem navegador. Não faz texto, traço nem `drawImage` (a fachada não usa); o que não existe vira no-op, como em `canvas-fake.ts`.
export interface Raster { width: number; height: number; data: Float32Array /* RGBA 0..1, 4 por pixel */ }

type Rgba = [number, number, number, number];

function parseColor(s: string): Rgba {
  const t = s.trim().toLowerCase();
  if (t[0] === '#') {
    const h = t.length === 4 ? t.slice(1).split('').map((c) => c + c).join('') : t.slice(1);
    const n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(t);
  if (m) {
    const v = m[1].split(',').map((x) => parseFloat(x));
    return [v[0] / 255, v[1] / 255, v[2] / 255, v.length > 3 ? v[3] : 1];
  }
  throw new Error(`cor não suportada no canvas de teste: ${s}`);
}

class Gradient {
  readonly stops: Array<[number, Rgba]> = [];
  constructor(readonly x0: number, readonly y0: number, readonly x1: number, readonly y1: number) {}
  addColorStop(o: number, c: string): void { this.stops.push([o, parseColor(c)]); this.stops.sort((a, b) => a[0] - b[0]); }
  at(x: number, y: number): Rgba {
    const dx = this.x1 - this.x0; const dy = this.y1 - this.y0;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - this.x0) * dx + (y - this.y0) * dy) / len2));
    const s = this.stops;
    if (s.length === 0) return [0, 0, 0, 0];
    if (t <= s[0][0]) return s[0][1];
    for (let i = 1; i < s.length; i++) {
      if (t <= s[i][0]) {
        const k = (t - s[i - 1][0]) / (s[i][0] - s[i - 1][0] || 1);
        const a = s[i - 1][1]; const b = s[i][1];
        return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
      }
    }
    return s[s.length - 1][1];
  }
}

export class RasterContext {
  fillStyle: string | Gradient = '#000000';
  strokeStyle: string = '#000000';
  lineWidth = 1;
  globalAlpha = 1;
  private pts: Array<[number, number]> = [];
  constructor(readonly raster: Raster) {}

  private plot(x: number, y: number, c: Rgba): void {
    const { width, height, data } = this.raster;
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    const a = c[3] * this.globalAlpha;
    data[i] = data[i] * (1 - a) + c[0] * a; data[i + 1] = data[i + 1] * (1 - a) + c[1] * a; data[i + 2] = data[i + 2] * (1 - a) + c[2] * a;
    data[i + 3] = Math.min(1, data[i + 3] + a * (1 - data[i + 3]));
  }
  private colorAt(x: number, y: number): Rgba { return typeof this.fillStyle === 'string' ? parseColor(this.fillStyle) : this.fillStyle.at(x, y); }

  fillRect(x: number, y: number, w: number, h: number): void {
    const solid = typeof this.fillStyle === 'string' ? parseColor(this.fillStyle) : null;
    const x0 = Math.round(Math.min(x, x + w)); const x1 = Math.round(Math.max(x, x + w));
    const y0 = Math.round(Math.min(y, y + h)); const y1 = Math.round(Math.max(y, y + h));
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) this.plot(px, py, solid ?? this.colorAt(px + 0.5, py + 0.5));
  }
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Gradient { return new Gradient(x0, y0, x1, y1); }
  beginPath(): void { this.pts = []; }
  moveTo(x: number, y: number): void { this.pts.push([x, y]); }
  lineTo(x: number, y: number): void { this.pts.push([x, y]); }
  closePath(): void { /* o fill fecha */ }
  rect(x: number, y: number, w: number, h: number): void { this.pts.push([x, y], [x + w, y], [x + w, y + h], [x, y + h]); }
  arc(cx: number, cy: number, r: number, a0: number, a1: number): void {
    let end = a1; while (end < a0) end += Math.PI * 2;
    const n = 24;
    for (let k = 0; k <= n; k++) { const a = a0 + ((end - a0) * k) / n; this.pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  }
  /** Preenchimento par-ímpar por linha de varredura (um subcaminho só: o que a fachada faz). */
  fill(): void {
    const p = this.pts; if (p.length < 3) return;
    let ymin = Infinity; let ymax = -Infinity;
    for (const [, y] of p) { ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
    for (let py = Math.floor(ymin); py <= Math.ceil(ymax); py++) {
      const yc = py + 0.5; const xs: number[] = [];
      for (let i = 0; i < p.length; i++) {
        const [xa, ya] = p[i]; const [xb, yb] = p[(i + 1) % p.length];
        if ((ya <= yc && yb > yc) || (yb <= yc && ya > yc)) xs.push(xa + ((yc - ya) / (yb - ya)) * (xb - xa));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let px = Math.round(xs[k]); px < Math.round(xs[k + 1]); px++) this.plot(px, py, this.colorAt(px + 0.5, yc));
    }
  }
  save(): void { /* sem pilha de estado */ }
  restore(): void { /* idem */ }
  clip(): void { /* sem recorte */ }
  stroke(): void { /* sem traço */ }
  strokeRect(): void { /* sem traço */ }
  fillText(): void { /* sem texto */ }
  measureText(): { width: number } { return { width: 10 }; }
}

export class RasterCanvas {
  width = 0; height = 0; style: Record<string, never> = {};
  private ctx: RasterContext | null = null;
  getContext(): RasterContext {
    if (!this.ctx) this.ctx = new RasterContext({ width: this.width, height: this.height, data: new Float32Array(this.width * this.height * 4) });
    return this.ctx;
  }
  get raster(): Raster { return this.getContext().raster; }
}

/** Instala um `document.createElement('canvas')` que devolve canvas desenhável; devolve a função que restaura o `document` e a lista dos canvas criados (na ordem). */
export function rasterCanvasDocument(): { restore: () => void; canvases: RasterCanvas[] } {
  const g = globalThis as { document?: unknown };
  const had = g.document;
  const canvases: RasterCanvas[] = [];
  g.document = { createElement: () => { const c = new RasterCanvas(); canvases.push(c); return c; } };
  return { restore: () => { g.document = had; }, canvases };
}

/** Luma (Rec.709) de um pixel do raster, 0..1 (sRGB direto, sem linearizar: é o que a textura guarda). */
export function lumaAt(r: Raster, x: number, y: number): number {
  const i = (y * r.width + x) * 4;
  return 0.2126 * r.data[i] + 0.7152 * r.data[i + 1] + 0.0722 * r.data[i + 2];
}
