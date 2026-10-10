// Playtest da voz do carro no Chromium (N6, docs/ondas/N/N6.md): a roda de frases e os balões de provocação, pelo fluxo real de
// teclado (segurar a buzina abre a roda; marcha acima marca; soltar fala), com 1, 2 e 4 jogadores em três resoluções e o HUD a 100%
// e a 150%. Confere o que o DOM de teste em Node não alcança: a roda e o balão caem DENTRO do viewport, não cobrem os painéis do HUD
// (posição/volta, tempo, combustível/nitro, velocímetro, minimapa), o texto tem pelo menos 12 px efetivos, e tira as capturas.
// Uso: node scripts/playtest-voz.mjs [url] [prefixo-das-capturas]   (com `npm run preview` no ar; `scratch/` é ignorado pelo git)
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4174/';
const out = process.argv[3] ?? 'scratch/voz';
const exe = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240_000);
const errors = [];
page.on('pageerror', (e) => { errors.push('pageerror: ' + e.message); console.log(`  !! pageerror: ${e.message}`); });
page.on('console', (m) => { if (m.type() === 'error') { errors.push(`console: ${m.text()}`); console.log(`  !! console: ${m.text()}`); } });
const fails = [];
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails.push(msg); };

const humans = (n) => Array.from({ length: n }, (_, i) => ({ seat: i, name: `P${i + 1}`, carId: ['trovao', 'tornado', 'sucuri', 'saci'][i], teamId: i, color: ['#ffd23f', '#3ddc84', '#4fc3f7', '#ff7ab6'][i] }));
const SIZES = [[1280, 720], [1280, 800], [1024, 640]];
/** Teclas de cada teclado: buzina e marcha acima (teclado 1: H e M; teclado 2: G e E). */
const KEYS = [{ horn: 'KeyH', gear: 'KeyM' }, { horn: 'KeyG', gear: 'KeyE' }];

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.evaluate(() => { window.nc.session.settings.quality = 'low'; });

/** Tira o 3D de cena nos menus e depois da largada: o fundo por software custa ~1 s por quadro. */
async function startScene(n, w, h, hudScale) {
  await page.setViewportSize({ width: w, height: h });
  await page.evaluate(({ hs }) => { document.getElementById('hud').style.setProperty('--hud-scale', String(hs)); }, { hs: hudScale });
  await page.evaluate(({ list }) => {
    const s = window.nc.session;
    s.menus.hide();
    for (let i = 0; i < 4; i++) s.input.unbindSeat(i);
    ['kb1', 'kb2', 'gp0', 'gp1'].slice(0, list.length).forEach((d, i) => s.input.bindSeat(i, d));
    s.startQuick('copacabana', 2, list);
    s.debugStep(60 * 5);
  }, { list: humans(n) });
  await page.waitForTimeout(500);
}

async function measure() {
  return page.evaluate(() => {
    const rect = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
    const hit = (a, b) => a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1;
    const hudVps = [...document.querySelectorAll('.nc-hud > .vp')].filter((e) => e.style.display !== 'none');
    const vhVps = [...document.querySelectorAll('.vh-vp')].filter((e) => e.style.display !== 'none');
    return vhVps.map((vp, i) => {
      const box = rect(vp);
      const panels = [...hudVps[i].querySelectorAll('.tl, .tr, .bl, .br, .mini, .mates')].filter((p) => p.getClientRects().length > 0 && getComputedStyle(p).display !== 'none').map((p) => ({ name: p.className.split(' ')[0], ...rect(p) }));
      const shown = [...vp.querySelectorAll('.vh-wheel.open, .vh-balloon.show')].map((e) => {
        const r = rect(e);
        const label = e.classList.contains('vh-wheel') ? 'roda' : e.classList.contains('vh-own') ? 'balão-próprio' : 'balão-alto';
        const texts = [...e.querySelectorAll('.vh-item, .vh-text, .vh-who, .vh-hint, .vh-wait, .vh-title')].filter((t) => t.textContent && getComputedStyle(t).display !== 'none');
        const minFont = Math.min(...texts.map((t) => parseFloat(getComputedStyle(t).fontSize)));
        return { label, ...r, inside: r.x >= box.x - 1 && r.y >= box.y - 1 && r.r <= box.r + 1 && r.b <= box.b + 1, minFont, hits: panels.filter((p) => hit(r, p)).map((p) => p.name) };
      });
      return { box, shown };
    });
  });
}

// NC_VOZ_ONLY="2:1280x720:1" roda só essa combinação (jogadores:resolução:escala do HUD); NC_VOZ_DUMP=1 imprime a geometria medida.
const ONLY = process.env.NC_VOZ_ONLY ?? null;

