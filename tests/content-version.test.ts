// Versão do conteúdo (src/game/content-version.ts): a impressão de uma volta — física, carro de fábrica e
// traçado da pista — decide se um fantasma ou um recorde é desta versão do jogo. A do online continua a mesma.
import { describe, expect, it } from 'vitest';
import { GEAR_TOP } from '../src/core/constants';
import { CARS } from '../src/core/data/cars';
import { getTrack, TRACKS } from '../src/core/track';
import type { HumanEntry, RaceResultRow, Segment, SpriteRef } from '../src/core/types';
import {
  onlineFingerprint, contentFingerprint, fingerprintContent, lapContent, lapFingerprint, PHYSICS_REVISION, trackLength,
} from '../src/game/content-version';
import type { BestLap } from '../src/game/contracts';
import { COSMETICS_CATALOG } from '../src/game/cosmetics';
import * as online from '../src/game/online-session';
import { recordFromOtherVersion, recordRaceResults, sanitizeSave } from '../src/game/save';

/** Muda um valor, confere e desfaz (o conteúdo é global: nada pode vazar para os outros testes). */
function withTweak(apply: () => () => void, check: () => void): void {
  const undo = apply();
  try { check(); } finally { undo(); }
}

function set<T extends object, K extends keyof T>(obj: T, key: K, value: T[K]): () => void {
  const old = obj[key];
  obj[key] = value;
  return () => { obj[key] = old; };
}

function falcao() {
  const car = CARS.find((c) => c.id === 'falcao');
  if (!car) throw new Error('falcao');
  return car;
}

function firstSegment(pred: (s: Segment) => boolean): Segment {
  const seg = getTrack('copacabana').segments.find(pred);
  if (!seg) throw new Error('segmento');
  return seg;
}

function firstSprite(solid: boolean): SpriteRef {
  const sp = getTrack('copacabana').segments.flatMap((s) => s.sprites).find((s) => s.solid === solid);
  if (!sp) throw new Error('sprite');
  return sp;
}

