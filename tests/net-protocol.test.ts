// Protocolo do online: entrada compacta, validação de tudo o que chega da rede.
import { describe, expect, it } from 'vitest';
import { CARS } from '../src/core/data/cars';
import { TRACKS } from '../src/core/track';
import { FINISH_IDS, FLAME_IDS, FREE_COLORS, RIM_IDS, STRIPE_IDS, WHEEL_LISTS } from '../src/game/cosmetics';
import {
  decodeInput, encodeInput, INPUT_BIT, normalizeRoomCode, normalizeServerUrl, packRecords, parseServerMessage, PROTOCOL_VERSION,
  parseClientInfo, parseStartConfig, quantizeSteer, TAKEOVER_BIT, TAUNT_COUNT, TAUNT_SHIFT, unpackRecords, type ContentRules, type RoomSettings, type StartConfig,
} from '../src/net/protocol';

const RULES: ContentRules = { cars: CARS.map((c) => c.id), tracks: TRACKS.map((t) => t.id) };
const SETTINGS: RoomSettings = {
  trackId: TRACKS[0].id, laps: 3, versus: false, difficulty: 'profissional', totalCars: 12, manualGear: false,
  assists: { sharedNitro: true, tow: true, teamDraft: true, catchup: true }, delay: 3,
};
const START: StartConfig = { ...SETTINGS, seed: 123456, seats: [{ seat: 0, client: 0, name: 'Ana', car: 'falcao' }, { seat: 1, client: 1, name: 'Bia', car: 'trovao' }] };
const parse = (m: unknown) => parseServerMessage(typeof m === 'string' ? m : JSON.stringify(m), RULES);

describe('entrada compacta', () => {
  it('bits e volante em int8 vão e voltam', () => {
    const input = { steer: -0.5, throttle: true, brake: false, nitro: true, gearUp: false, gearDown: true, drift: false };
    const { bits, steer } = encodeInput(input);
    expect(bits).toBe(1 + 4 + 16);
    expect(steer).toBe(-64);
    expect(decodeInput(bits, steer)).toEqual({ ...input, steer: -64 / 127, horn: false });
  });

  it('o bit de derrapar (32) vai e volta; sem ele a entrada decodificada diz derrapar: falso', () => {
    expect(INPUT_BIT.drift).toBe(32);
    const input = { steer: 0.25, throttle: true, brake: false, nitro: false, gearUp: false, gearDown: false, drift: true };
    const { bits, steer } = encodeInput(input);
    expect(bits).toBe(1 + 32);
    expect(decodeInput(bits, steer)).toEqual({ ...input, steer: 32 / 127, horn: false });
    // Sem o campo (quem monta o PlayerInput sem saber da derrapagem) ou com ele falso, o bit não sai.
    expect(encodeInput({ steer: 0, throttle: true, brake: false, nitro: false, gearUp: false, gearDown: false }).bits).toBe(1);
    expect(encodeInput({ ...input, drift: false }).bits).toBe(1);
    expect(decodeInput(1, 0).drift).toBe(false);
    // O bit 32 convive com todos os outros: toda combinação de 7 bits (com a buzina, N6) vai e volta.
    for (let b = 0; b < 128; b++) expect(encodeInput(decodeInput(b, 0)).bits, `bits ${b}`).toBe(b);
  });

  it('o volante é quantizado de forma estável (decodificar e codificar de novo não muda nada)', () => {
    for (let q = -127; q <= 127; q++) expect(encodeInput(decodeInput(0, q)).steer).toBe(q);
    expect(quantizeSteer(2)).toBe(127);
    expect(quantizeSteer(-9)).toBe(-127);
    expect(quantizeSteer(Number.NaN)).toBe(0);
    expect(decodeInput(0, 127).steer).toBe(1);
  });

  it('registros vão para a lista plana e voltam', () => {
    const recs = [{ tick: 10, seat: 0, bits: 5, steer: -3 }, { tick: 11, seat: 3, bits: TAKEOVER_BIT, steer: 0 }];
    expect(unpackRecords(packRecords(recs))).toEqual(recs);
  });

  it('registros com o bit de derrapar são aceitos', () => {
    const recs = [{ tick: 10, seat: 0, bits: 32, steer: 5 }, { tick: 11, seat: 2, bits: 1 + 32 + 4, steer: -127 }];
    expect(unpackRecords(packRecords(recs))).toEqual(recs);
  });

  it('registros fora do formato são recusados por inteiro', () => {
    const bad: unknown[] = [
      null, 'x', [], [1, 2, 3], [1.5, 0, 0, 0], [-1, 0, 0, 0], [1, 4, 0, 0], [1, 0, 4096, 0], [1, 0, 0, 128],
      [1, 0, 9 << 8, 0], [1, 0, 15 << 8 | 1, 0], // frase 9..15: só existem 8 (índice + 1 = 1..8)
      [1, 0, 3.5, 0], [1, 0, -1, 0],
      [1, 0, TAKEOVER_BIT | 32, 0], // tomada misturada com a derrapagem
      [1, 0, TAKEOVER_BIT | 64, 0], // tomada misturada com a buzina
      [1, 0, TAKEOVER_BIT | (1 << 8), 0], // tomada misturada com uma frase
      [1, 0, TAKEOVER_BIT | 1, 0], // tomada misturada com pedal
      [1, 0, TAKEOVER_BIT, 5], // tomada com volante
      [1, 0, '1', 0],
      new Array(4 * 65).fill(0), // mais registros que o limite por mensagem
    ];
    for (const d of bad) expect(unpackRecords(d), JSON.stringify(d)?.slice(0, 40)).toBeNull();
  });
});

