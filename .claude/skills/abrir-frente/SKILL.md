---
name: abrir-frente
description: Abre e fecha uma frente de trabalho do Speed Tchê no formato do projeto. Cobre escolher o item na "Auditoria de 14/10/2026" do CRONOGRAMA, escrever o cartão em docs/ondas/, a escada do mínimo, o checklist de mescla do PLAYBOOK, versão e notas de release, e onde registrar o que ficou para o Felipe decidir. Use para "abre a próxima frente", "o que falta fazer", "escreve o cartão", "fecha a onda", "mescla a frente", "solta a versão de teste".
---
# Abrir e fechar uma frente

Fontes: `CLAUDE.md`, `docs/PLAYBOOK.md` §3, §4 e §8, `docs/CRONOGRAMA.md` (Auditoria, §4 "Regras comuns", §7) e os cartões `docs/ondas/O/O4.md` e `docs/ondas/O/CAMERAS.md`.

## Abrir
1. Leia, nesta ordem: o `CLAUDE.md` ("Onde paramos"); o `docs/PLAYBOOK.md` inteiro; no `docs/CRONOGRAMA.md`, a "Auditoria de 14/10/2026"
   (V1–V7 visual, T1–T9 técnico, "Cronograma que falta", "Decisões abertas do dono"), a linha da onda no §4 e o §7 (decisões). Se a frente
   mexe em algo visível, leia também o `docs/DIRECAO-DE-ARTE.md`, a começar pelo aviso do topo (diretriz nova do dono).
2. Escolha o item.
   - "Em andamento (`nc/…`)" na coluna "Situação": outra sessão já está nele. Não abra de novo.
   - "Depende do dono" ou "Decisão do dono": não abre sem a resposta dele.
3. Passe pela **escada do mínimo** antes de escrever código e pare no primeiro degrau que resolve:
   1) isso precisa existir? 2) já existe algo equivalente aqui? 3) a biblioteca padrão faz? 4) um recurso nativo da plataforma cobre?
   5) uma dependência já instalada resolve (a de produção é só `three`)? 6) cabe numa linha? 7) só então, o mínimo de código novo.
   A escada encurta a solução, nunca a leitura do fluxo.
4. Classifique a frente:
   - **Arquitetural**: mexe em protocolo de rede, formato do save e migração, regra de dinheiro, ou em algo que muda toda pista. O cartão
     é escrito, justificado e commitado **antes** de qualquer código.
   - **Bounded**: o resto. O cartão também vem antes do código. Se aparecer migração, save novo ou regra de dinheiro, a frente para e volta com `NEEDS_CONTEXT`.
5. Crie o branch e anote a base:
   ```bash
   git checkout -b nc/<nome>        # ex.: nc/o4, nc/cameras; numa onda com cartões: nc/<onda>-<frente>
   git log -1 --format='%h %s'      # a "base conferida" do cartão
   ```
6. Faça o levantamento **por grep dos símbolos, nunca de memória** (`grep -rn "<símbolo>" src tests scripts tools`). Confira cada caminho,
   símbolo e número de linha. O número de linha vale só para aquele commit, então cite também o símbolo.
7. Escreva o cartão em `docs/ondas/<onda>/<frente>.md`, como `docs/ondas/O/O4.md` e `docs/ondas/O/CAMERAS.md`. A abertura de uma onda
   inteira vai em `docs/ondas/<onda>.md`, como `K.md` e `L.md`, com a tabela de dono por arquivo, as portas e as vagas de captura. Formato dos cartões recentes:
   - `## <Frente> — <título>` e um bloco `>` com: base conferida (commit e versão), branch, data, a classificação e o porquê, o pedido do
     dono palavra por palavra, e o que a frente **não** toca (`src/core`, `hashRace`, `sim-golden`, dinheiro…).
   - Seções, nesta ordem: `### 1. Design em duas frases` (ou "Objetivo") · `### 2. Levantamento (arquivo:símbolo)` · arquivos da frente e
     os que ela não toca · contrato (tipos, campo de save, tabela de migração), se for arquitetural · "Testes a escrever ANTES" (arquivo,
     o que afirma, por que falha hoje) · "Riscos" (risco → mitigação) · "Ordem em passos pequenos (um commit cada)" · "Pronto quando",
     com comandos e números · capturas pedidas.
   - O formato completo de 9 itens e a "checagem do modelo econômico" (reler como quem executa sem esta conversa) estão no PLAYBOOK §8.
