// A1 (docs/ondas/A1-auditoria-save.md, achados 4a e 4b): o main.cjs RODA aqui de verdade, com o `electron` e o `steamworks.js` falsos, e os
// handlers de IPC são chamados como a página os chama. Até a A1 só havia teste de TEXTO sobre ele (regex em desktop-storage.test.ts).
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nodeRequire = createRequire(import.meta.url);
const fs = nodeRequire('node:fs') as typeof import('node:fs'); // o mesmo objeto que o storage.cjs usa (o namespace ESM não aceita spy)
const DESKTOP = join(__dirname, '..', 'desktop');

type Handler = (event: unknown, ...args: unknown[]) => unknown;

interface FakeSteam {
  localplayer: { getName(): string };
  achievement: { isActivated?: (id: string) => boolean; activate: (id: string) => boolean };
  apps?: { currentGameLanguage?: () => string };
}

/** Carrega o main.cjs com um `electron` falso (userData numa pasta temporária) e devolve os handlers registrados. */
async function loadMain(appData: string, steam: FakeSteam | null, version = '0.1.8'): Promise<Map<string, Handler>> {
  const handlers = new Map<string, Handler>();
  const paths: Record<string, string> = {};
  class FakeWindow {
    webContents = { setWindowOpenHandler() { /* nada */ }, on() { /* nada */ }, reload() { /* nada */ }, send() { /* nada */ } };
    once() { /* nada */ }
    on() { /* nada */ }
    loadFile() { return Promise.resolve(); }
    static getAllWindows() { return []; }
    static fromWebContents() { return null; }
  }
  const electron = {
    app: {
      getPath: (n: string) => paths[n] ?? (n === 'appData' ? appData : join(appData, n)),
      setPath: (n: string, p: string) => { paths[n] = p; },
      requestSingleInstanceLock: () => true, quit() { /* nada */ }, on() { /* nada */ }, isPackaged: false, getLocale: () => 'pt-BR', getVersion: () => version,
      whenReady: () => Promise.resolve(), commandLine: { appendSwitch() { /* nada */ } },
    },
    BrowserWindow: FakeWindow,
    ipcMain: { handle: (channel: string, fn: Handler) => { handlers.set(channel, fn); } },
    shell: {}, dialog: {}, clipboard: {},
    protocol: { registerSchemesAsPrivileged() { /* nada */ }, handle() { /* nada */ } },
  };
  const fakeRequire = (name: string): unknown => {
    if (name === 'electron') return electron;
    if (name === 'steamworks.js') {
      if (!steam) throw new Error('pacote não instalado');
      return { init: () => steam, electronEnableSteamOverlay() { /* nada */ } };
    }
    if (name.startsWith('./')) return nodeRequire(join(DESKTOP, name));
    return nodeRequire(name);
  };
  const source = readFileSync(join(DESKTOP, 'main.cjs'), 'utf8');
  const quiet = { ...console, log() { /* o main.cjs avisa da Steam */ } };
  new Function('require', '__dirname', 'process', 'console', source)(fakeRequire, DESKTOP, process, quiet);
  await Promise.resolve(); await Promise.resolve(); // app.whenReady().then(...): initSteam()
  return handlers;
}

const invoke = async (h: Map<string, Handler>, channel: string, ...args: unknown[]) => {
  const fn = h.get(channel);
  if (!fn) throw new Error(`sem handler ${channel}`);
  return fn({}, ...args);
};

let appData: string;
beforeEach(() => { appData = mkdtempSync(join(tmpdir(), 'nc-main-')); });
afterEach(() => { rmSync(appData, { recursive: true, force: true }); });

const savesDir = () => join(appData, 'SpeedTche', 'saves');
const errorsLog = () => {
  const f = join(appData, 'SpeedTche', 'logs', 'errors.log');
  return existsSync(f) ? readFileSync(f, 'utf8') : '';
};

