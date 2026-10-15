// Fotografa a folha de componentes (tools/menu-estilos/componentes.html) em cada tema, a 1280×720: scratch/menu-estilos/<tema>-componentes.png.
// Exige `npx vite --port P` no ar. Uso: node tools/menu-estilos-componentes.mjs [http://localhost:5199] [pasta]
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5611';
const out = process.argv[3] ?? 'scratch/menu-estilos';
const exe = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
for (const tema of (process.argv[4] ?? 'speedtche,classico').split(',')) {
  await page.goto(`${base}/tools/menu-estilos/componentes.html?tema=${tema}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${tema}-componentes.png` });
  console.log('ok', tema);
}
await browser.close();
