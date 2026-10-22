// V22/F6 (docs/ondas/V22-f6-sombras.md): UMA lógica de sombra na cena. Antes, o poste e o prédio projetavam sombra direcional do sol, e a árvore, o cacto e a placa tinham uma mancha
// REDONDA centrada embaixo (`blob`, runtime.ts), sem seguir o sol; o pé de cada objeto flutuava na grama; a borda do mapa de sombra era granulada (PCF de 5 pontos, raio 2).
// Aqui: (A) a forma pura da sombra falsa (elipse esticada pelo sol), (B) o plano do PCF (raio e bias por mapa), (C) o `Scenery` de verdade, em Node: o ângulo e o comprimento
// de cada mancha, o contato escuro no pé, a opacidade e a tinta, (D) o AO da pista.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getTrack } from '../src/core/track';
import { livePalette, palette, SCENERIES, TIMES_OF_DAY } from '../src/render/palette';
import * as RT from '../src/render/road-textures';
import { shadowPlan, SHADOW_SPAN_M } from '../src/render/postfx/plan';
import { ShadowRing } from '../src/render/postfx/shadows';
import { buildRoadFrame } from '../src/render/roadframe';
import * as SB from '../src/render/scenery/sombra-falsa';
import { fakeCanvasDocument } from './canvas-fake';

const DEG = Math.PI / 180;
/** Vetor (da cena) PARA o sol, a partir de azimute e elevação em graus (a convenção de `sky.ts`: x direita, y cima, −z frente). */
function sunTo(elDeg: number, azDeg: number): { x: number; y: number; z: number } {
  const el = elDeg * DEG; const az = azDeg * DEG;
  return { x: Math.sin(az) * Math.cos(el), y: Math.sin(el), z: -Math.cos(az) * Math.cos(el) };
}
/** Diferença de ângulo (graus, 0..180) entre dois rumos no plano. */
function angDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d / DEG;
}

