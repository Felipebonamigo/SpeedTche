// Folha de contato da M2 (docs/ondas/M/M2.md §4): UMA captura por copa (34) e as 18 combinações bioma × período, no harness, para o dono julgar.
// Com o vite no ar (`npx vite --port <porta> --strictPort &`), em segundo plano:
//   npx tsx tools/folha-copas.ts <porta> [saída=scratch/m2-copas] [copas|combinacoes|ambos=copas]
// Cada captura roda num processo próprio, sob a trava de captura (`flock /tmp/nc-captura-3.lock`, docs/ondas/K.md §2.4): no máximo 3 ao mesmo
// tempo na máquina, e a fila espera. Grava <saída>/<nome>.png (1280×720), <saída>/<nome>.json (luminância média, saturação média e contraste da
// imagem, e os erros de página/console: shader que não compila aparece aqui), <saída>/medidas.json (todas) e <saída>/folha-<grupo>.png (grade
// de 4 colunas, por tools/tile.mjs). Saturação e contraste da IMAGEM são só alerta (bíblia §4); `scratch/` é ignorado pelo git: nada vai ao repositório.
// Sai com 1 se alguma captura falhou (tempo-limite, erro de página); alerta de cor NUNCA dá exit 1.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CUPS } from '../src/core/data/cups';
import { getTrack } from '../src/core/track';
import { TRACKS } from '../src/core/track/tracks';
import type { SceneryId, TimeOfDay } from '../src/core/types';
import { SCENERIES, TIMES_OF_DAY } from '../src/render/palette';
import { landmarkSight, sceneryLayout } from '../src/render/scenery/layout';

export interface Shot {
  /** Nome do arquivo (sem extensão). */
  name: string;
  track: string;
  /** Segmento da câmera (60 antes do 1º marco, ou o 100 se a pista não tem marco). */
  seg: number;
  /** Período desenhado (o da pista, ou o forçado nas combinações). */
  tod: TimeOfDay;
  /** Bioma desenhado (o da pista, ou o forçado nas combinações). */
  scenery: SceneryId;
  /** Só nas capturas por copa. */
  cup?: string;
  /** Só nas combinações: o bioma/período forçados diferem dos da pista. */
  forced?: boolean;
}

export type CopaShot = Shot & { cup: string };

/** O segmento da câmera: 60 antes do 1º marco da pista (a regra "40–80 antes" da bíblia, §5), ou o 100. */
function cameraSeg(trackId: string): number {
  const t = getTrack(trackId);
  const rows = landmarkSight(t, sceneryLayout(t));
  if (rows.length === 0) return 100 % t.segments.length;
  const first = Math.min(...rows.map((r) => r.seg));
  return Math.max(30, first - 60) % t.segments.length;
}

/** Uma captura por copa: a 1ª pista da copa, no período dela. 34 copas. */
export function copaShots(): CopaShot[] {
  return CUPS.map((cup) => {
    const track = cup.trackIds[0];
    const def = getTrack(track).def;
    return { cup: cup.id, name: `${cup.id}-${track}`, track, seg: cameraSeg(track), tod: def.timeOfDay, scenery: def.scenery };
  });
}

/** As 18 combinações bioma × período: uma pista do bioma (a 1ª da lista), com o período forçado. */
export function combinacaoShots(): Shot[] {
  return SCENERIES.flatMap((scenery) => TIMES_OF_DAY.map((tod) => {
    const def = TRACKS.find((t) => t.scenery === scenery);
    if (!def) throw new Error(`nenhuma pista do bioma ${scenery}`);
    return { name: `${scenery}-${tod}`, track: def.id, seg: cameraSeg(def.id), tod, scenery, forced: true };
  }));
}

const LOCK = '/tmp/nc-captura-3.lock';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const IGNORE = /GL Driver|404/;
const ALERTA = { satMin: 0.25, satMax: 0.8, contrasteMin: 0.12 }; // o mesmo da K4 (tools/referencias.mjs): só avisa

