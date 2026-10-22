// V21: junta imagens numa grade (colunas = COLS, padrão 2) com a legenda de cada uma: node tools/acabamento-juntar.mjs <saida.png|jpg> <rotulo=arquivo> ...   (env: W=largura de cada célula, padrão 640)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [saida, ...itens] = process.argv.slice(2);
const W = Number(process.env.W ?? 640); const cols = Number(process.env.COLS ?? 2);
const cell = (it) => { const i = it.indexOf('='); const rot = it.slice(0, i); const f = resolve(it.slice(i + 1)); return `<div style="margin:2px"><div style="font:12px sans-serif;color:#eee;padding:2px">${rot}</div><img src="data:image/png;base64,${readFileSync(f).toString('base64')}" style="width:${W}px;display:block"></div>`; };
const html = `<body style="margin:0;background:#111"><div style="display:flex;flex-wrap:wrap;width:${cols * (W + 4)}px">${itens.map(cell).join('')}</div></body>`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: cols * (W + 4), height: 300 } });
await p.setContent(html); await p.waitForTimeout(400);
await p.screenshot({ path: resolve(saida), fullPage: true, type: saida.endsWith('.jpg') ? 'jpeg' : 'png', ...(saida.endsWith('.jpg') ? { quality: 88 } : {}) });
await b.close(); console.log('ok', saida);
