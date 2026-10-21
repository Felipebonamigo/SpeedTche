// A2: a poda dos backups de versão guarda os BACKUP_KEEP mais RECENTES. A ordem não pode depender do mtime da pasta:
// em trocas de versão seguidas (mesmo milissegundo, relógio grosso do sistema de arquivos) ele empata ou inverte
// e a poda apagava um backup novo no lugar do antigo (visto em 22/10/2026: 0.1.4 ficava, 0.1.5 saía).
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const storage = require('../desktop/storage.cjs') as { backupSavesOnVersionChange(dir: string, version: string): string };

describe('backup dos saves: a poda guarda os 3 mais recentes, sempre', () => {
  it('em 100 rodadas de 4 trocas seguidas, o que sai é sempre o mais antigo', () => {
    const ruins: string[] = [];
    for (let r = 0; r < 100; r++) {
      const dir = mkdtempSync(join(tmpdir(), 'bk-ordem-'));
      try {
        writeFileSync(join(dir, '.versao'), '0.1.4');
        writeFileSync(join(dir, 'speed-tche.save.json'), '{}');
        for (const v of ['0.1.5', '0.1.6', '0.1.7', '0.1.8']) storage.backupSavesOnVersionChange(dir, v);
        const got = readdirSync(join(dir, 'backup')).sort().join(',');
        if (got !== '0.1.5,0.1.6,0.1.7') ruins.push(got);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    expect(ruins).toEqual([]);
  });
});