describe('main.cjs: steam:achievement (o reenvio de toda conquista ao abrir, O5)', () => {
  const steamWith = (a: FakeSteam['achievement']): FakeSteam => ({ localplayer: { getName: () => 'Fulano' }, achievement: a });

  it('a que a Steam já tem não é regravada (cada activate chama o StoreStats); devolve verdadeiro', async () => {
    const activate = vi.fn(() => true);
    const h = await loadMain(appData, steamWith({ isActivated: () => true, activate }));
    expect(await invoke(h, 'steam:achievement', 'DEZ_VITORIAS')).toBe(true);
    expect(activate).not.toHaveBeenCalled();
  });

  it('a que a Steam não tem é ativada', async () => {
    const activate = vi.fn(() => true);
    const h = await loadMain(appData, steamWith({ isActivated: () => false, activate }));
    expect(await invoke(h, 'steam:achievement', 'DEZ_VITORIAS')).toBe(true);
    expect(activate).toHaveBeenCalledWith('DEZ_VITORIAS');
  });

  it('ponte sem isActivated (steamworks.js antigo): ativa direto', async () => {
    const activate = vi.fn(() => true);
    const h = await loadMain(appData, steamWith({ activate }));
    expect(await invoke(h, 'steam:achievement', 'DEZ_VITORIAS')).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('isActivated que LANÇA não engole a conquista: a ativação ainda é tentada', async () => {
    const activate = vi.fn(() => true);
    const h = await loadMain(appData, steamWith({ isActivated: () => { throw new Error('estatísticas ainda não chegaram'); }, activate }));
    expect(await invoke(h, 'steam:achievement', 'DEZ_VITORIAS')).toBe(true);
    expect(activate).toHaveBeenCalledWith('DEZ_VITORIAS');
  });

  it('sem Steam, id vazio ou que não é texto: falso, sem lançar', async () => {
    const off = await loadMain(appData, null);
    expect(await invoke(off, 'steam:achievement', 'DEZ_VITORIAS')).toBe(false);
    const on = await loadMain(appData, steamWith({ isActivated: () => false, activate: () => true }));
    expect(await invoke(on, 'steam:achievement', '')).toBe(false);
    expect(await invoke(on, 'steam:achievement', 42)).toBe(false);
  });
});

describe('main.cjs: o save em arquivo que não gravou deixa rastro no errors.log (Steam Cloud)', () => {
  it('gravação aceita: nada no log', async () => {
    const h = await loadMain(appData, null);
    expect(await invoke(h, 'store:write', 'speed-tche.save', '{"a":1}')).toBe(true);
    expect(JSON.parse(readFileSync(join(savesDir(), 'speed-tche.save.json'), 'utf8'))).toEqual({ a: 1 });
    expect(errorsLog()).toBe('');
  });

  it('gravação recusada (pasta de saves impossível de criar): devolve falso E registra a chave e o tamanho', async () => {
    const h = await loadMain(appData, null);
    rmSync(savesDir(), { recursive: true, force: true }); // (a abertura já criou saves/ para o marcador da versão)
    writeFileSync(savesDir(), 'sou um arquivo, não uma pasta'); // mkdir(saves) falha: o disco "recusa"
    expect(await invoke(h, 'store:write', 'speed-tche.save', '{"a":1}')).toBe(false);
    const log = errorsLog();
    expect(log).toContain('store-write-failed');
    expect(log).toContain('speed-tche.save');
    expect(log).toContain('"bytes":7');
  });

  it('chave inválida ou texto que não é JSON também são recusados com rastro (a página nunca devia mandar isso)', async () => {
    const h = await loadMain(appData, null);
    expect(await invoke(h, 'store:write', '../fora', '{}')).toBe(false);
    expect(await invoke(h, 'store:write', 'speed-tche.save', 'não é json')).toBe(false);
    expect((errorsLog().match(/store-write-failed/g) ?? []).length).toBe(2);
  });

  it('leitura: arquivo que existe e não deu para ler vem como null E fica registrado (o jogo segue sem gravar por cima)', async () => {
    const h = await loadMain(appData, null);
    mkdirSync(join(savesDir(), 'speed-tche.progress.json'), { recursive: true }); // "arquivo" que é pasta: não é arquivo
    writeFileSync(join(savesDir(), 'speed-tche.save.json'), '{"ok":true}');
    const all = (await invoke(h, 'store:readAll')) as Record<string, string | null>;
    expect(all['speed-tche.progress']).toBeNull();
    expect(all['speed-tche.save']).toBe('{"ok":true}');
    const log = errorsLog();
    expect(log).toContain('store-read-failed');
    expect(log).toContain('speed-tche.progress');
    expect(log).not.toContain('speed-tche.save"');
  });

  it('leitura sem problema: nada no log', async () => {
    const h = await loadMain(appData, null);
    mkdirSync(savesDir(), { recursive: true });
    writeFileSync(join(savesDir(), 'speed-tche.save.json'), '{}');
    await invoke(h, 'store:readAll');
    expect(errorsLog()).toBe('');
  });
});

// A2 (docs/ondas/A2-backup.md): na 1ª abertura depois de mudar de versão, saves/*.json é copiado para saves/backup/<versão anterior>/.
describe('main.cjs: backup dos saves na troca de versão (A2)', () => {
  const backupDir = () => join(savesDir(), 'backup');
  const seed = (files: Record<string, string>) => {
    mkdirSync(savesDir(), { recursive: true });
    for (const [n, c] of Object.entries(files)) writeFileSync(join(savesDir(), n), c);
  };
  const backups = () => (existsSync(backupDir()) ? readdirSync(backupDir()).sort() : []);

  it('1ª instalação (sem saves): nenhum backup, só o marcador da versão', async () => {
    await loadMain(appData, null, '0.1.8');
    expect(backups()).toEqual([]);
    expect(readFileSync(join(savesDir(), '.versao'), 'utf8').trim()).toBe('0.1.8');
    expect(errorsLog()).toBe('');
  });

  it('versão diferente da do marcador: copia saves/*.json com os mesmos bytes para backup/<anterior>/', async () => {
    seed({ '.versao': '0.1.7\n', 'speed-tche.save.json': '{"cars":[1,2,3]}', 'speed-tche.settings.json': '{"a":1}', 'speed-tche.save.json.tmp': 'parcial', 'leia.txt': 'x' });
    await loadMain(appData, null, '0.1.8');
    expect(backups()).toEqual(['0.1.7']);
    const dir = join(backupDir(), '0.1.7');
    expect(readdirSync(dir).sort()).toEqual(['speed-tche.save.json', 'speed-tche.settings.json']); // sem .tmp e sem o que não é .json
    expect(readFileSync(join(dir, 'speed-tche.save.json'), 'utf8')).toBe('{"cars":[1,2,3]}');
    expect(readFileSync(join(savesDir(), 'speed-tche.save.json'), 'utf8')).toBe('{"cars":[1,2,3]}'); // o original fica
    expect(readFileSync(join(savesDir(), '.versao'), 'utf8').trim()).toBe('0.1.8');
    expect(errorsLog()).toBe('');
  });

  it('sem marcador mas com saves (instalação antiga): backup como "desconhecida"', async () => {
    seed({ 'speed-tche.save.json': '{"x":1}' });
    await loadMain(appData, null, '0.1.8');
    expect(backups()).toEqual(['desconhecida']);
    expect(readFileSync(join(backupDir(), 'desconhecida', 'speed-tche.save.json'), 'utf8')).toBe('{"x":1}');
  });

  it('mesma versão: nada é copiado, nem de novo a cada abertura', async () => {
    seed({ '.versao': '0.1.8', 'speed-tche.save.json': '{"x":1}' });
    await loadMain(appData, null, '0.1.8');
    await loadMain(appData, null, '0.1.8');
    expect(backups()).toEqual([]);
  });

  it('guarda só os 3 backups mais recentes: na 4ª troca o mais antigo sai', async () => {
    seed({ '.versao': '0.1.4', 'speed-tche.save.json': '{"x":1}' });
    for (const v of ['0.1.5', '0.1.6', '0.1.7', '0.1.8']) await loadMain(appData, null, v);
    expect(backups()).toEqual(['0.1.5', '0.1.6', '0.1.7']); // 0.1.4 (o mais antigo) saiu
    expect(existsSync(join(savesDir(), 'speed-tche.save.json'))).toBe(true); // nada fora de backup/ é apagado
    expect(existsSync(join(savesDir(), '.versao'))).toBe(true);
  });

  it('voltar a uma versão já guardada substitui a cópia dela em vez de lançar', async () => {
    seed({ '.versao': '0.1.7', 'speed-tche.save.json': '{"v":"a"}' });
    await loadMain(appData, null, '0.1.8');
    writeFileSync(join(savesDir(), 'speed-tche.save.json'), '{"v":"b"}');
    await loadMain(appData, null, '0.1.7'); // 0.1.8 -> 0.1.7: guarda a 0.1.8
    writeFileSync(join(savesDir(), 'speed-tche.save.json'), '{"v":"c"}');
    await loadMain(appData, null, '0.1.8'); // 0.1.7 -> 0.1.8: guarda a 0.1.7 de novo
    expect(readFileSync(join(backupDir(), '0.1.7', 'speed-tche.save.json'), 'utf8')).toBe('{"v":"c"}');
    expect(errorsLog()).toBe('');
  });

  it('um arquivo que não copia não derruba a abertura: uma linha no errors.log (chave, sem conteúdo), o resto é copiado e o marcador não avança', async () => {
    seed({ '.versao': '0.1.7', 'speed-tche.save.json': '{"segredo":"SENHA-123"}' });
    writeFileSync(join(savesDir(), 'speed-tche.ruim.json'), '{"segredo":"SENHA-123"}');
    const real = fs.copyFileSync;
    const spy = vi.spyOn(fs, 'copyFileSync').mockImplementation((from, to, mode) => {
      if (String(from).endsWith('speed-tche.ruim.json')) throw Object.assign(new Error('ENOSPC: sem espaço /x/SENHA-123'), { code: 'ENOSPC' });
      return real(from, to, mode);
    });
    const h = await loadMain(appData, null, '0.1.8').finally(() => spy.mockRestore());
    expect(h.has('store:readAll')).toBe(true); // a abertura seguiu
    const log = errorsLog();
    expect((log.match(/backup-failed/g) ?? []).length).toBe(1);
    expect(log).toContain('0.1.7');
    expect(log).toContain('speed-tche.ruim');
    expect(log).toContain('ENOSPC');
    expect(log).not.toContain('SENHA-123');
    expect(readFileSync(join(backupDir(), '0.1.7', 'speed-tche.save.json'), 'utf8')).toBe('{"segredo":"SENHA-123"}');
    expect(readFileSync(join(savesDir(), '.versao'), 'utf8').trim()).toBe('0.1.7');
  });

  it('falha ao criar backup/ (é um arquivo): também só deixa uma linha no log', async () => {
    seed({ '.versao': '0.1.7', 'speed-tche.save.json': '{"x":1}' });
    writeFileSync(backupDir(), 'sou um arquivo');
    await loadMain(appData, null, '0.1.8');
    expect((errorsLog().match(/backup-failed/g) ?? []).length).toBe(1);
    expect(readFileSync(join(savesDir(), '.versao'), 'utf8').trim()).toBe('0.1.7'); // marcador não avança: tenta de novo na próxima
  });

  it('o storage não lê nada de backup/ nem do marcador: store:readAll devolve só os saves de verdade', async () => {
    seed({ '.versao': '0.1.7', 'speed-tche.save.json': '{"x":1}' });
    const h = await loadMain(appData, null, '0.1.8');
    expect(existsSync(join(backupDir(), '0.1.7', 'speed-tche.save.json'))).toBe(true);
    const all = (await invoke(h, 'store:readAll')) as Record<string, string | null>;
    expect(Object.keys(all)).toEqual(['speed-tche.save']);
  });

  it('marcador com lixo (nome de pasta perigoso) não escapa de backup/', async () => {
    seed({ '.versao': '../../fora', 'speed-tche.save.json': '{"x":1}' });
    await loadMain(appData, null, '0.1.8');
    expect(existsSync(join(appData, 'fora'))).toBe(false);
    expect(existsSync(join(appData, 'SpeedTche', 'fora'))).toBe(false);
    expect(backups().length).toBe(1);
    expect(backups()[0]).not.toContain('/');
  });
});
