// N6: a voz do carro na sessão — buzina e frase de provocação (docs/ondas/N/N6.md, §4.4 e §6 V1–V7). Lógica pura, em Node.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TICK_RATE } from '../src/core/constants';
import { hashString } from '../src/core/rng';
import { hashRace, serializeRace } from '../src/core/serialize';
import { stepRace } from '../src/core/sim/race';
import { NEUTRAL_INPUT, type PlayerInput } from '../src/core/types';
import { setLanguage, t } from '../src/i18n';
import { scenarioInputs, startScenario } from '../scripts/sim-scenarios';
import {
  audibleFor, createVoiceMemory, HORN_MIN_GAP_TICKS, HORN_REMOTE_GAIN, hornGain, newWheel, observeVoice, stepWheel, TAUNT_COUNT, TAUNT_KEYS,
  TAUNT_MIN_GAP_TICKS, tauntCooldownTicks, tauntText, WHEEL_OPEN_SECONDS, type WheelState,
} from '../src/voice/voice';
import { isMuted, MUTED_KEY, mutedNames, setMuted, toggleMuted } from '../src/voice/prefs';
import '../src/voice/strings';
import { writeJson } from '../src/game/storage';
import { GUARD_SCENARIOS, GUARD_TICKS } from './drift-legacy';
import { human, quickRace, skipCountdown } from './helpers';

const DT = 1 / TICK_RATE;

// ───────────────────────────── V1: o núcleo nunca lê a buzina nem a frase ─────────────────────────────

/** Valores gravados em 640538f (antes da N6), com o `hashRace` de hoje, dobrado tick a tick em FNV-1a (scratch/guard.ts). */
const RECORDED = {
  'guarda-contra-relogio': { trace: '148fef1e', json: 'ced2734f' },
  'guarda-3-humanos-manual': { trace: '9fca71dd', json: 'd9bd15f6' },
} as const;

function traceOf(scenarioIndex: number, voice: boolean): { trace: string; json: string } {
  const s = GUARD_SCENARIOS[scenarioIndex];
  const { state, track } = startScenario(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < GUARD_TICKS && state.phase !== 'finished'; i++) {
    const inputs = scenarioInputs(state, track, s).map((inp, seat): PlayerInput => (
      voice ? { ...inp, horn: (i + seat * 7) % 50 < 20, ...(i % 97 === seat ? { taunt: (i + seat) % TAUNT_COUNT } : {}) } : inp
    ));
    stepRace(state, track, inputs);
    const text = String(hashRace(state));
    for (let k = 0; k < text.length; k++) { h ^= text.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0; }
  }
  return { trace: (h >>> 0).toString(16).padStart(8, '0'), json: hashString(serializeRace(state)).toString(16) };
}

describe('V1: buzinar e provocar não mudam a física nem o hash', () => {
  GUARD_SCENARIOS.forEach((s, i) => {
    it(`${s.name}: ${GUARD_TICKS} ticks com buzina e frases espalhadas dão o mesmo hash, tick a tick, que sem elas — e o valor gravado em 640538f`, () => {
      const recorded = RECORDED[s.name as keyof typeof RECORDED];
      const quiet = traceOf(i, false);
      expect(quiet).toEqual(recorded);
      expect(traceOf(i, true)).toEqual(recorded);
    });
  });
});

// ───────────────────────────── V2–V4: observeVoice ─────────────────────────────

function twoHumans() {
  const { state, track } = quickRace({ humans: [human(0, 0, 'trovao'), human(1, 1, 'tornado')], totalCars: 6 });
  skipCountdown(state, track);
  return state;
}

const silent: PlayerInput = { ...NEUTRAL_INPUT };
const honk: PlayerInput = { ...NEUTRAL_INPUT, horn: true };
const say = (taunt: number): PlayerInput => ({ ...NEUTRAL_INPUT, taunt });

