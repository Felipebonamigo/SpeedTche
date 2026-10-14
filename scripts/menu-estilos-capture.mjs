// Captura as telas reais do jogo em cada tema de menu (docs/ondas/menu-estilos.md) a 1280×720.
// Uma só página: o tema é o atributo `data-tema` da raiz, então troca em tempo de execução (atual = sem atributo) e a corrida de
// preparação (resultado e Pagamento) roda uma vez só. Exige `npx vite --port P` (ou preview) no ar.
// Uso: node scripts/menu-estilos-capture.mjs [url] [pasta-de-saída]
//   NC_ME_TEMAS=atual,a,b,c   NC_ME_TELAS=title,main,...   NC_ME_SKIPRACE=1 (pula a corrida: sem resultado/Pagamento)
import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5199/?nosurvey=1&dynres=0';
const out = process.argv[3] ?? 'scratch/menu-estilos/raw';
const exe = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TEMAS = (process.env.NC_ME_TEMAS ?? 'atual,a,b,c').split(',');
const SKIP_RACE = !!process.env.NC_ME_SKIPRACE;
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(300000);
page.on('pageerror', (e) => console.log('pageerror:', e.message));
const humans = (n) => Array.from({ length: n }, (_, i) => ({ seat: i, name: ['Marina', 'Tiago', 'Bia', 'Caio'][i], carId: ['falcao', 'trovao', 'tornado', 'camelo'][i], teamId: i % 2, color: ['#ffd23f', '#3ddc84', '#4fc3f7', '#ff7ab6'][i] }));

await page.addInitScript(() => {
  if (localStorage.getItem('speed-tche.save')) return;
  const done = ['br_rj', 'br_sp', 'br_mg', 'br_es', 'br_pr', 'br_sc', 'br_rs', 'br_df', 'br_go'];
  localStorage.setItem('speed-tche.save', JSON.stringify({
    carsUnlocked: ['curupira', 'sucuri', 'carcara', 'pororoca'], seatCars: ['falcao', 'trovao', 'pororoca', 'iara'],
    cupsCompleted: done, stamps: ['RJ', 'SP', 'MG', 'ES', 'PR', 'SC', 'RS', 'DF', 'GO'],
  }));
});
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const s = window.nc.session;
  s.settings.quality = 'medium';
  window.__shown = {};
  const show = s.menus.show.bind(s.menus);
  s.menus.show = (screen, data) => { if (data !== undefined) window.__shown[screen] = data; return show(screen, data); };
});

async function race(label, setup, arg) {
  console.log('preparando', label);
  await page.evaluate(setup, arg);
  await page.keyboard.down('ArrowUp'); await page.keyboard.down('KeyW');
  for (let i = 0; i < 60; i++) {
    const phase = await page.evaluate(() => { window.nc.session.debugStep(600); return window.nc.session.race?.state.phase; });
    if (phase === 'finished') break;
  }
  await page.keyboard.up('ArrowUp'); await page.keyboard.up('KeyW');
  await page.evaluate(() => { const r = window.nc.session.race; if (r) r.overFor = 99; });
  for (let i = 0; i < 80 && (await page.evaluate(() => window.nc.session.menus.current())) !== 'results'; i++) await page.waitForTimeout(500);
}
let LIVE_RESULTS = false;
const CACHE = `${out}/../race-cache.json`;
if (!SKIP_RACE && fs.existsSync(CACHE)) {
  console.log('resultados do cache', CACHE);
  await page.evaluate((c) => { window.__shown.results = c.results; window.__shown.careerResults = c.careerResults; window.__career = c.career; }, JSON.parse(fs.readFileSync(CACHE, 'utf8')));
} else if (!SKIP_RACE) {
  await race('copa', (h) => { const s = window.nc.session; s.menus.hide(); s.debugBind(0, 'kb1'); s.debugBind(1, 'kb2'); s.startCup('br_rj', h); }, humans(2));
  await page.evaluate(() => { window.__shown.cupResults = window.__shown.results; });
  // O resultado ao vivo (com o pódio 3D, que só desenha com a corrida ainda na sessão): uma foto por tema, antes de seguir.
  if (!process.env.NC_ME_TELAS || process.env.NC_ME_TELAS.split(',').includes('results')) {
    await page.evaluate(() => document.querySelector('.results-skip')?.click());
    for (const tema of TEMAS) {
      await page.evaluate((tm) => { for (const el of [document.documentElement, document.getElementById('ui')]) { if (tm === 'atual') el.removeAttribute('data-tema'); else el.setAttribute('data-tema', tm); } }, tema);
      await page.waitForTimeout(3500);
      await page.screenshot({ path: `${out}/${tema}-results.png` });
      console.log('ok', tema, 'results (ao vivo)');
    }
    LIVE_RESULTS = true;
  }
  await page.evaluate((h) => {
    const s = window.nc.session; s.menus.hide(); for (let i = 0; i < 4; i++) s.input.unbindSeat(i);
    s.debugBind(0, 'kb1'); s.debugBind(1, 'kb2');
    s.handleMenuEvent({ type: 'startCareer', humans: h, resume: false }); s.handleMenuEvent({ type: 'careerRace' });
  }, humans(2));
  await page.keyboard.down('ArrowUp'); await page.keyboard.down('KeyW');
  for (let i = 0; i < 60; i++) { const phase = await page.evaluate(() => { window.nc.session.debugStep(600); return window.nc.session.race?.state.phase; }); if (phase === 'finished') break; }
  await page.keyboard.up('ArrowUp'); await page.keyboard.up('KeyW');
  await page.evaluate(() => { const r = window.nc.session.race; if (r) r.overFor = 99; });
  for (let i = 0; i < 80 && (await page.evaluate(() => window.nc.session.menus.current())) !== 'results'; i++) await page.waitForTimeout(500);
  await page.evaluate(() => { window.__shown.careerResults = window.__shown.results; window.__shown.results = window.__shown.cupResults ?? window.__shown.results; });
  fs.writeFileSync(CACHE, JSON.stringify(await page.evaluate(() => ({ results: window.__shown.results, careerResults: window.__shown.careerResults, career: window.nc.session.debugSave().career }))));
  await page.evaluate(() => { window.__career = JSON.parse(JSON.stringify(window.nc.session.debugSave().career)); });
}

