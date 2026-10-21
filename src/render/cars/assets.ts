// Os carros da arte no jogo: cada `src/assets/cars/<nome>.glb` substitui um modelo procedural. O nome é o **id de um carro**
// (`falcao.glb`: o modelo é só daquele carro — os outros GT seguem procedurais) ou um **estilo** de carroceria (`gt.glb`: vale para o
// estilo todo, como no passo 2.4). Carrega antes de o renderizador nascer (main.ts e o harness); arquivo recusado pelo validador
// (docs/CONTRATO-DO-ASSET.md) fica de fora com o motivo e o modelo segue procedural. Sem arquivo nenhum, nada muda.
import { CAR_BODIES, CARS } from '../../core/data/cars';
import type { CarBody } from '../../core/types';
import { parseCarGlb, parseHeroGlb } from './gltf';
import { buildModel, modelSource, setHeroOverride, setModelOverride } from './models';

/** Esquema do protocolo próprio do Electron (desktop/assets.cjs, o mesmo texto): a página é `file://` e o `fetch` de `file:` não funciona. */
export const ASSET_SCHEME = 'speedtche-asset';

// O .glb é um ARQUIVO do build (`?no-inline`: o Vite o copia para `dist/assets/` com hash e entrega a URL). No navegador, `fetch`;
// no Electron, `fetch` pelo protocolo próprio (assetUrl). A data URL de antes (embutida no JS) acabou: dobrava o tamanho do pacote
// e o JS carregava os modelos inteiros para decodificar base64.
const URLS = import.meta.glob<string>('../../assets/cars/*.glb', { query: '?no-inline', import: 'default', eager: true });
const FILES: Record<string, () => Promise<string>> = Object.fromEntries(Object.entries(URLS).map(([path, url]) => [path, async () => url]));

/** Os cascos HERÓI (V9): `src/assets/cars/hero/<estilo ou carro>.glb`, na pasta própria para não se confundirem com o modelo do carro. */
const HERO_URLS = import.meta.glob<string>('../../assets/cars/hero/*.glb', { query: '?no-inline', import: 'default', eager: true });
const HERO_FILES: Record<string, () => Promise<string>> = Object.fromEntries(Object.entries(HERO_URLS).map(([path, url]) => [path, async () => url]));

export interface CarAssetReport {
  /** Chaves aceitas: ids de carro (`falcao`) e estilos (`gt`). */
  loaded: string[];
  /** Os modelos que ganharam o casco herói (V9). */
  heroes: string[];
  rejected: { file: string; problems: string[] }[];
  warnings: string[];
}

let last: CarAssetReport = { loaded: [], heroes: [], rejected: [], warnings: [] };

/** O resultado do último carregamento (para o harness e os playtests). */
export function lastCarAssetReport(): CarAssetReport { return last; }

