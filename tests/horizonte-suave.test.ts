// Nuvens e montanhas do horizonte suaves (pedido do dono, 04/10): o shader calculava a normal pela face (dFdx/dFdy)
// e cada triângulo pegava uma luz só — nuvem e serra facetadas. Agora a normal vem do vértice, suave, e o contorno
// das montanhas tem o dobro de pontos.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cloudAtlasImage, CLOUD_FRAG } from '../src/render/sky';
import { buildRing, RING_FRAG, ringProfile } from '../src/render/terrain';

/** Fração dos cantos cuja normal se afasta > 2° da normal da própria face (0 = tudo facetado). */
function smoothFraction(g: THREE.BufferGeometry): number {
  const pos = g.getAttribute('position'); const nor = g.getAttribute('normal');
  if (!nor) return 0;
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3(); const v = new THREE.Vector3();
  let bent = 0; let total = 0;
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    const fn = b.sub(a).cross(c.sub(a));
    if (fn.lengthSq() < 1e-12) continue;
    fn.normalize();
    for (let k = 0; k < 3; k++) { total++; if (v.fromBufferAttribute(nor, i + k).dot(fn) < Math.cos(2 * Math.PI / 180)) bent++; }
  }
  return bent / total;
}

describe('horizonte suave', () => {
  it('os shaders das nuvens e das montanhas usam a normal do vértice, não a da face', () => {
    expect(CLOUD_FRAG).not.toMatch(/dFdx/);
    expect(RING_FRAG).not.toMatch(/dFdx/);
  });

  // V4 (docs/ondas/V4-pistas.md): as nuvens viraram impostores com a normal PINTADA num atlas (a malha é de quadros, a normal da face não diz nada).
  // A regra continua a mesma — nuvem sem faceta —, medida onde a normal agora mora: entre pixels vizinhos do miolo (cobertura cheia) ela gira pouco.
  it('nuvens: a normal pintada no atlas é lisa (no miolo, entre pixels vizinhos, gira < 12°; nenhum degrau de faceta)', () => {
    const a = cloudAtlasImage();
    const n = (i: number): THREE.Vector3 => {
      const x = a.data[i * 4] / 127.5 - 1; const y = a.data[i * 4 + 1] / 127.5 - 1;
      return new THREE.Vector3(x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y)));
    };
    let worst = 0; let inner = 0;
    for (let y = 1; y < a.height - 1; y += 2) for (let x = 1; x < a.width - 1; x += 2) {
      const i = y * a.width + x;
      if (a.data[i * 4 + 3] < 255 || a.data[(i + 1) * 4 + 3] < 255 || a.data[(i + a.width) * 4 + 3] < 255) continue;
      inner++;
      worst = Math.max(worst, n(i).angleTo(n(i + 1)), n(i).angleTo(n(i + a.width)));
    }
    expect(inner).toBeGreaterThan(10000);
    expect((worst * 180) / Math.PI).toBeLessThan(12);
  });

  it('montanhas: normal suave e contorno com ≥ 300 pontos por volta', () => {
    const c = new THREE.Color('#5a7a6a'); const f = new THREE.Color('#c0d0e0');
    const g = buildRing('alpine', 1, 660, 150, c, f, 0.3, new THREE.Color('#ffffff'));
    expect(smoothFraction(g)).toBeGreaterThan(0.5);
    expect(g.getAttribute('position').count / 12).toBeGreaterThanOrEqual(300);
  });

  // Na captura das Rochosas, com a normal suave, os picos em agulha (1 − |ruído| e 64–256 ondulações por volta) viraram
  // colunas claras. Montanha larga e de crista redonda: a maior dobra do contorno, em metros reais, fica abaixo de 60°
  // (era 116–154° no alpino, 63–102° no tropical, litoral e savana). O deserto fica de fora: a mesa tem parede reta.
  it('cristas arredondadas: nenhuma dobra do contorno passa de 60° (alpino, tropical, litoral, savana)', () => {
    const LAYERS = { alpine: [70, 150, 265], tropical: [62, 120, 205], coast: [34, 70, 110], savanna: [26, 52, 80] } as const;
    const RADII = [470, 660, 920];
    for (const [biome, heights] of Object.entries(LAYERS)) heights.forEach((H, layer) => {
      const N = 300; const R = RADII[layer];
      const pts = Array.from({ length: N + 2 }, (_, i) => [(i / N) * 2 * Math.PI * R, H * ringProfile(biome as keyof typeof LAYERS, layer, (i % N) / N)]);
      let worst = 0;
      for (let i = 1; i <= N; i++) {
        const a = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
        const b = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
        worst = Math.max(worst, (Math.abs(a - b) * 180) / Math.PI);
      }
      expect(worst, `${biome} camada ${layer}`).toBeLessThan(60);
    });
  });
});
