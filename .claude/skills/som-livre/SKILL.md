---
name: som-livre
description: 'Procura, confere a licença, trata e registra efeito sonoro e música do Speed Tchê, na mesma linha da skill modelo-3d. Use antes de baixar, gravar ou gerar qualquer som, quando o Felipe pedir "põe um som de...", "troca a música" ou "falta áudio", e sempre que um som novo entrar no jogo.'
---
# Som livre: procurar, conferir, registrar

Regra do Speed Tchê: dependência de produção é só o `three`. O som é procedural (WebAudio em `src/audio/`), com 8 amostras Kenney CC0
em `src/assets/audio/`. Música e efeitos licenciados ou contratados só se o Felipe aprovar no Marco 2 (`docs/CRONOGRAMA.md`,
decisão nº 6); nada de música dos jogos originais. Não há regra escrita sobre som ou música por IA: pergunte ao Felipe antes.

## Onde procurar, nesta ordem

1. O que o jogo já tem: o sintetizado (`sfx.ts`, `engine.ts`, `horn.ts`, `music.ts`) e as amostras de `src/assets/audio/` (papel de
   cada arquivo em `SAMPLE_FILES`, `src/audio/samples.ts`).
2. **Sonniss GDC Game Audio Bundle**: milhares de efeitos gravados por estúdios, livres para jogo comercial, sem crédito
   obrigatório. A licença proíbe redistribuir o som solto: o som vai embutido no repositório, que é público: a Sonniss só entra se o Felipe decidir, e o arquivo cru fica
   fora do git.
3. **Kenney** (pacotes de áudio CC0) e **Freesound** filtrado por licença **CC0** (ou CC BY, com crédito). O download
   do Freesound em qualidade original exige login: quem baixa é o Felipe.
4. **OpenGameArt**: só itens CC0 ou CC BY; confira a licença item por item, não a do pacote.
5. Gerar ou encomendar: pergunte ao Felipe; geração em tempo de jogo é proibida (`docs/DIRECAO-DE-ARTE.md`).

Recusa: NC, ND, "uso pessoal", som de outro jogo ou filme, música com letra ou melodia conhecida, a BBC Sound Effects
(licença não comercial), e som de marca (vinheta, buzina registrada).

## Tratar antes de entrar

- Corte o silêncio do começo e do fim e confira se não estala no corte.
- Volume: normalize por categoria com o ffmpeg. Sem alvo escrito no jogo, use -23 LUFS integrado e pico de -1 dBTP:
  ```bash
  ffmpeg -i entrada.wav -af loudnorm=I=-23:TP=-1:LRA=11 -ar 48000 saida.wav
  ```
- Formato: `.ogg` (o carregador só lê `.ogg`), abaixo de 80 KB por arquivo, começando com `OggS`, embutido por `?inline`; o
  `tests/audio-samples.test.ts` cobra isso. Para converter: `ffmpeg -i saida.wav -c:a libvorbis -q:a 3 som.ogg`.

## Registrar (no mesmo commit)

Uma linha na tabela "Efeitos sonoros em amostra" do `docs/ARTE.md` (arquivo, pacote e autor, licença, papel no
jogo), o `LICENSE-*.txt` do pacote ao lado do som e o papel em `SAMPLE_FILES`. Atualize também o texto de créditos
(`src/ui/strings.ts`).
Som gerado por IA entra marcado e vai para a declaração (skill `declaracao-ia`).