describe('impressão de uma volta (pista + carro)', () => {
  it('8 hex e estável; muda de pista para pista — mesmo com o mesmo comprimento — e de carro para carro', () => {
    const fp = lapFingerprint('copacabana', 'falcao');
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
    expect(lapFingerprint('copacabana', 'falcao')).toBe(fp);
    // Copacabana e Rota 66 têm o mesmo comprimento: só a impressão separa uma da outra.
    expect(trackLength('copacabana')).toBe(getTrack('copacabana').length);
    expect(trackLength('rota_66')).toBe(trackLength('copacabana'));
    expect(lapFingerprint('rota_66', 'falcao')).not.toBe(fp);
    expect(lapFingerprint('copacabana', 'trovao')).not.toBe(fp);
    expect(lapFingerprint('pista_que_nao_existe', 'falcao')).toBeNull();
    expect(lapFingerprint('copacabana', 'carro_que_nao_existe')).toBeNull();
    expect(trackLength('pista_que_nao_existe')).toBeNull();
    expect(lapContent('copacabana', 'falcao')).toMatchObject({ physics: PHYSICS_REVISION });
  });

  it('muda com o que muda a volta: constante da física, atributo do carro, curva, box, obstáculo sólido', () => {
    const fp = () => contentFingerprint(lapContent('copacabana', 'falcao'));
    const before = fp();
    const curve = firstSegment((s) => s.curve !== 0);
    const plain = firstSegment((s) => !s.pit);
    const solid = firstSprite(true);
    const tweaks: Array<[string, () => () => void]> = [
      ['constante (GEAR_TOP)', () => { const o = GEAR_TOP[0]; GEAR_TOP[0] = o + 0.01; return () => { GEAR_TOP[0] = o; }; }],
      ['aceleração do carro', () => set(falcao(), 'accel', falcao().accel + 1)],
      ['curva', () => set(curve, 'curve', curve.curve + 0.5)],
      ['box', () => set(plain, 'pit', true)],
      ['posição do obstáculo sólido', () => set(solid, 'x', solid.x + 0.1)],
      ['tamanho do obstáculo sólido', () => set(solid, 'scale', solid.scale * 1.2)],
    ];
    for (const [name, tweak] of tweaks) withTweak(tweak, () => expect(fp(), name).not.toBe(before));
    expect(fp()).toBe(before);
  });

  it('não muda com o que é só de exibição: nome, cor, texto e preço do carro, nome da pista, enfeite não sólido, zebra, relevo', () => {
    const fp = () => contentFingerprint(lapContent('copacabana', 'falcao'));
    const before = fp();
    const deco = firstSprite(false);
    const seg = getTrack('copacabana').segments[10];
    const tweaks: Array<[string, () => () => void]> = [
      ['nome do carro', () => set(falcao(), 'name', 'Falcão Novo')],
      ['cor do carro', () => set(falcao(), 'color', '#000000')],
      ['texto do carro', () => set(falcao(), 'blurb', 'outro')],
      ['preço do carro', () => set(falcao(), 'price', 999)],
      ['nome da pista', () => set(getTrack('copacabana').def, 'name', 'Outra Orla')],
      ['enfeite não sólido', () => set(deco, 'x', deco.x + 0.3)],
      ['variante do enfeite', () => set(deco, 'variant', deco.variant + 1)],
      ['zebra', () => set(seg, 'band', seg.band === 0 ? 1 : 0)],
      ['relevo', () => set(seg, 'y1', seg.y1 + 50)],
    ];
    for (const [name, tweak] of tweaks) withTweak(tweak, () => expect(fp(), name).toBe(before));
  });

  // Defeito (onda G, praças nas pistas de cidade): o builder deixou de pôr prédios sólidos em trechos das pistas de
  // cidade sem mudar a definição delas. O online só olhava as definições: um build velho e um novo entravam na mesma
  // sala e dessincronizavam na primeira batida. Obstáculo sólido construído muda a impressão do online.
  it('obstáculo sólido construído pelo builder muda a impressão do online', () => {
    const seg = getTrack('sampa_noite').segments.find((s) => s.sprites.some((sp) => sp.solid));
    if (!seg) throw new Error('sampa_noite sem obstáculo sólido');
    const before = contentFingerprint(fingerprintContent());
    withTweak(() => { const removed = seg.sprites.splice(0, seg.sprites.length); return () => { seg.sprites.push(...removed); }; },
      () => expect(contentFingerprint(fingerprintContent())).not.toBe(before));
  });

  it('a impressão do online é a mesma de antes, e o online-session só a reexporta', () => {
    expect(online.onlineFingerprint).toBe(onlineFingerprint);
    expect(online.contentFingerprint).toBe(contentFingerprint);
    expect(onlineFingerprint()).toBe(contentFingerprint(fingerprintContent()));
  });
});

function row(seat: number, totalTicks: number, bestLapTicks: number): RaceResultRow {
  return { carId: 100 + seat, seat, name: `P${seat + 1}`, teamId: 0, carDefId: 'falcao', position: seat + 1, finished: true, totalTicks, bestLapTicks, points: 0 };
}
const humans: HumanEntry[] = [
  { seat: 0, name: 'Fê', carId: 'trovao', teamId: 0, color: '#fff' },
  { seat: 1, name: 'Bia', carId: 'tornado', teamId: 0, color: '#fff' },
];