/** Roda `observeVoice` por vários ticks com a entrada de cada tick (do assento 0 e do 1) e junta os cues com o tick em que saíram. */
function drive(state: ReturnType<typeof twoHumans>, mem = createVoiceMemory(), plan: Array<[PlayerInput | undefined, PlayerInput | undefined]>) {
  const out: Array<{ tick: number; type: string; seat: number; index?: number; carId: string }> = [];
  for (const [a, b] of plan) {
    state.tick++;
    for (const cue of observeVoice(mem, state, [a, b])) out.push({ tick: state.tick, type: cue.type, seat: cue.seat, index: cue.type === 'taunt' ? cue.index : undefined, carId: cue.carId });
  }
  return out;
}

describe('V2: a buzina', () => {
  it('a borda de subida gera uma buzinada, com o carro certo; segurar não repete', () => {
    const state = twoHumans();
    const plan = [[silent, silent], [honk, silent], [honk, silent], [honk, silent], [silent, silent]] as Array<[PlayerInput, PlayerInput]>;
    const cues = drive(state, createVoiceMemory(), plan);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ type: 'horn', seat: 0, carId: 'trovao' });
  });

  it('cada assento buzina com o carro dele, no mesmo tick', () => {
    const state = twoHumans();
    const cues = drive(state, createVoiceMemory(), [[honk, honk]]);
    expect(cues.map((c) => [c.seat, c.carId])).toEqual([[0, 'trovao'], [1, 'tornado']]);
  });

  it('soltar e apertar de novo antes de HORN_MIN_GAP_TICKS não buzina; depois, sim', () => {
    const state = twoHumans();
    const mem = createVoiceMemory();
    const plan: Array<[PlayerInput, PlayerInput]> = [[honk, silent], [silent, silent], [honk, silent]]; // 2 ticks depois
    expect(drive(state, mem, plan)).toHaveLength(1);
    const wait: Array<[PlayerInput, PlayerInput]> = Array.from({ length: HORN_MIN_GAP_TICKS }, () => [silent, silent]);
    drive(state, mem, wait);
    expect(drive(state, mem, [[honk, silent]])).toHaveLength(1);
  });

  it('o intervalo é exato: a buzinada no tick HORN_MIN_GAP_TICKS depois da anterior passa, a um tick antes não', () => {
    const run = (gap: number) => {
      const state = twoHumans();
      const mem = createVoiceMemory();
      const plan: Array<[PlayerInput, PlayerInput]> = [[honk, silent]];
      for (let i = 1; i < gap; i++) plan.push([silent, silent]);
      plan.push([honk, silent]);
      return drive(state, mem, plan).length;
    };
    expect(run(HORN_MIN_GAP_TICKS - 1)).toBe(1);
    expect(run(HORN_MIN_GAP_TICKS)).toBe(2);
  });

  it('assento sem entrada (tomado pela IA) e entrada neutra não emitem nada', () => {
    const state = twoHumans();
    expect(drive(state, createVoiceMemory(), [[undefined, undefined], [silent, silent]])).toEqual([]);
  });
});

describe('V3: a frase de provocação', () => {
  it('um índice de 0 a 7 gera um cue com o índice; o texto sai no idioma atual', () => {
    for (let i = 0; i < TAUNT_COUNT; i++) {
      const state = twoHumans();
      const cues = drive(state, createVoiceMemory(), [[say(i), silent]]);
      expect(cues, `frase ${i}`).toEqual([{ tick: state.tick, type: 'taunt', seat: 0, index: i, carId: 'trovao' }]);
    }
  });

  it('índice fora de 0..7, não inteiro ou NaN não gera nada', () => {
    for (const bad of [-1, 8, 99, 1.5, Number.NaN, Infinity]) {
      const state = twoHumans();
      expect(drive(state, createVoiceMemory(), [[say(bad), silent]]), String(bad)).toEqual([]);
    }
  });

  it('1 frase a cada 5 s por jogador: a do tick 299 depois da anterior é descartada, a do 300 passa; os assentos são independentes', () => {
    expect(TAUNT_MIN_GAP_TICKS).toBe(5 * TICK_RATE);
    const run = (gap: number, otherSeat: boolean) => {
      const state = twoHumans();
      const mem = createVoiceMemory();
      const plan: Array<[PlayerInput | undefined, PlayerInput | undefined]> = [[say(1), silent]];
      for (let i = 1; i < gap; i++) plan.push([silent, silent]);
      plan.push([say(2), otherSeat ? say(3) : silent]);
      return drive(state, mem, plan);
    };
    expect(run(TAUNT_MIN_GAP_TICKS - 1, false).filter((c) => c.type === 'taunt').map((c) => c.index)).toEqual([1]);
    expect(run(TAUNT_MIN_GAP_TICKS, false).filter((c) => c.type === 'taunt').map((c) => c.index)).toEqual([1, 2]);
    // O assento 1 fala no mesmo tick em que o 0 foi barrado: o limite é de cada jogador.
    const both = run(TAUNT_MIN_GAP_TICKS - 1, true).filter((c) => c.type === 'taunt');
    expect(both.map((c) => [c.seat, c.index])).toEqual([[0, 1], [1, 3]]);
  });

  it('a espera que falta para a próxima frase é conhecida (a roda mostra "aguarde")', () => {
    const state = twoHumans();
    const mem = createVoiceMemory();
    expect(tauntCooldownTicks(mem, 0, state.tick)).toBe(0);
    drive(state, mem, [[say(1), silent]]);
    expect(tauntCooldownTicks(mem, 0, state.tick)).toBe(TAUNT_MIN_GAP_TICKS);
    expect(tauntCooldownTicks(mem, 0, state.tick + 100)).toBe(TAUNT_MIN_GAP_TICKS - 100);
    expect(tauntCooldownTicks(mem, 0, state.tick + TAUNT_MIN_GAP_TICKS)).toBe(0);
    expect(tauntCooldownTicks(mem, 1, state.tick)).toBe(0);
  });
});

