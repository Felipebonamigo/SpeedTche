// Lockstep puro com 2–4 clientes simulados em memória: rede com atraso, reordenação e
// duplicação sorteados por semente fixa. Prova que todos chegam ao mesmo hashRace.
import { describe, expect, it } from 'vitest';
import { createRng, nextFloat, nextInt, type RngState } from '../src/core/rng';
import { deserializeRace, hashRace, serializeRace } from '../src/core/serialize';
import { COUNTDOWN_TICKS } from '../src/core/constants';
import { createRace, stepRace } from '../src/core/sim/race';
import { getTrack } from '../src/core/track';
import type { PlayerInput, RaceConfig, RaceState, Track } from '../src/core/types';
import { Lockstep, type DesyncReport } from '../src/net/lockstep';
import { decodeInput, encodeInput, type InputRecord } from '../src/net/protocol';
import { human, NO_ASSISTS } from './helpers';

const TRACK: Track = getTrack('copacabana');

function config(humans: number, seed = 99): RaceConfig {
  return {
    trackId: TRACK.def.id, laps: 3, humans: Array.from({ length: humans }, (_, i) => human(i, 0, ['falcao', 'trovao', 'tornado', 'camelo'][i])),
    totalCars: 8, difficulty: 'profissional', manualGear: false, assists: { ...NO_ASSISTS, sharedNitro: true, tow: true }, seed,
  };
}

/** Piloto de teste: volante com fração (testa a quantização), freio de vez em quando, nitro em borda e derrapagem em fases (nível, não borda). */
function pilot(seat: number, frame: number, tick = COUNTDOWN_TICKS + 99): PlayerInput {
  const phase = (frame + seat * 53) % 240;
  // Largada (N1): na contagem cada assento aperta o acelerador num tick diferente (G−12, G−4, G+12, G+20), pelo tick do núcleo
  // do cliente quando lê o piloto; o aperto vale 3 ticks depois (o atraso). Os dois primeiros caem na janela, os outros não.
  const launching = tick < COUNTDOWN_TICKS + 30;
  return {
    steer: phase < 80 ? 0.37 : phase < 160 ? -0.61 : 0.05 * (seat + 1),
    throttle: launching ? tick >= COUNTDOWN_TICKS - 12 + seat * 8 + (seat >= 2 ? 8 : 0) : phase % 97 !== 0,
    brake: phase > 225,
    nitro: frame % 700 === 100 + seat * 20,
    gearUp: false, gearDown: false,
    drift: (phase >= 10 && phase < 75) || (phase >= 90 && phase < 155),
    // N6: buzina segurada em fases (nível) e uma frase de vez em quando (borda); o núcleo nunca os lê.
    horn: (phase >= 100 && phase < 130) || (phase >= 200 && phase < 206),
    ...(frame % 300 === 150 + seat * 7 ? { taunt: (frame / 300 + seat) % 8 | 0 } : {}),
  };
}

/** Algum humano do estado está derrapando agora? (`?? 0`: antes da M1 o campo não existia.) */
function anyHumanDrifting(state: RaceState): boolean {
  return state.cars.some((c) => c.seat >= 0 && (c.driftDir ?? 0) !== 0);
}

type Payload = { from: number; kind: 'i'; records: InputRecord[] } | { from: number; kind: 'h'; tick: number; hash: number };
type Packet = Payload & { at: number; to: number };

interface SimClient {
  id: number;
  seats: number[];
  state: RaceState;
  ls: Lockstep;
  frames: number;
  online: boolean;
  desyncs: DesyncReport[];
  /** Ticks em que algum humano deste estado estava derrapando (prova de que o bit chegou à simulação). */
  drifted: number;
}

