// Galeria fixa de referência (V7, auditoria de 14/10/2026): a parte pura — a lista fixa de cenas, a diferença de pixel, o manifest e o
// HTML da folha e da comparação. Sem navegador e sem disco: `gerar.mjs` e `comparar.mjs` fazem a E/S e importam este arquivo direto
// (o Node 22.18+ tira os tipos sozinho); `tests/galeria.test.ts` o testa. Por isso: nada de enum/namespace, e as funções que rodam
// DENTRO da página (`diferencaDePixels`, `luminanciaMedia`) são autocontidas — vão para o navegador pelo próprio texto.

/** Resolução de toda cena (a folha e a comparação dependem de ser sempre a mesma). */
export const LARGURA = 1280;
export const ALTURA = 720;
/** Diferença por canal (0–255) que ainda conta como "igual": o arredondamento de cor não marca a cena. */
export const TOLERANCIA_PADRAO = 8;
/** Fração de pixels trocados acima da qual a cena "mudou" (0,1% ≈ 920 pixels de 1280×720). */
export const LIMIAR_PADRAO = 0.001;

export interface Cena {
  /** Estável: vira o nome do PNG e casa a cena entre duas galerias. Prefixo numérico = ordem na folha. */
  id: string;
  titulo: string;
  detalhe: string;
  /** `pista`: tools/render-harness.html com `query`; `menu`: o jogo (index.html) com a tela `tela`. */
  tipo: 'pista' | 'menu';
  query?: string;
  tela?: 'main' | 'garage';
  /** O quadro tem o HUD da corrida (a folha de carros e as telas de menu não têm). */
  hud: boolean;
}

/** Toda cena de pista na qualidade Alta e na câmera Alta, explícitas: se o padrão do harness mudar, a galeria não muda junto. */
const pista = (q: string): string => `${q}&q=high&cam=high`;

/**
 * As cenas fixas. Mudar esta lista quebra a comparação com as galerias já geradas — só de propósito, e com o teste junto.
 * Os segmentos (`seg`) ficam uns 50 antes do marco da pista (`npx tsx tools/landmark-sight.ts <pista>`), para o marco entrar no quadro.
 */
export const CENAS: readonly Cena[] = [
  { id: '01-copacabana-dia', titulo: 'Copacabana · dia', detalhe: 'câmera Alta (padrão) · o Pão de Açúcar à direita', tipo: 'pista', query: pista('track=copacabana&seg=300&frames=14'), hud: true },
  { id: '02-paraty-entardecer', titulo: 'Paraty · entardecer', detalhe: 'litoral aberto · casario e escunas', tipo: 'pista', query: pista('track=paraty&seg=90&frames=14'), hud: true },
  { id: '03-canion-entardecer', titulo: 'Cânion de Nevada · entardecer', detalhe: 'deserto ao pôr do sol · cactos e mesetas', tipo: 'pista', query: pista('track=canion&seg=130&frames=14'), hud: true },
  { id: '04-sampa-noite', titulo: 'Sampa · noite', detalhe: 'cidade à noite · chegando ao MASP', tipo: 'pista', query: pista('track=sampa_noite&seg=970&frames=14'), hud: true },
  { id: '05-monte-fuji', titulo: 'Monte Fuji · dia', detalhe: 'montanha · a reta antes da subida, o pico ao fundo', tipo: 'pista', query: pista('track=monte_fuji&seg=80&frames=14'), hud: true },
  { id: '06-xingo-deserto-br', titulo: 'Xingó · dia', detalhe: 'deserto do Brasil · cânion e a flora do sertão', tipo: 'pista', query: pista('track=xingo&seg=110&frames=14'), hud: true },
  { id: '07-dividida-2p', titulo: 'Tela dividida · 2 jogadores', detalhe: 'Copacabana · no meio do pelotão', tipo: 'pista', query: pista('track=copacabana&humans=2&ticks=1500&frames=24'), hud: true },
  { id: '08-dividida-4p', titulo: 'Tela dividida · 4 jogadores', detalhe: 'Copacabana · no meio do pelotão', tipo: 'pista', query: pista('track=copacabana&humans=4&ticks=1500&frames=24'), hud: true },
  { id: '09-derrapagem-faiscas', titulo: 'Derrapagem com faíscas', detalhe: 'Copacabana · carga máxima do mini-turbo (faísca roxa)', tipo: 'pista', query: pista('track=copacabana&ticks=1500&drift=1&driftlevel=3&frames=24'), hud: true },
  { id: '10-largada', titulo: 'Largada · contagem', detalhe: 'Copacabana · o grid parado no "2"', tipo: 'pista', query: pista('track=copacabana&ticks=76&frames=24'), hud: true },
  { id: '11-carros-de-tras', titulo: 'Os 14 carros, de trás', detalhe: 'folha de contato · os 13 estilos e o 2º GT', tipo: 'pista', query: pista('track=copacabana&sheet=rear&frames=3'), hud: false },
  { id: '12-menu-principal', titulo: 'Menu principal', detalhe: 'save vazio · fundo 3D do menu', tipo: 'menu', tela: 'main', hud: false },
  { id: '13-garagem', titulo: 'Garagem', detalhe: 'carreira nova · 1 piloto (Falcão)', tipo: 'menu', tela: 'garage', hud: false },
];