describe('V4: corrida nova', () => {
  it('um tick menor que o último zera a memória: o limite da corrida anterior não vale na seguinte', () => {
    const state = twoHumans();
    const mem = createVoiceMemory();
    expect(drive(state, mem, [[say(1), silent]])).toHaveLength(1);
    const next = twoHumans(); // outra corrida: o tick recomeça
    next.tick = 5;
    expect(drive(next, mem, [[say(2), silent]])).toHaveLength(1);
  });
});

// ───────────────────────────── V5: a roda ─────────────────────────────

/** Um quadro da roda. */
function frameOf(w: WheelState, input: { horn: boolean; gearUp?: boolean; gearDown?: boolean }, can = true, dt = DT) {
  return stepWheel(w, { horn: input.horn, gearUp: input.gearUp === true, gearDown: input.gearDown === true }, dt, can);
}
/** Segura a buzina por `seconds`. */
function holdFor(w: WheelState, seconds: number): void {
  for (let t0 = 0; t0 < seconds - 1e-9; t0 += DT) frameOf(w, { horn: true });
}

describe('V5: a roda de frases', () => {
  it('abre só depois de WHEEL_OPEN_SECONDS segurado, sem nenhuma frase marcada', () => {
    const w = newWheel();
    holdFor(w, WHEEL_OPEN_SECONDS - 0.05);
    expect(w.open).toBe(false);
    holdFor(w, 0.1);
    expect(w.open).toBe(true);
    expect(w.selected).toBe(-1);
  });

  it('marcha acima/abaixo giram a marcação (com volta ao fim e ao começo) e só com a roda aberta as marchas são consumidas', () => {
    const w = newWheel();
    // Antes de abrir, a marcha passa para a física.
    expect(frameOf(w, { horn: true, gearUp: true }).consumeGears).toBe(false);
    expect(w.selected).toBe(-1);
    holdFor(w, WHEEL_OPEN_SECONDS);
    expect(w.open).toBe(true);
    const seen: number[] = [];
    for (let i = 0; i < TAUNT_COUNT + 1; i++) { expect(frameOf(w, { horn: true, gearUp: true }).consumeGears).toBe(true); seen.push(w.selected); }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0]);
    frameOf(w, { horn: true, gearDown: true });
    expect(w.selected).toBe(7); // de 0 para trás: volta ao fim
    frameOf(w, { horn: true, gearDown: true });
    expect(w.selected).toBe(6);
    // Quadro sem marcha: a marcação fica, e as marchas seguem consumidas enquanto a roda está aberta.
    expect(frameOf(w, { horn: true }).consumeGears).toBe(true);
    expect(w.selected).toBe(6);
  });

  it('de nenhuma marcada, marcha abaixo vai para a última frase', () => {
    const w = newWheel();
    holdFor(w, WHEEL_OPEN_SECONDS);
    frameOf(w, { horn: true, gearDown: true });
    expect(w.selected).toBe(TAUNT_COUNT - 1);
  });

  it('soltar com uma frase marcada a envia, uma vez só; a roda fecha', () => {
    const w = newWheel();
    holdFor(w, WHEEL_OPEN_SECONDS);
    frameOf(w, { horn: true, gearUp: true });
    frameOf(w, { horn: true, gearUp: true });
    expect(w.selected).toBe(1);
    expect(frameOf(w, { horn: false }).taunt).toBe(1);
    expect(w.open).toBe(false);
    expect(w.selected).toBe(-1);
    expect(frameOf(w, { horn: false }).taunt).toBeNull();
  });

  it('soltar sem marcar nada cancela; soltar antes de abrir é só uma buzinada', () => {
    const w = newWheel();
    holdFor(w, WHEEL_OPEN_SECONDS);
    expect(frameOf(w, { horn: false }).taunt).toBeNull();
    const v = newWheel();
    holdFor(v, 0.1);
    frameOf(v, { horn: true, gearUp: true });
    expect(frameOf(v, { horn: false }).taunt).toBeNull();
    expect(v.open).toBe(false);
  });

  it('no intervalo de 5 s a roda abre e gira, mas soltar não envia nada', () => {
    const w = newWheel();
    holdFor(w, WHEEL_OPEN_SECONDS);
    frameOf(w, { horn: true, gearUp: true }, false);
    expect(w.selected).toBe(0);
    expect(frameOf(w, { horn: false }, false).taunt).toBeNull();
  });

  it('apertar de novo começa do zero (a contagem dos 0,35 s não vaza entre aperto e aperto)', () => {
    const w = newWheel();
    holdFor(w, 0.2);
    frameOf(w, { horn: false });
    holdFor(w, 0.2);
    expect(w.open).toBe(false);
  });

  it('dt absurdo (quadro travado) não abre a roda sozinho nem passa de NaN', () => {
    const w = newWheel();
    stepWheel(w, { horn: false, gearUp: false, gearDown: false }, 5, true);
    expect(w.open).toBe(false);
    stepWheel(w, { horn: true, gearUp: false, gearDown: false }, Number.NaN, true);
    expect(w.open).toBe(false);
    expect(Number.isFinite(w.held)).toBe(true);
  });
});

