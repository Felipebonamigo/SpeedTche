// Arquivos do jogo dentro do userData do Electron: os saves (espelho do localStorage, para o Steam
// Auto-Cloud sincronizar arquivos de verdade em vez do LevelDB do Chromium), o log de erros e o resultado do banco de
// prova (`bench/`, nunca em `saves/`, que é o que o Steam sincroniza).
// Não depende do Electron: main.cjs passa as pastas, e tests/desktop-storage.test.ts usa uma pasta temporária.
// Tudo síncrono de propósito: arquivos pequenos, e uma gravação termina antes de o próximo IPC (ex.: "sair")
// ser atendido — um app.quit() nunca corta um save pela metade.
const fs = require('node:fs');
const path = require('node:path');

/** `speed-tche.<nome>` (ex.: speed-tche.save, speed-tche.settings): só letras, números, `_`, `-` e pontos entre eles. */
const KEY_RE = /^speed-tche\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
const MAX_KEY_LENGTH = 80;
/** Um save maior que isto é lixo ou ataque; o progresso real tem poucos KB. */
const MAX_SAVE_BYTES = 1024 * 1024;
/** Log de erros: passou disto, o atual vira errors.1.log (o anterior é descartado). Máximo em disco ≈ 2×. */
const LOG_MAX_BYTES = 512 * 1024;
/** Uma entrada de log nunca passa disto (pilhas enormes são cortadas). */
const LOG_ENTRY_MAX_CHARS = 16 * 1024;

function isSaveKey(key) {
  return typeof key === 'string' && key.length <= MAX_KEY_LENGTH && KEY_RE.test(key);
}

/**
 * Lê `<dir>/<chave>.json` de todas as chaves válidas: { chave: texto JSON }. Pasta ausente = {}.
 * Arquivo que existe mas não deu para ler (permissão, erro de disco, pasta com nome de save) vem como `null` —
 * "não sei o que tem", e a inicialização não grava por cima dele. Arquivo que sumiu entre a listagem e a
 * leitura fica de fora (não há arquivo); maior que MAX_SAVE_BYTES também (é lixo, pode ser substituído).
 */
function readAllSaves(dir) {
  const out = {};
  let names;
  try { names = fs.readdirSync(dir); } catch { return out; }
  names = migrateLegacySaveFiles(dir, names);
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const key = name.slice(0, -'.json'.length);
    if (!isSaveKey(key)) continue;
    const file = path.join(dir, name);
    try {
      const st = fs.statSync(file);
      if (!st.isFile()) { out[key] = null; continue; }
      if (st.size > MAX_SAVE_BYTES) continue;
      out[key] = fs.readFileSync(file, 'utf8');
    } catch (e) {
      if (!e || e.code !== 'ENOENT') out[key] = null;
    }
  }
  return out;
}

/**
 * O jogo se chamava Nitro Crew (10/10/2026: Speed Tchê). Os saves eram `nitro-crew.<nome>.json`; renomeia cada um para
 * `speed-tche.<nome>.json`, a não ser que o novo já exista (esse ganha, e o antigo é apagado). Devolve a listagem atual.
 */
function migrateLegacySaveFiles(dir, names) {
  const LEGACY = 'nitro-crew.';
  let changed = false;
  for (const name of names) {
    if (!name.startsWith(LEGACY) || !name.endsWith('.json')) continue;
    const fresh = `speed-tche.${name.slice(LEGACY.length)}`;
    try {
      if (fs.existsSync(path.join(dir, fresh))) fs.rmSync(path.join(dir, name), { force: true });
      else fs.renameSync(path.join(dir, name), path.join(dir, fresh));
      changed = true;
    } catch { /* fica como está; a próxima abertura tenta de novo */ }
  }
  if (!changed) return names;
  try { return fs.readdirSync(dir); } catch { return names; }
}

/**
 * Move `<appData>/<legacyName>` para `<appData>/<newName>` (o userData do Electron: saves, logs e o localStorage do
 * Chromium) na primeira abertura depois da troca de nome. 'moved' = moveu; 'kept' = as duas existem, não mexe em nada;
 * 'none' = não havia pasta antiga.
 */
