// Qualidade gráfica escolhida sozinha na 1ª abertura (onda L, L2b). Sem GPU real não há FPS a medir: usa o que o navegador entrega de graça
// (núcleos, memória, tamanho da tela, nome do GPU) mais a mediana de ~20 intervalos de quadro (que só denuncia máquina muito lenta: a 60 Hz
// o intervalo é o do monitor). Só roda quando NÃO existe nada salvo, grava `quality` + `autoQuality` e nunca escolhe Ultra. Opções sobrescreve.
// Puro de propósito (a coleta do navegador está no fim, protegida): `pickAutoQuality` e `shouldAutoQuality` são o que os testes travam.
import type { Quality } from './contracts';

export interface AutoProbe {
  cores: number;
  /** `navigator.deviceMemory` (GB, arredondado pelo navegador); nulo onde não existe (Firefox, Safari, Electron antigo). */
  memoryGb: number | null;
  /** Pixels da tela física (largura × altura em px CSS); o `dpr` entra na conta do preenchimento. */
  screenPx: number;
  dpr: number;
  /** Mediana dos intervalos de quadro (ms); nulo se a medição não rodou. */
  frameMs: number | null;
  /** Nome do GPU (WEBGL_debug_renderer_info); nulo se o navegador esconde. */
  gpu: string | null;
  /** Electron/Steam Deck: o padrão é Média. */
  desktop: boolean;
}

const SOFTWARE_GPU = /swiftshader|llvmpipe|software|softpipe|basic render/i;

export function pickAutoQuality(p: AutoProbe): Quality {
  if (p.gpu && SOFTWARE_GPU.test(p.gpu)) return 'low';
  if (p.frameMs !== null && p.frameMs > 40) return 'low';
  const pixels = p.screenPx * p.dpr * p.dpr;
  const weak = p.cores <= 4 || (p.memoryGb !== null && p.memoryGb <= 4);
  if (weak && pixels > 5_000_000) return 'low'; // pouca máquina empurrando muitos pixels (4K)
  if (p.desktop) return 'medium';
  if (weak || (p.frameMs !== null && p.frameMs > 22)) return 'medium';
  return 'high';
}

/** Só na primeira abertura de verdade: nada salvo, e não sob automação nem com `?autoq=0`. Quem já tem settings (com ou sem o campo) nunca é surpreendido. */
export function shouldAutoQuality(saved: unknown, env: { webdriver: boolean; search: string }): boolean {
  if (env.webdriver || /[?&]autoq=0(?:&|$)/.test(env.search)) return false;
  return saved === null || saved === undefined;
}

/** O objeto de settings a gravar na 1ª abertura (os demais campos vêm dos padrões no saneamento). */
export function applyAutoQuality(saved: unknown, quality: Quality): Record<string, unknown> {
  const base = typeof saved === 'object' && saved !== null && !Array.isArray(saved) ? saved as Record<string, unknown> : {};
  return { ...base, quality, autoQuality: quality };
}

/** Lê o que o navegador sabe (e mede ~20 quadros, uns 350 ms): só no boot, antes de a sessão ler as opções. Nunca lança. */
export async function collectProbe(desktop: boolean): Promise<AutoProbe> {
  const nav = typeof navigator === 'undefined' ? null : navigator as Navigator & { deviceMemory?: number };
  const w = typeof window === 'undefined' ? null : window;
  let gpu: string | null = null;
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    if (gl && ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  } catch { /* sem WebGL: o renderizador mostra o erro de verdade depois */ }
  let frameMs: number | null = null;
  try { frameMs = await medianFrameMs(20); } catch { /* sem rAF */ }
  return {
    cores: nav?.hardwareConcurrency ?? 4,
    memoryGb: typeof nav?.deviceMemory === 'number' ? nav.deviceMemory : null,
    screenPx: (w?.screen?.width ?? 1280) * (w?.screen?.height ?? 720),
    dpr: w?.devicePixelRatio ?? 1,
    frameMs, gpu, desktop,
  };
}

function medianFrameMs(n: number): Promise<number | null> {
  if (typeof requestAnimationFrame === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const gaps: number[] = [];
    let last = -1;
    const deadline = performance.now() + 1500; // aba em segundo plano não congela o boot
    const step = (now: number): void => {
      if (last >= 0) gaps.push(now - last);
      last = now;
      if (gaps.length >= n || performance.now() > deadline) {
        const s = gaps.slice(2).sort((a, b) => a - b); // os dois primeiros intervalos são de aquecimento
        resolve(s.length >= 5 ? s[s.length >> 1] : null);
      } else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
