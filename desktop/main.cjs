// Processo principal do Electron: janela do jogo, tela cheia, arquivos e integração opcional com Steamworks.
// O jogo em si é a pasta ../dist (Vite). Gamepads: nada a fazer aqui — a Gamepad API funciona no Chromium.
const { app, BrowserWindow, ipcMain, shell, dialog, clipboard, protocol } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const storage = require('./storage.cjs');
const assets = require('./assets.cjs');

// ───────────────────────────── Pasta de dados (Steam Cloud) ─────────────────────────────
// Fixa o userData em "<appData>/SpeedTche" — %APPDATA%\SpeedTche no Windows, ~/.config/SpeedTche no Linux,
// ~/Library/Application Support/SpeedTche no macOS —, em desenvolvimento (`npm start`) e no pacote. Sem isto
// o nome vinha do package.json ("speed-tche-desktop"). O Steam Auto-Cloud aponta para `saves/` desta pasta
// (desktop/README.md): mudar o nome aqui perde o save de quem já joga. Tem que vir antes da trava de
// instância única, que também mora no userData.
const USER_DATA_DIR_NAME = 'SpeedTche';
// Quem jogou a 0.1.0 (Nitro Crew) tem a pasta antiga: move para a nova antes de qualquer coisa ler o userData.
storage.migrateLegacyUserData(app.getPath('appData'), 'Nitro Crew', USER_DATA_DIR_NAME);
app.setPath('userData', path.join(app.getPath('appData'), USER_DATA_DIR_NAME));
const savesDir = () => path.join(app.getPath('userData'), 'saves');
const logsDir = () => path.join(app.getPath('userData'), 'logs');

// A2: na 1ª abertura depois de mudar de versão, copia saves/*.json para saves/backup/<versão anterior>/ (docs/ondas/A2-backup.md).
// Tem que ser antes de qualquer leitura ou gravação desta versão; nunca lança (falha = uma linha no errors.log e o jogo abre).
try {
  storage.backupSavesOnVersionChange(savesDir(), app.getVersion(), (info) => logProcessEvent('backup-failed', info));
} catch { /* nunca derruba a abertura */ }

// Banco de prova (--bench, docs/DESEMPENHO.md §4): sem teto de quadros, para medir a folga. Switch só vale antes do `ready`.
const bench = storage.benchQuery(process.argv);
if (bench) {
  app.commandLine.appendSwitch('disable-frame-rate-limit');
  app.commandLine.appendSwitch('disable-gpu-vsync');
}

/** Linha do log de erros para o que acontece fora da página (processo do jogo ou da GPU que caiu). */
function logProcessEvent(kind, details) {
  storage.appendLog(logsDir(), `[${new Date().toISOString()}] ${kind} ${JSON.stringify(details)}\n`);
}

// ───────────────────────────── Arquivos do jogo por protocolo próprio ─────────────────────────────
// O jogo abre por file:// e o `fetch` de file: não funciona: os .glb dos carros (src/assets/cars/) chegam pelo esquema
// `speedtche-asset://app/assets/<arquivo>.glb` (assets.cjs: só assets/*.glb sob a raiz do jogo). O esquema privilegiado tem de
// ser registrado antes do `ready`; o handler entra no `ready`. Mesmo caminho do `loadFile` abaixo.
const GAME_ROOT = path.join(__dirname, app.isPackaged ? 'app' : '../dist');
protocol.registerSchemesAsPrivileged([assets.privilegedScheme]);

// ───────────────────────────── Instância única ─────────────────────────────
// Um segundo clique no atalho só traz a janela existente para a frente (a Steam também abre o jogo assim).
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (!w) return;
    if (w.isMinimized()) w.restore();
    w.focus();
  });
}

