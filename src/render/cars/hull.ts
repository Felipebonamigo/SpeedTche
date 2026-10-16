// Casco HCT (V2, "um pouco mais realista que o Horizon Chase Turbo"): a carroceria descrita por LINHAS — cada medida é uma curva suave em z
// (`curve.ts`) — em vez das seções-chave do `BodyShape` (body.ts). Anel de 26 pontos por estação: soleira com saia inclinada, lateral em dois
// planos, VINCO DA CINTURA (a "shoulder line"), ombro até a borda do capô/tampa e topo abaulado SEM calha entre os para-lamas (o centro
// acompanha parte da subida do para-lama, `lift`). Arcos de roda recortados de verdade e para-lamas que sobem e alargam sobre as rodas
// (cobrindo o pneu grande da M4). Veio do protótipo aprovado pelo dono (`nc/estilo-carros`, `tools/estilo-carros/hct2/hull.ts`, rodada 2);
// aqui ganhou a faixa A configurável e as consultas que as peças usam para pousar na pele (`topAt`, `skinX`, `creaseY`, `endZ`).
// O nível 1 (lod1) sai do mesmo casco: menos facetas no arco, sem a rampa do para-lama e metade das estações do meio.
import type { Axle, CabSec, Region } from './body';
import { curve, type Curve, type Pts } from './curve';
import { loft, type Brush, type Lod, type MeshBuilder, type P2 } from './kit';

/** Região de cada lado do anel (metade direita, de baixo para cima: 13 lados; a esquerda é o espelho). Os nomes são os do `BodyShape`. */
const REGIONS: Region[] = ['under', 'well', 'well', 'sill', 'lower', 'lower', 'band', 'upper', 'upper', 'shoulder', 'top', 'stripe', 'center'];
/** Com o topo fino (`detail.fine`): um trecho a mais no ombro → faixa, na faixa e na faixa → centro. */
const REGIONS_FINE: Region[] = ['under', 'well', 'well', 'sill', 'lower', 'lower', 'band', 'upper', 'upper', 'shoulder', 'top', 'top', 'stripe', 'stripe', 'center', 'center'];
/** Pontos do anel: fundo, 12 de cada lado, centro do topo (com o topo fino, 15 de cada lado). */
export const HULL_RING = 26;
const ARCH_FACETS = 8;
const ARCH_FACETS_LOD = 4;

export interface HullSpec {
  /** Estações-chave em z (a primeira e a última são as pontas, fechadas em tampa). */
  zs: number[];
  axles: readonly [Axle, Axle];
  /** Fundo, borda do capô/tampa (no ombro), abaulado do centro, meia largura no vinco, altura do vinco (absoluta), recuo do ombro, recolhimento da saia. */
  yb: Pts; yt: Pts; crown: Pts; hw: Pts; yc: Pts; sh: Pts; tuck: Pts;
  /** Alargamento e subida do para-lama sobre cada roda (dianteira, traseira). A subida nunca deixa o pneu à mostra (`cover`). */
  flare: readonly [number, number]; rise: readonly [number, number];
  /** Comprimento da rampa do para-lama de cada roda, em raios do arco (padrão 1,45): a cunha, de capô baixo, sobe o para-lama dianteiro mais devagar. */
  ramp?: readonly [number, number];
  clear?: number; cover?: number;
  /** Altura da faixa lateral (camada B) logo abaixo do vinco. */
  band?: number;
  /** Faixa A do topo: x de fora e de dentro (o centro entre as duas faixas fica na pintura). */
  stripe?: readonly [number, number];
  /** Quanto da subida do para-lama o centro do capô acompanha (0 = calha entre os para-lamas; 0,55 = capô abaulado). */
  lift?: number;
  /** Casco simples (lod1): menos facetas no arco, sem a rampa do para-lama, metade das estações do meio. */
  lod?: Lod;
  /**
   * Mais faces onde a silhueta e o reflexo mostram (V2, realismo; só no lod0): `subdiv` estações entre cada par de estações-chave, `facets` facetas no
   * arco (padrão 8), `fine` um ponto a mais em cada trecho do topo (ombro → faixa → centro: o abaulado do capô e do teto deixa de ser poligonal).
   */
  detail?: { subdiv?: number; facets?: number; fine?: boolean };
  /** Vinco da cintura NÍTIDO: o ombro sai do vinco num ângulo acima do vinco das normais (45°, normals.ts), em vez de dobrar macio. */
  crisp?: boolean;
  brush: (region: Region, z: number, inArch: boolean) => Brush | null;
  capFront: Brush; capBack: Brush;
}

