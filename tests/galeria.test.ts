// V7 (auditoria de 14/10/2026): a galeria fixa de referência (tools/galeria/). Sem navegador: o que se prova é a parte pura —
// a lista de cenas não muda sem querer (é ela que torna o antes × depois comparável), a diferença de pixel que marca "mudou",
// e o manifest que a folha e a comparação leem. Se a imagem ficou bonita é do dono.
import { describe, expect, it } from 'vitest';
import {
  ALTURA, CENAS, contagensQueSubiram, diferencaDePixels, LARGURA, LIMIAR_PADRAO, montarManifest, mudou, rotuloSeguro, TOLERANCIA_PADRAO,
  type ResultadoDaCena,
} from '../tools/galeria/nucleo';

/** Imagem RGBA de `n` pixels, toda de uma cor. */
const imagem = (n: number, rgba: [number, number, number, number] = [10, 20, 30, 255]): Uint8ClampedArray => {
  const a = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) a.set(rgba, i * 4);
  return a;
};

describe('galeria: a lista de cenas é fixa', () => {
  it('são estas 13 cenas, nesta ordem (mudar a lista quebra a comparação com as galerias antigas: de propósito)', () => {
    expect(CENAS.map((c) => c.id)).toEqual([
      '01-copacabana-dia', '02-paraty-entardecer', '03-canion-entardecer', '04-sampa-noite', '05-monte-fuji', '06-xingo-deserto-br',
      '07-dividida-2p', '08-dividida-4p', '09-derrapagem-faiscas', '10-largada', '11-carros-de-tras', '12-menu-principal', '13-garagem',
    ]);
  });

  it('1280×720, qualidade Alta e câmera Alta explícitas em toda cena de pista (o padrão do harness pode mudar; a galeria não)', () => {
    expect([LARGURA, ALTURA]).toEqual([1280, 720]);
    for (const c of CENAS.filter((x) => x.tipo === 'pista')) {
      const q = new URLSearchParams(c.query);
      expect(q.get('q'), c.id).toBe('high');
      expect(q.get('cam'), c.id).toBe('high');
      expect(Number(q.get('frames')), c.id).toBeGreaterThan(0);
    }
  });

  it('cobre o que a auditoria pediu: as 6 paisagens, tela dividida 2 e 4, derrapagem, largada, a folha de carros e as 2 telas de menu', () => {
    const pista = (id: string) => new URLSearchParams(CENAS.find((c) => c.id === id)?.query ?? '');
    expect(['01-copacabana-dia', '02-paraty-entardecer', '03-canion-entardecer', '04-sampa-noite', '05-monte-fuji', '06-xingo-deserto-br']
      .map((id) => pista(id).get('track'))).toEqual(['copacabana', 'paraty', 'canion', 'sampa_noite', 'monte_fuji', 'xingo']);
    expect(pista('07-dividida-2p').get('humans')).toBe('2');
    expect(pista('08-dividida-4p').get('humans')).toBe('4');
    expect(pista('09-derrapagem-faiscas').get('drift')).toBe('1');
    expect(Number(pista('09-derrapagem-faiscas').get('driftlevel'))).toBeGreaterThan(0);
    expect(Number(pista('10-largada').get('ticks'))).toBeLessThan(210); // antes do "JÁ" (COUNTDOWN_TICKS)
    expect(pista('11-carros-de-tras').get('sheet')).toBe('rear');
    expect(CENAS.filter((c) => c.tipo === 'menu').map((c) => c.tela)).toEqual(['main', 'garage']);
  });

  it('ids únicos, seguros para nome de arquivo, e toda cena tem título em português', () => {
    expect(new Set(CENAS.map((c) => c.id)).size).toBe(CENAS.length);
    for (const c of CENAS) {
      expect(c.id).toMatch(/^[0-9]{2}-[a-z0-9-]+$/);
      expect(c.titulo.length, c.id).toBeGreaterThan(3);
    }
  });
});

