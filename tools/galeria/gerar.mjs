// Galeria fixa de referência (V7, auditoria de 14/10/2026): renderiza as 13 cenas fixas de `nucleo.ts` (mesma pista, segmento, semente,
// câmera, 1280×720, qualidade Alta) de QUALQUER worktree/commit e monta a folha para o dono ver no celular.
//
//   node tools/galeria/gerar.mjs --raiz <worktree> --rotulo <nome> [--so id,id] [--porta <n>] [--tentativas 3] [--espera 900] [--saida scratch/galeria]
//
// Sobe o vite NA RAIZ dada numa porta livre (guarda o PID e o encerra no fim, por ele), abre uma página por vez no Chromium com swiftshader,
// tenta cada cena até `--tentativas` vezes (o navegador é reaberto entre tentativas) e, se o screenshot estourar o tempo, exporta o canvas
// direto (sem o HUD/menus, marcado na folha). Grava em <saida>/<rótulo>/: os PNG por cena, `manifest.json` (rótulo, commit, data, cena,
// contagens do `debugInfo()`: chamadas, triângulos, ms do quadro) e `folha.png` (+ `folha.html`). `--so` refaz só essas cenas e
// reaproveita as outras do manifest que já estiver na pasta (se for do mesmo commit). Comparar duas galerias: `comparar.mjs`.
// A raiz precisa de `node_modules` (link para o do main serve). Swiftshader carregado: ~2–4 min por cena; rode em segundo plano.
// Sai com 1 se alguma cena falhou em todas as tentativas.
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { ALTURA, CENAS, htmlDaFolha, LARGURA, LUMINANCIA_MINIMA, luminanciaMedia, montarManifest, rotuloSeguro } from './nucleo.ts';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const IGNORAR = /GL Driver|404|\[vite\]/; // o mesmo filtro de tools/render-harness.mjs, mais o aviso do vite
/**
 * Quadros dados à mão nas telas de menu: 12 de 0,2 s (o 1º é de 1/60 s) — a transição da tela e a entrada do carro no palco terminam
 * (o palco limita o passo a 0,1 s). Cada quadro desenha o 3D inteiro no swiftshader: 40 quadros de 1/60 s levavam 17 min com a máquina cheia.
 */
const QUADROS_DE_MENU = 12;
const PASSO_DE_MENU_MS = 200;

const USO = 'uso: node tools/galeria/gerar.mjs --raiz <worktree> --rotulo <nome> [--so id,id] [--porta <n>] [--tentativas 3] [--espera <s>=900] [--saida scratch/galeria]';
const opt = { raiz: process.cwd(), rotulo: null, porta: null, so: null, tentativas: 3, espera: 900, saida: 'scratch/galeria' };
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i]; const v = process.argv[i + 1];
  if (k === '-h' || k === '--help') { console.log(USO); process.exit(0); }
  if (!['--raiz', '--rotulo', '--porta', '--so', '--tentativas', '--espera', '--saida'].includes(k) || v === undefined) { console.error(`argumento inválido: ${k}\n${USO}`); process.exit(2); }
  opt[k.slice(2)] = v; i++;
}
const raiz = resolve(opt.raiz);
const ESPERA = Number(opt.espera) * 1000;
const TENTATIVAS = Math.max(1, Number(opt.tentativas));
if (!existsSync(join(raiz, 'tools/render-harness.html'))) { console.error(`${raiz} não tem tools/render-harness.html (é a raiz de um worktree do jogo?)`); process.exit(2); }

const git = (...a) => { try { return execFileSync('git', ['-C', raiz, ...a], { encoding: 'utf8' }).trim(); } catch { return ''; } };
const commit = git('rev-parse', '--short=7', 'HEAD') || 'desconhecido';
const ramo = git('rev-parse', '--abbrev-ref', 'HEAD') || '?';
const sujo = git('status', '--porcelain', '--untracked-files=no').length > 0;
const rotulo = rotuloSeguro(opt.rotulo ?? `${ramo}-${commit}`);
const dir = resolve(opt.saida, rotulo);
mkdirSync(dir, { recursive: true });
const so = opt.so ? opt.so.split(',') : null;
const desconhecidas = (so ?? []).filter((id) => !CENAS.some((c) => c.id === id));
if (desconhecidas.length) { console.error(`cena desconhecida: ${desconhecidas.join(', ')}\ncenas: ${CENAS.map((c) => c.id).join(', ')}`); process.exit(2); }