interface Station { z: number; archY: number | null; bump: number; axle: number }

export class Hull {
  readonly stations: Station[] = [];
  private readonly f: Record<'yb' | 'yt' | 'crown' | 'hw' | 'yc' | 'sh' | 'tuck', Curve>;
  readonly zFront: number;
  readonly zBack: number;

  constructor(readonly spec: HullSpec) {
    this.f = { yb: curve(spec.yb), yt: curve(spec.yt), crown: curve(spec.crown), hw: curve(spec.hw), yc: curve(spec.yc), sh: curve(spec.sh), tuck: curve(spec.tuck) };
    const clear = spec.clear ?? 0.06;
    this.zFront = spec.zs[0]; this.zBack = spec.zs[spec.zs.length - 1];
    const lod = spec.lod ?? 0;
    const facets = lod ? ARCH_FACETS_LOD : spec.detail?.facets ?? ARCH_FACETS;
    const sub = lod ? 1 : spec.detail?.subdiv ?? 1;
    const keyZs = lod ? spec.zs.filter((_, i, a) => i < 2 || i >= a.length - 2 || i % 2 === 0)
      : spec.zs.flatMap((z, i, a) => (i === 0 ? [z] : Array.from({ length: sub }, (_, k) => a[i - 1] + ((z - a[i - 1]) * (k + 1)) / sub)));
    const st: Station[] = keyZs.map((z) => ({ z, archY: null, bump: 0, axle: -1 }));
    spec.axles.forEach((ax, ai) => {
      const ra = ax.r + clear;
      // Estações do arco: rampa do para-lama, parede vertical, semicírculo em facetas, parede.
      const rp = this.ramp(ai);
      if (!lod) st.push({ z: ax.z - ra * rp, archY: null, bump: 0, axle: ai }, { z: ax.z + ra * rp, archY: null, bump: 0, axle: ai });
      // Rampa longa: uma estação no meio dela, senão a subida vira uma reta quebrada.
      if (!lod && rp > 1.6) st.push({ z: ax.z - ra * (1 + rp) / 2, archY: null, bump: 0, axle: ai }, { z: ax.z + ra * (1 + rp) / 2, archY: null, bump: 0, axle: ai });
      st.push({ z: ax.z - ra, archY: null, bump: 0, axle: ai }, { z: ax.z - ra, archY: ax.r, bump: 0, axle: ai });
      for (let k = facets - 1; k >= 1; k--) {
        const rad = (k / facets) * Math.PI;
        st.push({ z: ax.z + Math.cos(rad) * ra, archY: ax.r + Math.sin(rad) * ra, bump: 0, axle: ai });
      }
      st.push({ z: ax.z + ra, archY: ax.r, bump: 0, axle: ai }, { z: ax.z + ra, archY: null, bump: 0, axle: ai });
    });
    // Estações-chave dentro de um arco seguem a curva do arco; todas sabem quanto o para-lama sobe ali (`bump`).
    for (const s of st) {
      spec.axles.forEach((ax, ai) => {
        const ra = ax.r + clear; const dz = s.z - ax.z;
        if (s.axle === -1 && Math.abs(dz) < ra) { s.archY = ax.r + Math.sqrt(ra * ra - dz * dz); s.axle = ai; }
        const u = Math.min(1, Math.abs(dz) / (ra * this.ramp(ai)));
        s.bump = Math.max(s.bump, 0.5 + 0.5 * Math.cos(Math.PI * u));
      });
    }
    // Ordena por z; nas paredes do arco (mesmo z) a de fora vem antes na frente e depois atrás.
    st.sort((a, b) => a.z - b.z || this.wallOrder(a, b));
    this.stations = st.filter((s) => s.z >= this.zFront - 1e-9 && s.z <= this.zBack + 1e-9);
  }

  private ramp(ai: number): number { return this.spec.ramp?.[ai] ?? 1.45; }

  private wallOrder(a: Station, b: Station): number {
    const ax = this.spec.axles[Math.max(0, a.axle)];
    const front = a.z < ax.z;
    const ka = a.archY === null ? 0 : 1; const kb = b.archY === null ? 0 : 1;
    return front ? ka - kb : kb - ka;
  }

