// Perfil de CPU de uma cena do Speed Tchê no Chromium headless: grava um .cpuprofile e lista as funções com mais
// tempo PRÓPRIO. Diz ONDE está o tempo de JavaScript; fps de verdade só no PC do Felipe (aqui o GL é swiftshader).
//
// Uso, com o vite no ar (npm run dev -- --port <porta>):
//   node .claude/skills/achar-gargalo/perfil_da_cena.mjs <porta> "/?bench=1&cenas=copa-2p" [segundos=10] [top=25]
//   node .claude/skills/achar-gargalo/perfil_da_cena.mjs <porta> "/tools/render-harness.html?track=copacabana&seg=70"
// Grava em scratch/perfil-<hora>.cpuprofile (abre no DevTools, aba Performance, ou no speedscope).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [porta, caminho = '/', segArg = '10', topArg = '25'] = process.argv.slice(2);
if (!porta) { console.error('uso: perfil_da_cena.mjs <porta> "<caminho?query>" [segundos] [top]'); process.exit(2); }
mkdirSync('scratch', { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.setDefaultTimeout(240000);
const erros = [];
p.on('pageerror', (e) => erros.push(String(e)));
await p.goto(`http://localhost:${porta}${caminho}`);
await p.waitForTimeout(4000); // carrega e compila shader antes de medir
const cdp = await p.context().newCDPSession(p);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
await p.waitForTimeout(Number(segArg) * 1000);
const { profile } = await cdp.send('Profiler.stop');
await b.close();
const arquivo = `scratch/perfil-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.cpuprofile`;
writeFileSync(arquivo, JSON.stringify(profile));

const porId = new Map(profile.nodes.map((n) => [n.id, n]));
const proprio = new Map();
for (let i = 0; i < profile.samples.length; i++) {
  const cf = porId.get(profile.samples[i]).callFrame;
  const chave = `${cf.functionName || '(anônima)'}  ${cf.url.split('/').slice(-2).join('/') || '(nativo)'}:${cf.lineNumber + 1}`;
  proprio.set(chave, (proprio.get(chave) ?? 0) + (profile.timeDeltas[i] ?? 0));
}
const NATIVO = new Set(['(program)', '(idle)', '(garbage collector)', '(root)']);
const nome = (k) => k.split('  ')[0];
const tempo = (f) => [...proprio.entries()].filter(([k]) => f(nome(k))).reduce((a, [, us]) => a + us, 0);
const js = tempo((n) => !NATIVO.has(n)), programa = tempo((n) => n === '(program)'), gc = tempo((n) => n === '(garbage collector)');
const amostrado = tempo(() => true) || 1;
console.log(`${arquivo}: ${(amostrado / 1e6).toFixed(1)} s amostrados${erros.length ? `; ${erros.length} erro(s) na página: ${erros[0]}` : ''}`);
console.log(`JavaScript ${(js / 1000).toFixed(0)} ms · coletor de lixo ${(gc / 1000).toFixed(0)} ms · (program) ${(programa / 1000).toFixed(0)} ms`);
console.log('No swiftshader o "(program)" é quase todo espera do GL: não conclua nada dele. Abaixo, as funções por tempo próprio, em % do JavaScript.');
for (const [k, us] of [...proprio.entries()].filter(([k]) => !NATIVO.has(nome(k))).sort((a, c) => c[1] - a[1]).slice(0, Number(topArg)))
  console.log(`${((us / (js || 1)) * 100).toFixed(1).padStart(5)} %  ${(us / 1000).toFixed(0).padStart(7)} ms  ${k}`);
