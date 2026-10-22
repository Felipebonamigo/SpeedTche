// V22/F1: o ensaio de ESTABILIDADE do detalhe do chão, exato. Um chão plano de verdade (a mesma malha de duas faixas, um quadrado por lado) com o material do detalhe
// (`installTerrainDetail`: o shader que o jogo usa), luz ambiente e uma direcional (sem névoa, sem sombra, sem pós: nada depende da câmera além do próprio detalhe), `aDet` =
// (lateral, distância ao longo) como o `Strip` do terreno escreve. Duas posições da câmera, 4 m uma da outra ao longo da pista; centenas de pontos do chão projetados nas duas
// imagens: o mesmo ponto tem de ter a mesma luma (a diferença média em 0..255 é a medida). `nadar: true` escreve `aDet` relativo à câmera — o defeito que o teste existe para pegar.
import * as THREE from 'three';
import { applyBiomeDetail, detailMap, detailTiling, installTerrainDetail } from '../src/render/terrain-detail';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const W = 640; const H = 360;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setSize(W, H, false);
renderer.setPixelRatio(1);

function montar(zCam: number, nadar: boolean): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#223344');
  scene.add(new THREE.AmbientLight('#ffffff', 1.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.5); sun.position.set(-30, 60, 20); scene.add(sun);
  // O chão: x de −60 a 60, z de −260 a 20; a lateral é o x e a distância ao longo é −z (+ 1000: o "ao longo" é absoluto). Nadar: o `along` conta a partir da câmera.
  const x0 = -60; const x1 = 60; const z0 = -260; const z1 = 20;
  const pos = new Float32Array([x0, 0, z0, x1, 0, z0, x0, 0, z1, x1, 0, z1]);
  const along = (z: number): number => (nadar ? -(z - zCam) : -z + 1000);
  const det = new Float32Array([x0, along(z0), x1, along(z0), x0, along(z1), x1, along(z1)]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.12, 0.45, 0.1, 0.12, 0.45, 0.1, 0.12, 0.45, 0.1, 0.12, 0.45, 0.1]), 3));
  g.setAttribute('aDet', new THREE.BufferAttribute(det, 2));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const u = installTerrainDetail(m);
  applyBiomeDetail(u, 'tropical');
  u.A.value.x = detailTiling(6000).invPeriod;
  scene.add(new THREE.Mesh(g, m));
  const camera = new THREE.PerspectiveCamera(54, W / H, 0.1, 2000);
  camera.position.set(0, 3.6, zCam);
  camera.lookAt(0, 3.6 - 20 * Math.tan((6 * Math.PI) / 180), zCam - 20);
  camera.updateMatrixWorld();
  return { scene, camera };
}

/** Desenha e devolve a luma (0..255) de cada ponto de `pontos` (mundo) projetado na imagem. */
function ler(zCam: number, nadar: boolean, pontos: Array<[number, number]>): Array<number | null> {
  const { scene, camera } = montar(zCam, nadar);
  renderer.render(scene, camera);
  const ctx = renderer.getContext();
  const buf = new Uint8Array(W * H * 4);
  ctx.readPixels(0, 0, W, H, ctx.RGBA, ctx.UNSIGNED_BYTE, buf);
  const luma = (px: number, py: number): number => {
    const i = ((H - 1 - py) * W + px) * 4;
    return 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
  };
  return pontos.map(([x, z]) => {
    const v = new THREE.Vector3(x, 0, z).project(camera);
    const fx = ((v.x + 1) / 2) * W - 0.5; const fy = ((1 - v.y) / 2) * H - 0.5;
    const x0 = Math.floor(fx); const y0 = Math.floor(fy);
    if (x0 < 2 || x0 >= W - 3 || y0 < 2 || y0 >= H - 3) return null;
    const tx = fx - x0; const ty = fy - y0; // bilinear: a posição do ponto na imagem tem fração de pixel; arredondar a ela viraria ruído de medida
    return luma(x0, y0) * (1 - tx) * (1 - ty) + luma(x0 + 1, y0) * tx * (1 - ty) + luma(x0, y0 + 1) * (1 - tx) * ty + luma(x0 + 1, y0 + 1) * tx * ty;
  });
}

/** Pontos do chão visíveis nas duas posições: x de −22 a 22 m, z de −14 a −36 m (a câmera A em z = 0 os vê a 14–36 m; a B, 4 m adiante, a 10–32 m). */
function pontosDoChao(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 0; k < 900; k++) { // uma grade jittered determinística: sem Math.random
    const a = ((k * 37) % 30) / 30; const b = ((k * 61) % 30) / 30;
    out.push([-22 + 44 * a, -14 - 22 * b]);
  }
  return out;
}

function comparar(opts: { passo: number; nadar: boolean }): { n: number; mediaAbs: number; desvioDoCampo: number } {
  const pts = pontosDoChao();
  const A = ler(0, false, pts);
  const B = ler(-opts.passo, opts.nadar, pts);
  let soma = 0; let n = 0; let ma = 0; let aa = 0;
  const campo: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = A[i]; const b = B[i];
    if (a === null || b === null) continue;
    soma += Math.abs(a - b); n++; campo.push(a); ma += a;
  }
  ma /= Math.max(1, n);
  for (const v of campo) aa += (v - ma) * (v - ma);
  return { n, mediaAbs: soma / Math.max(1, n), desvioDoCampo: Math.sqrt(aa / Math.max(1, n)) };
}

/**
 * Cintilação: a câmera anda `passo` m por quadro (3 quadros); no MESMO ponto do chão a luma muda de forma suave se o detalhe é bem filtrado (mip + anisotropia) e "pula" se for aliasing.
 * Devolve a média da diferença segunda |A − 2B + C| (0..255) sobre a da primeira |A − B|: perto de 0 = movimento suave; ≥ 1 = a mudança entre quadros é ruído, não movimento.
 */
function cintilacao(passo: number, semMip = false): { n: number; primeira: number; segunda: number; indice: number } {
  const pts = pontosDoChao();
  // O controle negativo: sem mipmap o ladrilho de ruído é amostrado cru (aliasing de verdade).
  const tex = detailMap(); const filtro = tex.minFilter;
  tex.minFilter = semMip ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter; tex.needsUpdate = true;
  const A = ler(0, false, pts); const B = ler(-passo, false, pts); const C = ler(-2 * passo, false, pts);
  let p1 = 0; let p2 = 0; let n = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = A[i]; const b = B[i]; const c = C[i];
    if (a === null || b === null || c === null) continue;
    p1 += Math.abs(a - b); p2 += Math.abs(a - 2 * b + c); n++;
  }
  tex.minFilter = filtro; tex.needsUpdate = true;
  return { n, primeira: p1 / Math.max(1, n), segunda: p2 / Math.max(1, n), indice: p2 / Math.max(1e-6, p1) };
}

const gl = renderer.getContext();
const shaderErrors: string[] = [];
renderer.debug.onShaderError = (ctx, program, vs, fs) => { shaderErrors.push(`${ctx.getShaderInfoLog(vs) ?? ''} | ${ctx.getShaderInfoLog(fs) ?? ''} | ${ctx.getProgramInfoLog(program) ?? ''}`.slice(0, 600)); };
(window as unknown as { chao: unknown }).chao = { comparar, cintilacao, shaderErrors: () => shaderErrors, glVersion: () => gl.getParameter(gl.VERSION) };
(window as unknown as { chaoReady: boolean }).chaoReady = true;
