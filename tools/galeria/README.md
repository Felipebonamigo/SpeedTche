# Galeria fixa de referência (V7)

Os mesmos 13 quadros do jogo, sempre iguais, de qualquer worktree ou commit, numa folha para ver no celular. Com duas galerias, a
comparação mostra antes | depois por cena e marca o que mudou.

```bash
# gera (sobe o vite na raiz dada numa porta livre e o encerra pelo PID no fim); ~2–4 min por cena no swiftshader carregado
node tools/galeria/gerar.mjs --raiz /home/user/speedtche --rotulo main-f241703
node tools/galeria/gerar.mjs --raiz /home/user/speedtche-wt/minha-frente --rotulo minha-frente
# compara (segundos)
node tools/galeria/comparar.mjs main-f241703 minha-frente
```

- Saída em `scratch/galeria/<rótulo>/`: um PNG por cena, `manifest.json` e `folha.png` (2 colunas, legenda em PT).
  A comparação vai para `scratch/galeria/comparar-<antes>-vs-<depois>.png` (e `.json` com os números).
- `manifest.json`: rótulo, commit (e se havia mudança fora do commit), ramo, data e, por cena, as contagens do `debugInfo()` no quadro
  capturado (chamadas, triângulos, ms do quadro), como foi capturada, tentativas, erros de página e alertas (quase preta, sem HUD).
- **Mudou** = mais de 0,1% dos pixels com algum canal diferente em mais de 8/255 (`--limiar` muda a fração). Contagem que **subiu**
  (chamadas, triângulos) ganha ▲; o ms do quadro aparece mas não marca (no swiftshader é ruído).
- As cenas, o segmento de cada pista e as receitas de menu estão em `nucleo.ts` (`CENAS`). **Mudar a lista quebra a comparação com
  as galerias já geradas**: só de propósito, com `tests/galeria.test.ts` junto.
- Robustez: uma página por vez, `--tentativas 3` por cena (navegador reaberto entre elas), `--espera 900` s por etapa; se o
  screenshot estourar, o canvas é exportado direto (sem HUD; a folha avisa). `--so id,id` refaz só essas cenas e reaproveita as
  outras do manifest da pasta (mesmo commit).
- O mesmo commit dá a mesma imagem: Math.random com semente e, nos menus, o laço do jogo parado e os quadros dados a 1/60 s
  (`gerar.mjs`, `preparoDaPagina`). A raiz precisa de `node_modules` (link para o do main serve).