// Onda M, M1: a derrapagem muda a física de quem corre (constantes novas, IA, assistência, estado). Os valores abaixo são
// os de 2ce0f48, ANTES da M1: um recorde ou fantasma gravado com eles tem de virar "versão anterior" (docs/ondas/M/M1.md, §4.7).
describe('a derrapagem renova as versões (M1)', () => {
  const BEFORE = { revision: 1, lap: '91f7285b', lapRota66Trovao: '9b8a49fc', online: '9f6ec609' };

  it('a revisão da física subiu: 1 → 2 (presa ao hash do contra-relógio pelo sim-golden; a N1 a subiu para 3, ver abaixo)', () => {
    expect(BEFORE.revision).toBe(1);
    expect(PHYSICS_REVISION).toBeGreaterThanOrEqual(2);
    expect(lapContent('copacabana', 'falcao')).toMatchObject({ physics: PHYSICS_REVISION });
  });

  it('a impressão de uma volta mudou, em qualquer pista e carro: recorde e fantasma de antes viram "versão anterior"', () => {
    expect(lapFingerprint('copacabana', 'falcao')).not.toBe(BEFORE.lap);
    expect(lapFingerprint('rota_66', 'trovao')).not.toBe(BEFORE.lapRota66Trovao);
    const old: BestLap = { ticks: 3000, name: 'Ana', carId: 'falcao', date: '2026-10-01', fp: BEFORE.lap };
    expect(recordFromOtherVersion(old, 'copacabana')).toBe(true);
    // O recorde feito agora é desta versão; e nenhum é apagado (a marca é só aviso).
    expect(recordFromOtherVersion({ ...old, fp: lapFingerprint('copacabana', 'falcao') as string }, 'copacabana')).toBe(false);
  });

  it('a impressão do online mudou (as constantes da derrapagem; o protocolo agora é o 4): um build novo não entra na sala de um velho', () => {
    expect(onlineFingerprint()).not.toBe(BEFORE.online);
    expect(fingerprintContent()).toMatchObject({ protocol: 4 });
  });

  it('a revisão da física, sozinha, já muda a impressão da volta (cobre a mudança só de código)', () => {
    const content = lapContent('copacabana', 'falcao');
    expect(content).not.toBeNull();
    expect(contentFingerprint({ ...content, physics: PHYSICS_REVISION - 1 })).not.toBe(lapFingerprint('copacabana', 'falcao'));
  });
});

// Onda N, N1: o nitro que se ganha e a largada-foguete mudam a física de quem corre (constantes novas, a economia do nitro, o estado). Os valores
// abaixo são os de 640538f, ANTES da N1: um recorde ou fantasma gravado com eles tem de virar "versão anterior" (docs/ondas/N/N1.md, §4.10).
describe('o nitro que se ganha renova as versões (N1)', () => {
  const BEFORE_N1 = { revision: 2, lap: '4fb0f246', lapRota66Trovao: '0df4070d', online: '5b13a09a' };

  it('a revisão da física subiu: 2 → 3 (presa ao hash do contra-relógio pelo sim-golden)', () => {
    expect(BEFORE_N1.revision).toBe(2);
    expect(PHYSICS_REVISION).toBe(3);
  });

  it('a impressão de uma volta e a do online mudaram: recorde, fantasma e sala de antes viram "versão anterior"', () => {
    expect(lapFingerprint('copacabana', 'falcao')).not.toBe(BEFORE_N1.lap);
    expect(lapFingerprint('rota_66', 'trovao')).not.toBe(BEFORE_N1.lapRota66Trovao);
    expect(onlineFingerprint()).not.toBe(BEFORE_N1.online);
    const old: BestLap = { ticks: 3000, name: 'Ana', carId: 'falcao', date: '2026-10-09', fp: BEFORE_N1.lap };
    expect(recordFromOtherVersion(old, 'copacabana')).toBe(true);
  });
});

