// O jogo mudou de nome (Nitro Crew → Speed Tchê, 10/10/2026). Quem já jogou a 0.1.0 não pode perder progresso: as chaves
// de save `nitro-crew.*`, os arquivos de save do Electron, a pasta de dados e os fantasmas exportados continuam valendo.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateLegacyKeys } from '../src/game/legacy-name';
import { parseGhostFile } from '../src/game/ghost';

interface StorageModule {
  readAllSaves(dir: string): Record<string, string | null>;
  migrateLegacyUserData(appData: string, legacyName: string, newName: string): 'moved' | 'kept' | 'none';
}
const storage = createRequire(import.meta.url)('../desktop/storage.cjs') as StorageModule;

function memory(initial: Record<string, string>) {
  const m = new Map(Object.entries(initial));
  return {
    m,
    api: {
      get length() { return m.size; },
      key: (i: number) => [...m.keys()][i] ?? null,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => { m.set(k, v); },
      removeItem: (k: string) => { m.delete(k); },
    },
  };
}

describe('chaves de save do nome antigo', () => {
  it('copia nitro-crew.* para speed-tche.* e apaga a antiga', () => {
    const { m, api } = memory({ 'nitro-crew.save': '{"a":1}', 'nitro-crew.settings': '{"b":2}', 'outra': 'x' });
    migrateLegacyKeys(api);
    expect([...m.keys()].sort()).toEqual(['outra', 'speed-tche.save', 'speed-tche.settings']);
    expect(m.get('speed-tche.save')).toBe('{"a":1}');
  });

  it('nunca sobrescreve a chave nova que já existe', () => {
    const { m, api } = memory({ 'nitro-crew.save': '{"velho":1}', 'speed-tche.save': '{"novo":1}' });
    migrateLegacyKeys(api);
    expect(m.get('speed-tche.save')).toBe('{"novo":1}');
    expect(m.has('nitro-crew.save')).toBe(false);
  });

  it('se não coube gravar a nova (cota cheia), mantém a antiga', () => {
    const { m, api } = memory({ 'nitro-crew.save': '{"a":1}' });
    api.setItem = () => { throw new Error('QuotaExceededError'); };
    migrateLegacyKeys(api);
    expect(m.get('nitro-crew.save')).toBe('{"a":1}');
  });

  it('sem nada antigo, não mexe em nada', () => {
    const { m, api } = memory({ 'speed-tche.save': '{}' });
    migrateLegacyKeys(api);
    expect([...m.keys()]).toEqual(['speed-tche.save']);
  });
});

describe('fantasma exportado com o nome antigo', () => {
  it('o formato "nitro-crew-ghost" ainda é reconhecido (a 0.1.0 exportava assim)', () => {
    const novo = parseGhostFile(JSON.stringify({ format: 'speed-tche-ghost', v: 99 }));
    const antigo = parseGhostFile(JSON.stringify({ format: 'nitro-crew-ghost', v: 99 }));
    // v inválido recusa os dois do mesmo jeito (o que importa: o formato antigo não cai fora antes da checagem de versão)
    expect(antigo).toEqual(novo);
    const so = JSON.stringify({ format: 'outro-jogo', v: 1 });
    expect(parseGhostFile(so)).toBeNull();
  });
});

describe('Electron: pasta de dados e arquivos de save do nome antigo', () => {
  let dir = '';
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nc-nome-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('move a pasta "Nitro Crew" para "SpeedTche" quando a nova não existe', () => {
    mkdirSync(join(dir, 'Nitro Crew', 'saves'), { recursive: true });
    writeFileSync(join(dir, 'Nitro Crew', 'saves', 'nitro-crew.save.json'), '{"a":1}');
    expect(storage.migrateLegacyUserData(dir, 'Nitro Crew', 'SpeedTche')).toBe('moved');
    expect(existsSync(join(dir, 'Nitro Crew'))).toBe(false);
    expect(existsSync(join(dir, 'SpeedTche', 'saves', 'nitro-crew.save.json'))).toBe(true);
  });

  it('se a pasta nova já existe, não mexe em nenhuma das duas', () => {
    mkdirSync(join(dir, 'Nitro Crew'), { recursive: true });
    mkdirSync(join(dir, 'SpeedTche'), { recursive: true });
    expect(storage.migrateLegacyUserData(dir, 'Nitro Crew', 'SpeedTche')).toBe('kept');
    expect(existsSync(join(dir, 'Nitro Crew'))).toBe(true);
  });

  it('sem pasta antiga, nada a fazer', () => {
    expect(storage.migrateLegacyUserData(dir, 'Nitro Crew', 'SpeedTche')).toBe('none');
  });

  it('readAllSaves renomeia nitro-crew.*.json para speed-tche.*.json e lê pelo nome novo', () => {
    writeFileSync(join(dir, 'nitro-crew.save.json'), '{"a":1}');
    writeFileSync(join(dir, 'nitro-crew.settings.json'), '{"b":2}');
    writeFileSync(join(dir, 'speed-tche.settings.json'), '{"novo":true}'); // já existe: ganha a nova
    const saves = storage.readAllSaves(dir);
    expect(Object.keys(saves).sort()).toEqual(['speed-tche.save', 'speed-tche.settings']);
    expect(saves['speed-tche.save']).toBe('{"a":1}');
    expect(saves['speed-tche.settings']).toBe('{"novo":true}');
    expect(readdirSync(dir).filter((n) => n.startsWith('nitro-crew.save'))).toEqual([]);
    expect(readFileSync(join(dir, 'speed-tche.save.json'), 'utf8')).toBe('{"a":1}');
  });
});