export interface Diferenca { total: number; trocados: number; fracao: number }

/**
 * Quantos pixels mudaram entre duas imagens RGBA do mesmo tamanho (um pixel conta se algum canal de cor mudou mais que `tolerancia`;
 * o alfa não conta). Tamanhos diferentes: a imagem inteira conta como trocada. AUTOCONTIDA (roda na página pelo próprio texto).
 */
export function diferencaDePixels(a: ArrayLike<number>, b: ArrayLike<number>, tolerancia = 8): Diferenca {
  if (a.length !== b.length) {
    const total = Math.max(a.length, b.length) / 4;
    return { total, trocados: total, fracao: 1 };
  }
  const total = a.length / 4;
  let trocados = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i] - b[i]) > tolerancia || Math.abs(a[i + 1] - b[i + 1]) > tolerancia || Math.abs(a[i + 2] - b[i + 2]) > tolerancia) trocados++;
  }
  return { total, trocados, fracao: total === 0 ? 0 : trocados / total };
}

/** Luminância média (0–1) de uma imagem RGBA, num pixel a cada 4: a cena "quase preta" vira alerta. AUTOCONTIDA. */
export function luminanciaMedia(rgba: ArrayLike<number>): number {
  let soma = 0; let n = 0;
  for (let i = 0; i < rgba.length; i += 16) { soma += (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255; n++; }
  return n === 0 ? 0 : soma / n;
}

/** Abaixo disto a cena é "quase preta" (a captura de Sampa na largada saía assim). */
export const LUMINANCIA_MINIMA = 0.03;

export function mudou(d: Diferenca, limiar = LIMIAR_PADRAO): boolean {
  return d.fracao > limiar;
}

/** Rótulo → nome de pasta: só letras, dígitos, ponto, hífen e sublinhado. */
export function rotuloSeguro(rotulo: string): string {
  return rotulo.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

/** O que `gerar.mjs` mediu de uma cena. `debug` é o `debugInfo()` do renderizador no quadro capturado. */
export interface ResultadoDaCena {
  id: string;
  arquivo: string;
  debug: { calls: number; triangles: number; frameMs: number } | null;
  /** `tela`: screenshot da página (com HUD e menus); `canvas`: o canvas exportado direto (o screenshot estourou o tempo; sem DOM). */
  captura: 'tela' | 'canvas' | 'falhou';
  tentativas: number;
  segundos: number;
  erros: string[];
  alertas: string[];
}

export interface Contagens { chamadas: number | null; triangulos: number | null; msQuadro: number | null }

export interface CenaDoManifest extends Contagens {
  id: string; titulo: string; detalhe: string; arquivo: string | null; origem: string;
  captura: ResultadoDaCena['captura']; tentativas: number; segundos: number; erros: string[]; alertas: string[];
}

export interface Manifest {
  versao: 1;
  rotulo: string; commit: string; ramo: string; sujo: boolean; data: string; raiz: string;
  resolucao: string; qualidade: 'high';
  cenas: CenaDoManifest[];
}

const umaCasa = (x: number): number => Math.round(x * 10) / 10;

/** O manifest na ordem fixa de `CENAS`; a cena sem resultado entra como "falhou". */
export function montarManifest(args: { rotulo: string; commit: string; ramo: string; sujo: boolean; data: Date; raiz: string; resultados: readonly ResultadoDaCena[] }): Manifest {
  const porId = new Map(args.resultados.map((r) => [r.id, r]));
  return {
    versao: 1,
    rotulo: args.rotulo, commit: args.commit, ramo: args.ramo, sujo: args.sujo, data: args.data.toISOString(), raiz: args.raiz,
    resolucao: `${LARGURA}x${ALTURA}`, qualidade: 'high',
    cenas: CENAS.map((c) => {
      const r = porId.get(c.id);
      const origem = c.tipo === 'pista' ? `tools/render-harness.html?${c.query}` : `index.html?nosurvey=1 · menus.show('${c.tela}')`;
      if (!r) return { id: c.id, titulo: c.titulo, detalhe: c.detalhe, arquivo: null, origem, chamadas: null, triangulos: null, msQuadro: null, captura: 'falhou', tentativas: 0, segundos: 0, erros: [], alertas: [] };
      return {
        id: c.id, titulo: c.titulo, detalhe: c.detalhe, arquivo: r.captura === 'falhou' ? null : r.arquivo, origem,
        chamadas: r.debug?.calls ?? null, triangulos: r.debug?.triangles ?? null, msQuadro: r.debug ? umaCasa(r.debug.frameMs) : null,
        captura: r.captura, tentativas: r.tentativas, segundos: umaCasa(r.segundos), erros: r.erros, alertas: r.alertas,
      };
    }),
  };
}

/** As contagens que subiram do antes para o depois. O ms do quadro fica de fora: no swiftshader, com a máquina carregada, é ruído. */
export function contagensQueSubiram(antes: Contagens, depois: Contagens): Array<'chamadas' | 'triangulos'> {
  const subiu: Array<'chamadas' | 'triangulos'> = [];
  for (const k of ['chamadas', 'triangulos'] as const) {
    const a = antes[k]; const d = depois[k];
    if (a !== null && d !== null && d > a) subiu.push(k);
  }
  return subiu;
}

// ───────────────────────────── HTML da folha e da comparação (a página vira PNG no Chromium) ─────────────────────────────

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inteiro = (n: number): string => Math.round(n).toLocaleString('pt-BR');
/** Triângulos curtos: "845 mil", "1,24 mi". */
export function triangulosCurto(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString('pt-BR')} mil`;
  return inteiro(n);
}
const contagensTexto = (c: Contagens): string => (c.chamadas === null
  ? 'sem contagens'
  : `${inteiro(c.chamadas)} chamadas · ${triangulosCurto(c.triangulos ?? 0)} △ · ${inteiro(c.msQuadro ?? 0)} ms/quadro`);
/** "14/10/2026 15:30" no fuso de Brasília (o do dono). */
export function dataCurta(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
const cabecalhoDe = (m: Manifest): string => `${esc(m.rotulo)} · ${esc(m.commit)}${m.sujo ? ' (com mudanças fora do commit)' : ''} · ${esc(dataCurta(m.data))}`;

const ESTILO = `
*{box-sizing:border-box}body{margin:0;background:#101318;color:#eef1f5;font-family:"DejaVu Sans","Liberation Sans",sans-serif}
header{padding:22px 24px 10px}h1{margin:0;font-size:40px}header p{margin:6px 0 0;font-size:24px;color:#aab3c0}
.g{display:grid;gap:18px;padding:14px 24px 28px}figure{margin:0;background:#1a1f27;border-radius:10px;overflow:hidden}
.q{position:relative;aspect-ratio:16/9;background:#000}.q img{width:100%;height:100%;object-fit:contain;display:block}
.vazio{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:34px;color:#ff8a80}
figcaption{padding:12px 16px 14px}.t{font-size:34px;font-weight:700}.d{font-size:23px;color:#c3cad4;margin-top:4px}
.n{font-size:23px;color:#9fb4c8;margin-top:6px}.a{font-size:23px;color:#ffb74d;margin-top:6px;font-weight:700}
.tag{position:absolute;left:10px;top:10px;font-size:22px;font-weight:700;padding:3px 10px;border-radius:6px;background:#000a}
.mudou{outline:6px solid #ff5252}.badge{display:inline-block;font-size:24px;font-weight:700;padding:3px 12px;border-radius:8px;margin-left:10px;vertical-align:4px}
.b-mudou{background:#ff5252;color:#fff}.b-igual{background:#2e7d32;color:#fff}.b-sem{background:#616161;color:#fff}.up{color:#ff8a80;font-weight:700}
`;

function quadro(src: string | null, tag = ''): string {
  return `<div class="q">${src ? `<img src="${esc(src)}">` : '<div class="vazio">sem imagem</div>'}${tag ? `<span class="tag">${esc(tag)}</span>` : ''}</div>`;
}

/** A folha de uma galeria: 2 colunas, legenda grande embaixo de cada quadro (lida no celular com zoom). `pasta` prefixa os arquivos. */
export function htmlDaFolha(m: Manifest, pasta = ''): string {
  const cells = m.cenas.map((c) => {
    const avisos = [...c.alertas, ...(c.captura === 'canvas' ? ['capturada pelo canvas: sem HUD nem menus'] : []), ...(c.captura === 'falhou' ? ['falhou'] : []), ...(c.erros.length ? [`${c.erros.length} erro(s) na página`] : [])];
    return `<figure>${quadro(c.arquivo ? pasta + c.arquivo : null)}<figcaption><div class="t">${esc(c.titulo)}</div><div class="d">${esc(c.detalhe)}</div>`
      + `<div class="n">${esc(contagensTexto(c))}</div>${avisos.length ? `<div class="a">⚠ ${esc(avisos.join(' · '))}</div>` : ''}</figcaption></figure>`;
  }).join('');
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>${ESTILO}.g{grid-template-columns:1fr 1fr;width:1660px}</style>`
    + `<header><h1>Galeria · ${cabecalhoDe(m)}</h1><p>Speed Tchê · ${m.cenas.length} quadros fixos · ${LARGURA}×${ALTURA} · qualidade Alta · câmera Alta</p></header>`
    + `<div class="g">${cells}</div></html>`;
}

const NOME_DA_CONTAGEM = { chamadas: 'chamadas', triangulos: 'triângulos' } as const;

/** Uma linha da comparação: a cena nas duas galerias, a diferença de pixel (null = falta imagem num dos lados) e as contagens. */
export interface LinhaDaComparacao { antes: CenaDoManifest; depois: CenaDoManifest; diferenca: Diferenca | null; mudou: boolean; subiram: Array<'chamadas' | 'triangulos'> }

const seta = (a: number | null, d: number | null, fmt: (x: number) => string, subiu: boolean): string =>
  (a === null || d === null ? '—' : a === d ? fmt(d) : `${fmt(a)} → <span class="${subiu ? 'up' : ''}">${fmt(d)}${subiu ? ' ▲' : ''}</span>`);

/** A comparação antes | depois, uma linha por cena; a cena que mudou ganha moldura vermelha, e a contagem que subiu, ▲. */
export function htmlDaComparacao(a: Manifest, b: Manifest, linhas: readonly LinhaDaComparacao[], pastaA: string, pastaB: string, limiar = LIMIAR_PADRAO): string {
  const mudaram = linhas.filter((l) => l.mudou);
  const subiram = linhas.filter((l) => l.subiram.length);
  const rows = linhas.map((l) => {
    const pct = l.diferenca ? (l.diferenca.fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '';
    const badge = !l.diferenca ? '<span class="badge b-sem">sem imagem</span>' : l.mudou ? `<span class="badge b-mudou">MUDOU · ${pct}% dos pixels</span>` : '<span class="badge b-igual">igual</span>';
    const nums = `chamadas ${seta(l.antes.chamadas, l.depois.chamadas, inteiro, l.subiram.includes('chamadas'))} · △ ${seta(l.antes.triangulos, l.depois.triangulos, triangulosCurto, l.subiram.includes('triangulos'))}`
      + ` · ms ${seta(l.antes.msQuadro, l.depois.msQuadro, inteiro, false)}`;
    return `<figure class="${l.mudou ? 'mudou' : ''}"><figcaption><div class="t">${esc(l.depois.titulo)}${badge}</div><div class="n">${nums}</div></figcaption>`
      + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${quadro(l.antes.arquivo ? pastaA + l.antes.arquivo : null, 'ANTES')}${quadro(l.depois.arquivo ? pastaB + l.depois.arquivo : null, 'DEPOIS')}</div></figure>`;
  }).join('');
  const semImagem = linhas.filter((l) => !l.diferenca);
  const resumo = `${mudaram.length} de ${linhas.length} cenas mudaram${mudaram.length ? `: ${mudaram.map((l) => l.depois.titulo).join(', ')}` : ''}`
    + `${semImagem.length ? ` · sem imagem num dos lados: ${semImagem.map((l) => l.depois.titulo).join(', ')}` : ''}`
    + ` · contagens que subiram: ${subiram.length ? subiram.map((l) => `${l.depois.titulo} (${l.subiram.map((k) => NOME_DA_CONTAGEM[k]).join(', ')})`).join(', ') : 'nenhuma'}`;
  const limiarPct = (limiar * 100).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>${ESTILO}.g{grid-template-columns:1fr;width:1660px}</style>`
    + `<header><h1>Antes: ${cabecalhoDe(a)}</h1><h1>Depois: ${cabecalhoDe(b)}</h1><p>${esc(resumo)}</p>`
    + `<p>"Mudou" = mais de ${limiarPct}% dos pixels com algum canal diferente em mais de ${TOLERANCIA_PADRAO}/255.</p></header><div class="g">${rows}</div></html>`;
}