describe('recordes guardam a impressão (nenhum é apagado)', () => {
  it('recorde novo leva a impressão da pista e do carro de quem fez', () => {
    const save = sanitizeSave({});
    recordRaceResults(save, [row(0, 9100, 2800), row(1, 9000, 2900)], humans, 'copacabana', 3);
    expect(save.bestLaps.copacabana).toMatchObject({ ticks: 2800, carId: 'trovao', fp: lapFingerprint('copacabana', 'trovao') });
    expect(save.bestRaces['copacabana:3']).toMatchObject({ ticks: 9000, carId: 'tornado', fp: lapFingerprint('copacabana', 'tornado') });
    // Ida e volta pelo saneamento do save.
    expect(sanitizeSave(JSON.parse(JSON.stringify(save))).bestLaps.copacabana).toEqual(save.bestLaps.copacabana);
  });

  it('save antigo sem impressão segue igual; impressão estragada some sem levar o recorde junto', () => {
    const old: BestLap = { ticks: 3000, name: 'Ana', carId: 'falcao', date: '2026-09-01' };
    const s = sanitizeSave({ bestLaps: { copacabana: old, rota_66: { ...old, fp: 'lixo!' }, paris: { ...old, fp: 12345678 } } });
    expect(s.bestLaps.copacabana).toEqual(old);
    expect(s.bestLaps.rota_66).toEqual(old);
    expect(s.bestLaps.paris).toEqual(old);
  });

  it('"versão anterior" só com impressão presente e diferente; recorde antigo não é trocado por volta mais lenta', () => {
    const current = lapFingerprint('copacabana', 'falcao') ?? '';
    const base: BestLap = { ticks: 3000, name: 'Ana', carId: 'falcao', date: '' };
    expect(recordFromOtherVersion(base, 'copacabana')).toBe(false); // sem impressão: versão desconhecida, sem marca
    expect(recordFromOtherVersion({ ...base, fp: current }, 'copacabana')).toBe(false);
    expect(recordFromOtherVersion({ ...base, fp: 'deadbeef' }, 'copacabana')).toBe(true);
    expect(recordFromOtherVersion({ ...base, fp: current }, 'rota_66')).toBe(true); // a impressão é da pista
    const save = sanitizeSave({ bestLaps: { copacabana: { ...base, fp: 'deadbeef' } } });
    const one: HumanEntry[] = [{ seat: 0, name: 'Bia', carId: 'falcao', teamId: 0, color: '#fff' }];
    expect(recordRaceResults(save, [row(0, 9000, 3100)], one, 'copacabana', 3).map((r) => r.kind)).toEqual(['race']);
    expect(save.bestLaps.copacabana).toEqual({ ...base, fp: 'deadbeef' });
    recordRaceResults(save, [row(0, 9000, 2900)], one, 'copacabana', 3);
    expect(save.bestLaps.copacabana).toMatchObject({ ticks: 2900, name: 'Bia', fp: current });
  });
});

// Onda N, N6: a buzina e a frase vão na rede (PROTOCOL_VERSION 3), mas NÃO mudam a física: a impressão de volta não leva o protocolo
// nem nada de áudio. Valores gravados na mescla N6+N1 (física revisão 3): se um deles mudar sem a física ter mudado, a voz vazou para o conteúdo.
describe('a voz do carro renova só a impressão do online (N6)', () => {
  const AT_MERGE = { lap: '9fb16efb', lapRota66Trovao: 'e3e257b4' };
  const AT_640538F = { online: '5b13a09a' };

  it('a impressão de uma volta só depende da física: o protocolo 3 e o áudio não a mexem', () => {
    expect(lapFingerprint('copacabana', 'falcao')).toBe(AT_MERGE.lap);
    expect(lapFingerprint('rota_66', 'trovao')).toBe(AT_MERGE.lapRota66Trovao);
    expect(PHYSICS_REVISION).toBe(3);
    const old: BestLap = { ticks: 3000, name: 'Ana', carId: 'falcao', date: '2026-10-09', fp: AT_MERGE.lap };
    expect(recordFromOtherVersion(old, 'copacabana')).toBe(false);
  });

  it('a impressão do online mudou e leva o protocolo (4 desde a N3)', () => {
    expect(onlineFingerprint()).not.toBe(AT_640538F.online);
    expect(fingerprintContent()).toMatchObject({ protocol: 4 });
  });
});