describe('V22/F6 (A): a forma pura da sombra falsa (sombra-falsa.ts)', () => {
  it('o eixo maior aponta para longe do sol, em qualquer azimute', () => {
    for (let az = -180; az < 180; az += 15) {
      const s = SB.blobShape(sunTo(34, az), 2.4, 6, false);
      const want = Math.atan2(-sunTo(34, az).z, -sunTo(34, az).x);
      expect(angDiff(Math.atan2(s.dirZ, s.dirX), want), `azimute ${az}`).toBeLessThan(0.01);
      expect(Math.hypot(s.dirX, s.dirZ)).toBeCloseTo(1, 9);
    }
  });

  it('o semieixo maior = altura ÷ tan(elevação), preso a [1,2 ; 3,0] × o raio', () => {
    const r = 2.4;
    // sol baixo (10°): 6 ÷ tan 10° = 34 m → preso em 3,0 r
    expect(SB.blobShape(sunTo(10, 0), r, 6, false).along).toBeCloseTo(3.0 * r, 9);
    // sol a 45°: 6 ÷ 1 = 6 m (entre 1,2 r = 2,88 e 3 r = 7,2): vale a conta
    expect(SB.blobShape(sunTo(45, 0), r, 6, false).along).toBeCloseTo(6, 9);
    // sol a pino (85°): 6 ÷ tan 85° = 0,52 m → preso em 1,2 r (nunca encolhe abaixo disso: o contato continua coberto)
    expect(SB.blobShape(sunTo(85, 0), r, 6, false).along).toBeCloseTo(1.2 * r, 9);
    // a largura é o raio de antes (a mancha só se estica, não engorda)
    expect(SB.blobShape(sunTo(34, 0), r, 6, false).across).toBeCloseTo(r, 9);
  });

  it('o ponto de contato fica dentro da mancha: a borda de trás da elipse é o raio de antes (o que já cobria o pé)', () => {
    for (const el of [9, 20, 34, 60, 85]) {
      const r = 1.8; const s = SB.blobShape(sunTo(el, 20), r, 7, false);
      expect(s.shift - s.along, `el ${el}`).toBeCloseTo(-r, 9);
    }
  });

  it('mastro (poste, placa alta, cipreste): só a faixa estreita; o comprimento passa do teto da copa, mas é preso em THIN_LEN_MAX_M', () => {
    // O raio de um poste é 0,7 m: preso em 3 r daria uma sombra de 2 m para um mastro de 10 m. O mastro tem teto próprio.
    expect(SB.isThin(0.7, 9.8)).toBe(true); // poste
    expect(SB.isThin(0.4, 9.6)).toBe(true); // poste de cerca
    expect(SB.isThin(1.2, 8.7)).toBe(true); // outdoor
    expect(SB.isThin(2.4, 5.8)).toBe(false); // árvore
    expect(SB.isThin(2.46, 2.3)).toBe(false); // pedra
    const s = SB.blobShape(sunTo(50, 0), 0.7, 9.8, true); // 9,8 ÷ tan 50° = 8,2 m: abaixo do teto, vale a conta
    expect(s.along).toBeCloseTo(9.8 / Math.tan(50 * DEG), 6);
    expect(s.along).toBeGreaterThan(3 * 0.7 * 3); // bem além dos 3 r (2,1 m) que a regra da copa daria a um poste
    expect(s.along).toBeLessThanOrEqual(SB.THIN_LEN_MAX_M);
    expect(SB.blobShape(sunTo(5, 0), 0.7, 9.8, true).along).toBeCloseTo(SB.THIN_LEN_MAX_M, 9);
  });

  it('o sol a pino (ou sem direção) não gera NaN: a mancha cai no redondo de antes', () => {
    for (const sun of [{ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1e-12, y: 1, z: 0 }]) {
      const s = SB.blobShape(sun, 2.4, 6, false);
      for (const v of [s.dirX, s.dirZ, s.along, s.across, s.shift]) expect(Number.isFinite(v)).toBe(true);
      expect(s.along).toBeGreaterThanOrEqual(1.2 * 2.4 - 1e-9);
    }
  });

  it('o raio do contato é uma fração curta do raio da copa (o escuro "curto" do pé)', () => {
    for (const [r, thin] of [[2.4, false], [1.1, false], [0.7, true], [1.2, true]] as const) {
      const c = SB.contactRadius(r, thin);
      expect(c).toBeGreaterThan(0.2);
      expect(c).toBeLessThanOrEqual(0.6 * r + 1e-9 + (thin ? 0.4 : 0));
      expect(c).toBeLessThanOrEqual(1.4);
    }
  });

  it('opacidade ≤ 0,34 e a tinta é de sombra (azul-lilás: o azul não cai abaixo do vermelho)', () => {
    expect(SB.BLOB_OPACITY_MAX).toBeLessThanOrEqual(0.34);
    for (const op of [0.32, 0.4, 0.9]) expect(SB.blobOpacityFor(op)).toBeLessThanOrEqual(0.34 + 1e-9);
    expect(SB.blobOpacityFor(0.32)).toBeCloseTo(0.32, 9); // o dia não perde densidade: só o teto vale
  });
});

describe('V22/F6 (B): o plano do PCF (raio e bias) e o `ShadowRing`', () => {
  it('a penumbra em metros fica em 0,22 – 0,5 m nos dois tamanhos de mapa (raio 2 nos 2048 dava 0,16 m: granulado)', () => {
    for (const [q, n] of [['medium', 1], ['high', 1], ['high', 2], ['ultra', 2], ['medium', 4], ['high', 4]] as const) {
      const p = shadowPlan(q, n);
      const texel = SHADOW_SPAN_M / p.mapSize;
      const pen = p.radius * texel;
      expect(pen, `${q}/${n}: ${pen.toFixed(3)} m`).toBeGreaterThanOrEqual(0.22);
      expect(pen, `${q}/${n}: ${pen.toFixed(3)} m`).toBeLessThanOrEqual(0.5);
    }
  });

  it('o normalBias acompanha o texel (≥ 0,7 texel: senão o raio maior faz acne) e o bias é o de antes', () => {
    for (const [q, n] of [['medium', 1], ['high', 1], ['medium', 4]] as const) {
      const p = shadowPlan(q, n);
      const texel = SHADOW_SPAN_M / p.mapSize;
      expect(p.normalBias, `${q}/${n}`).toBeGreaterThanOrEqual(0.7 * texel);
      expect(p.normalBias).toBeLessThanOrEqual(2 * texel); // e não solta a sombra do pé (peter-panning)
      expect(p.bias).toBeCloseTo(-0.00025, 9);
    }
  });

  it('a Baixa continua sem sombra do sol (nada de mapa)', () => {
    expect(shadowPlan('low', 1)).toMatchObject({ enabled: false, mapSize: 0 });
  });

  it('`ShadowRing.beginFrame` grava raio, bias e normalBias do plano na luz (a cada quadro, também ao trocar de 2 para 3 jogadores)', () => {
    const light = new THREE.DirectionalLight();
    const ring = new ShadowRing(light.shadow);
    for (const [q, n] of [['high', 1], ['high', 4], ['medium', 1]] as const) {
      const p = shadowPlan(q, n);
      ring.beginFrame(p);
      expect(light.shadow.radius, `${q}/${n} radius`).toBe(p.radius);
      expect(light.shadow.bias, `${q}/${n} bias`).toBe(p.bias);
      expect(light.shadow.normalBias, `${q}/${n} normalBias`).toBe(p.normalBias);
    }
    ring.dispose();
  });
});

