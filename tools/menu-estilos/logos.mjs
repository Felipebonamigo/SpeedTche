// Fotografa a folha das variações do logo (tools/menu-estilos/logos.html) em scratch/menu-estilos/logos.png.
// Exige o vite de desenvolvimento no ar. Uso: node tools/menu-estilos/logos.mjs [porta=5611] [saída]
import { chromium } from 'playwright';
import fs from 'node:fs';
const porta = process.argv[2] ?? '5611';
const out = process.argv[3] ?? 'scratch/menu-estilos/logos.png';
const exe = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
fs.mkdirSync('scratch/menu-estilos', { recursive: true });
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`http://localhost:${porta}/tools/menu-estilos/logos.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
