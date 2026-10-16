# Carros nacionais: rotas de criação (pesquisa)

Frente `nc/pontas`, 16/10/2026. **Só pesquisa: nada foi gerado, nada foi instalado no jogo, nenhum modelo foi baixado.** Só olhei a ficha e a miniatura pública de cada
candidato (a API do Sketchfab, sem login) para julgar silhueta; a geometria real só se vê abrindo o arquivo. Pede-se: a ficha `docs/CARROS-NACIONAIS.md` (12 carros, regra de marca),
o pipeline `npm run convert-car`, o contrato `docs/CONTRATO-DO-ASSET.md`.

## Resumo (resultado primeiro)

- **Recomendação: rota (a) + (d) combinadas, em Blender por script (`bpy`)**: pegar um modelo pronto CC BY de um carro parecido com o arquétipo como **base de geometria**,
  e no Blender (por script, rodando aqui) tirar logo e grade, trocar farol/lanterna/grade por desenho nosso, separar as rodas, reduzir para ≤ 4.500 triângulos no `lod0` e
  gerar `lod1`, materiais por papel, `seat`, `exhaust_*`. Dá o carro **mais parecido** com o real que a regra de marca deixa. **0 crédito** do Meshy.
- **Blender `bpy` instala e funciona aqui** (provado: `pip install bpy` num venv novo pelo proxy, bpy **5.0.1**, Python 3.11.15; cubo exportado como `.glb` válido, 1.728 bytes, cabeçalho `glTF`).
  Logo o passo "limpar no Blender" do `MESHY-LISTA.md` não depende do PC do dono.
- **Nenhum modelo CC0 de carro de rua existe no Sketchfab** (a busca por CC0 só devolveu besouros-insetos). Tudo o que serve é **CC BY 4.0, com crédito**. Do Kenney (CC0) só há brinquedo sem marca.
- **Acervo e aba "Modelos 3D": nada servível.** Só `veiculos/kenney/falcao-kenney.glb` (o Falcão), o galeão, os 13 moldes procedurais; na aba, só conteúdo da Epic (City Sample Vehicles,
  carro do template Vehicle: proibido, o jogo não é Unreal) e o Falcão.
- **Meshy para os 12 (se fosse a rota única): 360 créditos no melhor caso, ~720 com 2 tentativas por carro** (30 créditos por modelo com textura, número do projeto). A rota recomendada gasta **0**.
- **Orçamento de triângulos**: nenhum candidato "bonito" cabe no casco sem redução (a maioria tem 12 mil a 50 mil faces). O limite no código hoje é **4.500** (`maxShellTriangles`, `src/render/cars/check.ts`), não 8.000.

## O que foi verificado e o que não foi

| Item | Estado |
|---|---|
| Acervo `Felipebonamigo/acervo-3d` (`catalogo.csv`, 201 linhas) | lido (clone raso, só leitura). Em `veiculos/`: Falcão (Kenney), Timber Galleon, 13 moldes `speed-tche-moldes/` |
| Aba "Modelos 3D" do doc do estúdio | lida pelo conector do Claude Docs. Seção Veículos: só Epic (proibida) e o Falcão |
| Sketchfab (`api.sketchfab.com`, sem login) | funciona. ~360 modelos consultados, licença confirmada na ficha de cada um dos 50 finalistas (todos "CC Attribution" = CC BY 4.0). Filtrei `noai`. Marquei se tem textura/materiais |
| Kenney Car Kit 3.1 (CC0) | zip já estava em `/tmp/claude-0/dl/` (não baixei). Modelos: `hatchback-sports`, `sedan`, `sedan-sports`, `suv`, `suv-luxury`, `van`, `delivery`, `taxi`, `truck`, `police`, `ambulance`, `race`… (~2.000 triângulos, sem marca) |
| Poly Pizza | `poly.pizza` dá 403 e a API 401 (precisa de chave). **Não consultado** |
| Quaternius | o site responde; o pacote que lista carros (`cars`, `trucks`, `camaro`) é um kit de cidade, sem carro nacional. **Não conferi arquivo por arquivo** |
| Poly Haven | API responde; modelos de carro: só `covered_car` (um carro coberto por lona). Não serve |
| Galeria CC0 do Meshy | o site responde, mas é página dinâmica: sem login/navegador não dá para buscar. **Não consultado** (o dono baixa pelo navegador logado, como no ARTE.md) |
| Meshy (custos e erros) | **não executei nada**; valores são o número do projeto (30 créditos) e o que o Meshy costuma errar |
| Unity Asset Store / Fab | **não conferi a licença de uso fora da engine** (sem login e sem acesso à página de EULA). Tratar como proibido até o dono ler |
| Blender `bpy` | instalado e testado aqui (acima) |
| context7 (MCP) | falhou ao conectar (CONNECT_TIMEOUT). Não era necessário |

