// Monta scratch/menu-estilos/folha-menu-geral.png (linhas = telas, colunas = atual, A, B, C) e copia as capturas de 1280×720 para os nomes
// finais (a-menu.png, a-garagem.png…). Entrada: scratch/menu-estilos/raw/<tema>-<tela>.png (scripts/menu-estilos-capture.mjs).
// Uso: node tools/menu-estilos-folha.mjs [pasta=scratch/menu-estilos]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve(process.argv[2] ?? 'scratch/menu-estilos');
const exe = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TEMAS = [['atual', 'Atual'], ['a', 'A · Velocidade'], ['b', 'B · Vidro'], ['c', 'C · Cartum']];
const TELAS = [['title', 'Título'], ['main', 'Menu principal'], ['garagem', 'Garagem (palco 3D)'], ['cups', 'Copas'], ['tracks', 'Pistas'], ['payout', 'Pagamento'], ['results', 'Resultado'], ['lobby', 'Lobby']];
for (const t of ['a', 'b', 'c']) {
  for (const [from, to] of [['main', 'menu'], ['garagem', 'garagem']]) if (fs.existsSync(`${dir}/raw/${t}-${from}.png`)) fs.copyFileSync(`${dir}/raw/${t}-${from}.png`, `${dir}/${t}-${to}.png`);
}
const W = 480; const H = 270;
const img = (t, s) => (fs.existsSync(`${dir}/raw/${t}-${s}.png`) ? `<img src="file://${dir}/raw/${t}-${s}.png" width="${W}" height="${H}">` : `<div class="vazio" style="width:${W}px;height:${H}px">sem captura</div>`);
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#10131c;color:#e8ecf4;font:600 15px system-ui,sans-serif}
table{border-collapse:separate;border-spacing:8px}
th{font-weight:800;font-size:18px;padding:6px 4px;text-align:center}
td.l{width:110px;text-align:right;vertical-align:middle;font-size:14px;color:#9fb0c6}
img{display:block;border-radius:6px;border:1px solid #2a3042}.vazio{display:flex;align-items:center;justify-content:center;background:#1b2030;color:#667}
</style><table><tr><th></th>${TEMAS.map(([, n]) => `<th>${n}</th>`).join('')}</tr>
${TELAS.map(([s, n]) => `<tr><td class="l">${n}</td>${TEMAS.map(([t]) => `<td>${img(t, s)}</td>`).join('')}</tr>`).join('')}</table>`;
fs.writeFileSync(`${dir}/folha.html`, html);
const browser = await chromium.launch({ executablePath: exe, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 110 + 4 * (W + 8) + 40, height: 600 } });
await page.goto(`file://${dir}/folha.html`);
await page.waitForTimeout(800);
await page.screenshot({ path: `${dir}/folha-menu-geral.png`, fullPage: true });
await browser.close();
console.log('folha-menu-geral.png');