describe('galeria: diferença de pixel', () => {
  it('imagens iguais: nenhum pixel trocado', () => {
    const d = diferencaDePixels(imagem(100), imagem(100));
    expect(d).toEqual({ total: 100, trocados: 0, fracao: 0 });
    expect(mudou(d)).toBe(false);
  });

  it('conta o pixel cujo canal mudou além da tolerância, e ignora o alfa', () => {
    const a = imagem(100); const b = imagem(100);
    b[4 * 7] += TOLERANCIA_PADRAO + 1; // R do pixel 7
    b[4 * 9 + 3] = 0; // só o alfa do pixel 9
    expect(diferencaDePixels(a, b)).toEqual({ total: 100, trocados: 1, fracao: 0.01 });
  });

  it('mudança dentro da tolerância não conta (o ruído de arredondamento não marca a cena)', () => {
    const a = imagem(100); const b = imagem(100);
    for (let i = 0; i < 100; i++) b[i * 4 + 1] += TOLERANCIA_PADRAO;
    expect(diferencaDePixels(a, b).trocados).toBe(0);
  });

  it('tamanhos diferentes: a imagem inteira conta como trocada', () => {
    expect(diferencaDePixels(imagem(100), imagem(120))).toEqual({ total: 120, trocados: 120, fracao: 1 });
  });

  it('"mudou" é a fração de pixels trocados ACIMA do limiar', () => {
    const total = 1280 * 720;
    const limite = Math.floor(total * LIMIAR_PADRAO);
    expect(mudou({ total, trocados: limite, fracao: limite / total })).toBe(false);
    expect(mudou({ total, trocados: limite + 10, fracao: (limite + 10) / total })).toBe(true);
    expect(mudou({ total, trocados: 5, fracao: 5 / total }, 0)).toBe(true);
  });

  it('é autocontida: roda dentro do navegador a partir do próprio texto (é assim que comparar.mjs a usa)', () => {
    const viaTexto = new Function(`return (${diferencaDePixels.toString()})`)() as typeof diferencaDePixels;
    const a = imagem(10); const b = imagem(10); b[0] = 200;
    expect(viaTexto(a, b, TOLERANCIA_PADRAO)).toEqual({ total: 10, trocados: 1, fracao: 0.1 });
  });
});

describe('galeria: o manifest', () => {
  const ok = (id: string, debug: ResultadoDaCena['debug']): ResultadoDaCena => ({
    id, arquivo: `${id}.png`, debug, captura: 'tela', tentativas: 1, segundos: 41.27, erros: [], alertas: [],
  });

  it('segue a ordem fixa das cenas, com rótulo, commit, data, resolução e as contagens do debugInfo()', () => {
    const data = new Date('2026-10-14T18:30:00Z');
    const m = montarManifest({
      rotulo: 'main-f241703', commit: 'f241703', ramo: 'main', sujo: false, data, raiz: '/x',
      resultados: [ok('02-paraty-entardecer', { calls: 120, triangles: 456789, frameMs: 812.345 }), ok('01-copacabana-dia', { calls: 98, triangles: 300000, frameMs: 700 })],
    });
    expect(m).toMatchObject({ versao: 1, rotulo: 'main-f241703', commit: 'f241703', ramo: 'main', sujo: false, data: '2026-10-14T18:30:00.000Z', resolucao: '1280x720', qualidade: 'high' });
    expect(m.cenas.map((c) => c.id)).toEqual(CENAS.map((c) => c.id));
    expect(m.cenas[0]).toMatchObject({ id: '01-copacabana-dia', titulo: CENAS[0].titulo, chamadas: 98, triangulos: 300000, msQuadro: 700, captura: 'tela' });
    expect(m.cenas[1]).toMatchObject({ chamadas: 120, triangulos: 456789, msQuadro: 812.3, segundos: 41.3 });
  });

  it('cena que não rodou fica no manifest como "falhou", sem contagens', () => {
    const m = montarManifest({ rotulo: 'x', commit: 'abc1234', ramo: 'nc/x', sujo: true, data: new Date(0), raiz: '/x', resultados: [] });
    expect(m.cenas).toHaveLength(CENAS.length);
    expect(m.cenas.every((c) => c.captura === 'falhou' && c.chamadas === null && c.triangulos === null && c.msQuadro === null)).toBe(true);
  });

  it('contagens que subiram: chamadas e triângulos (o ms do quadro no swiftshader é ruído e não marca)', () => {
    const base = { chamadas: 100, triangulos: 1000, msQuadro: 500 };
    expect(contagensQueSubiram(base, { chamadas: 101, triangulos: 1000, msQuadro: 900 })).toEqual(['chamadas']);
    expect(contagensQueSubiram(base, { chamadas: 90, triangulos: 2000, msQuadro: 100 })).toEqual(['triangulos']);
    expect(contagensQueSubiram(base, { chamadas: null, triangulos: null, msQuadro: null })).toEqual([]);
  });

  it('o rótulo vira nome de pasta seguro', () => {
    expect(rotuloSeguro('nc/cor-brilho@abc 1')).toBe('nc-cor-brilho-abc-1');
    expect(rotuloSeguro('main-f241703')).toBe('main-f241703');
  });
});
