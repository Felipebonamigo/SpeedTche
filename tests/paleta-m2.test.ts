// Onda M, M2 (docs/ondas/M/M2.md, §5): as 18 combinações bioma × período como DADO e os critérios mensuráveis da calibração —
// tabela exportada (a M6 vai interpolar), contraste estrada × chão, carro branco e escuro × asfalto, luminância média, saturação
// máxima, céus distintos por bioma, o sol acima do anel de montanhas e o mar por período. As medidas aqui são INDEPENDENTES do
// código sob teste (luminância linear pelo three, HSV à mão): o teste não repete a conta da implementação.
// O que NÃO tem número aqui, e é do dono: ver M2.md §8 (beleza do reflexo, se a noite é legível numa tela de verdade, a saturação da
// IMAGEM, o "parece ele mesmo" de cada bioma).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import * as P from '../src/render/palette';
import { hexToRgb, luminance, SCENERIES, TIMES_OF_DAY } from '../src/render/palette';
import type { Palette } from '../src/render/palette';
import { gradingFor } from '../src/render/stylize';
import { sunSetup } from '../src/render/sky';
import { horizonElevation } from '../src/render/terrain';
import { TRACKS } from '../src/core/track/tracks';
import type { SceneryId, TimeOfDay } from '../src/core/types';

const HEX = /^#[0-9a-f]{6}$/;
const KEYS = SCENERIES.flatMap((s) => TIMES_OF_DAY.map((t) => `${s}:${t}`));
const COMBOS = SCENERIES.flatMap((s) => TIMES_OF_DAY.map((t) => [s, t] as const));

// O que o módulo deve exportar (ainda não existe quando o teste é escrito: o acesso dinâmico mantém o `tsc` quieto).
const table = (): Readonly<Record<string, Readonly<Palette>>> => (P as unknown as { PALETTE_TABLE: Record<string, Palette> }).PALETTE_TABLE;
// Cai para palette() se a tabela não existir, para que os critérios abaixo falhem pela MEDIDA e não pelo "sem tabela" (o 1º teste já cobra a tabela).
const entry = (s: SceneryId, t: TimeOfDay): Palette => table()?.[`${s}:${t}`] ?? P.palette(s, t);

// ── medidas independentes ──
/** Luminância relativa linear (a do WCAG, com a conversão sRGB → linear do three). */
const lin = (hex: string): number => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
/** Razão de contraste do WCAG entre duas cores (1 = iguais, 21 = preto × branco). */
const ratio = (a: string, b: string): number => { const x = lin(a); const y = lin(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hsv = (hex: string): { s: number; v: number } => { const [r, g, b] = hexToRgb(hex).map((c) => c / 255); const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); return { s: mx === 0 ? 0 : (mx - mn) / mx, v: mx }; };
const chroma = (hex: string): number => { const [r, g, b] = hexToRgb(hex).map((c) => c / 255); return Math.max(r, g, b) - Math.min(r, g, b); };
const rgbDist = (a: string, b: string): number => { const A = hexToRgb(a); const B = hexToRgb(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) / 255; };
const skyDist = (a: Palette, b: Palette): number => rgbDist(a.sky[0], b.sky[0]) + rgbDist(a.sky[1], b.sky[1]) + rgbDist(a.sky[2], b.sky[2]);
/** Luminância média da cena, só da paleta: 30% céu (topo 20 · meio 35 · horizonte 45), 35% chão, 15% asfalto, 20% planos do horizonte. */
function sceneLuma(p: Palette): number {
  const sky = 0.2 * luminance(p.sky[0]) + 0.35 * luminance(p.sky[1]) + 0.45 * luminance(p.sky[2]);
  const ground = (luminance(p.groundLow) + luminance(p.groundHigh)) / 2;
  const layers = (luminance(p.layers[0]) + luminance(p.layers[1]) + luminance(p.layers[2])) / 3;
  return 0.3 * sky + 0.35 * ground + 0.15 * luminance(p.asphalt) + 0.2 * layers;
}

/** Todo valor de um objeto, com o caminho (para achar o NaN e a cor inválida pelo nome). */
function walk(v: unknown, path: string, out: Array<[string, unknown]>): void {
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, out));
  else out.push([path, v]);
}