// ───────────────────────────── Steam (opcional) ─────────────────────────────
let sw = null;    // módulo steamworks.js
let steam = null; // cliente iniciado (null fora da Steam ou sem o pacote instalado)
try {
  // Precisa do steam_appid.txt ao lado do executável em desenvolvimento e do cliente Steam aberto.
  sw = require('steamworks.js');
  // O overlay (Shift+Tab) exige switches de linha de comando: tem que ser antes do `ready`.
  // `true` desliga o repintor por quadro — o jogo já desenha 60 vezes por segundo sozinho.
  if (typeof sw.electronEnableSteamOverlay === 'function') sw.electronEnableSteamOverlay(true);
} catch (e) {
  console.log('Steamworks indisponível (pacote não instalado):', e.message);
}

function initSteam() {
  if (!sw) return;
  try {
    steam = sw.init();
    console.log('Steam:', steam.localplayer.getName());
  } catch (e) {
    steam = null;
    console.log('Steamworks indisponível (rodando fora da Steam):', e.message);
  }
}

/** Rich Presence: a chave `status` é o texto que aparece na lista de amigos ("Correndo em Copacabana"). */
function setRichPresence(text) {
  if (!steam || typeof steam.localplayer.setRichPresence !== 'function') return;
  try { steam.localplayer.setRichPresence('status', text ? String(text) : null); } catch { /* ignorado */ }
}

// ───────────────────────────── Janela ─────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 640,
    title: 'Speed Tchê', backgroundColor: '#000', autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: !bench },
  });
  win.once('ready-to-show', () => { win.show(); if (bench) win.setFullScreen(true); });   // tela cheia é decidida pelo jogo (opções salvas); no bench, sempre
  win.loadFile(path.join(GAME_ROOT, 'index.html'), bench ? { query: bench } : undefined);

  // Links externos abrem no navegador do sistema; a janela do jogo nunca navega para fora do próprio HTML.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });

  // F11 alterna tela cheia (o menu está oculto, então o atalho é tratado aqui, antes de chegar à página).
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
  });
  win.on('enter-full-screen', () => win.webContents.send('fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('fullscreen', false));

  // A página caiu (falta de memória, driver de vídeo): registra e recarrega uma vez, para o jogador voltar à
  // tela de título em vez de ficar olhando uma janela preta. Duas quedas em 30 s: não insiste (fica o log).
  let lastReload = 0;
  win.webContents.on('render-process-gone', (_e, details) => {
    logProcessEvent('render-process-gone', details);
    if (details.reason === 'clean-exit' || Date.now() - lastReload < 30_000) return;
    lastReload = Date.now();
    win.webContents.reload();
  });
  return win;
}

// ───────────────────────────── IPC (mesmos nomes do preload.cjs) ─────────────────────────────
ipcMain.handle('window:toggleFullscreen', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setFullScreen(!w.isFullScreen()); });
ipcMain.handle('window:setFullscreen', (e, v) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setFullScreen(!!v); });
ipcMain.handle('window:isFullscreen', (e) => { const w = BrowserWindow.fromWebContents(e.sender); return w ? w.isFullScreen() : false; });
ipcMain.handle('window:quit', () => app.quit());

ipcMain.handle('steam:name', () => { try { return steam ? steam.localplayer.getName() : null; } catch { return null; } });
ipcMain.handle('steam:achievement', (_e, id) => {
  if (!steam || typeof id !== 'string' || !id) return false;
  // O5: o jogo reenvia ao abrir toda conquista guardada; a que a Steam já tem não é regravada (cada `activate` chama o StoreStats).
  // A1: a consulta tem o próprio try — se ela lançar (estatísticas da Steam ainda não chegaram), a conquista ainda é ativada.
  try { if (typeof steam.achievement.isActivated === 'function' && steam.achievement.isActivated(id)) return true; } catch { /* segue para a ativação */ }
  try { return steam.achievement.activate(id) !== false; } catch { /* ignorado */ }
  return false;
});
// O5: idioma da 1ª abertura (src/game/settings.ts: languageCandidates) — o do jogo na Steam ('brazilian', 'english'…) e o do sistema ('pt-BR'…).
// `apps.currentGameLanguage` pode não existir numa versão do steamworks.js: a página segue para o próximo candidato.
ipcMain.handle('app:locale', () => {
  let steamLang = null;
  try { if (steam && steam.apps && typeof steam.apps.currentGameLanguage === 'function') steamLang = steam.apps.currentGameLanguage() || null; } catch { steamLang = null; }
  let appLocale = null;
  try { appLocale = app.getLocale() || null; } catch { appLocale = null; }
  return { steam: typeof steamLang === 'string' ? steamLang : null, app: typeof appLocale === 'string' ? appLocale : null };
});
ipcMain.handle('steam:richPresence', (_e, text) => { setRichPresence(text); });