// Onda N, N6: a buzina (nível, bit 64) e a frase de provocação (borda, índice 0..7 nos bits 8–11 como índice + 1) vão na entrada.
// O formato do registro [tick, assento, bits, volante] não muda; só a faixa dos bits (docs/ondas/N/N6.md, §4.3).
describe('buzina e frase na entrada (N6)', () => {
  const base = { steer: 0, throttle: false, brake: false, nitro: false, gearUp: false, gearDown: false };

  it('a buzina é o bit 64; a tomada pela IA segue sozinha no 128 (o protocolo subiu para o 4 com o visual, N3: os bits não mudaram)', () => {
    expect(PROTOCOL_VERSION).toBe(4);
    expect(INPUT_BIT.horn).toBe(64);
    expect(TAKEOVER_BIT).toBe(128);
    expect(TAUNT_COUNT).toBe(8);
    expect(TAUNT_SHIFT).toBe(8);
  });

  it('a buzina vai e volta; sem o campo, ou falsa, o bit não sai', () => {
    const { bits, steer } = encodeInput({ ...base, throttle: true, horn: true });
    expect(bits).toBe(1 + 64);
    expect(decodeInput(bits, steer)).toMatchObject({ throttle: true, horn: true });
    expect(encodeInput(base).bits).toBe(0);
    expect(encodeInput({ ...base, horn: false }).bits).toBe(0);
    expect(decodeInput(0, 0).horn).toBe(false);
  });

  it('a frase 0..7 vai e volta como índice + 1 nos bits 8–11, ao lado de todos os bits de jogador', () => {
    let checked = 0;
    for (let taunt = 0; taunt < 8; taunt++) {
      for (const player of [0, 1, 63, 64, 127]) {
        checked++;
        const input = decodeInput(player, 0);
        const { bits } = encodeInput({ ...input, taunt });
        expect(bits, `frase ${taunt} + ${player}`).toBe(player | ((taunt + 1) << TAUNT_SHIFT));
        expect(decodeInput(bits, 0).taunt, `frase ${taunt} + ${player}`).toBe(taunt);
        expect(encodeInput(decodeInput(bits, 0)).bits).toBe(bits);
      }
    }
    expect(checked).toBe(40);
  });

  it('sem frase a entrada decodificada nem tem a chave; frase fora de 0..7 não é codificada', () => {
    expect('taunt' in decodeInput(127, 0)).toBe(false);
    for (const bad of [-1, 8, 9, 1.5, Number.NaN, Infinity]) expect(encodeInput({ ...base, taunt: bad }).bits, String(bad)).toBe(0);
    expect(encodeInput({ ...base, taunt: undefined }).bits).toBe(0);
  });

  it('registros com buzina e frase são aceitos; os bits de cada registro voltam iguais', () => {
    const recs = [
      { tick: 10, seat: 0, bits: 64, steer: 0 }, { tick: 11, seat: 1, bits: 1 + 32 + 64, steer: -127 },
      { tick: 12, seat: 2, bits: 1 << 8, steer: 3 }, { tick: 13, seat: 3, bits: (8 << 8) | 127, steer: 127 },
    ];
    expect(unpackRecords(packRecords(recs))).toEqual(recs);
  });

  it('mensagem de entrada de um cliente v3 passa pela validação do servidor (parseServerMessage)', () => {
    const d = packRecords([{ tick: 5, seat: 1, bits: (3 << 8) | 64 | 1, steer: 9 }]);
    expect(parse({ t: 'i', from: 1, d })).toEqual({ t: 'i', from: 1, records: [{ tick: 5, seat: 1, bits: (3 << 8) | 64 | 1, steer: 9 }] });
  });
});