// Onda N, N3: o visual do carro vai na rede (PROTOCOL_VERSION 4) e o catálogo de cosméticos entra na impressão do online, para dois builds de catálogo
// diferente nem dividirem sala (assim "id desconhecido" só pode ser adulteração). NADA disso muda a física: a impressão de uma volta é a de antes.
// Valores gravados em 80ec96e (antes da N3).
describe('o visual do carro renova só a impressão do online (N3)', () => {
  const AT_80EC96E = { lap: '9fb16efb', lapRota66Trovao: 'e3e257b4', online: '2d28a42b' };

  it('a impressão de uma volta é a de antes: cosmético não invalida recorde nem fantasma', () => {
    expect(lapFingerprint('copacabana', 'falcao')).toBe(AT_80EC96E.lap);
    expect(lapFingerprint('rota_66', 'trovao')).toBe(AT_80EC96E.lapRota66Trovao);
    expect(PHYSICS_REVISION).toBe(3);
    expect(JSON.stringify(lapContent('copacabana', 'falcao'))).not.toMatch(/cosmetic|finish|perolado/);
  });

  it('a impressão do online mudou, leva o protocolo 4 e o catálogo', () => {
    expect(onlineFingerprint()).not.toBe(AT_80EC96E.online);
    expect(fingerprintContent()).toMatchObject({ protocol: 4, cosmetics: COSMETICS_CATALOG });
  });

  it('trocar um id do catálogo muda a impressão (builds de catálogo diferente não dividem sala)', () => {
    const a = contentFingerprint(fingerprintContent());
    const cat = JSON.parse(JSON.stringify(COSMETICS_CATALOG)) as { finishes: string[] };
    cat.finishes[2] = 'perola';
    expect(contentFingerprint({ ...fingerprintContent(), cosmetics: cat })).not.toBe(a);
  });
});