// Arquivos: o jogo grava/lê progresso ou replays em `.tche.json` na pasta Documentos (diálogo do sistema).
ipcMain.handle('file:save', async (e, name, content) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const base = path.basename(typeof name === 'string' && name ? name : 'speed-tche');
  const file = base.endsWith('.tche.json') ? base : `${base}.tche.json`;
  const r = await dialog.showSaveDialog(w, {
    defaultPath: path.join(app.getPath('documents'), file),
    filters: [{ name: 'Speed Tchê', extensions: ['tche.json', 'nitro.json', 'json'] }],
  });
  if (r.canceled || !r.filePath) return false;
  await fs.writeFile(r.filePath, String(content ?? ''), 'utf8');
  return true;
});
ipcMain.handle('file:open', async (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(w, { properties: ['openFile'], filters: [{ name: 'Speed Tchê', extensions: ['tche.json', 'nitro.json', 'json'] }] });
  if (r.canceled || r.filePaths.length === 0) return null;
  return fs.readFile(r.filePaths[0], 'utf8');
});

// Saves espelhados em arquivo (Steam Auto-Cloud) e log de erros — ver storage.cjs e src/game/cloudsave.ts.
// A1: arquivo que não leu / não gravou deixa uma linha no errors.log. Antes a recusa só voltava como `false`/`null` para a página, que a trata
// (a chave fica pendente) mas não a mostra: um disco que recusa o save em silêncio é um Steam Cloud que não sincroniza, e ninguém ficava sabendo.
ipcMain.handle('store:readAll', () => {
  const all = storage.readAllSaves(savesDir());
  const unreadable = Object.keys(all).filter((k) => all[k] === null);
  if (unreadable.length > 0) logProcessEvent('store-read-failed', { keys: unreadable });
  return all;
});
ipcMain.handle('store:write', (_e, key, json) => {
  const ok = storage.writeSave(savesDir(), key, json);
  if (!ok) logProcessEvent('store-write-failed', { key: typeof key === 'string' ? key.slice(0, 80) : typeof key, bytes: typeof json === 'string' ? Buffer.byteLength(json, 'utf8') : null });
  return ok;
});
ipcMain.handle('log:append', (_e, text) => storage.appendLog(logsDir(), text));
// O preload roda em sandbox, onde o módulo `clipboard` não existe: a cópia do relatório passa por aqui.
ipcMain.handle('clipboard:write', (_e, text) => {
  if (typeof text !== 'string') return false;
  try { clipboard.writeText(text.slice(0, storage.MAX_SAVE_BYTES)); return true; } catch { return false; }
});
// Banco de prova e "Abrir pasta": a página só escolhe pelo nome (saves, logs, bench); o caminho sai daqui (storage.folderFor).
ipcMain.handle('bench:write', (_e, json) => storage.writeBench(storage.folderFor(app.getPath('userData'), 'bench'), json));
ipcMain.handle('folder:open', async (_e, kind) => {
  const dir = storage.folderFor(app.getPath('userData'), kind);
  if (!dir) return false;
  try { await fs.mkdir(dir, { recursive: true }); return (await shell.openPath(dir)) === ''; } catch { return false; }
});

// Processo da GPU caiu (driver): o Chromium tenta de novo sozinho; fica registrado para o relatório.
app.on('child-process-gone', (_e, details) => { if (details.type === 'GPU') logProcessEvent('gpu-process-gone', details); });

// ───────────────────────────── Ciclo de vida ─────────────────────────────
app.whenReady().then(() => {
  protocol.handle(assets.SCHEME, (req) => assets.serveAsset(GAME_ROOT, req.url));
  initSteam();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => setRichPresence(null));
