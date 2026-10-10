// Protocolo próprio `speedtche-asset://app/<caminho dentro do jogo>` do Electron: serve os .glb do build (carros da arte,
// src/assets/cars/) como ARQUIVO, no lugar da data URL embutida no JS. O jogo abre por `file://`, onde o `fetch` de `file:` não
// funciona; o esquema privilegiado (standard, secure, supportFetchAPI, corsEnabled) deixa a página buscar o arquivo.
// Só `assets/*.glb` sob a raiz do jogo (`dist/` em desenvolvimento, `app/` no pacote): o resto é 404 — nunca um caminho que a
// página escolheu fora dali. Puro (sem `electron`): o main.cjs registra e os testes (tests/desktop-assets.test.ts) o carregam como módulo.
const fs = require('node:fs/promises');
const path = require('node:path');

/** O mesmo texto de ASSET_SCHEME em src/render/cars/assets.ts (um teste confere). */
const SCHEME = 'speedtche-asset';
const privilegedScheme = { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } };

/** Caminho absoluto do arquivo pedido, ou null se não for um `assets/*.glb` dentro de `root`. */
function resolveAssetPath(root, requestUrl) {
  let url;
  try { url = new URL(requestUrl); } catch { return null; }
  if (url.protocol !== `${SCHEME}:` || url.hostname !== 'app') return null;
  let decoded;
  try { decoded = decodeURIComponent(url.pathname); } catch { return null; }
  if (decoded.includes('\\') || decoded.includes('\0')) return null;
  const parts = decoded.split('/').filter((p, i) => !(i === 0 && p === ''));
  if (parts.length < 2 || parts[0] !== 'assets') return null;
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return null;
  if (!/\.glb$/i.test(parts[parts.length - 1])) return null;
  const file = path.join(root, ...parts);
  const rel = path.relative(root, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return file;
}

/** A resposta do protocolo: o arquivo (200, tipo glTF binário, CORS aberto porque a página é `file://`) ou 404. */
async function serveAsset(root, requestUrl) {
  const file = resolveAssetPath(root, requestUrl);
  if (!file) return new Response('não encontrado', { status: 404 });
  try {
    const data = await fs.readFile(file);
    return new Response(data, { status: 200, headers: { 'content-type': 'model/gltf-binary', 'access-control-allow-origin': '*' } });
  } catch {
    return new Response('não encontrado', { status: 404 });
  }
}

module.exports = { SCHEME, privilegedScheme, resolveAssetPath, serveAsset };