/** Uma captura (modo `--um`): abre o harness, espera, fotografa e mede. Roda dentro do processo que o orquestrador põe sob a trava. */
async function capturaUm(port: string, dir: string, shot: Shot): Promise<number> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(600000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !IGNORE.test(m.text())) errors.push(`console: ${m.text()}`); });
  let ready = false;
  try {
    const q = new URLSearchParams({ track: shot.track, seg: String(shot.seg), hud: '0', frames: '24' });
    if (shot.forced) { q.set('tod', shot.tod); q.set('scenery', shot.scenery); }
    await page.goto(`http://localhost:${port}/tools/render-harness.html?${q}`);
    ready = await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready, null, { timeout: 600000 }).then(() => true, () => false);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${dir}/${shot.name}.png` });
    const png = readFileSync(`${dir}/${shot.name}.png`).toString('base64');
    const m = await page.evaluate(async (b64: string) => {
      const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d') as CanvasRenderingContext2D; ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let n = 0; let sy = 0; let syy = 0; let ss = 0;
      for (let i = 0; i < data.length; i += 16) { // 1 pixel a cada 4
        const r = data[i] / 255; const g = data[i + 1] / 255; const b = data[i + 2] / 255;
        const y = 0.2126 * r + 0.7152 * g + 0.0722 * b; const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
        ss += mx === 0 ? 0 : (mx - mn) / mx; sy += y; syy += y * y; n++;
      }
      const lum = sy / n; return { lum, sat: ss / n, contraste: Math.sqrt(Math.max(0, syy / n - lum * lum)) };
    }, png);
    const alertas: string[] = [];
    if (m.sat < ALERTA.satMin) alertas.push('saturação baixa');
    if (m.sat > ALERTA.satMax) alertas.push('saturação alta');
    if (m.contraste < ALERTA.contrasteMin) alertas.push('contraste baixo');
    const r3 = (x: number): number => Math.round(x * 1000) / 1000;
    writeFileSync(`${dir}/${shot.name}.json`, JSON.stringify({ ...shot, ready, lum: r3(m.lum), sat: r3(m.sat), contraste: r3(m.contraste), erros: errors.slice(0, 5), alertas }, null, 2));
  } catch (e) {
    errors.push(String((e as Error).message ?? e));
    writeFileSync(`${dir}/${shot.name}.json`, JSON.stringify({ ...shot, ready, erros: errors.slice(0, 5), falhou: true }, null, 2));
  }
  await browser.close();
  return ready && errors.length === 0 ? 0 : 1;
}

async function main(): Promise<void> {
  const [first, ...rest] = process.argv.slice(2);
  if (first === '--um') {
    const [port, dir, json] = rest;
    process.exit(await capturaUm(port, dir, JSON.parse(json) as Shot));
  }
  const port = first;
  const dir = rest[0] ?? 'scratch/m2-copas';
  const grupo = rest[1] ?? 'copas';
  if (!port) { console.log('uso: npx tsx tools/folha-copas.ts <porta> [saída=scratch/m2-copas] [copas|combinacoes|ambos=copas]'); process.exit(1); }
  mkdirSync(dir, { recursive: true });
  const grupos: Array<[string, Shot[]]> = [];
  if (grupo === 'copas' || grupo === 'ambos') grupos.push(['copas', copaShots()]);
  if (grupo === 'combinacoes' || grupo === 'ambos') grupos.push(['combinacoes', combinacaoShots()]);
  const self = process.argv[1];
  const medidas: Record<string, unknown> = {};
  let falhas = 0;
  for (const [nome, shots] of grupos) {
    const feitos: string[] = [];
    for (const [i, shot] of shots.entries()) {
      // Cada captura sob a trava: a fila espera a vez; o orquestrador não segura a vaga entre uma e outra.
      const arq = `${dir}/${shot.name}`;
      let ok = false;
      // Sob carga de CPU (swiftshader) o quadro pode não ficar pronto no tempo: uma segunda tentativa antes de contar a falha.
      for (let tentativa = 0; tentativa < 2 && !ok; tentativa++) {
        const r = spawnSync('flock', [LOCK, process.execPath, '--import', 'tsx', self, '--um', port, dir, JSON.stringify(shot)], { stdio: 'inherit', timeout: 1500000 });
        ok = r.status === 0 && existsSync(`${arq}.png`);
      }
      if (!ok) falhas++;
      if (existsSync(`${arq}.json`)) medidas[shot.name] = JSON.parse(readFileSync(`${arq}.json`, 'utf8'));
      if (existsSync(`${arq}.png`)) feitos.push(`${arq}.png`);
      console.log(`${ok ? 'ok' : 'FALHOU'} ${nome} ${i + 1}/${shots.length} ${shot.name}`);
    }
    if (feitos.length > 0) spawnSync(process.execPath, ['tools/tile.mjs', `${dir}/folha-${nome}.png`, '4', ...feitos], { stdio: 'inherit' });
  }
  writeFileSync(`${dir}/medidas.json`, JSON.stringify(medidas, null, 2));
  console.log(`${falhas ? 'FALHOU' : 'ok'}: ${Object.keys(medidas).length} capturas em ${dir}/ (${falhas} falhas)`);
  process.exit(falhas ? 1 : 0);
}

// Só roda como script (o teste importa as funções puras acima).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