describe('mensagens do servidor', () => {
  it('JSON quebrado, tipo desconhecido e campos faltando viram null', () => {
    for (const raw of ['{', 'null', '[]', '"oi"', '{"t":"nada"}', '{"t":5}', JSON.stringify({ t: 'welcome', room: 'abc', id: 0, token: 'x' })]) {
      expect(parseServerMessage(raw, RULES), raw).toBeNull();
    }
    expect(parseServerMessage(42, RULES)).toBeNull();
    expect(parseServerMessage('x'.repeat(300 * 1024), RULES)).toBeNull();
  });

  it('boas-vindas, erro, pong e evento de par válidos passam', () => {
    expect(parse({ t: 'welcome', room: 'ABCDE', id: 2, token: 'a1b2c3d4e5f6', rejoined: true })).toEqual({ t: 'welcome', room: 'ABCDE', id: 2, token: 'a1b2c3d4e5f6', rejoined: true });
    expect(parse({ t: 'error', code: 'full' })).toEqual({ t: 'error', code: 'full' });
    expect(parse({ t: 'error', code: 'explodiu' })).toBeNull();
    expect(parse({ t: 'pong', n: 7 })).toEqual({ t: 'pong', n: 7 });
    expect(parse({ t: 'peer', id: 1, e: 'lost' })).toEqual({ t: 'peer', id: 1, e: 'lost' });
    expect(parse({ t: 'peer', id: 1, e: 'sumiu' })).toBeNull();
  });

  it('código de sala: 5 letras do alfabeto sem I e O', () => {
    expect(parse({ t: 'welcome', room: 'ABCDI', id: 0, token: 'a1b2c3d4e5f6' })).toBeNull();
    expect(parse({ t: 'welcome', room: 'ABCD', id: 0, token: 'a1b2c3d4e5f6' })).toBeNull();
    expect(normalizeRoomCode(' kx 7qa')).toBeNull();
    expect(normalizeRoomCode(' kx zqa ')).toBe('KXZQA');
  });

  it('sala: info alheia fora do formato não derruba a sala, só some', () => {
    const room = {
      code: 'KXZQA', host: 0, started: false, settings: SETTINGS,
      clients: [
        { id: 0, seats: 1, connected: true, info: { players: [{ name: 'Ana', car: 'falcao' }], ready: true } },
        { id: 1, seats: 2, connected: false, info: { players: [{ name: 'B', car: 'carro_que_nao_existe' }], ready: false } },
      ],
    };
    const m = parse({ t: 'room', room });
    expect(m?.t).toBe('room');
    if (m?.t !== 'room') return;
    expect(m.room.clients[0].info?.players[0]).toEqual({ name: 'Ana', car: 'falcao' });
    expect(m.room.clients[1].info).toBeNull();
    expect(m.room.clients[1].connected).toBe(false);
    expect(m.room.settings).toEqual(SETTINGS);
    // Mais de 4 clientes, ou assentos locais demais, é mentira do servidor.
    expect(parse({ t: 'room', room: { ...room, clients: [...room.clients, ...room.clients, ...room.clients] } })).toBeNull();
    expect(parse({ t: 'room', room: { ...room, clients: [{ ...room.clients[0], seats: 3 }] } })).toBeNull();
  });

  it('nomes perdem caracteres de controle e são cortados', () => {
    const room = { code: 'KXZQA', host: 0, started: false, settings: null, clients: [{ id: 0, seats: 1, connected: true, info: { players: [{ name: ' \u0000Ana\u0007 Maria da Silva Sauro ', car: 'falcao' }], ready: false } }] };
    const m = parse({ t: 'room', room });
    expect(m?.t === 'room' && m.room.clients[0].info?.players[0].name).toBe('Ana Maria da');
  });

  it('largada: pista e carros precisam existir, assentos únicos, no máximo 2 por cliente', () => {
    expect(parse({ t: 'start', from: 0, cfg: START })).toEqual({ t: 'start', from: 0, cfg: START });
    const bad: Array<Partial<StartConfig> & Record<string, unknown>> = [
      { trackId: 'pista_fantasma' },
      { laps: 0 }, { laps: 9 }, { delay: 0 }, { delay: 99 }, { seed: -1 }, { difficulty: 'impossivel' as never },
      { seats: [] },
      { seats: [{ seat: 0, client: 0, name: 'A', car: 'falcao' }, { seat: 0, client: 1, name: 'B', car: 'falcao' }] },
      { seats: [{ seat: 0, client: 0, name: 'A', car: 'falcao' }, { seat: 1, client: 0, name: 'B', car: 'falcao' }, { seat: 2, client: 0, name: 'C', car: 'falcao' }] },
      { seats: [{ seat: 4, client: 0, name: 'A', car: 'falcao' }] },
      { seats: [{ seat: 0, client: 0, name: '   ', car: 'falcao' }] },
      { totalCars: 1 },
      { assists: { sharedNitro: true } as never },
    ];
    for (const patch of bad) expect(parse({ t: 'start', from: 0, cfg: { ...START, ...patch } }), JSON.stringify(patch)).toBeNull();
    expect(parse({ t: 'start', cfg: START })).toBeNull(); // sem remetente
  });

  it('entradas e hash repassados', () => {
    expect(parse({ t: 'i', from: 1, d: [5, 1, 1, -20] })).toEqual({ t: 'i', from: 1, records: [{ tick: 5, seat: 1, bits: 1, steer: -20 }] });
    expect(parse({ t: 'i', from: 1, d: [5, 1, 1] })).toBeNull();
    expect(parse({ t: 'h', from: 1, k: 60, h: 4294967295 })).toEqual({ t: 'h', from: 1, k: 60, h: 4294967295 });
    expect(parse({ t: 'h', from: 1, k: 60, h: -1 })).toBeNull();
  });

  it('snapshot: estado em texto, configuração válida, buffer e tomadas conferidos', () => {
    const snap = { tick: 600, state: '{}', start: START, inputs: [600, 1, 1, 0, 601, 1, 1, 0], ai: [2, 580] };
    expect(parse({ t: 'snap', from: 0, snap })).toEqual({ t: 'snap', from: 0, snap });
    expect(parse({ t: 'snap', from: 0, snap: { ...snap, inputs: [1, 2] } })).toBeNull();
    expect(parse({ t: 'snap', from: 0, snap: { ...snap, ai: [9, 1] } })).toBeNull();
    expect(parse({ t: 'snap', from: 0, snap: { ...snap, state: 7 } })).toBeNull();
    // Buffer grande (mais que um pacote de entradas) passa.
    const big = Array.from({ length: 200 }, (_, i) => [600 + i, 1, 1, 0]).flat();
    expect(parse({ t: 'snap', from: 0, snap: { ...snap, inputs: big } })).not.toBeNull();
  });
});

