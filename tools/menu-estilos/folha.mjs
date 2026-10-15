// Monta uma folha de telas de menu lado a lado (linhas = telas, colunas = temas) a partir das capturas de 1280×720 de
// tools/menu-estilos/capturar.mjs (<pasta-raw>/<tema>-<tela>.png), e copia as do tema padrão para os nomes de entrega.
// Uso: node tools/menu-estilos/folha.mjs [pasta-raw=scratch/menu-estilos/final-raw] [saída=scratch/menu-estilos/final-folha.png]
//   NC_ME_TEMAS="classico:Clássico (?tema=classico),speedtche:Speed Tchê (padrão)"   NC_ME_TELAS=title,main,...
// A folha da escolha de 14/10 (atual, A, B, C) é: NC_ME_TEMAS="atual:Atual,a:A · Velocidade,b:B · Vidro,c:C · Cartum" e a pasta raw/.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const raw = path.resolve(process.argv[2] ?? 'scratch/menu-estilos/final-raw');
const saida = path.resolve(process.argv[3] ?? 'scratch/menu-estilos/final-folha.png');
const exe = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TEMAS = (process.env.NC_ME_TEMAS ?? 'classico:Clássico (?tema=classico),speedtche:Speed Tchê (padrão)').split(',').map((x) => x.split(':'));
const NOMES = {
  title: 'Título', main: 'Menu principal', free: 'Jogar livre', 'garage-hub': 'Garagem (hub)', garagem: 'Garagem (palco 3D)', dealership: 'Concessionária',
  lobby: 'Lobby', 'lobby-editor': 'Lobby · editor Visual', cups: 'Copas', tracks: 'Pistas', options: 'Opções', access: 'Acessibilidade', controls: 'Controles',
  records: 'Recordes', passport: 'Passaporte', payout: 'Pagamento', results: 'Resultado', pause: 'Pausa', online: 'Online', tutorial: 'Como jogar',
  'assist-offer': 'Oferta de assistência', survey: 'Questionário', credits: 'Créditos',
};
const TELAS = (process.env.NC_ME_TELAS ?? Object.keys(NOMES).join(',')).split(',');

// Entrega: as do tema padrão com os nomes do pedido (V3).
const pasta = path.dirname(saida);
for (const [tela, nome] of [['main', 'final-menu.png'], ['title', 'final-titulo.png'], ['garagem', 'final-garagem.png']]) {
  const src = `${raw}/speedtche-${tela}.png`;
  if (fs.existsSync(src) && path.basename(saida).startsWith('final')) fs.copyFileSync(src, `${pasta}/${nome}`);
}

const W = 560; const H = 315;
const img = (t, s) => (fs.existsSync(`${raw}/${t}-${s}.png`) ? `<img src="file://${raw}/${t}-${s}.png" width="${W}" height="${H}">` : `<div class="vazio" style="width:${W}px;height:${H}px">sem captura</div>`);
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#10131c;color:#e8ecf4;font:600 15px system-ui,sans-serif}
table{border-collapse:separate;border-spacing:8px}
th{font-weight:800;font-size:18px;padding:6px 4px;text-align:center}
td.l{width:120px;text-align:right;vertical-align:middle;font-size:14px;color:#9fb0c6}
img{display:block;border-radius:6px;border:1px solid #2a3042}.vazio{display:flex;align-items:center;justify-content:center;background:#1b2030;color:#667}
</style><table><tr><th></th>${TEMAS.map(([, n]) => `<th>${n}</th>`).join('')}</tr>
${TELAS.map((s) => `<tr><td class="l">${NOMES[s] ?? s}</td>${TEMAS.map(([t]) => `<td>${img(t, s)}</td>`).join('')}</tr>`).join('')}</table>`;
const htmlPath = saida.replace(/\.png$/, '.html');
fs.writeFileSync(htmlPath, html);
const browser = await chromium.launch({ executablePath: exe, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 120 + TEMAS.length * (W + 8) + 40, height: 600 } });
await page.goto(`file://${htmlPath}`);
await page.waitForTimeout(1000);
await page.screenshot({ path: saida, fullPage: true });
await browser.close();
console.log(saida);