// ───────────── vite na raiz, numa porta livre; encerrado pelo PID no fim (nunca por nome) ─────────────
let vite = null;
let browser = null;
function encerrarVite() { if (vite && vite.exitCode === null) { try { process.kill(vite.pid, 'SIGTERM'); } catch { /* já saiu */ } } }
process.on('exit', encerrarVite);
for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => { encerrarVite(); process.exit(130); });

const portaLivre = () => new Promise((ok, falha) => {
  const s = createServer(); s.on('error', falha);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
});
const porta = Number(opt.porta ?? await portaLivre());
const base = `http://127.0.0.1:${porta}`;
const viteBin = [join(raiz, 'node_modules/vite/bin/vite.js'), join(REPO, 'node_modules/vite/bin/vite.js')].find((f) => existsSync(f));
const viteLog = openSync(join(dir, 'vite.log'), 'w');
vite = spawn(process.execPath, [viteBin, '--port', String(porta), '--strictPort', '--host', '127.0.0.1'], { cwd: raiz, stdio: ['ignore', viteLog, viteLog] });
closeSync(viteLog);
console.log(`galeria "${rotulo}": ${raiz} @ ${commit} (${ramo}${sujo ? ', com mudanças fora do commit' : ''}) · vite pid ${vite.pid} na porta ${porta} · saída ${dir}`);
const t0 = Date.now();
for (let pronto = false; !pronto;) {
  if (vite.exitCode !== null) { console.error(`o vite saiu (código ${vite.exitCode}); veja ${join(dir, 'vite.log')}`); process.exit(1); }
  if (Date.now() - t0 > 180000) { console.error('o vite não respondeu em 180 s'); process.exit(1); }
  pronto = await fetch(`${base}/tools/render-harness.html`).then((r) => r.ok, () => false);
  if (!pronto) await new Promise((r) => setTimeout(r, 1000));
}

// ───────────── as cenas, uma página por vez ─────────────
/**
 * Roda na página antes de tudo. Math.random com semente (a pista do fundo do menu e as partículas saem iguais a cada geração) e o WebGL com
 * `preserveDrawingBuffer` (o canvas pode ser exportado depois do quadro, quando o screenshot estoura). Nenhum dos dois muda a imagem.
 * Nas telas de menu o laço do jogo não anda sozinho: a galeria dá os quadros (`session.frame`) com o relógio fixo de 1/60 s.
 */
function preparoDaPagina({ segurarQuadros }) {
  let s = 0x5eed1234;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (tipo, attrs) {
    return getContext.call(this, tipo, tipo === 'webgl2' || tipo === 'webgl' ? { ...(attrs ?? {}), preserveDrawingBuffer: true } : attrs);
  };
  if (segurarQuadros) window.requestAnimationFrame = () => 0;
}
/** As transições de CSS (legenda do marco, entrada da tela) param no fim: a captura não depende de quando o screenshot saiu. */
const acabarAnimacoes = () => { for (const a of document.getAnimations()) { try { a.finish(); } catch { /* infinita: fica como está */ } } };

async function rodarPista(page, cena) {
  await page.goto(`${base}/tools/render-harness.html?${cena.query}`, { waitUntil: 'load', timeout: ESPERA });
  await page.waitForFunction(() => window.ready === true, null, { timeout: ESPERA, polling: 1000 });
  await page.evaluate(acabarAnimacoes);
  await page.waitForTimeout(800);
  return page.evaluate(() => ({ debug: window.debug ?? null, errosDaPagina: window.errors ?? [], hud: (document.getElementById('hud')?.innerText ?? '').trim().length > 0 }));
}

