// Mede o gate de contagem no laboratório GL e grava scratch/collect.json (o texto do §11 do cartão da L2). Com o vite no ar na porta 5601: node tools/render-harness.collect.mjs
import { chromium } from 'playwright'; import { writeFileSync } from 'node:fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } }); p.setDefaultTimeout(1800000);
await p.goto('http://localhost:5601/tools/render-harness.lab.html'); await p.waitForFunction(() => window.labReady);
const d = await p.evaluate(() => window.lab.collect());
writeFileSync('scratch/collect.json', JSON.stringify(d)); await b.close(); console.log('ok');