/** [id, montagem, espera (ms) depois de montar] */
const TELAS = [
  ['title', () => window.nc.session.menus.show('title'), 600],
  ['main', () => {
    const s = window.nc.session; for (let i = 0; i < 4; i++) s.input.unbindSeat(i); ['kb1', 'kb2'].forEach((d, i) => s.input.bindSeat(i, d));
    const hs = [0, 1].map((i) => ({ seat: i, name: ['Marina', 'Tiago'][i], carId: ['falcao', 'tornado'][i], teamId: 0, color: '#fff' }));
    s.handleMenuEvent({ type: 'startCareer', humans: hs, resume: false });
    const snap = { at: '2026-10-10T20:00:00.000Z', racesRun: 1, racesWon: 1, stamps: 1, cupsCompleted: 1, achievements: 1, carsBought: 1, earned: 1 };
    s.debugSave().recap = { before: snap, after: { ...snap, racesRun: 31, racesWon: 12, stamps: 3, cupsCompleted: 3, achievements: 6, carsBought: 4, earned: 1_234_567 } };
    s.menus.show('main');
  }, 2500],
  ['garagem', () => {
    const s = window.nc.session; for (let i = 0; i < 4; i++) s.input.unbindSeat(i); s.input.bindSeat(0, 'kb1');
    s.handleMenuEvent({ type: 'startCareer', humans: [{ seat: 0, name: 'Marina', carId: 'falcao', teamId: 0, color: '#fff' }], resume: false });
  }, 7000],
  ['cups', () => window.nc.session.menus.show('cups'), 800],
  ['tracks', () => window.nc.session.menus.show('tracks'), 800],
  ['payout', () => { window.nc.session.debugSave().career = window.__career; window.nc.session.menus.show('payout', window.__shown.careerResults); setTimeout(() => document.querySelector('.payout-skip')?.click(), 700); }, 3000],
  ['results', () => { window.nc.session.menus.show('results', window.__shown.results); setTimeout(() => document.querySelector('.results-skip')?.click(), 700); }, 3000],
  ['lobby', () => { const s = window.nc.session; for (let i = 0; i < 4; i++) s.input.unbindSeat(i); ['kb1', 'kb2'].forEach((d, i) => s.input.bindSeat(i, d)); s.menus.show('lobby'); }, 1500],
  ['options', () => window.nc.session.menus.show('options'), 800],
  ['passport', () => window.nc.session.menus.show('passport'), 1200],
].filter(([id]) => (!process.env.NC_ME_TELAS || process.env.NC_ME_TELAS.split(',').includes(id)) && !(id === 'results' && LIVE_RESULTS));

for (const tela of TELAS) {
  for (const tema of TEMAS) {
    await page.evaluate((tm) => {
      for (const el of [document.documentElement, document.getElementById('ui')]) { if (tm === 'atual') el.removeAttribute('data-tema'); else el.setAttribute('data-tema', tm); }
    }, tema);
    // As telas com estado (Garagem) são montadas uma vez por tema: a tela sai do histórico e volta.
    await page.evaluate(tela[1]);
    await page.waitForTimeout(tela[2]);
    // congela as animações de entrada para uma captura estável
    await page.screenshot({ path: `${out}/${tema}-${tela[0]}.png` });
    console.log('ok', tema, tela[0]);
  }
}
await browser.close();