export function dataUrlToArrayBuffer(url: string): ArrayBuffer {
  const comma = url.indexOf(',');
  const bin = atob(url.slice(comma + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/**
 * Onde buscar o arquivo. Página `file://` (Electron): o caminho dentro de `app/` vai pelo protocolo `speedtche-asset://app/…`
 * (desktop/assets.cjs); em `http:` (navegador, Vite) e em `data:` a URL fica como está.
 */
export function assetUrl(url: string, page: string | null = typeof location === 'undefined' ? null : location.href): string {
  if (!page || !page.startsWith('file:')) return url;
  const base = new URL('./', page).href;
  return url.startsWith(base) ? `${ASSET_SCHEME}://app/${url.slice(base.length)}` : url;
}

/** Lê o arquivo: data URL decodifica na hora; o resto vem por `fetch` (pelo protocolo, no Electron). */
export async function readAsset(url: string): Promise<ArrayBuffer> {
  if (url.startsWith('data:')) return dataUrlToArrayBuffer(url);
  const res = await fetch(assetUrl(url));
  if (!res.ok) throw new Error(`${res.status} ao buscar ${url}`);
  return res.arrayBuffer();
}

/**
 * Carrega os arquivos e registra os aceitos. `files` = caminho → função que devolve a URL (ou data URL) do .glb.
 * Os cascos herói NÃO entram por padrão (V16): ~1 MB cada, 7 deles, lidos e parseados na abertura custavam ~0,6–1 s mesmo com "Carros em HD" desligado.
 * Quem precisa deles chama `ensureHeroes()` (a sessão e o palco, quando `heroEnabled` é verdadeiro; as ferramentas de medição, explicitamente).
 */
export async function loadCarAssets(files: Record<string, () => Promise<string>> = FILES, heroFiles: Record<string, () => Promise<string>> = {}): Promise<CarAssetReport> {
  const report: CarAssetReport = { loaded: [], heroes: [], rejected: [], warnings: [] };
  for (const [path, load] of Object.entries(files)) {
    const file = path.slice(path.lastIndexOf('/') + 1);
    const name = file.replace(/\.glb$/i, '');
    const car = CARS.find((c) => c.id === name);
    const body = (car ? car.body : name) as CarBody;
    if (!car && !CAR_BODIES.includes(body)) {
      report.rejected.push({ file, problems: [`"${name}" não é um carro nem um estilo (carros: ${CARS.map((c) => c.id).join(', ')}; estilos: ${CAR_BODIES.join(', ')})`] });
      continue;
    }
    try {
      const { model, problems, warnings } = await parseCarGlb(body, await readAsset(await load()), car ? { carId: car.id } : {});
      report.warnings.push(...warnings.map((w) => `${file}: ${w}`));
      if (model && problems.length === 0) { setModelOverride(car ? car.id : body, model); report.loaded.push(car ? car.id : body); } else report.rejected.push({ file, problems });
    } catch (e) {
      report.rejected.push({ file, problems: [`não carregou: ${e instanceof Error ? e.message : String(e)}`] });
    }
  }
  await loadHeroFiles(heroFiles, report);
  last = report;
  return report;
}

/** Lê, parseia e registra os cascos herói de `heroFiles`, somando o resultado a `report` (V9). Arquivo recusado fica de fora com o motivo e o modelo segue sem herói. */
async function loadHeroFiles(heroFiles: Record<string, () => Promise<string>>, report: CarAssetReport): Promise<void> {
  for (const [path, load] of Object.entries(heroFiles)) {
    const file = `hero/${path.slice(path.lastIndexOf('/') + 1)}`;
    const name = file.slice(5).replace(/\.glb$/i, '');
    const car = CARS.find((c) => c.id === name);
    const body = (car ? car.body : name) as CarBody;
    if (!car && !CAR_BODIES.includes(body)) {
      report.rejected.push({ file, problems: [`"${name}" não é um carro nem um estilo (o herói tem o nome do modelo que ele atende)`] });
      continue;
    }
    // Herói de um CARRO (V17): vale sobre o .glb do próprio carro (a base da conferência de eixos, escapes e pegada); sem ele carregado, o herói não tem sobre o que ficar.
    if (car && modelSource(name) !== 'glb') {
      report.rejected.push({ file, problems: [`o herói do ${car.name} só vale sobre o .glb do próprio carro (cars/${name}.glb), que não foi carregado`] });
      continue;
    }
    try {
      const { model, problems, warnings } = await parseHeroGlb(body, await readAsset(await load()), car ? { base: buildModel(name), carId: car.id } : {});
      report.warnings.push(...warnings.map((w) => `${file}: ${w}`));
      if (model && problems.length === 0) { setHeroOverride(name, { shell: model.shell, triangles: model.triangles }); report.heroes.push(name); } else report.rejected.push({ file, problems });
    } catch (e) {
      report.rejected.push({ file, problems: [`não carregou: ${e instanceof Error ? e.message : String(e)}`] });
    }
  }
}

// Uma promessa por conjunto de arquivos (a identidade do objeto): chamadas repetidas e concorrentes dividem a mesma, e cada arquivo é lido uma vez só.
// atalho: arquivo que falhou NÃO é tentado de novo na sessão (a falha fica no relatório); reabrir o jogo tenta outra vez.
const heroLoads = new WeakMap<object, Promise<CarAssetReport>>();

/**
 * Carrega os cascos herói sob demanda (V16) e os registra em `models.ts`; o `Cars` já criado os adota no quadro seguinte (`Cars.adoptHeroes`).
 * Idempotente: a primeira chamada começa a leitura, as outras recebem a mesma promessa. Nunca rejeita: a falha de um arquivo fica em `rejected`, os outros entram,
 * e `lastCarAssetReport()` passa a incluir os heróis e as recusas deles. O relatório devolvido é só o dos heróis.
 */
export function ensureHeroes(heroFiles: Record<string, () => Promise<string>> = HERO_FILES): Promise<CarAssetReport> {
  let p = heroLoads.get(heroFiles);
  if (!p) {
    p = (async () => {
      const report: CarAssetReport = { loaded: [], heroes: [], rejected: [], warnings: [] };
      await loadHeroFiles(heroFiles, report);
      last = { loaded: last.loaded, heroes: [...new Set([...last.heroes, ...report.heroes])], rejected: [...last.rejected, ...report.rejected], warnings: [...last.warnings, ...report.warnings] };
      return report;
    })();
    heroLoads.set(heroFiles, p);
  }
  return p;
}
