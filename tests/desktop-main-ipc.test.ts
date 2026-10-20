// A1 (docs/ondas/A1-auditoria-save.md, achados 4a e 4b): o main.cjs RODA aqui de verdade, com o `electron` e o `steamworks.js` falsos, e os
// handlers de IPC são chamados como a página os chama. Até a A1 só havia teste de TEXTO sobre ele (regex em desktop-storage.test.ts).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nodeRequire = createRequire(import.meta.url);
const DESKTOP = join(__dirname, '..', 'desktop');

type Handler = (event: unknown, ...args: unknown[]) => unknown;

interface FakeSteam {
  localplayer: { getName(): string };
  achievement: { isActivated?: (id: string) => boolean; activate: (id: string) => boolean };
  apps?: { currentGameLanguage?: () => string };
}

/** Carrega o main.cjs com um `electron` falso (userData numa pasta temporária) e devolve os handlers registrados. */
async function loadMain(appData: string, steam: FakeSteam | null): Promise<Map<string, Handler>> {
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
      requestSingleInstanceLock: () => true, quit() { /* nada */ }, on() { /* nada */ }, isPackaged: false, getLocale: () => 'pt-BR',
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
    mkdirSync(join(appData, 'SpeedTche'), { recursive: true });
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