// ───────────────────────────── V6: as frases ─────────────────────────────

/** Termos que não podem aparecer numa frase (decisão nº 24: brincadeira, sem palavrão nem xingamento de verdade). */
const BANNED = [
  'porra', 'merda', 'caralho', 'puta', 'foda', 'fode', 'buceta', 'cacete', 'bosta', 'cu', 'viado', 'arrombado', 'otario', 'otário', 'idiota',
  'imbecil', 'babaca', 'burro', 'lixo', 'inutil', 'inútil', 'desgraca', 'desgraça', 'filho da',
  'fuck', 'shit', 'bitch', 'ass', 'damn', 'crap', 'idiot', 'stupid', 'dumb', 'loser', 'suck', 'bastard', 'dick', 'hell', 'trash',
];

describe('V6: as 8 frases de brincadeira', () => {
  beforeEach(() => setLanguage('pt'));

  it('são 8, com chave própria, e existem em PT e EN, distintas entre si', () => {
    expect(TAUNT_COUNT).toBe(8);
    expect(TAUNT_KEYS).toHaveLength(8);
    for (const lang of ['pt', 'en'] as const) {
      setLanguage(lang);
      const texts = TAUNT_KEYS.map((k) => t(k));
      for (let i = 0; i < 8; i++) { expect(texts[i], `${lang} ${i}`).not.toBe(TAUNT_KEYS[i]); expect(tauntText(i)).toBe(texts[i]); }
      expect(new Set(texts).size, lang).toBe(8);
    }
    setLanguage('pt');
  });

  it('cabem no balão (até 24 caracteres) e nenhuma tem palavrão nem xingamento', () => {
    for (const lang of ['pt', 'en'] as const) {
      setLanguage(lang);
      for (let i = 0; i < 8; i++) {
        const text = tauntText(i);
        expect(text.length, `${lang} ${i}: ${text}`).toBeLessThanOrEqual(24);
        expect(text.length).toBeGreaterThan(3);
        const words = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/).filter(Boolean);
        const joined = ` ${words.join(' ')} `;
        for (const bad of BANNED) {
          const plain = bad.normalize('NFD').replace(/[̀-ͯ]/g, '');
          expect(joined.includes(` ${plain} `), `${lang} "${text}" tem "${bad}"`).toBe(false);
        }
      }
    }
    setLanguage('pt');
  });

  it('as 4 do pedido do dono estão lá, em PT', () => {
    setLanguage('pt');
    const all = Array.from({ length: 8 }, (_, i) => tauntText(i));
    for (const want of ['Come poeira!', 'Tchau, tartaruga!', 'Segura essa!', 'Tá devagar, hein?', 'Boa tentativa!']) expect(all).toContain(want);
  });

  it('o texto de um índice inválido não quebra', () => {
    expect(tauntText(-1)).toBe('');
    expect(tauntText(8)).toBe('');
    expect(tauntText(Number.NaN)).toBe('');
  });
});