## Como julguei "parece com o real"

O jogo converte **tudo** para cor por papel (`paint`, `accent`, `glass`, `trim`, `tire`, `rim`, `headlight`, `taillight`) e atlas 256²; a textura do candidato é descartada.
Então o que importa no candidato é **a malha**: silhueta, proporção, vidros, arcos de roda, e se vidro/farol/lanterna/pneu já são **materiais separados** (senão é preciso pintar faces por região em `bpy`).
Faces são do que o Sketchfab informa (triângulos). "Similaridade" é julgamento meu pela miniatura, não medição.

**Risco de marca** (a licença do arquivo não resolve):
- **baixo**: carro fictício do autor, sem logo (Zhabotinsky) ou brinquedo (Kenney);
- **médio**: carro real com pouca marca (PSX/low-poly sem logo visível), mas a forma é a do carro;
- **alto**: carro real com logo, nome no arquivo e grade-assinatura: "**precisa retirar logo e grade**" (e o título do modelo tem o nome da marca; o arquivo do jogo sai com outro nome). Fusca e Kombi têm ainda o
  desenho tridimensional associado à VW (pergunta para o advogado, não é parecer).

## Tabela por carro

Legenda de rota: **(a)** pronto + ajuste (em Blender `bpy`), **(b)** Meshy, **(c)** casco procedural nosso (`Hull` + `shaped.ts`), **(d)** Blender `bpy` modelado do zero por script.
Meshy = créditos estimados, 1 tentativa (30), sem foto de carro de marca: **texto** só com o arquétipo.