describe('endereço do servidor', () => {
  it('aceita host:porta, http(s) e ws(s); recusa o resto', () => {
    expect(normalizeServerUrl('localhost:8787')).toBe('ws://localhost:8787');
    expect(normalizeServerUrl(' ws://10.0.0.5:8787 ')).toBe('ws://10.0.0.5:8787');
    expect(normalizeServerUrl('https://relay.exemplo.com.br/nc')).toBe('wss://relay.exemplo.com.br/nc');
    expect(normalizeServerUrl('WSS://Relay.Exemplo.com')).toBe('wss://Relay.Exemplo.com');
    for (const bad of ['', '   ', 'ftp://x', 'ws://', 'com espaço', 42, null, 'x'.repeat(300)]) expect(normalizeServerUrl(bad)).toBeNull();
  });
});

// Onda N, N3: o visual do carro (CarLook) vai no `info` da sala e na largada. A rede usa o saneador ESTRITO: o que não é do catálogo RECUSA
// (docs/ondas/N/N3.md, §4.2); quem não personaliza manda a mesma mensagem de antes. Os bits da entrada não mudam.
describe('visual do carro na rede (N3)', () => {
  const FULL = { paint: 'rubi', color: FREE_COLORS[7], accent: FREE_COLORS[20], finish: 'camaleao', wheel: WHEEL_LISTS.gt[2], rim: 'dourado', stripe: 'ab', flame: 'roxa' };
  const info = (look: unknown, car = 'falcao') => parseClientInfo({ players: [{ name: 'Ana', car, look }], ready: false }, RULES);
  const cfg = (look: unknown, car = 'falcao') => parseStartConfig({ ...START, seats: [{ seat: 0, client: 0, name: 'Ana', car, look }, START.seats[1]] }, RULES);

  it('o visual completo vai e volta idêntico na sala e na largada, e sobrevive ao JSON', () => {
    expect(info(FULL)?.players[0].look).toEqual(FULL);
    expect(cfg(FULL)?.seats[0].look).toEqual(FULL);
    const again = info(JSON.parse(JSON.stringify(info(FULL))).players[0].look);
    expect(again?.players[0].look).toEqual(FULL);
  });

  it('quem não personaliza manda a mesma mensagem de antes (sem a chave); os padrões explícitos somem', () => {
    expect(info(undefined)?.players[0]).toEqual({ name: 'Ana', car: 'falcao' });
    expect(info({})?.players[0]).toEqual({ name: 'Ana', car: 'falcao' });
    expect(info({ paint: 'original', finish: 'brilho', wheel: WHEEL_LISTS.gt[0] })?.players[0]).toEqual({ name: 'Ana', car: 'falcao' });
    expect(cfg(undefined)?.seats[0]).toEqual({ seat: 0, client: 0, name: 'Ana', car: 'falcao' });
  });

  it('todo valor do catálogo passa; fora dele a mensagem é RECUSADA (null), na sala e na largada', () => {
    for (const finish of FINISH_IDS) expect(info({ finish }), finish).not.toBeNull();
    for (const rim of RIM_IDS) expect(info({ rim }), rim).not.toBeNull();
    for (const stripe of STRIPE_IDS) expect(info({ stripe }), stripe).not.toBeNull();
    for (const flame of FLAME_IDS) expect(info({ flame }), flame).not.toBeNull();
    for (const wheel of WHEEL_LISTS.gt) expect(info({ wheel }), wheel).not.toBeNull();
    const bad: unknown[] = [
      { finish: 'espelho' }, { rim: 'azul' }, { stripe: 'c' }, { flame: 'preta' }, { wheel: 'steel' }, { paint: 'nao-existe' }, { color: 'red' }, { color: '#808080' },
      { extra: true }, { paint: 7 }, null, 'rubi', [], 42, JSON.parse('{"__proto__":{"finish":"cromado"}}'), { paint: 'x'.repeat(100_000) },
    ];
    for (const b of bad) {
      expect(info(b), JSON.stringify(b)?.slice(0, 50)).toBeNull();
      expect(cfg(b), JSON.stringify(b)?.slice(0, 50)).toBeNull();
    }
  });

  it('a roda vale pelo estilo do carro: a picape aceita a de aço, o GT não', () => {
    expect(info({ wheel: 'steel' }, 'tatu')).not.toBeNull();
    expect(info({ wheel: 'steel' }, 'falcao')).toBeNull();
  });

  it('cor livre fora da faixa de saturação não recusa: chega puxada, e igual em toda máquina', () => {
    const a = info({ color: '#a08585' })?.players[0].look?.color;
    expect(a).toBeDefined();
    expect(info({ color: a })?.players[0].look?.color).toBe(a);
    expect(cfg({ color: '#a08585' })?.seats[0].look?.color).toBe(a);
  });

  it('o info hostil de OUTRO cliente aparece sem jogadores e a sala continua (os demais ficam como estão)', () => {
    const room = {
      code: 'KXZQA', host: 0, started: false, settings: SETTINGS,
      clients: [
        { id: 0, seats: 1, connected: true, info: { players: [{ name: 'Ana', car: 'falcao', look: { finish: 'metalico' } }], ready: true } },
        { id: 1, seats: 1, connected: true, info: { players: [{ name: 'Mau', car: 'falcao', look: { finish: 'ouro-puro' } }], ready: true } },
        { id: 2, seats: 1, connected: true, info: { players: [{ name: 'Bia', car: 'trovao', look: { wheel: 'steel' } }], ready: false } },
      ],
    };
    const m = parse({ t: 'room', room });
    expect(m?.t).toBe('room');
    if (m?.t !== 'room') return;
    expect(m.room.clients[0].info?.players[0].look).toEqual({ finish: 'metalico' });
    expect(m.room.clients[1].info).toBeNull();
    expect(m.room.clients[2].info?.players[0].look).toEqual({ wheel: 'steel' });
  });

  it('uma largada com um assento de visual inválido é descartada inteira (o mesmo destino de um carro desconhecido)', () => {
    const start = { ...START, seats: [{ ...START.seats[0], look: { finish: 'ouro-puro' } }, START.seats[1]] };
    expect(parse({ t: 'start', from: 0, cfg: start })).toBeNull();
    expect(parse({ t: 'start', from: 0, cfg: { ...START, seats: [{ ...START.seats[0], look: FULL }, START.seats[1]] } })?.t).toBe('start');
  });

  it('o snapshot de reconexão leva o visual da largada e o recusa se for inválido', () => {
    const snap = (look: unknown) => parse({ t: 'snap', from: 0, snap: { tick: 10, state: 'x', start: { ...START, seats: [{ ...START.seats[0], look }, START.seats[1]] }, inputs: [], ai: [] } });
    expect(snap(FULL)?.t).toBe('snap');
    expect(snap({ finish: 'x' })).toBeNull();
  });

  it('o look canônico mais longo cabe com folga no limite do relay (4 KiB por bloco) mesmo com 2 jogadores e 4 assentos', () => {
    const one = JSON.stringify({ name: 'Ana', car: 'falcao', assist: 'full', look: FULL });
    expect(one.length).toBeLessThan(260);
    const startBig = JSON.stringify({ ...START, seats: [0, 1, 2, 3].map((seat) => ({ seat, client: seat, name: 'Ana', car: 'falcao', assist: 'full', look: FULL })) });
    expect(startBig.length).toBeLessThan(4 * 1024);
  });
});
