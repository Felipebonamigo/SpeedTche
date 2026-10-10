// L3: no Electron o .glb do carro chega por arquivo, pelo protocolo próprio `speedtche-asset://` (desktop/assets.cjs), no lugar
// da data URL embutida no JS. O lado Node (o que o main serve e recusa) e o lado da página (assetUrl/readAsset) são testados
// aqui; o Electron de verdade abre o `dist/` num teste manual (docs/ondas/L/L3.md, passo 5).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASSET_SCHEME, assetUrl, readAsset } from '../src/render/cars/assets';

const DESKTOP = join(__dirname, '..', 'desktop');
const assets = createRequire(import.meta.url)('../desktop/assets.cjs') as {
  SCHEME: string;
  privilegedScheme: { scheme: string; privileges: Record<string, boolean> };
  resolveAssetPath(root: string, url: string): string | null;
  serveAsset(root: string, url: string): Promise<Response>;
};

describe('protocolo speedtche-asset (desktop/assets.cjs)', () => {
  let root = '';
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'l3-assets-'));
    mkdirSync(join(root, 'assets'), { recursive: true });
    writeFileSync(join(root, 'assets', 'falcao-ab12.glb'), Buffer.from([1, 2, 3, 4]));
    writeFileSync(join(root, 'assets', 'segredo.json'), '{}');
    writeFileSync(join(root, 'index.html'), '<html></html>');
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('o esquema é o mesmo da página e é privilegiado (standard, secure, fetch, CORS)', () => {
    expect(assets.SCHEME).toBe(ASSET_SCHEME);
    expect(assets.privilegedScheme.scheme).toBe(ASSET_SCHEME);
    for (const p of ['standard', 'secure', 'supportFetchAPI', 'corsEnabled']) expect(assets.privilegedScheme.privileges[p], p).toBe(true);
  });

  it('resolveAssetPath aceita só assets/*.glb dentro da raiz do jogo', () => {
    expect(assets.resolveAssetPath(root, 'speedtche-asset://app/assets/falcao-ab12.glb')).toBe(join(root, 'assets', 'falcao-ab12.glb'));
    expect(assets.resolveAssetPath(root, 'speedtche-asset://app/assets/FALCAO.GLB')).toBe(join(root, 'assets', 'FALCAO.GLB'));
    for (const bad of [
      'speedtche-asset://app/assets/../index.html',
      'speedtche-asset://app/assets/%2e%2e/index.html',
      'speedtche-asset://app/assets/..%2findex.html',
      'speedtche-asset://app/assets/a%5c..%5cb.glb',
      'speedtche-asset://app/index.html',
      'speedtche-asset://app/assets/segredo.json',
      'speedtche-asset://app/assets/',
      'speedtche-asset://app/etc/passwd.glb',
      'speedtche-asset://outro/assets/falcao-ab12.glb',
      'https://app/assets/falcao-ab12.glb',
      'file:///etc/passwd',
      'isto não é uma URL',
    ]) expect(assets.resolveAssetPath(root, bad), bad).toBeNull();
  });

  it('serveAsset: 200 com o tipo do glTF e CORS aberto (a página é file://, origem opaca); ausente é 404; recusado é 404', async () => {
    const ok = await assets.serveAsset(root, 'speedtche-asset://app/assets/falcao-ab12.glb');
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('model/gltf-binary');
    expect(ok.headers.get('access-control-allow-origin')).toBe('*');
    expect([...new Uint8Array(await ok.arrayBuffer())]).toEqual([1, 2, 3, 4]);
    expect((await assets.serveAsset(root, 'speedtche-asset://app/assets/nao-existe.glb')).status).toBe(404);
    expect((await assets.serveAsset(root, 'speedtche-asset://app/assets/../index.html')).status).toBe(404);
  });

  it('main.cjs registra o esquema ANTES do ready e serve a pasta do jogo; assets.cjs entra no pacote', () => {
    const main = readFileSync(join(DESKTOP, 'main.cjs'), 'utf8');
    expect(main).toMatch(/registerSchemesAsPrivileged\(\[assets\.privilegedScheme\]\)[\s\S]*app\.whenReady\(/);
    expect(main).toMatch(/protocol\.handle\(assets\.SCHEME, \(req\) => assets\.serveAsset\(GAME_ROOT, req\.url\)\)/);
    expect(main).toMatch(/GAME_ROOT = path\.join\(__dirname, app\.isPackaged \? 'app' : '\.\.\/dist'\)/);
    const pkg = JSON.parse(readFileSync(join(DESKTOP, 'package.json'), 'utf8')) as { build: { files: unknown[] } };
    expect(pkg.build.files).toContain('assets.cjs');
  });
});

describe('página: assetUrl e readAsset (src/render/cars/assets.ts)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('página file:// manda o arquivo de dentro de app/ pelo protocolo; http: e data: ficam como estão', () => {
    expect(assetUrl('file:///opt/SpeedTche/resources/app.asar/app/assets/falcao-ab12.glb', 'file:///opt/SpeedTche/resources/app.asar/app/index.html'))
      .toBe('speedtche-asset://app/assets/falcao-ab12.glb');
    expect(assetUrl('file:///C:/Jogos/SpeedTche/resources/app.asar/app/assets/falcao.glb', 'file:///C:/Jogos/SpeedTche/resources/app.asar/app/index.html'))
      .toBe('speedtche-asset://app/assets/falcao.glb');
    expect(assetUrl('http://localhost:4174/assets/falcao.glb', 'http://localhost:4174/index.html')).toBe('http://localhost:4174/assets/falcao.glb');
    expect(assetUrl('data:model/gltf-binary;base64,AQID', 'file:///x/app/index.html')).toBe('data:model/gltf-binary;base64,AQID');
    expect(assetUrl('file:///outro/lugar/x.glb', 'file:///x/app/index.html')).toBe('file:///outro/lugar/x.glb'); // fora de app/: não é nosso
    expect(assetUrl('/src/assets/cars/falcao.glb', null)).toBe('/src/assets/cars/falcao.glb');
  });

  it('readAsset: data URL decodifica sem rede; outra URL vai por fetch (pelo protocolo no Electron); resposta ruim é erro', async () => {
    expect([...new Uint8Array(await readAsset('data:application/octet-stream;base64,AQID'))]).toEqual([1, 2, 3]);
    const fetched: string[] = [];
    vi.stubGlobal('location', { href: 'file:///x/app/index.html' });
    vi.stubGlobal('fetch', async (url: string) => { fetched.push(url); return url.includes('falta') ? { ok: false, status: 404 } : { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([9, 8]).buffer }; });
    expect([...new Uint8Array(await readAsset('file:///x/app/assets/a.glb'))]).toEqual([9, 8]);
    expect(fetched).toEqual(['speedtche-asset://app/assets/a.glb']);
    await expect(readAsset('file:///x/app/assets/falta.glb')).rejects.toThrow(/404/);
  });
});