function migrateLegacyUserData(appData, legacyName, newName) {
  const from = path.join(appData, legacyName);
  const to = path.join(appData, newName);
  if (!fs.existsSync(from)) return 'none';
  if (fs.existsSync(to)) return 'kept';
  try { fs.renameSync(from, to); return 'moved'; } catch { return 'kept'; }
}

/**
 * Grava `<dir>/<chave>.json` de forma atômica (arquivo temporário + rename): um corte de energia deixa o
 * save antigo ou o novo, nunca meio arquivo. Recusa chave inválida e texto que não é JSON — nunca grava
 * lixo por cima de um save bom. Devolve falso em qualquer falha.
 */
function writeSave(dir, key, json) {
  if (!isSaveKey(key) || typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > MAX_SAVE_BYTES) return false;
  try { JSON.parse(json); } catch { return false; }
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${key}.json`);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

/** Quantos backups de versão ficam em `saves/backup/` (o mais antigo sai quando entra o quarto). */
const BACKUP_KEEP = 3;
const VERSION_MARKER = '.versao';
const UNKNOWN_VERSION = 'desconhecida';

/** Nome de pasta seguro a partir do texto do marcador (que é arquivo do usuário: pode ter lixo). */
function backupFolderName(text) {
  const v = String(text ?? '').trim().slice(0, 40).replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_');
  return v || UNKNOWN_VERSION;
}

/**
 * A2: na primeira abertura depois de mudar de versão, copia `<dir>/*.json` para `<dir>/backup/<versão anterior>/` ANTES de qualquer
 * leitura ou gravação da nova versão. Quem voltar a uma versão antiga (que descarta o que não conhece ao regravar) acha a cópia.
 * A versão da última abertura fica em `<dir>/.versao`. Sem marcador: só faz backup (como "desconhecida") se já houver `*.json`.
 * `backup/` não termina em `.json` e é subpasta: o Auto-Cloud (`*.json`, sem recursão) e `readAllSaves` não a enxergam.
 * Nunca lança. Cada arquivo é copiado para uma pasta temporária que só vira `backup/<versão>` por rename; guarda os
 * BACKUP_KEEP mais recentes e só apaga dentro de `backup/`. Falha: `onError({ from, to, files, failed, error })` (nomes e códigos de
 * erro, nunca conteúdo) e o marcador NÃO avança, para tentar de novo na próxima abertura. Devolve 'none' | 'backed-up' | 'failed'.
 */
function backupSavesOnVersionChange(dir, version, onError = () => {}) {
  const current = String(version ?? '').trim();
  if (!current) return 'none';
  const report = (info) => { try { onError(info); } catch { /* o log nunca derruba a abertura */ } };
  let previous = null;
  try { previous = fs.readFileSync(path.join(dir, VERSION_MARKER), 'utf8').trim() || null; } catch { previous = null; }
  if (previous === current) return 'none';
  let result = 'none';
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => { try { return n.endsWith('.json') && fs.statSync(path.join(dir, n)).isFile(); } catch { return false; } }); } catch { names = []; }
  if (names.length > 0) {
    const from = backupFolderName(previous ?? UNKNOWN_VERSION);
    const root = path.join(dir, 'backup');
    const failed = [];
    let error = '';
    try {
      fs.mkdirSync(root, { recursive: true });
      for (const n of fs.readdirSync(root)) if (n.startsWith('.parcial-')) fs.rmSync(path.join(root, n), { recursive: true, force: true });
      const tmp = path.join(root, `.parcial-${process.pid}-${Date.now()}`);
      fs.mkdirSync(tmp);
      for (const n of names) {
        try { fs.copyFileSync(path.join(dir, n), path.join(tmp, n)); } catch (e) { failed.push(n.slice(0, -'.json'.length).slice(0, MAX_KEY_LENGTH)); error = (e && e.code) || 'erro'; }
      }
      const dest = path.join(root, from);
      fs.rmSync(dest, { recursive: true, force: true });
      fs.renameSync(tmp, dest);
      // Ordem de "mais recente" = mtime da pasta; garante que a nova seja estritamente a mais nova mesmo no mesmo milissegundo.
      let newest = 0;
      const others = fs.readdirSync(root).filter((n) => n !== from && !n.startsWith('.'));
      for (const n of others) { try { newest = Math.max(newest, fs.statSync(path.join(root, n)).mtimeMs); } catch { /* sumiu */ } }
      const t = new Date(Math.max(Date.now(), newest + 1));
      fs.utimesSync(dest, t, t);
      const kept = others.map((n) => ({ n, m: fs.statSync(path.join(root, n)).mtimeMs })).concat([{ n: from, m: t.getTime() }]).sort((a, b) => b.m - a.m);
      for (const old of kept.slice(BACKUP_KEEP)) fs.rmSync(path.join(root, old.n), { recursive: true, force: true });
      result = 'backed-up';
    } catch (e) {
      failed.push('(pasta)');
      error = (e && e.code) || 'erro';
      result = 'failed';
    }
    if (failed.length > 0) { result = 'failed'; report({ from, to: current, files: names.length, failed, error }); }
  }
  if (result === 'failed') return result;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, VERSION_MARKER), current, 'utf8');
  } catch (e) {
    report({ from: previous, to: current, files: 0, failed: [VERSION_MARKER], error: (e && e.code) || 'erro' });
  }
  return result;
}

