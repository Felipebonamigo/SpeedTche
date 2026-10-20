# A2 — Backup dos saves na troca de versão (20/10/2026)

> Base `main` (0.1.8), branch `nc/backup`. Recomendação da A1 (`A1-auditoria-save.md`, achado A1-04), aprovada pelo dono. **Sem push, versão não subiu.**

- **O quê:** `storage.backupSavesOnVersionChange(savesDir, app.getVersion(), onError)` roda no topo de `desktop/main.cjs`, antes de qualquer leitura/gravação. Versão diferente de `saves/.versao` → copia `saves/*.json` para `saves/backup/<anterior>/` (pasta temporária `.parcial-*` + rename). Sem marcador e com saves = `desconhecida`; sem saves = só grava o marcador.
- **Guardas:** 3 backups (o mais antigo sai, só dentro de `backup/`); `.tmp` e não-`.json` não entram; nome da pasta saneado (marcador é arquivo do usuário); nunca lança. Falha = uma linha `backup-failed` no `errors.log` (versões, chaves, código do erro, sem conteúdo) e o marcador não avança (tenta de novo).
- **Fora da nuvem:** Auto-Cloud = `saves/*.json` sem recursão (`desktop/README.md`); `readAllSaves` só lê `*.json` direto em `saves/`. Teste confirma que `store:readAll` não vê o backup.
- **Testes** (`tests/desktop-main-ipc.test.ts`, 9 novos, escritos antes e vistos falhar por "backup não existe"): 1ª instalação, troca com bytes iguais, `desconhecida`, mesma versão, 4ª troca, voltar a versão já guardada, falha de cópia (spy em `copyFileSync`), `backup/` impossível de criar, storage não lê backup, marcador malicioso. Ajuste em 1 teste antigo (a abertura agora cria `saves/` para o marcador).
- **Docs:** `docs/SAVE.md` (como restaurar), `desktop/README.md`, `desktop/teste/LEIA-ME.txt`.
- **Limite conhecido:** só copia `*.json` do nível de `saves/`; o `localStorage` do Chromium não entra no backup (o arquivo vence na abertura, então o que importa é o arquivo).
