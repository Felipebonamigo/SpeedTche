// Canvas 2D falso para os testes de render em Node: todo método é um no-op, `getImageData` devolve pixels zerados e os
// gradientes aceitam `addColorStop`. É o mesmo que os outros testes de render montam à mão (paint.test.ts, render-normals.test.ts).
/** Instala `document.createElement` falso e devolve a função que restaura o `document` de antes. */
export function fakeCanvasDocument(): () => void {
  const g = globalThis as { document?: unknown };
  const had = g.document;
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createImageData' || key === 'getImageData') return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      if (key === 'measureText') return () => ({ width: 10 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  g.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) };
  return () => { g.document = had; };
}