describe('PALETTE_TABLE: as 18 combinações como dado', () => {
  it('tem exatamente as 18 chaves bioma:período, está congelada, e palette() devolve a mesma entrada', () => {
    const t = table();
    expect(t, 'PALETTE_TABLE não existe').toBeDefined();
    expect(Object.keys(t).sort()).toEqual([...KEYS].sort());
    expect(Object.isFrozen(t)).toBe(true);
    for (const [s, tod] of COMBOS) {
      expect(Object.isFrozen(t[`${s}:${tod}`]), `${s}:${tod} congelada`).toBe(true);
      expect(P.palette(s, tod), `${s}:${tod}`).toBe(t[`${s}:${tod}`]);
    }
    expect((P as unknown as { PALETTE_KEYS: string[] }).PALETTE_KEYS.slice().sort()).toEqual([...KEYS].sort());
    expect((P as unknown as { paletteKey: (s: string, t: string) => string }).paletteKey('coast', 'dusk')).toBe('coast:dusk');
  });

  it('todas as 109 pistas resolvem uma entrada da tabela; as 13 combinações em uso estão entre as 18; as 39 do entardecer têm reflexo de lente', () => {
    const t = table();
    expect(TRACKS).toHaveLength(109);
    const used = new Set<string>();
    let dusk = 0;
    for (const def of TRACKS) {
      const p = t[`${def.scenery}:${def.timeOfDay}`];
      expect(p, `${def.id} (${def.scenery}:${def.timeOfDay}) sem paleta`).toBeDefined();
      used.add(`${def.scenery}:${def.timeOfDay}`);
      if (def.timeOfDay === 'dusk') { dusk++; expect(p.flare, `${def.id}: reflexo de lente`).toBeGreaterThan(0); }
      else expect(p.flare, `${def.id}: só o entardecer tem reflexo`).toBe(0);
    }
    expect(dusk).toBe(39);
    expect(used.size).toBe(13);
    for (const k of used) expect(KEYS).toContain(k);
  });

  it('sem NaN: todo número finito, toda cor #rrggbb, null só onde a cena não tem a coisa; as 18 têm as mesmas chaves (a M6 interpola campo a campo)', () => {
    const t = table();
    const NULLABLE = new Set(['sun', 'moon', 'cloudLit', 'lampPool']);
    const ref = Object.keys(t['coast:day']).sort();
    const bad: string[] = [];
    for (const k of KEYS) {
      const p = t[k];
      if (JSON.stringify(Object.keys(p).sort()) !== JSON.stringify(ref)) bad.push(`${k}: chaves diferentes`);
      for (const [field, value] of Object.entries(p)) {
        const flat: Array<[string, unknown]> = []; walk(value, field, flat);
        for (const [path, v] of flat) {
          if (typeof v === 'number') { if (!Number.isFinite(v)) bad.push(`${k} ${path}: ${v}`); }
          else if (typeof v === 'string') { if (!HEX.test(v)) bad.push(`${k} ${path}: ${v}`); }
          else if (typeof v === 'boolean') { /* stars */ }
          else if (v === null) { if (!NULLABLE.has(field)) bad.push(`${k} ${path}: null`); }
          else bad.push(`${k} ${path}: tipo ${typeof v}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('chão: contraste e saturação', () => {
  it('estrada × chão: o asfalto contra o chão baixo, o chão alto e a faixa de transição ≥ 1,6; contra o acostamento ≥ 1,3 (razão WCAG, luminância linear)', () => {
    const bad: string[] = [];
    for (const [s, tod] of COMBOS) {
      const p = entry(s, tod);
      for (const f of ['groundLow', 'groundHigh', 'verge'] as const) { const r = ratio(p.asphalt, p[f]); if (!(r >= 1.6)) bad.push(`${s}:${tod} ${f} ${r.toFixed(2)}`); }
      const r = ratio(p.asphalt, p.shoulder); if (!(r >= 1.3)) bad.push(`${s}:${tod} shoulder ${r.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });

  it('o carro branco lê contra o asfalto (≥ 4,5), o escuro também (≥ 1,35), e o branco ao sol nem estoura nem some', () => {
    const bad: string[] = [];
    for (const [s, tod] of COMBOS) {
      const p = entry(s, tod);
      const white = ratio(p.asphalt, '#f4f4f4'); const dark = ratio(p.asphalt, '#1c1c22');
      if (!(white >= 4.5)) bad.push(`${s}:${tod} branco ${white.toFixed(2)}`);
      if (!(dark >= 1.35)) bad.push(`${s}:${tod} escuro ${dark.toFixed(2)}`);
      // Teto do tom do capô branco (albedo 0,9): sol·sen(elevação) + hemisférica·0,9, sobre π (BRDF Lambert do three), na exposição já com a curva nova.
      const elev = sunSetup(tod, s).dir.y;
      const roof = (0.9 / Math.PI) * (p.sunIntensity * elev + p.hemiIntensity * 0.9) * gradingFor(p).exposure;
      if (!(roof >= 0.45 && roof <= 1.15)) bad.push(`${s}:${tod} capô branco ${roof.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });

  it('luminância média da cena (proxy da paleta) dentro da faixa do período: dia 0,42–0,66 · entardecer 0,33–0,58 · noite 0,12–0,30; e dia > entardecer > noite', () => {
    const band: Record<TimeOfDay, [number, number]> = { day: [0.42, 0.66], dusk: [0.33, 0.58], night: [0.12, 0.30] };
    const bad: string[] = [];
    for (const s of SCENERIES) {
      const l = TIMES_OF_DAY.map((t) => sceneLuma(entry(s, t)));
      TIMES_OF_DAY.forEach((t, i) => { const [lo, hi] = band[t]; if (!(l[i] >= lo && l[i] <= hi)) bad.push(`${s}:${t} ${l[i].toFixed(3)} fora de ${lo}–${hi}`); });
      if (!(l[0] > l[1] && l[1] > l[2])) bad.push(`${s}: ordem ${l.map((v) => v.toFixed(2)).join(' > ')}`);
    }
    expect(bad).toEqual([]);
  });

  it('saturação máxima: chão, rocha, areia, acostamento e transição ≤ 0,78 (HSV); céu e água ≤ 0,90; asfalto com croma ≤ 0,10; chão baixo ≥ 0,28', () => {
    const bad: string[] = [];
    for (const [s, tod] of COMBOS) {
      const p = entry(s, tod);
      for (const f of ['groundLow', 'groundHigh', 'rock', 'sand', 'shoulder', 'verge'] as const) {
        const c = hsv(p[f]); if (c.v >= 0.3 && c.s > 0.78) bad.push(`${s}:${tod} ${f} sat ${c.s.toFixed(2)}`);
      }
      for (const [name, c] of [['céu0', p.sky[0]], ['céu1', p.sky[1]], ['céu2', p.sky[2]], ['água fundo', p.waterDeep], ['água rasa', p.waterShallow]] as const) {
        const h = hsv(c); if (h.v >= 0.3 && h.s > 0.9) bad.push(`${s}:${tod} ${name} sat ${h.s.toFixed(2)}`);
      }
      if (chroma(p.asphalt) > 0.1) bad.push(`${s}:${tod} asfalto croma ${chroma(p.asphalt).toFixed(2)}`);
      if (hsv(p.groundLow).s < 0.28) bad.push(`${s}:${tod} groundLow cinza (${hsv(p.groundLow).s.toFixed(2)})`);
    }
    expect(bad).toEqual([]);
  });
});

describe('céu por bioma', () => {
  it('dois biomas quaisquer, no mesmo período, têm céus a uma distância mínima (soma RGB/255 das 3 paradas): dia 0,30 · entardecer 0,30 · noite 0,15', () => {
    const MIN: Record<TimeOfDay, number> = { day: 0.3, dusk: 0.3, night: 0.15 };
    const bad: string[] = [];
    for (const t of TIMES_OF_DAY) for (let i = 0; i < SCENERIES.length; i++) for (let j = i + 1; j < SCENERIES.length; j++) {
      const d = skyDist(entry(SCENERIES[i], t), entry(SCENERIES[j], t));
      if (!(d >= MIN[t])) bad.push(`${t} ${SCENERIES[i]} × ${SCENERIES[j]}: ${d.toFixed(3)} < ${MIN[t]}`);
    }
    expect(bad).toEqual([]);
  });

  it('o horizonte da noite de cada bioma é uma cor própria (≥ 0,08 de distância para qualquer outro)', () => {
    const bad: string[] = [];
    for (let i = 0; i < SCENERIES.length; i++) for (let j = i + 1; j < SCENERIES.length; j++) {
      const d = rgbDist(entry(SCENERIES[i], 'night').sky[2], entry(SCENERIES[j], 'night').sky[2]);
      if (!(d >= 0.08)) bad.push(`${SCENERIES[i]} × ${SCENERIES[j]}: ${d.toFixed(3)}`);
    }
    expect(bad).toEqual([]);
  });

  it('o sol e a lua ficam acima do anel de montanhas do bioma (folga ≥ 2°, nos 3 períodos e nos 6 biomas)', () => {
    const bad: string[] = [];
    for (const [s, tod] of COMBOS) {
      const { dir } = sunSetup(tod, s);
      const elev = (Math.asin(dir.y) * 180) / Math.PI;
      const turns = ((Math.atan2(dir.z, dir.x) / (2 * Math.PI)) % 1 + 1) % 1; // o anel gira com o céu: o azimute do sol sobre ele é fixo
      const ring = horizonElevation(s, turns);
      if (!(elev - ring >= 2)) bad.push(`${s}:${tod} sol ${elev.toFixed(1)}° × anel ${ring.toFixed(1)}° (folga ${(elev - ring).toFixed(1)}°)`);
    }
    expect(bad).toEqual([]);
  });

  it('a assinatura antiga sunSetup(período) segue valendo (elevação 34° · 9° · 20°)', () => {
    const e = (t: TimeOfDay): number => (Math.asin(sunSetup(t).dir.y) * 180) / Math.PI;
    expect(e('day')).toBeCloseTo(34, 3);
    expect(e('dusk')).toBeGreaterThan(8); expect(e('dusk')).toBeLessThan(15);
    expect(e('night')).toBeCloseTo(20, 3);
  });
});

describe('mar por período', () => {
  it('fundo mais escuro que o raso, espuma ≥ raso, noite mais escura que dia, e a água sempre tem cor (saturação ≥ 0,25)', () => {
    const bad: string[] = [];
    for (const [s, tod] of COMBOS) {
      const p = entry(s, tod);
      if (!(lin(p.waterDeep) < lin(p.waterShallow))) bad.push(`${s}:${tod} fundo mais claro que o raso`);
      if (!(lin(p.foam) >= lin(p.waterShallow))) bad.push(`${s}:${tod} espuma mais escura que o raso`);
      for (const [name, c] of [['fundo', p.waterDeep], ['raso', p.waterShallow]] as const) {
        const h = hsv(c); if (h.v >= 0.3 && h.s < 0.25) bad.push(`${s}:${tod} água ${name} sem cor (${h.s.toFixed(2)})`);
      }
    }
    for (const s of SCENERIES) {
      if (!(lin(entry(s, 'night').waterShallow) < lin(entry(s, 'day').waterShallow))) bad.push(`${s}: mar da noite não é mais escuro que o do dia`);
    }
    expect(bad).toEqual([]);
  });

  it('o brilho do sol na água sai da paleta: no entardecer o caminho é mais forte e mais comprido (expoente menor) que o do dia; todos finitos', () => {
    for (const [s, tod] of COMBOS) {
      const p = entry(s, tod);
      for (const v of [p.seaGlint, p.seaSky, p.seaSpec]) expect(Number.isFinite(v) && v > 0, `${s}:${tod}`).toBe(true);
      expect(p.seaSky, `${s}:${tod}`).toBeLessThanOrEqual(1);
    }
    for (const s of SCENERIES) {
      const day = entry(s, 'day'); const dusk = entry(s, 'dusk');
      expect(dusk.seaGlint, s).toBeGreaterThan(day.seaGlint);
      expect(dusk.seaSpec, s).toBeLessThan(day.seaSpec);
    }
  });
});
