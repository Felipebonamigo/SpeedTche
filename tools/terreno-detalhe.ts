// V22/F1: o ensaio de ESTABILIDADE do detalhe do chão, exato. Um chão plano de verdade (a mesma malha de duas faixas, um quadrado por lado) com o material do detalhe
// (`installTerrainDetail`: o shader que o jogo usa), luz ambiente e uma direcional (sem névoa, sem sombra, sem pós: nada depende da câmera além do próprio detalhe), `aDet` =
// (lateral, distância ao longo) como o `Strip` do terreno escreve. Duas posições da câmera, 4 m uma da outra ao longo da pista; centenas de pontos do chão projetados nas duas
// imagens: o mesmo ponto tem de ter a mesma luma (a diferença média em 0..255 é a medida). `nadar: true` escreve `aDet` relativo à câmera — o defeito que o teste existe para pegar.
import * as THREE from 'three';
import { applyBiomeDetail, detailTiling, installTerrainDetail } from '../src/render/terrain-detail';

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
  return pontos.map(([x, z]) => {
    const v = new THREE.Vector3(x, 0, z).project(camera);
    const px = Math.round(((v.x + 1) / 2) * W - 0.5); const py = Math.round(((1 - v.y) / 2) * H - 0.5);
    if (px < 2 || px >= W - 2 || py < 2 || py >= H - 2) return null;
    const i = ((H - 1 - py) * W + px) * 4;
    return 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
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

const gl = renderer.getContext();
const shaderErrors: string[] = [];
renderer.debug.onShaderError = (ctx, program, vs, fs) => { shaderErrors.push(`${ctx.getShaderInfoLog(vs) ?? ''} | ${ctx.getShaderInfoLog(fs) ?? ''} | ${ctx.getProgramInfoLog(program) ?? ''}`.slice(0, 600)); };
(window as unknown as { chao: unknown }).chao = { comparar, shaderErrors: () => shaderErrors, glVersion: () => gl.getParameter(gl.VERSION) };
(window as unknown as { chaoReady: boolean }).chaoReady = true;
