---
name: publicar-na-steam
description: 'Empacota o Speed Tchê (Electron, Windows e Linux), confere o build e sobe para a Steam pelo SteamPipe, parando onde só o Felipe pode seguir (login, Steam Guard, branch padrão). Use quando o Felipe pedir "sobe para a Steam", "gera o build da loja", "publica no beta" ou "prepara o lançamento".'
---
# Publicar na Steam

Estado hoje: não há App ID (o `desktop/steam_appid.txt` é o 480, de teste da Valve) nem arquivo `.vdf`. Criar a conta e o
App ID é a decisão nº 3 do Felipe (`docs/CRONOGRAMA.md`). As versões de teste saem pelo GitHub
(`.github/workflows/release-teste.yml`, disparado à mão), não pela Steam.

## O que só o Felipe faz

- Conta Steamworks, taxa do Steam Direct, dados fiscais e bancários, criar o app (sai o **App ID**) e os depots.
- O login no `steamcmd`, com a **conta de build** (nunca a pessoal) e o Steam Guard. O Claude nunca digita senha nem código.
- Pôr o build no branch **padrão** (o que todo mundo baixa) e apertar o botão de lançar. O `steamcmd` só põe no ar
  branches beta; o padrão é sempre no painel, pela mão do Felipe.
- Aceitar termos, pagar ou mudar preço.

## Passos

1. Verifique o jogo (skill `verificar`). Nada sobe com teste vermelho.
2. Empacote: `cd desktop && ./build-all.sh --e2e` (Windows sem instalador em `release/win-unpacked/SpeedTche.exe`, Linux em
   `release/linux-unpacked/speedtche`). A versão da raiz e a de `desktop/` têm que ser iguais. macOS só num Mac.
3. Confira o build antes de subir:
   - roda sem o editor e sem a pasta do código (abra o executável empacotado);
   - tamanho total e o que entrou: nada de `.pdb`, log, save de teste, arquivo-fonte de arte ou pasta `Saved/`;
   - versão do jogo visível no menu ou no log, igual à da tag;
   - licenças e créditos no build (skill `declaracao-ia` e o registro de licenças do jogo).
4. Prepare o SteamPipe: não existe; crie em `desktop/steam/` o `app_build_<AppID>.vdf` com um depot por plataforma (`ContentRoot` em
   `release/win-unpacked` e `release/linux-unpacked`) e `"FileExclusion" "steam_appid.txt"` (`docs/STEAM.md` §3,
   `desktop/README.md`). No `app_build`, `SetLive` aponta para um branch beta (ex.: `"SetLive" "beta"`).
   Guarde fora do depot os símbolos (`.pdb`) da mesma versão: sem eles, a pilha de um crash vem só com endereços.
5. Peça ao Felipe para rodar o envio, com a conta de build: `steamcmd +login <conta_de_build> +run_app_build <caminho>/desktop/steam/app_build_<AppID>.vdf +quit`.
6. O Felipe instala pelo cliente Steam, no branch beta, e joga 5 minutos. Só então ele promove ao padrão no painel.
7. Anote a versão, a data, o branch e o tamanho em `docs/STEAM.md` e as notas de versão em `desktop/teste/release.md`.

## Armadilhas

- A Valve revisa a página e o build antes do lançamento e exige a página "Em breve" no ar por um tempo mínimo. Prazos
  mudam: confira no Steamworks antes de marcar data.
- Conteúdo de IA: a declaração da página tem que bater com o build (skill `declaracao-ia`).
- O executável do Linux é `speedtche` (`executableName`); o `desktop/README.md` e o `docs/QA.md` ainda dizem
  `speed-tche`. Use o nome do pacote na opção de inicialização.
- Pendências antes da loja: Auto-Cloud no painel, conquistas cadastradas, IARC, `--no-sandbox` no Deck, assinatura do
  `.exe`, a licença do código (`"license": "MIT"`) e a EULA, e os checklists do `docs/QA.md` §3.