describe('V22/F6 (C): o `Scenery` de verdade — sombra falsa direcional, contato e opacidade', () => {
  let restore = (): void => {};
  beforeEach(() => { restore = fakeCanvasDocument(); });
  afterEach(() => restore());

  interface Blob { kind: 'crown' | 'thin' | 'contact'; ex: number; ez: number; fx: number; fz: number; x: number; y: number; z: number; a: number; b: number }

  /** As manchas visíveis (instância a instância) depois de um `update`, com o eixo X (maior), o eixo Z (menor) e o centro. */
  async function manchas(trackId: string, zFrac: number, sun: { x: number; y: number; z: number } | undefined, mapa?: (s: unknown) => void): Promise<Blob[]> {
    const { Scenery } = await import('../src/render/scenery/runtime');
    const track = getTrack(trackId);
    const s = new Scenery();
    const frame = buildRoadFrame(track, track.length * zFrac, 30, 200);
    (s.update as (...a: unknown[]) => void).call(s, frame, track, 1, 1, true, sun);
    mapa?.(s);
    const g = s as unknown as { batches: Array<{ key: string; mesh: THREE.BatchedMesh }>; slots: Array<{ batch: number; start: number; used: number }>; blobSlots: { crown: number; thin: number; contact: number } };
    const bi = g.batches.findIndex((b) => b.key === 'blob');
    expect(bi, 'sem lote de manchas').toBeGreaterThanOrEqual(0);
    const mesh = g.batches[bi].mesh;
    const out: Blob[] = [];
    const m = new THREE.Matrix4();
    for (const kind of ['crown', 'thin', 'contact'] as const) {
      const si = g.blobSlots[kind];
      if (si === undefined || si < 0) continue;
      const sl = g.slots[si];
      for (let k = 0; k < sl.used; k++) {
        mesh.getMatrixAt(sl.start + k, m);
        const e = m.elements;
        out.push({ kind, ex: e[0], ez: e[2], fx: e[8], fz: e[10], x: e[12], y: e[13], z: e[14], a: Math.hypot(e[0], e[2]), b: Math.hypot(e[8], e[10]) });
      }
    }
    s.dispose();
    return out;
  }

  it('todas as manchas de copa e de mastro apontam para longe do sol (≤ 10° do azimute), em qualquer trecho (rumo da pista) — a árvore e o poste na MESMA direção', async () => {
    const sun = sunTo(34, -42); // o dia da paleta (palette.ts SUN.day)
    const want = Math.atan2(-sun.z, -sun.x);
    for (const zf of [0.05, 0.3, 0.55]) {
      const ms = (await manchas('copacabana', zf, sun)).filter((b) => b.kind !== 'contact');
      const crowns = ms.filter((b) => b.kind === 'crown'); const thins = ms.filter((b) => b.kind === 'thin');
      expect(crowns.length, `copas em ${zf}`).toBeGreaterThanOrEqual(8);
      expect(thins.length, `mastros em ${zf}`).toBeGreaterThanOrEqual(2);
      for (const b of ms) expect(angDiff(Math.atan2(b.ez, b.ex), want), `${b.kind} em ${zf}`).toBeLessThanOrEqual(10);
    }
  }, 120000);

  it('a copa é uma ELIPSE esticada (semieixo maior ÷ menor entre 1,2 e 3,0), o mastro é mais fino e mais comprido que a copa', async () => {
    const ms = await manchas('copacabana', 0.3, sunTo(34, -42));
    const crowns = ms.filter((b) => b.kind === 'crown'); const thins = ms.filter((b) => b.kind === 'thin');
    expect(crowns.length).toBeGreaterThanOrEqual(8);
    for (const b of crowns) {
      expect(b.a / b.b).toBeGreaterThanOrEqual(1.2 - 1e-6);
      expect(b.a / b.b).toBeLessThanOrEqual(3.0 + 1e-6);
    }
    expect(Math.max(...crowns.map((b) => b.a / b.b)), 'alguma copa tem de esticar de verdade (> 1,5)').toBeGreaterThan(1.5);
    for (const b of thins) expect(b.a / b.b, 'mastro').toBeGreaterThan(3);
  }, 120000);

  it('o sol baixo (entardecer, 9°) estica mais que o sol alto (34°): o comprimento acompanha a elevação', async () => {
    const alto = (await manchas('copacabana', 0.3, sunTo(60, -42))).filter((b) => b.kind === 'crown');
    const baixo = (await manchas('copacabana', 0.3, sunTo(9, -42))).filter((b) => b.kind === 'crown');
    const med = (v: Blob[]): number => v.map((b) => b.a / b.b).reduce((s, x) => s + x, 0) / v.length;
    expect(med(baixo)).toBeGreaterThan(med(alto) + 0.4);
  }, 120000);

  it('cada mancha tem o seu contato escuro no pé: 2 discos curtos empilhados (o miolo e a borda, ≤ 0,6 do raio) no ponto onde o objeto toca o chão, e a elipse os cobre', async () => {
    const ms = await manchas('copacabana', 0.3, sunTo(34, -42));
    const crowns = ms.filter((b) => b.kind === 'crown'); const thins = ms.filter((b) => b.kind === 'thin'); const contacts = ms.filter((b) => b.kind === 'contact');
    // A opacidade do material é ≤ 0,34 (e uma mancha só de 0,3 some sobre o verde vivo): o contato é CONTACT_LAYERS discos empilhados (0,32 → ~0,5 no miolo), de raios decrescentes.
    expect(SB.CONTACT_LAYERS).toBeGreaterThanOrEqual(2);
    // O contato é só de objeto que tem pé de verdade (≥ CONTACT_MIN_HEIGHT_M: poste, árvore, placa, pedra); arbusto e flor não (2 △ a mais por objeto contam no gate, e o pé deles já é a própria mancha).
    expect(SB.contactWanted(0.9)).toBe(false); expect(SB.contactWanted(2.3)).toBe(true); expect(SB.contactWanted(9.8)).toBe(true);
    expect(contacts.length % SB.CONTACT_LAYERS, 'camadas inteiras por objeto').toBe(0);
    expect(contacts.length / SB.CONTACT_LAYERS, 'a maioria dos objetos com mancha tem pé (árvores e postes)').toBeGreaterThanOrEqual(0.5 * (crowns.length + thins.length));
    expect(contacts.length / SB.CONTACT_LAYERS, 'mas nem todos: os arbustos ficam sem').toBeLessThan(crowns.length + thins.length);
    const raios = new Set(contacts.map((c) => c.b.toFixed(3)));
    expect(raios.size, 'as camadas têm raios diferentes (um miolo mais escuro)').toBeGreaterThanOrEqual(SB.CONTACT_LAYERS);
    // cada contato cai dentro de alguma elipse (o pé está coberto) e é menor que ela
    let dentro = 0;
    for (const c of contacts) {
      expect(c.a, 'contato redondo').toBeCloseTo(c.b, 6);
      const host = [...crowns, ...thins].find((e) => {
        const dx = c.x - e.x; const dz = c.z - e.z;
        const u = (dx * e.ex + dz * e.ez) / (e.a * e.a); const v = (dx * e.fx + dz * e.fz) / (e.b * e.b);
        return u * u + v * v <= 1.0001 && c.b < e.b + 1e-6 && Math.abs(c.y - e.y) < 0.2;
      });
      if (host) dentro++;
    }
    expect(dentro / contacts.length, 'contatos dentro da própria elipse').toBeGreaterThanOrEqual(0.95);
  }, 120000);

  it('sem sol informado a mancha fica redonda como antes (ninguém quebra: estúdio, garagem, testes antigos)', async () => {
    const ms = (await manchas('copacabana', 0.3, undefined)).filter((b) => b.kind === 'crown' || b.kind === 'thin');
    expect(ms.length).toBeGreaterThanOrEqual(8);
    for (const b of ms) expect(Number.isFinite(b.a) && Number.isFinite(b.b)).toBe(true);
  }, 120000);

  it('opacidade ≤ 0,34 nos três períodos (setLive) e a cor da mancha é de sombra (B ≥ R), sem programa novo (version)', async () => {
    const { Scenery } = await import('../src/render/scenery/runtime');
    const s = new Scenery();
    const g = s as unknown as { blobMat: THREE.MeshBasicMaterial };
    const v0 = g.blobMat.version;
    for (const [bioma, time] of [['tropical', 'day'], ['tropical', 'dusk'], ['city_night', 'night']] as const) {
      s.setLive(livePalette(bioma, time, 3, 0).p);
      expect(g.blobMat.opacity, `${bioma}/${time}`).toBeLessThanOrEqual(0.34 + 1e-9);
      expect(g.blobMat.opacity, `${bioma}/${time}`).toBeGreaterThanOrEqual(0.2);
      expect(g.blobMat.color.b, `${bioma}/${time} B`).toBeGreaterThanOrEqual(g.blobMat.color.r);
    }
    expect(g.blobMat.version).toBe(v0);
    s.dispose();
  });
});