// T4 (15/10/2026): as praças e os mirantes do núcleo passaram a ser abertos na escala do giro da pista (core/track/sightline.ts), a mesma do 3D desde
// a M6, e longe do resto da pista. Os prédios do builder são sólidos: nas pistas de cidade e de litoral com marco de perto ou de longe o traçado
// construído mudou, e o recorde e o fantasma delas viram "versão anterior" pela impressão da volta (nada é apagado). As outras ficam iguais.
// Valores gravados em e31d139, antes da T4 (falcao): `npx tsx` com lapFingerprint(id, 'falcao') de cada pista.
describe('as praças na escala da pista renovam a impressão só das pistas com praça (T4)', () => {
  const AT_E31D139: Record<string, string> = Object.fromEntries((
    'copacabana:9fb16efb paraty:b52254ae serra_dos_orgaos:57071ef5 ilhabela:e50dcefe campos_do_jordao:235229f9 sampa_noite:d6c21d37 ' +
    'pampulha:a028d66a ouro_preto:2eab3054 serra_da_canastra:39fa8608 itaunas:cbb62468 convento_penha:d46af011 pedra_azul:d407d1b6 ' +
    'foz_do_iguacu:8f359ade serra_do_mar:2a6c40f0 curitiba:6fd3a0a6 floripa:d774305e camboriu:2237e5b6 rio_do_rastro:11257b55 ' +
    'orla_guaiba:06347d5e cuia_gaucha:acecd46d aparados_da_serra:9cff3f40 lago_paranoa:398e61b4 torre_de_tv:5518782b brasilia:0474a0dc ' +
    'pirenopolis:cce705d8 caldas_novas:b2f5cf50 chapada_veadeiros:68462a5a bonito:c61bbcd5 campo_grande:a4872d5c estrada_parque:e0134609 ' +
    'transpantaneira:715117d7 cuiaba:bd5123ab chapada_guimaraes:fd7fde35 porto_seguro:b005ac1c salvador:2417cacd chapada_diamantina:879783f0 ' +
    'aracaju:75a6ec4f sao_cristovao:6e7480a4 xingo:f615b85e maragogi:854280b4 maceio:9aca5711 foz_sao_francisco:2c9235bb recife_antigo:d762ee31 ' +
    'olinda:81bc1ee3 noronha:9d256619 joao_pessoa:76edb235 campina_grande:d09fec5d pedra_da_boca:7ed110d9 natal:4fc23a42 ponta_negra:ba02c440 ' +
    'cajueiro_pirangi:b084f214 jericoacoara:52d97941 fortaleza_beira_mar:1e50f7e6 canoa_quebrada:fba01e11 delta_parnaiba:9152e6b2 ' +
    'sete_cidades:6b84706d serra_capivara:cbfb0dd3 sao_luis:836f25ab chapada_das_mesas:92f362e6 lencois:632c0158 alter_do_chao:6cd35b26 ' +
    'belem:ede7465f marajo:037a215f manaus:cb16b81c ponte_rio_negro:7c19e814 parintins:7eec8759 macapa:40ca4e97 pororoca_araguari:3d4ce433 ' +
    'serra_do_navio:2109eb96 boa_vista:9f835346 monte_roraima:4b853e8d lago_caracarana:6e966cef porto_velho:6f78f7da forte_principe:80e0b376 ' +
    'vale_guapore:c9026ba1 rio_branco:2a164be8 geoglifos:9dcc165b estrada_pacifico:dceaf221 jalapao:572ba045 palmas:64fe9278 ' +
    'ilha_do_bananal:e1c7b913 rota_66:1ab6585a rochosas:ab46c86c canion:b8f33e07 las_vegas:358016d9 baia_toquio:1115a433 yanbaru:a978d81f ' +
    'monte_fuji:90704e61 osaka_neon:9c4971e2 autobahn:2f94bd8a paris:8b9070da passo_alpino:117b655f monaco_noite:77153a4f kruger:a13d8d3c ' +
    'karoo:371f9836 drakensberg:2ab614b9 boa_esperanca:1dbea2ad outback:d6291307 great_ocean:496e421f daintree:ec3459d7 sydney:3ff3d6c3 ' +
    'atlantico:d1c55ddf laponia:e5b1cd09 trollstigen:50efa4e7 tromso:9beaea04 amalfi:111b7104 santorini:b581d6f6 etna:0e67305c roma:0dc887fe '
  ).trim().split(' ').map((p) => p.split(':') as [string, string]));
  const CHANGED = [
    'paraty', 'ilhabela', 'sampa_noite', 'pampulha', 'itaunas', 'convento_penha', 'curitiba', 'floripa', 'camboriu', 'orla_guaiba',
    'lago_paranoa', 'torre_de_tv', 'brasilia', 'cuiaba', 'porto_seguro', 'salvador', 'aracaju', 'maragogi', 'maceio', 'recife_antigo', 'olinda',
    'joao_pessoa', 'jericoacoara', 'fortaleza_beira_mar', 'sao_luis', 'belem', 'manaus', 'ponte_rio_negro', 'boa_vista', 'palmas', 'las_vegas',
    'baia_toquio', 'osaka_neon', 'paris', 'monaco_noite', 'sydney', 'santorini', 'roma',
  ];

  it(`${CHANGED.length} pistas mudaram de impressão (as com praça que mudou); as outras são as de antes`, () => {
    expect(Object.keys(AT_E31D139).sort()).toEqual(TRACKS.map((t) => t.id).sort());
    const changed = TRACKS.filter((t) => lapFingerprint(t.id, 'falcao') !== AT_E31D139[t.id]).map((t) => t.id);
    expect(changed).toEqual(CHANGED);
  });

  it('recorde e fantasma de antes numa pista com praça viram "versão anterior"; numa sem praça, não; o save antigo é lido igual', () => {
    const old = (track: string): BestLap => ({ ticks: 3000, name: 'Ana', carId: 'falcao', date: '2026-10-14', fp: AT_E31D139[track] });
    expect(recordFromOtherVersion(old('pampulha'), 'pampulha')).toBe(true);
    expect(recordFromOtherVersion(old('copacabana'), 'copacabana')).toBe(false);
    const save = sanitizeSave({ bestLaps: { pampulha: old('pampulha'), copacabana: old('copacabana') } });
    expect(save.bestLaps.pampulha).toEqual(old('pampulha'));
    expect(save.bestLaps.copacabana).toEqual(old('copacabana'));
  });
});