| # | Arquétipo | Candidatos prontos (link, autor, licença, faces, textura/materiais) | Risco de marca | Meshy (1ª tentativa) | Rota recomendada |
|---|---|---|---|---|---|
| 1 | Hatch quadrado (Gol) | **[Gol Quadrado](https://sketchfab.com/models/93858a6f970043978ba798ad430871e9)**, coptrum, CC BY 4.0, 14.100 faces (4 versões do carro no mesmo arquivo, ~3.500 cada, a conferir), 12 mat./6 tex. Reserva: [Fox Mk1 (Golf Mk1)](https://sketchfab.com/models/8dc118c3e2ce40a2b7d550b0ae404949), ImperialBlue3D, CC BY, **712**, 1 mat./1 tex. Genéricos: [Generic 80s european car](https://sketchfab.com/models/af108d4773df4722a62420f65dd5b8fe) (Henry VIII, 1.596), [1980s hatchback](https://sketchfab.com/models/fbe2f56fd06f40eaa88388a9c76b6a7c) (MaG80, 14.146, 12 mat.) | alto no Gol Quadrado e no Fox (logo VW, grade): **retirar logo e grade**; baixo nos dois genéricos | 30 | **(a)** com o Gol Quadrado (silhueta quadrada exata), farol retangular e lanterna nossos; reserva: genérico da MaG80 |
| 2 | Hatch compacto (Palio) | [Fiat Palio 1997](https://sketchfab.com/models/8a3e71d4b4234110b59b09ef663e9448), Fall0X, CC BY, **47.957**, 41 mat./0 tex., miniatura pequena (qualidade a ver abrindo). Parentes: [Milano '95](https://sketchfab.com/models/122a22d210234596ad23623588d0d166) (Zhabotinsky, fictício, 18.064, 8 mat./20 tex.), [Lasley '67](https://sketchfab.com/models/1269720ec7b84c899eac77c1d325141e) (não é hatch) | Palio: alto (**retirar logo e grade**); Milano: baixo | 30 | **(a)** Palio 97 reduzido (47 mil → 4,5 mil com `Decimate` + malha refeita nas rodas e nas portas), **ou** (c) se a malha vier ruim. Milano '95 é plano B fictício |
| 3 | Hatch/sedã redondo (Corsa) | [Opel Corsa B Low Poly](https://sketchfab.com/models/773b1c83b4a240f2ac415c351d3a65c6), JiggleSticks, CC BY, 11.712, 8 mat./0 tex. (hatch). Sedã: [1995 Opel Corsa Sedan](https://sketchfab.com/models/db2a048560b84f5fa8836bfb36b677d5), maregajavier, CC BY, **1.792**, 5 mat./2 tex. (logo Opel visível na grade). Parente: [low poly celta](https://sketchfab.com/models/e6ed28ade18247b6957010933ce518e0), RATODDY, 7.484 | alto (logo/raiz Opel-Chevrolet): **retirar logo e grade** | 30 (+30 para a variante sedã) | **(a)** hatch 11,7 mil → ≤ 4,5 mil; o sedã de 1,8 mil já cabe e vira a variante |
| 4 | Hatch europeu (207) | [2003 Peugeot 206](https://sketchfab.com/models/289b123c3be8432aa1dabc97dfafc026), ImperialBlue3D, CC BY, 5.206, **1 mat./1 tex.**; [Peugeot 206](https://sketchfab.com/models/33657ac0e044493daf495d45424ead7a) e [206](https://sketchfab.com/models/f342081c28304bf9a7c3322defc33e95), Thcyrax, 3.108 / 5.420, 1 mat. cada (estilizados); [Peugeot 208](https://sketchfab.com/models/3d4a1578573645de9a2915e93b7edcf7), Gruny, 2.440 (modelo errado: 208 é de 2019) | alto (leão, grade e o farol "garra" são a marca): **retirar logo e grade**, refazer farol | 30 | **(a)** 206 da ImperialBlue3D, farol em "garra" **redesenhado** (o 207 real tem farol maior). Material único: pintar vidro/farol por região em `bpy` |
| 5 | Sedã médio (Marea) | Sedãs fictícios do Zhabotinsky, CC BY, 8 mat./20 tex.: [Kiri '94](https://sketchfab.com/models/b92072c8cd9d4ee6b3c0be45de48223c) (14.646), [Illinois '90](https://sketchfab.com/models/d604871eee5b4181bb298163b0b675b7) (19.354), [Carter '98](https://sketchfab.com/models/3af773617c7f481da2ba5d307412ce35) (19.927; grande, tipo americano), [Tozzo '98](https://sketchfab.com/models/d43bb748da364af2b3f0a9348365f0fb) (17.928; lembra um sedã japonês de marca). Genérico: [Abandoned Generic Sedan 2](https://sketchfab.com/models/db2df46c49f9441286c84c66208ef7ac) (16.487, carro quebrado) | baixo (fictícios) | 30 | **(a)** Kiri '94 como base + traseira alta e lanterna de ponta a ponta feitas por nós (é o que identifica o arquétipo). Nenhum fictício tem a proporção do Marea; **(c)** é o plano B |
| 6 | Compacto da firma (Uno + escada) | [FiatUno Low Poly](https://sketchfab.com/models/73a0925eca35456ebc330c5c9816b1ba), Justiinsa, CC BY, **3.076**, 8 mat./0 tex. (cabe quase direto); [PSX Fiat Uno 5-door](https://sketchfab.com/models/7340fb8b784b4e799f40b2bd62b9afa1), Void, 1.636, 4 mat.; [Fiat Uno 1994](https://sketchfab.com/models/e81d01b9513947ac9e223fff1e669eff), ARDmation, 15.010 (carro sujo e amassado) | médio/alto no nome e na grade; **retirar a grade e qualquer logo** | 30 | **(a)** Justiinsa 3 mil + **escada de alumínio nossa** (peça de ~150 triângulos, sem custo de crédito) + adesivo "Firma Ltda" fictício |
| 7 | Fusca | [Volkswagen beetle](https://sketchfab.com/models/c4ae7c0adecc4219ad11c70cd0ae4671), mak3r, CC BY, 7.222, 1 mat./4 tex. (limpo, redondinho); [1963 Volkswagen Beetle](https://sketchfab.com/models/f03e5ba5e81b4562958645fe27565f3a), aleksey.matveenko, 11.896, 2 mat./11 tex. (com bagageiro e ferrugem); [Beetle/Fusca (Version 1)](https://sketchfab.com/models/cb6e82e73386448fb3b4e2dd25255a5e), soujagah, 39.935, 4 mat. | alto: logo da VW no capô e nas calotas, **retirar logo**; o desenho do Fusca em si é tridimensional da VW (**advogado**) | 30 | **(a)** mak3r 7,2 mil → ≤ 4,5 mil. O Fusca é o que **mais perde** com Meshy (a silhueta de besouro sai torta) |
| 8 | Kombi | [VW Kombi 1969 LowPoly](https://sketchfab.com/models/f6a7b54ec6d24d8e95992f68be6c930c), Scuderia Morello, CC BY, **11.502**, 8 mat./0 tex. (cor chapada, estilo igual ao nosso); [Cartoon Kombi](https://sketchfab.com/models/39612840c9944ff1b9a72dcc885a5569), cris cardona, 7.458, 15 mat.; [Hippy Camper Van](https://sketchfab.com/models/931d18f3e94b4cd580440bdc85436734), Libau Media, **5.323**, 7 mat.; [VW T1 style Bus Free](https://sketchfab.com/models/c6dc0d2275524bb1a43ddc398d2be3bc), 21.698 | alto (logo VW; a "boca" em V é o que identifica a Kombi: conflita com "sem a boca" da ficha, decisão do dono + advogado) | 30 | **(a)** Hippy Camper Van (5,3 mil, quase sem redução, sem o logo no desenho); trocar a pintura. Alternativa mais parecida: Kombi 1969 (precisa retirar logo) |
| 9 | Opala / Maverick | [80s/90s chevrolet opala](https://sketchfab.com/models/9a54b1a9aa9a4b7b92a2b35dda15297c), coptrum, CC BY, 19.582 (pacote com ~4 carros, ~4.900 cada, a conferir), 15 mat./10 tex.; [Chevrolet Opala Sedan 1968 (3D print)](https://sketchfab.com/models/be7767b319ce4eb4817692934b73866c), 47.108, 1 mat., sem vidros; [Dioramaverick](https://sketchfab.com/models/6ca26d4b27754f899cd6a61c274714be) (cupê amarelo parecido com o Maverick em diorama, 2.296 no total, 18 mat.). Cupê muscle fictício: [Phoenix 455 '71](https://sketchfab.com/models/955edc733c6d44fabc0ad7c246a15896), Zhabotinsky, 25.947 (lembra um cupê americano de marca) | Opala: alto (**retirar logo e grade**); Maverick: médio; Phoenix: médio (o capô é do modelo real) | 30 | **(a)** coptrum Opala (já é low-poly e separa em carros). O V8 do som já existe. Plano B: **(c)** com o casco `muscle` (capô longo, cabine recuada) |
| 10 | Jipe (Troller) | **Nenhum pronto parecido.** Mais perto: [Low poly Japan Offroad Car](https://sketchfab.com/models/5bde8c57de3d4be880ed6457f88636ad), Han66st, CC BY, 18.516, 11 mat. (caixote de 4x4 compacto, parecido com um jipe japonês de marca); [Jeep Willys](https://sketchfab.com/models/a28600c16b9e44bcb160ede0d199180d), 12.276 (militar, errado); [PSX Ford Bronco](https://sketchfab.com/models/2d8b12937ac84e5aad54246b6d356810), 1.372 (SUV de polícia). Kenney CC0: `suv.glb` (~2.000, caixa de paleta) | Han66st: médio/alto (grade de 5 barras de um jipe de marca); Kenney: nenhum | 30 (e 30 para refazer: jipe de capô reto é onde o Meshy mais inventa) | **(d)** modelado do zero em Blender `bpy`: capô reto, para-lamas quadrados, faróis redondos, estepe atrás: é uma caixa, fácil de modelar e de ficar fiel. Reserva **(c)** com o casco `pickup` |
| 11 | Cupê compacto (Chevette) | [Chevrolet chevette](https://sketchfab.com/models/d6bc8992e87944eb8f91103973d441b4), Macedo, CC BY, 24.862, 11 mat./11 tex. (miniatura minúscula: estado a conferir); [Chevrolet Chevette sl 76](https://sketchfab.com/models/2322139894c545b6838000f08d853662), Laerte.Hubaleque, 53.841; [Chevette V1](https://sketchfab.com/models/145fe467bdf0463fb70aa7dca8fbceaf), danilovesantana, 1.226 (**na miniatura é um letreiro "CHEVETTE", não um carro: a confirmar**); [Lowpoly Opel Kadett B](https://sketchfab.com/models/aae6a834b2274198accd51ee6a89520f), PolleDesutter, 2.828 (carro irmão, de outra geração). | alto (nome, logo, grade de barras): **retirar logo e grade** | 30 | **(a)** Macedo reduzido; se a malha vier ruim, **(c)**/(d) |
| 12 | Quadradinho (147) | [Fiat 147 Low Poly](https://sketchfab.com/models/fbc8fafed6be4090bf6128d287780559), 4kuma.design, CC BY, **1.914**, 12 mat. (veio com cenário de pista: extrair o carro); [Fiat147 LQ](https://sketchfab.com/models/d669f31a1c3144b7b37ada7dfeef0eae), eliozap1, 1.842, 8 mat. (casca branca, parece sem rodas); [Fiat 128 Super Europa](https://sketchfab.com/models/cea87e69e09c45c7ba8e66cb1d95ec75), 24.796, 27 mat. | alto (nome e grade): **retirar logo e grade** | 30 | **(a)** 4kuma.design, 1,9 mil (cabe com folga: sobram triângulos para detalhe de vinco no capô e farol quadrado nosso) |

Notas: o Fiat 147 e o Uno do Zhabotinsky não existem como "genérico"; o "Compact '07" ([Compact '07](https://sketchfab.com/models/25c6874d173a4f6ca63e150bbd505686), 15.081) é um microcarro europeu (tipo smart) e serve ao Saci Mirim, não aos 12.
"Hatch redondo" alternativo do Corsa: [Retro inspired 2000s hatchback](https://sketchfab.com/models/8492aa13bc1246f6b589dca2887edb8d) (MaG80, 16.738, 12 mat., redondinho e **sem marca**), é a opção "só silhueta, risco zero" caso o dono prefira.

## O que o Meshy costuma errar em carro (vale para qualquer das 12 linhas)

- **Rodas fundidas ao casco** (sem malha própria): o contrato quer `wheel_fl/fr/rl/rr` separadas, com eixo em x. Tem que cortar e refazer as rodas em Blender (as 4 viram a roda do `wheel_fr`).
- **Assimetria** entre lado esquerdo e direito (faróis, espelhos, vincos): corrigir espelhando uma metade em Blender (rápido).
- **Topologia**: malha triangulada, 30–100 mil faces desiguais, buracos, interior preenchido (sem cabine); precisa de **retopo/remesh** até 4.500 e vidro como superfície própria.
- **Vidro/farol/lanterna só na textura** (luz "assada"): sem material para acender, e pneu/pintura no mesmo material. Pintar por região (`bpy`) ou refazer os materiais.
- **Fidelidade ao arquétipo**: sem poder dizer o modelo, o texto "boxy 90s hatchback" sai genérico; foto de referência de carro de marca está **proibida** pela regra. Para Fusca, Kombi e jipe (silhuetas que dependem de detalhe) é onde mais falha.
- Conteúdo de IA que o jogador vê é **declarado na Steam**; crédito "3D models generated with Meshy (meshy.ai)." enquanto o plano da data não for confirmado.

Se for Meshy, **peça ao dono o teto**: 12 carros × 30 = **360 créditos**; com uma segunda tentativa média por carro (o realista para carro) = **720**; as duas variantes (sedã do Corsa) somam +30 a +60. O projeto já gastou 200 créditos por engano em 04/10: **não gerar nada** sem a lista aprovada.

## O que cabe no pipeline

- `npm run convert-car` hoje **só lê o kit do Kenney** (`KENNEY_ROLES`, receita de swatches do `colormap`). Um `.glb` do Sketchfab **não passa por ele**; precisa de um passo novo, um script `bpy` único
  (sugestão: `scripts/bpy/preparar-carro.py`, reusável nos 12): importa o `.glb`; apaga logo/grade/peças soltas; reconhece e separa as 4 rodas (eixo em x); `Decimate` + limpeza até ≤ 4.500 no casco; atribui materiais por papel
  (pelo nome do material de origem, por região ou por normal+altura quando há material único); faz `lod1` (≤ metade); põe `seat`, `exhaust_l/r`; exporta `.glb` já na convenção (metros, +Y, frente +Z); termina com `npm run check-car`.
- **Teto de casco**: o validador reprova acima de **4.500** (`maxShellTriangles`). Ir a 8.000 exige mudar esse limite **e** passar no `src/bench/gate.ts`: o gate da Sampa 4 jogadores já mede 339 a 372 mil triângulos para 345–380 mil de limite; ~3.500 triângulos a mais por carro, com ~8 carros por viewport e 4 viewports, são ~110 mil a mais (estimativa minha, não medi). **Ficar em 4.500.**
- **Cabem sem retopologia manual** (já abaixo do teto ou perto): #6 Uno (3,1 mil), #12 147 (1,9 mil), #8 Kombi (camper 5,3 mil; ou 11,5 mil reduzido), #4 206 (3,1–5,4 mil), #3 sedã Corsa (1,8 mil).
- **Exigem retopologia/redução com cuidado** (muita face, `Decimate` simples estraga o arco da roda e o vinco): #2 Palio (48 mil), #11 Chevette (25 mil), #9 Opala (pacote 19,6 mil), #5 Marea-base (15–20 mil), #3 hatch Corsa (11,7 mil), #7 Fusca (7–12 mil), #1 Gol Quadrado (14 mil, pacote).
- **Texto/UV dos candidatos**: irrelevante para o jogo (atlas de paleta 256²); a UV do atlas é gerada no passo `bpy`.
- **Atribuição CC BY**: 12 linhas na tabela de licenças de `docs/ARTE.md` (o teste `car-pipeline` cobra), `CREDITOS.md` do acervo, tela de créditos do jogo; indicar "modificado" no crédito.

## Comparação das rotas

| Rota | Parece com o real? | Custo em dinheiro/crédito | Custo em tempo (estimativa minha) | Risco de marca/licença | Depende do PC do dono? |
|---|---|---|---|---|---|
| **(a)** pronto CC BY + ajuste em `bpy` | **Maior**: parte da forma de um carro real | 0 | 1 dia p/ o script geral + 1–3 h por carro (limpeza, rodas, redução, materiais) | alto de partida, **cai** ao tirar logo/grade e redesenhar farol/lanterna; crédito CC BY | não (Sketchfab pelo proxy) |
| **(b)** Meshy | Média/baixa: genérico por não poder citar o carro; erra Fusca, Kombi e jipe | 360 (720 com 2 tentativas) | 5–10 min de geração + 2–4 h de limpeza por carro (rodas, simetria, remalha) | baixo se o texto só descreve o arquétipo; declarar IA na Steam | só a conta/EULA do Meshy (o dono autoriza) |
| **(c)** casco procedural nosso (`Hull`+`shaped.ts`) | Média: bom em sedã/hatch lisos; limitada em caixote (Kombi, jipe, 147), pois o anel de 26 pontos tem ombro e para-lama arredondados | 0 | ~0,5–1 dia por carro até ficar bom (o GT levou rodadas de realismo) | **nenhum** (é nosso) | não |
| **(d)** Blender `bpy` do zero | Alta **se** houver boa referência; **sem foto de carro de marca** (regra) saio com cotas e perfis que eu conheço: bom para jipe e caixotes | 0 | 0,5–1 dia por carro (modelar por perfis lado/topo/frente, bisel, subdivisão, UV de paleta) | **nenhum** | não (aqui roda; o dono só aprova) |
| **(e)** Unity/Unreal só como autoria | Não modelam carro: Unity (ProBuilder) e Unreal (Modeling Mode) são blockout; exportar glTF pede pacote (UnityGLTF/exportador do Unreal). Blender é melhor e grátis | 0 | maior que (d) | **Unreal/Fab: proibido** pela regra do projeto (só vale em jogo Unreal). **Asset Store: licença de uso fora da Unity NÃO conferida**; carro de marca lá tem o mesmo problema de marca | **sim** (só rodam local) |

**Qual dá o carro mais parecido dentro da regra de marca**: **(a) + (d)**, isto é, geometria de um modelo real CC BY, **editada em `bpy`** para tirar logo e grade e redesenhar farol e lanterna. Para o **jipe** (sem pronto) vale **(d)** puro. O (b) só como rascunho de forma
(Troller, 30–60 créditos), nunca como acabamento. (c) é o plano B de cada linha e a rota certa para qualquer carro que o dono queira "inteiramente nosso".

## Recomendação final, carro a carro

| # | Carro (nome no jogo) | Rota | Base | Créditos Meshy | Observação |
|---|---|---|---|---|---|
| 1 | Cuiabano (Gol) | (a) | Gol Quadrado (coptrum) | 0 | reserva Fox Mk1 (712) ou genérico MaG80 |
| 2 | Tupiniquim (Palio) | (a), plano B (c) | Palio 1997 (Fall0X), 48 mil → 4,5 mil | 0 | modelo mais pesado e de qualidade incerta |
| 3 | Caipora (Corsa) | (a) | Corsa B + Corsa Sedan 1995 como variante | 0 | sedã já cabe (1,8 mil) |
| 4 | Pampeiro (207) | (a) | 206 (ImperialBlue3D) com farol novo | 0 | material único: pintar por região |
| 5 | Barão (Marea) | (a) + (d) | Kiri '94, traseira refeita | 0 | nenhum fictício tem a proporção; (c) é o plano B |
| 6 | Furgãozinho da Firma (Uno) | (a) + peça nova | FiatUno Low Poly (Justiinsa) + escada | 0 | escada ~150 triângulos |
| 7 | Besouro (Fusca) | (a) | Volkswagen beetle (mak3r) | 0 | logo fora; consulta jurídica do formato |
| 8 | Pão de Forma (Kombi) | (a) | Hippy Camper Van (Libau) ou Kombi 1969 | 0 | "sem a boca em V" reduz a semelhança: decidir |
| 9 | Gaúcho V8 (Opala/Maverick) | (a), plano B (c) | Opala (coptrum) | 0 | |
| 10 | Trilheiro (Troller) | **(d)** | do zero, em Blender | 0 (opcional 30–60) | sem pronto |
| 11 | Lambari (Chevette) | (a), plano B (c)/(d) | Chevrolet chevette (Macedo) | 0 | conferir a malha antes |
| 12 | Jabuti (147) | (a) | Fiat 147 Low Poly (4kuma.design), 1,9 mil | 0 | sobra orçamento para detalhe |

**Total de créditos do Meshy se TODOS fossem por ele: 360 (1 tentativa cada), ~720 (2 tentativas cada); a rota recomendada: 0.**

## O que precisa do dono / do PC dele

1. **Aprovar** a rota (a)+(d), e que o carro sai de modelo de terceiro (CC BY): crédito na tela de créditos.
2. **Abrir os 12 candidatos no Sketchfab** (ou deixar baixar pelo token do proxy) e dizer qual silhueta prefere em #1, #2, #5, #8, #11: eu só vi a miniatura.
3. **Advogado** (antes da Steam): formato do Fusca e da Kombi (VW), grade/lanterna do Palio e do 207 mesmo redesenhados, e o fato de partir de um modelo de carro real (a licença CC BY cobre o arquivo, não a marca).
4. Se quiser conferir ou esculpir à mão: **Blender no PC dele** (grátis; abre o `.glb` do jogo). **Unity e Unreal não são necessários**; só o Blender faz o papel de autoria.
5. Meshy só se o dono quiser: ele vê a lista e define o teto (360 a 720) e aceita o EULA/login.

## Fontes (todas consultadas hoje)

- Sketchfab API v3: `https://api.sketchfab.com/v3/search` e `/v3/models/<uid>` (licença, `faceCount`, `materialCount`, `textureCount`, autor).
- Kenney Car Kit 3.1: `https://kenney.nl/assets/car-kit` (CC0, `License.txt` do pacote).
- Poly Haven API: `https://api.polyhaven.com/assets?t=models`.
- Teste do `bpy`: `pip install bpy` (5.0.1), venv em diretório novo, `python3 -I`.