describe('V22/F6 (E): copas próximas no mapa do sol (só Alta e Ultra, 1–2 jogadores)', () => {
  it('shadowPlan.crowns: 60 m na Alta e no Ultra com 1–2 jogadores; 0 na Baixa, na Média e com 3–4 (cada viewport paga a própria conta)', () => {
    for (const q of ['high', 'ultra'] as const) for (const n of [1, 2]) expect(shadowPlan(q, n).crowns, `${q}/${n}`).toBe(60);
    for (const q of ['high', 'ultra'] as const) for (const n of [3, 4]) expect(shadowPlan(q, n).crowns, `${q}/${n}`).toBe(0);
    for (const n of [1, 2, 3, 4]) { expect(shadowPlan('medium', n).crowns, `medium/${n}`).toBe(0); expect(shadowPlan('low', n).crowns, `low/${n}`).toBe(0); }
  });
});

describe('V22/F6 (E): o `Scenery` — a copa a menos de 60 m passa para o lote que projeta sombra', () => {
  let restore = (): void => {};
  beforeEach(() => { restore = fakeCanvasDocument(); });
  afterEach(() => restore());

  /** Instâncias usadas por lote (`flat` = projeta sombra; `dress` = decoração sem sombra) depois de um update na Foz (mata farta). */
  async function usados(crowns: number | undefined): Promise<{ flat: number; dress: number; castFlat: boolean; castDress: boolean }> {
    const { Scenery } = await import('../src/render/scenery/runtime');
    const track = getTrack('foz_do_iguacu');
    const s = new Scenery();
    const frame = buildRoadFrame(track, track.length * 0.25, 30, 260);
    (s.update as (...a: unknown[]) => void).call(s, frame, track, 1, 1, true, sunTo(34, -42), crowns);
    const g = s as unknown as { batches: Array<{ key: string; mesh: THREE.BatchedMesh; slots: number[] }>; slots: Array<{ used: number }> };
    const tot = (key: string): number => g.batches.filter((b) => b.key === key).reduce((a, b) => a + b.slots.reduce((x, si) => x + g.slots[si].used, 0), 0);
    const cast = (key: string): boolean => g.batches.some((b) => b.key === key && b.mesh.castShadow);
    const out = { flat: tot('flat'), dress: tot('dress'), castFlat: cast('flat'), castDress: cast('dress') };
    s.dispose();
    return out;
  }

  it('com `crowns` = 60 o lote que projeta ganha as árvores próximas e o `dress` perde as mesmas (a soma não muda: nada some, nada dobra); sem ele, tudo como antes', async () => {
    const base = await usados(undefined);
    const zero = await usados(0);
    const com = await usados(60);
    expect(zero).toEqual(base);
    expect(com.flat, 'árvores próximas entram no lote que projeta').toBeGreaterThanOrEqual(base.flat + 4);
    expect(com.flat + com.dress, 'a soma é a mesma: a instância troca de lote, não se repete').toBe(base.flat + base.dress);
    expect(com.dress).toBeLessThan(base.dress);
    expect(com.castFlat).toBe(true);
    expect(com.castDress, 'o dress continua sem projetar (só as copas próximas projetam)').toBe(false);
  }, 120000);

  it('a copa projeta só a menos de `crowns` m à frente: com `crowns` = 0 NUNCA (o `ahead` negativo, dos objetos atrás do carro, passava em `ahead < 0` e as árvores de trás entravam no mapa do sol)', async () => {
    const { Scenery } = await import('../src/render/scenery/runtime');
    const track = getTrack('foz_do_iguacu');
    for (const crowns of [0, 60, 120]) {
      const s = new Scenery();
      const frame = buildRoadFrame(track, track.length * 0.25, 30, 260);
      const calls: Array<{ ahead: number; crown: boolean }> = [];
      const g = s as unknown as { place: (...a: unknown[]) => void };
      const orig = g.place.bind(s);
      g.place = (...a: unknown[]): void => { calls.push({ ahead: (a[3] as number) - frame.behind, crown: a[6] as boolean }); orig(...a); };
      (s.update as (...a: unknown[]) => void).call(s, frame, track, 1, 1, true, sunTo(34, -42), crowns);
      expect(calls.length, `crowns ${crowns}`).toBeGreaterThan(100);
      expect(calls.filter((c) => c.ahead < 0).length, 'a janela tem objetos atrás do carro').toBeGreaterThan(0);
      for (const c of calls) {
        if (crowns === 0) expect(c.crown, `crowns 0: ahead ${c.ahead}`).toBe(false);
        else if (c.crown) expect(c.ahead * 4, `crowns ${crowns}`).toBeLessThan(crowns);
      }
      expect(calls.filter((c) => c.crown).length === 0, `crowns ${crowns}`).toBe(crowns === 0);
      s.dispose();
    }
  }, 180000);

  it('o raio de 60 m manda: com 20 m entram menos árvores que com 60 m; com 120 m, mais', async () => {
    const a = (await usados(20)).flat; const b = (await usados(60)).flat; const c = (await usados(120)).flat;
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  }, 180000);
});

