// Imagem para o Node: o `GLTFLoader` do three só decodifica textura com `createImageBitmap` (ou DOM) e, quando falha,
// ENGOLE o erro e deixa o material sem `map`. Para validar o atlas dos carros no Node (testes e `npm run check-car`)
// basta o tamanho: este `createImageBitmap` lê só o cabeçalho do PNG e devolve `{ width, height }`, e o `self` que o
// loader pede. Só para scripts e testes (no navegador existe o de verdade).
import { pngSize } from './png';

export function installNodeImage(): void {
  const g = globalThis as { self?: unknown; createImageBitmap?: unknown };
  g.self ??= globalThis;
  g.createImageBitmap = async (blob: Blob) => {
    const size = pngSize(Buffer.from(await blob.arrayBuffer()));
    if (!size) throw new Error('imagem que não é PNG');
    return { width: size.width, height: size.height, close() { /* nada a liberar */ } };
  };
}