async function rodarMenu(page, cena) {
  await page.goto(`${base}/?nosurvey=1`, { waitUntil: 'load', timeout: ESPERA });
  await page.waitForFunction(() => !!window.nc?.session, null, { timeout: ESPERA, polling: 500 });
  // As receitas de scripts/playtest-layout.mjs: 'main' direto; a garagem pela carreira nova com 1 piloto ('garage-1').
  const aberta = await page.evaluate((tela) => {
    const s = window.nc.session;
    s.stop();
    for (let i = 0; i < 4; i++) s.input.unbindSeat(i);
    s.input.bindSeat(0, 'kb1');
    if (tela === 'garage') s.handleMenuEvent({ type: 'startCareer', humans: [{ seat: 0, name: 'Piloto 1', carId: 'falcao', teamId: 0, color: '#ffd23f' }], resume: false });
    else s.menus.show(tela);
    return s.menus.current();
  }, cena.tela);
  if (aberta !== cena.tela) throw new Error(`a tela aberta é "${aberta}", não "${cena.tela}"`);
  for (let i = 1; i <= QUADROS_DE_MENU; i++) await page.evaluate((agora) => window.nc.session.frame(agora), i * PASSO_DE_MENU_MS);
  await page.evaluate(acabarAnimacoes);
  await page.waitForTimeout(800);
  return page.evaluate(() => ({ debug: window.nc.session.renderer.debugInfo?.() ?? null, errosDaPagina: [], hud: false }));
}

/** Screenshot da página; se estourar o tempo, o canvas direto (a folha de contato do harness, se estiver à mostra). */
async function capturar(page, arquivo, podeCanvas) {
  try {
    await page.screenshot({ path: arquivo, timeout: 180000 });
    return 'tela';
  } catch (e) {
    if (!podeCanvas) throw e;
    console.log(`  screenshot estourou (${String(e.message).split('\n')[0]}); exportando o canvas`);
    const url = await page.evaluate(() => {
      const folha = document.getElementById('sheet');
      return (folha && folha.style.display === 'block' ? folha : document.getElementById('game')).toDataURL('image/png');
    });
    writeFileSync(arquivo, Buffer.from(url.split(',')[1], 'base64'));
    return 'canvas';
  }
}

async function navegador() {
  if (!browser?.isConnected()) browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  return browser;
}

async function rodarCena(cena) {
  const arquivo = `${cena.id}.png`;
  const inicio = Date.now();
  let ultimo = '';
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const ctx = await (await navegador()).newContext({ viewport: { width: LARGURA, height: ALTURA }, deviceScaleFactor: 1 });
    await ctx.addInitScript(preparoDaPagina, { segurarQuadros: cena.tipo === 'menu' });
    const page = await ctx.newPage();
    page.setDefaultTimeout(ESPERA);
    const erros = [];
    page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !IGNORAR.test(m.text())) erros.push(`console: ${m.text()}`); });
    try {
      const r = cena.tipo === 'pista' ? await rodarPista(page, cena) : await rodarMenu(page, cena);
      const captura = await capturar(page, join(dir, arquivo), cena.tipo === 'pista' || tentativa === TENTATIVAS);
      const alertas = cena.hud && !r.hud && captura === 'tela' ? ['sem HUD'] : [];
      await ctx.close().catch(() => undefined);
      return { id: cena.id, arquivo, debug: r.debug, captura, tentativas: tentativa, segundos: (Date.now() - inicio) / 1000, erros: [...new Set([...r.errosDaPagina, ...erros])].slice(0, 6), alertas };
    } catch (e) {
      ultimo = String(e.message ?? e).split('\n')[0];
      console.log(`  ${cena.id}: tentativa ${tentativa} falhou: ${ultimo}`);
      await ctx.close().catch(() => undefined);
      await browser?.close().catch(() => undefined); // o próximo começa num navegador novo (GPU de software travada, página morta)
      browser = null;
    }
  }
  return { id: cena.id, arquivo, debug: null, captura: 'falhou', tentativas: TENTATIVAS, segundos: (Date.now() - inicio) / 1000, erros: [ultimo], alertas: [] };
}