/** Acrescenta `text` a `<dir>/errors.log`, girando para errors.1.log quando passaria de `maxBytes`. */
function appendLog(dir, text, maxBytes = LOG_MAX_BYTES) {
  if (typeof text !== 'string' || text.length === 0) return false;
  const chunk = text.length > LOG_ENTRY_MAX_CHARS ? `${text.slice(0, LOG_ENTRY_MAX_CHARS)}…\n` : text;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'errors.log');
    let size = 0;
    try { size = fs.statSync(file).size; } catch { size = 0; }
    if (size > 0 && size + Buffer.byteLength(chunk, 'utf8') > maxBytes) fs.renameSync(file, path.join(dir, 'errors.1.log'));
    fs.appendFileSync(file, chunk, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/** Chaves do banco de prova que passam da linha de comando para a página (o resto é ignorado). `res` é o tamanho de desenho do Ultra. */
const BENCH_KEYS = ['frames', 'warm', 'cenas', 'q', 'res', 'sair'];
// atalho: mora aqui para não criar um .cjs novo (exigiria desktop/package.json e check-package.mjs)
/** `--bench` ou `--bench=<query>` no argv → a query da página ({ bench:'1', uncapped:'1', … }); sem isso, null. */
function benchQuery(argv) {
  if (!Array.isArray(argv)) return null;
  const arg = argv.find((a) => a === '--bench' || (typeof a === 'string' && a.startsWith('--bench=')));
  if (!arg) return null;
  const out = { bench: '1', uncapped: '1' };
  const params = new URLSearchParams(arg === '--bench' ? '' : arg.slice('--bench='.length));
  for (const k of BENCH_KEYS) { const v = params.get(k); if (v !== null) out[k] = v; }
  return out;
}

/** Grava o resultado em `<dir>/bench-AAAAMMDD-HHMMSS[-N].json` (hora local de `now`), sem sobrescrever; null se falhou. */
function writeBench(dir, json, now = new Date()) {
  if (typeof dir !== 'string' || !dir || typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > MAX_SAVE_BYTES) return null;
  try { JSON.parse(json); } catch { return null; }
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 1; i < 1000; i++) {
      const file = path.join(dir, i === 1 ? `bench-${stamp}.json` : `bench-${stamp}-${i}.json`);
      try { fs.writeFileSync(file, json, { encoding: 'utf8', flag: 'wx' }); return file; } catch (e) { if (!e || e.code !== 'EEXIST') return null; }
    }
  } catch { /* cai no null */ }
  return null;
}

/** Só estas pastas do userData podem ser abertas pela página — nunca um caminho vindo dela. */
const FOLDERS = ['saves', 'logs', 'bench'];
function folderFor(userData, kind) {
  if (typeof userData !== 'string' || !userData || typeof kind !== 'string' || !FOLDERS.includes(kind)) return null;
  return path.join(userData, kind);
}

module.exports = { isSaveKey, readAllSaves, migrateLegacyUserData, writeSave, backupSavesOnVersionChange, appendLog, benchQuery, writeBench, folderFor, LOG_MAX_BYTES, MAX_SAVE_BYTES, LOG_ENTRY_MAX_CHARS };
