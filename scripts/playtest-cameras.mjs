// Playtest das câmeras selecionáveis (nc/cameras) pelo jogo de verdade, no Chromium (Playwright): a tecla C troca a câmera do assento
// (Alta → Baixa → Capô → Frente → Alta) com o aviso "Câmera: …" na tela, a escolha fica no save das opções, V troca a do 2º jogador (cada um a
// sua), a tela dividida funciona, e as capturas (1 jogador com as dicas da 1ª corrida na tela; 2 jogadores) ficam em scratch/cameras/.
// Uso: com `npm run preview` (porta 4174) ou o vite no ar:  node scripts/playtest-cameras.mjs [url] [prefixo-das-capturas]
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4174/?nosurvey=1';
const out = process.argv[3] ?? 'scratch/cameras/jogo';
const exe = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(Number(process.env.NC_PT_TIMEOUT ?? 240000));
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(`console: ${m.text()}`); });
const fails = [];
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails.push(msg); };
const humans = (n) => Array.from({ length: n }, (_, i) => ({ seat: i, name: `P${i + 1}`, carId: ['falcao', 'trovao', 'tornado', 'camelo'][i], teamId: 0, color: ['#ffd23f', '#3ddc84', '#4fc3f7', '#ff7ab6'][i] }));
const frames = (n = 2) => page.evaluate((k) => new Promise((resolve) => { let i = 0; const f = () => (++i >= k ? resolve() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const cams = () => page.evaluate(() => [...window.nc.session.settings.seatCameras]);
const saved = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('speed-tche.settings') ?? '{}').seatCameras ?? null; } catch { return null; } });
const msgs = (seat) => page.evaluate((s) => (window.nc.session.race?.messages.get(s) ?? []).map((m) => m.text), seat);
const press = async (k) => { await page.keyboard.down(k); await frames(2); await page.keyboard.up(k); await frames(2); };

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.nc?.session);
check(JSON.stringify(await cams()) === '["high","high","high","high"]', `o padrão é a Alta nos 4 assentos (${JSON.stringify(await cams())})`);

// ── 1 jogador (teclado 1): C cicla ──
await page.evaluate((h) => { const s = window.nc.session; s.menus.hide(); for (let i = 0; i < 4; i++) s.input.unbindSeat(i); s.debugBind(0, 'kb1'); s.startQuick('paraty', 3, h); }, humans(1));
await page.evaluate(() => window.nc.session.debugStep(260));
await frames(3);
const order = ['low', 'hood', 'bumper', 'high'];
const names = { low: 'Baixa', hood: 'Capô', bumper: 'Frente', high: 'Alta' };
for (const mode of order) {
  await press('KeyC');
  const c = await cams();
  check(c[0] === mode, `C leva o assento 1 à ${names[mode]} (${c[0]})`);
  check((await msgs(0)).includes(`Câmera: ${names[mode]}`), `aviso "Câmera: ${names[mode]}" na tela (${JSON.stringify(await msgs(0))})`);
  check((await saved())?.[0] === mode, `a escolha fica gravada nas opções (${JSON.stringify(await saved())})`);
}
// V não é a tecla do teclado 1; só o teclado 2 (sem assento aqui) a usa.
await press('KeyV');
check((await cams())[0] === 'high', 'V não mexe na câmera do teclado 1');
// Pausa: a tecla não troca a câmera.
await page.evaluate(() => { const s = window.nc.session; s.paused = true; });
await press('KeyC');
check((await cams())[0] === 'high', 'em pausa a tecla de câmera não troca');
await page.evaluate(() => { window.nc.session.paused = false; });

// Capturas do 1 jogador, uma por câmera, com a dica da 1ª corrida (hud-tips) na tela.
await page.evaluate(() => { const s = window.nc.session; s.debugStep(200); });
for (const mode of ['high', 'low', 'hood', 'bumper']) {
  await page.evaluate((m) => { window.nc.session.settings.seatCameras[0] = m; }, mode);
  await frames(4);
  const tip = await page.evaluate(() => !!document.querySelector('.ht-card'));
  await page.screenshot({ path: `${out}-1p-${mode}.png`, timeout: 240000 });
  console.log(`  captura ${out}-1p-${mode}.png (dica no DOM: ${tip})`);
}
// Em corrida a escolha anda com o jogador e o `hashRace` não sabe dela.
const hashes = await page.evaluate(async () => {
  const s = window.nc.session; const r = s.race;
  return { tick: r.state.tick, cars: r.state.cars.length };
});
check(hashes.cars > 1, `a corrida segue (tick ${hashes.tick})`);

// ── 2 jogadores (teclado 1 e teclado 2): cada um a sua ──
await page.evaluate((h) => { const s = window.nc.session; s.menus.hide(); for (let i = 0; i < 4; i++) s.input.unbindSeat(i); s.debugBind(0, 'kb1'); s.debugBind(1, 'kb2'); s.settings.seatCameras = ['high', 'high', 'high', 'high']; s.startQuick('paraty', 3, h); }, humans(2));
await page.evaluate(() => window.nc.session.debugStep(260));
await frames(3);
await press('KeyC');
check(JSON.stringify((await cams()).slice(0, 2)) === '["low","high"]', `C troca só o jogador 1 (${JSON.stringify(await cams())})`);
await press('KeyV'); await press('KeyV');
check(JSON.stringify((await cams()).slice(0, 2)) === '["low","hood"]', `V (2 vezes) leva o jogador 2 ao Capô (${JSON.stringify(await cams())})`);
check((await msgs(1)).includes('Câmera: Capô') && !(await msgs(0)).includes('Câmera: Capô'), 'o aviso aparece só na tela de quem trocou');
for (const [a, b] of [['high', 'low'], ['hood', 'bumper'], ['bumper', 'hood']]) {
  await page.evaluate(([x, y]) => { const c = window.nc.session.settings.seatCameras; c[0] = x; c[1] = y; }, [a, b]);
  await frames(4);
  await page.screenshot({ path: `${out}-2p-${a}-${b}.png`, timeout: 240000 });
  console.log(`  captura ${out}-2p-${a}-${b}.png`);
}
check(errors.length === 0, `sem erro de página nem de console (${errors.slice(0, 3).join(' | ')})`);
await browser.close();
console.log(fails.length === 0 ? 'OK' : `${fails.length} falha(s)`);
process.exit(fails.length === 0 ? 0 : 1);