/** Rede em memória: cada pacote chega depois de um atraso sorteado; às vezes duas vezes. */
class Net {
  now = 0;
  packets: Packet[] = [];
  clients: SimClient[] = [];
  constructor(readonly rng: RngState, readonly maxDelay: number, readonly dupRate = 0.05, readonly lossRate = 0) {}
  send(p: Payload): void {
    for (const c of this.clients) {
      if (c.id === p.from) continue;
      if (nextFloat(this.rng) < this.lossRate) continue; // pacote perdido (ex.: descartado pelo limite de taxa do relay)
      const at = this.now + nextInt(this.rng, 0, this.maxDelay);
      this.packets.push({ ...p, at, to: c.id });
      if (nextFloat(this.rng) < this.dupRate) this.packets.push({ ...p, at: at + nextInt(this.rng, 0, this.maxDelay), to: c.id });
    }
  }
  /** Entrega o que venceu, em ordem embaralhada (fora de ordem de propósito). */
  deliver(all = false): void {
    const due = this.packets.filter((p) => all || p.at <= this.now);
    this.packets = this.packets.filter((p) => !(all || p.at <= this.now));
    for (let i = due.length - 1; i > 0; i--) { const j = nextInt(this.rng, 0, i); [due[i], due[j]] = [due[j], due[i]]; }
    for (const p of due) {
      const c = this.clients.find((x) => x.id === p.to);
      if (!c || !c.online) continue;
      if (p.kind === 'i') c.ls.receive(p.records);
      else c.ls.receiveHash(p.from, p.tick, p.hash);
    }
  }
}

function makeClient(net: Net, id: number, seats: number[], allSeats: number[], cfg: RaceConfig, delay = 3, resendMs = 20): SimClient {
  const c: SimClient = { id, seats, state: createRace(cfg, TRACK), ls: null as unknown as Lockstep, frames: 0, online: true, desyncs: [], drifted: 0 };
  c.ls = new Lockstep({ seats: allSeats, localSeats: seats, delay, resendMs }, {
    sendInputs: (records) => { if (c.online) net.send({ kind: 'i', from: id, records: records.map((r) => ({ ...r })) }); },
    sendHash: (tick, hash) => { if (c.online) net.send({ kind: 'h', from: id, tick, hash }); },
  });
  c.ls.onDesync = (r) => c.desyncs.push(r);
  net.clients.push(c);
  return c;
}

/** Um "quadro" do cliente: lê o piloto e tenta rodar até `budget` ticks (sem passar de `limit`). */
function frame(c: SimClient, budget: number, limit: number, now: number): number {
  c.frames++;
  for (const s of c.seats) c.ls.setLocalInput(s, pilot(s, c.frames, c.state.tick));
  let n = 0;
  while (n < budget && c.state.tick < limit && c.ls.step(c.state, now, (inputs) => stepRace(c.state, TRACK, inputs))) { n++; if (anyHumanDrifting(c.state)) c.drifted++; }
  return n;
}

function runAll(net: Net, clients: SimClient[], limit: number, maxIterations = 200_000): void {
  for (let it = 0; it < maxIterations && clients.some((c) => c.online && c.state.tick < limit); it++) {
    net.now++;
    for (const c of clients) if (c.online) frame(c, nextInt(net.rng, 0, 3), limit, net.now);
    net.deliver();
  }
}