// --so: as outras cenas vêm do manifest que já está na pasta (só se for do mesmo commit).
const manifestPath = join(dir, 'manifest.json');
const reaproveitadas = [];
if (so && existsSync(manifestPath)) {
  const anterior = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (anterior.commit !== commit) console.log(`aviso: o manifest da pasta é do commit ${anterior.commit}, não ${commit}; as outras cenas ficam de fora`);
  else for (const c of anterior.cenas) if (!so.includes(c.id) && c.captura !== 'falhou') {
    reaproveitadas.push({ id: c.id, arquivo: c.arquivo, debug: c.chamadas === null ? null : { calls: c.chamadas, triangles: c.triangulos, frameMs: c.msQuadro }, captura: c.captura, tentativas: c.tentativas, segundos: c.segundos, erros: c.erros, alertas: c.alertas });
  }
}

const resultados = [...reaproveitadas];
for (const cena of CENAS.filter((c) => !so || so.includes(c.id))) {
  const r = await rodarCena(cena);
  resultados.push(r);
  const n = r.debug ? `${r.debug.calls} chamadas, ${r.debug.triangles} △, ${Math.round(r.debug.frameMs)} ms` : 'sem contagens';
  console.log(`${r.captura === 'falhou' ? 'FALHOU' : 'ok'} ${cena.id} (${r.captura}, ${r.tentativas}ª tentativa, ${Math.round(r.segundos)} s; ${n})${r.alertas.length ? ` ⚠ ${r.alertas.join(', ')}` : ''}${r.erros.length ? `\n    erros: ${r.erros.join(' | ')}` : ''}`);
}
encerrarVite();

// ───────────── manifest, alertas da imagem e a folha ─────────────
const manifest = montarManifest({ rotulo, commit, ramo, sujo, data: new Date(), raiz, resultados });
const ctx = await (await navegador()).newContext({ viewport: { width: 1660, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.setDefaultTimeout(ESPERA);
for (const c of manifest.cenas) {
  if (!c.arquivo) continue;
  const m = await page.evaluate(async ({ b64, fn }) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    return { w: img.width, h: img.height, lum: new Function(`return (${fn})`)()(g.getImageData(0, 0, cv.width, cv.height).data) };
  }, { b64: readFileSync(join(dir, c.arquivo)).toString('base64'), fn: luminanciaMedia.toString() });
  const novos = [...(m.lum < LUMINANCIA_MINIMA ? [`quase preta (luminância ${m.lum.toFixed(3)})`] : []), ...(m.w !== LARGURA || m.h !== ALTURA ? [`tamanho ${m.w}×${m.h}`] : [])];
  c.alertas = [...new Set([...c.alertas.filter((a) => !a.startsWith('quase preta') && !a.startsWith('tamanho ')), ...novos])];
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(dir, 'folha.html'), htmlDaFolha(manifest));
await page.goto(pathToFileURL(join(dir, 'folha.html')).href, { waitUntil: 'load' });
await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => undefined))));
await page.screenshot({ path: join(dir, 'folha.png'), fullPage: true });
await ctx.close();
await browser.close();

const rodadas = new Set(resultados.filter((r) => !reaproveitadas.includes(r)).map((r) => r.id));
const falhas = manifest.cenas.filter((c) => c.captura === 'falhou' && rodadas.has(c.id));
const fora = manifest.cenas.filter((c) => c.captura === 'falhou' && !rodadas.has(c.id));
const comAlerta = manifest.cenas.filter((c) => c.alertas.length);
console.log(`${falhas.length ? 'FALHOU' : 'ok'} folha ${join(dir, 'folha.png')} · ${manifest.cenas.length - falhas.length - fora.length}/${manifest.cenas.length} cenas · ${Math.round((Date.now() - t0) / 1000)} s no total`);
if (fora.length) console.log(`  fora desta rodada (--so): ${fora.map((c) => c.id).join(', ')}`);
for (const c of comAlerta) console.log(`  ⚠ ${c.id}: ${c.alertas.join(', ')}`);
for (const c of falhas) console.log(`  falhou: ${c.id} ${c.erros.join(' | ')}`);
process.exit(falhas.length ? 1 : 0);