  /** Estação avulsa em z (sem arco), para consultar a forma com a subida e o alargamento dos para-lamas. */
  private probe(z: number): Station {
    const clear = this.spec.clear ?? 0.06;
    let bump = 0; let axle = 0; let best = Infinity;
    this.spec.axles.forEach((ax, ai) => {
      const ra = ax.r + clear; const dz = z - ax.z;
      bump = Math.max(bump, 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, Math.abs(dz) / (ra * this.ramp(ai)))));
      if (Math.abs(dz) < best) { best = Math.abs(dz); axle = ai; }
    });
    return { z, archY: null, bump, axle };
  }

  /** Medidas efetivas numa estação (com alargamento e subida do para-lama). */
  private params(s: Station) {
    const f = this.f; const z = s.z;
    const ai = s.axle >= 0 ? s.axle : (Math.abs(z - this.spec.axles[0].z) < Math.abs(z - this.spec.axles[1].z) ? 0 : 1);
    const ax = this.spec.axles[ai];
    const yt = f.yt(z);
    // O para-lama sobe até cobrir o pneu grande (M4): a borda fica `cover` acima do topo do arco.
    const cover = 2 * ax.r + (this.spec.clear ?? 0.06) + (this.spec.cover ?? 0.06) - yt;
    return {
      yb: f.yb(z), yt, crown: f.crown(z), hw: f.hw(z), yc: f.yc(z), sh: f.sh(z), tuck: f.tuck(z), ax,
      flare: this.spec.flare[ai] * s.bump, rise: Math.max(this.spec.rise[ai], cover) * s.bump,
    };
  }

  private topProfile(p: ReturnType<Hull['params']>) {
    const top = Math.max(0.12, p.hw + p.flare - p.sh);
    const yte = p.yt + p.rise;
    const yCenter = p.yt + p.crown + p.rise * (this.spec.lift ?? 0.55);
    return { top, yte, yCenter, y: (x: number) => yte + (yCenter - yte) * (1 - Math.min(1, Math.abs(x) / top) ** 2.4) };
  }

  /** Anel de `HULL_RING` pontos (anti-horário visto de trás). */
  ring(s: Station): P2[] {
    const p = this.params(s);
    const hwf = p.hw + p.flare;
    const { top, yte, yCenter, y: topY } = this.topProfile(p);
    const xin = Math.min(p.ax.x - p.ax.w / 2 - 0.05, hwf - p.tuck - 0.03);
    const yw = Math.min(Math.max(p.yb, s.archY ?? p.yb), yte - 0.1);
    const band = this.spec.band ?? 0.045;
    let yc = Math.max(p.yc + p.rise * 0.75, yw + 0.06);
    yc = Math.min(yc, yte - 0.07);
    const H = yc - yw;
    const bandEff = Math.max(0.004, Math.min(band, H * 0.3));
    const dx = hwf - top; const dy = yte - yc;
    const [sx1r, sx2r] = this.spec.stripe ?? [0.34, 0.1];
    const sx1 = Math.min(sx1r, top * 0.8); const sx2 = Math.min(sx2r, sx1 * 0.4);
    // Vinco nítido (`crisp`): o primeiro ponto do ombro mais para dentro e mais baixo, a dobra no vinco passa de 45° (e a de cima fica macia).
    const [kx, ky] = this.spec.crisp ? [0.5, 0.28] : [0.4, 0.4];
    const right: P2[] = [
      [xin, p.yb], [xin, yw], [hwf - p.tuck, yw],
      [hwf - 0.012, yw + Math.min(0.7 * p.tuck, 0.35 * H)], [hwf, yw + 0.62 * H], [hwf, yc - bandEff], [hwf, yc],
      [hwf - kx * dx, yc + ky * dy], [hwf - 0.78 * dx, yc + 0.86 * dy], [top, yte],
      [sx1, topY(sx1)], [sx2, topY(sx2)],
    ];
    // Topo fino (`detail.fine`, só no lod0): um ponto no meio de cada trecho de cima — do ombro à faixa, na faixa e da faixa ao centro.
    if (this.fine) {
      const mid = (a: number, b: number): P2 => { const x = (a + b) / 2; return [x, topY(x)]; };
      right.splice(10, 0, mid(top, sx1));
      right.splice(12, 0, mid(sx1, sx2));
      right.push(mid(sx2, 0));
    }
    const left = right.map(([x, y]) => [-x, y] as P2).reverse();
    return [[0, p.yb], ...right, [0, yCenter], ...left];
  }

  /** Topo fino (`detail.fine`) só no lod0. */
  private get fine(): boolean { return !this.spec.lod && !!this.spec.detail?.fine; }

  build(b: MeshBuilder): void {
    const rings = this.stations.map((s) => this.ring(s));
    const zs = this.stations.map((s) => s.z);
    const regions = this.fine ? REGIONS_FINE : REGIONS;
    const n = rings[0].length; const half = n / 2;
    loft(b, rings, zs, (k, i) => {
      const e = k < half ? k : n - 1 - k;
      const s0 = this.stations[i]; const s1 = this.stations[i + 1];
      const inArch = s0.archY !== null && s1.archY !== null;
      return this.spec.brush(regions[e], (s0.z + s1.z) / 2, inArch);
    }, true, this.spec.capFront, this.spec.capBack);
  }

  /** Altura da superfície de cima em (x, z) (fora dos para-lamas), para os detalhes pousarem nela. */
  topAt(z: number, x: number): number { return this.topProfile(this.params(this.probe(z))).y(x); }
  /** Meia largura da superfície de cima (onde a base da cabine assenta). */
  topHalf(z: number): number { return this.topProfile(this.params(this.probe(z))).top; }
  /** Meia largura no vinco (com o alargamento do para-lama). */
  halfWidth(z: number): number { const p = this.params(this.probe(z)); return p.hw + p.flare; }
  /** Borda do capô/tampa (com a subida do para-lama). */
  edgeTop(z: number): number { const p = this.params(this.probe(z)); return p.yt + p.rise; }
  /** Base da cabine em z: assenta rente à borda de cima do casco (meia largura do topo e a altura dela). */
  cabinBase(z: number): { z: number; hwb: number; yb: number } {
    const top = this.topHalf(z);
    return { z, hwb: top - 0.005, yb: this.topAt(z, top) - 0.004 };
  }
  /**
   * Seção de ponta da cabine (a base do para-brisa, o fim da tampa): plana na borda e com o meio descendo até o topo do casco (o `crown` negativo da
   * seção) — quando o capô afunda entre para-lamas altos, a borda do vidro acompanha o capô em vez de passar por cima dele deixando uma fresta.
   */
  cabinEnd(z: number): CabSec {
    const b = this.cabinBase(z);
    return { ...b, hwt: b.hwb, yt: b.yb, crown: Math.min(0, this.topAt(z, 0) - 0.004 - b.yb) };
  }
  /** Altura do vinco da cintura em z (onde a faixa B termina, por cima). */
  creaseY(z: number): number { return this.ring(this.probe(z))[7][1]; }
  /** x da pele lateral (lado direito) na altura y de z: da saia ao ombro. */
  skinX(z: number, y: number): number {
    const r = this.ring(this.probe(z));
    const pts = r.slice(4, 11); // da saia (p3) até a borda do capô (p9)
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i]; const [x1, y1] = pts[i + 1];
      if (y >= y0 - 1e-9 && y <= y1 + 1e-9 && y1 > y0) return x0 + (x1 - x0) * ((y - y0) / (y1 - y0));
    }
    return y < pts[0][1] ? pts[0][0] : pts[pts.length - 1][0];
  }
  /**
   * z da pele na ponta (`front` ou `back`) na meia largura x e altura y: a tampa da ponta é plana, mas a planta é redonda (a pele recua para o
   * lado); acha o z em que a pele ainda chega a x naquela altura.
   */
  endZ(x: number, y: number, end: 'front' | 'back'): number {
    const zEnd = end === 'front' ? this.zFront : this.zBack;
    const dir = end === 'front' ? 1 : -1;
    const zIn = zEnd + dir * 0.4;
    if (this.skinX(zEnd, y) >= x) return zEnd;
    if (this.skinX(zIn, y) <= x) return zIn;
    let lo = 0; let hi = 0.4;
    for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (this.skinX(zEnd + dir * mid, y) < x) lo = mid; else hi = mid; }
    return zEnd + dir * hi;
  }
}