describe('lockstep em rede simulada', () => {
  for (const n of [2, 3, 4]) {
    it(`${n} clientes com atraso e reordenação sorteados chegam ao mesmo hash após 3000 ticks`, () => {
      const net = new Net(createRng(1000 + n), 6);
      const seats = Array.from({ length: n }, (_, i) => i);
      const cfg = config(n);
      const clients = seats.map((s) => makeClient(net, s, [s], seats, cfg));
      runAll(net, clients, 3000);
      for (const c of clients) expect(c.state.tick).toBe(3000);
      const h = hashRace(clients[0].state);
      for (const c of clients) {
        expect(hashRace(c.state)).toBe(h);
        expect(serializeRace(c.state)).toBe(serializeRace(clients[0].state));
        expect(c.desyncs).toEqual([]);
      }
      // A rede de fato bagunçou: houve duplicadas e esperas.
      expect(clients.reduce((a, c) => a + c.ls.stats.duplicates, 0)).toBeGreaterThan(0);
      expect(clients.reduce((a, c) => a + c.ls.stats.stalls, 0)).toBeGreaterThan(0);
    }, 60_000);
  }

  it('o bit de derrapar atravessa a rede: todos os clientes derrapam os mesmos ticks e chegam ao mesmo hash (3 clientes, atraso e reordenação)', () => {
    const net = new Net(createRng(2024), 5);
    const seats = [0, 1, 2];
    const clients = seats.map((s) => makeClient(net, s, [s], seats, config(3)));
    runAll(net, clients, 2400);
    for (const c of clients) {
      expect(c.state.tick).toBe(2400);
      expect(c.drifted, `cliente ${c.id} nunca viu um humano derrapar`).toBeGreaterThan(100);
      expect(c.drifted).toBe(clients[0].drifted);
      expect(hashRace(c.state)).toBe(hashRace(clients[0].state));
      expect(c.desyncs).toEqual([]);
    }
  }, 60_000);

  it('a largada-foguete atravessa a rede: 4 clientes, atraso e reordenação sorteados — os mesmos carros acertam a janela em todos e o hash fecha', () => {
    const net = new Net(createRng(515), 5);
    const seats = [0, 1, 2, 3];
    const clients = seats.map((s) => makeClient(net, s, [s], seats, config(4)));
    runAll(net, clients, 420);
    const launches = (c: SimClient) => c.state.cars.filter((x) => x.seat >= 0).map((x) => x.launch);
    for (const c of clients) {
      expect(c.state.tick).toBe(420);
      expect(launches(c), `cliente ${c.id}`).toEqual([1, 1, 2, 2]);
      expect(hashRace(c.state)).toBe(hashRace(clients[0].state));
      expect(c.desyncs).toEqual([]);
    }
  }, 60_000);

  it('derrapar é nível, não borda: fica nos envios seguintes até o jogador soltar (e o bit 32 é o que sai)', () => {
    const state = createRace(config(1), TRACK);
    const sent: InputRecord[] = [];
    const ls = new Lockstep({ seats: [0], localSeats: [0], delay: 2 }, { sendInputs: (r) => sent.push(...r), sendHash: () => undefined });
    const run = (inputs: PlayerInput[]) => stepRace(state, TRACK, inputs);
    const hold: PlayerInput = { steer: 0.5, throttle: true, brake: false, nitro: false, gearUp: false, gearDown: false, drift: true };
    ls.setLocalInput(0, hold);
    for (let i = 0; i < 6; i++) ls.step(state, i * 16, run);
    const withDrift = sent.filter((r) => r.tick >= 2 && r.tick <= 7);
    expect(withDrift.length).toBeGreaterThanOrEqual(6);
    for (const r of withDrift) expect(r.bits & 32, `tick ${r.tick}`).toBe(32);
    ls.setLocalInput(0, { ...hold, drift: false });
    const before = sent.length;
    for (let i = 6; i < 12; i++) ls.step(state, i * 16, run);
    const after = sent.slice(before);
    expect(after.length).toBeGreaterThan(0);
    for (const r of after) expect(r.bits & 32, `tick ${r.tick}`).toBe(0);
  });

  it('pacote de entrada perdido não trava a corrida para sempre: quem está parado reenvia o recente', () => {
    const net = new Net(createRng(77), 3, 0, 0.08);
    const cfg = config(3);
    const clients = [0, 1, 2].map((s) => makeClient(net, s, [s], [0, 1, 2], cfg));
    runAll(net, clients, 1500, 60_000);
    for (const c of clients) expect(c.state.tick).toBe(1500);
    expect(hashRace(clients[1].state)).toBe(hashRace(clients[0].state));
    expect(hashRace(clients[2].state)).toBe(hashRace(clients[0].state));
    expect(clients.reduce((a, c) => a + c.ls.stats.resent, 0)).toBeGreaterThan(0);
  }, 60_000);

  it('um cliente com dois jogadores locais e outro com um (3 humanos) ficam iguais', () => {
    const net = new Net(createRng(7), 4);
    const cfg = config(3);
    const a = makeClient(net, 0, [0, 1], [0, 1, 2], cfg, 4);
    const b = makeClient(net, 1, [2], [0, 1, 2], cfg, 4);
    runAll(net, [a, b], 1500);
    expect(hashRace(a.state)).toBe(hashRace(b.state));
    // As entradas locais valem nos dois lados: o carro do assento 1 andou.
    expect(b.state.cars.find((c) => c.seat === 1)?.z).toBe(a.state.cars.find((c) => c.seat === 1)?.z);
  }, 30_000);

  it('a mesma corrida rodada sem rede, com as entradas decodificadas, dá o mesmo hash (o lockstep não inventa nada)', () => {
    const net = new Net(createRng(3), 3);
    const cfg = config(2);
    const a = makeClient(net, 0, [0], [0, 1], cfg);
    const b = makeClient(net, 1, [1], [0, 1], cfg);
    // Grava o que cada tick recebeu no cliente A.
    const log: PlayerInput[][] = [];
    const origStep = a.ls.step.bind(a.ls);
    a.ls.step = (state, now, run) => origStep(state, now, (inputs) => { log.push(inputs.map((x) => ({ ...x }))); run(inputs); });
    runAll(net, [a, b], 900);
    const solo = createRace(cfg, TRACK);
    for (const inputs of log) stepRace(solo, TRACK, inputs);
    expect(hashRace(solo)).toBe(hashRace(a.state));
  }, 30_000);

  it('a tomada pela IA chega ao stepRace como entrada: repetir só as entradas de cada tick reproduz a corrida (replay, fantasma)', () => {
    const net = new Net(createRng(41), 3);
    const cfg = config(2);
    const a = makeClient(net, 0, [0], [0, 1], cfg);
    const b = makeClient(net, 1, [1], [0, 1], cfg);
    const log: PlayerInput[][] = [];
    const origStep = a.ls.step.bind(a.ls);
    a.ls.step = (state, now, run) => origStep(state, now, (inputs) => { log.push(inputs.map((x) => ({ ...x }))); run(inputs); });
    runAll(net, [a, b], 600);
    b.online = false;
    net.deliver(true);
    runAll(net, [a], 700, 300);
    expect(a.ls.takeover(1)).not.toBeNull();
    runAll(net, [a], 1500);
    expect(a.state.tick).toBe(1500);
    expect(a.state.cars.find((c) => c.seat === 1)?.ai).not.toBeNull();
    // Nada muda o estado por fora: a corrida inteira é stepRace com o que o lockstep entregou.
    const solo = createRace(cfg, TRACK);
    for (const inputs of log) stepRace(solo, TRACK, inputs);
    expect(solo.cars.find((c) => c.seat === 1)?.ai).not.toBeNull();
    expect(hashRace(solo)).toBe(hashRace(a.state));
  }, 30_000);

  it('sem a entrada do outro assento o tick não roda (nem o primeiro)', () => {
    const state = createRace(config(2), TRACK);
    const sent: InputRecord[][] = [];
    const ls = new Lockstep({ seats: [0, 1], localSeats: [0], delay: 3 }, { sendInputs: (r) => sent.push(r), sendHash: () => undefined });
    let advanced = 0;
    for (let i = 0; i < 20; i++) if (ls.step(state, i * 16, (inputs) => stepRace(state, TRACK, inputs))) advanced++;
    expect(advanced).toBe(0);
    expect(state.tick).toBe(0);
    expect(ls.missingSeats()).toEqual([1]);
    expect(ls.stalledMs(19 * 16)).toBe(19 * 16);
    // Mandou a própria entrada dos ticks 0..3 uma única vez (não repete enquanto espera).
    expect(sent.flat().map((r) => r.tick)).toEqual([0, 1, 2, 3]);
    // Chegou a entrada do assento 1 para os ticks 0 e 1: roda exatamente dois ticks.
    ls.receive([{ tick: 1, seat: 1, bits: 1, steer: 0 }, { tick: 0, seat: 1, bits: 1, steer: 0 }]);
    for (let i = 0; i < 5; i++) ls.step(state, 400, (inputs) => stepRace(state, TRACK, inputs));
    expect(state.tick).toBe(2);
    expect(ls.stalledMs(400)).toBe(0);
  });

  it('entrada repetida, atrasada, de assento alheio ou absurda é descartada e contada', () => {
    const state = createRace(config(2), TRACK);
    const ls = new Lockstep({ seats: [0, 1], localSeats: [0], delay: 2 }, { sendInputs: () => undefined, sendHash: () => undefined });
    ls.receive([{ tick: 0, seat: 1, bits: 1, steer: 10 }, { tick: 0, seat: 1, bits: 1, steer: 10 }]);
    expect(ls.stats.duplicates).toBe(1);
    ls.receive([{ tick: 0, seat: 1, bits: 3, steer: 10 }]);
    expect(ls.stats.conflicts).toBe(1);
    ls.receive([{ tick: 5, seat: 0, bits: 1, steer: 0 }]); // alguém mandando pelo assento local
    ls.receive([{ tick: 5, seat: 3, bits: 1, steer: 0 }]); // assento que não está na corrida
    ls.receive([{ tick: 999_999, seat: 1, bits: 1, steer: 0 }]);
    expect(ls.stats.rejected).toBe(3);
    ls.step(state, 0, (inputs) => stepRace(state, TRACK, inputs));
    expect(state.tick).toBe(1);
    ls.receive([{ tick: 0, seat: 1, bits: 1, steer: 10 }]);
    expect(ls.stats.stale).toBe(1);
  });

  it('borda de nitro apertada enquanto a rede trava não se perde: sai no próximo envio', () => {
    const state = createRace(config(2), TRACK);
    const sent: InputRecord[] = [];
    const ls = new Lockstep({ seats: [0, 1], localSeats: [0], delay: 3 }, { sendInputs: (r) => sent.push(...r), sendHash: () => undefined });
    const run = (inputs: PlayerInput[]) => stepRace(state, TRACK, inputs);
    ls.step(state, 0, run); // manda 0..3, trava esperando o assento 1
    ls.setLocalInput(0, { steer: 0.5, throttle: true, brake: false, nitro: true, gearUp: false, gearDown: false });
    ls.setLocalInput(0, { steer: 0.5, throttle: true, brake: false, nitro: false, gearUp: false, gearDown: false });
    ls.step(state, 16, run); // ainda travado: nada sai, a borda fica guardada
    ls.receive([0, 1, 2, 3].map((tick) => ({ tick, seat: 1, bits: 0, steer: 0 })));
    for (let i = 0; i < 3; i++) ls.step(state, 32 + i * 16, run); // roda 0, 1, 2 e manda 4 e 5
    const t4 = sent.find((r) => r.tick === 4 && r.seat === 0);
    const t5 = sent.find((r) => r.tick === 5 && r.seat === 0);
    expect(t4 && decodeInput(t4.bits, t4.steer)).toMatchObject({ nitro: true, throttle: true, steer: 64 / 127 });
    expect(t5 && decodeInput(t5.bits, t5.steer)).toMatchObject({ nitro: false, throttle: true, steer: 64 / 127 });
    expect(t5 && t5.steer).toBe(encodeInput({ steer: 0.5, throttle: true, brake: false, nitro: false, gearUp: false, gearDown: false }).steer);
  });

  it('dessincronia: um cliente que altera o próprio estado é apontado no tick do hash seguinte', () => {
    const net = new Net(createRng(11), 3, 0);
    const cfg = config(3);
    const clients = [0, 1, 2].map((s) => makeClient(net, s, [s], [0, 1, 2], cfg));
    runAll(net, clients, 500);
    // Erro simulado no cliente 2 (um arredondamento diferente, um bit trocado). O z não é
    // corrigido por nada (o x a IA traz de volta para a faixa e o erro sumiria).
    clients[2].state.cars[0].z += 5;
    runAll(net, clients, 700);
    net.deliver(true);
    expect(clients[0].desyncs[0]).toMatchObject({ tick: 540, from: 2 });
    expect(clients[1].desyncs[0]).toMatchObject({ tick: 540, from: 2 });
    expect(clients[2].desyncs.length).toBeGreaterThan(0);
    expect(clients[0].desyncs[0].local).not.toBe(clients[0].desyncs[0].remote);
  }, 30_000);

  it('reconexão por snapshot: quem caiu volta com o estado do anfitrião e todos terminam com o mesmo hash', () => {
    const net = new Net(createRng(21), 5);
    const cfg = config(3);
    const [a, b, c] = [0, 1, 2].map((s) => makeClient(net, s, [s], [0, 1, 2], cfg));
    runAll(net, [a, b, c], 1200);
    // C cai: o que ele já tinha mandado ainda chega (o relay entrega antes de avisar a queda).
    c.online = false;
    net.deliver(true);
    runAll(net, [a, b], 1500, 300); // A e B andam até travar esperando C
    expect(a.state.tick).toBeLessThan(1500);
    expect(a.ls.missingSeats()).toEqual([2]);
    // C volta: o anfitrião (A) manda o snapshot com o buffer e C recomeça dali.
    const snap = { tick: a.state.tick, state: serializeRace(a.state), inputs: a.ls.bufferedRecords(), ai: a.ls.aiList() };
    const c2 = makeClient(net, 2, [2], [0, 1, 2], cfg);
    net.clients.splice(net.clients.indexOf(c), 1);
    c2.state = deserializeRace(snap.state);
    c2.ls = new Lockstep({ seats: [0, 1, 2], localSeats: [2], delay: 3, startTick: snap.tick }, {
      sendInputs: (records) => net.send({ kind: 'i', from: 2, records }),
      sendHash: (tick, hash) => net.send({ kind: 'h', from: 2, tick, hash }),
    });
    c2.ls.onDesync = (r) => c2.desyncs.push(r);
    c2.ls.ingest(snap.inputs);
    runAll(net, [a, b, c2], 3000);
    for (const x of [a, b, c2]) expect(x.state.tick).toBe(3000);
    expect(hashRace(c2.state)).toBe(hashRace(a.state));
    expect(hashRace(b.state)).toBe(hashRace(a.state));
    expect([...a.desyncs, ...b.desyncs, ...c2.desyncs]).toEqual([]);
  }, 60_000);

  it('reconexão por snapshot no MEIO de uma derrapagem: o estado serializado leva a derrapagem e todos terminam com o mesmo hash', () => {
    const net = new Net(createRng(21), 5);
    const cfg = config(3);
    const [a, b, c] = [0, 1, 2].map((s) => makeClient(net, s, [s], [0, 1, 2], cfg));
    // Anda até algum carro estar derrapando com carga (a derrapagem do piloto de teste dura ~65 quadros).
    let limit = 300;
    do { runAll(net, [a, b, c], limit); limit += 5; } while (!a.state.cars.some((x) => x.seat >= 0 && (x.driftCharge ?? 0) > 20) && limit < 3000);
    expect(limit, 'nenhum carro carregou uma derrapagem').toBeLessThan(3000);
    c.online = false;
    net.deliver(true);
    runAll(net, [a, b], limit + 400, 300);
    expect(a.ls.missingSeats()).toEqual([2]);
    const snap = { tick: a.state.tick, state: serializeRace(a.state), inputs: a.ls.bufferedRecords(), ai: a.ls.aiList() };
    const c2 = makeClient(net, 2, [2], [0, 1, 2], cfg);
    net.clients.splice(net.clients.indexOf(c), 1);
    c2.state = deserializeRace(snap.state);
    c2.ls = new Lockstep({ seats: [0, 1, 2], localSeats: [2], delay: 3, startTick: snap.tick }, {
      sendInputs: (records) => net.send({ kind: 'i', from: 2, records }),
      sendHash: (tick, hash) => net.send({ kind: 'h', from: 2, tick, hash }),
    });
    c2.ls.onDesync = (r) => c2.desyncs.push(r);
    c2.ls.ingest(snap.inputs);
    runAll(net, [a, b, c2], limit + 1500);
    expect(hashRace(c2.state)).toBe(hashRace(a.state));
    expect(hashRace(b.state)).toBe(hashRace(a.state));
    expect([...a.desyncs, ...b.desyncs, ...c2.desyncs]).toEqual([]);
  }, 60_000);

  it('quem não volta vira IA pelo comando no fluxo de entradas, no mesmo tick em todas as máquinas', () => {
    const net = new Net(createRng(31), 4);
    const cfg = config(3);
    const [a, b, c] = [0, 1, 2].map((s) => makeClient(net, s, [s], [0, 1, 2], cfg));
    runAll(net, [a, b, c], 1000);
    c.online = false;
    net.deliver(true);
    runAll(net, [a, b], 1300, 300);
    expect(a.ls.missingSeats()).toEqual([2]);
    const last = a.ls.lastTickFrom(2);
    const progressBefore = a.state.cars.find((x) => x.seat === 2)?.progress ?? 0;
    const rec = a.ls.takeover(2);
    expect(rec).toEqual({ tick: last + 1, seat: 2, bits: 128, steer: 0 });
    expect(a.ls.takeover(2)).toBeNull(); // uma vez só
    runAll(net, [a, b], 3000);
    expect(a.state.tick).toBe(3000);
    expect(hashRace(b.state)).toBe(hashRace(a.state));
    const carC = a.state.cars.find((x) => x.seat === 2);
    expect(carC?.ai).not.toBeNull();
    // A IA dirigiu de verdade: com entrada neutra o carro pararia em poucos segundos.
    expect((carC?.progress ?? 0) - progressBefore).toBeGreaterThan(60_000);
    expect(a.ls.aiList()).toEqual([2, rec?.tick]);
    expect([...a.desyncs, ...b.desyncs]).toEqual([]);
  }, 60_000);

  it('quem está atrás dos outros sabe quanto (para correr mais ticks por quadro e alcançar)', () => {
    const state = createRace(config(2), TRACK);
    const ls = new Lockstep({ seats: [0, 1], localSeats: [0], delay: 3 }, { sendInputs: () => undefined, sendHash: () => undefined });
    expect(ls.behindBy()).toBe(0);
    ls.receive(Array.from({ length: 40 }, (_, tick) => ({ tick, seat: 1, bits: 1, steer: 0 })));
    // O outro já mandou até o tick 39 = ele está no 36; eu estou no 0.
    expect(ls.behindBy()).toBe(36);
    for (let i = 0; i < 10; i++) ls.step(state, 0, (inputs) => stepRace(state, TRACK, inputs));
    expect(ls.behindBy()).toBe(26);
  });
});

