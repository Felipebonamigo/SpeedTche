# Carros da arte

Cada `<nome>.glb` desta pasta substitui um modelo procedural no jogo — no navegador, no build e no Electron:

- `<carro>.glb` (ex.: `falcao.glb`, o ID do carro em `src/core/data/cars.ts`): o modelo é **só daquele carro**; o Boitatá segue com o GT procedural.
- `<estilo>.glb` (ex.: `gt.glb`): vale para o estilo todo; o arquivo do carro vence o do estilo.

- `hero/<estilo ou carro>.glb` (ex.: `hero/gt.glb`, V9): o casco **herói** daquele modelo, em alta definição (até `HERO_MAX_TRIANGLES`, 20.000 △), que o jogo usa só no carro humano perto da câmera (`src/render/cars/lod.ts`); o modelo de sempre continua sendo o intermediário. Mesmo contrato dos outros, mais os mesmos eixos, pegada e escapes do modelo de sempre (`heroProblems`). Gerado por `npm run carro-heroi`.

Sem arquivo, o modelo continua procedural. Antes de pôr um arquivo aqui: `npm run check-car -- caminho/<carro>.glb`. Arquivo recusado não
quebra o jogo: fica de fora, com o motivo no console (`[carros] … recusado`). Todo arquivo precisa de uma linha de licença em
`docs/ARTE.md` ("Licenças dos carros baixados"): um teste reprova a suíte sem ela. Contrato do arquivo (nós, atlas 256², LOD, `seat`, `kit_*`,
`decal_*`): `docs/CONTRATO-DO-ASSET.md`; passo a passo e o conversor do Kenney: `docs/ARTE.md`.

`art/cars/falcao-kenney.glb` (não instalado: o procedural ainda é mais bonito) vem do Kenney Car Kit (CC0) pelo `npm run convert-car` — é o carro-régua que prova o caminho; o conversor está em
`scripts/convert-car.ts`.