// ───────────────────────────── V8: quem escuta o quê ─────────────────────────────

describe('V8: o que cada computador apresenta', () => {
  it('o jogador local sempre se ouve; o de outro computador soa mais baixo e some se estiver silenciado', () => {
    const muted = (n: string) => n === 'Chato';
    expect(audibleFor(true, 'Chato', muted)).toBe(true); // ninguém se silencia a si mesmo
    expect(audibleFor(false, 'Ana', muted)).toBe(true);
    expect(audibleFor(false, 'Chato', muted)).toBe(false);
    expect(hornGain(true)).toBe(1);
    expect(hornGain(false)).toBe(HORN_REMOTE_GAIN);
    expect(HORN_REMOTE_GAIN).toBeGreaterThan(0);
    expect(HORN_REMOTE_GAIN).toBeLessThan(1);
  });
});

// ───────────────────────────── V7: silenciar por jogador ─────────────────────────────

describe('V7: silenciar por jogador (preferência local)', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); },
    });
    // A memória da sessão (storage.ts) vale mais que o localStorage: zera o que um teste anterior possa ter deixado.
    writeJson(MUTED_KEY, []);
    store.clear();
  });

  it('começa sem ninguém silenciado; silenciar e ouvir de novo por nome, sem diferenciar caixa nem espaços', () => {
    expect(mutedNames()).toEqual([]);
    expect(isMuted('Ana')).toBe(false);
    expect(setMuted('  Ana ', true)).toBe(true);
    expect(isMuted('ana')).toBe(true);
    expect(isMuted('ANA')).toBe(true);
    expect(isMuted('Bia')).toBe(false);
    expect(setMuted('ANA', false)).toBe(false);
    expect(isMuted('Ana')).toBe(false);
    expect(mutedNames()).toEqual([]);
  });

  it('toggleMuted alterna e devolve o estado novo; a preferência persiste no armazenamento', () => {
    expect(toggleMuted('Caio')).toBe(true);
    expect(toggleMuted('Caio')).toBe(false);
    expect(toggleMuted('Caio')).toBe(true);
    expect(JSON.parse(store.get(MUTED_KEY) ?? 'null')).toEqual(['caio']);
  });

  it('lixo no armazenamento vira lista vazia; nome vazio nunca é silenciado; o teto é de 64 nomes', () => {
    writeJson(MUTED_KEY, 'lixo');
    expect(mutedNames()).toEqual([]);
    writeJson(MUTED_KEY, [1, null, { a: 1 }, 'Dedé', 'dedé', '']);
    expect(mutedNames()).toEqual(['dedé']);
    expect(setMuted('   ', true)).toBe(false);
    expect(isMuted('')).toBe(false);
    writeJson(MUTED_KEY, []);
    for (let i = 0; i < 70; i++) setMuted(`jogador${i}`, true);
    expect(mutedNames()).toHaveLength(64);
    expect(isMuted('jogador69')).toBe(true); // os mais novos ficam; os mais velhos saem
    expect(isMuted('jogador0')).toBe(false);
  });
});