/** O que cada tick entregou ao stepRace deste cliente: só os ticks em que alguém buzinava ou mandou uma frase. */
interface VoiceTick { tick: number; seat: number; horn: boolean; taunt: number | undefined }
function traceVoice(c: SimClient): VoiceTick[] {
  const log: VoiceTick[] = [];
  const orig = c.ls.step.bind(c.ls);
  c.ls.step = (state, now, run) => orig(state, now, (inputs) => {
    const tick = state.tick;
    inputs.forEach((inp, seat) => { if (inp && (inp.horn === true || inp.taunt !== undefined)) log.push({ tick, seat, horn: inp.horn === true, taunt: inp.taunt }); });
    run(inputs);
  });
  return log;
}

describe('buzina e frase pelo lockstep (N6)', () => {
  const hold: PlayerInput = { steer: 0, throttle: true, brake: false, nitro: false, gearUp: false, gearDown: false };

  it('a buzina é nível: fica nos envios seguintes até soltar (o bit 64)', () => {
    const state = createRace(config(1), TRACK);
    const sent: InputRecord[] = [];
    const ls = new Lockstep({ seats: [0], localSeats: [0], delay: 2 }, { sendInputs: (r) => sent.push(...r), sendHash: () => undefined });
    const run = (inputs: PlayerInput[]) => stepRace(state, TRACK, inputs);
    ls.setLocalInput(0, { ...hold, horn: true });
    for (let i = 0; i < 6; i++) ls.step(state, i * 16, run);
    const held = sent.filter((r) => r.tick >= 2 && r.tick <= 7);
    expect(held.length).toBeGreaterThanOrEqual(6);
    for (const r of held) expect(r.bits & 64, `tick ${r.tick}`).toBe(64);
    ls.setLocalInput(0, { ...hold, horn: false });
    const before = sent.length;
    for (let i = 6; i < 12; i++) ls.step(state, i * 16, run);
    expect(sent.length).toBeGreaterThan(before);
    for (const r of sent.slice(before)) expect(r.bits & 64, `tick ${r.tick}`).toBe(0);
  });

  it('a frase é borda: sai uma vez só, mesmo que o quadro seguinte já a tenha esquecido, e nunca se repete', () => {
    const state = createRace(config(1), TRACK);
    const sent: InputRecord[] = [];
    const ls = new Lockstep({ seats: [0], localSeats: [0], delay: 2 }, { sendInputs: (r) => sent.push(...r), sendHash: () => undefined });
    const run = (inputs: PlayerInput[]) => stepRace(state, TRACK, inputs);
    ls.setLocalInput(0, { ...hold, taunt: 5 });
    ls.setLocalInput(0, { ...hold }); // o quadro seguinte (sem passo) já não traz a frase: ela fica guardada
    for (let i = 0; i < 12; i++) ls.step(state, i * 16, run);
    const withTaunt = sent.filter((r) => (r.bits >> 8) !== 0);
    expect(withTaunt).toHaveLength(1);
    expect(decodeInput(withTaunt[0].bits, withTaunt[0].steer).taunt).toBe(5);
    // Uma frase nova, depois: sai de novo uma vez.
    ls.setLocalInput(0, { ...hold, taunt: 0 });
    for (let i = 12; i < 24; i++) ls.step(state, i * 16, run);
    const all = sent.filter((r) => (r.bits >> 8) !== 0);
    expect(all.map((r) => decodeInput(r.bits, r.steer).taunt)).toEqual([5, 0]);
  });

  for (const delay of [3, 12]) {
    it(`a buzina e a frase de cada jogador chegam aos MESMOS ticks em todos os clientes (3 clientes, atraso de entrada ${delay}, rede bagunçada)`, () => {
      const net = new Net(createRng(5150 + delay), 5);
      const seats = [0, 1, 2];
      const cfg = config(3);
      const clients = seats.map((s) => makeClient(net, s, [s], seats, cfg, delay));
      const traces = clients.map(traceVoice);
      runAll(net, clients, 2400);
      for (const c of clients) { expect(c.state.tick).toBe(2400); expect(c.desyncs).toEqual([]); }
      const horns = traces[0].filter((v) => v.horn);
      const taunts = traces[0].filter((v) => v.taunt !== undefined);
      expect(horns.length, 'ninguém buzinou').toBeGreaterThan(100);
      expect(new Set(horns.map((v) => v.seat)).size, 'só um assento buzinou').toBe(3);
      expect(taunts.length, 'ninguém mandou frase').toBeGreaterThanOrEqual(3);
      for (const t of traces) expect(t).toEqual(traces[0]);
      // A frase é uma borda por tick: nunca duas vezes seguidas para o mesmo assento no mesmo envio.
      expect(new Set(taunts.map((v) => `${v.tick}:${v.seat}`)).size).toBe(taunts.length);
      for (const c of clients) expect(hashRace(c.state)).toBe(hashRace(clients[0].state));
    }, 60_000);
  }

  it('buzina e frase não mexem na física: a mesma corrida sem eles dá o mesmo hash', () => {
    const run = (voice: boolean): number => {
      const net = new Net(createRng(808), 4);
      const seats = [0, 1];
      const cfg = config(2);
      const cs = seats.map((s) => makeClient(net, s, [s], seats, cfg));
      if (!voice) for (const c of cs) {
        const orig = c.ls.setLocalInput.bind(c.ls);
        c.ls.setLocalInput = (seat, input) => { const { horn: _h, taunt: _t, ...rest } = input; void _h; void _t; orig(seat, rest); };
      }
      runAll(net, cs, 1500);
      return hashRace(cs[0].state);
    };
    expect(run(true)).toBe(run(false));
  }, 60_000);
});

describe('IA que assume o carro de um humano', () => {
  it('com câmbio manual, troca de marcha sozinha (antes ficava presa na marcha em que o humano caiu)', () => {
    const track = getTrack('copacabana');
    const config: RaceConfig = {
      trackId: 'copacabana', laps: 3, humans: [human(0), human(1)], totalCars: 8, difficulty: 'profissional',
      manualGear: true, assists: NO_ASSISTS, seed: 3,
    };
    const s = createRace(config, track);
    const gone: PlayerInput = { steer: 0, throttle: false, brake: false, nitro: false, gearUp: false, gearDown: false, takeover: true };
    for (let t = 0; t < 60 * 90; t++) stepRace(s, track, [undefined, gone]);
    const taken = s.cars.find((c) => c.seat === 1);
    expect(taken?.ai).not.toBeNull();
    expect(taken!.gear).toBeGreaterThan(0);
    expect(taken!.lap).toBeGreaterThanOrEqual(2);
    // O humano que ficou continua no manual: parado em 1ª.
    expect(s.cars.find((c) => c.seat === 0)!.gear).toBe(0);
  });
});