describe('V22/F6 (D): oclusão de contato na pista — o pé da guia', () => {
  type Img = { width: number; height: number; data: ArrayLike<number> };
  const luma = (im: Img, x: number, y: number): number => (0.2126 * im.data[(y * im.width + x) * 4] + 0.7152 * im.data[(y * im.width + x) * 4 + 1] + 0.0722 * im.data[(y * im.width + x) * 4 + 2]) / 255;
  /** Luma média da faixa u0..u1 do acostamento (todas as linhas: o pedrisco e a mancha da textura se anulam). */
  const band = (im: Img, u0: number, u1: number): number => {
    let s = 0; let n = 0;
    for (let y = 0; y < im.height; y++) for (let x = Math.floor(u0 * im.width); x < Math.ceil(u1 * im.width); x++) { s += luma(im, x, y); n++; }
    return s / n;
  };

  it('`shoulderContactAo(u)`: 1 longe do pé da guia, ≤ 0,86 no pé, suave (sem degrau) e só do lado de fora da guia', () => {
    const f = RT.shoulderContactAo;
    expect(f, 'shoulderContactAo não existe').toBeTypeOf('function');
    for (const u of [0, 0.05, 0.14, 0.3, 0.62, 0.8, 1]) expect(f(u), `u ${u}`).toBeCloseTo(1, 9);
    const pe = Math.min(...Array.from({ length: 200 }, (_, i) => f(0.3 + (i / 199) * 0.35)));
    expect(pe).toBeLessThanOrEqual(0.86);
    expect(pe).toBeGreaterThan(0.6);
    for (let i = 1; i <= 400; i++) expect(Math.abs(f(i / 400) - f((i - 1) / 400)), `u ${i / 400}`).toBeLessThan(0.02);
  });

  it('o acostamento pintado tem o pé da guia mais escuro que o cascalho ao lado (antes: o degradê da guia só descia da guia clara ao cascalho), nos 6 biomas × 3 horas', () => {
    for (const sc of SCENERIES) for (const t of TIMES_OF_DAY) {
      const im = RT.shoulderImage(palette(sc, t)) as Img;
      const pe = band(im, 0.44, 0.5); const miolo = band(im, 0.58, 0.68);
      expect(pe / miolo, `${sc}/${t}: pé ${pe.toFixed(3)} ÷ miolo ${miolo.toFixed(3)}`).toBeLessThanOrEqual(0.98);
    }
  });
});
