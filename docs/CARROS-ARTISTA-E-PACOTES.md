# Carros: IA 3D e briefing para artista (escopo reduzido)

> Pesquisa de 20/10/2026 (nenhuma ferramenta foi usada, nada baixado, comprado, assinado ou aceito; só leitura de páginas públicas).
> **Escopo reduzido por decisão do dono (20/10/2026):** ele não vai contratar artista nem comprar pacote por enquanto.
> Contratar artista freelance e pacotes à venda: **adiado por decisão do dono** (não pesquisado a fundo; ver §4 para o que ficou de pé).
> Resumo de uma linha do que apareceu antes de o escopo mudar: gigs de carro low-poly no Fiverr listam de US$ 15 a US$ 60
> (https://www.fiverr.com/aunhaider805/create-3d-low-poly-vehicles-model-for-games, consulta 20/10/2026), mas isso é uma oferta de balcão,
> não referência para carro estilizado com UV, LOD e contrato de nós. **Faixa realista de artista: não confirmado.**

## 1. Onde estamos

26 carros (14 + 12 nacionais), lod0 ≤ 4.500 △ (`CAR_LIMITS.maxShellTriangles`), lod1 ≤ 50% (a ficha V6c usa ≤ 45%), herói do Falcão GT com 13.846 △ (teto 20.000).
O dono acha a lataria "de script": falta superfície esculpida, lanterna em tira de LED, brilho desenhado. A própria V9 (§4) diz que parte
do que separa do Horizon Chase 2 é **shader/luz (verniz, halo da lanterna), não malha**. Qualquer caminho de malha nova só resolve parte.

## 2. IA generativa 3D: comparativo

| | Meshy | Tripo | Rodin (Hyper3D) |
|---|---|---|---|
| Plano grátis | 100 créditos/mês, sem cartão | 200 a 300 créditos/mês (fontes divergem) | 10 ativos privados, paga por resultado |
| Licença grátis | **CC BY 4.0, uso comercial com atribuição**; "users own their output" | CC BY 4.0, modelos públicos (fontes secundárias) | não confirmado |
| Plano pago | Pro US$ 20/mês, Studio US$ 60/mês, Enterprise sob consulta; "All paid plans (Pro and above) include commercial-use rights" | Pro a partir de US$ 19,90/mês, 3.000 créditos (fonte secundária; outra diz US$ 15,9 anual) | crédito US$ 1,5; Creator US$ 30/mês; Business US$ 120/mês; direitos comerciais só claros no Business (fonte secundária) |
| Custo por modelo | Meshy 6: 20 créditos (texto ou imagem); Meshy 7 imagem: 25 (Ultra 25); texturizar: 10; remesh: 0 | ~25 créditos por modelo (3.000 = ~120 modelos; secundária) | 20 a 35 créditos conforme qualidade (terceiro, não confirmado) |
| Fontes | https://docs.meshy.ai/en/webapp/pricing , https://meshy.ai/pricing , https://intercom.help/meshy/en/articles/16102098-can-i-use-meshy-assets-commercially | https://www.costbench.com/software/ai-3d-generation/tripo-ai/ (secundária) | https://hyper3d.ai/pricing , https://www.costbench.com/software/ai-3d-generation/rodin-hyper3d/ |

Ressalvas de confiança: a página de docs do Meshy não lista preços mensais (os US$ vêm de meshy.ai/pricing via busca); um tutorial do próprio Meshy
diz que o Meshy é dono da saída grátis, contra a documentação ("users own"): **conflito não resolvido, ler o termo vigente antes de usar**. Tripo e Rodin:
só fontes secundárias, **ler o termo oficial**. Luma Genie e outros: **não pesquisados**.

**Regra do projeto** (`.claude/skills/modelo-3d/SKILL.md`): Meshy grátis (CC BY com crédito "3D models generated with Meshy (meshy.ai).") é aceito; gerar
exige **perguntar ao Felipe antes**, com o número de créditos; aceitar EULA, logar e comprar é só dele.

### Steam e conteúdo de IA
Fonte: https://partner.steamgames.com/doc/gettingstarted/contentsurvey (lida em 20/10/2026). Duas categorias: **pré-gerado** ("Any kind of content that ships with your game and is consumed by players") e
**gerado ao vivo** (durante o jogo, exige descrever guardrails). O conteúdo pré-gerado é avaliado "the same way we evaluate all non-AI content" e deve ser descrito no questionário.
A página diz que "Efficiency gains" no desenvolvimento não são o foco. Coberturas secundárias dizem que o aviso aparece na página da loja e que ferramentas de
bastidor (assistente de código) não precisam constar; a página oficial **não** lista isenção formal. **Não confirmado:** se IA usada só como referência/bloco e
depois refeita à mão (nada do mesh gerado no `.glb` final) exige declaração. Cautela: declarar.

### O que costuma dar errado em carro (experiência geral, **não verificada nesta pesquisa**, validar no teste)
Rodas assimétricas ou sem furo/aro separável; simetria esquerda-direita quebrada; topologia triangulada e suja (sem edge flow, não serve de base de subdivisão);
vidro e lanterna fundidos à lataria (o contrato precisa de `glass`, `headlight*`, `taillight*` separados); textura com luz e reflexo assados (conflita com `paint*` tingido pelo jogo);
carro que "lembra" modelo real por viés do treino (risco de marca, regra "sem logo/grade/nome"); contagem de faces alta e irregular.
O contrato exige rodas como nós separados com eixo em x, `exhaust_l/r`, `seat`, `lod0/lod1`, atlas 256²: **nada disso sai da IA**, é retrabalho manual no Blender.

## 3. Como testar 1 carro com o menor custo (proposta, depende do OK do Felipe)

1. **Carro de teste:** o Cuiabano (hatch quadrado) por ter a ficha mais clara e 4.348 △ hoje (o mais cheio). Comparar contra a versão de script.
2. **Entrada sem risco de marca:** texto + desenho próprio (silhueta de `docs/CARROS-NACIONAIS.md`, linha 1). **Nunca foto de carro real** como entrada de imagem.
3. **Plano grátis do Meshy:** 100 créditos = 5 gerações de 20 (ou 3 gerações + texturas). Custo em dinheiro: zero. Licença: CC BY, com o crédito exigido pela skill.
   Alternativa só se o grátis não bastar: 1 mês de Pro (US$ 20, preço de meshy.ai/pricing, a conferir) com "commercial-use rights" sem atribuição.
4. **Uso do resultado como BLOCO, não como arquivo final:** importar no Blender como referência, refazer a lataria por cima com a gaiola/subdivisão que o
   `build_hero_gt.py` já usa. Assim o `.glb` entregue é "criação própria" (tabela de licenças de `docs/ARTE.md`), sem textura nem topologia de IA.
5. **Critério de sucesso** antes de gastar mais: o bloco ganha curvas de lataria que o script não dava, em ≤ 1 hora de limpeza, e passa `npm run check-car`.
   Se a limpeza passar disso, a IA não paga e o ganho maior está em verniz/halo (V9 §4).
6. **Se algum trecho do mesh gerado ficar no arquivo final:** registrar em `docs/ARTE.md` (fonte, licença, data) e marcar a declaração de IA da Steam.

**Recomendação (duas frases):** testar um único carro (Cuiabano) no plano grátis do Meshy, como bloco de referência refeito no Blender, sem mesh de IA no arquivo final, e comparar com o de script antes de gastar um centavo.
Em paralelo, atacar o que a V9 já apontou como o maior hiato com o HC2 (verniz com gradiente, halo e barra contínua de LED nas lanternas), que é shader e não depende de artista nem de IA.

## 4. Material de reserva: briefing para artista (uso futuro)

Não foi consultado preço, prazo nem plataforma de artistas. Quando o dono decidir contratar, a ordem sugerida é: **1 carro pago de amostra** (um hatch nacional) antes de fechar os demais; contrato com **cessão total dos direitos patrimoniais**,
uso comercial (Steam), direito de modificar e entregar fonte `.blend`; cláusula de **criação original, sem malha/textura/logo/nome/design de terceiros**; revisão por advogado (a ficha já pede isso antes da Steam). Texto contratual exato: **não confirmado, pedir a advogado**.

### 4.1 Briefing (português)

**Projeto:** Speed Tchê, corrida arcade para PC (Steam), renderizada em Three.js (glTF/GLB). Estilo: cartum polido de alto acabamento, na linha de Horizon Chase 2 em
**qualidade de superfície** (lataria esculpida, vincos e reflexos desenhados, lanternas em tira de LED, faróis embutidos). **Referência para olhar, nunca para copiar.**

**Direitos e originalidade:** criação 100% original, inspirada em um **arquétipo** (hatch compacto, sedã médio etc.). Proibido: logo, nome ou emblema de marca, grade-assinatura, desenho gráfico exato de farol ou lanterna de um modelo real,
placas, adesivos reais, malha ou textura de terceiros (inclusive de lojas e IA sem aviso). Cessão total de direitos ao estúdio; você declara que a obra é sua.

**Os 12 carros nacionais (arquétipo, nome no jogo, estilo):**
1. Gol (quadrado, anos 90–2000): "Cuiabano", hatch. 2. Palio: "Tupiniquim", hatch. 3. Corsa: "Caipora", hatch redondo. 4. Peugeot 207: "Pampeiro", hatch com farol alongado.
5. Marea: "Barão", sedã. 6. Uno com escada da firma: "Furgãozinho da Firma", micro. 7. Fusca: "Besouro", clássico. 8. Kombi: "Pão de Forma", furgão. 9. Opala/Maverick: "Gaúcho V8", muscle.
10. Jipe/Troller: "Trilheiro", jipe. 11. Chevette: "Lambari", cupê compacto. 12. Fiat 147: "Jabuti", micro quadrado.
(Os nomes de modelo real servem **só** para você entender a silhueta; não aparecem em arquivo, nome de nó ou entrega. Detalhes de "o que muda" por carro: `docs/CARROS-NACIONAIS.md`. A silhueta, proporção e conjunto de vidros ficam perto do arquétipo, o que a marca registra muda.)

**Requisitos técnicos (contrato do .glb):**
- Metros, +Y para cima, frente em +Z. Origem no centro do carro, rodas no chão.
- Nós: `body`, `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr` (malha própria de roda, **eixo em x**), vazios `exhaust_l`, `exhaust_r`, `seat` (um só). Nós de topo `lod0` e `lod1`.
- Pegada: |x| ≤ 1,0; |z| ≤ 2,35; altura < 1,95; ponto mais baixo > 0,04; comprimento > 4,2 (micro > 3,2); largura > 1,8; raio da roda ≥ 0,26.
- **Orçamento:** casco lod0 ≤ **4.500 △** (alvo ~4.000); lod1 ≤ 45% do lod0; rodas e escapes fora do casco. Opcional: versão herói 10–20 mil △ só para o carro da câmera, mesmo contrato de nós.
- Materiais por **nome**: `paint` (cor do carro, branco = cor pura), `accent`, `stripe_a`, `stripe_b` (cores do jogador), `glass`, `headlight`, `taillight` (emissivos, **peças separadas**), `trim`, `bumper`, `tire`, `rim`, `plate` (placa lisa, sem texto). "popup" no nome só em farol escamoteável.
- Textura: **um atlas de paleta 256×256**, UV no atlas; faces pintáveis apontam para swatch **branco**. Sem luz assada na pintura. Normal map opcional.
- Simetria esquerda-direita (< 1% de vértices sem par), nenhum vértice do casco dentro do pneu, nenhuma faceta visível acima de 15° na distância de jogo.
- Validação: `npm run check-car -- arquivo.glb` (o estúdio roda; envie também o relatório se tiver o repositório).

**Entregáveis por carro:** `.blend` (fonte, modificadores à vista) + `.glb` conforme o contrato; LODs; lanternas, faróis, vidro e rodas separados; prints de 5 vistas; declaração escrita de originalidade. Carros 1 e 2 já existem em script para comparar proporção.
**Amostra paga:** 1 carro (Cuiabano) com revisão em 2 rodadas; só depois os demais. **Prazo e valor:** a combinar.

### 4.2 Briefing (English)

**Project:** Speed Tchê, an arcade racing game for PC (Steam), rendered in Three.js (glTF/GLB). Style: polished, high-finish cartoon, matching Horizon Chase 2 in **surface quality** (sculpted bodywork, designed creases and highlights,
LED-strip tail lamps, recessed headlights). **Reference to look at, never to copy.**

**Rights and originality:** 100% original work inspired by an **archetype** (compact hatch, mid-size sedan, etc.). Forbidden: any brand logo, name or badge, signature grille, the exact graphic design of a real model's head/tail lamps, license plates, real stickers,
third-party meshes or textures (including stock-site and undisclosed AI). Full assignment of rights to the studio; you warrant the work is yours.

**The 12 national cars (archetype, in-game name, body style):**
1. Gol-like squared 90s–2000s hatch: "Cuiabano". 2. Palio-like compact hatch: "Tupiniquim". 3. Corsa-like rounded hatch: "Caipora". 4. Peugeot 207-like hatch with long headlights: "Pampeiro".
5. Marea-like sedan: "Barão". 6. Uno-like micro with roof ladder: "Furgãozinho da Firma". 7. Beetle-like classic: "Besouro". 8. Kombi-like van: "Pão de Forma". 9. Opala/Maverick-like muscle: "Gaúcho V8".
10. Troller-like jeep: "Trilheiro". 11. Chevette-like compact coupe: "Lambari". 12. Fiat 147-like squared micro: "Jabuti".
(Real model names are for understanding the silhouette **only**; they must not appear in files, node names or deliverables. Silhouette, proportions and glasshouse stay close to the archetype; what a brand registers changes. Per-car notes: `docs/CARROS-NACIONAIS.md`.)

**Technical requirements (.glb contract):**
- Meters, +Y up, front is +Z. Origin at car center, wheels on the ground.
- Nodes: `body`, `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr` (own wheel mesh, **axle along x**), empties `exhaust_l`, `exhaust_r`, `seat` (exactly one). Top-level nodes `lod0` and `lod1`.
- Footprint: |x| ≤ 1.0; |z| ≤ 2.35; height < 1.95; lowest point > 0.04; length > 4.2 (micro > 3.2); width > 1.8; wheel radius ≥ 0.26.
- **Budget:** lod0 shell ≤ **4,500 tris** (target ~4,000); lod1 ≤ 45% of lod0; wheels and exhausts outside the shell. Optional: hero version 10–20k tris for the camera car only, same node contract.
- Materials by **name**: `paint` (tinted by the game; white = pure color), `accent`, `stripe_a`, `stripe_b` (player colors), `glass`, `headlight`, `taillight` (emissive, **separate parts**), `trim`, `bumper`, `tire`, `rim`, `plate` (blank plate, no text). "popup" in the name only for pop-up headlights.
- Texture: **one 256×256 palette atlas**, UVs on the atlas; paintable faces point at a **white** swatch. No baked lighting on paint. Optional normal map.
- Left-right symmetry (< 1% unpaired vertices), no shell vertex inside the tire, no visible facet above 15° at game distance.
- Validation: `npm run check-car -- file.glb` (we run it; send the report too if you have the repo).

**Deliverables per car:** `.blend` source (modifiers visible) + `.glb` per contract; LODs; lamps, headlights, glass and wheels as separate parts; 5-view previews; written originality statement. Cars 1 and 2 already exist as scripted models for proportion comparison.
**Paid sample:** 1 car (Cuiabano) with 2 revision rounds; the rest only after approval. **Price and schedule:** to be agreed.

## 5. O que não foi confirmado
- Preço e prazo de artista freelance para carro estilizado com contrato de nós (adiado); pacotes à venda (Unity Asset Store, Fab, CGTrader, TurboSquid) e licenças por pacote (adiado). Anotações soltas: a página de suporte da Unity diz "Unity Asset Store assets are not restricted to Unity projects" mas "cannot be redistributed as standalone items or in a way that allows others to extract them" (https://support.unity.com/hc/en-us/articles/34387186019988); a página da Fab devolveu 403, **licença da Fab fora da Epic não confirmada**; o Kenney Car Kit é CC0 (https://kenney.nl/assets/car-kit; a skill e `docs/ARTE.md` já o usam).
- Preços mensais exatos do Meshy (a doc não lista; meshy.ai/pricing via busca), dono da saída grátis (conflito entre docs e tutorial), termos oficiais de Tripo e Rodin, Luma Genie e outros.
- Qualidade real de IA em carro (nada foi gerado): só o teste do §3 responde.
- Se IA só como referência exige declaração na Steam.
