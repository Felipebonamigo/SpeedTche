#!/bin/bash
# Prepara a sessão do Claude na nuvem: instala as dependências do npm do jogo e do
# relay (server/), para a suíte completa com NC_REQUIRE_RELAY=1 e os playtests.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
npm install --no-audit --no-fund
(cd server && npm install --no-audit --no-fund)