8. Commite o cartão sozinho, em português e com o rodapé de atribuição da sessão. Na Auditoria, a "Situação" do item passa a "Em andamento (`nc/<nome>`)".
9. Vai paralelizar? Siga o PLAYBOOK §3 e §4: arquivos disjuntos, uma frente por área central (física, IA, economia/save), no máximo 5
   agentes e no máximo 3 capturando, e o modelo de instrução do §4. Na execução, use as skills `verificar` e `capturar`.

## Fechar (checklist de mescla, PLAYBOOK §3, passos 5 a 8)
1. Uma mescla por vez, na ordem de chegada, com o `git status` limpo: `git merge --no-ff nc/<nome> -m "<mensagem em português + rodapé>"`.
2. Depois de cada mescla, rode `npx tsc --noEmit -p .` (sem saída) e os testes da área. Em conflito, mantenha as duas mudanças.
   Cole nos docs da área o parágrafo que veio no relatório: agente não edita doc compartilhado.
3. Com tudo mesclado, rode a suíte completa uma vez (máquina livre, em segundo plano) e o `npm run build`. Vermelho aqui é defeito de
   integração: o teste que falhou já é o teste.
4. Atualize os registros:
   - no `CLAUDE.md`: "Onde paramos", o estado e a contagem de testes;
   - no CRONOGRAMA: a linha da frente ganha "— **concluída em dd/mm/2026 (DONE_WITH_CONCERNS; `docs/ondas/O/O4.md`)**: resumo";
   - na Auditoria: o item resolvido fica riscado, com a data e o commit;
   - no cartão: a seção final "Resultado" ou "Execução (data)", com os números e as perguntas ao dono.
5. Commit e `git push -u origin <branch>` só com a suíte verde.
6. Mostre ao dono: antes × depois, um resumo curto com o resultado primeiro e o fecho DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED.

## Versão e notas de release (quando um lote vai para os amigos; no cronograma, a 0.2 sai na P e a 0.3 na S)
- Antes, faça meio dia de caça a bugs por lentes: fluxo, save, online e render (CRONOGRAMA §4, regra 6).
- Suba a versão nos dois `package.json`. O `tests/desktop-package.test.ts` exige que as duas sejam iguais.
  ```bash
  npm version <versão> --no-git-tag-version && (cd desktop && npm version <versão> --no-git-tag-version)
  ```
- Atualize os textos da versão:
  - `desktop/teste/LEIA-ME.txt`: a versão e a data no cabeçalho e "NOVIDADES DA <versão> (sobre a <anterior>)";
  - `desktop/teste/release.md`: o título, os nomes dos pacotes e "Novidades da <versão>";
  - campo novo de save: uma seção em `docs/SAVE.md` e o aviso de não voltar a uma versão anterior. O commit modelo é o `75d0436`.
- O release é o `.github/workflows/release-teste.yml`, disparado à mão: Actions › "Release de teste" › Run workflow, com o campo `versao`.
  Ele publica o pré-lançamento `speedtche-teste-<versão>` com o `release.md` como notas.

## O que ficou para o dono decidir
- Gosto, dinheiro, ordem das copas, trocar um símbolo: pergunte com a recomendação marcada. O resto, decida e diga em uma linha.
- Onde registrar:
  - no "Resultado" do cartão ("Pergunta ao dono: …");
  - no CRONOGRAMA, em "Decisões abertas do dono" (logo abaixo da Auditoria) e na "Situação" do item ("Decisão do dono: …");
  - decisão nova e duradoura vira linha numerada no §7 (`#`, Decisão, Precisa até, Recomendação);
  - pendência que passa de uma onda vai também para "Pendências que dependem do dono", no `CLAUDE.md`.
- Valor que você fixou sem o dono: deixe numa constante nomeada e escreva "Valores a confirmar pelo dono" na linha da frente, como na O4.
- O retorno dos testadores vai para o `docs/QA.md` §5. Se a decisão bloqueia a frente, feche com `NEEDS_CONTEXT`.