/** Confere o que está à vista: dentro do viewport, texto >= 12 px e (HUD a 100%) sem cobrir painel do HUD. A 150% o HUD enche a célula e só vale "dentro". */
function conferir(tag, medidas, hudScale, esperado) {
  const vistos = medidas.flatMap((v) => v.shown.map((s) => s.label));
  for (const [label, n] of Object.entries(esperado)) check(vistos.filter((l) => l === label).length === n, `${tag}: ${n} ${label}(s) à vista (${vistos.filter((l) => l === label).length})`);
  for (const [i, v] of medidas.entries()) {
    for (const s of v.shown) {
      check(s.inside, `${tag}: viewport ${i + 1}, ${s.label} dentro do viewport (${Math.round(s.x)},${Math.round(s.y)} ${Math.round(s.w)}×${Math.round(s.h)} em ${Math.round(v.box.w)}×${Math.round(v.box.h)})`);
      check(s.minFont >= 12, `${tag}: viewport ${i + 1}, ${s.label} com texto ≥ 12 px (${s.minFont.toFixed(1)})`);
      if (hudScale === 1) check(s.hits.length === 0, `${tag}: viewport ${i + 1}, ${s.label} não cobre painéis do HUD (${s.hits.join(', ') || 'nenhum'})`);
    }
  }
}

for (const hudScale of [1, 1.5]) {
  for (const n of [1, 2, 4]) {
    for (const [w, h] of SIZES) {
      if (ONLY && ONLY !== `${n}:${w}x${h}:${hudScale}`) continue;
      const tag = `${n}J ${w}×${h} HUD ${hudScale * 100}%`;
      const principal = hudScale === 1 && w === 1280 && h === 720;
      await startScene(n, w, h, hudScale);
      // Fase 1: segura a buzina (e G no teclado 2) até as rodas abrirem e marca uma frase em cada; injeta balões para o que não dá para teclar.
      const wheels = Math.min(n, 2);
      for (let i = 0; i < wheels; i++) await page.keyboard.down(KEYS[i].horn);
      const open = await page.waitForFunction((k) => { const v = window.nc.session.race?.voice; return !!v && Array.from({ length: k }, (_, i) => v.wheels[i]?.open === true).every(Boolean); }, wheels, { timeout: 120_000 }).then(() => true, () => false);
      check(open, `${tag}: segurar a buzina abre a roda de cada teclado (${wheels})`);
      for (let i = 0; i < wheels; i++) { await page.keyboard.press(KEYS[i].gear); await page.waitForTimeout(200); }
      await page.evaluate(({ n }) => {
        const r = window.nc.session.race;
        const colors = ['#ffd23f', '#3ddc84', '#4fc3f7', '#ff7ab6'];
        // Balões de verdade para quem não tem o que teclar aqui (assentos 2 e 3) e um de "outro computador" e outro do rival.
        for (let seat = 2; seat < n; seat++) r.voice.balloons.push({ id: 100 + seat, seat, name: `P${seat + 1}`, color: colors[seat], text: 'Segura essa!', ttl: 600, total: 600, own: true });
        r.voice.balloons.push({ id: 200, seat: 3, name: 'Caio', color: '#ff7ab6', text: 'Tá devagar, hein?', ttl: 600, total: 600, own: false });
        r.voice.balloons.push({ id: 201, seat: -1, name: 'Zé Turbo', color: '#ff4d4d', text: 'Ha! Nem viu a curva!', ttl: 600, total: 600, own: false });
        for (const list of r.messages.values()) list.push({ text: 'Zé Turbo: Te vejo na reta!', kind: 'info', ttl: 600 });
      }, { n });
      await page.waitForTimeout(1500);
      let m = await measure();
      check(m.length === n, `${tag}: um overlay por viewport (${m.length})`);
      if (process.env.NC_VOZ_DUMP) console.log(JSON.stringify(m, (k, v) => (typeof v === 'number' ? Math.round(v) : v)));
      conferir(`${tag} [roda aberta]`, m, hudScale, { roda: wheels });
      if (principal) await page.screenshot({ path: `${out}-${n}j-roda.png`, timeout: 180_000 });
      // Fase 2: solta a buzina — as frases marcadas viram balões de verdade sobre cada carro.
      for (let i = 0; i < wheels; i++) await page.keyboard.up(KEYS[i].horn);
      const falou = await page.waitForFunction((k) => { const v = window.nc.session.race?.voice; return !!v && Array.from({ length: k }, (_, i) => v.balloons.some((b) => b.seat === i && b.own)).every(Boolean); }, wheels, { timeout: 120_000 }).then(() => true, () => false);
      check(falou, `${tag}: soltar a buzina com a frase marcada vira balão sobre o carro (${wheels})`);
      // O balão de verdade dura 2 s de tempo de quadro (o 3D por software leva ~0,3 s por quadro): segura-o à vista para medir e fotografar.
      await page.evaluate(() => { for (const b of window.nc.session.race.voice.balloons) { b.ttl = 600; b.total = 600; } });
      await page.waitForTimeout(800);
      m = await measure();
      const proprios = m.flatMap((v) => v.shown).filter((s) => s.label === 'balão-próprio').length;
      conferir(`${tag} [balões]`, m, hudScale, { roda: 0, 'balão-próprio': n });
      if (principal) await page.screenshot({ path: `${out}-${n}j-balao.png`, timeout: 180_000 });
      void proprios;
      await page.waitForTimeout(300);
    }
  }
}

console.log('erros de página:', errors.length ? errors.join('\n') : 'nenhum');
await browser.close();
if (errors.length || fails.length) { console.log(`FALHOU: ${fails.length} conferências, ${errors.length} erros`); process.exit(1); }
console.log('playtest da voz OK');
