// Compara duas galerias geradas por `gerar.mjs` (V7): pares lado a lado (antes | depois) por cena, a cena que mudou com moldura vermelha
// (fração de pixels trocados acima do limiar) e as contagens do `debugInfo()` que subiram (chamadas, triângulos) com ▲.
//
//   node tools/galeria/comparar.mjs <rótulo-antes> <rótulo-depois> [--limiar 0.001] [--saida scratch/galeria]
//
// Lê <saida>/<rótulo>/manifest.json dos dois lados; grava <saida>/comparar-<antes>-vs-<depois>.png (+ .html e .json com os números).
// Só usa o Chromium para decodificar e montar (sem WebGL): leva segundos. Sai com 0 sempre que montou a comparação (mudar não é erro).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { CENAS, contagensQueSubiram, diferencaDePixels, htmlDaComparacao, LIMIAR_PADRAO, mudou, rotuloSeguro, TOLERANCIA_PADRAO } from './nucleo.ts';

const USO = 'uso: node tools/galeria/comparar.mjs <rótulo-antes> <rótulo-depois> [--limiar 0.001] [--saida scratch/galeria]';
const pos = []; const opt = { limiar: String(LIMIAR_PADRAO), saida: 'scratch/galeria' };
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (k === '-h' || k === '--help') { console.log(USO); process.exit(0); }
  if (k === '--limiar' || k === '--saida') { opt[k.slice(2)] = process.argv[++i]; continue; }
  pos.push(k);
}
if (pos.length !== 2) { console.error(USO); process.exit(2); }
const [ra, rb] = pos.map(rotuloSeguro);
const saida = resolve(opt.saida);
const limiar = Number(opt.limiar);
const ler = (r) => {
  const f = join(saida, r, 'manifest.json');
  if (!existsSync(f)) { console.error(`falta ${f} (rode antes: node tools/galeria/gerar.mjs --raiz <worktree> --rotulo ${r})`); process.exit(2); }
  return JSON.parse(readFileSync(f, 'utf8'));
};
const ma = ler(ra); const mb = ler(rb);

/** A cena no manifest, ou um lugar vazio (a galeria é de uma lista de cenas mais velha). */
const cenaDe = (m, c) => m.cenas.find((x) => x.id === c.id)
  ?? { id: c.id, titulo: c.titulo, detalhe: c.detalhe, arquivo: null, origem: '', chamadas: null, triangulos: null, msQuadro: null, captura: 'falhou', tentativas: 0, segundos: 0, erros: [], alertas: [] };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1660, height: 1000 } });
page.setDefaultTimeout(300000);
const linhas = [];
for (const c of CENAS) {
  const antes = cenaDe(ma, c); const depois = cenaDe(mb, c);
  const fa = antes.arquivo && join(saida, ra, antes.arquivo); const fb = depois.arquivo && join(saida, rb, depois.arquivo);
  let diferenca = null;
  if (fa && fb && existsSync(fa) && existsSync(fb)) {
    diferenca = await page.evaluate(async ({ a, b, fn, tol }) => {
      const pixels = async (b64) => {
        const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, cv.width, cv.height).data;
      };
      return new Function(`return (${fn})`)()(await pixels(a), await pixels(b), tol);
    }, { a: readFileSync(fa).toString('base64'), b: readFileSync(fb).toString('base64'), fn: diferencaDePixels.toString(), tol: TOLERANCIA_PADRAO });
  }
  linhas.push({ antes, depois, diferenca, mudou: diferenca !== null && mudou(diferenca, limiar), subiram: contagensQueSubiram(antes, depois) });
}

const nome = `comparar-${ra}-vs-${rb}`;
writeFileSync(join(saida, `${nome}.html`), htmlDaComparacao(ma, mb, linhas, `${ra}/`, `${rb}/`, limiar));
await page.goto(pathToFileURL(join(saida, `${nome}.html`)).href, { waitUntil: 'load' });
await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => undefined))));
await page.screenshot({ path: join(saida, `${nome}.png`), fullPage: true });
await browser.close();
writeFileSync(join(saida, `${nome}.json`), `${JSON.stringify({ antes: { rotulo: ma.rotulo, commit: ma.commit, data: ma.data }, depois: { rotulo: mb.rotulo, commit: mb.commit, data: mb.data }, limiar, tolerancia: TOLERANCIA_PADRAO,
  cenas: linhas.map((l) => ({ id: l.depois.id, mudou: l.mudou, fracao: l.diferenca?.fracao ?? null, trocados: l.diferenca?.trocados ?? null, subiram: l.subiram,
    antes: { chamadas: l.antes.chamadas, triangulos: l.antes.triangulos, msQuadro: l.antes.msQuadro }, depois: { chamadas: l.depois.chamadas, triangulos: l.depois.triangulos, msQuadro: l.depois.msQuadro } })) }, null, 2)}\n`);

for (const l of linhas) {
  const estado = !l.diferenca ? 'sem imagem' : l.mudou ? `MUDOU ${(l.diferenca.fracao * 100).toFixed(2)}%` : `igual (${l.diferenca.trocados} px)`;
  console.log(`${l.depois.id.padEnd(24)} ${estado.padEnd(18)}${l.subiram.length ? ` ▲ ${l.subiram.map((k) => `${k} ${l.antes[k]} → ${l.depois[k]}`).join(', ')}` : ''}`);
}
const n = linhas.filter((l) => l.mudou).length; const semImagem = linhas.filter((l) => !l.diferenca).length;
console.log(`ok ${join(saida, `${nome}.png`)} · ${n} de ${linhas.length} cenas mudaram${semImagem ? ` · ${semImagem} sem imagem num dos lados` : ''} · contagens que subiram em ${linhas.filter((l) => l.subiram.length).length}`);
