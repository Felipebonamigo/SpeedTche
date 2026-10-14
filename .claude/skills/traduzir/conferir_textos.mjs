// Confere os textos do Speed Tchê além do que o tests/i18n.test.ts cobra: texto vazio, inglês igual ao
// português, {parâmetro} que existe num idioma e não no outro, e chave usada no código com t('ns.chave')
// que não existe em nenhum strings.ts. Não muda nada no jogo.
//
// Uso, na raiz do repositório:
//   node .claude/skills/traduzir/conferir_textos.mjs             # tudo
//   node .claude/skills/traduzir/conferir_textos.mjs --ns ui     # um namespace
//   node .claude/skills/traduzir/conferir_textos.mjs --iguais    # lista também os textos iguais em PT e EN
// Sai com 1 se achou problema fora das exceções abaixo. Texto igual nos dois idiomas só é contado: quase sempre é
// nome próprio (estado, pista, cidade); olhe a lista com --iguais quando mexer num namespace de interface.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const raiz = process.cwd();
// Expõe a tabela interna do src/i18n/index.ts sem mexer no arquivo: acrescenta uma linha ao módulo carregado.
register('data:text/javascript,' + encodeURIComponent(`
export async function load(url, ctx, next) {
  const r = await next(url, ctx);
  if (url.endsWith('/src/i18n/index.ts')) {
    const src = typeof r.source === 'string' ? r.source : new TextDecoder().decode(r.source);
    return { ...r, source: src + '\\nglobalThis.__tabelasDeTexto = tables;\\n' };
  }
  return r;
}`), pathToFileURL('./'));
const { register: registraTsx } = await import(pathToFileURL(join(raiz, 'node_modules/tsx/dist/esm/api/index.mjs')).href);
registraTsx();

function arquivos(pasta, filtro, saida = []) {
  for (const nome of readdirSync(pasta)) {
    const c = join(pasta, nome);
    if (statSync(c).isDirectory()) { if (nome !== 'node_modules') arquivos(c, filtro, saida); }
    else if (filtro(c)) saida.push(c);
  }
  return saida;
}

await import(pathToFileURL(join(raiz, 'src/i18n/index.ts')).href);
await import(pathToFileURL(join(raiz, 'src/i18n/core.ts')).href);
for (const f of arquivos(join(raiz, 'src'), (c) => c.endsWith('/strings.ts'))) await import(pathToFileURL(f).href);
const tabelas = globalThis.__tabelasDeTexto;
if (!tabelas) { console.error('Não consegui ler a tabela de textos (mudou o src/i18n/index.ts?).'); process.exit(2); }

const arg = process.argv.indexOf('--ns');
const soNs = arg > 0 ? process.argv[arg + 1] : null;
const listarIguais = process.argv.includes('--iguais');
// Parâmetros diferentes de propósito. Acrescente aqui com o motivo.
const PARAMETROS_DE_PROPOSITO = {
  'hud.ordinal': 'o inglês põe o sufixo do ordinal ({s}: st, nd, rd, th)',
  'rivals.ordinal': 'o inglês põe o sufixo do ordinal ({s}: st, nd, rd, th)',
  'passport.postcard.from': 'a preposição do português (de, do, da) não existe em inglês',
};
const params = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const problemas = [], iguais = [];
for (const ns of Object.keys(tabelas.pt)) {
  if (soNs && ns !== soNs) continue;
  const pt = tabelas.pt[ns] ?? {}, en = tabelas.en[ns] ?? {};
  for (const k of Object.keys(pt)) {
    const a = pt[k], b = en[k];
    if (b === undefined) { problemas.push(`falta EN      ${ns}.${k}`); continue; }
    if (!a.trim()) problemas.push(`PT vazio      ${ns}.${k}`);
    if (!b.trim()) problemas.push(`EN vazio      ${ns}.${k}`);
    if (params(a) !== params(b) && !PARAMETROS_DE_PROPOSITO[`${ns}.${k}`]) problemas.push(`parâmetros    ${ns}.${k}  PT {${params(a)}}  EN {${params(b)}}`);
    if (a === b && /\p{L}{3}/u.test(a.replace(/\{\w+\}/g, ''))) iguais.push(`EN igual PT   ${ns}.${k}  "${a.slice(0, 60)}"`);
  }
}
// Chaves literais usadas no código que não existem.
const conhecidas = new Set(Object.keys(tabelas.pt).flatMap((ns) => Object.keys(tabelas.pt[ns]).map((k) => `${ns}.${k}`)));
for (const f of arquivos(join(raiz, 'src'), (c) => /\.(ts|tsx)$/.test(c) && !c.endsWith('strings.ts') && !c.includes('/src/i18n/'))) {
  const texto = readFileSync(f, 'utf8');
  for (const m of texto.matchAll(/\bt\(\s*'([a-z][\w-]*\.[\w.-]+)'/g)) {
    if (soNs && !m[1].startsWith(soNs + '.')) continue;
    if (!m[1].endsWith('.') && !conhecidas.has(m[1])) problemas.push(`chave nova?   ${m[1]}  (${relative(raiz, f)})`);
  }
}
for (const p of problemas) console.log(p);
if (listarIguais) for (const p of iguais) console.log(p);
console.log(`\n${Object.keys(tabelas.pt).length} namespaces, ${conhecidas.size} chaves: ${problemas.length} problema(s); ${iguais.length} texto(s) igual(is) em PT e EN${listarIguais ? '' : ' (veja com --iguais)'}.`);
process.exit(problemas.length ? 1 : 0);
